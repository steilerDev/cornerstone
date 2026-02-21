/**
 * E2E tests for Budget Sources management (Story #145)
 *
 * UAT Scenarios covered:
 * - Page loads with h1 "Budget" and h2 "Sources"
 * - Empty state when no sources exist
 * - Create source — full fields (name, type, amount, rate, terms, notes)
 * - Create source — minimal (name + amount only)
 * - Create validation — button disabled without name or amount
 * - Edit source — save changes persist
 * - Edit source — cancel restores original
 * - Delete source — confirm removes from list
 * - Delete source — cancel leaves in list
 * - Delete blocked (409) — error shown, confirm button hidden
 * - Responsive layout: no horizontal scroll
 * - Dark mode rendering
 */

import { test, expect } from '../../fixtures/auth.js';
import type { Page } from '@playwright/test';
import { BudgetSourcesPage } from '../../pages/BudgetSourcesPage.js';
import { API } from '../../fixtures/testData.js';

// ─────────────────────────────────────────────────────────────────────────────
// API helpers
// ─────────────────────────────────────────────────────────────────────────────

interface BudgetSourceApiData {
  name: string;
  sourceType?: string;
  totalAmount: number;
  interestRate?: number | null;
  terms?: string | null;
  notes?: string | null;
  status?: string;
}

interface BudgetSourceApiResponse {
  id: string;
  name: string;
  sourceType: string;
  totalAmount: number;
  usedAmount: number;
  availableAmount: number;
  interestRate: number | null;
  terms: string | null;
  notes: string | null;
  status: string;
}

async function createSourceViaApi(page: Page, data: BudgetSourceApiData): Promise<string> {
  const response = await page.request.post(API.budgetSources, {
    data: {
      sourceType: 'bank_loan',
      status: 'active',
      interestRate: null,
      terms: null,
      notes: null,
      ...data,
    },
  });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { budgetSource: BudgetSourceApiResponse };
  return body.budgetSource.id;
}

