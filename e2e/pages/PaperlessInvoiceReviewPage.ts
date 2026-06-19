/**
 * Page Object Model for the PaperlessInvoiceReviewPage component.
 * Route: /budget/invoices/new/paperless
 *
 * This page is navigated to after selecting a document from the InvoicePaperlessPickerModal.
 * The documentId and documentTitle are passed as React Router location state.
 *
 * DOM observations from PaperlessInvoiceReviewPage.tsx (updated for Story #1703/#1704/#1764):
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
 *         Each <li class*="lineCard"> contains:
 *           - "Assign…" button: class*="assignButtonInTable" (when no assigned line)
 *           - amber "Creating New" badge: data-testid="creating-new-badge" (when draft queued)
 *           - "Discard" button: role="button" name="Discard" (when draft queued)
 *           - inline BudgetLineForm wrapper: class*="inlineFormWrapper" (when draft queued)
 *       - div.actions — "Create Invoice & Itemize" button + Cancel
 *         NOTE: Button is ONLY disabled when pageStatus='saving', NOT when vendorId is empty.
 *         Clicking without a vendor shows the inline vendor FormError (silent-failure fix).
 *   - RIGHT: div.previewColumn (class*="previewColumn") — contains:
 *       - div.pdfPreviewWrapper: iframe title="Invoice PDF preview" + div.pdfLoadingOverlay
 *       - OR div.pdfFallback when iframe fires error
 *
 * Budget line picker modal (Story #1764 — queued-on-save inline create):
 *   - "Assign…" button on each extraction line card opens the BudgetLinePickerModal.
 *   - Step 1: role="dialog" with h2 "Assign to Work Item or Household Item"
 *       - Work Item tab → SearchPicker placeholder="Work Item"
 *       - Household Item tab → SearchPicker placeholder="Household Item"
 *   - Step 2: role="dialog" with h2 "Select Budget Line for {itemTitle}"
 *       - Existing budget line rows: class*="pickerBudgetLineRow"
 *       - "Create Budget Line" button: name /Create Budget Line/i
 *   - Clicking "Create Budget Line" CLOSES the modal (queue-on-save):
 *       - line card shows: amber "Creating New" badge (data-testid="creating-new-badge")
 *       - line card shows: inline BudgetLineForm in class*="inlineFormWrapper"
 *       - line card shows: "Discard" button (aria-label="Discard")
 *       - No API call until outer "Create Invoice & Itemize" button is clicked.
 *
 * Saving state (pageStatus='saving'):
 *   - "Create Invoice & Itemize" → "Saving..." (autoItemize.saving)
 *   - Cancel button is disabled
 *   - formColumn aria-busy="true"
 */

