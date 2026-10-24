/**
 * Page Object Model for the Invoice Detail page (/budget/invoices/:id)
 *
 * The page renders:
 * - A breadcrumb row (`breadcrumbs`, trail "Money › Invoices", optional origin Back) — #2203
 * - An h1 `‹company› · ‹number›` (`‹company› · Invoice/Offer` without a number, see invoiceTitle.ts)
 * - A status badge next to the heading
 * - Edit and Delete action buttons in the header row
 * - A detail card (section) with a dl/dt/dd list of:
 *   - Invoice #, Vendor (link), Amount, Date, Due Date, Status, Notes, Created by
 * - An InvoiceDepositsSection (deposits between details and budget lines) — Issue #1404
 * - A cost lines section (`CostLinesSection`, document host) for the invoice's lines
 * - A "Documents (n)" button (`documents-panel-button`) that opens the Documents panel (#2233)
 * - An Edit modal (role="dialog" named "Edit Invoice")
 * - A Delete confirmation modal (role="dialog", aria-labelledby="delete-modal-title")
 *
 * Key DOM observations from source code (InvoiceDetailPage.tsx):
 * - Breadcrumbs: shared Breadcrumbs row via BreadcrumbsBar (the old "← Back to Invoices" button is retired)
 * - h1: invoiceDisplayTitle() (client/src/lib/invoiceTitle.ts); loading/error state "Invoice", 404 "Invoice not found"
 * - Status chip in the page heading, data-testid="invoice-status-badge": a StatusMenu (#2209)
 *   for To pay / Paid (Mark paid has no date step), a plain Badge for Submitted / Offer
 * - Edit button: class="editButton", text="Edit"
 * - Delete button: class="deleteButton", text="Delete"
 * - Edit modal: role="dialog" named "Edit Invoice" (shared Modal), h2="Edit Invoice"
 * - Edit form inputs: #edit-invoice-number, #edit-amount, #edit-date, #edit-due-date,
 *   #edit-status, #edit-notes
 * - Edit save: class="saveButton", text="Save Changes" / "Saving..."
 * - Delete dialog (#2209): the shared ConfirmDialog, role="alertdialog", h2 "Delete <title>?",
 *   testid prefix invoice-delete (confirm text "Delete" / "Deleting…")
 * - Error (not found): role="alert" inside div.errorCard
 * - The cost lines (#2235) are driven through `costLines` (CostLinesPanel): table with State chips,
 *   "Add cost line", "Add lines (grid)", Split, the "Not yet split" notice and the ⋯ row menu.
 *   Forms and the grid dialog have their own component POMs (CostLineFormDialog, CostLineGridDialog).
 *
 * Deposits Section (Issue #1404):
 * - Section: <section aria-labelledby="deposits-title">
 * - Add button: type="button", aria-label="Add deposit", className=sharedStyles.btnSecondary
 * - Empty state: <button type="button">Add deposit</button> (EmptyState CTA)
 * - Modals use the shared Modal component which generates a dynamic id via useId().
 *   Locate modals by getByRole('dialog') filtered to the visible one, or by heading text.
 * - Add/Edit modal: contains h2 "Add deposit" or "Edit deposit"
 * - Delete modal: contains h2 "Delete deposit"
 * - State confirm modal: contains h2 "Mark as paid" or "Mark as claimed"
 * - Form inputs: #deposit-amount, #deposit-dueDate, #deposit-status,
 *   #deposit-paidDate (conditional), #deposit-claimedDate (conditional), #deposit-description
 *
 * Entry Type (Refunds) — Issue #1876:
 * - Entry-type radio group: role="group" aria-label="Entry type", first field in the
 *   add/edit modal form, above the amount/due-date row. Two native radios:
 *   input[name="entryType"][value="deposit"|"refund"], each wrapped in a <label>.
 * - Both radios are DISABLED when editing an existing deposit (mode==='edit') — value is
 *   still visible/checked, just not changeable. `entryType` is immutable after creation.
 * - Refund amount hint: [class*="charCounter"] rendered below the amount input only when
 *   the "Refund" radio is selected — "Refund amounts are entered as a positive number."
 * - Refund badge: red Badge (variant className [class*="refund"]) rendered inline BEFORE
 *   the amount in both DepositRow (table) and DepositCard (mobile), only for
 *   deposit.entryType==='refund'. Label text "Refund".
 * - Refund amount rendering: formatCurrency(-deposit.amount) wrapped in
 *   [class*="amountNegative"] — a negative, differently-colored amount.
 * - Table: badge + amount live inside [class*="amountCell"] (table td).
 * - Card: badge + amount live inside [class*="cardAmount"] (mobile card top row).
 * - OverflowMenu trigger aria-label falls back to the translated entry-type label
 *   ("Deposit"/"Refund") when deposit.description is null (previously always "deposit").
 * - Save button: data-testid="deposit-modal-save" (added #1407)
 * - Cancel button: data-testid="deposit-modal-cancel" (add/edit modal, added #1407)
 * - Delete cancel: data-testid="deposit-delete-cancel" (delete modal, added #1407)
 * - Delete confirm: data-testid="deposit-delete-confirm" (added #1407)
 * - Confirm button (state confirm): data-testid="state-confirm-button" (added #1407)
 * - State confirm cancel: data-testid="state-confirm-cancel" (added #1407)
 * - Error banner in form modals: role="alert" (FormError with variant='banner')
 * - Warning banner in delete modal: [class*="warningBanner"] (visible for paid/claimed deposits)
 * - Overflow menu trigger: button[aria-haspopup="menu"], aria-label includes "deposit"
 * - Menu: role="menu", items role="menuitem"
 * - Menu items (pending): "Mark paid…", "Edit", "Delete"
 * - Menu items (paid): "Mark claimed…", "Revert to pending", "Edit", "Delete"
 * - Menu items (claimed): "Revert to paid", "Edit", "Delete"
 * - Final payment row: [class*="finalPaymentRow"]
 * - Final payment amount: aria-live="polite" inside finalPaymentRow
 * - Mobile card list (≤767px): [class*="mobileCardList"] with role="list"
 * - Desktop table (>767px): [class*="tableWrapper"] > table
 */

