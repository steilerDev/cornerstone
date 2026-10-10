/**
 * E2E tests for scheduler truth (#2199, contract 4): planned dates are never floored to today,
 * and "Late" / "Held up" are read-time signals on the list, the task page and the Schedule.
 *
 * Real server, synthetic tasks created through the API. Dates are computed in UTC because the
 * server's "today" is UTC (a run within a minute of UTC midnight is a known date-boundary flake).
 *
 * Scenarios:
 * 1+2. Late task and held-up successor: API (task + timeline) and UI (list chip, planned start,
 *      task page chip, no "Delayed by")
 * 3. Schedule tooltip: Late chip, "Planned" row, forecast start
 * 4. One date source: a late task shows the same forecast dates on the list, task page, tooltip,
 *    calendar and in the timeline response Home loads; an on-time task has no chip or planned line
 * 5. Phone (@responsive): the list chip is visible on the visible list surface
 * 6. Undated task (architect decision): no chip, forecast start shown, no planned line, still has a Schedule bar
 */

import { test, expect } from '../../fixtures/auth.js';
import type { Page } from '@playwright/test';
import { WorkItemsPage, WORK_ITEMS_ROUTE } from '../../pages/WorkItemsPage.js';
import { WorkItemDetailPage } from '../../pages/WorkItemDetailPage.js';
import { TimelinePage } from '../../pages/TimelinePage.js';
import { createWorkItemViaApi, deleteWorkItemViaApi } from '../../fixtures/apiHelpers.js';
import { API } from '../../fixtures/testData.js';

