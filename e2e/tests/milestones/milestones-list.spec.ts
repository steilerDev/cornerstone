/**
 * E2E tests for the Milestones list on the object-list template (#2246, EPIC-21 P5.2).
 *
 * Scenarios covered:
 * M1  Table headers Milestone / Target / Projected / Waits for / Holds up / Status (AC4)
 * M2  Upcoming and Reached chips (plus All), no Group by control (AC6)
 * M3  "Late · n d" for a late milestone, seeded through the API (AC3)
 * M4  Filters › Target date narrows the list (WRK-075)
 * M5  The title link opens the milestone
 * M6  A legacy ?page= / ?pageSize= URL is ignored (removed) and the list renders
 * M7  Waits for counts the linked tasks; Holds up shows only while tasks wait
 * M8  The chips split Upcoming from Reached
 *
 * All names are synthetic; every assertion is scoped by the per-worker `testPrefix` search.
 */

import { test, expect } from '../../fixtures/auth.js';
import {
  createMilestoneViaApi,
  createWorkItemViaApi,
  deleteMilestoneViaApi,
  deleteWorkItemViaApi,
} from '../../fixtures/apiHelpers.js';
import { dayOffset } from '../../fixtures/homeMocks.js';
import { API } from '../../fixtures/testData.js';
import { MilestonesPage } from '../../pages/MilestonesPage.js';
import { routeUrl } from '../../../shared/src/routes/index.js';

const searchQuery = (text: string): string => `q=${encodeURIComponent(text)}`;

