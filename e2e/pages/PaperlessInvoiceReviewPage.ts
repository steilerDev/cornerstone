/**
 * Page Object Model for the PaperlessInvoiceReviewPage component.
 * Route: /budget/invoices/new/paperless
 *
 * This page is reached from the New invoice dialog's "Read amounts and lines with AI" link, or
 * directly with `?documentId=` (the document id is the only input; a reload or deep link works).
 *
 * DOM observations from PaperlessInvoiceReviewPage.tsx (updated for Story #1703/#1704/#1764):
 *
 * Loading state (pageStatus='loading'):
 *   - div.pageContainer > div.pageHeader with h1 "New invoice" (common:navigation.newInvoice,
 *     the same h1 in loading, error and ready; #2203) and below it the status line
 *     <p role="status"> "Analyzing document with AI…" (budget.json: autoItemize.extractionStarted)
 *   - div.loadingState: Spinner (role="img") only (the old "Analyzing document…" h2 is gone)
 *   - Cancel button: disabled
 *
 * Error state (pageStatus='error'):
 *   - div.pageContainer > div.pageHeader with h1 "New invoice" (also for a missing document id)
 *   - div.errorState: p.errorText + "Back to Invoices" button
 *
 * Ready state (pageStatus='ready'): TWO-COLUMN LAYOUT (Story #1703/#1704)
 *   - div.pageContainer > div.pageHeader with h1 "New invoice" and the status line
 *     <p> t('autoItemize.extractionComplete') = "Extraction complete. …"
 *   - div.pageBody (grid with formColumn + previewColumn)
 *   - LEFT: div.formColumn (class*="formColumn") — contains:
 *       - Page-level FormError banner: <FormError variant="banner"> when pageError set
 *         → renders role="alert" inside formColumn (NOT a fatal error — page stays ready)
 *       - div.vendorCard (class*="vendorCard") — SearchPicker id="vendor-picker"
 *         Vendor error (FormError variant="field") at #vendor-error inside vendorCard
 *       - div.metadataCard (class*="metadataCard") — invoice number, amount, date fields
 *       - AutoItemizeLines: the shared lines grid with the Merge bar and the total
 *       - div.actions — "Create Invoice & Itemize" button + Cancel
 *         NOTE: Button is ONLY disabled when pageStatus='saving', NOT when vendorId is empty.
 *         Clicking without a vendor shows the inline vendor FormError (silent-failure fix).
 *   - RIGHT: div.previewColumn (class*="previewColumn") — contains:
 *       - div.pdfPreviewWrapper: iframe title="Invoice PDF preview" + div.pdfLoadingOverlay
 *       - OR div.pdfFallback when iframe fires error
 *
 * Lines (#2235): the shared cost line grid (`grid`, prefix `auto-itemize-grid`) replaces the old
 * line cards, the "Assign…" picker modal and the inline "Create Budget Line" draft. A row creates a
 * NEW cost line on its "Belongs to" task or purchase (else "Assign all to"), or links an EXISTING
 * one with "Use an existing cost line…". Nothing is created until "Create Invoice & Itemize".
 *
 * Saving state (pageStatus='saving'):
 *   - "Create Invoice & Itemize" → "Saving..." (autoItemize.saving)
 *   - Cancel button is disabled
 *   - formColumn aria-busy="true"
 */

import { expect } from '@playwright/test';
import type { Page, Locator } from '@playwright/test';
import { routeUrl } from '../../shared/src/routes/index.js';
import { CostLineGrid } from './components/CostLineGrid.js';
import { CompanyPickerControl } from './components/CompanyPickerControl.js';

export class PaperlessInvoiceReviewPage {
  readonly page: Page;

  /**
   * Loading indicator: the role="status" line under the h1 ("Analyzing document with AI…").
   * It exists only while the extraction runs.
   */
  readonly spinner: Locator;

  /**
   * Status line under the h1: "Analyzing document with AI…" while loading,
   * "Extraction complete. Please review the suggested line items." when ready.
   */
  readonly statusLine: Locator;

  /** Error container div in fatal error state (pageStatus='error') */
  readonly errorContainer: Locator;

  /** "Back to Invoices" button shown in fatal error state */
  readonly backToInvoicesButton: Locator;

  /** Vendor SearchPicker input (id="vendor-picker") — present when picker is in search/input mode (no pre-filled value) */
  readonly vendorInput: Locator;

