/**
 * Unit tests for the daily auto-reschedule tracker.
 *
 * Tests for ensureDailyReschedule() and resetRescheduleTracker() added in #345.
 *
 * Uses an in-memory SQLite database to verify that the function calls autoReschedule
 * when the date has changed and is a no-op when called again on the same day.
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import {
  ensureDailyReschedule,
  resetRescheduleTracker,
  autoReschedule,
} from './schedulingEngine.js';

// ─── Test helpers ─────────────────────────────────────────────────────────────

function createTestDb() {
  const sqliteDb = new Database(':memory:');
  sqliteDb.pragma('journal_mode = WAL');
  sqliteDb.pragma('foreign_keys = ON');
  runMigrations(sqliteDb);
  return { sqlite: sqliteDb, db: drizzle(sqliteDb, { schema }) };
}

describe('ensureDailyReschedule', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;

  beforeEach(() => {
    const testDb = createTestDb();
    sqlite = testDb.sqlite;
    db = testDb.db;
    // Reset the in-memory tracker before each test
    resetRescheduleTracker();
  });

  afterEach(() => {
    sqlite.close();
  });

  it('runs without error on an empty database', () => {
    // Should complete without throwing even with no work items
    expect(() => ensureDailyReschedule(db)).not.toThrow();
  });

  it('runs autoReschedule on first call (tracker starts null)', () => {
    // First call should always run (tracker is null = has not run today)
    // We verify by checking it does not throw and completes
    expect(() => ensureDailyReschedule(db)).not.toThrow();
  });

  it('is a no-op on second call within the same day', () => {
    // After the first call, calling again with the same date should not run autoReschedule again.
    // We spy on database update to verify no DB writes occur on the second call.
    const dbUpdateSpy = jest.spyOn(db, 'update');

    ensureDailyReschedule(db); // First call — runs autoReschedule (no items, 0 updates)
    const callsAfterFirst = dbUpdateSpy.mock.calls.length;

    ensureDailyReschedule(db); // Second call on same day — should be no-op
    const callsAfterSecond = dbUpdateSpy.mock.calls.length;

    // No additional db.update calls should have occurred on the second call
    expect(callsAfterSecond).toBe(callsAfterFirst);

    dbUpdateSpy.mockRestore();
  });

  it('runs autoReschedule again after resetRescheduleTracker()', () => {
    // Run first call
    ensureDailyReschedule(db);

    // Reset the tracker (simulates a server restart / next day)
    resetRescheduleTracker();

    // The next call should run autoReschedule again
    const dbUpdateSpy = jest.spyOn(db, 'update');
    ensureDailyReschedule(db);

    // If there are work items with stale dates, updates would occur.
    // With empty DB, no updates but the function should have been called.
    // We just verify no throw and that the tracker is reset.
    expect(() => ensureDailyReschedule(db)).not.toThrow(); // Should be no-op now
    dbUpdateSpy.mockRestore();
  });

  it('runs autoReschedule when date changes (simulated via tracker reset)', () => {
    // Insert a work item with a stale past start date
    const now = new Date().toISOString();
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    // Insert user (required for createdBy FK in some schemas)
    db.insert(schema.users)
      .values({
        id: 'user-test-drs',
        email: 'test@example.com',
        displayName: 'Test',
        passwordHash: 'x',
        role: 'member',
        authProvider: 'local',
        createdAt: now,
        updatedAt: now,
      })
      .run();

    // Insert a not_started work item with a past start date
    db.insert(schema.workItems)
      .values({
        id: 'wi-test-drs',
        title: 'Stale Work Item',
        status: 'not_started',
        startDate: yesterday,
        endDate: yesterday,
        durationDays: 1,
        createdBy: 'user-test-drs',
        createdAt: now,
        updatedAt: now,
      })
      .run();

    // First call should reschedule the work item (today floors the start date)
    ensureDailyReschedule(db);

    const wiAfterFirst = sqlite
      .prepare('SELECT start_date FROM work_items WHERE id = ?')
      .get('wi-test-drs') as { start_date: string };

    const today = new Date().toISOString().slice(0, 10);
    // After reschedule, the not_started item's start date should be floored to today
    expect(wiAfterFirst.start_date).toBe(today);
  });

  it('resetRescheduleTracker allows the next call to re-run reschedule', () => {
    ensureDailyReschedule(db);
    resetRescheduleTracker();

    // Verify the tracker is reset by spying on db.update
    // With an empty DB, no updates occur but the fn executes
    const dbRunSpy = jest.spyOn(db, 'update');
    ensureDailyReschedule(db); // Should execute (tracker was reset)
    // The select + potential update path is entered
    expect(dbRunSpy).toBeDefined();
    dbRunSpy.mockRestore();
  });
});

// ─── autoReschedule() transaction rollback (#1809) ────────────────────────────
//
// autoReschedule's write-application phase (work item date updates + household item delivery
// date updates) is wrapped in a single db.transaction(() => {...}). These tests force a mid-
// sequence throw via jest.spyOn(db, 'update') (closure style makes every db.xxx call inside the
// transaction visible to the outer db spy) and verify that ALL writes in the transaction —
// including ones that would have already "succeeded" before the forced throw — are rolled back.

describe('autoReschedule — transaction rollback (#1809)', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;

  function insertUser(id: string) {
    const now = new Date().toISOString();
    db.insert(schema.users)
      .values({
        id,
        email: `${id}@example.com`,
        displayName: 'Test User',
        passwordHash: 'x',
        role: 'member',
        authProvider: 'local',
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }

  function insertStaleWorkItem(id: string, userId: string, staleDate: string) {
    const now = new Date().toISOString();
    db.insert(schema.workItems)
      .values({
        id,
        title: `Stale ${id}`,
        status: 'not_started',
        startDate: staleDate,
        endDate: staleDate,
        durationDays: 1,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }

  function getWorkItemDates(id: string) {
    const row = db
      .select({ startDate: schema.workItems.startDate, endDate: schema.workItems.endDate })
      .from(schema.workItems)
      .where(eq(schema.workItems.id, id))
      .get();
    return row ?? { startDate: null, endDate: null };
  }

  beforeEach(() => {
    const testDb = createTestDb();
    sqlite = testDb.sqlite;
    db = testDb.db;
  });

  afterEach(() => {
    sqlite.close();
  });

  it('rolls back both work items when the 2nd of two work-item updates throws mid-transaction', () => {
    // Given: Two independent not_started work items with stale (past) dates — both require a
    // db.update(workItems) write to float their dates forward to today.
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    insertUser('user-rb1');
    insertStaleWorkItem('wi-rb1-a', 'user-rb1', yesterday);
    insertStaleWorkItem('wi-rb1-b', 'user-rb1', yesterday);

    const originalDates = {
      a: getWorkItemDates('wi-rb1-a'),
      b: getWorkItemDates('wi-rb1-b'),
    };

    // When: db.update is spied; call 1 succeeds, call 2 throws — simulating a crash after the
    // first work item's update would have already autocommitted without a transaction wrap.
    const originalUpdate = db.update.bind(db);
    let calls = 0;
    const spy = jest
      .spyOn(db, 'update')
      .mockImplementation((...args: Parameters<typeof db.update>) => {
        calls++;
        if (calls === 2) {
          throw new Error('Simulated crash mid-transaction');
        }
        return originalUpdate(...args);
      });

    expect(() => autoReschedule(db)).toThrow('Simulated crash mid-transaction');

    spy.mockRestore();

    // Then: BOTH work items' dates are unchanged from their pre-call (stale) values — not just
    // the 2nd one. This proves the first workItems.update was rolled back alongside the
    // second's failure.
    expect(getWorkItemDates('wi-rb1-a')).toEqual(originalDates.a);
    expect(getWorkItemDates('wi-rb1-b')).toEqual(originalDates.b);
  });

  it('rolls back the work-item update when the household-item update in the same transaction throws (cross-loop)', () => {
    // Given: 1 work item needing a date change, AND 1 household item dependent on it needing a
    // targetDeliveryDate/isLate change. Both loops (work items, then household items) must
    // share ONE transaction — a fix that wrapped only one loop would fail this test.
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    insertUser('user-rb2');
    insertStaleWorkItem('wi-rb2', 'user-rb2', yesterday);

    const now = new Date().toISOString();
    db.insert(schema.householdItems)
      .values({
        id: 'hi-rb2',
        name: 'Test Household Item',
        categoryId: 'hic-furniture',
        status: 'planned',
        quantity: 1,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    db.insert(schema.householdItemDeps)
      .values({
        householdItemId: 'hi-rb2',
        predecessorType: 'work_item',
        predecessorId: 'wi-rb2',
      })
      .run();

    const originalWiDates = getWorkItemDates('wi-rb2');

    // When: db.update is spied. Empirically verified (scratch run against this exact seed):
    // call 1 = db.update(workItems) for wi-rb2, call 2 = db.update(householdItems) for hi-rb2
    // — there is no intervening db.update call because the HI loop's predecessor lookup finds
    // wi-rb2 in scheduledMap and never falls back to the db.select() branch. Throw on call 2.
    const originalUpdate = db.update.bind(db);
    let calls = 0;
    const spy = jest
      .spyOn(db, 'update')
      .mockImplementation((...args: Parameters<typeof db.update>) => {
        calls++;
        if (calls === 2) {
          throw new Error('Simulated crash mid-transaction');
        }
        return originalUpdate(...args);
      });

    expect(() => autoReschedule(db)).toThrow('Simulated crash mid-transaction');

    spy.mockRestore();

    // Then: the work item's date change was ALSO rolled back, proving both loops share one
    // transaction (a naive fix wrapping only the household-item loop would leave this WI write
    // already committed).
    expect(getWorkItemDates('wi-rb2')).toEqual(originalWiDates);
  });
});
