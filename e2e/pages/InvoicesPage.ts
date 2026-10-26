/**
 * Page Object Model for Money › Invoices and offers (/budget/invoices), the first ObjectList
 * adopter (#2238, EPIC-21 P4.6).
 *
 * The page renders:
 * - h1 "Invoices (n)" (`n of m` while a search or filter is active), the one primary "New invoice"
 *   (`new-invoice-button`) and the page ⋯ menu (`invoices-page-menu`: Columns… `invoices-columns`
 *   from 768 px of list width, Print `invoices-print`).
 * - The toolbar (`invoices-toolbar`): search (`invoices-search`), the status chips
 *   `invoices-chip-<pending|quotation|paid|claimed|all>` (To pay · Offers · Paid · Submitted · All,
 *   label "‹word› (n)" once the first batch applied, `aria-pressed`), Filters
 *   (`invoices-filters-button`; an anchored panel `invoices-filters-panel` from 768 px, a Sheet
 *   `invoices-filters-sheet` below), Group by (`invoices-group-menu`), Sort (`invoices-sort-menu`)
 *   and the note row (`invoices-searching-all`, `invoices-note`, `invoices-clear-filters`).
 * - Filters › "Show only" checkboxes `invoices-filter-<notYetSplit|withoutDocument|refundsDue|due>`
 *   (each its own `?param=1`), then Company (`#invoices-filter-vendorId`), Invoice date
 *   (`invoices-filter-date-from|to`), Due date (`invoices-filter-dueDate-from|to`) and Amount
 *   (`invoices-filter-amount-min|max`).
 * - The list (`invoices-list`): a table surface and a two-line card surface are BOTH mounted and
 *   switched by the list's own width (768 px container query), so every row locator here is
 *   `.visible()`-filtered and works on either surface. Table ids are `invoices-<part>-<id>`, card
 *   ids `invoices-<part>-mobile-<id>` (`dataTableTestId`).
 *   Row parts: `row`, `select`, `expand`, `title` (the link), `company` (the company link above
 *   the title), `status` (badge), `mark-paid` (command; on cards the first ⋯ item), `row-menu`;
 *   badges `badge-not-yet-split`, `badge-flag` (Overdue / Due soon), `badge-progress-overdue`,
 *   `badge-progress-only` (the last three on the table only). Child rows (progress payments and
 *   refunds) are `child-<depositId>` (table) with `child-status|child-flag|child-command`.
 * - Above the list on the Offers chip: the Offers summary (`invoices-offers-summary`, facts
 *   `summary-fact-offers-<count|offered|paid|remaining>`). Below it on To pay: the footer
 *   (`invoices-footer`, figure `invoices-footer-figure`, `data-figure="still-to-pay"` only while no
 *   search or filter is active). Selecting rows shows the bar (`invoices-selection-bar`) with the one
 *   bulk action "Mark paid (n)" (`invoices-bulk-mark-paid`).
 * - The create dialogs (`useInvoiceCreate`): unchanged from before the rebuild.
 */

import type { Page, Locator } from '@playwright/test';
import { expect } from '@playwright/test';
import { CompanyPickerControl } from './components/CompanyPickerControl.js';
import { EntityPickerControl } from './components/EntityPickerControl.js';
import { PaperlessPickerModal } from './PaperlessPickerModal.js';
import { routeUrl } from '../../shared/src/routes/index.js';

/** API (not app route) invoices-endpoint matcher. */
const API_INVOICES_URL = /\/api\/(?:.*\/)?invoices/;

export const INVOICES_ROUTE = routeUrl('invoices');

export type InvoiceStatus = 'pending' | 'paid' | 'claimed' | 'quotation';

/** The chip values of the `status` URL param ('pending' is the default and is not written). */
export type InvoiceChip = 'pending' | 'quotation' | 'paid' | 'claimed' | 'all';

