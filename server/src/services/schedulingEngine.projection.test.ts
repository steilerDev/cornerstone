/**
 * Unit tests for the read-time schedule projection (contract 4, #2199 "Scheduler truth"):
 * schedule({ applyTodayFloor }), loadScheduleGraph, projectSchedule, computeScheduleProjection,
 * workItemProjectionOf, plus what autoReschedule persists (planned dates only) and how it
 * reports delayed milestones. `today` is always injected; the wall clock is never used.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import {
  schedule,
  loadScheduleGraph,
  projectSchedule,
  computeScheduleProjection,
  workItemProjectionOf,
  shownWorkItemDates,
  autoReschedule,
} from './schedulingEngine.js';
import type {
  SchedulingWorkItem,
  SchedulingDependency,
  ScheduleGraph,
  ScheduleProjection,
} from './schedulingEngine.js';

const TODAY = '2026-03-10';

// ─── Pure graph helpers ───────────────────────────────────────────────────────

function wi(id: string, overrides: Partial<SchedulingWorkItem> = {}): SchedulingWorkItem {
  return {
    id,
    status: 'not_started',
    startDate: null,
    endDate: null,
    actualStartDate: null,
    actualEndDate: null,
    durationDays: null,
    startAfter: null,
    startBefore: null,
    ...overrides,
  };
}

function fs(predecessorId: string, successorId: string): SchedulingDependency {
  return { predecessorId, successorId, dependencyType: 'finish_to_start', leadLagDays: 0 };
}

function graphOf(
  workItems: SchedulingWorkItem[],
  dependencies: SchedulingDependency[] = [],
): ScheduleGraph {
  return { workItems, dependencies, milestones: [], milestoneContributors: new Map() };
}

function fieldsOf(projection: ScheduleProjection, id: string) {
  const fields = projection.workItems.get(id);
  expect(fields).toBeDefined();
  return fields!;
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

type Db = BetterSQLite3Database<typeof schema>;

function createTestDb() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  runMigrations(sqlite);
  return { sqlite, db: drizzle(sqlite, { schema }) };
}

const STAMP = '2026-03-01T00:00:00.000Z';

function insertItem(db: Db, id: string, o: Partial<typeof schema.workItems.$inferInsert> = {}) {
  db.insert(schema.workItems)
    .values({
      id,
      title: `Item ${id}`,
      status: 'not_started',
      startDate: null,
      endDate: null,
      durationDays: null,
      createdBy: null,
      createdAt: STAMP,
      updatedAt: STAMP,
      ...o,
    })
    .run();
}

function insertDep(db: Db, predecessorId: string, successorId: string) {
  db.insert(schema.workItemDependencies)
    .values({ predecessorId, successorId, dependencyType: 'finish_to_start', leadLagDays: 0 })
    .run();
}

function insertMilestone(
  db: Db,
  id: number,
  targetDate: string,
  o: Partial<typeof schema.milestones.$inferInsert> = {},
) {
  db.insert(schema.milestones)
    .values({
      id,
      title: `Milestone ${id}`,
      targetDate,
      isCompleted: false,
      completedAt: null,
      color: null,
      createdBy: null,
      createdAt: STAMP,
      updatedAt: STAMP,
      ...o,
    })
    .run();
}

function link(db: Db, milestoneId: number, workItemId: string) {
  db.insert(schema.milestoneWorkItems).values({ milestoneId, workItemId }).run();
}

function stored(db: Db, id: string) {
  const row = db
    .select({ startDate: schema.workItems.startDate, endDate: schema.workItems.endDate })
    .from(schema.workItems)
    .where(eq(schema.workItems.id, id))
    .get();
  expect(row).toBeDefined();
  return row!;
}

// ─── schedule({ applyTodayFloor }) ────────────────────────────────────────────

describe('schedule() applyTodayFloor', () => {
  function only(items: SchedulingWorkItem[], applyTodayFloor?: boolean) {
    const result = schedule({
      mode: 'full',
      workItems: items,
      dependencies: [],
      today: TODAY,
      ...(applyTodayFloor === undefined ? {} : { applyTodayFloor }),
    });
    const item = result.scheduledItems[0];
    expect(item).toBeDefined();
    return item!;
  }

  const notStarted = wi('a', { startDate: '2026-03-05', durationDays: 3 });

  it('keeps the planned start of a not-started root when the floor is off', () => {
    const item = only([notStarted], false);
    expect(item.scheduledStartDate).toBe('2026-03-05');
    expect(item.scheduledEndDate).toBe('2026-03-08');
    expect(item.isLate).toBe(false);
  });

  it('floors the start to today and flags isLate by default', () => {
    const item = only([notStarted]);
    expect(item.scheduledStartDate).toBe('2026-03-10');
    expect(item.scheduledEndDate).toBe('2026-03-13');
    expect(item.isLate).toBe(true);
  });

  it('behaves like applyTodayFloor true when the flag is explicitly true', () => {
    expect(only([notStarted], true)).toEqual(only([notStarted]));
  });

  const inProgress = wi('b', {
    status: 'in_progress',
    startDate: '2026-03-01',
    actualStartDate: '2026-03-01',
    durationDays: 3,
  });

  it('keeps the planned end of an in-progress item (Rule 3 inside Rule 1) when the floor is off', () => {
    const item = only([inProgress], false);
    expect(item.scheduledStartDate).toBe('2026-03-01');
    expect(item.scheduledEndDate).toBe('2026-03-04');
    expect(item.isLate).toBe(false);
  });

  it('extends the end of an in-progress item to today with the floor on', () => {
    const item = only([inProgress], true);
    expect(item.scheduledStartDate).toBe('2026-03-01');
    expect(item.scheduledEndDate).toBe(TODAY);
    expect(item.isLate).toBe(true);
  });

  it('never clamps an in-progress item that has an actual end date', () => {
    const closed = wi('c', { ...inProgress, actualEndDate: '2026-03-03' });
    expect(only([closed], true).scheduledEndDate).toBe('2026-03-03');
    expect(only([closed], true).isLate).toBe(false);
  });
});

// ─── projectSchedule ──────────────────────────────────────────────────────────

describe('projectSchedule — work items', () => {
  it('marks a late predecessor Late and its successor Held up with forecast dates (scenario 2)', () => {
    const graph = graphOf(
      [
        wi('A', { startDate: '2026-03-05', endDate: '2026-03-08', durationDays: 3 }),
        wi('B', { startDate: '2026-03-08', endDate: '2026-03-12', durationDays: 4 }),
      ],
      [fs('A', 'B')],
    );
    const projection = projectSchedule(graph, TODAY);

    const a = fieldsOf(projection, 'A');
    expect(a.isLate).toBe(true);
    expect(a.lateDays).toBe(5);
    expect(a.isHeldUp).toBe(false);
    expect(a.projectedStartDate).toBe('2026-03-10');
    expect(a.projectedEndDate).toBe('2026-03-13');

    const b = fieldsOf(projection, 'B');
    expect(b.isHeldUp).toBe(true);
    expect(b.isLate).toBe(false);
    expect(b.lateDays).toBeNull();
    expect(b.projectedStartDate).toBe('2026-03-13');
    expect(b.projectedEndDate).toBe('2026-03-17');
  });

  it('projects an on-time item to its stored dates with all flags false (scenario 3)', () => {
    const graph = graphOf([
      wi('A', { startDate: '2026-03-20', endDate: '2026-03-23', durationDays: 3 }),
    ]);
    const a = fieldsOf(projectSchedule(graph, TODAY), 'A');
    expect(a).toEqual({
      projectedStartDate: '2026-03-20',
      projectedEndDate: '2026-03-23',
      isLate: false,
      lateDays: null,
      isHeldUp: false,
    });
  });

  it('counts lateDays from the planned end for an in-progress item (scenario 4)', () => {
    const graph = graphOf([
      wi('A', {
        status: 'in_progress',
        startDate: '2026-03-01',
        endDate: '2026-03-04',
        actualStartDate: '2026-03-01',
        durationDays: 3,
      }),
    ]);
    const a = fieldsOf(projectSchedule(graph, TODAY), 'A');
    expect(a.isLate).toBe(true);
    expect(a.lateDays).toBe(6);
    expect(a.projectedStartDate).toBe('2026-03-01');
    expect(a.projectedEndDate).toBe(TODAY);
    expect(a.isHeldUp).toBe(false);
  });

  it('keeps a completed item with past dates exactly as stored (scenario 5)', () => {
    const graph = graphOf([
      wi('A', {
        status: 'completed',
        startDate: '2026-02-01',
        endDate: '2026-02-05',
        actualStartDate: '2026-02-01',
        actualEndDate: '2026-02-05',
        durationDays: 4,
      }),
    ]);
    const a = fieldsOf(projectSchedule(graph, TODAY), 'A');
    expect(a).toEqual({
      projectedStartDate: '2026-02-01',
      projectedEndDate: '2026-02-05',
      isLate: false,
      lateDays: null,
      isHeldUp: false,
    });
  });

  it('falls back to the stored dates when stale stored dates differ from the plan and nothing moved (scenario 6)', () => {
    // duration 3 plans 03-20 -> 03-23, but the stored end is stale at 03-25
    const graph = graphOf([
      wi('A', { startDate: '2026-03-20', endDate: '2026-03-25', durationDays: 3 }),
    ]);
    const a = fieldsOf(projectSchedule(graph, TODAY), 'A');
    expect(a.projectedStartDate).toBe('2026-03-20');
    expect(a.projectedEndDate).toBe('2026-03-25');
    expect(a.isLate).toBe(false);
    expect(a.isHeldUp).toBe(false);
  });

  it('returns stored fallbacks, no flags and an empty critical path on a cycle (scenario 7)', () => {
    const graph = graphOf(
      [
        wi('A', { startDate: '2026-03-05', endDate: '2026-03-08', durationDays: 3 }),
        wi('B', { startDate: '2026-03-08', endDate: '2026-03-12', durationDays: 4 }),
      ],
      [fs('A', 'B'), fs('B', 'A')],
    );
    const projection = projectSchedule(graph, TODAY);
    expect(projection.hasCycle).toBe(true);
    expect(projection.criticalPath).toEqual([]);
    expect(projection.criticalMilestoneIds.size).toBe(0);
    expect(fieldsOf(projection, 'A')).toEqual({
      projectedStartDate: '2026-03-05',
      projectedEndDate: '2026-03-08',
      isLate: false,
      lateDays: null,
      isHeldUp: false,
    });
    expect(fieldsOf(projection, 'B').projectedStartDate).toBe('2026-03-08');
  });

  it('keeps lateDays >= 1 whenever isLate across the late scenarios (scenario 9)', () => {
    const graphs = [
      graphOf([wi('A', { startDate: '2026-03-09', durationDays: 3 })]),
      graphOf([wi('A', { startDate: '2026-03-05', durationDays: 3 })]),
      graphOf([
        wi('A', {
          status: 'in_progress',
          startDate: '2026-03-01',
          actualStartDate: '2026-03-01',
          durationDays: 5,
        }),
      ]),
    ];
    for (const graph of graphs) {
      const a = fieldsOf(projectSchedule(graph, TODAY), 'A');
      expect(a.isLate).toBe(true);
      expect(a.lateDays).not.toBeNull();
      expect(a.lateDays!).toBeGreaterThanOrEqual(1);
    }
  });

  it('floors lateDays at 1 for an in-progress item whose planned end is exactly one day behind', () => {
    const graph = graphOf([
      wi('A', {
        status: 'in_progress',
        startDate: '2026-03-06',
        actualStartDate: '2026-03-06',
        durationDays: 3,
      }),
    ]);
    const a = fieldsOf(projectSchedule(graph, TODAY), 'A');
    expect(a.isLate).toBe(true);
    expect(a.lateDays).toBe(1);
  });

  it('does not treat a task that merely starts today as late', () => {
    const graph = graphOf([wi('A', { startDate: TODAY, durationDays: 2 })]);
    const a = fieldsOf(projectSchedule(graph, TODAY), 'A');
    expect(a.isLate).toBe(false);
    expect(a.lateDays).toBeNull();
    expect(a.projectedStartDate).toBe(TODAY);
  });

  it('keeps the critical path free of milestone nodes', () => {
    const projection = projectSchedule(
      graphOf([wi('A', { startDate: '2026-03-20', durationDays: 3 })]),
      TODAY,
    );
    expect(projection.criticalPath).toEqual(['A']);
  });
});

describe('projectSchedule — undated tasks (contract 4 point 4)', () => {
  it('gives an undated root forecast dates from today and never flags it (A1 projection)', () => {
    const graph = graphOf([wi('U', { durationDays: 2 })]);
    const u = fieldsOf(projectSchedule(graph, '2026-03-11'), 'U');
    expect(u).toEqual({
      projectedStartDate: '2026-03-11',
      projectedEndDate: '2026-03-13',
      isLate: false,
      lateDays: null,
      isHeldUp: false,
    });
  });

  it('uses the forecast for an undated root even when the user entered only an end date', () => {
    const graph = graphOf([wi('U', { endDate: '2026-03-20' })]);
    const u = fieldsOf(projectSchedule(graph, TODAY), 'U');
    expect(u.projectedStartDate).toBe(TODAY);
    expect(u.isLate).toBe(false);
    expect(u.isHeldUp).toBe(false);
  });

  it('uses the forecast dates for a successor with a NULL stored start (before its first reschedule)', () => {
    const graph = graphOf(
      [wi('U', { durationDays: 2 }), wi('S', { durationDays: 3 })],
      [fs('U', 'S')],
    );
    const s = fieldsOf(projectSchedule(graph, TODAY), 'S');
    expect(s.projectedStartDate).toBe('2026-03-12');
    expect(s.projectedEndDate).toBe('2026-03-15');
    expect(s.isLate).toBe(false);
  });

  it('does not make a successor of an undated task Late or Held up once persisted (A3)', () => {
    // Stored planned start of S is U's planned end (today + 2) from the last reschedule.
    const graph = graphOf(
      [
        wi('U', { durationDays: 2 }),
        wi('S', { startDate: '2026-03-12', endDate: '2026-03-15', durationDays: 3 }),
      ],
      [fs('U', 'S')],
    );
    const s = fieldsOf(projectSchedule(graph, TODAY), 'S');
    expect(s.isLate).toBe(false);
    expect(s.isHeldUp).toBe(false);
    expect(s.projectedStartDate).toBe('2026-03-12');
  });

  it('still reports a dated, not-started root with a past start as Late (A6)', () => {
    const graph = graphOf([wi('A', { startDate: '2026-03-08', durationDays: 2 })]);
    const a = fieldsOf(projectSchedule(graph, TODAY), 'A');
    expect(a.isLate).toBe(true);
    expect(a.lateDays).toBe(2);
    expect(a.projectedStartDate).toBe(TODAY);
  });
});

// ─── workItemProjectionOf ─────────────────────────────────────────────────────

describe('workItemProjectionOf', () => {
  it('returns the projection entry when the id is known', () => {
    const projection = projectSchedule(
      graphOf([wi('A', { startDate: '2026-03-05', durationDays: 3 })]),
      TODAY,
    );
    const fields = workItemProjectionOf(projection, {
      id: 'A',
      startDate: '2026-03-05',
      endDate: '2026-03-08',
    });
    expect(fields.isLate).toBe(true);
    expect(fields.projectedStartDate).toBe(TODAY);
  });

  it('falls back to the stored dates and all-false flags for an unknown id (scenario 10)', () => {
    const projection = projectSchedule(graphOf([]), TODAY);
    expect(
      workItemProjectionOf(projection, {
        id: 'ghost',
        startDate: '2026-03-01',
        endDate: '2026-03-02',
      }),
    ).toEqual({
      projectedStartDate: '2026-03-01',
      projectedEndDate: '2026-03-02',
      isLate: false,
      lateDays: null,
      isHeldUp: false,
    });
  });
});

// ─── shownWorkItemDates ───────────────────────────────────────────────────────

describe('shownWorkItemDates', () => {
  const fields = { projectedStartDate: '2026-03-10', projectedEndDate: '2026-03-13' };

  it('falls back to the forecast when there are no actual dates', () => {
    expect(shownWorkItemDates({ actualStartDate: null, actualEndDate: null }, fields)).toEqual({
      start: '2026-03-10',
      end: '2026-03-13',
    });
  });

  it('lets actual dates win', () => {
    expect(
      shownWorkItemDates({ actualStartDate: '2026-03-01', actualEndDate: '2026-03-04' }, fields),
    ).toEqual({ start: '2026-03-01', end: '2026-03-04' });
  });

  it('mixes an actual start with a forecast end', () => {
    expect(
      shownWorkItemDates({ actualStartDate: '2026-03-01', actualEndDate: null }, fields),
    ).toEqual({
      start: '2026-03-01',
      end: '2026-03-13',
    });
  });

  it('returns nulls when nothing is known', () => {
    expect(
      shownWorkItemDates(
        { actualStartDate: null, actualEndDate: null },
        { projectedStartDate: null, projectedEndDate: null },
      ),
    ).toEqual({ start: null, end: null });
  });
});

// ─── DB-backed: milestones, graph loading, persistence ────────────────────────

describe('schedule projection with a database', () => {
  let sqlite: Database.Database;
  let db: Db;

  beforeEach(() => {
    const t = createTestDb();
    sqlite = t.sqlite;
    db = t.db;
  });

  afterEach(() => {
    sqlite.close();
    jest.restoreAllMocks();
  });

  describe('loadScheduleGraph', () => {
    it('returns an empty graph for an empty database', () => {
      const graph = loadScheduleGraph(db);
      expect(graph.workItems).toEqual([]);
      expect(graph.dependencies).toEqual([]);
      expect(graph.milestones).toEqual([]);
      expect(graph.milestoneContributors.size).toBe(0);
    });

    it('adds a virtual milestone node and synthetic FS edges for contributors and dependents', () => {
      insertItem(db, 'c1', { startDate: '2026-03-20', durationDays: 2 });
      insertItem(db, 'd1', { startDate: '2026-03-25', durationDays: 2 });
      insertMilestone(db, 1, '2026-03-30');
      link(db, 1, 'c1');
      db.insert(schema.workItemMilestoneDeps).values({ workItemId: 'd1', milestoneId: 1 }).run();

      const graph = loadScheduleGraph(db);
      expect(graph.workItems.map((w) => w.id)).toEqual(['c1', 'd1', 'milestone:1']);
      expect(graph.dependencies).toEqual(
        expect.arrayContaining([fs('c1', 'milestone:1'), fs('milestone:1', 'd1')]),
      );
      expect(graph.milestoneContributors.get(1)).toEqual(['c1']);
    });

    it('anchors a completed milestone node to its completion date', () => {
      insertMilestone(db, 2, '2026-03-30', {
        isCompleted: true,
        completedAt: '2026-03-04T10:00:00.000Z',
      });
      insertItem(db, 'c1', { startDate: '2026-03-01', durationDays: 1 });
      link(db, 2, 'c1');
      const node = loadScheduleGraph(db).workItems.find((w) => w.id === 'milestone:2');
      expect(node).toBeDefined();
      expect(node!.status).toBe('completed');
      expect(node!.actualStartDate).toBe('2026-03-04');
      expect(node!.actualEndDate).toBe('2026-03-04');
    });

    it('skips milestone links whose milestone row is missing from the node set', () => {
      insertItem(db, 'c1', { startDate: '2026-03-01', durationDays: 1 });
      // A milestone with no links gets no virtual node.
      insertMilestone(db, 3, '2026-03-30');
      expect(loadScheduleGraph(db).workItems.map((w) => w.id)).toEqual(['c1']);
    });
  });

  describe('milestone projection (scenario 8)', () => {
    it('marks a milestone late when the contributor forecast ends after the target', () => {
      insertItem(db, 'c1', { startDate: '2026-03-05', endDate: '2026-03-08', durationDays: 3 });
      insertMilestone(db, 1, '2026-03-12');
      link(db, 1, 'c1');
      const m = computeScheduleProjection(db, TODAY).milestones.get(1);
      expect(m).toEqual({
        projectedDate: '2026-03-13',
        isLate: true,
        lateDays: 1,
        isEarly: false,
        earlyDays: null,
      });
    });

    it('uses the contributor forecast end, not its stored end, for an in-progress late contributor', () => {
      insertItem(db, 'c1', {
        status: 'in_progress',
        startDate: '2026-03-01',
        endDate: '2026-03-04',
        actualStartDate: '2026-03-01',
        durationDays: 3,
      });
      insertMilestone(db, 1, '2026-03-08');
      link(db, 1, 'c1');
      const m = computeScheduleProjection(db, TODAY).milestones.get(1);
      expect(m?.projectedDate).toBe(TODAY);
      expect(m?.isLate).toBe(true);
      expect(m?.lateDays).toBe(2);
    });

    it('marks a milestone early when the contributor forecast ends before the target', () => {
      insertItem(db, 'c1', { startDate: '2026-03-20', endDate: '2026-03-22', durationDays: 2 });
      insertMilestone(db, 1, '2026-03-30');
      link(db, 1, 'c1');
      const m = computeScheduleProjection(db, TODAY).milestones.get(1);
      expect(m).toEqual({
        projectedDate: '2026-03-22',
        isLate: false,
        lateDays: null,
        isEarly: true,
        earlyDays: 8,
      });
    });

    it('is neither late nor early when the forecast equals the target', () => {
      insertItem(db, 'c1', { startDate: '2026-03-20', endDate: '2026-03-22', durationDays: 2 });
      insertMilestone(db, 1, '2026-03-22');
      link(db, 1, 'c1');
      const m = computeScheduleProjection(db, TODAY).milestones.get(1);
      expect(m?.isLate).toBe(false);
      expect(m?.isEarly).toBe(false);
      expect(m?.lateDays).toBeNull();
      expect(m?.earlyDays).toBeNull();
    });

    it('reports a completed milestone with all flags false even if contributors forecast after target', () => {
      insertItem(db, 'c1', { startDate: '2026-03-05', endDate: '2026-03-08', durationDays: 3 });
      insertMilestone(db, 1, '2026-03-06', {
        isCompleted: true,
        completedAt: '2026-03-07T09:00:00.000Z',
      });
      link(db, 1, 'c1');
      const m = computeScheduleProjection(db, TODAY).milestones.get(1);
      expect(m?.isLate).toBe(false);
      expect(m?.isEarly).toBe(false);
      expect(m?.lateDays).toBeNull();
      expect(m?.earlyDays).toBeNull();
    });

    it('has a null projectedDate and no flags when no work item contributes', () => {
      insertMilestone(db, 1, '2026-03-12');
      expect(computeScheduleProjection(db, TODAY).milestones.get(1)).toEqual({
        projectedDate: null,
        isLate: false,
        lateDays: null,
        isEarly: false,
        earlyDays: null,
      });
    });

    it('has a null projectedDate when every contributor has neither projected nor stored end', () => {
      // completed contributor without dates falls back to stored (null) values
      insertItem(db, 'c1', { status: 'completed' });
      insertMilestone(db, 1, '2026-03-12');
      link(db, 1, 'c1');
      expect(computeScheduleProjection(db, TODAY).milestones.get(1)?.projectedDate).toBeNull();
    });

    it('takes the latest end among several contributors', () => {
      insertItem(db, 'c1', { startDate: '2026-03-20', endDate: '2026-03-22', durationDays: 2 });
      insertItem(db, 'c2', { startDate: '2026-03-21', endDate: '2026-03-27', durationDays: 6 });
      insertMilestone(db, 1, '2026-03-25');
      link(db, 1, 'c1');
      link(db, 1, 'c2');
      const m = computeScheduleProjection(db, TODAY).milestones.get(1);
      expect(m?.projectedDate).toBe('2026-03-27');
      expect(m?.lateDays).toBe(2);
    });

    it('marks milestones on the forecast critical path', () => {
      insertItem(db, 'c1', { startDate: '2026-03-20', endDate: '2026-03-22', durationDays: 2 });
      insertMilestone(db, 7, '2026-03-30');
      link(db, 7, 'c1');
      const projection = computeScheduleProjection(db, TODAY);
      expect(projection.criticalMilestoneIds.has(7)).toBe(true);
      expect(projection.criticalPath).toEqual(['c1']);
    });
  });

  describe('computeScheduleProjection default today', () => {
    it('uses the current UTC date when none is passed', () => {
      jest.useFakeTimers({ now: new Date('2026-03-10T23:30:00Z') });
      try {
        insertItem(db, 'a', { startDate: '2026-03-05', durationDays: 3 });
        const fields = computeScheduleProjection(db).workItems.get('a');
        expect(fields?.projectedStartDate).toBe('2026-03-10');
      } finally {
        jest.useRealTimers();
      }
    });
  });

  // ─── autoReschedule persistence (D-15) ──────────────────────────────────────

  describe('autoReschedule persistence (scenario 11)', () => {
    it('leaves the stored start of a late root unchanged and persists the successor at the planned date', () => {
      insertItem(db, 'A', { startDate: '2026-03-05', endDate: '2026-03-08', durationDays: 3 });
      insertItem(db, 'B', { durationDays: 4 });
      insertDep(db, 'A', 'B');

      autoReschedule(db, { today: TODAY });

      expect(stored(db, 'A')).toEqual({ startDate: '2026-03-05', endDate: '2026-03-08' });
      // Planned (from A's planned end 03-08), NOT from today's forecast (03-13).
      expect(stored(db, 'B')).toEqual({ startDate: '2026-03-08', endDate: '2026-03-12' });

      const projection = computeScheduleProjection(db, TODAY);
      expect(fieldsOf(projection, 'A').isLate).toBe(true);
      expect(fieldsOf(projection, 'B').isHeldUp).toBe(true);
    });

    it('repairs a stale planned end but not the start, and counts only written rows', () => {
      insertItem(db, 'A', { startDate: '2026-03-05', endDate: '2026-03-06', durationDays: 3 });
      const count = autoReschedule(db, { today: TODAY });
      expect(count).toBe(1);
      expect(stored(db, 'A')).toEqual({ startDate: '2026-03-05', endDate: '2026-03-08' });
      expect(autoReschedule(db, { today: TODAY })).toBe(0);
    });

    it('invokes onRescheduleCompleted with the written count', () => {
      insertItem(db, 'A', { startDate: '2026-03-05', endDate: '2026-03-06', durationDays: 3 });
      const done = jest.fn();
      autoReschedule(db, { today: TODAY, onRescheduleCompleted: done });
      expect(done).toHaveBeenCalledWith(1);
    });

    it('skips rescheduling silently on a dependency cycle', () => {
      insertItem(db, 'A', { startDate: '2026-03-05', endDate: '2026-03-06', durationDays: 3 });
      insertItem(db, 'B', { startDate: '2026-03-06', endDate: '2026-03-07', durationDays: 1 });
      insertDep(db, 'A', 'B');
      insertDep(db, 'B', 'A');
      expect(autoReschedule(db, { today: TODAY })).toBe(0);
      expect(stored(db, 'A').endDate).toBe('2026-03-06');
    });

    it('pins household-item delivery dates: a pred forecast in the future is not "late"', () => {
      insertItem(db, 'A', { startDate: '2026-03-01', endDate: '2026-03-03', durationDays: 2 });
      db.insert(schema.householdItems)
        .values({
          id: 'hi-1',
          name: 'Sofa',
          categoryId: 'hic-furniture',
          status: 'planned',
          quantity: 1,
          createdAt: STAMP,
          updatedAt: STAMP,
        })
        .run();
      db.insert(schema.householdItemDeps)
        .values({ householdItemId: 'hi-1', predecessorType: 'work_item', predecessorId: 'A' })
        .run();

      autoReschedule(db, { today: TODAY });

      // A is late (forecast 03-10 -> 03-12); the HI follows the FORECAST end, as the old
      // floored logic did, while A's stored start stays 03-01.
      const hi = db
        .select()
        .from(schema.householdItems)
        .where(eq(schema.householdItems.id, 'hi-1'))
        .get();
      expect(hi?.targetDeliveryDate).toBe('2026-03-12');
      expect(hi?.isLate).toBe(false);
      expect(stored(db, 'A').startDate).toBe('2026-03-01');
    });

    it('starts a household item behind a finished predecessor at today (unchanged behaviour)', () => {
      insertItem(db, 'A', {
        status: 'completed',
        startDate: '2026-03-01',
        endDate: '2026-03-02',
        actualStartDate: '2026-03-01',
        actualEndDate: '2026-03-02',
        durationDays: 1,
      });
      db.insert(schema.householdItems)
        .values({
          id: 'hi-1',
          name: 'Sofa',
          categoryId: 'hic-furniture',
          status: 'planned',
          quantity: 1,
          createdAt: STAMP,
          updatedAt: STAMP,
        })
        .run();
      db.insert(schema.householdItemDeps)
        .values({ householdItemId: 'hi-1', predecessorType: 'work_item', predecessorId: 'A' })
        .run();

      autoReschedule(db, { today: TODAY });

      const hi = db
        .select()
        .from(schema.householdItems)
        .where(eq(schema.householdItems.id, 'hi-1'))
        .get();
      // The ES search starts at today, so a past predecessor end is never "floored".
      expect(hi?.targetDeliveryDate).toBe(TODAY);
      expect(hi?.isLate).toBe(false);
    });
  });

  // ─── Undated tasks (Architect decision) ─────────────────────────────────────

  describe('autoReschedule never writes undated tasks (A1-A4)', () => {
    it('A1: leaves an undated root NULL across days while the projection forecasts today', () => {
      insertItem(db, 'U', { durationDays: 2 });

      expect(autoReschedule(db, { today: '2026-03-10' })).toBe(0);
      expect(stored(db, 'U')).toEqual({ startDate: null, endDate: null });

      expect(autoReschedule(db, { today: '2026-03-11' })).toBe(0);
      expect(stored(db, 'U')).toEqual({ startDate: null, endDate: null });

      const u = fieldsOf(computeScheduleProjection(db, '2026-03-11'), 'U');
      expect(u.projectedStartDate).toBe('2026-03-11');
      expect(u.isLate).toBe(false);
      expect(u.lateDays).toBeNull();
    });

    it('A2: keeps a user-entered end date and a NULL start', () => {
      insertItem(db, 'U', { endDate: '2026-03-20' });
      autoReschedule(db, { today: TODAY });
      expect(stored(db, 'U')).toEqual({ startDate: null, endDate: '2026-03-20' });
    });

    it('A3: persists a successor of an undated task at today + 2 and re-plans it the next day', () => {
      insertItem(db, 'U', { durationDays: 2 });
      insertItem(db, 'S', { durationDays: 3 });
      insertDep(db, 'U', 'S');

      autoReschedule(db, { today: '2026-03-10' });
      expect(stored(db, 'U').startDate).toBeNull();
      expect(stored(db, 'S')).toEqual({ startDate: '2026-03-12', endDate: '2026-03-15' });

      autoReschedule(db, { today: '2026-03-11' });
      expect(stored(db, 'S')).toEqual({ startDate: '2026-03-13', endDate: '2026-03-16' });

      const s = fieldsOf(computeScheduleProjection(db, '2026-03-11'), 'S');
      expect(s.isLate).toBe(false);
      expect(s.isHeldUp).toBe(false);
    });

    it('A4: an undated task that gains a predecessor gets a persisted planned date', () => {
      insertItem(db, 'U', { durationDays: 2 });
      insertItem(db, 'P', { startDate: '2026-03-12', endDate: '2026-03-14', durationDays: 2 });
      autoReschedule(db, { today: TODAY });
      expect(stored(db, 'U').startDate).toBeNull();

      insertDep(db, 'P', 'U');
      autoReschedule(db, { today: TODAY });
      expect(stored(db, 'U')).toEqual({ startDate: '2026-03-14', endDate: '2026-03-16' });
    });

    it('A4: a dated root whose start is cleared stays NULL and is not Late', () => {
      insertItem(db, 'R', { startDate: '2026-03-05', endDate: '2026-03-08', durationDays: 3 });
      expect(fieldsOf(computeScheduleProjection(db, TODAY), 'R').isLate).toBe(true);

      db.update(schema.workItems)
        .set({ startDate: null, endDate: null })
        .where(eq(schema.workItems.id, 'R'))
        .run();
      autoReschedule(db, { today: TODAY });

      expect(stored(db, 'R')).toEqual({ startDate: null, endDate: null });
      const r = fieldsOf(computeScheduleProjection(db, TODAY), 'R');
      expect(r.isLate).toBe(false);
      expect(r.projectedStartDate).toBe(TODAY);
    });

    it('still persists a completed item with a NULL start (not undated)', () => {
      insertItem(db, 'C', {
        status: 'completed',
        actualStartDate: '2026-03-01',
        actualEndDate: '2026-03-03',
        durationDays: 2,
      });
      expect(autoReschedule(db, { today: TODAY })).toBe(1);
      expect(stored(db, 'C')).toEqual({ startDate: '2026-03-01', endDate: '2026-03-03' });
    });

    it('A6: a dated, not-started root with a past start is still Late after a reschedule', () => {
      insertItem(db, 'D', { startDate: '2026-03-07', endDate: '2026-03-09', durationDays: 2 });
      autoReschedule(db, { today: TODAY });
      expect(stored(db, 'D').startDate).toBe('2026-03-07');
      const d = fieldsOf(computeScheduleProjection(db, TODAY), 'D');
      expect(d.isLate).toBe(true);
      expect(d.lateDays).toBe(3);
    });
  });

  // ─── Milestone events (AC3/AC4) ─────────────────────────────────────────────

  describe('autoReschedule onMilestoneDelayed (scenario 12)', () => {
    function lateContributor() {
      // forecast end 03-13
      insertItem(db, 'c1', { startDate: '2026-03-05', endDate: '2026-03-08', durationDays: 3 });
    }

    it('fires for a late, not-completed milestone with the forecast date', () => {
      lateContributor();
      insertMilestone(db, 1, '2026-03-12');
      link(db, 1, 'c1');
      const spy = jest.fn();
      autoReschedule(db, { today: TODAY, onMilestoneDelayed: spy });
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith(1, 'Milestone 1', '2026-03-12', '2026-03-13');
    });

    it('does not fire for a completed milestone even though contributors forecast after target', () => {
      lateContributor();
      insertMilestone(db, 1, '2026-03-12', {
        isCompleted: true,
        completedAt: '2026-03-09T10:00:00.000Z',
      });
      link(db, 1, 'c1');
      const spy = jest.fn();
      autoReschedule(db, { today: TODAY, onMilestoneDelayed: spy });
      expect(spy).not.toHaveBeenCalled();
    });

    it('does not fire when the milestone is flagged completed without a timestamp', () => {
      lateContributor();
      insertMilestone(db, 1, '2026-03-12', { isCompleted: true });
      link(db, 1, 'c1');
      const spy = jest.fn();
      autoReschedule(db, { today: TODAY, onMilestoneDelayed: spy });
      expect(spy).not.toHaveBeenCalled();
    });

    it('does not fire when the projected date is on or before the target', () => {
      lateContributor();
      insertMilestone(db, 1, '2026-03-13');
      insertMilestone(db, 2, '2026-03-30');
      link(db, 1, 'c1');
      link(db, 2, 'c1');
      const spy = jest.fn();
      autoReschedule(db, { today: TODAY, onMilestoneDelayed: spy });
      expect(spy).not.toHaveBeenCalled();
    });

    it('does not fire for a milestone without contributors', () => {
      insertMilestone(db, 1, '2026-03-01');
      const spy = jest.fn();
      autoReschedule(db, { today: TODAY, onMilestoneDelayed: spy });
      expect(spy).not.toHaveBeenCalled();
    });
  });
});
