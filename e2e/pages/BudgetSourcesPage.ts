/**
 * Page Object Model for the Budget Sources page (/budget/sources)
 *
 * The page renders:
 * - An h1 "Budget" page title
 * - BudgetSubNav
 * - An h2 "Sources" section header with an "Add Source" button
 * - An inline create form (h2 "New Budget Source") toggled by "Add Source"
 * - A sources list (class `.sourcesList`) with inline edit forms per row
 * - A delete confirmation modal (role="dialog", aria-labelledby="delete-modal-title")
 * - Success/error banners (role="alert")
 */

import type { Page, Locator } from '@playwright/test';

export const BUDGET_SOURCES_ROUTE = '/budget/sources';

export interface CreateBudgetSourceData {
  name: string;
  sourceType?: 'bank_loan' | 'credit_line' | 'savings' | 'other';
  status?: 'active' | 'exhausted' | 'closed';
  totalAmount: number | string;
  interestRate?: number | string;
  terms?: string;
  notes?: string;
}

export class BudgetSourcesPage {
  readonly page: Page;

  // Page heading
  readonly heading: Locator;

  // Section header
  readonly sectionTitle: Locator;
  readonly addSourceButton: Locator;

  // Create form (only visible after clicking "Add Source")
  readonly createForm: Locator;
  readonly createFormHeading: Locator;
  readonly createNameInput: Locator;
  readonly createTypeSelect: Locator;
  readonly createStatusSelect: Locator;
  readonly createTotalAmountInput: Locator;
  readonly createInterestRateInput: Locator;
  readonly createTermsInput: Locator;
  readonly createNotesInput: Locator;
  readonly createSubmitButton: Locator;
  readonly createCancelButton: Locator;
  readonly createErrorBanner: Locator;

  // Sources list
  readonly sourcesList: Locator;
  readonly emptyState: Locator;

  // Global banners
  readonly successBanner: Locator;
  readonly errorBanner: Locator;

  // Delete modal
  readonly deleteModal: Locator;
  readonly deleteModalTitle: Locator;
  readonly deleteConfirmButton: Locator;
  readonly deleteCancelButton: Locator;
  readonly deleteErrorBanner: Locator;

  constructor(page: Page) {
    this.page = page;

    this.heading = page.getByRole('heading', { level: 1, name: 'Budget', exact: true });

    this.sectionTitle = page.getByRole('heading', { level: 2, name: 'Sources', exact: true });
    this.addSourceButton = page.getByRole('button', { name: 'Add Source', exact: true });

    // Create form — identified by its h2 heading "New Budget Source"
    this.createFormHeading = page.getByRole('heading', {
      level: 2,
      name: 'New Budget Source',
      exact: true,
    });
    // The form is inside the same card section as the heading
    this.createForm = page
      .getByRole('heading', { level: 2, name: 'New Budget Source', exact: true })
      .locator('..'); // parent section.card

    this.createNameInput = page.locator('#sourceName');
    this.createTypeSelect = page.locator('#sourceType');
    this.createStatusSelect = page.locator('#sourceStatus');
    this.createTotalAmountInput = page.locator('#sourceTotalAmount');
    this.createInterestRateInput = page.locator('#sourceInterestRate');
    this.createTermsInput = page.locator('#sourceTerms');
    this.createNotesInput = page.locator('#sourceNotes');
    this.createSubmitButton = page.getByRole('button', { name: /Create Source|Creating\.\.\./ });
    // The Cancel button inside the create form — scope it to the form heading's ancestor
    this.createCancelButton = this.createForm.getByRole('button', { name: 'Cancel', exact: true });
    this.createErrorBanner = this.createForm.locator('[role="alert"]');

    // Sources list section and empty state
    this.sourcesList = page.locator('[class*="sourcesList"]');
    this.emptyState = page.locator('p[class*="emptyState"]');

    // Global banners — the success/error banners in the main content area
    this.successBanner = page
      .locator('[role="alert"]')
      .filter({ hasText: /successfully/i })
      .first();
    this.errorBanner = page
      .locator('[role="alert"]')
      .filter({ hasText: /failed|error/i })
      .first();

    // Delete modal
    this.deleteModal = page.getByRole('dialog', { name: 'Delete Budget Source' });
    this.deleteModalTitle = page.locator('#delete-modal-title');
    this.deleteConfirmButton = this.deleteModal.getByRole('button', {
      name: /Delete Source|Deleting\.\.\./,
    });
    this.deleteCancelButton = this.deleteModal.getByRole('button', {
      name: 'Cancel',
      exact: true,
    });
    this.deleteErrorBanner = this.deleteModal.locator('[role="alert"]');
  }

  async goto(): Promise<void> {
    await this.page.goto(BUDGET_SOURCES_ROUTE);
    await this.heading.waitFor({ state: 'visible', timeout: 5000 });
  }

  /**
   * Open the create form by clicking "Add Source".
   */
  async openCreateForm(): Promise<void> {
    await this.addSourceButton.click();
    await this.createFormHeading.waitFor({ state: 'visible', timeout: 5000 });
  }

