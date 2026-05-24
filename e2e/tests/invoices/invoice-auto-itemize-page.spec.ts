/**
 * E2E tests for Issue #1564: Auto-itemize UX redesign — page-based flow.
 *
 * The old modal-based flow (AutoItemizePreviewModal + DocumentPickerModal) has been
 * replaced with a full page at /budget/invoices/:id/auto-itemize/:documentId.
 *
 * Scenarios covered (mapped to E2E spec sections):
 *   1.  Smoke: Itemize button visible on LinkedDocumentCard when autoItemizeEnabled=true
 *   2.  Smoke: Itemize button hidden when autoItemizeEnabled=false
 *   3.  Happy path: click Itemize → page loads → analyzing → result → edit → save → back
 *   4.  LLM suggestion: TOTAL_MISMATCH → SuggestionBadge → Apply → field updates
 *   5.  Cancel with dirty state → modal → Keep Editing → still on page
 *   5b. Cancel with dirty state → modal → Discard → navigate back
 *   6.  Cancel without edits → immediate navigation back (no modal)
 *   7.  "Details" rename regression: LinkedDocumentCard shows "Details" not "View"
 *   8.  Old modal absence: no "Auto-itemize" button in budget lines section header
 *   9.  Error state: LLM failure → error banner + Retry visible
 *   10. Responsive desktop: side-by-side layout at ≥1024px
 *   11. Responsive mobile: stacked layout, form first at <860px
 *   12. Responsive tablet breakpoint: single column below 860px threshold
 *   13. Per-row assignment: "Assign…" picker flow → assigned badge → Save → payload
 *       NOTE: test.fixme() — picker step 2 (WorkItemPicker search + budget line list)
 *       is not yet implemented in AutoItemizePage.tsx. Un-fixme once frontend adds it.
 *
 * Mocking strategy:
 *   - GET /api/config: intercepted to inject autoItemizeEnabled: true/false
 *   - GET /api/document-links: intercepted to return deterministic linked-doc fixtures
 *   - POST /api/invoices/:id/auto-itemize: intercepted to return controlled LLM results
 *   - GET /paperless/documents/:id: intercepted to return a mock document object
 *     (the AutoItemizePage fetches the document via getPaperlessDocument on mount)
 *   - GET /api/invoices/:id: NOT mocked — uses real API so invoice data is accurate
 *
 * All tests use the authenticated `page` fixture and `testPrefix` from auth.ts.
 */

import { test, expect } from '../../fixtures/auth.js';
import { AutoItemizePage } from '../../pages/AutoItemizePage.js';
import { InvoiceDetailPage } from '../../pages/InvoiceDetailPage.js';
import type { Page, Route } from '@playwright/test';
import { API } from '../../fixtures/testData.js';
import { createWorkItemViaApi, deleteWorkItemViaApi } from '../../fixtures/apiHelpers.js';

// ─────────────────────────────────────────────────────────────────────────────
// Inline REST helpers (mirrors existing invoice E2E patterns)
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
 * Create a work item budget (budget line) via REST API.
 * Returns the budget line id (work_item_budgets.id).
 */
