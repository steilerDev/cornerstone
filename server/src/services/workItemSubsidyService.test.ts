import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import * as workItemSubsidyService from './workItemSubsidyService.js';
import { NotFoundError, ConflictError } from '../errors/AppError.js';

describe('workItemSubsidyService', () => {
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

  function insertTestSubsidyProgram(
    name = 'Test Subsidy',
    options: {
      reductionType?: 'percentage' | 'fixed';
      reductionValue?: number;
      applicationStatus?: 'eligible' | 'applied' | 'approved' | 'received' | 'rejected';
      createdBy?: string | null;
    } = {},
  ) {
    const id = `subsidy-${++idCounter}`;
    const now = new Date(Date.now() + idCounter).toISOString();
    db.insert(schema.subsidyPrograms)
      .values({
        id,
        name,
        description: null,
        eligibility: null,
        reductionType: options.reductionType ?? 'percentage',
        reductionValue: options.reductionValue ?? 10,
        applicationStatus: options.applicationStatus ?? 'eligible',
        applicationDeadline: null,
        notes: null,
        createdBy: options.createdBy ?? null,
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

  // ─── listWorkItemSubsidies() ───────────────────────────────────────────────

  describe('listWorkItemSubsidies()', () => {
    it('returns empty array when no subsidy programs are linked', () => {
      const workItemId = insertTestWorkItem();

      const result = workItemSubsidyService.listWorkItemSubsidies(db, workItemId);

      expect(result).toEqual([]);
    });

    it('returns linked subsidy program with all fields', () => {
      const workItemId = insertTestWorkItem('Foundation Work');
      const subsidyId = insertTestSubsidyProgram('Green Energy Rebate', {
        reductionType: 'percentage',
        reductionValue: 15,
        applicationStatus: 'eligible',
        createdBy: 'user-001',
      });

      db.insert(schema.workItemSubsidies).values({ workItemId, subsidyProgramId: subsidyId }).run();

      const result = workItemSubsidyService.listWorkItemSubsidies(db, workItemId);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(subsidyId);
      expect(result[0].name).toBe('Green Energy Rebate');
      expect(result[0].reductionType).toBe('percentage');
      expect(result[0].reductionValue).toBe(15);
      expect(result[0].applicationStatus).toBe('eligible');
      expect(result[0].createdBy?.id).toBe('user-001');
    });

    it('returns multiple linked subsidy programs', () => {
      const workItemId = insertTestWorkItem();
      const subsidyId1 = insertTestSubsidyProgram('Subsidy A');
      const subsidyId2 = insertTestSubsidyProgram('Subsidy B');

      db.insert(schema.workItemSubsidies)
        .values({ workItemId, subsidyProgramId: subsidyId1 })
        .run();
      db.insert(schema.workItemSubsidies)
        .values({ workItemId, subsidyProgramId: subsidyId2 })
        .run();

      const result = workItemSubsidyService.listWorkItemSubsidies(db, workItemId);

      expect(result).toHaveLength(2);
      const names = result.map((s) => s.name);
      expect(names).toContain('Subsidy A');
      expect(names).toContain('Subsidy B');
    });

    it('does not return subsidies linked to a different work item', () => {
      const workItemId1 = insertTestWorkItem('Work Item 1');
      const workItemId2 = insertTestWorkItem('Work Item 2');
      const subsidyId = insertTestSubsidyProgram('Exclusive Subsidy');

      db.insert(schema.workItemSubsidies)
        .values({ workItemId: workItemId2, subsidyProgramId: subsidyId })
        .run();

      const result = workItemSubsidyService.listWorkItemSubsidies(db, workItemId1);

      expect(result).toEqual([]);
    });

    it('returns subsidy with applicableCategories field', () => {
      const workItemId = insertTestWorkItem();
      const subsidyId = insertTestSubsidyProgram('Category Subsidy');

      db.insert(schema.workItemSubsidies).values({ workItemId, subsidyProgramId: subsidyId }).run();

      const result = workItemSubsidyService.listWorkItemSubsidies(db, workItemId);

      expect(result[0].applicableCategories).toBeDefined();
      expect(Array.isArray(result[0].applicableCategories)).toBe(true);
    });

    it('returns subsidy with null createdBy when createdBy is null', () => {
      const workItemId = insertTestWorkItem();
      const subsidyId = insertTestSubsidyProgram('Anonymous Subsidy', { createdBy: null });

      db.insert(schema.workItemSubsidies).values({ workItemId, subsidyProgramId: subsidyId }).run();

      const result = workItemSubsidyService.listWorkItemSubsidies(db, workItemId);

      expect(result).toHaveLength(1);
      expect(result[0].createdBy).toBeNull();
    });

    it('throws NotFoundError when work item does not exist', () => {
      expect(() => {
        workItemSubsidyService.listWorkItemSubsidies(db, 'non-existent-wi');
      }).toThrow(NotFoundError);

      expect(() => {
        workItemSubsidyService.listWorkItemSubsidies(db, 'non-existent-wi');
      }).toThrow('Work item not found');
    });
  });

  // ─── linkSubsidyToWorkItem() ───────────────────────────────────────────────

  describe('linkSubsidyToWorkItem()', () => {
    it('links a subsidy program to a work item and returns the program', () => {
      const workItemId = insertTestWorkItem();
      const subsidyId = insertTestSubsidyProgram('Solar Panel Rebate', {
        reductionType: 'fixed',
        reductionValue: 5000,
      });

      const result = workItemSubsidyService.linkSubsidyToWorkItem(db, workItemId, subsidyId);

      expect(result.id).toBe(subsidyId);
      expect(result.name).toBe('Solar Panel Rebate');
      expect(result.reductionType).toBe('fixed');
      expect(result.reductionValue).toBe(5000);
    });

    it('persists the link (verify via listWorkItemSubsidies)', () => {
      const workItemId = insertTestWorkItem();
      const subsidyId = insertTestSubsidyProgram('Persistent Subsidy');

      workItemSubsidyService.linkSubsidyToWorkItem(db, workItemId, subsidyId);

      const listed = workItemSubsidyService.listWorkItemSubsidies(db, workItemId);
      expect(listed).toHaveLength(1);
      expect(listed[0].id).toBe(subsidyId);
    });

    it('allows linking the same subsidy to multiple work items', () => {
      const workItemId1 = insertTestWorkItem('Work Item 1');
      const workItemId2 = insertTestWorkItem('Work Item 2');
      const subsidyId = insertTestSubsidyProgram('Shared Subsidy');

      workItemSubsidyService.linkSubsidyToWorkItem(db, workItemId1, subsidyId);
      workItemSubsidyService.linkSubsidyToWorkItem(db, workItemId2, subsidyId);

      const result1 = workItemSubsidyService.listWorkItemSubsidies(db, workItemId1);
      const result2 = workItemSubsidyService.listWorkItemSubsidies(db, workItemId2);

      expect(result1).toHaveLength(1);
      expect(result2).toHaveLength(1);
    });

    it('allows linking multiple subsidies to the same work item', () => {
      const workItemId = insertTestWorkItem();
      const subsidyId1 = insertTestSubsidyProgram('Subsidy X');
      const subsidyId2 = insertTestSubsidyProgram('Subsidy Y');

      workItemSubsidyService.linkSubsidyToWorkItem(db, workItemId, subsidyId1);
      workItemSubsidyService.linkSubsidyToWorkItem(db, workItemId, subsidyId2);

      const result = workItemSubsidyService.listWorkItemSubsidies(db, workItemId);
      expect(result).toHaveLength(2);
    });

    it('returns subsidy with populated applicableCategories', () => {
      // First get one of the seeded budget categories
      const categories = db.select().from(schema.budgetCategories).limit(1).all();
      if (categories.length === 0) {
        // Skip if no categories are seeded
        return;
      }

      const workItemId = insertTestWorkItem();
      const subsidyId = insertTestSubsidyProgram('With Categories');

      // Link the category to the subsidy program
      db.insert(schema.subsidyProgramCategories)
        .values({ subsidyProgramId: subsidyId, budgetCategoryId: categories[0].id })
        .run();

      db.insert(schema.workItemSubsidies).values({ workItemId, subsidyProgramId: subsidyId }).run();

      const result = workItemSubsidyService.listWorkItemSubsidies(db, workItemId);
      expect(result[0].applicableCategories).toHaveLength(1);
      expect(result[0].applicableCategories[0].id).toBe(categories[0].id);
    });

    it('throws NotFoundError when work item does not exist', () => {
      const subsidyId = insertTestSubsidyProgram('Some Subsidy');

      expect(() => {
        workItemSubsidyService.linkSubsidyToWorkItem(db, 'non-existent-wi', subsidyId);
      }).toThrow(NotFoundError);

      expect(() => {
        workItemSubsidyService.linkSubsidyToWorkItem(db, 'non-existent-wi', subsidyId);
      }).toThrow('Work item not found');
    });

    it('throws NotFoundError when subsidy program does not exist', () => {
      const workItemId = insertTestWorkItem();

      expect(() => {
        workItemSubsidyService.linkSubsidyToWorkItem(db, workItemId, 'non-existent-subsidy');
      }).toThrow(NotFoundError);

      expect(() => {
        workItemSubsidyService.linkSubsidyToWorkItem(db, workItemId, 'non-existent-subsidy');
      }).toThrow('Subsidy program not found');
    });

    it('throws ConflictError when subsidy is already linked to the work item', () => {
      const workItemId = insertTestWorkItem();
      const subsidyId = insertTestSubsidyProgram('Duplicate Subsidy');

      workItemSubsidyService.linkSubsidyToWorkItem(db, workItemId, subsidyId);

      expect(() => {
        workItemSubsidyService.linkSubsidyToWorkItem(db, workItemId, subsidyId);
      }).toThrow(ConflictError);

      expect(() => {
        workItemSubsidyService.linkSubsidyToWorkItem(db, workItemId, subsidyId);
      }).toThrow('Subsidy program is already linked to this work item');
    });
  });

  // ─── unlinkSubsidyFromWorkItem() ───────────────────────────────────────────

  describe('unlinkSubsidyFromWorkItem()', () => {
    it('removes the subsidy link from a work item', () => {
      const workItemId = insertTestWorkItem();
      const subsidyId = insertTestSubsidyProgram('Linked Subsidy');

      workItemSubsidyService.linkSubsidyToWorkItem(db, workItemId, subsidyId);
      workItemSubsidyService.unlinkSubsidyFromWorkItem(db, workItemId, subsidyId);

      const result = workItemSubsidyService.listWorkItemSubsidies(db, workItemId);
      expect(result).toEqual([]);
    });

    it('only removes the specific subsidy link, not others', () => {
      const workItemId = insertTestWorkItem();
      const subsidyId1 = insertTestSubsidyProgram('Subsidy To Remove');
      const subsidyId2 = insertTestSubsidyProgram('Subsidy To Keep');

      workItemSubsidyService.linkSubsidyToWorkItem(db, workItemId, subsidyId1);
      workItemSubsidyService.linkSubsidyToWorkItem(db, workItemId, subsidyId2);

      workItemSubsidyService.unlinkSubsidyFromWorkItem(db, workItemId, subsidyId1);

      const result = workItemSubsidyService.listWorkItemSubsidies(db, workItemId);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(subsidyId2);
    });

    it('throws NotFoundError when work item does not exist', () => {
      const subsidyId = insertTestSubsidyProgram('Some Subsidy');

      expect(() => {
        workItemSubsidyService.unlinkSubsidyFromWorkItem(db, 'non-existent-wi', subsidyId);
      }).toThrow(NotFoundError);

      expect(() => {
        workItemSubsidyService.unlinkSubsidyFromWorkItem(db, 'non-existent-wi', subsidyId);
      }).toThrow('Work item not found');
    });

    it('throws NotFoundError when subsidy is not linked to the work item', () => {
      const workItemId = insertTestWorkItem();
      const subsidyId = insertTestSubsidyProgram('Unlinked Subsidy');

      expect(() => {
        workItemSubsidyService.unlinkSubsidyFromWorkItem(db, workItemId, subsidyId);
      }).toThrow(NotFoundError);

      expect(() => {
        workItemSubsidyService.unlinkSubsidyFromWorkItem(db, workItemId, subsidyId);
      }).toThrow('Subsidy program is not linked to this work item');
    });

    it('throws NotFoundError when trying to unlink a subsidy from a different work item', () => {
      const workItemId1 = insertTestWorkItem('Work Item 1');
      const workItemId2 = insertTestWorkItem('Work Item 2');
      const subsidyId = insertTestSubsidyProgram('WI1 Subsidy');

      workItemSubsidyService.linkSubsidyToWorkItem(db, workItemId1, subsidyId);

      // Try to unlink from workItemId2 (where it's not linked)
      expect(() => {
        workItemSubsidyService.unlinkSubsidyFromWorkItem(db, workItemId2, subsidyId);
      }).toThrow(NotFoundError);
    });

    it('throws NotFoundError for a non-existent subsidyProgramId on an existing work item', () => {
      const workItemId = insertTestWorkItem();

      expect(() => {
        workItemSubsidyService.unlinkSubsidyFromWorkItem(db, workItemId, 'non-existent-subsidy');
      }).toThrow(NotFoundError);

      expect(() => {
        workItemSubsidyService.unlinkSubsidyFromWorkItem(db, workItemId, 'non-existent-subsidy');
      }).toThrow('Subsidy program is not linked to this work item');
    });
  });
});
