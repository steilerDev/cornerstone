/**
 * E2E tests for the Budget Overview page (Story #148)
 *
 * UAT Scenarios covered:
 * - Page loads with the correct h1 "Budget" heading
 * - Budget sub-navigation (tabs) is visible
 * - Empty state shown when no budget data exists
 * - Summary cards visible when data is present
 * - Category breakdown table visible when categories have data
 * - Responsive layout: no horizontal scroll
 * - Dark mode rendering
 */

import { test, expect } from '../../fixtures/auth.js';
import { BudgetOverviewPage } from '../../pages/BudgetOverviewPage.js';
import { API } from '../../fixtures/testData.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal BudgetOverview response representing an all-zero state (no data entered). */
function emptyOverviewResponse() {
  return {
    availableFunds: 0,
    sourceCount: 0,
    minPlanned: 0,
    maxPlanned: 0,
    actualCost: 0,
    actualCostPaid: 0,
    remainingVsMinPlanned: 0,
    remainingVsMaxPlanned: 0,
    remainingVsActualCost: 0,
    remainingVsActualPaid: 0,
    categorySummaries: [],
    subsidySummary: {
      totalReductions: 0,
      activeSubsidyCount: 0,
    },
  };
}

/** BudgetOverview response with data in all four summary cards and two category rows. */
function populatedOverviewResponse() {
  return {
    availableFunds: 300000,
    sourceCount: 2,
    minPlanned: 250000,
    maxPlanned: 275000,
    actualCost: 185000,
    actualCostPaid: 150000,
    remainingVsMinPlanned: 50000,
    remainingVsMaxPlanned: 25000,
    remainingVsActualCost: 115000,
    remainingVsActualPaid: 150000,
    categorySummaries: [
      {
        categoryId: 'cat-001',
        categoryName: 'Materials',
        categoryColor: '#3b82f6',
        minPlanned: 120000,
        maxPlanned: 132000,
        actualCost: 95000,
        actualCostPaid: 80000,
        budgetLineCount: 4,
      },
      {
        categoryId: 'cat-002',
        categoryName: 'Labor',
        categoryColor: '#10b981',
        minPlanned: 130000,
        maxPlanned: 143000,
        actualCost: 90000,
        actualCostPaid: 70000,
        budgetLineCount: 3,
      },
    ],
    subsidySummary: {
      totalReductions: 12500,
      activeSubsidyCount: 2,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Page heading and navigation
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Page heading and navigation', { tag: '@responsive' }, () => {
  test('Page loads with h1 "Budget" heading', { tag: '@smoke' }, async ({ page }) => {
    const overviewPage = new BudgetOverviewPage(page);

    await overviewPage.goto();
    await overviewPage.waitForLoaded();

    // Then: The h1 heading shows "Budget"
    await expect(overviewPage.heading).toBeVisible();
    await expect(overviewPage.heading).toHaveText('Budget');
  });

  test('Budget sub-navigation is visible with all tabs', async ({ page }) => {
    const overviewPage = new BudgetOverviewPage(page);

    await overviewPage.goto();
    await overviewPage.waitForLoaded();

    // Then: The sub-navigation is visible
    await expect(overviewPage.subNav).toBeVisible();

    // And: All five budget tabs are present
    const expectedTabs = ['Overview', 'Categories', 'Vendors', 'Sources', 'Subsidies'];
    for (const tab of expectedTabs) {
      await expect(
        overviewPage.subNav.getByRole('listitem').filter({ hasText: tab }),
      ).toBeVisible();
    }
  });

  test('Page URL is /budget/overview', async ({ page }) => {
    const overviewPage = new BudgetOverviewPage(page);

    await overviewPage.goto();
    await page.waitForURL('/budget/overview');
    expect(page.url()).toContain('/budget/overview');
  });

  test('Navigating to /budget redirects to /budget/overview', async ({ page }) => {
    await page.goto('/budget');
    await page.waitForURL('/budget/overview');
    expect(page.url()).toContain('/budget/overview');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Empty state
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Empty state', { tag: '@responsive' }, () => {
  test('Empty state shown when no budget data exists', async ({ page }) => {
    const overviewPage = new BudgetOverviewPage(page);

    // Intercept API to return all-zero data — triggers the "no data" empty state
    await page.route(`${API.budgetOverview}`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ overview: emptyOverviewResponse() }),
        });
      } else {
        await route.continue();
      }
    });

    try {
      // Given: No budget data has been entered
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      // Then: The empty state block is visible
      await expect(overviewPage.emptyState).toBeVisible({ timeout: 8000 });

      // And: The empty state text mentions budget data
      const emptyText = await overviewPage.emptyState.textContent();
      expect(emptyText?.toLowerCase()).toMatch(/no budget data yet/);
    } finally {
      await page.unroute(`${API.budgetOverview}`);
    }
  });

  test('Category breakdown empty state shown when no categories have data', async ({ page }) => {
    const overviewPage = new BudgetOverviewPage(page);

    // Return a response with real financial data but no category summaries
    const responseBody = {
      ...emptyOverviewResponse(),
      minPlanned: 50000,
      maxPlanned: 55000,
      availableFunds: 100000,
      sourceCount: 1,
      remainingVsMinPlanned: 50000,
      remainingVsMaxPlanned: 45000,
    };

    await page.route(`${API.budgetOverview}`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ overview: responseBody }),
        });
      } else {
        await route.continue();
      }
    });

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      // Category breakdown section exists but shows an empty text
      await expect(overviewPage.categoryBreakdownHeading).toBeVisible({ timeout: 8000 });

      // Table is not present — empty text paragraph shown instead
      const tableVisible = await overviewPage.categoryBreakdownTable.isVisible();
      expect(tableVisible).toBe(false);
    } finally {
      await page.unroute(`${API.budgetOverview}`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Summary cards
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Summary cards', { tag: '@responsive' }, () => {
  test('All four summary cards visible when budget data is present', async ({ page }) => {
    const overviewPage = new BudgetOverviewPage(page);

    await page.route(`${API.budgetOverview}`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ overview: populatedOverviewResponse() }),
        });
      } else {
        await route.continue();
      }
    });

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      // Then: The cards grid is visible
      await expect(overviewPage.cardsGrid).toBeVisible({ timeout: 8000 });

      // And: All four cards are present
      const cardTitles = ['Planned Budget', 'Actual Cost', 'Financing', 'Subsidies'];
      for (const title of cardTitles) {
        const card = overviewPage.getSummaryCard(title);
        await expect(card).toBeVisible();
        // Heading inside the card is present
        await expect(card.getByRole('heading', { name: title, exact: true })).toBeVisible();
      }
    } finally {
      await page.unroute(`${API.budgetOverview}`);
    }
  });

  test('Planned Budget card shows Min (optimistic) and Max (pessimistic) stats', async ({
    page,
  }) => {
    const overviewPage = new BudgetOverviewPage(page);

    await page.route(`${API.budgetOverview}`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ overview: populatedOverviewResponse() }),
        });
      } else {
        await route.continue();
      }
    });

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      const min = await overviewPage.getSummaryCardValue('Planned Budget', 'Min (optimistic)');
      expect(min).toMatch(/250,000/);

      const max = await overviewPage.getSummaryCardValue('Planned Budget', 'Max (pessimistic)');
      expect(max).toMatch(/275,000/);
    } finally {
      await page.unroute(`${API.budgetOverview}`);
    }
  });

  test('Financing card shows Available Funds and Remaining stats', async ({ page }) => {
    const overviewPage = new BudgetOverviewPage(page);

    await page.route(`${API.budgetOverview}`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ overview: populatedOverviewResponse() }),
        });
      } else {
        await route.continue();
      }
    });

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      const available = await overviewPage.getSummaryCardValue('Financing', 'Available Funds');
      expect(available).toMatch(/300,000/);

      const optimistic = await overviewPage.getSummaryCardValue(
        'Financing',
        'Remaining (optimistic)',
      );
      expect(optimistic).toMatch(/50,000/);

      const pessimistic = await overviewPage.getSummaryCardValue(
        'Financing',
        'Remaining (pessimistic)',
      );
      expect(pessimistic).toMatch(/25,000/);
    } finally {
      await page.unroute(`${API.budgetOverview}`);
    }
  });

  test('Subsidies card shows Total Reductions stat', async ({ page }) => {
    const overviewPage = new BudgetOverviewPage(page);

    await page.route(`${API.budgetOverview}`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ overview: populatedOverviewResponse() }),
        });
      } else {
        await route.continue();
      }
    });

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      const reductions = await overviewPage.getSummaryCardValue('Subsidies', 'Total Reductions');
      expect(reductions).toMatch(/12,500/);
    } finally {
      await page.unroute(`${API.budgetOverview}`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Category Breakdown table
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Category breakdown table', { tag: '@responsive' }, () => {
  test('Category breakdown table is visible with data rows when categories have budget', async ({
    page,
  }) => {
    const overviewPage = new BudgetOverviewPage(page);

    await page.route(`${API.budgetOverview}`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ overview: populatedOverviewResponse() }),
        });
      } else {
        await route.continue();
      }
    });

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      // The "Category Breakdown" heading is visible
      await expect(overviewPage.categoryBreakdownHeading).toBeVisible({ timeout: 8000 });
      await expect(overviewPage.categoryBreakdownHeading).toHaveText('Category Breakdown');

      // The table is visible
      await expect(overviewPage.categoryBreakdownTable).toBeVisible();

      // Column headers present
      const table = overviewPage.categoryBreakdownTable;
      await expect(table.getByRole('columnheader', { name: 'Category' })).toBeVisible();
      await expect(table.getByRole('columnheader', { name: 'Min Planned' })).toBeVisible();
      await expect(table.getByRole('columnheader', { name: 'Max Planned' })).toBeVisible();
      await expect(table.getByRole('columnheader', { name: 'Actual Cost' })).toBeVisible();
      await expect(table.getByRole('columnheader', { name: 'Budget Lines' })).toBeVisible();

      // Two data rows (from the mocked response)
      const rowCount = await overviewPage.getTableRowCount();
      expect(rowCount).toBe(2);

      // First row contains "Materials"
      const rows = await overviewPage.getTableRows();
      const firstRowText = await rows[0].textContent();
      expect(firstRowText).toContain('Materials');

      // Footer "Total" row present
      await expect(overviewPage.categoryBreakdownTableFooter).toBeVisible();
      const footerText = await overviewPage.categoryBreakdownTableFooter.textContent();
      expect(footerText).toContain('Total');
    } finally {
      await page.unroute(`${API.budgetOverview}`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Error state
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Error state', { tag: '@responsive' }, () => {
  test('Error card with Retry button shown when API returns 500', async ({ page }) => {
    const overviewPage = new BudgetOverviewPage(page);

    await page.route(`${API.budgetOverview}`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            error: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error' },
          }),
        });
      } else {
        await route.continue();
      }
    });

    try {
      await overviewPage.goto();

      // Loading indicator disappears
      await overviewPage.loadingIndicator.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {
        // May have already hidden
      });

      // Error card is displayed
      await expect(overviewPage.errorCard).toBeVisible({ timeout: 8000 });

      // Error card contains an h2 "Error"
      await expect(
        overviewPage.errorCard.getByRole('heading', { name: 'Error', exact: true }),
      ).toBeVisible();

      // Retry button is visible
      await expect(overviewPage.retryButton).toBeVisible();
    } finally {
      await page.unroute(`${API.budgetOverview}`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Responsive layout
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Responsive layout', { tag: '@responsive' }, () => {
  test('Budget overview page renders without horizontal scroll on current viewport', async ({
    page,
  }) => {
    const overviewPage = new BudgetOverviewPage(page);

    await overviewPage.goto();
    await overviewPage.waitForLoaded();

    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(hasHorizontalScroll).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Dark mode rendering
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Dark mode rendering', { tag: '@responsive' }, () => {
  test('Budget overview page renders correctly in dark mode', async ({ page }) => {
    const overviewPage = new BudgetOverviewPage(page);

    await page.goto('/budget/overview');
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });

    await overviewPage.heading.waitFor({ state: 'visible', timeout: 8000 });

    // Heading is visible in dark mode
    await expect(overviewPage.heading).toBeVisible();

    // Sub-navigation is visible in dark mode
    await expect(overviewPage.subNav).toBeVisible();

    // No horizontal scroll in dark mode
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(hasHorizontalScroll).toBe(false);
  });

  test('Summary cards visible in dark mode when budget data is mocked', async ({ page }) => {
    const overviewPage = new BudgetOverviewPage(page);

    await page.route(`${API.budgetOverview}`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ overview: populatedOverviewResponse() }),
        });
      } else {
        await route.continue();
      }
    });

    try {
      await page.goto('/budget/overview');
      await page.evaluate(() => {
        document.documentElement.setAttribute('data-theme', 'dark');
      });

      await overviewPage.waitForLoaded();

      // Cards grid visible in dark mode
      await expect(overviewPage.cardsGrid).toBeVisible({ timeout: 8000 });

      const plannedBudgetCard = overviewPage.getSummaryCard('Planned Budget');
      await expect(plannedBudgetCard).toBeVisible();
    } finally {
      await page.unroute(`${API.budgetOverview}`);
    }
  });
});
