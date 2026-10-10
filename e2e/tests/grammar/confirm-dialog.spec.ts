/**
 * E2E tests for the grammar foundations: ConfirmDialog (Story #2209).
 *
 * Every delete / remove / deactivate / restore / discard confirmation is the same dialog
 * (role "alertdialog", title "Delete <name>?", Cancel first and focused, Escape cancels).
 * Records that others reference list what else is affected, with counts from
 * GET /api/delete-impact; the numbers match what the server then really deletes.
 *
 * Scenarios:
 *   1. Company with 2 contact persons: counts, initial focus on Cancel, Escape returns focus
 *   2. Area with a sub-area: count, confirm deletes both
 *   2b. After a confirmed area delete focus is not on the body
 *   3. Contact person delete asks via the dialog (no native confirm)
 *      (the DAV revoke dialog is covered in tests/profile/dav-access.spec.ts, Scenario 6b)
 *   4. Area in use: 409 shows inside the dialog and the Delete action is hidden
 *   5. Diary draft discard: "Discard this entry?" with Keep entry / Discard
 *   6. Tasks list row Delete shows subtask, note and cost line counts; Cancel keeps focus
 *   7. Purchase cost line Delete opens exactly one dialog (no inline swap)
 */

import { test, expect } from '../../fixtures/auth.js';
import type { Page } from '@playwright/test';
import { routeUrl } from '../../../shared/src/routes/index.js';
import { API } from '../../fixtures/testData.js';
import {
  createVendorViaApi,
  deleteVendorViaApi,
  createAreaViaApi,
  deleteAreaViaApi,
  createWorkItemViaApi,
  deleteWorkItemViaApi,
  createHouseholdItemViaApi,
  deleteHouseholdItemViaApi,
  createBudgetSourceViaApi,
  deleteBudgetSourceViaApi,
  createDraftDiaryEntryViaApi,
  deleteDiaryEntryViaApi,
} from '../../fixtures/apiHelpers.js';
import { ConfirmDialogControl } from '../../pages/components/ConfirmDialogControl.js';
import { VendorDetailPage } from '../../pages/VendorDetailPage.js';
import { WorkItemsPage } from '../../pages/WorkItemsPage.js';
import { HouseholdItemDetailPage } from '../../pages/HouseholdItemDetailPage.js';
import { DiaryEntryEditPage } from '../../pages/DiaryEntryEditPage.js';

const AREAS_TAB_URL = routeUrl('settingsManage', undefined, { tab: 'areas' });

async function expectFocusNotOnBody(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.activeElement !== null && document.activeElement !== document.body,
      ),
    )
    .toBe(true);
}

