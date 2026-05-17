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
 * Scenario 2 — Issues #1440/#1441: Quoted budget line shows non-zero amount range + vendor name
 *   Before fix: quotation invoices were excluded from actualCost aggregation in the service layer,
 *   so the itemizedAmount on the work-item budget line was never set, leaving the
 *   InvoiceGroup amount display as €0.00 – €0.00. Additionally vendorId/vendorName were not
 *   propagated into the invoiceLink DTO, so no vendor name appeared in the group header.
 *   Fix: quotation invoices are now included in actualCost; vendorId/vendorName are denormalized
 *   into invoiceLink.
 *
 * Both tests run on desktop viewport only — the bugs are viewport-agnostic and limiting to
 * desktop avoids noise from responsive-layout differences.
 */

import { test, expect } from '../../fixtures/auth.js';
import { WorkItemDetailPage } from '../../pages/WorkItemDetailPage.js';
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
// Budget line form helpers (reused from unit-pricing.spec.ts patterns)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Open the "+ Add Line" form on the work item detail page and wait for the mode
 * toggle button to be visible, confirming the form is ready for input.
 */
async function openAddBudgetLineForm(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Add budget line' }).click();
  await page.getByRole('button', { name: 'Direct Amount', exact: true }).waitFor({
    state: 'visible',
  });
}

/**
 * Submit the open budget line form and wait for the form to close (the
 * "Add budget line" button re-appears, meaning the form unmounted).
 */
async function submitBudgetLineForm(page: Page): Promise<void> {
  await page.locator('[class*="submitButton"]').click();
  await page.getByRole('button', { name: 'Add budget line' }).waitFor({ state: 'visible' });
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

        await detailPage.goto(workItemId);

        // Open the Add Line form (Direct Amount mode is the default)
        await openAddBudgetLineForm(page);

        // Confirm Direct Amount mode is active by checking the Planned Amount input is visible
        const plannedAmountInput = page.getByLabel('Planned Amount (€) *');
        await expect(plannedAmountInput).toBeVisible();

        // Enter 100 as the planned amount
        await plannedAmountInput.fill('100');

        // Uncheck "Price includes VAT (19%)". When unchecked, the net amount is stored and
        // effectivePlannedAmount() applies ×1.19 at display time → expected result: €119.00.
        const vatCheckbox = page.getByLabel('Price includes VAT (19%)');
        await expect(vatCheckbox).toBeChecked(); // confirm default state
        await vatCheckbox.uncheck();
        await expect(vatCheckbox).not.toBeChecked();

        // Submit the form and wait for it to close
        await submitBudgetLineForm(page);

        // The newly-created unlinked budget line card should show €119.00 (one ×1.19 uplift).
        // The BudgetLineCard renders effectivePlannedAmount(line) in a [class*="amount"] span.
        const budgetLineAmount = detailPage.budgetSection
          .locator('[class*="amount"]')
          .filter({ hasText: '119' })
          .first();
        await expect(budgetLineAmount).toBeVisible();

        // Verify the displayed amount contains exactly "€119.00"
        await expect(budgetLineAmount).toContainText('119.00');

        // The double-uplift value (×1.19² = €141.61) must NOT appear anywhere in the budget section.
        await expect(detailPage.budgetSection).not.toContainText('141.61');
      } finally {
        if (workItemId) await deleteWorkItemViaApi(page, workItemId);
      }
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: Quoted budget line shows non-zero quoted amount + vendor name (#1440, #1441)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Budget regression — quotation invoice shows amount range + vendor name (#1440/#1441)', () => {
  test(
    'work item budget line linked to a quotation invoice shows a non-zero amount range and vendor name in the invoice group header',
    { tag: '@smoke' },
    async ({ page, testPrefix }) => {
      // Desktop-only — the InvoiceGroup header layout is responsive-agnostic but we keep
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
        await detailPage.goto(workItemId);

        // The budget section should contain an InvoiceGroup for the quotation.
        // InvoiceGroup renders as a div[role="group"] with an aria-label that includes
        // the vendor name after the fix.
        //
        // The group is collapsed by default — its inner content (budget line cards) is hidden,
        // but the group div itself and its toggle button header are always in the DOM.

        // Assert 1: the invoice group header is present and accessible
        // aria-label format: "Invoice <number|unknown> from <vendorName>: N budget lines, <amount> <label>"
        // We use a regex to match the vendor name without asserting exact amounts.
        const invoiceGroup = detailPage.budgetSection.locator('[role="group"]').first();
        await expect(invoiceGroup).toBeVisible();

        // Assert 2: vendor name appears in the invoice group header (rendered as a <span>)
        const vendorNameSpan = invoiceGroup.locator('[class*="vendorName"]');
        await expect(vendorNameSpan).toBeVisible();
        await expect(vendorNameSpan).toContainText('QA Vendor');

        // Assert 3: aria-label includes "from <vendorName>" (regression pin for accessibility)
        await expect(invoiceGroup).toHaveAttribute('aria-label', /from.*QA Vendor/i);

        // Assert 4: the quoted amount range is NOT €0.00 – €0.00.
        // InvoiceGroup renders itemizedTotal × 0.95 – itemizedTotal × 1.05 for quotations.
        // With itemizedAmount = 500: display = "€475.00 – €525.00".
        // Assert the lower bound (€475) is present — avoids coupling to the exact band ratio.
        //
        // The amount is inside the toggle button header, so it's visible without expanding.
        const amountGroup = invoiceGroup.locator('[class*="amountGroup"]').first();
        await expect(amountGroup).toBeVisible();
        await expect(amountGroup).toContainText('475');

        // Assert 5: the zero-range (€0.00 – €0.00) that appeared before the fix is absent.
        // We assert that "0.00 – €0.00" does not appear in the budget section to catch
        // a regression back to the broken state.
        await expect(detailPage.budgetSection).not.toContainText('0.00 – €0.00');
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
