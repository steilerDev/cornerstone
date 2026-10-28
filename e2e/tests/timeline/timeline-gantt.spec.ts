/**
 * E2E tests for the Schedule chart view (/schedule/gantt)
 *
 * Scenarios covered:
 * 1.  Schedule page loads and shows the Schedule heading
 * 2.  The chart renders when tasks have dates (mocked); skeleton while loading
 * 3.  Sidebar shows the task list
 * 4.  Chart header (time grid) renders
 * 5.  Zoom controls switch between Day/Week/Month
 * 6.  Show menu: Dependency arrows toggle (and the Calendar's reduced menu)
 * 7.  Empty state shown when no tasks exist
 * 8.  No-dates state shown when tasks have no dates
 * 9.  Clicking a sidebar row opens the panel; "Open task" navigates to the task page
 * 10. Dark mode
 * 11. AC1: title, today in view, Done hidden, critical highlighted
 * 12. AC1: Show, zoom and Group are remembered across a reload; a shared URL wins
 * 13. AC2: the toolbar items, no primary button, no Add menu, Subscribe lands on Settings
 * 14. AC3: a late task has the hatch overlay and the planned ghost; row line 2
 * 15. AC3: Group by area with the "No area" group; the area chip includes descendants
 * 16. The legend
 *
 * The Schedule view state is a per-user preference (`schedule.view`), so this file runs as a
 * dedicated user and starts every test from the defaults. On the phone the Agenda is the default
 * surface: tests that are about the chart switch to it with `showChart()`.
 */

import { test, expect } from '../../fixtures/isolatedUser.js';
import {
  buildScheduleScenario,
  buildWideScheduleScenario,
  buildTimeline,
  mockWorkItem,
  SCHEDULE_IDS,
  daysFromToday,
} from '../../fixtures/timelineMocks.js';
import { AppShellPage } from '../../pages/AppShellPage.js';
import { TimelinePage, TIMELINE_ROUTE } from '../../pages/TimelinePage.js';
import {
  createAreaViaApi,
  createWorkItemViaApi,
  deleteAreaViaApi,
  deleteWorkItemViaApi,
} from '../../fixtures/apiHelpers.js';
import { routeUrl } from '../../../shared/src/routes/index.js';

test.use({ isolatedUserPerWorker: { emailPrefix: 'sched-gantt' } });

test.beforeEach(async ({ page }) => {
  // The stored view is per user and survives between this worker's tests: start from defaults
  await new TimelinePage(page).resetViewPreference();
});

