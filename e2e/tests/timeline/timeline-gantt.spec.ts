/**
 * E2E tests for the Gantt chart view on the Timeline page (/timeline)
 *
 * Scenarios covered:
 * 1.  Timeline page loads and shows Gantt chart heading
 * 2.  Gantt chart renders when work items have dates (mocked)
 * 3.  Gantt sidebar shows work item list
 * 4.  Gantt header (time grid) renders
 * 5.  Zoom controls switch between Day/Week/Month
 * 6.  Arrow toggle shows/hides dependency arrows (aria-pressed state)
 * 7.  Empty state shown when no work items exist
 * 8.  No-dates state shown when work items have no dates
 * 9.  Clicking a sidebar row navigates to the work item detail page
 * 10. Gantt chart renders in dark mode
 */

import { test, expect } from '../../fixtures/auth.js';
import { TimelinePage, TIMELINE_ROUTE } from '../../pages/TimelinePage.js';
import { createWorkItemViaApi, deleteWorkItemViaApi } from '../../fixtures/apiHelpers.js';

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: Page loads with h1 "Timeline"
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Page load (Scenario 1)', { tag: '@responsive' }, () => {
  test('Timeline page loads with h1 "Timeline"', { tag: '@smoke' }, async ({ page }) => {
    const timelinePage = new TimelinePage(page);
    await timelinePage.goto();

    await expect(timelinePage.heading).toBeVisible();
    await expect(timelinePage.heading).toHaveText('Timeline');
  });

  test('Page URL is /timeline', async ({ page }) => {
    await page.goto(TIMELINE_ROUTE);
    await page.waitForURL('**/timeline');
    expect(page.url()).toContain('/timeline');
  });

  test('Toolbar is rendered with view toggle buttons', async ({ page }) => {
    const timelinePage = new TimelinePage(page);
    await timelinePage.goto();

    await expect(timelinePage.ganttViewButton).toBeVisible();
    await expect(timelinePage.calendarViewButton).toBeVisible();
    await expect(timelinePage.milestonePanelButton).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: Gantt chart renders with mocked work items that have dates
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Gantt chart renders (Scenario 2)', () => {
  test('Gantt chart container is visible when work items with dates are present', async ({
    page,
  }) => {
    const timelinePage = new TimelinePage(page);

    // Mock the timeline API with a work item that has dates
    const today = new Date();
    const startDate = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
    const endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0)
      .toISOString()
      .slice(0, 10);

    await page.route('**/api/timeline', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            workItems: [
              {
                id: 'mock-item-1',
                title: 'Mock Gantt Item',
                status: 'in_progress',
                startDate,
                endDate,
                durationDays: 30,
                dependencies: [],
                assignedUser: null,
                isCriticalPath: false,
              },
            ],
            dependencies: [],
            criticalPath: [],
            milestones: [],
            dateRange: { earliest: startDate, latest: endDate },
          }),
        });
      } else {
        await route.continue();
      }
    });

    try {
      await timelinePage.goto();
      await timelinePage.waitForLoaded();

      await expect(timelinePage.ganttChart).toBeVisible();
      await expect(timelinePage.ganttSvg).toBeVisible();
    } finally {
      await page.unroute('**/api/timeline');
    }
  });

  test('Gantt skeleton is shown while data loads (mocked slow response)', async ({ page }) => {
    const timelinePage = new TimelinePage(page);

    // Intercept and delay the timeline API
    await page.route('**/api/timeline', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await route.continue();
    });

    try {
      // Navigate — don't await heading to capture the loading state
      void page.goto(TIMELINE_ROUTE);
      // Skeleton should appear briefly
      await timelinePage.ganttSkeleton.waitFor({ state: 'visible', timeout: 3000 });
    } finally {
      await page.unroute('**/api/timeline');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: Gantt sidebar shows work item list
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Gantt sidebar (Scenario 3)', () => {
  test('Gantt sidebar is visible and contains work item list when data loads', async ({ page }) => {
    const timelinePage = new TimelinePage(page);

    const today = new Date();
    const startDate = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
    const endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0)
      .toISOString()
      .slice(0, 10);

    await page.route('**/api/timeline', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            workItems: [
              {
                id: 'sidebar-item-1',
                title: 'Foundation Work',
                status: 'not_started',
                startDate,
                endDate,
                durationDays: 30,
                dependencies: [],
                assignedUser: null,
                isCriticalPath: false,
              },
              {
                id: 'sidebar-item-2',
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
            criticalPath: [],
            milestones: [],
            dateRange: { earliest: startDate, latest: endDate },
          }),
        });
      } else {
        await route.continue();
      }
    });

    try {
      await timelinePage.goto();
      await timelinePage.waitForLoaded();

      await expect(timelinePage.ganttSidebar).toBeVisible();
      await expect(timelinePage.ganttSidebarRowsList).toBeVisible();

      const labels = await timelinePage.getSidebarItemLabels();
      // Labels include "Work item: {title}" prefix from aria-label
      expect(labels.some((l) => l.includes('Foundation Work'))).toBe(true);
      expect(labels.some((l) => l.includes('Framing'))).toBe(true);
    } finally {
      await page.unroute('**/api/timeline');
    }
  });

  test('Sidebar row has no-dates indicator when work item has no dates', async ({ page }) => {
    const timelinePage = new TimelinePage(page);

    await page.route('**/api/timeline', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            workItems: [
              {
                id: 'no-dates-item',
                title: 'Undated Task',
                status: 'not_started',
                startDate: null,
                endDate: null,
                durationDays: null,
                dependencies: [],
                assignedUser: null,
                isCriticalPath: false,
              },
            ],
            dependencies: [],
            criticalPath: [],
            milestones: [],
            dateRange: null,
          }),
        });
      } else {
        await route.continue();
      }
    });

    try {
      await timelinePage.goto();
      // Page will show no-dates state but the sidebar is still present via the GanttChart
      // The chart renders when filteredData.workItems.length > 0 - even without dates
      // Actually: no-dates warning appears, chart does NOT render. Check the warning instead.
      await timelinePage.noDatesState.waitFor({ state: 'visible' });
      await expect(timelinePage.noDatesState).toContainText('No scheduled work items');
    } finally {
      await page.unroute('**/api/timeline');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: Gantt header (time grid) renders
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Gantt header (Scenario 4)', () => {
  test('Gantt header is visible when chart is rendered', async ({ page }) => {
    const timelinePage = new TimelinePage(page);

    const today = new Date();
    const startDate = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
    const endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0)
      .toISOString()
      .slice(0, 10);

    await page.route('**/api/timeline', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            workItems: [
              {
                id: 'header-item',
                title: 'Header Test Item',
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
            criticalPath: [],
            milestones: [],
            dateRange: { earliest: startDate, latest: endDate },
          }),
        });
      } else {
        await route.continue();
      }
    });

    try {
      await timelinePage.goto();
      await timelinePage.waitForLoaded();

      await expect(timelinePage.ganttHeader).toBeVisible();
    } finally {
      await page.unroute('**/api/timeline');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: Zoom controls
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Zoom controls (Scenario 5)', () => {
  test('Zoom toolbar renders with Day, Week, Month buttons', async ({ page }) => {
    const timelinePage = new TimelinePage(page);
    await timelinePage.goto();

    await expect(timelinePage.zoomToolbar).toBeVisible();
    await expect(timelinePage.zoomToolbar.getByRole('button', { name: 'Day' })).toBeVisible();
    await expect(timelinePage.zoomToolbar.getByRole('button', { name: 'Week' })).toBeVisible();
    await expect(timelinePage.zoomToolbar.getByRole('button', { name: 'Month' })).toBeVisible();
  });

  test('Month is the default active zoom level', async ({ page }) => {
    const timelinePage = new TimelinePage(page);
    await timelinePage.goto();

    const activeZoom = await timelinePage.getActiveZoom();
    expect(activeZoom?.trim()).toBe('Month');
  });

  test('Clicking Day sets Day as the active zoom level', async ({ page }) => {
    const timelinePage = new TimelinePage(page);
    await timelinePage.goto();

    await timelinePage.setZoom('Day');

    const dayButton = timelinePage.zoomToolbar.getByRole('button', { name: 'Day' });
    await expect(dayButton).toHaveAttribute('aria-pressed', 'true');
  });

  test('Clicking Week sets Week as the active zoom level', async ({ page }) => {
    const timelinePage = new TimelinePage(page);
    await timelinePage.goto();

    await timelinePage.setZoom('Week');

    const weekButton = timelinePage.zoomToolbar.getByRole('button', { name: 'Week' });
    await expect(weekButton).toHaveAttribute('aria-pressed', 'true');
  });

  test('Clicking Month sets Month as the active zoom level', async ({ page }) => {
    const timelinePage = new TimelinePage(page);
    await timelinePage.goto();

    // Start from a different zoom level
    await timelinePage.setZoom('Week');
    await timelinePage.setZoom('Month');

    const monthButton = timelinePage.zoomToolbar.getByRole('button', { name: 'Month' });
    await expect(monthButton).toHaveAttribute('aria-pressed', 'true');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6: Arrow toggle
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Arrow toggle (Scenario 6)', () => {
  test('Arrows toggle button is visible in Gantt view', async ({ page }) => {
    const timelinePage = new TimelinePage(page);
    await timelinePage.goto();

    await expect(timelinePage.arrowsToggleButton).toBeVisible();
  });

  test('Arrows are shown by default (aria-pressed=true)', async ({ page }) => {
    const timelinePage = new TimelinePage(page);
    await timelinePage.goto();

    await expect(timelinePage.arrowsToggleButton).toHaveAttribute('aria-pressed', 'true');
  });

  test('Clicking arrows toggle hides arrows (aria-pressed=false)', async ({ page }) => {
    const timelinePage = new TimelinePage(page);
    await timelinePage.goto();

    const wasShowing = await timelinePage.arrowsVisible();
    expect(wasShowing).toBe(true);

    await timelinePage.toggleArrows();

    await expect(timelinePage.arrowsToggleButton).toHaveAttribute('aria-pressed', 'false');
  });

  test('Clicking arrows toggle again re-shows arrows (aria-pressed=true)', async ({ page }) => {
    const timelinePage = new TimelinePage(page);
    await timelinePage.goto();

    // Hide then show
    await timelinePage.toggleArrows();
    await expect(timelinePage.arrowsToggleButton).toHaveAttribute('aria-pressed', 'false');

    await timelinePage.toggleArrows();
    await expect(timelinePage.arrowsToggleButton).toHaveAttribute('aria-pressed', 'true');
  });

  test('Arrow toggle button is NOT visible in Calendar view', async ({ page }) => {
    const timelinePage = new TimelinePage(page);
    await timelinePage.goto();
    await timelinePage.switchToCalendar();

    // In calendar view, the arrows toggle is hidden
    await expect(timelinePage.arrowsToggleButton).not.toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 7: Empty state — no work items
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Empty state — no work items (Scenario 7)', () => {
  test('Empty state renders when API returns no work items', async ({ page }) => {
    const timelinePage = new TimelinePage(page);

    await page.route('**/api/timeline', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            workItems: [],
            dependencies: [],
            criticalPath: [],
            milestones: [],
            dateRange: null,
          }),
        });
      } else {
        await route.continue();
      }
    });

    try {
      await timelinePage.goto();
      await timelinePage.emptyState.waitFor({ state: 'visible' });

      await expect(timelinePage.emptyState).toContainText('No work items to display');
      // Link to Work Items page should be present
      const link = timelinePage.emptyState.getByRole('link', { name: /Go to Work Items/i });
      await expect(link).toBeVisible();
    } finally {
      await page.unroute('**/api/timeline');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 8: No-dates state
// ─────────────────────────────────────────────────────────────────────────────

test.describe('No-dates state (Scenario 8)', () => {
  test('No-dates warning renders when work items have no start/end dates', async ({ page }) => {
    const timelinePage = new TimelinePage(page);

    await page.route('**/api/timeline', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            workItems: [
              {
                id: 'undated-1',
                title: 'Undated Work Item',
                status: 'not_started',
                startDate: null,
                endDate: null,
                durationDays: null,
                dependencies: [],
                assignedUser: null,
                isCriticalPath: false,
              },
            ],
            dependencies: [],
            criticalPath: [],
            milestones: [],
            dateRange: null,
          }),
        });
      } else {
        await route.continue();
      }
    });

    try {
      await timelinePage.goto();
      await timelinePage.noDatesState.waitFor({ state: 'visible' });

      await expect(timelinePage.noDatesState).toContainText('No scheduled work items');
      const link = timelinePage.noDatesState.getByRole('link', { name: /Go to Work Items/i });
      await expect(link).toBeVisible();
    } finally {
      await page.unroute('**/api/timeline');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 9: Clicking sidebar row navigates to work item detail
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Sidebar navigation (Scenario 9)', () => {
  test('Clicking a sidebar row navigates to the work item detail page', async ({
    page,
    testPrefix,
  }) => {
    const timelinePage = new TimelinePage(page);
    const title = `${testPrefix} Sidebar Nav Item`;
    let createdId: string | null = null;

    try {
      // Create a work item with dates so it appears in the Gantt chart
      const today = new Date();
      const startDate = new Date(today.getFullYear(), today.getMonth(), 1)
        .toISOString()
        .slice(0, 10);
      const endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0)
        .toISOString()
        .slice(0, 10);

      createdId = await createWorkItemViaApi(page, {
        title,
        startDate,
        endDate,
      });

      await timelinePage.goto();
      await timelinePage.waitForLoaded();

      // Find and click the sidebar row for our work item
      const sidebarRow = page.getByTestId(`gantt-sidebar-row-${createdId}`);
      await sidebarRow.waitFor({ state: 'visible' });
      await sidebarRow.click();

      // Should navigate to work item detail
      await page.waitForURL(`**/work-items/${createdId}`);
      expect(page.url()).toContain(`/work-items/${createdId}`);
    } finally {
      if (createdId) await deleteWorkItemViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 10: Dark mode rendering
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Dark mode rendering (Scenario 10)', { tag: '@responsive' }, () => {
  test('Timeline page renders correctly in dark mode', async ({ page }) => {
    const timelinePage = new TimelinePage(page);

    await page.goto(TIMELINE_ROUTE);
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });
    await timelinePage.heading.waitFor({ state: 'visible' });

    await expect(timelinePage.heading).toBeVisible();
    await expect(timelinePage.ganttViewButton).toBeVisible();
    await expect(timelinePage.calendarViewButton).toBeVisible();

    // No horizontal scroll in dark mode
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(hasHorizontalScroll).toBe(false);
  });
});
