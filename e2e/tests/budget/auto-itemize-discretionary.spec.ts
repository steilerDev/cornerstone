/**
 * E2E tests for Story #1551: Discretionary funding note and auto-origin badge.
 *
 * Story #1551 added two UI elements:
 *
 * (a) Discretionary note on AutoItemizePage preview:
 *     A <p role="note" class*="discretionaryNote"> rendered above the line-item cards
 *     when ≥1 extracted line's budgetSourceId equals the system discretionary source id.
 *     The note is sourced from picker.pickerState.budgetSources (fetched from
 *     GET /api/budget-sources on mount). The discretionary source is identified by
 *     isDiscretionary=true.
 *
 * (b) "Auto-itemized" Badge on Budget Overview cost-breakdown rows:
 *     A <Badge ariaLabel="Budget line was created automatically via auto-itemization"> rendered
 *     when line.origin === 'auto' in the BudgetLineRow inside the CostBreakdownTable.
 *
 * Scenarios:
 *   1. [smoke] AutoItemizePage shows the discretionary note when ≥1 line uses the discretionary source.
 *   2. AutoItemizePage does NOT show the note when lines use a non-discretionary source (or null).
 *   3. Budget Overview cost breakdown shows the auto-origin badge on auto-itemized lines.
 *   4. Budget Overview cost breakdown shows NO auto-origin badge on manually created lines.
 *
 * Auto-origin line creation approach (Scenarios 3 & 4):
 *   The `origin` field is NOT writable via the work-item-budgets CREATE/UPDATE API
 *   (workItemBudgets.ts schema uses additionalProperties:false and does not include `origin`).
 *   To create a real auto-origin line, we use the auto-itemize commit flow:
 *     1. Create a vendor + invoice + document link (POST /api/document-links)
 *     2. Call POST /api/invoices/:id/auto-itemize { dryRun: false, lines: [...], mode: 'append',
 *        paperlessDocumentId: <docId> }
 *   The commit path does NOT call Paperless — it only validates the document link exists
 *   in the DB, then inserts work_item_budgets rows with origin='auto'.
 *   The auto-itemize commit inserts budget lines with work_item_id=NULL initially; they appear
 *   in the budget overview as "Unassigned" (no work item context required for the badge test).
 *
 *   For Scenario 3, we navigate to Budget Overview and assert the badge is visible on ANY
 *   row with aria-label*="automatically". The budget line is unassigned and appears in the
 *   "No Area" → budget lines section without a parent work item row.
 *   For Scenario 4, we create a normal manual budget line via the work-item budgets API and
 *   assert no aria-label*="automatically" exists in that work item's expanded row.
 *
 * Mocking strategy (Scenarios 1 & 2 only):
 *   - GET /api/budget-sources: intercepted to return a minimal source list including the
 *     system discretionary source (id='discretionary-system', isDiscretionary=true) and
 *     one non-discretionary source.
 *   - POST /api/invoices/:id/auto-itemize: intercepted for the dry-run call that AutoItemizePage
 *     fires on mount (dryRun=true).
 *   - GET /paperless/documents/:docId: intercepted to return a mock document (prevents
 *     the page from making a real Paperless request on mount).
 *
 * Scenarios 3 & 4 use REAL API calls throughout — no page.route() mocking.
 */

import { test, expect } from '../../fixtures/auth.js';
import { AutoItemizePage } from '../../pages/AutoItemizePage.js';
import { BudgetOverviewPage } from '../../pages/BudgetOverviewPage.js';
import { createWorkItemViaApi, deleteWorkItemViaApi } from '../../fixtures/apiHelpers.js';
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

/**
 * Create a document link between an invoice and a (fake) Paperless document id.
 * Returns the document link id.
 *
 * NOTE: The server validates that the paperlessDocumentId is linked to the invoice
 * before allowing a commit auto-itemize call, so this link must exist in the DB first.
 * The document itself does not need to exist in a running Paperless server — the commit
 * path does NOT call the Paperless API.
 */
async function createDocumentLinkViaApi(
  page: Page,
  entityType: 'invoice',
  entityId: string,
  paperlessDocumentId: number,
): Promise<string> {
  const resp = await page.request.post('/api/document-links', {
    data: { entityType, entityId, paperlessDocumentId },
  });
  expect(resp.ok(), `POST document-link failed: ${resp.status()}`).toBeTruthy();
  const body = (await resp.json()) as { documentLink: { id: string } };
  return body.documentLink.id;
}

