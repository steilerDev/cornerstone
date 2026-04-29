/**
 * Smoke tests for Budget Overview page post-cleanup (Issues #1389 and #1390)
 *
 * Issue #1389: The "Budget Health" hero card (<section aria-label="Budget overview">) was
 * removed from the Budget Overview page. This spec asserts the hero card and its CSS-module
 * class are absent and that the page still renders its core chrome correctly.
 *
 * Issue #1390: Print CSS in CostBreakdownTable is fixed so source-badge labels are visible
 * during print. DOM-level verification of this fix is covered by unit tests; we include a
 * focused DOM assertion here confirming the source-badge markup is present on screen.
 *
 * All tests use API route mocking — no testcontainers data dependency.
 * Desktop viewport only (no @responsive tag — smoke, not full viewport matrix).
 */

import { test, expect } from '../../fixtures/auth.js';
import { BudgetOverviewPage } from '../../pages/BudgetOverviewPage.js';
import { API } from '../../fixtures/testData.js';

// ─────────────────────────────────────────────────────────────────────────────
// Shared response factories
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal overview response with non-zero values so hasData=true and the breakdown renders. */
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

/** Minimal breakdown response so the CostBreakdownTable has data to render. */
function populatedBreakdownResponse() {
  const emptyTotals = {
    projectedMin: 250000,
    projectedMax: 275000,
    actualCost: 185000,
    subsidyPayback: 0,
    rawProjectedMin: 250000,
    rawProjectedMax: 275000,
    minSubsidyPayback: 0,
  };
  return {
    workItems: {
      areas: [
        {
          areaId: 'area-rohbau',
          name: 'Rohbau',
          parentId: null,
          color: '#3B82F6',
          projectedMin: 250000,
          projectedMax: 275000,
          actualCost: 185000,
          subsidyPayback: 0,
          rawProjectedMin: 250000,
          rawProjectedMax: 275000,
          minSubsidyPayback: 0,
          items: [],
          children: [],
        },
      ],
      totals: emptyTotals,
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

/** Minimal breakdown with a budget source so the source-badge label (#1390) is rendered. */
function breakdownWithSourceBadge() {
  const bd = populatedBreakdownResponse();
  const area = bd.workItems.areas[0];
  return {
    ...bd,
    workItems: {
      ...bd.workItems,
      areas: [
        {
          ...area,
          items: [
            {
              workItemId: 'wi-rohbau-1',
              title: 'Rohbau Item',
              projectedMin: 250000,
              projectedMax: 275000,
              actualCost: 185000,
              subsidyPayback: 0,
              rawProjectedMin: 250000,
              rawProjectedMax: 275000,
              minSubsidyPayback: 0,
              costDisplay: 'mixed' as const,
              budgetLines: [
                {
                  id: 'bl-1',
                  description: 'Foundation work',
                  plannedAmount: 250000,
                  confidence: 'medium' as const,
                  actualCost: 0,
                  hasInvoice: false,
                  isQuotation: false,
                  budgetSourceId: 'src-bank',
                },
              ],
            },
          ],
        },
      ],
    },
  };
}

/**
 * Mount route mocks for both GET /api/budget/overview, GET /api/budget/breakdown,
 * and GET /api/budget-sources.
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
  await page.route('**/api/budget/breakdown**', async (route) => {
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
  await page.route(`${API.budgetSources}`, async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          budgetSources: [{ id: 'src-bank', name: 'Bank Loan', amount: 300000 }],
        }),
      });
    } else {
      await route.continue();
    }
  });
  return async () => {
    await page.unroute(`${API.budgetOverview}`);
    await page.unroute('**/api/budget/breakdown**');
    await page.unroute(`${API.budgetSources}`);
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Budget Overview — hero card removed (#1389)', { tag: '@smoke' }, () => {
  test('Page loads and "Budget" heading is visible', async ({ page }) => {
    const overviewPage = new BudgetOverviewPage(page);
    const teardown = await mountRoutes(page, populatedOverviewResponse(), populatedBreakdownResponse());

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      await expect(overviewPage.heading).toBeVisible();
      await expect(overviewPage.heading).toHaveText('Budget');
    } finally {
      await teardown();
    }
  });

  test('No element with aria-label "Budget overview" (hero card is gone)', async ({ page }) => {
    const overviewPage = new BudgetOverviewPage(page);
    const teardown = await mountRoutes(page, populatedOverviewResponse(), populatedBreakdownResponse());

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      // The hero card was removed in #1389 — no section with aria-label="Budget overview" should exist
      await expect(page.locator('[aria-label="Budget overview"]')).not.toBeAttached();
    } finally {
      await teardown();
    }
  });

  test('No element with CSS class containing "heroCard" (hero card CSS removed)', async ({
    page,
  }) => {
    const overviewPage = new BudgetOverviewPage(page);
    const teardown = await mountRoutes(page, populatedOverviewResponse(), populatedBreakdownResponse());

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      // CSS Modules obfuscate class names but keep the original substring — assert absent
      await expect(page.locator('[class*="heroCard"]')).not.toBeAttached();
    } finally {
      await teardown();
    }
  });

  test('Add button is visible and opens dropdown with Add Invoice option', async ({ page }) => {
    const overviewPage = new BudgetOverviewPage(page);
    const teardown = await mountRoutes(page, populatedOverviewResponse(), populatedBreakdownResponse());

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      // Add button is visible
      await expect(overviewPage.addButton).toBeVisible();

      // Clicking opens the dropdown — "Add Invoice" menu item becomes visible
      await overviewPage.addButton.click();
      await expect(page.getByTestId('budget-overview-add-invoice')).toBeVisible();
    } finally {
      await teardown();
    }
  });

  test('Cost Breakdown Table section is rendered', async ({ page }) => {
    const overviewPage = new BudgetOverviewPage(page);
    const teardown = await mountRoutes(page, populatedOverviewResponse(), populatedBreakdownResponse());

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      // CostBreakdownTable is rendered: section[aria-labelledby="breakdown-heading"]
      await expect(overviewPage.costBreakdownCard).toBeVisible();
    } finally {
      await teardown();
    }
  });
});

test.describe('Budget Overview — source badge in breakdown (#1390)', { tag: '@smoke' }, () => {
  test('Source-badge label is present in DOM for budget line with source assignment', async ({
    page,
  }) => {
    const overviewPage = new BudgetOverviewPage(page);
    const teardown = await mountRoutes(
      page,
      populatedOverviewResponse(),
      breakdownWithSourceBadge(),
    );

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      // Expand the Work Items section to reveal the area rows
      await overviewPage.costBreakdownCard
        .getByRole('button', { name: /expand work item budget by area/i })
        .click();

      // Expand the Rohbau area to reveal the work item row
      await overviewPage.breakdownAreaToggle('Rohbau').click();
      await expect(overviewPage.breakdownAreaRow('Rohbau Item')).toBeVisible();

      // Expand the Rohbau Item to reveal the budget line row (Level 3)
      await overviewPage.costBreakdownCard
        .getByRole('button', { name: /Expand Rohbau Item/i })
        .click();

      // The source-badge span should now be in the DOM with the correct aria-label.
      // This confirms the source-badge markup is present on screen; the CSS print fix in
      // #1390 ensures the label is also visible in print media (tested via unit tests).
      await expect(
        page.locator('[aria-label="Budget source: Bank Loan"]'),
      ).toBeAttached();
    } finally {
      await teardown();
    }
  });
});