import { expect } from '@playwright/test';
import { DocumentsPanel } from './DocumentsPanel.js';
import type { Page, Locator } from '@playwright/test';
import { routeUrl } from '../../shared/src/routes/index.js';
import { BreadcrumbsBar } from './BreadcrumbsBar.js';
import { CostLinesPanel } from './components/CostLinesPanel.js';
import { StatusMenuControl } from './components/StatusMenuControl.js';

/** API (not app route) detail-endpoint matcher. */
const API_INVOICE_DETAIL_URL = /\/api\/(?:.*\/)?invoices\//;

export class InvoiceDetailPage {
  readonly page: Page;

  // Navigation (trail "Money › Invoices" and the optional origin Back)
  readonly breadcrumbs: BreadcrumbsBar;

  // Page header
  readonly heading: Locator;
  readonly statusBadge: Locator;
  readonly editButton: Locator;
  readonly deleteButton: Locator;

  // Detail card
  readonly detailCard: Locator;
  readonly infoList: Locator;

  /** The cost lines `<section>` (same as `costLines.section`). */
  readonly budgetLinesSection: Locator;

  // Documents panel (#2233): the "Documents (n)" trigger and the open sheet
  readonly documentsButton: Locator;
  readonly documents: DocumentsPanel;
  /** The open Documents panel (a dialog; only present while open). */
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

  // ─── Vendor picker in the edit modal (Story #1736) ───────────────────────
  /**
   * The vendor SearchPicker's selectedDisplay chip — visible when the picker has a
   * pre-populated value (initialTitle + value both set).  This is the element that
   * renders when the modal first opens.
   * Scoped to editModal so it doesn't conflict with other SearchPicker instances.
   */
  readonly editVendorSelectedDisplay: Locator;

  /**
   * The vendor SearchPicker's text input — visible after the user clicks the clear
   * button on the selectedDisplay chip, or when no vendor was pre-filled.
   * id="edit-vendor" (matches the `id` prop passed to SearchPicker in InvoiceDetailPage.tsx)
   */
  readonly editVendorInput: Locator;

  /**
   * The field-level validation error shown below the vendor picker when the vendor
   * is cleared and the form is submitted.
   * FormError variant="field" renders a <div> WITHOUT role="alert" (only variant="banner"
   * emits role="alert"). Locator uses the label[for="edit-vendor"] ancestor to reach the
   * field wrapper div, then targets its last div child (the FormError div).
   */
  readonly editVendorError: Locator;

  /** Header StatusMenu (data-testid="invoice-status-badge"); trigger is the Badge when no move exists. */
  readonly statusMenu: StatusMenuControl;

  // Delete dialog (ConfirmDialog)
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

  // ─── Entry Type (Refunds) locators (Issue #1876) ────────────────────────
  /** Entry-type radio group inside the add/edit deposit modal: role="group" */
  readonly depositEntryTypeGroup: Locator;

  /** "Deposit" radio input (name="entryType", value="deposit") */
  readonly depositEntryTypeDepositRadio: Locator;

  /** "Refund" radio input (name="entryType", value="refund") */
  readonly depositEntryTypeRefundRadio: Locator;

  /**
   * Refund amount hint shown below the amount input when the "Refund" radio
   * is selected. Reuses the .charCounter style class.
   */
  readonly depositRefundAmountHint: Locator;

  /**
   * "Refund" entry-type Badge, scoped to the deposits section. Matches BOTH the
   * desktop table row and the mobile card instance — filter to visible when a
   * specific one is needed.
   */
  readonly refundBadge: Locator;

  /**
   * Negative-amount span rendered for refund-type deposit rows/cards
   * ([class*="amountNegative"]).
   */
  readonly refundAmountNegative: Locator;

  /** Save button (type="submit", form="deposit-form", text="Save") */
  readonly depositModalSave: Locator;

  /** Cancel button inside the add/edit or delete deposit modal */
  readonly depositModalCancel: Locator;

  /** Error banner (role="alert") inside a deposit modal */
  readonly depositModalError: Locator;
  readonly depositExceedsWarning: Locator;

  /** Delete deposit dialog (ConfirmDialog, alertdialog) */
  readonly deleteDepositModal: Locator;

