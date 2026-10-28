/**
 * Page Object Model for Purchases (/project/household-items), the fourth ObjectList adopter
 * (#2246, EPIC-21 P5.2). The anatomy is the Tasks one (see `WorkItemsPage.ts`), composed from
 * the shared `ObjectListControl` with the prefix `purchases`.
 *
 * The page renders:
 * - h1 "Purchases (n)" / "Purchases (n of m)" (a count is always shown), the one primary
 *   "New purchase" (`new-household-item-button`) and the page ⋯ menu (`purchases-page-menu`).
 * - Status chips `purchases-chip-<planned|purchased|scheduled|arrived|all>` (none pressed by
 *   default), Filters, Group by (`purchases-group-<status|area|company|none>`; Status is the
 *   default and runs on the server) and Sort (`purchases-sort-<value>`).
 * - Filters: Category (`purchases-filter-category`, select), Area (`#purchases-filter-areaId`,
 *   EntityPicker with a "No area" special option), Company (`#purchases-filter-vendorId`),
 *   Target delivery / Delivered on (`purchases-filter-<targetDelivery|actualDelivery>-<from|to>`),
 *   Expected cost / Invoiced / Grants / After grants (`purchases-filter-<plannedCost|actualCost|
 *   grants|afterGrants>-<min|max>`) and Cost lines (`purchases-filter-budgetLines-<min|max>`).
 * - The list (`purchases-list`): table and card surface are BOTH mounted (768 px container
 *   query), so every row locator is `.visible()`-filtered. Row parts: `row`, `title`, `status`,
 *   `row-menu`, `open`, `delete` (both surfaces); table only: `area`, `company` links and the
 *   grant chips (`household-item-grants-<id>`). Groups: toggle `purchases-group-toggle-<key>`;
 *   the Delivered (`arrived`) group is collapsed while another group has rows.
 * - The totals footer (`purchases-footer`, group named "Totals" / "Totals (filtered)") with
 *   `purchases-footer-<expected|invoiced|paid>`; only while there is at least one row.
 * - The delete ConfirmDialog (testid prefix `purchase-list-delete`).
 */

import type { Page, Locator } from '@playwright/test';
import { routeUrl } from '../../shared/src/routes/index.js';
import { EntityPickerControl } from './components/EntityPickerControl.js';
import { ObjectListControl } from './components/ObjectListControl.js';

export const HOUSEHOLD_ITEMS_ROUTE = routeUrl('householdItems');

export type PurchaseChip = 'planned' | 'purchased' | 'scheduled' | 'arrived' | 'all';
export type PurchaseGroupBy = 'none' | 'status' | 'area' | 'company';

/** A money figure as the footer shows it ("€1,234.56" in English) as a number. */
export function parseMoney(text: string): number {
  return Number(text.replace(/[^0-9.-]/g, ''));
}

export class HouseholdItemsPage {
  readonly page: Page;
  readonly olist: ObjectListControl;

  readonly heading: Locator;
  readonly newItemButton: Locator;
  readonly pageMenuButton: Locator;
  readonly searchInput: Locator;
  readonly emptyState: Locator;
  readonly tableSurface: Locator;

  readonly areaFilter: EntityPickerControl;
  readonly companyFilter: EntityPickerControl;
  readonly categoryFilter: Locator;

  readonly footer: Locator;
  readonly footerExpected: Locator;
  readonly footerInvoiced: Locator;
  readonly footerPaid: Locator;

  readonly deleteModal: Locator;
  readonly deleteConfirmButton: Locator;
  readonly deleteCancelButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.olist = new ObjectListControl(page, 'purchases', 'Purchases', (url) => {
      return url.pathname === '/api/household-items' && url.searchParams.has('sortBy');
    });

    this.heading = page.getByRole('heading', { level: 1, name: /^Purchases(\s|$)/ });
    this.newItemButton = page.getByTestId('new-household-item-button');
    this.pageMenuButton = this.olist.pageMenuButton;
    this.searchInput = this.olist.searchInput;
    this.emptyState = this.olist.emptyState;
    this.tableSurface = this.olist.tableSurface;

    this.areaFilter = new EntityPickerControl(page, 'purchases-filter-areaId');
    this.companyFilter = new EntityPickerControl(page, 'purchases-filter-vendorId');
    this.categoryFilter = page.getByTestId('purchases-filter-category');

    this.footer = page.getByTestId('purchases-footer');
    this.footerExpected = page.getByTestId('purchases-footer-expected');
    this.footerInvoiced = page.getByTestId('purchases-footer-invoiced');
    this.footerPaid = page.getByTestId('purchases-footer-paid');

    this.deleteModal = page
      .getByRole('alertdialog')
      .filter({ has: page.getByTestId('purchase-list-delete-cancel') });
    this.deleteConfirmButton = this.deleteModal.getByTestId('purchase-list-delete-confirm');
    this.deleteCancelButton = this.deleteModal.getByTestId('purchase-list-delete-cancel');
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Rows
  // ───────────────────────────────────────────────────────────────────────────

  row(id: string): Locator {
    return this.olist.row(id);
  }

  /** The row (table) or card for a purchase name (matches the title link exactly). */
  itemRow(name: string): Locator {
    return this.olist.rowByTitle(name);
  }

  idOf(name: string): Promise<string> {
    return this.olist.idOf(name);
  }

  statusBadge(id: string): Locator {
    return this.olist.part('status', id);
  }

  /** Table only: the area link. */
  areaLink(id: string): Locator {
    return this.page.getByTestId(`purchases-area-${id}`);
  }

