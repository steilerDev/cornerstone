/**
 * E2E tests for Issue #1547: Auto-itemize invoices from Paperless OCR documents.
 *
 * ⚠️  IMPORTANT — Story #1564 (auto-itemize UX redesign) removed the modal-based
 * flow that many tests in this file exercise:
 *   - AutoItemizePreviewModal → REMOVED
 *   - DocumentPickerModal → REMOVED
 *   - "Auto-itemize" button in InvoiceBudgetLinesSection → REMOVED
 *
 * The new page-based flow is covered in:
 *   e2e/tests/invoices/invoice-auto-itemize-page.spec.ts
 *
 * The tests below that reference removed UI (modal, picker, button in budget lines)
 * will FAIL after story #1564 lands and are marked `@legacy-modal`.
 * They are preserved here for historical reference but should be removed once
 * story #1564 is fully merged to main and the old UI is confirmed gone.
 *
 * Tests NOT referencing the removed modal UI (e.g. the config-mocking helpers)
 * remain valid and are exercised by the new spec file above.
 *
 * AC19 and related acceptance criteria (original story #1547):
 *   - Button visibility conditions (autoItemizeEnabled, linked docs)
 *   - Single-doc auto-select → dry-run → preview modal  [REMOVED in #1564]
 *   - Multi-doc picker → select → preview modal          [REMOVED in #1564]
 *   - Editing lines in preview modal, then applying      [REMOVED in #1564]
 *   - Empty state when no lines detected                 [REMOVED in #1564]
 *   - Total mismatch warning banner                      [now in AutoItemizePage]
 *   - ITEMIZED_SUM_EXCEEDS_INVOICE error inline in modal [REMOVED in #1564]
 *   - LLM_UNREACHABLE / 502 error → error toast, no modal [now in AutoItemizePage]
 *   - After apply: Unassigned pills rendered; "Assign…"  [REMOVED in #1564]
 *
 * Mocking strategy:
 *   - POST /api/invoices/:id/auto-itemize: intercepted via page.route() on every test.
 *     Dry-run vs commit is discriminated by the `dryRun` field in the request body.
 *   - GET /api/config: intercepted to inject autoItemizeEnabled: true while preserving
 *     other fields (currency) from the real server response.
 *   - GET /api/document-links: intercepted to return deterministic linked-document
 *     fixtures so tests do not depend on a running Paperless-ngx container.
 *
 * Setup conventions (same as budget-line-assign.spec.ts):
 *   - Vendor + invoice created via REST API helpers.
 *   - All resources cleaned up in finally blocks.
 *   - testPrefix isolates data across parallel workers.
 *   - waitForResponse BEFORE actions that trigger network calls.
 */

import { test, expect } from '../../fixtures/auth.js';
import { InvoiceDetailPage } from '../../pages/InvoiceDetailPage.js';
import { createWorkItemViaApi, deleteWorkItemViaApi } from '../../fixtures/apiHelpers.js';
import { API } from '../../fixtures/testData.js';
import type { Page, Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Inline REST helpers (same pattern as budget-line-assign.spec.ts)
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
// Mock fixtures — deterministic document links and extraction responses
// ─────────────────────────────────────────────────────────────────────────────

/** Fake document link metadata returned from GET /api/document-links */
function makeDocLink(opts: { linkId: string; docId: number; title: string }) {
  return {
    id: opts.linkId,
    entityType: 'invoice',
    entityId: 'placeholder',
    paperlessDocumentId: opts.docId,
    createdBy: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    document: {
      id: opts.docId,
      title: opts.title,
      content: null,
      tags: [],
      created: '2026-01-01',
      added: '2026-01-01T00:00:00.000Z',
      modified: '2026-01-01T00:00:00.000Z',
      correspondent: 'Test Vendor GmbH',
      documentType: null,
      archiveSerialNumber: null,
      originalFileName: `invoice-${opts.docId}.pdf`,
    },
  };
}

/** Three extracted lines returned by dry-run */
const THREE_EXTRACTED_LINES = [
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
];

/** Dry-run response shape for 3 lines */
function makeDryRunResponse(warnings: object[] = []) {
  return {
    lines: THREE_EXTRACTED_LINES,
    warnings,
  };
}

/** Commit response shape (append mode returns updated budget lines list) */
function makeCommitResponse(invoiceId: string) {
  const now = '2026-05-21T00:00:00.000Z';
  return {
    budgetLines: THREE_EXTRACTED_LINES.map((line, idx) => ({
      id: `ibl-e2e-auto-${idx + 1}`,
      workItemBudgetId: `wib-e2e-auto-${idx + 1}`,
      householdItemBudgetId: null,
      itemizedAmount: line.totalAmount,
      description: line.description,
      plannedAmount: line.totalAmount,
      confidence: 'invoice',
      budgetCategory: null,
      budgetSource: null,
      vendor: null,
      quantity: line.quantity,
      unit: line.unit,
      unitPrice: line.unitPrice,
      includesVat: line.includesVat,
      createdAt: now,
      updatedAt: now,
      invoiceId,
      origin: 'auto',
      workItem: null,
      householdItem: null,
      isUnassigned: true,
    })),
    remainingAmount: 300.0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Route-intercept helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Intercept GET /api/config to inject autoItemizeEnabled: true.
 * Preserves currency from the real server response.
 */
async function mockConfigEnabled(page: Page): Promise<void> {
  await page.route('**/api/config', async (route: Route) => {
    // Fetch the real response to preserve other fields like currency
    try {
      const realResp = await route.fetch();
      const realBody = (await realResp.json()) as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...realBody, autoItemizeEnabled: true }),
      });
    } catch {
      // Fallback if real request fails
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ currency: 'EUR', autoItemizeEnabled: true }),
      });
    }
  });
}

