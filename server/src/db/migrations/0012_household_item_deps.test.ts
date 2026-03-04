/**
 * Migration integration tests for 0012_household_item_deps.sql
 *
 * Tests that:
 *   1. Migration runs cleanly (all prior migrations applied first)
 *   2. `earliest_delivery_date` and `latest_delivery_date` columns added to `household_items`
 *   3. `household_item_deps` table created with correct schema, constraints, and indexes
 *   4. Existing `household_item_work_items` rows migrated as FS/0-lag deps
 *   5. Old `household_item_work_items` table dropped
 *   6. Migrated data is queryable via `household_item_deps`
 *
 * EPIC-09: Story 9.1 — Household Item Timeline Dependencies & Delivery Date Scheduling
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { runMigrations } from '../migrate.js';

describe('Migration 0012: Household Item Deps', () => {
  let sqlite: Database.Database;

  function createTestDb() {
    const db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    runMigrations(db);
    return db;
  }

  /**
   * Run all migrations up to (and including) 0011 but stop before 0012.
   * We do this by running migrations on a fresh DB up to 0011 and then manually
   * applying 0012 to test the migration logic.
   *
   * For most tests we just use the full runMigrations() and verify the end state.
   */

  /**
   * Insert a minimal user row required by FK constraints.
   */
  function insertUser(db: Database.Database, id: string) {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO users (id, email, display_name, role, auth_provider, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, `${id}@example.com`, `User ${id}`, 'member', 'local', now, now);
  }

  /**
   * Insert a minimal work item row required by FK constraints.
   */
  function insertWorkItem(db: Database.Database, id: string) {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO work_items (id, title, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(id, `Work Item ${id}`, 'not_started', now, now);
  }

  /**
   * Insert a minimal household item row.
   */
  function insertHouseholdItem(db: Database.Database, id: string) {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO household_items (id, name, category, status, quantity, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, `Item ${id}`, 'other', 'not_ordered', 1, now, now);
  }

  /**
   * Insert a minimal milestone row.
   */
  function insertMilestone(db: Database.Database, id: number, title = 'Test Milestone') {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO milestones (id, title, target_date, is_completed, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(id, title, '2026-06-01', 0, now, now);
  }

  beforeEach(() => {
    sqlite = createTestDb();
  });

  afterEach(() => {
    sqlite.close();
  });

  // ── 1. Migration execution ─────────────────────────────────────────────────

  describe('migration execution', () => {
    it('applies all migrations including 0012 without error', () => {
      // runMigrations() in createTestDb() already applied all migrations.
      // If we reach here without throwing, the migration succeeded.
      const applied = sqlite.prepare('SELECT name FROM _migrations ORDER BY name').all() as Array<{
        name: string;
      }>;

      const names = applied.map((r) => r.name);
      expect(names).toContain('0001_create_users_and_sessions.sql');
      expect(names).toContain('0010_household_items.sql');
      expect(names).toContain('0011_household_item_invoice_link.sql');
      expect(names).toContain('0012_household_item_deps.sql');
    });
  });

  // ── 2. New columns on household_items ─────────────────────────────────────

  describe('new columns on household_items', () => {
    it('adds earliest_delivery_date column to household_items', () => {
      const columns = sqlite.prepare("PRAGMA table_info('household_items')").all() as Array<{
        name: string;
        type: string;
        notnull: number;
      }>;

      const colNames = columns.map((c) => c.name);
      expect(colNames).toContain('earliest_delivery_date');
    });

    it('adds latest_delivery_date column to household_items', () => {
      const columns = sqlite.prepare("PRAGMA table_info('household_items')").all() as Array<{
        name: string;
        type: string;
        notnull: number;
      }>;

      const colNames = columns.map((c) => c.name);
      expect(colNames).toContain('latest_delivery_date');
    });

    it('earliest_delivery_date is nullable (no NOT NULL constraint)', () => {
      const columns = sqlite.prepare("PRAGMA table_info('household_items')").all() as Array<{
        name: string;
        notnull: number;
      }>;

      const col = columns.find((c) => c.name === 'earliest_delivery_date');
      expect(col).toBeDefined();
      expect(col!.notnull).toBe(0);
    });

    it('latest_delivery_date is nullable (no NOT NULL constraint)', () => {
      const columns = sqlite.prepare("PRAGMA table_info('household_items')").all() as Array<{
        name: string;
        notnull: number;
      }>;

      const col = columns.find((c) => c.name === 'latest_delivery_date');
      expect(col).toBeDefined();
      expect(col!.notnull).toBe(0);
    });

    it('new columns default to NULL on insert without specifying them', () => {
      const now = new Date().toISOString();
      sqlite
        .prepare(
          `INSERT INTO household_items (id, name, category, status, quantity, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run('item-null-dates', 'Test', 'other', 'not_ordered', 1, now, now);

      const row = sqlite
        .prepare(
          'SELECT earliest_delivery_date, latest_delivery_date FROM household_items WHERE id = ?',
        )
        .get('item-null-dates') as {
        earliest_delivery_date: string | null;
        latest_delivery_date: string | null;
      };

      expect(row.earliest_delivery_date).toBeNull();
      expect(row.latest_delivery_date).toBeNull();
    });

    it('can set and read earliest_delivery_date and latest_delivery_date', () => {
      const now = new Date().toISOString();
      sqlite
        .prepare(
          `INSERT INTO household_items (id, name, category, status, quantity, earliest_delivery_date, latest_delivery_date, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          'item-with-dates',
          'Test',
          'other',
          'not_ordered',
          1,
          '2026-05-10',
          '2026-06-01',
          now,
          now,
        );

      const row = sqlite
        .prepare(
          'SELECT earliest_delivery_date, latest_delivery_date FROM household_items WHERE id = ?',
        )
        .get('item-with-dates') as { earliest_delivery_date: string; latest_delivery_date: string };

      expect(row.earliest_delivery_date).toBe('2026-05-10');
      expect(row.latest_delivery_date).toBe('2026-06-01');
    });
  });

  // ── 3. household_item_deps table structure ─────────────────────────────────

  describe('household_item_deps table structure', () => {
    it('creates the household_item_deps table', () => {
      const table = sqlite
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='household_item_deps'`)
        .get() as { name: string } | undefined;

      expect(table).toBeDefined();
      expect(table!.name).toBe('household_item_deps');
    });

    it('has all required columns (dependency_type and lead_lag_days dropped by 0013)', () => {
      const columns = sqlite.prepare("PRAGMA table_info('household_item_deps')").all() as Array<{
        name: string;
        type: string;
        notnull: number;
        dflt_value: string | null;
      }>;

      const colMap = new Map(columns.map((c) => [c.name, c]));

      expect(colMap.has('household_item_id')).toBe(true);
      expect(colMap.has('predecessor_type')).toBe(true);
      expect(colMap.has('predecessor_id')).toBe(true);
      // dependency_type and lead_lag_days were dropped by migration 0013
      expect(colMap.has('dependency_type')).toBe(false);
      expect(colMap.has('lead_lag_days')).toBe(false);
    });

    it('household_item_id, predecessor_type, predecessor_id are NOT NULL', () => {
      const columns = sqlite.prepare("PRAGMA table_info('household_item_deps')").all() as Array<{
        name: string;
        notnull: number;
      }>;

      const colMap = new Map(columns.map((c) => [c.name, c]));

      expect(colMap.get('household_item_id')?.notnull).toBe(1);
      expect(colMap.get('predecessor_type')?.notnull).toBe(1);
      expect(colMap.get('predecessor_id')?.notnull).toBe(1);
    });

    it('dependency_type and lead_lag_days columns were removed by migration 0013', () => {
      const columns = sqlite.prepare("PRAGMA table_info('household_item_deps')").all() as Array<{
        name: string;
        dflt_value: string | null;
      }>;

      const colNames = columns.map((c) => c.name);
      expect(colNames).not.toContain('dependency_type');
      expect(colNames).not.toContain('lead_lag_days');
    });
  });

  // ── 4. household_item_deps composite primary key ───────────────────────────

  describe('household_item_deps composite primary key', () => {
    it('prevents duplicate (household_item_id, predecessor_type, predecessor_id) combinations', () => {
      insertHouseholdItem(sqlite, 'item-pk-test');
      insertWorkItem(sqlite, 'wi-pk-test');

      // First insert
      sqlite
        .prepare(
          `INSERT INTO household_item_deps (household_item_id, predecessor_type, predecessor_id)
           VALUES (?, ?, ?)`,
        )
        .run('item-pk-test', 'work_item', 'wi-pk-test');

      // Duplicate insert should fail
      let error: Error | undefined;
      try {
        sqlite
          .prepare(
            `INSERT INTO household_item_deps (household_item_id, predecessor_type, predecessor_id)
             VALUES (?, ?, ?)`,
          )
          .run('item-pk-test', 'work_item', 'wi-pk-test');
      } catch (err) {
        error = err as Error;
      }

      expect(error).toBeDefined();
      expect(error!.message).toMatch(/UNIQUE constraint failed/);
    });

    it('allows same HI with different predecessor types as separate rows', () => {
      insertHouseholdItem(sqlite, 'item-diff-type');
      insertWorkItem(sqlite, 'wi-diff-type');
      insertMilestone(sqlite, 1001, 'MS Diff Type');

      expect(() => {
        sqlite
          .prepare(
            `INSERT INTO household_item_deps (household_item_id, predecessor_type, predecessor_id)
             VALUES (?, ?, ?)`,
          )
          .run('item-diff-type', 'work_item', 'wi-diff-type');
        sqlite
          .prepare(
            `INSERT INTO household_item_deps (household_item_id, predecessor_type, predecessor_id)
             VALUES (?, ?, ?)`,
          )
          .run('item-diff-type', 'milestone', '1001');
      }).not.toThrow();

      const rows = sqlite
        .prepare(`SELECT * FROM household_item_deps WHERE household_item_id = ?`)
        .all('item-diff-type') as Array<Record<string, unknown>>;
      expect(rows).toHaveLength(2);
    });
  });

  // ── 5. predecessor_type CHECK constraint ──────────────────────────────────

  describe('predecessor_type CHECK constraint', () => {
    it('accepts work_item as predecessor_type', () => {
      insertHouseholdItem(sqlite, 'item-pred-wi');
      insertWorkItem(sqlite, 'wi-pred-wi');

      expect(() => {
        sqlite
          .prepare(
            `INSERT INTO household_item_deps (household_item_id, predecessor_type, predecessor_id)
             VALUES (?, ?, ?)`,
          )
          .run('item-pred-wi', 'work_item', 'wi-pred-wi');
      }).not.toThrow();
    });

    it('accepts milestone as predecessor_type', () => {
      insertHouseholdItem(sqlite, 'item-pred-ms');
      insertMilestone(sqlite, 2001);

      expect(() => {
        sqlite
          .prepare(
            `INSERT INTO household_item_deps (household_item_id, predecessor_type, predecessor_id)
             VALUES (?, ?, ?)`,
          )
          .run('item-pred-ms', 'milestone', '2001');
      }).not.toThrow();
    });

    it('rejects invalid predecessor_type value', () => {
      insertHouseholdItem(sqlite, 'item-pred-bad');

      let error: Error | undefined;
      try {
        sqlite
          .prepare(
            `INSERT INTO household_item_deps (household_item_id, predecessor_type, predecessor_id)
             VALUES (?, ?, ?)`,
          )
          .run('item-pred-bad', 'invalid_type', 'some-id');
      } catch (err) {
        error = err as Error;
      }

      expect(error).toBeDefined();
      expect(error!.message).toMatch(/CHECK constraint failed/);
    });
  });

  // ── 6. dependency_type CHECK constraint ──────────────────────────────────
  // NOTE: dependency_type column was dropped by migration 0013 (simplify HI deps).
  // These constraints no longer apply — all HI deps are implicitly FS with 0 lag.

  // ── 7. CASCADE on household item delete ───────────────────────────────────

  describe('CASCADE delete on household_item_deps', () => {
    it('removes household_item_deps rows when household item is deleted', () => {
      insertHouseholdItem(sqlite, 'item-cascade-deps');
      insertWorkItem(sqlite, 'wi-cascade-deps');

      sqlite
        .prepare(
          `INSERT INTO household_item_deps (household_item_id, predecessor_type, predecessor_id)
           VALUES (?, ?, ?)`,
        )
        .run('item-cascade-deps', 'work_item', 'wi-cascade-deps');

      // Verify row exists before delete
      const before = sqlite
        .prepare(`SELECT * FROM household_item_deps WHERE household_item_id = ?`)
        .all('item-cascade-deps') as Array<unknown>;
      expect(before).toHaveLength(1);

      // Delete household item — should cascade
      sqlite.prepare('DELETE FROM household_items WHERE id = ?').run('item-cascade-deps');

      const after = sqlite
        .prepare(`SELECT * FROM household_item_deps WHERE household_item_id = ?`)
        .all('item-cascade-deps') as Array<unknown>;
      expect(after).toHaveLength(0);
    });
  });

  // ── 8. Data migration from household_item_work_items ──────────────────────
  //
  // Since 0012 drops the old table AFTER migrating, we can't pre-populate
  // household_item_work_items and then run 0012. Instead, we verify the migration
  // by checking the state AFTER all migrations run: the old table is gone and
  // no data is in household_item_deps (because no rows existed before migration).
  //
  // For more detailed migration-data testing, we test the end state: that
  // household_item_deps is insertable and that the migrated structure is correct.

  describe('data migration: old table dropped', () => {
    it('household_item_work_items table no longer exists after migration', () => {
      const table = sqlite
        .prepare(
          `SELECT name FROM sqlite_master WHERE type='table' AND name='household_item_work_items'`,
        )
        .get() as { name: string } | undefined;

      // The old table should have been dropped by the migration
      expect(table).toBeUndefined();
    });

    it('household_item_deps table exists and is queryable', () => {
      // Insert test data to verify the table is operational
      insertHouseholdItem(sqlite, 'item-query-test');
      insertWorkItem(sqlite, 'wi-query-test');

      sqlite
        .prepare(
          `INSERT INTO household_item_deps (household_item_id, predecessor_type, predecessor_id)
           VALUES (?, ?, ?)`,
        )
        .run('item-query-test', 'work_item', 'wi-query-test');

      const rows = sqlite
        .prepare(`SELECT * FROM household_item_deps WHERE household_item_id = ?`)
        .all('item-query-test') as Array<{
        household_item_id: string;
        predecessor_type: string;
        predecessor_id: string;
      }>;

      expect(rows).toHaveLength(1);
      expect(rows[0].household_item_id).toBe('item-query-test');
      expect(rows[0].predecessor_type).toBe('work_item');
      expect(rows[0].predecessor_id).toBe('wi-query-test');
    });
  });

  // ── 9. Expected table set after migration ─────────────────────────────────

  describe('expected household item tables after migration', () => {
    it('has household_item_deps table but NOT household_item_work_items', () => {
      const tables = sqlite
        .prepare(
          `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'household_item%'`,
        )
        .all() as Array<{ name: string }>;

      const tableNames = tables.map((t) => t.name).sort();

      // New table present
      expect(tableNames).toContain('household_item_deps');

      // Old table dropped
      expect(tableNames).not.toContain('household_item_work_items');
    });

    it('all expected household item tables exist', () => {
      const tables = sqlite
        .prepare(
          `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'household_item%'`,
        )
        .all() as Array<{ name: string }>;

      const tableNames = tables.map((t) => t.name).sort();

      expect(tableNames).toContain('household_item_budgets');
      expect(tableNames).toContain('household_item_deps');
      expect(tableNames).toContain('household_item_notes');
      expect(tableNames).toContain('household_item_subsidies');
      expect(tableNames).toContain('household_item_tags');
      expect(tableNames).toContain('household_items');
    });
  });

  // ── 10. Index on household_item_deps ─────────────────────────────────────

  describe('indexes on household_item_deps', () => {
    it('creates idx_hi_deps_predecessor index', () => {
      const indexes = sqlite
        .prepare(
          `SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='household_item_deps'`,
        )
        .all() as Array<{ name: string }>;

      const indexNames = indexes.map((i) => i.name);
      expect(indexNames).toContain('idx_hi_deps_predecessor');
    });
  });

  // ── 11. Full dep row insert and read ──────────────────────────────────────

  describe('full dependency row insertion', () => {
    it('inserts and reads a milestone dependency', () => {
      insertHouseholdItem(sqlite, 'item-ms-dep');
      insertMilestone(sqlite, 3001, 'Frame Complete');

      sqlite
        .prepare(
          `INSERT INTO household_item_deps (household_item_id, predecessor_type, predecessor_id)
           VALUES (?, ?, ?)`,
        )
        .run('item-ms-dep', 'milestone', '3001');

      const row = sqlite
        .prepare(`SELECT * FROM household_item_deps WHERE household_item_id = ?`)
        .get('item-ms-dep') as {
        household_item_id: string;
        predecessor_type: string;
        predecessor_id: string;
      };

      expect(row.household_item_id).toBe('item-ms-dep');
      expect(row.predecessor_type).toBe('milestone');
      expect(row.predecessor_id).toBe('3001');
    });

    it('inserts multiple deps for same household item', () => {
      insertHouseholdItem(sqlite, 'item-multi-dep');
      insertWorkItem(sqlite, 'wi-multi-1');
      insertWorkItem(sqlite, 'wi-multi-2');

      sqlite
        .prepare(
          `INSERT INTO household_item_deps (household_item_id, predecessor_type, predecessor_id)
           VALUES (?, ?, ?)`,
        )
        .run('item-multi-dep', 'work_item', 'wi-multi-1');

      sqlite
        .prepare(
          `INSERT INTO household_item_deps (household_item_id, predecessor_type, predecessor_id)
           VALUES (?, ?, ?)`,
        )
        .run('item-multi-dep', 'work_item', 'wi-multi-2');

      const rows = sqlite
        .prepare(`SELECT * FROM household_item_deps WHERE household_item_id = ?`)
        .all('item-multi-dep') as Array<unknown>;
      expect(rows).toHaveLength(2);
    });
  });
});
