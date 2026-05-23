/**
 * Page Object Model for the Invoice Detail page (/budget/invoices/:id)
 *
 * The page renders:
 * - A back button "← Back to Invoices" (button type, not a Link)
 * - An h1 with the invoice number ("#INV-001") or "Invoice Details" (fallback)
 * - A status badge next to the heading
 * - Edit and Delete action buttons in the header row
 * - A detail card (section) with a dl/dt/dd list of:
 *   - Invoice #, Vendor (link), Amount, Date, Due Date, Status, Notes, Created by
 * - An InvoiceDepositsSection (deposits between details and budget lines) — Issue #1404
 * - An InvoiceBudgetLinesSection for linking work item / household item budget lines
 * - A LinkedDocumentsSection (Paperless-ngx integration)
 * - An Edit modal (role="dialog", aria-labelledby="edit-modal-title")
 * - A Delete confirmation modal (role="dialog", aria-labelledby="delete-modal-title")
 *
 * Key DOM observations from source code (InvoiceDetailPage.tsx):
 * - Back button: type="button", class="backButton", text includes "Back to Invoices"
 * - h1: invoice.invoiceNumber ? `#${invoice.invoiceNumber}` : t('invoiceDetail.invoiceDetails')
 * - Status badge: <span class="statusBadge status_*"> (not using the Badge component)
 * - Edit button: class="editButton", text="Edit"
 * - Delete button: class="deleteButton", text="Delete"
 * - Edit modal: role="dialog", aria-labelledby="edit-modal-title", h2="Edit Invoice"
 * - Edit form inputs: #edit-invoice-number, #edit-amount, #edit-date, #edit-due-date,
 *   #edit-status, #edit-notes
 * - Edit save: class="saveButton", text="Save Changes" / "Saving..."
 * - Delete modal: role="dialog", aria-labelledby="delete-modal-title", h2="Delete Invoice"
 * - Delete confirm: class="confirmDeleteButton", text="Delete Invoice" / "Deleting..."
 * - Error (not found): role="alert" inside div.errorCard
 * - InvoiceBudgetLinesSection has its own sections but we do not interact with it deeply here
 *
 * Budget Line Picker (two-step, Issue #1401):
 * - Picker modal: role="dialog", aria-labelledby="picker-title"
 * - Step 1: WorkItemPicker (placeholder "Search work items...") + HouseholdItemPicker
 * - Step 2: existing budget lines list OR create form (BudgetLineForm)
 * - "Create Budget Line" button appears in empty-state and below the existing list
 * - BudgetLineForm fields: #budget-description, #budget-planned-amount, #budget-quantity,
 *   #budget-unit, #budget-unit-price, #budget-confidence, #budget-category, #budget-source,
 *   #budget-vendor
 * - Mode toggle buttons: "Direct Amount" (default) / "Unit Pricing"
 * - Submit button: button[type="submit"] inside <fieldset> (locale-independent structural locator)
 * - Cancel button: [class*="cancelButton"] inside picker modal (locale-independent)
 * - Error banner inside modal: role="alert"
 *
 * Deposits Section (Issue #1404):
 * - Section: <section aria-labelledby="deposits-title">
 * - Add button: type="button", aria-label="Add deposit", className=sharedStyles.btnPrimary
 * - Empty state: <button type="button">Add deposit</button> (EmptyState CTA)
 * - Modals use the shared Modal component which generates a dynamic id via useId().
 *   Locate modals by getByRole('dialog') filtered to the visible one, or by heading text.
 * - Add/Edit modal: contains h2 "Add deposit" or "Edit deposit"
 * - Delete modal: contains h2 "Delete deposit"
 * - State confirm modal: contains h2 "Mark as paid" or "Mark as claimed"
 * - Form inputs: #deposit-amount, #deposit-dueDate, #deposit-status,
 *   #deposit-paidDate (conditional), #deposit-claimedDate (conditional), #deposit-description
 * - Save button: data-testid="deposit-modal-save" (added #1407)
 * - Cancel button: data-testid="deposit-modal-cancel" (add/edit modal, added #1407)
 * - Delete cancel: data-testid="deposit-delete-cancel" (delete modal, added #1407)
 * - Delete confirm: data-testid="deposit-delete-confirm" (added #1407)
 * - Confirm button (state confirm): data-testid="state-confirm-button" (added #1407)
 * - State confirm cancel: data-testid="state-confirm-cancel" (added #1407)
 * - Error banner in form modals: role="alert" (FormError with variant='banner')
 * - Warning banner in delete modal: [class*="warningBanner"] (visible for paid/claimed deposits)
 * - Overflow menu trigger: button[aria-haspopup="true"], aria-label includes "deposit"
 * - Menu: role="menu", items role="menuitem"
 * - Menu items (pending): "Mark paid…", "Edit", "Delete"
 * - Menu items (paid): "Mark claimed…", "Revert to pending", "Edit", "Delete"
 * - Menu items (claimed): "Revert to paid", "Edit", "Delete"
 * - Final payment row: [class*="finalPaymentRow"]
 * - Final payment amount: aria-live="polite" inside finalPaymentRow
 * - Mobile card list (≤767px): [class*="mobileCardList"] with role="list"
 * - Desktop table (>767px): [class*="tableWrapper"] > table
 */

import type { Page, Locator } from '@playwright/test';

export class InvoiceDetailPage {
  readonly page: Page;

  // Navigation
  readonly backButton: Locator;

  // Page header
  readonly heading: Locator;
  readonly statusBadge: Locator;
  readonly editButton: Locator;
  readonly deleteButton: Locator;

