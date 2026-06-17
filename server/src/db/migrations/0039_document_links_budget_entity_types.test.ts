/**
 * Migration integration tests for 0039_document_links_budget_entity_types.sql
 *
 * Tests that:
 *   1. Applies on an empty document_links table without error
 *   2. Preserves existing work_item, household_item, invoice rows inserted pre-migration
 *   3. INSERT entity_type='budget_source' succeeds post-migration
 *   4. INSERT entity_type='subsidy_program' succeeds post-migration
 *   5. INSERT bogus entity_type throws CHECK constraint violation
 *   6. All three indexes exist (idx_document_links_unique, idx_document_links_entity, idx_document_links_paperless_doc)
 *   7. UNIQUE (entity_type, entity_id, paperless_document_id) still enforced
 *
 * Story: #1744 Attach documents to budget sources and subsidy programs
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { mkdtempSync, symlinkSync, unlinkSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { runMigrations } from '../migrate.js';

const MIGRATIONS_DIR = dirname(fileURLToPath(import.meta.url));

// All migrations that must run before 0039
const PRE_0039_MIGRATIONS = [
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
  '0028_add_quotation_status.sql',
  '0028_areas_trades_rework.sql',
  '0029_fix_vendor_contacts_columns.sql',
  '0030_translation_keys.sql',
  '0031_fix_vat_storage_semantics.sql',
  '0031_includes_vat_not_null.sql',
  '0032_invoice_deposits.sql',
  '0033_diary_entry_status.sql',
  '0034_photo_annotations.sql',
  '0035_add_photo_area.sql',
  '0036_orphan_work_item_budgets.sql',
  '0037_orientations.sql',
  '0038_add_photo_orientation.sql',
];

/**
 * Apply migrations 0001–0038 to a fresh in-memory DB using symlinks in a temp dir.
 */
