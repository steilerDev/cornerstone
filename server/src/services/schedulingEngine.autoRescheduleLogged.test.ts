/**
 * Unit tests for autoRescheduleLogged (#2236): the relation-delete routes reschedule after
 * issuing their Undo token, and a failing reschedule is logged instead of failing the request.
 * All data is synthetic.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import { autoRescheduleLogged } from './schedulingEngine.js';

describe('autoRescheduleLogged', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    runMigrations(sqlite);
    db = drizzle(sqlite, { schema });
  });

  afterEach(() => {
    sqlite.close();
  });

  function insertWorkItem(id: string, startDate: string, endDate: string, durationDays: number) {
    const now = '2026-01-01T00:00:00.000Z';
    db.insert(schema.workItems)
      .values({
        id,
        title: id,
        status: 'not_started',
        startDate,
        endDate,
        durationDays,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }

  it('runs the reschedule and logs nothing when it succeeds', () => {
    insertWorkItem('wi-a', '2026-03-01', '2026-03-10', 9);
    insertWorkItem('wi-b', '2026-03-01', '2026-03-06', 5);
    db.insert(schema.workItemDependencies)
      .values({ predecessorId: 'wi-a', successorId: 'wi-b' })
      .run();
    const log = { error: jest.fn<(obj: unknown, msg: string) => void>() };

    autoRescheduleLogged(db, log);

    const b = db.select().from(schema.workItems).where(eq(schema.workItems.id, 'wi-b')).get()!;
    expect(b.startDate).toBe('2026-03-10');
    expect(log.error).not.toHaveBeenCalled();
  });

  it('catches a failing reschedule and logs the error with a fixed message', () => {
    sqlite.exec('DROP TABLE household_item_deps');
    const log = { error: jest.fn<(obj: unknown, msg: string) => void>() };

    expect(() => autoRescheduleLogged(db, log)).not.toThrow();

    expect(log.error).toHaveBeenCalledTimes(1);
    const call = log.error.mock.calls[0];
    expect(call).toBeDefined();
    if (!call) return;
    expect(call[1]).toBe('Reschedule after relation delete failed');
    expect((call[0] as { err: unknown }).err).toBeInstanceOf(Error);
  });
});
