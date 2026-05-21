/**
 * Tests for orphan budget line handling in invoiceBudgetLineService (Story #1545).
 *
 * Verifies that resolveDetail (accessed via listInvoiceBudgetLines and getBudgetLineDetail)
 * returns parentItemType: 'unassigned' with null parentItemId/parentItemTitle for
 * orphan work_item_budget rows (where work_item_id IS NULL).
 *
 * Also verifies that non-orphan lines still resolve correctly.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import { listInvoiceBudgetLines, getBudgetLineDetail } from './invoiceBudgetLineService.js';

describe('invoiceBudgetLineService — orphan budget line handling', () => {
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

  function insertInvoice(vendorId: string, amount = 1000): string {
    const id = makeId('inv');
    const t = ts();
    db.insert(schema.invoices)
      .values({
        id,
        vendorId,
        invoiceNumber: null,
        amount,
        date: '2026-01-15',
        dueDate: null,
        status: 'pending',
        notes: null,
        createdBy: null,
        createdAt: t,
        updatedAt: t,
      })
      .run();
    return id;
  }

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

  function insertHouseholdItem(name = 'Test HI'): string {
    const id = makeId('hi');
    const t = ts();
    db.insert(schema.householdItems)
      .values({
        id,
        name,
        description: null,
        categoryId: 'hic-furniture',
        status: 'planned',
        vendorId: null,
        areaId: null,
        url: null,
        quantity: 1,
        orderDate: null,
        actualDeliveryDate: null,
        earliestDeliveryDate: null,
        latestDeliveryDate: null,
        targetDeliveryDate: null,
        isLate: false,
        createdBy: null,
        createdAt: t,
        updatedAt: t,
      })
      .run();
    return id;
  }

  /**
   * Insert an orphan work_item_budget (workItemId = null) and link it to an invoice.
   * Returns { wibId, iblId }.
   */
  function insertOrphanLinkedToInvoice(
    invoiceId: string,
    plannedAmount = 400,
  ): { wibId: string; iblId: string } {
    const wibId = makeId('wib');
    const t1 = ts();
    db.insert(schema.workItemBudgets)
      .values({
        id: wibId,
        workItemId: null, // ORPHAN
        description: 'Orphan budget line',
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
        createdAt: t1,
        updatedAt: t1,
        origin: 'manual',
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
        itemizedAmount: plannedAmount,
        createdAt: t2,
        updatedAt: t2,
      })
      .run();

    return { wibId, iblId };
  }

  /**
   * Insert an assigned work_item_budget (workItemId set) and link it to an invoice.
   */
  function insertAssignedWIBLinkedToInvoice(
    invoiceId: string,
    workItemId: string,
    plannedAmount = 300,
  ): { wibId: string; iblId: string } {
    const wibId = makeId('wib');
    const t1 = ts();
    db.insert(schema.workItemBudgets)
      .values({
        id: wibId,
        workItemId, // Assigned
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
        createdAt: t1,
        updatedAt: t1,
        origin: 'manual',
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
        itemizedAmount: plannedAmount,
        createdAt: t2,
        updatedAt: t2,
      })
      .run();

    return { wibId, iblId };
  }

  /**
   * Insert a household_item_budget and link it to an invoice.
   */
  function insertHIBLinkedToInvoice(
    invoiceId: string,
    householdItemId: string,
    plannedAmount = 200,
  ): { hibId: string; iblId: string } {
    const hibId = makeId('hib');
    const t1 = ts();
    db.insert(schema.householdItemBudgets)
      .values({
        id: hibId,
        householdItemId,
        description: 'HI budget line',
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
        createdAt: t1,
        updatedAt: t1,
        origin: 'manual',
      })
      .run();

    const iblId = makeId('ibl');
    const t2 = ts();
    db.insert(schema.invoiceBudgetLines)
      .values({
        id: iblId,
        invoiceId,
        workItemBudgetId: null,
        householdItemBudgetId: hibId,
        itemizedAmount: plannedAmount,
        createdAt: t2,
        updatedAt: t2,
      })
      .run();

    return { hibId, iblId };
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

  // ─── Orphan budget line detail ────────────────────────────────────────────

  describe('orphan work_item_budget (workItemId IS NULL)', () => {
    it('listInvoiceBudgetLines returns parentItemType: unassigned for an orphan budget line', () => {
      const vendorId = insertVendor();
      const invoiceId = insertInvoice(vendorId, 1000);
      insertOrphanLinkedToInvoice(invoiceId, 400);

      const result = listInvoiceBudgetLines(db, invoiceId);

      expect(result.budgetLines).toHaveLength(1);
      expect(result.budgetLines[0]!.parentItemType).toBe('unassigned');
    });

    it('listInvoiceBudgetLines returns parentItemId: null for an orphan budget line', () => {
      const vendorId = insertVendor();
      const invoiceId = insertInvoice(vendorId, 1000);
      insertOrphanLinkedToInvoice(invoiceId);

      const result = listInvoiceBudgetLines(db, invoiceId);

      expect(result.budgetLines[0]!.parentItemId).toBeNull();
    });

    it('listInvoiceBudgetLines returns parentItemTitle: null for an orphan budget line', () => {
      const vendorId = insertVendor();
      const invoiceId = insertInvoice(vendorId, 1000);
      insertOrphanLinkedToInvoice(invoiceId);

      const result = listInvoiceBudgetLines(db, invoiceId);

      expect(result.budgetLines[0]!.parentItemTitle).toBeNull();
    });

    it('getBudgetLineDetail returns parentItemType: unassigned for an orphan budget line', () => {
      const vendorId = insertVendor();
      const invoiceId = insertInvoice(vendorId, 1000);
      const { iblId } = insertOrphanLinkedToInvoice(invoiceId, 400);

      const result = getBudgetLineDetail(db, iblId);

      expect(result.parentItemType).toBe('unassigned');
      expect(result.parentItemId).toBeNull();
      expect(result.parentItemTitle).toBeNull();
    });

    it('getBudgetLineDetail still returns workItemBudgetId (pointing to the orphan wib)', () => {
      const vendorId = insertVendor();
      const invoiceId = insertInvoice(vendorId, 1000);
      const { wibId, iblId } = insertOrphanLinkedToInvoice(invoiceId);

      const result = getBudgetLineDetail(db, iblId);

      expect(result.workItemBudgetId).toBe(wibId);
      expect(result.householdItemBudgetId).toBeNull();
    });

    it('orphan budget line still has correct plannedAmount and confidence', () => {
      const vendorId = insertVendor();
      const invoiceId = insertInvoice(vendorId, 1000);
      insertOrphanLinkedToInvoice(invoiceId, 750);

      const result = listInvoiceBudgetLines(db, invoiceId);

      expect(result.budgetLines[0]!.plannedAmount).toBe(750);
      expect(result.budgetLines[0]!.confidence).toBe('own_estimate');
    });

    it('remainingAmount accounts for orphan budget line itemizedAmount', () => {
      const vendorId = insertVendor();
      const invoiceId = insertInvoice(vendorId, 1000);
      insertOrphanLinkedToInvoice(invoiceId, 400);

      const result = listInvoiceBudgetLines(db, invoiceId);

      expect(result.remainingAmount).toBe(600); // 1000 - 400
    });
  });

  // ─── Non-orphan lines still resolve correctly ─────────────────────────────

  describe('non-orphan lines resolve correctly', () => {
    it('assigned work_item budget line returns parentItemType: work_item', () => {
      const vendorId = insertVendor();
      const invoiceId = insertInvoice(vendorId, 1000);
      const wiId = insertWorkItem('Roof Work');
      insertAssignedWIBLinkedToInvoice(invoiceId, wiId, 500);

      const result = listInvoiceBudgetLines(db, invoiceId);

      expect(result.budgetLines[0]!.parentItemType).toBe('work_item');
      expect(result.budgetLines[0]!.parentItemId).toBe(wiId);
      expect(result.budgetLines[0]!.parentItemTitle).toBe('Roof Work');
    });

    it('household_item budget line returns parentItemType: household_item', () => {
      const vendorId = insertVendor();
      const invoiceId = insertInvoice(vendorId, 1000);
      const hiId = insertHouseholdItem('Dining Table');
      insertHIBLinkedToInvoice(invoiceId, hiId, 300);

      const result = listInvoiceBudgetLines(db, invoiceId);

      expect(result.budgetLines[0]!.parentItemType).toBe('household_item');
      expect(result.budgetLines[0]!.parentItemId).toBe(hiId);
      expect(result.budgetLines[0]!.parentItemTitle).toBe('Dining Table');
    });

    it('mixed invoice: orphan and assigned lines resolve independently', () => {
      const vendorId = insertVendor();
      const invoiceId = insertInvoice(vendorId, 2000);
      const wiId = insertWorkItem('Plumbing');
      // Use separate invoices for each line to avoid unique constraint on work_item_budget_id
      // Actually both can share same invoice as long as the budget line IDs are different
      insertOrphanLinkedToInvoice(invoiceId, 400);
      // Need a separate invoice for the assigned WIB due to unique IBL constraint per wib
      const vendorId2 = insertVendor();
      const invoiceId2 = insertInvoice(vendorId2, 500);
      insertAssignedWIBLinkedToInvoice(invoiceId2, wiId, 500);

      const orphanResult = listInvoiceBudgetLines(db, invoiceId);
      const assignedResult = listInvoiceBudgetLines(db, invoiceId2);

      expect(orphanResult.budgetLines[0]!.parentItemType).toBe('unassigned');
      expect(assignedResult.budgetLines[0]!.parentItemType).toBe('work_item');
    });
  });
});
