/**
 * Migration integration tests for 0028_areas_trades_rework.sql
 *
 * Tests that:
 *   1. Fresh DB: all migrations 0001-0028 apply without error
 *   2. trades table is created with exactly 15 default rows
 *   3. Specific trade IDs exist (trade-plumbing, trade-other, etc.)
 *   4. areas table is created; top-level and child areas can be inserted
 *   5. areas CASCADE DELETE removes child rows when parent is deleted
 *   6. vendors table has trade_id column; specialty column is gone
 *   7. work_items table has assigned_vendor_id and area_id columns
 *   8. household_items table has area_id column; room column is gone
 *   9. tags, work_item_tags, household_item_tags tables are dropped
 *  10. budget category bc-waste is present after migration
 *  11. household item category hic-equipment is present after migration
 *  12. Idempotency: running migrator twice on fresh DB does not error
 *
 * Story #1030: Migration + Shared Types (Foundation)
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { mkdtempSync, symlinkSync, unlinkSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { runMigrations } from '../migrate.js';

const MIGRATIONS_DIR = dirname(fileURLToPath(import.meta.url));

// Migrations that must run before 0028
const PRE_0028_MIGRATIONS = [
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
  '0023_require_budget_source.sql',
  '0024_diary_entries.sql',
  '0025_add_invoice_created_entry_type.sql',
  '0026_vendor_contacts_and_dav.sql',
  '0027_vendor_contact_names.sql',
];

/**
 * Apply migrations 0001-0027 to a fresh in-memory DB.
 */
