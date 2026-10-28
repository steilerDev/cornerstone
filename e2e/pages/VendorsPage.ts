/**
 * Page Object Model for the Companies list page (/companies)
 *
 * The list was /settings/vendors until #2213; /settings/vendors and /budget/vendors now redirect
 * here. The class keeps its file name (many specs import it); `CompaniesPage` is an alias.
 *
 * The page renders:
 * - A header with a secondary "Trades" button and the primary "New company" button
 *   (`new-company-button`; hidden while the unfiltered list is empty, the empty state has its own)
 * - A search field, "Trade" filter chips (FilterChipGroup, testid `company-trade-<id>`), a data
 *   table (>= 768px) and phone cards (< 768px). DataTable mounts both surfaces at once, so every
 *   row/card locator here is filtered to the visible one.
 * - A row ⋯ OverflowMenu ("Actions for <name>") with Delete, a Call button (`tel:` link) in the
 *   Phone column, and the shared ConfirmDialog (prefix `company-list-delete`)
 * - The New company ObjectForm dialog at /companies/new
 * - The Trades sheet at ?trades=1 (see `TradesSheet`)
 */

import { expect } from '@playwright/test';
import type { Page, Locator } from '@playwright/test';
import { routeUrl } from '../../shared/src/routes/index.js';
import { ConfirmDialogControl } from './components/ConfirmDialogControl.js';
import { ObjectFormDialog } from './components/ObjectFormDialog.js';
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

  // Page header
  readonly heading: Locator;
  readonly tradesButton: Locator;
  readonly newCompanyButton: Locator;

  // Search / filters
  readonly searchInput: Locator;
  readonly columnSettingsButton: Locator;
  readonly tradeChips: Locator;

  // Error banner (outside dialogs)
  readonly errorBanner: Locator;

  // Empty state
  readonly emptyState: Locator;
  readonly emptyStateHeading: Locator;

  // Table (>= 768px) and phone cards
  readonly tableContainer: Locator;
  readonly tableBody: Locator;
  readonly cardsContainer: Locator;

  // Pagination
  readonly pagination: Locator;
  readonly paginationInfo: Locator;
  readonly prevPageButton: Locator;
  readonly nextPageButton: Locator;

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

    this.heading = page.getByRole('heading', { level: 1, name: 'Companies', exact: true });
    this.tradesButton = page.getByTestId('companies-trades-button');
    this.newCompanyButton = page.getByTestId('new-company-button');

    // DataTable renders a generic search input with aria-label="Search items" for all pages.
    this.searchInput = page.getByLabel('Search items');
    this.columnSettingsButton = page.getByLabel('Column settings');
    this.tradeChips = page.getByRole('group', { name: 'Trade', exact: true });

    this.errorBanner = page.locator('[role="alert"]').first();

    // `.first()`: child elements such as emptyStateTitle also contain "emptyState" in their class.
    this.emptyState = page.locator('[class*="emptyState"]').first();
    this.emptyStateHeading = this.emptyState.getByRole('heading');

    this.tableContainer = page.locator('[class*="tableContainer"]');
    this.tableBody = this.tableContainer.locator('tbody');
    this.cardsContainer = page.locator('[class*="cardsContainer"]');

    // `.first()`: `[class*="pagination"]` also matches paginationInfo, paginationButton, ...
    this.pagination = page.locator('[class*="pagination"]').first();
    this.paginationInfo = page.locator('[class*="paginationInfo"]');
    this.prevPageButton = page.getByLabel('Previous');
    this.nextPageButton = page.getByLabel('Next');

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

  async goto(query?: Record<string, string | number>): Promise<void> {
    await this.page.goto(routeUrl('companies', undefined, query));
    await this.heading.waitFor({ state: 'visible' });
  }

  /** The Trade chip with the given visible label (a toggle button with aria-pressed). */
  tradeChip(label: string): Locator {
    return this.tradeChips.getByRole('button', { name: label, exact: true });
  }

  /** The visible row (table) or card (phone) whose name link reads exactly `name`. */
  row(name: string): Locator {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return this.tableBody
      .locator('tr')
      .or(this.cardsContainer.locator(':scope > *'))
      .filter({
        has: this.page.locator('[data-company-name-link]', {
          hasText: new RegExp(`^\\s*${escaped}\\s*$`),
        }),
      })
      .filter({ visible: true });
  }

  /** Kept for the specs that predate #2213. */
  contactCell(name: string): Locator {
    return this.row(name);
  }

  /** The name link (to the company page) of the named row. */
  nameLink(name: string): Locator {
    return this.row(name).locator('[data-company-name-link]');
  }

  /** The Call button (a `tel:` link) of the named row or card. */
  callLink(name: string): Locator {
    return this.row(name).locator('a[href^="tel:"]');
  }

  /** Kept for the specs that predate #2213. */
  phoneLink(name: string): Locator {
    return this.callLink(name);
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

  /** A sortable table header by its label (desktop table only; carries `aria-sort`). */
  columnHeader(label: string | RegExp): Locator {
    return this.tableContainer.getByRole('columnheader', { name: label });
  }

  /** The row ⋯ trigger of the named company ("Actions for <name>"). */
  rowActions(name: string): Locator {
    return this.row(name).getByRole('button', { name: `Actions for ${name}`, exact: true });
  }

  /** The Delete item of the open row menu (the menu is portaled to the body). */
  get deleteMenuItem(): Locator {
    return this.page.getByRole('menuitem', { name: 'Delete', exact: true });
  }

  /**
   * Open the New company dialog with the header button. While the unfiltered list is empty the
   * header button is hidden and the empty state's own "New company" action opens the same dialog.
   */
  async openCreateModal(): Promise<void> {
    const action = this.newCompanyButton
      .or(this.emptyState.getByRole('button', { name: 'New company' }))
      .first();
    await action.click();
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
  async getVendorNames(): Promise<string[]> {
    const links = this.page.locator('[data-company-name-link]').filter({ visible: true });
    const texts = await links.allTextContents();
    return texts.map((text) => text.trim()).filter((text) => text.length > 0);
  }

  /** Open the delete confirmation of the named company through its row ⋯ menu. */
  async openDeleteModal(name: string): Promise<void> {
    await expect(this.row(name)).toHaveCount(1);
    await this.rowActions(name).click();
    await this.deleteMenuItem.click();
    await this.deleteModal.waitFor({ state: 'visible' });
  }

  async confirmDelete(): Promise<void> {
    await this.deleteConfirmButton.click();
  }

  async cancelDelete(): Promise<void> {
    await this.deleteCancelButton.click();
    await this.deleteModal.waitFor({ state: 'hidden' });
  }

  /** Open the Trades sheet with its header button. */
  async openTrades(): Promise<void> {
    await this.tradesButton.click();
    await this.tradesSheet.waitForOpen();
  }

  /**
   * Type into the search field and wait for the debounced API response.
   * The listener is registered BEFORE fill to avoid a race with the debounce.
   */
  async search(query: string): Promise<void> {
    // Match the answer to THIS query: an in-flight response of the unfiltered list must not count
    const responsePromise = this.page.waitForResponse(
      (resp) =>
        new URL(resp.url()).pathname === '/api/vendors' &&
        new URL(resp.url()).searchParams.get('q') === query &&
        resp.status() === 200,
    );
    await this.searchInput.fill(query);
    await responsePromise;
    await this.waitForVendorsLoaded();
  }

  async clearSearch(): Promise<void> {
    const responsePromise = this.page.waitForResponse(
      (resp) =>
        new URL(resp.url()).pathname === '/api/vendors' &&
        !new URL(resp.url()).searchParams.has('q') &&
        resp.status() === 200,
    );
    await this.searchInput.clear();
    await responsePromise;
    await this.waitForVendorsLoaded();
  }

  /** Wait for at least one visible row/card or the empty state. */
  async waitForVendorsLoaded(): Promise<void> {
    await expect(
      this.page
        .locator('[data-company-name-link]')
        .filter({ visible: true })
        .first()
        .or(this.emptyState),
    ).toBeVisible();
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
