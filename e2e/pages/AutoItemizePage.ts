/**
 * Page Object Model for the Auto-Itemize Page
 * Route: /budget/invoices/:id/auto-itemize/:documentId
 *
 * Updated in story #1576 (auto-itemize UI rework):
 * - Line table replaced with <ul role="list"> of .lineCard elements
 * - Skeleton loader replaced with Spinner (role="img" aria-label="Analyzing invoice")
 * - DocumentDetailPanel replaced with <iframe title="Invoice PDF preview">
 * - Status select added: <select id="invoice-status">
 * - vatRate input removed from line cards
 *
 * DOM observations from AutoItemizePage.tsx:
 * - Loading state:
 *   - Spinner: role="img" aria-label="Analyzing invoice" (t('autoItemize.spinnerLabel'))
 *   - analyzingCaption: <p class="analyzingCaption"> with t('autoItemize.analyzing') = "Analyzing… (Ns)"
 * - Ready state:
 *   - pageTitle: h1 with t('autoItemize.title') = "Auto-Itemize Invoice"
 *   - breadcrumb: <a class="breadcrumb"> with t('autoItemize.backToInvoice') = "Back to Invoice"
 *   - metadataCard: invoice metadata form with inputs #invoice-number, #amount, #date, #due-date, #notes
 *   - SuggestionBadge fields: invoiceNumber, amount, date, dueDate, notes (all use same badge pattern)
 *   - statusSelect: <select id="invoice-status"> with status options
 *   - lineList: <ul role="list" aria-label="Extracted line items"> containing <li class*="lineCard">
 *   - Each lineCard:
 *     - cardTopRow: <textarea class*="cardDescriptionInput"> for description
 *     - cardMetricGrid: 4 metric cells (qty, unit, unitPrice, totalAmount) each with <input class*="cardMetricInput">
 *     - cardBottomRow: include checkbox (1st), VAT checkbox (2nd), assign zone
 *   - PDF preview column:
 *     - pdfIframe: <iframe title="Invoice PDF preview">
 *     - pdfLoadingOverlay: <div class*="pdfLoadingOverlay"> (while iframe loading)
 *     - pdfFallback: <div role="region" aria-label="PDF preview unavailable"> on error
 *   - SuggestionBadge: <span class="badge"> adjacent to amount/date/dueDate fields
 *   - saveButton: button with t('autoItemize.save') = "Save" / t('autoItemize.saving') = "Saving..."
 *   - cancelButton: button with t('autoItemize.cancel') = "Cancel"
 * - Error state:
 *   - errorBanner: FormError with variant="banner" → role="alert"
 *   - retryButton: button with t('autoItemize.retry') = "Retry"
 * - Cancel confirmation modal:
 *   - title: t('autoItemize.cancelConfirmTitle') = "Discard Changes?"
 *   - discardButton: t('autoItemize.discardChanges') = "Discard Changes"
 *   - keepEditingButton: t('autoItemize.keepEditing') = "Keep Editing"
 * - Budget line picker modal (same as story #1564):
 *   - Step 1: "Assign to Work Item or Household Item"
 *   - Step 2: "Select Budget Line for {itemTitle}"
 * - Layout columns: .formColumn and .previewColumn
 *   Breakpoint: @media (max-width: 860px) → single column, formColumn order:1, previewColumn order:2
 */

import type { Page, Locator } from '@playwright/test';

export class AutoItemizePage {
  readonly page: Page;

  // Header
  readonly pageTitle: Locator;
  readonly breadcrumb: Locator;
  readonly saveButton: Locator;
  readonly cancelButton: Locator;

  // Loading state — Spinner replaces old Skeleton (story #1576)
  /**
   * The Spinner shown during LLM dry-run.
   * Rendered as role="img" with aria-label="Analyzing invoice"
   * (t('autoItemize.spinnerLabel') = "Analyzing invoice").
   */
  readonly spinner: Locator;

  /**
   * The elapsed-seconds caption below the spinner.
   * aria-hidden="true" on the <p> element; class*="analyzingCaption".
   * Text: "Analyzing… (Ns)" — matches regex /\(\d+s\)/
   */
  readonly analyzingCaption: Locator;

