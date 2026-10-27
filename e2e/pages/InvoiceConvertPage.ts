/**
 * Page Object Model for the Convert page (#2240)
 * Route: /budget/invoices/:id/convert (`invoiceConvert`)
 *
 * Converting an offer (status `quotation`) into the final invoice is a page, not a dialog.
 * Cards: Document (only while Paperless works), Final invoice details, Cost lines (Offered ·
 * Proposed · Keep, grouped by task/purchase), Progress payments (only when the offer has
 * progress payments; Refund due block + Add refund) and the sticky action bar (Cancel, Convert).
 *
 * Test ids: the line parts are built with `dataTableTestId`, so the card surface (phone/narrow
 * container) carries `-mobile-` (`convert-lines-input-<lineId>` vs `convert-lines-input-mobile-<lineId>`);
 * both surfaces are mounted, so the line locators here return the visible one. The line id is the
 * INVOICE budget line id (`GET /api/invoices/:id/budget-lines`), not the budget line id.
 *
 * Convert is `aria-disabled` while there are problems (never `disabled`): clicking it focuses the
 * first problem and posts nothing. A Refund due never blocks it (#2188).
 */

import type { Page, Locator } from '@playwright/test';
import { routeUrl } from '../../shared/src/routes/index.js';
import { BreadcrumbsBar } from './BreadcrumbsBar.js';
import { ConfirmDialogControl } from './components/ConfirmDialogControl.js';
import { EntityPickerControl } from './components/EntityPickerControl.js';
import { ToastRegion } from './components/ToastRegion.js';

export type ConvertField = 'amount' | 'date' | 'invoiceNumber' | 'dueDate' | 'notes';

const FIELD_LABELS: Record<ConvertField, string> = {
  amount: 'Final amount',
  date: 'Invoice date',
  invoiceNumber: 'Invoice number',
  dueDate: 'Due date',
  notes: 'Notes',
};

export class InvoiceConvertPage {
  readonly page: Page;
  readonly breadcrumbs: BreadcrumbsBar;
  readonly toasts: ToastRegion;

  readonly root: Locator;
  readonly heading: Locator;
  readonly intro: Locator;

  // Document card
  readonly document: Locator;
  /** The "Source document" EntityPicker (`#convert-document-picker`, kind document; #2241). */
  readonly documentPicker: EntityPickerControl;
  /** The picker's text input (present while no document is chosen). */
  readonly selectDocument: Locator;
  /** The chosen document's chip. */
  readonly selectedDocument: Locator;
  /** The chip's "Clear selection" button: it removes the document. */
  readonly removeDocument: Locator;
  readonly readAmounts: Locator;
  readonly readStatus: Locator;
  readonly readError: Locator;
  readonly readRetry: Locator;
  readonly readMismatch: Locator;

  // Details card
  readonly details: Locator;
  readonly finalAmount: Locator;
  readonly date: Locator;
  readonly invoiceNumber: Locator;
  readonly dueDate: Locator;
  readonly notes: Locator;
  readonly difference: Locator;
  readonly statusPending: Locator;
  readonly statusPaid: Locator;

  // Cost lines card
  readonly linesCard: Locator;
  readonly keepAll: Locator;
  readonly resetProposal: Locator;
  readonly linesEmpty: Locator;

  // Progress payments card
  readonly payments: Locator;
  readonly progressPayments: Locator;
  readonly finalPayment: Locator;
  readonly refundDue: Locator;
  readonly addRefund: Locator;
  readonly refundRecorded: Locator;

  // Actions
  readonly actions: Locator;
  readonly cancel: Locator;
  readonly confirm: Locator;
  readonly saveError: Locator;
  readonly problems: Locator;
  readonly discardDialog: ConfirmDialogControl;

  // States
  readonly notFound: Locator;
  readonly notAnOffer: Locator;
  readonly loadError: Locator;
  readonly loadRetry: Locator;

