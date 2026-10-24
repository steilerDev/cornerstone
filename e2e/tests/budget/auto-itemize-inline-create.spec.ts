/**
 * E2E tests for Bug A (#1737), rebuilt on the cost line grid in #2235: Split with AI creates a NEW
 * cost line for a row that has a task or purchase under "Belongs to" - but only when Save is
 * clicked.
 *
 * Before fix #1737 the line was created the moment it was chosen. Now choosing the task only
 * marks the row: no API call is made until the outer Save button is clicked (the old picker
 * modal, the "Creating New" badge and the inline form are gone).
 *
 * Scenarios:
 *   1. [smoke] Happy path: pick the task under Belongs to + a category -> edit the description
 *              -> Save -> POST /api/work-items/:id/budgets called with correct amounts
 *              -> POST /api/invoices/:id/auto-itemize (commit) called
 *              -> navigate to invoice detail -> verify API state.
 *   2. Cancel after choosing the task: the discard dialog appears, discarding creates nothing.
 *   3. Clearing "Belongs to" restores the empty picker and creates nothing.
 *   4. Regression test for bug #1833: retry Save after a REAL commit failure
 *              (ITEMIZED_SUM_EXCEEDS_INVOICE) reuses the already-created WI budget
 *              line instead of creating a duplicate.
 *
 * Mocking strategy:
 *   - GET /api/config: intercepted to inject autoItemizeEnabled: true.
 *   - POST /api/invoices/:id/auto-itemize (dry-run): intercepted to return one deterministic
 *     line (VAT-inclusive, totalAmount=200, description "Test Line").
 *   - GET /paperless/documents/:docId: intercepted to return a stub document.
 *   - POST /api/invoices/:id/auto-itemize (commit) and POST /api/work-items/:id/budgets: real API
 *     (the latter is captured for payload assertions).
 *   - Absence assertions (Scenarios 2 & 3): verify POST /api/work-items/:id/budgets was NEVER
 *     called using page.on('request', ...) counting.
 *
 * Invoice amount is set to 200 (>= the gross of a 200 VAT-inclusive line), so the server's
 * sum guard does not reject the commit.
 *
 * All tests skip on mobile viewports (<600px) - Split with AI is a desktop/tablet functional flow.
 */

import { test, expect } from '../../fixtures/auth.js';
import { AutoItemizePage } from '../../pages/AutoItemizePage.js';
import {
  createBudgetSourceViaApi,
  deleteBudgetSourceViaApi,
  createWorkItemViaApi,
  deleteWorkItemViaApi,
} from '../../fixtures/apiHelpers.js';
import { API } from '../../fixtures/testData.js';
import type { Page, Route } from '@playwright/test';
import { defined } from '../../fixtures/assertions.js';

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

/**
 * Link a Paperless-ngx document to an invoice via POST /api/document-links.
 * The auto-itemize commit endpoint requires the paperlessDocumentId to be linked
 * to the invoice in document_links before it will accept the commit.
 */
async function linkDocumentToInvoiceViaApi(
  page: Page,
  invoiceId: string,
  paperlessDocumentId: number,
): Promise<void> {
  const resp = await page.request.post('/api/document-links', {
    data: { entityType: 'invoice', entityId: invoiceId, paperlessDocumentId },
  });
  expect(
    resp.ok(),
    `POST /api/document-links failed ${resp.status()}: ${await resp.text().catch(() => '')}`,
  ).toBeTruthy();
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock helpers
// ─────────────────────────────────────────────────────────────────────────────

/** One deterministic VAT-inclusive line at €200 — used in all three scenarios. */
const TEST_LINE = {
  description: 'Test Line',
  quantity: 1,
  unit: null,
  unitPrice: null,
  totalAmount: 200,
  includesVat: true,
  vatRate: null,
  vendorName: null,
  confidence: 0.92,
  budgetSourceId: null,
  budgetCategoryId: null,
};

/** Intercept GET /api/config to inject autoItemizeEnabled: true. */
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
 * Intercept dry-run POST /api/invoices/:id/auto-itemize to return TEST_LINE.
 * Commit calls (dryRun: false) are allowed through to the real server.
 */
async function mockDryRun(page: Page, invoiceId: string): Promise<void> {
  await page.route(`**/api/invoices/${invoiceId}/auto-itemize`, async (route: Route) => {
    const body = route.request().postDataJSON() as { dryRun: boolean } | null;
    if (body?.dryRun) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ lines: [TEST_LINE], warnings: [] }),
      });
    } else {
      // Commit path — allow through to real server (Scenario 1) or
      // return a minimal mock (Scenarios 2 & 3 where Save is not pressed).
      await route.continue();
    }
  });
}