function setupPreMigrationDb(db: Database.Database): void {
  const tempDir = mkdtempSync(join(tmpdir(), 'cs-mig-0039-test-'));
  const symlinks: string[] = [];

  for (const file of PRE_0039_MIGRATIONS) {
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
 * Apply migration 0039 directly on a DB that already has 0001–0038 applied.
 */
function runMigration0039(db: Database.Database): void {
  const sql = readFileSync(
    join(MIGRATIONS_DIR, '0039_document_links_budget_entity_types.sql'),
    'utf-8',
  );
  db.exec(sql);
  db.prepare('INSERT OR IGNORE INTO _migrations (name) VALUES (?)').run(
    '0039_document_links_budget_entity_types.sql',
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function insertUser(db: Database.Database, id: string): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO users (id, email, display_name, role, auth_provider, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, `${id}@example.com`, `User ${id}`, 'member', 'local', now, now);
}

function insertDocumentLink(
  db: Database.Database,
  id: string,
  entityType: string,
  entityId: string,
  paperlessDocumentId: number,
): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO document_links (id, entity_type, entity_id, paperless_document_id, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(id, entityType, entityId, paperlessDocumentId, now);
}

function indexExists(db: Database.Database, indexName: string): boolean {
  const result = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='index' AND name=?`)
    .get(indexName) as { name: string } | undefined;
  return result !== undefined;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Migration 0039: Widen document_links entity_type CHECK constraint', () => {
  let sqlite: Database.Database;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    // Suppress migration runner console output during tests
    const originalWarn = console.warn;
    console.warn = () => undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Custom property on better-sqlite3 instance
    (sqlite as any).__originalWarn = originalWarn;
  });

  afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Custom property on better-sqlite3 instance
    const originalWarn = (sqlite as any).__originalWarn;
    if (originalWarn) console.warn = originalWarn;
    sqlite.close();
  });

  // ── Scenario 1: Applies on empty table ────────────────────────────────────

  it('applies without error when document_links table is empty', () => {
    setupPreMigrationDb(sqlite);

    expect(() => {
      runMigration0039(sqlite);
    }).not.toThrow();

    const count = (
      sqlite.prepare('SELECT COUNT(*) AS cnt FROM document_links').get() as { cnt: number }
    ).cnt;
    expect(count).toBe(0);
  });

  // ── Scenario 2: Preserves existing rows ───────────────────────────────────

  it('preserves pre-migration work_item, household_item, and invoice rows after migration', () => {
    setupPreMigrationDb(sqlite);
    insertUser(sqlite, 'user-001');

    // Insert pre-migration rows for each legacy entity type
    insertDocumentLink(sqlite, 'link-wi', 'work_item', 'wi-123', 10);
    insertDocumentLink(sqlite, 'link-hi', 'household_item', 'hi-456', 20);
    insertDocumentLink(sqlite, 'link-inv', 'invoice', 'inv-789', 30);

    runMigration0039(sqlite);

    const rows = sqlite
      .prepare(
        'SELECT id, entity_type, entity_id, paperless_document_id FROM document_links ORDER BY id',
      )
      .all() as {
      id: string;
      entity_type: string;
      entity_id: string;
      paperless_document_id: number;
    }[];

    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.id === 'link-wi')).toMatchObject({
      entity_type: 'work_item',
      entity_id: 'wi-123',
      paperless_document_id: 10,
    });
    expect(rows.find((r) => r.id === 'link-hi')).toMatchObject({
      entity_type: 'household_item',
      entity_id: 'hi-456',
      paperless_document_id: 20,
    });
    expect(rows.find((r) => r.id === 'link-inv')).toMatchObject({
      entity_type: 'invoice',
      entity_id: 'inv-789',
      paperless_document_id: 30,
    });
  });

  // ── Scenario 3: INSERT budget_source succeeds post-migration ─────────────

  it("INSERT entity_type='budget_source' succeeds after migration", () => {
    setupPreMigrationDb(sqlite);
    runMigration0039(sqlite);

    expect(() => {
      insertDocumentLink(sqlite, 'link-bs', 'budget_source', 'bs-001', 100);
    }).not.toThrow();

    const row = sqlite
      .prepare('SELECT entity_type FROM document_links WHERE id=?')
      .get('link-bs') as { entity_type: string } | undefined;
    expect(row?.entity_type).toBe('budget_source');
  });

  // ── Scenario 4: INSERT subsidy_program succeeds post-migration ───────────

  it("INSERT entity_type='subsidy_program' succeeds after migration", () => {
    setupPreMigrationDb(sqlite);
    runMigration0039(sqlite);

    expect(() => {
      insertDocumentLink(sqlite, 'link-sp', 'subsidy_program', 'sp-001', 200);
    }).not.toThrow();

    const row = sqlite
      .prepare('SELECT entity_type FROM document_links WHERE id=?')
      .get('link-sp') as { entity_type: string } | undefined;
    expect(row?.entity_type).toBe('subsidy_program');
  });

  // ── Scenario 5: Bogus entity_type throws CHECK constraint ─────────────────

  it('INSERT with an invalid entity_type throws a CHECK constraint violation', () => {
    setupPreMigrationDb(sqlite);
    runMigration0039(sqlite);

    expect(() => {
      insertDocumentLink(sqlite, 'link-bad', 'bad_type', 'entity-001', 999);
    }).toThrow();
  });

  // ── Scenario 6: All three indexes exist ───────────────────────────────────

  it('all three indexes exist after migration', () => {
    setupPreMigrationDb(sqlite);
    runMigration0039(sqlite);

    expect(indexExists(sqlite, 'idx_document_links_unique')).toBe(true);
    expect(indexExists(sqlite, 'idx_document_links_entity')).toBe(true);
    expect(indexExists(sqlite, 'idx_document_links_paperless_doc')).toBe(true);
  });

  // ── Scenario 7: UNIQUE constraint still enforced ──────────────────────────

  it('UNIQUE(entity_type, entity_id, paperless_document_id) is still enforced after migration', () => {
    setupPreMigrationDb(sqlite);
    runMigration0039(sqlite);

    insertDocumentLink(sqlite, 'link-first', 'budget_source', 'bs-001', 42);

    // Same (entity_type, entity_id, paperless_document_id) → UNIQUE violation
    expect(() => {
      insertDocumentLink(sqlite, 'link-dup', 'budget_source', 'bs-001', 42);
    }).toThrow(/UNIQUE constraint failed/i);

    // Different entity_id is allowed
    expect(() => {
      insertDocumentLink(sqlite, 'link-diff-entity', 'budget_source', 'bs-002', 42);
    }).not.toThrow();

    // Different paperless_document_id is allowed
    expect(() => {
      insertDocumentLink(sqlite, 'link-diff-doc', 'budget_source', 'bs-001', 43);
    }).not.toThrow();
  });
});
