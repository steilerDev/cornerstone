/**
 * Page Object Model for the Work Items list page (/work-items)
 *
 * The page renders:
 * - A page header with h1 "Work Items" and a "New Work Item" button (navigates to /work-items/new)
 * - A search input and filter/sort controls (status, user, tag, sortBy, sort order toggle)
 * - A data table (desktop, class tableContainer) and card list (mobile, class cardsContainer)
 * - Pagination controls when totalPages > 1
 * - An empty state when no work items exist or no items match filters
 * - A delete confirmation modal (role="dialog") with confirmDeleteButton and cancelButton
 * - An error banner (role="alert", class errorBanner) for API errors
 *
 * Key DOM observations from source code:
 * - "New Work Item" is a <button> (not a <Link>) that calls navigate('/work-items/new')
 * - The delete modal uses role="dialog" with aria-modal="true" (no aria-labelledby)
 * - The confirm delete button uses class `confirmDeleteButton` (not an accessible name)
 * - Empty state renders an h2: "No work items yet" or "No work items match your filters"
 * - Table rows are clickable and navigate to detail page
 * - Actions menu button: aria-label="Actions menu" (⋮)
 */

import type { Page, Locator } from '@playwright/test';

export const WORK_ITEMS_ROUTE = '/work-items';

export class WorkItemsPage {
  readonly page: Page;

  // Page header
  readonly heading: Locator;
  readonly newWorkItemButton: Locator;

  // Search and filter controls
  readonly searchInput: Locator;
  readonly statusFilter: Locator;
  readonly userFilter: Locator;
  readonly tagFilter: Locator;
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
    this.heading = page.getByRole('heading', { level: 1, name: 'Work Items', exact: true });
    // "New Work Item" is a <button> that calls navigate(), not a <Link>
    this.newWorkItemButton = page.getByRole('button', { name: /New Work Item/ });

    // Search and filters
    this.searchInput = page.getByLabel('Search work items');
    this.statusFilter = page.locator('#status-filter');
    this.userFilter = page.locator('#user-filter');
    this.tagFilter = page.locator('#tag-filter');
    this.sortFilter = page.locator('#sort-filter');
    this.sortOrderButton = page.getByLabel('Toggle sort order');

    // Table (desktop)
    this.tableContainer = page.locator('[class*="tableContainer"]');
    this.tableBody = this.tableContainer.locator('tbody');

    // Mobile cards
    this.cardsContainer = page.locator('[class*="cardsContainer"]');

    // Pagination — use `.first()` because `[class*="pagination"]` matches
    // the outer container and child elements (paginationInfo, paginationButton, etc.)
    this.pagination = page.locator('[class*="pagination"]').first();
    this.prevPageButton = page.getByLabel('Previous page');
    this.nextPageButton = page.getByLabel('Next page');

    // Empty state
    this.emptyState = page.locator('[class*="emptyState"]');

    // Error banner (outside modal)
    this.errorBanner = page.locator('[role="alert"][class*="errorBanner"]');