  /**
   * Vendor SearchPicker selected-display chip — present when SearchPicker is in DISPLAY mode
   * (i.e. when initialTitle + value are set, such as when suggestedVendorId is non-null).
   * Scoped to the vendor card (class*="vendorCard") to avoid matching other selectedDisplay elements.
   */
  readonly vendorSelectedDisplay: Locator;

  /** SearchPicker portal dropdown in document.body */
  readonly vendorPortalDropdown: Locator;

  /** Clear selection button on vendor SearchPicker */
  readonly vendorClearButton: Locator;

  // ─── Issue #2148: inline vendor creation ─────────────────────────────────────

  /** The vendor picker control (#vendor-picker): input, dropdown, create row, form, clear button */
  readonly vendorPicker: CompanyPickerControl;

  /** `New company <query>` row inside the vendor dropdown (#2213) */
  readonly vendorCreateOption: Locator;
  /** The New company ObjectForm dialog opened by the create row (title "New company") */
  readonly vendorCreateModal: Locator;
  readonly vendorCreateNameInput: Locator;
  readonly vendorCreatePhoneInput: Locator;
  readonly vendorCreateEmailInput: Locator;
  /** Save button of the New company form ("Save" / "Saving…", aria-disabled while in flight) */
  readonly vendorCreateSubmit: Locator;
  readonly vendorCreateCancel: Locator;
  /** Server error banner (FormError variant="banner", role="alert") inside the modal */
  readonly vendorCreateErrorBanner: Locator;
  /** sr-only polite status region used for the "created and selected" announcement */
  readonly statusRegion: Locator;
  readonly invoiceNumberInput: Locator;
  readonly notesInput: Locator;

  /** Top-level "Budget source" default select (#invoice-budget-source), Story #2158 */
  readonly budgetSourceSelect: Locator;

  /** SuggestionBadge shown when vendor was LLM-suggested */
  readonly vendorSuggestionBadge: Locator;

  /**
   * FormError shown when vendor is not selected on confirm attempt.
   * Rendered as <div id="vendor-error"><FormError variant="field" .../></div> inside the vendor card.
   * NOTE: FormError variant="field" does NOT emit role="alert" (only variant="banner" does).
   * The outer wrapper <div id="vendor-error"> is a unique, stable anchor for this locator.
   */
  readonly vendorError: Locator;

  /** Invoice Status <select id="invoice-status"> (pending/paid/claimed/quotation) */
  readonly statusSelect: Locator;

  /** "Create Invoice & Itemize" confirm button (text-based locator — works in all layout variants) */
  readonly confirmButton: Locator;

  /** "Cancel" button in the page action area */
  readonly cancelButton: Locator;

  /**
   * The lines grid (the shared cost line grid, test id prefix `auto-itemize-grid`, #2235). The
   * index helpers below are 0-based; `grid.row(1)` is the first row.
   */
  readonly grid: CostLineGrid;

  /** Merge controls (same as the Split with AI page): the Merge button and the notice rows. */
  readonly mergeButton: Locator;
  readonly clearSelectionButton: Locator;
  readonly mergingRow: Locator;
  readonly mergeErrorRow: Locator;
  readonly mergeRetryButton: Locator;
  readonly mergeUndoButton: Locator;

  // ─── Story #1703/#1704: Two-column layout + PDF preview ─────────────────────

  /**
   * PDF preview iframe: <iframe title="Invoice PDF preview">
   * Rendered inside previewColumn when pageStatus='ready' and no PDF error.
   * t('autoItemize.pdfPreviewTitle') = "Invoice PDF preview"
   */
  readonly pdfIframe: Locator;

  /**
   * Form column: <div class*="formColumn"> — left column of the two-column layout.
   * Contains vendor card, metadata card, line list, and action buttons.
   * Only present in ready/saving state.
   */
  readonly formColumn: Locator;

  /**
   * Preview column: <div class*="previewColumn"> — right column of the two-column layout.
   * Contains the PDF iframe (or fallback). Only present in ready/saving state.
   */
  readonly previewColumn: Locator;

  /**
   * Page-level error banner in ready state.
   * Rendered as <FormError variant="banner"> inside formColumn when commit fails.
   * FormError variant="banner" renders role="alert". Scoped to formColumn so it does not
   * match the fatal error state container. The vendor field error (#vendor-error) does NOT
   * use role="alert" (it is FormError variant="field"), so there is no ambiguity here.
   * Uses .first() in case multiple alerts are briefly visible during the saving→ready transition.
   */
  readonly pageErrorBanner: Locator;

  /** Page h1: "New invoice" in every state (loading, error, missing document, ready). */
  readonly heading: Locator;

