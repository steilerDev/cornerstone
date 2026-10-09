/**
 * E2E tests for EPIC-09: Dashboard & Project Health Center (/project/overview)
 *
 * Scenarios covered:
 * 1.  Smoke: Dashboard page loads and shows h1 "Project"
 * 2.  All 10 card headings visible after data loads
 *     (Budget Summary, Source Utilization, Upcoming Milestones, Work Item Progress,
 *      Critical Path, Mini Gantt, Invoice Pipeline, Subsidy Pipeline, Recent Diary, Quick Actions)
 * 3.  Budget Summary card: shows available funds and remaining budget
 * 4.  Timeline cards: Upcoming Milestones, Work Item Progress, Critical Path
 * 5.  Quick Actions card: navigation links are clickable
 * 6.  Card dismiss: clicking dismiss hides a card; page reload keeps it hidden
 * 7.  Card re-enable: Customize dropdown shows hidden cards, clicking re-enables
 * 8.  Responsive mobile: primary cards visible, Timeline/Budget Details in collapsible sections
 * 9.  Keyboard navigation: Tab to Mini Gantt container, Enter navigates to /schedule
 * 10. Dark mode: page renders without horizontal scroll in dark mode
 * 11. No horizontal scroll on current viewport
 * 14. Home trust (#2193): D-01 milestone link opens the milestone page; D-02 invoice rows come from
 *     status-scoped requests and the empty state follows global counts; D-03 one budget scenario
 *     and Actual Spend = paid + claimed; D-04 no horizontal overflow from 320 to 1440 px
 */

import { test, expect } from '../../fixtures/isolatedUser.js';
import type {
  Invoice,
  InvoiceListPaginatedResponse,
  InvoiceStatusBreakdown,
} from '@cornerstone/shared';
import { DashboardPage, DASHBOARD_ROUTE, CARD_TITLES } from '../../pages/DashboardPage.js';
import { createMilestoneViaApi, deleteMilestoneViaApi } from '../../fixtures/apiHelpers.js';
import { MilestoneDetailPage } from '../../pages/MilestoneDetailPage.js';

// ─────────────────────────────────────────────────────────────────────────────
// Preference isolation (Issue #1957)
//
// Every test in this file depends on two per-user preference rows:
// `dashboard.hiddenCards` (which cards render) and `locale` (English card
// headings). Scenario 6/7 additionally WRITE `dashboard.hiddenCards` by clicking
// dismiss/re-enable, and the reset hook below writes both keys.
//
// Under `fullyParallel: true` all of that used to happen on the one shared admin
// user (test-results/.auth/admin.json), so any other spec touching those keys —
// diary-uat-fixes.spec.ts resets `dashboard.hiddenCards`, i18n.spec.ts flips
// `locale` — could land a write inside a test's assertion window from another
// worker, and this file's own reset hook could wipe out Scenario 6's dismissed
// state mid-test. `mode: 'serial'` cannot fix that: it only orders a file against
// itself.
//
// This file therefore runs against a dedicated user (see e2e/fixtures/isolatedUser.ts
// for the full mechanism and the audit of every preference-writing spec). One
// dedicated user per worker is enough: a Playwright worker executes one test at a
// time and no other worker shares the user, so no concurrent write to those rows
// is possible from anywhere in the suite. Sequential carry-over inside one worker
// is still possible (Scenario 6 leaves a card hidden for whatever test runs next
// in that worker), which is exactly what the reset hook below handles.
//
// The write/read path itself is correctly ordered and durable (dismissCard() awaits
// the PATCH response; preferencesService.upsertPreference() commits synchronously) —
// this was a test-isolation gap, never a product bug.
// ─────────────────────────────────────────────────────────────────────────────

test.use({
  isolatedUserPerWorker: { emailPrefix: 'dash', displayName: 'E2E Dashboard User' },
});

