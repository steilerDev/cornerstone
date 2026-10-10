/**
 * Page Object Model for the Vendors list page (/settings/vendors)
 *
 * Vendors moved from Budget section to Settings section in Story #1283.
 * Legacy route /budget/vendors redirects to /settings/vendors via React Router.
 *
 * The page renders:
 * - No in-page tab row (#2205): the Companies entry is the active one (sidebar ≥ 1024 px, More sheet below)
 * - A page header with an "Add Vendor" button
 * - A search input and sort controls
 * - A data table (desktop) / card list (mobile) of vendors
 * - Pagination controls when totalPages > 1
 * - An "Add Vendor" modal (role="dialog", aria-labelledby="create-modal-title")
 * - A delete confirmation modal (role="dialog", aria-labelledby="delete-modal-title")
 * - An empty state when no vendors exist (or no search matches)
 */

import { expect } from '@playwright/test';
import type { Page, Locator } from '@playwright/test';
import { routeUrl } from '../../shared/src/routes/index.js';

export const VENDORS_ROUTE = routeUrl('vendors');

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
  // sortSelect removed — DataTable has no standalone sort select; sorting is column-header-based.
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
    this.heading = page.getByRole('heading', { level: 1, name: 'Vendors', exact: true });
    this.addVendorButton = page.getByRole('button', { name: 'Add Vendor', exact: true });

    // Search / sort
    // DataTable renders a generic search input with aria-label="Search items" for all pages.
    this.searchInput = page.getByLabel('Search items');
    // DataTable sorting is column-header-based — no standalone sort select or order toggle button.
    // Sorting is triggered by clicking a sortable column header (th) in the table.
    // sortOrderButton points to the column settings button (the only sort-related toolbar element).
    this.sortOrderButton = page.getByLabel('Column settings');

    // Error banner outside modals
    this.errorBanner = page.locator('[role="alert"]').first();

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

    // Delete dialog: the shared ConfirmDialog (role="alertdialog", #2209), title
    // "Delete <name>?", testid prefix vendor-list-delete.
    this.deleteModal = page
      .getByRole('alertdialog')
      .filter({ has: page.getByTestId('vendor-list-delete-cancel') });
    // deleteModalTitle: the <h2> inside the delete dialog
    this.deleteModalTitle = this.deleteModal.getByRole('heading', { level: 2 });
    this.deleteConfirmButton = this.deleteModal.getByTestId('vendor-list-delete-confirm');
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
   * The visible table row (desktop/tablet) or card (mobile) for the named vendor.
   * DataTable mounts both surfaces at once; the visible filter keeps this strict-mode safe.
   */
  contactCell(vendorName: string): Locator {
    const escaped = vendorName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return this.tableBody
      .locator('tr')
      .or(this.cardsContainer.locator(':scope > *'))
      .filter({
        has: this.page.locator('[class*="vendorLink"]', {
          hasText: new RegExp(`^\\s*${escaped}\\s*$`),
        }),
      })
      .filter({ visible: true });
  }

  /** The `tel:` link in the named vendor's Contact column (row or card). */
  phoneLink(vendorName: string): Locator {
    return this.contactCell(vendorName).locator('a[href^="tel:"]');
  }

  /**
   * Get all card locators (mobile view).
   */
  async getCards(): Promise<Locator[]> {
    return this.cardsContainer
      .locator('[class*="card"]')
      .filter({ has: this.page.locator('[class*="vendorLink"]') })
      .all();
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
    const escaped = vendorName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const row = this.tableBody.locator('tr').filter({
      has: this.page.locator('[class*="vendorLink"]', {
        hasText: new RegExp(`^\\s*${escaped}\\s*$`),
      }),
    });
    return (await row.count()) > 0 ? row.first() : null;
  }

  /**
   * Get the names of all vendors currently shown in the table (desktop) or cards (mobile).
   * On mobile the table container is CSS display:none (still in DOM) — check visibility
   * before attempting to read table rows to avoid timeouts on hidden elements.
   */
  async getVendorNames(): Promise<string[]> {
    const tableVisible = await this.tableContainer.isVisible();
    // One atomic read of the matching links (no per-element snapshot loop). Mobile cards render
    // the same vendorLink anchor inside a cardValue span.
    const links = tableVisible
      ? this.tableBody.locator('tr [class*="vendorLink"]')
      : this.cardsContainer.locator('[class*="vendorLink"]');
    const texts = await links.allTextContents();
    return texts.map((text) => text.trim()).filter((text) => text.length > 0);
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
    // DataTable mounts the table row and the mobile card at once; contactCell() is the visible
    // one for the exact vendor name. Wait for the (possibly just-filtered) list to settle on
    // exactly that one match instead of walking a snapshot of rows/cards, which goes stale
    // while a search re-renders the list.
    const item = this.contactCell(vendorName);
    await expect(item).toHaveCount(1);

    await item.locator('[class*="menuButton"]').click();
    await item.locator('[class*="menuItem"][class*="menuItemDanger"]').click();
    await this.deleteModal.waitFor({ state: 'visible' });
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
   * 15s timeout: mobile fill() may take up to 10s (actionTimeout) and the debounce +
   * API round-trip adds latency on top, so 10s was too tight for mobile CI runners.
   */
  async search(query: string): Promise<void> {
    const responsePromise = this.page.waitForResponse(
      (resp) => resp.url().includes('/api/vendors') && resp.status() === 200,
      { timeout: 15000 },
    );
    await this.searchInput.fill(query);
    await responsePromise;
    // Wait for React to commit the filtered results — the API response has arrived but
    // the DOM may not yet reflect the new data on mobile viewports.
    await this.waitForVendorsLoaded();
  }

  /**
   * Clear the search input and wait for the debounced API response.
   * Register the response listener BEFORE clear to avoid a race with the debounce.
   * 15s timeout: mobile fill() may take up to 10s (actionTimeout) and the debounce +
   * API round-trip adds latency on top, so 10s was too tight for mobile CI runners.
   */
  async clearSearch(): Promise<void> {
    const responsePromise = this.page.waitForResponse(
      (resp) => resp.url().includes('/api/vendors') && resp.status() === 200,
      { timeout: 15000 },
    );
    await this.searchInput.clear();
    await responsePromise;
    // Wait for React to commit the updated results after clearing search.
    await this.waitForVendorsLoaded();
  }

  /**
   * Wait for vendor list to load (at least one row visible, at least one card visible, or empty state).
   * On mobile/tablet viewports vendors render as cards rather than a table, so we race all three.
   */
  async waitForVendorsLoaded(): Promise<void> {
    await Promise.race([
      this.tableBody.locator('tr').first().waitFor({ state: 'visible' }),
      this.cardsContainer
        .locator('[class*="card"]')
        .filter({ has: this.page.locator('[class*="vendorLink"]') })
        .first()
        .waitFor({ state: 'visible' }),
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
