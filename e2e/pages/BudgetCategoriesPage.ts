/**
 * Page Object Model for the Budget Categories page (/budget/categories)
 *
 * The page uses an inline create form (toggled by "Add Category" button),
 * a list of categories with inline edit forms, and a delete confirmation modal.
 */

import type { Page, Locator } from '@playwright/test';

export const BUDGET_CATEGORIES_ROUTE = '/budget/categories';

export interface CreateCategoryData {
  name: string;
  description?: string;
  color?: string;
  sortOrder?: number | string;
}

export interface EditCategoryData {
  name?: string;
  description?: string;
  color?: string;
  sortOrder?: number | string;
}

export class BudgetCategoriesPage {
  readonly page: Page;

  // Page header
  readonly heading: Locator;
  readonly addCategoryButton: Locator;

  // Global banners
  readonly successBanner: Locator;
  readonly errorBanner: Locator;

  // Create form (only visible after clicking "Add Category")
  readonly createFormSection: Locator;
  readonly createFormHeading: Locator;
  readonly createNameInput: Locator;
  readonly createDescriptionInput: Locator;
  readonly createColorInput: Locator;
  readonly createSortOrderInput: Locator;
  readonly createSubmitButton: Locator;
  readonly createCancelButton: Locator;
  readonly createErrorBanner: Locator;

  // Categories list section
  readonly categoriesSection: Locator;
  readonly categoriesListHeading: Locator;
  readonly categoriesList: Locator;
  readonly emptyState: Locator;

  // Delete confirmation modal
  readonly deleteModal: Locator;
  readonly deleteModalTitle: Locator;
  readonly deleteModalText: Locator;
  readonly deleteModalWarning: Locator;
  readonly deleteModalErrorBanner: Locator;
  readonly deleteConfirmButton: Locator;
  readonly deleteCancelButton: Locator;

  constructor(page: Page) {
    this.page = page;

    // Page header
    this.heading = page.getByRole('heading', { level: 1, name: 'Budget Categories', exact: true });
    this.addCategoryButton = page.getByRole('button', { name: 'Add Category', exact: true });

    // Global banners — scoped to first role="alert" outside the form/modal for each type
    // The page renders a single success banner and a single error banner in the main content area
    this.successBanner = page.locator(`.content > [role="alert"]`).first();
    this.errorBanner = page.locator('[role="alert"]').filter({ hasText: /error|failed|failed/i });

    // Create form — inside the section with heading "New Budget Category"
    this.createFormSection = page
      .getByRole('heading', { level: 2, name: 'New Budget Category', exact: true })
      .locator('..');
    this.createFormHeading = page.getByRole('heading', {
      level: 2,
      name: 'New Budget Category',
      exact: true,
    });
    this.createNameInput = page.locator('#categoryName');
    this.createDescriptionInput = page.locator('#categoryDescription');
    this.createColorInput = page.locator('#categoryColor');
    this.createSortOrderInput = page.locator('#categorySortOrder');
    this.createSubmitButton = page.getByRole('button', { name: /Create Category|Creating\.\.\./ });
    this.createCancelButton = page
      .getByRole('button', { name: 'Cancel', exact: true })
      .filter({ has: page.locator(':scope') })
      .first();
    this.createErrorBanner = page
      .getByRole('heading', { level: 2, name: 'New Budget Category', exact: true })
      .locator('..')
      .locator('[role="alert"]');

    // Categories list section — inside the section with heading starting with "Categories"
    this.categoriesSection = page
      .getByRole('heading', { level: 2, name: /^Categories/ })
      .locator('..');
    this.categoriesListHeading = page.getByRole('heading', { level: 2, name: /^Categories/ });
    this.categoriesList = page.locator('[class*="categoriesList"]');
    this.emptyState = page.getByText(/No budget categories yet/);

    // Delete confirmation modal
    this.deleteModal = page.getByRole('dialog', { name: 'Delete Category' });
    this.deleteModalTitle = page.locator('#delete-modal-title');
    this.deleteModalText = this.deleteModal.locator('p').first();
    this.deleteModalWarning = this.deleteModal.locator('[class*="modalWarning"]');
    this.deleteModalErrorBanner = this.deleteModal.locator('[role="alert"]');
    this.deleteConfirmButton = this.deleteModal.getByRole('button', {
      name: /Delete Category|Deleting\.\.\./,
    });
    this.deleteCancelButton = this.deleteModal.getByRole('button', { name: 'Cancel', exact: true });
  }

