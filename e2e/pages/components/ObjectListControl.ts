/**
 * Component POM for the shared `ObjectList` template (#2238, #2245, #2246): everything the
 * Invoices, Tasks, Purchases, Companies and Milestones lists have in common. The page POMs
 * (`HouseholdItemsPage`, `VendorsPage`, `MilestonesPage`) compose it with their own prefix.
 *
 * DOM facts (all verified in `client/src/components/ObjectList/`):
 * - A table surface and a card surface are BOTH mounted and switched by the list's own width
 *   (768 px container query), so every row locator is `.visible()`-filtered. Table ids are
 *   `<prefix>-<part>-<id>`, card ids `<prefix>-<part>-mobile-<id>` (`dataTableTestId`).
 * - Toolbar: `<prefix>-search`, chips `<prefix>-chip-<value|all>`, optional overflow menu
 *   `<prefix>-chip-more` (options `<prefix>-chip-more-<value>`), Filters
 *   (`<prefix>-filters-button`; anchored panel `<prefix>-filters-panel` from 768 px, Sheet
 *   `<prefix>-filters-sheet` below), Group by (`<prefix>-group-menu`, options
 *   `<prefix>-group-<value|none>`), Sort (`<prefix>-sort-menu`, options `<prefix>-sort-<value>`).
 * - Choosing a radio item in the Group by / Sort menus does NOT close the menu.
 * - The page ⋯ menu is `<prefix>-page-menu`; Columns… is `<prefix>-columns`.
 */

import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

export class ObjectListControl {
  readonly page: Page;
  readonly prefix: string;
  /** The list's accessible name (the `<section aria-label>`): the page title. */
  readonly title: string;
  /** Whether a response is the list's own data request (for search waits). */
  private readonly isListResponse: (url: URL) => boolean;

  readonly list: Locator;
  readonly listSection: Locator;
  readonly tableSurface: Locator;
  /** The title links of the visible surface (one per visible row). */
  readonly titleLinks: Locator;
  /** The list's own EmptyState (inside the list section). */
  readonly emptyState: Locator;
  readonly retryButton: Locator;
  readonly statusRegion: Locator;

  readonly pageMenuButton: Locator;
  readonly searchInput: Locator;
  readonly searchingAll: Locator;
  readonly clearFiltersButton: Locator;
  readonly note: Locator;
  readonly filtersButton: Locator;
  readonly filtersSheet: Locator;
  readonly filtersPanel: Locator;
  /** Whichever Filters surface the viewport shows. */
  readonly filtersSurface: Locator;
  readonly filtersDoneButton: Locator;
  readonly groupMenuButton: Locator;
  readonly sortMenuButton: Locator;
  readonly chipMoreButton: Locator;

  /** Whether the list's data request carries the search as `q` (Milestones filter on the client). */
  private readonly queryInApi: boolean;

