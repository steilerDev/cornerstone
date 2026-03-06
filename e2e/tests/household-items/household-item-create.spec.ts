/**
 * E2E tests for the Household Item Create page (/household-items/new)
 *
 * EPIC-04 Story 4.4: Create & Edit Form
 *
 * Scenarios covered:
 * 1.  Page loads with h1 "New Household Item"
 * 2.  Back button navigates to /household-items
 * 3.  All primary form fields are visible
 * 4.  Create item with name only — success, redirects to detail page
 * 5.  Create item with all major fields — success
 * 6.  Submit without name shows validation error
 * 7.  Category select has all expected options
 * 8.  Status select has all expected options
 * 9.  Cancel navigates back to the list
 * 10. Responsive — no horizontal scroll on current viewport
 */

import { test, expect } from '../../fixtures/auth.js';
import {
  HouseholdItemCreatePage,
  HOUSEHOLD_ITEM_CREATE_ROUTE,
} from '../../pages/HouseholdItemCreatePage.js';
import { deleteHouseholdItemViaApi } from '../../fixtures/apiHelpers.js';

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: Page loads with correct heading
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Page load (Scenario 1)', { tag: '@responsive' }, () => {
  test('New Household Item page loads with correct heading', async ({ page }) => {
    const createPage = new HouseholdItemCreatePage(page);

    await createPage.goto();

    await expect(createPage.heading).toBeVisible();
    await expect(createPage.heading).toHaveText('New Household Item');
  });

  test('Back button and Cancel button are visible on page load', async ({ page }) => {
    const createPage = new HouseholdItemCreatePage(page);

    await createPage.goto();

    await expect(createPage.backButton).toBeVisible();
    await expect(createPage.cancelButton).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: Back button navigates to /household-items
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Back button navigation (Scenario 2)', { tag: '@responsive' }, () => {
  test('"← Back to Household Items" button navigates to /household-items', async ({ page }) => {
    const createPage = new HouseholdItemCreatePage(page);

    await createPage.goto();
    await createPage.backButton.click();

    await page.waitForURL('**/household-items');
    expect(page.url()).toContain('/household-items');
    expect(page.url()).not.toContain('/household-items/new');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: All primary form fields are visible
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Form fields visible (Scenario 3)', { tag: '@responsive' }, () => {
  test('All primary form fields are visible on page load', async ({ page }) => {
    const createPage = new HouseholdItemCreatePage(page);

    await createPage.goto();

    await expect(createPage.nameInput).toBeVisible();
    await expect(createPage.categorySelect).toBeVisible();
    await expect(createPage.statusSelect).toBeVisible();
    await expect(createPage.quantityInput).toBeVisible();
    await expect(createPage.submitButton).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: Create item with name only — redirects to detail
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Create with name only — happy path (Scenario 4)', { tag: '@responsive' }, () => {
  test(
    'Creating a household item with name only redirects to the detail page',
    { tag: '@smoke' },
    async ({ page, testPrefix }) => {
      const createPage = new HouseholdItemCreatePage(page);
      let createdId: string | null = null;
      const name = `${testPrefix} HI Create Name Only`;

      try {
        await createPage.goto();
        await createPage.fillForm({ name });
        createdId = await createPage.submitAndWaitForDetail();

        // Should have navigated to the detail page
        expect(page.url()).toContain('/household-items/');
        expect(page.url()).not.toContain('/new');
        expect(createdId).toBeTruthy();

        // Detail page heading should show the item name — wrap in toPass()
        // because on mobile WebKit the URL may change before React renders
        // the detail page component.
        await expect(async () => {
          const heading = page.getByRole('heading', { level: 1 });
          await expect(heading).toBeVisible();
          const headingText = await heading.textContent();
          expect(headingText?.trim()).toContain(name);
        }).toPass({ timeout: 15000 });
      } finally {
        if (createdId) await deleteHouseholdItemViaApi(page, createdId);
      }
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: Create item with all major fields
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Create with all fields (Scenario 5)', { tag: '@responsive' }, () => {
  test('Creating household item with all major fields succeeds', async ({ page, testPrefix }) => {
    const createPage = new HouseholdItemCreatePage(page);
    let createdId: string | null = null;
    const name = `${testPrefix} HI Create All Fields`;

    try {
      await createPage.goto();
      await createPage.fillForm({
        name,
        description: 'A comfortable sofa for the living room',
        category: 'hic-furniture',
        status: 'planned',
        quantity: '2',
        room: 'Living Room',
        url: 'https://example.com/sofa',
        orderDate: '2026-04-01',
        earliestDeliveryDate: '2026-05-01',
        latestDeliveryDate: '2026-06-01',
      });

      createdId = await createPage.submitAndWaitForDetail();

      // Should be on the detail page
      expect(page.url()).toContain('/household-items/');
      expect(createdId).toBeTruthy();
    } finally {
      if (createdId) await deleteHouseholdItemViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6: Submit without name shows validation error
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Validation error — empty name (Scenario 6)', { tag: '@responsive' }, () => {
  test('Submitting without a name shows validation error and stays on create page', async ({
    page,
  }) => {
    const createPage = new HouseholdItemCreatePage(page);

    await createPage.goto();

    // Submit without filling the name
    await createPage.submit();

    // Should still be on the create page
    expect(page.url()).toContain('/household-items/new');

    // Validation error should appear near the name field
    const nameError = page.locator('[class*="errorText"]').first();
    await expect(nameError).toBeVisible({ timeout: 5000 });
    const errorText = await nameError.textContent();
    expect(errorText?.toLowerCase()).toMatch(/name|required/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 7: Category select options
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Category options (Scenario 7)', { tag: '@responsive' }, () => {
  test('Category select contains all expected options', async ({ page }) => {
    const createPage = new HouseholdItemCreatePage(page);

    await createPage.goto();

    const expectedCategories = [
      'Furniture',
      'Appliances',
      'Fixtures',
      'Decor',
      'Electronics',
      'Outdoor',
      'Storage',
      'Other',
    ];

    for (const category of expectedCategories) {
      const option = createPage.categorySelect.locator('option', { hasText: category });
      await expect(option).toHaveCount(1);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 8: Status select options
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Status options (Scenario 8)', { tag: '@responsive' }, () => {
  test('Status select contains all expected options', async ({ page }) => {
    const createPage = new HouseholdItemCreatePage(page);

    await createPage.goto();

    const expectedStatuses = ['Planned', 'Purchased', 'Scheduled', 'Arrived'];

    for (const status of expectedStatuses) {
      const option = createPage.statusSelect.locator('option', { hasText: status });
      await expect(option).toHaveCount(1);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 9: Cancel navigates back to list
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Cancel navigation (Scenario 9)', { tag: '@responsive' }, () => {
  test('"Cancel" button navigates back to /household-items', async ({ page }) => {
    const createPage = new HouseholdItemCreatePage(page);

    await createPage.goto();
    await createPage.cancelButton.click();

    await page.waitForURL('**/household-items');
    expect(page.url()).toContain('/household-items');
    expect(page.url()).not.toContain('/new');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 10: Responsive — no horizontal scroll
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Responsive layout (Scenario 10)', { tag: '@responsive' }, () => {
  test('New Household Item page renders without horizontal scroll', async ({ page }) => {
    await page.goto(HOUSEHOLD_ITEM_CREATE_ROUTE);
    await page.getByRole('heading', { level: 1, name: 'New Household Item' }).waitFor({
      state: 'visible',
      timeout: 10000,
    });

    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });

    expect(hasHorizontalScroll).toBe(false);
  });

  test('Create page renders correctly in dark mode', async ({ page }) => {
    await page.goto(HOUSEHOLD_ITEM_CREATE_ROUTE);
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });
    await page.getByRole('heading', { level: 1, name: 'New Household Item' }).waitFor({
      state: 'visible',
      timeout: 10000,
    });

    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(hasHorizontalScroll).toBe(false);
  });
});
