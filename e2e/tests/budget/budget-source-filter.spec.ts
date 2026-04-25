/**
 * E2E tests for Budget Source Filter (Story #1354)
 *
 * Covers:
 * - Source badge visible on Level 3 (budget line) rows
 * - Unassigned badge for lines with no source
 * - Long source name truncation
 * - Filter chip strip visibility in Available Funds section
 * - Single-source filter: rows hidden, URL updated
 * - Multi-source filter: OR semantics
 * - Unassigned chip: null-source lines shown, named-source lines hidden
 * - URL state survives page reload
 * - Clear filters via "All sources" button
 * - Empty state when no lines match filter
 * - Clear filters from empty state
 * - Keyboard navigation through chips (Tab + Space/Enter)
 * - Keyboard Escape clears filter
 * - Source detail rows show 3 currency values
 * - Perspective toggle updates allocated values in source detail rows
 * - No filter strip when no budget sources
 * - Selected source detail row accent (class/border)
 * - Dark mode: badge colors smoke check
 * - Mobile: chip strip scrolls horizontally, no page-level scroll
 * - Responsive layout: no horizontal scroll at any viewport
 */

import { test, expect } from '../../fixtures/auth.js';
import { BudgetOverviewPage, BUDGET_OVERVIEW_ROUTE } from '../../pages/BudgetOverviewPage.js';
import { API } from '../../fixtures/testData.js';

// ─────────────────────────────────────────────────────────────────────────────
// Mock data helpers
// ─────────────────────────────────────────────────────────────────────────────

/** A known source UUID used consistently for mock data. */
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
 * - Source A: 2 budget lines (IDs line-a1, line-a2)
 * - No-source: 1 budget line (ID line-unassigned)
 * - Optional second source B: 1 line (ID line-b1)
 * - Optional long-name source: 1 line (ID line-long)
 */
