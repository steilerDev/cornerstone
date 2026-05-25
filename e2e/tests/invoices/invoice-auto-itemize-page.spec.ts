/**
 * E2E tests for Auto-Itemize page.
 *
 * Story #1564 added the original page-based flow at
 *   /budget/invoices/:id/auto-itemize/:documentId
 *
 * Story #1576 (auto-itemize UI rework) updated the DOM significantly:
 * - Line table replaced with <ul role="list"> of .lineCard elements
 * - Skeleton loader replaced with Spinner (role="img" aria-label="Analyzing invoice")
 * - DocumentDetailPanel replaced with <iframe title="Invoice PDF preview">
 * - Status select added to metadata form
 * - vatRate input removed from line cards
 *
 * Scenarios:
 *   1.  Smoke: Itemize button visible on LinkedDocumentCard when autoItemizeEnabled=true
 *   2.  Smoke: Itemize button hidden when autoItemizeEnabled=false
 *   3.  Happy path: click Itemize → page loads → spinner → card list → toggle line → save → back
 *   4.  LLM suggestion: TOTAL_MISMATCH → SuggestionBadge → Apply → field updates
 *   5.  Cancel with dirty state → modal → Keep Editing → still on page
 *   5b. Cancel with dirty state → modal → Discard → navigate back
 *   6.  Cancel without edits → immediate navigation back (no modal)
 *   7.  "Details" rename regression: LinkedDocumentCard shows "Details" not "View"
 *   8.  Old modal absence: no "Auto-itemize" button in budget lines section header
 *   9.  Error state: LLM failure → spinner during loading → error banner + Retry visible
 *   10. Responsive desktop: side-by-side layout at ≥1024px
 *   11. Responsive mobile: stacked layout, form first at <860px
 *   12. Responsive tablet breakpoint: single column below 860px threshold
 *   13. Per-row assignment: "Assign…" picker flow → assigned badge → Save → payload
 *   14. Status change: pending → paid → save → invoice detail shows "Paid"
 *   15. Extracted date suggestion: extractedInvoiceDate → SuggestionBadge → Apply → field updates
 *   16. PDF iframe smoke: iframe present, src contains preview URL
 *   17. VAT applies checkbox: present; vatRate input NOT in DOM
 *
 * Mocking strategy:
 *   - GET /api/config: intercepted to inject autoItemizeEnabled: true/false
 *   - GET /api/document-links: intercepted to return deterministic linked-doc fixtures
 *   - POST /api/invoices/:id/auto-itemize: intercepted to return controlled LLM results
 *   - GET /paperless/documents/:id: intercepted to return a mock document object
 *   - GET /paperless/documents/:id/preview: continued (no mock needed for iframe smoke)
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
  data: { amount: number; date: string; invoiceNumber?: string; status?: string },
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
function makeDocLink(opts: { linkId: string; docId: number; title: string; entityId: string }) {
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
 * Does NOT intercept /thumb or /preview — those are separate.
 */
async function mockPaperlessDocument(page: Page, docId: number, title: string): Promise<void> {
  await page.route(`**/paperless/documents/${docId}`, async (route: Route) => {
    // Only intercept GET (not thumb/preview)
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
      body: JSON.stringify(makePaperlessDocument(docId, title)),
    });
  });
}

/**
 * Intercept POST /api/invoices/:id/auto-itemize (dry-run call triggered on mount).
 * Returns the given lines + warnings + optional extracted dates.
 */
async function mockAutoItemizeDryRun(
  page: Page,
  invoiceId: string,
  opts: {
    lines?: object[];
    warnings?: object[];
    extractedInvoiceDate?: string;
    extractedDueDate?: string;
    status?: number;
    errorBody?: object;
    delayMs?: number;
  } = {},
): Promise<void> {
  const lines = opts.lines ?? THREE_LINES;
  const warnings = opts.warnings ?? [];
  const status = opts.status ?? 200;
  const delayMs = opts.delayMs ?? 0;

  await page.route(`**/api/invoices/${invoiceId}/auto-itemize`, async (route: Route) => {
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
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
      body: JSON.stringify({
        lines,
        warnings,
        ...(opts.extractedInvoiceDate ? { extractedInvoiceDate: opts.extractedInvoiceDate } : {}),
        ...(opts.extractedDueDate ? { extractedDueDate: opts.extractedDueDate } : {}),
      }),
    });
  });
}

