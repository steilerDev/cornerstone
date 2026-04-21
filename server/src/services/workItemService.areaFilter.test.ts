import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import { listWorkItems } from './workItemService.js';
import type { WorkItemListQuery } from '@cornerstone/shared';

/**
 * Integration tests for listWorkItems() — area filter behavior introduced by
 * story #1277 (No Area sentinel filter).
 *
 * Covers:
 *   - __none__ sentinel returns only unassigned (null-area) work items
 *   - __none__ + named area returns union of null-area + named-area items
 *   - __none__ when all items have areas returns empty
 *   - Regression: named parentId expands to include descendant-area items
 *   - Regression: single leaf areaId returns only that area's items
 */
describe('listWorkItems() — area filter', () => {
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

  /** Insert a test area, returns its ID. */
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

  /** Insert a work item, returns its ID. */
  function insertWorkItem(title: string, areaId: string | null = null): string {
    const now = new Date(Date.now() + idCounter++).toISOString();
    const id = `wi-${idCounter++}-${Math.random().toString(36).substring(7)}`;
    db.insert(schema.workItems)
      .values({
        id,
        title,
        status: 'not_started',
        areaId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  /** Build a minimal WorkItemListQuery. */
  function buildQuery(overrides: Partial<WorkItemListQuery> = {}): WorkItemListQuery {
    return { page: 1, pageSize: 100, ...overrides };
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

  // ─── Scenario 1: __none__ returns only unassigned items ─────────────────────

  it('?areaId=__none__ returns only work items with null areaId', () => {
    const areaId = insertArea('Kitchen');
    const assignedId = insertWorkItem('Tile floor', areaId);
    const unassignedId = insertWorkItem('Unassigned task');

    const result = listWorkItems(db, buildQuery({ areaId: '__none__' }));
    const ids = result.items.map((i) => i.id);

    expect(ids).toContain(unassignedId);
    expect(ids).not.toContain(assignedId);
  });

  it('?areaId=__none__ includes ALL unassigned items (multiple)', () => {
    const areaId = insertArea('Garage');
    insertWorkItem('In garage', areaId);
    const u1 = insertWorkItem('Unassigned 1');
    const u2 = insertWorkItem('Unassigned 2');
    const u3 = insertWorkItem('Unassigned 3');

    const result = listWorkItems(db, buildQuery({ areaId: '__none__' }));
    const ids = result.items.map((i) => i.id);

    expect(ids).toContain(u1);
    expect(ids).toContain(u2);
    expect(ids).toContain(u3);
    expect(result.items).toHaveLength(3);
  });

  // ─── Scenario 2: __none__ + named area = union ──────────────────────────────

  it('?areaId=__none__,<areaId> returns union: null-area items + named-area items', () => {
    const area1Id = insertArea('Bathroom');
    const area2Id = insertArea('Kitchen');

    const inArea1 = insertWorkItem('Install sink', area1Id);
    const inArea2 = insertWorkItem('Install cooktop', area2Id);
    const unassigned = insertWorkItem('No area task');

    const result = listWorkItems(db, buildQuery({ areaId: `__none__,${area1Id}` }));
    const ids = result.items.map((i) => i.id);

    expect(ids).toContain(inArea1);
    expect(ids).toContain(unassigned);
    expect(ids).not.toContain(inArea2);
  });

  it('?areaId=<areaId>,__none__ (sentinel last) also returns correct union', () => {
    const areaId = insertArea('Study');
    const inArea = insertWorkItem('Paint walls', areaId);
    const unassigned = insertWorkItem('Floating task');

    const result = listWorkItems(db, buildQuery({ areaId: `${areaId},__none__` }));
    const ids = result.items.map((i) => i.id);

    expect(ids).toContain(inArea);
    expect(ids).toContain(unassigned);
  });

  // ─── Scenario 3: __none__ when all items have areas returns empty ────────────

  it('?areaId=__none__ returns empty result when all work items have an assigned area', () => {
    const areaId = insertArea('Living Room');
    insertWorkItem('Hang curtains', areaId);
    insertWorkItem('Lay flooring', areaId);

    const result = listWorkItems(db, buildQuery({ areaId: '__none__' }));

    expect(result.items).toHaveLength(0);
    expect(result.pagination.totalItems).toBe(0);
  });

  // ─── Scenario 4: Regression — parentId expands to descendants ───────────────

  it('?areaId=<parentId> (no sentinel) returns items for parent AND descendant areas', () => {
    const parentId = insertArea('Floor 1');
    const childId = insertArea('Bedroom 1', parentId);

    const parentItem = insertWorkItem('Floor works', parentId);
    const childItem = insertWorkItem('Bedroom decoration', childId);
    const unrelated = insertWorkItem('Unrelated task');

    const result = listWorkItems(db, buildQuery({ areaId: parentId }));
    const ids = result.items.map((i) => i.id);

    expect(ids).toContain(parentItem);
    expect(ids).toContain(childItem);
    expect(ids).not.toContain(unrelated);
  });

  it('?areaId=<grandparentId> expands recursively through all descendants', () => {
    const grandparentId = insertArea('House');
    const parentId = insertArea('Ground Floor', grandparentId);
    const childId = insertArea('Kitchen', parentId);

    const gpItem = insertWorkItem('Foundation work', grandparentId);
    const pItem = insertWorkItem('Floor tiling', parentId);
    const cItem = insertWorkItem('Install cabinets', childId);
    const unrelated = insertWorkItem('No area');

    const result = listWorkItems(db, buildQuery({ areaId: grandparentId }));
    const ids = result.items.map((i) => i.id);

    expect(ids).toContain(gpItem);
    expect(ids).toContain(pItem);
    expect(ids).toContain(cItem);
    expect(ids).not.toContain(unrelated);
  });

  // ─── Scenario 5: Regression — single leaf areaId ────────────────────────────

  it('?areaId=<leafId> returns only items for that exact leaf area', () => {
    const areaA = insertArea('Bathroom');
    const areaB = insertArea('Kitchen');

    const itemA = insertWorkItem('Tile bathroom', areaA);
    const itemB = insertWorkItem('Install oven', areaB);
    const unassigned = insertWorkItem('Unassigned');

    const result = listWorkItems(db, buildQuery({ areaId: areaA }));
    const ids = result.items.map((i) => i.id);

    expect(ids).toContain(itemA);
    expect(ids).not.toContain(itemB);
    expect(ids).not.toContain(unassigned);
    expect(result.items).toHaveLength(1);
  });

  // ─── No areaId filter — returns all items ───────────────────────────────────

  it('omitting areaId returns all work items regardless of area assignment', () => {
    const areaId = insertArea('Garden');
    const inArea = insertWorkItem('Fence installation', areaId);
    const noArea = insertWorkItem('General planning');

    const result = listWorkItems(db, buildQuery({}));
    const ids = result.items.map((i) => i.id);

    expect(ids).toContain(inArea);
    expect(ids).toContain(noArea);
  });

  // ─── Pagination metadata reflects filter ────────────────────────────────────

  it('pagination.totalItems reflects __none__ sentinel filter count accurately', () => {
    const areaId = insertArea('Office');
    insertWorkItem('Paint office', areaId);
    insertWorkItem('Unassigned 1');
    insertWorkItem('Unassigned 2');

    const result = listWorkItems(db, buildQuery({ areaId: '__none__' }));

    expect(result.pagination.totalItems).toBe(2);
    expect(result.pagination.totalPages).toBe(1);
  });
});
