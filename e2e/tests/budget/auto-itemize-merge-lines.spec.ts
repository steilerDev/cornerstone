/**
 * E2E tests for Story #1797: merge multiple extracted auto-itemize line items into
 * one consolidated line.
 *
 * Feature summary:
 *   In the auto-itemization flow, each UNASSIGNED extracted line card shows a
 *   selection checkbox. Selecting ≥1 line reveals a sticky SelectionActionBar with
 *   a "Merge" button (disabled below 2 selections). Clicking Merge:
 *     - removes the selected source rows
 *     - inserts ONE new row at their position, showing a loading indicator while
 *       POST /api/invoices/auto-itemize/merge-lines resolves
 *     - on success, the row becomes a normal editable/assignable extracted line
 *       (LLM-synthesized description + code-aggregated numerics)
 *     - on failure, the row shows an error state with Retry and "Restore original
 *       lines" (Undo) actions
 *   Behavior is identical on AutoItemizePage (existing invoice) and
 *   PaperlessInvoiceReviewPage (new invoice) — both render the shared
 *   AutoItemizeLineList/AutoItemizeLineCard/useAutoItemizeLines stack.
 *
 * KNOWN BUGS (filed as GitHub issue #1798 by e2e-test-engineer — see also POM
 * comments in AutoItemizePage.ts / PaperlessInvoiceReviewPage.ts):
 *   - The client-side merge feature currently fails `tsc --noEmit` (5 distinct
 *     compile errors) — CI Static Analysis / build will fail until fixed.
 *   - `performMerge()` has no `.catch()`, so a failed merge-lines call never
 *     reaches the error/Retry/Undo UI — the row is stuck loading forever. Scenarios
 *     3 and 4 below encode the *intended* behavior per the acceptance criteria and
 *     are expected to fail until that bug is fixed — they must not be weakened to
 *     accommodate it.
 *   - AutoItemizeLineList renders a duplicate "Clear selection" button.
 *
 * Scenarios:
 *   1. Selection + merge bar appearance (AutoItemizePage)
 *   2. Successful merge: source rows removed, loading indicator, then merged
 *      description + code-aggregated total (AutoItemizePage)
 *   3. Merge failure (502 LLM_UPSTREAM_ERROR) + Retry → success (AutoItemizePage)
 *   4. Undo (Restore original lines) after a merge failure (AutoItemizePage)
 *   5. Assign the merged row via the existing BudgetLinePickerModal flow, then
 *      Save → navigate to invoice detail (AutoItemizePage)
 *   6. An already-assigned line's checkbox is disabled/absent from selection
 *      (AutoItemizePage)
 *   7. Parity smoke: select 2 → merge → success on PaperlessInvoiceReviewPage
 *   8. @responsive: selection + merge bar appearance at mobile viewport; bar stays
 *      in viewport after scrolling the line list
 *
 * Mocking strategy:
 *   - GET /api/config: autoItemizeEnabled: true
 *   - GET /paperless/documents/:id: mock document detail (AutoItemizePage entry)
 *   - POST /api/invoices/:id/auto-itemize: dry-run (and, for Scenario 5, commit)
 *   - POST /api/invoices/auto-itemize/merge-lines: THE feature under test — mocked
 *     via page.route() (no real LLM container, matching every other auto-itemize spec)
 *   - Scenario 7 additionally mocks the Paperless-first new-invoice flow endpoints
 *     (status/correspondents/documents/tags/preview), matching
 *     paperless-first-invoice.spec.ts's established pattern.
 *
 * All tests use the authenticated `page` fixture and `testPrefix` from auth.ts.
 */

import { test, expect } from '../../fixtures/auth.js';
import { AutoItemizePage } from '../../pages/AutoItemizePage.js';
import { PaperlessInvoiceReviewPage } from '../../pages/PaperlessInvoiceReviewPage.js';
import { InvoiceDetailPage } from '../../pages/InvoiceDetailPage.js';
import { InvoicesPage } from '../../pages/InvoicesPage.js';
import type { Page, Route } from '@playwright/test';
import { API } from '../../fixtures/testData.js';
import {
  createVendorViaApi,
  deleteVendorViaApi,
  createWorkItemViaApi,
  deleteWorkItemViaApi,
} from '../../fixtures/apiHelpers.js';

// ─────────────────────────────────────────────────────────────────────────────
// Inline REST helpers (mirrors e2e/tests/invoices/invoice-auto-itemize-page.spec.ts)
// ─────────────────────────────────────────────────────────────────────────────

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

