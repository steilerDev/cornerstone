/**
 * E2E tests for the Tasks list on the object template (#2245, EPIC-21 P5.1).
 *
 * T1   AC1   default Time groups, their order and counts (equal to the API's groupCounts)
 * T2   AC2   Done is collapsed while other groups have rows; the Done chip opens it
 * T3   AC3   row anatomy: area, grant, Late / Held up / Critical, Who, Expected cost, Waits for,
 *            Holds up
 * T4   AC4   status chips (none of the three pressed by default); the heading count shows only
 *            while a search or filter is active
 * T5   AC5   Filters: Area, Company, Household member, Milestone, Start / End date, Cost lines
 * T6   AC6   Group by Area / Company / Status
 * T7   AC7   above 100 rows: "(n of total)", Time stays available, the others say why not
 * T8   AC8   Start / Mark done: the row moves, focus goes to the next row of the former group
 * T9   AC9   bulk Set status and Set area
 * T10  AC10  Delete through the ConfirmDialog
 * T11  AC11  a stored legacy column preference maps to the new columns
 * T12  AC12  an old ?page=&pageSize= URL drops the paging params without pushing history
 *
 * Every test seeds synthetic tasks through the API with `testPrefix`, and finds them with `?q=` (a
 * search never depends on how many tasks other workers created) or, where a status chip is under
 * test, with a company filter (a filter, unlike a search, keeps the chips in play).
 */

import { test, expect } from '../../fixtures/isolatedUser.js';
import type { Page } from '@playwright/test';
import {
  createAreaViaApi,
  createMilestoneViaApi,
  createWorkItemViaApi,
  deleteAreaViaApi,
  deleteMilestoneViaApi,
  deleteWorkItemViaApi,
} from '../../fixtures/apiHelpers.js';
import {
  createCostLine,
  createFundingSource,
  createVendor,
  newCleanup,
  runCleanup,
} from '../../fixtures/costLineSeed.js';
import type { SeedCleanup } from '../../fixtures/costLineSeed.js';
import { createGrant } from '../../fixtures/financingSeed.js';
import { dayOffset } from '../../fixtures/homeMocks.js';
import { installRouteLog, readRouteLog } from '../../fixtures/routeLog.js';
import { API } from '../../fixtures/testData.js';
import { WorkItemsPage } from '../../pages/WorkItemsPage.js';
import { ToastRegion } from '../../pages/components/ToastRegion.js';

const WORK_ITEM_TIME_KEYS = ['late', 'this_week', 'next_two_weeks', 'later', 'done'] as const;

interface ApiRow {
  id: string;
  title: string;
  timeWindow: string;
  expectedCost: number | null;
  isCritical: boolean;
  holdsUp: { count: number } | null;
  waitsFor: { id: string; title: string; more: number } | null;
  area: { id: string } | null;
}

interface ApiList {
  items: ApiRow[];
  groupCounts?: Record<string, number>;
  scopeTotal: number;
}

async function readList(page: Page, query: string): Promise<ApiList> {
  const response = await page.request.get(`${API.workItems}?${query}`);
  expect(response.ok(), `GET work items: ${response.status()}`).toBeTruthy();
  return (await response.json()) as ApiList;
}

async function seedTask(
  page: Page,
  cleanup: SeedCleanup,
  data: { title: string; [key: string]: unknown },
): Promise<string> {
  const id = await createWorkItemViaApi(page, data);
  cleanup.fns.push(async () => {
    await deleteWorkItemViaApi(page, id);
  });
  return id;
}

async function seedArea(page: Page, cleanup: SeedCleanup, name: string): Promise<string> {
  const id = await createAreaViaApi(page, { name });
  cleanup.fns.push(async () => {
    await deleteAreaViaApi(page, id);
  });
  return id;
}

