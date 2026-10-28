/**
 * E2E tests for responsive layout and accessibility on the Schedule page (/schedule)
 *
 * Scenarios covered:
 * 1.  Timeline page renders without horizontal scroll on all viewports (@responsive)
 * 2.  Mobile: page loads with heading and toolbar
 * 3.  Tablet: Gantt chart is accessible/visible
 * 4.  Keyboard navigation on Gantt sidebar items
 * 5.  Dark mode — no horizontal scroll on all viewports
 * 6.  Calendar view renders without horizontal scroll on all viewports
 * 7.  ARIA roles and labels on key elements
 * 8.  AC7 (#2247): phone Agenda default, Chart one tap away, sticky name column, bottom sheet
 *
 * The Schedule view is a per-user preference (phone view, zoom, Show), so the file runs as a
 * dedicated user and starts every test from the defaults.
 */

import { test, expect } from '../../fixtures/isolatedUser.js';
import {
  buildScheduleScenario,
  buildTimeline,
  mockWorkItem,
  SCHEDULE_IDS,
} from '../../fixtures/timelineMocks.js';
import { AppShellPage } from '../../pages/AppShellPage.js';
import { TimelinePage, TIMELINE_ROUTE } from '../../pages/TimelinePage.js';

test.use({ isolatedUserPerWorker: { emailPrefix: 'sched-resp' } });

