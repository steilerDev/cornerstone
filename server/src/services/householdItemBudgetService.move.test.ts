import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import { updateHouseholdItemBudget } from './householdItemBudgetService.js';
import {
  NotFoundError,
  ValidationError,
  BudgetLineAlreadyLinkedError,
} from '../errors/AppError.js';

/**
 * Tests for updateHouseholdItemBudget() move functionality (same-table HI→HI moves
 * and cross-table rejection).
 *
 * Per the implementation decision, `updateAndMoveHouseholdItemBudget` only supports
 * same-table moves (HI→HI).  Cross-table moves (supplying newWorkItemId)
 * are rejected with a ValidationError, because cross-table moves must go through
 * the IBL edit-and-move path (`editAndMoveBudgetLine`).
 */
describe('updateHouseholdItemBudget() — move scenarios', () => {
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

  function createHouseholdItem(name = 'Household Item'): string {
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

  function createHouseholdItemBudget(
    householdItemId: string,
    options: { plannedAmount?: number; description?: string } = {},
  ): string {
    const id = `hib-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const t = ts();
    db.insert(schema.householdItemBudgets)
      .values({
        id,
        householdItemId,
        description: options.description ?? 'HI Budget',
        plannedAmount: options.plannedAmount ?? 500,
        confidence: 'own_estimate',
        budgetCategoryId: 'bc-household-items',
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

  it('same-table move HI→HI: HIB.householdItemId updated to target HI; budget line returned from target', () => {
    const hi1 = createHouseholdItem('Sofa');
    const hi2 = createHouseholdItem('Table');
    const hibId = createHouseholdItemBudget(hi1, { description: 'Test HI line' });

    const result = updateHouseholdItemBudget(db, hi1, hibId, { newHouseholdItemId: hi2 });

    expect(result.id).toBe(hibId);
    expect(result.householdItemId).toBe(hi2);
    expect(result.description).toBe('Test HI line');

    // Verify DB state
    const updatedHib = db
      .select()
      .from(schema.householdItemBudgets)
      .where(eq(schema.householdItemBudgets.id, hibId))
      .get()!;
    expect(updatedHib.householdItemId).toBe(hi2);
  });

  it('same-table move with additional field updates: both parent and description updated', () => {
    const hi1 = createHouseholdItem('Sofa');
    const hi2 = createHouseholdItem('Armchair');
    const hibId = createHouseholdItemBudget(hi1, { description: 'Old desc', plannedAmount: 500 });

    const result = updateHouseholdItemBudget(db, hi1, hibId, {
      newHouseholdItemId: hi2,
      description: 'New desc',
      plannedAmount: 800,
    });

    expect(result.householdItemId).toBe(hi2);
    expect(result.description).toBe('New desc');
    expect(result.plannedAmount).toBe(800);
  });

  it('same-table move: throws NotFoundError when source household item does not exist', () => {
    const hi1 = createHouseholdItem('Sofa');
    const hi2 = createHouseholdItem('Table');
    const hibId = createHouseholdItemBudget(hi1);

    expect(() => {
      updateHouseholdItemBudget(db, 'non-existent-hi', hibId, { newHouseholdItemId: hi2 });
    }).toThrow(NotFoundError);
  });

  it('same-table move: throws NotFoundError when target household item does not exist', () => {
    const hi1 = createHouseholdItem('Sofa');
    const hibId = createHouseholdItemBudget(hi1);

    expect(() => {
      updateHouseholdItemBudget(db, hi1, hibId, { newHouseholdItemId: 'non-existent-target' });
    }).toThrow(NotFoundError);
  });

  it('same-table move: throws NotFoundError when budget line does not exist', () => {
    const hi1 = createHouseholdItem('Sofa');
    const hi2 = createHouseholdItem('Table');

    expect(() => {
      updateHouseholdItemBudget(db, hi1, 'non-existent-hib', { newHouseholdItemId: hi2 });
    }).toThrow(NotFoundError);
  });

  it('same-table move: throws NotFoundError when budget line belongs to a different household item', () => {
    const hi1 = createHouseholdItem('Sofa');
    const hi2 = createHouseholdItem('Table');
    const hi3 = createHouseholdItem('Wardrobe');
    const hibId = createHouseholdItemBudget(hi3); // belongs to hi3

    expect(() => {
      updateHouseholdItemBudget(db, hi1, hibId, { newHouseholdItemId: hi2 }); // hi1 is wrong source
    }).toThrow(NotFoundError);
  });

  it('same-table move: throws BudgetLineAlreadyLinkedError when target HI already has linked IBL', () => {
    const hi1 = createHouseholdItem('Sofa');
    const hi2 = createHouseholdItem('Table');
    const hibId = createHouseholdItemBudget(hi1);
    // Link hi2 to an invoice
    const hib2Id = createHouseholdItemBudget(hi2);
    const vendorId = createVendor();
    const invoiceId = createInvoice(vendorId);
    const iblId = `ibl-${Date.now()}`;
    const t = ts();
    db.insert(schema.invoiceBudgetLines)
      .values({
        id: iblId,
        invoiceId,
        workItemBudgetId: null,
        householdItemBudgetId: hib2Id,
        itemizedAmount: 200,
        createdAt: t,
        updatedAt: t,
      })
      .run();

    expect(() => {
      updateHouseholdItemBudget(db, hi1, hibId, { newHouseholdItemId: hi2 });
    }).toThrow(BudgetLineAlreadyLinkedError);
  });

  // ─── Cross-table rejection ───────────────────────────────────────────────────

  it('cross-table rejection: throws ValidationError when newWorkItemId is provided', () => {
    const hi1 = createHouseholdItem('Sofa');
    const wiId = createWorkItem('Painting');
    const hibId = createHouseholdItemBudget(hi1);

    expect(() => {
      updateHouseholdItemBudget(db, hi1, hibId, { newWorkItemId: wiId });
    }).toThrow(ValidationError);
  });

  it('cross-table rejection: throws ValidationError with both newHouseholdItemId and newWorkItemId', () => {
    const hi1 = createHouseholdItem('Sofa');
    const hi2 = createHouseholdItem('Table');
    const wiId = createWorkItem('Painting');
    const hibId = createHouseholdItemBudget(hi1);

    expect(() => {
      updateHouseholdItemBudget(db, hi1, hibId, { newHouseholdItemId: hi2, newWorkItemId: wiId });
    }).toThrow(ValidationError);
  });
});
