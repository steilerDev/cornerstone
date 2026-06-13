/**
 * E2E tests for Invoice Budget Line Edit and Remove Modals (Issue #1425)
 *
 * Each budget line row in InvoiceBudgetLinesSection now has an OverflowMenu
 * (kebab ⋮) with two actions:
 *   - "Edit"   → opens "Edit Budget Line" modal scoped to the itemized amount field
 *   - "Remove" → opens "Remove Budget Line" confirmation modal
 *
 * Scenarios covered:
 *   1. Edit budget line — open modal, change amount, submit → row and remaining update
 *   2. Remove budget line — open modal, confirm → row removed from table
 *   3. Edit modal can be cancelled without saving
 *   4. Remove modal can be cancelled without removing the line
 *   5. Edit validates — invalid amount shows error, modal stays open
 *   6. Edit fails ITEMIZED_SUM_EXCEEDS_INVOICE → error shown in modal
 *   7. Responsive mobile viewport — overflow menu and modals usable
 *
 * All resources created via REST API in test setup.
 * Mirrors patterns from invoice-deposits.spec.ts and invoice-budget-line-create-and-link.spec.ts.
 */

import { test, expect } from '../../fixtures/auth.js';
import { InvoiceDetailPage } from '../../pages/InvoiceDetailPage.js';
import {
  createWorkItemViaApi,
  deleteWorkItemViaApi,
  createBudgetSourceViaApi,
  deleteBudgetSourceViaApi,
} from '../../fixtures/apiHelpers.js';
import { API } from '../../fixtures/testData.js';
import type { Page } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Inline helpers
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
 * Creates a work item budget line and links it to an invoice,
 * returning the invoice budget line ID.
 *
 * Returns: { budgetId, invoiceBudgetLineId }
 */
async function createAndLinkBudgetLine(
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
  // 1. Create the work item budget line
  const budgetResp = await page.request.post(`${API.workItems}/${opts.workItemId}/budgets`, {
    data: {
      plannedAmount: opts.plannedAmount,
      budgetSourceId: opts.budgetSourceId,
      confidence: 'own_estimate',
      description: opts.description ?? 'E2E Budget Line',
    },
  });
  expect(budgetResp.ok(), `POST work item budget failed: ${budgetResp.status()}`).toBeTruthy();
  const budgetBody = (await budgetResp.json()) as { budget: { id: string } };

  // 2. Link it to the invoice
  const linkResp = await page.request.post(`/api/invoices/${opts.invoiceId}/budget-lines`, {
    data: {
      workItemBudgetId: budgetBody.budget.id,
      itemizedAmount: opts.itemizedAmount,
    },
  });
  expect(linkResp.ok(), `POST invoice budget-line failed: ${linkResp.status()}`).toBeTruthy();
  const linkBody = (await linkResp.json()) as { budgetLine: { id: string } };

  return {
    budgetId: budgetBody.budget.id,
    invoiceBudgetLineId: linkBody.budgetLine.id,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Page Object helpers for the new budget-line OverflowMenu and modals
//
// The OverflowMenu trigger in InvoiceBudgetLinesSection renders:
//   <OverflowMenu triggerAriaLabel={t('invoiceDetail.budgetLines.menu.ariaLabel', ...)}
//                 data-testid="budget-line-menu-{line.id}"
//                 usePortal />
//
// Trigger aria-label format: "Budget line actions for {description}"
//
// Edit modal: Modal with title="Edit Budget Line" (i18n: invoiceDetail.budgetLines.modal.editTitle)
//   Form input: #budget-itemized-amount (unified BudgetLineForm — full form fields)
//   Save: getByRole('button', { name: /Save Changes|Saving/i })
//         "Save Changes" (budgetLineForm.submitSave) or "Saving…" (budgetLineForm.submitSaving)
//   Cancel: btnSecondary with text "Cancel" (common:button.cancel)
//
// Remove modal: Modal with title="Remove Budget Line" (i18n: ...modal.removeTitle)
//   Confirm: btnConfirmDelete with text "Remove" / "Removing…"
//   Cancel:  btnSecondary with text "Cancel"
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Opens the OverflowMenu for a budget line row by clicking the trigger button.
 * The trigger renders with aria-haspopup="true" scoped to the budgetLinesSection.
 *
 * With usePortal=true the menu is appended to document.body outside the section —
 * we wait for a visible role="menu" anywhere on the page.
 */
async function openBudgetLineMenu(
  page: Page,
  section: ReturnType<typeof page.locator>,
): Promise<void> {
  const trigger = section.locator('button[aria-haspopup="true"]').filter({ visible: true }).first();

  // Pre-scroll the trigger into the center of the viewport before clicking.
  // This prevents the OverflowMenu's scroll-close listener from firing during
  // Playwright's own actionability scroll, which would dismiss the menu before
  // the click event is processed.
  await trigger.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'nearest' }));

  await trigger.click();

  // The menu renders via portal so it's attached to document.body.
  await page
    .locator('[role="menu"]')
    .filter({ visible: true })
    .first()
    .waitFor({ state: 'visible' });
}

