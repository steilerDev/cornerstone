/**
 * Page Object Model for the Household Items list page (/project/household-items)
 *
 * EPIC-04: Household Items & Furniture Management
 * Updated in EPIC-18: #room-input filter removed (room field replaced by area entity);
 *                     tags filter removed.
 * Updated in EPIC-19 (#1074): area filter (AreaPicker) added between Category and Status filters.
 *
 * The page renders:
 * - A page header with h1 "Household Items" and an "Add new Household Item" button
 * - A search input (aria-label="Search household items") with 300ms debounce
 * - Filter panel (id="hi-filter-panel") with:
 *   - #category-filter (select)
 *   - AreaPicker (SearchPicker, placeholder="Select an area") — filters by ?areaId=<id>
 *   - #status-filter (select)
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
 * - "Add new Household Item" is a <button> that calls navigate('/project/household-items/new')
 * - Delete modal: aria-labelledby="hi-delete-modal-title", confirm button: class confirmDeleteButton
 * - Empty state h2: "No household items yet" or "No household items match your filters"
 * - Table rows are clickable and navigate to detail page
 * - Actions menu button: aria-label="Actions for {item.name}" (⋮)
 *
 * AreaPicker DOM interaction (SearchPicker component):
 * - Container: div[class*="container"] inside the filter div with label "Area:"
 * - Input state (no selection / after clear): <input type="text" placeholder="Select an area">
 * - Selected-area state: selectedDisplay div with selectedTitle span + clear button (aria-label="Clear selection")
 * - Selected-special ("All Areas") state: selectedDisplay div with selectedTitleSpecial span + clear button
 * - Dropdown: role="listbox" div with role="option" buttons
 * - "All Areas" special option: button[role="option"] with text "All Areas" (class specialOption)
 *
 * areaFilterContainer uses a combined CSS selector covering both possible render states
 * of the SearchPicker — selected state (selectedDisplay) and text-input state — so that
 * it resolves to a visible locator regardless of which state the picker is currently in.
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
    this.searchInput = page.getByLabel('Search household items');
    this.categoryFilter = page.locator('#category-filter');

    // AreaPicker (SearchPicker) — scoped to the filter panel (#hi-filter-panel).
    //
    // The SearchPicker renders in two DOM states:
    //   Input state: <input placeholder="Select an area"> visible inside a container div
    //   Selected state: <div class*="selectedDisplay"> visible (input removed from DOM)
    //
    // areaFilterInput: the text input — only in DOM when picker is in input state.
    //
    // areaFilterContainer: always-visible SearchPicker root div.
    //   Uses a combined CSS selector that covers both possible states:
    //   - selected state: container has [class*="selectedDisplay"]
    //   - input state: container has input[placeholder="Select an area"]
    //   At any moment exactly one branch matches, so the union matches exactly 1 element.
    //   The AreaPicker is the only SearchPicker in #hi-filter-panel, so the container
    //   is unique — other filters use <select> elements.
    this.areaFilterInput = page.locator('#hi-filter-panel input[placeholder="Select an area"]');
    this.areaFilterContainer = page.locator(
      '#hi-filter-panel [class*="container"]:has([class*="selectedDisplay"]), ' +
        '#hi-filter-panel [class*="container"]:has(input[placeholder="Select an area"])',
    );

    this.statusFilter = page.locator('#status-filter');
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
    // i18n: labels are now "← Previous" and "Next →" (from pagination.previous/next in householdItems.json)
    this.prevPageButton = page.getByLabel('← Previous');
    this.nextPageButton = page.getByLabel('Next →');

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
   * Select an area from the AreaPicker filter dropdown by area name.
   *
   * The AreaPicker is a SearchPicker: clicking/focusing its input opens a dropdown
   * with the list of areas. This method clicks the input, waits for the dropdown,
   * then clicks the option with the matching area name.
   *
   * PRECONDITION: the picker must be in text-input state — areaFilterInput must be
   * visible. If the picker is in selectedDisplay state (an area or "All Areas" chip
   * is shown), call clearAreaFilter() first to return to text-input state.
   *
   * After selection, the picker transitions to "selectedDisplay" state — the input
   * is removed from the DOM and a span with the area name + clear button appears.
   *
   * Register a waitForResponse() for '/api/household-items' BEFORE calling this method
   * to capture the filter-triggered API call.
   */
  async selectAreaFilter(areaName: string): Promise<void> {
    await this.areaFilterInput.waitFor({ state: 'visible' });
    await this.areaFilterInput.scrollIntoViewIfNeeded();
    await this.areaFilterInput.click();
    // Dropdown (role="listbox") opens after click. Scope to the SearchPicker container.
    const dropdown = this.areaFilterContainer.locator('[role="listbox"]');
    await dropdown.waitFor({ state: 'visible' });
    await dropdown.getByRole('option', { name: areaName, exact: true }).click();
  }

  /**
   * Clear the area filter by clicking the "×" clear button on the selected area display,
   * which returns the picker to the "All Areas" state (value='').
   *
   * PRECONDITION: the picker must be in selectedDisplay state with a SPECIFIC area
   * selected (i.e., page was loaded with ?areaId=<id>). This method clicks the clear
   * button which fires onChange('') → removes areaId from the URL.
   *
   * NOTE: This method is effectively equivalent to clearAreaFilter() — calling the
   * clear button when a specific area is displayed returns to "All Areas" state.
   * The method is kept as a semantic alias for readability in tests.
   */
  async selectAllAreasFilter(): Promise<void> {
    // Clicking the clear button on a selected area display returns to "All Areas" state.
    // This is equivalent to clearAreaFilter() when a specific area is selected.
    await this.clearAreaFilter();
  }

  /**
   * Clear the area filter by clicking the "×" clear button on the selected area display.
   *
   * Works when the picker is in selectedDisplay state (area or "All Areas" selected).
   * After clicking, the picker returns to unselected state (input visible),
   * which removes areaId from the URL.
   *
   * NOTE: The clear button uses aria-label="Clear selection" (from common.aria.clearSelection).
   * Since AreaPicker is the only SearchPicker in the filter panel, the clear button is unique
   * within #hi-filter-panel.
   */
  async clearAreaFilter(): Promise<void> {
    // In selected state, the container uses CSS :has() — the input is gone.
    // Use the filter panel scope to find the unique clear button for the area picker.
    const clearButton = this.page.locator('#hi-filter-panel').getByLabel('Clear selection');
    await clearButton.waitFor({ state: 'visible' });
    await clearButton.click();
  }

  /**
   * Get the currently selected area name from the AreaPicker filter.
   *
   * Returns the text of the selectedTitle span when an area is selected,
   * or null if no area is selected (input is shown instead).
   *
   * The selectedTitle span is unique within #hi-filter-panel (only AreaPicker renders it).
   */
  async getSelectedAreaFilterName(): Promise<string | null> {
    // In selected state, look for selectedTitle in the filter panel scope.
    const selectedTitle = this.page.locator('#hi-filter-panel [class*="selectedTitle"]');
    try {
      await selectedTitle.first().waitFor({ state: 'visible' });
      return await selectedTitle.first().textContent();
    } catch {
      return null;
    }
  }
}
