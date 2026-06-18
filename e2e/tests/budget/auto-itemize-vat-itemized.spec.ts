/**
 * E2E tests for Bug B (#1738): Auto-Itemize VAT-exclusive lines store net but itemize gross.
 *
 * Before fix #1738, the auto-itemize save handler would store `totalAmount` directly
 * as both `plannedAmount` (WI budget) and `itemizedAmount` (invoice budget line)
 * regardless of `includesVat`. After fix #1738:
 *
 *   - `plannedAmount`  = net amount  (e.g. 100 when includesVat=false)
 *   - `itemizedAmount` = gross amount = Math.round(net * 1.19 * 100) / 100 = 119
 *   - `actualCost`     = sum of itemizedAmounts = 119
 *
 * effectiveLineAmount({amount:100, includesVat:false}) = Math.round(100 * 1.19 * 100) / 100 = 119
 * effectivePlannedAmount({plannedAmount:100, includesVat:false}) = 119 (for display)
 *
 * Scenario coverage:
 *   1. [smoke] VAT-exclusive inline create: dry-run returns one line (VAT-exclusive, 100),
 *      user queues create-new, Saves; assert POST /api/work-items/:id/budgets has
 *      plannedAmount=100 & includesVat=false; assert POST /api/invoices/:id/auto-itemize
 *      (commit) is called; navigate to invoice detail and verify
 *      GET /api/work-items/:id/budgets shows plannedAmount=100 & actualCost=119.
 *
 * Mocking strategy:
 *   - GET /api/config: autoItemizeEnabled: true injected.
 *   - POST /api/invoices/:id/auto-itemize (dry-run only): returns one VAT-exclusive line at €100.
 *   - GET /paperless/documents/:docId: stub document.
 *   - Commit POSTs (WI budget + auto-itemize commit): real server.
 *   - POST /api/invoices/:id/budget-lines: NOT intercepted — the junction row is created
 *     server-side by the auto-itemize commit endpoint's assign-existing path. The
 *     itemized_amount stored is effectiveLineAmount(100, false) = 119 (gross).
 *   - API assertions done via direct page.request.get() after navigation.
 *
 * Invoice amount is set to 119 (gross invoice total = net 100 + 19% VAT) so the
 * server's Σ-guard (sum of itemized_amounts ≤ invoice.amount) does not reject.
 *
 * All tests skip below 600px viewport width (functional flow, desktop/tablet only).
 */

import { test, expect } from '../../fixtures/auth.js';
import { AutoItemizePage } from '../../pages/AutoItemizePage.js';
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
 * Intercept the dry-run POST to return a single VAT-exclusive line at €100.
 * Commit calls (dryRun: false) are allowed through to the real server.
 */
async function mockDryRunVatExclusive(page: Page, invoiceId: string): Promise<void> {
  await page.route(`**/api/invoices/${invoiceId}/auto-itemize`, async (route: Route) => {
    const body = route.request().postDataJSON() as { dryRun: boolean } | null;
    if (body?.dryRun) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          lines: [
            {
              description: 'VAT Excl Line',
              quantity: 1,
              unit: null,
              unitPrice: null,
              totalAmount: 100,
              includesVat: false,
              vatRate: null,
              vendorName: null,
              confidence: 0.9,
              budgetSourceId: null,
              budgetCategoryId: null,
            },
          ],
          warnings: [],
        }),
      });
    } else {
      // Allow commit through to the real server
      await route.continue();
    }
  });
}

/**
 * Intercept GET /paperless/documents/:docId to avoid network errors.
 * Thumb/preview sub-resources are passed through (will 404 gracefully).
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
          title: `Mock VAT Invoice ${docId}`,
          content: 'VAT test content 100.00 EUR net',
          tags: [],
          created: '2026-01-01',
          added: '2026-01-01T00:00:00.000Z',
          modified: '2026-01-01T00:00:00.000Z',
          correspondent: 'VAT Test Vendor GmbH',
          documentType: null,
          archiveSerialNumber: null,
          originalFileName: `invoice-${docId}.pdf`,
        },
      }),
    });
  });
}

/**
 * Navigate to the AutoItemizePage, waiting for the dry-run POST to complete.
 * The waitForResponse listener is registered BEFORE navigation to avoid a race.
 */