test.beforeEach(async ({ page }) => {
  await new TimelinePage(page).resetViewPreference();
});

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
    await expect(timelinePage.heading).toHaveText('Schedule');
  });

  test('View entries are reachable from the title menu on phones and tablets', async ({ page }) => {
    const timelinePage = new TimelinePage(page);
    await timelinePage.goto();

    await new AppShellPage(page).revealViews();
    await expect(timelinePage.ganttViewButton).toBeVisible();
    await expect(timelinePage.calendarViewButton).toBeVisible();
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

    await timelinePage.mockTimeline(
      buildTimeline({
        workItems: [
          mockWorkItem({
            id: 'tablet-item',
            title: 'Tablet Test Item',
            status: 'not_started',
            startDate: startDate,
            endDate: endDate,
            durationDays: 30,
          }),
        ],
        milestones: [],
      }),
    );

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

    await timelinePage.mockTimeline(
      buildTimeline({
        workItems: [
          mockWorkItem({
            id: 'kb-item-1',
            title: 'First Item',
            status: 'not_started',
            startDate: startDate,
            endDate: endDate,
            durationDays: 30,
          }),
          mockWorkItem({
            id: 'kb-item-2',
            title: 'Second Item',
            status: 'not_started',
            startDate: startDate,
            endDate: endDate,
            durationDays: 30,
          }),
        ],
        milestones: [],
      }),
    );

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

  test('Pressing Enter on a sidebar row opens the panel; Escape closes it and returns focus', async ({
    page,
  }) => {
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

    await timelinePage.mockTimeline(
      buildTimeline({
        workItems: [
          mockWorkItem({
            id: 'enter-nav-item',
            title: 'Enter Nav Item',
            status: 'not_started',
            startDate: startDate,
            endDate: endDate,
            durationDays: 30,
          }),
        ],
        milestones: [],
      }),
    );

    try {
      await timelinePage.goto();
      await timelinePage.waitForLoaded();

      const row = page.getByTestId('gantt-sidebar-row-enter-nav-item');
      await row.waitFor({ state: 'visible' });
      await row.focus();

      // Enter opens the panel (no navigation: "Open task" navigates)
      await page.keyboard.press('Enter');
      await expect(timelinePage.panel).toContainText('Enter Nav Item');
      expect(new URL(page.url()).pathname).toBe('/schedule/gantt');

      // Escape closes it and focus returns to the row that opened it
      await page.keyboard.press('Escape');
      await expect(timelinePage.panel).toBeHidden();
      await expect(row).toBeFocused();
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
  test('Chart container is a labelled group (not an image)', async ({ page }) => {
    const timelinePage = new TimelinePage(page);

    const today = new Date();
    const startDate = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
    const endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0)
      .toISOString()
      .slice(0, 10);

    await timelinePage.mockTimeline(
      buildTimeline({
        workItems: [
          mockWorkItem({
            id: 'aria-test-item',
            title: 'ARIA Test Item',
            status: 'not_started',
            startDate: startDate,
            endDate: endDate,
            durationDays: 30,
          }),
        ],
        milestones: [],
      }),
    );

    try {
      await timelinePage.goto();
      await timelinePage.showChart();

      // The bars are pointer targets in an aria-hidden SVG; the rows are the keyboard model
      await expect(timelinePage.ganttChart).toHaveAttribute('role', 'group');
      await expect(timelinePage.ganttChart).toHaveAttribute('aria-label', 'Schedule chart');
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

    await timelinePage.mockTimeline(
      buildTimeline({
        workItems: [
          mockWorkItem({
            id: 'role-test-item',
            title: 'Role Test Item',
            status: 'not_started',
            startDate: startDate,
            endDate: endDate,
            durationDays: 30,
          }),
        ],
        milestones: [],
      }),
    );

    try {
      await timelinePage.goto();
      await timelinePage.showChart();

      // Sidebar rows list has role=list and aria-label (t('ganttSidebar.ariaLabel'))
      await expect(timelinePage.ganttSidebarRowsList).toHaveAttribute('role', 'list');
      await expect(timelinePage.ganttSidebarRowsList).toHaveAttribute(
        'aria-label',
        'Tasks, milestones and purchases',
      );
      // Each row is a button inside a list item
      await expect(
        timelinePage.ganttSidebarRowsList.getByRole('listitem').getByRole('button').first(),
      ).toBeVisible();
    } finally {
      await page.unroute('**/api/timeline');
    }
  });

  test('Zoom control is a labelled group of toggle buttons', async ({ page }) => {
    const timelinePage = new TimelinePage(page);
    await timelinePage.mockTimeline(
      buildTimeline({
        workItems: [
          mockWorkItem({
            id: 'zoom-aria-item',
            title: 'Zoom ARIA Item',
            status: 'not_started',
            startDate: '2030-01-01',
            endDate: '2030-01-31',
          }),
        ],
      }),
    );

    try {
      await timelinePage.goto();
      await timelinePage.showChart();

      await expect(timelinePage.zoomToolbar).toHaveAttribute('role', 'group');
      await expect(timelinePage.zoomToolbar).toHaveAttribute('aria-label', 'Zoom');
      await expect(timelinePage.zoomButton('Month')).toHaveAttribute('aria-pressed', 'true');
    } finally {
      await timelinePage.unmockTimeline();
    }
  });

  test('Tasks views are listed in the main navigation or the title menu', async ({ page }) => {
    const timelinePage = new TimelinePage(page);
    const appShell = new AppShellPage(page);
    await timelinePage.goto();

    // #2205: the Schedule tab row is gone; its views are sidebar links under Tasks
    await appShell.revealViews();
    await expect(appShell.nav).toBeVisible();
    // Below 1024px the title menu marks the current row with a check mark: match by substring
    await expect(appShell.viewLinks).toHaveCount(3);
    await expect(appShell.viewLinks).toContainText(['Schedule', 'Calendar', 'Milestones']);
    await expect(appShell.viewLink('scheduleGantt')).toHaveAttribute('aria-current', 'page');
  });

  test('Calendar mode toolbar has role=toolbar', async ({ page }) => {
    const timelinePage = new TimelinePage(page);
    await timelinePage.gotoCalendar();

    const modeToolbar = page.getByRole('toolbar', { name: 'Calendar display mode' });
    await expect(modeToolbar).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 8 (AC7): phone Agenda, Chart one tap away, sticky names, bottom sheet
// ─────────────────────────────────────────────────────────────────────────────

test.describe(
  'Phone: Agenda first, Chart one tap away (Scenario 8, AC7)',
  { tag: '@responsive' },
  () => {
    test('The Agenda is the default and starts at the current week', async ({ page }) => {
      const timelinePage = new TimelinePage(page);
      await timelinePage.mockTimeline(buildScheduleScenario());

      try {
        await timelinePage.goto();
        test.skip((await timelinePage.surface()) !== 'agenda', 'The Agenda is the phone surface');

        await expect(timelinePage.agenda).toBeVisible();
        await expect(timelinePage.ganttChart).toHaveCount(0);
        // Zoom and Group only act on the chart: the Agenda has neither
        await expect(timelinePage.zoomToolbar).toHaveCount(0);
        await expect(timelinePage.groupTrigger).toHaveCount(0);
        // The current week is marked and in view at the top
        const current = timelinePage.agenda.locator('[aria-current="date"]').first();
        await expect(current).toBeInViewport();
        const box = await current.boundingBox();
        const height = page.viewportSize()?.height ?? 0;
        expect(box!.y).toBeLessThan(height / 2);
        // Rows of the scenario are there
        await expect(timelinePage.agendaRow(`task:${SCHEDULE_IDS.foundation}`)).toBeVisible();
      } finally {
        await timelinePage.unmockTimeline();
      }
    });

    test('The Chart is one tap away and the name column stays visible after scrolling sideways', async ({
      page,
    }) => {
      const timelinePage = new TimelinePage(page);
      await timelinePage.mockTimeline(buildScheduleScenario());

      try {
        await timelinePage.goto();
        test.skip((await timelinePage.surface()) !== 'agenda', 'The Agenda is the phone surface');

        await expect(timelinePage.phoneViewAgenda).toHaveAttribute('aria-pressed', 'true');
        await timelinePage.phoneViewChart.click();
        await expect(timelinePage.ganttChart).toBeVisible();
        await expect(timelinePage.phoneViewChart).toHaveAttribute('aria-pressed', 'true');
        await expect(timelinePage.agenda).toHaveCount(0);

        // Scroll the canvas sideways: the sticky name column does not move
        const row = timelinePage.ganttSidebarRow(SCHEDULE_IDS.foundation);
        await expect(row).toBeVisible();
        const before = await row.boundingBox();
        await timelinePage.canvasScroll.evaluate((el) => {
          el.scrollLeft = el.scrollLeft + 300;
        });
        await expect
          .poll(async () => (await timelinePage.scrollPosition()).left)
          .toBeGreaterThan(0);
        await expect(row).toBeVisible();
        const after = await row.boundingBox();
        expect(after!.x).toBeCloseTo(before!.x, 0);
        expect(after!.y).toBeCloseTo(before!.y, 0);
        await expect(timelinePage.ganttSidebar).toBeInViewport();

        // And back to the Agenda
        await timelinePage.phoneViewAgenda.click();
        await expect(timelinePage.agenda).toBeVisible();
      } finally {
        await timelinePage.unmockTimeline();
      }
    });

    test('A tap on an Agenda row or a bar opens the bottom sheet', async ({ page }) => {
      const timelinePage = new TimelinePage(page);
      await timelinePage.mockTimeline(buildScheduleScenario());

      try {
        await timelinePage.goto();
        test.skip((await timelinePage.surface()) !== 'agenda', 'The Agenda is the phone surface');

        const viewport = page.viewportSize()!;
        const expectBottomSheet = async () => {
          await expect(timelinePage.panel).toBeVisible();
          expect(await timelinePage.panelIsDocked()).toBe(false);
          await expect(timelinePage.panel).toHaveAttribute('aria-modal', 'true');
          await expect(async () => {
            const box = await timelinePage.panel.boundingBox();
            // A bottom sheet: as wide as the screen and resting on its bottom edge
            expect(box!.width).toBeGreaterThanOrEqual(viewport.width - 1);
            expect(box!.y + box!.height).toBeGreaterThanOrEqual(viewport.height - 1);
          }).toPass();
        };

        await timelinePage.openTaskPanel(SCHEDULE_IDS.foundation);
        await expectBottomSheet();
        await timelinePage.closePanel();

        // The same from the chart: a tap on a bar
        await timelinePage.phoneViewChart.click();
        await timelinePage.ganttBar(SCHEDULE_IDS.foundation).click();
        await expect(timelinePage.panel).toContainText('Sched Foundation');
        await expectBottomSheet();
        expect(new URL(page.url()).pathname).toBe('/schedule/gantt');
      } finally {
        await timelinePage.unmockTimeline();
      }
    });
  },
);
