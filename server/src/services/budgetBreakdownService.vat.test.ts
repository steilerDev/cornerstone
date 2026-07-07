/**
 * VAT gross-up parity tests for getBudgetBreakdown (Issue #1805).
 *
 * Migration 0031_fix_vat_storage_semantics.sql changed storage semantics so that budget
 * lines with includes_vat = 0 store the NET amount; consumers must gross it up by x1.19
 * for display/aggregation. budgetOverviewService.ts already did this via effective();
 * budgetBreakdownService.ts never selected includes_vat at all and used raw
 * plannedAmount everywhere, so every projection, subsidy-payback, and per-source total
 * involving a net-stored line was understated by 19%.
 *
 * Scenarios 1-12 below (per the #1805 QA spec) prove the fix across every consumer:
 * main entity aggregation, invoice/quotation handling, subsidy payback (percentage +
 * fixed), area roll-up, and the two independent per-source computation paths
 * (unfiltered per-source projections + addSourcePayback pro-rata weighting).
 *
 * Note on scenario 1: the QA spec's manual-trace illustration used confidence
 * 'own_estimate' with an assumed 0% margin. CONFIDENCE_MARGINS.own_estimate is
 * actually 0.2 (20%) — see shared/src/types/budget.test.ts. This file uses the
 * correct 20% margin math throughout rather than the spec's simplified (and
 * numerically incorrect) illustration.
 *
 * Note on scenario 7: the QA spec described a "Math.min(perLineAmount, costBasis)"
 * per-line cap for fixed subsidies. That cap only exists in budgetOverviewService.ts
 * (see budgetOverviewService.vat.test.ts's bonus totalReductions test). In
 * budgetBreakdownService.ts, fixed-subsidy payback flows through
 * subsidyCalculationEngine.ts's computeSubsidyEffects(), which treats a fixed
 * reductionValue as a flat per-entity amount unrelated to any line's cost basis
 * (see subsidyCalculationEngine.ts lines 102-105). Scenario 7 below instead proves
 * the real interaction: subsidyPayback itself is flat/unaffected, but the cost basis
 * it's subtracted from (rawProjectedMin/Max, projectedMin/Max) is correctly grossed up.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import { getBudgetBreakdown } from './budgetBreakdownService.js';
import { getBudgetOverview } from './budgetOverviewService.js';

describe('getBudgetBreakdown — VAT gross-up parity (#1805)', () => {
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

  function insertTestUser(userId = 'user-vat-test') {
    const now = new Date().toISOString();
    db.insert(schema.users)
      .values({
        id: userId,
        email: `${userId}@example.com`,
        displayName: 'VAT Test User',
        passwordHash: 'hashed',
        role: 'member',
        authProvider: 'local',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return userId;
  }

  function insertArea(opts: { name?: string; parentId?: string | null } = {}): string {
    const id = `area-vat-${idCounter++}`;
    const now = new Date().toISOString();
    db.insert(schema.areas)
      .values({
        id,
        name: opts.name ?? `Area-${id}`,
        parentId: opts.parentId ?? null,
        color: null,
        sortOrder: idCounter,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  function insertBudgetSource(opts: { name?: string; totalAmount?: number } = {}): string {
    const id = `src-vat-${idCounter++}`;
    const now = new Date().toISOString();
    db.insert(schema.budgetSources)
      .values({
        id,
        name: opts.name ?? `Budget Source ${id}`,
        sourceType: 'bank_loan',
        totalAmount: opts.totalAmount ?? 100000,
        status: 'active',
        isDiscretionary: false,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  function insertSubsidyProgram(opts: {
    name?: string;
    reductionType: 'percentage' | 'fixed';
    reductionValue: number;
    maximumAmount?: number | null;
    applicationStatus?: 'eligible' | 'applied' | 'approved' | 'received' | 'rejected';
    categoryIds?: string[];
  }): string {
    const id = `prog-vat-${idCounter++}`;
    const now = new Date().toISOString();
    db.insert(schema.subsidyPrograms)
      .values({
        id,
        name: opts.name ?? `Subsidy ${id}`,
        reductionType: opts.reductionType,
        reductionValue: opts.reductionValue,
        maximumAmount: opts.maximumAmount ?? null,
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

  type Confidence = 'own_estimate' | 'professional_estimate' | 'quote' | 'invoice';
  type InvoiceStatus = 'paid' | 'claimed' | 'pending' | 'quotation';

  interface BudgetLineOpts {
    plannedAmount?: number;
    confidence?: Confidence;
    includesVat?: boolean;
    budgetSourceId?: string | null;
    budgetCategoryId?: string | null;
    actualCost?: number;
    invoiceStatus?: InvoiceStatus;
  }

  /**
   * Add a work_item_budgets row for an existing work item, optionally with a
   * linked invoice (any status, including 'quotation').
   */
  function addWorkItemBudgetLine(workItemId: string, opts: BudgetLineOpts = {}): string {
    const id = `bud-vat-${idCounter++}`;
    const now = new Date().toISOString();
    db.insert(schema.workItemBudgets)
      .values({
        id,
        workItemId,
        plannedAmount: opts.plannedAmount ?? 1000,
        confidence: opts.confidence ?? 'own_estimate',
        budgetCategoryId: opts.budgetCategoryId ?? null,
        budgetSourceId: opts.budgetSourceId ?? null,
        includesVat: opts.includesVat ?? true,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    if (opts.actualCost != null && opts.actualCost > 0) {
      const vendorId = `vendor-vat-${idCounter++}`;
      db.insert(schema.vendors)
        .values({ id: vendorId, name: `Vendor ${vendorId}`, createdAt: now, updatedAt: now })
        .run();
      const invoiceId = `inv-vat-${idCounter++}`;
      db.insert(schema.invoices)
        .values({
          id: invoiceId,
          vendorId,
          amount: opts.actualCost,
          date: '2026-01-01',
          status: opts.invoiceStatus ?? 'paid',
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

  function addHouseholdItemBudgetLine(householdItemId: string, opts: BudgetLineOpts = {}): string {
    const id = `hibud-vat-${idCounter++}`;
    const now = new Date().toISOString();
    db.insert(schema.householdItemBudgets)
      .values({
        id,
        householdItemId,
        plannedAmount: opts.plannedAmount ?? 500,
        confidence: opts.confidence ?? 'own_estimate',
        budgetCategoryId: opts.budgetCategoryId ?? null,
        budgetSourceId: opts.budgetSourceId ?? null,
        includesVat: opts.includesVat ?? true,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    if (opts.actualCost != null && opts.actualCost > 0) {
      const vendorId = `vendor-hi-vat-${idCounter++}`;
      db.insert(schema.vendors)
        .values({ id: vendorId, name: `Vendor ${vendorId}`, createdAt: now, updatedAt: now })
        .run();
      const invoiceId = `inv-hi-vat-${idCounter++}`;
      db.insert(schema.invoices)
        .values({
          id: invoiceId,
          vendorId,
          amount: opts.actualCost,
          date: '2026-01-01',
          status: opts.invoiceStatus ?? 'paid',
          createdAt: now,
          updatedAt: now,
        })
        .run();
      db.insert(schema.invoiceBudgetLines)
        .values({
          id: randomUUID(),
          invoiceId,
          householdItemBudgetId: id,
          itemizedAmount: opts.actualCost,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    }

    return id;
  }

  function insertWorkItem(
    opts: BudgetLineOpts & { title?: string; areaId?: string | null; noBudgetLine?: boolean } = {},
  ): { workItemId: string; budgetLineId: string | null } {
    const id = `wi-vat-${idCounter++}`;
    const now = new Date().toISOString();
    db.insert(schema.workItems)
      .values({
        id,
        title: opts.title ?? `Work Item ${id}`,
        status: 'not_started',
        areaId: opts.areaId ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    if (opts.noBudgetLine) {
      return { workItemId: id, budgetLineId: null };
    }

    const budgetLineId = addWorkItemBudgetLine(id, opts);
    return { workItemId: id, budgetLineId };
  }

  function insertHouseholdItem(
    opts: BudgetLineOpts & { name?: string; areaId?: string | null; noBudgetLine?: boolean } = {},
  ): { householdItemId: string; budgetLineId: string | null } {
    const id = `hi-vat-${idCounter++}`;
    const now = new Date().toISOString();
    db.insert(schema.householdItems)
      .values({
        id,
        name: opts.name ?? `Household Item ${id}`,
        categoryId: 'hic-furniture',
        status: 'planned',
        quantity: 1,
        isLate: false,
        areaId: opts.areaId ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    if (opts.noBudgetLine) {
      return { householdItemId: id, budgetLineId: null };
    }

    const budgetLineId = addHouseholdItemBudgetLine(id, opts);
    return { householdItemId: id, budgetLineId };
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

  // ── Scenario 1: exact issue scenario — single net-stored line, no invoice, no subsidy ──

  describe('Scenario 1: net-stored line, no invoice, no subsidy', () => {
    it('WI: grosses up plannedAmount=100 (includesVat=false) to 119 before applying margin', () => {
      // effective = 100 * 1.19 = 119; own_estimate margin = 0.2
      // min = 119 * 0.8 = 95.2, max = 119 * 1.2 = 142.8
      insertWorkItem({ plannedAmount: 100, includesVat: false, confidence: 'own_estimate' });

      const result = getBudgetBreakdown(db);

      const item = result.workItems.areas[0]!.items[0]!;
      expect(item.projectedMin).toBeCloseTo(95.2, 5);
      expect(item.projectedMax).toBeCloseTo(142.8, 5);
      expect(item.rawProjectedMin).toBeCloseTo(95.2, 5);
      expect(item.rawProjectedMax).toBeCloseTo(142.8, 5);
    });

    it('HI: grosses up plannedAmount=100 (includesVat=false) to 119 before applying margin', () => {
      insertHouseholdItem({ plannedAmount: 100, includesVat: false, confidence: 'own_estimate' });

      const result = getBudgetBreakdown(db);

      const item = result.householdItems.areas[0]!.items[0]!;
      expect(item.projectedMin).toBeCloseTo(95.2, 5);
      expect(item.projectedMax).toBeCloseTo(142.8, 5);
      expect(item.rawProjectedMin).toBeCloseTo(95.2, 5);
      expect(item.rawProjectedMax).toBeCloseTo(142.8, 5);
    });
  });

  // ── Scenario 2: gross-stored line unchanged (regression guard) ──────────────

  describe('Scenario 2: gross-stored line is unchanged', () => {
    it('WI: includesVat=true leaves projections at raw plannedAmount', () => {
      insertWorkItem({ plannedAmount: 100, includesVat: true, confidence: 'own_estimate' });

      const result = getBudgetBreakdown(db);

      const item = result.workItems.areas[0]!.items[0]!;
      expect(item.projectedMin).toBeCloseTo(80, 5);
      expect(item.projectedMax).toBeCloseTo(120, 5);
    });

    it('WI: omitting includesVat (schema default true) leaves projections at raw plannedAmount', () => {
      insertWorkItem({ plannedAmount: 100, confidence: 'own_estimate' });

      const result = getBudgetBreakdown(db);

      const item = result.workItems.areas[0]!.items[0]!;
      expect(item.projectedMin).toBeCloseTo(80, 5);
      expect(item.projectedMax).toBeCloseTo(120, 5);
    });

    it('HI: includesVat=true leaves projections at raw plannedAmount', () => {
      insertHouseholdItem({ plannedAmount: 100, includesVat: true, confidence: 'own_estimate' });

      const result = getBudgetBreakdown(db);

      const item = result.householdItems.areas[0]!.items[0]!;
      expect(item.projectedMin).toBeCloseTo(80, 5);
      expect(item.projectedMax).toBeCloseTo(120, 5);
    });
  });

  // ── Scenario 3: includesVat interacting with confidence margin ──────────────

  describe('Scenario 3: includesVat interacts correctly with confidence margin', () => {
    it('grosses up before applying the professional_estimate 10% margin, not after', () => {
      // effective = 100 * 1.19 = 119; professional_estimate margin = 0.1
      // min = 119 * 0.9 = 107.1, max = 119 * 1.1 = 130.9
      // (NOT 100 * 0.9 = 90 / 100 * 1.1 = 110 — that would be the pre-fix bug)
      insertWorkItem({
        plannedAmount: 100,
        includesVat: false,
        confidence: 'professional_estimate',
      });

      const result = getBudgetBreakdown(db);

      const item = result.workItems.areas[0]!.items[0]!;
      expect(item.projectedMin).toBeCloseTo(107.1, 5);
      expect(item.projectedMax).toBeCloseTo(130.9, 5);
      expect(item.projectedMin).not.toBeCloseTo(90, 1);
      expect(item.projectedMax).not.toBeCloseTo(110, 1);
    });
  });

  // ── Scenario 4: line with invoice is unaffected by includesVat ──────────────

  describe('Scenario 4: invoiced line ignores includesVat entirely', () => {
    it('actualCost/projectedMin/projectedMax equal the itemized amount, not a grossed-up value', () => {
      insertWorkItem({
        plannedAmount: 100,
        includesVat: false,
        confidence: 'own_estimate',
        actualCost: 95,
        invoiceStatus: 'paid',
      });

      const result = getBudgetBreakdown(db);

      const item = result.workItems.areas[0]!.items[0]!;
      expect(item.actualCost).toBe(95);
      expect(item.projectedMin).toBeCloseTo(95, 5);
      expect(item.projectedMax).toBeCloseTo(95, 5);
    });
  });

  // ── Scenario 5: quotation-status invoice on a net-stored line ───────────────

  describe('Scenario 5: quotation invoice applies +-5% to itemized amount, unaffected by includesVat', () => {
    it('uses itemized amount +-5%, not plannedAmount, and is identical for net- and gross-stored lines', () => {
      // Quotation itemized amount = 95 -> min = 95*0.95 = 90.25, max = 95*1.05 = 99.75
      const { workItemId: netId } = insertWorkItem({
        plannedAmount: 100,
        includesVat: false,
        confidence: 'own_estimate',
        actualCost: 95,
        invoiceStatus: 'quotation',
      });
      const { workItemId: grossId } = insertWorkItem({
        plannedAmount: 100,
        includesVat: true,
        confidence: 'own_estimate',
        actualCost: 95,
        invoiceStatus: 'quotation',
      });

      const result = getBudgetBreakdown(db);

      const allItems = result.workItems.areas.flatMap((a) => a.items);
      const netItem = allItems.find((i) => i.workItemId === netId)!;
      const grossItem = allItems.find((i) => i.workItemId === grossId)!;

      for (const item of [netItem, grossItem]) {
        expect(item.projectedMin).toBeCloseTo(90.25, 5);
        expect(item.projectedMax).toBeCloseTo(99.75, 5);
      }
    });
  });

  // ── Scenario 6: subsidy payback on a net-stored line (percentage subsidy) ───

  describe('Scenario 6: percentage subsidy payback on a net-stored line', () => {
    it('computes subsidyPayback/minSubsidyPayback against the grossed-up cost basis', () => {
      // plannedAmount=1000, includesVat=false -> effective=1190; own_estimate margin=0.2
      // rawProjectedMin = 1190*0.8=952, rawProjectedMax = 1190*1.2=1428
      // subsidy 10% (max side, from rawProjectedMax basis) = 1428*0.1=142.8
      // minSubsidyPayback (min side, from rawProjectedMin basis) = 952*0.1=95.2
      // projectedMin = max(0, 952-142.8)=809.2, projectedMax = max(0,1428-142.8)=1285.2
      const { workItemId } = insertWorkItem({
        plannedAmount: 1000,
        includesVat: false,
        confidence: 'own_estimate',
      });
      const subsidyId = insertSubsidyProgram({ reductionType: 'percentage', reductionValue: 10 });
      linkWorkItemSubsidy(workItemId, subsidyId);

      const result = getBudgetBreakdown(db);

      const item = result.workItems.areas[0]!.items[0]!;
      expect(item.rawProjectedMin).toBeCloseTo(952, 5);
      expect(item.rawProjectedMax).toBeCloseTo(1428, 5);
      expect(item.subsidyPayback).toBeCloseTo(142.8, 5);
      expect(item.minSubsidyPayback).toBeCloseTo(95.2, 5);
      expect(item.projectedMin).toBeCloseTo(809.2, 5);
      expect(item.projectedMax).toBeCloseTo(1285.2, 5);
    });
  });

  // ── Scenario 7: subsidy payback on a net-stored line (fixed subsidy) ────────

  describe('Scenario 7: fixed subsidy payback on a net-stored line', () => {
    it('subsidyPayback is a flat reductionValue (unaffected by VAT); the cost basis it is subtracted from is correctly grossed up', () => {
      // plannedAmount=1000, includesVat=false -> effective=1190; own_estimate margin=0.2
      // rawProjectedMin=1190*0.8=952, rawProjectedMax=1190*1.2=1428 (grossed-up cost basis)
      // Fixed subsidy reductionValue=300 -> computeSubsidyEffects returns a flat
      // minPayback=maxPayback=300 regardless of the line's plannedAmount (see
      // subsidyCalculationEngine.ts's 'fixed' branch), so subsidyPayback/minSubsidyPayback
      // are unaffected by the VAT fix directly...
      // ...but projectedMin/Max = max(0, rawProjected - subsidyPayback) DO change, because
      // rawProjectedMin/Max reflect the corrected (grossed-up) cost basis:
      //   projectedMin = max(0, 952-300) = 652 (pre-fix bug would have used raw 1000*0.8=800 -> 500)
      //   projectedMax = max(0, 1428-300) = 1128 (pre-fix bug would have used raw 1000*1.2=1200 -> 900)
      const { workItemId } = insertWorkItem({
        plannedAmount: 1000,
        includesVat: false,
        confidence: 'own_estimate',
      });
      const subsidyId = insertSubsidyProgram({ reductionType: 'fixed', reductionValue: 300 });
      linkWorkItemSubsidy(workItemId, subsidyId);

      const result = getBudgetBreakdown(db);

      const item = result.workItems.areas[0]!.items[0]!;
      expect(item.subsidyPayback).toBeCloseTo(300, 5);
      expect(item.minSubsidyPayback).toBeCloseTo(300, 5);
      expect(item.rawProjectedMin).toBeCloseTo(952, 5);
      expect(item.rawProjectedMax).toBeCloseTo(1428, 5);
      expect(item.projectedMin).toBeCloseTo(652, 5);
      expect(item.projectedMax).toBeCloseTo(1128, 5);
    });
  });

  // ── Scenario 8: mixed project — net + gross lines across multiple areas ─────

  describe('Scenario 8: mixed net/gross/invoiced lines roll up correctly across areas', () => {
    it('area-level and top-level totals correctly sum the mix', () => {
      const areaKitchen = insertArea({ name: 'Kitchen' });
      const areaBath = insertArea({ name: 'Bath' });

      // Kitchen: net-stored line (100 net -> 119 effective, own_estimate 20% margin)
      //   min=95.2, max=142.8
      insertWorkItem({
        areaId: areaKitchen,
        plannedAmount: 100,
        includesVat: false,
        confidence: 'own_estimate',
      });
      // Kitchen: gross-stored line (200, own_estimate 20% margin) -> min=160, max=240
      insertWorkItem({
        areaId: areaKitchen,
        plannedAmount: 200,
        includesVat: true,
        confidence: 'own_estimate',
      });
      // Bath: net-stored + invoiced line -> unaffected by VAT, min=max=250
      insertWorkItem({
        areaId: areaBath,
        plannedAmount: 300,
        includesVat: false,
        confidence: 'own_estimate',
        actualCost: 250,
        invoiceStatus: 'paid',
      });

      const result = getBudgetBreakdown(db);

      const kitchen = result.workItems.areas.find((a) => a.areaId === areaKitchen)!;
      const bath = result.workItems.areas.find((a) => a.areaId === areaBath)!;

      expect(kitchen.projectedMin).toBeCloseTo(95.2 + 160, 5);
      expect(kitchen.projectedMax).toBeCloseTo(142.8 + 240, 5);
      expect(bath.projectedMin).toBeCloseTo(250, 5);
      expect(bath.projectedMax).toBeCloseTo(250, 5);

      expect(result.workItems.totals.projectedMin).toBeCloseTo(95.2 + 160 + 250, 5);
      expect(result.workItems.totals.projectedMax).toBeCloseTo(142.8 + 240 + 250, 5);
    });
  });

  // ── Scenario 9: per-source projections (unfiltered per-source computation path) ──

  describe('Scenario 9: per-source projections gross up net-stored lines', () => {
    it('budgetSources[srcA].projectedMin/Max reflect the grossed-up amount', () => {
      // plannedAmount=1000, includesVat=false -> effective=1190; own_estimate margin=0.2
      // min=952, max=1428
      const sourceId = insertBudgetSource({ name: 'Source A', totalAmount: 100000 });
      insertWorkItem({
        plannedAmount: 1000,
        includesVat: false,
        confidence: 'own_estimate',
        budgetSourceId: sourceId,
      });

      const result = getBudgetBreakdown(db);

      const src = result.budgetSources.find((s) => s.id === sourceId);
      expect(src).toBeDefined();
      expect(src!.projectedMin).toBeCloseTo(952, 5);
      expect(src!.projectedMax).toBeCloseTo(1428, 5);
    });

    it('household item: budgetSources[srcA].projectedMin/Max reflect the grossed-up amount (HI per-source loop)', () => {
      // Same as above, exercised through the parallel HI-specific per-source
      // unfiltered projection loop (distinct code path from the WI loop above).
      const sourceId = insertBudgetSource({ name: 'Source A (HI)', totalAmount: 100000 });
      insertHouseholdItem({
        plannedAmount: 1000,
        includesVat: false,
        confidence: 'own_estimate',
        budgetSourceId: sourceId,
      });

      const result = getBudgetBreakdown(db);

      const src = result.budgetSources.find((s) => s.id === sourceId);
      expect(src).toBeDefined();
      expect(src!.projectedMin).toBeCloseTo(952, 5);
      expect(src!.projectedMax).toBeCloseTo(1428, 5);
    });
  });

  // ── Scenario 10: per-source subsidy payback attribution (addSourcePayback weighting) ──

  describe('Scenario 10: per-source subsidy payback pro-rata weighting is VAT-aware', () => {
    it('weights net- and gross-stored lines equally when their effective cost is equal', () => {
      // Line A (source A): plannedAmount=1000, includesVat=false -> effective=1190
      // Line B (source B): plannedAmount=1190, includesVat=true  -> effective=1190
      // Both own_estimate (20% margin) -> equal weight cost (1190*1.2=1428 each) -> 50/50 split.
      // Pre-fix bug would weight by RAW plannedAmount (1000 vs 1190), under-weighting source A.
      const srcA = insertBudgetSource({ name: 'Source A', totalAmount: 100000 });
      const srcB = insertBudgetSource({ name: 'Source B', totalAmount: 100000 });
      const { workItemId } = insertWorkItem({
        plannedAmount: 1000,
        includesVat: false,
        confidence: 'own_estimate',
        budgetSourceId: srcA,
      });
      addWorkItemBudgetLine(workItemId, {
        plannedAmount: 1190,
        includesVat: true,
        confidence: 'own_estimate',
        budgetSourceId: srcB,
      });
      const subsidyId = insertSubsidyProgram({ reductionType: 'percentage', reductionValue: 10 });
      linkWorkItemSubsidy(workItemId, subsidyId);

      const result = getBudgetBreakdown(db, new Set());

      const srcAEntry = result.budgetSources.find((s) => s.id === srcA);
      const srcBEntry = result.budgetSources.find((s) => s.id === srcB);
      expect(srcAEntry).toBeDefined();
      expect(srcBEntry).toBeDefined();

      // Entity-level payback: max=(1190*1.2+1190*1.2)*0.1=285.6, min=(1190*0.8+1190*0.8)*0.1=190.4
      // Split 50/50 across the two equally-weighted lines.
      expect(srcAEntry!.subsidyPaybackMax).toBeCloseTo(142.8, 5);
      expect(srcBEntry!.subsidyPaybackMax).toBeCloseTo(142.8, 5);
      expect(srcAEntry!.subsidyPaybackMin).toBeCloseTo(95.2, 5);
      expect(srcBEntry!.subsidyPaybackMin).toBeCloseTo(95.2, 5);
    });
  });

  // ── Scenario 11: includesVat is SQLite NULL ──────────────────────────────────

  describe('Scenario 11: includesVat NULL handling', () => {
    it('the NOT NULL DEFAULT 1 constraint makes a NULL includes_vat row impossible to construct — the null branch of effective() is defensive/unreachable via schema; scenario 2 (omitted includesVat, default true) is the closest reachable equivalent', () => {
      const { workItemId } = insertWorkItem({ noBudgetLine: true });
      const now = new Date().toISOString();

      expect(() => {
        sqlite
          .prepare(
            `INSERT INTO work_item_budgets
               (id, work_item_id, planned_amount, confidence, includes_vat, created_at, updated_at, origin)
             VALUES (?, ?, ?, ?, NULL, ?, ?, 'manual')`,
          )
          .run('bud-vat-null-attempt', workItemId, 100, 'own_estimate', now, now);
      }).toThrow(/NOT NULL constraint failed/);
    });
  });

  // ── Scenario 12: Overview/Breakdown parity, end-to-end ──────────────────────

  describe('Scenario 12: getBudgetOverview and getBudgetBreakdown agree on a net-stored line', () => {
    it('overview.maxPlanned/minPlanned equal breakdown.workItems.totals.projectedMax/Min', () => {
      // Single net-stored, non-invoiced, no-subsidy line — this is the exact
      // shape of the issue's reported EUR100-vs-EUR119 divergence between the two endpoints.
      insertWorkItem({ plannedAmount: 100, includesVat: false, confidence: 'own_estimate' });

      const overview = getBudgetOverview(db);
      const breakdown = getBudgetBreakdown(db);

      expect(overview.maxPlanned).toBeCloseTo(breakdown.workItems.totals.projectedMax, 5);
      expect(overview.minPlanned).toBeCloseTo(breakdown.workItems.totals.projectedMin, 5);
      // Pin the actual expected numeric value too, not just cross-endpoint equality.
      expect(overview.maxPlanned).toBeCloseTo(142.8, 5);
      expect(overview.minPlanned).toBeCloseTo(95.2, 5);
    });
  });
});
