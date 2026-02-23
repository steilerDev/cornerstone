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
   * No explicit timeout — uses project-level actionTimeout (15s for WebKit).
   */
  async goto(): Promise<void> {
    await this.page.goto(WORK_ITEMS_ROUTE);
    await this.heading.waitFor({ state: 'visible' });
  }

  /**
   * Wait for the work items list to finish loading.
   * Races: table rows visible, mobile cards visible, or empty state visible.
   * No explicit timeout — uses project-level actionTimeout (15s for WebKit).
   */
  async waitForLoaded(): Promise<void> {
    await Promise.race([
      this.tableBody.locator('tr').first().waitFor({ state: 'visible' }),
      this.cardsContainer.locator('[class*="card"]').first().waitFor({ state: 'visible' }),
      this.emptyState.waitFor({ state: 'visible' }),
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
   * Type a search query and wait for both the debounced API response and the
   * DOM to re-render with the filtered results.
   *
   * The response listener must be registered BEFORE the fill action to avoid a
   * race condition where the debounced request resolves before the listener is
   * attached (especially common on WebKit/tablet where the 300ms debounce can
   * fire and complete before the next line executes).
   *
   * After the network response is received we additionally call waitForLoaded()
   * to ensure React has flushed the new data into the DOM before callers
   * attempt to read titles or interact with list items.
   */
  async search(query: string): Promise<void> {
    const responsePromise = this.page.waitForResponse(
      (resp) => resp.url().includes('/api/work-items') && resp.status() === 200,
    );
    await this.searchInput.fill(query);
    await responsePromise;
    await this.waitForLoaded();
  }

  /**
   * Clear the search input and wait for both the API response and the DOM to
   * update.
   *
   * The response listener must be registered BEFORE the clear action for the
   * same race-condition reason as search().
   */
  async clearSearch(): Promise<void> {
    const responsePromise = this.page.waitForResponse(
      (resp) => resp.url().includes('/api/work-items') && resp.status() === 200,
    );
    await this.searchInput.clear();
    await responsePromise;
    await this.waitForLoaded();
  }

  /**
   * Open the delete modal for the work item with the given title.
   * Clicks the Actions menu button (⋮) in the table row (desktop), then clicks "Delete".
   * On mobile (when the table is CSS-hidden), falls back to the card view.
   * No explicit timeout — uses project-level actionTimeout (15s for WebKit).
   */
  async openDeleteModal(title: string): Promise<void> {
    // Determine whether the desktop table is actually visible.
    // On mobile viewports the table has `display: none` via CSS — elements inside
    // are still in the DOM but are not interactable. Always use the card view on mobile.
    const tableVisible = await this.tableContainer.isVisible();

    if (tableVisible) {
      // Desktop: find the row in the table by title text
      const rows = await this.tableBody.locator('tr').all();
      for (const row of rows) {
        const rowText = await row.textContent();
        if (rowText?.includes(title)) {
          // Open the actions menu
          await row.locator('[aria-label="Actions menu"]').click();
          // Click Delete in the dropdown
          await row.getByRole('button', { name: 'Delete' }).click();
          await this.deleteModal.waitFor({ state: 'visible' });
          return;
        }
      }
    }

    // Mobile fallback (or if table row not found): search in cards
    const cards = await this.cardsContainer.locator('[class*="card"]').all();
    for (const card of cards) {
      const cardText = await card.textContent();
      if (cardText?.includes(title)) {
        await card.locator('[aria-label="Actions menu"]').click();
        await card.getByRole('button', { name: 'Delete' }).click();
        await this.deleteModal.waitFor({ state: 'visible' });
        return;
      }
    }

    throw new Error(`Work item with title "${title}" not found in list`);
  }

  /**
   * Confirm the deletion in the delete modal.
   *
   * Waits for both the DELETE API response and the modal to hide. Registering
   * the response listener before the click prevents a race where the DELETE
   * completes and the modal closes before the listener is attached (common on
   * fast Chromium or heavily-loaded CI runners).
   */
  async confirmDelete(): Promise<void> {
    const deleteResponsePromise = this.page.waitForResponse(
      (resp) =>
        resp.url().includes('/api/work-items') &&
        resp.request().method() === 'DELETE' &&
        resp.status() === 204,
    );
    await this.deleteConfirmButton.click();
    await deleteResponsePromise;
    await this.deleteModal.waitFor({ state: 'hidden' });
  }

  /**
   * Cancel the delete modal without deleting.
   * No explicit timeout — uses project-level actionTimeout (15s for WebKit).
   */
  async cancelDelete(): Promise<void> {
    await this.deleteCancelButton.click();
    await this.deleteModal.waitFor({ state: 'hidden' });
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
      await info.waitFor({ state: 'visible' });
      return await info.textContent();
    } catch {
      return null;
    }
  }
}