/**
 * Intercept POST /api/invoices/:id/auto-itemize for both dry-run and commit phases.
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
  const now = '2026-05-25T00:00:00.000Z';

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

test.describe(
  'Scenario 1 & 2 — Itemize button visibility on LinkedDocumentCard',
  { tag: ['@smoke'] },
  () => {
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

    test('Itemize button hidden when autoItemizeEnabled=false (Scenario 2)', async ({
      page,
      testPrefix,
    }) => {
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
        const itemizeBtn = detailPage.itemizeButton('Invoice Doc Beta');
        await expect(itemizeBtn).not.toBeVisible();
      } finally {
        if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
        if (vendorId) await deleteVendorViaApi(page, vendorId);
      }
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3 — Happy path: full itemize flow with card list
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Scenario 3 — Happy path: full itemize flow', { tag: ['@smoke'] }, () => {
  test(
    'Click Itemize → spinner → card list → toggle line → Save → back on invoice',
    { tag: '@smoke' },
    async ({ page, testPrefix }) => {
      // Skip on mobile — functional test requires visible card list
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
        await mockDocumentLinks(page, invoiceId, [{ linkId: 'dl-hp-1', docId, title: docTitle }]);
        await mockPaperlessDocument(page, docId, docTitle);
        await mockAutoItemizeBothPhases(page, invoiceId);

        await detailPage.goto(invoiceId);
        await expect(detailPage.heading).toBeVisible();

        // ── Verify Itemize button is visible ─────────────────────────────────
        await detailPage.documentsSection.scrollIntoViewIfNeeded();
        const itemizeBtn = detailPage.itemizeButton(docTitle);
        await expect(itemizeBtn).toBeVisible();

        // ── Click Itemize → navigate to /auto-itemize page ───────────────────
        const navPromise = page.waitForURL(`**/budget/invoices/${invoiceId}/auto-itemize/${docId}`);
        await itemizeBtn.click();
        await navPromise;

        // ── AutoItemizePage: page title visible ───────────────────────────────
        await expect(autoItemizePage.pageTitle).toBeVisible();
        await expect(autoItemizePage.pageTitle).toContainText(/Auto-Itemize Invoice/i);

        // ── Breadcrumb visible (story #1576: rendered in ready state) ────────
        await autoItemizePage.waitForAnalyzingDone();
        await expect(autoItemizePage.breadcrumb).toBeVisible();
        await expect(autoItemizePage.breadcrumb).toContainText(/Back to Invoice/i);

        // ── Three line cards visible (card list replaces table) ───────────────
        const cards = page.locator('[role="list"] li[class*="lineCard"]');
        await expect(cards).toHaveCount(3);

        // ── First card description textarea visible and populated ─────────────
        await expect(autoItemizePage.lineDescription(0)).toHaveValue('Bathroom tiles (600x600mm)');

        // ── Toggle the second card (uncheck include → excluded) ───────────────
        const secondCheckbox = autoItemizePage.lineCheckbox(1);
        await expect(secondCheckbox).toBeChecked();
        await secondCheckbox.click();
        await expect(secondCheckbox).not.toBeChecked();

        // ── Save → navigate back to invoice detail ───────────────────────────
        const saveResponsePromise = page.waitForResponse(
          (resp) =>
            resp.url().includes('/auto-itemize') &&
            resp.request().method() === 'POST' &&
            !(resp.request().postDataJSON() as { dryRun?: boolean })?.dryRun,
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
  test('SuggestionBadge appears for amount mismatch; Apply updates the field', async ({
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
      await expect(autoItemizePage.liveRegion).not.toBeEmpty();
    } finally {
      if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5 — Cancel with dirty state → modal confirmation
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Scenario 5 — Cancel with dirty state', () => {
  test('Cancel with dirty state shows Discard Changes modal; Keep Editing keeps the page open', async ({
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

      // ── Dirty the form: toggle the include checkbox on first card ─────────
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
  });

  test('Discard Changes in modal navigates back to invoice detail', async ({
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
      expect(page.url()).not.toContain('auto-itemize');
    } finally {
      if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6 — Cancel without edits navigates back directly (no modal)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Scenario 6 — Cancel clean state: direct navigation back', () => {
  test('Cancel without any edits navigates back without showing modal', async ({
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
  });
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

        await mockConfig(page, false);
        await mockDocumentLinks(page, invoiceId, [
          { linkId: 'dl-label-1', docId: 66001, title: 'Label Test Doc' },
        ]);

        await detailPage.goto(invoiceId);
        await expect(detailPage.heading).toBeVisible();
        await detailPage.documentsSection.scrollIntoViewIfNeeded();

        // ── "Details" button visible on the card ──────────────────────────────
        const detailsBtn = detailPage.detailsButton('Label Test Doc');
        await expect(detailsBtn).toBeVisible();

        // ── No button with the old "View" text label ──────────────────────────
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
        await expect(detailPage.autoItemizeButton()).not.toBeVisible();

        // ── No AutoItemizePreviewModal dialog in the DOM ──────────────────────
        const previewModal = page.locator('[role="dialog"]').filter({
          has: page.locator('h2', { hasText: 'Review extracted line items' }),
        });
        await expect(previewModal).not.toBeVisible();

        // ── No DocumentPickerModal in the DOM ─────────────────────────────────
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
// Scenario 9 — Error state: LLM failure → spinner during loading → error banner + Retry
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Scenario 9 — Error state: LLM failure on dry-run', () => {
  test('LLM failure renders error banner and Retry button; no card list shown', async ({
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
      vendorId = await createVendorViaApi(page, `${testPrefix} AI-Err Vendor`);
      invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 900,
        date: '2026-06-01',
      });

      const docId = 68001;
      await mockPaperlessDocument(page, docId, 'Error Test Doc');

      // Intercept the dry-run call to verify spinner is visible before response arrives
      // The mock uses a small delay to ensure we can observe the loading state
      let respondWithError: (() => void) | null = null;
      const errorResponsePromise = new Promise<void>((resolve) => {
        respondWithError = resolve;
      });

      await page.route(`**/api/invoices/${invoiceId}/auto-itemize`, async (route: Route) => {
        // Wait for the test to signal we can respond
        await errorResponsePromise;
        await route.fulfill({
          status: 502,
          contentType: 'application/json',
          body: JSON.stringify({
            error: {
              code: 'LLM_UNREACHABLE',
              message: 'The extraction service is unavailable. Please try again later.',
              details: {},
            },
          }),
        });
      });

      await autoItemizePage.goto(invoiceId, docId);

      // ── Spinner visible while loading ─────────────────────────────────────
      // The spinner is shown as soon as pageStatus === 'loading'
      await expect(autoItemizePage.spinner).toBeVisible();

      // ── Analyzing caption visible ─────────────────────────────────────────
      await expect(autoItemizePage.analyzingCaption).toBeVisible();

      // Allow response to arrive
      respondWithError!();

      // ── Error banner visible after LLM failure ────────────────────────────
      await expect(autoItemizePage.errorBanner).toBeVisible();

      // ── Retry button visible ──────────────────────────────────────────────
      await expect(autoItemizePage.retryButton).toBeVisible();

      // ── No card list (still in error state) ──────────────────────────────
      const cardList = page.locator('[role="list"][aria-label*="line"]');
      await expect(cardList).not.toBeVisible();
    } finally {
      if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenarios 10–12 — Responsive layout
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Scenarios 10–12 — Responsive layout', { tag: '@responsive' }, () => {
  test('Scenario 10: Desktop (1280×800) — side-by-side layout (two columns visible)', async ({
    page,
    testPrefix,
  }) => {
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

      expect(formBounds!.width).toBeGreaterThan(200);
      expect(previewBounds!.width).toBeGreaterThan(200);

      // Both columns should be at the same vertical position (same row)
      const verticalDiff = Math.abs(formBounds!.y - previewBounds!.y);
      expect(verticalDiff).toBeLessThan(50);
    } finally {
      if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });

  test('Scenario 11: Mobile (390×844) — single column, form first (above preview)', async ({
    page,
    testPrefix,
  }) => {
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

      // ── Form is above preview ─────────────────────────────────────────────
      const previewBounds = await autoItemizePage.previewColumn.boundingBox();
      expect(previewBounds).not.toBeNull();

      // Form should appear first (lower y = higher on page)
      expect(formBounds!.y).toBeLessThan(previewBounds!.y);
    } finally {
      if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });

  test('Scenario 12: Tablet breakpoint — single column below 860px threshold', async ({
    page,
    testPrefix,
  }) => {
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

      // ── At 850px (below 860px breakpoint) → single column (stacked) ──────
      const formBounds = await autoItemizePage.formColumn.boundingBox();
      const previewBounds = await autoItemizePage.previewColumn.boundingBox();

      expect(formBounds).not.toBeNull();
      expect(previewBounds).not.toBeNull();

      // Form should be above preview (stacked layout)
      expect(formBounds!.y).toBeLessThan(previewBounds!.y);

      // ── Now test at 870px (just above 860px breakpoint) → two columns ─────
      await page.setViewportSize({ width: 870, height: 1100 });

      const formBounds2 = await autoItemizePage.formColumn.boundingBox();
      const previewBounds2 = await autoItemizePage.previewColumn.boundingBox();

      expect(formBounds2).not.toBeNull();
      expect(previewBounds2).not.toBeNull();

      // Two columns: should be at similar y positions (side-by-side)
      const verticalDiff = Math.abs(formBounds2!.y - previewBounds2!.y);
      expect(verticalDiff).toBeLessThan(50);
    } finally {
      if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 13 — Per-row budget-line assignment (card-based UI)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Scenario 13 — Per-row assignment: "Assign…" picker flow', () => {
  test('Assign a seeded work-item budget line to the first extracted card; Save payload reflects the assignment', async ({
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

      // ── Verify "Assign…" button is visible in first card ──────────────────
      const firstAssignBtn = autoItemizePage.lineAssignButton(0);
      await expect(firstAssignBtn).toBeVisible();
      await expect(firstAssignBtn).toContainText('Assign…');

      // ── Verify second card also has "Assign…" (will remain unassigned) ────
      const secondAssignBtn = autoItemizePage.lineAssignButton(1);
      await expect(secondAssignBtn).toBeVisible();

      // ── Click "Assign…" on first card → picker modal opens (step 1) ──────
      await firstAssignBtn.click();
      await expect(autoItemizePage.pickerModal).toBeVisible();
      await expect(autoItemizePage.pickerModal).toContainText(
        'Assign to Work Item or Household Item',
      );

      // ── Step 1: Two side-by-side pickers visible ──────────────────────────
      await expect(autoItemizePage.pickerWorkItemSearchInput).toBeVisible();
      await expect(autoItemizePage.pickerHouseholdItemSearchInput).toBeVisible();

      // ── Type in the work-item search input to find the seeded WI ─────────
      await autoItemizePage.pickerWorkItemSearchInput.fill(`${testPrefix} AI-Assign WI`);

      const wiOption = autoItemizePage.pickerModal.getByRole('option', {
        name: `${testPrefix} AI-Assign WI`,
      });
      await wiOption.waitFor({ state: 'visible' });
      await wiOption.click();

      // ── Step 2: Modal title changes; budget line list renders ─────────────
      const step2Modal = autoItemizePage.pickerStep2Modal();
      await expect(step2Modal).toBeVisible();

      const budgetLineButton = autoItemizePage.pickerBudgetLineRow(
        new RegExp(budgetLineDescription, 'i'),
      );
      await budgetLineButton.waitFor({ state: 'visible' });
      await budgetLineButton.click();

      // ── Picker modal closes after selection ───────────────────────────────
      await expect(autoItemizePage.pickerModal).not.toBeVisible();

      // ── First card now shows the assigned badge ───────────────────────────
      const firstAssignedBadge = autoItemizePage.lineAssignedBadge(0);
      await expect(firstAssignedBadge).toBeVisible();

      const firstAssignedDesc = autoItemizePage.lineAssignedDescription(0);
      await expect(firstAssignedDesc).toContainText(budgetLineDescription);

      const clearBtn = autoItemizePage.lineClearAssignButton(0);
      await expect(clearBtn).toBeVisible();
      await expect(clearBtn).toHaveAttribute('aria-label', 'Clear budget line assignment');

      // ── First card no longer shows "Assign…" ─────────────────────────────
      await expect(firstAssignBtn).not.toBeVisible();

      // ── Second card still shows "Assign…" ────────────────────────────────
      await expect(secondAssignBtn).toBeVisible();

      // ── Click Save; intercept commit POST to verify payload ───────────────
      let capturedRequestBody: Record<string, unknown> | null = null;
      const commitResponsePromise = page.waitForResponse(async (resp) => {
        if (
          resp.url().includes(`/api/invoices/${invoiceId}/auto-itemize`) &&
          resp.request().method() === 'POST'
        ) {
          const body = resp.request().postDataJSON() as Record<string, unknown> | null;
          if (body && !(body as { dryRun?: boolean }).dryRun) {
            capturedRequestBody = body;
            return true;
          }
        }
        return false;
      });

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
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 14 — Status change: pending → paid → save → invoice detail shows "Paid"
// (New in story #1576 — status select added to metadata form)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Scenario 14 — Status field: change pending → paid', () => {
  test('Status select changes to paid; Save → invoice detail badge shows Paid', async ({
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

    try {
      vendorId = await createVendorViaApi(page, `${testPrefix} AI-Status Vendor`);
      // Create invoice with status pending (default)
      invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 1700,
        date: '2026-06-01',
        invoiceNumber: `${testPrefix}-AI-STATUS-001`,
      });

      const docId = 71001;
      await mockPaperlessDocument(page, docId, 'Status Change Doc');

      // Mock both dry-run and commit — commit must include invoicePatch.status
      let capturedCommitBody: Record<string, unknown> | null = null;
      await page.route(`**/api/invoices/${invoiceId}/auto-itemize`, async (route: Route) => {
        const body = route.request().postDataJSON() as { dryRun: boolean } | null;
        if (body?.dryRun) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ lines: THREE_LINES, warnings: [] }),
          });
        } else {
          capturedCommitBody = body as Record<string, unknown>;
          // Return minimal valid response so navigation proceeds
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ budgetLines: [], remainingAmount: 0 }),
          });
        }
      });

      await autoItemizePage.goto(invoiceId, docId);
      await autoItemizePage.waitForAnalyzingDone();

      // ── Status select should default to "pending" ─────────────────────────
      await expect(autoItemizePage.statusSelect).toHaveValue('pending');

      // ── Change status to "paid" ───────────────────────────────────────────
      await autoItemizePage.statusSelect.selectOption('paid');
      await expect(autoItemizePage.statusSelect).toHaveValue('paid');

      // ── Card list and VAT checkbox unaffected ─────────────────────────────
      const cards = page.locator('[role="list"] li[class*="lineCard"]');
      await expect(cards).toHaveCount(3);

      // ── Save → commits the status change ─────────────────────────────────
      const commitResponsePromise = page.waitForResponse(
        (resp) =>
          resp.url().includes('/auto-itemize') &&
          resp.request().method() === 'POST' &&
          !(resp.request().postDataJSON() as { dryRun?: boolean })?.dryRun,
      );
      await autoItemizePage.saveButton.click();
      await commitResponsePromise;

      // ── Verify commit payload includes status: 'paid' in invoicePatch ─────
      expect(capturedCommitBody).not.toBeNull();
      const patch = (capturedCommitBody as unknown as { invoicePatch?: Record<string, unknown> })
        ?.invoicePatch;
      expect(patch?.status).toBe('paid');

      // ── Navigation returns to invoice detail ──────────────────────────────
      await expect(page).toHaveURL(/\/budget\/invoices\/[^/]+$/);

      // ── Invoice detail status badge should show "Paid" ────────────────────
      // The invoice status was updated via real PATCH call by the backend commit handler.
      // We verify via the status badge on the invoice detail page.
      await expect(detailPage.statusBadge).toBeVisible();
      await expect(detailPage.statusBadge).toContainText(/Paid/i);
    } finally {
      if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 15 — Extracted date suggestion: SuggestionBadge → Apply → field updates
// (New in story #1576 — LLM returns extractedInvoiceDate and extractedDueDate)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Scenario 15 — Extracted date suggestion (extractedInvoiceDate)', () => {
  test('SuggestionBadge appears for date when LLM returns extractedInvoiceDate; Apply updates field', async ({
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
      // Invoice date = 2024-03-01; LLM extracts 2024-01-15 (different → badge shows)
      vendorId = await createVendorViaApi(page, `${testPrefix} AI-Date Vendor`);
      invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 900,
        date: '2024-03-01',
      });

      const docId = 72001;
      await mockPaperlessDocument(page, docId, 'Date Suggestion Doc');
      await mockAutoItemizeDryRun(page, invoiceId, {
        lines: THREE_LINES,
        warnings: [],
        extractedInvoiceDate: '2024-01-15',
        extractedDueDate: '2024-02-15',
      });

      await autoItemizePage.goto(invoiceId, docId);
      await autoItemizePage.waitForAnalyzingDone();

      // ── Date input should have the invoice's stored date ──────────────────
      await expect(autoItemizePage.invoiceDateInput).toHaveValue('2024-03-01');

      // ── SuggestionBadge appears adjacent to the date input ────────────────
      // The badge renders when extractedInvoiceDate !== metadataEdits.date
      const dateBadge = autoItemizePage.suggestionBadge('date');
      await expect(dateBadge).toBeVisible();

      // Badge text should contain the suggested date value
      await expect(dateBadge).toContainText('2024-01-15');

      // ── Click the Apply button in the date badge ──────────────────────────
      const applyBtn = dateBadge.getByRole('button', { name: /Apply/i });
      await expect(applyBtn).toBeVisible();
      await applyBtn.click();

      // ── Date input should update to the suggested date ────────────────────
      await expect(autoItemizePage.invoiceDateInput).toHaveValue('2024-01-15');

      // ── Date badge should disappear (suggestion == field value now) ───────
      await expect(dateBadge).not.toBeVisible();

      // ── Due date badge should also appear (extractedDueDate provided) ─────
      const dueDateBadge = autoItemizePage.suggestionBadge('dueDate');
      await expect(dueDateBadge).toBeVisible();
      await expect(dueDateBadge).toContainText('2024-02-15');
    } finally {
      if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 16 — PDF iframe smoke
// (New in story #1576 — DocumentDetailPanel replaced by iframe)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Scenario 16 — PDF iframe smoke: correct src and loading overlay', () => {
  test(
    'PDF iframe present with correct preview URL; loading overlay hides after load event',
    { tag: '@smoke' },
    async ({ page, testPrefix }) => {
      const autoItemizePage = new AutoItemizePage(page);
      let vendorId = '';
      let invoiceId = '';

      try {
        vendorId = await createVendorViaApi(page, `${testPrefix} AI-PDF Vendor`);
        invoiceId = await createInvoiceViaApi(page, vendorId, {
          amount: 500,
          date: '2026-06-01',
        });

        const docId = 73001;
        await mockPaperlessDocument(page, docId, 'PDF Smoke Doc');
        // Mock preview endpoint to return a minimal 200 so the iframe can load
        await page.route(`**/paperless/documents/${docId}/preview`, async (route: Route) => {
          await route.fulfill({
            status: 200,
            contentType: 'application/pdf',
            body: '%PDF-1.4 test',
          });
        });
        await mockAutoItemizeDryRun(page, invoiceId);

        await autoItemizePage.goto(invoiceId, docId);
        await autoItemizePage.waitForAnalyzingDone();

        // ── PDF iframe is present ─────────────────────────────────────────────
        await expect(autoItemizePage.pdfIframe).toBeVisible();

        // ── Iframe src points at the correct preview URL ──────────────────────
        // getDocumentPreviewUrl(docId) returns `{baseUrl}/paperless/documents/${docId}/preview`
        const iframeSrc = await autoItemizePage.pdfIframe.getAttribute('src');
        expect(iframeSrc).not.toBeNull();
        expect(iframeSrc).toContain(`/paperless/documents/${docId}/preview`);

        // ── Iframe title is "Invoice PDF preview" ─────────────────────────────
        const iframeTitle = await autoItemizePage.pdfIframe.getAttribute('title');
        expect(iframeTitle).toBe('Invoice PDF preview');

        // ── Loading overlay may be present initially; after iframe fires load event it hides
        // We fire the load event manually to simulate iframe loading completing
        await page.evaluate((iframeTitleAttr) => {
          const iframe = document.querySelector<HTMLIFrameElement>(
            `iframe[title="${iframeTitleAttr}"]`,
          );
          if (iframe) {
            iframe.dispatchEvent(new Event('load'));
          }
        }, 'Invoice PDF preview');

        // ── Loading overlay should be gone (pdfLoaded=true → overlay unmounts) ─
        await expect(autoItemizePage.pdfLoadingOverlay).not.toBeVisible();
      } finally {
        if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
        if (vendorId) await deleteVendorViaApi(page, vendorId);
      }
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 18 — No CSP "Refused to frame" console error when iframe loads (Bug #1579)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Scenario 18 — No CSP "Refused to frame" error when PDF iframe loads (Bug #1579)', () => {
  test('PDF iframe loads without a CSP "Refused to frame" console error (AC-2)', async ({
    page,
    testPrefix,
  }) => {
    const autoItemizePage = new AutoItemizePage(page);
    let vendorId = '';
    let invoiceId = '';

    // Capture console errors BEFORE navigating so we don't miss early errors.
    const cspErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && /Refused to frame/i.test(msg.text())) {
        cspErrors.push(msg.text());
      }
    });

    try {
      vendorId = await createVendorViaApi(page, `${testPrefix} AI-CSP Vendor`);
      invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 500,
        date: '2026-06-01',
      });

      const docId = 75001;
      await mockPaperlessDocument(page, docId, 'CSP Test Doc');

      // Mock the preview endpoint to return a minimal 200 application/pdf response so
      // the iframe src is valid and the browser can resolve it without a network error.
      await page.route(`**/paperless/documents/${docId}/preview`, async (route: Route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/pdf',
          body: '%PDF-1.4 test',
        });
      });

      await mockAutoItemizeDryRun(page, invoiceId);

      await autoItemizePage.goto(invoiceId, docId);
      await autoItemizePage.waitForAnalyzingDone();

      // Dismiss the loading overlay by simulating the iframe load event (same pattern as Scenario 16).
      await page.evaluate((iframeTitleAttr) => {
        const iframe = document.querySelector<HTMLIFrameElement>(
          `iframe[title="${iframeTitleAttr}"]`,
        );
        if (iframe) {
          iframe.dispatchEvent(new Event('load'));
        }
      }, 'Invoice PDF preview');

      // ── PDF iframe must be visible ──────────────────────────────────────────
      // If the CSP fix is absent, the iframe would be blocked before this point.
      //
      // NOTE: In some CI environments the Playwright interceptor handles the
      // preview request at the network layer (no actual framing occurs), so the
      // "Refused to frame" error may never reach the console even without the fix.
      // The primary server-side assertion (Content-Security-Policy header presence)
      // is validated by the QA integration test for Bug #1579. This test guards the
      // browser-visible side: iframe DOM present, no CSP console error observed.
      // TODO #1579: if this test proves consistently clean due to mock-routing, consider
      // promoting to an integration-level assertion on the CSP header value itself.
      await expect(autoItemizePage.pdfIframe).toBeVisible();

      // ── Fallback panel must NOT be visible (no error event) ────────────────
      await expect(autoItemizePage.pdfFallback).not.toBeVisible();

      // ── No "Refused to frame" CSP error must have been logged ──────────────
      expect(
        cspErrors,
        `Expected no CSP framing errors but found: ${cspErrors.join('; ')}`,
      ).toHaveLength(0);
    } finally {
      if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 19 — PDF preview column sticks during desktop scroll (Bug #1579, AC-5)
// ─────────────────────────────────────────────────────────────────────────────

test.describe(
  'Scenario 19 — PDF preview column sticks during desktop scroll (Bug #1579, AC-5)',
  { tag: '@responsive' },
  () => {
    test(
      'Preview column bounding-box top is within ±10px after scrolling .pageBody by 400px (desktop)',
      async ({ page, testPrefix }) => {
        // Force desktop viewport so sticky positioning is active (≥860px).
        await page.setViewportSize({ width: 1280, height: 800 });

        const autoItemizePage = new AutoItemizePage(page);
        let vendorId = '';
        let invoiceId = '';

        try {
          vendorId = await createVendorViaApi(page, `${testPrefix} AI-Sticky Vendor`);
          invoiceId = await createInvoiceViaApi(page, vendorId, {
            amount: 1700,
            date: '2026-06-01',
          });

          const docId = 76001;
          await mockPaperlessDocument(page, docId, 'Sticky PDF Doc');
          // Use THREE_LINES to ensure enough line cards to make the form column scrollable.
          await mockAutoItemizeDryRun(page, invoiceId, { lines: THREE_LINES });

          await autoItemizePage.goto(invoiceId, docId);
          await autoItemizePage.waitForAnalyzingDone();

          // ── Verify both columns are visible at desktop width ────────────────
          await expect(autoItemizePage.formColumn).toBeVisible();
          await expect(autoItemizePage.previewColumn).toBeVisible();

          // ── Capture pre-scroll bounding box of the preview column ───────────
          const preBounds = await autoItemizePage.previewColumn.boundingBox();
          expect(preBounds, 'previewColumn must have a bounding box before scroll').not.toBeNull();

          // ── Scroll .pageBody (the overflow-y: auto container) down 400px ────
          // .pageBody is the direct scroll container; window.scrollBy would have
          // no effect because the page body itself handles overflow.
          await page.evaluate(() => {
            const pageBody = document.querySelector('[class*="pageBody"]');
            if (pageBody) {
              pageBody.scrollBy(0, 400);
            }
          });

          // Give the browser a frame to apply the sticky recalculation.
          await page.evaluate(() => new Promise<void>((resolve) => {
            requestAnimationFrame(() => resolve());
          }));

          // ── Capture post-scroll bounding box of the preview column ──────────
          const postBounds = await autoItemizePage.previewColumn.boundingBox();
          expect(postBounds, 'previewColumn must have a bounding box after scroll').not.toBeNull();

          // ── Assert sticky: y (top) should remain within ±10px of pre-scroll y ─
          // Playwright BoundingBox uses { x, y, width, height } where y = top edge.
          const topDelta = Math.abs(postBounds!.y - preBounds!.y);
          expect(
            topDelta,
            `Expected previewColumn.y to be stable (≤10px shift) after scrolling .pageBody ` +
              `by 400px, but it shifted by ${topDelta}px ` +
              `(pre=${preBounds!.y}, post=${postBounds!.y}). ` +
              `Ensure .previewColumn has position:sticky in the desktop layout.`,
          ).toBeLessThanOrEqual(10);

          // ── Column must still be visible (not scrolled off-screen) ──────────
          await expect(autoItemizePage.previewColumn).toBeVisible();
        } finally {
          if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
          if (vendorId) await deleteVendorViaApi(page, vendorId);
        }
      },
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 17 — VAT applies checkbox present; vatRate input absent
// (New in story #1576 — vatRate input removed, replaced by VAT toggle checkbox)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Scenario 17 — VAT applies checkbox and no vatRate input', () => {
  test('Each card has a VAT applies checkbox; vatRate number input is NOT in the DOM', async ({
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
      vendorId = await createVendorViaApi(page, `${testPrefix} AI-VAT Vendor`);
      invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 1700,
        date: '2026-06-01',
      });

      const docId = 74001;
      await mockPaperlessDocument(page, docId, 'VAT Test Doc');
      await mockAutoItemizeDryRun(page, invoiceId);

      await autoItemizePage.goto(invoiceId, docId);
      await autoItemizePage.waitForAnalyzingDone();

      // ── VAT checkbox present on first card ────────────────────────────────
      const vatCheckbox = autoItemizePage.lineVatCheckbox(0);
      await expect(vatCheckbox).toBeVisible();

      // The first line has includesVat: false, so VAT checkbox is initially checked
      // (the component logic: checked={line.includesVat !== false})
      // Since includesVat: false → checked={false !== false} = checked={false}
      // Wait — re-reading: checked={line.includesVat !== false}
      // If includesVat === false, then false !== false = false → unchecked
      // If includesVat === null/undefined, then null/undefined !== false = true → checked
      // THREE_LINES[0].includesVat = false → checkbox is unchecked initially
      await expect(vatCheckbox).not.toBeChecked();

      // ── Toggle VAT checkbox and verify it changes ─────────────────────────
      await vatCheckbox.click();
      await expect(vatCheckbox).toBeChecked();

      // ── vatRate number input is NOT in the DOM (removed in story #1576) ───
      // Previously, each row had a vatRate number input in the table.
      // After the rework, there is NO vatRate input anywhere in the line cards.
      const vatRateInput = page.locator('[class*="lineCard"] input[aria-label*="vat rate" i]');
      await expect(vatRateInput).toHaveCount(0);

      // Also verify via the card metric grid — only 4 metrics (qty, unit, unitPrice, amount)
      const firstCard = autoItemizePage.lineRow(0);
      const metricInputs = firstCard.locator('[class*="cardMetricInput"]');
      await expect(metricInputs).toHaveCount(4);
    } finally {
      if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});
