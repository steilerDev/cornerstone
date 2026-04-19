/**
 * E2E tests for Budget Overview page print behaviour (Issue #1310 / fix/1310-print-budget-overview)
 *
 * Tests covered:
 * 1. Print hides app chrome (sidebar, SubNav, hero card, Add button)
 * 2. Print forces full expansion of collapsed breakdown rows (beforeprint event)
 * 3. Print hides expand chevron buttons
 * 4. Print shows page title (h1)
 * 5. Dark mode forces light background in print (CSS variable reset)
 * 6. On-screen state restored after afterprint
 * 7. Other pages unaffected — regression check (AC10)
 *
 * All tests use API route mocking (no testcontainers) for speed.
 * Print is not viewport-dependent — desktop only (no @responsive tag).
 */

import { test, expect } from '../../fixtures/auth.js';
import { BudgetOverviewPage } from '../../pages/BudgetOverviewPage.js';
import { API, ROUTES } from '../../fixtures/testData.js';

// ─────────────────────────────────────────────────────────────────────────────
// Shared response factories (mirrored from budget-overview.spec.ts)
// ─────────────────────────────────────────────────────────────────────────────

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

/**
 * BudgetBreakdown response with a nested area hierarchy (Rohbau → Keller → Kellerbau)
 * and a No Area entry, so all expand/collapse paths are exercisable.
 */
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

