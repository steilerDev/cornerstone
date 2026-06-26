import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { runMigrations } from '../db/migrate.js';
import * as schema from '../db/schema.js';
import { getBudgetBreakdown } from './budgetBreakdownService.js';

/**
 * Tests for deposit-aware actualCostPaid / actualCostPending rollup
 * on BreakdownBudgetLine, BreakdownWorkItem, BreakdownArea, BreakdownTotals,
 * and BudgetSourceSummaryBreakdown.
 *
 * Scenarios 1-11 from Issue #1786 acceptance criteria.
 */
describe('getBudgetBreakdown — actualCostPaid / actualCostPending rollup', () => {
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

  function insertTestUser(userId = 'user-test-001') {
    const now = new Date().toISOString();
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

  /**
   * Insert a work item + budget line. Optionally create an invoice with a
   * configurable status and link it to the budget line.
   *
   * Returns { workItemId, budgetLineId, invoiceId } — invoiceId is null when
   * no invoice is created.
   */
  function insertWorkItemWithInvoice(
    opts: {
      title?: string;
      plannedAmount?: number;
      invoiceAmount?: number;
      invoiceStatus?: 'paid' | 'claimed' | 'pending' | 'quotation';
      budgetSourceId?: string | null;
    } = {},
  ): { workItemId: string; budgetLineId: string; invoiceId: string | null } {
    const id = `wi-paid-${idCounter++}`;
    const budgetId = `bud-paid-${idCounter++}`;
    const now = new Date().toISOString();

    db.insert(schema.workItems)
      .values({
        id,
        title: opts.title ?? `Work Item ${id}`,
        status: 'not_started',
        createdAt: now,
        updatedAt: now,
      })
      .run();

    db.insert(schema.workItemBudgets)
      .values({
        id: budgetId,
        workItemId: id,
        plannedAmount: opts.plannedAmount ?? 1000,
        confidence: 'own_estimate',
        budgetCategoryId: null,
        budgetSourceId: opts.budgetSourceId ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    let invoiceId: string | null = null;

    if (opts.invoiceStatus != null && opts.invoiceAmount != null) {
      const vendorId = `vendor-paid-${idCounter++}`;
      invoiceId = `inv-paid-${idCounter++}`;

      db.insert(schema.vendors)
        .values({ id: vendorId, name: `Vendor ${vendorId}`, createdAt: now, updatedAt: now })
        .run();

      db.insert(schema.invoices)
        .values({
          id: invoiceId,
          vendorId,
          amount: opts.invoiceAmount,
          date: '2026-01-01',
          status: opts.invoiceStatus,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      db.insert(schema.invoiceBudgetLines)
        .values({
          id: randomUUID(),
          invoiceId,
          workItemBudgetId: budgetId,
          itemizedAmount: opts.invoiceAmount,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    }

    return { workItemId: id, budgetLineId: budgetId, invoiceId };
  }

  /**
   * Insert a household item + budget line. Optionally create an invoice with
   * a configurable status and link it to the budget line.
   */
  function insertHouseholdItemWithInvoice(
    opts: {
      name?: string;
      plannedAmount?: number;
      invoiceAmount?: number;
      invoiceStatus?: 'paid' | 'claimed' | 'pending' | 'quotation';
      budgetSourceId?: string | null;
    } = {},
  ): { householdItemId: string; budgetLineId: string; invoiceId: string | null } {
    const id = `hi-paid-${idCounter++}`;
    const budgetId = `hibud-paid-${idCounter++}`;
    const now = new Date().toISOString();

    db.insert(schema.householdItems)
      .values({
        id,
        name: opts.name ?? `Household Item ${id}`,
        categoryId: 'hic-furniture',
        status: 'planned',
        quantity: 1,
        isLate: false,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    db.insert(schema.householdItemBudgets)
      .values({
        id: budgetId,
        householdItemId: id,
        plannedAmount: opts.plannedAmount ?? 500,
        confidence: 'own_estimate',
        budgetCategoryId: null,
        budgetSourceId: opts.budgetSourceId ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    let invoiceId: string | null = null;

    if (opts.invoiceStatus != null && opts.invoiceAmount != null) {
      const vendorId = `vendor-hi-paid-${idCounter++}`;
      invoiceId = `inv-hi-paid-${idCounter++}`;

      db.insert(schema.vendors)
        .values({ id: vendorId, name: `Vendor ${vendorId}`, createdAt: now, updatedAt: now })
        .run();

      db.insert(schema.invoices)
        .values({
          id: invoiceId,
          vendorId,
          amount: opts.invoiceAmount,
          date: '2026-01-01',
          status: opts.invoiceStatus,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      db.insert(schema.invoiceBudgetLines)
        .values({
          id: randomUUID(),
          invoiceId,
          householdItemBudgetId: budgetId,
          itemizedAmount: opts.invoiceAmount,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    }

    return { householdItemId: id, budgetLineId: budgetId, invoiceId };
  }

  /**
   * Insert a deposit against an existing invoice. Returns the deposit ID.
   * dueDate is required by the schema (NOT NULL).
   */
  function insertDeposit(opts: {
    invoiceId: string;
    amount: number;
    status: 'pending' | 'paid' | 'claimed';
  }): string {
    const depositId = `dep-test-${idCounter++}`;
    const now = new Date().toISOString();
    db.insert(schema.invoiceDeposits)
      .values({
        id: depositId,
        invoiceId: opts.invoiceId,
        amount: opts.amount,
        dueDate: '2026-02-01',
        paidDate: opts.status === 'paid' ? '2026-02-10' : null,
        claimedDate: opts.status === 'claimed' ? '2026-02-15' : null,
        description: null,
        status: opts.status,
        createdBy: 'user-test-001',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return depositId;
  }

  /**
   * Insert a budget source.
   */
  function insertBudgetSource(opts: { name?: string; totalAmount?: number } = {}): string {
    const id = `src-paid-${idCounter++}`;
    const now = new Date().toISOString();
    db.insert(schema.budgetSources)
      .values({
        id,
        name: opts.name ?? `Budget Source ${id}`,
        sourceType: 'bank_loan',
        totalAmount: opts.totalAmount ?? 100000,
        status: 'active',
        isDiscretionary: false,
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
    idCounter = 0;
    insertTestUser();
  });

  afterEach(() => {
    sqlite.close();
  });

  // ── Scenario 1: Non-invoiced budget line ─────────────────────────────────────

  describe('Scenario 1 — non-invoiced budget line', () => {
    it('actualCostPaid=0 and actualCostPending=0 at line, item, area, and totals level', () => {
      insertWorkItemWithInvoice({ plannedAmount: 1000 }); // no invoice

      const result = getBudgetBreakdown(db);

      // Line level
      const area = result.workItems.areas[0]!;
      const item = area.items[0]!;
      const line = item.budgetLines[0]!;
      expect(line.actualCostPaid).toBe(0);
      expect(line.actualCostPending).toBe(0);

      // Item level
      expect(item.actualCostPaid).toBe(0);
      expect(item.actualCostPending).toBe(0);

      // Area level
      expect(area.actualCostPaid).toBe(0);
      expect(area.actualCostPending).toBe(0);

      // Totals level
      expect(result.workItems.totals.actualCostPaid).toBe(0);
      expect(result.workItems.totals.actualCostPending).toBe(0);
    });
  });

  // ── Scenario 2: Paid invoice ─────────────────────────────────────────────────

  describe('Scenario 2 — paid invoice (status=paid)', () => {
    it('actualCostPaid equals the invoiced amount and actualCostPending=0', () => {
      insertWorkItemWithInvoice({
        plannedAmount: 1000,
        invoiceAmount: 500,
        invoiceStatus: 'paid',
      });

      const result = getBudgetBreakdown(db);

      const item = result.workItems.areas[0]!.items[0]!;
      const line = item.budgetLines[0]!;

      expect(line.actualCost).toBe(500);
      expect(line.actualCostPaid).toBe(500);
      expect(line.actualCostPending).toBe(0);

      expect(item.actualCostPaid).toBe(500);
      expect(item.actualCostPending).toBe(0);

      expect(result.workItems.totals.actualCostPaid).toBe(500);
      expect(result.workItems.totals.actualCostPending).toBe(0);
    });
  });

  // ── Scenario 3: Claimed invoice ──────────────────────────────────────────────

  describe('Scenario 3 — claimed invoice (status=claimed)', () => {
    it('actualCostPaid equals the invoiced amount and actualCostPending=0', () => {
      insertWorkItemWithInvoice({
        plannedAmount: 1000,
        invoiceAmount: 750,
        invoiceStatus: 'claimed',
      });

      const result = getBudgetBreakdown(db);

      const item = result.workItems.areas[0]!.items[0]!;
      const line = item.budgetLines[0]!;

      expect(line.actualCost).toBe(750);
      expect(line.actualCostPaid).toBe(750);
      expect(line.actualCostPending).toBe(0);

      expect(item.actualCostPaid).toBe(750);
      expect(item.actualCostPending).toBe(0);
    });
  });

  // ── Scenario 4: Pending invoice ──────────────────────────────────────────────

  describe('Scenario 4 — pending invoice (status=pending)', () => {
    it('actualCostPaid=0 and actualCostPending equals the invoiced amount', () => {
      insertWorkItemWithInvoice({
        plannedAmount: 1000,
        invoiceAmount: 600,
        invoiceStatus: 'pending',
      });

      const result = getBudgetBreakdown(db);

      const item = result.workItems.areas[0]!.items[0]!;
      const line = item.budgetLines[0]!;

      expect(line.actualCost).toBe(600);
      expect(line.actualCostPaid).toBe(0);
      expect(line.actualCostPending).toBe(600);

      expect(item.actualCostPaid).toBe(0);
      expect(item.actualCostPending).toBe(600);

      expect(result.workItems.totals.actualCostPaid).toBe(0);
      expect(result.workItems.totals.actualCostPending).toBe(600);
    });
  });

  // ── Scenario 5: Deposit-aware split ──────────────────────────────────────────

  describe('Scenario 5 — invoice with a paid deposit', () => {
    it('splits actualCostPaid/Pending proportionally by deposit fraction', () => {
      // Invoice: amount=1000, status='pending'
      // Deposit: amount=300, status='paid'
      // Deposit fraction = 300/1000 = 0.3 → paid
      // Residual fraction = 700/1000 = 0.7 → under 'pending' → not paid
      // itemized_amount = 1000
      // actualCostPaid = 1000 * 0.3 = 300
      // actualCostPending = 1000 - 300 = 700
      const { invoiceId } = insertWorkItemWithInvoice({
        plannedAmount: 1000,
        invoiceAmount: 1000,
        invoiceStatus: 'pending',
      });

      insertDeposit({ invoiceId: invoiceId!, amount: 300, status: 'paid' });

      const result = getBudgetBreakdown(db);

      const line = result.workItems.areas[0]!.items[0]!.budgetLines[0]!;
      expect(line.actualCost).toBe(1000);
      expect(line.actualCostPaid).toBeCloseTo(300, 5);
      expect(line.actualCostPending).toBeCloseTo(700, 5);

      expect(result.workItems.totals.actualCostPaid).toBeCloseTo(300, 5);
      expect(result.workItems.totals.actualCostPending).toBeCloseTo(700, 5);
    });

    it('deposit with claimed status also contributes to actualCostPaid', () => {
      // Invoice: amount=800, status='pending'
      // Deposit: amount=200, status='claimed'
      // actualCostPaid = 800 * (200/800) = 200
      // actualCostPending = 800 - 200 = 600
      const { invoiceId } = insertWorkItemWithInvoice({
        plannedAmount: 1000,
        invoiceAmount: 800,
        invoiceStatus: 'pending',
      });

      insertDeposit({ invoiceId: invoiceId!, amount: 200, status: 'claimed' });

      const result = getBudgetBreakdown(db);

      const line = result.workItems.areas[0]!.items[0]!.budgetLines[0]!;
      expect(line.actualCostPaid).toBeCloseTo(200, 5);
      expect(line.actualCostPending).toBeCloseTo(600, 5);
    });
  });

  // ── Scenario 6: Item-level rollup (two budget lines) ─────────────────────────

  describe('Scenario 6 — item-level rollup across two budget lines', () => {
    it('sums actualCostPaid and actualCostPending across budget lines on the same work item', () => {
      // WI budget line 1: paid invoice for 400
      // WI budget line 2: pending invoice for 200
      // Expected item totals: actualCostPaid=400, actualCostPending=200
      const id = `wi-rollup-${idCounter++}`;
      const now = new Date().toISOString();

      db.insert(schema.workItems)
        .values({
          id,
          title: 'Rollup Work Item',
          status: 'not_started',
          createdAt: now,
          updatedAt: now,
        })
        .run();

      // Budget line 1 — paid invoice for 400
      const budgetId1 = `bud-rollup1-${idCounter++}`;
      db.insert(schema.workItemBudgets)
        .values({
          id: budgetId1,
          workItemId: id,
          plannedAmount: 500,
          confidence: 'own_estimate',
          budgetCategoryId: null,
          budgetSourceId: null,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      const vendorId1 = `vendor-rollup1-${idCounter++}`;
      const invoiceId1 = `inv-rollup1-${idCounter++}`;
      db.insert(schema.vendors)
        .values({ id: vendorId1, name: 'V1', createdAt: now, updatedAt: now })
        .run();
      db.insert(schema.invoices)
        .values({
          id: invoiceId1,
          vendorId: vendorId1,
          amount: 400,
          date: '2026-01-01',
          status: 'paid',
          createdAt: now,
          updatedAt: now,
        })
        .run();
      db.insert(schema.invoiceBudgetLines)
        .values({
          id: randomUUID(),
          invoiceId: invoiceId1,
          workItemBudgetId: budgetId1,
          itemizedAmount: 400,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      // Budget line 2 — pending invoice for 200
      const budgetId2 = `bud-rollup2-${idCounter++}`;
      db.insert(schema.workItemBudgets)
        .values({
          id: budgetId2,
          workItemId: id,
          plannedAmount: 300,
          confidence: 'own_estimate',
          budgetCategoryId: null,
          budgetSourceId: null,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      const vendorId2 = `vendor-rollup2-${idCounter++}`;
      const invoiceId2 = `inv-rollup2-${idCounter++}`;
      db.insert(schema.vendors)
        .values({ id: vendorId2, name: 'V2', createdAt: now, updatedAt: now })
        .run();
      db.insert(schema.invoices)
        .values({
          id: invoiceId2,
          vendorId: vendorId2,
          amount: 200,
          date: '2026-01-01',
          status: 'pending',
          createdAt: now,
          updatedAt: now,
        })
        .run();
      db.insert(schema.invoiceBudgetLines)
        .values({
          id: randomUUID(),
          invoiceId: invoiceId2,
          workItemBudgetId: budgetId2,
          itemizedAmount: 200,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      const result = getBudgetBreakdown(db);

      const area = result.workItems.areas[0]!;
      const item = area.items[0]!;
      expect(item.actualCost).toBe(600);
      expect(item.actualCostPaid).toBe(400);
      expect(item.actualCostPending).toBe(200);
    });
  });

  // ── Scenario 7: Area-level rollup ────────────────────────────────────────────

  describe('Scenario 7 — area-level rollup across two work items', () => {
    it('sums actualCostPaid and actualCostPending across multiple work items in the same area', () => {
      // WI 1: paid invoice for 600
      // WI 2: pending invoice for 300
      // Expected area totals: actualCostPaid=600, actualCostPending=300
      insertWorkItemWithInvoice({ plannedAmount: 1000, invoiceAmount: 600, invoiceStatus: 'paid' });
      insertWorkItemWithInvoice({
        plannedAmount: 1000,
        invoiceAmount: 300,
        invoiceStatus: 'pending',
      });

      const result = getBudgetBreakdown(db);

      // Both WIs land in the Unassigned area (null areaId)
      const area = result.workItems.areas[0]!;
      expect(area.actualCostPaid).toBe(600);
      expect(area.actualCostPending).toBe(300);
    });
  });

  // ── Scenario 8: Global totals rollup ─────────────────────────────────────────

  describe('Scenario 8 — global totals rollup (WI + HI)', () => {
    it('workItems and householdItems totals each independently track actualCostPaid and actualCostPending', () => {
      // WI: claimed invoice for 1000
      insertWorkItemWithInvoice({
        plannedAmount: 1500,
        invoiceAmount: 1000,
        invoiceStatus: 'claimed',
      });
      // HI: pending invoice for 400
      insertHouseholdItemWithInvoice({
        plannedAmount: 600,
        invoiceAmount: 400,
        invoiceStatus: 'pending',
      });

      const result = getBudgetBreakdown(db);

      expect(result.workItems.totals.actualCostPaid).toBe(1000);
      expect(result.workItems.totals.actualCostPending).toBe(0);

      expect(result.householdItems.totals.actualCostPaid).toBe(0);
      expect(result.householdItems.totals.actualCostPending).toBe(400);
    });
  });

  // ── Scenario 9: Per-source actualCostPaid / actualCostPending ────────────────

  describe('Scenario 9 — per-source actualCostPaid and actualCostPending in budgetSources', () => {
    it('budgetSources entry reflects actualCostPaid and actualCostPending for lines assigned to that source', () => {
      const srcId = insertBudgetSource({ name: 'Savings', totalAmount: 100000 });

      // WI with a paid invoice assigned to the source
      insertWorkItemWithInvoice({
        plannedAmount: 1000,
        invoiceAmount: 800,
        invoiceStatus: 'paid',
        budgetSourceId: srcId,
      });

      const result = getBudgetBreakdown(db);

      const sourceSummary = result.budgetSources.find((s) => s.id === srcId);
      expect(sourceSummary).toBeDefined();
      expect(sourceSummary!.actualCost).toBe(800);
      expect(sourceSummary!.actualCostPaid).toBe(800);
      expect(sourceSummary!.actualCostPending).toBe(0);
    });

    it('budgetSources entry for pending invoice shows actualCostPaid=0 and actualCostPending=amount', () => {
      const srcId = insertBudgetSource({ name: 'Loan', totalAmount: 200000 });

      insertWorkItemWithInvoice({
        plannedAmount: 1000,
        invoiceAmount: 500,
        invoiceStatus: 'pending',
        budgetSourceId: srcId,
      });

      const result = getBudgetBreakdown(db);

      const sourceSummary = result.budgetSources.find((s) => s.id === srcId);
      expect(sourceSummary).toBeDefined();
      expect(sourceSummary!.actualCost).toBe(500);
      expect(sourceSummary!.actualCostPaid).toBe(0);
      expect(sourceSummary!.actualCostPending).toBe(500);
    });
  });

  // ── Scenario 10: Deselected source — budgetSources always unfiltered ──────────

  describe('Scenario 10 — deselected source still shows full actualCostPaid in budgetSources', () => {
    it('deselecting a source via filter removes it from workItems breakdown but budgetSources remains unfiltered', () => {
      const srcId = insertBudgetSource({ name: 'Filtered Source', totalAmount: 50000 });

      insertWorkItemWithInvoice({
        plannedAmount: 1000,
        invoiceAmount: 700,
        invoiceStatus: 'paid',
        budgetSourceId: srcId,
      });

      // Deselect the source by passing its id in the filter
      const result = getBudgetBreakdown(db, new Set([srcId]));

      // workItems areas should be empty (source is filtered out)
      expect(result.workItems.areas).toHaveLength(0);
      expect(result.workItems.totals.actualCostPaid).toBe(0);

      // budgetSources is always unfiltered — still shows the paid amount
      const sourceSummary = result.budgetSources.find((s) => s.id === srcId);
      expect(sourceSummary).toBeDefined();
      expect(sourceSummary!.actualCostPaid).toBe(700);
      expect(sourceSummary!.actualCostPending).toBe(0);
    });
  });

  // ── Scenario 11: Household item — pending invoice ────────────────────────────

  describe('Scenario 11 — household item with pending invoice', () => {
    it('actualCostPaid=0 and actualCostPending equals the invoiced amount on HI breakdown', () => {
      insertHouseholdItemWithInvoice({
        plannedAmount: 500,
        invoiceAmount: 350,
        invoiceStatus: 'pending',
      });

      const result = getBudgetBreakdown(db);

      expect(result.householdItems.areas).toHaveLength(1);
      const area = result.householdItems.areas[0]!;
      const item = area.items[0]!;
      const line = item.budgetLines[0]!;

      expect(line.actualCost).toBe(350);
      expect(line.actualCostPaid).toBe(0);
      expect(line.actualCostPending).toBe(350);

      expect(item.actualCostPaid).toBe(0);
      expect(item.actualCostPending).toBe(350);

      expect(area.actualCostPaid).toBe(0);
      expect(area.actualCostPending).toBe(350);

      expect(result.householdItems.totals.actualCostPaid).toBe(0);
      expect(result.householdItems.totals.actualCostPending).toBe(350);
    });
  });
});
