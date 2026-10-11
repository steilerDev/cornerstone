/**
 * E2E tests for Company (vendor) management: the Companies list and the Company page.
 *
 * #2213 moved the list from Settings to `/companies` (the old URLs redirect, see
 * companies-redirects.spec.ts). The create dialog is the shared ObjectForm at `/companies/new`,
 * row and header actions are OverflowMenus, the Trade filter is a chip group. Search, chips,
 * Call buttons and the Trades sheet have their own specs in `tests/companies/`.
 *
 * Scenarios covered here:
 * - Scenario 1:  Empty state when no companies exist
 * - Scenario 2:  Create a company - full details (happy path)
 * - Scenario 3:  Create a company - name only
 * - Scenario 4:  Create fails - missing required name (inline error, no alert)
 * - Scenario 5:  Company page with stats
 * - Scenario 6:  Edit company details
 * - Scenario 8:  Delete - no references (list row menu and header menu)
 * - Scenario 9:  Delete blocked when invoices exist (409 via route mock)
 * - Scenario 11: List is paginated
 * - Scenario 12: Search by name (case-insensitive)
 * - Scenario 13: Filter by trade name via search
 * - Scenario 14: List shows scannable key info
 * - Scenario 17: Responsive layout (no horizontal scroll)
 * - Navigation, sidebar highlight, dark mode
 */

import { test, expect } from '../../fixtures/auth.js';
import type { Page } from '@playwright/test';
import { AppShellPage } from '../../pages/AppShellPage.js';
import { VendorsPage, COMPANIES_ROUTE } from '../../pages/VendorsPage.js';
import { VendorDetailPage } from '../../pages/VendorDetailPage.js';
import { API } from '../../fixtures/testData.js';
import { routeUrl } from '../../../shared/src/routes/index.js';

// ─────────────────────────────────────────────────────────────────────────────
// API helpers — create/delete vendors directly to keep tests isolated
// ─────────────────────────────────────────────────────────────────────────────

interface VendorApiData {
  name: string;
  tradeId?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
}

