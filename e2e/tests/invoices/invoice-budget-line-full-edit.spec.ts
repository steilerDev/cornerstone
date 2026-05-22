/**
 * E2E tests for Invoice Budget Line Full Edit + Parent Move (Issue #1553)
 *
 * The "Edit" action on an invoice budget line now opens a full BudgetLineForm
 * (description, confidence, planned amount, itemized amount) plus a collapsed
 * parent-picker section that allows the user to move the line to a different
 * work item or household item within the same invoice.
 *
 * Scenarios covered:
 *   1. Edit non-parent fields (description + itemized amount) on a WI budget line
 *   2. Same-table WI → WI move from invoice detail page
 *   3. Cross-table WI → HI move with move-hint banner
 *   4. BUDGET_LINE_ALREADY_LINKED guard — error shown, modal stays open
 *   5. WI detail page inline edit — full form visible, parent picker present (wired)
 *   6. Mobile viewport — edit modal usable at 375px touch targets
 *
 * API used:
 *   - PATCH /api/invoices/:invoiceId/budget-lines/:id  (edit-and-move)
 *
 * Shared helpers reuse the inline helper pattern from invoice-budget-line-edit-remove.spec.ts.
 */

import { test, expect } from '../../fixtures/auth.js';
import { InvoiceDetailPage } from '../../pages/InvoiceDetailPage.js';
import { WorkItemDetailPage } from '../../pages/WorkItemDetailPage.js';
import {
  createWorkItemViaApi,
  deleteWorkItemViaApi,
  createBudgetSourceViaApi,
  deleteBudgetSourceViaApi,
  createHouseholdItemViaApi,
  deleteHouseholdItemViaApi,
} from '../../fixtures/apiHelpers.js';
import { API } from '../../fixtures/testData.js';
import type { Page } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Inline helpers (mirrors invoice-budget-line-edit-remove.spec.ts)
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
 * Creates a work item budget line and links it to an invoice.
 * Returns { budgetId, invoiceBudgetLineId }.
 */
