/**
 * Component POM for the New invoice / New offer dialog and the Edit details dialog of an invoice
 * or offer (#2241). Both are the shared ObjectForm: a `Modal` from 768 px, a full-screen `Sheet`
 * below (panel test id `<testId>-sheet`).
 *
 * - Create: test id `invoice-form`, title "New invoice" / "New offer", opened in place by the
 *   App-root provider (New menu, Money › Invoices primary, Company page, task / purchase Cost
 *   lines). Fields: Start from a document (Paperless only), Company, Number, Amount, Date,
 *   Due date, Status (invoices only), For task / purchase, Notes (behind More details), Add another.
 * - Edit: test id `invoice-edit-form`, title "Edit details": no document or item row, no Add
 *   another, every field visible. An offer has no Status field in either mode.
 *
 * Field DOM ids are the schema field names (`#vendorId`, `#invoiceNumber`, `#amount`, `#date`,
 * `#dueDate`, `#status`, `#costLine`, `#notes`, `#paperlessDocumentId`).
 */

import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { CompanyPickerControl } from './CompanyPickerControl.js';
import { EntityPickerControl } from './EntityPickerControl.js';
import { ObjectFormDialog } from './ObjectFormDialog.js';

export type InvoiceFormMode = 'invoice' | 'offer' | 'edit';

/** The dialog name per mode ("Edit details" names the edit dialog of an invoice and an offer). */
const TITLES: Record<InvoiceFormMode, string> = {
  invoice: 'New invoice',
  offer: 'New offer',
  edit: 'Edit details',
};

export class InvoiceFormDialog extends ObjectFormDialog {
  readonly mode: InvoiceFormMode;
  /** Company EntityPicker (`#vendorId`) with the inline "New company" row. */
  readonly company: CompanyPickerControl;
  /** Paperless document EntityPicker (`#paperlessDocumentId`; absent with Paperless off). */
  readonly documentPicker: EntityPickerControl;
  /** "For task / purchase" EntityPicker (`#costLine`; create only). */
  readonly forItem: EntityPickerControl;
  readonly number: Locator;
  readonly amount: Locator;
  readonly date: Locator;
  readonly dueDate: Locator;
  readonly status: Locator;
  readonly notes: Locator;
  /**
   * The New company form: a child step of this same dialog (dialogs never stack), so it keeps the
   * parent's test ids and only the title changes. `backButton` returns to the invoice form.
   */
  readonly companyChild: ObjectFormDialog;
  /** "Read amounts and lines with AI" link shown once a document is picked and the LLM is on. */
  readonly readWithAi: Locator;

  constructor(page: Page, mode: InvoiceFormMode = 'invoice') {
    super(page, TITLES[mode], mode === 'edit' ? 'invoice-edit-form' : 'invoice-form');
    this.mode = mode;
    this.company = new CompanyPickerControl(page, 'vendorId', this.dialog);
    this.documentPicker = new EntityPickerControl(page, 'paperlessDocumentId', this.dialog);
    this.forItem = new EntityPickerControl(page, 'costLine', this.dialog);
    this.number = this.dialog.locator('#invoiceNumber');
    this.amount = this.dialog.locator('#amount');
    this.date = this.dialog.locator('#date');
    this.dueDate = this.dialog.locator('#dueDate');
    this.status = this.dialog.locator('#status');
    this.notes = this.dialog.locator('#notes');
    this.companyChild = new ObjectFormDialog(page, 'New company', this.testId);
    this.readWithAi = this.dialog.getByTestId('invoice-form-read-ai');
  }

  /** The dialog of whichever create kind is open (title "New invoice" or "New offer"). */
  static anyCreate(page: Page): Locator {
    return page.getByRole('dialog', { name: /^New (invoice|offer)$/ });
  }

  /** The selected-company chip (shown once a company is chosen or pre-filled). */
  companyChip(): Locator {
    return this.company.selectedDisplay();
  }

  /** The "For task / purchase" chip. */
  itemChip(): Locator {
    return this.forItem.selectedDisplay();
  }

  /** The "Start from a document" chip. */
  documentChip(): Locator {
    return this.documentPicker.selectedDisplay();
  }

  /** The hint under "For task / purchase" ("One cost line of €… on ‹title›"). */
  itemHint(): Locator {
    return this.dialog.getByText(/One cost line of|Creates one cost line/);
  }

  /** Type `text` in Company, take the "New company" row by keyboard and wait for the child step. */
  async openNewCompany(text: string): Promise<void> {
    await this.company.type(text);
    await this.company.arrowToCreateOption(text);
    await this.page.keyboard.press('Enter');
    await this.companyChild.waitForOpen();
  }

  /** Pick an existing company by keyboard (clears a pre-filled chip first). */
  async pickCompany(name: string): Promise<void> {
    if (await this.companyChip().isVisible()) {
      await this.companyChip().getByRole('button', { name: 'Clear selection' }).click();
    }
    await this.company.pick(name);
    await expect(this.companyChip()).toContainText(name);
  }

  /** Pick a task or purchase by keyboard. */
  async pickItem(title: string): Promise<void> {
    await this.forItem.pick(title);
    await expect(this.itemChip()).toContainText(title);
  }

  /** Pick a Paperless document by title (keyboard path). */
  async pickDocument(title: string): Promise<void> {
    // Initial focus is on Company, whose list opens with it; click into the document field first,
    // like a user (focus leaving Company closes its list), so exactly one listbox is open.
    await this.documentPicker.input.click();
    await this.documentPicker.pick(title);
    await expect(this.documentChip()).toContainText(title);
  }

  /**
   * Fill the common fields. Only the given ones are touched; Notes opens More details. `status`
   * and `notes` need the field to exist (no status on an offer).
   */
  async fill(data: {
    company?: string;
    number?: string;
    amount?: string;
    date?: string;
    dueDate?: string;
    status?: string;
    notes?: string;
  }): Promise<void> {
    if (data.company !== undefined) await this.pickCompany(data.company);
    if (data.number !== undefined) await this.number.fill(data.number);
    if (data.amount !== undefined) await this.amount.fill(data.amount);
    if (data.date !== undefined) await this.date.fill(data.date);
    if (data.dueDate !== undefined) await this.dueDate.fill(data.dueDate);
    if (data.status !== undefined) await this.status.selectOption(data.status);
    if (data.notes !== undefined) {
      await this.expandMoreDetails();
      await this.notes.fill(data.notes);
    }
  }

  /**
   * Save a create form and return the new record's id from the 201 response; the provider then
   * navigates to the invoice page and the dialog closes.
   */
  async saveAndGetId(): Promise<string> {
    const created = this.page.waitForResponse(
      (resp) =>
        /\/api\/vendors\/[^/]+\/invoices$/.test(resp.url()) &&
        resp.request().method() === 'POST' &&
        resp.status() === 201,
    );
    await this.saveButton.click();
    const body = (await (await created).json()) as { id?: string; invoice?: { id: string } };
    const id = body.invoice?.id ?? body.id;
    if (!id) throw new Error('create invoice response carried no id');
    await this.waitForClosed();
    return id;
  }
}
