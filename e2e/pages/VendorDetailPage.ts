/**
 * Page Object Model for the Company page (/companies/:id), rebuilt on the detail template in
 * #2244 (EPIC-21 P4.12). Legacy /settings/vendors/:id and /budget/vendors/:id redirect here.
 * The class keeps its historic name (`VendorDetailPage`); the page itself is the Company page.
 *
 * Anatomy
 * - `header` (`company-header`): h1 = the company name; ONE primary - `primaryCall`
 *   (`company-primary-call`, a `tel:` link, "Call") or, with no number anywhere, `primaryAddPhone`
 *   ("Add phone number", `company-primary-add-phone`); the ⋯ menu holds Delete
 *   (`object-header-delete`). Delete asks through the ConfirmDialog prefix `vendor-delete`.
 * - `summary` (`company-summary`, 5 columns): facts `summary-fact-<trade|stillToPay|offers|tasks|onSite>`;
 *   Trade links to the list filtered by `tradeId`, the other four select a tab. The Still to pay
 *   fact carries `data-figure="still-to-pay"`.
 * - `tabs` (`company-tabs`): Overview (default) · Work · Payments · Site diary · History
 *   (`tabs.tab('overview'|'work'|'payments'|'diary'|'history')`, `?tab=`).
 * - Overview: Contact persons RelatedList `contacts` (`company-contacts`: header
 *   `-add`, rows `-row-<id>`, `-edit-<id>`, `-call-<id>`, ⋯ `-actions-<id>` -> Remove with Undo),
 *   the New / Edit contact person dialog (ObjectForm prefix `contact-person-form`), and three
 *   SectionCards: Phone and e-mail (`company-phone-email`), Address (`company-address`), About
 *   (`company-about`); each has `-edit` / `-save` / `-cancel` and read rows `company-detail-*`.
 * - Payments: `paymentsTotals` with `paidFigure` (`data-figure="paid"`) and `stillToPayFigure`
 *   (`data-figure="still-to-pay"`), the `submittedNote`, RelatedLists `invoices`, `offers` and
 *   `progressPayments`, row ⋯ Delete (`company-invoice-delete-<id>`, ConfirmDialog prefix
 *   `company-invoice-delete`). A company with no records shows one EmptyState with a "New invoice"
 *   button instead of the totals and the lists.
 * - Work: RelatedLists `tasks`, `purchases`, `costLines` (read only).
 * - Site diary: FeedGroup `diary` (`company-diary`) and `diaryShowAll`.
 * - History: SectionCard `history` (`section-company-history`), `historyShowAll`.
 */

import type { Page, Locator } from '@playwright/test';
import { expect } from '@playwright/test';
import { routeUrl } from '../../shared/src/routes/index.js';
import { BreadcrumbsBar } from './BreadcrumbsBar.js';
import { ConfirmDialogControl } from './components/ConfirmDialogControl.js';
import { ObjectFormDialog } from './components/ObjectFormDialog.js';
import { ObjectHeaderControl } from './components/ObjectHeaderControl.js';
import { ObjectTabsControl } from './components/ObjectTabsControl.js';
import { RelatedListControl } from './components/RelatedListControl.js';
import { SummaryStripControl } from './components/SummaryStripControl.js';
import { ToastRegion } from './components/ToastRegion.js';

export type CompanyTab = 'overview' | 'work' | 'payments' | 'diary' | 'history';
export type CompanyCard = 'company-phone-email' | 'company-address' | 'company-about';

export interface ContactPersonData {
  firstName?: string;
  lastName?: string;
  role?: string;
  phone?: string;
  email?: string;
  notes?: string;
}

export class VendorDetailPage {
  readonly page: Page;

  readonly breadcrumbs: BreadcrumbsBar;
  readonly header: ObjectHeaderControl;
  readonly summary: SummaryStripControl;
  readonly tabs: ObjectTabsControl;
  readonly toasts: ToastRegion;

