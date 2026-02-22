import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import { getBudgetOverview } from './budgetOverviewService.js';

describe('getBudgetOverview', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;

  // Unique ID counter to avoid timestamp collisions
  let idCounter = 0;

  function createTestDb() {
    const sqliteDb = new Database(':memory:');
    sqliteDb.pragma('journal_mode = WAL');
    sqliteDb.pragma('foreign_keys = ON');
    runMigrations(sqliteDb);
    return { sqlite: sqliteDb, db: drizzle(sqliteDb, { schema }) };
  }

  /**
   * Insert a test user. Always include authProvider: 'local' (required by schema NOT NULL).
   */
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

  /**
   * Insert a budget category and return its id.
   * Migration seeds 10 default categories — use unique test names to avoid collisions.
   */
  function insertBudgetCategory(name?: string, color?: string | null): string {
    const id = `cat-test-${idCounter++}`;
    const now = new Date().toISOString();
    db.insert(schema.budgetCategories)
      .values({
        id,
        name: name ?? `TestCat-${id}`,
        description: null,
        color: color ?? null,
        sortOrder: 200 + idCounter,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  /**
   * Insert a work item and optionally one or more budget lines.
   *
   * Returns { workItemId, budgetLineId }.
   * If no budget fields are specified, only the work item is created (no budget line).
   *
   * When actualCost is provided, a vendor + paid invoice is inserted linked to the budget line
   * (modelling the Story 5.9 pattern). When actualCostPending is provided, a pending invoice
   * is inserted instead.
   */
  function insertWorkItem(
    opts: {
      title?: string;
      plannedAmount?: number | null;
      confidence?: 'own_estimate' | 'professional_estimate' | 'quote' | 'invoice';
      budgetCategoryId?: string | null;
      budgetSourceId?: string | null;
      actualCost?: number | null; // creates a paid invoice
      actualCostPending?: number | null; // creates a pending invoice
    } = {},
  ): { workItemId: string; budgetLineId: string | null } {
    const id = `wi-test-${idCounter++}`;
    const now = new Date().toISOString();
    db.insert(schema.workItems)
      .values({
        id,
        title: opts.title ?? `Work Item ${id}`,
        status: 'not_started',
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const hasBudgetData =
      opts.plannedAmount != null || opts.budgetCategoryId != null || opts.budgetSourceId != null;

    if (!hasBudgetData) {
      return { workItemId: id, budgetLineId: null };
    }

    const budgetId = `bud-test-${idCounter++}`;
    db.insert(schema.workItemBudgets)
      .values({
        id: budgetId,
        workItemId: id,
        plannedAmount: opts.plannedAmount ?? 0,
        confidence: opts.confidence ?? 'own_estimate',
        budgetCategoryId: opts.budgetCategoryId ?? null,
        budgetSourceId: opts.budgetSourceId ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    // Insert paid invoice when actualCost is given
    if (opts.actualCost != null && opts.actualCost > 0) {
      const vendorId = `wi-vendor-${idCounter++}`;
      db.insert(schema.vendors)
        .values({ id: vendorId, name: `Auto Vendor ${vendorId}`, createdAt: now, updatedAt: now })
        .run();
      const invoiceId = `wi-inv-${idCounter++}`;
      db.insert(schema.invoices)
        .values({
          id: invoiceId,
          vendorId,
          workItemBudgetId: budgetId,
          amount: opts.actualCost,
          date: '2026-01-01',
          status: 'paid',
          createdAt: now,
          updatedAt: now,
        })
        .run();
    }

    // Insert pending invoice when actualCostPending is given
    if (opts.actualCostPending != null && opts.actualCostPending > 0) {
      const vendorId = `wi-vendor-${idCounter++}`;
      db.insert(schema.vendors)
        .values({ id: vendorId, name: `Auto Vendor ${vendorId}`, createdAt: now, updatedAt: now })
        .run();
      const invoiceId = `wi-inv-${idCounter++}`;
      db.insert(schema.invoices)
        .values({
          id: invoiceId,
          vendorId,
          workItemBudgetId: budgetId,
          amount: opts.actualCostPending,
          date: '2026-01-01',
          status: 'pending',
          createdAt: now,
          updatedAt: now,
        })
        .run();
    }

    return { workItemId: id, budgetLineId: budgetId };
  }

  /**
   * Insert an active budget source and return its id.
   */
  function insertBudgetSource(opts: {
    name?: string;
    totalAmount: number;
    status?: 'active' | 'exhausted' | 'closed';
  }): string {
    const id = `src-test-${idCounter++}`;
    const now = new Date().toISOString();
    db.insert(schema.budgetSources)
      .values({
        id,
        name: opts.name ?? `Source ${id}`,
        sourceType: 'bank_loan',
        totalAmount: opts.totalAmount,
        status: opts.status ?? 'active',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  /**
   * Insert a subsidy program and return its id.
   * Optionally link it to one or more budget categories (applicable categories).
   */
  function insertSubsidyProgram(opts: {
    name?: string;
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
        name: opts.name ?? `Subsidy Program ${id}`,
        reductionType: opts.reductionType,
        reductionValue: opts.reductionValue,
        applicationStatus: opts.applicationStatus ?? 'eligible',
        createdAt: now,
        updatedAt: now,
      })
      .run();

    // Link to applicable categories
    if (opts.categoryIds && opts.categoryIds.length > 0) {
      for (const catId of opts.categoryIds) {
        db.insert(schema.subsidyProgramCategories)
          .values({ subsidyProgramId: id, budgetCategoryId: catId })
          .run();
      }
    }

    return id;
  }

  /**
   * Link a work item to a subsidy program.
   */
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

  // ─── Empty database ───────────────────────────────────────────────────────

  describe('empty database (only seeded categories)', () => {
    it('returns zero for all numeric top-level fields', () => {
      const result = getBudgetOverview(db);

      expect(result.availableFunds).toBe(0);
      expect(result.sourceCount).toBe(0);
      expect(result.minPlanned).toBe(0);
      expect(result.maxPlanned).toBe(0);
      expect(result.actualCost).toBe(0);
      expect(result.actualCostPaid).toBe(0);
    });

    it('returns zero for all four remaining perspectives', () => {
      const result = getBudgetOverview(db);

      expect(result.remainingVsMinPlanned).toBe(0);
      expect(result.remainingVsMaxPlanned).toBe(0);
      expect(result.remainingVsActualCost).toBe(0);
      expect(result.remainingVsActualPaid).toBe(0);
    });

    it('returns zero for subsidy summary', () => {
      const result = getBudgetOverview(db);

      expect(result.subsidySummary.totalReductions).toBe(0);
      expect(result.subsidySummary.activeSubsidyCount).toBe(0);
    });

    it('returns 10 category summaries (seeded defaults) with all-zero values', () => {
      const result = getBudgetOverview(db);

      // Migration seeds exactly 10 categories
      expect(result.categorySummaries).toHaveLength(10);

      for (const cat of result.categorySummaries) {
        expect(cat.minPlanned).toBe(0);
        expect(cat.maxPlanned).toBe(0);
        expect(cat.actualCost).toBe(0);
        expect(cat.actualCostPaid).toBe(0);
        expect(cat.budgetLineCount).toBe(0);
      }
    });
  });

  // ─── Available funds from budget sources ──────────────────────────────────

  describe('available funds', () => {
    it('sums totalAmount from active budget sources', () => {
      insertBudgetSource({ totalAmount: 100000, status: 'active' });
      insertBudgetSource({ totalAmount: 50000, status: 'active' });

      const result = getBudgetOverview(db);

      expect(result.availableFunds).toBe(150000);
      expect(result.sourceCount).toBe(2);
    });

    it('excludes exhausted and closed budget sources from availableFunds', () => {
      insertBudgetSource({ totalAmount: 100000, status: 'active' });
      insertBudgetSource({ totalAmount: 50000, status: 'exhausted' });
      insertBudgetSource({ totalAmount: 30000, status: 'closed' });

      const result = getBudgetOverview(db);

      expect(result.availableFunds).toBe(100000);
      expect(result.sourceCount).toBe(1);
    });

    it('returns zero when no active sources exist', () => {
      insertBudgetSource({ totalAmount: 50000, status: 'closed' });

      const result = getBudgetOverview(db);

      expect(result.availableFunds).toBe(0);
      expect(result.sourceCount).toBe(0);
    });
  });

  // ─── Confidence margin calculations ───────────────────────────────────────

  describe('confidence margin calculations', () => {
    it('applies own_estimate margin of ±20% to min/max planned', () => {
      // own_estimate margin = 0.20
      insertWorkItem({ plannedAmount: 10000, confidence: 'own_estimate' });

      const result = getBudgetOverview(db);

      // min = 10000 * (1 - 0.20) = 8000
      // max = 10000 * (1 + 0.20) = 12000
      expect(result.minPlanned).toBeCloseTo(8000, 5);
      expect(result.maxPlanned).toBeCloseTo(12000, 5);
    });

    it('applies professional_estimate margin of ±10%', () => {
      insertWorkItem({ plannedAmount: 10000, confidence: 'professional_estimate' });

      const result = getBudgetOverview(db);

      expect(result.minPlanned).toBeCloseTo(9000, 5);
      expect(result.maxPlanned).toBeCloseTo(11000, 5);
    });

    it('applies quote margin of ±5%', () => {
      insertWorkItem({ plannedAmount: 10000, confidence: 'quote' });

      const result = getBudgetOverview(db);

      expect(result.minPlanned).toBeCloseTo(9500, 5);
      expect(result.maxPlanned).toBeCloseTo(10500, 5);
    });

    it('applies invoice margin of ±0% (no margin)', () => {
      insertWorkItem({ plannedAmount: 10000, confidence: 'invoice' });

      const result = getBudgetOverview(db);

      expect(result.minPlanned).toBeCloseTo(10000, 5);
      expect(result.maxPlanned).toBeCloseTo(10000, 5);
    });

    it('sums min/max planned across multiple budget lines with different confidences', () => {
      insertWorkItem({ plannedAmount: 10000, confidence: 'own_estimate' }); // ±20%: 8000/12000
      insertWorkItem({ plannedAmount: 5000, confidence: 'quote' }); // ±5%: 4750/5250

      const result = getBudgetOverview(db);

      expect(result.minPlanned).toBeCloseTo(12750, 5); // 8000 + 4750
      expect(result.maxPlanned).toBeCloseTo(17250, 5); // 12000 + 5250
    });
  });

  // ─── Actual costs (invoices) ──────────────────────────────────────────────

  describe('actual costs', () => {
    it('sums all invoice amounts linked to budget lines as actualCost', () => {
      insertWorkItem({ plannedAmount: 10000, actualCost: 8000 });
      insertWorkItem({ plannedAmount: 5000, actualCost: 4500 });

      const result = getBudgetOverview(db);

      expect(result.actualCost).toBe(12500);
    });

    it('sums only paid invoice amounts as actualCostPaid', () => {
      insertWorkItem({ plannedAmount: 10000, actualCost: 8000, actualCostPending: 2000 });

      const result = getBudgetOverview(db);

      expect(result.actualCost).toBe(10000); // 8000 paid + 2000 pending
      expect(result.actualCostPaid).toBe(8000); // only paid
    });

    it('returns zero actualCost when no invoices are linked to budget lines', () => {
      insertWorkItem({ plannedAmount: 10000 });

      const result = getBudgetOverview(db);

      expect(result.actualCost).toBe(0);
      expect(result.actualCostPaid).toBe(0);
    });

    it('excludes invoices not linked to any budget line from actualCost', () => {
      // A budget line with an invoice
      insertWorkItem({ plannedAmount: 5000, actualCost: 4000 });

      // A free-floating vendor invoice (no work_item_budget_id)
      const vendorId = `vendor-free-${idCounter++}`;
      const now = new Date().toISOString();
      db.insert(schema.vendors)
        .values({ id: vendorId, name: `Free Vendor ${vendorId}`, createdAt: now, updatedAt: now })
        .run();
      db.insert(schema.invoices)
        .values({
          id: `inv-free-${idCounter++}`,
          vendorId,
          amount: 9999,
          date: '2026-01-01',
          status: 'paid',
          createdAt: now,
          updatedAt: now,
        })
        .run();

      const result = getBudgetOverview(db);

      // Only the budget-linked invoice should be in actualCost
      expect(result.actualCost).toBe(4000);
      expect(result.actualCostPaid).toBe(4000);
    });
  });

  // ─── Four remaining-funds perspectives ────────────────────────────────────

  describe('remaining funds perspectives', () => {
    it('computes all four perspectives correctly', () => {
      insertBudgetSource({ totalAmount: 100000, status: 'active' });
      // own_estimate (±20%): min=8000, max=12000
      insertWorkItem({ plannedAmount: 10000, confidence: 'own_estimate', actualCost: 6000 });

      const result = getBudgetOverview(db);

      expect(result.availableFunds).toBe(100000);
      expect(result.minPlanned).toBeCloseTo(8000, 5);
      expect(result.maxPlanned).toBeCloseTo(12000, 5);
      expect(result.actualCost).toBe(6000);
      expect(result.actualCostPaid).toBe(6000);

      expect(result.remainingVsMinPlanned).toBeCloseTo(92000, 5); // 100000 - 8000
      expect(result.remainingVsMaxPlanned).toBeCloseTo(88000, 5); // 100000 - 12000
      expect(result.remainingVsActualCost).toBe(94000); // 100000 - 6000
      expect(result.remainingVsActualPaid).toBe(94000); // 100000 - 6000
    });

    it('returns negative remaining when costs exceed available funds', () => {
      insertBudgetSource({ totalAmount: 5000, status: 'active' });
      insertWorkItem({ plannedAmount: 10000, confidence: 'invoice', actualCost: 8000 });

      const result = getBudgetOverview(db);

      expect(result.remainingVsMinPlanned).toBe(-5000); // 5000 - 10000
      expect(result.remainingVsMaxPlanned).toBe(-5000); // 5000 - 10000
      expect(result.remainingVsActualCost).toBe(-3000); // 5000 - 8000
      expect(result.remainingVsActualPaid).toBe(-3000); // 5000 - 8000
    });

    it('remaining perspectives are all zero when database is empty', () => {
      const result = getBudgetOverview(db);

      expect(result.remainingVsMinPlanned).toBe(0);
      expect(result.remainingVsMaxPlanned).toBe(0);
      expect(result.remainingVsActualCost).toBe(0);
      expect(result.remainingVsActualPaid).toBe(0);
    });
  });

  // ─── Category summaries ───────────────────────────────────────────────────

  describe('category summaries', () => {
    it('includes all seeded categories even with no assigned budget lines', () => {
      const result = getBudgetOverview(db);

      const seededNames = [
        'Materials',
        'Labor',
        'Permits',
        'Design',
        'Equipment',
        'Landscaping',
        'Utilities',
        'Insurance',
        'Contingency',
        'Other',
      ];
      const resultNames = result.categorySummaries.map((c) => c.categoryName);
      for (const name of seededNames) {
        expect(resultNames).toContain(name);
      }
    });

    it('includes custom category with no budget lines, showing zeroes', () => {
      const catId = insertBudgetCategory('Custom Test Category');

      const result = getBudgetOverview(db);
      const cat = result.categorySummaries.find((c) => c.categoryId === catId);

      expect(cat).toBeDefined();
      expect(cat!.minPlanned).toBe(0);
      expect(cat!.maxPlanned).toBe(0);
      expect(cat!.actualCost).toBe(0);
      expect(cat!.actualCostPaid).toBe(0);
      expect(cat!.budgetLineCount).toBe(0);
    });

    it('aggregates minPlanned/maxPlanned per category with confidence margins', () => {
      const catId = insertBudgetCategory('Cat Margin Test');
      // own_estimate (±20%): min=8000, max=12000
      insertWorkItem({ plannedAmount: 10000, confidence: 'own_estimate', budgetCategoryId: catId });
      // quote (±5%): min=4750, max=5250
      insertWorkItem({ plannedAmount: 5000, confidence: 'quote', budgetCategoryId: catId });

      const result = getBudgetOverview(db);
      const cat = result.categorySummaries.find((c) => c.categoryId === catId);

      expect(cat).toBeDefined();
      expect(cat!.minPlanned).toBeCloseTo(12750, 5); // 8000 + 4750
      expect(cat!.maxPlanned).toBeCloseTo(17250, 5); // 12000 + 5250
      expect(cat!.budgetLineCount).toBe(2);
    });

    it('aggregates actualCost and actualCostPaid per category from invoices', () => {
      const catId = insertBudgetCategory('Cat Invoice Test');
      insertWorkItem({
        plannedAmount: 10000,
        budgetCategoryId: catId,
        actualCost: 8000,
        actualCostPending: 1500,
      });

      const result = getBudgetOverview(db);
      const cat = result.categorySummaries.find((c) => c.categoryId === catId);

      expect(cat!.actualCost).toBe(9500); // 8000 paid + 1500 pending
      expect(cat!.actualCostPaid).toBe(8000); // only paid
    });

    it('counts budget lines per category correctly', () => {
      const catId = insertBudgetCategory('Count Test Cat');
      insertWorkItem({ plannedAmount: 1000, budgetCategoryId: catId });
      insertWorkItem({ plannedAmount: 2000, budgetCategoryId: catId });
      insertWorkItem({ plannedAmount: 3000, budgetCategoryId: catId });

      const result = getBudgetOverview(db);
      const cat = result.categorySummaries.find((c) => c.categoryId === catId);

      expect(cat!.budgetLineCount).toBe(3);
    });

    it('budget lines without a category do not appear in any category summary', () => {
      const catId = insertBudgetCategory('Exclusive Cat');
      insertWorkItem({ plannedAmount: 5000, budgetCategoryId: catId });
      insertWorkItem({ plannedAmount: 9999 }); // no category

      const result = getBudgetOverview(db);
      const cat = result.categorySummaries.find((c) => c.categoryId === catId);

      // Only the first line's contribution should appear
      expect(cat!.minPlanned).toBeCloseTo(4000, 5); // own_estimate: 5000 * 0.8
      expect(cat!.budgetLineCount).toBe(1);
    });

    it('includes categoryColor in summary', () => {
      const catId = insertBudgetCategory('Colored Cat', '#FF5733');

      const result = getBudgetOverview(db);
      const cat = result.categorySummaries.find((c) => c.categoryId === catId);

      expect(cat!.categoryColor).toBe('#FF5733');
    });

    it('returns null categoryColor when category has no color', () => {
      const catId = insertBudgetCategory('No Color Cat', null);

      const result = getBudgetOverview(db);
      const cat = result.categorySummaries.find((c) => c.categoryId === catId);

      expect(cat!.categoryColor).toBeNull();
    });

    it('keeps categories from different budget lines independent', () => {
      const catA = insertBudgetCategory('Cat Alpha');
      const catB = insertBudgetCategory('Cat Beta');
      // invoice confidence (±0%): min=max=plannedAmount
      insertWorkItem({
        plannedAmount: 1000,
        confidence: 'invoice',
        budgetCategoryId: catA,
        actualCost: 800,
      });
      insertWorkItem({
        plannedAmount: 2000,
        confidence: 'invoice',
        budgetCategoryId: catB,
        actualCost: 2500,
      });

      const result = getBudgetOverview(db);
      const a = result.categorySummaries.find((c) => c.categoryId === catA);
      const b = result.categorySummaries.find((c) => c.categoryId === catB);

      expect(a!.minPlanned).toBe(1000);
      expect(a!.maxPlanned).toBe(1000);
      expect(a!.actualCost).toBe(800);
      expect(b!.minPlanned).toBe(2000);
      expect(b!.maxPlanned).toBe(2000);
      expect(b!.actualCost).toBe(2500);
    });
  });

  // ─── Subsidy summary ──────────────────────────────────────────────────────

  describe('subsidy summary — activeSubsidyCount', () => {
    it('counts non-rejected programs in activeSubsidyCount', () => {
      insertSubsidyProgram({
        reductionType: 'percentage',
        reductionValue: 10,
        applicationStatus: 'eligible',
      });
      insertSubsidyProgram({
        reductionType: 'fixed',
        reductionValue: 5000,
        applicationStatus: 'applied',
      });
      insertSubsidyProgram({
        reductionType: 'percentage',
        reductionValue: 20,
        applicationStatus: 'approved',
      });
      insertSubsidyProgram({
        reductionType: 'fixed',
        reductionValue: 3000,
        applicationStatus: 'received',
      });
      // Rejected — must NOT be counted
      insertSubsidyProgram({
        reductionType: 'percentage',
        reductionValue: 5,
        applicationStatus: 'rejected',
      });

      const result = getBudgetOverview(db);

      expect(result.subsidySummary.activeSubsidyCount).toBe(4);
    });

    it('excludes rejected programs from activeSubsidyCount', () => {
      insertSubsidyProgram({
        reductionType: 'percentage',
        reductionValue: 10,
        applicationStatus: 'rejected',
      });

      const result = getBudgetOverview(db);

      expect(result.subsidySummary.activeSubsidyCount).toBe(0);
    });
  });

  // ─── Subsidy reductions — category matching ───────────────────────────────

  describe('subsidy reductions — category matching', () => {
    it('does NOT apply subsidy reduction when subsidy has no applicable categories', () => {
      const catId = insertBudgetCategory('Cat No Subsidy Category Match');
      const { workItemId } = insertWorkItem({
        plannedAmount: 10000,
        confidence: 'invoice',
        budgetCategoryId: catId,
      });
      // Subsidy with NO applicable categories linked
      const progId = insertSubsidyProgram({
        reductionType: 'percentage',
        reductionValue: 20,
        applicationStatus: 'approved',
        categoryIds: [], // no categories
      });
      linkWorkItemSubsidy(workItemId, progId);

      const result = getBudgetOverview(db);

      // No reduction applied; invoice confidence, so min=max=10000
      expect(result.minPlanned).toBe(10000);
      expect(result.maxPlanned).toBe(10000);
      expect(result.subsidySummary.totalReductions).toBe(0);
    });

    it('does NOT apply subsidy when budget line category does not match subsidy categories', () => {
      const catA = insertBudgetCategory('Cat A (subsidy applies here)');
      const catB = insertBudgetCategory('Cat B (budget line here)');

      const { workItemId } = insertWorkItem({
        plannedAmount: 10000,
        confidence: 'invoice',
        budgetCategoryId: catB, // budget line in catB
      });

      // Subsidy only applies to catA, not catB
      const progId = insertSubsidyProgram({
        reductionType: 'percentage',
        reductionValue: 20,
        applicationStatus: 'approved',
        categoryIds: [catA], // only catA
      });
      linkWorkItemSubsidy(workItemId, progId);

      const result = getBudgetOverview(db);

      // No reduction — line is in catB but subsidy only covers catA
      expect(result.minPlanned).toBe(10000);
      expect(result.subsidySummary.totalReductions).toBe(0);
    });

    it('does NOT apply subsidy when budget line has no category', () => {
      const catId = insertBudgetCategory('Cat Subsidy');
      const { workItemId } = insertWorkItem({
        plannedAmount: 10000,
        confidence: 'invoice',
        budgetCategoryId: null, // no category on budget line
      });
      const progId = insertSubsidyProgram({
        reductionType: 'percentage',
        reductionValue: 20,
        applicationStatus: 'approved',
        categoryIds: [catId],
      });
      linkWorkItemSubsidy(workItemId, progId);

      const result = getBudgetOverview(db);

      expect(result.minPlanned).toBe(10000);
      expect(result.subsidySummary.totalReductions).toBe(0);
    });

    it('does NOT apply rejected subsidy even when category matches', () => {
      const catId = insertBudgetCategory('Cat Rejected Subsidy');
      const { workItemId } = insertWorkItem({
        plannedAmount: 10000,
        confidence: 'invoice',
        budgetCategoryId: catId,
      });
      const progId = insertSubsidyProgram({
        reductionType: 'percentage',
        reductionValue: 20,
        applicationStatus: 'rejected',
        categoryIds: [catId],
      });
      linkWorkItemSubsidy(workItemId, progId);

      const result = getBudgetOverview(db);

      expect(result.minPlanned).toBe(10000);
      expect(result.subsidySummary.totalReductions).toBe(0);
    });

    it('applies percentage subsidy reduction when all 3 conditions are met', () => {
      const catId = insertBudgetCategory('Cat Percentage Match');
      const { workItemId } = insertWorkItem({
        plannedAmount: 10000,
        confidence: 'invoice',
        budgetCategoryId: catId,
      });
      const progId = insertSubsidyProgram({
        reductionType: 'percentage',
        reductionValue: 15,
        applicationStatus: 'approved',
        categoryIds: [catId],
      });
      linkWorkItemSubsidy(workItemId, progId);

      const result = getBudgetOverview(db);

      // reduction = 10000 * 0.15 = 1500
      // raw_min = 10000 * 1.0 = 10000; min_planned = 10000 - 1500 = 8500
      // raw_max = 10000 * 1.0 = 10000; max_planned = 10000 - 1500 = 8500
      expect(result.minPlanned).toBeCloseTo(8500, 5);
      expect(result.maxPlanned).toBeCloseTo(8500, 5);
      expect(result.subsidySummary.totalReductions).toBeCloseTo(1500, 5);
    });

    it('applies fixed subsidy reduction divided equally across matching lines', () => {
      const catId = insertBudgetCategory('Cat Fixed Match');
      const { workItemId } = insertWorkItem({
        plannedAmount: 10000,
        confidence: 'invoice',
        budgetCategoryId: catId,
      });
      // A second budget line in same work item and same category
      const budgetId2 = `bud-test-${idCounter++}`;
      const now = new Date().toISOString();
      db.insert(schema.workItemBudgets)
        .values({
          id: budgetId2,
          workItemId,
          plannedAmount: 5000,
          confidence: 'invoice',
          budgetCategoryId: catId,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      const progId = insertSubsidyProgram({
        reductionType: 'fixed',
        reductionValue: 3000,
        applicationStatus: 'approved',
        categoryIds: [catId],
      });
      linkWorkItemSubsidy(workItemId, progId);

      const result = getBudgetOverview(db);

      // 2 matching lines: 3000 / 2 = 1500 per line
      // line1: 10000 - 1500 = 8500; line2: 5000 - 1500 = 3500
      expect(result.minPlanned).toBeCloseTo(12000, 5); // 8500 + 3500
      expect(result.maxPlanned).toBeCloseTo(12000, 5);
      expect(result.subsidySummary.totalReductions).toBeCloseTo(3000, 5);
    });

    it('applies fixed subsidy to single matching line (no division)', () => {
      const catId = insertBudgetCategory('Cat Fixed Single');
      const { workItemId } = insertWorkItem({
        plannedAmount: 8000,
        confidence: 'invoice',
        budgetCategoryId: catId,
      });
      const progId = insertSubsidyProgram({
        reductionType: 'fixed',
        reductionValue: 2000,
        applicationStatus: 'approved',
        categoryIds: [catId],
      });
      linkWorkItemSubsidy(workItemId, progId);

      const result = getBudgetOverview(db);

      // Only 1 matching line: 2000 / 1 = 2000 reduction
      expect(result.minPlanned).toBeCloseTo(6000, 5); // 8000 - 2000
      expect(result.subsidySummary.totalReductions).toBeCloseTo(2000, 5);
    });

    it('floors min/max planned at 0 when subsidy reduction exceeds planned amount', () => {
      const catId = insertBudgetCategory('Cat Floor Test');
      const { workItemId } = insertWorkItem({
        plannedAmount: 500,
        confidence: 'invoice',
        budgetCategoryId: catId,
      });
      const progId = insertSubsidyProgram({
        reductionType: 'fixed',
        reductionValue: 10000, // exceeds planned amount
        applicationStatus: 'approved',
        categoryIds: [catId],
      });
      linkWorkItemSubsidy(workItemId, progId);

      const result = getBudgetOverview(db);

      expect(result.minPlanned).toBe(0);
      expect(result.maxPlanned).toBe(0);
    });

    it('subsidy only applies to lines whose category matches (not all lines of work item)', () => {
      const catMatch = insertBudgetCategory('Cat Match');
      const catNoMatch = insertBudgetCategory('Cat No Match');

      const { workItemId } = insertWorkItem({
        plannedAmount: 10000,
        confidence: 'invoice',
        budgetCategoryId: catMatch,
      });

      // Second budget line on same work item but different category
      const now = new Date().toISOString();
      db.insert(schema.workItemBudgets)
        .values({
          id: `bud-test-${idCounter++}`,
          workItemId,
          plannedAmount: 5000,
          confidence: 'invoice',
          budgetCategoryId: catNoMatch,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      // Subsidy only applies to catMatch
      const progId = insertSubsidyProgram({
        reductionType: 'percentage',
        reductionValue: 10,
        applicationStatus: 'approved',
        categoryIds: [catMatch],
      });
      linkWorkItemSubsidy(workItemId, progId);

      const result = getBudgetOverview(db);

      // Only line1 (10000) gets the 10% reduction = 1000
      // line1 min/max = 10000 - 1000 = 9000; line2 min/max = 5000 (no reduction)
      expect(result.minPlanned).toBeCloseTo(14000, 5); // 9000 + 5000
      expect(result.subsidySummary.totalReductions).toBeCloseTo(1000, 5);
    });

    it('applies category-matched reductions in per-category summaries', () => {
      const catId = insertBudgetCategory('Cat Reduction In Summary');
      const { workItemId } = insertWorkItem({
        plannedAmount: 10000,
        confidence: 'invoice',
        budgetCategoryId: catId,
      });
      const progId = insertSubsidyProgram({
        reductionType: 'percentage',
        reductionValue: 20,
        applicationStatus: 'approved',
        categoryIds: [catId],
      });
      linkWorkItemSubsidy(workItemId, progId);

      const result = getBudgetOverview(db);
      const cat = result.categorySummaries.find((c) => c.categoryId === catId);

      // 10000 * (1 - 0.20) = 8000
      expect(cat!.minPlanned).toBeCloseTo(8000, 5);
      expect(cat!.maxPlanned).toBeCloseTo(8000, 5);
    });

    it('sums reductions from multiple work item-subsidy category matches', () => {
      const catA = insertBudgetCategory('Cat Reduce A');
      const catB = insertBudgetCategory('Cat Reduce B');

      const { workItemId: wi1 } = insertWorkItem({
        plannedAmount: 20000,
        confidence: 'invoice',
        budgetCategoryId: catA,
      });
      const { workItemId: wi2 } = insertWorkItem({
        plannedAmount: 10000,
        confidence: 'invoice',
        budgetCategoryId: catB,
      });

      const prog1 = insertSubsidyProgram({
        reductionType: 'percentage',
        reductionValue: 10,
        applicationStatus: 'approved',
        categoryIds: [catA],
      });
      const prog2 = insertSubsidyProgram({
        reductionType: 'fixed',
        reductionValue: 1000,
        applicationStatus: 'eligible',
        categoryIds: [catB],
      });

      linkWorkItemSubsidy(wi1, prog1); // 20000 * 10/100 = 2000
      linkWorkItemSubsidy(wi2, prog2); // 1000 fixed

      const result = getBudgetOverview(db);

      expect(result.subsidySummary.totalReductions).toBeCloseTo(3000, 5);
    });

    it('returns 0 totalReductions when subsidy has no category links even if work item linked', () => {
      const catId = insertBudgetCategory('Cat With No Prog Category');
      const { workItemId } = insertWorkItem({
        plannedAmount: 10000,
        confidence: 'invoice',
        budgetCategoryId: catId,
      });
      // Program with no applicable categories
      const progId = insertSubsidyProgram({
        reductionType: 'percentage',
        reductionValue: 25,
        applicationStatus: 'approved',
        categoryIds: [],
      });
      linkWorkItemSubsidy(workItemId, progId);

      const result = getBudgetOverview(db);

      expect(result.subsidySummary.totalReductions).toBe(0);
    });
  });

  // ─── Confidence margins interact with subsidy reductions ──────────────────

  describe('confidence margins interacting with subsidy reductions', () => {
    it('applies subsidy reduction after confidence margin expansion', () => {
      // own_estimate (±20%), planned=10000
      // raw_min = 8000, raw_max = 12000
      // subsidy = 10% percentage on catId
      // reduction = 10000 * 0.10 = 1000
      // min_planned = max(0, 8000 - 1000) = 7000
      // max_planned = max(0, 12000 - 1000) = 11000
      const catId = insertBudgetCategory('Cat Margin + Subsidy');
      const { workItemId } = insertWorkItem({
        plannedAmount: 10000,
        confidence: 'own_estimate',
        budgetCategoryId: catId,
      });
      const progId = insertSubsidyProgram({
        reductionType: 'percentage',
        reductionValue: 10,
        applicationStatus: 'approved',
        categoryIds: [catId],
      });
      linkWorkItemSubsidy(workItemId, progId);

      const result = getBudgetOverview(db);

      expect(result.minPlanned).toBeCloseTo(7000, 5);
      expect(result.maxPlanned).toBeCloseTo(11000, 5);
    });
  });

  // ─── Full integration scenario ────────────────────────────────────────────

  describe('full integration scenario', () => {
    it('returns correct overview with all entities populated', () => {
      // 1. Budget sources
      insertBudgetSource({ totalAmount: 200000, status: 'active' });

      // 2. Budget categories
      const catA = insertBudgetCategory('Full Test Cat A', '#FF0000');
      const catB = insertBudgetCategory('Full Test Cat B', '#00FF00');

      // 3. Work items with budget lines
      // wi1: catA, invoice confidence (0 margin), 50000 planned, 45000 paid
      const { workItemId: wi1Id } = insertWorkItem({
        plannedAmount: 50000,
        confidence: 'invoice',
        budgetCategoryId: catA,
        actualCost: 45000,
      });
      // wi2: catB, own_estimate (±20%), 30000 planned, 32000 pending
      insertWorkItem({
        plannedAmount: 30000,
        confidence: 'own_estimate',
        budgetCategoryId: catB,
        actualCostPending: 32000,
      });
      // wi3: catA, quote (±5%), 20000 planned, no invoices
      insertWorkItem({ plannedAmount: 20000, confidence: 'quote', budgetCategoryId: catA });

      // 4. Subsidy: 10% on catA
      const prog = insertSubsidyProgram({
        reductionType: 'percentage',
        reductionValue: 10,
        applicationStatus: 'approved',
        categoryIds: [catA],
      });
      linkWorkItemSubsidy(wi1Id, prog); // applies to wi1 (catA, invoice) => 50000 * 0.1 = 5000

      const result = getBudgetOverview(db);

      // Available funds
      expect(result.availableFunds).toBe(200000);
      expect(result.sourceCount).toBe(1);

      // Min/max planned:
      // wi1: raw_min=raw_max=50000 (invoice 0%), subsidy=5000 → min=max=45000
      // wi2: raw_min=24000 (30000*0.8), raw_max=36000 (30000*1.2), no subsidy → min=24000, max=36000
      // wi3: raw_min=19000 (20000*0.95), raw_max=21000 (20000*1.05), wi3 NOT linked to prog → no subsidy
      //   Total min = 45000 + 24000 + 19000 = 88000
      //   Total max = 45000 + 36000 + 21000 = 102000
      expect(result.minPlanned).toBeCloseTo(88000, 5);
      expect(result.maxPlanned).toBeCloseTo(102000, 5);

      // Actual costs: 45000 paid (wi1), 32000 pending (wi2) → total=77000, paid=45000
      expect(result.actualCost).toBe(77000);
      expect(result.actualCostPaid).toBe(45000);

      // Remaining perspectives
      expect(result.remainingVsMinPlanned).toBeCloseTo(112000, 5); // 200000 - 88000
      expect(result.remainingVsMaxPlanned).toBeCloseTo(98000, 5); // 200000 - 102000
      expect(result.remainingVsActualCost).toBe(123000); // 200000 - 77000
      expect(result.remainingVsActualPaid).toBe(155000); // 200000 - 45000

      // Subsidy summary
      expect(result.subsidySummary.totalReductions).toBeCloseTo(5000, 5);
      expect(result.subsidySummary.activeSubsidyCount).toBe(1);

      // Category A: wi1 (45000 min/max after subsidy) + wi3 (19000/21000)
      const a = result.categorySummaries.find((c) => c.categoryId === catA);
      expect(a!.minPlanned).toBeCloseTo(64000, 5); // 45000 + 19000
      expect(a!.maxPlanned).toBeCloseTo(66000, 5); // 45000 + 21000
      expect(a!.actualCost).toBe(45000);
      expect(a!.actualCostPaid).toBe(45000);
      expect(a!.budgetLineCount).toBe(2);

      // Category B: wi2 (24000/36000)
      const b = result.categorySummaries.find((c) => c.categoryId === catB);
      expect(b!.minPlanned).toBeCloseTo(24000, 5);
      expect(b!.maxPlanned).toBeCloseTo(36000, 5);
      expect(b!.actualCost).toBe(32000);
      expect(b!.actualCostPaid).toBe(0);
      expect(b!.budgetLineCount).toBe(1);
    });
  });
});