  // Detail card
  readonly detailCard: Locator;
  readonly infoList: Locator;

  // Budget lines section
  readonly budgetLinesSection: Locator;

  // Documents section
  readonly documentsSection: Locator;

  // Edit modal
  readonly editModal: Locator;
  readonly editNumberInput: Locator;
  readonly editAmountInput: Locator;
  readonly editDateInput: Locator;
  readonly editDueDateInput: Locator;
  readonly editStatusSelect: Locator;
  readonly editNotesInput: Locator;
  readonly editSaveButton: Locator;
  readonly editCancelButton: Locator;
  readonly editErrorBanner: Locator;

  // Delete modal
  readonly deleteModal: Locator;
  readonly deleteConfirmButton: Locator;
  readonly deleteCancelButton: Locator;
  readonly deleteErrorBanner: Locator;

  // Error card (not found / load failure)
  readonly errorCard: Locator;

  // ─── Deposits Section locators (Issue #1404) ────────────────────────────
  /** The deposits section: <section aria-labelledby="deposits-title"> */
  readonly depositsSection: Locator;

  /** "Add deposit" button in the section header (aria-label="Add deposit") */
  readonly addDepositButton: Locator;

  /**
   * "Add deposit" CTA inside the EmptyState component (only visible when deposits.length === 0).
   * This button has visible text "Add deposit" but NO aria-label — use this locator when you
   * specifically need to click the EmptyState CTA rather than the header button.
   */
  readonly addDepositFromEmptyState: Locator;

  /** EmptyState container element (only visible when deposits.length === 0) */
  readonly depositEmptyState: Locator;

  /**
   * Add/Edit deposit modal (shared Modal component — useId() generates a dynamic
   * aria-labelledby, so we locate by role="dialog" + heading text instead).
   * When multiple modals are on the page, use getDepositModal() to target by title.
   */
  readonly depositModal: Locator;

  // Form inputs inside the add/edit modal
  readonly depositAmountInput: Locator;
  readonly depositDueDateInput: Locator;
  readonly depositStatusSelect: Locator;
  readonly depositPaidDateInput: Locator;
  readonly depositClaimedDateInput: Locator;
  readonly depositDescriptionInput: Locator;

  /** Save button (type="submit", form="deposit-form", text="Save") */
  readonly depositModalSave: Locator;

  /** Cancel button inside the add/edit or delete deposit modal */
  readonly depositModalCancel: Locator;

  /** Error banner (role="alert") inside a deposit modal */
  readonly depositModalError: Locator;

  /** State confirm modal (Mark as paid / Mark as claimed) */
  readonly stateConfirmModal: Locator;

  /** Confirm button inside the state confirm modal */
  readonly stateConfirmButton: Locator;

  /** The state-confirm date input (#state-confirm-date) */
  readonly stateConfirmDateInput: Locator;

  /** Delete deposit modal — located by its title "Delete deposit" */
  readonly deleteDepositModal: Locator;

  /** Warning banner inside the delete deposit modal (visible for paid/claimed deposits) */
  readonly deleteDepositWarning: Locator;

  /** Cancel button inside the delete deposit modal (data-testid="deposit-delete-cancel") */
  readonly deleteDepositCancelButton: Locator;

  /** Confirm delete button inside the delete deposit modal */
  readonly deleteDepositConfirmButton: Locator;

  /** Final payment row at the bottom of the deposits table */
  readonly finalPaymentRow: Locator;

  /** aria-live amount inside the final payment row */
  readonly finalPaymentAmount: Locator;

  // ─── Budget Line Picker locators (Issue #1401) ───────────────────────────
  /** The two-step picker modal: role="dialog", aria-labelledby="picker-title" */
  readonly budgetLinePickerModal: Locator;

  /** "+ Add Budget Line" button inside the budgetLinesSection header */
  readonly pickerAddBudgetLineButton: Locator;

  /** "Create Budget Line" button inside the picker modal (step 2) */
  readonly pickerCreateBudgetLineButton: Locator;

  /** Error banner (role="alert") inside the picker modal */
  readonly pickerErrorBanner: Locator;

  /** Description input in the BudgetLineForm: #budget-description */
  readonly createFormDescriptionInput: Locator;

  /** "Unit Pricing" mode toggle button inside the picker modal */
  readonly createFormUnitModeButton: Locator;

  /** Quantity input: #budget-quantity (unit pricing mode) */
  readonly createFormQuantityInput: Locator;

  /** Unit price input: #budget-unit-price (unit pricing mode) */
  readonly createFormUnitPriceInput: Locator;

  /** Direct amount input: #budget-planned-amount (direct mode) */
  readonly createFormDirectAmountInput: Locator;

  /** Submit button: only button[type="submit"] inside the fieldset wrapping BudgetLineForm (locale-independent) */
  readonly createFormSubmitButton: Locator;

  /** Cancel button inside the picker modal form */
  readonly createFormCancelButton: Locator;

  /** The budget lines table inside budgetLinesSection */
  readonly budgetLinesTable: Locator;

  // ─── Budget Line OverflowMenu + Edit/Remove Modals (Issue #1425) ─────────────
  /**
   * Edit Budget Line modal (Modal component, title="Edit Budget Line").
   * Locates by role="dialog" + accessible name matching the modal title.
   */
  readonly editBudgetLineModal: Locator;

  /**
   * Amount input inside the Edit Budget Line modal: #budget-line-amount
   */
  readonly editBudgetLineAmountInput: Locator;