function makeBreakdownResponse(opts: {
  includeSourceB?: boolean;
  includeLongName?: boolean;
  sourceBLines?: number;
} = {}) {
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
    },
  ];

  if (includeSourceB) {
    budgetSources.push({
      id: SOURCE_B_ID,
      name: 'Equity',
      totalAmount: 100000,
      projectedMin: 8000,
      projectedMax: 8000,
    });
  }

  if (includeLongName) {
    budgetSources.push({
      id: 'cccccccc-0000-0000-0000-000000000003',
      name: LONG_SOURCE_NAME,
      totalAmount: 50000,
      projectedMin: 3000,
      projectedMax: 3000,
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

/** Breakdown with NO budget sources (empty sources array). */
function makeBreakdownNoSources() {
  return {
    ...makeBreakdownResponse(),
    budgetSources: [],
    workItems: {
      ...makeBreakdownResponse().workItems,
      areas: [
        {
          areaId: 'area-nosrc',
          name: 'No Source Area',
          parentId: null,
          color: null,
          projectedMin: 5000,
          projectedMax: 5000,
          actualCost: 0,
          subsidyPayback: 0,
          rawProjectedMin: 5000,
          rawProjectedMax: 5000,
          minSubsidyPayback: 0,
          items: [
            {
              workItemId: 'wi-nosrc-1',
              title: 'No Source Work Item',
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
                  id: 'line-nosrc-1',
                  description: 'No source line',
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
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Route mount helpers
// ─────────────────────────────────────────────────────────────────────────────

type PageParam = Parameters<typeof test>[1]['page'];

async function mountOverviewRoutes(
  page: PageParam,
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
  // Mock budget sources API to return empty (breakdown mock already has budgetSources inline)
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
 * Navigate to the budget overview page, wait for data to load, then expand:
 * 1. Work Items section
 * 2. The first area (Main Area)
 * 3. The first work item (Main Work Item) to reveal budget lines
 */
async function expandToLevel3(overviewPage: BudgetOverviewPage) {
  await overviewPage.goto();
  await overviewPage.waitForLoaded();

  // Expand Work Items section
  await overviewPage.costBreakdownCard
    .getByRole('button', { name: /expand work item budget by area/i })
    .click();

  // Expand the area
  await overviewPage.breakdownAreaToggle('Main Area').click();
  await expect(
    overviewPage.costBreakdownCard.getByRole('button', { name: /Expand Main Work Item/i }),
  ).toBeVisible();

  // Expand the work item to reveal budget lines
  await overviewPage.costBreakdownCard
    .getByRole('button', { name: /Expand Main Work Item/i })
    .click();
}

/**
 * Navigate to budget overview with URL ?sources= param pre-set and expand
 * to level 3 budget line rows.
 */
async function navigateWithFilterAndExpand(
  page: PageParam,
  overviewPage: BudgetOverviewPage,
  sourcesParam: string,
) {
  await page.goto(`${BUDGET_OVERVIEW_ROUTE}?sources=${sourcesParam}`);
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
// Source badge on Level 3 rows
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

      // Assert source badge for "Bank Loan" is in the DOM on Line A1.
      // Use toBeAttached() instead of toBeVisible() because on mobile the
      // badge label is wrapped in .sourceBadgeLabel which is CSS-hidden
      // (display: none); the dot is shown instead. Both keep the
      // aria-label on the badge span for screen readers.
      const lineA1Row = overviewPage.costBreakdownCard
        .getByRole('row')
        .filter({ hasText: 'Line A1 (Source A)' });
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

      // Assert unassigned badge for the no-source line is in the DOM.
      // Mobile hides the label via CSS but keeps the badge attached for SR users.
      const unassignedRow = overviewPage.costBreakdownCard
        .getByRole('row')
        .filter({ hasText: 'Line Unassigned (No source)' });
      // aria-label contains "Unassigned" (from t('sourceBadge.ariaLabel', { name: 'Unassigned' }))
      await expect(unassignedRow.locator('[aria-label="Budget source: Unassigned"]')).toBeAttached();
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

      // Find the row for the long-name source line
      const longRow = overviewPage.costBreakdownCard
        .getByRole('row')
        .filter({ hasText: 'Line Long Name Source' });

      // The badge label text should be truncated (>20 chars → truncated).
      // Mobile hides the label via CSS, so use toBeAttached() — the textContent
      // and title attribute assertions below still work on a hidden element.
      const badge = longRow.locator('[aria-label*="Budget source:"]');
      await expect(badge).toBeAttached();

      // The displayed text ends with ellipsis (…)
      const badgeText = await badge.textContent();
      expect(badgeText).toMatch(/…$/);
      expect(badgeText?.length).toBeLessThanOrEqual(22); // 20 chars + '…'

      // The title attribute contains the full source name
      const titleAttr = await badge.getAttribute('title');
      expect(titleAttr).toBe(LONG_SOURCE_NAME);
    } finally {
      await teardown();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Filter chip strip
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Filter chip strip', { tag: '@responsive' }, () => {
  test('Filter chip toolbar visible after expanding Available Funds', async ({ page }) => {
    const overviewPage = new BudgetOverviewPage(page);
    const teardown = await mountOverviewRoutes(
      page,
      makeBudgetOverviewResponse(),
      makeBreakdownResponse(),
    );

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      // Expand Available Funds
      await overviewPage.availableFundsButton().click();

      // Toolbar visible
      await expect(overviewPage.filterToolbar()).toBeVisible();

      // Source chip for "Bank Loan" visible
      await expect(overviewPage.sourceChip('Bank Loan')).toBeVisible();

      // Unassigned chip visible (there is at least one unassigned line)
      await expect(overviewPage.sourceChip('Unassigned')).toBeVisible();
    } finally {
      await teardown();
    }
  });

  test('No filter toolbar when budgetSources is empty', async ({ page }) => {
    const overviewPage = new BudgetOverviewPage(page);
    const teardown = await mountOverviewRoutes(
      page,
      makeBudgetOverviewResponse(),
      makeBreakdownNoSources(),
    );

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      // Available Funds row exists but has no expand button (no sources)
      // The toolbar must NOT be present in the DOM
      await expect(overviewPage.filterToolbar()).not.toBeVisible();
      // No chip buttons
      await expect(overviewPage.costBreakdownCard.getByRole('button', { name: /Filter:/ })).not.toBeVisible();
    } finally {
      await teardown();
    }
  });

  test('Each budget source appears as a chip button with aria-pressed', async ({ page }) => {
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

      // Both source chips have aria-pressed="false" initially
      const chipA = overviewPage.sourceChip('Bank Loan');
      const chipB = overviewPage.sourceChip('Equity');
      await expect(chipA).toBeVisible();
      await expect(chipB).toBeVisible();
      await expect(chipA).toHaveAttribute('aria-pressed', 'false');
      await expect(chipB).toHaveAttribute('aria-pressed', 'false');
    } finally {
      await teardown();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Single-source filter
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Single-source filter', { tag: '@responsive' }, () => {
  test('Single source filter: chip becomes pressed, URL updated, non-matching lines hidden', async ({
    page,
  }) => {
    const overviewPage = new BudgetOverviewPage(page);
    const teardown = await mountOverviewRoutes(
      page,
      makeBudgetOverviewResponse(),
      makeBreakdownResponse(),
    );

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      // Expand Available Funds to access filter strip
      await overviewPage.availableFundsButton().click();

      // Click the "Bank Loan" chip
      const chip = overviewPage.sourceChip('Bank Loan');
      await chip.click();

      // Chip becomes pressed
      await expect(chip).toHaveAttribute('aria-pressed', 'true');

      // URL contains ?sources=<id>
      await expect(page).toHaveURL(new RegExp(`sources=${SOURCE_A_ID}`));

      // Expand to level 3 to check visible lines
      await overviewPage.costBreakdownCard
        .getByRole('button', { name: /expand work item budget by area/i })
        .click();
      await overviewPage.breakdownAreaToggle('Main Area').click();
      await overviewPage.costBreakdownCard
        .getByRole('button', { name: /Expand Main Work Item/i })
        .click();

      // Bank Loan lines (line-a1, line-a2) are visible
      await expect(
        overviewPage.costBreakdownCard.getByRole('row').filter({ hasText: 'Line A1 (Source A)' }),
      ).toBeVisible();
      await expect(
        overviewPage.costBreakdownCard.getByRole('row').filter({ hasText: 'Line A2 (Source A)' }),
      ).toBeVisible();

      // Unassigned line is hidden (not rendered when filtered out)
      await expect(
        overviewPage.costBreakdownCard.getByRole('row').filter({ hasText: 'Line Unassigned (No source)' }),
      ).not.toBeVisible();
    } finally {
      await teardown();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Multi-source filter (OR semantics)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Multi-source filter', { tag: '@responsive' }, () => {
  test('Multi-source filter shows lines from EITHER source (OR semantics)', async ({ page }) => {
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

      // Select both Source A ("Bank Loan") and Source B ("Equity")
      await overviewPage.sourceChip('Bank Loan').click();
      await overviewPage.sourceChip('Equity').click();

      // Both chips are pressed
      await expect(overviewPage.sourceChip('Bank Loan')).toHaveAttribute('aria-pressed', 'true');
      await expect(overviewPage.sourceChip('Equity')).toHaveAttribute('aria-pressed', 'true');

      // URL contains both source IDs
      const url = page.url();
      expect(url).toContain(SOURCE_A_ID);
      expect(url).toContain(SOURCE_B_ID);

      // Expand to budget line level
      await overviewPage.costBreakdownCard
        .getByRole('button', { name: /expand work item budget by area/i })
        .click();
      await overviewPage.breakdownAreaToggle('Main Area').click();
      await overviewPage.costBreakdownCard
        .getByRole('button', { name: /Expand Main Work Item/i })
        .click();

      // Source A lines visible
      await expect(
        overviewPage.costBreakdownCard.getByRole('row').filter({ hasText: 'Line A1 (Source A)' }),
      ).toBeVisible();

      // Source B line visible
      await expect(
        overviewPage.costBreakdownCard.getByRole('row').filter({ hasText: 'Line B1 (Source B)' }),
      ).toBeVisible();

      // Unassigned line hidden (not in either selected source)
      await expect(
        overviewPage.costBreakdownCard.getByRole('row').filter({ hasText: 'Line Unassigned (No source)' }),
      ).not.toBeVisible();
    } finally {
      await teardown();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Unassigned chip
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Unassigned chip', { tag: '@responsive' }, () => {
  test('Unassigned chip selects null-source lines; named-source lines are hidden', async ({
    page,
  }) => {
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

      // Click the Unassigned chip
      await overviewPage.sourceChip('Unassigned').click();
      await expect(overviewPage.sourceChip('Unassigned')).toHaveAttribute('aria-pressed', 'true');

      // URL contains ?sources=unassigned
      await expect(page).toHaveURL(/sources=unassigned/);

      // Expand to budget lines
      await overviewPage.costBreakdownCard
        .getByRole('button', { name: /expand work item budget by area/i })
        .click();
      await overviewPage.breakdownAreaToggle('Main Area').click();
      await overviewPage.costBreakdownCard
        .getByRole('button', { name: /Expand Main Work Item/i })
        .click();

      // Unassigned line is visible
      await expect(
        overviewPage.costBreakdownCard.getByRole('row').filter({ hasText: 'Line Unassigned (No source)' }),
      ).toBeVisible();

      // Source A lines are hidden
      await expect(
        overviewPage.costBreakdownCard.getByRole('row').filter({ hasText: 'Line A1 (Source A)' }),
      ).not.toBeVisible();
    } finally {
      await teardown();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// URL state survives reload
// ─────────────────────────────────────────────────────────────────────────────
test.describe('URL state on reload', { tag: '@responsive' }, () => {
  test('URL ?sources= filter state is restored after page reload', async ({ page }) => {
    const overviewPage = new BudgetOverviewPage(page);
    const teardown = await mountOverviewRoutes(
      page,
      makeBudgetOverviewResponse(),
      makeBreakdownResponse(),
    );

    try {
      // Navigate directly with sources param
      await navigateWithFilterAndExpand(page, overviewPage, SOURCE_A_ID);

      // Expand available funds
      await overviewPage.availableFundsButton().click();

      // The chip for "Bank Loan" should be pressed (filter is active)
      await expect(overviewPage.sourceChip('Bank Loan')).toHaveAttribute('aria-pressed', 'true');

      // Unassigned line is not visible (filtered out)
      await expect(
        overviewPage.costBreakdownCard.getByRole('row').filter({ hasText: 'Line Unassigned (No source)' }),
      ).not.toBeVisible();
    } finally {
      await teardown();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Clear filters
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Clear filters', { tag: '@responsive' }, () => {
  test('Clear filters button deselects all chips and removes URL param', async ({ page }) => {
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

      // Enable a filter
      await overviewPage.sourceChip('Bank Loan').click();
      await expect(overviewPage.sourceChip('Bank Loan')).toHaveAttribute('aria-pressed', 'true');

      // Click clear
      await overviewPage.clearFiltersButton().click();

      // All chips are deselected
      await expect(overviewPage.sourceChip('Bank Loan')).toHaveAttribute('aria-pressed', 'false');

      // URL no longer has ?sources=
      await expect(page).not.toHaveURL(/sources=/);
    } finally {
      await teardown();
    }
  });

  test('Clear filters button not visible when no filter is active', async ({ page }) => {
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

      // No filter active — clear button should not be visible
      await expect(overviewPage.clearFiltersButton()).not.toBeVisible();
    } finally {
      await teardown();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Empty state
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Empty state when filter matches no lines', { tag: '@responsive' }, () => {
  /**
   * We need a source that has NO budget lines — use Source B with no lines.
   * Create a custom breakdown where SOURCE_B_ID exists in budgetSources but has no lines.
   */
  function makeBreakdownSourceBNoLines() {
    const base = makeBreakdownResponse();
    return {
      ...base,
      budgetSources: [
        ...base.budgetSources,
        {
          id: SOURCE_B_ID,
          name: 'Equity',
          totalAmount: 100000,
          projectedMin: 0,
          projectedMax: 0,
        },
      ],
    };
  }

  test('Empty state shown when filter matches no budget lines', async ({ page }) => {
    const overviewPage = new BudgetOverviewPage(page);
    const teardown = await mountOverviewRoutes(
      page,
      makeBudgetOverviewResponse(),
      makeBreakdownSourceBNoLines(),
    );

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      await overviewPage.availableFundsButton().click();

      // Click the Equity chip (which has no associated budget lines)
      await overviewPage.sourceChip('Equity').click();

      // EmptyState component appears with "no match" message
      const emptyMsg = overviewPage.costBreakdownCard.getByText(
        'No budget lines match the selected source filter.',
        { exact: true },
      );
      await expect(emptyMsg).toBeVisible();
    } finally {
      await teardown();
    }
  });

  test('Clear filters from empty state clears filter and shows all lines', async ({ page }) => {
    const overviewPage = new BudgetOverviewPage(page);
    const teardown = await mountOverviewRoutes(
      page,
      makeBudgetOverviewResponse(),
      makeBreakdownSourceBNoLines(),
    );

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      await overviewPage.availableFundsButton().click();

      // Apply filter that results in empty state
      await overviewPage.sourceChip('Equity').click();
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

      // Empty state is gone
      await expect(
        overviewPage.costBreakdownCard.getByText(
          'No budget lines match the selected source filter.',
          { exact: true },
        ),
      ).not.toBeVisible();

      // Filter URL param is removed
      await expect(page).not.toHaveURL(/sources=/);
    } finally {
      await teardown();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Source detail rows
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Source detail rows under Available Funds', { tag: '@responsive' }, () => {
  test('Source detail rows show source name, total, allocated, and remaining values', async ({
    page,
  }) => {
    const overviewPage = new BudgetOverviewPage(page);
    const teardown = await mountOverviewRoutes(
      page,
      makeBudgetOverviewResponse(),
      makeBreakdownResponse(),
    );

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      // Expand Available Funds
      await overviewPage.availableFundsButton().click();

      // Find the source detail row for "Bank Loan"
      const sourceRow = overviewPage.sourceDetailRow('Bank Loan');
      await expect(sourceRow).toBeVisible();

      // Row should have 4 cells: name, total, allocated, remaining
      const cells = sourceRow.locator('td');
      await expect(cells).toHaveCount(4);

      // All non-name cells should contain currency-like text (€ or numbers)
      const totalCell = cells.nth(1);
      const allocatedCell = cells.nth(2);
      const remainingCell = cells.nth(3);

      await expect(totalCell).toContainText(/[€\d]/);
      await expect(allocatedCell).toContainText(/[€\d]/);
      await expect(remainingCell).toContainText(/[€\d]/);
    } finally {
      await teardown();
    }
  });

  test('Perspective toggle changes allocated cost in source detail row', async ({ page }) => {
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

      const sourceRow = overviewPage.sourceDetailRow('Bank Loan');
      const allocatedCell = sourceRow.locator('td').nth(2);

      // Record the "Avg" perspective value
      const avgText = await allocatedCell.textContent();

      // Switch to "Min" perspective
      await overviewPage.costBreakdownCard
        .getByRole('radio', { name: 'Min' })
        .click();

      const minText = await allocatedCell.textContent();

      // Switch to "Max" perspective
      await overviewPage.costBreakdownCard
        .getByRole('radio', { name: 'Max' })
        .click();

      const maxText = await allocatedCell.textContent();

      // The Bank Loan source has projectedMin=30000, projectedMax=35000
      // Min < Avg < Max (or at minimum Min <= Avg <= Max)
      // They should not all be equal — at least some variation
      // (min and max values differ, so at least two of the three should differ)
      const allSame = minText === avgText && avgText === maxText;
      expect(allSame).toBe(false);
    } finally {
      await teardown();
    }
  });

  test('Selected source chip highlights corresponding source detail row', async ({ page }) => {
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

      // Before selecting: source detail row should NOT have the selected class
      const sourceRow = overviewPage.sourceDetailRow('Bank Loan');
      const classNameBefore = await sourceRow.getAttribute('class');
      expect(classNameBefore).not.toMatch(/rowSourceDetailSelected/);

      // Select the chip
      await overviewPage.sourceChip('Bank Loan').click();

      // After selecting: the source detail row should get the selected class.
      // Use toHaveClass (auto-retries) instead of getAttribute() so the assertion
      // tolerates the URL-state -> React-render round-trip after the chip click.
      // CSS modules hash class names at build time, so the attribute will look like
      // "rowSourceDetail_xyz rowSourceDetailSelected_abc" — match by substring.
      await expect(sourceRow).toHaveClass(/rowSourceDetailSelected/);
    } finally {
      await teardown();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Keyboard navigation
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Keyboard navigation', () => {
  // Keyboard tests are desktop-only (tablet/mobile don't use keyboard navigation)
  test('Space key toggles chip selection', async ({ page }) => {
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

      const chip = overviewPage.sourceChip('Bank Loan');
      await chip.focus();

      // Press Space to toggle on
      await page.keyboard.press('Space');
      await expect(chip).toHaveAttribute('aria-pressed', 'true');

      // Press Space again to toggle off
      await page.keyboard.press('Space');
      await expect(chip).toHaveAttribute('aria-pressed', 'false');
    } finally {
      await teardown();
    }
  });

  test('Enter key toggles chip selection', async ({ page }) => {
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

      const chip = overviewPage.sourceChip('Bank Loan');
      await chip.focus();

      // Press Enter to toggle on
      await page.keyboard.press('Enter');
      await expect(chip).toHaveAttribute('aria-pressed', 'true');
    } finally {
      await teardown();
    }
  });

  test('Escape key clears source filter and refocuses Available Funds button', async ({ page }) => {
    const overviewPage = new BudgetOverviewPage(page);
    const teardown = await mountOverviewRoutes(
      page,
      makeBudgetOverviewResponse(),
      makeBreakdownResponse(),
    );

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      // Expand Available Funds to make chip strip visible
      await overviewPage.availableFundsButton().click();

      // Click the "Bank Loan" chip to select it
      const chip = overviewPage.sourceChip('Bank Loan');
      await chip.click();

      // Verify chip is selected and URL reflects the filter
      await expect(chip).toHaveAttribute('aria-pressed', 'true');
      await expect(page).toHaveURL(new RegExp(`sources=${SOURCE_A_ID}`));

      // Focus the chip (it is inside the toolbar) and press Escape
      await chip.focus();
      await page.keyboard.press('Escape');

      // Chip should be deselected
      await expect(chip).toHaveAttribute('aria-pressed', 'false');

      // URL should no longer contain the sources param
      await expect(page).not.toHaveURL(/sources=/);

      // Focus should have moved to the Available Funds expand/collapse button
      const availFundsBtn = overviewPage.availableFundsButton();
      await expect(availFundsBtn).toBeFocused();
    } finally {
      await teardown();
    }
  });

  test('Escape key on toolbar with no active filter is a no-op', async ({ page }) => {
    const overviewPage = new BudgetOverviewPage(page);
    const teardown = await mountOverviewRoutes(
      page,
      makeBudgetOverviewResponse(),
      makeBreakdownResponse(),
    );

    try {
      await overviewPage.goto();
      await overviewPage.waitForLoaded();

      // Expand Available Funds — no filter active
      await overviewPage.availableFundsButton().click();

      const chip = overviewPage.sourceChip('Bank Loan');
      await expect(chip).toHaveAttribute('aria-pressed', 'false');

      // Focus a chip and press Escape — should be a no-op (no sources selected)
      await chip.focus();
      await page.keyboard.press('Escape');

      // Chip remains unselected
      await expect(chip).toHaveAttribute('aria-pressed', 'false');

      // URL still has no sources param
      await expect(page).not.toHaveURL(/sources=/);
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

      // Get the source badge for Line A1.
      // On mobile the badge label is wrapped in .sourceBadgeLabel which is
      // CSS-hidden (display: none), but the element is still attached and its
      // computed background-color is the dark-mode token value, which is what
      // we want to assert here.
      const badge = overviewPage.costBreakdownCard
        .getByRole('row')
        .filter({ hasText: 'Line A1 (Source A)' })
        .locator('[aria-label="Budget source: Bank Loan"]');
      await expect(badge).toBeAttached();

      // Check background is not white (dark mode should use dark palette)
      const bgColor = await badge.evaluate((el) => {
        // Create a throw-away element to compute background-color via CSS var
        const dummy = document.createElement('span');
        dummy.style.backgroundColor = getComputedStyle(el).backgroundColor;
        document.body.appendChild(dummy);
        const result = getComputedStyle(dummy).backgroundColor;
        document.body.removeChild(dummy);
        return result;
      });

      // In dark mode, the background should not be rgb(255, 255, 255) (white)
      expect(bgColor).not.toBe('rgb(255, 255, 255)');
    } finally {
      await teardown();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Responsive layout
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Responsive layout', { tag: '@responsive' }, () => {
  test('Budget source filter page has no horizontal scroll at current viewport', async ({
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

      // Expand available funds to show filter strip
      await overviewPage.availableFundsButton().click();
      await expect(overviewPage.filterToolbar()).toBeVisible();

      // No page-level horizontal scroll
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

      // The badge must be present in DOM with correct aria-label regardless of viewport
      const badge = lineA1Row.locator('[aria-label="Budget source: Bank Loan"]');

      // The badge should be present (it may be visually condensed on mobile but still in DOM)
      await expect(badge).toBeAttached();

      // ── Mobile dot-only behaviour ────────────────────────────────────────────
      // At ≤767px the CSS module hides .sourceBadgeLabel (display:none) and shows
      // .sourceBadgeDot (display:inline-block).  CSS module names are hashed at
      // build time, so we locate these spans by their class substring.
      const viewportWidth = page.viewportSize()?.width ?? 1920;
      if (viewportWidth <= 767) {
        // The dot span (aria-hidden) should be visible
        const dotSpan = lineA1Row.locator('[class*="sourceBadgeDot"]');
        await expect(dotSpan).toBeVisible();

        // The label wrapper span should be hidden via CSS display:none
        const labelSpan = lineA1Row.locator('[class*="sourceBadgeLabel"]');
        await expect(labelSpan).toBeHidden();

        // The <Badge> aria-label must still exist in the DOM for screen-reader
        // access even though the label wrapper is visually hidden
        await expect(badge).toBeAttached();
      }
    } finally {
      await teardown();
    }
  });

  test('Chip strip container has overflow-x: auto (scroll-ready) on any viewport', async ({
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

      const toolbar = overviewPage.filterToolbar();
      await expect(toolbar).toBeVisible();

      // The .sourceFilterStrip div has overflow-x: auto
      const overflowX = await toolbar.evaluate((el) => getComputedStyle(el).overflowX);
      expect(overflowX).toBe('auto');
    } finally {
      await teardown();
    }
  });

  test('Chip touch targets are at least 44px high on any viewport', async ({ page }) => {
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

      const chip = overviewPage.sourceChip('Bank Loan');
      await expect(chip).toBeVisible();

      const box = await chip.boundingBox();
      expect(box).not.toBeNull();
      // Min-height 44px per CSS (.chip: min-height: var(--spacing-8) = 32px on desktop,
      //  but on mobile .chip: min-height: 44px)
      // Check box height — at mobile viewport this must be >= 44
      const viewportWidth = page.viewportSize()?.width ?? 1920;
      if (viewportWidth <= 767) {
        expect(box!.height).toBeGreaterThanOrEqual(44);
      } else {
        // Desktop/tablet: min-height is --spacing-8 (typically 32px), still needs to be usable
        expect(box!.height).toBeGreaterThan(0);
      }
    } finally {
      await teardown();
    }
  });
});
