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

    // ─── Budget Line Picker locators (Issue #1401) ────────────────────────
    this.budgetLinePickerModal = page.locator('[role="dialog"][aria-labelledby="picker-title"]');

    this.pickerAddBudgetLineButton = this.budgetLinesSection.getByRole('button', {
      name: /\+ Add Budget Line/i,
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

  // ─── Budget Line Picker helpers (Issue #1401) ────────────────────────────

  /**
   * Open the budget line picker modal by clicking "+ Add Budget Line".
   * Waits for the modal to become visible.
   */
  async openBudgetLinePicker(): Promise<void> {
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
