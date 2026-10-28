/**
 * E2E tests for the Schedule chart's scroll and zoom stability (#2247, AC6)
 *
 * "Scroll and zoom are never reset": the position the user scrolled to is a date anchor, not a
 * pixel offset, so toggling Show, changing a status, saving a Reschedule or any refetch leaves the
 * chart where it was, and Back from "Open task" restores it. The tests note the label of the
 * header cell under the canvas' left edge (the date at the scroll position) before and after.
 *
 * Scenarios
 * K1  toggling Show items (Dependency arrows, Critical path, Done) keeps the position and zoom
 * K2  a status change and a saved Reschedule (each refetches) keep the position and zoom
 * K3  Open task, then Back restores the position
 *
 * Runs as a dedicated user (the zoom / Show choices are per-user preferences). The chart is the
 * surface under test, so on the phone the tests switch from the Agenda to the Chart first.
 */

import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/isolatedUser.js';
import {
  buildScheduleScenario,
  daysFromToday,
  mockWorkItem,
} from '../../fixtures/timelineMocks.js';
import { TimelinePage, TIMELINE_ROUTE } from '../../pages/TimelinePage.js';
import { StatusMenuControl } from '../../pages/components/StatusMenuControl.js';
import { createWorkItemViaApi, deleteWorkItemViaApi } from '../../fixtures/apiHelpers.js';
import { routeUrl } from '../../../shared/src/routes/index.js';

test.use({ isolatedUserPerWorker: { emailPrefix: 'sched-scroll' } });

test.beforeEach(async ({ page }) => {
  await new TimelinePage(page).resetViewPreference();
});

/** The scroll anchors the page keeps in sessionStorage (one per history entry). */
async function storedAnchors(page: Page): Promise<string> {
  return page.evaluate(() =>
    Object.keys(sessionStorage)
      .filter((key) => key.startsWith('schedule.scroll:'))
      .map((key) => `${key}=${sessionStorage.getItem(key)}`)
      .join('|'),
  );
}

/** Scroll the canvas to the middle of its range and return the position it settled on. */
async function scrollToMiddle(page: Page, timeline: TimelinePage) {
  const before = await storedAnchors(page);
  await timeline.canvasScroll.evaluate((el) => {
    el.scrollLeft = Math.round((el.scrollWidth - el.clientWidth) / 2);
  });
  // The page saves the anchor as the chart scrolls: wait for that, so a later navigation keeps it
  await expect.poll(() => storedAnchors(page)).not.toBe(before);
  const position = await timeline.scrollPosition();
  expect(position.left, 'the range is wide enough to scroll').toBeGreaterThan(0);
  expect(position.label).not.toBe('');
  return position;
}

/** Two dated tasks ~200 days apart so the week-zoom chart is wider than any viewport. */
async function createWideRange(page: Page, prefix: string): Promise<string[]> {
  const early = await createWorkItemViaApi(page, {
    title: `${prefix} Range Start`,
    status: 'not_started',
    startDate: daysFromToday(-100),
    endDate: daysFromToday(-96),
  });
  const late = await createWorkItemViaApi(page, {
    title: `${prefix} Range End`,
    status: 'not_started',
    startDate: daysFromToday(100),
    endDate: daysFromToday(104),
  });
  return [early, late];
}

async function expectSamePosition(
  timeline: TimelinePage,
  expected: { label: string },
): Promise<void> {
  await expect.poll(async () => (await timeline.scrollPosition()).label).toBe(expected.label);
}