async function deleteDocumentLinkViaApi(page: Page, id: string): Promise<void> {
  await page.request.delete(`/api/document-links/${id}`);
}

/**
 * Create a work item budget line via the REST API (creates a manual line, origin='manual').
 * Returns the budget line id.
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

async function deleteWorkItemBudgetViaApi(
  page: Page,
  workItemId: string,
  budgetId: string,
): Promise<void> {
  await page.request.delete(`${API.workItems}/${workItemId}/budgets/${budgetId}`);
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

      // Navigate directly to the AutoItemizePage
      await page.goto(`/budget/invoices/${invoiceId}/auto-itemize/${MOCK_DOC_ID}`);

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

    await page.goto(`/budget/invoices/${invoiceId}/auto-itemize/${MOCK_DOC_ID}`);
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

    await page.goto(`/budget/invoices/${invoiceId}/auto-itemize/${MOCK_DOC_ID}`);
    await autoItemizePage.waitForAnalyzingDone();

    await expect(autoItemizePage.discretionaryNote).not.toBeVisible();
  } finally {
    if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
    if (vendorId) await deleteVendorViaApi(page, vendorId);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: Budget Overview shows the auto-origin badge on auto-itemized lines
// ─────────────────────────────────────────────────────────────────────────────
//
// Auto-origin line creation approach:
//   `origin` is NOT writable via POST/PATCH /api/work-items/:id/budgets. It is only set
//   to 'auto' by the invoice auto-itemize commit flow. We therefore:
//     1. Create a vendor + invoice + a real document link in the DB (fake docId)
//     2. Call POST /api/invoices/:id/auto-itemize { dryRun: false, lines: [...],
//        mode: 'append', paperlessDocumentId: <fake> }
//   The commit path does NOT call Paperless — it only checks the document link exists.
//   The inserted work_item_budgets row has origin='auto' (set by the service).
//   The resulting budget line appears in the budget overview as "Unassigned" (no parent
//   work item). The auto-origin badge is rendered by BudgetLineRow when line.origin === 'auto'.

test('Scenario 3: Budget Overview cost breakdown shows the auto-origin badge on auto-itemized lines', async ({
  page,
  testPrefix,
}) => {
  // Skip on mobile — budget overview cost breakdown requires enough horizontal space
  const viewportWidth = page.viewportSize()?.width ?? 1440;
  if (viewportWidth < 768) {
    test.skip(true, 'Budget overview cost breakdown is desktop/tablet only');
    return;
  }

  const overviewPage = new BudgetOverviewPage(page);
  let vendorId = '';
  let invoiceId = '';
  let docLinkId = '';

  try {
    // Step 1: Create vendor + invoice
    vendorId = await createVendorViaApi(page, `${testPrefix} AutoOrigin Badge Vendor`);
    invoiceId = await createInvoiceViaApi(page, vendorId, {
      amount: 500,
      date: '2026-06-01',
      invoiceNumber: `${testPrefix}-AUTOBADGE-001`,
    });

    // Step 2: Create a document link (fake Paperless doc id) so the commit path
    // can validate the link exists in the DB without a real Paperless server.
    const FAKE_DOC_ID = 88010;
    docLinkId = await createDocumentLinkViaApi(page, 'invoice', invoiceId, FAKE_DOC_ID);

    // Step 3: Call the auto-itemize commit endpoint (dryRun=false) with one extracted line.
    // This inserts a work_item_budgets row with origin='auto' and work_item_id=NULL.
    const commitResp = await page.request.post(`/api/invoices/${invoiceId}/auto-itemize`, {
      data: {
        paperlessDocumentId: FAKE_DOC_ID,
        mode: 'append',
        dryRun: false,
        lines: [
          {
            description: `${testPrefix} Auto-itemized roofing line`,
            quantity: 5,
            unit: 'm²',
            unitPrice: 40.0,
            totalAmount: 200.0,
            includesVat: false,
            vatRate: 0.19,
            vendorName: null,
            confidence: 0.88,
            assignedBudgetLineId: null,
            assignedBudgetLineType: null,
            assignmentMode: null,
            budgetCategoryId: null,
            budgetSourceId: null,
          },
        ],
      },
    });
    expect(
      commitResp.ok(),
      `POST auto-itemize commit failed: ${commitResp.status()} — ${await commitResp.text()}`,
    ).toBeTruthy();

    // Step 4: Navigate to budget overview and wait for data to load
    await overviewPage.goto();
    await overviewPage.waitForLoaded();

    // Step 5: The auto-itemized line is unassigned (work_item_id=NULL). In the
    // CostBreakdownTable, unassigned budget lines appear under the Work Items section
    // in a "No Area" grouping. Expand the Work Items section first.
    await overviewPage.costBreakdownCard
      .getByRole('button', { name: /expand work item budget by area/i })
      .click();

    // The "No Area" area row should now be visible (it contains unassigned items/lines)
    // Expand it to reveal the budget line rows
    const noAreaToggle = overviewPage.costBreakdownCard.getByRole('button', {
      name: /expand no area/i,
    });
    // The "No Area" row may be a section that expands directly to lines without an
    // intermediate work-item row (since origin='auto' lines have no work item).
    // Wait for the toggle to appear and click it.
    await noAreaToggle.waitFor({ state: 'visible' });
    await noAreaToggle.click();

    // Step 6: Assert the auto-origin badge is present on the page.
    // aria-label = t('overview.costBreakdown.autoOriginBadge.ariaLabel')
    //            = "Budget line was created automatically via auto-itemization"
    const autoOriginBadge = page.locator('[aria-label*="automatically"]');
    await expect(autoOriginBadge).toBeVisible();
  } finally {
    if (docLinkId) await deleteDocumentLinkViaApi(page, docLinkId);
    if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
    if (vendorId) await deleteVendorViaApi(page, vendorId);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: Budget Overview shows NO auto-origin badge on manually created lines
// ─────────────────────────────────────────────────────────────────────────────

test('Scenario 4: Budget Overview cost breakdown shows NO auto-origin badge on manually created lines', async ({
  page,
  testPrefix,
}) => {
  const viewportWidth = page.viewportSize()?.width ?? 1440;
  if (viewportWidth < 768) {
    test.skip(true, 'Budget overview cost breakdown is desktop/tablet only');
    return;
  }

  const overviewPage = new BudgetOverviewPage(page);
  let workItemId = '';
  let budgetLineId = '';

  try {
    // Create a work item with a manual (origin='manual') budget line via the WI budget API.
    // The POST /api/work-items/:id/budgets schema does not accept `origin`, so any line
    // created this way will have origin='manual' (the DB column default).
    workItemId = await createWorkItemViaApi(page, {
      title: `${testPrefix} Manual Budget WI`,
    });

    budgetLineId = await createWorkItemBudgetViaApi(page, workItemId, {
      description: `${testPrefix} Manual roofing estimate`,
      plannedAmount: 300,
    });

    // Navigate to budget overview
    await overviewPage.goto();
    await overviewPage.waitForLoaded();

    // Expand Work Items section
    await overviewPage.costBreakdownCard
      .getByRole('button', { name: /expand work item budget by area/i })
      .click();

    // Expand the "No Area" section (or the work item row, whichever is visible)
    // The work item created without an area will appear under "No Area"
    const noAreaToggle = overviewPage.costBreakdownCard.getByRole('button', {
      name: /expand no area/i,
    });
    await noAreaToggle.waitFor({ state: 'visible' });
    await noAreaToggle.click();

    // Expand the work item row to reveal its budget lines
    await overviewPage.breakdownAreaToggle(testPrefix + ' Manual Budget WI').click();

    // Assert: no auto-origin badge is present
    // The badge only appears when line.origin === 'auto'. A manually created line
    // has origin='manual', so the Badge component is not rendered.
    const autoOriginBadge = page.locator('[aria-label*="automatically"]');
    await expect(autoOriginBadge).not.toBeVisible();
  } finally {
    if (workItemId && budgetLineId) {
      await deleteWorkItemBudgetViaApi(page, workItemId, budgetLineId);
    }
    if (workItemId) await deleteWorkItemViaApi(page, workItemId);
  }
});
