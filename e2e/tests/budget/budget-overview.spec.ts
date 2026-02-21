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
    totalPlannedBudget: 0,
    totalActualCost: 0,
    totalVariance: 0,
    categorySummaries: [],
    financingSummary: {
      totalAvailable: 0,
      totalUsed: 0,
      totalRemaining: 0,
      sourceCount: 0,
    },
    vendorSummary: {
      totalPaid: 0,
      totalOutstanding: 0,
      vendorCount: 0,
    },
    subsidySummary: {
      totalReductions: 0,
      activeSubsidyCount: 0,
    },
  };
}

/** BudgetOverview response with data in all four summary cards and two category rows. */
function populatedOverviewResponse() {
  return {
    totalPlannedBudget: 250000,
    totalActualCost: 185000,
    totalVariance: 65000,
    categorySummaries: [
      {
        categoryId: 'cat-001',
        categoryName: 'Materials',
        categoryColor: '#3b82f6',
        plannedBudget: 120000,
        actualCost: 95000,
        variance: 25000,
        workItemCount: 4,
      },
      {
        categoryId: 'cat-002',
        categoryName: 'Labor',
        categoryColor: '#10b981',
        plannedBudget: 130000,
        actualCost: 90000,
        variance: 40000,
        workItemCount: 3,
      },
    ],
    financingSummary: {
      totalAvailable: 300000,
      totalUsed: 185000,
      totalRemaining: 115000,
      sourceCount: 2,
    },
    vendorSummary: {
      totalPaid: 150000,
      totalOutstanding: 35000,
      vendorCount: 5,
    },
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
  test('Page loads with h1 "Budget" heading', async ({ page }) => {
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
    await page.waitForURL('/budget/overview', { timeout: 5000 });
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
          body: JSON.stringify(emptyOverviewResponse()),
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
      totalPlannedBudget: 50000,
      financingSummary: {
        totalAvailable: 100000,
        totalUsed: 50000,
        totalRemaining: 50000,
        sourceCount: 1,
      },
    };

    await page.route(`${API.budgetOverview}`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(responseBody),
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
          body: JSON.stringify(populatedOverviewResponse()),
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
      const cardTitles = ['Total Budget', 'Financing', 'Vendors', 'Subsidies'];
      for (const title of cardTitles) {
        const card = overviewPage.getSummaryCard(title);
        await expect(card).toBeVisible({ timeout: 5000 });
        // Heading inside the card is present
        await expect(card.getByRole('heading', { name: title, exact: true })).toBeVisible();
      }
    } finally {
      await page.unroute(`${API.budgetOverview}`);
    }
  });

  test('Total Budget card shows Planned, Actual Cost, and Variance stats', async ({ page }) => {
    const overviewPage = new BudgetOverviewPage(page);

    await page.route(`${API.budgetOverview}`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(populatedOverviewResponse()),
        });
      } else {
        await route.continue();
      }
    });

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      const planned = await overviewPage.getSummaryCardValue('Total Budget', 'Planned');
      expect(planned).toMatch(/250,000/);

      const actualCost = await overviewPage.getSummaryCardValue('Total Budget', 'Actual Cost');
      expect(actualCost).toMatch(/185,000/);

      const variance = await overviewPage.getSummaryCardValue('Total Budget', 'Variance');
      expect(variance).toMatch(/65,000/);
    } finally {
      await page.unroute(`${API.budgetOverview}`);
    }
  });

  test('Financing card shows Total Available, Used, and Remaining stats', async ({ page }) => {
    const overviewPage = new BudgetOverviewPage(page);

    await page.route(`${API.budgetOverview}`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(populatedOverviewResponse()),
        });
      } else {
        await route.continue();
      }
    });

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      const totalAvailable = await overviewPage.getSummaryCardValue('Financing', 'Total Available');
      expect(totalAvailable).toMatch(/300,000/);

      const used = await overviewPage.getSummaryCardValue('Financing', 'Used');
      expect(used).toMatch(/185,000/);

      const remaining = await overviewPage.getSummaryCardValue('Financing', 'Remaining');
      expect(remaining).toMatch(/115,000/);
    } finally {
      await page.unroute(`${API.budgetOverview}`);
    }
  });

  test('Vendors card shows Total Paid and Outstanding stats', async ({ page }) => {
    const overviewPage = new BudgetOverviewPage(page);

    await page.route(`${API.budgetOverview}`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(populatedOverviewResponse()),
        });
      } else {
        await route.continue();
      }
    });

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      const totalPaid = await overviewPage.getSummaryCardValue('Vendors', 'Total Paid');
      expect(totalPaid).toMatch(/150,000/);

      const outstanding = await overviewPage.getSummaryCardValue('Vendors', 'Outstanding');
      expect(outstanding).toMatch(/35,000/);
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
          body: JSON.stringify(populatedOverviewResponse()),
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
          body: JSON.stringify(populatedOverviewResponse()),
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
      await expect(overviewPage.categoryBreakdownTable).toBeVisible({ timeout: 5000 });

      // Column headers present
      const table = overviewPage.categoryBreakdownTable;
      await expect(table.getByRole('columnheader', { name: 'Category' })).toBeVisible();
      await expect(table.getByRole('columnheader', { name: 'Planned Budget' })).toBeVisible();
      await expect(table.getByRole('columnheader', { name: 'Actual Cost' })).toBeVisible();
      await expect(table.getByRole('columnheader', { name: 'Variance' })).toBeVisible();
      await expect(table.getByRole('columnheader', { name: 'Work Items' })).toBeVisible();

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
          body: JSON.stringify(populatedOverviewResponse()),
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

      const totalBudgetCard = overviewPage.getSummaryCard('Total Budget');
      await expect(totalBudgetCard).toBeVisible();
    } finally {
      await page.unroute(`${API.budgetOverview}`);
    }
  });
});
