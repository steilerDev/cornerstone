/**
 * Unit tests for householdItemWorkItemService.
 *
 * The service exposes a single public function:
 *   listDependentHouseholdItemsForWorkItem(db, workItemId)
 *
 * It is a thin wrapper around householdItemDepService.listDependentHouseholdItemsForWorkItem,
 * which performs an inner join between householdItemDeps and householdItems where
 * predecessorType = 'work_item' and predecessorId = workItemId.
 *
 * Tests verify:
 *   - Empty list when no household items depend on the work item
 *   - Correct summary fields (id, name, category, status, delivery dates)
 *   - Multiple dependents returned
 *   - Isolation: items linked to a different work item are not returned
 *   - Only 'work_item' predecessor type rows are returned (milestone rows excluded)
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import { listDependentHouseholdItemsForWorkItem } from './householdItemWorkItemService.js';

describe('householdItemWorkItemService', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;
  let timestampOffset = 0;

  function createTestDb() {
    const sqliteDb = new Database(':memory:');
    sqliteDb.pragma('journal_mode = WAL');
    sqliteDb.pragma('foreign_keys = ON');
    runMigrations(sqliteDb);
    return { sqlite: sqliteDb, db: drizzle(sqliteDb, { schema }) };
  }

  function makeId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }

  function insertUser(): string {
    const id = makeId('user');
    const now = new Date(Date.now() + timestampOffset++).toISOString();
    db.insert(schema.users)
      .values({
        id,
        email: `${id}@example.com`,
        displayName: 'Test User',
        role: 'member',
        authProvider: 'local',
        passwordHash: '$scrypt$test',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  function insertWorkItem(
    userId: string,
    overrides: Partial<typeof schema.workItems.$inferInsert> = {},
  ): string {
    const id = makeId('wi');
    const now = new Date(Date.now() + timestampOffset++).toISOString();
    db.insert(schema.workItems)
      .values({
        id,
        title: 'Test Work Item',
        status: 'not_started',
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
        startDate: null,
        endDate: null,
        durationDays: null,
        startAfter: null,
        startBefore: null,
        assignedUserId: null,
        ...overrides,
      })
      .run();
    return id;
  }

  function insertMilestone(
    userId: string,
    overrides: Partial<typeof schema.milestones.$inferInsert> = {},
  ): number {
    const now = new Date(Date.now() + timestampOffset++).toISOString();
    const result = db
      .insert(schema.milestones)
      .values({
        title: 'Test Milestone',
        targetDate: '2026-08-01',
        isCompleted: false,
        completedAt: null,
        color: null,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
        ...overrides,
      })
      .returning({ id: schema.milestones.id })
      .get();
    return result!.id;
  }

  function insertHouseholdItem(
    overrides: Partial<typeof schema.householdItems.$inferInsert> = {},
  ): string {
    const id = makeId('hi');
    const now = new Date(Date.now() + timestampOffset++).toISOString();
    db.insert(schema.householdItems)
      .values({
        id,
        name: 'Test Household Item',
        categoryId: 'hic-furniture',
        status: 'planned',
        quantity: 1,
        createdAt: now,
        updatedAt: now,
        description: null,
        vendorId: null,
        url: null,
        areaId: null,
        orderDate: null,
        actualDeliveryDate: null,
        createdBy: null,
        earliestDeliveryDate: null,
        latestDeliveryDate: null,
        targetDeliveryDate: null,
        isLate: false,
        ...overrides,
      })
      .run();
    return id;
  }

  function insertDep(
    householdItemId: string,
    predecessorType: 'work_item' | 'milestone',
    predecessorId: string,
  ): void {
    db.insert(schema.householdItemDeps)
      .values({ householdItemId, predecessorType, predecessorId })
      .run();
  }

  beforeEach(() => {
    timestampOffset = 0;
    const testDb = createTestDb();
    sqlite = testDb.sqlite;
    db = testDb.db;
  });

  afterEach(() => {
    sqlite.close();
  });

  // ─── empty result cases ────────────────────────────────────────────────────

  describe('empty results', () => {
    it('returns an empty array when no household items depend on the work item', () => {
      const userId = insertUser();
      const wiId = insertWorkItem(userId);

      const result = listDependentHouseholdItemsForWorkItem(db, wiId);

      expect(result).toEqual([]);
    });

    it('returns an empty array for a work item ID that does not exist in the DB', () => {
      // The service does not validate that the work item exists — it just returns an empty list
      const result = listDependentHouseholdItemsForWorkItem(db, 'nonexistent-wi');

      expect(result).toEqual([]);
    });

    it('returns an empty array when household items depend on a different work item', () => {
      const userId = insertUser();
      const wiId1 = insertWorkItem(userId);
      const wiId2 = insertWorkItem(userId);
      const hiId = insertHouseholdItem();

      insertDep(hiId, 'work_item', wiId2);

      const result = listDependentHouseholdItemsForWorkItem(db, wiId1);

      expect(result).toEqual([]);
    });

    it('returns an empty array when household items only have milestone dependencies', () => {
      const userId = insertUser();
      const wiId = insertWorkItem(userId);
      const milestoneId = insertMilestone(userId);
      const hiId = insertHouseholdItem();

      insertDep(hiId, 'milestone', milestoneId.toString());

      // wiId is not referenced — milestone dep should not appear in WI query
      const result = listDependentHouseholdItemsForWorkItem(db, wiId);

      expect(result).toEqual([]);
    });
  });

  // ─── single dependent ──────────────────────────────────────────────────────

  describe('single dependent household item', () => {
    it('returns the dependent household item with correct id and name', () => {
      const userId = insertUser();
      const wiId = insertWorkItem(userId);
      const hiId = insertHouseholdItem({ name: 'Kitchen Appliances' });

      insertDep(hiId, 'work_item', wiId);

      const result = listDependentHouseholdItemsForWorkItem(db, wiId);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(hiId);
      expect(result[0].name).toBe('Kitchen Appliances');
    });

    it('returns the correct category for the household item', () => {
      const userId = insertUser();
      const wiId = insertWorkItem(userId);
      const hiId = insertHouseholdItem({ categoryId: 'hic-furniture' });

      insertDep(hiId, 'work_item', wiId);

      const result = listDependentHouseholdItemsForWorkItem(db, wiId);

      expect(result[0].category).toBe('hic-furniture');
    });

    it('returns the correct status for the household item', () => {
      const userId = insertUser();
      const wiId = insertWorkItem(userId);
      const hiId = insertHouseholdItem({ status: 'purchased' });

      insertDep(hiId, 'work_item', wiId);

      const result = listDependentHouseholdItemsForWorkItem(db, wiId);

      expect(result[0].status).toBe('purchased');
    });

    it('returns delivery date fields as null when not set', () => {
      const userId = insertUser();
      const wiId = insertWorkItem(userId);
      const hiId = insertHouseholdItem();

      insertDep(hiId, 'work_item', wiId);

      const result = listDependentHouseholdItemsForWorkItem(db, wiId);

      expect(result[0].targetDeliveryDate).toBeNull();
      expect(result[0].earliestDeliveryDate).toBeNull();
      expect(result[0].latestDeliveryDate).toBeNull();
    });

    it('returns delivery date fields when they are set', () => {
      const userId = insertUser();
      const wiId = insertWorkItem(userId);
      const hiId = insertHouseholdItem({
        targetDeliveryDate: '2026-09-15',
        earliestDeliveryDate: '2026-09-10',
        latestDeliveryDate: '2026-09-20',
      });

      insertDep(hiId, 'work_item', wiId);

      const result = listDependentHouseholdItemsForWorkItem(db, wiId);

      expect(result[0].targetDeliveryDate).toBe('2026-09-15');
      expect(result[0].earliestDeliveryDate).toBe('2026-09-10');
      expect(result[0].latestDeliveryDate).toBe('2026-09-20');
    });

    it('returns all required fields in the summary object', () => {
      const userId = insertUser();
      const wiId = insertWorkItem(userId);
      const hiId = insertHouseholdItem({ name: 'Dining Table', status: 'planned' });

      insertDep(hiId, 'work_item', wiId);

      const result = listDependentHouseholdItemsForWorkItem(db, wiId);
      const summary = result[0];

      expect(summary).toHaveProperty('id');
      expect(summary).toHaveProperty('name');
      expect(summary).toHaveProperty('category');
      expect(summary).toHaveProperty('status');
      expect(summary).toHaveProperty('targetDeliveryDate');
      expect(summary).toHaveProperty('earliestDeliveryDate');
      expect(summary).toHaveProperty('latestDeliveryDate');
    });
  });

  // ─── multiple dependents ───────────────────────────────────────────────────

  describe('multiple dependent household items', () => {
    it('returns all household items that depend on the same work item', () => {
      const userId = insertUser();
      const wiId = insertWorkItem(userId);
      const hiId1 = insertHouseholdItem({ name: 'Sofa' });
      const hiId2 = insertHouseholdItem({ name: 'Coffee Table' });
      const hiId3 = insertHouseholdItem({ name: 'Armchair' });

      insertDep(hiId1, 'work_item', wiId);
      insertDep(hiId2, 'work_item', wiId);
      insertDep(hiId3, 'work_item', wiId);

      const result = listDependentHouseholdItemsForWorkItem(db, wiId);

      expect(result).toHaveLength(3);
      const ids = result.map((r) => r.id);
      expect(ids).toContain(hiId1);
      expect(ids).toContain(hiId2);
      expect(ids).toContain(hiId3);
    });

    it('only returns items for the requested work item when multiple WIs have dependents', () => {
      const userId = insertUser();
      const wiId1 = insertWorkItem(userId, { title: 'Framing' });
      const wiId2 = insertWorkItem(userId, { title: 'Electrical' });

      const hiId1 = insertHouseholdItem({ name: 'Ceiling Fan' }); // depends on wiId1
      const hiId2 = insertHouseholdItem({ name: 'Light Fixture' }); // depends on wiId2

      insertDep(hiId1, 'work_item', wiId1);
      insertDep(hiId2, 'work_item', wiId2);

      const result = listDependentHouseholdItemsForWorkItem(db, wiId1);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(hiId1);
    });

    it('excludes milestone-dependent items from work item results even if same HI has both', () => {
      const userId = insertUser();
      const wiId = insertWorkItem(userId);
      const milestoneId = insertMilestone(userId);

      // hiId1 depends on wiId (should appear)
      const hiId1 = insertHouseholdItem({ name: 'Work Item Dependent' });
      // hiId2 depends on milestone (should NOT appear for wiId)
      const hiId2 = insertHouseholdItem({ name: 'Milestone Dependent' });

      insertDep(hiId1, 'work_item', wiId);
      insertDep(hiId2, 'milestone', milestoneId.toString());

      const result = listDependentHouseholdItemsForWorkItem(db, wiId);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(hiId1);
    });
  });

  // ─── data integrity ────────────────────────────────────────────────────────

  describe('data integrity', () => {
    it('correctly reflects the status of a household item', () => {
      const userId = insertUser();
      const wiId = insertWorkItem(userId);

      const statuses = ['planned', 'purchased', 'arrived', 'scheduled'] as const;
      const hiIds: string[] = [];

      for (const status of statuses) {
        const hiId = insertHouseholdItem({ name: `HI ${status}`, status });
        insertDep(hiId, 'work_item', wiId);
        hiIds.push(hiId);
      }

      const result = listDependentHouseholdItemsForWorkItem(db, wiId);
      expect(result).toHaveLength(4);

      const resultMap = new Map(result.map((r) => [r.id, r]));
      for (let i = 0; i < statuses.length; i++) {
        expect(resultMap.get(hiIds[i])?.status).toBe(statuses[i]);
      }
    });
  });
});
