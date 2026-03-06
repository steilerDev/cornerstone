/**
 * Page Object Model for the Household Items list page (/household-items)
 *
 * EPIC-04: Household Items & Furniture Management
 *
 * The page renders:
 * - A page header with h1 "Household Items" and a "New Item" button
 * - A search input (aria-label="Search household items") with 300ms debounce
 * - Filter panel (role="search", aria-label="Household item filters") with:
 *   - #category-filter (select)
 *   - #status-filter (select)
 *   - #room-input (text input)
 *   - #vendor-filter (select)
 *   - #sort-filter (select)
 *   - Toggle sort order button (aria-label="Toggle sort order")
 * - A data table (desktop, class tableContainer) and card list (mobile, class cardsContainer)
 * - Pagination controls when totalPages > 1
 * - An empty state when no items exist or no items match filters
 * - A delete confirmation modal (role="dialog", aria-labelledby="hi-delete-modal-title")
 * - An error banner (role="alert", class errorBanner) for API errors
 *
 * Key DOM observations from source code:
 * - "New Item" is a <button> that calls navigate('/household-items/new')
 * - Delete modal: aria-labelledby="hi-delete-modal-title", confirm button: class confirmDeleteButton
 * - Empty state h2: "No household items yet" or "No household items match your filters"
 * - Table rows are clickable and navigate to detail page
 * - Actions menu button: aria-label="Actions for {item.name}" (⋮)
 * - Search debounce: 300ms, room filter debounce: 300ms
 */

import type { Page, Locator } from '@playwright/test';

export const HOUSEHOLD_ITEMS_ROUTE = '/household-items';

export class HouseholdItemsPage {
  readonly page: Page;

  // Page header
  readonly heading: Locator;
  readonly newItemButton: Locator;

  // Search and filter controls
  readonly searchInput: Locator;
  readonly categoryFilter: Locator;
  readonly statusFilter: Locator;
  readonly roomInput: Locator;
  readonly vendorFilter: Locator;
  readonly sortFilter: Locator;
  readonly sortOrderButton: Locator;

  // Table (desktop view)
  readonly tableContainer: Locator;
  readonly tableBody: Locator;

  // Cards (mobile view)
  readonly cardsContainer: Locator;

  // Pagination
  readonly pagination: Locator;
  readonly prevPageButton: Locator;
  readonly nextPageButton: Locator;

  // Empty state
  readonly emptyState: Locator;

  // Error banner
  readonly errorBanner: Locator;

  // Delete confirmation modal
  readonly deleteModal: Locator;
  readonly deleteConfirmButton: Locator;
  readonly deleteCancelButton: Locator;

  constructor(page: Page) {
    this.page = page;

    // Page header
    this.heading = page.getByRole('heading', { level: 1, name: 'Household Items', exact: true });
    this.newItemButton = page.getByRole('button', { name: /New Item/i });

    // Search and filters
    this.searchInput = page.getByLabel('Search household items');
    this.categoryFilter = page.locator('#category-filter');
    this.statusFilter = page.locator('#status-filter');
    this.roomInput = page.locator('#room-input');
    this.vendorFilter = page.locator('#vendor-filter');
    this.sortFilter = page.locator('#sort-filter');
    this.sortOrderButton = page.getByLabel('Toggle sort order');

    // Table (desktop)
    this.tableContainer = page.locator('[class*="tableContainer"]');
    this.tableBody = this.tableContainer.locator('tbody');

    // Mobile cards
    this.cardsContainer = page.locator('[class*="cardsContainer"]');

    // Pagination — use `.first()` because `[class*="pagination"]` matches the outer container
    // and child elements (paginationInfo, paginationButton, etc.)
    this.pagination = page.locator('[class*="pagination"]').first();
    this.prevPageButton = page.getByLabel('Previous page');
    this.nextPageButton = page.getByLabel('Next page');

    // Empty state — use .first() to avoid strict mode: child elements such as
    // emptyStateTitle/emptyStateDescription also contain "emptyState" in their class names.
    this.emptyState = page.locator('[class*="emptyState"]').first();

    // Error banner (outside modal)
    this.errorBanner = page.locator('[role="alert"][class*="errorBanner"]');

    // Delete confirmation modal
    this.deleteModal = page.locator('[role="dialog"][aria-labelledby="hi-delete-modal-title"]');
    this.deleteConfirmButton = this.deleteModal.locator('[class*="confirmDeleteButton"]');
    this.deleteCancelButton = this.deleteModal.getByRole('button', {
      name: 'Cancel',
      exact: true,
    });
  }

