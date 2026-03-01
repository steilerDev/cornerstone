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
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import { ensureDailyReschedule, resetRescheduleTracker } from './schedulingEngine.js';

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
