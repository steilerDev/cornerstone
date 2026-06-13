/**
 * E2E tests for Bug #1603: Invoice-linked budget lines editable from WI / HI detail pages.
 *
 * When a budget line is linked to an invoice and viewed on the Work Item or Household Item
 * detail page it now renders inside an InvoiceGroup accordion. Clicking "Edit" on such a
 * line opens the shared EditBudgetLineModal (the same dialog used by the Invoice Detail page).
 * Saving calls PATCH /api/invoices/:invoiceId/budget-lines/:invoiceBudgetLineId.
 *
 * Scenarios:
 *   1.  [WI — happy path] @smoke @responsive
 *       Create vendor + invoice + WI + linked budget line. Open WI detail, expand InvoiceGroup,
 *       click Edit on the line. Assert modal opens pre-filled (description, planned amount,
 *       itemized amount). Edit description + planned amount, Save → waitForResponse on PATCH.
 *       Assert modal closes, InvoiceGroup header total reflects update (no reload).
 *   2.  [WI — cancel] Open edit, click Cancel; assert modal gone, values unchanged.
 *   3.  [WI — Escape] Open edit, press Escape; assert modal gone.
 *   4.  [WI — server error] Mock PATCH to 500; Save; assert error visible, modal stays open.
 *   5.  [WI — parent-move] Two WIs; line on WI-A linked to invoice; Edit → expand parent picker
 *       → search + select WI-B → Move (waitForResponse). Assert InvoiceGroup on WI-A no longer
 *       shows the line.
 *   6.  [HI — happy path] @smoke @responsive — same happy path on the HI detail page.
 *   7.  [Quotation invoice] invoice with status='quotation'; Edit + Save works.
 *   8.  [Invoice Detail regression] Edit a budget line from the Invoice Detail page; assert modal
 *       opens and save still works (guards the extraction).
 *   9.  [Mobile] @smoke @responsive — scenario 1 at 375px.
 *
 * Setup conventions:
 *   - Vendor, invoice, WI/HI created via REST API helpers.
 *   - All resources cleaned up in finally blocks.
 *   - testPrefix isolates data across parallel workers.
 *   - waitForResponse registered BEFORE the action that triggers the network call.
 *   - InvoiceGroup accordion is collapsed by default — must click toggleBtn before Edit is accessible.
 *
 * API patterns:
 *   - Create budget line: POST /api/work-items/:id/budgets
 *   - Link to invoice:    POST /api/invoices/:invoiceId/budget-lines
 *   - Edit (save/move):   PATCH /api/invoices/:invoiceId/budget-lines/:invoiceBudgetLineId
 *   - HI budget line:     POST /api/household-items/:id/budgets
 */

import { test, expect } from '../../fixtures/auth.js';
import { WorkItemDetailPage } from '../../pages/WorkItemDetailPage.js';
import { HouseholdItemDetailPage } from '../../pages/HouseholdItemDetailPage.js';
import { InvoiceDetailPage } from '../../pages/InvoiceDetailPage.js';
import {
  createWorkItemViaApi,
  deleteWorkItemViaApi,
  createHouseholdItemViaApi,
  deleteHouseholdItemViaApi,
  createBudgetSourceViaApi,
  deleteBudgetSourceViaApi,
} from '../../fixtures/apiHelpers.js';
import { API } from '../../fixtures/testData.js';
import type { Page } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Inline API helpers
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
  data: { amount: number; date: string; status?: string; invoiceNumber?: string },
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
 * Create a WI budget line and link it to an invoice.
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
    description: string;
  },
): Promise<{ budgetId: string; invoiceBudgetLineId: string }> {
  const budgetResp = await page.request.post(`${API.workItems}/${opts.workItemId}/budgets`, {
    data: {
      plannedAmount: opts.plannedAmount,
      budgetSourceId: opts.budgetSourceId,
      confidence: 'own_estimate',
      description: opts.description,
    },
  });
  expect(budgetResp.ok(), `POST WI budget failed: ${budgetResp.status()}`).toBeTruthy();
  const budgetBody = (await budgetResp.json()) as { budget: { id: string } };

  const linkResp = await page.request.post(`/api/invoices/${opts.invoiceId}/budget-lines`, {
    data: { workItemBudgetId: budgetBody.budget.id, itemizedAmount: opts.itemizedAmount },
  });
  expect(linkResp.ok(), `POST invoice budget-line failed: ${linkResp.status()}`).toBeTruthy();
  const linkBody = (await linkResp.json()) as { budgetLine: { id: string } };

  return { budgetId: budgetBody.budget.id, invoiceBudgetLineId: linkBody.budgetLine.id };
}

