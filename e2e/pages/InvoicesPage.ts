/**
 * Page Object Model for the Invoices list page (/budget/invoices)
 *
 * The page renders:
 * - A SubNav with Budget tabs: Overview, Invoices, Vendors, Sources, Subsidies
 * - A page header with h1 "Budget" and an "Add Invoice" button (data-testid="new-invoice-button")
 * - Three summary cards: Pending, Paid, Quotation
 * - A DataTable with search and per-column filters:
 *   - Filterable columns: Vendor (enum), Date (date), Amount (number), Due Date (date), Status (enum)
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

import type { Page, Locator } from '@playwright/test';
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
  readonly paidSummary: Locator;
  readonly quotationSummary: Locator;
  /**
   * Conditional 5th summary card — only rendered when at least one PENDING
   * invoice has dueDate < today (Issue #1421).
   * data-testid="summary-card-overdue"
   */
  readonly overdueCard: Locator;

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

  constructor(page: Page) {
    this.page = page;

    // Page header — h1 from PageLayout is "Budget" (invoices.title translation)
    this.heading = page.getByRole('heading', { level: 1, name: 'Budget', exact: true });

    // "Add Invoice" button — data-testid="new-invoice-button"
    this.newInvoiceButton = page.getByTestId('new-invoice-button');

    // Summary cards grid
    this.summaryGrid = page.locator('[class*="summaryGrid"]');
    // Exclude the overdue card from the four standard summary cards — its pluralized
    // label text contains "pending invoices past due" which would otherwise match
    // the Pending locator and cause strict-mode violations.
    this.pendingSummary = this.summaryGrid
      .locator('[class*="summaryCard"]:not([data-testid="summary-card-overdue"])')
      .filter({ hasText: /Pending/i });
    this.paidSummary = this.summaryGrid
      .locator('[class*="summaryCard"]:not([data-testid="summary-card-overdue"])')
      .filter({ hasText: /Paid/i });
    this.quotationSummary = this.summaryGrid
      .locator('[class*="summaryCard"]:not([data-testid="summary-card-overdue"])')
      .filter({ hasText: /Quotation/i });
    // Overdue card (conditional) — rendered only when hasOverdue===true (Issue #1421)
    this.overdueCard = page.getByTestId('summary-card-overdue');

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
    await this.page.waitForFunction(
      (btnTestId) => {
        const el = document.querySelector(`[data-testid="${btnTestId}"]`) as HTMLButtonElement | null;
        return el && !el.disabled && el.getAttribute('aria-disabled') !== 'true';
      },
      'new-invoice-button',
    );
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
  async getSummaryCount(type: 'pending' | 'paid' | 'quotation'): Promise<number> {
    let card: Locator;
    if (type === 'pending') card = this.pendingSummary;
    else if (type === 'paid') card = this.paidSummary;
    else card = this.quotationSummary;
    const countEl = card.locator('[class*="summaryCount"]');
    const text = await countEl.textContent();
    return parseInt(text ?? '0', 10);
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
