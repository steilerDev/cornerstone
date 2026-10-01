/**
 * E2E tests for the top-level "Budget source" default on the Paperless-first invoice
 * review page (Story #2158).
 *
 * Selecting a source in #invoice-budget-source applies it to every non-linked line's
 * per-line source select (and to queued inline drafts); individual lines can be
 * overridden afterwards; values travel as lines[].budgetSourceId on the commit request.
 *
 * Paperless, config, preview and commit are mocked via page.route(). Budget sources,
 * vendor and work item are REAL (created through the API).
 *
 * Scenarios:
 *   1. Select source A -> every per-line source select shows A
 *   2. Override line 1 to B -> line 1 B, others A, top default still A
 *   3. Commit payload carries A for untouched lines and B for the overridden line
 *   4. Inline draft shows A and the real work-item budget line is created with A
 *   5. @responsive 375px: select visible, label-resolvable, no horizontal overflow
 */

import { test, expect } from '../../fixtures/auth.js';
import { InvoicesPage } from '../../pages/InvoicesPage.js';
import { PaperlessInvoiceReviewPage } from '../../pages/PaperlessInvoiceReviewPage.js';
import { API } from '../../fixtures/testData.js';
import {
  createBudgetSourceViaApi,
  deleteBudgetSourceViaApi,
  createVendorViaApi,
  deleteVendorViaApi,
  createWorkItemViaApi,
  deleteWorkItemViaApi,
} from '../../fixtures/apiHelpers.js';
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
import type { Page } from '@playwright/test';

const THREE_LINES = [
  ...MOCK_EXTRACTED_LINES,
  {
    ...MOCK_EXTRACTED_LINES[0],
    description: 'Grout and sealant',
    quantity: 4,
    unitPrice: 12.5,
    totalAmount: 50.0,
  },
];

async function openReviewPage(
  page: Page,
  opts: { lineCount?: number } = {},
): Promise<PaperlessInvoiceReviewPage> {
  const catResp = await page.request.get(API.budgetCategories);
  expect(catResp.ok(), `GET budget-categories failed: ${catResp.status()}`).toBeTruthy();
  const cats = (await catResp.json()) as { categories: Array<{ id: string }> };
  const categoryId = cats.categories[0]?.id;
  expect(categoryId, 'Expected at least one budget category').toBeTruthy();
  const lines = THREE_LINES.slice(0, opts.lineCount ?? 3).map((l) => ({
    ...l,
    budgetCategoryId: categoryId,
  }));

  await mockPaperlessConfigured(page);
  await mockConfig(page, true);
  await mockCorrespondents(page);
  await mockDocuments(page);
  await mockTags(page);
  await mockLinkedIds(page);
  await mockDocumentDetail(page);
  await mockPreview(page, { suggestedVendorId: null, lines });
  await mockCommitCapturing(page);

  const invoicesPage = new InvoicesPage(page);
  await invoicesPage.goto();
  await invoicesPage.waitForLoaded();
  await invoicesPage.clickNewInvoice();
  const pickerModal = await invoicesPage.waitForPickerModal();
  await pickerModal.selectDocument(MOCK_DOC.title);
  await page.waitForURL('**/budget/invoices/new/paperless');

  const reviewPage = new PaperlessInvoiceReviewPage(page);
  await reviewPage.waitForExtractionComplete();
  return reviewPage;
}

async function createSources(
  page: Page,
  testPrefix: string,
): Promise<{ a: string; b: string; ids: string[] }> {
  const a = await createBudgetSourceViaApi(page, {
    name: `${testPrefix} BS-A`,
    totalAmount: 100000,
  });
  const b = await createBudgetSourceViaApi(page, {
    name: `${testPrefix} BS-B`,
    totalAmount: 100000,
  });
  return { a, b, ids: [a, b] };
}

async function cleanupSources(page: Page, ids: string[]): Promise<void> {
  for (const id of ids) await deleteBudgetSourceViaApi(page, id);
}

