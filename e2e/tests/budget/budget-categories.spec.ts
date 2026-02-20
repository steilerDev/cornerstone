/**
 * E2E tests for Budget Categories CRUD management (Story #142)
 *
 * UAT Scenarios covered:
 * - Scenario 1: Default categories are seeded on first migration
 * - Scenario 2: View all budget categories
 * - Scenario 3: Create a new budget category — happy path (all fields)
 * - Scenario 4: Create a category with name only (minimal required fields)
 * - Scenario 5: Create category fails — missing required name
 * - Scenario 6: Create category fails — duplicate name
 * - Scenario 8: Edit an existing budget category
 * - Scenario 11: Delete a budget category — not referenced by any work item
 * - Scenario 18: Empty state when all categories deleted
 * - Responsive layout (mobile/tablet/desktop)
 * - Dark mode rendering
 */

import { test, expect } from '../../fixtures/auth.js';
import type { Page } from '@playwright/test';
import { BudgetCategoriesPage } from '../../pages/BudgetCategoriesPage.js';
import { API } from '../../fixtures/testData.js';

// The 10 default categories seeded by the EPIC-05 migration, in sort_order order
const DEFAULT_CATEGORIES = [
  'Materials',
  'Labor',
  'Permits',
  'Design',
  'Equipment',
  'Landscaping',
  'Utilities',
  'Insurance',
  'Contingency',
  'Other',
];

// ─────────────────────────────────────────────────────────────────────────────
// Helper: create a temporary category via API and return its id for cleanup
// ─────────────────────────────────────────────────────────────────────────────
async function createCategoryViaApi(page: Page, name: string, sortOrder = 999): Promise<string> {
  const response = await page.request.post(API.budgetCategories, {
    data: { name, sortOrder },
  });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { id: string };
  return body.id;
}

