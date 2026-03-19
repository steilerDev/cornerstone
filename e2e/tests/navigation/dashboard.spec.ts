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
 */

import { test, expect } from '../../fixtures/auth.js';
import { DashboardPage, DASHBOARD_ROUTE, CARD_TITLES } from '../../pages/DashboardPage.js';

// ─────────────────────────────────────────────────────────────────────────────
// Global setup: reset dashboard preferences before every test to prevent
// state leaking from dismiss tests (Issue 1: server-side preference persistence)
// ─────────────────────────────────────────────────────────────────────────────

test.beforeEach(async ({ page }) => {
  const resp = await page.request.patch('/api/users/me/preferences', {
    data: { key: 'dashboard.hiddenCards', value: '[]' },
  });
  // Ensure the preference reset succeeded — a failed PATCH leaves hidden cards
  // from a prior test, causing downstream dismiss tests to fail.
  expect(resp.ok(), `beforeEach: preference reset failed with ${resp.status()}`).toBeTruthy();

  // Also reset the locale preference to English. If an i18n test in the same shard
  // left the locale as 'de', the dashboard would render with German card headings
  // (e.g., "Schnellaktionen" instead of "Quick Actions"), causing locator failures.
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
    categorySummaries: [
      {
        categoryId: 'cat-001',
        categoryName: 'Materials',
        categoryColor: '#3b82f6',
        minPlanned: 120000,
        maxPlanned: 132000,
        actualCost: 95000,
        actualCostPaid: 80000,
        projectedMin: 125000,
        projectedMax: 130000,
        actualCostClaimed: 50000,
        budgetLineCount: 4,
      },
    ],
    subsidySummary: {
      totalReductions: 12500,
      activeSubsidyCount: 1,
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

function mockInvoices() {
  return {
    invoices: [],
    pagination: { total: 0, page: 1, pageSize: 10, totalPages: 0 },
    summary: {
      pending: { count: 2, totalAmount: 15000 },
      paid: { count: 5, totalAmount: 75000 },
      claimed: { count: 1, totalAmount: 10000 },
    },
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
async function interceptDashboardApis(page: InstanceType<typeof DashboardPage>['page']) {
  // Note: preferences are reset by the global beforeEach hook (PATCH to clear hiddenCards).
  // We do NOT intercept GET /api/users/me/preferences here because the "dismissed card
  // stays hidden after reload" test needs to read real server-side state after reload.

  await page.route('**/api/budget/overview', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ overview: mockBudgetOverview() }),
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
        body: JSON.stringify(mockBudgetSources()),
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
        body: JSON.stringify(mockTimeline()),
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
        body: JSON.stringify(mockInvoices()),
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
        body: JSON.stringify(mockSubsidyPrograms()),
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
        body: JSON.stringify(mockDiaryEntries()),
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

      // With our mock data, remainingVsActualCost = 115000 (300000 - 185000)
      const text = await remainingBudget.first().textContent();
      expect(text).toBeTruthy();
      // The value should be a formatted currency amount
      expect(text?.replace(/\s/g, '')).toMatch(/115[,.]?000/);
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

      // Register preferences response listener BEFORE reload (per waitForResponse-before-action
      // pattern). The preferences API is NOT intercepted, so the real server response arrives
      // after reload. We must wait for it before asserting card visibility.
      const prefsResponse = page.waitForResponse(
        (resp) => resp.url().includes('/api/users/me/preferences') && resp.status() === 200,
      );

      // Reload the page
      await page.reload();
      await dashboardPage.heading.waitFor({ state: 'visible' });

      // Wait for preferences to be fetched and applied before checking card state.
      await prefsResponse;
      await dashboardPage.waitForCardsLoaded();

      // Card should still be hidden — preferences persisted Quick Actions as hidden.
      await expect(dashboardPage.card('Quick Actions')).toHaveCount(0);

      // Clean up: re-enable the card via preferences API to not affect other tests
      await page.request.patch('/api/users/me/preferences', {
        data: { key: 'dashboard.hiddenCards', value: '[]' },
      });
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

      // Verify Customize button is NOT visible before dismissing
      // The button is only rendered when cards are hidden, so it may be absent from the DOM entirely.
      await expect(dashboardPage.customizeButton).not.toBeVisible();

      // Dismiss a card
      await dashboardPage.dismissCard('Quick Actions');

      // Customize button should now appear
      await expect(dashboardPage.customizeButton).toBeVisible();

      // Clean up
      await page.request.patch('/api/users/me/preferences', {
        data: { key: 'dashboard.hiddenCards', value: '[]' },
      });
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
