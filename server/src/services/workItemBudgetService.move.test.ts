import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import { updateWorkItemBudget } from './workItemBudgetService.js';
import { NotFoundError, ValidationError } from '../errors/AppError.js';

/**
 * Tests for updateWorkItemBudget() move functionality (same-table WI→WI moves
 * and cross-table rejection).
 *
 * Per the implementation decision, `updateAndMoveWorkItemBudget` only supports
 * same-table moves (WI→WI).  Cross-table moves (supplying newHouseholdItemId)
 * are rejected with a ValidationError, because cross-table moves must go through
 * the IBL edit-and-move path (`editAndMoveBudgetLine`).
 */
describe('updateWorkItemBudget() — move scenarios', () => {
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

  function createWorkItem(title = 'Work Item'): string {
    const id = `wi-${Date.now()}-${Math.random().toString(36).substring(7)}`;
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

  function createWorkItemBudget(
    workItemId: string,
    options: { plannedAmount?: number; description?: string } = {},
  ): string {
    const id = `wib-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const t = ts();
    db.insert(schema.workItemBudgets)
      .values({
        id,
        workItemId,
        description: options.description ?? 'WI Budget',
        plannedAmount: options.plannedAmount ?? 500,
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
      })
      .run();
    return id;
  }

  function createHouseholdItem(name = 'HI'): string {
    const id = `hi-${Date.now()}-${Math.random().toString(36).substring(7)}`;
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

  function createVendor(name = 'Vendor'): string {
    const id = `vendor-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const t = ts();
    db.insert(schema.vendors)
      .values({
        id,
        name,
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

  function createInvoice(vendorId: string, amount = 1000): string {
    const id = `inv-${Date.now()}-${Math.random().toString(36).substring(7)}`;
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

  beforeEach(() => {
    const testDb = createTestDb();
    sqlite = testDb.sqlite;
    db = testDb.db;
    tsOffset = 0;
  });

  afterEach(() => {
    sqlite.close();
  });

  // ─── Same-table happy path ───────────────────────────────────────────────────

  it('same-table move WI→WI: WIB.workItemId updated to target WI; budget line returned from target', () => {
    const wi1 = createWorkItem('Painting');
    const wi2 = createWorkItem('Plumbing');
    const wibId = createWorkItemBudget(wi1, { description: 'Test line' });

    const result = updateWorkItemBudget(db, wi1, wibId, { newWorkItemId: wi2 });

    expect(result.id).toBe(wibId);
    expect(result.workItemId).toBe(wi2);
    expect(result.description).toBe('Test line');

    // Verify DB state
    const updatedWib = db
      .select()
      .from(schema.workItemBudgets)
      .where(eq(schema.workItemBudgets.id, wibId))
      .get()!;
    expect(updatedWib.workItemId).toBe(wi2);
  });

  it('same-table move with additional field updates: both parent and description updated', () => {
    const wi1 = createWorkItem('Painting');
    const wi2 = createWorkItem('Flooring');
    const wibId = createWorkItemBudget(wi1, { description: 'Old description', plannedAmount: 500 });

    const result = updateWorkItemBudget(db, wi1, wibId, {
      newWorkItemId: wi2,
      description: 'New description',
      plannedAmount: 750,
    });

    expect(result.workItemId).toBe(wi2);
    expect(result.description).toBe('New description');
    expect(result.plannedAmount).toBe(750);
  });

  it('same-table move: throws NotFoundError when source work item does not exist', () => {
    const wi1 = createWorkItem('Painting');
    const wi2 = createWorkItem('Plumbing');
    const wibId = createWorkItemBudget(wi1);

    expect(() => {
      updateWorkItemBudget(db, 'non-existent-wi', wibId, { newWorkItemId: wi2 });
    }).toThrow(NotFoundError);
  });

  it('same-table move: throws NotFoundError when target work item does not exist', () => {
    const wi1 = createWorkItem('Painting');
    const wibId = createWorkItemBudget(wi1);

    expect(() => {
      updateWorkItemBudget(db, wi1, wibId, { newWorkItemId: 'non-existent-target' });
    }).toThrow(NotFoundError);
  });

  it('same-table move: throws NotFoundError when budget line does not exist', () => {
    const wi1 = createWorkItem('Painting');
    const wi2 = createWorkItem('Plumbing');

    expect(() => {
      updateWorkItemBudget(db, wi1, 'non-existent-wib', { newWorkItemId: wi2 });
    }).toThrow(NotFoundError);
  });

  it('same-table move: throws NotFoundError when budget line belongs to a different work item', () => {
    const wi1 = createWorkItem('Painting');
    const wi2 = createWorkItem('Plumbing');
    const wi3 = createWorkItem('Flooring');
    const wibId = createWorkItemBudget(wi3); // belongs to wi3

    expect(() => {
      updateWorkItemBudget(db, wi1, wibId, { newWorkItemId: wi2 }); // wi1 is wrong source
    }).toThrow(NotFoundError);
  });

  // Issue #1555: the BUDGET_LINE_ALREADY_LINKED guard was overly restrictive and
  // has been removed from the same-table move path. The unique constraint is per-WIB-row,
  // not per-(invoice, work-item) pair. Moving a WIB to a target that already has a
  // different WIB linked to the same invoice is allowed.
  it('same-table move: succeeds even when target WI already has a linked IBL on the same invoice', () => {
    const wi1 = createWorkItem('Painting');
    const wi2 = createWorkItem('Plumbing');
    const wibId = createWorkItemBudget(wi1);
    // Link wi2 to an invoice via a different WIB — move must still succeed
    const wib2Id = createWorkItemBudget(wi2);
    const vendorId = createVendor();
    const invoiceId = createInvoice(vendorId);
    const iblId = `ibl-${Date.now()}`;
    const t = ts();
    db.insert(schema.invoiceBudgetLines)
      .values({
        id: iblId,
        invoiceId,
        workItemBudgetId: wib2Id,
        householdItemBudgetId: null,
        itemizedAmount: 200,
        createdAt: t,
        updatedAt: t,
      })
      .run();

    const result = updateWorkItemBudget(db, wi1, wibId, { newWorkItemId: wi2 });

    expect(result.id).toBe(wibId);
    expect(result.workItemId).toBe(wi2);

    // Verify DB: WIB now belongs to wi2
    const updatedWib = db
      .select()
      .from(schema.workItemBudgets)
      .where(eq(schema.workItemBudgets.id, wibId))
      .get()!;
    expect(updatedWib.workItemId).toBe(wi2);
  });

  // ─── Cross-table rejection ───────────────────────────────────────────────────

  it('cross-table rejection: throws ValidationError when newHouseholdItemId is provided', () => {
    const wi1 = createWorkItem('Painting');
    const hiId = createHouseholdItem('Sofa');
    const wibId = createWorkItemBudget(wi1);

    expect(() => {
      updateWorkItemBudget(db, wi1, wibId, { newHouseholdItemId: hiId });
    }).toThrow(ValidationError);
  });

  it('cross-table rejection: throws ValidationError with both newWorkItemId and newHouseholdItemId', () => {
    const wi1 = createWorkItem('Painting');
    const wi2 = createWorkItem('Plumbing');
    const hiId = createHouseholdItem('Sofa');
    const wibId = createWorkItemBudget(wi1);

    expect(() => {
      updateWorkItemBudget(db, wi1, wibId, { newWorkItemId: wi2, newHouseholdItemId: hiId });
    }).toThrow(ValidationError);
  });
});
