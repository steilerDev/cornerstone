/**
 * E2E tests for Budget Source Filter (Story #1360 — server-side source filter)
 *
 * Covers:
 * - Source badge visible on Level 3 (budget line) rows (carry-over from #1354)
 * - Unassigned badge for lines with no source
 * - Long source name truncation in badge
 * - Default state: all sources selected, no URL param
 * - Deselecting a source triggers API refetch with correct query param
 * - Re-selecting a source triggers API refetch without query param
 * - Cascade hiding via server response: work item disappears when server prunes it
 * - Deselect all → empty state from server response
 * - Available Funds caption "(X of Y selected)"
 * - URL on mount: ?deselectedSources= drives initial filtered fetch
 * - Stale/unknown ID in ?deselectedSources= is silently ignored
 * - Old ?sources= param is silently ignored
 * - Per-source Cost/Payback/Net columns present
 * - Perspective toggle changes Cost value in source row
 * - Subsidy oversubscription: payback does not exceed cost when source filtered
 * - Stale-while-revalidate: previous breakdown stays visible during refetch
 * - Rapid debounce: multiple quick toggles coalesce into a single API request
 * - Keyboard: Space/Enter/Escape on source rows
 * - Live region announces source count change
 * - No chip toolbar present at any time
 * - Mobile: source row touch target >= 44px
 * - Dark mode: badge color smoke check
 * - Responsive layout: no horizontal scroll
 * - Source badge visible at all viewports
 */

import { test, expect } from '../../fixtures/auth.js';
import { BudgetOverviewPage, BUDGET_OVERVIEW_ROUTE } from '../../pages/BudgetOverviewPage.js';
import { API } from '../../fixtures/testData.js';

// ─────────────────────────────────────────────────────────────────────────────
// Mock data helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Known source UUIDs used consistently across mock data. */
const SOURCE_A_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const SOURCE_B_ID = 'bbbbbbbb-0000-0000-0000-000000000002';
const LONG_SOURCE_NAME = 'Very Long Source Name Exceeds Limit';

function makeBudgetOverviewResponse() {
  return {
    availableFunds: 300000,
    sourceCount: 2,
    minPlanned: 100000,
    maxPlanned: 120000,
    actualCost: 0,
    actualCostPaid: 0,
    projectedMin: 100000,
    projectedMax: 120000,
    actualCostClaimed: 0,
    remainingVsMinPlanned: 200000,
    remainingVsMaxPlanned: 180000,
    remainingVsActualCost: 300000,
    remainingVsActualPaid: 300000,
    remainingVsProjectedMin: 200000,
    remainingVsProjectedMax: 180000,
    remainingVsActualClaimed: 300000,
    remainingVsMinPlannedWithPayback: 200000,
    remainingVsMaxPlannedWithPayback: 180000,
    subsidySummary: {
      totalReductions: 0,
      activeSubsidyCount: 0,
      minTotalPayback: 0,
      maxTotalPayback: 0,
      oversubscribedSubsidies: [],
    },
  };
}

function makeEmptyTotals() {
  return {
    projectedMin: 0,
    projectedMax: 0,
    actualCost: 0,
    subsidyPayback: 0,
    rawProjectedMin: 0,
    rawProjectedMax: 0,
    minSubsidyPayback: 0,
  };
}

/**
 * Build a BudgetBreakdown response with:
 * - Source A (Bank Loan): 2 budget lines (line-a1, line-a2)
 * - No-source: 1 budget line (line-unassigned)
 * - Optional Source B (Equity): 1 line (line-b1)
 * - Optional long-name source: 1 line (line-long)
 *
 * NOTE: `budgetSources` entries now require `subsidyPaybackMin` and `subsidyPaybackMax`
 * (Story #1360 — new BudgetSourceSummaryBreakdown shape). The legacy `subsidyPayback`
 * field is no longer used.
 */
function makeBreakdownResponse(
  opts: {
    includeSourceB?: boolean;
    includeLongName?: boolean;
  } = {},
) {
  const { includeSourceB = false, includeLongName = false } = opts;

  const budgetLines = [
    {
      id: 'line-a1',
      description: 'Line A1 (Source A)',
      plannedAmount: 10000,
      confidence: 'own_estimate',
      actualCost: 0,
      hasInvoice: false,
      isQuotation: false,
      budgetSourceId: SOURCE_A_ID,
    },
    {
      id: 'line-a2',
      description: 'Line A2 (Source A)',
      plannedAmount: 20000,
      confidence: 'own_estimate',
      actualCost: 0,
      hasInvoice: false,
      isQuotation: false,
      budgetSourceId: SOURCE_A_ID,
    },
    {
      id: 'line-unassigned',
      description: 'Line Unassigned (No source)',
      plannedAmount: 5000,
      confidence: 'own_estimate',
      actualCost: 0,
      hasInvoice: false,
      isQuotation: false,
      budgetSourceId: null,
    },
  ];

  if (includeSourceB) {
    budgetLines.push({
      id: 'line-b1',
      description: 'Line B1 (Source B)',
      plannedAmount: 8000,
      confidence: 'own_estimate',
      actualCost: 0,
      hasInvoice: false,
      isQuotation: false,
      budgetSourceId: SOURCE_B_ID,
    });
  }

  if (includeLongName) {
    budgetLines.push({
      id: 'line-long',
      description: 'Line Long Name Source',
      plannedAmount: 3000,
      confidence: 'own_estimate',
      actualCost: 0,
      hasInvoice: false,
      isQuotation: false,
      budgetSourceId: 'cccccccc-0000-0000-0000-000000000003',
    });
  }

  // budgetSources: use subsidyPaybackMin/Max (Story #1360 shape).
  // Unassigned is always included when there are null-source lines.
  const budgetSources = [
    {
      id: SOURCE_A_ID,
      name: 'Bank Loan',
      totalAmount: 150000,
      projectedMin: 30000,
      projectedMax: 35000,
      subsidyPaybackMin: 0,
      subsidyPaybackMax: 0,
    },
    {
      id: 'unassigned',
      name: 'Unassigned',
      totalAmount: 0,
      projectedMin: 5000,
      projectedMax: 5000,
      subsidyPaybackMin: 0,
      subsidyPaybackMax: 0,
    },
  ];

  if (includeSourceB) {
    budgetSources.push({
      id: SOURCE_B_ID,
      name: 'Equity',
      totalAmount: 100000,
      projectedMin: 8000,
      projectedMax: 8000,
      subsidyPaybackMin: 0,
      subsidyPaybackMax: 0,
    });
  }

  if (includeLongName) {
    budgetSources.push({
      id: 'cccccccc-0000-0000-0000-000000000003',
      name: LONG_SOURCE_NAME,
      totalAmount: 50000,
      projectedMin: 3000,
      projectedMax: 3000,
      subsidyPaybackMin: 0,
      subsidyPaybackMax: 0,
    });
  }

  return {
    workItems: {
      areas: [
        {
          areaId: 'area-main',
          name: 'Main Area',
          parentId: null,
          color: '#3B82F6',
          projectedMin: 35000,
          projectedMax: 38500,
          actualCost: 0,
          subsidyPayback: 0,
          rawProjectedMin: 35000,
          rawProjectedMax: 38500,
          minSubsidyPayback: 0,
          items: [
            {
              workItemId: 'wi-main-1',
              title: 'Main Work Item',
              projectedMin: 35000,
              projectedMax: 38500,
              actualCost: 0,
              subsidyPayback: 0,
              rawProjectedMin: 35000,
              rawProjectedMax: 38500,
              minSubsidyPayback: 0,
              costDisplay: 'projected',
              budgetLines,
            },
          ],
          children: [],
        },
      ],
      totals: {
        projectedMin: 35000,
        projectedMax: 38500,
        actualCost: 0,
        subsidyPayback: 0,
        rawProjectedMin: 35000,
        rawProjectedMax: 38500,
        minSubsidyPayback: 0,
      },
    },
    householdItems: {
      areas: [],
      totals: makeEmptyTotals(),
    },
    subsidyAdjustments: [],
    budgetSources,
  };
}

/**
 * Breakdown with only Source A lines (no unassigned) — used for cascade-hide / empty-state tests
 * where deselecting SOURCE_A must hide the work item entirely and trigger server empty response.
 */
function makeBreakdownSourceAOnly() {
  return {
    workItems: {
      areas: [
        {
          areaId: 'area-main',
          name: 'Main Area',
          parentId: null,
          color: '#3B82F6',
          projectedMin: 30000,
          projectedMax: 35000,
          actualCost: 0,
          subsidyPayback: 0,
          rawProjectedMin: 30000,
          rawProjectedMax: 35000,
          minSubsidyPayback: 0,
          items: [
            {
              workItemId: 'wi-main-1',
              title: 'Main Work Item',
              projectedMin: 30000,
              projectedMax: 35000,
              actualCost: 0,
              subsidyPayback: 0,
              rawProjectedMin: 30000,
              rawProjectedMax: 35000,
              minSubsidyPayback: 0,
              costDisplay: 'projected',
              budgetLines: [
                {
                  id: 'line-a1',
                  description: 'Line A1 (Source A)',
                  plannedAmount: 30000,
                  confidence: 'own_estimate',
                  actualCost: 0,
                  hasInvoice: false,
                  isQuotation: false,
                  budgetSourceId: SOURCE_A_ID,
                },
              ],
            },
          ],
          children: [],
        },
      ],
      totals: {
        projectedMin: 30000,
        projectedMax: 35000,
        actualCost: 0,
        subsidyPayback: 0,
        rawProjectedMin: 30000,
        rawProjectedMax: 35000,
        minSubsidyPayback: 0,
      },
    },
    householdItems: {
      areas: [],
      totals: makeEmptyTotals(),
    },
    subsidyAdjustments: [],
    budgetSources: [
      {
        id: SOURCE_A_ID,
        name: 'Bank Loan',
        totalAmount: 150000,
        projectedMin: 30000,
        projectedMax: 35000,
        subsidyPaybackMin: 0,
        subsidyPaybackMax: 0,
      },
    ],
  };
}

