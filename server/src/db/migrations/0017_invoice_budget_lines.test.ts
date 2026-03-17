/**
 * Migration integration tests for 0017_invoice_budget_lines.sql
 *
 * Tests that:
 *   1. Fresh DB: all migrations 0001-0017 apply without error; invoice_budget_lines table exists
 *   2. invoices table has NO work_item_budget_id or household_item_budget_id columns after migration
 *   3. Data migration: invoice with work_item_budget_id creates a junction row with correct fields
 *   4. Data migration: invoice with household_item_budget_id creates a junction row with correct fields
 *   5. Data migration: invoice with both FKs NULL produces no junction rows
 *   6. XOR CHECK constraint: cannot insert a junction row with both FK columns non-null
 *   7. itemized_amount > 0 CHECK constraint: rejects 0 and negative values
 *   8. Partial UNIQUE index (work_item_budget_id): each budget line can link to at most one invoice
 *   9. Partial UNIQUE index (household_item_budget_id): same for HI budget lines
 *  10. CASCADE delete from invoice removes junction rows
 *  11. CASCADE delete from budget line removes junction rows
 *  12. Idempotency: running migrator twice on fresh DB does not error
 *  13. invoice_budget_lines table structure and indexes are correct
 *  14. invoices table indexes are recreated correctly after table rebuild
 *
 * EPIC-15 Story 15.1: Invoice-Budget-Line Junction Schema & Migration
 * See ADR-018 for architectural rationale.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { mkdtempSync, symlinkSync, unlinkSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { runMigrations } from '../migrate.js';

// This test file lives IN the migrations directory, so resolve to that path.
const MIGRATIONS_DIR = dirname(fileURLToPath(import.meta.url));

// ── Helper: apply migrations 0001-0016 only (pre-0017 state) ─────────────────
//
// Strategy: create a temp directory with symlinks to 0001-0016 migration files.
// Then call runMigrations() with that temp dir — it applies only those files.
// After inserting test data, read 0017 directly and exec it.

const PRE_0017_MIGRATIONS = [
  '0001_create_users_and_sessions.sql',
  '0002_create_work_items.sql',
  '0003_create_budget_tables.sql',
  '0004_add_work_item_budget_fields.sql',
  '0005_budget_rework.sql',
  '0006_milestones.sql',
  '0007_milestone_dependencies.sql',
  '0008_actual_dates_and_status.sql',
  '0009_document_links.sql',
  '0010_household_items.sql',
  '0011_household_item_invoice_link.sql',
  '0012_household_item_deps.sql',
  '0013_drop_hi_dep_cpm_columns.sql',
  '0014_rename_hi_status_values.sql',
  '0015_hi_delivery_date_redesign.sql',
  '0016_household_item_categories.sql',
];

/**
 * Apply migrations 0001-0016 to a fresh in-memory DB.
 * Used for data migration tests that need to insert pre-0017 data
 * before migration 0017 runs.
 */
