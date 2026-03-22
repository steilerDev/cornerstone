/**
 * Page Object Model for the Household Items list page (/project/household-items)
 *
 * EPIC-04: Household Items & Furniture Management
 * Updated in EPIC-18: filter panel replaced by DataTable column-header filters.
 * Updated in EPIC-19 (#1074): area filter (AreaPicker) — now a DataTable column filter for "Area".
 *
 * The page renders:
 * - A page header with h1 (Project) and a "New Household Item" button
 * - A DataTable with:
 *   - Search input: aria-label="Search items", placeholder="Search..."
 *   - Per-column filter buttons: aria-label="Filter by {column label}" in each filterable <th>
 *   - Filterable columns: Category, Status, Area, Vendor, Target Delivery, Actual Delivery
 *   - Column filter popover (enum) renders checkboxes with id="enum-{value}"
 * - A data table (desktop, class tableContainer) and card list (mobile, class cardsContainer)
 * - Pagination controls when totalPages > 1
 * - An empty state (EmptyState component) when no items exist or no items match filters
 * - A delete confirmation modal (role="dialog") with confirmDeleteButton and cancelButton
 * - An error banner (role="alert", class errorBanner) for API errors
 *
 * Key DOM observations from source code:
 * - "New Household Item" is a <button> that calls navigate('/project/household-items/new')
 * - Delete modal: role="dialog", confirm button: class confirmDeleteButton
 * - Empty state rendered by DataTable EmptyState component
 * - Table rows are clickable and navigate to detail page
 * - Actions menu button: aria-label="Actions for {item.name}" (⋮)
 * - No standalone sort select or order toggle — sorting via column header clicks
 *
 * Filter interaction pattern:
 * - Click the filter button (aria-label="Filter by {column}") to open a popover
 * - Enum filter renders checkboxes with id="enum-{value}" — check the desired option(s)
 * - Alternatively, navigate directly with URL params: ?category=hic-furniture&status=planned etc.
 *   (URL navigation is preferred for E2E tests — avoids popover timing issues)
 *
 * AreaPicker DOM interaction (SearchPicker component within the Area column filter popover):
 * - The Area column uses an enum DataTable filter (enumOptions from useAreas() hook)
 * - areaFilterContainer: the Area column filter button in the table header
 * - areaFilterInput: kept for API compatibility; scoped to a text input inside Area filter popover
 * - For area filtering, prefer URL navigation: ?areaId={id}
 *
 * NOTE: The old #hi-filter-panel, #category-filter, #status-filter, #vendor-filter,
 * and #sort-filter selectors do NOT exist in the production code. They were removed
 * when the page was refactored to use the DataTable component.
 */

import type { Page, Locator } from '@playwright/test';

export const HOUSEHOLD_ITEMS_ROUTE = '/project/household-items';

export class HouseholdItemsPage {
  readonly page: Page;

  // Page header
  readonly heading: Locator;
  readonly newItemButton: Locator;

  // Search and filter controls
  readonly searchInput: Locator;
  readonly categoryFilter: Locator;
  readonly areaFilterInput: Locator;
  readonly areaFilterContainer: Locator;
  readonly statusFilter: Locator;
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
    this.heading = page.getByRole('heading', { level: 1, name: 'Project', exact: true });
    this.newItemButton = page.getByRole('button', { name: /New Household Item/i });

    // Search and filters
    // DataTable renders a generic search input with aria-label="Search items" for all pages.
    this.searchInput = page.getByLabel('Search items');
    // DataTable column filter buttons — each filterable column header renders a button with
    // aria-label="Filter by {column label}". Column labels from householdItems i18n.
    this.categoryFilter = page.getByRole('button', { name: 'Filter by Category' });
    this.statusFilter = page.getByRole('button', { name: 'Filter by Status' });
    this.vendorFilter = page.getByRole('button', { name: 'Filter by Vendor' });

    // Area column filter button — the Area column is filterable via DataTable enum filter.
    // areaFilterContainer: the Area column filter button (always present when Area col is visible).
    // areaFilterInput: kept for API compatibility; use URL navigation (?areaId=) instead for tests.
    this.areaFilterContainer = page.getByRole('button', { name: 'Filter by Area' });
    this.areaFilterInput = page.getByRole('button', { name: 'Filter by Area' });

    // sortFilter and sortOrderButton do not exist in DataTable — no standalone sort controls.
    // Sorting is triggered by clicking sortable column headers.
    this.sortFilter = page.locator('[aria-label="Column settings"]');
    this.sortOrderButton = page.locator('[aria-label="Column settings"]');

    // Table (desktop)
    this.tableContainer = page.locator('[class*="tableContainer"]');
    this.tableBody = this.tableContainer.locator('tbody');

    // Mobile cards
    this.cardsContainer = page.locator('[class*="cardsContainer"]');

