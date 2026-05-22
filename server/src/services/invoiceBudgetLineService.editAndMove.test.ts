import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import * as invoiceBudgetLineService from './invoiceBudgetLineService.js';
import {
  NotFoundError,
  ValidationError,
  BudgetLineAlreadyLinkedError,
  ItemizedSumExceedsInvoiceError,
} from '../errors/AppError.js';

describe('editAndMoveBudgetLine()', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;
  let tsOffset = 0;

  function createTestDb() {
    const sqliteDb = new Database(':memory:');
    sqliteDb.pragma('journal_mode = WAL');
    sqliteDb.pragma('foreign_keys = ON');
    runMigrations(sqliteDb);
    return { sqlite: sqliteDb, db: drizzle(sqliteDb, { schema }) };
  }

  function ts(): string {
    return new Date(Date.now() + tsOffset++).toISOString();
  }

  function createVendor(name = 'Vendor'): string {
    const id = `vendor-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const t = ts();
    db.insert(schema.vendors)
      .values({ id, name, tradeId: null, phone: null, email: null, address: null, notes: null, createdBy: null, createdAt: t, updatedAt: t })
      .run();
    return id;
  }

  function createInvoice(vendorId: string, amount = 1000): string {
    const id = `inv-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const t = ts();
    db.insert(schema.invoices)
      .values({ id, vendorId, invoiceNumber: null, amount, date: '2026-01-15', dueDate: null, status: 'pending', notes: null, createdBy: null, createdAt: t, updatedAt: t })
      .run();
    return id;
  }

  function createWorkItem(title = 'Work Item'): string {
    const id = `wi-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const t = ts();
    db.insert(schema.workItems)
      .values({ id, title, description: null, status: 'not_started', startDate: null, endDate: null, actualStartDate: null, actualEndDate: null, durationDays: null, startAfter: null, startBefore: null, assignedUserId: null, areaId: null, assignedVendorId: null, createdBy: null, createdAt: t, updatedAt: t })
      .run();
    return id;
  }

  function createWorkItemBudget(workItemId: string, options: { plannedAmount?: number; description?: string; budgetCategoryId?: string | null } = {}): string {
    const id = `wib-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const t = ts();
    db.insert(schema.workItemBudgets)
      .values({ id, workItemId, description: options.description ?? 'WI Budget', plannedAmount: options.plannedAmount ?? 500, confidence: 'own_estimate', budgetCategoryId: options.budgetCategoryId ?? null, budgetSourceId: null, vendorId: null, quantity: null, unit: null, unitPrice: null, includesVat: true, createdBy: null, createdAt: t, updatedAt: t })
      .run();
    return id;
  }

  function createHouseholdItem(name = 'Household Item'): string {
    const id = `hi-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const t = ts();
    db.insert(schema.householdItems)
      .values({ id, name, description: null, categoryId: 'hic-furniture', status: 'planned', vendorId: null, areaId: null, url: null, quantity: 1, orderDate: null, actualDeliveryDate: null, earliestDeliveryDate: null, latestDeliveryDate: null, targetDeliveryDate: null, isLate: false, createdBy: null, createdAt: t, updatedAt: t })
      .run();
    return id;
  }

  function createHouseholdItemBudget(householdItemId: string, options: { plannedAmount?: number; description?: string } = {}): string {
    const id = `hib-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const t = ts();
    db.insert(schema.householdItemBudgets)
      .values({ id, householdItemId, description: options.description ?? 'HI Budget', plannedAmount: options.plannedAmount ?? 500, confidence: 'own_estimate', budgetCategoryId: 'bc-household-items', budgetSourceId: null, vendorId: null, quantity: null, unit: null, unitPrice: null, includesVat: true, createdBy: null, createdAt: t, updatedAt: t })
      .run();
    return id;
  }

  /** Creates an IBL linked to a WIB and returns { iblId, wibId }. */
  function createIblOnWorkItem(invoiceId: string, workItemId: string, itemizedAmount = 300): { iblId: string; wibId: string } {
    const wibId = createWorkItemBudget(workItemId);
    const result = invoiceBudgetLineService.createInvoiceBudgetLine(db, invoiceId, { workItemBudgetId: wibId, itemizedAmount });
    return { iblId: result.budgetLine.id, wibId };
  }

  /** Creates an IBL linked to a HIB and returns { iblId, hibId }. */
  function createIblOnHouseholdItem(invoiceId: string, householdItemId: string, itemizedAmount = 300): { iblId: string; hibId: string } {
    const hibId = createHouseholdItemBudget(householdItemId);
    const result = invoiceBudgetLineService.createInvoiceBudgetLine(db, invoiceId, { householdItemBudgetId: hibId, itemizedAmount });
    return { iblId: result.budgetLine.id, hibId };
  }

  beforeEach(() => {
    const testDb = createTestDb();
    sqlite = testDb.sqlite;
    db = testDb.db;
    tsOffset = 0;
  });

  afterEach(() => {
    sqlite.close();
  });

  // ─── Scenario 1: In-place edit WIB ──────────────────────────────────────────

  it('in-place edit: updates WIB description and IBL itemizedAmount; does not insert or delete rows', () => {
    const vendorId = createVendor();
    const invoiceId = createInvoice(vendorId, 1000);
    const wiId = createWorkItem('Painting');
    const { iblId, wibId } = createIblOnWorkItem(invoiceId, wiId, 300);

    const wibCountBefore = db.select().from(schema.workItemBudgets).all().length;
    const iblCountBefore = db.select().from(schema.invoiceBudgetLines).all().length;

    const result = invoiceBudgetLineService.editAndMoveBudgetLine(db, invoiceId, iblId, {
      description: 'Updated description',
      itemizedAmount: 450,
    });

    expect(result.budgetLine.id).toBe(iblId);
    expect(result.budgetLine.itemizedAmount).toBe(450);
    expect(result.budgetLine.budgetLineDescription).toBe('Updated description');
    expect(result.budgetLine.workItemBudgetId).toBe(wibId);
    expect(result.remainingAmount).toBe(550); // 1000 - 450

    // No rows inserted or deleted
    expect(db.select().from(schema.workItemBudgets).all().length).toBe(wibCountBefore);
    expect(db.select().from(schema.invoiceBudgetLines).all().length).toBe(iblCountBefore);
  });

  // ─── Scenario 2: Same-table WI move ─────────────────────────────────────────

  it('same-table WI move: WIB.workItemId changes; IBL FK (wibId) is unchanged; old WI no longer shows line', () => {
    const vendorId = createVendor();
    const invoiceId = createInvoice(vendorId, 1000);
    const wi1 = createWorkItem('Painting');
    const wi2 = createWorkItem('Plumbing');
    const { iblId, wibId } = createIblOnWorkItem(invoiceId, wi1, 300);

    const result = invoiceBudgetLineService.editAndMoveBudgetLine(db, invoiceId, iblId, {
      newWorkItemId: wi2,
    });

    expect(result.budgetLine.id).toBe(iblId);
    expect(result.budgetLine.workItemBudgetId).toBe(wibId); // IBL FK unchanged
    expect(result.budgetLine.parentItemId).toBe(wi2);
    expect(result.budgetLine.parentItemType).toBe('work_item');

    // The WIB now belongs to wi2
    const updatedWib = db.select().from(schema.workItemBudgets).where(eq(schema.workItemBudgets.id, wibId)).get()!;
    expect(updatedWib.workItemId).toBe(wi2);
  });

  // ─── Scenario 3: Same-table HI move ─────────────────────────────────────────

  it('same-table HI move: HIB.householdItemId changes; IBL FK (hibId) is unchanged', () => {
    const vendorId = createVendor();
    const invoiceId = createInvoice(vendorId, 1000);
    const hi1 = createHouseholdItem('Sofa');
    const hi2 = createHouseholdItem('Table');
    const { iblId, hibId } = createIblOnHouseholdItem(invoiceId, hi1, 300);

    const result = invoiceBudgetLineService.editAndMoveBudgetLine(db, invoiceId, iblId, {
      newHouseholdItemId: hi2,
    });

    expect(result.budgetLine.id).toBe(iblId);
    expect(result.budgetLine.householdItemBudgetId).toBe(hibId); // IBL FK unchanged
    expect(result.budgetLine.parentItemId).toBe(hi2);
    expect(result.budgetLine.parentItemType).toBe('household_item');

    const updatedHib = db.select().from(schema.householdItemBudgets).where(eq(schema.householdItemBudgets.id, hibId)).get()!;
    expect(updatedHib.householdItemId).toBe(hi2);
  });

  // ─── Scenario 4: Cross-table WI→HI ─────────────────────────────────────────

  it('cross-table WI→HI: new HIB row created; IBL repoints; old WIB deleted — all in transaction', () => {
    const vendorId = createVendor();
    const invoiceId = createInvoice(vendorId, 1000);
    const wiId = createWorkItem('Painting');
    const hiId = createHouseholdItem('Sofa');
    const { iblId, wibId } = createIblOnWorkItem(invoiceId, wiId, 300);

    const wibCountBefore = db.select().from(schema.workItemBudgets).all().length;

    const result = invoiceBudgetLineService.editAndMoveBudgetLine(db, invoiceId, iblId, {
      newHouseholdItemId: hiId,
    });

    expect(result.budgetLine.id).toBe(iblId);
    expect(result.budgetLine.householdItemBudgetId).not.toBeNull();
    expect(result.budgetLine.workItemBudgetId).toBeNull();
    expect(result.budgetLine.parentItemId).toBe(hiId);
    expect(result.budgetLine.parentItemType).toBe('household_item');

    // Old WIB deleted
    const oldWib = db.select().from(schema.workItemBudgets).where(eq(schema.workItemBudgets.id, wibId)).get();
    expect(oldWib).toBeUndefined();

    // WIB count decreased by 1
    expect(db.select().from(schema.workItemBudgets).all().length).toBe(wibCountBefore - 1);

    // New HIB exists
    const newHibId = result.budgetLine.householdItemBudgetId!;
    const newHib = db.select().from(schema.householdItemBudgets).where(eq(schema.householdItemBudgets.id, newHibId)).get();
    expect(newHib).toBeDefined();
    expect(newHib!.householdItemId).toBe(hiId);
  });

  // ─── Scenario 5: Cross-table HI→WI ─────────────────────────────────────────

  it('cross-table HI→WI: new WIB row created; IBL repoints; old HIB deleted', () => {
    const vendorId = createVendor();
    const invoiceId = createInvoice(vendorId, 1000);
    const hiId = createHouseholdItem('Sofa');
    const wiId = createWorkItem('Painting');
    const { iblId, hibId } = createIblOnHouseholdItem(invoiceId, hiId, 300);

    const hibCountBefore = db.select().from(schema.householdItemBudgets).all().length;

    const result = invoiceBudgetLineService.editAndMoveBudgetLine(db, invoiceId, iblId, {
      newWorkItemId: wiId,
    });

    expect(result.budgetLine.id).toBe(iblId);
    expect(result.budgetLine.workItemBudgetId).not.toBeNull();
    expect(result.budgetLine.householdItemBudgetId).toBeNull();
    expect(result.budgetLine.parentItemId).toBe(wiId);
    expect(result.budgetLine.parentItemType).toBe('work_item');

    // Old HIB deleted
    const oldHib = db.select().from(schema.householdItemBudgets).where(eq(schema.householdItemBudgets.id, hibId)).get();
    expect(oldHib).toBeUndefined();

    // HIB count decreased by 1
    expect(db.select().from(schema.householdItemBudgets).all().length).toBe(hibCountBefore - 1);

    // New WIB exists
    const newWibId = result.budgetLine.workItemBudgetId!;
    const newWib = db.select().from(schema.workItemBudgets).where(eq(schema.workItemBudgets.id, newWibId)).get();
    expect(newWib).toBeDefined();
    expect(newWib!.workItemId).toBe(wiId);
  });

  // ─── Scenario 6: Category fallback WI→HI ───────────────────────────────────

  it('category fallback WI→HI: when WIB has no category and no budgetCategoryId provided, new HIB gets bc-household-items', () => {
    const vendorId = createVendor();
    const invoiceId = createInvoice(vendorId, 1000);
    const wiId = createWorkItem('Painting');
    const hiId = createHouseholdItem('Chair');
    // WIB with no budget category
    const wibId = createWorkItemBudget(wiId, { budgetCategoryId: null });
    const iblResult = invoiceBudgetLineService.createInvoiceBudgetLine(db, invoiceId, { workItemBudgetId: wibId, itemizedAmount: 300 });
    const iblId = iblResult.budgetLine.id;

    invoiceBudgetLineService.editAndMoveBudgetLine(db, invoiceId, iblId, {
      newHouseholdItemId: hiId,
      // no budgetCategoryId provided
    });

    const updatedIbl = db.select().from(schema.invoiceBudgetLines).where(eq(schema.invoiceBudgetLines.id, iblId)).get()!;
    const newHib = db.select().from(schema.householdItemBudgets).where(eq(schema.householdItemBudgets.id, updatedIbl.householdItemBudgetId!)).get()!;
    expect(newHib.budgetCategoryId).toBe('bc-household-items');
  });

  // ─── Scenario 7: Category from form WI→HI ───────────────────────────────────

  it('category from form WI→HI: when budgetCategoryId provided, new HIB uses that category', () => {
    const vendorId = createVendor();
    const invoiceId = createInvoice(vendorId, 1000);
    const wiId = createWorkItem('Painting');
    const hiId = createHouseholdItem('Chair');
    const { iblId } = createIblOnWorkItem(invoiceId, wiId, 300);

    invoiceBudgetLineService.editAndMoveBudgetLine(db, invoiceId, iblId, {
      newHouseholdItemId: hiId,
      budgetCategoryId: 'bc-household-items', // explicitly provided
    });

    const updatedIbl = db.select().from(schema.invoiceBudgetLines).where(eq(schema.invoiceBudgetLines.id, iblId)).get()!;
    const newHib = db.select().from(schema.householdItemBudgets).where(eq(schema.householdItemBudgets.id, updatedIbl.householdItemBudgetId!)).get()!;
    expect(newHib.budgetCategoryId).toBe('bc-household-items');
  });

  // ─── Scenario 8: BUDGET_LINE_ALREADY_LINKED guard ───────────────────────────

  it('guard: throws BudgetLineAlreadyLinkedError when target WI already linked to same invoice via different IBL', () => {
    const vendorId = createVendor();
    const invoiceId = createInvoice(vendorId, 2000);
    const wi1 = createWorkItem('Painting');
    const wi2 = createWorkItem('Plumbing');
    const { iblId } = createIblOnWorkItem(invoiceId, wi1, 300);
    // Link wi2 to the same invoice as well
    createIblOnWorkItem(invoiceId, wi2, 300);

    expect(() => {
      invoiceBudgetLineService.editAndMoveBudgetLine(db, invoiceId, iblId, {
        newWorkItemId: wi2, // wi2 already has a different IBL on this invoice
      });
    }).toThrow(BudgetLineAlreadyLinkedError);
  });

  // ─── Scenario 9: ITEMIZED_SUM_EXCEEDS_INVOICE guard ─────────────────────────

  it('guard: throws ItemizedSumExceedsInvoiceError when new amount would exceed invoice total', () => {
    const vendorId = createVendor();
    const invoiceId = createInvoice(vendorId, 500);
    const wi1 = createWorkItem('Task A');
    const wi2 = createWorkItem('Task B');
    const { iblId } = createIblOnWorkItem(invoiceId, wi1, 300);
    createIblOnWorkItem(invoiceId, wi2, 100); // total now 400 of 500

    expect(() => {
      invoiceBudgetLineService.editAndMoveBudgetLine(db, invoiceId, iblId, {
        itemizedAmount: 450, // 450 + 100 = 550 > 500
      });
    }).toThrow(ItemizedSumExceedsInvoiceError);
  });

  // ─── Scenario 10: NOT_FOUND guard — target WI/HI does not exist ─────────────

  it('guard: throws NotFoundError when target work item does not exist', () => {
    const vendorId = createVendor();
    const invoiceId = createInvoice(vendorId, 1000);
    const wiId = createWorkItem('Painting');
    const { iblId } = createIblOnWorkItem(invoiceId, wiId, 300);

    expect(() => {
      invoiceBudgetLineService.editAndMoveBudgetLine(db, invoiceId, iblId, {
        newWorkItemId: 'non-existent-wi',
      });
    }).toThrow(NotFoundError);
  });

  it('guard: throws NotFoundError when target household item does not exist', () => {
    const vendorId = createVendor();
    const invoiceId = createInvoice(vendorId, 1000);
    const wiId = createWorkItem('Painting');
    const { iblId } = createIblOnWorkItem(invoiceId, wiId, 300);

    expect(() => {
      invoiceBudgetLineService.editAndMoveBudgetLine(db, invoiceId, iblId, {
        newHouseholdItemId: 'non-existent-hi',
      });
    }).toThrow(NotFoundError);
  });

  // ─── Scenario 11: VALIDATION_ERROR — both move fields provided ──────────────

  it('guard: throws ValidationError when both newWorkItemId and newHouseholdItemId are provided', () => {
    const vendorId = createVendor();
    const invoiceId = createInvoice(vendorId, 1000);
    const wiId = createWorkItem('Painting');
    const hiId = createHouseholdItem('Sofa');
    const { iblId } = createIblOnWorkItem(invoiceId, wiId, 300);

    expect(() => {
      invoiceBudgetLineService.editAndMoveBudgetLine(db, invoiceId, iblId, {
        newWorkItemId: wiId,
        newHouseholdItemId: hiId,
      });
    }).toThrow(ValidationError);
  });

  // ─── Scenario 12: Transaction atomicity ─────────────────────────────────────

  it('transaction atomicity: no partial changes when move fails mid-transaction', () => {
    const vendorId = createVendor();
    const invoiceId = createInvoice(vendorId, 2000);
    const wi1 = createWorkItem('Painting');
    const wi2 = createWorkItem('Plumbing');
    const { iblId } = createIblOnWorkItem(invoiceId, wi1, 300);
    // wi2 is already linked — will trigger BudgetLineAlreadyLinkedError inside transaction
    createIblOnWorkItem(invoiceId, wi2, 300);

    const wibCountBefore = db.select().from(schema.workItemBudgets).all().length;
    const iblCountBefore = db.select().from(schema.invoiceBudgetLines).all().length;

    expect(() => {
      invoiceBudgetLineService.editAndMoveBudgetLine(db, invoiceId, iblId, {
        newWorkItemId: wi2,
      });
    }).toThrow(BudgetLineAlreadyLinkedError);

    // No changes committed
    expect(db.select().from(schema.workItemBudgets).all().length).toBe(wibCountBefore);
    expect(db.select().from(schema.invoiceBudgetLines).all().length).toBe(iblCountBefore);

    // Original IBL still points to original WIB
    const ibl = db.select().from(schema.invoiceBudgetLines).where(eq(schema.invoiceBudgetLines.id, iblId)).get()!;
    expect(ibl.workItemBudgetId).not.toBeNull();
  });

  // ─── Scenario 13: In-place edit on HIB ──────────────────────────────────────

  it('in-place edit on HIB: updates HIB fields correctly', () => {
    const vendorId = createVendor();
    const invoiceId = createInvoice(vendorId, 1000);
    const hiId = createHouseholdItem('Sofa');
    const { iblId, hibId } = createIblOnHouseholdItem(invoiceId, hiId, 300);

    const result = invoiceBudgetLineService.editAndMoveBudgetLine(db, invoiceId, iblId, {
      description: 'New HIB description',
      plannedAmount: 750,
      itemizedAmount: 400,
    });

    expect(result.budgetLine.id).toBe(iblId);
    expect(result.budgetLine.householdItemBudgetId).toBe(hibId);
    expect(result.budgetLine.itemizedAmount).toBe(400);
    expect(result.budgetLine.budgetLineDescription).toBe('New HIB description');
    expect(result.budgetLine.plannedAmount).toBe(750);
  });

  // ─── Scenario 14: Move with no field changes ─────────────────────────────────

  it('move with no field changes: only FK changes, existing description and amount preserved', () => {
    const vendorId = createVendor();
    const invoiceId = createInvoice(vendorId, 1000);
    const wi1 = createWorkItem('Painting');
    const wi2 = createWorkItem('Flooring');
    const wibId = createWorkItemBudget(wi1, { description: 'Original description', plannedAmount: 888 });
    const iblResult = invoiceBudgetLineService.createInvoiceBudgetLine(db, invoiceId, { workItemBudgetId: wibId, itemizedAmount: 300 });
    const iblId = iblResult.budgetLine.id;

    const result = invoiceBudgetLineService.editAndMoveBudgetLine(db, invoiceId, iblId, {
      newWorkItemId: wi2,
    });

    // Description and plannedAmount unchanged
    expect(result.budgetLine.budgetLineDescription).toBe('Original description');
    expect(result.budgetLine.plannedAmount).toBe(888);
    // Parent changed
    expect(result.budgetLine.parentItemId).toBe(wi2);
    // itemizedAmount unchanged
    expect(result.budgetLine.itemizedAmount).toBe(300);
  });
});
