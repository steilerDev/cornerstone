/**
 * E2E tests for the budget-line auto-link feature (Issue #1401)
 *
 * When "+ Add Budget Line" is clicked on the Invoice Detail page, the two-step
 * picker now offers a "Create Budget Line" button in Step 2.  Clicking it opens
 * the rich BudgetLineForm.  On submit the new budget line is:
 *   1. Created on the parent work item / household item (POST /api/work-items/:id/budgets)
 *   2. Immediately linked to the invoice (POST /api/invoices/:id/budget-lines)
 *      with its persisted plannedAmount as the itemizedAmount.
 *
 * Scenarios covered:
 *   1. Happy path — unit pricing (work item, qty×price, VAT included)
 *   2. Happy path from a non-empty existing-line list — direct amount
 *   3. Link fails because amount exceeds invoice total (ITEMIZED_SUM_EXCEEDS_INVOICE)
 *   4. Responsive smoke — mobile viewport (390×844)
 *   5. Escape key closes the picker modal fully
 *
 * Setup conventions (mirrors invoice-budget-line-area-breadcrumb.spec.ts):
 *   - All resources created via REST API in test setup, cleaned up in finally blocks
 *   - testPrefix isolates data across parallel workers
 *   - waitForResponse registered BEFORE the action that triggers the network call
 *   - Retrying assertions (toContainText, toBeVisible) used after mutations
 */

import { test, expect } from '../../fixtures/auth.js';
import { InvoiceDetailPage } from '../../pages/InvoiceDetailPage.js';
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
// Inline helpers (vendor + invoice) — mirrors the pattern from invoices.spec.ts
// and invoice-budget-line-area-breadcrumb.spec.ts
// ─────────────────────────────────────────────────────────────────────────────

async function createVendorViaApi(page: Page, name: string): Promise<string> {
  const response = await page.request.post(API.vendors, { data: { name } });
  expect(response.ok(), `POST vendor "${name}"`).toBeTruthy();
  const body = (await response.json()) as { vendor: { id: string } };
  return body.vendor.id;
}

async function deleteVendorViaApi(page: Page, id: string): Promise<void> {
  await page.request.delete(`${API.vendors}/${id}`);
}

async function createInvoiceViaApi(
  page: Page,
  vendorId: string,
  data: { amount: number; date: string; status?: string; invoiceNumber?: string },
): Promise<string> {
  const response = await page.request.post(`${API.vendors}/${vendorId}/invoices`, {
    data: { status: 'pending', ...data },
  });
  expect(response.ok(), 'POST invoice').toBeTruthy();
  const body = (await response.json()) as { invoice: { id: string } };
  return body.invoice.id;
}

async function deleteInvoiceViaApi(page: Page, vendorId: string, invoiceId: string): Promise<void> {
  await page.request.delete(`${API.vendors}/${vendorId}/invoices/${invoiceId}`);
}

