/**
 * Migration integration tests for 0046_users_oidc_subject_unique.sql
 *
 * Tests that:
 *   1. Applies cleanly on top of its predecessors
 *   2. idx_users_oidc_lookup covers ONLY oidc_subject (auth_provider dropped)
 *   3. The index is partial (WHERE oidc_subject IS NOT NULL) and unique
 *   4. A legacy auth_provider='oidc' row survives unchanged (no backfill)
 *   5. A duplicate oidc_subject across local/oidc rows is rejected
 *   6. Multiple NULL oidc_subject rows are allowed
 *   7. Re-running the migration is a no-op via the _migrations tracker
 *
 * Issue: #1865 OIDC account linking
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
const TARGET_MIGRATION = '0046_users_oidc_subject_unique.sql';

/** Apply every migration sorting before TARGET_MIGRATION (derived from the real directory). */
function setupPreMigrationDb(db: Database.Database): void {
  const preFiles = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .filter((f) => f < TARGET_MIGRATION);

  const tempDir = mkdtempSync(join(tmpdir(), 'cs-mig-0046-test-'));
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
      if (existsSync(linkPath)) unlinkSync(linkPath);
    }
  }
}

function runTargetMigration(db: Database.Database): void {
  const sql = readFileSync(join(MIGRATIONS_DIR, TARGET_MIGRATION), 'utf-8');
  db.exec(sql);
  db.prepare('INSERT OR IGNORE INTO _migrations (name) VALUES (?)').run(TARGET_MIGRATION);
}

function indexColumns(db: Database.Database): string[] {
  return (
    db.prepare("PRAGMA index_info('idx_users_oidc_lookup')").all() as Array<{ name: string }>
  ).map((r) => r.name);
}

describe('Migration 0046: users.oidc_subject unique index', () => {
  let sqlite: Database.Database;
  let counter = 0;
  let originalWarn: typeof console.warn;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    originalWarn = console.warn;
    console.warn = () => undefined;
    counter = 0;
  });

  afterEach(() => {
    console.warn = originalWarn;
    sqlite.close();
  });

  function insertUser(authProvider: 'local' | 'oidc', oidcSubject: string | null): string {
    const id = `user-${++counter}`;
    const now = new Date().toISOString();
    sqlite
      .prepare(
        `INSERT INTO users (id, email, display_name, role, auth_provider, oidc_subject, created_at, updated_at)
         VALUES (?, ?, ?, 'member', ?, ?, ?, ?)`,
      )
      .run(id, `${id}@example.com`, id, authProvider, oidcSubject, now, now);
    return id;
  }

  it('applies cleanly on top of its predecessors', () => {
    setupPreMigrationDb(sqlite);

    expect(() => runTargetMigration(sqlite)).not.toThrow();
  });

  it('pre-migration the index covers (auth_provider, oidc_subject); post-migration only oidc_subject', () => {
    setupPreMigrationDb(sqlite);
    expect(indexColumns(sqlite)).toEqual(['auth_provider', 'oidc_subject']);

    runTargetMigration(sqlite);

    expect(indexColumns(sqlite)).toEqual(['oidc_subject']);
  });

  it('creates a unique partial index WHERE oidc_subject IS NOT NULL', () => {
    setupPreMigrationDb(sqlite);
    runTargetMigration(sqlite);

    const row = sqlite
      .prepare("SELECT sql FROM sqlite_master WHERE type='index' AND name='idx_users_oidc_lookup'")
      .get() as { sql: string };
    expect(row.sql).toMatch(/CREATE UNIQUE INDEX/i);
    expect(row.sql).toContain('WHERE oidc_subject IS NOT NULL');
  });

  it('keeps a legacy auth_provider=oidc row unchanged (no backfill)', () => {
    setupPreMigrationDb(sqlite);
    const id = insertUser('oidc', 'legacy-sub');

    runTargetMigration(sqlite);

    const row = sqlite
      .prepare('SELECT auth_provider, oidc_subject FROM users WHERE id = ?')
      .get(id);
    expect(row).toEqual({ auth_provider: 'oidc', oidc_subject: 'legacy-sub' });
  });

  it('rejects a duplicate oidc_subject even across local and oidc accounts', () => {
    setupPreMigrationDb(sqlite);
    runTargetMigration(sqlite);
    insertUser('local', 'shared-sub');

    expect(() => insertUser('oidc', 'shared-sub')).toThrow(/UNIQUE constraint failed/);
    expect(() => insertUser('local', 'shared-sub')).toThrow(/UNIQUE constraint failed/);
  });

  it('allows multiple rows with NULL oidc_subject', () => {
    setupPreMigrationDb(sqlite);
    runTargetMigration(sqlite);

    insertUser('local', null);
    insertUser('local', null);
    insertUser('oidc', null);

    const { n } = sqlite.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number };
    expect(n).toBe(3);
  });

  it('is a no-op when run a second time through the migration runner', () => {
    runMigrations(sqlite);
    const before = sqlite.prepare('SELECT COUNT(*) AS n FROM _migrations').get() as { n: number };
    expect(
      sqlite.prepare('SELECT name FROM _migrations WHERE name = ?').get(TARGET_MIGRATION),
    ).toBeDefined();

    expect(() => runMigrations(sqlite)).not.toThrow();

    const after = sqlite.prepare('SELECT COUNT(*) AS n FROM _migrations').get() as { n: number };
    expect(after.n).toBe(before.n);
    expect(indexColumns(sqlite)).toEqual(['oidc_subject']);
  });
});
