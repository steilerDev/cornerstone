/**
 * Migration integration tests for 0044_invoice_deposit_budget_source.sql
 *
 * Tests that:
 *   1. Applies without error and adds budget_source_id (nullable) to invoice_deposits
 *   2. Existing rows are unaffected (no backfill) — budget_source_id defaults to NULL
 *   3. INSERT with a valid budget_source_id succeeds and persists
 *   4. budget_source_id accepts NULL (deliberately not backfilled)
 *   5. An invalid (non-existent) budget_source_id is rejected via the FK constraint
 *      (foreign_keys pragma ON, as in production)
 *   6. Deleting the referenced budget_source SETS NULL on invoice_deposits.budget_source_id
 *      (ON DELETE SET NULL), not a cascade delete of the deposit
 *   7. The idx_invoice_deposits_budget_source_id index is created
 *   8. Applying the migration a second time is a no-op (tracked via _migrations, idempotent)
 *
 * Story: #1891 Bank report wizard follow-up
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
import { randomUUID } from 'node:crypto';
import { runMigrations } from '../migrate.js';

const MIGRATIONS_DIR = dirname(fileURLToPath(import.meta.url));
const TARGET_MIGRATION = '0044_invoice_deposit_budget_source.sql';

/**
 * Apply every migration that sorts before TARGET_MIGRATION (derived dynamically from the
 * real migrations directory, so this stays correct as new migrations are added over time).
 */
