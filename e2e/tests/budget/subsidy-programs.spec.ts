/**
 * E2E tests for Subsidy Programs management (Story #146)
 *
 * UAT Scenarios covered:
 * - Page loads with correct heading
 * - Empty state when no programs exist
 * - Create percentage-type program (all fields)
 * - Create fixed-amount program
 * - Create validation — button disabled without name or reduction value
 * - Category checkboxes visible when budget categories exist
 * - Edit program — save changes persist
 * - Edit program — cancel restores original
 * - Delete program — confirm removes from list
 * - Delete program — cancel leaves in list
 * - Delete blocked (409) — error shown, confirm button hidden
 * - Responsive layout: no horizontal scroll
 * - Dark mode rendering
 */

import { test, expect } from '../../fixtures/auth.js';
import type { Page } from '@playwright/test';
import { SubsidyProgramsPage } from '../../pages/SubsidyProgramsPage.js';
import { API } from '../../fixtures/testData.js';

// ─────────────────────────────────────────────────────────────────────────────
// API helpers
// ─────────────────────────────────────────────────────────────────────────────

interface SubsidyProgramApiData {
  name: string;
  reductionType?: 'percentage' | 'fixed';
  reductionValue: number;
  applicationStatus?: string;
  applicationDeadline?: string | null;
  description?: string | null;
  eligibility?: string | null;
  notes?: string | null;
  categoryIds?: string[];
}

interface SubsidyProgramApiResponse {
  id: string;
  name: string;
  reductionType: string;
  reductionValue: number;
  applicationStatus: string;
  applicationDeadline: string | null;
  description: string | null;
  eligibility: string | null;
  notes: string | null;
  applicableCategories: Array<{ id: string; name: string }>;
}

async function createProgramViaApi(page: Page, data: SubsidyProgramApiData): Promise<string> {
  const response = await page.request.post(API.subsidyPrograms, {
    data: {
      reductionType: 'percentage',
      applicationStatus: 'eligible',
      applicationDeadline: null,
      description: null,
      eligibility: null,
      notes: null,
      categoryIds: [],
      ...data,
    },
  });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { subsidyProgram: SubsidyProgramApiResponse };
  return body.subsidyProgram.id;
}