async function createWorkItemBudgetViaApi(
  page: Page,
  workItemId: string,
  data: { description: string; plannedAmount: number },
): Promise<string> {
  const resp = await page.request.post(`${API.workItems}/${workItemId}/budgets`, {
    data: {
      ...data,
      confidence: 'own_estimate',
      budgetSourceId: 'discretionary-system',
    },
  });
  expect(resp.ok(), `POST work item budget failed: ${resp.status()}`).toBeTruthy();
  const body = (await resp.json()) as { budget: { id: string } };
  return body.budget.id;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock fixtures
// ─────────────────────────────────────────────────────────────────────────────

/** Fake document link as returned by GET /api/document-links */
function makeDocLink(opts: {
  linkId: string;
  docId: number;
  title: string;
  entityId: string;
}) {
  return {
    id: opts.linkId,
    entityType: 'invoice',
    entityId: opts.entityId,
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

/** Mock Paperless document detail response (GET /paperless/documents/:id) */
function makePaperlessDocument(docId: number, title: string) {
  return {
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
  };
}

/** Three extracted lines for happy-path scenarios */
const THREE_LINES = [
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

// ─────────────────────────────────────────────────────────────────────────────
// Route-intercept helpers
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

/**
 * Intercept GET /api/document-links to return a deterministic set.
 * Only matches requests for entityType=invoice&entityId=<invoiceId>.
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
          documentLinks: docs.map((d) => makeDocLink({ ...d, entityId: invoiceId })),
        }),
      });
    },
  );
}

/**
 * Intercept GET /paperless/documents/:docId to return a mock document.
 * AutoItemizePage calls getPaperlessDocument(docId) on mount.
 */
async function mockPaperlessDocument(page: Page, docId: number, title: string): Promise<void> {
  await page.route(`**/paperless/documents/${docId}`, async (route: Route) => {
    // Only intercept GET (not thumb/preview)
    if (route.request().method() !== 'GET' || route.request().url().includes('/thumb') || route.request().url().includes('/preview')) {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(makePaperlessDocument(docId, title)),
    });
  });
}

/**
 * Intercept POST /api/invoices/:id/auto-itemize (dry-run call triggered on mount).
 * Returns the given lines + warnings.
 */
async function mockAutoItemizeDryRun(
  page: Page,
  invoiceId: string,
  opts: {
    lines?: object[];
    warnings?: object[];
    status?: number;
    errorBody?: object;
  } = {},
): Promise<void> {
  const lines = opts.lines ?? THREE_LINES;
  const warnings = opts.warnings ?? [];
  const status = opts.status ?? 200;

  await page.route(`**/api/invoices/${invoiceId}/auto-itemize`, async (route: Route) => {
    if (opts.errorBody !== undefined || status !== 200) {
      await route.fulfill({
        status: status !== 200 ? status : 500,
        contentType: 'application/json',
        body: JSON.stringify(
          opts.errorBody ?? {
            error: { code: 'INTERNAL_ERROR', message: 'Internal error', details: {} },
          },
        ),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ lines, warnings }),
    });
  });
}

/**
 * Intercept POST /api/invoices/:id/auto-itemize for both dry-run and commit.
 * Dry-run (dryRun: true) returns lines+warnings; commit (dryRun: false) returns budget lines.
 */
async function mockAutoItemizeBothPhases(
  page: Page,
  invoiceId: string,
  opts: {
    dryRunLines?: object[];
    dryRunWarnings?: object[];
    commitStatus?: number;
  } = {},
): Promise<void> {
  const lines = opts.dryRunLines ?? THREE_LINES;
  const warnings = opts.dryRunWarnings ?? [];
  const now = '2026-05-24T00:00:00.000Z';

  await page.route(`**/api/invoices/${invoiceId}/auto-itemize`, async (route: Route) => {
    const body = route.request().postDataJSON() as { dryRun: boolean } | null;
    if (body?.dryRun) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ lines, warnings }),
      });
    } else {
      const commitStatus = opts.commitStatus ?? 200;
      await route.fulfill({
        status: commitStatus,
        contentType: 'application/json',
        body: JSON.stringify({
          budgetLines: lines.map((line: any, idx) => ({
            id: `ibl-e2e-page-${idx + 1}`,
            workItemBudgetId: null,
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
          remainingAmount: 0,
        }),
      });
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1 & 2 — Itemize button visibility on LinkedDocumentCard
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Scenario 1 & 2 — Itemize button visibility on LinkedDocumentCard', { tag: ['@smoke'] }, () => {
  test(
    'Itemize button appears on LinkedDocumentCard when autoItemizeEnabled=true (Scenario 1)',
    { tag: '@smoke' },
    async ({ page, testPrefix }) => {
      const detailPage = new InvoiceDetailPage(page);
      let vendorId = '';
      let invoiceId = '';

      try {
        vendorId = await createVendorViaApi(page, `${testPrefix} AI-Page-Vis Vendor`);
        invoiceId = await createInvoiceViaApi(page, vendorId, {
          amount: 1700,
          date: '2026-06-01',
          invoiceNumber: `${testPrefix}-AI-PAGE-VIS-001`,
        });

        await mockConfig(page, true);
        await mockDocumentLinks(page, invoiceId, [
          { linkId: 'dl-page-vis-1', docId: 61001, title: 'Invoice Doc Alpha' },
        ]);

        await detailPage.goto(invoiceId);
        await expect(detailPage.heading).toBeVisible();

        // ── Itemize button visible on the document card ─────────────────────
        const itemizeBtn = detailPage.itemizeButton('Invoice Doc Alpha');
        await expect(itemizeBtn).toBeVisible();

        // ── "Details" button visible (renamed from "View" in story #1564) ───
        const detailsBtn = detailPage.detailsButton('Invoice Doc Alpha');
        await expect(detailsBtn).toBeVisible();

        // ── Old "Auto-itemize" button is NOT in the budget lines section ─────
        await expect(detailPage.autoItemizeButton()).not.toBeVisible();
      } finally {
        if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
        if (vendorId) await deleteVendorViaApi(page, vendorId);
      }
    },
  );

  test(
    'Itemize button hidden when autoItemizeEnabled=false (Scenario 2)',
    async ({ page, testPrefix }) => {
      const detailPage = new InvoiceDetailPage(page);
      let vendorId = '';
      let invoiceId = '';

      try {
        vendorId = await createVendorViaApi(page, `${testPrefix} AI-Page-Dis Vendor`);
        invoiceId = await createInvoiceViaApi(page, vendorId, {
          amount: 500,
          date: '2026-06-01',
        });

        await mockConfig(page, false);
        await mockDocumentLinks(page, invoiceId, [
          { linkId: 'dl-page-dis-1', docId: 61002, title: 'Invoice Doc Beta' },
        ]);

        await detailPage.goto(invoiceId);
        await expect(detailPage.heading).toBeVisible();

        // Scroll to documents section so cards are in the viewport
        await detailPage.documentsSection.scrollIntoViewIfNeeded();

        // ── "Details" button still visible (unaffected by LLM config) ───────
        const detailsBtn = detailPage.detailsButton('Invoice Doc Beta');
        await expect(detailsBtn).toBeVisible();

        // ── Itemize button must NOT be rendered ──────────────────────────────
        // Wait for the section to be stable first (check Details is there, THEN check Itemize absent)
        const itemizeBtn = detailPage.itemizeButton('Invoice Doc Beta');
        await expect(itemizeBtn).not.toBeVisible();
      } finally {
        if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
        if (vendorId) await deleteVendorViaApi(page, vendorId);
      }
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3 — Happy path: full itemize flow
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Scenario 3 — Happy path: full itemize flow', { tag: ['@smoke'] }, () => {
  test(
    'Click Itemize → page loads → analyzing → result → toggle line → Save → back on invoice',
    { tag: '@smoke' },
    async ({ page, testPrefix }) => {
      // Skip on mobile — functional test requires visible table
      const vw = page.viewportSize()?.width ?? 1440;
      if (vw < 600) {
        test.skip(true, 'Functional test — skip on very narrow mobile');
        return;
      }

      const detailPage = new InvoiceDetailPage(page);
      const autoItemizePage = new AutoItemizePage(page);
      let vendorId = '';
      let invoiceId = '';

      try {
        vendorId = await createVendorViaApi(page, `${testPrefix} AI-HP Vendor`);
        invoiceId = await createInvoiceViaApi(page, vendorId, {
          amount: 1700,
          date: '2026-06-01',
          invoiceNumber: `${testPrefix}-AI-HP-001`,
        });

        const docId = 62001;
        const docTitle = 'Bathroom Invoice HP';

        await mockConfig(page, true);
        await mockDocumentLinks(page, invoiceId, [
          { linkId: 'dl-hp-1', docId, title: docTitle },
        ]);
        await mockPaperlessDocument(page, docId, docTitle);
        await mockAutoItemizeBothPhases(page, invoiceId);

        await detailPage.goto(invoiceId);
        await expect(detailPage.heading).toBeVisible();

        // ── Verify Itemize button is visible ─────────────────────────────────
        await detailPage.documentsSection.scrollIntoViewIfNeeded();
        const itemizeBtn = detailPage.itemizeButton(docTitle);
        await expect(itemizeBtn).toBeVisible();

        // ── Click Itemize → should navigate to /auto-itemize page ─────────────
        // Register waitForNavigation before click
        const navPromise = page.waitForURL(`**/budget/invoices/${invoiceId}/auto-itemize/${docId}`);
        await itemizeBtn.click();
        await navPromise;

        // ── AutoItemizePage: page title visible ───────────────────────────────
        await expect(autoItemizePage.pageTitle).toBeVisible();
        await expect(autoItemizePage.pageTitle).toContainText(/Auto-Itemize Invoice/i);

        // ── Breadcrumb visible ────────────────────────────────────────────────
        await expect(autoItemizePage.breadcrumb).toBeVisible();
        await expect(autoItemizePage.breadcrumb).toContainText(/Back to Invoice/i);

        // ── Wait for LLM result (analyzing skeleton disappears) ───────────────
        // AutoItemizePage runs dry-run on mount; skeleton shows while loading
        await autoItemizePage.waitForAnalyzingDone();

        // ── Three line rows visible ───────────────────────────────────────────
        const rows = page.locator('table tbody tr:not([class*="totalsRow"])');
        await expect(rows).toHaveCount(3);

        // ── First row description visible ─────────────────────────────────────
        await expect(autoItemizePage.lineDescription(0)).toHaveValue('Bathroom tiles');

        // ── Toggle the second row (uncheck → excluded) ───────────────────────
        const secondCheckbox = autoItemizePage.lineCheckbox(1);
        await expect(secondCheckbox).toBeChecked();
        await secondCheckbox.click();
        await expect(secondCheckbox).not.toBeChecked();

        // ── Save → navigate back to invoice detail ───────────────────────────
        const saveResponsePromise = page.waitForResponse(
          (resp) =>
            resp.url().includes('/auto-itemize') &&
            resp.request().method() === 'POST' &&
            !((resp.request().postDataJSON() as { dryRun?: boolean })?.dryRun),
        );
        await autoItemizePage.saveButton.click();
        await saveResponsePromise;

        // ── Should navigate back to invoice detail ────────────────────────────
        await expect(page).toHaveURL(/\/budget\/invoices\/[^/]+$/);

        // ── Invoice detail heading still visible ──────────────────────────────
        await expect(detailPage.heading).toBeVisible();
      } finally {
        if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
        if (vendorId) await deleteVendorViaApi(page, vendorId);
      }
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4 — LLM suggestion: TOTAL_MISMATCH → SuggestionBadge → Apply
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Scenario 4 — LLM suggestion badge (TOTAL_MISMATCH)', () => {
  test(
    'SuggestionBadge appears for amount mismatch; Apply updates the field',
    async ({ page, testPrefix }) => {
      const vw = page.viewportSize()?.width ?? 1440;
      if (vw < 600) {
        test.skip(true, 'Functional test — skip on very narrow mobile');
        return;
      }

      const autoItemizePage = new AutoItemizePage(page);
      let vendorId = '';
      let invoiceId = '';

      try {
        // Invoice amount = 1000, but LLM extracts 1700 (TOTAL_MISMATCH)
        vendorId = await createVendorViaApi(page, `${testPrefix} AI-Badge Vendor`);
        invoiceId = await createInvoiceViaApi(page, vendorId, {
          amount: 1000,
          date: '2026-06-01',
        });

        const docId = 63001;
        const docTitle = 'Mismatch Invoice Badge';

        await mockPaperlessDocument(page, docId, docTitle);
        await mockAutoItemizeDryRun(page, invoiceId, {
          lines: THREE_LINES,
          warnings: [
            {
              code: 'TOTAL_MISMATCH',
              extractedTotal: 1700,
              invoiceTotal: 1000,
            },
          ],
        });

        // Navigate directly to the page (bypass invoice detail)
        await autoItemizePage.goto(invoiceId, docId);

        // ── Wait for lines to load ────────────────────────────────────────────
        await autoItemizePage.waitForAnalyzingDone();

        // ── SuggestionBadge should appear near the amount field ───────────────
        // The badge renders when: amountSuggestion is truthy AND its string value
        // differs from the current metadataEdits.amount.
        // The invoice amount is 1000 and the suggestion is 1700, so they differ.
        const badge = page.locator('[class*="badge"]').first();
        await expect(badge).toBeVisible();

        // Badge text shows the suggested value
        await expect(badge).toContainText(/1[.,]700/);

        // ── Record current amount input value ─────────────────────────────────
        const initialAmountValue = await autoItemizePage.totalAmountInput.inputValue();
        expect(initialAmountValue).toBe('1000');

        // ── Click the Apply button in the badge ───────────────────────────────
        const applyBtn = badge.getByRole('button', { name: /Apply/i });
        await expect(applyBtn).toBeVisible();
        await applyBtn.click();

        // ── Amount input should update to 1700 ────────────────────────────────
        await expect(autoItemizePage.totalAmountInput).toHaveValue('1700');

        // ── Badge should disappear (suggestion == field value now) ────────────
        await expect(badge).not.toBeVisible();

        // ── Live region should announce the applied suggestion ─────────────────
        // The live region is role="status" aria-atomic="true" class="srOnly"
        // It is in the DOM but visually hidden (srOnly class). We check it has text.
        await expect(autoItemizePage.liveRegion).not.toBeEmpty();
      } finally {
        if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
        if (vendorId) await deleteVendorViaApi(page, vendorId);
      }
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5 — Cancel with dirty state → modal confirmation
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Scenario 5 — Cancel with dirty state', () => {
  test(
    'Cancel with dirty state shows Discard Changes modal; Keep Editing keeps the page open',
    async ({ page, testPrefix }) => {
      const vw = page.viewportSize()?.width ?? 1440;
      if (vw < 600) {
        test.skip(true, 'Functional test — skip on very narrow mobile');
        return;
      }

      const autoItemizePage = new AutoItemizePage(page);
      let vendorId = '';
      let invoiceId = '';

      try {
        vendorId = await createVendorViaApi(page, `${testPrefix} AI-Cancel Vendor`);
        invoiceId = await createInvoiceViaApi(page, vendorId, {
          amount: 1700,
          date: '2026-06-01',
        });

        const docId = 64001;
        await mockPaperlessDocument(page, docId, 'Cancel Test Doc');
        await mockAutoItemizeDryRun(page, invoiceId);

        await autoItemizePage.goto(invoiceId, docId);
        await autoItemizePage.waitForAnalyzingDone();

        // ── Dirty the form: toggle a line checkbox ────────────────────────────
        await autoItemizePage.lineCheckbox(0).click();
        await expect(autoItemizePage.lineCheckbox(0)).not.toBeChecked();

        // ── Click Cancel → modal should appear (form is dirty) ───────────────
        await autoItemizePage.cancelButton.click();
        await expect(autoItemizePage.cancelModal).toBeVisible();

        // ── Modal title is "Discard Changes?" ─────────────────────────────────
        await expect(autoItemizePage.cancelModal).toContainText(/Discard Changes/i);

        // ── Click "Keep Editing" → modal closes, page still shown ────────────
        await autoItemizePage.keepEditingButton.click();
        await expect(autoItemizePage.cancelModal).not.toBeVisible();
        await expect(autoItemizePage.pageTitle).toBeVisible();

        // ── The dirty checkbox should still be unchecked ─────────────────────
        await expect(autoItemizePage.lineCheckbox(0)).not.toBeChecked();
      } finally {
        if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
        if (vendorId) await deleteVendorViaApi(page, vendorId);
      }
    },
  );

  test(
    'Discard Changes in modal navigates back to invoice detail',
    async ({ page, testPrefix }) => {
      const vw = page.viewportSize()?.width ?? 1440;
      if (vw < 600) {
        test.skip(true, 'Functional test — skip on very narrow mobile');
        return;
      }

      const autoItemizePage = new AutoItemizePage(page);
      let vendorId = '';
      let invoiceId = '';

      try {
        vendorId = await createVendorViaApi(page, `${testPrefix} AI-Discard Vendor`);
        invoiceId = await createInvoiceViaApi(page, vendorId, {
          amount: 1700,
          date: '2026-06-01',
        });

        const docId = 64002;
        await mockPaperlessDocument(page, docId, 'Discard Test Doc');
        await mockAutoItemizeDryRun(page, invoiceId);

        await autoItemizePage.goto(invoiceId, docId);
        await autoItemizePage.waitForAnalyzingDone();

        // Dirty the form
        await autoItemizePage.lineCheckbox(0).click();

        // Cancel → modal appears
        await autoItemizePage.cancelButton.click();
        await expect(autoItemizePage.cancelModal).toBeVisible();

        // ── Click "Discard Changes" → navigate back ───────────────────────────
        await autoItemizePage.discardButton.click();
        await expect(page).toHaveURL(/\/budget\/invoices\/[^/]+$/);
        // Should not have auto-itemize in the URL
        expect(page.url()).not.toContain('auto-itemize');
      } finally {
        if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
        if (vendorId) await deleteVendorViaApi(page, vendorId);
      }
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6 — Cancel without edits navigates back directly (no modal)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Scenario 6 — Cancel clean state: direct navigation back', () => {
  test(
    'Cancel without any edits navigates back without showing modal',
    async ({ page, testPrefix }) => {
      const vw = page.viewportSize()?.width ?? 1440;
      if (vw < 600) {
        test.skip(true, 'Functional test — skip on very narrow mobile');
        return;
      }

      const autoItemizePage = new AutoItemizePage(page);
      let vendorId = '';
      let invoiceId = '';

      try {
        vendorId = await createVendorViaApi(page, `${testPrefix} AI-Clean Vendor`);
        invoiceId = await createInvoiceViaApi(page, vendorId, {
          amount: 1700,
          date: '2026-06-01',
        });

        const docId = 65001;
        await mockPaperlessDocument(page, docId, 'Clean Cancel Doc');
        await mockAutoItemizeDryRun(page, invoiceId);

        await autoItemizePage.goto(invoiceId, docId);
        await autoItemizePage.waitForAnalyzingDone();

        // Do NOT touch any fields — form is clean

        // ── Click Cancel → immediate navigation (no modal) ────────────────────
        await autoItemizePage.cancelButton.click();

        // Should navigate back directly without any modal
        await expect(page).toHaveURL(/\/budget\/invoices\/[^/]+$/);
        expect(page.url()).not.toContain('auto-itemize');

        // No cancel modal should have appeared
        await expect(autoItemizePage.cancelModal).not.toBeVisible();
      } finally {
        if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
        if (vendorId) await deleteVendorViaApi(page, vendorId);
      }
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 7 — "Details" rename regression on LinkedDocumentCard
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Scenario 7 — "Details" button label on LinkedDocumentCard (regression)', () => {
  test(
    'LinkedDocumentCard on invoice detail shows "Details" button (not "View")',
    { tag: '@smoke' },
    async ({ page, testPrefix }) => {
      const detailPage = new InvoiceDetailPage(page);
      let vendorId = '';
      let invoiceId = '';

      try {
        vendorId = await createVendorViaApi(page, `${testPrefix} AI-Label Vendor`);
        invoiceId = await createInvoiceViaApi(page, vendorId, {
          amount: 800,
          date: '2026-06-01',
        });

        await mockConfig(page, false); // LLM disabled — only verify Details button
        await mockDocumentLinks(page, invoiceId, [
          { linkId: 'dl-label-1', docId: 66001, title: 'Label Test Doc' },
        ]);

        await detailPage.goto(invoiceId);
        await expect(detailPage.heading).toBeVisible();
        await detailPage.documentsSection.scrollIntoViewIfNeeded();

        // ── "Details" button visible on the card ──────────────────────────────
        const detailsBtn = detailPage.detailsButton('Label Test Doc');
        await expect(detailsBtn).toBeVisible();

        // ── No button with the old "View" text label (not aria-label) ────────
        // The "View" text was the button's visible text before story #1564.
        // After the rename, the button text is "Details".
        // We check that no button with exact text "View" exists in the card area.
        const cardArea = detailPage.documentsSection;
        const viewOnlyTextButton = cardArea.getByRole('button', { name: 'View', exact: true });
        await expect(viewOnlyTextButton).not.toBeVisible();
      } finally {
        if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
        if (vendorId) await deleteVendorViaApi(page, vendorId);
      }
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 8 — Old modal absence regression
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Scenario 8 — Old auto-itemize button/modal absence (regression)', () => {
  test(
    'No "Auto-itemize" button in budget lines section, no AutoItemizePreviewModal in DOM',
    { tag: '@smoke' },
    async ({ page, testPrefix }) => {
      const detailPage = new InvoiceDetailPage(page);
      let vendorId = '';
      let invoiceId = '';

      try {
        vendorId = await createVendorViaApi(page, `${testPrefix} AI-NoModal Vendor`);
        invoiceId = await createInvoiceViaApi(page, vendorId, {
          amount: 1200,
          date: '2026-06-01',
        });

        await mockConfig(page, true);
        await mockDocumentLinks(page, invoiceId, [
          { linkId: 'dl-nomodal-1', docId: 67001, title: 'NoModal Doc' },
        ]);

        await detailPage.goto(invoiceId);
        await expect(detailPage.heading).toBeVisible();

        // ── No old "Auto-itemize" button in budget lines section ──────────────
        // This button was removed in story #1564
        await expect(detailPage.autoItemizeButton()).not.toBeVisible();

        // ── No AutoItemizePreviewModal dialog in the DOM ──────────────────────
        // The preview modal had h2 "Review extracted line items"
        const previewModal = page.locator('[role="dialog"]').filter({
          has: page.locator('h2', { hasText: 'Review extracted line items' }),
        });
        await expect(previewModal).not.toBeVisible();

        // ── No DocumentPickerModal in the DOM ─────────────────────────────────
        // The picker modal had h2 "Choose document to analyze"
        const pickerModal = page.locator('[role="dialog"]').filter({
          has: page.locator('h2', { hasText: 'Choose document to analyze' }),
        });
        await expect(pickerModal).not.toBeVisible();
      } finally {
        if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
        if (vendorId) await deleteVendorViaApi(page, vendorId);
      }
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 9 — Error state: LLM failure → error banner + Retry visible
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Scenario 9 — Error state: LLM failure on dry-run', () => {
  test(
    'LLM failure renders error banner and Retry button on AutoItemizePage',
    async ({ page, testPrefix }) => {
      const vw = page.viewportSize()?.width ?? 1440;
      if (vw < 600) {
        test.skip(true, 'Functional test — skip on very narrow mobile');
        return;
      }

      const autoItemizePage = new AutoItemizePage(page);
      let vendorId = '';
      let invoiceId = '';

      try {
        vendorId = await createVendorViaApi(page, `${testPrefix} AI-Err Vendor`);
        invoiceId = await createInvoiceViaApi(page, vendorId, {
          amount: 900,
          date: '2026-06-01',
        });

        const docId = 68001;
        await mockPaperlessDocument(page, docId, 'Error Test Doc');

        // Dry-run returns LLM_UNREACHABLE (502)
        await mockAutoItemizeDryRun(page, invoiceId, {
          status: 502,
          errorBody: {
            error: {
              code: 'LLM_UNREACHABLE',
              message: 'The extraction service is unavailable. Please try again later.',
              details: {},
            },
          },
        });

        await autoItemizePage.goto(invoiceId, docId);

        // ── Error banner visible ──────────────────────────────────────────────
        // AutoItemizePage enters pageStatus='error' and renders FormError with variant="banner"
        await expect(autoItemizePage.errorBanner).toBeVisible();

        // ── Retry button visible ──────────────────────────────────────────────
        await expect(autoItemizePage.retryButton).toBeVisible();

        // ── No lines table (still in error state) ────────────────────────────
        const rows = page.locator('table tbody tr:not([class*="totalsRow"])');
        await expect(rows).toHaveCount(0);
      } finally {
        if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
        if (vendorId) await deleteVendorViaApi(page, vendorId);
      }
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenarios 10–12 — Responsive layout
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Scenarios 10–12 — Responsive layout', { tag: '@responsive' }, () => {
  test(
    'Scenario 10: Desktop (1280×800) — side-by-side layout (two columns visible)',
    async ({ page, testPrefix }) => {
      await page.setViewportSize({ width: 1280, height: 800 });

      const autoItemizePage = new AutoItemizePage(page);
      let vendorId = '';
      let invoiceId = '';

      try {
        vendorId = await createVendorViaApi(page, `${testPrefix} AI-Resp-Desk Vendor`);
        invoiceId = await createInvoiceViaApi(page, vendorId, {
          amount: 1700,
          date: '2026-06-01',
        });

        const docId = 69001;
        await mockPaperlessDocument(page, docId, 'Desktop Layout Doc');
        await mockAutoItemizeDryRun(page, invoiceId);

        await autoItemizePage.goto(invoiceId, docId);
        await autoItemizePage.waitForAnalyzingDone();

        // ── Both columns exist in DOM and are visible ─────────────────────────
        await expect(autoItemizePage.formColumn).toBeVisible();
        await expect(autoItemizePage.previewColumn).toBeVisible();

        // ── Verify side-by-side: both columns have non-zero width > 100px ─────
        const formBounds = await autoItemizePage.formColumn.boundingBox();
        const previewBounds = await autoItemizePage.previewColumn.boundingBox();

        expect(formBounds).not.toBeNull();
        expect(previewBounds).not.toBeNull();

        // Both columns must have substantial width (not stacked/full-width)
        expect(formBounds!.width).toBeGreaterThan(200);
        expect(previewBounds!.width).toBeGreaterThan(200);

        // Both columns should be at the same vertical position (same row)
        // Allow a few pixels of tolerance for padding/border
        const verticalDiff = Math.abs(formBounds!.y - previewBounds!.y);
        expect(verticalDiff).toBeLessThan(50);
      } finally {
        if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
        if (vendorId) await deleteVendorViaApi(page, vendorId);
      }
    },
  );

  test(
    'Scenario 11: Mobile (390×844) — single column, form first (above preview)',
    async ({ page, testPrefix }) => {
      await page.setViewportSize({ width: 390, height: 844 });

      const autoItemizePage = new AutoItemizePage(page);
      let vendorId = '';
      let invoiceId = '';

      try {
        vendorId = await createVendorViaApi(page, `${testPrefix} AI-Resp-Mob Vendor`);
        invoiceId = await createInvoiceViaApi(page, vendorId, {
          amount: 1700,
          date: '2026-06-01',
        });

        const docId = 69002;
        await mockPaperlessDocument(page, docId, 'Mobile Layout Doc');
        await mockAutoItemizeDryRun(page, invoiceId);

        await autoItemizePage.goto(invoiceId, docId);
        await autoItemizePage.waitForAnalyzingDone();

        // ── Both columns in DOM ───────────────────────────────────────────────
        await expect(autoItemizePage.formColumn).toBeVisible();
        // Preview column may be scrolled off-screen — check it's in DOM
        await expect(autoItemizePage.previewColumn).toBeAttached();

        // ── Single column: form column is full-width (≥300px) ────────────────
        const formBounds = await autoItemizePage.formColumn.boundingBox();
        expect(formBounds).not.toBeNull();
        expect(formBounds!.width).toBeGreaterThan(300);

        // ── Form is above preview: form column's top y < preview column's top y
        const previewBounds = await autoItemizePage.previewColumn.boundingBox();
        expect(previewBounds).not.toBeNull();

        // Form should appear first (lower y = higher on page)
        // At ≤860px, CSS sets formColumn order=1, previewColumn order=2
        expect(formBounds!.y).toBeLessThan(previewBounds!.y);
      } finally {
        if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
        if (vendorId) await deleteVendorViaApi(page, vendorId);
      }
    },
  );

  test(
    'Scenario 12: Tablet breakpoint — single column below 860px threshold',
    async ({ page, testPrefix }) => {
      // Test at 850px (just below the 860px breakpoint)
      await page.setViewportSize({ width: 850, height: 1100 });

      const autoItemizePage = new AutoItemizePage(page);
      let vendorId = '';
      let invoiceId = '';

      try {
        vendorId = await createVendorViaApi(page, `${testPrefix} AI-Resp-Tab Vendor`);
        invoiceId = await createInvoiceViaApi(page, vendorId, {
          amount: 1700,
          date: '2026-06-01',
        });

        const docId = 69003;
        await mockPaperlessDocument(page, docId, 'Tablet Breakpoint Doc');
        await mockAutoItemizeDryRun(page, invoiceId);

        await autoItemizePage.goto(invoiceId, docId);
        await autoItemizePage.waitForAnalyzingDone();

        // ── At 850px (below 860px breakpoint) → single column ─────────────────
        const formBounds = await autoItemizePage.formColumn.boundingBox();
        const previewBounds = await autoItemizePage.previewColumn.boundingBox();

        expect(formBounds).not.toBeNull();
        expect(previewBounds).not.toBeNull();

        // Single column: form and preview should have similar widths (both ~full-width)
        // and form should be above preview (stacked layout)
        expect(formBounds!.y).toBeLessThan(previewBounds!.y);

        // Now test at 870px (just above the 860px breakpoint) → two columns
        await page.setViewportSize({ width: 870, height: 1100 });

        // Re-fetch bounds after viewport change
        const formBounds2 = await autoItemizePage.formColumn.boundingBox();
        const previewBounds2 = await autoItemizePage.previewColumn.boundingBox();

        expect(formBounds2).not.toBeNull();
        expect(previewBounds2).not.toBeNull();

        // Two columns: they should be at similar y positions (side-by-side)
        const verticalDiff = Math.abs(formBounds2!.y - previewBounds2!.y);
        expect(verticalDiff).toBeLessThan(50);
      } finally {
        if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
        if (vendorId) await deleteVendorViaApi(page, vendorId);
      }
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 13 — Happy path with per-row budget-line assignment
// ─────────────────────────────────────────────────────────────────────────────
//
// Story #1564 AC 18-21: Each extracted row has an "Assign To" cell that
// opens the two-step budget-line picker (same logic as InvoiceBudgetLinesSection).
//
// The picker flow:
//   1. "Assign…" button visible in the first row's "Assign To" cell
//   2. Click "Assign…" → picker modal opens (step 1: two side-by-side pickers)
//      - Left tab: h3 "Work Item" + WorkItemPicker search input
//        (placeholder="Search work items...")
//      - Right tab: h3 "Household Item" + HouseholdItemPicker search input
//        (placeholder="Search household items...")
//   3. Type in work-item search input → seeded work item appears → click it
//   4. Modal advances to step 2 (title: "Select Budget Line for {itemTitle}")
//      Budget lines for the selected work item are listed as buttons
//   5. Click the seeded budget line → picker closes
//   6. Row 1 shows assigned badge with description; row 2 still has "Assign…"
//   7. Click "Save" → POST /api/invoices/:id/auto-itemize intercepted
//   8. Payload lines[0] contains assignedBudgetLineId + assignedBudgetLineType: 'work_item'
//   9. Payload lines[1] does NOT contain assignedBudgetLineId
//  10. Navigation returns to invoice detail page

test.describe('Scenario 13 — Per-row assignment: "Assign…" picker flow', () => {
  test(
    'Assign a seeded work-item budget line to the first extracted row; Save payload reflects the assignment',
    async ({ page, testPrefix }) => {
      // Skip on narrow mobile — functional test requires visible table
      const vw = page.viewportSize()?.width ?? 1440;
      if (vw < 600) {
        test.skip(true, 'Functional test — skip on very narrow mobile');
        return;
      }

      const autoItemizePage = new AutoItemizePage(page);
      let vendorId = '';
      let invoiceId = '';
      let workItemId = '';
      // budgetLineId is the work_item_budgets.id of the seeded budget line
      let budgetLineId = '';
      const budgetLineDescription = `${testPrefix} AI-Assign BL`;

      try {
        // ── Seed: vendor, invoice, work item, work item budget ────────────────
        vendorId = await createVendorViaApi(page, `${testPrefix} AI-Assign Vendor`);
        invoiceId = await createInvoiceViaApi(page, vendorId, {
          amount: 1700,
          date: '2026-06-01',
          invoiceNumber: `${testPrefix}-AI-ASSIGN-001`,
        });
        workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} AI-Assign WI` });
        budgetLineId = await createWorkItemBudgetViaApi(page, workItemId, {
          description: budgetLineDescription,
          plannedAmount: 900,
        });

        const docId = 70001;
        const docTitle = 'Assignment Test Doc';

        await mockConfig(page, true);
        await mockPaperlessDocument(page, docId, docTitle);
        await mockAutoItemizeDryRun(page, invoiceId);

        await autoItemizePage.goto(invoiceId, docId);
        await autoItemizePage.waitForAnalyzingDone();

        // ── Verify "Assign…" button is visible in first row ────────────────────
        const firstAssignBtn = autoItemizePage.lineAssignButton(0);
        await expect(firstAssignBtn).toBeVisible();
        await expect(firstAssignBtn).toContainText('Assign…');

        // ── Verify second row also has "Assign…" (will remain unassigned) ──────
        const secondAssignBtn = autoItemizePage.lineAssignButton(1);
        await expect(secondAssignBtn).toBeVisible();

        // ── Click "Assign…" on first row → picker modal opens (step 1) ─────────
        await firstAssignBtn.click();
        await expect(autoItemizePage.pickerModal).toBeVisible();
        await expect(autoItemizePage.pickerModal).toContainText('Assign to Work Item or Household Item');

        // ── Step 1: Two side-by-side pickers visible ──────────────────────────
        // WorkItemPicker renders a plain <input type="text"> with the hardcoded placeholder
        await expect(autoItemizePage.pickerWorkItemSearchInput).toBeVisible();
        // HouseholdItemPicker renders a plain <input type="text"> with its hardcoded placeholder
        await expect(autoItemizePage.pickerHouseholdItemSearchInput).toBeVisible();

        // ── Type in the work-item search input to find the seeded WI ─────────
        await autoItemizePage.pickerWorkItemSearchInput.fill(`${testPrefix} AI-Assign WI`);

        // The SearchPicker opens a listbox with role="listbox" → role="option" buttons
        const wiOption = autoItemizePage.pickerModal.getByRole('option', {
          name: `${testPrefix} AI-Assign WI`,
        });
        await wiOption.waitFor({ state: 'visible' });
        await wiOption.click();

        // ── Step 2: Modal title changes; budget line list renders ─────────────
        // After selecting a work item via WorkItemPicker.onSelectItem, the picker hook
        // calls handleSelectItem(id, 'work_item', title) → pickerState.step=2 and
        // fetches budget lines for the selected item.
        const step2Modal = autoItemizePage.pickerStep2Modal();
        await expect(step2Modal).toBeVisible();

        // The seeded budget line appears as a button in the step-2 list
        const budgetLineButton = autoItemizePage.pickerBudgetLineRow(
          new RegExp(budgetLineDescription, 'i'),
        );
        await budgetLineButton.waitFor({ state: 'visible' });
        await budgetLineButton.click();

        // ── Picker modal closes after selection ───────────────────────────────
        await expect(autoItemizePage.pickerModal).not.toBeVisible();

        // ── Row 1 now shows the assigned badge ───────────────────────────────
        const firstAssignedBadge = autoItemizePage.lineAssignedBadge(0);
        await expect(firstAssignedBadge).toBeVisible();

        // Badge shows the budget line description
        const firstAssignedDesc = autoItemizePage.lineAssignedDescription(0);
        await expect(firstAssignedDesc).toContainText(budgetLineDescription);

        // Clear button is present inside the badge
        const clearBtn = autoItemizePage.lineClearAssignButton(0);
        await expect(clearBtn).toBeVisible();
        await expect(clearBtn).toHaveAttribute('aria-label', 'Clear budget line assignment');

        // ── Row 1 no longer shows "Assign…" (replaced by badge) ───────────────
        await expect(firstAssignBtn).not.toBeVisible();

        // ── Row 2 still shows "Assign…" (not assigned) ────────────────────────
        await expect(secondAssignBtn).toBeVisible();

        // ── Click Save; intercept the commit POST to capture and verify payload ─
        // Register waitForResponse BEFORE clicking Save.
        let capturedRequestBody: Record<string, unknown> | null = null;
        const commitResponsePromise = page.waitForResponse(async (resp) => {
          if (
            resp.url().includes(`/api/invoices/${invoiceId}/auto-itemize`) &&
            resp.request().method() === 'POST'
          ) {
            const body = resp.request().postDataJSON() as Record<string, unknown> | null;
            if (body && !((body as { dryRun?: boolean }).dryRun)) {
              capturedRequestBody = body;
              return true;
            }
          }
          return false;
        });

        // The commit POST is mocked by mockAutoItemizeDryRun only for dry-run.
        // For the commit (dryRun: false) we need a separate mock that responds with
        // a valid commit response. Set that up now, before clicking Save.
        const now = '2026-05-24T00:00:00.000Z';
        await page.route(`**/api/invoices/${invoiceId}/auto-itemize`, async (route: Route) => {
          const reqBody = route.request().postDataJSON() as { dryRun: boolean } | null;
          if (reqBody?.dryRun) {
            // Let dry-run fall through to the already-installed mockAutoItemizeDryRun handler
            await route.continue();
            return;
          }
          // Commit: respond with valid budget lines response
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              budgetLines: [
                {
                  id: `ibl-assign-e2e-0`,
                  workItemBudgetId: budgetLineId,
                  householdItemBudgetId: null,
                  itemizedAmount: 900.0,
                  description: budgetLineDescription,
                  plannedAmount: 900.0,
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
                  workItem: { id: workItemId, title: `${testPrefix} AI-Assign WI` },
                  householdItem: null,
                  isUnassigned: false,
                },
              ],
              remainingAmount: 800,
            }),
          });
        });

        await autoItemizePage.saveButton.click();
        await commitResponsePromise;

        // ── Verify captured payload ───────────────────────────────────────────
        expect(capturedRequestBody).not.toBeNull();

        // Cast through unknown to satisfy TypeScript (capturedRequestBody is initially typed as
        // Record<string,unknown>|null but the not.toBeNull() assertion above narrows it at runtime)
        const payload = capturedRequestBody as unknown as { lines?: unknown[] };
        const linesPayload = payload.lines;
        expect(Array.isArray(linesPayload)).toBe(true);
        expect(linesPayload!.length).toBeGreaterThanOrEqual(2);

        // lines[0] must contain assignedBudgetLineId and assignedBudgetLineType: 'work_item'
        const line0 = linesPayload![0] as Record<string, unknown>;
        expect(line0.assignedBudgetLineId).toBe(budgetLineId);
        expect(line0.assignedBudgetLineType).toBe('work_item');

        // lines[1] must NOT contain assignedBudgetLineId
        const line1 = linesPayload![1] as Record<string, unknown>;
        expect(line1.assignedBudgetLineId).toBeUndefined();

        // ── Navigation returns to invoice detail ──────────────────────────────
        await expect(page).toHaveURL(/\/budget\/invoices\/[^/]+$/);
        expect(page.url()).not.toContain('auto-itemize');

      } finally {
        if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
        if (vendorId) await deleteVendorViaApi(page, vendorId);
        if (workItemId) await deleteWorkItemViaApi(page, workItemId);
        // budget line is deleted via work item cascade (work_item_budgets → cascade)
      }
    },
  );
});