/** Create a work item budget (budget line) via REST API. Returns the budget line id. */
async function createWorkItemBudgetViaApi(
  page: Page,
  workItemId: string,
  data: { description: string; plannedAmount: number },
): Promise<string> {
  const resp = await page.request.post(`${API.workItems}/${workItemId}/budgets`, {
    data: { ...data, confidence: 'own_estimate', budgetSourceId: 'discretionary-system' },
  });
  expect(resp.ok(), `POST work item budget failed: ${resp.status()}`).toBeTruthy();
  const body = (await resp.json()) as { budget: { id: string } };
  return body.budget.id;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixture data
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Four unassigned extracted lines. Lines 0 and 1 are the merge candidates used
 * throughout — both `includesVat: false` at 900.00 and 680.00, so the code-side
 * aggregation (see autoItemizeMergeUtils.ts) normalizes both to gross (19% VAT)
 * before summing:
 *   effectiveLineAmount(900, false) = round(900 * 1.19, 2)  = 1071.00
 *   effectiveLineAmount(680, false) = round(680 * 1.19, 2)  =  809.20
 *   merged totalAmount              = round(1071.00 + 809.20, 2) = 1880.20
 * Rendered in the totalAmount <input type="number"> as "1880.2" (no trailing zero).
 */
const MERGE_TEST_LINES = [
  {
    description: 'Bathroom tiles (600x600mm)',
    quantity: 20,
    unit: 'm²',
    unitPrice: 45.0,
    totalAmount: 900.0,
    includesVat: false,
    vatRate: 0.19,
    vendorName: null,
    confidence: 0.95,
  },
  {
    description: 'Installation labor',
    quantity: 8,
    unit: 'h',
    unitPrice: 85.0,
    totalAmount: 680.0,
    includesVat: false,
    vatRate: 0.19,
    vendorName: null,
    confidence: 0.88,
  },
  {
    description: 'Adhesive and grout materials',
    quantity: null,
    unit: null,
    unitPrice: null,
    totalAmount: 120.0,
    includesVat: false,
    vatRate: null,
    vendorName: null,
    confidence: 0.72,
  },
  {
    description: 'Site cleanup',
    quantity: 1,
    unit: 'job',
    unitPrice: 60.0,
    totalAmount: 60.0,
    includesVat: false,
    vatRate: 0.19,
    vendorName: null,
    confidence: 0.8,
  },
];

const MERGED_DESCRIPTION = 'Bathroom tiles and installation labor (merged)';
const MERGED_TOTAL = '1880.2';

// ─────────────────────────────────────────────────────────────────────────────
// Route-intercept helpers — existing-invoice (AutoItemizePage) flow
// ─────────────────────────────────────────────────────────────────────────────

/** Intercept GET /api/config to inject autoItemizeEnabled. */
async function mockConfig(page: Page, autoItemizeEnabled: boolean): Promise<void> {
  await page.route('**/api/config', async (route: Route) => {
    try {
      const realResp = await route.fetch();
      const realBody = (await realResp.json()) as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...realBody, autoItemizeEnabled }),
      });
    } catch {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ currency: 'EUR', autoItemizeEnabled }),
      });
    }
  });
}

/** Intercept GET /paperless/documents/:docId to return a mock document. */
async function mockPaperlessDocument(page: Page, docId: number, title: string): Promise<void> {
  await page.route(`**/paperless/documents/${docId}`, async (route: Route) => {
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
          title,
          content: 'Sample OCR content for testing',
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

/** Intercept POST /api/invoices/:id/auto-itemize (dry-run call triggered on mount). */
async function mockAutoItemizeDryRun(
  page: Page,
  invoiceId: string,
  opts: { lines?: object[] } = {},
): Promise<void> {
  const lines = opts.lines ?? MERGE_TEST_LINES;
  await page.route(`**/api/invoices/${invoiceId}/auto-itemize`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ lines, warnings: [] }),
    });
  });
}

/**
 * Intercept POST /api/invoices/auto-itemize/merge-lines — the feature under test.
 *
 * @param opts.failFirstNTimes - number of leading calls to fail with a 502
 *   LLM_UPSTREAM_ERROR before returning success (use `Infinity` to always fail).
 */
