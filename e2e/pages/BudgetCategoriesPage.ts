/**
 * Page Object Model for the Budget Categories tab on the Manage page (/settings/manage?tab=budget-categories)
 *
 * Note: /budget/categories now redirects to /settings/manage?tab=budget-categories.
 * The page uses an always-visible inline create form (h2 "Create New Budget Category"),
 * a list of categories with inline edit forms, and a delete confirmation modal.
 *
 * Visual cleanup (#1185): The <h1>Manage</h1> heading and "Add Category" toggle button
 * were removed. The create form is now always rendered. The createFormHeading is the
 * readiness indicator for goto().
 */

import type { Page, Locator } from '@playwright/test';

export const BUDGET_CATEGORIES_ROUTE = '/settings/manage?tab=budget-categories';

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

  /**
   * @deprecated The <h1>Manage</h1> heading was removed in visual cleanup #1185.
   * This locator will never match a visible element.
   * Use `createFormHeading` or `categoriesListHeading` to verify the page is loaded.
   */
  readonly heading: Locator;

  /**
   * @deprecated The "Add Category" toggle button was removed in visual cleanup #1185.
   * The create form is now always visible. This locator will not match any element.
   * Kept for TypeScript compatibility only.
   */
  readonly addCategoryButton: Locator;

  // Global banners
  readonly successBanner: Locator;
  readonly errorBanner: Locator;

  // Create form — always visible (visual cleanup #1185 removed the "Add Category" toggle)
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

    // The budget-categories tab panel — all category-specific locators are scoped here
    // to avoid matching identical CSS classes used in the other tab panels (tags, hi-categories)
    const tabPanel = page.locator('#budget-categories-panel');

    // Readiness indicator: the internal "Budget Categories" tab button in the manage page tab list.
    // Visual cleanup #1185 removed the <h1>Manage</h1> heading; the tab button is always
    // present when ManagePage has mounted its internal tabs.
    // Visual cleanup #1185: the h1 "Manage" heading was removed — this locator will not match.
    this.heading = page.getByRole('heading', { level: 1, name: 'Manage', exact: true });

    // Visual cleanup #1185: "Add Category" toggle button was removed — this locator will not match.
    this.addCategoryButton = tabPanel.getByRole('button', { name: 'Add Category', exact: true });

    // Banners — inside the budget-categories tab panel
    this.successBanner = tabPanel
      .locator('[role="alert"]')
      .filter({ hasText: /successfully/i })
      .first();
    this.errorBanner = tabPanel
      .locator('[role="alert"]')
      .filter({ hasText: /error|failed/i })
      .first();

    // Create form — always visible (visual cleanup #1185); h2 text is "Create New Budget Category"
    this.createFormSection = tabPanel
      .getByRole('heading', { level: 2, name: 'Create New Budget Category', exact: true })
      .locator('..');
    this.createFormHeading = tabPanel.getByRole('heading', {
      level: 2,
      name: 'Create New Budget Category',
      exact: true,
    });
    // Input IDs are unique across the page (only one category form is active at a time)
    this.createNameInput = page.locator('#categoryName');
    this.createDescriptionInput = page.locator('#categoryDescription');
    this.createColorInput = page.locator('#categoryColor');
    this.createSortOrderInput = page.locator('#categorySortOrder');
    this.createSubmitButton = tabPanel.getByRole('button', {
      name: /Create Category|Creating\.\.\./,
    });
    // The create form has no Cancel button (visual cleanup #1185 — always-visible form).
    // This locator is kept for TypeScript compatibility; it will match edit-form cancel buttons.
    this.createCancelButton = tabPanel.getByRole('button', { name: 'Cancel', exact: true }).first();
    this.createErrorBanner = tabPanel
      .getByRole('heading', { level: 2, name: 'Create New Budget Category', exact: true })
      .locator('..')
      .locator('[role="alert"]');

    // Categories list section — ManagePage uses h2 "Categories (N)" (same pattern)
    // Scoped to the tab panel; note ManagePage uses "itemsList" not "categoriesList"
    this.categoriesSection = tabPanel
      .getByRole('heading', { level: 2, name: /^Categories \(/ })
      .locator('..');
    this.categoriesListHeading = tabPanel.getByRole('heading', {
      level: 2,
      name: /^Categories \(/,
    });
    this.categoriesList = tabPanel.locator('[class*="itemsList"]');
    this.emptyState = tabPanel.getByText(/No budget categories yet/);

    // Delete confirmation modal — rendered at root level (outside the tab panel)
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
    // Visual cleanup #1185: the <h1>Manage</h1> heading was removed and the "Add Category"
    // toggle button was removed. The create form is always rendered.
    // Wait for createFormHeading ("Create New Budget Category") as the readiness indicator.
    await this.createFormHeading.waitFor({ state: 'visible' });
  }

  /**
   * No-op — the create form is always visible after visual cleanup #1185.
   * Kept so existing test callers compile without modification.
   * Simply waits for the form heading to confirm it is ready.
   */
  async openCreateForm(): Promise<void> {
    await this.createFormHeading.waitFor({ state: 'visible' });
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
   * Scoped to the budget-categories panel to avoid matching tag/hi-category rows.
   */
  async getCategoryRows(): Promise<Locator[]> {
    const tabPanel = this.page.locator('#budget-categories-panel');
    return await tabPanel.locator('[class*="itemRow"]').all();
  }

  /**
   * Find the category row that contains the given category name.
   * Returns null if not found.
   */
  async getCategoryRow(name: string): Promise<Locator | null> {
    const tabPanel = this.page.locator('#budget-categories-panel');
    // Wait for at least one row to be visible before searching
    try {
      await tabPanel.locator('[class*="itemRow"]').first().waitFor({ state: 'visible' });
    } catch {
      return null;
    }
    const rows = await this.getCategoryRows();
    for (const row of rows) {
      const nameEl = row.locator('[class*="itemName"]');
      // Skip rows that are in edit mode (no visible itemName element)
      const count = await nameEl.count();
      if (count === 0) continue;
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
    const tabPanel = this.page.locator('#budget-categories-panel');
    const nameLocators = await tabPanel.locator('[class*="itemName"]').all();
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
      .waitFor({ state: 'visible' });
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
    await this.deleteModal.waitFor({ state: 'visible' });
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
    await this.deleteModal.waitFor({ state: 'hidden' });
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
      await banner.waitFor({ state: 'visible' });
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
      await this.createErrorBanner.waitFor({ state: 'visible' });
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
      await this.deleteModalErrorBanner.waitFor({ state: 'visible' });
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
    const tabPanel = this.page.locator('#budget-categories-panel');
    // Either there's at least one row, or the empty state is visible
    await Promise.race([
      tabPanel.locator('[class*="itemRow"]').first().waitFor({ state: 'visible' }),
      this.emptyState.waitFor({ state: 'visible' }),
    ]);
  }

  /**
   * Get the color swatch background color for a named category.
   */
  async getCategorySwatchColor(categoryName: string): Promise<string | null> {
    const row = await this.getCategoryRow(categoryName);
    if (!row) return null;
    // ManagePage uses "itemSwatch" class (was "categorySwatch")
    const swatch = row.locator('[class*="itemSwatch"]');
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
    // ManagePage uses "itemSortOrder" class (was "categorySortOrder")
    const sortOrderEl = row.locator('[class*="itemSortOrder"]');
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
    // ManagePage uses "itemDescription" class (was "categoryDescription")
    const descEl = row.locator('[class*="itemDescription"]');
    const isVisible = await descEl.isVisible();
    if (!isVisible) return null;
    return await descEl.textContent();
  }
}