  /**
   * Navigate to the household items list page.
   */
  async goto(): Promise<void> {
    await this.page.goto(HOUSEHOLD_ITEMS_ROUTE);
    await this.heading.waitFor({ state: 'visible' });
  }

  /**
   * Wait for the household items list to finish loading.
   * Races: table rows visible, mobile cards visible, or empty state visible.
   */
  async waitForLoaded(): Promise<void> {
    await Promise.race([
      this.tableBody.locator('tr').first().waitFor({ state: 'visible' }),
      this.cardsContainer.locator('[class*="card"]').first().waitFor({ state: 'visible' }),
      this.emptyState.waitFor({ state: 'visible' }),
    ]);
  }

  /**
   * Get the names of all household items currently shown in the table (desktop)
   * or cards (mobile).
   */
  async getItemNames(): Promise<string[]> {
    // Try table first (titleCell class)
    const titleCells = await this.tableBody.locator('[class*="titleCell"]').all();
    if (titleCells.length > 0) {
      const names: string[] = [];
      for (const cell of titleCells) {
        const text = await cell.textContent();
        if (text) names.push(text.trim());
      }
      return names;
    }

    // Mobile fallback: card title elements
    const cardTitles = await this.cardsContainer.locator('[class*="cardTitle"]').all();
    const names: string[] = [];
    for (const el of cardTitles) {
      const text = await el.textContent();
      if (text) names.push(text.trim());
    }
    return names;
  }

  /**
   * Type a search query and wait for the API response and DOM to update.
   * The response listener is registered BEFORE the fill to avoid a race with
   * the 300ms debounce.
   */
  async search(query: string): Promise<void> {
    const responsePromise = this.page.waitForResponse(
      (resp) => resp.url().includes('/api/household-items') && resp.status() === 200,
    );
    await this.searchInput.fill(query);
    await responsePromise;
    await this.waitForLoaded();
  }

  /**
   * Clear the search input and wait for the API response and DOM to update.
   */
  async clearSearch(): Promise<void> {
    const responsePromise = this.page.waitForResponse(
      (resp) => resp.url().includes('/api/household-items') && resp.status() === 200,
    );
    await this.searchInput.clear();
    await responsePromise;
    await this.waitForLoaded();
  }

  /**
   * Open the delete modal for the item with the given name.
   * Uses the table on desktop and falls back to cards on mobile.
   */
  async openDeleteModal(name: string): Promise<void> {
    const tableVisible = await this.tableContainer.isVisible();

    if (tableVisible) {
      const rows = await this.tableBody.locator('tr').all();
      for (const row of rows) {
        const rowText = await row.textContent();
        if (rowText?.includes(name)) {
          await row.locator(`[aria-label="Actions for ${name}"]`).click();
          await row.getByRole('menuitem', { name: 'Delete' }).click();
          await this.deleteModal.waitFor({ state: 'visible' });
          return;
        }
      }
    }

    // Mobile fallback
    const cards = await this.cardsContainer.locator('[class*="card"]').all();
    for (const card of cards) {
      const cardText = await card.textContent();
      if (cardText?.includes(name)) {
        await card.locator(`[aria-label="Actions for ${name}"]`).click();
        await card.getByRole('menuitem', { name: 'Delete' }).click();
        await this.deleteModal.waitFor({ state: 'visible' });
        return;
      }
    }

    throw new Error(`Household item with name "${name}" not found in list`);
  }

  /**
   * Confirm the deletion in the delete modal.
   */
  async confirmDelete(): Promise<void> {
    const deleteResponsePromise = this.page.waitForResponse(
      (resp) =>
        resp.url().includes('/api/household-items') &&
        resp.request().method() === 'DELETE' &&
        resp.status() === 204,
    );
    await this.deleteConfirmButton.click();
    await deleteResponsePromise;
    await this.deleteModal.waitFor({ state: 'hidden' });
  }

  /**
   * Cancel the delete modal without deleting.
   */
  async cancelDelete(): Promise<void> {
    await this.deleteCancelButton.click();
    await this.deleteModal.waitFor({ state: 'hidden' });
  }

  /**
   * Get pagination info text (e.g. "Showing 1 to 25 of 30 items"), or null if not visible.
   */
  async getPaginationInfoText(): Promise<string | null> {
    try {
      const info = this.page.locator('[class*="paginationInfo"]');
      await info.waitFor({ state: 'visible' });
      return await info.textContent();
    } catch {
      return null;
    }
  }
}
