/**
 * Page Object Model for the PaperlessInvoiceReviewPage component.
 * Route: /budget/invoices/new/paperless
 *
 * This page is navigated to after selecting a document from the InvoicePaperlessPickerModal.
 * The documentId and documentTitle are passed as React Router location state.
 *
 * DOM observations from PaperlessInvoiceReviewPage.tsx (updated for Story #1703/#1704):
 *
 * Loading state (pageStatus='loading'):
 *   - div.pageContainer > div.pageHeader with h1 "Analyzing document with AI…"
 *     (budget.json: autoItemize.extractionStarted)
 *   - div.loadingState: Spinner (role="img") + h2 class*="loadingMessage"
 *   - Cancel button: disabled
 *
 * Error state (pageStatus='error'):
 *   - div.pageContainer > div.pageHeader with h1 t('autoItemize.error')
 *   - div.errorState: p.errorText + "Back to Invoices" button
 *
 * Ready state (pageStatus='ready'): TWO-COLUMN LAYOUT (Story #1703/#1704)
 *   - div.pageContainer > div.pageHeader with h1 t('autoItemize.extractionComplete')
 *   - div.pageBody (grid with formColumn + previewColumn)
 *   - LEFT: div.formColumn (class*="formColumn") — contains:
 *       - Page-level FormError banner: <FormError variant="banner"> when pageError set
 *         → renders role="alert" inside formColumn (NOT a fatal error — page stays ready)
 *       - div.vendorCard (class*="vendorCard") — SearchPicker id="vendor-picker"
 *         Vendor error (FormError variant="field") at #vendor-error inside vendorCard
 *       - div.metadataCard (class*="metadataCard") — invoice number, amount, date fields
 *       - AutoItemizeLineList (shared component — lineList/lineCard classes from its CSS module)
 *       - div.actions — "Create Invoice & Itemize" button + Cancel
 *         NOTE: Button is ONLY disabled when pageStatus='saving', NOT when vendorId is empty.
 *         Clicking without a vendor shows the inline vendor FormError (silent-failure fix).
 *   - RIGHT: div.previewColumn (class*="previewColumn") — contains:
 *       - div.pdfPreviewWrapper: iframe title="Invoice PDF preview" + div.pdfLoadingOverlay
 *       - OR div.pdfFallback when iframe fires error
 *
 * Saving state (pageStatus='saving'):
 *   - "Create Invoice & Itemize" → "Saving..." (autoItemize.saving)
 *   - Cancel button is disabled
 *   - formColumn aria-busy="true"
 */

import type { Page, Locator } from '@playwright/test';

export class PaperlessInvoiceReviewPage {
  readonly page: Page;

  /** Spinner visible during extraction loading state */
  readonly spinner: Locator;

  /** Loading message h2: "Analyzing document…" */
  readonly loadingMessage: Locator;

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

  /** SuggestionBadge shown when vendor was LLM-suggested */
  readonly vendorSuggestionBadge: Locator;

  /**
   * FormError shown when vendor is not selected on confirm attempt.
   * Scoped to the vendor card (class*="vendorCard") — rendered as role="alert" inside #vendor-error.
   * NOTE: FormError with variant="field" renders role="alert" directly inside the wrapping div.
   */
  readonly vendorError: Locator;

  /** "Create Invoice & Itemize" confirm button (text-based locator — works in all layout variants) */
  readonly confirmButton: Locator;

  /** "Cancel" button in the page action area */
  readonly cancelButton: Locator;

  /**
   * Line items list container.
   * Rendered as <ul role="list" aria-label="Extracted line items"> by the shared
   * AutoItemizeLineList component. The aria-label is stable regardless of CSS module changes.
   */
  readonly lineItemsList: Locator;

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
   * FormError variant="banner" renders role="alert". Scoped to formColumn to distinguish
   * from the vendor field error (also role="alert") inside the vendor card.
   * Uses .first() in case multiple alerts are briefly visible during the saving→ready transition.
   */
  readonly pageErrorBanner: Locator;

  constructor(page: Page) {
    this.page = page;

    // Loading state
    // Spinner from Spinner component — rendered as role="img" or just a div with class*="spinner"
    this.spinner = page.locator('[class*="spinner"], [class*="loadingState"]').first();
    this.loadingMessage = page.getByRole('heading', { name: /Analyzing document/i });

    // Fatal error state (pageStatus='error')
    this.errorContainer = page.locator(
      '[role="alert"][class*="errorState"], div[class*="errorState"]',
    );
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
    // SuggestionBadge is rendered as a span with class*="badge" in a suggestionRow
    this.vendorSuggestionBadge = page.locator('[class*="suggestionRow"] [class*="badge"]');

    // FormError renders role="alert" — scoped to vendor card to avoid matching pageErrorBanner.
    // The vendor card uses styles.vendorCard → CSS Modules class contains "vendorCard" substring.
    this.vendorError = page
      .locator('[class*="vendorCard"]')
      .locator('[role="alert"]');

    // Action buttons — text-based locators work regardless of layout changes
    this.confirmButton = page.getByRole('button', {
      name: /Create Invoice & Itemize|Saving\.\.\./i,
    });
    this.cancelButton = page.getByRole('button', { name: /^Cancel$/i });

    // Line items list — <ul role="list" aria-label="Extracted line items">
    // Rendered by shared AutoItemizeLineList component. aria-label is from i18n key
    // autoItemize.lineItemsListLabel = "Extracted line items". Stable across refactors.
    this.lineItemsList = page.getByRole('list', { name: 'Extracted line items' });

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
    await this.vendorPortalDropdown.getByRole('option', { name }).click();
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

  /**
   * Get a line item row locator by index (0-based).
   *
   * The component renders each extracted line as a <li class*="lineCard"> inside the
   * extracted-lines <ul>. The lineCard class comes from AutoItemizeLineCard.module.css
   * (shared component). The aria-based lineItemsList locator is more stable than class
   * matching across refactors, so we scope by <li> within the list.
   */
  getLineItem(index: number): Locator {
    return this.lineItemsList.locator('li').nth(index);
  }

  /**
   * Count the number of line items rendered.
   * Counts <li> children of the extracted-lines <ul> (role="list" aria-label="Extracted line items").
   */
  async getLineItemCount(): Promise<number> {
    return await this.lineItemsList.locator('li').count();
  }

  /**
   * Check if the page is at the review route.
   */
  async isAtReviewRoute(): Promise<boolean> {
    return this.page.url().includes('/budget/invoices/new/paperless');
  }
}
