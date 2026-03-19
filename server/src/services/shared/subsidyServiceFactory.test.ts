import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../../db/migrate.js';
import * as schema from '../../db/schema.js';
import { createSubsidyService } from './subsidyServiceFactory.js';
import { NotFoundError, ConflictError } from '../../errors/AppError.js';

// ─── Factory configurations under test ────────────────────────────────────────

function makeWorkItemService(_db: BetterSQLite3Database<typeof schema>) {
  return createSubsidyService({
    entityTable: schema.workItems,
    entityIdColumn: schema.workItems.id,
    junctionTable: schema.workItemSubsidies,
    junctionTableName: 'work_item_subsidies',
    junctionEntityIdColumn: schema.workItemSubsidies.workItemId,
    junctionEntityIdColumnName: 'work_item_id',
    junctionSubsidyProgramIdColumn: schema.workItemSubsidies.subsidyProgramId,
    junctionSubsidyProgramIdColumnName: 'subsidy_program_id',
    budgetLinesTable: 'work_item_budgets',
    budgetLinesEntityIdColumn: 'work_item_id',
    entityLabel: 'Work item',
    makeInsertValues: (workItemId, subsidyProgramId) => ({ workItemId, subsidyProgramId }),
  });
}

function makeHouseholdItemService(_db: BetterSQLite3Database<typeof schema>) {
  return createSubsidyService({
    entityTable: schema.householdItems,
    entityIdColumn: schema.householdItems.id,
    junctionTable: schema.householdItemSubsidies,
    junctionTableName: 'household_item_subsidies',
    junctionEntityIdColumn: schema.householdItemSubsidies.householdItemId,
    junctionEntityIdColumnName: 'household_item_id',
    junctionSubsidyProgramIdColumn: schema.householdItemSubsidies.subsidyProgramId,
    junctionSubsidyProgramIdColumnName: 'subsidy_program_id',
    budgetLinesTable: 'household_item_budgets',
    budgetLinesEntityIdColumn: 'household_item_id',
    entityLabel: 'Household item',
    makeInsertValues: (householdItemId, subsidyProgramId) => ({
      householdItemId,
      subsidyProgramId,
    }),
  });
}

// ─── Test database helpers ─────────────────────────────────────────────────────

