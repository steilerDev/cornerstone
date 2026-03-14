/**
 * E2E tests for Unit Pricing Mode on Budget Line forms (Story #741)
 *
 * UAT Scenarios covered:
 * 1. WI unit pricing create (with VAT included): qty=10, unit="m²", unitPrice=50 → total 500.00
 * 2. WI unit pricing create (VAT excluded): qty=10, unitPrice=50 → total 595.00 (×1.19)
 * 3. HI unit pricing create (with VAT): same flow on a household item
 * 4. Edit auto-switches to unit pricing mode when the line was saved with unit pricing
 * 5. Switch from unit pricing back to direct amount mode resets to Planned Amount input
 * 6. No "New Budget Line" or "Edit Budget Line" h3 heading exists in the form
 */

import { test, expect } from '../../fixtures/auth.js';
import { WorkItemDetailPage } from '../../pages/WorkItemDetailPage.js';
import { HouseholdItemDetailPage } from '../../pages/HouseholdItemDetailPage.js';
import {
  createWorkItemViaApi,
  deleteWorkItemViaApi,
  createHouseholdItemViaApi,
  deleteHouseholdItemViaApi,
} from '../../fixtures/apiHelpers.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers: budget line form interactions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Click the "Unit Pricing" mode toggle button and wait for the quantity input to appear.
 */
async function switchToUnitPricingMode(detailPage: WorkItemDetailPage | HouseholdItemDetailPage) {
  const { page } = detailPage;
  await page.getByRole('button', { name: 'Unit Pricing', exact: true }).click();
  await page.getByLabel('Quantity *').waitFor({ state: 'visible' });
}

/**
 * Click the "Direct Amount" mode toggle button and wait for the planned amount input to appear.
 */
async function switchToDirectAmountMode(detailPage: WorkItemDetailPage | HouseholdItemDetailPage) {
  const { page } = detailPage;
  await page.getByRole('button', { name: 'Direct Amount', exact: true }).click();
  await page.getByLabel('Planned Amount (€) *').waitFor({ state: 'visible' });
}

/**
 * Fill unit pricing fields: quantity, unit text (optional), unitPrice.
 */
async function fillUnitPricingFields(
  detailPage: WorkItemDetailPage | HouseholdItemDetailPage,
  opts: { quantity: string; unit?: string; unitPrice: string },
) {
  const { page } = detailPage;
  await page.getByLabel('Quantity *').fill(opts.quantity);
  if (opts.unit !== undefined) {
    await page.getByLabel('Unit').fill(opts.unit);
  }
  await page.getByLabel('Price *').fill(opts.unitPrice);
}

/**
 * Read the computed total text (the div rendered next to the "Total" label).
 * Returns the raw text content of the computedValue div (e.g. "€500.00").
 */
async function getComputedTotal(
  detailPage: WorkItemDetailPage | HouseholdItemDetailPage,
): Promise<string> {
  const { page } = detailPage;
  const computedDiv = page.locator('[class*="computedValue"]');
  await computedDiv.waitFor({ state: 'visible' });
  return (await computedDiv.textContent()) ?? '';
}

/**
 * Open the "Add Line" budget form on the work item detail page.
 * Waits for the mode toggle to be visible (form is open and ready).
 */
async function openAddBudgetLineForm(detailPage: WorkItemDetailPage) {
  await detailPage.addBudgetLineButton.click();
  // Wait for the mode toggle to confirm the form opened
  await detailPage.page.getByRole('button', { name: 'Direct Amount', exact: true }).waitFor({
    state: 'visible',
  });
}

/**
 * Submit the budget line form and wait for the form to close (Add Line button re-appears).
 */
async function submitBudgetLineForm(detailPage: WorkItemDetailPage | HouseholdItemDetailPage) {
  const { page } = detailPage;
  // Click "Add Line" (new) or "Save Changes" (edit) — both are the submit button
  const submitBtn = page.locator('[class*="submitButton"]');
  await submitBtn.click();
  // Wait for the form to close: "Add budget line" button re-appears
  await page.getByRole('button', { name: 'Add budget line' }).waitFor({ state: 'visible' });
}

/**
 * Open the Add budget line form on a household item detail page.
 * The household item detail page uses the same BudgetSection component.
 */
