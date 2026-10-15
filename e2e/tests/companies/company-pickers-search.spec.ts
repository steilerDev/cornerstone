/**
 * E2E tests for the company choosers that search the server (in-session fix under EPIC-21).
 *
 * Choosers that used to list the first 100 companies are server-searching SearchPickers: a company
 * past the first page can be found by typing, and a saved company outside it shows by name.
 *
 * S1  Beyond the first 100: a company that sorts after 100 others is found by typing in the cost
 *     line form (`#budget-vendor`) and is saved on the line
 * S2  Task detail assignment (`#work-item-assignment`): pick a company, reload, clear, pick a person
 * S3  New task dialog (`#assignment`): pick a company; the "New company" row opens the child step
 * S4  Purchase edit page (`#vendorId`): the saved company shows, change by search, create row
 * S5  Cost line edit modal (`#budget-vendor`): the create row opens the company form over the
 *     modal; Escape closes only the company form and focus returns to the picker input
 * S6  Diary signature: vendor signer picks a company by search, or "Other..." with free text
 *
 * Every pick is by keyboard (type, ArrowDown, Enter). Companies are synthetic and carry the
 * `testPrefix`; each scenario removes what it created.
 */

import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/auth.js';
import {
  createDraftDiaryEntryViaApi,
  createHouseholdItemViaApi,
  createWorkItemViaApi,
  deleteDiaryEntryViaApi,
  deleteHouseholdItemViaApi,
  deleteVendorViaApi,
  deleteWorkItemViaApi,
} from '../../fixtures/apiHelpers.js';
import { API, TEST_ADMIN } from '../../fixtures/testData.js';
import { CompanyPickerControl } from '../../pages/components/CompanyPickerControl.js';
import { ObjectFormDialog } from '../../pages/components/ObjectFormDialog.js';
import { DiaryEntryDetailPage } from '../../pages/DiaryEntryDetailPage.js';
import { DiaryEntryEditPage } from '../../pages/DiaryEntryEditPage.js';
import { HouseholdItemDetailPage } from '../../pages/HouseholdItemDetailPage.js';
import { HouseholdItemEditPage } from '../../pages/HouseholdItemEditPage.js';
import { WorkItemCreatePage } from '../../pages/WorkItemCreatePage.js';
import { WorkItemDetailPage } from '../../pages/WorkItemDetailPage.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function createCompany(page: Page, name: string): Promise<string> {
  const response = await page.request.post(API.vendors, { data: { name } });
  expect(response.ok(), `POST company "${name}": ${response.status()}`).toBeTruthy();
  return ((await response.json()) as { vendor: { id: string } }).vendor.id;
}

/** Delete companies by exact name (the ones a scenario created through the UI). */
async function deleteCompaniesNamed(page: Page, names: string[]): Promise<void> {
  for (const name of names) {
    const response = await page.request.get(`${API.vendors}?q=${encodeURIComponent(name)}`);
    const body = (await response.json()) as { vendors: Array<{ id: string; name: string }> };
    for (const vendor of body.vendors.filter((v) => v.name === name)) {
      await page.request.delete(`${API.vendors}/${vendor.id}`);
    }
  }
}

/** True when the focused element is the document body (nothing focused). */
async function focusIsOnBody(page: Page): Promise<boolean> {
  return page.evaluate(() => document.activeElement === document.body);
}

/** The work item as the API returns it (flat or wrapped). */
async function getWorkItem(
  page: Page,
  id: string,
): Promise<{
  assignedUser: { displayName: string } | null;
  assignedVendor: { name: string } | null;
}> {
  const response = await page.request.get(`${API.workItems}/${id}`);
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as Record<string, unknown>;
  return (body.workItem ?? body) as {
    assignedUser: { displayName: string } | null;
    assignedVendor: { name: string } | null;
  };
}