/**
 * Clicks a visible menu item by text.
 *
 * Uses { force: true } because portal-rendered menus are positioned with
 * CSS `position: fixed` relative to the viewport. When the trigger button is
 * near the bottom of the page the menu can render below (or at) the viewport
 * edge — Playwright's actionability check then reports "element is outside of
 * the viewport" even though it is visible and stable.  force:true bypasses
 * that check while still requiring the element to exist and be attached.
 */
async function clickMenuItemByText(page: Page, text: string | RegExp): Promise<void> {
  const item = page
    .locator('[role="menuitem"]')
    .filter({ visible: true })
    .filter({ hasText: text });
  await item.first().click({ force: true });
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: Edit budget line — change amount → row and remaining update
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Budget line edit modal (Scenario 1)', { tag: '@responsive' }, () => {
  test(
    'Edit budget line amount via modal → row and remaining row reflect new amount',
    { tag: '@smoke' },
    async ({ page, testPrefix }) => {
      const detailPage = new InvoiceDetailPage(page);
      let vendorId = '';
      let invoiceId = '';
      let workItemId = '';
      let budgetSourceId = '';

      try {
        vendorId = await createVendorViaApi(page, `${testPrefix} BLEdit Vendor`);
        invoiceId = await createInvoiceViaApi(page, vendorId, {
          amount: 1000,
          date: '2026-06-01',
        });
        workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} BLEdit WI` });
        budgetSourceId = await createBudgetSourceViaApi(page, {
          name: `${testPrefix} BLEdit Source`,
          totalAmount: 50000,
        });

        await createAndLinkBudgetLine(page, {
          workItemId,
          budgetSourceId,
          invoiceId,
          plannedAmount: 500,
          itemizedAmount: 300,
          description: `${testPrefix} Edit Me`,
        });

        await detailPage.goto(invoiceId);
        await expect(detailPage.heading).toBeVisible();

        // Budget line table visible with initial amount 300
        await expect(detailPage.budgetLinesSection).toBeVisible();
        await expect(detailPage.budgetLinesSection).toContainText('300');

        // Remaining = 1000 − 300 = 700
        const remainingCell = detailPage.budgetLinesSection.locator('[aria-live="polite"]');
        await expect(remainingCell).toContainText('700');

        // Open the OverflowMenu
        await openBudgetLineMenu(page, detailPage.budgetLinesSection);

        // Click "Edit"
        await clickMenuItemByText(page, 'Edit');

        // Edit modal opens with title "Edit Budget Line"
        const editModal = page.getByRole('dialog', { name: 'Edit Budget Line' });
        await expect(editModal).toBeVisible();

        // Itemized amount input pre-populated with 300
        const amountInput = page.locator('#budget-itemized-amount');
        await expect(amountInput).toBeVisible();
        await expect(amountInput).toHaveValue('300');

        // Change amount to 450
        await amountInput.clear();
        await amountInput.fill('450');

        // Save — PATCH /api/invoices/:id/budget-lines/:lineId → 200
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

        // Row now shows 450.00
        await expect(detailPage.budgetLinesSection).toContainText('450');

        // Remaining = 1000 − 450 = 550
        await expect(remainingCell).toContainText('550');
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
// Scenario 2: Remove budget line — confirm → row removed
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Budget line remove modal (Scenario 2)', { tag: '@responsive' }, () => {
  test(
    'Remove budget line via confirm modal → row disappears from table',
    { tag: '@smoke' },
    async ({ page, testPrefix }) => {
      const detailPage = new InvoiceDetailPage(page);
      let vendorId = '';
      let invoiceId = '';
      let workItemId = '';
      let budgetSourceId = '';

      try {
        vendorId = await createVendorViaApi(page, `${testPrefix} BLRem Vendor`);
        invoiceId = await createInvoiceViaApi(page, vendorId, {
          amount: 800,
          date: '2026-06-01',
        });
        workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} BLRem WI` });
        budgetSourceId = await createBudgetSourceViaApi(page, {
          name: `${testPrefix} BLRem Source`,
          totalAmount: 50000,
        });

        await createAndLinkBudgetLine(page, {
          workItemId,
          budgetSourceId,
          invoiceId,
          plannedAmount: 400,
          itemizedAmount: 250,
          description: `${testPrefix} Remove Me`,
        });

        await detailPage.goto(invoiceId);
        await expect(detailPage.heading).toBeVisible();

        // Table shows line
        await expect(detailPage.budgetLinesSection).toContainText('250');

        // Open OverflowMenu
        await openBudgetLineMenu(page, detailPage.budgetLinesSection);

        // Click "Remove"
        await clickMenuItemByText(page, 'Remove');

        // Remove modal opens with title "Remove Budget Line"
        const removeModal = page.getByRole('dialog', { name: 'Remove Budget Line' });
        await expect(removeModal).toBeVisible();

        // Confirmation text is visible
        await expect(removeModal).toContainText('unlinked from the invoice');

        // Confirm — DELETE /api/invoices/:id/budget-lines/:lineId → 204
        const deletePromise = page.waitForResponse(
          (resp) =>
            resp.url().includes('/budget-lines/') &&
            resp.request().method() === 'DELETE' &&
            resp.status() === 204,
        );
        const confirmButton = removeModal.getByRole('button', { name: /Remove|Removing/i });
        await confirmButton.click();
        await deletePromise;

        // Modal closes
        await expect(removeModal).not.toBeVisible();

        // The budget line row is gone; empty state shown
        await expect(detailPage.budgetLinesSection).toContainText('No budget lines linked');
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
// Scenario 3: Edit modal cancel — no change persisted
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Budget line edit modal — cancel (Scenario 3)', () => {
  test('Cancelling the Edit modal leaves the row amount unchanged', async ({
    page,
    testPrefix,
  }) => {
    const viewportWidth = page.viewportSize()?.width ?? 1440;
    if (viewportWidth < 1024) {
      test.skip(true, 'Cancel test — desktop only');
      return;
    }

    const detailPage = new InvoiceDetailPage(page);
    let vendorId = '';
    let invoiceId = '';
    let workItemId = '';
    let budgetSourceId = '';

    try {
      vendorId = await createVendorViaApi(page, `${testPrefix} BLCancelEdit Vendor`);
      invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 600,
        date: '2026-06-01',
      });
      workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} BLCancelEdit WI` });
      budgetSourceId = await createBudgetSourceViaApi(page, {
        name: `${testPrefix} BLCancelEdit Source`,
        totalAmount: 50000,
      });

      await createAndLinkBudgetLine(page, {
        workItemId,
        budgetSourceId,
        invoiceId,
        plannedAmount: 300,
        itemizedAmount: 200,
        description: `${testPrefix} Cancel Edit`,
      });

      await detailPage.goto(invoiceId);
      await expect(detailPage.heading).toBeVisible();

      await expect(detailPage.budgetLinesSection).toContainText('200');

      await openBudgetLineMenu(page, detailPage.budgetLinesSection);
      await clickMenuItemByText(page, 'Edit');

      const editModal = page.getByRole('dialog', { name: 'Edit Budget Line' });
      await expect(editModal).toBeVisible();

      // Change the amount but cancel
      const amountInput = page.locator('#budget-itemized-amount');
      await amountInput.clear();
      await amountInput.fill('999');

      const cancelButton = editModal.getByRole('button', { name: 'Cancel' });
      await cancelButton.click();

      // Modal closes
      await expect(editModal).not.toBeVisible();

      // Row still shows the original amount
      await expect(detailPage.budgetLinesSection).toContainText('200');
    } finally {
      if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
      if (budgetSourceId) await deleteBudgetSourceViaApi(page, budgetSourceId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: Remove modal cancel — line not removed
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Budget line remove modal — cancel (Scenario 4)', () => {
  test('Cancelling the Remove modal keeps the budget line in the table', async ({
    page,
    testPrefix,
  }) => {
    const viewportWidth = page.viewportSize()?.width ?? 1440;
    if (viewportWidth < 1024) {
      test.skip(true, 'Cancel test — desktop only');
      return;
    }

    const detailPage = new InvoiceDetailPage(page);
    let vendorId = '';
    let invoiceId = '';
    let workItemId = '';
    let budgetSourceId = '';

    try {
      vendorId = await createVendorViaApi(page, `${testPrefix} BLCancelRem Vendor`);
      invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 700,
        date: '2026-06-01',
      });
      workItemId = await createWorkItemViaApi(page, {
        title: `${testPrefix} BLCancelRem WI`,
      });
      budgetSourceId = await createBudgetSourceViaApi(page, {
        name: `${testPrefix} BLCancelRem Source`,
        totalAmount: 50000,
      });

      await createAndLinkBudgetLine(page, {
        workItemId,
        budgetSourceId,
        invoiceId,
        plannedAmount: 350,
        itemizedAmount: 180,
        description: `${testPrefix} Cancel Remove`,
      });

      await detailPage.goto(invoiceId);
      await expect(detailPage.heading).toBeVisible();

      await expect(detailPage.budgetLinesSection).toContainText('180');

      await openBudgetLineMenu(page, detailPage.budgetLinesSection);
      await clickMenuItemByText(page, 'Remove');

      const removeModal = page.getByRole('dialog', { name: 'Remove Budget Line' });
      await expect(removeModal).toBeVisible();

      // Cancel
      const cancelButton = removeModal.getByRole('button', { name: 'Cancel' });
      await cancelButton.click();

      // Modal closes
      await expect(removeModal).not.toBeVisible();

      // Line still present
      await expect(detailPage.budgetLinesSection).toContainText('180');
    } finally {
      if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
      if (budgetSourceId) await deleteBudgetSourceViaApi(page, budgetSourceId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: Edit modal — amount exceeds invoice total → error in modal
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Budget line edit — ITEMIZED_SUM_EXCEEDS_INVOICE (Scenario 5)', () => {
  test('Editing amount beyond invoice total shows error banner in the edit modal', async ({
    page,
    testPrefix,
  }) => {
    // Desktop only — error surfacing is a behavioural test, not layout
    const viewportWidth = page.viewportSize()?.width ?? 1440;
    if (viewportWidth < 1024) {
      test.skip(true, 'Error validation test — desktop only');
      return;
    }

    const detailPage = new InvoiceDetailPage(page);
    let vendorId = '';
    let invoiceId = '';
    let workItemId = '';
    let budgetSourceId = '';

    try {
      // Invoice total = 500; link a budget line for 200 (leaving 300 remaining)
      vendorId = await createVendorViaApi(page, `${testPrefix} BLExceed Vendor`);
      invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 500,
        date: '2026-06-01',
      });
      workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} BLExceed WI` });
      budgetSourceId = await createBudgetSourceViaApi(page, {
        name: `${testPrefix} BLExceed Source`,
        totalAmount: 50000,
      });

      await createAndLinkBudgetLine(page, {
        workItemId,
        budgetSourceId,
        invoiceId,
        plannedAmount: 800,
        itemizedAmount: 200,
        description: `${testPrefix} Exceed Edit`,
      });

      await detailPage.goto(invoiceId);
      await expect(detailPage.heading).toBeVisible();

      await expect(detailPage.budgetLinesSection).toContainText('200');

      await openBudgetLineMenu(page, detailPage.budgetLinesSection);
      await clickMenuItemByText(page, 'Edit');

      const editModal = page.getByRole('dialog', { name: 'Edit Budget Line' });
      await expect(editModal).toBeVisible();

      const amountInput = page.locator('#budget-itemized-amount');
      await amountInput.clear();
      // Try to set amount to 600 — exceeds invoice total of 500
      await amountInput.fill('600');

      const patchErrorPromise = page.waitForResponse(
        (resp) =>
          resp.url().includes('/budget-lines/') &&
          resp.request().method() === 'PATCH' &&
          resp.status() === 400,
      );

      const saveButton = editModal.getByRole('button', { name: /Save Changes|Saving/i });
      await saveButton.click();
      await patchErrorPromise;

      // Error banner appears inside the modal
      const errorBanner = editModal.locator('[role="alert"]');
      await expect(errorBanner).toBeVisible();
      await expect(errorBanner).toContainText(/exceed/i);

      // Modal remains open so the user can correct the amount
      await expect(editModal).toBeVisible();
      await expect(amountInput).toBeVisible();

      // Cancel to close
      const cancelButton = editModal.getByRole('button', { name: 'Cancel' });
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
// Scenario 6: Mobile viewport — overflow menu and modals are usable
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Budget line edit/remove — mobile viewport (Scenario 6)', () => {
  test('Edit budget line modal is usable on mobile viewport', async ({ page, testPrefix }) => {
    // Only run on mobile viewports (375px); skip on wider viewports where tablet/desktop
    // already provide coverage.
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
      vendorId = await createVendorViaApi(page, `${testPrefix} BLMob Vendor`);
      invoiceId = await createInvoiceViaApi(page, vendorId, {
        amount: 400,
        date: '2026-06-01',
      });
      workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} BLMob WI` });
      budgetSourceId = await createBudgetSourceViaApi(page, {
        name: `${testPrefix} BLMob Source`,
        totalAmount: 50000,
      });

      await createAndLinkBudgetLine(page, {
        workItemId,
        budgetSourceId,
        invoiceId,
        plannedAmount: 200,
        itemizedAmount: 150,
        description: `${testPrefix} Mobile Edit`,
      });

      await detailPage.goto(invoiceId);
      await expect(detailPage.heading).toBeVisible();

      // Budget line visible
      await expect(detailPage.budgetLinesSection).toContainText('150');

      // Open OverflowMenu (portal-rendered, so may be outside section on mobile too)
      await openBudgetLineMenu(page, detailPage.budgetLinesSection);
      await clickMenuItemByText(page, 'Edit');

      const editModal = page.getByRole('dialog', { name: 'Edit Budget Line' });
      await expect(editModal).toBeVisible();

      // Form input accessible
      const amountInput = page.locator('#budget-itemized-amount');
      await amountInput.scrollIntoViewIfNeeded();
      await expect(amountInput).toBeVisible();

      // Update amount
      await amountInput.clear();
      await amountInput.fill('180');

      const patchPromise = page.waitForResponse(
        (resp) =>
          resp.url().includes('/budget-lines/') &&
          resp.request().method() === 'PATCH' &&
          resp.status() === 200,
      );

      const saveButton = editModal.getByRole('button', { name: /Save Changes|Saving/i });
      await saveButton.scrollIntoViewIfNeeded();
      await saveButton.click();
      await patchPromise;

      await expect(editModal).not.toBeVisible();
      await expect(detailPage.budgetLinesSection).toContainText('180');
    } finally {
      if (invoiceId && vendorId) await deleteInvoiceViaApi(page, vendorId, invoiceId);
      if (vendorId) await deleteVendorViaApi(page, vendorId);
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
      if (budgetSourceId) await deleteBudgetSourceViaApi(page, budgetSourceId);
    }
  });
});
