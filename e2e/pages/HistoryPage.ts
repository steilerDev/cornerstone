/**
 * Page Object Model for the History page (/history, #2224).
 *
 * The page renders (DOM order):
 * - h1 "History" in every state (loading, error, empty, list) and a description paragraph
 * - `history-filters`: the type chips (`FilterChipGroup`, test ids `history-type-<value>`,
 *   pick-one and deselectable), the "Filters" button (`history-filters-toggle`, shown below 768px
 *   only, `aria-expanded`, controls `#history-filter-panel`), and the filter panel
 *   (`#history-filter-panel`, hidden below 768px until the button is pressed, always visible
 *   from 768px): search (`history-search-input`), the Object action chip (`history-object-object`)
 *   with its always-mounted picker row, From/To (`history-date-from/to`), the include toggle
 *   (`history-include-diary`) and Clear filters (`history-clear-filters`, only while something
 *   is set)
 * - the hidden-notes line (`history-hidden-note`, `history-show-hidden`)
 * - two visually hidden `role="status"` regions (`history-hidden-status`, `history-result-status`)
 * - `history-feed`: day groups `date-group-<YYYY-MM-DD>` (an h2 plus a list), each row an `li`
 *   `system-event-<id>` (or a `diary-card-<id>` card for a saved manual entry)
 * - the `InfiniteScrollFooter` (`history-footer`, `history-sentinel`, `history-load-more-button`,
 *   `history-end-of-list`) once at least one row is loaded
 * - empty states through `EmptyState` (no testid; found by their message text), the first-load
 *   error `history-try-again` next to a FormError `role="alert"`
 *
 * The URL carries `q`, `type`, `object` (`<entityType>:<id>`), `dateFrom`, `dateTo` and
 * `include=diary`; writes are replace navigations, nothing is written on mount.
 */

import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { routeUrl } from '../../shared/src/routes/index.js';
import { SearchPickerControl } from './components/SearchPickerControl.js';

export const HISTORY_ROUTE = routeUrl('history');

/** The History type filter values, in chip order. */
export const HISTORY_TYPES = [
  'work_item_status',
  'invoice_status',
  'payment',
  'submission',
  'subsidy_status',
  'invoice_created',
  'milestone_delay',
  'budget_breach',
  'auto_reschedule',
] as const;

export class HistoryPage {
  readonly page: Page;

