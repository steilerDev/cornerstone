/**
 * E2E tests for contact persons of a company (Story #933, rebuilt on #2244).
 *
 * The Contacts section of the old vendor page is the Contact persons list of the Overview tab
 * (RelatedList): "New contact person" opens the shared ObjectForm dialog, a row has Edit and a
 * ⋯ menu with Remove, and Remove acts at once with an Undo toast (no confirmation dialog). The
 * wider company-page behaviour (Call rule, cards, Payments, ...) is in
 * tests/companies/company-page.spec.ts.
 *
 * UAT Scenarios covered:
 * - Scenario 1: [smoke] Add a contact person - all fields
 * - Scenario 2: Edit a contact person - change name
 * - Scenario 3: Remove a contact person - gone, Undo restores it
 * - Scenario 4: The list is empty initially for a new company
 * - Scenario 5: A first or last name is required - validation error shown
 */

import { test, expect } from '../../fixtures/auth.js';
import type { Page } from '@playwright/test';
import { VendorDetailPage } from '../../pages/VendorDetailPage.js';
import { API } from '../../fixtures/testData.js';

// ─────────────────────────────────────────────────────────────────────────────
// API helpers — create/delete vendors directly to keep tests isolated
// ─────────────────────────────────────────────────────────────────────────────

async function createVendorViaApi(page: Page, name: string): Promise<string> {
  const response = await page.request.post(API.vendors, { data: { name } });
  if (!response.ok()) {
    const body = await response.text();
    throw new Error(`POST ${API.vendors} returned ${response.status()}: ${body}`);
  }
  const body = (await response.json()) as { vendor: { id: string } };
  return body.vendor.id;
}

async function createContactViaApi(
  page: Page,
  vendorId: string,
  data: { firstName: string; lastName: string; role?: string },
): Promise<string> {
  const response = await page.request.post(`${API.vendors}/${vendorId}/contacts`, { data });
  expect(response.ok(), `POST contact: ${response.status()}`).toBeTruthy();
  return ((await response.json()) as { contact: { id: string } }).contact.id;
}