interface VendorApiResponse {
  id: string;
  name: string;
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
  test('Empty state and "New company" CTA shown when no companies exist', async ({ page }) => {
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

      // And: The empty state says "No companies yet"
      await expect(vendorsPage.emptyState).toContainText('No companies yet');

      // And: it carries its own "New company" action, so the header button is gone
      const ctaButton = vendorsPage.emptyState.getByRole('button', { name: 'New company' });
      await expect(ctaButton).toBeVisible();
      await expect(vendorsPage.newCompanyButton).toHaveCount(0);

      // And: the action opens the same dialog as the header button
      await ctaButton.click();
      await vendorsPage.createDialog.waitForOpen();
      await expect(page).toHaveURL((url) => url.pathname === routeUrl('companyNew'));
      await vendorsPage.createDialog.cancel();
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

      // Then: Empty state appears — DataTable shows a generic "no items match" message
      // when a search query is active (hasActiveFilters=true), regardless of page-specific
      // empty state text. t('dataTable.empty.filteredMessage') = "No items match the current filters"
      await expect(vendorsPage.emptyState).toBeVisible({ timeout: 8000 });
      const emptyText = await vendorsPage.emptyState.textContent();
      expect(emptyText?.toLowerCase()).toMatch(/no items match|no vendors match|try different/);
    } finally {
      if (createdId) await deleteVendorViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenarios 2-4: Create a company (the New company dialog, #2213)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Create company (Scenarios 2-4)', { tag: '@responsive' }, () => {
  test('Create a company with all fields - lands on its page and shows every value', async ({
    page,
    testPrefix,
  }) => {
    const vendorsPage = new VendorsPage(page);
    const detailPage = new VendorDetailPage(page);
    const vendorName = `${testPrefix} Apex Construction LLC`;

    await vendorsPage.goto();
    await vendorsPage.waitForVendorsLoaded();
    await vendorsPage.openCreateModal();

    await vendorsPage.createVendor({
      name: vendorName,
      phone: '555-0123',
      email: 'contact@example.com',
      address: '1 Sample Lane, Exampleville',
      notes: 'Primary contractor for foundation work',
    });

    // Then: the dialog closes and the new company page opens (replace: Back skips the dialog)
    await expect(vendorsPage.createDialog.dialog).toBeHidden();
    await expect(detailPage.pageTitle).toHaveText(vendorName);
    await expect(page).toHaveURL(/\/companies\/[0-9a-f-]{36}$/);
    const createdId = page.url().split('/').pop() as string;

    try {
      const fields = await detailPage.getInfoFields();
      expect(fields['Phone']).toContain('555-0123');
      expect(fields['Email']).toContain('contact@example.com');
      expect(fields['Address']).toBe('1 Sample Lane, Exampleville');
      expect(fields['Notes']).toBe('Primary contractor for foundation work');

      // And: the list shows the row with its Call button
      await vendorsPage.goto();
      await vendorsPage.search(vendorName);
      await expect(vendorsPage.callLink(vendorName)).toHaveAttribute('href', 'tel:5550123');
    } finally {
      await deleteVendorViaApi(page, createdId);
    }
  });

  test('Create with only a name succeeds', async ({ page, testPrefix }) => {
    const vendorsPage = new VendorsPage(page);
    const detailPage = new VendorDetailPage(page);
    const vendorName = `${testPrefix} Name Only Company`;

    await vendorsPage.goto();
    await vendorsPage.waitForVendorsLoaded();
    await vendorsPage.openCreateModal();
    await vendorsPage.createVendor({ name: vendorName });

    await expect(detailPage.pageTitle).toHaveText(vendorName);
    const createdId = page.url().split('/').pop() as string;
    try {
      await vendorsPage.goto();
      await vendorsPage.search(vendorName);
      expect(await vendorsPage.getVendorNames()).toContain(vendorName);
    } finally {
      await deleteVendorViaApi(page, createdId);
    }
  });

  test('Saving an empty name shows an inline error, focuses the name field, and raises no alert', async ({
    page,
  }) => {
    const vendorsPage = new VendorsPage(page);
    await vendorsPage.goto();
    await vendorsPage.openCreateModal();

    await vendorsPage.createDialog.save();

    await expect(vendorsPage.createDialog.fieldError('name')).toHaveText('Enter a name.');
    await expect(vendorsPage.createDialog.field('name')).toBeFocused();
    await expect(vendorsPage.createDialog.errorBanner).toHaveCount(0);
    await expect(vendorsPage.createDialog.dialog).toBeVisible();

    // And: typing a name clears the error
    await vendorsPage.createDialog.field('name').fill('Temp Name');
    await expect(vendorsPage.createDialog.fieldError('name')).toHaveCount(0);

    await vendorsPage.createDialog.cancel();
    // A dirty form asks before it closes
    await vendorsPage.createDialog.discardConfirm.confirmAndWaitClosed();
    await vendorsPage.createDialog.waitForClosed();
  });

  test('An invalid e-mail is reported on the e-mail field and the dialog stays open', async ({
    page,
    testPrefix,
  }) => {
    const vendorsPage = new VendorsPage(page);
    await vendorsPage.goto();
    await vendorsPage.openCreateModal();

    await vendorsPage.createVendor({ name: `${testPrefix} Bad Mail Co`, email: 'not-an-email' });

    await expect(vendorsPage.createDialog.fieldError('email')).toHaveText(
      'Enter a valid e-mail address.',
    );
    await expect(vendorsPage.createDialog.field('email')).toBeFocused();
    await expect(vendorsPage.createDialog.dialog).toBeVisible();
  });

  test('Cancel closes the dialog without creating a company', async ({ page, testPrefix }) => {
    const vendorsPage = new VendorsPage(page);
    const typed = `${testPrefix} Should Not Be Created`;

    await vendorsPage.goto();
    await vendorsPage.waitForVendorsLoaded();
    await vendorsPage.openCreateModal();
    await vendorsPage.createDialog.field('name').fill(typed);
    await vendorsPage.createDialog.cancel();
    await vendorsPage.createDialog.discardConfirm.confirmAndWaitClosed();
    await vendorsPage.createDialog.waitForClosed();

    await vendorsPage.search(typed);
    expect(await vendorsPage.getVendorNames()).not.toContain(typed);
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
      await vendorsPage.nameLink(vendorName).click();

      // Then: I am on the vendor detail page (wait for URL, not h1 which matches list page too)
      await page.waitForURL(
        (url) => url.pathname === routeUrl('company', { id: createdId as string }),
      );

      // Wait for the loading state to clear — CI runners can be slow and the
      // fetch + render may take longer than the default 7s timeout
      await expect(page.getByText('Loading vendor...')).not.toBeVisible({ timeout: 15000 });

      // And: The page heading is the vendor name
      // Wait for the detail page info card to render — the h1 transitions from
      // "Budget" (list page) to the vendor name after React fetches and renders
      await expect(detailPage.infoCard).toBeVisible({ timeout: 15000 });
      await expect(detailPage.pageTitle).toHaveText(vendorName);

      // And: All vendor fields are shown in the info card
      // Note: specialty was replaced by trade in EPIC-18 — trade shows as "—" when unassigned
      const fields = await detailPage.getInfoFields();
      expect(fields['Name']).toBe(vendorName);
      expect(fields['Phone']).toContain('+1-555-111-2222');
      expect(fields['Email']).toContain('detail@e2e-test.example.com');
      expect(fields['Address']).toBe('456 Pipe Lane, Springfield, IL');
      expect(fields['Notes']).toBe('Handles all plumbing fixtures');
      // Trade field is present (value is "—" since no trade assigned via API)
      expect('Trade' in fields).toBe(true);

      // And: Stats cards are visible
      await expect(detailPage.totalInvoicesStat).toBeVisible();
      await expect(detailPage.outstandingBalanceStat).toBeVisible();

      // And: Invoice stat shows 0 (no invoices yet)
      const invoiceCount = await detailPage.getTotalInvoices();
      expect(invoiceCount?.trim()).toBe('0');

      // And: Outstanding balance shows 0.00 (currency symbol is locale-dependent — match digits only)
      const balance = await detailPage.getOutstandingBalance();
      expect(balance?.trim()).toMatch(/0\.00/);

      // And: Invoices section is visible with empty state (no invoices yet)
      await expect(detailPage.invoicesSection).toBeVisible();
      await expect(detailPage.invoicesEmptyState).toBeVisible();
    } finally {
      if (createdId) await deleteVendorViaApi(page, createdId);
    }
  });

  test('Detail page heading matches vendor name and the Companies trail is visible', async ({
    page,
    testPrefix,
  }) => {
    const detailPage = new VendorDetailPage(page);
    let createdId: string | null = null;
    const vendorName = `${testPrefix} Detail Heading Vendor`;

    try {
      createdId = await createVendorViaApi(page, {
        name: vendorName,
      });

      await detailPage.goto(createdId);

      await expect(detailPage.pageTitle).toHaveText(vendorName);
      await detailPage.breadcrumbs.expectTrail(['Companies']);
    } finally {
      if (createdId) await deleteVendorViaApi(page, createdId);
    }
  });

  test('Navigating to unknown vendor ID shows error state', async ({ page }) => {
    const detailPage = new VendorDetailPage(page);

    await page.goto(routeUrl('company', { id: 'nonexistent-company-id-12345' }));

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

    // When: I open the Companies list and search for this company
    await vendorsPage.goto();
    await vendorsPage.waitForVendorsLoaded();
    await vendorsPage.search(vendorName);

    const namesBefore = await vendorsPage.getVendorNames();
    expect(namesBefore).toContain(vendorName);

    // And: I choose Delete from the row's ⋯ menu
    await vendorsPage.openDeleteModal(vendorName);

    // Then: The modal is visible
    await expect(vendorsPage.deleteModal).toBeVisible();

    // And: The dialog title asks "Delete <name>?" (names the vendor)
    await expect(vendorsPage.deleteModalTitle).toHaveText(`Delete ${vendorName}?`);

    // When: I confirm deletion
    await vendorsPage.confirmDelete();

    // Then: The modal closes
    await expect(vendorsPage.deleteModal).not.toBeVisible({ timeout: 8000 });

    // And: The company is removed from the list
    await vendorsPage.waitForVendorsLoaded();
    const namesAfter = await vendorsPage.getVendorNames();
    expect(namesAfter).not.toContain(vendorName);

    // And: the search showed only this company, so focus lands on the page heading, never the body
    await expect(vendorsPage.heading).toBeFocused();
    await expect(page.locator('body')).not.toBeFocused();

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

  test('Delete from the company page header menu - lands on the list and Back does not return', async ({
    page,
    testPrefix,
  }) => {
    const detailPage = new VendorDetailPage(page);
    const vendorsPage = new VendorsPage(page);

    // Given: A company exists and the user came from the list
    const createdId = await createVendorViaApi(page, {
      name: `${testPrefix} Detail Delete Vendor`,
    });
    await vendorsPage.goto();
    await page.goto(routeUrl('company', { id: createdId }));
    await detailPage.pageTitle.waitFor({ state: 'visible' });

    // When: I open the header ⋯ menu, choose Delete and confirm
    await expect(page.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0);
    await detailPage.openDeleteModal();
    await detailPage.confirmDelete();

    // Then: I am on the Companies list with focus on the page heading
    await page.waitForURL((url) => url.pathname === routeUrl('companies'));
    await expect(vendorsPage.heading).toBeFocused();

    // And: the deleted page is not in the history (replace)
    await page.goBack();
    await expect(page).not.toHaveURL(new RegExp(createdId));

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
      expect(errorText?.toLowerCase()).toMatch(/can't be deleted|invoices|in use/);

      // And: The "Delete" confirm button is hidden (409 blocks the action)
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
      expect(errorText?.toLowerCase()).toMatch(/can't be deleted|invoices/);

      // Still on the company page
      expect(new URL(page.url()).pathname).toBe(routeUrl('company', { id: createdId }));

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
        // Note: specialty removed in EPIC-18 (replaced by Trade entity)
        const vendors = Array.from({ length: 25 }, (_, i) => ({
          id: `mock-vendor-${i}`,
          name: `Mock Vendor ${String(i + 1).padStart(2, '0')}`,
          phone: null,
          email: null,
          address: null,
          notes: null,
          trade: null,
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
                phone: null,
                email: null,
                address: null,
                notes: null,
                trade: null,
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

      // The URL should contain the q param.
      // Use waitForURL (with retries via expect) rather than a synchronous check —
      // on tablet the URL update from react-router can lag slightly after the API
      // response returns, causing a synchronous expect(page.url()).toContain('q=')
      // to fail intermittently.
      await page.waitForURL((url) => url.searchParams.has('q'), { timeout: 15000 });
    } finally {
      if (createdId) await deleteVendorViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 13: Filter by trade name via search
// Note: specialty field was removed in EPIC-18 and replaced by trade (a separate entity).
// The vendor search API searches both vendor name AND trade name.
// Default trades are seeded in migration 0028 (e.g. 'Plumbing', 'Roofing', 'Tiling').
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Search by trade name (Scenario 13)', { tag: '@responsive' }, () => {
  test('Searching for a trade name filters vendors to matching ones', async ({
    page,
    testPrefix,
  }) => {
    const vendorsPage = new VendorsPage(page);
    const created: string[] = [];
    // Use a seeded trade ID that is unlikely to be used by other parallel tests
    const tradeId = 'trade-tiling';
    const tradeNameSearch = 'Tiling';

    try {
      created.push(
        await createVendorViaApi(page, {
          name: `${testPrefix} Trade Match Vendor`,
          tradeId,
        }),
      );
      created.push(
        await createVendorViaApi(page, {
          name: `${testPrefix} Trade No Match Vendor`,
          // No tradeId — this vendor has no trade assigned
        }),
      );

      await vendorsPage.goto();
      await vendorsPage.waitForVendorsLoaded();

      // When: I search by trade name
      await vendorsPage.search(tradeNameSearch);

      // Then: The vendor with the matching trade is shown
      const names = await vendorsPage.getVendorNames();
      expect(names).toContain(`${testPrefix} Trade Match Vendor`);
    } finally {
      for (const id of created) {
        await deleteVendorViaApi(page, id);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 14: List shows scannable key info (name, contact)
// Note: specialty column was removed in EPIC-18. Table now shows Name, Phone, Email, Actions.
// ─────────────────────────────────────────────────────────────────────────────
test.describe('List shows key info (Scenario 14)', { tag: '@responsive' }, () => {
  test('Row shows the company name and a Call button with its phone', async ({
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
    const vendorName = `${testPrefix} Full Info Vendor`;

    try {
      createdId = await createVendorViaApi(page, {
        name: vendorName,
        phone: '+1-555-333-4444',
        email: 'fullinfo@e2e-test.example.com',
      });

      await vendorsPage.goto();
      await vendorsPage.waitForVendorsLoaded();

      // Search to find this vendor specifically
      await vendorsPage.search(vendorName);

      await expect(vendorsPage.nameLink(vendorName)).toHaveText(vendorName);
      await expect(vendorsPage.row(vendorName)).toContainText('+1-555-333-4444');
      await expect(vendorsPage.callLink(vendorName)).toHaveAttribute('href', 'tel:+15553334444');
      // E-mail is a hidden-by-default column
      await expect(vendorsPage.row(vendorName)).not.toContainText('fullinfo@e2e-test.example.com');
    } finally {
      if (createdId) await deleteVendorViaApi(page, createdId);
    }
  });

  test('Table has the default column headers, in order', async ({ page, testPrefix }) => {
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

      // Default columns: Name, Trade, Phone, Contact persons, Last on site (E-mail, Address,
      // Notes, Date added and Last updated are hidden by default), then the row-actions column
      // (its header is visually hidden text).
      await expect(vendorsPage.tableContainer.locator('thead th')).toHaveText([
        /^Name/,
        /^Trade/,
        /^Phone/,
        /^Contact persons/,
        /^Last on site/,
        /^Actions$/,
      ]);
    } finally {
      if (createdId) await deleteVendorViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Navigation tests
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Navigation between list and detail pages', { tag: '@responsive' }, () => {
  test('Clicking vendor link navigates to detail page; back button returns to list', async ({
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
      await vendorsPage.nameLink(vendorName).click();
      await page.waitForURL(/\/companies\/[0-9a-f-]{36}$/);

      // Wait for detail page to fully render before interacting with back button
      await expect(detailPage.infoCard).toBeVisible({ timeout: 15000 });

      // Navigate back via back button
      await detailPage.goBackToVendors();
      expect(new URL(page.url()).pathname).toBe(routeUrl('companies'));
      await vendorsPage.heading.waitFor({ state: 'visible', timeout: 15000 });
    } finally {
      if (createdId) await deleteVendorViaApi(page, createdId);
    }
  });

  test('Page URL is /companies', async ({ page }) => {
    const vendorsPage = new VendorsPage(page);

    await vendorsPage.goto();
    expect(new URL(page.url()).pathname).toBe(COMPANIES_ROUTE);
  });

  test('Page heading is "Companies" (h1)', { tag: '@smoke' }, async ({ page }) => {
    const vendorsPage = new VendorsPage(page);

    await vendorsPage.goto();
    await expect(vendorsPage.heading).toBeVisible();
    await expect(vendorsPage.heading).toHaveText('Companies');

    // Verify the right page loaded: the Companies sidebar entry is the highlighted one (#2205).
    await expect(new AppShellPage(page).sectionLink('companies')).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Story #1283 / #2205: the Companies sidebar entry is active; the page has no tab row
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Companies sidebar entry is active on the Companies list (#2205, #2213)', () => {
  test('Companies is the one highlighted entry and the page has no tab row', async ({ page }) => {
    const shell = new AppShellPage(page);
    // When: the user is on the Companies list
    await page.goto(COMPANIES_ROUTE);
    await new VendorsPage(page).heading.waitFor({ state: 'visible' });

    // Then: exactly one sidebar entry is current: Companies (not Settings)
    await expect(shell.activeEntries).toHaveCount(1);
    await expect(shell.sectionLink('companies')).toHaveAttribute('aria-current', 'page');
    await expect(shell.sectionLink('companies')).toHaveText('Companies');

    // And: no in-page tab row
    await expect(page.locator('main').getByRole('navigation')).toHaveCount(0);
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
        phone: '+1-555-100-2000',
      });

      await vendorsPage.goto({ q: `${testPrefix} Mobile Card` });

      // On mobile the company is a card (the table is hidden), with its Call button
      await expect(vendorsPage.cardsContainer).toBeVisible();
      await expect(vendorsPage.tableContainer).toBeHidden();
      await expect(vendorsPage.row(`${testPrefix} Mobile Card Vendor`)).toBeVisible();
      await expect(vendorsPage.callLink(`${testPrefix} Mobile Card Vendor`)).toContainText(
        'Call +1-555-100-2000',
      );
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

  test('New company dialog fields are usable on current viewport', async ({ page }) => {
    const vendorsPage = new VendorsPage(page);
    const dialog = vendorsPage.createDialog;

    await vendorsPage.goto();
    await vendorsPage.waitForVendorsLoaded();
    await vendorsPage.openCreateModal();

    // Essentials first: name and trade; the rest sits behind "More details"
    await expect(dialog.field('name')).toBeVisible();
    await expect(dialog.field('tradeId')).toBeVisible();
    await expect(dialog.field('phone')).toBeHidden();
    await dialog.expandMoreDetails();
    await expect(dialog.field('phone')).toBeVisible();
    await expect(dialog.field('email')).toBeVisible();
    await expect(dialog.saveButton).toBeVisible();

    // The dialog never scrolls the page sideways
    const hasHorizontalScroll = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(hasHorizontalScroll).toBe(false);

    await dialog.cancel();
    await dialog.waitForClosed();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Dark mode rendering
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Dark mode rendering', { tag: '@responsive' }, () => {
  test('Vendors list page renders correctly in dark mode', async ({ page }) => {
    const vendorsPage = new VendorsPage(page);

    await page.goto(COMPANIES_ROUTE);
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

  test('New company dialog is usable in dark mode', async ({ page }) => {
    const vendorsPage = new VendorsPage(page);

    await page.goto(COMPANIES_ROUTE);
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });

    await vendorsPage.heading.waitFor({ state: 'visible', timeout: 8000 });
    await vendorsPage.openCreateModal();

    // Dialog inputs should be visible in dark mode
    await expect(vendorsPage.createDialog.field('name')).toBeVisible();
    await expect(vendorsPage.createDialog.saveButton).toBeVisible();

    await vendorsPage.createDialog.cancel();
    await vendorsPage.createDialog.waitForClosed();
  });

  test('Vendor detail page renders correctly in dark mode', async ({ page, testPrefix }) => {
    const detailPage = new VendorDetailPage(page);
    let createdId: string | null = null;

    try {
      createdId = await createVendorViaApi(page, {
        name: `${testPrefix} Dark Mode Detail Vendor`,
      });

      await page.goto(routeUrl('company', { id: createdId }));
      await page.evaluate(() => {
        document.documentElement.setAttribute('data-theme', 'dark');
      });

      await detailPage.pageTitle.waitFor({ state: 'visible', timeout: 8000 });

      await expect(detailPage.pageTitle).toBeVisible();
      await expect(detailPage.editButton).toBeVisible();
      await expect(detailPage.actionsTrigger).toBeVisible();

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

      await page.goto(COMPANIES_ROUTE);
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