test.describe('Paperless invoice review: default budget source (#2158)', () => {
  test('Scenario 1 — selecting a source at the top applies it to every line', async ({
    page,
    testPrefix,
  }) => {
    const { a, ids } = await createSources(page, testPrefix);
    try {
      const reviewPage = await openReviewPage(page);
      await expect(reviewPage.lineRow(2)).toBeVisible();

      await reviewPage.budgetSourceSelect.selectOption(a);

      await expect(reviewPage.budgetSourceSelect).toHaveValue(a);
      for (let i = 0; i < 3; i++) {
        await expect(reviewPage.lineSourceSelect(i)).toHaveValue(a);
      }
    } finally {
      await cleanupSources(page, ids);
    }
  });

  test('Scenario 2 — a single line can be overridden after the default is applied', async ({
    page,
    testPrefix,
  }) => {
    const { a, b, ids } = await createSources(page, testPrefix);
    try {
      const reviewPage = await openReviewPage(page);
      await reviewPage.budgetSourceSelect.selectOption(a);
      await expect(reviewPage.lineSourceSelect(0)).toHaveValue(a);

      await reviewPage.lineSourceSelect(0).selectOption(b);

      await expect(reviewPage.lineSourceSelect(0)).toHaveValue(b);
      await expect(reviewPage.lineSourceSelect(1)).toHaveValue(a);
      await expect(reviewPage.lineSourceSelect(2)).toHaveValue(a);
      await expect(reviewPage.budgetSourceSelect).toHaveValue(a);
    } finally {
      await cleanupSources(page, ids);
    }
  });

  test('Scenario 3 — commit payload carries the default and the per-line override', async ({
    page,
    testPrefix,
  }) => {
    const { a, b, ids } = await createSources(page, testPrefix);
    let vendorId = '';
    try {
      vendorId = await createVendorViaApi(page, { name: `${testPrefix} BS3 Vendor` });
      const reviewPage = await openReviewPage(page);

      await reviewPage.budgetSourceSelect.selectOption(a);
      await expect(reviewPage.lineSourceSelect(2)).toHaveValue(a);
      await reviewPage.lineSourceSelect(0).selectOption(b);
      await expect(reviewPage.lineSourceSelect(0)).toHaveValue(b);
      await reviewPage.setVendor(`${testPrefix} BS3 Vendor`);

      const commitRequest = page.waitForRequest(
        (r) =>
          r.method() === 'POST' &&
          new URL(r.url()).pathname === '/api/invoices/auto-itemize/commit',
      );
      await reviewPage.confirm();
      const req = await commitRequest;

      const body = req.postDataJSON() as { lines: Array<{ budgetSourceId?: string }> };
      expect(body.lines.map((l) => l.budgetSourceId)).toEqual([b, a, a]);
    } finally {
      if (vendorId) await deleteVendorViaApi(page, vendorId);
      await cleanupSources(page, ids);
    }
  });

  test('Scenario 4 — a queued inline draft inherits the default and persists it', async ({
    page,
    testPrefix,
  }) => {
    const vw = page.viewportSize()?.width ?? 1440;
    test.skip(vw < 600, 'Functional test — desktop/tablet only (≥600px)');

    const { a, ids } = await createSources(page, testPrefix);
    let vendorId = '';
    let workItemId = '';
    try {
      vendorId = await createVendorViaApi(page, { name: `${testPrefix} BS4 Vendor` });
      workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} BS4 WI` });
      const reviewPage = await openReviewPage(page, { lineCount: 1 });

      await reviewPage.queueCreateNewBudgetLine(`${testPrefix} BS4 WI`);
      await expect(reviewPage.getInlineDraftSourceSelect(0)).toBeVisible();

      await reviewPage.budgetSourceSelect.selectOption(a);
      await expect(reviewPage.getInlineDraftSourceSelect(0)).toHaveValue(a);

      await reviewPage.setVendor(`${testPrefix} BS4 Vendor`);

      // The inline draft is persisted through the REAL work-item budget endpoint; only the
      // invoice commit itself is mocked (no Paperless document is available to link).
      const budgetCreated = page.waitForResponse(
        (r) =>
          r.request().method() === 'POST' &&
          new URL(r.url()).pathname === `/api/work-items/${workItemId}/budgets`,
      );
      await reviewPage.confirm();
      const resp = await budgetCreated;
      expect(resp.status()).toBe(201);
      expect((resp.request().postDataJSON() as { budgetSourceId?: string }).budgetSourceId).toBe(a);

      const listResp = await page.request.get(`${API.workItems}/${workItemId}/budgets`);
      expect(listResp.ok()).toBeTruthy();
      const { budgets } = (await listResp.json()) as {
        budgets: Array<{ budgetSource: { id: string } | null }>;
      };
      expect(budgets).toHaveLength(1);
      expect(budgets[0].budgetSource?.id).toBe(a);
    } finally {
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
      await cleanupSources(page, ids);
    }
  });

  test('Scenario 5 — @responsive: select is usable and does not overflow at 375px', async ({
    page,
    testPrefix,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const { ids } = await createSources(page, testPrefix);
    try {
      const reviewPage = await openReviewPage(page, { lineCount: 2 });

      await expect(reviewPage.budgetSourceSelect).toBeVisible();
      await expect(page.getByLabel('Budget source', { exact: true })).toBeVisible();

      const overflow = await reviewPage.formColumn.first().evaluate((el) => ({
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      }));
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
    } finally {
      await cleanupSources(page, ids);
    }
  });
});