  constructor(page: Page) {
    this.page = page;
    this.breadcrumbs = new BreadcrumbsBar(page);
    this.toasts = new ToastRegion(page);

    this.root = page.getByTestId('convert-page');
    this.heading = page.getByRole('heading', { level: 1 });
    this.intro = page.locator('p[class*="intro"]');

    this.document = page.getByTestId('convert-document');
    this.documentPicker = new EntityPickerControl(page, 'convert-document-picker');
    this.selectDocument = this.documentPicker.input;
    this.selectedDocument = this.documentPicker.selectedDisplay();
    this.removeDocument = this.document.getByRole('button', {
      name: 'Clear selection',
      exact: true,
    });
    this.readAmounts = page.getByTestId('convert-ai-prefill');
    this.readStatus = page.getByTestId('convert-read-status');
    this.readError = page.getByTestId('convert-ai-error');
    this.readRetry = page.getByTestId('convert-ai-retry');
    this.readMismatch = page.getByTestId('convert-ai-mismatch');

    this.details = page.getByTestId('convert-details');
    this.finalAmount = page.getByTestId('convert-final-amount');
    this.date = page.getByTestId('convert-date');
    this.invoiceNumber = page.getByTestId('convert-invoice-number');
    this.dueDate = page.getByTestId('convert-due-date');
    this.notes = page.getByTestId('convert-notes');
    this.difference = page.getByTestId('convert-difference');
    this.statusPending = page.getByTestId('convert-status-pending');
    this.statusPaid = page.getByTestId('convert-status-paid');

    this.linesCard = page.getByTestId('convert-lines-card');
    this.keepAll = page.getByTestId('convert-keep-all');
    this.resetProposal = page.getByTestId('convert-reset-proposal');
    this.linesEmpty = page.getByTestId('convert-lines-empty');

    this.payments = page.getByTestId('convert-payments');
    this.progressPayments = page.getByTestId('convert-progress-payments');
    this.finalPayment = page.getByTestId('convert-final-payment');
    this.refundDue = page.getByTestId('convert-refund-due');
    this.addRefund = page.getByTestId('convert-add-refund');
    this.refundRecorded = page.getByTestId('convert-refund-recorded');

    this.actions = page.getByTestId('convert-actions');
    this.cancel = page.getByTestId('convert-cancel');
    this.confirm = page.getByTestId('convert-confirm');
    this.saveError = page.getByTestId('convert-save-error');
    this.problems = page.getByTestId('convert-problems');
    this.discardDialog = new ConfirmDialogControl(page, 'convert-discard');

    this.notFound = page.getByTestId('convert-not-found');
    this.notAnOffer = page.getByTestId('convert-not-offer');
    this.loadError = page.getByTestId('convert-error');
    this.loadRetry = page.getByTestId('convert-retry');
  }

  /** Navigate to the page for an offer and wait for the form (the h1 is "Convert to final invoice"). */
  async goto(id: string): Promise<void> {
    await this.page.goto(routeUrl('invoiceConvert', { id }));
    await this.root.waitFor({ state: 'visible' });
  }

  /** Navigate without waiting for the form (not-an-offer / not-found states). */
  async gotoRaw(id: string): Promise<void> {
    await this.page.goto(routeUrl('invoiceConvert', { id }));
    await this.heading.waitFor({ state: 'visible' });
  }

  /** The SuggestionBadge "Apply" button of a details field (present only while it is offered). */
  suggestion(field: ConvertField): Locator {
    return this.details.getByRole('button', {
      name: new RegExp(`Apply ${FIELD_LABELS[field]} suggestion`, 'i'),
    });
  }

  // ─── Cost lines (both surfaces are mounted; the visible one is returned) ─────────

  private part(prefix: string, id: string): Locator {
    return this.page
      .locator(`[data-testid="${prefix}-${id}"], [data-testid="${prefix}-mobile-${id}"]`)
      .visible();
  }

  /** Proposed-amount input of an invoice budget line. */
  lineInput(id: string): Locator {
    return this.part('convert-lines-input', id);
  }

  /** "Keep as offered" checkbox of an invoice budget line. */
  lineKeep(id: string): Locator {
    return this.part('convert-lines-keep', id);
  }

  /** Inline error of a line. */
  lineError(id: string): Locator {
    return this.part('convert-lines-error', id);
  }

  /** The row (table `tr`) or card (`li`) of a line. */
  lineRow(id: string): Locator {
    return this.part('convert-lines-row', id);
  }

  /** Table-surface row of a line (hidden on the card surface). */
  tableRow(id: string): Locator {
    return this.page.getByTestId(`convert-lines-row-${id}`);
  }

  /** Card-surface row of a line (hidden on the table surface). */
  cardRow(id: string): Locator {
    return this.page.getByTestId(`convert-lines-row-mobile-${id}`);
  }

  /** The heading row of a task/purchase group (table or card surface, whichever is visible). */
  group(groupId: string): Locator {
    return this.part('convert-lines-group', groupId);
  }

  /** The remainder text ("‹n› not yet split", "‹n› more than the final amount", "Nothing left to split"). */
  remainder(): Locator {
    return this.part('convert-lines-remainder', 'all');
  }

  /** The proposed total of all lines. */
  proposedTotal(): Locator {
    return this.part('convert-lines-total-proposed', 'all');
  }

  /** The offered total of all lines. */
  offeredTotal(): Locator {
    return this.part('convert-lines-total-offered', 'all');
  }

  // ─── Actions ─────────────────────────────────────────────────────────────────

  /** Clicks Convert and waits for the POST convert-quotation response; returns its HTTP status. */
  async convert(): Promise<number> {
    const responsePromise = this.page.waitForResponse(
      (resp) => resp.url().includes('/convert-quotation') && resp.request().method() === 'POST',
    );
    await this.confirm.click();
    const response = await responsePromise;
    return response.status();
  }
}
