/**
 * Home set-up: a backup check that fails with something other than an Error object still reports
 * "could not be checked" (null) and logs a neutral error name. The backup service is mocked so it
 * can reject with a plain string, which the real file system never does.
 *
 * Mutations these tests catch:
 *  - a non-Error rejection crashing the set-up request (500) instead of giving a null step;
 *  - the rejected value (which could hold the backup path) being logged.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';

jest.unstable_mockModule('./backupService.js', () => ({
  listBackups: jest.fn<() => Promise<never>>().mockRejectedValue('/secret/backup/path failed'),
}));

const { getHomeSetup } = await import('./homeService.js');

describe('getHomeSetup with a non-Error backup failure', () => {
  let sqlite: Database.Database;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    runMigrations(sqlite);
  });

  afterEach(() => {
    sqlite.close();
  });

  it('reports the backups step as null and logs only a neutral name', async () => {
    const db = drizzle(sqlite, { schema });
    const warn = jest.fn<(obj: Record<string, unknown>, msg: string) => void>();
    const res = await getHomeSetup(db, {
      isAdmin: true,
      config: { vatRate: 0.19, backupDir: '/secret/backup/path' },
      logger: { warn },
    });
    expect(res.steps.find((s) => s.id === 'backups')).toEqual({ id: 'backups', done: null });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toEqual({ errorName: 'unknown' });
    expect(JSON.stringify(warn.mock.calls[0])).not.toContain('secret');
  });
});