test.beforeEach(async ({ page }) => {
  // Reset this worker's dedicated user back to "no cards hidden" so a preceding
  // dismiss test in the same worker cannot leak into the next one.
  const resp = await page.request.patch('/api/users/me/preferences', {
    data: { key: 'dashboard.hiddenCards', value: '[]' },
  });
  // Ensure the preference reset succeeded — a failed PATCH leaves hidden cards
  // from a prior test, causing downstream dismiss tests to fail.
  expect(resp.ok(), `beforeEach: preference reset failed with ${resp.status()}`).toBeTruthy();

  // Force English regardless of the CI browser's default locale — every assertion
  // in this file matches English headings (e.g. "Quick Actions", not
  // "Schnellaktionen"). The dedicated user is seeded with locale='en' on creation;
  // this re-asserts it in case a test in this worker changed it.
  await page.request.patch('/api/users/me/preferences', {
    data: { key: 'locale', value: 'en' },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Mock data helpers
// ─────────────────────────────────────────────────────────────────────────────

function mockBudgetOverview() {
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
    remainingVsMinPlannedWithPayback: 0,
    remainingVsMaxPlannedWithPayback: 0,
    areaSummaries: [],
    unassignedSummary: null,
    subsidySummary: {
      totalReductions: 12500,
      activeSubsidyCount: 1,
      minTotalPayback: 0,
      maxTotalPayback: 0,
      oversubscribedSubsidies: [],
    },
  };
}

function mockBudgetSources() {
  return {
    budgetSources: [
      {
        id: 'src-001',
        name: 'Primary Mortgage',
        totalAmount: 250000,
        currency: 'EUR',
        notes: null,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ],
  };
}

function mockTimeline() {
  const today = new Date();
  const startDate = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);
  return {
    workItems: [
      {
        id: 'wi-001',
        title: 'Foundation Work',
        status: 'in_progress',
        startDate,
        endDate,
        durationDays: 30,
        dependencies: [],
        assignedUser: null,
        isCriticalPath: true,
      },
      {
        id: 'wi-002',
        title: 'Framing',
        status: 'not_started',
        startDate,
        endDate,
        durationDays: 30,
        dependencies: [],
        assignedUser: null,
        isCriticalPath: false,
      },
    ],
    dependencies: [],
    criticalPath: ['wi-001'],
    milestones: [],
    dateRange: { earliest: startDate, latest: endDate },
  };
}

type SummaryBucket = { count: number; totalAmount: number };

/**
 * Full InvoiceStatusBreakdown (the dashboard reads summary.quotation.count and
 * summary.paid/claimed.totalAmount, so every bucket must be present).
 */
function mockInvoiceSummary(
  overrides: Partial<Record<'pending' | 'paid' | 'claimed' | 'quotation', SummaryBucket>> = {},
): InvoiceStatusBreakdown {
  return {
    pending: { count: 2, totalAmount: 15000 },
    paid: { count: 5, totalAmount: 75000 },
    claimed: { count: 1, totalAmount: 10000 },
    quotation: { count: 0, totalAmount: 0 },
    overdue: { count: 0, totalAmount: 0 },
    claimable: { count: 0, totalAmount: 0 },
    quotationCoveredByDeposits: 0,
    openPayable: { count: 0, totalAmount: 0 },
    refundsDue: { count: 0, totalAmount: 0 },
    ...overrides,
  };
}

/** Builds a synthetic invoice list row (only the fields the dashboard reads matter). */
function mockInvoice(
  id: string,
  status: 'pending' | 'quotation',
  extra: Partial<{
    vendorName: string;
    invoiceNumber: string | null;
    amount: number;
    date: string;
    dueDate: string | null;
  }> = {},
): Invoice {
  return {
    id,
    vendorId: `vendor-${id}`,
    vendorName: 'Example Roofing Co',
    invoiceNumber: `INV-${id}`,
    amount: 1000,
    date: '2026-01-15',
    dueDate: null,
    status,
    notes: null,
    budgetLines: [],
    remainingAmount: 0,
    deposits: [],
    finalPaymentAmount: 0,
    createdBy: null,
    createdAt: '2026-01-15T00:00:00.000Z',
    updatedAt: '2026-01-15T00:00:00.000Z',
    ...extra,
  };
}

function mockInvoices(
  invoices: Invoice[] = [],
  summary: InvoiceStatusBreakdown = mockInvoiceSummary(),
): InvoiceListPaginatedResponse {
  return {
    invoices,
    pagination: {
      page: 1,
      pageSize: 5,
      totalItems: invoices.length,
      totalPages: 1,
    },
    summary,
  };
}

function mockSubsidyPrograms() {
  return {
    subsidyPrograms: [
      {
        id: 'sub-001',
        name: 'Solar Panel Subsidy',
        maxAmount: 5000,
        currency: 'EUR',
        status: 'active',
        notes: null,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ],
  };
}

function mockDiaryEntries() {
  return {
    items: [
      {
        id: 'diary-001',
        entryType: 'general_note',
        entryDate: '2026-03-14',
        title: 'Foundation inspection complete',
        body: 'All checks passed. Concrete mix approved.',
        metadata: null,
        isAutomatic: false,
        sourceEntityType: null,
        sourceEntityId: null,
        sourceEntityTitle: null,
        photoCount: 0,
        createdBy: null,
        createdAt: '2026-03-14T10:00:00.000Z',
        updatedAt: '2026-03-14T10:00:00.000Z',
      },
    ],
    pagination: { total: 1, page: 1, pageSize: 5, totalPages: 1, totalItems: 1 },
  };
}

/**
 * Intercepts all dashboard data API calls and returns mock responses.
 * This ensures consistent data across all viewports and prevents flakiness
 * from real data state in the test container.
 */
interface DashboardMockOverrides {
  overview?: unknown;
  sources?: unknown;
  timeline?: unknown;
  subsidyPrograms?: unknown;
  diary?: unknown;
  /** Responds to GET /api/invoices; receives the `status` query param (null when absent). */
  invoices?: (status: string | null) => unknown;
}

async function interceptDashboardApis(
  page: InstanceType<typeof DashboardPage>['page'],
  overrides: DashboardMockOverrides = {},
) {
  // Note: preferences are reset by the global beforeEach hook (PATCH to clear hiddenCards).
  // We do NOT intercept GET /api/users/me/preferences here because the "dismissed card
  // stays hidden after reload" test needs to read real server-side state after reload.

  await page.route('**/api/budget/overview', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ overview: overrides.overview ?? mockBudgetOverview() }),
      });
    } else {
      await route.continue();
    }
  });

  await page.route('**/api/budget-sources', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(overrides.sources ?? mockBudgetSources()),
      });
    } else {
      await route.continue();
    }
  });

  await page.route('**/api/timeline', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(overrides.timeline ?? mockTimeline()),
      });
    } else {
      await route.continue();
    }
  });

  await page.route('**/api/invoices*', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          overrides.invoices
            ? overrides.invoices(new URL(route.request().url()).searchParams.get('status'))
            : mockInvoices(),
        ),
      });
    } else {
      await route.continue();
    }
  });

  await page.route('**/api/subsidy-programs', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(overrides.subsidyPrograms ?? mockSubsidyPrograms()),
      });
    } else {
      await route.continue();
    }
  });

  await page.route('**/api/diary-entries*', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(overrides.diary ?? mockDiaryEntries()),
      });
    } else {
      await route.continue();
    }
  });
}

