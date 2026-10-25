/**
 * E2E tests for the New purchase dialog (/project/household-items/new)
 *
 * EPIC-04 Story 4.4 (create form), reworked by #2212: the create page is now an ObjectForm
 * dialog over the page you came from. A deep link shows the Purchases list behind it.
 *
 * Scenarios covered:
 * 1.  Dialog opens named "New purchase" with the Purchases list behind it
 * 2.  Cancel and Escape close the dialog back to the Purchases list, focus never on <body>
 * 3.  Essential fields visible; the rest sits behind "More details"
 * 4.  Create item with name only — success, redirects to detail page
 * 5.  Create item with all major fields — success
 * 6.  Submit without name shows an inline field error
 * 7.  Category select has all expected options
 * 8.  Status select has all expected options
 * 9.  Cancel navigates back to the list
 * 10. Responsive — no horizontal scroll on current viewport, dark mode
 */

import { test, expect } from '../../fixtures/auth.js';
import { routeUrl } from '../../../shared/src/routes/index.js';
import {
  HouseholdItemCreatePage,
  HOUSEHOLD_ITEM_CREATE_ROUTE,
} from '../../pages/HouseholdItemCreatePage.js';
import { deleteHouseholdItemViaApi } from '../../fixtures/apiHelpers.js';

const LIST_PATH = routeUrl('householdItems');

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: Dialog opens over the Purchases list
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Dialog open (Scenario 1)', { tag: '@responsive' }, () => {
  test('New purchase dialog opens with the Purchases list behind it', async ({ page }) => {
    const createPage = new HouseholdItemCreatePage(page);

    await createPage.goto();

    await expect(createPage.heading).toBeVisible();
    await expect(createPage.heading).toHaveText('New purchase');
    // A deep link renders the parent list behind the dialog (a view: no breadcrumb trail).
    await expect(
      page.getByRole('heading', { level: 1, name: 'Purchases', exact: true }),
    ).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(HOUSEHOLD_ITEM_CREATE_ROUTE);
    await expect(createPage.cancelButton).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: Cancel and Escape return to the list with focus on the page
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Close paths (Scenario 2)', { tag: '@responsive' }, () => {
  test('Escape closes the dialog back to the Purchases list and focuses its heading', async ({
    page,
  }) => {
    const createPage = new HouseholdItemCreatePage(page);

    await createPage.goto();
    await page.keyboard.press('Escape');

    await page.waitForURL((url) => url.pathname === LIST_PATH);
    await createPage.form.waitForClosed();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Purchases', exact: true }),
    ).toBeFocused();
  });

  test('The close button closes the dialog back to the Purchases list', async ({ page }) => {
    const createPage = new HouseholdItemCreatePage(page);

    await createPage.goto();
    await createPage.form.settled();
    await createPage.form.closeButton.click();

    await page.waitForURL((url) => url.pathname === LIST_PATH);
    await createPage.form.waitForClosed();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: Essential fields visible, the rest behind "More details"
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Form fields visible (Scenario 3)', { tag: '@responsive' }, () => {
  test('Essential fields are visible; "More details" reveals the rest', async ({ page }) => {
    const createPage = new HouseholdItemCreatePage(page);

    await createPage.goto();

    await expect(createPage.nameInput).toBeVisible();
    await expect(
      createPage.categoryPicker.input.or(createPage.categoryPicker.clearButton),
    ).toBeVisible();
    await expect(createPage.statusSelect).toBeVisible();
    await expect(createPage.quantityInput).toBeVisible();
    await expect(createPage.vendorSelect).toBeVisible();
    await expect(createPage.submitButton).toBeVisible();

    await expect(createPage.urlInput).toBeHidden();
    await createPage.expandMoreDetails();
    await expect(createPage.descriptionInput).toBeVisible();
    await expect(createPage.urlInput).toBeVisible();
    await expect(createPage.orderDateInput).toBeVisible();
    await expect(createPage.actualDeliveryDateInput).toBeVisible();
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
        expect(new URL(page.url()).pathname).toBe(routeUrl('householdItem', { id: createdId }));
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
      // areaId is not filled here since areas are dynamic and not seeded in E2E tests.
      await createPage.fillForm({
        name,
        description: 'A comfortable sofa for the living room',
        category: 'Furniture',
        status: 'planned',
        quantity: '2',
        url: 'https://example.com/sofa',
        orderDate: '2026-04-01',
        earliestDeliveryDate: '2026-05-01',
        latestDeliveryDate: '2026-06-01',
      });

      createdId = await createPage.submitAndWaitForDetail();

      // Should be on the detail page
      expect(new URL(page.url()).pathname).toBe(routeUrl('householdItem', { id: createdId }));
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
  test('Submitting without a name shows an inline error and keeps the dialog open', async ({
    page,
  }) => {
    const createPage = new HouseholdItemCreatePage(page);

    await createPage.goto();

    // Submit without filling the name
    await createPage.submit();

    // The dialog stays on /new; the error sits under the name field, which takes focus.
    expect(new URL(page.url()).pathname).toBe(HOUSEHOLD_ITEM_CREATE_ROUTE);
    await expect(createPage.fieldError('name')).toBeVisible();
    await expect(createPage.fieldError('name')).toContainText(/name/i);
    await expect(createPage.nameInput).toHaveAttribute('aria-invalid', 'true');
    await expect(createPage.nameInput).toBeFocused();
    await expect(createPage.errorBanner).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 7: Category select options
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Category options (Scenario 7)', { tag: '@responsive' }, () => {
  test('Category select contains all expected options', async ({ page }) => {
    const createPage = new HouseholdItemCreatePage(page);

    await createPage.goto();

    // EPIC-18 migration 0028: hic-outdoor and hic-storage removed (if unreferenced),
    // hic-equipment added. The form loads categories dynamically from the API, so
    // we verify the categories that are always present after migration.
    const expectedCategories = [
      'Furniture',
      'Appliances',
      'Fixtures',
      'Decor',
      'Electronics',
      'Equipment',
      'Other',
    ];

    // The category is an EntityPicker: clear the preselected first category, then the focused
    // input lists them all
    const picker = createPage.categoryPicker;
    if ((await picker.input.count()) === 0) await picker.clearButton.click();
    await picker.input.click();
    await picker.dropdown.waitFor({ state: 'visible' });
    for (const category of expectedCategories) {
      await expect(picker.optionNamed(category)).toHaveCount(1);
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

    const expectedStatuses = ['Planned', 'Ordered', 'Delivery scheduled', 'Delivered'];

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
  test('"Cancel" button closes the dialog back to /project/household-items', async ({ page }) => {
    const createPage = new HouseholdItemCreatePage(page);

    await createPage.goto();
    await createPage.cancel();

    await page.waitForURL((url) => url.pathname === LIST_PATH);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Purchases', exact: true }),
    ).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 10: Responsive — no horizontal scroll
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Responsive layout (Scenario 10)', { tag: '@responsive' }, () => {
  test('New purchase dialog renders without horizontal scroll', async ({ page }) => {
    const createPage = new HouseholdItemCreatePage(page);
    await createPage.goto();

    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });

    expect(hasHorizontalScroll).toBe(false);
  });

  test('New purchase dialog renders correctly in dark mode', async ({ page }) => {
    const createPage = new HouseholdItemCreatePage(page);
    await createPage.goto();
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });
    await expect(createPage.heading).toBeVisible();

    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(hasHorizontalScroll).toBe(false);
  });
});
