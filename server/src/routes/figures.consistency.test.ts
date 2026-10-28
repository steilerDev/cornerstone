/**
 * Cross-surface consistency of "Holds up" (#2232, EPIC-21 principle 5: one answer per question).
 *
 * The attention rows (Home, the bell) and the Schedule / Calendar tooltips (GET /api/timeline)
 * must show the same `{ count, startingWithin14Days }` for the same task or milestone. Both call
 * `computeHoldsUp`; this test fails when either surface counts on its own again.
 *
 * `Date` is faked to 2026-03-10 09:00 UTC (timers stay real). One synthetic schedule: a late task
 * A, B and C behind it (FS chain), a completed successor E of A, a milestone M (past its target)
 * with contributor A and the required-by task D. All data is invented.
 *
 * Mutations these tests catch:
 *  - the timeline counting direct successors only (A would be 2, not 4);
 *  - the timeline counting a finished successor (E) or passing through it;
 *  - the timeline leaving milestone gates out (A would lose D, M would be 0);
 *  - a different `today` or projection in the two surfaces (startingWithin14Days drifts).
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import * as schema from '../db/schema.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import { computeScheduleProjection, resetRescheduleTracker } from '../services/schedulingEngine.js';
import type {
  AttentionResponse,
  TimelineResponse,
  WorkItemListRowsResponse,
  WorkItemPageDetail,
  HouseholdItemListRowsResponse,
  MilestoneListRowsResponse,
  BudgetBreakdownResponse,
} from '@cornerstone/shared';

const NOW = '2026-03-10T09:00:00.000Z';
const STAMP = '2026-03-01T00:00:00.000Z';
const ts = { createdAt: STAMP, updatedAt: STAMP };

const FAKE_DATE_ONLY = [
  'hrtime',
  'nextTick',
  'performance',
  'queueMicrotask',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'requestIdleCallback',
  'cancelIdleCallback',
  'setImmediate',
  'clearImmediate',
  'setInterval',
  'clearInterval',
  'setTimeout',
  'clearTimeout',
] as const;

describe('figures consistency: holds up on attention rows and on the timeline', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;
  let cookie: string;
  let milestoneId: number;

  beforeEach(async () => {
    originalEnv = { ...process.env };
    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-figures-'));
    process.env.DATABASE_URL = join(tempDir, 'test.db');
    process.env.SECURE_COOKIES = 'false';
    process.env.PHOTO_STORAGE_PATH = join(tempDir, 'photos');
    app = await buildApp();

    jest.useFakeTimers({ now: new Date(NOW), doNotFake: [...FAKE_DATE_ONLY] });
    resetRescheduleTracker();

    const member = await userService.createLocalUser(
      app.db,
      'member@example.test',
      'Member Person',
      'password',
      'member',
    );
    cookie = `cornerstone_session=${sessionService.createSession(app.db, member.id, 604800)}`;
    seed();
  });

  afterEach(async () => {
    jest.useRealTimers();
    if (app) await app.close();
    process.env = originalEnv;
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  function seed(): void {
    const items: Array<
      [string, string, 'in_progress' | 'not_started' | 'completed', string, string]
    > = [
      ['wi-a', 'Task A', 'in_progress', '2026-02-20', '2026-03-05'],
      ['wi-b', 'Task B', 'not_started', '2026-03-06', '2026-03-12'],
      ['wi-c', 'Task C', 'not_started', '2026-03-13', '2026-03-20'],
      ['wi-d', 'Task D', 'not_started', '2026-03-21', '2026-03-25'],
      ['wi-e', 'Task E', 'completed', '2026-03-06', '2026-03-08'],
      ['wi-far', 'Task Far', 'not_started', '2026-06-01', '2026-06-05'],
      // Four late starts on one planned date: Home folds them into one N2 group row (#2245)
      ['wi-g1', 'Group 1', 'not_started', '2026-03-05', '2026-03-07'],
      ['wi-g2', 'Group 2', 'not_started', '2026-03-05', '2026-03-07'],
      ['wi-g3', 'Group 3', 'not_started', '2026-03-05', '2026-03-07'],
      ['wi-g4', 'Group 4', 'not_started', '2026-03-05', '2026-03-07'],
    ];
    for (const [id, title, status, startDate, endDate] of items) {
      app.db
        .insert(schema.workItems)
        .values({ id, title, status, startDate, endDate, ...ts })
        .run();
    }
    // wi-far waits 60 days after A, so it starts outside the 14-day window
    for (const [predecessorId, successorId, leadLagDays] of [
      ['wi-a', 'wi-b', 0],
      ['wi-b', 'wi-c', 0],
      ['wi-a', 'wi-e', 0],
      ['wi-a', 'wi-far', 60],
    ] as const) {
      app.db
        .insert(schema.workItemDependencies)
        .values({ predecessorId, successorId, dependencyType: 'finish_to_start', leadLagDays })
        .run();
    }
    const milestone = app.db
      .insert(schema.milestones)
      .values({
        title: 'Roof closed',
        targetDate: '2026-03-01',
        isCompleted: false,
        completedAt: null,
        ...ts,
      })
      .returning({ id: schema.milestones.id })
      .get();
    milestoneId = milestone!.id;
    app.db.insert(schema.milestoneWorkItems).values({ milestoneId, workItemId: 'wi-a' }).run();
    app.db.insert(schema.workItemMilestoneDeps).values({ workItemId: 'wi-d', milestoneId }).run();
  }

  const getJson = async <T>(url: string): Promise<T> => {
    const res = await app.inject({ method: 'GET', url, headers: { cookie } });
    expect(res.statusCode).toBe(200);
    return res.json<T>();
  };

  it('the fixture produces a late-task row and a late-milestone row to compare', async () => {
    const attention = await getJson<AttentionResponse>('/api/attention');
    const keys = attention.rows.map((r) => r.key);
    expect(keys).toContain('N1:work_item:wi-a');
    expect(keys).toContain(`N3:milestone:${milestoneId}`);
  });

  it('every attention row with holds-up shows the timeline count for the same task or milestone', async () => {
    const attention = await getJson<AttentionResponse>('/api/attention');
    const timeline = await getJson<TimelineResponse>('/api/timeline');
    expect(timeline.holdsUp).toBeDefined();

    const compared: string[] = [];
    for (const row of [...attention.rows, ...attention.tidyUp]) {
      if (row.holdsUp === null) continue;
      const params = row.params as { kind?: string };
      if (params.kind === 'group') continue;
      const table =
        row.subject.type === 'work_item'
          ? timeline.holdsUp!.workItems
          : row.subject.type === 'milestone'
            ? timeline.holdsUp!.milestones
            : null;
      if (table === null) continue;
      expect({ key: row.key, holdsUp: table[row.subject.id] }).toEqual({
        key: row.key,
        holdsUp: row.holdsUp,
      });
      compared.push(row.key);
    }

    expect(compared).toContain('N1:work_item:wi-a');
    expect(compared).toContain(`N3:milestone:${milestoneId}`);
  });

  it('pins the shared numbers: A holds up B, C, D (through the gate) and Far (60 days later); E is finished and not counted', async () => {
    const timeline = await getJson<TimelineResponse>('/api/timeline');
    const wi = timeline.holdsUp!.workItems;
    expect(wi['wi-a']).toEqual({ count: 4, startingWithin14Days: 3 });
    expect(wi['wi-b']).toEqual({ count: 1, startingWithin14Days: 1 });
    expect(wi['wi-c']).toEqual({ count: 0, startingWithin14Days: 0 });
    expect(wi['wi-e']).toEqual({ count: 0, startingWithin14Days: 0 });
    expect(timeline.holdsUp!.milestones[String(milestoneId)]).toEqual({
      count: 1,
      startingWithin14Days: 1,
    });
  });

  it('has a timeline entry for every returned work item and milestone', async () => {
    const timeline = await getJson<TimelineResponse>('/api/timeline');
    expect(Object.keys(timeline.holdsUp!.workItems).sort()).toEqual(
      timeline.workItems.map((w) => w.id).sort(),
    );
    expect(Object.keys(timeline.holdsUp!.milestones).sort()).toEqual(
      timeline.milestones.map((m) => String(m.id)).sort(),
    );
  });

  describe('the Tasks list (#2245)', () => {
    const listRows = () =>
      getJson<WorkItemListRowsResponse>('/api/work-items?group=time&pageSize=100');

    it('a list row holdsUp equals the attention row holdsUp for the same task (null when none)', async () => {
      const attention = await getJson<AttentionResponse>('/api/attention');
      const list = await listRows();
      const byId = new Map(list.items.map((row) => [row.id, row]));
      const compared: string[] = [];
      for (const row of [...attention.rows, ...attention.tidyUp]) {
        if (row.subject.type !== 'work_item' || row.holdsUp === null) continue;
        const listed = byId.get(row.subject.id);
        expect({ key: row.key, holdsUp: listed?.holdsUp }).toEqual({
          key: row.key,
          holdsUp: row.holdsUp,
        });
        compared.push(row.key);
      }
      expect(compared).toContain('N1:work_item:wi-a');
      // The finished task and a task that holds nothing up show no holds-up figure
      expect(byId.get('wi-e')!.holdsUp).toBeNull();
      expect(byId.get('wi-c')!.holdsUp).toBeNull();
    });

    it('groupCounts.late equals the number of unfinished tasks the projection calls late', async () => {
      const list = await listRows();
      const projection = computeScheduleProjection(app.db);
      const statuses = new Map(list.items.map((row) => [row.id, row.status]));
      let late = 0;
      for (const [id, status] of statuses) {
        if (status !== 'completed' && projection.workItems.get(id)?.isLate === true) late += 1;
      }
      expect(late).toBeGreaterThan(0);
      expect(list.groupCounts!.late).toBe(late);
      expect(list.items.filter((row) => row.timeWindow === 'late')).toHaveLength(late);
    });

    it('every N1 and N2 subject, group members included, is in the late window', async () => {
      const attention = await getJson<AttentionResponse>('/api/attention');
      const list = await listRows();
      const windows = new Map(list.items.map((row) => [row.id, row.timeWindow]));
      const checked: string[] = [];
      expect(
        attention.rows.some(
          (r) => r.rule === 'N2' && (r.params as { kind?: string }).kind === 'group',
        ),
      ).toBe(true);
      for (const row of [...attention.rows, ...attention.tidyUp]) {
        if (row.rule !== 'N1' && row.rule !== 'N2') continue;
        const params = row.params as { kind?: string; items?: Array<{ id: string }> };
        const taskIds =
          params.kind === 'group' ? params.items!.map((item) => item.id) : [row.subject.id];
        for (const id of taskIds) {
          expect({ id, window: windows.get(id) }).toEqual({ id, window: 'late' });
          checked.push(id);
        }
      }
      expect(checked).toContain('wi-a');
      // the group row's members are checked one by one
      expect(checked).toEqual(expect.arrayContaining(['wi-g1', 'wi-g2', 'wi-g3', 'wi-g4']));
    });
  });

  describe('the task page detail (#2248)', () => {
    const detail = (id: string) => getJson<WorkItemPageDetail>(`/api/work-items/${id}`);

    it('detail holdsUp equals the list row and the timeline holdsUp for the same task', async () => {
      const list = await getJson<WorkItemListRowsResponse>(
        '/api/work-items?group=time&pageSize=100',
      );
      const timeline = await getJson<TimelineResponse>('/api/timeline');
      const compared: string[] = [];
      for (const row of list.items) {
        const page = await detail(row.id);
        expect({ id: row.id, holdsUp: page.holdsUp }).toEqual({ id: row.id, holdsUp: row.holdsUp });
        expect({ id: row.id, waitsFor: page.waitsFor }).toEqual({
          id: row.id,
          waitsFor: row.waitsFor,
        });
        const shown = timeline.holdsUp!.workItems[row.id];
        if (page.holdsUp !== null) {
          expect({ id: row.id, holdsUp: page.holdsUp }).toEqual({ id: row.id, holdsUp: shown });
          compared.push(row.id);
        } else {
          expect(shown?.count ?? 0).toBe(0);
        }
      }
      expect(compared).toContain('wi-a');
      expect((await detail('wi-a')).holdsUp).toEqual({ count: 4, startingWithin14Days: 3 });
    });

    it('detail expectedCost and grants equal the list row (null without cost lines)', async () => {
      app.db
        .insert(schema.workItemBudgets)
        .values({
          id: 'wl-1',
          workItemId: 'wi-b',
          plannedAmount: 1200,
          confidence: 'own_estimate',
          includesVat: true,
          ...ts,
        })
        .run();
      app.db
        .insert(schema.subsidyPrograms)
        .values({
          id: 'sp-1',
          name: 'Grant One',
          reductionType: 'percentage',
          reductionValue: 10,
          applicationStatus: 'approved',
          ...ts,
        })
        .run();
      app.db
        .insert(schema.workItemSubsidies)
        .values({ workItemId: 'wi-b', subsidyProgramId: 'sp-1' })
        .run();
      const list = await getJson<WorkItemListRowsResponse>('/api/work-items?pageSize=100');
      const row = list.items.find((r) => r.id === 'wi-b')!;
      const page = await detail('wi-b');
      expect(row.expectedCost).toBeGreaterThan(0);
      expect(page.expectedCost).toBe(row.expectedCost);
      expect(page.grants).toEqual(row.grants);
      expect(page.grants.map((g) => g.name)).toEqual(['Grant One']);
      expect((await detail('wi-a')).expectedCost).toBeNull();
    });
  });

  describe('the Purchases list (#2246)', () => {
    beforeEach(() => {
      const hi = (id: string, name: string) =>
        app.db
          .insert(schema.householdItems)
          .values({ id, name, categoryId: 'hic-furniture', ...ts })
          .run();
      hi('hi-1', 'Sofa');
      hi('hi-2', 'Oven');
      hi('hi-3', 'Lamp without cost lines');
      app.db
        .insert(schema.vendors)
        .values({ id: 'ven-1', name: 'Company One', ...ts })
        .run();
      const line = (id: string, householdItemId: string, plannedAmount: number, c: string) =>
        app.db
          .insert(schema.householdItemBudgets)
          .values({
            id,
            householdItemId,
            plannedAmount,
            confidence: c as 'own_estimate',
            includesVat: true,
            ...ts,
          })
          .run();
      line('hl-1', 'hi-1', 300, 'own_estimate');
      line('hl-2', 'hi-2', 200, 'invoice');
      app.db
        .insert(schema.invoices)
        .values({
          id: 'inv-1',
          vendorId: 'ven-1',
          amount: 100,
          status: 'paid',
          date: '2026-02-01',
          ...ts,
        })
        .run();
      app.db
        .insert(schema.invoiceBudgetLines)
        .values({
          id: 'ibl-1',
          invoiceId: 'inv-1',
          householdItemBudgetId: 'hl-2',
          itemizedAmount: 100,
          ...ts,
        })
        .run();
    });

    const listRows = () =>
      getJson<HouseholdItemListRowsResponse>('/api/household-items?pageSize=100');

    it('lists a purchase without cost lines (expected cost not set) instead of failing', async () => {
      const list = await listRows();
      const row = list.items.find((i) => i.id === 'hi-3')!;

      expect(list.items).toHaveLength(3);
      expect(row.expectedCost).toBeNull();
      expect(row.paid).toBe(0);
    });

    it('the unfiltered footer Expected cost equals the engine household_items expected cost', async () => {
      const list = await listRows();
      const { breakdown } = await getJson<BudgetBreakdownResponse>('/api/budget/breakdown');

      expect(list.totals.expectedCost).toBeGreaterThan(0);
      expect(list.totals.expectedCost).toBe(breakdown.byType.household_items.expectedCost.expected);
    });

    it('the unfiltered footer Paid equals the sum of Paid over Money > Overview purchase rows', async () => {
      const list = await listRows();
      const { breakdown } = await getJson<BudgetBreakdownResponse>('/api/budget/breakdown');
      const purchaseRows = breakdown.items.filter((i) => i.kind === 'household_item');
      const paidByRow = new Map(purchaseRows.map((i) => [i.id, i.figures.paid]));

      expect(list.totals.paid).toBe(100);
      expect(list.totals.paid).toBe(purchaseRows.reduce((sum, i) => sum + i.figures.paid, 0));
      for (const row of list.items) expect(row.paid).toBe(paidByRow.get(row.id) ?? 0);
    });

    it('each footer value is the sum of the rows, also when filtered', async () => {
      for (const url of [
        '/api/household-items?pageSize=100',
        '/api/household-items?pageSize=100&expectedCostMin=250',
      ]) {
        const list = await getJson<HouseholdItemListRowsResponse>(url);
        const sum = (pick: (r: (typeof list.items)[number]) => number) =>
          list.items.reduce((total, r) => total + pick(r), 0);

        expect(list.totals).toEqual({
          expectedCost: sum((r) => r.expectedCost ?? 0),
          invoiced: sum((r) => r.budgetSummary.totalActual),
          paid: sum((r) => r.paid),
        });
      }
    });
  });

  describe('the Milestones list (#2246)', () => {
    it('a list row holdsUp equals the timeline holdsUp (null when nothing waits), projectedDate the projection', async () => {
      const { milestones } = await getJson<MilestoneListRowsResponse>('/api/milestones');
      const timeline = await getJson<TimelineResponse>('/api/timeline');
      const projection = computeScheduleProjection(app.db);
      const row = milestones.find((m) => m.id === milestoneId)!;

      expect(row.holdsUp).toEqual(timeline.holdsUp!.milestones[String(milestoneId)]);
      expect(row.holdsUp).toEqual({ count: 1, startingWithin14Days: 1 });
      expect(row.projectedDate).toBe(projection.milestones.get(milestoneId)!.projectedDate);
    });
  });
});