  /** Warning banner inside the delete deposit modal (visible for paid/claimed deposits) */
  readonly deleteDepositWarning: Locator;

  /** Cancel button inside the delete deposit modal (data-testid="deposit-delete-cancel") */
  readonly deleteDepositCancelButton: Locator;

  /** Confirm delete button inside the delete deposit modal */
  readonly deleteDepositConfirmButton: Locator;

  /**
   * Budget-source `<select id="deposit-budgetSource">` in the add/edit deposit modal
   * (Story #1891) — links a deposit directly to a budget source (independent of budget
   * lines). Empty option value `""` = "None (pro-rated)". On the ADD modal only (not edit),
   * this defaults per `invoice.budgetLines` grouped by `budgetSourceId`: 0 sources → `null`
   * + `budgetSourceHintNone`; 1 source → that source + `budgetSourceHintSingle`; >1 sources
   * → the largest-sum source + `budgetSourceHintLargest`. Always editable (gated only on
   * `isMutating`, unlike the entry-type radios which are edit-mode-disabled).
   */
  readonly depositBudgetSourceSelect: Locator;

  /**
   * The hint text below the budget-source select — reuses `.charCounter` styling (Story
   * #1891). Text is one of `budgetSourceHintNone`/`budgetSourceHintSingle`/
   * `budgetSourceHintLargest`, only rendered on the ADD modal (default-selection hint).
   */
  readonly depositBudgetSourceHint: Locator;

  /** Final payment row at the bottom of the deposits table */
  readonly finalPaymentRow: Locator;

  /** aria-live amount inside the final payment row */
  readonly finalPaymentAmount: Locator;

  // ─── Cost lines (#2235) ───────────────────────────────────────────────────
  /** The cost lines of the offer or invoice: table, Add cost line, Add lines (grid), Split. */
  readonly costLines: CostLinesPanel;

  // ─── Auto-itemize (Issue #1547, redesigned in Issue #1564) ─────────────────
  //
  // Story #1564 redesigned the auto-itemize flow as a full page instead of a modal.
  // The "Auto-itemize" button in InvoiceBudgetLinesSection was REMOVED.
  // The "Itemize" button now appears on each LinkedDocumentCard (in the Documents panel)
  //   when: entityType='invoice' AND config.autoItemizeEnabled=true.
  // Clicking "Itemize" navigates to /budget/invoices/:id/auto-itemize/:documentId.
  //
  // REMOVED components (story #1564):
  //   - AutoItemizePreviewModal
  //   - DocumentPickerModal
  //   - "Auto-itemize" button in InvoiceBudgetLinesSection header
  //
  // ADDED (story #1564):
  //   - "Itemize" button on LinkedDocumentCard (in the Documents panel)
  //     Translation key: documents:documentCard.itemize = "Itemize"
  //     aria-label: `${t('documentCard.itemize')}: ${title}` = "Itemize: {docTitle}"
  //   - "Details" button renamed from "View" (same button, new label)
  //     Translation key: documents:documentCard.details = "Details"
  //     aria-label: t('documentCard.detailsAriaLabel', { title }) = "View details: {title}"
  //
  // For the new AutoItemizePage POM, see: e2e/pages/AutoItemizePage.ts

  // ─── LinkedDocumentCard helpers (Issue #1564) ────────────────────────────────

  /** Opens the Documents panel from the "Documents (n)" button. */
  async openDocuments(): Promise<void> {
    await this.documents.open();
  }

  /** Opens the ⋯ menu of the card with the given document title (panel must be open). */
  async openCardMenu(documentTitle: string): Promise<void> {
    await this.documents.rowMenuTrigger(documentTitle).click();
  }

  /**
   * The "Itemize" menu item. Only present in an open card menu, and only when entityType=invoice
   * AND config.autoItemizeEnabled=true (open the card's menu first with `openCardMenu`).
   */
  itemizeButton(_documentTitle?: string): Locator {
    return this.documents.menuItem('Itemize');
  }

  /** Opens the card menu and chooses Itemize (navigates to the auto-itemize page). */
  async clickItemize(documentTitle: string): Promise<void> {
    await this.openCardMenu(documentTitle);
    await this.itemizeButton().click();
  }

  /** The "Details" toggle of the card with the given document title (panel must be open). */
  detailsButton(documentTitle: string): Locator {
    return this.documents.row(documentTitle).getByRole('button', { name: 'Details' });
  }

  // ─── Attachment-type tagging (Story #1877) ───────────────────────────────
  //
  // Only rendered on LinkedDocumentCard when entityType='invoice' (onAttachmentTypeChange
  // prop is passed conditionally by DocumentsPanel). The select has id
  // `attachment-type-{linkId}` with an sr-only label; the Badge (rendered only when
  // link.attachmentType is non-null) has testId `attachment-type-badge-{linkId}`.

  /**
   * Returns the attachment-type <select> for the linked-document card with the given
   * document-link id. Present only on invoice-entity document cards.
   */
  getAttachmentTypeSelect(linkId: string): Locator {
    return this.documentsSection.locator(`#attachment-type-${linkId}`);
  }

