/**
 * Page Object Model for Tasks (/project/work-items), the second ObjectList adopter (#2245,
 * EPIC-21 P5.1). The anatomy is the Invoices one (see `InvoicesPage.ts`) with the prefix `tasks-`.
 *
 * The page renders:
 * - h1 "Tasks" (no count; "Tasks (n of m)" while a search or filter is active, a chip alone is not
 *   a filter), the one primary "New task" (`new-work-item-button`) and the page ⋯ menu
 *   (`tasks-page-menu`).
 * - The toolbar: search (`tasks-search`), the status chips `tasks-chip-<not_started|in_progress|
 *   completed|all>` (none pressed by default), Filters (`tasks-filters-button`; anchored panel
 *   `tasks-filters-panel` from 768 px, Sheet `tasks-filters-sheet` below), Group by
 *   (`tasks-group-menu`, options `tasks-group-<none|time|area|company|status>`) and Sort
 *   (`tasks-sort-menu`, options `tasks-sort-<value>`).
 * - Filters: Area (`#tasks-filter-areaId`, EntityPicker with a "No area" special option), Who =
 *   Company (`#tasks-filter-assignedVendorId`, EntityPicker) + Household member
 *   (`tasks-filter-member`, select), Milestone (`tasks-filter-milestone`, select), Start date /
 *   End date (`tasks-filter-<startDate|endDate>-<from|to>`) and Cost lines
 *   (`tasks-filter-budgetLines-<min|max>`).
 * - The list (`tasks-list`): a table surface and a card surface are BOTH mounted and switched by
 *   the list's own width (768 px container query), so every row locator is `.visible()`-filtered.
 *   Table ids are `tasks-<part>-<id>`, card ids `tasks-<part>-mobile-<id>`. Groups: toggle
 *   `tasks-group-toggle-<key>` (card `...-mobile-<key>`), keys `late|this_week|next_two_weeks|
 *   later|done` (Time), an area id or `__none__` (Area/Company), the status (Status). A group
 *   that is collapsed (Done while other groups have rows) hides its rows.
 * - Row parts: `row`, `select`, `title`, `status`, `schedule-signal`, `critical`, `row-menu`;
 *   table only: `area`, `work-item-grants`, `waits-for`, `holds-up`, `command` (StatusMenu
 *   "Start" / "Mark done"). In the ⋯ menu: `open`, `delete`, `reopen`, and on a card the
 *   `command` entry (`tasks-command-mobile-<id>`, applies without the date step).
 * - The selection bar (`tasks-selection-bar`) with Set status (`tasks-bulk-status`, menu items
 *   `tasks-bulk-status-<status>`) and Set area (`tasks-bulk-set-area`, dialog
 *   `tasks-bulk-area-dialog`); a bulk failure banner `tasks-bulk-error`.
 * - The delete ConfirmDialog (testid prefix `work-item-list-delete`).
 */

import type { Page, Locator } from '@playwright/test';
import { expect } from '@playwright/test';
import { routeUrl } from '../../shared/src/routes/index.js';
import { EntityPickerControl } from './components/EntityPickerControl.js';
import { StatusMenuControl } from './components/StatusMenuControl.js';

export const WORK_ITEMS_ROUTE = routeUrl('workItems');

export type TaskChip = 'not_started' | 'in_progress' | 'completed' | 'all';
export type TaskGroupBy = 'none' | 'time' | 'area' | 'company' | 'status';
export type TaskWindowKey = 'late' | 'this_week' | 'next_two_weeks' | 'later' | 'done';

export class WorkItemsPage {
  readonly page: Page;

  // Header
  /** The h1: "Tasks" or "Tasks (n of m)". */
  readonly heading: Locator;
  readonly newWorkItemButton: Locator;
  readonly pageMenuButton: Locator;

  // Toolbar
  readonly searchInput: Locator;
  readonly filtersButton: Locator;
  readonly filtersSheet: Locator;
  readonly filtersPanel: Locator;
  /** Whichever Filters surface the viewport shows. */
  readonly filtersSurface: Locator;
  readonly filtersDoneButton: Locator;
  readonly groupMenuButton: Locator;
  readonly sortMenuButton: Locator;
  readonly note: Locator;