  // Header
  readonly pageTitle: Locator;
  readonly primaryCall: Locator;
  readonly primaryAddPhone: Locator;
  /** The header ⋯ menu trigger. */
  readonly actionsTrigger: Locator;
  /** The Delete item of the header ⋯ menu; exists only while the menu is open. */
  readonly deleteButton: Locator;

  // Error card (not found / load failure)
  readonly errorCard: Locator;

  // Delete dialog (prefix `vendor-delete`)
  readonly deleteDialog: ConfirmDialogControl;
  readonly deleteModal: Locator;
  readonly deleteModalTitle: Locator;
  readonly deleteConfirmButton: Locator;
  readonly deleteCancelButton: Locator;
  readonly deleteErrorBanner: Locator;

  // Overview: contact persons
  readonly contacts: RelatedListControl;
  readonly newContactDialog: ObjectFormDialog;
  readonly editContactDialog: ObjectFormDialog;

  // Overview: detail cards
  readonly phoneField: Locator;
  readonly emailField: Locator;
  readonly addressField: Locator;
  readonly nameField: Locator;
  readonly notesField: Locator;

  // Payments
  readonly paymentsTotals: Locator;
  readonly paidFigure: Locator;
  readonly stillToPayFigure: Locator;
  /** Every Still to pay marker on the page (strip fact and, on Payments, the totals line). */
  readonly stillToPayFigures: Locator;
  readonly submittedNote: Locator;
  readonly invoices: RelatedListControl;
  readonly offers: RelatedListControl;
  readonly progressPayments: RelatedListControl;
  readonly invoiceDeleteDialog: ConfirmDialogControl;
  /** The EmptyState shown on Payments while the company has no offer, invoice or payment. */
  readonly paymentsEmpty: Locator;

  // Work
  readonly tasks: RelatedListControl;
  readonly purchases: RelatedListControl;
  readonly costLines: RelatedListControl;

  // Site diary and History
  readonly diary: Locator;
  readonly diaryShowAll: Locator;
  readonly history: Locator;
  readonly historyShowAll: Locator;

  constructor(page: Page) {
    this.page = page;
    this.breadcrumbs = new BreadcrumbsBar(page);
    this.header = new ObjectHeaderControl(page, 'company-header');
    this.summary = new SummaryStripControl(page, 'company-summary');
    this.tabs = new ObjectTabsControl(page, 'company-tabs');
    this.toasts = new ToastRegion(page);

    // The h1 also exists in the loading and error states, which have no ObjectHeader
    this.pageTitle = page.getByRole('heading', { level: 1 });
    this.primaryCall = page.getByTestId('company-primary-call');
    this.primaryAddPhone = page.getByTestId('company-primary-add-phone');
    this.actionsTrigger = this.header.menuTrigger;
    this.deleteButton = page.getByTestId('object-header-delete');

    this.errorCard = page
      .locator('[role="alert"]')
      .filter({ hasText: /not exist|could not|deleted/i });

    this.deleteDialog = new ConfirmDialogControl(page, 'vendor-delete');
    this.deleteModal = this.deleteDialog.dialog;
    this.deleteModalTitle = this.deleteModal.getByRole('heading', { level: 2 });
    this.deleteConfirmButton = this.deleteDialog.confirmButton;
    this.deleteCancelButton = this.deleteDialog.cancelButton;
    this.deleteErrorBanner = this.deleteModal.locator('[role="alert"]');

    this.contacts = new RelatedListControl(page, 'company-contacts');
    this.newContactDialog = new ObjectFormDialog(page, 'New contact person', 'contact-person-form');
    this.editContactDialog = new ObjectFormDialog(
      page,
      'Edit contact person',
      'contact-person-form',
    );

    this.phoneField = page.getByTestId('company-field-phone');
    this.emailField = page.getByTestId('company-field-email');
    this.addressField = page.getByTestId('company-field-address');
    this.nameField = page.getByTestId('company-field-name');
    this.notesField = page.getByTestId('company-field-notes');

    this.paymentsTotals = page.getByTestId('company-payments-totals');
    this.paidFigure = page.getByTestId('company-paid-figure');
    this.stillToPayFigure = page.getByTestId('company-still-to-pay-figure');
    this.stillToPayFigures = page.getByRole('main').locator('[data-figure="still-to-pay"]');
    this.submittedNote = page.getByTestId('company-submitted-note');
    this.invoices = new RelatedListControl(page, 'company-invoices');
    this.offers = new RelatedListControl(page, 'company-offers');
    this.progressPayments = new RelatedListControl(page, 'company-progress-payments');
    this.invoiceDeleteDialog = new ConfirmDialogControl(page, 'company-invoice-delete');
    this.paymentsEmpty = this.tabs
      .panel('payments')
      .getByText('No offers, invoices or payments for this company yet.');

    this.tasks = new RelatedListControl(page, 'company-tasks');
    this.purchases = new RelatedListControl(page, 'company-purchases');
    this.costLines = new RelatedListControl(page, 'company-cost-lines');

    this.diary = page.getByTestId('company-diary');
    this.diaryShowAll = page.getByTestId('company-diary-show-all');
    // ObjectHistorySection is a SectionCard without a test id: `section-<prefix>`
    this.history = page.getByTestId('section-company-history');
    this.historyShowAll = page.getByTestId('company-history-show-all');
  }