/** The four "Show only" flags of the Filters panel. */
export type InvoiceFlag = 'notYetSplit' | 'withoutDocument' | 'refundsDue' | 'due';

export interface CreateInvoiceData {
  vendorName: string;
  invoiceNumber?: string;
  amount: string;
  date: string;
  dueDate?: string;
  status?: InvoiceStatus;
  notes?: string;
}

export class InvoicesPage {
  readonly page: Page;

  // Page header
  /** The h1: "Invoices (n)" or "Invoices (n of m)". */
  readonly heading: Locator;
  readonly newInvoiceButton: Locator;
  readonly pageMenuButton: Locator;
  readonly columnsItem: Locator;

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
  /** The note row's "Searching all · n more in …" line. */
  readonly searchingAllNote: Locator;
  /** The note row's "Showing only: …" line (names the active Show-only flags). */
  readonly note: Locator;
  readonly clearFiltersButton: Locator;

  /** The Company filter (an EntityPicker inside the Filters surface). */
  readonly companyFilter: EntityPickerControl;
  /** The chosen company's chip inside the open Filters surface. */
  readonly companyFilterSelected: Locator;

  // List
  readonly list: Locator;
  readonly listSection: Locator;
  /** The title links of the visible surface (one per row). */
  readonly titleLinks: Locator;
  readonly emptyState: Locator;
  readonly retryButton: Locator;
  readonly tableSurface: Locator;

  // Offers summary and footer
  readonly offersSummary: Locator;
  readonly footer: Locator;
  readonly footerLabel: Locator;
  readonly footerFigure: Locator;

  // Selection
  readonly selectionBar: Locator;
  readonly bulkMarkPaid: Locator;

  // Create invoice modal
  readonly createModal: Locator;
  /** The company picker's text input (#invoice-vendor; a SearchPicker since #2213). */
  readonly createVendorSelect: Locator;
  /** The company picker control (input, dropdown, "New company ‹text›" row, clear button). */
  readonly createVendorPicker: CompanyPickerControl;
  /** The picker's selected-company chip, shown once a company is chosen (or pre-filled). */
  readonly createVendorSelected: Locator;
  readonly createNumberInput: Locator;
  readonly createAmountInput: Locator;
  readonly createDateInput: Locator;
  readonly createDueDateInput: Locator;
  readonly createStatusSelect: Locator;
  readonly createNotesInput: Locator;
  readonly createSubmitButton: Locator;
  readonly createCancelButton: Locator;
  readonly createErrorBanner: Locator;

