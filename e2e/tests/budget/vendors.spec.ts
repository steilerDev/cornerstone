/**
 * E2E tests for Vendor/Contractor Management (Story #143)
 *
 * UAT Scenarios covered:
 * - Scenario 1:  Empty state when no vendors exist
 * - Scenario 2:  Create a vendor — full details (happy path)
 * - Scenario 3:  Create a vendor — name only (minimal required fields)
 * - Scenario 4:  Create vendor fails — missing required name
 * - Scenario 5:  View vendor detail page with stats
 * - Scenario 6:  Edit vendor details — phone and notes
 * - Scenario 8:  Delete a vendor — no references (happy path)
 * - Scenario 9:  Delete blocked when invoices exist (409 via route mock)
 * - Scenario 11: Vendor list is paginated
 * - Scenario 12: Search vendors by name (case-insensitive)
 * - Scenario 13: Filter by specialty via search
 * - Scenario 14: List shows scannable key info (name, specialty, contact)
 * - Scenario 17: Responsive layout on mobile/tablet/desktop (no horizontal scroll)
 * - Navigation:  Vendors → Detail → Back to Vendors
 * - Dark mode:   Page renders without layout breakage in dark mode
 */

import { test, expect } from '../../fixtures/auth.js';
import type { Page } from '@playwright/test';
import { VendorsPage } from '../../pages/VendorsPage.js';
import { VendorDetailPage } from '../../pages/VendorDetailPage.js';
import { API } from '../../fixtures/testData.js';

// ─────────────────────────────────────────────────────────────────────────────
// API helpers — create/delete vendors directly to keep tests isolated
// ─────────────────────────────────────────────────────────────────────────────

interface VendorApiData {
  name: string;
  specialty?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
}

interface VendorApiResponse {
  id: string;
  name: string;
  specialty: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
}

async function createVendorViaApi(page: Page, data: VendorApiData): Promise<string> {
  const response = await page.request.post(API.vendors, { data });
  if (!response.ok()) {
    const body = await response.text();
    throw new Error(`POST ${API.vendors} returned ${response.status()}: ${body}`);
  }
  const body = (await response.json()) as { vendor: VendorApiResponse };
  return body.vendor.id;
}

