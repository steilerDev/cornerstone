import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import * as householdItemSubsidyService from './householdItemSubsidyService.js';
import { NotFoundError, ConflictError } from '../errors/AppError.js';

describe('householdItemSubsidyService', () => {
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

  function insertTestHouseholdItem(name = 'Test Household Item', userId = 'user-001') {
    const id = `hi-${++idCounter}`;
    const now = new Date(Date.now() + idCounter).toISOString();
    // hic-furniture is seeded by migration 0016
    db.insert(schema.householdItems)
      .values({
        id,
        name,
        categoryId: 'hic-furniture',
        status: 'planned',
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

  // ─── listHouseholdItemSubsidies() ─────────────────────────────────────────

  describe('listHouseholdItemSubsidies()', () => {
    it('returns empty array when no subsidy programs are linked', () => {
      const householdItemId = insertTestHouseholdItem();

      const result = householdItemSubsidyService.listHouseholdItemSubsidies(db, householdItemId);

      expect(result).toEqual([]);
    });

    it('returns linked subsidy program with all fields', () => {
      const householdItemId = insertTestHouseholdItem('Living Room Sofa');
      const subsidyId = insertTestSubsidyProgram('Appliance Energy Rebate', {
        reductionType: 'percentage',
        reductionValue: 15,
        applicationStatus: 'eligible',
        createdBy: 'user-001',
      });

      db.insert(schema.householdItemSubsidies)
        .values({ householdItemId, subsidyProgramId: subsidyId })
        .run();

      const result = householdItemSubsidyService.listHouseholdItemSubsidies(db, householdItemId);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(subsidyId);
      expect(result[0].name).toBe('Appliance Energy Rebate');
      expect(result[0].reductionType).toBe('percentage');
      expect(result[0].reductionValue).toBe(15);
      expect(result[0].applicationStatus).toBe('eligible');
      expect(result[0].createdBy?.id).toBe('user-001');
    });

    it('returns multiple linked subsidy programs', () => {
      const householdItemId = insertTestHouseholdItem();
      const subsidyId1 = insertTestSubsidyProgram('Subsidy A');
      const subsidyId2 = insertTestSubsidyProgram('Subsidy B');

      db.insert(schema.householdItemSubsidies)
        .values({ householdItemId, subsidyProgramId: subsidyId1 })
        .run();
      db.insert(schema.householdItemSubsidies)
        .values({ householdItemId, subsidyProgramId: subsidyId2 })
        .run();

      const result = householdItemSubsidyService.listHouseholdItemSubsidies(db, householdItemId);

      expect(result).toHaveLength(2);
      const names = result.map((s) => s.name);
      expect(names).toContain('Subsidy A');
      expect(names).toContain('Subsidy B');
    });

    it('does not return subsidies linked to a different household item', () => {
      const hiId1 = insertTestHouseholdItem('Household Item 1');
      const hiId2 = insertTestHouseholdItem('Household Item 2');
      const subsidyId = insertTestSubsidyProgram('Exclusive Subsidy');

      db.insert(schema.householdItemSubsidies)
        .values({ householdItemId: hiId2, subsidyProgramId: subsidyId })
        .run();

      const result = householdItemSubsidyService.listHouseholdItemSubsidies(db, hiId1);

      expect(result).toEqual([]);
    });

    it('returns subsidy with applicableCategories field', () => {
      const householdItemId = insertTestHouseholdItem();
      const subsidyId = insertTestSubsidyProgram('Category Subsidy');

      db.insert(schema.householdItemSubsidies)
        .values({ householdItemId, subsidyProgramId: subsidyId })
        .run();

      const result = householdItemSubsidyService.listHouseholdItemSubsidies(db, householdItemId);

      expect(result[0].applicableCategories).toBeDefined();
      expect(Array.isArray(result[0].applicableCategories)).toBe(true);
    });

    it('returns subsidy with null createdBy when createdBy is null', () => {
      const householdItemId = insertTestHouseholdItem();
      const subsidyId = insertTestSubsidyProgram('Anonymous Subsidy', { createdBy: null });

      db.insert(schema.householdItemSubsidies)
        .values({ householdItemId, subsidyProgramId: subsidyId })
        .run();

      const result = householdItemSubsidyService.listHouseholdItemSubsidies(db, householdItemId);

      expect(result).toHaveLength(1);
      expect(result[0].createdBy).toBeNull();
    });

    it('throws NotFoundError when household item does not exist', () => {
      expect(() => {
        householdItemSubsidyService.listHouseholdItemSubsidies(db, 'non-existent-hi');
      }).toThrow(NotFoundError);

      expect(() => {
        householdItemSubsidyService.listHouseholdItemSubsidies(db, 'non-existent-hi');
      }).toThrow('Household item not found');
    });
  });

  // ─── linkSubsidyToHouseholdItem() ─────────────────────────────────────────

  describe('linkSubsidyToHouseholdItem()', () => {
    it('links a subsidy program to a household item and returns the program', () => {
      const householdItemId = insertTestHouseholdItem();
      const subsidyId = insertTestSubsidyProgram('Energy Efficiency Rebate', {
        reductionType: 'fixed',
        reductionValue: 3000,
      });

      const result = householdItemSubsidyService.linkSubsidyToHouseholdItem(
        db,
        householdItemId,
        subsidyId,
      );

      expect(result.id).toBe(subsidyId);
      expect(result.name).toBe('Energy Efficiency Rebate');
      expect(result.reductionType).toBe('fixed');
      expect(result.reductionValue).toBe(3000);
    });

    it('persists the link (verify via listHouseholdItemSubsidies)', () => {
      const householdItemId = insertTestHouseholdItem();
      const subsidyId = insertTestSubsidyProgram('Persistent Subsidy');

      householdItemSubsidyService.linkSubsidyToHouseholdItem(db, householdItemId, subsidyId);

      const listed = householdItemSubsidyService.listHouseholdItemSubsidies(db, householdItemId);
      expect(listed).toHaveLength(1);
      expect(listed[0].id).toBe(subsidyId);
    });

    it('allows linking the same subsidy to multiple household items', () => {
      const hiId1 = insertTestHouseholdItem('Household Item 1');
      const hiId2 = insertTestHouseholdItem('Household Item 2');
      const subsidyId = insertTestSubsidyProgram('Shared Subsidy');

      householdItemSubsidyService.linkSubsidyToHouseholdItem(db, hiId1, subsidyId);
      householdItemSubsidyService.linkSubsidyToHouseholdItem(db, hiId2, subsidyId);

      const result1 = householdItemSubsidyService.listHouseholdItemSubsidies(db, hiId1);
      const result2 = householdItemSubsidyService.listHouseholdItemSubsidies(db, hiId2);

      expect(result1).toHaveLength(1);
      expect(result2).toHaveLength(1);
    });

    it('allows linking multiple subsidies to the same household item', () => {
      const householdItemId = insertTestHouseholdItem();
      const subsidyId1 = insertTestSubsidyProgram('Subsidy X');
      const subsidyId2 = insertTestSubsidyProgram('Subsidy Y');

      householdItemSubsidyService.linkSubsidyToHouseholdItem(db, householdItemId, subsidyId1);
      householdItemSubsidyService.linkSubsidyToHouseholdItem(db, householdItemId, subsidyId2);

      const result = householdItemSubsidyService.listHouseholdItemSubsidies(db, householdItemId);
      expect(result).toHaveLength(2);
    });

    it('returns subsidy with populated applicableCategories', () => {
      const categories = db.select().from(schema.budgetCategories).limit(1).all();
      if (categories.length === 0) return;

      const householdItemId = insertTestHouseholdItem();
      const subsidyId = insertTestSubsidyProgram('With Categories');

      db.insert(schema.subsidyProgramCategories)
        .values({ subsidyProgramId: subsidyId, budgetCategoryId: categories[0].id })
        .run();
      db.insert(schema.householdItemSubsidies)
        .values({ householdItemId, subsidyProgramId: subsidyId })
        .run();

      const result = householdItemSubsidyService.listHouseholdItemSubsidies(db, householdItemId);
      expect(result[0].applicableCategories).toHaveLength(1);
      expect(result[0].applicableCategories[0].id).toBe(categories[0].id);
    });

    it('throws NotFoundError when household item does not exist', () => {
      const subsidyId = insertTestSubsidyProgram('Some Subsidy');

      expect(() => {
        householdItemSubsidyService.linkSubsidyToHouseholdItem(db, 'non-existent-hi', subsidyId);
      }).toThrow(NotFoundError);

      expect(() => {
        householdItemSubsidyService.linkSubsidyToHouseholdItem(db, 'non-existent-hi', subsidyId);
      }).toThrow('Household item not found');
    });

    it('throws NotFoundError when subsidy program does not exist', () => {
      const householdItemId = insertTestHouseholdItem();

      expect(() => {
        householdItemSubsidyService.linkSubsidyToHouseholdItem(
          db,
          householdItemId,
          'non-existent-subsidy',
        );
      }).toThrow(NotFoundError);

      expect(() => {
        householdItemSubsidyService.linkSubsidyToHouseholdItem(
          db,
          householdItemId,
          'non-existent-subsidy',
        );
      }).toThrow('Subsidy program not found');
    });

    it('throws ConflictError when subsidy is already linked to the household item', () => {
      const householdItemId = insertTestHouseholdItem();
      const subsidyId = insertTestSubsidyProgram('Duplicate Subsidy');

      householdItemSubsidyService.linkSubsidyToHouseholdItem(db, householdItemId, subsidyId);

      expect(() => {
        householdItemSubsidyService.linkSubsidyToHouseholdItem(db, householdItemId, subsidyId);
      }).toThrow(ConflictError);

      expect(() => {
        householdItemSubsidyService.linkSubsidyToHouseholdItem(db, householdItemId, subsidyId);
      }).toThrow('Subsidy program is already linked to this household item');
    });
  });

  // ─── unlinkSubsidyFromHouseholdItem() ──────────────────────────────────────

  describe('unlinkSubsidyFromHouseholdItem()', () => {
    it('removes the subsidy link from a household item', () => {
      const householdItemId = insertTestHouseholdItem();
      const subsidyId = insertTestSubsidyProgram('Linked Subsidy');

      householdItemSubsidyService.linkSubsidyToHouseholdItem(db, householdItemId, subsidyId);
      householdItemSubsidyService.unlinkSubsidyFromHouseholdItem(db, householdItemId, subsidyId);

      const result = householdItemSubsidyService.listHouseholdItemSubsidies(db, householdItemId);
      expect(result).toEqual([]);
    });

    it('only removes the specific subsidy link, not others', () => {
      const householdItemId = insertTestHouseholdItem();
      const subsidyId1 = insertTestSubsidyProgram('Subsidy To Remove');
      const subsidyId2 = insertTestSubsidyProgram('Subsidy To Keep');

      householdItemSubsidyService.linkSubsidyToHouseholdItem(db, householdItemId, subsidyId1);
      householdItemSubsidyService.linkSubsidyToHouseholdItem(db, householdItemId, subsidyId2);

      householdItemSubsidyService.unlinkSubsidyFromHouseholdItem(db, householdItemId, subsidyId1);

      const result = householdItemSubsidyService.listHouseholdItemSubsidies(db, householdItemId);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(subsidyId2);
    });

    it('throws NotFoundError when household item does not exist', () => {
      const subsidyId = insertTestSubsidyProgram('Some Subsidy');

      expect(() => {
        householdItemSubsidyService.unlinkSubsidyFromHouseholdItem(
          db,
          'non-existent-hi',
          subsidyId,
        );
      }).toThrow(NotFoundError);

      expect(() => {
        householdItemSubsidyService.unlinkSubsidyFromHouseholdItem(
          db,
          'non-existent-hi',
          subsidyId,
        );
      }).toThrow('Household item not found');
    });

    it('throws NotFoundError when subsidy is not linked to the household item', () => {
      const householdItemId = insertTestHouseholdItem();
      const subsidyId = insertTestSubsidyProgram('Unlinked Subsidy');

      expect(() => {
        householdItemSubsidyService.unlinkSubsidyFromHouseholdItem(db, householdItemId, subsidyId);
      }).toThrow(NotFoundError);

      expect(() => {
        householdItemSubsidyService.unlinkSubsidyFromHouseholdItem(db, householdItemId, subsidyId);
      }).toThrow('Subsidy program is not linked to this household item');
    });

    it('throws NotFoundError when trying to unlink from a different household item', () => {
      const hiId1 = insertTestHouseholdItem('HI 1');
      const hiId2 = insertTestHouseholdItem('HI 2');
      const subsidyId = insertTestSubsidyProgram('HI1 Subsidy');

      householdItemSubsidyService.linkSubsidyToHouseholdItem(db, hiId1, subsidyId);

      expect(() => {
        householdItemSubsidyService.unlinkSubsidyFromHouseholdItem(db, hiId2, subsidyId);
      }).toThrow(NotFoundError);
    });

    it('throws NotFoundError for a non-existent subsidyProgramId on an existing household item', () => {
      const householdItemId = insertTestHouseholdItem();

      expect(() => {
        householdItemSubsidyService.unlinkSubsidyFromHouseholdItem(
          db,
          householdItemId,
          'non-existent-subsidy',
        );
      }).toThrow(NotFoundError);

      expect(() => {
        householdItemSubsidyService.unlinkSubsidyFromHouseholdItem(
          db,
          householdItemId,
          'non-existent-subsidy',
        );
      }).toThrow('Subsidy program is not linked to this household item');
    });
  });
});
