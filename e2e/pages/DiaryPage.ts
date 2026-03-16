/**
 * Page Object Model for the Construction Diary list page (/diary)
 *
 * The page renders:
 * - A page header with h1 "Construction Diary" and a subtitle with the total entry count
 * - A DiaryFilterBar with search input (data-testid="diary-search-input"), date range pickers,
 *   entry type chip filters, and a "Clear all" button
 * - A "New Entry" link button navigating to /diary/new
 * - A timeline of DiaryDateGroup sections (data-testid="date-group-{date}"), each containing
 *   DiaryEntryCard links (data-testid="diary-card-{id}")
 * - An empty state (class emptyState from shared.module.css) with a "Create your first entry" link
 * - A live region (role="status") that announces loaded entry count
 * - Pagination: "Previous"/"Next" buttons (data-testid: prev-page-button / next-page-button)
 *
 * Key DOM observations from source:
 * - h1 has class styles.title (CSS module), not a data-testid; use role heading
 * - Empty state uses shared.emptyState CSS module class, not a data-testid
 * - Date group sections: data-testid="date-group-YYYY-MM-DD"
 * - Entry cards: data-testid="diary-card-{id}" (rendered as <Link>)
 * - Filter bar wrapper: data-testid="diary-filter-bar"
 * - Search input: data-testid="diary-search-input" (also id="diary-search")
 * - Type chips: data-testid="type-filter-{type}"
 * - Clear filters: data-testid="clear-filters-button"
 * - Pagination buttons: data-testid="prev-page-button" / data-testid="next-page-button"
 */

import type { Page, Locator } from '@playwright/test';

export const DIARY_ROUTE = '/diary';

export class DiaryPage {
  readonly page: Page;

  // Page header
  readonly heading: Locator;
  readonly subtitle: Locator;

  // Filter bar
  readonly filterBar: Locator;
  readonly searchInput: Locator;
  readonly dateFromInput: Locator;
  readonly dateToInput: Locator;
  readonly clearFiltersButton: Locator;

  // "New Entry" button
  readonly newEntryButton: Locator;

  // Timeline and entry cards
  readonly timeline: Locator;

  // Empty state — uses shared.emptyState CSS module; .first() to avoid strict-mode collision
  // with child elements that may also carry an "emptyState" class token
  readonly emptyState: Locator;

  // Error banner
  readonly errorBanner: Locator;

  // Pagination
  readonly prevPageButton: Locator;
  readonly nextPageButton: Locator;

  // Mobile filter toggle button (visible only on mobile, aria-label="Toggle filters")
  readonly mobileFilterToggle: Locator;

  constructor(page: Page) {
    this.page = page;

    this.heading = page.getByRole('heading', { level: 1, name: 'Construction Diary' });
    // The subtitle is a <p> sibling of the heading inside the header element
    this.subtitle = page.locator('[class*="subtitle"]');

    this.filterBar = page.getByTestId('diary-filter-bar');
    this.searchInput = page.getByTestId('diary-search-input');
    this.dateFromInput = page.getByTestId('diary-date-from');
    this.dateToInput = page.getByTestId('diary-date-to');
    this.clearFiltersButton = page.getByTestId('clear-filters-button');

    this.mobileFilterToggle = page.getByRole('button', { name: 'Toggle filters' });

    this.newEntryButton = page.getByRole('link', { name: 'New Entry', exact: true });

    this.timeline = page.locator('[class*="timeline"]');

    // Empty state — conditional render: `{!isLoading && entries.length === 0 && <div ...>}`
    // Uses shared.emptyState CSS class. Use .first() in case multiple containers appear.
    this.emptyState = page.locator('[class*="emptyState"]').first();

    this.errorBanner = page.locator('[class*="bannerError"]');

    this.prevPageButton = page.getByTestId('prev-page-button');
    this.nextPageButton = page.getByTestId('next-page-button');
  }

