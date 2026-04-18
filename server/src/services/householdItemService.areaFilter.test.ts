import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import { listHouseholdItems } from './householdItemService.js';
import type { HouseholdItemListQuery } from '@cornerstone/shared';

/**
 * Integration tests for listHouseholdItems() — area filter behavior introduced by
 * story #1277 (No Area sentinel filter).
 *
 * Covers:
 *   - __none__ sentinel returns only unassigned (null-area) household items
 *   - __none__ + named area returns union of null-area + named-area items
 *   - __none__ when all items have areas returns empty
 *   - Regression: named parentId expands to include descendant-area items
 *   - Regression: CSV of multiple area IDs returns union
 */
describe('listHouseholdItems() — area filter', () => {
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

  /**
   * Insert a household item. Uses the seeded 'hic-furniture' categoryId which
   * is required (NOT NULL FK). Returns the item ID.
   */
  function insertHouseholdItem(name: string, areaId: string | null = null): string {
    const now = new Date(Date.now() + idCounter++).toISOString();
    const id = `hi-${idCounter++}-${Math.random().toString(36).substring(7)}`;
    db.insert(schema.householdItems)
      .values({
        id,
        name,
        categoryId: 'hic-furniture',
        areaId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  /** Build a minimal HouseholdItemListQuery. */
  function buildQuery(overrides: Partial<HouseholdItemListQuery> = {}): HouseholdItemListQuery {
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

  it('?areaId=__none__ returns only household items with null areaId', () => {
    const areaId = insertArea('Living Room');
    const assigned = insertHouseholdItem('Sofa', areaId);
    const unassigned = insertHouseholdItem('No-area lamp');

    const result = listHouseholdItems(db, buildQuery({ areaId: '__none__' }));
    const ids = result.items.map((i) => i.id);

    expect(ids).toContain(unassigned);
    expect(ids).not.toContain(assigned);
  });

  it('?areaId=__none__ includes ALL unassigned items', () => {
    const areaId = insertArea('Bedroom');
    insertHouseholdItem('Bed frame', areaId);
    const u1 = insertHouseholdItem('Box 1');
    const u2 = insertHouseholdItem('Box 2');
    const u3 = insertHouseholdItem('Box 3');

    const result = listHouseholdItems(db, buildQuery({ areaId: '__none__' }));
    const ids = result.items.map((i) => i.id);

    expect(ids).toContain(u1);
    expect(ids).toContain(u2);
    expect(ids).toContain(u3);
    expect(result.items).toHaveLength(3);
  });

  // ─── Scenario 2: __none__ + named area = union ──────────────────────────────

  it('?areaId=__none__,<areaId> returns union: null-area items + named-area items', () => {
    const area1Id = insertArea('Kitchen');
    const area2Id = insertArea('Office');

    const inArea1 = insertHouseholdItem('Kitchen table', area1Id);
    const inArea2 = insertHouseholdItem('Office chair', area2Id);
    const unassigned = insertHouseholdItem('Storage box');

    const result = listHouseholdItems(db, buildQuery({ areaId: `__none__,${area1Id}` }));
    const ids = result.items.map((i) => i.id);

    expect(ids).toContain(inArea1);
    expect(ids).toContain(unassigned);
    expect(ids).not.toContain(inArea2);
  });

  it('?areaId=<areaId>,__none__ (sentinel last) also returns correct union', () => {
    const areaId = insertArea('Bathroom');
    const inArea = insertHouseholdItem('Mirror', areaId);
    const unassigned = insertHouseholdItem('Floating item');

    const result = listHouseholdItems(db, buildQuery({ areaId: `${areaId},__none__` }));
    const ids = result.items.map((i) => i.id);

    expect(ids).toContain(inArea);
    expect(ids).toContain(unassigned);
  });

  // ─── Scenario 3: __none__ when all items have areas returns empty ────────────

  it('?areaId=__none__ returns empty result when all household items have an assigned area', () => {
    const areaId = insertArea('Garage');
    insertHouseholdItem('Tool cabinet', areaId);
    insertHouseholdItem('Bike rack', areaId);

    const result = listHouseholdItems(db, buildQuery({ areaId: '__none__' }));

    expect(result.items).toHaveLength(0);
    expect(result.pagination.totalItems).toBe(0);
  });

  // ─── Scenario 4: Regression — parentId expands to descendants ───────────────

  it('?areaId=<parentId> returns items in parent AND all descendant areas', () => {
    const parentId = insertArea('Upper Floor');
    const childId = insertArea('Master Bedroom', parentId);

    const parentItem = insertHouseholdItem('Hallway rug', parentId);
    const childItem = insertHouseholdItem('King bed', childId);
    const unrelated = insertHouseholdItem('Unrelated item');

    const result = listHouseholdItems(db, buildQuery({ areaId: parentId }));
    const ids = result.items.map((i) => i.id);

    expect(ids).toContain(parentItem);
    expect(ids).toContain(childItem);
    expect(ids).not.toContain(unrelated);
  });

  it('?areaId=<grandparentId> expands recursively through all descendants', () => {
    const grandparentId = insertArea('House');
    const parentId = insertArea('Floor 1', grandparentId);
    const childId = insertArea('Living Room', parentId);

    const gpItem = insertHouseholdItem('Entrance mat', grandparentId);
    const pItem = insertHouseholdItem('Floor lamp', parentId);
    const cItem = insertHouseholdItem('Sectional sofa', childId);
    const unrelated = insertHouseholdItem('No area item');

    const result = listHouseholdItems(db, buildQuery({ areaId: grandparentId }));
    const ids = result.items.map((i) => i.id);

    expect(ids).toContain(gpItem);
    expect(ids).toContain(pItem);
    expect(ids).toContain(cItem);
    expect(ids).not.toContain(unrelated);
  });

  // ─── Scenario 5: Regression — CSV of multiple area IDs returns union ─────────

  it('?areaId=<areaA>,<areaB> returns union of items from both areas', () => {
    const areaA = insertArea('Bedroom A');
    const areaB = insertArea('Bedroom B');
    const areaC = insertArea('Utility Room');

    const itemA = insertHouseholdItem('Bed A', areaA);
    const itemB = insertHouseholdItem('Bed B', areaB);
    const itemC = insertHouseholdItem('Washing machine', areaC);
    const unassigned = insertHouseholdItem('No area item');

    const result = listHouseholdItems(db, buildQuery({ areaId: `${areaA},${areaB}` }));
    const ids = result.items.map((i) => i.id);

    expect(ids).toContain(itemA);
    expect(ids).toContain(itemB);
    expect(ids).not.toContain(itemC);
    expect(ids).not.toContain(unassigned);
  });

  it('?areaId=<parentId>,<unrelated> returns union of descendant items from both areas', () => {
    const parentId = insertArea('Zone A');
    const childId = insertArea('Room A1', parentId);
    const otherAreaId = insertArea('Zone B');

    const parentItem = insertHouseholdItem('Zone A item', parentId);
    const childItem = insertHouseholdItem('Room A1 item', childId);
    const otherItem = insertHouseholdItem('Zone B item', otherAreaId);

    const result = listHouseholdItems(db, buildQuery({ areaId: `${parentId},${otherAreaId}` }));
    const ids = result.items.map((i) => i.id);

    // parentId expands to include childId
    expect(ids).toContain(parentItem);
    expect(ids).toContain(childItem);
    expect(ids).toContain(otherItem);
  });

  // ─── Single leaf area ID (regression) ───────────────────────────────────────

  it('?areaId=<leafId> returns only items for that exact leaf area', () => {
    const areaA = insertArea('Garden');
    const areaB = insertArea('Terrace');

    const itemA = insertHouseholdItem('Garden chair', areaA);
    const itemB = insertHouseholdItem('Outdoor heater', areaB);
    const unassigned = insertHouseholdItem('No area');

    const result = listHouseholdItems(db, buildQuery({ areaId: areaA }));
    const ids = result.items.map((i) => i.id);

    expect(ids).toContain(itemA);
    expect(ids).not.toContain(itemB);
    expect(ids).not.toContain(unassigned);
    expect(result.items).toHaveLength(1);
  });

  // ─── No areaId filter — returns all items ───────────────────────────────────

  it('omitting areaId returns all household items regardless of area assignment', () => {
    const areaId = insertArea('Study');
    const inArea = insertHouseholdItem('Desk lamp', areaId);
    const noArea = insertHouseholdItem('Spare item');

    const result = listHouseholdItems(db, buildQuery({}));
    const ids = result.items.map((i) => i.id);

    expect(ids).toContain(inArea);
    expect(ids).toContain(noArea);
  });

  // ─── Pagination metadata reflects filter ────────────────────────────────────

  it('pagination.totalItems reflects __none__ sentinel filter count accurately', () => {
    const areaId = insertArea('Workshop');
    insertHouseholdItem('Workbench', areaId);
    insertHouseholdItem('Floating 1');
    insertHouseholdItem('Floating 2');

    const result = listHouseholdItems(db, buildQuery({ areaId: '__none__' }));

    expect(result.pagination.totalItems).toBe(2);
  });
});
