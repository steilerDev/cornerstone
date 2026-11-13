/**
 * E2E tests for the Milestone page on the object template (#2250, EPIC-21 P5.6).
 *
 * The basics (load, edit, delete, not found) are also covered in `milestones.spec.ts`. This file
 * holds the acceptance scenarios of the story:
 *
 *  M1  AC1       the strip: 4 facts in order, the title appears once (h1 only)
 *  M2  AC2       Mark reached: past target offers Today / On target / Pick; a future target offers
 *                no On target chip; Today applies, the Toast Undo restores
 *  M3  AC7       reached: the primary is Reopen (no date step); the Toast Undo restores the reached
 *                state and the date
 *  M4  AC2       Change target: focus lands on the Target date field, Save updates the strip
 *  M5  AC3/AC6   Counts toward: add a task, Remove + Undo
 *  M6  AC3/AC6   Waiting for: add a task and a purchase (kind word and status shown), Remove + Undo
 *  M7  AC6       a task in one list is not offered by the other list's picker
 *  M8  AC8       picker race: a task linked elsewhere is refused with a translated inline error and
 *                both lists stay unchanged
 *  M9  AC4       History tab: the created line and the feed section
 *  M10 AC5       the strip stays short: bottom <= 450px on desktop, <= 844px and 2 columns on a phone
 *  M11           Delete from the ⋯ menu (Cancel keeps it, Delete lands on Milestones); not found
 *
 * Data is created through the API with per-test names (`testPrefix`); no history delay event is
 * seeded (it needs the scheduler), so the History tab asserts the section and the created line.
 */

import type { Page } from '@playwright/test';
import { test, expect } from '../../fixtures/auth.js';
import { routeUrl } from '../../../shared/src/routes/index.js';
import { API } from '../../fixtures/testData.js';
import {
  createHouseholdItemViaApi,
  createMilestoneViaApi,
  createWorkItemViaApi,
  deleteHouseholdItemViaApi,
  deleteMilestoneViaApi,
  deleteWorkItemViaApi,
} from '../../fixtures/apiHelpers.js';
import { todayIso } from '../../fixtures/captureSeed.js';
import { newCleanup, runCleanup } from '../../fixtures/costLineSeed.js';
import type { SeedCleanup } from '../../fixtures/costLineSeed.js';
import { MilestoneDetailPage } from '../../pages/MilestoneDetailPage.js';

let cleanup: SeedCleanup;

test.beforeEach(() => {
  cleanup = newCleanup();
});

