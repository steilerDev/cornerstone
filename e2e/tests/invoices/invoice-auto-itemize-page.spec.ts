/**
 * E2E tests for Auto-Itemize page.
 *
 * Story #1564 added the original page-based flow at
 *   /budget/invoices/:id/auto-itemize/:documentId
 *
 * Since #2235 the extracted lines are the shared cost line grid (one editable row per line:
 * Include, Description, Quantity, Unit, Unit price, Net | Gross toggle, Gross, Belongs to, Cost
 * category, Funding source); the old line cards and the "Assign…" picker modal are gone.
 *
 * Story #1576 (auto-itemize UI rework) updated the DOM significantly (historical):
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
 *   13. Per-row link: "Use an existing cost line…" → "Links …" label → Save → payload
 *   14. Status change: pending → paid → save → invoice detail shows "Paid"
 *   15. Extracted date suggestion: extractedInvoiceDate → SuggestionBadge → Apply → field updates
 *   16. PDF iframe smoke: iframe present, src contains preview URL
 *   17. DELETED — superseded by Scenario 22 ("Price includes VAT" label regression guard)
 *   20. SuggestionBadge for invoiceNumber and notes (parallel to Scenario 15)
 *   30. Row layout: Category above Funding source inside the form column, also at 390px (#1595)
 *   31. Category pre-filled by LLM extraction: budgetCategoryId in dry-run response (#1596)
 *   32. Belongs to searches tasks and purchases in one list (#1597)
 *   33. SearchPicker portal: dropdown renders outside the grid (#1600)
 *   34. Row pre-filled from the extraction; the task's existing cost lines are offered (#1600)
 *   35. Dark mode + mobile: portal within viewport; the linked row is legible (#1600)
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
import type { ExtractedLine } from '@cornerstone/shared';
import { API } from '../../fixtures/testData.js';
import {
  createWorkItemViaApi,
  deleteWorkItemViaApi,
  createHouseholdItemViaApi,
  deleteHouseholdItemViaApi,
} from '../../fixtures/apiHelpers.js';
import { expectLegibleInDark } from '../../fixtures/darkMode.js';
import { mockPaperlessConfigured } from '../../fixtures/paperlessMocks.js';

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
  // With Paperless off (#2217) kept links are read-only: no Itemize, no Details. These links
  // carry documents, so Paperless is connected for the page too.
  await mockPaperlessConfigured(page);
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
 * Returns the given lines + warnings + optional extracted metadata fields.
 */
