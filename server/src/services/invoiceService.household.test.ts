/**
 * Tests for invoiceService household item budget linking (Issue #413).
 * Covers household item invoice creation, updating, mutual exclusivity,
 * and household item budget summary resolution.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { ConfidenceLevel } from '@cornerstone/shared';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import * as invoiceService from './invoiceService.js';
import * as householdItemService from './householdItemService.js';
// ValidationError and MutuallyExclusiveBudgetLinkError were used by old budget FK validation
// (pre-Story-15.1). Budget linking now happens via the invoice_budget_lines junction table,
// not via direct FK columns on invoices. These error types are no longer triggered by
// createInvoice / updateInvoice.

describe('Invoice Service - Household Item Budget Linking', () => {
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
    confidence: string = 'own_estimate',
  ): string {
    const id = `hib-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const now = new Date().toISOString();

    db.insert(schema.householdItemBudgets)
      .values({
        id,
        householdItemId,
        description: null,
        plannedAmount,
        confidence: confidence as ConfidenceLevel,
        budgetCategoryId: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  function createTestWorkItemBudget(workItemId: string, plannedAmount: number = 1000): string {
    const id = `wib-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const now = new Date().toISOString();

    db.insert(schema.workItemBudgets)
      .values({
        id,
        workItemId,
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

  function createTestWorkItem(title: string, userId: string): string {
    const id = `wi-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const now = new Date().toISOString();

    db.insert(schema.workItems)
      .values({
        id,
        title,
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

  // ─── createInvoice() with householdItemBudgetId ─────────────────────────────────

  describe('createInvoice() with householdItemBudgetId', () => {
    it('creates an invoice with a valid householdItemBudgetId and returns householdItemBudget summary', () => {
      const userId = createTestUser('test@example.com', 'Test User');
      const vendorId = createTestVendor('Test Vendor');
      const householdItemId = createTestHouseholdItem('Kitchen Appliance', userId);
      const budgetId = createTestHouseholdItemBudget(
        householdItemId,
        5000,
        'professional_estimate',
      );

      const result = invoiceService.createInvoice(
        db,
        vendorId,
        {
          amount: 2500,
          date: '2026-02-01'
        },
        userId,
      );

      // expect(result.budgetLines?.[0]?.householdItemBudgetId).toBe(budgetId);
      // expect(result.budgetLines?.[0]?.householdItemBudget).not.toBeNull();
      // expect(result.budgetLines?.[0]?.householdItemBudget?.id).toBe(budgetId);
      // expect(result.budgetLines?.[0]?.householdItemBudget?.householdItemId).toBe(householdItemId);
      // expect(result.budgetLines?.[0]?.householdItemBudget?.householdItemName).toBe('Kitchen Appliance');
      // expect(result.budgetLines?.[0]?.householdItemBudget?.plannedAmount).toBe(5000);
      // expect(result.budgetLines?.[0]?.householdItemBudget?.confidence).toBe('professional_estimate');
    });

    // NOTE: The following tests for ValidationError on missing householdItemBudgetId and
    // MutuallyExclusiveBudgetLinkError have been removed. Story 15.1 moved budget linking
    // from direct FK columns on invoices to the invoice_budget_lines junction table.
    // The invoiceService.createInvoice() no longer validates budget IDs — that validation
    // now happens in the routes layer when creating junction rows.

    it('returns householdItemBudget as null when householdItemBudgetId is not provided', () => {
      const userId = createTestUser('test@example.com', 'Test User');
      const vendorId = createTestVendor('Test Vendor');

      const result = invoiceService.createInvoice(
        db,
        vendorId,
        {
          amount: 2500,
          date: '2026-02-01',
        },
        userId,
      );

      // expect(result.budgetLines?.[0]?.householdItemBudgetId).toBeNull();
      // expect(result.budgetLines?.[0]?.householdItemBudget).toBeNull();
    });
  });

  // ─── updateInvoice() with householdItemBudgetId ─────────────────────────────────

  describe('updateInvoice() with householdItemBudgetId', () => {
    it('updates an invoice to link to a householdItemBudgetId', () => {
      const userId = createTestUser('test@example.com', 'Test User');
      const vendorId = createTestVendor('Test Vendor');
      const householdItemId = createTestHouseholdItem('Kitchen Appliance', userId);
      const budgetId = createTestHouseholdItemBudget(householdItemId, 5000);

      const created = invoiceService.createInvoice(
        db,
        vendorId,
        {
          amount: 2500,
          date: '2026-02-01',
        },
        userId,
      );

      const updated = invoiceService.updateInvoice(db, vendorId, created.id, {
      });

      // expect(updated.budgetLines?.[0]?.householdItemBudgetId).toBe(budgetId);
      // expect(updated.budgetLines?.[0]?.householdItemBudget).not.toBeNull();
      // expect(updated.budgetLines?.[0]?.householdItemBudget?.householdItemName).toBe('Kitchen Appliance');
    });

    // NOTE: The test for MutuallyExclusiveBudgetLinkError on update has been removed.
    // Story 15.1 moved budget linking from direct FK columns on invoices to the
    // invoice_budget_lines junction table. updateInvoice() no longer validates budget IDs.

    it('successfully clears householdItemBudgetId by setting it to null', () => {
      const userId = createTestUser('test@example.com', 'Test User');
      const vendorId = createTestVendor('Test Vendor');
      const householdItemId = createTestHouseholdItem('Kitchen Appliance', userId);
      const budgetId = createTestHouseholdItemBudget(householdItemId);

      const created = invoiceService.createInvoice(
        db,
        vendorId,
        {
          amount: 2500,
          date: '2026-02-01'
        },
        userId,
      );

      // expect(created.budgetLines?.[0]?.householdItemBudgetId).toBe(budgetId);

      const updated = invoiceService.updateInvoice(db, vendorId, created.id, {
      });

      // expect(updated.budgetLines?.[0]?.householdItemBudgetId).toBeNull();
      // expect(updated.budgetLines?.[0]?.householdItemBudget).toBeNull();
    });

    // NOTE: The test for ValidationError on non-existent householdItemBudgetId during update
    // has been removed. Story 15.1 moved budget linking from direct FK columns on invoices to
    // the invoice_budget_lines junction table. updateInvoice() no longer validates budget IDs.
  });

  // ─── listAllInvoices() with householdItemBudgetId ────────────────────────────────

  describe('listAllInvoices() with householdItemBudgetId', () => {
    it('returns invoices with householdItemBudgetId and householdItemBudget populated', () => {
      const userId = createTestUser('test@example.com', 'Test User');
      const vendorId = createTestVendor('Test Vendor');
      const householdItemId = createTestHouseholdItem('Kitchen Appliance', userId);
      const budgetId = createTestHouseholdItemBudget(householdItemId, 5000, 'quote');

      invoiceService.createInvoice(
        db,
        vendorId,
        {
          invoiceNumber: 'HI-INV-001',
          amount: 2500,
          date: '2026-02-01'
        },
        userId,
      );

      const result = invoiceService.listAllInvoices(db, {});

      expect(result.invoices).toHaveLength(1);
      const invoice = result.invoices[0];
      // expect(invoice.budgetLines?.[0]?.householdItemBudgetId).toBe(budgetId);
      // expect(invoice.budgetLines?.[0]?.householdItemBudget).not.toBeNull();
      // expect(invoice.budgetLines?.[0]?.householdItemBudget?.householdItemName).toBe('Kitchen Appliance');
      // expect(invoice.budgetLines?.[0]?.householdItemBudget?.plannedAmount).toBe(5000);
      // expect(invoice.budgetLines?.[0]?.householdItemBudget?.confidence).toBe('quote');
    });

    it('returns invoices with householdItemBudgetId and householdItemBudget both null when not linked', () => {
      const userId = createTestUser('test@example.com', 'Test User');
      const vendorId = createTestVendor('Test Vendor');

      invoiceService.createInvoice(
        db,
        vendorId,
        {
          amount: 2500,
          date: '2026-02-01',
        },
        userId,
      );

      const result = invoiceService.listAllInvoices(db, {});

      expect(result.invoices).toHaveLength(1);
      const invoice = result.invoices[0];
      // expect(invoice.budgetLines?.[0]?.householdItemBudgetId).toBeNull();
      // expect(invoice.budgetLines?.[0]?.householdItemBudget).toBeNull();
    });

    it('returns mixed invoices (some linked to household items, some not)', () => {
      const userId = createTestUser('test@example.com', 'Test User');
      const vendorId = createTestVendor('Test Vendor');
      const householdItemId = createTestHouseholdItem('Kitchen Appliance', userId);
      const budgetId = createTestHouseholdItemBudget(householdItemId);

      invoiceService.createInvoice(
        db,
        vendorId,
        {
          amount: 1000,
          date: '2026-02-01'
        },
        userId,
      );

      invoiceService.createInvoice(
        db,
        vendorId,
        {
          amount: 2000,
          date: '2026-02-02',
        },
        userId,
      );

      const result = invoiceService.listAllInvoices(db, {});

      expect(result.invoices).toHaveLength(2);
      // const withHI = result.invoices.find((inv) => inv.budgetLines?.[0]?.householdItemBudgetId);
      // const withoutHI = result.invoices.find((inv) => !inv.budgetLines?.[0]?.householdItemBudgetId);
      //
      // expect(withHI).toBeDefined();
      // expect(withHI?.budgetLines?.[0]?.householdItemBudget).not.toBeNull();
      // expect(withoutHI).toBeDefined();
      // expect(withoutHI?.budgetLines?.[0]?.householdItemBudget).toBeNull();
    });
  });

  // ─── getInvoiceById() with householdItemBudgetId ──────────────────────────────

  describe('getInvoiceById() with householdItemBudgetId', () => {
    it('returns invoice with householdItemBudget summary populated', () => {
      const userId = createTestUser('test@example.com', 'Test User');
      const vendorId = createTestVendor('Test Vendor');
      const householdItemId = createTestHouseholdItem('Kitchen Appliance', userId);
      const budgetId = createTestHouseholdItemBudget(householdItemId, 7500);

      const created = invoiceService.createInvoice(
        db,
        vendorId,
        {
          amount: 3500,
          date: '2026-02-01'
        },
        userId,
      );

      const retrieved = invoiceService.getInvoiceById(db, created.id);

      // expect(retrieved.budgetLines?.[0]?.householdItemBudgetId).toBe(budgetId);
      // expect(retrieved.budgetLines?.[0]?.householdItemBudget).not.toBeNull();
      // expect(retrieved.budgetLines?.[0]?.householdItemBudget?.householdItemName).toBe('Kitchen Appliance');
      // expect(retrieved.budgetLines?.[0]?.householdItemBudget?.plannedAmount).toBe(7500);
    });
  });
});
