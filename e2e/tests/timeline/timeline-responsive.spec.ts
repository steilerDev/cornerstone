/**
 * E2E tests for responsive layout and accessibility on the Timeline page (/timeline)
 *
 * Scenarios covered:
 * 1.  Timeline page renders without horizontal scroll on all viewports (@responsive)
 * 2.  Mobile: page loads with heading and toolbar
 * 3.  Tablet: Gantt chart is accessible/visible
 * 4.  Keyboard navigation on Gantt sidebar items
 * 5.  Dark mode — no horizontal scroll on all viewports
 * 6.  Calendar view renders without horizontal scroll on all viewports
 * 7.  ARIA roles and labels on key elements
 */

import { test, expect } from '../../fixtures/auth.js';
import { TimelinePage, TIMELINE_ROUTE } from '../../pages/TimelinePage.js';

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: No horizontal scroll
// ─────────────────────────────────────────────────────────────────────────────

test.describe('No horizontal scroll (Scenario 1)', { tag: '@responsive' }, () => {
  test('Timeline page has no horizontal scroll in Gantt view', async ({ page }) => {
    const timelinePage = new TimelinePage(page);
    await timelinePage.goto();

    const hasHorizontalScroll = await page.evaluate(() => {
      // Check the document body, not the internal Gantt canvas (which intentionally scrolls)
      return document.body.scrollWidth > window.innerWidth;
    });

    expect(hasHorizontalScroll).toBe(false);
  });

  test('Timeline page has no horizontal scroll in Calendar view', async ({ page }) => {
    const timelinePage = new TimelinePage(page);
    await timelinePage.gotoCalendar();

    const hasHorizontalScroll = await page.evaluate(() => {
      return document.body.scrollWidth > window.innerWidth;
    });

    expect(hasHorizontalScroll).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: Mobile — page loads with heading and toolbar
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Mobile layout (Scenario 2)', { tag: '@responsive' }, () => {
  test('Timeline heading is visible on mobile viewport', async ({ page }) => {
    const timelinePage = new TimelinePage(page);
    await timelinePage.goto();

    await expect(timelinePage.heading).toBeVisible();
    await expect(timelinePage.heading).toHaveText('Timeline');
  });

  test('View toggle buttons are visible on mobile viewport', async ({ page }) => {
    const timelinePage = new TimelinePage(page);
    await timelinePage.goto();

    await expect(timelinePage.ganttViewButton).toBeVisible();
    await expect(timelinePage.calendarViewButton).toBeVisible();
  });

  test('Milestone panel button is visible on mobile viewport', async ({ page }) => {
    const timelinePage = new TimelinePage(page);
    await timelinePage.goto();

    await expect(timelinePage.milestonePanelButton).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: Tablet — Gantt chart accessible
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Tablet layout (Scenario 3)', () => {
  test('Zoom controls are visible on tablet viewport', async ({ page }) => {
    const viewport = page.viewportSize();
    // Only meaningful on tablet (768px+)
    if (!viewport || viewport.width < 768) {
      test.skip();
      return;
    }

    const timelinePage = new TimelinePage(page);
    await timelinePage.goto();

    await expect(timelinePage.zoomToolbar).toBeVisible();
  });

  test('Gantt chart renders on tablet when data is available', async ({ page }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width < 768) {
      test.skip();
      return;
    }

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
                id: 'tablet-item',
                title: 'Tablet Test Item',
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

      await expect(timelinePage.ganttChart).toBeVisible();
    } finally {
      await page.unroute('**/api/timeline');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: Keyboard navigation on Gantt sidebar
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Keyboard navigation on sidebar (Scenario 4)', () => {
  test('Sidebar rows are focusable and respond to keyboard', async ({ page }) => {
    const viewport = page.viewportSize();
    // Only meaningful on desktop/tablet where sidebar is likely visible
    if (!viewport || viewport.width < 768) {
      test.skip();
      return;
    }

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
                id: 'kb-item-1',
                title: 'First Item',
                status: 'not_started',
                startDate,
                endDate,
                durationDays: 30,
                dependencies: [],
                assignedUser: null,
                isCriticalPath: false,
              },
              {
                id: 'kb-item-2',
                title: 'Second Item',
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

      // Focus the first sidebar row
      const firstRow = page.getByTestId('gantt-sidebar-row-kb-item-1');
      await firstRow.waitFor({ state: 'visible' });
      await firstRow.focus();

      // Sidebar rows should be focusable (tabIndex=0)
      await expect(firstRow).toBeFocused();

      // Press ArrowDown — focus moves to next row
      await page.keyboard.press('ArrowDown');
      const secondRow = page.getByTestId('gantt-sidebar-row-kb-item-2');
      await expect(secondRow).toBeFocused();
    } finally {
      await page.unroute('**/api/timeline');
    }
  });

  test('Pressing Enter on a sidebar row navigates to work item detail', async ({ page }) => {
    const viewport = page.viewportSize();
    if (!viewport || viewport.width < 768) {
      test.skip();
      return;
    }

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
                id: 'enter-nav-item',
                title: 'Enter Nav Item',
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

      const row = page.getByTestId('gantt-sidebar-row-enter-nav-item');
      await row.waitFor({ state: 'visible' });
      await row.focus();
      await page.keyboard.press('Enter');

      await page.waitForURL('**/work-items/enter-nav-item');
      expect(page.url()).toContain('/work-items/enter-nav-item');
    } finally {
      await page.unroute('**/api/timeline');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: Dark mode — no horizontal scroll on all viewports
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Dark mode no horizontal scroll (Scenario 5)', { tag: '@responsive' }, () => {
  test('Timeline in dark mode has no body horizontal scroll', async ({ page }) => {
    await page.goto(TIMELINE_ROUTE);
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });

    const timelinePage = new TimelinePage(page);
    await timelinePage.heading.waitFor({ state: 'visible' });

    const hasHorizontalScroll = await page.evaluate(() => {
      return document.body.scrollWidth > window.innerWidth;
    });
    expect(hasHorizontalScroll).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6: Calendar view on all viewports
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Calendar on all viewports (Scenario 6)', { tag: '@responsive' }, () => {
  test('Calendar view renders without horizontal scroll', async ({ page }) => {
    const timelinePage = new TimelinePage(page);
    await timelinePage.gotoCalendar();

    await expect(timelinePage.calendarView).toBeVisible();

    const hasHorizontalScroll = await page.evaluate(() => {
      return document.body.scrollWidth > window.innerWidth;
    });
    expect(hasHorizontalScroll).toBe(false);
  });

  test('Calendar month/week mode buttons visible on current viewport', async ({ page }) => {
    const timelinePage = new TimelinePage(page);
    await timelinePage.gotoCalendar();

    await expect(timelinePage.calendarMonthButton).toBeVisible();
    await expect(timelinePage.calendarWeekButton).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 7: ARIA roles and labels
// ─────────────────────────────────────────────────────────────────────────────

test.describe('ARIA roles and labels (Scenario 7)', { tag: '@responsive' }, () => {
  test('Gantt chart container has role=img and accessible label', async ({ page }) => {
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
                id: 'aria-test-item',
                title: 'ARIA Test Item',
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

      // Gantt chart has role="img" and aria-label
      await expect(timelinePage.ganttChart).toHaveAttribute('role', 'img');
      const ariaLabel = await timelinePage.ganttChart.getAttribute('aria-label');
      expect(ariaLabel).toContain('Gantt chart');
      expect(ariaLabel).toContain('1 work item');
    } finally {
      await page.unroute('**/api/timeline');
    }
  });

  test('Gantt sidebar has role=list on the work items container', async ({ page }) => {
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
                id: 'role-test-item',
                title: 'Role Test Item',
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

      // Sidebar rows list has role=list and aria-label
      await expect(timelinePage.ganttSidebarRowsList).toHaveAttribute('role', 'list');
      await expect(timelinePage.ganttSidebarRowsList).toHaveAttribute('aria-label', 'Work items');
    } finally {
      await page.unroute('**/api/timeline');
    }
  });

  test('Zoom toolbar has role=toolbar and accessible label', async ({ page }) => {
    const timelinePage = new TimelinePage(page);
    await timelinePage.goto();

    await expect(timelinePage.zoomToolbar).toHaveAttribute('role', 'toolbar');
    await expect(timelinePage.zoomToolbar).toHaveAttribute('aria-label', 'Zoom level');
  });

  test('View toggle toolbar has role=toolbar and accessible label', async ({ page }) => {
    const timelinePage = new TimelinePage(page);
    await timelinePage.goto();

    const viewToolbar = page.getByRole('toolbar', { name: 'View mode' });
    await expect(viewToolbar).toBeVisible();
    await expect(viewToolbar).toHaveAttribute('role', 'toolbar');
  });

  test('Calendar mode toolbar has role=toolbar', async ({ page }) => {
    const timelinePage = new TimelinePage(page);
    await timelinePage.gotoCalendar();

    const modeToolbar = page.getByRole('toolbar', { name: 'Calendar display mode' });
    await expect(modeToolbar).toBeVisible();
  });
});