function setupPreMigrationDb(db: Database.Database): void {
  const allFiles = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  const preFiles = allFiles.filter((f) => f < TARGET_MIGRATION);

  const tempDir = mkdtempSync(join(tmpdir(), 'cs-mig-0044-test-'));
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

function columnExists(db: Database.Database, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.some((r) => r.name === column);
}

function indexExists(db: Database.Database, indexName: string): boolean {
  const result = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='index' AND name=?`)
    .get(indexName) as { name: string } | undefined;
  return result !== undefined;
}

describe('Migration 0044: Add budget_source_id to invoice_deposits', () => {
  let sqlite: Database.Database;
  let counter = 0;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    const originalWarn = console.warn;
    console.warn = () => undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- stash original console.warn for restore
    (sqlite as any).__originalWarn = originalWarn;
    counter = 0;
  });

  afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- restore stashed console.warn
    const originalWarn = (sqlite as any).__originalWarn;
    if (originalWarn) console.warn = originalWarn;
    sqlite.close();
  });

  function ts(): string {
    return new Date(Date.now() + counter++).toISOString();
  }

  function insertBudgetSource(): string {
    const id = `src-${++counter}`;
    const now = ts();
    sqlite
      .prepare(
        `INSERT INTO budget_sources (id, name, source_type, total_amount, status, created_at, updated_at)
         VALUES (?, ?, 'bank_loan', 100000, 'active', ?, ?)`,
      )
      .run(id, 'Test Source', now, now);
    return id;
  }

  function insertVendor(): string {
    const id = `vendor-${++counter}`;
    const now = ts();
    sqlite
      .prepare(`INSERT INTO vendors (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)`)
      .run(id, 'Test Vendor', now, now);
    return id;
  }

  function insertInvoice(vendorId: string): string {
    const id = `inv-${++counter}`;
    const now = ts();
    sqlite
      .prepare(
        `INSERT INTO invoices (id, vendor_id, amount, date, status, created_at, updated_at)
         VALUES (?, ?, 1000, '2026-01-15', 'pending', ?, ?)`,
      )
      .run(id, vendorId, now, now);
    return id;
  }

  function insertDeposit(invoiceId: string, budgetSourceId: string | null = null): string {
    const id = randomUUID();
    const now = ts();
    sqlite
      .prepare(
        `INSERT INTO invoice_deposits
           (id, invoice_id, amount, due_date, status, entry_type, budget_source_id, created_at, updated_at)
         VALUES (?, ?, 100, '2026-01-01', 'pending', 'deposit', ?, ?, ?)`,
      )
      .run(id, invoiceId, budgetSourceId, now, now);
    return id;
  }

  it('applies without error and adds a nullable budget_source_id column', () => {
    setupPreMigrationDb(sqlite);
    expect(columnExists(sqlite, 'invoice_deposits', 'budget_source_id')).toBe(false);

    expect(() => {
      runTargetMigration(sqlite);
    }).not.toThrow();

    expect(columnExists(sqlite, 'invoice_deposits', 'budget_source_id')).toBe(true);
  });

  it('no backfill: a deposit inserted BEFORE the migration has budget_source_id = NULL afterward', () => {
    setupPreMigrationDb(sqlite);
    const vendorId = insertVendor();
    const invoiceId = insertInvoice(vendorId);
    const now = ts();
    const depositId = randomUUID();
    sqlite
      .prepare(
        `INSERT INTO invoice_deposits (id, invoice_id, amount, due_date, status, entry_type, created_at, updated_at)
         VALUES (?, ?, 250, '2026-01-01', 'pending', 'deposit', ?, ?)`,
      )
      .run(depositId, invoiceId, now, now);

    runTargetMigration(sqlite);

    const row = sqlite
      .prepare('SELECT budget_source_id FROM invoice_deposits WHERE id = ?')
      .get(depositId) as { budget_source_id: string | null };
    expect(row.budget_source_id).toBeNull();
  });

  it('INSERT with a valid budget_source_id succeeds and persists', () => {
    setupPreMigrationDb(sqlite);
    runTargetMigration(sqlite);

    const sourceId = insertBudgetSource();
    const vendorId = insertVendor();
    const invoiceId = insertInvoice(vendorId);

    const depositId = insertDeposit(invoiceId, sourceId);

    const row = sqlite
      .prepare('SELECT budget_source_id FROM invoice_deposits WHERE id = ?')
      .get(depositId) as { budget_source_id: string | null };
    expect(row.budget_source_id).toBe(sourceId);
  });

  it('budget_source_id accepts NULL explicitly (untagged deposit remains the default)', () => {
    setupPreMigrationDb(sqlite);
    runTargetMigration(sqlite);

    const vendorId = insertVendor();
    const invoiceId = insertInvoice(vendorId);

    expect(() => insertDeposit(invoiceId, null)).not.toThrow();
  });

  it('an invalid (non-existent) budget_source_id is rejected by the FK constraint', () => {
    setupPreMigrationDb(sqlite);
    runTargetMigration(sqlite);

    const vendorId = insertVendor();
    const invoiceId = insertInvoice(vendorId);

    expect(() => insertDeposit(invoiceId, 'does-not-exist')).toThrow(
      /FOREIGN KEY constraint failed/i,
    );
  });

  it('ON DELETE SET NULL: deleting the referenced budget source un-tags the deposit instead of deleting it', () => {
    setupPreMigrationDb(sqlite);
    runTargetMigration(sqlite);

    const sourceId = insertBudgetSource();
    const vendorId = insertVendor();
    const invoiceId = insertInvoice(vendorId);
    const depositId = insertDeposit(invoiceId, sourceId);

    sqlite.prepare('DELETE FROM budget_sources WHERE id = ?').run(sourceId);

    const row = sqlite
      .prepare('SELECT id, budget_source_id FROM invoice_deposits WHERE id = ?')
      .get(depositId) as { id: string; budget_source_id: string | null } | undefined;

    // The deposit row must still exist (not cascade-deleted)...
    expect(row).toBeDefined();
    // ...but its budget_source_id is now NULL.
    expect(row!.budget_source_id).toBeNull();
  });

  it('creates the idx_invoice_deposits_budget_source_id index', () => {
    setupPreMigrationDb(sqlite);
    runTargetMigration(sqlite);

    expect(indexExists(sqlite, 'idx_invoice_deposits_budget_source_id')).toBe(true);
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