async function mockMergeLines(
  page: Page,
  opts: {
    description?: string;
    category?: string | null;
    budgetCategoryId?: string | null;
    failFirstNTimes?: number;
    delayMs?: number;
  } = {},
): Promise<void> {
  let callCount = 0;
  const failN = opts.failFirstNTimes ?? 0;

  await page.route('**/api/invoices/auto-itemize/merge-lines', async (route: Route) => {
    callCount += 1;
    if (opts.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, opts.delayMs));
    }
    if (callCount <= failN) {
      await route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            code: 'LLM_UPSTREAM_ERROR',
            message: 'LLM upstream returned 502',
            details: {},
          },
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        description: opts.description ?? MERGED_DESCRIPTION,
        category: opts.category ?? null,
        budgetCategoryId: opts.budgetCategoryId ?? null,
      }),
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Route-intercept helpers — new-invoice (PaperlessInvoiceReviewPage) parity flow
// (mirrors e2e/tests/invoices/paperless-first-invoice.spec.ts's established pattern)
// ─────────────────────────────────────────────────────────────────────────────

const PF_MOCK_DOC = {
  id: 91001,
  title: 'Merge Parity Invoice',
  content: 'Materials for bathroom renovation',
  tags: [],
  created: '2026-01-15',
  added: '2026-01-15T10:00:00Z',
  modified: '2026-01-15T10:00:00Z',
  correspondent: 'Builder Co',
  documentType: 'Invoice',
  archiveSerialNumber: 91001,
  originalFileName: 'merge-parity-invoice.pdf',
  pageCount: 1,
  searchHit: null,
};

async function mockPaperlessConfigured(page: Page): Promise<void> {
  await page.route('**/api/paperless/status', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        configured: true,
        reachable: true,
        error: null,
        paperlessUrl: 'http://paperless.local:8000',
        filterTag: null,
      }),
    });
  });
}

async function mockCorrespondents(page: Page): Promise<void> {
  await page.route('**/paperless/correspondents', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ correspondents: [] }),
    });
  });
}

async function mockTags(page: Page): Promise<void> {
  await page.route('**/api/paperless/tags', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ tags: [] }),
    });
  });
}

async function mockLinkedIds(page: Page): Promise<void> {
  await page.route('**/api/document-links/linked-ids', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ paperlessDocumentIds: [] }),
    });
  });
}

async function mockDocuments(page: Page): Promise<void> {
  await page.route('**/paperless/documents**', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        documents: [PF_MOCK_DOC],
        pagination: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1 },
      }),
    });
  });
}

async function mockDocumentDetail(page: Page, docId: number): Promise<void> {
  await page.route(`**/paperless/documents/${docId}`, async (route: Route) => {
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
      body: JSON.stringify({ document: PF_MOCK_DOC }),
    });
  });
}

/** Intercept POST /api/invoices/auto-itemize/preview (new-invoice extraction call). */
async function mockPreview(page: Page): Promise<void> {
  await page.route('**/api/invoices/auto-itemize/preview', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        lines: MERGE_TEST_LINES.slice(0, 2),
        warnings: [],
        suggestedVendorId: null,
        extractedTotal: 1580,
        extractedInvoiceDate: '2026-01-15',
        extractedInvoiceNumber: 'INV-2026-MERGE-001',
        extractedNotes: null,
        extractedDueDate: null,
      }),
    });
  });
}

