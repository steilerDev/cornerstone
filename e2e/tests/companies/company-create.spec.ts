/**
 * E2E tests for creating a company (#2213, AC5): the New company dialog and the inline
 * "New company ‹text›" row of every company picker.
 *
 * C1  The dialog opens from the header button, the New menu and the `n` shortcut over the page it
 *     was started on; Back closes it; Save lands on the new company page and Back returns to where
 *     the user came from
 * C2  `/companies?create=1` is replaced by `/companies/new`
 * P1  Invoice create modal picker (`#invoice-vendor`)
 * P2  Invoice edit modal picker (`#edit-vendor`): the form stacks over the modal, one Escape
 *     closes only the company form
 * P3  Diary daily-log company picker ("Other company…" on the capture screen)
 * P4  Purchase form picker (`#vendorId`): the company form is a child step of the purchase form;
 *     focus is checked when the step opens and when it closes (Back and Save)
 * (The Paperless review picker is covered by invoices/paperless-invoice-inline-vendor.spec.ts.)
 *
 * Every picker scenario checks the same contract: the create row is the last option, reached with
 * ArrowDown; an exact existing name (other case, umlaut folded) shows no create row; the form opens
 * with the typed text as the name; Save selects the new company and focuses "Clear selection";
 * Cancel focuses the picker input again.
 */

import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/auth.js';
import { createDiaryEntryViaApi, deleteDiaryEntryViaApi } from '../../fixtures/apiHelpers.js';
import { API } from '../../fixtures/testData.js';
import { CompanyPickerControl } from '../../pages/components/CompanyPickerControl.js';
import { CreateMenu } from '../../pages/components/CreateMenu.js';
import { ObjectFormDialog } from '../../pages/components/ObjectFormDialog.js';
import { DiaryCapturePage } from '../../pages/DiaryCapturePage.js';
import { HouseholdItemCreatePage } from '../../pages/HouseholdItemCreatePage.js';
import { InvoiceDetailPage } from '../../pages/InvoiceDetailPage.js';
import { InvoicesPage } from '../../pages/InvoicesPage.js';
import { VendorDetailPage } from '../../pages/VendorDetailPage.js';
import { VendorsPage } from '../../pages/VendorsPage.js';
import { routeUrl } from '../../../shared/src/routes/index.js';

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

/**
 * The shared picker contract. `existing` is a company that exists and `variant` the same name
 * typed in another case with a folded umlaut; `typed` is a name that does not exist. The picker
 * must be in input mode (nothing selected).
 */
async function exerciseCreateRow(
  page: Page,
  picker: CompanyPickerControl,
  existing: string,
  variant: string,
  typed: string,
): Promise<void> {
  // An existing name, in another case with a folded umlaut, shows no create row
  await picker.type(variant);
  await expect(picker.dropdown.getByRole('option', { name: existing, exact: true })).toBeVisible();
  await expect(picker.createOption()).toHaveCount(0);

  // A new name: the create row is the last option, reached with ArrowDown
  await picker.type(typed);
  await expect(picker.createOption(typed)).toBeVisible();
  const options = picker.dropdown.getByRole('option');
  await expect(options.last()).toHaveText(new RegExp(`New company ${typed}$`));
  await picker.arrowToCreateOption(typed);

  // Enter opens the form with the typed text as the name
  await page.keyboard.press('Enter');
  await picker.form.waitForOpen();
  await expect(picker.form.field('name')).toHaveValue(typed);

  // Cancel (not dirty: the name is the prefill) closes it and focuses the picker input again
  await picker.form.cancel();
  await picker.form.waitForClosed();
  await expect(picker.input).toBeFocused();
  await expect(picker.input).toHaveValue(typed);
}

// ─────────────────────────────────────────────────────────────────────────────
// C1 / C2 - the New company dialog
// ─────────────────────────────────────────────────────────────────────────────

