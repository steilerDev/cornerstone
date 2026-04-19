/**
 * E2E tests for the Budget Overview page (Story #148 + feat/budget-hero-bar + fix/1276)
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
 * - Cost Breakdown area grouping: rows visible after expanding Work Items section
 * - Cost Breakdown area grouping: expanding a root area reveals child areas
 * - Cost Breakdown area grouping: expanding a child area reveals items
 * - Cost Breakdown area grouping: collapsing a root hides children
 * - Cost Breakdown area grouping: No Area row appears when breakdown has null-area items
 * - Cost Breakdown area grouping: "No Area" label visible, "Unassigned" label absent
 * - Cost Breakdown area grouping: no No Area row when breakdown has none
 * - Cost Breakdown area grouping: nested-area indent increases with depth (bounding box)
 * - Cost Breakdown area grouping: no standalone Area Breakdown section renders (smoke)
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
// Cost Breakdown area grouping
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal BudgetBreakdown response with no area data. */
function emptyBreakdownResponse() {
  const emptyTotals = {
    projectedMin: 0,
    projectedMax: 0,
    actualCost: 0,
    subsidyPayback: 0,
    rawProjectedMin: 0,
    rawProjectedMax: 0,
    minSubsidyPayback: 0,
  };
  return {
    workItems: { areas: [], totals: emptyTotals },
    householdItems: { areas: [], totals: emptyTotals },
    subsidyAdjustments: [],
  };
}

/** BudgetBreakdown response with a nested area hierarchy and a No Area entry. */
function populatedBreakdownResponse() {
  return {
    workItems: {
      areas: [
        {
          areaId: null,
          name: 'No Area',
          parentId: null,
          color: null,
          projectedMin: 5000,
          projectedMax: 6000,
          actualCost: 0,
          subsidyPayback: 0,
          rawProjectedMin: 5000,
          rawProjectedMax: 6000,
          minSubsidyPayback: 0,
          items: [
            {
              workItemId: 'wi-unassigned-1',
              title: 'No Area Work Item',
              projectedMin: 5000,
              projectedMax: 6000,
              actualCost: 0,
              subsidyPayback: 0,
              rawProjectedMin: 5000,
              rawProjectedMax: 6000,
              minSubsidyPayback: 0,
              costDisplay: 'projected',
              budgetLines: [],
            },
          ],
          children: [],
        },
        {
          areaId: 'area-rohbau',
          name: 'Rohbau',
          parentId: null,
          color: '#3B82F6',
          projectedMin: 100000,
          projectedMax: 130000,
          actualCost: 80000,
          subsidyPayback: 0,
          rawProjectedMin: 100000,
          rawProjectedMax: 130000,
          minSubsidyPayback: 0,
          items: [],
          children: [
            {
              areaId: 'area-keller',
              name: 'Keller',
              parentId: 'area-rohbau',
              color: null,
              projectedMin: 40000,
              projectedMax: 50000,
              actualCost: 38000,
              subsidyPayback: 0,
              rawProjectedMin: 40000,
              rawProjectedMax: 50000,
              minSubsidyPayback: 0,
              items: [
                {
                  workItemId: 'wi-keller-1',
                  title: 'Kellerbau',
                  projectedMin: 40000,
                  projectedMax: 50000,
                  actualCost: 38000,
                  subsidyPayback: 0,
                  rawProjectedMin: 40000,
                  rawProjectedMax: 50000,
                  minSubsidyPayback: 0,
                  costDisplay: 'mixed',
                  budgetLines: [],
                },
              ],
              children: [],
            },
          ],
        },
      ],
      totals: {
        projectedMin: 105000,
        projectedMax: 136000,
        actualCost: 80000,
        subsidyPayback: 0,
        rawProjectedMin: 105000,
        rawProjectedMax: 136000,
        minSubsidyPayback: 0,
      },
    },
    householdItems: {
      areas: [],
      totals: {
        projectedMin: 0,
        projectedMax: 0,
        actualCost: 0,
        subsidyPayback: 0,
        rawProjectedMin: 0,
        rawProjectedMax: 0,
        minSubsidyPayback: 0,
      },
    },
    subsidyAdjustments: [],
  };
}