  // Error state
  readonly errorBanner: Locator;
  readonly retryButton: Locator;

  // Metadata form inputs
  readonly invoiceNumberInput: Locator;
  readonly totalAmountInput: Locator;
  readonly invoiceDateInput: Locator;
  readonly dueDateInput: Locator;
  readonly notesInput: Locator;

  /**
   * Status select: <select id="invoice-status">.
   * Options: pending, paid, claimed, quotation (t('invoices.statusLabels.*')).
   */
  readonly statusSelect: Locator;

  // PDF preview (story #1576)
  /**
   * The PDF iframe: <iframe title="Invoice PDF preview">
   * (t('autoItemize.pdfPreviewTitle') = "Invoice PDF preview").
   * src = {baseUrl}/paperless/documents/{documentId}/preview
   */
  readonly pdfIframe: Locator;

  /**
   * Loading overlay shown while iframe is loading.
   * <div class*="pdfLoadingOverlay"> containing a Spinner (aria-hidden="true").
   */
  readonly pdfLoadingOverlay: Locator;

  /**
   * Fallback panel shown when iframe fires an error event.
   * <div role="region" aria-label="PDF preview unavailable">
   * (t('autoItemize.previewUnavailable') = "PDF preview unavailable")
   */
  readonly pdfFallback: Locator;

  // Cancel confirmation modal
  readonly cancelModal: Locator;
  readonly discardButton: Locator;
  readonly keepEditingButton: Locator;

  // Live region for a11y announcements
  readonly liveRegion: Locator;

  // Layout columns (for responsive checks)
  readonly formColumn: Locator;
  readonly previewColumn: Locator;

  // ─── Per-row assignment picker modal (story #1564 Round 2) ─────────────────
  //
  // The budget line picker modal has two steps (same logic as InvoiceBudgetLinesSection):
  //  Step 1: Two side-by-side pickers (WorkItemPicker + HouseholdItemPicker)
  //    - pickerModal: role="dialog" filtered by h2 "Assign to Work Item or Household Item"
  //    - pickerWorkItemSearchInput: plain <input type="text"> placeholder="Search work items..."
  //    - pickerHouseholdItemSearchInput: plain <input type="text"> placeholder="Search household items..."
  //  Step 2: Budget line list (modal title changes to step-2 title)
  //    - pickerBudgetLineRows: buttons class*="pickerBudgetLineRow"
  //    - pickerBackButton: "← Back" button
  //    - pickerCreateBudgetLineButton: "Create Budget Line" button
  //    - pickerCreateBudgetLineFieldset: fieldset class*="createBudgetLineFieldset"

  /** Budget line assignment picker modal (step 1 — "Assign to Work Item or Household Item"). */
  readonly pickerModal: Locator;

  /**
   * Search input for Work Items in step 1 of the picker modal.
   * Rendered by WorkItemPicker → SearchPicker as a plain <input type="text">
   * with placeholder "Search work items..." (hardcoded prop in AutoItemizePage.tsx).
   */
  readonly pickerWorkItemSearchInput: Locator;

  /**
   * Search input for Household Items in step 1 of the picker modal.
   * Rendered by HouseholdItemPicker → SearchPicker as a plain <input type="text">
   * with placeholder "Search household items..." (hardcoded prop in AutoItemizePage.tsx).
   */
  readonly pickerHouseholdItemSearchInput: Locator;

  /**
   * "← Back" button in step 2 of the picker modal.
   * Returns to step 1. Text: t('invoiceDetail.budgetLines.picker.backButton') = "← Back"
   */
  readonly pickerBackButton: Locator;

  /**
   * "Create Budget Line" button in step 2 of the picker modal (empty-state or below list).
   * Text: t('invoiceDetail.budgetLines.picker.createLine') = "Create Budget Line"
   */
  readonly pickerCreateBudgetLineButton: Locator;

  /**
   * Fieldset wrapping the inline BudgetLineForm in step 2.
   * Only rendered when pickerState.showCreateForm=true.
   * class*="createBudgetLineFieldset"
   */
  readonly pickerCreateBudgetLineFieldset: Locator;