/**
 * Intercept GET /api/config to inject autoItemizeEnabled: false.
 */
async function mockConfigDisabled(page: Page): Promise<void> {
  await page.route('**/api/config', async (route: Route) => {
    try {
      const realResp = await route.fetch();
      const realBody = (await realResp.json()) as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...realBody, autoItemizeEnabled: false }),
      });
    } catch {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ currency: 'EUR', autoItemizeEnabled: false }),
      });
    }
  });
}

/**
 * Intercept GET /api/document-links to return a deterministic set of document links.
 * Filters to entityType=invoice&entityId=<invoiceId> for precision.
 */
async function mockDocumentLinks(
  page: Page,
  invoiceId: string,
  docs: { linkId: string; docId: number; title: string }[],
): Promise<void> {
  await page.route(
    (url) =>
      url.pathname.endsWith('/api/document-links') &&
      url.searchParams.get('entityType') === 'invoice' &&
      url.searchParams.get('entityId') === invoiceId,
    async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          documentLinks: docs.map((d) => makeDocLink({ ...d, linkId: d.linkId })),
        }),
      });
    },
  );
}

/**
 * Intercept POST /api/invoices/:id/auto-itemize.
 * Discriminates dry-run vs commit by the `dryRun` field in the request body.
 *
 * - dryRun: true  → returns dryRunBody (default: makeDryRunResponse())
 * - dryRun: false → returns commitBody (default: makeCommitResponse(invoiceId))
 */
