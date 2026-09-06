/**
 * Page Object Model for the Invoices list page (/budget/invoices)
 *
 * The page renders:
 * - A SubNav with Budget tabs: Overview, Invoices, Vendors, Sources, Subsidies
 * - A page header with h1 "Budget" and an "Add Invoice" button (data-testid="new-invoice-button")
 * - Summary cards: Pending, Claimable, Claimed, Quotation, Open (payable) — always rendered —
 *   plus two conditional cards: Refunds due to you (data-testid="summary-card-refunds-due",
 *   rendered only when summary.refundsDue.count > 0) and Overdue
 *   (data-testid="summary-card-overdue", rendered only when summary.overdue.count > 0).
 *   The "Open (payable)" and "Refunds due to you" cards (Story #2046) are GLOBAL/filter-
 *   independent figures — they do not change when the open-items toggle or any column
 *   filter is applied.
 * - A DataTable with search and per-column filters:
 *   - Filterable columns: Vendor (enum), Date (date), Amount (number), Due Date (date), Status (enum)
 *   - The Status column filter trigger is disabled (aria-disabled) while the open-items
 *     toggle is ON (mutual exclusivity, Story #2046 AC7).
 * - A "Show only open items" toggle (data-testid="open-items-toggle") rendered via the
 *   DataTable's customFilters slot. When ON:
 *   - The URL gains `openOnly=true`.
 *   - The table renders one `<tbody id="row-group-{invoiceId}">` PER INVOICE ROW instead of
 *     a single shared `<tbody>` — each group holds the parent `<tr>` plus its pending-deposit
 *     child `<tr class*="childRow">` rows (present in the DOM at all times, toggled via the
 *     `hidden` attribute, not conditional unmounting). A parent with pending deposits renders
 *     an expand/collapse `<button aria-expanded aria-controls="row-group-{invoiceId}">`
 *     inside a 44px leading cell; a parent with none gets an empty leading cell (no button).
 *   - A "Still due" column appears (only in this mode).
 *   - Overdue invoices/deposits get a `[data-testid="invoice-overdue-{id}"]` /
 *     `[data-testid="deposit-overdue-{id}"]` badge (in addition to their normal status badge —
 *     "Overdue" is a flag, never a replacement status). Invoices listed only because of a
 *     pending deposit (their own status isn't 'pending') get a
 *     `[data-testid="invoice-container-{id}"]` "container" badge instead.
 *   - Mobile (cards): the same expand/collapse affordance renders in the card header; deposit
 *     rows use `deposit-status-mobile-{id}` / `deposit-overdue-mobile-{id}` test ids (distinct
 *     from the desktop table's `deposit-status-{id}` / `deposit-overdue-{id}`), since both the
 *     table and card DOM trees are always mounted (CSS hides whichever doesn't match viewport).
 * - A data table (desktop, class tableContainer) and card list (mobile, class cardsContainer)
 * - Pagination controls when totalPages > 1
 * - An empty state (EmptyState component) when no invoices exist or no items match filters
 * - An actions menu per row (⋮ button, data-testid="invoice-menu-button-{id}")
 *   - "View" action navigates to /budget/invoices/:id
 * - A Create Invoice modal (Modal component) with:
 *   - Select: #invoice-vendor (required)
 *   - Input: #invoice-number (optional)
 *   - Input: #invoice-amount (required)
 *   - Date input: #invoice-date (required)
 *   - Date input: #invoice-due-date (optional)
 *   - Select: #invoice-status
 *   - Textarea: #invoice-notes (optional)
 *   - Submit: "Add Invoice" / "Adding..." button
 *   - Cancel: button
 *   - Error banner: role="alert" inside the modal
 *
 * Key DOM observations from source code:
 * - Page h1 is "Budget" (rendered by PageLayout with title={t('invoices.title')})
 * - "Add Invoice" button uses data-testid="new-invoice-button"
 * - Invoice row in table: click row navigates to /budget/invoices/:id
 * - Status badges use data-testid="invoice-status-{id}"
 * - Actions menu button: data-testid="invoice-menu-button-{id}"
 * - View button in dropdown: data-testid="invoice-view-{id}"
 * - Create form is in a Modal component (uses the shared Modal component)
 */