/**
 * Filtered response returned by the server when SOURCE_A is deselected but
 * there are still other lines (Unassigned) remaining — so workItems.areas
 * is non-empty. Used in tests that need the CostBreakdownTable to keep
 * rendering its full layout (source rows included) after the filter.
 *
 * Simulates: Bank Loan deselected, Unassigned source still has lines.
 *
 * @param includeSourceB - When true, also includes Source B (Equity) in
 *   budgetSources so that its toggle row remains visible. Used by
 *   multi-deselection tests that need to click the Equity row after
 *   the first filtered response replaces the breakdown.
 */
function makeFilteredBreakdownBankLoanDeselected(opts: { includeSourceB?: boolean } = {}) {
  const { includeSourceB = false } = opts;

  const budgetSources = [
    {
      id: SOURCE_A_ID,
      name: 'Bank Loan',
      totalAmount: 150000,
      projectedMin: 30000,
      projectedMax: 35000,
      subsidyPaybackMin: 0,
      subsidyPaybackMax: 0,
    },
    {
      id: 'unassigned',
      name: 'Unassigned',
      totalAmount: 0,
      projectedMin: 5000,
      projectedMax: 5000,
      subsidyPaybackMin: 0,
      subsidyPaybackMax: 0,
    },
  ];

  if (includeSourceB) {
    budgetSources.push({
      id: SOURCE_B_ID,
      name: 'Equity',
      totalAmount: 100000,
      projectedMin: 8000,
      projectedMax: 8000,
      subsidyPaybackMin: 0,
      subsidyPaybackMax: 0,
    });
  }

  return {
    workItems: {
      areas: [
        {
          areaId: 'area-main',
          name: 'Main Area',
          parentId: null,
          color: '#3B82F6',
          projectedMin: 5000,
          projectedMax: 5000,
          actualCost: 0,
          subsidyPayback: 0,
          rawProjectedMin: 5000,
          rawProjectedMax: 5000,
          minSubsidyPayback: 0,
          items: [
            {
              workItemId: 'wi-main-1',
              title: 'Main Work Item',
              projectedMin: 5000,
              projectedMax: 5000,
              actualCost: 0,
              subsidyPayback: 0,
              rawProjectedMin: 5000,
              rawProjectedMax: 5000,
              minSubsidyPayback: 0,
              costDisplay: 'projected',
              budgetLines: [
                {
                  id: 'line-unassigned',
                  description: 'Line Unassigned (No source)',
                  plannedAmount: 5000,
                  confidence: 'own_estimate',
                  actualCost: 0,
                  hasInvoice: false,
                  isQuotation: false,
                  budgetSourceId: null,
                },
              ],
            },
          ],
          children: [],
        },
      ],
      totals: {
        projectedMin: 5000,
        projectedMax: 5000,
        actualCost: 0,
        subsidyPayback: 0,
        rawProjectedMin: 5000,
        rawProjectedMax: 5000,
        minSubsidyPayback: 0,
      },
    },
    householdItems: {
      areas: [],
      totals: makeEmptyTotals(),
    },
    subsidyAdjustments: [],
    // Server still returns budgetSources so source rows remain visible in
    // the Available Funds section.
    budgetSources,
  };
}

/**
 * Filtered response returned by the server when SOURCE_A is deselected.
 * Server prunes its areas/items, so this response has empty workItems.areas
 * (simulating "all lines for the remaining filter are Source A only").
 */