async function mockAutoItemize(
  page: Page,
  invoiceId: string,
  opts: {
    dryRunBody?: object;
    commitBody?: object;
    dryRunStatus?: number;
    commitStatus?: number;
  } = {},
): Promise<void> {
  const dryRunBody = opts.dryRunBody ?? makeDryRunResponse();
  const commitBody = opts.commitBody ?? makeCommitResponse(invoiceId);
  const dryRunStatus = opts.dryRunStatus ?? 200;
  const commitStatus = opts.commitStatus ?? 200;

  await page.route(`**/api/invoices/${invoiceId}/auto-itemize`, async (route: Route) => {
    const reqBody = route.request().postDataJSON() as { dryRun: boolean };
    if (reqBody.dryRun) {
      await route.fulfill({
        status: dryRunStatus,
        contentType: 'application/json',
        body: JSON.stringify(dryRunBody),
      });
    } else {
      await route.fulfill({
        status: commitStatus,
        contentType: 'application/json',
        body: JSON.stringify(commitBody),
      });
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: Auto-itemize button visibility
// ─────────────────────────────────────────────────────────────────────────────
//
// NOTE (#1564): The "Auto-itemize" button in the budget lines section header was
// REMOVED in story #1564. The first test below checks for presence of this button
// and is now skipped. The replacement coverage is in invoice-auto-itemize-page.spec.ts
// (Scenarios 1 & 2: Itemize button on LinkedDocumentCard).
// The other two tests in this group (absence assertions) remain valid.

test.describe(
  'Auto-itemize button visibility (Scenario 1)',
  { tag: ['@smoke', '@responsive'] },
  () => {
    test(
      '[SKIPPED #1564] Auto-itemize button is visible when autoItemizeEnabled=true AND a document is linked',
      { tag: ['@smoke', '@legacy-modal'] },
      async ({ page, testPrefix }) => {
        // Skipped: The "Auto-itemize" button in InvoiceBudgetLinesSection was removed in
        // story #1564. The new entry point is the "Itemize" button on LinkedDocumentCard.
        // Replacement: e2e/tests/invoices/invoice-auto-itemize-page.spec.ts Scenario 1.
        test.skip(true, 'Removed in story #1564: button moved to LinkedDocumentCard');

        const detailPage = new InvoiceDetailPage(page);
        let vendorId = '';
        let invoiceId = '';

        try {
          vendorId = await createVendorViaApi(page, `${testPrefix} AI-Vis Vendor`);
          invoiceId = await createInvoiceViaApi(page, vendorId, {
            amount: 1700,
            date: '2026-06-01',
            invoiceNumber: `${testPrefix}-AI-VIS-001`,
          });

          // Mock: config has autoItemizeEnabled=true
          await mockConfigEnabled(page);

          // Mock: one document is linked to this invoice
          await mockDocumentLinks(page, invoiceId, [
            { linkId: 'dl-e2e-1', docId: 42001, title: 'Invoice Doc 1' },
          ]);

          await detailPage.goto(invoiceId);
          await expect(detailPage.heading).toBeVisible();

          // The Auto-itemize button must be visible in the budget lines section header
          const autoItemizeBtn = detailPage.getAutoItemizeButton();
          await expect(autoItemizeBtn).toBeVisible();
        } finally {
          if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
          if (vendorId) await deleteVendorViaApi(page, vendorId);
        }
      },
    );

    test('Auto-itemize button is NOT visible when no document is linked (even if autoItemizeEnabled=true)', async ({
      page,
      testPrefix,
    }) => {
      const detailPage = new InvoiceDetailPage(page);
      let vendorId = '';
      let invoiceId = '';

      try {
        vendorId = await createVendorViaApi(page, `${testPrefix} AI-NoDocs Vendor`);
        invoiceId = await createInvoiceViaApi(page, vendorId, {
          amount: 1000,
          date: '2026-06-01',
        });

        // Config has autoItemizeEnabled=true but NO document links
        await mockConfigEnabled(page);
        await mockDocumentLinks(page, invoiceId, []); // zero docs

        await detailPage.goto(invoiceId);
        await expect(detailPage.heading).toBeVisible();

        // Wait for the section to render (Add Budget Line button should appear)
        await expect(detailPage.pickerAddBudgetLineButton).toBeVisible();

        // The Auto-itemize button must NOT be rendered
        await expect(detailPage.getAutoItemizeButton()).not.toBeVisible();
      } finally {
        if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
        if (vendorId) await deleteVendorViaApi(page, vendorId);
      }
    });

    test('Auto-itemize button is NOT visible when autoItemizeEnabled=false (even if a doc is linked)', async ({
      page,
      testPrefix,
    }) => {
      const detailPage = new InvoiceDetailPage(page);
      let vendorId = '';
      let invoiceId = '';

      try {
        vendorId = await createVendorViaApi(page, `${testPrefix} AI-Disabled Vendor`);
        invoiceId = await createInvoiceViaApi(page, vendorId, {
          amount: 500,
          date: '2026-06-01',
        });

        // Config has autoItemizeEnabled=false but a doc IS linked
        await mockConfigDisabled(page);
        await mockDocumentLinks(page, invoiceId, [
          { linkId: 'dl-e2e-2', docId: 42002, title: 'Invoice Doc 2' },
        ]);

        await detailPage.goto(invoiceId);
        await expect(detailPage.heading).toBeVisible();

        // Wait for the section to render
        await expect(detailPage.pickerAddBudgetLineButton).toBeVisible();

        // The Auto-itemize button must NOT be rendered
        await expect(detailPage.getAutoItemizeButton()).not.toBeVisible();
      } finally {
        if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
        if (vendorId) await deleteVendorViaApi(page, vendorId);
      }
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: Full happy-path flow (AC19)
// SKIPPED (#1564): modal-based flow removed. Replacement: invoice-auto-itemize-page.spec.ts Scenario 3.
// ─────────────────────────────────────────────────────────────────────────────

test.describe.skip('[SKIPPED #1564] Auto-itemize full happy-path flow (Scenario 2 — AC19)', () => {
  test(
    'Click Auto-itemize → preview modal shows 3 rows → edit one → Apply → 3 Unassigned rows appear → Assign one to work item',
    { tag: '@smoke' },
    async ({ page, testPrefix }) => {
      const detailPage = new InvoiceDetailPage(page);
      let vendorId = '';
      let invoiceId = '';
      let workItemId = '';

      try {
        vendorId = await createVendorViaApi(page, `${testPrefix} AI-Happy Vendor`);
        invoiceId = await createInvoiceViaApi(page, vendorId, {
          amount: 1700,
          date: '2026-06-01',
          invoiceNumber: `${testPrefix}-AI-HP-001`,
        });
        workItemId = await createWorkItemViaApi(page, {
          title: `${testPrefix} AI Happy WI`,
        });

        await mockConfigEnabled(page);
        await mockDocumentLinks(page, invoiceId, [
          { linkId: 'dl-e2e-hp1', docId: 43001, title: 'Bathroom Invoice' },
        ]);
        await mockAutoItemize(page, invoiceId);

        await detailPage.goto(invoiceId);
        await expect(detailPage.heading).toBeVisible();

        // ── Click Auto-itemize ────────────────────────────────────────────
        await detailPage.clickAutoItemizeButton();

        // ── Preview modal opens with 3 rows ──────────────────────────────
        const previewModal = detailPage.getAutoItemizePreviewModal();
        await expect(previewModal).toBeVisible();

        // Count input rows in the table body (not the header or totals row)
        // Each data row has a checkbox in the first column
        const rowCheckboxes = previewModal.locator(
          'table tbody tr input[type="checkbox"]:not([aria-label*="Select all"])',
        );
        await expect(rowCheckboxes).toHaveCount(3);

        // ── Edit the first row's description ─────────────────────────────
        await detailPage.editPreviewLineDescription(0, 'Edited bathroom tiles description');

        // Verify the edit was applied in the input
        const firstDescInput = previewModal.locator('table tbody tr input[type="text"]').first();
        await expect(firstDescInput).toHaveValue('Edited bathroom tiles description');

        // ── Apply button is enabled ───────────────────────────────────────
        const applyBtn = previewModal.getByRole('button', { name: 'Apply', exact: true });
        await expect(applyBtn).not.toBeDisabled();

        // ── Click Apply with mode=append ─────────────────────────────────
        // Register waitForResponse BEFORE click
        const applyPromise = page.waitForResponse(
          (resp) =>
            resp.url().includes('/auto-itemize') &&
            resp.request().method() === 'POST' &&
            resp.status() === 200,
        );
        await detailPage.clickApplyButton();
        await applyPromise;

        // ── Modal closes ─────────────────────────────────────────────────
        await expect(previewModal).not.toBeVisible();

        // ── Budget lines section must be re-loaded with the new mock data ─
        // The commit response returns 3 isUnassigned=true lines.
        // We wait for the reload by checking for the Unassigned badge appearance.
        // Note: the actual table data comes from the real API after commit resolves,
        // but since we mocked the commit endpoint (which returns the 3 lines), the
        // component calls loadBudgetLines() after onApplied(). The GET
        // /api/invoices/:id/budget-lines will hit the real server — but since we
        // didn't actually persist anything, we instead verify the page doesn't crash
        // and the modal closed. The Unassigned badge assertion requires real data,
        // so we skip that in this mocked test and instead verify the modal closed
        // cleanly and the budget lines section is still visible.
        await expect(detailPage.budgetLinesSection).toBeVisible();

        // The heading is still visible (page didn't crash or navigate away)
        await expect(detailPage.heading).toBeVisible();

        // Additional integration verification: Assign flow works
        // Since we mocked the commit, we can't assert Unassigned rows were added
        // to the real DB. The full integration path is tested separately below
        // (Scenario 2b) where we seed data and use the real API.
      } finally {
        if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
        if (vendorId) await deleteVendorViaApi(page, vendorId);
        if (workItemId) await deleteWorkItemViaApi(page, workItemId);
      }
    },
  );

  test('After apply, budget lines section is refreshed — page stays stable', async ({
    page,
    testPrefix,
  }) => {
    // Skip on mobile — functional test
    const viewportWidth = page.viewportSize()?.width ?? 1440;
    if (viewportWidth < 1024) {
      test.skip(true, 'Functional test — desktop/tablet only');
      return;
    }

    const detailPage = new InvoiceDetailPage(page);
    let vendorId = '';
    let invoiceId = '';

    try {
      vendorId = await createVendorViaApi(page, `${testPrefix} AI-Refresh Vendor`);
      invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 1700,
        date: '2026-06-01',
      });

      await mockConfigEnabled(page);
      await mockDocumentLinks(page, invoiceId, [
        { linkId: 'dl-e2e-ref1', docId: 44001, title: 'Invoice PDF' },
      ]);

      // Mock dry-run returns 3 lines, commit returns updated list
      await mockAutoItemize(page, invoiceId);

      await detailPage.goto(invoiceId);
      await expect(detailPage.heading).toBeVisible();

      // Trigger the full flow
      await detailPage.clickAutoItemizeButton();
      const previewModal = detailPage.getAutoItemizePreviewModal();
      await expect(previewModal).toBeVisible();

      // Apply without editing
      const applyPromise = page.waitForResponse(
        (resp) =>
          resp.url().includes('/auto-itemize') &&
          resp.request().method() === 'POST' &&
          resp.status() === 200,
      );
      await detailPage.clickApplyButton();
      await applyPromise;

      // Modal closes, page still functional
      await expect(previewModal).not.toBeVisible();
      await expect(detailPage.budgetLinesSection).toBeVisible();
      await expect(detailPage.heading).toBeVisible();
    } finally {
      if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: Document picker when 2+ docs are linked
// SKIPPED (#1564): DocumentPickerModal removed. With the new flow, clicking Itemize
// on a single document card navigates directly to /auto-itemize/:documentId.
// ─────────────────────────────────────────────────────────────────────────────

test.describe.skip('[SKIPPED #1564] Document picker when multiple docs linked (Scenario 3)', () => {
  test('Clicking Auto-itemize with 2 docs opens document picker; selecting one starts dry-run and opens preview', async ({
    page,
    testPrefix,
  }) => {
    // Skip on mobile — functional test
    const viewportWidth = page.viewportSize()?.width ?? 1440;
    if (viewportWidth < 1024) {
      test.skip(true, 'Functional test — desktop/tablet only');
      return;
    }

    const detailPage = new InvoiceDetailPage(page);
    let vendorId = '';
    let invoiceId = '';

    try {
      vendorId = await createVendorViaApi(page, `${testPrefix} AI-Picker Vendor`);
      invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 2500,
        date: '2026-06-01',
      });

      await mockConfigEnabled(page);

      // Two documents linked to this invoice
      await mockDocumentLinks(page, invoiceId, [
        { linkId: 'dl-e2e-pk1', docId: 45001, title: 'Invoice Page 1' },
        { linkId: 'dl-e2e-pk2', docId: 45002, title: 'Invoice Page 2' },
      ]);
      await mockAutoItemize(page, invoiceId);

      await detailPage.goto(invoiceId);
      await expect(detailPage.heading).toBeVisible();

      // Click Auto-itemize → document picker modal should open (not preview)
      await detailPage.clickAutoItemizeButton();

      const pickerModal = detailPage.getDocumentPickerModal();
      await expect(pickerModal).toBeVisible();

      // Both documents should be listed
      await expect(pickerModal).toContainText('Invoice Page 1');
      await expect(pickerModal).toContainText('Invoice Page 2');

      // Select the first document — this triggers dry-run
      const dryRunPromise = page.waitForResponse(
        (resp) =>
          resp.url().includes('/auto-itemize') &&
          resp.request().method() === 'POST' &&
          resp.status() === 200,
      );
      await detailPage.selectDocument('Invoice Page 1');
      await dryRunPromise;

      // Picker modal should close, preview modal should open
      await expect(pickerModal).not.toBeVisible();

      const previewModal = detailPage.getAutoItemizePreviewModal();
      await expect(previewModal).toBeVisible();

      // Three rows extracted
      const rowCheckboxes = previewModal.locator(
        'table tbody tr input[type="checkbox"]:not([aria-label*="Select all"])',
      );
      await expect(rowCheckboxes).toHaveCount(3);

      // Cancel to clean up
      await detailPage.page.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(previewModal).not.toBeVisible();
    } finally {
      if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: Empty state — no lines detected
// SKIPPED (#1564): AutoItemizePreviewModal removed. The empty state is now handled
// on the AutoItemizePage itself (shows the table with 0 rows).
// ─────────────────────────────────────────────────────────────────────────────

test.describe.skip('[SKIPPED #1564] Auto-itemize empty state (Scenario 4)', () => {
  test('Preview modal shows "No line items detected" when dry-run returns empty lines array', async ({
    page,
    testPrefix,
  }) => {
    const viewportWidth = page.viewportSize()?.width ?? 1440;
    if (viewportWidth < 1024) {
      test.skip(true, 'Functional test — desktop/tablet only');
      return;
    }

    const detailPage = new InvoiceDetailPage(page);
    let vendorId = '';
    let invoiceId = '';

    try {
      vendorId = await createVendorViaApi(page, `${testPrefix} AI-Empty Vendor`);
      invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 800,
        date: '2026-06-01',
      });

      await mockConfigEnabled(page);
      await mockDocumentLinks(page, invoiceId, [
        { linkId: 'dl-e2e-em1', docId: 46001, title: 'Empty PDF' },
      ]);

      // Dry-run returns zero lines
      await mockAutoItemize(page, invoiceId, {
        dryRunBody: { lines: [], warnings: [] },
      });

      await detailPage.goto(invoiceId);
      await expect(detailPage.heading).toBeVisible();

      await detailPage.clickAutoItemizeButton();

      const previewModal = detailPage.getAutoItemizePreviewModal();
      await expect(previewModal).toBeVisible();

      // Empty state message
      const emptyMsg = detailPage.getEmptyStateMessage();
      await expect(emptyMsg).toBeVisible();
      await expect(emptyMsg).toContainText('No line items detected');

      // Apply button is NOT shown (only Close/Cancel)
      await expect(
        previewModal.getByRole('button', { name: 'Apply', exact: true }),
      ).not.toBeVisible();

      // Cancel/Close button is present
      await expect(previewModal.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible();

      // Close
      await previewModal.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(previewModal).not.toBeVisible();
    } finally {
      if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: Total mismatch warning banner (AC14)
// SKIPPED (#1564): The mismatch warning is now a SuggestionBadge on AutoItemizePage,
// not a banner in the modal. Replacement: invoice-auto-itemize-page.spec.ts Scenario 4.
// ─────────────────────────────────────────────────────────────────────────────

test.describe.skip('[SKIPPED #1564] Auto-itemize mismatch warning (Scenario 5)', () => {
  test('Preview modal shows non-blocking warning banner when extracted total diverges >1% from invoice amount', async ({
    page,
    testPrefix,
  }) => {
    const viewportWidth = page.viewportSize()?.width ?? 1440;
    if (viewportWidth < 1024) {
      test.skip(true, 'Functional test — desktop/tablet only');
      return;
    }

    const detailPage = new InvoiceDetailPage(page);
    let vendorId = '';
    let invoiceId = '';

    try {
      vendorId = await createVendorViaApi(page, `${testPrefix} AI-Mismatch Vendor`);
      invoiceId = await createInvoiceViaApi(page, vendorId, {
        // Invoice total: 2000 but extracted lines sum to 1700 (15% delta > 1%)
        amount: 2000,
        date: '2026-06-01',
      });

      await mockConfigEnabled(page);
      await mockDocumentLinks(page, invoiceId, [
        { linkId: 'dl-e2e-mis1', docId: 47001, title: 'Mismatch Invoice' },
      ]);

      // Dry-run returns 3 lines (sum = 1700) with a TOTAL_MISMATCH warning
      await mockAutoItemize(page, invoiceId, {
        dryRunBody: {
          lines: THREE_EXTRACTED_LINES, // sum = 900 + 680 + 120 = 1700
          warnings: [
            {
              code: 'TOTAL_MISMATCH',
              extractedTotal: 1700,
              invoiceTotal: 2000,
            },
          ],
        },
      });

      await detailPage.goto(invoiceId);
      await expect(detailPage.heading).toBeVisible();

      await detailPage.clickAutoItemizeButton();

      const previewModal = detailPage.getAutoItemizePreviewModal();
      await expect(previewModal).toBeVisible();

      // Warning banner must be visible in the modal
      const warningBanner = detailPage.getMismatchWarningBanner();
      await expect(warningBanner).toBeVisible();

      // Warning text references both totals.
      // formatCurrency uses the current locale — en-US produces "€1,700.00", de-DE produces
      // "1.700,00 €". Use a locale-agnostic regex that matches both separators.
      await expect(warningBanner).toContainText(/1[.,]700/);
      await expect(warningBanner).toContainText(/2[.,]000/);

      // Apply button should still be enabled (non-blocking warning)
      const applyBtn = previewModal.getByRole('button', { name: 'Apply', exact: true });
      await expect(applyBtn).not.toBeDisabled();

      // Cancel
      await previewModal.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(previewModal).not.toBeVisible();
    } finally {
      if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6: ITEMIZED_SUM_EXCEEDS_INVOICE on Apply (AC10)
// SKIPPED (#1564): The commit (Apply) flow is now on AutoItemizePage Save button,
// not in AutoItemizePreviewModal. The error handling is in AutoItemizePage errorBanner.
// ─────────────────────────────────────────────────────────────────────────────

test.describe
  .skip('[SKIPPED #1564] Auto-itemize ITEMIZED_SUM_EXCEEDS_INVOICE on Apply (Scenario 6)', () => {
  test('Clicking Apply when commit returns 400 ITEMIZED_SUM_EXCEEDS_INVOICE shows inline error in modal', async ({
    page,
    testPrefix,
  }) => {
    const viewportWidth = page.viewportSize()?.width ?? 1440;
    if (viewportWidth < 1024) {
      test.skip(true, 'Functional test — desktop/tablet only');
      return;
    }

    const detailPage = new InvoiceDetailPage(page);
    let vendorId = '';
    let invoiceId = '';

    try {
      // Invoice amount = 100 (lines sum to 1700 >> 100, so ITEMIZED_SUM_EXCEEDS_INVOICE)
      vendorId = await createVendorViaApi(page, `${testPrefix} AI-Exceeds Vendor`);
      invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 100,
        date: '2026-06-01',
      });

      await mockConfigEnabled(page);
      await mockDocumentLinks(page, invoiceId, [
        { linkId: 'dl-e2e-exc1', docId: 48001, title: 'Exceeds Invoice' },
      ]);

      // Dry-run succeeds, commit returns 400
      await mockAutoItemize(page, invoiceId, {
        dryRunBody: makeDryRunResponse(),
        commitBody: {
          error: {
            code: 'ITEMIZED_SUM_EXCEEDS_INVOICE',
            message: 'The sum of itemized amounts exceeds the invoice total.',
            details: {},
          },
        },
        commitStatus: 400,
      });

      await detailPage.goto(invoiceId);
      await expect(detailPage.heading).toBeVisible();

      await detailPage.clickAutoItemizeButton();
      const previewModal = detailPage.getAutoItemizePreviewModal();
      await expect(previewModal).toBeVisible();

      // Click Apply
      const applyPromise = page.waitForResponse(
        (resp) =>
          resp.url().includes('/auto-itemize') &&
          resp.request().method() === 'POST' &&
          resp.status() === 400,
      );
      await detailPage.clickApplyButton();
      await applyPromise;

      // Modal must STAY open (not close on error)
      await expect(previewModal).toBeVisible();

      // Inline error banner must appear inside the modal.
      // AutoItemizePreviewModal wraps the error in <div role="alert"><FormError .../></div>.
      // FormError with variant='banner' (the default) also renders role="alert" on its own div,
      // so there are TWO nested role="alert" elements. Use .last() to target the innermost one
      // (the FormError), which carries the actual message text.
      const errorBanner = previewModal.locator('[role="alert"]').last();
      await expect(errorBanner).toBeVisible();
      await expect(errorBanner).toContainText('exceed');

      // Close
      await previewModal.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(previewModal).not.toBeVisible();
    } finally {
      if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 7: LLM unreachable — 502 on dry-run (AC11)
// SKIPPED (#1564): The error flow is now on AutoItemizePage (errorBanner + Retry),
// not as a toast before the modal opens. Replacement: invoice-auto-itemize-page.spec.ts Scenario 9.
// ─────────────────────────────────────────────────────────────────────────────

test.describe.skip('[SKIPPED #1564] Auto-itemize LLM unreachable (Scenario 7)', () => {
  test('502 on dry-run shows error toast/banner; preview modal does NOT open', async ({
    page,
    testPrefix,
  }) => {
    const viewportWidth = page.viewportSize()?.width ?? 1440;
    if (viewportWidth < 1024) {
      test.skip(true, 'Functional test — desktop/tablet only');
      return;
    }

    const detailPage = new InvoiceDetailPage(page);
    let vendorId = '';
    let invoiceId = '';

    try {
      vendorId = await createVendorViaApi(page, `${testPrefix} AI-Down Vendor`);
      invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 1000,
        date: '2026-06-01',
      });

      await mockConfigEnabled(page);
      await mockDocumentLinks(page, invoiceId, [
        { linkId: 'dl-e2e-down1', docId: 49001, title: 'LLM Down Doc' },
      ]);

      // Dry-run returns 502 LLM_UNREACHABLE
      await mockAutoItemize(page, invoiceId, {
        dryRunBody: {
          error: {
            code: 'LLM_UNREACHABLE',
            message: 'The extraction service is unavailable. Please try again later.',
            details: {},
          },
        },
        dryRunStatus: 502,
      });

      await detailPage.goto(invoiceId);
      await expect(detailPage.heading).toBeVisible();

      // Register waitForResponse BEFORE clicking — the request fires synchronously on click.
      const errorWait = page.waitForResponse(
        (resp) => resp.url().includes('/auto-itemize') && resp.status() === 502,
      );

      // Click Auto-itemize
      await detailPage.clickAutoItemizeButton();
      await errorWait;

      // Preview modal should NOT open
      const previewModal = detailPage.getAutoItemizePreviewModal();
      await expect(previewModal).not.toBeVisible();

      // InvoiceBudgetLinesSection sets autoItemizeError state for non-LLM_INVALID_RESPONSE errors.
      // This renders as <div className={styles.errorBanner} role="alert"> inside the section.
      // CSS Modules emit the class as "errorBanner_<hash>", so [class*="errorBanner"] matches it.
      // Scoped to budgetLinesSection to avoid false matches with other sections on the page.
      await expect(
        detailPage.budgetLinesSection.locator('[role="alert"]').filter({ visible: true }).first(),
      ).toBeVisible();
    } finally {
      if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 8: Mode toggle — replace vs append radio selection
// This test is still valid: the mode toggle moved from the modal to AutoItemizePage.
// It tests the mode radio group, which still exists at the page level.
// ─────────────────────────────────────────────────────────────────────────────
//
// NOTE (#1564): The mode toggle now lives on AutoItemizePage (not the preview modal).
// The test needs to be rewritten to use AutoItemizePage instead of the old modal POM.
// For now, skip it — a replacement test can be added to invoice-auto-itemize-page.spec.ts.

test.describe
  .skip('[SKIPPED #1564] Auto-itemize mode toggle (Scenario 8) — needs rewrite for AutoItemizePage', () => {
  test('Mode radio defaults to "Append" and can be switched to "Replace"', async ({
    page,
    testPrefix,
  }) => {
    const viewportWidth = page.viewportSize()?.width ?? 1440;
    if (viewportWidth < 1024) {
      test.skip(true, 'Functional test — desktop/tablet only');
      return;
    }

    const detailPage = new InvoiceDetailPage(page);
    let vendorId = '';
    let invoiceId = '';

    try {
      vendorId = await createVendorViaApi(page, `${testPrefix} AI-Mode Vendor`);
      invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 1700,
        date: '2026-06-01',
      });

      await mockConfigEnabled(page);
      await mockDocumentLinks(page, invoiceId, [
        { linkId: 'dl-e2e-md1', docId: 50001, title: 'Mode Test Doc' },
      ]);
      await mockAutoItemize(page, invoiceId);

      await detailPage.goto(invoiceId);
      await expect(detailPage.heading).toBeVisible();

      await detailPage.clickAutoItemizeButton();
      const previewModal = detailPage.getAutoItemizePreviewModal();
      await expect(previewModal).toBeVisible();

      // Default mode is "append"
      const appendRadio = previewModal.locator('input[type="radio"][value="append"]');
      const replaceRadio = previewModal.locator('input[type="radio"][value="replace"]');
      await expect(appendRadio).toBeChecked();
      await expect(replaceRadio).not.toBeChecked();

      // Switch to replace
      await detailPage.selectMode('replace');
      await expect(replaceRadio).toBeChecked();
      await expect(appendRadio).not.toBeChecked();

      // Switch back to append
      await detailPage.selectMode('append');
      await expect(appendRadio).toBeChecked();

      // Cancel
      await previewModal.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(previewModal).not.toBeVisible();
    } finally {
      if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 9: Include/exclude toggle (row checkbox)
// NOTE (#1564): The checkbox toggle still exists on AutoItemizePage. This test
// exercises the same behavior but via the old modal POM (detailPage.toggleIncludeLine).
// The include/exclude logic is now on AutoItemizePage — see Scenario 3 in
// invoice-auto-itemize-page.spec.ts which also exercises the toggle.
// Skip here to avoid false failures from the old modal POM.
// ─────────────────────────────────────────────────────────────────────────────

test.describe
  .skip('[SKIPPED #1564] Auto-itemize row include/exclude toggle (Scenario 9) — needs rewrite for AutoItemizePage', () => {
  test('Unchecking a row disables it and removes it from the apply payload', async ({
    page,
    testPrefix,
  }) => {
    const viewportWidth = page.viewportSize()?.width ?? 1440;
    if (viewportWidth < 1024) {
      test.skip(true, 'Functional test — desktop/tablet only');
      return;
    }

    const detailPage = new InvoiceDetailPage(page);
    let vendorId = '';
    let invoiceId = '';

    try {
      vendorId = await createVendorViaApi(page, `${testPrefix} AI-Toggle Vendor`);
      invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 1700,
        date: '2026-06-01',
      });

      await mockConfigEnabled(page);
      await mockDocumentLinks(page, invoiceId, [
        { linkId: 'dl-e2e-tg1', docId: 51001, title: 'Toggle Test Doc' },
      ]);
      await mockAutoItemize(page, invoiceId);

      await detailPage.goto(invoiceId);
      await expect(detailPage.heading).toBeVisible();

      await detailPage.clickAutoItemizeButton();
      const previewModal = detailPage.getAutoItemizePreviewModal();
      await expect(previewModal).toBeVisible();

      // Row checkboxes (not the select-all header checkbox)
      const rowCheckboxes = previewModal.locator(
        'table tbody tr input[type="checkbox"]:not([aria-label*="Select all"])',
      );
      await expect(rowCheckboxes).toHaveCount(3);
      // All should be checked by default
      await expect(rowCheckboxes.nth(0)).toBeChecked();
      await expect(rowCheckboxes.nth(1)).toBeChecked();
      await expect(rowCheckboxes.nth(2)).toBeChecked();

      // Uncheck the second row
      await detailPage.toggleIncludeLine(1);
      await expect(rowCheckboxes.nth(1)).not.toBeChecked();

      // The description input in that row should be disabled.
      // Each row has two input[type="text"] elements (description + unit), so we cannot use a
      // flat nth() selector. Instead, scope to the specific tbody row at index 1 (0-based) and
      // pick its first text input, which is the description column.
      const secondRow = previewModal.locator('table tbody tr').nth(1);
      const descInput = secondRow.locator('input[type="text"]').first();
      await expect(descInput).toBeDisabled();

      // The Apply button should still be enabled (2 rows still included)
      const applyBtn = previewModal.getByRole('button', { name: 'Apply', exact: true });
      await expect(applyBtn).not.toBeDisabled();

      // Uncheck all rows — Apply should be disabled
      await detailPage.toggleIncludeLine(0);
      await detailPage.toggleIncludeLine(2);
      await expect(applyBtn).toBeDisabled();

      // Cancel
      await previewModal.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(previewModal).not.toBeVisible();
    } finally {
      if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});
