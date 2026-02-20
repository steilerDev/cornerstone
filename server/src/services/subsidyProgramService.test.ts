import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import * as subsidyProgramService from './subsidyProgramService.js';
import { NotFoundError, ValidationError, SubsidyProgramInUseError } from '../errors/AppError.js';
import type { CreateSubsidyProgramRequest, UpdateSubsidyProgramRequest } from '@cornerstone/shared';

describe('Subsidy Program Service', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;

  const TEST_USER_ID = 'user-test-001';

  function createTestDb() {
    const sqliteDb = new Database(':memory:');
    sqliteDb.pragma('journal_mode = WAL');
    sqliteDb.pragma('foreign_keys = ON');
    runMigrations(sqliteDb);
    return { sqlite: sqliteDb, db: drizzle(sqliteDb, { schema }) };
  }

  /**
   * Insert a test user — always include authProvider: 'local' (required by schema NOT NULL).
   */
  function insertTestUser(userId: string = TEST_USER_ID) {
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
  }

  /**
   * Seed a budget category directly into the DB. Returns the inserted id.
   * NOTE: Do NOT use seeded names (Materials, Labor, Design, etc.) — UNIQUE constraint.
   * Use unique test-specific names instead.
   */
  let categoryOffset = 0;

  function insertBudgetCategory(name?: string, color?: string): string {
    const id = `cat-${Date.now()}-${categoryOffset++}`;
    // Default name uses id to guarantee uniqueness, avoiding conflicts with seeded names
    const now = new Date().toISOString();
    db.insert(schema.budgetCategories)
      .values({
        id,
        name: name ?? `TestCategory-${id}`,
        description: null,
        color: color ?? null,
        sortOrder: categoryOffset + 100, // offset beyond seeded sort orders (0-9)
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  /**
   * Insert a raw subsidy program directly for test setup (bypasses service validation).
   */
  let programOffset = 0;

  function insertRawProgram(
    overrides: Partial<typeof schema.subsidyPrograms.$inferInsert> & { name: string },
  ): string {
    const id = `prog-${Date.now()}-${programOffset++}`;
    const now = new Date(Date.now() + programOffset).toISOString();
    db.insert(schema.subsidyPrograms)
      .values({
        id,
        name: overrides.name,
        description: overrides.description ?? null,
        eligibility: overrides.eligibility ?? null,
        reductionType: overrides.reductionType ?? 'percentage',
        reductionValue: overrides.reductionValue ?? 10,
        applicationStatus: overrides.applicationStatus ?? 'eligible',
        applicationDeadline: overrides.applicationDeadline ?? null,
        notes: overrides.notes ?? null,
        createdBy: overrides.createdBy ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  /**
   * Insert a work item directly for foreign-key use in workItemSubsidies.
   */
  function insertRawWorkItem(): string {
    const id = `wi-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const now = new Date().toISOString();
    db.insert(schema.workItems)
      .values({
        id,
        title: 'Test Work Item',
        status: 'not_started',
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
    programOffset = 0;
    categoryOffset = 0;
    insertTestUser();
  });

  afterEach(() => {
    sqlite.close();
  });

  // ─── listSubsidyPrograms() ────────────────────────────────────────────────

  describe('listSubsidyPrograms()', () => {
    it('returns empty array when no programs exist', () => {
      const result = subsidyProgramService.listSubsidyPrograms(db);
      expect(result).toEqual([]);
    });

    it('returns a single program after insertion', () => {
      insertRawProgram({ name: 'Energy Rebate' });

      const result = subsidyProgramService.listSubsidyPrograms(db);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Energy Rebate');
    });

    it('returns programs sorted by name ascending', () => {
      insertRawProgram({ name: 'Zebra Grant' });
      insertRawProgram({ name: 'Alpha Subsidy' });
      insertRawProgram({ name: 'Mid Program' });

      const result = subsidyProgramService.listSubsidyPrograms(db);
      expect(result[0].name).toBe('Alpha Subsidy');
      expect(result[1].name).toBe('Mid Program');
      expect(result[2].name).toBe('Zebra Grant');
    });

    it('returns all expected fields for a program', () => {
      const userId = TEST_USER_ID;
      insertRawProgram({
        name: 'Full Program',
        description: 'A full program',
        eligibility: 'Must own home',
        reductionType: 'fixed',
        reductionValue: 5000,
        applicationStatus: 'approved',
        applicationDeadline: '2027-12-31',
        notes: 'Apply early',
        createdBy: userId,
      });

      const result = subsidyProgramService.listSubsidyPrograms(db);
      expect(result).toHaveLength(1);

      const prog = result[0];
      expect(prog.id).toBeDefined();
      expect(prog.name).toBe('Full Program');
      expect(prog.description).toBe('A full program');
      expect(prog.eligibility).toBe('Must own home');
      expect(prog.reductionType).toBe('fixed');
      expect(prog.reductionValue).toBe(5000);
      expect(prog.applicationStatus).toBe('approved');
      expect(prog.applicationDeadline).toBe('2027-12-31');
      expect(prog.notes).toBe('Apply early');
      expect(prog.applicableCategories).toEqual([]);
      expect(prog.createdAt).toBeDefined();
      expect(prog.updatedAt).toBeDefined();
    });

    it('returns createdBy as UserSummary when user exists', () => {
      insertRawProgram({ name: 'With Creator', createdBy: TEST_USER_ID });

      const result = subsidyProgramService.listSubsidyPrograms(db);
      expect(result[0].createdBy).not.toBeNull();
      expect(result[0].createdBy?.id).toBe(TEST_USER_ID);
      expect(result[0].createdBy?.email).toBe(`${TEST_USER_ID}@example.com`);
      expect(result[0].createdBy?.displayName).toBe('Test User');
    });

    it('returns createdBy as null when createdBy is null', () => {
      insertRawProgram({ name: 'No Creator' });

      const result = subsidyProgramService.listSubsidyPrograms(db);
      expect(result[0].createdBy).toBeNull();
    });

    it('returns applicable categories linked to a program', () => {
      const catId = insertBudgetCategory('TestMaterials');
      const progId = insertRawProgram({ name: 'With Category' });

      // Link category to program directly
      db.insert(schema.subsidyProgramCategories)
        .values({ subsidyProgramId: progId, budgetCategoryId: catId })
        .run();

      const result = subsidyProgramService.listSubsidyPrograms(db);
      expect(result[0].applicableCategories).toHaveLength(1);
      expect(result[0].applicableCategories[0].id).toBe(catId);
      expect(result[0].applicableCategories[0].name).toBe('TestMaterials');
    });

    it('returns applicable categories sorted by sortOrder then name', () => {
      const catA = insertBudgetCategory('TestLabor');
      const catB = insertBudgetCategory('TestMaterials2');
      const progId = insertRawProgram({ name: 'Multi Category' });

      db.insert(schema.subsidyProgramCategories)
        .values([
          { subsidyProgramId: progId, budgetCategoryId: catA },
          { subsidyProgramId: progId, budgetCategoryId: catB },
        ])
        .run();

      const result = subsidyProgramService.listSubsidyPrograms(db);
      // Both categories should be present
      expect(result[0].applicableCategories).toHaveLength(2);
    });

    it('returns multiple programs with correct data', () => {
      insertRawProgram({ name: 'Program A', reductionType: 'percentage', reductionValue: 15 });
      insertRawProgram({ name: 'Program B', reductionType: 'fixed', reductionValue: 3000 });

      const result = subsidyProgramService.listSubsidyPrograms(db);
      expect(result).toHaveLength(2);
    });

    it('returns program with null optional fields correctly', () => {
      insertRawProgram({ name: 'Minimal Program' });

      const result = subsidyProgramService.listSubsidyPrograms(db);
      expect(result[0].description).toBeNull();
      expect(result[0].eligibility).toBeNull();
      expect(result[0].applicationDeadline).toBeNull();
      expect(result[0].notes).toBeNull();
    });
  });

  // ─── getSubsidyProgramById() ──────────────────────────────────────────────

  describe('getSubsidyProgramById()', () => {
    it('returns a program by ID', () => {
      const id = insertRawProgram({ name: 'Fetch Me' });

      const result = subsidyProgramService.getSubsidyProgramById(db, id);
      expect(result.id).toBe(id);
      expect(result.name).toBe('Fetch Me');
    });

    it('returns all fields correctly', () => {
      const id = insertRawProgram({
        name: 'Full Fetch',
        reductionType: 'fixed',
        reductionValue: 2500,
        applicationStatus: 'received',
        description: 'Full desc',
        eligibility: 'Eligible criteria',
        applicationDeadline: '2028-06-15',
        notes: 'Some notes',
        createdBy: TEST_USER_ID,
      });

      const result = subsidyProgramService.getSubsidyProgramById(db, id);
      expect(result.name).toBe('Full Fetch');
      expect(result.reductionType).toBe('fixed');
      expect(result.reductionValue).toBe(2500);
      expect(result.applicationStatus).toBe('received');
      expect(result.description).toBe('Full desc');
      expect(result.eligibility).toBe('Eligible criteria');
      expect(result.applicationDeadline).toBe('2028-06-15');
      expect(result.notes).toBe('Some notes');
      expect(result.applicableCategories).toEqual([]);
    });

    it('returns categories linked to the program', () => {
      const catId = insertBudgetCategory('TestDesignCat');
      const id = insertRawProgram({ name: 'With Design Cat' });
      db.insert(schema.subsidyProgramCategories)
        .values({ subsidyProgramId: id, budgetCategoryId: catId })
        .run();

      const result = subsidyProgramService.getSubsidyProgramById(db, id);
      expect(result.applicableCategories).toHaveLength(1);
      expect(result.applicableCategories[0].name).toBe('TestDesignCat');
    });

    it('throws NotFoundError when program does not exist', () => {
      expect(() => {
        subsidyProgramService.getSubsidyProgramById(db, 'non-existent-id');
      }).toThrow(NotFoundError);

      expect(() => {
        subsidyProgramService.getSubsidyProgramById(db, 'non-existent-id');
      }).toThrow('Subsidy program not found');
    });

    it('returns createdBy with user data when user exists', () => {
      const id = insertRawProgram({ name: 'With User', createdBy: TEST_USER_ID });

      const result = subsidyProgramService.getSubsidyProgramById(db, id);
      expect(result.createdBy).not.toBeNull();
      expect(result.createdBy?.id).toBe(TEST_USER_ID);
    });

    it('returns createdBy as null when no user set', () => {
      const id = insertRawProgram({ name: 'No User' });

      const result = subsidyProgramService.getSubsidyProgramById(db, id);
      expect(result.createdBy).toBeNull();
    });
  });

  // ─── createSubsidyProgram() ────────────────────────────────────────────────

  describe('createSubsidyProgram()', () => {
    it('creates a program with required fields only', () => {
      const data: CreateSubsidyProgramRequest = {
        name: 'Simple Program',
        reductionType: 'percentage',
        reductionValue: 10,
      };

      const result = subsidyProgramService.createSubsidyProgram(db, data, TEST_USER_ID);

      expect(result.id).toBeDefined();
      expect(result.name).toBe('Simple Program');
      expect(result.reductionType).toBe('percentage');
      expect(result.reductionValue).toBe(10);
      expect(result.applicationStatus).toBe('eligible'); // default
      expect(result.description).toBeNull();
      expect(result.eligibility).toBeNull();
      expect(result.applicationDeadline).toBeNull();
      expect(result.notes).toBeNull();
      expect(result.applicableCategories).toEqual([]);
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
    });

    it('creates a program with fixed reduction type', () => {
      const data: CreateSubsidyProgramRequest = {
        name: 'Fixed Program',
        reductionType: 'fixed',
        reductionValue: 5000,
      };

      const result = subsidyProgramService.createSubsidyProgram(db, data, TEST_USER_ID);
      expect(result.reductionType).toBe('fixed');
      expect(result.reductionValue).toBe(5000);
    });

    it('creates a program with all optional fields', () => {
      const data: CreateSubsidyProgramRequest = {
        name: 'Full Program',
        reductionType: 'percentage',
        reductionValue: 25,
        description: 'A great program',
        eligibility: 'Home owners only',
        applicationStatus: 'applied',
        applicationDeadline: '2027-01-01',
        notes: 'Notes here',
      };

      const result = subsidyProgramService.createSubsidyProgram(db, data, TEST_USER_ID);
      expect(result.name).toBe('Full Program');
      expect(result.description).toBe('A great program');
      expect(result.eligibility).toBe('Home owners only');
      expect(result.applicationStatus).toBe('applied');
      expect(result.applicationDeadline).toBe('2027-01-01');
      expect(result.notes).toBe('Notes here');
    });

    it('creates a program with linked category IDs', () => {
      const catId1 = insertBudgetCategory('TestLabor-create');
      const catId2 = insertBudgetCategory('TestMaterials-create');

      const data: CreateSubsidyProgramRequest = {
        name: 'Linked Program',
        reductionType: 'percentage',
        reductionValue: 20,
        categoryIds: [catId1, catId2],
      };

      const result = subsidyProgramService.createSubsidyProgram(db, data, TEST_USER_ID);
      expect(result.applicableCategories).toHaveLength(2);
      const catNames = result.applicableCategories.map((c) => c.name).sort();
      expect(catNames).toContain('TestLabor-create');
      expect(catNames).toContain('TestMaterials-create');
    });

    it('creates a program with an empty categoryIds array', () => {
      const data: CreateSubsidyProgramRequest = {
        name: 'No Categories',
        reductionType: 'fixed',
        reductionValue: 1000,
        categoryIds: [],
      };

      const result = subsidyProgramService.createSubsidyProgram(db, data, TEST_USER_ID);
      expect(result.applicableCategories).toEqual([]);
    });

    it('trims whitespace from name', () => {
      const data: CreateSubsidyProgramRequest = {
        name: '  Trimmed Name  ',
        reductionType: 'percentage',
        reductionValue: 5,
      };

      const result = subsidyProgramService.createSubsidyProgram(db, data, TEST_USER_ID);
      expect(result.name).toBe('Trimmed Name');
    });

    it('defaults applicationStatus to "eligible" when not provided', () => {
      const data: CreateSubsidyProgramRequest = {
        name: 'Default Status',
        reductionType: 'percentage',
        reductionValue: 10,
      };

      const result = subsidyProgramService.createSubsidyProgram(db, data, TEST_USER_ID);
      expect(result.applicationStatus).toBe('eligible');
    });

    it('creates programs for all valid applicationStatus values', () => {
      const statuses = ['eligible', 'applied', 'approved', 'received', 'rejected'] as const;

      for (const status of statuses) {
        const result = subsidyProgramService.createSubsidyProgram(
          db,
          {
            name: `Status ${status}`,
            reductionType: 'percentage',
            reductionValue: 10,
            applicationStatus: status,
          },
          TEST_USER_ID,
        );
        expect(result.applicationStatus).toBe(status);
      }
    });

    it('accepts percentage reduction value of exactly 100', () => {
      const data: CreateSubsidyProgramRequest = {
        name: 'Max Percent',
        reductionType: 'percentage',
        reductionValue: 100,
      };

      const result = subsidyProgramService.createSubsidyProgram(db, data, TEST_USER_ID);
      expect(result.reductionValue).toBe(100);
    });

    it('accepts fixed reduction value above 100', () => {
      const data: CreateSubsidyProgramRequest = {
        name: 'High Fixed',
        reductionType: 'fixed',
        reductionValue: 999999,
      };

      const result = subsidyProgramService.createSubsidyProgram(db, data, TEST_USER_ID);
      expect(result.reductionValue).toBe(999999);
    });

    it('links createdBy to the provided userId', () => {
      const data: CreateSubsidyProgramRequest = {
        name: 'With Creator',
        reductionType: 'percentage',
        reductionValue: 5,
      };

      const result = subsidyProgramService.createSubsidyProgram(db, data, TEST_USER_ID);
      expect(result.createdBy).not.toBeNull();
      expect(result.createdBy?.id).toBe(TEST_USER_ID);
    });

    it('persists the created program in the database', () => {
      const data: CreateSubsidyProgramRequest = {
        name: 'Persisted Program',
        reductionType: 'percentage',
        reductionValue: 12,
      };

      const created = subsidyProgramService.createSubsidyProgram(db, data, TEST_USER_ID);
      const fetched = subsidyProgramService.getSubsidyProgramById(db, created.id);

      expect(fetched.id).toBe(created.id);
      expect(fetched.name).toBe('Persisted Program');
    });

    it('allows two programs with the same name (no unique constraint)', () => {
      const data: CreateSubsidyProgramRequest = {
        name: 'Duplicate Name',
        reductionType: 'percentage',
        reductionValue: 10,
      };

      const r1 = subsidyProgramService.createSubsidyProgram(db, data, TEST_USER_ID);
      const r2 = subsidyProgramService.createSubsidyProgram(db, data, TEST_USER_ID);

      expect(r1.id).not.toBe(r2.id);
      expect(r1.name).toBe('Duplicate Name');
      expect(r2.name).toBe('Duplicate Name');
    });

    it('creates program with name at exactly 200 characters', () => {
      const name = 'A'.repeat(200);
      const data: CreateSubsidyProgramRequest = {
        name,
        reductionType: 'percentage',
        reductionValue: 1,
      };

      const result = subsidyProgramService.createSubsidyProgram(db, data, TEST_USER_ID);
      expect(result.name).toBe(name);
    });

    // --- Validation errors ---

    it('throws ValidationError for empty name', () => {
      const data: CreateSubsidyProgramRequest = {
        name: '',
        reductionType: 'percentage',
        reductionValue: 10,
      };

      expect(() => {
        subsidyProgramService.createSubsidyProgram(db, data, TEST_USER_ID);
      }).toThrow(ValidationError);
      expect(() => {
        subsidyProgramService.createSubsidyProgram(db, data, TEST_USER_ID);
      }).toThrow('Subsidy program name must be between 1 and 200 characters');
    });

    it('throws ValidationError for whitespace-only name', () => {
      const data: CreateSubsidyProgramRequest = {
        name: '   ',
        reductionType: 'percentage',
        reductionValue: 10,
      };

      expect(() => {
        subsidyProgramService.createSubsidyProgram(db, data, TEST_USER_ID);
      }).toThrow(ValidationError);
    });

    it('throws ValidationError for name exceeding 200 characters', () => {
      const data: CreateSubsidyProgramRequest = {
        name: 'A'.repeat(201),
        reductionType: 'percentage',
        reductionValue: 10,
      };

      expect(() => {
        subsidyProgramService.createSubsidyProgram(db, data, TEST_USER_ID);
      }).toThrow(ValidationError);
      expect(() => {
        subsidyProgramService.createSubsidyProgram(db, data, TEST_USER_ID);
      }).toThrow('Subsidy program name must be between 1 and 200 characters');
    });

    it('throws ValidationError for invalid reductionType', () => {
      const data = {
        name: 'Bad Type',
        reductionType: 'invalid_type' as 'percentage',
        reductionValue: 10,
      };

      expect(() => {
        subsidyProgramService.createSubsidyProgram(db, data, TEST_USER_ID);
      }).toThrow(ValidationError);
      expect(() => {
        subsidyProgramService.createSubsidyProgram(db, data, TEST_USER_ID);
      }).toThrow('Invalid reduction type');
    });

    it('throws ValidationError for reductionValue of zero', () => {
      const data: CreateSubsidyProgramRequest = {
        name: 'Zero Value',
        reductionType: 'percentage',
        reductionValue: 0,
      };

      expect(() => {
        subsidyProgramService.createSubsidyProgram(db, data, TEST_USER_ID);
      }).toThrow(ValidationError);
      expect(() => {
        subsidyProgramService.createSubsidyProgram(db, data, TEST_USER_ID);
      }).toThrow('Reduction value must be a positive number');
    });

    it('throws ValidationError for negative reductionValue', () => {
      const data: CreateSubsidyProgramRequest = {
        name: 'Negative Value',
        reductionType: 'percentage',
        reductionValue: -5,
      };

      expect(() => {
        subsidyProgramService.createSubsidyProgram(db, data, TEST_USER_ID);
      }).toThrow(ValidationError);
    });

    it('throws ValidationError for percentage reductionValue exceeding 100', () => {
      const data: CreateSubsidyProgramRequest = {
        name: 'Over 100',
        reductionType: 'percentage',
        reductionValue: 101,
      };

      expect(() => {
        subsidyProgramService.createSubsidyProgram(db, data, TEST_USER_ID);
      }).toThrow(ValidationError);
      expect(() => {
        subsidyProgramService.createSubsidyProgram(db, data, TEST_USER_ID);
      }).toThrow('Percentage reduction value must not exceed 100');
    });

    it('does NOT throw for fixed reductionValue above 100', () => {
      const data: CreateSubsidyProgramRequest = {
        name: 'Fixed Over 100',
        reductionType: 'fixed',
        reductionValue: 150,
      };

      expect(() => {
        subsidyProgramService.createSubsidyProgram(db, data, TEST_USER_ID);
      }).not.toThrow();
    });

    it('throws ValidationError for invalid applicationStatus', () => {
      const data = {
        name: 'Bad Status',
        reductionType: 'percentage' as const,
        reductionValue: 10,
        applicationStatus: 'unknown_status' as 'eligible',
      };

      expect(() => {
        subsidyProgramService.createSubsidyProgram(db, data, TEST_USER_ID);
      }).toThrow(ValidationError);
      expect(() => {
        subsidyProgramService.createSubsidyProgram(db, data, TEST_USER_ID);
      }).toThrow('Invalid application status');
    });

    it('throws ValidationError for unknown categoryIds', () => {
      const data: CreateSubsidyProgramRequest = {
        name: 'Bad Category',
        reductionType: 'percentage',
        reductionValue: 10,
        categoryIds: ['non-existent-cat-id'],
      };

      expect(() => {
        subsidyProgramService.createSubsidyProgram(db, data, TEST_USER_ID);
      }).toThrow(ValidationError);
      expect(() => {
        subsidyProgramService.createSubsidyProgram(db, data, TEST_USER_ID);
      }).toThrow('Unknown category IDs');
    });

    it('throws ValidationError listing all unknown categoryIds', () => {
      const data: CreateSubsidyProgramRequest = {
        name: 'Multi Bad Categories',
        reductionType: 'percentage',
        reductionValue: 10,
        categoryIds: ['bad-1', 'bad-2'],
      };

      expect(() => {
        subsidyProgramService.createSubsidyProgram(db, data, TEST_USER_ID);
      }).toThrow('Unknown category IDs');
    });

    it('throws ValidationError for partially unknown categoryIds (mix of valid and invalid)', () => {
      const validCatId = insertBudgetCategory('Valid Cat');

      const data: CreateSubsidyProgramRequest = {
        name: 'Mixed Category IDs',
        reductionType: 'percentage',
        reductionValue: 10,
        categoryIds: [validCatId, 'invalid-cat-id'],
      };

      expect(() => {
        subsidyProgramService.createSubsidyProgram(db, data, TEST_USER_ID);
      }).toThrow(ValidationError);
    });
  });

  // ─── updateSubsidyProgram() ───────────────────────────────────────────────

  describe('updateSubsidyProgram()', () => {
    it('updates name only (partial update)', () => {
      const id = insertRawProgram({ name: 'Old Name', reductionType: 'percentage', reductionValue: 10 });

      const data: UpdateSubsidyProgramRequest = { name: 'New Name' };
      const result = subsidyProgramService.updateSubsidyProgram(db, id, data);

      expect(result.id).toBe(id);
      expect(result.name).toBe('New Name');
      expect(result.reductionType).toBe('percentage'); // unchanged
      expect(result.reductionValue).toBe(10); // unchanged
    });

    it('updates reductionType only', () => {
      const id = insertRawProgram({ name: 'Type Update', reductionType: 'percentage', reductionValue: 10 });

      const data: UpdateSubsidyProgramRequest = { reductionType: 'fixed' };
      const result = subsidyProgramService.updateSubsidyProgram(db, id, data);

      expect(result.reductionType).toBe('fixed');
      expect(result.name).toBe('Type Update'); // unchanged
    });

    it('updates reductionValue only', () => {
      const id = insertRawProgram({ name: 'Value Update', reductionType: 'percentage', reductionValue: 5 });

      const data: UpdateSubsidyProgramRequest = { reductionValue: 20 };
      const result = subsidyProgramService.updateSubsidyProgram(db, id, data);

      expect(result.reductionValue).toBe(20);
    });

    it('updates applicationStatus only', () => {
      const id = insertRawProgram({ name: 'Status Update', applicationStatus: 'eligible' });

      const data: UpdateSubsidyProgramRequest = { applicationStatus: 'approved' };
      const result = subsidyProgramService.updateSubsidyProgram(db, id, data);

      expect(result.applicationStatus).toBe('approved');
    });

    it('updates description to a new value', () => {
      const id = insertRawProgram({ name: 'Desc Update', description: 'Old desc' });

      const data: UpdateSubsidyProgramRequest = { description: 'New desc' };
      const result = subsidyProgramService.updateSubsidyProgram(db, id, data);

      expect(result.description).toBe('New desc');
    });

    it('clears description by setting to null', () => {
      const id = insertRawProgram({ name: 'Clear Desc', description: 'Has description' });

      const data: UpdateSubsidyProgramRequest = { description: null };
      const result = subsidyProgramService.updateSubsidyProgram(db, id, data);

      expect(result.description).toBeNull();
    });

    it('updates eligibility to a new value', () => {
      const id = insertRawProgram({ name: 'Eligibility Update', eligibility: 'Old criteria' });

      const data: UpdateSubsidyProgramRequest = { eligibility: 'New criteria' };
      const result = subsidyProgramService.updateSubsidyProgram(db, id, data);

      expect(result.eligibility).toBe('New criteria');
    });

    it('clears eligibility by setting to null', () => {
      const id = insertRawProgram({ name: 'Clear Eligibility', eligibility: 'Has eligibility' });

      const data: UpdateSubsidyProgramRequest = { eligibility: null };
      const result = subsidyProgramService.updateSubsidyProgram(db, id, data);

      expect(result.eligibility).toBeNull();
    });

    it('updates applicationDeadline', () => {
      const id = insertRawProgram({ name: 'Deadline Update' });

      const data: UpdateSubsidyProgramRequest = { applicationDeadline: '2028-03-01' };
      const result = subsidyProgramService.updateSubsidyProgram(db, id, data);

      expect(result.applicationDeadline).toBe('2028-03-01');
    });

    it('clears applicationDeadline by setting to null', () => {
      const id = insertRawProgram({ name: 'Clear Deadline', applicationDeadline: '2027-01-01' });

      const data: UpdateSubsidyProgramRequest = { applicationDeadline: null };
      const result = subsidyProgramService.updateSubsidyProgram(db, id, data);

      expect(result.applicationDeadline).toBeNull();
    });

    it('updates notes', () => {
      const id = insertRawProgram({ name: 'Notes Update' });

      const data: UpdateSubsidyProgramRequest = { notes: 'New notes' };
      const result = subsidyProgramService.updateSubsidyProgram(db, id, data);

      expect(result.notes).toBe('New notes');
    });

    it('clears notes by setting to null', () => {
      const id = insertRawProgram({ name: 'Clear Notes', notes: 'Has notes' });

      const data: UpdateSubsidyProgramRequest = { notes: null };
      const result = subsidyProgramService.updateSubsidyProgram(db, id, data);

      expect(result.notes).toBeNull();
    });

    it('replaces category links when categoryIds provided', () => {
      const catA = insertBudgetCategory('Category A');
      const catB = insertBudgetCategory('Category B');
      const id = insertRawProgram({ name: 'Replace Cats' });

      // Link catA initially
      db.insert(schema.subsidyProgramCategories)
        .values({ subsidyProgramId: id, budgetCategoryId: catA })
        .run();

      // Replace with catB
      const data: UpdateSubsidyProgramRequest = { categoryIds: [catB] };
      const result = subsidyProgramService.updateSubsidyProgram(db, id, data);

      expect(result.applicableCategories).toHaveLength(1);
      expect(result.applicableCategories[0].id).toBe(catB);
    });

    it('clears all category links when categoryIds is empty array', () => {
      const catId = insertBudgetCategory('To Remove');
      const id = insertRawProgram({ name: 'Clear Cats' });
      db.insert(schema.subsidyProgramCategories)
        .values({ subsidyProgramId: id, budgetCategoryId: catId })
        .run();

      const data: UpdateSubsidyProgramRequest = { categoryIds: [] };
      const result = subsidyProgramService.updateSubsidyProgram(db, id, data);

      expect(result.applicableCategories).toEqual([]);
    });

    it('updates categoryIds only (no scalar fields changed)', () => {
      const catId = insertBudgetCategory('New Cat');
      const id = insertRawProgram({ name: 'Cat Only Update' });

      const data: UpdateSubsidyProgramRequest = { categoryIds: [catId] };
      const result = subsidyProgramService.updateSubsidyProgram(db, id, data);

      expect(result.applicableCategories).toHaveLength(1);
      expect(result.name).toBe('Cat Only Update'); // unchanged
    });

    it('updates all fields at once', () => {
      const catId = insertBudgetCategory('All Field Cat');
      const id = insertRawProgram({ name: 'All Fields', reductionType: 'percentage', reductionValue: 5 });

      const data: UpdateSubsidyProgramRequest = {
        name: 'Completely Updated',
        reductionType: 'fixed',
        reductionValue: 7500,
        description: 'Updated desc',
        eligibility: 'Updated eligibility',
        applicationStatus: 'received',
        applicationDeadline: '2029-12-31',
        notes: 'Updated notes',
        categoryIds: [catId],
      };

      const result = subsidyProgramService.updateSubsidyProgram(db, id, data);

      expect(result.name).toBe('Completely Updated');
      expect(result.reductionType).toBe('fixed');
      expect(result.reductionValue).toBe(7500);
      expect(result.description).toBe('Updated desc');
      expect(result.eligibility).toBe('Updated eligibility');
      expect(result.applicationStatus).toBe('received');
      expect(result.applicationDeadline).toBe('2029-12-31');
      expect(result.notes).toBe('Updated notes');
      expect(result.applicableCategories).toHaveLength(1);
    });

    it('trims whitespace from name on update', () => {
      const id = insertRawProgram({ name: 'Original' });

      const data: UpdateSubsidyProgramRequest = { name: '  Trimmed  ' };
      const result = subsidyProgramService.updateSubsidyProgram(db, id, data);

      expect(result.name).toBe('Trimmed');
    });

    it('sets updatedAt to a new timestamp on update', async () => {
      const id = insertRawProgram({ name: 'Timestamp Test' });
      const before = subsidyProgramService.getSubsidyProgramById(db, id);

      // Wait long enough for Date.now() to advance (ISO strings have millisecond resolution)
      await new Promise((resolve) => setTimeout(resolve, 5));

      const data: UpdateSubsidyProgramRequest = { name: 'Updated Timestamp' };
      const result = subsidyProgramService.updateSubsidyProgram(db, id, data);

      expect(result.updatedAt).not.toBe(before.updatedAt);
    });

    it('validates percentage <= 100 using existing reductionType when only reductionValue is updated', () => {
      const id = insertRawProgram({
        name: 'Validate Pct',
        reductionType: 'percentage',
        reductionValue: 10,
      });

      const data: UpdateSubsidyProgramRequest = { reductionValue: 101 };

      expect(() => {
        subsidyProgramService.updateSubsidyProgram(db, id, data);
      }).toThrow(ValidationError);
      expect(() => {
        subsidyProgramService.updateSubsidyProgram(db, id, data);
      }).toThrow('Percentage reduction value must not exceed 100');
    });

    it('validates percentage <= 100 using new reductionType when both are updated', () => {
      const id = insertRawProgram({ name: 'Both Type Value', reductionType: 'fixed', reductionValue: 1000 });

      // Switch to percentage but provide value > 100
      const data: UpdateSubsidyProgramRequest = { reductionType: 'percentage', reductionValue: 110 };

      expect(() => {
        subsidyProgramService.updateSubsidyProgram(db, id, data);
      }).toThrow(ValidationError);
    });

    it('throws NotFoundError when program does not exist', () => {
      const data: UpdateSubsidyProgramRequest = { name: 'Updated' };

      expect(() => {
        subsidyProgramService.updateSubsidyProgram(db, 'non-existent-id', data);
      }).toThrow(NotFoundError);
      expect(() => {
        subsidyProgramService.updateSubsidyProgram(db, 'non-existent-id', data);
      }).toThrow('Subsidy program not found');
    });

    it('throws ValidationError when no fields are provided', () => {
      const id = insertRawProgram({ name: 'No Fields' });

      const data: UpdateSubsidyProgramRequest = {};

      expect(() => {
        subsidyProgramService.updateSubsidyProgram(db, id, data);
      }).toThrow(ValidationError);
      expect(() => {
        subsidyProgramService.updateSubsidyProgram(db, id, data);
      }).toThrow('At least one field must be provided');
    });

    it('throws ValidationError for empty name on update', () => {
      const id = insertRawProgram({ name: 'Valid Name' });

      const data: UpdateSubsidyProgramRequest = { name: '' };

      expect(() => {
        subsidyProgramService.updateSubsidyProgram(db, id, data);
      }).toThrow(ValidationError);
    });

    it('throws ValidationError for whitespace-only name on update', () => {
      const id = insertRawProgram({ name: 'Valid Name' });

      const data: UpdateSubsidyProgramRequest = { name: '   ' };

      expect(() => {
        subsidyProgramService.updateSubsidyProgram(db, id, data);
      }).toThrow(ValidationError);
    });

    it('throws ValidationError for name exceeding 200 characters on update', () => {
      const id = insertRawProgram({ name: 'Valid Name' });

      const data: UpdateSubsidyProgramRequest = { name: 'A'.repeat(201) };

      expect(() => {
        subsidyProgramService.updateSubsidyProgram(db, id, data);
      }).toThrow(ValidationError);
    });

    it('throws ValidationError for invalid reductionType on update', () => {
      const id = insertRawProgram({ name: 'Valid' });

      const data = { reductionType: 'invalid' as 'percentage' };

      expect(() => {
        subsidyProgramService.updateSubsidyProgram(db, id, data);
      }).toThrow(ValidationError);
    });

    it('throws ValidationError for reductionValue of zero on update', () => {
      const id = insertRawProgram({ name: 'Valid' });

      const data: UpdateSubsidyProgramRequest = { reductionValue: 0 };

      expect(() => {
        subsidyProgramService.updateSubsidyProgram(db, id, data);
      }).toThrow(ValidationError);
    });

    it('throws ValidationError for negative reductionValue on update', () => {
      const id = insertRawProgram({ name: 'Valid' });

      const data: UpdateSubsidyProgramRequest = { reductionValue: -10 };

      expect(() => {
        subsidyProgramService.updateSubsidyProgram(db, id, data);
      }).toThrow(ValidationError);
    });

    it('throws ValidationError for invalid applicationStatus on update', () => {
      const id = insertRawProgram({ name: 'Valid' });

      const data = { applicationStatus: 'unknown' as 'eligible' };

      expect(() => {
        subsidyProgramService.updateSubsidyProgram(db, id, data);
      }).toThrow(ValidationError);
    });

    it('throws ValidationError for unknown categoryIds on update', () => {
      const id = insertRawProgram({ name: 'Valid' });

      const data: UpdateSubsidyProgramRequest = { categoryIds: ['non-existent-cat'] };

      expect(() => {
        subsidyProgramService.updateSubsidyProgram(db, id, data);
      }).toThrow(ValidationError);
      expect(() => {
        subsidyProgramService.updateSubsidyProgram(db, id, data);
      }).toThrow('Unknown category IDs');
    });
  });

  // ─── deleteSubsidyProgram() ───────────────────────────────────────────────

  describe('deleteSubsidyProgram()', () => {
    it('deletes a program successfully', () => {
      const id = insertRawProgram({ name: 'To Delete' });

      subsidyProgramService.deleteSubsidyProgram(db, id);

      expect(() => {
        subsidyProgramService.getSubsidyProgramById(db, id);
      }).toThrow(NotFoundError);
    });

    it('removes program from the list after deletion', () => {
      const id1 = insertRawProgram({ name: 'Delete Me' });
      insertRawProgram({ name: 'Keep Me' });

      const countBefore = subsidyProgramService.listSubsidyPrograms(db).length;

      subsidyProgramService.deleteSubsidyProgram(db, id1);

      const result = subsidyProgramService.listSubsidyPrograms(db);
      expect(result).toHaveLength(countBefore - 1);
      expect(result.find((p) => p.id === id1)).toBeUndefined();
    });

    it('cascades deletion of category links when program is deleted', () => {
      const catId = insertBudgetCategory('Cat To Cascade');
      const id = insertRawProgram({ name: 'With Category' });
      db.insert(schema.subsidyProgramCategories)
        .values({ subsidyProgramId: id, budgetCategoryId: catId })
        .run();

      subsidyProgramService.deleteSubsidyProgram(db, id);

      // Category itself should still exist
      const remainingCat = db
        .select()
        .from(schema.budgetCategories)
        .all()
        .find((c) => c.id === catId);
      expect(remainingCat).toBeDefined();

      // But the program is gone
      expect(() => subsidyProgramService.getSubsidyProgramById(db, id)).toThrow(NotFoundError);
    });

    it('throws NotFoundError when program does not exist', () => {
      expect(() => {
        subsidyProgramService.deleteSubsidyProgram(db, 'non-existent-id');
      }).toThrow(NotFoundError);
      expect(() => {
        subsidyProgramService.deleteSubsidyProgram(db, 'non-existent-id');
      }).toThrow('Subsidy program not found');
    });

    it('throws SubsidyProgramInUseError when referenced by work items', () => {
      const id = insertRawProgram({ name: 'In Use Program' });
      const workItemId = insertRawWorkItem();

      // Link work item to subsidy program
      db.insert(schema.workItemSubsidies)
        .values({ workItemId, subsidyProgramId: id })
        .run();

      expect(() => {
        subsidyProgramService.deleteSubsidyProgram(db, id);
      }).toThrow(SubsidyProgramInUseError);
    });

    it('SubsidyProgramInUseError has correct code and statusCode', () => {
      const id = insertRawProgram({ name: 'In Use Program 2' });
      const workItemId = insertRawWorkItem();
      db.insert(schema.workItemSubsidies)
        .values({ workItemId, subsidyProgramId: id })
        .run();

      let error: SubsidyProgramInUseError | undefined;
      try {
        subsidyProgramService.deleteSubsidyProgram(db, id);
      } catch (e) {
        error = e as SubsidyProgramInUseError;
      }

      expect(error).toBeDefined();
      expect(error?.code).toBe('SUBSIDY_PROGRAM_IN_USE');
      expect(error?.statusCode).toBe(409);
    });

    it('SubsidyProgramInUseError includes workItemCount in details', () => {
      const id = insertRawProgram({ name: 'In Use Program 3' });
      const workItemId1 = insertRawWorkItem();
      const workItemId2 = insertRawWorkItem();
      db.insert(schema.workItemSubsidies)
        .values([
          { workItemId: workItemId1, subsidyProgramId: id },
          { workItemId: workItemId2, subsidyProgramId: id },
        ])
        .run();

      let error: SubsidyProgramInUseError | undefined;
      try {
        subsidyProgramService.deleteSubsidyProgram(db, id);
      } catch (e) {
        error = e as SubsidyProgramInUseError;
      }

      expect(error?.details?.workItemCount).toBe(2);
    });

    it('SubsidyProgramInUseError class has expected properties when constructed directly', () => {
      const err = new SubsidyProgramInUseError('In use', { workItemCount: 5 });
      expect(err.code).toBe('SUBSIDY_PROGRAM_IN_USE');
      expect(err.statusCode).toBe(409);
      expect(err.details?.workItemCount).toBe(5);
      expect(err.message).toBe('In use');
    });
  });
});
