import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import { getBudgetOverview } from './budgetOverviewService.js';

/**
 * Tests for EPIC-15 Story 15.2: itemized invoice amounts as cost basis for subsidy reductions.
 *
 * When a budget line has invoices linked via invoice_budget_lines, the subsidy reduction
 * is computed using the invoiced amount (sum of itemized_amount) as the cost basis instead
 * of the plannedAmount. This applies to both percentage and fixed subsidies.
 */
describe('getBudgetOverview — subsidy recalculation with invoice cost basis (EPIC-15)', () => {
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

  function insertTestUser(userId = 'user-test-001') {
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

  function insertBudgetCategory(name?: string): string {
    const id = `cat-test-${idCounter++}`;
    const now = new Date().toISOString();
    db.insert(schema.budgetCategories)
      .values({
        id,
        name: name ?? `TestCat-${id}`,
        description: null,
        color: null,
        sortOrder: 200 + idCounter,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  /**
   * Insert a work item with a single budget line. Returns workItemId and budgetLineId.
   * Does NOT create invoices — use insertInvoiceForBudgetLine to attach invoices.
   */
  function insertWorkItemWithBudget(opts: {
    plannedAmount: number;
    confidence?: 'own_estimate' | 'professional_estimate' | 'quote' | 'invoice';
    budgetCategoryId?: string | null;
  }): { workItemId: string; budgetLineId: string } {
    const id = `wi-test-${idCounter++}`;
    const now = new Date().toISOString();
    db.insert(schema.workItems)
      .values({
        id,
        title: `Work Item ${id}`,
        status: 'not_started',
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const budgetId = `bud-test-${idCounter++}`;
    db.insert(schema.workItemBudgets)
      .values({
        id: budgetId,
        workItemId: id,
        plannedAmount: opts.plannedAmount,
        confidence: opts.confidence ?? 'invoice', // invoice = 0% margin so planned == min == max
        budgetCategoryId: opts.budgetCategoryId ?? null,
        budgetSourceId: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    return { workItemId: id, budgetLineId: budgetId };
  }

  /**
   * Insert a vendor + invoice and link it to a budget line via invoice_budget_lines.
   * Returns the invoiceId.
   */
  function insertInvoiceForBudgetLine(opts: {
    budgetLineId: string;
    itemizedAmount: number;
    status?: 'pending' | 'paid' | 'claimed';
  }): string {
    const now = new Date().toISOString();
    const vendorId = `vendor-${idCounter++}`;
    db.insert(schema.vendors)
      .values({ id: vendorId, name: `Vendor ${vendorId}`, createdAt: now, updatedAt: now })
      .run();
    const invoiceId = `inv-${idCounter++}`;
    db.insert(schema.invoices)
      .values({
        id: invoiceId,
        vendorId,
        amount: opts.itemizedAmount,
        date: '2026-01-01',
        status: opts.status ?? 'paid',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    db.insert(schema.invoiceBudgetLines)
      .values({
        id: randomUUID(),
        invoiceId,
        workItemBudgetId: opts.budgetLineId,
        itemizedAmount: opts.itemizedAmount,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return invoiceId;
  }

  function insertSubsidyProgram(opts: {
    reductionType: 'percentage' | 'fixed';
    reductionValue: number;
    applicationStatus?: 'eligible' | 'applied' | 'approved' | 'received' | 'rejected';
    categoryIds?: string[];
  }): string {
    const id = `prog-test-${idCounter++}`;
    const now = new Date().toISOString();
    db.insert(schema.subsidyPrograms)
      .values({
        id,
        name: `Subsidy Program ${id}`,
        reductionType: opts.reductionType,
        reductionValue: opts.reductionValue,
        applicationStatus: opts.applicationStatus ?? 'eligible',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    if (opts.categoryIds && opts.categoryIds.length > 0) {
      for (const catId of opts.categoryIds) {
        db.insert(schema.subsidyProgramCategories)
          .values({ subsidyProgramId: id, budgetCategoryId: catId })
          .run();
      }
    }
    return id;
  }

  function linkWorkItemSubsidy(workItemId: string, subsidyProgramId: string) {
    db.insert(schema.workItemSubsidies).values({ workItemId, subsidyProgramId }).run();
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

  // ─── Percentage subsidies ─────────────────────────────────────────────────

  it('percentage subsidy with invoiced line: uses invoiced amount as cost basis (less than planned)', () => {
    // plannedAmount=1000, invoiced at 800, 10% subsidy → reduction=80 (not 100)
    const catId = insertBudgetCategory('Cat-A');
    const { workItemId, budgetLineId } = insertWorkItemWithBudget({
      plannedAmount: 1000,
      budgetCategoryId: catId,
    });
    insertInvoiceForBudgetLine({ budgetLineId, itemizedAmount: 800 });
    const progId = insertSubsidyProgram({ reductionType: 'percentage', reductionValue: 10 });
    linkWorkItemSubsidy(workItemId, progId);

    const result = getBudgetOverview(db);

    expect(result.subsidySummary.totalReductions).toBeCloseTo(80, 5);
  });

  it('percentage subsidy with invoiced amount larger than planned: uses invoiced amount as cost basis', () => {
    // plannedAmount=1000, invoiced at 1200, 10% → reduction=120
    const catId = insertBudgetCategory('Cat-B');
    const { workItemId, budgetLineId } = insertWorkItemWithBudget({
      plannedAmount: 1000,
      budgetCategoryId: catId,
    });
    insertInvoiceForBudgetLine({ budgetLineId, itemizedAmount: 1200 });
    const progId = insertSubsidyProgram({ reductionType: 'percentage', reductionValue: 10 });
    linkWorkItemSubsidy(workItemId, progId);

    const result = getBudgetOverview(db);

    expect(result.subsidySummary.totalReductions).toBeCloseTo(120, 5);
  });

  it('percentage subsidy with non-invoiced line: falls back to plannedAmount (backward-compatible)', () => {
    // plannedAmount=1000, no invoice, 10% → reduction=100
    const catId = insertBudgetCategory('Cat-C');
    const { workItemId } = insertWorkItemWithBudget({
      plannedAmount: 1000,
      budgetCategoryId: catId,
    });
    // No invoice inserted
    const progId = insertSubsidyProgram({ reductionType: 'percentage', reductionValue: 10 });
    linkWorkItemSubsidy(workItemId, progId);

    const result = getBudgetOverview(db);

    expect(result.subsidySummary.totalReductions).toBeCloseTo(100, 5);
  });

  it('category-scoped percentage subsidy: only applies to lines in matching category', () => {
    // 2 lines in different categories; subsidy only on cat1.
    // line1: cat1, invoiced at 600 → reduction=60 (10%)
    // line2: cat2, no subsidy → reduction=0
    const cat1 = insertBudgetCategory('Cat1');
    const cat2 = insertBudgetCategory('Cat2');

    const { workItemId: wi1, budgetLineId: bl1 } = insertWorkItemWithBudget({
      plannedAmount: 1000,
      budgetCategoryId: cat1,
    });
    insertInvoiceForBudgetLine({ budgetLineId: bl1, itemizedAmount: 600 });

    const { workItemId: wi2 } = insertWorkItemWithBudget({
      plannedAmount: 500,
      budgetCategoryId: cat2,
    });

    // Subsidy applies only to cat1
    const progId = insertSubsidyProgram({
      reductionType: 'percentage',
      reductionValue: 10,
      categoryIds: [cat1],
    });
    linkWorkItemSubsidy(wi1, progId);
    linkWorkItemSubsidy(wi2, progId);

    const result = getBudgetOverview(db);

    // Only line in cat1 gets reduction: 600 * 10% = 60
    expect(result.subsidySummary.totalReductions).toBeCloseTo(60, 5);
  });

  it('mixed invoiced and non-invoiced lines: each uses correct cost basis', () => {
    // lineA: invoiced at 800, 10% → 80
    // lineB: not invoiced, plannedAmount=500, 10% → 50
    // total = 130
    const catId = insertBudgetCategory('Cat-Mix');

    const { workItemId: wiA, budgetLineId: blA } = insertWorkItemWithBudget({
      plannedAmount: 1000,
      budgetCategoryId: catId,
    });
    insertInvoiceForBudgetLine({ budgetLineId: blA, itemizedAmount: 800 });

    const { workItemId: wiB } = insertWorkItemWithBudget({
      plannedAmount: 500,
      budgetCategoryId: catId,
    });
    // wiB has no invoice

    const progId = insertSubsidyProgram({ reductionType: 'percentage', reductionValue: 10 });
    linkWorkItemSubsidy(wiA, progId);
    linkWorkItemSubsidy(wiB, progId);

    const result = getBudgetOverview(db);

    expect(result.subsidySummary.totalReductions).toBeCloseTo(130, 5);
  });

  // ─── Fixed subsidies ──────────────────────────────────────────────────────

  it('fixed subsidy: capped at itemized amount when itemized amount is smaller than per-line share', () => {
    // plannedAmount=10000, invoiced at 50, fixed subsidy=1000 → reduction=min(1000,50)=50
    const catId = insertBudgetCategory('Cat-Fixed-Cap');
    const { workItemId, budgetLineId } = insertWorkItemWithBudget({
      plannedAmount: 10000,
      budgetCategoryId: catId,
    });
    insertInvoiceForBudgetLine({ budgetLineId, itemizedAmount: 50 });
    const progId = insertSubsidyProgram({ reductionType: 'fixed', reductionValue: 1000 });
    linkWorkItemSubsidy(workItemId, progId);

    const result = getBudgetOverview(db);

    // perLineAmount = 1000/1 = 1000; costBasis = 50; min(1000, 50) = 50
    expect(result.subsidySummary.totalReductions).toBeCloseTo(50, 5);
  });

  it('fixed subsidy: NOT capped when itemized amount exceeds per-line share', () => {
    // plannedAmount=5000, invoiced at 2000, fixed=500 → reduction=500 (not capped)
    const catId = insertBudgetCategory('Cat-Fixed-NoCap');
    const { workItemId, budgetLineId } = insertWorkItemWithBudget({
      plannedAmount: 5000,
      budgetCategoryId: catId,
    });
    insertInvoiceForBudgetLine({ budgetLineId, itemizedAmount: 2000 });
    const progId = insertSubsidyProgram({ reductionType: 'fixed', reductionValue: 500 });
    linkWorkItemSubsidy(workItemId, progId);

    const result = getBudgetOverview(db);

    // perLineAmount = 500/1 = 500; costBasis = 2000; min(500, 2000) = 500
    expect(result.subsidySummary.totalReductions).toBeCloseTo(500, 5);
  });

  it('fixed subsidy with non-invoiced line: uses plannedAmount as cost basis', () => {
    // plannedAmount=5000, no invoice, fixed=500 → reduction=min(500,5000)=500
    const catId = insertBudgetCategory('Cat-Fixed-NoInv');
    const { workItemId } = insertWorkItemWithBudget({
      plannedAmount: 5000,
      budgetCategoryId: catId,
    });
    // No invoice
    const progId = insertSubsidyProgram({ reductionType: 'fixed', reductionValue: 500 });
    linkWorkItemSubsidy(workItemId, progId);

    const result = getBudgetOverview(db);

    // perLineAmount = 500/1 = 500; costBasis = 5000; min(500, 5000) = 500
    expect(result.subsidySummary.totalReductions).toBeCloseTo(500, 5);
  });

  // ─── Aggregation across multiple items ────────────────────────────────────

  it('totalReductions aggregates correctly across items with mixed invoice states', () => {
    // workItem1: invoiced at 600, 10% percentage subsidy → 60
    // workItem2: no invoice, plannedAmount=400, 10% percentage subsidy → 40
    // expected totalReductions = 100
    const catId = insertBudgetCategory('Cat-Agg');

    const { workItemId: wi1, budgetLineId: bl1 } = insertWorkItemWithBudget({
      plannedAmount: 1000,
      budgetCategoryId: catId,
    });
    insertInvoiceForBudgetLine({ budgetLineId: bl1, itemizedAmount: 600 });

    const { workItemId: wi2 } = insertWorkItemWithBudget({
      plannedAmount: 400,
      budgetCategoryId: catId,
    });

    const progId = insertSubsidyProgram({ reductionType: 'percentage', reductionValue: 10 });
    linkWorkItemSubsidy(wi1, progId);
    linkWorkItemSubsidy(wi2, progId);

    const result = getBudgetOverview(db);

    expect(result.subsidySummary.totalReductions).toBeCloseTo(100, 5);
  });

  it('all non-invoiced lines (unchanged pre-EPIC-15 behavior): reductions based on plannedAmount', () => {
    // workItem1: plannedAmount=1000, no invoice, 10% → 100
    // workItem2: plannedAmount=500, no invoice, 10% → 50
    // totalReductions = 150
    const catId = insertBudgetCategory('Cat-NoInv');

    const { workItemId: wi1 } = insertWorkItemWithBudget({
      plannedAmount: 1000,
      budgetCategoryId: catId,
    });
    const { workItemId: wi2 } = insertWorkItemWithBudget({
      plannedAmount: 500,
      budgetCategoryId: catId,
    });

    const progId = insertSubsidyProgram({ reductionType: 'percentage', reductionValue: 10 });
    linkWorkItemSubsidy(wi1, progId);
    linkWorkItemSubsidy(wi2, progId);

    const result = getBudgetOverview(db);

    expect(result.subsidySummary.totalReductions).toBeCloseTo(150, 5);
  });
});