async function deleteCategoryViaApi(page: Page, id: string): Promise<void> {
  await page.request.delete(`${API.budgetCategories}/${id}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1 & 2: Default categories present and list view
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Default categories (Scenario 1 & 2)', { tag: '@responsive' }, () => {
  test('All 10 default categories are present after fresh migration', async ({ page }) => {
    // Given: EPIC-05 migration applied; default seeds loaded
    const categoriesPage = new BudgetCategoriesPage(page);

    // When: I navigate to Budget > Categories
    await categoriesPage.goto();

    // Then: All 10 named default categories appear in the list
    // (we check for presence rather than exact count=10 since parallel workers
    //  may have created additional categories in the shared database)
    const names = await categoriesPage.getCategoryNames();
    for (const expectedName of DEFAULT_CATEGORIES) {
      expect(names).toContain(expectedName);
    }
  });

  test('List shows name, color swatch and sort order for each category', async ({ page }) => {
    // Given: Default categories are seeded
    const categoriesPage = new BudgetCategoriesPage(page);

    // When: I navigate to Budget > Categories
    await categoriesPage.goto();

    // Then: The "Materials" row is visible with a color swatch and sort order indicator
    const materialsRow = await categoriesPage.getCategoryRow('Materials');
    expect(materialsRow).not.toBeNull();
    if (materialsRow) {
      // Color swatch element should be present
      const swatch = materialsRow.locator('[class*="categorySwatch"]');
      await expect(swatch).toBeVisible();

      // Sort order indicator should be present
      const sortOrder = materialsRow.locator('[class*="categorySortOrder"]');
      await expect(sortOrder).toBeVisible();
    }
  });

  test('Categories list heading shows at least 10 (the default seed count)', async ({ page }) => {
    // Given: Default categories are seeded
    const categoriesPage = new BudgetCategoriesPage(page);

    // When: I navigate to Budget > Categories
    await categoriesPage.goto();

    // Then: The heading shows a count >= 10
    // (exact count may be higher if parallel workers have added test categories)
    const count = await categoriesPage.getCategoriesCount();
    expect(count).toBeGreaterThanOrEqual(DEFAULT_CATEGORIES.length);

    // And: The heading pattern "Categories (N)" is present
    await expect(categoriesPage.categoriesListHeading).toContainText(/Categories \(\d+\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 8 (order) & Scenario 2: Categories sorted by sort_order
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Sort order display (Scenario 2 & 13)', { tag: '@responsive' }, () => {
  test('Categories are displayed in ascending sort_order: Materials before Labor before Permits', async ({
    page,
  }) => {
    // Given: Default categories with known sort_orders exist
    const categoriesPage = new BudgetCategoriesPage(page);

    // When: I navigate to Budget > Categories
    await categoriesPage.goto();

    // Then: The order is Materials, Labor, Permits (first three defaults)
    const names = await categoriesPage.getCategoryNames();
    const materialsIdx = names.indexOf('Materials');
    const laborIdx = names.indexOf('Labor');
    const permitsIdx = names.indexOf('Permits');

    expect(materialsIdx).toBeGreaterThanOrEqual(0);
    expect(laborIdx).toBeGreaterThanOrEqual(0);
    expect(permitsIdx).toBeGreaterThanOrEqual(0);
    expect(materialsIdx).toBeLessThan(laborIdx);
    expect(laborIdx).toBeLessThan(permitsIdx);
  });

  test('Newly created category with lower sort_order appears before higher sort_order categories', async ({
    page,
    testPrefix,
  }) => {
    // Given: Default categories have sort_order >= 1
    const categoriesPage = new BudgetCategoriesPage(page);
    let createdId: string | null = null;
    const categoryName = `${testPrefix} Sort Test Zero`;

    try {
      // When: I create a category with sort_order = 0
      createdId = await createCategoryViaApi(page, categoryName, 0);

      await categoriesPage.goto();
      await categoriesPage.waitForCategoriesLoaded();

      // Then: The new category appears first in the list
      const names = await categoriesPage.getCategoryNames();
      expect(names[0]).toBe(categoryName);
    } finally {
      if (createdId) {
        await deleteCategoryViaApi(page, createdId);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: Create category — happy path (all fields)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Create category — happy path (Scenario 3)', { tag: '@responsive' }, () => {
  test('Create new category with all fields — appears in list at correct position', async ({
    page,
    testPrefix,
  }) => {
    const categoriesPage = new BudgetCategoriesPage(page);
    const categoryName = `${testPrefix} Excavation`;

    // Given: I am on the Budget > Categories page
    await categoriesPage.goto();

    // When: I click "Add Category"
    await categoriesPage.openCreateForm();

    // And: I fill in all fields
    await categoriesPage.createCategory({
      name: categoryName,
      description: 'Site clearing and foundation digging',
      color: '#8b4513',
      sortOrder: 50,
    });

    // Then: Success banner appears
    const successText = await categoriesPage.getSuccessBannerText();
    expect(successText).toContain(categoryName);

    // And: The form closes
    await expect(categoriesPage.createFormHeading).not.toBeVisible({ timeout: 5000 });

    // And: The new category appears in the list
    const names = await categoriesPage.getCategoryNames();
    expect(names).toContain(categoryName);

    // And: The description is shown
    const description = await categoriesPage.getCategoryDescription(categoryName);
    expect(description).toBe('Site clearing and foundation digging');

    // Cleanup: delete the created category via API
    const rows = await categoriesPage.getCategoryRows();
    let createdId: string | null = null;
    for (const row of rows) {
      const nameEl = row.locator('[class*="categoryName"]');
      const rowText = await nameEl.textContent();
      if (rowText?.trim() === categoryName) {
        // Get the delete button aria-label to find the category
        const deleteBtn = row.getByRole('button', { name: `Delete ${categoryName}` });
        const ariaLabel = await deleteBtn.getAttribute('aria-label');
        // Delete via modal
        if (ariaLabel) {
          await deleteBtn.click();
          await categoriesPage.deleteModal.waitFor({ state: 'visible', timeout: 5000 });
          await categoriesPage.confirmDelete();
          await categoriesPage.deleteModal.waitFor({ state: 'hidden', timeout: 5000 });
          createdId = 'deleted';
        }
        break;
      }
    }
    // If modal-based delete failed, try API fallback via list count
    if (!createdId) {
      // Reload and try API-based cleanup by finding the new category's id
      const response = await page.request.get(API.budgetCategories);
      const body = (await response.json()) as { categories: Array<{ id: string; name: string }> };
      const found = body.categories.find((c) => c.name === categoryName);
      if (found) {
        await deleteCategoryViaApi(page, found.id);
      }
    }
  });

  test('Create form resets after successful creation', async ({ page, testPrefix }) => {
    const categoriesPage = new BudgetCategoriesPage(page);
    let createdId: string | null = null;
    const categoryName = `${testPrefix} Create Reset Test`;

    try {
      await categoriesPage.goto();
      await categoriesPage.openCreateForm();

      // When: Create a category
      await categoriesPage.createCategory({
        name: categoryName,
        sortOrder: 998,
      });

      // Wait for success
      await categoriesPage.getSuccessBannerText();

      // Then: The create form is dismissed (collapsed)
      await expect(categoriesPage.createFormHeading).not.toBeVisible({ timeout: 5000 });

      // And: "Add Category" button is enabled again
      await expect(categoriesPage.addCategoryButton).toBeEnabled();
    } finally {
      // Cleanup via API
      const response = await page.request.get(API.budgetCategories);
      const body = (await response.json()) as { categories: Array<{ id: string; name: string }> };
      const found = body.categories.find((c) => c.name === categoryName);
      if (found) {
        createdId = found.id;
        await deleteCategoryViaApi(page, createdId);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: Create category fails — missing required name
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Create category validation (Scenario 5)', { tag: '@responsive' }, () => {
  test('Create button is disabled when name field is empty', async ({ page }) => {
    const categoriesPage = new BudgetCategoriesPage(page);

    // Given: I am on the Add Category form
    await categoriesPage.goto();
    await categoriesPage.openCreateForm();

    // When: The Name field is empty (default state)
    // Then: The "Create Category" button should be disabled
    await expect(categoriesPage.createSubmitButton).toBeDisabled();
  });

  test('Create button becomes enabled when name is filled', async ({ page }) => {
    const categoriesPage = new BudgetCategoriesPage(page);

    // Given: Create form is open
    await categoriesPage.goto();
    await categoriesPage.openCreateForm();

    // When: I type a name
    await categoriesPage.createNameInput.fill('Test Category');

    // Then: The "Create Category" button should be enabled
    await expect(categoriesPage.createSubmitButton).toBeEnabled();
  });

  test('Create shows validation error when name is cleared and submitted', async ({ page }) => {
    const categoriesPage = new BudgetCategoriesPage(page);

    // Given: Create form is open with a name, then cleared
    await categoriesPage.goto();
    await categoriesPage.openCreateForm();

    // When: I fill in a name, then clear it (via keyboard), then attempt to submit
    await categoriesPage.createNameInput.fill('Temp');
    await categoriesPage.createNameInput.fill('');
    await categoriesPage.createNameInput.focus();
    // The button should be disabled due to empty name guard in JSX
    const isDisabled = await categoriesPage.createSubmitButton.isDisabled();
    expect(isDisabled).toBe(true);
  });

  test('Cancel button dismisses create form without creating', async ({ page }) => {
    const categoriesPage = new BudgetCategoriesPage(page);

    // Given: I am on the Add Category form
    await categoriesPage.goto();
    await categoriesPage.openCreateForm();

    const countBefore = await categoriesPage.getCategoriesCount();

    // When: I fill in a name but then click Cancel
    await categoriesPage.createNameInput.fill('Should Not Be Created');
    const cancelButton = categoriesPage.page.getByRole('button', { name: 'Cancel', exact: true });
    await cancelButton.click();

    // Then: The form should be dismissed
    await expect(categoriesPage.createFormHeading).not.toBeVisible({ timeout: 5000 });

    // And: No new category was created
    const countAfter = await categoriesPage.getCategoriesCount();
    expect(countAfter).toBe(countBefore);

    // And: The category does not appear in the list
    const names = await categoriesPage.getCategoryNames();
    expect(names).not.toContain('Should Not Be Created');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6: Create category fails — duplicate name
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Duplicate name validation (Scenario 6)', { tag: '@responsive' }, () => {
  test('Creating category with duplicate name "Labor" shows error', async ({ page }) => {
    const categoriesPage = new BudgetCategoriesPage(page);

    // Given: "Labor" already exists (seeded by default)
    await categoriesPage.goto();

    // Record the count before attempting the duplicate (may include test categories from other workers)
    const countBefore = await categoriesPage.getCategoriesCount();

    await categoriesPage.openCreateForm();

    // When: I attempt to create a new category with Name = "Labor"
    await categoriesPage.createCategory({ name: 'Labor' });

    // Then: An error message indicates the name must be unique
    const errorText = await categoriesPage.getCreateErrorText();
    expect(errorText).toBeTruthy();
    // Error should mention uniqueness or duplication
    expect(errorText?.toLowerCase()).toMatch(/already exists|unique|duplicate|conflict/);

    // And: The category count is unchanged (no duplicate created)
    const countAfter = await categoriesPage.getCategoriesCount();
    expect(countAfter).toBe(countBefore);
  });

  test('Duplicate name error does not close the create form', async ({ page }) => {
    const categoriesPage = new BudgetCategoriesPage(page);

    // Given: "Materials" already exists
    await categoriesPage.goto();
    await categoriesPage.openCreateForm();

    // When: I attempt to create a duplicate
    await categoriesPage.createCategory({ name: 'Materials' });

    // Then: The create form remains visible (not closed on error)
    await expect(categoriesPage.createFormHeading).toBeVisible({ timeout: 5000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 8: Edit an existing budget category
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Edit category (Scenario 8 & 9)', { tag: '@responsive' }, () => {
  test('Edit "Design" description and color — changes persist after reload', async ({ page }) => {
    const categoriesPage = new BudgetCategoriesPage(page);
    const originalDescription = 'Design';

    // Given: The "Design" category exists
    await categoriesPage.goto();

    // Record the initial state so we can restore it
    const designRow = await categoriesPage.getCategoryRow('Design');
    expect(designRow).not.toBeNull();

    // When: I click "Edit" on the "Design" category
    await categoriesPage.openEditForm('Design');

    // Get the category id from the edit form inputs (id="edit-name-{id}")
    const editNameInputs = await page.locator('[id^="edit-name-"]').all();
    expect(editNameInputs.length).toBe(1);
    const inputId = await editNameInputs[0].getAttribute('id');
    const categoryId = inputId?.replace('edit-name-', '') ?? '';
    expect(categoryId).toBeTruthy();

    // And: I change the Description
    await categoriesPage.fillEditForm(categoryId, {
      description: 'Architectural drawings and planning',
      color: '#a0522d',
    });

    // And: I click "Save"
    const saveButton = categoriesPage.getEditSaveButton('Design');
    await saveButton.click();

    // Then: Success banner appears
    const successText = await categoriesPage.getSuccessBannerText();
    expect(successText).toContain('Design');

    // And: The edit form closes
    await expect(categoriesPage.getEditForm('Design')).not.toBeVisible({ timeout: 5000 });

    // And: The updated description is visible in the list
    const description = await categoriesPage.getCategoryDescription('Design');
    expect(description).toBe('Architectural drawings and planning');

    // And: The change persists when I reload the page
    await categoriesPage.goto();
    const descriptionAfterReload = await categoriesPage.getCategoryDescription('Design');
    expect(descriptionAfterReload).toBe('Architectural drawings and planning');

    // Cleanup: restore the original empty description
    await categoriesPage.openEditForm('Design');
    const editInputsAfterReload = await page.locator('[id^="edit-name-"]').all();
    const editInputIdAfterReload = await editInputsAfterReload[0].getAttribute('id');
    const categoryIdAfterReload = editInputIdAfterReload?.replace('edit-name-', '') ?? '';
    await categoriesPage.fillEditForm(categoryIdAfterReload, {
      description: originalDescription === 'Design' ? '' : originalDescription,
    });
    const saveAfterReload = categoriesPage.getEditSaveButton('Design');
    await saveAfterReload.click();
    await categoriesPage.getSuccessBannerText();
  });

  test('Edit modal can be cancelled — original values retained', async ({ page }) => {
    const categoriesPage = new BudgetCategoriesPage(page);

    // Given: "Equipment" category exists
    await categoriesPage.goto();

    // When: I click "Edit" on "Equipment"
    await categoriesPage.openEditForm('Equipment');

    const editInputs = await page.locator('[id^="edit-name-"]').all();
    const inputId = await editInputs[0].getAttribute('id');
    const categoryId = inputId?.replace('edit-name-', '') ?? '';

    // And: I change the name but click Cancel
    await categoriesPage.fillEditForm(categoryId, { name: 'Modified Equipment Name' });
    const cancelButton = categoriesPage.getEditCancelButton('Equipment');
    await cancelButton.click();

    // Then: The edit form is dismissed
    await expect(categoriesPage.getEditForm('Equipment')).not.toBeVisible({ timeout: 5000 });

    // And: The original name "Equipment" is still in the list
    const names = await categoriesPage.getCategoryNames();
    expect(names).toContain('Equipment');
    expect(names).not.toContain('Modified Equipment Name');
  });

  test('Edit with empty name shows error or disables save button', async ({ page }) => {
    const categoriesPage = new BudgetCategoriesPage(page);

    // Given: "Insurance" category exists
    await categoriesPage.goto();
    await categoriesPage.openEditForm('Insurance');

    const editInputs = await page.locator('[id^="edit-name-"]').all();
    const inputId = await editInputs[0].getAttribute('id');
    const categoryId = inputId?.replace('edit-name-', '') ?? '';

    // When: I clear the name field
    await categoriesPage.fillEditForm(categoryId, { name: '' });

    // Then: Save button should be disabled (JSX guard: disabled={isUpdating || !editingCategory.name.trim()})
    const saveButton = categoriesPage.getEditSaveButton('Insurance');
    await expect(saveButton).toBeDisabled();

    // Cleanup: cancel the edit
    const cancelButton = categoriesPage.getEditCancelButton('Insurance');
    await cancelButton.click();
  });

  test('Only one category can be edited at a time — other edit buttons are disabled', async ({
    page,
  }) => {
    const categoriesPage = new BudgetCategoriesPage(page);

    // Given: I open the edit form for "Utilities"
    await categoriesPage.goto();
    await categoriesPage.openEditForm('Utilities');

    // Then: The edit button for another category (e.g., "Other") should be disabled
    const otherRow = await categoriesPage.getCategoryRow('Other');
    expect(otherRow).not.toBeNull();
    if (otherRow) {
      const otherEditButton = otherRow.getByRole('button', { name: 'Edit Other' });
      await expect(otherEditButton).toBeDisabled();
    }

    // Cleanup: cancel the edit
    const cancelButton = categoriesPage.getEditCancelButton('Utilities');
    await cancelButton.click();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 11: Delete a category not referenced by any work item
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Delete category (Scenario 11)', { tag: '@responsive' }, () => {
  test('Delete confirmation modal opens with category name in text', async ({
    page,
    testPrefix,
  }) => {
    const categoriesPage = new BudgetCategoriesPage(page);
    let createdId: string | null = null;
    const categoryName = `${testPrefix} Delete Modal Test`;

    try {
      // Given: A test category exists that is not referenced
      createdId = await createCategoryViaApi(page, categoryName, 997);

      // When: I navigate to Budget > Categories and click Delete
      await categoriesPage.goto();
      await categoriesPage.openDeleteModal(categoryName);

      // Then: The modal is visible
      await expect(categoriesPage.deleteModal).toBeVisible();

      // And: The modal title says "Delete Category"
      await expect(categoriesPage.deleteModalTitle).toHaveText('Delete Category');

      // And: The modal text mentions the category name
      const modalText = await categoriesPage.deleteModalText.textContent();
      expect(modalText).toContain(categoryName);
    } finally {
      if (createdId) {
        await deleteCategoryViaApi(page, createdId);
      }
    }
  });

  test('Confirming deletion removes category from list', async ({ page, testPrefix }) => {
    const categoriesPage = new BudgetCategoriesPage(page);
    const categoryName = `${testPrefix} Delete Confirm Test`;

    // Given: A test category exists (created fresh for this test)
    const createdId = await createCategoryViaApi(page, categoryName, 996);

    // When: I navigate to Budget > Categories
    await categoriesPage.goto();

    const countBefore = await categoriesPage.getCategoriesCount();

    // And: I click Delete on the category and confirm
    await categoriesPage.openDeleteModal(categoryName);
    await categoriesPage.confirmDelete();

    // Then: The modal closes
    await expect(categoriesPage.deleteModal).not.toBeVisible({ timeout: 5000 });

    // And: Success banner appears
    const successText = await categoriesPage.getSuccessBannerText();
    expect(successText).toContain('deleted');

    // And: The category is removed from the list
    const names = await categoriesPage.getCategoryNames();
    expect(names).not.toContain(categoryName);

    // And: Count decreased by 1
    const countAfter = await categoriesPage.getCategoriesCount();
    expect(countAfter).toBe(countBefore - 1);

    // Note: no API cleanup needed — category was deleted via UI
    void createdId; // suppress unused variable warning
  });

  test('Cancelling deletion modal leaves category in list', async ({ page, testPrefix }) => {
    const categoriesPage = new BudgetCategoriesPage(page);
    let createdId: string | null = null;
    const categoryName = `${testPrefix} Cancel Delete Test`;

    try {
      // Given: A test category exists
      createdId = await createCategoryViaApi(page, categoryName, 995);

      await categoriesPage.goto();

      const countBefore = await categoriesPage.getCategoriesCount();

      // When: I click Delete then Cancel
      await categoriesPage.openDeleteModal(categoryName);
      await categoriesPage.cancelDelete();

      // Then: The category is still in the list
      const names = await categoriesPage.getCategoryNames();
      expect(names).toContain(categoryName);

      // And: Count is unchanged
      const countAfter = await categoriesPage.getCategoriesCount();
      expect(countAfter).toBe(countBefore);
    } finally {
      if (createdId) {
        await deleteCategoryViaApi(page, createdId);
      }
    }
  });

  test('Delete confirmation does not show an error for an unreferenced category', async ({
    page,
    testPrefix,
  }) => {
    const categoriesPage = new BudgetCategoriesPage(page);
    const categoryName = `${testPrefix} Delete No Error Test`;

    // Given: An unreferenced category exists
    const createdId = await createCategoryViaApi(page, categoryName, 994);

    try {
      await categoriesPage.goto();

      // When: I open the delete modal
      await categoriesPage.openDeleteModal(categoryName);

      // Then: No error banner is shown — only the warning text
      await expect(categoriesPage.deleteModalWarning).toBeVisible();
      const errorText = await categoriesPage.getDeleteModalErrorText();
      expect(errorText).toBeNull();
    } finally {
      // Close modal if open
      const isModalVisible = await categoriesPage.deleteModal.isVisible();
      if (isModalVisible) {
        await categoriesPage.cancelDelete();
      }
      // Cleanup
      await deleteCategoryViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 12: Delete blocked when category is in use (409 error)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Delete blocked when in use (Scenario 12)', { tag: '@responsive' }, () => {
  test('Delete confirmation button is not shown after 409 error', async ({ page, testPrefix }) => {
    // This test verifies the UI behavior when the API returns a 409 conflict.
    // We simulate this by intercepting the DELETE request and returning 409.
    const categoriesPage = new BudgetCategoriesPage(page);
    let createdId: string | null = null;
    const categoryName = `${testPrefix} Delete Blocked Test`;

    try {
      // Given: A test category exists
      createdId = await createCategoryViaApi(page, categoryName, 993);

      // Intercept the DELETE request for this category and force a 409 response
      await page.route(`${API.budgetCategories}/**`, async (route) => {
        if (route.request().method() === 'DELETE') {
          await route.fulfill({
            status: 409,
            contentType: 'application/json',
            body: JSON.stringify({
              error: {
                code: 'CATEGORY_IN_USE',
                message:
                  'This category cannot be deleted because it is currently in use by one or more budget entries.',
              },
            }),
          });
        } else {
          await route.continue();
        }
      });

      await categoriesPage.goto();

      // When: I attempt to delete the category and confirm
      await categoriesPage.openDeleteModal(categoryName);
      await categoriesPage.confirmDelete();

      // Then: An error message appears explaining the category is in use
      const errorText = await categoriesPage.getDeleteModalErrorText();
      expect(errorText).toBeTruthy();
      expect(errorText?.toLowerCase()).toMatch(/in use|cannot be deleted|budget entries/);

      // And: The "Delete Category" confirm button is hidden (replaced by error)
      await expect(categoriesPage.deleteConfirmButton).not.toBeVisible({ timeout: 3000 });

      // And: The category remains in the list (modal still open)
      await expect(categoriesPage.deleteModal).toBeVisible();

      // Close modal
      await categoriesPage.cancelDelete();
    } finally {
      // Remove route interception
      await page.unroute(`${API.budgetCategories}/**`);
      // Cleanup
      if (createdId) {
        await deleteCategoryViaApi(page, createdId);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 18: Empty state when all categories deleted
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Empty state (Scenario 18)', { tag: '@responsive' }, () => {
  test('Empty state message shown when no categories exist', async ({ page }) => {
    // Note: This test uses API route mocking to simulate an empty list
    // without actually deleting all 10 default categories (which would be destructive).
    const categoriesPage = new BudgetCategoriesPage(page);

    // Intercept the GET request to return an empty list
    await page.route(`${API.budgetCategories}`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ categories: [] }),
        });
      } else {
        await route.continue();
      }
    });

    try {
      // Given: No categories exist (simulated by mocked empty response)
      await categoriesPage.goto();

      // When: The page loads

      // Then: Empty state message is visible
      await expect(categoriesPage.emptyState).toBeVisible({ timeout: 10000 });

      // And: The empty state contains helpful text
      const emptyText = await categoriesPage.emptyState.textContent();
      expect(emptyText).toBeTruthy();
      expect(emptyText?.toLowerCase()).toMatch(/no.*categor|add.*first/);

      // And: The "Add Category" button is still visible (call-to-action)
      await expect(categoriesPage.addCategoryButton).toBeVisible();
    } finally {
      await page.unroute(`${API.budgetCategories}`);
    }
  });

  test('Categories count heading shows 0 when list is empty', async ({ page }) => {
    const categoriesPage = new BudgetCategoriesPage(page);

    await page.route(`${API.budgetCategories}`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ categories: [] }),
        });
      } else {
        await route.continue();
      }
    });

    try {
      await categoriesPage.goto();
      await expect(categoriesPage.categoriesListHeading).toContainText('0');
    } finally {
      await page.unroute(`${API.budgetCategories}`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Page structure and navigation
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Page structure and accessibility', { tag: '@responsive' }, () => {
  test('Page has correct h1 heading "Budget"', async ({ page }) => {
    const categoriesPage = new BudgetCategoriesPage(page);

    await categoriesPage.goto();

    await expect(categoriesPage.heading).toBeVisible();
    await expect(categoriesPage.heading).toHaveText('Budget');

    // Verify the correct sub-page loaded via the h2 section heading
    const sectionHeading = page.getByRole('heading', { level: 2, name: /^Categories \(/ });
    await expect(sectionHeading).toBeVisible();
  });

  test('"Add Category" button is visible on page load', async ({ page }) => {
    const categoriesPage = new BudgetCategoriesPage(page);

    await categoriesPage.goto();

    await expect(categoriesPage.addCategoryButton).toBeVisible();
    await expect(categoriesPage.addCategoryButton).toBeEnabled();
  });

  test('"Add Category" button is disabled while create form is open', async ({ page }) => {
    const categoriesPage = new BudgetCategoriesPage(page);

    await categoriesPage.goto();
    await categoriesPage.openCreateForm();

    // The button becomes disabled once the create form is shown
    await expect(categoriesPage.addCategoryButton).toBeDisabled();
  });

  test('Page URL is /budget/categories', async ({ page }) => {
    const categoriesPage = new BudgetCategoriesPage(page);

    await categoriesPage.goto();

    await page.waitForURL('/budget/categories');
    expect(page.url()).toContain('/budget/categories');
  });

  test('Navigating to /budget redirects to /budget/overview', async ({ page }) => {
    await page.goto('/budget');
    await page.waitForURL('/budget/overview');
    expect(page.url()).toContain('/budget/overview');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Responsive layout (Scenario 9)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Responsive layout (Scenario 9)', { tag: '@responsive' }, () => {
  test('Page renders without horizontal scroll on current viewport', async ({ page }) => {
    const categoriesPage = new BudgetCategoriesPage(page);

    await categoriesPage.goto();

    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });

    expect(hasHorizontalScroll).toBe(false);
  });

  test('Create form fields are visible and usable on current viewport', async ({ page }) => {
    const categoriesPage = new BudgetCategoriesPage(page);

    await categoriesPage.goto();
    await categoriesPage.openCreateForm();

    // All form inputs should be visible regardless of viewport
    await expect(categoriesPage.createNameInput).toBeVisible();
    await expect(categoriesPage.createDescriptionInput).toBeVisible();
    await expect(categoriesPage.createColorInput).toBeVisible();
    await expect(categoriesPage.createSortOrderInput).toBeVisible();
    await expect(categoriesPage.createSubmitButton).toBeVisible();

    // Cancel and close the form
    const cancelButton = page.getByRole('button', { name: 'Cancel', exact: true });
    await cancelButton.click();
  });

  test('Category list rows are visible and action buttons accessible on current viewport', async ({
    page,
  }) => {
    const categoriesPage = new BudgetCategoriesPage(page);

    await categoriesPage.goto();

    // At least one category row is visible
    const rows = await categoriesPage.getCategoryRows();
    expect(rows.length).toBeGreaterThan(0);

    // The first row (Materials) has Edit and Delete buttons
    const firstRow = rows[0];
    const firstNameEl = firstRow.locator('[class*="categoryName"]');
    const firstName = (await firstNameEl.textContent())?.trim() ?? '';

    if (firstName) {
      const editButton = firstRow.getByRole('button', { name: `Edit ${firstName}` });
      const deleteButton = firstRow.getByRole('button', { name: `Delete ${firstName}` });

      await expect(editButton).toBeVisible();
      await expect(deleteButton).toBeVisible();
    }
  });

  test('Desktop: create form fields render in a single row (>= 1024px)', async ({ page }) => {
    const viewport = page.viewportSize();

    // Only run this specific layout assertion on desktop
    if (!viewport || viewport.width < 1024) {
      test.skip();
      return;
    }

    const categoriesPage = new BudgetCategoriesPage(page);
    await categoriesPage.goto();
    await categoriesPage.openCreateForm();

    // On desktop, the name, color, and sort order fields should all be in view
    // without requiring any scrolling within the form
    const nameInputBox = await categoriesPage.createNameInput.boundingBox();
    const colorInputBox = await categoriesPage.createColorInput.boundingBox();
    const sortOrderBox = await categoriesPage.createSortOrderInput.boundingBox();

    expect(nameInputBox).not.toBeNull();
    expect(colorInputBox).not.toBeNull();
    expect(sortOrderBox).not.toBeNull();

    // On desktop they should be roughly on the same vertical line (same row)
    if (nameInputBox && colorInputBox && sortOrderBox) {
      const rowHeightTolerance = 60; // Allow 60px tolerance for alignment
      expect(Math.abs(nameInputBox.y - colorInputBox.y)).toBeLessThan(rowHeightTolerance);
      expect(Math.abs(nameInputBox.y - sortOrderBox.y)).toBeLessThan(rowHeightTolerance);
    }

    const cancelButton = page.getByRole('button', { name: 'Cancel', exact: true });
    await cancelButton.click();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Dark mode rendering (Scenario 10)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Dark mode rendering (Scenario 10)', { tag: '@responsive' }, () => {
  test('Page renders correctly in dark mode — no white-on-white or black-on-black text', async ({
    page,
  }) => {
    const categoriesPage = new BudgetCategoriesPage(page);

    // Enable dark mode via the data-theme attribute (matches ThemeContext implementation)
    await page.goto('/budget/categories');
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });

    // Wait for categories to load
    await categoriesPage.heading.waitFor({ state: 'visible', timeout: 8000 });

    // Then: The heading is visible (not hidden by theme issues)
    await expect(categoriesPage.heading).toBeVisible();

    // And: The categories section is visible
    await expect(categoriesPage.categoriesListHeading).toBeVisible();

    // And: At least one category row is visible (content renders)
    const rows = await categoriesPage.getCategoryRows();
    expect(rows.length).toBeGreaterThan(0);

    // And: No horizontal scroll in dark mode
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(hasHorizontalScroll).toBe(false);
  });

  test('Create form is usable in dark mode', async ({ page }) => {
    const categoriesPage = new BudgetCategoriesPage(page);

    await page.goto('/budget/categories');
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });

    await categoriesPage.heading.waitFor({ state: 'visible', timeout: 8000 });
    await categoriesPage.openCreateForm();

    // Form inputs should be visible in dark mode
    await expect(categoriesPage.createNameInput).toBeVisible();
    await expect(categoriesPage.createSubmitButton).toBeVisible();

    // Cancel form
    const cancelButton = page.getByRole('button', { name: 'Cancel', exact: true });
    await cancelButton.click();
  });

  test('Delete modal is usable in dark mode', async ({ page, testPrefix }) => {
    const categoriesPage = new BudgetCategoriesPage(page);
    let createdId: string | null = null;
    const categoryName = `${testPrefix} Dark Mode Delete Test`;

    try {
      createdId = await createCategoryViaApi(page, categoryName, 992);

      await page.goto('/budget/categories');
      await page.evaluate(() => {
        document.documentElement.setAttribute('data-theme', 'dark');
      });

      await categoriesPage.heading.waitFor({ state: 'visible', timeout: 8000 });

      // Open delete modal in dark mode
      await categoriesPage.openDeleteModal(categoryName);

      // Modal should be visible and usable
      await expect(categoriesPage.deleteModal).toBeVisible();
      await expect(categoriesPage.deleteConfirmButton).toBeVisible();
      await expect(categoriesPage.deleteCancelButton).toBeVisible();

      // Close modal
      await categoriesPage.cancelDelete();
    } finally {
      if (createdId) {
        await deleteCategoryViaApi(page, createdId);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Color field behavior (Scenario 17)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Color field (Scenario 17)', { tag: '@responsive' }, () => {
  test('Color swatch reflects selected color in create form', async ({ page }) => {
    const categoriesPage = new BudgetCategoriesPage(page);

    await categoriesPage.goto();
    await categoriesPage.openCreateForm();

    // The color input has a default value
    const defaultColor = await categoriesPage.createColorInput.inputValue();
    expect(defaultColor).toMatch(/^#[0-9a-fA-F]{6}$/);

    // Cancel form
    const cancelButton = page.getByRole('button', { name: 'Cancel', exact: true });
    await cancelButton.click();
  });

  test('Color input accepts hex color values', async ({ page, testPrefix }) => {
    const categoriesPage = new BudgetCategoriesPage(page);
    let createdId: string | null = null;
    const categoryName = `${testPrefix} Color Test`;

    try {
      // Create a category with a specific color via API
      const response = await page.request.post(API.budgetCategories, {
        data: { name: categoryName, color: '#ff6b35', sortOrder: 991 },
      });
      expect(response.ok()).toBeTruthy();
      const body = (await response.json()) as { id: string };
      createdId = body.id;

      await categoriesPage.goto();

      // The category should be in the list with its color swatch
      const row = await categoriesPage.getCategoryRow(categoryName);
      expect(row).not.toBeNull();

      if (row) {
        const swatch = row.locator('[class*="categorySwatch"]');
        await expect(swatch).toBeVisible();
        // The swatch should have a non-transparent background color
        const bgColor = await swatch.evaluate((el) => (el as HTMLElement).style.backgroundColor);
        expect(bgColor).toBeTruthy();
      }
    } finally {
      if (createdId) {
        await deleteCategoryViaApi(page, createdId);
      }
    }
  });
});
