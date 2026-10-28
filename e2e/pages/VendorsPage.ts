/**
 * Page Object Model for the Companies list page (/companies), the fifth ObjectList adopter
 * (#2246, EPIC-21 P5.2). The class keeps its file name (many specs import it); `CompaniesPage` is
 * an alias. The anatomy is the Tasks one (see `WorkItemsPage.ts`), composed from the shared
 * `ObjectListControl` with the prefix `companies`.
 *
 * The page renders:
 * - h1 "Companies (n)" / "Companies (n of m)" and the one primary "New company"
 *   (`new-company-button`, always shown; the template's empty state has no action).
 *   The page ⋯ menu (`companies-page-menu`) holds Trades (`companies-menu-trades`), Columns… and
 *   Print.
 * - The list mounts only after the trades have answered (h1 + Skeleton first, D11).
 * - Trade chips `companies-chip-<tradeId|all>`: the four trades with the most companies, a
 *   selected fifth, and a "More trades" menu (`companies-chip-more`, options
 *   `companies-chip-more-<tradeId>`) once more than four trades have companies. No Filters panel.
 * - Group by Trade (`companies-group-trade`; Trade column hidden while grouped) and Sort.
 * - Row parts (both surfaces): `row`, `title`, `row-menu`, `company-open`, `company-delete`,
 *   `company-call`, `company-still-to-pay` (`data-figure="still-to-pay"`); table only: columns.
 * - The delete ConfirmDialog (prefix `company-list-delete`), the New company ObjectForm dialog at
 *   /companies/new and the Trades sheet at ?trades=1 (see `TradesSheet`).
 */

import { expect } from '@playwright/test';
import type { Page, Locator } from '@playwright/test';
import { routeUrl } from '../../shared/src/routes/index.js';
import { ConfirmDialogControl } from './components/ConfirmDialogControl.js';
import { ObjectFormDialog } from './components/ObjectFormDialog.js';
import { ObjectListControl } from './components/ObjectListControl.js';
import { TradesSheet } from './TradesSheet.js';

export const COMPANIES_ROUTE = routeUrl('companies');
/** Kept for the specs that predate #2213. */
export const VENDORS_ROUTE = COMPANIES_ROUTE;

export interface CreateVendorData {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
}

export class VendorsPage {
  readonly page: Page;
  readonly olist: ObjectListControl;

  // Page header
  readonly heading: Locator;
  readonly newCompanyButton: Locator;
  readonly pageMenuButton: Locator;
  readonly tradesMenuItem: Locator;

  // Search / chips
  readonly searchInput: Locator;
  readonly tradeChips: Locator;
  readonly chipMoreButton: Locator;

  // Error banner (outside dialogs)
  readonly errorBanner: Locator;

  // Empty state
  readonly emptyState: Locator;
  readonly emptyStateHeading: Locator;

  // Dialogs
  readonly createDialog: ObjectFormDialog;
  readonly tradesSheet: TradesSheet;
  readonly deleteDialog: ConfirmDialogControl;
  readonly deleteModal: Locator;
  readonly deleteModalTitle: Locator;
  readonly deleteConfirmButton: Locator;
  readonly deleteCancelButton: Locator;
  readonly deleteErrorBanner: Locator;

  constructor(page: Page) {
    this.page = page;
    this.olist = new ObjectListControl(
      page,
      'companies',
      'Companies',
      (url) => url.pathname === '/api/vendors',
    );

    this.heading = page.getByRole('heading', { level: 1, name: /^Companies(\s|$)/ });
    this.newCompanyButton = page.getByTestId('new-company-button');
    this.pageMenuButton = this.olist.pageMenuButton;
    this.tradesMenuItem = page.getByTestId('companies-menu-trades');

    this.searchInput = this.olist.searchInput;
    this.tradeChips = page.getByRole('group', { name: 'Trade', exact: true });
    this.chipMoreButton = this.olist.chipMoreButton;

    this.errorBanner = page.locator('[role="alert"]').first();

    this.emptyState = this.olist.emptyState;
    this.emptyStateHeading = this.emptyState.getByRole('heading');

    // The New company form: a Modal from 768px, a full-screen Sheet below (both role="dialog").
    this.createDialog = new ObjectFormDialog(page, 'New company');
    this.tradesSheet = new TradesSheet(page);

    // Delete dialog: the shared ConfirmDialog (role="alertdialog"), title "Delete <name>?".
    this.deleteDialog = new ConfirmDialogControl(page, 'company-list-delete');
    this.deleteModal = this.deleteDialog.dialog;
    this.deleteModalTitle = this.deleteModal.getByRole('heading', { level: 2 });
    this.deleteConfirmButton = this.deleteDialog.confirmButton;
    this.deleteCancelButton = this.deleteDialog.cancelButton;
    this.deleteErrorBanner = this.deleteModal.locator('[role="alert"]');
  }

