/**
 * Migration integration tests for 0010_household_items.sql
 *
 * Tests that the household items schema is created correctly with all
 * constraints, indexes, and cascade behavior as defined in the migration.
 *
 * EPIC-04: Household Items & Furniture Management
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { runMigrations } from '../migrate.js';

describe('Migration 0010: Household Items', () => {
  let sqlite: Database.Database;

  function createTestDb() {
    const db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    runMigrations(db);
    return db;
  }

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
   * Insert a minimal vendor row required by FK constraints.
   */
  function insertVendor(db: Database.Database, id: string) {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO vendors (id, name, created_at, updated_at)
       VALUES (?, ?, ?, ?)`,
    ).run(id, `Vendor ${id}`, now, now);
  }

  /**
   * Insert a minimal household item row.
   */
  function insertHouseholdItem(
    db: Database.Database,
    id: string,
    overrides: Record<string, unknown> = {},
  ) {
    const now = new Date().toISOString();
    const defaults = {
      id,
      name: `Item ${id}`,
      category: 'other',
      status: 'not_ordered',
      quantity: 1,
      created_at: now,
      updated_at: now,
    };
    const row = { ...defaults, ...overrides };
    db.prepare(
      `INSERT INTO household_items (id, name, category, status, quantity, created_at, updated_at)
       VALUES (@id, @name, @category, @status, @quantity, @created_at, @updated_at)`,
    ).run(row);
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
   * Insert a minimal tag row required by FK constraints.
   * Note: tags table has no updated_at column (see migration 0002).
   */
  function insertTag(db: Database.Database, id: string) {
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?)`).run(
      id,
      `Tag ${id}`,
      now,
    );
  }

  beforeEach(() => {
    sqlite = createTestDb();
  });

  afterEach(() => {
    sqlite.close();
  });

  // ── 1. Migration runs successfully ─────────────────────────────────────────

  describe('migration execution', () => {
    it('applies all prior migrations (0001-0009) without error', () => {
      // The runMigrations() call in createTestDb() applies all migrations.
      // If it reaches here the migration runner succeeded.
      const applied = sqlite.prepare('SELECT name FROM _migrations ORDER BY name').all() as Array<{
        name: string;
      }>;

      const names = applied.map((r) => r.name);
      expect(names).toContain('0001_create_users_and_sessions.sql');
      expect(names).toContain('0009_document_links.sql');
      expect(names).toContain('0010_household_items.sql');
    });

    it('creates all 6 household item tables', () => {
      const tables = sqlite
        .prepare(
          `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'household_item%'`,
        )
        .all() as Array<{ name: string }>;

      const tableNames = tables.map((t) => t.name).sort();
      // Note: migration 0012 replaces household_item_work_items with household_item_deps
      expect(tableNames).toEqual([
        'household_item_budgets',
        'household_item_deps',
        'household_item_notes',
        'household_item_subsidies',
        'household_item_tags',
        'household_items',
      ]);
    });
  });

  // ── 2. household_items table structure ────────────────────────────────────

  describe('household_items table structure', () => {
    it('has correct columns with expected types and nullability', () => {
      const columns = sqlite.prepare("PRAGMA table_info('household_items')").all() as Array<{
        name: string;
        type: string;
        notnull: number;
        pk: number;
        dflt_value: string | null;
      }>;

      const colMap = new Map(columns.map((c) => [c.name, c]));

      // Primary key
      expect(colMap.get('id')?.pk).toBe(1);

      // Required NOT NULL columns
      expect(colMap.get('name')?.notnull).toBe(1);
      expect(colMap.get('category')?.notnull).toBe(1);
      expect(colMap.get('status')?.notnull).toBe(1);
      expect(colMap.get('quantity')?.notnull).toBe(1);
      expect(colMap.get('created_at')?.notnull).toBe(1);
      expect(colMap.get('updated_at')?.notnull).toBe(1);

      // Nullable optional columns
      expect(colMap.get('description')?.notnull).toBe(0);
      expect(colMap.get('vendor_id')?.notnull).toBe(0);
      expect(colMap.get('url')?.notnull).toBe(0);
      expect(colMap.get('room')?.notnull).toBe(0);
      expect(colMap.get('order_date')?.notnull).toBe(0);
      expect(colMap.get('expected_delivery_date')?.notnull).toBe(0);
      expect(colMap.get('actual_delivery_date')?.notnull).toBe(0);
      expect(colMap.get('created_by')?.notnull).toBe(0);

      // All expected columns are present
      const expectedColumns = [
        'id',
        'name',
        'description',
        'category',
        'status',
        'vendor_id',
        'url',
        'room',
        'quantity',
        'order_date',
        'expected_delivery_date',
        'actual_delivery_date',
        'created_by',
        'created_at',
        'updated_at',
      ];
      for (const col of expectedColumns) {
        expect(colMap.has(col)).toBe(true);
      }
    });

    it('has quantity typed as INTEGER', () => {
      const columns = sqlite.prepare("PRAGMA table_info('household_items')").all() as Array<{
        name: string;
        type: string;
      }>;
      const qtyCol = columns.find((c) => c.name === 'quantity');
      expect(qtyCol?.type).toBe('INTEGER');
    });

    it('has planned_amount typed as REAL in household_item_budgets', () => {
      const columns = sqlite.prepare("PRAGMA table_info('household_item_budgets')").all() as Array<{
        name: string;
        type: string;
      }>;
      const amtCol = columns.find((c) => c.name === 'planned_amount');
      expect(amtCol?.type).toBe('REAL');
    });
  });

  // ── 3. Category CHECK constraint ──────────────────────────────────────────

  describe('category CHECK constraint', () => {
    const validCategories = [
      'furniture',
      'appliances',
      'fixtures',
      'decor',
      'electronics',
      'outdoor',
      'storage',
      'other',
    ];

    it.each(validCategories)('accepts valid category: %s', (category) => {
      const now = new Date().toISOString();
      expect(() => {
        sqlite
          .prepare(
            `INSERT INTO household_items (id, name, category, status, quantity, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(`item-${category}`, `Test ${category}`, category, 'not_ordered', 1, now, now);
      }).not.toThrow();

      const row = sqlite
        .prepare('SELECT category FROM household_items WHERE id = ?')
        .get(`item-${category}`) as { category: string };
      expect(row.category).toBe(category);
    });

    it('rejects invalid category value', () => {
      const now = new Date().toISOString();
      let error: Error | undefined;
      try {
        sqlite
          .prepare(
            `INSERT INTO household_items (id, name, category, status, quantity, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .run('item-bad-cat', 'Test Item', 'invalid_category', 'not_ordered', 1, now, now);
      } catch (err) {
        error = err as Error;
      }
      expect(error).toBeDefined();
      expect(error?.message).toMatch(/CHECK constraint failed/);
    });
  });

  // ── 4. Status CHECK constraint ────────────────────────────────────────────

  describe('status CHECK constraint', () => {
    const validStatuses = ['not_ordered', 'ordered', 'in_transit', 'delivered'];

    it.each(validStatuses)('accepts valid status: %s', (status) => {
      const now = new Date().toISOString();
      expect(() => {
        sqlite
          .prepare(
            `INSERT INTO household_items (id, name, category, status, quantity, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(`item-${status}`, `Test ${status}`, 'other', status, 1, now, now);
      }).not.toThrow();
    });

    it('rejects invalid status value', () => {
      const now = new Date().toISOString();
      let error: Error | undefined;
      try {
        sqlite
          .prepare(
            `INSERT INTO household_items (id, name, category, status, quantity, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .run('item-bad-status', 'Test Item', 'other', 'unknown_status', 1, now, now);
      } catch (err) {
        error = err as Error;
      }
      expect(error).toBeDefined();
      expect(error?.message).toMatch(/CHECK constraint failed/);
    });
  });

  // ── 5. Quantity CHECK constraint ──────────────────────────────────────────

  describe('quantity CHECK constraint', () => {
    it('allows quantity of 1', () => {
      const now = new Date().toISOString();
      expect(() => {
        sqlite
          .prepare(
            `INSERT INTO household_items (id, name, category, status, quantity, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .run('item-qty-1', 'Test Item', 'other', 'not_ordered', 1, now, now);
      }).not.toThrow();
    });

    it('allows quantity greater than 1', () => {
      const now = new Date().toISOString();
      expect(() => {
        sqlite
          .prepare(
            `INSERT INTO household_items (id, name, category, status, quantity, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .run('item-qty-5', 'Test Item', 'other', 'not_ordered', 5, now, now);
      }).not.toThrow();
    });

    it('rejects quantity of 0', () => {
      const now = new Date().toISOString();
      let error: Error | undefined;
      try {
        sqlite
          .prepare(
            `INSERT INTO household_items (id, name, category, status, quantity, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .run('item-qty-0', 'Test Item', 'other', 'not_ordered', 0, now, now);
      } catch (err) {
        error = err as Error;
      }
      expect(error).toBeDefined();
      expect(error?.message).toMatch(/CHECK constraint failed/);
    });

    it('rejects negative quantity', () => {
      const now = new Date().toISOString();
      let error: Error | undefined;
      try {
        sqlite
          .prepare(
            `INSERT INTO household_items (id, name, category, status, quantity, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .run('item-qty-neg', 'Test Item', 'other', 'not_ordered', -1, now, now);
      } catch (err) {
        error = err as Error;
      }
      expect(error).toBeDefined();
      expect(error?.message).toMatch(/CHECK constraint failed/);
    });
  });

  // ── 6. household_item_budgets planned_amount CHECK ────────────────────────

  describe('household_item_budgets planned_amount CHECK constraint', () => {
    it('allows planned_amount of 0', () => {
      insertHouseholdItem(sqlite, 'item-budget-1');
      const now = new Date().toISOString();
      expect(() => {
        sqlite
          .prepare(
            `INSERT INTO household_item_budgets (id, household_item_id, planned_amount, confidence, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .run('budget-1', 'item-budget-1', 0, 'own_estimate', now, now);
      }).not.toThrow();
    });

    it('allows positive planned_amount', () => {
      insertHouseholdItem(sqlite, 'item-budget-2');
      const now = new Date().toISOString();
      expect(() => {
        sqlite
          .prepare(
            `INSERT INTO household_item_budgets (id, household_item_id, planned_amount, confidence, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .run('budget-2', 'item-budget-2', 1500.5, 'quote', now, now);
      }).not.toThrow();
    });

    it('rejects negative planned_amount', () => {
      insertHouseholdItem(sqlite, 'item-budget-3');
      const now = new Date().toISOString();
      let error: Error | undefined;
      try {
        sqlite
          .prepare(
            `INSERT INTO household_item_budgets (id, household_item_id, planned_amount, confidence, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .run('budget-3', 'item-budget-3', -1, 'own_estimate', now, now);
      } catch (err) {
        error = err as Error;
      }
      expect(error).toBeDefined();
      expect(error?.message).toMatch(/CHECK constraint failed/);
    });
  });

  // ── 7. household_item_tags composite PK ───────────────────────────────────

  describe('household_item_tags composite primary key', () => {
    it('prevents duplicate (household_item_id, tag_id) pairs', () => {
      insertHouseholdItem(sqlite, 'item-tag-pk');
      insertTag(sqlite, 'tag-pk-1');

      // First insert succeeds
      sqlite
        .prepare(`INSERT INTO household_item_tags (household_item_id, tag_id) VALUES (?, ?)`)
        .run('item-tag-pk', 'tag-pk-1');

      // Duplicate insert should fail
      let error: Error | undefined;
      try {
        sqlite
          .prepare(`INSERT INTO household_item_tags (household_item_id, tag_id) VALUES (?, ?)`)
          .run('item-tag-pk', 'tag-pk-1');
      } catch (err) {
        error = err as Error;
      }
      expect(error).toBeDefined();
      expect(error?.message).toMatch(/UNIQUE constraint failed/);
    });

    it('allows same item linked to different tags', () => {
      insertHouseholdItem(sqlite, 'item-multi-tag');
      insertTag(sqlite, 'tag-a');
      insertTag(sqlite, 'tag-b');

      expect(() => {
        sqlite
          .prepare(`INSERT INTO household_item_tags (household_item_id, tag_id) VALUES (?, ?)`)
          .run('item-multi-tag', 'tag-a');
        sqlite
          .prepare(`INSERT INTO household_item_tags (household_item_id, tag_id) VALUES (?, ?)`)
          .run('item-multi-tag', 'tag-b');
      }).not.toThrow();

      const links = sqlite
        .prepare('SELECT * FROM household_item_tags WHERE household_item_id = ?')
        .all('item-multi-tag');
      expect(links).toHaveLength(2);
    });
  });

  // ── 8. CASCADE on household item delete ───────────────────────────────────

  describe('CASCADE delete from household_items', () => {
    it('removes tag links when household item is deleted', () => {
      insertHouseholdItem(sqlite, 'item-cascade-1');
      insertTag(sqlite, 'tag-cascade-1');
      sqlite
        .prepare(`INSERT INTO household_item_tags (household_item_id, tag_id) VALUES (?, ?)`)
        .run('item-cascade-1', 'tag-cascade-1');

      sqlite.prepare('DELETE FROM household_items WHERE id = ?').run('item-cascade-1');

      const links = sqlite
        .prepare('SELECT * FROM household_item_tags WHERE household_item_id = ?')
        .all('item-cascade-1');
      expect(links).toHaveLength(0);
    });

    it('removes notes when household item is deleted', () => {
      insertHouseholdItem(sqlite, 'item-cascade-notes');
      const now = new Date().toISOString();
      sqlite
        .prepare(
          `INSERT INTO household_item_notes (id, household_item_id, content, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run('note-1', 'item-cascade-notes', 'A note', now, now);

      sqlite.prepare('DELETE FROM household_items WHERE id = ?').run('item-cascade-notes');

      const notes = sqlite
        .prepare('SELECT * FROM household_item_notes WHERE household_item_id = ?')
        .all('item-cascade-notes');
      expect(notes).toHaveLength(0);
    });

    it('removes budget lines when household item is deleted', () => {
      insertHouseholdItem(sqlite, 'item-cascade-budgets');
      const now = new Date().toISOString();
      sqlite
        .prepare(
          `INSERT INTO household_item_budgets (id, household_item_id, planned_amount, confidence, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run('bud-1', 'item-cascade-budgets', 500, 'quote', now, now);

      sqlite.prepare('DELETE FROM household_items WHERE id = ?').run('item-cascade-budgets');

      const budgets = sqlite
        .prepare('SELECT * FROM household_item_budgets WHERE household_item_id = ?')
        .all('item-cascade-budgets');
      expect(budgets).toHaveLength(0);
    });

    it('removes dependency links when household item is deleted', () => {
      // Note: migration 0012 replaced household_item_work_items with household_item_deps
      insertHouseholdItem(sqlite, 'item-cascade-dep');
      insertWorkItem(sqlite, 'wi-cascade-dep-1');
      sqlite
        .prepare(
          `INSERT INTO household_item_deps (household_item_id, predecessor_type, predecessor_id)
           VALUES (?, ?, ?)`,
        )
        .run('item-cascade-dep', 'work_item', 'wi-cascade-dep-1');

      sqlite.prepare('DELETE FROM household_items WHERE id = ?').run('item-cascade-dep');

      const links = sqlite
        .prepare('SELECT * FROM household_item_deps WHERE household_item_id = ?')
        .all('item-cascade-dep');
      expect(links).toHaveLength(0);
    });

    it('removes subsidy links when household item is deleted', () => {
      insertHouseholdItem(sqlite, 'item-cascade-sub');

      // Need a subsidy_program row — insert via raw SQL to avoid deep FK chain
      const now = new Date().toISOString();
      sqlite
        .prepare(
          `INSERT INTO subsidy_programs (id, name, reduction_type, reduction_value, application_status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run('sp-1', 'Program A', 'percentage', 10, 'eligible', now, now);

      sqlite
        .prepare(
          `INSERT INTO household_item_subsidies (household_item_id, subsidy_program_id) VALUES (?, ?)`,
        )
        .run('item-cascade-sub', 'sp-1');

      sqlite.prepare('DELETE FROM household_items WHERE id = ?').run('item-cascade-sub');

      const links = sqlite
        .prepare('SELECT * FROM household_item_subsidies WHERE household_item_id = ?')
        .all('item-cascade-sub');
      expect(links).toHaveLength(0);
    });
  });

  // ── 9. CASCADE on work item delete ────────────────────────────────────────
  // Note: migration 0012 replaced household_item_work_items with household_item_deps.
  // Dep rows with predecessor_type='work_item' are NOT cascade-deleted when the WI is deleted
  // (the predecessor_id is just a string ref, not a FK). We test the HI cascade instead.

  describe('CASCADE on household_item delete removes dependency rows', () => {
    it('removes dep rows when household item is deleted', () => {
      insertHouseholdItem(sqlite, 'item-hi-dep-cascade');
      insertWorkItem(sqlite, 'wi-dep-cascade');
      sqlite
        .prepare(
          `INSERT INTO household_item_deps (household_item_id, predecessor_type, predecessor_id)
           VALUES (?, ?, ?)`,
        )
        .run('item-hi-dep-cascade', 'work_item', 'wi-dep-cascade');

      sqlite.prepare('DELETE FROM household_items WHERE id = ?').run('item-hi-dep-cascade');

      const rows = sqlite
        .prepare('SELECT * FROM household_item_deps WHERE household_item_id = ?')
        .all('item-hi-dep-cascade');
      expect(rows).toHaveLength(0);
    });
  });

  // ── 10. vendor_id SET NULL on vendor delete ───────────────────────────────

  describe('vendor_id SET NULL on vendor delete', () => {
    it('sets vendor_id to NULL when vendor is deleted', () => {
      insertVendor(sqlite, 'vendor-setnull');
      const now = new Date().toISOString();
      sqlite
        .prepare(
          `INSERT INTO household_items (id, name, category, status, quantity, vendor_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          'item-vendor-setnull',
          'Test Item',
          'other',
          'not_ordered',
          1,
          'vendor-setnull',
          now,
          now,
        );

      // Verify vendor_id is set
      const before = sqlite
        .prepare('SELECT vendor_id FROM household_items WHERE id = ?')
        .get('item-vendor-setnull') as { vendor_id: string | null };
      expect(before.vendor_id).toBe('vendor-setnull');

      // Delete the vendor
      sqlite.prepare('DELETE FROM vendors WHERE id = ?').run('vendor-setnull');

      // vendor_id should be NULL now
      const after = sqlite
        .prepare('SELECT vendor_id FROM household_items WHERE id = ?')
        .get('item-vendor-setnull') as { vendor_id: string | null };
      expect(after.vendor_id).toBeNull();
    });
  });

  // ── 11. created_by SET NULL on user delete ────────────────────────────────

  describe('created_by SET NULL on user delete', () => {
    it('sets created_by to NULL when user is deleted', () => {
      insertUser(sqlite, 'user-setnull');
      const now = new Date().toISOString();
      sqlite
        .prepare(
          `INSERT INTO household_items (id, name, category, status, quantity, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run('item-user-setnull', 'Test Item', 'other', 'not_ordered', 1, 'user-setnull', now, now);

      // Verify created_by is set
      const before = sqlite
        .prepare('SELECT created_by FROM household_items WHERE id = ?')
        .get('item-user-setnull') as { created_by: string | null };
      expect(before.created_by).toBe('user-setnull');

      // Delete the user — need to clear session FK first if any
      sqlite.prepare('DELETE FROM users WHERE id = ?').run('user-setnull');

      // created_by should be NULL now
      const after = sqlite
        .prepare('SELECT created_by FROM household_items WHERE id = ?')
        .get('item-user-setnull') as { created_by: string | null };
      expect(after.created_by).toBeNull();
    });
  });

  // ── 12. Indexes on household_items ────────────────────────────────────────

  describe('indexes on household_items', () => {
    it('creates all 5 required indexes on household_items table', () => {
      const indexes = sqlite
        .prepare(`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='household_items'`)
        .all() as Array<{ name: string }>;

      const indexNames = indexes.map((i) => i.name);
      expect(indexNames).toContain('idx_household_items_category');
      expect(indexNames).toContain('idx_household_items_status');
      expect(indexNames).toContain('idx_household_items_room');
      expect(indexNames).toContain('idx_household_items_vendor_id');
      expect(indexNames).toContain('idx_household_items_created_at');
    });

    it('creates index on household_item_tags tag_id', () => {
      const indexes = sqlite
        .prepare(
          `SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='household_item_tags'`,
        )
        .all() as Array<{ name: string }>;
      const indexNames = indexes.map((i) => i.name);
      expect(indexNames).toContain('idx_household_item_tags_tag_id');
    });

    it('creates index on household_item_notes household_item_id', () => {
      const indexes = sqlite
        .prepare(
          `SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='household_item_notes'`,
        )
        .all() as Array<{ name: string }>;
      const indexNames = indexes.map((i) => i.name);
      expect(indexNames).toContain('idx_household_item_notes_household_item_id');
    });

    it('creates all 4 required indexes on household_item_budgets', () => {
      const indexes = sqlite
        .prepare(
          `SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='household_item_budgets'`,
        )
        .all() as Array<{ name: string }>;
      const indexNames = indexes.map((i) => i.name);
      expect(indexNames).toContain('idx_household_item_budgets_household_item_id');
      expect(indexNames).toContain('idx_household_item_budgets_vendor_id');
      expect(indexNames).toContain('idx_household_item_budgets_budget_category_id');
      expect(indexNames).toContain('idx_household_item_budgets_budget_source_id');
    });

    it('creates index on household_item_deps (added by migration 0012)', () => {
      // migration 0012 replaced household_item_work_items with household_item_deps
      // and added idx_hi_deps_predecessor index
      const indexes = sqlite
        .prepare(
          `SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='household_item_deps'`,
        )
        .all() as Array<{ name: string }>;
      const indexNames = indexes.map((i) => i.name);
      expect(indexNames).toContain('idx_hi_deps_predecessor');
    });

    it('creates index on household_item_subsidies subsidy_program_id', () => {
      const indexes = sqlite
        .prepare(
          `SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='household_item_subsidies'`,
        )
        .all() as Array<{ name: string }>;
      const indexNames = indexes.map((i) => i.name);
      expect(indexNames).toContain('idx_household_item_subsidies_subsidy_program_id');
    });
  });

  // ── 13. Successful full insert ────────────────────────────────────────────

  describe('full record insertion', () => {
    it('can insert a household item with all optional fields populated', () => {
      insertVendor(sqlite, 'vendor-full');
      insertUser(sqlite, 'user-full');

      const now = new Date().toISOString();
      sqlite
        .prepare(
          `INSERT INTO household_items
             (id, name, description, category, status, vendor_id, url, room, quantity,
              order_date, expected_delivery_date, actual_delivery_date, created_by,
              created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          'item-full',
          'Leather Sofa',
          'A beautiful 3-seat leather sofa',
          'furniture',
          'ordered',
          'vendor-full',
          'https://example.com/sofa',
          'Living Room',
          2,
          '2025-01-15',
          '2025-02-15',
          null,
          'user-full',
          now,
          now,
        );

      const row = sqlite
        .prepare('SELECT * FROM household_items WHERE id = ?')
        .get('item-full') as Record<string, unknown>;

      expect(row.name).toBe('Leather Sofa');
      expect(row.category).toBe('furniture');
      expect(row.status).toBe('ordered');
      expect(row.quantity).toBe(2);
      expect(row.room).toBe('Living Room');
      expect(row.vendor_id).toBe('vendor-full');
      expect(row.url).toBe('https://example.com/sofa');
      expect(row.order_date).toBe('2025-01-15');
      expect(row.expected_delivery_date).toBe('2025-02-15');
      expect(row.actual_delivery_date).toBeNull();
      expect(row.created_by).toBe('user-full');
    });
  });
});