async function uninterceptDashboardApis(page: InstanceType<typeof DashboardPage>['page']) {
  await page.unroute('**/api/budget/overview');
  await page.unroute('**/api/budget-sources');
  await page.unroute('**/api/timeline');
  await page.unroute('**/api/invoices*');
  await page.unroute('**/api/subsidy-programs');
  await page.unroute('**/api/diary-entries*');
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: Smoke test — page loads with h1 "Project"
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Smoke test (Scenario 1)', { tag: '@smoke' }, () => {
  test('Dashboard page loads and shows h1 "Project"', async ({ page }) => {
    const dashboardPage = new DashboardPage(page);

    await dashboardPage.goto();

    await expect(dashboardPage.heading).toBeVisible();
    await expect(dashboardPage.heading).toHaveText('Project');
  });

  test('Root path / redirects to /project/overview', async ({ page }) => {
    await page.goto('/');
    await page.waitForURL(/\/project\/overview/);
    expect(page.url()).toContain('/project/overview');
  });

  test('/project redirects to /project/overview', async ({ page }) => {
    await page.goto('/project');
    await page.waitForURL(/\/project\/overview/);
    expect(page.url()).toContain('/project/overview');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: All 10 card headings visible after data loads
// ─────────────────────────────────────────────────────────────────────────────

test.describe('All cards render (Scenario 2)', { tag: '@responsive' }, () => {
  test('All 10 card headings are visible after data loads (incl. Recent Diary)', async ({
    page,
  }) => {
    // On mobile, some cards are inside collapsed <details> sections and are not
    // all visible simultaneously. This test validates the desktop/tablet grid layout.
    const viewport = page.viewportSize();
    if (!viewport || viewport.width < 768) {
      test.skip();
      return;
    }

    const dashboardPage = new DashboardPage(page);

    await interceptDashboardApis(page);

    try {
      await dashboardPage.goto();
      await dashboardPage.waitForCardsLoaded();

      for (const title of CARD_TITLES) {
        const cardHeading = page.getByRole('heading', { name: title, level: 2 });
        await expect(cardHeading.first()).toBeVisible();
      }
    } finally {
      await uninterceptDashboardApis(page);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: Budget Summary card shows available funds and remaining budget
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Budget Summary card (Scenario 3)', { tag: '@responsive' }, () => {
  test('Budget Summary card shows remaining budget amount', async ({ page }) => {
    // Budget Summary is in the primary section on mobile (always visible), but
    // the card layout and data-testid availability is validated on desktop/tablet grid.
    const viewport = page.viewportSize();
    if (!viewport || viewport.width < 768) {
      test.skip();
      return;
    }

    const dashboardPage = new DashboardPage(page);

    await interceptDashboardApis(page);

    try {
      await dashboardPage.goto();
      await dashboardPage.waitForCardsLoaded();

      // Remaining budget metric is rendered with data-testid="remaining-budget"
      const remainingBudget = page.getByTestId('remaining-budget');
      await expect(remainingBudget.first()).toBeVisible();

      // BudgetSummaryCard shows mediumNetRemaining = (remainingVsMinPlanned + remainingVsMaxPlanned) / 2
      // With our mock data: (50000 + 25000) / 2 = 37500
      const text = await remainingBudget.first().textContent();
      expect(text).toBeTruthy();
      // The value should be a formatted currency amount (37,500 or 37.500 depending on locale)
      expect(text?.replace(/\s/g, '')).toMatch(/37[,.]?500/);
    } finally {
      await uninterceptDashboardApis(page);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: Timeline cards (Upcoming Milestones, Work Item Progress, Critical Path)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Timeline cards (Scenario 4)', { tag: '@responsive' }, () => {
  test('Upcoming Milestones, Work Item Progress, and Critical Path cards are visible', async ({
    page,
  }) => {
    // Timeline cards (Upcoming Milestones, Work Item Progress, Critical Path) are placed
    // inside a collapsed <details> section on mobile. They are only visible in the
    // desktop/tablet card grid without user interaction.
    const viewport = page.viewportSize();
    if (!viewport || viewport.width < 768) {
      test.skip();
      return;
    }

    const dashboardPage = new DashboardPage(page);

    await interceptDashboardApis(page);

    try {
      await dashboardPage.goto();
      await dashboardPage.waitForCardsLoaded();

      for (const title of ['Upcoming Milestones', 'Work Item Progress', 'Critical Path']) {
        const card = dashboardPage.card(title);
        await expect(card.first()).toBeVisible();

        const heading = card.first().getByRole('heading', { name: title, level: 2 });
        await expect(heading).toBeVisible();
      }
    } finally {
      await uninterceptDashboardApis(page);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: Quick Actions card navigation links are clickable
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Quick Actions card (Scenario 5)', { tag: '@responsive' }, () => {
  test('Quick Actions card has a "New Work Item" primary action link', async ({ page }) => {
    const dashboardPage = new DashboardPage(page);

    await interceptDashboardApis(page);

    try {
      await dashboardPage.goto();
      await dashboardPage.waitForCardsLoaded();

      const quickActionsCard = dashboardPage.card('Quick Actions');
      await expect(quickActionsCard.first()).toBeVisible();

      // Primary action link should be visible
      const newWorkItemLink = quickActionsCard.first().getByRole('link', { name: 'New Work Item' });
      await expect(newWorkItemLink).toBeVisible();
    } finally {
      await uninterceptDashboardApis(page);
    }
  });

  test('Quick Actions "Work Items" link navigates to /project/work-items', async ({ page }) => {
    const dashboardPage = new DashboardPage(page);

    await interceptDashboardApis(page);

    try {
      await dashboardPage.goto();
      await dashboardPage.waitForCardsLoaded();

      const quickActionsCard = dashboardPage.card('Quick Actions');
      const workItemsLink = quickActionsCard.first().getByRole('link', { name: 'Work Items' });
      await expect(workItemsLink).toBeVisible();

      await workItemsLink.click();
      await page.waitForURL(/\/project\/work-items/);
      expect(page.url()).toContain('/project/work-items');
    } finally {
      await uninterceptDashboardApis(page);
    }
  });

  test('Quick Actions card has navigation links for Timeline and Budget', async ({ page }) => {
    const dashboardPage = new DashboardPage(page);

    await interceptDashboardApis(page);

    try {
      await dashboardPage.goto();
      await dashboardPage.waitForCardsLoaded();

      const quickActionsCard = dashboardPage.card('Quick Actions');

      await expect(quickActionsCard.first().getByRole('link', { name: 'Timeline' })).toBeVisible();
      await expect(quickActionsCard.first().getByRole('link', { name: 'Budget' })).toBeVisible();
      await expect(quickActionsCard.first().getByRole('link', { name: 'Invoices' })).toBeVisible();
      await expect(quickActionsCard.first().getByRole('link', { name: 'Vendors' })).toBeVisible();
    } finally {
      await uninterceptDashboardApis(page);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6: Card dismiss — clicking dismiss hides card; reload keeps it hidden
//
// These two tests are the only ones in this file that WRITE
// `dashboard.hiddenCards`. They previously provisioned a dedicated user inline
// (PR #1956) to survive the reset hook of a sibling test running in another
// worker; that is now handled file-wide by `isolatedUserPerWorker` above, so the
// plain `page` fixture is already the dedicated user's page and the inline helper
// is gone (Issue #1957).
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Card dismiss (Scenario 6)', () => {
  test('Dismissing a card hides it from the dashboard', async ({ page }) => {
    const dashboardPage = new DashboardPage(page);

    await interceptDashboardApis(page);

    try {
      await dashboardPage.goto();
      await dashboardPage.waitForCardsLoaded();

      // Verify the Quick Actions card is visible before dismissing
      const quickActionsCard = dashboardPage.card('Quick Actions');
      await expect(quickActionsCard.first()).toBeVisible();

      // Dismiss the Quick Actions card
      await dashboardPage.dismissCard('Quick Actions');

      // Verify the card is no longer visible
      const afterDismiss = dashboardPage.card('Quick Actions');
      await expect(afterDismiss).toHaveCount(0);
    } finally {
      await uninterceptDashboardApis(page);
    }
  });

  test('Dismissed card stays hidden after page reload', async ({ page }) => {
    const dashboardPage = new DashboardPage(page);

    await interceptDashboardApis(page);

    try {
      await dashboardPage.goto();
      await dashboardPage.waitForCardsLoaded();

      // Verify the Quick Actions card is visible before attempting to dismiss
      const quickActionsCard = dashboardPage.card('Quick Actions');
      await expect(quickActionsCard.first()).toBeVisible();

      // Dismiss the Quick Actions card
      await dashboardPage.dismissCard('Quick Actions');

      // Reload the page. Use navigationTimeout (10s) for the heading waitFor since the SPA
      // must fully initialize after a hard reload before the Dashboard heading appears.
      await page.reload();
      await dashboardPage.heading.waitFor({ state: 'visible', timeout: 10000 });

      // On page load, two contexts fetch preferences independently:
      //   1. LocaleContext — fetches to resolve locale preference
      //   2. usePreferences hook in DashboardPage — fetches all preferences incl. hiddenCards
      // Both must resolve before React can hide the dismissed card.
      //
      // waitForLoadState('networkidle') ensures all pending network requests (including both
      // preference fetches) have completed and React has finished re-rendering before we assert.
      await page.waitForLoadState('networkidle', { timeout: 15000 });

      // The Quick Actions card must be absent — usePreferences applied hiddenCards: ["quick-actions"]
      await expect(dashboardPage.card('Quick Actions')).toHaveCount(0);
    } finally {
      await uninterceptDashboardApis(page);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 7: Card re-enable via Customize dropdown
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Card re-enable (Scenario 7)', () => {
  test('Customize button appears when a card is dismissed', async ({ page }) => {
    const dashboardPage = new DashboardPage(page);

    await interceptDashboardApis(page);

    try {
      await dashboardPage.goto();
      await dashboardPage.waitForCardsLoaded();

      // Verify Customize button is NOT visible before dismissing.
      // The button visibility depends on the preferences GET that the dashboard issues on mount.
      // This GET is independent of the card-loading skeleton, so waitForCardsLoaded() does not
      // guarantee it has completed. Use expect.poll to wait until the preference state settles
      // (waitForResponse is not usable here because the request fires during goto() before we
      // can attach a listener).
      await expect
        .poll(() => dashboardPage.customizeButton.isVisible(), {
          timeout: 7000,
          intervals: [100, 200, 500],
        })
        .toBe(false);

      // Dismiss a card
      await dashboardPage.dismissCard('Quick Actions');

      // Customize button should now appear
      await expect(dashboardPage.customizeButton).toBeVisible();
    } finally {
      await uninterceptDashboardApis(page);
    }
  });

  test('Customize dropdown lists dismissed card and clicking re-enables it', async ({ page }) => {
    const dashboardPage = new DashboardPage(page);

    await interceptDashboardApis(page);

    try {
      await dashboardPage.goto();
      await dashboardPage.waitForCardsLoaded();

      // Dismiss the Quick Actions card
      await dashboardPage.dismissCard('Quick Actions');

      // Open the Customize dropdown
      await dashboardPage.openCustomizeDropdown();

      // The dropdown should contain a "Show Quick Actions" menu item
      const showItem = dashboardPage.customizeDropdown.getByRole('menuitem', {
        name: 'Show Quick Actions',
      });
      await expect(showItem).toBeVisible();

      // Click to re-enable
      await showItem.click();

      // The card should reappear
      const quickActionsCard = dashboardPage.card('Quick Actions');
      await expect(quickActionsCard.first()).toBeVisible();

      // Customize button should disappear again (no more hidden cards)
      // The button is removed from the DOM entirely when all cards are visible.
      await expect(dashboardPage.customizeButton).not.toBeVisible();
    } finally {
      await uninterceptDashboardApis(page);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 8: Responsive mobile — primary cards visible, Timeline/Budget Details collapsible
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Responsive mobile layout (Scenario 8)', { tag: '@responsive' }, () => {
  test('Primary section cards are visible in mobile layout', async ({ page }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width >= 768) {
      // Only test on mobile viewports
      test.skip();
      return;
    }

    const dashboardPage = new DashboardPage(page);

    await interceptDashboardApis(page);

    try {
      await dashboardPage.goto();
      await dashboardPage.waitForCardsLoaded();

      // Mobile uses the mobileSections container
      const mobileSections = dashboardPage.mobileSections;
      await expect(mobileSections).toBeVisible();

      // Primary section cards (Budget Summary, Invoice Pipeline, Quick Actions)
      // should be visible without expanding any collapsible section
      const primaryTitles = ['Budget Summary', 'Invoice Pipeline', 'Quick Actions'];
      for (const title of primaryTitles) {
        const heading = mobileSections.getByRole('heading', { name: title, level: 2 });
        await expect(heading.first()).toBeVisible();
      }
    } finally {
      await uninterceptDashboardApis(page);
    }
  });

  test('Timeline section is collapsible on mobile', async ({ page }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width >= 768) {
      test.skip();
      return;
    }

    const dashboardPage = new DashboardPage(page);

    await interceptDashboardApis(page);

    try {
      await dashboardPage.goto();
      await dashboardPage.waitForCardsLoaded();

      // Timeline collapsible section should be visible as a <details> element
      const timelineSection = dashboardPage.timelineSection();
      await expect(timelineSection).toBeVisible();

      // The summary should contain "Timeline" text
      const summary = timelineSection.locator('summary');
      await expect(summary).toContainText('Timeline');
    } finally {
      await uninterceptDashboardApis(page);
    }
  });

  test('Budget Details section is collapsible on mobile', async ({ page }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width >= 768) {
      test.skip();
      return;
    }

    const dashboardPage = new DashboardPage(page);

    await interceptDashboardApis(page);

    try {
      await dashboardPage.goto();
      await dashboardPage.waitForCardsLoaded();

      // Budget Details collapsible section should be visible as a <details> element
      const budgetDetailsSection = dashboardPage.budgetDetailsSection();
      await expect(budgetDetailsSection).toBeVisible();

      const summary = budgetDetailsSection.locator('summary');
      await expect(summary).toContainText('Budget Details');
    } finally {
      await uninterceptDashboardApis(page);
    }
  });

  test('Dashboard has no horizontal scroll on mobile viewport', async ({ page }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width >= 768) {
      test.skip();
      return;
    }

    const dashboardPage = new DashboardPage(page);

    await interceptDashboardApis(page);

    try {
      await dashboardPage.goto();
      await dashboardPage.waitForCardsLoaded();

      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      expect(hasHorizontalScroll).toBe(false);
    } finally {
      await uninterceptDashboardApis(page);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 9: Keyboard navigation — Mini Gantt navigates to /schedule on Enter
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Keyboard navigation (Scenario 9)', () => {
  test('Mini Gantt container is focusable and navigates to /schedule on Enter', async ({
    page,
  }) => {
    // Mini Gantt is inside the Timeline collapsible section on mobile and not directly
    // focusable without first expanding the section. Test on desktop/tablet only.
    const viewport = page.viewportSize();
    if (!viewport || viewport.width < 768) {
      test.skip();
      return;
    }

    const dashboardPage = new DashboardPage(page);

    await interceptDashboardApis(page);

    try {
      await dashboardPage.goto();
      await dashboardPage.waitForCardsLoaded();

      // The Mini Gantt card content has role="button" with aria-label="View full schedule"
      const miniGanttBtn = dashboardPage.miniGanttContainer();
      await miniGanttBtn.waitFor({ state: 'visible' });

      // Focus and press Enter to navigate
      await miniGanttBtn.focus();
      await expect(miniGanttBtn).toBeFocused();

      await page.keyboard.press('Enter');
      await page.waitForURL(/\/schedule/);
      expect(page.url()).toContain('/schedule');
    } finally {
      await uninterceptDashboardApis(page);
    }
  });

  test('Each visible card has a dismiss button that is keyboard accessible', async ({ page }) => {
    const dashboardPage = new DashboardPage(page);

    await interceptDashboardApis(page);

    try {
      await dashboardPage.goto();
      await dashboardPage.waitForCardsLoaded();

      // All dismiss buttons should be focusable
      const dismissButtons = page.getByRole('button', { name: /^Hide .+ card$/ });
      const count = await dismissButtons.count();
      // There are 10 cards defined (CARD_DEFINITIONS). Both the desktop grid and the mobile
      // sections container render cards simultaneously (CSS controls visibility), so the DOM
      // may contain up to 20 dismiss buttons. Expect at least 10 (one per card).
      expect(count).toBeGreaterThanOrEqual(10);
    } finally {
      await uninterceptDashboardApis(page);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 10: Dark mode rendering
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Dark mode (Scenario 10)', { tag: '@responsive' }, () => {
  test('Dashboard renders correctly in dark mode without horizontal scroll', async ({ page }) => {
    const dashboardPage = new DashboardPage(page);

    await page.goto(DASHBOARD_ROUTE);
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });

    await dashboardPage.heading.waitFor({ state: 'visible' });

    // Heading visible in dark mode
    await expect(dashboardPage.heading).toBeVisible();
    await expect(dashboardPage.heading).toHaveText('Project');

    // No horizontal scroll in dark mode
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(hasHorizontalScroll).toBe(false);
  });

  test('Dashboard cards render in dark mode', async ({ page }) => {
    // Quick Actions card appears in the desktop/tablet grid. On mobile it is rendered
    // in the mobile sections container instead; the card() locator finds article elements
    // which exist in both layouts, so use .first() to match whichever renders first.
    const dashboardPage = new DashboardPage(page);

    await interceptDashboardApis(page);

    try {
      await page.goto(DASHBOARD_ROUTE);
      await page.evaluate(() => {
        document.documentElement.setAttribute('data-theme', 'dark');
      });

      await dashboardPage.heading.waitFor({ state: 'visible' });
      await dashboardPage.waitForCardsLoaded();

      // At least the Quick Actions card (no data dependency) should render
      const quickActionsCard = dashboardPage.card('Quick Actions');
      await expect(quickActionsCard.first()).toBeVisible();
    } finally {
      await uninterceptDashboardApis(page);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 11: No horizontal scroll on current viewport
// ─────────────────────────────────────────────────────────────────────────────

test.describe('No horizontal scroll (Scenario 11)', { tag: '@responsive' }, () => {
  test('Dashboard page has no horizontal scroll on current viewport', async ({ page }) => {
    const dashboardPage = new DashboardPage(page);

    await interceptDashboardApis(page);

    try {
      await dashboardPage.goto();
      await dashboardPage.waitForCardsLoaded();

      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      expect(hasHorizontalScroll).toBe(false);
    } finally {
      await uninterceptDashboardApis(page);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 12: "Add" dropdown (issue #1050 — consolidated 3 individual buttons)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('"Add" dropdown (Scenario 12)', () => {
  test('"Add" button is visible on the project overview page', async ({ page }) => {
    const dashboardPage = new DashboardPage(page);

    await interceptDashboardApis(page);

    try {
      await dashboardPage.goto();
      await dashboardPage.waitForCardsLoaded();

      await expect(dashboardPage.addButton).toBeVisible();
    } finally {
      await uninterceptDashboardApis(page);
    }
  });

  test('Clicking "Add" opens a dropdown with three menu items', async ({ page }) => {
    const dashboardPage = new DashboardPage(page);

    await interceptDashboardApis(page);

    try {
      await dashboardPage.goto();
      await dashboardPage.waitForCardsLoaded();

      await dashboardPage.openAddDropdown();

      await expect(page.getByTestId('dashboard-add-work-item')).toBeVisible();
      await expect(page.getByTestId('dashboard-add-household-item')).toBeVisible();
      await expect(page.getByTestId('dashboard-add-milestone')).toBeVisible();
    } finally {
      await uninterceptDashboardApis(page);
    }
  });

  test('"Add Work Item" menu item navigates to the work item create page', async ({ page }) => {
    const dashboardPage = new DashboardPage(page);

    await interceptDashboardApis(page);

    try {
      await dashboardPage.goto();
      await dashboardPage.waitForCardsLoaded();

      await dashboardPage.openAddDropdown();
      await page.getByTestId('dashboard-add-work-item').click();

      await page.waitForURL(/\/project\/work-items\/new/);
      expect(page.url()).toContain('/project/work-items/new');
    } finally {
      await uninterceptDashboardApis(page);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 13: Add dropdown — Diary Entry and Invoice shortcuts (#1735)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Full summary shape expected by InvoicesPage — the existing mockInvoices() helper omits
 * the quotation and overdue buckets that the page accesses (summary.overdue.count etc.).
 * We define a richer mock inline here to avoid modifying the shared helper.
 */
function mockInvoicesFullSummary() {
  return {
    invoices: [],
    pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 },
    summary: {
      pending: { count: 0, totalAmount: 0 },
      paid: { count: 0, totalAmount: 0 },
      claimed: { count: 0, totalAmount: 0 },
      quotation: { count: 0, totalAmount: 0 },
      overdue: { count: 0, totalAmount: 0 },
      claimable: { count: 0, totalAmount: 0 },
      quotationCoveredByDeposits: 0,
      openPayable: { count: 0, totalAmount: 0 },
      refundsDue: { count: 0, totalAmount: 0 },
    },
  };
}

/**
 * Intercepts the three APIs that InvoicesPage fetches on mount so the page renders
 * cleanly in scenarios 13c–13f without interference from live test data.
 * NOTE: @smoke omitted — requires Story #1735 implementation to be in beta. Re-add after merge.
 */
async function interceptInvoicesPageApis(page: InstanceType<typeof DashboardPage>['page']) {
  await page.route('**/api/paperless/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        configured: false,
        reachable: false,
        error: null,
        paperlessUrl: null,
        filterTag: null,
      }),
    });
  });
  await page.route('**/api/config', async (route) => {
    try {
      const realResp = await route.fetch();
      const realBody = (await realResp.json()) as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...realBody, autoItemizeEnabled: false }),
      });
    } catch {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ currency: 'EUR', autoItemizeEnabled: false }),
      });
    }
  });
  await page.route('**/api/invoices*', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockInvoicesFullSummary()),
      });
    } else {
      await route.continue();
    }
  });
}

async function uninterceptInvoicesPageApis(page: InstanceType<typeof DashboardPage>['page']) {
  await page.unroute('**/api/paperless/status');
  await page.unroute('**/api/config');
  await page.unroute('**/api/invoices*');
}

test.describe('Add dropdown — Diary Entry and Invoice shortcuts (Scenario 13, #1735)', () => {
  // Scenario 13a: Add dropdown contains all five items in correct document order
  test('Add dropdown contains all five items in correct document order', async ({ page }) => {
    const dashboardPage = new DashboardPage(page);

    await interceptDashboardApis(page);

    try {
      await dashboardPage.goto();
      await dashboardPage.waitForCardsLoaded();

      await dashboardPage.openAddDropdown();

      // Collect all menu items from the Add dropdown menu in DOM order
      const menuItems = page.getByRole('menu').getByRole('menuitem');
      await expect(menuItems).toHaveCount(5);

      // Verify each item by data-testid in document order
      const expectedTestIds = [
        'dashboard-add-work-item',
        'dashboard-add-household-item',
        'dashboard-add-milestone',
        'dashboard-add-diary-entry',
        'dashboard-add-invoice',
      ];
      for (const [i, testId] of expectedTestIds.entries()) {
        await expect(menuItems.nth(i)).toHaveAttribute('data-testid', testId);
      }
    } finally {
      await uninterceptDashboardApis(page);
    }
  });

  // Scenario 13b: "New Diary Entry" closes the menu and navigates to /diary/new
  test('"New Diary Entry" closes the menu and navigates to /diary/new', async ({ page }) => {
    const dashboardPage = new DashboardPage(page);

    await interceptDashboardApis(page);

    try {
      await dashboardPage.goto();
      await dashboardPage.waitForCardsLoaded();

      await dashboardPage.openAddDropdown();
      await dashboardPage.addDiaryEntryButton.click();

      // Menu should close and navigate to /diary/new
      await page.waitForURL(/\/diary\/new/);
      expect(page.url()).toContain('/diary/new');

      // The diary create page h1 should confirm we actually landed there
      await expect(page.getByRole('heading', { level: 1, name: 'New Diary Entry' })).toBeVisible();
    } finally {
      await uninterceptDashboardApis(page);
    }
  });

  // Scenario 13c: "New Invoice" navigates to /budget/invoices
  test('"New Invoice" navigates to /budget/invoices', async ({ page }) => {
    const dashboardPage = new DashboardPage(page);

    await interceptDashboardApis(page);
    await interceptInvoicesPageApis(page);

    try {
      await dashboardPage.goto();
      await dashboardPage.waitForCardsLoaded();

      await dashboardPage.openAddDropdown();
      await dashboardPage.addInvoiceButton.click();

      await page.waitForURL(/\/budget\/invoices/);
      expect(page.url()).toContain('/budget/invoices');
    } finally {
      await uninterceptDashboardApis(page);
      await uninterceptInvoicesPageApis(page);
    }
  });

  // Scenario 13d: "New Invoice" auto-opens the manual create modal when Paperless is not configured
  test('"New Invoice" auto-opens manual create modal when Paperless is not configured', async ({
    page,
  }) => {
    const dashboardPage = new DashboardPage(page);

    await interceptDashboardApis(page);
    await interceptInvoicesPageApis(page);

    try {
      await dashboardPage.goto();
      await dashboardPage.waitForCardsLoaded();

      await dashboardPage.openAddDropdown();
      await dashboardPage.addInvoiceButton.click();

      // Wait for navigation to invoices page
      await page.waitForURL(/\/budget\/invoices/);

      // The manual create modal should open automatically (triggered by ?create=1)
      // Modal title is t('invoices.modal.title') = "Add Invoice"
      const createDialog = page.getByRole('dialog', { name: /Add Invoice/i });
      await expect(createDialog).toBeVisible();

      // Confirm the Paperless picker modal is NOT present
      await expect(
        page.getByRole('dialog', { name: /Select Invoice Document/i }),
      ).not.toBeVisible();
    } finally {
      await uninterceptDashboardApis(page);
      await uninterceptInvoicesPageApis(page);
    }
  });

  // Scenario 13e: after manual create modal opens, URL no longer contains create=1
  test('After manual create modal opens, URL no longer contains create=1', async ({ page }) => {
    const dashboardPage = new DashboardPage(page);

    await interceptDashboardApis(page);
    await interceptInvoicesPageApis(page);

    try {
      await dashboardPage.goto();
      await dashboardPage.waitForCardsLoaded();

      await dashboardPage.openAddDropdown();
      await dashboardPage.addInvoiceButton.click();

      await page.waitForURL(/\/budget\/invoices/);

      // Wait for the modal to open — confirms the useEffect fired and called setSearchParams
      const createDialog = page.getByRole('dialog', { name: /Add Invoice/i });
      await expect(createDialog).toBeVisible();

      // The URL must no longer contain create=1 (replaced via setSearchParams { replace: true })
      expect(page.url()).not.toContain('create=1');
    } finally {
      await uninterceptDashboardApis(page);
      await uninterceptInvoicesPageApis(page);
    }
  });

  // Scenario 13f: "New Invoice" auto-opens Paperless picker when Paperless configured + auto-itemize enabled
  test('"New Invoice" auto-opens Paperless picker when Paperless configured and auto-itemize enabled', async ({
    page,
  }) => {
    const dashboardPage = new DashboardPage(page);

    await interceptDashboardApis(page);

    // Override the status/config intercepts for this scenario: Paperless configured + auto-itemize
    await page.route('**/api/paperless/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          configured: true,
          reachable: true,
          error: null,
          paperlessUrl: 'http://paperless.example.com',
          filterTag: null,
        }),
      });
    });
    await page.route('**/api/config', async (route) => {
      try {
        const realResp = await route.fetch();
        const realBody = (await realResp.json()) as Record<string, unknown>;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ...realBody, autoItemizeEnabled: true }),
        });
      } catch {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ currency: 'EUR', autoItemizeEnabled: true }),
        });
      }
    });
    await page.route('**/api/invoices*', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockInvoicesFullSummary()),
        });
      } else {
        await route.continue();
      }
    });
    // Paperless picker also fetches correspondents on mount
    await page.route('**/api/paperless/correspondents*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ correspondents: [] }),
      });
    });
    // Paperless picker fetches documents via DocumentBrowser
    await page.route('**/api/paperless/documents*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ documents: [], count: 0, next: null, previous: null }),
      });
    });
    // DocumentBrowser also fetches tags in its Phase 2 call
    await page.route('**/api/paperless/tags*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ tags: [] }),
      });
    });

    try {
      await dashboardPage.goto();
      await dashboardPage.waitForCardsLoaded();

      await dashboardPage.openAddDropdown();
      await dashboardPage.addInvoiceButton.click();

      await page.waitForURL(/\/budget\/invoices/);

      // The Paperless picker modal should open automatically
      // InvoicePaperlessPickerModal renders inside Modal with title = t('budget:invoices.pickerModal.title')
      // Check InvoicePaperlessPickerModal title via the modal dialog role
      const pickerDialog = page.getByRole('dialog', { name: /Select Invoice Document/i });
      await expect(pickerDialog).toBeVisible();

      // Manual create dialog must NOT be present
      await expect(page.getByRole('dialog', { name: /Add Invoice/i })).not.toBeVisible();
    } finally {
      await uninterceptDashboardApis(page);
      await page.unroute('**/api/paperless/status');
      await page.unroute('**/api/config');
      await page.unroute('**/api/invoices*');
      await page.unroute('**/api/paperless/correspondents*');
      await page.unroute('**/api/paperless/documents*');
      await page.unroute('**/api/paperless/tags*');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ARIA / Accessibility
// ─────────────────────────────────────────────────────────────────────────────

test.describe('ARIA and accessibility', { tag: '@responsive' }, () => {
  test('Dashboard region has role=region and accessible label', async ({ page }) => {
    const dashboardPage = new DashboardPage(page);

    await dashboardPage.goto();

    // The desktop/tablet grid has role="region" with aria-label="Dashboard overview"
    await expect(dashboardPage.cardGrid).toBeVisible();
  });

  test('Each card is an article with aria-labelledby pointing to its title', async ({ page }) => {
    // On mobile the card grid is hidden; cards render in the mobile sections container.
    // The article element and aria-labelledby attributes exist in both layouts —
    // use .first() to match whichever visible article comes first.
    const dashboardPage = new DashboardPage(page);

    await interceptDashboardApis(page);

    try {
      await dashboardPage.goto();
      await dashboardPage.waitForCardsLoaded();

      // Quick Actions card (always renders regardless of data)
      const quickActionsCard = dashboardPage.card('Quick Actions');
      const article = quickActionsCard.first();
      await expect(article).toBeVisible();

      // article should have aria-labelledby="card-quick-actions-title"
      const labelledBy = await article.getAttribute('aria-labelledby');
      expect(labelledBy).toBe('card-quick-actions-title');
    } finally {
      await uninterceptDashboardApis(page);
    }
  });

  test('Dismiss button has correct aria-label', async ({ page }) => {
    const dashboardPage = new DashboardPage(page);

    await dashboardPage.goto();
    await dashboardPage.waitForCardsLoaded();

    // Quick Actions dismiss button
    const dismissBtn = dashboardPage.dismissButton('Quick Actions');
    await expect(dismissBtn.first()).toBeVisible();
    await expect(dismissBtn.first()).toHaveAttribute('aria-label', 'Hide Quick Actions card');
  });

  test('Mini Gantt container has role=button and aria-label', async ({ page }) => {
    // Mini Gantt is inside the Timeline collapsible section on mobile. This test
    // validates the card in the desktop/tablet grid where it is directly visible.
    const viewport = page.viewportSize();
    if (!viewport || viewport.width < 768) {
      test.skip();
      return;
    }

    const dashboardPage = new DashboardPage(page);

    await interceptDashboardApis(page);

    try {
      await dashboardPage.goto();
      await dashboardPage.waitForCardsLoaded();

      const miniGanttBtn = dashboardPage.miniGanttContainer();
      await expect(miniGanttBtn).toBeVisible();
      await expect(miniGanttBtn).toHaveAttribute('role', 'button');
      await expect(miniGanttBtn).toHaveAttribute('aria-label', 'View full schedule');
    } finally {
      await uninterceptDashboardApis(page);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 14: Home trust (#2193) — D-01..D-04
// ─────────────────────────────────────────────────────────────────────────────

/** Opens the mobile Timeline <details> when the layout is the sectioned phone layout. */
async function revealTimelineCards(dashboardPage: DashboardPage): Promise<void> {
  const viewport = dashboardPage.page.viewportSize();
  if (viewport && viewport.width < 768) {
    await dashboardPage.openMobileSections();
  }
}

test.describe('Home trust (Scenario 14, #2193)', { tag: '@responsive' }, () => {
  test('D-01: Upcoming Milestones title opens the milestone page, not a 404', async ({
    page,
    testPrefix,
  }) => {
    const dashboardPage = new DashboardPage(page);
    const milestoneDetail = new MilestoneDetailPage(page);
    const title = `${testPrefix} Dashboard Milestone`;

    // A real milestone; /api/timeline is deliberately NOT intercepted. The target date is far
    // in the past so the milestone sorts first among incomplete milestones regardless of what
    // other parallel specs have created (the card shows the 5 earliest).
    const milestoneId = await createMilestoneViaApi(page, { title, targetDate: '2000-01-01' });

    try {
      await dashboardPage.goto();
      await dashboardPage.waitForCardsLoaded();
      await revealTimelineCards(dashboardPage);

      const link = page.getByRole('link', { name: title });
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute('href', `/project/milestones/${milestoneId}`);
      await link.click();

      await page.waitForURL(new RegExp(`/project/milestones/${milestoneId}$`));
      await expect(milestoneDetail.heading).toHaveText(title);
      await expect(milestoneDetail.notFoundState).toHaveCount(0);
    } finally {
      await deleteMilestoneViaApi(page, milestoneId);
    }
  });

  test('D-02: pending and quotation rows come from status-scoped requests', async ({ page }) => {
    const dashboardPage = new DashboardPage(page);
    const pendingRows = Array.from({ length: 5 }, (_, i) =>
      mockInvoice(`pend-${i}`, 'pending', { date: `2025-0${i + 1}-10` }),
    );
    const quotationRows = [mockInvoice('quot-0', 'quotation'), mockInvoice('quot-1', 'quotation')];
    const summary = mockInvoiceSummary({
      pending: { count: 12, totalAmount: 12000 },
      paid: { count: 20, totalAmount: 50000 },
      quotation: { count: 2, totalAmount: 2000 },
    });

    const requested: string[] = [];
    page.on('request', (req) => {
      if (req.method() === 'GET' && new URL(req.url()).pathname === '/api/invoices') {
        requested.push(req.url());
      }
    });

    await interceptDashboardApis(page, {
      invoices: (status) =>
        mockInvoices(
          status === 'pending' ? pendingRows : status === 'quotation' ? quotationRows : [],
          summary,
        ),
    });

    try {
      await dashboardPage.goto();
      await dashboardPage.waitForCardsLoaded();

      const card = dashboardPage.card('Invoice Pipeline').filter({ visible: true });
      await expect(card.getByTestId('invoice-row')).toHaveCount(5);
      await expect(card.getByTestId('quotation-row')).toHaveCount(2);
      await expect(card.getByText('No invoices yet')).toHaveCount(0);

      const pendingUrl = requested.find((u) => u.includes('status=pending'));
      const quotationUrl = requested.find((u) => u.includes('status=quotation'));
      expect(pendingUrl, 'a status=pending request was made').toBeDefined();
      expect(quotationUrl, 'a status=quotation request was made').toBeDefined();
      expect(pendingUrl).toContain('sortOrder=asc');
      expect(quotationUrl).toContain('sortOrder=desc');
      expect(requested.filter((u) => u.includes('pageSize=10'))).toHaveLength(0);
    } finally {
      await uninterceptDashboardApis(page);
    }
  });

  test('D-02: "No invoices yet" appears only when no invoice exists at all', async ({ page }) => {
    const dashboardPage = new DashboardPage(page);

    await interceptDashboardApis(page, {
      invoices: () =>
        mockInvoices(
          [],
          mockInvoiceSummary({
            pending: { count: 0, totalAmount: 0 },
            paid: { count: 0, totalAmount: 0 },
            claimed: { count: 0, totalAmount: 0 },
          }),
        ),
    });

    try {
      await dashboardPage.goto();
      await dashboardPage.waitForCardsLoaded();

      const card = dashboardPage.card('Invoice Pipeline').filter({ visible: true });
      await expect(card.getByText('No invoices yet')).toBeVisible();
      await expect(card.getByRole('link', { name: 'Create an invoice' })).toBeVisible();
    } finally {
      await uninterceptDashboardApis(page);
    }
  });

  test('D-02: invoices exist but none is open shows "No pending invoices"', async ({ page }) => {
    const dashboardPage = new DashboardPage(page);

    await interceptDashboardApis(page, {
      invoices: () =>
        mockInvoices(
          [],
          mockInvoiceSummary({
            pending: { count: 0, totalAmount: 0 },
            paid: { count: 3, totalAmount: 9000 },
            claimed: { count: 0, totalAmount: 0 },
          }),
        ),
    });

    try {
      await dashboardPage.goto();
      await dashboardPage.waitForCardsLoaded();

      const card = dashboardPage.card('Invoice Pipeline').filter({ visible: true });
      await expect(card.getByText('No pending invoices')).toBeVisible();
      await expect(card.getByText('No invoices yet')).toHaveCount(0);
    } finally {
      await uninterceptDashboardApis(page);
    }
  });

  test('D-03: figure and badge share one scenario; Actual Spend is paid + claimed', async ({
    page,
  }) => {
    const dashboardPage = new DashboardPage(page);

    // Midpoint remaining = (50000 + -10000) / 2 = 20000 (positive) while the worst case is
    // negative: the badge must follow the figure and say "On Budget", not "Over Budget".
    await interceptDashboardApis(page, {
      overview: {
        ...mockBudgetOverview(),
        availableFunds: 100000,
        remainingVsMinPlanned: 50000,
        remainingVsMaxPlanned: -10000,
        actualCost: 99999,
      },
      invoices: () =>
        mockInvoices(
          [],
          mockInvoiceSummary({
            paid: { count: 4, totalAmount: 1200 },
            claimed: { count: 1, totalAmount: 300 },
          }),
        ),
    });

    try {
      await dashboardPage.goto();
      await dashboardPage.waitForCardsLoaded();

      const card = dashboardPage.card('Budget Summary').filter({ visible: true });
      const compact = async (testId: string) =>
        ((await card.getByTestId(testId).textContent()) ?? '').replace(/\s/g, '');

      await expect(card.getByTestId('remaining-budget')).toBeVisible();
      expect(await compact('remaining-budget')).toMatch(/20[,.]?000/);
      await expect(card.getByText('On Budget', { exact: true })).toBeVisible();
      await expect(card.getByText('Over Budget', { exact: true })).toHaveCount(0);

      // 1,200 + 300 = 1,500 (not the 99,999 itemised actualCost)
      const actual = await compact('actual-spend');
      expect(actual).toMatch(/1[,.]?500(?!\d)/);
      expect(actual).not.toMatch(/99[,.]?999/);
    } finally {
      await uninterceptDashboardApis(page);
    }
  });
});

// D-04: long synthetic content, widths set explicitly via setViewportSize, so it runs once in
// the desktop project only.
const D04_WIDTHS = [320, 375, 768, 1024, 1440] as const;
const longText = (prefix: string) => `${prefix}${'x'.repeat(120 - prefix.length)}`;
const D04_TITLES = {
  vendor: longText('Vendor'),
  milestone: longText('Milestone'),
  diary: longText('Diary'),
  source: longText('Source'),
  workItem: longText('WorkItem'),
  subsidy: longText('Subsidy'),
};
const D04_INVOICE_NUMBER = `INV-${'9'.repeat(36)}`;
const D04_BIG_AMOUNT = 9999999999.99;

function d04Mocks(): DashboardMockOverrides {
  const today = new Date();
  const startDate = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);
  const target = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 10)
    .toISOString()
    .slice(0, 10);

  const timeline = {
    workItems: [
      {
        id: 'wi-long',
        title: D04_TITLES.workItem,
        status: 'in_progress',
        startDate,
        endDate,
        durationDays: 30,
        dependencies: [],
        assignedUser: null,
        isCriticalPath: true,
      },
    ],
    dependencies: [],
    criticalPath: ['wi-long'],
    milestones: [
      {
        id: 4242,
        title: D04_TITLES.milestone,
        targetDate: target,
        isCompleted: false,
        completedAt: null,
        color: null,
        workItemIds: [],
        projectedDate: null,
        isCritical: false,
      },
    ],
    dateRange: { earliest: startDate, latest: endDate },
  };

  const sources = {
    budgetSources: [
      {
        ...mockBudgetSources().budgetSources[0],
        id: 'src-long',
        name: D04_TITLES.source,
        sourceType: 'bank_loan',
        status: 'active',
        totalAmount: D04_BIG_AMOUNT,
        usedAmount: D04_BIG_AMOUNT / 2,
        availableAmount: D04_BIG_AMOUNT / 2,
        claimedAmount: 0,
        unclaimedAmount: 0,
        paidAmount: 0,
        actualAvailableAmount: D04_BIG_AMOUNT,
        projectedAmount: 0,
        projectedMinAmount: 0,
        projectedMaxAmount: 0,
        interestRate: null,
        terms: null,
      },
    ],
  };

  const overview = {
    ...mockBudgetOverview(),
    availableFunds: D04_BIG_AMOUNT,
    minPlanned: D04_BIG_AMOUNT,
    maxPlanned: D04_BIG_AMOUNT,
    actualCost: D04_BIG_AMOUNT,
    remainingVsMinPlanned: D04_BIG_AMOUNT,
    remainingVsMaxPlanned: D04_BIG_AMOUNT,
    subsidySummary: {
      totalReductions: D04_BIG_AMOUNT,
      activeSubsidyCount: 1,
      minTotalPayback: 0,
      maxTotalPayback: 0,
      oversubscribedSubsidies: [],
    },
  };

  const subsidyPrograms = {
    subsidyPrograms: [
      {
        ...mockSubsidyPrograms().subsidyPrograms[0],
        id: 'sub-long',
        name: D04_TITLES.subsidy,
        maxAmount: D04_BIG_AMOUNT,
      },
    ],
  };

  const diary = mockDiaryEntries();
  diary.items[0] = { ...diary.items[0]!, id: 'diary-long', title: D04_TITLES.diary };

  const pendingRows = [
    mockInvoice('long-pend', 'pending', {
      vendorName: D04_TITLES.vendor,
      invoiceNumber: D04_INVOICE_NUMBER,
      amount: D04_BIG_AMOUNT,
      date: '2025-01-10',
      dueDate: '2025-02-01', // in the past, so the overdue badge renders
    }),
  ];
  const quotationRows = [
    mockInvoice('long-quot', 'quotation', {
      vendorName: D04_TITLES.vendor,
      invoiceNumber: D04_INVOICE_NUMBER,
      amount: D04_BIG_AMOUNT,
    }),
  ];
  const summary = mockInvoiceSummary({
    pending: { count: 1, totalAmount: D04_BIG_AMOUNT },
    paid: { count: 1, totalAmount: D04_BIG_AMOUNT },
    claimed: { count: 1, totalAmount: D04_BIG_AMOUNT },
    quotation: { count: 1, totalAmount: D04_BIG_AMOUNT },
  });

  return {
    overview,
    sources,
    timeline,
    subsidyPrograms,
    diary,
    invoices: (status) =>
      mockInvoices(
        status === 'pending' ? pendingRows : status === 'quotation' ? quotationRows : [],
        summary,
      ),
  };
}

test.describe('No card overflows horizontally (Scenario 14, D-04)', () => {
  test('Page and every visible card fit from 320 to 1440 px with long content', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Widths are set explicitly; run once.');

    const dashboardPage = new DashboardPage(page);
    await interceptDashboardApis(page, d04Mocks());

    try {
      await page.setViewportSize({ width: D04_WIDTHS[D04_WIDTHS.length - 1]!, height: 900 });
      await dashboardPage.goto();
      await dashboardPage.waitForCardsLoaded();

      // Entity titles carry the full text in a title attribute (truncated visually).
      await expect(page.locator(`[title="${D04_TITLES.vendor}"]`).first()).toBeAttached();
      await expect(page.locator(`[title="${D04_TITLES.milestone}"]`).first()).toBeAttached();
      await expect(page.locator(`[title="${D04_TITLES.source}"]`).first()).toBeAttached();
      await expect(page.locator(`[title="${D04_TITLES.diary}"]`).first()).toBeAttached();

      for (const width of D04_WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        if (width < 768) {
          await dashboardPage.openMobileSections();
        }

        await expect
          .poll(() => dashboardPage.measureHorizontalOverflow(), {
            message: `horizontal overflow at ${width}px`,
          })
          .toEqual([]);
      }
    } finally {
      await uninterceptDashboardApis(page);
    }
  });
});