function setupPreMigrationDb(db: Database.Database): void {
  const tempDir = mkdtempSync(join(tmpdir(), 'cs-mig-test-'));
  const symlinks: string[] = [];

  for (const file of PRE_0017_MIGRATIONS) {
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

/**
 * Apply migration 0017 directly on a DB that already has 0001-0016 applied.
 * Reads the SQL file and executes it, then records the migration as applied.
 */
function runMigration0017(db: Database.Database): void {
  const sql = readFileSync(join(MIGRATIONS_DIR, '0017_invoice_budget_lines.sql'), 'utf-8');
  db.exec(sql);
  db.prepare('INSERT OR IGNORE INTO _migrations (name) VALUES (?)').run(
    '0017_invoice_budget_lines.sql',
  );
}

// ── Minimal insert helpers ────────────────────────────────────────────────────

function insertUser(db: Database.Database, id: string): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO users (id, email, display_name, role, auth_provider, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, `${id}@example.com`, `User ${id}`, 'member', 'local', now, now);
}

function insertVendor(db: Database.Database, id: string): void {
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO vendors (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)`).run(
    id,
    `Vendor ${id}`,
    now,
    now,
  );
}

function insertWorkItem(db: Database.Database, id: string): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO work_items (id, title, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
  ).run(id, `Work Item ${id}`, 'not_started', now, now);
}

function insertWorkItemBudget(db: Database.Database, id: string, workItemId: string): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO work_item_budgets (id, work_item_id, planned_amount, confidence, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, workItemId, 1000.0, 'quote', now, now);
}

function insertHouseholdItem(db: Database.Database, id: string): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO household_items (id, name, category_id, status, quantity, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, `Item ${id}`, 'hic-other', 'planned', 1, now, now);
}

function insertHouseholdItemBudget(
  db: Database.Database,
  id: string,
  householdItemId: string,
): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO household_item_budgets (id, household_item_id, planned_amount, confidence, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, householdItemId, 500.0, 'own_estimate', now, now);
}

/**
 * Insert an invoice row using the PRE-0017 schema (which still has the budget FK columns).
 * Only callable on a DB that has 0001-0016 applied.
 */
function insertInvoicePre0017(
  db: Database.Database,
  id: string,
  vendorId: string,
  amount: number,
  overrides: Record<string, unknown> = {},
): void {
  const now = new Date().toISOString();
  const row: Record<string, unknown> = {
    id,
    vendor_id: vendorId,
    amount,
    date: '2026-01-15',
    status: 'pending',
    work_item_budget_id: null,
    household_item_budget_id: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
  db.prepare(
    `INSERT INTO invoices
       (id, vendor_id, amount, date, status, work_item_budget_id, household_item_budget_id, created_at, updated_at)
     VALUES
       (@id, @vendor_id, @amount, @date, @status, @work_item_budget_id, @household_item_budget_id, @created_at, @updated_at)`,
  ).run(row);
}

/**
 * Insert an invoice row using the POST-0017 schema (budget FK columns removed).
 * Only callable on a DB that has all 0001-0017 applied.
 */
function insertInvoicePost0017(
  db: Database.Database,
  id: string,
  vendorId: string,
  amount: number,
): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO invoices (id, vendor_id, amount, date, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, vendorId, amount, '2026-01-15', 'pending', now, now);
}

/**
 * Insert a junction row in invoice_budget_lines (post-0017 schema).
 */
function insertJunctionRow(
  db: Database.Database,
  id: string,
  invoiceId: string,
  opts: {
    workItemBudgetId?: string | null;
    householdItemBudgetId?: string | null;
    itemizedAmount?: number;
  } = {},
): void {
  const { workItemBudgetId = null, householdItemBudgetId = null, itemizedAmount = 100.0 } = opts;
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO invoice_budget_lines
       (id, invoice_id, work_item_budget_id, household_item_budget_id, itemized_amount, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, invoiceId, workItemBudgetId, householdItemBudgetId, itemizedAmount, now, now);
}

// ══════════════════════════════════════════════════════════════════════════════
// Test suite
// ══════════════════════════════════════════════════════════════════════════════

describe('Migration 0017: Invoice-Budget-Line Junction Table', () => {
  let sqlite: Database.Database;

  function createFullDb(): Database.Database {
    const db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    runMigrations(db);
    return db;
  }

  beforeEach(() => {
    sqlite = createFullDb();
  });

  afterEach(() => {
    sqlite.close();
  });

  // ── 1. Migration execution ─────────────────────────────────────────────────

  describe('migration execution', () => {
    it('applies all migrations 0001-0017 on a fresh database without error', () => {
      const applied = sqlite.prepare('SELECT name FROM _migrations ORDER BY name').all() as Array<{
        name: string;
      }>;
      const names = applied.map((r) => r.name);

      expect(names).toContain('0001_create_users_and_sessions.sql');
      expect(names).toContain('0005_budget_rework.sql');
      expect(names).toContain('0010_household_items.sql');
      expect(names).toContain('0011_household_item_invoice_link.sql');
      expect(names).toContain('0016_household_item_categories.sql');
      expect(names).toContain('0017_invoice_budget_lines.sql');
    });

    it('creates the invoice_budget_lines table', () => {
      const table = sqlite
        .prepare(
          `SELECT name FROM sqlite_master WHERE type='table' AND name='invoice_budget_lines'`,
        )
        .get() as { name: string } | undefined;

      expect(table).toBeDefined();
      expect(table!.name).toBe('invoice_budget_lines');
    });
  });

  // ── 2. invoices table column removal ──────────────────────────────────────

  describe('invoices table after migration', () => {
    it('does NOT have work_item_budget_id column after migration', () => {
      const columns = sqlite.prepare("PRAGMA table_info('invoices')").all() as Array<{
        name: string;
      }>;
      const colNames = columns.map((c) => c.name);

      expect(colNames).not.toContain('work_item_budget_id');
    });

    it('does NOT have household_item_budget_id column after migration', () => {
      const columns = sqlite.prepare("PRAGMA table_info('invoices')").all() as Array<{
        name: string;
      }>;
      const colNames = columns.map((c) => c.name);

      expect(colNames).not.toContain('household_item_budget_id');
    });

    it('retains all other expected invoices columns', () => {
      const columns = sqlite.prepare("PRAGMA table_info('invoices')").all() as Array<{
        name: string;
      }>;
      const colNames = columns.map((c) => c.name);

      expect(colNames).toContain('id');
      expect(colNames).toContain('vendor_id');
      expect(colNames).toContain('invoice_number');
      expect(colNames).toContain('amount');
      expect(colNames).toContain('date');
      expect(colNames).toContain('due_date');
      expect(colNames).toContain('status');
      expect(colNames).toContain('notes');
      expect(colNames).toContain('created_by');
      expect(colNames).toContain('created_at');
      expect(colNames).toContain('updated_at');
    });
  });

  // ── 3. invoice_budget_lines table structure ────────────────────────────────

  describe('invoice_budget_lines table structure', () => {
    it('has all required columns with correct types and nullability', () => {
      const columns = sqlite.prepare("PRAGMA table_info('invoice_budget_lines')").all() as Array<{
        name: string;
        type: string;
        notnull: number;
        pk: number;
      }>;
      const colMap = new Map(columns.map((c) => [c.name, c]));

      expect(colMap.get('id')?.pk).toBe(1);
      expect(colMap.get('id')?.type).toBe('TEXT');
      expect(colMap.get('invoice_id')?.notnull).toBe(1);
      expect(colMap.get('invoice_id')?.type).toBe('TEXT');
      expect(colMap.get('itemized_amount')?.notnull).toBe(1);
      expect(colMap.get('itemized_amount')?.type).toBe('REAL');
      expect(colMap.get('created_at')?.notnull).toBe(1);
      expect(colMap.get('updated_at')?.notnull).toBe(1);
      expect(colMap.get('work_item_budget_id')?.notnull).toBe(0);
      expect(colMap.get('household_item_budget_id')?.notnull).toBe(0);
    });
  });

  // ── 4. invoice_budget_lines indexes ──────────────────────────────────────

  describe('invoice_budget_lines indexes', () => {
    it('creates idx_invoice_budget_lines_invoice_id index', () => {
      const indexes = sqlite
        .prepare(
          `SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='invoice_budget_lines'`,
        )
        .all() as Array<{ name: string }>;
      const indexNames = indexes.map((i) => i.name);

      expect(indexNames).toContain('idx_invoice_budget_lines_invoice_id');
    });

    it('creates partial UNIQUE index on work_item_budget_id', () => {
      const indexes = sqlite
        .prepare(
          `SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='invoice_budget_lines'`,
        )
        .all() as Array<{ name: string }>;
      const indexNames = indexes.map((i) => i.name);

      expect(indexNames).toContain('idx_invoice_budget_lines_work_item_budget_id');
    });

    it('creates partial UNIQUE index on household_item_budget_id', () => {
      const indexes = sqlite
        .prepare(
          `SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='invoice_budget_lines'`,
        )
        .all() as Array<{ name: string }>;
      const indexNames = indexes.map((i) => i.name);

      expect(indexNames).toContain('idx_invoice_budget_lines_household_item_budget_id');
    });

    it('partial UNIQUE index on work_item_budget_id uses WHERE clause', () => {
      const indexDdl = sqlite
        .prepare(
          `SELECT sql FROM sqlite_master
           WHERE type='index' AND name='idx_invoice_budget_lines_work_item_budget_id'`,
        )
        .get() as { sql: string } | undefined;

      expect(indexDdl).toBeDefined();
      expect(indexDdl!.sql).toMatch(/WHERE\s+work_item_budget_id\s+IS\s+NOT\s+NULL/i);
    });

    it('partial UNIQUE index on household_item_budget_id uses WHERE clause', () => {
      const indexDdl = sqlite
        .prepare(
          `SELECT sql FROM sqlite_master
           WHERE type='index' AND name='idx_invoice_budget_lines_household_item_budget_id'`,
        )
        .get() as { sql: string } | undefined;

      expect(indexDdl).toBeDefined();
      expect(indexDdl!.sql).toMatch(/WHERE\s+household_item_budget_id\s+IS\s+NOT\s+NULL/i);
    });
  });

  // ── 5. invoices indexes after table rebuild ────────────────────────────────

  describe('invoices indexes after table rebuild', () => {
    it('recreates idx_invoices_vendor_id', () => {
      const indexes = sqlite
        .prepare(`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='invoices'`)
        .all() as Array<{ name: string }>;
      const indexNames = indexes.map((i) => i.name);

      expect(indexNames).toContain('idx_invoices_vendor_id');
    });

    it('recreates idx_invoices_status', () => {
      const indexes = sqlite
        .prepare(`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='invoices'`)
        .all() as Array<{ name: string }>;
      const indexNames = indexes.map((i) => i.name);

      expect(indexNames).toContain('idx_invoices_status');
    });

    it('recreates idx_invoices_date', () => {
      const indexes = sqlite
        .prepare(`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='invoices'`)
        .all() as Array<{ name: string }>;
      const indexNames = indexes.map((i) => i.name);

      expect(indexNames).toContain('idx_invoices_date');
    });

    it('does NOT retain idx_invoices_work_item_budget_id (removed by migration)', () => {
      const indexes = sqlite
        .prepare(`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='invoices'`)
        .all() as Array<{ name: string }>;
      const indexNames = indexes.map((i) => i.name);

      expect(indexNames).not.toContain('idx_invoices_work_item_budget_id');
    });

    it('does NOT retain idx_invoices_household_item_budget_id (removed by migration)', () => {
      const indexes = sqlite
        .prepare(`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='invoices'`)
        .all() as Array<{ name: string }>;
      const indexNames = indexes.map((i) => i.name);

      expect(indexNames).not.toContain('idx_invoices_household_item_budget_id');
    });
  });

  // ── 6. Data migration — work item budget link ──────────────────────────────

  describe('data migration: work_item_budget_id link', () => {
    it('creates a junction row for each invoice with work_item_budget_id set', () => {
      const db = new Database(':memory:');
      db.pragma('journal_mode = WAL');
      db.pragma('foreign_keys = ON');
      setupPreMigrationDb(db);

      insertVendor(db, 'v-wib-1');
      insertWorkItem(db, 'wi-wib-1');
      insertWorkItemBudget(db, 'wib-1', 'wi-wib-1');
      insertInvoicePre0017(db, 'inv-wib-1', 'v-wib-1', 250.0, {
        work_item_budget_id: 'wib-1',
      });

      runMigration0017(db);

      const junctionRows = db
        .prepare(`SELECT * FROM invoice_budget_lines WHERE invoice_id = ?`)
        .all('inv-wib-1') as Array<Record<string, unknown>>;

      expect(junctionRows).toHaveLength(1);
      expect(junctionRows[0].invoice_id).toBe('inv-wib-1');
      expect(junctionRows[0].work_item_budget_id).toBe('wib-1');
      expect(junctionRows[0].household_item_budget_id).toBeNull();
      expect(junctionRows[0].itemized_amount).toBe(250.0);

      db.close();
    });

    it('sets itemized_amount equal to the invoice amount for migrated rows', () => {
      const db = new Database(':memory:');
      db.pragma('journal_mode = WAL');
      db.pragma('foreign_keys = ON');
      setupPreMigrationDb(db);

      insertVendor(db, 'v-amt-1');
      insertWorkItem(db, 'wi-amt-1');
      insertWorkItemBudget(db, 'wib-amt-1', 'wi-amt-1');
      insertInvoicePre0017(db, 'inv-amt-1', 'v-amt-1', 1337.5, {
        work_item_budget_id: 'wib-amt-1',
      });

      runMigration0017(db);

      const row = db
        .prepare(`SELECT itemized_amount FROM invoice_budget_lines WHERE invoice_id = ?`)
        .get('inv-amt-1') as { itemized_amount: number } | undefined;

      expect(row).toBeDefined();
      expect(row!.itemized_amount).toBeCloseTo(1337.5, 2);

      db.close();
    });

    it('migrated junction row has a non-null surrogate id (UUID generated by migration SQL)', () => {
      const db = new Database(':memory:');
      db.pragma('journal_mode = WAL');
      db.pragma('foreign_keys = ON');
      setupPreMigrationDb(db);

      insertVendor(db, 'v-uuid-1');
      insertWorkItem(db, 'wi-uuid-1');
      insertWorkItemBudget(db, 'wib-uuid-1', 'wi-uuid-1');
      insertInvoicePre0017(db, 'inv-uuid-1', 'v-uuid-1', 99.0, {
        work_item_budget_id: 'wib-uuid-1',
      });

      runMigration0017(db);

      const row = db
        .prepare(`SELECT id FROM invoice_budget_lines WHERE invoice_id = ?`)
        .get('inv-uuid-1') as { id: string } | undefined;

      expect(row).toBeDefined();
      expect(typeof row!.id).toBe('string');
      expect(row!.id.length).toBeGreaterThan(0);

      db.close();
    });

    it('invoices row no longer has work_item_budget_id column after migration', () => {
      const db = new Database(':memory:');
      db.pragma('journal_mode = WAL');
      db.pragma('foreign_keys = ON');
      setupPreMigrationDb(db);

      insertVendor(db, 'v-col-check-1');
      insertWorkItem(db, 'wi-col-check-1');
      insertWorkItemBudget(db, 'wib-col-check-1', 'wi-col-check-1');
      insertInvoicePre0017(db, 'inv-col-check-1', 'v-col-check-1', 150.0, {
        work_item_budget_id: 'wib-col-check-1',
      });

      runMigration0017(db);

      const columns = db.prepare("PRAGMA table_info('invoices')").all() as Array<{ name: string }>;
      const colNames = columns.map((c) => c.name);

      expect(colNames).not.toContain('work_item_budget_id');

      db.close();
    });

    it('multiple invoices with different work item budget links each get their own junction row', () => {
      const db = new Database(':memory:');
      db.pragma('journal_mode = WAL');
      db.pragma('foreign_keys = ON');
      setupPreMigrationDb(db);

      insertVendor(db, 'v-multi-wi-1');
      insertWorkItem(db, 'wi-multi-1');
      insertWorkItem(db, 'wi-multi-2');
      insertWorkItemBudget(db, 'wib-multi-1', 'wi-multi-1');
      insertWorkItemBudget(db, 'wib-multi-2', 'wi-multi-2');
      insertInvoicePre0017(db, 'inv-multi-wi-1', 'v-multi-wi-1', 100.0, {
        work_item_budget_id: 'wib-multi-1',
      });
      insertInvoicePre0017(db, 'inv-multi-wi-2', 'v-multi-wi-1', 200.0, {
        work_item_budget_id: 'wib-multi-2',
      });

      runMigration0017(db);

      const junctionRows = db
        .prepare(
          `SELECT invoice_id, work_item_budget_id, itemized_amount
           FROM invoice_budget_lines ORDER BY invoice_id`,
        )
        .all() as Array<Record<string, unknown>>;

      expect(junctionRows).toHaveLength(2);
      expect(junctionRows[0].invoice_id).toBe('inv-multi-wi-1');
      expect(junctionRows[0].work_item_budget_id).toBe('wib-multi-1');
      expect(junctionRows[0].itemized_amount).toBe(100.0);
      expect(junctionRows[1].invoice_id).toBe('inv-multi-wi-2');
      expect(junctionRows[1].work_item_budget_id).toBe('wib-multi-2');
      expect(junctionRows[1].itemized_amount).toBe(200.0);

      db.close();
    });
  });

  // ── 7. Data migration — household item budget link ─────────────────────────

  describe('data migration: household_item_budget_id link', () => {
    it('creates a junction row for each invoice with household_item_budget_id set', () => {
      const db = new Database(':memory:');
      db.pragma('journal_mode = WAL');
      db.pragma('foreign_keys = ON');
      setupPreMigrationDb(db);

      insertVendor(db, 'v-hib-1');
      insertHouseholdItem(db, 'hi-hib-1');
      insertHouseholdItemBudget(db, 'hib-1', 'hi-hib-1');
      insertInvoicePre0017(db, 'inv-hib-1', 'v-hib-1', 400.0, {
        household_item_budget_id: 'hib-1',
      });

      runMigration0017(db);

      const junctionRows = db
        .prepare(`SELECT * FROM invoice_budget_lines WHERE invoice_id = ?`)
        .all('inv-hib-1') as Array<Record<string, unknown>>;

      expect(junctionRows).toHaveLength(1);
      expect(junctionRows[0].invoice_id).toBe('inv-hib-1');
      expect(junctionRows[0].work_item_budget_id).toBeNull();
      expect(junctionRows[0].household_item_budget_id).toBe('hib-1');
      expect(junctionRows[0].itemized_amount).toBe(400.0);

      db.close();
    });

    it('sets itemized_amount equal to the invoice amount for HI migrated rows', () => {
      const db = new Database(':memory:');
      db.pragma('journal_mode = WAL');
      db.pragma('foreign_keys = ON');
      setupPreMigrationDb(db);

      insertVendor(db, 'v-hib-amt-1');
      insertHouseholdItem(db, 'hi-hib-amt-1');
      insertHouseholdItemBudget(db, 'hib-amt-1', 'hi-hib-amt-1');
      insertInvoicePre0017(db, 'inv-hib-amt-1', 'v-hib-amt-1', 888.88, {
        household_item_budget_id: 'hib-amt-1',
      });

      runMigration0017(db);

      const row = db
        .prepare(`SELECT itemized_amount FROM invoice_budget_lines WHERE invoice_id = ?`)
        .get('inv-hib-amt-1') as { itemized_amount: number } | undefined;

      expect(row).toBeDefined();
      expect(row!.itemized_amount).toBeCloseTo(888.88, 2);

      db.close();
    });

    it('invoices row no longer has household_item_budget_id column after migration', () => {
      const db = new Database(':memory:');
      db.pragma('journal_mode = WAL');
      db.pragma('foreign_keys = ON');
      setupPreMigrationDb(db);

      insertVendor(db, 'v-hib-col-1');
      insertHouseholdItem(db, 'hi-hib-col-1');
      insertHouseholdItemBudget(db, 'hib-col-1', 'hi-hib-col-1');
      insertInvoicePre0017(db, 'inv-hib-col-1', 'v-hib-col-1', 200.0, {
        household_item_budget_id: 'hib-col-1',
      });

      runMigration0017(db);

      const columns = db.prepare("PRAGMA table_info('invoices')").all() as Array<{ name: string }>;
      const colNames = columns.map((c) => c.name);

      expect(colNames).not.toContain('household_item_budget_id');

      db.close();
    });
  });

  // ── 8. Data migration — unlinked invoices ─────────────────────────────────

  describe('data migration: invoices with no budget links', () => {
    it('produces no junction rows for invoices where both FKs are NULL', () => {
      const db = new Database(':memory:');
      db.pragma('journal_mode = WAL');
      db.pragma('foreign_keys = ON');
      setupPreMigrationDb(db);

      insertVendor(db, 'v-nofk-1');
      insertInvoicePre0017(db, 'inv-nofk-1', 'v-nofk-1', 100.0);
      insertInvoicePre0017(db, 'inv-nofk-2', 'v-nofk-1', 200.0);

      runMigration0017(db);

      const junctionRows = db.prepare(`SELECT * FROM invoice_budget_lines`).all() as Array<
        Record<string, unknown>
      >;

      expect(junctionRows).toHaveLength(0);

      db.close();
    });

    it('unlinked invoices are preserved in the invoices table after migration', () => {
      const db = new Database(':memory:');
      db.pragma('journal_mode = WAL');
      db.pragma('foreign_keys = ON');
      setupPreMigrationDb(db);

      insertVendor(db, 'v-preserve-1');
      insertInvoicePre0017(db, 'inv-preserve-1', 'v-preserve-1', 750.0);

      runMigration0017(db);

      const inv = db.prepare(`SELECT * FROM invoices WHERE id = ?`).get('inv-preserve-1') as
        | Record<string, unknown>
        | undefined;

      expect(inv).toBeDefined();
      expect(inv!.amount).toBe(750.0);
      expect(inv!.vendor_id).toBe('v-preserve-1');
      expect(inv!.status).toBe('pending');

      db.close();
    });

    it('mix of linked and unlinked invoices produces junction rows only for linked ones', () => {
      const db = new Database(':memory:');
      db.pragma('journal_mode = WAL');
      db.pragma('foreign_keys = ON');
      setupPreMigrationDb(db);

      insertVendor(db, 'v-mix-1');
      insertWorkItem(db, 'wi-mix-1');
      insertWorkItemBudget(db, 'wib-mix-1', 'wi-mix-1');

      insertInvoicePre0017(db, 'inv-mix-linked', 'v-mix-1', 300.0, {
        work_item_budget_id: 'wib-mix-1',
      });
      insertInvoicePre0017(db, 'inv-mix-unlinked', 'v-mix-1', 150.0);

      runMigration0017(db);

      const junctionRows = db
        .prepare(`SELECT invoice_id FROM invoice_budget_lines`)
        .all() as Array<{ invoice_id: string }>;

      expect(junctionRows).toHaveLength(1);
      expect(junctionRows[0].invoice_id).toBe('inv-mix-linked');

      db.close();
    });
  });

  // ── 8b. Data migration — deduplication of shared budget lines ─────────────

  describe('data migration: deduplication when multiple invoices share a budget line', () => {
    it('keeps only the most recent invoice per work_item_budget_id', () => {
      const db = new Database(':memory:');
      db.pragma('journal_mode = WAL');
      db.pragma('foreign_keys = ON');
      setupPreMigrationDb(db);

      insertVendor(db, 'v-dedup-wi');
      insertWorkItem(db, 'wi-dedup-1');
      insertWorkItemBudget(db, 'wib-dedup-1', 'wi-dedup-1');

      // Insert two invoices sharing the same work_item_budget_id with different created_at
      insertInvoicePre0017(db, 'inv-dedup-old', 'v-dedup-wi', 100.0, {
        work_item_budget_id: 'wib-dedup-1',
        created_at: '2026-01-01T00:00:00.000Z',
      });
      insertInvoicePre0017(db, 'inv-dedup-new', 'v-dedup-wi', 200.0, {
        work_item_budget_id: 'wib-dedup-1',
        created_at: '2026-02-01T00:00:00.000Z',
      });

      // Migration should not throw a UNIQUE constraint error
      runMigration0017(db);

      const junctionRows = db
        .prepare(
          `SELECT invoice_id, work_item_budget_id, itemized_amount
           FROM invoice_budget_lines WHERE work_item_budget_id = ?`,
        )
        .all('wib-dedup-1') as Array<Record<string, unknown>>;

      expect(junctionRows).toHaveLength(1);
      expect(junctionRows[0].invoice_id).toBe('inv-dedup-new');
      expect(junctionRows[0].itemized_amount).toBe(200.0);

      db.close();
    });

    it('keeps only the most recent invoice per household_item_budget_id', () => {
      const db = new Database(':memory:');
      db.pragma('journal_mode = WAL');
      db.pragma('foreign_keys = ON');
      setupPreMigrationDb(db);

      insertVendor(db, 'v-dedup-hi');
      insertHouseholdItem(db, 'hi-dedup-1');
      insertHouseholdItemBudget(db, 'hib-dedup-1', 'hi-dedup-1');

      // Insert two invoices sharing the same household_item_budget_id
      insertInvoicePre0017(db, 'inv-dedup-hi-old', 'v-dedup-hi', 300.0, {
        household_item_budget_id: 'hib-dedup-1',
        created_at: '2026-01-01T00:00:00.000Z',
      });
      insertInvoicePre0017(db, 'inv-dedup-hi-new', 'v-dedup-hi', 400.0, {
        household_item_budget_id: 'hib-dedup-1',
        created_at: '2026-02-01T00:00:00.000Z',
      });

      runMigration0017(db);

      const junctionRows = db
        .prepare(
          `SELECT invoice_id, household_item_budget_id, itemized_amount
           FROM invoice_budget_lines WHERE household_item_budget_id = ?`,
        )
        .all('hib-dedup-1') as Array<Record<string, unknown>>;

      expect(junctionRows).toHaveLength(1);
      expect(junctionRows[0].invoice_id).toBe('inv-dedup-hi-new');
      expect(junctionRows[0].itemized_amount).toBe(400.0);

      db.close();
    });

    it('deduplication does not affect budget lines with only one invoice', () => {
      const db = new Database(':memory:');
      db.pragma('journal_mode = WAL');
      db.pragma('foreign_keys = ON');
      setupPreMigrationDb(db);

      insertVendor(db, 'v-dedup-mix');
      insertWorkItem(db, 'wi-dedup-mix-1');
      insertWorkItem(db, 'wi-dedup-mix-2');
      insertWorkItemBudget(db, 'wib-dedup-mix-1', 'wi-dedup-mix-1');
      insertWorkItemBudget(db, 'wib-dedup-mix-2', 'wi-dedup-mix-2');

      // Two invoices sharing wib-dedup-mix-1
      insertInvoicePre0017(db, 'inv-dedup-mix-old', 'v-dedup-mix', 100.0, {
        work_item_budget_id: 'wib-dedup-mix-1',
        created_at: '2026-01-01T00:00:00.000Z',
      });
      insertInvoicePre0017(db, 'inv-dedup-mix-new', 'v-dedup-mix', 150.0, {
        work_item_budget_id: 'wib-dedup-mix-1',
        created_at: '2026-02-01T00:00:00.000Z',
      });
      // One invoice with unique wib-dedup-mix-2
      insertInvoicePre0017(db, 'inv-dedup-mix-solo', 'v-dedup-mix', 250.0, {
        work_item_budget_id: 'wib-dedup-mix-2',
      });

      runMigration0017(db);

      const allRows = db
        .prepare(
          `SELECT invoice_id, work_item_budget_id, itemized_amount
           FROM invoice_budget_lines ORDER BY work_item_budget_id`,
        )
        .all() as Array<Record<string, unknown>>;

      expect(allRows).toHaveLength(2);

      const deduped = allRows.find((r) => r.work_item_budget_id === 'wib-dedup-mix-1');
      expect(deduped).toBeDefined();
      expect(deduped!.invoice_id).toBe('inv-dedup-mix-new');

      const solo = allRows.find((r) => r.work_item_budget_id === 'wib-dedup-mix-2');
      expect(solo).toBeDefined();
      expect(solo!.invoice_id).toBe('inv-dedup-mix-solo');

      db.close();
    });
  });

  // ── 9. XOR CHECK constraint ────────────────────────────────────────────────

  describe('XOR CHECK constraint (exactly one FK must be non-null)', () => {
    it('rejects a junction row with both work_item_budget_id AND household_item_budget_id non-null', () => {
      insertVendor(sqlite, 'v-xor-1');
      insertWorkItem(sqlite, 'wi-xor-1');
      insertWorkItemBudget(sqlite, 'wib-xor-1', 'wi-xor-1');
      insertHouseholdItem(sqlite, 'hi-xor-1');
      insertHouseholdItemBudget(sqlite, 'hib-xor-1', 'hi-xor-1');
      insertInvoicePost0017(sqlite, 'inv-xor-1', 'v-xor-1', 100.0);

      const now = new Date().toISOString();
      let error: Error | undefined;
      try {
        sqlite
          .prepare(
            `INSERT INTO invoice_budget_lines
               (id, invoice_id, work_item_budget_id, household_item_budget_id, itemized_amount, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .run('jxor-both', 'inv-xor-1', 'wib-xor-1', 'hib-xor-1', 50.0, now, now);
      } catch (err) {
        error = err as Error;
      }

      expect(error).toBeDefined();
      expect(error!.message).toMatch(/CHECK constraint failed/);
    });

    it('rejects a junction row with BOTH FKs NULL', () => {
      insertVendor(sqlite, 'v-xor-2');
      insertInvoicePost0017(sqlite, 'inv-xor-2', 'v-xor-2', 100.0);

      const now = new Date().toISOString();
      let error: Error | undefined;
      try {
        sqlite
          .prepare(
            `INSERT INTO invoice_budget_lines
               (id, invoice_id, work_item_budget_id, household_item_budget_id, itemized_amount, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .run('jxor-neither', 'inv-xor-2', null, null, 50.0, now, now);
      } catch (err) {
        error = err as Error;
      }

      expect(error).toBeDefined();
      expect(error!.message).toMatch(/CHECK constraint failed/);
    });

    it('accepts a junction row with only work_item_budget_id non-null', () => {
      insertVendor(sqlite, 'v-xor-3');
      insertWorkItem(sqlite, 'wi-xor-3');
      insertWorkItemBudget(sqlite, 'wib-xor-3', 'wi-xor-3');
      insertInvoicePost0017(sqlite, 'inv-xor-3', 'v-xor-3', 100.0);

      expect(() => {
        insertJunctionRow(sqlite, 'jxor-wi-only', 'inv-xor-3', {
          workItemBudgetId: 'wib-xor-3',
          itemizedAmount: 100.0,
        });
      }).not.toThrow();
    });

    it('accepts a junction row with only household_item_budget_id non-null', () => {
      insertVendor(sqlite, 'v-xor-4');
      insertHouseholdItem(sqlite, 'hi-xor-4');
      insertHouseholdItemBudget(sqlite, 'hib-xor-4', 'hi-xor-4');
      insertInvoicePost0017(sqlite, 'inv-xor-4', 'v-xor-4', 100.0);

      expect(() => {
        insertJunctionRow(sqlite, 'jxor-hi-only', 'inv-xor-4', {
          householdItemBudgetId: 'hib-xor-4',
          itemizedAmount: 100.0,
        });
      }).not.toThrow();
    });
  });

  // ── 10. itemized_amount > 0 CHECK constraint ───────────────────────────────

  describe('itemized_amount > 0 CHECK constraint', () => {
    it('rejects itemized_amount of 0', () => {
      insertVendor(sqlite, 'v-amt-zero-1');
      insertWorkItem(sqlite, 'wi-amt-zero-1');
      insertWorkItemBudget(sqlite, 'wib-amt-zero-1', 'wi-amt-zero-1');
      insertInvoicePost0017(sqlite, 'inv-amt-zero-1', 'v-amt-zero-1', 100.0);

      let error: Error | undefined;
      try {
        insertJunctionRow(sqlite, 'j-amt-zero', 'inv-amt-zero-1', {
          workItemBudgetId: 'wib-amt-zero-1',
          itemizedAmount: 0,
        });
      } catch (err) {
        error = err as Error;
      }

      expect(error).toBeDefined();
      expect(error!.message).toMatch(/CHECK constraint failed/);
    });

    it('rejects negative itemized_amount', () => {
      insertVendor(sqlite, 'v-amt-neg-1');
      insertWorkItem(sqlite, 'wi-amt-neg-1');
      insertWorkItemBudget(sqlite, 'wib-amt-neg-1', 'wi-amt-neg-1');
      insertInvoicePost0017(sqlite, 'inv-amt-neg-1', 'v-amt-neg-1', 100.0);

      let error: Error | undefined;
      try {
        insertJunctionRow(sqlite, 'j-amt-neg', 'inv-amt-neg-1', {
          workItemBudgetId: 'wib-amt-neg-1',
          itemizedAmount: -50.0,
        });
      } catch (err) {
        error = err as Error;
      }

      expect(error).toBeDefined();
      expect(error!.message).toMatch(/CHECK constraint failed/);
    });

    it('accepts the smallest positive itemized_amount (0.01)', () => {
      insertVendor(sqlite, 'v-amt-pos-1');
      insertWorkItem(sqlite, 'wi-amt-pos-1');
      insertWorkItemBudget(sqlite, 'wib-amt-pos-1', 'wi-amt-pos-1');
      insertInvoicePost0017(sqlite, 'inv-amt-pos-1', 'v-amt-pos-1', 500.0);

      expect(() => {
        insertJunctionRow(sqlite, 'j-amt-pos', 'inv-amt-pos-1', {
          workItemBudgetId: 'wib-amt-pos-1',
          itemizedAmount: 0.01,
        });
      }).not.toThrow();
    });

    it('accepts a large itemized_amount', () => {
      insertVendor(sqlite, 'v-amt-large-1');
      insertWorkItem(sqlite, 'wi-amt-large-1');
      insertWorkItemBudget(sqlite, 'wib-amt-large-1', 'wi-amt-large-1');
      insertInvoicePost0017(sqlite, 'inv-amt-large-1', 'v-amt-large-1', 999999.99);

      expect(() => {
        insertJunctionRow(sqlite, 'j-amt-large', 'inv-amt-large-1', {
          workItemBudgetId: 'wib-amt-large-1',
          itemizedAmount: 999999.99,
        });
      }).not.toThrow();
    });
  });

  // ── 11. Partial UNIQUE constraint — work_item_budget_id ────────────────────

  describe('partial UNIQUE index: each work item budget line links to at most one invoice', () => {
    it('prevents two junction rows pointing to the same work_item_budget_id', () => {
      insertVendor(sqlite, 'v-uniq-wi-1');
      insertWorkItem(sqlite, 'wi-uniq-1');
      insertWorkItemBudget(sqlite, 'wib-uniq-1', 'wi-uniq-1');
      insertInvoicePost0017(sqlite, 'inv-uniq-wi-a', 'v-uniq-wi-1', 100.0);
      insertInvoicePost0017(sqlite, 'inv-uniq-wi-b', 'v-uniq-wi-1', 200.0);

      insertJunctionRow(sqlite, 'j-uniq-wi-1', 'inv-uniq-wi-a', {
        workItemBudgetId: 'wib-uniq-1',
        itemizedAmount: 100.0,
      });

      let error: Error | undefined;
      try {
        insertJunctionRow(sqlite, 'j-uniq-wi-2', 'inv-uniq-wi-b', {
          workItemBudgetId: 'wib-uniq-1',
          itemizedAmount: 200.0,
        });
      } catch (err) {
        error = err as Error;
      }

      expect(error).toBeDefined();
      expect(error!.message).toMatch(/UNIQUE constraint failed/);
    });

    it('allows two junction rows for different work_item_budget_ids on the same invoice', () => {
      insertVendor(sqlite, 'v-uniq-wi-diff-1');
      insertWorkItem(sqlite, 'wi-uniq-diff-1');
      insertWorkItem(sqlite, 'wi-uniq-diff-2');
      insertWorkItemBudget(sqlite, 'wib-diff-1', 'wi-uniq-diff-1');
      insertWorkItemBudget(sqlite, 'wib-diff-2', 'wi-uniq-diff-2');
      insertInvoicePost0017(sqlite, 'inv-uniq-wi-diff', 'v-uniq-wi-diff-1', 300.0);

      expect(() => {
        insertJunctionRow(sqlite, 'j-diff-1', 'inv-uniq-wi-diff', {
          workItemBudgetId: 'wib-diff-1',
          itemizedAmount: 150.0,
        });
        insertJunctionRow(sqlite, 'j-diff-2', 'inv-uniq-wi-diff', {
          workItemBudgetId: 'wib-diff-2',
          itemizedAmount: 150.0,
        });
      }).not.toThrow();

      const rows = sqlite
        .prepare(`SELECT * FROM invoice_budget_lines WHERE invoice_id = ?`)
        .all('inv-uniq-wi-diff') as Array<unknown>;
      expect(rows).toHaveLength(2);
    });
  });

  // ── 12. Partial UNIQUE constraint — household_item_budget_id ───────────────

  describe('partial UNIQUE index: each household item budget line links to at most one invoice', () => {
    it('prevents two junction rows pointing to the same household_item_budget_id', () => {
      insertVendor(sqlite, 'v-uniq-hi-1');
      insertHouseholdItem(sqlite, 'hi-uniq-1');
      insertHouseholdItemBudget(sqlite, 'hib-uniq-1', 'hi-uniq-1');
      insertInvoicePost0017(sqlite, 'inv-uniq-hi-a', 'v-uniq-hi-1', 100.0);
      insertInvoicePost0017(sqlite, 'inv-uniq-hi-b', 'v-uniq-hi-1', 200.0);

      insertJunctionRow(sqlite, 'j-uniq-hi-1', 'inv-uniq-hi-a', {
        householdItemBudgetId: 'hib-uniq-1',
        itemizedAmount: 100.0,
      });

      let error: Error | undefined;
      try {
        insertJunctionRow(sqlite, 'j-uniq-hi-2', 'inv-uniq-hi-b', {
          householdItemBudgetId: 'hib-uniq-1',
          itemizedAmount: 200.0,
        });
      } catch (err) {
        error = err as Error;
      }

      expect(error).toBeDefined();
      expect(error!.message).toMatch(/UNIQUE constraint failed/);
    });

    it('allows two junction rows for different household_item_budget_ids on the same invoice', () => {
      insertVendor(sqlite, 'v-uniq-hi-diff-1');
      insertHouseholdItem(sqlite, 'hi-uniq-diff-1');
      insertHouseholdItem(sqlite, 'hi-uniq-diff-2');
      insertHouseholdItemBudget(sqlite, 'hib-diff-1', 'hi-uniq-diff-1');
      insertHouseholdItemBudget(sqlite, 'hib-diff-2', 'hi-uniq-diff-2');
      insertInvoicePost0017(sqlite, 'inv-uniq-hi-diff', 'v-uniq-hi-diff-1', 300.0);

      expect(() => {
        insertJunctionRow(sqlite, 'j-hi-diff-1', 'inv-uniq-hi-diff', {
          householdItemBudgetId: 'hib-diff-1',
          itemizedAmount: 150.0,
        });
        insertJunctionRow(sqlite, 'j-hi-diff-2', 'inv-uniq-hi-diff', {
          householdItemBudgetId: 'hib-diff-2',
          itemizedAmount: 150.0,
        });
      }).not.toThrow();

      const rows = sqlite
        .prepare(`SELECT * FROM invoice_budget_lines WHERE invoice_id = ?`)
        .all('inv-uniq-hi-diff') as Array<unknown>;
      expect(rows).toHaveLength(2);
    });
  });

  // ── 13. CASCADE delete from invoice ───────────────────────────────────────

  describe('CASCADE delete: deleting an invoice removes all its junction rows', () => {
    it('removes junction row when parent invoice is deleted', () => {
      insertVendor(sqlite, 'v-cascade-inv-1');
      insertWorkItem(sqlite, 'wi-cascade-inv-1');
      insertWorkItemBudget(sqlite, 'wib-cascade-inv-1', 'wi-cascade-inv-1');
      insertInvoicePost0017(sqlite, 'inv-cascade-1', 'v-cascade-inv-1', 100.0);
      insertJunctionRow(sqlite, 'j-cascade-1', 'inv-cascade-1', {
        workItemBudgetId: 'wib-cascade-inv-1',
        itemizedAmount: 100.0,
      });

      const before = sqlite
        .prepare(`SELECT * FROM invoice_budget_lines WHERE id = ?`)
        .get('j-cascade-1') as Record<string, unknown> | undefined;
      expect(before).toBeDefined();

      sqlite.prepare('DELETE FROM invoices WHERE id = ?').run('inv-cascade-1');

      const after = sqlite
        .prepare(`SELECT * FROM invoice_budget_lines WHERE id = ?`)
        .get('j-cascade-1') as Record<string, unknown> | undefined;
      expect(after).toBeUndefined();
    });

    it('removes multiple junction rows when invoice with multiple links is deleted', () => {
      insertVendor(sqlite, 'v-cascade-multi-1');
      insertWorkItem(sqlite, 'wi-cascade-multi-1');
      insertWorkItem(sqlite, 'wi-cascade-multi-2');
      insertWorkItemBudget(sqlite, 'wib-cascade-multi-1', 'wi-cascade-multi-1');
      insertWorkItemBudget(sqlite, 'wib-cascade-multi-2', 'wi-cascade-multi-2');
      insertInvoicePost0017(sqlite, 'inv-cascade-multi', 'v-cascade-multi-1', 300.0);
      insertJunctionRow(sqlite, 'j-cascade-multi-1', 'inv-cascade-multi', {
        workItemBudgetId: 'wib-cascade-multi-1',
        itemizedAmount: 150.0,
      });
      insertJunctionRow(sqlite, 'j-cascade-multi-2', 'inv-cascade-multi', {
        workItemBudgetId: 'wib-cascade-multi-2',
        itemizedAmount: 150.0,
      });

      const before = sqlite
        .prepare(`SELECT COUNT(*) as cnt FROM invoice_budget_lines WHERE invoice_id = ?`)
        .get('inv-cascade-multi') as { cnt: number };
      expect(before.cnt).toBe(2);

      sqlite.prepare('DELETE FROM invoices WHERE id = ?').run('inv-cascade-multi');

      const after = sqlite
        .prepare(`SELECT COUNT(*) as cnt FROM invoice_budget_lines WHERE invoice_id = ?`)
        .get('inv-cascade-multi') as { cnt: number };
      expect(after.cnt).toBe(0);
    });

    it('cascade from vendor delete also removes all invoice junction rows (vendor -> invoices -> junction)', () => {
      insertVendor(sqlite, 'v-vendor-cascade-1');
      insertWorkItem(sqlite, 'wi-vendor-cascade-1');
      insertWorkItemBudget(sqlite, 'wib-vendor-cascade-1', 'wi-vendor-cascade-1');
      insertInvoicePost0017(sqlite, 'inv-vendor-cascade-1', 'v-vendor-cascade-1', 100.0);
      insertJunctionRow(sqlite, 'j-vendor-cascade-1', 'inv-vendor-cascade-1', {
        workItemBudgetId: 'wib-vendor-cascade-1',
        itemizedAmount: 100.0,
      });

      sqlite.prepare('DELETE FROM vendors WHERE id = ?').run('v-vendor-cascade-1');

      const junctionRows = sqlite
        .prepare(`SELECT * FROM invoice_budget_lines WHERE id = ?`)
        .all('j-vendor-cascade-1') as Array<unknown>;
      expect(junctionRows).toHaveLength(0);
    });
  });

  // ── 14. CASCADE delete from budget line removes junction rows ──────────────

  describe('CASCADE delete from budget line', () => {
    it('deleting a linked work item budget line cascades to junction rows', () => {
      insertVendor(sqlite, 'v-cascade-bl-wi-1');
      insertWorkItem(sqlite, 'wi-cascade-bl-1');
      insertWorkItemBudget(sqlite, 'wib-cascade-bl-1', 'wi-cascade-bl-1');
      insertInvoicePost0017(sqlite, 'inv-cascade-bl-wi-1', 'v-cascade-bl-wi-1', 100.0);
      insertJunctionRow(sqlite, 'j-cascade-bl-wi-1', 'inv-cascade-bl-wi-1', {
        workItemBudgetId: 'wib-cascade-bl-1',
        itemizedAmount: 100.0,
      });

      // Junction row exists before delete
      const before = sqlite
        .prepare(`SELECT id FROM invoice_budget_lines WHERE id = ?`)
        .get('j-cascade-bl-wi-1');
      expect(before).toBeDefined();

      // Delete the budget line — should cascade to junction row
      sqlite.prepare('DELETE FROM work_item_budgets WHERE id = ?').run('wib-cascade-bl-1');

      // Junction row should be gone
      const after = sqlite
        .prepare(`SELECT id FROM invoice_budget_lines WHERE id = ?`)
        .get('j-cascade-bl-wi-1');
      expect(after).toBeUndefined();

      // Invoice itself should still exist
      const invoice = sqlite
        .prepare(`SELECT id FROM invoices WHERE id = ?`)
        .get('inv-cascade-bl-wi-1');
      expect(invoice).toBeDefined();
    });

    it('deleting a linked household item budget line cascades to junction rows', () => {
      insertVendor(sqlite, 'v-cascade-bl-hi-1');
      insertHouseholdItem(sqlite, 'hi-cascade-bl-1');
      insertHouseholdItemBudget(sqlite, 'hib-cascade-bl-1', 'hi-cascade-bl-1');
      insertInvoicePost0017(sqlite, 'inv-cascade-bl-hi-1', 'v-cascade-bl-hi-1', 200.0);
      insertJunctionRow(sqlite, 'j-cascade-bl-hi-1', 'inv-cascade-bl-hi-1', {
        householdItemBudgetId: 'hib-cascade-bl-1',
        itemizedAmount: 200.0,
      });

      sqlite.prepare('DELETE FROM household_item_budgets WHERE id = ?').run('hib-cascade-bl-1');

      const after = sqlite
        .prepare(`SELECT id FROM invoice_budget_lines WHERE id = ?`)
        .get('j-cascade-bl-hi-1');
      expect(after).toBeUndefined();
    });

    it('a budget line with NO junction row can be deleted successfully', () => {
      insertWorkItem(sqlite, 'wi-cascade-bl-unlinked');
      insertWorkItemBudget(sqlite, 'wib-cascade-bl-unlinked', 'wi-cascade-bl-unlinked');

      expect(() => {
        sqlite.prepare('DELETE FROM work_item_budgets WHERE id = ?').run('wib-cascade-bl-unlinked');
      }).not.toThrow();
    });

    it('deleting one budget line does not affect junction rows for other budget lines', () => {
      insertVendor(sqlite, 'v-cascade-bl-other-1');
      insertWorkItem(sqlite, 'wi-cascade-bl-linked');
      insertWorkItem(sqlite, 'wi-cascade-bl-other');
      insertWorkItemBudget(sqlite, 'wib-cascade-bl-linked', 'wi-cascade-bl-linked');
      insertWorkItemBudget(sqlite, 'wib-cascade-bl-other', 'wi-cascade-bl-other');
      insertInvoicePost0017(sqlite, 'inv-cascade-bl-other', 'v-cascade-bl-other-1', 300.0);
      insertInvoicePost0017(sqlite, 'inv-cascade-bl-other2', 'v-cascade-bl-other-1', 150.0);
      insertJunctionRow(sqlite, 'j-cascade-bl-linked', 'inv-cascade-bl-other', {
        workItemBudgetId: 'wib-cascade-bl-linked',
        itemizedAmount: 150.0,
      });
      insertJunctionRow(sqlite, 'j-cascade-bl-other', 'inv-cascade-bl-other2', {
        workItemBudgetId: 'wib-cascade-bl-other',
        itemizedAmount: 150.0,
      });

      // Delete one budget line
      sqlite.prepare('DELETE FROM work_item_budgets WHERE id = ?').run('wib-cascade-bl-linked');

      // Its junction row is gone
      const deleted = sqlite
        .prepare(`SELECT id FROM invoice_budget_lines WHERE id = ?`)
        .get('j-cascade-bl-linked');
      expect(deleted).toBeUndefined();

      // The other junction row is still there
      const kept = sqlite
        .prepare(`SELECT work_item_budget_id FROM invoice_budget_lines WHERE id = ?`)
        .get('j-cascade-bl-other') as { work_item_budget_id: string };
      expect(kept.work_item_budget_id).toBe('wib-cascade-bl-other');
    });
  });

  // ── 15. Idempotency ────────────────────────────────────────────────────────

  describe('migration idempotency', () => {
    it('running runMigrations() twice on the same DB does not error', () => {
      expect(() => {
        runMigrations(sqlite);
      }).not.toThrow();
    });

    it('does not duplicate the invoice_budget_lines table on second run', () => {
      runMigrations(sqlite);

      const tables = sqlite
        .prepare(
          `SELECT name FROM sqlite_master WHERE type='table' AND name='invoice_budget_lines'`,
        )
        .all() as Array<{ name: string }>;

      expect(tables).toHaveLength(1);
    });
  });

  // ── 16. Full round-trip: insert and query junction rows ───────────────────

  describe('full junction row round-trip', () => {
    it('can insert and query a work-item-linked junction row with all fields', () => {
      insertVendor(sqlite, 'v-rt-1');
      insertWorkItem(sqlite, 'wi-rt-1');
      insertWorkItemBudget(sqlite, 'wib-rt-1', 'wi-rt-1');
      insertInvoicePost0017(sqlite, 'inv-rt-1', 'v-rt-1', 500.0);

      const now = new Date().toISOString();
      sqlite
        .prepare(
          `INSERT INTO invoice_budget_lines
             (id, invoice_id, work_item_budget_id, household_item_budget_id, itemized_amount, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run('j-rt-full', 'inv-rt-1', 'wib-rt-1', null, 499.99, now, now);

      const row = sqlite
        .prepare(`SELECT * FROM invoice_budget_lines WHERE id = ?`)
        .get('j-rt-full') as Record<string, unknown>;

      expect(row.id).toBe('j-rt-full');
      expect(row.invoice_id).toBe('inv-rt-1');
      expect(row.work_item_budget_id).toBe('wib-rt-1');
      expect(row.household_item_budget_id).toBeNull();
      expect(row.itemized_amount).toBe(499.99);
      expect(row.created_at).toBe(now);
      expect(row.updated_at).toBe(now);
    });

    it('can query all junction rows for a given invoice by invoice_id index', () => {
      insertVendor(sqlite, 'v-rt-2');
      insertWorkItem(sqlite, 'wi-rt-2a');
      insertWorkItem(sqlite, 'wi-rt-2b');
      insertWorkItemBudget(sqlite, 'wib-rt-2a', 'wi-rt-2a');
      insertWorkItemBudget(sqlite, 'wib-rt-2b', 'wi-rt-2b');
      insertInvoicePost0017(sqlite, 'inv-rt-2', 'v-rt-2', 600.0);

      insertJunctionRow(sqlite, 'j-rt-2a', 'inv-rt-2', {
        workItemBudgetId: 'wib-rt-2a',
        itemizedAmount: 350.0,
      });
      insertJunctionRow(sqlite, 'j-rt-2b', 'inv-rt-2', {
        workItemBudgetId: 'wib-rt-2b',
        itemizedAmount: 250.0,
      });

      const rows = sqlite
        .prepare(
          `SELECT id, itemized_amount FROM invoice_budget_lines WHERE invoice_id = ? ORDER BY id`,
        )
        .all('inv-rt-2') as Array<{ id: string; itemized_amount: number }>;

      expect(rows).toHaveLength(2);
      expect(rows.map((r) => r.id)).toEqual(expect.arrayContaining(['j-rt-2a', 'j-rt-2b']));

      const total = rows.reduce((sum, r) => sum + r.itemized_amount, 0);
      expect(total).toBeCloseTo(600.0, 2);
    });

    it('can mix work-item-linked and household-item-linked junction rows on the same invoice', () => {
      insertVendor(sqlite, 'v-rt-mixed');
      insertWorkItem(sqlite, 'wi-rt-mixed');
      insertWorkItemBudget(sqlite, 'wib-rt-mixed', 'wi-rt-mixed');
      insertHouseholdItem(sqlite, 'hi-rt-mixed');
      insertHouseholdItemBudget(sqlite, 'hib-rt-mixed', 'hi-rt-mixed');
      insertInvoicePost0017(sqlite, 'inv-rt-mixed', 'v-rt-mixed', 500.0);

      insertJunctionRow(sqlite, 'j-rt-mixed-wi', 'inv-rt-mixed', {
        workItemBudgetId: 'wib-rt-mixed',
        itemizedAmount: 300.0,
      });
      insertJunctionRow(sqlite, 'j-rt-mixed-hi', 'inv-rt-mixed', {
        householdItemBudgetId: 'hib-rt-mixed',
        itemizedAmount: 200.0,
      });

      const rows = sqlite
        .prepare(`SELECT id FROM invoice_budget_lines WHERE invoice_id = ? ORDER BY id`)
        .all('inv-rt-mixed') as Array<{ id: string }>;

      expect(rows).toHaveLength(2);
      expect(rows.map((r) => r.id)).toEqual(
        expect.arrayContaining(['j-rt-mixed-wi', 'j-rt-mixed-hi']),
      );
    });

    it('insertUser helper works for created_by FK tests', () => {
      insertUser(sqlite, 'user-rt-1');
      insertVendor(sqlite, 'v-rt-user');

      const now = new Date().toISOString();
      sqlite
        .prepare(
          `INSERT INTO invoices (id, vendor_id, amount, date, status, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run('inv-rt-user', 'v-rt-user', 100.0, '2026-01-15', 'pending', 'user-rt-1', now, now);

      const inv = sqlite
        .prepare(`SELECT created_by FROM invoices WHERE id = ?`)
        .get('inv-rt-user') as { created_by: string };
      expect(inv.created_by).toBe('user-rt-1');
    });
  });
});