// ─────────────────────────────────────────────────────────────────────────────
// T1 — default groups, order and counts
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Tasks list - Time groups (AC1)', { tag: '@responsive' }, () => {
  test('T1: the Time groups come in order Late, This week, Next 2 weeks, Later, Done with the API counts', async ({
    page,
    testPrefix,
  }) => {
    const cleanup = newCleanup();
    try {
      await seedTask(page, cleanup, {
        title: `${testPrefix} T1 late`,
        status: 'not_started',
        startDate: dayOffset(-5),
        durationDays: 3,
      });
      await seedTask(page, cleanup, {
        title: `${testPrefix} T1 week`,
        status: 'in_progress',
        startDate: dayOffset(-1),
      });
      await seedTask(page, cleanup, {
        title: `${testPrefix} T1 next`,
        status: 'not_started',
        startDate: dayOffset(10),
        durationDays: 2,
      });
      await seedTask(page, cleanup, {
        title: `${testPrefix} T1 later`,
        status: 'not_started',
        startDate: dayOffset(40),
        durationDays: 2,
      });
      await seedTask(page, cleanup, { title: `${testPrefix} T1 done`, status: 'completed' });

      const list = new WorkItemsPage(page);
      await list.openSearch(`${testPrefix} T1`);

      expect(await list.groupKeys()).toEqual([...WORK_ITEM_TIME_KEYS]);
      const api = await readList(page, `q=${encodeURIComponent(`${testPrefix} T1`)}&group=time`);
      for (const key of WORK_ITEM_TIME_KEYS) {
        expect(await list.groupCount(key), `count of ${key}`).toBe(api.groupCounts![key]);
        expect(api.groupCounts![key], `${key} has the one seeded task`).toBe(1);
      }
      // The Late group shows the badge instead of the plain word
      await expect(list.groupToggle('late')).toContainText('Late');
    } finally {
      await runCleanup(cleanup);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T2 — Done collapsed, the Done chip opens it
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Tasks list - Done group (AC2)', { tag: '@responsive' }, () => {
  test('T2: Done is collapsed while other groups have rows; the Done chip opens it', async ({
    page,
    testPrefix,
  }) => {
    const cleanup = newCleanup();
    try {
      const vendorId = await createVendor(page, cleanup, `${testPrefix} T2 Co`);
      const open = await seedTask(page, cleanup, {
        title: `${testPrefix} T2 open`,
        status: 'in_progress',
        startDate: dayOffset(-1),
        assignedVendorId: vendorId,
      });
      const done = await seedTask(page, cleanup, {
        title: `${testPrefix} T2 done`,
        status: 'completed',
        assignedVendorId: vendorId,
      });

      const list = new WorkItemsPage(page);
      await list.goto(`assignedVendorId=${vendorId}`);
      await list.waitForLoaded();

      await expect(list.title(open)).toBeVisible();
      await expect(list.groupToggle('done')).toHaveAttribute('aria-expanded', 'false');
      await expect(list.title(done)).toHaveCount(0);

      // The Done chip leaves only Done rows, and the group is open
      await list.selectChip('completed');
      await expect(list.title(done)).toBeVisible();
      await expect(list.title(open)).toHaveCount(0);
    } finally {
      await runCleanup(cleanup);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T3 — row anatomy
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Tasks list - row anatomy (AC3)', { tag: '@responsive' }, () => {
  test('T3: a late task with area, grant, Who, cost and a successor shows its markers and relations', async ({
    page,
    testPrefix,
  }) => {
    const cleanup = newCleanup();
    try {
      const areaName = `${testPrefix} T3 Kitchen`;
      const areaId = await seedArea(page, cleanup, areaName);
      const vendorName = `${testPrefix} T3 Tiler`;
      const vendorId = await createVendor(page, cleanup, vendorName);
      const budgetSourceId = await createFundingSource(page, cleanup, `${testPrefix} T3 Source`);

      const lateTitle = `${testPrefix} T3 Late tiling`;
      const lateId = await seedTask(page, cleanup, {
        title: lateTitle,
        status: 'not_started',
        startDate: dayOffset(-5),
        durationDays: 3,
        areaId,
        assignedVendorId: vendorId,
      });
      const heldTitle = `${testPrefix} T3 Held painting`;
      const heldId = await seedTask(page, cleanup, { title: heldTitle, status: 'not_started' });
      const dependency = await page.request.post(`${API.workItems}/${heldId}/dependencies`, {
        data: { predecessorId: lateId, dependencyType: 'finish_to_start' },
      });
      expect(dependency.ok(), 'POST dependency').toBeTruthy();
      await createCostLine(page, {
        kind: 'work_item',
        hostId: lateId,
        budgetSourceId,
        description: 'Tiles',
        plannedAmount: 1200,
      });
      const grantName = `${testPrefix} T3 Grant`;
      await createGrant(page, cleanup, {
        name: grantName,
        reductionValue: 25,
        applicationStatus: 'approved',
        items: [{ type: 'work_item', id: lateId }],
      });

      const list = new WorkItemsPage(page);
      await list.openSearch(`${testPrefix} T3`);

      const api = await readList(page, `q=${encodeURIComponent(`${testPrefix} T3`)}&group=time`);
      const lateRow = api.items.find((row) => row.id === lateId)!;
      const heldRow = api.items.find((row) => row.id === heldId)!;
      expect(lateRow.expectedCost, 'the list sends the Expected cost').not.toBeNull();
      expect(lateRow.holdsUp?.count).toBe(1);
      expect(heldRow.waitsFor?.id).toBe(lateId);

      // Both surfaces: title, status, Late and Held up markers, Critical exactly when the API says
      await expect(list.title(lateId)).toHaveText(lateTitle);
      await expect(list.statusBadge(lateId)).toHaveText('Not started');
      await expect(list.scheduleSignal(lateId)).toHaveText('Late · 5 d');
      await expect(list.scheduleSignal(heldId)).toHaveText('Held up');
      await expect(list.criticalBadge(lateId)).toHaveCount(lateRow.isCritical ? 1 : 0);

      if (!(await list.isTableSurface())) {
        // Cards: the area is a fact on the second line
        await expect(list.workItemRow(lateTitle)).toContainText(areaName);
        return;
      }

      await expect(list.areaLink(lateId)).toHaveText(areaName);
      await expect(list.grantChips(lateId)).toContainText(`${grantName} · 25%`);
      await expect(list.workItemRow(lateTitle)).toContainText(vendorName);
      // Expected cost equals the server's figure
      const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR' });
      await expect(list.workItemRow(lateTitle)).toContainText(money.format(lateRow.expectedCost!));
      // Relations: the late task holds up its successor; the successor waits for it
      await expect(list.holdsUp(lateId)).toHaveText('Holds up 1 task');
      await expect(list.holdsUp(lateId)).toHaveAttribute('data-figure', 'holds-up');
      await expect(list.waitsFor(heldId)).toHaveText(lateTitle);
      await list.waitsFor(heldId).click();
      await page.waitForURL((url) => url.pathname.endsWith(`/${lateId}`));
    } finally {
      await runCleanup(cleanup);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T4 — chips and heading count
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Tasks list - chips and heading count (AC4)', { tag: '@responsive' }, () => {
  test('T4: no status chip is pressed by default; a chip alone shows no heading count, a search does', async ({
    page,
    testPrefix,
  }) => {
    const cleanup = newCleanup();
    try {
      await seedTask(page, cleanup, { title: `${testPrefix} T4 one`, status: 'in_progress' });
      await seedTask(page, cleanup, { title: `${testPrefix} T4 two`, status: 'not_started' });

      const list = new WorkItemsPage(page);
      await list.goto();
      await list.waitForLoaded();
      for (const chip of ['not_started', 'in_progress', 'completed'] as const) {
        await expect(list.chip(chip)).toHaveAttribute('aria-pressed', 'false');
      }
      await expect(list.heading).toHaveText('Tasks');
      expect(await list.headingCounts()).toBeNull();

      // A chip alone is not a filter
      await list.selectChip('in_progress');
      await expect(list.heading).toHaveText('Tasks');
      expect(await list.headingCounts()).toBeNull();

      // A search is: "Tasks (n of m)"
      await list.search(`${testPrefix} T4`);
      await expect.poll(() => list.headingCounts()).not.toBeNull();
      const counts = (await list.headingCounts())!;
      expect(counts.total).not.toBeNull();
      expect(counts.shown).toBeLessThanOrEqual(counts.total!);
    } finally {
      await runCleanup(cleanup);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T5 — filters
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Tasks list - Filters panel (AC5)', { tag: '@responsive' }, () => {
  test('T5: Area, Company, Household member and Milestone narrow the list and write their URL params', async ({
    page,
    testPrefix,
  }) => {
    const cleanup = newCleanup();
    let milestoneId: number | null = null;
    try {
      const areaName = `${testPrefix} T5 Cellar`;
      const areaId = await seedArea(page, cleanup, areaName);
      const vendorName = `${testPrefix} T5 Co`;
      const vendorId = await createVendor(page, cleanup, vendorName);
      const me = (await (await page.request.get(API.profile)).json()) as {
        id?: string;
        user?: { id: string; displayName: string };
      };
      const meId = me.user?.id ?? me.id!;
      const meName = me.user?.displayName ?? 'E2E Admin';

      const inArea = await seedTask(page, cleanup, { title: `${testPrefix} T5 area`, areaId });
      const withVendor = await seedTask(page, cleanup, {
        title: `${testPrefix} T5 vendor`,
        assignedVendorId: vendorId,
      });
      const withMember = await seedTask(page, cleanup, {
        title: `${testPrefix} T5 member`,
        assignedUserId: meId,
      });
      const onMilestone = await seedTask(page, cleanup, { title: `${testPrefix} T5 milestone` });
      const plain = await seedTask(page, cleanup, { title: `${testPrefix} T5 plain` });
      const milestoneTitle = `${testPrefix} T5 Handover`;
      milestoneId = await createMilestoneViaApi(page, {
        title: milestoneTitle,
        targetDate: dayOffset(60),
      });
      const link = await page.request.post(`${API.milestones}/${milestoneId}/work-items`, {
        data: { workItemId: onMilestone },
      });
      expect(link.ok(), 'POST milestone link').toBeTruthy();

      const list = new WorkItemsPage(page);
      const param = (name: string) => () => new URL(page.url()).searchParams.get(name);

      // Area
      await list.openSearch(`${testPrefix} T5`);
      await list.pickAreaFilter(areaName);
      await expect.poll(param('areaId')).toBe(areaId);
      await expect(list.titleLinks).toHaveCount(1);
      await expect(list.title(inArea)).toBeVisible();

      // Company
      await list.openSearch(`${testPrefix} T5`);
      await list.pickCompanyFilter(vendorName);
      await expect.poll(param('assignedVendorId')).toBe(vendorId);
      await expect(list.titleLinks).toHaveCount(1);
      await expect(list.title(withVendor)).toBeVisible();

      // Household member
      await list.openSearch(`${testPrefix} T5`);
      await list.openFilters();
      await list.memberFilter.selectOption({ label: meName });
      await expect.poll(param('assignedUserId')).toBe(meId);
      await expect(list.title(withMember)).toBeVisible();
      await expect(list.title(plain)).toHaveCount(0);

      // Milestone
      await list.openSearch(`${testPrefix} T5`);
      await list.openFilters();
      await list.milestoneFilter.selectOption({ label: milestoneTitle });
      await expect.poll(param('milestoneId')).toBe(String(milestoneId));
      await expect(list.titleLinks).toHaveCount(1);
      await expect(list.title(onMilestone)).toBeVisible();
    } finally {
      await runCleanup(cleanup);
      if (milestoneId !== null) await deleteMilestoneViaApi(page, milestoneId);
    }
  });

  test('T5: Start date, End date and Cost lines narrow the list and write their URL params', async ({
    page,
    testPrefix,
  }) => {
    const cleanup = newCleanup();
    try {
      const budgetSourceId = await createFundingSource(page, cleanup, `${testPrefix} T5b Source`);
      const near = await seedTask(page, cleanup, {
        title: `${testPrefix} T5b near`,
        status: 'not_started',
        startDate: dayOffset(100),
        durationDays: 3,
      });
      const far = await seedTask(page, cleanup, {
        title: `${testPrefix} T5b far`,
        status: 'not_started',
        startDate: dayOffset(200),
        durationDays: 3,
      });
      await createCostLine(page, {
        kind: 'work_item',
        hostId: near,
        budgetSourceId,
        description: 'Synthetic cost line',
        plannedAmount: 100,
      });

      const list = new WorkItemsPage(page);
      const param = (name: string) => () => new URL(page.url()).searchParams.get(name);

      // Start date: from a date between the two
      await list.openSearch(`${testPrefix} T5b`);
      await list.openFilters();
      await list.dateInput('startDate', 'from').fill(dayOffset(150));
      await expect.poll(param('startDate')).toBe(`from:${dayOffset(150)}`);
      await expect(list.titleLinks).toHaveCount(1);
      await expect(list.title(far)).toBeVisible();

      // End date: until a date between the two
      await list.openSearch(`${testPrefix} T5b`);
      await list.openFilters();
      await list.dateInput('endDate', 'to').fill(dayOffset(150));
      await expect.poll(param('endDate')).toBe(`to:${dayOffset(150)}`);
      await expect(list.titleLinks).toHaveCount(1);
      await expect(list.title(near)).toBeVisible();

      // Cost lines: at least one
      await list.openSearch(`${testPrefix} T5b`);
      await list.openFilters();
      await list.costLinesInput('min').fill('1');
      await list.costLinesInput('min').press('Enter');
      await expect.poll(param('budgetLines')).toBe('min:1');
      await expect(list.titleLinks).toHaveCount(1);
      await expect(list.title(near)).toBeVisible();
    } finally {
      await runCleanup(cleanup);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T6 — group by Area / Company / Status
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Tasks list - Group by (AC6)', { tag: '@responsive' }, () => {
  test('T6: Area and Company put the "No area" / "No company" group last; Status follows the status order', async ({
    page,
    testPrefix,
  }) => {
    const cleanup = newCleanup();
    try {
      const areaId = await seedArea(page, cleanup, `${testPrefix} T6 Attic`);
      const vendorId = await createVendor(page, cleanup, `${testPrefix} T6 Co`);
      await seedTask(page, cleanup, {
        title: `${testPrefix} T6 placed`,
        status: 'in_progress',
        areaId,
        assignedVendorId: vendorId,
      });
      await seedTask(page, cleanup, { title: `${testPrefix} T6 bare`, status: 'not_started' });
      await seedTask(page, cleanup, { title: `${testPrefix} T6 done`, status: 'completed' });

      const list = new WorkItemsPage(page);
      await list.openSearch(`${testPrefix} T6`);

      await list.setGroupBy('area');
      await expect.poll(() => list.groupKeys()).toEqual([areaId, '__none__']);
      await expect(list.groupToggle(areaId)).toContainText(`${testPrefix} T6 Attic`);
      await expect(list.groupToggle('__none__')).toContainText('No area');

      await list.setGroupBy('company');
      await expect.poll(() => list.groupKeys()).toEqual([vendorId, '__none__']);
      await expect(list.groupToggle('__none__')).toContainText('No company');

      await list.setGroupBy('status');
      await expect
        .poll(() => list.groupKeys())
        .toEqual(['not_started', 'in_progress', 'completed']);
      await expect(list.groupToggle('completed')).toHaveAttribute('aria-expanded', 'false');
    } finally {
      await runCleanup(cleanup);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T7 — above 100 rows (mocked)
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Tasks list - more than 100 rows (AC7)', { tag: '@responsive' }, () => {
  test('T7: "(n of total)" shows, Time stays available and the other groupings say why not', async ({
    page,
  }) => {
    const total = 250;
    const row = (index: number) => ({
      id: `mock-task-${index}`,
      title: `Synthetic mock task ${String(index + 1).padStart(3, '0')}`,
      status: 'not_started',
      startDate: null,
      endDate: null,
      actualStartDate: null,
      actualEndDate: null,
      durationDays: null,
      assignedUser: null,
      assignedVendor: null,
      area: null,
      budgetLineCount: 0,
      projectedStartDate: null,
      projectedEndDate: null,
      isLate: false,
      lateDays: null,
      isHeldUp: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      grants: [],
      expectedCost: null,
      timeWindow: 'later',
      isCritical: false,
      waitsFor: null,
      holdsUp: null,
    });

    await page.route('**/api/work-items?*', async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue();
        return;
      }
      const url = new URL(route.request().url());
      const pageNumber = Number(url.searchParams.get('page') ?? '1');
      const pageSize = Number(url.searchParams.get('pageSize') ?? '100');
      const first = (pageNumber - 1) * pageSize;
      const items = Array.from({ length: Math.max(0, Math.min(pageSize, total - first)) }, (_, i) =>
        row(first + i),
      );
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items,
          pagination: {
            page: pageNumber,
            pageSize,
            totalItems: total,
            totalPages: Math.ceil(total / pageSize),
          },
          groupCounts: { late: 0, this_week: 0, next_two_weeks: 0, later: total, done: 0 },
          scopeTotal: total,
        }),
      });
    });

    const list = new WorkItemsPage(page);
    await list.goto();
    await list.waitForLoaded();

    // The group count counts every row; while rows are still to load it reads "(loaded of n)"
    expect(await list.groupCount('later')).toBe(total);
    await expect(list.groupToggle('later')).toContainText(`of ${total}`);

    // Time is always available; Area, Company and Status need every row
    const time = await list.groupOption('time');
    await expect(time).not.toHaveAttribute('aria-disabled', 'true');
    for (const other of ['area', 'company', 'status'] as const) {
      const option = page.getByTestId(`tasks-group-${other}`);
      await expect(option).toHaveAttribute('aria-disabled', 'true');
      await expect(option).toHaveAccessibleDescription(/Grouping needs all rows/);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T8 — Start / Mark done
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Tasks list - Start and Mark done (AC8)', { tag: '@responsive' }, () => {
  test('T8: Mark done moves the row to Done, focus goes to the next row of the former group and it is announced', async ({
    page,
    testPrefix,
  }) => {
    const cleanup = newCleanup();
    try {
      const titles = [1, 2, 3].map((n) => `${testPrefix} T8 progress ${n}`);
      const ids: string[] = [];
      for (const [index, title] of titles.entries()) {
        ids.push(
          await seedTask(page, cleanup, {
            title,
            status: 'in_progress',
            startDate: dayOffset(-3 + index),
          }),
        );
      }

      const list = new WorkItemsPage(page);
      const toast = new ToastRegion(page);
      await list.openSearch(`${testPrefix} T8 progress`);
      expect(await list.getWorkItemTitles()).toEqual(titles);

      await list.runCommand(ids[0]!);

      // The row left This week (Done is collapsed), the next row of the group holds focus
      await expect(list.title(ids[0]!)).toHaveCount(0);
      await expect(list.title(ids[1]!)).toBeFocused();
      await expect(list.groupToggle('done')).toContainText('(1)');
      await expect(list.groupToggle('this_week')).toContainText('(2)');
      await expect(toast.undoToast).toBeVisible();
      await expect(
        list.statusRegion.filter({ hasText: `${titles[0]} marked done.` }),
      ).not.toHaveCount(0);
    } finally {
      await runCleanup(cleanup);
    }
  });

  test('T8: Start moves a Next 2 weeks task into This week and focus goes to the next row there', async ({
    page,
    testPrefix,
  }) => {
    const cleanup = newCleanup();
    try {
      const first = `${testPrefix} T8 start 1`;
      const second = `${testPrefix} T8 start 2`;
      const firstId = await seedTask(page, cleanup, {
        title: first,
        status: 'not_started',
        startDate: dayOffset(10),
        durationDays: 2,
      });
      const secondId = await seedTask(page, cleanup, {
        title: second,
        status: 'not_started',
        startDate: dayOffset(11),
        durationDays: 2,
      });

      const list = new WorkItemsPage(page);
      await list.openSearch(`${testPrefix} T8 start`);
      await expect(list.groupToggle('next_two_weeks')).toContainText('(2)');

      await list.runCommand(firstId);

      await expect(list.groupToggle('this_week')).toContainText('(1)');
      await expect(list.groupToggle('next_two_weeks')).toContainText('(1)');
      await expect(list.statusBadge(firstId)).toHaveText('In progress');
      await expect(list.title(secondId)).toBeFocused();
      await expect(list.statusRegion.filter({ hasText: `${first} started.` })).not.toHaveCount(0);
    } finally {
      await runCleanup(cleanup);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T9 — bulk
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Tasks list - bulk edits (AC9)', { tag: '@responsive' }, () => {
  test('T9: Set status changes every selected task and clears the selection', async ({
    page,
    testPrefix,
  }) => {
    const cleanup = newCleanup();
    try {
      const ids: string[] = [];
      for (const n of [1, 2, 3]) {
        ids.push(
          await seedTask(page, cleanup, {
            title: `${testPrefix} T9 status ${n}`,
            status: 'not_started',
            startDate: dayOffset(10 + n),
            durationDays: 2,
          }),
        );
      }

      const list = new WorkItemsPage(page);
      await list.openSearch(`${testPrefix} T9 status`);
      await list.selectRows([ids[0]!, ids[1]!]);

      await list.bulkSetStatus('in_progress');

      await expect(list.statusBadge(ids[0]!)).toHaveText('In progress');
      await expect(list.statusBadge(ids[1]!)).toHaveText('In progress');
      await expect(list.statusBadge(ids[2]!)).toHaveText('Not started');
      await expect(list.selectionBar).toHaveCount(0);
      await expect(list.statusRegion.filter({ hasText: '2 of 2 updated.' })).not.toHaveCount(0);
    } finally {
      await runCleanup(cleanup);
    }
  });

  test('T9: Set area assigns the chosen area to every selected task', async ({
    page,
    testPrefix,
  }) => {
    const cleanup = newCleanup();
    try {
      const areaName = `${testPrefix} T9 Garage`;
      const areaId = await seedArea(page, cleanup, areaName);
      const first = await seedTask(page, cleanup, { title: `${testPrefix} T9 area 1` });
      const second = await seedTask(page, cleanup, { title: `${testPrefix} T9 area 2` });
      const untouched = await seedTask(page, cleanup, { title: `${testPrefix} T9 area 3` });

      const list = new WorkItemsPage(page);
      await list.openSearch(`${testPrefix} T9 area`);
      await list.selectRows([first, second]);

      await list.bulkSetArea(areaName);

      for (const id of [first, second]) {
        await expect
          .poll(async () => {
            const body = (await (await page.request.get(`${API.workItems}/${id}`)).json()) as {
              area: { id: string } | null;
            };
            return body.area?.id ?? null;
          })
          .toBe(areaId);
      }
      const other = (await (await page.request.get(`${API.workItems}/${untouched}`)).json()) as {
        area: { id: string } | null;
      };
      expect(other.area).toBeNull();
      await expect(list.selectionBar).toHaveCount(0);
    } finally {
      await runCleanup(cleanup);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T10 — delete
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Tasks list - delete (AC10)', { tag: '@responsive' }, () => {
  test('T10: ⋯ › Delete asks first; confirming removes the task from the list and the server', async ({
    page,
    testPrefix,
  }) => {
    const title = `${testPrefix} T10 delete me`;
    const id = await createWorkItemViaApi(page, { title });
    const list = new WorkItemsPage(page);
    await list.openSearch(title);

    await list.chooseRowMenu(id, 'delete');
    await expect(list.deleteModal).toBeVisible();
    await expect(list.deleteModal).toContainText(`Delete ${title}?`);

    await list.confirmDelete();

    await expect(list.title(id)).toHaveCount(0);
    expect((await page.request.get(`${API.workItems}/${id}`)).status()).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T11 — legacy column preference
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Tasks list - stored column preference (AC11)', { tag: '@responsive' }, () => {
  // Writes `table.workItems.columns` on the user's preferences: a dedicated user keeps every other
  // spec's Tasks columns untouched.
  test.use({ isolatedUserPerTest: { emailPrefix: 'tasks-columns' } });

  test('T11: a preference saved with the old column keys shows the mapped columns', async ({
    page,
    testPrefix,
  }) => {
    const title = `${testPrefix} T11 task`;
    const id = await createWorkItemViaApi(page, { title });
    try {
      // Old DataTable keys: only Title, Status and Start date were shown
      const saved = await page.request.patch('/api/users/me/preferences', {
        data: {
          key: 'table.workItems.columns',
          value: JSON.stringify({
            visible: ['title', 'status', 'startDate'],
            order: [
              'title',
              'status',
              'assignedTo',
              'vendor',
              'startDate',
              'endDate',
              'budgetLines',
            ],
          }),
        },
      });
      expect(saved.ok(), 'PATCH preference').toBeTruthy();

      const list = new WorkItemsPage(page);
      await list.openSearch(title);
      test.skip(!(await list.isTableSurface()), 'Columns show on the table surface only');

      await expect(list.columnHeader(/^Dates/)).toBeVisible();
      await expect(list.columnHeader(/^Who/)).toHaveCount(0);
      await expect(list.columnHeader(/^Expected cost/)).toHaveCount(0);

      // A plain array (the oldest format) maps the same way
      const array = await page.request.patch('/api/users/me/preferences', {
        data: {
          key: 'table.workItems.columns',
          value: JSON.stringify(['title', 'status', 'assignedTo']),
        },
      });
      expect(array.ok(), 'PATCH preference (array)').toBeTruthy();
      await page.reload();
      await list.waitForLoaded();
      await expect(list.columnHeader(/^Who/)).toBeVisible();
      await expect(list.columnHeader(/^Dates/)).toHaveCount(0);
    } finally {
      await page.request.delete('/api/users/me/preferences/table.workItems.columns');
      await deleteWorkItemViaApi(page, id);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// T12 — retired paging params
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Tasks list - paging retired (AC12)', { tag: '@responsive' }, () => {
  test('T12: ?page=2&pageSize=50&q=x drops the paging params with a replace, keeps the search, pushes nothing', async ({
    page,
  }) => {
    const list = new WorkItemsPage(page);
    await installRouteLog(page);
    await page.goto('/project/work-items?page=2&pageSize=50&q=x');
    await list.heading.waitFor({ state: 'visible' });
    await list.waitForLoaded();

    await expect
      .poll(() => {
        const params = new URL(page.url()).searchParams;
        return `${params.has('page')}|${params.has('pageSize')}|${params.get('q')}`;
      })
      .toBe('false|false|x');
    const log = await readRouteLog(page);
    expect(log.filter((entry) => entry.kind === 'pushState')).toEqual([]);
    expect(log.filter((entry) => entry.kind === 'replaceState').length).toBeGreaterThan(0);
    await expect(page.getByLabel('Previous', { exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Next', { exact: true })).toHaveCount(0);
  });
});