async function navigateAndWaitForDryRun(
  page: Page,
  autoItemizePage: AutoItemizePage,
  invoiceId: string,
  docId: number,
): Promise<void> {
  const dryRunDone = page.waitForResponse(
    (resp) =>
      resp.url().includes(`/api/invoices/${invoiceId}/auto-itemize`) &&
      resp.request().method() === 'POST' &&
      resp.status() === 200,
  );
  await page.goto(`/budget/invoices/${invoiceId}/auto-itemize/${docId}`);
  await dryRunDone;
  await autoItemizePage.waitForAnalyzingDone();
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: VAT-exclusive line stores net but itemizes gross (Bug B guard)
// ─────────────────────────────────────────────────────────────────────────────

test(
  'Scenario 1 [smoke]: VAT-exclusive extracted line (€100 net) stores plannedAmount=100 and itemizedAmount=119 (gross) after Save',
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

    try {
      vendorId = await createVendorViaApi(page, `${testPrefix} AIVAT-S1 Vendor`);
      invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 119, // gross invoice total (100 net + 19% VAT)
        date: '2026-06-01',
        invoiceNumber: `${testPrefix}-AIVAT-S1`,
      });
      workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} AIVAT-S1 WI` });

      const docId = 140001;
      // Link the Paperless document to the invoice so the auto-itemize commit
      // endpoint can verify the document is associated with this invoice.
      await linkDocumentToInvoiceViaApi(page, invoiceId, docId);
      await mockConfigEnabled(page);
      await mockDryRunVatExclusive(page, invoiceId);
      await mockPaperlessDocument(page, docId);

      await navigateAndWaitForDryRun(page, autoItemizePage, invoiceId, docId);

      // ── Verify the extracted line shows VAT-exclusive (checkbox unchecked) ──
      const vatCheckbox = autoItemizePage.lineVatCheckbox(0);
      await expect(vatCheckbox).toBeVisible();
      // includesVat=false → checkbox should NOT be checked
      await expect(vatCheckbox).not.toBeChecked();

      // ── Open assign picker and pick the test work item ────────────────────────
      await expect(autoItemizePage.lineAssignButton(0)).toBeVisible();
      await autoItemizePage.lineAssignButton(0).click();
      await expect(autoItemizePage.pickerModal).toBeVisible();

      await expect(autoItemizePage.pickerWorkItemSearchInput).toBeVisible();
      await autoItemizePage.pickerWorkItemSearchInput.fill(`${testPrefix} AIVAT-S1 WI`);

      const wiOption = autoItemizePage.pickerPortalDropdown.getByRole('option', {
        name: new RegExp(
          `${testPrefix} AIVAT-S1 WI`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
          'i',
        ),
      });
      await wiOption.waitFor({ state: 'visible' });
      await wiOption.click();

      // Step 2: click "Create Budget Line"
      const step2Modal = autoItemizePage.pickerStep2Modal();
      await expect(step2Modal).toBeVisible();
      await expect(autoItemizePage.pickerCreateBudgetLineButton).toBeVisible();
      await autoItemizePage.pickerCreateBudgetLineButton.click();

      // Picker should have closed — inline form now visible
      await expect(autoItemizePage.pickerModal).not.toBeVisible();
      await expect(autoItemizePage.getCreatingNewBadge(0)).toBeVisible();
      await expect(autoItemizePage.getInlineFormWrapper(0)).toBeVisible();

      // ── Register response interceptors BEFORE clicking Save ─────────────────
      // Register all waitForResponse BEFORE saveButton.click() to avoid races.
      let capturedWIBudgetPayload: {
        plannedAmount?: number;
        includesVat?: boolean;
      } | null = null;

      const wiCreateDone = page.waitForResponse(async (resp) => {
        if (
          resp.url().includes(`/api/work-items/${workItemId}/budgets`) &&
          resp.request().method() === 'POST' &&
          resp.ok()
        ) {
          capturedWIBudgetPayload = (await resp.request().postDataJSON()) as {
            plannedAmount?: number;
            includesVat?: boolean;
          };
          return true;
        }
        return false;
      });

      // The auto-itemize commit (dryRun:false) is the terminal server-side step.
      // It creates the invoice↔budget-line junction row with itemizedAmount=gross.
      // NOTE: resp.ok() is intentionally NOT in the predicate — if the server returns
      // a non-200, we want to catch the response and fail loudly with the status+body
      // rather than timing out opaquely waiting for a successful response that never comes.
      const commitDone = page.waitForResponse(
        (resp) =>
          resp.url().includes(`/api/invoices/${invoiceId}/auto-itemize`) &&
          resp.request().method() === 'POST' &&
          !(resp.request().postDataJSON() as { dryRun?: boolean })?.dryRun,
        { timeout: 30000 },
      );

      // ── Click Save ────────────────────────────────────────────────────────────
      await autoItemizePage.saveButton.click();
      // Wait for WI budget creation and the auto-itemize commit.
      // Note: handleSave may also call POST /api/invoices/:id/budget-lines client-side;
      // we do not wait on that here — the key assertions are the payload of
      // POST /api/work-items/:id/budgets and the final API state after navigation.
      const [, commitResp] = await Promise.all([wiCreateDone, commitDone]);

      // Assert the commit succeeded — loud failure if server returned an error.
      if (!commitResp.ok()) {
        const bodyText = await commitResp.text().catch(() => '<no body>');
        throw new Error(`auto-itemize commit returned ${commitResp.status()}: ${bodyText}`);
      }

      // ── Assert WI budget payload (Bug B: net stored) ──────────────────────────
      // plannedAmount must be the NET amount (100), not the gross (119)
      expect(capturedWIBudgetPayload, 'POST /api/work-items/:id/budgets was not called').not.toBeNull();
      expect(
        capturedWIBudgetPayload!.plannedAmount,
        `Bug B regression: plannedAmount should be NET (100) but was ${capturedWIBudgetPayload!.plannedAmount}. ` +
          'The fix must store the net amount in the WI budget, not the gross amount.',
      ).toBe(100);
      expect(capturedWIBudgetPayload!.includesVat).toBe(false);

      // ── Navigate to invoice detail (Save should redirect there) ─────────────
      await expect(page).toHaveURL(/\/budget\/invoices\/[^/]+$/);
      expect(page.url()).not.toContain('auto-itemize');

      // ── Verify via API: GET /api/work-items/:id/budgets ───────────────────────
      // plannedAmount = 100 (net stored)
      // actualCost    = 119 (sum of itemizedAmounts from linked invoices = gross)
      const listResp = await page.request.get(`${API.workItems}/${workItemId}/budgets`);
      expect(listResp.ok(), `GET /api/work-items/${workItemId}/budgets failed`).toBeTruthy();
      const listBody = (await listResp.json()) as {
        budgets: Array<{
          plannedAmount: number;
          actualCost: number;
          includesVat: boolean | null;
        }>;
      };

      expect(
        listBody.budgets.length,
        `Expected 1 budget line under WI ${workItemId}, got ${listBody.budgets.length}`,
      ).toBe(1);

      const budget = listBody.budgets[0];

      // plannedAmount is stored NET
      expect(
        budget.plannedAmount,
        `Bug B regression: WI budget plannedAmount should be NET 100 but is ${budget.plannedAmount}`,
      ).toBeCloseTo(100, 2);

      // actualCost is the GROSS amount (sum of itemized amounts from linked invoices)
      expect(
        budget.actualCost,
        `Bug B regression: WI budget actualCost should be GROSS 119 but is ${budget.actualCost}. ` +
          'actualCost = sum of itemizedAmounts from linked invoices = effectiveLineAmount(100, false) = 119',
      ).toBeCloseTo(119, 2);

      // Confirm includesVat=false persisted correctly
      expect(budget.includesVat).toBe(false);
    } finally {
      if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
    }
  },
);