  async goto(): Promise<void> {
    await this.page.goto(BUDGET_CATEGORIES_ROUTE);
    // Wait for the page heading to appear (data loaded)
    await this.heading.waitFor({ state: 'visible', timeout: 8000 });
  }

  /**
   * Open the create form by clicking "Add Category"
   */
  async openCreateForm(): Promise<void> {
    await this.addCategoryButton.click();
    await this.createFormHeading.waitFor({ state: 'visible', timeout: 5000 });
  }

  /**
   * Fill and submit the create form.
   * Only name is required; other fields are optional.
   */
  async createCategory(data: CreateCategoryData): Promise<void> {
    await this.createNameInput.fill(data.name);
    if (data.description !== undefined) {
      await this.createDescriptionInput.fill(data.description);
    }
    if (data.color !== undefined) {
      await this.createColorInput.fill(data.color);
    }
    if (data.sortOrder !== undefined) {
      await this.createSortOrderInput.fill(String(data.sortOrder));
    }
    await this.createSubmitButton.click();
  }

  /**
   * Get all category row locators from the categories list.
   * Each row contains the category's display info and action buttons.
   */
  async getCategoryRows(): Promise<Locator[]> {
    return await this.page.locator('[class*="categoryRow"]').all();
  }

  /**
   * Find the category row that contains the given category name.
   * Returns null if not found.
   */
  async getCategoryRow(name: string): Promise<Locator | null> {
    // Wait for at least one row to be visible before searching
    try {
      await this.page
        .locator('[class*="categoryRow"]')
        .first()
        .waitFor({ state: 'visible', timeout: 10000 });
    } catch {
      return null;
    }
    const rows = await this.getCategoryRows();
    for (const row of rows) {
      const nameEl = row.locator('[class*="categoryName"]');
      const rowText = await nameEl.textContent();
      if (rowText?.trim() === name) {
        return row;
      }
    }
    return null;
  }

  /**
   * Get names of all categories currently visible in the list, in display order.
   */
  async getCategoryNames(): Promise<string[]> {
    const nameLocators = await this.page.locator('[class*="categoryName"]').all();
    const names: string[] = [];
    for (const loc of nameLocators) {
      const text = await loc.textContent();
      if (text) names.push(text.trim());
    }
    return names;
  }

  /**
   * Get the count shown in the "Categories (N)" heading.
   */
  async getCategoriesCount(): Promise<number> {
    const headingText = await this.categoriesListHeading.textContent();
    const match = headingText?.match(/\((\d+)\)/);
    return match ? parseInt(match[1], 10) : 0;
  }

  /**
   * Click the Edit button for the named category to enter inline edit mode.
   */
  async openEditForm(categoryName: string): Promise<void> {
    const row = await this.getCategoryRow(categoryName);
    if (!row) {
      throw new Error(`Category "${categoryName}" not found in list`);
    }
    const editButton = row.getByRole('button', { name: `Edit ${categoryName}` });
    await editButton.click();
    // Wait for the edit form to appear (identified by its aria-label)
    await this.page
      .getByRole('form', { name: `Edit ${categoryName}` })
      .waitFor({ state: 'visible', timeout: 5000 });
  }

  /**
   * Get the inline edit form for a category currently being edited.
   * The form has aria-label="Edit <name>".
   */
  getEditForm(categoryName: string): Locator {
    return this.page.getByRole('form', { name: `Edit ${categoryName}` });
  }

  /**
   * Fill the inline edit form fields for a category.
   * Only updates fields that are provided.
   */
  async fillEditForm(categoryId: string, data: EditCategoryData): Promise<void> {
    if (data.name !== undefined) {
      const nameInput = this.page.locator(`#edit-name-${categoryId}`);
      await nameInput.fill(data.name);
    }
    if (data.description !== undefined) {
      const descInput = this.page.locator(`#edit-description-${categoryId}`);
      await descInput.fill(data.description);
    }
    if (data.color !== undefined) {
      const colorInput = this.page.locator(`#edit-color-${categoryId}`);
      await colorInput.fill(data.color);
    }
    if (data.sortOrder !== undefined) {
      const sortInput = this.page.locator(`#edit-sortorder-${categoryId}`);
      await sortInput.fill(String(data.sortOrder));
    }
  }

