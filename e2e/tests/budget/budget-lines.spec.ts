/**
 * E2E tests for Budget Line CRUD and Subsidy Linking (EPIC-14 validation)
 *
 * EPIC-14 refactored the budget section into shared components:
 *   - BudgetLineForm  (shared form for add / edit)
 *   - BudgetLineCard  (shared display card with Edit / Delete actions)
 *   - SubsidyLinkSection (shared subsidy picker and linked-subsidy list)
 *   - useBudgetSection hook (shared state management)
 *
 * These tests verify that the shared components work correctly when rendered
 * on both the Work Item detail page and the Household Item detail page.
 * The existing detail-page specs only verify that the "Add Line" button is
 * visible; they do not exercise the actual add/edit/delete/subsidy flows.
 *
 * Scenarios:
 *  1. Work Item — Add a budget line and verify it appears
 *  2. Work Item — Edit a budget line and verify the updated values appear
 *  3. Work Item — Delete a budget line and verify it is removed
 *  4. Work Item — Link a subsidy program and verify it appears in the section
 *  5. Work Item — Unlink a subsidy program and verify it is removed
 *  6. Household Item — Add a budget line and verify it appears
 *  7. Household Item — Delete a budget line and verify it is removed
 *  8. Work Item — Add budget line form validation (disabled when amount empty)
 *  9. Work Item — Cancel add form without saving
 * 10. Work Item — BudgetLineCard displays confidence label and margin
 */

import { test, expect } from '../../fixtures/auth.js';
import type { Page } from '@playwright/test';
import {
  createWorkItemViaApi,
  deleteWorkItemViaApi,
  createHouseholdItemViaApi,
  deleteHouseholdItemViaApi,
  createSubsidyProgramViaApi,
  deleteSubsidyProgramViaApi,
} from '../../fixtures/apiHelpers.js';
import { API } from '../../fixtures/testData.js';

// ─────────────────────────────────────────────────────────────────────────────
// API helpers — budget lines (work item)
// ─────────────────────────────────────────────────────────────────────────────

interface BudgetLineApiData {
  plannedAmount: number;
  confidence?: string;
  description?: string | null;
  budgetCategoryId?: string | null;
  budgetSourceId?: string | null;
  vendorId?: string | null;
}

interface BudgetLineApiResponse {
  id: string;
  plannedAmount: number;
  confidence: string;
  description: string | null;
}

async function createWorkItemBudgetLineViaApi(
  page: Page,
  workItemId: string,
  data: BudgetLineApiData,
): Promise<string> {
  const response = await page.request.post(`${API.workItems}/${workItemId}/budgets`, {
    data: { confidence: 'own_estimate', ...data },
  });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { budget: BudgetLineApiResponse };
  return body.budget.id;
}

async function createHouseholdItemBudgetLineViaApi(
  page: Page,
  householdItemId: string,
  data: BudgetLineApiData,
): Promise<string> {
  const response = await page.request.post(`${API.householdItems}/${householdItemId}/budgets`, {
    data: { confidence: 'own_estimate', ...data },
  });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { budget: BudgetLineApiResponse };
  return body.budget.id;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers — navigate and wait for budget section
// ─────────────────────────────────────────────────────────────────────────────

async function gotoWorkItemAndWaitForBudget(page: Page, workItemId: string): Promise<void> {
  await page.goto(`/work-items/${workItemId}`);
  // Wait for the page to finish loading (h1 visible)
  await page.getByRole('heading', { level: 1 }).waitFor({ state: 'visible', timeout: 15000 });
  // Scroll budget section into view
  const budgetSection = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { level: 2, name: 'Budget', exact: true }) });
  await budgetSection.scrollIntoViewIfNeeded();
}