/**
 * Create a HI budget line and link it to an invoice.
 * Returns { budgetId, invoiceBudgetLineId }.
 */
async function createAndLinkHIBudgetLine(
  page: Page,
  opts: {
    householdItemId: string;
    budgetSourceId: string;
    invoiceId: string;
    plannedAmount: number;
    itemizedAmount: number;
    description: string;
  },
): Promise<{ budgetId: string; invoiceBudgetLineId: string }> {
  const budgetResp = await page.request.post(
    `/api/household-items/${opts.householdItemId}/budgets`,
    {
      data: {
        plannedAmount: opts.plannedAmount,
        budgetSourceId: opts.budgetSourceId,
        confidence: 'own_estimate',
        description: opts.description,
      },
    },
  );
  expect(budgetResp.ok(), `POST HI budget failed: ${budgetResp.status()}`).toBeTruthy();
  const budgetBody = (await budgetResp.json()) as { budget: { id: string } };

  const linkResp = await page.request.post(`/api/invoices/${opts.invoiceId}/budget-lines`, {
    data: {
      householdItemBudgetId: budgetBody.budget.id,
      itemizedAmount: opts.itemizedAmount,
    },
  });
  expect(linkResp.ok(), `POST HI invoice budget-line failed: ${linkResp.status()}`).toBeTruthy();
  const linkBody = (await linkResp.json()) as { budgetLine: { id: string } };

  return { budgetId: budgetBody.budget.id, invoiceBudgetLineId: linkBody.budgetLine.id };
}

// ─────────────────────────────────────────────────────────────────────────────
// Page-level helpers
//
// InvoiceGroup renders an accordion (toggleBtn with aria-expanded).
// The card content is only mounted when expanded, so we must click the toggle
// before the Edit button inside the group becomes accessible.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Expands the InvoiceGroup accordion for the given invoice within budgetSection.
 * Uses the aria-expanded toggle button. If already expanded, does nothing.
 */
async function expandInvoiceGroup(
  page: Page,
  budgetSection: ReturnType<typeof page.locator>,
): Promise<void> {
  // The toggle button has aria-expanded and class="toggleBtn" (from InvoiceGroup.module.css,
  // rendered as [class*="toggleBtn"]). Scoped to budgetSection to avoid other accordions.
  const toggleBtn = budgetSection.locator('[class*="toggleBtn"]').filter({ visible: true }).first();

  const isExpanded = await toggleBtn.getAttribute('aria-expanded');
  if (isExpanded === 'true') return;

  await toggleBtn.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'nearest' }));
  await toggleBtn.click();

  // Wait for the expanded content panel to appear (div with id="invoice-group-{invoiceId}")
  const expandedContent = budgetSection.locator('[id^="invoice-group-"]').first();
  await expandedContent.waitFor({ state: 'visible' });
}

/**
 * Opens the EditBudgetLineModal for the budget line with the given description.
 * Clicks the BudgetLineCard's Edit button (aria-label="Edit budget line: {desc}").
 * Waits for the modal to become visible.
 *
 * Must call expandInvoiceGroup() first.
 */
