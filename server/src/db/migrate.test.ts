/**
 * Unit tests for migrate.ts: listMigrationFiles() and runMigrations().
 */

import { jest, describe, it, expect, afterEach } from '@jest/globals';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { disposableDb, disposableTempDir } from '../test-helpers/disposables.js';
import { listMigrationFiles, runMigrations } from './migrate.js';

afterEach(() => {
  jest.restoreAllMocks();
});

describe('listMigrationFiles()', () => {
  it('returns only .sql names, sorted lexicographically regardless of creation order', () => {
    using dir = disposableTempDir('migrate-list-');
    // Created out of order on purpose; non-SQL files and a directory must be ignored
    writeFileSync(join(dir.path, '0010_c.sql'), '');
    writeFileSync(join(dir.path, '0002_b.sql'), '');
    writeFileSync(join(dir.path, '0001_a.sql'), '');
    writeFileSync(join(dir.path, 'README.md'), '');
    writeFileSync(join(dir.path, '0003_notes.sql.bak'), '');
    mkdirSync(join(dir.path, 'sub.sql.d'));

    // Guards: dropping the .sql filter, dropping the sort (readdir order is unspecified)
    expect(listMigrationFiles(dir.path)).toEqual(['0001_a.sql', '0002_b.sql', '0010_c.sql']);
  });

  it('returns an empty array for a missing directory', () => {
    using dir = disposableTempDir('migrate-list-missing-');
    // Guards: letting readdirSync throw ENOENT (startup validation of a fresh install)
    expect(listMigrationFiles(join(dir.path, 'does-not-exist'))).toEqual([]);
  });

  it('returns an empty array for an empty directory', () => {
    using dir = disposableTempDir('migrate-list-empty-');
    expect(listMigrationFiles(dir.path)).toEqual([]);
  });

  it('defaults to the bundled migrations: non-empty, all .sql, already sorted', () => {
    const bundled = listMigrationFiles();
    // Guards: the default path resolving to the wrong directory (returns [])
    expect(bundled.length).toBeGreaterThan(0);
    expect(bundled.every((f) => f.endsWith('.sql'))).toBe(true);
    expect(bundled).toEqual([...bundled].sort());
  });
});

describe('runMigrations()', () => {
  it('applies migrations in sorted order (a later one depends on an earlier one)', () => {
    using dir = disposableTempDir('migrate-run-');
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    // 0002 needs the table created by 0001; written first so readdir order cannot save it
    writeFileSync(join(dir.path, '0002_insert.sql'), "INSERT INTO t (v) VALUES ('x');");
    writeFileSync(join(dir.path, '0001_create.sql'), 'CREATE TABLE t (v TEXT);');
    using db = disposableDb();

    runMigrations(db, dir.path);

    // Guards: running files in directory order instead of sorted order (0002 would throw)
    expect(db.prepare('SELECT v FROM t').all()).toEqual([{ v: 'x' }]);
    expect(
      (db.prepare('SELECT name FROM _migrations ORDER BY rowid').all() as { name: string }[]).map(
        (r) => r.name,
      ),
    ).toEqual(['0001_create.sql', '0002_insert.sql']);
  });

  it('does not re-run an already applied migration', () => {
    using dir = disposableTempDir('migrate-rerun-');
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    writeFileSync(join(dir.path, '0001_create.sql'), 'CREATE TABLE t (v TEXT);');
    using db = disposableDb();
    runMigrations(db, dir.path);

    // A second run would throw "table t already exists" if the applied set were ignored
    expect(() => runMigrations(db, dir.path)).not.toThrow();
  });

  it('creates the _migrations table and returns when the directory is missing', () => {
    using dir = disposableTempDir('migrate-nodir-');
    using db = disposableDb();

    runMigrations(db, join(dir.path, 'nope'));

    // Guards: skipping the _migrations bootstrap (restore validation depends on the table)
    expect(db.prepare('SELECT COUNT(*) AS n FROM _migrations').get()).toEqual({ n: 0 });
  });

  it('rolls back a failing migration and does not record it', () => {
    using dir = disposableTempDir('migrate-fail-');
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    writeFileSync(join(dir.path, '0001_bad.sql'), 'CREATE TABLE ok (v TEXT); CREATE TABLEX nope;');
    using db = disposableDb();

    expect(() => runMigrations(db, dir.path)).toThrow();

    // Guards: recording the migration or keeping its partial effects
    expect(db.prepare('SELECT COUNT(*) AS n FROM _migrations').get()).toEqual({ n: 0 });
    expect(
      db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ok'").get(),
    ).toBeUndefined();
  });

  it('applies every bundled migration by default and records exactly the listed names', () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    using db = disposableDb();

    runMigrations(db);

    // Guards: runMigrations and listMigrationFiles disagreeing on the default directory
    expect(
      (db.prepare('SELECT name FROM _migrations ORDER BY name').all() as { name: string }[]).map(
        (r) => r.name,
      ),
    ).toEqual(listMigrationFiles());
  });
});
