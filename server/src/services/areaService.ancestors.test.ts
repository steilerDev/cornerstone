/**
 * Unit tests for `loadAreaMap` and `resolveAreaAncestors` functions in areaService.
 *
 * These tests verify:
 * - loadAreaMap returns all areas with correct shape
 * - resolveAreaAncestors correctly traverses parent chains
 * - Edge cases: root areas, orphaned parents, cycles, deep trees, color propagation
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import { loadAreaMap, resolveAreaAncestors } from './areaService.js';

describe('areaService — loadAreaMap and resolveAreaAncestors', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;

  let areaTimestampOffset = 0;

  beforeEach(() => {
    sqlite = new Database(':memory:');
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    runMigrations(sqlite);
    db = drizzle(sqlite, { schema });
    areaTimestampOffset = 0;
  });

  afterEach(() => {
    if (sqlite && sqlite.open) {
      sqlite.close();
    }
  });

  /**
   * Helper: Insert a test area directly into the DB.
   * Using raw Drizzle insert to bypass service validation (needed for cycle tests).
   */
  function insertArea(
    id: string,
    name: string,
    options: { parentId?: string | null; color?: string | null } = {},
  ) {
    const timestamp = new Date(Date.now() + areaTimestampOffset).toISOString();
    areaTimestampOffset += 1;
    db.insert(schema.areas)
      .values({
        id,
        name,
        parentId: options.parentId ?? null,
        color: options.color ?? null,
        description: null,
        sortOrder: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run();
  }

  // ---------------------------------------------------------------------------
  // loadAreaMap
  // ---------------------------------------------------------------------------

  describe('loadAreaMap', () => {
    it('returns empty map when no areas exist', () => {
      const map = loadAreaMap(db);
      expect(map.size).toBe(0);
    });

    it('returns all areas with correct shape (3 areas in a chain)', () => {
      insertArea('house-1', 'House');
      insertArea('basement-1', 'Basement', { parentId: 'house-1' });
      insertArea('bathroom-1', 'Bathroom', { parentId: 'basement-1' });

      const map = loadAreaMap(db);

      expect(map.size).toBe(3);

      const house = map.get('house-1');
      expect(house).toEqual({ id: 'house-1', name: 'House', color: null, parentId: null });

      const basement = map.get('basement-1');
      expect(basement).toEqual({
        id: 'basement-1',
        name: 'Basement',
        color: null,
        parentId: 'house-1',
      });

      const bathroom = map.get('bathroom-1');
      expect(bathroom).toEqual({
        id: 'bathroom-1',
        name: 'Bathroom',
        color: null,
        parentId: 'basement-1',
      });
    });

    it('propagates color field correctly', () => {
      insertArea('colored-1', 'Colored Area', { color: '#aabbcc' });
      insertArea('child-1', 'Child', { parentId: 'colored-1', color: null });

      const map = loadAreaMap(db);

      expect(map.get('colored-1')?.color).toBe('#aabbcc');
      expect(map.get('child-1')?.color).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // resolveAreaAncestors
  // ---------------------------------------------------------------------------

  describe('resolveAreaAncestors', () => {
    it('returns empty array for a root area (no parent)', () => {
      insertArea('house-1', 'House');

      const map = loadAreaMap(db);
      const ancestors = resolveAreaAncestors('house-1', map);

      expect(ancestors).toEqual([]);
    });

    it('AC1 — linear 3-level chain: returns 2 ancestors in root-first order, leaf NOT included', () => {
      insertArea('house-1', 'House');
      insertArea('basement-1', 'Basement', { parentId: 'house-1' });
      insertArea('bathroom-1', 'Bathroom', { parentId: 'basement-1' });

      const map = loadAreaMap(db);
      const ancestors = resolveAreaAncestors('bathroom-1', map);

      expect(ancestors).toHaveLength(2);
      expect(ancestors[0]).toEqual({ id: 'house-1', name: 'House', color: null });
      expect(ancestors[1]).toEqual({ id: 'basement-1', name: 'Basement', color: null });
    });

    it('AC3 — 5-level deep tree: returns 4 ancestors in root-first order', () => {
      insertArea('property-1', 'Property');
      insertArea('house-1', 'House', { parentId: 'property-1' });
      insertArea('floor1-1', 'Floor 1', { parentId: 'house-1' });
      insertArea('kitchen-1', 'Kitchen Area', { parentId: 'floor1-1' });
      insertArea('pantry-1', 'Pantry', { parentId: 'kitchen-1' });

      const map = loadAreaMap(db);
      const ancestors = resolveAreaAncestors('pantry-1', map);

      expect(ancestors).toHaveLength(4);
      expect(ancestors[0].name).toBe('Property');
      expect(ancestors[1].name).toBe('House');
      expect(ancestors[2].name).toBe('Floor 1');
      expect(ancestors[3].name).toBe('Kitchen Area');

      // Pantry itself must NOT appear in the ancestors array
      const pantryInAncestors = ancestors.some((a) => a.id === 'pantry-1');
      expect(pantryInAncestors).toBe(false);
    });

    it('AC4 — orphaned parent: returns empty array when parentId points to non-existent area', () => {
      // floor1 has parentId pointing to an area that is not in the DB.
      // Must disable FK checks to insert directly with a dangling parentId.
      // Use try/finally to ensure FK checks are always re-enabled.
      sqlite.pragma('foreign_keys = OFF');
      try {
        insertArea('floor1-1', 'Floor 1', { parentId: 'nonexistent-parent-id' });
      } finally {
        sqlite.pragma('foreign_keys = ON');
      }

      const map = loadAreaMap(db);
      const ancestors = resolveAreaAncestors('floor1-1', map);

      // parent is missing from map → partial chain → walk stops immediately → []
      expect(ancestors).toEqual([]);
    });

    it('AC4 — deeper variant: orphan in chain breaks ancestor resolution above missing link', () => {
      // House → (orphan) → Room
      // Room.parentId = 'orphan-id' which is not in the DB.
      // Must disable FK checks to insert the dangling parentId.
      // Use try/finally to ensure FK checks are always re-enabled.
      sqlite.pragma('foreign_keys = OFF');
      try {
        insertArea('room-1', 'Room', { parentId: 'orphan-id' });
      } finally {
        sqlite.pragma('foreign_keys = ON');
      }
      // House is a separate root that is NOT directly connected to Room
      insertArea('house-1', 'House');

      const map = loadAreaMap(db);
      const ancestors = resolveAreaAncestors('room-1', map);

      // 'orphan-id' is missing from map — chain breaks there, nothing above it is reachable
      expect(ancestors).toEqual([]);
    });

    it('cycle protection: does not throw or loop infinitely when A→B→A', () => {
      // Bypass service validation to insert a cycle directly
      // We must disable FK checks first since parentId FK references same table.
      // Use try/finally to ensure FK checks are always re-enabled.
      sqlite.pragma('foreign_keys = OFF');
      try {
        insertArea('a-1', 'Area A', { parentId: 'b-1' });
        insertArea('b-1', 'Area B', { parentId: 'a-1' });
      } finally {
        sqlite.pragma('foreign_keys = ON');
      }

      const map = loadAreaMap(db);

      // Should not throw
      let ancestors: ReturnType<typeof resolveAreaAncestors> | undefined;
      expect(() => {
        ancestors = resolveAreaAncestors('a-1', map);
      }).not.toThrow();

      // Max depth is 20 — length must be ≤ 20
      expect(ancestors!.length).toBeLessThanOrEqual(20);

      // No id should appear twice in ancestors
      const ids = ancestors!.map((a) => a.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('color is propagated correctly in ancestor entries', () => {
      insertArea('root-1', 'Root', { color: '#aabbcc' });
      insertArea('child-1', 'Child', { parentId: 'root-1', color: '#112233' });
      insertArea('leaf-1', 'Leaf', { parentId: 'child-1', color: null });

      const map = loadAreaMap(db);
      const ancestors = resolveAreaAncestors('leaf-1', map);

      expect(ancestors).toHaveLength(2);
      expect(ancestors[0]).toEqual({ id: 'root-1', name: 'Root', color: '#aabbcc' });
      expect(ancestors[1]).toEqual({ id: 'child-1', name: 'Child', color: '#112233' });
    });

    it('returns empty array for an area not present in the map', () => {
      // Empty map — area ID not found
      const map = new Map();
      const ancestors = resolveAreaAncestors('nonexistent', map);
      expect(ancestors).toEqual([]);
    });
  });
});
