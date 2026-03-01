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
    confidence?: 'own_estimate' | 'professional_estimate' | 'quote' | 'invoice';
  }): string {
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
    it('returns minTotalPayback 0, maxTotalPayback 0 and empty subsidies array when no subsidies are linked', () => {
      const workItemId = insertWorkItem();
      const result = getWorkItemSubsidyPayback(db, workItemId);

      expect(result.workItemId).toBe(workItemId);
      expect(result.minTotalPayback).toBe(0);
      expect(result.maxTotalPayback).toBe(0);
      expect(result.subsidies).toEqual([]);
    });

    it('returns 0 totals when all linked subsidies are rejected', () => {
      const workItemId = insertWorkItem();
      const subsidyId = insertSubsidyProgram({
        reductionType: 'percentage',
        reductionValue: 20,
        applicationStatus: 'rejected',
      });
      linkSubsidyToWorkItem(workItemId, subsidyId);

      const result = getWorkItemSubsidyPayback(db, workItemId);

      expect(result.minTotalPayback).toBe(0);
      expect(result.maxTotalPayback).toBe(0);
      expect(result.subsidies).toHaveLength(0);
    });
  });

  // ─── Confidence margin ranges (non-invoiced lines) ─────────────────────────

  describe('confidence margin ranges', () => {
    it('applies own_estimate margin (±20%) to produce min/max range', () => {
      const workItemId = insertWorkItem();
      insertBudgetLine({ workItemId, plannedAmount: 1000, confidence: 'own_estimate' });
      const subsidyId = insertSubsidyProgram({ reductionType: 'percentage', reductionValue: 10 });
      linkSubsidyToWorkItem(workItemId, subsidyId);

      const result = getWorkItemSubsidyPayback(db, workItemId);

      // min: 1000 * 0.80 * 10% = 80, max: 1000 * 1.20 * 10% = 120
      expect(result.minTotalPayback).toBeCloseTo(80);
      expect(result.maxTotalPayback).toBeCloseTo(120);
      expect(result.subsidies[0].minPayback).toBeCloseTo(80);
      expect(result.subsidies[0].maxPayback).toBeCloseTo(120);
    });

    it('applies professional_estimate margin (±10%) to produce min/max range', () => {
      const workItemId = insertWorkItem();
      insertBudgetLine({ workItemId, plannedAmount: 1000, confidence: 'professional_estimate' });
      const subsidyId = insertSubsidyProgram({ reductionType: 'percentage', reductionValue: 10 });
      linkSubsidyToWorkItem(workItemId, subsidyId);

      const result = getWorkItemSubsidyPayback(db, workItemId);

      // min: 1000 * 0.90 * 10% = 90, max: 1000 * 1.10 * 10% = 110
      expect(result.minTotalPayback).toBeCloseTo(90);
      expect(result.maxTotalPayback).toBeCloseTo(110);
    });

    it('applies quote margin (±5%) to produce min/max range', () => {
      const workItemId = insertWorkItem();
      insertBudgetLine({ workItemId, plannedAmount: 1000, confidence: 'quote' });
      const subsidyId = insertSubsidyProgram({ reductionType: 'percentage', reductionValue: 10 });
      linkSubsidyToWorkItem(workItemId, subsidyId);

      const result = getWorkItemSubsidyPayback(db, workItemId);

      // min: 1000 * 0.95 * 10% = 95, max: 1000 * 1.05 * 10% = 105
      expect(result.minTotalPayback).toBeCloseTo(95);
      expect(result.maxTotalPayback).toBeCloseTo(105);
    });

    it('applies invoice confidence (±0%) so min === max === planned amount', () => {
      const workItemId = insertWorkItem();
      insertBudgetLine({ workItemId, plannedAmount: 1000, confidence: 'invoice' });
      const subsidyId = insertSubsidyProgram({ reductionType: 'percentage', reductionValue: 10 });
      linkSubsidyToWorkItem(workItemId, subsidyId);

      const result = getWorkItemSubsidyPayback(db, workItemId);

      // margin = 0: min = max = 1000 * 10% = 100
      expect(result.minTotalPayback).toBeCloseTo(100);
      expect(result.maxTotalPayback).toBeCloseTo(100);
    });

    it('sums min/max across multiple budget lines with different confidence levels', () => {
      const workItemId = insertWorkItem();
      // own_estimate: min=400, max=600 @ 10%
      insertBudgetLine({ workItemId, plannedAmount: 500, confidence: 'own_estimate' });
      // professional_estimate: min=450, max=550 @ 10%
      insertBudgetLine({ workItemId, plannedAmount: 500, confidence: 'professional_estimate' });

      const subsidyId = insertSubsidyProgram({ reductionType: 'percentage', reductionValue: 10 });
      linkSubsidyToWorkItem(workItemId, subsidyId);

      const result = getWorkItemSubsidyPayback(db, workItemId);

      // own_estimate line: min=500*0.8*0.1=40, max=500*1.2*0.1=60
      // professional_estimate line: min=500*0.9*0.1=45, max=500*1.1*0.1=55
      // totals: min=85, max=115
      expect(result.minTotalPayback).toBeCloseTo(85);
      expect(result.maxTotalPayback).toBeCloseTo(115);
    });
  });

  // ─── Invoiced lines (min === max) ──────────────────────────────────────────

  describe('invoiced lines (actual cost known)', () => {
    it('uses actual invoiced cost for min and max when invoices exist (min === max)', () => {
      const workItemId = insertWorkItem();
      const budgetLineId = insertBudgetLine({
        workItemId,
        plannedAmount: 1000,
        confidence: 'own_estimate',
      });
      insertInvoice(budgetLineId, 800); // actual cost = 800

      const subsidyId = insertSubsidyProgram({ reductionType: 'percentage', reductionValue: 10 });
      linkSubsidyToWorkItem(workItemId, subsidyId);

      const result = getWorkItemSubsidyPayback(db, workItemId);

      // Actual cost 800, no margin: min = max = 800 * 10% = 80
      expect(result.minTotalPayback).toBeCloseTo(80);
      expect(result.maxTotalPayback).toBeCloseTo(80);
      expect(result.subsidies[0].minPayback).toBeCloseTo(80);
      expect(result.subsidies[0].maxPayback).toBeCloseTo(80);
    });

    it('sums multiple invoices for the same budget line as actual cost (min === max)', () => {
      const workItemId = insertWorkItem();
      const budgetLineId = insertBudgetLine({
        workItemId,
        plannedAmount: 2000,
        confidence: 'own_estimate',
      });
      insertInvoice(budgetLineId, 600);
      insertInvoice(budgetLineId, 400); // total: 1000

      const subsidyId = insertSubsidyProgram({ reductionType: 'percentage', reductionValue: 10 });
      linkSubsidyToWorkItem(workItemId, subsidyId);

      const result = getWorkItemSubsidyPayback(db, workItemId);

      // 1000 × 10% = 100, no margin
      expect(result.minTotalPayback).toBeCloseTo(100);
      expect(result.maxTotalPayback).toBeCloseTo(100);
    });

    it('produces min < max when some lines invoiced and some not (mixed scenario)', () => {
      const workItemId = insertWorkItem();
      // Invoiced line: actual cost 500
      const invoicedLine = insertBudgetLine({
        workItemId,
        plannedAmount: 1000,
        confidence: 'own_estimate',
      });
      insertInvoice(invoicedLine, 500);
      // Non-invoiced line: own_estimate, planned 1000
      insertBudgetLine({ workItemId, plannedAmount: 1000, confidence: 'own_estimate' });

      const subsidyId = insertSubsidyProgram({ reductionType: 'percentage', reductionValue: 10 });
      linkSubsidyToWorkItem(workItemId, subsidyId);

      const result = getWorkItemSubsidyPayback(db, workItemId);

      // Invoiced: min=max=500*10%=50
      // Non-invoiced (own_estimate ±20%): min=1000*0.8*10%=80, max=1000*1.2*10%=120
      // Total: min=130, max=170
      expect(result.minTotalPayback).toBeCloseTo(130);
      expect(result.maxTotalPayback).toBeCloseTo(170);
    });
  });

  // ─── Percentage subsidies ──────────────────────────────────────────────────

  describe('percentage subsidies', () => {
    it('calculates payback range for universal percentage subsidy (no category filter)', () => {
      const workItemId = insertWorkItem();
      insertBudgetLine({ workItemId, plannedAmount: 1000, confidence: 'own_estimate' });
      const subsidyId = insertSubsidyProgram({ reductionType: 'percentage', reductionValue: 10 });
      linkSubsidyToWorkItem(workItemId, subsidyId);

      const result = getWorkItemSubsidyPayback(db, workItemId);

      // own_estimate ±20%: min=1000*0.8*10%=80, max=1000*1.2*10%=120
      expect(result.minTotalPayback).toBeCloseTo(80);
      expect(result.maxTotalPayback).toBeCloseTo(120);
      expect(result.subsidies).toHaveLength(1);
    });

    it('only applies category-restricted subsidy to matching budget lines', () => {
      const workItemId = insertWorkItem();
      const cat1 = insertBudgetCategory('Electrical');
      const cat2 = insertBudgetCategory('Plumbing');
      // own_estimate ±20%: matched line min=800, max=1200
      insertBudgetLine({
        workItemId,
        plannedAmount: 1000,
        budgetCategoryId: cat1,
        confidence: 'own_estimate',
      });
      // does not match — excluded
      insertBudgetLine({
        workItemId,
        plannedAmount: 500,
        budgetCategoryId: cat2,
        confidence: 'own_estimate',
      });

      const subsidyId = insertSubsidyProgram({ reductionType: 'percentage', reductionValue: 10 });
      linkCategoryToSubsidy(subsidyId, cat1);
      linkSubsidyToWorkItem(workItemId, subsidyId);

      const result = getWorkItemSubsidyPayback(db, workItemId);

      // Only cat1 line: min=1000*0.8*10%=80, max=1000*1.2*10%=120
      expect(result.minTotalPayback).toBeCloseTo(80);
      expect(result.maxTotalPayback).toBeCloseTo(120);
    });

    it('skips budget lines with no category when subsidy is category-restricted', () => {
      const workItemId = insertWorkItem();
      const cat1 = insertBudgetCategory('Electrical');
      // no category — excluded
      insertBudgetLine({
        workItemId,
        plannedAmount: 1000,
        budgetCategoryId: null,
        confidence: 'own_estimate',
      });
      // matches
      insertBudgetLine({
        workItemId,
        plannedAmount: 500,
        budgetCategoryId: cat1,
        confidence: 'own_estimate',
      });

      const subsidyId = insertSubsidyProgram({ reductionType: 'percentage', reductionValue: 10 });
      linkCategoryToSubsidy(subsidyId, cat1);
      linkSubsidyToWorkItem(workItemId, subsidyId);

      const result = getWorkItemSubsidyPayback(db, workItemId);

      // Only cat1 line: min=500*0.8*10%=40, max=500*1.2*10%=60
      expect(result.minTotalPayback).toBeCloseTo(40);
      expect(result.maxTotalPayback).toBeCloseTo(60);
    });

    it('returns 0 min/max when no budget lines match the category restriction', () => {
      const workItemId = insertWorkItem();
      const cat1 = insertBudgetCategory('Electrical');
      const cat2 = insertBudgetCategory('Plumbing');
      insertBudgetLine({
        workItemId,
        plannedAmount: 1000,
        budgetCategoryId: cat2,
        confidence: 'own_estimate',
      }); // no match

      const subsidyId = insertSubsidyProgram({ reductionType: 'percentage', reductionValue: 10 });
      linkCategoryToSubsidy(subsidyId, cat1);
      linkSubsidyToWorkItem(workItemId, subsidyId);

      const result = getWorkItemSubsidyPayback(db, workItemId);

      expect(result.minTotalPayback).toBe(0);
      expect(result.maxTotalPayback).toBe(0);
      expect(result.subsidies[0].minPayback).toBe(0);
      expect(result.subsidies[0].maxPayback).toBe(0);
    });

    it('returns 0 min/max when work item has no budget lines', () => {
      const workItemId = insertWorkItem();
      const subsidyId = insertSubsidyProgram({ reductionType: 'percentage', reductionValue: 15 });
      linkSubsidyToWorkItem(workItemId, subsidyId);

      const result = getWorkItemSubsidyPayback(db, workItemId);

      expect(result.minTotalPayback).toBe(0);
      expect(result.maxTotalPayback).toBe(0);
      expect(result.subsidies[0].minPayback).toBe(0);
      expect(result.subsidies[0].maxPayback).toBe(0);
    });
  });

  // ─── Fixed subsidies ───────────────────────────────────────────────────────

  describe('fixed subsidies', () => {
    it('returns the reductionValue as minPayback and maxPayback (min === max) for a fixed subsidy', () => {
      const workItemId = insertWorkItem();
      const subsidyId = insertSubsidyProgram({ reductionType: 'fixed', reductionValue: 5000 });
      linkSubsidyToWorkItem(workItemId, subsidyId);

      const result = getWorkItemSubsidyPayback(db, workItemId);

      expect(result.minTotalPayback).toBe(5000);
      expect(result.maxTotalPayback).toBe(5000);
      expect(result.subsidies[0].minPayback).toBe(5000);
      expect(result.subsidies[0].maxPayback).toBe(5000);
    });

    it('returns fixed amount even when work item has no budget lines', () => {
      const workItemId = insertWorkItem();
      const subsidyId = insertSubsidyProgram({ reductionType: 'fixed', reductionValue: 2000 });
      linkSubsidyToWorkItem(workItemId, subsidyId);

      const result = getWorkItemSubsidyPayback(db, workItemId);

      expect(result.minTotalPayback).toBe(2000);
      expect(result.maxTotalPayback).toBe(2000);
    });

    it('returns fixed amount regardless of budget line amounts', () => {
      const workItemId = insertWorkItem();
      insertBudgetLine({ workItemId, plannedAmount: 100000, confidence: 'own_estimate' });
      const subsidyId = insertSubsidyProgram({ reductionType: 'fixed', reductionValue: 3000 });
      linkSubsidyToWorkItem(workItemId, subsidyId);

      const result = getWorkItemSubsidyPayback(db, workItemId);

      expect(result.minTotalPayback).toBe(3000);
      expect(result.maxTotalPayback).toBe(3000);
    });
  });

  // ─── Multiple subsidies ────────────────────────────────────────────────────

  describe('multiple subsidies', () => {
    it('sums min/max payback from multiple subsidies', () => {
      const workItemId = insertWorkItem();
      insertBudgetLine({ workItemId, plannedAmount: 1000, confidence: 'own_estimate' });

      // percentage: min=1000*0.8*10%=80, max=1000*1.2*10%=120
      const sp1 = insertSubsidyProgram({ reductionType: 'percentage', reductionValue: 10 });
      // fixed: min=max=500
      const sp2 = insertSubsidyProgram({ reductionType: 'fixed', reductionValue: 500 });
      linkSubsidyToWorkItem(workItemId, sp1);
      linkSubsidyToWorkItem(workItemId, sp2);

      const result = getWorkItemSubsidyPayback(db, workItemId);

      expect(result.minTotalPayback).toBeCloseTo(580); // 80 + 500
      expect(result.maxTotalPayback).toBeCloseTo(620); // 120 + 500
      expect(result.subsidies).toHaveLength(2);
    });

    it('excludes rejected subsidies from calculation', () => {
      const workItemId = insertWorkItem();
      insertBudgetLine({ workItemId, plannedAmount: 1000, confidence: 'own_estimate' });

      // approved: min=80, max=120
      const sp1 = insertSubsidyProgram({
        reductionType: 'percentage',
        reductionValue: 10,
        applicationStatus: 'approved',
      });
      // rejected: excluded
      const sp2 = insertSubsidyProgram({
        reductionType: 'percentage',
        reductionValue: 20,
        applicationStatus: 'rejected',
      });
      linkSubsidyToWorkItem(workItemId, sp1);
      linkSubsidyToWorkItem(workItemId, sp2);

      const result = getWorkItemSubsidyPayback(db, workItemId);

      expect(result.minTotalPayback).toBeCloseTo(80);
      expect(result.maxTotalPayback).toBeCloseTo(120);
      expect(result.subsidies).toHaveLength(1);
    });

    it('includes subsidies with all non-rejected statuses (eligible, applied, approved, received)', () => {
      const workItemId = insertWorkItem();
      insertBudgetLine({ workItemId, plannedAmount: 1000, confidence: 'own_estimate' });

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
      expect(result.minTotalPayback).toBe(400);
      expect(result.maxTotalPayback).toBe(400);
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

    it('returns subsidy entry with all required fields including minPayback and maxPayback', () => {
      const workItemId = insertWorkItem();
      insertBudgetLine({ workItemId, plannedAmount: 1000, confidence: 'own_estimate' });
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
      expect(typeof entry.minPayback).toBe('number');
      expect(typeof entry.maxPayback).toBe('number');
      // own_estimate ±20%: min=1000*0.8*15%=120, max=1000*1.2*15%=180
      expect(entry.minPayback).toBeCloseTo(120);
      expect(entry.maxPayback).toBeCloseTo(180);
    });

    it('does not include data from a different work item', () => {
      const workItemId1 = insertWorkItem('WI 1');
      const workItemId2 = insertWorkItem('WI 2');
      insertBudgetLine({ workItemId: workItemId1, plannedAmount: 1000, confidence: 'invoice' });
      insertBudgetLine({ workItemId: workItemId2, plannedAmount: 5000, confidence: 'invoice' });

      const subsidyId = insertSubsidyProgram({ reductionType: 'percentage', reductionValue: 10 });
      linkSubsidyToWorkItem(workItemId1, subsidyId);

      const result = getWorkItemSubsidyPayback(db, workItemId1);

      // invoice confidence: margin=0, so min=max=1000*10%=100
      expect(result.minTotalPayback).toBeCloseTo(100);
      expect(result.maxTotalPayback).toBeCloseTo(100);
    });
  });
});
