/**
 * Migration integration tests for 0029_fix_vendor_contacts_columns.sql
 *
 * Tests that:
 *   1. No-op on empty vendor_contacts table (no corruption detected)
 *   2. No-op on correctly-ordered data (real email address is not detected as datetime)
 *   3. Corrects corrupted data (shifted columns from buggy 0028 SELECT * pattern)
 *   4. Handles NULL first_name / last_name with COALESCE fallback for timestamps
 *   5. Idempotency: running 0029 twice does not further corrupt data
 *
 * Story: Fix vendor_contacts column corruption introduced by migration 0028
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { mkdtempSync, symlinkSync, unlinkSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { runMigrations } from '../migrate.js';

const MIGRATIONS_DIR = dirname(fileURLToPath(import.meta.url));

// Migrations that must run before 0029 (includes the fixed 0028)
const PRE_0029_MIGRATIONS = [
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
  '0028_areas_trades_rework.sql',
];

/**
 * Apply migrations 0001–0028 (fixed) to a fresh in-memory DB.
 */
function setupPreMigrationDb(db: Database.Database): void {
  const tempDir = mkdtempSync(join(tmpdir(), 'cs-mig-0029-test-'));
  const symlinks: string[] = [];

  for (const file of PRE_0029_MIGRATIONS) {
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
 * Apply migration 0029 directly on a DB that already has 0001–0028 applied.
 */
function runMigration0029(db: Database.Database): void {
  const sql = readFileSync(
    join(MIGRATIONS_DIR, '0029_fix_vendor_contacts_columns.sql'),
    'utf-8',
  );
  db.exec(sql);
  db.prepare('INSERT OR IGNORE INTO _migrations (name) VALUES (?)').run(
    '0029_fix_vendor_contacts_columns.sql',
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

function insertVendor(db: Database.Database, vendorId: string, userId: string): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO vendors (id, name, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(vendorId, `Vendor ${vendorId}`, userId, now, now);
}

interface VendorContactRow {
  id: string;
  vendor_id: string;
  name: string;
  first_name: string | null;
  last_name: string | null;
  role: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

function getContact(db: Database.Database, id: string): VendorContactRow | undefined {
  return db
    .prepare('SELECT * FROM vendor_contacts WHERE id = ?')
    .get(id) as VendorContactRow | undefined;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Migration 0029: Fix vendor_contacts column corruption', () => {
  let sqlite: Database.Database;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    // Suppress migration runner console output
    const originalWarn = console.warn;
    console.warn = () => undefined;
    (sqlite as any).__originalWarn = originalWarn;
  });

  afterEach(() => {
    const originalWarn = (sqlite as any).__originalWarn;
    if (originalWarn) console.warn = originalWarn;
    sqlite.close();
  });

  // ── Scenario 1: No-op on empty table ─────────────────────────────────────

  it('applies without error when vendor_contacts table is empty', () => {
    setupPreMigrationDb(sqlite);

    expect(() => {
      runMigration0029(sqlite);
    }).not.toThrow();

    const count = (
      sqlite.prepare('SELECT COUNT(*) AS cnt FROM vendor_contacts').get() as { cnt: number }
    ).cnt;
    expect(count).toBe(0);
  });

  // ── Scenario 2: No-op on correctly-ordered data ───────────────────────────

  it('leaves correctly-ordered vendor contact data unchanged', () => {
    setupPreMigrationDb(sqlite);
    insertUser(sqlite, 'user-001');
    insertVendor(sqlite, 'vendor-001', 'user-001');

    const createdAt = '2026-01-15T10:00:00.000Z';
    const updatedAt = '2026-02-20T14:30:00.000Z';

    // Insert a contact with correct field values (real email, real timestamps)
    sqlite
      .prepare(
        `INSERT INTO vendor_contacts
           (id, vendor_id, name, first_name, last_name, role, phone, email, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        'vc-correct',
        'vendor-001',
        'Jane Smith',
        'Jane',
        'Smith',
        'Project Manager',
        '+49 30 1234567',
        'jane.smith@example.com',
        'Primary contact',
        createdAt,
        updatedAt,
      );

    runMigration0029(sqlite);

    const contact = getContact(sqlite, 'vc-correct');
    expect(contact).toBeDefined();
    expect(contact?.first_name).toBe('Jane');
    expect(contact?.last_name).toBe('Smith');
    expect(contact?.role).toBe('Project Manager');
    expect(contact?.phone).toBe('+49 30 1234567');
    expect(contact?.email).toBe('jane.smith@example.com');
    expect(contact?.notes).toBe('Primary contact');
    expect(contact?.created_at).toBe(createdAt);
    expect(contact?.updated_at).toBe(updatedAt);
  });

  // ── Scenario 3: Corrects corrupted data ───────────────────────────────────

  it('corrects columns shifted by the buggy 0028 SELECT * pattern', () => {
    setupPreMigrationDb(sqlite);
    insertUser(sqlite, 'user-001');
    insertVendor(sqlite, 'vendor-001', 'user-001');

    // Original values before corruption
    const originalFirstName = 'Alice';
    const originalLastName = 'Builder';
    const originalRole = 'Site Manager';
    const originalPhone = '+49 89 9876543';
    const originalEmail = 'alice.builder@construction.com';
    const originalNotes = 'Available Mon-Fri';
    const originalCreatedAt = '2026-01-10T08:00:00.000Z';
    const originalUpdatedAt = '2026-03-01T12:00:00.000Z';

    // Insert the contact with correct values first
    sqlite
      .prepare(
        `INSERT INTO vendor_contacts
           (id, vendor_id, name, first_name, last_name, role, phone, email, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        'vc-corrupted',
        'vendor-001',
        'Alice Builder',
        originalFirstName,
        originalLastName,
        originalRole,
        originalPhone,
        originalEmail,
        originalNotes,
        originalCreatedAt,
        originalUpdatedAt,
      );

    // Simulate the corruption that buggy 0028 would have introduced
    // (SELECT * with positionally mismatched column order)
    sqlite
      .prepare(
        `UPDATE vendor_contacts SET
           first_name = role,
           last_name  = phone,
           role       = email,
           phone      = notes,
           email      = created_at,
           notes      = updated_at,
           created_at = first_name,
           updated_at = last_name
         WHERE id = ?`,
      )
      .run('vc-corrupted');

    // Verify corruption is in place: email now contains a datetime string
    const corruptedContact = getContact(sqlite, 'vc-corrupted');
    expect(corruptedContact?.email).toBe(originalCreatedAt);
    expect(corruptedContact?.first_name).toBe(originalRole);

    // Run 0029 — should detect and correct the corruption
    runMigration0029(sqlite);

    const fixedContact = getContact(sqlite, 'vc-corrupted');
    expect(fixedContact).toBeDefined();
    expect(fixedContact?.first_name).toBe(originalFirstName);
    expect(fixedContact?.last_name).toBe(originalLastName);
    expect(fixedContact?.role).toBe(originalRole);
    expect(fixedContact?.phone).toBe(originalPhone);
    expect(fixedContact?.email).toBe(originalEmail);
    expect(fixedContact?.notes).toBe(originalNotes);
    expect(fixedContact?.created_at).toBe(originalCreatedAt);
    expect(fixedContact?.updated_at).toBe(originalUpdatedAt);
  });

  // ── Scenario 4: NULL first_name / last_name COALESCE fallback ────────────

  it('restores NULL first_name and last_name and uses COALESCE fallback for timestamps', () => {
    setupPreMigrationDb(sqlite);
    insertUser(sqlite, 'user-001');
    insertVendor(sqlite, 'vendor-001', 'user-001');

    // A contact where first_name and last_name were originally NULL
    const originalRole = 'Electrician';
    const originalPhone = '+49 711 5550000';
    const originalEmail = 'contact@sparks.de';
    const originalNotes = 'No notes';
    const originalCreatedAt = '2026-02-01T09:00:00.000Z';
    const originalUpdatedAt = '2026-02-28T17:00:00.000Z';

    sqlite
      .prepare(
        `INSERT INTO vendor_contacts
           (id, vendor_id, name, first_name, last_name, role, phone, email, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        'vc-null-names',
        'vendor-001',
        'Contact Only',
        null,   // first_name = NULL
        null,   // last_name = NULL
        originalRole,
        originalPhone,
        originalEmail,
        originalNotes,
        originalCreatedAt,
        originalUpdatedAt,
      );

    // Simulate corruption: first_name=NULL → created_at=NULL, last_name=NULL → updated_at=NULL
    sqlite
      .prepare(
        `UPDATE vendor_contacts SET
           first_name = role,
           last_name  = phone,
           role       = email,
           phone      = notes,
           email      = created_at,
           notes      = updated_at,
           created_at = first_name,
           updated_at = last_name
         WHERE id = ?`,
      )
      .run('vc-null-names');

    // Verify corruption is in place
    const corruptedContact = getContact(sqlite, 'vc-null-names');
    expect(corruptedContact?.email).toBe(originalCreatedAt);
    expect(corruptedContact?.created_at).toBeNull(); // was first_name = NULL
    expect(corruptedContact?.updated_at).toBeNull(); // was last_name = NULL

    // Run 0029
    runMigration0029(sqlite);

    const fixedContact = getContact(sqlite, 'vc-null-names');
    expect(fixedContact).toBeDefined();

    // first_name and last_name should be NULL (restored from original NULL values)
    expect(fixedContact?.first_name).toBeNull();
    expect(fixedContact?.last_name).toBeNull();

    // Other fields should be restored
    expect(fixedContact?.role).toBe(originalRole);
    expect(fixedContact?.phone).toBe(originalPhone);
    expect(fixedContact?.email).toBe(originalEmail);
    expect(fixedContact?.notes).toBe(originalNotes);

    // Timestamps must not be NULL — COALESCE fell back to datetime('now')
    expect(fixedContact?.created_at).not.toBeNull();
    expect(fixedContact?.updated_at).not.toBeNull();

    // The fallback timestamps should look like a valid ISO datetime
    expect(fixedContact?.created_at).toMatch(/^\d{4}-\d{2}-\d{2}/);
    expect(fixedContact?.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });

  // ── Scenario 5: Idempotency ────────────────────────────────────────────────

  it('is idempotent — running 0029 twice leaves data unchanged', () => {
    setupPreMigrationDb(sqlite);
    insertUser(sqlite, 'user-001');
    insertVendor(sqlite, 'vendor-001', 'user-001');

    const originalFirstName = 'Bob';
    const originalLastName = 'Contractor';
    const originalRole = 'Foreman';
    const originalPhone = '+49 40 8881234';
    const originalEmail = 'bob@buildco.com';
    const originalNotes = 'Second shift';
    const originalCreatedAt = '2026-01-20T07:30:00.000Z';
    const originalUpdatedAt = '2026-03-10T16:45:00.000Z';

    sqlite
      .prepare(
        `INSERT INTO vendor_contacts
           (id, vendor_id, name, first_name, last_name, role, phone, email, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        'vc-idempotent',
        'vendor-001',
        'Bob Contractor',
        originalFirstName,
        originalLastName,
        originalRole,
        originalPhone,
        originalEmail,
        originalNotes,
        originalCreatedAt,
        originalUpdatedAt,
      );

    // Simulate corruption
    sqlite
      .prepare(
        `UPDATE vendor_contacts SET
           first_name = role,
           last_name  = phone,
           role       = email,
           phone      = notes,
           email      = created_at,
           notes      = updated_at,
           created_at = first_name,
           updated_at = last_name
         WHERE id = ?`,
      )
      .run('vc-idempotent');

    // First run: corrects the corruption
    runMigration0029(sqlite);

    const afterFirst = getContact(sqlite, 'vc-idempotent');
    expect(afterFirst?.email).toBe(originalEmail);
    expect(afterFirst?.first_name).toBe(originalFirstName);

    // Second run: should be a no-op (email is now a real email, not a datetime)
    expect(() => {
      const sql = readFileSync(
        join(MIGRATIONS_DIR, '0029_fix_vendor_contacts_columns.sql'),
        'utf-8',
      );
      sqlite.exec(sql);
    }).not.toThrow();

    const afterSecond = getContact(sqlite, 'vc-idempotent');
    expect(afterSecond?.first_name).toBe(originalFirstName);
    expect(afterSecond?.last_name).toBe(originalLastName);
    expect(afterSecond?.role).toBe(originalRole);
    expect(afterSecond?.phone).toBe(originalPhone);
    expect(afterSecond?.email).toBe(originalEmail);
    expect(afterSecond?.notes).toBe(originalNotes);
    expect(afterSecond?.created_at).toBe(originalCreatedAt);
    expect(afterSecond?.updated_at).toBe(originalUpdatedAt);
  });
});