async function deleteVendorViaApi(page: Page, id: string): Promise<void> {
  await page.request.delete(`${API.vendors}/${id}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1 (smoke): Add a contact person — all fields
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Add contact person (Scenario 1)', { tag: '@responsive' }, () => {
  let vendorId: string;

  test.beforeEach(async ({ page, testPrefix }) => {
    vendorId = await createVendorViaApi(page, `${testPrefix} Contact Vendor`);
  });

  test.afterEach(async ({ page }) => {
    await deleteVendorViaApi(page, vendorId);
  });

  test('[smoke] Add a contact person with all fields', { tag: '@smoke' }, async ({ page }) => {
    const vendorPage = new VendorDetailPage(page);

    // Given: A company exists and the user is on its page
    await vendorPage.goto(vendorId);

    // When: The user adds a contact person with every field and saves
    await vendorPage.addContact({
      firstName: 'Jane',
      lastName: 'Smith',
      role: 'Site Manager',
      phone: '+49 123 456',
      email: 'jane@example.com',
      notes: 'Reachable after 8 am',
    });

    // Then: The person appears in the list with role, number and e-mail
    const jane = vendorPage.contactRow('Jane Smith');
    await expect(jane).toBeVisible();
    await expect(jane).toContainText('Site Manager');
    await expect(jane).toContainText('+49 123 456');
    await expect(jane).toContainText('jane@example.com');

    // And: The empty message is gone
    await expect(vendorPage.contacts.emptyMessage(/No contact persons yet/)).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: Edit a contact person
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Edit contact person (Scenario 2)', { tag: '@responsive' }, () => {
  let vendorId: string;
  let contactId: string;

  test.beforeEach(async ({ page, testPrefix }) => {
    vendorId = await createVendorViaApi(page, `${testPrefix} Edit Contact Vendor`);
    contactId = await createContactViaApi(page, vendorId, {
      firstName: 'Jane',
      lastName: 'Smith',
      role: 'Site Manager',
    });
  });

  test.afterEach(async ({ page }) => {
    await deleteVendorViaApi(page, vendorId);
  });

  test('Edit a contact person — change name', async ({ page }) => {
    const vendorPage = new VendorDetailPage(page);

    // Given: A company with an existing contact person
    await vendorPage.goto(vendorId);
    await expect(vendorPage.contactRow('Jane Smith')).toBeVisible();

    // When: The user opens the edit dialog, which shows the stored values
    await vendorPage.openEditContact(contactId);
    await expect(
      vendorPage.editContactDialog.dialog.getByTestId('contact-person-first-name'),
    ).toHaveValue('Jane');

    // And: Changes the last name and saves
    await vendorPage.editContactDialog.dialog.getByTestId('contact-person-last-name').fill('Doe');
    await vendorPage.editContactDialog.save();
    await vendorPage.editContactDialog.waitForClosed();

    // Then: The updated name is shown and the old one is gone
    await expect(vendorPage.contactRow('Jane Doe')).toBeVisible();
    await expect(vendorPage.contactRow('Jane Smith')).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: Remove a contact person (Undo)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Remove contact person (Scenario 3)', { tag: '@responsive' }, () => {
  let vendorId: string;
  let contactId: string;

  test.beforeEach(async ({ page, testPrefix }) => {
    vendorId = await createVendorViaApi(page, `${testPrefix} Delete Contact Vendor`);
    contactId = await createContactViaApi(page, vendorId, { firstName: 'Delete', lastName: 'Me' });
  });

  test.afterEach(async ({ page }) => {
    await deleteVendorViaApi(page, vendorId);
  });

  test('Remove a contact person — gone at once with an Undo toast; Undo restores it', async ({
    page,
  }) => {
    const vendorPage = new VendorDetailPage(page);
    const nativeDialogs: string[] = [];
    page.on('dialog', (native) => {
      nativeDialogs.push(native.message());
      void native.dismiss();
    });

    // Given: A company with an existing contact person
    await vendorPage.goto(vendorId);
    await expect(vendorPage.contactRow('Delete Me')).toBeVisible();

    // When: The user removes the person through the row menu
    await vendorPage.contacts.remove(contactId);

    // Then: The person is gone at once, with no confirmation dialog, and an Undo toast appears
    await expect(vendorPage.contactRow('Delete Me')).toHaveCount(0);
    await expect(vendorPage.toasts.undoToastWith(/Delete Me removed/)).toBeVisible();
    await expect(vendorPage.page.getByRole('alertdialog')).toHaveCount(0);

    // And: Undo brings the person back
    await vendorPage.toasts.undoViaButton();
    await expect(vendorPage.contactRow('Delete Me')).toBeVisible();
    expect(nativeDialogs).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: Contact persons list is empty initially
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Empty contact persons state (Scenario 4)', { tag: '@responsive' }, () => {
  let vendorId: string;

  test.beforeEach(async ({ page, testPrefix }) => {
    vendorId = await createVendorViaApi(page, `${testPrefix} Empty Contacts Vendor`);
  });

  test.afterEach(async ({ page }) => {
    await deleteVendorViaApi(page, vendorId);
  });

  test('Contact persons shows the empty state for a new company', async ({ page }) => {
    const vendorPage = new VendorDetailPage(page);

    // Given: A freshly created company with no contact persons
    await vendorPage.goto(vendorId);

    // Then: The list is present with its empty message and an action
    await expect(vendorPage.contacts.root).toBeVisible();
    await expect(vendorPage.contacts.emptyMessage(/No contact persons yet/)).toBeVisible();
    await expect(vendorPage.contacts.addAction('New contact person')).toBeVisible();
    await expect(vendorPage.contacts.rows).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: A name is required — validation error
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Contact name validation (Scenario 5)', { tag: '@responsive' }, () => {
  let vendorId: string;

  test.beforeEach(async ({ page, testPrefix }) => {
    vendorId = await createVendorViaApi(page, `${testPrefix} Validation Vendor`);
  });

  test.afterEach(async ({ page }) => {
    await deleteVendorViaApi(page, vendorId);
  });

  test('Submitting without a first or last name shows an inline error', async ({ page }) => {
    const vendorPage = new VendorDetailPage(page);

    // Given: The New contact person dialog is open
    await vendorPage.goto(vendorId);
    await vendorPage.openNewContact();

    // When: The user saves without entering a name
    await vendorPage.newContactDialog.save();

    // Then: The error is shown on the name field
    await expect(vendorPage.newContactDialog.fieldError('firstName')).toHaveText(
      'Enter a first or last name.',
    );

    // And: The dialog remains open (nothing was sent)
    await expect(vendorPage.newContactDialog.dialog).toBeVisible();

    // And: A last name alone is enough
    await vendorPage.newContactDialog.dialog
      .getByTestId('contact-person-last-name')
      .fill('Onlylast');
    await vendorPage.newContactDialog.save();
    await vendorPage.newContactDialog.waitForClosed();
    await expect(vendorPage.contactRow('Onlylast')).toBeVisible();
  });
});
