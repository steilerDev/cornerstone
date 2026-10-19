/**
 * Page Object Model for the Site diary list page (/diary), rebuilt on the feed row in #2225.
 *
 * The page renders (top to bottom):
 * - h1 "Site diary", the count line (data-testid="diary-entry-count", "<n> entries") with the
 *   "History ›" link (data-testid="diary-history-link"), and the one primary "Log today" link
 *   (data-testid="diary-log-today").
 * - The "Unfinished" row (data-testid="diary-unfinished"): up to 3 drafts, each
 *   `diary-unfinished-<id>` with `-continue` (-> /diary/:id/edit) and `-discard` (ConfirmDialog,
 *   prefix `diary-draft-discard`), plus "Show all n" (`diary-unfinished-show-all`, writes
 *   `?status=draft`) when more than 3. Hidden while `status=draft` is active.
 * - The toolbar: the search input (`diary-search-input`, id `diary-search`) and the Filters
 *   button (`diary-filters-button`). The Filters surface is a bottom Sheet below 768px
 *   (`diary-filters-sheet`) and an anchored panel from 768px (`diary-filters-panel`); both hold
 *   the same content (type chips `type-filter-<type>`, area picker `#diary-filter-area-input`,
 *   company picker `#diary-filter-company-input`, dates `diary-date-from` / `diary-date-to`).
 *   Filters apply live. Active filters show as chips (`diary-active-filter-<key>-remove`) with
 *   "Clear all" (`clear-filters-button`) under the toolbar.
 * - The feed (`role="feed"`): week groups `diary-week-<monday>` (FeedGroup, h2 "This week" /
 *   "Last week" / "Week of ...") holding rows `li[data-testid="diary-entry-<id>"]`. A row has the
 *   stretched title link `diary-entry-<id>-link`, type badge `diary-entry-<id>-type`, a thumbnail
 *   strip `diary-entry-<id>-thumbs` (up to 5 images + a "+n" tile), area chips
 *   `diary-entry-<id>-areas` and a `-signed` marker. Sub-elements share the row's testid prefix,
 *   so always select rows with `li[data-testid^="diary-entry-"]` (see `entryCards()`).
 * - Drafts leave the feed: it requests `status=saved` unless the URL has `status=draft`.
 * - States: first-load skeleton (`diary-loading`), nothing at all (`diary-empty`), filtered empty
 *   (`diary-filtered-empty`, action "Clear filters"), first-batch error (FormError + `diary-retry`).
 * - Infinite scroll footer `diary-footer` (sentinel, load-more, end-of-list) as before (#2060).
 */

import type { Page, Locator } from '@playwright/test';
import { expect } from '@playwright/test';
import { routeUrl } from '../../shared/src/routes/index.js';
import { SearchPickerControl } from './components/SearchPickerControl.js';

export const DIARY_ROUTE = routeUrl('diary');

/** Matches a row `li` only (sub-elements are never `li`s: `-link`, `-thumbs`, `-areas`, ...). */
const ROW_SELECTOR = 'li[data-testid^="diary-entry-"]';

export class DiaryPage {
  readonly page: Page;

  // Header
  readonly heading: Locator;
  /** The count line ("<n> entries"); also carries the History link. */
  readonly subtitle: Locator;
  readonly historyLink: Locator;
  readonly logTodayLink: Locator;

  // Toolbar and Filters
  readonly searchInput: Locator;
  readonly filtersButton: Locator;
  readonly filtersSheet: Locator;
  readonly filtersPanel: Locator;
  /** Whichever Filters surface the viewport shows. */
  readonly filtersSurface: Locator;
  readonly dateFromInput: Locator;
  readonly dateToInput: Locator;
  readonly dateRangeError: Locator;
  readonly sheetDoneButton: Locator;
  readonly sheetClearButton: Locator;
  readonly activeFilters: Locator;
  readonly clearFiltersButton: Locator;
  readonly areaPicker: SearchPickerControl;
  readonly companyPicker: SearchPickerControl;

  // Unfinished row
  readonly unfinished: Locator;
  readonly unfinishedShowAll: Locator;
  readonly discardDialog: Locator;
  readonly discardConfirm: Locator;
  readonly discardCancel: Locator;

  // Feed and states
  readonly timeline: Locator;
  readonly loading: Locator;
  readonly emptyState: Locator;
  readonly nothingAtAllState: Locator;
  readonly filteredEmptyState: Locator;
  readonly filteredEmptyClear: Locator;
  readonly errorBanner: Locator;
  readonly retryButton: Locator;

  // Infinite scroll footer (Issue #2060)
  readonly loadMoreButton: Locator;
  readonly endOfListMessage: Locator;
  readonly infiniteScrollSentinel: Locator;
  readonly footerError: Locator;

