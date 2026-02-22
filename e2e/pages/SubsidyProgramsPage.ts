/**
 * Page Object Model for the Subsidy Programs page (/budget/subsidies)
 *
 * The page renders:
 * - An h1 "Budget" page title
 * - BudgetSubNav
 * - An h2 "Subsidy Programs" section header with an "Add Program" button
 * - An inline create form (h2 "New Subsidy Program") toggled by "Add Program"
 *   - `#programName` (text, required)
 *   - `#reductionType` (select: "percentage" | "fixed")
 *   - `#reductionValue` (number, required — label changes by type)
 *   - `#applicationStatus` (select)
 *   - `#applicationDeadline` (date)
 *   - `#programDescription` (textarea)
 *   - `#programEligibility` (textarea)
 *   - `#programNotes` (textarea)
 *   - Category checkboxes (class `.categoryCheckboxList` > `.categoryCheckboxItem`)
 *   - "Create Program" / Cancel buttons
 * - A programs list (class `.programsList`) with inline edit forms per row
 * - A delete confirmation modal (role="dialog", aria-labelledby="delete-modal-title")
 * - Success/error banners (role="alert")
 */

import type { Page, Locator } from '@playwright/test';

export const SUBSIDY_PROGRAMS_ROUTE = '/budget/subsidies';

export interface CreateSubsidyProgramData {
  name: string;
  reductionType?: 'percentage' | 'fixed';
  reductionValue: number | string;
  applicationStatus?: 'eligible' | 'applied' | 'approved' | 'received' | 'rejected';
  applicationDeadline?: string; // YYYY-MM-DD
  description?: string;
  eligibility?: string;
  notes?: string;
  /** Names of categories to check in the checkbox list */
  categoryNames?: string[];
}

export class SubsidyProgramsPage {
  readonly page: Page;

  // Page heading
  readonly heading: Locator;

  // Section header
  readonly sectionTitle: Locator;
  readonly addProgramButton: Locator;

  // Create form (only visible after clicking "Add Program")
  readonly createFormHeading: Locator;
  readonly createNameInput: Locator;
  readonly createReductionTypeSelect: Locator;
  readonly createReductionValueInput: Locator;
  readonly createApplicationStatusSelect: Locator;
  readonly createApplicationDeadlineInput: Locator;
  readonly createDescriptionInput: Locator;
  readonly createEligibilityInput: Locator;
  readonly createNotesInput: Locator;
  readonly createSubmitButton: Locator;
  readonly createCancelButton: Locator;
  readonly createErrorBanner: Locator;

  // Category checkboxes (in the create form)
  readonly createCategoryCheckboxList: Locator;

  // Programs list
  readonly programsList: Locator;
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

    this.sectionTitle = page.getByRole('heading', {
      level: 2,
      name: 'Subsidy Programs',
      exact: true,
    });
    this.addProgramButton = page.getByRole('button', { name: 'Add Program', exact: true });

    // Create form — identified by its h2 heading "New Subsidy Program"
    this.createFormHeading = page.getByRole('heading', {
      level: 2,
      name: 'New Subsidy Program',
      exact: true,
    });

    this.createNameInput = page.locator('#programName');
    this.createReductionTypeSelect = page.locator('#reductionType');
    this.createReductionValueInput = page.locator('#reductionValue');
    this.createApplicationStatusSelect = page.locator('#applicationStatus');
    this.createApplicationDeadlineInput = page.locator('#applicationDeadline');
    this.createDescriptionInput = page.locator('#programDescription');
    this.createEligibilityInput = page.locator('#programEligibility');
    this.createNotesInput = page.locator('#programNotes');
    this.createSubmitButton = page.getByRole('button', { name: /Create Program|Creating\.\.\./ });

    // The Cancel button in the create form section — scoped to avoid matching edit form cancels
    // We use .first() because there may be cancel buttons in edit rows
    this.createCancelButton = page
      .getByRole('heading', { level: 2, name: 'New Subsidy Program', exact: true })
      .locator('..')
      .getByRole('button', { name: 'Cancel', exact: true });

    this.createErrorBanner = page
      .getByRole('heading', { level: 2, name: 'New Subsidy Program', exact: true })
      .locator('..')
      .locator('[role="alert"]');

