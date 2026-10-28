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
 * - Scenario 5:  Company page (summary strip, tabs; the full page suite is companies/company-page.spec.ts)
 * - Scenario 6:  Edit company details (Overview cards)
 * - Scenario 8:  Delete - no references (list row menu and header menu)
 * - Scenario 9:  Delete blocked when invoices exist (409 via route mock)
 * - Scenario 11: No paging controls (batches of 100)
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

      // And: the one primary stays in the header (the template's empty state has no action)
      await expect(vendorsPage.newCompanyButton).toBeVisible();
      await expect(vendorsPage.emptyState.getByRole('button')).toHaveCount(0);

      // And: it opens the New company dialog
      await vendorsPage.newCompanyButton.click();
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

      // Then: the empty state says nothing matched and offers Clear filters
      await expect(vendorsPage.emptyState).toBeVisible();
      await expect(vendorsPage.emptyState).toContainText('No companies match.');
      await expect(
        vendorsPage.emptyState.getByRole('button', { name: 'Clear filters' }),
      ).toBeVisible();
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
      await expect(detailPage.detail('phone')).toContainText('555-0123');
      await expect(detailPage.detail('email')).toContainText('contact@example.com');
      await expect(detailPage.detail('address')).toHaveText('1 Sample Lane, Exampleville');
      await expect(detailPage.detail('notes')).toHaveText('Primary contractor for foundation work');

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

      // And: The page heading is the vendor name and the summary strip rendered
      await expect(detailPage.summary.root).toBeVisible();
      await expect(detailPage.pageTitle).toHaveText(vendorName);

      // And: All vendor fields are shown on the Overview cards
      await expect(detailPage.detail('name')).toHaveText(vendorName);
      await expect(detailPage.detail('phone')).toContainText('+1-555-111-2222');
      await expect(detailPage.detail('email')).toContainText('detail@e2e-test.example.com');
      await expect(detailPage.detail('address')).toHaveText('456 Pipe Lane, Springfield, IL');
      await expect(detailPage.detail('notes')).toHaveText('Handles all plumbing fixtures');
      // Trade shows "Not set" since none is assigned via the API
      await expect(detailPage.detail('trade')).toContainText('Not set');

      // And: The summary strip shows Still to pay 0.00 and no offers, tasks or visits yet
      await expect(detailPage.summary.fact('stillToPay')).toContainText(/0\.00/);
      await expect(detailPage.summary.fact('offers')).toContainText('None');

      // And: Payments shows the empty state (no invoices yet)
      await detailPage.tabs.select('payments');
      await expect(detailPage.paymentsEmpty).toBeVisible();
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

      // When: I navigate to its detail page and edit the Phone and e-mail card
      await detailPage.goto(createdId);
      await detailPage.startEdit('company-phone-email');
      await detailPage.phoneField.fill('+1-555-999-0000');
      await detailPage.saveCard('company-phone-email');

      // And: the About card (notes)
      await detailPage.startEdit('company-about');
      await detailPage.notesField.fill('Preferred for structural work');
      await detailPage.saveCard('company-about');

      // Then: The detail page shows the updated values
      await expect(detailPage.detail('phone')).toContainText('+1-555-999-0000');
      await expect(detailPage.detail('notes')).toHaveText('Preferred for structural work');

      // And: The changes persist on page reload
      await detailPage.goto(createdId);
      await expect(detailPage.detail('phone')).toContainText('+1-555-999-0000');
      await expect(detailPage.detail('notes')).toHaveText('Preferred for structural work');
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
      await detailPage.startEdit('company-phone-email');

      // Change the phone but discard
      await detailPage.phoneField.fill('+1-999-999-9999');
      await detailPage.discardCard('company-phone-email');

      // Then: The original phone is still shown
      await expect(detailPage.detail('phone')).toContainText('+1-555-777-8888');
    } finally {
      if (createdId) await deleteVendorViaApi(page, createdId);
    }
  });

  test('Edit — clearing the name is reported on the field and nothing is saved', async ({
    page,
    testPrefix,
  }) => {
    const detailPage = new VendorDetailPage(page);
    let createdId: string | null = null;

    try {
      createdId = await createVendorViaApi(page, {
        name: `${testPrefix} Save Guard Vendor`,
      });

      await detailPage.goto(createdId);
      await detailPage.startEdit('company-about');

      // Clear the name field and try to save
      await detailPage.nameField.fill('');
      await detailPage.cardSave('company-about').click();

      // Then: the card stays open with the field error
      await expect(detailPage.cardForm('company-about')).toContainText('Enter a name.');
      await expect(detailPage.nameField).toHaveAttribute('aria-invalid', 'true');

      // Cleanup: discard
      await detailPage.discardCard('company-about');
      await expect(detailPage.pageTitle).toHaveText(`${testPrefix} Save Guard Vendor`);
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
// Scenario 11: No paging controls (rows load in batches of 100, #2246)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('No paging controls (Scenario 11)', { tag: '@responsive' }, () => {
  test('A legacy ?page=2&pageSize=10 URL is dropped and the list renders', async ({ page }) => {
    const vendorsPage = new VendorsPage(page);

    await vendorsPage.goto({ page: 2, pageSize: 10 });
    await vendorsPage.waitForVendorsLoaded();

    await page.waitForURL(
      (url) => !url.searchParams.has('page') && !url.searchParams.has('pageSize'),
    );
    await expect(vendorsPage.olist.retryButton).toHaveCount(0);
    await expect(vendorsPage.heading).toBeVisible();
  });

  test('A single-batch list shows no "Showing n of m" footer', async ({ page }) => {
    const vendorsPage = new VendorsPage(page);

    // Mock a single-batch response
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
            pagination: { page: 1, pageSize: 100, totalItems: 1, totalPages: 1 },
            scopeTotal: 1,
          }),
        });
      } else {
        await route.continue();
      }
    });

    try {
      await vendorsPage.goto();
      await vendorsPage.waitForVendorsLoaded();

      await expect(vendorsPage.row('Solo Vendor')).toBeVisible();
      await expect(vendorsPage.olist.list.getByText(/^Showing \d+ of \d+$/)).toHaveCount(0);
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

      // Default columns: Name, Trade, Phone, Still to pay, Offers, Contact persons, Last on site
      // (E-mail, Address, Notes, Date added and Last updated are hidden by default), then the
      // row-actions column (its header is visually hidden text).
      await expect(vendorsPage.tableHeaders).toHaveText([
        /^Company/,
        /^Trade/,
        /^Phone/,
        /^Still to pay/,
        /^Offers/,
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
      await expect(detailPage.summary.root).toBeVisible();

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
    await expect(vendorsPage.heading).toHaveText(/^Companies \(\d+\)$/);

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
      await vendorsPage.waitForVendorsLoaded();
      await expect(vendorsPage.olist.tableSurface).toBeHidden();
      await expect(vendorsPage.row(`${testPrefix} Mobile Card Vendor`)).toBeVisible();
      await expect(vendorsPage.callLink(`${testPrefix} Mobile Card Vendor`)).toContainText(
        'Call +1-555-100-2000',
      );
    } finally {
      if (createdId) await deleteVendorViaApi(page, createdId);
    }
  });

  test('Desktop: table is visible (viewport >= 1024px)', async ({ page, testPrefix }) => {
    // The table/card switch follows the list's own width (768px container query), and the tablet
    // sidebar leaves a narrower list: only the desktop viewport always shows the table.
    const viewport = page.viewportSize();
    if (!viewport || viewport.width < 1024) {
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

      // The table surface should be in the DOM and visible
      await expect(vendorsPage.olist.tableSurface).toBeVisible();
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
      await expect(detailPage.summary.root).toBeVisible();
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
