/**
 * Page Object Model for the Milestones list page (/project/milestones), the sixth ObjectList
 * adopter (#2246, EPIC-21 P5.2), composed from the shared `ObjectListControl` (prefix
 * `milestones`).
 *
 * The page renders:
 * - h1 "Milestones (n)" / "(n of m)" and the one primary "New milestone"
 *   (`new-milestone-button`); the page ⋯ menu (`milestones-page-menu`).
 * - Chips `milestones-chip-<upcoming|reached|all>`, Filters (Target date
 *   `milestones-filter-targetDate-<from|to>`, Waits for `milestones-filter-waitsFor-<min|max>`),
 *   Sort (`milestones-sort-<target_date|title|projected_date|status|waits_for>`). No Group by.
 * - Filtering, sorting and paging run on the client over the one `GET /api/milestones` answer.
 * - Table headers: Milestone (title), Target, Projected, Waits for, Holds up, Status. Row parts
 *   (both surfaces): `row`, `title`, `status` (Badge: Upcoming / Late · n d / Early · n d /
 *   Reached), `row-menu`, `open`, `delete`; table only: `milestones-holds-up-<id>`
 *   (`data-figure="holds-up"`, absent when nothing is held up).
 * - The delete ConfirmDialog (prefix `milestone-list-delete`). Milestone ids are numbers.
 */

import type { Page, Locator } from '@playwright/test';
import { routeUrl } from '../../shared/src/routes/index.js';
import { ObjectListControl } from './components/ObjectListControl.js';

export const MILESTONES_ROUTE = routeUrl('milestones');
export const MILESTONES_NEW_ROUTE = routeUrl('milestoneNew');

export type MilestoneChip = 'upcoming' | 'reached' | 'all';

export class MilestonesPage {
  readonly page: Page;
  readonly olist: ObjectListControl;

  readonly heading: Locator;
  readonly newMilestoneButton: Locator;
  readonly searchInput: Locator;
  readonly emptyState: Locator;
  readonly tableSurface: Locator;
  readonly groupMenuButton: Locator;
  readonly sortMenuButton: Locator;

  readonly deleteModal: Locator;
  readonly deleteConfirmButton: Locator;
  readonly deleteCancelButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.olist = new ObjectListControl(
      page,
      'milestones',
      'Milestones',
      (url) => url.pathname === '/api/milestones',
      false,
    );

    this.heading = page.getByRole('heading', { level: 1, name: /^Milestones(\s|$)/ });
    this.newMilestoneButton = page.getByTestId('new-milestone-button');
    this.searchInput = this.olist.searchInput;
    this.emptyState = this.olist.emptyState;
    this.tableSurface = this.olist.tableSurface;
    this.groupMenuButton = this.olist.groupMenuButton;
    this.sortMenuButton = this.olist.sortMenuButton;

    this.deleteModal = page
      .getByRole('alertdialog')
      .filter({ has: page.getByTestId('milestone-list-delete-cancel') });
    this.deleteConfirmButton = this.deleteModal.getByTestId('milestone-list-delete-confirm');
    this.deleteCancelButton = this.deleteModal.getByTestId('milestone-list-delete-cancel');
  }

  async goto(query = ''): Promise<void> {
    await this.page.goto(
      query ? `${MILESTONES_ROUTE}?${query.replace(/^\?/, '')}` : MILESTONES_ROUTE,
    );
    await this.heading.waitFor({ state: 'visible' });
  }

  async waitForLoaded(): Promise<void> {
    await this.olist.waitForLoaded();
  }

  /** The visible milestone titles, in order. */
  getMilestoneTitles(): Promise<string[]> {
    return this.olist.getTitles();
  }

  /** The heading's numbers: "(2 of 9)" is `{ shown: 2, total: 9 }`. */
  async headingCounts(): Promise<{ shown: number; total: number | null } | null> {
    const text = (await this.heading.innerText()).replace(/\s+/g, ' ');
    const match = /\((\d+)(?: of (\d+))?\)/.exec(text);
    if (!match) return null;
    return { shown: Number(match[1]), total: match[2] ? Number(match[2]) : null };
  }

  /** Type a search (client-side: waits for the URL and the list's re-fetch). */
  search(query: string): Promise<void> {
    return this.olist.search(query);
  }

  clearSearch(): Promise<void> {
    return this.olist.clearSearch();
  }

  chip(value: MilestoneChip): Locator {
    return this.olist.chip(value);
  }

  selectChip(value: MilestoneChip): Promise<void> {
    return this.olist.selectChip(value);
  }

  setSort(value: string, direction?: 'asc' | 'desc'): Promise<void> {
    return this.olist.setSort(value, direction);
  }

  columnHeader(label: string | RegExp): Locator {
    return this.olist.columnHeader(label);
  }

  openFilters(): Promise<void> {
    return this.olist.openFilters();
  }

  closeFilters(): Promise<void> {
    return this.olist.closeFilters();
  }

  /** Open Filters and set the Target date range (ISO dates). */
  async setTargetDateRange(from: string | null, to: string | null): Promise<void> {
    await this.openFilters();
    if (from !== null) await this.olist.dateInput('targetDate', 'from').fill(from);
    if (to !== null) await this.olist.dateInput('targetDate', 'to').fill(to);
  }

  // Rows ----------------------------------------------------------------------

  /** The row (table) or card of the milestone with this exact title. */
  milestoneRow(title: string): Locator {
    return this.olist.rowByTitle(title);
  }

  idOf(title: string): Promise<string> {
    return this.olist.idOf(title);
  }

  titleLink(id: string | number): Locator {
    return this.olist.titleLink(String(id));
  }

  statusBadge(id: string | number): Locator {
    return this.olist.part('status', String(id));
  }

  /** Table only: the "n tasks" Holds up sentence (`data-figure="holds-up"`). */
  holdsUp(id: string | number): Locator {
    return this.page.getByTestId(`milestones-holds-up-${id}`);
  }

  async isTableSurface(): Promise<boolean> {
    return this.olist.isTableSurface();
  }

  // Delete --------------------------------------------------------------------

  /** Open the delete dialog of the milestone with this title (⋯ › Delete). */
  async openDeleteModal(title: string): Promise<void> {
    const id = await this.idOf(title);
    await this.olist.chooseRowMenu(id, 'delete');
    await this.deleteModal.waitFor({ state: 'visible' });
  }

  async confirmDelete(): Promise<void> {
    const deleted = this.page.waitForResponse(
      (resp) =>
        resp.url().includes('/api/milestones') &&
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

  /** Follow a milestone's title link to its detail page. */
  async openMilestone(title: string): Promise<void> {
    await this.titleLink(await this.idOf(title)).click();
  }
}
