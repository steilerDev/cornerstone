/**
 * Tests for buildAreaBreakdown in budgetBreakdownService (Issue #1276).
 * Covers area-hierarchy grouping, synthetic Unassigned node, pruning, ordering,
 * roll-up totals, subsidy payback aggregation, and household item parallel path.
 *
 * Strategy: in-memory SQLite + runMigrations (same pattern as budgetBreakdownService.test.ts).
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import { getBudgetBreakdown } from './budgetBreakdownService.js';
import { CONFIDENCE_MARGINS } from '@cornerstone/shared';

describe('getBudgetBreakdown — area hierarchy grouping', () => {
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

  function now() {
    return new Date().toISOString();
  }

  function insertTestUser(userId = 'user-area-test') {
    const ts = now();
    db.insert(schema.users)
      .values({
        id: userId,
        email: `${userId}@example.com`,
        displayName: 'Area Test User',
        passwordHash: 'hashed',
        role: 'member',
        authProvider: 'local',
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    return userId;
  }

  /**
   * Insert an area and return its id.
   * Migration creates no default areas; all areas must be seeded explicitly.
   */
  function insertArea(
    opts: {
      name?: string;
      parentId?: string | null;
      color?: string | null;
      sortOrder?: number;
    } = {},
  ): string {
    const id = `area-${idCounter++}`;
    const ts = now();
    db.insert(schema.areas)
      .values({
        id,
        name: opts.name ?? `Area-${id}`,
        parentId: opts.parentId ?? null,
        color: opts.color ?? null,
        sortOrder: opts.sortOrder ?? idCounter,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    return id;
  }

  /**
   * Insert a work item with one budget line and return both IDs.
   * Pass areaId=null to leave work item unassigned.
   */
  function insertWorkItem(
    opts: {
      title?: string;
      areaId?: string | null;
      plannedAmount?: number;
      confidence?: 'own_estimate' | 'professional_estimate' | 'quote' | 'invoice';
      actualCost?: number;
    } = {},
  ): { workItemId: string; budgetLineId: string } {
    const id = `wi-${idCounter++}`;
    const ts = now();
    db.insert(schema.workItems)
      .values({
        id,
        title: opts.title ?? `Work Item ${id}`,
        status: 'not_started',
        areaId: opts.areaId !== undefined ? opts.areaId : null,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();

    const budgetId = `bud-${idCounter++}`;
    db.insert(schema.workItemBudgets)
      .values({
        id: budgetId,
        workItemId: id,
        plannedAmount: opts.plannedAmount ?? 1000,
        confidence: opts.confidence ?? 'own_estimate',
        budgetCategoryId: null,
        budgetSourceId: null,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();

    if (opts.actualCost != null && opts.actualCost > 0) {
      const vendorId = `vendor-${idCounter++}`;
      db.insert(schema.vendors)
        .values({ id: vendorId, name: `Vendor ${vendorId}`, createdAt: ts, updatedAt: ts })
        .run();
      const invoiceId = `inv-${idCounter++}`;
      db.insert(schema.invoices)
        .values({
          id: invoiceId,
          vendorId,
          amount: opts.actualCost,
          date: '2026-01-01',
          status: 'paid',
          createdAt: ts,
          updatedAt: ts,
        })
        .run();
      db.insert(schema.invoiceBudgetLines)
        .values({
          id: randomUUID(),
          invoiceId,
          workItemBudgetId: budgetId,
          itemizedAmount: opts.actualCost,
          createdAt: ts,
          updatedAt: ts,
        })
        .run();
    }

    return { workItemId: id, budgetLineId: budgetId };
  }

  /**
   * Insert a household item with one budget line and return both IDs.
   */
  function insertHouseholdItem(
    opts: {
      name?: string;
      areaId?: string | null;
      plannedAmount?: number;
      confidence?: 'own_estimate' | 'professional_estimate' | 'quote' | 'invoice';
      actualCost?: number;
    } = {},
  ): { householdItemId: string; budgetLineId: string } {
    const id = `hi-${idCounter++}`;
    const ts = now();
    db.insert(schema.householdItems)
      .values({
        id,
        name: opts.name ?? `HI ${id}`,
        categoryId: 'hic-furniture',
        status: 'planned',
        quantity: 1,
        isLate: false,
        areaId: opts.areaId !== undefined ? opts.areaId : null,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();

    const budgetId = `hibud-${idCounter++}`;
    db.insert(schema.householdItemBudgets)
      .values({
        id: budgetId,
        householdItemId: id,
        plannedAmount: opts.plannedAmount ?? 500,
        confidence: opts.confidence ?? 'own_estimate',
        budgetCategoryId: null,
        budgetSourceId: null,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();

    if (opts.actualCost != null && opts.actualCost > 0) {
      const vendorId = `vendor-hi-${idCounter++}`;
      db.insert(schema.vendors)
        .values({ id: vendorId, name: `Vendor ${vendorId}`, createdAt: ts, updatedAt: ts })
        .run();
      const invoiceId = `inv-hi-${idCounter++}`;
      db.insert(schema.invoices)
        .values({
          id: invoiceId,
          vendorId,
          amount: opts.actualCost,
          date: '2026-01-01',
          status: 'paid',
          createdAt: ts,
          updatedAt: ts,
        })
        .run();
      db.insert(schema.invoiceBudgetLines)
        .values({
          id: randomUUID(),
          invoiceId,
          householdItemBudgetId: budgetId,
          itemizedAmount: opts.actualCost,
          createdAt: ts,
          updatedAt: ts,
        })
        .run();
    }

    return { householdItemId: id, budgetLineId: budgetId };
  }

  /**
   * Insert a subsidy program and return its id.
   */
  function insertSubsidyProgram(opts: {
    reductionType: 'percentage' | 'fixed';
    reductionValue: number;
    name?: string;
  }): string {
    const id = `prog-${idCounter++}`;
    const ts = now();
    db.insert(schema.subsidyPrograms)
      .values({
        id,
        name: opts.name ?? `Subsidy ${id}`,
        reductionType: opts.reductionType,
        reductionValue: opts.reductionValue,
        applicationStatus: 'eligible',
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    return id;
  }

  function linkWorkItemSubsidy(workItemId: string, subsidyProgramId: string) {
    db.insert(schema.workItemSubsidies).values({ workItemId, subsidyProgramId }).run();
  }

  beforeEach(() => {
    const testDb = createTestDb();
    sqlite = testDb.sqlite;
    db = testDb.db;
    idCounter = 0;
    insertTestUser();
  });

  afterEach(() => {
    sqlite.close();
  });

  // ─── Scenario 1: No areas, no items ──────────────────────────────────────────

  describe('Scenario 1 — no areas, no items', () => {
    it('returns empty workItems.areas array', () => {
      const result = getBudgetBreakdown(db);
      expect(result.workItems.areas).toHaveLength(0);
    });

    it('returns empty householdItems.areas array', () => {
      const result = getBudgetBreakdown(db);
      expect(result.householdItems.areas).toHaveLength(0);
    });

    it('returns zero totals for both sections', () => {
      const result = getBudgetBreakdown(db);
      expect(result.workItems.totals.projectedMin).toBe(0);
      expect(result.workItems.totals.projectedMax).toBe(0);
      expect(result.workItems.totals.actualCost).toBe(0);
      expect(result.householdItems.totals.projectedMin).toBe(0);
      expect(result.householdItems.totals.projectedMax).toBe(0);
    });
  });

  // ─── Scenario 2: Single root area with one work item ──────────────────────────

  describe('Scenario 2 — single root area with one work item', () => {
    it('produces one root area node with the correct areaId and name', () => {
      const areaId = insertArea({ name: 'Kitchen' });
      insertWorkItem({ areaId, plannedAmount: 1000, confidence: 'own_estimate' });

      const result = getBudgetBreakdown(db);

      expect(result.workItems.areas).toHaveLength(1);
      const root = result.workItems.areas[0]!;
      expect(root.areaId).toBe(areaId);
      expect(root.name).toBe('Kitchen');
    });

    it('root node has the work item in items[] and empty children[]', () => {
      const areaId = insertArea({ name: 'Kitchen' });
      insertWorkItem({ areaId, plannedAmount: 1000, confidence: 'own_estimate' });

      const result = getBudgetBreakdown(db);

      const root = result.workItems.areas[0]!;
      expect(root.items).toHaveLength(1);
      expect(root.children).toHaveLength(0);
    });

    it('root node rolled-up totals match the item totals (own_estimate 1000 → min=800, max=1200)', () => {
      const areaId = insertArea({ name: 'Kitchen' });
      insertWorkItem({ areaId, plannedAmount: 1000, confidence: 'own_estimate' });

      const margin = CONFIDENCE_MARGINS.own_estimate; // 0.2
      const result = getBudgetBreakdown(db);

      const root = result.workItems.areas[0]!;
      // After subsidy payback (none here), projectedMin = 1000*(1-0.2) = 800
      expect(root.projectedMin).toBeCloseTo(1000 * (1 - margin), 5);
      expect(root.projectedMax).toBeCloseTo(1000 * (1 + margin), 5);
      expect(root.actualCost).toBe(0);
      expect(root.subsidyPayback).toBe(0);
    });

    it('root node parentId is null', () => {
      const areaId = insertArea({ name: 'Kitchen' });
      insertWorkItem({ areaId, plannedAmount: 1000 });

      const result = getBudgetBreakdown(db);

      expect(result.workItems.areas[0]!.parentId).toBeNull();
    });
  });

  // ─── Scenario 2b: Multiple work items in the same area ───────────────────────

  describe('Scenario 2b — area with multiple work items', () => {
    it('area items[] contains all work items assigned to the same area', () => {
      const areaId = insertArea({ name: 'Basement' });
      const { workItemId: wi1 } = insertWorkItem({ areaId, plannedAmount: 1000 });
      const { workItemId: wi2 } = insertWorkItem({ areaId, plannedAmount: 2000 });

      const result = getBudgetBreakdown(db);

      expect(result.workItems.areas).toHaveLength(1);
      const area = result.workItems.areas[0]!;
      expect(area.items).toHaveLength(2);
      const itemIds = area.items.map((i) => (i as { workItemId: string }).workItemId);
      expect(itemIds).toContain(wi1);
      expect(itemIds).toContain(wi2);
    });

    it('area rolled-up totals equal sum across all work items in the area', () => {
      const areaId = insertArea({ name: 'Attic' });
      insertWorkItem({ areaId, plannedAmount: 1000, confidence: 'own_estimate' });
      insertWorkItem({ areaId, plannedAmount: 3000, confidence: 'own_estimate' });

      const margin = CONFIDENCE_MARGINS.own_estimate;
      const result = getBudgetBreakdown(db);

      const area = result.workItems.areas[0]!;
      expect(area.projectedMin).toBeCloseTo(4000 * (1 - margin), 5);
      expect(area.projectedMax).toBeCloseTo(4000 * (1 + margin), 5);
    });
  });

  // ─── Scenario 3: Parent + child — roll-up ─────────────────────────────────────

  describe('Scenario 3 — parent area with child area', () => {
    it('parent has items=[] and children=[child]', () => {
      const parentId = insertArea({ name: 'Ground Floor' });
      const childId = insertArea({ name: 'Kitchen', parentId });
      insertWorkItem({ areaId: childId, plannedAmount: 2000 });

      const result = getBudgetBreakdown(db);

      const parent = result.workItems.areas[0]!;
      expect(parent.areaId).toBe(parentId);
      expect(parent.items).toHaveLength(0);
      expect(parent.children).toHaveLength(1);
      expect(parent.children[0]!.areaId).toBe(childId);
    });

    it('parent rolled-up totals equal sum of child items', () => {
      const parentId = insertArea({ name: 'Ground Floor' });
      const childId = insertArea({ name: 'Kitchen', parentId });
      insertWorkItem({ areaId: childId, plannedAmount: 2000, confidence: 'own_estimate' });

      const margin = CONFIDENCE_MARGINS.own_estimate;
      const result = getBudgetBreakdown(db);

      const parent = result.workItems.areas[0]!;
      const child = parent.children[0]!;

      // Child totals
      expect(child.projectedMin).toBeCloseTo(2000 * (1 - margin), 5);
      expect(child.projectedMax).toBeCloseTo(2000 * (1 + margin), 5);

      // Parent rolled-up totals equal child totals (parent has no direct items)
      expect(parent.projectedMin).toBeCloseTo(child.projectedMin, 5);
      expect(parent.projectedMax).toBeCloseTo(child.projectedMax, 5);
    });

    it('parent is NOT pruned even though it has no direct items', () => {
      const parentId = insertArea({ name: 'Ground Floor' });
      const childId = insertArea({ name: 'Kitchen', parentId });
      insertWorkItem({ areaId: childId, plannedAmount: 2000 });

      const result = getBudgetBreakdown(db);

      // Parent node must appear; only empty-subtree areas are pruned
      const parentNode = result.workItems.areas.find((a) => a.areaId === parentId);
      expect(parentNode).toBeDefined();
    });

    it('child parentId equals the parent areaId', () => {
      const parentId = insertArea({ name: 'Ground Floor' });
      const childId = insertArea({ name: 'Kitchen', parentId });
      insertWorkItem({ areaId: childId, plannedAmount: 1000 });

      const result = getBudgetBreakdown(db);

      const child = result.workItems.areas[0]!.children[0]!;
      expect(child.parentId).toBe(parentId);
    });
  });

  // ─── Scenario 4: Unassigned work item ─────────────────────────────────────────

  describe('Scenario 4 — unassigned work item (null area)', () => {
    it('creates a synthetic Unassigned node when work items have null areaId', () => {
      insertWorkItem({ areaId: null, plannedAmount: 1000 });

      const result = getBudgetBreakdown(db);

      expect(result.workItems.areas).toHaveLength(1);
      const unassigned = result.workItems.areas[0]!;
      expect(unassigned.areaId).toBeNull();
      expect(unassigned.name).toBe('Unassigned');
    });

    it('Unassigned node appears at front of areas[] (before named areas)', () => {
      const areaId = insertArea({ name: 'Kitchen' });
      insertWorkItem({ areaId, plannedAmount: 500 });
      insertWorkItem({ areaId: null, plannedAmount: 300 });

      const result = getBudgetBreakdown(db);

      expect(result.workItems.areas.length).toBeGreaterThanOrEqual(2);
      expect(result.workItems.areas[0]!.areaId).toBeNull(); // Unassigned is first
    });

    it('Unassigned node has items[] containing the null-area work item', () => {
      insertWorkItem({ areaId: null, plannedAmount: 1000, confidence: 'own_estimate' });

      const result = getBudgetBreakdown(db);

      const unassigned = result.workItems.areas[0]!;
      expect(unassigned.items).toHaveLength(1);
      expect(unassigned.children).toHaveLength(0);
    });

    it('Unassigned node rolled-up totals match the unassigned item', () => {
      const margin = CONFIDENCE_MARGINS.own_estimate;
      insertWorkItem({ areaId: null, plannedAmount: 1000, confidence: 'own_estimate' });

      const result = getBudgetBreakdown(db);

      const unassigned = result.workItems.areas[0]!;
      expect(unassigned.projectedMin).toBeCloseTo(1000 * (1 - margin), 5);
      expect(unassigned.projectedMax).toBeCloseTo(1000 * (1 + margin), 5);
    });

    it('Unassigned node parentId is null', () => {
      insertWorkItem({ areaId: null, plannedAmount: 1000 });

      const result = getBudgetBreakdown(db);

      expect(result.workItems.areas[0]!.parentId).toBeNull();
    });
  });

  // ─── Scenario 5: Empty-subtree pruning ────────────────────────────────────────

  describe('Scenario 5 — empty-subtree area pruning', () => {
    it('area with zero items in its subtree is absent from areas[]', () => {
      const emptyAreaId = insertArea({ name: 'Garage' });
      const populatedAreaId = insertArea({ name: 'Kitchen' });
      insertWorkItem({ areaId: populatedAreaId, plannedAmount: 1000 });

      const result = getBudgetBreakdown(db);

      const areaIds = result.workItems.areas.map((a) => a.areaId);
      expect(areaIds).not.toContain(emptyAreaId);
      expect(areaIds).toContain(populatedAreaId);
    });

    it('area with items in area_table but no budget lines is absent', () => {
      // Work item exists but has no budget lines → not in breakdown at all
      const areaId = insertArea({ name: 'Basement' });
      const id = `wi-no-budget-${idCounter++}`;
      const ts = now();
      db.insert(schema.workItems)
        .values({
          id,
          title: 'No Budget Item',
          status: 'not_started',
          areaId,
          createdAt: ts,
          updatedAt: ts,
        })
        .run();

      const result = getBudgetBreakdown(db);

      const areaIds = result.workItems.areas.map((a) => a.areaId);
      expect(areaIds).not.toContain(areaId);
    });

    it('parent area is pruned when all children are pruned and it has no direct items', () => {
      const parentId = insertArea({ name: 'Empty Floor' });
      // Child has no items — will be pruned
      insertArea({ name: 'Empty Room', parentId });

      const result = getBudgetBreakdown(db);

      const areaIds = result.workItems.areas.map((a) => a.areaId);
      expect(areaIds).not.toContain(parentId);
    });
  });

  // ─── Scenario 6: Ordering ──────────────────────────────────────────────────────

  describe('Scenario 6 — roots sorted by sort_order ASC then name ASC', () => {
    it('roots appear in sort_order ascending order', () => {
      // Insert in reverse sort order to confirm ordering is applied
      const area3 = insertArea({ name: 'Alpha', sortOrder: 30 });
      const area1 = insertArea({ name: 'Beta', sortOrder: 10 });
      const area2 = insertArea({ name: 'Gamma', sortOrder: 20 });
      insertWorkItem({ areaId: area1, plannedAmount: 100 });
      insertWorkItem({ areaId: area2, plannedAmount: 100 });
      insertWorkItem({ areaId: area3, plannedAmount: 100 });

      const result = getBudgetBreakdown(db);

      const areaIds = result.workItems.areas.filter((a) => a.areaId !== null).map((a) => a.areaId);
      expect(areaIds.indexOf(area1)).toBeLessThan(areaIds.indexOf(area2));
      expect(areaIds.indexOf(area2)).toBeLessThan(areaIds.indexOf(area3));
    });

    it('roots with same sort_order are sorted by name ASC', () => {
      const areaZ = insertArea({ name: 'Zebra', sortOrder: 100 });
      const areaA = insertArea({ name: 'Alpha', sortOrder: 100 });
      const areaM = insertArea({ name: 'Middle', sortOrder: 100 });
      insertWorkItem({ areaId: areaZ, plannedAmount: 100 });
      insertWorkItem({ areaId: areaA, plannedAmount: 100 });
      insertWorkItem({ areaId: areaM, plannedAmount: 100 });

      const result = getBudgetBreakdown(db);

      const names = result.workItems.areas.filter((a) => a.areaId !== null).map((a) => a.name);
      expect(names.indexOf('Alpha')).toBeLessThan(names.indexOf('Middle'));
      expect(names.indexOf('Middle')).toBeLessThan(names.indexOf('Zebra'));
    });

    it('children at each level also sorted by sort_order ASC, name ASC', () => {
      const parentId = insertArea({ name: 'Floor' });
      const childC = insertArea({ name: 'Room C', parentId, sortOrder: 30 });
      const childA = insertArea({ name: 'Room A', parentId, sortOrder: 10 });
      const childB = insertArea({ name: 'Room B', parentId, sortOrder: 20 });
      insertWorkItem({ areaId: childA, plannedAmount: 100 });
      insertWorkItem({ areaId: childB, plannedAmount: 100 });
      insertWorkItem({ areaId: childC, plannedAmount: 100 });

      const result = getBudgetBreakdown(db);

      const parent = result.workItems.areas.find((a) => a.areaId === parentId);
      expect(parent).toBeDefined();
      const childNames = parent!.children.map((c) => c.name);
      expect(childNames[0]).toBe('Room A');
      expect(childNames[1]).toBe('Room B');
      expect(childNames[2]).toBe('Room C');
    });
  });

  // ─── Scenario 7: Grandparent rolls up grandchild items ────────────────────────

  describe('Scenario 7 — 3-level tree: grandparent rolls up grandchild items', () => {
    it('grandparent totals equal sum of items across all descendants', () => {
      const grandparentId = insertArea({ name: 'House' });
      const parentId = insertArea({ name: 'Ground Floor', parentId: grandparentId });
      const childId = insertArea({ name: 'Kitchen', parentId });
      insertWorkItem({ areaId: childId, plannedAmount: 3000, confidence: 'own_estimate' });

      const margin = CONFIDENCE_MARGINS.own_estimate;
      const result = getBudgetBreakdown(db);

      const grandparent = result.workItems.areas.find((a) => a.areaId === grandparentId);
      expect(grandparent).toBeDefined();
      expect(grandparent!.projectedMin).toBeCloseTo(3000 * (1 - margin), 5);
      expect(grandparent!.projectedMax).toBeCloseTo(3000 * (1 + margin), 5);
    });

    it('grandparent children[] contains only the direct child (parent), not grandchild', () => {
      const grandparentId = insertArea({ name: 'House' });
      const parentId = insertArea({ name: 'Ground Floor', parentId: grandparentId });
      const childId = insertArea({ name: 'Kitchen', parentId });
      insertWorkItem({ areaId: childId, plannedAmount: 1000 });

      const result = getBudgetBreakdown(db);

      const grandparent = result.workItems.areas.find((a) => a.areaId === grandparentId);
      expect(grandparent!.children).toHaveLength(1);
      expect(grandparent!.children[0]!.areaId).toBe(parentId);
    });

    it('multi-area multi-item tree: grandparent actualCost equals sum of all descendant actualCosts', () => {
      const grandparentId = insertArea({ name: 'House' });
      const parentId = insertArea({ name: 'Ground Floor', parentId: grandparentId });
      const childA = insertArea({ name: 'Kitchen', parentId });
      const childB = insertArea({ name: 'Living Room', parentId });
      insertWorkItem({
        areaId: childA,
        plannedAmount: 2000,
        confidence: 'invoice',
        actualCost: 1800,
      });
      insertWorkItem({
        areaId: childB,
        plannedAmount: 1500,
        confidence: 'invoice',
        actualCost: 1400,
      });

      const result = getBudgetBreakdown(db);

      const grandparent = result.workItems.areas.find((a) => a.areaId === grandparentId);
      expect(grandparent!.actualCost).toBe(1800 + 1400);
    });
  });

  // ─── Scenario 8: Subsidy payback preserved ────────────────────────────────────

  describe('Scenario 8 — subsidy payback preserved through area aggregation', () => {
    it('area node subsidyPayback equals item subsidyPayback for single-item area', () => {
      // own_estimate 1000 → max = 1200; 10% subsidy → payback = 120
      const areaId = insertArea({ name: 'Zone A' });
      const { workItemId } = insertWorkItem({
        areaId,
        plannedAmount: 1000,
        confidence: 'own_estimate',
      });
      const subsidyId = insertSubsidyProgram({ reductionType: 'percentage', reductionValue: 10 });
      linkWorkItemSubsidy(workItemId, subsidyId);

      const result = getBudgetBreakdown(db);

      const area = result.workItems.areas.find((a) => a.areaId === areaId);
      expect(area!.subsidyPayback).toBeCloseTo(120, 5);
    });

    it('area node minSubsidyPayback equals item minSubsidyPayback', () => {
      // own_estimate 1000 → min = 800; 10% subsidy → minPayback = 80
      const areaId = insertArea({ name: 'Zone B' });
      const { workItemId } = insertWorkItem({
        areaId,
        plannedAmount: 1000,
        confidence: 'own_estimate',
      });
      const subsidyId = insertSubsidyProgram({ reductionType: 'percentage', reductionValue: 10 });
      linkWorkItemSubsidy(workItemId, subsidyId);

      const result = getBudgetBreakdown(db);

      const area = result.workItems.areas.find((a) => a.areaId === areaId);
      expect(area!.minSubsidyPayback).toBeCloseTo(80, 5);
    });

    it('parent area subsidyPayback rolls up from child items', () => {
      // parent → child with WI: own_estimate 1000, 10% subsidy → payback=120
      const parentId = insertArea({ name: 'Floor' });
      const childId = insertArea({ name: 'Room', parentId });
      const { workItemId } = insertWorkItem({
        areaId: childId,
        plannedAmount: 1000,
        confidence: 'own_estimate',
      });
      const subsidyId = insertSubsidyProgram({ reductionType: 'percentage', reductionValue: 10 });
      linkWorkItemSubsidy(workItemId, subsidyId);

      const result = getBudgetBreakdown(db);

      const parent = result.workItems.areas.find((a) => a.areaId === parentId);
      expect(parent!.subsidyPayback).toBeCloseTo(120, 5);
      expect(parent!.minSubsidyPayback).toBeCloseTo(80, 5);
    });

    it('rawProjectedMin/Max are gross (pre-subsidy) values at area level', () => {
      // own_estimate 1000 → rawMin = 800, rawMax = 1200; subsidy reduces projectedMin/Max only
      const areaId = insertArea({ name: 'Zone C' });
      const { workItemId } = insertWorkItem({
        areaId,
        plannedAmount: 1000,
        confidence: 'own_estimate',
      });
      const subsidyId = insertSubsidyProgram({ reductionType: 'percentage', reductionValue: 10 });
      linkWorkItemSubsidy(workItemId, subsidyId);

      const margin = CONFIDENCE_MARGINS.own_estimate;
      const result = getBudgetBreakdown(db);

      const area = result.workItems.areas.find((a) => a.areaId === areaId)!;
      expect(area.rawProjectedMin).toBeCloseTo(1000 * (1 - margin), 5);
      expect(area.rawProjectedMax).toBeCloseTo(1000 * (1 + margin), 5);
      // projectedMin/Max are subsidy-adjusted
      expect(area.projectedMin).toBeLessThan(area.rawProjectedMin);
    });
  });

  // ─── Scenario 9: Household items — same structure ─────────────────────────────

  describe('Scenario 9 — household items: parallel area structure', () => {
    it('single root area with one HI produces correct hiAreas structure', () => {
      const areaId = insertArea({ name: 'Living Room' });
      insertHouseholdItem({ areaId, plannedAmount: 800, confidence: 'own_estimate' });

      const result = getBudgetBreakdown(db);

      expect(result.householdItems.areas).toHaveLength(1);
      const area = result.householdItems.areas[0]!;
      expect(area.areaId).toBe(areaId);
      expect(area.name).toBe('Living Room');
      expect(area.items).toHaveLength(1);
      expect(area.children).toHaveLength(0);
    });

    it('HI area rolled-up totals match item totals (own_estimate 800 → min=640, max=960)', () => {
      const areaId = insertArea({ name: 'Bedroom' });
      insertHouseholdItem({ areaId, plannedAmount: 800, confidence: 'own_estimate' });

      const margin = CONFIDENCE_MARGINS.own_estimate;
      const result = getBudgetBreakdown(db);

      const area = result.householdItems.areas[0]!;
      expect(area.projectedMin).toBeCloseTo(800 * (1 - margin), 5);
      expect(area.projectedMax).toBeCloseTo(800 * (1 + margin), 5);
    });

    it('area with multiple household items contains all items in items[] (regression: only first item was added)', () => {
      const areaId = insertArea({ name: 'Living Room' });
      const { householdItemId: hi1 } = insertHouseholdItem({ areaId, plannedAmount: 500 });
      const { householdItemId: hi2 } = insertHouseholdItem({ areaId, plannedAmount: 800 });

      const result = getBudgetBreakdown(db);

      expect(result.householdItems.areas).toHaveLength(1);
      const area = result.householdItems.areas[0]!;
      expect(area.items).toHaveLength(2);
      const itemIds = area.items.map((i) => (i as { householdItemId: string }).householdItemId);
      expect(itemIds).toContain(hi1);
      expect(itemIds).toContain(hi2);
    });

    it('area rolled-up totals equal sum across all household items in the area', () => {
      const areaId = insertArea({ name: 'Dining Room' });
      insertHouseholdItem({ areaId, plannedAmount: 500, confidence: 'own_estimate' });
      insertHouseholdItem({ areaId, plannedAmount: 1500, confidence: 'own_estimate' });

      const margin = CONFIDENCE_MARGINS.own_estimate;
      const result = getBudgetBreakdown(db);

      const area = result.householdItems.areas[0]!;
      expect(area.projectedMin).toBeCloseTo(2000 * (1 - margin), 5);
      expect(area.projectedMax).toBeCloseTo(2000 * (1 + margin), 5);
    });

    it('HI parent area rolls up from child area', () => {
      const parentId = insertArea({ name: 'Upper Floor' });
      const childId = insertArea({ name: 'Master Bedroom', parentId });
      insertHouseholdItem({ areaId: childId, plannedAmount: 1200, confidence: 'quote' });

      const margin = CONFIDENCE_MARGINS.quote;
      const result = getBudgetBreakdown(db);

      const parent = result.householdItems.areas.find((a) => a.areaId === parentId);
      expect(parent).toBeDefined();
      expect(parent!.projectedMin).toBeCloseTo(1200 * (1 - margin), 5);
      expect(parent!.projectedMax).toBeCloseTo(1200 * (1 + margin), 5);
    });

    it('WI areas and HI areas are independent — WI items do not appear in HI areas', () => {
      const areaId = insertArea({ name: 'Kitchen' });
      insertWorkItem({ areaId, plannedAmount: 5000 });
      insertHouseholdItem({ areaId, plannedAmount: 300 });

      const result = getBudgetBreakdown(db);

      // WI side has one area with WI item
      const wiArea = result.workItems.areas.find((a) => a.areaId === areaId);
      expect(wiArea).toBeDefined();
      expect(wiArea!.items).toHaveLength(1);
      // The item is a BreakdownWorkItem (has workItemId)
      expect((wiArea!.items[0] as { workItemId: string }).workItemId).toBeDefined();

      // HI side has one area with HI item
      const hiArea = result.householdItems.areas.find((a) => a.areaId === areaId);
      expect(hiArea).toBeDefined();
      expect(hiArea!.items).toHaveLength(1);
      // The item is a BreakdownHouseholdItem (has householdItemId)
      expect((hiArea!.items[0] as { householdItemId: string }).householdItemId).toBeDefined();
    });
  });

  // ─── Scenario 10: Household items — Unassigned ────────────────────────────────

  describe('Scenario 10 — household items: Unassigned synthetic bucket', () => {
    it('creates Unassigned node for null-area HI items', () => {
      insertHouseholdItem({ areaId: null, plannedAmount: 400 });

      const result = getBudgetBreakdown(db);

      expect(result.householdItems.areas).toHaveLength(1);
      const unassigned = result.householdItems.areas[0]!;
      expect(unassigned.areaId).toBeNull();
      expect(unassigned.name).toBe('Unassigned');
    });

    it('HI Unassigned node appears at front of areas[] before named areas', () => {
      const areaId = insertArea({ name: 'Office' });
      insertHouseholdItem({ areaId, plannedAmount: 600 });
      insertHouseholdItem({ areaId: null, plannedAmount: 200 });

      const result = getBudgetBreakdown(db);

      expect(result.householdItems.areas[0]!.areaId).toBeNull();
    });

    it('HI Unassigned node rolled-up totals match unassigned items', () => {
      const margin = CONFIDENCE_MARGINS.own_estimate;
      insertHouseholdItem({ areaId: null, plannedAmount: 400, confidence: 'own_estimate' });

      const result = getBudgetBreakdown(db);

      const unassigned = result.householdItems.areas[0]!;
      expect(unassigned.projectedMin).toBeCloseTo(400 * (1 - margin), 5);
      expect(unassigned.projectedMax).toBeCloseTo(400 * (1 + margin), 5);
    });
  });

  // ─── Scenario 11: Mixed — assigned + unassigned coexist ───────────────────────

  describe('Scenario 11 — mixed: named areas and Unassigned coexist', () => {
    it('both named area nodes and Unassigned node appear in areas[]', () => {
      const areaId = insertArea({ name: 'Garden' });
      insertWorkItem({ areaId, plannedAmount: 4000 });
      insertWorkItem({ areaId: null, plannedAmount: 1000 });

      const result = getBudgetBreakdown(db);

      expect(result.workItems.areas.length).toBe(2);
      const areaIds = result.workItems.areas.map((a) => a.areaId);
      expect(areaIds).toContain(null); // Unassigned
      expect(areaIds).toContain(areaId); // Named area
    });

    it('totals section aggregates both assigned and unassigned items', () => {
      const areaId = insertArea({ name: 'Garden' });
      insertWorkItem({ areaId, plannedAmount: 4000, confidence: 'invoice', actualCost: 3800 });
      insertWorkItem({ areaId: null, plannedAmount: 1000, confidence: 'invoice', actualCost: 900 });

      const result = getBudgetBreakdown(db);

      expect(result.workItems.totals.actualCost).toBe(3800 + 900);
    });

    it('wi totals projectedMax equals sum of all area projectedMax values (including Unassigned)', () => {
      const areaId = insertArea({ name: 'Terrace' });
      insertWorkItem({ areaId, plannedAmount: 2000, confidence: 'own_estimate' });
      insertWorkItem({ areaId: null, plannedAmount: 500, confidence: 'own_estimate' });

      const result = getBudgetBreakdown(db);

      const sumFromAreas = result.workItems.areas.reduce((acc, a) => acc + a.projectedMax, 0);
      expect(result.workItems.totals.projectedMax).toBeCloseTo(sumFromAreas, 5);
    });

    it('HI: both named area and Unassigned bucket coexist', () => {
      const areaId = insertArea({ name: 'Hallway' });
      insertHouseholdItem({ areaId, plannedAmount: 500 });
      insertHouseholdItem({ areaId: null, plannedAmount: 200 });

      const result = getBudgetBreakdown(db);

      expect(result.householdItems.areas.length).toBe(2);
      const areaIds = result.householdItems.areas.map((a) => a.areaId);
      expect(areaIds).toContain(null);
      expect(areaIds).toContain(areaId);
    });
  });
});