  constructor(page: Page) {
    this.page = page;

    // The h1 title: "Auto-Itemize Invoice"
    this.pageTitle = page.getByRole('heading', { level: 1 });

    // Breadcrumb back link: "Back to Invoice" — rendered as <a class="breadcrumb">
    // In loading/error states this is not present; in ready state it renders inside pageHeader.
    // getByRole('link') is more robust than class-based since the link uses the t() string.
    this.breadcrumb = page.getByRole('link', { name: /Back to Invoice/i });

    // Save button: "Save" / "Saving..."
    this.saveButton = page.getByRole('button', { name: /^Save$|^Saving\.\.\.$/i });

    // Cancel button in the form actions area
    // We scope to the actions container to avoid matching "Keep Editing" / "Discard" buttons
    this.cancelButton = page.locator('[class*="actions"]').getByRole('button', {
      name: /^Cancel$/i,
      exact: true,
    });

    // Spinner during LLM dry-run: role="img" aria-label="Analyzing invoice"
    // The Spinner component renders role="img" with the label prop as aria-label.
    // t('autoItemize.spinnerLabel') = "Analyzing invoice"
    this.spinner = page.locator('[role="img"][aria-label="Analyzing invoice"]');

    // Elapsed-seconds caption: class*="analyzingCaption", aria-hidden="true"
    // Text: "Analyzing… (Ns)" — rendered while pageStatus === 'loading'
    this.analyzingCaption = page.locator('[class*="analyzingCaption"]');

    // Error banner (FormError variant="banner" → role="alert")
    this.errorBanner = page.locator('[role="alert"]').first();

    // Retry button: "Retry"
    this.retryButton = page.getByRole('button', { name: /^Retry$/i });

    // Metadata inputs
    this.invoiceNumberInput = page.locator('#invoice-number');
    this.totalAmountInput = page.locator('#amount');
    this.invoiceDateInput = page.locator('#date');
    this.dueDateInput = page.locator('#due-date');
    this.notesInput = page.locator('#notes');

    // Status select: <select id="invoice-status">
    this.statusSelect = page.locator('#invoice-status');

    // PDF iframe: <iframe title="Invoice PDF preview">
    // t('autoItemize.pdfPreviewTitle') = "Invoice PDF preview"
    this.pdfIframe = page.locator('iframe[title="Invoice PDF preview"]');

    // PDF loading overlay: <div class*="pdfLoadingOverlay"> (shown while iframe is loading)
    this.pdfLoadingOverlay = page.locator('[class*="pdfLoadingOverlay"]');

    // PDF fallback panel: <div role="region" aria-label="PDF preview unavailable">
    // Rendered when iframe fires onError. t('autoItemize.previewUnavailable') = "PDF preview unavailable"
    this.pdfFallback = page.locator('[role="region"][aria-label="PDF preview unavailable"]');

    // Cancel confirmation modal (Modal component renders with role="dialog")
    // Title: "Discard Changes?" (t('autoItemize.cancelConfirmTitle'))
    this.cancelModal = page.locator('[role="dialog"]').filter({
      has: page.locator('h2', { hasText: /Discard Changes/i }),
    });

    // Discard button inside the cancel modal
    this.discardButton = this.cancelModal.getByRole('button', { name: /Discard Changes/i });

    // Keep Editing button inside the cancel modal
    this.keepEditingButton = this.cancelModal.getByRole('button', { name: /Keep Editing/i });

    // Live region for a11y announcements (role="status" aria-atomic="true")
    this.liveRegion = page.locator('[role="status"][aria-atomic="true"]');

    // Layout columns
    this.formColumn = page.locator('[class*="formColumn"]');
    this.previewColumn = page.locator('[class*="previewColumn"]');

    // ─── Per-row assignment picker modal (story #1564 Round 2) ───────────────
    // The Modal uses useId() for aria-labelledby — NOT accessible name on the dialog itself.
    // Filter by the h2 text to scope to the correct dialog.
    this.pickerModal = page.locator('[role="dialog"]').filter({
      has: page.locator('h2', { hasText: /Assign to Work Item or Household Item/i }),
    });

    // Step 1 — Work Item search input (plain <input type="text"> placeholder="Search work items...")
    this.pickerWorkItemSearchInput = this.pickerModal.getByPlaceholder('Search work items...');

    // Step 1 — Household Item search input (plain <input type="text"> placeholder="Search household items...")
    this.pickerHouseholdItemSearchInput = this.pickerModal.getByPlaceholder(
      'Search household items...',
    );

    // Step 2 — Back and Create buttons scoped to either modal step
    const anyPickerModal = page.locator('[role="dialog"]').filter({
      has: page.locator('h2', {
        hasText: /Assign to Work Item or Household Item|Select Budget Line/i,
      }),
    });
    this.pickerBackButton = anyPickerModal.getByRole('button', { name: /← Back/i });
    this.pickerCreateBudgetLineButton = anyPickerModal.getByRole('button', {
      name: /Create Budget Line/i,
    });
    this.pickerCreateBudgetLineFieldset = anyPickerModal.locator(
      '[class*="createBudgetLineFieldset"]',
    );
  }

