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
    this.budgetLinesSection = page.locator('[class*="budgetLinesSection"]');

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
}
