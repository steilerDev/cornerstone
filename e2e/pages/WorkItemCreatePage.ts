/**
 * Page Object Model for the Work Item Create page (/work-items/new)
 *
 * The page renders:
 * - A header with a back button ("← Back to Work Items", a <button> not a <Link>)
 *   and h1 "Create Work Item"
 * - A form with all work item fields:
 *   - #title (text, required) — shows .inputError and .errorText when empty on submit
 *   - #description (textarea)
 *   - #status (select)
 *   - #assignedUserId (select)
 *   - #startDate, #endDate (date inputs)
 *   - #durationDays (number)
 *   - #startAfter, #startBefore (date inputs)
 *   - Tags: TagPicker component
 *   - Budget section (h2 "Budget"): #plannedBudget, #actualCost, #confidencePercent,
 *     #budgetCategoryId, #budgetSourceId
 *   - Dependencies: DependencySentenceBuilder
 * - Submit button (class submitButton): text "Create Work Item" / "Creating..."
 * - Cancel button (class cancelButton): text "Cancel"
 * - Error banner (class errorBanner) for server-side errors
 * - Validation error text (class errorText) per field
 *
 * Key DOM observations from source code:
 * - Back button is a <button> with onClick navigate('/work-items'), NOT a <Link>
 * - Submit button is type="submit" disabled during isSubmitting
 * - Cancel button is type="button" disabled during isSubmitting
 * - There is no submit-disabled state for empty title at field level — the form
 *   runs validateForm() on submit and shows errorText below #title
 * - The submit button text changes to "Creating..." while submitting
 * - On success, navigates to /work-items/:id (the newly created item's detail page)
 */

import type { Page, Locator } from '@playwright/test';

export const WORK_ITEM_CREATE_ROUTE = '/work-items/new';

export interface WorkItemFormData {
  title?: string;
  description?: string;
  status?: string;
  assignedUserId?: string;
  startDate?: string;
  endDate?: string;
  durationDays?: string;
  startAfter?: string;
  startBefore?: string;
  plannedBudget?: string;
  actualCost?: string;
  confidencePercent?: string;
}

export class WorkItemCreatePage {
  readonly page: Page;

  // Header
  readonly heading: Locator;
  readonly backButton: Locator;

  // Form fields
  readonly titleInput: Locator;
  readonly descriptionInput: Locator;
  readonly statusSelect: Locator;
  readonly assignedUserSelect: Locator;
  readonly startDateInput: Locator;
  readonly endDateInput: Locator;
  readonly durationInput: Locator;
  readonly startAfterInput: Locator;
  readonly startBeforeInput: Locator;
  readonly plannedBudgetInput: Locator;
  readonly actualCostInput: Locator;
  readonly confidencePercentInput: Locator;
  readonly budgetCategorySelect: Locator;
  readonly budgetSourceSelect: Locator;

  // Form actions
  readonly submitButton: Locator;
  readonly cancelButton: Locator;

  // Error/validation display
  readonly errorBanner: Locator;
  readonly titleErrorText: Locator;

  constructor(page: Page) {
    this.page = page;

    // Header
    this.heading = page.getByRole('heading', { level: 1, name: 'Create Work Item', exact: true });
    // Back button is a <button> (not <Link>)
    this.backButton = page.getByRole('button', { name: /← Back to Work Items/i });

    // Form fields
    this.titleInput = page.locator('#title');
    this.descriptionInput = page.locator('#description');
    this.statusSelect = page.locator('#status');
    this.assignedUserSelect = page.locator('#assignedUserId');
    this.startDateInput = page.locator('#startDate');
    this.endDateInput = page.locator('#endDate');
    this.durationInput = page.locator('#durationDays');
    this.startAfterInput = page.locator('#startAfter');
    this.startBeforeInput = page.locator('#startBefore');
    this.plannedBudgetInput = page.locator('#plannedBudget');
    this.actualCostInput = page.locator('#actualCost');
    this.confidencePercentInput = page.locator('#confidencePercent');
    this.budgetCategorySelect = page.locator('#budgetCategoryId');
    this.budgetSourceSelect = page.locator('#budgetSourceId');

    // Form actions
    this.submitButton = page.getByRole('button', { name: /Create Work Item|Creating\.\.\./i });
    this.cancelButton = page.getByRole('button', { name: 'Cancel', exact: true });

    // Errors
    this.errorBanner = page.locator('[class*="errorBanner"]');
    // Validation error text shown below the title field
    this.titleErrorText = page.locator('[class*="errorText"]').first();
  }

  /**
   * Navigate to the work item create page.
   */
  async goto(): Promise<void> {
    await this.page.goto(WORK_ITEM_CREATE_ROUTE);
    await this.heading.waitFor({ state: 'visible', timeout: 7000 });
  }

  /**
   * Fill only the title field.
   */
  async fillTitle(title: string): Promise<void> {
    await this.titleInput.fill(title);
  }

  /**
   * Fill multiple form fields at once.
   * Only provided fields are filled; others are left at their defaults.
   */
  async fillForm(data: WorkItemFormData): Promise<void> {
    if (data.title !== undefined) {
      await this.titleInput.fill(data.title);
    }
    if (data.description !== undefined) {
      await this.descriptionInput.fill(data.description);
    }
    if (data.status !== undefined) {
      await this.statusSelect.selectOption(data.status);
    }
    if (data.assignedUserId !== undefined) {
      await this.assignedUserSelect.selectOption(data.assignedUserId);
    }
    if (data.startDate !== undefined) {
      await this.startDateInput.fill(data.startDate);
    }
    if (data.endDate !== undefined) {
      await this.endDateInput.fill(data.endDate);
    }
    if (data.durationDays !== undefined) {
      await this.durationInput.fill(data.durationDays);
    }
    if (data.startAfter !== undefined) {
      await this.startAfterInput.fill(data.startAfter);
    }
    if (data.startBefore !== undefined) {
      await this.startBeforeInput.fill(data.startBefore);
    }
    if (data.plannedBudget !== undefined) {
      await this.plannedBudgetInput.fill(data.plannedBudget);
    }
    if (data.actualCost !== undefined) {
      await this.actualCostInput.fill(data.actualCost);
    }
    if (data.confidencePercent !== undefined) {
      await this.confidencePercentInput.fill(data.confidencePercent);
    }
  }

  /**
   * Submit the form by clicking the "Create Work Item" button.
   */
  async submit(): Promise<void> {
    await this.submitButton.click();
  }

  /**
   * Click "Cancel" — navigates back to the work items list.
   */
  async cancel(): Promise<void> {
    await this.cancelButton.click();
    await this.page.waitForURL('**/work-items', { timeout: 5000 });
  }

  /**
   * Get the validation error text shown below the title field.
   * Returns null if not visible.
   */
  async getTitleErrorText(): Promise<string | null> {
    try {
      await this.titleErrorText.waitFor({ state: 'visible', timeout: 3000 });
      return await this.titleErrorText.textContent();
    } catch {
      return null;
    }
  }

  /**
   * Get the error banner text. Returns null if not visible.
   */
  async getErrorBannerText(): Promise<string | null> {
    try {
      await this.errorBanner.waitFor({ state: 'visible', timeout: 3000 });
      return await this.errorBanner.textContent();
    } catch {
      return null;
    }
  }
}