  /**
   * Remove Budget Line modal (Modal component, title="Remove Budget Line").
   */
  readonly removeBudgetLineModal: Locator;

  // ─── Full Edit + Parent Move locators (Issue #1553) ──────────────────────

  /**
   * Description input in the full BudgetLineForm inside the Edit modal: #budget-description
   */
  readonly budgetLineFormDescription: Locator;

  /**
   * Itemized amount input rendered in the invoice-side edit context: #budget-itemized-amount
   */
  readonly budgetLineItemizedAmount: Locator;

  /**
   * "Linked item" legend text inside the parent picker fieldset (collapsed state).
   * Scoped to editBudgetLineModal.
   */
  readonly linkedItemLegend: Locator;

  /**
   * "Change" ghost button in the collapsed parent-picker row.
   * Clicking this expands the full parent picker tabs + search.
   * Scoped to editBudgetLineModal.
   */
  readonly changeParentButton: Locator;

  /**
   * "Move to selected item" submit button in the expanded parent picker.
   * Scoped to editBudgetLineModal.
   */
  readonly moveButton: Locator;

  /**
   * "Cancel" ghost button inside the expanded parent picker (collapses picker without moving).
   * Uses .last() because the modal-level Cancel button is also in scope.
   * Scoped to editBudgetLineModal.
   */
  readonly cancelChangeButton: Locator;

  /**
   * Cross-table move hint banner: role="status" with text about "transfer".
   * Visible only when the picker is expanded and a different table type is selected.
   * Scoped to editBudgetLineModal.
   */
  readonly moveHintBanner: Locator;

  // ─── Auto-itemize (Issue #1547) ──────────────────────────────────────────────
  //
  // Auto-itemize button: rendered in the section header when
  //   config.autoItemizeEnabled === true AND linkedDocs.length > 0.
  // Button text: t('invoiceDetail.budgetLines.autoItemize.button') = "Auto-itemize"
  // aria-label: t('invoiceDetail.budgetLines.autoItemize.buttonAriaLabel')
  //           = "Extract line items from a linked Paperless document"
  //
  // DocumentPickerModal: shown when 2+ docs are linked.
  //   Modal title: t('invoiceDetail.budgetLines.autoItemize.docPickerTitle')
  //              = "Choose document to analyze"
  //   The Modal component uses createPortal + useId(), so we locate by
  //   role="dialog" filtered to h2 containing the title text.
  //
  // AutoItemizePreviewModal: shown after successful dry-run.
  //   Modal title: t('invoiceDetail.budgetLines.autoItemize.modalTitle')
  //              = "Review extracted line items"
  //
  // autoItemizeError banner: rendered inside the <section> (not a portal)
  //   as <div className={styles.errorBanner} role="alert">{autoItemizeError}</div>
  //   Selector: budgetLinesSection locator('[role="alert"]')
  //   or: page.locator('[class*="errorBanner"]').first() for the section-level banner

  // ─── Auto-itemize constructor helpers ────────────────────────────────────────

  /**
   * Returns the "Auto-itemize" button locator.
   * The button is only rendered when autoItemizeEnabled=true AND docs are linked.
   * Scoped to the budgetLinesSection to avoid false matches.
   */
  getAutoItemizeButton(): Locator {
    // aria-label is stable and locale-independent for this selector
    return this.budgetLinesSection.getByRole('button', {
      name: 'Extract line items from a linked Paperless document',
    });
  }

  /**
   * Returns the Document Picker modal locator.
   * Modal title (from Modal's useId() h2): "Choose document to analyze"
   */
  getDocumentPickerModal(): Locator {
    return this.page.locator('[role="dialog"]').filter({
      has: this.page.locator('h2', { hasText: 'Choose document to analyze' }),
    });
  }

  /**
   * Returns the Auto-itemize Preview modal locator.
   * Modal title (from Modal's useId() h2): "Review extracted line items"
   */
  getAutoItemizePreviewModal(): Locator {
    return this.page.locator('[role="dialog"]').filter({
      has: this.page.locator('h2', { hasText: 'Review extracted line items' }),
    });
  }

  /**
   * Returns the mismatch warning banner inside the preview modal.
   * The component renders it as <div className={styles.warningBlock}> containing a <div className={styles.warningIcon}> and <div className={styles.warningContent}>.
   */
  getMismatchWarningBanner(): Locator {
    return this.getAutoItemizePreviewModal().locator('[class*="warningBlock"]');
  }

  /**
   * Returns the empty state message inside the preview modal.
   * Rendered as <div className={styles.emptyState}><p>No line items detected</p></div>
   */
  getEmptyStateMessage(): Locator {
    return this.getAutoItemizePreviewModal().locator('[class*="emptyState"]');
  }

  /**
   * Clicks the "Auto-itemize" button.
   * Waits for the button to be visible first.
   */
  async clickAutoItemizeButton(): Promise<void> {
    const btn = this.getAutoItemizeButton();
    await btn.waitFor({ state: 'visible' });
    await btn.click();
  }

  /**
   * Clicks a document in the Document Picker modal by its title text.
   * Waits for the picker modal to be visible before clicking.
   */
  async selectDocument(title: string): Promise<void> {
    const pickerModal = this.getDocumentPickerModal();
    await pickerModal.waitFor({ state: 'visible' });
    // Documents render as <button type="button" className={styles.item}>
    await pickerModal.getByRole('button', { name: title }).click();
  }

