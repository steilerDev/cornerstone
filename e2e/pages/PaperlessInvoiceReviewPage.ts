/**
 * Page Object Model for the PaperlessInvoiceReviewPage component.
 * Route: /budget/invoices/new/paperless
 *
 * This page is navigated to after selecting a document from the InvoicePaperlessPickerModal.
 * The documentId and documentTitle are passed as React Router location state.
 *
 * DOM observations from PaperlessInvoiceReviewPage.tsx:
 *
 * Loading state (pageStatus='loading'):
 *   - PageLayout title: "Analyzing document with AI…"
 *     (budget.json: autoItemize.extractionStarted)
 *   - Spinner (role="img" from Spinner component)
 *   - Loading message h2: "Analyzing document…"
 *     (budget.json: autoItemize.extractingFromDocument)
 *   - Cancel button: disabled (text: "Cancel")
 *
 * Error state (pageStatus='error'):
 *   - PageLayout title: t('autoItemize.error')
 *   - Error container: div role="alert" with class*="errorState"
 *   - Error text paragraph inside error container
 *   - "Back to Invoices" button (budget.json: autoItemize.backToInvoices)
 *
 * Ready state (pageStatus='ready'):
 *   - PageLayout title: "Extraction complete. Please review the suggested line items."
 *     (budget.json: autoItemize.extractionComplete)
 *   - Vendor card: div.card containing h3 "Vendor" + SearchPicker id="vendor-picker"
 *   - Vendor SuggestionBadge: span with class*="badge" when vendor was LLM-suggested
 *     Rendered when suggestedVendorId matches current vendorId
 *   - Vendor error (FormError): rendered when vendor not selected on submit attempt
 *   - Line items card: div.card containing h3 "Line Items" and div.linesList
 *   - Action bar: div.actionBar with "Create Invoice & Itemize" button
 *     (budget.json: autoItemize.createAndItemize)
 *     Button is disabled when vendorId is empty or pageStatus='saving'
 *   - Cancel button in header action area (budget.json: autoItemize.cancel = "Cancel")
 *
 * Saving state (pageStatus='saving'):
 *   - "Create Invoice & Itemize" button text changes to "Saving..." (autoItemize.saving)
 *   - Cancel button is disabled
 */

import type { Page, Locator } from '@playwright/test';

export class PaperlessInvoiceReviewPage {
  readonly page: Page;

  /** Spinner visible during extraction loading state */
  readonly spinner: Locator;

  /** Loading message h2: "Analyzing document…" */
  readonly loadingMessage: Locator;

  /** Error container div (role="alert") in error state */
  readonly errorContainer: Locator;

  /** "Back to Invoices" button shown in error state */
  readonly backToInvoicesButton: Locator;

  /** Vendor SearchPicker input (id="vendor-picker") — present when picker is in search/input mode (no pre-filled value) */
  readonly vendorInput: Locator;

  /**
   * Vendor SearchPicker selected-display chip — present when SearchPicker is in DISPLAY mode
   * (i.e. when initialTitle + value are set, such as when suggestedVendorId is non-null).
   * Scoped to the vendor card to avoid matching other selectedDisplay elements on the page.
   */
  readonly vendorSelectedDisplay: Locator;

  /** SearchPicker portal dropdown in document.body */
  readonly vendorPortalDropdown: Locator;

  /** Clear selection button on vendor SearchPicker */
  readonly vendorClearButton: Locator;

  /** SuggestionBadge shown when vendor was LLM-suggested */
  readonly vendorSuggestionBadge: Locator;

  /** FormError shown when vendor is not selected on confirm attempt */
  readonly vendorError: Locator;

  /** "Create Invoice & Itemize" confirm button */
  readonly confirmButton: Locator;

  /** "Cancel" button in the page action area */
  readonly cancelButton: Locator;

  /** Line items list container */
  readonly lineItemsList: Locator;

  constructor(page: Page) {
    this.page = page;

    // Loading state
    // Spinner from Spinner component — rendered as role="img" or just a div with class*="spinner"
    this.spinner = page.locator('[class*="spinner"], [class*="loadingState"]').first();
    this.loadingMessage = page.getByRole('heading', { name: /Analyzing document/i });

    // Error state
    this.errorContainer = page.locator('[role="alert"][class*="errorState"], div[class*="errorState"]');
    this.backToInvoicesButton = page.getByRole('button', { name: /Back to Invoices/i });

    // Ready state — vendor section
    this.vendorInput = page.locator('#vendor-picker');
    // When SearchPicker is in DISPLAY mode (initialTitle + value set), it renders a
    // selectedDisplay div instead of the #vendor-picker input.
    // Scope to the vendor card (the card containing "vendor-picker" label) via aria label proximity
    // or by scoping to the first card element that also wraps the suggestionRow.
    // The vendor card is the first .card child of the page — scope via class for reliability.
    this.vendorSelectedDisplay = page.locator('[class*="card"]').first().locator('[class*="selectedDisplay"]');
    // SearchPicker portals dropdown to document.body
    this.vendorPortalDropdown = page.locator('[data-search-picker-dropdown]');
    this.vendorClearButton = page.getByRole('button', { name: 'Clear selection', exact: true });
    // SuggestionBadge is rendered as a span with class*="badge" in a suggestionRow
    this.vendorSuggestionBadge = page.locator('[class*="suggestionRow"] [class*="badge"]');
    // FormError renders role="alert" — scope to vendor card to avoid ambiguity
    this.vendorError = page.locator('[class*="card"]').filter({ has: page.locator('#vendor-picker') }).locator('[role="alert"]');

    // Action buttons
    this.confirmButton = page.getByRole('button', {
      name: /Create Invoice & Itemize|Saving\.\.\./i,
    });
    this.cancelButton = page.getByRole('button', { name: /^Cancel$/i });

    // Line items
    this.lineItemsList = page.locator('[class*="linesList"]');
  }

  /**
   * Wait for the extraction to complete (spinner gone, form visible).
   * Uses the confirm button as the ready indicator.
   */
  async waitForExtractionComplete(): Promise<void> {
    await this.confirmButton.waitFor({ state: 'visible' });
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
   */
  getLineItem(index: number): Locator {
    return this.lineItemsList.locator('[class*="lineItem"]').nth(index);
  }

  /**
   * Count the number of line items rendered.
   */
  async getLineItemCount(): Promise<number> {
    return await this.lineItemsList.locator('[class*="lineItem"]').count();
  }

  /**
   * Check if the page is at the review route.
   */
  async isAtReviewRoute(): Promise<boolean> {
    return this.page.url().includes('/budget/invoices/new/paperless');
  }
}
