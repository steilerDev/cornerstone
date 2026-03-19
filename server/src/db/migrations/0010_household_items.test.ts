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
      category_id: 'hic-other',
      status: 'planned',
      quantity: 1,
      created_at: now,
      updated_at: now,
    };
    const row = { ...defaults, ...overrides };
    db.prepare(
      `INSERT INTO household_items (id, name, category_id, status, quantity, created_at, updated_at)
       VALUES (@id, @name, @category_id, @status, @quantity, @created_at, @updated_at)`,
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

    it('creates all household item tables (including categories from migration 0016)', () => {
      const tables = sqlite
        .prepare(
          `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'household_item%'`,
        )
        .all() as Array<{ name: string }>;

      const tableNames = tables.map((t) => t.name).sort();
      // Note: migration 0012 replaces household_item_work_items with household_item_deps
      // Note: migration 0016 adds household_item_categories
      expect(tableNames).toEqual([
        'household_item_budgets',
        'household_item_categories',
        'household_item_deps',
        'household_item_notes',
        'household_item_subsidies',
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
      // category column was replaced by category_id FK in migration 0016
      expect(colMap.get('category_id')).toBeDefined();
      expect(colMap.get('status')?.notnull).toBe(1);
      expect(colMap.get('quantity')?.notnull).toBe(1);
      expect(colMap.get('created_at')?.notnull).toBe(1);
      expect(colMap.get('updated_at')?.notnull).toBe(1);

      // Nullable optional columns
      expect(colMap.get('description')?.notnull).toBe(0);
      expect(colMap.get('vendor_id')?.notnull).toBe(0);
      expect(colMap.get('url')?.notnull).toBe(0);
      expect(colMap.get('area_id')?.notnull).toBe(0);
      expect(colMap.get('order_date')?.notnull).toBe(0);
      expect(colMap.get('actual_delivery_date')?.notnull).toBe(0);
      expect(colMap.get('created_by')?.notnull).toBe(0);

      // room column was replaced by area_id FK in migration 0028
      expect(colMap.has('room')).toBe(false);

      // All expected columns are present
      // (expected_delivery_date removed in 0015; category removed in 0016; room removed in 0028, replaced by area_id)
      const expectedColumns = [
        'id',
        'name',
        'description',
        'category_id',
        'status',
        'vendor_id',
        'url',
        'area_id',
        'quantity',
        'order_date',
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

  // ── 3. Category FK constraint (migration 0016 replaced old enum CHECK) ─────
  //
  // Migration 0016 dropped the 'category' TEXT column with CHECK constraint and
  // replaced it with 'category_id' TEXT FK referencing 'household_item_categories'.
  // Migration 0016 also seeds 8 default category rows (hic-furniture, hic-appliances, etc.)

  describe('category_id FK constraint (added by migration 0016)', () => {
    const validCategoryIds = [
      'hic-furniture',
      'hic-appliances',
      'hic-fixtures',
      'hic-decor',
      'hic-electronics',
      'hic-outdoor',
      'hic-storage',
      'hic-other',
    ];

    it.each(validCategoryIds)('accepts seeded category_id: %s', (categoryId) => {
      const now = new Date().toISOString();
      expect(() => {
        sqlite
          .prepare(
            `INSERT INTO household_items (id, name, category_id, status, quantity, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(`item-${categoryId}`, `Test ${categoryId}`, categoryId, 'planned', 1, now, now);
      }).not.toThrow();

      const row = sqlite
        .prepare('SELECT category_id FROM household_items WHERE id = ?')
        .get(`item-${categoryId}`) as { category_id: string };
      expect(row.category_id).toBe(categoryId);
    });

    it('rejects invalid category_id (FK constraint violation)', () => {
      const now = new Date().toISOString();
      let error: Error | undefined;
      try {
        sqlite
          .prepare(
            `INSERT INTO household_items (id, name, category_id, status, quantity, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .run('item-bad-cat', 'Test Item', 'non-existent-category', 'planned', 1, now, now);
      } catch (err) {
        error = err as Error;
      }
      expect(error).toBeDefined();
      expect(error?.message).toMatch(/FOREIGN KEY constraint failed/);
    });
  });

  // ── 4. Status CHECK constraint ────────────────────────────────────────────

  describe('status CHECK constraint', () => {
    const validStatuses = ['planned', 'purchased', 'scheduled', 'arrived'];

    it.each(validStatuses)('accepts valid status: %s', (status) => {
      const now = new Date().toISOString();
      expect(() => {
        sqlite
          .prepare(
            `INSERT INTO household_items (id, name, category_id, status, quantity, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(`item-${status}`, `Test ${status}`, 'hic-other', status, 1, now, now);
      }).not.toThrow();
    });

    it('rejects invalid status value', () => {
      const now = new Date().toISOString();
      let error: Error | undefined;
      try {
        sqlite
          .prepare(
            `INSERT INTO household_items (id, name, category_id, status, quantity, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .run('item-bad-status', 'Test Item', 'hic-other', 'unknown_status', 1, now, now);
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
            `INSERT INTO household_items (id, name, category_id, status, quantity, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .run('item-qty-1', 'Test Item', 'hic-other', 'planned', 1, now, now);
      }).not.toThrow();
    });

    it('allows quantity greater than 1', () => {
      const now = new Date().toISOString();
      expect(() => {
        sqlite
          .prepare(
            `INSERT INTO household_items (id, name, category_id, status, quantity, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .run('item-qty-5', 'Test Item', 'hic-other', 'planned', 5, now, now);
      }).not.toThrow();
    });

    it('rejects quantity of 0', () => {
      const now = new Date().toISOString();
      let error: Error | undefined;
      try {
        sqlite
          .prepare(
            `INSERT INTO household_items (id, name, category_id, status, quantity, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .run('item-qty-0', 'Test Item', 'hic-other', 'planned', 0, now, now);
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
            `INSERT INTO household_items (id, name, category_id, status, quantity, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .run('item-qty-neg', 'Test Item', 'hic-other', 'planned', -1, now, now);
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

  // ── 7. household_items area_id column (migration 0028) ─────────────────────

  describe('household_items area_id column', () => {
    it('household_item_tags table no longer exists after migration 0028', () => {
      const tables = sqlite
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='household_item_tags'`)
        .all();
      expect(tables).toHaveLength(0);
    });

    it('household_items has area_id column that can be null', () => {
      insertHouseholdItem(sqlite, 'item-area-null');
      const row = sqlite
        .prepare('SELECT area_id FROM household_items WHERE id = ?')
        .get('item-area-null') as Record<string, unknown>;
      expect(row.area_id).toBeNull();
    });
  });

  // ── 8. CASCADE on household item delete ───────────────────────────────────

  describe('CASCADE delete from household_items', () => {
    it('removes dependency records when household item is deleted', () => {
      insertHouseholdItem(sqlite, 'item-cascade-dep');
      insertHouseholdItem(sqlite, 'item-other');

      // Note: household_item_tags table no longer exists after migration 0028
      // Verify that notes cascade still works
      const now = new Date().toISOString();
      sqlite
        .prepare(
          `INSERT INTO household_item_notes (id, household_item_id, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
        )
        .run('note-cascade', 'item-cascade-dep', 'test note', now, now);

      sqlite.prepare('DELETE FROM household_items WHERE id = ?').run('item-cascade-dep');

      const notes = sqlite
        .prepare('SELECT * FROM household_item_notes WHERE household_item_id = ?')
        .all('item-cascade-dep');
      expect(notes).toHaveLength(0);
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
          `INSERT INTO household_items (id, name, category_id, status, quantity, vendor_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          'item-vendor-setnull',
          'Test Item',
          'hic-other',
          'planned',
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
          `INSERT INTO household_items (id, name, category_id, status, quantity, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run('item-user-setnull', 'Test Item', 'hic-other', 'planned', 1, 'user-setnull', now, now);

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
      // migration 0016 replaced idx_household_items_category with idx_household_items_category_id
      expect(indexNames).toContain('idx_household_items_category_id');
      expect(indexNames).toContain('idx_household_items_status');
      // migration 0028 replaced idx_household_items_room with idx_household_items_area_id
      expect(indexNames).toContain('idx_household_items_area_id');
      expect(indexNames).toContain('idx_household_items_vendor_id');
      expect(indexNames).toContain('idx_household_items_created_at');
      expect(indexNames).not.toContain('idx_household_items_room');
    });

    it('household_item_tags index no longer exists after migration 0028', () => {
      const indexes = sqlite
        .prepare(
          `SELECT name FROM sqlite_master WHERE type='index' AND name='idx_household_item_tags_tag_id'`,
        )
        .all() as Array<{ name: string }>;
      expect(indexes).toHaveLength(0);
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
             (id, name, description, category_id, status, vendor_id, url, quantity,
              order_date, actual_delivery_date, created_by,
              created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          'item-full',
          'Leather Sofa',
          'A beautiful 3-seat leather sofa',
          'hic-furniture',
          'purchased',
          'vendor-full',
          'https://example.com/sofa',
          2,
          '2025-01-15',
          null,
          'user-full',
          now,
          now,
        );

      const row = sqlite
        .prepare('SELECT * FROM household_items WHERE id = ?')
        .get('item-full') as Record<string, unknown>;

      expect(row.name).toBe('Leather Sofa');
      expect(row.category_id).toBe('hic-furniture');
      expect(row.status).toBe('purchased');
      expect(row.quantity).toBe(2);
      expect(row.area_id).toBeNull();
      expect(row.vendor_id).toBe('vendor-full');
      expect(row.url).toBe('https://example.com/sofa');
      expect(row.order_date).toBe('2025-01-15');
      expect(row.actual_delivery_date).toBeNull();
      expect(row.created_by).toBe('user-full');
    });
  });
});