/** The id of the task a New task save navigated to (`/project/work-items/<id>`). */
async function savedTaskId(page: Page): Promise<string> {
  await page.waitForURL(/\/project\/work-items\/(?!new)[^/?#]+$/);
  return new URL(page.url()).pathname.split('/').pop()!;
}

// ─────────────────────────────────────────────────────────────────────────────
// S1 - beyond the first 100 (regression)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Company chooser - beyond the first 100 (S1)', { tag: '@responsive' }, () => {
  test('S1: a company that sorts after 100 others is found by typing and saved on a cost line', async ({
    page,
    testPrefix,
  }) => {
    test.slow();
    const fillerIds: string[] = [];
    const target = `${testPrefix} Zz Target 100`;
    let targetId = '';
    let workItemId = '';
    try {
      // 101 companies named before the target ("<prefix> A Filler NNN" < "<prefix> Zz Target")
      for (let start = 0; start < 101; start += 10) {
        const batch = Array.from({ length: Math.min(10, 101 - start) }, (_, i) =>
          createCompany(page, `${testPrefix} A Filler ${String(start + i).padStart(3, '0')}`),
        );
        fillerIds.push(...(await Promise.all(batch)));
      }
      targetId = await createCompany(page, target);

      // Precondition: the target is NOT among the 100 companies the old chooser loaded
      const firstHundred = await page.request.get(`${API.vendors}?pageSize=100`);
      const names = ((await firstHundred.json()) as { vendors: Array<{ name: string }> }).vendors;
      expect(names.map((v) => v.name)).not.toContain(target);

      workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} Beyond 100 Task` });
      const detail = new WorkItemDetailPage(page);
      await detail.goto(workItemId);
      await detail.addBudgetLineButton.click();
      await expect(detail.budgetVendorPicker.input).toBeVisible();
      await page.locator('#budget-planned-amount').fill('250');

      await detail.budgetVendorPicker.pick(target);
      await expect(detail.budgetVendorPicker.selectedDisplay()).toContainText(target);
      expect(await focusIsOnBody(page)).toBe(false);

      await page.locator('[class*="submitButton"]').click();
      await expect(detail.budgetSection.getByText(target)).toBeVisible();
    } finally {
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
      await Promise.all(
        [...fillerIds, targetId].filter(Boolean).map((id) => deleteVendorViaApi(page, id)),
      );
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// S2 - task detail assignment
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Company chooser - task assignment (S2)', { tag: '@responsive' }, () => {
  test('S2: pick a company (PATCH, persists), clear it, then pick a person by name', async ({
    page,
    testPrefix,
  }) => {
    const company = `${testPrefix} Assign Co`;
    const companyId = await createCompany(page, company);
    const workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} Assign Task` });
    try {
      const detail = new WorkItemDetailPage(page);
      const picker = detail.assignmentPicker;
      await detail.goto(workItemId);

      // Every PATCH of the task, in order, with its status
      const patches: number[] = [];
      page.on('response', (resp) => {
        if (
          resp.url().includes(`${API.workItems}/${workItemId}`) &&
          resp.request().method() === 'PATCH'
        ) {
          patches.push(resp.status());
        }
      });

      // Pick a company: the PATCH is sent and the chip shows the name
      await picker.pick(company);
      await expect.poll(() => patches).toEqual([200]);
      await expect(picker.selectedDisplay()).toContainText(company);

      // Reload (a fresh page): the name persists
      const fresh = await page.context().newPage();
      try {
        const freshDetail = new WorkItemDetailPage(fresh);
        await freshDetail.goto(workItemId);
        await expect(freshDetail.assignmentPicker.selectedDisplay()).toContainText(company);
      } finally {
        await fresh.close();
      }

      // Clear selection: the task is unassigned
      await picker.clearButton.click();
      await expect.poll(() => patches).toEqual([200, 200]);
      await expect(picker.input).toBeVisible();
      expect((await getWorkItem(page, workItemId)).assignedVendor).toBeNull();

      // A person is picked by name from the same list
      await picker.pick(TEST_ADMIN.displayName);
      await expect.poll(() => patches).toEqual([200, 200, 200]);
      await expect(picker.selectedDisplay()).toContainText(TEST_ADMIN.displayName);
      const saved = await getWorkItem(page, workItemId);
      expect(saved.assignedUser?.displayName).toBe(TEST_ADMIN.displayName);
      expect(saved.assignedVendor).toBeNull();
    } finally {
      await deleteWorkItemViaApi(page, workItemId);
      await deleteVendorViaApi(page, companyId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// S3 - New task dialog
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Company chooser - New task dialog (S3)', { tag: '@responsive' }, () => {
  test('S3: assign a company by search; the "New company" row opens the child step', async ({
    page,
    testPrefix,
  }) => {
    const existing = `${testPrefix} Dialog Existing Co`;
    const typed = `${testPrefix} Dialog New Co`;
    const existingId = await createCompany(page, existing);
    const taskIds: string[] = [];
    try {
      // Assign an existing company by search
      const task = new WorkItemCreatePage(page);
      await task.goto();
      await task.fillTitle(`${testPrefix} Dialog Assign Task`);
      await task.assignmentPicker.pick(existing);
      await expect(task.assignmentPicker.selectedDisplay()).toContainText(existing);
      expect(await focusIsOnBody(page)).toBe(false);
      await task.submit();
      taskIds.push(await savedTaskId(page));
      expect((await getWorkItem(page, taskIds[0]!)).assignedVendor?.name).toBe(existing);

      // The create row opens the company form as a child step; Save assigns it
      const fresh = await page.context().newPage();
      try {
        const freshTask = new WorkItemCreatePage(fresh);
        const child = new ObjectFormDialog(fresh, 'New company');
        await freshTask.goto();
        await freshTask.fillTitle(`${testPrefix} Dialog Create Task`);
        await freshTask.assignmentPicker.type(typed);
        await freshTask.assignmentPicker.arrowToCreateOption(typed);
        await fresh.keyboard.press('Enter');
        await child.waitForOpen();
        await expect(child.field('name')).toHaveValue(typed);
        await child.save();
        await freshTask.form.waitForOpen();
        await expect(freshTask.assignmentPicker.selectedDisplay()).toContainText(typed);
        expect(await focusIsOnBody(fresh)).toBe(false);
        await freshTask.submit();
        taskIds.push(await savedTaskId(fresh));
        expect((await getWorkItem(fresh, taskIds[1]!)).assignedVendor?.name).toBe(typed);
      } finally {
        await fresh.close();
      }
    } finally {
      for (const id of taskIds) await deleteWorkItemViaApi(page, id);
      await deleteVendorViaApi(page, existingId);
      await deleteCompaniesNamed(page, [typed]);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// S4 - purchase edit page
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Company chooser - purchase edit page (S4)', { tag: '@responsive' }, () => {
  test('S4: the saved company shows; change it by search; the create row selects a new company', async ({
    page,
    testPrefix,
  }) => {
    const current = `${testPrefix} Edit Current Co`;
    const replacement = `${testPrefix} Edit Replacement Co`;
    const typed = `${testPrefix} Edit Created Co`;
    const currentId = await createCompany(page, current);
    const replacementId = await createCompany(page, replacement);
    const itemId = await createHouseholdItemViaApi(page, {
      name: `${testPrefix} Edit Purchase`,
      vendorId: currentId,
    });
    try {
      const edit = new HouseholdItemEditPage(page);
      const detail = new HouseholdItemDetailPage(page);
      await edit.goto(itemId);

      // The saved company shows by name
      await expect(edit.vendorPicker.selectedDisplay()).toContainText(current);

      // Change it by search and save: the purchase shows the new company
      await edit.vendorPicker.clearButton.click();
      await edit.vendorPicker.pick(replacement);
      await expect(edit.vendorPicker.selectedDisplay()).toContainText(replacement);
      expect(await focusIsOnBody(page)).toBe(false);
      await edit.submit(itemId);
      await expect(detail.heading).toBeVisible();
      await expect(page.getByText(replacement).first()).toBeVisible();

      // The create row creates and selects a company (a fresh visit of the edit page)
      const fresh = await page.context().newPage();
      try {
        const freshEdit = new HouseholdItemEditPage(fresh);
        await freshEdit.goto(itemId);
        await expect(freshEdit.vendorPicker.selectedDisplay()).toContainText(replacement);
        await freshEdit.vendorPicker.clearButton.click();
        await freshEdit.vendorPicker.openCreateForm(typed);
        await freshEdit.vendorPicker.form.save();
        await freshEdit.vendorPicker.form.waitForClosed();
        await expect(freshEdit.vendorPicker.selectedDisplay()).toContainText(typed);
        await expect(freshEdit.vendorPicker.clearButton).toBeFocused();
        await freshEdit.submit(itemId);
        await expect(fresh.getByText(typed).first()).toBeVisible();
      } finally {
        await fresh.close();
      }
    } finally {
      await deleteHouseholdItemViaApi(page, itemId);
      await deleteVendorViaApi(page, currentId);
      await deleteVendorViaApi(page, replacementId);
      await deleteCompaniesNamed(page, [typed]);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// S5 - cost line edit modal
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Company chooser - cost line edit modal (S5)', { tag: '@responsive' }, () => {
  test('S5: the create row opens the company form over the modal; Escape closes only the form', async ({
    page,
    testPrefix,
  }) => {
    const owner = `${testPrefix} Line Owner Co`;
    const typed = `${testPrefix} Line Created Co`;
    const ownerId = await createCompany(page, owner);
    const workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} Line Task` });
    const description = `${testPrefix} Linked Line`;
    let invoiceId = '';
    try {
      // A cost line linked to an invoice is edited in the shared modal
      const invoice = await page.request.post(`${API.vendors}/${ownerId}/invoices`, {
        data: {
          invoiceNumber: `${testPrefix}-S5`,
          amount: 800,
          date: '2026-03-01',
          status: 'pending',
        },
      });
      expect(invoice.ok(), 'POST invoice').toBeTruthy();
      invoiceId = ((await invoice.json()) as { invoice: { id: string } }).invoice.id;
      const budget = await page.request.post(`${API.workItems}/${workItemId}/budgets`, {
        data: {
          plannedAmount: 500,
          budgetSourceId: 'discretionary-system',
          confidence: 'own_estimate',
          description,
        },
      });
      expect(budget.ok(), 'POST budget line').toBeTruthy();
      const budgetId = ((await budget.json()) as { budget: { id: string } }).budget.id;
      const link = await page.request.post(`/api/invoices/${invoiceId}/budget-lines`, {
        data: { workItemBudgetId: budgetId, itemizedAmount: 300 },
      });
      expect(link.ok(), 'POST invoice budget-line').toBeTruthy();

      const detail = new WorkItemDetailPage(page);
      await detail.goto(workItemId);
      await detail.budgetSection
        .locator('[class*="toggleBtn"]')
        .locator('visible=true')
        .first()
        .click();
      await page
        .getByRole('button', { name: new RegExp(`Edit budget line.*${description}`, 'i') })
        .click();
      const modal = page.getByRole('dialog', { name: 'Edit Budget Line' });
      await expect(modal).toBeVisible();

      const picker = new CompanyPickerControl(page, 'budget-vendor', modal);
      await expect(picker.input).toBeVisible();

      // The create row opens the company form over the modal; one Escape closes only the form
      await picker.openCreateForm(typed);
      await page.keyboard.press('Escape');
      await picker.form.waitForClosed();
      await expect(modal).toBeVisible();
      await expect(picker.input).toBeFocused();
      expect(await focusIsOnBody(page)).toBe(false);

      // Save selects the new company on the line form and focuses "Clear selection"
      await picker.openCreateForm(typed);
      await picker.form.save();
      await picker.form.waitForClosed();
      await expect(modal).toBeVisible();
      await expect(picker.selectedDisplay()).toContainText(typed);
      await expect(picker.clearButton).toBeFocused();

      // Saving the line keeps the company
      const patched = page.waitForResponse(
        (resp) =>
          resp.url().includes(`/api/invoices/${invoiceId}/budget-lines/`) &&
          resp.request().method() === 'PATCH',
      );
      await modal.locator('[class*="submitButton"]').click();
      expect((await patched).status()).toBe(200);
      await expect(modal).toBeHidden();
    } finally {
      if (invoiceId) await page.request.delete(`${API.vendors}/${ownerId}/invoices/${invoiceId}`);
      await deleteWorkItemViaApi(page, workItemId);
      await deleteVendorViaApi(page, ownerId);
      await deleteCompaniesNamed(page, [typed]);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// S6 - diary signature
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Company chooser - diary signature (S6)', { tag: '@responsive' }, () => {
  test('S6: a vendor signer picks a company by search; the signature reads "<company> (<signatory>)"', async ({
    page,
    testPrefix,
  }) => {
    const company = `${testPrefix} Signer Co`;
    const signatory = 'Alex Signatory';
    const companyId = await createCompany(page, company);
    const entryId = await createDraftDiaryEntryViaApi(page, { entryType: 'daily_log' });
    try {
      const edit = new DiaryEntryEditPage(page);
      await edit.goto(entryId);
      await edit.bodyTextarea.fill(`${testPrefix} daily log with a company signature`);
      await edit.addSignatureButton.click();
      await edit.vendorSignerRadio.check();

      await edit.chooseSignatureCompany(company);
      await expect(edit.signatureCompanyChip).toContainText(company);
      expect(await focusIsOnBody(page)).toBe(false);
      await edit.signatoryNameInput.fill(signatory);
      await edit.drawSignature(0);

      await edit.submitButton.click();
      await expect(page).toHaveURL(new RegExp(`/diary/${entryId}$`));
      await expect(new DiaryEntryDetailPage(page).signatureSection).toContainText(
        `${company} (${signatory})`,
      );
    } finally {
      await deleteDiaryEntryViaApi(page, entryId);
      await deleteVendorViaApi(page, companyId);
    }
  });

  test('S6: "Other..." takes a free-text company name', async ({ page, testPrefix }) => {
    const freeText = `${testPrefix} Free Text Co`;
    const signatory = 'Sam Signatory';
    const entryId = await createDraftDiaryEntryViaApi(page, { entryType: 'daily_log' });
    try {
      const edit = new DiaryEntryEditPage(page);
      await edit.goto(entryId);
      await edit.bodyTextarea.fill(`${testPrefix} daily log with a free-text signature`);
      await edit.addSignatureButton.click();
      await edit.vendorSignerRadio.check();

      await edit.chooseSignatureCompany('Other...');
      await expect(edit.signatureOtherCompanyInput).toBeVisible();
      await edit.signatureOtherCompanyInput.fill(freeText);
      await edit.signatoryNameInput.fill(signatory);
      await edit.drawSignature(0);

      await edit.submitButton.click();
      await expect(page).toHaveURL(new RegExp(`/diary/${entryId}$`));
      await expect(new DiaryEntryDetailPage(page).signatureSection).toContainText(
        `${freeText} (${signatory})`,
      );
    } finally {
      await deleteDiaryEntryViaApi(page, entryId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// S7 - Clear selection keeps focus on the page
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Company chooser - Clear selection focus (S7)', { tag: '@responsive' }, () => {
  test('S7: clearing a chosen company puts focus in the picker input, not on the body', async ({
    page,
    testPrefix,
  }) => {
    const company = `${testPrefix} Clear Focus Co`;
    const companyId = await createCompany(page, company);
    const itemId = await createHouseholdItemViaApi(page, {
      name: `${testPrefix} Clear Focus Purchase`,
      vendorId: companyId,
    });
    try {
      const edit = new HouseholdItemEditPage(page);
      await edit.goto(itemId);
      await expect(edit.vendorPicker.selectedDisplay()).toContainText(company);

      await edit.vendorPicker.clearButton.click();
      await expect(edit.vendorPicker.input).toBeVisible();
      await expect(edit.vendorPicker.input).toBeFocused();
      expect(await focusIsOnBody(page)).toBe(false);
    } finally {
      await deleteHouseholdItemViaApi(page, itemId);
      await deleteVendorViaApi(page, companyId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// S8 - a pick that is saved asynchronously keeps focus on the page
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Company chooser - focus after a saved pick (S8)', { tag: '@responsive' }, () => {
  test('S8: after assigning a company on the task page, focus is on an element, not the body', async ({
    page,
    testPrefix,
  }) => {
    const company = `${testPrefix} Assign Focus Co`;
    const companyId = await createCompany(page, company);
    const workItemId = await createWorkItemViaApi(page, { title: `${testPrefix} Focus Task` });
    try {
      const detail = new WorkItemDetailPage(page);
      await detail.goto(workItemId);
      await detail.assignmentPicker.pick(company);
      await expect(detail.assignmentPicker.selectedDisplay()).toContainText(company);
      await expect.poll(() => focusIsOnBody(page)).toBe(false);
    } finally {
      await deleteWorkItemViaApi(page, workItemId);
      await deleteVendorViaApi(page, companyId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// S9 - the signature company picker fits its block
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Company chooser - signature layout (S9)', { tag: '@responsive' }, () => {
  test('S9: the company chip and the free-text field stay inside the signer block', async ({
    page,
    testPrefix,
  }) => {
    const entryId = await createDraftDiaryEntryViaApi(page, { entryType: 'daily_log' });
    try {
      const edit = new DiaryEntryEditPage(page);
      await edit.goto(entryId);
      await edit.addSignatureButton.click();
      await edit.vendorSignerRadio.check();
      await edit.chooseSignatureCompany('Other...');
      await edit.signatureOtherCompanyInput.fill(`${testPrefix} A Rather Long Company Name Co`);

      // Both fields sit inside the signer block (its right edge), at every width
      const block = await edit.signerSection.boundingBox();
      expect(block).not.toBeNull();
      for (const locator of [edit.signatureCompanyChip, edit.signatureOtherCompanyInput]) {
        const box = await locator.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x + box!.width).toBeLessThanOrEqual(block!.x + block!.width + 1);
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
      ).toBeLessThanOrEqual(0);
    } finally {
      await deleteDiaryEntryViaApi(page, entryId);
    }
  });
});