async function openAddBudgetLineFormHI(page: HouseholdItemDetailPage['page']) {
  const addBtn = page.getByRole('button', { name: 'Add budget line' });
  await addBtn.click();
  // Wait for the mode toggle to confirm the form opened
  await page.getByRole('button', { name: 'Direct Amount', exact: true }).waitFor({
    state: 'visible',
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: WI unit pricing create — with VAT included
// ─────────────────────────────────────────────────────────────────────────────

test.describe('WI unit pricing create (VAT included, Scenario 1)', () => {
  test('unit pricing with VAT: computed total = qty × price, saved line shows correct amount', async ({
    page,
    testPrefix,
  }) => {
    const detailPage = new WorkItemDetailPage(page);
    let workItemId: string | null = null;

    try {
      workItemId = await createWorkItemViaApi(page, {
        title: `${testPrefix} Unit Pricing VAT Test`,
      });

      await detailPage.goto(workItemId);

      // Open the Add Line form
      await openAddBudgetLineForm(detailPage);

      // Switch to unit pricing
      await switchToUnitPricingMode(detailPage);

      // Fill quantity=10, unit="m²", unitPrice=50 — VAT checkbox is checked by default
      await fillUnitPricingFields(detailPage, { quantity: '10', unit: 'm²', unitPrice: '50' });

      // Verify computed total = 10 × 50 × 1 (includes VAT) = 500.00
      const total = await getComputedTotal(detailPage);
      expect(total).toContain('500.00');

      // Confirm the VAT note is NOT shown (since includesVat is checked)
      await expect(page.getByText('+19% VAT will be added to the total')).not.toBeVisible();

      // Submit and verify the line appears in the budget section
      await submitBudgetLineForm(detailPage);

      // The saved BudgetLineCard shows the planned amount as formatted currency
      await expect(
        detailPage.budgetSection.locator('[class*="amount"]').filter({ hasText: '500' }).first(),
      ).toBeVisible();
    } finally {
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: WI unit pricing create — VAT excluded (multiplier = 1.19)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('WI unit pricing create (VAT excluded, Scenario 2)', () => {
  test('unit pricing without VAT: computed total = qty × price × 1.19, saved line shows correct amount', async ({
    page,
    testPrefix,
  }) => {
    const detailPage = new WorkItemDetailPage(page);
    let workItemId: string | null = null;

    try {
      workItemId = await createWorkItemViaApi(page, {
        title: `${testPrefix} Unit Pricing No VAT Test`,
      });

      await detailPage.goto(workItemId);

      await openAddBudgetLineForm(detailPage);
      await switchToUnitPricingMode(detailPage);

      // Fill fields
      await fillUnitPricingFields(detailPage, { quantity: '10', unit: 'pcs', unitPrice: '50' });

      // Uncheck "Price includes VAT (19%)"
      const vatCheckbox = page.getByLabel('Price includes VAT (19%)');
      await vatCheckbox.uncheck();

      // VAT note should now appear
      await expect(page.getByText('+19% VAT will be added to the total')).toBeVisible();

      // Computed total = 10 × 50 × 1.19 = 595.00
      const total = await getComputedTotal(detailPage);
      expect(total).toContain('595.00');

      // Submit and verify
      await submitBudgetLineForm(detailPage);

      await expect(
        detailPage.budgetSection.locator('[class*="amount"]').filter({ hasText: '595' }).first(),
      ).toBeVisible();
    } finally {
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: HI unit pricing create
// ─────────────────────────────────────────────────────────────────────────────

test.describe('HI unit pricing create (Scenario 3)', () => {
  test('unit pricing with VAT on household item: computed total and saved amount are correct', async ({
    page,
    testPrefix,
  }) => {
    const detailPage = new HouseholdItemDetailPage(page);
    let hiId: string | null = null;

    try {
      hiId = await createHouseholdItemViaApi(page, {
        name: `${testPrefix} HI Unit Pricing Test`,
      });

      await detailPage.goto(hiId);

      // Open Add Line form on HI detail page
      await openAddBudgetLineFormHI(page);

      // Switch to unit pricing
      await page.getByRole('button', { name: 'Unit Pricing', exact: true }).click();
      await page.getByLabel('Quantity *').waitFor({ state: 'visible' });

      // Fill fields: qty=10, unit="m²", unitPrice=50, VAT included (default)
      await page.getByLabel('Quantity *').fill('10');
      await page.getByLabel('Unit').fill('m²');
      await page.getByLabel('Price *').fill('50');

      // Verify computed total = 500.00
      const computedDiv = page.locator('[class*="computedValue"]');
      await computedDiv.waitFor({ state: 'visible' });
      const total = (await computedDiv.textContent()) ?? '';
      expect(total).toContain('500.00');

      // Submit
      const submitBtn = page.locator('[class*="submitButton"]');
      await submitBtn.click();
      await page.getByRole('button', { name: 'Add budget line' }).waitFor({ state: 'visible' });

      // The saved line should show 500
      await expect(
        page.locator('[class*="amount"]').filter({ hasText: '500' }).first(),
      ).toBeVisible();
    } finally {
      if (hiId) await deleteHouseholdItemViaApi(page, hiId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: Edit auto-switches to unit pricing mode
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Edit re-opens in unit pricing mode (Scenario 4)', () => {
  test('editing a unit-priced line opens the form pre-filled in unit pricing mode', async ({
    page,
    testPrefix,
  }) => {
    const detailPage = new WorkItemDetailPage(page);
    let workItemId: string | null = null;

    try {
      workItemId = await createWorkItemViaApi(page, {
        title: `${testPrefix} Edit Unit Pricing Mode Test`,
      });

      await detailPage.goto(workItemId);

      // Create a unit-priced line first
      await openAddBudgetLineForm(detailPage);
      await switchToUnitPricingMode(detailPage);
      await fillUnitPricingFields(detailPage, { quantity: '5', unit: 'hr', unitPrice: '80' });
      await submitBudgetLineForm(detailPage);

      // Click the "Edit" button on the newly created line
      const editButton = detailPage.budgetSection.locator('[class*="editButton"]').first();
      await editButton.click();

      // The mode toggle should show "Unit Pricing" as active
      const unitPricingBtn = page.getByRole('button', { name: 'Unit Pricing', exact: true });
      await unitPricingBtn.waitFor({ state: 'visible' });

      // Quantity input should be pre-filled with "5"
      const quantityInput = page.getByLabel('Quantity *');
      await quantityInput.waitFor({ state: 'visible' });
      await expect(quantityInput).toHaveValue('5');

      // Unit input should be pre-filled with "hr"
      await expect(page.getByLabel('Unit')).toHaveValue('hr');

      // Unit price input should be pre-filled with "80"
      await expect(page.getByLabel('Price *')).toHaveValue('80');

      // The "Planned Amount" direct input should NOT be visible
      await expect(page.getByLabel('Planned Amount (€) *')).not.toBeVisible();
    } finally {
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: Switch from unit pricing back to direct amount mode
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Switch back to direct amount mode (Scenario 5)', () => {
  test('switching from unit pricing to direct amount shows planned amount input and hides unit fields', async ({
    page,
    testPrefix,
  }) => {
    const detailPage = new WorkItemDetailPage(page);
    let workItemId: string | null = null;

    try {
      workItemId = await createWorkItemViaApi(page, {
        title: `${testPrefix} Mode Switch Test`,
      });

      await detailPage.goto(workItemId);

      // Open Add Line form and switch to unit pricing
      await openAddBudgetLineForm(detailPage);
      await switchToUnitPricingMode(detailPage);

      // Verify unit pricing fields are visible
      await expect(page.getByLabel('Quantity *')).toBeVisible();
      await expect(page.getByLabel('Price *')).toBeVisible();

      // Switch back to Direct Amount
      await switchToDirectAmountMode(detailPage);

      // Planned Amount input is visible
      await expect(page.getByLabel('Planned Amount (€) *')).toBeVisible();

      // Unit pricing fields are gone
      await expect(page.getByLabel('Quantity *')).not.toBeVisible();
      await expect(page.getByLabel('Price *')).not.toBeVisible();
      await expect(page.locator('[class*="computedValue"]')).not.toBeVisible();
    } finally {
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6: No h3 "New Budget Line" / "Edit Budget Line" heading in the form
// ─────────────────────────────────────────────────────────────────────────────

test.describe('No budget line form heading (Scenario 6)', () => {
  test('budget line form does not show "New Budget Line" or "Edit Budget Line" heading', async ({
    page,
    testPrefix,
  }) => {
    const detailPage = new WorkItemDetailPage(page);
    let workItemId: string | null = null;

    try {
      workItemId = await createWorkItemViaApi(page, {
        title: `${testPrefix} No Form Heading Test`,
      });

      await detailPage.goto(workItemId);

      // Open the Add Line form (new mode)
      await openAddBudgetLineForm(detailPage);

      // No h3 with "New Budget Line" text
      await expect(
        page.getByRole('heading', { level: 3, name: /new budget line/i }),
      ).not.toBeAttached();

      // Submit a direct amount line then click Edit to test edit mode heading
      await page.getByLabel('Planned Amount (€) *').fill('100');
      await submitBudgetLineForm(detailPage);

      // Open Edit form
      const editButton = detailPage.budgetSection.locator('[class*="editButton"]').first();
      await editButton.click();
      await page.getByLabel('Planned Amount (€) *').waitFor({ state: 'visible' });

      // No h3 with "Edit Budget Line" text
      await expect(
        page.getByRole('heading', { level: 3, name: /edit budget line/i }),
      ).not.toBeAttached();
    } finally {
      if (workItemId) await deleteWorkItemViaApi(page, workItemId);
    }
  });
});