  /**
   * Navigate directly to the AutoItemizePage.
   * In real usage this page is reached via InvoiceDetailPage → Itemize button.
   */
  async goto(invoiceId: string, documentId: number): Promise<void> {
    await this.page.goto(`/budget/invoices/${invoiceId}/auto-itemize/${documentId}`);
    await this.pageTitle.waitFor({ state: 'visible' });
  }

  /**
   * Returns the picker modal when it is in step 2 (budget line list).
   * The modal title in step 2 changes to "Select Budget Line for {itemTitle}".
   */
  pickerStep2Modal(): Locator {
    return this.page.locator('[role="dialog"]').filter({
      has: this.page.locator('h2', { hasText: /Select Budget Line/i }),
    });
  }

  /**
   * Returns a budget line row button in step 2 of the picker modal.
   * Each unlinked budget line is rendered as <button class*="pickerBudgetLineRow">.
   * @param nameOrIndex - 0-based row index OR a string/RegExp to match by visible text
   */
  pickerBudgetLineRow(nameOrIndex: number | string | RegExp): Locator {
    const step2 = this.pickerStep2Modal();
    if (typeof nameOrIndex === 'number') {
      return step2.locator('[class*="pickerBudgetLineRow"]').nth(nameOrIndex);
    }
    return step2.locator('[class*="pickerBudgetLineRow"]').filter({
      hasText: nameOrIndex,
    });
  }

  /**
   * Returns the SuggestionBadge container for a given field.
   * The badge is rendered as a sibling element adjacent to the input.
   * We locate via the SuggestionBadge component's className which uses CSS Modules.
   *
   * Supported fields:
   *   'amount'        → scoped to the #amount field's parent container
   *   'date'          → scoped to the #date field's parent container
   *   'dueDate'       → scoped to the #due-date field's parent container
   *   'invoiceNumber' → scoped to the #invoice-number field's parent container
   *   'notes'         → scoped to the #notes field's parent container
   */
  suggestionBadge(field: 'amount' | 'date' | 'dueDate' | 'invoiceNumber' | 'notes'): Locator {
    let inputId: string;
    if (field === 'dueDate') {
      inputId = 'due-date';
    } else if (field === 'invoiceNumber') {
      inputId = 'invoice-number';
    } else {
      inputId = field;
    }
    // The badge is a sibling of the input, inside a field-control wrapper div.
    // Use ancestor traversal: input → parent div (fieldControl) → parent div → badge span.
    return this.page
      .locator(`#${inputId}`)
      .locator('xpath=ancestor::div')
      .locator('[class*="badge"]')
      .first();
  }

