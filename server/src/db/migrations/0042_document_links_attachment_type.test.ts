/**
 * Migration integration tests for 0042_document_links_attachment_type.sql
 *
 * Tests that:
 *   1. Applies on an empty document_links table without error
 *   2. Preserves an existing (pre-migration) document_links row — attachment_type defaults to null (no backfill)
 *   3. INSERT with attachment_type='quotation'|'deposit'|'invoice' succeeds
 *   4. INSERT with attachment_type=null succeeds (explicitly allowed by the CHECK constraint)
 *   5. INSERT with an invalid attachment_type value throws a CHECK constraint violation
 *   6. Applying the migration a second time is a no-op (tracked via _migrations, idempotent)
 *
 * Story: #1877 Source contact fields, household sender setting & document attachment typing
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
import { runMigrations } from '../migrate.js';

const MIGRATIONS_DIR = dirname(fileURLToPath(import.meta.url));
const TARGET_MIGRATION = '0042_document_links_attachment_type.sql';

/**
 * Apply every migration that sorts before TARGET_MIGRATION (derived dynamically from the
 * real migrations directory, so this stays correct as new migrations are added over time).
 */
function setupPreMigrationDb(db: Database.Database): void {
  const allFiles = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  const preFiles = allFiles.filter((f) => f < TARGET_MIGRATION);

  const tempDir = mkdtempSync(join(tmpdir(), 'cs-mig-0042-test-'));
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

function insertDocumentLinkRaw(
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

describe('Migration 0042: Add attachment_type to document_links', () => {
  let sqlite: Database.Database;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    const originalWarn = console.warn;
    console.warn = () => undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- stash original console.warn for restore
    (sqlite as any).__originalWarn = originalWarn;
  });

  afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- restore stashed console.warn
    const originalWarn = (sqlite as any).__originalWarn;
    if (originalWarn) console.warn = originalWarn;
    sqlite.close();
  });

  it('applies without error when document_links table is empty', () => {
    setupPreMigrationDb(sqlite);

    expect(() => {
      runTargetMigration(sqlite);
    }).not.toThrow();

    const count = (
      sqlite.prepare('SELECT COUNT(*) AS cnt FROM document_links').get() as { cnt: number }
    ).cnt;
    expect(count).toBe(0);
  });

  it('preserves a pre-migration row and defaults attachment_type to null (no backfill)', () => {
    setupPreMigrationDb(sqlite);
    insertDocumentLinkRaw(sqlite, 'link-pre', 'invoice', 'inv-001', 10);

    runTargetMigration(sqlite);

    const row = sqlite
      .prepare('SELECT id, entity_type, attachment_type FROM document_links WHERE id = ?')
      .get('link-pre') as { id: string; entity_type: string; attachment_type: string | null };

    expect(row.entity_type).toBe('invoice');
    expect(row.attachment_type).toBeNull();
  });

  it.each(['quotation', 'deposit', 'invoice'])(
    "INSERT with attachment_type='%s' succeeds after migration",
    (attachmentType) => {
      setupPreMigrationDb(sqlite);
      runTargetMigration(sqlite);

      expect(() => {
        sqlite
          .prepare(
            `INSERT INTO document_links (id, entity_type, entity_id, paperless_document_id, attachment_type, created_at)
             VALUES (?, 'invoice', 'inv-001', 10, ?, ?)`,
          )
          .run(`link-${attachmentType}`, attachmentType, new Date().toISOString());
      }).not.toThrow();

      const row = sqlite
        .prepare('SELECT attachment_type FROM document_links WHERE id = ?')
        .get(`link-${attachmentType}`) as { attachment_type: string };
      expect(row.attachment_type).toBe(attachmentType);
    },
  );

  it('INSERT with attachment_type=null succeeds (explicitly allowed by CHECK)', () => {
    setupPreMigrationDb(sqlite);
    runTargetMigration(sqlite);

    expect(() => {
      insertDocumentLinkRaw(sqlite, 'link-null', 'work_item', 'wi-001', 20);
    }).not.toThrow();

    const row = sqlite
      .prepare('SELECT attachment_type FROM document_links WHERE id = ?')
      .get('link-null') as { attachment_type: string | null };
    expect(row.attachment_type).toBeNull();
  });

  it('INSERT with an invalid attachment_type throws a CHECK constraint violation', () => {
    setupPreMigrationDb(sqlite);
    runTargetMigration(sqlite);

    expect(() => {
      sqlite
        .prepare(
          `INSERT INTO document_links (id, entity_type, entity_id, paperless_document_id, attachment_type, created_at)
           VALUES ('link-bogus', 'invoice', 'inv-001', 10, 'bogus', ?)`,
        )
        .run(new Date().toISOString());
    }).toThrow(/CHECK constraint failed/i);
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
