/**
 * E2E tests for the Budget Overview page (Story #148 + feat/budget-hero-bar)
 *
 * UAT Scenarios covered:
 * - Page loads with the correct h1 "Budget" heading
 * - Budget sub-navigation (tabs) is visible
 * - Empty state shown when no budget data exists
 * - Budget Health Hero card visible when data is present
 * - Health badge shows budget status
 * - Budget bar (stacked chart) is visible
 * - Category filter button is accessible
 * - Error state with Retry button when API returns 500
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
    projectedMin: 0,
    projectedMax: 0,
    actualCostClaimed: 0,
    remainingVsMinPlanned: 0,
    remainingVsMaxPlanned: 0,
    remainingVsActualCost: 0,
    remainingVsActualPaid: 0,
    remainingVsProjectedMin: 0,
    remainingVsProjectedMax: 0,
    remainingVsActualClaimed: 0,
    categorySummaries: [],
    subsidySummary: {
      totalReductions: 0,
      activeSubsidyCount: 0,
    },
  };
}

/** BudgetOverview response with data populated across all hero card metrics and two category rows. */
function populatedOverviewResponse() {
  return {
    availableFunds: 300000,
    sourceCount: 2,
    minPlanned: 250000,
    maxPlanned: 275000,
    actualCost: 185000,
    actualCostPaid: 150000,
    projectedMin: 260000,
    projectedMax: 270000,
    actualCostClaimed: 80000,
    remainingVsMinPlanned: 50000,
    remainingVsMaxPlanned: 25000,
    remainingVsActualCost: 115000,
    remainingVsActualPaid: 150000,
    remainingVsProjectedMin: 40000,
    remainingVsProjectedMax: 30000,
    remainingVsActualClaimed: 220000,
    categorySummaries: [
      {
        categoryId: 'cat-001',
        categoryName: 'Materials',
        categoryColor: '#3b82f6',
        minPlanned: 120000,
        maxPlanned: 132000,
        actualCost: 95000,
        actualCostPaid: 80000,
        projectedMin: 125000,
        projectedMax: 130000,
        actualCostClaimed: 50000,
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
        projectedMin: 135000,
        projectedMax: 140000,
        actualCostClaimed: 30000,
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
});

// ─────────────────────────────────────────────────────────────────────────────
// Budget Health Hero
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Budget Health Hero', { tag: '@responsive' }, () => {
  test('Hero card is visible with Budget Health heading when data is present', async ({ page }) => {
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

      // Then: The hero card is visible
      await expect(overviewPage.heroCard).toBeVisible({ timeout: 8000 });

      // And: The hero card has a "Budget Health" heading
      await expect(overviewPage.heroTitle).toBeVisible();
      await expect(overviewPage.heroTitle).toHaveText('Budget Health');
    } finally {
      await page.unroute(`${API.budgetOverview}`);
    }
  });

  test('Health badge shows budget status', async ({ page }) => {
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

      // Then: The health badge (role="status") is visible inside the hero card
      await expect(overviewPage.healthBadge).toBeVisible({ timeout: 8000 });
    } finally {
      await page.unroute(`${API.budgetOverview}`);
    }
  });

  test('Budget bar is visible', async ({ page }) => {
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

      // Then: The BudgetBar stacked bar chart is visible (role="img")
      await expect(page.getByRole('img', { name: /Budget breakdown/ })).toBeVisible({
        timeout: 8000,
      });
    } finally {
      await page.unroute(`${API.budgetOverview}`);
    }
  });

  test('Category filter button is visible', async ({ page }) => {
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

      // Then: The category filter dropdown button is visible
      await expect(overviewPage.categoryFilterButton).toBeVisible({ timeout: 8000 });
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

  test('Hero card visible in dark mode when budget data is mocked', async ({ page }) => {
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

      // Hero card visible in dark mode
      await expect(overviewPage.heroCard).toBeVisible({ timeout: 8000 });

      // Hero title visible in dark mode
      await expect(overviewPage.heroTitle).toBeVisible();
    } finally {
      await page.unroute(`${API.budgetOverview}`);
    }
  });
});
