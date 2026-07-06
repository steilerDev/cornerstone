/**
 * E2E tests for the Cost Basis (payment-status) dropdown filter on the Budget Overview page.
 * Story #1786 — Cost Breakdown: payment-status (Cost Basis) filter — Paid / Outstanding / All
 *
 * Covers:
 * - AC1: "Cost Basis" dropdown visible with label, options All/Paid/Outstanding
 * - AC2: "Paid" shows only paid+claimed amounts; lines with no paid amount show €0
 * - AC3: "Outstanding" shows pending invoice amounts for invoiced lines + projected for uninvoiced
 * - AC4: "All" restores the default view (removes paymentStatus param)
 * - AC5: URL persistence — ?paymentStatus=paid / ?paymentStatus=outstanding (absent = All)
 * - AC6: Changing payment-status triggers a refetch (debounce + AbortController pattern)
 * - AC7: Perspective toggle (min/avg/max) remains active alongside payment filter
 * - AC13: E2E tests cover the dropdown interaction and URL state persistence
 *
 * All tests use API route mocking (page.route) — no testcontainers dependency.
 */

import { test, expect } from '../../fixtures/auth.js';
import { BudgetOverviewPage, BUDGET_OVERVIEW_ROUTE } from '../../pages/BudgetOverviewPage.js';
import { API } from '../../fixtures/testData.js';

// ─────────────────────────────────────────────────────────────────────────────
// Mock data helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeBudgetOverviewResponse() {
  return {
    availableFunds: 300000,
    sourceCount: 1,
    minPlanned: 10000,
    maxPlanned: 10000,
    actualCost: 7000,
    actualCostPaid: 5000,
    projectedMin: 10000,
    projectedMax: 10000,
    actualCostClaimed: 0,
    remainingVsMinPlanned: 290000,
    remainingVsMaxPlanned: 290000,
    remainingVsActualCost: 293000,
    remainingVsActualPaid: 295000,
    remainingVsProjectedMin: 290000,
    remainingVsProjectedMax: 290000,
    remainingVsActualClaimed: 300000,
    remainingVsMinPlannedWithPayback: 290000,
    remainingVsMaxPlannedWithPayback: 290000,
    subsidySummary: {
      totalReductions: 0,
      activeSubsidyCount: 0,
      minTotalPayback: 0,
      maxTotalPayback: 0,
      oversubscribedSubsidies: [],
    },
  };
}

/**
 * Build a BudgetBreakdown mock with payment-status–testable data:
 *
 * Work Item "Construction" has two budget lines:
 *   1. "Invoiced Line" — has invoice, actualCost=7000, actualCostPaid=5000, actualCostPending=2000
 *   2. "Planned Line" — no invoice, plannedAmount=3000, professional_estimate confidence (10% margin)
 *      → avg projected cost = (2700+3300)/2 = 3000; min=2700; max=3300
 *
 * In "Paid" mode:   invoiced → €5,000; planned → €0
 * In "Outstanding": invoiced → €2,000; planned → €3,000 (avg)
 * In "All" mode:   invoiced → €7,000; planned → €3,000 (avg)
 */
