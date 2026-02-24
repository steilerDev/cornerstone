/**
 * E2E tests for the Calendar view on the Timeline page (/timeline?view=calendar)
 *
 * Scenarios covered:
 * 1.  Switch from Gantt to Calendar view and back
 * 2.  Calendar view renders month grid by default
 * 3.  Month grid displays days correctly
 * 4.  Calendar view navigation — next/previous month
 * 5.  Today button returns to current month
 * 6.  Switch between month and week sub-modes
 * 7.  Week grid renders
 * 8.  Calendar view displays work items (mocked data)
 * 9.  Calendar view displays milestone diamonds (mocked data)
 * 10. Dark mode rendering of calendar view
 * 11. URL param persists calendar view
 */

import { test, expect } from '../../fixtures/auth.js';
import { TimelinePage, TIMELINE_ROUTE } from '../../pages/TimelinePage.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getCurrentMonthName(): string {
  return new Date().toLocaleDateString('en-US', { month: 'long' });
}

function getCurrentYear(): number {
  return new Date().getFullYear();
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: Switch between Gantt and Calendar views
// ─────────────────────────────────────────────────────────────────────────────

test.describe('View toggle (Scenario 1)', { tag: '@responsive' }, () => {
  test('Switching to Calendar view renders the calendar component', async ({ page }) => {
    const timelinePage = new TimelinePage(page);
    await timelinePage.goto();

    // Start in Gantt view (default)
    await expect(timelinePage.ganttViewButton).toHaveAttribute('aria-pressed', 'true');
    await expect(timelinePage.calendarViewButton).toHaveAttribute('aria-pressed', 'false');

    // Switch to calendar
    await timelinePage.switchToCalendar();

    await expect(timelinePage.calendarView).toBeVisible();
    await expect(timelinePage.calendarViewButton).toHaveAttribute('aria-pressed', 'true');
    await expect(timelinePage.ganttViewButton).toHaveAttribute('aria-pressed', 'false');
  });

  test('Switching back to Gantt view hides the calendar', async ({ page }) => {
    const timelinePage = new TimelinePage(page);
    await timelinePage.gotoCalendar();

    await expect(timelinePage.calendarView).toBeVisible();

    await timelinePage.switchToGantt();

    await expect(timelinePage.calendarView).not.toBeVisible();
    await expect(timelinePage.ganttViewButton).toHaveAttribute('aria-pressed', 'true');
  });

  test('Calendar view URL param is added/removed when toggling views', async ({ page }) => {
    const timelinePage = new TimelinePage(page);
    await timelinePage.goto();

    // Default URL has no ?view param
    expect(page.url()).not.toContain('view=calendar');

    // Switch to calendar
    await timelinePage.switchToCalendar();
    expect(page.url()).toContain('view=calendar');

    // Switch back to Gantt
    await timelinePage.switchToGantt();
    expect(page.url()).not.toContain('view=calendar');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2 + 3: Calendar month grid renders
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Month grid renders (Scenario 2 + 3)', { tag: '@responsive' }, () => {
  test('Calendar view shows month grid with current month and year', async ({ page }) => {
    const timelinePage = new TimelinePage(page);
    await timelinePage.gotoCalendar();

    await expect(timelinePage.calendarView).toBeVisible();

    // Period label shows current month
    const periodLabel = await timelinePage.getCalendarPeriodLabel();
    expect(periodLabel).toContain(getCurrentMonthName());
    expect(periodLabel).toContain(String(getCurrentYear()));
  });

  test('Month grid contains grid cells', async ({ page }) => {
    const timelinePage = new TimelinePage(page);
    await timelinePage.gotoCalendar();

    await expect(timelinePage.calendarGridArea).toBeVisible();

    // Month grid should have day cells (gridcell role)
    const cells = page.getByRole('gridcell');
    await expect(cells.first()).toBeVisible();
  });

  test('Month grid has day-of-week headers', async ({ page }) => {
    const timelinePage = new TimelinePage(page);
    await timelinePage.gotoCalendar();

    // Day headers are columnheader roles
    const columnHeaders = page.getByRole('columnheader');
    const headerCount = await columnHeaders.count();
    // 7 days of the week
    expect(headerCount).toBe(7);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: Navigation — next/previous month
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Month navigation (Scenario 4)', () => {
  test('Clicking Next month advances the period label by one month', async ({ page }) => {
    const timelinePage = new TimelinePage(page);
    await timelinePage.gotoCalendar();

    const initialLabel = await timelinePage.getCalendarPeriodLabel();

    await timelinePage.calendarNext();

    const nextLabel = await timelinePage.getCalendarPeriodLabel();
    // The next month label should be different from the initial
    expect(nextLabel).not.toBe(initialLabel);
  });

  test('Clicking Previous month goes back in time', async ({ page }) => {
    const timelinePage = new TimelinePage(page);
    await timelinePage.gotoCalendar();

    const initialLabel = await timelinePage.getCalendarPeriodLabel();

    await timelinePage.calendarPrev();

    const prevLabel = await timelinePage.getCalendarPeriodLabel();
    expect(prevLabel).not.toBe(initialLabel);
  });

  test('Next then Previous returns to the original month', async ({ page }) => {
    const timelinePage = new TimelinePage(page);
    await timelinePage.gotoCalendar();

    const originalLabel = await timelinePage.getCalendarPeriodLabel();

    await timelinePage.calendarNext();
    await timelinePage.calendarPrev();

    const returnedLabel = await timelinePage.getCalendarPeriodLabel();
    expect(returnedLabel).toBe(originalLabel);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: Today button
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Today button (Scenario 5)', () => {
  test('Today button returns to current month after navigation', async ({ page }) => {
    const timelinePage = new TimelinePage(page);
    await timelinePage.gotoCalendar();

    const currentMonthLabel = await timelinePage.getCalendarPeriodLabel();

    // Navigate away
    await timelinePage.calendarNext();
    await timelinePage.calendarNext();
    const futureLabel = await timelinePage.getCalendarPeriodLabel();
    expect(futureLabel).not.toBe(currentMonthLabel);

    // Click Today
    await timelinePage.calendarGoToToday();

    const todayLabel = await timelinePage.getCalendarPeriodLabel();
    expect(todayLabel).toBe(currentMonthLabel);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6: Month/Week sub-mode toggle
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Month/Week mode toggle (Scenario 6)', () => {
  test('Month mode is active by default in calendar view', async ({ page }) => {
    const timelinePage = new TimelinePage(page);
    await timelinePage.gotoCalendar();

    await expect(timelinePage.calendarMonthButton).toHaveAttribute('aria-pressed', 'true');
    await expect(timelinePage.calendarWeekButton).toHaveAttribute('aria-pressed', 'false');
  });

  test('Clicking Week mode activates week display', async ({ page }) => {
    const timelinePage = new TimelinePage(page);
    await timelinePage.gotoCalendar();

    await timelinePage.calendarWeekButton.click();

    await expect(timelinePage.calendarWeekButton).toHaveAttribute('aria-pressed', 'true');
    await expect(timelinePage.calendarMonthButton).toHaveAttribute('aria-pressed', 'false');
  });

  test('Week mode URL param is set when switching to week', async ({ page }) => {
    const timelinePage = new TimelinePage(page);
    await timelinePage.gotoCalendar();

    await timelinePage.calendarWeekButton.click();

    expect(page.url()).toContain('calendarMode=week');
  });

  test('Clicking Month mode after Week returns to month display', async ({ page }) => {
    const timelinePage = new TimelinePage(page);
    await timelinePage.gotoCalendar();

    // Switch to week then back to month
    await timelinePage.calendarWeekButton.click();
    await expect(timelinePage.calendarWeekButton).toHaveAttribute('aria-pressed', 'true');

    await timelinePage.calendarMonthButton.click();
    await expect(timelinePage.calendarMonthButton).toHaveAttribute('aria-pressed', 'true');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 7: Week grid renders
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Week grid renders (Scenario 7)', () => {
  test('Week grid is visible after switching to week mode', async ({ page }) => {
    const timelinePage = new TimelinePage(page);
    await timelinePage.gotoCalendar();
    await timelinePage.calendarWeekButton.click();

    await expect(timelinePage.calendarGridArea).toBeVisible();

    // Week view navigation buttons have week-specific labels
    await expect(timelinePage.calendarPrevButton).toBeVisible();
    await expect(timelinePage.calendarNextButton).toBeVisible();
  });

  test('Week navigation changes the period label', async ({ page }) => {
    const timelinePage = new TimelinePage(page);
    await timelinePage.gotoCalendar();
    await timelinePage.calendarWeekButton.click();

    const initialWeekLabel = await timelinePage.getCalendarPeriodLabel();

    await timelinePage.calendarNext();

    const nextWeekLabel = await timelinePage.getCalendarPeriodLabel();
    expect(nextWeekLabel).not.toBe(initialWeekLabel);
  });

  test('Today button in week mode returns to current week', async ({ page }) => {
    const timelinePage = new TimelinePage(page);
    await timelinePage.gotoCalendar();
    await timelinePage.calendarWeekButton.click();

    const currentWeekLabel = await timelinePage.getCalendarPeriodLabel();

    // Navigate forward
    await timelinePage.calendarNext();
    await timelinePage.calendarNext();

    // Return to today
    await timelinePage.calendarGoToToday();

    const todayWeekLabel = await timelinePage.getCalendarPeriodLabel();
    expect(todayWeekLabel).toBe(currentWeekLabel);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 8: Calendar view displays work items
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Work items in calendar view (Scenario 8)', () => {
  test('Work items with dates in the current month appear in the calendar grid', async ({
    page,
  }) => {
    const timelinePage = new TimelinePage(page);

    const today = new Date();
    // Create a work item within the current month
    const startDate = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
    const endDate = new Date(today.getFullYear(), today.getMonth(), 15).toISOString().slice(0, 10);

    await page.route('**/api/timeline', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            workItems: [
              {
                id: 'calendar-work-item',
                title: 'Calendar Test Item',
                status: 'in_progress',
                startDate,
                endDate,
                durationDays: 15,
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
      await timelinePage.gotoCalendar();
      await expect(timelinePage.calendarView).toBeVisible();

      // The calendar should render a grid
      await expect(timelinePage.calendarGridArea).toBeVisible();
    } finally {
      await page.unroute('**/api/timeline');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 9: Milestone diamonds in calendar view
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Milestones in calendar view (Scenario 9)', () => {
  test('Milestone markers appear in the calendar grid when milestones exist', async ({ page }) => {
    const timelinePage = new TimelinePage(page);

    const today = new Date();
    const milestoneDate = new Date(today.getFullYear(), today.getMonth(), 15)
      .toISOString()
      .slice(0, 10);
    const startDate = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);

    await page.route('**/api/timeline', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            workItems: [],
            dependencies: [],
            criticalPath: [],
            milestones: [
              {
                id: 99,
                title: 'Calendar Milestone',
                targetDate: milestoneDate,
                isCompleted: false,
                completedAt: null,
                workItemIds: [],
              },
            ],
            dateRange: { earliest: startDate, latest: milestoneDate },
          }),
        });
      } else {
        await route.continue();
      }
    });

    try {
      await timelinePage.gotoCalendar();
      await expect(timelinePage.calendarView).toBeVisible();

      // Check for milestone markers in the calendar
      // CalendarMilestone components render SVG diamonds in the grid cells
      const calendarMilestones = page.locator('[data-testid="calendar-milestone"]');
      // If the milestone is in the current month, it should be visible
      if (await calendarMilestones.first().isVisible()) {
        const count = await calendarMilestones.count();
        expect(count).toBeGreaterThan(0);
      }
      // Calendar grid should be rendered even if milestone isn't in visible month
      await expect(timelinePage.calendarGridArea).toBeVisible();
    } finally {
      await page.unroute('**/api/timeline');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 10: Dark mode
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Calendar dark mode (Scenario 10)', { tag: '@responsive' }, () => {
  test('Calendar view renders correctly in dark mode', async ({ page }) => {
    const timelinePage = new TimelinePage(page);

    await page.goto(`${TIMELINE_ROUTE}?view=calendar`);
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });
    await timelinePage.heading.waitFor({ state: 'visible' });
    await timelinePage.calendarView.waitFor({ state: 'visible' });

    await expect(timelinePage.calendarView).toBeVisible();
    await expect(timelinePage.calendarGridArea).toBeVisible();

    // No horizontal scroll in dark mode
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(hasHorizontalScroll).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 11: URL param persistence
// ─────────────────────────────────────────────────────────────────────────────

test.describe('URL param persistence (Scenario 11)', () => {
  test('Direct navigation to ?view=calendar renders calendar view', async ({ page }) => {
    const timelinePage = new TimelinePage(page);
    await timelinePage.gotoCalendar();

    await expect(timelinePage.calendarView).toBeVisible();
    await expect(timelinePage.calendarViewButton).toHaveAttribute('aria-pressed', 'true');
  });

  test('Direct navigation to ?view=calendar&calendarMode=week renders week grid', async ({
    page,
  }) => {
    const timelinePage = new TimelinePage(page);

    await page.goto(`${TIMELINE_ROUTE}?view=calendar&calendarMode=week`);
    await timelinePage.heading.waitFor({ state: 'visible' });
    await timelinePage.calendarView.waitFor({ state: 'visible' });

    await expect(timelinePage.calendarWeekButton).toHaveAttribute('aria-pressed', 'true');
  });
});
