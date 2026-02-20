import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import * as workItemVendorService from './workItemVendorService.js';
import { NotFoundError, ConflictError } from '../errors/AppError.js';

describe('workItemVendorService', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;

  function createTestDb() {
    const sqliteDb = new Database(':memory:');
    sqliteDb.pragma('journal_mode = WAL');
    sqliteDb.pragma('foreign_keys = ON');
    runMigrations(sqliteDb);
    return { sqlite: sqliteDb, db: drizzle(sqliteDb, { schema }) };
  }

  function insertTestUser(id = 'user-001', email = 'test@example.com', displayName = 'Test User') {
    const now = new Date().toISOString();
    db.insert(schema.users)
      .values({
        id,
        email,
        displayName,
        role: 'member',
        authProvider: 'local',
        passwordHash: 'hashed',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  let idCounter = 0;

  function insertTestWorkItem(title = 'Test Work Item', userId = 'user-001') {
    const id = `wi-${++idCounter}`;
    const now = new Date(Date.now() + idCounter).toISOString();
    db.insert(schema.workItems)
      .values({
        id,
        title,
        status: 'not_started',
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  function insertTestVendor(name = 'Test Vendor', userId?: string | null) {
    const id = `vendor-${++idCounter}`;
    const now = new Date(Date.now() + idCounter).toISOString();
    db.insert(schema.vendors)
      .values({
        id,
        name,
        specialty: null,
        phone: null,
        email: null,
        address: null,
        notes: null,
        createdBy: userId ?? null,
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

  // ─── listWorkItemVendors() ─────────────────────────────────────────────────

  describe('listWorkItemVendors()', () => {
    it('returns empty array when no vendors are linked', () => {
      const workItemId = insertTestWorkItem();

      const result = workItemVendorService.listWorkItemVendors(db, workItemId);

      expect(result).toEqual([]);
    });

    it('returns linked vendor with all fields', () => {
      const workItemId = insertTestWorkItem('Foundation Work');
      const vendorId = insertTestVendor('Smith Concrete', 'user-001');

      db.insert(schema.workItemVendors).values({ workItemId, vendorId }).run();

      const result = workItemVendorService.listWorkItemVendors(db, workItemId);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(vendorId);
      expect(result[0].name).toBe('Smith Concrete');
      expect(result[0].createdBy?.id).toBe('user-001');
    });

    it('returns multiple linked vendors', () => {
      const workItemId = insertTestWorkItem();
      const vendorId1 = insertTestVendor('Vendor A');
      const vendorId2 = insertTestVendor('Vendor B');

      db.insert(schema.workItemVendors).values({ workItemId, vendorId: vendorId1 }).run();
      db.insert(schema.workItemVendors).values({ workItemId, vendorId: vendorId2 }).run();

      const result = workItemVendorService.listWorkItemVendors(db, workItemId);

      expect(result).toHaveLength(2);
      const names = result.map((v) => v.name).sort();
      expect(names).toContain('Vendor A');
      expect(names).toContain('Vendor B');
    });

    it('does not return vendors linked to a different work item', () => {
      const workItemId1 = insertTestWorkItem('Work Item 1');
      const workItemId2 = insertTestWorkItem('Work Item 2');
      const vendorId = insertTestVendor('Exclusive Vendor');

      db.insert(schema.workItemVendors).values({ workItemId: workItemId2, vendorId }).run();

      const result = workItemVendorService.listWorkItemVendors(db, workItemId1);

      expect(result).toEqual([]);
    });

    it('returns vendor with null createdBy when createdBy is null', () => {
      const workItemId = insertTestWorkItem();
      const vendorId = insertTestVendor('Anonymous Vendor', null);

      db.insert(schema.workItemVendors).values({ workItemId, vendorId }).run();

      const result = workItemVendorService.listWorkItemVendors(db, workItemId);

      expect(result).toHaveLength(1);
      expect(result[0].createdBy).toBeNull();
    });

    it('throws NotFoundError when work item does not exist', () => {
      expect(() => {
        workItemVendorService.listWorkItemVendors(db, 'non-existent-wi');
      }).toThrow(NotFoundError);

      expect(() => {
        workItemVendorService.listWorkItemVendors(db, 'non-existent-wi');
      }).toThrow('Work item not found');
    });
  });

  // ─── linkVendorToWorkItem() ────────────────────────────────────────────────

  describe('linkVendorToWorkItem()', () => {
    it('links a vendor to a work item and returns the vendor', () => {
      const workItemId = insertTestWorkItem();
      const vendorId = insertTestVendor('Electrical Pro', 'user-001');

      const result = workItemVendorService.linkVendorToWorkItem(db, workItemId, vendorId);

      expect(result.id).toBe(vendorId);
      expect(result.name).toBe('Electrical Pro');
    });

    it('persists the link in the database (verified via listWorkItemVendors)', () => {
      const workItemId = insertTestWorkItem();
      const vendorId = insertTestVendor('Persistent Vendor');

      workItemVendorService.linkVendorToWorkItem(db, workItemId, vendorId);

      const listed = workItemVendorService.listWorkItemVendors(db, workItemId);
      expect(listed).toHaveLength(1);
      expect(listed[0].id).toBe(vendorId);
    });

    it('allows linking the same vendor to multiple work items', () => {
      const workItemId1 = insertTestWorkItem('Work Item 1');
      const workItemId2 = insertTestWorkItem('Work Item 2');
      const vendorId = insertTestVendor('Shared Vendor');

      workItemVendorService.linkVendorToWorkItem(db, workItemId1, vendorId);
      workItemVendorService.linkVendorToWorkItem(db, workItemId2, vendorId);

      const result1 = workItemVendorService.listWorkItemVendors(db, workItemId1);
      const result2 = workItemVendorService.listWorkItemVendors(db, workItemId2);

      expect(result1).toHaveLength(1);
      expect(result2).toHaveLength(1);
    });

    it('allows linking multiple vendors to the same work item', () => {
      const workItemId = insertTestWorkItem();
      const vendorId1 = insertTestVendor('Vendor X');
      const vendorId2 = insertTestVendor('Vendor Y');

      workItemVendorService.linkVendorToWorkItem(db, workItemId, vendorId1);
      workItemVendorService.linkVendorToWorkItem(db, workItemId, vendorId2);

      const result = workItemVendorService.listWorkItemVendors(db, workItemId);
      expect(result).toHaveLength(2);
    });

    it('returns vendor with populated createdBy when createdBy user exists', () => {
      const workItemId = insertTestWorkItem();
      const vendorId = insertTestVendor('Vendor With Creator', 'user-001');

      const result = workItemVendorService.linkVendorToWorkItem(db, workItemId, vendorId);

      expect(result.createdBy).not.toBeNull();
      expect(result.createdBy?.id).toBe('user-001');
      expect(result.createdBy?.displayName).toBe('Test User');
    });

    it('throws NotFoundError when work item does not exist', () => {
      const vendorId = insertTestVendor('Some Vendor');

      expect(() => {
        workItemVendorService.linkVendorToWorkItem(db, 'non-existent-wi', vendorId);
      }).toThrow(NotFoundError);

      expect(() => {
        workItemVendorService.linkVendorToWorkItem(db, 'non-existent-wi', vendorId);
      }).toThrow('Work item not found');
    });

    it('throws NotFoundError when vendor does not exist', () => {
      const workItemId = insertTestWorkItem();

      expect(() => {
        workItemVendorService.linkVendorToWorkItem(db, workItemId, 'non-existent-vendor');
      }).toThrow(NotFoundError);

      expect(() => {
        workItemVendorService.linkVendorToWorkItem(db, workItemId, 'non-existent-vendor');
      }).toThrow('Vendor not found');
    });

    it('throws ConflictError when vendor is already linked to the work item', () => {
      const workItemId = insertTestWorkItem();
      const vendorId = insertTestVendor('Duplicate Vendor');

      workItemVendorService.linkVendorToWorkItem(db, workItemId, vendorId);

      expect(() => {
        workItemVendorService.linkVendorToWorkItem(db, workItemId, vendorId);
      }).toThrow(ConflictError);

      expect(() => {
        workItemVendorService.linkVendorToWorkItem(db, workItemId, vendorId);
      }).toThrow('Vendor is already linked to this work item');
    });
  });

  // ─── unlinkVendorFromWorkItem() ────────────────────────────────────────────

  describe('unlinkVendorFromWorkItem()', () => {
    it('removes the vendor link from a work item', () => {
      const workItemId = insertTestWorkItem();
      const vendorId = insertTestVendor('Linked Vendor');

      workItemVendorService.linkVendorToWorkItem(db, workItemId, vendorId);
      workItemVendorService.unlinkVendorFromWorkItem(db, workItemId, vendorId);

      const result = workItemVendorService.listWorkItemVendors(db, workItemId);
      expect(result).toEqual([]);
    });

    it('only removes the specific vendor link, not others', () => {
      const workItemId = insertTestWorkItem();
      const vendorId1 = insertTestVendor('Vendor To Remove');
      const vendorId2 = insertTestVendor('Vendor To Keep');

      workItemVendorService.linkVendorToWorkItem(db, workItemId, vendorId1);
      workItemVendorService.linkVendorToWorkItem(db, workItemId, vendorId2);

      workItemVendorService.unlinkVendorFromWorkItem(db, workItemId, vendorId1);

      const result = workItemVendorService.listWorkItemVendors(db, workItemId);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(vendorId2);
    });

    it('throws NotFoundError when work item does not exist', () => {
      const vendorId = insertTestVendor('Some Vendor');

      expect(() => {
        workItemVendorService.unlinkVendorFromWorkItem(db, 'non-existent-wi', vendorId);
      }).toThrow(NotFoundError);

      expect(() => {
        workItemVendorService.unlinkVendorFromWorkItem(db, 'non-existent-wi', vendorId);
      }).toThrow('Work item not found');
    });

    it('throws NotFoundError when vendor is not linked to the work item', () => {
      const workItemId = insertTestWorkItem();
      const vendorId = insertTestVendor('Unlinked Vendor');

      expect(() => {
        workItemVendorService.unlinkVendorFromWorkItem(db, workItemId, vendorId);
      }).toThrow(NotFoundError);

      expect(() => {
        workItemVendorService.unlinkVendorFromWorkItem(db, workItemId, vendorId);
      }).toThrow('Vendor is not linked to this work item');
    });

    it('throws NotFoundError when trying to unlink a vendor from a different work item', () => {
      const workItemId1 = insertTestWorkItem('Work Item 1');
      const workItemId2 = insertTestWorkItem('Work Item 2');
      const vendorId = insertTestVendor('WI1 Vendor');

      workItemVendorService.linkVendorToWorkItem(db, workItemId1, vendorId);

      // Try to unlink from workItemId2 (where it's not linked)
      expect(() => {
        workItemVendorService.unlinkVendorFromWorkItem(db, workItemId2, vendorId);
      }).toThrow(NotFoundError);
    });

    it('throws NotFoundError for a non-existent vendorId on an existing work item', () => {
      const workItemId = insertTestWorkItem();

      expect(() => {
        workItemVendorService.unlinkVendorFromWorkItem(db, workItemId, 'non-existent-vendor');
      }).toThrow(NotFoundError);

      expect(() => {
        workItemVendorService.unlinkVendorFromWorkItem(db, workItemId, 'non-existent-vendor');
      }).toThrow('Vendor is not linked to this work item');
    });
  });
});
