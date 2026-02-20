/**
 * Page Object Model for the Vendors list page (/budget/vendors)
 *
 * The page renders:
 * - A page header with an "Add Vendor" button
 * - A search input and sort controls
 * - A data table (desktop) / card list (mobile) of vendors
 * - Pagination controls when totalPages > 1
 * - An "Add Vendor" modal (role="dialog", aria-labelledby="create-modal-title")
 * - A delete confirmation modal (role="dialog", aria-labelledby="delete-modal-title")
 * - An empty state when no vendors exist (or no search matches)
 */

import type { Page, Locator } from '@playwright/test';

export const VENDORS_ROUTE = '/budget/vendors';

export interface CreateVendorData {
  name: string;
  specialty?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
}

export class VendorsPage {
  readonly page: Page;

  // Page header
  readonly heading: Locator;
  readonly addVendorButton: Locator;

  // Search/sort bar
  readonly searchInput: Locator;
  readonly sortSelect: Locator;
  readonly sortOrderButton: Locator;

  // Error banner (outside modals)
  readonly errorBanner: Locator;

  // Empty state
  readonly emptyState: Locator;
  readonly emptyStateHeading: Locator;

  // Table (desktop view)
  readonly tableContainer: Locator;
  readonly tableBody: Locator;

  // Mobile cards container
  readonly cardsContainer: Locator;

  // Pagination
  readonly pagination: Locator;
  readonly paginationInfo: Locator;
  readonly prevPageButton: Locator;
  readonly nextPageButton: Locator;

  // Create (Add Vendor) modal
  readonly createModal: Locator;
  readonly createModalTitle: Locator;
  readonly createNameInput: Locator;
  readonly createSpecialtyInput: Locator;
  readonly createPhoneInput: Locator;
  readonly createEmailInput: Locator;
  readonly createAddressInput: Locator;
  readonly createNotesInput: Locator;
  readonly createSubmitButton: Locator;
  readonly createCancelButton: Locator;
  readonly createErrorBanner: Locator;

  // Delete confirmation modal
  readonly deleteModal: Locator;
  readonly deleteModalTitle: Locator;
  readonly deleteConfirmButton: Locator;
  readonly deleteCancelButton: Locator;
  readonly deleteErrorBanner: Locator;

  constructor(page: Page) {
    this.page = page;

    // Page header
    this.heading = page.getByRole('heading', { level: 1, name: 'Vendors', exact: true });
    this.addVendorButton = page.getByRole('button', { name: 'Add Vendor', exact: true });

    // Search / sort
    this.searchInput = page.getByLabel('Search vendors');
    this.sortSelect = page.locator('#sort-select');
    this.sortOrderButton = page.getByLabel('Toggle sort order');

    // Error banner outside modals
    this.errorBanner = page
      .locator('[role="alert"]')
      .filter({ hasText: /failed|error/i })
      .first();

    // Empty state
    this.emptyState = page.locator('[class*="emptyState"]');
    this.emptyStateHeading = this.emptyState.getByRole('heading');

    // Table (desktop)
    this.tableContainer = page.locator('[class*="tableContainer"]');
    this.tableBody = this.tableContainer.locator('tbody');

    // Mobile cards
    this.cardsContainer = page.locator('[class*="cardsContainer"]');

    // Pagination
    this.pagination = page.locator('[class*="pagination"]');
    this.paginationInfo = page.locator('[class*="paginationInfo"]');
    this.prevPageButton = page.getByLabel('Previous page');
    this.nextPageButton = page.getByLabel('Next page');

    // Create modal
    this.createModal = page.getByRole('dialog', { name: 'Add Vendor' });
    this.createModalTitle = page.locator('#create-modal-title');
    this.createNameInput = this.createModal.locator('#vendor-name');
    this.createSpecialtyInput = this.createModal.locator('#vendor-specialty');
    this.createPhoneInput = this.createModal.locator('#vendor-phone');
    this.createEmailInput = this.createModal.locator('#vendor-email');
    this.createAddressInput = this.createModal.locator('#vendor-address');
    this.createNotesInput = this.createModal.locator('#vendor-notes');
    this.createSubmitButton = this.createModal.getByRole('button', {
      name: /Add Vendor|Adding\.\.\./,
    });
    this.createCancelButton = this.createModal.getByRole('button', { name: 'Cancel', exact: true });
    this.createErrorBanner = this.createModal.locator('[role="alert"]');

    // Delete modal
    this.deleteModal = page.getByRole('dialog', { name: 'Delete Vendor' });
    this.deleteModalTitle = page.locator('#delete-modal-title');
    this.deleteConfirmButton = this.deleteModal.getByRole('button', {
      name: /Delete Vendor|Deleting\.\.\./,
    });
    this.deleteCancelButton = this.deleteModal.getByRole('button', {
      name: 'Cancel',
      exact: true,
    });
    this.deleteErrorBanner = this.deleteModal.locator('[role="alert"]');
  }

  async goto(): Promise<void> {
    await this.page.goto(VENDORS_ROUTE);
    // Wait for either the heading (data loaded) or the loading indicator to clear
    await this.heading.waitFor({ state: 'visible', timeout: 15000 });
  }

  /**
   * Open the Add Vendor modal.
   */
  async openCreateModal(): Promise<void> {
    await this.addVendorButton.click();
    await this.createModal.waitFor({ state: 'visible', timeout: 5000 });
  }

