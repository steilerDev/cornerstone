/**
 * Tests for budgetOverviewService household item budget invoice aggregation (Issue #413).
 * Covers actualCost calculations including household item invoices in budget overview.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import * as budgetOverviewService from './budgetOverviewService.js';
import * as invoiceService from './invoiceService.js';
import * as householdItemService from './householdItemService.js';

describe('Budget Overview Service - Household Item Invoice Aggregation', () => {
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
        tradeId: null,
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
      earliestDeliveryDate: undefined,
      latestDeliveryDate: undefined,
    });
    return result.id;
  }

  function createTestHouseholdItemBudget(
    householdItemId: string,
    plannedAmount: number = 1000,
    categoryId?: string,
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
        budgetCategoryId: categoryId ?? null,
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

  // ─── getBudgetOverview() actualCost with household items ────────────────────

  describe('getBudgetOverview() - actualCost aggregation', () => {
    it('includes household item invoices in overall actualCost', () => {
      const userId = createTestUser('test@example.com', 'Test User');
      const householdItemId = createTestHouseholdItem('Kitchen Appliance', userId);
      const budgetId = createTestHouseholdItemBudget(householdItemId, 5000);
      const vendorId = createTestVendor('Appliance Vendor');

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

      const overview = budgetOverviewService.getBudgetOverview(db);

      expect(overview.actualCost).toBeDefined();
      // actualCost should include the household item invoice
      expect(overview.actualCost).toBe(2500);
    });

    it('sums household item invoices across multiple budget lines', () => {
      const userId = createTestUser('test@example.com', 'Test User');
      const householdItemId = createTestHouseholdItem('Kitchen Appliance', userId);
      const budget1Id = createTestHouseholdItemBudget(householdItemId, 5000);
      const budget2Id = createTestHouseholdItemBudget(householdItemId, 3000);
      const vendorId = createTestVendor('Appliance Vendor');

      const invoice1 = invoiceService.createInvoice(
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
          invoiceId: invoice1.id,
          householdItemBudgetId: budget1Id,
          itemizedAmount: 2000,
          createdAt: invoice1.createdAt,
          updatedAt: invoice1.updatedAt,
        })
        .run();

      const invoice2 = invoiceService.createInvoice(
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
          invoiceId: invoice2.id,
          householdItemBudgetId: budget2Id,
          itemizedAmount: 1500,
          createdAt: invoice2.createdAt,
          updatedAt: invoice2.updatedAt,
        })
        .run();

      const overview = budgetOverviewService.getBudgetOverview(db);

      // 2000 + 1500 = 3500
      expect(overview.actualCost).toBe(3500);
    });

    it('combines household item and work item invoices in actualCost', () => {
      const userId = createTestUser('test@example.com', 'Test User');

      // Create household item with invoice
      const householdItemId = createTestHouseholdItem('Kitchen Appliance', userId);
      const hiBudgetId = createTestHouseholdItemBudget(householdItemId, 5000);

      // Create work item with budget
      const workItemId = `wi-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      const now = new Date().toISOString();
      db.insert(schema.workItems)
        .values({
          id: workItemId,
          title: 'Plumbing Work',
          description: null,
          status: 'not_started',
          startDate: null,
          endDate: null,
          durationDays: null,
          assignedUserId: null,
          createdBy: userId,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      const wiBudgetId = `wib-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      db.insert(schema.workItemBudgets)
        .values({
          id: wiBudgetId,
          workItemId,
          description: null,
          plannedAmount: 3000,
          confidence: 'own_estimate',
          budgetCategoryId: null,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      const vendorId = createTestVendor('Multi-Purpose Vendor');

      // Create household item invoice
      const hiInvoice = invoiceService.createInvoice(
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
          invoiceId: hiInvoice.id,
          householdItemBudgetId: hiBudgetId,
          itemizedAmount: 2000,
          createdAt: hiInvoice.createdAt,
          updatedAt: hiInvoice.updatedAt,
        })
        .run();

      // Create work item invoice
      const wiInvoice = invoiceService.createInvoice(
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
          invoiceId: wiInvoice.id,
          workItemBudgetId: wiBudgetId,
          itemizedAmount: 1500,
          createdAt: wiInvoice.createdAt,
          updatedAt: wiInvoice.updatedAt,
        })
        .run();

      const overview = budgetOverviewService.getBudgetOverview(db);

      // 2000 (household) + 1500 (work item) = 3500
      expect(overview.actualCost).toBe(3500);
    });

    it('returns 0 actualCost when no invoices are created', () => {
      const userId = createTestUser('test@example.com', 'Test User');
      const householdItemId = createTestHouseholdItem('Kitchen Appliance', userId);
      createTestHouseholdItemBudget(householdItemId, 5000);

      const overview = budgetOverviewService.getBudgetOverview(db);

      expect(overview.actualCost).toBe(0);
    });
  });

  // ─── getBudgetOverview() per-category actualCost ───────────────────────────

  describe('getBudgetOverview() - per-category actualCost', () => {
    it('attributes household item invoices to their budget category', () => {
      const userId = createTestUser('test@example.com', 'Test User');
      const householdItemId = createTestHouseholdItem('Kitchen Appliance', userId);

      // Get an existing seeded category (from migration 0003)
      const categories = db
        .select({ id: schema.budgetCategories.id, name: schema.budgetCategories.name })
        .from(schema.budgetCategories)
        .all();

      expect(categories.length).toBeGreaterThan(0);
      const categoryId = categories[0].id;
      const _categoryName = categories[0].name;

      const budgetId = createTestHouseholdItemBudget(householdItemId, 5000, categoryId);
      const vendorId = createTestVendor('Appliance Vendor');

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

      const overview = budgetOverviewService.getBudgetOverview(db);

      // Verify global actualCost includes the household item invoice amount
      expect(overview.actualCost).toBe(2500);
      // Per-category assertion removed — categorySummaries dropped in #1243
    });

    it('combines household and work item invoices in category summary', () => {
      const userId = createTestUser('test@example.com', 'Test User');

      const categories = db
        .select({ id: schema.budgetCategories.id })
        .from(schema.budgetCategories)
        .all();

      const categoryId = categories[0].id;

      // Household item with category
      const householdItemId = createTestHouseholdItem('Kitchen Appliance', userId);
      const hiBudgetId = createTestHouseholdItemBudget(householdItemId, 5000, categoryId);

      // Work item with same category
      const workItemId = `wi-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      const now = new Date().toISOString();
      db.insert(schema.workItems)
        .values({
          id: workItemId,
          title: 'Plumbing Work',
          description: null,
          status: 'not_started',
          startDate: null,
          endDate: null,
          durationDays: null,
          assignedUserId: null,
          createdBy: userId,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      const wiBudgetId = `wib-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      db.insert(schema.workItemBudgets)
        .values({
          id: wiBudgetId,
          workItemId,
          description: null,
          plannedAmount: 3000,
          confidence: 'own_estimate',
          budgetCategoryId: categoryId,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      const vendorId = createTestVendor('Multi-Purpose Vendor');

      // Create invoices for both
      const hiInvoice = invoiceService.createInvoice(
        db,
        vendorId,
        {
          amount: 1000,
          date: '2026-02-01',
        },
        userId,
      );
      db.insert(schema.invoiceBudgetLines)
        .values({
          id: randomUUID(),
          invoiceId: hiInvoice.id,
          householdItemBudgetId: hiBudgetId,
          itemizedAmount: 1000,
          createdAt: hiInvoice.createdAt,
          updatedAt: hiInvoice.updatedAt,
        })
        .run();

      const wiInvoice = invoiceService.createInvoice(
        db,
        vendorId,
        {
          amount: 800,
          date: '2026-02-05',
        },
        userId,
      );
      db.insert(schema.invoiceBudgetLines)
        .values({
          id: randomUUID(),
          invoiceId: wiInvoice.id,
          workItemBudgetId: wiBudgetId,
          itemizedAmount: 800,
          createdAt: wiInvoice.createdAt,
          updatedAt: wiInvoice.updatedAt,
        })
        .run();

      const overview = budgetOverviewService.getBudgetOverview(db);

      // 1000 (household) + 800 (work item) = 1800
      expect(overview.actualCost).toBe(1800);
      // Per-category assertion removed — categorySummaries dropped in #1243
    });

    // 'returns per-category actualCost as 0' test removed — categorySummaries dropped in #1243
  });

  // ─── getBudgetOverview() household items without category ────────────────────

  describe('getBudgetOverview() - household items without category', () => {
    it('does not fail when household item budget has no category assigned', () => {
      const userId = createTestUser('test@example.com', 'Test User');
      const householdItemId = createTestHouseholdItem('Kitchen Appliance', userId);
      // No categoryId provided — budget has NULL category
      const budgetId = createTestHouseholdItemBudget(householdItemId, 5000, undefined);
      const vendorId = createTestVendor('Appliance Vendor');

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

      const overview = budgetOverviewService.getBudgetOverview(db);

      // Overview should still complete successfully
      expect(overview).toBeDefined();
      expect(overview.actualCost).toBe(2500);
    });
  });

  // ─── getBudgetOverview() summary structure ────────────────────────────────

  describe('getBudgetOverview() - response structure with household invoices', () => {
    it('returns a valid BudgetOverview response with household invoices included', () => {
      const userId = createTestUser('test@example.com', 'Test User');
      const householdItemId = createTestHouseholdItem('Kitchen Appliance', userId);
      const budgetId = createTestHouseholdItemBudget(householdItemId, 5000);
      const vendorId = createTestVendor('Appliance Vendor');

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

      const overview = budgetOverviewService.getBudgetOverview(db);

      // Verify top-level fields
      expect(overview).toHaveProperty('availableFunds');
      expect(overview).toHaveProperty('sourceCount');
      expect(overview).toHaveProperty('actualCost');
    });
  });
});