    // Pagination — use `.first()` because `[class*="pagination"]` matches the outer container
    // and child elements (paginationInfo, paginationButton, etc.)
    this.pagination = page.locator('[class*="pagination"]').first();
    // DataTable pagination uses aria-label from common.json: "Previous" and "Next"
    this.prevPageButton = page.getByLabel('Previous');
    this.nextPageButton = page.getByLabel('Next');

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
    await this.heading.waitFor({ state: 'visible', timeout: 15000 });
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
   * Navigate to the household items list with a search query applied.
   *
   * Instead of filling the search input (which relies on React's debounce +
   * useEffect chain), directly navigate to the URL with ?q=<query>. This
   * triggers a full page load and guarantees the API call fires.
   */
  async search(query: string): Promise<void> {
    await this.page.goto(`${HOUSEHOLD_ITEMS_ROUTE}?q=${encodeURIComponent(query)}`);
    await this.heading.waitFor({ state: 'visible' });
    await this.waitForLoaded();
  }

  /**
   * Navigate to the household items list without search filters.
   */
  async clearSearch(): Promise<void> {
    await this.page.goto(HOUSEHOLD_ITEMS_ROUTE);
    await this.heading.waitFor({ state: 'visible' });
    await this.waitForLoaded();
  }

  /**
   * Open the delete modal for the item with the given name.
   * Uses the aria-label to find the actions button at page level,
   * which works across both table (desktop/tablet) and card (mobile) layouts.
   */
  async openDeleteModal(name: string): Promise<void> {
    // Both table and card layouts render an actions button with the same aria-label.
    // On mobile the table is display:none, so we must target the visible one.
    const actionsBtn = this.page
      .locator(`[aria-label^="Actions for"][aria-label*="${name}"]:visible`)
      .first();
    await actionsBtn.click();
    await this.page.getByRole('menuitem', { name: 'Delete' }).click();
    await this.deleteModal.waitFor({ state: 'visible' });
  }

  /**
   * Confirm the deletion in the delete modal.
   * Uses an explicit 30s timeout for the DELETE response to handle server
   * load on CI runners (all 16 shards × 2 workers concurrent).
   */
  async confirmDelete(): Promise<void> {
    const deleteResponsePromise = this.page.waitForResponse(
      (resp) =>
        resp.url().includes('/api/household-items') &&
        resp.request().method() === 'DELETE' &&
        resp.status() === 204,
      { timeout: 30000 },
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

  /**
   * Select an area filter by navigating to the URL with areaId applied.
   *
   * The Area column uses a DataTable enum filter (checkbox list in a popover).
   * Navigating via URL is the most reliable approach for E2E tests — it avoids
   * popover timing issues and mirrors the URL-persistence behavior validated by tests.
   *
   * This method navigates directly to the page with ?areaId={areaId} where areaId is
   * the area's UUID. Callers that need to filter by name must resolve the ID first via API.
   *
   * For interactive filter testing (click button → open popover → check checkbox), use
   * `areaFilterContainer` to find the "Filter by Area" button and interact directly.
   *
   * @deprecated Use URL navigation: page.goto(`${HOUSEHOLD_ITEMS_ROUTE}?areaId=${id}`) instead.
   * This method is kept for API compatibility only and navigates by URL.
   */
  async selectAreaFilter(_areaName: string): Promise<void> {
    // Area filtering is tested via URL navigation in area-filter.spec.ts.
    // This method intentionally does nothing — callers should navigate directly:
    // await page.goto(`${HOUSEHOLD_ITEMS_ROUTE}?areaId=${encodeURIComponent(areaId)}`);
    throw new Error(
      'selectAreaFilter() is not implemented for DataTable — use URL navigation with ?areaId=',
    );
  }

  /**
   * Alias for clearAreaFilter() — kept for API compatibility.
   */
  async selectAllAreasFilter(): Promise<void> {
    await this.clearAreaFilter();
  }

  /**
   * Clear the area filter by clicking the DataTable "Clear Filters" button.
   *
   * In the DataTable, active filters are cleared via the "Clear Filters" button
   * that appears in the toolbar when any filter is active.
   *
   * Alternatively, navigate directly to HOUSEHOLD_ITEMS_ROUTE without areaId param.
   */
  async clearAreaFilter(): Promise<void> {
    // DataTable renders a "Clear Filters" button when hasActiveFilters is true.
    const clearButton = this.page.getByRole('button', { name: 'Clear Filters' });
    await clearButton.waitFor({ state: 'visible' });
    await clearButton.click();
  }

  /**
   * Get the currently active area filter value from the URL.
   *
   * In the DataTable, selected filter values are not displayed in the column header button.
   * The source of truth for active filters is the URL (?areaId=...).
   *
   * This method reads the areaId from the URL and returns null if no area filter is active.
   * NOTE: The old AreaPicker used to show the selected area name — that behavior no longer
   * exists in the DataTable filter UI.
   *
   * @returns The areaId query parameter value, or null if no area filter is active.
   */
  async getSelectedAreaFilterName(): Promise<string | null> {
    const url = new URL(this.page.url());
    return url.searchParams.get('areaId');
  }
}