test.describe('New company dialog (AC5)', { tag: '@responsive' }, () => {
  test('C1: header button, New menu and "n" open it over the current page; Back closes it', async ({
    page,
    testPrefix,
  }) => {
    const list = new VendorsPage(page);
    const menu = new CreateMenu(page);
    // The header button is hidden while the list is empty (the empty state carries its own), so a
    // fresh database needs one company
    const seedId = await createCompany(page, `${testPrefix} Header Seed Co 2213`);
    try {
      await list.goto();

      // Header button
      await list.newCompanyButton.click();
      await list.createDialog.waitForOpen();
      await expect(page).toHaveURL((url) => url.pathname === routeUrl('companyNew'));
      await expect(list.createDialog.field('name')).toBeFocused();
      await page.goBack();
      await list.createDialog.waitForClosed();
      await expect(page).toHaveURL((url) => url.pathname === routeUrl('companies'));
      await expect(list.newCompanyButton).toBeFocused();

      // New menu, from another page: the dialog opens over that page
      await page.goto(routeUrl('home'));
      await expect(page.getByRole('main')).toBeVisible();
      await menu.choose('company');
      await list.createDialog.waitForOpen();
      await expect(page).toHaveURL((url) => url.pathname === routeUrl('companyNew'));
      await page.goBack();
      await list.createDialog.waitForClosed();
      await expect(page).toHaveURL((url) => url.pathname === routeUrl('home'));
      expect(await focusIsOnBody(page)).toBe(false);

      // The "n" shortcut on the list
      await list.goto();
      await page.locator('main h1').click();
      await page.keyboard.press('n');
      await list.createDialog.waitForOpen();
      await expect(page).toHaveURL((url) => url.pathname === routeUrl('companyNew'));
      await page.keyboard.press('Escape');
      await list.createDialog.waitForClosed();
      expect(await focusIsOnBody(page)).toBe(false);
    } finally {
      await page.request.delete(`${API.vendors}/${seedId}`);
    }
  });

  test(
    'C1b: Save lands on the new company page with its h1 focused; Back returns to where you came from',
    { tag: '@smoke' },
    async ({ page, testPrefix }) => {
      const list = new VendorsPage(page);
      const detail = new VendorDetailPage(page);
      const name = `${testPrefix} Dialog Saved Co 2213`;
      const seedId = await createCompany(page, `${testPrefix} Save Seed Co 2213`);
      try {
        await page.goto(routeUrl('home'));
        await expect(page.getByRole('main')).toBeVisible();
        await page.goto(routeUrl('companies'));
        await list.openCreateModal();
        await list.createVendor({ name, phone: '555-0171' });

        await expect(detail.pageTitle).toHaveText(name);
        await expect(detail.pageTitle).toBeFocused();
        await expect(page).toHaveURL(/\/companies\/[0-9a-f-]{36}$/);
        await expect(list.createDialog.dialog).toHaveCount(0);

        // The dialog was replaced, so Back is the list the user came from, not the form
        await page.goBack();
        await expect(page).toHaveURL((url) => url.pathname === routeUrl('companies'));
        await expect(list.heading).toBeVisible();
      } finally {
        await deleteCompaniesNamed(page, [name]);
        await page.request.delete(`${API.vendors}/${seedId}`);
      }
    },
  );

  test('C1c: the server rejecting the save keeps the dialog open with the banner', async ({
    page,
    testPrefix,
  }) => {
    const list = new VendorsPage(page);
    await page.route(`**${API.vendors}`, async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Boom' } }),
      });
    });
    const seedId = await createCompany(page, `${testPrefix} Reject Seed Co 2213`);
    try {
      await list.goto();
      await list.openCreateModal();
      await list.createVendor({ name: `${testPrefix} Never Saved 2213` });

      await expect(list.createDialog.errorBanner).toBeVisible();
      await expect(list.createDialog.dialog).toBeVisible();
      await expect(list.createDialog.field('name')).toHaveValue(`${testPrefix} Never Saved 2213`);
    } finally {
      await page.unroute(`**${API.vendors}`);
      await page.request.delete(`${API.vendors}/${seedId}`);
    }
  });

  test('C2: /companies?create=1 is replaced by /companies/new', async ({ page }) => {
    const list = new VendorsPage(page);
    await page.goto(routeUrl('home'));
    await expect(page.getByRole('main')).toBeVisible();
    await page.goto(routeUrl('companies', undefined, { create: 1 }));

    await list.createDialog.waitForOpen();
    await expect(page).toHaveURL((url) => url.pathname === routeUrl('companyNew'));
    await expect(page).toHaveURL((url) => !url.searchParams.has('create'));

    // Replaced, not pushed: closing the dialog does not bounce back into ?create=1
    await list.createDialog.cancel();
    await list.createDialog.waitForClosed();
    await expect(page).toHaveURL((url) => url.pathname === routeUrl('companies'));
    await expect(page).toHaveURL((url) => !url.searchParams.has('create'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// P1 - invoice create modal
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Company picker - invoice create modal (AC5)', { tag: '@responsive' }, () => {
  test('P1: the create row works inside the Add Invoice modal, which stays open meanwhile', async ({
    page,
    testPrefix,
  }) => {
    const invoices = new InvoicesPage(page);
    const picker = invoices.createVendorPicker;
    const existing = `${testPrefix} Picker Öko Haus 2213`;
    const typed = `${testPrefix} Picker New Co 2213`;
    const existingId = await createCompany(page, existing);
    try {
      await invoices.goto();
      await invoices.waitForLoaded();
      await invoices.openCreateModal();
      await expect(picker.input).toBeVisible();

      await exerciseCreateRow(page, picker, existing, existing.replace('Öko', 'OEKO'), typed);
      await picker.input.fill('');

      // Save selects the new company, focuses "Clear selection", and the modal is still open
      await picker.openCreateForm(typed);
      await picker.form.save();
      await picker.form.waitForClosed();
      await expect(invoices.createModal).toBeVisible();
      await expect(invoices.createVendorSelected).toContainText(typed);
      await expect(picker.clearButton).toBeFocused();

      // And the invoice can be created for it
      await invoices.createAmountInput.fill('120');
      await invoices.createDateInput.fill('2026-03-01');
      await invoices.createSubmitButton.click();
      await expect(invoices.createModal).toBeHidden();
    } finally {
      await page.request.delete(`${API.vendors}/${existingId}`);
      await deleteCompaniesNamed(page, [typed]);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// P2 - invoice edit modal
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Company picker - invoice edit modal (AC5)', { tag: '@responsive' }, () => {
  test('P2: the form stacks over the edit modal; one Escape closes only the company form', async ({
    page,
    testPrefix,
  }) => {
    const detail = new InvoiceDetailPage(page);
    const picker = new CompanyPickerControl(page, 'edit-vendor', detail.editModal);
    const current = `${testPrefix} Edit Current Co 2213`;
    const typed = `${testPrefix} Edit New Co 2213`;
    const currentId = await createCompany(page, current);
    const invoiceResponse = await page.request.post(`${API.vendors}/${currentId}/invoices`, {
      data: { invoiceNumber: `${testPrefix}-2213-EDIT`, amount: 300, date: '2026-02-01' },
    });
    expect(invoiceResponse.ok(), 'POST invoice').toBeTruthy();
    const invoiceId = ((await invoiceResponse.json()) as { invoice: { id: string } }).invoice.id;
    try {
      await detail.goto(invoiceId);
      await detail.openEditModal();
      // Input mode: clear the current company first
      await detail.editVendorSelectedDisplay
        .getByRole('button', { name: 'Clear selection' })
        .click();

      await exerciseCreateRow(page, picker, current, current.toUpperCase(), typed);

      // Open the form again; one Escape closes ONLY the company form, the edit modal stays
      await picker.openCreateForm(typed);
      await page.keyboard.press('Escape');
      await picker.form.waitForClosed();
      await expect(detail.editModal).toBeVisible();
      await expect(picker.input).toBeFocused();
      expect(await focusIsOnBody(page)).toBe(false);

      // While the form is open the edit modal ignores Escape and its backdrop
      await picker.openCreateForm(typed);
      await expect(detail.editModal).toBeVisible();
      await picker.form.save();
      await picker.form.waitForClosed();
      await expect(detail.editModal).toBeVisible();
      await expect(detail.editVendorSelectedDisplay).toContainText(typed);
      await expect(picker.clearButton).toBeFocused();

      // Saving the invoice moves it to the new company
      await detail.saveEdit();
      await expect(detail.infoList.getByRole('link', { name: typed })).toBeVisible();
    } finally {
      await page.request.delete(`${API.vendors}/${currentId}/invoices/${invoiceId}`);
      await page.request.delete(`${API.vendors}/${currentId}`);
      await deleteCompaniesNamed(page, [typed]);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// P3 - diary daily log
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Company picker - daily log (AC5)', { tag: '@responsive' }, () => {
  test('P3: the daily-log company picker offers the create row and selects the new company', async ({
    page,
    testPrefix,
  }) => {
    const capture = new DiaryCapturePage(page);
    const picker = capture.companyPicker;
    const existing = `${testPrefix} Log Existing Co 2213`;
    const typed = `${testPrefix} Log New Co 2213`;
    const existingId = await createCompany(page, existing);
    const entryId = await createDiaryEntryViaApi(page, {
      entryType: 'daily_log',
      entryDate: '2026-03-14',
      body: `${testPrefix} 2213 log body`,
      title: `${testPrefix} 2213 log`,
    });
    try {
      await capture.gotoEdit(entryId);
      await capture.openCompanyPicker();
      await expect(picker.input).toBeVisible();

      await exerciseCreateRow(page, picker, existing, existing.toUpperCase(), typed);

      await picker.input.fill('');
      await picker.openCreateForm(typed);
      await picker.form.save();
      await picker.form.waitForClosed();

      // Save selects the new company: the picker closes and the company is the pressed chip
      await expect(picker.input).toHaveCount(0);
      await expect(capture.companyChip(typed)).toHaveAttribute('aria-pressed', 'true');

      // The entry keeps the new company once saved
      await capture.saveChanges();
      await page.waitForURL(new RegExp(`/diary/${entryId}$`));
      await expect(page.locator('main')).toContainText(typed);
    } finally {
      await deleteDiaryEntryViaApi(page, entryId);
      await page.request.delete(`${API.vendors}/${existingId}`);
      await deleteCompaniesNamed(page, [typed]);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// P4 - purchase form (child step)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Company picker - purchase form (AC5)', { tag: '@responsive' }, () => {
  test('P4: the company form is a child step; focus is on a named element when it opens and closes', async ({
    page,
    testPrefix,
  }) => {
    const purchase = new HouseholdItemCreatePage(page);
    const picker = purchase.vendorPicker;
    // While the child step is open the same dialog is titled by the child form
    const child = new ObjectFormDialog(page, 'New company');
    const typed = `${testPrefix} Purchase New Co 2213`;
    const itemName = `${testPrefix} Purchase 2213`;
    const focusedInDialog = (title: string) =>
      page.getByRole('dialog', { name: title, exact: true }).locator(':focus');
    try {
      await purchase.goto();
      await purchase.nameInput.fill(itemName);
      await expect(picker.input).toBeVisible();

      // The create row, by keyboard, opens the company form as a child step of this dialog
      await picker.type(typed);
      await picker.arrowToCreateOption(typed);
      await page.keyboard.press('Enter');
      await child.waitForOpen();
      await expect(child.field('name')).toHaveValue(typed);
      await expect(child.field('name')).toBeFocused();
      await expect(child.backButton).toBeVisible();
      expect(await focusIsOnBody(page)).toBe(false);

      // Back returns to the purchase form without losing what was typed; focus is on a named
      // element inside the dialog (the picker input), never the body
      await child.backButton.click();
      await purchase.form.waitForOpen();
      await expect(purchase.nameInput).toHaveValue(itemName);
      await expect(picker.input).toBeFocused();
      expect(await focusIsOnBody(page)).toBe(false);

      // Again, and this time Save: the new company is selected on the purchase form
      await picker.type(typed);
      await picker.arrowToCreateOption(typed);
      await page.keyboard.press('Enter');
      await child.waitForOpen();
      await child.save();
      await purchase.form.waitForOpen();
      await expect(purchase.vendorSelectedDisplay).toContainText(typed);
      await expect(purchase.nameInput).toHaveValue(itemName);
      // Focus must be on an element inside the purchase dialog (the picker's clear button), not
      // on the body: the host focuses `#vendorId`, which no longer exists once a company is chosen
      expect(await focusIsOnBody(page)).toBe(false);
      await expect(focusedInDialog('New purchase')).toHaveCount(1);
    } finally {
      await deleteCompaniesNamed(page, [typed]);
    }
  });
});
