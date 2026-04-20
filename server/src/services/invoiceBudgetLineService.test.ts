import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
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

describe('Invoice Budget Line Service', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;

  let timestampOffset = 0;

  function createTestDb() {
    const sqliteDb = new Database(':memory:');
    sqliteDb.pragma('journal_mode = WAL');
    sqliteDb.pragma('foreign_keys = ON');
    runMigrations(sqliteDb);
    return { sqlite: sqliteDb, db: drizzle(sqliteDb, { schema }) };
  }

  function createTestVendor(name: string): string {
    const id = `vendor-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const ts = new Date(Date.now() + timestampOffset++).toISOString();
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
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    return id;
  }

  function createTestInvoice(
    vendorId: string,
    options: { amount?: number; status?: 'pending' | 'paid' | 'claimed' | 'quotation' } = {},
  ): string {
    const id = `invoice-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const ts = new Date(Date.now() + timestampOffset++).toISOString();
    db.insert(schema.invoices)
      .values({
        id,
        vendorId,
        invoiceNumber: null,
        amount: options.amount ?? 1000,
        date: '2026-01-15',
        dueDate: null,
        status: options.status ?? 'pending',
        notes: null,
        createdBy: null,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    return id;
  }

  function createTestWorkItem(title: string): string {
    const id = `wi-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const ts = new Date(Date.now() + timestampOffset++).toISOString();
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
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    return id;
  }

  function createTestWorkItemBudget(
    workItemId: string,
    options: { plannedAmount?: number } = {},
  ): string {
    const id = `wib-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const ts = new Date(Date.now() + timestampOffset++).toISOString();
    db.insert(schema.workItemBudgets)
      .values({
        id,
        workItemId,
        description: 'Test budget line',
        plannedAmount: options.plannedAmount ?? 500,
        confidence: 'own_estimate',
        budgetCategoryId: null,
        budgetSourceId: null,
        vendorId: null,
        quantity: null,
        unit: null,
        unitPrice: null,
        includesVat: null,
        createdBy: null,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    return id;
  }

  function createTestHouseholdItem(): string {
    // Use the seeded category id
    const catId = 'hic-furniture';
    const id = `hi-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const ts = new Date(Date.now() + timestampOffset++).toISOString();
    db.insert(schema.householdItems)
      .values({
        id,
        name: 'Test Household Item',
        description: null,
        categoryId: catId,
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
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    return id;
  }

  function createTestHouseholdItemBudget(
    householdItemId: string,
    options: { plannedAmount?: number } = {},
  ): string {
    const id = `hib-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const ts = new Date(Date.now() + timestampOffset++).toISOString();
    db.insert(schema.householdItemBudgets)
      .values({
        id,
        householdItemId,
        description: 'HI budget line',
        plannedAmount: options.plannedAmount ?? 300,
        confidence: 'own_estimate',
        budgetCategoryId: null,
        budgetSourceId: null,
        vendorId: null,
        quantity: null,
        unit: null,
        unitPrice: null,
        includesVat: null,
        createdBy: null,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    return id;
  }

  beforeEach(() => {
    const testDb = createTestDb();
    sqlite = testDb.sqlite;
    db = testDb.db;
    timestampOffset = 0;
  });

  afterEach(() => {
    sqlite.close();
  });

  // ─── listInvoiceBudgetLines() ────────────────────────────────────────────────

  describe('listInvoiceBudgetLines()', () => {
    it('throws NotFoundError when invoice does not exist', () => {
      expect(() => {
        invoiceBudgetLineService.listInvoiceBudgetLines(db, 'non-existent-invoice');
      }).toThrow(NotFoundError);
    });

    it('returns empty budgetLines and full remainingAmount when invoice has no budget lines', () => {
      const vendorId = createTestVendor('Vendor A');
      const invoiceId = createTestInvoice(vendorId, { amount: 1000 });

      const result = invoiceBudgetLineService.listInvoiceBudgetLines(db, invoiceId);

      expect(result.budgetLines).toHaveLength(0);
      expect(result.remainingAmount).toBe(1000);
    });

    it('returns budgetLines and correct remainingAmount with a linked work item budget', () => {
      const vendorId = createTestVendor('Vendor B');
      const invoiceId = createTestInvoice(vendorId, { amount: 1000 });
      const workItemId = createTestWorkItem('Painting');
      const wibId = createTestWorkItemBudget(workItemId, { plannedAmount: 500 });

      invoiceBudgetLineService.createInvoiceBudgetLine(db, invoiceId, {
        workItemBudgetId: wibId,
        itemizedAmount: 400,
      });

      const result = invoiceBudgetLineService.listInvoiceBudgetLines(db, invoiceId);

      expect(result.budgetLines).toHaveLength(1);
      expect(result.budgetLines[0]!.itemizedAmount).toBe(400);
      expect(result.budgetLines[0]!.parentItemType).toBe('work_item');
      expect(result.budgetLines[0]!.parentItemTitle).toBe('Painting');
      expect(result.remainingAmount).toBe(600);
    });

    it('returns budgetLines and correct remainingAmount with a linked household item budget', () => {
      const vendorId = createTestVendor('Vendor C');
      const invoiceId = createTestInvoice(vendorId, { amount: 500 });
      const hiId = createTestHouseholdItem();
      const hibId = createTestHouseholdItemBudget(hiId, { plannedAmount: 300 });

      invoiceBudgetLineService.createInvoiceBudgetLine(db, invoiceId, {
        householdItemBudgetId: hibId,
        itemizedAmount: 200,
      });

      const result = invoiceBudgetLineService.listInvoiceBudgetLines(db, invoiceId);

      expect(result.budgetLines).toHaveLength(1);
      expect(result.budgetLines[0]!.itemizedAmount).toBe(200);
      expect(result.budgetLines[0]!.parentItemType).toBe('household_item');
      expect(result.budgetLines[0]!.parentItemTitle).toBe('Test Household Item');
      expect(result.remainingAmount).toBe(300);
    });

    it('returns multiple budget lines ordered by createdAt ascending', () => {
      const vendorId = createTestVendor('Vendor D');
      const invoiceId = createTestInvoice(vendorId, { amount: 2000 });
      const wi1 = createTestWorkItem('Task One');
      const wi2 = createTestWorkItem('Task Two');
      const wib1 = createTestWorkItemBudget(wi1);
      const wib2 = createTestWorkItemBudget(wi2);

      invoiceBudgetLineService.createInvoiceBudgetLine(db, invoiceId, {
        workItemBudgetId: wib1,
        itemizedAmount: 300,
      });
      invoiceBudgetLineService.createInvoiceBudgetLine(db, invoiceId, {
        workItemBudgetId: wib2,
        itemizedAmount: 700,
      });

      const result = invoiceBudgetLineService.listInvoiceBudgetLines(db, invoiceId);

      expect(result.budgetLines).toHaveLength(2);
      expect(result.budgetLines[0]!.parentItemTitle).toBe('Task One');
      expect(result.budgetLines[1]!.parentItemTitle).toBe('Task Two');
      expect(result.remainingAmount).toBe(1000);
    });

    it('returns all required fields in the detail response', () => {
      const vendorId = createTestVendor('Vendor E');
      const invoiceId = createTestInvoice(vendorId, { amount: 1000 });
      const wiId = createTestWorkItem('Roofing');
      const wibId = createTestWorkItemBudget(wiId, { plannedAmount: 800 });

      invoiceBudgetLineService.createInvoiceBudgetLine(db, invoiceId, {
        workItemBudgetId: wibId,
        itemizedAmount: 250,
      });

      const result = invoiceBudgetLineService.listInvoiceBudgetLines(db, invoiceId);
      const line = result.budgetLines[0]!;

      expect(line.id).toBeDefined();
      expect(line.invoiceId).toBe(invoiceId);
      expect(line.workItemBudgetId).toBe(wibId);
      expect(line.householdItemBudgetId).toBeNull();
      expect(line.itemizedAmount).toBe(250);
      expect(line.plannedAmount).toBe(800);
      expect(line.confidence).toBe('own_estimate');
      expect(line.budgetLineDescription).toBe('Test budget line');
      expect(line.parentItemId).toBe(wiId);
      expect(line.parentItemTitle).toBe('Roofing');
      expect(line.parentItemType).toBe('work_item');
      expect(line.createdAt).toBeDefined();
      expect(line.updatedAt).toBeDefined();
    });
  });

  // ─── createInvoiceBudgetLine() ───────────────────────────────────────────────

  describe('createInvoiceBudgetLine()', () => {
    it('throws NotFoundError when invoice does not exist', () => {
      const wiId = createTestWorkItem('Task');
      const wibId = createTestWorkItemBudget(wiId);

      expect(() => {
        invoiceBudgetLineService.createInvoiceBudgetLine(db, 'non-existent', {
          workItemBudgetId: wibId,
          itemizedAmount: 100,
        });
      }).toThrow(NotFoundError);
    });

    it('throws ValidationError when neither budget ID is provided', () => {
      const vendorId = createTestVendor('Vendor X');
      const invoiceId = createTestInvoice(vendorId);

      expect(() => {
        invoiceBudgetLineService.createInvoiceBudgetLine(db, invoiceId, {
          itemizedAmount: 100,
        });
      }).toThrow(ValidationError);
    });

    it('throws ValidationError when both budget IDs are provided', () => {
      const vendorId = createTestVendor('Vendor Y');
      const invoiceId = createTestInvoice(vendorId, { amount: 2000 });
      const wiId = createTestWorkItem('Task');
      const wibId = createTestWorkItemBudget(wiId);
      const hiId = createTestHouseholdItem();
      const hibId = createTestHouseholdItemBudget(hiId);

      expect(() => {
        invoiceBudgetLineService.createInvoiceBudgetLine(db, invoiceId, {
          workItemBudgetId: wibId,
          householdItemBudgetId: hibId,
          itemizedAmount: 100,
        });
      }).toThrow(ValidationError);
    });

    it('throws ValidationError when itemizedAmount is 0 or negative', () => {
      const vendorId = createTestVendor('Vendor Z');
      const invoiceId = createTestInvoice(vendorId);
      const wiId = createTestWorkItem('Task');
      const wibId = createTestWorkItemBudget(wiId);

      expect(() => {
        invoiceBudgetLineService.createInvoiceBudgetLine(db, invoiceId, {
          workItemBudgetId: wibId,
          itemizedAmount: 0,
        });
      }).toThrow(ValidationError);

      expect(() => {
        invoiceBudgetLineService.createInvoiceBudgetLine(db, invoiceId, {
          workItemBudgetId: wibId,
          itemizedAmount: -50,
        });
      }).toThrow(ValidationError);
    });

    it('throws NotFoundError when workItemBudgetId does not exist', () => {
      const vendorId = createTestVendor('Vendor V');
      const invoiceId = createTestInvoice(vendorId);

      expect(() => {
        invoiceBudgetLineService.createInvoiceBudgetLine(db, invoiceId, {
          workItemBudgetId: 'non-existent-wib',
          itemizedAmount: 100,
        });
      }).toThrow(NotFoundError);
    });

    it('throws NotFoundError when householdItemBudgetId does not exist', () => {
      const vendorId = createTestVendor('Vendor W');
      const invoiceId = createTestInvoice(vendorId);

      expect(() => {
        invoiceBudgetLineService.createInvoiceBudgetLine(db, invoiceId, {
          householdItemBudgetId: 'non-existent-hib',
          itemizedAmount: 100,
        });
      }).toThrow(NotFoundError);
    });

    it('throws ValidationError when work item budget is already linked to the same invoice', () => {
      const vendorId = createTestVendor('Vendor Same');
      const invoiceId = createTestInvoice(vendorId, { amount: 2000 });
      const wiId = createTestWorkItem('Task Same');
      const wibId = createTestWorkItemBudget(wiId);

      invoiceBudgetLineService.createInvoiceBudgetLine(db, invoiceId, {
        workItemBudgetId: wibId,
        itemizedAmount: 100,
      });

      expect(() => {
        invoiceBudgetLineService.createInvoiceBudgetLine(db, invoiceId, {
          workItemBudgetId: wibId,
          itemizedAmount: 200,
        });
      }).toThrow(ValidationError);
    });

    it('throws BudgetLineAlreadyLinkedError when work item budget is linked to a different invoice', () => {
      const vendorId = createTestVendor('Vendor Diff');
      const invoice1Id = createTestInvoice(vendorId, { amount: 1000 });
      const invoice2Id = createTestInvoice(vendorId, { amount: 1000 });
      const wiId = createTestWorkItem('Task Diff');
      const wibId = createTestWorkItemBudget(wiId);

      invoiceBudgetLineService.createInvoiceBudgetLine(db, invoice1Id, {
        workItemBudgetId: wibId,
        itemizedAmount: 100,
      });

      expect(() => {
        invoiceBudgetLineService.createInvoiceBudgetLine(db, invoice2Id, {
          workItemBudgetId: wibId,
          itemizedAmount: 200,
        });
      }).toThrow(BudgetLineAlreadyLinkedError);
    });

    it('throws BudgetLineAlreadyLinkedError when household item budget is linked to a different invoice', () => {
      const vendorId = createTestVendor('Vendor HI Diff');
      const invoice1Id = createTestInvoice(vendorId, { amount: 1000 });
      const invoice2Id = createTestInvoice(vendorId, { amount: 1000 });
      const hiId = createTestHouseholdItem();
      const hibId = createTestHouseholdItemBudget(hiId);

      invoiceBudgetLineService.createInvoiceBudgetLine(db, invoice1Id, {
        householdItemBudgetId: hibId,
        itemizedAmount: 100,
      });

      expect(() => {
        invoiceBudgetLineService.createInvoiceBudgetLine(db, invoice2Id, {
          householdItemBudgetId: hibId,
          itemizedAmount: 200,
        });
      }).toThrow(BudgetLineAlreadyLinkedError);
    });

    it('throws ItemizedSumExceedsInvoiceError when new line would exceed invoice total', () => {
      const vendorId = createTestVendor('Vendor Exceed');
      const invoiceId = createTestInvoice(vendorId, { amount: 500 });
      const wi1 = createTestWorkItem('Task A');
      const wi2 = createTestWorkItem('Task B');
      const wib1 = createTestWorkItemBudget(wi1);
      const wib2 = createTestWorkItemBudget(wi2);

      invoiceBudgetLineService.createInvoiceBudgetLine(db, invoiceId, {
        workItemBudgetId: wib1,
        itemizedAmount: 400,
      });

      expect(() => {
        invoiceBudgetLineService.createInvoiceBudgetLine(db, invoiceId, {
          workItemBudgetId: wib2,
          itemizedAmount: 200,
        });
      }).toThrow(ItemizedSumExceedsInvoiceError);
    });

    it('creates a work item budget line successfully and returns detail + remainingAmount', () => {
      const vendorId = createTestVendor('Vendor Success');
      const invoiceId = createTestInvoice(vendorId, { amount: 1000 });
      const wiId = createTestWorkItem('Flooring');
      const wibId = createTestWorkItemBudget(wiId, { plannedAmount: 700 });

      const result = invoiceBudgetLineService.createInvoiceBudgetLine(db, invoiceId, {
        workItemBudgetId: wibId,
        itemizedAmount: 300,
      });

      expect(result.budgetLine.id).toBeDefined();
      expect(result.budgetLine.invoiceId).toBe(invoiceId);
      expect(result.budgetLine.workItemBudgetId).toBe(wibId);
      expect(result.budgetLine.householdItemBudgetId).toBeNull();
      expect(result.budgetLine.itemizedAmount).toBe(300);
      expect(result.budgetLine.plannedAmount).toBe(700);
      expect(result.budgetLine.parentItemType).toBe('work_item');
      expect(result.budgetLine.parentItemTitle).toBe('Flooring');
      expect(result.remainingAmount).toBe(700);
    });

    it('creates a household item budget line successfully', () => {
      const vendorId = createTestVendor('Vendor HI Success');
      const invoiceId = createTestInvoice(vendorId, { amount: 500 });
      const hiId = createTestHouseholdItem();
      const hibId = createTestHouseholdItemBudget(hiId, { plannedAmount: 400 });

      const result = invoiceBudgetLineService.createInvoiceBudgetLine(db, invoiceId, {
        householdItemBudgetId: hibId,
        itemizedAmount: 150,
      });

      expect(result.budgetLine.id).toBeDefined();
      expect(result.budgetLine.invoiceId).toBe(invoiceId);
      expect(result.budgetLine.householdItemBudgetId).toBe(hibId);
      expect(result.budgetLine.workItemBudgetId).toBeNull();
      expect(result.budgetLine.itemizedAmount).toBe(150);
      expect(result.budgetLine.parentItemType).toBe('household_item');
      expect(result.remainingAmount).toBe(350);
    });

    it('allows creating line with itemizedAmount exactly equal to invoice total', () => {
      const vendorId = createTestVendor('Vendor Exact');
      const invoiceId = createTestInvoice(vendorId, { amount: 1000 });
      const wiId = createTestWorkItem('Exact Task');
      const wibId = createTestWorkItemBudget(wiId);

      const result = invoiceBudgetLineService.createInvoiceBudgetLine(db, invoiceId, {
        workItemBudgetId: wibId,
        itemizedAmount: 1000,
      });

      expect(result.budgetLine.itemizedAmount).toBe(1000);
      expect(result.remainingAmount).toBe(0);
    });

    it('treats null workItemBudgetId as not provided (requires householdItemBudgetId)', () => {
      const vendorId = createTestVendor('Vendor Null');
      const invoiceId = createTestInvoice(vendorId, { amount: 500 });
      const hiId = createTestHouseholdItem();
      const hibId = createTestHouseholdItemBudget(hiId);

      const result = invoiceBudgetLineService.createInvoiceBudgetLine(db, invoiceId, {
        workItemBudgetId: null,
        householdItemBudgetId: hibId,
        itemizedAmount: 100,
      });

      expect(result.budgetLine.householdItemBudgetId).toBe(hibId);
      expect(result.budgetLine.workItemBudgetId).toBeNull();
    });
  });

  // ─── updateInvoiceBudgetLine() ───────────────────────────────────────────────

  describe('updateInvoiceBudgetLine()', () => {
    it('throws NotFoundError when invoice does not exist', () => {
      expect(() => {
        invoiceBudgetLineService.updateInvoiceBudgetLine(
          db,
          'non-existent-invoice',
          'some-line-id',
          { itemizedAmount: 100 },
        );
      }).toThrow(NotFoundError);
    });

    it('throws NotFoundError when budget line does not exist', () => {
      const vendorId = createTestVendor('Vendor A');
      const invoiceId = createTestInvoice(vendorId);

      expect(() => {
        invoiceBudgetLineService.updateInvoiceBudgetLine(db, invoiceId, 'non-existent-line', {
          itemizedAmount: 100,
        });
      }).toThrow(NotFoundError);
    });

    it('throws NotFoundError when budget line belongs to a different invoice', () => {
      const vendorId = createTestVendor('Vendor B');
      const invoice1Id = createTestInvoice(vendorId, { amount: 1000 });
      const invoice2Id = createTestInvoice(vendorId, { amount: 1000 });
      const wiId = createTestWorkItem('Task');
      const wibId = createTestWorkItemBudget(wiId);

      const createResult = invoiceBudgetLineService.createInvoiceBudgetLine(db, invoice1Id, {
        workItemBudgetId: wibId,
        itemizedAmount: 100,
      });
      const lineId = createResult.budgetLine.id;

      expect(() => {
        invoiceBudgetLineService.updateInvoiceBudgetLine(db, invoice2Id, lineId, {
          itemizedAmount: 200,
        });
      }).toThrow(NotFoundError);
    });

    it('throws ValidationError when attempting to change workItemBudgetId', () => {
      const vendorId = createTestVendor('Vendor C');
      const invoiceId = createTestInvoice(vendorId, { amount: 1000 });
      const wiId = createTestWorkItem('Task');
      const wibId = createTestWorkItemBudget(wiId);

      const createResult = invoiceBudgetLineService.createInvoiceBudgetLine(db, invoiceId, {
        workItemBudgetId: wibId,
        itemizedAmount: 100,
      });

      expect(() => {
        invoiceBudgetLineService.updateInvoiceBudgetLine(
          db,
          invoiceId,
          createResult.budgetLine.id,
          {
            workItemBudgetId: 'other-wib',
          },
        );
      }).toThrow(ValidationError);
    });

    it('throws ValidationError when attempting to change householdItemBudgetId', () => {
      const vendorId = createTestVendor('Vendor D');
      const invoiceId = createTestInvoice(vendorId, { amount: 1000 });
      const wiId = createTestWorkItem('Task D');
      const wibId = createTestWorkItemBudget(wiId);

      const createResult = invoiceBudgetLineService.createInvoiceBudgetLine(db, invoiceId, {
        workItemBudgetId: wibId,
        itemizedAmount: 100,
      });

      expect(() => {
        invoiceBudgetLineService.updateInvoiceBudgetLine(
          db,
          invoiceId,
          createResult.budgetLine.id,
          {
            householdItemBudgetId: 'other-hib',
          },
        );
      }).toThrow(ValidationError);
    });

    it('throws ValidationError when itemizedAmount is 0 or negative on update', () => {
      const vendorId = createTestVendor('Vendor E');
      const invoiceId = createTestInvoice(vendorId, { amount: 1000 });
      const wiId = createTestWorkItem('Task E');
      const wibId = createTestWorkItemBudget(wiId);

      const createResult = invoiceBudgetLineService.createInvoiceBudgetLine(db, invoiceId, {
        workItemBudgetId: wibId,
        itemizedAmount: 100,
      });

      expect(() => {
        invoiceBudgetLineService.updateInvoiceBudgetLine(
          db,
          invoiceId,
          createResult.budgetLine.id,
          {
            itemizedAmount: 0,
          },
        );
      }).toThrow(ValidationError);
    });

    it('throws ItemizedSumExceedsInvoiceError when updated amount would exceed invoice total', () => {
      const vendorId = createTestVendor('Vendor Exceed');
      const invoiceId = createTestInvoice(vendorId, { amount: 500 });
      const wi1 = createTestWorkItem('Task 1');
      const wi2 = createTestWorkItem('Task 2');
      const wib1 = createTestWorkItemBudget(wi1);
      const wib2 = createTestWorkItemBudget(wi2);

      invoiceBudgetLineService.createInvoiceBudgetLine(db, invoiceId, {
        workItemBudgetId: wib1,
        itemizedAmount: 300,
      });
      const result2 = invoiceBudgetLineService.createInvoiceBudgetLine(db, invoiceId, {
        workItemBudgetId: wib2,
        itemizedAmount: 100,
      });

      expect(() => {
        invoiceBudgetLineService.updateInvoiceBudgetLine(db, invoiceId, result2.budgetLine.id, {
          itemizedAmount: 250,
        });
      }).toThrow(ItemizedSumExceedsInvoiceError);
    });

    it('updates itemizedAmount successfully and returns updated detail + new remainingAmount', () => {
      const vendorId = createTestVendor('Vendor Update');
      const invoiceId = createTestInvoice(vendorId, { amount: 1000 });
      const wiId = createTestWorkItem('Task Update');
      const wibId = createTestWorkItemBudget(wiId);

      const createResult = invoiceBudgetLineService.createInvoiceBudgetLine(db, invoiceId, {
        workItemBudgetId: wibId,
        itemizedAmount: 200,
      });

      const updateResult = invoiceBudgetLineService.updateInvoiceBudgetLine(
        db,
        invoiceId,
        createResult.budgetLine.id,
        { itemizedAmount: 600 },
      );

      expect(updateResult.budgetLine.itemizedAmount).toBe(600);
      expect(updateResult.remainingAmount).toBe(400);
    });

    it('recalculates remainingAmount across all lines after update', () => {
      const vendorId = createTestVendor('Vendor Multi');
      const invoiceId = createTestInvoice(vendorId, { amount: 1000 });
      const wi1 = createTestWorkItem('Task 1');
      const wi2 = createTestWorkItem('Task 2');
      const wib1 = createTestWorkItemBudget(wi1);
      const wib2 = createTestWorkItemBudget(wi2);

      invoiceBudgetLineService.createInvoiceBudgetLine(db, invoiceId, {
        workItemBudgetId: wib1,
        itemizedAmount: 200,
      });
      const result2 = invoiceBudgetLineService.createInvoiceBudgetLine(db, invoiceId, {
        workItemBudgetId: wib2,
        itemizedAmount: 300,
      });

      // Update line 2 from 300 to 400 → total becomes 600
      const updateResult = invoiceBudgetLineService.updateInvoiceBudgetLine(
        db,
        invoiceId,
        result2.budgetLine.id,
        { itemizedAmount: 400 },
      );

      expect(updateResult.remainingAmount).toBe(400);
    });
  });

  // ─── deleteInvoiceBudgetLine() ───────────────────────────────────────────────

  describe('deleteInvoiceBudgetLine()', () => {
    it('throws NotFoundError when invoice does not exist', () => {
      expect(() => {
        invoiceBudgetLineService.deleteInvoiceBudgetLine(db, 'non-existent', 'some-line');
      }).toThrow(NotFoundError);
    });

    it('throws NotFoundError when budget line does not exist', () => {
      const vendorId = createTestVendor('Vendor Del A');
      const invoiceId = createTestInvoice(vendorId);

      expect(() => {
        invoiceBudgetLineService.deleteInvoiceBudgetLine(db, invoiceId, 'non-existent-line');
      }).toThrow(NotFoundError);
    });

    it('throws NotFoundError when budget line belongs to a different invoice', () => {
      const vendorId = createTestVendor('Vendor Del B');
      const invoice1Id = createTestInvoice(vendorId, { amount: 1000 });
      const invoice2Id = createTestInvoice(vendorId, { amount: 1000 });
      const wiId = createTestWorkItem('Task Del');
      const wibId = createTestWorkItemBudget(wiId);

      const createResult = invoiceBudgetLineService.createInvoiceBudgetLine(db, invoice1Id, {
        workItemBudgetId: wibId,
        itemizedAmount: 100,
      });

      expect(() => {
        invoiceBudgetLineService.deleteInvoiceBudgetLine(
          db,
          invoice2Id,
          createResult.budgetLine.id,
        );
      }).toThrow(NotFoundError);
    });

    it('deletes the budget line successfully', () => {
      const vendorId = createTestVendor('Vendor Del C');
      const invoiceId = createTestInvoice(vendorId, { amount: 1000 });
      const wiId = createTestWorkItem('Task Del C');
      const wibId = createTestWorkItemBudget(wiId);

      const createResult = invoiceBudgetLineService.createInvoiceBudgetLine(db, invoiceId, {
        workItemBudgetId: wibId,
        itemizedAmount: 300,
      });

      // Should not throw
      invoiceBudgetLineService.deleteInvoiceBudgetLine(db, invoiceId, createResult.budgetLine.id);

      // Verify it's gone
      const listResult = invoiceBudgetLineService.listInvoiceBudgetLines(db, invoiceId);
      expect(listResult.budgetLines).toHaveLength(0);
    });

    it('deletes a line and list shows remaining lines', () => {
      const vendorId = createTestVendor('Vendor Del D');
      const invoiceId = createTestInvoice(vendorId, { amount: 1000 });
      const wi1 = createTestWorkItem('Task D1');
      const wi2 = createTestWorkItem('Task D2');
      const wib1 = createTestWorkItemBudget(wi1);
      const wib2 = createTestWorkItemBudget(wi2);

      const result1 = invoiceBudgetLineService.createInvoiceBudgetLine(db, invoiceId, {
        workItemBudgetId: wib1,
        itemizedAmount: 100,
      });
      invoiceBudgetLineService.createInvoiceBudgetLine(db, invoiceId, {
        workItemBudgetId: wib2,
        itemizedAmount: 200,
      });

      invoiceBudgetLineService.deleteInvoiceBudgetLine(db, invoiceId, result1.budgetLine.id);

      const listResult = invoiceBudgetLineService.listInvoiceBudgetLines(db, invoiceId);
      expect(listResult.budgetLines).toHaveLength(1);
      expect(listResult.budgetLines[0]!.itemizedAmount).toBe(200);
    });
  });

  // ─── getInvoiceBudgetLinesForInvoice() ──────────────────────────────────────

  describe('getInvoiceBudgetLinesForInvoice()', () => {
    it('returns empty array and full invoiceAmount as remaining when no lines exist', () => {
      const vendorId = createTestVendor('Vendor GBL A');
      const invoiceId = createTestInvoice(vendorId, { amount: 800 });

      const result = invoiceBudgetLineService.getInvoiceBudgetLinesForInvoice(db, invoiceId, 800);

      expect(result.budgetLines).toHaveLength(0);
      expect(result.remainingAmount).toBe(800);
    });

    it('returns budget lines summary with correct fields for work item budget', () => {
      const vendorId = createTestVendor('Vendor GBL B');
      const invoiceId = createTestInvoice(vendorId, { amount: 1000 });
      const wiId = createTestWorkItem('Tiling');
      const wibId = createTestWorkItemBudget(wiId, { plannedAmount: 600 });

      invoiceBudgetLineService.createInvoiceBudgetLine(db, invoiceId, {
        workItemBudgetId: wibId,
        itemizedAmount: 400,
      });

      const result = invoiceBudgetLineService.getInvoiceBudgetLinesForInvoice(db, invoiceId, 1000);

      expect(result.budgetLines).toHaveLength(1);
      const line = result.budgetLines[0]!;
      expect(line.id).toBeDefined();
      expect(line.budgetLineId).toBe(wibId);
      expect(line.budgetLineType).toBe('work_item');
      expect(line.itemName).toBe('Tiling');
      expect(line.plannedAmount).toBe(600);
      expect(line.itemizedAmount).toBe(400);
      expect(result.remainingAmount).toBe(600);
    });

    it('returns budget lines summary for household item budget', () => {
      const vendorId = createTestVendor('Vendor GBL C');
      const invoiceId = createTestInvoice(vendorId, { amount: 500 });
      const hiId = createTestHouseholdItem();
      const hibId = createTestHouseholdItemBudget(hiId, { plannedAmount: 300 });

      invoiceBudgetLineService.createInvoiceBudgetLine(db, invoiceId, {
        householdItemBudgetId: hibId,
        itemizedAmount: 200,
      });

      const result = invoiceBudgetLineService.getInvoiceBudgetLinesForInvoice(db, invoiceId, 500);

      expect(result.budgetLines).toHaveLength(1);
      expect(result.budgetLines[0]!.budgetLineType).toBe('household_item');
      expect(result.budgetLines[0]!.budgetLineId).toBe(hibId);
      expect(result.remainingAmount).toBe(300);
    });

    it('calculates remainingAmount correctly for multiple lines', () => {
      const vendorId = createTestVendor('Vendor GBL D');
      const invoiceId = createTestInvoice(vendorId, { amount: 1000 });
      const wi1 = createTestWorkItem('Task GBL 1');
      const wi2 = createTestWorkItem('Task GBL 2');
      const wib1 = createTestWorkItemBudget(wi1);
      const wib2 = createTestWorkItemBudget(wi2);

      invoiceBudgetLineService.createInvoiceBudgetLine(db, invoiceId, {
        workItemBudgetId: wib1,
        itemizedAmount: 300,
      });
      invoiceBudgetLineService.createInvoiceBudgetLine(db, invoiceId, {
        workItemBudgetId: wib2,
        itemizedAmount: 400,
      });

      const result = invoiceBudgetLineService.getInvoiceBudgetLinesForInvoice(db, invoiceId, 1000);

      expect(result.budgetLines).toHaveLength(2);
      expect(result.remainingAmount).toBe(300);
    });
  });
});
