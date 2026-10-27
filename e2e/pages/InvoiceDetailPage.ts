/**
 * Page Object Model for the Offer / Invoice page (/budget/invoices/:id), rebuilt on the detail
 * template in #2239 (EPIC-21 P4.7).
 *
 * The page is composed of shared controls:
 * - `breadcrumbs` (Money › Invoices, optional origin Back) — #2203
 * - `header` (`invoice-header`): h1 "‹company› · ‹number›" (see invoiceTitle.ts), the description
 *   line with the company link (`invoice-company-link`) and the notes, the status chip
 *   (`invoice-status-badge`, absent on an offer), ONE primary (offer: `convert-quotation-button`;
 *   To pay: `invoice-primary-mark-paid`; Paid: `invoice-primary-bank-report`; Submitted:
 *   `invoice-primary-add-payment`), at most one secondary (`invoice-secondary-add-payment`) and the
 *   ⋯ menu (Copy link, Print, Edit details `invoice-menu-edit`, separator, Delete
 *   `object-header-delete`)
 * - `summary` (`invoice-summary`): facts amount, paid, stillToPay | remainingOnOffer, due, split,
 *   fundingSource and documents (when Paperless is available), ids `summary-fact-<id>`
 * - `tabs` (`invoice-tabs`): Cost (default), Payments, History; `?tab=` carries the selection and
 *   `?payment=<id>` selects Payments and highlights the row link
 * - Cost tab: `costLines` (CostLinesSection grouped by task or purchase, no Belongs-to column)
 * - Payments tab: two RelatedLists, `invoice-progress-payments` (rows `Progress payment n`, closed
 *   by the "Final payment" row `final-payment` once a progress payment exists) and
 *   `invoice-refunds`. Status chips are `payment-status-<id>`; rows link to
 *   `?tab=payments&payment=<id>`; Remove acts at once with an Undo toast
 * - dialogs: Edit details (role dialog "Edit details"), the progress payment / refund form (title
 *   "Add progress payment" / "Add refund" / "Edit <name>"), the ConfirmDialog `invoice-delete`
 *   and the quotation conversion flow (`convert-*`)
 *
 * The page has no live status region any more: "payment no longer exists" is an info toast.
 */

import { expect } from '@playwright/test';
import { DocumentsPanel } from './DocumentsPanel.js';
import type { Page, Locator } from '@playwright/test';
import { routeUrl } from '../../shared/src/routes/index.js';
import { BreadcrumbsBar } from './BreadcrumbsBar.js';
import { ConfirmDialogControl } from './components/ConfirmDialogControl.js';
import { CostLinesPanel } from './components/CostLinesPanel.js';
import { ObjectHeaderControl } from './components/ObjectHeaderControl.js';
import { ObjectTabsControl } from './components/ObjectTabsControl.js';
import { RelatedListControl } from './components/RelatedListControl.js';
import { StatusMenuControl } from './components/StatusMenuControl.js';
import { SummaryStripControl } from './components/SummaryStripControl.js';
import { ToastRegion } from './components/ToastRegion.js';

/** API (not app route) detail-endpoint matcher. */
const API_INVOICE_DETAIL_URL = /\/api\/(?:.*\/)?invoices\//;

/** The id of the closing "Final payment" row of the progress payment list. */
export const FINAL_PAYMENT_ROW_ID = 'final-payment';

export type PaymentList = 'progress' | 'refund';

export class InvoiceDetailPage {
  readonly page: Page;
  readonly breadcrumbs: BreadcrumbsBar;
  readonly header: ObjectHeaderControl;
  readonly summary: SummaryStripControl;
  readonly tabs: ObjectTabsControl;
  readonly costLines: CostLinesPanel;
  readonly progressPayments: RelatedListControl;
  readonly refunds: RelatedListControl;
  readonly toasts: ToastRegion;

  // Header
  readonly heading: Locator;
  /** The status chip (absent on an offer). */
  readonly statusBadge: Locator;
  readonly statusMenu: StatusMenuControl;
  /** The To pay primary: Mark paid (applies at once, no date step). */
  readonly markPaid: StatusMenuControl;
  readonly companyLink: Locator;
  readonly bankReportLink: Locator;
  readonly addPaymentPrimary: Locator;
  readonly addPaymentSecondary: Locator;

  // Cost tab
  readonly budgetLinesSection: Locator;

  // Documents (a summary fact since #2239)
  readonly documentsFact: Locator;
  readonly documents: DocumentsPanel;
  readonly documentsSection: Locator;

  // History tab
  readonly historyShowAll: Locator;

  // Edit dialog (the "Edit details" modal)
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
  readonly editVendorSelectedDisplay: Locator;
  readonly editVendorInput: Locator;
  readonly editVendorError: Locator;

  // Delete dialog (ConfirmDialog, prefix invoice-delete)
  readonly deleteDialog: ConfirmDialogControl;
  readonly deleteModal: Locator;
  readonly deleteConfirmButton: Locator;
  readonly deleteCancelButton: Locator;
  readonly deleteErrorBanner: Locator;