/**
 * Mount route mocks for both GET /api/budget/overview and GET /api/budget/breakdown.
 * Returns a teardown function that unregisters both routes.
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

// ─────────────────────────────────────────────────────────────────────────────
// Print behaviour tests
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Budget Overview — print behaviour', () => {
  test('Print hides app chrome: sidebar, SubNav, hero card, and Add button', async ({ page }) => {
    const overviewPage = new BudgetOverviewPage(page);
    const teardown = await mountRoutes(
      page,
      populatedOverviewResponse(),
      populatedBreakdownResponse(),
    );

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      // Verify chrome is visible on screen before switching to print
      await expect(overviewPage.sidebar).toBeVisible();
      await expect(overviewPage.subNav).toBeVisible();
      await expect(overviewPage.heroCard).toBeVisible();
      await expect(overviewPage.addButton).toBeVisible();

      // Switch to print media
      await overviewPage.startPrint();

      // Sidebar (aside element) must be hidden
      await expect(overviewPage.sidebar).not.toBeVisible();

      // Budget section SubNav must be hidden
      await expect(overviewPage.subNav).not.toBeVisible();

      // Hero card must be hidden
      await expect(overviewPage.heroCard).not.toBeVisible();

      // Add dropdown button must be hidden
      await expect(overviewPage.addButton).not.toBeVisible();
    } finally {
      await overviewPage.endPrint();
      await teardown();
    }
  });

  test('Print forces full expansion of collapsed breakdown rows via beforeprint', async ({
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

      // Initially all rows are collapsed — Work Items section and its areas are not visible
      await expect(overviewPage.breakdownAreaRow('Rohbau')).not.toBeVisible();
      await expect(overviewPage.breakdownAreaRow('Keller')).not.toBeVisible();
      await expect(overviewPage.breakdownAreaRow('Kellerbau')).not.toBeVisible();

      // Dispatch beforeprint to trigger usePrintExpansion + switch to print media
      await overviewPage.startPrint();

      // Allow React to re-render after the setState inside usePrintExpansion
      // The hook's setState is asynchronous — wait for the DOM to reflect expansion
      await page.waitForFunction(() => {
        // Look for at least one expanded row (aria-expanded="true") in the breakdown table
        const section = document.querySelector('section[aria-labelledby="breakdown-heading"]');
        return (
          section !== null &&
          section.querySelector('[aria-expanded="true"]') !== null
        );
      });

      // All areas including nested ones should now be in the DOM and visible in print mode
      await expect(overviewPage.breakdownAreaRow('Rohbau')).toBeVisible();
      await expect(overviewPage.breakdownAreaRow('Keller')).toBeVisible();
      await expect(overviewPage.breakdownAreaRow('Kellerbau')).toBeVisible();
      await expect(overviewPage.breakdownAreaRow('No Area')).toBeVisible();
    } finally {
      await overviewPage.endPrint();
      await teardown();
    }
  });

  test('Print hides expand chevron buttons', async ({ page }) => {
    const overviewPage = new BudgetOverviewPage(page);
    const teardown = await mountRoutes(
      page,
      populatedOverviewResponse(),
      populatedBreakdownResponse(),
    );

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      // Expand Work Items so there are expand buttons visible on-screen
      await overviewPage.costBreakdownCard
        .getByRole('button', { name: /expand work item budget by area/i })
        .click();
      await expect(overviewPage.breakdownAreaRow('Rohbau')).toBeVisible();

      // Rohbau expand toggle should be visible on screen
      await expect(overviewPage.breakdownAreaToggle('Rohbau')).toBeVisible();

      // Switch to print
      await overviewPage.startPrint();

      // All expand/collapse buttons inside the breakdown table must be hidden via CSS
      // The .expandBtn class has display: none !important in @media print
      const expandButtons = overviewPage.costBreakdownCard.locator('[class*="expandBtn"]');
      const count = await expandButtons.count();
      expect(count).toBeGreaterThan(0); // Sanity: there should be expand buttons in the DOM
      for (let i = 0; i < count; i++) {
        await expect(expandButtons.nth(i)).not.toBeVisible();
      }
    } finally {
      await overviewPage.endPrint();
      await teardown();
    }
  });

  test('Print shows the page h1 title', async ({ page }) => {
    const overviewPage = new BudgetOverviewPage(page);
    const teardown = await mountRoutes(
      page,
      populatedOverviewResponse(),
      populatedBreakdownResponse(),
    );

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      // Switch to print
      await overviewPage.startPrint();

      // h1 heading must remain visible in print
      await expect(overviewPage.heading).toBeVisible();
      await expect(overviewPage.heading).toHaveText('Budget');
    } finally {
      await overviewPage.endPrint();
      await teardown();
    }
  });

  test('Dark mode: print resets CSS variables to light values', async ({ page }) => {
    const overviewPage = new BudgetOverviewPage(page);
    const teardown = await mountRoutes(
      page,
      populatedOverviewResponse(),
      populatedBreakdownResponse(),
    );

    try {
      await overviewPage.goto();

      // Apply dark theme before loading
      await page.evaluate(() => {
        document.documentElement.setAttribute('data-theme', 'dark');
      });

      await overviewPage.waitForLoaded();

      // Confirm dark theme is active on-screen: --color-bg-primary should NOT be #ffffff
      const darkBgVar = await page.evaluate(() =>
        getComputedStyle(document.documentElement)
          .getPropertyValue('--color-bg-primary')
          .trim(),
      );
      // In dark mode the primary background is a dark color, not white
      expect(darkBgVar).not.toBe('#ffffff');

      // Switch to print
      await overviewPage.startPrint();

      // The :global(@media print) rule in BudgetOverviewPage.module.css resets
      // --color-bg-primary to #ffffff regardless of data-theme
      const printBgVar = await page.evaluate(() =>
        getComputedStyle(document.documentElement)
          .getPropertyValue('--color-bg-primary')
          .trim(),
      );
      expect(printBgVar).toBe('#ffffff');
    } finally {
      await overviewPage.endPrint();
      await teardown();
    }
  });

  test('On-screen expansion state restored after afterprint', async ({ page }) => {
    const overviewPage = new BudgetOverviewPage(page);
    const teardown = await mountRoutes(
      page,
      populatedOverviewResponse(),
      populatedBreakdownResponse(),
    );

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      // Establish a known pre-print state:
      // Expand Work Items section and Rohbau — Keller becomes visible
      // Leave Keller collapsed — Kellerbau should NOT be visible
      await overviewPage.costBreakdownCard
        .getByRole('button', { name: /expand work item budget by area/i })
        .click();
      await overviewPage.breakdownAreaToggle('Rohbau').click();
      await expect(overviewPage.breakdownAreaRow('Keller')).toBeVisible();
      await expect(overviewPage.breakdownAreaRow('Kellerbau')).not.toBeVisible();

      // Simulate print cycle
      await overviewPage.startPrint();

      // During print: Kellerbau should now be visible (forced expansion)
      await page.waitForFunction(() => {
        const section = document.querySelector('section[aria-labelledby="breakdown-heading"]');
        return (
          section !== null &&
          section.querySelector('[aria-expanded="true"]') !== null
        );
      });

      // Restore screen
      await overviewPage.endPrint();

      // After afterprint: pre-print state should be restored
      // Rohbau is still expanded (Keller visible)
      await expect(overviewPage.breakdownAreaRow('Keller')).toBeVisible();
      // Keller was collapsed — Kellerbau should be hidden again
      await expect(overviewPage.breakdownAreaRow('Kellerbau')).not.toBeVisible();
    } finally {
      await teardown();
    }
  });

  test('Other pages are unaffected by Budget Overview print styles (regression AC10)', async ({
    page,
  }) => {
    // Navigate to the Diary page — not a budget page, no print-specific budget styling
    // Mock the diary API to avoid needing a live backend
    await page.route(`${API.diaryEntries}**`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ entries: [], total: 0, page: 1, pageSize: 20 }),
        });
      } else {
        await route.continue();
      }
    });

    try {
      await page.goto(ROUTES.diary);
      await page.getByRole('heading', { level: 1 }).waitFor({ state: 'visible' });

      // Switch to print media to simulate print on a non-budget page
      await page.emulateMedia({ media: 'print' });

      // The diary page h1 heading should still be visible — Budget Overview print
      // styles should not have hidden it
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    } finally {
      await page.emulateMedia({ media: 'screen' });
      await page.unroute(`${API.diaryEntries}**`);
    }
  });
});
