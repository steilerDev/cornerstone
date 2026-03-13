/**
 * Migration integration tests for 0023_require_budget_source.sql
 *
 * Tests that:
 *   1. Fresh DB: all migrations 0001-0023 apply without error
 *   2. Pre-migration NULL budget_source_id on work_item_budgets rows updated to 'discretionary-system'
 *   3. Pre-migration NULL budget_source_id on household_item_budgets rows updated to 'discretionary-system'
 *   4. Rows with non-NULL budget_source_id retain their original value
 *   5. Post-migration budget_source_id is NOT NULL on all rows
 *   6. Idempotency: running migrator twice on fresh DB does not error
 *
 * Issue #787: Budget lines should not allow 'None' as funding source
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { mkdtempSync, symlinkSync, unlinkSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { runMigrations } from '../migrate.js';

const MIGRATIONS_DIR = dirname(fileURLToPath(import.meta.url));

// Migrations that must run before 0023
const PRE_0023_MIGRATIONS = [
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
  '0017_invoice_budget_lines.sql',
  '0018_user_preferences.sql',
  '0019_photos.sql',
  '0019_unit_pricing_vat.sql',
  '0020_subsidy_max_amount.sql',
  '0021_discretionary_budget_source.sql',
  '0022_security_hygiene.sql',
];

/**
 * Apply migrations 0001-0022 to a fresh in-memory DB.
 */
function setupPreMigrationDb(db: Database.Database): void {
  const tempDir = mkdtempSync(join(tmpdir(), 'cs-mig-test-'));
  const symlinks: string[] = [];

  for (const file of PRE_0023_MIGRATIONS) {
    const linkPath = join(tempDir, file);
    symlinkSync(join(MIGRATIONS_DIR, file), linkPath);
    symlinks.push(linkPath);
  }

  try {
    console.warn = () => undefined;
    runMigrations(db, tempDir);
  } finally {
    console.warn = console.error;
    for (const linkPath of symlinks) {
      if (existsSync(linkPath)) {
        unlinkSync(linkPath);
      }
    }
  }
}

/**
 * Apply migration 0023 directly on a DB that already has 0001-0022 applied.
 */
function runMigration0023(db: Database.Database): void {
  const sql = readFileSync(join(MIGRATIONS_DIR, '0023_require_budget_source.sql'), 'utf-8');
  db.exec(sql);
  db.prepare('INSERT OR IGNORE INTO _migrations (name) VALUES (?)').run(
    '0023_require_budget_source.sql',
  );
}

// ── Helper: insert test data ───────────────────────────────────────────────

function insertUser(db: Database.Database, id: string): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO users (id, email, display_name, role, auth_provider, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, `${id}@example.com`, `User ${id}`, 'member', 'local', now, now);
}

function insertBudgetSource(db: Database.Database, id: string, name: string): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO budget_sources (id, name, source_type, total_amount, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, name, 'savings', 50000, 'user-001', now, now);
}

function insertWorkItem(db: Database.Database, id: string): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO work_items (id, title, status, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, `Work Item ${id}`, 'not_started', 'user-001', now, now);
}

function insertHouseholdItem(db: Database.Database, id: string): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO household_items (id, name, category_id, status, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, `Item ${id}`, 'hic-other', 'planned', 'user-001', now, now);
}