/** Open Project setup > Areas and click Delete on the row with this name. */
async function clickAreaDelete(page: Page, areaName: string): Promise<void> {
  await page.goto(AREAS_TAB_URL);
  await page
    .getByRole('heading', { level: 1, name: 'Project setup', exact: true })
    .waitFor({ state: 'visible' });
  const row = page
    .locator('#areas-panel')
    .locator('[class*="itemRow"]')
    .filter({ hasText: areaName });
  await row.getByRole('button', { name: 'Delete', exact: true }).click();
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: company with contact persons
// ─────────────────────────────────────────────────────────────────────────────

test.describe('ConfirmDialog — company delete with counts', { tag: '@responsive' }, () => {
  test('Lists the contact persons deleted with the company; Cancel is focused; Escape returns focus to Delete', async ({
    page,
    testPrefix,
  }) => {
    const name = `${testPrefix} Sample Roofing Ltd`;
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

      const detail = new VendorDetailPage(page);
      await detail.goto(vendorId);

      // Open with the keyboard so the opener is a focused element on every browser engine
      await detail.deleteButton.focus();
      await page.keyboard.press('Enter');

      const dialog = new ConfirmDialogControl(page, 'vendor-delete', `Delete ${name}?`);
      await dialog.waitForOpen();
      await expect(dialog.consequence(/Contact persons deleted with it/)).toContainText('2');
      await expect(dialog.dialog).toContainText("This can't be undone.");

      // Initial focus is on the safe action
      await expect(dialog.cancelButton).toBeFocused();

      // Escape cancels and focus returns to the control that opened the dialog
      await page.keyboard.press('Escape');
      await expect(dialog.dialog).toBeHidden();
      await expect(detail.deleteButton).toBeFocused();
    } finally {
      await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenarios 2, 2b, 4: areas
// ─────────────────────────────────────────────────────────────────────────────

test.describe('ConfirmDialog — area delete', { tag: '@responsive' }, () => {
  test('Shows the sub-area count and confirming deletes the area and its sub-area', async ({
    page,
    testPrefix,
  }) => {
    const parentName = `${testPrefix} Sample Cellar`;
    const childName = `${testPrefix} Sample Wine Rack`;
    const parentId = await createAreaViaApi(page, { name: parentName });
    const childId = await createAreaViaApi(page, { name: childName, parentId });

    try {
      await clickAreaDelete(page, parentName);

      const dialog = new ConfirmDialogControl(page, 'area-delete', `Delete ${parentName}?`);
      await dialog.waitForOpen();
      await expect(dialog.consequence(/Sub-areas deleted with it/)).toContainText('1');

      const deleted = page.waitForResponse(
        (resp) =>
          resp.url().includes(`${API.areas}/${parentId}`) && resp.request().method() === 'DELETE',
      );
      await dialog.confirm();
      expect((await deleted).status()).toBe(204);
      await expect(dialog.dialog).toBeHidden();

      // Both rows are gone and the server agrees
      expect((await page.request.get(`${API.areas}/${parentId}`)).status()).toBe(404);
      expect((await page.request.get(`${API.areas}/${childId}`)).status()).toBe(404);
    } finally {
      await deleteAreaViaApi(page, childId);
      await deleteAreaViaApi(page, parentId);
    }
  });

  test('After a confirmed delete the focus is not lost to the body', async ({
    page,
    testPrefix,
  }) => {
    const name = `${testPrefix} Sample Attic`;
    const areaId = await createAreaViaApi(page, { name });

    try {
      await clickAreaDelete(page, name);

      const dialog = new ConfirmDialogControl(page, 'area-delete', `Delete ${name}?`);
      await dialog.waitForOpen();
      await dialog.confirmAndWaitClosed();

      // The deleted row's Delete button is gone: focus must land on the section's fallback
      await expectFocusNotOnBody(page);
    } finally {
      await deleteAreaViaApi(page, areaId);
    }
  });

  test('An area in use shows the conflict inside the dialog and hides the Delete action', async ({
    page,
    testPrefix,
  }) => {
    const name = `${testPrefix} Sample Pantry`;
    const areaId = await createAreaViaApi(page, { name });
    const workItemId = await createWorkItemViaApi(page, {
      title: `${testPrefix} Sample Task In Pantry`,
      areaId,
    });

    try {
      await clickAreaDelete(page, name);

      const dialog = new ConfirmDialogControl(page, 'area-delete', `Delete ${name}?`);
      await dialog.waitForOpen();

      const deleted = page.waitForResponse(
        (resp) =>
          resp.url().includes(`${API.areas}/${areaId}`) && resp.request().method() === 'DELETE',
      );
      await dialog.confirm();
      expect((await deleted).status()).toBe(409);

      // The error is inside the dialog; the destructive action is gone, Cancel remains
      await expect(dialog.dialog.getByRole('alert')).toContainText(/cannot be deleted/i);
      await expect(dialog.confirmButton).toBeHidden();
      await expect(dialog.cancelButton).toBeVisible();

      await dialog.cancel();
      expect((await page.request.get(`${API.areas}/${areaId}`)).ok()).toBe(true);
    } finally {
      await deleteWorkItemViaApi(page, workItemId);
      await deleteAreaViaApi(page, areaId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: contact person delete (native confirm replaced)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('ConfirmDialog — contact person delete', { tag: '@responsive' }, () => {
  test('Deleting a contact asks in the dialog, not with a native confirm', async ({
    page,
    testPrefix,
  }) => {
    const vendorId = await createVendorViaApi(page, { name: `${testPrefix} Sample Plumbing Ltd` });
    const nativeDialogs: string[] = [];
    page.on('dialog', (native) => {
      nativeDialogs.push(native.message());
      void native.dismiss();
    });

    try {
      const created = await page.request.post(`${API.vendors}/${vendorId}/contacts`, {
        data: { firstName: 'Casey', lastName: 'Sample' },
      });
      expect(created.ok(), 'POST contact').toBeTruthy();

      const detail = new VendorDetailPage(page);
      await detail.goto(vendorId);
      await expect(detail.contactsList.getByText('Casey Sample')).toBeVisible();

      await detail.contactsList
        .locator('[class*="contactCard"]')
        .filter({ hasText: 'Casey Sample' })
        .getByRole('button', { name: 'Delete Contact' })
        .click();

      await detail.contactDeleteDialog.waitForOpen();
      await expect(detail.contactDeleteDialog.dialog).toContainText('Delete Casey Sample?');
      await expect(detail.contactDeleteDialog.cancelButton).toBeFocused();

      await detail.contactDeleteDialog.confirmAndWaitClosed();
      await expect(detail.contactsList.getByText('Casey Sample')).toHaveCount(0);
      expect(nativeDialogs).toEqual([]);
    } finally {
      await deleteVendorViaApi(page, vendorId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: diary draft discard
// ─────────────────────────────────────────────────────────────────────────────

test.describe('ConfirmDialog — discard wording', { tag: '@responsive' }, () => {
  test('Discarding a diary draft asks "Discard this entry?" with Keep entry and Discard', async ({
    page,
  }) => {
    const draftId = await createDraftDiaryEntryViaApi(page, { entryType: 'general_note' });

    try {
      const edit = new DiaryEntryEditPage(page);
      await edit.goto(draftId);
      await edit.openDiscardModal();

      await expect(edit.discardModal).toHaveAccessibleName('Discard this entry?');
      await expect(edit.discardModalCancel).toHaveText('Keep entry');
      await expect(edit.discardModalConfirm).toHaveText('Discard');
      await expect(edit.discardModalCancel).toBeFocused();

      await edit.discardModalCancel.click();
      await expect(edit.discardModal).toBeHidden();
      expect(page.url()).toContain(`/diary/${draftId}/edit`);
    } finally {
      await deleteDiaryEntryViaApi(page, draftId).catch(() => {});
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6: task delete with counts
// ─────────────────────────────────────────────────────────────────────────────

test.describe('ConfirmDialog — task delete with counts', { tag: '@responsive' }, () => {
  test('Tasks list row Delete lists subtasks, notes and cost lines; Cancel does not drop focus to the body', async ({
    page,
    testPrefix,
  }) => {
    const title = `${testPrefix} Sample Counted Task`;
    const workItemId = await createWorkItemViaApi(page, { title });
    const budgetSourceId = await createBudgetSourceViaApi(page, {
      name: `${testPrefix} Sample Fund`,
      totalAmount: 50000,
    });

    try {
      const note = await page.request.post(`${API.workItems}/${workItemId}/notes`, {
        data: { content: 'Synthetic note' },
      });
      expect(note.ok(), 'POST note').toBeTruthy();
      const subtask = await page.request.post(`${API.workItems}/${workItemId}/subtasks`, {
        data: { title: 'Synthetic subtask', position: 0 },
      });
      expect(subtask.ok(), 'POST subtask').toBeTruthy();
      const costLine = await page.request.post(`${API.workItems}/${workItemId}/budgets`, {
        data: {
          confidence: 'own_estimate',
          plannedAmount: 100,
          budgetSourceId,
          description: 'Synthetic cost line',
        },
      });
      expect(costLine.ok(), 'POST cost line').toBeTruthy();

      const list = new WorkItemsPage(page);
      await list.goto();
      await list.waitForLoaded();
      await list.search(title);
      await list.openDeleteModal(title);

      const dialog = new ConfirmDialogControl(page, 'work-item-list-delete', `Delete ${title}?`);
      await dialog.waitForOpen();
      await expect(dialog.consequence(/Subtasks deleted with it/)).toContainText('1');
      await expect(dialog.consequence(/Notes deleted with it/)).toContainText('1');
      await expect(dialog.consequence(/Cost lines deleted with it/)).toContainText('1');
      await expect(dialog.cancelButton).toBeFocused();

      await dialog.cancel();
      await expectFocusNotOnBody(page);

      // Nothing was deleted
      expect((await page.request.get(`${API.workItems}/${workItemId}`)).ok()).toBe(true);
    } finally {
      await deleteWorkItemViaApi(page, workItemId);
      await deleteBudgetSourceViaApi(page, budgetSourceId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 7: cost line delete is one dialog
// ─────────────────────────────────────────────────────────────────────────────

test.describe('ConfirmDialog — cost line delete', { tag: '@responsive' }, () => {
  test('Deleting a purchase cost line opens exactly one dialog and no inline confirm swap', async ({
    page,
    testPrefix,
  }) => {
    const description = `${testPrefix} Synthetic Cost Line`;
    const purchaseId = await createHouseholdItemViaApi(page, {
      name: `${testPrefix} Sample Cost Purchase`,
    });
    const budgetSourceId = await createBudgetSourceViaApi(page, {
      name: `${testPrefix} Sample Cost Fund`,
      totalAmount: 50000,
    });

    try {
      const line = await page.request.post(`/api/household-items/${purchaseId}/budgets`, {
        data: {
          confidence: 'own_estimate',
          plannedAmount: 250,
          budgetSourceId,
          description,
        },
      });
      expect(line.ok(), 'POST cost line').toBeTruthy();
      const lineBody = (await line.json()) as { budget: { id: string } };

      const detail = new HouseholdItemDetailPage(page);
      await detail.goto(purchaseId);
      await expect(detail.budgetSection).toContainText(description);

      const deleteButton = detail.budgetSection.getByRole('button', {
        name: new RegExp(`^Delete budget line: ${description}$`),
      });
      await deleteButton.scrollIntoViewIfNeeded();
      await deleteButton.click();

      // One dialog; the old inline Confirm / Cancel swap and double confirmation are gone
      const dialog = new ConfirmDialogControl(page, 'cost-line-delete');
      await dialog.waitForOpen();
      await expect(page.getByRole('alertdialog')).toHaveCount(1);
      await expect(dialog.dialog).toContainText(`Delete ${description}?`);
      await expect(
        detail.budgetSection.getByRole('button', { name: 'Confirm', exact: true }),
      ).toHaveCount(0);
      await expect(dialog.cancelButton).toBeFocused();

      const deleted = page.waitForResponse(
        (resp) =>
          resp.url().includes(`/budgets/${lineBody.budget.id}`) &&
          resp.request().method() === 'DELETE',
      );
      await dialog.confirm();
      await deleted;
      await expect(dialog.dialog).toBeHidden();
      await expect(page.getByRole('alertdialog')).toHaveCount(0);
      await expect(detail.budgetSection).not.toContainText(description);
    } finally {
      await deleteHouseholdItemViaApi(page, purchaseId);
      await deleteBudgetSourceViaApi(page, budgetSourceId);
    }
  });
});
