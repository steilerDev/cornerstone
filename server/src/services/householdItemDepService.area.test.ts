/**
 * Tests for area field on predecessor summaries in householdItemDepService (Issue #1273).
 *
 * Verifies that listDeps and createDep correctly populate predecessor.area for
 * work_item predecessors with an assigned area, and return null for work_items
 * without area or milestone predecessors.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import * as householdItemDepService from './householdItemDepService.js';

describe('householdItemDepService — predecessor area enrichment', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;
  let idCounter = 0;

  beforeEach(() => {
    const sqliteDb = new Database(':memory:');
    sqliteDb.pragma('journal_mode = WAL');
    sqliteDb.pragma('foreign_keys = ON');
    runMigrations(sqliteDb);
    sqlite = sqliteDb;
    db = drizzle(sqliteDb, { schema });
    idCounter = 0;
  });

  afterEach(() => {
    sqlite.close();
  });

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  function makeId(prefix: string): string {
    return `${prefix}-area-dep-${++idCounter}`;
  }

  function now(): string {
    return new Date(Date.now() + idCounter).toISOString();
  }

  function insertUser(): string {
    const id = makeId('user');
    const ts = now();
    db.insert(schema.users)
      .values({
        id,
        email: `${id}@example.com`,
        displayName: 'Test User',
        role: 'member',
        authProvider: 'local',
        passwordHash: '$scrypt$test',
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    return id;
  }

  function insertArea(opts: {
    name: string;
    parentId?: string | null;
    color?: string | null;
  }): string {
    const id = makeId('area');
    const ts = now();
    db.insert(schema.areas)
      .values({
        id,
        name: opts.name,
        parentId: opts.parentId ?? null,
        color: opts.color ?? '#aabbcc',
        sortOrder: idCounter,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    return id;
  }

  function insertWorkItem(userId: string, areaId: string | null = null): string {
    const id = makeId('wi');
    const ts = now();
    db.insert(schema.workItems)
      .values({
        id,
        title: 'Test Work Item',
        status: 'not_started',
        createdBy: userId,
        areaId,
        startDate: null,
        endDate: null,
        durationDays: null,
        startAfter: null,
        startBefore: null,
        assignedUserId: null,
        assignedVendorId: null,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    return id;
  }

  function insertMilestone(userId: string): number {
    const ts = now();
    const result = db
      .insert(schema.milestones)
      .values({
        title: 'Test Milestone',
        targetDate: '2026-06-01',
        isCompleted: false,
        completedAt: null,
        color: null,
        createdBy: userId,
        createdAt: ts,
        updatedAt: ts,
      })
      .returning({ id: schema.milestones.id })
      .get();
    return result!.id;
  }

  function insertHouseholdItem(): string {
    const id = makeId('hi');
    const ts = now();
    db.insert(schema.householdItems)
      .values({
        id,
        name: 'Test Household Item',
        categoryId: 'hic-furniture',
        status: 'planned',
        quantity: 1,
        areaId: null,
        vendorId: null,
        url: null,
        description: null,
        orderDate: null,
        targetDeliveryDate: null,
        actualDeliveryDate: null,
        earliestDeliveryDate: null,
        latestDeliveryDate: null,
        isLate: false,
        createdBy: null,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    return id;
  }

  // ─── listDeps tests ────────────────────────────────────────────────────────

  describe('listDeps', () => {
    it('work_item predecessor with area → predecessor.area has correct id and name', () => {
      const userId = insertUser();
      const areaId = insertArea({ name: 'Kitchen', color: '#ff0000' });
      const wiId = insertWorkItem(userId, areaId);
      const hiId = insertHouseholdItem();

      db.insert(schema.householdItemDeps)
        .values({
          householdItemId: hiId,
          predecessorType: 'work_item',
          predecessorId: wiId,
        })
        .run();

      const result = householdItemDepService.listDeps(db, hiId);

      expect(result).toHaveLength(1);
      const dep = result[0]!;
      expect(dep.predecessorType).toBe('work_item');
      expect(dep.predecessor.area).not.toBeNull();
      expect(dep.predecessor.area!.id).toBe(areaId);
      expect(dep.predecessor.area!.name).toBe('Kitchen');
      expect(dep.predecessor.area!.color).toBe('#ff0000');
      expect(dep.predecessor.area!.ancestors).toEqual([]);
    });

    it('work_item predecessor without area → predecessor.area is null', () => {
      const userId = insertUser();
      const wiId = insertWorkItem(userId, null); // no area
      const hiId = insertHouseholdItem();

      db.insert(schema.householdItemDeps)
        .values({
          householdItemId: hiId,
          predecessorType: 'work_item',
          predecessorId: wiId,
        })
        .run();

      const result = householdItemDepService.listDeps(db, hiId);

      expect(result).toHaveLength(1);
      expect(result[0]!.predecessor.area).toBeNull();
    });

    it('milestone predecessor → predecessor.area is null', () => {
      const userId = insertUser();
      const milestoneId = insertMilestone(userId);
      const hiId = insertHouseholdItem();

      db.insert(schema.householdItemDeps)
        .values({
          householdItemId: hiId,
          predecessorType: 'milestone',
          predecessorId: milestoneId.toString(),
        })
        .run();

      const result = householdItemDepService.listDeps(db, hiId);

      expect(result).toHaveLength(1);
      expect(result[0]!.predecessorType).toBe('milestone');
      expect(result[0]!.predecessor.area).toBeNull();
    });
  });

  // ─── createDep tests ───────────────────────────────────────────────────────

  describe('createDep', () => {
    it('work_item with area → returned predecessor has area populated', () => {
      const userId = insertUser();
      const areaId = insertArea({ name: 'Garage', color: '#0000ff' });
      const wiId = insertWorkItem(userId, areaId);
      const hiId = insertHouseholdItem();

      const result = householdItemDepService.createDep(db, hiId, {
        predecessorType: 'work_item',
        predecessorId: wiId,
      });

      expect(result.predecessor.area).not.toBeNull();
      expect(result.predecessor.area!.id).toBe(areaId);
      expect(result.predecessor.area!.name).toBe('Garage');
    });

    it('work_item without area → returned predecessor has area null', () => {
      const userId = insertUser();
      const wiId = insertWorkItem(userId, null);
      const hiId = insertHouseholdItem();

      const result = householdItemDepService.createDep(db, hiId, {
        predecessorType: 'work_item',
        predecessorId: wiId,
      });

      expect(result.predecessor.area).toBeNull();
    });

    it('milestone → returned predecessor has area null', () => {
      const userId = insertUser();
      const milestoneId = insertMilestone(userId);
      const hiId = insertHouseholdItem();

      const result = householdItemDepService.createDep(db, hiId, {
        predecessorType: 'milestone',
        predecessorId: milestoneId.toString(),
      });

      expect(result.predecessorType).toBe('milestone');
      expect(result.predecessor.area).toBeNull();
    });
  });

  // ─── Ancestor chain tests ───────────────────────────────────────────────────

  describe('ancestor chain', () => {
    it('work_item in child area returns non-empty ancestors array', () => {
      const userId = insertUser();
      const rootAreaId = insertArea({ name: 'House', color: '#111111' });
      const childAreaId = insertArea({ name: 'Living Room', parentId: rootAreaId });
      const wiId = insertWorkItem(userId, childAreaId);
      const hiId = insertHouseholdItem();

      db.insert(schema.householdItemDeps)
        .values({
          householdItemId: hiId,
          predecessorType: 'work_item',
          predecessorId: wiId,
        })
        .run();

      const result = householdItemDepService.listDeps(db, hiId);

      expect(result).toHaveLength(1);
      const area = result[0]!.predecessor.area;
      expect(area).not.toBeNull();
      expect(area!.id).toBe(childAreaId);
      expect(area!.name).toBe('Living Room');
      expect(area!.ancestors).toHaveLength(1);
      expect(area!.ancestors[0]!.id).toBe(rootAreaId);
      expect(area!.ancestors[0]!.name).toBe('House');
    });
  });
});