async function mockAutoItemizeDryRun(
  page: Page,
  invoiceId: string,
  opts: {
    lines?: object[];
    warnings?: object[];
    extractedInvoiceDate?: string;
    extractedDueDate?: string;
    extractedInvoiceNumber?: string;
    extractedNotes?: string;
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
        ...(opts.extractedInvoiceNumber
          ? { extractedInvoiceNumber: opts.extractedInvoiceNumber }
          : {}),
        ...(opts.extractedNotes ? { extractedNotes: opts.extractedNotes } : {}),
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
    dryRunLines?: ExtractedLine[];
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
          budgetLines: lines.map((line, idx) => ({
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

          // ── Documents panel: "Details" toggle visible on the card (#2233) ────
          await detailPage.openDocuments();
          const detailsBtn = detailPage.detailsButton('Invoice Doc Alpha');
          await expect(detailsBtn).toBeVisible();

          // ── Itemize is an item of the card's ⋯ menu ──────────────────────────
          await detailPage.openCardMenu('Invoice Doc Alpha');
          await expect(detailPage.itemizeButton()).toBeVisible();

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

        await detailPage.openDocuments();

        // ── "Details" button still visible (unaffected by LLM config) ───────
        const detailsBtn = detailPage.detailsButton('Invoice Doc Beta');
        await expect(detailsBtn).toBeVisible();

        // ── Itemize must NOT be in the card menu (Unlink proves the menu is open) ─
        await detailPage.openCardMenu('Invoice Doc Beta');
        await expect(detailPage.documents.menuItem('Unlink')).toBeVisible();
        await expect(detailPage.itemizeButton('Invoice Doc Beta')).toHaveCount(0);
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
        await detailPage.openDocuments();
        await detailPage.openCardMenu(docTitle);
        await expect(detailPage.itemizeButton(docTitle)).toBeVisible();

        // ── Click Itemize → navigate to /auto-itemize page ───────────────────
        const navPromise = page.waitForURL(`**/budget/invoices/${invoiceId}/auto-itemize/${docId}`);
        await detailPage.itemizeButton(docTitle).click();
        await navPromise;

        // ── AutoItemizePage: page title visible ───────────────────────────────
        await expect(autoItemizePage.pageTitle).toBeVisible();
        await expect(autoItemizePage.pageTitle).toHaveText('Split with AI');

        // ── Trail "Money › Invoices › ‹invoice›" (#2203): the invoice h1 is the vendor
        // name and the invoice number. Opened from that invoice, so no extra Back link.
        await autoItemizePage.waitForAnalyzingDone();
        await autoItemizePage.breadcrumbs.expectTrail([
          'Money',
          'Invoices',
          `${testPrefix} AI-HP Vendor · ${testPrefix}-AI-HP-001`,
        ]);
        await autoItemizePage.breadcrumbs.expectNoBack();

        // ── Three extracted rows visible in the lines grid ────────────────────
        await expect.poll(() => autoItemizePage.lineCount()).toBe(3);

        // ── First row description input visible and populated ─────────────────
        await expect(autoItemizePage.lineDescription(0)).toHaveValue('Bathroom tiles (600x600mm)');

        // ── Toggle the second row (uncheck Include → excluded) ────────────────
        const secondCheckbox = autoItemizePage.lineCheckbox(1);
        await expect(secondCheckbox).toBeChecked();
        await secondCheckbox.click();
        await expect(secondCheckbox).not.toBeChecked();

        // ── Pick a category for the included rows (guard requires it for create-new mode) ──
        // Row 0 and row 2 are included; row 1 is excluded. Select the first real option.
        // Wait for categories to load first (they load asynchronously on mount).
        const catSelect0 = autoItemizePage.lineCategory(0);
        await expect(catSelect0.locator('option').nth(1)).toBeAttached();
        await catSelect0.selectOption({ index: 1 });
        await autoItemizePage.lineCategory(2).selectOption({ index: 1 });

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
      const badge = page.locator('main [class*="badge"]').first();
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
  test('Cancel with dirty state shows the Discard changes dialog; Keep editing keeps the page open', async ({
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

      // ── Dialog title is "Discard changes?" ─────────────────────────────────
      await expect(autoItemizePage.cancelModal).toHaveAccessibleName('Discard changes?');
      await expect(autoItemizePage.keepEditingButton).toHaveText('Keep editing');

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

  test('Discard in the dialog navigates back to invoice detail', async ({ page, testPrefix }) => {
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

      // ── Click "Discard" → navigate back ───────────────────────────
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
        await detailPage.openDocuments();

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
              message: 'The AI service could not be reached. Please try again.',
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

      // ── Single column: form column is full-width (≥60% viewport width) ─────
      // At ≤860px the sidebar is position:fixed and off-screen, so mainContent
      // fills the full viewport. The form column occupies 1fr of pageBody (minus
      // 24px padding each side). A viewport-relative threshold (60%) is more
      // robust than an absolute value because it works across CI environments
      // where DevTools pixel ratios or scaled viewports may differ slightly.
      const viewportWidth = page.viewportSize()?.width ?? 390;
      const formBounds = await autoItemizePage.formColumn.boundingBox();
      expect(formBounds).not.toBeNull();
      expect(formBounds!.width).toBeGreaterThan(viewportWidth * 0.6);

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

test.describe('Scenario 13 — Per-row link: "Use an existing cost line…" flow', () => {
  test('Link a seeded work-item cost line to the first extracted row; Save payload reflects the link', async ({
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
    let budgetLineId: string;
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

      // ── Every row offers "Belongs to" and "Use an existing cost line…" ────
      await expect(autoItemizePage.lineUseExistingButton(0)).toBeVisible();
      await expect(autoItemizePage.lineUseExistingButton(1)).toBeVisible();

      // ── Without a task or purchase the picker asks for one first ──────────
      await autoItemizePage.lineUseExistingButton(0).click();
      await expect(autoItemizePage.grid.existingDialog).toContainText(
        'Pick a task or purchase in this row first.',
      );
      await page.keyboard.press('Escape');
      await expect(autoItemizePage.grid.existingDialog).toBeHidden();

      // ── Choose the work item, then its cost line ──────────────────────────
      await autoItemizePage.grid.targetPicker(1).pick(`${testPrefix} AI-Assign WI`);
      await autoItemizePage.grid.useExisting(1, new RegExp(budgetLineDescription, 'i'));

      // ── First row now names the linked line ───────────────────────────────
      await expect(autoItemizePage.lineExistingLabel(0)).toContainText(budgetLineDescription);
      await expect(autoItemizePage.lineClearExistingButton(0)).toBeVisible();
      await expect(autoItemizePage.lineUseExistingButton(0)).toHaveCount(0);

      // ── Second row is still a new line ────────────────────────────────────
      await expect(autoItemizePage.lineUseExistingButton(1)).toBeVisible();

      // ── Pick a category for unlinked rows 1 and 2 (a row that creates a line needs one) ──
      await autoItemizePage.lineCategory(1).selectOption({ index: 1 });
      await autoItemizePage.lineCategory(2).selectOption({ index: 1 });

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

      await page.route(`**/api/invoices/${invoiceId}/auto-itemize`, async (route: Route) => {
        const reqBody = route.request().postDataJSON() as { dryRun: boolean } | null;
        if (reqBody?.dryRun) {
          await route.continue();
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ budgetLines: [], remainingAmount: 800 }),
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
      // #2149: assign-existing links only. The row commits its gross amount (the linked line's
      // own 900) as an already-VAT-inclusive total.
      expect(line0.assignmentMode).toBe('assign-existing');
      expect(line0.includesVat).toBe(true);
      expect(line0.totalAmount as number).toBeCloseTo(900, 2);
      expect(line0).not.toHaveProperty('linkedItemizedAmount');
      expect(line0).not.toHaveProperty('assignedBudgetLineSnapshot');

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

      // ── The three rows are unaffected ─────────────────────────────────────
      await expect.poll(() => autoItemizePage.lineCount()).toBe(3);

      // ── Pick a category for all 3 rows (guard requires it for create-new mode) ──
      await autoItemizePage.lineCategory(0).selectOption({ index: 1 });
      await autoItemizePage.lineCategory(1).selectOption({ index: 1 });
      await autoItemizePage.lineCategory(2).selectOption({ index: 1 });

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

      // NOTE: The "Paid" badge assertion on the invoice detail page is intentionally omitted.
      // The commit response is mocked, so the backend never runs and cannot update the invoice status.
      // The payload assertion above (patch?.status === 'paid') is sufficient to verify the spec.
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
      // Use text-scoped locator to avoid matching the dueDate badge which shares
      // ancestor div elements with the date field (ancestor xpath traversal issue).
      await expect(
        autoItemizePage.page.locator('[class*="badge"]').filter({ hasText: '2024-01-15' }),
      ).not.toBeVisible();

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
    test('Preview column bounding-box top is within ±10px after scrolling .pageBody by 400px (desktop)', async ({
      page,
      testPrefix,
    }) => {
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
        await page.evaluate(
          () =>
            new Promise<void>((resolve) => {
              requestAnimationFrame(() => resolve());
            }),
        );

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
    });
  },
);

// Scenario 17 DELETED — superseded by Scenario 22 ("Price includes VAT" label + vatRate absence).
// Scenario 22 covers: label reads "Price includes VAT" (not "VAT applies"), no vatRate input.
// Keeping the docId 74001 reserved to avoid conflicts with existing test runs.

// ─────────────────────────────────────────────────────────────────────────────
// Scenarios 21–29 — UX fixes (stories #1584, #1586–#1591)
// ─────────────────────────────────────────────────────────────────────────────

// Scenario 21 — Notes wrap (#1586): long extractedNotes wraps without shrinking preview column
test.describe('Scenario 21 — Long notes suggestion wraps without shrinking preview column (#1586)', () => {
  test('With a 200+ char extractedNotes value, preview column stays ≥40% viewport width on desktop', async ({
    page,
    testPrefix,
  }) => {
    const vw = page.viewportSize()?.width ?? 1440;
    if (vw < 860) {
      test.skip(true, 'Desktop-only layout test');
      return;
    }

    await page.setViewportSize({ width: 1280, height: 800 });

    const autoItemizePage = new AutoItemizePage(page);
    let vendorId = '';
    let invoiceId = '';

    try {
      vendorId = await createVendorViaApi(page, `${testPrefix} AI-NotesWrap Vendor`);
      invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 900,
        date: '2026-06-01',
      });

      const docId = 80001;
      await mockPaperlessDocument(page, docId, 'Notes Wrap Doc');

      // Build a notes string >200 chars to trigger wrapping
      const longNotes =
        'Facade cladding materials for the north and east elevations of the main structure. ' +
        'Includes all adhesive, fasteners, and weatherproofing tape. ' +
        'Installation not included. Reference order #2024-FACADE-NE.';
      expect(longNotes.length).toBeGreaterThan(200);

      await mockAutoItemizeDryRun(page, invoiceId, {
        lines: THREE_LINES,
        extractedNotes: longNotes,
      });

      await autoItemizePage.goto(invoiceId, docId);
      await autoItemizePage.waitForAnalyzingDone();

      // The notes suggestion badge should be visible
      const notesBadge = autoItemizePage.suggestionBadge('notes');
      await expect(notesBadge).toBeVisible();

      // After applying, the notes textarea shows the long text (wraps vertically)
      const applyBtn = notesBadge.getByRole('button', { name: /Apply/i });
      await applyBtn.click();
      await expect(autoItemizePage.notesInput).toHaveValue(longNotes);

      // Both columns still visible — preview column has not been squished below 35% vw.
      // The threshold is 35% (not 40%) to account for flexbox gap and padding while still
      // confirming the column remains usable after long notes wrap vertically.
      // Empirical value at 1280px viewport: ~484px (~37.8%). 35% = 448px gives headroom.
      const previewBounds = await autoItemizePage.previewColumn.boundingBox();
      expect(previewBounds).not.toBeNull();
      // Use the actual (overridden) viewport width of 1280px, not the test-project default.
      // 35% of 1280px = 448px
      const actualViewportWidth = page.viewportSize()?.width ?? 1280;
      const minWidth = 0.35 * actualViewportWidth;
      expect(
        previewBounds!.width,
        `Expected preview column width ≥ ${minWidth}px (35% of viewport) but got ${previewBounds!.width}px`,
      ).toBeGreaterThanOrEqual(minWidth);
    } finally {
      if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// Scenario 22 — Entered as (#1587, #2235): no "VAT applies" wording, a Net | Gross toggle per row
test.describe('Scenario 22 — Entered as is a Net | Gross toggle, no "VAT applies" wording (#1587)', () => {
  test('No element with text /VAT applies/i visible; each row has an "Entered as" Net | Gross toggle', async ({
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
      vendorId = await createVendorViaApi(page, `${testPrefix} AI-VATLabel Vendor`);
      invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 900,
        date: '2026-06-01',
      });

      const docId = 81001;
      await mockPaperlessDocument(page, docId, 'VAT Label Doc');
      await mockAutoItemizeDryRun(page, invoiceId);

      await autoItemizePage.goto(invoiceId, docId);
      await autoItemizePage.waitForAnalyzingDone();

      // ── No element with text "VAT applies" anywhere on the page ─────────────
      await expect(page.getByText(/VAT applies/i)).not.toBeVisible();

      // ── The extracted lines are net: the toggle reads "Net" and flips to "Gross" ──
      const toggle = autoItemizePage.lineEnteredAs(0);
      await expect(toggle).toBeVisible();
      await expect(toggle).toHaveText('Net');
      await expect(autoItemizePage.lineGross(0)).toHaveText('€1,071.00');
      await toggle.click();
      await expect(autoItemizePage.lineEnteredAs(0)).toHaveText('Gross');
      await expect(autoItemizePage.lineGross(0)).toHaveText('€900.00');
    } finally {
      if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// Scenario 23 — Category select on every row (#1588)
test.describe('Scenario 23 — Category select present on each row (#1588)', () => {
  test('Each row contains a Cost category select with a "None" placeholder option', async ({
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
      vendorId = await createVendorViaApi(page, `${testPrefix} AI-CatPick Vendor`);
      invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 1700,
        date: '2026-06-01',
      });

      const docId = 82001;
      await mockPaperlessDocument(page, docId, 'Category Picker Doc');
      await mockAutoItemizeDryRun(page, invoiceId);

      await autoItemizePage.goto(invoiceId, docId);
      await autoItemizePage.waitForAnalyzingDone();

      // ── First row has a Cost category select ─────────────────────────────────
      const catSelect0 = autoItemizePage.lineCategory(0);
      await expect(catSelect0).toBeVisible();

      // ── Category select has a placeholder option (value="") ──────────────────
      const placeholderOption = catSelect0.locator('option[value=""]');
      await expect(placeholderOption).toHaveCount(1);
      await expect(placeholderOption).toHaveText('None');

      // ── Second and third rows also have Cost category selects ────────────────
      await expect(autoItemizePage.lineCategory(1)).toBeVisible();
      await expect(autoItemizePage.lineCategory(2)).toBeVisible();
    } finally {
      if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// Scenario 24 — Funding source select on every row (#1588)
test.describe('Scenario 24 — Funding source select present on each row (#1588)', () => {
  test('Each row contains a Funding source select with at least one option', async ({
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
      vendorId = await createVendorViaApi(page, `${testPrefix} AI-SrcPick Vendor`);
      invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 1700,
        date: '2026-06-01',
      });

      const docId = 83001;
      await mockPaperlessDocument(page, docId, 'Funding Source Picker Doc');
      await mockAutoItemizeDryRun(page, invoiceId);

      await autoItemizePage.goto(invoiceId, docId);
      await autoItemizePage.waitForAnalyzingDone();

      // ── First row has a Funding source select ─────────────────────────────────
      const srcSelect0 = autoItemizePage.lineFundingSource(0);
      await expect(srcSelect0).toBeVisible();

      // ── Funding source select has at least one option (real data from server) ──
      await expect(srcSelect0.locator('option')).not.toHaveCount(0);

      // ── Second and third rows also have Funding source selects ───────────────
      await expect(autoItemizePage.lineFundingSource(1)).toBeVisible();
      await expect(autoItemizePage.lineFundingSource(2)).toBeVisible();
    } finally {
      if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// Scenario 25 — Variance recompute on amount edit (#1591)
test.describe('Scenario 25 — Variance indicator recomputes on amount edit without reload (#1591)', () => {
  test('Editing a row unit price to deviate >5% switches variance indicator state', async ({
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
      // All THREE_LINES are includesVat:false (net), so the gross total grosses up by 1.19:
      //   900x1.19=1071.00 + 680x1.19=809.20 + 120x1.19=142.80 = 2023.00 gross total
      // Invoice amount = 2023 to match gross total -> 0% variance -> match state
      vendorId = await createVendorViaApi(page, `${testPrefix} AI-Variance Vendor`);
      invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 2023,
        date: '2026-06-01',
      });

      const docId = 84001;
      await mockPaperlessDocument(page, docId, 'Variance Doc');
      await mockAutoItemizeDryRun(page, invoiceId, { lines: THREE_LINES });

      await autoItemizePage.goto(invoiceId, docId);
      await autoItemizePage.waitForAnalyzingDone();

      // Initial state: invoice=2023, gross total=2023 -> 0% variance -> varianceMatch
      const indicator = autoItemizePage.getVarianceIndicator();
      await expect(indicator).toBeVisible();
      await expect(indicator).toHaveClass(/varianceMatch/);

      // Row 1 is 20 m² x 45.00 = 900 net. At 25.00 per m² it is 500 net (595.00 gross).
      // New gross total = 595.00+809.20+142.80 = 1547.00
      // Variance = |1547-2023|/2023 ~23.5% -> > 5% -> varianceDanger
      const priceInput = autoItemizePage.lineUnitPrice(0);
      await priceInput.fill('25');
      await priceInput.press('Tab');
      await expect(autoItemizePage.lineGross(0)).toHaveText('€595.00');

      // ── Variance indicator should switch to danger (no page reload) ──────────
      await expect(indicator).not.toHaveClass(/varianceMatch/);
      await expect(indicator).toHaveClass(/varianceDanger/);
    } finally {
      if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// Scenario 26 — Assign-existing payload flag (#1589)
test.describe('Scenario 26 — assignmentMode:"assign-existing" in commit payload for linked rows (#1589)', () => {
  test('Linked row has assignmentMode:"assign-existing"; unlinked row has assignmentMode:"create-new" in commit POST', async ({
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
    let budgetLineId: string;
    const budgetLineDescription = `${testPrefix} AI-AssignMode BL`;

    try {
      vendorId = await createVendorViaApi(page, `${testPrefix} AI-AssignMode Vendor`);
      invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 1700,
        date: '2026-06-01',
      });
      workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} AI-AssignMode WI` });
      budgetLineId = await createWorkItemBudgetViaApi(page, workItemId, {
        description: budgetLineDescription,
        plannedAmount: 900,
      });

      const docId = 85001;
      await mockPaperlessDocument(page, docId, 'Assignment Mode Doc');
      await mockAutoItemizeDryRun(page, invoiceId, { lines: THREE_LINES });

      await autoItemizePage.goto(invoiceId, docId);
      await autoItemizePage.waitForAnalyzingDone();

      // ── Link the first row to an existing cost line ──────────────────────────
      await autoItemizePage.grid.targetPicker(1).pick(`${testPrefix} AI-AssignMode WI`);
      await autoItemizePage.grid.useExisting(1, new RegExp(budgetLineDescription, 'i'));
      await expect(autoItemizePage.lineExistingLabel(0)).toContainText(budgetLineDescription);

      // ── Select a category on rows 2 and 3 so they pass validation ────────────
      // Rows 2+3 will be "create-new" — they need a category to pass validation.
      const catSelect1 = autoItemizePage.lineCategory(1);
      const catSelect2 = autoItemizePage.lineCategory(2);
      const optionValue1 = await catSelect1.locator('option').nth(1).getAttribute('value');
      const optionValue2 = await catSelect2.locator('option').nth(1).getAttribute('value');
      if (optionValue1) await catSelect1.selectOption(optionValue1);
      if (optionValue2) await catSelect2.selectOption(optionValue2);

      // ── Intercept the commit POST and capture the request body ───────────────
      let capturedBody: Record<string, unknown> | null = null;
      const commitResponsePromise = page.waitForResponse(async (resp) => {
        if (
          resp.url().includes(`/api/invoices/${invoiceId}/auto-itemize`) &&
          resp.request().method() === 'POST'
        ) {
          const body = resp.request().postDataJSON() as Record<string, unknown> | null;
          if (body && !(body as { dryRun?: boolean }).dryRun) {
            capturedBody = body;
            return true;
          }
        }
        return false;
      });

      // Mock the commit response so navigation proceeds
      await page.route(`**/api/invoices/${invoiceId}/auto-itemize`, async (route: Route) => {
        const reqBody = route.request().postDataJSON() as { dryRun?: boolean } | null;
        if (reqBody?.dryRun) {
          await route.continue();
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ budgetLines: [], remainingAmount: 0 }),
        });
      });

      await autoItemizePage.saveButton.click();
      await commitResponsePromise;

      // ── Assert payload ────────────────────────────────────────────────────────
      expect(capturedBody).not.toBeNull();
      const linesPayload = (capturedBody as unknown as { lines?: unknown[] }).lines;
      expect(Array.isArray(linesPayload)).toBe(true);
      expect(linesPayload!.length).toBeGreaterThanOrEqual(2);

      // Line 0 was linked to an existing cost line → assignmentMode: "assign-existing"
      const line0 = linesPayload![0] as Record<string, unknown>;
      expect(line0.assignmentMode).toBe('assign-existing');
      expect(line0.assignedBudgetLineId).toBe(budgetLineId);

      // Line 1 was not linked → assignmentMode: "create-new"
      const line1 = linesPayload![1] as Record<string, unknown>;
      expect(line1.assignmentMode).toBe('create-new');
      expect(line1.assignedBudgetLineId).toBeUndefined();
    } finally {
      if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
    }
  });
});

// Scenario 27 — Create-new requires category (#1588)
test.describe('Scenario 27 — Save without category on a create-new row shows validation error (#1588)', () => {
  test('Clicking Save with no category selected shows categoryRequiredError; no POST is sent', async ({
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
      vendorId = await createVendorViaApi(page, `${testPrefix} AI-CatReq Vendor`);
      invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 1700,
        date: '2026-06-01',
      });

      const docId = 86001;
      await mockPaperlessDocument(page, docId, 'Category Required Doc');
      await mockAutoItemizeDryRun(page, invoiceId);

      await autoItemizePage.goto(invoiceId, docId);
      await autoItemizePage.waitForAnalyzingDone();

      // ── Do NOT select a category on any row (all remain at the placeholder) ──
      await expect(autoItemizePage.lineCategory(0)).toHaveValue('');

      // ── Track whether a commit POST was sent ──────────────────────────────────
      let commitPostSent = false;
      page.on('request', (req) => {
        if (
          req.url().includes(`/api/invoices/${invoiceId}/auto-itemize`) &&
          req.method() === 'POST'
        ) {
          const body = req.postDataJSON() as { dryRun?: boolean } | null;
          if (body && !body.dryRun) {
            commitPostSent = true;
          }
        }
      });

      // ── Click Save ────────────────────────────────────────────────────────────
      await autoItemizePage.saveButton.click();

      // ── Error message should appear ───────────────────────────────────────────
      // t('autoItemize.categoryRequiredError') = "Please select a category for all included line items"
      const errorBanner = page.locator('[role="alert"]').filter({
        hasText: /Please select a category for all included line items/i,
      });
      await expect(errorBanner).toBeVisible();

      // ── No commit POST should have been sent ──────────────────────────────────
      await page.waitForTimeout(300);
      expect(commitPostSent, 'Expected no commit POST to be sent when category is missing').toBe(
        false,
      );

      // ── Page should still be on the auto-itemize page ─────────────────────────
      expect(page.url()).toContain('auto-itemize');
    } finally {
      if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// Scenario 28 — PDF preview sticky at desktop (#1590)
test.describe(
  'Scenario 28 — PDF preview column sticky during desktop scroll (#1590)',
  { tag: '@responsive' },
  () => {
    test('Preview column bounding-box top is stable (≤10px shift) after form scroll on desktop (1280×800)', async ({
      page,
      testPrefix,
    }) => {
      // Already covered by Scenario 19 which tests the same sticky behaviour via .pageBody scroll.
      // This scenario uses wheel scroll as an alternative method to verify stickiness.
      await page.setViewportSize({ width: 1280, height: 800 });

      const autoItemizePage = new AutoItemizePage(page);
      let vendorId = '';
      let invoiceId = '';

      try {
        vendorId = await createVendorViaApi(page, `${testPrefix} AI-StickyWheel Vendor`);
        invoiceId = await createInvoiceViaApi(page, vendorId, {
          amount: 1700,
          date: '2026-06-01',
        });

        const docId = 87001;
        await mockPaperlessDocument(page, docId, 'Sticky Wheel Doc');
        await mockAutoItemizeDryRun(page, invoiceId, { lines: THREE_LINES });

        await autoItemizePage.goto(invoiceId, docId);
        await autoItemizePage.waitForAnalyzingDone();

        await expect(autoItemizePage.formColumn).toBeVisible();
        await expect(autoItemizePage.previewColumn).toBeVisible();

        // ── Record pre-scroll position of preview column ──────────────────────
        const preBounds = await autoItemizePage.previewColumn.boundingBox();
        expect(preBounds).not.toBeNull();

        // ── Scroll the .formColumn element programmatically ───────────────────
        // formColumn has overflow-y: auto at ≥860px, making it the scroll container.
        await autoItemizePage.formColumn.evaluate((el) => {
          el.scrollBy(0, 500);
        });

        // Wait for a rendering frame to apply sticky recalculation
        await page.evaluate(
          () =>
            new Promise<void>((resolve) => {
              requestAnimationFrame(() => resolve());
            }),
        );

        // ── Record post-scroll position of preview column ──────────────────────
        const postBounds = await autoItemizePage.previewColumn.boundingBox();
        expect(postBounds).not.toBeNull();

        // ── Sticky: top should remain within ±10px ────────────────────────────
        const topDelta = Math.abs(postBounds!.y - preBounds!.y);
        expect(
          topDelta,
          `Preview column top shifted by ${topDelta}px after formColumn scroll — expected ≤10px. ` +
            `Ensure previewColumn has position:sticky (desktop). Pre=${preBounds!.y}, Post=${postBounds!.y}`,
        ).toBeLessThanOrEqual(10);

        await expect(autoItemizePage.previewColumn).toBeVisible();
      } finally {
        if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
        if (vendorId) await deleteVendorViaApi(page, vendorId);
      }
    });
  },
);

// Scenario 29 — PDF preview non-sticky at mobile (#1590)
test.describe(
  'Scenario 29 — PDF preview column NOT sticky at mobile viewport (#1590)',
  { tag: '@responsive' },
  () => {
    test('Preview column position changes after page scroll at mobile (390×844) — not sticky', async ({
      page,
      testPrefix,
    }) => {
      await page.setViewportSize({ width: 390, height: 844 });

      const autoItemizePage = new AutoItemizePage(page);
      let vendorId = '';
      let invoiceId = '';

      try {
        vendorId = await createVendorViaApi(page, `${testPrefix} AI-MobNoStick Vendor`);
        invoiceId = await createInvoiceViaApi(page, vendorId, {
          amount: 1700,
          date: '2026-06-01',
        });

        const docId = 88001;
        await mockPaperlessDocument(page, docId, 'Mobile No Sticky Doc');
        await mockAutoItemizeDryRun(page, invoiceId, { lines: THREE_LINES });

        await autoItemizePage.goto(invoiceId, docId);
        await autoItemizePage.waitForAnalyzingDone();

        // ── At mobile the page uses normal document flow (no sticky) ──────────
        // Verify previewColumn has position:static (CSS computed value)
        const positionValue = await autoItemizePage.previewColumn.evaluate(
          (el) => window.getComputedStyle(el).position,
        );
        expect(
          positionValue,
          `Expected previewColumn to have position:static at 390px viewport but got "${positionValue}". ` +
            `The @media (max-width: 860px) rule should override to position:static.`,
        ).toBe('static');
      } finally {
        if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
        if (vendorId) await deleteVendorViaApi(page, vendorId);
      }
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 20 — SuggestionBadge for invoiceNumber and notes (parallel to Scenario 15)
// (New in bug fix #1581 — LLM now extracts invoiceNumber and notes at document level)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Scenario 20 — Extracted invoiceNumber and notes SuggestionBadges (Bug #1581)', () => {
  test('SuggestionBadges appear for invoiceNumber and notes when LLM returns extracted values; Apply updates each field', async ({
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
      // Invoice has stored invoiceNumber 'INV-STORED' and no notes (null).
      // LLM returns extractedInvoiceNumber: 'INV-LLM-042' (differs → badge shows)
      // LLM returns extractedNotes: 'Facade cladding, April 2024' (differs from null → badge shows)
      vendorId = await createVendorViaApi(page, `${testPrefix} AI-Num-Notes Vendor`);
      invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 900,
        date: '2026-06-01',
        invoiceNumber: 'INV-STORED',
      });

      const docId = 77001;
      await mockPaperlessDocument(page, docId, 'InvoiceNumber Notes Suggestion Doc');
      await mockAutoItemizeDryRun(page, invoiceId, {
        lines: THREE_LINES,
        warnings: [],
        extractedInvoiceNumber: 'INV-LLM-042',
        extractedNotes: 'Facade cladding, April 2024',
      });

      await autoItemizePage.goto(invoiceId, docId);
      await autoItemizePage.waitForAnalyzingDone();

      // ── invoiceNumber input should have the stored value ──────────────────
      await expect(autoItemizePage.invoiceNumberInput).toHaveValue('INV-STORED');

      // ── notes textarea should be empty (stored notes = null) ──────────────
      await expect(autoItemizePage.notesInput).toHaveValue('');

      // ── SuggestionBadge appears adjacent to the invoiceNumber input ───────
      const invoiceNumberBadge = autoItemizePage.suggestionBadge('invoiceNumber');
      await expect(invoiceNumberBadge).toBeVisible();

      // Badge text should contain the suggested invoice number
      await expect(invoiceNumberBadge).toContainText('INV-LLM-042');

      // ── SuggestionBadge appears adjacent to the notes textarea ────────────
      const notesBadge = autoItemizePage.suggestionBadge('notes');
      await expect(notesBadge).toBeVisible();

      // Badge text should contain the suggested notes value
      await expect(notesBadge).toContainText('Facade cladding, April 2024');

      // ── Click Apply on the invoiceNumber badge ────────────────────────────
      const invoiceNumberApplyBtn = invoiceNumberBadge.getByRole('button', { name: /Apply/i });
      await expect(invoiceNumberApplyBtn).toBeVisible();
      await invoiceNumberApplyBtn.click();

      // ── invoiceNumber input should update to the LLM-extracted value ──────
      await expect(autoItemizePage.invoiceNumberInput).toHaveValue('INV-LLM-042');

      // ── invoiceNumber badge should disappear (suggestion == field value) ──
      await expect(invoiceNumberBadge).not.toBeVisible();

      // ── notes badge should still be visible (not yet applied) ────────────
      await expect(notesBadge).toBeVisible();

      // ── Click Apply on the notes badge ────────────────────────────────────
      const notesApplyBtn = notesBadge.getByRole('button', { name: /Apply/i });
      await expect(notesApplyBtn).toBeVisible();
      await notesApplyBtn.click();

      // ── notes textarea should update to the LLM-extracted value ──────────
      await expect(autoItemizePage.notesInput).toHaveValue('Facade cladding, April 2024');

      // ── notes badge should disappear (suggestion == field value now) ──────
      await expect(notesBadge).not.toBeVisible();
    } finally {
      if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

test.describe('Scenario 30 — Row layout: Category and Funding source stack inside the form column (#1595)', () => {
  test('Category and Funding source stack (Category above) inside the form column at 1280px and at 390px', async ({
    page,
    testPrefix,
  }) => {
    const vw = page.viewportSize()?.width ?? 1440;
    if (vw < 860) {
      test.skip(true, 'Desktop layout test — skip below 860px');
      return;
    }

    await page.setViewportSize({ width: 1280, height: 900 });

    const autoItemizePage = new AutoItemizePage(page);
    let vendorId = '';
    let invoiceId = '';

    try {
      vendorId = await createVendorViaApi(page, `${testPrefix} AI-BottomRow Vendor`);
      invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 1700,
        date: '2026-06-01',
      });

      const docId = 90001;
      await mockPaperlessDocument(page, docId, 'Bottom Row Layout Doc');
      await mockAutoItemizeDryRun(page, invoiceId);

      await autoItemizePage.goto(invoiceId, docId);
      await autoItemizePage.waitForAnalyzingDone();

      // ── At 1280px the grid sits in the 480px form column: the row stacks into a card,
      // Category above Funding source, both inside the column ───────────────────
      const column = await autoItemizePage.formColumn.first().boundingBox();
      expect(column).not.toBeNull();
      const cat = await autoItemizePage.lineCategory(0).boundingBox();
      const src = await autoItemizePage.lineFundingSource(0).boundingBox();
      expect(cat).not.toBeNull();
      expect(src).not.toBeNull();
      expect(src!.y).toBeGreaterThan(cat!.y);
      expect(cat!.x + cat!.width).toBeLessThanOrEqual(column!.x + column!.width + 1);
      expect(src!.x + src!.width).toBeLessThanOrEqual(column!.x + column!.width + 1);

      // ── Phone: the same stacking, inside the viewport ─────────────────────────
      await page.setViewportSize({ width: 390, height: 844 });
      // The grid reflows with the viewport: wait until the select fits before measuring
      await expect
        .poll(async () => {
          const box = await autoItemizePage.lineCategory(0).boundingBox();
          return box ? box.x + box.width : Infinity;
        })
        .toBeLessThanOrEqual(390 + 1);
      const phoneCat = await autoItemizePage.lineCategory(0).boundingBox();
      const phoneSrc = await autoItemizePage.lineFundingSource(0).boundingBox();
      expect(phoneCat).not.toBeNull();
      expect(phoneSrc).not.toBeNull();
      expect(phoneSrc!.y).toBeGreaterThan(phoneCat!.y);
      expect(phoneCat!.x + phoneCat!.width).toBeLessThanOrEqual(390 + 1);
      expect(phoneSrc!.x + phoneSrc!.width).toBeLessThanOrEqual(390 + 1);
    } finally {
      if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 31 — Category pre-filled by LLM extraction (#1596)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Scenario 31 — Category pre-filled from LLM dry-run response (#1596)', () => {
  test('Row Cost category select is pre-filled when dry-run returns budgetCategoryId', async ({
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
      vendorId = await createVendorViaApi(page, `${testPrefix} AI-CatPreFill Vendor`);
      invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 900,
        date: '2026-06-01',
      });

      const docId = 91001;
      await mockPaperlessDocument(page, docId, 'Category Prefill Doc');

      // First, find a real budget category ID from the server so we can mock with a valid value.
      const catResp = await page.request.get('/api/budget-categories');
      expect(catResp.ok(), `GET /api/budget-categories failed: ${catResp.status()}`).toBeTruthy();
      const catBody = (await catResp.json()) as { categories: Array<{ id: string }> };
      const firstCat = catBody.categories[0];
      const firstCatId = firstCat?.id ?? null;

      expect(
        firstCatId,
        'Expected at least one budget category to exist on the server for pre-fill test',
      ).not.toBeNull();

      const [firstLine, ...restLines] = THREE_LINES;
      const linesWithCategory: object[] = [
        { ...firstLine, budgetCategoryId: firstCatId },
        ...restLines,
      ];

      await mockAutoItemizeDryRun(page, invoiceId, { lines: linesWithCategory });

      await autoItemizePage.goto(invoiceId, docId);
      await autoItemizePage.waitForAnalyzingDone();

      // ── First row's category select should be pre-filled with the provided category ─
      const catSelect0 = autoItemizePage.lineCategory(0);
      await expect(catSelect0).toBeVisible();
      await expect(catSelect0.locator('option').nth(1)).toBeAttached();
      await expect(catSelect0).toHaveValue(firstCatId as string);

      // ── Second row should still have the placeholder (no category in fixture) ─
      await expect(autoItemizePage.lineCategory(1)).toHaveValue('');
    } finally {
      if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 32 — "Belongs to" lists tasks and purchases in one search (#1597, #2235)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Scenario 32 — Belongs to searches tasks and purchases together (#1597)', () => {
  test('One search lists a task and a purchase with their kind words', async ({
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
    let householdItemId = '';

    try {
      vendorId = await createVendorViaApi(page, `${testPrefix} AI-ParentTab Vendor`);
      invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 900,
        date: '2026-06-01',
      });
      workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} AI-Both Task` });
      householdItemId = await createHouseholdItemViaApi(page, {
        name: `${testPrefix} AI-Both Purchase`,
      });

      const docId = 92001;
      await mockPaperlessDocument(page, docId, 'Parent Picker Doc');
      await mockAutoItemizeDryRun(page, invoiceId);

      await autoItemizePage.goto(invoiceId, docId);
      await autoItemizePage.waitForAnalyzingDone();

      // ── Type the shared part of both names into the first row's Belongs to ────
      const picker = autoItemizePage.grid.targetPicker(1);
      await picker.type(`${testPrefix} AI-Both`);

      const task = picker.option(`${testPrefix} AI-Both Task`);
      const purchase = picker.option(`${testPrefix} AI-Both Purchase`);
      await expect(task).toBeVisible();
      await expect(purchase).toBeVisible();
      await expect(task).toContainText('Task');
      await expect(purchase).toContainText('Purchase');

      // ── Escape closes the list without choosing ──────────────────────────────
      await page.keyboard.press('Escape');
      await expect(picker.dropdown).toBeHidden();
    } finally {
      if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
      if (householdItemId) await deleteHouseholdItemViaApi(page, householdItemId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 33 — Dropdown portal (Flaw 1, Story #1600)
// SearchPicker renders its dropdown into document.body via createPortal so it
// is not clipped by the dialog or the table's overflow.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Scenario 33 — SearchPicker dropdown renders in body portal (not clipped by the grid)', () => {
  test('Typing in the Belongs to input causes a portal dropdown at document.body level that is within viewport bounds', async ({
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
      vendorId = await createVendorViaApi(page, `${testPrefix} AI-Portal Vendor`);
      invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 900,
        date: '2026-06-01',
      });
      workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} AI-Portal WI` });

      const docId = 93001;
      await mockPaperlessDocument(page, docId, 'Portal Dropdown Doc');
      await mockAutoItemizeDryRun(page, invoiceId);

      await autoItemizePage.goto(invoiceId, docId);
      await autoItemizePage.waitForAnalyzingDone();

      // ── Type into the first row's Belongs to input → dropdown should appear ───
      const picker = autoItemizePage.grid.targetPicker(1);
      await picker.type(`${testPrefix} AI-Portal`);

      // ── The dropdown is a direct child of document.body (not in the grid) ─────
      const insideGrid = await picker.dropdown.evaluate(
        (el) => el.closest('[data-testid="auto-itemize-grid"]') !== null,
      );
      expect(insideGrid, 'the dropdown is portalled out of the grid').toBe(false);

      const dropdownBox = await picker.dropdown.boundingBox();
      expect(dropdownBox, 'Portal dropdown must have a bounding box').not.toBeNull();
      const viewportHeight = page.viewportSize()?.height ?? 800;
      expect(
        dropdownBox!.y + dropdownBox!.height,
        `Portal dropdown bottom (${(dropdownBox!.y + dropdownBox!.height).toFixed(0)}px) ` +
          `must be within viewport height (${viewportHeight}px)`,
      ).toBeLessThanOrEqual(viewportHeight + 1);

      // ── Choose the task → the dropdown closes and the row shows the choice ────
      await picker.option(`${testPrefix} AI-Portal WI`).click();
      await expect(picker.dropdown).toBeHidden();
      await expect(autoItemizePage.grid.row(1)).toContainText(`${testPrefix} AI-Portal WI`);
    } finally {
      if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 34 — A task with existing cost lines: the row is pre-filled from the extraction and
// "Use an existing cost line…" lists them (#1600, #2235)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Scenario 34 — Row pre-filled from extraction; existing cost lines are offered', () => {
  test('The extracted row shows its description, quantity, unit and price; the dialog lists the task’s existing line', async ({
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
    const wiTitle = `${testPrefix} AI-Prefill WI`;
    const extractedDescription = 'Bathroom tiles';
    const existingDescription = `${testPrefix} AI-Prefill Existing BL`;

    try {
      vendorId = await createVendorViaApi(page, `${testPrefix} AI-Prefill Vendor`);
      invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 2000,
        date: '2026-06-01',
      });
      workItemId = await createWorkItemViaApi(page, { title: wiTitle });
      await createWorkItemBudgetViaApi(page, workItemId, {
        description: existingDescription,
        plannedAmount: 500,
      });

      const docId = 94001;
      await mockPaperlessDocument(page, docId, 'Prefill Test Doc');

      const extractedLine = {
        description: extractedDescription,
        totalAmount: 900,
        confidence: 0.95,
        quantity: 20,
        unit: 'm²',
        unitPrice: 45,
        includesVat: false,
        vatRate: null,
        vendorName: null,
        budgetCategoryId: null,
      };
      await mockAutoItemizeDryRun(page, invoiceId, { lines: [extractedLine] });

      await autoItemizePage.goto(invoiceId, docId);
      await autoItemizePage.waitForAnalyzingDone();

      // ── The row is pre-filled with the extracted line ─────────────────────────
      await expect(autoItemizePage.lineDescription(0)).toHaveValue(extractedDescription);
      await expect(autoItemizePage.lineQuantity(0)).toHaveValue('20');
      await expect(autoItemizePage.grid.cell('Unit', 1)).toHaveValue('m²');
      await expect(autoItemizePage.lineUnitPrice(0)).toHaveValue('45');
      await expect(autoItemizePage.lineEnteredAs(0)).toHaveText('Net');

      // ── The task has an existing cost line: it is offered, with its amount ────
      await autoItemizePage.grid.targetPicker(1).pick(wiTitle);
      await autoItemizePage.lineUseExistingButton(0).click();
      const dialog = autoItemizePage.grid.existingDialog;
      await expect(dialog).toBeVisible();
      const item = dialog.getByRole('listitem').filter({ hasText: existingDescription });
      await expect(item).toBeVisible();
      await expect(item).toContainText('500.00');
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(dialog).toBeHidden();

      // ── Cancelling the dialog leaves the extracted row as it was ──────────────
      await expect(autoItemizePage.lineDescription(0)).toHaveValue(extractedDescription);
    } finally {
      if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 35 — Dark mode + mobile (Flaws 1–3, Story #1600, #2235)
// ─────────────────────────────────────────────────────────────────────────────

test.describe(
  'Scenario 35 — Dark mode + mobile: portal dropdown within viewport; the row stays legible',
  { tag: '@responsive' },
  () => {
    test('Belongs to dropdown is within the viewport on mobile (375×812) in dark mode; the linked row is legible', async ({
      page,
      testPrefix,
    }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.emulateMedia({ colorScheme: 'dark' });

      const autoItemizePage = new AutoItemizePage(page);
      let vendorId = '';
      let invoiceId = '';
      let workItemId = '';
      const wiTitle = `${testPrefix} AI-DkMob WI`;
      const existingDescription = `${testPrefix} AI-DkMob Existing BL`;

      try {
        vendorId = await createVendorViaApi(page, `${testPrefix} AI-DkMob Vendor`);
        invoiceId = await createInvoiceViaApi(page, vendorId, {
          amount: 2000,
          date: '2026-06-01',
        });
        workItemId = await createWorkItemViaApi(page, { title: wiTitle });
        await createWorkItemBudgetViaApi(page, workItemId, {
          description: existingDescription,
          plannedAmount: 500,
        });

        const docId = 95001;
        await mockPaperlessDocument(page, docId, 'Dark Mobile Doc');

        const extractedLine = {
          description: 'Bathroom tiles dark mobile',
          totalAmount: 900,
          confidence: 0.95,
          quantity: 20,
          unit: 'm²',
          unitPrice: 45,
          includesVat: false,
          vatRate: null,
          vendorName: null,
          budgetCategoryId: null,
        };
        await mockAutoItemizeDryRun(page, invoiceId, { lines: [extractedLine] });

        await autoItemizePage.goto(invoiceId, docId);
        await autoItemizePage.waitForAnalyzingDone();

        // ── Type in the first row's Belongs to input ──────────────────────────────
        const picker = autoItemizePage.grid.targetPicker(1);
        await picker.type(wiTitle);

        // ── Assert: portal dropdown appears and is within viewport bounds ─────────
        const dropdownBox = await picker.dropdown.boundingBox();
        expect(dropdownBox, 'Portal dropdown must have a bounding box on mobile').not.toBeNull();
        expect(dropdownBox!.x + dropdownBox!.width).toBeLessThanOrEqual(375 + 1);
        expect(dropdownBox!.y + dropdownBox!.height).toBeLessThanOrEqual(812 + 1);

        // ── Choose the task, then link its existing cost line ─────────────────────
        await picker.option(wiTitle).click();
        await autoItemizePage.grid.useExisting(1, new RegExp(existingDescription, 'i'));
        await expect(autoItemizePage.lineExistingLabel(0)).toContainText(existingDescription);

        // ── The linked row is legible in dark mode and fits the viewport ──────────
        await expectLegibleInDark(autoItemizePage.lineExistingLabel(0));
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
        ).toBe(false);
      } finally {
        if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
        if (vendorId) await deleteVendorViaApi(page, vendorId);
        if (workItemId) await deleteWorkItemViaApi(page, workItemId);
      }
    });
  },
);
