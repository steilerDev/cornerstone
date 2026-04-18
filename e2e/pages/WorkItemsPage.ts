/**
 * Page Object Model for the Work Items list page (/project/work-items)
 *
 * The page renders:
 * - A page header with h1 "Work Items" and a "New Work Item" button (navigates to /project/work-items/new)
 * - A DataTable with search input (aria-label="Search items") and per-column filter buttons
 * - Filter buttons in column headers: aria-label="Filter by {column label}" (Status, Assigned To, etc.)
 * - A data table (desktop, class tableContainer) and card list (mobile, class cardsContainer)
 * - Pagination controls when totalPages > 1
 * - An empty state when no work items exist or no items match filters
 * - A delete confirmation modal (role="dialog") with confirmDeleteButton and cancelButton
 * - An error banner (role="alert", class errorBanner) for API errors
 *
 * Key DOM observations from source code:
 * - "New Work Item" is a <button> (not a <Link>) that calls navigate('/project/work-items/new')
 * - The delete modal uses role="dialog" with aria-modal="true" (no aria-labelledby)
 * - The confirm delete button uses class `confirmDeleteButton` (not an accessible name)
 * - Empty state rendered by DataTable EmptyState component
 * - Table rows are clickable and navigate to detail page
 * - Actions menu button: aria-label="Actions menu" (⋮)
 * - No standalone sort select or order toggle — sorting via column header clicks
 */

import type { Page, Locator } from '@playwright/test';