  constructor(
    page: Page,
    prefix: string,
    title: string,
    isListResponse: (url: URL) => boolean,
    queryInApi = true,
  ) {
    this.page = page;
    this.queryInApi = queryInApi;
    this.prefix = prefix;
    this.title = title;
    this.isListResponse = isListResponse;

    this.list = page.getByTestId(`${prefix}-list`);
    this.listSection = this.list.locator(`section[aria-label="${title}"]`);
    this.tableSurface = this.list.locator('table');
    this.titleLinks = page.locator(`a[data-testid^="${prefix}-title-"]`).visible();
    // .first(): the EmptyState wrapper holds child elements whose class also contains the name
    this.emptyState = this.listSection.locator('[class*="emptyState"]').first();
    this.retryButton = page.getByTestId(`${prefix}-retry`);
    this.statusRegion = this.list.getByRole('status');

    this.pageMenuButton = page.getByTestId(`${prefix}-page-menu`);
    this.searchInput = page.getByTestId(`${prefix}-search`);
    this.searchingAll = page.getByTestId(`${prefix}-searching-all`);
    this.clearFiltersButton = page.getByTestId(`${prefix}-clear-filters`);
    this.note = page.getByTestId(`${prefix}-note`);
    this.filtersButton = page.getByTestId(`${prefix}-filters-button`);
    this.filtersSheet = page.getByTestId(`${prefix}-filters-sheet`);
    this.filtersPanel = page.getByTestId(`${prefix}-filters-panel`);
    this.filtersSurface = this.filtersSheet.or(this.filtersPanel);
    this.filtersDoneButton = page.getByTestId(`${prefix}-filters-done`);
    this.groupMenuButton = page.getByTestId(`${prefix}-group-menu`);
    this.sortMenuButton = page.getByTestId(`${prefix}-sort-menu`);
    this.chipMoreButton = page.getByTestId(`${prefix}-chip-more`);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Rows
  // ───────────────────────────────────────────────────────────────────────────

  /** A row part on whichever surface is visible: table `<prefix>-<part>-<id>`, card `...-mobile-`. */
  part(part: string, id: string): Locator {
    const p = `${this.prefix}-${part}`;
    return this.page
      .locator(`[data-testid="${p}-${id}"], [data-testid="${p}-mobile-${id}"]`)
      .visible();
  }

  /** The row (table `tr` or card `li`) of an object, by id. */
  row(id: string): Locator {
    return this.part('row', id);
  }

  /**
   * The row (table) or card of the object whose title link reads exactly `title`. Scoped to the
   * title link, so names that other rows quote (Waits for, relation links) never match.
   * `tr`/`li` only, so the `<prefix>-row-menu-*` buttons never match.
   */
  rowByTitle(title: string): Locator {
    const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return this.page
      .locator(
        `tr[data-testid^="${this.prefix}-row-"], li[data-testid^="${this.prefix}-row-mobile-"]`,
      )
      .filter({
        has: this.page.locator(`a[data-testid^="${this.prefix}-title-"]`).filter({
          hasText: new RegExp(`^\\s*${escaped}\\s*$`),
        }),
      })
      .visible();
  }

  /** The id of the object whose title is shown (read from the title link's test id). */
  async idOf(title: string): Promise<string> {
    const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const link = this.titleLinks.filter({ hasText: new RegExp(`^\\s*${escaped}\\s*$`) }).first();
    const testId = await link.getAttribute('data-testid');
    if (!testId) throw new Error(`"${title}" not found in the ${this.prefix} list`);
    return testId.replace(new RegExp(`^${this.prefix}-title-(mobile-)?`), '');
  }

  titleLink(id: string): Locator {
    return this.part('title', id);
  }

  rowMenuTrigger(id: string): Locator {
    return this.part('row-menu', id);
  }

  /** Open the ⋯ menu of a row and click one of its entries (`open`, `delete`, ...). */
  async chooseRowMenu(id: string, entry: string, testIdBase = `${this.prefix}`): Promise<void> {
    await this.rowMenuTrigger(id).click();
    const idPart = `${testIdBase}-${entry}`;
    await this.page
      .locator(`[data-testid="${idPart}-${id}"], [data-testid="${idPart}-mobile-${id}"]`)
      .visible()
      .click();
  }

  /** Whether the table surface (list width of 768 px or more) is the visible one. */
  async isTableSurface(): Promise<boolean> {
    return this.tableSurface.isVisible();
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Loading
  // ───────────────────────────────────────────────────────────────────────────

  /** Wait until the first batch rendered: rows, a group, the empty state or the load failure. */
  async waitForLoaded(): Promise<void> {
    await this.listSection.waitFor({ state: 'attached' });
    await expect(this.listSection).not.toHaveAttribute('aria-busy', 'true');
    await expect(
      this.titleLinks
        .first()
        .or(this.emptyState)
        .or(this.retryButton)
        .or(this.groupToggles().first())
        .first(),
    ).toBeVisible();
  }

  /** The visible titles, in order. */
  async getTitles(): Promise<string[]> {
    return (await this.titleLinks.allTextContents()).map((s) => s.trim()).filter(Boolean);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Search
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Type a search and wait for the URL (debounce fired) and the list's own answer. The response
   * listener is registered before typing.
   */
  async search(query: string): Promise<void> {
    // The same search again changes nothing, so no request follows
    if ((await this.searchInput.inputValue()) === query) return;
    const answered = this.page.waitForResponse((resp) => {
      if (resp.request().method() !== 'GET' || resp.status() !== 200) return false;
      try {
        const url = new URL(resp.url());
        return (
          this.isListResponse(url) && (!this.queryInApi || url.searchParams.get('q') === query)
        );
      } catch {
        return false;
      }
    });
    await this.searchInput.fill(query);
    await this.page.waitForURL((url) => url.searchParams.get('q') === query);
    await answered;
    await expect(this.listSection).not.toHaveAttribute('aria-busy', 'true');
  }

  async clearSearch(): Promise<void> {
    const answered = this.page.waitForResponse((resp) => {
      if (resp.request().method() !== 'GET' || resp.status() !== 200) return false;
      try {
        const url = new URL(resp.url());
        return this.isListResponse(url) && (!this.queryInApi || !url.searchParams.has('q'));
      } catch {
        return false;
      }
    });
    await this.searchInput.clear();
    await this.page.waitForURL((url) => !url.searchParams.has('q'));
    await answered;
    await expect(this.listSection).not.toHaveAttribute('aria-busy', 'true');
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Chips, group by, sort
  // ───────────────────────────────────────────────────────────────────────────

  chip(value: string): Locator {
    return this.page.getByTestId(`${this.prefix}-chip-${value}`);
  }

  async selectChip(value: string): Promise<void> {
    await this.chip(value).click();
    await expect(this.chip(value)).toHaveAttribute('aria-pressed', 'true');
  }

  /** The chip's number from its "‹word› (n)" label; null while there is none. */
  async chipCount(value: string): Promise<number | null> {
    const text = (await this.chip(value).innerText()).replace(/\s+/g, ' ');
    const match = /\((\d+)\)/.exec(text);
    return match ? Number(match[1]) : null;
  }

  /** The option of the "More" chip menu (opens the menu when it is closed). */
  async chipMoreOption(value: string): Promise<Locator> {
    const option = this.page.getByTestId(`${this.prefix}-chip-more-${value}`);
    if (!(await option.isVisible())) await this.chipMoreButton.click();
    await option.waitFor({ state: 'visible' });
    return option;
  }

  /** Pick an entry of the "More" chip menu and close the menu. */
  async chooseChipMore(value: string): Promise<void> {
    const option = await this.chipMoreOption(value);
    await option.click();
    await this.page.keyboard.press('Escape');
    await expect(option).toBeHidden();
  }

  /**
   * Choose an option of a Group by / Sort menu. Choosing a radio item does not close the menu, so
   * open it only when it is not open yet, and close it again with Escape.
   */
  private async chooseMenuOption(trigger: Locator, option: Locator): Promise<void> {
    if (!(await option.isVisible())) await trigger.click();
    await option.click();
    await this.page.keyboard.press('Escape');
    await expect(option).toBeHidden();
  }

  async setGroupBy(value: string): Promise<void> {
    await this.chooseMenuOption(
      this.groupMenuButton,
      this.page.getByTestId(`${this.prefix}-group-${value}`),
    );
  }

  async setSort(value: string, direction?: 'asc' | 'desc'): Promise<void> {
    await this.chooseMenuOption(
      this.sortMenuButton,
      this.page.getByTestId(`${this.prefix}-sort-${value}`),
    );
    if (direction) {
      await this.chooseMenuOption(
        this.sortMenuButton,
        this.page.getByTestId(`${this.prefix}-sort-${direction}`),
      );
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Groups
  // ───────────────────────────────────────────────────────────────────────────

  groupToggles(): Locator {
    return this.page.locator(`button[data-testid^="${this.prefix}-group-toggle-"]`).visible();
  }

  groupToggle(key: string): Locator {
    return this.part('group-toggle', key);
  }

  /** Keys of the visible group toggles, in render order. */
  async groupKeys(): Promise<string[]> {
    const ids = await this.groupToggles().evaluateAll((els) =>
      els.map((el) => el.getAttribute('data-testid') ?? ''),
    );
    return ids.map((id) => id.replace(new RegExp(`^${this.prefix}-group-toggle-(mobile-)?`), ''));
  }

  async expandGroup(key: string): Promise<void> {
    const toggle = this.groupToggle(key);
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Filters panel
  // ───────────────────────────────────────────────────────────────────────────

  async openFilters(): Promise<void> {
    if (await this.filtersSurface.isVisible()) return;
    await this.filtersButton.click();
    await this.filtersSurface.waitFor({ state: 'visible' });
  }

  /** Close the Filters surface: "Done" in the sheet, Escape in the anchored panel. */
  async closeFilters(): Promise<void> {
    if (!(await this.filtersSurface.isVisible())) return;
    if (await this.filtersSheet.isVisible()) {
      await this.filtersDoneButton.click();
    } else {
      await this.page.keyboard.press('Escape');
    }
    await expect(this.filtersSurface).toBeHidden();
  }

  /** The `from|to` input of a date range filter `<prefix>-filter-<param>-<side>`. */
  dateInput(param: string, side: 'from' | 'to'): Locator {
    return this.page.getByTestId(`${this.prefix}-filter-${param}-${side}`);
  }

  /** The `min|max` input of a number range filter. */
  numberInput(param: string, side: 'min' | 'max'): Locator {
    return this.page.getByTestId(`${this.prefix}-filter-${param}-${side}`);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Columns (table surface only)
  // ───────────────────────────────────────────────────────────────────────────

  /** A column header of the table surface (a string matches the start of the name). */
  columnHeader(label: string | RegExp): Locator {
    const name =
      typeof label === 'string'
        ? new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
        : label;
    return this.tableSurface.getByRole('columnheader', { name });
  }

  /** Open the Columns… dialog from the page ⋯ menu. */
  async openColumnsDialog(): Promise<Locator> {
    await this.pageMenuButton.click();
    await this.page.getByTestId(`${this.prefix}-columns`).click();
    const dialog = this.page.getByRole('dialog', { name: 'Columns' });
    await dialog.waitFor({ state: 'visible' });
    return dialog;
  }
}