  /**
   * Returns the attachment-type Badge for the linked-document card with the given
   * document-link id. Only rendered in the DOM when the link's attachmentType is
   * non-null (untagged links render no badge at all — not a "No tag" chip).
   */
  getAttachmentTypeBadge(linkId: string): Locator {
    return this.documentsSection.getByTestId(`attachment-type-badge-${linkId}`);
  }

  /**
   * Returns the "Document type (optional)" select of the panel's picker view.
   * Only rendered when entityType='invoice'; has a visible label (unlike the per-card select).
   */
  getPickerAttachmentTypeSelect(): Locator {
    return this.documents.pickerTypeSelect;
  }

  /**
   * Returns a locator for the OLD "Auto-itemize" button that was in the budget lines
   * section header. After story #1564 this button NO LONGER EXISTS.
   * Use this locator ONLY to assert absence (expect(...).not.toBeVisible()).
   *
   * @deprecated The auto-itemize button was removed in story #1564.
   *             Use itemizeButton() on the LinkedDocumentCard instead.
   */
  autoItemizeButton(): Locator {
    return this.budgetLinesSection.getByRole('button', {
      name: 'Extract line items from a linked Paperless document',
    });
  }

  /**
   * @deprecated Alias kept for backward compat with tests written before story #1564.
   * The "Auto-itemize" button in the budget lines section was removed.
   * Use autoItemizeButton() and assert its absence, or use itemizeButton() on the card.
   */
  getAutoItemizeButton(): Locator {
    return this.autoItemizeButton();
  }

  /**
   * @deprecated Removed in story #1564. The DocumentPickerModal no longer exists.
   * The new flow navigates directly to /auto-itemize/:documentId when Itemize is clicked.
   */
  getDocumentPickerModal(): Locator {
    return this.page.locator('[role="dialog"]').filter({
      has: this.page.locator('h2', { hasText: 'Choose document to analyze' }),
    });
  }

  /**
   * @deprecated Removed in story #1564. The AutoItemizePreviewModal no longer exists.
   * Use AutoItemizePage POM instead.
   */
  getAutoItemizePreviewModal(): Locator {
    return this.page.locator('[role="dialog"]').filter({
      has: this.page.locator('h2', { hasText: 'Review extracted line items' }),
    });
  }

  /**
   * @deprecated Removed in story #1564. The mismatch warning is now in AutoItemizePage.
   */
  getMismatchWarningBanner(): Locator {
    return this.getAutoItemizePreviewModal().locator('[class*="warningBlock"]');
  }

  /**
   * @deprecated Removed in story #1564. The empty state is now in AutoItemizePage.
   */
  getEmptyStateMessage(): Locator {
    return this.getAutoItemizePreviewModal().locator('[class*="emptyState"]');
  }

  /**
   * @deprecated Removed in story #1564. The old auto-itemize button was removed.
   * Use itemizeButton(documentTitle).click() on the LinkedDocumentCard instead.
   */
  async clickAutoItemizeButton(): Promise<void> {
    const btn = this.getAutoItemizeButton();
    await btn.waitFor({ state: 'visible' });
    await btn.click();
  }

  /**
   * @deprecated Removed in story #1564. DocumentPickerModal was removed.
   */
  async selectDocument(title: string): Promise<void> {
    const pickerModal = this.getDocumentPickerModal();
    await pickerModal.waitFor({ state: 'visible' });
    await pickerModal.getByRole('button', { name: title }).click();
  }

  /**
   * @deprecated Removed in story #1564. AutoItemizePreviewModal was removed.
   */
  async editPreviewLineDescription(index: number, newDescription: string): Promise<void> {
    const previewModal = this.getAutoItemizePreviewModal();
    await previewModal.waitFor({ state: 'visible' });
    const descInput = previewModal.locator('table tbody tr input[type="text"]').nth(index);
    await descInput.clear();
    await descInput.fill(newDescription);
  }

  /**
   * @deprecated Removed in story #1564. AutoItemizePreviewModal was removed.
   */
  async toggleIncludeLine(index: number): Promise<void> {
    const previewModal = this.getAutoItemizePreviewModal();
    await previewModal.waitFor({ state: 'visible' });
    const rowCheckboxes = previewModal.locator(
      'table tbody tr input[type="checkbox"]:not([aria-label*="Select all"])',
    );
    await rowCheckboxes.nth(index).click();
  }

  /**
   * @deprecated Removed in story #1564. AutoItemizePreviewModal was removed.
   */
  async selectMode(mode: 'append' | 'replace'): Promise<void> {
    const previewModal = this.getAutoItemizePreviewModal();
    await previewModal.waitFor({ state: 'visible' });
    const radio = previewModal.locator(`input[type="radio"][value="${mode}"]`);
    await radio.click();
  }

  /**
   * @deprecated Removed in story #1564. AutoItemizePreviewModal was removed.
   */
  async clickApplyButton(): Promise<void> {
    const previewModal = this.getAutoItemizePreviewModal();
    await previewModal.waitFor({ state: 'visible' });
    const applyBtn = previewModal.getByRole('button', { name: 'Apply', exact: true });
    await applyBtn.click();
  }