  /**
   * Edits the description of a preview line at the given 0-based index.
   * Clears the current value and types the new description.
   */
  async editPreviewLineDescription(index: number, newDescription: string): Promise<void> {
    const previewModal = this.getAutoItemizePreviewModal();
    await previewModal.waitFor({ state: 'visible' });
    // Description inputs are <input type="text"> in table tbody rows
    const descInput = previewModal.locator('table tbody tr input[type="text"]').nth(index);
    await descInput.clear();
    await descInput.fill(newDescription);
  }

  /**
   * Toggles the include/exclude checkbox for a preview line at the given 0-based index.
   * Skips the select-all checkbox (first header checkbox).
   */
  async toggleIncludeLine(index: number): Promise<void> {
    const previewModal = this.getAutoItemizePreviewModal();
    await previewModal.waitFor({ state: 'visible' });
    // Row checkboxes are <input type="checkbox"> in tbody — exclude the aria-label="Select all lines" one
    const rowCheckboxes = previewModal.locator(
      'table tbody tr input[type="checkbox"]:not([aria-label*="Select all"])',
    );
    await rowCheckboxes.nth(index).click();
  }

  /**
   * Selects the append or replace mode radio button inside the preview modal.
   */
  async selectMode(mode: 'append' | 'replace'): Promise<void> {
    const previewModal = this.getAutoItemizePreviewModal();
    await previewModal.waitFor({ state: 'visible' });
    const radio = previewModal.locator(`input[type="radio"][value="${mode}"]`);
    await radio.click();
  }

  /**
   * Clicks the "Apply" button inside the preview modal.
   * Does NOT wait for network responses — register waitForResponse before calling.
   */
  async clickApplyButton(): Promise<void> {
    const previewModal = this.getAutoItemizePreviewModal();
    await previewModal.waitFor({ state: 'visible' });
    const applyBtn = previewModal.getByRole('button', { name: 'Apply', exact: true });
    await applyBtn.click();
  }

