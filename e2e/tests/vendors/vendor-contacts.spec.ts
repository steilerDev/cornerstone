/**
 * E2E tests for Vendor Contacts CRUD (Story #933)
 *
 * UAT Scenarios covered:
 * - Scenario 1: [smoke] Add a vendor contact — happy path, all fields
 * - Scenario 2: Edit a vendor contact — change name
 * - Scenario 3: Delete a vendor contact — confirm removes from list
 * - Scenario 4: Contacts list is empty initially for a new vendor
 * - Scenario 5: Name is required — validation error shown
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

async function deleteVendorViaApi(page: Page, id: string): Promise<void> {
  await page.request.delete(`${API.vendors}/${id}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1 (smoke): Add a vendor contact — all fields
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Add vendor contact (Scenario 1)', () => {
  let vendorId: string;

  test.beforeEach(async ({ page, testPrefix }) => {
    vendorId = await createVendorViaApi(page, `${testPrefix} Contact Vendor`);
  });

  test.afterEach(async ({ page }) => {
    await deleteVendorViaApi(page, vendorId);
  });

  test(
    '[smoke] Add a vendor contact with all fields',
    { tag: '@smoke' },
    async ({ page }) => {
      const vendorPage = new VendorDetailPage(page);

      // Given: A vendor exists and the user is on the detail page
      await vendorPage.goto(vendorId);

      // When: User opens the Add Contact modal
      await vendorPage.openAddContactModal();

      // And: Fills in all contact fields
      await vendorPage.fillCreateContactForm({
        firstName: 'Jane',
        lastName: 'Smith',
        role: 'Site Manager',
        phone: '+49 123 456',
        email: 'jane@example.com',
      });

      // And: Submits the form
      await vendorPage.submitCreateContact();

      // Then: The contact appears in the contacts list
      const contacts = await vendorPage.getContactItems();
      expect(contacts.some((c) => c.name === 'Jane Smith')).toBe(true);

      // And: The contacts list is visible (no longer showing empty state)
      await expect(vendorPage.contactsEmptyState).not.toBeVisible();

      // And: The contact's role is shown
      const jane = contacts.find((c) => c.name === 'Jane Smith');
      expect(jane?.role).toBe('Site Manager');
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: Edit a vendor contact
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Edit vendor contact (Scenario 2)', () => {
  let vendorId: string;

  test.beforeEach(async ({ page, testPrefix }) => {
    vendorId = await createVendorViaApi(page, `${testPrefix} Edit Contact Vendor`);
    // Pre-create a contact via API
    await page.request.post(`${API.vendors}/${vendorId}/contacts`, {
      data: { firstName: 'Jane', lastName: 'Smith', role: 'Site Manager' },
    });
  });

  test.afterEach(async ({ page }) => {
    await deleteVendorViaApi(page, vendorId);
  });

  test('Edit a vendor contact — change name', async ({ page }) => {
    const vendorPage = new VendorDetailPage(page);

    // Given: A vendor with an existing contact
    await vendorPage.goto(vendorId);

    // Verify the contact is present before editing
    const contactsBefore = await vendorPage.getContactItems();
    expect(contactsBefore.some((c) => c.name === 'Jane Smith')).toBe(true);

    // When: User opens the edit modal for the contact
    await vendorPage.openEditContactModal('Jane Smith');

    // And: Changes the last name
    await vendorPage.fillEditContactForm({ lastName: 'Doe' });

    // And: Saves the changes
    await vendorPage.submitEditContact();

    // Then: The updated name is shown in the list
    const contactsAfter = await vendorPage.getContactItems();
    expect(contactsAfter.some((c) => c.name === 'Jane Doe')).toBe(true);

    // And: The old name is no longer present
    expect(contactsAfter.some((c) => c.name === 'Jane Smith')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: Delete a vendor contact
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Delete vendor contact (Scenario 3)', () => {
  let vendorId: string;

  test.beforeEach(async ({ page, testPrefix }) => {
    vendorId = await createVendorViaApi(page, `${testPrefix} Delete Contact Vendor`);
    await page.request.post(`${API.vendors}/${vendorId}/contacts`, {
      data: { firstName: 'Delete', lastName: 'Me' },
    });
  });

  test.afterEach(async ({ page }) => {
    await deleteVendorViaApi(page, vendorId);
  });

  test('Delete a vendor contact — contact no longer in list', async ({ page }) => {
    const vendorPage = new VendorDetailPage(page);

    // Given: A vendor with an existing contact
    await vendorPage.goto(vendorId);

    // Verify the contact is present
    const contactsBefore = await vendorPage.getContactItems();
    expect(contactsBefore.some((c) => c.name === 'Delete Me')).toBe(true);

    // When: User deletes the contact
    await vendorPage.deleteContactByName('Delete Me');

    // Then: The contact is no longer in the list
    // Allow React to re-render after the DELETE API response
    await expect(vendorPage.contactsSection).toBeVisible();
    const contactsAfter = await vendorPage.getContactItems();
    expect(contactsAfter.some((c) => c.name === 'Delete Me')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: Contacts list is empty initially
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Empty contacts state (Scenario 4)', () => {
  let vendorId: string;

  test.beforeEach(async ({ page, testPrefix }) => {
    vendorId = await createVendorViaApi(page, `${testPrefix} Empty Contacts Vendor`);
  });

  test.afterEach(async ({ page }) => {
    await deleteVendorViaApi(page, vendorId);
  });

  test('Contacts section shows empty state for a new vendor', async ({ page }) => {
    const vendorPage = new VendorDetailPage(page);

    // Given: A freshly created vendor with no contacts
    await vendorPage.goto(vendorId);

    // Then: The contacts section is present
    await expect(vendorPage.contactsSection).toBeVisible();

    // And: The empty state message is shown
    await expect(vendorPage.contactsEmptyState).toBeVisible();

    // And: The contacts list is not present (no contact cards)
    const contacts = await vendorPage.getContactItems();
    expect(contacts).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: Name is required — validation error
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Contact name validation (Scenario 5)', () => {
  let vendorId: string;

  test.beforeEach(async ({ page, testPrefix }) => {
    vendorId = await createVendorViaApi(page, `${testPrefix} Validation Vendor`);
  });

  test.afterEach(async ({ page }) => {
    await deleteVendorViaApi(page, vendorId);
  });

  test('Submitting empty contact name shows "Name is required" error', async ({ page }) => {
    const vendorPage = new VendorDetailPage(page);

    // Given: The Add Contact modal is open
    await vendorPage.goto(vendorId);
    await vendorPage.openAddContactModal();

    // When: User submits the form without entering a name
    await vendorPage.createContactSubmitButton.click();

    // Then: A validation error is shown
    await expect(vendorPage.createContactErrorBanner).toBeVisible();
    const errorText = await vendorPage.createContactErrorBanner.textContent();
    expect(errorText?.toLowerCase()).toContain('name is required');

    // And: The modal remains open (form not submitted)
    await expect(vendorPage.createContactModal).toBeVisible();
  });
});