  // ─── Quotation → final invoice conversion (Story #2107) ─────────────────
  // All locators are data-testid based; ConvertQuotationModal renders in a portal.
  readonly convertButton: Locator;
  readonly convertForm: Locator;
  readonly convertFinalAmount: Locator;
  readonly convertDate: Locator;
  readonly convertInvoiceNumber: Locator;
  readonly convertDueDate: Locator;
  readonly convertNotes: Locator;
  readonly convertDelta: Locator;
  readonly convertKeepExisting: Locator;
  readonly convertResetProposal: Locator;
  readonly convertRemainder: Locator;
  readonly convertItemizedTotal: Locator;
  readonly convertOverAllocated: Locator;
  readonly convertOverpaidBanner: Locator;
  readonly convertAddRefund: Locator;
  readonly convertFinalPayment: Locator;
  readonly convertStatusPending: Locator;
  readonly convertStatusPaid: Locator;
  readonly convertConfirm: Locator;
  readonly convertCancel: Locator;
  readonly convertSaveError: Locator;
  readonly convertSelectDocument: Locator;
  readonly convertSelectedDocument: Locator;
  readonly convertAiPrefill: Locator;
  readonly convertAiError: Locator;
  readonly convertAiRetry: Locator;
  readonly convertAiSuccess: Locator;
  readonly convertAiMismatch: Locator;
  /** The "Source document" section; only rendered while Paperless is connected (#2217). */
  readonly convertSourceSection: Locator;
  readonly convertLinesEmpty: Locator;
  /** The convert modal dialog (only present while the form view is open). */
  readonly convertDialog: Locator;