    // Delete confirmation modal — no aria-labelledby in the source; use role="dialog"
    this.deleteModal = page.locator('[role="dialog"]');
    // Confirm button identified by CSS class (no accessible name distinguishes it)
    this.deleteConfirmButton = this.deleteModal.locator('[class*="confirmDeleteButton"]');
    this.deleteCancelButton = this.deleteModal.getByRole('button', { name: 'Cancel', exact: true });
  }

  /**
   * Navigate to the work items list page.
   */
  async goto(): Promise<void> {
    await this.page.goto(WORK_ITEMS_ROUTE);
    await this.heading.waitFor({ state: 'visible', timeout: 7000 });
  }

  /**
   * Wait for the work items list to finish loading.
   * Races: table rows visible, mobile cards visible, or empty state visible.
   */
  async waitForLoaded(): Promise<void> {
    await Promise.race([
      this.tableBody.locator('tr').first().waitFor({ state: 'visible', timeout: 7000 }),
      this.cardsContainer
        .locator('[class*="card"]')
        .first()
        .waitFor({ state: 'visible', timeout: 7000 }),
      this.emptyState.waitFor({ state: 'visible', timeout: 7000 }),
    ]);
  }

  /**
   * Get the titles of all work items currently shown in the table (desktop)
   * or cards (mobile).
   */
  async getWorkItemTitles(): Promise<string[]> {
    // Try table first (titleCell class)
    const titleCells = await this.tableBody.locator('[class*="titleCell"]').all();
    if (titleCells.length > 0) {
      const titles: string[] = [];
      for (const cell of titleCells) {
        const text = await cell.textContent();
        if (text) titles.push(text.trim());
      }
      return titles;
    }

    // Mobile fallback: card title elements
    const cardTitles = await this.cardsContainer.locator('[class*="cardTitle"]').all();
    const titles: string[] = [];
    for (const el of cardTitles) {
      const text = await el.textContent();
      if (text) titles.push(text.trim());
    }
    return titles;
  }

  /**
   * Type a search query and wait for the debounced API response.
   */
  async search(query: string): Promise<void> {
    await this.searchInput.fill(query);
    await this.page.waitForResponse(
      (resp) => resp.url().includes('/api/work-items') && resp.status() === 200,
    );
  }

  /**
   * Clear the search input and wait for the list to update.
   */
  async clearSearch(): Promise<void> {
    await this.searchInput.clear();
    await this.page.waitForResponse(
      (resp) => resp.url().includes('/api/work-items') && resp.status() === 200,
    );
  }

  /**
   * Open the delete modal for the work item with the given title.
   * Clicks the Actions menu button (⋮) in the table row, then clicks "Delete".
   * For mobile, finds the card and uses its Actions menu.
   */
  async openDeleteModal(title: string): Promise<void> {
    // Find the row in the table by title text
    const rows = await this.tableBody.locator('tr').all();
    for (const row of rows) {
      const rowText = await row.textContent();
      if (rowText?.includes(title)) {
        // Open the actions menu
        await row.locator('[aria-label="Actions menu"]').click();
        // Click Delete in the dropdown
        await row.getByRole('button', { name: 'Delete' }).click();
        await this.deleteModal.waitFor({ state: 'visible', timeout: 5000 });
        return;
      }
    }

    // Mobile fallback: search in cards
    const cards = await this.cardsContainer.locator('[class*="card"]').all();
    for (const card of cards) {
      const cardText = await card.textContent();
      if (cardText?.includes(title)) {
        await card.locator('[aria-label="Actions menu"]').click();
        await card.getByRole('button', { name: 'Delete' }).click();
        await this.deleteModal.waitFor({ state: 'visible', timeout: 5000 });
        return;
      }
    }

    throw new Error(`Work item with title "${title}" not found in list`);
  }

  /**
   * Confirm the deletion in the delete modal.
   */
  async confirmDelete(): Promise<void> {
    await this.deleteConfirmButton.click();
    await this.deleteModal.waitFor({ state: 'hidden', timeout: 7000 });
  }

  /**
   * Cancel the delete modal without deleting.
   */
  async cancelDelete(): Promise<void> {
    await this.deleteCancelButton.click();
    await this.deleteModal.waitFor({ state: 'hidden', timeout: 5000 });
  }

  /**
   * Click a table row by title to navigate to the work item detail page.
   */
  async clickWorkItemRow(title: string): Promise<void> {
    const rows = await this.tableBody.locator('tr').all();
    for (const row of rows) {
      const rowText = await row.textContent();
      if (rowText?.includes(title)) {
        await row.click();
        return;
      }
    }
    throw new Error(`Work item with title "${title}" not found in table`);
  }

  /**
   * Get pagination info text (e.g. "Showing 1 to 25 of 30 items"), or null if not visible.
   */
  async getPaginationInfoText(): Promise<string | null> {
    try {
      const info = this.page.locator('[class*="paginationInfo"]');
      await info.waitFor({ state: 'visible', timeout: 3000 });
      return await info.textContent();
    } catch {
      return null;
    }
  }
}