async function deleteVendorViaApi(page: Page, id: string): Promise<void> {
  await page.request.delete(`${API.vendors}/${id}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: Empty state when no vendors exist
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Empty state (Scenario 1)', { tag: '@responsive' }, () => {
  test('Empty state message and "Add Vendor" CTA shown when no vendors exist', async ({ page }) => {
    const vendorsPage = new VendorsPage(page);

    // Intercept the API to return an empty vendor list without mutating real data
    await page.route(`${API.vendors}*`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            vendors: [],
            pagination: { page: 1, pageSize: 25, totalItems: 0, totalPages: 0 },
          }),
        });
      } else {
        await route.continue();
      }
    });

    try {
      // Given: No vendors have been created
      await vendorsPage.goto();

      // Then: The empty state is visible
      await expect(vendorsPage.emptyState).toBeVisible({ timeout: 8000 });

      // And: The heading mentions "No vendors yet"
      const emptyText = await vendorsPage.emptyState.textContent();
      expect(emptyText?.toLowerCase()).toMatch(/no vendors yet/);

      // And: An "Add Vendor" CTA button is visible inside the empty state
      const ctaButton = vendorsPage.emptyState.getByRole('button', {
        name: /Add.*Vendor|First Vendor/,
      });
      await expect(ctaButton).toBeVisible();
    } finally {
      await page.unroute(`${API.vendors}*`);
    }
  });

  test('Empty state for search "no matches" shows different message', async ({
    page,
    testPrefix,
  }) => {
    const vendorsPage = new VendorsPage(page);
    let createdId: string | null = null;

    try {
      // Given: At least one vendor exists
      createdId = await createVendorViaApi(page, { name: `${testPrefix} Search Mismatch Vendor` });

      await vendorsPage.goto();
      await vendorsPage.waitForVendorsLoaded();

      // When: I search for something that matches nothing
      await vendorsPage.search('ZZZNOMATCH99999');

      // Then: Empty state appears with a search-specific message
      await expect(vendorsPage.emptyState).toBeVisible({ timeout: 8000 });
      const emptyText = await vendorsPage.emptyState.textContent();
      expect(emptyText?.toLowerCase()).toMatch(/no vendors match|try different/);
    } finally {
      if (createdId) await deleteVendorViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: Create a vendor — full details (happy path)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Create vendor — full details (Scenario 2)', { tag: '@responsive' }, () => {
  test('Create a vendor with all fields — appears in the vendor list', async ({
    page,
    testPrefix,
  }) => {
    const vendorsPage = new VendorsPage(page);
    let createdId: string | null = null;
    const vendorName = `${testPrefix} Apex Construction LLC`;

    try {
      // Given: I am on the Budget > Vendors page
      await vendorsPage.goto();
      await vendorsPage.waitForVendorsLoaded();

      // When: I click "Add Vendor"
      await vendorsPage.openCreateModal();

      // And: I fill in all fields
      await vendorsPage.createVendor({
        name: vendorName,
        specialty: 'General Contractor',
        phone: '+1-555-234-5678',
        email: 'contact@e2e-apex.example.com',
        address: '123 Builder Lane, Springfield, IL 62701',
        notes: 'Primary contractor for foundation work',
      });

      // Then: The modal closes
      await expect(vendorsPage.createModal).not.toBeVisible({ timeout: 8000 });

      // And: The new vendor appears in the list
      await vendorsPage.waitForVendorsLoaded();
      const names = await vendorsPage.getVendorNames();
      expect(names).toContain(vendorName);

      // And: The list entry shows name, specialty, and contact info
      const row = await vendorsPage.getTableRowByName(vendorName);
      if (row) {
        // Specialty visible in table
        const rowText = await row.textContent();
        expect(rowText).toContain('General Contractor');

        // Cleanup: locate the ID via API for deletion
        const resp = await page.request.get(`${API.vendors}?q=${encodeURIComponent(vendorName)}`);
        const body = (await resp.json()) as { vendors: VendorApiResponse[] };
        const found = body.vendors.find((v) => v.name === vendorName);
        if (found) createdId = found.id;
      }
    } finally {
      if (createdId) await deleteVendorViaApi(page, createdId);
    }
  });

  test('Create modal closes and resets after successful creation', async ({ page, testPrefix }) => {
    const vendorsPage = new VendorsPage(page);
    let createdId: string | null = null;
    const vendorName = `${testPrefix} Create Reset Test Vendor`;

    try {
      await vendorsPage.goto();
      await vendorsPage.waitForVendorsLoaded();
      await vendorsPage.openCreateModal();

      // When: I fill the name and submit
      await vendorsPage.createVendor({ name: vendorName });

      // Then: The modal closes
      await expect(vendorsPage.createModal).not.toBeVisible({ timeout: 8000 });

      // And: The "Add Vendor" button is still visible and enabled
      await expect(vendorsPage.addVendorButton).toBeVisible();
      await expect(vendorsPage.addVendorButton).toBeEnabled();
    } finally {
      const resp = await page.request.get(`${API.vendors}?q=${encodeURIComponent(vendorName)}`);
      const body = (await resp.json()) as { vendors: VendorApiResponse[] };
      const found = body.vendors.find((v) => v.name === vendorName);
      if (found) createdId = found.id;
      if (createdId) await deleteVendorViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: Create a vendor — name only (minimal required fields)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Create vendor — name only (Scenario 3)', { tag: '@responsive' }, () => {
  test('Create vendor with only name — succeeds and appears in list', async ({
    page,
    testPrefix,
  }) => {
    const vendorsPage = new VendorsPage(page);
    let createdId: string | null = null;
    const vendorName = `${testPrefix} Name Only Vendor`;

    try {
      await vendorsPage.goto();
      await vendorsPage.waitForVendorsLoaded();
      await vendorsPage.openCreateModal();

      // When: I fill in only the name
      await vendorsPage.createVendor({ name: vendorName });

      // Then: The modal closes — vendor was created
      await expect(vendorsPage.createModal).not.toBeVisible({ timeout: 8000 });

      // And: The vendor appears in the list
      await vendorsPage.waitForVendorsLoaded();
      const names = await vendorsPage.getVendorNames();
      expect(names).toContain(vendorName);
    } finally {
      const resp = await page.request.get(`${API.vendors}?q=${encodeURIComponent(vendorName)}`);
      const body = (await resp.json()) as { vendors: VendorApiResponse[] };
      const found = body.vendors.find((v) => v.name === vendorName);
      if (found) createdId = found.id;
      if (createdId) await deleteVendorViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: Create vendor fails — missing required name
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Create vendor validation (Scenario 4)', { tag: '@responsive' }, () => {
  test('"Add Vendor" submit button is disabled when name field is empty', async ({ page }) => {
    const vendorsPage = new VendorsPage(page);

    // Given: The Add Vendor modal is open
    await vendorsPage.goto();
    await vendorsPage.waitForVendorsLoaded();
    await vendorsPage.openCreateModal();

    // When: The Name field is empty (default state)
    // Then: The submit button should be disabled
    await expect(vendorsPage.createSubmitButton).toBeDisabled();

    // Cleanup: close modal
    await vendorsPage.createCancelButton.click();
    await expect(vendorsPage.createModal).not.toBeVisible();
  });

  test('Submit button becomes enabled when name is filled in', async ({ page }) => {
    const vendorsPage = new VendorsPage(page);

    await vendorsPage.goto();
    await vendorsPage.waitForVendorsLoaded();
    await vendorsPage.openCreateModal();

    // When: I type a name
    await vendorsPage.createNameInput.fill('Test Vendor');

    // Then: The submit button should be enabled
    await expect(vendorsPage.createSubmitButton).toBeEnabled();

    // Cleanup: close modal
    await vendorsPage.createCancelButton.click();
    await expect(vendorsPage.createModal).not.toBeVisible();
  });

  test('Clearing the name after typing disables the submit button again', async ({ page }) => {
    const vendorsPage = new VendorsPage(page);

    await vendorsPage.goto();
    await vendorsPage.waitForVendorsLoaded();
    await vendorsPage.openCreateModal();

    // Fill then clear the name
    await vendorsPage.createNameInput.fill('Temp Name');
    await vendorsPage.createNameInput.fill('');

    // Then: Submit button should be disabled again
    await expect(vendorsPage.createSubmitButton).toBeDisabled();

    await vendorsPage.createCancelButton.click();
    await expect(vendorsPage.createModal).not.toBeVisible();
  });

  test('Cancel button closes the modal without creating a vendor', async ({ page }) => {
    const vendorsPage = new VendorsPage(page);

    await vendorsPage.goto();
    await vendorsPage.waitForVendorsLoaded();

    const namesBefore = await vendorsPage.getVendorNames();

    await vendorsPage.openCreateModal();
    await vendorsPage.createNameInput.fill('Should Not Be Created');
    await vendorsPage.createCancelButton.click();

    // Modal closes
    await expect(vendorsPage.createModal).not.toBeVisible();

    // List unchanged
    const namesAfter = await vendorsPage.getVendorNames();
    expect(namesAfter).not.toContain('Should Not Be Created');
    expect(namesAfter.length).toBe(namesBefore.length);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: View vendor detail page
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Vendor detail page (Scenario 5)', { tag: '@responsive' }, () => {
  test('Clicking a vendor name navigates to the detail page with all fields', async ({
    page,
    testPrefix,
  }) => {
    // This test creates a vendor, searches, navigates to detail, and asserts
    // 10+ fields/stats — legitimately takes 12-15s even on desktop Chromium.
    test.slow();
    const vendorsPage = new VendorsPage(page);
    const detailPage = new VendorDetailPage(page);
    let createdId: string | null = null;
    const vendorName = `${testPrefix} Detail View Vendor`;

    try {
      // Given: A vendor with full details exists
      createdId = await createVendorViaApi(page, {
        name: vendorName,
        specialty: 'Plumbing',
        phone: '+1-555-111-2222',
        email: 'detail@e2e-test.example.com',
        address: '456 Pipe Lane, Springfield, IL',
        notes: 'Handles all plumbing fixtures',
      });

      await vendorsPage.goto();
      await vendorsPage.waitForVendorsLoaded();
      // Search for the vendor to avoid pagination issues from parallel tests
      await vendorsPage.search(vendorName);
      // Wait for the search results to render the vendor link before clicking
      await expect(page.getByRole('link', { name: vendorName }).first()).toBeVisible();

      // When: I click on the vendor name link
      await vendorsPage.clickView(vendorName);

      // Then: I am on the vendor detail page (wait for URL, not h1 which matches list page too)
      await page.waitForURL(`**/budget/vendors/${createdId}`, { timeout: 8000 });

      // And: The page heading is the vendor name
      // Wait for the detail page info card to render — the h1 transitions from
      // "Budget" (list page) to the vendor name after React fetches and renders
      await expect(detailPage.infoCard).toBeVisible();
      await expect(detailPage.pageTitle).toHaveText(vendorName);

      // And: All vendor fields are shown in the info card
      const fields = await detailPage.getInfoFields();
      expect(fields['Name']).toBe(vendorName);
      expect(fields['Specialty']).toBe('Plumbing');
      expect(fields['Phone']).toContain('+1-555-111-2222');
      expect(fields['Email']).toContain('detail@e2e-test.example.com');
      expect(fields['Address']).toBe('456 Pipe Lane, Springfield, IL');
      expect(fields['Notes']).toBe('Handles all plumbing fixtures');

      // And: Stats cards are visible
      await expect(detailPage.totalInvoicesStat).toBeVisible();
      await expect(detailPage.outstandingBalanceStat).toBeVisible();

      // And: Invoice stat shows 0 (no invoices yet)
      const invoiceCount = await detailPage.getTotalInvoices();
      expect(invoiceCount?.trim()).toBe('0');

      // And: Outstanding balance shows $0.00
      const balance = await detailPage.getOutstandingBalance();
      expect(balance?.trim()).toMatch(/\$0\.00/);

      // And: Invoices section is visible with empty state (no invoices yet)
      await expect(detailPage.invoicesSection).toBeVisible();
      await expect(detailPage.invoicesEmptyState).toBeVisible();
    } finally {
      if (createdId) await deleteVendorViaApi(page, createdId);
    }
  });

  test('Detail page heading matches vendor name; breadcrumb shows vendor name', async ({
    page,
    testPrefix,
  }) => {
    const detailPage = new VendorDetailPage(page);
    let createdId: string | null = null;
    const vendorName = `${testPrefix} Breadcrumb Vendor`;

    try {
      createdId = await createVendorViaApi(page, {
        name: vendorName,
        specialty: 'Roofing',
      });

      await detailPage.goto(createdId);

      await expect(detailPage.pageTitle).toHaveText(vendorName);
      await expect(detailPage.breadcrumbCurrent).toHaveText(vendorName);
    } finally {
      if (createdId) await deleteVendorViaApi(page, createdId);
    }
  });

  test('Navigating to unknown vendor ID shows error state', async ({ page }) => {
    const detailPage = new VendorDetailPage(page);

    await page.goto('/budget/vendors/nonexistent-vendor-id-12345');

    // Then: An error card is shown
    await expect(detailPage.errorCard).toBeVisible({ timeout: 8000 });
    const errorText = await detailPage.errorCard.textContent();
    expect(errorText?.toLowerCase()).toMatch(/not found|deleted|error/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6: Edit vendor details
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Edit vendor (Scenario 6)', { tag: '@responsive' }, () => {
  test('Edit phone and notes — changes shown on detail page and persist on reload', async ({
    page,
    testPrefix,
  }) => {
    const detailPage = new VendorDetailPage(page);
    let createdId: string | null = null;

    try {
      // Given: A vendor exists
      createdId = await createVendorViaApi(page, {
        name: `${testPrefix} Editable Vendor`,
        specialty: 'General Contractor',
        phone: '+1-555-000-0001',
        notes: 'Original notes',
      });

      // When: I navigate to its detail page and click "Edit"
      await detailPage.goto(createdId);
      await detailPage.startEdit();

      // And: I update phone and notes
      await detailPage.fillEditForm({
        phone: '+1-555-999-0000',
        notes: 'Preferred for structural work',
      });

      // And: I click "Save Changes"
      await detailPage.saveEdit();

      // Then: The detail page shows the updated values
      const fields = await detailPage.getInfoFields();
      expect(fields['Phone']).toContain('+1-555-999-0000');
      expect(fields['Notes']).toBe('Preferred for structural work');

      // And: The changes persist on page reload
      await detailPage.goto(createdId);
      const fieldsAfterReload = await detailPage.getInfoFields();
      expect(fieldsAfterReload['Phone']).toContain('+1-555-999-0000');
      expect(fieldsAfterReload['Notes']).toBe('Preferred for structural work');
    } finally {
      if (createdId) await deleteVendorViaApi(page, createdId);
    }
  });

  test('Edit — cancelling restores original values without making API changes', async ({
    page,
    testPrefix,
  }) => {
    const detailPage = new VendorDetailPage(page);
    let createdId: string | null = null;

    try {
      createdId = await createVendorViaApi(page, {
        name: `${testPrefix} Cancel Edit Vendor`,
        specialty: 'Electrician',
        phone: '+1-555-777-8888',
      });

      await detailPage.goto(createdId);
      await detailPage.startEdit();

      // Change the phone but cancel
      await detailPage.fillEditForm({ phone: '+1-999-999-9999' });
      await detailPage.cancelEdit();

      // Then: The original phone is still shown
      const fields = await detailPage.getInfoFields();
      expect(fields['Phone']).toContain('+1-555-777-8888');
    } finally {
      if (createdId) await deleteVendorViaApi(page, createdId);
    }
  });

  test('Edit — clearing name disables Save Changes button', async ({ page, testPrefix }) => {
    const detailPage = new VendorDetailPage(page);
    let createdId: string | null = null;

    try {
      createdId = await createVendorViaApi(page, {
        name: `${testPrefix} Save Guard Vendor`,
      });

      await detailPage.goto(createdId);
      await detailPage.startEdit();

      // Clear the name field
      await detailPage.editNameInput.fill('');

      // Then: Save Changes button should be disabled
      await expect(detailPage.saveChangesButton).toBeDisabled();

      // Cleanup: cancel
      await detailPage.cancelEditButton.click();
    } finally {
      if (createdId) await deleteVendorViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 8: Delete a vendor — no references (happy path)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Delete vendor — no references (Scenario 8)', { tag: '@responsive' }, () => {
  test('Delete confirmation modal opens with vendor name; confirming removes vendor', async ({
    page,
    testPrefix,
  }) => {
    const vendorsPage = new VendorsPage(page);
    const vendorName = `${testPrefix} Delete Target Vendor`;

    // Given: A vendor exists with no invoices
    const createdId = await createVendorViaApi(page, { name: vendorName });

    // When: I navigate to Budget > Vendors and search for this vendor
    await vendorsPage.goto();
    await vendorsPage.waitForVendorsLoaded();
    await vendorsPage.search(vendorName);

    const namesBefore = await vendorsPage.getVendorNames();
    expect(namesBefore).toContain(vendorName);

    // And: I click Delete on the vendor
    await vendorsPage.openDeleteModal(vendorName);

    // Then: The modal is visible
    await expect(vendorsPage.deleteModal).toBeVisible();

    // And: The modal title says "Delete Vendor"
    await expect(vendorsPage.deleteModalTitle).toHaveText('Delete Vendor');

    // And: The modal text mentions the vendor name
    const modalText = await vendorsPage.deleteModal.textContent();
    expect(modalText).toContain(vendorName);

    // When: I confirm deletion
    await vendorsPage.confirmDelete();

    // Then: The modal closes
    await expect(vendorsPage.deleteModal).not.toBeVisible({ timeout: 8000 });

    // And: The vendor is removed from the list
    await vendorsPage.waitForVendorsLoaded();
    const namesAfter = await vendorsPage.getVendorNames();
    expect(namesAfter).not.toContain(vendorName);

    // Note: vendor was deleted via UI — no API cleanup needed
    void createdId;
  });

  test('Cancelling delete modal leaves vendor in the list', async ({ page, testPrefix }) => {
    const vendorsPage = new VendorsPage(page);
    let createdId: string | null = null;
    const vendorName = `${testPrefix} Cancel Delete Vendor`;

    try {
      createdId = await createVendorViaApi(page, { name: vendorName });

      await vendorsPage.goto();
      await vendorsPage.waitForVendorsLoaded();
      await vendorsPage.search(vendorName);

      await vendorsPage.openDeleteModal(vendorName);
      await vendorsPage.cancelDelete();

      // Vendor still in list
      const names = await vendorsPage.getVendorNames();
      expect(names).toContain(vendorName);
    } finally {
      if (createdId) await deleteVendorViaApi(page, createdId);
    }
  });

  test('Delete from detail page — navigates back to vendor list after confirmation', async ({
    page,
    testPrefix,
  }) => {
    const detailPage = new VendorDetailPage(page);

    // Given: A vendor exists
    const createdId = await createVendorViaApi(page, {
      name: `${testPrefix} Detail Delete Vendor`,
    });

    // When: I navigate to its detail page and click Delete
    await detailPage.goto(createdId);
    await detailPage.openDeleteModal();

    // And: I confirm
    await detailPage.confirmDelete();

    // Then: I am redirected to the vendors list
    await page.waitForURL('/budget/vendors', { timeout: 8000 });
    expect(page.url()).toContain('/budget/vendors');

    // Note: vendor was deleted via UI — no API cleanup needed
    void createdId;
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 9: Delete blocked when invoices exist (409)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Delete blocked by 409 (Scenario 9)', { tag: '@responsive' }, () => {
  test('409 response on delete shows error in modal; confirm button hidden; vendor remains', async ({
    page,
    testPrefix,
  }) => {
    const vendorsPage = new VendorsPage(page);
    let createdId: string | null = null;

    try {
      createdId = await createVendorViaApi(page, { name: `${testPrefix} Delete Blocked Vendor` });

      // Intercept DELETE to return 409
      await page.route(`${API.vendors}/${createdId}`, async (route) => {
        if (route.request().method() === 'DELETE') {
          await route.fulfill({
            status: 409,
            contentType: 'application/json',
            body: JSON.stringify({
              error: {
                code: 'VENDOR_IN_USE',
                message:
                  'This vendor cannot be deleted because they are referenced by one or more invoices.',
              },
            }),
          });
        } else {
          await route.continue();
        }
      });

      await vendorsPage.goto();
      await vendorsPage.waitForVendorsLoaded();
      await vendorsPage.search(`${testPrefix} Delete Blocked Vendor`);

      // When: I attempt to delete and confirm
      await vendorsPage.openDeleteModal(`${testPrefix} Delete Blocked Vendor`);
      await vendorsPage.confirmDelete();

      // Then: Error message appears in the modal
      const errorText = await vendorsPage.getDeleteErrorText();
      expect(errorText).toBeTruthy();
      expect(errorText?.toLowerCase()).toMatch(/cannot be deleted|invoices|in use/);

      // And: The "Delete Vendor" confirm button is hidden (replaced by error state)
      await expect(vendorsPage.deleteConfirmButton).not.toBeVisible({ timeout: 3000 });

      // And: The modal remains open
      await expect(vendorsPage.deleteModal).toBeVisible();

      // Close modal
      await vendorsPage.cancelDelete();
    } finally {
      await page.unroute(`${API.vendors}/${createdId ?? ''}`);
      if (createdId) await deleteVendorViaApi(page, createdId);
    }
  });

  test('409 on detail page delete shows error in modal; vendor not navigated away', async ({
    page,
    testPrefix,
  }) => {
    const detailPage = new VendorDetailPage(page);
    let createdId: string | null = null;

    try {
      createdId = await createVendorViaApi(page, {
        name: `${testPrefix} Detail Delete Blocked Vendor`,
      });

      // Intercept DELETE on this vendor
      await page.route(`${API.vendors}/${createdId}`, async (route) => {
        if (route.request().method() === 'DELETE') {
          await route.fulfill({
            status: 409,
            contentType: 'application/json',
            body: JSON.stringify({
              error: {
                code: 'VENDOR_IN_USE',
                message:
                  'This vendor cannot be deleted because they are referenced by one or more invoices.',
              },
            }),
          });
        } else {
          await route.continue();
        }
      });

      await detailPage.goto(createdId);
      await detailPage.openDeleteModal();
      await detailPage.confirmDelete();

      // Error shown in modal
      const errorText = await detailPage.getDeleteErrorText();
      expect(errorText).toBeTruthy();
      expect(errorText?.toLowerCase()).toMatch(/cannot be deleted|invoices/);

      // Still on detail page
      expect(page.url()).toContain(`/budget/vendors/${createdId}`);

      // Confirm button hidden
      await expect(detailPage.deleteConfirmButton).not.toBeVisible({ timeout: 3000 });

      // Close modal
      await detailPage.cancelDelete();
    } finally {
      await page.unroute(`${API.vendors}/${createdId ?? ''}`);
      if (createdId) await deleteVendorViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 11: Pagination
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Pagination (Scenario 11)', { tag: '@responsive' }, () => {
  test('Pagination controls visible when API returns totalPages > 1', async ({ page }) => {
    const vendorsPage = new VendorsPage(page);

    // Mock the API to simulate a multi-page result (26 items, pageSize 25)
    await page.route(`${API.vendors}*`, async (route) => {
      if (route.request().method() === 'GET') {
        const vendors = Array.from({ length: 25 }, (_, i) => ({
          id: `mock-vendor-${i}`,
          name: `Mock Vendor ${String(i + 1).padStart(2, '0')}`,
          specialty: 'Testing',
          phone: null,
          email: null,
          address: null,
          notes: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          createdBy: { id: 'user-1', displayName: 'E2E Admin' },
        }));
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            vendors,
            pagination: { page: 1, pageSize: 25, totalItems: 26, totalPages: 2 },
          }),
        });
      } else {
        await route.continue();
      }
    });

    try {
      // Given: More than one page of vendors
      await vendorsPage.goto();

      // Then: Pagination controls are visible
      await expect(vendorsPage.pagination).toBeVisible({ timeout: 8000 });
      await expect(vendorsPage.nextPageButton).toBeVisible();
      await expect(vendorsPage.prevPageButton).toBeVisible();

      // And: Previous button disabled on page 1
      await expect(vendorsPage.prevPageButton).toBeDisabled();

      // And: Pagination info shows range
      const infoText = await vendorsPage.paginationInfo.textContent();
      expect(infoText).toMatch(/showing|of 26/i);
    } finally {
      await page.unroute(`${API.vendors}*`);
    }
  });

  test('Pagination controls not shown when only one page of results', async ({ page }) => {
    const vendorsPage = new VendorsPage(page);

    // Mock a single-page response
    await page.route(`${API.vendors}*`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            vendors: [
              {
                id: 'v1',
                name: 'Solo Vendor',
                specialty: null,
                phone: null,
                email: null,
                address: null,
                notes: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                createdBy: { id: 'u1', displayName: 'Admin' },
              },
            ],
            pagination: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1 },
          }),
        });
      } else {
        await route.continue();
      }
    });

    try {
      await vendorsPage.goto();

      // Wait for the list to load (at least one row visible)
      await vendorsPage.waitForVendorsLoaded();

      // Pagination section should NOT be visible
      await expect(vendorsPage.pagination).not.toBeVisible();
    } finally {
      await page.unroute(`${API.vendors}*`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 12: Search by name (case-insensitive)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Search vendors (Scenario 12)', { tag: '@responsive' }, () => {
  test('Search by partial name — only matching vendor is shown (case-insensitive)', async ({
    page,
    testPrefix,
  }) => {
    const vendorsPage = new VendorsPage(page);
    const created: string[] = [];
    const alphaName = `${testPrefix} Alpha Construction`;
    const betaName = `${testPrefix} Beta Plumbing`;
    const gammaName = `${testPrefix} Gamma Electric`;

    try {
      // Given: Multiple vendors exist
      created.push(await createVendorViaApi(page, { name: alphaName }));
      created.push(await createVendorViaApi(page, { name: betaName }));
      created.push(await createVendorViaApi(page, { name: gammaName }));

      await vendorsPage.goto();
      await vendorsPage.waitForVendorsLoaded();

      // When: I type the prefix + "alpha" in the search field
      await vendorsPage.search(`${testPrefix} Alpha`);

      // Then: Only the alpha vendor is visible
      const names = await vendorsPage.getVendorNames();
      expect(names).toContain(alphaName);
      expect(names).not.toContain(betaName);
      expect(names).not.toContain(gammaName);
    } finally {
      for (const id of created) {
        await deleteVendorViaApi(page, id);
      }
    }
  });

  test('Search is updated via URL query param ?q=', async ({ page, testPrefix }) => {
    const vendorsPage = new VendorsPage(page);
    let createdId: string | null = null;
    const vendorName = `${testPrefix} URL Search Vendor`;

    try {
      createdId = await createVendorViaApi(page, { name: vendorName });

      await vendorsPage.goto();
      await vendorsPage.waitForVendorsLoaded();
      await vendorsPage.search(vendorName);

      // The URL should contain the q param
      expect(page.url()).toContain('q=');
    } finally {
      if (createdId) await deleteVendorViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 13: Filter by specialty via search
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Search by specialty (Scenario 13)', { tag: '@responsive' }, () => {
  test('Searching for a specialty term filters vendors to matching ones', async ({
    page,
    testPrefix,
  }) => {
    const vendorsPage = new VendorsPage(page);
    const created: string[] = [];
    // Use testPrefix in the specialty to make it unique across workers
    const uniqueSpecialty = `${testPrefix}SpecialtyXYZ`;

    try {
      created.push(
        await createVendorViaApi(page, {
          name: `${testPrefix} Specialty Match`,
          specialty: uniqueSpecialty,
        }),
      );
      created.push(
        await createVendorViaApi(page, {
          name: `${testPrefix} Specialty No Match`,
          specialty: 'OtherTrade',
        }),
      );

      await vendorsPage.goto();
      await vendorsPage.waitForVendorsLoaded();

      // When: I search for the unique specialty term
      await vendorsPage.search(uniqueSpecialty);

      // Then: Only the vendor with that specialty is shown
      const names = await vendorsPage.getVendorNames();
      expect(names).toContain(`${testPrefix} Specialty Match`);
      expect(names).not.toContain(`${testPrefix} Specialty No Match`);
    } finally {
      for (const id of created) {
        await deleteVendorViaApi(page, id);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 14: List shows scannable key info (name, specialty, contact)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('List shows key info (Scenario 14)', { tag: '@responsive' }, () => {
  test('Table row shows vendor name, specialty, phone, and email', async ({ page, testPrefix }) => {
    // Table is hidden on mobile (< 768px) — cards are shown instead
    const viewport = page.viewportSize();
    if (viewport && viewport.width < 768) {
      test.skip();
      return;
    }
    const vendorsPage = new VendorsPage(page);
    let createdId: string | null = null;
    const vendorName = `${testPrefix} Full Info Vendor`;

    try {
      createdId = await createVendorViaApi(page, {
        name: vendorName,
        specialty: 'Landscaping',
        phone: '+1-555-333-4444',
        email: 'fullinfo@e2e-test.example.com',
      });

      await vendorsPage.goto();
      await vendorsPage.waitForVendorsLoaded();

      // Search to find this vendor specifically
      await vendorsPage.search(vendorName);

      const row = await vendorsPage.getTableRowByName(vendorName);
      expect(row).not.toBeNull();

      if (row) {
        const rowText = await row.textContent();
        expect(rowText).toContain('Landscaping');
        expect(rowText).toContain('+1-555-333-4444');
        expect(rowText).toContain('fullinfo@e2e-test.example.com');
      }
    } finally {
      if (createdId) await deleteVendorViaApi(page, createdId);
    }
  });

  test('Table has correct column headers: Name, Specialty, Phone, Email, Actions', async ({
    page,
    testPrefix,
  }) => {
    // Table is hidden on mobile (< 768px) — cards are shown instead
    const viewport = page.viewportSize();
    if (viewport && viewport.width < 768) {
      test.skip();
      return;
    }
    const vendorsPage = new VendorsPage(page);
    let createdId: string | null = null;

    try {
      // Need at least one vendor to display the table
      createdId = await createVendorViaApi(page, { name: `${testPrefix} Header Check Vendor` });

      await vendorsPage.goto();
      await vendorsPage.waitForVendorsLoaded();

      // Table headers should be present
      const table = vendorsPage.tableContainer.locator('table');
      await expect(table.getByRole('columnheader', { name: 'Name' })).toBeVisible();
      await expect(table.getByRole('columnheader', { name: 'Specialty' })).toBeVisible();
      await expect(table.getByRole('columnheader', { name: 'Phone' })).toBeVisible();
      await expect(table.getByRole('columnheader', { name: 'Email' })).toBeVisible();
      await expect(table.getByRole('columnheader', { name: 'Actions' })).toBeVisible();
    } finally {
      if (createdId) await deleteVendorViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Navigation tests
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Navigation between list and detail pages', { tag: '@responsive' }, () => {
  test('Clicking vendor link navigates to detail page; breadcrumb "Vendors" returns to list', async ({
    page,
    testPrefix,
  }) => {
    const vendorsPage = new VendorsPage(page);
    const detailPage = new VendorDetailPage(page);
    let createdId: string | null = null;
    const vendorName = `${testPrefix} Navigation Vendor`;

    try {
      createdId = await createVendorViaApi(page, { name: vendorName });

      // Start at list — search for the vendor to avoid pagination issues
      // when parallel tests create many vendors
      await vendorsPage.goto();
      await vendorsPage.waitForVendorsLoaded();
      await vendorsPage.search(vendorName);
      // Wait for the search results to render the vendor link before clicking
      await expect(page.getByRole('link', { name: vendorName }).first()).toBeVisible();

      // Navigate to detail (wait for URL change, not h1 which matches list page too)
      await vendorsPage.clickView(vendorName);
      await page.waitForURL('**/budget/vendors/*', { timeout: 8000 });

      // Wait for detail page to fully render before interacting with breadcrumb
      await expect(detailPage.infoCard).toBeVisible();

      // Navigate back via breadcrumb
      await detailPage.goBackToVendors();
      expect(page.url()).toContain('/budget/vendors');
      await vendorsPage.heading.waitFor({ state: 'visible', timeout: 8000 });
    } finally {
      if (createdId) await deleteVendorViaApi(page, createdId);
    }
  });

  test('Page URL is /budget/vendors', async ({ page }) => {
    const vendorsPage = new VendorsPage(page);

    await vendorsPage.goto();
    await page.waitForURL('/budget/vendors');
    expect(page.url()).toContain('/budget/vendors');
  });

  test('Page heading is "Budget" (h1)', { tag: '@smoke' }, async ({ page }) => {
    const vendorsPage = new VendorsPage(page);

    await vendorsPage.goto();
    await expect(vendorsPage.heading).toBeVisible();
    await expect(vendorsPage.heading).toHaveText('Budget');

    // Verify the correct sub-page loaded via the h2 section heading
    const sectionHeading = page.getByRole('heading', { level: 2, name: 'Vendors', exact: true });
    await expect(sectionHeading).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 17: Responsive layout
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Responsive layout (Scenario 17)', { tag: '@responsive' }, () => {
  test('Vendors list page renders without horizontal scroll on current viewport', async ({
    page,
  }) => {
    const vendorsPage = new VendorsPage(page);

    await vendorsPage.goto();

    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });

    expect(hasHorizontalScroll).toBe(false);
  });

  test('Vendor detail page renders without horizontal scroll on current viewport', async ({
    page,
    testPrefix,
  }) => {
    const detailPage = new VendorDetailPage(page);
    let createdId: string | null = null;

    try {
      createdId = await createVendorViaApi(page, {
        name: `${testPrefix} Responsive Detail Vendor`,
      });

      await detailPage.goto(createdId);

      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });

      expect(hasHorizontalScroll).toBe(false);
    } finally {
      if (createdId) await deleteVendorViaApi(page, createdId);
    }
  });

  test('Mobile: card view is shown instead of table (viewport < 768px)', async ({
    page,
    testPrefix,
  }) => {
    const viewport = page.viewportSize();

    // Only run the mobile-specific assertion on narrow viewports
    if (!viewport || viewport.width >= 768) {
      test.skip();
      return;
    }

    const vendorsPage = new VendorsPage(page);
    let createdId: string | null = null;

    try {
      createdId = await createVendorViaApi(page, {
        name: `${testPrefix} Mobile Card Vendor`,
        specialty: 'Plumbing',
        phone: '+1-555-100-2000',
      });

      await vendorsPage.goto();
      await vendorsPage.waitForVendorsLoaded();

      // On mobile, at least one card should be visible
      const cards = await vendorsPage.getCards();
      expect(cards.length).toBeGreaterThan(0);
    } finally {
      if (createdId) await deleteVendorViaApi(page, createdId);
    }
  });

  test('Desktop: table is visible (viewport >= 768px)', async ({ page, testPrefix }) => {
    const viewport = page.viewportSize();

    // Only run on desktop/tablet viewports
    if (!viewport || viewport.width < 768) {
      test.skip();
      return;
    }

    const vendorsPage = new VendorsPage(page);
    let createdId: string | null = null;

    try {
      createdId = await createVendorViaApi(page, {
        name: `${testPrefix} Desktop Table Vendor`,
      });

      await vendorsPage.goto();
      await vendorsPage.waitForVendorsLoaded();

      // The table container should be in the DOM and visible
      await expect(vendorsPage.tableContainer).toBeVisible();
    } finally {
      if (createdId) await deleteVendorViaApi(page, createdId);
    }
  });

  test('Create modal fields are usable on current viewport', async ({ page }) => {
    const vendorsPage = new VendorsPage(page);

    await vendorsPage.goto();
    await vendorsPage.waitForVendorsLoaded();
    await vendorsPage.openCreateModal();

    // All required form inputs visible
    await expect(vendorsPage.createNameInput).toBeVisible();
    await expect(vendorsPage.createSpecialtyInput).toBeVisible();
    await expect(vendorsPage.createPhoneInput).toBeVisible();
    await expect(vendorsPage.createEmailInput).toBeVisible();
    await expect(vendorsPage.createSubmitButton).toBeVisible();

    await vendorsPage.createCancelButton.click();
    await expect(vendorsPage.createModal).not.toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Dark mode rendering
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Dark mode rendering', { tag: '@responsive' }, () => {
  test('Vendors list page renders correctly in dark mode', async ({ page }) => {
    const vendorsPage = new VendorsPage(page);

    await page.goto('/budget/vendors');
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });

    await vendorsPage.heading.waitFor({ state: 'visible', timeout: 8000 });

    // Heading visible
    await expect(vendorsPage.heading).toBeVisible();

    // No horizontal scroll in dark mode
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(hasHorizontalScroll).toBe(false);
  });

  test('Add Vendor modal is usable in dark mode', async ({ page }) => {
    const vendorsPage = new VendorsPage(page);

    await page.goto('/budget/vendors');
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });

    await vendorsPage.heading.waitFor({ state: 'visible', timeout: 8000 });
    await vendorsPage.openCreateModal();

    // Modal inputs should be visible in dark mode
    await expect(vendorsPage.createNameInput).toBeVisible();
    await expect(vendorsPage.createSubmitButton).toBeVisible();

    await vendorsPage.createCancelButton.click();
    await expect(vendorsPage.createModal).not.toBeVisible();
  });

  test('Vendor detail page renders correctly in dark mode', async ({ page, testPrefix }) => {
    const detailPage = new VendorDetailPage(page);
    let createdId: string | null = null;

    try {
      createdId = await createVendorViaApi(page, {
        name: `${testPrefix} Dark Mode Detail Vendor`,
      });

      await page.goto(`/budget/vendors/${createdId}`);
      await page.evaluate(() => {
        document.documentElement.setAttribute('data-theme', 'dark');
      });

      await detailPage.pageTitle.waitFor({ state: 'visible', timeout: 8000 });

      await expect(detailPage.pageTitle).toBeVisible();
      await expect(detailPage.editButton).toBeVisible();
      await expect(detailPage.deleteButton).toBeVisible();

      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      expect(hasHorizontalScroll).toBe(false);
    } finally {
      if (createdId) await deleteVendorViaApi(page, createdId);
    }
  });

  test('Delete modal is usable in dark mode', async ({ page, testPrefix }) => {
    const vendorsPage = new VendorsPage(page);
    let createdId: string | null = null;
    const vendorName = `${testPrefix} Dark Mode Delete Vendor`;

    try {
      createdId = await createVendorViaApi(page, { name: vendorName });

      await page.goto('/budget/vendors');
      await page.evaluate(() => {
        document.documentElement.setAttribute('data-theme', 'dark');
      });

      await vendorsPage.heading.waitFor({ state: 'visible', timeout: 8000 });
      await vendorsPage.search(vendorName);

      await vendorsPage.openDeleteModal(vendorName);

      // Modal visible and usable
      await expect(vendorsPage.deleteModal).toBeVisible();
      await expect(vendorsPage.deleteConfirmButton).toBeVisible();
      await expect(vendorsPage.deleteCancelButton).toBeVisible();

      await vendorsPage.cancelDelete();
    } finally {
      if (createdId) await deleteVendorViaApi(page, createdId);
    }
  });
});