  constructor(page: Page) {
    this.page = page;

    // Back button — styled as a button that navigates to /budget/invoices
    this.backButton = page.getByRole('button', { name: /Back to Invoices/i });

    // h1 heading — either "#InvoiceNumber" or "Invoice Details"
    this.heading = page.getByRole('heading', { level: 1 });

    // Status badge — <span class="statusBadge status_*">
    this.statusBadge = page.locator('[class*="statusBadge"]').first();

    // Action buttons in the header row — scoped to header row to avoid matching
    // budget line edit buttons
    this.editButton = page.locator('[class*="pageActions"]').getByRole('button', {
      name: 'Edit',
      exact: true,
    });
    this.deleteButton = page.locator('[class*="pageActions"]').getByRole('button', {
      name: 'Delete',
      exact: true,
    });

    // Detail card section
    this.detailCard = page.locator('[class*="card"]').first();
    this.infoList = page.locator('[class*="infoList"]');

    // Budget lines section (InvoiceBudgetLinesSection)
    // The component renders <section aria-labelledby="budget-lines-title"> with CSS module class
    // "section" (not "budgetLinesSection"), so we locate it via the landmark aria attribute.
    this.budgetLinesSection = page.locator('[aria-labelledby="budget-lines-title"]');

    // Documents section (LinkedDocumentsSection)
    this.documentsSection = page.getByRole('region', { name: 'Documents' });

    // Edit modal — role="dialog", aria-labelledby="edit-modal-title"
    // Using the modal title text as the accessible name anchor
    this.editModal = page.locator('[role="dialog"][aria-labelledby="edit-modal-title"]');
    this.editNumberInput = page.locator('#edit-invoice-number');
    this.editAmountInput = page.locator('#edit-amount');
    this.editDateInput = page.locator('#edit-date');
    this.editDueDateInput = page.locator('#edit-due-date');
    this.editStatusSelect = page.locator('#edit-status');
    this.editNotesInput = page.locator('#edit-notes');
    this.editSaveButton = this.editModal.getByRole('button', {
      name: /Save Changes|Saving\.\.\./i,
    });
    this.editCancelButton = this.editModal.getByRole('button', { name: 'Cancel', exact: true });
    this.editErrorBanner = this.editModal.locator('[role="alert"]');

    // Delete modal — role="dialog", aria-labelledby="delete-modal-title"
    this.deleteModal = page.locator('[role="dialog"][aria-labelledby="delete-modal-title"]');
    this.deleteConfirmButton = this.deleteModal.locator('[class*="confirmDeleteButton"]');
    this.deleteCancelButton = this.deleteModal.getByRole('button', { name: 'Cancel', exact: true });
    this.deleteErrorBanner = this.deleteModal.locator('[role="alert"]');

    // Error card (rendered when invoice not found or load fails)
    this.errorCard = page.locator('[class*="errorCard"]');

    // ─── Deposits Section locators (Issue #1404) ──────────────────────────
    this.depositsSection = page.locator('[aria-labelledby="deposits-title"]');

    // The "Add deposit" button in the section header has aria-label="Add deposit".
    // getByLabel matches elements whose aria-label === "Add deposit" — this is true
    // ONLY for the header CTA. The EmptyState button has text but no aria-label, so
    // getByLabel does NOT match it. This keeps strict mode happy when both buttons are
    // rendered simultaneously (empty state scenario).
    this.addDepositButton = this.depositsSection.getByLabel('Add deposit', { exact: true });

    // EmptyState "Add deposit" CTA — the button rendered by the EmptyState component when
    // deposits.length === 0. It has visible text "Add deposit" but NO aria-label attribute.
    // We locate it via CSS attribute selector to exclude buttons that carry aria-label,
    // which would otherwise match the header button too.
    this.addDepositFromEmptyState = this.depositsSection.locator('button:not([aria-label])', {
      hasText: 'Add deposit',
    });

    // EmptyState container element (only visible when deposits.length === 0)
    this.depositEmptyState = this.depositsSection.locator(
      '[class*="emptyState"], [class*="empty"]',
    );

    // The deposit modal renders via the shared Modal component which uses useId() for
    // aria-labelledby — locate by role="dialog" + the visible h2 heading.
    // When add/edit modal is open its h2 is "Add deposit" or "Edit deposit".
    this.depositModal = page.locator('[role="dialog"]').filter({
      has: page.locator('h2'),
    });

    // Form inputs are page-scoped (they render in a portal, so scoping to depositModal
    // would miss them since the portal attaches to document.body).
    this.depositAmountInput = page.locator('#deposit-amount');
    this.depositDueDateInput = page.locator('#deposit-dueDate');
    this.depositStatusSelect = page.locator('#deposit-status');
    this.depositPaidDateInput = page.locator('#deposit-paidDate');
    this.depositClaimedDateInput = page.locator('#deposit-claimedDate');
    this.depositDescriptionInput = page.locator('#deposit-description');

    // Save button in add/edit deposit modal — stable data-testid added in #1407
    this.depositModalSave = page.getByTestId('deposit-modal-save');

    // Cancel button in add/edit deposit modal — stable data-testid added in #1407
    this.depositModalCancel = page.getByTestId('deposit-modal-cancel');

    // Error banner (FormError with variant='banner' renders role="alert")
    this.depositModalError = page.locator('[role="dialog"] [role="alert"]');

    // State confirm modal: h2 is "Mark as paid" or "Mark as claimed"
    this.stateConfirmModal = page.locator('[role="dialog"]').filter({
      has: page.locator('h2'),
    });

    // Confirm button inside state confirm modal — stable data-testid added in #1407
    this.stateConfirmButton = page.getByTestId('state-confirm-button');

    // State confirm date input
    this.stateConfirmDateInput = page.locator('#state-confirm-date');

    // Delete deposit modal contains h2 "Delete deposit"
    this.deleteDepositModal = page.locator('[role="dialog"]').filter({
      has: page.locator('h2'),
    });

    // Warning banner inside delete deposit modal: [class*="warningBanner"]
    this.deleteDepositWarning = page.locator('[class*="warningBanner"]');

    // Cancel button in delete deposit modal — stable data-testid added in #1407
    this.deleteDepositCancelButton = page.getByTestId('deposit-delete-cancel');

    // Delete deposit confirm button — stable data-testid added in #1407
    this.deleteDepositConfirmButton = page.getByTestId('deposit-delete-confirm');

    // Final payment row (always visible when deposits.length > 0)
    this.finalPaymentRow = page.locator('[class*="finalPaymentRow"]');

    // aria-live amount inside the final payment row
    this.finalPaymentAmount = this.finalPaymentRow.locator('[aria-live="polite"]');

    // ─── Budget Line Picker locators (Issue #1401) ────────────────────────
    this.budgetLinePickerModal = page.locator('[role="dialog"][aria-labelledby="picker-title"]');

    // The visible text is `+ Add Budget Line` but the `+` is a literal text node and
    // `Add Budget Line` comes from i18n; accessible-name normalization can collapse
    // whitespace inconsistently across React renders. Match the i18n text only so
    // the locator is resilient to the optional `+` prefix.
    this.pickerAddBudgetLineButton = this.budgetLinesSection.getByRole('button', {
      name: /Add Budget Line/i,
    });

    this.pickerCreateBudgetLineButton = this.budgetLinePickerModal.getByRole('button', {
      name: /Create Budget Line/i,
    });

    this.pickerErrorBanner = this.budgetLinePickerModal.locator('[role="alert"]');

    this.createFormDescriptionInput = page.locator('#budget-description');
    // "Unit Pricing" is the second [class*="modeBtn"] button (index 1). Using a structural
    // locator avoids locale breakage — BudgetLineForm renders this text via t('budgetLineForm.modeUnit').
    this.createFormUnitModeButton = this.budgetLinePickerModal.locator('[class*="modeBtn"]').nth(1);
    this.createFormQuantityInput = page.locator('#budget-quantity');
    this.createFormUnitPriceInput = page.locator('#budget-unit-price');
    this.createFormDirectAmountInput = page.locator('#budget-planned-amount');
    // Submit button is the only button[type="submit"] inside the <fieldset> that wraps
    // BudgetLineForm in the picker modal. Using a structural locator avoids locale breakage —
    // the button text comes from t('budgetLineForm.submitAdd') / t('budgetLineForm.submitSaving').
    this.createFormSubmitButton = this.budgetLinePickerModal.locator(
      'fieldset button[type="submit"]',
    );
    // Cancel button uses [class*="cancelButton"] — unique within the picker modal (the ×
    // close button uses styles.modalClose, not styles.cancelButton). Avoids locale breakage
    // from t('budgetLineForm.cancel').
    this.createFormCancelButton = this.budgetLinePickerModal.locator('[class*="cancelButton"]');
    this.budgetLinesTable = this.budgetLinesSection.locator('table');

    // ─── Budget Line OverflowMenu modals (Issue #1425) ──────────────────────
    // EditBudgetLineModal renders via the shared Modal component.
    // The accessible name is the modal title text "Edit Budget Line" (i18n:
    //   budget:invoiceDetail.budgetLines.modal.editTitle).
    this.editBudgetLineModal = page.getByRole('dialog', { name: 'Edit Budget Line' });
    this.editBudgetLineAmountInput = page.locator('#budget-line-amount');

    // DeleteBudgetLineModal renders via the shared Modal component.
    // Title: "Remove Budget Line" (i18n: budget:invoiceDetail.budgetLines.modal.removeTitle).
    this.removeBudgetLineModal = page.getByRole('dialog', { name: 'Remove Budget Line' });

    // ─── Full Edit + Parent Move locators (Issue #1553) ──────────────────────
    // These locators are scoped to the Edit Budget Line modal and work alongside
    // the existing editBudgetLineModal locator above.

    // Description input in the full BudgetLineForm: #budget-description
    this.budgetLineFormDescription = page.locator('#budget-description');

    // Itemized amount input in invoice-side edit context: #budget-itemized-amount
    this.budgetLineItemizedAmount = page.locator('#budget-itemized-amount');

    // The "Linked item" legend/label inside the collapsed parent picker fieldset.
    // Scoped to the edit modal to avoid matching other BudgetLineForm instances.
    this.linkedItemLegend = this.editBudgetLineModal.getByText('Linked item');

    // "Change" ghost button in the collapsed parent-picker row.
    // Scoped to the edit modal.
    this.changeParentButton = this.editBudgetLineModal.getByRole('button', { name: 'Change' });

    // "Move to selected item" button in the expanded parent picker.
    // Scoped to the edit modal.
    this.moveButton = this.editBudgetLineModal.getByRole('button', {
      name: /Move to selected item|Moving/i,
    });

    // "Cancel" ghost button inside the expanded parent picker (collapses picker).
    // Uses .last() because the outer Cancel button (closes modal) is also in scope.
    this.cancelChangeButton = this.editBudgetLineModal
      .getByRole('button', { name: 'Cancel' })
      .last();

    // Cross-table move hint banner: role="status" with text about "transfer".
    // Visible only when the picker is expanded and a different table type is selected.
    this.moveHintBanner = this.editBudgetLineModal
      .locator('[role="status"]')
      .filter({ hasText: /transfer/i });
  }