async function gotoHouseholdItemAndWaitForBudget(
  page: Page,
  householdItemId: string,
): Promise<void> {
  await page.goto(`/household-items/${householdItemId}`);
  await page.getByRole('heading', { level: 1 }).waitFor({ state: 'visible', timeout: 15000 });
  const budgetSection = page.getByRole('heading', { name: /budget/i, level: 2 });
  await budgetSection.scrollIntoViewIfNeeded();
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: Work Item — Add a budget line
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Work Item — Add budget line (Scenario 1)', { tag: '@responsive' }, () => {
  test('Adding a budget line displays it in the budget section', async ({ page, testPrefix }) => {
    let workItemId: string | null = null;

    try {
      workItemId = await createWorkItemViaApi(page, {
        title: `${testPrefix} Budget Line Add Test`,
      });

      await gotoWorkItemAndWaitForBudget(page, workItemId);

      // Click "Add budget line" button
      const addButton = page.getByRole('button', { name: 'Add budget line' });
      await expect(addButton).toBeVisible();
      await addButton.click();

      // The form should appear (BudgetLineForm shared component)
      // Submit button text is "Add Line" when not editing
      const submitButton = page.getByRole('button', { name: 'Add Line', exact: true });
      await expect(submitButton).toBeVisible({ timeout: 5000 });

      // Fill planned amount (required field)
      const plannedAmountInput = page.locator('#budget-planned-amount');
      await expect(plannedAmountInput).toBeVisible();
      await plannedAmountInput.fill('1500');

      // Optionally fill description
      const descriptionInput = page.locator('#budget-description');
      await descriptionInput.fill(`${testPrefix} Foundation work`);

      // Submit is now enabled
      await expect(submitButton).toBeEnabled();
      await submitButton.click();

      // The form should close and the budget line card should appear
      // BudgetLineCard shows the planned amount formatted as currency
      await expect(submitButton).not.toBeVisible({ timeout: 10000 });

      // The card should display the amount (€1,500.00 or similar)
      const budgetSection = page
        .locator('section')
        .filter({ has: page.getByRole('heading', { level: 2, name: 'Budget', exact: true }) });
      // Use a pattern that matches "1,500" anywhere in the budget section
      await expect(budgetSection.getByText(/1[,.]500/, { exact: false })).toBeVisible({
        timeout: 10000,
      });
    } finally {
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
    }
  });

  test('Add budget line form is dismissed by Cancel button', async ({ page, testPrefix }) => {
    let workItemId: string | null = null;

    try {
      workItemId = await createWorkItemViaApi(page, {
        title: `${testPrefix} Budget Cancel Test`,
      });

      await gotoWorkItemAndWaitForBudget(page, workItemId);

      const addButton = page.getByRole('button', { name: 'Add budget line' });
      await addButton.click();

      const submitButton = page.getByRole('button', { name: 'Add Line', exact: true });
      await expect(submitButton).toBeVisible({ timeout: 5000 });

      // Click Cancel
      const cancelButton = page.getByRole('button', { name: 'Cancel', exact: true });
      await expect(cancelButton).toBeVisible();
      await cancelButton.click();

      // Form should close without adding a line
      await expect(submitButton).not.toBeVisible({ timeout: 5000 });

      // Add button should be visible again
      await expect(addButton).toBeVisible();
    } finally {
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 8: Add budget line form validation
// ─────────────────────────────────────────────────────────────────────────────
test.describe(
  'Work Item — Budget line form validation (Scenario 8)',
  { tag: '@responsive' },
  () => {
    test('Add Line button is disabled when planned amount is empty', async ({
      page,
      testPrefix,
    }) => {
      let workItemId: string | null = null;

      try {
        workItemId = await createWorkItemViaApi(page, {
          title: `${testPrefix} Budget Validation Test`,
        });

        await gotoWorkItemAndWaitForBudget(page, workItemId);

        const addButton = page.getByRole('button', { name: 'Add budget line' });
        await addButton.click();

        const submitButton = page.getByRole('button', { name: 'Add Line', exact: true });
        await expect(submitButton).toBeVisible({ timeout: 5000 });

        // Initially disabled (amount is empty)
        await expect(submitButton).toBeDisabled();

        // Fill description but not amount — still disabled
        await page.locator('#budget-description').fill('test description');
        await expect(submitButton).toBeDisabled();

        // Fill amount — now enabled
        await page.locator('#budget-planned-amount').fill('500');
        await expect(submitButton).toBeEnabled();

        // Clear amount again — disabled
        await page.locator('#budget-planned-amount').fill('');
        await expect(submitButton).toBeDisabled();

        // Cancel
        await page.getByRole('button', { name: 'Cancel', exact: true }).click();
        await expect(submitButton).not.toBeVisible({ timeout: 5000 });
      } finally {
        if (workItemId) await deleteWorkItemViaApi(page, workItemId);
      }
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: Work Item — Edit a budget line
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Work Item — Edit budget line (Scenario 2)', { tag: '@responsive' }, () => {
  test('Editing a budget line updates its displayed values', async ({ page, testPrefix }) => {
    let workItemId: string | null = null;

    try {
      workItemId = await createWorkItemViaApi(page, {
        title: `${testPrefix} Budget Line Edit Test`,
      });

      // Create a budget line via API so we have something to edit
      await createWorkItemBudgetLineViaApi(page, workItemId, {
        plannedAmount: 2000,
        description: `${testPrefix} Original description`,
        confidence: 'own_estimate',
      });

      await gotoWorkItemAndWaitForBudget(page, workItemId);

      // The budget section should show the card
      const budgetSection = page
        .locator('section')
        .filter({ has: page.getByRole('heading', { level: 2, name: 'Budget', exact: true }) });
      await expect(budgetSection.getByText(/2[,.]000/, { exact: false })).toBeVisible({
        timeout: 10000,
      });

      // Click the Edit button on the BudgetLineCard
      const editButton = budgetSection.getByRole('button', { name: /^Edit$/i }).first();
      await expect(editButton).toBeVisible();
      await editButton.click();

      // The form should appear with "Save Changes" text (isEditing=true in BudgetLineForm)
      const saveButton = page.getByRole('button', { name: 'Save Changes', exact: true });
      await expect(saveButton).toBeVisible({ timeout: 5000 });

      // Update the planned amount
      const plannedAmountInput = page.locator('#budget-planned-amount');
      await plannedAmountInput.fill('2500');

      await expect(saveButton).toBeEnabled();
      await saveButton.click();

      // Form closes; updated amount appears
      await expect(saveButton).not.toBeVisible({ timeout: 10000 });
      await expect(budgetSection.getByText(/2[,.]500/, { exact: false })).toBeVisible({
        timeout: 10000,
      });
    } finally {
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: Work Item — Delete a budget line
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Work Item — Delete budget line (Scenario 3)', { tag: '@responsive' }, () => {
  test('Deleting a budget line removes it from the budget section', async ({
    page,
    testPrefix,
  }) => {
    let workItemId: string | null = null;

    try {
      workItemId = await createWorkItemViaApi(page, {
        title: `${testPrefix} Budget Line Delete Test`,
      });

      // Create a budget line via API
      await createWorkItemBudgetLineViaApi(page, workItemId, {
        plannedAmount: 3000,
        description: `${testPrefix} Line to delete`,
        confidence: 'quote',
      });

      await gotoWorkItemAndWaitForBudget(page, workItemId);

      const budgetSection = page
        .locator('section')
        .filter({ has: page.getByRole('heading', { level: 2, name: 'Budget', exact: true }) });
      await expect(budgetSection.getByText(/3[,.]000/, { exact: false })).toBeVisible({
        timeout: 10000,
      });

      // Click the Delete button on the BudgetLineCard — shows inline confirm/cancel
      const deleteButton = budgetSection.getByRole('button', { name: /^Delete$/i }).first();
      await expect(deleteButton).toBeVisible();
      await deleteButton.click();

      // BudgetLineCard shows Confirm / Cancel inline buttons
      const confirmButton = budgetSection.getByRole('button', { name: 'Confirm', exact: true });
      await expect(confirmButton).toBeVisible({ timeout: 5000 });

      await confirmButton.click();

      // Line is removed — amount no longer visible
      await expect(budgetSection.getByText(/3[,.]000/, { exact: false })).not.toBeVisible({
        timeout: 10000,
      });
    } finally {
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
    }
  });

  test('Cancel on delete confirmation keeps the budget line', async ({ page, testPrefix }) => {
    let workItemId: string | null = null;

    try {
      workItemId = await createWorkItemViaApi(page, {
        title: `${testPrefix} Budget Line Cancel Delete Test`,
      });

      await createWorkItemBudgetLineViaApi(page, workItemId, {
        plannedAmount: 750,
        confidence: 'professional_estimate',
      });

      await gotoWorkItemAndWaitForBudget(page, workItemId);

      const budgetSection = page
        .locator('section')
        .filter({ has: page.getByRole('heading', { level: 2, name: 'Budget', exact: true }) });
      await expect(budgetSection.getByText(/750/, { exact: false })).toBeVisible({
        timeout: 10000,
      });

      const deleteButton = budgetSection.getByRole('button', { name: /^Delete$/i }).first();
      await deleteButton.click();

      // Confirm/Cancel appear
      const confirmButton = budgetSection.getByRole('button', { name: 'Confirm', exact: true });
      await expect(confirmButton).toBeVisible({ timeout: 5000 });

      // Click Cancel (inline cancel button in the card)
      const inlineCancelButton = budgetSection
        .getByRole('button', { name: 'Cancel', exact: true })
        .first();
      await inlineCancelButton.click();

      // Confirm button gone; line still present
      await expect(confirmButton).not.toBeVisible({ timeout: 5000 });
      await expect(budgetSection.getByText(/750/, { exact: false })).toBeVisible();
    } finally {
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: Work Item — Link a subsidy program
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Work Item — Link subsidy program (Scenario 4)', { tag: '@responsive' }, () => {
  test('Linking a subsidy program shows it in the Subsidies subsection', async ({
    page,
    testPrefix,
  }) => {
    let workItemId: string | null = null;
    let subsidyId: string | null = null;
    const subsidyName = `${testPrefix} Energy Rebate WI`;

    try {
      workItemId = await createWorkItemViaApi(page, {
        title: `${testPrefix} Subsidy Link Test`,
      });
      subsidyId = await createSubsidyProgramViaApi(page, {
        name: subsidyName,
        reductionValue: 10,
        reductionType: 'percentage',
      });

      await gotoWorkItemAndWaitForBudget(page, workItemId);

      const budgetSection = page
        .locator('section')
        .filter({ has: page.getByRole('heading', { level: 2, name: 'Budget', exact: true }) });

      // The SubsidyLinkSection renders a select with aria-label "Select subsidy program to link"
      const subsidyPicker = budgetSection.getByLabel('Select subsidy program to link');
      await expect(subsidyPicker).toBeVisible({ timeout: 10000 });

      // Select the subsidy
      await subsidyPicker.selectOption({ label: subsidyName });

      // Click "Add Subsidy" button
      const addSubsidyButton = budgetSection.getByRole('button', { name: /Add Subsidy/i });
      await expect(addSubsidyButton).toBeEnabled();
      await addSubsidyButton.click();

      // SubsidyLinkSection shows the linked subsidy by name
      await expect(
        budgetSection.locator('[class*="linkedItemName"]').filter({ hasText: subsidyName }),
      ).toBeVisible({ timeout: 10000 });
    } finally {
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
      if (subsidyId) await deleteSubsidyProgramViaApi(page, subsidyId);
    }
  });

  test('"Add Subsidy" button is disabled until a subsidy is selected', async ({
    page,
    testPrefix,
  }) => {
    let workItemId: string | null = null;
    let subsidyId: string | null = null;

    try {
      workItemId = await createWorkItemViaApi(page, {
        title: `${testPrefix} Subsidy Button State Test`,
      });
      subsidyId = await createSubsidyProgramViaApi(page, {
        name: `${testPrefix} State Test Subsidy`,
        reductionValue: 5,
      });

      await gotoWorkItemAndWaitForBudget(page, workItemId);

      const budgetSection = page
        .locator('section')
        .filter({ has: page.getByRole('heading', { level: 2, name: 'Budget', exact: true }) });

      const addSubsidyButton = budgetSection.getByRole('button', { name: /Add Subsidy/i });
      // Button is disabled because no subsidy is selected (empty option selected)
      await expect(addSubsidyButton).toBeDisabled({ timeout: 10000 });

      // Select a subsidy — button becomes enabled
      await budgetSection.getByLabel('Select subsidy program to link').selectOption({
        label: `${testPrefix} State Test Subsidy`,
      });
      await expect(addSubsidyButton).toBeEnabled();
    } finally {
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
      if (subsidyId) await deleteSubsidyProgramViaApi(page, subsidyId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: Work Item — Unlink a subsidy program
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Work Item — Unlink subsidy program (Scenario 5)', { tag: '@responsive' }, () => {
  test('Unlinking a subsidy removes it from the Subsidies subsection', async ({
    page,
    testPrefix,
  }) => {
    let workItemId: string | null = null;
    let subsidyId: string | null = null;
    const subsidyName = `${testPrefix} Removable Subsidy WI`;

    try {
      workItemId = await createWorkItemViaApi(page, {
        title: `${testPrefix} Subsidy Unlink Test`,
      });
      subsidyId = await createSubsidyProgramViaApi(page, {
        name: subsidyName,
        reductionValue: 15,
      });

      // Link the subsidy via API so we start with it already linked
      const linkResponse = await page.request.post(`${API.workItems}/${workItemId}/subsidies`, {
        data: { subsidyProgramId: subsidyId },
      });
      expect(linkResponse.ok()).toBeTruthy();

      await gotoWorkItemAndWaitForBudget(page, workItemId);

      const budgetSection = page
        .locator('section')
        .filter({ has: page.getByRole('heading', { level: 2, name: 'Budget', exact: true }) });

      // Subsidy name is visible in the linked list
      await expect(
        budgetSection.locator('[class*="linkedItemName"]').filter({ hasText: subsidyName }),
      ).toBeVisible({ timeout: 10000 });

      // Click the unlink button (SubsidyLinkSection renders aria-label "Unlink subsidy <name>")
      const unlinkButton = budgetSection.getByRole('button', {
        name: `Unlink subsidy ${subsidyName}`,
      });
      await expect(unlinkButton).toBeVisible();
      await unlinkButton.click();

      // Subsidy is removed from the linked list
      await expect(
        budgetSection.locator('[class*="linkedItemName"]').filter({ hasText: subsidyName }),
      ).not.toBeVisible({ timeout: 10000 });

      // Empty state "No subsidies linked" should appear
      await expect(budgetSection.getByText('No subsidies linked')).toBeVisible({ timeout: 5000 });
    } finally {
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
      if (subsidyId) await deleteSubsidyProgramViaApi(page, subsidyId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6: Household Item — Add a budget line
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Household Item — Add budget line (Scenario 6)', { tag: '@responsive' }, () => {
  test('Adding a budget line on a household item displays it in the budget section', async ({
    page,
    testPrefix,
  }) => {
    let householdItemId: string | null = null;

    try {
      householdItemId = await createHouseholdItemViaApi(page, {
        name: `${testPrefix} HI Budget Add Test`,
      });

      await gotoHouseholdItemAndWaitForBudget(page, householdItemId);

      const addButton = page.getByRole('button', { name: /add budget line|add line/i }).first();
      await expect(addButton).toBeVisible({ timeout: 10000 });
      await addButton.click();

      // BudgetLineForm: "Add Line" button when not editing
      const submitButton = page.getByRole('button', { name: 'Add Line', exact: true });
      await expect(submitButton).toBeVisible({ timeout: 5000 });

      // Fill planned amount
      const plannedAmountInput = page.locator('#budget-planned-amount');
      await plannedAmountInput.fill('800');

      await expect(submitButton).toBeEnabled();
      await submitButton.click();

      // Form closes; amount appears in the section
      await expect(submitButton).not.toBeVisible({ timeout: 10000 });

      // The budget card should show the amount
      await expect(page.getByText(/800/, { exact: false })).toBeVisible({ timeout: 10000 });
    } finally {
      if (householdItemId) await deleteHouseholdItemViaApi(page, householdItemId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 7: Household Item — Delete a budget line
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Household Item — Delete budget line (Scenario 7)', { tag: '@responsive' }, () => {
  test('Deleting a budget line on a household item removes it', async ({ page, testPrefix }) => {
    let householdItemId: string | null = null;

    try {
      householdItemId = await createHouseholdItemViaApi(page, {
        name: `${testPrefix} HI Budget Delete Test`,
      });

      // Create budget line via API
      await createHouseholdItemBudgetLineViaApi(page, householdItemId, {
        plannedAmount: 1200,
        description: `${testPrefix} HI line to remove`,
        confidence: 'own_estimate',
      });

      await gotoHouseholdItemAndWaitForBudget(page, householdItemId);

      // The card should be visible
      await expect(page.getByText(/1[,.]200/, { exact: false })).toBeVisible({ timeout: 10000 });

      // Click Delete on the BudgetLineCard
      const deleteButton = page.getByRole('button', { name: /^Delete$/i }).first();
      await expect(deleteButton).toBeVisible();
      await deleteButton.click();

      // Inline confirm appears
      const confirmButton = page.getByRole('button', { name: 'Confirm', exact: true });
      await expect(confirmButton).toBeVisible({ timeout: 5000 });
      await confirmButton.click();

      // Amount no longer visible
      await expect(page.getByText(/1[,.]200/, { exact: false })).not.toBeVisible({
        timeout: 10000,
      });
    } finally {
      if (householdItemId) await deleteHouseholdItemViaApi(page, householdItemId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 10: BudgetLineCard confidence label display
// ─────────────────────────────────────────────────────────────────────────────
test.describe(
  'Work Item — BudgetLineCard confidence label (Scenario 10)',
  { tag: '@responsive' },
  () => {
    test('BudgetLineCard displays the correct confidence label and margin', async ({
      page,
      testPrefix,
    }) => {
      let workItemId: string | null = null;

      try {
        workItemId = await createWorkItemViaApi(page, {
          title: `${testPrefix} Budget Confidence Display Test`,
        });

        // Create budget lines with different confidence levels via API
        await createWorkItemBudgetLineViaApi(page, workItemId, {
          plannedAmount: 500,
          confidence: 'own_estimate', // +20%
          description: `${testPrefix} own estimate line`,
        });
        await createWorkItemBudgetLineViaApi(page, workItemId, {
          plannedAmount: 1000,
          confidence: 'quote', // +5%
          description: `${testPrefix} quote line`,
        });

        await gotoWorkItemAndWaitForBudget(page, workItemId);

        const budgetSection = page
          .locator('section')
          .filter({ has: page.getByRole('heading', { level: 2, name: 'Budget', exact: true }) });

        // BudgetLineCard renders confidence labels: "Own Estimate (+20%)" and "Quote (+5%)"
        // from budgetConstants.ts CONFIDENCE_LABELS and CONFIDENCE_MARGINS
        // The component shows: "{label} (+{margin}%)" when margin > 0
        await expect(budgetSection.getByText(/Own Estimate/i, { exact: false })).toBeVisible({
          timeout: 10000,
        });
        await expect(budgetSection.getByText(/Quote/i, { exact: false })).toBeVisible({
          timeout: 10000,
        });

        // Margins should be displayed in the card
        await expect(budgetSection.getByText(/\+20%/)).toBeVisible({ timeout: 10000 });
        await expect(budgetSection.getByText(/\+5%/)).toBeVisible({ timeout: 10000 });
      } finally {
        if (workItemId) await deleteWorkItemViaApi(page, workItemId);
      }
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 9: Work Item — Budget section: empty state + "No subsidies linked"
// ─────────────────────────────────────────────────────────────────────────────
test.describe(
  'Work Item — Budget section empty states (Scenario 9)',
  { tag: '@responsive' },
  () => {
    test('"No subsidies linked" is shown in the Subsidies subsection when no subsidies linked', async ({
      page,
      testPrefix,
    }) => {
      let workItemId: string | null = null;

      try {
        workItemId = await createWorkItemViaApi(page, {
          title: `${testPrefix} No Subsidies Linked Test`,
        });

        await gotoWorkItemAndWaitForBudget(page, workItemId);

        const budgetSection = page
          .locator('section')
          .filter({ has: page.getByRole('heading', { level: 2, name: 'Budget', exact: true }) });

        // SubsidyLinkSection renders "No subsidies linked" when linkedSubsidies is empty
        await expect(budgetSection.getByText('No subsidies linked')).toBeVisible({
          timeout: 10000,
        });
      } finally {
        if (workItemId) await deleteWorkItemViaApi(page, workItemId);
      }
    });
  },
);