async function deleteSourceViaApi(page: Page, id: string): Promise<void> {
  await page.request.delete(`${API.budgetSources}/${id}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Page heading and navigation
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Page heading and navigation', { tag: '@responsive' }, () => {
  test('Page loads with h1 "Budget" and h2 "Sources"', async ({ page }) => {
    const sourcesPage = new BudgetSourcesPage(page);

    await sourcesPage.goto();
    await sourcesPage.heading.waitFor({ state: 'visible', timeout: 5000 });

    // h1 "Budget"
    await expect(sourcesPage.heading).toBeVisible();
    await expect(sourcesPage.heading).toHaveText('Budget');

    // h2 "Sources"
    await expect(sourcesPage.sectionTitle).toBeVisible();
    await expect(sourcesPage.sectionTitle).toHaveText('Sources');
  });

  test('Budget sub-navigation is visible', async ({ page }) => {
    const sourcesPage = new BudgetSourcesPage(page);

    await sourcesPage.goto();
    await sourcesPage.heading.waitFor({ state: 'visible', timeout: 5000 });

    const subNav = page.getByRole('navigation', { name: 'Budget section navigation' });
    await expect(subNav).toBeVisible();

    // "Sources" tab is active
    const sourcesTab = subNav.getByRole('listitem').filter({ hasText: 'Sources' });
    await expect(sourcesTab).toBeVisible();
  });

  test('Page URL is /budget/sources', async ({ page }) => {
    const sourcesPage = new BudgetSourcesPage(page);

    await sourcesPage.goto();
    await page.waitForURL('/budget/sources');
    expect(page.url()).toContain('/budget/sources');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Empty state
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Empty state', { tag: '@responsive' }, () => {
  test('Empty state message shown when no sources exist', async ({ page }) => {
    const sourcesPage = new BudgetSourcesPage(page);

    // Mock the GET to return zero sources
    await page.route(`${API.budgetSources}`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ budgetSources: [] }),
        });
      } else {
        await route.continue();
      }
    });

    try {
      await sourcesPage.goto();
      await sourcesPage.waitForSourcesLoaded();

      await expect(sourcesPage.emptyState).toBeVisible({ timeout: 8000 });
      const emptyText = await sourcesPage.emptyState.textContent();
      expect(emptyText?.toLowerCase()).toMatch(/no budget sources yet/);
    } finally {
      await page.unroute(`${API.budgetSources}`);
    }
  });

  test('"Add Source" button is visible and enabled on page load', async ({ page }) => {
    const sourcesPage = new BudgetSourcesPage(page);

    await sourcesPage.goto();
    await sourcesPage.heading.waitFor({ state: 'visible', timeout: 5000 });

    await expect(sourcesPage.addSourceButton).toBeVisible();
    await expect(sourcesPage.addSourceButton).toBeEnabled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Create source — full fields
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Create source — full fields', { tag: '@responsive' }, () => {
  test('Create budget source with all fields — appears in list', async ({ page, testPrefix }) => {
    const sourcesPage = new BudgetSourcesPage(page);
    let createdId: string | null = null;
    const sourceName = `${testPrefix} Primary Bank Loan`;

    try {
      await sourcesPage.goto();
      await sourcesPage.waitForSourcesLoaded();
      await sourcesPage.openCreateForm();

      // Fill all fields
      await sourcesPage.createSource({
        name: sourceName,
        sourceType: 'bank_loan',
        status: 'active',
        totalAmount: 200000,
        interestRate: 3.75,
        terms: '30-year fixed, monthly payments',
        notes: 'Primary construction financing from First National Bank',
      });

      // Then: Form closes and success banner appears
      await expect(sourcesPage.createFormHeading).not.toBeVisible({ timeout: 8000 });

      const successText = await sourcesPage.getSuccessBannerText();
      expect(successText).toContain(sourceName);

      // And: Source appears in list
      await sourcesPage.waitForSourcesLoaded();
      const names = await sourcesPage.getSourceNames();
      expect(names).toContain(sourceName);
    } finally {
      // Cleanup: find and delete via API
      const resp = await page.request.get(API.budgetSources);
      const body = (await resp.json()) as { budgetSources: BudgetSourceApiResponse[] };
      const found = body.budgetSources.find((s) => s.name === sourceName);
      if (found) createdId = found.id;
      if (createdId) await deleteSourceViaApi(page, createdId);
    }
  });

  test('Create form is dismissed and "Add Source" re-enabled after successful create', async ({
    page,
    testPrefix,
  }) => {
    const sourcesPage = new BudgetSourcesPage(page);
    let createdId: string | null = null;
    const sourceName = `${testPrefix} Create Reset Source`;

    try {
      await sourcesPage.goto();
      await sourcesPage.waitForSourcesLoaded();
      await sourcesPage.openCreateForm();

      await sourcesPage.createSource({ name: sourceName, totalAmount: 50000 });

      // Form dismissed
      await expect(sourcesPage.createFormHeading).not.toBeVisible({ timeout: 8000 });

      // Add Source button re-enabled
      await expect(sourcesPage.addSourceButton).toBeEnabled();
    } finally {
      const resp = await page.request.get(API.budgetSources);
      const body = (await resp.json()) as { budgetSources: BudgetSourceApiResponse[] };
      const found = body.budgetSources.find((s) => s.name === sourceName);
      if (found) createdId = found.id;
      if (createdId) await deleteSourceViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Create source — minimal fields
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Create source — minimal fields', { tag: '@responsive' }, () => {
  test('Create source with name and amount only — succeeds', async ({ page, testPrefix }) => {
    const sourcesPage = new BudgetSourcesPage(page);
    let createdId: string | null = null;
    const sourceName = `${testPrefix} Minimal Source`;

    try {
      await sourcesPage.goto();
      await sourcesPage.waitForSourcesLoaded();
      await sourcesPage.openCreateForm();

      await sourcesPage.createSource({ name: sourceName, totalAmount: 75000 });

      await expect(sourcesPage.createFormHeading).not.toBeVisible({ timeout: 8000 });

      await sourcesPage.waitForSourcesLoaded();
      const names = await sourcesPage.getSourceNames();
      expect(names).toContain(sourceName);
    } finally {
      const resp = await page.request.get(API.budgetSources);
      const body = (await resp.json()) as { budgetSources: BudgetSourceApiResponse[] };
      const found = body.budgetSources.find((s) => s.name === sourceName);
      if (found) createdId = found.id;
      if (createdId) await deleteSourceViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Create validation
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Create validation', { tag: '@responsive' }, () => {
  test('"Create Source" button is disabled when name field is empty', async ({ page }) => {
    const sourcesPage = new BudgetSourcesPage(page);

    await sourcesPage.goto();
    await sourcesPage.waitForSourcesLoaded();
    await sourcesPage.openCreateForm();

    // Fill only amount — name is empty
    await sourcesPage.createTotalAmountInput.fill('50000');

    // Submit button should be disabled
    await expect(sourcesPage.createSubmitButton).toBeDisabled();

    await sourcesPage.createCancelButton.click();
    await expect(sourcesPage.createFormHeading).not.toBeVisible({ timeout: 5000 });
  });

  test('"Create Source" button is disabled when amount field is empty', async ({ page }) => {
    const sourcesPage = new BudgetSourcesPage(page);

    await sourcesPage.goto();
    await sourcesPage.waitForSourcesLoaded();
    await sourcesPage.openCreateForm();

    // Fill only name — amount is empty
    await sourcesPage.createNameInput.fill('Source With No Amount');

    // Submit button should be disabled
    await expect(sourcesPage.createSubmitButton).toBeDisabled();

    await sourcesPage.createCancelButton.click();
    await expect(sourcesPage.createFormHeading).not.toBeVisible({ timeout: 5000 });
  });

  test('"Create Source" button enabled when both name and amount are filled', async ({ page }) => {
    const sourcesPage = new BudgetSourcesPage(page);

    await sourcesPage.goto();
    await sourcesPage.waitForSourcesLoaded();
    await sourcesPage.openCreateForm();

    await sourcesPage.createNameInput.fill('Valid Source Name');
    await sourcesPage.createTotalAmountInput.fill('100000');

    await expect(sourcesPage.createSubmitButton).toBeEnabled();

    await sourcesPage.createCancelButton.click();
    await expect(sourcesPage.createFormHeading).not.toBeVisible({ timeout: 5000 });
  });

  test('"Add Source" button is disabled while create form is open', async ({ page }) => {
    const sourcesPage = new BudgetSourcesPage(page);

    await sourcesPage.goto();
    await sourcesPage.waitForSourcesLoaded();
    await sourcesPage.openCreateForm();

    await expect(sourcesPage.addSourceButton).toBeDisabled();

    await sourcesPage.createCancelButton.click();
    await expect(sourcesPage.createFormHeading).not.toBeVisible({ timeout: 5000 });
  });

  test('Cancel button dismisses create form without creating a source', async ({ page }) => {
    const sourcesPage = new BudgetSourcesPage(page);

    await sourcesPage.goto();
    await sourcesPage.waitForSourcesLoaded();

    const namesBefore = await sourcesPage.getSourceNames();

    await sourcesPage.openCreateForm();
    await sourcesPage.createNameInput.fill('Should Not Be Created');
    await sourcesPage.createTotalAmountInput.fill('10000');
    await sourcesPage.createCancelButton.click();

    await expect(sourcesPage.createFormHeading).not.toBeVisible({ timeout: 5000 });

    const namesAfter = await sourcesPage.getSourceNames();
    expect(namesAfter).not.toContain('Should Not Be Created');
    expect(namesAfter.length).toBe(namesBefore.length);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Edit source
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Edit source', { tag: '@responsive' }, () => {
  test('Edit source — save changes — updated values shown in list', async ({
    page,
    testPrefix,
  }) => {
    const sourcesPage = new BudgetSourcesPage(page);
    let createdId: string | null = null;
    const sourceName = `${testPrefix} Editable Source`;
    const updatedName = `${testPrefix} Updated Source Name`;

    try {
      createdId = await createSourceViaApi(page, {
        name: sourceName,
        totalAmount: 100000,
        interestRate: 4.5,
      });

      await sourcesPage.goto();
      await sourcesPage.waitForSourcesLoaded();

      // Start editing
      await sourcesPage.startEdit(sourceName);

      // Change the name
      const editForm = sourcesPage.getEditForm(sourceName);
      const nameInput = editForm.locator(`#edit-name-${createdId}`);
      await nameInput.fill(updatedName);

      // Save
      await sourcesPage.saveEdit(sourceName);

      // Then: Success banner appears
      const successText = await sourcesPage.getSuccessBannerText();
      expect(successText).toContain(updatedName);

      // And: Updated name shown in list
      const names = await sourcesPage.getSourceNames();
      expect(names).toContain(updatedName);
      expect(names).not.toContain(sourceName);

      // Name was updated; createdId still valid for cleanup
    } finally {
      if (createdId) await deleteSourceViaApi(page, createdId);
    }
  });

  test('Edit source — cancel restores original values', async ({ page, testPrefix }) => {
    const sourcesPage = new BudgetSourcesPage(page);
    let createdId: string | null = null;
    const sourceName = `${testPrefix} Cancel Edit Source`;

    try {
      createdId = await createSourceViaApi(page, { name: sourceName, totalAmount: 50000 });

      await sourcesPage.goto();
      await sourcesPage.waitForSourcesLoaded();

      await sourcesPage.startEdit(sourceName);

      // Change name but cancel
      const editForm = sourcesPage.getEditForm(sourceName);
      const nameInput = editForm.locator(`#edit-name-${createdId}`);
      await nameInput.fill('Modified Name That Should Not Save');
      await sourcesPage.cancelEdit(sourceName);

      // Original name still in list
      const names = await sourcesPage.getSourceNames();
      expect(names).toContain(sourceName);
      expect(names).not.toContain('Modified Name That Should Not Save');
    } finally {
      if (createdId) await deleteSourceViaApi(page, createdId);
    }
  });

  test('Edit — empty name disables Save button', async ({ page, testPrefix }) => {
    const sourcesPage = new BudgetSourcesPage(page);
    let createdId: string | null = null;
    const sourceName = `${testPrefix} Save Guard Source`;

    try {
      createdId = await createSourceViaApi(page, { name: sourceName, totalAmount: 30000 });

      await sourcesPage.goto();
      await sourcesPage.waitForSourcesLoaded();

      await sourcesPage.startEdit(sourceName);

      // Clear the name field
      const editForm = sourcesPage.getEditForm(sourceName);
      const nameInput = editForm.locator(`#edit-name-${createdId}`);
      await nameInput.fill('');

      // Save button disabled
      const saveButton = editForm.getByRole('button', { name: /^Save$|^Saving\.\.\.$/ });
      await expect(saveButton).toBeDisabled();

      // Cancel
      await sourcesPage.cancelEdit(sourceName);
    } finally {
      if (createdId) await deleteSourceViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Delete source
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Delete source', { tag: '@responsive' }, () => {
  test('Delete confirmation modal shows source name; confirming removes source from list', async ({
    page,
    testPrefix,
  }) => {
    const sourcesPage = new BudgetSourcesPage(page);
    const sourceName = `${testPrefix} Delete Target Source`;

    // Create a source to delete
    const createdId = await createSourceViaApi(page, { name: sourceName, totalAmount: 10000 });

    await sourcesPage.goto();
    await sourcesPage.waitForSourcesLoaded();

    const namesBefore = await sourcesPage.getSourceNames();
    expect(namesBefore).toContain(sourceName);

    // Open delete modal
    await sourcesPage.openDeleteModal(sourceName);
    await expect(sourcesPage.deleteModal).toBeVisible();

    // Modal title is "Delete Budget Source"
    await expect(sourcesPage.deleteModalTitle).toHaveText('Delete Budget Source');

    // Modal body mentions the source name
    const modalText = await sourcesPage.deleteModal.textContent();
    expect(modalText).toContain(sourceName);

    // Confirm deletion
    await sourcesPage.confirmDelete();

    // Modal closes
    await expect(sourcesPage.deleteModal).not.toBeVisible({ timeout: 8000 });

    // Success banner appears
    const successText = await sourcesPage.getSuccessBannerText();
    expect(successText).toContain('deleted');

    // Source removed from list
    await sourcesPage.waitForSourcesLoaded();
    const namesAfter = await sourcesPage.getSourceNames();
    expect(namesAfter).not.toContain(sourceName);

    // No API cleanup needed — source deleted via UI
    void createdId;
  });

  test('Cancelling delete modal leaves source in the list', async ({ page, testPrefix }) => {
    const sourcesPage = new BudgetSourcesPage(page);
    let createdId: string | null = null;
    const sourceName = `${testPrefix} Cancel Delete Source`;

    try {
      createdId = await createSourceViaApi(page, { name: sourceName, totalAmount: 20000 });

      await sourcesPage.goto();
      await sourcesPage.waitForSourcesLoaded();

      await sourcesPage.openDeleteModal(sourceName);
      await sourcesPage.cancelDelete();

      const names = await sourcesPage.getSourceNames();
      expect(names).toContain(sourceName);
    } finally {
      if (createdId) await deleteSourceViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Delete blocked by 409
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Delete blocked by 409', { tag: '@responsive' }, () => {
  test('409 on delete shows error in modal; confirm button hidden; source remains', async ({
    page,
    testPrefix,
  }) => {
    const sourcesPage = new BudgetSourcesPage(page);
    let createdId: string | null = null;
    const sourceName = `${testPrefix} Delete Blocked Source`;

    try {
      createdId = await createSourceViaApi(page, { name: sourceName, totalAmount: 5000 });

      // Intercept DELETE to return 409
      await page.route(`${API.budgetSources}/${createdId}`, async (route) => {
        if (route.request().method() === 'DELETE') {
          await route.fulfill({
            status: 409,
            contentType: 'application/json',
            body: JSON.stringify({
              error: {
                code: 'BUDGET_SOURCE_IN_USE',
                message:
                  'This budget source cannot be deleted because it is referenced by one or more budget entries.',
              },
            }),
          });
        } else {
          await route.continue();
        }
      });

      await sourcesPage.goto();
      await sourcesPage.waitForSourcesLoaded();

      await sourcesPage.openDeleteModal(sourceName);
      await sourcesPage.confirmDelete();

      // Error message appears in modal
      const errorText = await sourcesPage.getDeleteErrorText();
      expect(errorText).toBeTruthy();
      expect(errorText?.toLowerCase()).toMatch(/cannot be deleted|referenced|budget entries/);

      // Confirm button is hidden after error
      await expect(sourcesPage.deleteConfirmButton).not.toBeVisible({ timeout: 3000 });

      // Modal still open
      await expect(sourcesPage.deleteModal).toBeVisible();

      // Close modal
      await sourcesPage.cancelDelete();
    } finally {
      await page.unroute(`${API.budgetSources}/${createdId ?? ''}`);
      if (createdId) await deleteSourceViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Responsive layout
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Responsive layout', { tag: '@responsive' }, () => {
  test('Budget sources page renders without horizontal scroll on current viewport', async ({
    page,
  }) => {
    const sourcesPage = new BudgetSourcesPage(page);

    await sourcesPage.goto();
    await sourcesPage.waitForSourcesLoaded();

    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(hasHorizontalScroll).toBe(false);
  });

  test('Create form fields are visible and usable on current viewport', async ({ page }) => {
    const sourcesPage = new BudgetSourcesPage(page);

    await sourcesPage.goto();
    await sourcesPage.waitForSourcesLoaded();
    await sourcesPage.openCreateForm();

    await expect(sourcesPage.createNameInput).toBeVisible();
    await expect(sourcesPage.createTypeSelect).toBeVisible();
    await expect(sourcesPage.createTotalAmountInput).toBeVisible();
    await expect(sourcesPage.createSubmitButton).toBeVisible();

    await sourcesPage.createCancelButton.click();
    await expect(sourcesPage.createFormHeading).not.toBeVisible({ timeout: 5000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Dark mode rendering
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Dark mode rendering', { tag: '@responsive' }, () => {
  test('Budget sources page renders correctly in dark mode', async ({ page }) => {
    const sourcesPage = new BudgetSourcesPage(page);

    await page.goto('/budget/sources');
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });

    await sourcesPage.heading.waitFor({ state: 'visible', timeout: 8000 });

    // Heading visible
    await expect(sourcesPage.heading).toBeVisible();

    // "Add Source" button visible
    await expect(sourcesPage.addSourceButton).toBeVisible();

    // No horizontal scroll in dark mode
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(hasHorizontalScroll).toBe(false);
  });

  test('Create form inputs usable in dark mode', async ({ page }) => {
    const sourcesPage = new BudgetSourcesPage(page);

    await page.goto('/budget/sources');
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });

    await sourcesPage.heading.waitFor({ state: 'visible', timeout: 8000 });
    await sourcesPage.openCreateForm();

    await expect(sourcesPage.createNameInput).toBeVisible();
    await expect(sourcesPage.createTotalAmountInput).toBeVisible();
    await expect(sourcesPage.createSubmitButton).toBeVisible();

    await sourcesPage.createCancelButton.click();
    await expect(sourcesPage.createFormHeading).not.toBeVisible({ timeout: 5000 });
  });

  test('Delete modal usable in dark mode', async ({ page, testPrefix }) => {
    const sourcesPage = new BudgetSourcesPage(page);
    let createdId: string | null = null;
    const sourceName = `${testPrefix} Dark Mode Delete Source`;

    try {
      createdId = await createSourceViaApi(page, { name: sourceName, totalAmount: 15000 });

      await page.goto('/budget/sources');
      await page.evaluate(() => {
        document.documentElement.setAttribute('data-theme', 'dark');
      });

      await sourcesPage.heading.waitFor({ state: 'visible', timeout: 8000 });
      await sourcesPage.waitForSourcesLoaded();

      await sourcesPage.openDeleteModal(sourceName);

      await expect(sourcesPage.deleteModal).toBeVisible();
      await expect(sourcesPage.deleteConfirmButton).toBeVisible();
      await expect(sourcesPage.deleteCancelButton).toBeVisible();

      await sourcesPage.cancelDelete();
    } finally {
      if (createdId) await deleteSourceViaApi(page, createdId);
    }
  });
});
