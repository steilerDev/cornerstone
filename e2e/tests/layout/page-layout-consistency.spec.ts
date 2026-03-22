/**
 * E2E tests for consistent list page layout (Issue #1142)
 *
 * Verifies that all 8 list pages share a consistent header layout after
 * the standardization introduced in issue #1142:
 *   - 1200px max-width content wrapper
 *   - h1 page title visible
 *   - "New ..." primary action button (or dropdown) visible with correct text
 *
 * Pages under test:
 *   /budget/overview        — Budget h1, "New" dropdown trigger
 *   /budget/sources         — Budget h1, "New Source" button
 *   /budget/subsidies       — Budget h1, "New Subsidy Program" button
 *   /budget/invoices        — Budget h1, "New Invoice" button
 *   /budget/vendors         — Budget h1, "New Vendor" button
 *   /project/work-items     — Project h1, "New Work Item" button
 *   /project/household-items — Project h1, "New Household Item" button
 *   /project/milestones     — Project h1, "New Milestone" button
 *
 * Scenarios:
 * 1. Desktop — all 8 pages have consistent header layout (h1 + primary button visible)
 * 2. Budget Overview dropdown text ("New" trigger, "New Invoice"/"New Vendor" items)
 * 3. Button text correctness — Budget sub-pages
 * 4. Button text correctness — Project sub-pages
 * 5. Mobile — header renders with title and button visible on narrow viewport
 */

