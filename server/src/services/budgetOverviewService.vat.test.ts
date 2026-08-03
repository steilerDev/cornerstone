/**
 * VAT gross-up regression tests for getBudgetOverview (Issue #1805).
 *
 * budgetOverviewService.ts already grossed up net-stored budget lines before this
 * fix, via a local `effective()` helper duplicating the same x1.19 math as the
 * canonical `effectivePlannedAmount()` shared helper. The #1805 fix replaced that
 * duplicate with a one-line delegation to `effectivePlannedAmount()` — a pure
 * refactor with no intended behavior change (see budgetOverviewService.ts's
 * `effective` definition, and the Backend Spec's step 1).
 *
 * These tests prove the refactor is behavior-preserving: scenarios #1-#3 and #11
 * from the #1805 QA spec (net-stored, gross-stored, margin interaction, and the
 * unreachable-null case) are ported against getBudgetOverview directly, plus a
 * subsidy-payback-aggregation regression test (scenario 14) and a bonus test for
 * the fixed-subsidy per-line cap against the grossed-up cost basis (the specific
 * "Math.min(perLineAmount, costBasis)" interaction referenced in the QA spec's
 * scenario 7 — that cap only exists in this file, not in budgetBreakdownService.ts;
 * see budgetBreakdownService.vat.test.ts's scenario 7 comment for the distinction).
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import { getBudgetOverview } from './budgetOverviewService.js';

describe('getBudgetOverview — VAT gross-up regression (#1805 refactor)', () => {
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

  function insertTestUser(userId = 'user-vat-overview-test') {
    const now = new Date().toISOString();
    db.insert(schema.users)
      .values({
        id: userId,
        email: `${userId}@example.com`,
        displayName: 'VAT Overview Test User',
        passwordHash: 'hashed',
        role: 'member',
        authProvider: 'local',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return userId;
  }

  type Confidence = 'own_estimate' | 'professional_estimate' | 'quote' | 'invoice';

  /**
   * Insert a work item with a single budget line.
   * Returns { workItemId, budgetLineId }.
   */
  function insertWorkItem(
    opts: {
      title?: string;
      plannedAmount?: number;
      confidence?: Confidence;
      includesVat?: boolean;
      actualCost?: number;
      invoiceStatus?: 'paid' | 'claimed' | 'pending' | 'quotation';
      noBudgetLine?: boolean;
    } = {},
  ): { workItemId: string; budgetLineId: string | null } {
    const id = `wi-vat-ov-${idCounter++}`;
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

    const budgetId = `bud-vat-ov-${idCounter++}`;
    db.insert(schema.workItemBudgets)
      .values({
        id: budgetId,
        workItemId: id,
        plannedAmount: opts.plannedAmount ?? 1000,
        confidence: opts.confidence ?? 'own_estimate',
        budgetCategoryId: null,
        budgetSourceId: null,
        includesVat: opts.includesVat ?? true,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    if (opts.actualCost != null && opts.actualCost > 0) {
      const vendorId = `vendor-vat-ov-${idCounter++}`;
      db.insert(schema.vendors)
        .values({ id: vendorId, name: `Vendor ${vendorId}`, createdAt: now, updatedAt: now })
        .run();
      const invoiceId = `inv-vat-ov-${idCounter++}`;
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
          workItemBudgetId: budgetId,
          itemizedAmount: opts.actualCost,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    }

    return { workItemId: id, budgetLineId: budgetId };
  }

  function insertSubsidyProgram(opts: {
    name?: string;
    reductionType: 'percentage' | 'fixed';
    reductionValue: number;
    maximumAmount?: number | null;
    applicationStatus?: 'eligible' | 'applied' | 'approved' | 'received' | 'rejected';
  }): string {
    const id = `prog-vat-ov-${idCounter++}`;
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

  // ── Scenario 13a: net-stored, no invoice ────────────────────────────────────

  describe('Scenario 13a: net-stored line, no invoice', () => {
    it('grosses up plannedAmount=100 (includesVat=false) to 119 before applying margin', () => {
      // effective = 100*1.19=119; own_estimate margin=0.2 -> min=95.2, max=142.8
      insertWorkItem({ plannedAmount: 100, includesVat: false, confidence: 'own_estimate' });

      const result = getBudgetOverview(db);

      expect(result.minPlanned).toBeCloseTo(95.2, 5);
      expect(result.maxPlanned).toBeCloseTo(142.8, 5);
    });
  });

  // ── Scenario 13b: gross-stored line unchanged ───────────────────────────────

  describe('Scenario 13b: gross-stored line is unchanged', () => {
    it('includesVat=true leaves min/maxPlanned at raw plannedAmount', () => {
      insertWorkItem({ plannedAmount: 100, includesVat: true, confidence: 'own_estimate' });

      const result = getBudgetOverview(db);

      expect(result.minPlanned).toBeCloseTo(80, 5);
      expect(result.maxPlanned).toBeCloseTo(120, 5);
    });

    it('omitting includesVat (schema default true) leaves min/maxPlanned at raw plannedAmount', () => {
      insertWorkItem({ plannedAmount: 100, confidence: 'own_estimate' });

      const result = getBudgetOverview(db);

      expect(result.minPlanned).toBeCloseTo(80, 5);
      expect(result.maxPlanned).toBeCloseTo(120, 5);
    });
  });

  // ── Scenario 13c: includesVat interacts correctly with confidence margin ───

  describe('Scenario 13c: includesVat interacts correctly with confidence margin', () => {
    it('grosses up before applying the professional_estimate 10% margin, not after', () => {
      // effective=119; professional_estimate margin=0.1 -> min=107.1, max=130.9
      // (NOT 100*0.9=90 / 100*1.1=110 -- that would be the pre-fix bug)
      insertWorkItem({
        plannedAmount: 100,
        includesVat: false,
        confidence: 'professional_estimate',
      });

      const result = getBudgetOverview(db);

      expect(result.minPlanned).toBeCloseTo(107.1, 5);
      expect(result.maxPlanned).toBeCloseTo(130.9, 5);
      expect(result.minPlanned).not.toBeCloseTo(90, 1);
      expect(result.maxPlanned).not.toBeCloseTo(110, 1);
    });
  });

  // ── Scenario 13d (11): includesVat is SQLite NULL ───────────────────────────

  describe('Scenario 13d: includesVat NULL handling', () => {
    it('the NOT NULL DEFAULT 1 constraint makes a NULL includes_vat row impossible to construct — the null branch of effective() is defensive/unreachable via schema; scenario 13b (default true) is the closest reachable equivalent', () => {
      const { workItemId } = insertWorkItem({ noBudgetLine: true });
      const now = new Date().toISOString();

      expect(() => {
        sqlite
          .prepare(
            `INSERT INTO work_item_budgets
               (id, work_item_id, planned_amount, confidence, includes_vat, created_at, updated_at, origin)
             VALUES (?, ?, ?, ?, NULL, ?, ?, 'manual')`,
          )
          .run('bud-vat-ov-null-attempt', workItemId, 100, 'own_estimate', now, now);
      }).toThrow(/NOT NULL constraint failed/);
    });
  });

  // ── Scenario 14: subsidy payback aggregation is behavior-preserving ────────

  describe('Scenario 14: subsidySummary payback aggregation for a net-stored line with a linked subsidy', () => {
    it('minTotalPayback/maxTotalPayback are computed against the grossed-up cost basis', () => {
      // plannedAmount=1000, includesVat=false -> effective=1190; own_estimate margin=0.2
      // minAmount=1190*0.8=952, maxAmount=1190*1.2=1428
      // percentage subsidy 10% (no cap) -> minTotalPayback=95.2, maxTotalPayback=142.8
      const { workItemId } = insertWorkItem({
        plannedAmount: 1000,
        includesVat: false,
        confidence: 'own_estimate',
      });
      const subsidyId = insertSubsidyProgram({ reductionType: 'percentage', reductionValue: 10 });
      linkWorkItemSubsidy(workItemId, subsidyId);

      const result = getBudgetOverview(db);

      expect(result.subsidySummary.minTotalPayback).toBeCloseTo(95.2, 5);
      expect(result.subsidySummary.maxTotalPayback).toBeCloseTo(142.8, 5);
    });
  });

  // ── Bonus: fixed-subsidy per-line cap uses the grossed-up cost basis ───────

  describe('Bonus: totalReductions applies the fixed-subsidy per-line cap against the grossed-up cost basis', () => {
    it('caps at the grossed-up costBasis, not the smaller raw net amount', () => {
      // plannedAmount=50 (net), includesVat=false -> effective/costBasis=50*1.19=59.5
      // Fixed subsidy reductionValue=55, matchingLineCount=1 (universal, single line)
      // -> perLineAmount=55; Math.min(55, 59.5)=55 (uncapped by the corrected cost basis)
      // Pre-fix bug would have used raw costBasis=50 -> Math.min(55,50)=50 (wrongly capped)
      const { workItemId } = insertWorkItem({
        plannedAmount: 50,
        includesVat: false,
        confidence: 'own_estimate',
      });
      const subsidyId = insertSubsidyProgram({ reductionType: 'fixed', reductionValue: 55 });
      linkWorkItemSubsidy(workItemId, subsidyId);

      const result = getBudgetOverview(db);

      expect(result.subsidySummary.totalReductions).toBeCloseTo(55, 5);
      expect(result.subsidySummary.totalReductions).not.toBeCloseTo(50, 1);
    });
  });
});