import { expect, type Page, type Locator } from '@playwright/test';
import { PaperlessPickerModal } from './PaperlessPickerModal.js';

export const INVOICES_ROUTE = '/budget/invoices';

export type InvoiceStatus = 'pending' | 'paid' | 'claimed' | 'quotation';

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
  readonly heading: Locator;
  readonly newInvoiceButton: Locator;

  // Summary cards
  readonly summaryGrid: Locator;
  readonly pendingSummary: Locator;
  readonly claimableSummary: Locator;
  readonly quotationSummary: Locator;
  /**
   * Conditional 5th summary card — only rendered when at least one PENDING
   * invoice has dueDate < today (Issue #1421).
   * data-testid="summary-card-overdue"
   */
  readonly overdueCard: Locator;

  /**
   * Story #2046 — global/filter-independent "open items" summary cards.
   * openPayableCard is always rendered; refundsDueCard only when
   * summary.refundsDue.count > 0.
   */
  readonly openPayableCard: Locator;
  readonly refundsDueCard: Locator;

  /**
   * Story #2046 — "Show only open items" toggle (native checkbox inside a
   * <label>, rendered via DataTable's customFilters slot).
   */
  readonly openItemsToggle: Locator;

  // Search
  readonly searchInput: Locator;

  // Table (desktop view)
  readonly tableContainer: Locator;
  readonly tableBody: Locator;

  // Cards (mobile view)
  readonly cardsContainer: Locator;

  // Pagination
  readonly pagination: Locator;
  readonly prevPageButton: Locator;
  readonly nextPageButton: Locator;

  // Empty state
  readonly emptyState: Locator;

  // Error banner
  readonly errorBanner: Locator;

  // Create invoice modal
  readonly createModal: Locator;
  readonly createVendorSelect: Locator;
  readonly createNumberInput: Locator;
  readonly createAmountInput: Locator;
  readonly createDateInput: Locator;
  readonly createDueDateInput: Locator;
  readonly createStatusSelect: Locator;
  readonly createNotesInput: Locator;
  readonly createSubmitButton: Locator;
  readonly createCancelButton: Locator;
  readonly createErrorBanner: Locator;

  /**
   * DataTable column-settings gear button (Issue #1876 "Effective Amount" column,
   * hidden by default). Desktop-only — hidden via CSS on viewports ≤767px.
   */
  readonly columnSettingsButton: Locator;

  constructor(page: Page) {
    this.page = page;

    // Page header — h1 from PageLayout is "Budget" (invoices.title translation)
    this.heading = page.getByRole('heading', { level: 1, name: 'Budget', exact: true });

    // "Add Invoice" button — data-testid="new-invoice-button"
    this.newInvoiceButton = page.getByTestId('new-invoice-button');

    // Summary cards grid
    this.summaryGrid = page.locator('[class*="summaryGrid"]');
    // Exclude the overdue card from the standard summary cards — its pluralized
    // label text contains "pending invoices past due" which would otherwise match
    // the Pending locator and cause strict-mode violations.
    // Use the summaryLabel child to match only the card title, not hint text.
    this.pendingSummary = this.summaryGrid
      .locator('[class*="summaryCard"]:not([data-testid="summary-card-overdue"])')
      .filter({ has: page.locator('[class*="summaryLabel"]').filter({ hasText: /^Pending$/i }) });
    this.claimableSummary = this.summaryGrid
      .locator('[class*="summaryCard"]:not([data-testid="summary-card-overdue"])')
      .filter({ has: page.locator('[class*="summaryLabel"]').filter({ hasText: /^Claimable$/i }) });
    this.quotationSummary = this.summaryGrid
      .locator('[class*="summaryCard"]:not([data-testid="summary-card-overdue"])')
      .filter({ has: page.locator('[class*="summaryLabel"]').filter({ hasText: /^Quotation$/i }) });
    // Overdue card (conditional) — rendered only when hasOverdue===true (Issue #1421)
    this.overdueCard = page.getByTestId('summary-card-overdue');

    // Story #2046 — open items summary cards (global/filter-independent)
    this.openPayableCard = page.getByTestId('summary-card-open-payable');
    this.refundsDueCard = page.getByTestId('summary-card-refunds-due');

    // Story #2046 — "Show only open items" toggle
    this.openItemsToggle = page.getByTestId('open-items-toggle');

    // DataTable search — aria-label="Search items" (generic DataTable search label)
    this.searchInput = page.getByLabel('Search items');

    // Table (desktop)
    this.tableContainer = page.locator('[class*="tableContainer"]');
    this.tableBody = this.tableContainer.locator('tbody');

    // Mobile cards
    this.cardsContainer = page.locator('[class*="cardsContainer"]');

    // Pagination — use .first() because [class*="pagination"] matches child elements too
    this.pagination = page.locator('[class*="pagination"]').first();
    this.prevPageButton = page.getByLabel('Previous');
    this.nextPageButton = page.getByLabel('Next');

    // Empty state — .first() avoids strict mode violations from child emptyState elements
    this.emptyState = page.locator('[class*="emptyState"]').first();

    // Error banner (outside modal)
    this.errorBanner = page.locator('[role="alert"][class*="errorBanner"]');

    // Create invoice modal — Modal component renders with role="dialog" and a title heading
    this.createModal = page.getByRole('dialog', { name: /Invoice/i });
    this.createVendorSelect = page.locator('#invoice-vendor');
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
    // Error banner inside the modal (role="alert" inside the modal's form area)
    this.createErrorBanner = this.createModal.locator('[role="alert"]');

    // Column settings gear — aria-label "Column settings" (common:dataTable.columnSettings.ariaLabel)
    this.columnSettingsButton = page.getByRole('button', { name: 'Column settings', exact: true });
  }

  /**
   * Click the "New Invoice" button.
   * When Paperless+LLM are configured, this opens the PaperlessPickerModal.
   * Otherwise it opens the manual create modal.
   * Note: the button may be briefly disabled (aria-disabled) while config/status loads.
   */
  async clickNewInvoice(): Promise<void> {
    // Wait for the button to become enabled (config+status fetch resolves)
    await this.newInvoiceButton.waitFor({ state: 'visible' });
    await this.page.waitForFunction((btnTestId) => {
      const el = document.querySelector(`[data-testid="${btnTestId}"]`) as HTMLButtonElement | null;
      return el && !el.disabled && el.getAttribute('aria-disabled') !== 'true';
    }, 'new-invoice-button');
    await this.newInvoiceButton.click();
  }

  /**
   * Wait for the Paperless picker modal to open and return a PaperlessPickerModal instance.
   * Use after clickNewInvoice() when Paperless+LLM are configured.
   */
  async waitForPickerModal(): Promise<PaperlessPickerModal> {
    const pickerModal = new PaperlessPickerModal(this.page);
    await pickerModal.waitForVisible();
    return pickerModal;
  }

  /**
   * Wait for the manual create modal to open and return its Locator.
   * Use after clickNewInvoice() when Paperless is not configured, or after manual escape.
   */
  async waitForManualModal(): Promise<Locator> {
    await this.createModal.waitFor({ state: 'visible' });
    return this.createModal;
  }

  /**
   * Navigate to the invoices list page.
   */
  async goto(): Promise<void> {
    await this.page.goto(INVOICES_ROUTE);
    await this.heading.waitFor({ state: 'visible' });
  }

  /**
   * Wait for invoices to finish loading.
   * Uses Promise.any() so that whichever condition resolves first wins without
   * leaving the other two waitFor() promises as dangling unhandled rejections
   * (which Promise.race() causes when the losers eventually time out).
   */
  async waitForLoaded(): Promise<void> {
    await Promise.any([
      this.tableBody.locator('tr').first().waitFor({ state: 'visible' }),
      this.cardsContainer.locator('[class*="card"]').first().waitFor({ state: 'visible' }),
      this.emptyState.waitFor({ state: 'visible' }),
    ]);
  }

  /**
   * Open the Create Invoice modal by clicking "Add Invoice".
   */
  async openCreateModal(): Promise<void> {
    await this.newInvoiceButton.click();
    await this.createModal.waitFor({ state: 'visible' });
  }

  /**
   * Close the Create Invoice modal by clicking Cancel.
   */
  async closeCreateModal(): Promise<void> {
    await this.createCancelButton.click();
    await this.createModal.waitFor({ state: 'hidden' });
  }

  /**
   * Fill the create invoice form and submit.
   * Vendor must be selected by visible name from the dropdown options.
   * Amount, date are required. Other fields are optional.
   *
   * Registers waitForResponse for the POST /api/vendors/.../invoices before clicking submit.
   */
  async createInvoice(data: CreateInvoiceData): Promise<void> {
    // Select vendor by visible label text
    await this.createVendorSelect.selectOption({ label: data.vendorName });

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
        resp.url().includes('/invoices') &&
        resp.request().method() === 'POST' &&
        resp.status() === 201,
    );
    await this.createSubmitButton.click();
    await responsePromise;
    await this.createModal.waitFor({ state: 'hidden' });
  }

  /**
   * Get the invoice number or "—" text for all invoice rows in the table (desktop)
   * or cards (mobile).
   * Uses [class*="invoiceLink"] — the CSS Modules class from InvoicesPage.module.css.
   */
  async getInvoiceNumbers(): Promise<string[]> {
    const tableVisible = await this.tableContainer.isVisible();
    const linkClass = '[class*="invoiceLink"]';

    if (tableVisible) {
      const links = await this.tableBody.locator(linkClass).all();
      if (links.length > 0) {
        const numbers: string[] = [];
        for (const link of links) {
          const text = await link.textContent();
          if (text) numbers.push(text.trim());
        }
        return numbers;
      }
    }

    // Mobile fallback: same invoiceLink class inside cardsContainer
    const cardLinks = await this.cardsContainer.locator(linkClass).all();
    const numbers: string[] = [];
    for (const link of cardLinks) {
      const text = await link.textContent();
      if (text) numbers.push(text.trim());
    }
    return numbers;
  }

  /**
   * Navigate to the invoice list with a search query applied via URL.
   * Direct URL navigation avoids React debounce timing issues.
   */
  async search(query: string): Promise<void> {
    await this.page.goto(`${INVOICES_ROUTE}?q=${encodeURIComponent(query)}`);
    await this.heading.waitFor({ state: 'visible' });
    await this.waitForLoaded();
  }

  /**
   * Get the summary card count value for the given status type.
   */
  async getSummaryCount(type: 'pending' | 'claimable' | 'quotation'): Promise<number> {
    let card: Locator;
    if (type === 'pending') card = this.pendingSummary;
    else if (type === 'claimable') card = this.claimableSummary;
    else card = this.quotationSummary;
    const countEl = card.locator('[class*="summaryCount"]');
    const text = await countEl.textContent();
    return parseInt(text ?? '0', 10);
  }

  /**
   * Enables a hidden-by-default DataTable column via the column settings gear icon
   * (Issue #1876 "Effective Amount" column). No-ops if already visible.
   * Desktop-only — the gear button is hidden on viewports ≤767px.
   *
   * Toggling a column triggers a debounced (500ms) PATCH to persist
   * `table.invoices.columns`, followed by an optimistic re-sync effect in
   * useColumnPreferences that re-applies the saved value and re-renders the
   * header row. If a second enableColumn() call's toggle-click lands while the
   * first one's debounced save is still in flight, the two saves' responses can
   * resolve out of order — the later-resolving one's re-sync wins and can
   * transiently (or, if it's the first toggle's stale single-column payload,
   * durably) overwrite the newer visibility state. Awaiting the PATCH here,
   * the same way DashboardPage.dismissCard() does for this endpoint, makes
   * each toggle's persistence+re-sync cycle fully settle before the next
   * enableColumn() call (or any header read) can start, closing that race at
   * the source instead of retrying the read against it.
   */
  async enableColumn(columnLabel: string): Promise<void> {
    await this.columnSettingsButton.waitFor({ state: 'visible' });
    await this.columnSettingsButton.click();
    const checkbox = this.page.getByRole('checkbox', { name: columnLabel, exact: true });
    await checkbox.waitFor({ state: 'visible' });
    const checked = await checkbox.isChecked();
    if (!checked) {
      // Register the preferences PATCH listener BEFORE clicking — the debounced
      // save fires ~500ms later, so registering after the click would still be
      // safe here, but doing it first matches the established convention (see
      // DashboardPage.dismissCard()) and avoids any risk of missing the response.
      const preferencesSaved = this.page.waitForResponse(
        (resp) =>
          resp.url().includes('/api/users/me/preferences') &&
          resp.request().method() === 'PATCH' &&
          resp.status() === 200,
      );
      await checkbox.click();
      await preferencesSaved;
    }
    // Close the popover so it doesn't obscure the table.
    await this.page.keyboard.press('Escape');
    await checkbox.waitFor({ state: 'hidden' });
  }

  /**
   * Reads the text content of a specific column's cell in the desktop table row that
   * contains `rowMatchText` (e.g. an invoice number). The column must currently be
   * visible — use enableColumn() first for hidden-by-default columns. The column's
   * position is resolved dynamically from the header row (matched by label prefix,
   * since sortable headers append a " ↑"/" ↓" sort-direction suffix), so this stays
   * correct regardless of column order or how many columns are visible.
   *
   * The match is case-insensitive because `.tableHeader` applies
   * `text-transform: uppercase` (DataTable.module.css) — `innerText()` reflects the
   * browser's RENDERED text, so it returns "REMAINING AMOUNT", not the DOM's
   * "Remaining Amount". A case-sensitive comparison against the mixed-case label
   * therefore never matches, deterministically, regardless of timing — confirmed via
   * a CI trace showing every header-scan attempt across the full retry window
   * returning the same uppercase value. This is not a race: `toPass()` is kept only
   * as a defensive backstop for genuine transient re-renders, not because the
   * original miss was ever transient.
   */
  async getColumnCellText(rowMatchText: string, columnLabel: string): Promise<string> {
    const columnIndex = await this.resolveColumnIndex(columnLabel);
    const row = this.tableBody.locator('tr').filter({ hasText: rowMatchText }).first();
    const cell = row.locator('td').nth(columnIndex);
    return ((await cell.textContent()) ?? '').trim();
  }

  /**
   * Resolves a column's 0-based index among the CURRENT visible table headers
   * (shared by getColumnCellText/stillDueCell/amountCell). See getColumnCellText's
   * docblock for why the match is case-insensitive and prefix-based.
   *
   * When expandable rows are active (Story #2046 open-items mode), DataTableHeader
   * renders an extra leading `<th class="expandCell">` (no text) at index 0 — this
   * is harmless here since it never matches any label and DataTableRow emits a
   * matching leading `<td>` at index 0 too, so header/cell indices stay aligned.
   */
  private async resolveColumnIndex(columnLabel: string): Promise<number> {
    const headers = this.tableContainer.locator('thead th');
    const normalizedLabel = columnLabel.toUpperCase();
    let columnIndex = -1;
    await expect(async () => {
      const headerCount = await headers.count();
      columnIndex = -1;
      for (let i = 0; i < headerCount; i++) {
        const text = (await headers.nth(i).innerText()).trim().toUpperCase();
        if (text === normalizedLabel || text.startsWith(`${normalizedLabel} `)) {
          columnIndex = i;
          break;
        }
      }
      if (columnIndex === -1) {
        throw new Error(`Column "${columnLabel}" not found among visible table headers`);
      }
    }).toPass({ timeout: 3_000 });
    return columnIndex;
  }

  /**
   * Story #2046 — the "Still due" column's cell for the given invoice's PARENT row
   * (only meaningful when the open-items toggle is ON; the column doesn't exist
   * otherwise). Resolves the column position dynamically, same as getColumnCellText.
   */
  async stillDueCell(invoiceId: string): Promise<Locator> {
    const columnIndex = await this.resolveColumnIndex('Still due');
    return this.rowGroup(invoiceId).locator('tr').first().locator('td').nth(columnIndex);
  }

  /**
   * Story #2046 — the "Amount" column's cell for the given invoice's PARENT row
   * (the full, unchanged invoice total — always present, regardless of toggle state).
   */
  async amountCell(invoiceId: string): Promise<Locator> {
    const columnIndex = await this.resolveColumnIndex('Amount');
    return this.rowGroup(invoiceId).locator('tr').first().locator('td').nth(columnIndex);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Story #2046 — "Show only open items" toggle, expandable parent/child rows
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Checks/unchecks the "Show only open items" toggle (no-op if already in the
   * requested state) and waits for the resulting GET /api/invoices list response,
   * so callers never race the re-render against a synchronous read.
   */
  async setOpenItemsOnly(on: boolean): Promise<void> {
    const checked = await this.openItemsToggle.isChecked();
    if (checked === on) return;
    const responsePromise = this.page.waitForResponse(
      (resp) =>
        resp.url().includes('/api/invoices') &&
        resp.request().method() === 'GET' &&
        resp.status() === 200,
    );
    await this.openItemsToggle.setChecked(on);
    await responsePromise;
  }

  /**
   * The `<tbody id="row-group-{invoiceId}">` wrapping an invoice's parent row and
   * (when it has pending deposits) its child rows. Only rendered when the
   * open-items toggle is ON.
   */
  rowGroup(invoiceId: string): Locator {
    return this.page.locator(`#row-group-${invoiceId}`);
  }

  /**
   * The parent row's expand/collapse `<button aria-expanded>` within an invoice's
   * row group. Absent (zero elements) for a parent with no pending deposits.
   */
  expandButton(invoiceId: string): Locator {
    return this.rowGroup(invoiceId).locator('button[aria-expanded]');
  }

  /**
   * Currently-VISIBLE child `<tr>` elements inside an invoice's row group,
   * excluding the parent row itself. Child rows stay in the DOM at all times and
   * toggle via the `hidden` attribute (never unmounted) — `:visible` reflects that
   * correctly since nothing overrides the browser's default `[hidden] { display:
   * none }` behavior in this codebase's CSS.
   */
  childRows(invoiceId: string): Locator {
    return this.rowGroup(invoiceId).locator('tr[class*="childRow"]:visible');
  }

  /** Desktop table-row "Overdue"/"Deposit overdue" flag badge on an invoice's parent row. */
  overdueChip(invoiceId: string): Locator {
    return this.page.getByTestId(`invoice-overdue-${invoiceId}`);
  }

  /** "Deposits only" container badge — invoice listed only because of a pending deposit. */
  containerChip(invoiceId: string): Locator {
    return this.page.getByTestId(`invoice-container-${invoiceId}`);
  }

  /** Desktop child-row "Overdue" flag badge on a deposit's due-date cell. */
  depositOverdueChip(depositId: string): Locator {
    return this.page.getByTestId(`deposit-overdue-${depositId}`);
  }

  /** Desktop child-row status badge (Pending/Paid/Claimed) for a single deposit. */
  depositStatusBadge(depositId: string): Locator {
    return this.page.getByTestId(`deposit-status-${depositId}`);
  }

  /**
   * Get pagination info text, or null if not visible.
   */
  async getPaginationInfoText(): Promise<string | null> {
    try {
      const info = this.page.locator('[class*="paginationInfo"]');
      await info.waitFor({ state: 'visible' });
      return await info.textContent();
    } catch {
      return null;
    }
  }
}