/**
 * Intercept GET /paperless/documents/:docId.
 * Prevents network errors when no real Paperless server is running.
 */
async function mockPaperlessDocument(page: Page, docId: number): Promise<void> {
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
          title: `Mock Invoice ${docId}`,
          content: 'Sample OCR content',
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
 * Navigate to AutoItemizePage and wait for the dry-run to complete.
 * Registers the waitForResponse listener BEFORE navigation (critical race avoidance).
 */
async function navigateAndWaitForDryRun(
  page: Page,
  autoItemizePage: AutoItemizePage,
  invoiceId: string,
  docId: number,
): Promise<void> {
  const dryRunDonePromise = page.waitForResponse(
    (resp) =>
      resp.url().includes(`/api/invoices/${invoiceId}/auto-itemize`) &&
      resp.request().method() === 'POST' &&
      resp.status() === 200,
  );
  await page.goto(`/budget/invoices/${invoiceId}/auto-itemize/${docId}`);
  await dryRunDonePromise;
  await autoItemizePage.waitForAnalyzingDone();
}

/**
 * Mark row 1 as "create a new cost line on this work item": pick the work item under Belongs to
 * and a cost category (a row that creates a line needs one). Pass `budgetSourceId` for any flow
 * that saves: the Funding source otherwise defaults to Discretionary.
 */
async function queueCreateNew(
  page: Page,
  autoItemizePage: AutoItemizePage,
  workItemTitle: string,
  budgetSourceId?: string,
): Promise<void> {
  await autoItemizePage.grid.targetPicker(1).pick(workItemTitle);
  await expect(autoItemizePage.grid.row(1)).toContainText(workItemTitle);
  await autoItemizePage.lineCategory(0).selectOption({ index: 1 });

  if (budgetSourceId) {
    const sourceSelect = autoItemizePage.lineFundingSource(0);
    await sourceSelect.selectOption(budgetSourceId);
    await expect(sourceSelect).toHaveValue(budgetSourceId);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: Happy path — queue create-new, Save, verify API calls
// ─────────────────────────────────────────────────────────────────────────────

test(
  'Scenario 1 [smoke]: choosing a task under Belongs to; Save creates the WI cost line and the invoice link with correct amounts',
  { tag: '@smoke' },
  async ({ page, testPrefix }) => {
    const vw = page.viewportSize()?.width ?? 1440;
    if (vw < 600) {
      test.skip(true, 'Functional test — desktop/tablet only (≥600px)');
      return;
    }

    test.setTimeout(60_000);

    const autoItemizePage = new AutoItemizePage(page);
    let vendorId = '';
    let invoiceId = '';
    let workItemId = '';
    let budgetSourceId = '';

    try {
      vendorId = await createVendorViaApi(page, `${testPrefix} AIQ-S1 Vendor`);
      invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 200,
        date: '2026-06-01',
        invoiceNumber: `${testPrefix}-AIQ-S1`,
      });
      workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} AIQ-S1 WI` });
      budgetSourceId = await createBudgetSourceViaApi(page, {
        name: `${testPrefix} AIQ-S1 Source`,
        totalAmount: 100000,
      });

      const docId = 130001;
      // Link the Paperless document to the invoice so the auto-itemize commit
      // endpoint can verify the document is associated with this invoice.
      await linkDocumentToInvoiceViaApi(page, invoiceId, docId);
      await mockConfigEnabled(page);
      await mockDryRun(page, invoiceId);
      await mockPaperlessDocument(page, docId);

      await navigateAndWaitForDryRun(page, autoItemizePage, invoiceId, docId);

      // ── Verify initial state: Belongs to is empty (nothing will be created) ─────
      await expect(autoItemizePage.lineTarget(0)).toBeVisible();
      await expect(autoItemizePage.lineTarget(0)).toHaveValue('');

      // ── Choose the task (and category / funding source) ──────────────────────
      await queueCreateNew(page, autoItemizePage, `${testPrefix} AIQ-S1 WI`, budgetSourceId);

      // ── Edit the description in the row ──────────────────────────────────────
      const editedDesc = `${testPrefix} AIQ-S1 Edited Desc`;
      await autoItemizePage.lineDescription(0).fill(editedDesc);

      // ── Intercept POST /api/work-items/:id/budgets to capture payload ─────────
      // Registered BEFORE saveButton.click() to avoid race with fast server.
      let capturedWIBudgetPayload: Record<string, unknown> | null = null;
      const wiCreatePromise = page.waitForResponse(async (resp) => {
        if (
          resp.url().includes(`/api/work-items/${workItemId}/budgets`) &&
          resp.request().method() === 'POST' &&
          resp.ok()
        ) {
          capturedWIBudgetPayload = (await resp.request().postDataJSON()) as Record<
            string,
            unknown
          >;
          return true;
        }
        return false;
      });

      // ── Intercept POST /api/invoices/:id/auto-itemize (commit) ───────────────
      // The commit call (dryRun:false) is the terminal server-side step. After this
      // succeeds, handleSave navigates to the invoice detail page.
      // NOTE: resp.ok() is intentionally NOT in the predicate — if the server returns
      // a non-200, we want to catch the response and fail loudly with the status+body
      // rather than timing out opaquely waiting for a successful response that never comes.
      const commitPromise = page.waitForResponse(
        (resp) =>
          resp.url().includes(`/api/invoices/${invoiceId}/auto-itemize`) &&
          resp.request().method() === 'POST' &&
          !(resp.request().postDataJSON() as { dryRun?: boolean })?.dryRun,
        { timeout: 30000 },
      );

      // ── Click Save ────────────────────────────────────────────────────────────
      await autoItemizePage.saveButton.click();

      // Await WI budget creation and the auto-itemize commit in parallel.
      // Note: handleSave also calls POST /api/invoices/:id/budget-lines to create the
      // junction row client-side. We do not assert on that call here because the
      // server's assign-existing path handles both cases (junction pre-created or not).
      const [, commitResp] = await Promise.all([wiCreatePromise, commitPromise]);

      // Assert the commit succeeded — loud failure if server returned an error.
      if (!commitResp.ok()) {
        const bodyText = await commitResp.text().catch(() => '<no body>');
        throw new Error(`auto-itemize commit returned ${commitResp.status()}: ${bodyText}`);
      }

      // ── Verify WI budget payload ──────────────────────────────────────────────
      // plannedAmount = 200 (VAT-inclusive, stored NET which equals GROSS here)
      expect(capturedWIBudgetPayload).not.toBeNull();
      expect(capturedWIBudgetPayload!.plannedAmount).toBe(200);
      expect(capturedWIBudgetPayload!.includesVat).toBe(true);

      // ── Assert: navigated back to invoice detail ──────────────────────────────
      await expect(page).toHaveURL(/\/budget\/invoices\/[^/]+$/);
      expect(page.url()).not.toContain('auto-itemize');

      // ── Verify via API: budget line exists under the work item ────────────────
      // plannedAmount = 200 (NET stored — for VAT-inclusive lines, net == gross)
      // actualCost    = 200 (GROSS itemized amount from the invoice junction row)
      const listResp = await page.request.get(`${API.workItems}/${workItemId}/budgets`);
      expect(listResp.ok(), `GET /api/work-items/${workItemId}/budgets failed`).toBeTruthy();
      const listBody = (await listResp.json()) as {
        budgets: Array<{ plannedAmount: number; actualCost: number }>;
      };
      expect(
        listBody.budgets.length,
        `Expected 1 budget line under WI ${workItemId}, got ${listBody.budgets.length}`,
      ).toBe(1);
      const budget = defined(listBody.budgets[0], 'budget line');
      expect(
        budget.plannedAmount,
        `Expected plannedAmount≈200 but was ${budget.plannedAmount}`,
      ).toBeCloseTo(200, 2);
      // actualCost = itemizedAmount from the invoice junction row = 200 (VAT-incl, gross = net)
      expect(
        budget.actualCost,
        `Expected actualCost≈200 (invoice link created, itemizedAmount=200) but was ${budget.actualCost}`,
      ).toBeCloseTo(200, 2);
    } finally {
      if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
      if (budgetSourceId) await deleteBudgetSourceViaApi(page, budgetSourceId);
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: Cancel-after-queue — no API call ever fired
// ─────────────────────────────────────────────────────────────────────────────

test('Scenario 2: cancel after choosing a task navigates away without creating any cost line', async ({
  page,
  testPrefix,
}) => {
  const vw = page.viewportSize()?.width ?? 1440;
  if (vw < 600) {
    test.skip(true, 'Functional test — desktop/tablet only (≥600px)');
    return;
  }

  test.slow();

  const autoItemizePage = new AutoItemizePage(page);
  let vendorId = '';
  let invoiceId = '';
  let workItemId = '';

  // Track whether the WI budget POST was ever called
  let wiCreateCallCount = 0;
  try {
    vendorId = await createVendorViaApi(page, `${testPrefix} AIQ-S2 Vendor`);
    invoiceId = await createInvoiceViaApi(page, vendorId, {
      amount: 200,
      date: '2026-06-01',
    });
    workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} AIQ-S2 WI` });

    const docId = 130002;
    await mockConfigEnabled(page);
    await mockDryRun(page, invoiceId);
    await mockPaperlessDocument(page, docId);

    // Monitor any POST to /api/work-items/:id/budgets
    page.on('request', (req) => {
      if (req.url().includes(`/api/work-items/${workItemId}/budgets`) && req.method() === 'POST') {
        wiCreateCallCount++;
      }
    });

    await navigateAndWaitForDryRun(page, autoItemizePage, invoiceId, docId);

    // ── Choose the task for the row ───────────────────────────────────────────
    await queueCreateNew(page, autoItemizePage, `${testPrefix} AIQ-S2 WI`);

    // ── Click Cancel (the page is dirty after the edit) ───────────────────────
    // Cancel shows the "Discard changes?" confirmation modal.
    await autoItemizePage.cancelButton.click();
    await expect(autoItemizePage.cancelModal).toBeVisible();

    // ── Click "Discard Changes" to confirm navigation away ───────────────────
    await autoItemizePage.discardButton.click();
    await expect(page).toHaveURL(/\/budget\/invoices\/[^/]+$/);
    expect(page.url()).not.toContain('auto-itemize');

    // ── Assert: no POST to WI budgets was ever fired ──────────────────────────
    expect(
      wiCreateCallCount,
      `Expected POST /api/work-items/${workItemId}/budgets to NOT be called after cancel, got ${wiCreateCallCount} call(s)`,
    ).toBe(0);

    // ── Verify via API: work item has no budget lines ─────────────────────────
    const listResp = await page.request.get(`${API.workItems}/${workItemId}/budgets`);
    expect(listResp.ok()).toBeTruthy();
    const listBody = (await listResp.json()) as { budgets: Array<unknown> };
    expect(
      listBody.budgets.length,
      `Expected 0 budget lines under WI ${workItemId} after cancel, got ${listBody.budgets.length}`,
    ).toBe(0);
  } finally {
    if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
    if (vendorId) await deleteVendorViaApi(page, vendorId);
    if (workItemId) await deleteWorkItemViaApi(page, workItemId);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: Discard inline — form hides, Assign button returns
// ─────────────────────────────────────────────────────────────────────────────

test('Scenario 3: clearing Belongs to restores the empty picker without creating anything', async ({
  page,
  testPrefix,
}) => {
  const vw = page.viewportSize()?.width ?? 1440;
  if (vw < 600) {
    test.skip(true, 'Functional test — desktop/tablet only (≥600px)');
    return;
  }

  test.slow();

  const autoItemizePage = new AutoItemizePage(page);
  let vendorId = '';
  let invoiceId = '';
  let workItemId = '';

  // Track whether the WI budget POST was ever called
  let wiCreateCallCount = 0;
  try {
    vendorId = await createVendorViaApi(page, `${testPrefix} AIQ-S3 Vendor`);
    invoiceId = await createInvoiceViaApi(page, vendorId, {
      amount: 200,
      date: '2026-06-01',
    });
    workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} AIQ-S3 WI` });

    const docId = 130003;
    await mockConfigEnabled(page);
    await mockDryRun(page, invoiceId);
    await mockPaperlessDocument(page, docId);

    // Monitor any POST to /api/work-items/:id/budgets
    page.on('request', (req) => {
      if (req.url().includes(`/api/work-items/${workItemId}/budgets`) && req.method() === 'POST') {
        wiCreateCallCount++;
      }
    });

    await navigateAndWaitForDryRun(page, autoItemizePage, invoiceId, docId);

    // ── Choose the task for the row ───────────────────────────────────────────
    await queueCreateNew(page, autoItemizePage, `${testPrefix} AIQ-S3 WI`);
    await expect(autoItemizePage.grid.row(1)).toContainText(`${testPrefix} AIQ-S3 WI`);

    // ── Clear the choice ──────────────────────────────────────────────────────
    await autoItemizePage.grid
      .row(1)
      .getByRole('button', { name: 'Clear selection', exact: true })
      .click();

    // ── Assert: the empty Belongs to picker is back ───────────────────────────
    await expect(autoItemizePage.lineTarget(0)).toBeVisible();
    await expect(autoItemizePage.lineTarget(0)).toHaveValue('');

    // ── Assert: still on the AutoItemizePage ─────────────────────────────────
    await expect(autoItemizePage.pageTitle).toBeVisible();

    // ── Assert: no WI budget POST was fired ──────────────────────────────────
    expect(
      wiCreateCallCount,
      `Expected POST /api/work-items/${workItemId}/budgets to NOT be called after Discard, got ${wiCreateCallCount} call(s)`,
    ).toBe(0);
  } finally {
    if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
    if (vendorId) await deleteVendorViaApi(page, vendorId);
    if (workItemId) await deleteWorkItemViaApi(page, workItemId);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4 — Regression test for bug #1833: retrying Save after a REAL commit
// failure does not create a duplicate WI budget line.
//
// Before the fix, `materializeInlineDrafts` created the WI budget line via a
// separate POST before the atomic auto-itemize commit call. If the commit then
// failed, the fact that the WI budget line had already been created was never
// written back into page state — so a Save retry re-ran materialization from
// scratch and created a SECOND WI budget line.
//
// This test triggers a genuine server-side 400 (ITEMIZED_SUM_EXCEEDS_INVOICE) by
// setting the invoice amount below the queued line's total, then fixes the
// invoice amount and retries. No commit/preview mocking of the failure — the
// commit call always continues to the real server (see mockDryRun).
// ─────────────────────────────────────────────────────────────────────────────

test('Scenario 4: retrying Save after a real commit failure reuses the already-created WI budget line, not a duplicate (Bug #1833)', async ({
  page,
  testPrefix,
}) => {
  const vw = page.viewportSize()?.width ?? 1440;
  if (vw < 600) {
    test.skip(true, 'Functional test — desktop/tablet only (≥600px)');
    return;
  }

  test.setTimeout(60_000);

  const autoItemizePage = new AutoItemizePage(page);
  let vendorId = '';
  let invoiceId = '';
  let workItemId = '';
  let budgetSourceId = '';

  // Track every POST to the WI-budgets endpoint across BOTH save attempts.
  let wiCreateCallCount = 0;

  try {
    vendorId = await createVendorViaApi(page, `${testPrefix} AIQ-S4 Vendor`);
    // Invoice amount (100) is deliberately LESS than TEST_LINE.totalAmount (200,
    // VAT-inclusive) so the real server-side Σ-guard rejects the first commit
    // attempt with ITEMIZED_SUM_EXCEEDS_INVOICE (400) — a genuine validation
    // error, not a mocked one.
    invoiceId = await createInvoiceViaApi(page, vendorId, {
      amount: 100,
      date: '2026-06-01',
      invoiceNumber: `${testPrefix}-AIQ-S4`,
    });
    workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} AIQ-S4 WI` });
    budgetSourceId = await createBudgetSourceViaApi(page, {
      name: `${testPrefix} AIQ-S4 Source`,
      totalAmount: 100000,
    });

    const docId = 130004;
    await linkDocumentToInvoiceViaApi(page, invoiceId, docId);
    await mockConfigEnabled(page);
    await mockDryRun(page, invoiceId); // commit path (dryRun:false) continues to the real server
    await mockPaperlessDocument(page, docId);

    page.on('request', (req) => {
      if (req.url().includes(`/api/work-items/${workItemId}/budgets`) && req.method() === 'POST') {
        wiCreateCallCount++;
      }
    });

    await navigateAndWaitForDryRun(page, autoItemizePage, invoiceId, docId);

    // ── Choose the task for the row ───────────────────────────────────────────
    await queueCreateNew(page, autoItemizePage, `${testPrefix} AIQ-S4 WI`, budgetSourceId);

    // ── First Save: materialize succeeds (real WI budget POST), commit fails ──
    const firstWiCreatePromise = page.waitForResponse(
      (resp) =>
        resp.url().includes(`/api/work-items/${workItemId}/budgets`) &&
        resp.request().method() === 'POST' &&
        resp.ok(),
    );
    const firstCommitPromise = page.waitForResponse(
      (resp) =>
        resp.url().includes(`/api/invoices/${invoiceId}/auto-itemize`) &&
        resp.request().method() === 'POST' &&
        !(resp.request().postDataJSON() as { dryRun?: boolean })?.dryRun,
      { timeout: 30000 },
    );

    await autoItemizePage.saveButton.click();
    const [, firstCommitResp] = await Promise.all([firstWiCreatePromise, firstCommitPromise]);

    // ── Assert: the real server genuinely rejected the commit ────────────────
    expect(
      firstCommitResp.status(),
      `Expected first commit to fail with 400 ITEMIZED_SUM_EXCEEDS_INVOICE, got ${firstCommitResp.status()}`,
    ).toBe(400);
    const firstCommitBody = (await firstCommitResp.json()) as { error?: { code?: string } };
    expect(firstCommitBody.error?.code).toBe('ITEMIZED_SUM_EXCEEDS_INVOICE');

    // ── Assert: error banner visible, page did NOT navigate ──────────────────
    await expect(autoItemizePage.errorBanner).toBeVisible();
    expect(page.url()).toContain('auto-itemize');

    // ── Assert (#2149): the materialized row now renders as a linked, read-only row ──
    await expect(autoItemizePage.lineExistingLabel(0)).toBeVisible();
    await expect(autoItemizePage.lineDescription(0)).toHaveCount(0);

    // ── Assert: exactly one WI-budgets POST fired so far ─────────────────────
    expect(
      wiCreateCallCount,
      `Expected exactly 1 WI-budgets POST after the first (failed) Save, got ${wiCreateCallCount}`,
    ).toBe(1);

    // ── Fix the failure: raise the invoice amount above the line total (200) ──
    await autoItemizePage.totalAmountInput.fill('250');

    // ── Second Save: commit should now succeed WITHOUT a second WI-budgets POST ──
    const secondCommitPromise = page.waitForResponse(
      (resp) =>
        resp.url().includes(`/api/invoices/${invoiceId}/auto-itemize`) &&
        resp.request().method() === 'POST' &&
        !(resp.request().postDataJSON() as { dryRun?: boolean })?.dryRun,
      { timeout: 30000 },
    );

    await autoItemizePage.saveButton.click();
    const secondCommitResp = await secondCommitPromise;

    if (!secondCommitResp.ok()) {
      const bodyText = await secondCommitResp.text().catch(() => '<no body>');
      throw new Error(`Retry commit returned ${secondCommitResp.status()}: ${bodyText}`);
    }

    // ── Assert: navigated to invoice detail ───────────────────────────────────
    await expect(page).toHaveURL(/\/budget\/invoices\/[^/]+$/);
    expect(page.url()).not.toContain('auto-itemize');

    // ── Regression guard: WI-budgets POST count did NOT increase on retry ─────
    expect(
      wiCreateCallCount,
      `Expected WI-budgets POST count to remain 1 after the retry (no duplicate create), got ${wiCreateCallCount}`,
    ).toBe(1);

    // ── Verify via API: exactly 1 budget line exists under the work item ─────
    const listResp = await page.request.get(`${API.workItems}/${workItemId}/budgets`);
    expect(listResp.ok(), `GET /api/work-items/${workItemId}/budgets failed`).toBeTruthy();
    const listBody = (await listResp.json()) as { budgets: Array<{ id: string }> };
    expect(
      listBody.budgets.length,
      `Expected exactly 1 budget line under WI ${workItemId} after retry, got ${listBody.budgets.length}`,
    ).toBe(1);
  } finally {
    if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
    if (vendorId) await deleteVendorViaApi(page, vendorId);
    if (workItemId) await deleteWorkItemViaApi(page, workItemId);
    if (budgetSourceId) await deleteBudgetSourceViaApi(page, budgetSourceId);
  }
});