describe('Migration 0023: Require budgetSourceId', () => {
  let sqlite: Database.Database;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
  });

  afterEach(() => {
    sqlite.close();
  });

  // ─── Test 1: Fresh DB ────────────────────────────────────────────────────

  it('applies all migrations 0001-0023 without error on a fresh DB', () => {
    console.warn = () => undefined;
    expect(() => {
      runMigrations(sqlite);
    }).not.toThrow();
    console.warn = console.error;
  });

  // ─── Test 2-4: Data migration ────────────────────────────────────────────

  describe('data migration', () => {
    it('backfills NULL budget_source_id to discretionary-system on work_item_budgets', () => {
      setupPreMigrationDb(sqlite);
      insertUser(sqlite, 'user-001');

      // Create a work item and insert a budget line with NULL budget_source_id
      // (using raw SQL since the Drizzle schema now marks it notNull)
      insertWorkItem(sqlite, 'wi-001');
      const now = new Date().toISOString();
      sqlite
        .prepare(
          `INSERT INTO work_item_budgets (id, work_item_id, planned_amount, confidence, budget_source_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run('wib-001', 'wi-001', 1000, 'own_estimate', null, now, now);

      // Verify it's NULL before migration
      const before = sqlite
        .prepare('SELECT budget_source_id FROM work_item_budgets WHERE id = ?')
        .get('wib-001') as any;
      expect(before.budget_source_id).toBeNull();

      // Apply migration
      runMigration0023(sqlite);

      // Verify it's now discretionary-system
      const after = sqlite
        .prepare('SELECT budget_source_id FROM work_item_budgets WHERE id = ?')
        .get('wib-001') as any;
      expect(after.budget_source_id).toBe('discretionary-system');
    });

    it('backfills NULL budget_source_id to discretionary-system on household_item_budgets', () => {
      setupPreMigrationDb(sqlite);
      insertUser(sqlite, 'user-001');

      // Create a household item and insert a budget line with NULL budget_source_id
      insertHouseholdItem(sqlite, 'hi-001');
      const now = new Date().toISOString();
      sqlite
        .prepare(
          `INSERT INTO household_item_budgets (id, household_item_id, planned_amount, confidence, budget_source_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run('hib-001', 'hi-001', 500, 'professional_estimate', null, now, now);

      // Verify it's NULL before migration
      const before = sqlite
        .prepare('SELECT budget_source_id FROM household_item_budgets WHERE id = ?')
        .get('hib-001') as any;
      expect(before.budget_source_id).toBeNull();

      // Apply migration
      runMigration0023(sqlite);

      // Verify it's now discretionary-system
      const after = sqlite
        .prepare('SELECT budget_source_id FROM household_item_budgets WHERE id = ?')
        .get('hib-001') as any;
      expect(after.budget_source_id).toBe('discretionary-system');
    });

    it('preserves non-NULL budget_source_id on work_item_budgets during migration', () => {
      setupPreMigrationDb(sqlite);
      insertUser(sqlite, 'user-001');

      // Create a budget source and a work item with a budget line linked to it
      insertBudgetSource(sqlite, 'bs-custom', 'Custom Source');
      insertWorkItem(sqlite, 'wi-002');
      const now = new Date().toISOString();
      sqlite
        .prepare(
          `INSERT INTO work_item_budgets (id, work_item_id, planned_amount, confidence, budget_source_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run('wib-002', 'wi-002', 2000, 'quote', 'bs-custom', now, now);

      // Apply migration
      runMigration0023(sqlite);

      // Verify it still has the original source ID
      const after = sqlite
        .prepare('SELECT budget_source_id FROM work_item_budgets WHERE id = ?')
        .get('wib-002') as any;
      expect(after.budget_source_id).toBe('bs-custom');
    });

    it('preserves non-NULL budget_source_id on household_item_budgets during migration', () => {
      setupPreMigrationDb(sqlite);
      insertUser(sqlite, 'user-001');

      // Create a budget source and a household item with a budget line linked to it
      insertBudgetSource(sqlite, 'bs-grant', 'Grant Program');
      insertHouseholdItem(sqlite, 'hi-002');
      const now = new Date().toISOString();
      sqlite
        .prepare(
          `INSERT INTO household_item_budgets (id, household_item_id, planned_amount, confidence, budget_source_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run('hib-002', 'hi-002', 800, 'professional_estimate', 'bs-grant', now, now);

      // Apply migration
      runMigration0023(sqlite);

      // Verify it still has the original source ID
      const after = sqlite
        .prepare('SELECT budget_source_id FROM household_item_budgets WHERE id = ?')
        .get('hib-002') as any;
      expect(after.budget_source_id).toBe('bs-grant');
    });

    it('all rows have non-NULL budget_source_id after migration', () => {
      setupPreMigrationDb(sqlite);
      insertUser(sqlite, 'user-001');

      // Create multiple budget lines with mixed NULL and non-NULL sources
      insertWorkItem(sqlite, 'wi-003');
      insertHouseholdItem(sqlite, 'hi-003');
      insertBudgetSource(sqlite, 'bs-test', 'Test Source');
      const now = new Date().toISOString();

      sqlite
        .prepare(
          `INSERT INTO work_item_budgets (id, work_item_id, planned_amount, confidence, budget_source_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run('wib-null-1', 'wi-003', 100, 'own_estimate', null, now, now);
      sqlite
        .prepare(
          `INSERT INTO work_item_budgets (id, work_item_id, planned_amount, confidence, budget_source_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run('wib-set-1', 'wi-003', 200, 'own_estimate', 'bs-test', now, now);
      sqlite
        .prepare(
          `INSERT INTO household_item_budgets (id, household_item_id, planned_amount, confidence, budget_source_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run('hib-null-1', 'hi-003', 300, 'own_estimate', null, now, now);
      sqlite
        .prepare(
          `INSERT INTO household_item_budgets (id, household_item_id, planned_amount, confidence, budget_source_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run('hib-set-1', 'hi-003', 400, 'own_estimate', 'bs-test', now, now);

      // Apply migration
      runMigration0023(sqlite);

      // Verify all rows have non-NULL values
      const wiRows = sqlite
        .prepare(
          `SELECT id, budget_source_id FROM work_item_budgets WHERE work_item_id = ? ORDER BY id`,
        )
        .all('wi-003') as any[];
      const hiRows = sqlite
        .prepare(
          `SELECT id, budget_source_id FROM household_item_budgets WHERE household_item_id = ? ORDER BY id`,
        )
        .all('hi-003') as any[];

      expect(wiRows).toHaveLength(2);
      expect(hiRows).toHaveLength(2);

      wiRows.forEach((row: any) => {
        expect(row.budget_source_id).not.toBeNull();
        expect(typeof row.budget_source_id).toBe('string');
      });

      hiRows.forEach((row: any) => {
        expect(row.budget_source_id).not.toBeNull();
        expect(typeof row.budget_source_id).toBe('string');
      });
    });
  });

  // ─── Test 5: Idempotency ──────────────────────────────────────────────

  it('migration is idempotent — running twice does not error', () => {
    setupPreMigrationDb(sqlite);

    // Run migration first time
    expect(() => {
      runMigration0023(sqlite);
    }).not.toThrow();

    // Attempt to run again (should not error even though migration is already recorded)
    // Typically migrations are recorded in _migrations table to prevent re-runs,
    // but in this case we're testing the SQL itself is idempotent
    expect(() => {
      const sql = readFileSync(join(MIGRATIONS_DIR, '0023_require_budget_source.sql'), 'utf-8');
      // Only run the SQL, not the migration recording
      // (it would fail if we tried to insert a duplicate _migrations record)
      sqlite.exec(sql);
    }).not.toThrow();
  });
});
