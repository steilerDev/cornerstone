import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import { resolveAreaFilter } from './areaService.js';

/**
 * Unit tests for resolveAreaFilter().
 *
 * Story #1277 — No Area sentinel filter.
 * Covers: empty input, single leaf, parent+child expansion, __none__ sentinel
 * alone, sentinel+area, array input, unknown IDs, whitespace CSV segments.
 */
describe('resolveAreaFilter()', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;

  let idCounter = 0;

  function createTestDb() {
    const sqliteDb = new Database(':memory:');
    sqliteDb.pragma('journal_mode = WAL');
    sqliteDb.pragma('foreign_keys = ON');
    runMigrations(sqliteDb);
    return { sqlite: sqliteDb, db: drizzle(sqliteDb, { schema }) };
  }

  /** Insert a test area and return its ID. */
  function insertArea(name: string, parentId: string | null = null): string {
    const now = new Date(Date.now() + idCounter++).toISOString();
    const id = `area-${idCounter++}-${Math.random().toString(36).substring(7)}`;
    db.insert(schema.areas)
      .values({
        id,
        name,
        parentId,
        color: null,
        description: null,
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  beforeEach(() => {
    idCounter = 0;
    const testDb = createTestDb();
    sqlite = testDb.sqlite;
    db = testDb.db;
  });

  afterEach(() => {
    sqlite.close();
  });

  // ─── Scenario 1: Empty string ───────────────────────────────────────────────

  it('returns empty areaIds and includeNull=false for empty string input', () => {
    const result = resolveAreaFilter(db, '');
    expect(result.areaIds).toHaveLength(0);
    expect(result.includeNull).toBe(false);
  });

  // ─── Scenario 2: Single leaf area (no children) ─────────────────────────────

  it('returns just the leaf area ID for a single leaf area; includeNull=false', () => {
    const leafId = insertArea('Bathroom');

    const result = resolveAreaFilter(db, leafId);

    expect(result.areaIds).toEqual([leafId]);
    expect(result.includeNull).toBe(false);
  });

  it('returns only the area itself when the area has no children (no descendant expansion)', () => {
    const areaA = insertArea('Kitchen');
    const areaB = insertArea('Living Room');

    const result = resolveAreaFilter(db, areaA);

    // areaA has no children — result should only contain areaA, not areaB
    expect(result.areaIds).toContain(areaA);
    expect(result.areaIds).not.toContain(areaB);
    expect(result.areaIds).toHaveLength(1);
  });

  // ─── Scenario 3: Parent with one child (descendant expansion) ───────────────

  it('expands parent ID to include parent + child IDs; includeNull=false', () => {
    const parentId = insertArea('Floor 1');
    const childId = insertArea('Bedroom', parentId);

    const result = resolveAreaFilter(db, parentId);

    expect(result.areaIds).toContain(parentId);
    expect(result.areaIds).toContain(childId);
    expect(result.areaIds).toHaveLength(2);
    expect(result.includeNull).toBe(false);
  });

  it('expands parent to all descendants recursively (grandchild included)', () => {
    const grandparentId = insertArea('House');
    const parentId = insertArea('Floor 1', grandparentId);
    const childId = insertArea('Bedroom', parentId);

    const result = resolveAreaFilter(db, grandparentId);

    expect(result.areaIds).toContain(grandparentId);
    expect(result.areaIds).toContain(parentId);
    expect(result.areaIds).toContain(childId);
    expect(result.areaIds).toHaveLength(3);
  });

  // ─── Scenario 4: __none__ sentinel alone ────────────────────────────────────

  it('returns empty areaIds and includeNull=true for "__none__" alone', () => {
    const result = resolveAreaFilter(db, '__none__');
    expect(result.areaIds).toHaveLength(0);
    expect(result.includeNull).toBe(true);
  });

  // ─── Scenario 5: __none__ combined with an area ID (CSV string) ─────────────

  it('returns includeNull=true and expanded area IDs for "__none__,<areaId>" CSV', () => {
    const parentId = insertArea('Zone A');
    const childId = insertArea('Room 1', parentId);

    const result = resolveAreaFilter(db, `__none__,${parentId}`);

    expect(result.includeNull).toBe(true);
    expect(result.areaIds).toContain(parentId);
    expect(result.areaIds).toContain(childId);
    expect(result.areaIds).not.toContain('__none__');
  });

  it('returns includeNull=true and expanded area IDs for "<areaId>,__none__" CSV (sentinel last)', () => {
    const areaId = insertArea('Garage');

    const result = resolveAreaFilter(db, `${areaId},__none__`);

    expect(result.includeNull).toBe(true);
    expect(result.areaIds).toContain(areaId);
    expect(result.areaIds).not.toContain('__none__');
  });

  // ─── Scenario 6: Array input with ["__none__", "<areaId>"] ──────────────────

  it('accepts array input: ["__none__", "<areaId>"] and returns same as CSV form', () => {
    const parentId = insertArea('Floor 2');
    const childId = insertArea('Bathroom', parentId);

    const result = resolveAreaFilter(db, ['__none__', parentId]);

    expect(result.includeNull).toBe(true);
    expect(result.areaIds).toContain(parentId);
    expect(result.areaIds).toContain(childId);
    expect(result.areaIds).not.toContain('__none__');
  });

  it('accepts array input with only one area ID (no sentinel)', () => {
    const leafId = insertArea('Study');

    const result = resolveAreaFilter(db, [leafId]);

    expect(result.includeNull).toBe(false);
    expect(result.areaIds).toEqual([leafId]);
  });

  it('accepts array input with only ["__none__"]', () => {
    const result = resolveAreaFilter(db, ['__none__']);
    expect(result.includeNull).toBe(true);
    expect(result.areaIds).toHaveLength(0);
  });

  // ─── Scenario 7: Unknown UUIDs silently ignored ──────────────────────────────

  it('ignores unknown area IDs silently — returns empty areaIds, no throw', () => {
    const result = resolveAreaFilter(db, 'non-existent-area-id-xyz');
    expect(result.areaIds).toHaveLength(0);
    expect(result.includeNull).toBe(false);
  });

  it('ignores unknown IDs in CSV and still processes valid ones', () => {
    const knownId = insertArea('Valid Area');

    const result = resolveAreaFilter(db, `unknown-id-abc,${knownId}`);

    expect(result.areaIds).toContain(knownId);
    expect(result.areaIds).not.toContain('unknown-id-abc');
  });

  it('ignores unknown IDs in array and still processes valid ones', () => {
    const knownId = insertArea('Known Area');

    const result = resolveAreaFilter(db, ['does-not-exist', knownId]);

    expect(result.areaIds).toContain(knownId);
    expect(result.areaIds).not.toContain('does-not-exist');
  });

  // ─── Scenario 8: Whitespace-only CSV segments dropped ───────────────────────

  it('drops whitespace-only segments in CSV string', () => {
    const result = resolveAreaFilter(db, '  ,   ,  ');
    expect(result.areaIds).toHaveLength(0);
    expect(result.includeNull).toBe(false);
  });

  it('trims whitespace around valid area IDs in CSV', () => {
    const areaId = insertArea('Pantry');

    const result = resolveAreaFilter(db, `  ${areaId}  `);

    expect(result.areaIds).toContain(areaId);
  });

  it('handles mixed whitespace segments and valid IDs in CSV', () => {
    const areaId = insertArea('Utility Room');

    const result = resolveAreaFilter(db, `  ,${areaId},  `);

    expect(result.areaIds).toContain(areaId);
    expect(result.areaIds).toHaveLength(1);
  });

  // ─── Deduplication ──────────────────────────────────────────────────────────

  it('deduplicates expanded area IDs when same area appears multiple times', () => {
    const areaId = insertArea('Duplicated');

    const result = resolveAreaFilter(db, `${areaId},${areaId}`);

    // Despite appearing twice, areaId should appear only once in the result
    const count = result.areaIds.filter((id) => id === areaId).length;
    expect(count).toBe(1);
  });
});
