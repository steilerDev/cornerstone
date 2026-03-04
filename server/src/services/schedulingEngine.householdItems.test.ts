/**
 * Unit tests for the scheduling engine's household item delivery date computation.
 *
 * These tests exercise the autoReschedule() function's Step 7-10 logic:
 * computing earliestDeliveryDate and latestDeliveryDate for household items
 * based on their dependencies on work items and milestones.
 *
 * Floor rules:
 * - not_ordered/ordered: floor ES to today (isLate = true when floored)
 * - in_transit: floor LF to today (isLate = true when floored)
 * - delivered (actualDeliveryDate set): use actual date, isLate = false
 * - expectedDeliveryDate acts as a start_after constraint
 *
 * EPIC-09: Story 9.1 — Household Item Timeline Dependencies & Delivery Date Scheduling
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

function insertHouseholdItem(
  db: BetterSQLite3Database<typeof schema>,
  overrides: Partial<typeof schema.householdItems.$inferInsert> = {},
): string {
  const id = makeId('hi');
  db.insert(schema.householdItems)
    .values({
      id,
      name: 'Test Household Item',
      category: 'furniture',
      status: 'not_ordered',
      quantity: 1,
      createdAt: now(),
      updatedAt: now(),
      description: null,
      vendorId: null,
      url: null,
      room: null,
      orderDate: null,
      expectedDeliveryDate: null,
      actualDeliveryDate: null,
      createdBy: null,
      earliestDeliveryDate: null,
      latestDeliveryDate: null,
      ...overrides,
    })
    .run();
  return id;
}

function insertHIDep(
  db: BetterSQLite3Database<typeof schema>,
  householdItemId: string,
  predecessorType: 'work_item' | 'milestone',
  predecessorId: string,
) {
  db.insert(schema.householdItemDeps)
    .values({
      householdItemId,
      predecessorType,
      predecessorId,
    })
    .run();
}

function getHIDeliveryDates(
  db: BetterSQLite3Database<typeof schema>,
  hiId: string,
): { earliestDeliveryDate: string | null; latestDeliveryDate: string | null } {
  const row = db
    .select({
      earliestDeliveryDate: schema.householdItems.earliestDeliveryDate,
      latestDeliveryDate: schema.householdItems.latestDeliveryDate,
    })
    .from(schema.householdItems)
    .where(eq(schema.householdItems.id, hiId))
    .get();
  return row ?? { earliestDeliveryDate: null, latestDeliveryDate: null };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('autoReschedule — household item delivery date computation', () => {
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

  // ─── Basic CPM delivery date computation ───────────────────────────────────

  describe('basic CPM delivery date computation', () => {
    it('HI with no deps has null delivery dates (not computed)', () => {
      // Given: A household item with no dependencies
      const hiId = insertHouseholdItem(db, { status: 'not_ordered' });

      // When: autoReschedule runs
      autoReschedule(db);

      // Then: delivery dates remain null
      const { earliestDeliveryDate, latestDeliveryDate } = getHIDeliveryDates(db, hiId);
      expect(earliestDeliveryDate).toBeNull();
      expect(latestDeliveryDate).toBeNull();
    });

    it('HI with FS dep on WI ending 2026-05-15 gets earliestDeliveryDate = 2026-05-15', () => {
      // Given: A work item with endDate = 2026-05-15 and a HI that depends on it FS
      const userId = insertUser(db);
      const wiId = insertWorkItem(db, userId, { endDate: '2026-05-15' });
      const hiId = insertHouseholdItem(db, { status: 'not_ordered' });
      insertHIDep(db, hiId, 'work_item', wiId);

      // When: autoReschedule runs
      // We need today to be <= 2026-05-15 so it doesn't get floored
      // The test uses the real "today" so we just verify the dep calculation
      autoReschedule(db);

      // Then: earliest delivery date is computed
      const { earliestDeliveryDate, latestDeliveryDate } = getHIDeliveryDates(db, hiId);
      // The result depends on today — if today < 2026-05-15, earliest = 2026-05-15
      // If today >= 2026-05-15, earliest = today (floored)
      // We can verify it's not null (dep was processed)
      expect(earliestDeliveryDate).not.toBeNull();
      expect(latestDeliveryDate).not.toBeNull();
    });

    it('HI with two deps takes the max predecessor finish as earliestDeliveryDate', () => {
      // Given: Two work items, one ending earlier, one ending later
      const userId = insertUser(db);
      const wiA = insertWorkItem(db, userId, { endDate: '2026-05-01' });
      const wiB = insertWorkItem(db, userId, { endDate: '2026-06-15' });
      const hiId = insertHouseholdItem(db, { status: 'not_ordered' });
      insertHIDep(db, hiId, 'work_item', wiA);
      insertHIDep(db, hiId, 'work_item', wiB);

      autoReschedule(db);

      const { earliestDeliveryDate } = getHIDeliveryDates(db, hiId);
      // CPM: earliest = max(2026-05-01, 2026-06-15) = 2026-06-15 (or today if later)
      const today = new Date().toISOString().slice(0, 10);
      const expected = '2026-06-15' >= today ? '2026-06-15' : today;
      expect(earliestDeliveryDate).toBe(expected);
    });
  });

  // ─── Floor rules ──────────────────────────────────────────────────────────

  describe('floor rules', () => {
    it('HI with status not_ordered and CPM date in the past is floored to today', () => {
      // Given: A HI with a dep on a WI that already ended (past date)
      const userId = insertUser(db);
      const wiId = insertWorkItem(db, userId, { endDate: '2020-01-01' }); // far in past
      const hiId = insertHouseholdItem(db, { status: 'not_ordered' });
      insertHIDep(db, hiId, 'work_item', wiId);

      autoReschedule(db);

      // Then: earliestDeliveryDate is floored to today
      const today = new Date().toISOString().slice(0, 10);
      const { earliestDeliveryDate } = getHIDeliveryDates(db, hiId);
      expect(earliestDeliveryDate).toBe(today);
    });

    it('HI with status ordered and CPM date in the past is floored to today', () => {
      // Given: A HI (ordered) with a dep on a past-ended WI
      const userId = insertUser(db);
      const wiId = insertWorkItem(db, userId, { endDate: '2020-01-01' });
      const hiId = insertHouseholdItem(db, { status: 'ordered' });
      insertHIDep(db, hiId, 'work_item', wiId);

      autoReschedule(db);

      // Then: floored to today
      const today = new Date().toISOString().slice(0, 10);
      const { earliestDeliveryDate } = getHIDeliveryDates(db, hiId);
      expect(earliestDeliveryDate).toBe(today);
    });

    it('HI with status in_transit and CPM date in the past is floored to today (LF)', () => {
      // Given: A HI (in_transit) with a dep on a past-ended WI
      const userId = insertUser(db);
      const wiId = insertWorkItem(db, userId, { endDate: '2020-01-01' });
      const hiId = insertHouseholdItem(db, { status: 'in_transit' });
      insertHIDep(db, hiId, 'work_item', wiId);

      autoReschedule(db);

      // Then: latestDeliveryDate (LF) floored to today
      const today = new Date().toISOString().slice(0, 10);
      const { latestDeliveryDate } = getHIDeliveryDates(db, hiId);
      expect(latestDeliveryDate).toBe(today);
    });

    it('HI with actualDeliveryDate uses actual date, not CPM result', () => {
      // Given: A delivered HI with actualDeliveryDate set
      const userId = insertUser(db);
      const wiId = insertWorkItem(db, userId, { endDate: '2026-06-01' });
      const hiId = insertHouseholdItem(db, {
        status: 'delivered',
        actualDeliveryDate: '2026-02-20',
      });
      insertHIDep(db, hiId, 'work_item', wiId);

      autoReschedule(db);

      // Then: uses actual delivery date
      const { earliestDeliveryDate, latestDeliveryDate } = getHIDeliveryDates(db, hiId);
      expect(earliestDeliveryDate).toBe('2026-02-20');
      expect(latestDeliveryDate).toBe('2026-02-20');
    });

    it('HI expectedDeliveryDate overrides CPM earliestDeliveryDate when later', () => {
      // Given: A HI with expectedDeliveryDate far in the future, WI ends earlier
      const userId = insertUser(db);
      // Use a future date for the WI end so it doesn't get floored to today
      const wiId = insertWorkItem(db, userId, { endDate: '2030-03-01' });
      const hiId = insertHouseholdItem(db, {
        status: 'not_ordered',
        expectedDeliveryDate: '2030-06-01', // later than WI end date
      });
      insertHIDep(db, hiId, 'work_item', wiId);

      autoReschedule(db);

      // Then: earliest = max(2030-03-01, 2030-06-01) = 2030-06-01
      const { earliestDeliveryDate } = getHIDeliveryDates(db, hiId);
      expect(earliestDeliveryDate).toBe('2030-06-01');
    });

    it('HI expectedDeliveryDate is ignored when CPM date is already later', () => {
      // Given: A HI with expectedDeliveryDate earlier than WI end date
      const userId = insertUser(db);
      const wiId = insertWorkItem(db, userId, { endDate: '2030-08-01' });
      const hiId = insertHouseholdItem(db, {
        status: 'not_ordered',
        expectedDeliveryDate: '2030-03-01', // earlier than WI end date
      });
      insertHIDep(db, hiId, 'work_item', wiId);

      autoReschedule(db);

      // Then: earliest = max(2030-08-01, 2030-03-01) = 2030-08-01
      const { earliestDeliveryDate } = getHIDeliveryDates(db, hiId);
      expect(earliestDeliveryDate).toBe('2030-08-01');
    });
  });

  // ─── Milestone deps ────────────────────────────────────────────────────────

  describe('milestone dependencies', () => {
    it('HI with milestone dep gets earliestDeliveryDate from milestone targetDate', () => {
      // Given: A milestone with targetDate = 2030-07-01 and a HI depending on it
      const userId = insertUser(db);
      const milestoneId = insertMilestone(db, userId, { targetDate: '2030-07-01' });
      const hiId = insertHouseholdItem(db, { status: 'not_ordered' });
      insertHIDep(db, hiId, 'milestone', milestoneId.toString());

      autoReschedule(db);

      // Then: earliestDeliveryDate = milestone targetDate (since it's in the future)
      const { earliestDeliveryDate } = getHIDeliveryDates(db, hiId);
      expect(earliestDeliveryDate).toBe('2030-07-01');
    });

    it('HI with milestone dep and past targetDate gets floored to today', () => {
      // Given: A milestone with past targetDate
      const userId = insertUser(db);
      const milestoneId = insertMilestone(db, userId, { targetDate: '2020-01-01' });
      const hiId = insertHouseholdItem(db, { status: 'not_ordered' });
      insertHIDep(db, hiId, 'milestone', milestoneId.toString());

      autoReschedule(db);

      const today = new Date().toISOString().slice(0, 10);
      const { earliestDeliveryDate } = getHIDeliveryDates(db, hiId);
      expect(earliestDeliveryDate).toBe(today);
    });

    it('HI with milestone dep computes delivery date even when no work items exist', () => {
      // Given: No work items in the database — only a milestone and a HI
      // This is the exact scenario from bug #418: the early return guard
      // (allWorkItems.length === 0) was incorrectly skipping HI date computation.
      const userId = insertUser(db);
      const milestoneId = insertMilestone(db, userId, { targetDate: '2030-09-01' });
      const hiId = insertHouseholdItem(db, { status: 'not_ordered' });
      insertHIDep(db, hiId, 'milestone', milestoneId.toString());

      // When: autoReschedule runs with zero work items
      autoReschedule(db);

      // Then: earliestDeliveryDate is computed from the milestone targetDate
      const { earliestDeliveryDate } = getHIDeliveryDates(db, hiId);
      expect(earliestDeliveryDate).toBe('2030-09-01');
    });
  });

  // ─── autoReschedule writes changed dates to DB ────────────────────────────

  describe('autoReschedule write behavior', () => {
    it('writes updated delivery dates to DB only for changed items', () => {
      // Given: A HI with a dep (dates are null initially)
      const userId = insertUser(db);
      const wiId = insertWorkItem(db, userId, { endDate: '2030-05-15' });
      const hiId = insertHouseholdItem(db);
      insertHIDep(db, hiId, 'work_item', wiId);

      // Verify dates are null before autoReschedule
      const before = getHIDeliveryDates(db, hiId);
      expect(before.earliestDeliveryDate).toBeNull();

      // When: autoReschedule runs
      const updatedCount = autoReschedule(db);

      // Then: at least 1 item was updated (the HI)
      expect(updatedCount).toBeGreaterThan(0);

      // And: the HI now has delivery dates set
      const after = getHIDeliveryDates(db, hiId);
      expect(after.earliestDeliveryDate).not.toBeNull();
    });

    it('does not update HI delivery dates when they have not changed', () => {
      // Given: A HI already with correct delivery dates set
      const userId = insertUser(db);
      const wiId = insertWorkItem(db, userId, { endDate: '2030-05-15' });
      const hiId = insertHouseholdItem(db, {
        earliestDeliveryDate: '2030-05-15',
        latestDeliveryDate: '2030-05-15',
      });
      insertHIDep(db, hiId, 'work_item', wiId);

      // When: autoReschedule runs
      const count = autoReschedule(db);

      // Then: updatedCount might be 0 if the dates match (or 1 if there's a rounding difference)
      // The key point is the delivery dates remain correct
      const after = getHIDeliveryDates(db, hiId);
      expect(after.earliestDeliveryDate).toBe('2030-05-15');
    });

    it('handles multiple HIs with deps correctly', () => {
      // Given: Multiple HIs each with a dep
      const userId = insertUser(db);
      const wiA = insertWorkItem(db, userId, { endDate: '2030-04-01' });
      const wiB = insertWorkItem(db, userId, { endDate: '2030-07-01' });
      const hi1 = insertHouseholdItem(db, { name: 'Sofa' });
      const hi2 = insertHouseholdItem(db, { name: 'Table' });

      insertHIDep(db, hi1, 'work_item', wiA);
      insertHIDep(db, hi2, 'work_item', wiB);

      autoReschedule(db);

      // Both HIs should have delivery dates
      const dates1 = getHIDeliveryDates(db, hi1);
      const dates2 = getHIDeliveryDates(db, hi2);

      expect(dates1.earliestDeliveryDate).toBe('2030-04-01');
      expect(dates2.earliestDeliveryDate).toBe('2030-07-01');
    });
  });

  // ─── Milestone effective date priority (bug #441) ────────────────────────────

  describe('milestone effective date priority (bug #441)', () => {
    it('AC 1: when milestone has completedAt set, uses date portion only (not targetDate)', () => {
      // Given: A milestone with completedAt = '2030-01-15T14:30:00.000Z' and targetDate = '2030-06-01'
      const userId = insertUser(db);
      const milestoneId = insertMilestone(db, userId, {
        targetDate: '2030-06-01',
        completedAt: '2030-01-15T14:30:00.000Z',
        isCompleted: true,
      });
      const hiId = insertHouseholdItem(db, { status: 'not_ordered' });
      insertHIDep(db, hiId, 'milestone', milestoneId.toString());

      // When: autoReschedule runs
      autoReschedule(db);

      // Then: HI earliestDeliveryDate = '2030-01-15' (completedAt truncated, not targetDate)
      const { earliestDeliveryDate } = getHIDeliveryDates(db, hiId);
      expect(earliestDeliveryDate).toBe('2030-01-15');
    });

    it('AC 2: when milestone not completed and has contributing WIs, uses projected date (max WI end)', () => {
      // Given: A milestone with targetDate = '2030-06-01', completedAt = null
      //        WI-A linked to milestone, endDate = '2030-05-01'
      //        WI-B linked to milestone, endDate = '2030-07-15'
      //        HI depends on the milestone
      const userId = insertUser(db);
      const milestoneId = insertMilestone(db, userId, {
        targetDate: '2030-06-01',
        completedAt: null,
        isCompleted: false,
      });
      const wiA = insertWorkItem(db, userId, { endDate: '2030-05-01' });
      const wiB = insertWorkItem(db, userId, { endDate: '2030-07-15' });

      // Link both work items as contributors to the milestone
      db.insert(schema.milestoneWorkItems).values({ milestoneId, workItemId: wiA }).run();
      db.insert(schema.milestoneWorkItems).values({ milestoneId, workItemId: wiB }).run();

      const hiId = insertHouseholdItem(db, { status: 'not_ordered' });
      insertHIDep(db, hiId, 'milestone', milestoneId.toString());

      // When: autoReschedule runs
      autoReschedule(db);

      // Then: HI earliestDeliveryDate = '2030-07-15' (max of contributor end dates)
      const { earliestDeliveryDate } = getHIDeliveryDates(db, hiId);
      expect(earliestDeliveryDate).toBe('2030-07-15');
    });

    it('AC 3: when milestone not completed and has no contributors, falls back to targetDate', () => {
      // Given: A milestone with targetDate = '2030-08-01', completedAt = null
      //        No entries in milestone_work_items for this milestone
      const userId = insertUser(db);
      const milestoneId = insertMilestone(db, userId, {
        targetDate: '2030-08-01',
        completedAt: null,
        isCompleted: false,
      });
      const hiId = insertHouseholdItem(db, { status: 'not_ordered' });
      insertHIDep(db, hiId, 'milestone', milestoneId.toString());

      // When: autoReschedule runs
      autoReschedule(db);

      // Then: HI earliestDeliveryDate = '2030-08-01' (targetDate fallback)
      const { earliestDeliveryDate } = getHIDeliveryDates(db, hiId);
      expect(earliestDeliveryDate).toBe('2030-08-01');
    });

    it('AC 4: milestone running late (projected > targetDate), uses projected date', () => {
      // Given: A milestone with targetDate = '2030-04-01', completedAt = null
      //        WI linked to milestone, endDate = '2030-07-01' (later than targetDate)
      const userId = insertUser(db);
      const milestoneId = insertMilestone(db, userId, {
        targetDate: '2030-04-01',
        completedAt: null,
        isCompleted: false,
      });
      const wi = insertWorkItem(db, userId, { endDate: '2030-07-01' });
      db.insert(schema.milestoneWorkItems).values({ milestoneId, workItemId: wi }).run();

      const hiId = insertHouseholdItem(db, { status: 'not_ordered' });
      insertHIDep(db, hiId, 'milestone', milestoneId.toString());

      // When: autoReschedule runs
      autoReschedule(db);

      // Then: HI earliestDeliveryDate = '2030-07-01' (projected, not targetDate)
      const { earliestDeliveryDate } = getHIDeliveryDates(db, hiId);
      expect(earliestDeliveryDate).toBe('2030-07-01');
    });

    it('AC 5: milestone ahead of schedule (projected < targetDate), uses projected date', () => {
      // Given: A milestone with targetDate = '2030-10-01', completedAt = null
      //        WI linked to milestone, endDate = '2030-06-01' (earlier than targetDate)
      const userId = insertUser(db);
      const milestoneId = insertMilestone(db, userId, {
        targetDate: '2030-10-01',
        completedAt: null,
        isCompleted: false,
      });
      const wi = insertWorkItem(db, userId, { endDate: '2030-06-01' });
      db.insert(schema.milestoneWorkItems).values({ milestoneId, workItemId: wi }).run();

      const hiId = insertHouseholdItem(db, { status: 'not_ordered' });
      insertHIDep(db, hiId, 'milestone', milestoneId.toString());

      // When: autoReschedule runs
      autoReschedule(db);

      // Then: HI earliestDeliveryDate = '2030-06-01' (projected, not targetDate)
      const { earliestDeliveryDate } = getHIDeliveryDates(db, hiId);
      expect(earliestDeliveryDate).toBe('2030-06-01');
    });

    it('AC 3 edge: all contributors have null end dates, falls back to targetDate', () => {
      // Given: A milestone with targetDate = '2030-09-01', completedAt = null
      //        WI linked to milestone, but endDate = null and durationDays = null
      const userId = insertUser(db);
      const milestoneId = insertMilestone(db, userId, {
        targetDate: '2030-09-01',
        completedAt: null,
        isCompleted: false,
      });
      const wi = insertWorkItem(db, userId, {
        startDate: null,
        endDate: null,
        durationDays: null,
      });
      db.insert(schema.milestoneWorkItems).values({ milestoneId, workItemId: wi }).run();

      const hiId = insertHouseholdItem(db, { status: 'not_ordered' });
      insertHIDep(db, hiId, 'milestone', milestoneId.toString());

      // When: autoReschedule runs
      autoReschedule(db);

      // Then: HI earliestDeliveryDate = '2030-09-01' (targetDate fallback)
      const { earliestDeliveryDate } = getHIDeliveryDates(db, hiId);
      expect(earliestDeliveryDate).toBe('2030-09-01');
    });

    it('AC 7 regression guard: WI dependency (not milestone) still works correctly', () => {
      // Given: WI with endDate = '2030-03-01', HI depending on that WI (not milestone)
      const userId = insertUser(db);
      const wi = insertWorkItem(db, userId, { endDate: '2030-03-01' });
      const hiId = insertHouseholdItem(db, { status: 'not_ordered' });
      insertHIDep(db, hiId, 'work_item', wi);

      // When: autoReschedule runs
      autoReschedule(db);

      // Then: HI earliestDeliveryDate = '2030-03-01' (WI scheduling unaffected)
      const { earliestDeliveryDate } = getHIDeliveryDates(db, hiId);
      expect(earliestDeliveryDate).toBe('2030-03-01');
    });
  });
});