  /**
   * Navigate to the diary list page and wait for the heading to be visible.
   * No explicit timeout — uses project-level actionTimeout.
   */
  async goto(): Promise<void> {
    await this.page.goto(DIARY_ROUTE);
    await this.heading.waitFor({ state: 'visible' });
  }

  /**
   * Wait for the page to finish its initial data fetch.
   * Races: timeline visible, empty state visible, or error banner visible.
   * No explicit timeout — uses project-level actionTimeout.
   */
  async waitForLoaded(): Promise<void> {
    await Promise.race([
      this.timeline.waitFor({ state: 'visible' }),
      this.emptyState.waitFor({ state: 'visible' }),
      this.errorBanner.waitFor({ state: 'visible' }),
    ]);
  }

  /**
   * Get all entry card locators currently rendered in the timeline.
   */
  entryCards(): Locator {
    return this.page.locator('[data-testid^="diary-card-"]');
  }

  /**
   * Get all date group section locators currently rendered.
   */
  dateGroups(): Locator {
    return this.page.locator('[data-testid^="date-group-"]');
  }

  /**
   * Get the entry card for a specific entry ID.
   */
  entryCard(id: string): Locator {
    return this.page.getByTestId(`diary-card-${id}`);
  }

  /**
   * Get the type filter chip button for the given type.
   */
  typeFilterChip(type: string): Locator {
    return this.page.getByTestId(`type-filter-${type}`);
  }

  /**
   * Get the photo count badge on an entry card.
   * data-testid="photo-count-{id}" — visible only when photoCount > 0.
   */
  photoCountBadge(entryId: string): Locator {
    return this.page.getByTestId(`photo-count-${entryId}`);
  }

  /**
   * On mobile (max-width: 767px) the filter panel (containing the search input,
   * date pickers, and type chips) is hidden behind a toggle button.  Call this
   * before interacting with any filter control to ensure the panel is expanded.
   * On desktop/tablet the toggle button is display:none, so isVisible() returns
   * false and this is a no-op.
   */
  async openFiltersIfCollapsed(): Promise<void> {
    const toggleVisible = await this.mobileFilterToggle.isVisible();
    if (toggleVisible) {
      // Only click if the filter panel is currently closed (search input hidden)
      const searchVisible = await this.searchInput.isVisible();
      if (!searchVisible) {
        await this.mobileFilterToggle.click();
        // Wait for the filter panel to open (search input becomes visible)
        await this.searchInput.waitFor({ state: 'visible' });
      }
    }
  }

  /**
   * Type a search query and wait for the debounced API response and DOM update.
   * The response listener is registered BEFORE the fill action to avoid a race
   * condition (debounce + API round-trip can fire and complete before the next
   * line executes, especially on WebKit).
   * On mobile the filter panel must be opened first via the toggle button.
   */
  async search(query: string): Promise<void> {
    await this.openFiltersIfCollapsed();
    const responsePromise = this.page.waitForResponse(
      (resp) => resp.url().includes('/api/diary-entries') && resp.status() === 200,
    );
    await this.searchInput.scrollIntoViewIfNeeded();
    await this.searchInput.waitFor({ state: 'visible' });
    await this.searchInput.fill(query);
    await responsePromise;
    await this.waitForLoaded();
  }

  /**
   * Clear the search input and wait for the API response and DOM update.
   * On mobile the filter panel must be opened first via the toggle button.
   */
  async clearSearch(): Promise<void> {
    await this.openFiltersIfCollapsed();
    const responsePromise = this.page.waitForResponse(
      (resp) => resp.url().includes('/api/diary-entries') && resp.status() === 200,
    );
    await this.searchInput.clear();
    await responsePromise;
    await this.waitForLoaded();
  }

  /**
   * Get the total entry count from the subtitle text (e.g. "42 entries").
   * Returns null if the subtitle is not visible.
   */
  async getEntryCount(): Promise<number | null> {
    try {
      await this.subtitle.waitFor({ state: 'visible' });
      const text = await this.subtitle.textContent();
      const match = text?.match(/(\d+)/);
      return match ? parseInt(match[1], 10) : null;
    } catch {
      return null;
    }
  }
}