test.afterEach(async () => {
  await runCleanup(cleanup);
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function makeMilestone(
  page: Page,
  title: string,
  targetDate: string = todayIso(30),
): Promise<number> {
  const id = await createMilestoneViaApi(page, { title, targetDate });
  // A UI delete may already have removed it: the cleanup ignores a 404
  cleanup.fns.push(() => deleteMilestoneViaApi(page, id));
  return id;
}

async function makeTask(page: Page, title: string): Promise<string> {
  const id = await createWorkItemViaApi(page, { title });
  cleanup.fns.push(() => deleteWorkItemViaApi(page, id));
  return id;
}

async function makePurchase(page: Page, name: string): Promise<string> {
  const id = await createHouseholdItemViaApi(page, { name });
  cleanup.fns.push(() => deleteHouseholdItemViaApi(page, id));
  return id;
}

/** Link a task so it counts toward the milestone (API). */
async function linkCountsToward(page: Page, milestoneId: number, taskId: string): Promise<void> {
  const response = await page.request.post(`${API.milestones}/${milestoneId}/work-items`, {
    data: { workItemId: taskId },
  });
  expect(response.ok(), `link task: ${response.status()}`).toBeTruthy();
}

interface ApiMilestone {
  isCompleted: boolean;
  completedAt: string | null;
  targetDate: string;
  workItems: { id: string }[];
  dependentWorkItems: { id: string }[];
  dependentHouseholdItems: { id: string }[];
}

async function fetchMilestone(page: Page, id: number): Promise<ApiMilestone> {
  const response = await page.request.get(`${API.milestones}/${id}`);
  expect(response.ok(), `GET milestone: ${response.status()}`).toBeTruthy();
  return (await response.json()) as ApiMilestone;
}

// ─────────────────────────────────────────────────────────────────────────────
// M1 (AC1): the strip
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Strip and title (M1, AC1)', { tag: '@responsive' }, () => {
  test(
    'Four facts in order; the title appears once; a task fills Counts toward',
    { tag: '@smoke' },
    async ({ page, testPrefix }) => {
      const title = `${testPrefix} M1 Shell complete`;
      const id = await makeMilestone(page, title);
      // A dated task: its projection equals the target, so the strip says On target
      const datedTaskId = await createWorkItemViaApi(page, {
        title: `${testPrefix} M1 Task`,
        startDate: todayIso(20),
        endDate: todayIso(30),
        durationDays: 10,
      });
      cleanup.fns.push(() => deleteWorkItemViaApi(page, datedTaskId));
      await linkCountsToward(page, id, datedTaskId);
      const milestone = new MilestoneDetailPage(page);

      await milestone.goto(id);

      await expect(milestone.heading).toHaveText(title);
      await expect(page.getByText(title, { exact: true })).toHaveCount(1);
      expect(await milestone.summary.factIds()).toEqual([
        'target',
        'projected',
        'againstTarget',
        'countsToward',
      ]);
      await expect(milestone.summary.label('target')).toHaveText('Target');
      await expect(milestone.summary.label('projected')).toHaveText('Projected');
      await expect(milestone.summary.label('againstTarget')).toHaveText('Against target');
      await expect(milestone.summary.label('countsToward')).toHaveText('Counts toward');
      await expect(milestone.againstTargetBadge).toHaveText('On target');
      await expect(milestone.summary.item('countsToward')).toContainText('1 task');
      await expect(milestone.summary.item('countsToward')).toContainText('1 open');
      await expect(milestone.statusMenu.trigger).toHaveText(/upcoming/i);
      await milestone.breadcrumbs.expectTrail(['Tasks', 'Milestones']);
    },
  );

  test('Without tasks the strip says so in words', async ({ page, testPrefix }) => {
    const id = await makeMilestone(page, `${testPrefix} M1 Empty`);
    const milestone = new MilestoneDetailPage(page);

    await milestone.goto(id);

    await expect(milestone.summary.item('projected')).toContainText('No tasks yet');
    await expect(milestone.summary.item('countsToward')).toContainText('None yet');
    await expect(milestone.againstTargetBadge).toHaveText('Upcoming');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// M2 (AC2): Mark reached
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Mark reached (M2, AC2)', { tag: '@responsive' }, () => {
  test('A past target offers Today, On target and Pick; Today applies and Undo restores', async ({
    page,
    testPrefix,
  }) => {
    const title = `${testPrefix} M2 Past`;
    const id = await makeMilestone(page, title, todayIso(-10));
    const milestone = new MilestoneDetailPage(page);

    await milestone.goto(id);
    await milestone.reachedPrimary.open();
    await expect(milestone.reachedPrimary.dateToday).toBeVisible();
    await expect(milestone.reachedPrimary.datePlanned).toContainText(/on target/i);
    await expect(milestone.reachedPrimary.datePick).toBeVisible();
    await milestone.reachedPrimary.dateToday.click();

    await expect(milestone.statusMenu.trigger).toHaveText(/reached/i);
    await expect(milestone.toasts.undoToastWith(title)).toBeVisible();
    await expect.poll(async () => (await fetchMilestone(page, id)).isCompleted).toBe(true);
    expect((await fetchMilestone(page, id)).completedAt).toContain(todayIso());

    await milestone.toasts.undoViaButton();

    await expect(milestone.statusMenu.trigger).toHaveText(/upcoming/i);
    await expect.poll(async () => (await fetchMilestone(page, id)).isCompleted).toBe(false);
    await expect(milestone.reachedPrimary.trigger).toBeVisible();
  });

  test('On target stores the target date as the reached date', async ({ page, testPrefix }) => {
    const target = todayIso(-10);
    const id = await makeMilestone(page, `${testPrefix} M2 On target`, target);
    const milestone = new MilestoneDetailPage(page);

    await milestone.goto(id);
    await milestone.reachedPrimary.open();
    await milestone.reachedPrimary.datePlanned.click();

    await expect(milestone.statusMenu.trigger).toHaveText(/reached/i);
    await expect.poll(async () => (await fetchMilestone(page, id)).completedAt).toContain(target);
  });

  test('A future target offers no On target chip', async ({ page, testPrefix }) => {
    const id = await makeMilestone(page, `${testPrefix} M2 Future`, todayIso(20));
    const milestone = new MilestoneDetailPage(page);

    await milestone.goto(id);
    await milestone.reachedPrimary.open();

    await expect(milestone.reachedPrimary.dateToday).toBeVisible();
    await expect(milestone.reachedPrimary.datePick).toBeVisible();
    await expect(milestone.reachedPrimary.datePlanned).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// M3 (AC7): Reopen
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Reopen (M3, AC7)', { tag: '@responsive' }, () => {
  test('Reached shows Reopen with no date step; Undo restores the reached state and date', async ({
    page,
    testPrefix,
  }) => {
    const title = `${testPrefix} M3 Reached`;
    const reachedOn = todayIso(-3);
    const id = await makeMilestone(page, title, todayIso(-10));
    const patch = await page.request.patch(`${API.milestones}/${id}`, {
      data: { isCompleted: true, completedAt: reachedOn },
    });
    expect(patch.ok(), `PATCH reached: ${patch.status()}`).toBeTruthy();
    const milestone = new MilestoneDetailPage(page);

    await milestone.goto(id);

    // The primary is never omitted: Reopen replaces Mark reached; Change target is hidden
    await expect(milestone.statusMenu.trigger).toHaveText(/reached/i);
    await expect(milestone.reopenPrimary).toBeVisible();
    await expect(milestone.reachedPrimary.trigger).toHaveCount(0);
    await expect(milestone.changeTargetButton).toHaveCount(0);
    await expect(milestone.summary.label('projected')).toHaveText('Reached');

    await milestone.reopenPrimary.click();

    // No date step: it applies at once
    await expect(milestone.statusMenu.trigger).toHaveText(/upcoming/i);
    await expect(milestone.toasts.undoToastWith(title)).toBeVisible();
    await expect.poll(async () => (await fetchMilestone(page, id)).isCompleted).toBe(false);
    await expect(milestone.reachedPrimary.trigger).toBeVisible();

    await milestone.toasts.undoViaButton();

    await expect(milestone.statusMenu.trigger).toHaveText(/reached/i);
    await expect(milestone.reopenPrimary).toBeVisible();
    await expect.poll(async () => (await fetchMilestone(page, id)).isCompleted).toBe(true);
    expect((await fetchMilestone(page, id)).completedAt).toContain(reachedOn);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// M4: Change target
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Change target (M4)', { tag: '@responsive' }, () => {
  test('Focus lands on the Target date field; Save updates the strip', async ({
    page,
    testPrefix,
  }) => {
    const id = await makeMilestone(page, `${testPrefix} M4 Move`, '2030-01-10');
    const milestone = new MilestoneDetailPage(page);

    await milestone.goto(id);
    await expect(milestone.summary.item('target')).toContainText('2030');

    await milestone.changeTargetButton.click();

    await expect(milestone.targetDateInput).toBeFocused();
    await milestone.targetDateInput.fill('2031-03-15');
    await milestone.detailsCard.save();

    await expect(milestone.summary.item('target')).toContainText('2031');
    await expect(milestone.summary.item('target')).toContainText('15');
    await expect(milestone.detail('target')).toContainText('2031');
    await expect.poll(async () => (await fetchMilestone(page, id)).targetDate).toBe('2031-03-15');
  });

  test('Cancelling a dirty Details card asks before discarding', async ({ page, testPrefix }) => {
    const id = await makeMilestone(page, `${testPrefix} M4 Cancel`, '2030-02-10');
    const milestone = new MilestoneDetailPage(page);

    await milestone.goto(id);
    await milestone.changeTargetButton.click();
    await expect(milestone.targetDateInput).toBeFocused();
    await milestone.targetDateInput.fill('2032-06-01');
    await milestone.detailsCard.cancel();
    await expect(milestone.detailsCard.discardConfirm.dialog).toBeVisible();
    await milestone.detailsCard.discardConfirm.confirmButton.click();

    await expect(milestone.targetDateInput).toHaveCount(0);
    expect((await fetchMilestone(page, id)).targetDate).toBe('2030-02-10');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// M5-M7 (AC3, AC6): the two lists
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Counts toward (M5, AC3/AC6)', { tag: '@responsive' }, () => {
  test('Add a task, then Remove with Undo', async ({ page, testPrefix }) => {
    const taskTitle = `${testPrefix} M5 Roof task`;
    const taskId = await makeTask(page, taskTitle);
    const id = await makeMilestone(page, `${testPrefix} M5 Counts`);
    const milestone = new MilestoneDetailPage(page);

    await milestone.goto(id, { tab: 'work' });
    await expect(milestone.counts.heading).toContainText(/^Counts toward this milestone\b/);
    await expect(
      milestone.counts.emptyMessage('No task counts toward this milestone yet.'),
    ).toBeVisible();

    await milestone.addAction(milestone.counts, 'Add task').click();
    await milestone.countsPicker.pick(taskTitle);

    await expect(milestone.counts.row(taskId)).toContainText(taskTitle);
    await expect(milestone.counts.row(taskId)).toContainText(/not started/i);
    await expect(milestone.counts.link(taskId)).toHaveAttribute(
      'href',
      routeUrl('workItem', { id: taskId }),
    );
    expect((await fetchMilestone(page, id)).workItems.map((w) => w.id)).toEqual([taskId]);
    await expect(milestone.summary.item('countsToward')).toContainText('1 task');

    await milestone.counts.remove(taskId);

    await expect(milestone.counts.row(taskId)).toHaveCount(0);
    await expect(milestone.toasts.undoToastWith(`Removed ${taskTitle}`)).toBeVisible();
    expect((await fetchMilestone(page, id)).workItems).toHaveLength(0);

    await milestone.toasts.undoViaButton();

    await expect(milestone.counts.row(taskId)).toBeVisible();
    expect((await fetchMilestone(page, id)).workItems.map((w) => w.id)).toEqual([taskId]);
  });
});

test.describe('Waiting for (M6, AC3/AC6)', { tag: '@responsive' }, () => {
  test('Add a task and a purchase with kind word and status; Remove with Undo', async ({
    page,
    testPrefix,
  }) => {
    const taskTitle = `${testPrefix} M6 Plaster task`;
    const purchaseName = `${testPrefix} M6 Oven purchase`;
    const taskId = await makeTask(page, taskTitle);
    const purchaseId = await makePurchase(page, purchaseName);
    const id = await makeMilestone(page, `${testPrefix} M6 Waiting`);
    const taskKey = MilestoneDetailPage.taskKey(taskId);
    const purchaseKey = MilestoneDetailPage.purchaseKey(purchaseId);
    const milestone = new MilestoneDetailPage(page);

    await milestone.goto(id, { tab: 'work' });
    await expect(milestone.waiting.heading).toContainText(/^Waiting for this milestone\b/);
    await expect(
      milestone.waiting.emptyMessage('Nothing waits for this milestone yet.'),
    ).toBeVisible();

    await milestone.addAction(milestone.waiting, 'Add task or purchase').click();
    await milestone.waitingPicker.pick(taskTitle);
    await expect(milestone.waiting.row(taskKey)).toContainText(taskTitle);
    await expect(milestone.waiting.row(taskKey)).toContainText('Task');
    await expect(milestone.waiting.row(taskKey)).toContainText(/not started/i);

    await milestone.addAction(milestone.waiting, 'Add task or purchase').click();
    await milestone.waitingPicker.pick(purchaseName);
    await expect(milestone.waiting.row(purchaseKey)).toContainText(purchaseName);
    await expect(milestone.waiting.row(purchaseKey)).toContainText('Purchase');
    await expect(milestone.waiting.row(purchaseKey)).toContainText(/planned/i);
    await expect(milestone.waiting.link(purchaseKey)).toHaveAttribute(
      'href',
      routeUrl('householdItem', { id: purchaseId }),
    );

    // A purchase never counts toward a milestone
    await expect(milestone.counts.rows).toHaveCount(0);
    const stored = await fetchMilestone(page, id);
    expect(stored.dependentWorkItems.map((w) => w.id)).toEqual([taskId]);
    expect(stored.dependentHouseholdItems.map((h) => h.id)).toEqual([purchaseId]);

    await milestone.waiting.remove(purchaseKey);

    await expect(milestone.waiting.row(purchaseKey)).toHaveCount(0);
    await expect(milestone.toasts.undoToastWith(`Removed ${purchaseName}`)).toBeVisible();
    expect((await fetchMilestone(page, id)).dependentHouseholdItems).toHaveLength(0);

    await milestone.toasts.undoViaButton();

    await expect(milestone.waiting.row(purchaseKey)).toBeVisible();
    expect((await fetchMilestone(page, id)).dependentHouseholdItems.map((h) => h.id)).toEqual([
      purchaseId,
    ]);
  });
});

test.describe('Pickers exclude the other list (M7, AC6)', { tag: '@responsive' }, () => {
  test('A task in Counts toward is not offered for Waiting for, and the reverse', async ({
    page,
    testPrefix,
  }) => {
    const countsTitle = `${testPrefix} M7 Counting task`;
    const waitingTitle = `${testPrefix} M7 Waiting task`;
    const freeTitle = `${testPrefix} M7 Free task`;
    const countsId = await makeTask(page, countsTitle);
    const waitingId = await makeTask(page, waitingTitle);
    await makeTask(page, freeTitle);
    const id = await makeMilestone(page, `${testPrefix} M7 Both`);
    await linkCountsToward(page, id, countsId);
    const dependent = await page.request.post(`${API.milestones}/${id}/dependents/${waitingId}`, {
      data: {},
    });
    expect(dependent.ok(), `POST dependent: ${dependent.status()}`).toBeTruthy();
    const milestone = new MilestoneDetailPage(page);

    await milestone.goto(id, { tab: 'work' });
    await expect(milestone.counts.row(countsId)).toBeVisible();
    await expect(milestone.waiting.row(MilestoneDetailPage.taskKey(waitingId))).toBeVisible();

    // Waiting for: the counting task is absent, the free one is offered (search has settled)
    await milestone.addAction(milestone.waiting, 'Add task or purchase').click();
    await milestone.waitingPicker.type(`${testPrefix} M7`);
    await expect(milestone.waitingPicker.option(freeTitle)).toBeVisible();
    await expect(milestone.waitingPicker.option(countsTitle)).toHaveCount(0);
    await expect(milestone.waitingPicker.option(waitingTitle)).toHaveCount(0);
    await page.keyboard.press('Escape');

    // Counts toward: the waiting task is absent
    await milestone.addAction(milestone.counts, 'Add task').click();
    await milestone.countsPicker.type(`${testPrefix} M7`);
    await expect(milestone.countsPicker.option(freeTitle)).toBeVisible();
    await expect(milestone.countsPicker.option(waitingTitle)).toHaveCount(0);
    await expect(milestone.countsPicker.option(countsTitle)).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// M8 (AC8): picker race
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Picker race (M8, AC8)', { tag: '@responsive' }, () => {
  test('A task linked elsewhere in the meantime is refused inline and nothing changes', async ({
    page,
    testPrefix,
  }) => {
    const taskTitle = `${testPrefix} M8 Raced task`;
    const taskId = await makeTask(page, taskTitle);
    const id = await makeMilestone(page, `${testPrefix} M8 Race`);
    const milestone = new MilestoneDetailPage(page);

    // The page loads with both lists empty, and the picker offers the task ...
    await milestone.goto(id, { tab: 'work' });
    await milestone.addAction(milestone.waiting, 'Add task or purchase').click();
    await milestone.waitingPicker.type(taskTitle);
    await expect(milestone.waitingPicker.option(taskTitle)).toBeVisible();

    // ... another tab links it to Counts toward before the choice is made
    await linkCountsToward(page, id, taskId);
    await milestone.waitingPicker.option(taskTitle).click();

    // The server's refusal is shown translated inside the picker
    await expect(
      milestone.waiting.root.getByText(
        'This task counts toward this milestone, so it cannot wait for it.',
      ),
    ).toBeVisible();
    // Neither list changed on this page, and the server holds only the first link
    await expect(milestone.waiting.rows).toHaveCount(0);
    await expect(milestone.counts.rows).toHaveCount(0);
    const stored = await fetchMilestone(page, id);
    expect(stored.workItems.map((w) => w.id)).toEqual([taskId]);
    expect(stored.dependentWorkItems).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// M9 (AC4): History
// ─────────────────────────────────────────────────────────────────────────────

test.describe('History (M9, AC4)', { tag: '@responsive' }, () => {
  test('The History tab shows the created line and the history section', async ({
    page,
    testPrefix,
  }) => {
    const id = await makeMilestone(page, `${testPrefix} M9 History`);
    const milestone = new MilestoneDetailPage(page);

    await milestone.goto(id);
    await milestone.openTab('history');

    await expect(milestone.historyCreated).toContainText(/^Created/);
    await expect(milestone.historyCreated).toContainText('Last updated');
    await expect(milestone.history).toBeVisible();
    await expect(milestone.history).toContainText('History');
    // The section settles on its feed or its empty state, never on an error
    await expect(milestone.history.getByText("Couldn't load the history.")).toHaveCount(0);
  });

  test('?tab=history opens the History tab directly', async ({ page, testPrefix }) => {
    const id = await makeMilestone(page, `${testPrefix} M9 Deep link`);
    const milestone = new MilestoneDetailPage(page);

    await milestone.goto(id, { tab: 'history' });

    await expect(milestone.tabs.tab('history')).toHaveAttribute('aria-selected', 'true');
    await expect(milestone.history).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// M10 (AC5): the strip stays short
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Strip height (M10, AC5)', { tag: '@responsive' }, () => {
  test('Desktop: header plus strip end within 450px', async ({ page, testPrefix }) => {
    test.skip((page.viewportSize()?.width ?? 0) < 1024, 'desktop limit');
    const id = await makeMilestone(page, `${testPrefix} M10 Desktop`);
    await linkCountsToward(page, id, await makeTask(page, `${testPrefix} M10 Task`));
    const milestone = new MilestoneDetailPage(page);

    await milestone.goto(id);

    const box = await milestone.summary.stripBox();
    expect(box.bottom, 'desktop strip bottom').toBeLessThanOrEqual(450);
    expect(await milestone.summary.columnCount(), 'desktop columns').toBe(4);
  });

  test('Phone (390x844): the strip ends within the screen in a 2-column grid', async ({
    page,
    testPrefix,
  }) => {
    test.skip((page.viewportSize()?.width ?? 0) >= 600, 'phone limit');
    await page.setViewportSize({ width: 390, height: 844 });
    const id = await makeMilestone(page, `${testPrefix} M10 Phone`);
    await linkCountsToward(page, id, await makeTask(page, `${testPrefix} M10 Phone task`));
    const milestone = new MilestoneDetailPage(page);

    await milestone.goto(id);

    const box = await milestone.summary.stripBox();
    expect(box.bottom, 'phone strip bottom').toBeLessThanOrEqual(844);
    expect(await milestone.summary.columnCount(), 'phone columns').toBe(2);
    expect(await milestone.summary.rowCount(), 'phone rows').toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// M11: Delete and not found
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Delete and not found (M11)', { tag: '@responsive' }, () => {
  test('Cancel keeps the milestone; Delete removes it and lands on Milestones', async ({
    page,
    testPrefix,
  }) => {
    const title = `${testPrefix} M11 Delete`;
    const id = await makeMilestone(page, title);
    const milestone = new MilestoneDetailPage(page);

    await milestone.goto(id);
    await milestone.openDeleteModal();
    await expect(milestone.deleteModal).toContainText(title);
    await milestone.cancelDelete();
    await expect(milestone.heading).toHaveText(title);
    expect(page.url()).toContain(`/project/milestones/${id}`);

    await milestone.deleteMilestone();

    await expect(page.getByRole('heading', { level: 1, name: 'Milestones' })).toBeVisible();
    const gone = await page.request.get(`${API.milestones}/${id}`);
    expect(gone.status()).toBe(404);
  });

  test('An unknown id shows "Milestone not found" with a way back', async ({ page }) => {
    const milestone = new MilestoneDetailPage(page);

    await milestone.goto(999999999);

    await expect(milestone.heading).toHaveText('Milestone not found');
    await expect(milestone.backToMilestonesButton).toBeVisible();
    await milestone.backToMilestonesButton.click();
    await page.waitForURL('**/project/milestones');
  });
});