  constructor(page: Page) {
    this.page = page;

    this.breadcrumbs = new BreadcrumbsBar(page);

    // h1 heading — "‹company› · ‹number›" (see invoiceTitle.ts)
    this.heading = page.getByRole('heading', { level: 1 });

    // Status badge — shared Badge chip in the heading (Story #2195)
    this.statusBadge = page.getByTestId('invoice-status-badge');
    this.statusMenu = new StatusMenuControl(page, 'invoice-status-badge');

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

    // Cost lines section (CostLinesSection, #2235)
    this.budgetLinesSection = page.getByTestId('cost-lines-section');

    // Documents panel (#2233)
    this.documentsButton = page.getByTestId('documents-panel-button');
    this.documents = new DocumentsPanel(page);
    this.documentsSection = this.documents.dialog;

    // Edit modal — role="dialog" named "Edit Invoice"
    // Using the modal title text as the accessible name anchor
    // The shared Modal names the dialog by its title (#2213): "Edit Invoice"
    this.editModal = page.getByRole('dialog', { name: 'Edit Invoice', exact: true });
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

    // ─── Vendor picker locators (Story #1736) ────────────────────────────
    // When the edit modal opens, SearchPicker renders the selectedDisplay chip because
    // both `initialTitle` and `value` are populated from the current invoice vendor.
    // [class*="selectedDisplay"] is stable across CSS-module hash changes.
    // Scope to the editModal to avoid matching other SearchPicker instances on the page.
    this.editVendorSelectedDisplay = this.editModal.locator('[class*="selectedDisplay"]');

    // After clicking the clear button on the selectedDisplay chip, the picker switches
    // to input mode — the <input id="edit-vendor"> becomes visible.
    this.editVendorInput = page.locator('#edit-vendor');

    // FormError variant="field" does NOT emit role="alert" (only variant="banner" does).
    // The InvoiceDetailPage TSX renders:
    //   <div class={styles.field}>          ← field wrapper (InvoiceDetailPage.module.css)
    //     <label for="edit-vendor">...</label>
    //     <SearchPicker id="edit-vendor" ... />   ← root div with class*="container"
    //     <FormError message={vendorError} variant="field" />  ← only when vendorError set
    //   </div>
    // We navigate from label[for="edit-vendor"] → parent div (field wrapper)
    // → last div child (the FormError div, rendered last in the wrapper).
    this.editVendorError = this.editModal
      .locator('label[for="edit-vendor"]')
      .locator('xpath=parent::div/div[last()]');

    // Delete dialog — the shared ConfirmDialog (role="alertdialog", testid prefix invoice-delete)
    this.deleteModal = page
      .getByRole('alertdialog')
      .filter({ has: page.getByTestId('invoice-delete-cancel') });
    this.deleteConfirmButton = this.deleteModal.getByTestId('invoice-delete-confirm');
    this.deleteCancelButton = this.deleteModal.getByTestId('invoice-delete-cancel');
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

    // ─── Entry Type (Refunds) locators (Issue #1876) ───────────────────────
    // Page-scoped for the same reason as the other form inputs above — the deposit
    // modal renders via a portal to document.body.
    this.depositEntryTypeGroup = page.locator('[role="group"]').filter({
      has: page.locator('input[name="entryType"]'),
    });
    this.depositEntryTypeDepositRadio = page.locator('input[name="entryType"][value="deposit"]');
    this.depositEntryTypeRefundRadio = page.locator('input[name="entryType"][value="refund"]');
    this.depositRefundAmountHint = page.locator('[class*="charCounter"]').filter({
      hasText: 'Refund amounts are entered as a positive number.',
    });

    // Refund badge — scoped to the deposits section so it doesn't collide with other
    // Badge instances (e.g. status badges) elsewhere on the page.
    // NOTE: like the desktop table vs. mobile card list elsewhere in this section, both
    // layouts render simultaneously in the DOM with CSS-driven visibility toggling. A
    // bare locator's .first() would resolve to DOM order (table before card), which is
    // the WRONG element whenever the mobile card is the visible one. Pre-filter to
    // visible so .first() always resolves to the currently-rendered layout.
    this.refundBadge = this.depositsSection.locator('[class*="refund"]').visible();
    this.refundAmountNegative = this.depositsSection.locator('[class*="amountNegative"]').visible();

    // Save button in add/edit deposit modal — stable data-testid added in #1407
    this.depositModalSave = page.getByTestId('deposit-modal-save');

    // Cancel button in add/edit deposit modal — stable data-testid added in #1407
    this.depositModalCancel = page.getByTestId('deposit-modal-cancel');

    // Error banner (FormError with variant='banner' renders role="alert")
    this.depositModalError = page.locator('[role="dialog"] [role="alert"]');
    this.depositExceedsWarning = page.getByTestId('deposit-exceeds-warning');

    // Delete deposit dialog: the shared ConfirmDialog (role="alertdialog", testid prefix
    // deposit-delete), title "Delete <deposit name>?"
    this.deleteDepositModal = page
      .getByRole('alertdialog')
      .filter({ has: page.getByTestId('deposit-delete-cancel') });

    // Warning banner (the dialog's lead) shown for paid/submitted deposits
    this.deleteDepositWarning = this.deleteDepositModal.locator('[class*="warningBanner"]');

    this.deleteDepositCancelButton = page.getByTestId('deposit-delete-cancel');
    this.deleteDepositConfirmButton = page.getByTestId('deposit-delete-confirm');

    // Budget-source select in the add/edit deposit modal (Story #1891) — page-scoped for the
    // same reason as the other form inputs above (the deposit modal renders via a portal).
    this.depositBudgetSourceSelect = page.locator('#deposit-budgetSource');

    // Hint text (reuses .charCounter styling) below the budget-source select.
    this.depositBudgetSourceHint = page
      .locator('label[for="deposit-budgetSource"]')
      .locator('xpath=parent::div//*[contains(@class,"charCounter")]');

    // Final payment row (always visible when deposits.length > 0)
    this.finalPaymentRow = page.locator('[class*="finalPaymentRow"]');

    // aria-live amount inside the final payment row
    this.finalPaymentAmount = this.finalPaymentRow.locator('[aria-live="polite"]');

    this.costLines = new CostLinesPanel(page);

    // ─── Quotation conversion locators (Story #2107) ─────────────────────
    this.convertButton = page.getByTestId('convert-quotation-button');
    this.convertForm = page.getByTestId('convert-quotation-form');
    this.convertFinalAmount = page.getByTestId('convert-final-amount');
    this.convertDate = page.getByTestId('convert-date');
    this.convertInvoiceNumber = page.getByTestId('convert-invoice-number');
    this.convertDueDate = page.getByTestId('convert-due-date');
    this.convertNotes = page.getByTestId('convert-notes');
    this.convertDelta = page.getByTestId('convert-delta');
    this.convertKeepExisting = page.getByTestId('convert-keep-existing');
    this.convertResetProposal = page.getByTestId('convert-reset-proposal');
    this.convertRemainder = page.getByTestId('convert-remainder');
    this.convertItemizedTotal = page.getByTestId('convert-itemized-total');
    this.convertOverAllocated = page.getByTestId('convert-over-allocated');
    this.convertOverpaidBanner = page.getByTestId('convert-overpaid-banner');
    this.convertAddRefund = page.getByTestId('convert-add-refund');
    this.convertFinalPayment = page.getByTestId('convert-final-payment');
    this.convertStatusPending = page.getByTestId('convert-status-pending');
    this.convertStatusPaid = page.getByTestId('convert-status-paid');
    this.convertConfirm = page.getByTestId('convert-confirm');
    this.convertCancel = page.getByTestId('convert-cancel');
    this.convertSaveError = page.getByTestId('convert-save-error');
    this.convertSelectDocument = page.getByTestId('convert-select-document');
    this.convertSelectedDocument = page.getByTestId('convert-selected-document');
    this.convertAiPrefill = page.getByTestId('convert-ai-prefill');
    this.convertAiError = page.getByTestId('convert-ai-error');
    this.convertAiRetry = page.getByTestId('convert-ai-retry');
    this.convertAiSuccess = page.getByTestId('convert-ai-success');
    this.convertAiMismatch = page.getByTestId('convert-ai-mismatch');
    this.convertSourceSection = page.getByTestId('convert-source-section');
    this.convertLinesEmpty = page.getByTestId('convert-lines-empty');
    this.convertDialog = page
      .getByRole('dialog')
      .filter({ has: page.getByTestId('convert-quotation-form') });
  }

  // ─── Quotation conversion helpers (Story #2107) ───────────────────────────

  /** Proposed-amount input for an invoice budget line (table on desktop/tablet, card on mobile). */
  lineInput(id: string, viewport: 'desktop' | 'mobile'): Locator {
    return this.page.getByTestId(
      viewport === 'mobile' ? `convert-line-input-mobile-${id}` : `convert-line-input-${id}`,
    );
  }