  constructor(page: Page) {
    this.page = page;

    this.heading = page.getByRole('heading', { level: 1, name: 'Site diary', exact: true });
    this.subtitle = page.getByTestId('diary-entry-count');
    this.historyLink = page.getByTestId('diary-history-link');
    this.logTodayLink = page.getByTestId('diary-log-today');

    this.searchInput = page.getByTestId('diary-search-input');
    this.filtersButton = page.getByTestId('diary-filters-button');
    this.filtersSheet = page.getByTestId('diary-filters-sheet');
    this.filtersPanel = page.getByTestId('diary-filters-panel');
    this.filtersSurface = this.filtersSheet.or(this.filtersPanel);
    this.dateFromInput = page.getByTestId('diary-date-from');
    this.dateToInput = page.getByTestId('diary-date-to');
    this.dateRangeError = page
      .locator('fieldset')
      .filter({ has: page.locator('#diary-date-from') })
      .getByText('The start date must be before the end date.');
    this.sheetDoneButton = page.getByTestId('diary-filters-done');
    this.sheetClearButton = page.getByTestId('diary-filters-sheet-clear');
    this.activeFilters = page.getByTestId('diary-active-filters');
    this.clearFiltersButton = page.getByTestId('clear-filters-button');
    this.areaPicker = new SearchPickerControl(page, 'diary-filter-area-input');
    this.companyPicker = new SearchPickerControl(page, 'diary-filter-company-input');

    this.unfinished = page.getByTestId('diary-unfinished');
    this.unfinishedShowAll = page.getByTestId('diary-unfinished-show-all');
    this.discardDialog = page.getByRole('alertdialog').filter({
      has: page.getByTestId('diary-draft-discard-cancel'),
    });
    this.discardConfirm = page.getByTestId('diary-draft-discard-confirm');
    this.discardCancel = page.getByTestId('diary-draft-discard-cancel');

    this.timeline = page.getByRole('feed');
    this.loading = page.getByTestId('diary-loading');
    this.nothingAtAllState = page.getByTestId('diary-empty');
    this.filteredEmptyState = page.getByTestId('diary-filtered-empty');
    this.emptyState = this.nothingAtAllState.or(this.filteredEmptyState);
    this.filteredEmptyClear = this.filteredEmptyState.getByRole('button', {
      name: 'Clear filters',
      exact: true,
    });
    this.retryButton = page.getByTestId('diary-retry');
    this.footerError = page.getByTestId('diary-footer').getByRole('alert');
    // A first-batch failure shows a FormError beside the Retry button; later failures show the
    // footer's own alert.
    this.errorBanner = this.footerError.or(this.retryButton.locator('xpath=..').getByRole('alert'));

    this.loadMoreButton = page.getByTestId('diary-load-more-button');
    this.endOfListMessage = page.getByTestId('diary-end-of-list');
    this.infiniteScrollSentinel = page.getByTestId('diary-sentinel');
  }

  /** Navigate to the diary list page and wait for the heading. */
  async goto(): Promise<void> {
    await this.page.goto(DIARY_ROUTE);
    await this.heading.waitFor({ state: 'visible' });
  }

  /** Navigate to the drafts-only feed ("Show all n" target) and wait for the heading. */
  async filterDraftsOnly(): Promise<void> {
    await this.page.goto(`${DIARY_ROUTE}?status=draft`);
    await this.heading.waitFor({ state: 'visible' });
  }

  /**
   * Wait for the first batch to settle: the feed, an empty state or an error.
   * No explicit timeout - project-level actionTimeout applies.
   */
  async waitForLoaded(): Promise<void> {
    await Promise.race([
      this.timeline.waitFor({ state: 'visible' }),
      this.emptyState.waitFor({ state: 'visible' }),
      this.errorBanner.waitFor({ state: 'visible' }),
    ]);
  }

  /** Scroll down to trigger the infinite-scroll sentinel (or reach the end-of-list message). */
  async scrollToLoadMore(): Promise<void> {
    const responsePromise = this.page
      .waitForResponse((resp) => resp.url().includes('/api/diary-entries'))
      .catch(() => null);
    await this.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await Promise.race([responsePromise, this.endOfListMessage.waitFor({ state: 'visible' })]);
  }

  // ── Rows and groups ────────────────────────────────────────────────────────

  /** Every entry row currently rendered (rows only, not their sub-elements). */
  entryCards(): Locator {
    return this.page.locator(ROW_SELECTOR);
  }

  /** The row `li` of one entry. */
  entryCard(id: string): Locator {
    return this.page.getByTestId(`diary-entry-${id}`);
  }

  /** The stretched title link of a row (opens /diary/:id, or /diary/:id/edit for a draft). */
  entryLink(id: string): Locator {
    return this.page.getByTestId(`diary-entry-${id}-link`);
  }

  /** The type badge of a row. */
  typeBadge(id: string): Locator {
    return this.page.getByTestId(`diary-entry-${id}-type`);
  }

  /** The thumbnail strip of a row (absent without photos). */
  thumbs(id: string): Locator {
    return this.page.getByTestId(`diary-entry-${id}-thumbs`);
  }

  /** The `<img>` thumbnails of a row. */
  thumbImages(id: string): Locator {
    return this.thumbs(id).locator('img');
  }

