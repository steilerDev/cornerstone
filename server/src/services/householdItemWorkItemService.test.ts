import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq, and } from 'drizzle-orm';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import * as service from './householdItemWorkItemService.js';
import { NotFoundError, ConflictError } from '../errors/AppError.js';

describe('householdItemWorkItemService', () => {
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

  function insertTestUser(userId = 'user-001') {
    const now = new Date().toISOString();
    db.insert(schema.users)
      .values({
        id: userId,
        email: `${userId}@example.com`,
        displayName: 'Test User',
        passwordHash: 'hashed',
        role: 'member',
        authProvider: 'local',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return userId;
  }

  function insertHouseholdItem(name = 'Test Item', userId = 'user-001'): string {
    const id = `hi-${++idCounter}`;
    const now = new Date(Date.now() + idCounter).toISOString();
    db.insert(schema.householdItems)
      .values({
        id,
        name,
        description: null,
        category: 'appliances',
        status: 'not_ordered',
        vendorId: null,
        url: null,
        room: null,
        quantity: 1,
        orderDate: null,
        expectedDeliveryDate: null,
        actualDeliveryDate: null,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  function insertWorkItem(title = 'Test Work Item', userId = 'user-001'): string {
    const id = `wi-${++idCounter}`;
    const now = new Date(Date.now() + idCounter).toISOString();
    db.insert(schema.workItems)
      .values({
        id,
        title,
        status: 'not_started',
        startDate: null,
        endDate: null,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  beforeEach(() => {
    const testDb = createTestDb();
    sqlite = testDb.sqlite;
    db = testDb.db;
    idCounter = 0;
    insertTestUser();
  });

  afterEach(() => {
    sqlite.close();
  });

  // ─── listLinkedWorkItems ──────────────────────────────────────────────────

  describe('listLinkedWorkItems', () => {
    it('returns empty array when no work items are linked', () => {
      const hiId = insertHouseholdItem('Item No Links');

      const result = service.listLinkedWorkItems(db, hiId);

      expect(result).toEqual([]);
    });

    it('returns linked work items with correct shape', () => {
      const hiId = insertHouseholdItem('Item With Links');
      const wi1 = insertWorkItem('Task 1');
      const wi2 = insertWorkItem('Task 2');

      // Link work items
      db.insert(schema.householdItemWorkItems)
        .values({ householdItemId: hiId, workItemId: wi1 })
        .run();
      db.insert(schema.householdItemWorkItems)
        .values({ householdItemId: hiId, workItemId: wi2 })
        .run();

      const result = service.listLinkedWorkItems(db, hiId);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        id: wi1,
        title: 'Task 1',
        status: 'not_started',
        startDate: null,
        endDate: null,
        assignedUser: null,
      });
      expect(result[1]).toMatchObject({
        id: wi2,
        title: 'Task 2',
        status: 'not_started',
        startDate: null,
        endDate: null,
        assignedUser: null,
      });
    });

    it('returns linked work items with start and end dates', () => {
      const hiId = insertHouseholdItem('Item With Dates');
      const wi1Id = `wi-with-dates-1`;
      const startDate = '2026-04-01T00:00:00.000Z';
      const endDate = '2026-04-15T00:00:00.000Z';

      db.insert(schema.workItems)
        .values({
          id: wi1Id,
          title: 'Scheduled Task',
          status: 'in_progress',
          startDate,
          endDate,
          createdBy: 'user-001',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .run();

      db.insert(schema.householdItemWorkItems)
        .values({ householdItemId: hiId, workItemId: wi1Id })
        .run();

      const result = service.listLinkedWorkItems(db, hiId);

      expect(result).toHaveLength(1);
      expect(result[0].startDate).toBe(startDate);
      expect(result[0].endDate).toBe(endDate);
      expect(result[0].assignedUser).toBeNull();
    });

    it('throws NotFoundError when household item does not exist', () => {
      expect(() => service.listLinkedWorkItems(db, 'nonexistent-hi')).toThrow(NotFoundError);
    });
  });

  // ─── linkWorkItemToHouseholdItem ──────────────────────────────────────────

  describe('linkWorkItemToHouseholdItem', () => {
    it('inserts link and returns work item summary', () => {
      const hiId = insertHouseholdItem('Item To Link');
      const wiId = insertWorkItem('Work Item To Link');

      const result = service.linkWorkItemToHouseholdItem(db, hiId, wiId);

      expect(result).toMatchObject({
        id: wiId,
        title: 'Work Item To Link',
        status: 'not_started',
        startDate: null,
        endDate: null,
        assignedUser: null,
      });

      // Verify link was created
      const link = db
        .select()
        .from(schema.householdItemWorkItems)
        .where(
          and(
            eq(schema.householdItemWorkItems.householdItemId, hiId),
            eq(schema.householdItemWorkItems.workItemId, wiId),
          ),
        )
        .get();
      expect(link).toBeDefined();
    });

    it('throws NotFoundError when household item does not exist', () => {
      const wiId = insertWorkItem('Work Item');

      expect(() => service.linkWorkItemToHouseholdItem(db, 'nonexistent-hi', wiId)).toThrow(
        NotFoundError,
      );
    });

    it('throws NotFoundError when work item does not exist', () => {
      const hiId = insertHouseholdItem('Item');

      expect(() => service.linkWorkItemToHouseholdItem(db, hiId, 'nonexistent-wi')).toThrow(
        NotFoundError,
      );
    });

    it('throws ConflictError when work item is already linked', () => {
      const hiId = insertHouseholdItem('Item');
      const wiId = insertWorkItem('Work Item');

      // Create first link
      service.linkWorkItemToHouseholdItem(db, hiId, wiId);

      // Try to create duplicate link
      expect(() => service.linkWorkItemToHouseholdItem(db, hiId, wiId)).toThrow(ConflictError);
    });
  });

  // ─── unlinkWorkItemFromHouseholdItem ──────────────────────────────────────

  describe('unlinkWorkItemFromHouseholdItem', () => {
    it('removes the link', () => {
      const hiId = insertHouseholdItem('Item');
      const wiId = insertWorkItem('Work Item');

      // Create link
      db.insert(schema.householdItemWorkItems)
        .values({ householdItemId: hiId, workItemId: wiId })
        .run();

      // Unlink
      service.unlinkWorkItemFromHouseholdItem(db, hiId, wiId);

      // Verify link was removed
      const link = db
        .select()
        .from(schema.householdItemWorkItems)
        .where(
          and(
            eq(schema.householdItemWorkItems.householdItemId, hiId),
            eq(schema.householdItemWorkItems.workItemId, wiId),
          ),
        )
        .get();
      expect(link).toBeUndefined();
    });

    it('throws NotFoundError when household item does not exist', () => {
      const wiId = insertWorkItem('Work Item');

      expect(() => service.unlinkWorkItemFromHouseholdItem(db, 'nonexistent-hi', wiId)).toThrow(
        NotFoundError,
      );
    });

    it('throws NotFoundError when link does not exist', () => {
      const hiId = insertHouseholdItem('Item');
      const wiId = insertWorkItem('Work Item');

      expect(() => service.unlinkWorkItemFromHouseholdItem(db, hiId, wiId)).toThrow(NotFoundError);
    });
  });

  // ─── listLinkedHouseholdItemsForWorkItem ──────────────────────────────────

  describe('listLinkedHouseholdItemsForWorkItem', () => {
    it('returns empty array when no household items are linked', () => {
      const wiId = insertWorkItem('Work Item No Links');

      const result = service.listLinkedHouseholdItemsForWorkItem(db, wiId);

      expect(result).toEqual([]);
    });

    it('returns linked household items with correct shape', () => {
      const wiId = insertWorkItem('Work Item With Links');
      const hi1 = insertHouseholdItem('Item 1');
      const hi2 = insertHouseholdItem('Item 2');

      // Link household items
      db.insert(schema.householdItemWorkItems)
        .values({ householdItemId: hi1, workItemId: wiId })
        .run();
      db.insert(schema.householdItemWorkItems)
        .values({ householdItemId: hi2, workItemId: wiId })
        .run();

      const result = service.listLinkedHouseholdItemsForWorkItem(db, wiId);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        id: hi1,
        name: 'Item 1',
        category: 'appliances',
        status: 'not_ordered',
        expectedDeliveryDate: null,
      });
      expect(result[1]).toMatchObject({
        id: hi2,
        name: 'Item 2',
        category: 'appliances',
        status: 'not_ordered',
        expectedDeliveryDate: null,
      });
    });

    it('returns linked household items with delivery dates', () => {
      const wiId = insertWorkItem('Work Item');
      const hiId = `hi-with-date-1`;
      const deliveryDate = '2026-05-01T00:00:00.000Z';

      db.insert(schema.householdItems)
        .values({
          id: hiId,
          name: 'Item With Delivery Date',
          description: null,
          category: 'appliances',
          status: 'not_ordered',
          vendorId: null,
          url: null,
          room: null,
          quantity: 1,
          orderDate: null,
          expectedDeliveryDate: deliveryDate,
          actualDeliveryDate: null,
          createdBy: 'user-001',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .run();

      db.insert(schema.householdItemWorkItems)
        .values({ householdItemId: hiId, workItemId: wiId })
        .run();

      const result = service.listLinkedHouseholdItemsForWorkItem(db, wiId);

      expect(result).toHaveLength(1);
      expect(result[0].expectedDeliveryDate).toBe(deliveryDate);
    });

    it('throws NotFoundError when work item does not exist', () => {
      expect(() => service.listLinkedHouseholdItemsForWorkItem(db, 'nonexistent-wi')).toThrow(
        NotFoundError,
      );
    });
  });
});