  /** "Keep" checkbox for an invoice budget line (table on desktop/tablet, card on mobile). */
  lineKeep(id: string, viewport: 'desktop' | 'mobile'): Locator {
    return this.page.getByTestId(
      viewport === 'mobile' ? `convert-line-keep-mobile-${id}` : `convert-line-keep-${id}`,
    );
  }

  /** Mobile line card for an invoice budget line. */
  lineCard(id: string): Locator {
    return this.page.getByTestId(`convert-line-card-${id}`);
  }

  /** Desktop/tablet line table row for an invoice budget line. */
  lineRow(id: string): Locator {
    return this.page.getByTestId(`convert-line-row-${id}`);
  }

  /** Opens the conversion modal and waits for the form to be ready. */
  async openConvert(): Promise<void> {
    await this.convertButton.click();
    await this.convertForm.waitFor({ state: 'visible' });
    await this.convertFinalAmount.waitFor({ state: 'visible' });
  }

  /** Clicks Confirm and waits for the POST convert-quotation response. Returns its HTTP status. */
  async confirmConvert(): Promise<number> {
    const responsePromise = this.page.waitForResponse(
      (resp) => resp.url().includes('/convert-quotation') && resp.request().method() === 'POST',
    );
    await this.convertConfirm.click();
    const response = await responsePromise;
    return response.status();
  }

