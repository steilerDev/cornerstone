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
   * Insert a work item with optional budget fields.
   * NOTE: Story 5.9 — budget data moved from work_items to work_item_budgets.
   * This helper now creates a work item + budget line when budget fields are provided.
   * When actualCost is provided, a budget line is created AND a paid invoice is inserted
   * with work_item_budget_id set, so the service can aggregate actualCost from invoices.
   */
  function insertWorkItem(
    opts: {
      title?: string;
      plannedBudget?: number | null;
      actualCost?: number | null;
      budgetCategoryId?: string | null;
      budgetSourceId?: string | null;
    } = {},
  ): string {
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

    // Create a budget line if any budget fields are provided
    const hasBudgetData =
      opts.plannedBudget != null ||
      opts.actualCost != null ||
      opts.budgetCategoryId != null ||
      opts.budgetSourceId != null;
    if (hasBudgetData) {
      const budgetId = `bud-test-${idCounter++}`;
      db.insert(schema.workItemBudgets)
        .values({
          id: budgetId,
          workItemId: id,
          plannedAmount: opts.plannedBudget ?? 0,
          confidence: 'own_estimate',
          budgetCategoryId: opts.budgetCategoryId ?? null,
          budgetSourceId: opts.budgetSourceId ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      // When actualCost is provided, create a vendor + paid invoice linked to this budget line.
      // This models how actual costs are tracked in Story 5.9: via invoices with work_item_budget_id.
      if (opts.actualCost != null && opts.actualCost > 0) {
        const vendorId = `wi-vendor-${idCounter++}`;
        db.insert(schema.vendors)
          .values({
            id: vendorId,
            name: `Auto Vendor ${vendorId}`,
            createdAt: now,
            updatedAt: now,
          })
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
    }

    return id;
  }

  /**
   * Insert a vendor and return its id.
   */
  function insertVendor(name = 'Test Vendor'): string {
    const id = `vendor-test-${idCounter++}`;
    const now = new Date().toISOString();
    db.insert(schema.vendors)
      .values({
        id,
        name: `${name}-${id}`,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  /**
   * Insert an invoice for a vendor.
   */
  function insertInvoice(opts: {
    vendorId: string;
    amount: number;
    status: 'pending' | 'paid' | 'claimed';
    workItemBudgetId?: string | null;
  }): string {
    const id = `inv-test-${idCounter++}`;
    const now = new Date().toISOString();
    db.insert(schema.invoices)
      .values({
        id,
        vendorId: opts.vendorId,
        workItemBudgetId: opts.workItemBudgetId ?? null,
        amount: opts.amount,
        date: '2026-01-01',
        status: opts.status,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
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
   */
  function insertSubsidyProgram(opts: {
    name?: string;
    reductionType: 'percentage' | 'fixed';
    reductionValue: number;
    applicationStatus?: 'eligible' | 'applied' | 'approved' | 'received' | 'rejected';
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
    it('returns zero for all top-level totals', () => {
      const result = getBudgetOverview(db);

      expect(result.totalPlannedBudget).toBe(0);
      expect(result.totalActualCost).toBe(0);
      expect(result.totalVariance).toBe(0);
    });

    it('returns zero for financing summary', () => {
      const result = getBudgetOverview(db);

      expect(result.financingSummary.totalAvailable).toBe(0);
      expect(result.financingSummary.totalUsed).toBe(0);
      expect(result.financingSummary.totalRemaining).toBe(0);
      expect(result.financingSummary.sourceCount).toBe(0);
    });

    it('returns zero for vendor summary', () => {
      const result = getBudgetOverview(db);

      expect(result.vendorSummary.totalPaid).toBe(0);
      expect(result.vendorSummary.totalOutstanding).toBe(0);
      expect(result.vendorSummary.vendorCount).toBe(0);
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
        expect(cat.plannedBudget).toBe(0);
        expect(cat.actualCost).toBe(0);
        expect(cat.variance).toBe(0);
        expect(cat.workItemCount).toBe(0);
      }
    });
  });

  // ─── Project-level totals ─────────────────────────────────────────────────

  describe('project-level totals', () => {
    it('sums planned_budget from all work items', () => {
      insertWorkItem({ plannedBudget: 10000 });
      insertWorkItem({ plannedBudget: 5000 });
      insertWorkItem({ plannedBudget: 3000 });

      const result = getBudgetOverview(db);

      expect(result.totalPlannedBudget).toBe(18000);
    });

    it('sums actual_cost from all work items', () => {
      insertWorkItem({ actualCost: 8000 });
      insertWorkItem({ actualCost: 4500 });

      const result = getBudgetOverview(db);

      expect(result.totalActualCost).toBe(12500);
    });

    it('computes variance as planned minus actual (positive = under budget)', () => {
      insertWorkItem({ plannedBudget: 10000, actualCost: 8000 });

      const result = getBudgetOverview(db);

      expect(result.totalVariance).toBe(2000);
    });

    it('computes negative variance when actual exceeds planned (over budget)', () => {
      insertWorkItem({ plannedBudget: 5000, actualCost: 7000 });

      const result = getBudgetOverview(db);

      expect(result.totalVariance).toBe(-2000);
    });

    it('excludes null budget fields from totals (treats as 0)', () => {
      insertWorkItem({ plannedBudget: null, actualCost: null });
      insertWorkItem({ plannedBudget: 3000, actualCost: 1000 });

      const result = getBudgetOverview(db);

      expect(result.totalPlannedBudget).toBe(3000);
      expect(result.totalActualCost).toBe(1000);
    });

    it('returns zero totals when all work items have null budgets', () => {
      insertWorkItem({ plannedBudget: null, actualCost: null });
      insertWorkItem({ plannedBudget: null, actualCost: null });

      const result = getBudgetOverview(db);

      expect(result.totalPlannedBudget).toBe(0);
      expect(result.totalActualCost).toBe(0);
      expect(result.totalVariance).toBe(0);
    });

    it('handles multiple work items combining planned and actual', () => {
      insertWorkItem({ plannedBudget: 10000, actualCost: 9000 });
      insertWorkItem({ plannedBudget: 5000, actualCost: 6000 });
      insertWorkItem({ plannedBudget: 3000, actualCost: 2000 });

      const result = getBudgetOverview(db);

      expect(result.totalPlannedBudget).toBe(18000);
      expect(result.totalActualCost).toBe(17000);
      expect(result.totalVariance).toBe(1000);
    });
  });

  // ─── Category summaries ───────────────────────────────────────────────────

  describe('category summaries', () => {
    it('includes seeded categories even with no assigned work items', () => {
      // No work items at all — should still return 10 seeded categories
      const result = getBudgetOverview(db);

      // All seeded categories should appear in results
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

    it('includes custom category with no work items, showing zeroes', () => {
      const catId = insertBudgetCategory('Custom Test Category');

      const result = getBudgetOverview(db);
      const cat = result.categorySummaries.find((c) => c.categoryId === catId);

      expect(cat).toBeDefined();
      expect(cat!.plannedBudget).toBe(0);
      expect(cat!.actualCost).toBe(0);
      expect(cat!.variance).toBe(0);
      expect(cat!.workItemCount).toBe(0);
    });

    it('aggregates planned_budget and actual_cost per category', () => {
      const catId = insertBudgetCategory('Custom Aggregated');
      insertWorkItem({ plannedBudget: 5000, actualCost: 4000, budgetCategoryId: catId });
      insertWorkItem({ plannedBudget: 3000, actualCost: 3500, budgetCategoryId: catId });

      const result = getBudgetOverview(db);
      const cat = result.categorySummaries.find((c) => c.categoryId === catId);

      expect(cat).toBeDefined();
      expect(cat!.plannedBudget).toBe(8000);
      expect(cat!.actualCost).toBe(7500);
      expect(cat!.variance).toBe(500);
      expect(cat!.workItemCount).toBe(2);
    });

    it('computes per-category variance as planned minus actual', () => {
      const catId = insertBudgetCategory('Variance Test Cat');
      insertWorkItem({ plannedBudget: 10000, actualCost: 12000, budgetCategoryId: catId });

      const result = getBudgetOverview(db);
      const cat = result.categorySummaries.find((c) => c.categoryId === catId);

      expect(cat!.variance).toBe(-2000);
    });

    it('counts work items per category correctly', () => {
      const catId = insertBudgetCategory('Count Test Cat');
      insertWorkItem({ budgetCategoryId: catId });
      insertWorkItem({ budgetCategoryId: catId });
      insertWorkItem({ budgetCategoryId: catId });

      const result = getBudgetOverview(db);
      const cat = result.categorySummaries.find((c) => c.categoryId === catId);

      expect(cat!.workItemCount).toBe(3);
    });

    it('excludes work items not assigned to a category from category rows', () => {
      const catId = insertBudgetCategory('Exclusive Cat');
      insertWorkItem({ plannedBudget: 5000, budgetCategoryId: catId });
      // This work item has no category — should not affect category summaries
      insertWorkItem({ plannedBudget: 9999, budgetCategoryId: null });

      const result = getBudgetOverview(db);
      const cat = result.categorySummaries.find((c) => c.categoryId === catId);

      expect(cat!.plannedBudget).toBe(5000);
      expect(cat!.workItemCount).toBe(1);
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

    it('keeps categories from different work items independent', () => {
      const catA = insertBudgetCategory('Cat Alpha');
      const catB = insertBudgetCategory('Cat Beta');
      insertWorkItem({ plannedBudget: 1000, actualCost: 800, budgetCategoryId: catA });
      insertWorkItem({ plannedBudget: 2000, actualCost: 2500, budgetCategoryId: catB });

      const result = getBudgetOverview(db);
      const a = result.categorySummaries.find((c) => c.categoryId === catA);
      const b = result.categorySummaries.find((c) => c.categoryId === catB);

      expect(a!.plannedBudget).toBe(1000);
      expect(a!.actualCost).toBe(800);
      expect(b!.plannedBudget).toBe(2000);
      expect(b!.actualCost).toBe(2500);
    });
  });

  // ─── Financing summary ────────────────────────────────────────────────────

  describe('financing summary', () => {
    it('sums totalAmount from active budget sources', () => {
      insertBudgetSource({ totalAmount: 100000, status: 'active' });
      insertBudgetSource({ totalAmount: 50000, status: 'active' });

      const result = getBudgetOverview(db);

      expect(result.financingSummary.totalAvailable).toBe(150000);
      expect(result.financingSummary.sourceCount).toBe(2);
    });

    it('excludes exhausted budget sources from totalAvailable', () => {
      insertBudgetSource({ totalAmount: 100000, status: 'active' });
      insertBudgetSource({ totalAmount: 50000, status: 'exhausted' });

      const result = getBudgetOverview(db);

      expect(result.financingSummary.totalAvailable).toBe(100000);
      expect(result.financingSummary.sourceCount).toBe(1);
    });

    it('excludes closed budget sources from totalAvailable', () => {
      insertBudgetSource({ totalAmount: 30000, status: 'closed' });

      const result = getBudgetOverview(db);

      expect(result.financingSummary.totalAvailable).toBe(0);
      expect(result.financingSummary.sourceCount).toBe(0);
    });

    it('computes totalUsed from work items referencing active budget sources', () => {
      const srcId = insertBudgetSource({ totalAmount: 100000, status: 'active' });
      insertWorkItem({ actualCost: 12000, budgetSourceId: srcId });
      insertWorkItem({ actualCost: 8000, budgetSourceId: srcId });

      const result = getBudgetOverview(db);

      expect(result.financingSummary.totalUsed).toBe(20000);
    });

    it('excludes work items referencing exhausted sources from totalUsed', () => {
      const activeSrc = insertBudgetSource({ totalAmount: 100000, status: 'active' });
      const exhaustedSrc = insertBudgetSource({ totalAmount: 50000, status: 'exhausted' });
      insertWorkItem({ actualCost: 10000, budgetSourceId: activeSrc });
      // This work item references an exhausted source — should NOT count in totalUsed
      insertWorkItem({ actualCost: 5000, budgetSourceId: exhaustedSrc });

      const result = getBudgetOverview(db);

      expect(result.financingSummary.totalUsed).toBe(10000);
    });

    it('computes totalRemaining as totalAvailable minus totalUsed', () => {
      const srcId = insertBudgetSource({ totalAmount: 100000, status: 'active' });
      insertWorkItem({ actualCost: 30000, budgetSourceId: srcId });

      const result = getBudgetOverview(db);

      expect(result.financingSummary.totalAvailable).toBe(100000);
      expect(result.financingSummary.totalUsed).toBe(30000);
      expect(result.financingSummary.totalRemaining).toBe(70000);
    });

    it('returns zero for all financing fields when no sources exist', () => {
      const result = getBudgetOverview(db);

      expect(result.financingSummary.totalAvailable).toBe(0);
      expect(result.financingSummary.totalUsed).toBe(0);
      expect(result.financingSummary.totalRemaining).toBe(0);
      expect(result.financingSummary.sourceCount).toBe(0);
    });

    it('counts only active sources in sourceCount', () => {
      insertBudgetSource({ totalAmount: 100000, status: 'active' });
      insertBudgetSource({ totalAmount: 50000, status: 'exhausted' });
      insertBudgetSource({ totalAmount: 20000, status: 'closed' });

      const result = getBudgetOverview(db);

      expect(result.financingSummary.sourceCount).toBe(1);
    });
  });

  // ─── Vendor summary ───────────────────────────────────────────────────────

  describe('vendor summary', () => {
    it('sums paid invoice amounts as totalPaid', () => {
      const vendorId = insertVendor('Contractor A');
      insertInvoice({ vendorId, amount: 5000, status: 'paid' });
      insertInvoice({ vendorId, amount: 3000, status: 'paid' });

      const result = getBudgetOverview(db);

      expect(result.vendorSummary.totalPaid).toBe(8000);
    });

    it('sums pending invoice amounts as totalOutstanding', () => {
      const vendorId = insertVendor('Contractor B');
      insertInvoice({ vendorId, amount: 2000, status: 'pending' });
      insertInvoice({ vendorId, amount: 1500, status: 'pending' });

      const result = getBudgetOverview(db);

      expect(result.vendorSummary.totalOutstanding).toBe(3500);
    });

    it('sums claimed invoice amounts as totalOutstanding', () => {
      const vendorId = insertVendor('Contractor C');
      insertInvoice({ vendorId, amount: 4000, status: 'claimed' });

      const result = getBudgetOverview(db);

      expect(result.vendorSummary.totalOutstanding).toBe(4000);
    });

    it('combines pending and overdue in totalOutstanding', () => {
      const vendorId = insertVendor('Contractor D');
      insertInvoice({ vendorId, amount: 1000, status: 'pending' });
      insertInvoice({ vendorId, amount: 2000, status: 'claimed' });
      insertInvoice({ vendorId, amount: 5000, status: 'paid' });

      const result = getBudgetOverview(db);

      expect(result.vendorSummary.totalOutstanding).toBe(3000);
      expect(result.vendorSummary.totalPaid).toBe(5000);
    });

    it('counts distinct vendors from invoices', () => {
      const vendor1 = insertVendor('Vendor One');
      const vendor2 = insertVendor('Vendor Two');
      // Two invoices from same vendor — should count as 1
      insertInvoice({ vendorId: vendor1, amount: 1000, status: 'paid' });
      insertInvoice({ vendorId: vendor1, amount: 2000, status: 'paid' });
      insertInvoice({ vendorId: vendor2, amount: 3000, status: 'pending' });

      const result = getBudgetOverview(db);

      expect(result.vendorSummary.vendorCount).toBe(2);
    });

    it('returns zero for all vendor fields when no invoices exist', () => {
      const result = getBudgetOverview(db);

      expect(result.vendorSummary.totalPaid).toBe(0);
      expect(result.vendorSummary.totalOutstanding).toBe(0);
      expect(result.vendorSummary.vendorCount).toBe(0);
    });

    it('returns zero vendorCount when vendors exist but have no invoices', () => {
      // Vendor exists but no invoices
      insertVendor('Vendor Without Invoice');

      const result = getBudgetOverview(db);

      // vendorCount is based on DISTINCT vendor_id in invoices
      expect(result.vendorSummary.vendorCount).toBe(0);
    });
  });

  // ─── Subsidy summary ──────────────────────────────────────────────────────

  describe('subsidy summary', () => {
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

    it('computes percentage reduction as planned_budget * reduction_value / 100', () => {
      const wiId = insertWorkItem({ plannedBudget: 10000 });
      const progId = insertSubsidyProgram({
        reductionType: 'percentage',
        reductionValue: 15,
        applicationStatus: 'approved',
      });
      linkWorkItemSubsidy(wiId, progId);

      const result = getBudgetOverview(db);

      // 10000 * 15 / 100 = 1500
      expect(result.subsidySummary.totalReductions).toBe(1500);
    });

    it('computes fixed reduction as the reduction_value directly', () => {
      const wiId = insertWorkItem({ plannedBudget: 10000 });
      const progId = insertSubsidyProgram({
        reductionType: 'fixed',
        reductionValue: 2500,
        applicationStatus: 'approved',
      });
      linkWorkItemSubsidy(wiId, progId);

      const result = getBudgetOverview(db);

      expect(result.subsidySummary.totalReductions).toBe(2500);
    });

    it('excludes reductions from rejected programs', () => {
      const wiId = insertWorkItem({ plannedBudget: 10000 });
      const rejectedProgId = insertSubsidyProgram({
        reductionType: 'percentage',
        reductionValue: 20,
        applicationStatus: 'rejected',
      });
      linkWorkItemSubsidy(wiId, rejectedProgId);

      const result = getBudgetOverview(db);

      expect(result.subsidySummary.totalReductions).toBe(0);
    });

    it('sums reductions from multiple work item-subsidy links', () => {
      const wi1 = insertWorkItem({ plannedBudget: 20000 });
      const wi2 = insertWorkItem({ plannedBudget: 10000 });
      const prog1 = insertSubsidyProgram({
        reductionType: 'percentage',
        reductionValue: 10,
        applicationStatus: 'approved',
      });
      const prog2 = insertSubsidyProgram({
        reductionType: 'fixed',
        reductionValue: 1000,
        applicationStatus: 'eligible',
      });
      linkWorkItemSubsidy(wi1, prog1); // 20000 * 10/100 = 2000
      linkWorkItemSubsidy(wi2, prog2); // 1000 fixed

      const result = getBudgetOverview(db);

      expect(result.subsidySummary.totalReductions).toBe(3000);
    });

    it('returns 0 reductions when work item has null planned_budget with percentage type', () => {
      const wiId = insertWorkItem({ plannedBudget: null });
      const progId = insertSubsidyProgram({
        reductionType: 'percentage',
        reductionValue: 25,
        applicationStatus: 'approved',
      });
      linkWorkItemSubsidy(wiId, progId);

      const result = getBudgetOverview(db);

      // percentage with null planned_budget falls to ELSE 0
      expect(result.subsidySummary.totalReductions).toBe(0);
    });

    it('computes fixed reduction even when work item has null planned_budget', () => {
      const wiId = insertWorkItem({ plannedBudget: null });
      const progId = insertSubsidyProgram({
        reductionType: 'fixed',
        reductionValue: 3000,
        applicationStatus: 'approved',
      });
      linkWorkItemSubsidy(wiId, progId);

      const result = getBudgetOverview(db);

      expect(result.subsidySummary.totalReductions).toBe(3000);
    });

    it('returns zero for all subsidy fields when no programs exist', () => {
      const result = getBudgetOverview(db);

      expect(result.subsidySummary.totalReductions).toBe(0);
      expect(result.subsidySummary.activeSubsidyCount).toBe(0);
    });
  });

  // ─── Full integration scenario ────────────────────────────────────────────

  describe('full integration scenario', () => {
    it('returns correct overview with all entities populated', () => {
      // 1. Budget categories
      const catA = insertBudgetCategory('Full Test Cat A', '#FF0000');
      const catB = insertBudgetCategory('Full Test Cat B', '#00FF00');

      // 2. Budget source
      const srcId = insertBudgetSource({ totalAmount: 200000, status: 'active' });

      // 3. Work items
      const wi1 = insertWorkItem({
        plannedBudget: 50000,
        actualCost: 45000,
        budgetCategoryId: catA,
        budgetSourceId: srcId,
      });
      const wi2 = insertWorkItem({
        plannedBudget: 30000,
        actualCost: 32000,
        budgetCategoryId: catB,
      });
      insertWorkItem({ plannedBudget: 20000, actualCost: null, budgetCategoryId: catA });

      // 4. Vendors and invoices
      const vendor = insertVendor('Main Contractor');
      insertInvoice({ vendorId: vendor, amount: 45000, status: 'paid' });
      insertInvoice({ vendorId: vendor, amount: 5000, status: 'claimed' });

      // 5. Subsidy programs
      const prog = insertSubsidyProgram({
        reductionType: 'percentage',
        reductionValue: 10,
        applicationStatus: 'approved',
      });
      linkWorkItemSubsidy(wi1, prog); // 50000 * 10/100 = 5000

      const result = getBudgetOverview(db);

      // Top-level totals
      expect(result.totalPlannedBudget).toBe(100000);
      expect(result.totalActualCost).toBe(77000); // 45000 + 32000 + 0
      expect(result.totalVariance).toBe(23000);

      // Financing — only wi1 references active source
      expect(result.financingSummary.totalAvailable).toBe(200000);
      expect(result.financingSummary.totalUsed).toBe(45000);
      expect(result.financingSummary.totalRemaining).toBe(155000);
      expect(result.financingSummary.sourceCount).toBe(1);

      // Vendors
      expect(result.vendorSummary.totalPaid).toBe(45000);
      expect(result.vendorSummary.totalOutstanding).toBe(5000);
      expect(result.vendorSummary.vendorCount).toBe(1);

      // Subsidies
      expect(result.subsidySummary.totalReductions).toBe(5000);
      expect(result.subsidySummary.activeSubsidyCount).toBe(1);

      // Category A: wi1 (50000/45000) + wi3 (20000/null)
      const a = result.categorySummaries.find((c) => c.categoryId === catA);
      expect(a!.plannedBudget).toBe(70000);
      expect(a!.actualCost).toBe(45000);
      expect(a!.workItemCount).toBe(2);

      // Category B: wi2 only
      const b = result.categorySummaries.find((c) => c.categoryId === catB);
      expect(b!.plannedBudget).toBe(30000);
      expect(b!.actualCost).toBe(32000);
      expect(b!.workItemCount).toBe(1);

      // Unused work item variable warning suppression
      void wi2;
    });
  });
});