  /**
   * Returns the Apply button inside a SuggestionBadge for a given field.
   * Accepts the same field names as suggestionBadge().
   */
  applyBadgeButton(field: 'amount' | 'date' | 'dueDate' | 'invoiceNumber' | 'notes'): Locator {
    let inputId: string;
    if (field === 'dueDate') {
      inputId = 'due-date';
    } else if (field === 'invoiceNumber') {
      inputId = 'invoice-number';
    } else {
      inputId = field;
    }
    return this.page
      .locator(`#${inputId}`)
      .locator('xpath=ancestor::div[contains(@class,"fieldRow") or contains(@class,"field")]')
      .first()
      .getByRole('button', { name: /Apply/i });
  }

  // ─── Card-based line item accessors (story #1576) ──────────────────────────
  //
  // The <table> is gone. Lines are rendered as:
  //   <ul role="list" aria-label="Extracted line items" class*="lineList">
  //     <li class*="lineCard"> … </li>
  //     …
  //   </ul>
  //
  // Each <li class*="lineCard"> contains:
  //   - cardTopRow: <textarea class*="cardDescriptionInput"> + confidence dot
  //   - cardMetricGrid: 4 metric cells, each with <input class*="cardMetricInput">
  //       0: quantity (type="number")
  //       1: unit (type="text")
  //       2: unitPrice (type="number")
  //       3: totalAmount (type="number")
  //   - cardBottomRow: 2 checkboxes (include, VAT) + assign zone

  /**
   * Returns the <li class*="lineCard"> at the given 0-based index in the line list.
   * Updated in story #1576: targets card elements instead of table rows.
   */
  lineRow(index: number): Locator {
    return this.page.locator('[role="list"] li[class*="lineCard"]').nth(index);
  }

  /**
   * Returns the include checkbox for the line at the given 0-based index.
   * The include checkbox is the FIRST <input type="checkbox"> in the cardBottomRow.
   * Updated in story #1576: scoped to cardBottomRow, uses .first().
   */
  lineCheckbox(index: number): Locator {
    return this.lineRow(index)
      .locator('[class*="cardBottomRow"]')
      .locator('input[type="checkbox"]')
      .first();
  }

  /**
   * Returns the VAT applies checkbox for the line at the given 0-based index.
   * The VAT checkbox is the SECOND <input type="checkbox"> in the cardBottomRow.
   * New in story #1576: vatRate input is gone; replaced by a simple VAT toggle checkbox.
   */
  lineVatCheckbox(index: number): Locator {
    return this.lineRow(index)
      .locator('[class*="cardBottomRow"]')
      .locator('input[type="checkbox"]')
      .nth(1);
  }

  /**
   * Returns the description textarea of the line at the given 0-based index.
   * Updated in story #1576: was <input> inside <td>; now <textarea class*="cardDescriptionInput">.
   */
  lineDescription(index: number): Locator {
    return this.lineRow(index).locator('[class*="cardDescriptionInput"], textarea').first();
  }

  /**
   * Returns the totalAmount input of the line at the given 0-based index.
   * Updated in story #1576: was <input> in td.nth(5); now the 4th metric input (0-indexed: nth(3))
   * inside the cardMetricGrid (order: qty=0, unit=1, unitPrice=2, totalAmount=3).
   */
  lineTotal(index: number): Locator {
    return this.lineRow(index).locator('[class*="cardMetricInput"]').nth(3);
  }

  /**
   * Returns the quantity input of the line at the given 0-based index.
   * cardMetricGrid metric order: qty=0, unit=1, unitPrice=2, totalAmount=3.
   */
  lineQuantity(index: number): Locator {
    return this.lineRow(index).locator('[class*="cardMetricInput"]').nth(0);
  }

  // ─── Per-row assignment helpers (story #1564 Round 2) ──────────────────────

  /**
   * Returns the "Assign…" button in the cardAssignZone of the row at the given 0-based index.
   * Only present when the row has no assignedBudgetLineId.
   * Button class: class*="assignButtonInTable", text: t('autoItemize.assignButton') = "Assign…"
   */
  lineAssignButton(index: number): Locator {
    return this.lineRow(index).locator('[class*="assignButtonInTable"]');
  }

  /**
   * Returns the assigned badge container for the row at the given 0-based index.
   * Present when line.assignedBudgetLineId is set.
   * class*="assignedBadge"
   */
  lineAssignedBadge(index: number): Locator {
    return this.lineRow(index).locator('[class*="assignedBadge"]');
  }