  /**
   * Navigate to the invoice detail page by ID.
   */
  async goto(id: string): Promise<void> {
    await this.page.goto(`/budget/invoices/${id}`);
    await this.heading.waitFor({ state: 'visible' });
  }

  /**
   * Get the page heading text (invoice number like "#INV-001" or "Invoice Details").
   */
  async getHeadingText(): Promise<string> {
    return (await this.heading.textContent()) ?? '';
  }

  /**
   * Get all detail fields from the info list (dl/dt/dd pairs).
   * Returns a map of label → value strings.
   */
  async getDetailFields(): Promise<Record<string, string>> {
    const rows = await this.infoList.locator('[class*="infoRow"]').all();
    const fields: Record<string, string> = {};
    for (const row of rows) {
      const label = await row.locator('dt').textContent();
      const value = await row.locator('dd').textContent();
      if (label) {
        fields[label.trim()] = (value ?? '').trim();
      }
    }
    return fields;
  }

  /**
   * Open the Edit modal by clicking the Edit button.
   */
  async openEditModal(): Promise<void> {
    await this.editButton.click();
    await this.editModal.waitFor({ state: 'visible' });
  }

  /**
   * Close the Edit modal by clicking Cancel.
   */
  async closeEditModal(): Promise<void> {
    await this.editCancelButton.click();
    await this.editModal.waitFor({ state: 'hidden' });
  }

  /**
   * Fill the edit form fields. Only provided fields are updated.
   */
  async fillEditForm(data: {
    invoiceNumber?: string;
    amount?: string;
    date?: string;
    dueDate?: string;
    status?: string;
    notes?: string;
  }): Promise<void> {
    if (data.invoiceNumber !== undefined) {
      await this.editNumberInput.clear();
      await this.editNumberInput.fill(data.invoiceNumber);
    }
    if (data.amount !== undefined) {
      await this.editAmountInput.clear();
      await this.editAmountInput.fill(data.amount);
    }
    if (data.date !== undefined) {
      await this.editDateInput.fill(data.date);
    }
    if (data.dueDate !== undefined) {
      await this.editDueDateInput.fill(data.dueDate);
    }
    if (data.status !== undefined) {
      await this.editStatusSelect.selectOption(data.status);
    }
    if (data.notes !== undefined) {
      await this.editNotesInput.clear();
      await this.editNotesInput.fill(data.notes);
    }
  }

  /**
   * Save the edit form. Registers waitForResponse for PATCH before clicking.
   * Returns after the API response and modal closes.
   */
  async saveEdit(): Promise<void> {
    const responsePromise = this.page.waitForResponse(
      (resp) =>
        resp.url().includes('/invoices/') &&
        resp.request().method() === 'PATCH' &&
        resp.status() === 200,
    );
    await this.editSaveButton.click();
    await responsePromise;
    await this.editModal.waitFor({ state: 'hidden' });
  }

  /**
   * Open the Delete confirmation modal by clicking the Delete button.
   */
  async openDeleteModal(): Promise<void> {
    await this.deleteButton.click();
    await this.deleteModal.waitFor({ state: 'visible' });
  }

  /**
   * Cancel the Delete modal.
   */
  async closeDeleteModal(): Promise<void> {
    await this.deleteCancelButton.click();
    await this.deleteModal.waitFor({ state: 'hidden' });
  }