function makeFilteredEmptyBreakdown() {
  return {
    workItems: {
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
    householdItems: {
      areas: [],
      totals: makeEmptyTotals(),
    },
    subsidyAdjustments: [],
    // Server still returns the budgetSources array (unfiltered projectedMin/Max)
    // so the source rows remain visible in the Available Funds section.
    budgetSources: [
      {
        id: SOURCE_A_ID,
        name: 'Bank Loan',
        totalAmount: 150000,
        projectedMin: 30000,
        projectedMax: 35000,
        subsidyPaybackMin: 0,
        subsidyPaybackMax: 0,
      },
    ],
  };
}

/**
 * Breakdown for subsidy oversubscription scenario:
 * - Source A (Large Source): 50000 cost, subsidy payback 20000 (min), 22000 (max)
 * - Source B (Small Source): 5000 cost, subsidy payback 0
 * Total cost 55000, total payback 20000/22000 — payback well under cost.
 */
function makeBreakdownWithSubsidy() {
  return {
    workItems: {
      areas: [
        {
          areaId: 'area-main',
          name: 'Main Area',
          parentId: null,
          color: '#3B82F6',
          projectedMin: 55000,
          projectedMax: 55000,
          actualCost: 0,
          subsidyPayback: 20000,
          rawProjectedMin: 55000,
          rawProjectedMax: 55000,
          minSubsidyPayback: 20000,
          items: [
            {
              workItemId: 'wi-main-1',
              title: 'Main Work Item',
              projectedMin: 55000,
              projectedMax: 55000,
              actualCost: 0,
              subsidyPayback: 20000,
              rawProjectedMin: 55000,
              rawProjectedMax: 55000,
              minSubsidyPayback: 20000,
              costDisplay: 'projected',
              budgetLines: [
                {
                  id: 'line-a1',
                  description: 'Line A1 (Source A)',
                  plannedAmount: 50000,
                  confidence: 'own_estimate',
                  actualCost: 0,
                  hasInvoice: false,
                  isQuotation: false,
                  budgetSourceId: SOURCE_A_ID,
                },
                {
                  id: 'line-b1',
                  description: 'Line B1 (Source B)',
                  plannedAmount: 5000,
                  confidence: 'own_estimate',
                  actualCost: 0,
                  hasInvoice: false,
                  isQuotation: false,
                  budgetSourceId: SOURCE_B_ID,
                },
              ],
            },
          ],
          children: [],
        },
      ],
      totals: {
        projectedMin: 55000,
        projectedMax: 55000,
        actualCost: 0,
        subsidyPayback: 20000,
        rawProjectedMin: 55000,
        rawProjectedMax: 55000,
        minSubsidyPayback: 20000,
      },
    },
    householdItems: {
      areas: [],
      totals: makeEmptyTotals(),
    },
    subsidyAdjustments: [],
    budgetSources: [
      {
        id: SOURCE_A_ID,
        name: 'Large Source',
        totalAmount: 200000,
        projectedMin: 50000,
        projectedMax: 50000,
        subsidyPaybackMin: 20000,
        subsidyPaybackMax: 22000,
      },
      {
        id: SOURCE_B_ID,
        name: 'Small Source',
        totalAmount: 10000,
        projectedMin: 5000,
        projectedMax: 5000,
        subsidyPaybackMin: 0,
        subsidyPaybackMax: 0,
      },
    ],
  };
}

/**
 * Filtered breakdown when SOURCE_A (Large Source) is deselected.
 * Small Source only: cost 5000, payback 0 — payback < cost, no oversubscription.
 */
function makeBreakdownWithSubsidyFiltered() {
  return {
    workItems: {
      areas: [
        {
          areaId: 'area-main',
          name: 'Main Area',
          parentId: null,
          color: '#3B82F6',
          projectedMin: 5000,
          projectedMax: 5000,
          actualCost: 0,
          subsidyPayback: 0,
          rawProjectedMin: 5000,
          rawProjectedMax: 5000,
          minSubsidyPayback: 0,
          items: [
            {
              workItemId: 'wi-main-1',
              title: 'Main Work Item',
              projectedMin: 5000,
              projectedMax: 5000,
              actualCost: 0,
              subsidyPayback: 0,
              rawProjectedMin: 5000,
              rawProjectedMax: 5000,
              minSubsidyPayback: 0,
              costDisplay: 'projected',
              budgetLines: [
                {
                  id: 'line-b1',
                  description: 'Line B1 (Source B)',
                  plannedAmount: 5000,
                  confidence: 'own_estimate',
                  actualCost: 0,
                  hasInvoice: false,
                  isQuotation: false,
                  budgetSourceId: SOURCE_B_ID,
                },
              ],
            },
          ],
          children: [],
        },
      ],
      totals: {
        projectedMin: 5000,
        projectedMax: 5000,
        actualCost: 0,
        subsidyPayback: 0,
        rawProjectedMin: 5000,
        rawProjectedMax: 5000,
        minSubsidyPayback: 0,
      },
    },
    householdItems: {
      areas: [],
      totals: makeEmptyTotals(),
    },
    subsidyAdjustments: [],
    budgetSources: [
      {
        id: SOURCE_A_ID,
        name: 'Large Source',
        totalAmount: 200000,
        projectedMin: 50000,
        projectedMax: 50000,
        // Deselected source: subsidyPayback is 0 per server contract
        subsidyPaybackMin: 0,
        subsidyPaybackMax: 0,
      },
      {
        id: SOURCE_B_ID,
        name: 'Small Source',
        totalAmount: 10000,
        projectedMin: 5000,
        projectedMax: 5000,
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
 * Mount route mocks for /budget/overview and /budget/breakdown.
 *
 * The breakdown handler distinguishes filtered vs. unfiltered requests by inspecting
 * ?deselectedSources= in the URL. If `filteredBreakdownBody` is provided, it is returned
 * for requests with the param; otherwise `breakdownBody` is used for all requests.
 *
 * URL format: ?deselectedSources=id1,id2 (comma-separated, URL-encoded).
 */
async function mountOverviewRoutes(
  page: PageParam,
  overviewBody: object,
  breakdownBody: object,
  filteredBreakdownBody?: object,
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
  // Use **/api/budget/breakdown** to match the full URL including http://localhost:PORT/ prefix
  // and any ?deselectedSources= query string.
  await page.route('**/api/budget/breakdown**', async (route) => {
    if (route.request().method() === 'GET') {
      const url = new URL(route.request().url());
      const deselected = url.searchParams.get('deselectedSources');
      const body = deselected && filteredBreakdownBody ? filteredBreakdownBody : breakdownBody;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ breakdown: body }),
      });
    } else {
      await route.continue();
    }
  });
  // Mock budget sources API (breakdown mock has budgetSources inline)
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
 * Navigate to /budget/overview, wait for data to load, then expand:
 * 1. Work Items section
 * 2. Main Area
 * 3. Main Work Item to reveal Level 3 budget lines
 */
async function expandToLevel3(overviewPage: BudgetOverviewPage) {
  await overviewPage.goto();
  await overviewPage.waitForLoaded();

  await overviewPage.costBreakdownCard
    .getByRole('button', { name: /expand work item budget by area/i })
    .click();

  await overviewPage.breakdownAreaToggle('Main Area').click();
  await expect(
    overviewPage.costBreakdownCard.getByRole('button', { name: /Expand Main Work Item/i }),
  ).toBeVisible();

  await overviewPage.costBreakdownCard
    .getByRole('button', { name: /Expand Main Work Item/i })
    .click();
}

/**
 * Navigate to /budget/overview with a preset URL param (e.g. ?deselectedSources=<id>),
 * wait for load, then expand to Level 3.
 */
async function navigateWithParamAndExpand(
  page: PageParam,
  overviewPage: BudgetOverviewPage,
  paramString: string,
) {
  await page.goto(`${BUDGET_OVERVIEW_ROUTE}?${paramString}`);
  await overviewPage.waitForLoaded();

  await overviewPage.costBreakdownCard
    .getByRole('button', { name: /expand work item budget by area/i })
    .click();
  await overviewPage.breakdownAreaToggle('Main Area').click();
  await overviewPage.costBreakdownCard
    .getByRole('button', { name: /Expand Main Work Item/i })
    .click();
}

// ─────────────────────────────────────────────────────────────────────────────
// Source badge on Level 3 rows (carry-over from #1354 — behavior unchanged)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Source badge on Level 3 rows', { tag: '@responsive' }, () => {
  test('Source badge with source name visible on Level 3 budget line row', async ({ page }) => {
    const overviewPage = new BudgetOverviewPage(page);
    const teardown = await mountOverviewRoutes(
      page,
      makeBudgetOverviewResponse(),
      makeBreakdownResponse(),
    );

    try {
      await expandToLevel3(overviewPage);

      const lineA1Row = overviewPage.costBreakdownCard
        .getByRole('row')
        .filter({ hasText: 'Line A1 (Source A)' });
      // toBeAttached() because on mobile the badge label is CSS-hidden; the dot is shown instead.
      // aria-label remains in DOM for screen readers.
      await expect(lineA1Row.locator('[aria-label="Budget source: Bank Loan"]')).toBeAttached();
    } finally {
      await teardown();
    }
  });

  test('Unassigned badge visible on Level 3 row with no source', async ({ page }) => {
    const overviewPage = new BudgetOverviewPage(page);
    const teardown = await mountOverviewRoutes(
      page,
      makeBudgetOverviewResponse(),
      makeBreakdownResponse(),
    );

    try {
      await expandToLevel3(overviewPage);

      const unassignedRow = overviewPage.costBreakdownCard
        .getByRole('row')
        .filter({ hasText: 'Line Unassigned (No source)' });
      await expect(
        unassignedRow.locator('[aria-label="Budget source: Unassigned"]'),
      ).toBeAttached();
    } finally {
      await teardown();
    }
  });

  test('Long source name truncates to ellipsis in badge display text', async ({ page }) => {
    const overviewPage = new BudgetOverviewPage(page);
    const teardown = await mountOverviewRoutes(
      page,
      makeBudgetOverviewResponse(),
      makeBreakdownResponse({ includeLongName: true }),
    );

    try {
      await expandToLevel3(overviewPage);

      const longRow = overviewPage.costBreakdownCard
        .getByRole('row')
        .filter({ hasText: 'Line Long Name Source' });

      const badge = longRow.locator('[aria-label*="Budget source:"]');
      await expect(badge).toBeAttached();

      const badgeText = await badge.textContent();
      expect(badgeText).toMatch(/…$/);
      expect(badgeText?.length).toBeLessThanOrEqual(22); // 20 chars + '…'

      const titleAttr = await badge.getAttribute('title');
      expect(titleAttr).toBe(LONG_SOURCE_NAME);
    } finally {
      await teardown();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Default state
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Default state — all sources selected', { tag: '@responsive' }, () => {
  test('No source rows are deselected and URL has no deselectedSources param', async ({ page }) => {
    const overviewPage = new BudgetOverviewPage(page);
    const teardown = await mountOverviewRoutes(
      page,
      makeBudgetOverviewResponse(),
      makeBreakdownResponse({ includeSourceB: true }),
    );

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      await overviewPage.availableFundsButton().click();

      // All source rows must be in selected state (aria-pressed="true")
      const rowA = overviewPage.sourceRow('Bank Loan');
      const rowB = overviewPage.sourceRow('Equity');
      await expect(rowA).toBeVisible();
      await expect(rowB).toBeVisible();
      await expect(rowA).toHaveAttribute('aria-pressed', 'true');
      await expect(rowB).toHaveAttribute('aria-pressed', 'true');

      // URL must not contain deselectedSources
      await expect(page).not.toHaveURL(/deselectedSources/);

      // No filter caption present when all sources are selected
      await expect(overviewPage.filterCaption()).not.toBeVisible();
    } finally {
      await teardown();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario A — Deselect triggers server refetch with correct query param
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Deselect triggers server refetch', { tag: '@responsive' }, () => {
  test('Deselecting a source triggers API refetch with correct query param', async ({ page }) => {
    const overviewPage = new BudgetOverviewPage(page);
    // filteredBreakdownBody: Source A deselected — server prunes its lines
    const teardown = await mountOverviewRoutes(
      page,
      makeBudgetOverviewResponse(),
      makeBreakdownResponse(),
      makeFilteredEmptyBreakdown(),
    );

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      await overviewPage.availableFundsButton().click();

      const row = overviewPage.sourceRow('Bank Loan');
      await expect(row).toHaveAttribute('aria-pressed', 'true');

      // Register response waiter BEFORE the click (waitForResponse must precede the action)
      const refetchPromise = page.waitForResponse(
        (resp) =>
          resp.url().includes('/api/budget/breakdown') && resp.url().includes('deselectedSources='),
      );

      await row.click();

      // aria-pressed updates immediately from URL state change (setSearchParams),
      // before the debounced server refetch completes — assert here.
      await expect(row).toHaveAttribute('aria-pressed', 'false');

      // Wait for the debounced + refetch response
      const refetchResponse = await refetchPromise;
      expect(refetchResponse.status()).toBe(200);

      // URL in the refetch request must include the deselected source ID
      expect(refetchResponse.url()).toContain(SOURCE_A_ID);

      // URL search param updated
      await expect(page).toHaveURL(new RegExp(`deselectedSources=.*${SOURCE_A_ID}`));
    } finally {
      await teardown();
    }
  });

  test('Click source row → rendered values update from server filtered response', async ({
    page,
  }) => {
    const overviewPage = new BudgetOverviewPage(page);
    const teardown = await mountOverviewRoutes(
      page,
      makeBudgetOverviewResponse(),
      makeBreakdownResponse(),
      makeFilteredEmptyBreakdown(),
    );

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      await overviewPage.availableFundsButton().click();

      // Expand to Level 3 first to see Source A lines in the initial state
      await overviewPage.costBreakdownCard
        .getByRole('button', { name: /expand work item budget by area/i })
        .click();
      await overviewPage.breakdownAreaToggle('Main Area').click();
      await overviewPage.costBreakdownCard
        .getByRole('button', { name: /Expand Main Work Item/i })
        .click();

      // Source A lines visible in initial (unfiltered) state
      await expect(
        overviewPage.costBreakdownCard.getByRole('row').filter({ hasText: 'Line A1 (Source A)' }),
      ).toBeVisible();

      // Register response waiter BEFORE the click
      const refetchPromise = page.waitForResponse(
        (resp) =>
          resp.url().includes('/api/budget/breakdown') && resp.url().includes('deselectedSources='),
      );

      await overviewPage.sourceRow('Bank Loan').click();

      // Wait for filtered response from server
      await refetchPromise;

      // Server filtered response has empty areas[] → work item and its lines disappear
      await expect(
        overviewPage.costBreakdownCard.getByRole('row').filter({ hasText: 'Line A1 (Source A)' }),
      ).not.toBeVisible();
      await expect(
        overviewPage.costBreakdownCard.getByRole('row').filter({ hasText: 'Line A2 (Source A)' }),
      ).not.toBeVisible();
    } finally {
      await teardown();
    }
  });

  test('Multi-deselection: both IDs appear in URL, server refetch includes both', async ({
    page,
  }) => {
    const overviewPage = new BudgetOverviewPage(page);
    // Use makeFilteredBreakdownBankLoanDeselected({ includeSourceB: true }) so that after
    // Bank Loan is deselected, the table still renders with non-empty areas (Unassigned
    // lines remain) AND the Equity source row stays visible (included in budgetSources).
    // makeFilteredEmptyBreakdown() would collapse to empty state and hide all source rows,
    // preventing the second click on Equity.
    const teardown = await mountOverviewRoutes(
      page,
      makeBudgetOverviewResponse(),
      makeBreakdownResponse({ includeSourceB: true }),
      makeFilteredBreakdownBankLoanDeselected({ includeSourceB: true }),
    );

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      await overviewPage.availableFundsButton().click();

      // Deselect Bank Loan — first refetch includes only SOURCE_A_ID
      const refetchA = page.waitForResponse(
        (resp) =>
          resp.url().includes('/api/budget/breakdown') && resp.url().includes('deselectedSources='),
      );
      await overviewPage.sourceRow('Bank Loan').click();
      // aria-pressed updates from URL state change before the server response
      await expect(overviewPage.sourceRow('Bank Loan')).toHaveAttribute('aria-pressed', 'false');
      await refetchA;

      // Deselect Equity — new refetch should include both IDs
      const refetchB = page.waitForResponse(
        (resp) =>
          resp.url().includes('/api/budget/breakdown') && resp.url().includes('deselectedSources='),
      );
      await overviewPage.sourceRow('Equity').click();
      // aria-pressed for Equity updates from URL state before server response
      await expect(overviewPage.sourceRow('Equity')).toHaveAttribute('aria-pressed', 'false');
      const responseB = await refetchB;

      // Both IDs must be present in the final request URL
      expect(responseB.url()).toContain(SOURCE_A_ID);
      expect(responseB.url()).toContain(SOURCE_B_ID);

      // URL search param contains both IDs
      const url = page.url();
      expect(url).toContain(SOURCE_A_ID);
      expect(url).toContain(SOURCE_B_ID);
    } finally {
      await teardown();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario B — Re-select clears query param from API request
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Re-select clears query param', { tag: '@responsive' }, () => {
  test('Re-selecting a source triggers API refetch without deselectedSources param', async ({
    page,
  }) => {
    const overviewPage = new BudgetOverviewPage(page);
    // Use makeFilteredBreakdownBankLoanDeselected() so the initial page load
    // (with ?deselectedSources=SOURCE_A_ID) renders non-empty areas. If
    // makeFilteredEmptyBreakdown() were used instead, CostBreakdownTable would
    // switch to its empty-state branch and the source rows (including Bank Loan)
    // would not be in the DOM — making availableFundsButton() and sourceRow()
    // unreachable.
    const teardown = await mountOverviewRoutes(
      page,
      makeBudgetOverviewResponse(),
      makeBreakdownResponse(),
      makeFilteredBreakdownBankLoanDeselected(),
    );

    try {
      // Navigate with Bank Loan pre-deselected via URL
      await page.goto(`${BUDGET_OVERVIEW_ROUTE}?deselectedSources=${SOURCE_A_ID}`);
      await overviewPage.waitForLoaded();

      await overviewPage.availableFundsButton().click();

      const row = overviewPage.sourceRow('Bank Loan');
      await expect(row).toHaveAttribute('aria-pressed', 'false');

      // Register response waiter for the un-filtered refetch
      const refetchPromise = page.waitForResponse(
        (resp) =>
          resp.url().includes('/api/budget/breakdown') &&
          !resp.url().includes('deselectedSources='),
      );

      // Click to re-select
      await row.click();

      // aria-pressed updates from URL state change before server response
      await expect(row).toHaveAttribute('aria-pressed', 'true');

      const refetchResponse = await refetchPromise;
      expect(refetchResponse.status()).toBe(200);

      // URL no longer contains deselectedSources
      await expect(page).not.toHaveURL(/deselectedSources/);
    } finally {
      await teardown();
    }
  });

  test('Click deselected source row re-selects it and clears URL param', async ({ page }) => {
    const overviewPage = new BudgetOverviewPage(page);
    const teardown = await mountOverviewRoutes(
      page,
      makeBudgetOverviewResponse(),
      makeBreakdownResponse(),
    );

    try {
      // Start with Bank Loan deselected via URL
      await page.goto(`${BUDGET_OVERVIEW_ROUTE}?deselectedSources=${SOURCE_A_ID}`);
      await overviewPage.waitForLoaded();

      await overviewPage.availableFundsButton().click();

      const row = overviewPage.sourceRow('Bank Loan');
      await expect(row).toHaveAttribute('aria-pressed', 'false');

      const refetchPromise = page.waitForResponse(
        (resp) =>
          resp.url().includes('/api/budget/breakdown') &&
          !resp.url().includes('deselectedSources='),
      );

      // Click to re-select
      await row.click();
      await refetchPromise;

      await expect(row).toHaveAttribute('aria-pressed', 'true');
      await expect(page).not.toHaveURL(/deselectedSources/);
    } finally {
      await teardown();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario C — Cascade hiding via server response
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Cascade hiding via server response', { tag: '@responsive' }, () => {
  test('Deselecting the only source hides work item after server refetch', async ({ page }) => {
    const overviewPage = new BudgetOverviewPage(page);
    // filteredBreakdownBody: server prunes areas entirely when SOURCE_A is deselected
    const teardown = await mountOverviewRoutes(
      page,
      makeBudgetOverviewResponse(),
      makeBreakdownSourceAOnly(),
      makeFilteredEmptyBreakdown(),
    );

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      // Expand Work Items section
      await overviewPage.costBreakdownCard
        .getByRole('button', { name: /expand work item budget by area/i })
        .click();

      // Main Area visible in the initial unfiltered state
      await expect(
        overviewPage.costBreakdownCard.getByRole('row').filter({ hasText: 'Main Area' }),
      ).toBeVisible();

      // Deselect Bank Loan
      await overviewPage.availableFundsButton().click();

      const refetchPromise = page.waitForResponse(
        (resp) =>
          resp.url().includes('/api/budget/breakdown') && resp.url().includes('deselectedSources='),
      );
      await overviewPage.sourceRow('Bank Loan').click();
      await expect(overviewPage.sourceRow('Bank Loan')).toHaveAttribute('aria-pressed', 'false');

      // Wait for server filtered response
      await refetchPromise;

      // Server returned empty areas[] — Main Area row must disappear
      await expect(
        overviewPage.costBreakdownCard.getByRole('row').filter({ hasText: 'Main Area' }),
      ).not.toBeVisible();
    } finally {
      await teardown();
    }
  });

  test('Source rows cascade-hide on mobile viewport when source is deselected', async ({
    page,
  }) => {
    const overviewPage = new BudgetOverviewPage(page);
    const teardown = await mountOverviewRoutes(
      page,
      makeBudgetOverviewResponse(),
      makeBreakdownSourceAOnly(),
      makeFilteredEmptyBreakdown(),
    );

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      // Expand Work Items section BEFORE deselection so Main Area is visible.
      // After the filtered response arrives (empty areas), the expand button
      // disappears (CostBreakdownTable switches to empty state) so we must
      // expand while the full table is still rendered.
      await overviewPage.costBreakdownCard
        .getByRole('button', { name: /expand work item budget by area/i })
        .click();

      // Confirm Main Area is visible in initial unfiltered state
      await expect(
        overviewPage.costBreakdownCard.getByRole('row').filter({ hasText: 'Main Area' }),
      ).toBeVisible();

      // Expand Available Funds to show source toggle rows
      await overviewPage.availableFundsButton().click();

      const refetchPromise = page.waitForResponse(
        (resp) =>
          resp.url().includes('/api/budget/breakdown') && resp.url().includes('deselectedSources='),
      );
      await overviewPage.sourceRow('Bank Loan').click();
      // aria-pressed updates from URL state change before server response
      await expect(overviewPage.sourceRow('Bank Loan')).toHaveAttribute('aria-pressed', 'false');

      // Wait for server filtered response (empty areas[])
      await refetchPromise;

      // Server returned empty areas[] — Main Area row must disappear
      await expect(
        overviewPage.costBreakdownCard.getByRole('row').filter({ hasText: 'Main Area' }),
      ).not.toBeVisible();
    } finally {
      await teardown();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario D — Subsidy oversubscription consistency (canonical bug case, AC #32)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Subsidy oversubscription consistency', () => {
  test('Filtering out large source: payback does not exceed cost for remaining source', async ({
    page,
  }) => {
    const overviewPage = new BudgetOverviewPage(page);
    const teardown = await mountOverviewRoutes(
      page,
      makeBudgetOverviewResponse(),
      makeBreakdownWithSubsidy(),
      makeBreakdownWithSubsidyFiltered(),
    );

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      await overviewPage.availableFundsButton().click();

      // Record Large Source row values before filtering
      const largeRow = overviewPage.sourceRow('Large Source');
      await expect(largeRow).toBeVisible();
      const costBefore = await largeRow.locator('td').nth(1).textContent();
      expect(costBefore).toMatch(/[€\d]/);

      // Deselect Large Source → triggers server refetch with filtered data
      const refetchPromise = page.waitForResponse(
        (resp) =>
          resp.url().includes('/api/budget/breakdown') && resp.url().includes('deselectedSources='),
      );

      await largeRow.click();
      await refetchPromise;

      // Large Source is now deselected
      await expect(largeRow).toHaveAttribute('aria-pressed', 'false');

      // Small Source remains selected — check its payback vs. cost values
      const smallRow = overviewPage.sourceRow('Small Source');
      await expect(smallRow).toBeVisible();
      await expect(smallRow).toHaveAttribute('aria-pressed', 'true');

      // Small Source: subsidyPaybackMin=0, subsidyPaybackMax=0 in filtered response
      // Payback cell must show 0 (formatted) — not exceeding the 5000 cost
      const paybackCell = smallRow.locator('td').nth(2);
      const paybackText = await paybackCell.textContent();
      // payback is 0 so should render as €0 (or locale equivalent) — does not exceed cost
      expect(paybackText).toMatch(/[€\d]/);

      // The Payback rendered value must not numerically exceed Cost for Small Source.
      // Cost is €5,000; payback for Small Source is €0 in filtered response.
      // We verify payback <= cost by checking the net value cell is non-negative
      // (net = totalAmount + payback - cost = 10000 + 0 - 5000 = 5000 > 0).
      const netCell = smallRow.locator('td').nth(3);
      const netText = await netCell.textContent();
      // Net must contain a currency value (positive = no oversubscription)
      expect(netText).toMatch(/[€\d]/);
      // Net should NOT show a negative value (which would indicate payback > cost)
      expect(netText).not.toMatch(/^-/);
    } finally {
      await teardown();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario E — Stale-while-revalidate: previous breakdown stays visible during refetch
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Stale-while-revalidate during refetch', { tag: '@responsive' }, () => {
  test('Previous breakdown remains visible during refetch (no flicker to skeleton)', async ({
    page,
  }) => {
    const overviewPage = new BudgetOverviewPage(page);

    // Mount the overview route normally
    await page.route(`${API.budgetOverview}`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ overview: makeBudgetOverviewResponse() }),
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

    // Mount breakdown with artificial 200ms delay on filtered requests
    let requestCount = 0;
    await page.route('**/api/budget/breakdown**', async (route) => {
      if (route.request().method() === 'GET') {
        const url = new URL(route.request().url());
        const deselected = url.searchParams.get('deselectedSources');
        requestCount++;
        if (deselected) {
          // Delay the filtered response by 200ms to simulate slow server
          await new Promise<void>((resolve) => setTimeout(resolve, 200));
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ breakdown: makeFilteredEmptyBreakdown() }),
          });
        } else {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ breakdown: makeBreakdownSourceAOnly() }),
          });
        }
      } else {
        await route.continue();
      }
    });

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      // Hero card is visible (initial state loaded)
      await expect(overviewPage.heroCard).toBeVisible();

      // Expand work items to see content
      await overviewPage.costBreakdownCard
        .getByRole('button', { name: /expand work item budget by area/i })
        .click();
      await overviewPage.breakdownAreaToggle('Main Area').click();

      // Register the delayed refetch promise BEFORE clicking
      const refetchPromise = page.waitForResponse(
        (resp) =>
          resp.url().includes('/api/budget/breakdown') && resp.url().includes('deselectedSources='),
      );

      // Deselect source — triggers debounced + delayed refetch
      await overviewPage.availableFundsButton().click();
      await overviewPage.sourceRow('Bank Loan').click();

      // While the delayed refetch is in-flight:
      // The breakdown section must still be visible (stale content rendered)
      // and must NOT have been replaced by a skeleton/loading state.
      await expect(overviewPage.costBreakdownCard).toBeVisible();
      await expect(overviewPage.heroCard).toBeVisible();

      // No skeleton loading indicator for the breakdown section
      await expect(page.getByRole('status', { name: 'Loading budget overview' })).not.toBeVisible();

      // Wait for the delayed refetch to complete
      await refetchPromise;

      // After refetch: breakdown card still visible (with new server data)
      await expect(overviewPage.costBreakdownCard).toBeVisible();
    } finally {
      await page.unroute(`${API.budgetOverview}`);
      await page.unroute('**/api/budget/breakdown**');
      await page.unroute(`${API.budgetSources}`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario F — URL on mount triggers initial filtered fetch
// ─────────────────────────────────────────────────────────────────────────────
test.describe('URL on mount triggers initial filtered fetch', { tag: '@responsive' }, () => {
  test('Navigating with ?deselectedSources= sends filtered initial fetch', async ({ page }) => {
    const overviewPage = new BudgetOverviewPage(page);
    const teardown = await mountOverviewRoutes(
      page,
      makeBudgetOverviewResponse(),
      makeBreakdownResponse(),
      makeFilteredEmptyBreakdown(),
    );

    try {
      // Register response waiter BEFORE navigation — must catch the initial mount fetch
      const initialFetchPromise = page.waitForResponse(
        (resp) =>
          resp.url().includes('/api/budget/breakdown') && resp.url().includes('deselectedSources='),
      );

      // Navigate directly with deselectedSources param
      await page.goto(`${BUDGET_OVERVIEW_ROUTE}?deselectedSources=${SOURCE_A_ID}`);
      await overviewPage.waitForLoaded();

      // Verify initial API request included the param
      const initialResponse = await initialFetchPromise;
      expect(initialResponse.status()).toBe(200);
      expect(initialResponse.url()).toContain(SOURCE_A_ID);

      // Expand available funds
      await overviewPage.availableFundsButton().click();

      // Bank Loan row must be rendered as deselected (state restored from URL)
      await expect(overviewPage.sourceRow('Bank Loan')).toHaveAttribute('aria-pressed', 'false');
    } finally {
      await teardown();
    }
  });

  test('?deselectedSources= param restores filter on load — lines from source not visible', async ({
    page,
  }) => {
    const overviewPage = new BudgetOverviewPage(page);
    const teardown = await mountOverviewRoutes(
      page,
      makeBudgetOverviewResponse(),
      makeBreakdownResponse(),
      makeFilteredEmptyBreakdown(),
    );

    try {
      // Navigate directly with the filter param. The filtered fixture has empty
      // areas, so we don't try to expand the WI section — there's nothing to
      // expand. The test goal is just to verify the filter state is restored
      // from the URL and Source A lines are absent from the DOM.
      await page.goto(`${BUDGET_OVERVIEW_ROUTE}?deselectedSources=${SOURCE_A_ID}`);
      await overviewPage.waitForLoaded();

      await overviewPage.availableFundsButton().click();

      // Bank Loan row must be rendered as deselected
      await expect(overviewPage.sourceRow('Bank Loan')).toHaveAttribute('aria-pressed', 'false');

      // Server returns filtered response (empty areas) — Source A lines are not in the DOM
      await expect(
        overviewPage.costBreakdownCard.getByRole('row').filter({ hasText: 'Line A1 (Source A)' }),
      ).toHaveCount(0);
    } finally {
      await teardown();
    }
  });

  test('Stale/unknown ID in ?deselectedSources= is silently ignored — all sources selected', async ({
    page,
  }) => {
    const overviewPage = new BudgetOverviewPage(page);
    // For unknown IDs: server still returns full breakdown (deselected set is empty after filtering)
    const teardown = await mountOverviewRoutes(
      page,
      makeBudgetOverviewResponse(),
      makeBreakdownResponse(),
    );

    try {
      await page.goto(`${BUDGET_OVERVIEW_ROUTE}?deselectedSources=nonexistent-uuid`);
      await overviewPage.waitForLoaded();

      await overviewPage.availableFundsButton().click();

      // Bank Loan row must still be selected (unknown ID — server ignores it and returns full breakdown)
      await expect(overviewPage.sourceRow('Bank Loan')).toHaveAttribute('aria-pressed', 'true');
    } finally {
      await teardown();
    }
  });

  test('Old ?sources= param is ignored — all sources selected', async ({ page }) => {
    const overviewPage = new BudgetOverviewPage(page);
    const teardown = await mountOverviewRoutes(
      page,
      makeBudgetOverviewResponse(),
      makeBreakdownResponse(),
    );

    try {
      await page.goto(`${BUDGET_OVERVIEW_ROUTE}?sources=${SOURCE_A_ID}`);
      await overviewPage.waitForLoaded();

      await overviewPage.availableFundsButton().click();

      // Row must be selected — legacy param not read
      await expect(overviewPage.sourceRow('Bank Loan')).toHaveAttribute('aria-pressed', 'true');
    } finally {
      await teardown();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario G — Deselect all → empty state from server
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Empty state when all sources deselected', { tag: '@responsive' }, () => {
  test('Deselecting all sources shows empty state from server response', async ({ page }) => {
    const overviewPage = new BudgetOverviewPage(page);
    // Use SOURCE_A_ID only breakdown (no unassigned) — deselecting one source covers everything
    const teardown = await mountOverviewRoutes(
      page,
      makeBudgetOverviewResponse(),
      makeBreakdownSourceAOnly(),
      makeFilteredEmptyBreakdown(),
    );

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      await overviewPage.availableFundsButton().click();

      const refetchPromise = page.waitForResponse(
        (resp) =>
          resp.url().includes('/api/budget/breakdown') && resp.url().includes('deselectedSources='),
      );

      await overviewPage.sourceRow('Bank Loan').click();

      // Wait for server to return empty areas[]
      await refetchPromise;

      // EmptyState message appears (server returned empty areas[])
      const emptyMsg = overviewPage.costBreakdownCard.getByText(
        'No budget lines match the selected source filter.',
        { exact: true },
      );
      await expect(emptyMsg).toBeVisible();
    } finally {
      await teardown();
    }
  });

  test('Clear filters action from empty state triggers unfiltered refetch and restores content', async ({
    page,
  }) => {
    const overviewPage = new BudgetOverviewPage(page);
    const teardown = await mountOverviewRoutes(
      page,
      makeBudgetOverviewResponse(),
      makeBreakdownSourceAOnly(),
      makeFilteredEmptyBreakdown(),
    );

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      await overviewPage.availableFundsButton().click();

      // Deselect to trigger empty state
      const firstRefetch = page.waitForResponse(
        (resp) =>
          resp.url().includes('/api/budget/breakdown') && resp.url().includes('deselectedSources='),
      );
      await overviewPage.sourceRow('Bank Loan').click();
      await firstRefetch;

      // Confirm empty state is shown
      await expect(
        overviewPage.costBreakdownCard.getByText(
          'No budget lines match the selected source filter.',
          { exact: true },
        ),
      ).toBeVisible();

      // Register unfiltered refetch before clicking Clear filters
      const clearRefetch = page.waitForResponse(
        (resp) =>
          resp.url().includes('/api/budget/breakdown') &&
          !resp.url().includes('deselectedSources='),
      );

      // Click "Clear filters" action button from EmptyState
      await overviewPage.costBreakdownCard
        .getByRole('button', { name: 'Clear filters', exact: true })
        .click();

      // Unfiltered refetch fires
      await clearRefetch;

      // Empty state is gone, URL is clean
      await expect(
        overviewPage.costBreakdownCard.getByText(
          'No budget lines match the selected source filter.',
          { exact: true },
        ),
      ).not.toBeVisible();
      await expect(page).not.toHaveURL(/deselectedSources/);
    } finally {
      await teardown();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario H — Rapid debounce: only one API request fires
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Rapid debounce coalesces requests', () => {
  test('Rapid source toggles coalesce into a single API request', async ({ page }) => {
    const overviewPage = new BudgetOverviewPage(page);
    // Use a fixture with 3 sources to allow rapid multi-toggles
    const teardown = await mountOverviewRoutes(
      page,
      makeBudgetOverviewResponse(),
      makeBreakdownResponse({ includeSourceB: true }),
      makeFilteredEmptyBreakdown(),
    );

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      await overviewPage.availableFundsButton().click();

      // Track how many filtered breakdown requests fire
      let filteredRequestCount = 0;
      page.on('request', (req) => {
        if (
          req.url().includes('/api/budget/breakdown') &&
          req.url().includes('deselectedSources=')
        ) {
          filteredRequestCount++;
        }
      });

      // Click Source A and Source B rapidly (within the 50ms debounce window)
      // We do NOT await between these clicks — they must fire faster than the debounce.
      const clickA = overviewPage.sourceRow('Bank Loan').click();
      const clickB = overviewPage.sourceRow('Equity').click();
      await Promise.all([clickA, clickB]);

      // Wait past the debounce window (50ms) and one network round-trip (~100ms)
      // to let the single coalesced request complete.
      const coalescedRefetch = page.waitForResponse(
        (resp) =>
          resp.url().includes('/api/budget/breakdown') && resp.url().includes('deselectedSources='),
      );
      await coalescedRefetch;

      // After debounce settles: only ONE filtered request should have fired.
      // (AbortController cancels any in-flight request when a new one is scheduled.)
      expect(filteredRequestCount).toBe(1);
    } finally {
      await teardown();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Available Funds caption
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Available Funds caption', { tag: '@responsive' }, () => {
  test('Caption "(X of Y selected)" appears after deselecting one source from two', async ({
    page,
  }) => {
    const overviewPage = new BudgetOverviewPage(page);
    const teardown = await mountOverviewRoutes(
      page,
      makeBudgetOverviewResponse(),
      makeBreakdownResponse({ includeSourceB: true }),
      makeFilteredEmptyBreakdown(),
    );

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      await overviewPage.availableFundsButton().click();

      // Caption not yet visible — all sources selected
      await expect(overviewPage.filterCaption()).not.toBeVisible();

      // Deselect Bank Loan — triggers refetch
      const refetchPromise = page.waitForResponse(
        (resp) =>
          resp.url().includes('/api/budget/breakdown') && resp.url().includes('deselectedSources='),
      );
      await overviewPage.sourceRow('Bank Loan').click();
      await refetchPromise;

      // Caption appears with "<selected> of <total>" (locale-agnostic).
      // Fixture has Bank Loan + Equity + Unassigned = 3 sources total.
      // After deselecting Bank Loan, 2 of 3 remain selected.
      await expect(overviewPage.filterCaption()).toHaveText(/\d+\D+\d+/);
    } finally {
      await teardown();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Source detail row columns
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Source detail row columns', { tag: '@responsive' }, () => {
  test('Source row has 4 cells: Source · Cost · Payback · Net', async ({ page }) => {
    const overviewPage = new BudgetOverviewPage(page);
    const teardown = await mountOverviewRoutes(
      page,
      makeBudgetOverviewResponse(),
      makeBreakdownResponse(),
    );

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      await overviewPage.availableFundsButton().click();

      const row = overviewPage.sourceRow('Bank Loan');
      await expect(row).toBeVisible();

      const cells = row.locator('td');
      await expect(cells).toHaveCount(4);

      // Cost cell (index 1) should contain a currency amount
      await expect(cells.nth(1)).toContainText(/[€\d]/);
      // Payback cell (index 2) — may be 0 but must contain a currency value
      await expect(cells.nth(2)).toContainText(/[€\d]/);
      // Net cell (index 3)
      await expect(cells.nth(3)).toContainText(/[€\d]/);
    } finally {
      await teardown();
    }
  });

  test('Source row values are unchanged when deselected (only aria-pressed style changes)', async ({
    page,
  }) => {
    // Source row values (projectedMin/Max) are unfiltered and come from budgetSources in the
    // breakdown response — they are NOT re-fetched or changed when a source is deselected.
    // The server always returns unfiltered projectedMin/Max in budgetSources.
    const overviewPage = new BudgetOverviewPage(page);
    const teardown = await mountOverviewRoutes(
      page,
      makeBudgetOverviewResponse(),
      makeBreakdownResponse(),
      makeFilteredEmptyBreakdown(),
    );

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      await overviewPage.availableFundsButton().click();

      const row = overviewPage.sourceRow('Bank Loan');
      const cells = row.locator('td');

      // Record values before deselection
      const costBefore = await cells.nth(1).textContent();
      const paybackBefore = await cells.nth(2).textContent();
      const netBefore = await cells.nth(3).textContent();

      // Deselect — triggers refetch; wait for it
      const refetchPromise = page.waitForResponse(
        (resp) =>
          resp.url().includes('/api/budget/breakdown') && resp.url().includes('deselectedSources='),
      );
      await row.click();
      await expect(row).toHaveAttribute('aria-pressed', 'false');
      await refetchPromise;

      // Values in the source row must not change after deselection
      // (server returns unfiltered projectedMin/Max in budgetSources regardless of filter)
      await expect(cells.nth(1)).toHaveText(costBefore ?? '');
      await expect(cells.nth(2)).toHaveText(paybackBefore ?? '');
      await expect(cells.nth(3)).toHaveText(netBefore ?? '');
    } finally {
      await teardown();
    }
  });

  test('Perspective toggle changes Cost value in source row', async ({ page }) => {
    const overviewPage = new BudgetOverviewPage(page);
    const teardown = await mountOverviewRoutes(
      page,
      makeBudgetOverviewResponse(),
      makeBreakdownResponse(),
    );

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      await overviewPage.availableFundsButton().click();

      const row = overviewPage.sourceRow('Bank Loan');
      const costCell = row.locator('td').nth(1);

      const avgText = await costCell.textContent();

      await overviewPage.costBreakdownCard.getByRole('radio', { name: 'Min' }).click();
      const minText = await costCell.textContent();

      await overviewPage.costBreakdownCard.getByRole('radio', { name: 'Max' }).click();
      const maxText = await costCell.textContent();

      // Bank Loan has projectedMin=30000 ≠ projectedMax=35000, so at least two values differ
      const allSame = minText === avgText && avgText === maxText;
      expect(allSame).toBe(false);
    } finally {
      await teardown();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Keyboard navigation
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Keyboard navigation', () => {
  test('Space key toggles source row selection', async ({ page }) => {
    const overviewPage = new BudgetOverviewPage(page);
    const teardown = await mountOverviewRoutes(
      page,
      makeBudgetOverviewResponse(),
      makeBreakdownResponse(),
      makeFilteredEmptyBreakdown(),
    );

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      await overviewPage.availableFundsButton().click();

      const row = overviewPage.sourceRow('Bank Loan');
      await row.focus();

      // Space deselects (all sources start selected) — triggers refetch
      const deselect = page.waitForResponse(
        (resp) =>
          resp.url().includes('/api/budget/breakdown') && resp.url().includes('deselectedSources='),
      );
      await page.keyboard.press('Space');
      await expect(row).toHaveAttribute('aria-pressed', 'false');
      await deselect;

      // Space re-selects — triggers unfiltered refetch
      const reselect = page.waitForResponse(
        (resp) =>
          resp.url().includes('/api/budget/breakdown') &&
          !resp.url().includes('deselectedSources='),
      );
      await page.keyboard.press('Space');
      await expect(row).toHaveAttribute('aria-pressed', 'true');
      await reselect;
    } finally {
      await teardown();
    }
  });

  test('Enter key toggles source row selection', async ({ page }) => {
    const overviewPage = new BudgetOverviewPage(page);
    const teardown = await mountOverviewRoutes(
      page,
      makeBudgetOverviewResponse(),
      makeBreakdownResponse(),
      makeFilteredEmptyBreakdown(),
    );

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      await overviewPage.availableFundsButton().click();

      const row = overviewPage.sourceRow('Bank Loan');
      await row.focus();

      const refetchPromise = page.waitForResponse(
        (resp) =>
          resp.url().includes('/api/budget/breakdown') && resp.url().includes('deselectedSources='),
      );
      await page.keyboard.press('Enter');
      await expect(row).toHaveAttribute('aria-pressed', 'false');
      await refetchPromise;
    } finally {
      await teardown();
    }
  });

  test('Escape on focused row calls select-all (clears deselections + triggers unfiltered refetch)', async ({
    page,
  }) => {
    const overviewPage = new BudgetOverviewPage(page);
    const teardown = await mountOverviewRoutes(
      page,
      makeBudgetOverviewResponse(),
      makeBreakdownResponse({ includeSourceB: true }),
      makeFilteredEmptyBreakdown(),
    );

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      await overviewPage.availableFundsButton().click();

      // Deselect Bank Loan
      const deselect = page.waitForResponse(
        (resp) =>
          resp.url().includes('/api/budget/breakdown') && resp.url().includes('deselectedSources='),
      );
      const row = overviewPage.sourceRow('Bank Loan');
      await row.click();
      await expect(row).toHaveAttribute('aria-pressed', 'false');
      await expect(page).toHaveURL(new RegExp(`deselectedSources=.*${SOURCE_A_ID}`));
      await deselect;

      // Focus the row and press Escape — should select-all (clear deselections)
      const selectAll = page.waitForResponse(
        (resp) =>
          resp.url().includes('/api/budget/breakdown') &&
          !resp.url().includes('deselectedSources='),
      );
      await row.focus();
      await page.keyboard.press('Escape');

      // Bank Loan is re-selected
      await expect(row).toHaveAttribute('aria-pressed', 'true');

      // URL no longer contains deselectedSources
      await expect(page).not.toHaveURL(/deselectedSources/);

      // Unfiltered refetch fired
      await selectAll;
    } finally {
      await teardown();
    }
  });

  test('Escape on row when no sources are deselected is a no-op', async ({ page }) => {
    const overviewPage = new BudgetOverviewPage(page);
    const teardown = await mountOverviewRoutes(
      page,
      makeBudgetOverviewResponse(),
      makeBreakdownResponse(),
    );

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      await overviewPage.availableFundsButton().click();

      const row = overviewPage.sourceRow('Bank Loan');
      // All sources are selected — Escape should be a no-op
      await row.focus();
      await page.keyboard.press('Escape');

      // Row remains selected
      await expect(row).toHaveAttribute('aria-pressed', 'true');
      await expect(page).not.toHaveURL(/deselectedSources/);
    } finally {
      await teardown();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Live region
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Live region', { tag: '@responsive' }, () => {
  test('Live region announces "X of Y" after deselecting one source', async ({ page }) => {
    const overviewPage = new BudgetOverviewPage(page);
    const teardown = await mountOverviewRoutes(
      page,
      makeBudgetOverviewResponse(),
      makeBreakdownResponse({ includeSourceB: true }),
      makeFilteredEmptyBreakdown(),
    );

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      await overviewPage.availableFundsButton().click();

      const refetchPromise = page.waitForResponse(
        (resp) =>
          resp.url().includes('/api/budget/breakdown') && resp.url().includes('deselectedSources='),
      );
      await overviewPage.sourceRow('Bank Loan').click();
      await refetchPromise;

      // Live region text must contain "<selected> of <total>" (locale-agnostic).
      // Fixture has Bank Loan + Equity + Unassigned = 3 virtual sources.
      // Use toHaveText with regex so the assertion auto-retries while React re-renders.
      await expect(overviewPage.filterAnnouncement()).toHaveText(/\d+\D+\d+/);
    } finally {
      await teardown();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// No chip toolbar
// ─────────────────────────────────────────────────────────────────────────────
test.describe('No chip toolbar', { tag: '@responsive' }, () => {
  test('No role="toolbar" element exists at any time', async ({ page }) => {
    const overviewPage = new BudgetOverviewPage(page);
    const teardown = await mountOverviewRoutes(
      page,
      makeBudgetOverviewResponse(),
      makeBreakdownResponse({ includeSourceB: true }),
      makeFilteredEmptyBreakdown(),
    );

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      await overviewPage.availableFundsButton().click();

      // Select a source to make the UI "active" — toolbar must still not appear
      const refetchPromise = page.waitForResponse(
        (resp) =>
          resp.url().includes('/api/budget/breakdown') && resp.url().includes('deselectedSources='),
      );
      await overviewPage.sourceRow('Bank Loan').click();
      await refetchPromise;

      await expect(page.getByRole('toolbar')).not.toBeAttached();
    } finally {
      await teardown();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Dark mode: badge color smoke check
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Dark mode: badge color smoke check', { tag: '@responsive' }, () => {
  test('Source badge background is not white in dark mode', async ({ page }) => {
    const overviewPage = new BudgetOverviewPage(page);
    const teardown = await mountOverviewRoutes(
      page,
      makeBudgetOverviewResponse(),
      makeBreakdownResponse(),
    );

    try {
      await page.goto(BUDGET_OVERVIEW_ROUTE);
      await page.evaluate(() => {
        document.documentElement.setAttribute('data-theme', 'dark');
      });
      await overviewPage.waitForLoaded();

      await overviewPage.costBreakdownCard
        .getByRole('button', { name: /expand work item budget by area/i })
        .click();
      await overviewPage.breakdownAreaToggle('Main Area').click();
      await overviewPage.costBreakdownCard
        .getByRole('button', { name: /Expand Main Work Item/i })
        .click();

      const badge = overviewPage.costBreakdownCard
        .getByRole('row')
        .filter({ hasText: 'Line A1 (Source A)' })
        .locator('[aria-label="Budget source: Bank Loan"]');
      await expect(badge).toBeAttached();

      // Normalize background-color via a throw-away element (handles var() and hex forms)
      const bgColor = await badge.evaluate((el) => {
        const dummy = document.createElement('span');
        dummy.style.backgroundColor = getComputedStyle(el).backgroundColor;
        document.body.appendChild(dummy);
        const result = getComputedStyle(dummy).backgroundColor;
        document.body.removeChild(dummy);
        return result;
      });

      // In dark mode the background must not be white
      expect(bgColor).not.toBe('rgb(255, 255, 255)');
    } finally {
      await teardown();
    }
  });

  test('Deselected source row is visually distinct in dark mode (aria-pressed smoke check)', async ({
    page,
  }) => {
    const overviewPage = new BudgetOverviewPage(page);
    const teardown = await mountOverviewRoutes(
      page,
      makeBudgetOverviewResponse(),
      makeBreakdownResponse(),
      makeFilteredEmptyBreakdown(),
    );

    try {
      await page.goto(BUDGET_OVERVIEW_ROUTE);
      await page.evaluate(() => {
        document.documentElement.setAttribute('data-theme', 'dark');
      });
      await overviewPage.waitForLoaded();

      await overviewPage.availableFundsButton().click();

      const row = overviewPage.sourceRow('Bank Loan');
      await expect(row).toHaveAttribute('aria-pressed', 'true');

      const refetchPromise = page.waitForResponse(
        (resp) =>
          resp.url().includes('/api/budget/breakdown') && resp.url().includes('deselectedSources='),
      );
      await row.click();
      await expect(row).toHaveAttribute('aria-pressed', 'false');
      await refetchPromise;

      // The deselected row remains in the DOM and visible in dark mode —
      // styling is driven by the [aria-pressed="false"] attribute selector,
      // not by toggling a CSS class.
      await expect(row).toBeVisible();
    } finally {
      await teardown();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Responsive layout
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Responsive layout', { tag: '@responsive' }, () => {
  test('No horizontal scroll at current viewport after expanding Available Funds', async ({
    page,
  }) => {
    const overviewPage = new BudgetOverviewPage(page);
    const teardown = await mountOverviewRoutes(
      page,
      makeBudgetOverviewResponse(),
      makeBreakdownResponse({ includeSourceB: true }),
    );

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      await overviewPage.availableFundsButton().click();

      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      expect(hasHorizontalScroll).toBe(false);
    } finally {
      await teardown();
    }
  });

  test('Source badge visible at all viewports', async ({ page }) => {
    const overviewPage = new BudgetOverviewPage(page);
    const teardown = await mountOverviewRoutes(
      page,
      makeBudgetOverviewResponse(),
      makeBreakdownResponse(),
    );

    try {
      await expandToLevel3(overviewPage);

      const lineA1Row = overviewPage.costBreakdownCard
        .getByRole('row')
        .filter({ hasText: 'Line A1 (Source A)' });

      const badge = lineA1Row.locator('[aria-label="Budget source: Bank Loan"]');
      await expect(badge).toBeAttached();

      const viewportWidth = page.viewportSize()?.width ?? 1920;
      if (viewportWidth <= 767) {
        // Mobile: dot visible, label wrapper hidden
        const dotSpan = lineA1Row.locator('[class*="sourceBadgeDot"]');
        await expect(dotSpan).toBeVisible();

        const labelSpan = lineA1Row.locator('[class*="sourceBadgeLabel"]');
        await expect(labelSpan).toBeHidden();

        // aria-label still in DOM for SR
        await expect(badge).toBeAttached();
      }
    } finally {
      await teardown();
    }
  });

  test('Source row touch target >= 44px on mobile viewport', async ({ page }) => {
    const overviewPage = new BudgetOverviewPage(page);
    const teardown = await mountOverviewRoutes(
      page,
      makeBudgetOverviewResponse(),
      makeBreakdownResponse(),
    );

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      await overviewPage.availableFundsButton().click();

      const row = overviewPage.sourceRow('Bank Loan');
      await expect(row).toBeVisible();

      const box = await row.boundingBox();
      expect(box).not.toBeNull();

      const viewportWidth = page.viewportSize()?.width ?? 1920;
      if (viewportWidth <= 767) {
        // Mobile: touch target must be >= 44px
        expect(box!.height).toBeGreaterThanOrEqual(44);
      } else {
        expect(box!.height).toBeGreaterThan(0);
      }
    } finally {
      await teardown();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Filter-aware summary rows (Available Funds + Remaining Budget)
// AC refs: #4 (restore on re-select), #5 (zero sources), #8 (print hiding)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Filter-aware summary rows (Available Funds + Remaining Budget)', () => {
  /**
   * Build a breakdown with two real sources (Source A: 150 000, Source B: 100 000)
   * and a deterministic projected cost (rawProjectedMin === rawProjectedMax === 20 000)
   * so that "avg" perspective gives the same value as min and max.
   * Unassigned has totalAmount=0 and does not affect the Available Funds total.
   */
  function makeTwoSourceBreakdown() {
    return {
      workItems: {
        areas: [
          {
            areaId: 'area-main',
            name: 'Main Area',
            parentId: null,
            color: '#3B82F6',
            projectedMin: 20000,
            projectedMax: 20000,
            actualCost: 0,
            subsidyPayback: 0,
            rawProjectedMin: 20000,
            rawProjectedMax: 20000,
            minSubsidyPayback: 0,
            items: [
              {
                workItemId: 'wi-main-1',
                title: 'Main Work Item',
                projectedMin: 20000,
                projectedMax: 20000,
                actualCost: 0,
                subsidyPayback: 0,
                rawProjectedMin: 20000,
                rawProjectedMax: 20000,
                minSubsidyPayback: 0,
                costDisplay: 'projected',
                budgetLines: [
                  {
                    id: 'line-a1',
                    description: 'Line A1',
                    plannedAmount: 10000,
                    confidence: 'own_estimate',
                    actualCost: 0,
                    hasInvoice: false,
                    isQuotation: false,
                    budgetSourceId: SOURCE_A_ID,
                  },
                  {
                    id: 'line-b1',
                    description: 'Line B1',
                    plannedAmount: 10000,
                    confidence: 'own_estimate',
                    actualCost: 0,
                    hasInvoice: false,
                    isQuotation: false,
                    budgetSourceId: SOURCE_B_ID,
                  },
                ],
              },
            ],
            children: [],
          },
        ],
        totals: {
          projectedMin: 20000,
          projectedMax: 20000,
          actualCost: 0,
          subsidyPayback: 0,
          rawProjectedMin: 20000,
          rawProjectedMax: 20000,
          minSubsidyPayback: 0,
        },
      },
      householdItems: {
        areas: [],
        totals: makeEmptyTotals(),
      },
      subsidyAdjustments: [],
      budgetSources: [
        {
          id: SOURCE_A_ID,
          name: 'Bank Loan',
          totalAmount: 150000,
          projectedMin: 10000,
          projectedMax: 10000,
          subsidyPaybackMin: 0,
          subsidyPaybackMax: 0,
        },
        {
          id: SOURCE_B_ID,
          name: 'Equity',
          totalAmount: 100000,
          projectedMin: 10000,
          projectedMax: 10000,
          subsidyPaybackMin: 0,
          subsidyPaybackMax: 0,
        },
      ],
    };
  }

  /**
   * Filtered breakdown returned when Source B (Equity) is deselected.
   * Server prunes Source B lines — only Source A lines remain.
   * budgetSources still contains both (server always returns unfiltered projectedMin/Max),
   * so source toggle rows remain visible after the refetch.
   */
  function makeTwoSourceBreakdownEquityDeselected() {
    return {
      workItems: {
        areas: [
          {
            areaId: 'area-main',
            name: 'Main Area',
            parentId: null,
            color: '#3B82F6',
            projectedMin: 10000,
            projectedMax: 10000,
            actualCost: 0,
            subsidyPayback: 0,
            rawProjectedMin: 10000,
            rawProjectedMax: 10000,
            minSubsidyPayback: 0,
            items: [
              {
                workItemId: 'wi-main-1',
                title: 'Main Work Item',
                projectedMin: 10000,
                projectedMax: 10000,
                actualCost: 0,
                subsidyPayback: 0,
                rawProjectedMin: 10000,
                rawProjectedMax: 10000,
                minSubsidyPayback: 0,
                costDisplay: 'projected',
                budgetLines: [
                  {
                    id: 'line-a1',
                    description: 'Line A1',
                    plannedAmount: 10000,
                    confidence: 'own_estimate',
                    actualCost: 0,
                    hasInvoice: false,
                    isQuotation: false,
                    budgetSourceId: SOURCE_A_ID,
                  },
                ],
              },
            ],
            children: [],
          },
        ],
        totals: {
          projectedMin: 10000,
          projectedMax: 10000,
          actualCost: 0,
          subsidyPayback: 0,
          rawProjectedMin: 10000,
          rawProjectedMax: 10000,
          minSubsidyPayback: 0,
        },
      },
      householdItems: {
        areas: [],
        totals: makeEmptyTotals(),
      },
      subsidyAdjustments: [],
      // Server returns both sources regardless of filter
      budgetSources: [
        {
          id: SOURCE_A_ID,
          name: 'Bank Loan',
          totalAmount: 150000,
          projectedMin: 10000,
          projectedMax: 10000,
          subsidyPaybackMin: 0,
          subsidyPaybackMax: 0,
        },
        {
          id: SOURCE_B_ID,
          name: 'Equity',
          totalAmount: 100000,
          projectedMin: 10000,
          projectedMax: 10000,
          subsidyPaybackMin: 0,
          subsidyPaybackMax: 0,
        },
      ],
    };
  }

  test('Scenario 1 — Available Funds updates when a source is deselected', async ({ page }) => {
    // Source A: totalAmount=150 000, Source B: totalAmount=100 000 → combined=250 000.
    // After deselecting Source B (Equity): filteredAvailableFunds = 150 000 (Source A only).
    const overviewPage = new BudgetOverviewPage(page);
    const teardown = await mountOverviewRoutes(
      page,
      makeBudgetOverviewResponse(),
      makeTwoSourceBreakdown(),
      makeTwoSourceBreakdownEquityDeselected(),
    );

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      // Initial state: both sources selected → Available Funds = 250 000
      const afValue = overviewPage.availableFundsValue();
      await expect(afValue).toBeVisible();
      const initialText = await afValue.textContent();
      // Combined total must contain "250" (as in €250,000)
      expect(initialText).toContain('250');

      // Expand source rows
      await overviewPage.availableFundsButton().click();

      // Deselect Equity — register waitForResponse BEFORE the click
      const refetchPromise = page.waitForResponse(
        (resp) =>
          resp.url().includes('/api/budget/breakdown') && resp.url().includes('deselectedSources='),
      );
      await overviewPage.sourceRow('Equity').click();
      await expect(overviewPage.sourceRow('Equity')).toHaveAttribute('aria-pressed', 'false');
      await refetchPromise;

      // Available Funds now shows only Source A total (150 000)
      const filteredText = await afValue.textContent();
      expect(filteredText).toContain('150');
      // Must NOT still show 250 (combined)
      expect(filteredText).not.toContain('250');
    } finally {
      await teardown();
    }
  });

  test('Scenario 2 — Remaining Budget Cost updates when a source is deselected', async ({
    page,
  }) => {
    // Source A: totalAmount=150 000, Source B: totalAmount=100 000
    // Initial (both selected): totalRawProjected = (20 000+20 000)/2 = 20 000
    //   Remaining Budget Cost = 250 000 - 20 000 = 230 000
    // After deselecting Source B (Equity): server returns filtered breakdown with
    //   wiTotals.rawProjectedMin/Max = 10 000 → totalRawProjected = 10 000
    //   filteredAvailableFunds = 150 000 (Bank Loan only)
    //   Remaining Budget Cost = 150 000 - 10 000 = 140 000
    const overviewPage = new BudgetOverviewPage(page);
    const teardown = await mountOverviewRoutes(
      page,
      makeBudgetOverviewResponse(),
      makeTwoSourceBreakdown(),
      makeTwoSourceBreakdownEquityDeselected(),
    );

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      // Locate the "Remaining Budget" row by its label text
      const remainingRow = overviewPage.costBreakdownCard
        .getByRole('row')
        .filter({ hasText: /remaining budget/i });

      // Remaining Budget Cost cell (td index 1 = "Cost" column)
      const costCell = remainingRow.locator('td').nth(1);
      await expect(costCell).toBeVisible();
      const initialText = await costCell.textContent();
      // Should reflect 230 000 (250 000 - 20 000)
      expect(initialText).toContain('230');

      // Expand source rows
      await overviewPage.availableFundsButton().click();

      // Deselect Equity — register waitForResponse BEFORE the click
      const refetchPromise = page.waitForResponse(
        (resp) =>
          resp.url().includes('/api/budget/breakdown') && resp.url().includes('deselectedSources='),
      );
      await overviewPage.sourceRow('Equity').click();
      await expect(overviewPage.sourceRow('Equity')).toHaveAttribute('aria-pressed', 'false');
      await refetchPromise;

      // Remaining Budget Cost = 150 000 - 10 000 = 140 000
      const filteredText = await costCell.textContent();
      expect(filteredText).toContain('140');
      expect(filteredText).not.toContain('230');
    } finally {
      await teardown();
    }
  });

  test('Scenario 3 — Available Funds restores to full total on re-select (AC #4)', async ({
    page,
  }) => {
    // Start with Source B (Equity) deselected via URL — Available Funds = 150 000 (Source A only).
    // Re-select Equity → refetch fires without deselectedSources → Available Funds = 250 000.
    const overviewPage = new BudgetOverviewPage(page);
    const teardown = await mountOverviewRoutes(
      page,
      makeBudgetOverviewResponse(),
      makeTwoSourceBreakdown(),
      makeTwoSourceBreakdownEquityDeselected(),
    );

    try {
      // Navigate with Equity pre-deselected
      await page.goto(`${BUDGET_OVERVIEW_ROUTE}?deselectedSources=${SOURCE_B_ID}`);
      await overviewPage.waitForLoaded();

      const afValue = overviewPage.availableFundsValue();
      await expect(afValue).toBeVisible();

      // Pre-deselected state: Available Funds = 150 000 (Bank Loan only)
      const deselectedText = await afValue.textContent();
      expect(deselectedText).toContain('150');

      // Expand and re-select Equity
      await overviewPage.availableFundsButton().click();
      await expect(overviewPage.sourceRow('Equity')).toHaveAttribute('aria-pressed', 'false');

      const reSelectPromise = page.waitForResponse(
        (resp) =>
          resp.url().includes('/api/budget/breakdown') &&
          !resp.url().includes('deselectedSources='),
      );
      await overviewPage.sourceRow('Equity').click();
      await expect(overviewPage.sourceRow('Equity')).toHaveAttribute('aria-pressed', 'true');
      await reSelectPromise;

      // Available Funds restored to 250 000 (both sources selected)
      const restoredText = await afValue.textContent();
      expect(restoredText).toContain('250');
      expect(restoredText).not.toContain('150');
    } finally {
      await teardown();
    }
  });

  test('Scenario 4 — Zero sources selected: Available Funds shows €0 (AC #5)', async ({ page }) => {
    // When all sources are deselected, filteredAvailableFunds = 0.
    // Server returns empty areas (all lines belong to deselected sources).
    // The Available Funds row must show €0.00 — not NaN and not the stale combined value.
    const overviewPage = new BudgetOverviewPage(page);

    // Use makeBreakdownSourceAOnly (single source: Bank Loan, totalAmount=150 000).
    // Filtered response is makeFilteredEmptyBreakdown which has empty areas[].
    const teardown = await mountOverviewRoutes(
      page,
      makeBudgetOverviewResponse(),
      makeBreakdownSourceAOnly(),
      makeFilteredEmptyBreakdown(),
    );

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      await overviewPage.availableFundsButton().click();

      // Deselect the only source (Bank Loan)
      const refetchPromise = page.waitForResponse(
        (resp) =>
          resp.url().includes('/api/budget/breakdown') && resp.url().includes('deselectedSources='),
      );
      await overviewPage.sourceRow('Bank Loan').click();
      await expect(overviewPage.sourceRow('Bank Loan')).toHaveAttribute('aria-pressed', 'false');
      await refetchPromise;

      // Available Funds must show €0.00 — not NaN, not the stale 150 000 value
      const afValue = overviewPage.availableFundsValue();
      const valueText = await afValue.textContent();
      // Must contain "0" as a number (e.g. "€0.00" or "€0,00")
      expect(valueText).toMatch(/\b0\b|0,00|0\.00/);
      // Must not contain "NaN"
      expect(valueText).not.toContain('NaN');
      // Must not contain the stale 150 000 total
      expect(valueText).not.toContain('150');
    } finally {
      await teardown();
    }
  });

  test('Scenario 5 — Print: deselected source rows hidden, selected source rows visible (AC #8)', async ({
    page,
  }) => {
    // The @media print rule `.rowSourceDetailToggle[aria-pressed='false'] { display: none !important }`
    // must hide deselected source rows in print and leave selected rows visible.
    const overviewPage = new BudgetOverviewPage(page);
    const teardown = await mountOverviewRoutes(
      page,
      makeBudgetOverviewResponse(),
      makeTwoSourceBreakdown(),
      makeTwoSourceBreakdownEquityDeselected(),
    );

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      // Expand Available Funds section to show source toggle rows
      await overviewPage.availableFundsButton().click();
      await expect(overviewPage.sourceRow('Bank Loan')).toBeVisible();
      await expect(overviewPage.sourceRow('Equity')).toBeVisible();

      // Deselect Equity — register waitForResponse BEFORE the click
      const refetchPromise = page.waitForResponse(
        (resp) =>
          resp.url().includes('/api/budget/breakdown') && resp.url().includes('deselectedSources='),
      );
      await overviewPage.sourceRow('Equity').click();
      await expect(overviewPage.sourceRow('Equity')).toHaveAttribute('aria-pressed', 'false');
      await refetchPromise;

      // Switch to print media
      await page.emulateMedia({ media: 'print' });

      try {
        // Deselected source row (Equity, aria-pressed='false') must be hidden by @media print
        await expect(overviewPage.sourceRow('Equity')).toHaveCSS('display', 'none');

        // Selected source row (Bank Loan, aria-pressed='true') must NOT be display:none
        const bankLoanDisplay = await overviewPage
          .sourceRow('Bank Loan')
          .evaluate((el) => getComputedStyle(el).display);
        expect(bankLoanDisplay).not.toBe('none');
      } finally {
        // Restore screen media — must be in finally to prevent print-mode from leaking
        // into subsequent tests running in the same worker.
        await page.emulateMedia({ media: 'screen' });
      }
    } finally {
      await teardown();
    }
  });
});
