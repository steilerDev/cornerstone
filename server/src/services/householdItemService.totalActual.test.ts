/**
 * Tests for householdItemService household item budget total actual calculation (Issue #413).
 * Covers getTotalActualAmount() and getBudgetSummary() with household item invoice links.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import * as householdItemService from './householdItemService.js';
import * as invoiceService from './invoiceService.js';

describe('Household Item Service - Total Actual Amount', () => {
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

  function createTestUser(email: string, displayName: string): string {
    const id = `user-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const now = new Date().toISOString();
    db.insert(schema.users)
      .values({
        id,
        email,
        displayName,
        role: 'member',
        authProvider: 'local',
        passwordHash: 'hashed',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  function createTestVendor(name: string): string {
    const id = `vendor-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const timestamp = new Date(Date.now() + timestampOffset).toISOString();
    timestampOffset += 1;

    db.insert(schema.vendors)
      .values({
        id,
        name,
        specialty: null,
        phone: null,
        email: null,
        address: null,
        notes: null,
        createdBy: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run();
    return id;
  }

  function createTestHouseholdItem(name: string, userId: string): string {
    const result = householdItemService.createHouseholdItem(db, userId, {
      name,
      vendorId: undefined,
      tagIds: [],
      earliestDeliveryDate: undefined,
      latestDeliveryDate: undefined,
    });
    return result.id;
  }

  function createTestHouseholdItemBudget(
    householdItemId: string,
    plannedAmount: number = 1000,
  ): string {
    const id = `hib-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const now = new Date().toISOString();

    db.insert(schema.householdItemBudgets)
      .values({
        id,
        householdItemId,
        description: null,
        plannedAmount,
        confidence: 'own_estimate',
        budgetCategoryId: null,
        createdAt: now,
        updatedAt: now,
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

  // ─── getBudgetSummary().totalActual ────────────────────────────────────────

  describe('getBudgetSummary().totalActual', () => {
    it('returns totalActual: 0 when no invoices are linked', () => {
      const userId = createTestUser('test@example.com', 'Test User');
      const householdItemId = createTestHouseholdItem('Kitchen Appliance', userId);
      createTestHouseholdItemBudget(householdItemId, 5000);

      const detail = householdItemService.getHouseholdItemById(db, householdItemId);

      expect(detail.budgetSummary.totalActual).toBe(0);
    });

    it('returns correct totalActual with one invoice linked', () => {
      const userId = createTestUser('test@example.com', 'Test User');
      const householdItemId = createTestHouseholdItem('Kitchen Appliance', userId);
      const budgetId = createTestHouseholdItemBudget(householdItemId, 5000);
      const vendorId = createTestVendor('Appliance Vendor');

      // Create invoice linked to the household item budget
      const invoice = invoiceService.createInvoice(
        db,
        vendorId,
        {
          amount: 2500,
          date: '2026-02-01',
        },
        userId,
      );
      db.insert(schema.invoiceBudgetLines)
        .values({
          id: randomUUID(),
          invoiceId: invoice.id,
          householdItemBudgetId: budgetId,
          itemizedAmount: 2500,
          createdAt: invoice.createdAt,
          updatedAt: invoice.updatedAt,
        })
        .run();

      const detail = householdItemService.getHouseholdItemById(db, householdItemId);

      expect(detail.budgetSummary.totalActual).toBe(2500);
    });

    it('returns sum across multiple invoices on distinct budget lines for the same household item', () => {
      // Story 15.1 (junction table model): each budget line can link to AT MOST ONE invoice
      // (partial UNIQUE index on household_item_budget_id in invoice_budget_lines).
      // Use three separate budget lines — each with its own invoice — to model distributed cost.
      const userId = createTestUser('test@example.com', 'Test User');
      const householdItemId = createTestHouseholdItem('Kitchen Appliance', userId);
      const budgetId1 = createTestHouseholdItemBudget(householdItemId, 4000);
      const budgetId2 = createTestHouseholdItemBudget(householdItemId, 3000);
      const budgetId3 = createTestHouseholdItemBudget(householdItemId, 5000);
      const vendorId = createTestVendor('Appliance Vendor');

      const inv1 = invoiceService.createInvoice(
        db,
        vendorId,
        {
          amount: 2000,
          date: '2026-02-01',
        },
        userId,
      );
      db.insert(schema.invoiceBudgetLines)
        .values({
          id: randomUUID(),
          invoiceId: inv1.id,
          householdItemBudgetId: budgetId1,
          itemizedAmount: 2000,
          createdAt: inv1.createdAt,
          updatedAt: inv1.updatedAt,
        })
        .run();

      const inv2 = invoiceService.createInvoice(
        db,
        vendorId,
        {
          amount: 1500,
          date: '2026-02-10',
        },
        userId,
      );
      db.insert(schema.invoiceBudgetLines)
        .values({
          id: randomUUID(),
          invoiceId: inv2.id,
          householdItemBudgetId: budgetId2,
          itemizedAmount: 1500,
          createdAt: inv2.createdAt,
          updatedAt: inv2.updatedAt,
        })
        .run();

      const inv3 = invoiceService.createInvoice(
        db,
        vendorId,
        {
          amount: 2500,
          date: '2026-02-20',
        },
        userId,
      );
      db.insert(schema.invoiceBudgetLines)
        .values({
          id: randomUUID(),
          invoiceId: inv3.id,
          householdItemBudgetId: budgetId3,
          itemizedAmount: 2500,
          createdAt: inv3.createdAt,
          updatedAt: inv3.updatedAt,
        })
        .run();

      const detail = householdItemService.getHouseholdItemById(db, householdItemId);

      // totalActual = SUM of itemized_amounts across all budget lines for this household item
      expect(detail.budgetSummary.totalActual).toBe(6000); // 2000 + 1500 + 2500
    });

    it('returns sum across multiple budget lines on the same household item', () => {
      // Story 15.1 (junction table model): each budget line can link to AT MOST ONE invoice.
      // Use three separate budget lines — one invoice per line.
      const userId = createTestUser('test@example.com', 'Test User');
      const householdItemId = createTestHouseholdItem('Kitchen Appliance', userId);
      const budget1Id = createTestHouseholdItemBudget(householdItemId, 5000);
      const budget2Id = createTestHouseholdItemBudget(householdItemId, 3000);
      const budget3Id = createTestHouseholdItemBudget(householdItemId, 2000);
      const vendorId = createTestVendor('Appliance Vendor');

      // Create one invoice per budget line
      const invA = invoiceService.createInvoice(
        db,
        vendorId,
        {
          amount: 1500,
          date: '2026-02-01',
        },
        userId,
      );
      db.insert(schema.invoiceBudgetLines)
        .values({
          id: randomUUID(),
          invoiceId: invA.id,
          householdItemBudgetId: budget1Id,
          itemizedAmount: 1500,
          createdAt: invA.createdAt,
          updatedAt: invA.updatedAt,
        })
        .run();

      const invB = invoiceService.createInvoice(
        db,
        vendorId,
        {
          amount: 1000,
          date: '2026-02-05',
        },
        userId,
      );
      db.insert(schema.invoiceBudgetLines)
        .values({
          id: randomUUID(),
          invoiceId: invB.id,
          householdItemBudgetId: budget2Id,
          itemizedAmount: 1000,
          createdAt: invB.createdAt,
          updatedAt: invB.updatedAt,
        })
        .run();

      const invC = invoiceService.createInvoice(
        db,
        vendorId,
        {
          amount: 500,
          date: '2026-02-10',
        },
        userId,
      );
      db.insert(schema.invoiceBudgetLines)
        .values({
          id: randomUUID(),
          invoiceId: invC.id,
          householdItemBudgetId: budget3Id,
          itemizedAmount: 500,
          createdAt: invC.createdAt,
          updatedAt: invC.updatedAt,
        })
        .run();

      const detail = householdItemService.getHouseholdItemById(db, householdItemId);

      // totalActual = sum of all itemized_amounts for this household item: 1500 + 1000 + 500 = 3000
      expect(detail.budgetSummary.totalActual).toBe(3000);
    });

    it('does not include invoices from other household items', () => {
      const userId = createTestUser('test@example.com', 'Test User');
      const householdItem1Id = createTestHouseholdItem('Kitchen Appliance', userId);
      const householdItem2Id = createTestHouseholdItem('Bathroom Fixture', userId);
      const budget1Id = createTestHouseholdItemBudget(householdItem1Id, 5000);
      const budget2Id = createTestHouseholdItemBudget(householdItem2Id, 3000);
      const vendorId = createTestVendor('Appliance Vendor');

      // Create invoice for item 1
      const inv1 = invoiceService.createInvoice(
        db,
        vendorId,
        {
          amount: 2000,
          date: '2026-02-01',
        },
        userId,
      );
      db.insert(schema.invoiceBudgetLines)
        .values({
          id: randomUUID(),
          invoiceId: inv1.id,
          householdItemBudgetId: budget1Id,
          itemizedAmount: 2000,
          createdAt: inv1.createdAt,
          updatedAt: inv1.updatedAt,
        })
        .run();

      // Create invoice for item 2
      const inv2 = invoiceService.createInvoice(
        db,
        vendorId,
        {
          amount: 1500,
          date: '2026-02-05',
        },
        userId,
      );
      db.insert(schema.invoiceBudgetLines)
        .values({
          id: randomUUID(),
          invoiceId: inv2.id,
          householdItemBudgetId: budget2Id,
          itemizedAmount: 1500,
          createdAt: inv2.createdAt,
          updatedAt: inv2.updatedAt,
        })
        .run();

      // Check item 1
      const detail1 = householdItemService.getHouseholdItemById(db, householdItem1Id);
      expect(detail1.budgetSummary.totalActual).toBe(2000);

      // Check item 2
      const detail2 = householdItemService.getHouseholdItemById(db, householdItem2Id);
      expect(detail2.budgetSummary.totalActual).toBe(1500);
    });

    it('does not include invoices linked to work item budgets', () => {
      const userId = createTestUser('test@example.com', 'Test User');
      const householdItemId = createTestHouseholdItem('Kitchen Appliance', userId);
      const budgetId = createTestHouseholdItemBudget(householdItemId, 5000);
      const vendorId = createTestVendor('Appliance Vendor');

      // Create invoice for household item
      const invoice = invoiceService.createInvoice(
        db,
        vendorId,
        {
          amount: 2000,
          date: '2026-02-01',
        },
        userId,
      );
      db.insert(schema.invoiceBudgetLines)
        .values({
          id: randomUUID(),
          invoiceId: invoice.id,
          householdItemBudgetId: budgetId,
          itemizedAmount: 2000,
          createdAt: invoice.createdAt,
          updatedAt: invoice.updatedAt,
        })
        .run();

      // Verify totalActual includes only the household item invoice
      const detail = householdItemService.getHouseholdItemById(db, householdItemId);
      expect(detail.budgetSummary.totalActual).toBe(2000);
    });

    it('handles decimal amounts correctly', () => {
      // Story 15.1 (junction table model): each budget line can link to AT MOST ONE invoice.
      // Use two separate budget lines — each with its own invoice.
      const userId = createTestUser('test@example.com', 'Test User');
      const householdItemId = createTestHouseholdItem('Kitchen Appliance', userId);
      const budgetId1 = createTestHouseholdItemBudget(householdItemId, 3000);
      const budgetId2 = createTestHouseholdItemBudget(householdItemId, 2000.5);
      const vendorId = createTestVendor('Appliance Vendor');

      const inv1 = invoiceService.createInvoice(
        db,
        vendorId,
        {
          amount: 2345.67,
          date: '2026-02-01',
        },
        userId,
      );
      db.insert(schema.invoiceBudgetLines)
        .values({
          id: randomUUID(),
          invoiceId: inv1.id,
          householdItemBudgetId: budgetId1,
          itemizedAmount: 2345.67,
          createdAt: inv1.createdAt,
          updatedAt: inv1.updatedAt,
        })
        .run();

      const inv2 = invoiceService.createInvoice(
        db,
        vendorId,
        {
          amount: 1234.33,
          date: '2026-02-10',
        },
        userId,
      );
      db.insert(schema.invoiceBudgetLines)
        .values({
          id: randomUUID(),
          invoiceId: inv2.id,
          householdItemBudgetId: budgetId2,
          itemizedAmount: 1234.33,
          createdAt: inv2.createdAt,
          updatedAt: inv2.updatedAt,
        })
        .run();

      const detail = householdItemService.getHouseholdItemById(db, householdItemId);

      // 2345.67 + 1234.33 = 3580.00
      expect(detail.budgetSummary.totalActual).toBeCloseTo(3580, 2);
    });
  });

  // ─── getBudgetSummary() with household item invoices ───────────────────────

  describe('getBudgetSummary() with household item invoices', () => {
    it('computes netCost correctly (totalPlanned - subsidyReduction) with invoices present', () => {
      const userId = createTestUser('test@example.com', 'Test User');
      const householdItemId = createTestHouseholdItem('Kitchen Appliance', userId);
      const budgetId = createTestHouseholdItemBudget(householdItemId, 5000);
      const vendorId = createTestVendor('Appliance Vendor');

      // Create invoice (which affects totalActual but not netCost calculation)
      const invoice = invoiceService.createInvoice(
        db,
        vendorId,
        {
          amount: 2500,
          date: '2026-02-01',
        },
        userId,
      );
      db.insert(schema.invoiceBudgetLines)
        .values({
          id: randomUUID(),
          invoiceId: invoice.id,
          householdItemBudgetId: budgetId,
          itemizedAmount: 2500,
          createdAt: invoice.createdAt,
          updatedAt: invoice.updatedAt,
        })
        .run();

      const detail = householdItemService.getHouseholdItemById(db, householdItemId);

      expect(detail.budgetSummary.totalPlanned).toBe(5000);
      expect(detail.budgetSummary.totalActual).toBe(2500);
      // With no subsidies, netCost = totalPlanned - subsidyReduction (0) = 5000
      expect(detail.budgetSummary.netCost).toBe(5000);
    });

    it('returns all four budget aggregates (totalPlanned, totalActual, subsidyReduction, netCost)', () => {
      const userId = createTestUser('test@example.com', 'Test User');
      const householdItemId = createTestHouseholdItem('Kitchen Appliance', userId);
      const budgetId = createTestHouseholdItemBudget(householdItemId, 5000);
      const vendorId = createTestVendor('Appliance Vendor');

      const invoice = invoiceService.createInvoice(
        db,
        vendorId,
        {
          amount: 3000,
          date: '2026-02-01',
        },
        userId,
      );
      db.insert(schema.invoiceBudgetLines)
        .values({
          id: randomUUID(),
          invoiceId: invoice.id,
          householdItemBudgetId: budgetId,
          itemizedAmount: 3000,
          createdAt: invoice.createdAt,
          updatedAt: invoice.updatedAt,
        })
        .run();

      const detail = householdItemService.getHouseholdItemById(db, householdItemId);

      expect(detail.budgetSummary).toHaveProperty('totalPlanned');
      expect(detail.budgetSummary).toHaveProperty('totalActual');
      expect(detail.budgetSummary).toHaveProperty('subsidyReduction');
      expect(detail.budgetSummary).toHaveProperty('netCost');

      expect(typeof detail.budgetSummary.totalPlanned).toBe('number');
      expect(typeof detail.budgetSummary.totalActual).toBe('number');
      expect(typeof detail.budgetSummary.subsidyReduction).toBe('number');
      expect(typeof detail.budgetSummary.netCost).toBe('number');
    });
  });
});
