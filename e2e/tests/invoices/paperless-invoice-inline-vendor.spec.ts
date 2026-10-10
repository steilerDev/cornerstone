/**
 * E2E tests for inline vendor creation on the Paperless-first invoice review page (#2148).
 *
 * The vendor SearchPicker offers an "Add new vendor" row; activating it opens the shared
 * VendorCreateModal (prefilled from the LLM-extracted issuer name, or the typed query).
 * On success the new vendor is selected, focus moves to the picker's clear button, and a
 * polite status announcement is made.
 *
 * Paperless, config, preview and commit are mocked via page.route() (no LLM/Paperless
 * container). POST /api/vendors is REAL unless a scenario explicitly intercepts it.
 *
 * Scenarios (all run on desktop/tablet/mobile projects):
 *   1. @smoke Prefilled create -> select -> commit carries the new vendorId
 *   2. Typed-query fallback, keyboard activation, Tab focus trap in modal
 *   3. Cancel paths (button / Escape / backdrop) restore picker focus, create nothing
 *   4. Existing form state (invoice number, notes, line include) survives; no re-extraction
 *   5. Real server validation error keeps the modal open and the input intact
 *   6. Server 500 then retry; submit disabled while the request is in flight
 *   7. Responsive: modal never overflows horizontally; mobile stacks phone/email
 *   8. Dark mode: create row and modal render and are readable
 *
 * Scenario 9 (regression) is covered by the unchanged exact-match setVendor() users in
 * paperless-first-invoice.spec.ts and friends.
 */