  /**
   * Confirm deletion. Registers waitForResponse for DELETE before clicking.
   * On success, the page navigates to /budget/invoices.
   */
  async confirmDelete(): Promise<void> {
    const responsePromise = this.page.waitForResponse(
      (resp) =>
        resp.url().includes('/invoices/') &&
        resp.request().method() === 'DELETE' &&
        resp.status() === 204,
    );
    await this.deleteConfirmButton.click();
    await responsePromise;
  }

  /**
   * Navigate back to the invoices list by clicking the back button.
   */
  async goBackToInvoices(): Promise<void> {
    await this.backButton.click();
    await this.page.waitForURL('**/budget/invoices');
  }

  // ─── Deposits Section helpers (Issue #1404) ─────────────────────────────

  /**
   * Opens the overflow menu for a deposit.
   *
   * The overflow menu button renders as:
   *   <button type="button" aria-haspopup="true"
   *           aria-label="Deposit actions for {description}">⋮</button>
   * When description is null, the aria-label uses "deposit" as fallback.
   *
   * If depositDescription is provided, matches by aria-label substring.
   * If omitted, clicks the first visible deposit menu button in the section.
   */
  async openDepositMenu(depositDescription?: string): Promise<void> {
    let menuButton: Locator;
    if (depositDescription !== undefined) {
      // The aria-label contains the description verbatim — use substring match
      // aria-label format: "Deposit actions for {description}"
      // .filter({ visible: true }) is required on mobile: the desktop table rows are hidden
      // but their overflow buttons remain in the DOM, so .first() without the filter picks
      // the hidden table button instead of the visible mobile-card button.
      menuButton = this.depositsSection
        .locator(
          `button[aria-haspopup="true"][aria-label*="${depositDescription.replace(/"/g, '\\"')}"]`,
        )
        .filter({ visible: true })
        .first();
    } else {
      menuButton = this.depositsSection
        .locator('button[aria-haspopup="true"]')
        .filter({ visible: true })
        .first();
    }

    await menuButton.click();
    // Wait for menu to appear. The desktop table (display:none on mobile) keeps its
    // [role="menu"] in the DOM, so filter to visible before resolving .first().
    await this.page
      .locator('[role="menu"]')
      .filter({ visible: true })
      .first()
      .waitFor({ state: 'visible' });
  }

  /**
   * Clicks a menu item by its label text within the currently open menu.
   */
  async clickDepositMenuItem(label: string | RegExp): Promise<void> {
    // Mobile/tablet hide the desktop table via CSS but keep its [role="menuitem"]
    // nodes in the DOM. Filter to visible elements so .first() picks the visible
    // menu item (not the hidden table duplicate).
    const menuItem = this.page
      .locator('[role="menuitem"]')
      .filter({ visible: true })
      .filter({ hasText: label });
    await menuItem.first().click();
  }

  /**
   * Opens the "Add deposit" modal by clicking the section header button.
   * Waits for the form inputs to appear.
   */
  async openAddDepositModal(): Promise<void> {
    await this.addDepositButton.click();
    await this.depositAmountInput.waitFor({ state: 'visible' });
  }

  /**
   * Fills the add/edit deposit form. Only provided fields are updated.
   * For status values other than 'pending', paidDate is required by the submit button.
   */
  async fillDepositForm(data: {
    amount?: string;
    dueDate?: string;
    status?: 'pending' | 'paid' | 'claimed';
    paidDate?: string;
    claimedDate?: string;
    description?: string;
  }): Promise<void> {
    if (data.amount !== undefined) {
      await this.depositAmountInput.clear();
      await this.depositAmountInput.fill(data.amount);
    }
    if (data.dueDate !== undefined) {
      await this.depositDueDateInput.fill(data.dueDate);
    }
    if (data.status !== undefined) {
      await this.depositStatusSelect.selectOption(data.status);
    }
    if (data.paidDate !== undefined) {
      await this.depositPaidDateInput.fill(data.paidDate);
    }
    if (data.claimedDate !== undefined) {
      await this.depositClaimedDateInput.fill(data.claimedDate);
    }
    if (data.description !== undefined) {
      await this.depositDescriptionInput.fill(data.description);
    }
  }

  /**
   * Saves the add/edit deposit form. Registers waitForResponse before clicking.
   * Returns after the API response and the amount input leaves the DOM.
   */
  async saveDepositForm(expectedStatus: 201 | 200 = 201): Promise<void> {
    const method = expectedStatus === 201 ? 'POST' : 'PATCH';
    const responsePromise = this.page.waitForResponse(
      (resp) =>
        resp.url().includes('/invoices/') &&
        resp.url().includes('/deposits') &&
        resp.request().method() === method &&
        resp.status() === expectedStatus,
    );
    await this.depositModalSave.click();
    await responsePromise;
    // Wait for form modal to close (amount input leaves DOM)
    await this.depositAmountInput.waitFor({ state: 'hidden' });
  }

  /**
   * Confirms the "Mark paid" or "Mark claimed" state transition.
   * The state confirm modal must already be open.
   * Optionally updates the date input before confirming.
   */
  async confirmStateTransition(date?: string): Promise<void> {
    if (date !== undefined) {
      await this.stateConfirmDateInput.fill(date);
    }
    const responsePromise = this.page.waitForResponse(
      (resp) =>
        resp.url().includes('/deposits/') &&
        resp.request().method() === 'PATCH' &&
        resp.status() === 200,
    );
    await this.stateConfirmButton.click();
    await responsePromise;
  }