    this.createCategoryCheckboxList = page.locator('[class*="categoryCheckboxList"]').first();

    // Programs list and empty state
    this.programsList = page.locator('[class*="programsList"]');
    this.emptyState = page.locator('p[class*="emptyState"]');

    // Global banners
    this.successBanner = page
      .locator('[role="alert"]')
      .filter({ hasText: /successfully/i })
      .first();
    this.errorBanner = page
      .locator('[role="alert"]')
      .filter({ hasText: /failed|error/i })
      .first();

    // Delete modal
    this.deleteModal = page.getByRole('dialog', { name: 'Delete Subsidy Program' });
    this.deleteModalTitle = page.locator('#delete-modal-title');
    this.deleteConfirmButton = this.deleteModal.getByRole('button', {
      name: /Delete Program|Deleting\.\.\./,
    });
    this.deleteCancelButton = this.deleteModal.getByRole('button', {
      name: 'Cancel',
      exact: true,
    });
    this.deleteErrorBanner = this.deleteModal.locator('[role="alert"]');
  }

  async goto(): Promise<void> {
    await this.page.goto(SUBSIDY_PROGRAMS_ROUTE);
    // No explicit timeout — uses project-level actionTimeout (15s for WebKit).
    await this.heading.waitFor({ state: 'visible' });
  }

  /**
   * Wait for the programs list to settle — at least one program row visible,
   * or the empty state visible.
   * No explicit timeout — uses project-level actionTimeout (15s for WebKit).
   */
  async waitForProgramsLoaded(): Promise<void> {
    await Promise.race([
      this.page.locator('[class*="programRow"]').first().waitFor({ state: 'visible' }),
      this.emptyState.waitFor({ state: 'visible' }),
    ]);
  }

  /**
   * Open the create form by clicking "Add Program".
   * No explicit timeout — uses project-level actionTimeout (15s for WebKit).
   */
  async openCreateForm(): Promise<void> {
    await this.addProgramButton.click();
    await this.createFormHeading.waitFor({ state: 'visible' });
  }

  /**
   * Fill and submit the create program form.
   * `name` and `reductionValue` are required; other fields are optional.
   */
  async createProgram(data: CreateSubsidyProgramData): Promise<void> {
    await this.createNameInput.fill(data.name);

    if (data.reductionType !== undefined) {
      await this.createReductionTypeSelect.selectOption(data.reductionType);
    }

    await this.createReductionValueInput.fill(String(data.reductionValue));

    if (data.applicationStatus !== undefined) {
      await this.createApplicationStatusSelect.selectOption(data.applicationStatus);
    }
    if (data.applicationDeadline !== undefined) {
      await this.createApplicationDeadlineInput.fill(data.applicationDeadline);
    }
    if (data.description !== undefined) {
      await this.createDescriptionInput.fill(data.description);
    }
    if (data.eligibility !== undefined) {
      await this.createEligibilityInput.fill(data.eligibility);
    }
    if (data.notes !== undefined) {
      await this.createNotesInput.fill(data.notes);
    }

    // Check category checkboxes by label text
    if (data.categoryNames && data.categoryNames.length > 0) {
      for (const categoryName of data.categoryNames) {
        const checkbox = this.createCategoryCheckboxList.locator('label').filter({
          hasText: categoryName,
        });
        await checkbox.locator('input[type="checkbox"]').check();
      }
    }

    await this.createSubmitButton.click();
  }

  /**
   * Get all program row locators from the programs list.
   */
  async getProgramRows(): Promise<Locator[]> {
    return await this.page.locator('[class*="programRow"]').all();
  }

  /**
   * Get the display names of all programs shown in the list.
   */
  async getProgramNames(): Promise<string[]> {
    const nameLocators = await this.page.locator('[class*="programName"]').all();
    const names: string[] = [];
    for (const loc of nameLocators) {
      const text = await loc.textContent();
      if (text) names.push(text.trim());
    }
    return names;
  }

  /**
   * Find the program row that contains the given program name.
   * Returns null if not found.
   * No explicit timeout — uses project-level actionTimeout (15s for WebKit).
   */
  async getProgramRow(name: string): Promise<Locator | null> {
    try {
      await this.page.locator('[class*="programRow"]').first().waitFor({ state: 'visible' });
    } catch {
      return null;
    }
    const rows = await this.getProgramRows();
    for (const row of rows) {
      const nameEl = row.locator('[class*="programName"]');
      const count = await nameEl.count();
      if (count === 0) continue; // row is in edit mode
      const text = await nameEl.textContent();
      if (text?.trim() === name) return row;
    }
    return null;
  }

  /**
   * Click the Edit button for the named program to enter inline edit mode.
   * No explicit timeout — uses project-level actionTimeout (15s for WebKit).
   */
  async startEdit(name: string): Promise<void> {
    await this.page.getByRole('button', { name: `Edit ${name}`, exact: true }).click();
    await this.page.getByRole('form', { name: `Edit ${name}` }).waitFor({ state: 'visible' });
  }

  /**
   * Get the inline edit form locator for the program currently being edited.
   */
  getEditForm(name: string): Locator {
    return this.page.getByRole('form', { name: `Edit ${name}` });
  }

  /**
   * Click Save within the active edit form for the named program.
   */
  async saveEdit(name: string): Promise<void> {
    const form = this.getEditForm(name);
    await form.getByRole('button', { name: /^Save$|^Saving\.\.\.$/ }).click();
  }

  /**
   * Click Cancel within the active edit form for the named program.
   */
  async cancelEdit(name: string): Promise<void> {
    const form = this.getEditForm(name);
    await form.getByRole('button', { name: 'Cancel', exact: true }).click();
  }

  /**
   * Open the delete confirmation modal for the program with the given name.
   * No explicit timeout — uses project-level actionTimeout (15s for WebKit).
   */
  async openDeleteModal(name: string): Promise<void> {
    await this.page
      .getByRole('button', { name: `Delete ${name}`, exact: true })
      .first()
      .click();
    await this.deleteModal.waitFor({ state: 'visible' });
  }

  /**
   * Confirm deletion by clicking "Delete Program" in the modal.
   */
  async confirmDelete(): Promise<void> {
    await this.deleteConfirmButton.click();
  }

  /**
   * Cancel deletion — click "Cancel" and wait for the modal to close.
   * No explicit timeout — uses project-level actionTimeout (15s for WebKit).
   */
  async cancelDelete(): Promise<void> {
    await this.deleteCancelButton.click();
    await this.deleteModal.waitFor({ state: 'hidden' });
  }

  /**
   * Get the visible success banner text, or null if not present.
   * No explicit timeout — uses project-level actionTimeout (15s for WebKit).
   */
  async getSuccessBannerText(): Promise<string | null> {
    try {
      await this.successBanner.waitFor({ state: 'visible' });
      return await this.successBanner.textContent();
    } catch {
      return null;
    }
  }

  /**
   * Get the create form error banner text, or null if not visible.
   * No explicit timeout — uses project-level actionTimeout (15s for WebKit).
   */
  async getCreateErrorText(): Promise<string | null> {
    try {
      await this.createErrorBanner.waitFor({ state: 'visible' });
      return await this.createErrorBanner.textContent();
    } catch {
      return null;
    }
  }

  /**
   * Get the delete modal error banner text, or null if not visible.
   * No explicit timeout — uses project-level actionTimeout (15s for WebKit).
   */
  async getDeleteErrorText(): Promise<string | null> {
    try {
      await this.deleteErrorBanner.waitFor({ state: 'visible' });
      return await this.deleteErrorBanner.textContent();
    } catch {
      return null;
    }
  }

  /**
   * Get the Programs count shown in the "Programs (N)" heading inside the list card.
   */
  async getProgramsCount(): Promise<number> {
    const heading = this.page.getByRole('heading', { level: 2, name: /^Programs \(/ });
    const text = await heading.textContent();
    const match = text?.match(/\((\d+)\)/);
    return match ? parseInt(match[1], 10) : 0;
  }

  /**
   * Get the category checkbox labels visible in the create form's checkbox list.
   */
  async getCreateFormCategoryNames(): Promise<string[]> {
    const labels = await this.createCategoryCheckboxList
      .locator('[class*="categoryCheckboxLabel"]')
      .all();
    const names: string[] = [];
    for (const label of labels) {
      const text = await label.textContent();
      if (text) names.push(text.trim());
    }
    return names;
  }
}
