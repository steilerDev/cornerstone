/**
 * E2E tests for Subsidy Program maximum amount field and cap badge (Issue #728)
 *
 * UAT Scenarios covered:
 * - Create program with maximum amount — cap badge appears with correct value
 * - Create program without maximum amount — no cap badge shown
 * - Edit program to add maximum amount — cap badge appears after save
 * - Edit program to remove maximum amount — cap badge disappears after save
 * - Create form: maximumAmount input visible and accepts numeric value
 * - Edit form: maximumAmount input pre-populated with existing value
 */

import { test, expect } from '../../fixtures/auth.js';
import type { Page } from '@playwright/test';
import { SubsidyProgramsPage } from '../../pages/SubsidyProgramsPage.js';
import { API } from '../../fixtures/testData.js';

// ─────────────────────────────────────────────────────────────────────────────
// API helpers
// ─────────────────────────────────────────────────────────────────────────────

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
  maximumAmount: number | null;
  applicableCategories: Array<{ id: string; name: string }>;
}

interface CreateSubsidyProgramApiData {
  name: string;
  reductionType?: 'percentage' | 'fixed';
  reductionValue: number;
  applicationStatus?: string;
  maximumAmount?: number | null;
}

async function createProgramViaApi(page: Page, data: CreateSubsidyProgramApiData): Promise<string> {
  const response = await page.request.post(API.subsidyPrograms, {
    data: {
      reductionType: 'percentage',
      applicationStatus: 'eligible',
      applicationDeadline: null,
      description: null,
      eligibility: null,
      notes: null,
      categoryIds: [],
      maximumAmount: null,
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
// Create form — maximum amount field
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Create form — maximum amount field', { tag: '@responsive' }, () => {
  test('Maximum amount input is visible in the create form', async ({ page }) => {
    const subsidyPage = new SubsidyProgramsPage(page);

    await subsidyPage.goto();
    await subsidyPage.waitForProgramsLoaded();
    await subsidyPage.openCreateForm();

    const maxAmountInput = page.locator('#maximumAmount');
    // No explicit timeout — uses project-level expect.timeout (15s for WebKit).
    await expect(maxAmountInput).toBeVisible();
    await expect(maxAmountInput).toHaveAttribute('placeholder', 'No limit');

    await subsidyPage.createCancelButton.click();
    await expect(subsidyPage.createFormHeading).not.toBeVisible();
  });

  test('Create program with maximum amount — cap badge shown in list', async ({
    page,
    testPrefix,
  }) => {
    const subsidyPage = new SubsidyProgramsPage(page);
    let createdId: string | null = null;
    const programName = `${testPrefix} Cap Badge Program`;

    try {
      await subsidyPage.goto();
      await subsidyPage.waitForProgramsLoaded();
      await subsidyPage.openCreateForm();

      await subsidyPage.createNameInput.fill(programName);
      await subsidyPage.createReductionValueInput.fill('10');
      await page.locator('#maximumAmount').fill('5000');
      await subsidyPage.createSubmitButton.click();

      // Form closes after successful creation
      // No explicit timeout — uses project-level expect.timeout (15s for WebKit).
      await expect(subsidyPage.createFormHeading).not.toBeVisible();
      await subsidyPage.waitForProgramsLoaded();

      // Cap badge should appear on the created program row
      const row = await subsidyPage.getProgramRow(programName);
      expect(row).not.toBeNull();
      if (row) {
        const capBadge = row.locator('[class*="maxAmountBadge"]');
        await expect(capBadge).toBeVisible();
        const badgeText = await capBadge.textContent();
        // formatCurrency(5000) → "€5,000.00"
        expect(badgeText).toMatch(/Cap:/);
        expect(badgeText).toMatch(/5,000/);
      }
    } finally {
      const resp = await page.request.get(API.subsidyPrograms);
      const body = (await resp.json()) as { subsidyPrograms: SubsidyProgramApiResponse[] };
      const found = body.subsidyPrograms.find((p) => p.name === programName);
      if (found) createdId = found.id;
      if (createdId) await deleteProgramViaApi(page, createdId);
    }
  });

  test('Create program without maximum amount — no cap badge shown', async ({
    page,
    testPrefix,
  }) => {
    const subsidyPage = new SubsidyProgramsPage(page);
    let createdId: string | null = null;
    const programName = `${testPrefix} No Cap Program`;

    try {
      await subsidyPage.goto();
      await subsidyPage.waitForProgramsLoaded();
      await subsidyPage.openCreateForm();

      // Fill required fields only — leave maximumAmount empty
      await subsidyPage.createNameInput.fill(programName);
      await subsidyPage.createReductionValueInput.fill('15');
      await subsidyPage.createSubmitButton.click();

      // No explicit timeout — uses project-level expect.timeout (15s for WebKit).
      await expect(subsidyPage.createFormHeading).not.toBeVisible();
      await subsidyPage.waitForProgramsLoaded();

      const row = await subsidyPage.getProgramRow(programName);
      expect(row).not.toBeNull();
      if (row) {
        // No cap badge on a program without a maximum amount
        const capBadge = row.locator('[class*="maxAmountBadge"]');
        await expect(capBadge).not.toBeVisible();
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
// Edit form — maximum amount field
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Edit form — maximum amount field', { tag: '@responsive' }, () => {
  test('Edit form pre-populates maximum amount when program has one', async ({
    page,
    testPrefix,
  }) => {
    const subsidyPage = new SubsidyProgramsPage(page);
    let createdId: string | null = null;
    const programName = `${testPrefix} Edit Prepopulate Cap`;

    try {
      createdId = await createProgramViaApi(page, {
        name: programName,
        reductionValue: 10,
        maximumAmount: 8000,
      });

      await subsidyPage.goto();
      await subsidyPage.waitForProgramsLoaded();
      await subsidyPage.startEdit(programName);

      const editMaxInput = page.locator(`#edit-maximumamount-${createdId}`);
      // No explicit timeout — uses project-level expect.timeout (15s for WebKit).
      await expect(editMaxInput).toBeVisible();
      await expect(editMaxInput).toHaveValue('8000');

      await subsidyPage.cancelEdit(programName);
    } finally {
      if (createdId) await deleteProgramViaApi(page, createdId);
    }
  });

  test('Edit program to add maximum amount — cap badge appears after save', async ({
    page,
    testPrefix,
  }) => {
    const subsidyPage = new SubsidyProgramsPage(page);
    let createdId: string | null = null;
    const programName = `${testPrefix} Add Cap Via Edit`;

    try {
      // Create program without a maximum amount
      createdId = await createProgramViaApi(page, {
        name: programName,
        reductionValue: 10,
        maximumAmount: null,
      });

      await subsidyPage.goto();
      await subsidyPage.waitForProgramsLoaded();

      // Verify no cap badge before edit
      const rowBefore = await subsidyPage.getProgramRow(programName);
      expect(rowBefore).not.toBeNull();
      if (rowBefore) {
        await expect(rowBefore.locator('[class*="maxAmountBadge"]')).not.toBeVisible();
      }

      // Enter edit mode and set maximum amount
      await subsidyPage.startEdit(programName);
      const editMaxInput = page.locator(`#edit-maximumamount-${createdId}`);
      await editMaxInput.fill('3000');
      await subsidyPage.saveEdit(programName);

      // Wait for list to reload
      await subsidyPage.waitForProgramsLoaded();

      // Cap badge should now appear
      const rowAfter = await subsidyPage.getProgramRow(programName);
      expect(rowAfter).not.toBeNull();
      if (rowAfter) {
        const capBadge = rowAfter.locator('[class*="maxAmountBadge"]');
        // No explicit timeout — uses project-level expect.timeout (15s for WebKit).
        await expect(capBadge).toBeVisible();
        const badgeText = await capBadge.textContent();
        expect(badgeText).toMatch(/Cap:/);
        expect(badgeText).toMatch(/3,000/);
      }
    } finally {
      if (createdId) await deleteProgramViaApi(page, createdId);
    }
  });

  test('Edit program to remove maximum amount — cap badge disappears after save', async ({
    page,
    testPrefix,
  }) => {
    const subsidyPage = new SubsidyProgramsPage(page);
    let createdId: string | null = null;
    const programName = `${testPrefix} Remove Cap Via Edit`;

    try {
      // Create program with a maximum amount
      createdId = await createProgramViaApi(page, {
        name: programName,
        reductionValue: 10,
        maximumAmount: 10000,
      });

      await subsidyPage.goto();
      await subsidyPage.waitForProgramsLoaded();

      // Verify cap badge is visible before edit
      const rowBefore = await subsidyPage.getProgramRow(programName);
      expect(rowBefore).not.toBeNull();
      if (rowBefore) {
        const capBadgeBefore = rowBefore.locator('[class*="maxAmountBadge"]');
        // No explicit timeout — uses project-level expect.timeout (15s for WebKit).
        await expect(capBadgeBefore).toBeVisible();
      }

      // Enter edit mode and clear the maximum amount
      await subsidyPage.startEdit(programName);
      const editMaxInput = page.locator(`#edit-maximumamount-${createdId}`);
      await editMaxInput.clear();
      await subsidyPage.saveEdit(programName);

      // Wait for list to reload
      await subsidyPage.waitForProgramsLoaded();

      // Cap badge should no longer be visible
      const rowAfter = await subsidyPage.getProgramRow(programName);
      expect(rowAfter).not.toBeNull();
      if (rowAfter) {
        const capBadgeAfter = rowAfter.locator('[class*="maxAmountBadge"]');
        // No explicit timeout — uses project-level expect.timeout (15s for WebKit).
        await expect(capBadgeAfter).not.toBeVisible();
      }
    } finally {
      if (createdId) await deleteProgramViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cap badge display accuracy
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Cap badge display accuracy', { tag: '@responsive' }, () => {
  test('Cap badge shows correctly formatted currency value', async ({ page, testPrefix }) => {
    const subsidyPage = new SubsidyProgramsPage(page);
    let createdId: string | null = null;
    const programName = `${testPrefix} Cap Format Program`;

    try {
      // Create with a precise decimal maximum amount
      createdId = await createProgramViaApi(page, {
        name: programName,
        reductionValue: 5,
        maximumAmount: 12500.5,
      });

      await subsidyPage.goto();
      await subsidyPage.waitForProgramsLoaded();

      const row = await subsidyPage.getProgramRow(programName);
      expect(row).not.toBeNull();
      if (row) {
        const capBadge = row.locator('[class*="maxAmountBadge"]');
        // No explicit timeout — uses project-level expect.timeout (15s for WebKit).
        await expect(capBadge).toBeVisible();
        const badgeText = await capBadge.textContent();
        // formatCurrency(12500.5) should produce "€12,500.50"
        expect(badgeText).toMatch(/Cap:/);
        expect(badgeText).toMatch(/12,500/);
      }
    } finally {
      if (createdId) await deleteProgramViaApi(page, createdId);
    }
  });

  test('Program row shows cap badge alongside status and reduction badges', async ({
    page,
    testPrefix,
  }) => {
    const subsidyPage = new SubsidyProgramsPage(page);
    let createdId: string | null = null;
    const programName = `${testPrefix} Badge Coexist Program`;

    try {
      createdId = await createProgramViaApi(page, {
        name: programName,
        reductionType: 'percentage',
        reductionValue: 20,
        applicationStatus: 'approved',
        maximumAmount: 7500,
      });

      await subsidyPage.goto();
      await subsidyPage.waitForProgramsLoaded();

      const row = await subsidyPage.getProgramRow(programName);
      expect(row).not.toBeNull();
      if (row) {
        const rowText = await row.textContent();
        // Status badge
        expect(rowText).toContain('Approved');
        // Reduction badge
        expect(rowText).toContain('20%');
        // Cap badge
        expect(rowText).toMatch(/Cap:.*7,500/);
      }
    } finally {
      if (createdId) await deleteProgramViaApi(page, createdId);
    }
  });
});
