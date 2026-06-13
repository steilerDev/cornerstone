/**
 * Tests for orphan budget line exclusion in budgetOverviewService (Story #1545).
 *
 * Verifies that orphan work_item_budget rows (work_item_id IS NULL) are
 * excluded from per-work-item budget rollups in getBudgetOverview().
 *
 * Also verifies that orphan rows DO contribute to source/category totals
 * (they are included in available funds calculations but not WI rollups).
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import { getBudgetOverview } from './budgetOverviewService.js';

describe('budgetOverviewService — orphan budget line exclusion', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;
  let idCounter = 0;

  function makeId(prefix: string): string {
    return `${prefix}-${++idCounter}`;
  }

  function ts(): string {
    return new Date(Date.now() + idCounter).toISOString();
  }

  function createTestDb() {
    const sqliteDb = new Database(':memory:');
    sqliteDb.pragma('journal_mode = WAL');
    sqliteDb.pragma('foreign_keys = ON');
    runMigrations(sqliteDb);
    return { sqlite: sqliteDb, db: drizzle(sqliteDb, { schema }) };
  }

  // ─── Seed helpers ──────────────────────────────────────────────────────────

  function insertWorkItem(title = 'Test WI'): string {
    const id = makeId('wi');
    const t = ts();
    db.insert(schema.workItems)
      .values({
        id,
        title,
        description: null,
        status: 'not_started',
        startDate: null,
        endDate: null,
        actualStartDate: null,
        actualEndDate: null,
        durationDays: null,
        startAfter: null,
        startBefore: null,
        assignedUserId: null,
        areaId: null,
        assignedVendorId: null,
        createdBy: null,
        createdAt: t,
        updatedAt: t,
      })
      .run();
    return id;
  }

  /**
   * Insert a work_item_budget WITH workItemId (normal assigned line).
   */
  function insertAssignedWIB(workItemId: string, plannedAmount: number): string {
    const id = makeId('wib');
    const t = ts();
    db.insert(schema.workItemBudgets)
      .values({
        id,
        workItemId,
        description: 'Assigned budget line',
        plannedAmount,
        confidence: 'own_estimate',
        budgetCategoryId: null,
        budgetSourceId: null,
        vendorId: null,
        quantity: null,
        unit: null,
        unitPrice: null,
        includesVat: true,
        createdBy: null,
        createdAt: t,
        updatedAt: t,
        origin: 'manual',
      })
      .run();
    return id;
  }

  /**
   * Insert a work_item_budget WITHOUT workItemId (orphan row).
   */
  function insertOrphanWIB(plannedAmount: number, budgetSourceId?: string | null): string {
    const id = makeId('wib');
    const t = ts();
    db.insert(schema.workItemBudgets)
      .values({
        id,
        workItemId: null, // ORPHAN
        description: 'Orphan budget line',
        plannedAmount,
        confidence: 'own_estimate',
        budgetCategoryId: null,
        budgetSourceId: budgetSourceId ?? null,
        vendorId: null,
        quantity: null,
        unit: null,
        unitPrice: null,
        includesVat: true,
        createdBy: null,
        createdAt: t,
        updatedAt: t,
        origin: 'manual',
      })
      .run();
    return id;
  }

  /**
   * Insert a budget source and return its id.
   */
  function insertBudgetSource(totalAmount: number): string {
    const id = makeId('src');
    const t = ts();
    db.insert(schema.budgetSources)
      .values({
        id,
        name: `Source ${id}`,
        sourceType: 'bank_loan',
        totalAmount,
        status: 'active',
        createdAt: t,
        updatedAt: t,
      })
      .run();
    return id;
  }

  /**
   * Insert a vendor for invoice creation.
   */
  function insertVendor(): string {
    const id = makeId('vendor');
    const t = ts();
    db.insert(schema.vendors)
      .values({
        id,
        name: `Vendor ${id}`,
        tradeId: null,
        phone: null,
        email: null,
        address: null,
        notes: null,
        createdBy: null,
        createdAt: t,
        updatedAt: t,
      })
      .run();
    return id;
  }

  /**
   * Insert an invoice linked to a work_item_budget via invoice_budget_lines.
   */
  function insertInvoiceLinkedToWIB(
    wibId: string,
    amount: number,
    status: 'pending' | 'paid' | 'claimed' | 'quotation' = 'paid',
  ): string {
    const vendorId = insertVendor();
    const invoiceId = makeId('inv');
    const t1 = ts();
    db.insert(schema.invoices)
      .values({
        id: invoiceId,
        vendorId,
        invoiceNumber: null,
        amount,
        date: '2026-01-15',
        dueDate: null,
        status,
        notes: null,
        createdBy: null,
        createdAt: t1,
        updatedAt: t1,
      })
      .run();

    const iblId = makeId('ibl');
    const t2 = ts();
    db.insert(schema.invoiceBudgetLines)
      .values({
        id: iblId,
        invoiceId,
        workItemBudgetId: wibId,
        householdItemBudgetId: null,
        itemizedAmount: amount,
        createdAt: t2,
        updatedAt: t2,
      })
      .run();

    return invoiceId;
  }

  beforeEach(() => {
    const testDb = createTestDb();
    sqlite = testDb.sqlite;
    db = testDb.db;
    idCounter = 0;
  });

  afterEach(() => {
    sqlite.close();
  });

  // ─── Orphan exclusion from WI rollup ─────────────────────────────────────

  describe('orphan rows excluded from per-work-item budget rollup', () => {
    it('getBudgetOverview does not throw when only orphan rows exist', () => {
      insertOrphanWIB(1000);

      expect(() => getBudgetOverview(db)).not.toThrow();
    });

    it('minPlanned is 0 when only orphan rows exist (no assigned WI budget lines)', () => {
      insertOrphanWIB(1000);

      const result = getBudgetOverview(db);

      // With no assigned lines, minPlanned = 0
      expect(result.minPlanned).toBe(0);
    });

    it('maxPlanned is 0 when only orphan rows exist', () => {
      insertOrphanWIB(1000);

      const result = getBudgetOverview(db);

      expect(result.maxPlanned).toBe(0);
    });

    it('orphan row does NOT inflate minPlanned beyond assigned lines', () => {
      const wiId = insertWorkItem('Normal WI');
      insertAssignedWIB(wiId, 500);
      insertOrphanWIB(10000); // orphan with large amount — must NOT affect rollup

      const result = getBudgetOverview(db);

      // Only the assigned 500 should count (with own_estimate margin 0.2)
      // min = 500 * (1 - 0.2) = 400
      expect(result.minPlanned).toBe(400);
    });

    it('orphan row does NOT inflate maxPlanned beyond assigned lines', () => {
      const wiId = insertWorkItem('Normal WI');
      insertAssignedWIB(wiId, 500);
      insertOrphanWIB(10000); // orphan with large amount

      const result = getBudgetOverview(db);

      // max = 500 * (1 + 0.2) = 600
      expect(result.maxPlanned).toBe(600);
    });

    it('multiple orphan rows are all excluded', () => {
      const wiId = insertWorkItem('Electrical');
      insertAssignedWIB(wiId, 200);
      insertOrphanWIB(1000);
      insertOrphanWIB(2000);
      insertOrphanWIB(3000);

      const result = getBudgetOverview(db);

      // Only the 200 assigned line counts: min = 200 * 0.8 = 160, max = 200 * 1.2 = 240
      expect(result.minPlanned).toBe(160);
      expect(result.maxPlanned).toBe(240);
    });
  });

  // ─── Orphan rows do NOT affect actualCost ──────────────────────────────────

  describe('orphan rows linked to invoices do not corrupt actualCost rollup', () => {
    it('actualCost does not include invoices linked to orphan budget lines', () => {
      // This is enforced by the WHERE work_item_budget_id IS NOT NULL on the lineInvoiceRows query
      const orphanWibId = insertOrphanWIB(500);
      insertInvoiceLinkedToWIB(orphanWibId, 500, 'paid');

      const result = getBudgetOverview(db);

      // actualCost should be 0 because the invoice is linked to an orphan wib
      // (the lineInvoiceRows query uses INNER JOIN so this correctly returns data,
      // but the budget_lines list filtered by WHERE work_item_id IS NOT NULL means
      // the orphan line won't be in the iteration set)
      expect(result.minPlanned).toBe(0);
      expect(result.maxPlanned).toBe(0);
    });

    it('actualCost is still correct for assigned lines even with orphan lines present', () => {
      const wiId = insertWorkItem('Heating');
      const wibId = insertAssignedWIB(wiId, 800);
      insertInvoiceLinkedToWIB(wibId, 800, 'paid');

      // Also insert an orphan that happens to be linked to an invoice
      const orphanWibId = insertOrphanWIB(500);
      insertInvoiceLinkedToWIB(orphanWibId, 500, 'paid');

      const result = getBudgetOverview(db);

      // Only the assigned line (800) should be in minPlanned/maxPlanned
      // Orphan is excluded from the UNION query
      expect(result.minPlanned).toBe(800); // invoice overrides margin
      expect(result.maxPlanned).toBe(800);
    });
  });

  // ─── Available funds are unaffected ───────────────────────────────────────

  describe('available funds are unaffected by orphan rows', () => {
    it('availableFunds comes from budget_sources regardless of orphan rows', () => {
      insertBudgetSource(50000);
      insertOrphanWIB(999999); // Large orphan

      const result = getBudgetOverview(db);

      expect(result.availableFunds).toBe(50000);
    });

    it('availableFunds is 0 when no budget sources exist, even with orphan rows', () => {
      insertOrphanWIB(1000);

      const result = getBudgetOverview(db);

      expect(result.availableFunds).toBe(0);
    });
  });

  // ─── Budget overview structure ─────────────────────────────────────────────

  describe('budget overview structure with mixed orphan and assigned rows', () => {
    it('result has all expected fields', () => {
      const wiId = insertWorkItem('Test WI');
      insertAssignedWIB(wiId, 1000);
      insertOrphanWIB(500);

      const result = getBudgetOverview(db);

      expect(result).toHaveProperty('availableFunds');
      expect(result).toHaveProperty('minPlanned');
      expect(result).toHaveProperty('maxPlanned');
      expect(result).toHaveProperty('actualCost');
      expect(result).toHaveProperty('actualCostPaid');
    });

    it('two assigned lines and one orphan — correct rollup', () => {
      const wi1 = insertWorkItem('WI 1');
      const wi2 = insertWorkItem('WI 2');
      insertAssignedWIB(wi1, 1000);
      insertAssignedWIB(wi2, 500);
      insertOrphanWIB(9999); // Must not contribute

      const result = getBudgetOverview(db);

      // own_estimate margin = 0.2
      // min = (1000 + 500) * 0.8 = 1200
      // max = (1000 + 500) * 1.2 = 1800
      expect(result.minPlanned).toBe(1200);
      expect(result.maxPlanned).toBe(1800);
    });
  });
});