import { test, expect } from '../../fixtures/auth.js';
import { InvoicesPage } from '../../pages/InvoicesPage.js';
import { PaperlessInvoiceReviewPage } from '../../pages/PaperlessInvoiceReviewPage.js';
import { API } from '../../fixtures/testData.js';
import {
  MOCK_DOC,
  MOCK_EXTRACTED_LINES,
  mockCommitCapturing,
  mockConfig,
  mockCorrespondents,
  mockDocumentDetail,
  mockDocuments,
  mockLinkedIds,
  mockPaperlessConfigured,
  mockPreview,
  mockTags,
} from '../../fixtures/paperlessInvoiceMocks.js';
import type { CapturedCommit, MockPreviewHandle } from '../../fixtures/paperlessInvoiceMocks.js';
import type { Page, Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Record every vendor created via POST /api/vendors on this page so the test can delete
 * them in `finally`. Returns an accessor that resolves the created vendor ids.
 */
function trackCreatedVendors(page: Page): () => Promise<string[]> {
  const pending: Array<Promise<string | null>> = [];
  page.on('response', (resp) => {
    const req = resp.request();
    if (req.method() !== 'POST' || new URL(resp.url()).pathname !== '/api/vendors') return;
    if (resp.status() !== 201) return;
    pending.push(
      resp
        .json()
        .then((b: { vendor: { id: string } }) => b.vendor.id)
        .catch(() => null),
    );
  });
  return async () => (await Promise.all(pending)).filter((id): id is string => id !== null);
}

async function cleanupVendors(page: Page, getIds: () => Promise<string[]>): Promise<void> {
  for (const id of await getIds()) {
    await page.request.delete(`${API.vendors}/${id}`);
  }
}

/** Count POST /api/vendors requests issued by the page. */
function countVendorPosts(page: Page): () => number {
  let count = 0;
  page.on('request', (req) => {
    if (req.method() === 'POST' && new URL(req.url()).pathname === '/api/vendors') count += 1;
  });
  return () => count;
}

interface ReviewContext {
  reviewPage: PaperlessInvoiceReviewPage;
  preview: MockPreviewHandle;
  commits: CapturedCommit;
}

/**
 * Register all mocks and navigate picker -> review page.
 * Lines get a real budget category so the confirm flow can reach the commit call.
 */
async function openReviewPage(
  page: Page,
  opts: { extractedVendorName?: string } = {},
): Promise<ReviewContext> {
  const catResp = await page.request.get(API.budgetCategories);
  expect(catResp.ok(), `GET budget-categories failed: ${catResp.status()}`).toBeTruthy();
  const cats = (await catResp.json()) as { categories: Array<{ id: string }> };
  const categoryId = cats.categories[0]?.id;
  expect(categoryId, 'Expected at least one budget category').toBeTruthy();
  const lines = MOCK_EXTRACTED_LINES.map((l) => ({ ...l, budgetCategoryId: categoryId }));

  await mockPaperlessConfigured(page);
  await mockConfig(page, true);
  await mockCorrespondents(page);
  await mockDocuments(page);
  await mockTags(page);
  await mockLinkedIds(page);
  await mockDocumentDetail(page);
  const preview = await mockPreview(page, {
    suggestedVendorId: null,
    extractedVendorName: opts.extractedVendorName,
    lines,
  });
  const commits = await mockCommitCapturing(page);

  const invoicesPage = new InvoicesPage(page);
  await invoicesPage.goto();
  await invoicesPage.waitForLoaded();
  await invoicesPage.clickNewInvoice();
  const pickerModal = await invoicesPage.waitForPickerModal();
  await pickerModal.selectDocument(MOCK_DOC.title);
  await page.waitForURL(/\/budget\/invoices\/new\/paperless\?documentId=\d+$/);

  const reviewPage = new PaperlessInvoiceReviewPage(page);
  await reviewPage.waitForExtractionComplete();
  return { reviewPage, preview, commits };
}

function waitForVendorCreated(page: Page) {
  return page.waitForResponse(
    (r) =>
      r.request().method() === 'POST' &&
      new URL(r.url()).pathname === '/api/vendors' &&
      r.status() === 201,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1 — @smoke
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Scenario 1 — Prefilled inline vendor create', { tag: '@smoke' }, () => {
  test('Create row opens modal prefilled with the extracted name; created vendor is selected and committed', async ({
    page,
    testPrefix,
  }) => {
    test.slow();
    const getIds = trackCreatedVendors(page);
    const vendorName = `${testPrefix} Neue Firma`;

    try {
      const { reviewPage, commits } = await openReviewPage(page, {
        extractedVendorName: vendorName,
      });

      await reviewPage.vendorInput.focus();
      await expect(reviewPage.vendorPortalDropdown).toBeVisible();
      await expect(reviewPage.vendorCreateOption).toBeVisible();
      await reviewPage.vendorCreateOption.click();

      await expect(reviewPage.vendorCreateModal).toBeVisible();
      await expect(reviewPage.vendorCreateNameInput).toHaveValue(vendorName);
      await expect(reviewPage.vendorCreateNameInput).toBeFocused();

      const createdPromise = waitForVendorCreated(page);
      await reviewPage.vendorCreateSubmit.click();
      const created = (await (await createdPromise).json()) as { vendor: { id: string } };

      await expect(reviewPage.vendorCreateModal).not.toBeVisible();
      await expect(reviewPage.vendorSelectedDisplay).toContainText(vendorName);
      await expect(reviewPage.vendorClearButton).toBeFocused();
      await expect(reviewPage.statusRegion).toContainText('created and selected');
      await expect(reviewPage.statusRegion).toContainText(vendorName);

      await reviewPage.confirm();
      await expect.poll(() => commits.bodies.length).toBe(1);
      expect(commits.bodies[0]!.vendorId).toBe(created.vendor.id);
    } finally {
      await cleanupVendors(page, getIds);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2 — query fallback + keyboard
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Scenario 2 — Typed query fallback, keyboard only', () => {
  test('Typed query with no match offers a named create row; Enter opens a prefilled modal with a Tab focus trap', async ({
    page,
    testPrefix,
  }) => {
    const getIds = trackCreatedVendors(page);
    const typed = `${testPrefix} Typed Co`;

    try {
      const { reviewPage } = await openReviewPage(page);

      await reviewPage.vendorInput.fill(typed);
      await expect(reviewPage.vendorPortalDropdown).toBeVisible();
      await expect(
        reviewPage.vendorPortalDropdown.getByText('No matching items found'),
      ).toBeVisible();
      await expect(
        reviewPage.vendorPortalDropdown.getByRole('option', {
          name: `Add new vendor "${typed}"`,
          exact: true,
        }),
      ).toBeVisible();

      // ArrowUp from the input moves focus to the last option (the create row).
      await page.keyboard.press('ArrowUp');
      await expect(reviewPage.vendorCreateOption).toBeFocused();
      await page.keyboard.press('Enter');

      await expect(reviewPage.vendorCreateModal).toBeVisible();
      await expect(reviewPage.vendorCreateNameInput).toHaveValue(typed);
      await expect(reviewPage.vendorCreateNameInput).toBeFocused();

      // Focus trap: tabbing repeatedly never leaves the modal.
      for (let i = 0; i < 12; i += 1) {
        await page.keyboard.press('Tab');
        const inside = await page.evaluate(() => {
          const dialog = document.querySelector('[role="dialog"][aria-modal="true"]');
          return !!dialog && dialog.contains(document.activeElement);
        });
        expect(inside, `focus escaped the modal after ${i + 1} Tab presses`).toBe(true);
      }
      // Shift+Tab from the first field also stays inside.
      await reviewPage.vendorCreateNameInput.focus();
      await page.keyboard.press('Shift+Tab');
      const insideBack = await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"][aria-modal="true"]');
        return !!dialog && dialog.contains(document.activeElement);
      });
      expect(insideBack).toBe(true);
    } finally {
      await cleanupVendors(page, getIds);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3 — cancel paths
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Scenario 3 — Cancel paths', () => {
  for (const via of ['Cancel button', 'Escape', 'backdrop'] as const) {
    test(`Closing via ${via} creates nothing and returns focus to the vendor picker`, async ({
      page,
      testPrefix,
    }) => {
      const getIds = trackCreatedVendors(page);
      const postCount = countVendorPosts(page);

      try {
        const { reviewPage } = await openReviewPage(page, {
          extractedVendorName: `${testPrefix} Cancel Co`,
        });
        await reviewPage.openCreateVendor();

        if (via === 'Cancel button') {
          await reviewPage.vendorCreateCancel.click();
        } else if (via === 'Escape') {
          await page.keyboard.press('Escape');
        } else {
          await page.locator('[class*="modalBackdrop"]').click({ position: { x: 2, y: 2 } });
        }

        await expect(reviewPage.vendorCreateModal).not.toBeVisible();
        await expect(reviewPage.vendorInput).toBeFocused();
        await expect(reviewPage.vendorPortalDropdown).not.toBeVisible();
        await expect(reviewPage.vendorSelectedDisplay).toHaveCount(0);
        expect(postCount()).toBe(0);
      } finally {
        await cleanupVendors(page, getIds);
      }
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4 — state preserved
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Scenario 4 — Existing form state is preserved', () => {
  test('Invoice number, notes and line include state survive vendor creation; no re-extraction', async ({
    page,
    testPrefix,
  }) => {
    const getIds = trackCreatedVendors(page);

    try {
      const { reviewPage, preview } = await openReviewPage(page, {
        extractedVendorName: `${testPrefix} Keep State Co`,
      });

      await reviewPage.invoiceNumberInput.fill(`${testPrefix}-INV-42`);
      await reviewPage.notesInput.fill(`${testPrefix} custom notes`);
      const includeBoxes = reviewPage.lineItemsList.getByRole('checkbox', {
        name: 'Include',
        exact: true,
      });
      await includeBoxes.first().uncheck();

      await reviewPage.openCreateVendor();
      const createdPromise = waitForVendorCreated(page);
      await reviewPage.vendorCreateSubmit.click();
      await createdPromise;
      await expect(reviewPage.vendorSelectedDisplay).toContainText('Keep State Co');

      await expect(reviewPage.invoiceNumberInput).toHaveValue(`${testPrefix}-INV-42`);
      await expect(reviewPage.notesInput).toHaveValue(`${testPrefix} custom notes`);
      await expect(includeBoxes.first()).not.toBeChecked();
      await expect(includeBoxes.nth(1)).toBeChecked();
      expect(preview.callCount()).toBe(1);
    } finally {
      await cleanupVendors(page, getIds);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5 — real server validation error
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Scenario 5 — Server validation error', () => {
  test('Invalid email returns a real 400: banner shown, modal stays open, input kept; fixing it succeeds', async ({
    page,
    testPrefix,
  }) => {
    const getIds = trackCreatedVendors(page);
    const name = `${testPrefix} Validation Co`;

    try {
      const { reviewPage } = await openReviewPage(page, { extractedVendorName: name });
      await reviewPage.openCreateVendor();
      await reviewPage.vendorCreateEmailInput.fill('not-an-email');

      const badResponse = page.waitForResponse(
        (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/vendors',
      );
      await reviewPage.vendorCreateSubmit.click();
      expect((await badResponse).status()).toBe(400);

      await expect(reviewPage.vendorCreateErrorBanner.first()).toBeVisible();
      await expect(reviewPage.vendorCreateModal).toBeVisible();
      await expect(reviewPage.vendorCreateNameInput).toHaveValue(name);
      await expect(reviewPage.vendorCreateEmailInput).toHaveValue('not-an-email');

      await reviewPage.vendorCreateEmailInput.fill(`${testPrefix.toLowerCase()}@example.com`);
      const okPromise = waitForVendorCreated(page);
      await reviewPage.vendorCreateSubmit.click();
      await okPromise;

      await expect(reviewPage.vendorCreateModal).not.toBeVisible();
      await expect(reviewPage.vendorSelectedDisplay).toContainText(name);
    } finally {
      await cleanupVendors(page, getIds);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6 — server error then retry; in-flight disabled state
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Scenario 6 — Server error, retry and in-flight state', () => {
  test('A 500 shows the banner and keeps input; retry succeeds; submit is disabled while in flight', async ({
    page,
    testPrefix,
  }) => {
    const getIds = trackCreatedVendors(page);
    const name = `${testPrefix} Retry Co`;
    const isVendorPost = (route: Route) =>
      route.request().method() === 'POST' &&
      new URL(route.request().url()).pathname === '/api/vendors';

    try {
      const { reviewPage } = await openReviewPage(page, { extractedVendorName: name });
      await reviewPage.openCreateVendor();

      // First attempt: 500
      const failOnce = async (route: Route) => {
        if (!isVendorPost(route)) {
          await route.fallback();
          return;
        }
        await page.unroute('**/api/vendors', failOnce);
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            error: { code: 'INTERNAL_ERROR', message: 'boom', details: {} },
          }),
        });
      };
      await page.route('**/api/vendors', failOnce);

      await reviewPage.vendorCreateSubmit.click();
      await expect(reviewPage.vendorCreateErrorBanner.first()).toBeVisible();
      await expect(reviewPage.vendorCreateModal).toBeVisible();
      await expect(reviewPage.vendorCreateNameInput).toHaveValue(name);
      await expect(reviewPage.vendorCreateSubmit).toBeEnabled();

      // Retry: hold the real request until the in-flight state has been asserted
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const holdOnce = async (route: Route) => {
        if (!isVendorPost(route)) {
          await route.fallback();
          return;
        }
        await page.unroute('**/api/vendors', holdOnce);
        await gate;
        await route.continue();
      };
      await page.route('**/api/vendors', holdOnce);

      const okPromise = waitForVendorCreated(page);
      await reviewPage.vendorCreateSubmit.click();
      await expect(reviewPage.vendorCreateSubmit).toBeDisabled();
      await expect(reviewPage.vendorCreateSubmit).toHaveText('Adding...');
      await expect(reviewPage.vendorCreateCancel).toBeDisabled();
      release();
      await okPromise;

      await expect(reviewPage.vendorCreateModal).not.toBeVisible();
      await expect(reviewPage.vendorSelectedDisplay).toContainText(name);
    } finally {
      await cleanupVendors(page, getIds);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 7 — responsive
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Scenario 7 — Responsive modal', { tag: '@responsive' }, () => {
  test('Modal has no horizontal overflow; phone/email stack on mobile', async ({
    page,
    testPrefix,
  }) => {
    const getIds = trackCreatedVendors(page);

    try {
      const { reviewPage } = await openReviewPage(page, {
        extractedVendorName: `${testPrefix} Responsive Co`,
      });
      await reviewPage.openCreateVendor();

      const overflow = await reviewPage.vendorCreateModal.evaluate((el) => ({
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      }));
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);

      const pageOverflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(pageOverflow.scrollWidth).toBeLessThanOrEqual(pageOverflow.clientWidth);

      const viewport = page.viewportSize();
      if (viewport && viewport.width < 600) {
        const phone = await reviewPage.vendorCreatePhoneInput.boundingBox();
        const email = await reviewPage.vendorCreateEmailInput.boundingBox();
        expect(phone).not.toBeNull();
        expect(email).not.toBeNull();
        expect(email!.y).toBeGreaterThan(phone!.y);
      }
    } finally {
      await cleanupVendors(page, getIds);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 8 — dark mode
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Scenario 8 — Dark mode', { tag: '@responsive' }, () => {
  test('Create row and modal render and the row label is readable in dark mode', async ({
    page,
    testPrefix,
  }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    const getIds = trackCreatedVendors(page);

    try {
      const { reviewPage } = await openReviewPage(page, {
        extractedVendorName: `${testPrefix} Dark Co`,
      });

      await reviewPage.vendorInput.focus();
      await expect(reviewPage.vendorCreateOption).toBeVisible();
      const contrast = await reviewPage.vendorCreateOption.evaluate((el) => {
        const label = el.querySelector('[class*="createOptionLabel"]') ?? el;
        return {
          color: getComputedStyle(label).color,
          background: getComputedStyle(el).backgroundColor,
        };
      });
      expect(contrast.color).not.toBe(contrast.background);

      await reviewPage.vendorCreateOption.click();
      await expect(reviewPage.vendorCreateModal).toBeVisible();
      await expect(reviewPage.vendorCreateNameInput).toBeVisible();
      await expect(reviewPage.vendorCreateSubmit).toBeVisible();
    } finally {
      await cleanupVendors(page, getIds);
    }
  });
});
