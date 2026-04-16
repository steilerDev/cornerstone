/**
 * Tests for budgetOverviewService area-grouped budget aggregation (Issue #1242).
 * Covers areaSummaries and unassignedSummary fields added in step 10b.
 *
 * Strategy:
 *  - In-memory SQLite + runMigrations (same pattern as budgetOverviewService.test.ts)
 *  - insertArea / insertWorkItemWithArea helpers focus on what's new
 *  - The 11 scenarios from the spec are tested in order
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { randomUUID } from 'node:crypto';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import { getBudgetOverview } from './budgetOverviewService.js';

describe('getBudgetOverview — area-grouped aggregation', () => {
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

  /** Insert a user (required for some FK constraints). */
  function insertTestUser() {
    const ts = now();
    db.insert(schema.users)
      .values({
        id: 'user-area-test',
        email: 'area-test@example.com',
        displayName: 'Area Tester',
        passwordHash: 'hashed',
        role: 'member',
        authProvider: 'local',
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
  }

  /**
   * Insert an area and return its id.
   * sortOrder defaults to idCounter so insertion order == sort order unless overridden.
   */
  function insertArea(opts: {
    name: string;
    parentId?: string | null;
    sortOrder?: number;
  }): string {
    const id = `area-${idCounter++}`;
    const ts = now();
    db.insert(schema.areas)
      .values({
        id,
        name: opts.name,
        parentId: opts.parentId ?? null,
        color: null,
        description: null,
        sortOrder: opts.sortOrder ?? idCounter,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    return id;
  }

  /**
   * Insert a work item (optionally with one budget line and one paid invoice).
   * areaId null = no area assignment (contributes to unassignedSummary).
   * Returns the work item id.
   */
  function insertWorkItemWithArea(opts: {
    areaId?: string | null;
    plannedAmount?: number;
    actualCost?: number;
    quotationCost?: number; // creates a quotation invoice (excluded from actual)
  }): string {
    const wiId = `wi-${idCounter++}`;
    const ts = now();
    db.insert(schema.workItems)
      .values({
        id: wiId,
        title: `Work Item ${wiId}`,
        status: 'not_started',
        areaId: opts.areaId !== undefined ? opts.areaId : null,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();

    const planned = opts.plannedAmount ?? 0;
    const actualCost = opts.actualCost;
    const quotationCost = opts.quotationCost;

    if (planned > 0 || actualCost != null || quotationCost != null) {
      const budgetId = `bud-${idCounter++}`;
      db.insert(schema.workItemBudgets)
        .values({
          id: budgetId,
          workItemId: wiId,
          plannedAmount: planned,
          confidence: 'own_estimate',
          budgetCategoryId: null,
          createdAt: ts,
          updatedAt: ts,
        })
        .run();

      if (actualCost != null && actualCost > 0) {
        const vendorId = `vendor-${idCounter++}`;
        db.insert(schema.vendors)
          .values({ id: vendorId, name: `Vendor ${vendorId}`, createdAt: ts, updatedAt: ts })
          .run();
        const invoiceId = `inv-${idCounter++}`;
        db.insert(schema.invoices)
          .values({
            id: invoiceId,
            vendorId,
            amount: actualCost,
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
            itemizedAmount: actualCost,
            createdAt: ts,
            updatedAt: ts,
          })
          .run();
      }

      if (quotationCost != null && quotationCost > 0) {
        const vendorId = `vendor-${idCounter++}`;
        db.insert(schema.vendors)
          .values({ id: vendorId, name: `Vendor ${vendorId}`, createdAt: ts, updatedAt: ts })
          .run();
        const invoiceId = `inv-quot-${idCounter++}`;
        db.insert(schema.invoices)
          .values({
            id: invoiceId,
            vendorId,
            amount: quotationCost,
            date: '2026-01-01',
            status: 'quotation',
            createdAt: ts,
            updatedAt: ts,
          })
          .run();
        db.insert(schema.invoiceBudgetLines)
          .values({
            id: randomUUID(),
            invoiceId,
            workItemBudgetId: budgetId,
            itemizedAmount: quotationCost,
            createdAt: ts,
            updatedAt: ts,
          })
          .run();
      }
    }

    return wiId;
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

  // ─── Scenario 1: No areas ─────────────────────────────────────────────────

  describe('Scenario 1 — no areas', () => {
    it('returns areaSummaries=[] and unassignedSummary=null when no areas and no work items', () => {
      const result = getBudgetOverview(db);

      expect(result.areaSummaries).toEqual([]);
      expect(result.unassignedSummary).toBeNull();
    });

    it('returns areaSummaries=[] and unassignedSummary=null even with areas table empty', () => {
      // Confirm no areas exist
      const result = getBudgetOverview(db);
      expect(result.areaSummaries).toHaveLength(0);
      expect(result.unassignedSummary).toBeNull();
    });
  });

  // ─── Scenario 2: Orphaned areas (no work items) ───────────────────────────

  describe('Scenario 2 — areas exist but have no work items', () => {
    it('returns one summary per area with all-zero values', () => {
      insertArea({ name: 'Bathroom', sortOrder: 1 });
      insertArea({ name: 'Kitchen', sortOrder: 2 });

      const result = getBudgetOverview(db);

      expect(result.areaSummaries).toHaveLength(2);
      for (const summary of result.areaSummaries) {
        expect(summary.planned).toBe(0);
        expect(summary.actual).toBe(0);
        expect(summary.variance).toBe(0);
      }
    });

    it('orders areas by sortOrder ASC then name ASC', () => {
      insertArea({ name: 'Zebra', sortOrder: 1 });
      insertArea({ name: 'Alpha', sortOrder: 2 });
      insertArea({ name: 'Middle', sortOrder: 1 }); // same sortOrder as Zebra → name ASC

      const result = getBudgetOverview(db);

      // sortOrder=1 first: Middle < Zebra (name ASC). Then Alpha (sortOrder=2).
      expect(result.areaSummaries[0].name).toBe('Middle');
      expect(result.areaSummaries[1].name).toBe('Zebra');
      expect(result.areaSummaries[2].name).toBe('Alpha');
    });

    it('includes required AreaBudgetSummary fields on each node', () => {
      const areaId = insertArea({ name: 'Living Room', sortOrder: 0 });

      const result = getBudgetOverview(db);
      const summary = result.areaSummaries[0];

      expect(summary.areaId).toBe(areaId);
      expect(summary.name).toBe('Living Room');
      expect(summary.parentId).toBeNull();
      expect(typeof summary.planned).toBe('number');
      expect(typeof summary.actual).toBe('number');
      expect(typeof summary.variance).toBe('number');
    });

    it('does not populate unassignedSummary when all work items have areas', () => {
      const areaId = insertArea({ name: 'Office', sortOrder: 0 });
      insertWorkItemWithArea({ areaId, plannedAmount: 1000 });

      const result = getBudgetOverview(db);

      expect(result.unassignedSummary).toBeNull();
    });
  });

  // ─── Scenario 3: Leaf area with direct work items ─────────────────────────

  describe('Scenario 3 — leaf area with direct work items', () => {
    it('computes planned/actual/variance for a single leaf area', () => {
      const areaId = insertArea({ name: 'Bedroom', sortOrder: 0 });
      insertWorkItemWithArea({ areaId, plannedAmount: 5000, actualCost: 3000 });

      const result = getBudgetOverview(db);
      const summary = result.areaSummaries.find((s) => s.areaId === areaId);

      expect(summary).toBeDefined();
      expect(summary!.planned).toBe(5000);
      expect(summary!.actual).toBe(3000);
      expect(summary!.variance).toBe(2000); // 5000 - 3000
    });

    it('sums multiple work items in the same leaf area', () => {
      const areaId = insertArea({ name: 'Garage', sortOrder: 0 });
      insertWorkItemWithArea({ areaId, plannedAmount: 3000, actualCost: 2000 });
      insertWorkItemWithArea({ areaId, plannedAmount: 7000, actualCost: 6500 });

      const result = getBudgetOverview(db);
      const summary = result.areaSummaries.find((s) => s.areaId === areaId);

      expect(summary!.planned).toBe(10000); // 3000 + 7000
      expect(summary!.actual).toBe(8500); // 2000 + 6500
      expect(summary!.variance).toBe(1500); // 10000 - 8500
    });

    it('variance equals planned when no actual costs exist', () => {
      const areaId = insertArea({ name: 'Attic', sortOrder: 0 });
      insertWorkItemWithArea({ areaId, plannedAmount: 4000 });

      const result = getBudgetOverview(db);
      const summary = result.areaSummaries.find((s) => s.areaId === areaId);

      expect(summary!.planned).toBe(4000);
      expect(summary!.actual).toBe(0);
      expect(summary!.variance).toBe(4000);
    });

    it('parent area rolls up totals from its children', () => {
      const parentId = insertArea({ name: 'Ground Floor', sortOrder: 0 });
      const childId = insertArea({ name: 'Hallway', parentId, sortOrder: 0 });

      insertWorkItemWithArea({ areaId: childId, plannedAmount: 2000, actualCost: 1500 });

      const result = getBudgetOverview(db);
      const parent = result.areaSummaries.find((s) => s.areaId === parentId);
      const child = result.areaSummaries.find((s) => s.areaId === childId);

      // Child: direct work item
      expect(child!.planned).toBe(2000);
      expect(child!.actual).toBe(1500);
      expect(child!.variance).toBe(500);

      // Parent: rolls up child's totals
      expect(parent!.planned).toBe(2000);
      expect(parent!.actual).toBe(1500);
      expect(parent!.variance).toBe(500);
    });
  });

  // ─── Scenario 4: Multi-level roll-up ─────────────────────────────────────

  describe('Scenario 4 — multi-level roll-up', () => {
    it('rolls up root → C1 → G1 and root → C2 → G2, G3 with work items at various levels', () => {
      // Tree: root → C1 → G1
      //           → C2 → G2
      //                → G3
      const rootId = insertArea({ name: 'Root', sortOrder: 0 });
      const c1Id = insertArea({ name: 'C1', parentId: rootId, sortOrder: 0 });
      const g1Id = insertArea({ name: 'G1', parentId: c1Id, sortOrder: 0 });
      const c2Id = insertArea({ name: 'C2', parentId: rootId, sortOrder: 1 });
      const g2Id = insertArea({ name: 'G2', parentId: c2Id, sortOrder: 0 });
      const g3Id = insertArea({ name: 'G3', parentId: c2Id, sortOrder: 1 });

      // Work items at various levels
      insertWorkItemWithArea({ areaId: g1Id, plannedAmount: 1000, actualCost: 800 });
      insertWorkItemWithArea({ areaId: c1Id, plannedAmount: 500, actualCost: 500 });
      insertWorkItemWithArea({ areaId: g2Id, plannedAmount: 2000, actualCost: 1000 });
      insertWorkItemWithArea({ areaId: g3Id, plannedAmount: 3000, actualCost: 2500 });
      insertWorkItemWithArea({ areaId: rootId, plannedAmount: 200, actualCost: 100 });

      const result = getBudgetOverview(db);
      const byId = (id: string) => result.areaSummaries.find((s) => s.areaId === id)!;

      // G1: direct only
      expect(byId(g1Id).planned).toBe(1000);
      expect(byId(g1Id).actual).toBe(800);

      // C1: self (500) + G1 subtree (1000)
      expect(byId(c1Id).planned).toBe(1500);
      expect(byId(c1Id).actual).toBe(1300);

      // G2: direct only
      expect(byId(g2Id).planned).toBe(2000);
      expect(byId(g2Id).actual).toBe(1000);

      // G3: direct only
      expect(byId(g3Id).planned).toBe(3000);
      expect(byId(g3Id).actual).toBe(2500);

      // C2: G2 (2000) + G3 (3000) — no direct work items
      expect(byId(c2Id).planned).toBe(5000);
      expect(byId(c2Id).actual).toBe(3500);

      // Root: self (200) + C1 subtree (1500) + C2 subtree (5000)
      expect(byId(rootId).planned).toBe(6700);
      expect(byId(rootId).actual).toBe(4900);
      expect(byId(rootId).variance).toBe(1800); // 6700 - 4900
    });

    it('parentId is set correctly on child nodes', () => {
      const rootId = insertArea({ name: 'Root', sortOrder: 0 });
      const childId = insertArea({ name: 'Child', parentId: rootId, sortOrder: 0 });

      const result = getBudgetOverview(db);
      const child = result.areaSummaries.find((s) => s.areaId === childId)!;
      const root = result.areaSummaries.find((s) => s.areaId === rootId)!;

      expect(child.parentId).toBe(rootId);
      expect(root.parentId).toBeNull();
    });
  });

  // ─── Scenario 5: Quotation invoices excluded from actual ──────────────────

  describe('Scenario 5 — quotation invoices excluded from actual', () => {
    it('actual=0 when only quotation invoices exist for the area work items', () => {
      const areaId = insertArea({ name: 'Sauna', sortOrder: 0 });
      insertWorkItemWithArea({ areaId, plannedAmount: 8000, quotationCost: 7500 });

      const result = getBudgetOverview(db);
      const summary = result.areaSummaries.find((s) => s.areaId === areaId)!;

      expect(summary.planned).toBe(8000);
      expect(summary.actual).toBe(0); // quotation excluded
      expect(summary.variance).toBe(8000);
    });

    it('only non-quotation invoices contribute to actual', () => {
      const areaId = insertArea({ name: 'Pool', sortOrder: 0 });
      // Work item 1: paid invoice (included)
      insertWorkItemWithArea({ areaId, plannedAmount: 5000, actualCost: 4000 });
      // Work item 2: quotation invoice (excluded)
      insertWorkItemWithArea({ areaId, plannedAmount: 3000, quotationCost: 2800 });

      const result = getBudgetOverview(db);
      const summary = result.areaSummaries.find((s) => s.areaId === areaId)!;

      expect(summary.planned).toBe(8000); // 5000 + 3000
      expect(summary.actual).toBe(4000); // only paid included
    });
  });

  // ─── Scenario 6: Work items with no budget lines ─────────────────────────

  describe('Scenario 6 — work items with no budget lines', () => {
    it('area planned=0 when work items have no budget lines (COALESCE)', () => {
      const areaId = insertArea({ name: 'Empty Room', sortOrder: 0 });
      // Insert work item without any budget data
      insertWorkItemWithArea({ areaId }); // no plannedAmount

      const result = getBudgetOverview(db);
      const summary = result.areaSummaries.find((s) => s.areaId === areaId)!;

      expect(summary.planned).toBe(0);
      expect(summary.actual).toBe(0);
      expect(summary.variance).toBe(0);
    });
  });

  // ─── Scenario 7: unassignedSummary null when no null-area items ──────────

  describe('Scenario 7 — unassignedSummary null when no null-area items', () => {
    it('unassignedSummary is null when all work items have an area', () => {
      const areaId = insertArea({ name: 'Study', sortOrder: 0 });
      insertWorkItemWithArea({ areaId, plannedAmount: 2000, actualCost: 1500 });

      const result = getBudgetOverview(db);

      expect(result.unassignedSummary).toBeNull();
    });

    it('unassignedSummary is null when no work items exist at all', () => {
      insertArea({ name: 'Empty Area', sortOrder: 0 });

      const result = getBudgetOverview(db);

      expect(result.unassignedSummary).toBeNull();
    });
  });

  // ─── Scenario 8: unassignedSummary aggregates correctly ──────────────────

  describe('Scenario 8 — unassignedSummary aggregates null-area items', () => {
    it('unassignedSummary aggregates work items with no area', () => {
      insertWorkItemWithArea({ areaId: null, plannedAmount: 3000, actualCost: 2000 });
      insertWorkItemWithArea({ areaId: null, plannedAmount: 1000, actualCost: 900 });

      const result = getBudgetOverview(db);

      expect(result.unassignedSummary).not.toBeNull();
      expect(result.unassignedSummary!.planned).toBe(4000); // 3000 + 1000
      expect(result.unassignedSummary!.actual).toBe(2900); // 2000 + 900
      expect(result.unassignedSummary!.variance).toBe(1100); // 4000 - 2900
    });

    it('unassignedSummary actual includes paid invoices but not quotations', () => {
      // Null-area work item with a paid invoice
      insertWorkItemWithArea({ areaId: null, plannedAmount: 5000, actualCost: 4500 });
      // Null-area work item with a quotation invoice only
      insertWorkItemWithArea({ areaId: null, plannedAmount: 2000, quotationCost: 1800 });

      const result = getBudgetOverview(db);

      expect(result.unassignedSummary).not.toBeNull();
      expect(result.unassignedSummary!.planned).toBe(7000);
      expect(result.unassignedSummary!.actual).toBe(4500); // quotation excluded
      expect(result.unassignedSummary!.variance).toBe(2500);
    });

    it('unassignedSummary has correct structure', () => {
      insertWorkItemWithArea({ areaId: null, plannedAmount: 1000 });

      const result = getBudgetOverview(db);

      expect(result.unassignedSummary).toMatchObject({
        planned: expect.any(Number),
        actual: expect.any(Number),
        variance: expect.any(Number),
      });
    });
  });

  // ─── Scenario 9: Mix of assigned and unassigned items ────────────────────

  describe('Scenario 9 — mix of assigned and unassigned items', () => {
    it('both areaSummaries and unassignedSummary are populated', () => {
      const areaId = insertArea({ name: 'Kitchen', sortOrder: 0 });
      insertWorkItemWithArea({ areaId, plannedAmount: 10000, actualCost: 8000 });
      insertWorkItemWithArea({ areaId: null, plannedAmount: 2000, actualCost: 1500 });

      const result = getBudgetOverview(db);

      // area summary
      const areaSummary = result.areaSummaries.find((s) => s.areaId === areaId)!;
      expect(areaSummary.planned).toBe(10000);
      expect(areaSummary.actual).toBe(8000);

      // unassigned summary
      expect(result.unassignedSummary).not.toBeNull();
      expect(result.unassignedSummary!.planned).toBe(2000);
      expect(result.unassignedSummary!.actual).toBe(1500);
    });

    it('area summaries do not include unassigned items', () => {
      const areaId = insertArea({ name: 'Bathroom', sortOrder: 0 });
      insertWorkItemWithArea({ areaId, plannedAmount: 5000 });
      insertWorkItemWithArea({ areaId: null, plannedAmount: 3000 }); // should NOT appear in area

      const result = getBudgetOverview(db);
      const areaSummary = result.areaSummaries.find((s) => s.areaId === areaId)!;

      // Area summary should only reflect the assigned work item
      expect(areaSummary.planned).toBe(5000);
    });

    it('unassigned summary is not affected by area-assigned items', () => {
      const areaId = insertArea({ name: 'Garden', sortOrder: 0 });
      insertWorkItemWithArea({ areaId, plannedAmount: 8000, actualCost: 7000 });
      insertWorkItemWithArea({ areaId: null, plannedAmount: 1000, actualCost: 900 });

      const result = getBudgetOverview(db);

      // unassigned should only total the null-area item
      expect(result.unassignedSummary!.planned).toBe(1000);
      expect(result.unassignedSummary!.actual).toBe(900);
    });
  });

  // ─── Scenario 10: Endpoint shape integration ──────────────────────────────

  describe('Scenario 10 — areaSummaries shape and ordering', () => {
    it('every AreaBudgetSummary has all required fields', () => {
      const parentId = insertArea({ name: 'Floor 1', sortOrder: 0 });
      const childId = insertArea({ name: 'Room A', parentId, sortOrder: 0 });
      insertWorkItemWithArea({ areaId: childId, plannedAmount: 1000, actualCost: 800 });

      const result = getBudgetOverview(db);

      for (const s of result.areaSummaries) {
        expect(typeof s.areaId).toBe('string');
        expect(typeof s.name).toBe('string');
        // parentId can be string or null
        expect(s.parentId === null || typeof s.parentId === 'string').toBe(true);
        expect(typeof s.planned).toBe('number');
        expect(typeof s.actual).toBe('number');
        expect(typeof s.variance).toBe('number');
        // variance = planned - actual
        expect(s.variance).toBeCloseTo(s.planned - s.actual, 5);
      }
    });

    it('areaSummaries ordering: sortOrder ASC, name ASC', () => {
      insertArea({ name: 'Cellar', sortOrder: 10 });
      insertArea({ name: 'Attic', sortOrder: 10 }); // same sortOrder → name 'Attic' < 'Cellar'
      insertArea({ name: 'Ground Floor', sortOrder: 5 });

      const result = getBudgetOverview(db);
      const names = result.areaSummaries.map((s) => s.name);

      // sortOrder=5 first, then sortOrder=10 names alphabetically
      expect(names[0]).toBe('Ground Floor');
      expect(names[1]).toBe('Attic');
      expect(names[2]).toBe('Cellar');
    });

    it('areaSummaries is an array', () => {
      const result = getBudgetOverview(db);
      expect(Array.isArray(result.areaSummaries)).toBe(true);
    });
  });

  // ─── Scenario 11: Negative variance (over-budget) ─────────────────────────

  describe('Scenario 11 — negative variance (over-budget)', () => {
    it('variance is negative when actual exceeds planned', () => {
      const areaId = insertArea({ name: 'Extension', sortOrder: 0 });
      insertWorkItemWithArea({ areaId, plannedAmount: 5000, actualCost: 5050 });

      const result = getBudgetOverview(db);
      const summary = result.areaSummaries.find((s) => s.areaId === areaId)!;

      expect(summary.planned).toBe(5000);
      expect(summary.actual).toBe(5050);
      expect(summary.variance).toBe(-50); // planned - actual = 5000 - 5050 = -50
    });

    it('negative variance propagates up through parent roll-up', () => {
      const parentId = insertArea({ name: 'Whole House', sortOrder: 0 });
      const childId = insertArea({ name: 'Extension', parentId, sortOrder: 0 });
      insertWorkItemWithArea({ areaId: childId, plannedAmount: 5000, actualCost: 5050 });
      insertWorkItemWithArea({ areaId: parentId, plannedAmount: 1000, actualCost: 1000 });

      const result = getBudgetOverview(db);
      const parent = result.areaSummaries.find((s) => s.areaId === parentId)!;
      const child = result.areaSummaries.find((s) => s.areaId === childId)!;

      expect(child.variance).toBe(-50);
      // Parent: (5000 + 1000) - (5050 + 1000) = 6000 - 6050 = -50
      expect(parent.variance).toBe(-50);
    });
  });

  // ─── Additional edge cases ────────────────────────────────────────────────

  describe('additional edge cases', () => {
    it('areaSummaries is empty array (not null/undefined) when no areas exist', () => {
      const result = getBudgetOverview(db);
      expect(result.areaSummaries).toEqual([]);
    });

    it('deep subtree: 4 levels roll up correctly', () => {
      const l1 = insertArea({ name: 'L1', sortOrder: 0 });
      const l2 = insertArea({ name: 'L2', parentId: l1, sortOrder: 0 });
      const l3 = insertArea({ name: 'L3', parentId: l2, sortOrder: 0 });
      const l4 = insertArea({ name: 'L4', parentId: l3, sortOrder: 0 });

      // Work item only at deepest level
      insertWorkItemWithArea({ areaId: l4, plannedAmount: 100, actualCost: 80 });

      const result = getBudgetOverview(db);
      const byId = (id: string) => result.areaSummaries.find((s) => s.areaId === id)!;

      expect(byId(l4).planned).toBe(100);
      expect(byId(l3).planned).toBe(100); // rolls up from l4
      expect(byId(l2).planned).toBe(100); // rolls up from l3 → l4
      expect(byId(l1).planned).toBe(100); // rolls up from l2 → l3 → l4
    });

    it('work item with no budget lines contributes 0 to area totals (COALESCE)', () => {
      const areaId = insertArea({ name: 'Closet', sortOrder: 0 });
      // No budget line inserted for this work item
      const wiId = `wi-bare-${idCounter++}`;
      const ts = now();
      db.insert(schema.workItems)
        .values({
          id: wiId,
          title: 'Bare WI',
          status: 'not_started',
          areaId,
          createdAt: ts,
          updatedAt: ts,
        })
        .run();

      const result = getBudgetOverview(db);
      const summary = result.areaSummaries.find((s) => s.areaId === areaId)!;

      expect(summary.planned).toBe(0);
      expect(summary.actual).toBe(0);
    });

    it('unassignedSummary variance = planned - actual', () => {
      insertWorkItemWithArea({ areaId: null, plannedAmount: 6000, actualCost: 4000 });

      const result = getBudgetOverview(db);

      expect(result.unassignedSummary!.variance).toBe(2000);
    });
  });
});