async function createAndLinkWIBudgetLine(
  page: Page,
  opts: {
    workItemId: string;
    budgetSourceId: string;
    invoiceId: string;
    plannedAmount: number;
    itemizedAmount: number;
    description?: string;
  },
): Promise<{ budgetId: string; invoiceBudgetLineId: string }> {
  const budgetResp = await page.request.post(`${API.workItems}/${opts.workItemId}/budgets`, {
    data: {
      plannedAmount: opts.plannedAmount,
      budgetSourceId: opts.budgetSourceId,
      confidence: 'own_estimate',
      description: opts.description ?? 'E2E Budget Line',
    },
  });
  expect(
    budgetResp.ok(),
    `POST work item budget failed: ${budgetResp.status()}`,
  ).toBeTruthy();
  const budgetBody = (await budgetResp.json()) as { budget: { id: string } };

  const linkResp = await page.request.post(`/api/invoices/${opts.invoiceId}/budget-lines`, {
    data: {
      workItemBudgetId: budgetBody.budget.id,
      itemizedAmount: opts.itemizedAmount,
    },
  });
  expect(
    linkResp.ok(),
    `POST invoice budget-line failed: ${linkResp.status()}`,
  ).toBeTruthy();
  const linkBody = (await linkResp.json()) as { budgetLine: { id: string } };

  return {
    budgetId: budgetBody.budget.id,
    invoiceBudgetLineId: linkBody.budgetLine.id,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: Edit non-parent fields (description + itemized amount)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Full edit — non-parent fields (Scenario 1)', { tag: '@responsive' }, () => {
  test(
    'Edit description and itemized amount on invoice budget line → row reflects changes',
    { tag: '@smoke' },
    async ({ page, testPrefix }) => {
      const detailPage = new InvoiceDetailPage(page);
      let vendorId = '';
      let invoiceId = '';
      let workItemId = '';
      let budgetSourceId = '';

      try {
        vendorId = await createVendorViaApi(page, `${testPrefix} FullEdit Vendor`);
        invoiceId = await createInvoiceViaApi(page, vendorId, {
          amount: 1000,
          date: '2026-06-01',
        });
        workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} FullEdit WI` });
        budgetSourceId = await createBudgetSourceViaApi(page, {
          name: `${testPrefix} FullEdit Source`,
          totalAmount: 50000,
        });

        await createAndLinkWIBudgetLine(page, {
          workItemId,
          budgetSourceId,
          invoiceId,
          plannedAmount: 500,
          itemizedAmount: 300,
          description: `${testPrefix} Original Desc`,
        });

        await detailPage.goto(invoiceId);
        await expect(detailPage.heading).toBeVisible();
        await expect(detailPage.budgetLinesSection).toBeVisible();

        // Original description and amount visible
        await expect(detailPage.budgetLinesSection).toContainText('Original Desc');
        await expect(detailPage.budgetLinesSection).toContainText('300');

        // Open the OverflowMenu → Edit
        await detailPage.openBudgetLineMenu();
        await detailPage.clickBudgetLineMenuItem('Edit');

        // Full edit modal opens with title "Edit Budget Line"
        const editModal = page.getByRole('dialog', { name: 'Edit Budget Line' });
        await expect(editModal).toBeVisible();

        // Description input pre-populated
        const descriptionInput = editModal.locator('#budget-description');
        await expect(descriptionInput).toBeVisible();
        await expect(descriptionInput).toHaveValue(/Original Desc/);

        // Itemized amount input pre-populated with 300
        const itemizedInput = editModal.locator('#budget-itemized-amount');
        await expect(itemizedInput).toBeVisible();
        await expect(itemizedInput).toHaveValue('300');

        // Parent picker section visible in collapsed state showing current parent
        const parentPickerSection = editModal.locator('fieldset[class*="parentPickerSection"]');
        await expect(parentPickerSection).toBeVisible();
        // Legend says "Linked item"
        await expect(parentPickerSection).toContainText('Linked item');
        // "Change" button present in collapsed state
        const changeButton = parentPickerSection.getByRole('button', { name: 'Change' });
        await expect(changeButton).toBeVisible();

        // Update description
        await descriptionInput.clear();
        await descriptionInput.fill('Updated description');

        // Update itemized amount
        await itemizedInput.clear();
        await itemizedInput.fill('425');

        // Save — PATCH /api/invoices/:id/budget-lines/:lineId
        const patchPromise = page.waitForResponse(
          (resp) =>
            resp.url().includes('/budget-lines/') &&
            resp.request().method() === 'PATCH' &&
            resp.status() === 200,
        );
        const saveButton = editModal.getByRole('button', { name: /^Save|Saving/i });
        await saveButton.click();
        await patchPromise;

        // Modal closes
        await expect(editModal).not.toBeVisible();

        // Row shows updated description and amount
        await expect(detailPage.budgetLinesSection).toContainText('Updated description');
        await expect(detailPage.budgetLinesSection).toContainText('425');

        // Remaining = 1000 − 425 = 575
        const remainingCell = detailPage.budgetLinesSection.locator('[aria-live="polite"]');
        await expect(remainingCell).toContainText('575');
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
// Scenario 2: Same-table WI → WI move
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Same-table WI → WI move (Scenario 2)', { tag: '@responsive' }, () => {
  test(
    'Move budget line from WI-A to WI-B → Linked Item column shows WI-B title',
    { tag: '@smoke' },
    async ({ page, testPrefix }) => {
      // Skip on mobile — functional move test, not layout
      const viewportWidth = page.viewportSize()?.width ?? 1440;
      if (viewportWidth < 768) {
        test.skip(true, 'WI → WI move test — desktop/tablet only');
        return;
      }

      const detailPage = new InvoiceDetailPage(page);
      let vendorId = '';
      let invoiceId = '';
      let workItemAId = '';
      let workItemBId = '';
      let budgetSourceId = '';

      try {
        vendorId = await createVendorViaApi(page, `${testPrefix} WI2WI Vendor`);
        invoiceId = await createInvoiceViaApi(page, vendorId, {
          amount: 2000,
          date: '2026-06-01',
        });
        workItemAId = await createWorkItemViaApi(page, { title: `${testPrefix} WI-A Source` });
        workItemBId = await createWorkItemViaApi(page, { title: `${testPrefix} WI-B Target` });
        budgetSourceId = await createBudgetSourceViaApi(page, {
          name: `${testPrefix} WI2WI Source`,
          totalAmount: 50000,
        });

        // Create budget line on WI-A and link to invoice
        await createAndLinkWIBudgetLine(page, {
          workItemId: workItemAId,
          budgetSourceId,
          invoiceId,
          plannedAmount: 800,
          itemizedAmount: 500,
          description: `${testPrefix} WI2WI Line`,
        });

        // Also create a budget line on WI-B (not linked to invoice — needed as move target)
        const budgetBResp = await page.request.post(`${API.workItems}/${workItemBId}/budgets`, {
          data: {
            plannedAmount: 600,
            budgetSourceId,
            confidence: 'own_estimate',
            description: `${testPrefix} WI-B Existing Line`,
          },
        });
        expect(budgetBResp.ok(), `POST WI-B budget failed: ${budgetBResp.status()}`).toBeTruthy();

        await detailPage.goto(invoiceId);
        await expect(detailPage.heading).toBeVisible();

        // Linked Item column shows WI-A
        await expect(detailPage.budgetLinesSection).toContainText('WI-A Source');

        // Open Edit modal
        await detailPage.openBudgetLineMenu();
        await detailPage.clickBudgetLineMenuItem('Edit');

        const editModal = page.getByRole('dialog', { name: 'Edit Budget Line' });
        await expect(editModal).toBeVisible();

        // Expand parent picker
        const parentPickerSection = editModal.locator('fieldset[class*="parentPickerSection"]');
        const changeButton = parentPickerSection.getByRole('button', { name: 'Change' });
        await changeButton.click();

        // Tabs appear: "Work Item" (active by default) and "Household Item"
        const wiTab = parentPickerSection.getByRole('button', { name: 'Work Item' });
        await expect(wiTab).toBeVisible();
        // Work Item tab already active — no need to click

        // Search for WI-B in the work item picker
        const wiPickerInput = parentPickerSection.getByRole('combobox');
        await wiPickerInput.fill(`${testPrefix} WI-B Target`);

        // Select from dropdown
        const option = page.getByRole('option', { name: new RegExp(`WI-B Target`, 'i') });
        await expect(option).toBeVisible();
        await option.click();

        // No cross-table move hint (same-table: WI → WI)
        const moveHint = parentPickerSection.locator('[role="status"]');
        await expect(moveHint).not.toBeVisible();

        // Click "Move to selected item"
        const moveButton = parentPickerSection.getByRole('button', {
          name: /Move to selected item|Moving/i,
        });

        const patchPromise = page.waitForResponse(
          (resp) =>
            resp.url().includes('/budget-lines/') &&
            resp.request().method() === 'PATCH' &&
            resp.status() === 200,
        );
        await moveButton.click();
        await patchPromise;

        // Modal closes
        await expect(editModal).not.toBeVisible();

        // Linked Item column now shows WI-B
        await expect(detailPage.budgetLinesSection).toContainText('WI-B Target');
        await expect(detailPage.budgetLinesSection).not.toContainText('WI-A Source');
      } finally {
        if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
        if (vendorId) await deleteVendorViaApi(page, vendorId);
        if (workItemAId) await deleteWorkItemViaApi(page, workItemAId);
        if (workItemBId) await deleteWorkItemViaApi(page, workItemBId);
        if (budgetSourceId) await deleteBudgetSourceViaApi(page, budgetSourceId);
      }
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: Cross-table WI → HI move with move-hint banner
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Cross-table WI → HI move (Scenario 3)', { tag: '@responsive' }, () => {
  test(
    'Move budget line from WI to HI → move hint visible, Linked Item updates, HI shows line',
    async ({ page, testPrefix }) => {
      // Skip on mobile — functional move test, not layout
      const viewportWidth = page.viewportSize()?.width ?? 1440;
      if (viewportWidth < 768) {
        test.skip(true, 'Cross-table move test — desktop/tablet only');
        return;
      }

      const detailPage = new InvoiceDetailPage(page);
      let vendorId = '';
      let invoiceId = '';
      let workItemId = '';
      let householdItemId = '';
      let budgetSourceId = '';

      try {
        vendorId = await createVendorViaApi(page, `${testPrefix} WI2HI Vendor`);
        invoiceId = await createInvoiceViaApi(page, vendorId, {
          amount: 1500,
          date: '2026-06-01',
        });
        workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} WI2HI Source WI` });
        householdItemId = await createHouseholdItemViaApi(page, {
          name: `${testPrefix} WI2HI Target HI`,
        });
        budgetSourceId = await createBudgetSourceViaApi(page, {
          name: `${testPrefix} WI2HI Source`,
          totalAmount: 50000,
        });

        await createAndLinkWIBudgetLine(page, {
          workItemId,
          budgetSourceId,
          invoiceId,
          plannedAmount: 700,
          itemizedAmount: 400,
          description: `${testPrefix} WI2HI Line`,
        });

        await detailPage.goto(invoiceId);
        await expect(detailPage.heading).toBeVisible();

        // Confirm WI is shown in Linked Item column
        await expect(detailPage.budgetLinesSection).toContainText('WI2HI Source WI');

        // Open Edit modal
        await detailPage.openBudgetLineMenu();
        await detailPage.clickBudgetLineMenuItem('Edit');

        const editModal = page.getByRole('dialog', { name: 'Edit Budget Line' });
        await expect(editModal).toBeVisible();

        // Expand parent picker
        const parentPickerSection = editModal.locator('fieldset[class*="parentPickerSection"]');
        const changeButton = parentPickerSection.getByRole('button', { name: 'Change' });
        await changeButton.click();

        // Switch to Household Item tab
        const hiTab = parentPickerSection.getByRole('button', { name: 'Household Item' });
        await expect(hiTab).toBeVisible();
        await hiTab.click();

        // Cross-table move hint banner appears (role="status")
        const moveHint = parentPickerSection.locator('[role="status"]');
        await expect(moveHint).toBeVisible();
        await expect(moveHint).toContainText(/transfer/i);

        // Search for the target HI
        const hiPickerInput = parentPickerSection.getByRole('combobox');
        await hiPickerInput.fill(`${testPrefix} WI2HI Target HI`);

        const option = page.getByRole('option', { name: new RegExp(`WI2HI Target HI`, 'i') });
        await expect(option).toBeVisible();
        await option.click();

        // Move hint still visible after selection
        await expect(moveHint).toBeVisible();

        // Click "Move to selected item"
        const moveButton = parentPickerSection.getByRole('button', {
          name: /Move to selected item|Moving/i,
        });

        const patchPromise = page.waitForResponse(
          (resp) =>
            resp.url().includes('/budget-lines/') &&
            resp.request().method() === 'PATCH' &&
            resp.status() === 200,
        );
        await moveButton.click();
        await patchPromise;

        // Modal closes
        await expect(editModal).not.toBeVisible();

        // Linked Item column now references the HI
        await expect(detailPage.budgetLinesSection).toContainText('WI2HI Target HI');
        await expect(detailPage.budgetLinesSection).not.toContainText('WI2HI Source WI');
      } finally {
        if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
        if (vendorId) await deleteVendorViaApi(page, vendorId);
        if (workItemId) await deleteWorkItemViaApi(page, workItemId);
        if (householdItemId) await deleteHouseholdItemViaApi(page, householdItemId);
        if (budgetSourceId) await deleteBudgetSourceViaApi(page, budgetSourceId);
      }
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: BUDGET_LINE_ALREADY_LINKED guard
// ─────────────────────────────────────────────────────────────────────────────

test.describe('BUDGET_LINE_ALREADY_LINKED guard (Scenario 4)', () => {
  test(
    'Attempting to move budget line to WI that already has a line on this invoice → error in modal',
    async ({ page, testPrefix }) => {
      // Desktop only — error behaviour test
      const viewportWidth = page.viewportSize()?.width ?? 1440;
      if (viewportWidth < 1024) {
        test.skip(true, 'Error guard test — desktop only');
        return;
      }

      const detailPage = new InvoiceDetailPage(page);
      let vendorId = '';
      let invoiceId = '';
      let workItemAId = '';
      let workItemBId = '';
      let budgetSourceId = '';

      try {
        vendorId = await createVendorViaApi(page, `${testPrefix} AlreadyLinked Vendor`);
        invoiceId = await createInvoiceViaApi(page, vendorId, {
          amount: 3000,
          date: '2026-06-01',
        });
        workItemAId = await createWorkItemViaApi(page, {
          title: `${testPrefix} AlreadyLinked WI-A`,
        });
        workItemBId = await createWorkItemViaApi(page, {
          title: `${testPrefix} AlreadyLinked WI-B`,
        });
        budgetSourceId = await createBudgetSourceViaApi(page, {
          name: `${testPrefix} AlreadyLinked Source`,
          totalAmount: 50000,
        });

        // Link WI-A budget line to invoice
        await createAndLinkWIBudgetLine(page, {
          workItemId: workItemAId,
          budgetSourceId,
          invoiceId,
          plannedAmount: 1000,
          itemizedAmount: 500,
          description: `${testPrefix} Line A`,
        });

        // Link WI-B budget line to the SAME invoice (creating the conflict)
        await createAndLinkWIBudgetLine(page, {
          workItemId: workItemBId,
          budgetSourceId,
          invoiceId,
          plannedAmount: 800,
          itemizedAmount: 400,
          description: `${testPrefix} Line B`,
        });

        await detailPage.goto(invoiceId);
        await expect(detailPage.heading).toBeVisible();

        // Both lines should be visible
        await expect(detailPage.budgetLinesSection).toContainText('Line A');
        await expect(detailPage.budgetLinesSection).toContainText('Line B');

        // Open Edit modal for WI-A's line (the one with "Line A" description)
        // Use the description-scoped menu trigger
        await detailPage.openBudgetLineMenu('Line A');
        await detailPage.clickBudgetLineMenuItem('Edit');

        const editModal = page.getByRole('dialog', { name: 'Edit Budget Line' });
        await expect(editModal).toBeVisible();

        // Expand parent picker
        const parentPickerSection = editModal.locator('fieldset[class*="parentPickerSection"]');
        const changeButton = parentPickerSection.getByRole('button', { name: 'Change' });
        await changeButton.click();

        // Work Item tab already active — search for WI-B (which already has a line on this invoice)
        const wiPickerInput = parentPickerSection.getByRole('combobox');
        await wiPickerInput.fill(`${testPrefix} AlreadyLinked WI-B`);

        const option = page.getByRole('option', {
          name: new RegExp(`AlreadyLinked WI-B`, 'i'),
        });
        await expect(option).toBeVisible();
        await option.click();

        // Click "Move to selected item" — expect 409 from the backend guard
        const moveButton = parentPickerSection.getByRole('button', {
          name: /Move to selected item|Moving/i,
        });

        const patchErrorPromise = page.waitForResponse(
          (resp) =>
            resp.url().includes('/budget-lines/') &&
            resp.request().method() === 'PATCH' &&
            (resp.status() === 409 || resp.status() === 400),
        );
        await moveButton.click();
        await patchErrorPromise;

        // Error banner appears inside the modal (from movePickerError state)
        const errorParagraph = parentPickerSection.locator('[class*="parentPickerError"]');
        await expect(errorParagraph).toBeVisible();

        // Modal stays open — user can correct their choice
        await expect(editModal).toBeVisible();

        // Both budget lines remain unchanged
        await expect(detailPage.budgetLinesSection).toContainText('Line A');
        await expect(detailPage.budgetLinesSection).toContainText('Line B');

        // Cancel to close modal cleanly
        const cancelButton = editModal.getByRole('button', { name: 'Cancel' });
        await cancelButton.click();
        await expect(editModal).not.toBeVisible();
      } finally {
        if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
        if (vendorId) await deleteVendorViaApi(page, vendorId);
        if (workItemAId) await deleteWorkItemViaApi(page, workItemAId);
        if (workItemBId) await deleteWorkItemViaApi(page, workItemBId);
        if (budgetSourceId) await deleteBudgetSourceViaApi(page, budgetSourceId);
      }
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: WI detail page inline edit — full BudgetLineForm visible
//
// NOTE: WorkItemDetailPage now wires onMoveBudgetLine (commit e924b70f), so the
// parent picker IS present when editing a budget line on the WI/HI detail page.
// This test verifies that:
//   a) The Edit button opens the inline BudgetLineForm (parity with invoice page)
//   b) The description and planned amount inputs are visible and editable
//   c) The parent picker section IS visible (onMoveBudgetLine is now wired)
//   d) The "Change" button is visible in collapsed state (line has a current parent)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('WI detail page inline edit — form visible (Scenario 5)', () => {
  test(
    'Edit budget line on WI detail page → inline form opens with description + planned amount',
    async ({ page, testPrefix }) => {
      // Desktop / tablet only — functional test
      const viewportWidth = page.viewportSize()?.width ?? 1440;
      if (viewportWidth < 768) {
        test.skip(true, 'WI inline edit test — desktop/tablet only');
        return;
      }

      const wiDetailPage = new WorkItemDetailPage(page);
      let workItemId = '';
      let budgetSourceId = '';

      try {
        workItemId = await createWorkItemViaApi(page, {
          title: `${testPrefix} WI Inline Edit`,
        });
        budgetSourceId = await createBudgetSourceViaApi(page, {
          name: `${testPrefix} WI Inline Source`,
          totalAmount: 50000,
        });

        // Create a budget line directly on the work item (not linked to any invoice)
        const budgetResp = await page.request.post(`${API.workItems}/${workItemId}/budgets`, {
          data: {
            plannedAmount: 600,
            budgetSourceId,
            confidence: 'own_estimate',
            description: `${testPrefix} WI Inline Desc`,
          },
        });
        expect(
          budgetResp.ok(),
          `POST work item budget failed: ${budgetResp.status()}`,
        ).toBeTruthy();

        await wiDetailPage.goto(workItemId);
        await expect(wiDetailPage.heading).toBeVisible();

        // Budget section visible and contains the line
        await expect(wiDetailPage.budgetSection).toBeVisible();
        await expect(wiDetailPage.budgetSection).toContainText('WI Inline Desc');

        // Click the Edit button for this budget line
        const editBudgetLineButton = wiDetailPage.budgetSection.getByRole('button', {
          name: /Edit budget line/i,
        });
        await expect(editBudgetLineButton).toBeVisible();
        await editBudgetLineButton.click();

        // Inline form opens with description and planned amount inputs
        const descriptionInput = wiDetailPage.budgetSection.locator('#budget-description');
        await expect(descriptionInput).toBeVisible();
        await expect(descriptionInput).toHaveValue(/WI Inline Desc/);

        const plannedAmountInput = wiDetailPage.budgetSection.locator('#budget-planned-amount');
        await expect(plannedAmountInput).toBeVisible();
        await expect(plannedAmountInput).toHaveValue('600');

        // Parent picker section IS present (onMoveBudgetLine is now wired by WorkItemDetailPage)
        const parentPickerSection = wiDetailPage.budgetSection.locator(
          'fieldset[class*="parentPickerSection"]',
        );
        await expect(parentPickerSection).toBeVisible();
        // "Change" button visible in collapsed state — line has a current parent (this WI)
        const changeButton = parentPickerSection.getByRole('button', { name: 'Change' });
        await expect(changeButton).toBeVisible();

        // Update description and save
        await descriptionInput.clear();
        await descriptionInput.fill(`${testPrefix} WI Inline Updated`);

        const savePromise = page.waitForResponse(
          (resp) =>
            resp.url().includes(`/work-items/${workItemId}/budgets`) &&
            resp.request().method() === 'PATCH' &&
            resp.status() === 200,
        );
        const saveButton = wiDetailPage.budgetSection
          .locator('[class*="submitButton"]')
          .filter({ visible: true });
        await saveButton.click();
        await savePromise;

        // Budget line row now shows updated description
        await expect(wiDetailPage.budgetSection).toContainText('WI Inline Updated');
      } finally {
        if (workItemId) await deleteWorkItemViaApi(page, workItemId);
        if (budgetSourceId) await deleteBudgetSourceViaApi(page, budgetSourceId);
      }
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6: Mobile viewport — edit modal usable at 375px
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Mobile viewport — full edit modal (Scenario 6)', () => {
  test('Full edit modal is usable on mobile viewport (375px touch targets)', async ({
    page,
    testPrefix,
  }) => {
    // Only run on mobile viewports (≤600px)
    const viewportWidth = page.viewportSize()?.width ?? 1440;
    if (viewportWidth > 600) {
      test.skip(true, 'Mobile-specific test — skip on tablet/desktop viewports');
      return;
    }

    const detailPage = new InvoiceDetailPage(page);
    let vendorId = '';
    let invoiceId = '';
    let workItemId = '';
    let budgetSourceId = '';

    try {
      vendorId = await createVendorViaApi(page, `${testPrefix} MobEdit Vendor`);
      invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 800,
        date: '2026-06-01',
      });
      workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} MobEdit WI` });
      budgetSourceId = await createBudgetSourceViaApi(page, {
        name: `${testPrefix} MobEdit Source`,
        totalAmount: 50000,
      });

      await createAndLinkWIBudgetLine(page, {
        workItemId,
        budgetSourceId,
        invoiceId,
        plannedAmount: 400,
        itemizedAmount: 250,
        description: `${testPrefix} MobEdit Desc`,
      });

      await detailPage.goto(invoiceId);
      await expect(detailPage.heading).toBeVisible();
      await expect(detailPage.budgetLinesSection).toContainText('250');

      // Open OverflowMenu → Edit
      await detailPage.openBudgetLineMenu();
      await detailPage.clickBudgetLineMenuItem('Edit');

      const editModal = page.getByRole('dialog', { name: 'Edit Budget Line' });
      await expect(editModal).toBeVisible();

      // Itemized amount input accessible and tappable
      const itemizedInput = editModal.locator('#budget-itemized-amount');
      await itemizedInput.scrollIntoViewIfNeeded();
      await expect(itemizedInput).toBeVisible();

      // Touch target: "Change" button in the parent picker section
      const parentPickerSection = editModal.locator('fieldset[class*="parentPickerSection"]');
      await expect(parentPickerSection).toBeVisible();
      const changeButton = parentPickerSection.getByRole('button', { name: 'Change' });
      await changeButton.scrollIntoViewIfNeeded();
      await expect(changeButton).toBeVisible();

      // Verify touch target height ≥ 44px on mobile
      const changeButtonBox = await changeButton.boundingBox();
      expect(
        changeButtonBox?.height,
        'Change button touch target must be ≥ 44px on mobile',
      ).toBeGreaterThanOrEqual(44);

      // Update itemized amount
      await itemizedInput.clear();
      await itemizedInput.fill('300');

      // Scroll Save button into view and click
      const saveButton = editModal.getByRole('button', { name: /^Save|Saving/i });
      await saveButton.scrollIntoViewIfNeeded();

      const patchPromise = page.waitForResponse(
        (resp) =>
          resp.url().includes('/budget-lines/') &&
          resp.request().method() === 'PATCH' &&
          resp.status() === 200,
      );
      await saveButton.click();
      await patchPromise;

      await expect(editModal).not.toBeVisible();
      await expect(detailPage.budgetLinesSection).toContainText('300');
    } finally {
      if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
      if (budgetSourceId) await deleteBudgetSourceViaApi(page, budgetSourceId);
    }
  });
});