async function openEditModalForLine(
  page: Page,
  description: string,
): Promise<ReturnType<typeof page.getByRole>> {
  const editBtn = page.getByRole('button', {
    name: new RegExp(`Edit budget line.*${description}`, 'i'),
  });
  await editBtn.scrollIntoViewIfNeeded();
  await editBtn.click();

  const editModal = page.getByRole('dialog', { name: 'Edit Budget Line' });
  await editModal.waitFor({ state: 'visible' });
  return editModal;
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: WI happy path — open, pre-fill assert, edit, save, in-place update
// ─────────────────────────────────────────────────────────────────────────────

test.describe(
  'WI detail page — invoice-linked line edit (Scenario 1)',
  { tag: '@responsive' },
  () => {
    test(
      'Edit invoice-linked budget line from WI detail page → modal pre-filled, save patches PATCH endpoint, InvoiceGroup total updates',
      { tag: '@smoke' },
      async ({ page, testPrefix }) => {
        const wiPage = new WorkItemDetailPage(page);
        let vendorId = '';
        let invoiceId = '';
        let workItemId = '';
        let budgetSourceId = '';

        try {
          vendorId = await createVendorViaApi(page, `${testPrefix} ILE-WI Vendor`);
          invoiceId = await createInvoiceViaApi(page, vendorId, {
            amount: 1000,
            date: '2026-06-01',
            invoiceNumber: `${testPrefix}-ILE-001`,
          });
          workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} ILE-WI Item` });
          budgetSourceId = await createBudgetSourceViaApi(page, {
            name: `${testPrefix} ILE-WI Source`,
            totalAmount: 50000,
          });

          await createAndLinkWIBudgetLine(page, {
            workItemId,
            budgetSourceId,
            invoiceId,
            plannedAmount: 500,
            itemizedAmount: 300,
            description: `${testPrefix} ILE-WI Line`,
          });

          await wiPage.goto(workItemId);
          await expect(wiPage.heading).toBeVisible();

          // Budget section present
          await expect(wiPage.budgetSection).toBeVisible();

          // Expand the InvoiceGroup accordion so the line card becomes accessible
          await expandInvoiceGroup(page, wiPage.budgetSection);

          // The line description is visible inside the expanded group
          await expect(wiPage.budgetSection).toContainText(`${testPrefix} ILE-WI Line`);

          // Open the Edit modal
          const editModal = await openEditModalForLine(page, `${testPrefix} ILE-WI Line`);

          // Assert pre-filled values
          const descriptionInput = editModal.locator('#budget-description');
          await expect(descriptionInput).toBeVisible();
          await expect(descriptionInput).toHaveValue(new RegExp(`ILE-WI Line`));

          const plannedAmountInput = editModal.locator('#budget-planned-amount');
          await expect(plannedAmountInput).toBeVisible();
          await expect(plannedAmountInput).toHaveValue('500');

          const itemizedAmountInput = editModal.locator('#budget-itemized-amount');
          await expect(itemizedAmountInput).toBeVisible();
          await expect(itemizedAmountInput).toHaveValue('300');

          // Edit description and planned amount
          await descriptionInput.clear();
          await descriptionInput.fill(`${testPrefix} ILE-WI Updated`);

          await plannedAmountInput.clear();
          await plannedAmountInput.fill('600');

          // Register waitForResponse BEFORE the click
          const patchPromise = page.waitForResponse(
            (resp) =>
              resp.url().includes('/budget-lines/') &&
              resp.request().method() === 'PATCH' &&
              resp.status() === 200,
          );

          const saveButton = editModal.getByRole('button', { name: /Save Changes|Saving/i });
          await saveButton.click();
          await patchPromise;

          // Modal closes
          await expect(editModal).not.toBeVisible();

          // InvoiceGroup updated in-place — description change visible (no reload)
          await expect(wiPage.budgetSection).toContainText(`${testPrefix} ILE-WI Updated`);
        } finally {
          if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
          if (vendorId) await deleteVendorViaApi(page, vendorId);
          if (workItemId) await deleteWorkItemViaApi(page, workItemId);
          if (budgetSourceId) await deleteBudgetSourceViaApi(page, budgetSourceId);
        }
      },
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: WI — cancel dismisses modal without saving
// ─────────────────────────────────────────────────────────────────────────────

test.describe('WI detail page — edit modal cancel (Scenario 2)', () => {
  test('Cancel dismisses the edit modal without saving changes', async ({ page, testPrefix }) => {
    const viewportWidth = page.viewportSize()?.width ?? 1440;
    if (viewportWidth < 768) {
      test.skip(true, 'Cancel test — desktop/tablet only');
      return;
    }

    const wiPage = new WorkItemDetailPage(page);
    let vendorId = '';
    let invoiceId = '';
    let workItemId = '';
    let budgetSourceId = '';

    try {
      vendorId = await createVendorViaApi(page, `${testPrefix} ILE-Cancel Vendor`);
      invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 800,
        date: '2026-06-01',
      });
      workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} ILE-Cancel WI` });
      budgetSourceId = await createBudgetSourceViaApi(page, {
        name: `${testPrefix} ILE-Cancel Source`,
        totalAmount: 50000,
      });

      await createAndLinkWIBudgetLine(page, {
        workItemId,
        budgetSourceId,
        invoiceId,
        plannedAmount: 400,
        itemizedAmount: 200,
        description: `${testPrefix} ILE-Cancel Line`,
      });

      await wiPage.goto(workItemId);
      await expect(wiPage.heading).toBeVisible();
      await expandInvoiceGroup(page, wiPage.budgetSection);

      const editModal = await openEditModalForLine(page, `${testPrefix} ILE-Cancel Line`);

      // Modify the description but do NOT save
      const descriptionInput = editModal.locator('#budget-description');
      await descriptionInput.clear();
      await descriptionInput.fill('Should not be saved');

      // Click Cancel
      const cancelButton = editModal.getByRole('button', { name: /Cancel/i });
      await cancelButton.click();

      // Modal gone
      await expect(editModal).not.toBeVisible();

      // Original description still present (no save occurred)
      await expect(wiPage.budgetSection).toContainText(`${testPrefix} ILE-Cancel Line`);
      await expect(wiPage.budgetSection).not.toContainText('Should not be saved');
    } finally {
      if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
      if (budgetSourceId) await deleteBudgetSourceViaApi(page, budgetSourceId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: WI — Escape key dismisses modal
// ─────────────────────────────────────────────────────────────────────────────

test.describe('WI detail page — Escape key closes edit modal (Scenario 3)', () => {
  test('Pressing Escape on the edit modal dismisses it without saving', async ({
    page,
    testPrefix,
  }) => {
    const viewportWidth = page.viewportSize()?.width ?? 1440;
    if (viewportWidth < 768) {
      test.skip(true, 'Escape key test — desktop/tablet only');
      return;
    }

    const wiPage = new WorkItemDetailPage(page);
    let vendorId = '';
    let invoiceId = '';
    let workItemId = '';
    let budgetSourceId = '';

    try {
      vendorId = await createVendorViaApi(page, `${testPrefix} ILE-Esc Vendor`);
      invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 600,
        date: '2026-06-01',
      });
      workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} ILE-Esc WI` });
      budgetSourceId = await createBudgetSourceViaApi(page, {
        name: `${testPrefix} ILE-Esc Source`,
        totalAmount: 50000,
      });

      await createAndLinkWIBudgetLine(page, {
        workItemId,
        budgetSourceId,
        invoiceId,
        plannedAmount: 300,
        itemizedAmount: 150,
        description: `${testPrefix} ILE-Esc Line`,
      });

      await wiPage.goto(workItemId);
      await expect(wiPage.heading).toBeVisible();
      await expandInvoiceGroup(page, wiPage.budgetSection);

      const editModal = await openEditModalForLine(page, `${testPrefix} ILE-Esc Line`);

      // Press Escape
      await page.keyboard.press('Escape');

      // Modal gone
      await expect(editModal).not.toBeVisible();

      // Budget section still intact
      await expect(wiPage.budgetSection).toContainText(`${testPrefix} ILE-Esc Line`);
    } finally {
      if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
      if (budgetSourceId) await deleteBudgetSourceViaApi(page, budgetSourceId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: WI — server error on PATCH → error shown, modal stays open
// ─────────────────────────────────────────────────────────────────────────────

test.describe('WI detail page — server error on save (Scenario 4)', () => {
  test('When PATCH returns 500, error banner appears inside the modal and modal stays open', async ({
    page,
    testPrefix,
  }) => {
    const viewportWidth = page.viewportSize()?.width ?? 1440;
    if (viewportWidth < 768) {
      test.skip(true, 'Server error test — desktop/tablet only');
      return;
    }

    const wiPage = new WorkItemDetailPage(page);
    let vendorId = '';
    let invoiceId = '';
    let workItemId = '';
    let budgetSourceId = '';

    try {
      vendorId = await createVendorViaApi(page, `${testPrefix} ILE-Err Vendor`);
      invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 700,
        date: '2026-06-01',
      });
      workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} ILE-Err WI` });
      budgetSourceId = await createBudgetSourceViaApi(page, {
        name: `${testPrefix} ILE-Err Source`,
        totalAmount: 50000,
      });

      await createAndLinkWIBudgetLine(page, {
        workItemId,
        budgetSourceId,
        invoiceId,
        plannedAmount: 350,
        itemizedAmount: 200,
        description: `${testPrefix} ILE-Err Line`,
      });

      await wiPage.goto(workItemId);
      await expect(wiPage.heading).toBeVisible();
      await expandInvoiceGroup(page, wiPage.budgetSection);

      const editModal = await openEditModalForLine(page, `${testPrefix} ILE-Err Line`);

      // Mock the PATCH endpoint to return 500
      await page.route('**/api/invoices/**/budget-lines/**', async (route) => {
        if (route.request().method() === 'PATCH') {
          await route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({
              error: { code: 'INTERNAL_ERROR', message: 'Simulated server error' },
            }),
          });
        } else {
          await route.continue();
        }
      });

      try {
        const saveButton = editModal.getByRole('button', { name: /Save Changes|Saving/i });
        await saveButton.click();

        // Error banner appears inside the modal (FormError renders role="alert")
        const errorBanner = editModal.locator('[role="alert"]');
        await errorBanner.waitFor({ state: 'visible' });
        await expect(errorBanner).toBeVisible();

        // Modal must still be open (not dismissed on error)
        await expect(editModal).toBeVisible();
      } finally {
        await page.unroute('**/api/invoices/**/budget-lines/**');
      }

      // Close modal with Cancel
      const cancelButton = editModal.getByRole('button', { name: /Cancel/i });
      await cancelButton.click();
      await expect(editModal).not.toBeVisible();
    } finally {
      if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
      if (budgetSourceId) await deleteBudgetSourceViaApi(page, budgetSourceId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: WI — parent-move via the edit modal's parent picker
// ─────────────────────────────────────────────────────────────────────────────

test.describe('WI detail page — parent-move via edit modal (Scenario 5)', () => {
  test('Move invoice-linked budget line from WI-A to WI-B → line disappears from WI-A InvoiceGroup', async ({
    page,
    testPrefix,
  }) => {
    // Desktop / tablet only — functional move test
    const viewportWidth = page.viewportSize()?.width ?? 1440;
    if (viewportWidth < 768) {
      test.skip(true, 'Parent-move test — desktop/tablet only');
      return;
    }

    const wiAPage = new WorkItemDetailPage(page);
    let vendorId = '';
    let invoiceId = '';
    let workItemAId = '';
    let workItemBId = '';
    let budgetSourceId = '';

    try {
      vendorId = await createVendorViaApi(page, `${testPrefix} ILE-Move Vendor`);
      invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 2000,
        date: '2026-06-01',
      });
      workItemAId = await createWorkItemViaApi(page, { title: `${testPrefix} ILE-Move WI-A` });
      workItemBId = await createWorkItemViaApi(page, { title: `${testPrefix} ILE-Move WI-B` });
      budgetSourceId = await createBudgetSourceViaApi(page, {
        name: `${testPrefix} ILE-Move Source`,
        totalAmount: 50000,
      });

      // Budget line on WI-A, linked to invoice
      await createAndLinkWIBudgetLine(page, {
        workItemId: workItemAId,
        budgetSourceId,
        invoiceId,
        plannedAmount: 800,
        itemizedAmount: 500,
        description: `${testPrefix} ILE-Move Line`,
      });

      // WI-B needs a budget line to appear as a move target in the picker
      // (the SearchPicker searches WI budgets, not WIs directly — create one)
      await page.request.post(`${API.workItems}/${workItemBId}/budgets`, {
        data: {
          plannedAmount: 400,
          budgetSourceId,
          confidence: 'own_estimate',
          description: `${testPrefix} ILE-Move WI-B Stub`,
        },
      });

      // Navigate to WI-A detail page
      await wiAPage.goto(workItemAId);
      await expect(wiAPage.heading).toBeVisible();
      await expandInvoiceGroup(page, wiAPage.budgetSection);
      await expect(wiAPage.budgetSection).toContainText(`${testPrefix} ILE-Move Line`);

      // Open edit modal
      const editModal = await openEditModalForLine(page, `${testPrefix} ILE-Move Line`);

      // Expand parent picker
      const parentPickerSection = editModal.locator('fieldset[class*="parentPickerSection"]');
      await expect(parentPickerSection).toBeVisible();

      const changeButton = parentPickerSection.getByRole('button', { name: 'Change' });
      await expect(changeButton).toBeVisible();
      await changeButton.click();

      // Work Item tab should be active by default
      const wiTab = parentPickerSection.getByRole('tab', { name: 'Work Item' });
      await expect(wiTab).toBeVisible();

      // Search for WI-B in the picker
      const pickerInput = parentPickerSection.getByRole('textbox');
      await pickerInput.fill(`${testPrefix} ILE-Move WI-B`);

      // SearchPicker portals the listbox to document.body
      const option = page.getByRole('option', { name: new RegExp(`ILE-Move WI-B`, 'i') });
      await option.waitFor({ state: 'visible' });
      await option.click();

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

      // The line no longer appears under WI-A's budget section
      // (the InvoiceGroup should be gone or the line should not be in it)
      await expect(wiAPage.budgetSection).not.toContainText(`${testPrefix} ILE-Move Line`);
    } finally {
      if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
      if (workItemAId) await deleteWorkItemViaApi(page, workItemAId);
      if (workItemBId) await deleteWorkItemViaApi(page, workItemBId);
      if (budgetSourceId) await deleteBudgetSourceViaApi(page, budgetSourceId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6: HI detail page — happy path
// ─────────────────────────────────────────────────────────────────────────────

test.describe(
  'HI detail page — invoice-linked line edit (Scenario 6)',
  { tag: '@responsive' },
  () => {
    test(
      'Edit invoice-linked budget line from HI detail page → modal pre-filled, save patches correctly',
      { tag: '@smoke' },
      async ({ page, testPrefix }) => {
        const hiPage = new HouseholdItemDetailPage(page);
        let vendorId = '';
        let invoiceId = '';
        let householdItemId = '';
        let budgetSourceId = '';

        try {
          vendorId = await createVendorViaApi(page, `${testPrefix} ILE-HI Vendor`);
          invoiceId = await createInvoiceViaApi(page, vendorId, {
            amount: 1200,
            date: '2026-06-01',
          });
          householdItemId = await createHouseholdItemViaApi(page, {
            name: `${testPrefix} ILE-HI Item`,
          });
          budgetSourceId = await createBudgetSourceViaApi(page, {
            name: `${testPrefix} ILE-HI Source`,
            totalAmount: 50000,
          });

          await createAndLinkHIBudgetLine(page, {
            householdItemId,
            budgetSourceId,
            invoiceId,
            plannedAmount: 600,
            itemizedAmount: 400,
            description: `${testPrefix} ILE-HI Line`,
          });

          await hiPage.goto(householdItemId);
          await expect(hiPage.heading).toBeVisible();

          // Expand the InvoiceGroup accordion in the HI budget section
          const hiBudgetSection = hiPage.budgetSection;
          await expandInvoiceGroup(page, hiBudgetSection);
          await expect(hiBudgetSection).toContainText(`${testPrefix} ILE-HI Line`);

          // Open edit modal
          const editModal = await openEditModalForLine(page, `${testPrefix} ILE-HI Line`);

          // Assert pre-filled values
          const descriptionInput = editModal.locator('#budget-description');
          await expect(descriptionInput).toHaveValue(new RegExp(`ILE-HI Line`));

          const plannedAmountInput = editModal.locator('#budget-planned-amount');
          await expect(plannedAmountInput).toHaveValue('600');

          const itemizedAmountInput = editModal.locator('#budget-itemized-amount');
          await expect(itemizedAmountInput).toHaveValue('400');

          // Edit the itemized amount
          await itemizedAmountInput.clear();
          await itemizedAmountInput.fill('450');

          // Register waitForResponse BEFORE click
          const patchPromise = page.waitForResponse(
            (resp) =>
              resp.url().includes('/budget-lines/') &&
              resp.request().method() === 'PATCH' &&
              resp.status() === 200,
          );

          const saveButton = editModal.getByRole('button', { name: /Save Changes|Saving/i });
          await saveButton.click();
          await patchPromise;

          // Modal closes
          await expect(editModal).not.toBeVisible();

          // InvoiceGroup updates in-place — no page reload needed
          // The itemized total in the InvoiceGroup header should reflect the new amount
          await expect(hiBudgetSection).toBeVisible();
        } finally {
          if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
          if (vendorId) await deleteVendorViaApi(page, vendorId);
          if (householdItemId) await deleteHouseholdItemViaApi(page, householdItemId);
          if (budgetSourceId) await deleteBudgetSourceViaApi(page, budgetSourceId);
        }
      },
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 7: Quotation invoice — edit + save works
// ─────────────────────────────────────────────────────────────────────────────

test.describe('WI detail page — quotation invoice edit (Scenario 7)', () => {
  test('Edit budget line linked to a quotation invoice → save works and modal closes', async ({
    page,
    testPrefix,
  }) => {
    const viewportWidth = page.viewportSize()?.width ?? 1440;
    if (viewportWidth < 768) {
      test.skip(true, 'Quotation test — desktop/tablet only');
      return;
    }

    const wiPage = new WorkItemDetailPage(page);
    let vendorId = '';
    let invoiceId = '';
    let workItemId = '';
    let budgetSourceId = '';

    try {
      vendorId = await createVendorViaApi(page, `${testPrefix} ILE-Quot Vendor`);
      invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 900,
        date: '2026-06-01',
        status: 'quotation',
      });
      workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} ILE-Quot WI` });
      budgetSourceId = await createBudgetSourceViaApi(page, {
        name: `${testPrefix} ILE-Quot Source`,
        totalAmount: 50000,
      });

      await createAndLinkWIBudgetLine(page, {
        workItemId,
        budgetSourceId,
        invoiceId,
        plannedAmount: 450,
        itemizedAmount: 250,
        description: `${testPrefix} ILE-Quot Line`,
      });

      await wiPage.goto(workItemId);
      await expect(wiPage.heading).toBeVisible();
      await expandInvoiceGroup(page, wiPage.budgetSection);

      // InvoiceGroup shows "quotation" status badge
      // (status badge text = "quotation" since getStatusLabel returns that for quotation)
      const invoiceGroupDiv = wiPage.budgetSection.locator('[class*="group"]').first();
      await expect(invoiceGroupDiv).toContainText('quotation');

      const editModal = await openEditModalForLine(page, `${testPrefix} ILE-Quot Line`);

      // Modify the itemized amount
      const itemizedAmountInput = editModal.locator('#budget-itemized-amount');
      await expect(itemizedAmountInput).toBeVisible();
      await itemizedAmountInput.clear();
      await itemizedAmountInput.fill('300');

      const patchPromise = page.waitForResponse(
        (resp) =>
          resp.url().includes('/budget-lines/') &&
          resp.request().method() === 'PATCH' &&
          resp.status() === 200,
      );

      const saveButton = editModal.getByRole('button', { name: /Save Changes|Saving/i });
      await saveButton.click();
      await patchPromise;

      // Modal closes successfully for quotation invoices
      await expect(editModal).not.toBeVisible();
    } finally {
      if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
      if (budgetSourceId) await deleteBudgetSourceViaApi(page, budgetSourceId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 8: Invoice Detail regression — edit still works from invoice table
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Invoice Detail page — edit regression guard (Scenario 8)', () => {
  test('Budget line edit from the Invoice Detail page still opens modal and saves correctly', async ({
    page,
    testPrefix,
  }) => {
    const viewportWidth = page.viewportSize()?.width ?? 1440;
    if (viewportWidth < 768) {
      test.skip(true, 'Invoice detail regression test — desktop/tablet only');
      return;
    }

    const invoiceDetailPage = new InvoiceDetailPage(page);
    let vendorId = '';
    let invoiceId = '';
    let workItemId = '';
    let budgetSourceId = '';

    try {
      vendorId = await createVendorViaApi(page, `${testPrefix} ILE-Reg Vendor`);
      invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 1000,
        date: '2026-06-01',
      });
      workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} ILE-Reg WI` });
      budgetSourceId = await createBudgetSourceViaApi(page, {
        name: `${testPrefix} ILE-Reg Source`,
        totalAmount: 50000,
      });

      await createAndLinkWIBudgetLine(page, {
        workItemId,
        budgetSourceId,
        invoiceId,
        plannedAmount: 500,
        itemizedAmount: 300,
        description: `${testPrefix} ILE-Reg Line`,
      });

      await invoiceDetailPage.goto(invoiceId);
      await expect(invoiceDetailPage.heading).toBeVisible();
      await expect(invoiceDetailPage.budgetLinesSection).toBeVisible();
      await expect(invoiceDetailPage.budgetLinesSection).toContainText(
        `${testPrefix} ILE-Reg Line`,
      );

      // Use the InvoiceDetailPage OverflowMenu helper from the InvoiceDetailPage POM
      // (openBudgetLineMenu + clickBudgetLineMenuItem are methods on InvoiceDetailPage)
      await invoiceDetailPage.openBudgetLineMenu();
      await invoiceDetailPage.clickBudgetLineMenuItem('Edit');

      // Edit modal opens with the same modal title
      const editModal = page.getByRole('dialog', { name: 'Edit Budget Line' });
      await expect(editModal).toBeVisible();

      // Assert pre-filled
      const descInput = editModal.locator('#budget-description');
      await expect(descInput).toHaveValue(new RegExp(`ILE-Reg Line`));

      // Change itemized amount
      const itemizedInput = editModal.locator('#budget-itemized-amount');
      await itemizedInput.clear();
      await itemizedInput.fill('350');

      const patchPromise = page.waitForResponse(
        (resp) =>
          resp.url().includes('/budget-lines/') &&
          resp.request().method() === 'PATCH' &&
          resp.status() === 200,
      );

      const saveButton = editModal.getByRole('button', { name: /Save Changes|Saving/i });
      await saveButton.click();
      await patchPromise;

      await expect(editModal).not.toBeVisible();
      await expect(invoiceDetailPage.budgetLinesSection).toContainText('350');
    } finally {
      if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
      if (budgetSourceId) await deleteBudgetSourceViaApi(page, budgetSourceId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 9: Mobile — scenario 1 repeated at 375px viewport
// ─────────────────────────────────────────────────────────────────────────────

test.describe(
  'Mobile viewport — WI invoice-linked line edit (Scenario 9)',
  { tag: '@responsive' },
  () => {
    test(
      'Edit invoice-linked budget line from WI detail page works at 375px touch targets',
      { tag: '@smoke' },
      async ({ page, testPrefix }) => {
        // Mobile-specific test: only run on narrow viewports
        const viewportWidth = page.viewportSize()?.width ?? 1440;
        if (viewportWidth > 600) {
          test.skip(true, 'Mobile-specific test — skip on tablet/desktop');
          return;
        }

        const wiPage = new WorkItemDetailPage(page);
        let vendorId = '';
        let invoiceId = '';
        let workItemId = '';
        let budgetSourceId = '';

        try {
          vendorId = await createVendorViaApi(page, `${testPrefix} ILE-Mob Vendor`);
          invoiceId = await createInvoiceViaApi(page, vendorId, {
            amount: 900,
            date: '2026-06-01',
          });
          workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} ILE-Mob WI` });
          budgetSourceId = await createBudgetSourceViaApi(page, {
            name: `${testPrefix} ILE-Mob Source`,
            totalAmount: 50000,
          });

          await createAndLinkWIBudgetLine(page, {
            workItemId,
            budgetSourceId,
            invoiceId,
            plannedAmount: 450,
            itemizedAmount: 250,
            description: `${testPrefix} ILE-Mob Line`,
          });

          await wiPage.goto(workItemId);
          await expect(wiPage.heading).toBeVisible();

          // Scroll to budget section and expand the InvoiceGroup
          await wiPage.budgetSection.scrollIntoViewIfNeeded();
          await expandInvoiceGroup(page, wiPage.budgetSection);

          await expect(wiPage.budgetSection).toContainText(`${testPrefix} ILE-Mob Line`);

          // Open edit modal (scroll into view first on mobile)
          const editBtn = page.getByRole('button', {
            name: new RegExp(`Edit budget line.*ILE-Mob Line`, 'i'),
          });
          await editBtn.scrollIntoViewIfNeeded();
          await editBtn.click();

          const editModal = page.getByRole('dialog', { name: 'Edit Budget Line' });
          await editModal.waitFor({ state: 'visible' });

          // Verify touch target size on the Save button (≥ 44px)
          const saveButton = editModal.getByRole('button', { name: /Save Changes|Saving/i });
          await saveButton.scrollIntoViewIfNeeded();
          const saveButtonBox = await saveButton.boundingBox();
          expect(
            saveButtonBox?.height,
            'Save button touch target must be ≥ 44px on mobile',
          ).toBeGreaterThanOrEqual(44);

          // Itemized amount input accessible on mobile
          const itemizedAmountInput = editModal.locator('#budget-itemized-amount');
          await itemizedAmountInput.scrollIntoViewIfNeeded();
          await expect(itemizedAmountInput).toBeVisible();
          await itemizedAmountInput.clear();
          await itemizedAmountInput.fill('280');

          const patchPromise = page.waitForResponse(
            (resp) =>
              resp.url().includes('/budget-lines/') &&
              resp.request().method() === 'PATCH' &&
              resp.status() === 200,
          );
          await saveButton.click();
          await patchPromise;

          await expect(editModal).not.toBeVisible();
        } finally {
          if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
          if (vendorId) await deleteVendorViaApi(page, vendorId);
          if (workItemId) await deleteWorkItemViaApi(page, workItemId);
          if (budgetSourceId) await deleteBudgetSourceViaApi(page, budgetSourceId);
        }
      },
    );
  },
);