  /**
   * Navigate to the invoice detail page by ID.
   */
  async goto(id: string): Promise<void> {
    await this.page.goto(routeUrl('invoice', { id }));
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
    // The heading renders before the info list when the page is slow; read only once rows exist
    await this.infoList.locator('[class*="infoRow"]').first().waitFor({ state: 'visible' });
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
        API_INVOICE_DETAIL_URL.test(resp.url()) &&
        resp.request().method() === 'PATCH' &&
        resp.status() === 200,
    );
    await this.editSaveButton.click();
    await responsePromise;
    await this.editModal.waitFor({ state: 'hidden' });
  }

  // ─── Vendor picker helpers (Story #1736) ──────────────────────────────────

  /**
   * Selects a vendor in the edit modal's SearchPicker.
   *
   * If the picker is currently showing a selectedDisplay chip (pre-populated),
   * this method first clears it so the input becomes active, then types the
   * vendor name and clicks the matching option in the dropdown.
   *
   * If the picker is already in input mode (e.g. after a previous clear), it
   * types directly without clearing first.
   *
   * @param vendorName - The exact vendor name to select.
   */
  async selectVendorInEditModal(vendorName: string): Promise<void> {
    // If selectedDisplay is visible, click the clear (×) button to enter input mode.
    if (await this.editVendorSelectedDisplay.isVisible()) {
      await this.editVendorSelectedDisplay.getByRole('button').click();
      // Wait for the input to appear after clearing
      await this.editVendorInput.waitFor({ state: 'visible' });
    }

    // The SearchPicker portals its dropdown to [data-search-picker-dropdown] on document.body.
    // On the phone the option list can re-render under the pointer (the first click is lost and
    // the list stays open), so retry the whole type-and-pick until the picker shows its value.
    const dropdown = this.page.locator('[data-search-picker-dropdown]');
    await expect(async () => {
      if (await this.editVendorSelectedDisplay.isVisible()) return;
      await this.editVendorInput.fill(vendorName);
      await dropdown.waitFor({ state: 'visible' });
      await dropdown.getByRole('option', { name: vendorName, exact: true }).click();
      await this.editVendorSelectedDisplay.waitFor({ state: 'visible', timeout: 3000 });
    }).toPass({ timeout: 20000 });

    // The portalled option list must detach once the selection is made
    await dropdown.waitFor({ state: 'detached' });
  }

  /**
   * Clears the currently selected vendor in the edit modal's SearchPicker,
   * switching the picker from selectedDisplay chip back to empty input mode.
   * Use this when testing the "vendor required" validation error.
   */
  async clearVendorInEditModal(): Promise<void> {
    await this.editVendorSelectedDisplay.waitFor({ state: 'visible' });
    await this.editVendorSelectedDisplay.getByRole('button').click();
    await this.editVendorInput.waitFor({ state: 'visible' });
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
        API_INVOICE_DETAIL_URL.test(resp.url()) &&
        resp.request().method() === 'DELETE' &&
        resp.status() === 204,
    );
    await this.deleteConfirmButton.click();
    await responsePromise;
  }

  /**
   * Navigate back to the invoices list by clicking the "Invoices" trail link (on a phone the
   * row shows only this nearest parent).
   */
  async goBackToInvoices(): Promise<void> {
    await this.breadcrumbs.trailLink('Invoices').click();
    // Path only: Back through history (< 1024px) keeps the list's query string
    await this.page.waitForURL((url) => url.pathname === routeUrl('invoices'));
  }

  // ─── Deposits Section helpers (Issue #1404) ─────────────────────────────

  /**
   * Opens the overflow menu for a deposit.
   *
   * The overflow menu button renders as:
   *   <button type="button" aria-haspopup="menu"
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
      // .visible() is required on mobile: the desktop table rows are hidden
      // but their overflow buttons remain in the DOM, so .first() without the filter picks
      // the hidden table button instead of the visible mobile-card button.
      menuButton = this.depositsSection
        .locator(
          `button[aria-haspopup="menu"][aria-label^="Deposit actions"][aria-label*="${depositDescription.replace(/"/g, '\\"')}"]`,
        )
        .visible()
        .first();
    } else {
      // The status chip is also aria-haspopup="menu" (#2209): only the kebab carries this label
      menuButton = this.depositsSection
        .locator('button[aria-haspopup="menu"][aria-label^="Deposit actions"]')
        .visible()
        .first();
    }

    await menuButton.click();
    // Wait for menu to appear. The desktop table (display:none on mobile) keeps its
    // [role="menu"] in the DOM, so filter to visible before resolving .first().
    await this.page.locator('[role="menu"]').visible().first().waitFor({ state: 'visible' });
  }

  /**
   * Clicks a menu item by its label text within the currently open menu.
   */
  async clickDepositMenuItem(label: string | RegExp): Promise<void> {
    // Mobile/tablet hide the desktop table via CSS but keep its [role="menuitem"]
    // nodes in the DOM. Filter to visible elements so .first() picks the visible
    // menu item (not the hidden table duplicate).
    const menuItem = this.page.locator('[role="menuitem"]').visible().filter({ hasText: label });
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
   * Selects the "Deposit" or "Refund" radio in the entry-type group (Issue #1876).
   * The radios are disabled in edit mode (entryType is immutable after creation) —
   * calling this in edit mode will time out on Playwright's actionability check,
   * which is the desired behavior for asserting immutability.
   */
  async selectEntryType(entryType: 'deposit' | 'refund'): Promise<void> {
    const radio =
      entryType === 'refund' ? this.depositEntryTypeRefundRadio : this.depositEntryTypeDepositRadio;
    await radio.check();
  }

  /**
   * Fills the add/edit deposit form. Only provided fields are updated.
   * `status` is add-mode only (#2209). For values other than 'pending', paidDate is required by the submit button.
   */
  async fillDepositForm(data: {
    amount?: string;
    dueDate?: string;
    status?: 'pending' | 'paid' | 'claimed';
    paidDate?: string;
    claimedDate?: string;
    description?: string;
    entryType?: 'deposit' | 'refund';
  }): Promise<void> {
    if (data.entryType !== undefined) {
      await this.selectEntryType(data.entryType);
    }
    if (data.amount !== undefined) {
      await this.depositAmountInput.clear();
      await this.depositAmountInput.fill(data.amount);
    }
    if (data.dueDate !== undefined) {
      await this.depositDueDateInput.fill(data.dueDate);
    }
    if (data.status !== undefined) {
      // #2209 round 2: the status select exists in ADD mode only. Editing a progress payment
      // never changes its status; use changeDepositStatus() (the row StatusMenu) instead.
      if ((await this.depositStatusSelect.count()) === 0) {
        throw new Error(
          'fillDepositForm({ status }) is add-only; use changeDepositStatus() for existing payments',
        );
      }
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
        API_INVOICE_DETAIL_URL.test(resp.url()) &&
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
   * The StatusMenu of a progress payment, resolved to the control that is visible in the
   * current layout (table row on desktop/tablet, card on mobile - both are mounted, with
   * test ids `deposit-status-<id>` and `deposit-status-mobile-<id>`).
   * @param description Optional text identifying the deposit row/card; the first visible one otherwise.
   */
  async depositStatusMenu(description?: string): Promise<StatusMenuControl> {
    const rows = this.depositsSection.locator(
      'tbody tr, [class*="mobileCard"]:not([class*="mobileCardList"])',
    );
    const scoped = description === undefined ? rows : rows.filter({ hasText: description });
    // The Sheet keeps -panel / -option-* / -date-* test ids mounted (hidden) on compact
    // viewports, so match only the trigger ids.
    const trigger = scoped
      .getByTestId(/^deposit-status-(?!.*-(?:panel|backdrop|close|back)$)(?!.*-(?:option|date)-)/)
      .visible()
      .first();
    await trigger.waitFor({ state: 'visible' });
    const testId = await trigger.getAttribute('data-testid');
    if (!testId) throw new Error('Deposit status control has no data-testid');
    return new StatusMenuControl(this.page, testId);
  }

  /**
   * Change a progress payment's status through its StatusMenu and wait for the PATCH.
   * Forward moves ask for a date: pass 'today' or an ISO date. Reverse moves ("Back to ...")
   * have no date step: omit `date`.
   */
  async changeDepositStatus(
    to: 'pending' | 'paid' | 'claimed',
    opts: { date?: 'today' | string; description?: string } = {},
  ): Promise<void> {
    const menu = await this.depositStatusMenu(opts.description);
    const responsePromise = this.page.waitForResponse(
      (resp) =>
        resp.url().includes('/deposits/') &&
        resp.request().method() === 'PATCH' &&
        resp.status() === 200,
    );
    if (opts.date === undefined) await menu.pickRow(to);
    else if (opts.date === 'today') await menu.chooseToday(to);
    else await menu.choosePickedDate(to, opts.date);
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
}