  /** Table only: the company link. */
  companyLink(id: string): Locator {
    return this.page.getByTestId(`purchases-company-${id}`);
  }

  async isTableSurface(): Promise<boolean> {
    return this.olist.isTableSurface();
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Navigation and loading
  // ───────────────────────────────────────────────────────────────────────────

  async goto(query = ''): Promise<void> {
    await this.page.goto(
      query ? `${HOUSEHOLD_ITEMS_ROUTE}?${query.replace(/^\?/, '')}` : HOUSEHOLD_ITEMS_ROUTE,
    );
    await this.heading.waitFor({ state: 'visible' });
  }

  async waitForLoaded(): Promise<void> {
    await this.olist.waitForLoaded();
  }

  /** Open the list with `?q=` and wait for it. */
  async openSearch(query: string, extra = ''): Promise<void> {
    await this.goto(
      [`q=${encodeURIComponent(query)}`, extra.replace(/^\?/, '')].filter(Boolean).join('&'),
    );
    await this.waitForLoaded();
  }

  /** The visible purchase names, in order. */
  async getItemNames(): Promise<string[]> {
    return this.olist.getTitles();
  }

  /** The heading's numbers: no count is `null`; "(2 of 9)" is `{ shown: 2, total: 9 }`. */
  async headingCounts(): Promise<{ shown: number; total: number | null } | null> {
    const text = (await this.heading.innerText()).replace(/\s+/g, ' ');
    const match = /\((\d+)(?: of (\d+))?\)/.exec(text);
    if (!match) return null;
    return { shown: Number(match[1]), total: match[2] ? Number(match[2]) : null };
  }

  /**
   * Open the list with `?q=<query>` and wait for it (kept for the specs that navigate to a search;
   * a full page load guarantees the request fires). Use `typeSearch` to type into the field.
   */
  async search(query: string): Promise<void> {
    await this.openSearch(query);
  }

  /** Type a search and wait for the URL and the list's own answer. */
  async typeSearch(query: string): Promise<void> {
    await this.olist.search(query);
  }

  async clearSearch(): Promise<void> {
    await this.olist.clearSearch();
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Chips, group by, sort, groups, filters
  // ───────────────────────────────────────────────────────────────────────────

  chip(value: PurchaseChip): Locator {
    return this.olist.chip(value);
  }

  selectChip(value: PurchaseChip): Promise<void> {
    return this.olist.selectChip(value);
  }

  setGroupBy(value: PurchaseGroupBy): Promise<void> {
    return this.olist.setGroupBy(value);
  }

  setSort(value: string, direction?: 'asc' | 'desc'): Promise<void> {
    return this.olist.setSort(value, direction);
  }

  groupToggle(key: string): Locator {
    return this.olist.groupToggle(key);
  }

  groupKeys(): Promise<string[]> {
    return this.olist.groupKeys();
  }

  expandGroup(key: string): Promise<void> {
    return this.olist.expandGroup(key);
  }

  openFilters(): Promise<void> {
    return this.olist.openFilters();
  }

  closeFilters(): Promise<void> {
    return this.olist.closeFilters();
  }

  /** Open Filters and pick a category by its id (the option value, e.g. `hic-furniture`). */
  async pickCategoryFilter(categoryId: string): Promise<void> {
    await this.openFilters();
    await this.categoryFilter.selectOption(categoryId);
  }

  /** Open Filters and pick a company (types its name, picks by keyboard). */
  async pickCompanyFilter(name: string): Promise<void> {
    await this.openFilters();
    await this.companyFilter.pick(name);
  }

  /** Open Filters and pick an area by name, or the "No area" special option. */
  async pickAreaFilter(name: string): Promise<void> {
    await this.openFilters();
    // A chosen area replaces the input with its chip: clear it first
    if (
      !(await this.areaFilter.input.isVisible()) &&
      (await this.areaFilter.clearButton.isVisible())
    ) {
      await this.areaFilter.clearButton.click();
    }
    if (name === 'No area') {
      await this.areaFilter.input.click();
    } else {
      await this.areaFilter.type(name);
    }
    await this.areaFilter.choose(this.areaFilter.optionNamed(name));
  }

  /** Open Filters and set the Target delivery range. */
  async setTargetDelivery(from: string | null, to: string | null): Promise<void> {
    await this.openFilters();
    if (from !== null) await this.olist.dateInput('targetDelivery', 'from').fill(from);
    if (to !== null) await this.olist.dateInput('targetDelivery', 'to').fill(to);
  }

  /** The selected chip(s) of the pickers inside the open Filters surface. */
  get filtersSelected(): Locator {
    return this.olist.filtersSurface.locator('[class*="selectedDisplay"]');
  }

  get filtersSurface(): Locator {
    return this.olist.filtersSurface;
  }

  columnHeader(label: string | RegExp): Locator {
    return this.olist.columnHeader(label);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Delete
  // ───────────────────────────────────────────────────────────────────────────

  /** Open the delete dialog of the purchase with the given name (⋯ › Delete). */
  async openDeleteModal(name: string): Promise<void> {
    const id = await this.idOf(name);
    await this.olist.chooseRowMenu(id, 'delete');
    await this.deleteModal.waitFor({ state: 'visible' });
  }

  /** Confirm the deletion; waits for the DELETE answer and the dialog to close. */
  async confirmDelete(): Promise<void> {
    const deleted = this.page.waitForResponse(
      (resp) =>
        resp.url().includes('/api/household-items') &&
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
}