  /**
   * Open the list. The h1 shows first (with a Skeleton) while the trades load; the list itself
   * mounts after them, so wait for it with `waitForVendorsLoaded()`.
   */
  async goto(query?: Record<string, string | number>): Promise<void> {
    await this.page.goto(routeUrl('companies', undefined, query));
    await this.heading.waitFor({ state: 'visible' });
  }

  /** Open the list and wait for its first batch. */
  async open(query?: Record<string, string | number>): Promise<void> {
    await this.goto(query);
    await this.olist.waitForLoaded();
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Chips, group by, sort
  // ───────────────────────────────────────────────────────────────────────────

  /** The chip of a trade by id (`companies-chip-<id>`) or `all`. */
  chip(tradeIdOrAll: string): Locator {
    return this.olist.chip(tradeIdOrAll);
  }

  /** The Trade chip with the given visible label (a toggle button with aria-pressed). */
  tradeChip(label: string): Locator {
    return this.tradeChips.getByRole('button', { name: label, exact: true });
  }

  /** Every trade chip of the group, in order (`all` last). */
  get allChips(): Locator {
    return this.tradeChips.getByRole('button');
  }

  selectChip(tradeIdOrAll: string): Promise<void> {
    return this.olist.selectChip(tradeIdOrAll);
  }

  /** Pick a trade from the "More trades" menu by id. */
  chooseMoreTrade(tradeId: string): Promise<void> {
    return this.olist.chooseChipMore(tradeId);
  }

  setGroupBy(value: 'none' | 'trade'): Promise<void> {
    return this.olist.setGroupBy(value);
  }

  setSort(value: string, direction?: 'asc' | 'desc'): Promise<void> {
    return this.olist.setSort(value, direction);
  }

  groupKeys(): Promise<string[]> {
    return this.olist.groupKeys();
  }

  groupToggle(key: string): Locator {
    return this.olist.groupToggle(key);
  }

  /** The heading's numbers: "(2 of 9)" is `{ shown: 2, total: 9 }`. */
  async headingCounts(): Promise<{ shown: number; total: number | null } | null> {
    const text = (await this.heading.innerText()).replace(/\s+/g, ' ');
    const match = /\((\d+)(?: of (\d+))?\)/.exec(text);
    if (!match) return null;
    return { shown: Number(match[1]), total: match[2] ? Number(match[2]) : null };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Rows
  // ───────────────────────────────────────────────────────────────────────────

  /** The visible row (table) or card (phone) whose name link reads exactly `name`. */
  row(name: string): Locator {
    return this.olist.rowByTitle(name);
  }

  /** Kept for the specs that predate #2213. */
  contactCell(name: string): Locator {
    return this.row(name);
  }

  /** The id of the company whose name is shown. */
  idOf(name: string): Promise<string> {
    return this.olist.idOf(name);
  }

  /** The name link (to the company page) of the named row. */
  nameLink(name: string): Locator {
    return this.row(name).locator('a[data-testid^="companies-title-"]');
  }

  /** The Call button (a `tel:` link) of the named row or card. */
  callLink(name: string): Locator {
    return this.row(name).locator('a[href^="tel:"]');
  }

  /** Kept for the specs that predate #2213. */
  phoneLink(name: string): Locator {
    return this.callLink(name);
  }

  /** The Call button of a company by id (`company-call-<id>` / `company-call-mobile-<id>`). */
  callButton(companyId: string): Locator {
    return this.page
      .locator(
        `[data-testid="company-call-${companyId}"], [data-testid="company-call-mobile-${companyId}"]`,
      )
      .visible();
  }

  /**
   * The Still to pay figure of a company's visible row or card (`company-still-to-pay-<id>` on the
   * table, `company-still-to-pay-mobile-<id>` on the phone card, #2244). It carries
   * `data-figure="still-to-pay"`.
   */
  stillToPay(companyId: string): Locator {
    return this.page
      .locator(
        `[data-testid="company-still-to-pay-${companyId}"], [data-testid="company-still-to-pay-mobile-${companyId}"]`,
      )
      .filter({ visible: true });
  }

  /** All header cells of the table surface, in order (the last is the visually hidden Actions). */
  get tableHeaders(): Locator {
    return this.olist.tableSurface.locator('thead th');
  }

  /**
   * Press the chip of a trade (by id). A trade outside the four most-used has no chip until it is
   * selected, so it is reached through the "More trades" menu then.
   */
  async selectTrade(tradeId: string): Promise<void> {
    const chip = this.chip(tradeId);
    if (await chip.isVisible()) {
      await this.olist.selectChip(tradeId);
      return;
    }
    await this.olist.chooseChipMore(tradeId);
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
  }

  /** A column header of the table surface (a string matches the start of the name). */
  columnHeader(label: string | RegExp): Locator {
    return this.olist.columnHeader(label);
  }

  /** The row ⋯ trigger of the named company. */
  rowActions(name: string): Locator {
    return this.row(name).locator('[data-testid^="companies-row-menu-"]');
  }

  /** The Delete item of the open row menu (the menu is portaled to the body). */
  get deleteMenuItem(): Locator {
    return this.page.getByRole('menuitem', { name: 'Delete', exact: true });
  }

  async isTableSurface(): Promise<boolean> {
    return this.olist.isTableSurface();
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Create, delete, trades
  // ───────────────────────────────────────────────────────────────────────────

  /** Open the New company dialog with the page's one primary button. */
  async openCreateModal(): Promise<void> {
    await this.newCompanyButton.click();
    await this.createDialog.waitForOpen();
  }

  /** Fill and submit the New company dialog. Only the name is required. */
  async createVendor(data: CreateVendorData): Promise<void> {
    await this.createDialog.field('name').fill(data.name);
    const more = [data.phone, data.email, data.address, data.notes].some((v) => v !== undefined);
    if (more) await this.createDialog.expandMoreDetails();
    if (data.phone !== undefined) await this.createDialog.field('phone').fill(data.phone);
    if (data.email !== undefined) await this.createDialog.field('email').fill(data.email);
    if (data.address !== undefined) await this.createDialog.field('address').fill(data.address);
    if (data.notes !== undefined) await this.createDialog.field('notes').fill(data.notes);
    await this.createDialog.save();
  }

  /** Names currently shown, in display order, from whichever surface is visible. */
  getVendorNames(): Promise<string[]> {
    return this.olist.getTitles();
  }

  /** Open the delete confirmation of the named company through its row ⋯ menu. */
  async openDeleteModal(name: string): Promise<void> {
    await expect(this.row(name)).toHaveCount(1);
    const id = await this.idOf(name);
    await this.olist.chooseRowMenu(id, 'delete', 'company');
    await this.deleteModal.waitFor({ state: 'visible' });
  }

  async confirmDelete(): Promise<void> {
    await this.deleteConfirmButton.click();
  }

  async cancelDelete(): Promise<void> {
    await this.deleteCancelButton.click();
    await this.deleteModal.waitFor({ state: 'hidden' });
  }

  /** Open the Trades sheet through the page ⋯ menu › Trades. */
  async openTrades(): Promise<void> {
    await this.pageMenuButton.click();
    await this.tradesMenuItem.click();
    await this.tradesSheet.waitForOpen();
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Search
  // ───────────────────────────────────────────────────────────────────────────

  /** Type into the search field and wait for the debounced API response of this query. */
  async search(query: string): Promise<void> {
    await this.olist.search(query);
  }

  async clearSearch(): Promise<void> {
    await this.olist.clearSearch();
  }

  /** Wait for the first batch: rows, a group, the empty state or the load failure. */
  async waitForVendorsLoaded(): Promise<void> {
    await this.olist.waitForLoaded();
  }

  async getDeleteErrorText(): Promise<string | null> {
    try {
      await this.deleteErrorBanner.waitFor({ state: 'visible' });
      return await this.deleteErrorBanner.textContent();
    } catch {
      return null;
    }
  }
}

export { VendorsPage as CompaniesPage };
