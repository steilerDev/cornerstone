/**
 * E2E tests for the Schedule item panel and the Reschedule preview (#2247, story 5.3)
 *
 * The panel opens when a bar, a milestone diamond, a delivery marker or a list row is clicked (no
 * navigation: "Open task" navigates). It is a docked aside from 1440 px, a side Sheet from 768 px
 * and a bottom Sheet below that; tests branch on the surface that rendered (`panelIsDocked()`,
 * `surface()`), never on the viewport name.
 *
 * Scenarios
 * P1  AC4  a bar, a diamond, a delivery marker and a row each open the panel (rows on the agenda)
 * P2  AC4  the sections: When, Who with Call, Waits for, Holds up, relation sentences, signal chips
 * P3  AC4  status change with Undo (real task)
 * P4  AC4  "Open task" navigates to the task page and Back returns to the Schedule
 * P5  AC4  docked at 1440 px and wider (the chart stays clickable, a second bar swaps the content);
 *          a Sheet below that (the backdrop covers the chart)
 * P6  AC5  change the end date and the duration -> preview -> Save -> toast -> Undo
 * P7  AC5  a preview without Save leaves the task unchanged and sends no write
 * P8  AC5  a failed preview shows Retry and keeps Save disabled
 * P9  AC8  click count: the row/bar, Reschedule..., the end-date change; Save is the fourth
 *
 * The Schedule view is a per-user preference and tests that look at the chart on a phone switch
 * the phone view, so the file runs as a dedicated user and starts from the defaults.
 */

import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/isolatedUser.js';
import {
  buildScheduleScenario,
  daysFromToday,
  SCHEDULE_IDS,
} from '../../fixtures/timelineMocks.js';
import { TimelinePage } from '../../pages/TimelinePage.js';
import { StatusMenuControl } from '../../pages/components/StatusMenuControl.js';
import { ToastRegion } from '../../pages/components/ToastRegion.js';
import { createWorkItemViaApi, deleteWorkItemViaApi } from '../../fixtures/apiHelpers.js';
import { API } from '../../fixtures/testData.js';
import { routeUrl } from '../../../shared/src/routes/index.js';

test.use({ isolatedUserPerWorker: { emailPrefix: 'sched-panel' } });

test.beforeEach(async ({ page }) => {
  await new TimelinePage(page).resetViewPreference();
});

interface StoredTask {
  status: string;
  startDate: string | null;
  endDate: string | null;
  durationDays: number | null;
}

async function readTask(page: Page, id: string): Promise<StoredTask> {
  const response = await page.request.get(`${API.workItems}/${id}`);
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as StoredTask;
  return {
    status: body.status,
    startDate: body.startDate,
    endDate: body.endDate,
    durationDays: body.durationDays,
  };
}

