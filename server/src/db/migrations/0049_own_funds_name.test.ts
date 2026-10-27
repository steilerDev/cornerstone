/**
 * Migration tests for 0049_own_funds_name.sql (#2242, D10): the system funding source is renamed
 * "Discretionary Funding" -> "Own funds" only while it still carries the default name. Data only.
 *
 * Mutations these tests catch:
 *  - dropping the `is_discretionary = 1` guard (a regular source called "Discretionary Funding"
 *    would be renamed);
 *  - dropping the name guard (a name the user chose would be overwritten);
 *  - not touching `updated_at`; a second run changing anything (idempotence).
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import {
  mkdtempSync,
  rmSync,
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
const TARGET_MIGRATION = '0049_own_funds_name.sql';

function setupPreMigrationDb(db: Database.Database): void {
  const preFiles = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .filter((f) => f < TARGET_MIGRATION);
  const tempDir = mkdtempSync(join(tmpdir(), 'cs-mig-0049-test-'));
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
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function applyTarget(db: Database.Database): void {
  db.exec(readFileSync(join(MIGRATIONS_DIR, TARGET_MIGRATION), 'utf-8'));
}

interface SourceRow {
  id: string;
  name: string;
  updated_at: string;
}

describe('migration 0049_own_funds_name', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    setupPreMigrationDb(db);
  });

  afterEach(() => {
    db.close();
  });

  const row = (id: string) =>
    db.prepare('SELECT id, name, updated_at FROM budget_sources WHERE id = ?').get(id) as
      SourceRow | undefined;

  function insertSource(id: string, name: string, discretionary: 0 | 1): void {
    db.prepare(
      `INSERT INTO budget_sources
         (id, name, source_type, total_amount, status, is_discretionary, created_at, updated_at)
       VALUES (?, ?, 'savings', 100, 'active', ?, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
    ).run(id, name, discretionary);
  }

  it('starts from the seeded system source with the old default name', () => {
    expect(row('discretionary-system')?.name).toBe('Discretionary Funding');
  });

  it('renames the default-named system source to "Own funds" and bumps updated_at', () => {
    applyTarget(db);

    const after = row('discretionary-system')!;
    expect(after.name).toBe('Own funds');
    expect(after.updated_at).not.toBe('2026-01-01T00:00:00.000Z');
  });

  it('keeps a name the user chose for the system source', () => {
    db.prepare(
      "UPDATE budget_sources SET name = 'Family savings' WHERE id = 'discretionary-system'",
    ).run();
    const before = row('discretionary-system')!;

    applyTarget(db);

    expect(row('discretionary-system')).toEqual(before);
  });

  it('leaves a regular source that is called "Discretionary Funding" untouched', () => {
    insertSource('bs-regular', 'Discretionary Funding', 0);

    applyTarget(db);

    expect(row('bs-regular')).toEqual({
      id: 'bs-regular',
      name: 'Discretionary Funding',
      updated_at: '2026-01-01T00:00:00.000Z',
    });
    expect(row('discretionary-system')?.name).toBe('Own funds');
  });

  it('touches no other row and is idempotent', () => {
    insertSource('bs-other', 'Loan Alpha', 0);
    applyTarget(db);
    const once = db.prepare('SELECT * FROM budget_sources ORDER BY id').all();

    applyTarget(db);

    expect(db.prepare('SELECT * FROM budget_sources ORDER BY id').all()).toEqual(once);
    expect(row('bs-other')?.name).toBe('Loan Alpha');
  });

  it('runs as part of the full migration chain', () => {
    const full = new Database(':memory:');
    try {
      runMigrations(full);
      const found = full
        .prepare("SELECT name FROM budget_sources WHERE id = 'discretionary-system'")
        .get() as { name: string };
      expect(found.name).toBe('Own funds');
    } finally {
      full.close();
    }
  });
});
