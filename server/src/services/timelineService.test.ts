/**
 * Unit tests for the timeline service (getTimeline).
 *
 * Uses an in-memory SQLite database with migrations applied so DB calls are real,
 * while the scheduling engine is mocked via jest.unstable_mockModule to isolate
 * CPM logic from the service tests.
 *
 * EPIC-06 Story 6.3 — Timeline Data API
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type * as SchedulingEngineTypes from './schedulingEngine.js';
import type * as TimelineServiceTypes from './timelineService.js';

// ─── Mock the scheduling engine BEFORE importing the service ──────────────────

const mockSchedule = jest.fn<typeof SchedulingEngineTypes.schedule>();

jest.unstable_mockModule('./schedulingEngine.js', () => ({
  schedule: mockSchedule,
}));

// ─── Imports that depend on the mock (dynamic, after mock setup) ───────────────

let getTimeline: typeof TimelineServiceTypes.getTimeline;

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';

// ─── Test helpers ─────────────────────────────────────────────────────────────

function createTestDb() {
  const sqliteDb = new Database(':memory:');
  sqliteDb.pragma('journal_mode = WAL');
  sqliteDb.pragma('foreign_keys = ON');
  runMigrations(sqliteDb);
  return { sqlite: sqliteDb, db: drizzle(sqliteDb, { schema }) };
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
}

function insertUser(
  db: BetterSQLite3Database<typeof schema>,
  overrides: Partial<typeof schema.users.$inferInsert> = {},
): string {
  const id = makeId('user');
  const now = new Date().toISOString();
  db.insert(schema.users)
    .values({
      id,
      email: `${id}@example.com`,
      displayName: 'Test User',
      role: 'member',
      authProvider: 'local',
      passwordHash: '$scrypt$test',
      createdAt: now,
      updatedAt: now,
      ...overrides,
    })
    .run();
  return id;
}

function insertWorkItem(
  db: BetterSQLite3Database<typeof schema>,
  userId: string,
  overrides: Partial<typeof schema.workItems.$inferInsert> = {},
): string {
  const id = makeId('wi');
  const now = new Date().toISOString();
  db.insert(schema.workItems)
    .values({
      id,
      title: 'Test Work Item',
      status: 'not_started',
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
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

function insertTag(db: BetterSQLite3Database<typeof schema>, name: string): string {
  const id = makeId('tag');
  const now = new Date().toISOString();
  db.insert(schema.tags).values({ id, name, color: '#3B82F6', createdAt: now }).run();
  return id;
}

function linkWorkItemTag(
  db: BetterSQLite3Database<typeof schema>,
  workItemId: string,
  tagId: string,
) {
  db.insert(schema.workItemTags).values({ workItemId, tagId }).run();
}

function insertDependency(
  db: BetterSQLite3Database<typeof schema>,
  predecessorId: string,
  successorId: string,
  dependencyType:
    | 'finish_to_start'
    | 'start_to_start'
    | 'finish_to_finish'
    | 'start_to_finish' = 'finish_to_start',
  leadLagDays = 0,
) {
  db.insert(schema.workItemDependencies)
    .values({ predecessorId, successorId, dependencyType, leadLagDays })
    .run();
}

function insertMilestone(
  db: BetterSQLite3Database<typeof schema>,
  userId: string,
  overrides: Partial<typeof schema.milestones.$inferInsert> = {},
): number {
  const now = new Date().toISOString();
  const result = db
    .insert(schema.milestones)
    .values({
      title: 'Test Milestone',
      targetDate: '2026-06-01',
      isCompleted: false,
      completedAt: null,
      color: null,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    })
    .returning({ id: schema.milestones.id })
    .get();
  return result!.id;
}

function linkMilestoneWorkItem(
  db: BetterSQLite3Database<typeof schema>,
  milestoneId: number,
  workItemId: string,
) {
  db.insert(schema.milestoneWorkItems).values({ milestoneId, workItemId }).run();
}

// Default schedule mock return value — empty, no cycle
const defaultScheduleResult = {
  scheduledItems: [],
  criticalPath: [] as string[],
  warnings: [],
};

// ─── describe: getTimeline ────────────────────────────────────────────────────

describe('getTimeline service', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;

  beforeEach(async () => {
    const testDb = createTestDb();
    sqlite = testDb.sqlite;
    db = testDb.db;

    // Load the service dynamically so the mock is already set up
    const timelineServiceModule = await import('./timelineService.js');
    getTimeline = timelineServiceModule.getTimeline;

    // Default: schedule returns empty result with no cycles
    mockSchedule.mockReturnValue(defaultScheduleResult);
  });

  afterEach(() => {
    sqlite.close();
    jest.clearAllMocks();
  });

  // ─── Empty project ──────────────────────────────────────────────────────────

  describe('empty project', () => {
    it('returns empty arrays and null dateRange when no data exists', () => {
      const result = getTimeline(db);

      expect(result.workItems).toEqual([]);
      expect(result.dependencies).toEqual([]);
      expect(result.milestones).toEqual([]);
      expect(result.criticalPath).toEqual([]);
      expect(result.dateRange).toBeNull();
    });

    it('calls the scheduling engine even when no work items exist', () => {
      getTimeline(db);
      expect(mockSchedule).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Work item date filtering ───────────────────────────────────────────────

  describe('work item filtering by dates', () => {
    it('includes work items that have startDate set', () => {
      const userId = insertUser(db);
      const wiId = insertWorkItem(db, userId, { startDate: '2026-03-01', title: 'Has Start' });

      const result = getTimeline(db);

      expect(result.workItems).toHaveLength(1);
      expect(result.workItems[0].id).toBe(wiId);
    });

    it('includes work items that have endDate set', () => {
      const userId = insertUser(db);
      const wiId = insertWorkItem(db, userId, { endDate: '2026-04-30', title: 'Has End' });

      const result = getTimeline(db);

      expect(result.workItems).toHaveLength(1);
      expect(result.workItems[0].id).toBe(wiId);
    });

    it('includes work items that have both startDate and endDate set', () => {
      const userId = insertUser(db);
      const wiId = insertWorkItem(db, userId, {
        startDate: '2026-03-01',
        endDate: '2026-04-30',
        title: 'Has Both',
      });

      const result = getTimeline(db);

      expect(result.workItems).toHaveLength(1);
      expect(result.workItems[0].id).toBe(wiId);
    });

    it('excludes work items with neither startDate nor endDate', () => {
      const userId = insertUser(db);
      insertWorkItem(db, userId, { title: 'No Dates' });

      const result = getTimeline(db);

      expect(result.workItems).toHaveLength(0);
    });

    it('returns only dated work items when mixed with undated ones', () => {
      const userId = insertUser(db);
      const dated = insertWorkItem(db, userId, { startDate: '2026-03-01', title: 'Dated' });
      insertWorkItem(db, userId, { title: 'Undated' });

      const result = getTimeline(db);

      expect(result.workItems).toHaveLength(1);
      expect(result.workItems[0].id).toBe(dated);
    });
  });

  // ─── TimelineWorkItem field shapes ─────────────────────────────────────────

  describe('TimelineWorkItem shape', () => {
    it('includes all required fields on a timeline work item', () => {
      const userId = insertUser(db);
      const wiId = insertWorkItem(db, userId, {
        title: 'Foundation Work',
        status: 'in_progress',
        startDate: '2026-03-01',
        endDate: '2026-04-15',
        durationDays: 45,
        startAfter: '2026-02-15',
        startBefore: '2026-05-01',
      });

      const result = getTimeline(db);
      const wi = result.workItems.find((w) => w.id === wiId);

      expect(wi).toBeDefined();
      expect(wi!.id).toBe(wiId);
      expect(wi!.title).toBe('Foundation Work');
      expect(wi!.status).toBe('in_progress');
      expect(wi!.startDate).toBe('2026-03-01');
      expect(wi!.endDate).toBe('2026-04-15');
      expect(wi!.durationDays).toBe(45);
    });

    it('includes startAfter constraint on timeline work item', () => {
      const userId = insertUser(db);
      insertWorkItem(db, userId, {
        startDate: '2026-03-15',
        startAfter: '2026-03-01',
      });

      const result = getTimeline(db);
      expect(result.workItems[0].startAfter).toBe('2026-03-01');
    });

    it('includes startBefore constraint on timeline work item', () => {
      const userId = insertUser(db);
      insertWorkItem(db, userId, {
        endDate: '2026-05-30',
        startBefore: '2026-05-01',
      });

      const result = getTimeline(db);
      expect(result.workItems[0].startBefore).toBe('2026-05-01');
    });

    it('returns null for startAfter and startBefore when not set', () => {
      const userId = insertUser(db);
      insertWorkItem(db, userId, { startDate: '2026-03-01' });

      const result = getTimeline(db);
      expect(result.workItems[0].startAfter).toBeNull();
      expect(result.workItems[0].startBefore).toBeNull();
    });

    it('includes assignedUser (UserSummary) when user is assigned', () => {
      const userId = insertUser(db, {
        email: 'assigned@example.com',
        displayName: 'Jane Doe',
      });
      insertWorkItem(db, userId, {
        startDate: '2026-03-01',
        assignedUserId: userId,
      });

      const result = getTimeline(db);
      const wi = result.workItems[0];

      expect(wi.assignedUser).not.toBeNull();
      expect(wi.assignedUser!.id).toBe(userId);
      expect(wi.assignedUser!.displayName).toBe('Jane Doe');
      expect(wi.assignedUser!.email).toBe('assigned@example.com');
    });

    it('returns null assignedUser when no user is assigned', () => {
      const userId = insertUser(db);
      insertWorkItem(db, userId, { startDate: '2026-03-01', assignedUserId: null });

      const result = getTimeline(db);
      expect(result.workItems[0].assignedUser).toBeNull();
    });

    it('includes tags array on work items (with tag fields)', () => {
      const userId = insertUser(db);
      const wiId = insertWorkItem(db, userId, { startDate: '2026-03-01' });
      const tagId = insertTag(db, 'Structural');
      linkWorkItemTag(db, wiId, tagId);

      const result = getTimeline(db);
      const wi = result.workItems[0];

      expect(wi.tags).toHaveLength(1);
      expect(wi.tags[0].id).toBe(tagId);
      expect(wi.tags[0].name).toBe('Structural');
      expect(wi.tags[0].color).toBe('#3B82F6');
    });

    it('returns empty tags array when work item has no tags', () => {
      const userId = insertUser(db);
      insertWorkItem(db, userId, { startDate: '2026-03-01' });

      const result = getTimeline(db);
      expect(result.workItems[0].tags).toEqual([]);
    });

    it('returns multiple tags for a work item', () => {
      const userId = insertUser(db);
      const wiId = insertWorkItem(db, userId, { startDate: '2026-03-01' });
      const tagA = insertTag(db, 'Foundation');
      const tagB = insertTag(db, 'Concrete');
      linkWorkItemTag(db, wiId, tagA);
      linkWorkItemTag(db, wiId, tagB);

      const result = getTimeline(db);
      expect(result.workItems[0].tags).toHaveLength(2);
      const tagNames = result.workItems[0].tags.map((t) => t.name);
      expect(tagNames).toContain('Foundation');
      expect(tagNames).toContain('Concrete');
    });
  });

  // ─── Dependencies ───────────────────────────────────────────────────────────

  describe('dependencies', () => {
    it('returns all dependencies with correct field shapes', () => {
      const userId = insertUser(db);
      const wiA = insertWorkItem(db, userId, { startDate: '2026-03-01' });
      const wiB = insertWorkItem(db, userId, { startDate: '2026-04-01' });
      insertDependency(db, wiA, wiB, 'finish_to_start', 2);

      const result = getTimeline(db);

      expect(result.dependencies).toHaveLength(1);
      const dep = result.dependencies[0];
      expect(dep.predecessorId).toBe(wiA);
      expect(dep.successorId).toBe(wiB);
      expect(dep.dependencyType).toBe('finish_to_start');
      expect(dep.leadLagDays).toBe(2);
    });

    it('returns dependencies even when predecessor/successor have no dates (undated work items)', () => {
      const userId = insertUser(db);
      // Work items without dates — dependency still returned
      const wiA = insertWorkItem(db, userId, { title: 'Undated A' });
      const wiB = insertWorkItem(db, userId, { title: 'Undated B' });
      insertDependency(db, wiA, wiB);

      const result = getTimeline(db);

      // No work items in timeline (undated), but dependency still included
      expect(result.workItems).toHaveLength(0);
      expect(result.dependencies).toHaveLength(1);
    });

    it('returns empty dependencies array when no dependencies exist', () => {
      const userId = insertUser(db);
      insertWorkItem(db, userId, { startDate: '2026-03-01' });

      const result = getTimeline(db);

      expect(result.dependencies).toEqual([]);
    });

    it('returns multiple dependencies correctly', () => {
      const userId = insertUser(db);
      const wiA = insertWorkItem(db, userId, { startDate: '2026-03-01' });
      const wiB = insertWorkItem(db, userId, { startDate: '2026-04-01' });
      const wiC = insertWorkItem(db, userId, { startDate: '2026-05-01' });
      insertDependency(db, wiA, wiB, 'finish_to_start');
      insertDependency(db, wiB, wiC, 'start_to_start', -3);

      const result = getTimeline(db);

      expect(result.dependencies).toHaveLength(2);
      const types = result.dependencies.map((d) => d.dependencyType);
      expect(types).toContain('finish_to_start');
      expect(types).toContain('start_to_start');
    });
  });

  // ─── Milestones ─────────────────────────────────────────────────────────────

  describe('milestones', () => {
    it('returns all milestones with correct field shapes', () => {
      const userId = insertUser(db);
      const msId = insertMilestone(db, userId, {
        title: 'Foundation Complete',
        targetDate: '2026-04-15',
        isCompleted: false,
        completedAt: null,
        color: '#3B82F6',
      });

      const result = getTimeline(db);

      expect(result.milestones).toHaveLength(1);
      const ms = result.milestones[0];
      expect(ms.id).toBe(msId);
      expect(ms.title).toBe('Foundation Complete');
      expect(ms.targetDate).toBe('2026-04-15');
      expect(ms.isCompleted).toBe(false);
      expect(ms.completedAt).toBeNull();
      expect(ms.color).toBe('#3B82F6');
      expect(ms.workItemIds).toEqual([]);
    });

    it('returns milestone with linked work item IDs', () => {
      const userId = insertUser(db);
      const wiA = insertWorkItem(db, userId, { startDate: '2026-03-01', title: 'WI A' });
      const wiB = insertWorkItem(db, userId, { startDate: '2026-04-01', title: 'WI B' });
      const msId = insertMilestone(db, userId, { title: 'MS with Items' });
      linkMilestoneWorkItem(db, msId, wiA);
      linkMilestoneWorkItem(db, msId, wiB);

      const result = getTimeline(db);

      const ms = result.milestones.find((m) => m.id === msId);
      expect(ms).toBeDefined();
      expect(ms!.workItemIds).toHaveLength(2);
      expect(ms!.workItemIds).toContain(wiA);
      expect(ms!.workItemIds).toContain(wiB);
    });

    it('includes isCompleted=true and completedAt on completed milestones', () => {
      const userId = insertUser(db);
      const completedAt = new Date().toISOString();
      insertMilestone(db, userId, {
        title: 'Completed Milestone',
        isCompleted: true,
        completedAt,
      });

      const result = getTimeline(db);

      expect(result.milestones[0].isCompleted).toBe(true);
      expect(result.milestones[0].completedAt).toBe(completedAt);
    });

    it('returns milestones even when no work items have dates (empty project scenario)', () => {
      const userId = insertUser(db);
      insertMilestone(db, userId, { title: 'Standalone Milestone' });

      const result = getTimeline(db);

      expect(result.milestones).toHaveLength(1);
      expect(result.workItems).toHaveLength(0);
    });

    it('returns empty milestones array when no milestones exist', () => {
      const result = getTimeline(db);
      expect(result.milestones).toEqual([]);
    });

    it('returns milestones linked to work items that have no dates (workItemIds still present)', () => {
      const userId = insertUser(db);
      // Work item has no dates → not in timeline.workItems, but milestone link still appears
      const wiUndated = insertWorkItem(db, userId, { title: 'Undated WI' });
      const msId = insertMilestone(db, userId, { title: 'MS linked to undated' });
      linkMilestoneWorkItem(db, msId, wiUndated);

      const result = getTimeline(db);

      expect(result.workItems).toHaveLength(0);
      expect(result.milestones[0].workItemIds).toContain(wiUndated);
    });
  });

  // ─── Date range computation ─────────────────────────────────────────────────

  describe('dateRange computation', () => {
    it('computes dateRange with correct earliest and latest dates', () => {
      const userId = insertUser(db);
      insertWorkItem(db, userId, { startDate: '2026-03-01', endDate: '2026-05-01' });
      insertWorkItem(db, userId, { startDate: '2026-01-15', endDate: '2026-07-30' });

      const result = getTimeline(db);

      expect(result.dateRange).not.toBeNull();
      expect(result.dateRange!.earliest).toBe('2026-01-15');
      expect(result.dateRange!.latest).toBe('2026-07-30');
    });

    it('returns null dateRange when no work items have dates', () => {
      const userId = insertUser(db);
      insertWorkItem(db, userId, { title: 'Undated' });

      const result = getTimeline(db);

      expect(result.dateRange).toBeNull();
    });

    it('returns null dateRange when timeline has no work items', () => {
      const result = getTimeline(db);
      expect(result.dateRange).toBeNull();
    });

    it('returns non-null dateRange when only startDates are present', () => {
      const userId = insertUser(db);
      insertWorkItem(db, userId, { startDate: '2026-03-01' });
      insertWorkItem(db, userId, { startDate: '2026-06-15' });

      const result = getTimeline(db);

      expect(result.dateRange).not.toBeNull();
      // earliest = minimum startDate; latest falls back to earliest (no endDates present)
      expect(result.dateRange!.earliest).toBe('2026-03-01');
      // latest defaults to earliest when no endDate is set on any item
      expect(result.dateRange!.latest).toBe('2026-03-01');
    });

    it('returns non-null dateRange when only endDates are present', () => {
      const userId = insertUser(db);
      insertWorkItem(db, userId, { endDate: '2026-05-31' });
      insertWorkItem(db, userId, { endDate: '2026-08-01' });

      const result = getTimeline(db);

      expect(result.dateRange).not.toBeNull();
      // latest = maximum endDate; earliest falls back to latest (no startDates present)
      expect(result.dateRange!.latest).toBe('2026-08-01');
      // earliest defaults to latest when no startDate is set on any item
      expect(result.dateRange!.earliest).toBe('2026-08-01');
    });

    it('correctly handles a single work item with only startDate', () => {
      const userId = insertUser(db);
      insertWorkItem(db, userId, { startDate: '2026-04-01' });

      const result = getTimeline(db);

      expect(result.dateRange).not.toBeNull();
      // Both sides default to the only date present
      expect(result.dateRange!.earliest).toBe('2026-04-01');
      expect(result.dateRange!.latest).toBe('2026-04-01');
    });

    it('correctly handles a single work item with only endDate', () => {
      const userId = insertUser(db);
      insertWorkItem(db, userId, { endDate: '2026-09-30' });

      const result = getTimeline(db);

      expect(result.dateRange).not.toBeNull();
      expect(result.dateRange!.earliest).toBe('2026-09-30');
      expect(result.dateRange!.latest).toBe('2026-09-30');
    });
  });

  // ─── Critical path computation ──────────────────────────────────────────────

  describe('critical path', () => {
    it('returns criticalPath from the scheduling engine result', () => {
      const userId = insertUser(db);
      const wiA = insertWorkItem(db, userId, { startDate: '2026-03-01', durationDays: 10 });
      const wiB = insertWorkItem(db, userId, { startDate: '2026-04-01', durationDays: 5 });

      mockSchedule.mockReturnValue({
        scheduledItems: [],
        criticalPath: [wiA, wiB],
        warnings: [],
      });

      const result = getTimeline(db);

      expect(result.criticalPath).toEqual([wiA, wiB]);
    });

    it('calls schedule() with mode=full and all work items (not just dated ones)', () => {
      const userId = insertUser(db);
      const wiDated = insertWorkItem(db, userId, { startDate: '2026-03-01', durationDays: 5 });
      const wiUndated = insertWorkItem(db, userId, { title: 'Undated', durationDays: 3 });

      getTimeline(db);

      expect(mockSchedule).toHaveBeenCalledTimes(1);
      const callArg = mockSchedule.mock.calls[0][0];
      expect(callArg.mode).toBe('full');
      const scheduledIds = callArg.workItems.map((w) => w.id);
      // Both dated and undated work items are passed to the engine
      expect(scheduledIds).toContain(wiDated);
      expect(scheduledIds).toContain(wiUndated);
    });

    it('calls schedule() with all dependencies passed to engine', () => {
      const userId = insertUser(db);
      const wiA = insertWorkItem(db, userId, { startDate: '2026-03-01' });
      const wiB = insertWorkItem(db, userId, { startDate: '2026-04-01' });
      insertDependency(db, wiA, wiB, 'finish_to_start', 0);

      getTimeline(db);

      const callArg = mockSchedule.mock.calls[0][0];
      expect(callArg.dependencies).toHaveLength(1);
      expect(callArg.dependencies[0].predecessorId).toBe(wiA);
      expect(callArg.dependencies[0].successorId).toBe(wiB);
    });

    it('calls schedule() with a today string in YYYY-MM-DD format', () => {
      getTimeline(db);
      const callArg = mockSchedule.mock.calls[0][0];
      expect(callArg.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('returns empty criticalPath when scheduling engine detects a circular dependency', () => {
      const userId = insertUser(db);
      const wiA = insertWorkItem(db, userId, { startDate: '2026-03-01', durationDays: 5 });
      const wiB = insertWorkItem(db, userId, { startDate: '2026-04-01', durationDays: 3 });
      insertDependency(db, wiA, wiB);
      insertDependency(db, wiB, wiA);

      // Simulate engine returning a cycle
      mockSchedule.mockReturnValue({
        scheduledItems: [],
        criticalPath: [],
        warnings: [],
        cycleNodes: [wiA, wiB],
      });

      const result = getTimeline(db);

      // Timeline should NOT throw — it degrades gracefully
      expect(result.criticalPath).toEqual([]);
    });

    it('returns the engine criticalPath when no cycle is detected', () => {
      const userId = insertUser(db);
      const wiA = insertWorkItem(db, userId, { startDate: '2026-03-01', durationDays: 5 });

      mockSchedule.mockReturnValue({
        scheduledItems: [],
        criticalPath: [wiA],
        warnings: [],
        // No cycleNodes → not a cycle
      });

      const result = getTimeline(db);
      expect(result.criticalPath).toEqual([wiA]);
    });

    it('treats empty cycleNodes array as no cycle (returns criticalPath as-is)', () => {
      const userId = insertUser(db);
      const wiA = insertWorkItem(db, userId, { startDate: '2026-03-01', durationDays: 5 });

      mockSchedule.mockReturnValue({
        scheduledItems: [],
        criticalPath: [wiA],
        warnings: [],
        cycleNodes: [], // empty array → no cycle
      });

      const result = getTimeline(db);
      expect(result.criticalPath).toEqual([wiA]);
    });
  });

  // ─── SchedulingWorkItem fields passed to engine ─────────────────────────────

  describe('engine input shapes', () => {
    it('passes correct SchedulingWorkItem fields to the engine', () => {
      const userId = insertUser(db);
      insertWorkItem(db, userId, {
        startDate: '2026-03-01',
        endDate: '2026-04-15',
        durationDays: 45,
        startAfter: '2026-02-15',
        startBefore: '2026-05-01',
        status: 'in_progress',
      });

      getTimeline(db);

      const callArg = mockSchedule.mock.calls[0][0];
      const engineWi = callArg.workItems[0];

      expect(engineWi).toHaveProperty('id');
      expect(engineWi.startDate).toBe('2026-03-01');
      expect(engineWi.endDate).toBe('2026-04-15');
      expect(engineWi.durationDays).toBe(45);
      expect(engineWi.startAfter).toBe('2026-02-15');
      expect(engineWi.startBefore).toBe('2026-05-01');
      expect(engineWi.status).toBe('in_progress');
    });
  });
});