/** Navigates through the full picker flow so React Router location state is set. */
async function navigateToReviewPage(page: Page): Promise<PaperlessInvoiceReviewPage> {
  const invoicesPage = new InvoicesPage(page);
  await invoicesPage.goto();
  await invoicesPage.waitForLoaded();

  await invoicesPage.clickNewInvoice();
  const pickerModal = await invoicesPage.waitForPickerModal();
  await pickerModal.selectDocument(PF_MOCK_DOC.title);
  await page.waitForURL('**/budget/invoices/new/paperless');

  const reviewPage = new PaperlessInvoiceReviewPage(page);
  await reviewPage.waitForExtractionComplete();
  return reviewPage;
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1 — Selection + merge bar appearance
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Scenario 1 — Selection + merge bar appearance', () => {
  test('No Merge bar with 0 selected; disabled with 1 selected; enabled with 2 selected', async ({
    page,
    testPrefix,
  }) => {
    const vw = page.viewportSize()?.width ?? 1440;
    if (vw < 600) {
      test.skip(true, 'Functional test — skip on very narrow mobile (see Scenario 8)');
      return;
    }

    const autoItemizePage = new AutoItemizePage(page);
    let vendorId = '';
    let invoiceId = '';

    try {
      vendorId = await createVendorViaApi(page, { name: `${testPrefix} Merge-Sel Vendor` });
      invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 1760,
        date: '2026-06-01',
        invoiceNumber: `${testPrefix}-MERGE-SEL-001`,
      });

      const docId = 80001;
      await mockConfig(page, true);
      await mockPaperlessDocument(page, docId, 'Merge Selection Doc');
      await mockAutoItemizeDryRun(page, invoiceId);

      await autoItemizePage.goto(invoiceId, docId);
      await autoItemizePage.waitForAnalyzingDone();

      // ── 4 line cards present ──────────────────────────────────────────────
      const cards = page.locator('[role="list"] li[class*="lineCard"]');
      await expect(cards).toHaveCount(4);

      // ── No selection yet: Merge bar hidden ─────────────────────────────────
      expect(await autoItemizePage.getMergeButtonState()).toBe('hidden');

      // ── Select one line: bar appears, Merge disabled ──────────────────────
      await autoItemizePage.selectLineForMerge(0);
      await expect(autoItemizePage.mergeButton).toBeVisible();
      expect(await autoItemizePage.getMergeButtonState()).toBe('disabled');

      // ── Select a second line: Merge enabled ───────────────────────────────
      await autoItemizePage.selectLineForMerge(1);
      expect(await autoItemizePage.getMergeButtonState()).toBe('enabled');

      // ── Count label reflects the selection ────────────────────────────────
      await expect(autoItemizePage.selectionActionBar()).toContainText('2 selected');
    } finally {
      if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2 — Successful merge: loading indicator → merged description + total
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Scenario 2 — Successful merge', () => {
  test('Merging 2 lines replaces them with one row: loading indicator, then merged description + aggregated total', async ({
    page,
    testPrefix,
  }) => {
    const vw = page.viewportSize()?.width ?? 1440;
    if (vw < 600) {
      test.skip(true, 'Functional test — skip on very narrow mobile');
      return;
    }

    const autoItemizePage = new AutoItemizePage(page);
    let vendorId = '';
    let invoiceId = '';

    try {
      vendorId = await createVendorViaApi(page, { name: `${testPrefix} Merge-OK Vendor` });
      invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 1760,
        date: '2026-06-01',
        invoiceNumber: `${testPrefix}-MERGE-OK-001`,
      });

      const docId = 80002;
      await mockConfig(page, true);
      await mockPaperlessDocument(page, docId, 'Merge Success Doc');
      await mockAutoItemizeDryRun(page, invoiceId);
      await mockMergeLines(page, { description: MERGED_DESCRIPTION, delayMs: 150 });

      await autoItemizePage.goto(invoiceId, docId);
      await autoItemizePage.waitForAnalyzingDone();

      const cards = page.locator('[role="list"] li[class*="lineCard"]');
      await expect(cards).toHaveCount(4);

      await autoItemizePage.selectLineForMerge(0);
      await autoItemizePage.selectLineForMerge(1);
      expect(await autoItemizePage.getMergeButtonState()).toBe('enabled');

      await autoItemizePage.clickMergeButton();

      // ── Source rows removed immediately; one new (loading) row takes their place ──
      await expect(cards).toHaveCount(3);
      await expect(autoItemizePage.mergingRow).toBeVisible();
      await expect(autoItemizePage.mergingRow).toHaveAttribute('aria-busy', 'true');

      // ── Merge bar is dismissed once merge starts (selection cleared) ──────
      expect(await autoItemizePage.getMergeButtonState()).toBe('hidden');

      // ── After the mocked LLM response resolves, the row becomes a normal
      //    editable card with the LLM-synthesized description and the
      //    code-aggregated total (never touched by the LLM). ─────────────────
      await autoItemizePage.waitForMergedRow();
      await expect(cards).toHaveCount(3);
      await expect(autoItemizePage.lineDescription(0)).toHaveValue(MERGED_DESCRIPTION);
      await expect(autoItemizePage.lineTotal(0)).toHaveValue(MERGED_TOTAL);
    } finally {
      if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3 — Merge failure + Retry
// ─────────────────────────────────────────────────────────────────────────────
//
// NOTE (issue #1798): as implemented, `performMerge()` has no `.catch()`, so the
// mocked 502 below currently leaves the row stuck in the loading state forever —
// the error row this test expects never renders. This test encodes the acceptance
// criteria's intended behavior and is expected to fail until that bug is fixed.

test.describe('Scenario 3 — Merge failure + Retry', () => {
  test('502 LLM_UPSTREAM_ERROR shows error card with Retry/Undo; Retry succeeds on second attempt', async ({
    page,
    testPrefix,
  }) => {
    const vw = page.viewportSize()?.width ?? 1440;
    if (vw < 600) {
      test.skip(true, 'Functional test — skip on very narrow mobile');
      return;
    }

    const autoItemizePage = new AutoItemizePage(page);
    let vendorId = '';
    let invoiceId = '';

    try {
      vendorId = await createVendorViaApi(page, { name: `${testPrefix} Merge-Retry Vendor` });
      invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 1760,
        date: '2026-06-01',
        invoiceNumber: `${testPrefix}-MERGE-RETRY-001`,
      });

      const docId = 80003;
      await mockConfig(page, true);
      await mockPaperlessDocument(page, docId, 'Merge Retry Doc');
      await mockAutoItemizeDryRun(page, invoiceId);
      // Fail once, then succeed on the Retry.
      await mockMergeLines(page, { description: MERGED_DESCRIPTION, failFirstNTimes: 1 });

      await autoItemizePage.goto(invoiceId, docId);
      await autoItemizePage.waitForAnalyzingDone();

      await autoItemizePage.selectLineForMerge(0);
      await autoItemizePage.selectLineForMerge(1);
      await autoItemizePage.clickMergeButton();

      // ── First attempt fails: error card with Retry + Undo ────────────────
      await expect(autoItemizePage.mergeErrorRow).toBeVisible();
      await expect(autoItemizePage.mergeErrorRow).toContainText("Couldn't merge these line items.");
      await expect(autoItemizePage.mergeErrorRow).toContainText('Merge failed');
      await expect(autoItemizePage.mergeRetryButton).toBeVisible();
      await expect(autoItemizePage.mergeUndoButton).toBeVisible();

      // ── Retry: second call succeeds ───────────────────────────────────────
      await autoItemizePage.clickRetryMerge();
      await expect(autoItemizePage.mergeErrorRow).not.toBeVisible();
      await autoItemizePage.waitForMergedRow();

      const cards = page.locator('[role="list"] li[class*="lineCard"]');
      await expect(cards).toHaveCount(3);
      await expect(autoItemizePage.lineDescription(0)).toHaveValue(MERGED_DESCRIPTION);
      await expect(autoItemizePage.lineTotal(0)).toHaveValue(MERGED_TOTAL);
    } finally {
      if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4 — Undo (Restore original lines) after a merge failure
// ─────────────────────────────────────────────────────────────────────────────
//
// NOTE (issue #1798): same root cause as Scenario 3 — the error row this test
// depends on never renders against the current implementation. Encodes the
// intended acceptance-criteria behavior regardless.

test.describe('Scenario 4 — Undo restores original source lines', () => {
  test('After a merge failure, "Restore original lines" brings back both source rows unchanged', async ({
    page,
    testPrefix,
  }) => {
    const vw = page.viewportSize()?.width ?? 1440;
    if (vw < 600) {
      test.skip(true, 'Functional test — skip on very narrow mobile');
      return;
    }

    const autoItemizePage = new AutoItemizePage(page);
    let vendorId = '';
    let invoiceId = '';

    try {
      vendorId = await createVendorViaApi(page, { name: `${testPrefix} Merge-Undo Vendor` });
      invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 1760,
        date: '2026-06-01',
        invoiceNumber: `${testPrefix}-MERGE-UNDO-001`,
      });

      const docId = 80004;
      await mockConfig(page, true);
      await mockPaperlessDocument(page, docId, 'Merge Undo Doc');
      await mockAutoItemizeDryRun(page, invoiceId);
      // Always fails — Undo must recover without ever needing a success response.
      await mockMergeLines(page, { failFirstNTimes: Infinity });

      await autoItemizePage.goto(invoiceId, docId);
      await autoItemizePage.waitForAnalyzingDone();

      const cards = page.locator('[role="list"] li[class*="lineCard"]');
      await expect(cards).toHaveCount(4);

      await autoItemizePage.selectLineForMerge(0);
      await autoItemizePage.selectLineForMerge(1);
      await autoItemizePage.clickMergeButton();

      await expect(autoItemizePage.mergeErrorRow).toBeVisible();

      // ── Undo: original source lines reappear, error row is gone ──────────
      await autoItemizePage.clickUndoMerge();
      await expect(autoItemizePage.mergeErrorRow).not.toBeVisible();
      await expect(cards).toHaveCount(4);
      await expect(autoItemizePage.lineDescription(0)).toHaveValue('Bathroom tiles (600x600mm)');
      await expect(autoItemizePage.lineDescription(1)).toHaveValue('Installation labor');
      await expect(autoItemizePage.lineTotal(0)).toHaveValue('900');
      await expect(autoItemizePage.lineTotal(1)).toHaveValue('680');

      // ── No lingering selection or merge bar after Undo ────────────────────
      expect(await autoItemizePage.getMergeButtonState()).toBe('hidden');
    } finally {
      if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5 — Assign the merged row, then Save → invoice detail
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Scenario 5 — Assign merged row and continue the itemization flow', () => {
  test('Merged row can be assigned to a work item budget line exactly like a normal extracted line; Save navigates to invoice detail', async ({
    page,
    testPrefix,
  }) => {
    const vw = page.viewportSize()?.width ?? 1440;
    if (vw < 600) {
      test.skip(true, 'Functional test — skip on very narrow mobile');
      return;
    }

    const autoItemizePage = new AutoItemizePage(page);
    const detailPage = new InvoiceDetailPage(page);
    let vendorId = '';
    let invoiceId = '';
    let workItemId = '';
    let budgetLineId = '';
    const budgetLineDescription = `${testPrefix} Merge-Assign BL`;

    try {
      vendorId = await createVendorViaApi(page, { name: `${testPrefix} Merge-Assign Vendor` });
      invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 1760,
        date: '2026-06-01',
        invoiceNumber: `${testPrefix}-MERGE-ASSIGN-001`,
      });
      workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} Merge-Assign WI` });
      budgetLineId = await createWorkItemBudgetViaApi(page, workItemId, {
        description: budgetLineDescription,
        plannedAmount: 1880.2,
      });

      const docId = 80005;
      await mockConfig(page, true);
      await mockPaperlessDocument(page, docId, 'Merge Assign Doc');
      await mockAutoItemizeDryRun(page, invoiceId);
      await mockMergeLines(page, { description: MERGED_DESCRIPTION });

      await autoItemizePage.goto(invoiceId, docId);
      await autoItemizePage.waitForAnalyzingDone();

      await autoItemizePage.selectLineForMerge(0);
      await autoItemizePage.selectLineForMerge(1);
      await autoItemizePage.clickMergeButton();
      await autoItemizePage.waitForMergedRow();

      // Merged row lands at index 0 (min index of the merged-away source rows).
      await expect(autoItemizePage.lineDescription(0)).toHaveValue(MERGED_DESCRIPTION);

      // ── Assign the merged row via the existing picker flow ────────────────
      const mergedAssignBtn = autoItemizePage.lineAssignButton(0);
      await expect(mergedAssignBtn).toBeVisible();
      await mergedAssignBtn.click();
      await expect(autoItemizePage.pickerModal).toBeVisible();

      await expect(autoItemizePage.pickerWorkItemSearchInput).toBeVisible();
      await autoItemizePage.pickerWorkItemSearchInput.fill(`${testPrefix} Merge-Assign WI`);
      const wiOption = autoItemizePage.pickerPortalDropdown.getByRole('option', {
        name: `${testPrefix} Merge-Assign WI`,
      });
      await wiOption.waitFor({ state: 'visible' });
      await wiOption.click();

      const step2Modal = autoItemizePage.pickerStep2Modal();
      await expect(step2Modal).toBeVisible();
      const budgetLineButton = autoItemizePage.pickerBudgetLineRow(
        new RegExp(budgetLineDescription, 'i'),
      );
      await budgetLineButton.waitFor({ state: 'visible' });
      await budgetLineButton.click();
      await expect(autoItemizePage.pickerModal).not.toBeVisible();

      // ── Merged row now shows the assigned badge ───────────────────────────
      const assignedBadge = autoItemizePage.lineAssignedBadge(0);
      await expect(assignedBadge).toBeVisible();
      await expect(autoItemizePage.lineAssignedDescription(0)).toContainText(budgetLineDescription);

      // ── Pick a category for the two remaining unassigned lines (guard requires
      //    it for create-new mode); the merged+assigned row does not need one. ──
      await autoItemizePage.getLineCardCategorySelect(1).selectOption({ index: 1 });
      await autoItemizePage.getLineCardCategorySelect(2).selectOption({ index: 1 });

      // ── Save → commit POST → navigate back to invoice detail ─────────────
      const now = '2026-05-25T00:00:00.000Z';
      await page.route(`**/api/invoices/${invoiceId}/auto-itemize`, async (route: Route) => {
        const reqBody = route.request().postDataJSON() as { dryRun: boolean } | null;
        if (reqBody?.dryRun) {
          await route.continue();
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            budgetLines: [
              {
                id: 'ibl-merge-assign-e2e-0',
                workItemBudgetId: budgetLineId,
                householdItemBudgetId: null,
                itemizedAmount: 1880.2,
                description: budgetLineDescription,
                plannedAmount: 1880.2,
                confidence: 'invoice',
                budgetCategory: null,
                budgetSource: null,
                vendor: null,
                quantity: null,
                unit: null,
                unitPrice: null,
                includesVat: true,
                createdAt: now,
                updatedAt: now,
                invoiceId,
                origin: 'auto',
                workItem: { id: workItemId, title: `${testPrefix} Merge-Assign WI` },
                householdItem: null,
                isUnassigned: false,
              },
            ],
            remainingAmount: 0,
          }),
        });
      });

      const commitResponsePromise = page.waitForResponse(
        (resp) =>
          resp.url().includes(`/api/invoices/${invoiceId}/auto-itemize`) &&
          resp.request().method() === 'POST' &&
          !(resp.request().postDataJSON() as { dryRun?: boolean })?.dryRun,
      );
      await autoItemizePage.saveButton.click();
      await commitResponsePromise;

      await expect(page).toHaveURL(/\/budget\/invoices\/[^/]+$/);
      await expect(detailPage.heading).toBeVisible();
    } finally {
      if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6 — An already-assigned line cannot be selected for merge
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Scenario 6 — Ineligible (already-assigned) line cannot be selected', () => {
  test('Assigning a line disables its selection checkbox; it is excluded from the merge selection', async ({
    page,
    testPrefix,
  }) => {
    const vw = page.viewportSize()?.width ?? 1440;
    if (vw < 600) {
      test.skip(true, 'Functional test — skip on very narrow mobile');
      return;
    }

    const autoItemizePage = new AutoItemizePage(page);
    let vendorId = '';
    let invoiceId = '';
    let workItemId = '';

    try {
      vendorId = await createVendorViaApi(page, { name: `${testPrefix} Merge-Ineligible Vendor` });
      invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 1760,
        date: '2026-06-01',
        invoiceNumber: `${testPrefix}-MERGE-INELIGIBLE-001`,
      });
      workItemId = await createWorkItemViaApi(page, {
        title: `${testPrefix} Merge-Ineligible WI`,
      });
      const budgetLineDescription = `${testPrefix} Merge-Ineligible BL`;
      const budgetLineId = await createWorkItemBudgetViaApi(page, workItemId, {
        description: budgetLineDescription,
        plannedAmount: 900,
      });

      const docId = 80006;
      await mockConfig(page, true);
      await mockPaperlessDocument(page, docId, 'Merge Ineligible Doc');
      await mockAutoItemizeDryRun(page, invoiceId);

      await autoItemizePage.goto(invoiceId, docId);
      await autoItemizePage.waitForAnalyzingDone();

      // ── Before assignment: line 0's checkbox is enabled ───────────────────
      await expect(autoItemizePage.lineSelectCheckbox(0)).toBeEnabled();

      // ── Assign line 0 to the seeded work-item budget line ─────────────────
      await autoItemizePage.lineAssignButton(0).click();
      await expect(autoItemizePage.pickerModal).toBeVisible();
      await autoItemizePage.pickerWorkItemSearchInput.fill(`${testPrefix} Merge-Ineligible WI`);
      const wiOption = autoItemizePage.pickerPortalDropdown.getByRole('option', {
        name: `${testPrefix} Merge-Ineligible WI`,
      });
      await wiOption.waitFor({ state: 'visible' });
      await wiOption.click();
      const budgetLineButton = autoItemizePage.pickerBudgetLineRow(
        new RegExp(budgetLineDescription, 'i'),
      );
      await budgetLineButton.waitFor({ state: 'visible' });
      await budgetLineButton.click();
      await expect(autoItemizePage.pickerModal).not.toBeVisible();
      await expect(autoItemizePage.lineAssignedBadge(0)).toBeVisible();

      // ── Line 0's checkbox is now disabled and cannot be part of a selection ──
      const checkbox0 = autoItemizePage.lineSelectCheckbox(0);
      await expect(checkbox0).toBeDisabled();
      await expect(checkbox0).toHaveAttribute(
        'aria-label',
        'Already assigned — cannot be selected for merge',
      );
      await expect(checkbox0).not.toBeChecked();

      // ── Selecting the two still-unassigned lines works normally and does not
      //    involve the assigned line — Merge becomes enabled with just those two. ──
      await autoItemizePage.selectLineForMerge(1);
      await autoItemizePage.selectLineForMerge(2);
      expect(await autoItemizePage.getMergeButtonState()).toBe('enabled');
      await expect(autoItemizePage.selectionActionBar()).toContainText('2 selected');

      void budgetLineId; // seeded for the assignment above; not asserted further here
    } finally {
      if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 7 — Parity smoke on PaperlessInvoiceReviewPage (new-invoice flow)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Scenario 7 — Parity smoke: merge on PaperlessInvoiceReviewPage', () => {
  test('Select 2 unassigned lines → Merge → merged description + aggregated total (new-invoice flow)', async ({
    page,
  }) => {
    const vw = page.viewportSize()?.width ?? 1440;
    if (vw < 600) {
      test.skip(true, 'Functional test — skip on very narrow mobile');
      return;
    }

    await mockPaperlessConfigured(page);
    await mockConfig(page, true);
    await mockCorrespondents(page);
    await mockDocuments(page);
    await mockTags(page);
    await mockLinkedIds(page);
    await mockDocumentDetail(page, PF_MOCK_DOC.id);
    await mockPreview(page);
    // delayMs keeps the merge response pending long enough for the transient
    // loading row (mergingRow) to be deterministically observable below —
    // without it the mocked route resolves synchronously and the assertion
    // races the resolved/merged row (see Scenario 2's identical pattern).
    await mockMergeLines(page, { description: MERGED_DESCRIPTION, delayMs: 150 });

    const reviewPage = await navigateToReviewPage(page);

    const initialCount = await reviewPage.getLineItemCount();
    expect(initialCount).toBe(2);

    await reviewPage.selectLineForMerge(0);
    await reviewPage.selectLineForMerge(1);
    expect(await reviewPage.getMergeButtonState()).toBe('enabled');

    await reviewPage.clickMergeButton();

    // Source rows removed, loading row inserted.
    await expect(page.locator('[role="list"] li[class*="lineCard"]')).toHaveCount(1);
    await expect(reviewPage.mergingRow).toBeVisible();

    await reviewPage.waitForMergedRow();
    await expect(reviewPage.lineDescription(0)).toHaveValue(MERGED_DESCRIPTION);
    await expect(reviewPage.lineTotal(0)).toHaveValue(MERGED_TOTAL);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 8 — @responsive: selection + merge bar at mobile viewport, sticky on scroll
// ─────────────────────────────────────────────────────────────────────────────

test.describe(
  'Scenario 8 — Mobile: selection + sticky merge bar after scrolling',
  { tag: '@responsive' },
  () => {
    test('At mobile viewport, selecting 2 lines shows an enabled Merge button that stays in view after scrolling', async ({
      page,
      testPrefix,
    }) => {
      const vw = page.viewportSize()?.width ?? 1440;
      if (vw >= 600) {
        test.skip(true, 'Mobile-only scenario — desktop/tablet covered by Scenario 1');
        return;
      }

      const autoItemizePage = new AutoItemizePage(page);
      let vendorId = '';
      let invoiceId = '';

      try {
        vendorId = await createVendorViaApi(page, { name: `${testPrefix} Merge-Mobile Vendor` });
        invoiceId = await createInvoiceViaApi(page, vendorId, {
          amount: 1760,
          date: '2026-06-01',
          invoiceNumber: `${testPrefix}-MERGE-MOBILE-001`,
        });

        const docId = 80008;
        await mockConfig(page, true);
        await mockPaperlessDocument(page, docId, 'Merge Mobile Doc');
        await mockAutoItemizeDryRun(page, invoiceId);

        await autoItemizePage.goto(invoiceId, docId);
        await autoItemizePage.waitForAnalyzingDone();

        expect(await autoItemizePage.getMergeButtonState()).toBe('hidden');

        await autoItemizePage.selectLineForMerge(0);
        expect(await autoItemizePage.getMergeButtonState()).toBe('disabled');

        await autoItemizePage.selectLineForMerge(1);
        expect(await autoItemizePage.getMergeButtonState()).toBe('enabled');

        // ── Scroll the line list down; the sticky action bar stays in view ────
        await autoItemizePage.lineRow(3).scrollIntoViewIfNeeded();
        await expect(autoItemizePage.selectionActionBar()).toBeInViewport();
        await expect(autoItemizePage.mergeButton).toBeInViewport();
      } finally {
        if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
        if (vendorId) await deleteVendorViaApi(page, vendorId);
      }
    });
  },
);