/** UTC YYYY-MM-DD, `offset` days from today (server "today" is UTC). */
function utcDay(offset: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

/** Same rendering as the app's formatDate (en-US, short month). */
function fmt(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** Planned range as the tooltip renders it (formatDayRange: "October 5 – 8, 2026"), else one date. */
function plannedRange(start: string | null, end: string | null): string {
  if (start && end) {
    return new Intl.DateTimeFormat('en-US', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).formatRange(new Date(`${start}T00:00:00Z`), new Date(`${end}T00:00:00Z`));
  }
  return fmt((start ?? end)!);
}

interface ScheduleView {
  startDate: string | null;
  endDate: string | null;
  projectedStartDate: string | null;
  projectedEndDate: string | null;
  isLate: boolean;
  lateDays: number | null;
  isHeldUp: boolean;
}

async function getWorkItem(page: Page, id: string): Promise<ScheduleView> {
  const response = await page.request.get(`${API.workItems}/${id}`);
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as ScheduleView;
}

async function getTimelineItem(page: Page, id: string): Promise<ScheduleView | undefined> {
  const response = await page.request.get(API.timeline);
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { workItems: Array<ScheduleView & { id: string }> };
  return body.workItems.find((w) => w.id === id);
}

async function createLateTask(page: Page, title: string): Promise<string> {
  return createWorkItemViaApi(page, {
    title,
    status: 'not_started',
    startDate: utcDay(-5),
    durationDays: 3,
  });
}

async function createSuccessor(page: Page, title: string, predecessorId: string): Promise<string> {
  const id = await createWorkItemViaApi(page, { title, status: 'not_started' });
  const response = await page.request.post(`${API.workItems}/${id}/dependencies`, {
    data: { predecessorId, dependencyType: 'finish_to_start' },
  });
  expect(response.ok()).toBeTruthy();
  return id;
}

async function openListFor(page: Page, title: string): Promise<WorkItemsPage> {
  const list = new WorkItemsPage(page);
  await page.goto(`${WORK_ITEMS_ROUTE}?q=${encodeURIComponent(title)}`);
  await list.heading.waitFor({ state: 'visible' });
  await list.waitForLoaded();
  await list.workItemRow(title).waitFor({ state: 'visible' });
  return list;
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenarios 1 + 2: late task, held-up successor
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Late task and held-up successor (Scenarios 1 + 2)', () => {
  test('A late task shows its forecast start, keeps its plan and shows Late; its successor shows Held up', async ({
    page,
    testPrefix,
  }) => {
    const titleA = `${testPrefix} Late Tiling ${Date.now()}`;
    const titleB = `${testPrefix} Held Painting ${Date.now()}`;
    const ids: string[] = [];

    try {
      const a = await createLateTask(page, titleA);
      ids.push(a);
      const b = await createSuccessor(page, titleB, a);
      ids.push(b);

      // API: planned start is as entered, the forecast is today, and the signal is Late 5 d
      const taskA = await getWorkItem(page, a);
      expect(taskA.startDate).toBe(utcDay(-5));
      expect(taskA.projectedStartDate).toBe(utcDay(0));
      expect(taskA.isLate).toBe(true);
      expect(taskA.lateDays).toBe(5);

      const timelineA = await getTimelineItem(page, a);
      expect(timelineA).toBeDefined();
      expect(timelineA!.startDate).toBe(utcDay(-5));
      expect(timelineA!.projectedStartDate).toBe(utcDay(0));
      expect(timelineA!.isLate).toBe(true);
      expect(timelineA!.lateDays).toBe(5);

      // API: the successor is held up, not late
      const taskB = await getWorkItem(page, b);
      expect(taskB.isHeldUp).toBe(true);
      expect(taskB.isLate).toBe(false);

      // List: A shows the chip and its forecast start; B shows Held up
      const list = await openListFor(page, titleA);
      await expect(list.scheduleSignal(a)).toHaveText('Late · 5 d');
      // The list shows the forecast start, not the planned one
      await expect(list.workItemRow(titleA)).toContainText(fmt(utcDay(0)));
      await expect(list.workItemRow(titleA)).not.toContainText(fmt(utcDay(-5)));

      const listB = await openListFor(page, titleB);
      await expect(listB.scheduleSignal(b)).toHaveText('Held up');

      // Task page A: header chip, no "Delayed by"
      const detailA = new WorkItemDetailPage(page);
      await detailA.goto(a);
      await expect(detailA.headerScheduleSignal).toHaveText('Late · 5 d');
      await expect(page.getByText('Delayed by')).toHaveCount(0);
      // Start is the forecast; the planned range is secondary text
      await expect(detailA.scheduleSection).toContainText(fmt(utcDay(0)));
      await expect(detailA.plannedDates).toContainText('Planned');
      await expect(detailA.plannedDates).toContainText(
        new RegExp(`\\b${Number(utcDay(-5).slice(8))}\\b`),
      );

      // Task page B: header chip says Held up
      const detailB = new WorkItemDetailPage(page);
      await detailB.goto(b);
      await expect(detailB.headerScheduleSignal).toHaveText('Held up');
    } finally {
      for (const id of ids.reverse()) {
        await deleteWorkItemViaApi(page, id);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 3: Schedule tooltip
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Schedule tooltip shows the schedule signal (Scenario 3)', () => {
  test.beforeEach(({ page }) => {
    const viewportWidth = page.viewportSize()?.width ?? 1440;
    test.skip(viewportWidth < 1200, 'Gantt tooltips on hover are desktop-only');
  });

  test('Hovering a late task bar shows the Late chip, the planned dates and the forecast start', async ({
    page,
    testPrefix,
  }) => {
    const title = `${testPrefix} Tooltip Late ${Date.now()}`;
    let id: string | null = null;

    try {
      id = await createLateTask(page, title);

      const timelinePage = new TimelinePage(page);
      await timelinePage.goto();
      await timelinePage.waitForLoaded();

      const bar = timelinePage.ganttBar(id);
      await bar.waitFor({ state: 'visible' });
      await bar.hover();

      await expect(timelinePage.tooltip).toBeVisible();
      await expect(timelinePage.tooltipScheduleSignal).toHaveText('Late · 5 d');
      await expect(timelinePage.tooltipPlanned).toContainText('Planned');
      const planned = await getWorkItem(page, id);
      await expect(timelinePage.tooltipPlanned).toContainText(
        plannedRange(planned.startDate, planned.endDate),
      );
      // Start is the forecast (today), not the planned date
      await expect(timelinePage.tooltip).toContainText(new RegExp(`Start\\s*${fmt(utcDay(0))}`));
    } finally {
      if (id) await deleteWorkItemViaApi(page, id);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 4: one date source
// ─────────────────────────────────────────────────────────────────────────────

test.describe('One date source for a late task (Scenario 4)', () => {
  test('List, task page, Schedule tooltip, calendar and Home all use the same forecast dates', async ({
    page,
    testPrefix,
  }) => {
    const title = `${testPrefix} One Source ${Date.now()}`;
    let id: string | null = null;

    try {
      id = await createLateTask(page, title);

      // The forecast: starts today, runs for the 3-day duration
      const task = await getWorkItem(page, id);
      expect(task.isLate).toBe(true);
      expect(task.projectedStartDate).toBe(utcDay(0));
      expect(task.projectedEndDate).toBe(utcDay(3));
      const start = fmt(utcDay(0));
      const end = fmt(utcDay(3));

      // List row
      const list = await openListFor(page, title);
      await expect(list.workItemRow(title)).toContainText(start);
      await expect(list.workItemRow(title)).toContainText(end);

      // Task page Schedule section
      const detail = new WorkItemDetailPage(page);
      await detail.goto(id);
      await expect(detail.scheduleSection).toContainText(start);
      await expect(detail.scheduleSection).toContainText(end);

      // Schedule tooltip (desktop only: hover is not a phone/tablet interaction)
      if ((page.viewportSize()?.width ?? 1440) >= 1200) {
        const timelinePage = new TimelinePage(page);
        await timelinePage.goto();
        await timelinePage.waitForLoaded();
        const bar = timelinePage.ganttBar(id);
        await bar.waitFor({ state: 'visible' });
        await bar.hover();
        await expect(timelinePage.tooltip).toBeVisible();
        await expect(timelinePage.tooltip).toContainText(new RegExp(`Start\\s*${start}`));
        await expect(timelinePage.tooltip).toContainText(new RegExp(`End\\s*${end}`));
      }

      // Calendar (month view, all viewports): the item is drawn from the forecast dates
      const calendarPage = new TimelinePage(page);
      await calendarPage.gotoCalendar();
      await expect(calendarPage.calendarItemByTitle(title).first()).toHaveAttribute(
        'aria-label',
        new RegExp(start),
      );

      // Home: the timeline response the dashboard loads carries the same forecast dates
      const timelineResponse = page.waitForResponse(
        (r) => r.url().endsWith('/api/timeline') && r.request().method() === 'GET',
      );
      await page.goto('/');
      const body = (await (await timelineResponse).json()) as {
        workItems: Array<{ id: string; projectedStartDate: string; projectedEndDate: string }>;
      };
      const homeItem = body.workItems.find((w) => w.id === id);
      expect(homeItem).toBeDefined();
      expect(homeItem!.projectedStartDate).toBe(utcDay(0));
      expect(homeItem!.projectedEndDate).toBe(utcDay(3));
    } finally {
      if (id) await deleteWorkItemViaApi(page, id);
    }
  });

  test('An on-time task shows no chip and no planned line', async ({ page, testPrefix }) => {
    const title = `${testPrefix} On Time ${Date.now()}`;
    let id: string | null = null;

    try {
      id = await createWorkItemViaApi(page, {
        title,
        status: 'not_started',
        startDate: utcDay(10),
        durationDays: 2,
      });

      const list = await openListFor(page, title);
      await expect(list.scheduleSignal(id)).toHaveCount(0);

      const detail = new WorkItemDetailPage(page);
      await detail.goto(id);
      await expect(detail.headerScheduleSignal).toHaveCount(0);
      await expect(detail.plannedDates).toHaveCount(0);
    } finally {
      if (id) await deleteWorkItemViaApi(page, id);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 5: phone
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Late chip on the list (Scenario 5)', { tag: '@responsive' }, () => {
  test('The Late chip is visible on the visible list surface (cards on a phone)', async ({
    page,
    testPrefix,
  }) => {
    const title = `${testPrefix} Phone Late ${Date.now()}`;
    let id: string | null = null;

    try {
      id = await createLateTask(page, title);
      const list = await openListFor(page, title);
      await expect(list.scheduleSignal(id)).toBeVisible();
      await expect(list.scheduleSignal(id)).toHaveText('Late · 5 d');
    } finally {
      if (id) await deleteWorkItemViaApi(page, id);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario 6: undated task (architect decision)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Undated task (Scenario 6)', () => {
  test('A task without dates is never Late, shows its forecast start with no planned line, and still has a bar', async ({
    page,
    testPrefix,
  }) => {
    const title = `${testPrefix} Undated ${Date.now()}`;
    let id: string | null = null;

    try {
      id = await createWorkItemViaApi(page, { title, status: 'not_started' });

      // API: no plan, no signal, but a forecast
      const task = await getWorkItem(page, id);
      expect(task.startDate).toBeNull();
      expect(task.isLate).toBe(false);
      expect(task.isHeldUp).toBe(false);
      expect(task.lateDays).toBeNull();
      expect(task.projectedStartDate).toBe(utcDay(0));

      // List: no chip, shows the forecast start (today)
      const list = await openListFor(page, title);
      await expect(list.scheduleSignal(id)).toHaveCount(0);
      await expect(list.workItemRow(title)).toContainText(fmt(utcDay(0)));

      // Task page: shows the forecast start, no planned line, no chip
      const detail = new WorkItemDetailPage(page);
      await detail.goto(id);
      await expect(detail.scheduleSection).toContainText(fmt(utcDay(0)));
      await expect(detail.plannedDates).toHaveCount(0);
      await expect(detail.headerScheduleSignal).toHaveCount(0);

      // Schedule: the task still has a bar (desktop only; the bar is a chart element)
      if ((page.viewportSize()?.width ?? 1440) >= 1200) {
        const timelinePage = new TimelinePage(page);
        await timelinePage.goto();
        await timelinePage.waitForLoaded();
        await expect(timelinePage.ganttBar(id)).toBeVisible();
      }
    } finally {
      if (id) await deleteWorkItemViaApi(page, id);
    }
  });
});