  /**
   * Fill and submit the create vendor form.
   * Only name is required; other fields are optional.
   */
  async createVendor(data: CreateVendorData): Promise<void> {
    await this.createNameInput.fill(data.name);
    if (data.specialty !== undefined) {
      await this.createSpecialtyInput.fill(data.specialty);
    }
    if (data.phone !== undefined) {
      await this.createPhoneInput.fill(data.phone);
    }
    if (data.email !== undefined) {
      await this.createEmailInput.fill(data.email);
    }
    if (data.address !== undefined) {
      await this.createAddressInput.fill(data.address);
    }
    if (data.notes !== undefined) {
      await this.createNotesInput.fill(data.notes);
    }
    await this.createSubmitButton.click();
  }

  /**
   * Get all table row locators in the vendor table (desktop view).
   */
  async getTableRows(): Promise<Locator[]> {
    return this.tableBody.locator('tr').all();
  }

  /**
   * Get all card locators (mobile view).
   */
  async getCards(): Promise<Locator[]> {
    return this.cardsContainer.locator('[class*="card"]').all();
  }

  /**
   * Find the table row for the named vendor. Returns null if not found.
   * Uses the vendor link inside the name cell (aria-accessible text).
   */
  async getTableRowByName(vendorName: string): Promise<Locator | null> {
    try {
      await this.tableBody.locator('tr').first().waitFor({ state: 'visible', timeout: 10000 });
    } catch {
      return null;
    }
    const rows = await this.getTableRows();
    for (const row of rows) {
      const link = row.locator('[class*="vendorLink"]');
      const text = await link.textContent();
      if (text?.trim() === vendorName) {
        return row;
      }
    }
    return null;
  }

  /**
   * Get the names of all vendors currently shown in the table (desktop) or cards (mobile).
   * Falls back to reading card names if the table body has no rows.
   */
  async getVendorNames(): Promise<string[]> {
    const rows = await this.getTableRows();
    if (rows.length > 0) {
      const names: string[] = [];
      for (const row of rows) {
        const link = row.locator('[class*="vendorLink"]');
        const text = await link.textContent();
        if (text) names.push(text.trim());
      }
      return names;
    }

    // Mobile fallback: card name links
    const cardNames = await this.cardsContainer.locator('[class*="cardName"]').all();
    const names: string[] = [];
    for (const nameEl of cardNames) {
      const text = await nameEl.textContent();
      if (text) names.push(text.trim());
    }
    return names;
  }

  /**
   * Click the "View" button for a vendor row (by name) to navigate to its detail page.
   * For the table, the View button has aria-label="View <name>".
   */
  async clickView(vendorName: string): Promise<void> {
    await this.page.getByRole('link', { name: vendorName }).first().click();
  }

  /**
   * Open the delete modal for the named vendor.
   * Uses the aria-label="Delete <name>" button in the table row.
   */
  async openDeleteModal(vendorName: string): Promise<void> {
    await this.page
      .getByRole('button', { name: `Delete ${vendorName}` })
      .first()
      .click();
    await this.deleteModal.waitFor({ state: 'visible', timeout: 5000 });
  }

  /**
   * Confirm vendor deletion in the delete modal.
   */
  async confirmDelete(): Promise<void> {
    await this.deleteConfirmButton.click();
  }

  /**
   * Cancel the delete modal.
   */
  async cancelDelete(): Promise<void> {
    await this.deleteCancelButton.click();
    await this.deleteModal.waitFor({ state: 'hidden', timeout: 5000 });
  }

  /**
   * Type into the search field and wait for debounce (300ms + network).
   */
  async search(query: string): Promise<void> {
    await this.searchInput.fill(query);
    // Wait for the debounced request to complete (300ms debounce + render)
    await this.page.waitForTimeout(400);
    // Wait for list to update — either rows visible or empty state
    await Promise.race([
      this.tableBody.locator('tr').first().waitFor({ state: 'visible', timeout: 10000 }),
      this.emptyState.waitFor({ state: 'visible', timeout: 10000 }),
    ]).catch(() => {
      // If neither appears within timeout, proceed — the test assertion will catch it
    });
  }

  /**
   * Clear the search input.
   */
  async clearSearch(): Promise<void> {
    await this.searchInput.clear();
    await this.page.waitForTimeout(400);
  }

  /**
   * Wait for vendor list to load (at least one row visible or empty state).
   */
  async waitForVendorsLoaded(): Promise<void> {
    await Promise.race([
      this.tableBody.locator('tr').first().waitFor({ state: 'visible', timeout: 15000 }),
      this.emptyState.waitFor({ state: 'visible', timeout: 15000 }),
    ]);
  }

  /**
   * Get the create error banner text, or null if not visible.
   */
  async getCreateErrorText(): Promise<string | null> {
    try {
      await this.createErrorBanner.waitFor({ state: 'visible', timeout: 5000 });
      return await this.createErrorBanner.textContent();
    } catch {
      return null;
    }
  }

  /**
   * Get the delete modal error banner text, or null if not visible.
   */
  async getDeleteErrorText(): Promise<string | null> {
    try {
      await this.deleteErrorBanner.waitFor({ state: 'visible', timeout: 5000 });
      return await this.deleteErrorBanner.textContent();
    } catch {
      return null;
    }
  }
}
