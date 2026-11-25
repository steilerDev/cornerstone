/**
 * E2E tests for the confirmation sweep (Story #2257, EPIC-21 P5.11).
 *
 * One confirmation grammar: every record delete is the same dialog (DeleteConfirmDialog on the
 * ConfirmDialog), titled "Delete <name>?" with the server's delete-impact counts, identical from
 * a list row and from the record's own page. Delete / Backspace on a list row deletes nothing.
 * The photo viewer is a Modal dialog and the DataTable popovers are anchored panels.
 *
 * Scenarios:
 *   1. Task: list row Delete and Task page Delete show the same name and counts (@responsive)
 *   2. Purchase: list vs page parity
 *   3. Milestone: list vs page parity
 *   4. Company: list vs page parity
 *   5. Invoice: Company page Payments row vs Invoice page parity, then the server agrees (204,
 *      the cost line stays and is unlinked)
 *   6. Grant and funding source pages: the title names the record
 *   7. Delete / Backspace on a focused list row deletes nothing (tasks, purchases, diary photo)
 *   8. Photo viewer is a dialog named "Photo viewer"; Escape closes it and returns focus;
 *      Escape in the Delete photo confirmation closes only the confirmation (@responsive)
 *   9. DataTable popovers (Users): filter and column settings are dialogs; Escape returns focus
 *
 * All data is synthetic and named with the `testPrefix` fixture; records are removed in `finally`.
 */

import { test, expect } from '../../fixtures/auth.js';
import type { Page } from '@playwright/test';
import { API } from '../../fixtures/testData.js';
import {
  createVendorViaApi,
  deleteVendorViaApi,
  createWorkItemViaApi,
  deleteWorkItemViaApi,
  createHouseholdItemViaApi,
  deleteHouseholdItemViaApi,
  createMilestoneViaApi,
  deleteMilestoneViaApi,
  createDiaryEntryViaApi,
  deleteDiaryEntryViaApi,
  uploadDiaryPhotoViaApi,
  deletePhotoViaApi,
} from '../../fixtures/apiHelpers.js';
import {
  newCleanup,
  runCleanup,
  createVendor,
  createInvoice,
  createTask,
  createFundingSource,
  createCostLine,
  linkCostLine,
} from '../../fixtures/costLineSeed.js';
import { createGrant, createSource } from '../../fixtures/financingSeed.js';
import { ConfirmDialogControl } from '../../pages/components/ConfirmDialogControl.js';
import { WorkItemsPage } from '../../pages/WorkItemsPage.js';
import { WorkItemDetailPage } from '../../pages/WorkItemDetailPage.js';
import { HouseholdItemsPage } from '../../pages/HouseholdItemsPage.js';
import { HouseholdItemDetailPage } from '../../pages/HouseholdItemDetailPage.js';
import { MilestonesPage } from '../../pages/MilestonesPage.js';
import { MilestoneDetailPage } from '../../pages/MilestoneDetailPage.js';
import { VendorsPage } from '../../pages/VendorsPage.js';
import { VendorDetailPage } from '../../pages/VendorDetailPage.js';
import { InvoiceDetailPage } from '../../pages/InvoiceDetailPage.js';
import { GrantPage } from '../../pages/GrantPage.js';
import { FundingSourcePage } from '../../pages/FundingSourcePage.js';
import { DiaryEntryDetailPage } from '../../pages/DiaryEntryDetailPage.js';
import { PhotoViewerPage } from '../../pages/PhotoViewerPage.js';
import { UserManagementPage } from '../../pages/UserManagementPage.js';

interface DialogReading {
  /** The dialog title (the "Delete <name>?" question). */
  readonly name: string;
  /** The consequence rows, whitespace-normalised. */
  readonly items: string[];
}

/** Wait for the dialog and its counts, then read the title and the consequence rows. */
async function readDialog(dialog: ConfirmDialogControl): Promise<DialogReading> {
  await dialog.waitForOpen();
  // The counts are loaded once the list renders and the action is enabled again
  await expect(dialog.consequencesList).toBeVisible();
  await expect(dialog.confirmButton).not.toHaveAttribute('aria-disabled', 'true');
  const name = await dialog.dialog.evaluate((el) => {
    const id = el.getAttribute('aria-labelledby');
    return (id ? document.getElementById(id)?.textContent : null)?.trim() ?? '';
  });
  const items = (await dialog.consequencesList.getByRole('listitem').allTextContents()).map((s) =>
    s.replace(/\s+/g, ' ').trim(),
  );
  return { name, items };
}