  constructor(page: Page) {
    this.page = page;

    this.heading = page.getByRole('heading', { level: 1 });

    // Loading state: the status line (budget:autoItemize.extractionStarted) is a
    // role="status" paragraph in the page header, rendered only while pageStatus === 'loading'.
    this.statusLine = page.locator('[class*="pageHeader"] p[class*="statusLine"]');
    this.spinner = page
      .locator('[class*="pageHeader"]')
      .getByRole('status')
      .filter({ hasText: 'Analyzing document with AI…' });

    // Fatal error state (pageStatus='error')
    this.errorContainer = page.locator(
      '[role="alert"][class*="errorState"], div[class*="errorState"]',
    );
    this.statusSelect = page.locator('#invoice-status');
    this.backToInvoicesButton = page.getByRole('button', { name: /Back to Invoices/i });

    // Ready state — vendor section
    this.vendorInput = page.locator('#vendor-picker');

    // When SearchPicker is in DISPLAY mode (initialTitle + value set), it renders a
    // selectedDisplay div instead of the #vendor-picker input.
    // Scoped to the vendor card via class*="vendorCard" (CSS Modules emits
    // "PaperlessInvoiceReviewPage__vendorCard--hash" which contains "vendorCard" substring).
    this.vendorSelectedDisplay = page
      .locator('[class*="vendorCard"]')
      .locator('[class*="selectedDisplay"]');

    // SearchPicker portals dropdown to document.body
    this.vendorPortalDropdown = page.locator('[data-search-picker-dropdown]');
    this.vendorClearButton = page.getByRole('button', { name: 'Clear selection', exact: true });

    this.vendorPicker = new CompanyPickerControl(
      page,
      'vendor-picker',
      page.locator('[class*="vendorCard"]'),
    );
    this.vendorCreateOption = this.vendorPortalDropdown.getByRole('option', {
      name: /New company/,
    });
    // The company form is the shared ObjectForm (#2213): phone and e-mail sit behind
    // "More details" (open it with `expandVendorCreateDetails()` before using them).
    this.vendorCreateModal = this.vendorPicker.form.dialog;
    this.vendorCreateNameInput = this.vendorPicker.form.field('name');
    this.vendorCreatePhoneInput = this.vendorPicker.form.field('phone');
    this.vendorCreateEmailInput = this.vendorPicker.form.field('email');
    this.vendorCreateSubmit = this.vendorPicker.form.saveButton;
    this.vendorCreateCancel = this.vendorPicker.form.cancelButton;
    this.vendorCreateErrorBanner = this.vendorPicker.form.errorBanner;
    this.statusRegion = page.locator('[class*="formColumn"] [role="status"]');
    this.invoiceNumberInput = page.locator('#invoice-number');
    this.notesInput = page.locator('#notes');
    this.budgetSourceSelect = page.locator('#invoice-budget-source');
    // SuggestionBadge is rendered as a span with class*="badge" in a suggestionRow
    this.vendorSuggestionBadge = page.locator('[class*="suggestionRow"] [class*="badge"]');

    // FormError variant="field" does NOT emit role="alert" (only variant="banner" does).
    // The TSX renders: <div id="vendor-error"><FormError variant="field" .../></div>
    // The outer #vendor-error wrapper is a stable, unique id on this page.
    this.vendorError = page.locator('#vendor-error');

    // Action buttons — text-based locators work regardless of layout changes
    this.confirmButton = page.getByRole('button', {
      name: /Create Invoice & Itemize|Saving\.\.\./i,
    });
    this.cancelButton = page.getByRole('button', { name: /^Cancel$/i });

    this.grid = new CostLineGrid(page, 'auto-itemize-grid');

    // ─── Story #1703/#1704: Two-column layout + PDF preview ─────────────────────

    // PDF iframe: <iframe title="Invoice PDF preview">
    // t('autoItemize.pdfPreviewTitle') = "Invoice PDF preview" — same key as AutoItemizePage.
    this.pdfIframe = page.locator('iframe[title="Invoice PDF preview"]');

    // Form column: <div id="itemize-form" class*="formColumn"> in ready state.
    // CSS Modules emits "PaperlessInvoiceReviewPage__formColumn--hash" which contains "formColumn".
    this.formColumn = page.locator('[class*="formColumn"]');

    // Preview column: <div class*="previewColumn"> in ready state.
    this.previewColumn = page.locator('[class*="previewColumn"]');

    // Page-level error banner: <FormError variant="banner"> inside formColumn.
    // FormError variant="banner" renders role="alert". Scoped to formColumn so it does not
    // match the vendor field error (also role="alert") or the fatal error state container.
    this.pageErrorBanner = page.locator('[class*="formColumn"]').locator('[role="alert"]').first();

    // Merge: the Merge button of the SelectionActionBar and the grid's notice rows
    this.mergeButton = page.getByRole('button', { name: /^Merge \d+ selected line items$/i });
    this.clearSelectionButton = page.getByRole('button', { name: /^Clear selection$/i });
    this.mergingRow = this.grid.grid.locator('[role="status"]').filter({ hasText: /^Merging / });
    this.mergeErrorRow = this.grid.grid.locator('[role="alert"]');
    this.mergeRetryButton = page.locator('[data-testid^="auto-itemize-grid-notice-retry-"]');
    this.mergeUndoButton = page.locator('[data-testid^="auto-itemize-grid-notice-undo-"]');
  }