  // Error card (not found / load failure)
  readonly errorCard: Locator;

  // Progress payment / refund form (a portalled Modal; inputs are page-scoped)
  readonly depositModal: Locator;
  readonly depositAmountInput: Locator;
  readonly depositDueDateInput: Locator;
  readonly depositStatusSelect: Locator;
  readonly depositPaidDateInput: Locator;
  readonly depositClaimedDateInput: Locator;
  readonly depositDescriptionInput: Locator;
  readonly depositEntryTypeGroup: Locator;
  readonly depositEntryTypeDepositRadio: Locator;
  readonly depositEntryTypeRefundRadio: Locator;
  readonly depositRefundAmountHint: Locator;
  readonly depositModalSave: Locator;
  readonly depositModalCancel: Locator;
  readonly depositModalError: Locator;
  readonly depositExceedsWarning: Locator;
  readonly depositBudgetSourceSelect: Locator;
  readonly depositBudgetSourceHint: Locator;

  // The closing row of the progress payment list
  readonly finalPaymentRow: Locator;
  readonly finalPaymentAmount: Locator;

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
    this.header = new ObjectHeaderControl(page, 'invoice-header');
    this.summary = new SummaryStripControl(page, 'invoice-summary');
    this.tabs = new ObjectTabsControl(page, 'invoice-tabs');
    this.costLines = new CostLinesPanel(page);
    this.progressPayments = new RelatedListControl(page, 'invoice-progress-payments');
    this.refunds = new RelatedListControl(page, 'invoice-refunds');
    this.toasts = new ToastRegion(page);

    // h1 heading — "‹company› · ‹number›" (see invoiceTitle.ts)
    this.heading = page.getByRole('heading', { level: 1 });

    this.statusBadge = page.getByTestId('invoice-status-badge');
    this.statusMenu = new StatusMenuControl(page, 'invoice-status-badge');
    this.markPaid = new StatusMenuControl(page, 'invoice-primary-mark-paid');
    this.companyLink = page.getByTestId('invoice-company-link');
    this.bankReportLink = page.getByTestId('invoice-primary-bank-report');
    this.addPaymentPrimary = page.getByTestId('invoice-primary-add-payment');
    this.addPaymentSecondary = page.getByTestId('invoice-secondary-add-payment');

    this.budgetLinesSection = page.getByTestId('cost-lines-section');

    this.documentsFact = page.getByTestId('summary-fact-documents');
    this.documents = new DocumentsPanel(page);
    this.documentsSection = this.documents.dialog;

    this.historyShowAll = page.getByTestId('invoice-history-show-all');

    // The shared Modal names the dialog by its title: "Edit details"
    this.editModal = page.getByRole('dialog', { name: 'Edit details', exact: true });
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

    // The vendor SearchPicker shows its selectedDisplay chip while a vendor is chosen
    this.editVendorSelectedDisplay = this.editModal.locator('[class*="selectedDisplay"]');
    this.editVendorInput = page.locator('#edit-vendor');
    // FormError variant="field" has no role="alert": walk from the label to the field's last div
    this.editVendorError = this.editModal
      .locator('label[for="edit-vendor"]')
      .locator('xpath=parent::div/div[last()]');

    this.deleteDialog = new ConfirmDialogControl(page, 'invoice-delete');
    this.deleteModal = this.deleteDialog.dialog;
    this.deleteConfirmButton = this.deleteDialog.confirmButton;
    this.deleteCancelButton = this.deleteDialog.cancelButton;
    this.deleteErrorBanner = this.deleteModal.locator('[role="alert"]');

    this.errorCard = page.locator('[class*="errorCard"]');

    // The progress payment form: a Modal whose form is `#deposit-form`
    this.depositModal = page.getByRole('dialog').filter({ has: page.locator('#deposit-form') });
    this.depositAmountInput = page.locator('#deposit-amount');
    this.depositDueDateInput = page.locator('#deposit-dueDate');
    this.depositStatusSelect = page.locator('#deposit-status');
    this.depositPaidDateInput = page.locator('#deposit-paidDate');
    this.depositClaimedDateInput = page.locator('#deposit-claimedDate');
    this.depositDescriptionInput = page.locator('#deposit-description');
    this.depositEntryTypeGroup = page.locator('[role="group"]').filter({
      has: page.locator('input[name="entryType"]'),
    });
    this.depositEntryTypeDepositRadio = page.locator('input[name="entryType"][value="deposit"]');
    this.depositEntryTypeRefundRadio = page.locator('input[name="entryType"][value="refund"]');
    this.depositRefundAmountHint = page.locator('[class*="charCounter"]').filter({
      hasText: 'Refund amounts are entered as a positive number.',
    });
    this.depositModalSave = page.getByTestId('deposit-modal-save');
    this.depositModalCancel = page.getByTestId('deposit-modal-cancel');
    this.depositModalError = page.locator('[role="dialog"] [role="alert"]');
    this.depositExceedsWarning = page.getByTestId('deposit-exceeds-warning');
    this.depositBudgetSourceSelect = page.locator('#deposit-budgetSource');
    this.depositBudgetSourceHint = page
      .locator('label[for="deposit-budgetSource"]')
      .locator('xpath=parent::div//*[contains(@class,"charCounter")]');