  /**
   * Fill and submit the create source form.
   * `name` and `totalAmount` are required; other fields are optional.
   */
  async createSource(data: CreateBudgetSourceData): Promise<void> {
    await this.createNameInput.fill(data.name);
    if (data.sourceType !== undefined) {
      await this.createTypeSelect.selectOption(data.sourceType);
    }
    if (data.status !== undefined) {
      await this.createStatusSelect.selectOption(data.status);
    }
    await this.createTotalAmountInput.fill(String(data.totalAmount));
    if (data.interestRate !== undefined) {
      await this.createInterestRateInput.fill(String(data.interestRate));
    }
    if (data.terms !== undefined) {
      await this.createTermsInput.fill(data.terms);
    }
    if (data.notes !== undefined) {
      await this.createNotesInput.fill(data.notes);
    }
    await this.createSubmitButton.click();
  }

  /**
   * Wait for the sources list to be in a settled state — either at least one
   * source row is visible, or the empty state paragraph is visible.
   */
  async waitForSourcesLoaded(): Promise<void> {
    await Promise.race([
      this.sourcesList
        .locator('[class*="sourceRow"]')
        .first()
        .waitFor({ state: 'visible', timeout: 5000 }),
      this.emptyState.waitFor({ state: 'visible', timeout: 5000 }),
    ]);
  }

  /**
   * Get all source row locators from the sources list.
   */
  async getSourceRows(): Promise<Locator[]> {
    return await this.page.locator('[class*="sourceRow"]').all();
  }

  /**
   * Get the display name text of every source currently shown in the list.
   * Reads from the `.sourceName` span within each non-editing row.
   */
  async getSourceNames(): Promise<string[]> {
    const nameLocators = await this.page.locator('[class*="sourceName"]').all();
    const names: string[] = [];
    for (const loc of nameLocators) {
      const text = await loc.textContent();
      if (text) names.push(text.trim());
    }
    return names;
  }

  /**
   * Find the source row that contains the given source name.
   * Returns null if not found.
   */
  async getSourceRow(name: string): Promise<Locator | null> {
    try {
      await this.page
        .locator('[class*="sourceRow"]')
        .first()
        .waitFor({ state: 'visible', timeout: 5000 });
    } catch {
      return null;
    }
    const rows = await this.getSourceRows();
    for (const row of rows) {
      const nameEl = row.locator('[class*="sourceName"]');
      const count = await nameEl.count();
      if (count === 0) continue; // row is in edit mode — no sourceName span
      const text = await nameEl.textContent();
      if (text?.trim() === name) return row;
    }
    return null;
  }

  /**
   * Click the Edit button for the named source to enter inline edit mode.
   */
  async startEdit(name: string): Promise<void> {
    await this.page.getByRole('button', { name: `Edit ${name}`, exact: true }).click();
    // Wait for the edit form (identified by its aria-label)
    await this.page
      .getByRole('form', { name: `Edit ${name}` })
      .waitFor({ state: 'visible', timeout: 5000 });
  }

  /**
   * Get the inline edit form locator for the source currently being edited.
   */
  getEditForm(name: string): Locator {
    return this.page.getByRole('form', { name: `Edit ${name}` });
  }

  /**
   * Click the Save button within the active edit form for the named source.
   */
  async saveEdit(name: string): Promise<void> {
    const form = this.getEditForm(name);
    await form.getByRole('button', { name: /^Save$|^Saving\.\.\.$/ }).click();
  }

  /**
   * Click the Cancel button within the active edit form for the named source.
   */
  async cancelEdit(name: string): Promise<void> {
    const form = this.getEditForm(name);
    await form.getByRole('button', { name: 'Cancel', exact: true }).click();
  }

  /**
   * Open the delete confirmation modal for the source with the given name.
   */
  async openDeleteModal(name: string): Promise<void> {
    await this.page
      .getByRole('button', { name: `Delete ${name}`, exact: true })
      .first()
      .click();
    await this.deleteModal.waitFor({ state: 'visible', timeout: 5000 });
  }

  /**
   * Confirm deletion by clicking "Delete Source" in the modal.
   */
  async confirmDelete(): Promise<void> {
    await this.deleteConfirmButton.click();
  }

  /**
   * Cancel deletion — click "Cancel" and wait for the modal to close.
   */
  async cancelDelete(): Promise<void> {
    await this.deleteCancelButton.click();
    await this.deleteModal.waitFor({ state: 'hidden', timeout: 5000 });
  }

  /**
   * Get the visible success banner text, or null if not present.
   */
  async getSuccessBannerText(): Promise<string | null> {
    try {
      await this.successBanner.waitFor({ state: 'visible', timeout: 5000 });
      return await this.successBanner.textContent();
    } catch {
      return null;
    }
  }

  /**
   * Get the create form error banner text, or null if not visible.
   */
  async getCreateErrorText(): Promise<string | null> {
    try {
      await this.createErrorBanner.waitFor({ state: 'visible', timeout: 5000 });
      return await this.createErrorBanner.textContent();
    } catch {
      return null;
    }
  }

  /**
   * Get the delete modal error banner text, or null if not visible.
   */
  async getDeleteErrorText(): Promise<string | null> {
    try {
      await this.deleteErrorBanner.waitFor({ state: 'visible', timeout: 5000 });
      return await this.deleteErrorBanner.textContent();
    } catch {
      return null;
    }
  }
}