  // Filters
  readonly areaFilter: EntityPickerControl;
  readonly companyFilter: EntityPickerControl;
  readonly memberFilter: Locator;
  readonly milestoneFilter: Locator;

  // List
  readonly list: Locator;
  readonly listSection: Locator;
  /** The title links of the visible surface (one per visible row). */
  readonly titleLinks: Locator;
  readonly emptyState: Locator;
  readonly retryButton: Locator;
  readonly tableSurface: Locator;
  /** The list's single polite status region (announcements). */
  readonly statusRegion: Locator;

  // Selection and bulk
  readonly selectionBar: Locator;
  readonly bulkStatusButton: Locator;
  readonly bulkSetAreaButton: Locator;
  readonly bulkAreaDialog: Locator;
  readonly bulkError: Locator;

  // Delete confirmation (shared ConfirmDialog)
  readonly deleteModal: Locator;
  readonly deleteConfirmButton: Locator;
  readonly deleteCancelButton: Locator;

  constructor(page: Page) {
    this.page = page;

    this.heading = page.getByRole('heading', { level: 1, name: /^Tasks(\s|$)/ });
    this.newWorkItemButton = page.getByTestId('new-work-item-button');
    this.pageMenuButton = page.getByTestId('tasks-page-menu');

    this.searchInput = page.getByTestId('tasks-search');
    this.filtersButton = page.getByTestId('tasks-filters-button');
    this.filtersSheet = page.getByTestId('tasks-filters-sheet');
    this.filtersPanel = page.getByTestId('tasks-filters-panel');
    this.filtersSurface = this.filtersSheet.or(this.filtersPanel);
    this.filtersDoneButton = page.getByTestId('tasks-filters-done');
    this.groupMenuButton = page.getByTestId('tasks-group-menu');
    this.sortMenuButton = page.getByTestId('tasks-sort-menu');
    this.note = page.getByTestId('tasks-note');

    this.areaFilter = new EntityPickerControl(page, 'tasks-filter-areaId');
    this.companyFilter = new EntityPickerControl(page, 'tasks-filter-assignedVendorId');
    this.memberFilter = page.getByTestId('tasks-filter-member');
    this.milestoneFilter = page.getByTestId('tasks-filter-milestone');

    this.list = page.getByTestId('tasks-list');
    this.listSection = this.list.locator('section[aria-label="Tasks"]');
    this.titleLinks = page.locator('a[data-testid^="tasks-title-"]').visible();
    // .first(): the EmptyState wrapper holds child elements whose class also contains the name.
    this.emptyState = page.locator('[class*="emptyState"]').first();
    this.retryButton = page.getByTestId('tasks-retry');
    this.tableSurface = this.list.locator('table');
    this.statusRegion = this.list.getByRole('status');

    this.selectionBar = page.getByTestId('tasks-selection-bar');
    this.bulkStatusButton = page.getByTestId('tasks-bulk-status');
    this.bulkSetAreaButton = page.getByTestId('tasks-bulk-set-area');
    this.bulkAreaDialog = page.getByTestId('tasks-bulk-area-dialog');
    this.bulkError = page.getByTestId('tasks-bulk-error');

    this.deleteModal = page
      .getByRole('alertdialog')
      .filter({ has: page.getByTestId('work-item-list-delete-cancel') });
    this.deleteConfirmButton = this.deleteModal.getByTestId('work-item-list-delete-confirm');
    this.deleteCancelButton = this.deleteModal.getByTestId('work-item-list-delete-cancel');
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Surface-agnostic row locators
  // ───────────────────────────────────────────────────────────────────────────

  private part(prefix: string, id: string): Locator {
    return this.page
      .locator(`[data-testid="${prefix}-${id}"], [data-testid="${prefix}-mobile-${id}"]`)
      .visible();
  }

  /** The row (table `tr` or card `li`) of a task. */
  row(id: string): Locator {
    return this.part('tasks-row', id);
  }

  /**
   * The row (table) or card for a task title, whichever surface is visible. `tr`/`li` only, so
   * the `tasks-row-menu-*` buttons never match.
   */
  workItemRow(title: string): Locator {
    return this.page
      .locator('tr[data-testid^="tasks-row-"], li[data-testid^="tasks-row-mobile-"]')
      .filter({ hasText: title })
      .visible();
  }

  /** The id of the task whose title is shown (read from the row's test id). */
  async idOf(title: string): Promise<string> {
    const testId = await this.workItemRow(title).first().getAttribute('data-testid');
    if (!testId) throw new Error(`Task "${title}" not found in the list`);
    return testId.replace(/^tasks-row-(mobile-)?/, '');
  }

  title(id: string): Locator {
    return this.part('tasks-title', id);
  }

  statusBadge(id: string): Locator {
    return this.part('tasks-status', id);
  }

  /** Late · n d / Held up chip of a task (#2199). */
  scheduleSignal(id: string): Locator {
    return this.part('tasks-schedule-signal', id);
  }

  criticalBadge(id: string): Locator {
    return this.part('tasks-critical', id);
  }

  rowCheckbox(id: string): Locator {
    return this.part('tasks-select', id);
  }

  rowMenuTrigger(id: string): Locator {
    return this.part('tasks-row-menu', id);
  }

  /** Table only: the area link (full path) under the title. */
  areaLink(id: string): Locator {
    return this.page.getByTestId(`tasks-area-${id}`);
  }

  /** Table only: the grant chip(s) under the title. */
  grantChips(id: string): Locator {
    return this.page.getByTestId(`work-item-grants-${id}`);
  }

  /** Table only: the Waits for link in the Relations column. */
  waitsFor(id: string): Locator {
    return this.page.getByTestId(`tasks-waits-for-${id}`);
  }

  /** Table only: the "Holds up n tasks" sentence (`data-figure="holds-up"`). */
  holdsUp(id: string): Locator {
    return this.page.getByTestId(`tasks-holds-up-${id}`);
  }

  /** Whether the table surface (list width of 768 px or more) is the visible one. */
  async isTableSurface(): Promise<boolean> {
    return this.tableSurface.isVisible();
  }

  /** The table's Start / Mark done command as a StatusMenu control (table surface only). */
  command(id: string): StatusMenuControl {
    return new StatusMenuControl(this.page, `tasks-command-${id}`);
  }

  /**
   * Start / Mark done a task. Table: the command's date step answered with Today. Card: the first
   * ⋯ item (applies without the date step).
   */
  async runCommand(id: string): Promise<void> {
    if (await this.isTableSurface()) {
      await this.command(id).actionToday();
      return;
    }
    await this.rowMenuTrigger(id).click();
    await this.page.getByTestId(`tasks-command-mobile-${id}`).click();
  }

  /** Open the ⋯ menu of a task and click one of its entries (`open`, `delete`, `reopen`). */
  async chooseRowMenu(id: string, entry: 'open' | 'delete' | 'reopen'): Promise<void> {
    await this.rowMenuTrigger(id).click();
    await this.part(`tasks-${entry}`, id).click();
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Navigation and loading
  // ───────────────────────────────────────────────────────────────────────────

  /** Open the list, optionally with a query string. */
  async goto(query = ''): Promise<void> {
    await this.page.goto(
      query ? `${WORK_ITEMS_ROUTE}?${query.replace(/^\?/, '')}` : WORK_ITEMS_ROUTE,
    );
    await this.heading.waitFor({ state: 'visible' });
  }

  /** Wait until the first batch rendered: rows, the empty state or the load failure. */
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

  /** Open the list with `?q=` and wait for it. */
  async openSearch(query: string, extra = ''): Promise<void> {
    await this.goto(
      [`q=${encodeURIComponent(query)}`, extra.replace(/^\?/, '')].filter(Boolean).join('&'),
    );
    await this.waitForLoaded();
  }

  /** The visible titles, in order. */
  async getWorkItemTitles(): Promise<string[]> {
    return (await this.titleLinks.allTextContents()).map((s) => s.trim()).filter(Boolean);
  }

  /** The heading's numbers: no count is `null`; "(2 of 9)" is `{ shown: 2, total: 9 }`. */
  async headingCounts(): Promise<{ shown: number; total: number | null } | null> {
    const text = (await this.heading.innerText()).replace(/\s+/g, ' ');
    const match = /\((\d+)(?: of (\d+))?\)/.exec(text);
    if (!match) return null;
    return { shown: Number(match[1]), total: match[2] ? Number(match[2]) : null };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Search
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Type a search and wait for the URL (debounce fired) and the matching API answer. The response
   * listener is registered before typing.
   */
  async search(query: string): Promise<void> {
    const answered = this.page.waitForResponse((resp) => {
      if (!resp.url().includes('/api/work-items') || resp.status() !== 200) return false;
      try {
        return new URL(resp.url()).searchParams.get('q') === query;
      } catch {
        return false;
      }
    });
    await this.searchInput.fill(query);
    await this.page.waitForURL((url) => url.searchParams.get('q') === query);
    await answered;
  }

  async clearSearch(): Promise<void> {
    const answered = this.page.waitForResponse((resp) => {
      if (!resp.url().includes('/api/work-items') || resp.status() !== 200) return false;
      try {
        return !new URL(resp.url()).searchParams.has('q');
      } catch {
        return false;
      }
    });
    await this.searchInput.clear();
    await this.page.waitForURL((url) => !url.searchParams.has('q'));
    await answered;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Chips, group by, sort
  // ───────────────────────────────────────────────────────────────────────────

  chip(value: TaskChip): Locator {
    return this.page.getByTestId(`tasks-chip-${value}`);
  }

  /** The chip's number from its "‹word› (n)" label; null before the first batch applied. */
  async chipCount(value: TaskChip): Promise<number | null> {
    const text = (await this.chip(value).innerText()).replace(/\s+/g, ' ');
    const match = /\((\d+)\)/.exec(text);
    return match ? Number(match[1]) : null;
  }

  async selectChip(value: TaskChip): Promise<void> {
    await this.chip(value).click();
    await expect(this.chip(value)).toHaveAttribute('aria-pressed', 'true');
  }

  async setGroupBy(value: TaskGroupBy): Promise<void> {
    await this.groupMenuButton.click();
    await this.page.getByTestId(`tasks-group-${value}`).click();
  }

  /** The Group by option as the menu shows it (for the disabled-with-reason check). */
  async groupOption(value: TaskGroupBy): Promise<Locator> {
    await this.groupMenuButton.click();
    const option = this.page.getByTestId(`tasks-group-${value}`);
    await option.waitFor({ state: 'visible' });
    return option;
  }

  async setSort(value: string, direction?: 'asc' | 'desc'): Promise<void> {
    await this.sortMenuButton.click();
    await this.page.getByTestId(`tasks-sort-${value}`).click();
    if (direction) {
      await this.sortMenuButton.click();
      await this.page.getByTestId(`tasks-sort-${direction}`).click();
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Groups
  // ───────────────────────────────────────────────────────────────────────────

  /** All visible group toggles. */
  groupToggles(): Locator {
    return this.page.locator('button[data-testid^="tasks-group-toggle-"]').visible();
  }

  groupToggle(key: string): Locator {
    return this.part('tasks-group-toggle', key);
  }

  /** Keys of the visible group toggles, in render order. */
  async groupKeys(): Promise<string[]> {
    const ids = await this.groupToggles().evaluateAll((els) =>
      els.map((el) => el.getAttribute('data-testid') ?? ''),
    );
    return ids.map((id) => id.replace(/^tasks-group-toggle-(mobile-)?/, ''));
  }

  /** The group's number: the total in "(n)" or "(loaded of n)". */
  async groupCount(key: string): Promise<number> {
    const text = (await this.groupToggle(key).innerText()).replace(/\s+/g, ' ');
    const match = /\((?:\d+ of )?(\d+)\)/.exec(text);
    if (!match) throw new Error(`No count in group toggle "${text}"`);
    return Number(match[1]);
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

  /** The `from|to` input of a date range filter (`startDate`, `endDate`). */
  dateInput(param: 'startDate' | 'endDate', side: 'from' | 'to'): Locator {
    return this.page.getByTestId(`tasks-filter-${param}-${side}`);
  }

  /** The `min|max` input of the Cost lines filter. */
  costLinesInput(side: 'min' | 'max'): Locator {
    return this.page.getByTestId(`tasks-filter-budgetLines-${side}`);
  }

  /** Open Filters and pick a company (types its name, picks by keyboard). */
  async pickCompanyFilter(name: string): Promise<void> {
    await this.openFilters();
    await this.companyFilter.pick(name);
  }

  /** Open Filters and pick an area by name (a top-level area, or the "No area" option). */
  async pickAreaFilter(name: string): Promise<void> {
    await this.openFilters();
    if (name === 'No area') {
      await this.areaFilter.input.click();
      await this.areaFilter.choose(this.areaFilter.optionNamed('No area'));
      return;
    }
    await this.areaFilter.pick(name);
  }

  /** The text of the selected chip of a picker inside the open Filters surface. */
  get filtersSelected(): Locator {
    return this.filtersSurface.locator('[class*="selectedDisplay"]');
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Bulk
  // ───────────────────────────────────────────────────────────────────────────

  async selectRows(ids: readonly string[]): Promise<void> {
    for (const id of ids) {
      await this.rowCheckbox(id).check();
    }
    await expect(this.selectionBar).toBeVisible();
  }

  async bulkSetStatus(status: 'not_started' | 'in_progress' | 'completed'): Promise<void> {
    await this.bulkStatusButton.click();
    await this.page.getByTestId(`tasks-bulk-status-${status}`).click();
  }

  /** Set area for the selection through the dialog: picks the area by name (a pick applies). */
  async bulkSetArea(areaName: string): Promise<void> {
    await this.bulkSetAreaButton.click();
    const input = this.page.getByLabel(/^Set area for \d+ tasks?$/);
    const picker = new EntityPickerControl(this.page, input);
    await picker.pick(areaName);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Delete
  // ───────────────────────────────────────────────────────────────────────────

  /** Open the delete dialog of the task with the given title (⋯ › Delete). */
  async openDeleteModal(title: string): Promise<void> {
    const id = await this.idOf(title);
    await this.chooseRowMenu(id, 'delete');
    await this.deleteModal.waitFor({ state: 'visible' });
  }

  /** Confirm the deletion; waits for the DELETE answer and the dialog to close. */
  async confirmDelete(): Promise<void> {
    const deleted = this.page.waitForResponse(
      (resp) =>
        resp.url().includes('/api/work-items') &&
        resp.request().method() === 'DELETE' &&
        resp.status() === 204,
    );
    await this.deleteConfirmButton.click();
    await deleted;
    await this.deleteModal.waitFor({ state: 'hidden' });
  }

  async cancelDelete(): Promise<void> {
    await this.deleteCancelButton.click();
    await this.deleteModal.waitFor({ state: 'hidden' });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Columns (table surface only)
  // ───────────────────────────────────────────────────────────────────────────

  /** A column header of the table surface. */
  columnHeader(label: string | RegExp): Locator {
    return this.tableSurface.getByRole('columnheader', { name: label });
  }

  /** Open the Columns… dialog from the page ⋯ menu. */
  async openColumnsDialog(): Promise<Locator> {
    await this.pageMenuButton.click();
    await this.page.getByTestId('tasks-columns').click();
    const dialog = this.page.getByRole('dialog', { name: 'Columns' });
    await dialog.waitFor({ state: 'visible' });
    return dialog;
  }
}