/** Let the page run two animation frames so a key handler would have acted (no sleeps). */
async function flushFrames(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

/** Record every DELETE request the page sends from now on. */
function recordDeletes(page: Page): string[] {
  const urls: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'DELETE') urls.push(request.url());
  });
  return urls;
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenarios 1-5: the same dialog from the list and from the page (AC1)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Delete confirmation — list and page agree', { tag: '@responsive' }, () => {
  test('Task: the list row and the Task page show the same name and counts', async ({
    page,
    testPrefix,
  }) => {
    const title = `${testPrefix} Sample Task Parity`;
    const cleanup = newCleanup();
    try {
      const taskId = await createTask(page, cleanup, title);
      const note = await page.request.post(`${API.workItems}/${taskId}/notes`, {
        data: { content: 'Synthetic note' },
      });
      expect(note.ok(), 'POST note').toBeTruthy();
      const subtask = await page.request.post(`${API.workItems}/${taskId}/subtasks`, {
        data: { title: 'Synthetic subtask', position: 0 },
      });
      expect(subtask.ok(), 'POST subtask').toBeTruthy();

      const list = new WorkItemsPage(page);
      await list.goto();
      await list.waitForLoaded();
      await list.search(title);
      await list.openDeleteModal(title);
      const fromList = await readDialog(
        new ConfirmDialogControl(page, 'work-item-list-delete', `Delete ${title}?`),
      );
      expect(fromList.name).toBe(`Delete ${title}?`);
      expect(fromList.items.length).toBeGreaterThanOrEqual(2);
      await list.deleteCancelButton.click();
      await list.deleteModal.waitFor({ state: 'hidden' });

      const detail = new WorkItemDetailPage(page);
      await detail.goto(taskId);
      await detail.openDeleteModal();
      const fromPage = await readDialog(detail.deleteDialog);
      await detail.cancelDelete();

      expect(fromPage.name).toBe(fromList.name);
      expect(fromPage.items).toEqual(fromList.items);
    } finally {
      await runCleanup(cleanup);
    }
  });

  test('Purchase: the list row and the Purchase page show the same name and counts', async ({
    page,
    testPrefix,
  }) => {
    const name = `${testPrefix} Sample Purchase Parity`;
    const cleanup = newCleanup();
    try {
      // Source first: cleanup runs newest first, so the purchase (and its line) goes before it
      const sourceId = await createFundingSource(page, cleanup, `${testPrefix} Sample Fund`);
      const purchaseId = await createHouseholdItemViaApi(page, { name });
      cleanup.fns.push(() => deleteHouseholdItemViaApi(page, purchaseId));
      await createCostLine(page, {
        kind: 'household_item',
        hostId: purchaseId,
        budgetSourceId: sourceId,
        description: 'Synthetic cost line',
        plannedAmount: 100,
      });

      const list = new HouseholdItemsPage(page);
      await list.search(name);
      await expect(list.itemRow(name)).toHaveCount(1);
      await list.openDeleteModal(name);
      const fromList = await readDialog(
        new ConfirmDialogControl(page, 'purchase-list-delete', `Delete ${name}?`),
      );
      expect(fromList.name).toBe(`Delete ${name}?`);
      expect(fromList.items.length).toBeGreaterThanOrEqual(1);
      await list.deleteCancelButton.click();
      await list.deleteModal.waitFor({ state: 'hidden' });

      const detail = new HouseholdItemDetailPage(page);
      await detail.goto(purchaseId);
      await detail.openDeleteModal();
      const fromPage = await readDialog(detail.deleteDialog);
      await detail.deleteDialog.cancel();

      expect(fromPage.name).toBe(fromList.name);
      expect(fromPage.items).toEqual(fromList.items);
    } finally {
      await runCleanup(cleanup);
    }
  });

  test('Milestone: the list row and the Milestone page show the same name and counts', async ({
    page,
    testPrefix,
  }) => {
    const title = `${testPrefix} Sample Milestone Parity`;
    const milestoneId = await createMilestoneViaApi(page, { title, targetDate: '2027-06-01' });
    const taskId = await createWorkItemViaApi(page, { title: `${testPrefix} Sample Linked Task` });
    try {
      const linked = await page.request.post(`${API.milestones}/${milestoneId}/work-items`, {
        data: { workItemId: taskId },
      });
      expect(linked.ok(), `POST milestone work item: ${linked.status()}`).toBeTruthy();

      const list = new MilestonesPage(page);
      await list.goto();
      await list.waitForLoaded();
      await list.search(title);
      await list.openDeleteModal(title);
      const fromList = await readDialog(
        new ConfirmDialogControl(page, 'milestone-list-delete', `Delete ${title}?`),
      );
      expect(fromList.name).toBe(`Delete ${title}?`);
      expect(fromList.items.length).toBeGreaterThanOrEqual(1);
      await list.deleteCancelButton.click();
      await list.deleteModal.waitFor({ state: 'hidden' });

      const detail = new MilestoneDetailPage(page);
      await detail.goto(milestoneId);
      await detail.openDeleteModal();
      const fromPage = await readDialog(detail.deleteDialog);
      await detail.cancelDelete();

      expect(fromPage.name).toBe(fromList.name);
      expect(fromPage.items).toEqual(fromList.items);
    } finally {
      await deleteMilestoneViaApi(page, milestoneId);
      await deleteWorkItemViaApi(page, taskId);
    }
  });

  test('Company: the list row and the Company page show the same name and counts', async ({
    page,
    testPrefix,
  }) => {
    const name = `${testPrefix} Sample Roofing Parity Ltd`;
    const vendorId = await createVendorViaApi(page, { name });
    try {
      for (const [firstName, lastName] of [
        ['Jane', 'Doe'],
        ['John', 'Roe'],
      ] as const) {
        const resp = await page.request.post(`${API.vendors}/${vendorId}/contacts`, {
          data: { firstName, lastName },
        });
        expect(resp.ok(), 'POST contact').toBeTruthy();
      }

      const list = new VendorsPage(page);
      await list.goto();
      await list.search(name);
      await list.openDeleteModal(name);
      const fromList = await readDialog(
        new ConfirmDialogControl(page, 'company-list-delete', `Delete ${name}?`),
      );
      expect(fromList.name).toBe(`Delete ${name}?`);
      expect(fromList.items.join(' ')).toContain('2');
      await list.cancelDelete();

      const detail = new VendorDetailPage(page);
      await detail.goto(vendorId);
      await detail.openDeleteModal();
      const fromPage = await readDialog(detail.deleteDialog);
      await detail.cancelDelete();

      expect(fromPage.name).toBe(fromList.name);
      expect(fromPage.items).toEqual(fromList.items);
    } finally {
      await deleteVendorViaApi(page, vendorId);
    }
  });

  test('Invoice: the Payments row and the Invoice page agree, and the server agrees with the counts', async ({
    page,
    testPrefix,
  }) => {
    const company = `${testPrefix} Sample Roofing Ltd`;
    const invoiceNumber = 'SAMPLE-0042';
    const cleanup = newCleanup();
    try {
      const sourceId = await createFundingSource(page, cleanup, `${testPrefix} Sample Fund`);
      const taskId = await createTask(page, cleanup, `${testPrefix} Sample Invoiced Task`);
      const vendorId = await createVendor(page, cleanup, company);
      const invoice = await createInvoice(page, cleanup, vendorId, {
        amount: 1000,
        invoiceNumber,
        status: 'pending',
      });
      const lineId = await createCostLine(page, {
        kind: 'work_item',
        hostId: taskId,
        budgetSourceId: sourceId,
        description: 'Synthetic cost line',
        plannedAmount: 1000,
      });
      await linkCostLine(page, invoice.id, 'work_item', lineId, 1000);

      const expectedName = `Delete ${company} · ${invoiceNumber}?`;

      const companyPage = new VendorDetailPage(page);
      await companyPage.goto(vendorId, 'payments');
      await companyPage.waitForPaymentsLoaded();
      await companyPage.openRecordDelete(invoice.id);
      const fromRow = await readDialog(companyPage.invoiceDeleteDialog);
      expect(fromRow.name).toBe(expectedName);
      expect(fromRow.items.length).toBeGreaterThanOrEqual(1);
      await companyPage.invoiceDeleteDialog.cancel();

      const invoicePage = new InvoiceDetailPage(page);
      await invoicePage.goto(invoice.id);
      await invoicePage.openDeleteModal();
      const fromPage = await readDialog(invoicePage.deleteDialog);
      expect(fromPage.name).toBe(expectedName);
      expect(fromPage.items).toEqual(fromRow.items);

      // The server does what the counts said: 204, the cost line stays and is unlinked
      await invoicePage.confirmDelete();
      const budgets = await page.request.get(`${API.workItems}/${taskId}/budgets`);
      expect(budgets.ok(), 'GET task cost lines').toBeTruthy();
      const body = (await budgets.json()) as { budgets: { id: string; invoiceCount: number }[] };
      const line = body.budgets.find((b) => b.id === lineId);
      expect(line, 'the cost line survives the invoice delete').toBeTruthy();
      expect(line?.invoiceCount).toBe(0);
    } finally {
      await runCleanup(cleanup);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6: grant and funding source titles name the record
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Delete confirmation — grant and funding source', { tag: '@responsive' }, () => {
  test('The Grant page and the Funding source page title the dialog with the record name', async ({
    page,
    testPrefix,
  }) => {
    const grantName = `${testPrefix} Sample Energy Grant`;
    const sourceName = `${testPrefix} Sample Bank Loan`;
    const cleanup = newCleanup();
    try {
      const grantId = await createGrant(page, cleanup, { name: grantName, reductionValue: 10 });
      const sourceId = await createSource(page, cleanup, { name: sourceName, totalAmount: 10000 });

      const grant = new GrantPage(page);
      await grant.goto(grantId);
      await grant.openDelete();
      await expect(grant.deleteDialog.dialog).toHaveAccessibleName(`Delete ${grantName}?`);
      await grant.deleteDialog.cancel();

      const source = new FundingSourcePage(page);
      await source.goto(sourceId);
      await source.openDelete();
      await expect(source.deleteDialog.dialog).toHaveAccessibleName(`Delete ${sourceName}?`);
      await source.deleteDialog.cancel();
    } finally {
      await runCleanup(cleanup);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 7: Delete / Backspace on a list row deletes nothing (AC4)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Delete key — deletes nothing', { tag: '@responsive' }, () => {
  test('Tasks list: Delete and Backspace on a focused row do nothing', async ({
    page,
    testPrefix,
  }) => {
    const title = `${testPrefix} Sample Key Task`;
    const taskId = await createWorkItemViaApi(page, { title });
    try {
      const list = new WorkItemsPage(page);
      await list.goto();
      await list.waitForLoaded();
      await list.search(title);
      const id = await list.idOf(title);
      const deletes = recordDeletes(page);

      await list.title(id).focus();
      await page.keyboard.press('Delete');
      await page.keyboard.press('Backspace');
      await flushFrames(page);

      expect(deletes).toEqual([]);
      await expect(page.getByRole('alertdialog')).toHaveCount(0);
      expect((await page.request.get(`${API.workItems}/${taskId}`)).status()).toBe(200);
    } finally {
      await deleteWorkItemViaApi(page, taskId);
    }
  });

  test('Purchases list: Delete and Backspace on a focused row do nothing', async ({
    page,
    testPrefix,
  }) => {
    const name = `${testPrefix} Sample Key Purchase`;
    const purchaseId = await createHouseholdItemViaApi(page, { name });
    try {
      const list = new HouseholdItemsPage(page);
      await list.search(name);
      await expect(list.itemRow(name)).toHaveCount(1);
      const id = await list.idOf(name);
      const deletes = recordDeletes(page);

      await list.olist.titleLink(id).focus();
      await page.keyboard.press('Delete');
      await page.keyboard.press('Backspace');
      await flushFrames(page);

      expect(deletes).toEqual([]);
      await expect(page.getByRole('alertdialog')).toHaveCount(0);
      expect((await page.request.get(`${API.householdItems}/${purchaseId}`)).status()).toBe(200);
    } finally {
      await deleteHouseholdItemViaApi(page, purchaseId);
    }
  });

  test('Diary entry page: Delete on a focused photo card does nothing', async ({
    page,
    testPrefix,
  }) => {
    const entryId = await createDiaryEntryViaApi(page, {
      entryType: 'general_note',
      entryDate: '2026-06-01',
      body: 'Synthetic note',
      title: `${testPrefix} Sample Key Entry`,
    });
    let photoId: string | null = null;
    try {
      photoId = await uploadDiaryPhotoViaApi(page, entryId);
      const entry = new DiaryEntryDetailPage(page);
      await entry.goto(entryId);
      const card = page.getByTestId(`photo-card-${photoId}`);
      await expect(card).toBeVisible();
      const deletes = recordDeletes(page);

      await card.focus();
      await page.keyboard.press('Delete');
      await flushFrames(page);

      expect(deletes).toEqual([]);
      await expect(page.getByRole('alertdialog')).toHaveCount(0);
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(card).toBeVisible();
    } finally {
      if (photoId) await deletePhotoViaApi(page, photoId);
      await deleteDiaryEntryViaApi(page, entryId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 8: the photo viewer is a Modal dialog
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Photo viewer — Modal dialog', { tag: '@responsive' }, () => {
  test('Opens as a dialog named "Photo viewer"; Escape closes it and returns focus to the photo', async ({
    page,
    testPrefix,
  }) => {
    const entryId = await createDiaryEntryViaApi(page, {
      entryType: 'general_note',
      entryDate: '2026-06-01',
      body: 'Synthetic note',
      title: `${testPrefix} Sample Viewer Entry`,
    });
    let photoId: string | null = null;
    try {
      photoId = await uploadDiaryPhotoViaApi(page, entryId);
      const entry = new DiaryEntryDetailPage(page);
      await entry.goto(entryId);
      const viewer = new PhotoViewerPage(page);
      const viewButton = page
        .getByTestId(`photo-card-${photoId}`)
        .getByRole('button', { name: /View photo/ });

      // Open with the keyboard so the opener is a focused element on every browser engine
      await viewButton.focus();
      await page.keyboard.press('Enter');
      await expect(viewer.dialog).toBeVisible();
      await expect(viewer.modal).toBeVisible();

      // Escape (Modal's focus trap) closes it and focus returns to the opener
      await page.keyboard.press('Escape');
      await expect(viewer.dialog).toBeHidden();
      await expect(viewButton).toBeFocused();

      // Open again: Escape inside the Delete photo confirmation closes only the confirmation
      await viewButton.focus();
      await page.keyboard.press('Enter');
      await expect(viewer.dialog).toBeVisible();
      await viewer.deleteButton.click();
      await viewer.deleteDialog.waitForOpen();
      await page.keyboard.press('Escape');
      await expect(viewer.deleteDialog.dialog).toBeHidden();
      await expect(viewer.dialog).toBeVisible();

      await viewer.closeButton.click();
      await expect(viewer.dialog).toBeHidden();
    } finally {
      if (photoId) await deletePhotoViaApi(page, photoId);
      await deleteDiaryEntryViaApi(page, entryId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 9: DataTable popovers are anchored panels (desktop and tablet: the table surface)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('DataTable popovers — anchored panels', () => {
  test.beforeEach(({ page }) => {
    // The phone shows cards: no column headers, no filter or column buttons
    if ((page.viewportSize()?.width ?? 1280) < 768) test.skip();
  });

  test('The Status filter opens a dialog; Escape closes it and focuses the filter button', async ({
    page,
  }) => {
    const users = new UserManagementPage(page);
    await users.goto();
    await expect(page.getByRole('table')).toBeVisible();
    await page.waitForLoadState('networkidle');

    const trigger = page.getByRole('button', { name: 'Filter by Status' });
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await trigger.click();

    const panel = page.getByRole('dialog', { name: 'Filter by Status' });
    await expect(panel).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');

    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  test('Column settings opens a dialog; a press outside closes it', async ({ page }) => {
    const users = new UserManagementPage(page);
    await users.goto();
    await expect(page.getByRole('table')).toBeVisible();
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /column settings/i }).click();
    const panel = page.getByRole('dialog', { name: /visible columns/i });
    await expect(panel).toBeVisible();

    await users.heading.click();
    await expect(panel).toBeHidden();
  });

  test('Clicking inside the filter panel does not sort the column', async ({ page }) => {
    const users = new UserManagementPage(page);
    await users.goto();
    await expect(page.getByRole('table')).toBeVisible();
    await page.waitForLoadState('networkidle');

    const statusHeader = page.locator('thead th').filter({ hasText: 'Status' });
    await page.getByRole('button', { name: 'Filter by Status' }).click();
    const panel = page.getByRole('dialog', { name: 'Filter by Status' });
    await expect(panel).toBeVisible();
    await panel.getByRole('checkbox').first().check();

    // The panel is portaled, yet its clicks must not reach the header cell's sort handler
    await expect(statusHeader).not.toHaveAttribute('aria-sort', /ascending|descending/);
    await expect(panel).toBeVisible();
  });
});
