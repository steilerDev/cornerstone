import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../../db/migrate.js';
import * as schema from '../../db/schema.js';
import { createSubsidyPaybackService } from './subsidyPaybackServiceFactory.js';
import { NotFoundError } from '../../errors/AppError.js';

// ─── Factory configurations used in tests ─────────────────────────────────────

const workItemConfig = {
  entityTable: 'work_items',
  junctionTable: 'work_item_subsidies',
  junctionAlias: 'wis',
  junctionEntityIdColumn: 'work_item_id',
  budgetLinesTable: 'work_item_budgets',
  budgetLinesEntityIdColumn: 'work_item_id',
  supportsInvoices: true,
  entityLabel: 'Work item',
  entityIdResponseKey: 'workItemId',
} as const;

const householdItemConfig = {
  entityTable: 'household_items',
  junctionTable: 'household_item_subsidies',
  junctionAlias: 'his',
  junctionEntityIdColumn: 'household_item_id',
  budgetLinesTable: 'household_item_budgets',
  budgetLinesEntityIdColumn: 'household_item_id',
  supportsInvoices: false,
  entityLabel: 'Household item',
  entityIdResponseKey: 'householdItemId',
} as const;

// ─── DB helpers ───────────────────────────────────────────────────────────────

describe('subsidyPaybackServiceFactory — createSubsidyPaybackService()', () => {
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

  function insertHouseholdItem(name = 'Test Item', userId = 'user-001') {
    const id = `hi-${++idCounter}`;
    const now = new Date(Date.now() + idCounter).toISOString();
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
    opts: {
      name?: string;
      reductionType?: 'percentage' | 'fixed';
      reductionValue?: number;
      applicationStatus?: 'eligible' | 'applied' | 'approved' | 'received' | 'rejected';
    } = {},
  ) {
    const id = `sp-${++idCounter}`;
    const now = new Date(Date.now() + idCounter).toISOString();
    db.insert(schema.subsidyPrograms)
      .values({
        id,
        name: opts.name ?? `Subsidy ${id}`,
        description: null,
        eligibility: null,
        reductionType: opts.reductionType ?? 'percentage',
        reductionValue: opts.reductionValue ?? 10,
        applicationStatus: opts.applicationStatus ?? 'eligible',
        applicationDeadline: null,
        notes: null,
        createdBy: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  function insertBudgetCategory(name?: string) {
    const id = `cat-${++idCounter}`;
    const now = new Date(Date.now() + idCounter).toISOString();
    db.insert(schema.budgetCategories)
      .values({
        id,
        name: name ?? `Category ${id}`,
        description: null,
        color: null,
        sortOrder: 200 + idCounter,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  function insertWiBudgetLine(opts: {
    workItemId: string;
    plannedAmount: number;
    budgetCategoryId?: string | null;
    confidence?: 'own_estimate' | 'professional_estimate' | 'quote' | 'invoice';
  }) {
    const id = `bl-${++idCounter}`;
    const now = new Date(Date.now() + idCounter).toISOString();
    db.insert(schema.workItemBudgets)
      .values({
        id,
        workItemId: opts.workItemId,
        description: null,
        plannedAmount: opts.plannedAmount,
        confidence: opts.confidence ?? 'own_estimate',
        budgetCategoryId: opts.budgetCategoryId ?? null,
        budgetSourceId: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  function insertHiBudgetLine(opts: {
    householdItemId: string;
    plannedAmount: number;
    budgetCategoryId?: string | null;
    confidence?: 'own_estimate' | 'professional_estimate' | 'quote' | 'invoice';
  }) {
    const id = `hibl-${++idCounter}`;
    const now = new Date(Date.now() + idCounter).toISOString();
    db.insert(schema.householdItemBudgets)
      .values({
        id,
        householdItemId: opts.householdItemId,
        description: null,
        plannedAmount: opts.plannedAmount,
        confidence: opts.confidence ?? 'own_estimate',
        budgetCategoryId: opts.budgetCategoryId ?? null,
        budgetSourceId: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  function insertVendor() {
    const id = `vendor-${++idCounter}`;
    const now = new Date(Date.now() + idCounter).toISOString();
    db.insert(schema.vendors)
      .values({ id, name: `Vendor ${id}`, createdAt: now, updatedAt: now })
      .run();
    return id;
  }

  function insertInvoice(budgetLineId: string, amount: number) {
    const vendorId = insertVendor();
    const id = `inv-${++idCounter}`;
    const now = new Date(Date.now() + idCounter).toISOString();
    db.insert(schema.invoices)
      .values({
        id,
        vendorId,
        invoiceNumber: null,
        amount,
        status: 'pending',
        date: now.slice(0, 10),
        dueDate: null,
        notes: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    db.insert(schema.invoiceBudgetLines)
      .values({
        id: randomUUID(),
        invoiceId: id,
        workItemBudgetId: budgetLineId,
        itemizedAmount: amount,
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

  // ─── Factory shape ─────────────────────────────────────────────────────────

  describe('factory shape', () => {
    it('returns a callable function', () => {
      const fn = createSubsidyPaybackService(workItemConfig);
      expect(typeof fn).toBe('function');
    });
  });

  // ─── Error cases ───────────────────────────────────────────────────────────

  describe('error cases', () => {
    it('throws NotFoundError when work item does not exist (supportsInvoices: true)', () => {
      const getPayback = createSubsidyPaybackService(workItemConfig);
      expect(() => getPayback(db, 'non-existent-wi')).toThrow(NotFoundError);
    });

    it('throws NotFoundError with entityLabel message for work item', () => {
      const getPayback = createSubsidyPaybackService(workItemConfig);
      expect(() => getPayback(db, 'non-existent-wi')).toThrow('Work item not found');
    });

    it('throws NotFoundError when household item does not exist (supportsInvoices: false)', () => {
      const getPayback = createSubsidyPaybackService(householdItemConfig);
      expect(() => getPayback(db, 'non-existent-hi')).toThrow(NotFoundError);
    });

    it('throws NotFoundError with entityLabel message for household item', () => {
      const getPayback = createSubsidyPaybackService(householdItemConfig);
      expect(() => getPayback(db, 'non-existent-hi')).toThrow('Household item not found');
    });
  });

  // ─── No linked subsidies ───────────────────────────────────────────────────

  describe('no linked subsidies', () => {
    it('returns zero totals and empty subsidies array for work item with no subsidies', () => {
      const getPayback = createSubsidyPaybackService(workItemConfig);
      const workItemId = insertWorkItem();

      const result = getPayback(db, workItemId) as Record<string, unknown>;

      expect(result['workItemId']).toBe(workItemId);
      expect(result['minTotalPayback']).toBe(0);
      expect(result['maxTotalPayback']).toBe(0);
      expect(result['subsidies']).toEqual([]);
    });

    it('returns zero totals and empty subsidies array for household item with no subsidies', () => {
      const getPayback = createSubsidyPaybackService(householdItemConfig);
      const hiId = insertHouseholdItem();

      const result = getPayback(db, hiId) as Record<string, unknown>;

      expect(result['householdItemId']).toBe(hiId);
      expect(result['minTotalPayback']).toBe(0);
      expect(result['maxTotalPayback']).toBe(0);
      expect(result['subsidies']).toEqual([]);
    });

    it('returns 0 totals when all linked subsidies are rejected', () => {
      const getPayback = createSubsidyPaybackService(workItemConfig);
      const workItemId = insertWorkItem();
      const subsidyId = insertSubsidyProgram({
        reductionType: 'percentage',
        reductionValue: 20,
        applicationStatus: 'rejected',
      });
      db.insert(schema.workItemSubsidies).values({ workItemId, subsidyProgramId: subsidyId }).run();

      const result = getPayback(db, workItemId) as Record<string, unknown>;

      expect(result['minTotalPayback']).toBe(0);
      expect(result['maxTotalPayback']).toBe(0);
      expect(result['subsidies']).toHaveLength(0);
    });
  });

  // ─── entityIdResponseKey ───────────────────────────────────────────────────

  describe('entityIdResponseKey', () => {
    it('uses workItemId as response key for work-item config', () => {
      const getPayback = createSubsidyPaybackService(workItemConfig);
      const workItemId = insertWorkItem();
      const subsidyId = insertSubsidyProgram({ reductionType: 'fixed', reductionValue: 100 });
      db.insert(schema.workItemSubsidies).values({ workItemId, subsidyProgramId: subsidyId }).run();

      const result = getPayback(db, workItemId) as Record<string, unknown>;

      expect(result['workItemId']).toBe(workItemId);
      expect(result['householdItemId']).toBeUndefined();
    });

    it('uses householdItemId as response key for household-item config', () => {
      const getPayback = createSubsidyPaybackService(householdItemConfig);
      const hiId = insertHouseholdItem();
      const subsidyId = insertSubsidyProgram({ reductionType: 'fixed', reductionValue: 100 });
      db.insert(schema.householdItemSubsidies)
        .values({ householdItemId: hiId, subsidyProgramId: subsidyId })
        .run();

      const result = getPayback(db, hiId) as Record<string, unknown>;

      expect(result['householdItemId']).toBe(hiId);
      expect(result['workItemId']).toBeUndefined();
    });
  });

  // ─── supportsInvoices: false — always uses confidence margins ──────────────

  describe('supportsInvoices: false', () => {
    it('applies confidence margin even when no invoice records exist for the entity', () => {
      const getPayback = createSubsidyPaybackService(householdItemConfig);
      const hiId = insertHouseholdItem();
      insertHiBudgetLine({
        householdItemId: hiId,
        plannedAmount: 1000,
        confidence: 'own_estimate',
      });
      const subsidyId = insertSubsidyProgram({ reductionType: 'percentage', reductionValue: 10 });
      db.insert(schema.householdItemSubsidies)
        .values({ householdItemId: hiId, subsidyProgramId: subsidyId })
        .run();

      const result = getPayback(db, hiId) as Record<string, unknown>;

      // own_estimate ±20%: min=1000*0.8*10%=80, max=1000*1.2*10%=120
      expect(result['minTotalPayback']).toBeCloseTo(80);
      expect(result['maxTotalPayback']).toBeCloseTo(120);
    });

    it('applies professional_estimate margin (±10%) for household item', () => {
      const getPayback = createSubsidyPaybackService(householdItemConfig);
      const hiId = insertHouseholdItem();
      insertHiBudgetLine({
        householdItemId: hiId,
        plannedAmount: 1000,
        confidence: 'professional_estimate',
      });
      const subsidyId = insertSubsidyProgram({ reductionType: 'percentage', reductionValue: 10 });
      db.insert(schema.householdItemSubsidies)
        .values({ householdItemId: hiId, subsidyProgramId: subsidyId })
        .run();

      const result = getPayback(db, hiId) as Record<string, unknown>;

      // min=1000*0.9*10%=90, max=1000*1.1*10%=110
      expect(result['minTotalPayback']).toBeCloseTo(90);
      expect(result['maxTotalPayback']).toBeCloseTo(110);
    });

    it('applies quote margin (±5%) for household item', () => {
      const getPayback = createSubsidyPaybackService(householdItemConfig);
      const hiId = insertHouseholdItem();
      insertHiBudgetLine({ householdItemId: hiId, plannedAmount: 1000, confidence: 'quote' });
      const subsidyId = insertSubsidyProgram({ reductionType: 'percentage', reductionValue: 10 });
      db.insert(schema.householdItemSubsidies)
        .values({ householdItemId: hiId, subsidyProgramId: subsidyId })
        .run();

      const result = getPayback(db, hiId) as Record<string, unknown>;

      // min=1000*0.95*10%=95, max=1000*1.05*10%=105
      expect(result['minTotalPayback']).toBeCloseTo(95);
      expect(result['maxTotalPayback']).toBeCloseTo(105);
    });

    it('applies invoice confidence (±0%) so min === max === planned amount * rate', () => {
      const getPayback = createSubsidyPaybackService(householdItemConfig);
      const hiId = insertHouseholdItem();
      insertHiBudgetLine({ householdItemId: hiId, plannedAmount: 1000, confidence: 'invoice' });
      const subsidyId = insertSubsidyProgram({ reductionType: 'percentage', reductionValue: 10 });
      db.insert(schema.householdItemSubsidies)
        .values({ householdItemId: hiId, subsidyProgramId: subsidyId })
        .run();

      const result = getPayback(db, hiId) as Record<string, unknown>;

      // margin=0: min = max = 1000 * 10% = 100
      expect(result['minTotalPayback']).toBeCloseTo(100);
      expect(result['maxTotalPayback']).toBeCloseTo(100);
    });
  });

  // ─── supportsInvoices: true — uses actual cost when invoices exist ──────────

  describe('supportsInvoices: true', () => {
    it('uses actual invoiced cost for min and max when invoices exist (min === max)', () => {
      const getPayback = createSubsidyPaybackService(workItemConfig);
      const workItemId = insertWorkItem();
      const budgetLineId = insertWiBudgetLine({
        workItemId,
        plannedAmount: 1000,
        confidence: 'own_estimate',
      });
      insertInvoice(budgetLineId, 800); // actual cost = 800

      const subsidyId = insertSubsidyProgram({ reductionType: 'percentage', reductionValue: 10 });
      db.insert(schema.workItemSubsidies).values({ workItemId, subsidyProgramId: subsidyId }).run();

      const result = getPayback(db, workItemId) as Record<string, unknown>;

      // Actual cost 800, no margin: min = max = 800 * 10% = 80
      expect(result['minTotalPayback']).toBeCloseTo(80);
      expect(result['maxTotalPayback']).toBeCloseTo(80);
    });

    it('applies confidence margin when no invoices exist for the budget line', () => {
      const getPayback = createSubsidyPaybackService(workItemConfig);
      const workItemId = insertWorkItem();
      insertWiBudgetLine({ workItemId, plannedAmount: 1000, confidence: 'own_estimate' });
      const subsidyId = insertSubsidyProgram({ reductionType: 'percentage', reductionValue: 10 });
      db.insert(schema.workItemSubsidies).values({ workItemId, subsidyProgramId: subsidyId }).run();

      const result = getPayback(db, workItemId) as Record<string, unknown>;

      // own_estimate ±20%: min=1000*0.8*10%=80, max=1000*1.2*10%=120
      expect(result['minTotalPayback']).toBeCloseTo(80);
      expect(result['maxTotalPayback']).toBeCloseTo(120);
    });

    it('sums multiple invoices for the same budget line as actual cost', () => {
      const getPayback = createSubsidyPaybackService(workItemConfig);
      const workItemId = insertWorkItem();
      const budgetLineId = insertWiBudgetLine({
        workItemId,
        plannedAmount: 2000,
        confidence: 'own_estimate',
      });
      insertInvoice(budgetLineId, 600);
      insertInvoice(budgetLineId, 400); // total: 1000

      const subsidyId = insertSubsidyProgram({ reductionType: 'percentage', reductionValue: 10 });
      db.insert(schema.workItemSubsidies).values({ workItemId, subsidyProgramId: subsidyId }).run();

      const result = getPayback(db, workItemId) as Record<string, unknown>;

      // 1000 × 10% = 100
      expect(result['minTotalPayback']).toBeCloseTo(100);
      expect(result['maxTotalPayback']).toBeCloseTo(100);
    });
  });

  // ─── Fixed subsidies ───────────────────────────────────────────────────────

  describe('fixed subsidies', () => {
    it('returns reductionValue as min === max for fixed subsidy on work item', () => {
      const getPayback = createSubsidyPaybackService(workItemConfig);
      const workItemId = insertWorkItem();
      const subsidyId = insertSubsidyProgram({ reductionType: 'fixed', reductionValue: 5000 });
      db.insert(schema.workItemSubsidies).values({ workItemId, subsidyProgramId: subsidyId }).run();

      const result = getPayback(db, workItemId) as {
        minTotalPayback: number;
        maxTotalPayback: number;
        subsidies: Array<{ minPayback: number; maxPayback: number }>;
      };

      expect(result.minTotalPayback).toBe(5000);
      expect(result.maxTotalPayback).toBe(5000);
      expect(result.subsidies[0].minPayback).toBe(5000);
      expect(result.subsidies[0].maxPayback).toBe(5000);
    });

    it('returns reductionValue as min === max for fixed subsidy on household item', () => {
      const getPayback = createSubsidyPaybackService(householdItemConfig);
      const hiId = insertHouseholdItem();
      const subsidyId = insertSubsidyProgram({ reductionType: 'fixed', reductionValue: 2500 });
      db.insert(schema.householdItemSubsidies)
        .values({ householdItemId: hiId, subsidyProgramId: subsidyId })
        .run();

      const result = getPayback(db, hiId) as {
        minTotalPayback: number;
        maxTotalPayback: number;
        subsidies: Array<{ minPayback: number; maxPayback: number }>;
      };

      expect(result.minTotalPayback).toBe(2500);
      expect(result.maxTotalPayback).toBe(2500);
      expect(result.subsidies[0].minPayback).toBe(2500);
      expect(result.subsidies[0].maxPayback).toBe(2500);
    });

    it('returns fixed amount even with no budget lines', () => {
      const getPayback = createSubsidyPaybackService(householdItemConfig);
      const hiId = insertHouseholdItem();
      const subsidyId = insertSubsidyProgram({ reductionType: 'fixed', reductionValue: 3000 });
      db.insert(schema.householdItemSubsidies)
        .values({ householdItemId: hiId, subsidyProgramId: subsidyId })
        .run();

      const result = getPayback(db, hiId) as Record<string, unknown>;

      expect(result['minTotalPayback']).toBe(3000);
      expect(result['maxTotalPayback']).toBe(3000);
    });
  });

  // ─── Rejected subsidies excluded ──────────────────────────────────────────

  describe('rejected subsidies', () => {
    it('excludes rejected subsidies from calculation', () => {
      const getPayback = createSubsidyPaybackService(workItemConfig);
      const workItemId = insertWorkItem();
      insertWiBudgetLine({ workItemId, plannedAmount: 1000, confidence: 'own_estimate' });

      const approved = insertSubsidyProgram({
        reductionType: 'percentage',
        reductionValue: 10,
        applicationStatus: 'approved',
      });
      const rejected = insertSubsidyProgram({
        reductionType: 'percentage',
        reductionValue: 50,
        applicationStatus: 'rejected',
      });
      db.insert(schema.workItemSubsidies).values({ workItemId, subsidyProgramId: approved }).run();
      db.insert(schema.workItemSubsidies).values({ workItemId, subsidyProgramId: rejected }).run();

      const result = getPayback(db, workItemId) as {
        subsidies: unknown[];
        minTotalPayback: number;
        maxTotalPayback: number;
      };

      expect(result.subsidies).toHaveLength(1);
      // Only approved: min=1000*0.8*10%=80, max=1000*1.2*10%=120
      expect(result.minTotalPayback).toBeCloseTo(80);
      expect(result.maxTotalPayback).toBeCloseTo(120);
    });
  });

  // ─── Category-restricted subsidies ────────────────────────────────────────

  describe('category-restricted subsidies', () => {
    it('only applies subsidy to budget lines matching the category restriction', () => {
      const getPayback = createSubsidyPaybackService(householdItemConfig);
      const hiId = insertHouseholdItem();
      const cat1 = insertBudgetCategory('Electronics');
      const cat2 = insertBudgetCategory('Furniture');

      insertHiBudgetLine({
        householdItemId: hiId,
        plannedAmount: 1000,
        budgetCategoryId: cat1,
        confidence: 'own_estimate',
      }); // matches
      insertHiBudgetLine({
        householdItemId: hiId,
        plannedAmount: 500,
        budgetCategoryId: cat2,
        confidence: 'own_estimate',
      }); // excluded

      const subsidyId = insertSubsidyProgram({ reductionType: 'percentage', reductionValue: 10 });
      db.insert(schema.subsidyProgramCategories)
        .values({ subsidyProgramId: subsidyId, budgetCategoryId: cat1 })
        .run();
      db.insert(schema.householdItemSubsidies)
        .values({ householdItemId: hiId, subsidyProgramId: subsidyId })
        .run();

      const result = getPayback(db, hiId) as Record<string, unknown>;

      // Only cat1 line: min=1000*0.8*10%=80, max=1000*1.2*10%=120
      expect(result['minTotalPayback']).toBeCloseTo(80);
      expect(result['maxTotalPayback']).toBeCloseTo(120);
    });

    it('universal subsidy (no category link) matches all budget lines', () => {
      const getPayback = createSubsidyPaybackService(householdItemConfig);
      const hiId = insertHouseholdItem();
      const cat1 = insertBudgetCategory('Electronics');
      const cat2 = insertBudgetCategory('Decor');

      insertHiBudgetLine({
        householdItemId: hiId,
        plannedAmount: 1000,
        budgetCategoryId: cat1,
        confidence: 'invoice',
      });
      insertHiBudgetLine({
        householdItemId: hiId,
        plannedAmount: 500,
        budgetCategoryId: cat2,
        confidence: 'invoice',
      });

      const subsidyId = insertSubsidyProgram({ reductionType: 'percentage', reductionValue: 10 });
      // No subsidyProgramCategories link — it's universal
      db.insert(schema.householdItemSubsidies)
        .values({ householdItemId: hiId, subsidyProgramId: subsidyId })
        .run();

      const result = getPayback(db, hiId) as Record<string, unknown>;

      // All lines (invoice margin=0): (1000+500)*10% = 150
      expect(result['minTotalPayback']).toBeCloseTo(150);
      expect(result['maxTotalPayback']).toBeCloseTo(150);
    });
  });
});