describe('subsidyServiceFactory — createSubsidyService()', () => {
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

  function insertTestUser(id = 'user-001') {
    const now = new Date().toISOString();
    db.insert(schema.users)
      .values({
        id,
        email: `${id}@example.com`,
        displayName: 'Test User',
        role: 'member',
        authProvider: 'local',
        passwordHash: 'hashed',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  function insertWorkItem(title = 'Test Work Item', userId = 'user-001') {
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

  function insertHouseholdItem(name = 'Test Household Item', userId = 'user-001') {
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

  function insertSubsidyProgram(
    name = 'Test Subsidy',
    opts: {
      reductionType?: 'percentage' | 'fixed';
      reductionValue?: number;
      applicationStatus?: 'eligible' | 'applied' | 'approved' | 'received' | 'rejected';
      createdBy?: string | null;
      maximumAmount?: number | null;
    } = {},
  ) {
    const id = `sp-${++idCounter}`;
    const now = new Date(Date.now() + idCounter).toISOString();
    db.insert(schema.subsidyPrograms)
      .values({
        id,
        name,
        description: null,
        eligibility: null,
        reductionType: opts.reductionType ?? 'percentage',
        reductionValue: opts.reductionValue ?? 10,
        applicationStatus: opts.applicationStatus ?? 'eligible',
        applicationDeadline: null,
        notes: null,
        maximumAmount: opts.maximumAmount ?? null,
        createdBy: opts.createdBy ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  function insertWorkItemBudgetLine(
    workItemId: string,
    plannedAmount: number,
    budgetCategoryId: string | null = null,
  ) {
    const id = `wib-${++idCounter}`;
    const now = new Date(Date.now() + idCounter).toISOString();
    db.insert(schema.workItemBudgets)
      .values({
        id,
        workItemId,
        plannedAmount,
        budgetCategoryId,
        confidence: 'own_estimate',
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

  // ─── Factory shape ────────────────────────────────────────────────────────

  describe('factory shape', () => {
    it('returns a service object with list, link, and unlink methods', () => {
      const service = makeWorkItemService(db);

      expect(typeof service.list).toBe('function');
      expect(typeof service.link).toBe('function');
      expect(typeof service.unlink).toBe('function');
    });

    it('two factory instances created with different configs are independent', () => {
      const wiService = makeWorkItemService(db);
      const hiService = makeHouseholdItemService(db);

      const workItemId = insertWorkItem();
      const hiId = insertHouseholdItem();
      const subsidyId = insertSubsidyProgram('Shared Program');

      // Link subsidy only to work item
      wiService.link(db, workItemId, subsidyId);

      // Work item has the link
      expect(wiService.list(db, workItemId)).toHaveLength(1);
      // Household item does NOT have it
      expect(hiService.list(db, hiId)).toHaveLength(0);
    });
  });

  // ─── list() ───────────────────────────────────────────────────────────────

  describe('list()', () => {
    describe('work-item configuration', () => {
      it('returns empty array when no subsidies are linked', () => {
        const service = makeWorkItemService(db);
        const workItemId = insertWorkItem();

        expect(service.list(db, workItemId)).toEqual([]);
      });

      it('returns linked subsidy program with full shape', () => {
        const service = makeWorkItemService(db);
        const workItemId = insertWorkItem('Foundation Work');
        const subsidyId = insertSubsidyProgram('Green Energy Rebate', {
          reductionType: 'percentage',
          reductionValue: 15,
          applicationStatus: 'eligible',
          createdBy: 'user-001',
        });
        db.insert(schema.workItemSubsidies)
          .values({ workItemId, subsidyProgramId: subsidyId })
          .run();

        const result = service.list(db, workItemId);

        expect(result).toHaveLength(1);
        expect(result[0].id).toBe(subsidyId);
        expect(result[0].name).toBe('Green Energy Rebate');
        expect(result[0].reductionType).toBe('percentage');
        expect(result[0].reductionValue).toBe(15);
        expect(result[0].applicationStatus).toBe('eligible');
        expect(result[0].applicableCategories).toBeDefined();
        expect(Array.isArray(result[0].applicableCategories)).toBe(true);
        expect(result[0].createdBy?.id).toBe('user-001');
      });

      it('returns multiple linked subsidy programs', () => {
        const service = makeWorkItemService(db);
        const workItemId = insertWorkItem();
        const subsidyId1 = insertSubsidyProgram('Subsidy A');
        const subsidyId2 = insertSubsidyProgram('Subsidy B');
        db.insert(schema.workItemSubsidies)
          .values({ workItemId, subsidyProgramId: subsidyId1 })
          .run();
        db.insert(schema.workItemSubsidies)
          .values({ workItemId, subsidyProgramId: subsidyId2 })
          .run();

        const result = service.list(db, workItemId);

        expect(result).toHaveLength(2);
        const names = result.map((s) => s.name);
        expect(names).toContain('Subsidy A');
        expect(names).toContain('Subsidy B');
      });

      it('returns subsidy with null createdBy when createdBy is null', () => {
        const service = makeWorkItemService(db);
        const workItemId = insertWorkItem();
        const subsidyId = insertSubsidyProgram('Anonymous Subsidy', { createdBy: null });
        db.insert(schema.workItemSubsidies)
          .values({ workItemId, subsidyProgramId: subsidyId })
          .run();

        const result = service.list(db, workItemId);

        expect(result).toHaveLength(1);
        expect(result[0].createdBy).toBeNull();
      });

      it('throws NotFoundError when work item does not exist', () => {
        const service = makeWorkItemService(db);

        expect(() => {
          service.list(db, 'non-existent-wi');
        }).toThrow(NotFoundError);

        expect(() => {
          service.list(db, 'non-existent-wi');
        }).toThrow('Work item not found');
      });
    });

    describe('household-item configuration', () => {
      it('returns empty array when no subsidies are linked', () => {
        const service = makeHouseholdItemService(db);
        const hiId = insertHouseholdItem();

        expect(service.list(db, hiId)).toEqual([]);
      });

      it('throws NotFoundError when household item does not exist', () => {
        const service = makeHouseholdItemService(db);

        expect(() => {
          service.list(db, 'non-existent-hi');
        }).toThrow(NotFoundError);

        expect(() => {
          service.list(db, 'non-existent-hi');
        }).toThrow('Household item not found');
      });

      it('does not return subsidies linked to a different household item', () => {
        const service = makeHouseholdItemService(db);
        const hiId1 = insertHouseholdItem('Sofa');
        const hiId2 = insertHouseholdItem('Fridge');
        const subsidyId = insertSubsidyProgram('Exclusive Subsidy');
        db.insert(schema.householdItemSubsidies)
          .values({ householdItemId: hiId2, subsidyProgramId: subsidyId })
          .run();

        expect(service.list(db, hiId1)).toHaveLength(0);
      });
    });
  });

  // ─── link() ───────────────────────────────────────────────────────────────

  describe('link()', () => {
    describe('work-item configuration', () => {
      it('creates junction row and returns the subsidy program', () => {
        const service = makeWorkItemService(db);
        const workItemId = insertWorkItem();
        const subsidyId = insertSubsidyProgram('Solar Panel Rebate', {
          reductionType: 'fixed',
          reductionValue: 5000,
        });

        const result = service.link(db, workItemId, subsidyId);

        expect(result.id).toBe(subsidyId);
        expect(result.name).toBe('Solar Panel Rebate');
        expect(result.reductionType).toBe('fixed');
        expect(result.reductionValue).toBe(5000);
      });

      it('persists the link so list() returns it', () => {
        const service = makeWorkItemService(db);
        const workItemId = insertWorkItem();
        const subsidyId = insertSubsidyProgram('Persistent Subsidy');

        service.link(db, workItemId, subsidyId);

        const listed = service.list(db, workItemId);
        expect(listed).toHaveLength(1);
        expect(listed[0].id).toBe(subsidyId);
      });

      it('throws NotFoundError when work item does not exist', () => {
        const service = makeWorkItemService(db);
        const subsidyId = insertSubsidyProgram('Some Subsidy');

        expect(() => {
          service.link(db, 'non-existent-wi', subsidyId);
        }).toThrow(NotFoundError);

        expect(() => {
          service.link(db, 'non-existent-wi', subsidyId);
        }).toThrow('Work item not found');
      });

      it('throws NotFoundError when subsidy program does not exist', () => {
        const service = makeWorkItemService(db);
        const workItemId = insertWorkItem();

        expect(() => {
          service.link(db, workItemId, 'non-existent-subsidy');
        }).toThrow(NotFoundError);

        expect(() => {
          service.link(db, workItemId, 'non-existent-subsidy');
        }).toThrow('Subsidy program not found');
      });

      it('throws ConflictError when subsidy is already linked', () => {
        const service = makeWorkItemService(db);
        const workItemId = insertWorkItem();
        const subsidyId = insertSubsidyProgram('Duplicate Subsidy');

        service.link(db, workItemId, subsidyId);

        expect(() => {
          service.link(db, workItemId, subsidyId);
        }).toThrow(ConflictError);

        expect(() => {
          service.link(db, workItemId, subsidyId);
        }).toThrow('Subsidy program is already linked to this work item');
      });

      it('allows linking the same subsidy to multiple work items', () => {
        const service = makeWorkItemService(db);
        const workItemId1 = insertWorkItem('Work Item 1');
        const workItemId2 = insertWorkItem('Work Item 2');
        const subsidyId = insertSubsidyProgram('Shared Subsidy');

        service.link(db, workItemId1, subsidyId);
        service.link(db, workItemId2, subsidyId);

        expect(service.list(db, workItemId1)).toHaveLength(1);
        expect(service.list(db, workItemId2)).toHaveLength(1);
      });
    });

    describe('household-item configuration', () => {
      it('creates junction row and returns the subsidy program', () => {
        const service = makeHouseholdItemService(db);
        const hiId = insertHouseholdItem();
        const subsidyId = insertSubsidyProgram('Appliance Rebate', {
          reductionType: 'percentage',
          reductionValue: 20,
        });

        const result = service.link(db, hiId, subsidyId);

        expect(result.id).toBe(subsidyId);
        expect(result.name).toBe('Appliance Rebate');
        expect(result.reductionType).toBe('percentage');
        expect(result.reductionValue).toBe(20);
      });

      it('throws NotFoundError when household item does not exist', () => {
        const service = makeHouseholdItemService(db);
        const subsidyId = insertSubsidyProgram('Some Subsidy');

        expect(() => {
          service.link(db, 'non-existent-hi', subsidyId);
        }).toThrow(NotFoundError);

        expect(() => {
          service.link(db, 'non-existent-hi', subsidyId);
        }).toThrow('Household item not found');
      });

      it('throws NotFoundError when subsidy program does not exist', () => {
        const service = makeHouseholdItemService(db);
        const hiId = insertHouseholdItem();

        expect(() => {
          service.link(db, hiId, 'non-existent-subsidy');
        }).toThrow(NotFoundError);

        expect(() => {
          service.link(db, hiId, 'non-existent-subsidy');
        }).toThrow('Subsidy program not found');
      });

      it('throws ConflictError when subsidy is already linked to the household item', () => {
        const service = makeHouseholdItemService(db);
        const hiId = insertHouseholdItem();
        const subsidyId = insertSubsidyProgram('Duplicate Subsidy');

        service.link(db, hiId, subsidyId);

        expect(() => {
          service.link(db, hiId, subsidyId);
        }).toThrow(ConflictError);

        expect(() => {
          service.link(db, hiId, subsidyId);
        }).toThrow('Subsidy program is already linked to this household item');
      });
    });
  });

  // ─── unlink() ─────────────────────────────────────────────────────────────

  describe('unlink()', () => {
    describe('work-item configuration', () => {
      it('removes the junction row', () => {
        const service = makeWorkItemService(db);
        const workItemId = insertWorkItem();
        const subsidyId = insertSubsidyProgram('Linked Subsidy');

        service.link(db, workItemId, subsidyId);
        service.unlink(db, workItemId, subsidyId);

        expect(service.list(db, workItemId)).toEqual([]);
      });

      it('only removes the specified link, not others on the same entity', () => {
        const service = makeWorkItemService(db);
        const workItemId = insertWorkItem();
        const subsidyId1 = insertSubsidyProgram('Subsidy To Remove');
        const subsidyId2 = insertSubsidyProgram('Subsidy To Keep');

        service.link(db, workItemId, subsidyId1);
        service.link(db, workItemId, subsidyId2);
        service.unlink(db, workItemId, subsidyId1);

        const result = service.list(db, workItemId);
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe(subsidyId2);
      });

      it('throws NotFoundError when work item does not exist', () => {
        const service = makeWorkItemService(db);
        const subsidyId = insertSubsidyProgram('Some Subsidy');

        expect(() => {
          service.unlink(db, 'non-existent-wi', subsidyId);
        }).toThrow(NotFoundError);

        expect(() => {
          service.unlink(db, 'non-existent-wi', subsidyId);
        }).toThrow('Work item not found');
      });

      it('throws NotFoundError when subsidy is not linked to the work item', () => {
        const service = makeWorkItemService(db);
        const workItemId = insertWorkItem();
        const subsidyId = insertSubsidyProgram('Unlinked Subsidy');

        expect(() => {
          service.unlink(db, workItemId, subsidyId);
        }).toThrow(NotFoundError);

        expect(() => {
          service.unlink(db, workItemId, subsidyId);
        }).toThrow('Subsidy program is not linked to this work item');
      });
    });

    describe('household-item configuration', () => {
      it('removes the junction row', () => {
        const service = makeHouseholdItemService(db);
        const hiId = insertHouseholdItem();
        const subsidyId = insertSubsidyProgram('Linked Subsidy');

        service.link(db, hiId, subsidyId);
        service.unlink(db, hiId, subsidyId);

        expect(service.list(db, hiId)).toEqual([]);
      });

      it('throws NotFoundError when household item does not exist', () => {
        const service = makeHouseholdItemService(db);
        const subsidyId = insertSubsidyProgram('Some Subsidy');

        expect(() => {
          service.unlink(db, 'non-existent-hi', subsidyId);
        }).toThrow(NotFoundError);

        expect(() => {
          service.unlink(db, 'non-existent-hi', subsidyId);
        }).toThrow('Household item not found');
      });

      it('throws NotFoundError when subsidy is not linked to the household item', () => {
        const service = makeHouseholdItemService(db);
        const hiId = insertHouseholdItem();
        const subsidyId = insertSubsidyProgram('Unlinked Subsidy');

        expect(() => {
          service.unlink(db, hiId, subsidyId);
        }).toThrow(NotFoundError);

        expect(() => {
          service.unlink(db, hiId, subsidyId);
        }).toThrow('Subsidy program is not linked to this household item');
      });
    });
  });

  // ─── Oversubscription is allowed (cap enforcement moved to budget calculations) ──

  describe('link() allows oversubscription', () => {
    it('links successfully even when fixed subsidy exceeds maximumAmount', () => {
      const service = makeWorkItemService(db);
      // maximumAmount = 5000, reductionValue = 10000
      // Previously this would throw SubsidyOversubscribedError — now it succeeds
      const subsidyId = insertSubsidyProgram('Fixed Over Cap', {
        reductionType: 'fixed',
        reductionValue: 10000,
        maximumAmount: 5000,
      });
      const workItemId1 = insertWorkItem('Work Item X');
      const workItemId2 = insertWorkItem('Work Item Y');

      service.link(db, workItemId1, subsidyId);
      // Second link takes total well above cap — should succeed
      expect(() => {
        service.link(db, workItemId2, subsidyId);
      }).not.toThrow();

      expect(service.list(db, workItemId1)).toHaveLength(1);
      expect(service.list(db, workItemId2)).toHaveLength(1);
    });

    it('links successfully even when percentage subsidy exceeds maximumAmount', () => {
      const service = makeWorkItemService(db);
      const categories = db.select().from(schema.budgetCategories).limit(1).all();
      if (categories.length === 0) return;

      // 10% of 10000 = 1000 > max 500 — previously blocked, now allowed
      const subsidyId = insertSubsidyProgram('Pct Over Cap', {
        reductionType: 'percentage',
        reductionValue: 10,
        maximumAmount: 500,
      });
      db.insert(schema.subsidyProgramCategories)
        .values({ subsidyProgramId: subsidyId, budgetCategoryId: categories[0].id })
        .run();

      const workItemId = insertWorkItem('WI Over Pct');
      insertWorkItemBudgetLine(workItemId, 10000, categories[0].id);

      expect(() => {
        service.link(db, workItemId, subsidyId);
      }).not.toThrow();
    });
  });

  // ─── Applicable categories loaded correctly ────────────────────────────────

  describe('applicableCategories', () => {
    it('loads applicable categories linked to the subsidy program', () => {
      const service = makeWorkItemService(db);
      const workItemId = insertWorkItem();
      const subsidyId = insertSubsidyProgram('Category Subsidy');

      // Get a real seeded budget category
      const categories = db.select().from(schema.budgetCategories).limit(1).all();
      if (categories.length === 0) return; // guard: skip if no categories seeded

      db.insert(schema.subsidyProgramCategories)
        .values({ subsidyProgramId: subsidyId, budgetCategoryId: categories[0].id })
        .run();
      db.insert(schema.workItemSubsidies).values({ workItemId, subsidyProgramId: subsidyId }).run();

      const result = service.list(db, workItemId);

      expect(result[0].applicableCategories).toHaveLength(1);
      expect(result[0].applicableCategories[0].id).toBe(categories[0].id);
    });

    it('returns empty applicableCategories when none are linked to the subsidy', () => {
      const service = makeWorkItemService(db);
      const workItemId = insertWorkItem();
      const subsidyId = insertSubsidyProgram('Uncategorized Subsidy');
      db.insert(schema.workItemSubsidies).values({ workItemId, subsidyProgramId: subsidyId }).run();

      const result = service.list(db, workItemId);

      expect(result[0].applicableCategories).toEqual([]);
    });
  });
});