  /** Open the page (optionally on a tab) and wait for the header and the summary strip. */
  async goto(vendorId: string, tab?: CompanyTab): Promise<void> {
    const query = tab && tab !== 'overview' ? { tab } : undefined;
    await this.page.goto(routeUrl('company', { id: vendorId }, query));
    await this.pageTitle.waitFor({ state: 'visible' });
    await this.summary.root.waitFor({ state: 'visible' });
  }

  /** Navigate back to the list through the "Companies" trail link. */
  async goBackToVendors(): Promise<void> {
    await this.breadcrumbs.trailLink('Companies').click();
    // Compare the path only: below 1024px Back restores the list through history, which keeps
    // the list's own query string (e.g. ?q=...), so a glob on the full URL would never match
    await this.page.waitForURL((url) => url.pathname === routeUrl('companies'));
  }

  // ─── Delete ───────────────────────────────────────────────────────────────

  /** Open the delete confirmation through the header ⋯ menu. */
  async openDeleteModal(): Promise<void> {
    await this.header.chooseMenuItem('object-header-delete');
    await this.deleteDialog.waitForOpen();
  }

  async confirmDelete(): Promise<void> {
    await this.deleteConfirmButton.click();
  }

  async cancelDelete(): Promise<void> {
    await this.deleteCancelButton.click();
    await this.deleteModal.waitFor({ state: 'hidden' });
  }

  /** The delete error banner text, or null when it never appears. */
  async getDeleteErrorText(): Promise<string | null> {
    try {
      await this.deleteErrorBanner.waitFor({ state: 'visible' });
      return await this.deleteErrorBanner.textContent();
    } catch {
      return null;
    }
  }

  // ─── Overview cards ───────────────────────────────────────────────────────

  card(id: CompanyCard): Locator {
    return this.page.getByTestId(id);
  }

  cardEdit(id: CompanyCard): Locator {
    return this.page.getByTestId(`${id}-edit`);
  }

  cardForm(id: CompanyCard): Locator {
    return this.page.getByTestId(`${id}-form`);
  }

  cardSave(id: CompanyCard): Locator {
    return this.page.getByTestId(`${id}-save`);
  }

  cardCancel(id: CompanyCard): Locator {
    return this.page.getByTestId(`${id}-cancel`);
  }

  /** The read-mode value of a detail row (`phone|email|address|name|trade|notes|added-by`). */
  detail(row: 'phone' | 'email' | 'address' | 'name' | 'trade' | 'notes' | 'added-by'): Locator {
    return this.page.getByTestId(`company-detail-${row}`);
  }

  async startEdit(id: CompanyCard): Promise<void> {
    await this.cardEdit(id).click();
    await this.cardForm(id).waitFor({ state: 'visible' });
  }

  /** Save the open card and wait for it to return to its read view. */
  async saveCard(id: CompanyCard): Promise<void> {
    await this.cardSave(id).click();
    await this.cardForm(id).waitFor({ state: 'hidden' });
  }

