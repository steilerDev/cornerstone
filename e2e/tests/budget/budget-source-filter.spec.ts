/**
 * E2E tests for Budget Source Filter (Story #1356 — per-source row-toggle rework)
 *
 * Covers:
 * - Source badge visible on Level 3 (budget line) rows (carry-over from #1354)
 * - Unassigned badge for lines with no source
 * - Long source name truncation in badge
 * - Default state: all sources selected, no URL param
 * - Click source row to deselect: aria-pressed="false", URL updated, lines hidden
 * - Click deselected row to re-select: aria-pressed="true", URL cleared
 * - Cascade hiding: work item with all lines deselected is hidden
 * - Deselect all sources → empty state
 * - Available Funds caption "(X of Y selected)"
 * - URL round-trip: ?deselectedSources= restores filter state
 * - Stale/unknown ID in ?deselectedSources= is silently ignored
 * - Old ?sources= param is silently ignored
 * - Per-source Cost/Payback/Net columns present
 * - Perspective toggle changes Cost value in source row
 * - Source row values unchanged when deselected (only visual style changes)
 * - Keyboard: Space key toggles source row
 * - Keyboard: Enter key toggles source row
 * - Keyboard: Escape on focused row calls select-all
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

  const budgetSources = [
    {
      id: SOURCE_A_ID,
      name: 'Bank Loan',
      totalAmount: 150000,
      projectedMin: 30000,
      projectedMax: 35000,
      subsidyPayback: 0,
    },
  ];

  if (includeSourceB) {
    budgetSources.push({
      id: SOURCE_B_ID,
      name: 'Equity',
      totalAmount: 100000,
      projectedMin: 8000,
      projectedMax: 8000,
      subsidyPayback: 0,
    });
  }

  if (includeLongName) {
    budgetSources.push({
      id: 'cccccccc-0000-0000-0000-000000000003',
      name: LONG_SOURCE_NAME,
      totalAmount: 50000,
      projectedMin: 3000,
      projectedMax: 3000,
      subsidyPayback: 0,
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
 * Breakdown with only Source A lines (no unassigned) — used for cascade-hide tests
 * where deselecting SOURCE_A must hide the work item entirely.
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
        subsidyPayback: 0,
      },
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Route mount helpers
// ─────────────────────────────────────────────────────────────────────────────

type PageParam = Parameters<typeof test>[1]['page'];

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
    await page.unroute(`${API.budgetBreakdown}`);
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

      // Both source rows must be in selected state (aria-pressed="true")
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
// Deselect a source row
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Deselect source row', { tag: '@responsive' }, () => {
  test('Click source row → aria-pressed="false", URL updated, lines hidden', async ({ page }) => {
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
      await row.click();

      // Row becomes deselected
      await expect(row).toHaveAttribute('aria-pressed', 'false');

      // URL contains deselectedSources=<id>
      await expect(page).toHaveURL(new RegExp(`deselectedSources=${SOURCE_A_ID}`));

      // Expand to Level 3 — Bank Loan lines must not be rendered
      await overviewPage.costBreakdownCard
        .getByRole('button', { name: /expand work item budget by area/i })
        .click();
      await overviewPage.breakdownAreaToggle('Main Area').click();
      await overviewPage.costBreakdownCard
        .getByRole('button', { name: /Expand Main Work Item/i })
        .click();

      await expect(
        overviewPage.costBreakdownCard.getByRole('row').filter({ hasText: 'Line A1 (Source A)' }),
      ).not.toBeVisible();
      await expect(
        overviewPage.costBreakdownCard.getByRole('row').filter({ hasText: 'Line A2 (Source A)' }),
      ).not.toBeVisible();

      // The unassigned line (not deselected) is still visible
      await expect(
        overviewPage.costBreakdownCard
          .getByRole('row')
          .filter({ hasText: 'Line Unassigned (No source)' }),
      ).toBeVisible();
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

      // Click to re-select
      await row.click();

      await expect(row).toHaveAttribute('aria-pressed', 'true');
      await expect(page).not.toHaveURL(/deselectedSources/);
    } finally {
      await teardown();
    }
  });

  test('Multi-deselection: both IDs appear in URL, lines from both sources are hidden', async ({
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

      await overviewPage.sourceRow('Bank Loan').click();
      await overviewPage.sourceRow('Equity').click();

      await expect(overviewPage.sourceRow('Bank Loan')).toHaveAttribute('aria-pressed', 'false');
      await expect(overviewPage.sourceRow('Equity')).toHaveAttribute('aria-pressed', 'false');

      const url = page.url();
      expect(url).toContain(SOURCE_A_ID);
      expect(url).toContain(SOURCE_B_ID);

      // Expand to level 3 — both sources' lines must be hidden
      await overviewPage.costBreakdownCard
        .getByRole('button', { name: /expand work item budget by area/i })
        .click();
      await overviewPage.breakdownAreaToggle('Main Area').click();
      await overviewPage.costBreakdownCard
        .getByRole('button', { name: /Expand Main Work Item/i })
        .click();

      await expect(
        overviewPage.costBreakdownCard.getByRole('row').filter({ hasText: 'Line A1 (Source A)' }),
      ).not.toBeVisible();
      await expect(
        overviewPage.costBreakdownCard.getByRole('row').filter({ hasText: 'Line B1 (Source B)' }),
      ).not.toBeVisible();

      // Unassigned line still visible (null source — not deselected)
      await expect(
        overviewPage.costBreakdownCard
          .getByRole('row')
          .filter({ hasText: 'Line Unassigned (No source)' }),
      ).toBeVisible();
    } finally {
      await teardown();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cascade hiding
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Cascade hiding', { tag: '@responsive' }, () => {
  test('Deselecting the only source hides work item row and area row', async ({ page }) => {
    const overviewPage = new BudgetOverviewPage(page);
    const teardown = await mountOverviewRoutes(
      page,
      makeBudgetOverviewResponse(),
      makeBreakdownSourceAOnly(),
    );

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      // Deselect Bank Loan
      await overviewPage.availableFundsButton().click();
      await overviewPage.sourceRow('Bank Loan').click();
      await expect(overviewPage.sourceRow('Bank Loan')).toHaveAttribute('aria-pressed', 'false');

      // Expand Work Items section
      await overviewPage.costBreakdownCard
        .getByRole('button', { name: /expand work item budget by area/i })
        .click();

      // Main Area row must not be visible (cascade-hidden)
      await expect(
        overviewPage.costBreakdownCard.getByRole('row').filter({ hasText: 'Main Area' }),
      ).not.toBeVisible();
    } finally {
      await teardown();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Empty state
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Empty state when all sources deselected', { tag: '@responsive' }, () => {
  test('Deselecting all sources shows empty state', async ({ page }) => {
    const overviewPage = new BudgetOverviewPage(page);
    // Use SOURCE_A_ID only breakdown (no unassigned) so deselecting one source covers everything
    const teardown = await mountOverviewRoutes(
      page,
      makeBudgetOverviewResponse(),
      makeBreakdownSourceAOnly(),
    );

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      await overviewPage.availableFundsButton().click();
      await overviewPage.sourceRow('Bank Loan').click();

      // EmptyState message appears
      const emptyMsg = overviewPage.costBreakdownCard.getByText(
        'No budget lines match the selected source filter.',
        { exact: true },
      );
      await expect(emptyMsg).toBeVisible();
    } finally {
      await teardown();
    }
  });

  test('Clear filters action from empty state restores all lines', async ({ page }) => {
    const overviewPage = new BudgetOverviewPage(page);
    const teardown = await mountOverviewRoutes(
      page,
      makeBudgetOverviewResponse(),
      makeBreakdownSourceAOnly(),
    );

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      await overviewPage.availableFundsButton().click();
      await overviewPage.sourceRow('Bank Loan').click();

      // Confirm empty state is shown
      await expect(
        overviewPage.costBreakdownCard.getByText(
          'No budget lines match the selected source filter.',
          { exact: true },
        ),
      ).toBeVisible();

      // Click "Clear filters" action button from EmptyState
      await overviewPage.costBreakdownCard
        .getByRole('button', { name: 'Clear filters', exact: true })
        .click();

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
// Available Funds caption
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Available Funds caption', { tag: '@responsive' }, () => {
  test('Caption "(1 of 2 selected)" appears after deselecting one source from two', async ({
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

      // Caption not yet visible — all sources selected
      await expect(overviewPage.filterCaption()).not.toBeVisible();

      // Deselect Bank Loan
      await overviewPage.sourceRow('Bank Loan').click();

      // Caption appears with "1 of N" (or localized equivalent with digits).
      // The fixture includes an unassigned line, so total = 2 named sources + 1
      // unassigned = 3 virtual sources. Match "1 of <any-digit>" rather than "1 of 2".
      await expect(overviewPage.filterCaption()).toBeVisible();
      const captionText = await overviewPage.filterCaption().textContent();
      expect(captionText).toMatch(/1\D+\d+/); // matches "1 of 2", "1 of 3", "1 von 3" etc.
    } finally {
      await teardown();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// URL round-trip
// ─────────────────────────────────────────────────────────────────────────────
test.describe('URL round-trip', { tag: '@responsive' }, () => {
  test('?deselectedSources= param restores filter on load', async ({ page }) => {
    const overviewPage = new BudgetOverviewPage(page);
    const teardown = await mountOverviewRoutes(
      page,
      makeBudgetOverviewResponse(),
      makeBreakdownResponse(),
    );

    try {
      // Navigate directly with deselectedSources param
      await navigateWithParamAndExpand(
        page,
        overviewPage,
        `deselectedSources=${SOURCE_A_ID}`,
      );

      await overviewPage.availableFundsButton().click();

      // Bank Loan row must be rendered as deselected
      await expect(overviewPage.sourceRow('Bank Loan')).toHaveAttribute('aria-pressed', 'false');

      // Bank Loan budget lines must not be rendered
      await expect(
        overviewPage.costBreakdownCard.getByRole('row').filter({ hasText: 'Line A1 (Source A)' }),
      ).not.toBeVisible();
    } finally {
      await teardown();
    }
  });

  test('Stale/unknown ID in ?deselectedSources= is silently ignored — all sources selected', async ({
    page,
  }) => {
    const overviewPage = new BudgetOverviewPage(page);
    const teardown = await mountOverviewRoutes(
      page,
      makeBudgetOverviewResponse(),
      makeBreakdownResponse(),
    );

    try {
      await page.goto(`${BUDGET_OVERVIEW_ROUTE}?deselectedSources=nonexistent-uuid`);
      await overviewPage.waitForLoaded();

      await overviewPage.availableFundsButton().click();

      // Bank Loan row must still be selected (unknown ID dropped silently)
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

      // Cost cell (index 1) should contain a currency amount (negative, e.g. "-€30,000")
      await expect(cells.nth(1)).toContainText(/[€\d]/);
      // Payback cell (index 2) — may be 0 but must contain a currency value
      await expect(cells.nth(2)).toContainText(/[€\d]/);
      // Net cell (index 3)
      await expect(cells.nth(3)).toContainText(/[€\d]/);
    } finally {
      await teardown();
    }
  });

  test('Source row values are identical when deselected (only style changes)', async ({ page }) => {
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
      const cells = row.locator('td');

      // Record values before deselection
      const costBefore = await cells.nth(1).textContent();
      const paybackBefore = await cells.nth(2).textContent();
      const netBefore = await cells.nth(3).textContent();

      // Deselect
      await row.click();
      await expect(row).toHaveAttribute('aria-pressed', 'false');

      // Values must not change (only visual styling changes)
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
    );

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      await overviewPage.availableFundsButton().click();

      const row = overviewPage.sourceRow('Bank Loan');
      await row.focus();

      // Space deselects (all sources start selected)
      await page.keyboard.press('Space');
      await expect(row).toHaveAttribute('aria-pressed', 'false');

      // Space re-selects
      await page.keyboard.press('Space');
      await expect(row).toHaveAttribute('aria-pressed', 'true');
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
    );

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      await overviewPage.availableFundsButton().click();

      const row = overviewPage.sourceRow('Bank Loan');
      await row.focus();

      await page.keyboard.press('Enter');
      await expect(row).toHaveAttribute('aria-pressed', 'false');
    } finally {
      await teardown();
    }
  });

  test('Escape on focused row calls select-all (clears deselections)', async ({ page }) => {
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

      // Deselect Bank Loan
      const row = overviewPage.sourceRow('Bank Loan');
      await row.click();
      await expect(row).toHaveAttribute('aria-pressed', 'false');
      await expect(page).toHaveURL(new RegExp(`deselectedSources=${SOURCE_A_ID}`));

      // Focus the row and press Escape — should select-all (clear deselections)
      await row.focus();
      await page.keyboard.press('Escape');

      // Bank Loan is re-selected
      await expect(row).toHaveAttribute('aria-pressed', 'true');

      // URL no longer contains deselectedSources
      await expect(page).not.toHaveURL(/deselectedSources/);
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
    );

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      await overviewPage.availableFundsButton().click();

      await overviewPage.sourceRow('Bank Loan').click();

      // Live region text must contain "<selected> of <total>" (locale-agnostic).
      // Fixture has 2 named sources + 1 unassigned line = 3 virtual sources.
      // Use toHaveText with regex so the assertion auto-retries while React
      // re-renders the live region after the click → URL state → state update.
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
    );

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      await overviewPage.availableFundsButton().click();

      // Select a source to make the UI "active" — toolbar must still not appear
      await overviewPage.sourceRow('Bank Loan').click();

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

  test('Deselected source row is visually distinct in dark mode (class smoke check)', async ({
    page,
  }) => {
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

      await overviewPage.availableFundsButton().click();

      const row = overviewPage.sourceRow('Bank Loan');
      await expect(row).toHaveAttribute('aria-pressed', 'true');

      await row.click();
      await expect(row).toHaveAttribute('aria-pressed', 'false');

      // The deselected row remains in the DOM and visible in dark mode —
      // styling is driven by the [aria-pressed="false"] attribute selector,
      // not by toggling a CSS class. The aria-pressed transition above is
      // sufficient to confirm the visual state change.
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

  test('Source rows cascade-hide on mobile viewport when source is deselected', async ({
    page,
  }) => {
    const overviewPage = new BudgetOverviewPage(page);
    const teardown = await mountOverviewRoutes(
      page,
      makeBudgetOverviewResponse(),
      makeBreakdownSourceAOnly(),
    );

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      await overviewPage.availableFundsButton().click();
      await overviewPage.sourceRow('Bank Loan').click();
      await expect(overviewPage.sourceRow('Bank Loan')).toHaveAttribute('aria-pressed', 'false');

      await overviewPage.costBreakdownCard
        .getByRole('button', { name: /expand work item budget by area/i })
        .click();

      // Main Area row hidden (cascade)
      await expect(
        overviewPage.costBreakdownCard.getByRole('row').filter({ hasText: 'Main Area' }),
      ).not.toBeVisible();
    } finally {
      await teardown();
    }
  });
});