async function deleteProgramViaApi(page: Page, id: string): Promise<void> {
  await page.request.delete(`${API.subsidyPrograms}/${id}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Page heading and navigation
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Page heading and navigation', { tag: '@responsive' }, () => {
  test('Page loads with h1 "Budget" and h2 "Subsidy Programs"', async ({ page }) => {
    const subsidyPage = new SubsidyProgramsPage(page);

    await subsidyPage.goto();
    await subsidyPage.heading.waitFor({ state: 'visible', timeout: 5000 });

    await expect(subsidyPage.heading).toBeVisible();
    await expect(subsidyPage.heading).toHaveText('Budget');

    await expect(subsidyPage.sectionTitle).toBeVisible();
    await expect(subsidyPage.sectionTitle).toHaveText('Subsidy Programs');
  });

  test('Budget sub-navigation is visible', async ({ page }) => {
    const subsidyPage = new SubsidyProgramsPage(page);

    await subsidyPage.goto();
    await subsidyPage.heading.waitFor({ state: 'visible', timeout: 5000 });

    const subNav = page.getByRole('navigation', { name: 'Budget section navigation' });
    await expect(subNav).toBeVisible();

    // "Subsidies" tab present
    await expect(subNav.getByRole('listitem').filter({ hasText: 'Subsidies' })).toBeVisible();
  });

  test('Page URL is /budget/subsidies', async ({ page }) => {
    const subsidyPage = new SubsidyProgramsPage(page);

    await subsidyPage.goto();
    await page.waitForURL('/budget/subsidies');
    expect(page.url()).toContain('/budget/subsidies');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Empty state
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Empty state', { tag: '@responsive' }, () => {
  test('Empty state message shown when no programs exist', async ({ page }) => {
    const subsidyPage = new SubsidyProgramsPage(page);

    // Mock GET subsidy programs to return empty list; categories still returns real data
    await page.route(`${API.subsidyPrograms}`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ subsidyPrograms: [] }),
        });
      } else {
        await route.continue();
      }
    });

    try {
      await subsidyPage.goto();
      await subsidyPage.waitForProgramsLoaded();

      await expect(subsidyPage.emptyState).toBeVisible({ timeout: 8000 });
      const emptyText = await subsidyPage.emptyState.textContent();
      expect(emptyText?.toLowerCase()).toMatch(/no subsidy programs yet/);
    } finally {
      await page.unroute(`${API.subsidyPrograms}`);
    }
  });

  test('"Add Program" button is visible and enabled on page load', async ({ page }) => {
    const subsidyPage = new SubsidyProgramsPage(page);

    await subsidyPage.goto();
    await subsidyPage.heading.waitFor({ state: 'visible', timeout: 5000 });

    await expect(subsidyPage.addProgramButton).toBeVisible();
    await expect(subsidyPage.addProgramButton).toBeEnabled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Create program — percentage type
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Create program — percentage type', { tag: '@responsive' }, () => {
  test('Create percentage-type subsidy program with all fields — appears in list', async ({
    page,
    testPrefix,
  }) => {
    const subsidyPage = new SubsidyProgramsPage(page);
    let createdId: string | null = null;
    const programName = `${testPrefix} Energy Efficiency Rebate`;

    try {
      await subsidyPage.goto();
      await subsidyPage.waitForProgramsLoaded();
      await subsidyPage.openCreateForm();

      // Fill all fields for a percentage-type program
      await subsidyPage.createProgram({
        name: programName,
        reductionType: 'percentage',
        reductionValue: 15,
        applicationStatus: 'applied',
        applicationDeadline: '2026-12-31',
        description: 'Federal energy efficiency rebate for new construction',
        eligibility: 'New builds with ENERGY STAR certification',
        notes: 'Apply before breaking ground',
      });

      // Then: Form closes and success banner appears
      await expect(subsidyPage.createFormHeading).not.toBeVisible({ timeout: 8000 });

      const successText = await subsidyPage.getSuccessBannerText();
      expect(successText).toContain(programName);

      // And: Program appears in list
      await subsidyPage.waitForProgramsLoaded();
      const names = await subsidyPage.getProgramNames();
      expect(names).toContain(programName);
    } finally {
      // Cleanup: find ID and delete
      const resp = await page.request.get(API.subsidyPrograms);
      const body = (await resp.json()) as { subsidyPrograms: SubsidyProgramApiResponse[] };
      const found = body.subsidyPrograms.find((p) => p.name === programName);
      if (found) createdId = found.id;
      if (createdId) await deleteProgramViaApi(page, createdId);
    }
  });

  test('Program list row shows name and status badge after creation', async ({
    page,
    testPrefix,
  }) => {
    const subsidyPage = new SubsidyProgramsPage(page);
    let createdId: string | null = null;
    const programName = `${testPrefix} Badge Display Program`;

    try {
      createdId = await createProgramViaApi(page, {
        name: programName,
        reductionValue: 20,
        applicationStatus: 'approved',
      });

      await subsidyPage.goto();
      await subsidyPage.waitForProgramsLoaded();

      const row = await subsidyPage.getProgramRow(programName);
      expect(row).not.toBeNull();

      if (row) {
        const rowText = await row.textContent();
        // Status badge "Approved" visible in row
        expect(rowText).toContain('Approved');
        // Reduction badge "20%" visible
        expect(rowText).toContain('20%');
      }
    } finally {
      if (createdId) await deleteProgramViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Create program — fixed-amount type
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Create program — fixed-amount type', { tag: '@responsive' }, () => {
  test('Create fixed-amount subsidy program — reduction shown as currency in list', async ({
    page,
    testPrefix,
  }) => {
    const subsidyPage = new SubsidyProgramsPage(page);
    let createdId: string | null = null;
    const programName = `${testPrefix} First-Home Buyer Grant`;

    try {
      await subsidyPage.goto();
      await subsidyPage.waitForProgramsLoaded();
      await subsidyPage.openCreateForm();

      await subsidyPage.createProgram({
        name: programName,
        reductionType: 'fixed',
        reductionValue: 5000,
        applicationStatus: 'eligible',
      });

      await expect(subsidyPage.createFormHeading).not.toBeVisible({ timeout: 8000 });

      await subsidyPage.waitForProgramsLoaded();
      const names = await subsidyPage.getProgramNames();
      expect(names).toContain(programName);

      // The row should show the fixed reduction (formatted as currency)
      const row = await subsidyPage.getProgramRow(programName);
      if (row) {
        const rowText = await row.textContent();
        // Fixed amount formatted as currency — contains "5,000"
        expect(rowText).toMatch(/5,000/);
      }
    } finally {
      const resp = await page.request.get(API.subsidyPrograms);
      const body = (await resp.json()) as { subsidyPrograms: SubsidyProgramApiResponse[] };
      const found = body.subsidyPrograms.find((p) => p.name === programName);
      if (found) createdId = found.id;
      if (createdId) await deleteProgramViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Create validation
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Create validation', { tag: '@responsive' }, () => {
  test('"Create Program" button is disabled when name is empty', async ({ page }) => {
    const subsidyPage = new SubsidyProgramsPage(page);

    await subsidyPage.goto();
    await subsidyPage.waitForProgramsLoaded();
    await subsidyPage.openCreateForm();

    // Fill reduction value but not name
    await subsidyPage.createReductionValueInput.fill('10');

    await expect(subsidyPage.createSubmitButton).toBeDisabled();

    await subsidyPage.createCancelButton.click();
    await expect(subsidyPage.createFormHeading).not.toBeVisible({ timeout: 5000 });
  });

  test('"Create Program" button is disabled when reduction value is empty', async ({ page }) => {
    const subsidyPage = new SubsidyProgramsPage(page);

    await subsidyPage.goto();
    await subsidyPage.waitForProgramsLoaded();
    await subsidyPage.openCreateForm();

    // Fill name but not reduction value
    await subsidyPage.createNameInput.fill('Program With No Value');

    await expect(subsidyPage.createSubmitButton).toBeDisabled();

    await subsidyPage.createCancelButton.click();
    await expect(subsidyPage.createFormHeading).not.toBeVisible({ timeout: 5000 });
  });

  test('"Create Program" button enabled when name and reduction value filled', async ({ page }) => {
    const subsidyPage = new SubsidyProgramsPage(page);

    await subsidyPage.goto();
    await subsidyPage.waitForProgramsLoaded();
    await subsidyPage.openCreateForm();

    await subsidyPage.createNameInput.fill('Valid Program Name');
    await subsidyPage.createReductionValueInput.fill('25');

    await expect(subsidyPage.createSubmitButton).toBeEnabled();

    await subsidyPage.createCancelButton.click();
    await expect(subsidyPage.createFormHeading).not.toBeVisible({ timeout: 5000 });
  });

  test('"Add Program" button is disabled while create form is open', async ({ page }) => {
    const subsidyPage = new SubsidyProgramsPage(page);

    await subsidyPage.goto();
    await subsidyPage.waitForProgramsLoaded();
    await subsidyPage.openCreateForm();

    await expect(subsidyPage.addProgramButton).toBeDisabled();

    await subsidyPage.createCancelButton.click();
    await expect(subsidyPage.createFormHeading).not.toBeVisible({ timeout: 5000 });
  });

  test('Cancel dismisses create form without creating a program', async ({ page }) => {
    const subsidyPage = new SubsidyProgramsPage(page);

    await subsidyPage.goto();
    await subsidyPage.waitForProgramsLoaded();

    const countBefore = await subsidyPage.getProgramsCount();

    await subsidyPage.openCreateForm();
    await subsidyPage.createNameInput.fill('Should Not Be Created');
    await subsidyPage.createReductionValueInput.fill('5');
    await subsidyPage.createCancelButton.click();

    await expect(subsidyPage.createFormHeading).not.toBeVisible({ timeout: 5000 });

    const countAfter = await subsidyPage.getProgramsCount();
    expect(countAfter).toBe(countBefore);
    const names = await subsidyPage.getProgramNames();
    expect(names).not.toContain('Should Not Be Created');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Category checkboxes
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Category checkboxes in create form', { tag: '@responsive' }, () => {
  test('Category checkboxes visible in create form when budget categories exist', async ({
    page,
  }) => {
    const subsidyPage = new SubsidyProgramsPage(page);

    // Budget categories are seeded (10 defaults) so checkboxes should appear
    await subsidyPage.goto();
    await subsidyPage.waitForProgramsLoaded();
    await subsidyPage.openCreateForm();

    // The checkbox list should be visible
    await expect(subsidyPage.createCategoryCheckboxList).toBeVisible({ timeout: 5000 });

    // At least one default category (e.g. "Materials") should be listed
    const categoryNames = await subsidyPage.getCreateFormCategoryNames();
    expect(categoryNames.length).toBeGreaterThan(0);
    expect(categoryNames).toContain('Materials');

    await subsidyPage.createCancelButton.click();
    await expect(subsidyPage.createFormHeading).not.toBeVisible({ timeout: 5000 });
  });

  test('Checking a category associates it with a created program', async ({ page, testPrefix }) => {
    const subsidyPage = new SubsidyProgramsPage(page);
    let createdId: string | null = null;
    const programName = `${testPrefix} Category Linked Program`;

    try {
      await subsidyPage.goto();
      await subsidyPage.waitForProgramsLoaded();
      await subsidyPage.openCreateForm();

      // Create program with Materials category checked
      await subsidyPage.createProgram({
        name: programName,
        reductionValue: 10,
        categoryNames: ['Materials'],
      });

      await expect(subsidyPage.createFormHeading).not.toBeVisible({ timeout: 8000 });
      await subsidyPage.waitForProgramsLoaded();

      // Row for the created program should show the category pill
      const row = await subsidyPage.getProgramRow(programName);
      if (row) {
        const rowText = await row.textContent();
        expect(rowText).toContain('Materials');
      }
    } finally {
      const resp = await page.request.get(API.subsidyPrograms);
      const body = (await resp.json()) as { subsidyPrograms: SubsidyProgramApiResponse[] };
      const found = body.subsidyPrograms.find((p) => p.name === programName);
      if (found) createdId = found.id;
      if (createdId) await deleteProgramViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Edit program
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Edit program', { tag: '@responsive' }, () => {
  test('Edit program — save changes — updated values shown in list', async ({
    page,
    testPrefix,
  }) => {
    const subsidyPage = new SubsidyProgramsPage(page);
    let createdId: string | null = null;
    const originalName = `${testPrefix} Edit Save Program`;
    const updatedName = `${testPrefix} Edited Program Name`;

    try {
      createdId = await createProgramViaApi(page, {
        name: originalName,
        reductionValue: 10,
      });

      await subsidyPage.goto();
      await subsidyPage.waitForProgramsLoaded();

      await subsidyPage.startEdit(originalName);

      // Change the name in the edit form
      const editForm = subsidyPage.getEditForm(originalName);
      const nameInput = editForm.locator(`#edit-name-${createdId}`);
      await nameInput.fill(updatedName);

      await subsidyPage.saveEdit(originalName);

      // Then: Success banner appears with new name
      const successText = await subsidyPage.getSuccessBannerText();
      expect(successText).toContain(updatedName);

      // And: Updated name shown in list
      const names = await subsidyPage.getProgramNames();
      expect(names).toContain(updatedName);
      expect(names).not.toContain(originalName);
    } finally {
      if (createdId) await deleteProgramViaApi(page, createdId);
    }
  });

  test('Edit program — cancel restores original values', async ({ page, testPrefix }) => {
    const subsidyPage = new SubsidyProgramsPage(page);
    let createdId: string | null = null;
    const programName = `${testPrefix} Cancel Edit Program`;

    try {
      createdId = await createProgramViaApi(page, { name: programName, reductionValue: 5 });

      await subsidyPage.goto();
      await subsidyPage.waitForProgramsLoaded();

      await subsidyPage.startEdit(programName);

      // Change name but cancel
      const editForm = subsidyPage.getEditForm(programName);
      const nameInput = editForm.locator(`#edit-name-${createdId}`);
      await nameInput.fill('Modified Name That Should Not Save');
      await subsidyPage.cancelEdit(programName);

      // Original name still in list
      const names = await subsidyPage.getProgramNames();
      expect(names).toContain(programName);
      expect(names).not.toContain('Modified Name That Should Not Save');
    } finally {
      if (createdId) await deleteProgramViaApi(page, createdId);
    }
  });

  test('Edit — empty name disables Save button', async ({ page, testPrefix }) => {
    const subsidyPage = new SubsidyProgramsPage(page);
    let createdId: string | null = null;
    const programName = `${testPrefix} Save Guard Program`;

    try {
      createdId = await createProgramViaApi(page, { name: programName, reductionValue: 8 });

      await subsidyPage.goto();
      await subsidyPage.waitForProgramsLoaded();

      await subsidyPage.startEdit(programName);

      // Clear the name field
      const editForm = subsidyPage.getEditForm(programName);
      const nameInput = editForm.locator(`#edit-name-${createdId}`);
      await nameInput.fill('');

      const saveButton = editForm.getByRole('button', { name: /^Save$|^Saving\.\.\.$/ });
      await expect(saveButton).toBeDisabled();

      await subsidyPage.cancelEdit(programName);
    } finally {
      if (createdId) await deleteProgramViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Delete program
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Delete program', { tag: '@responsive' }, () => {
  test('Delete modal opens with program name; confirming removes program', async ({
    page,
    testPrefix,
  }) => {
    const subsidyPage = new SubsidyProgramsPage(page);
    const programName = `${testPrefix} Delete Target Program`;

    const createdId = await createProgramViaApi(page, {
      name: programName,
      reductionValue: 12,
    });

    await subsidyPage.goto();
    await subsidyPage.waitForProgramsLoaded();

    const namesBefore = await subsidyPage.getProgramNames();
    expect(namesBefore).toContain(programName);

    await subsidyPage.openDeleteModal(programName);
    await expect(subsidyPage.deleteModal).toBeVisible();

    // Modal title
    await expect(subsidyPage.deleteModalTitle).toHaveText('Delete Subsidy Program');

    // Modal body mentions the program name
    const modalText = await subsidyPage.deleteModal.textContent();
    expect(modalText).toContain(programName);

    // Confirm deletion
    await subsidyPage.confirmDelete();

    // Modal closes
    await expect(subsidyPage.deleteModal).not.toBeVisible({ timeout: 8000 });

    // Success banner
    const successText = await subsidyPage.getSuccessBannerText();
    expect(successText).toContain('deleted');

    // Program removed from list
    await subsidyPage.waitForProgramsLoaded();
    const namesAfter = await subsidyPage.getProgramNames();
    expect(namesAfter).not.toContain(programName);

    // No API cleanup needed
    void createdId;
  });

  test('Cancelling delete modal leaves program in the list', async ({ page, testPrefix }) => {
    const subsidyPage = new SubsidyProgramsPage(page);
    let createdId: string | null = null;
    const programName = `${testPrefix} Cancel Delete Program`;

    try {
      createdId = await createProgramViaApi(page, { name: programName, reductionValue: 7 });

      await subsidyPage.goto();
      await subsidyPage.waitForProgramsLoaded();

      await subsidyPage.openDeleteModal(programName);
      await subsidyPage.cancelDelete();

      const names = await subsidyPage.getProgramNames();
      expect(names).toContain(programName);
    } finally {
      if (createdId) await deleteProgramViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Delete blocked by 409
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Delete blocked by 409', { tag: '@responsive' }, () => {
  test('409 on delete shows error in modal; confirm button hidden; program remains', async ({
    page,
    testPrefix,
  }) => {
    const subsidyPage = new SubsidyProgramsPage(page);
    let createdId: string | null = null;
    const programName = `${testPrefix} Delete Blocked Program`;

    try {
      createdId = await createProgramViaApi(page, { name: programName, reductionValue: 3 });

      // Intercept DELETE to return 409
      await page.route(`${API.subsidyPrograms}/${createdId}`, async (route) => {
        if (route.request().method() === 'DELETE') {
          await route.fulfill({
            status: 409,
            contentType: 'application/json',
            body: JSON.stringify({
              error: {
                code: 'SUBSIDY_PROGRAM_IN_USE',
                message:
                  'This subsidy program cannot be deleted because it is referenced by one or more budget entries.',
              },
            }),
          });
        } else {
          await route.continue();
        }
      });

      await subsidyPage.goto();
      await subsidyPage.waitForProgramsLoaded();

      await subsidyPage.openDeleteModal(programName);
      await subsidyPage.confirmDelete();

      // Error shown in modal
      const errorText = await subsidyPage.getDeleteErrorText();
      expect(errorText).toBeTruthy();
      expect(errorText?.toLowerCase()).toMatch(/cannot be deleted|referenced|budget entries/);

      // Confirm button hidden after error
      await expect(subsidyPage.deleteConfirmButton).not.toBeVisible({ timeout: 3000 });

      // Modal still open
      await expect(subsidyPage.deleteModal).toBeVisible();

      // Close modal
      await subsidyPage.cancelDelete();
    } finally {
      await page.unroute(`${API.subsidyPrograms}/${createdId ?? ''}`);
      if (createdId) await deleteProgramViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Responsive layout
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Responsive layout', { tag: '@responsive' }, () => {
  test('Subsidy programs page renders without horizontal scroll on current viewport', async ({
    page,
  }) => {
    const subsidyPage = new SubsidyProgramsPage(page);

    await subsidyPage.goto();
    await subsidyPage.waitForProgramsLoaded();

    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(hasHorizontalScroll).toBe(false);
  });

  test('Create form fields are visible and usable on current viewport', async ({ page }) => {
    const subsidyPage = new SubsidyProgramsPage(page);

    await subsidyPage.goto();
    await subsidyPage.waitForProgramsLoaded();
    await subsidyPage.openCreateForm();

    await expect(subsidyPage.createNameInput).toBeVisible();
    await expect(subsidyPage.createReductionTypeSelect).toBeVisible();
    await expect(subsidyPage.createReductionValueInput).toBeVisible();
    await expect(subsidyPage.createApplicationStatusSelect).toBeVisible();
    await expect(subsidyPage.createSubmitButton).toBeVisible();

    await subsidyPage.createCancelButton.click();
    await expect(subsidyPage.createFormHeading).not.toBeVisible({ timeout: 5000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Dark mode rendering
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Dark mode rendering', { tag: '@responsive' }, () => {
  test('Subsidy programs page renders correctly in dark mode', async ({ page }) => {
    const subsidyPage = new SubsidyProgramsPage(page);

    await page.goto('/budget/subsidies');
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });

    await subsidyPage.heading.waitFor({ state: 'visible', timeout: 8000 });

    await expect(subsidyPage.heading).toBeVisible();
    await expect(subsidyPage.addProgramButton).toBeVisible();

    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(hasHorizontalScroll).toBe(false);
  });

  test('Create form inputs usable in dark mode', async ({ page }) => {
    const subsidyPage = new SubsidyProgramsPage(page);

    await page.goto('/budget/subsidies');
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });

    await subsidyPage.heading.waitFor({ state: 'visible', timeout: 8000 });
    await subsidyPage.openCreateForm();

    await expect(subsidyPage.createNameInput).toBeVisible();
    await expect(subsidyPage.createReductionValueInput).toBeVisible();
    await expect(subsidyPage.createSubmitButton).toBeVisible();

    await subsidyPage.createCancelButton.click();
    await expect(subsidyPage.createFormHeading).not.toBeVisible({ timeout: 5000 });
  });

  test('Delete modal usable in dark mode', async ({ page, testPrefix }) => {
    const subsidyPage = new SubsidyProgramsPage(page);
    let createdId: string | null = null;
    const programName = `${testPrefix} Dark Mode Delete Program`;

    try {
      createdId = await createProgramViaApi(page, { name: programName, reductionValue: 5 });

      await page.goto('/budget/subsidies');
      await page.evaluate(() => {
        document.documentElement.setAttribute('data-theme', 'dark');
      });

      await subsidyPage.heading.waitFor({ state: 'visible', timeout: 8000 });
      await subsidyPage.waitForProgramsLoaded();

      await subsidyPage.openDeleteModal(programName);

      await expect(subsidyPage.deleteModal).toBeVisible();
      await expect(subsidyPage.deleteConfirmButton).toBeVisible();
      await expect(subsidyPage.deleteCancelButton).toBeVisible();

      await subsidyPage.cancelDelete();
    } finally {
      if (createdId) await deleteProgramViaApi(page, createdId);
    }
  });
});