  /** Cancel a card with no unsaved change. */
  async cancelCard(id: CompanyCard): Promise<void> {
    await this.cardCancel(id).click();
    await this.cardForm(id).waitFor({ state: 'hidden' });
  }

  /** Cancel a card that has unsaved changes: the Discard confirmation appears and is accepted. */
  async discardCard(id: CompanyCard): Promise<void> {
    await this.cardCancel(id).click();
    const confirm = new ConfirmDialogControl(this.page, `${id}-discard`);
    await confirm.waitForOpen();
    await confirm.confirmAndWaitClosed();
    await this.cardForm(id).waitFor({ state: 'hidden' });
  }

  // ─── Contact persons ──────────────────────────────────────────────────────

  /** A contact person's list row, found by the visible name. */
  contactRow(name: string): Locator {
    return this.contacts.rowWith(name);
  }

  private async fillContact(dialog: ObjectFormDialog, data: ContactPersonData): Promise<void> {
    const byTestId = (testId: string): Locator => dialog.dialog.getByTestId(testId);
    if (data.firstName !== undefined) {
      await byTestId('contact-person-first-name').fill(data.firstName);
    }
    if (data.lastName !== undefined) await byTestId('contact-person-last-name').fill(data.lastName);
    const more = [data.role, data.phone, data.email, data.notes].some((v) => v !== undefined);
    if (more) await dialog.expandMoreDetails();
    if (data.role !== undefined) await byTestId('contact-person-role').fill(data.role);
    if (data.phone !== undefined) await byTestId('contact-person-phone').fill(data.phone);
    if (data.email !== undefined) await byTestId('contact-person-email').fill(data.email);
    if (data.notes !== undefined) await byTestId('contact-person-notes').fill(data.notes);
  }

  async openNewContact(): Promise<void> {
    // The header button once a person exists, the EmptyState's own button while the list is empty
    await this.contacts.addButton.or(this.contacts.addAction('New contact person')).first().click();
    await this.newContactDialog.waitForOpen();
  }

  /** Add a contact person through the dialog and wait for it to close. */
  async addContact(data: ContactPersonData): Promise<void> {
    await this.openNewContact();
    await this.fillContact(this.newContactDialog, data);
    await this.newContactDialog.save();
    await this.newContactDialog.waitForClosed();
  }

  async openEditContact(contactId: string): Promise<void> {
    await this.contacts.editButton(contactId).click();
    await this.editContactDialog.waitForOpen();
  }

  /** Edit a contact person (fields given are overwritten) and wait for the dialog to close. */
  async editContact(contactId: string, data: ContactPersonData): Promise<void> {
    await this.openEditContact(contactId);
    await this.fillContact(this.editContactDialog, data);
    await this.editContactDialog.save();
    await this.editContactDialog.waitForClosed();
  }

  // ─── Payments ─────────────────────────────────────────────────────────────

  /** "New invoice": the Invoices list button, or the EmptyState button while nothing exists. */
  get newInvoiceButton(): Locator {
    return this.invoices.addButton
      .or(this.tabs.panel('payments').getByRole('button', { name: 'New invoice', exact: true }))
      .first();
  }

  /** The row ⋯ trigger of an invoice or offer, whichever list holds it. */
  recordActions(id: string): Locator {
    return this.invoices.actionsTrigger(id).or(this.offers.actionsTrigger(id));
  }

  /** The row ⋯ -> Delete item of an invoice or offer. */
  recordDeleteItem(id: string): Locator {
    return this.page.getByTestId(`company-invoice-delete-${id}`);
  }

  /** Open the delete confirmation of an invoice or offer through its row menu. */
  async openRecordDelete(id: string): Promise<void> {
    await this.recordActions(id).click();
    await this.recordDeleteItem(id).click();
    await this.invoiceDeleteDialog.waitForOpen();
  }

  /** The Payments tab once its lists have loaded (totals shown, or the EmptyState). */
  async waitForPaymentsLoaded(): Promise<void> {
    await expect(this.paymentsTotals.or(this.paymentsEmpty)).toBeVisible();
  }
}