async function createWorkItemBudgetViaApi(
  page: Page,
  workItemId: string,
  data: { plannedAmount: number; budgetSourceId: string; description?: string },
): Promise<string> {
  const response = await page.request.post(`${API.workItems}/${workItemId}/budgets`, {
    data: { confidence: 'own_estimate', ...data },
  });
  expect(response.ok(), `POST work item budget for ${workItemId}`).toBeTruthy();
  const body = (await response.json()) as { budget: { id: string } };
  return body.budget.id;
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: Happy path — unit pricing (work item, qty×price, VAT included)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Create and link budget line — unit pricing (Scenario 1)', () => {
  test(
    'Work item budget line created with unit pricing appears in invoice table with correct amounts',
    async ({ page, testPrefix }) => {
      const detailPage = new InvoiceDetailPage(page);
      const wiDetailPage = new WorkItemDetailPage(page);

      let vendorId: string | null = null;
      let invoiceId: string | null = null;
      let workItemId: string | null = null;
      let budgetSourceId: string | null = null;

      const wiTitle = `${testPrefix} Roof Unit WI`;

      try {
        // Setup: vendor, invoice (amount=2000), work item with no budget lines
        vendorId = await createVendorViaApi(page, `${testPrefix} Vendor Unit`);
        invoiceId = await createInvoiceViaApi(page, vendorId, {
          amount: 2000,
          date: '2026-06-01',
        });
        workItemId = await createWorkItemViaApi(page, { title: wiTitle });
        budgetSourceId = await createBudgetSourceViaApi(page, {
          name: `${testPrefix} Source Unit`,
          totalAmount: 50000,
        });

        await detailPage.goto(invoiceId);
        await expect(detailPage.heading).toBeVisible();

        // Open the budget line picker modal
        await detailPage.openBudgetLinePicker();
        await expect(detailPage.budgetLinePickerModal).toBeVisible();

        // Step 1: search for the work item and select it
        const wiInput = detailPage.budgetLinePickerModal.getByPlaceholder('Search work items...');
        await wiInput.fill(wiTitle);
        const option = detailPage.budgetLinePickerModal.getByRole('option', { name: wiTitle });
        await option.waitFor({ state: 'visible' });
        await option.click();

        // Step 2: work item has no budget lines → empty state shows "Create Budget Line"
        await expect(detailPage.pickerCreateBudgetLineButton).toBeVisible();

        // Click "Create Budget Line" to open the BudgetLineForm
        await detailPage.pickerCreateBudgetLineButton.click();
        await expect(detailPage.createFormDescriptionInput).toBeVisible();

        // Fill description
        await detailPage.createFormDescriptionInput.fill('Roof materials');

        // Switch to unit pricing mode
        await detailPage.createFormUnitModeButton.click();
        await expect(detailPage.createFormQuantityInput).toBeVisible();

        // Fill quantity=10, unit="pcs", unit price=150 (VAT included by default)
        await detailPage.createFormQuantityInput.fill('10');
        await page.locator('#budget-unit').fill('pcs');
        await detailPage.createFormUnitPriceInput.fill('150');

        // VAT included checkbox is checked by default — leave it as-is
        // plannedAmount = 10 × 150 = 1500 (no multiplier since VAT included)

        // Register waitForResponse for BOTH API calls BEFORE clicking submit
        const budgetCreatePromise = page.waitForResponse(
          (resp) =>
            resp.url().includes('/budgets') &&
            resp.request().method() === 'POST' &&
            resp.status() === 201,
        );
        const linkCreatePromise = page.waitForResponse(
          (resp) =>
            resp.url().includes('/budget-lines') &&
            resp.request().method() === 'POST' &&
            resp.status() === 201,
        );

        // Submit the form
        await detailPage.createFormSubmitButton.click();

        // Wait for both API calls to complete
        await budgetCreatePromise;
        await linkCreatePromise;

        // Picker modal should close
        await detailPage.budgetLinePickerModal.waitFor({ state: 'hidden' });

        // Budget lines table should now be visible with the new row
        await expect(detailPage.budgetLinesTable).toBeVisible();

        // The new row should show the planned amount (€1,500.00)
        await expect(detailPage.budgetLinesSection).toContainText('1,500.00');

        // The remaining row should show €500.00 (2000 − 1500)
        await expect(detailPage.budgetLinesSection).toContainText('500.00');

        // The description should appear in the table
        await expect(detailPage.budgetLinesSection).toContainText('Roof materials');

        // Navigate to the work item detail page to verify the budget line appears there
        // with an invoice link badge
        await wiDetailPage.goto(workItemId);
        await expect(wiDetailPage.heading).toBeVisible();

        // An invoice link badge (InvoiceGroup) should appear — it renders as a link
        // with text "Invoice" (no number since we didn't assign one)
        const invoiceGroupLink = wiDetailPage.budgetSection.locator('[class*="invoiceLink"]');
        await expect(invoiceGroupLink).toBeVisible();
      } finally {
        if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
        if (vendorId) await deleteVendorViaApi(page, vendorId);
        if (workItemId) await deleteWorkItemViaApi(page, workItemId);
        if (budgetSourceId) await deleteBudgetSourceViaApi(page, budgetSourceId);
      }
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: Happy path from non-empty list — direct amount
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Create and link budget line — from non-empty list (Scenario 2)', () => {
  test(
    'Create Budget Line button appears below existing lines; direct amount creates and links',
    async ({ page, testPrefix }) => {
      const detailPage = new InvoiceDetailPage(page);

      let vendorId: string | null = null;
      let invoiceId: string | null = null;
      let workItemId: string | null = null;
      let budgetSourceId: string | null = null;

      const wiTitle = `${testPrefix} NonEmpty WI`;
      const existingLineDesc = `${testPrefix} Existing Line`;

      try {
        // Setup: vendor, invoice, work item with ONE existing unlinked budget line
        vendorId = await createVendorViaApi(page, `${testPrefix} Vendor NonEmpty`);
        invoiceId = await createInvoiceViaApi(page, vendorId, {
          amount: 2000,
          date: '2026-06-02',
        });
        workItemId = await createWorkItemViaApi(page, { title: wiTitle });
        budgetSourceId = await createBudgetSourceViaApi(page, {
          name: `${testPrefix} Source NonEmpty`,
          totalAmount: 50000,
        });

        // Create an unlinked budget line on the work item (not linked to this invoice)
        await createWorkItemBudgetViaApi(page, workItemId, {
          plannedAmount: 800,
          budgetSourceId,
          description: existingLineDesc,
        });

        await detailPage.goto(invoiceId);
        await expect(detailPage.heading).toBeVisible();

        // Open picker
        await detailPage.openBudgetLinePicker();
        await expect(detailPage.budgetLinePickerModal).toBeVisible();

        // Step 1: select the work item
        const wiInput = detailPage.budgetLinePickerModal.getByPlaceholder('Search work items...');
        await wiInput.fill(wiTitle);
        const option = detailPage.budgetLinePickerModal.getByRole('option', { name: wiTitle });
        await option.waitFor({ state: 'visible' });
        await option.click();

        // Step 2: existing line list is shown, plus "Create Budget Line" button below it
        // Verify the existing budget line appears in the list
        await expect(detailPage.budgetLinePickerModal).toContainText(existingLineDesc);

        // Verify "Create Budget Line" button is present below the list (not just in empty state)
        await expect(detailPage.pickerCreateBudgetLineButton).toBeVisible();

        // Click "Create Budget Line" — the list disappears, form appears
        await detailPage.pickerCreateBudgetLineButton.click();
        await expect(detailPage.createFormDescriptionInput).toBeVisible();

        // Existing line list should no longer be visible
        await expect(detailPage.budgetLinePickerModal).not.toContainText(existingLineDesc);

        // Fill the form in direct mode (default): amount=500
        await detailPage.createFormDescriptionInput.fill(`${testPrefix} New Direct Line`);
        await detailPage.createFormDirectAmountInput.fill('500');

        // Register waitForResponse BEFORE submit
        const budgetCreatePromise = page.waitForResponse(
          (resp) =>
            resp.url().includes('/budgets') &&
            resp.request().method() === 'POST' &&
            resp.status() === 201,
        );
        const linkCreatePromise = page.waitForResponse(
          (resp) =>
            resp.url().includes('/budget-lines') &&
            resp.request().method() === 'POST' &&
            resp.status() === 201,
        );

        await detailPage.createFormSubmitButton.click();

        await budgetCreatePromise;
        await linkCreatePromise;

        // Picker should close
        await detailPage.budgetLinePickerModal.waitFor({ state: 'hidden' });

        // Table should appear with the new row (€500.00)
        await expect(detailPage.budgetLinesTable).toBeVisible();
        await expect(detailPage.budgetLinesSection).toContainText('500.00');
      } finally {
        if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
        if (vendorId) await deleteVendorViaApi(page, vendorId);
        if (workItemId) await deleteWorkItemViaApi(page, workItemId);
        if (budgetSourceId) await deleteBudgetSourceViaApi(page, budgetSourceId);
      }
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: Link fails — amount exceeds invoice total
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Create and link budget line — link error (Scenario 3)', () => {
  test(
    'When new line amount exceeds invoice total, form closes and error banner shown in list view',
    async ({ page, testPrefix }) => {
      const detailPage = new InvoiceDetailPage(page);

      let vendorId: string | null = null;
      let invoiceId: string | null = null;
      let workItemId: string | null = null;

      const wiTitle = `${testPrefix} Exceed WI`;

      try {
        // Setup: invoice with small amount (100), work item with no lines
        vendorId = await createVendorViaApi(page, `${testPrefix} Vendor Exceed`);
        invoiceId = await createInvoiceViaApi(page, vendorId, {
          amount: 100,
          date: '2026-06-03',
        });
        workItemId = await createWorkItemViaApi(page, { title: wiTitle });

        await detailPage.goto(invoiceId);
        await expect(detailPage.heading).toBeVisible();

        // Open picker and navigate to create form
        await detailPage.openBudgetLinePicker();
        await expect(detailPage.budgetLinePickerModal).toBeVisible();

        const wiInput = detailPage.budgetLinePickerModal.getByPlaceholder('Search work items...');
        await wiInput.fill(wiTitle);
        const option = detailPage.budgetLinePickerModal.getByRole('option', { name: wiTitle });
        await option.waitFor({ state: 'visible' });
        await option.click();

        await expect(detailPage.pickerCreateBudgetLineButton).toBeVisible();
        await detailPage.pickerCreateBudgetLineButton.click();
        await expect(detailPage.createFormDescriptionInput).toBeVisible();

        // Fill amount=200 (exceeds invoice amount of 100)
        await detailPage.createFormDescriptionInput.fill(`${testPrefix} Excess Line`);
        await detailPage.createFormDirectAmountInput.fill('200');

        // The budget create (POST /budgets) should succeed (201),
        // then the link (POST /budget-lines) should fail (400 ITEMIZED_SUM_EXCEEDS_INVOICE).
        const budgetCreatePromise = page.waitForResponse(
          (resp) =>
            resp.url().includes('/budgets') &&
            resp.request().method() === 'POST' &&
            resp.status() === 201,
        );
        const linkFailPromise = page.waitForResponse(
          (resp) =>
            resp.url().includes('/budget-lines') &&
            resp.request().method() === 'POST' &&
            resp.status() === 400,
        );

        await detailPage.createFormSubmitButton.click();

        await budgetCreatePromise;
        await linkFailPromise;

        // The BudgetLineForm (create form) should disappear — the component falls back to
        // the existing-line list view (which now includes the newly created but unlinked line)
        await expect(detailPage.createFormDescriptionInput).not.toBeVisible();

        // The picker modal should remain open at step 2 — error banner should be visible
        await expect(detailPage.budgetLinePickerModal).toBeVisible();
        await expect(detailPage.pickerErrorBanner).toBeVisible();
        await expect(detailPage.pickerErrorBanner).toContainText('exceed the invoice total');

        // The newly created (now unlinked) budget line should be visible in the list
        // so the user can manually allocate a smaller amount
        await expect(detailPage.budgetLinePickerModal).toContainText(`${testPrefix} Excess Line`);
      } finally {
        if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
        if (vendorId) await deleteVendorViaApi(page, vendorId);
        if (workItemId) await deleteWorkItemViaApi(page, workItemId);
        // Budget source not needed for this test (source field defaults to empty)
      }
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: Responsive smoke — mobile viewport (390×844)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Create and link budget line — mobile responsive (Scenario 4)', () => {
  test(
    'Budget line create form is usable on a mobile viewport',
    async ({ page, testPrefix }) => {
      // Set mobile viewport for this test
      await page.setViewportSize({ width: 390, height: 844 });

      const detailPage = new InvoiceDetailPage(page);

      let vendorId: string | null = null;
      let invoiceId: string | null = null;
      let workItemId: string | null = null;

      const wiTitle = `${testPrefix} Mobile WI`;

      try {
        vendorId = await createVendorViaApi(page, `${testPrefix} Vendor Mobile`);
        invoiceId = await createInvoiceViaApi(page, vendorId, {
          amount: 500,
          date: '2026-06-04',
        });
        workItemId = await createWorkItemViaApi(page, { title: wiTitle });

        await detailPage.goto(invoiceId);
        await expect(detailPage.heading).toBeVisible();

        // Open picker
        await detailPage.openBudgetLinePicker();
        await expect(detailPage.budgetLinePickerModal).toBeVisible();

        // Step 1: select work item
        const wiInput = detailPage.budgetLinePickerModal.getByPlaceholder('Search work items...');
        await wiInput.fill(wiTitle);
        const option = detailPage.budgetLinePickerModal.getByRole('option', { name: wiTitle });
        await option.waitFor({ state: 'visible' });
        await option.click();

        // Step 2: click "Create Budget Line"
        await expect(detailPage.pickerCreateBudgetLineButton).toBeVisible();
        await detailPage.pickerCreateBudgetLineButton.click();

        // Verify form fields are visible and usable on mobile
        await expect(detailPage.createFormDescriptionInput).toBeVisible();
        await expect(detailPage.createFormDirectAmountInput).toBeVisible();
        await expect(detailPage.createFormSubmitButton).toBeVisible();
        await expect(detailPage.createFormCancelButton).toBeVisible();

        // Fill and submit
        await detailPage.createFormDescriptionInput.fill(`${testPrefix} Mobile Line`);
        await detailPage.createFormDirectAmountInput.click();
        await detailPage.createFormDirectAmountInput.pressSequentially('100');

        const budgetCreatePromise = page.waitForResponse(
          (resp) =>
            resp.url().includes('/budgets') &&
            resp.request().method() === 'POST' &&
            resp.status() === 201,
        );
        const linkCreatePromise = page.waitForResponse(
          (resp) =>
            resp.url().includes('/budget-lines') &&
            resp.request().method() === 'POST' &&
            resp.status() === 201,
        );

        await detailPage.createFormSubmitButton.scrollIntoViewIfNeeded();
        await detailPage.createFormSubmitButton.click();
        await budgetCreatePromise;
        await linkCreatePromise;

        // Picker closes on success
        await detailPage.budgetLinePickerModal.waitFor({ state: 'hidden' });

        // Newly linked budget line appears in the section
        await expect(detailPage.budgetLinesSection).toContainText('100.00');
      } finally {
        if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
        if (vendorId) await deleteVendorViaApi(page, vendorId);
        if (workItemId) await deleteWorkItemViaApi(page, workItemId);
      }
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: Escape key closes the picker modal
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Budget line picker — Escape key closes modal (Scenario 5)', () => {
  test(
    'Pressing Escape while on the create form dismisses the picker modal entirely',
    async ({ page, testPrefix }) => {
      const detailPage = new InvoiceDetailPage(page);

      let vendorId: string | null = null;
      let invoiceId: string | null = null;
      let workItemId: string | null = null;

      const wiTitle = `${testPrefix} Escape WI`;

      try {
        vendorId = await createVendorViaApi(page, `${testPrefix} Vendor Escape`);
        invoiceId = await createInvoiceViaApi(page, vendorId, {
          amount: 300,
          date: '2026-06-05',
        });
        workItemId = await createWorkItemViaApi(page, { title: wiTitle });

        await detailPage.goto(invoiceId);
        await expect(detailPage.heading).toBeVisible();

        // Open picker modal
        await detailPage.openBudgetLinePicker();
        await expect(detailPage.budgetLinePickerModal).toBeVisible();

        // Step 1: select work item to reach step 2
        const wiInput = detailPage.budgetLinePickerModal.getByPlaceholder('Search work items...');
        await wiInput.fill(wiTitle);
        const option = detailPage.budgetLinePickerModal.getByRole('option', { name: wiTitle });
        await option.waitFor({ state: 'visible' });
        await option.click();

        // Step 2: open the create form
        await expect(detailPage.pickerCreateBudgetLineButton).toBeVisible();
        await detailPage.pickerCreateBudgetLineButton.click();
        await expect(detailPage.createFormDescriptionInput).toBeVisible();

        // Press Escape — the component listens to keydown on document (showPicker=true)
        await page.keyboard.press('Escape');

        // The entire picker modal should close (not just the form)
        await detailPage.budgetLinePickerModal.waitFor({ state: 'hidden' });

        // The page should still show the invoice detail (not navigated away)
        await expect(detailPage.heading).toBeVisible();
      } finally {
        if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
        if (vendorId) await deleteVendorViaApi(page, vendorId);
        if (workItemId) await deleteWorkItemViaApi(page, workItemId);
      }
    },
  );
});
