import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import { getBudgetBreakdown } from './budgetBreakdownService.js';
import { CONFIDENCE_MARGINS } from '@cornerstone/shared';

describe('getBudgetBreakdown', () => {
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
   * Insert a work item with an optional budget line.
   * Returns { workItemId, budgetLineId }.
   */
  function insertWorkItem(
    opts: {
      title?: string;
      plannedAmount?: number;
      confidence?: 'own_estimate' | 'professional_estimate' | 'quote' | 'invoice';
      budgetCategoryId?: string | null;
      actualCost?: number; // creates a paid invoice linked to this budget line
      noBudgetLine?: boolean; // create WI without any budget lines
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

    if (opts.noBudgetLine) {
      return { workItemId: id, budgetLineId: null };
    }

    const budgetId = `bud-test-${idCounter++}`;
    db.insert(schema.workItemBudgets)
      .values({
        id: budgetId,
        workItemId: id,
        plannedAmount: opts.plannedAmount ?? 1000,
        confidence: opts.confidence ?? 'own_estimate',
        budgetCategoryId: opts.budgetCategoryId ?? null,
        budgetSourceId: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    if (opts.actualCost != null && opts.actualCost > 0) {
      const vendorId = `vendor-test-${idCounter++}`;
      db.insert(schema.vendors)
        .values({ id: vendorId, name: `Vendor ${vendorId}`, createdAt: now, updatedAt: now })
        .run();
      const invoiceId = `inv-test-${idCounter++}`;
      db.insert(schema.invoices)
        .values({
          id: invoiceId,
          vendorId,
          amount: opts.actualCost,
          date: '2026-01-01',
          status: 'paid',
          createdAt: now,
          updatedAt: now,
        })
        .run();
      db.insert(schema.invoiceBudgetLines)
        .values({
          id: randomUUID(),
          invoiceId,
          workItemBudgetId: budgetId,
          itemizedAmount: opts.actualCost,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    }

    return { workItemId: id, budgetLineId: budgetId };
  }

  /**
   * Insert a second budget line on an existing work item.
   */
  function insertWorkItemBudgetLine(opts: {
    workItemId: string;
    plannedAmount?: number;
    confidence?: 'own_estimate' | 'professional_estimate' | 'quote' | 'invoice';
    budgetCategoryId?: string | null;
    actualCost?: number;
  }): string {
    const id = `bud-extra-${idCounter++}`;
    const now = new Date().toISOString();
    db.insert(schema.workItemBudgets)
      .values({
        id,
        workItemId: opts.workItemId,
        plannedAmount: opts.plannedAmount ?? 500,
        confidence: opts.confidence ?? 'own_estimate',
        budgetCategoryId: opts.budgetCategoryId ?? null,
        budgetSourceId: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    if (opts.actualCost != null && opts.actualCost > 0) {
      const vendorId = `vendor-extra-${idCounter++}`;
      db.insert(schema.vendors)
        .values({ id: vendorId, name: `Vendor ${vendorId}`, createdAt: now, updatedAt: now })
        .run();
      const invoiceId = `inv-extra-${idCounter++}`;
      db.insert(schema.invoices)
        .values({
          id: invoiceId,
          vendorId,
          amount: opts.actualCost,
          date: '2026-01-01',
          status: 'paid',
          createdAt: now,
          updatedAt: now,
        })
        .run();
      db.insert(schema.invoiceBudgetLines)
        .values({
          id: randomUUID(),
          invoiceId,
          workItemBudgetId: id,
          itemizedAmount: opts.actualCost,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    }

    return id;
  }

  /**
   * Insert a household item with an optional budget line.
   * Returns { householdItemId, budgetLineId }.
   */
  function insertHouseholdItem(
    opts: {
      name?: string;
      category?:
        | 'hic-furniture'
        | 'hic-appliances'
        | 'hic-fixtures'
        | 'hic-decor'
        | 'hic-electronics'
        | 'hic-outdoor'
        | 'hic-storage'
        | 'hic-other';
      plannedAmount?: number;
      confidence?: 'own_estimate' | 'professional_estimate' | 'quote' | 'invoice';
      budgetCategoryId?: string | null;
      actualCost?: number;
      noBudgetLine?: boolean;
    } = {},
  ): { householdItemId: string; budgetLineId: string | null } {
    const id = `hi-test-${idCounter++}`;
    const now = new Date().toISOString();
    db.insert(schema.householdItems)
      .values({
        id,
        name: opts.name ?? `Household Item ${id}`,
        categoryId: opts.category ?? 'hic-furniture',
        status: 'planned',
        quantity: 1,
        isLate: false,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    if (opts.noBudgetLine) {
      return { householdItemId: id, budgetLineId: null };
    }

    const budgetId = `hibud-test-${idCounter++}`;
    db.insert(schema.householdItemBudgets)
      .values({
        id: budgetId,
        householdItemId: id,
        plannedAmount: opts.plannedAmount ?? 500,
        confidence: opts.confidence ?? 'own_estimate',
        budgetCategoryId: opts.budgetCategoryId ?? null,
        budgetSourceId: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    if (opts.actualCost != null && opts.actualCost > 0) {
      const vendorId = `vendor-hi-${idCounter++}`;
      db.insert(schema.vendors)
        .values({ id: vendorId, name: `Vendor ${vendorId}`, createdAt: now, updatedAt: now })
        .run();
      const invoiceId = `inv-hi-${idCounter++}`;
      db.insert(schema.invoices)
        .values({
          id: invoiceId,
          vendorId,
          amount: opts.actualCost,
          date: '2026-01-01',
          status: 'paid',
          createdAt: now,
          updatedAt: now,
        })
        .run();
      db.insert(schema.invoiceBudgetLines)
        .values({
          id: randomUUID(),
          invoiceId,
          householdItemBudgetId: budgetId,
          itemizedAmount: opts.actualCost,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    }

    return { householdItemId: id, budgetLineId: budgetId };
  }

  /**
   * Insert a subsidy program.
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
        name: opts.name ?? `Subsidy ${id}`,
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

  function linkHouseholdItemSubsidy(householdItemId: string, subsidyProgramId: string) {
    db.insert(schema.householdItemSubsidies).values({ householdItemId, subsidyProgramId }).run();
  }

  /**
   * Insert a budget source and return its id.
   */
  function insertBudgetSource(
    opts: {
      name?: string;
      totalAmount?: number;
      sourceType?: 'bank_loan' | 'credit_line' | 'savings' | 'other' | 'discretionary';
    } = {},
  ): string {
    const id = `src-test-${idCounter++}`;
    const now = new Date().toISOString();
    db.insert(schema.budgetSources)
      .values({
        id,
        name: opts.name ?? `Budget Source ${id}`,
        sourceType: opts.sourceType ?? 'bank_loan',
        totalAmount: opts.totalAmount ?? 100000,
        status: 'active',
        isDiscretionary: false,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  /**
   * Insert a work item budget line with a specific budget source assigned.
   * Returns the budget line id.
   */
  function insertWorkItemWithSource(opts: {
    plannedAmount?: number;
    confidence?: 'own_estimate' | 'professional_estimate' | 'quote' | 'invoice';
    budgetSourceId: string | null;
  }): { workItemId: string; budgetLineId: string } {
    const id = `wi-src-${idCounter++}`;
    const budgetId = `bud-src-${idCounter++}`;
    const now = new Date().toISOString();
    db.insert(schema.workItems)
      .values({
        id,
        title: `Work Item with Source ${id}`,
        status: 'not_started',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    db.insert(schema.workItemBudgets)
      .values({
        id: budgetId,
        workItemId: id,
        plannedAmount: opts.plannedAmount ?? 1000,
        confidence: opts.confidence ?? 'own_estimate',
        budgetCategoryId: null,
        budgetSourceId: opts.budgetSourceId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return { workItemId: id, budgetLineId: budgetId };
  }

  /**
   * Insert a household item budget line with a specific budget source assigned.
   * Returns the budget line id.
   */
  function insertHouseholdItemWithSource(opts: {
    plannedAmount?: number;
    confidence?: 'own_estimate' | 'professional_estimate' | 'quote' | 'invoice';
    budgetSourceId: string | null;
  }): { householdItemId: string; budgetLineId: string } {
    const id = `hi-src-${idCounter++}`;
    const budgetId = `hibud-src-${idCounter++}`;
    const now = new Date().toISOString();
    db.insert(schema.householdItems)
      .values({
        id,
        name: `Household Item with Source ${id}`,
        categoryId: 'hic-furniture',
        status: 'planned',
        quantity: 1,
        isLate: false,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    db.insert(schema.householdItemBudgets)
      .values({
        id: budgetId,
        householdItemId: id,
        plannedAmount: opts.plannedAmount ?? 500,
        confidence: opts.confidence ?? 'own_estimate',
        budgetCategoryId: null,
        budgetSourceId: opts.budgetSourceId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return { householdItemId: id, budgetLineId: budgetId };
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

  // ── 1. Empty database ──────────────────────────────────────────────────────

  describe('empty database', () => {
    it('returns workItems with empty areas and zero totals', () => {
      const result = getBudgetBreakdown(db);

      expect(result.workItems.areas).toHaveLength(0);
      expect(result.workItems.totals.projectedMin).toBe(0);
      expect(result.workItems.totals.projectedMax).toBe(0);
      expect(result.workItems.totals.actualCost).toBe(0);
      expect(result.workItems.totals.subsidyPayback).toBe(0);
    });

    it('returns householdItems with empty areas and zero totals', () => {
      const result = getBudgetBreakdown(db);

      expect(result.householdItems.areas).toHaveLength(0);
      expect(result.householdItems.totals.projectedMin).toBe(0);
      expect(result.householdItems.totals.projectedMax).toBe(0);
      expect(result.householdItems.totals.actualCost).toBe(0);
      expect(result.householdItems.totals.subsidyPayback).toBe(0);
    });
  });

  // ── 2. WI with no budget lines ─────────────────────────────────────────────

  describe('work item with no budget lines', () => {
    it('is not included in breakdown areas', () => {
      insertWorkItem({ noBudgetLine: true });

      const result = getBudgetBreakdown(db);

      // No budget lines → not in breakdown (Unassigned node only appears if items have budget lines)
      expect(result.workItems.areas).toHaveLength(0);
    });
  });

  // ── 3. Single WI with one budget line, no invoices ─────────────────────────

  describe('single WI with one projected budget line', () => {
    it('sets costDisplay to projected', () => {
      insertWorkItem({ plannedAmount: 1000, confidence: 'own_estimate' });

      const result = getBudgetBreakdown(db);

      // No area → Unassigned bucket at areas[0]
      expect(result.workItems.areas).toHaveLength(1);
      const area = result.workItems.areas[0]!;
      expect(area.items).toHaveLength(1);
      expect(area.items[0]!.costDisplay).toBe('projected');
    });

    it('computes projectedMin and projectedMax using own_estimate margin (20%)', () => {
      // own_estimate margin = 0.2 → min = 1000 * 0.8 = 800, max = 1000 * 1.2 = 1200
      insertWorkItem({ plannedAmount: 1000, confidence: 'own_estimate' });

      const result = getBudgetBreakdown(db);

      const item = result.workItems.areas[0]!.items[0]!;
      expect(item.projectedMin).toBeCloseTo(800, 5);
      expect(item.projectedMax).toBeCloseTo(1200, 5);
    });

    it('computes projectedMin and projectedMax using quote margin (5%)', () => {
      // quote margin = 0.05 → min = 2000 * 0.95 = 1900, max = 2000 * 1.05 = 2100
      insertWorkItem({ plannedAmount: 2000, confidence: 'quote' });

      const result = getBudgetBreakdown(db);

      const item = result.workItems.areas[0]!.items[0]!;
      expect(item.projectedMin).toBeCloseTo(1900, 5);
      expect(item.projectedMax).toBeCloseTo(2100, 5);
    });

    it('has subsidyPayback of 0 when no subsidy linked', () => {
      insertWorkItem({ plannedAmount: 1000, confidence: 'own_estimate' });

      const result = getBudgetBreakdown(db);

      const item = result.workItems.areas[0]!.items[0]!;
      expect(item.subsidyPayback).toBe(0);
    });

    it('has actualCost of 0 when no invoices', () => {
      insertWorkItem({ plannedAmount: 1000, confidence: 'own_estimate' });

      const result = getBudgetBreakdown(db);

      const item = result.workItems.areas[0]!.items[0]!;
      expect(item.actualCost).toBe(0);
    });

    it('has one budget line with hasInvoice=false', () => {
      insertWorkItem({ plannedAmount: 1000, confidence: 'own_estimate' });

      const result = getBudgetBreakdown(db);

      const item = result.workItems.areas[0]!.items[0]!;
      expect(item.budgetLines).toHaveLength(1);
      expect(item.budgetLines[0]!.hasInvoice).toBe(false);
      expect(item.budgetLines[0]!.actualCost).toBe(0);
    });
  });

  // ── 4. Single WI with all invoiced lines ──────────────────────────────────

  describe('single WI with all invoiced lines', () => {
    it('sets costDisplay to actual', () => {
      insertWorkItem({ plannedAmount: 1000, confidence: 'invoice', actualCost: 950 });

      const result = getBudgetBreakdown(db);

      const item = result.workItems.areas[0]!.items[0]!;
      expect(item.costDisplay).toBe('actual');
    });

    it('sets projectedMin and projectedMax equal to actualCost', () => {
      insertWorkItem({ plannedAmount: 1000, confidence: 'invoice', actualCost: 950 });

      const result = getBudgetBreakdown(db);

      const item = result.workItems.areas[0]!.items[0]!;
      expect(item.actualCost).toBe(950);
      // invoice confidence with actualCost: projected = actualCost
      expect(item.projectedMin).toBeCloseTo(950, 5);
      expect(item.projectedMax).toBeCloseTo(950, 5);
    });

    it('has budgetLine with hasInvoice=true and correct actualCost', () => {
      insertWorkItem({ plannedAmount: 1000, confidence: 'invoice', actualCost: 750 });

      const result = getBudgetBreakdown(db);

      const item = result.workItems.areas[0]!.items[0]!;
      expect(item.budgetLines[0]!.hasInvoice).toBe(true);
      expect(item.budgetLines[0]!.actualCost).toBe(750);
    });
  });

  // ── 5. Single WI with mixed lines (one invoiced, one not) ─────────────────

  describe('single WI with mixed budget lines', () => {
    it('sets costDisplay to mixed', () => {
      const { workItemId } = insertWorkItem({
        plannedAmount: 1000,
        confidence: 'invoice',
        actualCost: 900,
      });
      insertWorkItemBudgetLine({
        workItemId,
        plannedAmount: 500,
        confidence: 'own_estimate',
        // No actualCost → not invoiced
      });

      const result = getBudgetBreakdown(db);

      // No area → single Unassigned bucket
      expect(result.workItems.areas).toHaveLength(1);
      const item = result.workItems.areas[0]!.items[0]!;
      expect(item.costDisplay).toBe('mixed');
    });

    it('sums projected amounts across both lines', () => {
      // Line 1: invoiced at 900 → projected min/max = 900
      // Line 2: own_estimate 500 → projected min = 400, max = 600
      // Total projected: min = 1300, max = 1500 (before subsidy)
      const { workItemId } = insertWorkItem({
        plannedAmount: 1000,
        confidence: 'invoice',
        actualCost: 900,
      });
      insertWorkItemBudgetLine({
        workItemId,
        plannedAmount: 500,
        confidence: 'own_estimate',
      });

      const result = getBudgetBreakdown(db);

      const item = result.workItems.areas[0]!.items[0]!;
      expect(item.actualCost).toBe(900); // only invoiced line
      expect(item.projectedMin).toBeCloseTo(900 + 500 * (1 - CONFIDENCE_MARGINS.own_estimate), 5);
      expect(item.projectedMax).toBeCloseTo(900 + 500 * (1 + CONFIDENCE_MARGINS.own_estimate), 5);
    });

    it('has two budget lines — one with hasInvoice=true, one with false', () => {
      const { workItemId } = insertWorkItem({
        plannedAmount: 1000,
        confidence: 'invoice',
        actualCost: 900,
      });
      insertWorkItemBudgetLine({
        workItemId,
        plannedAmount: 500,
        confidence: 'own_estimate',
      });

      const result = getBudgetBreakdown(db);

      const item = result.workItems.areas[0]!.items[0]!;
      expect(item.budgetLines).toHaveLength(2);
      const invoicedLines = item.budgetLines.filter((l) => l.hasInvoice);
      const projectedLines = item.budgetLines.filter((l) => !l.hasInvoice);
      expect(invoicedLines).toHaveLength(1);
      expect(projectedLines).toHaveLength(1);
    });
  });

  // ── 6. Two WI items in the same area ─────────────────────────────────────

  describe('two WI items in the same area', () => {
    it('both appear under the same area node', () => {
      const ts = new Date().toISOString();
      const areaId = `area-test-six-${idCounter++}`;
      db.insert(schema.areas)
        .values({
          id: areaId,
          name: 'SameArea',
          parentId: null,
          color: null,
          sortOrder: 100,
          createdAt: ts,
          updatedAt: ts,
        })
        .run();
      insertWorkItem({ title: 'Item A', plannedAmount: 1000 });
      insertWorkItem({ title: 'Item B', plannedAmount: 2000 });

      // Both items have no areaId → both appear in Unassigned bucket
      const result = getBudgetBreakdown(db);

      const unassigned = result.workItems.areas.find((a) => a.areaId === null);
      expect(unassigned).toBeDefined();
      expect(unassigned!.items).toHaveLength(2);
    });

    it('area totals sum correctly across both items', () => {
      // Item A: own_estimate, planned=1000 → max=1200
      // Item B: quote, planned=2000 → max=2100
      insertWorkItem({ plannedAmount: 1000, confidence: 'own_estimate' });
      insertWorkItem({ plannedAmount: 2000, confidence: 'quote' });

      const result = getBudgetBreakdown(db);

      // Both items have null area → Unassigned bucket
      const unassigned = result.workItems.areas.find((a) => a.areaId === null)!;
      expect(unassigned.projectedMax).toBeCloseTo(1200 + 2100, 5);
      expect(unassigned.projectedMin).toBeCloseTo(800 + 1900, 5);
    });
  });

  // ── 7. WI item with no area (null areaId) ────────────────────────────────

  describe('WI item with null areaId', () => {
    it('appears under synthetic Unassigned node (areaId=null, name=Unassigned)', () => {
      insertWorkItem({ plannedAmount: 500 });

      const result = getBudgetBreakdown(db);

      const unassigned = result.workItems.areas.find((a) => a.areaId === null);
      expect(unassigned).toBeDefined();
      expect(unassigned!.name).toBe('Unassigned');
      expect(unassigned!.items).toHaveLength(1);
    });
  });

  // ── 8. WI item with a percentage subsidy ─────────────────────────────────

  describe('WI item with a percentage subsidy', () => {
    it('computes subsidyPayback correctly for universal percentage subsidy', () => {
      // own_estimate, planned=1000 → max amount for payback = 1000 * 1.2 = 1200
      // subsidy: 10% → payback = 1200 * 0.1 = 120
      const { workItemId } = insertWorkItem({
        plannedAmount: 1000,
        confidence: 'own_estimate',
      });
      const subsidyId = insertSubsidyProgram({
        reductionType: 'percentage',
        reductionValue: 10,
      });
      linkWorkItemSubsidy(workItemId, subsidyId);

      const result = getBudgetBreakdown(db);

      const item = result.workItems.areas[0]!.items[0]!;
      expect(item.subsidyPayback).toBeCloseTo(120, 5);
    });

    it('reduces projectedMin and projectedMax by subsidyPayback', () => {
      // own_estimate, planned=1000 → min=800, max=1200; payback=120
      // adjusted min = max(0, 800 - 120) = 680
      // adjusted max = max(0, 1200 - 120) = 1080
      const { workItemId } = insertWorkItem({
        plannedAmount: 1000,
        confidence: 'own_estimate',
      });
      const subsidyId = insertSubsidyProgram({
        reductionType: 'percentage',
        reductionValue: 10,
      });
      linkWorkItemSubsidy(workItemId, subsidyId);

      const result = getBudgetBreakdown(db);

      const item = result.workItems.areas[0]!.items[0]!;
      expect(item.projectedMin).toBeCloseTo(680, 5);
      expect(item.projectedMax).toBeCloseTo(1080, 5);
    });

    it('excluded rejected subsidy programs from payback computation', () => {
      const { workItemId } = insertWorkItem({ plannedAmount: 1000, confidence: 'own_estimate' });
      const subsidyId = insertSubsidyProgram({
        reductionType: 'percentage',
        reductionValue: 50,
        applicationStatus: 'rejected',
      });
      linkWorkItemSubsidy(workItemId, subsidyId);

      const result = getBudgetBreakdown(db);

      const item = result.workItems.areas[0]!.items[0]!;
      expect(item.subsidyPayback).toBe(0);
    });

    it('computes area-level subsidyPayback as sum of item paybacks', () => {
      // Both WI have null area → both go to Unassigned bucket
      const { workItemId: idA } = insertWorkItem({
        plannedAmount: 1000,
        confidence: 'own_estimate',
      });
      const { workItemId: idB } = insertWorkItem({
        plannedAmount: 2000,
        confidence: 'own_estimate',
      });
      const subsidyId = insertSubsidyProgram({ reductionType: 'percentage', reductionValue: 10 });
      linkWorkItemSubsidy(idA, subsidyId);
      linkWorkItemSubsidy(idB, subsidyId);

      const result = getBudgetBreakdown(db);

      const unassigned = result.workItems.areas.find((a) => a.areaId === null)!;
      // Item A: payback = 1000*1.2*0.1 = 120; Item B: payback = 2000*1.2*0.1 = 240
      expect(unassigned.subsidyPayback).toBeCloseTo(360, 5);
    });
  });

  // ── 9. Household item with budget line ────────────────────────────────────

  describe('household item with budget line', () => {
    it('appears in the Unassigned area node (null areaId) when no area assigned', () => {
      insertHouseholdItem({ name: 'Sofa', category: 'hic-furniture', plannedAmount: 800 });

      const result = getBudgetBreakdown(db);

      // HI has no area → Unassigned bucket
      expect(result.householdItems.areas).toHaveLength(1);
      const area = result.householdItems.areas[0]!;
      expect(area.areaId).toBeNull();
      expect(area.name).toBe('Unassigned');
      expect(area.items).toHaveLength(1);
      expect((area.items[0] as { name: string }).name).toBe('Sofa');
    });

    it('sets costDisplay to projected when no invoices', () => {
      insertHouseholdItem({ category: 'hic-appliances', plannedAmount: 1200, confidence: 'quote' });

      const result = getBudgetBreakdown(db);

      const item = result.householdItems.areas[0]!.items[0]!;
      expect(item.costDisplay).toBe('projected');
    });

    it('computes projectedMin and projectedMax using quote margin (5%)', () => {
      // quote margin = 0.05 → min=1140, max=1260
      insertHouseholdItem({ category: 'hic-appliances', plannedAmount: 1200, confidence: 'quote' });

      const result = getBudgetBreakdown(db);

      const item = result.householdItems.areas[0]!.items[0]!;
      expect(item.projectedMin).toBeCloseTo(1200 * 0.95, 5);
      expect(item.projectedMax).toBeCloseTo(1200 * 1.05, 5);
    });

    it('sets costDisplay to actual when all invoiced', () => {
      insertHouseholdItem({
        category: 'hic-fixtures',
        plannedAmount: 500,
        confidence: 'invoice',
        actualCost: 480,
      });

      const result = getBudgetBreakdown(db);

      const item = result.householdItems.areas[0]!.items[0]!;
      expect(item.costDisplay).toBe('actual');
      expect(item.actualCost).toBe(480);
    });
  });

  // ── 10. HI items — area grouping ──────────────────────────────────────────

  describe('HI items — multiple HI items go to Unassigned when no area', () => {
    it('multiple null-area HI items share the same Unassigned bucket', () => {
      insertHouseholdItem({ category: 'hic-furniture', plannedAmount: 500 });
      insertHouseholdItem({ category: 'hic-electronics', plannedAmount: 300 });

      const result = getBudgetBreakdown(db);

      // Both items have null area → single Unassigned bucket with 2 items
      expect(result.householdItems.areas).toHaveLength(1);
      expect(result.householdItems.areas[0]!.areaId).toBeNull();
      expect(result.householdItems.areas[0]!.items).toHaveLength(2);
    });

    it('HI items in different named areas appear in separate area nodes', () => {
      const ts = new Date().toISOString();
      const areaIdA = `area-hi-a-${idCounter++}`;
      const areaIdB = `area-hi-b-${idCounter++}`;
      db.insert(schema.areas)
        .values({
          id: areaIdA,
          name: 'Living Room',
          parentId: null,
          color: null,
          sortOrder: 10,
          createdAt: ts,
          updatedAt: ts,
        })
        .run();
      db.insert(schema.areas)
        .values({
          id: areaIdB,
          name: 'Bedroom',
          parentId: null,
          color: null,
          sortOrder: 20,
          createdAt: ts,
          updatedAt: ts,
        })
        .run();
      // Insert HI with areaId via direct DB insert (helper doesn't expose areaId)
      const hiIdA = `hi-direct-a-${idCounter++}`;
      const hiIdB = `hi-direct-b-${idCounter++}`;
      const hibIdA = `hibud-direct-a-${idCounter++}`;
      const hibIdB = `hibud-direct-b-${idCounter++}`;
      db.insert(schema.householdItems)
        .values({
          id: hiIdA,
          name: 'Sofa',
          categoryId: 'hic-furniture',
          status: 'planned',
          quantity: 1,
          isLate: false,
          areaId: areaIdA,
          createdAt: ts,
          updatedAt: ts,
        })
        .run();
      db.insert(schema.householdItemBudgets)
        .values({
          id: hibIdA,
          householdItemId: hiIdA,
          plannedAmount: 500,
          confidence: 'own_estimate',
          budgetCategoryId: null,
          budgetSourceId: null,
          createdAt: ts,
          updatedAt: ts,
        })
        .run();
      db.insert(schema.householdItems)
        .values({
          id: hiIdB,
          name: 'TV',
          categoryId: 'hic-electronics',
          status: 'planned',
          quantity: 1,
          isLate: false,
          areaId: areaIdB,
          createdAt: ts,
          updatedAt: ts,
        })
        .run();
      db.insert(schema.householdItemBudgets)
        .values({
          id: hibIdB,
          householdItemId: hiIdB,
          plannedAmount: 300,
          confidence: 'own_estimate',
          budgetCategoryId: null,
          budgetSourceId: null,
          createdAt: ts,
          updatedAt: ts,
        })
        .run();

      const result = getBudgetBreakdown(db);

      const areaIds = result.householdItems.areas.map((a) => a.areaId);
      expect(areaIds).toContain(areaIdA);
      expect(areaIds).toContain(areaIdB);
    });
  });

  // ── 11. Section totals validation ────────────────────────────────────────

  describe('section totals', () => {
    it('wiTotals.projectedMax equals sum of all area projectedMax values', () => {
      // Both items have null areaId → land in the single Unassigned area node
      insertWorkItem({ plannedAmount: 1000, confidence: 'own_estimate' });
      insertWorkItem({ plannedAmount: 2000, confidence: 'quote' });

      const result = getBudgetBreakdown(db);

      const sumMax = result.workItems.areas.reduce((acc, a) => acc + a.projectedMax, 0);
      expect(result.workItems.totals.projectedMax).toBeCloseTo(sumMax, 5);
    });

    it('hiTotals.projectedMax equals sum of all HI area projectedMax values', () => {
      insertHouseholdItem({ category: 'hic-furniture', plannedAmount: 800, confidence: 'quote' });
      insertHouseholdItem({
        category: 'hic-electronics',
        plannedAmount: 400,
        confidence: 'own_estimate',
      });

      const result = getBudgetBreakdown(db);

      const sumMax = result.householdItems.areas.reduce((acc, a) => acc + a.projectedMax, 0);
      expect(result.householdItems.totals.projectedMax).toBeCloseTo(sumMax, 5);
    });

    it('wiTotals.actualCost equals sum of all actual costs', () => {
      insertWorkItem({ plannedAmount: 1000, confidence: 'invoice', actualCost: 950 });
      insertWorkItem({ plannedAmount: 2000, confidence: 'invoice', actualCost: 1800 });

      const result = getBudgetBreakdown(db);

      expect(result.workItems.totals.actualCost).toBe(950 + 1800);
    });
  });

  // ── 12. HI subsidy payback ───────────────────────────────────────────────

  describe('HI item with subsidy payback', () => {
    it('computes subsidyPayback for household item with percentage subsidy', () => {
      // own_estimate, planned=1000 → max=1200; subsidy 20% → payback=240
      const { householdItemId } = insertHouseholdItem({
        category: 'hic-furniture',
        plannedAmount: 1000,
        confidence: 'own_estimate',
      });
      const subsidyId = insertSubsidyProgram({
        reductionType: 'percentage',
        reductionValue: 20,
      });
      linkHouseholdItemSubsidy(householdItemId, subsidyId);

      const result = getBudgetBreakdown(db);

      const item = result.householdItems.areas[0]!.items[0]!;
      expect(item.subsidyPayback).toBeCloseTo(240, 5);
    });
  });

  // ── 13. Mixed WI and HI data ──────────────────────────────────────────────

  describe('mixed WI and HI data', () => {
    it('returns both workItems and householdItems sections independently', () => {
      insertWorkItem({ plannedAmount: 5000, confidence: 'quote' });
      insertHouseholdItem({
        category: 'hic-decor',
        plannedAmount: 300,
        confidence: 'own_estimate',
      });

      const result = getBudgetBreakdown(db);

      // Both items have null areaId → one Unassigned area node each
      expect(result.workItems.areas).toHaveLength(1);
      expect(result.householdItems.areas).toHaveLength(1);
    });
  });

  // ── 14. rawProjectedMin/Max and minSubsidyPayback fields ─────────────────

  describe('rawProjectedMin and rawProjectedMax (gross projected cost, pre-subsidy)', () => {
    it('rawProjectedMin equals gross projectedMin before subsidy deduction', () => {
      // own_estimate, planned=1000 → gross min = 800, gross max = 1200
      // subsidy 10% → payback = 1200 * 0.1 = 120
      // adjustedMin = 800 - 120 = 680, but rawProjectedMin stays 800
      const { workItemId } = insertWorkItem({
        plannedAmount: 1000,
        confidence: 'own_estimate',
      });
      const subsidyId = insertSubsidyProgram({
        reductionType: 'percentage',
        reductionValue: 10,
      });
      linkWorkItemSubsidy(workItemId, subsidyId);

      const result = getBudgetBreakdown(db);

      const item = result.workItems.areas[0]!.items[0]!;
      // projectedMin is subsidy-adjusted (680), rawProjectedMin is gross (800)
      expect(item.rawProjectedMin).toBeCloseTo(800, 5);
      expect(item.rawProjectedMax).toBeCloseTo(1200, 5);
      expect(item.projectedMin).toBeCloseTo(680, 5);
      expect(item.projectedMax).toBeCloseTo(1080, 5);
    });

    it('rawProjectedMin equals projectedMin when no subsidy is linked', () => {
      insertWorkItem({ plannedAmount: 1000, confidence: 'own_estimate' });

      const result = getBudgetBreakdown(db);

      const item = result.workItems.areas[0]!.items[0]!;
      // No subsidy → raw and adjusted values are identical
      expect(item.rawProjectedMin).toBeCloseTo(item.projectedMin, 5);
      expect(item.rawProjectedMax).toBeCloseTo(item.projectedMax, 5);
    });

    it('rawProjectedMin/Max equals actualCost for fully-invoiced item', () => {
      // invoice confidence with actualCost: gross projected = actualCost (no margin)
      insertWorkItem({ plannedAmount: 1000, confidence: 'invoice', actualCost: 950 });

      const result = getBudgetBreakdown(db);

      const item = result.workItems.areas[0]!.items[0]!;
      expect(item.rawProjectedMin).toBeCloseTo(950, 5);
      expect(item.rawProjectedMax).toBeCloseTo(950, 5);
    });

    it('area rawProjectedMin/Max aggregates correctly across items', () => {
      // Item A: own_estimate, planned=1000 → raw min=800, raw max=1200
      // Item B: quote, planned=2000 → raw min=1900, raw max=2100
      // Both land in the Unassigned area node (null areaId)
      const { workItemId: idA } = insertWorkItem({
        plannedAmount: 1000,
        confidence: 'own_estimate',
      });
      insertWorkItem({ plannedAmount: 2000, confidence: 'quote' });
      // Link subsidy to A to separate raw vs adjusted
      const subsidyId = insertSubsidyProgram({
        reductionType: 'percentage',
        reductionValue: 10,
      });
      linkWorkItemSubsidy(idA, subsidyId);

      const result = getBudgetBreakdown(db);

      const unassigned = result.workItems.areas[0]!;
      // Item A raw min=800, Item B raw min=1900 → area raw min=2700
      expect(unassigned.rawProjectedMin).toBeCloseTo(800 + 1900, 5);
      expect(unassigned.rawProjectedMax).toBeCloseTo(1200 + 2100, 5);
    });

    it('wiTotals.rawProjectedMin/Max equals sum of area raw fields', () => {
      // Items land in Unassigned bucket; check totals aggregate the single area node
      insertWorkItem({ plannedAmount: 1000, confidence: 'own_estimate' });
      insertWorkItem({ plannedAmount: 2000, confidence: 'quote' });

      const result = getBudgetBreakdown(db);

      const sumRawMin = result.workItems.areas.reduce((acc, a) => acc + a.rawProjectedMin, 0);
      const sumRawMax = result.workItems.areas.reduce((acc, a) => acc + a.rawProjectedMax, 0);
      expect(result.workItems.totals.rawProjectedMin).toBeCloseTo(sumRawMin, 5);
      expect(result.workItems.totals.rawProjectedMax).toBeCloseTo(sumRawMax, 5);
    });

    it('HI item exposes rawProjectedMin/Max correctly', () => {
      // quote, planned=1200 → gross min=1140, gross max=1260
      const { householdItemId } = insertHouseholdItem({
        category: 'hic-appliances',
        plannedAmount: 1200,
        confidence: 'quote',
      });
      const subsidyId = insertSubsidyProgram({
        reductionType: 'percentage',
        reductionValue: 20,
      });
      linkHouseholdItemSubsidy(householdItemId, subsidyId);

      const result = getBudgetBreakdown(db);

      const item = result.householdItems.areas[0]!.items[0]!;
      expect(item.rawProjectedMin).toBeCloseTo(1200 * 0.95, 5);
      expect(item.rawProjectedMax).toBeCloseTo(1200 * 1.05, 5);
      // adjusted values are reduced by subsidy payback
      expect(item.projectedMin).toBeLessThan(item.rawProjectedMin);
    });
  });

  describe('minSubsidyPayback (uses min-margin amounts for non-invoiced lines)', () => {
    it('minSubsidyPayback uses min-margin (1-margin) for non-invoiced lines', () => {
      // own_estimate margin=0.2: min-margin amount = 1000 * 0.8 = 800
      // subsidy 10% → minSubsidyPayback = 800 * 0.1 = 80
      // max-margin amount = 1000 * 1.2 = 1200 → subsidyPayback = 1200 * 0.1 = 120
      const { workItemId } = insertWorkItem({
        plannedAmount: 1000,
        confidence: 'own_estimate',
      });
      const subsidyId = insertSubsidyProgram({
        reductionType: 'percentage',
        reductionValue: 10,
      });
      linkWorkItemSubsidy(workItemId, subsidyId);

      const result = getBudgetBreakdown(db);

      const item = result.workItems.areas[0]!.items[0]!;
      expect(item.minSubsidyPayback).toBeCloseTo(80, 5);
      expect(item.subsidyPayback).toBeCloseTo(120, 5);
    });

    it('minSubsidyPayback === subsidyPayback for fully-invoiced item', () => {
      // When all lines are invoiced, both min and max payback use actualCost
      const { workItemId } = insertWorkItem({
        plannedAmount: 1000,
        confidence: 'invoice',
        actualCost: 900,
      });
      const subsidyId = insertSubsidyProgram({
        reductionType: 'percentage',
        reductionValue: 15,
      });
      linkWorkItemSubsidy(workItemId, subsidyId);

      const result = getBudgetBreakdown(db);

      const item = result.workItems.areas[0]!.items[0]!;
      // Both use actualCost=900 → payback = 900 * 0.15 = 135
      expect(item.minSubsidyPayback).toBeCloseTo(135, 5);
      expect(item.subsidyPayback).toBeCloseTo(135, 5);
      expect(item.minSubsidyPayback).toBeCloseTo(item.subsidyPayback, 5);
    });

    it('minSubsidyPayback === 0 when no subsidy is linked', () => {
      insertWorkItem({ plannedAmount: 1000, confidence: 'own_estimate' });

      const result = getBudgetBreakdown(db);

      const item = result.workItems.areas[0]!.items[0]!;
      expect(item.minSubsidyPayback).toBe(0);
    });

    it('minSubsidyPayback for HI items uses min-margin correctly', () => {
      // own_estimate margin=0.2: min-margin amount = 1000 * 0.8 = 800
      // subsidy 10% → minSubsidyPayback = 800 * 0.1 = 80
      const { householdItemId } = insertHouseholdItem({
        category: 'hic-furniture',
        plannedAmount: 1000,
        confidence: 'own_estimate',
      });
      const subsidyId = insertSubsidyProgram({
        reductionType: 'percentage',
        reductionValue: 10,
      });
      linkHouseholdItemSubsidy(householdItemId, subsidyId);

      const result = getBudgetBreakdown(db);

      const item = result.householdItems.areas[0]!.items[0]!;
      expect(item.minSubsidyPayback).toBeCloseTo(80, 5);
    });

    it('area minSubsidyPayback aggregates item minSubsidyPaybacks', () => {
      // Item A: own_estimate 1000, 10% subsidy → min payback = 800*0.1 = 80
      // Item B: own_estimate 2000, 10% subsidy → min payback = 1600*0.1 = 160
      // Both land in the Unassigned area node (null areaId)
      const { workItemId: idA } = insertWorkItem({
        plannedAmount: 1000,
        confidence: 'own_estimate',
      });
      const { workItemId: idB } = insertWorkItem({
        plannedAmount: 2000,
        confidence: 'own_estimate',
      });
      const subsidyId = insertSubsidyProgram({ reductionType: 'percentage', reductionValue: 10 });
      linkWorkItemSubsidy(idA, subsidyId);
      linkWorkItemSubsidy(idB, subsidyId);

      const result = getBudgetBreakdown(db);

      const unassigned = result.workItems.areas[0]!;
      expect(unassigned.minSubsidyPayback).toBeCloseTo(80 + 160, 5);
    });

    it('wiTotals.minSubsidyPayback equals sum of area minSubsidyPayback values', () => {
      // Both items go to Unassigned; totals.minSubsidyPayback should equal the single area node's value
      const { workItemId: idA } = insertWorkItem({
        plannedAmount: 1000,
        confidence: 'own_estimate',
      });
      const { workItemId: idB } = insertWorkItem({
        plannedAmount: 2000,
        confidence: 'own_estimate',
      });
      const subsidyId = insertSubsidyProgram({ reductionType: 'percentage', reductionValue: 10 });
      linkWorkItemSubsidy(idA, subsidyId);
      linkWorkItemSubsidy(idB, subsidyId);

      const result = getBudgetBreakdown(db);

      const sumMinPayback = result.workItems.areas.reduce((acc, a) => acc + a.minSubsidyPayback, 0);
      expect(result.workItems.totals.minSubsidyPayback).toBeCloseTo(sumMinPayback, 5);
    });

    it('BreakdownTotals includes rawProjectedMin/Max and minSubsidyPayback as area sums', () => {
      const { workItemId: idA } = insertWorkItem({
        plannedAmount: 500,
        confidence: 'own_estimate',
      });
      const { workItemId: idB } = insertWorkItem({ plannedAmount: 800, confidence: 'quote' });
      const subsidyId = insertSubsidyProgram({ reductionType: 'percentage', reductionValue: 10 });
      linkWorkItemSubsidy(idA, subsidyId);
      linkWorkItemSubsidy(idB, subsidyId);

      const result = getBudgetBreakdown(db);

      const totals = result.workItems.totals;
      const sumRawMin = result.workItems.areas.reduce((acc, a) => acc + a.rawProjectedMin, 0);
      const sumRawMax = result.workItems.areas.reduce((acc, a) => acc + a.rawProjectedMax, 0);
      const sumMinPayback = result.workItems.areas.reduce((acc, a) => acc + a.minSubsidyPayback, 0);
      expect(totals.rawProjectedMin).toBeCloseTo(sumRawMin, 5);
      expect(totals.rawProjectedMax).toBeCloseTo(sumRawMax, 5);
      expect(totals.minSubsidyPayback).toBeCloseTo(sumMinPayback, 5);
    });

    it('empty database returns zero rawProjectedMin/Max and minSubsidyPayback in totals', () => {
      const result = getBudgetBreakdown(db);

      expect(result.workItems.totals.rawProjectedMin).toBe(0);
      expect(result.workItems.totals.rawProjectedMax).toBe(0);
      expect(result.workItems.totals.minSubsidyPayback).toBe(0);
      expect(result.householdItems.totals.rawProjectedMin).toBe(0);
      expect(result.householdItems.totals.rawProjectedMax).toBe(0);
      expect(result.householdItems.totals.minSubsidyPayback).toBe(0);
    });
  });

  // ── 14. Budget line description field ─────────────────────────────────────

  describe('budget line description field', () => {
    it('preserves description when set on a budget line', () => {
      const id = `wi-desc-${idCounter++}`;
      const budgetId = `bud-desc-${idCounter++}`;
      const now = new Date().toISOString();
      db.insert(schema.workItems)
        .values({
          id,
          title: 'Described Work Item',
          status: 'not_started',
          createdAt: now,
          updatedAt: now,
        })
        .run();
      db.insert(schema.workItemBudgets)
        .values({
          id: budgetId,
          workItemId: id,
          description: 'Foundation concrete pour',
          plannedAmount: 3000,
          confidence: 'quote',
          budgetCategoryId: null,
          budgetSourceId: null,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      const result = getBudgetBreakdown(db);

      const item = result.workItems.areas[0]!.items[0]!;
      expect(item.budgetLines[0]!.description).toBe('Foundation concrete pour');
    });

    it('has null description when none is set', () => {
      insertWorkItem({ plannedAmount: 500 });

      const result = getBudgetBreakdown(db);

      const item = result.workItems.areas[0]!.items[0]!;
      expect(item.budgetLines[0]!.description).toBeNull();
    });
  });

  // ── 15. budgetSourceId attribution ─────────────────────────────────────────

  describe('budgetSourceId attribution on budget lines', () => {
    // Scenario 1: budgetSourceId populated on WI lines
    it('populates budgetSourceId on work item budget lines when a source is assigned', () => {
      const sourceId = insertBudgetSource({ name: 'Bank Loan', totalAmount: 200000 });
      const { budgetLineId } = insertWorkItemWithSource({
        plannedAmount: 1000,
        budgetSourceId: sourceId,
      });

      const result = getBudgetBreakdown(db);

      const item = result.workItems.areas[0]!.items[0]!;
      expect(item.budgetLines).toHaveLength(1);
      expect(item.budgetLines[0]!.id).toBe(budgetLineId);
      expect(item.budgetLines[0]!.budgetSourceId).toBe(sourceId);
    });

    // Scenario 2: budgetSourceId null when no source
    it('sets budgetSourceId to null on work item budget lines when no source is assigned', () => {
      insertWorkItemWithSource({ plannedAmount: 1000, budgetSourceId: null });

      const result = getBudgetBreakdown(db);

      const item = result.workItems.areas[0]!.items[0]!;
      expect(item.budgetLines[0]!.budgetSourceId).toBeNull();
    });

    // Scenario 6: HI lines also attributed
    it('populates budgetSourceId on household item budget lines when a source is assigned', () => {
      const sourceId = insertBudgetSource({ name: 'Savings', totalAmount: 50000 });
      const { budgetLineId } = insertHouseholdItemWithSource({
        plannedAmount: 500,
        budgetSourceId: sourceId,
      });

      const result = getBudgetBreakdown(db);

      const hiItem = result.householdItems.areas[0]!.items[0]!;
      expect(hiItem.budgetLines).toHaveLength(1);
      expect(hiItem.budgetLines[0]!.id).toBe(budgetLineId);
      expect(hiItem.budgetLines[0]!.budgetSourceId).toBe(sourceId);
    });

    it('sets budgetSourceId to null on household item budget lines when no source is assigned', () => {
      insertHouseholdItemWithSource({ plannedAmount: 500, budgetSourceId: null });

      const result = getBudgetBreakdown(db);

      const hiItem = result.householdItems.areas[0]!.items[0]!;
      expect(hiItem.budgetLines[0]!.budgetSourceId).toBeNull();
    });
  });

  // ── 16. budgetSources aggregate ────────────────────────────────────────────

  describe('budgetSources aggregate in breakdown result', () => {
    // Scenario 3: budgetSources array populated
    it('includes sources with correct id, name, and totalAmount in budgetSources array', () => {
      const sourceId = insertBudgetSource({ name: 'Bank Loan', totalAmount: 150000 });
      insertWorkItemWithSource({ plannedAmount: 1000, budgetSourceId: sourceId });

      const result = getBudgetBreakdown(db);

      expect(result.budgetSources).toHaveLength(1);
      expect(result.budgetSources[0]!.id).toBe(sourceId);
      expect(result.budgetSources[0]!.name).toBe('Bank Loan');
      expect(result.budgetSources[0]!.totalAmount).toBe(150000);
    });

    // Scenario 4: projectedMin/Max correct for own_estimate confidence
    it('computes correct projectedMin and projectedMax for source with own_estimate line', () => {
      // own_estimate margin = 0.2 → min = 1000 * 0.8 = 800, max = 1000 * 1.2 = 1200
      const sourceId = insertBudgetSource({ name: 'Savings', totalAmount: 100000 });
      insertWorkItemWithSource({
        plannedAmount: 1000,
        confidence: 'own_estimate',
        budgetSourceId: sourceId,
      });

      const result = getBudgetBreakdown(db);

      expect(result.budgetSources).toHaveLength(1);
      const src = result.budgetSources[0]!;
      expect(src.projectedMin).toBeCloseTo(800, 5);
      expect(src.projectedMax).toBeCloseTo(1200, 5);
    });

    it('computes correct projectedMin and projectedMax for source with quote confidence', () => {
      // quote margin = 0.05 → min = 2000 * 0.95 = 1900, max = 2000 * 1.05 = 2100
      const sourceId = insertBudgetSource({ name: 'Mortgage', totalAmount: 200000 });
      insertWorkItemWithSource({
        plannedAmount: 2000,
        confidence: 'quote',
        budgetSourceId: sourceId,
      });

      const result = getBudgetBreakdown(db);

      const src = result.budgetSources[0]!;
      expect(src.projectedMin).toBeCloseTo(1900, 5);
      expect(src.projectedMax).toBeCloseTo(2100, 5);
    });

    it('accumulates projectedMin/Max across multiple lines assigned to the same source', () => {
      // Source has two WI lines: own_estimate 1000 + quote 2000
      // min = 800 + 1900 = 2700, max = 1200 + 2100 = 3300
      const sourceId = insertBudgetSource({ name: 'Mixed Funding', totalAmount: 300000 });
      insertWorkItemWithSource({
        plannedAmount: 1000,
        confidence: 'own_estimate',
        budgetSourceId: sourceId,
      });
      insertWorkItemWithSource({
        plannedAmount: 2000,
        confidence: 'quote',
        budgetSourceId: sourceId,
      });

      const result = getBudgetBreakdown(db);

      const src = result.budgetSources[0]!;
      expect(src.projectedMin).toBeCloseTo(800 + 1900, 5);
      expect(src.projectedMax).toBeCloseTo(1200 + 2100, 5);
    });

    it('includes household item lines in source projected totals', () => {
      // WI line: own_estimate 1000 → min=800, max=1200
      // HI line: quote 2000 → min=1900, max=2100
      // Combined: min=2700, max=3300
      const sourceId = insertBudgetSource({ name: 'Combined', totalAmount: 400000 });
      insertWorkItemWithSource({
        plannedAmount: 1000,
        confidence: 'own_estimate',
        budgetSourceId: sourceId,
      });
      insertHouseholdItemWithSource({
        plannedAmount: 2000,
        confidence: 'quote',
        budgetSourceId: sourceId,
      });

      const result = getBudgetBreakdown(db);

      const src = result.budgetSources[0]!;
      expect(src.projectedMin).toBeCloseTo(800 + 1900, 5);
      expect(src.projectedMax).toBeCloseTo(1200 + 2100, 5);
    });

    // Scenario 5: budgetSources excludes sources with no lines
    it('excludes a budget source that exists in the DB but has no budget lines assigned', () => {
      // Create a source but don't assign any budget lines to it
      insertBudgetSource({ name: 'Unused Source', totalAmount: 50000 });

      // Insert a WI budget line with NO source
      insertWorkItemWithSource({ plannedAmount: 1000, budgetSourceId: null });

      const result = getBudgetBreakdown(db);

      // budgetSources should be empty — the unused source is excluded
      expect(result.budgetSources).toHaveLength(0);
    });

    // Scenario 7: budgetSources empty when no sources exist
    it('returns empty budgetSources array when no budget sources exist in the database', () => {
      insertWorkItem({ plannedAmount: 1000 });

      const result = getBudgetBreakdown(db);

      expect(result.budgetSources).toEqual([]);
    });

    it('returns empty budgetSources array when no data exists at all', () => {
      const result = getBudgetBreakdown(db);

      expect(result.budgetSources).toEqual([]);
    });

    it('returns multiple sources in order when multiple sources have lines', () => {
      const sourceA = insertBudgetSource({ name: 'Alpha Source', totalAmount: 50000 });
      const sourceB = insertBudgetSource({ name: 'Beta Source', totalAmount: 75000 });
      insertWorkItemWithSource({ plannedAmount: 1000, budgetSourceId: sourceA });
      insertWorkItemWithSource({ plannedAmount: 2000, budgetSourceId: sourceB });

      const result = getBudgetBreakdown(db);

      expect(result.budgetSources).toHaveLength(2);
      const ids = result.budgetSources.map((s) => s.id);
      expect(ids).toContain(sourceA);
      expect(ids).toContain(sourceB);
    });
  });
});
