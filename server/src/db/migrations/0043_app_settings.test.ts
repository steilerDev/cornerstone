/**
 * Migration integration tests for 0043_app_settings.sql
 *
 * Tests that:
 *   1. Applies without error and creates an empty app_settings table
 *   2. INSERT with key/value/updated_at succeeds and persists
 *   3. key is the PRIMARY KEY — duplicate key INSERT throws a UNIQUE/PK constraint violation
 *   4. value column accepts null (lazily-populated settings)
 *   5. updated_at is NOT NULL — omitting it throws a NOT NULL constraint violation
 *   6. Applying the migration a second time is a no-op (tracked via _migrations, idempotent)
 *
 * Story: #1877 Source contact fields, household sender setting & document attachment typing
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import {
  mkdtempSync,
  symlinkSync,
  unlinkSync,
  existsSync,
  readFileSync,
  readdirSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { runMigrations } from '../migrate.js';

const MIGRATIONS_DIR = dirname(fileURLToPath(import.meta.url));
const TARGET_MIGRATION = '0043_app_settings.sql';

/**
 * Apply every migration that sorts before TARGET_MIGRATION (derived dynamically from the
 * real migrations directory, so this stays correct as new migrations are added over time).
 */
function setupPreMigrationDb(db: Database.Database): void {
  const allFiles = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  const preFiles = allFiles.filter((f) => f < TARGET_MIGRATION);

  const tempDir = mkdtempSync(join(tmpdir(), 'cs-mig-0043-test-'));
  const symlinks: string[] = [];

  for (const file of preFiles) {
    const linkPath = join(tempDir, file);
    symlinkSync(join(MIGRATIONS_DIR, file), linkPath);
    symlinks.push(linkPath);
  }

  try {
    runMigrations(db, tempDir);
  } finally {
    for (const linkPath of symlinks) {
      if (existsSync(linkPath)) {
        unlinkSync(linkPath);
      }
    }
  }
}

/** Apply the target migration directly on a DB that already has its predecessors applied. */
function runTargetMigration(db: Database.Database): void {
  const sql = readFileSync(join(MIGRATIONS_DIR, TARGET_MIGRATION), 'utf-8');
  db.exec(sql);
  db.prepare('INSERT OR IGNORE INTO _migrations (name) VALUES (?)').run(TARGET_MIGRATION);
}

function tableExists(db: Database.Database, tableName: string): boolean {
  const result = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
    .get(tableName) as { name: string } | undefined;
  return result !== undefined;
}

describe('Migration 0043: Create app_settings table', () => {
  let sqlite: Database.Database;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    const originalWarn = console.warn;
    console.warn = () => undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- stash original console.warn for restore
    (sqlite as any).__originalWarn = originalWarn;
  });

  afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- restore stashed console.warn
    const originalWarn = (sqlite as any).__originalWarn;
    if (originalWarn) console.warn = originalWarn;
    sqlite.close();
  });

  it('applies without error and creates an empty app_settings table', () => {
    setupPreMigrationDb(sqlite);
    expect(tableExists(sqlite, 'app_settings')).toBe(false);

    expect(() => {
      runTargetMigration(sqlite);
    }).not.toThrow();

    expect(tableExists(sqlite, 'app_settings')).toBe(true);
    const count = (
      sqlite.prepare('SELECT COUNT(*) AS cnt FROM app_settings').get() as { cnt: number }
    ).cnt;
    expect(count).toBe(0);
  });

  it('INSERT with key/value/updated_at succeeds and persists', () => {
    setupPreMigrationDb(sqlite);
    runTargetMigration(sqlite);

    const now = new Date().toISOString();
    expect(() => {
      sqlite
        .prepare('INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)')
        .run('household_name', 'The Smith Family', now);
    }).not.toThrow();

    const row = sqlite
      .prepare('SELECT key, value, updated_at FROM app_settings WHERE key = ?')
      .get('household_name') as { key: string; value: string; updated_at: string };

    expect(row.key).toBe('household_name');
    expect(row.value).toBe('The Smith Family');
    expect(row.updated_at).toBe(now);
  });

  it('key is the PRIMARY KEY — duplicate key INSERT throws a constraint violation', () => {
    setupPreMigrationDb(sqlite);
    runTargetMigration(sqlite);

    const now = new Date().toISOString();
    sqlite
      .prepare('INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)')
      .run('household_name', 'First Value', now);

    expect(() => {
      sqlite
        .prepare('INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)')
        .run('household_name', 'Second Value', now);
    }).toThrow(/UNIQUE constraint failed|PRIMARY KEY/i);
  });

  it('value column accepts null (lazily-populated settings)', () => {
    setupPreMigrationDb(sqlite);
    runTargetMigration(sqlite);

    const now = new Date().toISOString();
    expect(() => {
      sqlite
        .prepare('INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)')
        .run('household_address', null, now);
    }).not.toThrow();

    const row = sqlite
      .prepare('SELECT value FROM app_settings WHERE key = ?')
      .get('household_address') as { value: string | null };
    expect(row.value).toBeNull();
  });

  it('updated_at is NOT NULL — omitting it throws a NOT NULL constraint violation', () => {
    setupPreMigrationDb(sqlite);
    runTargetMigration(sqlite);

    expect(() => {
      sqlite
        .prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)')
        .run('household_name', 'Missing Timestamp');
    }).toThrow(/NOT NULL constraint failed/i);
  });

  it('applying the migration a second time is a no-op (idempotent via _migrations)', () => {
    setupPreMigrationDb(sqlite);
    runTargetMigration(sqlite);

    expect(() => {
      runMigrations(sqlite);
    }).not.toThrow();

    const appliedCount = (
      sqlite
        .prepare('SELECT COUNT(*) AS cnt FROM _migrations WHERE name = ?')
        .get(TARGET_MIGRATION) as { cnt: number }
    ).cnt;
    expect(appliedCount).toBe(1);
  });
});