/** A real task around today that can be rescheduled. */
async function createReschedulable(page: Page, title: string): Promise<string> {
  return createWorkItemViaApi(page, {
    title,
    status: 'not_started',
    startDate: daysFromToday(1),
    endDate: daysFromToday(6),
    durationDays: 5,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// P1: every kind of target opens the panel
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Targets open the panel (P1, AC4)', () => {
  test('A bar, a diamond, a delivery marker and a row each open the panel', async ({ page }) => {
    const timeline = new TimelinePage(page);
    await timeline.mockTimeline(buildScheduleScenario());

    try {
      await timeline.goto();
      const surface = await timeline.surface();

      if (surface === 'chart') {
        await timeline.ganttBar(SCHEDULE_IDS.foundation).click();
        await expect(timeline.panel).toContainText('Sched Foundation');
        await timeline.closePanel();

        await timeline.milestoneDiamond('Sched Shell complete').click();
        await expect(timeline.panel).toContainText('Sched Shell complete');
        await timeline.closePanel();

        await timeline.deliveryMarker('Sched Kitchen island').click();
        await expect(timeline.panel).toContainText('Sched Kitchen island');
        await timeline.closePanel();
      }

      // Rows exist on both surfaces (sidebar rows on the chart, agenda rows on the phone)
      for (const [key, title] of [
        [`task:${SCHEDULE_IDS.framing}`, 'Sched Framing'],
        [`milestone:${SCHEDULE_IDS.milestone}`, 'Sched Shell complete'],
        [`purchase:${SCHEDULE_IDS.purchase}`, 'Sched Kitchen island'],
      ] as const) {
        await timeline.openRowPanel(key);
        await expect(timeline.panel).toContainText(title);
        await timeline.closePanel();
      }

      // Opening a panel never navigated
      expect(new URL(page.url()).pathname).toBe(routeUrl('scheduleGantt'));
    } finally {
      await timeline.unmockTimeline();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// P2: sections
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Panel sections (P2, AC4)', () => {
  test.beforeEach(async ({ page }) => {
    const timeline = new TimelinePage(page);
    await timeline.mockTimeline(buildScheduleScenario());
    await timeline.goto();
    await timeline.waitForLoaded();
  });

  test.afterEach(async ({ page }) => {
    await new TimelinePage(page).unmockTimeline();
  });

  test('A task: status, critical chip, When, Who with Call, Holds up with the figure', async ({
    page,
  }) => {
    const timeline = new TimelinePage(page);
    await timeline.openTaskPanel(SCHEDULE_IDS.foundation);

    await expect(timeline.panelStatus).toContainText('In progress');
    await expect(timeline.panelCritical).toBeVisible();
    await expect(timeline.panelWhen).toContainText('14 days');

    await expect(timeline.panelCompany).toHaveText('Sched Builders');
    await expect(timeline.panelCall).toHaveAttribute('href', 'tel:+49301234567');

    await expect(timeline.panelWaitsFor).toContainText('Nothing. It can start any time.');
    await expect(timeline.panelHoldsUpFigure).toHaveAttribute('data-figure', 'holds-up');
    await expect(timeline.panelHoldsUpFigure).toContainText('2');
    const framing = timeline.panelRelation(`task:${SCHEDULE_IDS.framing}`);
    await expect(framing).toContainText('Sched Framing');
    await expect(framing).toContainText('Starts after this finishes');
    await expect(timeline.panelRelation(`purchase:${SCHEDULE_IDS.purchase}`)).toContainText(
      'Delivery waits for this',
    );
  });

  test('A task that waits: its predecessor and the milestone it needs', async ({ page }) => {
    const timeline = new TimelinePage(page);
    await timeline.openTaskPanel(SCHEDULE_IDS.framing);

    await expect(timeline.panelStatus).toContainText('Not started');
    await expect(timeline.panelWho).toContainText('No company yet');
    await expect(timeline.panelCall).toHaveCount(0);

    const milestoneKey = `schedule-panel-relation-milestone:${SCHEDULE_IDS.milestone}`;
    await expect(
      timeline.panelWaitsFor.getByTestId(`schedule-panel-relation-task:${SCHEDULE_IDS.foundation}`),
    ).toContainText('Finishes before this starts');
    await expect(timeline.panelWaitsFor.getByTestId(milestoneKey)).toContainText(
      'Starts once it is reached',
    );
    // The same milestone is also listed under Holds up, as one the task counts toward
    await expect(timeline.panelHoldsUp.getByTestId(milestoneKey)).toContainText('Counts toward');
  });

  test('A late task shows the Late chip and the planned dates', async ({ page }) => {
    const timeline = new TimelinePage(page);
    await timeline.openTaskPanel(SCHEDULE_IDS.roofing);

    await expect(timeline.panelSignal).toContainText('Late');
    await expect(timeline.panelWhen).toContainText('Planned');
    await expect(timeline.panelWhen).toContainText('now ends');
  });

  test('A milestone: what counts toward it and what waits for it', async ({ page }) => {
    const timeline = new TimelinePage(page);
    await timeline.openRowPanel(`milestone:${SCHEDULE_IDS.milestone}`);

    await expect(timeline.panelWhen).toContainText('Target');
    await expect(timeline.panelWho).toHaveCount(0);
    await expect(
      timeline.panelWaitsFor.getByTestId(`schedule-panel-relation-task:${SCHEDULE_IDS.framing}`),
    ).toContainText('Counts toward');
    await expect(
      timeline.panelHoldsUp.getByTestId(`schedule-panel-relation-task:${SCHEDULE_IDS.framing}`),
    ).toContainText('Waiting for this milestone');
    // A milestone is not rescheduled from here
    await expect(timeline.panelReschedule).toHaveCount(0);
  });

  test('A purchase: what its delivery waits for; nothing waits for it', async ({ page }) => {
    const timeline = new TimelinePage(page);
    await timeline.openRowPanel(`purchase:${SCHEDULE_IDS.purchase}`);

    await expect(timeline.panelWhen).toContainText('Delivery');
    await expect(
      timeline.panelWaitsFor.getByTestId(`schedule-panel-relation-task:${SCHEDULE_IDS.foundation}`),
    ).toContainText('Must be done before the delivery');
    await expect(timeline.panelHoldsUp).toHaveCount(0);
    await expect(timeline.panelReschedule).toHaveCount(0);
  });

  test('A relation row links to its own page', async ({ page }) => {
    const timeline = new TimelinePage(page);
    await timeline.openTaskPanel(SCHEDULE_IDS.framing);

    const link = timeline
      .panelRelation(`task:${SCHEDULE_IDS.foundation}`)
      .getByRole('link', { name: 'Sched Foundation' });
    await expect(link).toHaveAttribute(
      'href',
      routeUrl('workItem', { id: SCHEDULE_IDS.foundation }),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// P3: status change with Undo
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Status change (P3, AC4)', () => {
  test('Start from the panel, then Undo from the toast', async ({ page, testPrefix }) => {
    const timeline = new TimelinePage(page);
    const toasts = new ToastRegion(page);
    let id: string | null = null;

    try {
      id = await createReschedulable(page, `${testPrefix} Status Task`);
      await timeline.goto();
      await timeline.waitForLoaded();
      await timeline.openTaskPanel(id);
      await expect(timeline.panelStatus).toContainText('Not started');

      await new StatusMenuControl(page, 'schedule-panel-status').chooseToday('in_progress');
      await expect(toasts.undoToast).toBeVisible();
      await expect(timeline.panelStatus).toContainText('In progress');
      expect((await readTask(page, id)).status).toBe('in_progress');

      await toasts.undoViaButton();
      await expect(timeline.panelStatus).toContainText('Not started');
      expect((await readTask(page, id)).status).toBe('not_started');
    } finally {
      if (id) await deleteWorkItemViaApi(page, id);
    }
  });
});

test.describe('Toast beside the docked panel (P3b, AC4)', () => {
  test('While the Undo toast shows, Reschedule... stays clickable and the toast does not overlap the docked panel', async ({
    page,
    testPrefix,
  }) => {
    const timeline = new TimelinePage(page);
    const toasts = new ToastRegion(page);
    let id: string | null = null;

    try {
      id = await createReschedulable(page, `${testPrefix} Toast Overlap`);
      await timeline.goto();
      await timeline.showChart();
      await timeline.openTaskPanel(id);
      test.skip(!(await timeline.panelIsDocked()), 'Only the docked panel shares the screen');

      await new StatusMenuControl(page, 'schedule-panel-status').chooseToday('in_progress');
      await expect(toasts.undoToast).toBeVisible();

      // The toast sits beside the panel, not over it
      await expect(async () => {
        const toast = await toasts.undoToast.first().boundingBox();
        const panel = await timeline.panel.boundingBox();
        expect(toast).not.toBeNull();
        expect(panel).not.toBeNull();
        expect(toast!.x + toast!.width).toBeLessThanOrEqual(panel!.x + 1);
      }).toPass();

      // ... so Reschedule... is clickable while the toast is still on screen
      await timeline.panelReschedule.click();
      await expect(timeline.reschedule).toBeVisible();
      await expect(toasts.undoToast).toBeVisible();
    } finally {
      if (id) await deleteWorkItemViaApi(page, id);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// P4: Open task
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Open task (P4, AC4)', () => {
  test('"Open task" navigates; Back returns to the Schedule', async ({ page, testPrefix }) => {
    const timeline = new TimelinePage(page);
    let id: string | null = null;

    try {
      id = await createReschedulable(page, `${testPrefix} Open Task`);
      await timeline.goto();
      await timeline.waitForLoaded();
      await timeline.openTaskPanel(id);

      await expect(timeline.panelOpenLink).toHaveText('Open task');
      await expect(timeline.panelOpenLink).toHaveAttribute('href', routeUrl('workItem', { id }));
      await timeline.openTaskPage();
      await page.waitForURL((url) => url.pathname === routeUrl('workItem', { id: id! }));

      await page.goBack();
      await page.waitForURL((url) => url.pathname === routeUrl('scheduleGantt'));
      await expect(timeline.heading).toBeVisible();
    } finally {
      if (id) await deleteWorkItemViaApi(page, id);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// P5: docked panel vs Sheet
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Docked panel and Sheet (P5, AC4)', () => {
  test('Docked: the chart stays clickable and a second bar swaps the content; otherwise a Sheet covers it', async ({
    page,
    testPrefix,
  }) => {
    const timeline = new TimelinePage(page);
    const ids: string[] = [];

    try {
      const first = await createReschedulable(page, `${testPrefix} Dock A`);
      const second = await createReschedulable(page, `${testPrefix} Dock B`);
      ids.push(first, second);

      await timeline.goto();
      await timeline.showChart();
      await timeline.openTaskPanel(first);
      await expect(timeline.panel).toContainText(`${testPrefix} Dock A`);

      if (await timeline.panelIsDocked()) {
        // No backdrop and no trap: the chart is still clickable; the content swaps
        await expect(timeline.panelBackdrop).toHaveCount(0);
        await timeline.ganttBar(second).click();
        await expect(timeline.panel).toContainText(`${testPrefix} Dock B`);
        await expect(timeline.panel).not.toContainText(`${testPrefix} Dock A`);
        await expect(timeline.panel).toHaveCount(1);
        // Escape closes the docked panel
        await page.keyboard.press('Escape');
        await expect(timeline.panel).toHaveCount(0);
      } else {
        // A Sheet: modal, with a backdrop that covers the chart
        await expect(timeline.panel).toHaveAttribute('aria-modal', 'true');
        await expect(timeline.panelBackdrop).toBeVisible();
        await timeline.closePanel();
        await timeline.openTaskPanel(second);
        await expect(timeline.panel).toContainText(`${testPrefix} Dock B`);
      }
    } finally {
      for (const id of ids) await deleteWorkItemViaApi(page, id);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// P6 to P9: Reschedule
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Reschedule (P6 to P9, AC5, AC8)', () => {
  test('Change the end date and the duration, see the preview, Save, then Undo', async ({
    page,
    testPrefix,
  }) => {
    const timeline = new TimelinePage(page);
    const toasts = new ToastRegion(page);
    const ids: string[] = [];

    try {
      const id = await createReschedulable(page, `${testPrefix} Resched Task`);
      ids.push(id);
      const successor = await createWorkItemViaApi(page, {
        title: `${testPrefix} Resched Successor`,
        status: 'not_started',
        startDate: daysFromToday(7),
        endDate: daysFromToday(9),
      });
      ids.push(successor);
      const dependency = await page.request.post(`${API.workItems}/${successor}/dependencies`, {
        data: { predecessorId: id, dependencyType: 'finish_to_start' },
      });
      expect(dependency.ok()).toBeTruthy();
      const before = await readTask(page, id);

      await timeline.goto();
      await timeline.waitForLoaded();
      await timeline.openTaskPanel(id);
      await timeline.panelReschedule.click();

      // The title reads Reschedule; nothing is previewed yet, so Save is off
      await expect(timeline.panel).toContainText(`Reschedule ${testPrefix} Resched Task`);
      await expect(timeline.rescheduleSave).toBeDisabled();
      const originalDuration = Number(await timeline.rescheduleDuration.inputValue());
      const originalEnd = await timeline.rescheduleEnd.inputValue();

      // Edit the end date: the duration follows, the preview arrives, Save turns on
      const laterEnd = new Date(`${originalEnd}T00:00:00Z`);
      laterEnd.setUTCDate(laterEnd.getUTCDate() + 2);
      const laterEndKey = laterEnd.toISOString().slice(0, 10);
      await timeline.rescheduleEnd.fill(laterEndKey);
      await expect(timeline.rescheduleDuration).toHaveValue(String(originalDuration + 2));
      await expect(timeline.rescheduleSave).toBeEnabled();
      await expect(timeline.reschedulePreviewSummary).toContainText('Completion');

      // Edit the duration: the end date follows
      const newDuration = originalDuration + 3;
      await timeline.rescheduleDuration.fill(String(newDuration));
      await expect(timeline.rescheduleEnd).not.toHaveValue(laterEndKey);
      await expect(timeline.rescheduleSave).toBeEnabled();
      const newEnd = await timeline.rescheduleEnd.inputValue();
      // The successor is told to move
      await expect(
        timeline.reschedulePreview.getByTestId(`reschedule-preview-item-${successor}`),
      ).toBeVisible();

      await timeline.rescheduleSave.click();
      await expect(toasts.undoToast).toBeVisible();
      await expect(timeline.reschedule).toHaveCount(0);

      const saved = await readTask(page, id);
      expect(saved.durationDays).toBe(newDuration);
      expect(saved.endDate).toBe(newEnd);

      // Undo restores the stored dates
      await toasts.undoViaButton();
      await expect.poll(async () => (await readTask(page, id)).endDate).toBe(before.endDate);
    } finally {
      for (const id of ids.reverse()) await deleteWorkItemViaApi(page, id);
    }
  });

  test('A preview without Save changes nothing and sends no write', async ({
    page,
    testPrefix,
  }) => {
    const timeline = new TimelinePage(page);
    let id: string | null = null;
    const writes: string[] = [];
    page.on('request', (request) => {
      if (
        ['PATCH', 'PUT', 'DELETE'].includes(request.method()) &&
        request.url().includes('/api/work-items')
      ) {
        writes.push(`${request.method()} ${request.url()}`);
      }
    });

    try {
      id = await createReschedulable(page, `${testPrefix} Preview Only`);
      const before = await readTask(page, id);

      await timeline.goto();
      await timeline.waitForLoaded();
      await timeline.openTaskPanel(id);
      await timeline.panelReschedule.click();
      const duration = Number(await timeline.rescheduleDuration.inputValue());

      const previewed = page.waitForResponse(
        (response) =>
          response.url().endsWith('/api/schedule') && response.request().method() === 'POST',
      );
      await timeline.rescheduleDuration.fill(String(duration + 4));
      await previewed;
      await expect(timeline.rescheduleSave).toBeEnabled();

      // Cancel returns to the info view
      await timeline.rescheduleCancel.click();
      await expect(timeline.reschedule).toHaveCount(0);
      await expect(timeline.panelReschedule).toBeVisible();

      expect(await readTask(page, id)).toEqual(before);
      expect(writes).toEqual([]);
    } finally {
      if (id) await deleteWorkItemViaApi(page, id);
    }
  });

  test('A failed preview offers Retry and keeps Save off until it works', async ({
    page,
    testPrefix,
  }) => {
    const timeline = new TimelinePage(page);
    let id: string | null = null;
    let failures = 1;
    await page.route('**/api/schedule', async (route) => {
      if (route.request().method() === 'POST' && failures > 0) {
        failures -= 1;
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'boom' } }),
        });
        return;
      }
      await route.continue();
    });

    try {
      id = await createReschedulable(page, `${testPrefix} Preview Error`);
      await timeline.goto();
      await timeline.waitForLoaded();
      await timeline.openTaskPanel(id);
      await timeline.panelReschedule.click();
      const duration = Number(await timeline.rescheduleDuration.inputValue());
      await timeline.rescheduleDuration.fill(String(duration + 1));

      await expect(timeline.rescheduleRetry).toBeVisible();
      await expect(timeline.rescheduleSave).toBeDisabled();

      await timeline.rescheduleRetry.click();
      await expect(timeline.rescheduleSave).toBeEnabled();
      await expect(timeline.rescheduleRetry).toHaveCount(0);
    } finally {
      await page.unroute('**/api/schedule');
      if (id) await deleteWorkItemViaApi(page, id);
    }
  });

  test('P9 (AC8): Save is the fourth click: open the task, Reschedule, change the end date, Save', async ({
    page,
    testPrefix,
  }) => {
    const timeline = new TimelinePage(page);
    let id: string | null = null;
    let clicks = 0;

    try {
      id = await createReschedulable(page, `${testPrefix} Click Budget`);
      await timeline.goto();
      await timeline.waitForLoaded();

      // 1: the bar (chart) or the row (agenda)
      const row = timeline.taskRow(id);
      await row.waitFor({ state: 'visible' });
      await row.click();
      clicks += 1;
      await timeline.panel.waitFor({ state: 'visible' });

      // 2: Reschedule...
      await timeline.panelReschedule.click();
      clicks += 1;

      // 3: the end-date change (one edit)
      const end = new Date(`${await timeline.rescheduleEnd.inputValue()}T00:00:00Z`);
      end.setUTCDate(end.getUTCDate() + 1);
      const newEnd = end.toISOString().slice(0, 10);
      await timeline.rescheduleEnd.fill(newEnd);
      clicks += 1;
      await expect(timeline.rescheduleSave).toBeEnabled();

      // 4: Save
      await timeline.rescheduleSave.click();
      clicks += 1;
      await expect(timeline.reschedule).toHaveCount(0);

      expect(clicks).toBe(4);
      expect((await readTask(page, id)).endDate).toBe(newEnd);
    } finally {
      if (id) await deleteWorkItemViaApi(page, id);
    }
  });
});
