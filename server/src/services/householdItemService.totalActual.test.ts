/**
 * Tests for householdItemService household item budget total actual calculation (Issue #413).
 * Covers getTotalActualAmount() and getBudgetSummary() with household item invoice links.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
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
      estimatedDeliveryDate: undefined,
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
      invoiceService.createInvoice(
        db,
        vendorId,
        {
          amount: 2500,
          date: '2026-02-01',
          householdItemBudgetId: budgetId,
        },
        userId,
      );

      const detail = householdItemService.getHouseholdItemById(db, householdItemId);

      expect(detail.budgetSummary.totalActual).toBe(2500);
    });

    it('returns sum across multiple invoices on the same budget line', () => {
      const userId = createTestUser('test@example.com', 'Test User');
      const householdItemId = createTestHouseholdItem('Kitchen Appliance', userId);
      const budgetId = createTestHouseholdItemBudget(householdItemId, 10000);
      const vendorId = createTestVendor('Appliance Vendor');

      // Create three invoices on the same budget line
      invoiceService.createInvoice(
        db,
        vendorId,
        {
          amount: 2000,
          date: '2026-02-01',
          householdItemBudgetId: budgetId,
        },
        userId,
      );

      invoiceService.createInvoice(
        db,
        vendorId,
        {
          amount: 1500,
          date: '2026-02-10',
          householdItemBudgetId: budgetId,
        },
        userId,
      );

      invoiceService.createInvoice(
        db,
        vendorId,
        {
          amount: 2500,
          date: '2026-02-20',
          householdItemBudgetId: budgetId,
        },
        userId,
      );

      const detail = householdItemService.getHouseholdItemById(db, householdItemId);

      expect(detail.budgetSummary.totalActual).toBe(6000);
    });

    it('returns sum across multiple budget lines on the same household item', () => {
      const userId = createTestUser('test@example.com', 'Test User');
      const householdItemId = createTestHouseholdItem('Kitchen Appliance', userId);
      const budget1Id = createTestHouseholdItemBudget(householdItemId, 5000);
      const budget2Id = createTestHouseholdItemBudget(householdItemId, 3000);
      const vendorId = createTestVendor('Appliance Vendor');

      // Create invoices on different budget lines for the same household item
      invoiceService.createInvoice(
        db,
        vendorId,
        {
          amount: 1500,
          date: '2026-02-01',
          householdItemBudgetId: budget1Id,
        },
        userId,
      );

      invoiceService.createInvoice(
        db,
        vendorId,
        {
          amount: 1000,
          date: '2026-02-05',
          householdItemBudgetId: budget2Id,
        },
        userId,
      );

      invoiceService.createInvoice(
        db,
        vendorId,
        {
          amount: 500,
          date: '2026-02-10',
          householdItemBudgetId: budget1Id,
        },
        userId,
      );

      const detail = householdItemService.getHouseholdItemById(db, householdItemId);

      // 1500 + 1000 + 500 = 3000
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
      invoiceService.createInvoice(
        db,
        vendorId,
        {
          amount: 2000,
          date: '2026-02-01',
          householdItemBudgetId: budget1Id,
        },
        userId,
      );

      // Create invoice for item 2
      invoiceService.createInvoice(
        db,
        vendorId,
        {
          amount: 1500,
          date: '2026-02-05',
          householdItemBudgetId: budget2Id,
        },
        userId,
      );

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
      invoiceService.createInvoice(
        db,
        vendorId,
        {
          amount: 2000,
          date: '2026-02-01',
          householdItemBudgetId: budgetId,
        },
        userId,
      );

      // Verify totalActual includes only the household item invoice
      const detail = householdItemService.getHouseholdItemById(db, householdItemId);
      expect(detail.budgetSummary.totalActual).toBe(2000);
    });

    it('handles decimal amounts correctly', () => {
      const userId = createTestUser('test@example.com', 'Test User');
      const householdItemId = createTestHouseholdItem('Kitchen Appliance', userId);
      const budgetId = createTestHouseholdItemBudget(householdItemId, 5000.5);
      const vendorId = createTestVendor('Appliance Vendor');

      invoiceService.createInvoice(
        db,
        vendorId,
        {
          amount: 2345.67,
          date: '2026-02-01',
          householdItemBudgetId: budgetId,
        },
        userId,
      );

      invoiceService.createInvoice(
        db,
        vendorId,
        {
          amount: 1234.33,
          date: '2026-02-10',
          householdItemBudgetId: budgetId,
        },
        userId,
      );

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
      invoiceService.createInvoice(
        db,
        vendorId,
        {
          amount: 2500,
          date: '2026-02-01',
          householdItemBudgetId: budgetId,
        },
        userId,
      );

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

      invoiceService.createInvoice(
        db,
        vendorId,
        {
          amount: 3000,
          date: '2026-02-01',
          householdItemBudgetId: budgetId,
        },
        userId,
      );

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
