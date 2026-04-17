/**
 * E2E tests for the Budget Overview page (Story #148 + feat/budget-hero-bar + feat/1243)
 *
 * UAT Scenarios covered:
 * - Page loads with the correct h1 "Budget" heading
 * - Budget sub-navigation (tabs) is visible
 * - Empty state shown when no budget data exists
 * - Budget overview hero card visible when data is present
 * - Budget bar (stacked chart) is visible
 * - Error state with Retry button when API returns 500
 * - Responsive layout: no horizontal scroll
 * - Dark mode rendering
 * - Area Breakdown tree: root areas visible on load
 * - Area Breakdown tree: expand root reveals children
 * - Area Breakdown tree: collapse root hides children
 * - Area Breakdown tree: Expand All / Collapse All controls
 * - Area Breakdown tree: negative variance row visible and formatted
 * - Area Breakdown tree: Unassigned row appears when unassignedSummary present
 * - Area Breakdown tree: Unassigned row absent when unassignedSummary is null
 * - Area Breakdown tree: empty tree state (no treegrid or EmptyState visible)
 * - Area Breakdown tree: visible in dark mode
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
    remainingVsMinPlannedWithPayback: 0,
    remainingVsMaxPlannedWithPayback: 0,
    areaSummaries: [],
    unassignedSummary: null,
    subsidySummary: {
      totalReductions: 0,
      activeSubsidyCount: 0,
    },
  };
}

/** BudgetOverview response with data populated across all hero card metrics and an area tree. */
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
    remainingVsMinPlannedWithPayback: 50000,
    remainingVsMaxPlannedWithPayback: 25000,
    areaSummaries: [
      {
        areaId: 'area-001',
        name: 'Rohbau',
        parentId: null,
        planned: 120000,
        actual: 95000,
        variance: 25000,
      },
      {
        areaId: 'area-002',
        name: 'Keller',
        parentId: 'area-001',
        planned: 40000,
        actual: 38000,
        variance: 2000,
      },
      {
        areaId: 'area-003',
        name: 'Erdgeschoss',
        parentId: 'area-001',
        planned: 80000,
        actual: 57000,
        variance: 23000,
      },
      {
        areaId: 'area-004',
        name: 'Innenausbau',
        parentId: null,
        planned: 80000,
        actual: 82000,
        variance: -2000,
      },
      {
        areaId: 'area-005',
        name: 'Dachgeschoss',
        parentId: 'area-004',
        planned: 50000,
        actual: 52000,
        variance: -2000,
      },
    ],
    unassignedSummary: null,
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

    // And: All four budget tabs are present (Categories moved to Manage page)
    const expectedTabs = ['Overview', 'Vendors', 'Sources', 'Subsidies'];
    for (const tab of expectedTabs) {
      await expect(overviewPage.subNav.getByRole('link', { name: tab })).toBeVisible();
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
// Hero card
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Hero card', { tag: '@responsive' }, () => {
  test('Hero card is visible when data is present', async ({ page }) => {
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
    } finally {
      await page.unroute(`${API.budgetOverview}`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Area Breakdown tree
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Area Breakdown tree', { tag: '@responsive' }, () => {
  /**
   * Helper: mount a route returning the given overview payload.
   * Returns a teardown function that must be called in a finally block.
   */
  async function mountRoute(page: Parameters<typeof test>[1]['page'], body: object) {
    await page.route(`${API.budgetOverview}`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ overview: body }),
        });
      } else {
        await route.continue();
      }
    });
    return () => page.unroute(`${API.budgetOverview}`);
  }

  test('Root areas are visible on load, children are not', async ({ page }) => {
    const overviewPage = new BudgetOverviewPage(page);
    const teardown = await mountRoute(page, populatedOverviewResponse());

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      // Root rows should be visible immediately
      await expect(overviewPage.areaRow('Rohbau')).toBeVisible();
      await expect(overviewPage.areaRow('Innenausbau')).toBeVisible();

      // Child rows should not be visible (collapsed by default)
      await expect(overviewPage.areaRow('Keller')).not.toBeVisible();
      await expect(overviewPage.areaRow('Erdgeschoss')).not.toBeVisible();
    } finally {
      await teardown();
    }
  });

  test('Expanding a root area reveals its children', async ({ page }) => {
    const overviewPage = new BudgetOverviewPage(page);
    const teardown = await mountRoute(page, populatedOverviewResponse());

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      // Click the expand button for Rohbau
      await overviewPage.areaToggleButton('Rohbau').click();

      // Children should now be visible
      await expect(overviewPage.areaRow('Keller')).toBeVisible();
      await expect(overviewPage.areaRow('Erdgeschoss')).toBeVisible();
    } finally {
      await teardown();
    }
  });

  test('Collapsing a root area hides its children', async ({ page }) => {
    const overviewPage = new BudgetOverviewPage(page);
    const teardown = await mountRoute(page, populatedOverviewResponse());

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      // Expand then collapse
      await overviewPage.areaToggleButton('Rohbau').click();
      await expect(overviewPage.areaRow('Keller')).toBeVisible();

      await overviewPage.areaToggleButton('Rohbau').click();

      // Children should be hidden again
      await expect(overviewPage.areaRow('Keller')).not.toBeVisible();
      await expect(overviewPage.areaRow('Erdgeschoss')).not.toBeVisible();
    } finally {
      await teardown();
    }
  });

  test('Expand All shows all rows; Collapse All shows only root rows', async ({ page }) => {
    const overviewPage = new BudgetOverviewPage(page);
    const teardown = await mountRoute(page, populatedOverviewResponse());

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      // Expand All → all rows visible (both root parents and their children)
      await overviewPage.expandAllButton.click();
      await expect(overviewPage.areaRow('Rohbau')).toBeVisible();
      await expect(overviewPage.areaRow('Keller')).toBeVisible();
      await expect(overviewPage.areaRow('Erdgeschoss')).toBeVisible();
      await expect(overviewPage.areaRow('Innenausbau')).toBeVisible();
      await expect(overviewPage.areaRow('Dachgeschoss')).toBeVisible();

      // Collapse All → only root rows visible
      await overviewPage.collapseAllButton.click();
      await expect(overviewPage.areaRow('Rohbau')).toBeVisible();
      await expect(overviewPage.areaRow('Innenausbau')).toBeVisible();
      await expect(overviewPage.areaRow('Keller')).not.toBeVisible();
      await expect(overviewPage.areaRow('Erdgeschoss')).not.toBeVisible();
      await expect(overviewPage.areaRow('Dachgeschoss')).not.toBeVisible();
    } finally {
      await teardown();
    }
  });

  test('Row with negative variance is visible and contains the formatted value', async ({
    page,
  }) => {
    const overviewPage = new BudgetOverviewPage(page);
    const teardown = await mountRoute(page, populatedOverviewResponse());

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      // Innenausbau has variance -2000 — the row must be visible
      const innenausbauRow = overviewPage.areaRow('Innenausbau');
      await expect(innenausbauRow).toBeVisible();

      // The formatted negative amount must appear somewhere in the row
      const rowText = await innenausbauRow.textContent();
      // Negative variance appears as a negative-formatted number (e.g. "-2,000", "-€2,000", etc.)
      expect(rowText).toMatch(/-[\d,./€\s]*2[,.]?000/);
    } finally {
      await teardown();
    }
  });

  test('Unassigned row appears at the bottom when unassignedSummary is present', async ({
    page,
  }) => {
    const overviewPage = new BudgetOverviewPage(page);

    const responseWithUnassigned = {
      ...populatedOverviewResponse(),
      unassignedSummary: { planned: 5000, actual: 4800, variance: 200 },
    };

    const teardown = await mountRoute(page, responseWithUnassigned);

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      // The Unassigned row should be visible
      await expect(overviewPage.areaRow('Unassigned')).toBeVisible();
    } finally {
      await teardown();
    }
  });

  test('Unassigned row is absent when unassignedSummary is null', async ({ page }) => {
    const overviewPage = new BudgetOverviewPage(page);
    // populatedOverviewResponse() has unassignedSummary: null
    const teardown = await mountRoute(page, populatedOverviewResponse());

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      // No Unassigned row should appear
      await expect(overviewPage.areaRow('Unassigned')).not.toBeVisible();
    } finally {
      await teardown();
    }
  });

  test('Empty tree state: treegrid not rendered or EmptyState visible inside tree card', async ({
    page,
  }) => {
    const overviewPage = new BudgetOverviewPage(page);
    // emptyOverviewResponse() has areaSummaries: [] and unassignedSummary: null
    const teardown = await mountRoute(page, emptyOverviewResponse());

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      // Either the treegrid is absent from the DOM / not visible, OR an EmptyState is rendered
      const treegrid = page.locator('[role="treegrid"]');
      const treegridVisible = await treegrid.isVisible().catch(() => false);

      if (treegridVisible) {
        // If the treegrid renders even for empty data, an EmptyState must be visible inside it
        await expect(
          page.locator('[role="treegrid"]').locator('div[class*="emptyState"]'),
        ).toBeVisible();
      } else {
        // Treegrid absent — that is acceptable empty-tree behavior
        expect(treegridVisible).toBe(false);
      }
    } finally {
      await teardown();
    }
  });

  test('Area Breakdown tree is visible in dark mode', { tag: '@responsive' }, async ({ page }) => {
    const overviewPage = new BudgetOverviewPage(page);

    await page.addInitScript(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });

    const teardown = await mountRoute(page, populatedOverviewResponse());

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      // Tree card must be visible in dark mode
      await expect(overviewPage.areaTreeCard).toBeVisible();

      // Root area rows must be visible
      await expect(overviewPage.areaRow('Rohbau')).toBeVisible();
      await expect(overviewPage.areaRow('Innenausbau')).toBeVisible();
    } finally {
      await teardown();
    }
  });
});