  /** The area chip list of a row. */
  areaChips(id: string): Locator {
    return this.page.getByTestId(`diary-entry-${id}-areas`);
  }

  /** The "Signed" marker of a row. */
  signedMarker(id: string): Locator {
    return this.page.getByTestId(`diary-entry-${id}-signed`);
  }

  /** Every week group (FeedGroup) in render order. */
  weekGroups(): Locator {
    return this.page.locator('[data-testid^="diary-week-"]');
  }

  /** Alias kept for specs written before the week groups. */
  dateGroups(): Locator {
    return this.weekGroups();
  }

  /** One week group by its Monday (YYYY-MM-DD). */
  weekGroup(monday: string): Locator {
    return this.page.getByTestId(`diary-week-${monday}`);
  }

  /** The Draft badge on a row (only in the `status=draft` feed). */
  getDraftBadge(entryId: string): Locator {
    return this.page.getByTestId(`draft-badge-${entryId}`);
  }

  /** A system event row (none on the Site diary since #2224). */
  systemEventRow(id: string): Locator {
    return this.page.getByTestId(`system-event-${id}`);
  }

  /** Every system event row on the page. */
  systemEventRowsAny(): Locator {
    return this.page.locator('li[data-testid^="system-event-"]');
  }

  /** The link row of a system event. */
  systemEventLink(id: string): Locator {
    return this.page.getByTestId(`system-event-${id}-link`);
  }

  /** Mode chips (All / Manual / History) were removed in #2224; used to assert they are gone. */
  get modeChips(): Locator {
    return this.page.locator('[data-testid^="mode-filter-"]');
  }

  // ── Unfinished row ─────────────────────────────────────────────────────────

  unfinishedRow(id: string): Locator {
    return this.page.getByTestId(`diary-unfinished-${id}`);
  }

  continueLink(id: string): Locator {
    return this.page.getByTestId(`diary-unfinished-${id}-continue`);
  }

  discardButton(id: string): Locator {
    return this.page.getByTestId(`diary-unfinished-${id}-discard`);
  }

  // ── Filters ────────────────────────────────────────────────────────────────

  /** The type chip inside the Filters surface (open it first). */
  typeFilterChip(type: string): Locator {
    return this.page.getByTestId(`type-filter-${type}`);
  }

  /** The removable chip of an active filter (`type-<type>`, `area`, `company`, `from`, `to`). */
  activeChipRemove(key: string): Locator {
    return this.page.getByTestId(`diary-active-filter-${key}-remove`);
  }

  /** Open the Filters surface (sheet or panel, whichever the viewport shows) if it is closed. */
  async openFilters(): Promise<void> {
    if (await this.filtersSurface.isVisible()) return;
    await this.filtersButton.click();
    await this.filtersSurface.waitFor({ state: 'visible' });
  }

  /** Close the Filters surface: "Done" in the sheet, Escape in the anchored panel. */
  async closeFilters(): Promise<void> {
    if (!(await this.filtersSurface.isVisible())) return;
    if (await this.filtersSheet.isVisible()) {
      await this.sheetDoneButton.click();
    } else {
      await this.page.keyboard.press('Escape');
    }
    await expect(this.filtersSurface).toBeHidden();
  }

  /** Pick an area in the open Filters surface (types two or more characters of its name). */
  async pickArea(name: string): Promise<void> {
    await this.openFilters();
    await this.areaPicker.input.fill('');
    await this.areaPicker.input.fill(name);
    await this.areaPicker.option(name).first().click();
  }

  /** Pick a company in the open Filters surface. */
  async pickCompany(name: string): Promise<void> {
    await this.openFilters();
    await this.companyPicker.input.fill('');
    await this.companyPicker.input.fill(name);
    await this.companyPicker.option(name).first().click();
  }

  // ── Search and counts ──────────────────────────────────────────────────────

  /** Type a search query and wait for the debounced API response and the DOM update. */
  async search(query: string): Promise<void> {
    const responsePromise = this.page.waitForResponse(
      (resp) => resp.url().includes('/api/diary-entries') && resp.status() === 200,
    );
    await this.searchInput.fill(query);
    await responsePromise;
    await this.waitForLoaded();
  }

  /** Clear the search input and wait for the API response and the DOM update. */
  async clearSearch(): Promise<void> {
    const responsePromise = this.page.waitForResponse(
      (resp) => resp.url().includes('/api/diary-entries') && resp.status() === 200,
    );
    await this.searchInput.clear();
    await responsePromise;
    await this.waitForLoaded();
  }

  /** The number in the count line ("42 entries"), or null when it is not visible. */
  async getEntryCount(): Promise<number | null> {
    try {
      await this.subtitle.waitFor({ state: 'visible' });
      const text = await this.subtitle.textContent();
      const match = text?.match(/(\d+)/);
      return match?.[1] ? parseInt(match[1], 10) : null;
    } catch {
      return null;
    }
  }
}
