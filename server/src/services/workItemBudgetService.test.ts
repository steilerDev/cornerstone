/**
 * Unit tests for workItemBudgetService.
 *
 * Focused on the #1441 regression: invoiceLink.vendorId and invoiceLink.vendorName
 * must be populated (or null) depending on whether the linked invoice has a vendor.
 *
 * Also covers the ADR-029 change: quotation invoices must now contribute to actualCost.
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import {
  listWorkItemBudgets,
  createWorkItemBudget,
} from './workItemBudgetService.js';

describe('workItemBudgetService — invoiceLink vendor fields (#1441)', () => {
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

  function insertTestUser(userId = 'user-001') {
    const now = new Date(Date.now() + idCounter++).toISOString();
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

  function insertWorkItem(title = 'Test Work Item', userId = 'user-001') {
    const id = `wi-${++idCounter}`;
    const now = new Date(Date.now() + idCounter).toISOString();
    db.insert(schema.workItems)
      .values({
        id,
        title,
        status: 'not_started',
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  function insertBudgetSource(name = 'Test Source') {
    const id = `bs-${++idCounter}`;
    const now = new Date(Date.now() + idCounter).toISOString();
    db.insert(schema.budgetSources)
      .values({
        id,
        name,
        sourceType: 'savings',
        totalAmount: 50000,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  function insertVendor(name: string) {
    const id = `v-${++idCounter}`;
    const now = new Date(Date.now() + idCounter).toISOString();
    db.insert(schema.vendors)
      .values({ id, name, createdAt: now, updatedAt: now })
      .run();
    return id;
  }

  function insertInvoiceLinkedToWorkItemBudget(
    workItemBudgetId: string,
    vendorId: string | null,
    opts: { amount?: number; status?: 'pending' | 'paid' | 'claimed' | 'quotation' } = {},
  ) {
    const invoiceId = `inv-wi-${++idCounter}`;
    const iblId = `ibl-wi-${++idCounter}`;
    const amount = opts.amount ?? 100;
    const now = new Date(Date.now() + idCounter).toISOString();
    db.insert(schema.invoices)
      .values({
        id: invoiceId,
        vendorId,
        amount,
        date: '2025-06-01',
        status: opts.status ?? 'pending',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    db.insert(schema.invoiceBudgetLines)
      .values({
        id: iblId,
        invoiceId,
        workItemBudgetId,
        itemizedAmount: amount,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return { invoiceId, iblId };
  }

  beforeEach(() => {
    idCounter = 0;
    const testDb = createTestDb();
    sqlite = testDb.sqlite;
    db = testDb.db;
    insertTestUser();
  });

  afterEach(() => {
    sqlite.close();
  });

  // ─── invoiceLink vendor fields ─────────────────────────────────────────────

  it('invoiceLink.vendorId and invoiceLink.vendorName are populated when invoice has a vendor', () => {
    const wiId = insertWorkItem();
    const sourceId = insertBudgetSource();
    const budget = createWorkItemBudget(db, wiId, 'user-001', {
      plannedAmount: 1000,
      budgetSourceId: sourceId,
    });
    const vendorId = insertVendor('Concrete Corp');
    insertInvoiceLinkedToWorkItemBudget(budget.id, vendorId, { amount: 1000, status: 'paid' });

    const result = listWorkItemBudgets(db, wiId);

    expect(result).toHaveLength(1);
    expect(result[0]!.invoiceLink).not.toBeNull();
    expect(result[0]!.invoiceLink?.vendorId).toBe(vendorId);
    expect(result[0]!.invoiceLink?.vendorName).toBe('Concrete Corp');
  });

  it('invoiceLink.vendorId and invoiceLink.vendorName are null when invoice has no vendor', () => {
    const wiId = insertWorkItem();
    const sourceId = insertBudgetSource();
    const budget = createWorkItemBudget(db, wiId, 'user-001', {
      plannedAmount: 500,
      budgetSourceId: sourceId,
    });
    insertInvoiceLinkedToWorkItemBudget(budget.id, null, { amount: 500, status: 'pending' });

    const result = listWorkItemBudgets(db, wiId);

    expect(result).toHaveLength(1);
    expect(result[0]!.invoiceLink).not.toBeNull();
    expect(result[0]!.invoiceLink?.vendorId).toBeNull();
    expect(result[0]!.invoiceLink?.vendorName).toBeNull();
  });

  it('two budget lines: each invoiceLink gets correct vendor fields independently', () => {
    const wiId = insertWorkItem();
    const sourceId = insertBudgetSource();
    const vendorA = insertVendor('Vendor Alpha WI');
    const vendorB = insertVendor('Vendor Beta WI');

    const budgetA = createWorkItemBudget(db, wiId, 'user-001', {
      plannedAmount: 400,
      budgetSourceId: sourceId,
    });
    const budgetB = createWorkItemBudget(db, wiId, 'user-001', {
      plannedAmount: 600,
      budgetSourceId: sourceId,
    });

    insertInvoiceLinkedToWorkItemBudget(budgetA.id, vendorA, { amount: 400, status: 'paid' });
    insertInvoiceLinkedToWorkItemBudget(budgetB.id, vendorB, { amount: 600, status: 'pending' });

    const result = listWorkItemBudgets(db, wiId);

    expect(result).toHaveLength(2);
    const lineA = result.find((l) => l.id === budgetA.id)!;
    const lineB = result.find((l) => l.id === budgetB.id)!;

    expect(lineA.invoiceLink?.vendorId).toBe(vendorA);
    expect(lineA.invoiceLink?.vendorName).toBe('Vendor Alpha WI');

    expect(lineB.invoiceLink?.vendorId).toBe(vendorB);
    expect(lineB.invoiceLink?.vendorName).toBe('Vendor Beta WI');
  });

  // ─── ADR-029: quotation invoice actualCost ─────────────────────────────────

  it('quotation invoice contributes to actualCost but not actualCostPaid (ADR-029)', () => {
    const wiId = insertWorkItem();
    const sourceId = insertBudgetSource();
    const vendorId = insertVendor('Quotation Vendor WI');

    const budget = createWorkItemBudget(db, wiId, 'user-001', {
      plannedAmount: 2000,
      budgetSourceId: sourceId,
    });
    insertInvoiceLinkedToWorkItemBudget(budget.id, vendorId, {
      amount: 2000,
      status: 'quotation',
    });

    const result = listWorkItemBudgets(db, wiId);

    expect(result).toHaveLength(1);
    // ADR-029: quotation contributes to actualCost
    expect(result[0]!.actualCost).toBe(2000);
    // quotation is not paid
    expect(result[0]!.actualCostPaid).toBe(0);
    expect(result[0]!.invoiceCount).toBe(1);
    expect(result[0]!.invoiceLink?.vendorId).toBe(vendorId);
    expect(result[0]!.invoiceLink?.vendorName).toBe('Quotation Vendor WI');
  });

  it('mixed quotation + paid: actualCost sums both, actualCostPaid only paid (ADR-029)', () => {
    const wiId = insertWorkItem();
    const sourceId = insertBudgetSource();
    const vendorId = insertVendor('Mixed Vendor WI');

    const budgetQ = createWorkItemBudget(db, wiId, 'user-001', {
      plannedAmount: 1500,
      budgetSourceId: sourceId,
    });
    const budgetP = createWorkItemBudget(db, wiId, 'user-001', {
      plannedAmount: 2500,
      budgetSourceId: sourceId,
    });

    insertInvoiceLinkedToWorkItemBudget(budgetQ.id, vendorId, {
      amount: 1500,
      status: 'quotation',
    });
    insertInvoiceLinkedToWorkItemBudget(budgetP.id, vendorId, {
      amount: 2500,
      status: 'paid',
    });

    const result = listWorkItemBudgets(db, wiId);

    expect(result).toHaveLength(2);
    const lineQ = result.find((l) => l.id === budgetQ.id)!;
    const lineP = result.find((l) => l.id === budgetP.id)!;

    expect(lineQ.actualCost).toBe(1500); // quotation counted
    expect(lineQ.actualCostPaid).toBe(0); // quotation not paid

    expect(lineP.actualCost).toBe(2500);
    expect(lineP.actualCostPaid).toBe(2500); // paid
  });

  it('invoiceLink is null when no invoice is linked', () => {
    const wiId = insertWorkItem();
    const sourceId = insertBudgetSource();

    const result_create = createWorkItemBudget(db, wiId, 'user-001', {
      plannedAmount: 500,
      budgetSourceId: sourceId,
    });
    const result = listWorkItemBudgets(db, wiId);

    expect(result).toHaveLength(1);
    expect(result[0]!.invoiceLink).toBeNull();
    expect(result_create.invoiceLink).toBeNull();
  });
});
