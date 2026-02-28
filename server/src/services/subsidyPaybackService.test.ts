import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import { getWorkItemSubsidyPayback } from './subsidyPaybackService.js';
import { NotFoundError } from '../errors/AppError.js';

describe('subsidyPaybackService', () => {
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

  function insertBudgetCategory(name?: string): string {
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

  function insertBudgetLine(opts: {
    workItemId: string;
    plannedAmount: number;
    budgetCategoryId?: string | null;
  }): string {
    const id = `bl-${++idCounter}`;
    const now = new Date(Date.now() + idCounter).toISOString();
    db.insert(schema.workItemBudgets)
      .values({
        id,
        workItemId: opts.workItemId,
        description: null,
        plannedAmount: opts.plannedAmount,
        confidence: 'own_estimate',
        budgetCategoryId: opts.budgetCategoryId ?? null,
        budgetSourceId: null,
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
  ): string {
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

  function linkSubsidyToWorkItem(workItemId: string, subsidyProgramId: string) {
    db.insert(schema.workItemSubsidies).values({ workItemId, subsidyProgramId }).run();
  }

  function linkCategoryToSubsidy(subsidyProgramId: string, budgetCategoryId: string) {
    db.insert(schema.subsidyProgramCategories).values({ subsidyProgramId, budgetCategoryId }).run();
  }

  function insertVendor(): string {
    const id = `vendor-${++idCounter}`;
    const now = new Date(Date.now() + idCounter).toISOString();
    db.insert(schema.vendors)
      .values({ id, name: `Vendor ${id}`, createdAt: now, updatedAt: now })
      .run();
    return id;
  }

  function insertInvoice(
    budgetLineId: string,
    amount: number,
    status: 'pending' | 'paid' | 'claimed' = 'pending',
  ) {
    const vendorId = insertVendor();
    const id = `inv-${++idCounter}`;
    const now = new Date(Date.now() + idCounter).toISOString();
    db.insert(schema.invoices)
      .values({
        id,
        workItemBudgetId: budgetLineId,
        vendorId,
        invoiceNumber: null,
        amount,
        status,
        date: now.slice(0, 10),
        dueDate: null,
        notes: null,
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

  // ─── Error cases ───────────────────────────────────────────────────────────

  describe('error cases', () => {
    it('throws NotFoundError when work item does not exist', () => {
      expect(() => {
        getWorkItemSubsidyPayback(db, 'non-existent-wi');
      }).toThrow(NotFoundError);
    });

    it('throws NotFoundError with message "Work item not found"', () => {
      expect(() => {
        getWorkItemSubsidyPayback(db, 'non-existent-wi');
      }).toThrow('Work item not found');
    });
  });

  // ─── No linked subsidies ───────────────────────────────────────────────────

  describe('no linked subsidies', () => {
    it('returns totalPayback 0 and empty subsidies array when no subsidies are linked', () => {
      const workItemId = insertWorkItem();
      const result = getWorkItemSubsidyPayback(db, workItemId);

      expect(result.workItemId).toBe(workItemId);
      expect(result.totalPayback).toBe(0);
      expect(result.subsidies).toEqual([]);
    });

    it('returns totalPayback 0 when all linked subsidies are rejected', () => {
      const workItemId = insertWorkItem();
      const subsidyId = insertSubsidyProgram({
        reductionType: 'percentage',
        reductionValue: 20,
        applicationStatus: 'rejected',
      });
      linkSubsidyToWorkItem(workItemId, subsidyId);

      const result = getWorkItemSubsidyPayback(db, workItemId);

      expect(result.totalPayback).toBe(0);
      expect(result.subsidies).toHaveLength(0);
    });
  });

  // ─── Percentage subsidies ──────────────────────────────────────────────────

  describe('percentage subsidies', () => {
    it('calculates payback for universal percentage subsidy (no category filter)', () => {
      const workItemId = insertWorkItem();
      const budgetLineId = insertBudgetLine({ workItemId, plannedAmount: 1000 });
      const subsidyId = insertSubsidyProgram({ reductionType: 'percentage', reductionValue: 10 });
      linkSubsidyToWorkItem(workItemId, subsidyId);
      void budgetLineId;

      const result = getWorkItemSubsidyPayback(db, workItemId);

      expect(result.totalPayback).toBeCloseTo(100); // 1000 × 10% = 100
      expect(result.subsidies).toHaveLength(1);
      expect(result.subsidies[0].paybackAmount).toBeCloseTo(100);
    });

    it('calculates payback across multiple budget lines for universal subsidy', () => {
      const workItemId = insertWorkItem();
      insertBudgetLine({ workItemId, plannedAmount: 500 });
      insertBudgetLine({ workItemId, plannedAmount: 700 });
      const subsidyId = insertSubsidyProgram({ reductionType: 'percentage', reductionValue: 20 });
      linkSubsidyToWorkItem(workItemId, subsidyId);

      const result = getWorkItemSubsidyPayback(db, workItemId);

      // (500 + 700) × 20% = 240
      expect(result.totalPayback).toBeCloseTo(240);
    });

    it('only applies category-restricted subsidy to matching budget lines', () => {
      const workItemId = insertWorkItem();
      const cat1 = insertBudgetCategory('Electrical');
      const cat2 = insertBudgetCategory('Plumbing');
      insertBudgetLine({ workItemId, plannedAmount: 1000, budgetCategoryId: cat1 }); // matches
      insertBudgetLine({ workItemId, plannedAmount: 500, budgetCategoryId: cat2 }); // does not match

      const subsidyId = insertSubsidyProgram({ reductionType: 'percentage', reductionValue: 10 });
      linkCategoryToSubsidy(subsidyId, cat1);
      linkSubsidyToWorkItem(workItemId, subsidyId);

      const result = getWorkItemSubsidyPayback(db, workItemId);

      // Only cat1 line matches: 1000 × 10% = 100
      expect(result.totalPayback).toBeCloseTo(100);
    });

    it('skips budget lines with no category when subsidy is category-restricted', () => {
      const workItemId = insertWorkItem();
      const cat1 = insertBudgetCategory('Electrical');
      insertBudgetLine({ workItemId, plannedAmount: 1000, budgetCategoryId: null }); // no category — no match
      insertBudgetLine({ workItemId, plannedAmount: 500, budgetCategoryId: cat1 }); // matches

      const subsidyId = insertSubsidyProgram({ reductionType: 'percentage', reductionValue: 10 });
      linkCategoryToSubsidy(subsidyId, cat1);
      linkSubsidyToWorkItem(workItemId, subsidyId);

      const result = getWorkItemSubsidyPayback(db, workItemId);

      // Only cat1 line matches: 500 × 10% = 50
      expect(result.totalPayback).toBeCloseTo(50);
    });

    it('uses invoiced cost (effectiveAmount) instead of plannedAmount when invoices exist', () => {
      const workItemId = insertWorkItem();
      const budgetLineId = insertBudgetLine({ workItemId, plannedAmount: 1000 });
      insertInvoice(budgetLineId, 800); // actual cost = 800

      const subsidyId = insertSubsidyProgram({ reductionType: 'percentage', reductionValue: 10 });
      linkSubsidyToWorkItem(workItemId, subsidyId);

      const result = getWorkItemSubsidyPayback(db, workItemId);

      // Uses invoiced cost: 800 × 10% = 80 (not 1000 × 10% = 100)
      expect(result.totalPayback).toBeCloseTo(80);
    });

    it('sums multiple invoices for the same budget line as effectiveAmount', () => {
      const workItemId = insertWorkItem();
      const budgetLineId = insertBudgetLine({ workItemId, plannedAmount: 2000 });
      insertInvoice(budgetLineId, 600);
      insertInvoice(budgetLineId, 400); // total: 1000

      const subsidyId = insertSubsidyProgram({ reductionType: 'percentage', reductionValue: 10 });
      linkSubsidyToWorkItem(workItemId, subsidyId);

      const result = getWorkItemSubsidyPayback(db, workItemId);

      // 1000 × 10% = 100
      expect(result.totalPayback).toBeCloseTo(100);
    });

    it('returns paybackAmount 0 when no budget lines match the category restriction', () => {
      const workItemId = insertWorkItem();
      const cat1 = insertBudgetCategory('Electrical');
      const cat2 = insertBudgetCategory('Plumbing');
      insertBudgetLine({ workItemId, plannedAmount: 1000, budgetCategoryId: cat2 }); // no match

      const subsidyId = insertSubsidyProgram({ reductionType: 'percentage', reductionValue: 10 });
      linkCategoryToSubsidy(subsidyId, cat1);
      linkSubsidyToWorkItem(workItemId, subsidyId);

      const result = getWorkItemSubsidyPayback(db, workItemId);

      expect(result.totalPayback).toBe(0);
      expect(result.subsidies[0].paybackAmount).toBe(0);
    });

    it('returns paybackAmount 0 when work item has no budget lines', () => {
      const workItemId = insertWorkItem();
      const subsidyId = insertSubsidyProgram({ reductionType: 'percentage', reductionValue: 15 });
      linkSubsidyToWorkItem(workItemId, subsidyId);

      const result = getWorkItemSubsidyPayback(db, workItemId);

      expect(result.totalPayback).toBe(0);
      expect(result.subsidies[0].paybackAmount).toBe(0);
    });
  });

  // ─── Fixed subsidies ───────────────────────────────────────────────────────

  describe('fixed subsidies', () => {
    it('returns the reductionValue as paybackAmount for a fixed subsidy', () => {
      const workItemId = insertWorkItem();
      const subsidyId = insertSubsidyProgram({ reductionType: 'fixed', reductionValue: 5000 });
      linkSubsidyToWorkItem(workItemId, subsidyId);

      const result = getWorkItemSubsidyPayback(db, workItemId);

      expect(result.totalPayback).toBe(5000);
      expect(result.subsidies[0].paybackAmount).toBe(5000);
    });

    it('returns fixed amount even when work item has no budget lines', () => {
      const workItemId = insertWorkItem();
      const subsidyId = insertSubsidyProgram({ reductionType: 'fixed', reductionValue: 2000 });
      linkSubsidyToWorkItem(workItemId, subsidyId);

      const result = getWorkItemSubsidyPayback(db, workItemId);

      expect(result.totalPayback).toBe(2000);
    });

    it('returns fixed amount regardless of budget line amounts', () => {
      const workItemId = insertWorkItem();
      insertBudgetLine({ workItemId, plannedAmount: 100000 });
      const subsidyId = insertSubsidyProgram({ reductionType: 'fixed', reductionValue: 3000 });
      linkSubsidyToWorkItem(workItemId, subsidyId);

      const result = getWorkItemSubsidyPayback(db, workItemId);

      expect(result.totalPayback).toBe(3000);
    });
  });

  // ─── Multiple subsidies ────────────────────────────────────────────────────

  describe('multiple subsidies', () => {
    it('sums payback from multiple subsidies', () => {
      const workItemId = insertWorkItem();
      insertBudgetLine({ workItemId, plannedAmount: 1000 });

      const sp1 = insertSubsidyProgram({ reductionType: 'percentage', reductionValue: 10 }); // 100
      const sp2 = insertSubsidyProgram({ reductionType: 'fixed', reductionValue: 500 }); // 500
      linkSubsidyToWorkItem(workItemId, sp1);
      linkSubsidyToWorkItem(workItemId, sp2);

      const result = getWorkItemSubsidyPayback(db, workItemId);

      expect(result.totalPayback).toBeCloseTo(600); // 100 + 500
      expect(result.subsidies).toHaveLength(2);
    });

    it('excludes rejected subsidies from calculation', () => {
      const workItemId = insertWorkItem();
      insertBudgetLine({ workItemId, plannedAmount: 1000 });

      const sp1 = insertSubsidyProgram({
        reductionType: 'percentage',
        reductionValue: 10,
        applicationStatus: 'approved',
      }); // 100
      const sp2 = insertSubsidyProgram({
        reductionType: 'percentage',
        reductionValue: 20,
        applicationStatus: 'rejected',
      }); // excluded
      linkSubsidyToWorkItem(workItemId, sp1);
      linkSubsidyToWorkItem(workItemId, sp2);

      const result = getWorkItemSubsidyPayback(db, workItemId);

      expect(result.totalPayback).toBeCloseTo(100);
      expect(result.subsidies).toHaveLength(1);
    });

    it('includes subsidies with all non-rejected statuses (eligible, applied, approved, received)', () => {
      const workItemId = insertWorkItem();
      insertBudgetLine({ workItemId, plannedAmount: 1000 });

      const statuses = ['eligible', 'applied', 'approved', 'received'] as const;
      for (const status of statuses) {
        const sp = insertSubsidyProgram({
          reductionType: 'fixed',
          reductionValue: 100,
          applicationStatus: status,
        });
        linkSubsidyToWorkItem(workItemId, sp);
      }

      const result = getWorkItemSubsidyPayback(db, workItemId);

      expect(result.subsidies).toHaveLength(4);
      expect(result.totalPayback).toBe(400);
    });
  });

  // ─── Response shape ────────────────────────────────────────────────────────

  describe('response shape', () => {
    it('returns the correct workItemId in the response', () => {
      const workItemId = insertWorkItem();
      const subsidyId = insertSubsidyProgram();
      linkSubsidyToWorkItem(workItemId, subsidyId);

      const result = getWorkItemSubsidyPayback(db, workItemId);

      expect(result.workItemId).toBe(workItemId);
    });

    it('returns subsidy entry with all required fields', () => {
      const workItemId = insertWorkItem();
      insertBudgetLine({ workItemId, plannedAmount: 1000 });
      const subsidyId = insertSubsidyProgram({
        name: 'Solar Rebate',
        reductionType: 'percentage',
        reductionValue: 15,
      });
      linkSubsidyToWorkItem(workItemId, subsidyId);

      const result = getWorkItemSubsidyPayback(db, workItemId);

      const entry = result.subsidies[0];
      expect(entry.subsidyProgramId).toBe(subsidyId);
      expect(entry.name).toBe('Solar Rebate');
      expect(entry.reductionType).toBe('percentage');
      expect(entry.reductionValue).toBe(15);
      expect(typeof entry.paybackAmount).toBe('number');
    });

    it('does not include data from a different work item', () => {
      const workItemId1 = insertWorkItem('WI 1');
      const workItemId2 = insertWorkItem('WI 2');
      insertBudgetLine({ workItemId: workItemId1, plannedAmount: 1000 });
      insertBudgetLine({ workItemId: workItemId2, plannedAmount: 5000 });

      const subsidyId = insertSubsidyProgram({ reductionType: 'percentage', reductionValue: 10 });
      linkSubsidyToWorkItem(workItemId1, subsidyId);

      const result = getWorkItemSubsidyPayback(db, workItemId1);

      // Should only use workItemId1 budget lines (1000 × 10% = 100), not workItemId2 (5000)
      expect(result.totalPayback).toBeCloseTo(100);
    });
  });
});