/** One mocked task with dates in the current month. */
function monthTask(
  id: string,
  title: string,
  status: 'not_started' | 'in_progress' = 'not_started',
) {
  const today = new Date();
  const startDate = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);
  return mockWorkItem({ id, title, status, startDate, endDate, durationDays: 30 });
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 1: Page loads with h1 "Schedule"
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Page load (Scenario 1)', { tag: '@responsive' }, () => {
  test('Schedule page loads with h1 "Schedule"', { tag: '@smoke' }, async ({ page }) => {
    const timelinePage = new TimelinePage(page);
    await timelinePage.goto();

    await expect(timelinePage.heading).toBeVisible();
    await expect(timelinePage.heading).toHaveText('Schedule');
  });

  test('Page URL is /schedule/gantt', async ({ page }) => {
    await page.goto(TIMELINE_ROUTE);
    await page.waitForURL('**/schedule/gantt');
    expect(page.url()).toContain('/schedule/gantt');
  });

  test('The Tasks views list Schedule and Calendar', async ({ page }) => {
    const timelinePage = new TimelinePage(page);
    await timelinePage.goto();

    await new AppShellPage(page).revealViews();
    await expect(timelinePage.ganttViewButton).toBeVisible();
    await expect(timelinePage.calendarViewButton).toBeVisible();
  });

  test('There is no Add button: creating goes through the global New menu', async ({ page }) => {
    const timelinePage = new TimelinePage(page);
    await timelinePage.goto();
    await timelinePage.waitForLoaded();

    await expect(page.getByTestId('timeline-add-button')).toHaveCount(0);
    await expect(
      page.getByTestId('timeline-page').getByRole('button', { name: /^(Add|New)$/ }),
    ).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 2: the chart renders with mocked tasks that have dates
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Chart renders (Scenario 2)', () => {
  test('Chart container is visible when tasks with dates are present', async ({ page }) => {
    const timelinePage = new TimelinePage(page);
    await timelinePage.mockTimeline(
      buildTimeline({ workItems: [monthTask('mock-item-1', 'Mock Gantt Item', 'in_progress')] }),
    );

    try {
      await timelinePage.goto();
      await timelinePage.showChart();

      await expect(timelinePage.ganttChart).toBeVisible();
      await expect(timelinePage.ganttSvg).toBeVisible();
    } finally {
      await timelinePage.unmockTimeline();
    }
  });

  test('Chart skeleton is shown while data loads (mocked slow response)', async ({ page }) => {
    const timelinePage = new TimelinePage(page);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/api/timeline', async (route) => {
      await gate;
      await route.continue();
    });

    try {
      void page.goto(TIMELINE_ROUTE);
      await timelinePage.ganttSkeleton.waitFor({ state: 'visible' });
    } finally {
      // Let the held request go and wait for it to be served before the route is removed
      release();
      await timelinePage.waitForLoaded();
      await page.unroute('**/api/timeline');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: sidebar
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Sidebar (Scenario 3)', () => {
  test('Sidebar is visible and lists the tasks when data loads', async ({ page }) => {
    const timelinePage = new TimelinePage(page);
    await timelinePage.mockTimeline(
      buildTimeline({
        workItems: [
          monthTask('sidebar-item-1', 'Foundation Work'),
          monthTask('sidebar-item-2', 'Framing'),
        ],
      }),
    );

    try {
      await timelinePage.goto();
      await timelinePage.showChart();

      await expect(timelinePage.ganttSidebar).toBeVisible();
      await expect(timelinePage.ganttSidebarRowsList).toBeVisible();

      const labels = await timelinePage.getSidebarItemLabels();
      // Labels include the "Task: {title}" prefix from the row button's aria-label
      expect(labels.some((l) => l.includes('Foundation Work'))).toBe(true);
      expect(labels.some((l) => l.includes('Framing'))).toBe(true);
    } finally {
      await timelinePage.unmockTimeline();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: header
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Chart header (Scenario 4)', () => {
  test('Header is visible when the chart is rendered', async ({ page }) => {
    const timelinePage = new TimelinePage(page);
    await timelinePage.mockTimeline(
      buildTimeline({ workItems: [monthTask('header-item', 'Header Test Item')] }),
    );

    try {
      await timelinePage.goto();
      await timelinePage.showChart();

      await expect(timelinePage.ganttHeader).toBeVisible();
    } finally {
      await timelinePage.unmockTimeline();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: zoom
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Zoom controls (Scenario 5)', () => {
  test.beforeEach(async ({ page }) => {
    const timelinePage = new TimelinePage(page);
    await timelinePage.mockTimeline(
      buildTimeline({ workItems: [monthTask('zoom-item', 'Zoom Item')] }),
    );
    await timelinePage.goto();
    await timelinePage.showChart();
  });

  test.afterEach(async ({ page }) => {
    await new TimelinePage(page).unmockTimeline();
  });

  test('Zoom group renders with Day, Week, Month buttons', async ({ page }) => {
    const timelinePage = new TimelinePage(page);

    await expect(timelinePage.zoomToolbar).toBeVisible();
    for (const level of ['Day', 'Week', 'Month'] as const) {
      await expect(timelinePage.zoomButton(level)).toBeVisible();
    }
  });

  test('Month is the default active zoom level', async ({ page }) => {
    const timelinePage = new TimelinePage(page);

    await expect(timelinePage.zoomButton('Month')).toHaveAttribute('aria-pressed', 'true');
    expect((await timelinePage.getActiveZoom())?.trim()).toBe('Month');
  });

  for (const level of ['Day', 'Week'] as const) {
    test(`Clicking ${level} makes it the active zoom level and writes it to the URL`, async ({
      page,
    }) => {
      const timelinePage = new TimelinePage(page);

      await timelinePage.setZoom(level);

      await expect(timelinePage.zoomButton(level)).toHaveAttribute('aria-pressed', 'true');
      await expect(page).toHaveURL(new RegExp(`[?&]zoom=${level.toLowerCase()}`));
    });
  }

  test('Clicking Month again removes the default from the URL', async ({ page }) => {
    const timelinePage = new TimelinePage(page);

    await timelinePage.setZoom('Week');
    await timelinePage.setZoom('Month');

    await expect(timelinePage.zoomButton('Month')).toHaveAttribute('aria-pressed', 'true');
    await expect(page).not.toHaveURL(/[?&]zoom=/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6: Show menu, Dependency arrows
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Show menu: dependency arrows (Scenario 6)', () => {
  test('Dependency arrows are on by default and toggle in the Show menu', async ({ page }) => {
    const timelinePage = new TimelinePage(page);
    await timelinePage.mockTimeline(buildScheduleScenario());

    try {
      await timelinePage.goto();
      await timelinePage.showChart();

      await timelinePage.openShowMenu();
      await expect(timelinePage.showItem('arrows')).toHaveAttribute('aria-checked', 'true');
      await expect(page.getByTestId('gantt-arrows')).not.toHaveAttribute('aria-hidden', 'true');

      await timelinePage.toggleShow('arrows');
      await expect(timelinePage.showItem('arrows')).toHaveAttribute('aria-checked', 'false');
      await expect(page.getByTestId('gantt-arrows')).toHaveAttribute('aria-hidden', 'true');

      await timelinePage.toggleShow('arrows');
      await expect(timelinePage.showItem('arrows')).toHaveAttribute('aria-checked', 'true');
      await expect(page.getByTestId('gantt-arrows')).not.toHaveAttribute('aria-hidden', 'true');
    } finally {
      await timelinePage.unmockTimeline();
    }
  });

  test('The Show trigger counts what differs from the defaults', async ({ page }) => {
    const timelinePage = new TimelinePage(page);
    await timelinePage.mockTimeline(buildScheduleScenario());

    try {
      await timelinePage.goto();
      await timelinePage.showChart();

      await expect(timelinePage.showTrigger).toHaveAccessibleName('Show');
      await timelinePage.toggleShow('arrows');
      await expect(timelinePage.showTrigger).toHaveAccessibleName('Show · 1 changed');
      await timelinePage.toggleShow('done');
      await expect(timelinePage.showTrigger).toHaveAccessibleName('Show · 2 changed');
    } finally {
      await timelinePage.unmockTimeline();
    }
  });

  test('The last shown kind cannot be hidden', async ({ page }) => {
    const timelinePage = new TimelinePage(page);
    await timelinePage.mockTimeline(buildScheduleScenario());

    try {
      await timelinePage.goto();
      await timelinePage.showChart();

      await timelinePage.toggleShow('milestones');
      await timelinePage.toggleShow('purchases');
      await expect(timelinePage.showItem('tasks')).toHaveAttribute('aria-disabled', 'true');
      // Activating it is a no-op: Tasks stay shown
      await timelinePage.showItem('tasks').click({ force: true });
      await expect(timelinePage.showItem('tasks')).toHaveAttribute('aria-checked', 'true');
      await expect(timelinePage.ganttSidebarRow(SCHEDULE_IDS.foundation)).toBeVisible();
    } finally {
      await timelinePage.unmockTimeline();
    }
  });

  test("The Calendar's Show menu has the three kinds only", async ({ page }) => {
    const timelinePage = new TimelinePage(page);
    await timelinePage.gotoCalendar();

    await timelinePage.openShowMenu();
    for (const key of ['tasks', 'milestones', 'purchases'] as const) {
      await expect(timelinePage.showItem(key)).toBeVisible();
    }
    for (const key of ['arrows', 'critical', 'done'] as const) {
      await expect(timelinePage.showItem(key)).toHaveCount(0);
    }
    await expect(timelinePage.zoomToolbar).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenarios 7 and 8: empty and no-dates states
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Empty state: no tasks (Scenario 7)', () => {
  test('Empty state renders when the API returns no tasks', async ({ page }) => {
    const timelinePage = new TimelinePage(page);
    await timelinePage.mockTimeline(buildTimeline());

    try {
      await timelinePage.goto();
      await timelinePage.emptyState.waitFor({ state: 'visible' });

      await expect(timelinePage.emptyState).toContainText('Nothing is scheduled yet');
      await expect(
        timelinePage.emptyState.getByRole('link', { name: 'Go to Tasks' }),
      ).toHaveAttribute('href', routeUrl('workItems'));
    } finally {
      await timelinePage.unmockTimeline();
    }
  });
});

test.describe('No-dates state (Scenario 8)', () => {
  test('No-dates state renders when tasks have no start/end dates', async ({ page }) => {
    const timelinePage = new TimelinePage(page);
    await timelinePage.mockTimeline(
      buildTimeline({
        workItems: [
          mockWorkItem({ id: 'undated-1', title: 'Undated Task', status: 'not_started' }),
        ],
      }),
    );

    try {
      await timelinePage.goto();
      await timelinePage.noDatesState.waitFor({ state: 'visible' });

      await expect(timelinePage.noDatesState).toContainText('No task has dates yet');
      await expect(
        timelinePage.noDatesState.getByRole('link', { name: 'Go to Tasks' }),
      ).toBeVisible();
    } finally {
      await timelinePage.unmockTimeline();
    }
  });

  test('A Show / area selection that leaves nothing explains itself', async ({ page }) => {
    const timelinePage = new TimelinePage(page);
    // Only a completed task: Done is off by default, so nothing is shown
    await timelinePage.mockTimeline(
      buildTimeline({
        workItems: [
          mockWorkItem({
            id: 'only-done',
            title: 'Only Done',
            status: 'completed',
            startDate: daysFromToday(-9),
            endDate: daysFromToday(-5),
            actualStartDate: daysFromToday(-9),
            actualEndDate: daysFromToday(-5),
          }),
        ],
      }),
    );

    try {
      await timelinePage.goto();
      await timelinePage.filteredEmpty.waitFor({ state: 'visible' });
      await expect(timelinePage.filteredEmpty).toContainText('Nothing to show');

      await timelinePage.toggleShow('done');
      await expect(timelinePage.filteredEmpty).toHaveCount(0);
      await expect(
        timelinePage.ganttSidebarRow('only-done').or(timelinePage.agendaRow('task:only-done')),
      ).toBeVisible();
    } finally {
      await timelinePage.unmockTimeline();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 9: a row opens the panel; "Open task" navigates
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Row opens the panel (Scenario 9)', () => {
  test('Clicking a row opens the panel without leaving; "Open task" goes to the task page', async ({
    page,
    testPrefix,
  }) => {
    const timelinePage = new TimelinePage(page);
    const title = `${testPrefix} Sidebar Nav Item`;
    let createdId: string | null = null;

    try {
      createdId = await createWorkItemViaApi(page, {
        title,
        startDate: daysFromToday(-2),
        endDate: daysFromToday(5),
      });

      await timelinePage.goto();
      await timelinePage.waitForLoaded();
      await timelinePage.openTaskPanel(createdId);

      // The panel names the row; the page did not navigate
      await expect(timelinePage.panel).toContainText(title);
      expect(new URL(page.url()).pathname).toBe(routeUrl('scheduleGantt'));

      await timelinePage.openTaskPage();
      await page.waitForURL(`**/project/work-items/${createdId}`);
      expect(page.url()).toContain(`/project/work-items/${createdId}`);
    } finally {
      if (createdId) await deleteWorkItemViaApi(page, createdId);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 10: dark mode
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Dark mode rendering (Scenario 10)', { tag: '@responsive' }, () => {
  test('Schedule page renders correctly in dark mode', async ({ page }) => {
    const timelinePage = new TimelinePage(page);

    await page.goto(TIMELINE_ROUTE);
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });
    await timelinePage.heading.waitFor({ state: 'visible' });

    await expect(timelinePage.heading).toBeVisible();
    await new AppShellPage(page).revealViews();
    await expect(timelinePage.ganttViewButton).toBeVisible();
    await expect(timelinePage.calendarViewButton).toBeVisible();

    // No horizontal scroll in dark mode
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(hasHorizontalScroll).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 11 (AC1): title, today in view, Done hidden, critical highlighted
// ─────────────────────────────────────────────────────────────────────────────

test.describe('First look (Scenario 11, AC1)', { tag: '@responsive' }, () => {
  test('Title, today in view, Done hidden and the critical path highlighted', async ({ page }) => {
    const timelinePage = new TimelinePage(page);
    await timelinePage.mockTimeline(buildScheduleScenario());

    try {
      await timelinePage.goto();
      await timelinePage.showChart();
      await expect(timelinePage.heading).toHaveText('Schedule');

      // Today is brought into view on the first load
      await expect(async () => {
        expect(await timelinePage.todayInView()).toBe(true);
      }).toPass();

      // Done is off by default: the completed task has no row and no bar
      await expect(timelinePage.ganttSidebarRow(SCHEDULE_IDS.foundation)).toBeVisible();
      await expect(timelinePage.ganttSidebarRow(SCHEDULE_IDS.excavation)).toHaveCount(0);
      await expect(timelinePage.ganttBar(SCHEDULE_IDS.excavation)).toHaveCount(0);

      // The critical task's bar carries the critical outline, the others do not
      const criticalRect = timelinePage.ganttBar(SCHEDULE_IDS.foundation).locator('rect').first();
      const plainRect = timelinePage.ganttBar(SCHEDULE_IDS.framing).locator('rect').first();
      await expect(criticalRect).toHaveAttribute('stroke', /.+/);
      await expect(plainRect).not.toHaveAttribute('stroke', /.+/);

      // Turning Critical path off removes the outline; Done on adds the completed row
      await timelinePage.toggleShow('critical');
      await expect(criticalRect).not.toHaveAttribute('stroke', /.+/);
      await timelinePage.toggleShow('done');
      await expect(timelinePage.ganttSidebarRow(SCHEDULE_IDS.excavation)).toBeVisible();
    } finally {
      await timelinePage.unmockTimeline();
    }
  });

  test('Today jumps the chart back to the present', async ({ page }) => {
    const timelinePage = new TimelinePage(page);
    await timelinePage.mockTimeline(buildWideScheduleScenario());

    try {
      await timelinePage.goto();
      await timelinePage.showChart();
      await expect(async () => {
        expect(await timelinePage.todayInView()).toBe(true);
      }).toPass();

      // Scroll far to the right, then use Today
      await timelinePage.canvasScroll.evaluate((el) => {
        el.scrollLeft = el.scrollWidth;
      });
      await expect(async () => {
        expect(await timelinePage.todayInView()).toBe(false);
      }).toPass();

      await timelinePage.todayButton.click();
      await expect(async () => {
        expect(await timelinePage.todayInView()).toBe(true);
      }).toPass();
    } finally {
      await timelinePage.unmockTimeline();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 12 (AC1): Show, zoom and Group are remembered
// ─────────────────────────────────────────────────────────────────────────────

test.describe('View state is remembered (Scenario 12, AC1)', () => {
  test('Show, zoom and Group survive a reload through the preference', async ({ page }) => {
    const timelinePage = new TimelinePage(page);
    await timelinePage.mockTimeline(buildScheduleScenario());

    try {
      await timelinePage.goto();
      await timelinePage.showChart();

      await timelinePage.setZoom('Week');
      await timelinePage.toggleShow('done');
      await timelinePage.closeMenus();
      await timelinePage.setGroup('area');
      await timelinePage.closeMenus();

      // The change is written to the URL ...
      await expect(page).toHaveURL(/[?&]zoom=week/);
      await expect(page).toHaveURL(/[?&]group=area/);
      await expect(page).toHaveURL((url) =>
        (url.searchParams.get('show') ?? '').split(',').includes('done'),
      );

      // ... and saved as the preference (fire and forget: wait until the server has it)
      await expect
        .poll(async () => {
          const stored = await timelinePage.storedView();
          return stored ? `${String(stored.zoom)}|${String(stored.group)}` : null;
        })
        .toBe('week|area');

      // A clean address now restores the same view
      await page.goto(TIMELINE_ROUTE);
      await timelinePage.showChart();
      await expect(timelinePage.zoomButton('Week')).toHaveAttribute('aria-pressed', 'true');
      await expect(timelinePage.groupTrigger).toHaveAccessibleName('Group: Area');
      await timelinePage.openShowMenu();
      await expect(timelinePage.showItem('done')).toHaveAttribute('aria-checked', 'true');
    } finally {
      await timelinePage.unmockTimeline();
    }
  });

  test('A shared address wins over the stored preference', async ({ page }) => {
    const timelinePage = new TimelinePage(page);
    await timelinePage.mockTimeline(buildScheduleScenario());

    try {
      // Store Week first ...
      await timelinePage.goto();
      await timelinePage.showChart();
      await timelinePage.setZoom('Week');
      await expect.poll(async () => (await timelinePage.storedView())?.zoom).toBe('week');

      // ... then open an address that asks for Day and only Tasks + Done
      await page.goto(`${TIMELINE_ROUTE}?zoom=day&show=tasks,done`);
      await timelinePage.showChart();
      await expect(timelinePage.zoomButton('Day')).toHaveAttribute('aria-pressed', 'true');
      await timelinePage.openShowMenu();
      await expect(timelinePage.showItem('tasks')).toHaveAttribute('aria-checked', 'true');
      await expect(timelinePage.showItem('done')).toHaveAttribute('aria-checked', 'true');
      await expect(timelinePage.showItem('milestones')).toHaveAttribute('aria-checked', 'false');
      await expect(timelinePage.showItem('arrows')).toHaveAttribute('aria-checked', 'false');
    } finally {
      await timelinePage.unmockTimeline();
    }
  });

  test('A legacy ?filter= address is converted to the Show selection', async ({ page }) => {
    const timelinePage = new TimelinePage(page);
    await timelinePage.mockTimeline(buildScheduleScenario());

    try {
      await page.goto(`${TIMELINE_ROUTE}?filter=work-items`);
      await timelinePage.showChart();

      await expect(page).not.toHaveURL(/[?&]filter=/);
      await timelinePage.openShowMenu();
      await expect(timelinePage.showItem('tasks')).toHaveAttribute('aria-checked', 'true');
      await expect(timelinePage.showItem('milestones')).toHaveAttribute('aria-checked', 'false');
      await expect(timelinePage.showItem('purchases')).toHaveAttribute('aria-checked', 'false');
    } finally {
      await timelinePage.unmockTimeline();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 13 (AC2): toolbar
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Toolbar (Scenario 13, AC2)', () => {
  test('Zoom, Show, Group, the area chip, Today, More and Legend; no primary button', async ({
    page,
  }) => {
    const timelinePage = new TimelinePage(page);
    await timelinePage.mockTimeline(buildScheduleScenario());

    try {
      await timelinePage.goto();
      await timelinePage.showChart();

      await expect(timelinePage.toolbar).toBeVisible();
      await expect(timelinePage.zoomToolbar).toBeVisible();
      await expect(timelinePage.showTrigger).toBeVisible();
      await expect(timelinePage.groupTrigger).toHaveAccessibleName('Group: Time');
      await expect(timelinePage.areaChip).toHaveText(/All areas/);
      await expect(timelinePage.todayButton).toBeVisible();
      await expect(timelinePage.moreTrigger).toBeVisible();
      await expect(timelinePage.legendToggle).toBeVisible();

      // No primary button in the toolbar and no Add / New menu on the page
      await expect(timelinePage.toolbar.locator('[class*="btnPrimary"]')).toHaveCount(0);
      await expect(page.getByTestId('timeline-add-button')).toHaveCount(0);
      await expect(
        page.getByTestId('timeline-page').getByRole('button', { name: /^(Add|New)$/ }),
      ).toHaveCount(0);
    } finally {
      await timelinePage.unmockTimeline();
    }
  });

  test('More › Subscribe in calendar app lands on Settings › Profile with the sync heading focused', async ({
    page,
  }) => {
    const timelinePage = new TimelinePage(page);
    await timelinePage.mockTimeline(buildScheduleScenario());

    try {
      await timelinePage.goto();
      await timelinePage.showChart();

      await timelinePage.moreTrigger.click();
      await expect(timelinePage.subscribeItem).toHaveText('Subscribe in calendar app');
      await timelinePage.subscribeItem.click();

      await expect(page).toHaveURL(
        (url) => url.pathname === routeUrl('settingsProfile') && url.hash === '#calendar-sync',
      );
      await expect(page.locator('#calendar-sync')).toBeFocused();
    } finally {
      await timelinePage.unmockTimeline();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 14 (AC3): late task
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Late task (Scenario 14, AC3)', () => {
  test('A late task has the hatch overlay, the planned ghost and the Late chip; others do not', async ({
    page,
  }) => {
    const timelinePage = new TimelinePage(page);
    await timelinePage.mockTimeline(buildScheduleScenario());

    try {
      await timelinePage.goto();
      await timelinePage.showChart();

      const roofing = SCHEDULE_IDS.roofing;
      await expect(timelinePage.ganttBar(roofing)).toBeVisible();
      await expect(page.getByTestId(`gantt-bar-late-${roofing}`)).toBeAttached();
      await expect(page.getByTestId(`gantt-ghost-${roofing}`)).toBeAttached();
      await expect(page.getByTestId(`gantt-late-${roofing}`)).toContainText('Late');
      await expect(page.getByTestId(`gantt-late-${roofing}`)).toContainText('6');

      // An on-time task has none of them
      await expect(page.getByTestId(`gantt-bar-late-${SCHEDULE_IDS.foundation}`)).toHaveCount(0);
      await expect(page.getByTestId(`gantt-ghost-${SCHEDULE_IDS.foundation}`)).toHaveCount(0);
      await expect(page.getByTestId(`gantt-late-${SCHEDULE_IDS.foundation}`)).toHaveCount(0);
    } finally {
      await timelinePage.unmockTimeline();
    }
  });

  test("The row's second line shows the area and the company", async ({ page }) => {
    const timelinePage = new TimelinePage(page);
    await timelinePage.mockTimeline(buildScheduleScenario());

    try {
      await timelinePage.goto();
      await timelinePage.showChart();

      const row = timelinePage.ganttSidebarRow(SCHEDULE_IDS.foundation);
      await expect(row).toContainText('Sched Foundation');
      await expect(row).toContainText('Kitchen · Sched Builders');
      // A task with neither an area nor a company has no second line
      await expect(timelinePage.ganttSidebarRow(SCHEDULE_IDS.roofing)).not.toContainText('Kitchen');
    } finally {
      await timelinePage.unmockTimeline();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 15 (AC3): grouping and the area chip (real areas)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Group by area and the area chip (Scenario 15, AC3)', () => {
  test('Group by area adds area groups and a final "No area" group that collapse', async ({
    page,
    testPrefix,
  }) => {
    const timelinePage = new TimelinePage(page);
    let areaId: string | null = null;
    const taskIds: string[] = [];

    try {
      areaId = await createAreaViaApi(page, { name: `${testPrefix} Group Area` });
      const inArea = await createWorkItemViaApi(page, {
        title: `${testPrefix} In Area`,
        areaId,
        startDate: daysFromToday(-1),
        endDate: daysFromToday(4),
      });
      const withoutArea = await createWorkItemViaApi(page, {
        title: `${testPrefix} Without Area`,
        startDate: daysFromToday(-1),
        endDate: daysFromToday(4),
      });
      taskIds.push(inArea, withoutArea);

      await timelinePage.goto();
      await timelinePage.showChart();
      await timelinePage.setGroup('area');
      await timelinePage.closeMenus();

      await expect(page).toHaveURL(/[?&]group=area/);
      const areaGroup = timelinePage.groupHeader(areaId);
      const noAreaGroup = timelinePage.groupHeader('none');
      await expect(areaGroup).toContainText(`${testPrefix} Group Area`);
      await expect(noAreaGroup).toContainText('No area');
      await expect(timelinePage.ganttSidebarRow(inArea)).toBeVisible();
      await expect(timelinePage.ganttSidebarRow(withoutArea)).toBeVisible();

      // Collapse: the header stays, its rows go (session only); expand brings them back
      await areaGroup.click();
      await expect(areaGroup).toHaveAttribute('aria-expanded', 'false');
      await expect(timelinePage.ganttSidebarRow(inArea)).toHaveCount(0);
      await expect(timelinePage.ganttSidebarRow(withoutArea)).toBeVisible();
      await areaGroup.click();
      await expect(timelinePage.ganttSidebarRow(inArea)).toBeVisible();

      // Back to Time: no group headers
      await timelinePage.setGroup('time');
      await timelinePage.closeMenus();
      await expect(areaGroup).toHaveCount(0);
    } finally {
      for (const id of taskIds) await deleteWorkItemViaApi(page, id);
      if (areaId) await deleteAreaViaApi(page, areaId);
    }
  });

  test('The area chip shows one area with its descendants; the second chip clears it', async ({
    page,
    testPrefix,
  }) => {
    const timelinePage = new TimelinePage(page);
    let parentId: string | null = null;
    let childId: string | null = null;
    let otherId: string | null = null;
    const taskIds: string[] = [];
    const parentName = `${testPrefix} Wing`;

    try {
      parentId = await createAreaViaApi(page, { name: parentName });
      childId = await createAreaViaApi(page, { name: `${testPrefix} Wing Room`, parentId });
      otherId = await createAreaViaApi(page, { name: `${testPrefix} Other Wing` });
      const dates = { startDate: daysFromToday(-1), endDate: daysFromToday(4) };
      const inParent = await createWorkItemViaApi(page, {
        title: `${testPrefix} In Wing`,
        areaId: parentId,
        ...dates,
      });
      const inChild = await createWorkItemViaApi(page, {
        title: `${testPrefix} In Room`,
        areaId: childId,
        ...dates,
      });
      const inOther = await createWorkItemViaApi(page, {
        title: `${testPrefix} In Other`,
        areaId: otherId,
        ...dates,
      });
      taskIds.push(inParent, inChild, inOther);

      await timelinePage.goto();
      await timelinePage.showChart();
      await expect(timelinePage.areaClear).toHaveCount(0);
      await expect(timelinePage.ganttSidebarRow(inOther)).toBeVisible();

      await timelinePage.chooseArea(parentName);
      await expect(page).toHaveURL(new RegExp(`[?&]areaId=${parentId}`));
      await expect(timelinePage.areaChip).toContainText(parentName);
      await expect(timelinePage.ganttSidebarRow(inParent)).toBeVisible();
      await expect(timelinePage.ganttSidebarRow(inChild)).toBeVisible();
      await expect(timelinePage.ganttSidebarRow(inOther)).toHaveCount(0);

      // The second chip reads "All areas" (accessible name) and clears the filter
      await expect(timelinePage.areaClear).toHaveAccessibleName(/All areas/);
      await timelinePage.areaClear.click();
      await expect(page).not.toHaveURL(/[?&]areaId=/);
      await expect(timelinePage.areaClear).toHaveCount(0);
      await expect(timelinePage.ganttSidebarRow(inOther)).toBeVisible();
    } finally {
      for (const id of taskIds) await deleteWorkItemViaApi(page, id);
      for (const id of [childId, parentId, otherId]) {
        if (id) await deleteAreaViaApi(page, id);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 16: legend
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Legend (Scenario 16)', () => {
  test('The legend opens from the toolbar and notes how many done items are hidden', async ({
    page,
  }) => {
    const timelinePage = new TimelinePage(page);
    await timelinePage.mockTimeline(buildScheduleScenario());

    try {
      await timelinePage.goto();
      await timelinePage.showChart();

      await expect(timelinePage.legend).toBeHidden();
      await expect(timelinePage.legendToggle).toHaveAttribute('aria-expanded', 'false');
      await timelinePage.legendToggle.click();

      await expect(timelinePage.legendToggle).toHaveAttribute('aria-expanded', 'true');
      await expect(timelinePage.legend).toBeVisible();
      await expect(timelinePage.legend).toContainText('Late or held up');
      await expect(timelinePage.legend).toContainText('critical path');
      await expect(timelinePage.legendDoneHidden).toHaveText('1 done item hidden');
    } finally {
      await timelinePage.unmockTimeline();
    }
  });

  test('With Done on nothing is hidden, so the legend has no note', async ({ page }) => {
    const timelinePage = new TimelinePage(page);
    await timelinePage.mockTimeline(buildScheduleScenario());

    try {
      await timelinePage.goto();
      await timelinePage.showChart();

      await timelinePage.toggleShow('done');
      await timelinePage.closeMenus();
      await timelinePage.legendToggle.click();

      await expect(timelinePage.legend).toBeVisible();
      await expect(timelinePage.legendDoneHidden).toHaveCount(0);
    } finally {
      await timelinePage.unmockTimeline();
    }
  });
});