  /**
   * Navigate directly to the review page. The document id lives in the URL
   * (`?documentId=`), so a bookmark / reload / login redirect all work.
   * Omit the id to reach the "No document chosen" state.
   */
  async goto(documentId?: number): Promise<void> {
    await this.page.goto(routeUrl('invoicePaperlessReview', undefined, { documentId }));
  }

  /**
   * Wait for the extraction to complete (ready state — two-column layout visible).
   * Waits for the formColumn to appear, which is only rendered in pageStatus='ready'/'saving'.
   * This is more robust than waiting for the confirm button alone since it tests the
   * two-column layout structure introduced in Story #1703/#1704.
   */
  async waitForExtractionComplete(): Promise<void> {
    // Wait for the two-column layout to appear (indicates ready state, not loading/error)
    await this.formColumn.waitFor({ state: 'visible' });
  }

  /**
   * Wait for the loading spinner to appear (extraction in progress).
   */
  async waitForLoading(): Promise<void> {
    await this.spinner.waitFor({ state: 'visible' });
  }

  /**
   * Wait for the error state to appear.
   */
  async waitForError(): Promise<void> {
    await this.errorContainer.waitFor({ state: 'visible' });
  }

  /**
   * Set the vendor by typing in the SearchPicker and selecting from portal dropdown.
   * @param name - Vendor name to search and select
   */
  async setVendor(name: string): Promise<void> {
    await this.vendorInput.fill(name);
    await this.vendorPortalDropdown.waitFor({ state: 'visible' });
    await this.vendorPortalDropdown.getByRole('option', { name, exact: true }).click();
  }

  /**
   * Focus the vendor picker and activate the "New company" row (opens the New company form).
   * Pass `query` to type into the picker first (otherwise the dropdown opens on focus).
   */
  async expandVendorCreateDetails(): Promise<void> {
    await this.vendorPicker.form.expandMoreDetails();
  }

  async openCreateVendor(query?: string): Promise<void> {
    if (query !== undefined) {
      await this.vendorInput.fill(query);
    } else {
      await this.vendorInput.focus();
    }
    await this.vendorPortalDropdown.waitFor({ state: 'visible' });
    await this.vendorCreateOption.click();
    await this.vendorCreateModal.waitFor({ state: 'visible' });
  }

  /**
   * Clear the vendor selection using the clear button.
   */
  async clearVendor(): Promise<void> {
    await this.vendorClearButton.click();
  }

  /**
   * Return the vendor SuggestionBadge locator.
   */
  getVendorSuggestionBadge(): Locator {
    return this.vendorSuggestionBadge;
  }

  /**
   * Click the "Create Invoice & Itemize" confirm button.
   * Registers a waitForResponse before clicking to avoid race conditions.
   * Returns the navigated invoice ID from the response.
   */
  async confirm(): Promise<void> {
    await this.confirmButton.click();
  }

  /**
   * Click the Cancel button to abandon the review and navigate back to invoices.
   */
  async cancel(): Promise<void> {
    await this.cancelButton.click();
  }

  /**
   * Get the vendor FormError locator for assertions.
   */
  getVendorError(): Locator {
    return this.vendorError;
  }

  /** Row `index` (0-based) of the lines grid. */
  getLineItem(index: number): Locator {
    return this.grid.row(index + 1);
  }

  /** Number of extracted lines in the grid (the trailing blank row is not counted). */
  async getLineItemCount(): Promise<number> {
    return this.grid.filledRowCount();
  }

  /**
   * Check if the page is at the review route.
   */
  async isAtReviewRoute(): Promise<boolean> {
    return this.page.url().includes(routeUrl('invoicePaperlessReview'));
  }