// ─────────────────────────────────────────────────────────────────────────────
// M1 - headers
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Milestones list - columns (AC4)', { tag: '@responsive' }, () => {
  test('M1: the table headers are Milestone, Target, Projected, Waits for, Holds up and Status', async ({
    page,
    testPrefix,
  }) => {
    test.skip((page.viewportSize()?.width ?? 1440) < 1024, 'the table shows from 1024px');
    const list = new MilestonesPage(page);
    const title = `${testPrefix} Header Milestone`;
    const id = await createMilestoneViaApi(page, { title, targetDate: dayOffset(40) });
    try {
      await list.goto(searchQuery(title));
      await list.waitForLoaded();
      await expect(list.milestoneRow(title)).toHaveCount(1);
      await expect(list.olist.tableSurface.locator('thead th')).toHaveText([
        /^Milestone/,
        /^Target/,
        /^Projected/,
        /^Waits for/,
        /^Holds up/,
        /^Status/,
        /^Actions$/,
      ]);
    } finally {
      await deleteMilestoneViaApi(page, id);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// M2 - chips, no grouping
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Milestones list - chips and grouping (AC6)', { tag: '@responsive' }, () => {
  test('M2: Upcoming and Reached chips plus All; there is no Group by control', async ({
    page,
  }) => {
    const list = new MilestonesPage(page);

    await list.goto();
    await list.waitForLoaded();

    await expect(list.chip('upcoming')).toBeVisible();
    await expect(list.chip('reached')).toBeVisible();
    await expect(list.chip('all')).toBeVisible();
    await expect(list.chip('upcoming')).toContainText('Upcoming');
    await expect(list.chip('reached')).toContainText('Reached');
    await expect(list.groupMenuButton).toHaveCount(0);
    // Late and Early are status words on the row, not chips
    await expect(page.getByTestId('milestones-chip-late')).toHaveCount(0);
    await expect(page.getByTestId('milestones-chip-early')).toHaveCount(0);
  });

  test('M8: the Reached chip lists reached milestones, the Upcoming chip the others', async ({
    page,
    testPrefix,
  }) => {
    const list = new MilestonesPage(page);
    const open = `${testPrefix} Chip Open`;
    const done = `${testPrefix} Chip Done`;
    const ids: number[] = [];
    try {
      ids.push(await createMilestoneViaApi(page, { title: open, targetDate: dayOffset(50) }));
      const doneId = await createMilestoneViaApi(page, { title: done, targetDate: dayOffset(51) });
      ids.push(doneId);
      const patched = await page.request.patch(`${API.milestones}/${doneId}`, {
        data: { isCompleted: true },
      });
      expect(patched.ok(), `PATCH milestone: ${patched.status()}`).toBeTruthy();

      await list.goto(searchQuery(`${testPrefix} Chip`));
      await list.waitForLoaded();
      await expect
        .poll(() => list.getMilestoneTitles())
        .toEqual(expect.arrayContaining([open, done]));

      await list.selectChip('reached');
      await expect.poll(() => list.getMilestoneTitles()).toEqual([done]);
      await list.selectChip('upcoming');
      await expect.poll(() => list.getMilestoneTitles()).toEqual([open]);
    } finally {
      for (const id of ids) await deleteMilestoneViaApi(page, id);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// M3 / M7 - Late · n d, Waits for, Holds up
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Milestones list - schedule words (AC3)', { tag: '@responsive' }, () => {
  test.describe.configure({ timeout: 90_000 });

  test('M3: a milestone whose tasks end after its target shows "Late · n d"', async ({
    page,
    testPrefix,
  }) => {
    const list = new MilestonesPage(page);
    const title = `${testPrefix} Late Milestone`;
    const taskIds: string[] = [];
    let milestoneId: number | null = null;
    try {
      milestoneId = await createMilestoneViaApi(page, { title, targetDate: dayOffset(30) });
      // A task that counts toward the milestone and ends 5 days after the target
      const task = await createWorkItemViaApi(page, {
        title: `${testPrefix} Late Milestone Task`,
        status: 'not_started',
        startDate: dayOffset(33),
        endDate: dayOffset(35),
      });
      taskIds.push(task);
      const linked = await page.request.post(`${API.milestones}/${milestoneId}/work-items`, {
        data: { workItemId: task },
      });
      expect(linked.ok(), `POST milestone work item: ${linked.status()}`).toBeTruthy();

      // The server's own projection decides the number of days
      const response = await page.request.get(API.milestones);
      const row = (
        (await response.json()) as {
          milestones: Array<{ id: number; targetDate: string; projectedDate: string | null }>;
        }
      ).milestones.find((milestone) => milestone.id === milestoneId)!;
      expect(row.projectedDate, 'the milestone has a projected date').not.toBeNull();
      const days = Math.round(
        (Date.parse(row.projectedDate!) - Date.parse(row.targetDate)) / (24 * 60 * 60 * 1000),
      );
      expect(days, 'the linked task ends after the target').toBeGreaterThan(0);

      await list.goto(searchQuery(title));
      await list.waitForLoaded();
      await expect(list.statusBadge(milestoneId)).toHaveText(`Late · ${days} d`);
    } finally {
      for (const id of taskIds) await deleteWorkItemViaApi(page, id);
      if (milestoneId !== null) await deleteMilestoneViaApi(page, milestoneId);
    }
  });

  test('M7: Waits for counts the linked tasks; Holds up appears only while tasks wait', async ({
    page,
    testPrefix,
  }) => {
    test.skip((page.viewportSize()?.width ?? 1440) < 1024, 'the columns exist on the table only');
    const list = new MilestonesPage(page);
    const bare = `${testPrefix} Waits Bare`;
    const busy = `${testPrefix} Waits Busy`;
    const taskIds: string[] = [];
    const milestoneIds: number[] = [];
    try {
      milestoneIds.push(
        await createMilestoneViaApi(page, { title: bare, targetDate: dayOffset(60) }),
      );
      const busyId = await createMilestoneViaApi(page, { title: busy, targetDate: dayOffset(61) });
      milestoneIds.push(busyId);
      for (const suffix of ['One', 'Two']) {
        const task = await createWorkItemViaApi(page, {
          title: `${testPrefix} Waits Task ${suffix}`,
          status: 'not_started',
          startDate: dayOffset(55),
          endDate: dayOffset(57),
        });
        taskIds.push(task);
        const linked = await page.request.post(`${API.milestones}/${busyId}/work-items`, {
          data: { workItemId: task },
        });
        expect(linked.ok(), `POST milestone work item: ${linked.status()}`).toBeTruthy();
      }

      await list.goto(searchQuery(`${testPrefix} Waits`));
      await list.waitForLoaded();
      await expect(list.milestoneRow(busy)).toContainText('2 tasks');
      // Nothing waits for either milestone, so there is no Holds up figure
      await expect(list.holdsUp(busyId)).toHaveCount(0);
      await expect(list.milestoneRow(bare)).not.toContainText('task');
    } finally {
      for (const id of taskIds) await deleteWorkItemViaApi(page, id);
      for (const id of milestoneIds) await deleteMilestoneViaApi(page, id);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// M4 - Target date filter
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Milestones list - filters (WRK-075)', { tag: '@responsive' }, () => {
  test('M4: Filters › Target date narrows the list to the date range', async ({
    page,
    testPrefix,
  }) => {
    const list = new MilestonesPage(page);
    const early = `${testPrefix} Range Early`;
    const late = `${testPrefix} Range Late`;
    const ids: number[] = [];
    try {
      ids.push(await createMilestoneViaApi(page, { title: early, targetDate: '2032-03-10' }));
      ids.push(await createMilestoneViaApi(page, { title: late, targetDate: '2032-09-20' }));

      await list.goto(searchQuery(`${testPrefix} Range`));
      await list.waitForLoaded();
      await expect
        .poll(() => list.getMilestoneTitles())
        .toEqual(expect.arrayContaining([early, late]));

      await list.setTargetDateRange('2032-01-01', '2032-06-30');
      await page.waitForURL((url) => url.searchParams.has('targetDate'));

      await expect.poll(() => list.getMilestoneTitles()).toEqual([early]);
    } finally {
      for (const id of ids) await deleteMilestoneViaApi(page, id);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// M5 / M6 - row link, legacy URL
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Milestones list - links and legacy URLs', { tag: '@responsive' }, () => {
  test('M5: the title link opens the milestone', async ({ page, testPrefix }) => {
    const list = new MilestonesPage(page);
    const title = `${testPrefix} Link Milestone`;
    const id = await createMilestoneViaApi(page, { title, targetDate: dayOffset(70) });
    try {
      await list.goto(searchQuery(title));
      await list.waitForLoaded();
      await list.openMilestone(title);

      await page.waitForURL((url) => url.pathname === routeUrl('milestone', { id }));
    } finally {
      await deleteMilestoneViaApi(page, id);
    }
  });

  test('M6: a legacy ?page=2&pageSize=10 URL is removed and the list renders', async ({ page }) => {
    const list = new MilestonesPage(page);

    await list.goto('page=2&pageSize=10');
    await list.waitForLoaded();

    await page.waitForURL(
      (url) => !url.searchParams.has('page') && !url.searchParams.has('pageSize'),
    );
    await expect(list.heading).toBeVisible();
    await expect(list.olist.retryButton).toHaveCount(0);
  });
});
