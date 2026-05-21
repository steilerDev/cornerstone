/**
 * Unit tests for budgetLineAssignService (Story #1545).
 *
 * Uses a real in-memory SQLite database with applied migrations.
 * Covers: work_item assignment, household_item assignment, 404/409 error paths,
 * field preservation, and transaction atomicity.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import { assignBudgetLine } from './budgetLineAssignService.js';
import { NotFoundError, BudgetLineAlreadyAssignedError } from '../errors/AppError.js';

describe('budgetLineAssignService', () => {
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
      .values({ id, name: `Vendor ${id}`, tradeId: null, phone: null, email: null, address: null, notes: null, createdBy: null, createdAt: t, updatedAt: t })
      .run();
    return id;
  }

  function insertWorkItem(title = 'Test Work Item'): string {
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
   * Insert an orphan work_item_budget (workItemId = null) and link it to an invoice
   * via invoice_budget_lines. Returns { wibId, invoiceId, iblId }.
   */
  function insertOrphanWithInvoice(opts: {
    description?: string;
    plannedAmount?: number;
    confidence?: 'own_estimate' | 'professional_estimate' | 'quote' | 'invoice';
    budgetCategoryId?: string | null;
    vendorId?: string | null;
    quantity?: number | null;
    unit?: string | null;
    unitPrice?: number | null;
    includesVat?: boolean;
    createdBy?: string | null;
  } = {}): { wibId: string; invoiceId: string; iblId: string } {
    const wibId = makeId('wib');
    const t = ts();

    // Insert orphan work_item_budget with workItemId = null
    db.insert(schema.workItemBudgets)
      .values({
        id: wibId,
        workItemId: null, // ORPHAN
        description: opts.description ?? 'Orphan budget line',
        plannedAmount: opts.plannedAmount ?? 500,
        confidence: opts.confidence ?? 'own_estimate',
        budgetCategoryId: opts.budgetCategoryId ?? null,
        budgetSourceId: null,
        vendorId: opts.vendorId ?? null,
        quantity: opts.quantity ?? null,
        unit: opts.unit ?? null,
        unitPrice: opts.unitPrice ?? null,
        includesVat: opts.includesVat ?? true,
        createdBy: opts.createdBy ?? null,
        createdAt: t,
        updatedAt: t,
        origin: 'manual',
      })
      .run();

    // Create a vendor + invoice so we can link the IBL
    const vendorId = insertVendor();
    const invoiceId = makeId('inv');
    const tInv = ts();
    db.insert(schema.invoices)
      .values({
        id: invoiceId,
        vendorId,
        invoiceNumber: null,
        amount: opts.plannedAmount ?? 500,
        date: '2026-01-15',
        dueDate: null,
        status: 'pending',
        notes: null,
        createdBy: null,
        createdAt: tInv,
        updatedAt: tInv,
      })
      .run();

    // Link via invoice_budget_lines
    const iblId = makeId('ibl');
    const tIbl = ts();
    db.insert(schema.invoiceBudgetLines)
      .values({
        id: iblId,
        invoiceId,
        workItemBudgetId: wibId,
        householdItemBudgetId: null,
        itemizedAmount: opts.plannedAmount ?? 500,
        createdAt: tIbl,
        updatedAt: tIbl,
      })
      .run();

    return { wibId, invoiceId, iblId };
  }

  /**
   * Insert an assigned (non-orphan) work_item_budget row for conflict testing.
   */
  function insertAssignedWIB(workItemId: string): string {
    const wibId = makeId('wib');
    const t = ts();
    db.insert(schema.workItemBudgets)
      .values({
        id: wibId,
        workItemId, // Already assigned
        description: 'Assigned budget line',
        plannedAmount: 300,
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
    return wibId;
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

  // ─── 404: line not found ───────────────────────────────────────────────────

  describe('404: budget line not found', () => {
    it('throws NotFoundError when the wib ID does not exist', () => {
      expect(() => {
        assignBudgetLine(db, 'nonexistent-wib-id', { targetType: 'work_item', targetId: 'wi-1' }, 'user-1');
      }).toThrow(NotFoundError);
    });

    it('error message references the missing budget line', () => {
      let caught: unknown;
      try {
        assignBudgetLine(db, 'nonexistent-wib-id', { targetType: 'work_item', targetId: 'wi-1' }, 'user-1');
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(NotFoundError);
      expect((caught as NotFoundError).code).toBe('NOT_FOUND');
    });
  });

  // ─── 409: already assigned ─────────────────────────────────────────────────

  describe('409: budget line already assigned', () => {
    it('throws BudgetLineAlreadyAssignedError when the wib already has a work_item_id', () => {
      const wiId = insertWorkItem();
      const wibId = insertAssignedWIB(wiId);
      const targetWiId = insertWorkItem('Another WI');

      expect(() => {
        assignBudgetLine(db, wibId, { targetType: 'work_item', targetId: targetWiId }, 'user-1');
      }).toThrow(BudgetLineAlreadyAssignedError);
    });

    it('BudgetLineAlreadyAssignedError has code BUDGET_LINE_ALREADY_ASSIGNED', () => {
      const wiId = insertWorkItem();
      const wibId = insertAssignedWIB(wiId);
      const targetWiId = insertWorkItem('Another WI');

      let caught: unknown;
      try {
        assignBudgetLine(db, wibId, { targetType: 'work_item', targetId: targetWiId }, 'user-1');
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(BudgetLineAlreadyAssignedError);
      expect((caught as BudgetLineAlreadyAssignedError).code).toBe('BUDGET_LINE_ALREADY_ASSIGNED');
    });
  });

  // ─── work_item assignment path ─────────────────────────────────────────────

  describe('assign to work_item', () => {
    it('throws NotFoundError when target work item does not exist', () => {
      const { wibId } = insertOrphanWithInvoice();
      expect(() => {
        assignBudgetLine(db, wibId, { targetType: 'work_item', targetId: 'nonexistent-wi' }, 'user-1');
      }).toThrow(NotFoundError);
    });

    it('updates work_item_id on the budget line', () => {
      const { wibId } = insertOrphanWithInvoice();
      const wiId = insertWorkItem('Target Work Item');

      assignBudgetLine(db, wibId, { targetType: 'work_item', targetId: wiId }, 'user-1');

      const updated = db.select().from(schema.workItemBudgets).where(eq(schema.workItemBudgets.id, wibId)).get();
      expect(updated?.workItemId).toBe(wiId);
    });

    it('returns response with parentItemType: work_item', () => {
      const { wibId } = insertOrphanWithInvoice();
      const wiId = insertWorkItem('Kitchen Reno');

      const result = assignBudgetLine(db, wibId, { targetType: 'work_item', targetId: wiId }, 'user-1');

      expect(result.parentItemType).toBe('work_item');
    });

    it('returns response with correct parentItemId', () => {
      const { wibId } = insertOrphanWithInvoice();
      const wiId = insertWorkItem('Kitchen Reno');

      const result = assignBudgetLine(db, wibId, { targetType: 'work_item', targetId: wiId }, 'user-1');

      expect(result.parentItemId).toBe(wiId);
    });

    it('returns response with correct parentItemTitle', () => {
      const { wibId } = insertOrphanWithInvoice();
      const wiId = insertWorkItem('Bathroom Tiles');

      const result = assignBudgetLine(db, wibId, { targetType: 'work_item', targetId: wiId }, 'user-1');

      expect(result.parentItemTitle).toBe('Bathroom Tiles');
    });

    it('does not update budgetCategoryId when not provided in body', () => {
      const { wibId } = insertOrphanWithInvoice({ budgetCategoryId: null });
      const wiId = insertWorkItem();

      assignBudgetLine(db, wibId, { targetType: 'work_item', targetId: wiId }, 'user-1');

      const updated = db.select().from(schema.workItemBudgets).where(eq(schema.workItemBudgets.id, wibId)).get();
      expect(updated?.budgetCategoryId).toBeNull();
    });

    it('updates budgetCategoryId when budgetCategoryId is provided in body', () => {
      const { wibId } = insertOrphanWithInvoice({ budgetCategoryId: null });
      const wiId = insertWorkItem();
      // 'bc-materials' is a seeded budget category from migrations
      const catId = 'bc-materials';

      assignBudgetLine(db, wibId, {
        targetType: 'work_item',
        targetId: wiId,
        budgetCategoryId: catId,
      }, 'user-1');

      const updated = db.select().from(schema.workItemBudgets).where(eq(schema.workItemBudgets.id, wibId)).get();
      expect(updated?.budgetCategoryId).toBe(catId);
    });

    it('returns workItemBudgetId pointing to the original wib', () => {
      const { wibId } = insertOrphanWithInvoice();
      const wiId = insertWorkItem();

      const result = assignBudgetLine(db, wibId, { targetType: 'work_item', targetId: wiId }, 'user-1');

      expect(result.workItemBudgetId).toBe(wibId);
    });

    it('returns householdItemBudgetId as null', () => {
      const { wibId } = insertOrphanWithInvoice();
      const wiId = insertWorkItem();

      const result = assignBudgetLine(db, wibId, { targetType: 'work_item', targetId: wiId }, 'user-1');

      expect(result.householdItemBudgetId).toBeNull();
    });

    it('original wib row still exists after assignment', () => {
      const { wibId } = insertOrphanWithInvoice();
      const wiId = insertWorkItem();

      assignBudgetLine(db, wibId, { targetType: 'work_item', targetId: wiId }, 'user-1');

      const stillExists = db.select().from(schema.workItemBudgets).where(eq(schema.workItemBudgets.id, wibId)).get();
      expect(stillExists).toBeDefined();
    });
  });

  // ─── household_item assignment path ────────────────────────────────────────

  describe('assign to household_item', () => {
    it('throws NotFoundError when target household item does not exist', () => {
      const { wibId } = insertOrphanWithInvoice();
      expect(() => {
        assignBudgetLine(db, wibId, { targetType: 'household_item', targetId: 'nonexistent-hi' }, 'user-1');
      }).toThrow(NotFoundError);
    });

    it('returns response with parentItemType: household_item', () => {
      const { wibId } = insertOrphanWithInvoice();
      const hiId = insertHouseholdItem('Sofa');

      const result = assignBudgetLine(db, wibId, { targetType: 'household_item', targetId: hiId }, 'user-1');

      expect(result.parentItemType).toBe('household_item');
    });

    it('returns response with correct parentItemId', () => {
      const { wibId } = insertOrphanWithInvoice();
      const hiId = insertHouseholdItem('Coffee Table');

      const result = assignBudgetLine(db, wibId, { targetType: 'household_item', targetId: hiId }, 'user-1');

      expect(result.parentItemId).toBe(hiId);
    });

    it('returns response with correct parentItemTitle', () => {
      const { wibId } = insertOrphanWithInvoice();
      const hiId = insertHouseholdItem('Dining Chair');

      const result = assignBudgetLine(db, wibId, { targetType: 'household_item', targetId: hiId }, 'user-1');

      expect(result.parentItemTitle).toBe('Dining Chair');
    });

    it('creates a new household_item_budgets row', () => {
      const { wibId } = insertOrphanWithInvoice({ plannedAmount: 750 });
      const hiId = insertHouseholdItem();

      const beforeCount = db.select().from(schema.householdItemBudgets).all().length;
      assignBudgetLine(db, wibId, { targetType: 'household_item', targetId: hiId }, 'user-1');
      const afterCount = db.select().from(schema.householdItemBudgets).all().length;

      expect(afterCount).toBe(beforeCount + 1);
    });

    it('new household_item_budgets row has budgetCategoryId forced to bc-household-items', () => {
      const { wibId } = insertOrphanWithInvoice({ budgetCategoryId: 'bc-materials' });
      const hiId = insertHouseholdItem();

      assignBudgetLine(db, wibId, { targetType: 'household_item', targetId: hiId }, 'user-1');

      const hibs = db.select().from(schema.householdItemBudgets).all();
      expect(hibs).toHaveLength(1);
      expect(hibs[0]!.budgetCategoryId).toBe('bc-household-items');
    });

    it('new household_item_budgets row is linked to the target household item', () => {
      const { wibId } = insertOrphanWithInvoice();
      const hiId = insertHouseholdItem();

      assignBudgetLine(db, wibId, { targetType: 'household_item', targetId: hiId }, 'user-1');

      const hib = db.select().from(schema.householdItemBudgets).all()[0];
      expect(hib?.householdItemId).toBe(hiId);
    });

    it('preserves description on the new household_item_budget row', () => {
      const { wibId } = insertOrphanWithInvoice({ description: 'Special import budget' });
      const hiId = insertHouseholdItem();

      assignBudgetLine(db, wibId, { targetType: 'household_item', targetId: hiId }, 'user-1');

      const hib = db.select().from(schema.householdItemBudgets).all()[0];
      expect(hib?.description).toBe('Special import budget');
    });

    it('preserves plannedAmount on the new household_item_budget row', () => {
      const { wibId } = insertOrphanWithInvoice({ plannedAmount: 1234 });
      const hiId = insertHouseholdItem();

      assignBudgetLine(db, wibId, { targetType: 'household_item', targetId: hiId }, 'user-1');

      const hib = db.select().from(schema.householdItemBudgets).all()[0];
      expect(hib?.plannedAmount).toBe(1234);
    });

    it('preserves confidence on the new household_item_budget row', () => {
      const { wibId } = insertOrphanWithInvoice({ confidence: 'quote' });
      const hiId = insertHouseholdItem();

      assignBudgetLine(db, wibId, { targetType: 'household_item', targetId: hiId }, 'user-1');

      const hib = db.select().from(schema.householdItemBudgets).all()[0];
      expect(hib?.confidence).toBe('quote');
    });

    it('preserves vendorId on the new household_item_budget row', () => {
      const vendorId = insertVendor();
      const { wibId } = insertOrphanWithInvoice({ vendorId });
      const hiId = insertHouseholdItem();

      assignBudgetLine(db, wibId, { targetType: 'household_item', targetId: hiId }, 'user-1');

      const hib = db.select().from(schema.householdItemBudgets).all()[0];
      expect(hib?.vendorId).toBe(vendorId);
    });

    it('preserves quantity on the new household_item_budget row', () => {
      const { wibId } = insertOrphanWithInvoice({ quantity: 3 });
      const hiId = insertHouseholdItem();

      assignBudgetLine(db, wibId, { targetType: 'household_item', targetId: hiId }, 'user-1');

      const hib = db.select().from(schema.householdItemBudgets).all()[0];
      expect(hib?.quantity).toBe(3);
    });

    it('preserves unit on the new household_item_budget row', () => {
      const { wibId } = insertOrphanWithInvoice({ unit: 'm²' });
      const hiId = insertHouseholdItem();

      assignBudgetLine(db, wibId, { targetType: 'household_item', targetId: hiId }, 'user-1');

      const hib = db.select().from(schema.householdItemBudgets).all()[0];
      expect(hib?.unit).toBe('m²');
    });

    it('preserves unitPrice on the new household_item_budget row', () => {
      const { wibId } = insertOrphanWithInvoice({ unitPrice: 99.5 });
      const hiId = insertHouseholdItem();

      assignBudgetLine(db, wibId, { targetType: 'household_item', targetId: hiId }, 'user-1');

      const hib = db.select().from(schema.householdItemBudgets).all()[0];
      expect(hib?.unitPrice).toBe(99.5);
    });

    it('preserves includesVat on the new household_item_budget row', () => {
      const { wibId } = insertOrphanWithInvoice({ includesVat: false });
      const hiId = insertHouseholdItem();

      assignBudgetLine(db, wibId, { targetType: 'household_item', targetId: hiId }, 'user-1');

      const hib = db.select().from(schema.householdItemBudgets).all()[0];
      expect(hib?.includesVat).toBe(false);
    });

    it('deletes the original orphan work_item_budgets row', () => {
      const { wibId } = insertOrphanWithInvoice();
      const hiId = insertHouseholdItem();

      assignBudgetLine(db, wibId, { targetType: 'household_item', targetId: hiId }, 'user-1');

      const gone = db.select().from(schema.workItemBudgets).where(eq(schema.workItemBudgets.id, wibId)).get();
      expect(gone).toBeUndefined();
    });

    it('repoints invoice_budget_lines to the new household_item_budget (workItemBudgetId becomes null)', () => {
      const { wibId, iblId } = insertOrphanWithInvoice();
      const hiId = insertHouseholdItem();

      assignBudgetLine(db, wibId, { targetType: 'household_item', targetId: hiId }, 'user-1');

      const ibl = db.select().from(schema.invoiceBudgetLines).where(eq(schema.invoiceBudgetLines.id, iblId)).get();
      expect(ibl?.workItemBudgetId).toBeNull();
    });

    it('repoints invoice_budget_lines to the new household_item_budget (householdItemBudgetId set)', () => {
      const { wibId, iblId } = insertOrphanWithInvoice();
      const hiId = insertHouseholdItem();

      assignBudgetLine(db, wibId, { targetType: 'household_item', targetId: hiId }, 'user-1');

      const ibl = db.select().from(schema.invoiceBudgetLines).where(eq(schema.invoiceBudgetLines.id, iblId)).get();
      const hib = db.select().from(schema.householdItemBudgets).all()[0];
      expect(ibl?.householdItemBudgetId).toBe(hib?.id);
    });

    it('returns householdItemBudgetId set (not null) in response', () => {
      const { wibId } = insertOrphanWithInvoice();
      const hiId = insertHouseholdItem();

      const result = assignBudgetLine(db, wibId, { targetType: 'household_item', targetId: hiId }, 'user-1');

      expect(result.householdItemBudgetId).not.toBeNull();
    });

    it('returns workItemBudgetId as null in response', () => {
      const { wibId } = insertOrphanWithInvoice();
      const hiId = insertHouseholdItem();

      const result = assignBudgetLine(db, wibId, { targetType: 'household_item', targetId: hiId }, 'user-1');

      expect(result.workItemBudgetId).toBeNull();
    });

    it('transaction is atomic: if IBL lookup fails, no partial state is written', () => {
      // Create an orphan wib WITHOUT linking it to an invoice (no IBL row)
      const wibId = makeId('wib');
      const t = ts();
      db.insert(schema.workItemBudgets)
        .values({
          id: wibId,
          workItemId: null,
          description: 'Orphan without IBL',
          plannedAmount: 100,
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

      const hiId = insertHouseholdItem();
      const wibCountBefore = db.select().from(schema.workItemBudgets).all().length;
      const hibCountBefore = db.select().from(schema.householdItemBudgets).all().length;

      // Should throw NotFoundError because no IBL links to this wib
      expect(() => {
        assignBudgetLine(db, wibId, { targetType: 'household_item', targetId: hiId }, 'user-1');
      }).toThrow(NotFoundError);

      // Verify no partial state: wib still exists, no hib was created
      const wibCountAfter = db.select().from(schema.workItemBudgets).all().length;
      const hibCountAfter = db.select().from(schema.householdItemBudgets).all().length;
      expect(wibCountAfter).toBe(wibCountBefore);
      expect(hibCountAfter).toBe(hibCountBefore);
    });
  });

  // ─── return shape ──────────────────────────────────────────────────────────

  describe('return shape', () => {
    it('work_item path: result has all required InvoiceBudgetLineDetailResponse fields', () => {
      const { wibId, invoiceId } = insertOrphanWithInvoice({ plannedAmount: 600 });
      const wiId = insertWorkItem('Wall Paint');

      const result = assignBudgetLine(db, wibId, { targetType: 'work_item', targetId: wiId }, 'user-1');

      expect(result.id).toBeDefined();
      expect(result.invoiceId).toBe(invoiceId);
      expect(result.plannedAmount).toBe(600);
      expect(result.confidence).toBe('own_estimate');
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
    });

    it('household_item path: result has all required InvoiceBudgetLineDetailResponse fields', () => {
      const { wibId, invoiceId } = insertOrphanWithInvoice({ plannedAmount: 800 });
      const hiId = insertHouseholdItem('Armchair');

      const result = assignBudgetLine(db, wibId, { targetType: 'household_item', targetId: hiId }, 'user-1');

      expect(result.id).toBeDefined();
      expect(result.invoiceId).toBe(invoiceId);
      expect(result.plannedAmount).toBe(800);
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
    });
  });
});