export const WORK_ITEMS_ROUTE = '/project/work-items';

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
  readonly areaFilter: Locator;
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

  // Area breadcrumb — compact variant (list rows)
  // fix/1278: The compact AreaBreadcrumb no longer has tabIndex=0 or a Tooltip.
  // The span carries only class*="compact" with the full path text as plain content.
  // For per-item assertions, callers scope to a specific row/card — this is the first match.
  readonly areaBreadcrumb: Locator;

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
    // "New Work Item" is a <button> that calls navigate(), not a <Link>
    this.newWorkItemButton = page.getByRole('button', { name: /New Work Item/ });

    // Search and filters
    // DataTable renders a generic search input with aria-label="Search items" for all pages.
    this.searchInput = page.getByLabel('Search items');
    // DataTable filters are column-header filter buttons, not standalone <select> elements.
    // Each filterable column header renders a button with aria-label="Filter by {column label}".
    // Column labels come from workItems i18n: Status, Assigned To, Vendor, Area.
    this.statusFilter = page.getByRole('button', { name: 'Filter by Status' });
    this.userFilter = page.getByRole('button', { name: 'Filter by Assigned To' });
    // Tags column was removed — tagFilter kept for API compatibility, points to userFilter.
    this.tagFilter = page.getByRole('button', { name: 'Filter by Assigned To' });
    // Area column filter button — the Area column is filterable via DataTable enum filter.
    // The Area column label comes from workItems i18n: list.table.area = "Area".
    // aria-label rendered as "Filter by Area" (dataTable.filter.filterByColumn interpolation).
    // The table header (and this button) is CSS-hidden on mobile (< 768px).
    this.areaFilter = page.getByRole('button', { name: /Filter by Area/i });
    // sortFilter and sortOrderButton do not exist in DataTable — no standalone sort controls.
    // Sorting is triggered by clicking sortable column headers.
    this.sortFilter = page.locator('[aria-label="Column settings"]');
    this.sortOrderButton = page.locator('[aria-label="Column settings"]');

    // Table (desktop)
    this.tableContainer = page.locator('[class*="tableContainer"]');
    this.tableBody = this.tableContainer.locator('tbody');

    // Mobile cards
    this.cardsContainer = page.locator('[class*="cardsContainer"]');

    // Pagination — use `.first()` because `[class*="pagination"]` matches
    // the outer container and child elements (paginationInfo, paginationButton, etc.)
    this.pagination = page.locator('[class*="pagination"]').first();
    // DataTable pagination uses aria-label from common.json: "Previous" and "Next"
    this.prevPageButton = page.getByLabel('Previous');
    this.nextPageButton = page.getByLabel('Next');

    // Empty state — EmptyState component's outer wrapper uses the CSS-module-hashed
    // `emptyState_abc123` class. Scope by prefix so sub-element classes like
    // `emptyStateTitle_/emptyStateDescription_` don't get picked up first.
    this.emptyState = page.locator('[class^="emptyState_"], [class*=" emptyState_"]').first();

    // Area breadcrumb — compact variant spans inside table rows / mobile cards.
    // fix/1278: compact variant no longer has tabIndex=0 or a Tooltip — plain span only.
    // The "No area" fallback renders a plain <span> with class "muted" — no tabIndex.
    // Callers scope to a specific row/card when they need per-item assertions — this
    // is the first match as a default.
    this.areaBreadcrumb = page.locator('[class*="compact"]').first();

    // Error banner (outside modal)
    this.errorBanner = page.locator('[role="alert"][class*="errorBanner"]');

    // Delete confirmation modal — no aria-labelledby in the source; use role="dialog"
    this.deleteModal = page.locator('[role="dialog"]');
    // Confirm button uses sharedStyles.btnConfirmDelete (shared.module.css), CSS Modules hashes it
    // to "btnConfirmDelete_XXXX". The class selector [class*="btnConfirmDelete"] matches it.
    this.deleteConfirmButton = this.deleteModal.locator('[class*="btnConfirmDelete"]');
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
   * Wait for search results to stabilize after a search() or clearSearch() call.
   *
   * waitForLoaded() is designed for the initial page load and resolves immediately
   * when table rows/cards are already visible (old data). This method uses the URL
   * search param as a proxy for React state settling — after the debounced search
   * updates setSearchParams(), the DOM re-render follows in the same microtask batch.
   *
   * For search(query): waits until URL has q=query (exact match).
   * For clearSearch(): waits until URL no longer has q=.
   */
  async waitForSearchParams(hasQuery?: string): Promise<void> {
    if (hasQuery !== undefined) {
      await this.page.waitForURL((url) => url.searchParams.get('q') === hasQuery, {
        timeout: 15000,
      });
    } else {
      await this.page.waitForURL((url) => !url.searchParams.has('q'), { timeout: 15000 });
    }
  }

  /**
   * Get the titles of all work items currently shown in the table (desktop)
   * or cards (mobile).
   */
  async getWorkItemTitles(): Promise<string[]> {
    // On mobile, tableContainer has display:none (CSS media query at max-width:767px).
    // Elements inside a CSS-hidden table are still in the DOM so .all() returns them,
    // but their text would include all items (search filter not reflected in DOM-hidden rows).
    // Always check visibility before using the table path.
    const tableVisible = await this.tableContainer.isVisible();
    if (tableVisible) {
      // Desktop/tablet: work items title column uses className={styles.itemLink} (CSS Modules).
      const titleCells = await this.tableBody.locator('[class*="itemLink"]').all();
      if (titleCells.length > 0) {
        const titles: string[] = [];
        for (const cell of titleCells) {
          const text = await cell.textContent();
          if (text) titles.push(text.trim());
        }
        return titles;
      }
    }

    // Mobile fallback (or empty table): DataTableCard renders the same cell content as the table.
    // The title column uses styles.itemLink (CSS Modules) — same class as in the table rows.
    // DataTableCard has NO "cardTitle" class; looking for itemLink inside cardsContainer is correct.
    const cardTitles = await this.cardsContainer.locator('[class*="itemLink"]').all();
    const titles: string[] = [];
    for (const el of cardTitles) {
      const text = await el.textContent();
      if (text) titles.push(text.trim());
    }
    return titles;
  }

  /**
   * Type a search query and wait for both the URL to update (debounce fired) and
   * the API response to arrive (data fetched).
   *
   * Strategy (three-step):
   *  1. Register a response listener for `q=query` BEFORE fill to avoid missing
   *     the response on fast CI runners.
   *  2. fill() the input — WebKit may emit a clear event first, but the response
   *     listener filters by exact query param and ignores that empty-query response.
   *  3. Wait for the URL to update with q=query (confirms debounce fired and React
   *     state is committed) then await the API response (confirms data received).
   *
   * After the API response arrives React will commit the filtered results in the next
   * render. Callers use expect().toBeVisible() / expect().not.toBeVisible() with the
   * project-level expect.timeout to wait for that DOM update — no extra waitForLoaded()
   * needed here, which avoids the race where waitForLoaded() resolves on stale DOM.
   */
  async search(query: string): Promise<void> {
    // Register BEFORE fill to avoid missing the response on fast runners.
    // 15s timeout: mobile fill() may take up to 10s (actionTimeout) and the debounce +
    // API round-trip adds latency on top, so 10s was too tight for mobile CI runners.
    const responsePromise = this.page.waitForResponse(
      (resp) => {
        if (!resp.url().includes('/api/work-items') || resp.status() !== 200) return false;
        try {
          const url = new URL(resp.url());
          return url.searchParams.get('q') === query;
        } catch {
          return false;
        }
      },
      { timeout: 15000 },
    );
    await this.searchInput.fill(query);
    // Wait for URL to update — confirms debounce fired and React committed search state.
    // Must precede the response wait to ensure we don't assert before state is committed.
    await this.page.waitForURL((url) => url.searchParams.get('q') === query, {
      timeout: 15000,
    });
    await responsePromise;
  }

  /**
   * Clear the search input and wait for both the URL update and the API response.
   *
   * Same three-step pattern as search(): register response listener before clear(),
   * clear the input, wait for URL (q= param removed), then await response.
   */
  async clearSearch(): Promise<void> {
    const responsePromise = this.page.waitForResponse(
      (resp) => {
        if (!resp.url().includes('/api/work-items') || resp.status() !== 200) return false;
        try {
          const url = new URL(resp.url());
          return !url.searchParams.has('q');
        } catch {
          return false;
        }
      },
      { timeout: 10000 },
    );
    await this.searchInput.clear();
    await this.page.waitForURL((url) => !url.searchParams.has('q'), { timeout: 10000 });
    await responsePromise;
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
   * Find the table row (desktop) or card (mobile) whose title matches the given text,
   * then return a Locator for the area breadcrumb inside that row/card.
   *
   * Desktop: scoped to the <tr> containing a link with the given title.
   * Mobile: scoped to the card container element containing that title.
   *
   * Returns a Locator that may point to:
   *  - A <span class*="compact"> when an area is assigned (compact breadcrumb, no tabIndex)
   *  - A <span class*="muted"> with text "No area" when no area is assigned
   *
   * fix/1278: compact variant no longer has tabIndex=0 — selector updated accordingly.
   */
  getAreaBreadcrumbForItem(title: string): Locator {
    // We use filter({ hasText }) on the row, then look for either the compact span
    // or the muted "No area" span inside the title cell.
    const row = this.tableBody.locator('tr').filter({ hasText: title });
    const card = this.cardsContainer.locator('[class*="card"]').filter({ hasText: title });

    // Return a locator that covers both: the actual element is whichever is in the
    // visible container. Callers must await .textContent() or use expect().
    // The locator resolves to the compact span or the "No area" muted span.
    return row
      .locator('[class*="compact"], [class*="muted"]')
      .or(card.locator('[class*="compact"], [class*="muted"]'))
      .first();
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