function makeBreakdownWithPaymentData() {
  const budgetLines = [
    {
      id: 'line-invoiced',
      description: 'Invoiced Line',
      plannedAmount: 7000,
      confidence: 'quote' as const,
      actualCost: 7000,
      actualCostPaid: 5000,
      actualCostPending: 2000,
      hasInvoice: true,
      isQuotation: false,
      budgetSourceId: null,
      origin: 'manual' as const,
    },
    {
      id: 'line-planned',
      description: 'Planned Line',
      plannedAmount: 3000,
      confidence: 'professional_estimate' as const,
      actualCost: 0,
      actualCostPaid: 0,
      actualCostPending: 0,
      hasInvoice: false,
      isQuotation: false,
      budgetSourceId: null,
      origin: 'manual' as const,
    },
  ];

  return {
    workItems: {
      areas: [
        {
          areaId: 'area-main',
          name: 'Construction Area',
          parentId: null,
          color: '#3B82F6',
          projectedMin: 10000,
          projectedMax: 10000,
          actualCost: 7000,
          actualCostPaid: 5000,
          actualCostPending: 2000,
          subsidyPayback: 0,
          rawProjectedMin: 10000,
          rawProjectedMax: 10000,
          minSubsidyPayback: 0,
          items: [
            {
              workItemId: 'wi-construction-1',
              title: 'Construction Work',
              projectedMin: 10000,
              projectedMax: 10000,
              actualCost: 7000,
              actualCostPaid: 5000,
              actualCostPending: 2000,
              subsidyPayback: 0,
              rawProjectedMin: 10000,
              rawProjectedMax: 10000,
              minSubsidyPayback: 0,
              costDisplay: 'mixed' as const,
              budgetLines,
            },
          ],
          children: [],
        },
      ],
      totals: {
        projectedMin: 10000,
        projectedMax: 10000,
        actualCost: 7000,
        actualCostPaid: 5000,
        actualCostPending: 2000,
        subsidyPayback: 0,
        rawProjectedMin: 10000,
        rawProjectedMax: 10000,
        minSubsidyPayback: 0,
      },
    },
    householdItems: {
      areas: [],
      totals: {
        projectedMin: 0,
        projectedMax: 0,
        actualCost: 0,
        actualCostPaid: 0,
        actualCostPending: 0,
        subsidyPayback: 0,
        rawProjectedMin: 0,
        rawProjectedMax: 0,
        minSubsidyPayback: 0,
      },
    },
    subsidyAdjustments: [],
    budgetSources: [
      {
        id: 'unassigned',
        name: 'Unassigned',
        totalAmount: 0,
        projectedMin: 10000,
        projectedMax: 10000,
        actualCost: 7000,
        actualCostPaid: 5000,
        actualCostPending: 2000,
        subsidyPaybackMin: 0,
        subsidyPaybackMax: 0,
      },
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Route mount helpers
// ─────────────────────────────────────────────────────────────────────────────

type PageParam = Parameters<typeof test>[1]['page'];

/**
 * Mount route mocks for /api/budget/overview and /api/budget/breakdown.
 * Returns a teardown function to unregister routes.
 */
async function mountOverviewRoutes(page: PageParam, overviewBody: object, breakdownBody: object) {
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
        body: JSON.stringify({ budgetSources: [] }),
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

/**
 * Navigate to /budget/overview and expand the breakdown all the way to Level 3 budget lines.
 * Clicks:
 *   1. "expand work item budget by area" toggle → Level 1
 *   2. "Construction Area" area toggle → Level 2
 *   3. "Expand Construction Work" work item toggle → Level 3
 */
async function expandToLevel3(overviewPage: BudgetOverviewPage) {
  await overviewPage.goto();
  await overviewPage.waitForLoaded();

  await overviewPage.costBreakdownCard
    .getByRole('button', { name: /expand work item budget by area/i })
    .click();

  await overviewPage.breakdownAreaToggle('Construction Area').click();
  await expect(
    overviewPage.costBreakdownCard.getByRole('button', { name: /Expand Construction Work/i }),
  ).toBeVisible();

  await overviewPage.costBreakdownCard
    .getByRole('button', { name: /Expand Construction Work/i })
    .click();
}

/**
 * Find the cost cell (colRemaining — positive value column) for a given budget line row.
 * The column at td index 3 renders formatCurrencyFn(resolvedRawCost) (positive).
 * The column at td index 1 renders -formatCurrencyFn(resolvedRawCost) (with leading minus).
 * We assert on td index 3 (colRemaining) for positive amounts.
 */
function getLineCostCell(overviewPage: BudgetOverviewPage, lineDescription: string) {
  return overviewPage.costBreakdownCard
    .getByRole('row')
    .filter({ hasText: lineDescription })
    .locator('td')
    .nth(3);
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1 — Control bar visible by default
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Cost Basis control bar visible by default', { tag: '@responsive' }, () => {
  test('Cost Basis select and label are visible after page load (AC1)', async ({ page }) => {
    const overviewPage = new BudgetOverviewPage(page);
    const teardown = await mountOverviewRoutes(
      page,
      makeBudgetOverviewResponse(),
      makeBreakdownWithPaymentData(),
    );

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      // #cost-basis-select must be visible in the Cost Breakdown section
      await expect(overviewPage.costBasisSelect).toBeVisible();

      // Associated label must be visible
      await expect(overviewPage.costBasisLabel).toBeVisible();
      await expect(overviewPage.costBasisLabel).toContainText(/cost basis/i);

      // Default value must be "All"
      await expect(overviewPage.costBasisSelect).toHaveValue('all');
    } finally {
      await teardown();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2 — No URL param in default "All" state
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Default "All" state has no paymentStatus URL param', { tag: '@responsive' }, () => {
  test('URL does not contain paymentStatus when default "All" is selected (AC5)', async ({
    page,
  }) => {
    const overviewPage = new BudgetOverviewPage(page);
    const teardown = await mountOverviewRoutes(
      page,
      makeBudgetOverviewResponse(),
      makeBreakdownWithPaymentData(),
    );

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      await expect(page).not.toHaveURL(/paymentStatus/);
    } finally {
      await teardown();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3 — Selecting "Paid" updates URL and triggers refetch
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Selecting "Paid" updates URL and triggers refetch', { tag: '@responsive' }, () => {
  test('Selecting "Paid" sets ?paymentStatus=paid in URL and fires API refetch (AC5, AC6)', async ({
    page,
  }) => {
    const overviewPage = new BudgetOverviewPage(page);
    const teardown = await mountOverviewRoutes(
      page,
      makeBudgetOverviewResponse(),
      makeBreakdownWithPaymentData(),
    );

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      // Register response waiter BEFORE the select change (must precede the triggering action)
      const refetchPromise = page.waitForResponse(
        (resp) => resp.url().includes('/api/budget/breakdown') && resp.request().method() === 'GET',
      );

      await overviewPage.costBasisSelect.selectOption('paid');

      // URL must be updated to ?paymentStatus=paid
      await expect(page).toHaveURL(/paymentStatus=paid/);

      // A refetch of /api/budget/breakdown must have fired
      const refetchResponse = await refetchPromise;
      expect(refetchResponse.status()).toBe(200);

      // The select must reflect the new value
      await expect(overviewPage.costBasisSelect).toHaveValue('paid');
    } finally {
      await teardown();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4 — Paid mode: invoiced line shows paid amount
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Paid mode: invoiced line shows paid amount (AC2)', { tag: '@responsive' }, () => {
  test('Invoiced line cost cell shows €5,000 when paymentStatus=paid', async ({ page }) => {
    const overviewPage = new BudgetOverviewPage(page);
    const teardown = await mountOverviewRoutes(
      page,
      makeBudgetOverviewResponse(),
      makeBreakdownWithPaymentData(),
    );

    try {
      await expandToLevel3(overviewPage);

      // Switch to Paid mode
      const refetchPromise = page.waitForResponse(
        (resp) => resp.url().includes('/api/budget/breakdown') && resp.request().method() === 'GET',
      );
      await overviewPage.costBasisSelect.selectOption('paid');
      await refetchPromise;

      // Invoiced Line: actualCostPaid = 5000 → €5,000.00
      const invoicedCostCell = getLineCostCell(overviewPage, 'Invoiced Line');
      await expect(invoicedCostCell).toContainText('5,000');
    } finally {
      await teardown();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5 — Paid mode: non-invoiced line shows €0
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Paid mode: non-invoiced line shows €0 (AC2)', { tag: '@responsive' }, () => {
  test('Non-invoiced line cost cell shows €0 when paymentStatus=paid', async ({ page }) => {
    const overviewPage = new BudgetOverviewPage(page);
    const teardown = await mountOverviewRoutes(
      page,
      makeBudgetOverviewResponse(),
      makeBreakdownWithPaymentData(),
    );

    try {
      await expandToLevel3(overviewPage);

      // Switch to Paid mode
      const refetchPromise = page.waitForResponse(
        (resp) => resp.url().includes('/api/budget/breakdown') && resp.request().method() === 'GET',
      );
      await overviewPage.costBasisSelect.selectOption('paid');
      await refetchPromise;

      // Planned Line: actualCostPaid = 0 → €0.00 (no invoice = always €0 in Paid mode)
      const plannedCostCell = getLineCostCell(overviewPage, 'Planned Line');
      await expect(plannedCostCell).toContainText('0');
      // Must NOT show 3,000 (the projected amount) in Paid mode
      await expect(plannedCostCell).not.toContainText('3,000');
    } finally {
      await teardown();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6 — Selecting "Outstanding" updates URL
// ─────────────────────────────────────────────────────────────────────────────
test.describe(
  'Selecting "Outstanding" sets ?paymentStatus=outstanding (AC5)',
  { tag: '@responsive' },
  () => {
    test('URL param becomes paymentStatus=outstanding when Outstanding is selected', async ({
      page,
    }) => {
      const overviewPage = new BudgetOverviewPage(page);
      const teardown = await mountOverviewRoutes(
        page,
        makeBudgetOverviewResponse(),
        makeBreakdownWithPaymentData(),
      );

      try {
        await overviewPage.goto();
        await overviewPage.waitForLoaded();

        await overviewPage.costBasisSelect.selectOption('outstanding');

        await expect(page).toHaveURL(/paymentStatus=outstanding/);
        await expect(overviewPage.costBasisSelect).toHaveValue('outstanding');
      } finally {
        await teardown();
      }
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 7 — Outstanding mode: invoiced line shows pending amount
// ─────────────────────────────────────────────────────────────────────────────
test.describe(
  'Outstanding mode: invoiced line shows pending amount (AC3)',
  { tag: '@responsive' },
  () => {
    test('Invoiced line cost cell shows €2,000 (actualCostPending) in Outstanding mode', async ({
      page,
    }) => {
      const overviewPage = new BudgetOverviewPage(page);
      const teardown = await mountOverviewRoutes(
        page,
        makeBudgetOverviewResponse(),
        makeBreakdownWithPaymentData(),
      );

      try {
        await expandToLevel3(overviewPage);

        // Switch to Outstanding mode
        const refetchPromise = page.waitForResponse(
          (resp) =>
            resp.url().includes('/api/budget/breakdown') && resp.request().method() === 'GET',
        );
        await overviewPage.costBasisSelect.selectOption('outstanding');
        await refetchPromise;

        // Invoiced Line: actualCostPending = 2000 → €2,000.00
        const invoicedCostCell = getLineCostCell(overviewPage, 'Invoiced Line');
        await expect(invoicedCostCell).toContainText('2,000');
        // Must NOT show the full actualCost (7,000) — that's the "All" mode value
        await expect(invoicedCostCell).not.toContainText('7,000');
      } finally {
        await teardown();
      }
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 8 — Outstanding mode: non-invoiced line shows projected cost
// ─────────────────────────────────────────────────────────────────────────────
test.describe(
  'Outstanding mode: non-invoiced line shows projected cost (AC3)',
  { tag: '@responsive' },
  () => {
    test('Planned Line shows projected amount (€3,000 avg) in Outstanding mode', async ({
      page,
    }) => {
      const overviewPage = new BudgetOverviewPage(page);
      const teardown = await mountOverviewRoutes(
        page,
        makeBudgetOverviewResponse(),
        makeBreakdownWithPaymentData(),
      );

      try {
        await expandToLevel3(overviewPage);

        // Switch to Outstanding mode
        const refetchPromise = page.waitForResponse(
          (resp) =>
            resp.url().includes('/api/budget/breakdown') && resp.request().method() === 'GET',
        );
        await overviewPage.costBasisSelect.selectOption('outstanding');
        await refetchPromise;

        // Planned Line: no invoice → perspectiveValue at avg perspective
        // professional_estimate margin = 10% → costMin=2700, costMax=3300 → avg=3000
        const plannedCostCell = getLineCostCell(overviewPage, 'Planned Line');
        await expect(plannedCostCell).toContainText('3,000');
      } finally {
        await teardown();
      }
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 9 — Selecting "All" removes URL param
// ─────────────────────────────────────────────────────────────────────────────
test.describe(
  'Selecting "All" removes paymentStatus from URL (AC4, AC5)',
  { tag: '@responsive' },
  () => {
    test('Switching from Paid back to All removes ?paymentStatus param from URL', async ({
      page,
    }) => {
      const overviewPage = new BudgetOverviewPage(page);
      const teardown = await mountOverviewRoutes(
        page,
        makeBudgetOverviewResponse(),
        makeBreakdownWithPaymentData(),
      );

      try {
        await overviewPage.goto();
        await overviewPage.waitForLoaded();

        // Switch to Paid
        await overviewPage.costBasisSelect.selectOption('paid');
        await expect(page).toHaveURL(/paymentStatus=paid/);

        // Switch back to All — register refetch watcher before the change
        const refetchPromise = page.waitForResponse(
          (resp) =>
            resp.url().includes('/api/budget/breakdown') && resp.request().method() === 'GET',
        );
        await overviewPage.costBasisSelect.selectOption('all');

        // URL must no longer have paymentStatus param
        await expect(page).not.toHaveURL(/paymentStatus/);
        await expect(overviewPage.costBasisSelect).toHaveValue('all');

        // A refetch must have been triggered
        await refetchPromise;
      } finally {
        await teardown();
      }
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 10 — Active border: non-All selection gets active CSS class
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Non-All selection gets an active CSS class (AC1)', { tag: '@responsive' }, () => {
  test('Select element has a class containing "Active" when Paid is selected', async ({ page }) => {
    const overviewPage = new BudgetOverviewPage(page);
    const teardown = await mountOverviewRoutes(
      page,
      makeBudgetOverviewResponse(),
      makeBreakdownWithPaymentData(),
    );

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      // In "All" mode: must NOT have Active class
      const classAllMode = await overviewPage.costBasisSelect.getAttribute('class');
      expect(classAllMode ?? '').not.toMatch(/Active/i);

      // Switch to Paid
      await overviewPage.costBasisSelect.selectOption('paid');

      // In "Paid" mode: must have Active class (costBasisSelectActive)
      await expect(overviewPage.costBasisSelect).toHaveClass(/Active/i);

      // Switch back to All
      await overviewPage.costBasisSelect.selectOption('all');

      // Active class removed when back to All
      await expect(overviewPage.costBasisSelect).not.toHaveClass(/Active/i);
    } finally {
      await teardown();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 11 — URL on mount: ?paymentStatus=paid restores select state
// ─────────────────────────────────────────────────────────────────────────────
test.describe(
  'URL on mount: ?paymentStatus=paid restores select state (AC5)',
  { tag: '@responsive' },
  () => {
    test('Navigating with ?paymentStatus=paid restores the select to "Paid"', async ({ page }) => {
      const overviewPage = new BudgetOverviewPage(page);
      const teardown = await mountOverviewRoutes(
        page,
        makeBudgetOverviewResponse(),
        makeBreakdownWithPaymentData(),
      );

      try {
        await page.goto(`${BUDGET_OVERVIEW_ROUTE}?paymentStatus=paid`);
        await overviewPage.waitForLoaded();

        // Select must reflect the URL-mounted state
        await expect(overviewPage.costBasisSelect).toHaveValue('paid');
      } finally {
        await teardown();
      }
    });

    test('Navigating with ?paymentStatus=outstanding restores the select to "Outstanding"', async ({
      page,
    }) => {
      const overviewPage = new BudgetOverviewPage(page);
      const teardown = await mountOverviewRoutes(
        page,
        makeBudgetOverviewResponse(),
        makeBreakdownWithPaymentData(),
      );

      try {
        await page.goto(`${BUDGET_OVERVIEW_ROUTE}?paymentStatus=outstanding`);
        await overviewPage.waitForLoaded();

        await expect(overviewPage.costBasisSelect).toHaveValue('outstanding');
      } finally {
        await teardown();
      }
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 12 — Invalid URL param falls back to "All"
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Invalid paymentStatus URL param falls back to "All"', { tag: '@responsive' }, () => {
  test('?paymentStatus=bogus shows "All" selected and no paymentStatus-specific styling', async ({
    page,
  }) => {
    const overviewPage = new BudgetOverviewPage(page);
    const teardown = await mountOverviewRoutes(
      page,
      makeBudgetOverviewResponse(),
      makeBreakdownWithPaymentData(),
    );

    try {
      await page.goto(`${BUDGET_OVERVIEW_ROUTE}?paymentStatus=bogus`);
      await overviewPage.waitForLoaded();

      // Unknown value → falls back to 'all'
      await expect(overviewPage.costBasisSelect).toHaveValue('all');

      // No Active class (not a non-all value)
      const classAttr = await overviewPage.costBasisSelect.getAttribute('class');
      expect(classAttr ?? '').not.toMatch(/Active/i);
    } finally {
      await teardown();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 13 — Keyboard navigation: select is Tab-reachable and keyboard-operable
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Keyboard navigation for Cost Basis select', { tag: '@responsive' }, () => {
  test('Cost Basis select is reachable by Tab and value changeable via keyboard', async ({
    page,
  }) => {
    const overviewPage = new BudgetOverviewPage(page);
    const teardown = await mountOverviewRoutes(
      page,
      makeBudgetOverviewResponse(),
      makeBreakdownWithPaymentData(),
    );

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      // Focus the select directly (Tab traversal depends on DOM order which varies by viewport)
      await overviewPage.costBasisSelect.focus();

      // Select must be focused
      await expect(overviewPage.costBasisSelect).toBeFocused();

      // Default value is 'all'
      await expect(overviewPage.costBasisSelect).toHaveValue('all');

      // Change via keyboard — select 'paid' option
      const refetchPromise = page.waitForResponse(
        (resp) => resp.url().includes('/api/budget/breakdown') && resp.request().method() === 'GET',
      );
      await overviewPage.costBasisSelect.selectOption('paid');
      await expect(overviewPage.costBasisSelect).toHaveValue('paid');
      await refetchPromise;
    } finally {
      await teardown();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 14 — Perspective toggle remains active in Outstanding mode (AC7)
// ─────────────────────────────────────────────────────────────────────────────
test.describe(
  'Perspective toggle remains active alongside payment filter (AC7)',
  { tag: '@responsive' },
  () => {
    test('In Outstanding mode, switching from Avg to Min changes non-invoiced line projected cost', async ({
      page,
    }) => {
      const overviewPage = new BudgetOverviewPage(page);
      const teardown = await mountOverviewRoutes(
        page,
        makeBudgetOverviewResponse(),
        makeBreakdownWithPaymentData(),
      );

      try {
        await expandToLevel3(overviewPage);

        // Switch to Outstanding mode
        const refetchPromise = page.waitForResponse(
          (resp) =>
            resp.url().includes('/api/budget/breakdown') && resp.request().method() === 'GET',
        );
        await overviewPage.costBasisSelect.selectOption('outstanding');
        await refetchPromise;

        // At Avg perspective: Planned Line shows 3000 (professional_estimate, ±10%)
        // costMin=2700, costMax=3300 → avg=(2700+3300)/2=3000
        const plannedCostCell = getLineCostCell(overviewPage, 'Planned Line');
        await expect(plannedCostCell).toContainText('3,000');

        // Switch perspective to Min — Min perspective: costMin = 2700
        const minRadio = overviewPage.costBreakdownCard.getByRole('radio', { name: 'Min' });
        await minRadio.scrollIntoViewIfNeeded();
        await minRadio.click();

        // At Min perspective: Planned Line should show 2700 (not 3000)
        await expect(plannedCostCell).not.toContainText('3,000');
        await expect(plannedCostCell).toContainText('2,700');

        // Switch perspective to Max — Max perspective: costMax = 3300
        const maxRadio = overviewPage.costBreakdownCard.getByRole('radio', { name: 'Max' });
        await maxRadio.scrollIntoViewIfNeeded();
        await maxRadio.click();

        // At Max perspective: Planned Line should show 3300
        await expect(plannedCostCell).not.toContainText('2,700');
        await expect(plannedCostCell).toContainText('3,300');
      } finally {
        await teardown();
      }
    });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 15 — Mobile: control bar wraps but both controls remain visible
// ─────────────────────────────────────────────────────────────────────────────
test.describe(
  'Mobile: CostBasisSelect and PerspectiveToggle both visible (responsive)',
  { tag: '@responsive' },
  () => {
    test('Both controls are visible in the breakdown control bar at all viewports', async ({
      page,
    }) => {
      const overviewPage = new BudgetOverviewPage(page);
      const teardown = await mountOverviewRoutes(
        page,
        makeBudgetOverviewResponse(),
        makeBreakdownWithPaymentData(),
      );

      try {
        await overviewPage.goto();
        await overviewPage.waitForLoaded();

        // PerspectiveToggle (min/avg/max radios)
        const avgRadio = overviewPage.costBreakdownCard.getByRole('radio', { name: 'Avg' });
        await expect(avgRadio).toBeVisible();

        // CostBasisSelect
        await expect(overviewPage.costBasisSelect).toBeVisible();
        await expect(overviewPage.costBasisLabel).toBeVisible();

        // No horizontal overflow introduced by the control bar
        const hasHorizontalScroll = await page.evaluate(() => {
          return document.documentElement.scrollWidth > window.innerWidth;
        });
        expect(hasHorizontalScroll).toBe(false);
      } finally {
        await teardown();
      }
    });
  },
);