test.describe('Cost Breakdown area grouping', { tag: '@responsive' }, () => {
  /**
   * Mount route mocks for both GET /api/budget/overview and GET /api/budget/breakdown.
   * Returns a teardown function that must be called in a finally block.
   */
  async function mountRoutes(
    page: Parameters<typeof test>[1]['page'],
    overviewBody: object,
    breakdownBody: object,
  ) {
    await page.route(`${API.budgetOverview}`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ overview: overviewBody }),
        });
      } else {
        await route.continue();
      }
    });
    await page.route(`${API.budgetBreakdown}`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ breakdown: breakdownBody }),
        });
      } else {
        await route.continue();
      }
    });
    return async () => {
      await page.unroute(`${API.budgetOverview}`);
      await page.unroute(`${API.budgetBreakdown}`);
    };
  }

  test('Breakdown area rows visible after expanding Work Items section', async ({ page }) => {
    const overviewPage = new BudgetOverviewPage(page);
    const teardown = await mountRoutes(
      page,
      populatedOverviewResponse(),
      populatedBreakdownResponse(),
    );

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      // Expand the Level-0 Work Items section using its aria-label
      await overviewPage.costBreakdownCard
        .getByRole('button', { name: /expand work item budget by area/i })
        .click();

      // Both root-level areas should now be visible
      await expect(overviewPage.breakdownAreaRow('No Area')).toBeVisible();
      await expect(overviewPage.breakdownAreaRow('Rohbau')).toBeVisible();
    } finally {
      await teardown();
    }
  });

  test('Expanding a root area reveals child areas', async ({ page }) => {
    const overviewPage = new BudgetOverviewPage(page);
    const teardown = await mountRoutes(
      page,
      populatedOverviewResponse(),
      populatedBreakdownResponse(),
    );

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      // Expand Work Items section first
      await overviewPage.costBreakdownCard
        .getByRole('button', { name: /expand work item budget by area/i })
        .click();
      await expect(overviewPage.breakdownAreaRow('Rohbau')).toBeVisible();

      // Now expand Rohbau — Keller should appear
      await overviewPage.breakdownAreaToggle('Rohbau').click();
      await expect(overviewPage.breakdownAreaRow('Keller')).toBeVisible();

      // Kellerbau (the item inside Keller) should NOT be visible — Keller is still collapsed
      await expect(overviewPage.breakdownAreaRow('Kellerbau')).not.toBeVisible();
    } finally {
      await teardown();
    }
  });

  test('Expanding a child area reveals items', async ({ page }) => {
    const overviewPage = new BudgetOverviewPage(page);
    const teardown = await mountRoutes(
      page,
      populatedOverviewResponse(),
      populatedBreakdownResponse(),
    );

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      // Expand Work Items → expand Rohbau → expand Keller
      await overviewPage.costBreakdownCard
        .getByRole('button', { name: /expand work item budget by area/i })
        .click();
      await overviewPage.breakdownAreaToggle('Rohbau').click();
      await expect(overviewPage.breakdownAreaRow('Keller')).toBeVisible();
      await overviewPage.breakdownAreaToggle('Keller').click();

      // Kellerbau (item inside Keller) should now be visible
      await expect(overviewPage.breakdownAreaRow('Kellerbau')).toBeVisible();
    } finally {
      await teardown();
    }
  });

  test('Collapsing a root area hides children', async ({ page }) => {
    const overviewPage = new BudgetOverviewPage(page);
    const teardown = await mountRoutes(
      page,
      populatedOverviewResponse(),
      populatedBreakdownResponse(),
    );

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      // Expand Work Items → expand Rohbau → verify Keller visible
      await overviewPage.costBreakdownCard
        .getByRole('button', { name: /expand work item budget by area/i })
        .click();
      await overviewPage.breakdownAreaToggle('Rohbau').click();
      await expect(overviewPage.breakdownAreaRow('Keller')).toBeVisible();

      // Collapse Rohbau → Keller should disappear
      await overviewPage.breakdownAreaToggle('Rohbau').click();
      await expect(overviewPage.breakdownAreaRow('Keller')).not.toBeVisible();
    } finally {
      await teardown();
    }
  });

  test('"No Area" row appears when breakdown has null-area items', async ({ page }) => {
    const overviewPage = new BudgetOverviewPage(page);
    const teardown = await mountRoutes(
      page,
      populatedOverviewResponse(),
      populatedBreakdownResponse(),
    );

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      // Expand the Work Items section to reveal area rows
      await overviewPage.costBreakdownCard
        .getByRole('button', { name: /expand work item budget by area/i })
        .click();

      // "No Area" row should be visible (populated response includes a null-area entry)
      await expect(overviewPage.breakdownAreaRow('No Area')).toBeVisible();
    } finally {
      await teardown();
    }
  });

  test('"No Area" label visible and "Unassigned" label absent after expanding Work Items', async ({
    page,
  }) => {
    const overviewPage = new BudgetOverviewPage(page);
    const teardown = await mountRoutes(
      page,
      populatedOverviewResponse(),
      populatedBreakdownResponse(),
    );

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      // Expand the Work Items section to reveal area rows
      await overviewPage.costBreakdownCard
        .getByRole('button', { name: /expand work item budget by area/i })
        .click();

      // "No Area" text should be visible in the cost breakdown card
      await expect(
        overviewPage.costBreakdownCard.getByText('No Area', { exact: true }),
      ).toBeVisible();

      // "Unassigned" text must NOT appear anywhere in the cost breakdown card
      await expect(
        overviewPage.costBreakdownCard.getByText('Unassigned', { exact: true }),
      ).not.toBeVisible();
    } finally {
      await teardown();
    }
  });

  test('No "No Area" row when breakdown has no null-area items', async ({ page }) => {
    const overviewPage = new BudgetOverviewPage(page);

    // Custom breakdown with only named areas — no null-areaId entry
    const namedOnlyBreakdown = {
      ...populatedBreakdownResponse(),
      workItems: {
        ...populatedBreakdownResponse().workItems,
        areas: populatedBreakdownResponse().workItems.areas.filter((a) => a.areaId !== null),
      },
    };

    const teardown = await mountRoutes(page, populatedOverviewResponse(), namedOnlyBreakdown);

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      // Expand Work Items section
      await overviewPage.costBreakdownCard
        .getByRole('button', { name: /expand work item budget by area/i })
        .click();

      // "No Area" row should not be present
      await expect(overviewPage.breakdownAreaRow('No Area')).not.toBeVisible();
    } finally {
      await teardown();
    }
  });

  test('Nested area indent increases with depth (Keller item indented more than Keller area)', async ({
    page,
  }) => {
    const overviewPage = new BudgetOverviewPage(page);
    const teardown = await mountRoutes(
      page,
      populatedOverviewResponse(),
      populatedBreakdownResponse(),
    );

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      // Expand Work Items → Rohbau → Keller to reveal the Kellerbau item row
      await overviewPage.costBreakdownCard
        .getByRole('button', { name: /expand work item budget by area/i })
        .click();
      await overviewPage.breakdownAreaToggle('Rohbau').click();
      await expect(overviewPage.breakdownAreaRow('Keller')).toBeVisible();
      await overviewPage.breakdownAreaToggle('Keller').click();
      await expect(overviewPage.breakdownAreaRow('Kellerbau')).toBeVisible();

      // Measure computed paddingLeft of the name cell (first td) for both rows.
      // boundingBox().x is identical for both cells because <td> starts at the same
      // left edge regardless of its padding — only the computed style reflects indent depth.
      const kellerRow = overviewPage.breakdownAreaRow('Keller');
      const kellerbauRow = page.getByRole('row').filter({ hasText: 'Kellerbau' });
      const kellerCell = kellerRow.locator('td').first();
      const kellerbauCell = kellerbauRow.locator('td').first();

      const kellerPaddingLeft = await kellerCell.evaluate((el) =>
        parseFloat(getComputedStyle(el as HTMLElement).paddingLeft),
      );
      const kellerbauPaddingLeft = await kellerbauCell.evaluate((el) =>
        parseFloat(getComputedStyle(el as HTMLElement).paddingLeft),
      );

      // Kellerbau (depth-1 item inside a depth-1 area) must be indented further than Keller (depth-1 area)
      expect(kellerbauPaddingLeft).toBeGreaterThan(kellerPaddingLeft);
    } finally {
      await teardown();
    }
  });

  test('No standalone Area Breakdown section renders', { tag: '@smoke' }, async ({ page }) => {
    // Navigate without mocks — verifies the removed AreaTreeTable section is gone
    await page.goto('/budget/overview');
    await page.getByRole('heading', { level: 1, name: 'Budget', exact: true }).waitFor({
      state: 'visible',
    });

    // No treegrid (AreaTreeTable used role="treegrid") should be visible anywhere on the page
    await expect(page.locator('[role="treegrid"]')).not.toBeVisible();

    // No heading matching "Area Breakdown" should exist on the page
    await expect(page.getByRole('heading', { name: /area breakdown/i })).not.toBeVisible();
  });
});
