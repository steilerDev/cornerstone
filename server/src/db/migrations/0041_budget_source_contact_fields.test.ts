/**
 * Migration integration tests for 0041_budget_source_contact_fields.sql
 *
 * Tests that:
 *   1. Applies on an empty budget_sources table without error
 *   2. Preserves an existing (pre-migration) budget_sources row — new columns default to null (no backfill)
 *   3. INSERT with reference + contact_address values succeeds and persists them
 *   4. INSERT omitting reference/contact_address defaults both to null (nullable, no NOT NULL constraint)
 *   5. Applying the migration a second time is a no-op (tracked via _migrations, idempotent)
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
const TARGET_MIGRATION = '0041_budget_source_contact_fields.sql';

/**
 * Apply every migration that sorts before TARGET_MIGRATION (derived dynamically from the
 * real migrations directory, so this stays correct as new migrations are added over time).
 */
function setupPreMigrationDb(db: Database.Database): void {
  const allFiles = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  const preFiles = allFiles.filter((f) => f < TARGET_MIGRATION);

  const tempDir = mkdtempSync(join(tmpdir(), 'cs-mig-0041-test-'));
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

function insertBudgetSourceRaw(
  db: Database.Database,
  id: string,
  extra: Record<string, unknown> = {},
): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO budget_sources
       (id, name, source_type, total_amount, is_discretionary, status, created_at, updated_at)
     VALUES (?, ?, 'bank_loan', 100000, 0, 'active', ?, ?)`,
  ).run(id, extra.name ?? 'Test Source', now, now);
}

describe('Migration 0041: Add contact fields to budget_sources', () => {
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

  it('applies without error on a freshly-migrated database (only the seeded Discretionary Funding row present)', () => {
    setupPreMigrationDb(sqlite);

    // Migration 0021 seeds a system "Discretionary Funding" row — that's the only
    // pre-existing row on a fresh database with no user-created budget sources.
    const countBefore = (
      sqlite.prepare('SELECT COUNT(*) AS cnt FROM budget_sources').get() as { cnt: number }
    ).cnt;
    expect(countBefore).toBe(1);

    expect(() => {
      runTargetMigration(sqlite);
    }).not.toThrow();

    const count = (
      sqlite.prepare('SELECT COUNT(*) AS cnt FROM budget_sources').get() as { cnt: number }
    ).cnt;
    expect(count).toBe(1);
  });

  it('preserves a pre-migration row and defaults reference/contact_address to null (no backfill)', () => {
    setupPreMigrationDb(sqlite);
    insertBudgetSourceRaw(sqlite, 'src-pre', { name: 'Pre-existing Source' });

    runTargetMigration(sqlite);

    const row = sqlite.prepare('SELECT * FROM budget_sources WHERE id = ?').get('src-pre') as {
      id: string;
      name: string;
      reference: string | null;
      contact_address: string | null;
    };

    expect(row.name).toBe('Pre-existing Source');
    expect(row.reference).toBeNull();
    expect(row.contact_address).toBeNull();
  });

  it('INSERT with reference and contact_address values succeeds and persists them', () => {
    setupPreMigrationDb(sqlite);
    runTargetMigration(sqlite);

    const now = new Date().toISOString();
    expect(() => {
      sqlite
        .prepare(
          `INSERT INTO budget_sources
             (id, name, source_type, total_amount, is_discretionary, status, reference, contact_address, created_at, updated_at)
           VALUES ('src-new', 'New Source', 'bank_loan', 50000, 0, 'active', 'Account #12345', '123 Bank St, Springfield', ?, ?)`,
        )
        .run(now, now);
    }).not.toThrow();

    const row = sqlite
      .prepare('SELECT reference, contact_address FROM budget_sources WHERE id = ?')
      .get('src-new') as { reference: string; contact_address: string };

    expect(row.reference).toBe('Account #12345');
    expect(row.contact_address).toBe('123 Bank St, Springfield');
  });

  it('INSERT omitting reference/contact_address defaults both to null (columns are nullable)', () => {
    setupPreMigrationDb(sqlite);
    runTargetMigration(sqlite);

    insertBudgetSourceRaw(sqlite, 'src-omitted');

    const row = sqlite
      .prepare('SELECT reference, contact_address FROM budget_sources WHERE id = ?')
      .get('src-omitted') as { reference: string | null; contact_address: string | null };

    expect(row.reference).toBeNull();
    expect(row.contact_address).toBeNull();
  });

  it('applying the migration a second time is a no-op (idempotent via _migrations)', () => {
    setupPreMigrationDb(sqlite);
    runTargetMigration(sqlite);

    // runMigrations (no custom dir → real migrations dir) should skip 0041 since it's
    // already recorded in _migrations, and must not throw a "duplicate column" error.
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