  // ─── Grid rows (0-based indexes; the same grid as the Split with AI page) ──

  lineRow(index: number): Locator {
    return this.grid.row(index + 1);
  }

  /** The Include checkbox of the row. */
  lineCheckbox(index: number): Locator {
    return this.grid.include(index + 1);
  }

  lineDescription(index: number): Locator {
    return this.grid.description(index + 1);
  }

  lineQuantity(index: number): Locator {
    return this.grid.cell('Quantity', index + 1);
  }

  /** The Unit price input (the whole amount for a line without a quantity). */
  lineUnitPrice(index: number): Locator {
    return this.grid.cell('Unit price', index + 1);
  }

  /** The Net | Gross toggle of the row. */
  lineEnteredAs(index: number): Locator {
    return this.grid.enteredAs(index + 1);
  }

  /** The gross amount cell of the row. */
  lineGross(index: number): Locator {
    return this.grid.gross(index + 1);
  }

  lineCategory(index: number): Locator {
    return this.grid.cell('Cost category', index + 1);
  }

  /** The Funding source select of the row. */
  lineSourceSelect(index: number): Locator {
    return this.grid.cell('Funding source', index + 1);
  }

  /** The row's own "Belongs to" picker input. */
  lineTarget(index: number): Locator {
    return this.grid.target(index + 1);
  }

  /** "Use an existing cost line…" of the row. */
  lineUseExistingButton(index: number): Locator {
    return this.grid.useExistingButton(index + 1);
  }

  lineClearExistingButton(index: number): Locator {
    return this.grid.clearExistingButton(index + 1);
  }

  lineExistingLabel(index: number): Locator {
    return this.grid.existingLabel(index + 1);
  }

  /** The merge-selection checkbox of the row. */
  lineSelectCheckbox(index: number): Locator {
    return this.grid.select(index + 1);
  }

  /**
   * Mark a row as "create a NEW cost line on this task" (#2235): choose the task under Belongs to
   * and a cost category (a row that creates a line needs one); optionally the Funding source.
   * Nothing is created until "Create Invoice & Itemize".
   *
   * @param options.lineIndex - 0-based row (default 0)
   * @param options.budgetSourceId - Funding source to select. Pass it for any flow that saves:
   *   the select otherwise defaults to Discretionary.
   */
  async queueCreateNewBudgetLine(
    workItemTitle: string,
    options: { lineIndex?: number; budgetSourceId?: string } = {},
  ): Promise<void> {
    const lineIndex = options.lineIndex ?? 0;
    await this.grid.targetPicker(lineIndex + 1).pick(workItemTitle);
    await expect(this.lineRow(lineIndex)).toContainText(workItemTitle);
    await this.lineCategory(lineIndex).selectOption({ index: 1 });
    if (options.budgetSourceId) {
      const sourceSelect = this.lineSourceSelect(lineIndex);
      await sourceSelect.selectOption(options.budgetSourceId);
      await expect(sourceSelect).toHaveValue(options.budgetSourceId);
    }
  }

  // ─── Merge multiple extracted line items ────────────────────────────────────

  /** The sticky SelectionActionBar (present while at least one row is selected). */
  selectionActionBar(): Locator {
    return this.mergeButton.locator('xpath=ancestor::div[contains(@class,"bar")][1]');
  }

  async selectLineForMerge(index: number): Promise<void> {
    await this.lineSelectCheckbox(index).check();
  }

  async clickMergeButton(): Promise<void> {
    await this.mergeButton.click();
  }

  async clickClearSelection(): Promise<void> {
    await this.clearSelectionButton.first().click();
  }

  /** 'hidden' (no selection), 'disabled' (one row, `aria-disabled`) or 'enabled' (two or more). */
  async getMergeButtonState(): Promise<'hidden' | 'disabled' | 'enabled'> {
    if ((await this.mergeButton.count()) === 0) return 'hidden';
    if (!(await this.mergeButton.isVisible())) return 'hidden';
    return (await this.mergeButton.getAttribute('aria-disabled')) === 'true'
      ? 'disabled'
      : 'enabled';
  }

  /** Waits until no row is merging any more. */
  async waitForMergedRow(): Promise<void> {
    await this.mergingRow.waitFor({ state: 'hidden' });
  }

  async clickRetryMerge(): Promise<void> {
    await this.mergeRetryButton.click();
  }

  async clickUndoMerge(): Promise<void> {
    await this.mergeUndoButton.click();
  }
}