    this.finalPaymentRow = this.progressPayments.row(FINAL_PAYMENT_ROW_ID);
    this.finalPaymentAmount = this.finalPaymentRow.locator('[class*="amount"]');

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

  // ─── Documents panel (a summary fact since #2233) ─────────────────────────────

  /** Opens the Documents panel from the Documents summary fact. */
  async openDocuments(): Promise<void> {
    await this.documents.open('summary-fact-documents');
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

  /** Navigate to the page by invoice id and wait for the h1. */
  async goto(id: string): Promise<void> {
    await this.page.goto(routeUrl('invoice', { id }));
    await this.heading.waitFor({ state: 'visible' });
  }

  /** Navigate to a tab or payment deep link and wait for the h1. */
  async gotoUrl(url: string): Promise<void> {
    await this.page.goto(url);
    await this.heading.waitFor({ state: 'visible' });
  }

  async getHeadingText(): Promise<string> {
    return (await this.heading.textContent()) ?? '';
  }

  // ─── Tabs ──────────────────────────────────────────────────────────────────

  /** Select the Payments tab and wait for its lists. */
  async openPayments(): Promise<void> {
    if ((await this.tabs.tab('payments').getAttribute('aria-selected')) !== 'true') {
      await this.tabs.select('payments');
    }
    await this.progressPayments.root.waitFor({ state: 'visible' });
  }

  async openHistory(): Promise<void> {
    await this.tabs.select('history');
  }

  async openCost(): Promise<void> {
    await this.tabs.select('cost');
  }

  // ─── Edit details (⋯ menu) ──────────────────────────────────────────────────

  /** Open the Edit details dialog from the ⋯ menu. */
  async openEditModal(): Promise<void> {
    await this.header.chooseMenuItem('invoice-menu-edit');
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

  /** Open the Delete confirmation from the ⋯ menu. */
  async openDeleteModal(): Promise<void> {
    await this.header.chooseMenuItem('object-header-delete');
    await this.deleteDialog.waitForOpen();
  }

  /** Cancel the Delete dialog. */
  async closeDeleteModal(): Promise<void> {
    await this.deleteDialog.cancel();
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

  // ─── Payments tab ───────────────────────────────────────────────────────────

  /** The RelatedList of one kind. */
  list(kind: PaymentList): RelatedListControl {
    return kind === 'refund' ? this.refunds : this.progressPayments;
  }

  /** The ids of the entries of one list, in order (the final-payment row is never an entry). */
  async paymentIds(kind: PaymentList = 'progress'): Promise<string[]> {
    const list = this.list(kind);
    const prefix = `${list.testId}-row-`;
    const testIds = await list.rows.evaluateAll((els) =>
      els.map((el) => el.getAttribute('data-testid') ?? ''),
    );
    return testIds.map((id) => id.slice(prefix.length)).filter((id) => id !== FINAL_PAYMENT_ROW_ID);
  }

  /** Open the add dialog from the list's Add action (header button or empty state). */
  async openAddProgressPayment(): Promise<void> {
    await this.openPayments();
    await this.progressPayments.addAction('Add progress payment').click();
    await this.depositAmountInput.waitFor({ state: 'visible' });
  }

  async openAddRefund(): Promise<void> {
    await this.openPayments();
    await this.refunds.addAction('Add refund').click();
    await this.depositAmountInput.waitFor({ state: 'visible' });
  }

  /** Open the edit dialog of one entry with its pencil. */
  async openEditPayment(id: string, kind: PaymentList = 'progress'): Promise<void> {
    await this.openPayments();
    await this.list(kind).editButton(id).click();
    await this.depositAmountInput.waitFor({ state: 'visible' });
  }

  /** Remove one entry from its ⋯ menu (acts at once; an Undo toast follows). */
  async removePayment(id: string, kind: PaymentList = 'progress'): Promise<void> {
    await this.openPayments();
    const responsePromise = this.page.waitForResponse(
      (resp) =>
        resp.url().includes('/deposits/') &&
        resp.request().method() === 'DELETE' &&
        resp.status() === 200,
    );
    await this.list(kind).remove(id);
    await responsePromise;
  }

  /** The StatusMenu chip of one entry (`payment-status-<id>`). */
  paymentStatusMenu(id: string): StatusMenuControl {
    return new StatusMenuControl(this.page, `payment-status-${id}`);
  }

  /**
   * Change an entry's status through its chip and wait for the PATCH. Forward moves ask for a
   * date: pass 'today' or an ISO date. Reverse moves ("Back to ...") have no date step.
   */
  async changePaymentStatus(
    id: string,
    to: 'pending' | 'paid' | 'claimed',
    opts: { date?: 'today' | string } = {},
  ): Promise<void> {
    await this.openPayments();
    const menu = this.paymentStatusMenu(id);
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
}
