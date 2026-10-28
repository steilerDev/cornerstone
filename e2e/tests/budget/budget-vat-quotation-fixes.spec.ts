/**
 * Regression tests for Issues #1439, #1440, #1441
 *
 * Scenario 1 — Issue #1439: Direct-mode VAT-off does not double-uplift
 *   Before fix: useBudgetSection.handleSaveBudgetLine applied the ×1.19 multiplier to the stored
 *   plannedAmount, and then effectivePlannedAmount() applied it again at display time, resulting
 *   in a ×1.19² uplift (100 → 141.61) instead of the correct ×1.19 (100 → 119.00).
 *   Fix: removed the client-side multiplier from handleSaveBudgetLine; the server stores the raw
 *   net amount and effectivePlannedAmount() applies the single ×1.19 uplift at display time.
 *
 * Scenario 2 — Issues #1440/#1441/#1449: Quoted budget line shows quoted amount + vendor name
 *   Before fixes #1440/#1441: quotation invoices were excluded from actualCost aggregation, so the
 *   itemizedAmount was never set and InvoiceGroup displayed €0.00 – €0.00. Additionally
 *   vendorId/vendorName were not propagated into the invoiceLink DTO.
 *   Fix #1440/#1441: quotation invoices included in actualCost; vendorId/vendorName denormalized.
 *   Before fix #1449: the quoted amount was shown as a ±5% range (€475.00 – €525.00).
 *   Fix #1449: the offer/invoice group in the cost lines table (`CostLineTable`) now displays a single quoted amount (e.g. €500.00) with no range band.
 *
 * Both tests run on desktop viewport only — the bugs are viewport-agnostic and limiting to
 * desktop avoids noise from responsive-layout differences.
 */

import { test, expect } from '../../fixtures/auth.js';
import { WorkItemDetailPage } from '../../pages/WorkItemDetailPage.js';
import { CostLineFormDialog } from '../../pages/components/CostLineFormDialog.js';
import {
  createWorkItemViaApi,
  deleteWorkItemViaApi,
  createBudgetSourceViaApi,
  deleteBudgetSourceViaApi,
} from '../../fixtures/apiHelpers.js';
import { API } from '../../fixtures/testData.js';
import type { Page } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Inline API helpers (vendor + invoice + WI budget + invoice budget link)
// ─────────────────────────────────────────────────────────────────────────────

async function createVendorViaApi(page: Page, name: string): Promise<string> {
  const response = await page.request.post(API.vendors, { data: { name } });
  expect(response.ok(), `POST vendor "${name}" failed: ${response.status()}`).toBeTruthy();
  const body = (await response.json()) as { vendor: { id: string } };
  return body.vendor.id;
}

async function deleteVendorViaApi(page: Page, id: string): Promise<void> {
  await page.request.delete(`${API.vendors}/${id}`);
}

async function createInvoiceViaApi(
  page: Page,
  vendorId: string,
  data: { amount: number; date: string; status?: string },
): Promise<string> {
  const response = await page.request.post(`${API.vendors}/${vendorId}/invoices`, {
    data: { status: 'pending', ...data },
  });
  expect(response.ok(), `POST invoice failed: ${response.status()}`).toBeTruthy();
  const body = (await response.json()) as { invoice: { id: string } };
  return body.invoice.id;
}

async function deleteInvoiceViaApi(page: Page, vendorId: string, invoiceId: string): Promise<void> {
  await page.request.delete(`${API.vendors}/${vendorId}/invoices/${invoiceId}`);
}

/**
 * Create a work item budget line.
 * `budgetSourceId` is required by the backend service layer.
 * Returns the budget line id.
 */
async function createWorkItemBudgetViaApi(
  page: Page,
  workItemId: string,
  data: { plannedAmount: number; budgetSourceId: string; description?: string },
): Promise<string> {
  const response = await page.request.post(`${API.workItems}/${workItemId}/budgets`, {
    data: { confidence: 'own_estimate', ...data },
  });
  expect(
    response.ok(),
    `POST work item budget for ${workItemId} failed: ${response.status()}`,
  ).toBeTruthy();
  const body = (await response.json()) as { budget: { id: string } };
  return body.budget.id;
}

/**
 * Link an existing work item budget line to an invoice.
 * POST /api/invoices/:invoiceId/budget-lines
 * Returns the invoice-budget-line id.
 */