  /**
   * Get the Save button within an active edit form.
   * Scoped to the row that is currently in edit mode.
   */
  getEditSaveButton(categoryName: string): Locator {
    return this.page
      .getByRole('form', { name: `Edit ${categoryName}` })
      .getByRole('button', { name: /^Save$|^Saving\.\.\.$/ });
  }

  /**
   * Get the Cancel button within an active edit form.
   */
  getEditCancelButton(categoryName: string): Locator {
    return this.page
      .getByRole('form', { name: `Edit ${categoryName}` })
      .getByRole('button', { name: 'Cancel', exact: true });
  }

  /**
   * Get the error banner inside an active edit form.
   */
  getEditErrorBanner(categoryName: string): Locator {
    return this.page.getByRole('form', { name: `Edit ${categoryName}` }).locator('[role="alert"]');
  }

  /**
   * Click the Delete button for a named category to open the confirmation modal.
   */
  async openDeleteModal(categoryName: string): Promise<void> {
    const row = await this.getCategoryRow(categoryName);
    if (!row) {
      throw new Error(`Category "${categoryName}" not found in list`);
    }
    const deleteButton = row.getByRole('button', { name: `Delete ${categoryName}` });
    await deleteButton.click();
    await this.deleteModal.waitFor({ state: 'visible', timeout: 5000 });
  }

  /**
   * Confirm deletion in the delete modal.
   */
  async confirmDelete(): Promise<void> {
    await this.deleteConfirmButton.click();
  }

  /**
   * Cancel deletion and close the modal.
   */
  async cancelDelete(): Promise<void> {
    await this.deleteCancelButton.click();
    await this.deleteModal.waitFor({ state: 'hidden', timeout: 5000 });
  }

  /**
   * Get the success banner text, or null if not visible.
   */
  async getSuccessBannerText(): Promise<string | null> {
    try {
      // The success banner has role="alert" and appears in the main content area
      const banner = this.page
        .locator('[role="alert"]')
        .filter({ hasText: /successfully/i })
        .first();
      await banner.waitFor({ state: 'visible', timeout: 5000 });
      return await banner.textContent();
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
  async getDeleteModalErrorText(): Promise<string | null> {
    try {
      await this.deleteModalErrorBanner.waitFor({ state: 'visible', timeout: 5000 });
      return await this.deleteModalErrorBanner.textContent();
    } catch {
      return null;
    }
  }

  /**
   * Wait for the success banner to appear and then disappear (or just appear).
   */
  async waitForSuccessBanner(): Promise<string | null> {
    return this.getSuccessBannerText();
  }

  /**
   * Wait for the category list to be loaded (at least one row visible).
   */
  async waitForCategoriesLoaded(): Promise<void> {
    // Either there's at least one row, or the empty state is visible
    await Promise.race([
      this.page
        .locator('[class*="categoryRow"]')
        .first()
        .waitFor({ state: 'visible', timeout: 8000 }),
      this.emptyState.waitFor({ state: 'visible', timeout: 8000 }),
    ]);
  }

  /**
   * Get the color swatch background color for a named category.
   */
  async getCategorySwatchColor(categoryName: string): Promise<string | null> {
    const row = await this.getCategoryRow(categoryName);
    if (!row) return null;
    const swatch = row.locator('[class*="categorySwatch"]');
    return await swatch.evaluate((el) => {
      return (el as HTMLElement).style.backgroundColor;
    });
  }

  /**
   * Get the sort order displayed for a named category.
   */
  async getCategorySortOrder(categoryName: string): Promise<string | null> {
    const row = await this.getCategoryRow(categoryName);
    if (!row) return null;
    const sortOrderEl = row.locator('[class*="categorySortOrder"]');
    const text = await sortOrderEl.textContent();
    // Text is rendered as "#N" — strip the "#" prefix
    return text?.replace('#', '').trim() ?? null;
  }

  /**
   * Get the description text for a named category.
   */
  async getCategoryDescription(categoryName: string): Promise<string | null> {
    const row = await this.getCategoryRow(categoryName);
    if (!row) return null;
    const descEl = row.locator('[class*="categoryDescription"]');
    const isVisible = await descEl.isVisible();
    if (!isVisible) return null;
    return await descEl.textContent();
  }
}