import { expect } from '@playwright/test';
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
   * Rendered as <div id="vendor-error"><FormError variant="field" .../></div> inside the vendor card.
   * NOTE: FormError variant="field" does NOT emit role="alert" (only variant="banner" does).
   * The outer wrapper <div id="vendor-error"> is a unique, stable anchor for this locator.
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
   * FormError variant="banner" renders role="alert". Scoped to formColumn so it does not
   * match the fatal error state container. The vendor field error (#vendor-error) does NOT
   * use role="alert" (it is FormError variant="field"), so there is no ambiguity here.
   * Uses .first() in case multiple alerts are briefly visible during the saving→ready transition.
   */
  readonly pageErrorBanner: Locator;

  // ─── Story #1764: Budget line picker modal (queued-on-save inline create) ────

  /**
   * The "Assign to Work Item or Household Item" picker modal (step 1).
   * Rendered as <Modal> → role="dialog" filtered by h2 text.
   * Same component/structure as AutoItemizePage.pickerModal.
   */
  readonly pickerModal: Locator;

  /**
   * Work Item search input in step 1 of the picker modal.
   * SearchPicker placeholder: "Work Item" (t('budgetLineForm.parentPickerWorkItemTab'))
   */
  readonly pickerWorkItemSearchInput: Locator;

  /**
   * Portal dropdown rendered by SearchPicker into document.body.
   * Has attribute [data-search-picker-dropdown]. Scoped to full page (portal bypasses modal).
   */
  readonly pickerPortalDropdown: Locator;

  /**
   * "Create Budget Line" button in step 2 of the picker modal.
   * After click: picker closes, inline form appears on line card (queued-on-save).
   * Text: t('invoiceDetail.budgetLines.picker.createLine') = "Create Budget Line"
   */
  readonly pickerCreateBudgetLineButton: Locator;

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

    // FormError variant="field" does NOT emit role="alert" (only variant="banner" does).
    // The TSX renders: <div id="vendor-error"><FormError variant="field" .../></div>
    // The outer #vendor-error wrapper is a stable, unique id on this page.
    this.vendorError = page.locator('#vendor-error');

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

    // ─── Story #1764: Budget line picker modal helpers ────────────────────────

    // Picker step-1 modal: role="dialog" filtered by h2 "Assign to Work Item or Household Item"
    this.pickerModal = page.locator('[role="dialog"]').filter({
      has: page.locator('h2', { hasText: /Assign to Work Item or Household Item/i }),
    });

    // Work Item search input: SearchPicker placeholder="Work Item" inside step-1 modal
    this.pickerWorkItemSearchInput = this.pickerModal.getByPlaceholder('Work Item');

    // Portal dropdown: SearchPicker portals to document.body — scoped to full page
    this.pickerPortalDropdown = page.locator('[data-search-picker-dropdown]');

    // "Create Budget Line" button: present in step-2 modal (and step-1 empty state).
    // Filter across both step titles (step 1 and step 2) so this works regardless of
    // which step is currently showing.
    const anyPickerModal = page.locator('[role="dialog"]').filter({
      has: page.locator('h2', {
        hasText: /Assign to Work Item or Household Item|Select Budget Line/i,
      }),
    });
    this.pickerCreateBudgetLineButton = anyPickerModal.getByRole('button', {
      name: /Create Budget Line/i,
    });
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

  // ─── Story #1764: Line card helpers (shared AutoItemizeLineList locators) ──

  /**
   * Returns the <li class*="lineCard"> at the given 0-based index.
   * AutoItemizeLineList renders extraction lines as:
   *   <ul role="list" aria-label="Extracted line items">
   *     <li class*="lineCard"> … </li>
   *   </ul>
   */
  lineRow(index: number): Locator {
    return this.page.locator('[role="list"] li[class*="lineCard"]').nth(index);
  }

  /**
   * Returns the "Assign…" button for the line at the given 0-based index.
   * Present when the line has no assigned budget line and no queued draft.
   * class*="assignButtonInTable"
   */
  lineAssignButton(index: number): Locator {
    return this.lineRow(index).locator('[class*="assignButtonInTable"]');
  }

  /**
   * Returns the amber "Creating New" badge for the line at the given 0-based index.
   * Present only when the line has an inlineCreatedBudgetLineDraft queued.
   * Rendered as <Badge testId="creating-new-badge">.
   */
  getCreatingNewBadge(index: number): Locator {
    return this.lineRow(index).getByTestId('creating-new-badge');
  }

  /**
   * Returns the "Discard" button for the inline draft on the line card at the given index.
   * Clicking it clears the inlineCreatedBudgetLineDraft and restores the "Assign…" button.
   * aria-label: t('autoItemize.discardInlineDraft') = "Discard"
   */
  getInlineDraftDiscardButton(index: number): Locator {
    return this.lineRow(index).getByRole('button', { name: /^Discard$/i });
  }

  /**
   * Returns the wrapper div containing the inline BudgetLineForm for the line at index.
   * Rendered as <div class*="inlineFormWrapper"> below the cardBottomRow.
   * Only present when inlineCreatedBudgetLineDraft is set on the line.
   */
  getInlineFormWrapper(index: number): Locator {
    return this.lineRow(index).locator('[class*="inlineFormWrapper"]');
  }

  /**
   * Returns the Description textbox inside the inline BudgetLineForm for the line at index.
   * The inline form uses idPrefix=`inline-${line.rowId}-` so the id is dynamic.
   * Locate by role textbox + accessible name "Description" (from the adjacent <label>).
   */
  getInlineDraftDescriptionInput(index: number): Locator {
    return this.getInlineFormWrapper(index).getByRole('textbox', { name: /Description/i });
  }

  /**
   * Returns the step-2 picker modal ("Select Budget Line for {itemTitle}").
   * Only present after a work item is selected in step 1.
   */
  pickerStep2Modal(): Locator {
    return this.page.locator('[role="dialog"]').filter({
      has: this.page.locator('h2', { hasText: /Select Budget Line/i }),
    });
  }

  /**
   * Open the assign picker for the extraction line at the given index, navigate
   * through step 1 (select work item) and step 2, then click "Create Budget Line".
   * On return: picker is closed and the line card shows the inline form.
   *
   * @param workItemTitle - The title to search and select in step 1
   * @param lineIndex - 0-based index of the extraction line card (default: 0)
   */
  async queueCreateNewBudgetLine(workItemTitle: string, lineIndex = 0): Promise<void> {
    const assignBtn = this.lineAssignButton(lineIndex);
    await expect(assignBtn).toBeVisible();
    await assignBtn.click();
    await expect(this.pickerModal).toBeVisible();

    // Type in the Work Item search input
    await expect(this.pickerWorkItemSearchInput).toBeVisible();
    await this.pickerWorkItemSearchInput.fill(workItemTitle);

    // Wait for portal dropdown and click the work item option
    const wiOption = this.pickerPortalDropdown.getByRole('option', {
      name: new RegExp(workItemTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
    });
    await wiOption.waitFor({ state: 'visible' });
    await wiOption.click();

    // Step 2: click "Create Budget Line"
    const step2Modal = this.pickerStep2Modal();
    await expect(step2Modal).toBeVisible();
    await expect(this.pickerCreateBudgetLineButton).toBeVisible();
    await this.pickerCreateBudgetLineButton.click();

    // Picker closes immediately (queued-on-save — Bug A fix from #1737)
    await expect(this.pickerModal).not.toBeVisible();
  }
}
