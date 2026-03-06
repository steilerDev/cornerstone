/**
 * Unit tests for the scheduling engine's milestone-as-CPM-node behavior.
 *
 * Bug #484: Milestones are modeled as zero-duration CPM nodes (IDs like `milestone:<id>`)
 * instead of expanding them into synthetic WI-to-WI dependencies. This allows milestones
 * to appear on the critical path.
 *
 * These tests cover:
 * 1. Milestone on critical path
 * 2. Milestone NOT on critical path (parallel longer path exists)
 * 3. Completed milestone using actual date
 * 4. Milestone with multiple contributors (waits for latest)
 * 5. autoReschedule skips milestone: prefixed IDs in DB writes
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import { schedule, autoReschedule } from './schedulingEngine.js';
import type { SchedulingWorkItem, SchedulingDependency, ScheduleParams } from './schedulingEngine.js';

// ─── Pure schedule() helpers ──────────────────────────────────────────────────

function makeItem(
  id: string,
  durationDays: number | null = 5,
  overrides: Partial<SchedulingWorkItem> = {},
): SchedulingWorkItem {
  return {
    id,
    status: 'not_started',
    startDate: null,
    endDate: null,
    actualStartDate: null,
    actualEndDate: null,
    durationDays,
    startAfter: null,
    startBefore: null,
    ...overrides,
  };
}

function makeDep(
  predecessorId: string,
  successorId: string,
  dependencyType: SchedulingDependency['dependencyType'] = 'finish_to_start',
  leadLagDays = 0,
): SchedulingDependency {
  return { predecessorId, successorId, dependencyType, leadLagDays };
}

function fullParams(
  workItems: SchedulingWorkItem[],
  dependencies: SchedulingDependency[] = [],
  today = '2026-01-01',
): ScheduleParams {
  return { mode: 'full', workItems, dependencies, today };
}

// ─── DB helpers for autoReschedule tests ─────────────────────────────────────

function createTestDb() {
  const sqliteDb = new Database(':memory:');
  sqliteDb.pragma('journal_mode = WAL');
  sqliteDb.pragma('foreign_keys = ON');
  runMigrations(sqliteDb);
  return { sqlite: sqliteDb, db: drizzle(sqliteDb, { schema }) };
}

let tsOffset = 0;
function now() {
  return new Date(Date.now() + tsOffset++).toISOString();
}

function insertUser(db: BetterSQLite3Database<typeof schema>): string {
  const id = `user-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  db.insert(schema.users)
    .values({
      id,
      email: `${id}@example.com`,
      displayName: 'Test User',
      role: 'member',
      authProvider: 'local',
      passwordHash: '$scrypt$test',
      createdAt: now(),
      updatedAt: now(),
    })
    .run();
  return id;
}

function insertWorkItem(
  db: BetterSQLite3Database<typeof schema>,
  userId: string,
  overrides: Partial<typeof schema.workItems.$inferInsert> = {},
): string {
  const id = `wi-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  db.insert(schema.workItems)
    .values({
      id,
      title: 'Test Work Item',
      status: 'not_started',
      createdBy: userId,
      createdAt: now(),
      updatedAt: now(),
      startDate: null,
      endDate: null,
      durationDays: null,
      startAfter: null,
      startBefore: null,
      assignedUserId: null,
      ...overrides,
    })
    .run();
  return id;
}

function insertMilestone(
  db: BetterSQLite3Database<typeof schema>,
  userId: string,
  overrides: Partial<typeof schema.milestones.$inferInsert> = {},
): number {
  const result = db
    .insert(schema.milestones)
    .values({
      title: 'Test Milestone',
      targetDate: '2026-06-01',
      isCompleted: false,
      completedAt: null,
      color: null,
      createdBy: userId,
      createdAt: now(),
      updatedAt: now(),
      ...overrides,
    })
    .returning({ id: schema.milestones.id })
    .get();
  return result!.id;
}

function insertMilestoneWorkItem(
  db: BetterSQLite3Database<typeof schema>,
  milestoneId: number,
  workItemId: string,
) {
  db.insert(schema.milestoneWorkItems).values({ milestoneId, workItemId }).run();
}

function insertWorkItemMilestoneDep(
  db: BetterSQLite3Database<typeof schema>,
  workItemId: string,
  milestoneId: number,
) {
  db.insert(schema.workItemMilestoneDeps).values({ workItemId, milestoneId }).run();
}

function getWorkItemDates(
  db: BetterSQLite3Database<typeof schema>,
  wiId: string,
): { startDate: string | null; endDate: string | null } {
  const row = db
    .select({ startDate: schema.workItems.startDate, endDate: schema.workItems.endDate })
    .from(schema.workItems)
    .where(eq(schema.workItems.id, wiId))
    .get();
  return row ?? { startDate: null, endDate: null };
}

// ─── Tests: milestone as CPM node (pure schedule() function) ─────────────────

describe('milestone as CPM nodes (pure schedule())', () => {
  // ── Scenario 1: Milestone on critical path ────────────────────────────────

  describe('milestone on critical path', () => {
    it('milestone:id appears in criticalPath when it is the sole path', () => {
      // WI-A (10 days) → milestone:1 (0 days) → WI-B (5 days)
      // No parallel path, so the milestone is on the critical path.
      const wiA = makeItem('wi-a', 10);
      const milestoneNode = makeItem('milestone:1', 0);
      const wiB = makeItem('wi-b', 5);

      const deps = [
        makeDep('wi-a', 'milestone:1'),
        makeDep('milestone:1', 'wi-b'),
      ];

      const result = schedule(fullParams([wiA, milestoneNode, wiB], deps));

      expect(result.criticalPath).toContain('milestone:1');
    });

    it('all nodes in a linear chain are on the critical path', () => {
      // wi-a → milestone:1 → wi-b, no alternatives
      const wiA = makeItem('wi-a', 10);
      const milestoneNode = makeItem('milestone:1', 0);
      const wiB = makeItem('wi-b', 5);

      const deps = [
        makeDep('wi-a', 'milestone:1'),
        makeDep('milestone:1', 'wi-b'),
      ];

      const result = schedule(fullParams([wiA, milestoneNode, wiB], deps));

      expect(result.criticalPath).toContain('wi-a');
      expect(result.criticalPath).toContain('milestone:1');
      expect(result.criticalPath).toContain('wi-b');
      expect(result.cycleNodes).toBeUndefined();
    });

    it('milestone is scheduled as zero-duration node (ES == EF)', () => {
      const wiA = makeItem('wi-a', 10);
      const milestoneNode = makeItem('milestone:1', 0);
      const wiB = makeItem('wi-b', 5);

      const deps = [
        makeDep('wi-a', 'milestone:1'),
        makeDep('milestone:1', 'wi-b'),
      ];

      const result = schedule(fullParams([wiA, milestoneNode, wiB], deps));
      const milestoneScheduled = result.scheduledItems.find(
        (s) => s.workItemId === 'milestone:1',
      );

      expect(milestoneScheduled).toBeDefined();
      expect(milestoneScheduled!.scheduledStartDate).toBe(milestoneScheduled!.scheduledEndDate);
    });
  });

  // ── Scenario 2: Milestone NOT on critical path ────────────────────────────

  describe('milestone NOT on critical path', () => {
    it('milestone has positive float when a longer sibling path also reaches the same terminal', () => {
      // Setup: wi-a (1d) has two outgoing paths, both converging to wi-c:
      //   Path A (short): wi-a → milestone:1 (0d) → wi-c (2d)  total: 1+0+2=3
      //   Path B (long):  wi-a → wi-b (10d) → wi-c (2d)        total: 1+10+2=13
      //
      // wi-c ES = max(EF of milestone:1, EF of wi-b) = max(day1, day11) = day11
      // wi-c EF = day13 (terminal, LF=EF, LS=day11)
      //
      // Backward pass for milestone:1:
      //   Its only successor is wi-c. backwardDepLf = LS of wi-c = day11.
      //   milestone:1 LF = day11, LS = day11, ES = day1 → float = 10 days → NOT critical.
      const wiA = makeItem('wi-a', 1);
      const milestoneNode = makeItem('milestone:1', 0);
      const wiB = makeItem('wi-b', 10);
      const wiC = makeItem('wi-c', 2);

      const deps = [
        makeDep('wi-a', 'milestone:1'),
        makeDep('milestone:1', 'wi-c'),
        makeDep('wi-a', 'wi-b'),
        makeDep('wi-b', 'wi-c'),
      ];

      const result = schedule(fullParams([wiA, milestoneNode, wiB, wiC], deps));

      expect(result.criticalPath).not.toContain('milestone:1');
    });

    it('longer parallel path (wi-a → wi-b → wi-c) is on the critical path', () => {
      const wiA = makeItem('wi-a', 1);
      const milestoneNode = makeItem('milestone:1', 0);
      const wiB = makeItem('wi-b', 10);
      const wiC = makeItem('wi-c', 2);

      const deps = [
        makeDep('wi-a', 'milestone:1'),
        makeDep('milestone:1', 'wi-c'),
        makeDep('wi-a', 'wi-b'),
        makeDep('wi-b', 'wi-c'),
      ];

      const result = schedule(fullParams([wiA, milestoneNode, wiB, wiC], deps));

      expect(result.criticalPath).toContain('wi-a');
      expect(result.criticalPath).toContain('wi-b');
      expect(result.criticalPath).toContain('wi-c');
    });

    it('non-critical milestone has positive totalFloat in scheduledItems', () => {
      const wiA = makeItem('wi-a', 1);
      const milestoneNode = makeItem('milestone:1', 0);
      const wiB = makeItem('wi-b', 10);
      const wiC = makeItem('wi-c', 2);

      const deps = [
        makeDep('wi-a', 'milestone:1'),
        makeDep('milestone:1', 'wi-c'),
        makeDep('wi-a', 'wi-b'),
        makeDep('wi-b', 'wi-c'),
      ];

      const result = schedule(fullParams([wiA, milestoneNode, wiB, wiC], deps));

      const milestoneScheduled = result.scheduledItems.find(
        (s) => s.workItemId === 'milestone:1',
      );
      expect(milestoneScheduled).toBeDefined();
      expect(milestoneScheduled!.totalFloat).toBeGreaterThan(0);
      expect(milestoneScheduled!.isCritical).toBe(false);
    });
  });

  // ── Scenario 3: Completed milestone with actual date ─────────────────────

  describe('completed milestone with actualStartDate/actualEndDate', () => {
    it('completed milestone CPM node uses actualStartDate and actualEndDate', () => {
      const completedDate = '2026-02-15';
      const milestoneNode = makeItem('milestone:1', 0, {
        status: 'completed',
        startDate: completedDate,
        endDate: completedDate,
        actualStartDate: completedDate,
        actualEndDate: completedDate,
      });
      const wiB = makeItem('wi-b', 5);

      const deps = [makeDep('milestone:1', 'wi-b')];

      const result = schedule(fullParams([milestoneNode, wiB], deps, '2026-03-01'));

      // Milestone's scheduled dates should reflect the actual completion date
      const milestoneScheduled = result.scheduledItems.find(
        (s) => s.workItemId === 'milestone:1',
      );
      expect(milestoneScheduled).toBeDefined();
      expect(milestoneScheduled!.scheduledStartDate).toBe(completedDate);
      expect(milestoneScheduled!.scheduledEndDate).toBe(completedDate);
    });

    it('successor WI starts after completed milestone actual date (not today floor)', () => {
      // Milestone completed on 2026-02-15; today is 2026-03-01
      // WI-B (5 days) should start on 2026-02-15, not today
      const completedDate = '2026-02-15';
      const milestoneNode = makeItem('milestone:1', 0, {
        status: 'completed',
        startDate: completedDate,
        endDate: completedDate,
        actualStartDate: completedDate,
        actualEndDate: completedDate,
      });
      const wiB = makeItem('wi-b', 5, { status: 'not_started' });

      const deps = [makeDep('milestone:1', 'wi-b')];

      const result = schedule(fullParams([milestoneNode, wiB], deps, '2026-03-01'));

      const wiBScheduled = result.scheduledItems.find((s) => s.workItemId === 'wi-b');
      expect(wiBScheduled).toBeDefined();
      // WI-B starts from milestone's EF = 2026-02-15
      // But as not_started, today floor (2026-03-01) applies: max(2026-02-15, 2026-03-01)
      expect(wiBScheduled!.scheduledStartDate).toBe('2026-03-01');
    });

    it('completed milestone does not propagate today-floor to its predecessor dates', () => {
      // A completed milestone should report its actual dates without being clamped to today
      const completedDate = '2025-06-01'; // in the past
      const milestoneNode = makeItem('milestone:1', 0, {
        status: 'completed',
        startDate: completedDate,
        endDate: completedDate,
        actualStartDate: completedDate,
        actualEndDate: completedDate,
      });

      const result = schedule(fullParams([milestoneNode], [], '2026-03-01'));

      const milestoneScheduled = result.scheduledItems.find(
        (s) => s.workItemId === 'milestone:1',
      );
      expect(milestoneScheduled).toBeDefined();
      expect(milestoneScheduled!.scheduledStartDate).toBe(completedDate);
      expect(milestoneScheduled!.scheduledEndDate).toBe(completedDate);
    });
  });

  // ── Scenario 4: Milestone with multiple contributors ─────────────────────

  describe('milestone with multiple contributors', () => {
    it('milestone waits for the latest contributor (WI-B is longer)', () => {
      // WI-A (5 days) → milestone:1
      // WI-B (10 days) → milestone:1
      // milestone:1 → WI-C (3 days)
      // Milestone ES = max(ES of WI-A finish, ES of WI-B finish)
      // WI-A: starts 2026-01-01, ends 2026-01-06
      // WI-B: starts 2026-01-01, ends 2026-01-11
      // milestone:1 should start/end at 2026-01-11 (WI-B's EF)
      // WI-C should start at 2026-01-11
      const wiA = makeItem('wi-a', 5);
      const wiB = makeItem('wi-b', 10);
      const milestoneNode = makeItem('milestone:1', 0);
      const wiC = makeItem('wi-c', 3);

      const deps = [
        makeDep('wi-a', 'milestone:1'),
        makeDep('wi-b', 'milestone:1'),
        makeDep('milestone:1', 'wi-c'),
      ];

      const result = schedule(fullParams([wiA, wiB, milestoneNode, wiC], deps));

      const milestoneScheduled = result.scheduledItems.find(
        (s) => s.workItemId === 'milestone:1',
      );
      const wiCScheduled = result.scheduledItems.find((s) => s.workItemId === 'wi-c');

      expect(milestoneScheduled).toBeDefined();
      expect(wiCScheduled).toBeDefined();

      // Milestone starts after the latest contributor (WI-B ends on 2026-01-11)
      expect(milestoneScheduled!.scheduledStartDate).toBe('2026-01-11');
      expect(milestoneScheduled!.scheduledEndDate).toBe('2026-01-11');

      // WI-C starts after the milestone
      expect(wiCScheduled!.scheduledStartDate).toBe('2026-01-11');
    });

    it('milestone would have been earlier if it only depended on WI-A (shorter)', () => {
      // Verify our multi-contributor logic by comparing with a single-contributor scenario
      const wiA = makeItem('wi-a', 5);
      const milestoneNodeSingle = makeItem('milestone:1', 0);
      const wiC = makeItem('wi-c', 3);

      const deps = [
        makeDep('wi-a', 'milestone:1'),
        makeDep('milestone:1', 'wi-c'),
      ];

      const result = schedule(fullParams([wiA, milestoneNodeSingle, wiC], deps));
      const milestoneScheduled = result.scheduledItems.find(
        (s) => s.workItemId === 'milestone:1',
      );

      // With only WI-A (5 days), milestone is at 2026-01-06
      expect(milestoneScheduled!.scheduledStartDate).toBe('2026-01-06');
    });

    it('when both contributors have equal duration, milestone is still a zero-duration node', () => {
      const wiA = makeItem('wi-a', 7);
      const wiB = makeItem('wi-b', 7);
      const milestoneNode = makeItem('milestone:1', 0);

      const deps = [
        makeDep('wi-a', 'milestone:1'),
        makeDep('wi-b', 'milestone:1'),
      ];

      const result = schedule(fullParams([wiA, wiB, milestoneNode], deps));
      const milestoneScheduled = result.scheduledItems.find(
        (s) => s.workItemId === 'milestone:1',
      );

      expect(milestoneScheduled).toBeDefined();
      expect(milestoneScheduled!.scheduledStartDate).toBe(milestoneScheduled!.scheduledEndDate);
    });
  });
});

// ─── Tests: autoReschedule skips milestone: IDs in DB writes ─────────────────

describe('autoReschedule — milestone CPM nodes not written to DB', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;
  let userId: string;

  beforeEach(() => {
    const testDb = createTestDb();
    sqlite = testDb.sqlite;
    db = testDb.db;
    tsOffset = 0;
    userId = insertUser(db);
  });

  afterEach(() => {
    sqlite.close();
  });

  it('no work item row with milestone: prefixed ID exists after autoReschedule', () => {
    // Set up: a milestone with a contributor and a dependent
    const milestoneId = insertMilestone(db, userId, { targetDate: '2030-06-01' });
    const wiA = insertWorkItem(db, userId, { endDate: '2030-04-01', durationDays: 10 });
    const wiB = insertWorkItem(db, userId, { durationDays: 5 });

    insertMilestoneWorkItem(db, milestoneId, wiA);
    insertWorkItemMilestoneDep(db, wiB, milestoneId);

    autoReschedule(db);

    // Query for any row whose ID starts with 'milestone:'
    const allWorkItemRows = db.select({ id: schema.workItems.id }).from(schema.workItems).all();
    const milestoneRows = allWorkItemRows.filter((row) => row.id.startsWith('milestone:'));

    expect(milestoneRows).toHaveLength(0);
  });

  it('real work item dates are updated by autoReschedule (milestone CPM path)', () => {
    // WI-A (contributor, endDate set) → milestone → WI-B (dependent, durationDays set)
    // After autoReschedule, WI-B should have a start date derived from the milestone
    const milestoneId = insertMilestone(db, userId, { targetDate: '2030-06-01' });
    const wiA = insertWorkItem(db, userId, { endDate: '2030-05-01', durationDays: 10 });
    const wiB = insertWorkItem(db, userId, { durationDays: 5 });

    insertMilestoneWorkItem(db, milestoneId, wiA);
    insertWorkItemMilestoneDep(db, wiB, milestoneId);

    autoReschedule(db);

    // WI-B should now have dates set (not null)
    const { startDate, endDate } = getWorkItemDates(db, wiB);
    expect(startDate).not.toBeNull();
    expect(endDate).not.toBeNull();
  });

  it('only work item IDs exist in the work_items table after autoReschedule', () => {
    // Insert multiple work items and milestones with various link types
    const milestoneId1 = insertMilestone(db, userId, { targetDate: '2030-03-01' });
    const milestoneId2 = insertMilestone(db, userId, { targetDate: '2030-06-01' });

    const wiA = insertWorkItem(db, userId, { durationDays: 3, endDate: '2030-02-01' });
    const wiB = insertWorkItem(db, userId, { durationDays: 4 });
    const wiC = insertWorkItem(db, userId, { durationDays: 2 });

    insertMilestoneWorkItem(db, milestoneId1, wiA);
    insertWorkItemMilestoneDep(db, wiB, milestoneId1);
    insertMilestoneWorkItem(db, milestoneId2, wiB);
    insertWorkItemMilestoneDep(db, wiC, milestoneId2);

    autoReschedule(db);

    const allIds = db.select({ id: schema.workItems.id }).from(schema.workItems).all();
    const expectedIds = new Set([wiA, wiB, wiC]);

    for (const row of allIds) {
      expect(expectedIds.has(row.id)).toBe(true);
      expect(row.id.startsWith('milestone:')).toBe(false);
    }
  });
});