  constructor(page: Page) {
    this.page = page;

    this.heading = page.getByRole('heading', { level: 1, name: /^Invoices(\s|$)/ });
    this.newInvoiceButton = page.getByTestId('new-invoice-button');
    this.pageMenuButton = page.getByTestId('invoices-page-menu');
    this.columnsItem = page.getByTestId('invoices-columns');

    this.searchInput = page.getByTestId('invoices-search');
    this.filtersButton = page.getByTestId('invoices-filters-button');
    this.filtersSheet = page.getByTestId('invoices-filters-sheet');
    this.filtersPanel = page.getByTestId('invoices-filters-panel');
    this.filtersSurface = this.filtersSheet.or(this.filtersPanel);
    this.filtersDoneButton = page.getByTestId('invoices-filters-done');
    this.groupMenuButton = page.getByTestId('invoices-group-menu');
    this.sortMenuButton = page.getByTestId('invoices-sort-menu');
    this.searchingAllNote = page.getByTestId('invoices-searching-all');
    this.note = page.getByTestId('invoices-note');
    this.clearFiltersButton = page.getByTestId('invoices-clear-filters');

    this.companyFilter = new EntityPickerControl(page, 'invoices-filter-vendorId');
    this.companyFilterSelected = this.filtersSurface.locator('[class*="selectedDisplay"]');

    this.list = page.getByTestId('invoices-list');
    // The list section only: the Offers summary strip is a <section> too
    this.listSection = this.list.locator('section[aria-label="Invoices"]');
    this.titleLinks = page.locator('[data-testid^="invoices-title-"]').visible();
    // .first(): the EmptyState wrapper holds child elements whose class also contains the name.
    this.emptyState = page.locator('[class*="emptyState"]').first();
    this.retryButton = page.getByTestId('invoices-retry');
    this.tableSurface = this.list.locator('table');

    this.offersSummary = page.getByTestId('invoices-offers-summary');
    this.footer = page.getByTestId('invoices-footer');
    this.footerLabel = this.footer.locator('span').first();
    this.footerFigure = page.getByTestId('invoices-footer-figure');

    this.selectionBar = page.getByTestId('invoices-selection-bar');
    this.bulkMarkPaid = page.getByTestId('invoices-bulk-mark-paid');

    // Create invoice modal — Modal component renders with role="dialog" and a title heading
    this.createModal = page.getByRole('dialog', { name: /Invoice/i });
    this.createVendorSelect = page.locator('#invoice-vendor');
    this.createVendorPicker = new CompanyPickerControl(page, 'invoice-vendor', this.createModal);
    this.createVendorSelected = this.createModal
      .locator('label[for="invoice-vendor"]')
      .locator('xpath=..')
      .locator('[class*="selectedDisplay"]');
    this.createNumberInput = page.locator('#invoice-number');
    this.createAmountInput = page.locator('#invoice-amount');
    this.createDateInput = page.locator('#invoice-date');
    this.createDueDateInput = page.locator('#invoice-due-date');
    this.createStatusSelect = page.locator('#invoice-status');
    this.createNotesInput = page.locator('#invoice-notes');
    // Submit button cycles between "Add Invoice" and "Adding..."
    this.createSubmitButton = this.createModal.getByRole('button', {
      name: /Add Invoice|Adding\.\.\./i,
    });
    this.createCancelButton = this.createModal.getByRole('button', {
      name: 'Cancel',
      exact: true,
    });
    this.createErrorBanner = this.createModal.locator('[role="alert"]');
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Surface-agnostic row locators (both surfaces are mounted; the visible one is returned)
  // ───────────────────────────────────────────────────────────────────────────

  private part(prefix: string, id: string): Locator {
    return this.page
      .locator(`[data-testid="${prefix}-${id}"], [data-testid="${prefix}-mobile-${id}"]`)
      .visible();
  }

  /** The row (table `tr` or card `li`) of an invoice. */
  row(invoiceId: string): Locator {
    return this.part('invoices-row', invoiceId);
  }

  /** The title link of an invoice (the invoice number, or "No number"). */
  title(invoiceId: string): Locator {
    return this.part('invoices-title', invoiceId);
  }

  /** The company link above the title (table) / in the facts line (card). */
  company(invoiceId: string): Locator {
    return this.part('invoices-company', invoiceId);
  }

  /** The status Badge of an invoice row. */
  statusBadge(invoiceId: string): Locator {
    return this.part('invoices-status', invoiceId);
  }

  /** The row's Overdue / Due soon badge (table: in the secondary line; card: after the status). */
  flagBadge(invoiceId: string): Locator {
    return this.part('invoices-badge-flag', invoiceId);
  }

  /** Table only: the "Not yet split" badge. */
  notYetSplitBadge(invoiceId: string): Locator {
    return this.part('invoices-badge-not-yet-split', invoiceId);
  }

  /** Table only: "Progress payment overdue". */
  progressOverdueBadge(invoiceId: string): Locator {
    return this.part('invoices-badge-progress-overdue', invoiceId);
  }

  /** Table only: "Progress payments only" (To pay chip, own status not To pay). */
  progressOnlyBadge(invoiceId: string): Locator {
    return this.part('invoices-badge-progress-only', invoiceId);
  }

  /** The checkbox of a row. */
  rowCheckbox(invoiceId: string): Locator {
    return this.part('invoices-select', invoiceId);
  }

  /** The expand / collapse toggle of a row with progress payments. */
  expandToggle(invoiceId: string): Locator {
    return this.part('invoices-expand', invoiceId);
  }

  /** The table child row of a progress payment / refund (table surface only). */
  childRow(entryId: string): Locator {
    return this.part('invoices-child', entryId);
  }

  /** Status badge of a progress payment (both surfaces). */
  childStatus(entryId: string): Locator {
    return this.part('invoices-child-status', entryId);
  }

  /** Overdue / Due soon badge of a progress payment (both surfaces). */
  childFlag(entryId: string): Locator {
    return this.part('invoices-child-flag', entryId);
  }

  /** The Mark paid command of a progress payment (both surfaces). */
  childCommand(entryId: string): Locator {
    return this.part('invoices-child-command', entryId);
  }

  /** The row ⋯ trigger (cards only; shown for rows that can be marked paid). */
  rowMenuTrigger(invoiceId: string): Locator {
    return this.part('invoices-row-menu', invoiceId);
  }

  /** Whether the table surface (list width of 768 px or more) is the visible one. */
  async isTableSurface(): Promise<boolean> {
    return this.tableSurface.isVisible();
  }

  /**
   * The Mark paid control of an invoice: the table command (`StatusMenu action`, accessible name
   * "Mark paid, ‹title›, ‹company›"), or the card's first ⋯ item. Not shown for rows that cannot be
   * marked paid.
   */
  async markPaid(invoiceId: string): Promise<void> {
    if (await this.isTableSurface()) {
      await this.page.getByTestId(`invoices-mark-paid-${invoiceId}`).click();
      return;
    }
    await this.rowMenuTrigger(invoiceId).click();
    await this.page.getByTestId(`invoices-mark-paid-mobile-${invoiceId}`).click();
  }

  /** The table's Mark paid command (table surface only). */
  markPaidCommand(invoiceId: string): Locator {
    return this.page.getByTestId(`invoices-mark-paid-${invoiceId}`);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Navigation and loading
  // ───────────────────────────────────────────────────────────────────────────

  /** Open the list (To pay chip) or `route` with its query string. */
  async goto(query = ''): Promise<void> {
    await this.page.goto(query ? `${INVOICES_ROUTE}?${query.replace(/^\?/, '')}` : INVOICES_ROUTE);
    await this.heading.waitFor({ state: 'visible' });
  }

  /** Open the list on a chip (`pending` is the default and is opened without a param). */
  async gotoChip(chip: InvoiceChip, extraQuery = ''): Promise<void> {
    const parts = [chip === 'pending' ? '' : `status=${chip}`, extraQuery.replace(/^\?/, '')];
    await this.goto(parts.filter(Boolean).join('&'));
    await this.waitForLoaded();
  }

  /** Wait until the first batch rendered: rows, the empty state or the load failure. */
  async waitForLoaded(): Promise<void> {
    await this.listSection.waitFor({ state: 'attached' });
    await expect(this.listSection).not.toHaveAttribute('aria-busy', 'true');
    await expect(this.titleLinks.first().or(this.emptyState).or(this.retryButton)).toBeVisible();
  }

  async openCreateModal(): Promise<void> {
    await this.newInvoiceButton.click();
    await this.createModal.waitFor({ state: 'visible' });
  }

  async clickNewInvoice(): Promise<void> {
    // Wait for the button to become enabled (config+status fetch resolves)
    await this.newInvoiceButton.waitFor({ state: 'visible' });
    await this.page.waitForFunction((btnTestId) => {
      const el = document.querySelector(`[data-testid="${btnTestId}"]`) as HTMLButtonElement | null;
      return el && !el.disabled && el.getAttribute('aria-disabled') !== 'true';
    }, 'new-invoice-button');
    await this.newInvoiceButton.click();
  }

  async waitForPickerModal(): Promise<PaperlessPickerModal> {
    const pickerModal = new PaperlessPickerModal(this.page);
    await pickerModal.waitForVisible();
    return pickerModal;
  }

  async waitForManualModal(): Promise<Locator> {
    await this.createModal.waitFor({ state: 'visible' });
    return this.createModal;
  }

  async closeCreateModal(): Promise<void> {
    await this.createCancelButton.click();
    await this.createModal.waitFor({ state: 'hidden' });
  }

  async selectCreateVendor(vendorName: string): Promise<void> {
    await this.createVendorSelect.fill(vendorName);
    await this.createVendorPicker.dropdown
      .getByRole('option', { name: vendorName, exact: true })
      .click();
    await expect(this.createVendorSelect).toBeHidden();
  }

  async createInvoice(data: CreateInvoiceData): Promise<void> {
    await this.selectCreateVendor(data.vendorName);

    if (data.invoiceNumber !== undefined) {
      await this.createNumberInput.fill(data.invoiceNumber);
    }
    await this.createAmountInput.fill(data.amount);
    await this.createDateInput.fill(data.date);

    if (data.dueDate !== undefined) {
      await this.createDueDateInput.fill(data.dueDate);
    }
    if (data.status !== undefined) {
      await this.createStatusSelect.selectOption(data.status);
    }
    if (data.notes !== undefined) {
      await this.createNotesInput.fill(data.notes);
    }

    const responsePromise = this.page.waitForResponse(
      (resp) =>
        API_INVOICES_URL.test(resp.url()) &&
        resp.request().method() === 'POST' &&
        resp.status() === 201,
    );
    await this.createSubmitButton.click();
    await responsePromise;
    await this.createModal.waitFor({ state: 'hidden' });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Reading the list
  // ───────────────────────────────────────────────────────────────────────────

  /** The visible titles, in order ("No number" for an invoice without one). */
  async getInvoiceNumbers(): Promise<string[]> {
    // One atomic read: the list re-renders while shared data changes, so no .all() snapshots.
    return (await this.titleLinks.allTextContents()).map((s) => s.trim()).filter(Boolean);
  }

  /** The heading's numbers: "Invoices (5)" is `{ shown: 5 }`, "(2 of 9)" is `{ shown: 2, total: 9 }`. */
  async headingCounts(): Promise<{ shown: number; total: number | null } | null> {
    const text = (await this.heading.innerText()).replace(/\s+/g, ' ');
    const match = /\((\d+)(?: of (\d+))?\)/.exec(text);
    if (!match) return null;
    return { shown: Number(match[1]), total: match[2] ? Number(match[2]) : null };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Chips
  // ───────────────────────────────────────────────────────────────────────────

  chip(value: InvoiceChip): Locator {
    return this.page.getByTestId(`invoices-chip-${value}`);
  }

  /** The chip's number from its "‹word› (n)" label; null before the first batch applied. */
  async chipCount(value: InvoiceChip): Promise<number | null> {
    const text = (await this.chip(value).innerText()).replace(/\s+/g, ' ');
    const match = /\((\d+)\)/.exec(text);
    return match ? Number(match[1]) : null;
  }

  /** Press a chip and wait for the chip to be pressed. */
  async selectChip(value: InvoiceChip): Promise<void> {
    await this.chip(value).click();
    await expect(this.chip(value)).toHaveAttribute('aria-pressed', 'true');
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Search
  // ───────────────────────────────────────────────────────────────────────────

  async typeSearch(text: string): Promise<void> {
    await this.searchInput.click();
    await this.searchInput.pressSequentially(text);
  }

  async clearSearchWithKeys(): Promise<void> {
    await this.searchInput.press('ControlOrMeta+a');
    await this.searchInput.press('Backspace');
  }

  /** Open the list with `?q=` (a search covers every status: "Searching all"). */
  async search(query: string): Promise<void> {
    await this.goto(`q=${encodeURIComponent(query)}`);
    await this.waitForLoaded();
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

  /** A "Show only" checkbox inside the open Filters surface. */
  showOnly(flag: InvoiceFlag): Locator {
    return this.page.getByTestId(`invoices-filter-${flag}`);
  }

  /** Open Filters, set one Show-only flag and leave the surface open. */
  async setShowOnly(flag: InvoiceFlag, on: boolean): Promise<void> {
    await this.openFilters();
    const checkbox = this.showOnly(flag);
    await checkbox.setChecked(on);
    await expect(checkbox).toBeChecked({ checked: on });
  }

  /** The `<from|to|min|max>` input of a range filter (`date`, `dueDate`, `amount`). */
  rangeInput(param: 'date' | 'dueDate' | 'amount', side: 'from' | 'to' | 'min' | 'max'): Locator {
    return this.page.getByTestId(`invoices-filter-${param}-${side}`);
  }

  /** Pick a company in the open Filters surface (types its name, picks by keyboard). */
  async pickCompanyFilter(name: string): Promise<void> {
    await this.openFilters();
    await this.companyFilter.pick(name);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Columns (table surface only)
  // ───────────────────────────────────────────────────────────────────────────

  /** Open the Columns… dialog from the page ⋯ menu. */
  async openColumnsDialog(): Promise<Locator> {
    await this.pageMenuButton.click();
    await this.columnsItem.click();
    const dialog = this.page.getByRole('dialog', { name: 'Columns' });
    await dialog.waitFor({ state: 'visible' });
    return dialog;
  }

  /** Show a hidden-by-default column (e.g. "Split", "Notes") and wait for the preference save. */
  async enableColumn(columnLabel: string): Promise<void> {
    const dialog = await this.openColumnsDialog();
    const checkbox = dialog.getByRole('checkbox', { name: columnLabel, exact: true });
    await checkbox.waitFor({ state: 'visible' });
    if (!(await checkbox.isChecked())) {
      const preferencesSaved = this.page.waitForResponse(
        (resp) =>
          resp.url().includes('/api/users/me/preferences') &&
          resp.request().method() === 'PATCH' &&
          resp.status() === 200,
      );
      await checkbox.click();
      await preferencesSaved;
    }
    await dialog.getByRole('button', { name: 'Done', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
  }

  /** A column header of the table surface. */
  columnHeader(label: string | RegExp): Locator {
    return this.tableSurface.getByRole('columnheader', { name: label });
  }

  /** The text of one cell: the row of `invoiceId`, the column whose header starts with the label. */
  async cellText(invoiceId: string, columnLabel: string): Promise<string> {
    const headers = this.tableSurface.locator('thead th');
    const wanted = columnLabel.toUpperCase();
    let index = -1;
    await expect(async () => {
      const count = await headers.count();
      index = -1;
      for (let i = 0; i < count; i++) {
        const text = (await headers.nth(i).innerText()).trim().toUpperCase();
        if (text === wanted || text.startsWith(`${wanted} `)) {
          index = i;
          break;
        }
      }
      if (index === -1) throw new Error(`Column "${columnLabel}" not found among table headers`);
    }).toPass({ timeout: 3_000 });
    const cell = this.page.getByTestId(`invoices-row-${invoiceId}`).locator('td').nth(index);
    return ((await cell.textContent()) ?? '').trim();
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Figures
  // ───────────────────────────────────────────────────────────────────────────

  figure(kind: 'still-to-pay'): Locator {
    return this.page.locator(`[data-figure="${kind}"]`);
  }

  /** The offers summary's value for one fact: `count`, `offered`, `paid` or `remaining`. */
  offersFact(fact: 'count' | 'offered' | 'paid' | 'remaining'): Locator {
    return this.offersSummary.getByTestId(`summary-fact-offers-${fact}`);
  }
}
