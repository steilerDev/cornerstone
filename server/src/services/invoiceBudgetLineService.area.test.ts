/**
 * Tests for parentItemArea enrichment in invoiceBudgetLineService (Issue #1272).
 *
 * Verifies that listInvoiceBudgetLines, createInvoiceBudgetLine, updateInvoiceBudgetLine
 * correctly populate parentItemArea for work_item budget lines with an assigned area,
 * and return null for work_items without area or household_item budget lines.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import {
  listInvoiceBudgetLines,
  createInvoiceBudgetLine,
  updateInvoiceBudgetLine,
} from './invoiceBudgetLineService.js';

describe('invoiceBudgetLineService — parentItemArea enrichment', () => {
  let sqlite: Database.Database;
  let db: BetterSQLite3Database<typeof schema>;
  let idCounter = 0;

  beforeEach(() => {
    const sqliteDb = new Database(':memory:');
    sqliteDb.pragma('journal_mode = WAL');
    sqliteDb.pragma('foreign_keys = ON');
    runMigrations(sqliteDb);
    sqlite = sqliteDb;
    db = drizzle(sqliteDb, { schema });
    idCounter = 0;
  });

  afterEach(() => {
    sqlite.close();
  });

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  function makeId(prefix: string): string {
    return `${prefix}-${++idCounter}`;
  }

  function now(): string {
    return new Date(Date.now() + idCounter).toISOString();
  }

  function insertArea(opts: {
    name: string;
    parentId?: string | null;
    color?: string | null;
  }): string {
    const id = makeId('area');
    const ts = now();
    db.insert(schema.areas)
      .values({
        id,
        name: opts.name,
        parentId: opts.parentId ?? null,
        color: opts.color ?? '#aabbcc',
        sortOrder: idCounter,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    return id;
  }

  function insertVendor(): string {
    const id = makeId('vendor');
    const ts = now();
    db.insert(schema.vendors)
      .values({
        id,
        name: 'Test Vendor',
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

  function insertInvoice(vendorId: string, amount = 5000): string {
    const id = makeId('invoice');
    const ts = now();
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
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    return id;
  }

  function insertWorkItem(areaId: string | null = null): string {
    const id = makeId('wi');
    const ts = now();
    db.insert(schema.workItems)
      .values({
        id,
        title: 'Test Work Item',
        status: 'not_started',
        areaId,
        startDate: null,
        endDate: null,
        durationDays: null,
        startAfter: null,
        startBefore: null,
        assignedUserId: null,
        assignedVendorId: null,
        createdBy: null,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    return id;
  }

  function insertWorkItemBudget(workItemId: string, plannedAmount = 1000): string {
    const id = makeId('wib');
    const ts = now();
    db.insert(schema.workItemBudgets)
      .values({
        id,
        workItemId,
        description: 'Budget line for test',
        plannedAmount,
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

  function insertHouseholdItem(): string {
    const id = makeId('hi');
    const ts = now();
    db.insert(schema.householdItems)
      .values({
        id,
        name: 'Test Household Item',
        categoryId: 'hic-furniture',
        status: 'planned',
        quantity: 1,
        areaId: null,
        vendorId: null,
        url: null,
        description: null,
        orderDate: null,
        targetDeliveryDate: null,
        actualDeliveryDate: null,
        earliestDeliveryDate: null,
        latestDeliveryDate: null,
        isLate: false,
        createdBy: null,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    return id;
  }

  function insertHouseholdItemBudget(householdItemId: string, plannedAmount = 500): string {
    const id = makeId('hib');
    const ts = now();
    db.insert(schema.householdItemBudgets)
      .values({
        id,
        householdItemId,
        description: 'HI budget line',
        plannedAmount,
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

  function insertInvoiceBudgetLine(
    invoiceId: string,
    opts: { workItemBudgetId?: string; householdItemBudgetId?: string; itemizedAmount?: number },
  ): string {
    const id = makeId('ibl');
    const ts = now();
    db.insert(schema.invoiceBudgetLines)
      .values({
        id,
        invoiceId,
        workItemBudgetId: opts.workItemBudgetId ?? null,
        householdItemBudgetId: opts.householdItemBudgetId ?? null,
        itemizedAmount: opts.itemizedAmount ?? 100,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    return id;
  }

  // ─── listInvoiceBudgetLines tests ──────────────────────────────────────────

  describe('listInvoiceBudgetLines', () => {
    it('work_item budget line with area → parentItemArea has correct id and name', () => {
      const vendorId = insertVendor();
      const invoiceId = insertInvoice(vendorId);
      const areaId = insertArea({ name: 'Kitchen', color: '#ff0000' });
      const wiId = insertWorkItem(areaId);
      const wibId = insertWorkItemBudget(wiId, 800);
      insertInvoiceBudgetLine(invoiceId, { workItemBudgetId: wibId, itemizedAmount: 400 });

      const result = listInvoiceBudgetLines(db, invoiceId);

      expect(result.budgetLines).toHaveLength(1);
      const line = result.budgetLines[0];
      expect(line.parentItemType).toBe('work_item');
      expect(line.parentItemArea).not.toBeNull();
      expect(line.parentItemArea!.id).toBe(areaId);
      expect(line.parentItemArea!.name).toBe('Kitchen');
      expect(line.parentItemArea!.color).toBe('#ff0000');
      expect(line.parentItemArea!.ancestors).toEqual([]);
    });

    it('work_item budget line without area → parentItemArea is null', () => {
      const vendorId = insertVendor();
      const invoiceId = insertInvoice(vendorId);
      const wiId = insertWorkItem(null); // no area
      const wibId = insertWorkItemBudget(wiId, 800);
      insertInvoiceBudgetLine(invoiceId, { workItemBudgetId: wibId, itemizedAmount: 300 });

      const result = listInvoiceBudgetLines(db, invoiceId);

      expect(result.budgetLines).toHaveLength(1);
      expect(result.budgetLines[0].parentItemArea).toBeNull();
    });

    it('household_item budget line → parentItemArea is always null', () => {
      const vendorId = insertVendor();
      const invoiceId = insertInvoice(vendorId);
      const hiId = insertHouseholdItem();
      const hibId = insertHouseholdItemBudget(hiId, 600);
      insertInvoiceBudgetLine(invoiceId, { householdItemBudgetId: hibId, itemizedAmount: 200 });

      const result = listInvoiceBudgetLines(db, invoiceId);

      expect(result.budgetLines).toHaveLength(1);
      expect(result.budgetLines[0].parentItemType).toBe('household_item');
      expect(result.budgetLines[0].parentItemArea).toBeNull();
    });
  });

  // ─── createInvoiceBudgetLine tests ─────────────────────────────────────────

  describe('createInvoiceBudgetLine', () => {
    it('work_item with area → returned line has parentItemArea populated', () => {
      const vendorId = insertVendor();
      const invoiceId = insertInvoice(vendorId, 5000);
      const areaId = insertArea({ name: 'Bathroom', color: '#00ff00' });
      const wiId = insertWorkItem(areaId);
      const wibId = insertWorkItemBudget(wiId, 2000);

      const result = createInvoiceBudgetLine(db, invoiceId, {
        workItemBudgetId: wibId,
        itemizedAmount: 500,
      });

      expect(result.budgetLine.parentItemArea).not.toBeNull();
      expect(result.budgetLine.parentItemArea!.id).toBe(areaId);
      expect(result.budgetLine.parentItemArea!.name).toBe('Bathroom');
    });

    it('work_item without area → returned line has parentItemArea null', () => {
      const vendorId = insertVendor();
      const invoiceId = insertInvoice(vendorId, 5000);
      const wiId = insertWorkItem(null);
      const wibId = insertWorkItemBudget(wiId, 2000);

      const result = createInvoiceBudgetLine(db, invoiceId, {
        workItemBudgetId: wibId,
        itemizedAmount: 500,
      });

      expect(result.budgetLine.parentItemArea).toBeNull();
    });
  });

  // ─── updateInvoiceBudgetLine tests ─────────────────────────────────────────

  describe('updateInvoiceBudgetLine', () => {
    it('area preserved after unrelated amount update', () => {
      const vendorId = insertVendor();
      const invoiceId = insertInvoice(vendorId, 5000);
      const areaId = insertArea({ name: 'Garage' });
      const wiId = insertWorkItem(areaId);
      const wibId = insertWorkItemBudget(wiId, 2000);
      const lineId = insertInvoiceBudgetLine(invoiceId, {
        workItemBudgetId: wibId,
        itemizedAmount: 300,
      });

      const result = updateInvoiceBudgetLine(db, invoiceId, lineId, { itemizedAmount: 450 });

      expect(result.budgetLine.parentItemArea).not.toBeNull();
      expect(result.budgetLine.parentItemArea!.id).toBe(areaId);
      expect(result.budgetLine.parentItemArea!.name).toBe('Garage');
    });
  });

  // ─── Ancestor chain tests ───────────────────────────────────────────────────

  describe('ancestor chain', () => {
    it('child area returns non-empty ancestors array with root ancestor first', () => {
      const vendorId = insertVendor();
      const invoiceId = insertInvoice(vendorId, 5000);
      const rootAreaId = insertArea({ name: 'Ground Floor', color: '#111111' });
      const childAreaId = insertArea({ name: 'Kitchen', parentId: rootAreaId });
      const wiId = insertWorkItem(childAreaId);
      const wibId = insertWorkItemBudget(wiId, 1500);
      insertInvoiceBudgetLine(invoiceId, { workItemBudgetId: wibId, itemizedAmount: 500 });

      const result = listInvoiceBudgetLines(db, invoiceId);

      expect(result.budgetLines).toHaveLength(1);
      const area = result.budgetLines[0].parentItemArea;
      expect(area).not.toBeNull();
      expect(area!.id).toBe(childAreaId);
      expect(area!.ancestors).toHaveLength(1);
      expect(area!.ancestors[0].id).toBe(rootAreaId);
      expect(area!.ancestors[0].name).toBe('Ground Floor');
    });
  });
});
