/**
 * Tests for budgetOverviewService household item budget invoice aggregation (Issue #413).
 * Covers actualCost calculations including household item invoices in budget overview.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
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
          status: 'planning',
          startDate: null,
          endDate: null,
          estimatedDays: null,
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
      invoiceService.createInvoice(
        db,
        vendorId,
        {
          amount: 2000,
          date: '2026-02-01',
          householdItemBudgetId: hiBudgetId,
        },
        userId,
      );

      // Create work item invoice
      invoiceService.createInvoice(
        db,
        vendorId,
        {
          amount: 1500,
          date: '2026-02-05',
          workItemBudgetId: wiBudgetId,
        },
        userId,
      );

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
      const categoryName = categories[0].name;

      const budgetId = createTestHouseholdItemBudget(householdItemId, 5000, categoryId);
      const vendorId = createTestVendor('Appliance Vendor');

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

      const overview = budgetOverviewService.getBudgetOverview(db);

      // Find the category summary for the assigned category
      const categorySummary = overview.categorySummaries.find((cs) => cs.categoryId === categoryId);
      expect(categorySummary).toBeDefined();
      expect(categorySummary?.actualCost).toBe(2500);
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
          status: 'planning',
          startDate: null,
          endDate: null,
          estimatedDays: null,
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
      invoiceService.createInvoice(
        db,
        vendorId,
        {
          amount: 1000,
          date: '2026-02-01',
          householdItemBudgetId: hiBudgetId,
        },
        userId,
      );

      invoiceService.createInvoice(
        db,
        vendorId,
        {
          amount: 800,
          date: '2026-02-05',
          workItemBudgetId: wiBudgetId,
        },
        userId,
      );

      const overview = budgetOverviewService.getBudgetOverview(db);

      const categorySummary = overview.categorySummaries.find((cs) => cs.id === categoryId);
      expect(categorySummary).toBeDefined();
      // 1000 (household) + 800 (work item) = 1800
      expect(categorySummary?.actualCost).toBe(1800);
    });

    it('returns per-category actualCost as 0 for categories with no invoices', () => {
      const overview = budgetOverviewService.getBudgetOverview(db);

      // All categories should be present (from seeded data)
      expect(overview.categorySummaries.length).toBeGreaterThan(0);

      // All should have actualCost: 0 initially
      for (const summary of overview.categorySummaries) {
        expect(summary.actualCost).toBe(0);
      }
    });
  });

  // ─── getBudgetOverview() household items without category ────────────────────

  describe('getBudgetOverview() - household items without category', () => {
    it('does not fail when household item budget has no category assigned', () => {
      const userId = createTestUser('test@example.com', 'Test User');
      const householdItemId = createTestHouseholdItem('Kitchen Appliance', userId);
      // No categoryId provided — budget has NULL category
      const budgetId = createTestHouseholdItemBudget(householdItemId, 5000, undefined);
      const vendorId = createTestVendor('Appliance Vendor');

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

      const overview = budgetOverviewService.getBudgetOverview(db);

      // Overview should still complete successfully
      expect(overview).toBeDefined();
      expect(overview.financingSummary.totalActualCost).toBe(2500);
    });
  });

  // ─── getBudgetOverview() summary structure ────────────────────────────────

  describe('getBudgetOverview() - response structure with household invoices', () => {
    it('returns a valid BudgetOverview response with household invoices included', () => {
      const userId = createTestUser('test@example.com', 'Test User');
      const householdItemId = createTestHouseholdItem('Kitchen Appliance', userId);
      const budgetId = createTestHouseholdItemBudget(householdItemId, 5000);
      const vendorId = createTestVendor('Appliance Vendor');

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

      const overview = budgetOverviewService.getBudgetOverview(db);

      // Verify top-level structure
      expect(overview).toHaveProperty('availableFunds');
      expect(overview).toHaveProperty('categorySummaries');

      // Verify top-level fields
      expect(overview).toHaveProperty('availableFunds');
      expect(overview).toHaveProperty('sourceCount');
      expect(overview).toHaveProperty('actualCost');

      // Verify categorySummaries structure
      expect(Array.isArray(overview.categorySummaries)).toBe(true);
      if (overview.categorySummaries.length > 0) {
        const summary = overview.categorySummaries[0];
        expect(summary).toHaveProperty('categoryId');
        expect(summary).toHaveProperty('categoryName');
        expect(summary).toHaveProperty('actualCost');
      }
    });
  });
});