function setupPreMigrationDb(db: Database.Database): void {
  const tempDir = mkdtempSync(join(tmpdir(), 'cs-mig-0028-test-'));
  const symlinks: string[] = [];

  for (const file of PRE_0028_MIGRATIONS) {
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
 * Apply migration 0028 directly on a DB that already has 0001-0027 applied.
 */
function runMigration0028(db: Database.Database): void {
  const sql = readFileSync(join(MIGRATIONS_DIR, '0028_areas_trades_rework.sql'), 'utf-8');
  db.exec(sql);
  db.prepare('INSERT OR IGNORE INTO _migrations (name) VALUES (?)').run(
    '0028_areas_trades_rework.sql',
  );
}

// ── Helper: insert test data ──────────────────────────────────────────────────

function insertUser(db: Database.Database, id: string): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO users (id, email, display_name, role, auth_provider, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, `${id}@example.com`, `User ${id}`, 'member', 'local', now, now);
}

/**
 * Returns the column names of a table via PRAGMA table_info.
 */
function getColumnNames(db: Database.Database, table: string): string[] {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.map((r) => r.name);
}

/**
 * Returns the names of all tables in the database.
 */
function getTableNames(db: Database.Database): string[] {
  const rows = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`)
    .all() as Array<{ name: string }>;
  return rows.map((r) => r.name);
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Migration 0028: Areas and Trades Rework', () => {
  let sqlite: Database.Database;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    // Suppress migration runner console output
    const originalWarn = console.warn;
    console.warn = () => undefined;
    // Restore after each test via afterEach
    (sqlite as any).__originalWarn = originalWarn;
  });

  afterEach(() => {
    const originalWarn = (sqlite as any).__originalWarn;
    if (originalWarn) console.warn = originalWarn;
    sqlite.close();
  });

  // ── Test 1: Fresh DB ──────────────────────────────────────────────────────

  it('applies all migrations 0001-0028 without error on a fresh DB', () => {
    expect(() => {
      runMigrations(sqlite);
    }).not.toThrow();
  });

  // ── Test 2: trades table row count ───────────────────────────────────────

  it('creates trades table with exactly 15 default rows', () => {
    setupPreMigrationDb(sqlite);
    runMigration0028(sqlite);

    const result = sqlite.prepare('SELECT COUNT(*) AS cnt FROM trades').get() as { cnt: number };
    expect(result.cnt).toBe(15);
  });

  // ── Test 3: specific trade IDs ────────────────────────────────────────────

  it('seeds expected trade IDs including trade-plumbing and trade-other', () => {
    setupPreMigrationDb(sqlite);
    runMigration0028(sqlite);

    const expectedIds = [
      'trade-plumbing',
      'trade-hvac',
      'trade-electrical',
      'trade-drywall',
      'trade-carpentry',
      'trade-masonry',
      'trade-painting',
      'trade-roofing',
      'trade-flooring',
      'trade-tiling',
      'trade-landscaping',
      'trade-excavation',
      'trade-general-contractor',
      'trade-architect-design',
      'trade-other',
    ];

    for (const id of expectedIds) {
      const row = sqlite.prepare('SELECT id FROM trades WHERE id = ?').get(id) as
        | { id: string }
        | undefined;
      expect(row).toBeDefined();
      expect(row?.id).toBe(id);
    }
  });

  it('each default trade has a non-empty name and color', () => {
    setupPreMigrationDb(sqlite);
    runMigration0028(sqlite);

    const rows = sqlite.prepare('SELECT id, name, color FROM trades').all() as Array<{
      id: string;
      name: string;
      color: string | null;
    }>;

    for (const row of rows) {
      expect(typeof row.name).toBe('string');
      expect(row.name.length).toBeGreaterThan(0);
      // All 15 default trades have colors set
      expect(row.color).not.toBeNull();
    }
  });

  // ── Test 4: areas table structure ─────────────────────────────────────────

  it('creates areas table and allows inserting a top-level area', () => {
    setupPreMigrationDb(sqlite);
    runMigration0028(sqlite);

    const now = new Date().toISOString();
    expect(() => {
      sqlite
        .prepare(
          `INSERT INTO areas (id, name, parent_id, color, description, sort_order, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run('area-kitchen', 'Kitchen', null, '#FF5733', 'Main kitchen area', 0, now, now);
    }).not.toThrow();

    const row = sqlite.prepare('SELECT id, name, parent_id FROM areas WHERE id = ?').get('area-kitchen') as
      | { id: string; name: string; parent_id: string | null }
      | undefined;
    expect(row).toBeDefined();
    expect(row?.id).toBe('area-kitchen');
    expect(row?.name).toBe('Kitchen');
    expect(row?.parent_id).toBeNull();
  });

  it('allows inserting a child area that references its parent', () => {
    setupPreMigrationDb(sqlite);
    runMigration0028(sqlite);

    const now = new Date().toISOString();
    sqlite
      .prepare(
        `INSERT INTO areas (id, name, parent_id, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run('area-kitchen', 'Kitchen', null, 0, now, now);

    sqlite
      .prepare(
        `INSERT INTO areas (id, name, parent_id, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run('area-kitchen-upper', 'Upper Cabinets', 'area-kitchen', 1, now, now);

    const child = sqlite
      .prepare('SELECT id, name, parent_id FROM areas WHERE id = ?')
      .get('area-kitchen-upper') as { id: string; name: string; parent_id: string } | undefined;
    expect(child).toBeDefined();
    expect(child?.parent_id).toBe('area-kitchen');
  });

  // ── Test 5: areas CASCADE DELETE ──────────────────────────────────────────

  it('CASCADE DELETE on parent area removes child areas', () => {
    setupPreMigrationDb(sqlite);
    runMigration0028(sqlite);

    const now = new Date().toISOString();
    sqlite
      .prepare(
        `INSERT INTO areas (id, name, parent_id, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run('area-parent', 'Ground Floor', null, 0, now, now);

    sqlite
      .prepare(
        `INSERT INTO areas (id, name, parent_id, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run('area-child-1', 'Living Room', 'area-parent', 0, now, now);

    sqlite
      .prepare(
        `INSERT INTO areas (id, name, parent_id, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run('area-child-2', 'Dining Room', 'area-parent', 1, now, now);

    // Verify children exist before delete
    const beforeCount = (
      sqlite
        .prepare('SELECT COUNT(*) AS cnt FROM areas WHERE parent_id = ?')
        .get('area-parent') as { cnt: number }
    ).cnt;
    expect(beforeCount).toBe(2);

    // Delete parent
    sqlite.prepare('DELETE FROM areas WHERE id = ?').run('area-parent');

    // Children should be gone
    const afterCount = (
      sqlite
        .prepare('SELECT COUNT(*) AS cnt FROM areas WHERE parent_id = ?')
        .get('area-parent') as { cnt: number }
    ).cnt;
    expect(afterCount).toBe(0);

    // Parent itself should be gone
    const parent = sqlite.prepare('SELECT id FROM areas WHERE id = ?').get('area-parent');
    expect(parent).toBeUndefined();
  });

  // ── Test 6: vendors table columns ─────────────────────────────────────────

  it('vendors table has trade_id column after migration', () => {
    setupPreMigrationDb(sqlite);
    runMigration0028(sqlite);

    const columns = getColumnNames(sqlite, 'vendors');
    expect(columns).toContain('trade_id');
  });

  it('vendors table no longer has specialty column after migration', () => {
    setupPreMigrationDb(sqlite);
    runMigration0028(sqlite);

    const columns = getColumnNames(sqlite, 'vendors');
    expect(columns).not.toContain('specialty');
  });

  it('existing vendors are migrated with trade_id set to trade-other by default', () => {
    setupPreMigrationDb(sqlite);
    insertUser(sqlite, 'user-001');

    // Insert a vendor with a specialty before migration
    const now = new Date().toISOString();
    sqlite
      .prepare(
        `INSERT INTO vendors (id, name, specialty, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run('vendor-001', 'Acme Plumbing Co', 'Plumbing', 'user-001', now, now);

    runMigration0028(sqlite);

    const vendor = sqlite.prepare('SELECT id, name, trade_id FROM vendors WHERE id = ?').get('vendor-001') as
      | { id: string; name: string; trade_id: string }
      | undefined;
    expect(vendor).toBeDefined();
    expect(vendor?.name).toBe('Acme Plumbing Co');
    // Default backfill is trade-other
    expect(vendor?.trade_id).toBe('trade-other');
  });

  // ── Test 7: work_items columns ────────────────────────────────────────────

  it('work_items table has assigned_vendor_id column after migration', () => {
    setupPreMigrationDb(sqlite);
    runMigration0028(sqlite);

    const columns = getColumnNames(sqlite, 'work_items');
    expect(columns).toContain('assigned_vendor_id');
  });

  it('work_items table has area_id column after migration', () => {
    setupPreMigrationDb(sqlite);
    runMigration0028(sqlite);

    const columns = getColumnNames(sqlite, 'work_items');
    expect(columns).toContain('area_id');
  });

  it('work_items area_id and assigned_vendor_id default to NULL for existing rows', () => {
    setupPreMigrationDb(sqlite);
    insertUser(sqlite, 'user-001');

    const now = new Date().toISOString();
    sqlite
      .prepare(
        `INSERT INTO work_items (id, title, status, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run('wi-001', 'Tile bathroom', 'not_started', 'user-001', now, now);

    runMigration0028(sqlite);

    const wi = sqlite
      .prepare('SELECT id, area_id, assigned_vendor_id FROM work_items WHERE id = ?')
      .get('wi-001') as { id: string; area_id: string | null; assigned_vendor_id: string | null } | undefined;
    expect(wi).toBeDefined();
    expect(wi?.area_id).toBeNull();
    expect(wi?.assigned_vendor_id).toBeNull();
  });

  // ── Test 8: household_items columns ──────────────────────────────────────

  it('household_items table has area_id column after migration', () => {
    setupPreMigrationDb(sqlite);
    runMigration0028(sqlite);

    const columns = getColumnNames(sqlite, 'household_items');
    expect(columns).toContain('area_id');
  });

  it('household_items table no longer has room column after migration', () => {
    setupPreMigrationDb(sqlite);
    runMigration0028(sqlite);

    const columns = getColumnNames(sqlite, 'household_items');
    expect(columns).not.toContain('room');
  });

  // ── Test 9: tag tables dropped ────────────────────────────────────────────

  it('tags table does not exist after migration', () => {
    setupPreMigrationDb(sqlite);
    runMigration0028(sqlite);

    const tables = getTableNames(sqlite);
    expect(tables).not.toContain('tags');
  });

  it('work_item_tags table does not exist after migration', () => {
    setupPreMigrationDb(sqlite);
    runMigration0028(sqlite);

    const tables = getTableNames(sqlite);
    expect(tables).not.toContain('work_item_tags');
  });

  it('household_item_tags table does not exist after migration', () => {
    setupPreMigrationDb(sqlite);
    runMigration0028(sqlite);

    const tables = getTableNames(sqlite);
    expect(tables).not.toContain('household_item_tags');
  });

  // ── Test 10: bc-waste budget category ────────────────────────────────────

  it('adds bc-waste budget category', () => {
    setupPreMigrationDb(sqlite);
    runMigration0028(sqlite);

    const row = sqlite
      .prepare('SELECT id, name FROM budget_categories WHERE id = ?')
      .get('bc-waste') as { id: string; name: string } | undefined;
    expect(row).toBeDefined();
    expect(row?.id).toBe('bc-waste');
    expect(row?.name).toBe('Waste');
  });

  // ── Test 11: hic-equipment HI category ───────────────────────────────────

  it('adds hic-equipment household item category', () => {
    setupPreMigrationDb(sqlite);
    runMigration0028(sqlite);

    const row = sqlite
      .prepare('SELECT id, name FROM household_item_categories WHERE id = ?')
      .get('hic-equipment') as { id: string; name: string } | undefined;
    expect(row).toBeDefined();
    expect(row?.id).toBe('hic-equipment');
    expect(row?.name).toBe('Equipment');
  });

  // ── Test 12: Idempotency ──────────────────────────────────────────────────

  it('migration is idempotent — running migrator twice does not error', () => {
    expect(() => {
      runMigrations(sqlite);
    }).not.toThrow();

    // Re-running the SQL directly (without the _migrations guard) should also not error
    // because DROP IF EXISTS and INSERT OR IGNORE are used where idempotency is required.
    // The CREATE TABLE statements would fail on re-run, so we only verify the first run.
    // Verify the migrator itself won't re-run (it uses _migrations table as guard).
    const migrationRow = sqlite
      .prepare('SELECT name FROM _migrations WHERE name = ?')
      .get('0028_areas_trades_rework.sql') as { name: string } | undefined;
    expect(migrationRow).toBeDefined();
    expect(migrationRow?.name).toBe('0028_areas_trades_rework.sql');

    // Running runMigrations again should not throw (it skips already-applied migrations)
    expect(() => {
      runMigrations(sqlite);
    }).not.toThrow();
  });

  // ── Additional: vendor_contacts recreated ────────────────────────────────

  it('vendor_contacts table is recreated with correct structure after migration', () => {
    setupPreMigrationDb(sqlite);
    runMigration0028(sqlite);

    const tables = getTableNames(sqlite);
    expect(tables).toContain('vendor_contacts');

    const columns = getColumnNames(sqlite, 'vendor_contacts');
    expect(columns).toContain('id');
    expect(columns).toContain('vendor_id');
    expect(columns).toContain('name');
    expect(columns).toContain('first_name');
    expect(columns).toContain('last_name');
    expect(columns).toContain('role');
    expect(columns).toContain('phone');
    expect(columns).toContain('email');
    expect(columns).toContain('notes');
    expect(columns).toContain('created_at');
    expect(columns).toContain('updated_at');
  });

  it('vendor FK on vendor_contacts cascades on delete', () => {
    setupPreMigrationDb(sqlite);
    insertUser(sqlite, 'user-vc');
    runMigration0028(sqlite);

    const now = new Date().toISOString();
    sqlite
      .prepare(
        `INSERT INTO vendors (id, name, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run('vendor-vc', 'VC Vendor', 'user-vc', now, now);

    sqlite
      .prepare(
        `INSERT INTO vendor_contacts (id, vendor_id, name, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run('vc-001', 'vendor-vc', 'John Doe', now, now);

    // Verify contact exists
    const before = sqlite.prepare('SELECT id FROM vendor_contacts WHERE id = ?').get('vc-001');
    expect(before).toBeDefined();

    // Delete vendor — contact should cascade
    sqlite.prepare('DELETE FROM vendors WHERE id = ?').run('vendor-vc');

    const after = sqlite.prepare('SELECT id FROM vendor_contacts WHERE id = ?').get('vc-001');
    expect(after).toBeUndefined();
  });
});
