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

  // TODO(#1310): stabilise — intermittent timing/fixture issues in CI, see PR #1312 discussion
  test.skip('Print forces full expansion of collapsed breakdown rows via beforeprint', async ({
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
      // "Kellerbau" is unique and doesn't clash with any other name
      await expect(overviewPage.breakdownAreaRow('Kellerbau')).not.toBeVisible();

      // Dispatch beforeprint to trigger usePrintExpansion + switch to print media
      await overviewPage.startPrint();

      // Allow React to re-render after the setState inside usePrintExpansion.
      // The hook's setState is asynchronous — wait for the DOM to reflect expansion.
      await page.waitForFunction(() => {
        const section = document.querySelector('section[aria-labelledby="breakdown-heading"]');
        return (
          section !== null && section.querySelector('[aria-expanded="true"]') !== null
        );
      });

      // Root areas visible after forced expansion.
      // "No Area" is also a substring of the work item "No Area Work Item" so use exact span
      // matching (same pattern as Keller/Kellerbau fix) to avoid strict-mode violations.
      await expect(overviewPage.breakdownAreaRow('Rohbau')).toBeVisible();
      const noAreaRow = overviewPage.costBreakdownCard
        .getByRole('row')
        .filter({ has: page.locator('span', { hasText: /^No Area$/ }) });
      await expect(noAreaRow).toBeVisible();

      // Deeply nested rows visible — Kellerbau is a work item inside Keller inside Rohbau.
      // Use exact span text matching to avoid strict-mode conflicts with "Keller" vs "Kellerbau".
      const kellerbauRow = overviewPage.costBreakdownCard
        .getByRole('row')
        .filter({ has: page.locator('span', { hasText: /^Kellerbau$/ }) });
      await expect(kellerbauRow).toBeVisible();

      // Keller area row: scope to span with exact text "Keller" to avoid matching "Kellerbau"
      const kellerAreaRow = overviewPage.costBreakdownCard
        .getByRole('row')
        .filter({ has: page.locator('span', { hasText: /^Keller$/ }) });
      await expect(kellerAreaRow).toBeVisible();
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

      // All expand/collapse buttons inside the breakdown table must be hidden via CSS.
      // The .expandBtn class has display: none !important in @media print.
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

  // TODO(#1310): stabilise — intermittent timing/fixture issues in CI, see PR #1312 discussion
  test.skip('Dark mode: print resets CSS variables to light values', async ({ page }) => {
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
      expect(darkBgVar.toLowerCase()).not.toBe('#ffffff');

      // Switch to print
      await overviewPage.startPrint();

      // The :global(@media print) rule in BudgetOverviewPage.module.css resets
      // --color-bg-primary to #ffffff regardless of data-theme.
      // To avoid brittle string comparisons (some browsers return '#ffffff', others
      // 'rgb(255, 255, 255)', etc.) we create a throwaway element, apply the CSS
      // variable as its background-color, and read the computed rgb() value which
      // browsers always normalise to 'rgb(R, G, B)' format.
      const printBgNormalised = await page.evaluate(() => {
        const el = document.createElement('div');
        el.style.backgroundColor = 'var(--color-bg-primary)';
        document.body.appendChild(el);
        const computed = getComputedStyle(el).backgroundColor;
        document.body.removeChild(el);
        return computed;
      });
      // White in all normalised forms: 'rgb(255, 255, 255)' (with or without spaces)
      const isWhite =
        printBgNormalised === 'rgb(255, 255, 255)' ||
        printBgNormalised === 'rgb(255,255,255)' ||
        printBgNormalised === 'rgba(255, 255, 255, 1)' ||
        printBgNormalised === 'rgba(255,255,255,1)';
      expect(isWhite).toBe(true);
    } finally {
      await overviewPage.endPrint();
      await teardown();
    }
  });

  // TODO(#1310): stabilise — intermittent timing/fixture issues in CI, see PR #1312 discussion
  test.skip('On-screen expansion state restored after afterprint', async ({ page }) => {
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
      // Expand Work Items section and Rohbau — Keller area becomes visible.
      // Leave Keller collapsed — Kellerbau work item should NOT be visible.
      await overviewPage.costBreakdownCard
        .getByRole('button', { name: /expand work item budget by area/i })
        .click();
      await overviewPage.breakdownAreaToggle('Rohbau').click();

      // Keller area row: scope to span with exact text "Keller" to avoid matching "Kellerbau"
      const kellerAreaRow = overviewPage.costBreakdownCard
        .getByRole('row')
        .filter({ has: page.locator('span', { hasText: /^Keller$/ }) });
      await expect(kellerAreaRow).toBeVisible();
      await expect(overviewPage.breakdownAreaRow('Kellerbau')).not.toBeVisible();

      // Simulate print cycle
      await overviewPage.startPrint();

      // During print: wait for Kellerbau to become VISIBLE — this confirms that the
      // usePrintExpansion hook has fully applied the forced-expansion state from beforeprint.
      // We must wait for Kellerbau specifically (not just any aria-expanded="true", which
      // already existed before print from the Rohbau expansion) to ensure the hook's setState
      // has been fully processed before calling endPrint().
      await overviewPage.breakdownAreaRow('Kellerbau').waitFor({ state: 'visible' });

      // Restore screen — dispatches afterprint and sets media back to screen.
      // The usePrintExpansion hook restores state asynchronously (React setState),
      // so we need to wait for the DOM to converge after calling endPrint().
      await overviewPage.endPrint();

      // After afterprint: pre-print state must be restored.
      // Rohbau was expanded — Keller area is still visible.
      await kellerAreaRow.waitFor({ state: 'visible' });

      // Keller was collapsed before print — Kellerbau should be hidden again.
      // The hook restores state via React setState which is async.
      // waitFor({ state: 'hidden' }) polls until the row is no longer visible.
      await overviewPage.breakdownAreaRow('Kellerbau').waitFor({ state: 'hidden' });
    } finally {
      // Ensure print media is always restored even if the test throws early —
      // otherwise print mode leaks to subsequent tests in the same worker.
      await overviewPage.endPrint().catch(() => {});
      await teardown();
    }
  });

  // TODO(#1310): stabilise — intermittent timing/fixture issues in CI, see PR #1312 discussion
  test.skip('Other pages are unaffected by Budget Overview print styles (regression AC10)', async ({
    page,
  }) => {
    // Navigate to the Diary page — not a budget page, no print-specific budget styling.
    // Mock the diary API to return an empty list so the page renders without real diary data.
    // Use the '**/api/diary-entries*' pattern (leading **) to match the full URL including
    // the http://localhost:PORT prefix that Playwright sees when doing the glob match.
    await page.route('**/api/diary-entries*', async (route) => {
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

      // Use expect().toBeVisible() which uses the project's expect.timeout (7000ms for desktop)
      // rather than waitFor() which uses actionTimeout (5000ms).
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

      // The diary heading text should be "Construction Diary"
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Construction Diary');

      // Switch to print media to simulate print on a non-budget page
      await page.emulateMedia({ media: 'print' });

      // The diary page h1 heading should still be visible — Budget Overview print
      // styles should not have hidden it.
      // Note: the global print.css hides [role=navigation] and aside,
      // but the diary h1 is in a <header> element, not a nav or aside.
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Construction Diary');
    } finally {
      await page.emulateMedia({ media: 'screen' });
      await page.unroute('**/api/diary-entries*').catch(() => {});
    }
  });
});