  readonly heading: Locator;
  readonly filters: Locator;
  readonly filtersToggle: Locator;
  readonly panel: Locator;
  readonly searchInput: Locator;
  readonly objectChip: Locator;
  readonly objectPickerInput: Locator;
  readonly objectPicker: SearchPickerControl;
  readonly dateFromInput: Locator;
  readonly dateToInput: Locator;
  readonly includeDiaryCheckbox: Locator;
  readonly clearFiltersButton: Locator;
  readonly feed: Locator;
  readonly hiddenNote: Locator;
  readonly showHiddenToggle: Locator;
  readonly resultStatus: Locator;
  readonly tryAgainButton: Locator;
  readonly footer: Locator;
  readonly loadMoreButton: Locator;
  readonly endOfListMessage: Locator;
  readonly footerError: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { level: 1, name: 'History', exact: true });
    this.filters = page.getByTestId('history-filters');
    this.filtersToggle = page.getByTestId('history-filters-toggle');
    this.panel = page.locator('#history-filter-panel');
    this.searchInput = page.getByTestId('history-search-input');
    this.objectChip = page.getByTestId('history-object-object');
    this.objectPickerInput = page.getByRole('textbox', {
      name: 'Find a task, invoice, grant or milestone',
    });
    this.objectPicker = new SearchPickerControl(page, this.objectPickerInput);
    this.dateFromInput = page.getByTestId('history-date-from');
    this.dateToInput = page.getByTestId('history-date-to');
    this.includeDiaryCheckbox = page.getByTestId('history-include-diary');
    this.clearFiltersButton = page.getByTestId('history-clear-filters');
    this.feed = page.getByTestId('history-feed');
    this.hiddenNote = page.getByTestId('history-hidden-note');
    this.showHiddenToggle = page.getByTestId('history-show-hidden');
    this.resultStatus = page.getByTestId('history-result-status');
    this.tryAgainButton = page.getByTestId('history-try-again');
    this.footer = page.getByTestId('history-footer');
    this.loadMoreButton = page.getByTestId('history-load-more-button');
    this.endOfListMessage = page.getByTestId('history-end-of-list');
    this.footerError = this.footer.getByRole('alert');
  }

  /** `/history` with the given query keys (empty values are dropped), heading awaited. */
  async goto(query: Record<string, string | undefined> = {}): Promise<void> {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value) search.set(key, value);
    }
    const suffix = search.size > 0 ? `?${search.toString()}` : '';
    await this.page.goto(`${HISTORY_ROUTE}${suffix}`);
    await this.heading.waitFor({ state: 'visible' });
  }

  /** The type chip for a History type value. */
  typeChip(type: string): Locator {
    return this.page.getByTestId(`history-type-${type}`);
  }

  /** Every system event row (an `li`; the row's inner parts are not list items). */
  eventRows(): Locator {
    return this.feed.locator('li[data-testid^="system-event-"]');
  }

  /** Every saved manual entry card shown through the include toggle. */
  diaryCards(): Locator {
    return this.feed.locator('[data-testid^="diary-card-"]');
  }

  /** A system event row by entry id. */
  systemEventRow(id: string): Locator {
    return this.page.getByTestId(`system-event-${id}`);
  }

  /** The link row of a system event ("Open task", "Open ‹funding source›", ...). */
  systemEventLink(id: string): Locator {
    return this.page.getByTestId(`system-event-${id}-link`);
  }

  /** The type badge text element of a system event ("Task status", "Invoice status", ...). */
  systemEventType(id: string): Locator {
    return this.page.getByTestId(`system-event-${id}-type`);
  }

  /** A day group by local day key (`YYYY-MM-DD`). */
  dateGroup(dayKey: string): Locator {
    return this.page.getByTestId(`date-group-${dayKey}`);
  }

  /** All day groups, in DOM order. */
  dateGroups(): Locator {
    return this.feed.locator('[data-testid^="date-group-"]');
  }

  /** The h2 of the day group that holds the row. */
  groupHeadingOf(row: Locator): Locator {
    return row.locator('xpath=ancestor::section[1]').getByRole('heading', { level: 2 });
  }

  /** The EmptyState block (no test id; found by its CSS module class like the Site diary's). */
  get emptyState(): Locator {
    return this.page.locator('[class*="emptyState"]').first();
  }

  /** The "Clear filters" action inside the filtered-empty state (not the panel's own button). */
  get emptyStateClearButton(): Locator {
    return this.emptyState.getByRole('button', { name: 'Clear filters', exact: true });
  }

  /** The type chip group (`role="group"`, scrolls sideways below 768px). */
  get typeChipGroup(): Locator {
    return this.filters.getByRole('group', { name: 'Filter by type', exact: true });
  }

  /**
   * Below 768px the non-type filters sit behind "Filters": press it when the panel is closed.
   * A no-op where the button does not exist (tablet, desktop: the panel is always visible).
   */
  async openFiltersIfCollapsed(): Promise<void> {
    if (!(await this.filtersToggle.isVisible())) return;
    if ((await this.filtersToggle.getAttribute('aria-expanded')) !== 'true') {
      await this.filtersToggle.click();
      await expect(this.filtersToggle).toHaveAttribute('aria-expanded', 'true');
    }
  }

  /** Type into the search field and wait for the debounced `q` to reach the URL. */
  async search(text: string): Promise<void> {
    await this.openFiltersIfCollapsed();
    await this.searchInput.fill(text);
    await expect(this.page).toHaveURL(new RegExp(`[?&]q=${encodeURIComponent(text)}`));
  }

  /** Open the Object chip's picker row and choose the one object whose result text matches. */
  async pickObject(searchText: string, rowText: string | RegExp = searchText): Promise<void> {
    await this.openFiltersIfCollapsed();
    await this.objectChip.click();
    await expect(this.objectChip).toHaveAttribute('aria-expanded', 'true');
    await this.objectPickerInput.waitFor({ state: 'visible' });
    await this.objectPicker.pick(searchText, rowText);
  }

  /** Scroll to the bottom to trigger the infinite-scroll sentinel. */
  async scrollToBottom(): Promise<void> {
    await this.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  }
}
