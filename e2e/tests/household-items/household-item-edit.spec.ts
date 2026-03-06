/**
 * E2E tests for the Household Item Edit page (/household-items/:id/edit)
 *
 * EPIC-04 Story 4.4: Create & Edit Form
 *
 * Scenarios covered:
 * 1.  Edit page loads with h1 "Edit Household Item"
 * 2.  Form is pre-populated with the existing item data
 * 3.  Back button navigates to the detail page
 * 4.  Save changes successfully updates the item
 * 5.  Clear the name field — validation error shown
 * 6.  404 state for non-existent item ID
 * 7.  Responsive — no horizontal scroll on current viewport
 */

import { test, expect } from '../../fixtures/auth.js';
import { createHouseholdItemViaApi, deleteHouseholdItemViaApi } from '../../fixtures/apiHelpers.js';

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: Edit page loads with correct heading
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Page load (Scenario 1)', { tag: '@responsive' }, () => {
  test('Edit Household Item page loads with correct heading', async ({ page, testPrefix }) => {
    let createdId: string | null = null;

    try {
      createdId = await createHouseholdItemViaApi(page, {
        name: `${testPrefix} HI Edit Heading Test`,
      });

      await page.goto(`/household-items/${createdId}/edit`);

      const heading = page.getByRole('heading', { level: 1, name: 'Edit Household Item' });
      await expect(heading).toBeVisible({ timeout: 10000 });
    } finally {
      if (createdId) await deleteHouseholdItemViaApi(page, createdId);
    }
  });

  test('Save Changes button and Cancel button are visible', async ({ page, testPrefix }) => {
    let createdId: string | null = null;

    try {
      createdId = await createHouseholdItemViaApi(page, {
        name: `${testPrefix} HI Edit Buttons Test`,
      });

      await page.goto(`/household-items/${createdId}/edit`);
      await page.getByRole('heading', { level: 1, name: 'Edit Household Item' }).waitFor({
        state: 'visible',
        timeout: 10000,
      });

      const saveButton = page.getByRole('button', { name: /Save Changes|Saving\.\.\./i });
      await expect(saveButton).toBeVisible();

      const cancelButton = page.getByRole('button', { name: 'Cancel', exact: true });
      await expect(cancelButton).toBeVisible();
    } finally {
      if (createdId) await deleteHouseholdItemViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: Form pre-populated with existing data
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Form pre-population (Scenario 2)', { tag: '@responsive' }, () => {
  test('Edit form is pre-populated with the existing item name', async ({ page, testPrefix }) => {
    let createdId: string | null = null;
    const name = `${testPrefix} HI Edit Pre-Population`;

    try {
      createdId = await createHouseholdItemViaApi(page, { name, category: 'furniture' });

      await page.goto(`/household-items/${createdId}/edit`);
      await page.getByRole('heading', { level: 1, name: 'Edit Household Item' }).waitFor({
        state: 'visible',
        timeout: 10000,
      });

      // The name input should be pre-filled
      const nameInput = page.locator('#name');
      await expect(nameInput).toHaveValue(name);

      // The category select should be pre-selected to 'furniture'
      const categorySelect = page.locator('#category');
      await expect(categorySelect).toHaveValue('furniture');
    } finally {
      if (createdId) await deleteHouseholdItemViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: Back button navigates to detail page
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Back button navigation (Scenario 3)', { tag: '@responsive' }, () => {
  test('"← Back to Item" navigates to the item detail page', async ({ page, testPrefix }) => {
    let createdId: string | null = null;

    try {
      createdId = await createHouseholdItemViaApi(page, {
        name: `${testPrefix} HI Edit Back Test`,
      });

      await page.goto(`/household-items/${createdId}/edit`);
      await page.getByRole('heading', { level: 1, name: 'Edit Household Item' }).waitFor({
        state: 'visible',
        timeout: 10000,
      });

      // Back button text is "← Back to Item" (from HouseholdItemEditPage source)
      const backButton = page.getByRole('button', { name: /← Back to Item/i });
      await backButton.click();

      // Should navigate to the detail page
      await page.waitForURL(`**/household-items/${createdId}`);
      expect(page.url()).toContain(`/household-items/${createdId}`);
      expect(page.url()).not.toContain('/edit');
    } finally {
      if (createdId) await deleteHouseholdItemViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: Save changes updates the item
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Save changes — happy path (Scenario 4)', { tag: '@responsive' }, () => {
  test('Saving changes updates the item name and navigates to detail page', async ({
    page,
    testPrefix,
  }) => {
    let createdId: string | null = null;
    const originalName = `${testPrefix} HI Edit Save Original`;
    const updatedName = `${testPrefix} HI Edit Save Updated`;

    try {
      createdId = await createHouseholdItemViaApi(page, { name: originalName });

      await page.goto(`/household-items/${createdId}/edit`);
      await page.getByRole('heading', { level: 1, name: 'Edit Household Item' }).waitFor({
        state: 'visible',
        timeout: 10000,
      });

      // Update the name
      const nameInput = page.locator('#name');
      await nameInput.fill(updatedName);

      // Save
      const saveResponsePromise = page.waitForResponse(
        (resp) =>
          resp.url().includes(`/api/household-items/${createdId}`) &&
          resp.request().method() === 'PATCH' &&
          resp.status() === 200,
      );
      const saveButton = page.getByRole('button', { name: /Save Changes|Saving\.\.\./i });
      await saveButton.click();
      await saveResponsePromise;

      // Should navigate back to the detail page
      await page.waitForURL(`**/household-items/${createdId}`);
      expect(page.url()).toContain(`/household-items/${createdId}`);
      expect(page.url()).not.toContain('/edit');
    } finally {
      if (createdId) await deleteHouseholdItemViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: Validation error when name is cleared
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Validation — empty name (Scenario 5)', { tag: '@responsive' }, () => {
  test('Clearing the name and saving shows a validation error', async ({ page, testPrefix }) => {
    let createdId: string | null = null;

    try {
      createdId = await createHouseholdItemViaApi(page, {
        name: `${testPrefix} HI Edit Validate Name`,
      });

      await page.goto(`/household-items/${createdId}/edit`);
      await page.getByRole('heading', { level: 1, name: 'Edit Household Item' }).waitFor({
        state: 'visible',
        timeout: 10000,
      });

      // Clear the name field
      const nameInput = page.locator('#name');
      await nameInput.fill('');

      // Attempt to save
      const saveButton = page.getByRole('button', { name: /Save Changes|Saving\.\.\./i });
      await saveButton.click();

      // Should still be on the edit page
      expect(page.url()).toContain('/edit');

      // Validation error should appear
      const nameError = page.locator('[class*="errorText"]').first();
      await expect(nameError).toBeVisible({ timeout: 5000 });
    } finally {
      if (createdId) await deleteHouseholdItemViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6: 404 state for non-existent item
// ─────────────────────────────────────────────────────────────────────────────
test.describe('404 state (Scenario 6)', { tag: '@responsive' }, () => {
  test('Navigating to edit page for non-existent item shows not-found state', async ({ page }) => {
    await page.goto('/household-items/non-existent-id-edit-000/edit');

    // The edit page renders a not-found state when the item doesn't exist
    const notFoundText = page.getByText(/not found|doesn't exist|has been removed/i);
    await expect(notFoundText).toBeVisible({ timeout: 10000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 7: Responsive layout
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Responsive layout (Scenario 7)', { tag: '@responsive' }, () => {
  test('Edit page renders without horizontal scroll', async ({ page, testPrefix }) => {
    let createdId: string | null = null;

    try {
      createdId = await createHouseholdItemViaApi(page, {
        name: `${testPrefix} HI Edit Responsive`,
      });

      await page.goto(`/household-items/${createdId}/edit`);
      await page.getByRole('heading', { level: 1, name: 'Edit Household Item' }).waitFor({
        state: 'visible',
        timeout: 10000,
      });

      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });

      expect(hasHorizontalScroll).toBe(false);
    } finally {
      if (createdId) await deleteHouseholdItemViaApi(page, createdId);
    }
  });
});