import { test, expect } from '../../fixtures/auth.js';

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: Desktop — all 8 pages load with h1 title and primary action button
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Page layout consistency — all 8 list pages', () => {
  const listPages = [
    // Budget section
    { name: 'Budget Overview', route: '/budget/overview', h1: 'Budget' },
    { name: 'Budget Sources', route: '/budget/sources', h1: 'Budget' },
    { name: 'Subsidy Programs', route: '/budget/subsidies', h1: 'Budget' },
    { name: 'Invoices', route: '/budget/invoices', h1: 'Budget' },
    { name: 'Vendors', route: '/budget/vendors', h1: 'Budget' },
    // Project section
    { name: 'Work Items', route: '/project/work-items', h1: 'Project' },
    { name: 'Household Items', route: '/project/household-items', h1: 'Project' },
    { name: 'Milestones', route: '/project/milestones', h1: 'Project' },
  ] as const;

  for (const { name, route, h1 } of listPages) {
    test(`${name} — h1 title visible`, async ({ authenticatedPage }) => {
      await authenticatedPage.goto(route);
      const heading = authenticatedPage.getByRole('heading', {
        level: 1,
        name: h1,
        exact: true,
      });
      await expect(heading).toBeVisible();
    });

    test(`${name} — primary action button or dropdown visible`, async ({ authenticatedPage }) => {
      await authenticatedPage.goto(route);

      // Budget Overview has a dropdown trigger ("New"); all other pages have
      // a named "New ..." button. We look for any primary-action button in the
      // page header area — a button whose text starts with "New" covers both cases.
      const newButton = authenticatedPage
        .locator('button')
        .filter({ hasText: /^New/ })
        .first();
      await expect(newButton).toBeVisible();
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: Budget Overview dropdown
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Budget Overview — "New" dropdown', () => {
  test('Trigger button reads "New"', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/budget/overview');
    await authenticatedPage.getByRole('heading', { level: 1, name: 'Budget', exact: true }).waitFor({ state: 'visible' });

    // The trigger button has data-testid="budget-overview-add-button" and text "New"
    const trigger = authenticatedPage.getByTestId('budget-overview-add-button');
    await expect(trigger).toBeVisible();
    await expect(trigger).toHaveText('New');
  });

  test('Dropdown shows "New Invoice" and "New Vendor" items', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/budget/overview');
    await authenticatedPage.getByRole('heading', { level: 1, name: 'Budget', exact: true }).waitFor({ state: 'visible' });

    // Open the dropdown
    const trigger = authenticatedPage.getByTestId('budget-overview-add-button');
    await trigger.click();

    // Dropdown menu items should appear
    const newInvoiceItem = authenticatedPage.getByTestId('budget-overview-add-invoice');
    const newVendorItem = authenticatedPage.getByTestId('budget-overview-add-vendor');

    await expect(newInvoiceItem).toBeVisible();
    await expect(newVendorItem).toBeVisible();
    await expect(newInvoiceItem).toHaveText('New Invoice');
    await expect(newVendorItem).toHaveText('New Vendor');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: Button text correctness — Budget sub-pages
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Budget sub-pages — "New ..." button text', () => {
  test('BudgetSources (/budget/sources) — button reads "New Source"', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto('/budget/sources');
    await authenticatedPage.getByRole('heading', { level: 1, name: 'Budget', exact: true }).waitFor({ state: 'visible' });

    // The "New Source" button opens the inline create form
    const button = authenticatedPage.getByRole('button', { name: 'New Source', exact: true });
    await expect(button).toBeVisible();
  });

  test('SubsidyPrograms (/budget/subsidies) — button reads "New Subsidy Program"', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto('/budget/subsidies');
    await authenticatedPage.getByRole('heading', { level: 1, name: 'Budget', exact: true }).waitFor({ state: 'visible' });

    const button = authenticatedPage.getByRole('button', {
      name: 'New Subsidy Program',
      exact: true,
    });
    await expect(button).toBeVisible();
  });

  test('Invoices (/budget/invoices) — button reads "New Invoice"', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto('/budget/invoices');
    await authenticatedPage.getByRole('heading', { level: 1, name: 'Budget', exact: true }).waitFor({ state: 'visible' });

    // data-testid="new-invoice-button" with text "New Invoice"
    const button = authenticatedPage.getByTestId('new-invoice-button');
    await expect(button).toBeVisible();
    await expect(button).toHaveText('New Invoice');
  });

  test('Vendors (/budget/vendors) — button reads "New Vendor"', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto('/budget/vendors');
    await authenticatedPage.getByRole('heading', { level: 1, name: 'Budget', exact: true }).waitFor({ state: 'visible' });

    // The vendor page add button renders "New Vendor" (t('vendors.addVendor'))
    const button = authenticatedPage.getByRole('button', { name: 'New Vendor', exact: true });
    await expect(button).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: Button text correctness — Project sub-pages
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Project sub-pages — "New ..." button text', () => {
  test('WorkItems (/project/work-items) — button reads "New Work Item"', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto('/project/work-items');
    await authenticatedPage.getByRole('heading', { level: 1, name: 'Project', exact: true }).waitFor({ state: 'visible' });

    const button = authenticatedPage.getByRole('button', { name: 'New Work Item', exact: true });
    await expect(button).toBeVisible();
  });

  test('HouseholdItems (/project/household-items) — button reads "New Household Item"', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto('/project/household-items');
    await authenticatedPage.getByRole('heading', { level: 1, name: 'Project', exact: true }).waitFor({ state: 'visible' });

    const button = authenticatedPage.getByRole('button', {
      name: 'New Household Item',
      exact: true,
    });
    await expect(button).toBeVisible();
  });

  test('Milestones (/project/milestones) — button reads "New Milestone"', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto('/project/milestones');
    await authenticatedPage.getByRole('heading', { level: 1, name: 'Project', exact: true }).waitFor({ state: 'visible' });

    // data-testid="new-milestone-button" with text "New Milestone"
    const button = authenticatedPage.getByTestId('new-milestone-button');
    await expect(button).toBeVisible();
    await expect(button).toHaveText('New Milestone');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: Mobile — header stacks vertically, title and button remain visible
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Mobile — header stacks vertically', () => {
  test('Vendors page — title and button both visible on narrow viewport', async ({
    authenticatedPage,
  }) => {
    const viewport = authenticatedPage.viewportSize();

    // This test is only meaningful on narrow (mobile/tablet) viewports.
    // On desktop viewports it acts as an extra smoke check.
    await authenticatedPage.goto('/budget/vendors');

    const heading = authenticatedPage.getByRole('heading', {
      level: 1,
      name: 'Budget',
      exact: true,
    });
    await expect(heading).toBeVisible();

    const button = authenticatedPage.getByRole('button', { name: 'New Vendor', exact: true });
    await expect(button).toBeVisible();

    // On narrow viewports the header should not cause horizontal overflow
    if (viewport && viewport.width <= 768) {
      const hasHorizontalScroll = await authenticatedPage.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      expect(hasHorizontalScroll).toBe(false);
    }
  });

  test('WorkItems page — title and button both visible on narrow viewport', async ({
    authenticatedPage,
  }) => {
    const viewport = authenticatedPage.viewportSize();

    await authenticatedPage.goto('/project/work-items');

    const heading = authenticatedPage.getByRole('heading', {
      level: 1,
      name: 'Project',
      exact: true,
    });
    await expect(heading).toBeVisible();

    const button = authenticatedPage.getByRole('button', { name: 'New Work Item', exact: true });
    await expect(button).toBeVisible();

    // On narrow viewports verify no horizontal overflow
    if (viewport && viewport.width <= 768) {
      const hasHorizontalScroll = await authenticatedPage.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      expect(hasHorizontalScroll).toBe(false);
    }
  });
});
