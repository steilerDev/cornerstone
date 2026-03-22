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
  readonly createPhoneInput: Locator;
  readonly createEmailInput: Locator;
  readonly createAddressInput: Locator;
  readonly createNotesInput: Locator;
  readonly createTradeSelect: Locator;
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
    this.heading = page.getByRole('heading', { level: 1, name: 'Budget', exact: true });
    this.addVendorButton = page.getByRole('button', { name: 'Add Vendor', exact: true });

    // Search / sort
    // DataTable renders a generic search input with aria-label="Search items" for all pages.
    this.searchInput = page.getByLabel('Search items');
    // DataTable sorting is column-header-based — no standalone sort select or order toggle button.
    // Sorting is triggered by clicking a sortable column header (th) in the table.
    // These locators are kept for API compatibility but point to the column settings button
    // which is the only sort-related toolbar element in DataTable.
    this.sortSelect = page.getByLabel('Column settings');
    this.sortOrderButton = page.getByLabel('Column settings');

    // Error banner outside modals
    this.errorBanner = page
      .locator('[role="alert"]')
      .filter({ hasText: /failed|error/i })
      .first();

    // Empty state — use .first() to avoid strict mode: child elements such as
    // emptyStateTitle/emptyStateDescription also contain "emptyState" in their class names.
    this.emptyState = page.locator('[class*="emptyState"]').first();
    this.emptyStateHeading = this.emptyState.getByRole('heading');

    // Table (desktop)
    this.tableContainer = page.locator('[class*="tableContainer"]');
    this.tableBody = this.tableContainer.locator('tbody');

    // Mobile cards
    this.cardsContainer = page.locator('[class*="cardsContainer"]');

    // Pagination — use `.first()` because `[class*="pagination"]` matches the
    // outer container plus child elements (paginationInfo, paginationButton, etc.)
    // which causes strict mode violations in production CSS Modules.
    this.pagination = page.locator('[class*="pagination"]').first();
    this.paginationInfo = page.locator('[class*="paginationInfo"]');
    // DataTable pagination uses aria-label from common.json: "Previous" and "Next"
    this.prevPageButton = page.getByLabel('Previous');
    this.nextPageButton = page.getByLabel('Next');

    // Create modal — Modal uses useId() for its title, so no stable #id selector.
    // Match by accessible name (title text) using getByRole.
    this.createModal = page.getByRole('dialog', { name: 'Add Vendor' });
    // createModalTitle: the <h2> inside the create modal
    this.createModalTitle = this.createModal.getByRole('heading', { level: 2 });
    this.createNameInput = this.createModal.locator('#vendor-name');
    this.createPhoneInput = this.createModal.locator('#vendor-phone');
    this.createEmailInput = this.createModal.locator('#vendor-email');
    this.createAddressInput = this.createModal.locator('#vendor-address');
    this.createNotesInput = this.createModal.locator('#vendor-notes');
    this.createTradeSelect = this.createModal.getByPlaceholder('Select a trade...');
    this.createSubmitButton = this.createModal.getByRole('button', {
      name: /Add Vendor|Adding\.\.\./,
    });
    this.createCancelButton = this.createModal.getByRole('button', { name: 'Cancel', exact: true });
    this.createErrorBanner = this.createModal.locator('[role="alert"]');

    // Delete modal — Modal uses useId() for its title, so no stable #id selector.
    this.deleteModal = page.getByRole('dialog', { name: 'Delete Vendor' });
    // deleteModalTitle: the <h2> inside the delete modal
    this.deleteModalTitle = this.deleteModal.getByRole('heading', { level: 2 });
    // i18n: button label is now just "Delete" / "Deleting..." (not "Delete Vendor")
    // See budget.json vendors.buttons.delete = "Delete"
    this.deleteConfirmButton = this.deleteModal.getByRole('button', {
      name: /^Delete$|Deleting\.\.\./,
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
    await this.heading.waitFor({ state: 'visible' });
  }

  /**
   * Open the Add Vendor modal.
   */
  async openCreateModal(): Promise<void> {
    await this.addVendorButton.click();
    await this.createModal.waitFor({ state: 'visible' });
  }

  /**
   * Fill and submit the create vendor form.
   * Only name is required; other fields are optional.
   */
  async createVendor(data: CreateVendorData): Promise<void> {
    await this.createNameInput.fill(data.name);
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
      await this.tableBody.locator('tr').first().waitFor({ state: 'visible' });
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
   * On mobile the table container is CSS display:none (still in DOM) — check visibility
   * before attempting to read table rows to avoid timeouts on hidden elements.
   */
  async getVendorNames(): Promise<string[]> {
    const tableVisible = await this.tableContainer.isVisible();
    if (tableVisible) {
      const rows = await this.getTableRows();
      const names: string[] = [];
      for (const row of rows) {
        const link = row.locator('[class*="vendorLink"]');
        const linkCount = await link.count();
        if (linkCount > 0) {
          const text = await link.textContent();
          if (text) names.push(text.trim());
        }
      }
      return names;
    }

    // Mobile cards: the name column renders a vendorLink anchor inside a cardValue span.
    // DataTable renders the same render() function inside cards, so vendorLink CSS class
    // still appears inside the cardsContainer. Read from those links.
    const cardLinks = await this.cardsContainer.locator('[class*="vendorLink"]').all();
    const names: string[] = [];
    for (const link of cardLinks) {
      const text = await link.textContent();
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
   *
   * VendorsPage uses a custom actions menu (not DataTable's built-in actions column):
   * - Each row has a ⋮ menu button: aria-label=t('common:menu.actions'), data-testid="vendor-menu-button-{id}"
   * - After opening the menu, the delete button renders: data-testid="vendor-delete-{id}", text="Delete"
   *
   * Strategy: find the table row that contains the vendor name, open its actions menu,
   * then click the Delete item.
   */
  async openDeleteModal(vendorName: string): Promise<void> {
    // VendorsPage uses a custom actions menu per row/card:
    // - Menu button: class*="menuButton", aria-label=t('common:menu.actions')
    // - Delete item: class*="menuItem" class*="menuItemDanger", text="Delete"
    //
    // On mobile the table container is CSS display:none — DataTableCard renders the same
    // actions menu inside cards. Check table visibility and use the correct container.
    const tableVisible = await this.tableContainer.isVisible();

    if (tableVisible) {
      // Desktop/tablet: find the row in the table by vendor name link
      await this.tableBody.locator('tr').first().waitFor({ state: 'visible' });
      const rows = await this.tableBody.locator('tr').all();
      for (const row of rows) {
        const link = row.locator('[class*="vendorLink"]');
        const linkCount = await link.count();
        if (linkCount > 0) {
          const text = await link.textContent();
          if (text?.trim() === vendorName) {
            const menuButton = row.locator('[class*="menuButton"]');
            await menuButton.click();
            const deleteButton = row.locator('[class*="menuItem"][class*="menuItemDanger"]');
            await deleteButton.click();
            await this.deleteModal.waitFor({ state: 'visible' });
            return;
          }
        }
      }
    } else {
      // Mobile: find the card by vendor name and open its actions menu.
      // DataTableCard renders the name column via the same render() function as the table —
      // the vendor name link uses class vendorLink (Link with styles.vendorLink). There is
      // no separate cardName class. Match by vendorLink text inside each card.
      await this.cardsContainer.locator('[class*="card"]').first().waitFor({ state: 'visible' });
      const cards = await this.cardsContainer.locator('[class*="card"]').all();
      for (const card of cards) {
        const nameEl = card.locator('[class*="vendorLink"]');
        const nameCount = await nameEl.count();
        if (nameCount > 0) {
          const text = await nameEl.textContent();
          if (text?.trim() === vendorName) {
            const menuButton = card.locator('[class*="menuButton"]');
            await menuButton.click();
            const deleteButton = card.locator('[class*="menuItem"][class*="menuItemDanger"]');
            await deleteButton.click();
            await this.deleteModal.waitFor({ state: 'visible' });
            return;
          }
        }
      }
    }
    throw new Error(`Vendor "${vendorName}" not found in list`);
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
    await this.deleteModal.waitFor({ state: 'hidden' });
  }

  /**
   * Type into the search field and wait for the debounced API response.
   * Register the response listener BEFORE fill to avoid a race with the debounce.
   * Explicit 10s timeout overrides global actionTimeout (5s) for slow CI runners.
   */
  async search(query: string): Promise<void> {
    const responsePromise = this.page.waitForResponse(
      (resp) => resp.url().includes('/api/vendors') && resp.status() === 200,
      { timeout: 10000 },
    );
    await this.searchInput.fill(query);
    await responsePromise;
  }

  /**
   * Clear the search input and wait for the debounced API response.
   * Register the response listener BEFORE clear to avoid a race with the debounce.
   * Explicit 10s timeout overrides global actionTimeout (5s) for slow CI runners.
   */
  async clearSearch(): Promise<void> {
    const responsePromise = this.page.waitForResponse(
      (resp) => resp.url().includes('/api/vendors') && resp.status() === 200,
      { timeout: 10000 },
    );
    await this.searchInput.clear();
    await responsePromise;
  }

  /**
   * Wait for vendor list to load (at least one row visible, at least one card visible, or empty state).
   * On mobile/tablet viewports vendors render as cards rather than a table, so we race all three.
   */
  async waitForVendorsLoaded(): Promise<void> {
    await Promise.race([
      this.tableBody.locator('tr').first().waitFor({ state: 'visible' }),
      this.cardsContainer.locator('[class*="card"]').first().waitFor({ state: 'visible' }),
      this.emptyState.waitFor({ state: 'visible' }),
    ]);
  }

  /**
   * Get the create error banner text, or null if not visible.
   */
  async getCreateErrorText(): Promise<string | null> {
    try {
      await this.createErrorBanner.waitFor({ state: 'visible' });
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
      await this.deleteErrorBanner.waitFor({ state: 'visible' });
      return await this.deleteErrorBanner.textContent();
    } catch {
      return null;
    }
  }
}