async function linkBudgetLineToInvoiceViaApi(
  page: Page,
  invoiceId: string,
  data: { workItemBudgetId: string; itemizedAmount: number },
): Promise<string> {
  const response = await page.request.post(`/api/invoices/${invoiceId}/budget-lines`, {
    data,
  });
  expect(response.ok(), `POST invoice budget line failed: ${response.status()}`).toBeTruthy();
  const body = (await response.json()) as { budgetLine: { id: string } };
  return body.budgetLine.id;
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: Direct-mode VAT-off does not double-uplift (#1439)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Budget regression — direct-mode VAT-off single uplift (#1439)', () => {
  test(
    'direct mode with VAT unchecked stores net amount and displays a single ×1.19 uplift (€119.00, not €141.61)',
    { tag: '@smoke' },
    async ({ page, testPrefix }) => {
      // Skip on non-desktop viewports — this regression is viewport-agnostic and tested
      // on desktop only to avoid noise from responsive layout differences.
      const viewportWidth = page.viewportSize()?.width ?? 1440;
      if (viewportWidth < 1024) {
        test.skip(true, 'Desktop-only regression test — skip on tablet/mobile');
        return;
      }

      const detailPage = new WorkItemDetailPage(page);
      let workItemId: string | null = null;

      try {
        workItemId = await createWorkItemViaApi(page, {
          title: `${testPrefix} VAT Double Uplift Regression`,
        });

        await detailPage.goto(workItemId, { tab: 'cost' });

        // Open the cost line form: a direct amount, entered net (the default)
        const form = new CostLineFormDialog(page, 'New cost line');
        await detailPage.costLines.waitForLoaded();
        await detailPage.costLines.addButton.click();
        await form.waitForOpen();
        await form.fillDirect(`${testPrefix} VAT line`, '100');
        await expect(form.enteredNet).toBeChecked();
        await expect(form.result).toContainText('Gross €119.00');
        await form.save();
        await form.waitForClosed();

        // The new Estimate shows €119.00 gross (one ×1.19 uplift), the net amount sits in the tip
        const budgetLineAmount = detailPage.costLines.gross(
          detailPage.costLines.row(`${testPrefix} VAT line`),
        );
        await expect(budgetLineAmount).toContainText('119.00');

        // The double-uplift value (×1.19² = €141.61) must NOT appear anywhere in the budget section.
        await expect(detailPage.tabs.panel('cost')).not.toContainText('141.61');
      } finally {
        if (workItemId) await deleteWorkItemViaApi(page, workItemId);
      }
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: Quoted budget line shows quoted amount (single value) + vendor name (#1440, #1441, #1449)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Budget regression — quotation invoice shows quoted amount + vendor name (#1440/#1441/#1449)', () => {
  test(
    'work item budget line linked to a quotation invoice shows the quoted amount and vendor name in the invoice group header',
    { tag: '@smoke' },
    async ({ page, testPrefix }) => {
      // Desktop-only — the offer/invoice group header (`CostLineTable`) layout is responsive-agnostic but we keep
      // regression tests narrow to avoid viewport-specific noise.
      const viewportWidth = page.viewportSize()?.width ?? 1440;
      if (viewportWidth < 1024) {
        test.skip(true, 'Desktop-only regression test — skip on tablet/mobile');
        return;
      }

      const detailPage = new WorkItemDetailPage(page);
      let workItemId: string | null = null;
      let vendorId: string | null = null;
      let invoiceId: string | null = null;
      let budgetSourceId: string | null = null;

      try {
        // Setup: work item + vendor + quotation invoice + budget source + linked budget line
        workItemId = await createWorkItemViaApi(page, {
          title: `${testPrefix} Quotation Vendor Name Test`,
        });

        vendorId = await createVendorViaApi(page, `${testPrefix} QA Vendor`);

        // Create the invoice with status 'quotation'
        invoiceId = await createInvoiceViaApi(page, vendorId, {
          amount: 600,
          date: '2026-06-01',
          status: 'quotation',
        });

        // Create a budget source — required by the backend service layer for WI budget lines
        budgetSourceId = await createBudgetSourceViaApi(page, {
          name: `${testPrefix} Source`,
          totalAmount: 50000,
        });

        // Create a budget line on the work item (planned €600.00, VAT included)
        const budgetLineId = await createWorkItemBudgetViaApi(page, workItemId, {
          plannedAmount: 600,
          budgetSourceId,
          description: `${testPrefix} regression budget line`,
        });

        // Link the budget line to the quotation invoice with itemizedAmount = 500
        await linkBudgetLineToInvoiceViaApi(page, invoiceId, {
          workItemBudgetId: budgetLineId,
          itemizedAmount: 500,
        });

        // Navigate to the work item detail page
        await detailPage.goto(workItemId, { tab: 'cost' });

        // The offer group heading names the company and shows the offered amount once
        // (the #1449 range band "€475.00 – €525.00" and the broken "€0.00 – €0.00" are gone).
        await detailPage.costLines.waitForLoaded();
        const groupHeading = detailPage.costLines.groupHeading(/^Offer /);
        await expect(groupHeading).toBeVisible();
        await expect(groupHeading).toContainText('QA Vendor');
        await expect(groupHeading).toContainText('Total €500.00');
        await expect(groupHeading.getByRole('link')).toBeVisible();

        const row = detailPage.costLines.row(`${testPrefix} regression budget line`);
        await expect(detailPage.costLines.stateChip(row)).toHaveText('Offered');
        await expect(detailPage.costLines.gross(row)).toHaveText('€500.00');
        await expect(detailPage.costLines.root).not.toContainText(' – ');
      } finally {
        // Tear down in reverse dependency order.
        // Deleting the vendor cascades the invoice; deleting the work item cascades budget lines.
        // Budget source must be deleted after the work item (budget lines reference it).
        if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
        if (vendorId) await deleteVendorViaApi(page, vendorId);
        if (workItemId) await deleteWorkItemViaApi(page, workItemId);
        if (budgetSourceId) await deleteBudgetSourceViaApi(page, budgetSourceId);
      }
    },
  );
});