  /**
   * Returns the description text inside the assigned badge for the row.
   * This is the <span> containing the budget line description.
   */
  lineAssignedDescription(index: number): Locator {
    return this.lineAssignedBadge(index).locator('span').first();
  }

  /**
   * Returns the "Clear" button inside the assigned badge for the row.
   * aria-label: "Clear budget line assignment" (t('autoItemize.clearAssignmentAriaLabel'))
   */
  lineClearAssignButton(index: number): Locator {
    return this.lineAssignedBadge(index).locator('[class*="clearAssignButton"]');
  }

  /**
   * Waits for the LLM dry-run to complete and card list to render.
   * Updated in story #1576:
   * - Old: waited for table tbody tr
   * - New: waits for analyzingCaption to hide, then for role="list" to appear
   *
   * The caption hides when pageStatus transitions from 'loading' → 'ready'/'error'.
   * The role="list" appears when pageStatus === 'ready' and lines are set.
   */
  async waitForAnalyzingDone(): Promise<void> {
    // Wait for analyzing caption to disappear (indicates loading has ended)
    await this.analyzingCaption.waitFor({ state: 'hidden' });
    // Then wait for at least the card list to appear
    await this.page.locator('[role="list"][aria-label*="line"]').waitFor({ state: 'visible' });
  }

  /**
   * Clicks Save and waits for navigation back to the invoice detail page.
   */
  async save(): Promise<void> {
    await this.saveButton.click();
    await this.page.waitForURL(/\/budget\/invoices\/[^/]+$/);
  }

  /**
   * Clicks Cancel.
   * If expectModal=true, waits for the discard confirmation modal to appear.
   * If expectModal=false (default), expects immediate navigation back.
   */
  async cancel(expectModal = false): Promise<void> {
    await this.cancelButton.click();
    if (expectModal) {
      await this.cancelModal.waitFor({ state: 'visible' });
    } else {
      await this.page.waitForURL(/\/budget\/invoices\/[^/]+$/);
    }
  }

  // ─── New POM helpers for UX fixes (stories #1586–#1591) ──────────────────────

  /**
   * Returns the Category select for the line card at the given 0-based index.
   * Rendered as <select id="category-{rowId}" aria-label="Select budget category for line item">.
   * Located inside the cardBottomRow via aria-label since the id uses a dynamic rowId.
   */
  getLineCardCategorySelect(cardIndex: number): Locator {
    return this.lineRow(cardIndex).getByRole('combobox', {
      name: /Select budget category for line item/i,
    });
  }

  /**
   * Returns the Funding Source select for the line card at the given 0-based index.
   * Rendered as <select id="source-{rowId}" aria-label="Select funding source for line item">.
   */
  getLineCardFundingSourceSelect(cardIndex: number): Locator {
    return this.lineRow(cardIndex).getByRole('combobox', {
      name: /Select funding source for line item/i,
    });
  }

  /**
   * Returns the totalAmount metric input for the line card at the given 0-based index.
   * Alias for lineTotal() — the 4th cardMetricInput (index 3) in the cardMetricGrid.
   * (qty=0, unit=1, unitPrice=2, totalAmount=3)
   */
  getLineCardTotalAmountInput(cardIndex: number): Locator {
    return this.lineTotal(cardIndex);
  }

  /**
   * Returns the variance indicator span in the totals card.
   * Renders as one of:
   *   - <span class*="varianceMatch">  (≤1% deviation)
   *   - <span class*="varianceWarning"> (1–5% deviation)
   *   - <span class*="varianceDanger">  (>5% deviation)
   */
  getVarianceIndicator(): Locator {
    return this.page.locator(
      '[class*="varianceMatch"], [class*="varianceWarning"], [class*="varianceDanger"]',
    );
  }

  /**
   * Returns the PDF preview iframe.
   * Alias for pdfIframe — provided for naming consistency with the spec.
   */
  getPdfPreviewIframe(): Locator {
    return this.pdfIframe;
  }
}
