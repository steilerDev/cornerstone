/**
 * E2E tests for Budget Sources management (Story #145, Issue #727)
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
 * - Discretionary Funding source — system source presence, no delete, type locked, zero amount edit
 * - Projected and Paid amount fields visible on source rows
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
  test('Page loads with h1 "Budget" and h2 "Sources"', { tag: '@smoke' }, async ({ page }) => {
    const sourcesPage = new BudgetSourcesPage(page);

    await sourcesPage.goto();
    // No explicit timeout — uses project-level actionTimeout (15s for WebKit).
    await sourcesPage.heading.waitFor({ state: 'visible' });

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
    // No explicit timeout — uses project-level actionTimeout (15s for WebKit).
    await sourcesPage.heading.waitFor({ state: 'visible' });

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

      // No explicit timeout — uses project-level expect.timeout (15s for WebKit).
      await expect(sourcesPage.emptyState).toBeVisible();
      const emptyText = await sourcesPage.emptyState.textContent();
      expect(emptyText?.toLowerCase()).toMatch(/no budget sources yet/);
    } finally {
      await page.unroute(`${API.budgetSources}`);
    }
  });

  test('"Add Source" button is visible and enabled on page load', async ({ page }) => {
    const sourcesPage = new BudgetSourcesPage(page);

    await sourcesPage.goto();
    // No explicit timeout — uses project-level actionTimeout (15s for WebKit).
    await sourcesPage.heading.waitFor({ state: 'visible' });

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
      // No explicit timeout — uses project-level expect.timeout (15s for WebKit).
      await expect(sourcesPage.createFormHeading).not.toBeVisible();

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
      // No explicit timeout — uses project-level expect.timeout (15s for WebKit).
      await expect(sourcesPage.createFormHeading).not.toBeVisible();

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

      // No explicit timeout — uses project-level expect.timeout (15s for WebKit).
      await expect(sourcesPage.createFormHeading).not.toBeVisible();

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
    // No explicit timeout — uses project-level expect.timeout (15s for WebKit).
    await expect(sourcesPage.createFormHeading).not.toBeVisible();
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
    // No explicit timeout — uses project-level expect.timeout (15s for WebKit).
    await expect(sourcesPage.createFormHeading).not.toBeVisible();
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
    // No explicit timeout — uses project-level expect.timeout (15s for WebKit).
    await expect(sourcesPage.createFormHeading).not.toBeVisible();
  });

  test('"Add Source" button is disabled while create form is open', async ({ page }) => {
    const sourcesPage = new BudgetSourcesPage(page);

    await sourcesPage.goto();
    await sourcesPage.waitForSourcesLoaded();
    await sourcesPage.openCreateForm();

    await expect(sourcesPage.addSourceButton).toBeDisabled();

    await sourcesPage.createCancelButton.click();
    // No explicit timeout — uses project-level expect.timeout (15s for WebKit).
    await expect(sourcesPage.createFormHeading).not.toBeVisible();
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

    // No explicit timeout — uses project-level expect.timeout (15s for WebKit).
    await expect(sourcesPage.createFormHeading).not.toBeVisible();

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
    // No explicit timeout — uses project-level expect.timeout (15s for WebKit).
    await expect(sourcesPage.deleteModal).not.toBeVisible();

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
      // No explicit timeout — uses project-level expect.timeout (15s for WebKit).
      await expect(sourcesPage.deleteConfirmButton).not.toBeVisible();

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
    // No explicit timeout — uses project-level expect.timeout (15s for WebKit).
    await expect(sourcesPage.createFormHeading).not.toBeVisible();
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

    // No explicit timeout — uses project-level actionTimeout (15s for WebKit).
    await sourcesPage.heading.waitFor({ state: 'visible' });

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

    // No explicit timeout — uses project-level actionTimeout (15s for WebKit).
    await sourcesPage.heading.waitFor({ state: 'visible' });
    await sourcesPage.openCreateForm();

    await expect(sourcesPage.createNameInput).toBeVisible();
    await expect(sourcesPage.createTotalAmountInput).toBeVisible();
    await expect(sourcesPage.createSubmitButton).toBeVisible();

    await sourcesPage.createCancelButton.click();
    // No explicit timeout — uses project-level expect.timeout (15s for WebKit).
    await expect(sourcesPage.createFormHeading).not.toBeVisible();
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

      // No explicit timeout — uses project-level actionTimeout (15s for WebKit).
      await sourcesPage.heading.waitFor({ state: 'visible' });
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

// ─────────────────────────────────────────────────────────────────────────────
// Discretionary Funding source (Issue #727)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Discretionary Funding source', () => {
  const DISCRETIONARY_NAME = 'Discretionary Funding';

  test(
    'Discretionary source is present on page load with System badge',
    { tag: '@smoke' },
    async ({ page }) => {
      const sourcesPage = new BudgetSourcesPage(page);

      await sourcesPage.goto();
      await sourcesPage.waitForSourcesLoaded();

      // The Discretionary Funding row must be visible
      const row = sourcesPage.getSourceRowByName(DISCRETIONARY_NAME);
      await expect(row).toBeVisible();

      // It must carry a "System" badge
      const systemBadge = sourcesPage.getSystemBadge(DISCRETIONARY_NAME);
      await expect(systemBadge).toBeVisible();
      await expect(systemBadge).toHaveText('System');
    },
  );

  test('Discretionary source has no Delete button', async ({ page }) => {
    const sourcesPage = new BudgetSourcesPage(page);

    await sourcesPage.goto();
    await sourcesPage.waitForSourcesLoaded();

    const row = sourcesPage.getSourceRowByName(DISCRETIONARY_NAME);
    await expect(row).toBeVisible();

    // The Delete button aria-label pattern used by all other rows
    const deleteButton = row.getByRole('button', { name: /^Delete /i });
    await expect(deleteButton).not.toBeVisible();
  });

  test('Discretionary source edit form — sourceType selector is disabled', async ({ page }) => {
    const sourcesPage = new BudgetSourcesPage(page);

    await sourcesPage.goto();
    await sourcesPage.waitForSourcesLoaded();

    // Retrieve the source id by querying the API
    const resp = await page.request.get(API.budgetSources);
    const body = (await resp.json()) as { budgetSources: BudgetSourceApiResponse[] };
    const discretionary = body.budgetSources.find((s) => s.name === DISCRETIONARY_NAME);
    expect(discretionary, 'Discretionary Funding source must exist in API response').toBeTruthy();
    const sourceId = discretionary!.id;

    // Open the edit form for the discretionary source
    await sourcesPage.startEdit(DISCRETIONARY_NAME);

    // The sourceType select must be disabled
    const typeSelect = sourcesPage.getEditTypeSelect(sourceId);
    await expect(typeSelect).toBeDisabled();

    // Clean up
    await sourcesPage.cancelEdit(DISCRETIONARY_NAME);
  });

  test('Discretionary source edit — totalAmount can be set to 0 and saved', async ({ page }) => {
    const sourcesPage = new BudgetSourcesPage(page);

    // Fetch the current totalAmount so we can restore it after the test
    const respBefore = await page.request.get(API.budgetSources);
    const bodyBefore = (await respBefore.json()) as { budgetSources: BudgetSourceApiResponse[] };
    const discretionaryBefore = bodyBefore.budgetSources.find((s) => s.name === DISCRETIONARY_NAME);
    expect(
      discretionaryBefore,
      'Discretionary Funding source must exist before edit test',
    ).toBeTruthy();
    const sourceId = discretionaryBefore!.id;
    const originalAmount = discretionaryBefore!.totalAmount;

    try {
      await sourcesPage.goto();
      await sourcesPage.waitForSourcesLoaded();

      await sourcesPage.startEdit(DISCRETIONARY_NAME);

      // Set totalAmount to 0
      const editForm = sourcesPage.getEditForm(DISCRETIONARY_NAME);
      const amountInput = editForm.locator(`#edit-amount-${sourceId}`);
      await amountInput.fill('0');

      // Verify the input accepted the value — fill() on number inputs can race
      // with React's controlled component state update, leaving the button disabled.
      await expect(amountInput).toHaveValue('0');

      // Wait for Save button to be enabled before clicking
      const saveButton = editForm.getByRole('button', { name: /^Save$|^Saving\.\.\.$/ });
      await expect(saveButton).toBeEnabled();

      // Register response listener BEFORE clicking save (per waitForResponse-before-action pattern).
      const saveResponse = page.waitForResponse(
        (resp) => resp.url().includes('/api/budget-sources') && resp.status() === 200,
      );
      await sourcesPage.saveEdit(DISCRETIONARY_NAME);
      await saveResponse;

      // Success banner must appear (updated successfully).
      // Use expect() with project-level expect.timeout (7s desktop / 15s WebKit) rather than
      // getSuccessBannerText() which catches timeouts and returns null, masking real failures.
      await expect(sourcesPage.successBanner).toBeVisible();
      await expect(sourcesPage.successBanner).toContainText(DISCRETIONARY_NAME);
    } finally {
      // Restore original totalAmount via API regardless of test outcome
      await page.request.patch(`${API.budgetSources}/${sourceId}`, {
        data: { totalAmount: originalAmount },
      });
    }
  });

  test('Bar chart and summary row are visible on source rows', async ({ page }) => {
    const sourcesPage = new BudgetSourcesPage(page);

    await sourcesPage.goto();
    await sourcesPage.waitForSourcesLoaded();

    // The Discretionary Funding row is always present — verify its bar chart section renders
    const row = sourcesPage.getSourceRowByName(DISCRETIONARY_NAME);
    await expect(row).toBeVisible();

    // The bar chart section (sourceBarSection) always renders regardless of amounts
    const barSection = row.locator('[class*="sourceBarSection"]');
    await expect(barSection).toBeVisible();

    // The summary row (Total / Available / Planned) always renders regardless of amounts
    const summaryItems = row.locator('[class*="summaryItem"]');
    const summaryCount = await summaryItems.count();
    // At minimum: Total, Available, Planned (3 items; Rate only appears when interestRate set)
    expect(summaryCount).toBeGreaterThanOrEqual(3);

    // Collect all summary item texts and verify they contain expected labels
    const summaryTexts = await summaryItems.allTextContents();
    const summaryNormalised = summaryTexts.map((t) => t.trim());
    expect(summaryNormalised.some((t) => t.includes('Total'))).toBe(true);
    expect(summaryNormalised.some((t) => t.includes('Available'))).toBe(true);
    expect(summaryNormalised.some((t) => t.includes('Planned'))).toBe(true);

    // If there are budget lines (non-zero amounts), legend labels should also render
    const legendLabels = sourcesPage.getAmountLabelsInRow(DISCRETIONARY_NAME);
    const legendCount = await legendLabels.count();
    if (legendCount > 0) {
      const labelTexts = await legendLabels.allTextContents();
      const normalised = labelTexts.map((t) => t.trim());
      // Known legend label values from SourceBarChart component
      const knownLabels = [
        'Claimed',
        'Paid (unclaimed)',
        'Projected',
        'Allocated (planned)',
        'Overflow',
      ];
      expect(normalised.every((l) => knownLabels.includes(l))).toBe(true);
    }
  });

  test('Discretionary source appears last in the sources list', async ({ page }) => {
    const sourcesPage = new BudgetSourcesPage(page);

    // Create a temporary source so there are at least two rows
    const tempName = 'ZZZ Temp Source For Order Check';
    let tempId: string | null = null;

    try {
      tempId = await createSourceViaApi(page, { name: tempName, totalAmount: 1000 });

      await sourcesPage.goto();
      await sourcesPage.waitForSourcesLoaded();

      const names = await sourcesPage.getSourceNames();
      expect(names.length).toBeGreaterThanOrEqual(2);

      // Discretionary Funding must be the last entry
      expect(names[names.length - 1]).toBe(DISCRETIONARY_NAME);
    } finally {
      if (tempId) await deleteSourceViaApi(page, tempId);
    }
  });
});
