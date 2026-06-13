/**
 * E2E tests for Story #1551: Discretionary funding note on AutoItemizePage.
 *
 * Story #1551 added a discretionary note to AutoItemizePage:
 *   A <p role="note" class*="discretionaryNote"> rendered above the line-item cards
 *   when ≥1 extracted line's budgetSourceId equals the system discretionary source id.
 *   The note is sourced from picker.pickerState.budgetSources (fetched from
 *   GET /api/budget-sources on mount). The discretionary source is identified by
 *   isDiscretionary=true.
 *
 * Scenarios:
 *   1. [smoke] AutoItemizePage shows the discretionary note when ≥1 line uses the discretionary source.
 *   2. AutoItemizePage does NOT show the note when lines use a non-discretionary source.
 *   2b. AutoItemizePage does NOT show the note when lines have null budgetSourceId.
 *
 * Note: Story #1551 also added an "Auto-itemized" badge to the Budget Overview
 * (CostBreakdownTable). That badge was removed in PR #1655 (Issue #1615) because it could
 * never render in practice. Scenarios 3 & 4 (badge tests) were deleted at that time.
 *
 * Mocking strategy:
 *   - GET /api/budget-sources: intercepted to return a minimal source list including the
 *     system discretionary source (id='discretionary-system', isDiscretionary=true) and
 *     one non-discretionary source.
 *   - POST /api/invoices/:id/auto-itemize: intercepted for the dry-run call that AutoItemizePage
 *     fires on mount (dryRun=true).
 *   - GET /api/paperless/documents/:docId: intercepted to return a mock document (prevents
 *     real Paperless requests when no Paperless server is running in the E2E environment).
 *   - GET /api/config: intercepted to inject autoItemizeEnabled: true.
 */

