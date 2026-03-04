/**
 * Integration tests for the scheduling engine's work item milestone dependency handling.
 *
 * These tests exercise the autoReschedule() function's milestone dependency expansion logic
 * (Step 4) to verify correct handling of completed milestones in work item scheduling.
 *
 * Bug #447: When a milestone is marked completed (completedAt is set), work items that depend
 * on it should use the actual completion date as their predecessor finish time, NOT the
 * synthetic dependencies derived from the milestone's contributing work items.
 *
 * EPIC-04 Story #415 — Household Item Timeline Dependencies & Delivery Date Scheduling
 * EPIC-04 Story #447 — Work Item Milestone Dependencies (completed milestone fix)
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import { autoReschedule } from './schedulingEngine.js';

// ─── Test helpers ─────────────────────────────────────────────────────────────

function createTestDb() {
  const sqliteDb = new Database(':memory:');
  sqliteDb.pragma('journal_mode = WAL');
  sqliteDb.pragma('foreign_keys = ON');
  runMigrations(sqliteDb);
  return { sqlite: sqliteDb, db: drizzle(sqliteDb, { schema }) };
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
}

let tsOffset = 0;

function now() {
  return new Date(Date.now() + tsOffset++).toISOString();
}

function insertUser(db: BetterSQLite3Database<typeof schema>): string {
  const id = makeId('user');
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
  const id = makeId('wi');
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
  db.insert(schema.milestoneWorkItems)
    .values({ milestoneId, workItemId })
    .run();
}

function insertWorkItemMilestoneDep(
  db: BetterSQLite3Database<typeof schema>,
  workItemId: string,
  milestoneId: number,
) {
  db.insert(schema.workItemMilestoneDeps)
    .values({ workItemId, milestoneId })
    .run();
}

function getWorkItemDates(
  db: BetterSQLite3Database<typeof schema>,
  wiId: string,
): { startDate: string | null; endDate: string | null } {
  const row = db
    .select({
      startDate: schema.workItems.startDate,
      endDate: schema.workItems.endDate,
    })
    .from(schema.workItems)
    .where(eq(schema.workItems.id, wiId))
    .get();
  return row ?? { startDate: null, endDate: null };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('autoReschedule — work item milestone dependency (completed milestone, bug #447)', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;

  beforeEach(() => {
    const testDb = createTestDb();
    sqlite = testDb.sqlite;
    db = testDb.db;
    tsOffset = 0;
  });

  afterEach(() => {
    sqlite.close();
  });

  describe('AC 1: completedAt set, uses completion date', () => {
    it('should use milestone completedAt as WI predecessor finish when milestone is completed', () => {
      // Given: A milestone with completedAt = '2030-01-15T14:30:00.000Z', targetDate = '2030-06-01'
      //        WI-A (contributor) linked to milestone, endDate = '2030-05-01'
      //        WI-B depends on milestone, durationDays = 5
      const userId = insertUser(db);
      const milestoneId = insertMilestone(db, userId, {
        completedAt: '2030-01-15T14:30:00.000Z',
        targetDate: '2030-06-01',
        isCompleted: true,
      });
      const wiA = insertWorkItem(db, userId, { endDate: '2030-05-01' });
      const wiB = insertWorkItem(db, userId, { durationDays: 5 });

      // Link WI-A as contributor to milestone
      insertMilestoneWorkItem(db, milestoneId, wiA);
      // Make WI-B depend on milestone
      insertWorkItemMilestoneDep(db, wiB, milestoneId);

      // When: autoReschedule runs
      autoReschedule(db);

      // Then: WI-B.startDate = '2030-01-15' (completedAt truncated)
      //       WI-B.endDate = '2030-01-20' (start + 5 days)
      //       (NOT scheduled after WI-A's '2030-05-01')
      const { startDate, endDate } = getWorkItemDates(db, wiB);
      expect(startDate).toBe('2030-01-15');
      expect(endDate).toBe('2030-01-20');
    });
  });

  describe('AC 2: incomplete milestone, uses contributor-based synthetic deps', () => {
    it('should use max contributor end date when milestone is incomplete', () => {
      // Given: A milestone with completedAt = null, targetDate = '2030-06-01'
      //        WI-A linked to milestone, endDate = '2030-05-01'
      //        WI-B depends on milestone, durationDays = 5
      const userId = insertUser(db);
      const milestoneId = insertMilestone(db, userId, {
        completedAt: null,
        targetDate: '2030-06-01',
        isCompleted: false,
      });
      const wiA = insertWorkItem(db, userId, { endDate: '2030-05-01' });
      const wiB = insertWorkItem(db, userId, { durationDays: 5 });

      // Link WI-A as contributor to milestone
      insertMilestoneWorkItem(db, milestoneId, wiA);
      // Make WI-B depend on milestone
      insertWorkItemMilestoneDep(db, wiB, milestoneId);

      // When: autoReschedule runs
      autoReschedule(db);

      // Then: WI-B.startDate = '2030-05-01' (after WI-A ends)
      //       WI-B.endDate = '2030-05-06' (start + 5 days)
      const { startDate, endDate } = getWorkItemDates(db, wiB);
      expect(startDate).toBe('2030-05-01');
      expect(endDate).toBe('2030-05-06');
    });
  });

  describe('AC 4: completedAt earlier than contributors\' scheduled dates', () => {
    it('should use completedAt even when contributors finish later', () => {
      // Given: A milestone with completedAt = '2030-02-01T00:00:00.000Z', targetDate = '2030-06-01'
      //        WI-A (contributor) linked to milestone, endDate = '2030-08-01'
      //        WI-B depends on milestone, durationDays = 3
      const userId = insertUser(db);
      const milestoneId = insertMilestone(db, userId, {
        completedAt: '2030-02-01T00:00:00.000Z',
        targetDate: '2030-06-01',
        isCompleted: true,
      });
      const wiA = insertWorkItem(db, userId, { endDate: '2030-08-01' });
      const wiB = insertWorkItem(db, userId, { durationDays: 3 });

      // Link WI-A as contributor to milestone
      insertMilestoneWorkItem(db, milestoneId, wiA);
      // Make WI-B depend on milestone
      insertWorkItemMilestoneDep(db, wiB, milestoneId);

      // When: autoReschedule runs
      autoReschedule(db);

      // Then: WI-B.startDate = '2030-02-01' (completedAt, NOT WI-A's '2030-08-01')
      //       WI-B.endDate = '2030-02-04' (start + 3 days)
      const { startDate, endDate } = getWorkItemDates(db, wiB);
      expect(startDate).toBe('2030-02-01');
      expect(endDate).toBe('2030-02-04');
    });
  });

  describe('AC 5: ISO datetime truncation', () => {
    it('should use only date portion of completedAt (truncate time)', () => {
      // Given: A milestone with completedAt = '2030-03-15T23:59:59.999Z'
      //        WI-B depends on milestone, durationDays = 1
      const userId = insertUser(db);
      const milestoneId = insertMilestone(db, userId, {
        completedAt: '2030-03-15T23:59:59.999Z',
        targetDate: '2030-06-01',
        isCompleted: true,
      });
      const wiB = insertWorkItem(db, userId, { durationDays: 1 });

      // Make WI-B depend on milestone
      insertWorkItemMilestoneDep(db, wiB, milestoneId);

      // When: autoReschedule runs
      autoReschedule(db);

      // Then: WI-B.startDate = '2030-03-15' (only date portion used)
      //       WI-B.endDate = '2030-03-16' (start + 1 day)
      const { startDate, endDate } = getWorkItemDates(db, wiB);
      expect(startDate).toBe('2030-03-15');
      expect(endDate).toBe('2030-03-16');
    });
  });

  describe('AC 6: existing WI-to-WI dependencies still work (regression guard)', () => {
    it('should schedule WI-to-WI dependencies unchanged', () => {
      // Given: WI-A with endDate = '2030-04-01'
      //        WI-B depends on WI-A (finish_to_start), durationDays = 5
      const userId = insertUser(db);
      const wiA = insertWorkItem(db, userId, { endDate: '2030-04-01' });
      const wiB = insertWorkItem(db, userId, { durationDays: 5 });

      // Create WI-to-WI dependency
      db.insert(schema.workItemDependencies)
        .values({
          predecessorId: wiA,
          successorId: wiB,
          dependencyType: 'finish_to_start',
          leadLagDays: 0,
        })
        .run();

      // When: autoReschedule runs
      autoReschedule(db);

      // Then: WI-B.startDate = '2030-04-01' (after WI-A ends)
      //       WI-B.endDate = '2030-04-06' (start + 5 days)
      //       (unchanged behavior)
      const { startDate, endDate } = getWorkItemDates(db, wiB);
      expect(startDate).toBe('2030-04-01');
      expect(endDate).toBe('2030-04-06');
    });
  });
});