  /**
   * Confirms deletion of a deposit from the delete modal.
   * Registers waitForResponse before clicking.
   */
  async confirmDepositDelete(): Promise<void> {
    const responsePromise = this.page.waitForResponse(
      (resp) =>
        resp.url().includes('/deposits/') &&
        resp.request().method() === 'DELETE' &&
        resp.status() === 204,
    );
    await this.deleteDepositConfirmButton.click();
    await responsePromise;
  }

  /**
   * Get the Badge text for a specific deposit row/card.
   * Returns the badge element scoped to the table row or card that contains the amount text.
   */
  getDepositBadgeByAmount(formattedAmount: string): Locator {
    return this.depositsSection
      .locator('[class*="tableRow"], [class*="mobileCard"]')
      .filter({
        hasText: formattedAmount,
      })
      .locator('[class*="badge"], [class*="Badge"]');
  }

  // ─── Budget Line Picker helpers (Issue #1401) ────────────────────────────

  // ─── Budget Line OverflowMenu helpers (Issue #1425) ────────────────────────

  /**
   * Opens the OverflowMenu for a budget line row.
   *
   * The OverflowMenu trigger renders as:
   *   <button type="button" aria-haspopup="true"
   *           aria-label="Budget line actions for {description}">⋮</button>
   *
   * With usePortal=true the menu is appended to document.body — we wait for
   * any visible role="menu" on the page after clicking.
   *
   * If descriptionSubstring is provided, matches the trigger by aria-label
   * substring; otherwise clicks the first visible trigger in the section.
   */
  async openBudgetLineMenu(descriptionSubstring?: string): Promise<void> {
    let trigger;
    if (descriptionSubstring !== undefined) {
      trigger = this.budgetLinesSection
        .locator(
          `button[aria-haspopup="true"][aria-label*="${descriptionSubstring.replace(/"/g, '\\"')}"]`,
        )
        .filter({ visible: true })
        .first();
    } else {
      trigger = this.budgetLinesSection
        .locator('button[aria-haspopup="true"]')
        .filter({ visible: true })
        .first();
    }
    await trigger.click();
    // Portal renders menu at document.body level
    await this.page
      .locator('[role="menu"]')
      .filter({ visible: true })
      .first()
      .waitFor({ state: 'visible' });
  }

  /**
   * Clicks a visible menu item by label text within the currently open budget
   * line OverflowMenu.
   */
  async clickBudgetLineMenuItem(label: string | RegExp): Promise<void> {
    const menuItem = this.page
      .locator('[role="menuitem"]')
      .filter({ visible: true })
      .filter({ hasText: label });
    await menuItem.first().click();
  }

  /**
   * Open the budget line picker modal by clicking "+ Add Budget Line".
   * Waits for the modal to become visible.
   */
  async openBudgetLinePicker(): Promise<void> {
    // The button may briefly detach during section re-renders (e.g. after the first budget line
    // is created, the section transitions from empty-state to non-empty-state and the DOM
    // is rebuilt). Wait for stable visibility before clicking to avoid a stale-element race.
    await this.pickerAddBudgetLineButton.waitFor({ state: 'visible' });
    await this.pickerAddBudgetLineButton.click();
    await this.budgetLinePickerModal.waitFor({ state: 'visible' });
  }

  /**
   * Creates a new budget line and links it to the invoice via the picker flow.
   *
   * Prerequisites: the picker modal must already be open at step 1.
   *
   * The method:
   * 1. Searches for and clicks the item in step 1 (workItemPickerName selects a work item)
   * 2. Clicks "Create Budget Line" to open the BudgetLineForm
   * 3. Fills description, selects pricing mode, fills amounts
   * 4. Submits the form
   *
   * Note: workItemPickerName must match the title shown in the WorkItemPicker dropdown.
   * If omitted the caller must have already reached the create form before calling.
   */
  async createAndLinkBudgetLine(data: {
    workItemPickerName?: string;
    description: string;
    mode?: 'direct' | 'unit';
    amount?: string;
    quantity?: string;
    unit?: string;
    unitPrice?: string;
  }): Promise<void> {
    // Step 1: select the work item from the picker if provided
    if (data.workItemPickerName) {
      const wiInput = this.budgetLinePickerModal.getByPlaceholder('Search work items...');
      await wiInput.fill(data.workItemPickerName);
      const option = this.budgetLinePickerModal.getByRole('option', {
        name: data.workItemPickerName,
      });
      await option.waitFor({ state: 'visible' });
      await option.click();
      // Modal is now at step 2 — wait for "Create Budget Line" to appear
      await this.pickerCreateBudgetLineButton.waitFor({ state: 'visible' });
    }

    // Click "Create Budget Line" to open the BudgetLineForm
    await this.pickerCreateBudgetLineButton.click();
    await this.createFormDescriptionInput.waitFor({ state: 'visible' });

    // Fill description
    if (data.description) {
      await this.createFormDescriptionInput.fill(data.description);
    }

    // Switch pricing mode if needed
    const mode = data.mode ?? 'direct';
    if (mode === 'unit') {
      await this.createFormUnitModeButton.click();
      if (data.quantity !== undefined) {
        await this.createFormQuantityInput.fill(data.quantity);
      }
      if (data.unit !== undefined) {
        await this.page.locator('#budget-unit').fill(data.unit);
      }
      if (data.unitPrice !== undefined) {
        await this.createFormUnitPriceInput.fill(data.unitPrice);
      }
    } else {
      if (data.amount !== undefined) {
        await this.createFormDirectAmountInput.fill(data.amount);
      }
    }
  }
}