test.describe('Scroll and zoom stay put (AC6)', () => {
  test('K1: toggling Show items keeps the scroll position and the zoom', async ({ page }) => {
    const timeline = new TimelinePage(page);
    const scenario = buildScheduleScenario();
    scenario.workItems.push(
      mockWorkItem({
        id: 'sched-far-past',
        title: 'Sched Far Past',
        status: 'not_started',
        startDate: daysFromToday(-100),
        endDate: daysFromToday(-96),
      }),
      mockWorkItem({
        id: 'sched-far-future',
        title: 'Sched Far Future',
        status: 'not_started',
        startDate: daysFromToday(100),
        endDate: daysFromToday(104),
      }),
    );
    scenario.dateRange = { earliest: daysFromToday(-100), latest: daysFromToday(104) };
    await timeline.mockTimeline(scenario);

    try {
      await page.goto(`${TIMELINE_ROUTE}?zoom=week`);
      await timeline.showChart();
      await expect(timeline.zoomButton('Week')).toHaveAttribute('aria-pressed', 'true');

      const noted = await scrollToMiddle(page, timeline);

      for (const key of ['arrows', 'critical', 'done'] as const) {
        await timeline.toggleShow(key);
        await expectSamePosition(timeline, noted);
        await expect(timeline.zoomButton('Week')).toHaveAttribute('aria-pressed', 'true');
      }
      // The horizontal offset did not move either (the range is the server's, toggles keep it)
      const after = await timeline.scrollPosition();
      expect(Math.abs(after.left - noted.left)).toBeLessThanOrEqual(2);
    } finally {
      await timeline.unmockTimeline();
    }
  });

  test('K2: a status change and a saved Reschedule keep the position and the zoom', async ({
    page,
    testPrefix,
  }) => {
    const timeline = new TimelinePage(page);
    const ids: string[] = [];

    try {
      ids.push(...(await createWideRange(page, testPrefix)));
      const subject = await createWorkItemViaApi(page, {
        title: `${testPrefix} Scroll Subject`,
        status: 'not_started',
        startDate: daysFromToday(1),
        endDate: daysFromToday(6),
        durationDays: 5,
      });
      ids.push(subject);

      await page.goto(`${TIMELINE_ROUTE}?zoom=week`);
      await timeline.showChart();
      const noted = await scrollToMiddle(page, timeline);

      // Open the panel from the sidebar (clicking it does not scroll the chart)
      await timeline.openTaskPanel(subject);
      await expectSamePosition(timeline, noted);

      // A status change refetches the timeline
      await new StatusMenuControl(page, 'schedule-panel-status').chooseToday('in_progress');
      await expect(timeline.panelStatus).toContainText('In progress');
      await expectSamePosition(timeline, noted);

      // A saved Reschedule refetches it again
      await timeline.panelReschedule.click();
      const duration = Number(await timeline.rescheduleDuration.inputValue());
      await timeline.rescheduleDuration.fill(String(duration + 2));
      await expect(timeline.rescheduleSave).toBeEnabled();
      await timeline.rescheduleSave.click();
      await expect(timeline.reschedule).toHaveCount(0);
      await expectSamePosition(timeline, noted);

      await expect(timeline.zoomButton('Week')).toHaveAttribute('aria-pressed', 'true');
      await expect(page).toHaveURL(/[?&]zoom=week/);
    } finally {
      for (const id of ids.reverse()) await deleteWorkItemViaApi(page, id);
    }
  });

  test('K3: Open task, then Back restores the position', async ({ page, testPrefix }) => {
    const timeline = new TimelinePage(page);
    const ids: string[] = [];

    try {
      ids.push(...(await createWideRange(page, testPrefix)));
      const subject = await createWorkItemViaApi(page, {
        title: `${testPrefix} Back Subject`,
        status: 'not_started',
        startDate: daysFromToday(1),
        endDate: daysFromToday(6),
      });
      ids.push(subject);

      await page.goto(`${TIMELINE_ROUTE}?zoom=week`);
      await timeline.showChart();
      const noted = await scrollToMiddle(page, timeline);

      await timeline.openTaskPanel(subject);
      await timeline.openTaskPage();
      await page.waitForURL((url) => url.pathname === routeUrl('workItem', { id: subject }));

      await page.goBack();
      await page.waitForURL((url) => url.pathname === routeUrl('scheduleGantt'));
      await timeline.showChart();
      await expectSamePosition(timeline, noted);
      await expect(timeline.zoomButton('Week')).toHaveAttribute('aria-pressed', 'true');
    } finally {
      for (const id of ids.reverse()) await deleteWorkItemViaApi(page, id);
    }
  });
});