import { test, expect } from '../../fixtures/auth.js';
import { AutoItemizePage } from '../../pages/AutoItemizePage.js';
import { API } from '../../fixtures/testData.js';
import type { Page, Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Inline REST helpers
// ─────────────────────────────────────────────────────────────────────────────

async function createVendorViaApi(page: Page, name: string): Promise<string> {
  const resp = await page.request.post(API.vendors, { data: { name } });
  expect(resp.ok(), `POST vendor "${name}" failed: ${resp.status()}`).toBeTruthy();
  const body = (await resp.json()) as { vendor: { id: string } };
  return body.vendor.id;
}

async function deleteVendorViaApi(page: Page, id: string): Promise<void> {
  await page.request.delete(`${API.vendors}/${id}`);
}

async function createInvoiceViaApi(
  page: Page,
  vendorId: string,
  data: { amount: number; date: string; invoiceNumber?: string },
): Promise<string> {
  const resp = await page.request.post(`${API.vendors}/${vendorId}/invoices`, {
    data: { status: 'pending', ...data },
  });
  expect(resp.ok(), `POST invoice failed: ${resp.status()}`).toBeTruthy();
  const body = (await resp.json()) as { invoice: { id: string } };
  return body.invoice.id;
}

async function deleteInvoiceViaApi(page: Page, vendorId: string, invoiceId: string): Promise<void> {
  await page.request.delete(`${API.vendors}/${vendorId}/invoices/${invoiceId}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock helpers (Scenarios 1 & 2 only)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The well-known system discretionary budget source id, seeded by migration 0021.
 * The AutoItemizePage uses this id to identify which source is discretionary.
 */
const DISCRETIONARY_SOURCE_ID = 'discretionary-system';

/**
 * A fake non-discretionary source id used in Scenario 2.
 */
const NON_DISCRETIONARY_SOURCE_ID = 'disc-test-non-disc-001';

/**
 * Mock GET /api/budget-sources to return a list with the system discretionary source
 * and one non-discretionary source. The picker hook (useBudgetLinePicker) calls this
 * via initializeStaticData() on AutoItemizePage mount.
 */
async function mockBudgetSources(page: Page): Promise<void> {
  await page.route('**/api/budget-sources', async (route: Route) => {
    // Only intercept GET requests (not POST/PATCH/DELETE)
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    // Skip sub-resource paths like /api/budget-sources/:id/budget-lines
    if (
      route
        .request()
        .url()
        .match(/\/budget-sources\/[^?/]+\//) !== null
    ) {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        budgetSources: [
          {
            id: DISCRETIONARY_SOURCE_ID,
            name: 'Discretionary',
            type: 'discretionary',
            totalAmount: 0,
            isDiscretionary: true,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
          {
            id: NON_DISCRETIONARY_SOURCE_ID,
            name: 'My Savings',
            type: 'savings',
            totalAmount: 50000,
            isDiscretionary: false,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      }),
    });
  });
}

/**
 * Mock GET /api/config to inject autoItemizeEnabled: true (preserving currency from real response).
 */
async function mockConfigEnabled(page: Page): Promise<void> {
  await page.route('**/api/config', async (route: Route) => {
    try {
      const realResp = await route.fetch();
      const realBody = (await realResp.json()) as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...realBody, autoItemizeEnabled: true }),
      });
    } catch {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ currency: 'EUR', autoItemizeEnabled: true }),
      });
    }
  });
}

/**
 * Mock GET /paperless/documents/:docId to return a stub document.
 * AutoItemizePage calls getPaperlessDocument(docId) on mount to get the document title.
 * This prevents network errors when no real Paperless server is running.
 */
async function mockPaperlessDocument(page: Page, docId: number): Promise<void> {
  await page.route(`**/paperless/documents/${docId}`, async (route: Route) => {
    // Only intercept the exact document endpoint, not /thumb or /preview
    if (
      route.request().method() !== 'GET' ||
      route.request().url().includes('/thumb') ||
      route.request().url().includes('/preview')
    ) {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        document: {
          id: docId,
          title: `Mock Invoice ${docId}`,
          content: 'Sample OCR content for E2E testing',
          tags: [],
          created: '2026-01-01',
          added: '2026-01-01T00:00:00.000Z',
          modified: '2026-01-01T00:00:00.000Z',
          correspondent: 'Test Vendor GmbH',
          documentType: null,
          archiveSerialNumber: null,
          originalFileName: `invoice-${docId}.pdf`,
        },
      }),
    });
  });
}

/**
 * Mock the dry-run auto-itemize response for AutoItemizePage (which fires on mount).
 *
 * @param budgetSourceId - the budgetSourceId to set on each extracted line. Pass
 *   DISCRETIONARY_SOURCE_ID to trigger the discretionary note; pass null or a
 *   non-discretionary id to suppress it.
 */
async function mockAutoItemizeDryRun(
  page: Page,
  invoiceId: string,
  budgetSourceId: string | null,
): Promise<void> {
  await page.route(`**/api/invoices/${invoiceId}/auto-itemize`, async (route: Route) => {
    const reqBody = route.request().postDataJSON() as { dryRun: boolean };
    if (!reqBody.dryRun) {
      // Do not intercept commit calls (Scenarios 1 & 2 never commit)
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        lines: [
          {
            description: 'Roofing tiles (500x300mm)',
            quantity: 30,
            unit: 'm²',
            unitPrice: 28.0,
            totalAmount: 840.0,
            includesVat: false,
            vatRate: 0.19,
            vendorName: null,
            confidence: 0.9,
            budgetSourceId,
          },
          {
            description: 'Labor — roof installation',
            quantity: 10,
            unit: 'h',
            unitPrice: 75.0,
            totalAmount: 750.0,
            includesVat: false,
            vatRate: 0.19,
            vendorName: null,
            confidence: 0.85,
            budgetSourceId,
          },
        ],
        warnings: [],
      }),
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: Discretionary note is visible (smoke)
// ─────────────────────────────────────────────────────────────────────────────

test(
  'Scenario 1 [smoke]: AutoItemizePage shows the discretionary note when lines use the discretionary source',
  { tag: '@smoke' },
  async ({ page, testPrefix }) => {
    // Skip on mobile — the AutoItemizePage is a desktop-only functional flow
    const viewportWidth = page.viewportSize()?.width ?? 1440;
    if (viewportWidth < 860) {
      test.skip(true, 'Functional test — desktop/tablet only (≥860px)');
      return;
    }

    // Triple timeouts for this test — AutoItemizePage fires multiple async operations on
    // mount (Paperless status, invoice fetch, document fetch, dry-run LLM call), which
    // can collectively exceed the default 15s test timeout on loaded CI runners.
    test.slow();

    const autoItemizePage = new AutoItemizePage(page);
    let vendorId = '';
    let invoiceId = '';

    try {
      vendorId = await createVendorViaApi(page, `${testPrefix} Disc Note Vendor`);
      invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 1590,
        date: '2026-06-01',
        invoiceNumber: `${testPrefix}-DISC-001`,
      });

      // Mock: config has autoItemizeEnabled=true
      await mockConfigEnabled(page);

      // Mock: GET /api/budget-sources returns list with isDiscretionary=true source
      await mockBudgetSources(page);

      // Mock: GET /paperless/documents/:docId (prevent real Paperless request on page mount)
      const MOCK_DOC_ID = 88001;
      await mockPaperlessDocument(page, MOCK_DOC_ID);

      // Mock: dry-run response with lines whose budgetSourceId = DISCRETIONARY_SOURCE_ID
      // This triggers `hasDiscretionaryLines=true` in AutoItemizePage, showing the note.
      await mockAutoItemizeDryRun(page, invoiceId, DISCRETIONARY_SOURCE_ID);

      // Register a waitForResponse listener BEFORE navigation to ensure we don't miss
      // the dry-run response. The AutoItemizePage fires the dry-run on mount, so the
      // listener must be attached before page.goto() is called.
      const dryRunDonePromise = page.waitForResponse(
        (resp) =>
          resp.url().includes(`/api/invoices/${invoiceId}/auto-itemize`) &&
          resp.request().method() === 'POST' &&
          resp.status() === 200,
      );

      // Navigate directly to the AutoItemizePage
      await page.goto(`/budget/invoices/${invoiceId}/auto-itemize/${MOCK_DOC_ID}`);

      // Wait for the dry-run response to arrive (ensures the component has received data)
      // before calling waitForAnalyzingDone() which polls for the DOM to settle.
      await dryRunDonePromise;

      // Wait for the analysis (dry-run) to complete and card list to render
      await autoItemizePage.waitForAnalyzingDone();

      // Assert: discretionary note is visible
      // Selector: [role="note"][class*="discretionaryNote"]
      await expect(autoItemizePage.discretionaryNote).toBeVisible();
    } finally {
      if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: Discretionary note is absent when lines use a non-discretionary source
// ─────────────────────────────────────────────────────────────────────────────

test('Scenario 2: AutoItemizePage does NOT show the discretionary note when lines use a non-discretionary source', async ({
  page,
  testPrefix,
}) => {
  // Skip on mobile
  const viewportWidth = page.viewportSize()?.width ?? 1440;
  if (viewportWidth < 860) {
    test.skip(true, 'Functional test — desktop/tablet only (≥860px)');
    return;
  }

  test.slow();

  const autoItemizePage = new AutoItemizePage(page);
  let vendorId = '';
  let invoiceId = '';

  try {
    vendorId = await createVendorViaApi(page, `${testPrefix} No Disc Vendor`);
    invoiceId = await createInvoiceViaApi(page, vendorId, {
      amount: 1590,
      date: '2026-06-01',
      invoiceNumber: `${testPrefix}-NODISC-001`,
    });

    await mockConfigEnabled(page);
    await mockBudgetSources(page);

    const MOCK_DOC_ID = 88002;
    await mockPaperlessDocument(page, MOCK_DOC_ID);

    // Lines use the non-discretionary source — note must NOT appear
    await mockAutoItemizeDryRun(page, invoiceId, NON_DISCRETIONARY_SOURCE_ID);

    // Register dry-run response listener before navigation
    const dryRunDonePromise = page.waitForResponse(
      (resp) =>
        resp.url().includes(`/api/invoices/${invoiceId}/auto-itemize`) &&
        resp.request().method() === 'POST' &&
        resp.status() === 200,
    );

    await page.goto(`/budget/invoices/${invoiceId}/auto-itemize/${MOCK_DOC_ID}`);
    await dryRunDonePromise;
    await autoItemizePage.waitForAnalyzingDone();

    // Assert: note is not visible
    await expect(autoItemizePage.discretionaryNote).not.toBeVisible();
  } finally {
    if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
    if (vendorId) await deleteVendorViaApi(page, vendorId);
  }
});

// Also verify: when budgetSourceId is null on lines, note is also absent
test('Scenario 2b: AutoItemizePage does NOT show the discretionary note when lines have null budgetSourceId', async ({
  page,
  testPrefix,
}) => {
  const viewportWidth = page.viewportSize()?.width ?? 1440;
  if (viewportWidth < 860) {
    test.skip(true, 'Functional test — desktop/tablet only (≥860px)');
    return;
  }

  test.slow();

  const autoItemizePage = new AutoItemizePage(page);
  let vendorId = '';
  let invoiceId = '';

  try {
    vendorId = await createVendorViaApi(page, `${testPrefix} Null Src Vendor`);
    invoiceId = await createInvoiceViaApi(page, vendorId, {
      amount: 1590,
      date: '2026-06-01',
    });

    await mockConfigEnabled(page);
    await mockBudgetSources(page);

    const MOCK_DOC_ID = 88003;
    await mockPaperlessDocument(page, MOCK_DOC_ID);

    // Lines have null budgetSourceId — hasDiscretionaryLines is false
    await mockAutoItemizeDryRun(page, invoiceId, null);

    // Register dry-run response listener before navigation
    const dryRunDonePromise = page.waitForResponse(
      (resp) =>
        resp.url().includes(`/api/invoices/${invoiceId}/auto-itemize`) &&
        resp.request().method() === 'POST' &&
        resp.status() === 200,
    );

    await page.goto(`/budget/invoices/${invoiceId}/auto-itemize/${MOCK_DOC_ID}`);
    await dryRunDonePromise;
    await autoItemizePage.waitForAnalyzingDone();

    await expect(autoItemizePage.discretionaryNote).not.toBeVisible();
  } finally {
    if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
    if (vendorId) await deleteVendorViaApi(page, vendorId);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenarios 3 & 4: Auto-origin badge — REMOVED (PR #1655 / Issue #1615)
// ─────────────────────────────────────────────────────────────────────────────
//
// Story #1551 (PR #1610) added an "Auto-itemized" badge to BudgetLineRow when
// line.origin === 'auto'. PR #1655 removed this badge entirely because:
//   - Product feedback: not useful — no one needs to distinguish auto-itemized lines
//     in the overview.
//   - The badge could never render in practice (auto-itemize 'create-new' lines have
//     work_item_id=NULL and are excluded by the INNER JOIN in budgetBreakdownService).
//
// Scenario 3 was already test.fixme (data-path gap). Scenario 4 tested the negative
// case (badge absent on manual lines). Both scenarios are deleted per Issue #1615's
// cleanup scope — the badge CSS class, unit tests, and i18n keys were all removed in
// PR #1655. No E2E tests for a removed UI element are needed.
