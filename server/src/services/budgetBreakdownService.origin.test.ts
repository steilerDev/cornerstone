/**
 * Integration tests for the `origin` field on BreakdownBudgetLine.
 *
 * Story #1551 — Discretionary funding source: the budgetBreakdownService now
 * selects wib.origin / hib.origin and surfaces it on each BreakdownBudgetLine.
 *
 * Test strategy: use buildApp() + schema inserts (same pattern as
 * budgetOverview.breakdown.test.ts) so we exercise the full SQL query +
 * service logic path via the real API endpoint.
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../app.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import type { FastifyInstance } from 'fastify';
import type { BudgetBreakdownResponse } from '@cornerstone/shared';
import * as schema from '../db/schema.js';

describe('budgetBreakdownService — origin field on budget lines', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;
  let idCounter = 0;

  beforeEach(async () => {
    originalEnv = { ...process.env };

    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-breakdown-origin-test-'));
    process.env.DATABASE_URL = join(tempDir, 'test.db');
    process.env.SECURE_COOKIES = 'false';

    app = await buildApp();
    idCounter = 0;
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
    process.env = originalEnv;
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  // ─── helpers ─────────────────────────────────────────────────────────────────

  async function createUserWithSession(): Promise<{ cookie: string }> {
    const email = `user-${idCounter++}@example.com`;
    const user = await userService.createLocalUser(app.db, email, 'Test User', 'password', 'member');
    const token = sessionService.createSession(app.db, user.id, 3600);
    return { cookie: `cornerstone_session=${token}` };
  }

  /**
   * Insert a work item with one budget line, specifying `origin` explicitly.
   * Returns the budget-line id so tests can look it up in the response.
   */
  function insertWorkItemLine(opts: {
    origin: 'manual' | 'auto';
    budgetSourceId?: string | null;
    plannedAmount?: number;
  }): { budgetLineId: string } {
    const now = new Date().toISOString();
    const wiId = `wi-origin-${idCounter++}`;
    const lineId = `wib-origin-${idCounter++}`;

    app.db
      .insert(schema.workItems)
      .values({
        id: wiId,
        title: `WI ${wiId}`,
        status: 'not_started',
        createdAt: now,
        updatedAt: now,
      })
      .run();

    app.db
      .insert(schema.workItemBudgets)
      .values({
        id: lineId,
        workItemId: wiId,
        plannedAmount: opts.plannedAmount ?? 1000,
        confidence: 'own_estimate',
        budgetCategoryId: null,
        budgetSourceId: opts.budgetSourceId ?? null,
        origin: opts.origin,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    return { budgetLineId: lineId };
  }

  /**
   * Insert a household item with one budget line, specifying `origin` explicitly.
   */
  function insertHouseholdItemLine(opts: {
    origin: 'manual' | 'auto';
    budgetSourceId?: string | null;
    plannedAmount?: number;
  }): { budgetLineId: string } {
    const now = new Date().toISOString();
    const hiId = `hi-origin-${idCounter++}`;
    const lineId = `hib-origin-${idCounter++}`;

    app.db
      .insert(schema.householdItems)
      .values({
        id: hiId,
        name: `HI ${hiId}`,
        categoryId: 'hic-furniture',
        status: 'planned',
        quantity: 1,
        isLate: false,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    app.db
      .insert(schema.householdItemBudgets)
      .values({
        id: lineId,
        householdItemId: hiId,
        plannedAmount: opts.plannedAmount ?? 500,
        confidence: 'own_estimate',
        budgetCategoryId: null,
        budgetSourceId: opts.budgetSourceId ?? null,
        origin: opts.origin,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    return { budgetLineId: lineId };
  }

  /**
   * Fetch the breakdown via the API and return the first WI budget line found.
   */
  async function fetchFirstWIBudgetLine(
    cookie: string,
    deselectedSources?: string,
  ) {
    const url = deselectedSources
      ? `/api/budget/breakdown?deselectedSources=${encodeURIComponent(deselectedSources)}`
      : '/api/budget/breakdown';

    const response = await app.inject({ method: 'GET', url, headers: { cookie } });
    expect(response.statusCode).toBe(200);
    const { breakdown } = response.json<BudgetBreakdownResponse>();
    const firstArea = breakdown.workItems.areas[0];
    const firstItem = firstArea?.items[0];
    return firstItem?.budgetLines[0] ?? null;
  }

  /**
   * Fetch the breakdown via the API and return the first HI budget line found.
   */
  async function fetchFirstHIBudgetLine(
    cookie: string,
    deselectedSources?: string,
  ) {
    const url = deselectedSources
      ? `/api/budget/breakdown?deselectedSources=${encodeURIComponent(deselectedSources)}`
      : '/api/budget/breakdown';

    const response = await app.inject({ method: 'GET', url, headers: { cookie } });
    expect(response.statusCode).toBe(200);
    const { breakdown } = response.json<BudgetBreakdownResponse>();
    const firstArea = breakdown.householdItems.areas[0];
    const firstItem = firstArea?.items[0];
    return firstItem?.budgetLines[0] ?? null;
  }

  // ─── WI origin field ──────────────────────────────────────────────────────────

  it("WI line with origin='auto' surfaces origin:'auto' in the breakdown response", async () => {
    const { cookie } = await createUserWithSession();
    insertWorkItemLine({ origin: 'auto' });

    const line = await fetchFirstWIBudgetLine(cookie);
    expect(line).not.toBeNull();
    expect(line!.origin).toBe('auto');
  });

  it("WI line with origin='manual' (DB default) surfaces origin:'manual' in the breakdown response", async () => {
    const { cookie } = await createUserWithSession();
    insertWorkItemLine({ origin: 'manual' });

    const line = await fetchFirstWIBudgetLine(cookie);
    expect(line).not.toBeNull();
    expect(line!.origin).toBe('manual');
  });

  // ─── HI origin field ──────────────────────────────────────────────────────────

  it("HI line with origin='auto' surfaces origin:'auto' in the breakdown response", async () => {
    const { cookie } = await createUserWithSession();
    insertHouseholdItemLine({ origin: 'auto' });

    const line = await fetchFirstHIBudgetLine(cookie);
    expect(line).not.toBeNull();
    expect(line!.origin).toBe('auto');
  });

  it("HI line with origin='manual' (DB default) surfaces origin:'manual' in the breakdown response", async () => {
    const { cookie } = await createUserWithSession();
    insertHouseholdItemLine({ origin: 'manual' });

    const line = await fetchFirstHIBudgetLine(cookie);
    expect(line).not.toBeNull();
    expect(line!.origin).toBe('manual');
  });

  // ─── Mixed origins on the same work item ─────────────────────────────────────

  it('two WI lines on the same work item return independent origin values (auto + manual)', async () => {
    const { cookie } = await createUserWithSession();

    const now = new Date().toISOString();
    const wiId = `wi-mixed-${idCounter++}`;
    const lineAutoId = `wib-mixed-auto-${idCounter++}`;
    const lineManualId = `wib-mixed-manual-${idCounter++}`;

    app.db
      .insert(schema.workItems)
      .values({ id: wiId, title: `Mixed WI`, status: 'not_started', createdAt: now, updatedAt: now })
      .run();

    app.db
      .insert(schema.workItemBudgets)
      .values({
        id: lineAutoId,
        workItemId: wiId,
        plannedAmount: 800,
        confidence: 'own_estimate',
        budgetCategoryId: null,
        budgetSourceId: null,
        origin: 'auto',
        createdAt: now,
        updatedAt: now,
      })
      .run();

    app.db
      .insert(schema.workItemBudgets)
      .values({
        id: lineManualId,
        workItemId: wiId,
        plannedAmount: 400,
        confidence: 'own_estimate',
        budgetCategoryId: null,
        budgetSourceId: null,
        origin: 'manual',
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const response = await app.inject({
      method: 'GET',
      url: '/api/budget/breakdown',
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    const { breakdown } = response.json<BudgetBreakdownResponse>();

    const lines = breakdown.workItems.areas[0]?.items[0]?.budgetLines ?? [];
    expect(lines).toHaveLength(2);

    const autoLine = lines.find((l) => l.id === lineAutoId);
    const manualLine = lines.find((l) => l.id === lineManualId);

    expect(autoLine).toBeDefined();
    expect(autoLine!.origin).toBe('auto');
    expect(manualLine).toBeDefined();
    expect(manualLine!.origin).toBe('manual');
  });

  it('mixed HI lines on the same item return independent origin values', async () => {
    const { cookie } = await createUserWithSession();

    const now = new Date().toISOString();
    const hiId = `hi-mixed-${idCounter++}`;
    const lineAutoId = `hib-mixed-auto-${idCounter++}`;
    const lineManualId = `hib-mixed-manual-${idCounter++}`;

    app.db
      .insert(schema.householdItems)
      .values({
        id: hiId,
        name: 'Mixed HI',
        categoryId: 'hic-furniture',
        status: 'planned',
        quantity: 1,
        isLate: false,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    app.db
      .insert(schema.householdItemBudgets)
      .values({
        id: lineAutoId,
        householdItemId: hiId,
        plannedAmount: 300,
        confidence: 'own_estimate',
        budgetCategoryId: null,
        budgetSourceId: null,
        origin: 'auto',
        createdAt: now,
        updatedAt: now,
      })
      .run();

    app.db
      .insert(schema.householdItemBudgets)
      .values({
        id: lineManualId,
        householdItemId: hiId,
        plannedAmount: 200,
        confidence: 'own_estimate',
        budgetCategoryId: null,
        budgetSourceId: null,
        origin: 'manual',
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const response = await app.inject({
      method: 'GET',
      url: '/api/budget/breakdown',
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    const { breakdown } = response.json<BudgetBreakdownResponse>();

    const lines = breakdown.householdItems.areas[0]?.items[0]?.budgetLines ?? [];
    expect(lines).toHaveLength(2);

    const autoLine = lines.find((l) => l.id === lineAutoId);
    const manualLine = lines.find((l) => l.id === lineManualId);

    expect(autoLine).toBeDefined();
    expect(autoLine!.origin).toBe('auto');
    expect(manualLine).toBeDefined();
    expect(manualLine!.origin).toBe('manual');
  });

  // ─── origin preserved under source-filtered request ──────────────────────────

  it("origin:'auto' is still present on surviving WI lines after a source-filtered request", async () => {
    const { cookie } = await createUserWithSession();

    const now = new Date().toISOString();
    const sourceId = `bs-filter-${idCounter++}`;
    const otherSourceId = `bs-other-${idCounter++}`;

    // Insert two budget sources
    app.db
      .insert(schema.budgetSources)
      .values({
        id: sourceId,
        name: 'Kept Source',
        sourceType: 'savings',
        totalAmount: 10000,
        status: 'active',
        isDiscretionary: false,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    app.db
      .insert(schema.budgetSources)
      .values({
        id: otherSourceId,
        name: 'Deselected Source',
        sourceType: 'savings',
        totalAmount: 5000,
        status: 'active',
        isDiscretionary: false,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    // Line assigned to the kept source with origin='auto'
    insertWorkItemLine({ origin: 'auto', budgetSourceId: sourceId, plannedAmount: 1000 });
    // Line assigned to the deselected source (will be filtered out)
    insertWorkItemLine({ origin: 'manual', budgetSourceId: otherSourceId, plannedAmount: 500 });

    // Request with the other source deselected
    const line = await fetchFirstWIBudgetLine(cookie, otherSourceId);
    expect(line).not.toBeNull();
    expect(line!.origin).toBe('auto');
  });

  it("origin:'auto' is still present on surviving HI lines after a source-filtered request", async () => {
    const { cookie } = await createUserWithSession();

    const now = new Date().toISOString();
    const sourceId = `bs-hi-filter-${idCounter++}`;
    const otherSourceId = `bs-hi-other-${idCounter++}`;

    app.db
      .insert(schema.budgetSources)
      .values({
        id: sourceId,
        name: 'Kept HI Source',
        sourceType: 'savings',
        totalAmount: 8000,
        status: 'active',
        isDiscretionary: false,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    app.db
      .insert(schema.budgetSources)
      .values({
        id: otherSourceId,
        name: 'Deselected HI Source',
        sourceType: 'savings',
        totalAmount: 3000,
        status: 'active',
        isDiscretionary: false,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    // Line assigned to kept source with origin='auto'
    insertHouseholdItemLine({ origin: 'auto', budgetSourceId: sourceId, plannedAmount: 600 });
    // Line assigned to deselected source (filtered out)
    insertHouseholdItemLine({ origin: 'manual', budgetSourceId: otherSourceId, plannedAmount: 300 });

    const line = await fetchFirstHIBudgetLine(cookie, otherSourceId);
    expect(line).not.toBeNull();
    expect(line!.origin).toBe('auto');
  });

  // ─── origin field shape ───────────────────────────────────────────────────────

  it("WI budget line always has an origin field with value 'manual' or 'auto'", async () => {
    const { cookie } = await createUserWithSession();
    insertWorkItemLine({ origin: 'auto' });

    const response = await app.inject({
      method: 'GET',
      url: '/api/budget/breakdown',
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    const { breakdown } = response.json<BudgetBreakdownResponse>();

    const lines = breakdown.workItems.areas.flatMap((a) =>
      a.items.flatMap((item) => item.budgetLines),
    );
    for (const line of lines) {
      expect(['manual', 'auto']).toContain(line.origin);
    }
  });

  it("HI budget line always has an origin field with value 'manual' or 'auto'", async () => {
    const { cookie } = await createUserWithSession();
    insertHouseholdItemLine({ origin: 'manual' });

    const response = await app.inject({
      method: 'GET',
      url: '/api/budget/breakdown',
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    const { breakdown } = response.json<BudgetBreakdownResponse>();

    const lines = breakdown.householdItems.areas.flatMap((a) =>
      a.items.flatMap((item) => item.budgetLines),
    );
    for (const line of lines) {
      expect(['manual', 'auto']).toContain(line.origin);
    }
  });

  // ─── invoice + origin coexist ─────────────────────────────────────────────────

  it("WI auto-origin line also has correct hasInvoice and actualCost when an invoice exists", async () => {
    const { cookie } = await createUserWithSession();

    const now = new Date().toISOString();
    const wiId = `wi-inv-origin-${idCounter++}`;
    const lineId = `wib-inv-origin-${idCounter++}`;

    app.db
      .insert(schema.workItems)
      .values({ id: wiId, title: 'Invoiced WI', status: 'not_started', createdAt: now, updatedAt: now })
      .run();

    app.db
      .insert(schema.workItemBudgets)
      .values({
        id: lineId,
        workItemId: wiId,
        plannedAmount: 2000,
        confidence: 'invoice',
        budgetCategoryId: null,
        budgetSourceId: null,
        origin: 'auto',
        createdAt: now,
        updatedAt: now,
      })
      .run();

    // Add an actual invoice for this line
    const vendorId = `vendor-inv-${idCounter++}`;
    const invoiceId = `inv-${idCounter++}`;
    app.db
      .insert(schema.vendors)
      .values({ id: vendorId, name: 'Test Vendor', createdAt: now, updatedAt: now })
      .run();
    app.db
      .insert(schema.invoices)
      .values({
        id: invoiceId,
        vendorId,
        amount: 1800,
        date: '2026-01-15',
        status: 'paid',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    app.db
      .insert(schema.invoiceBudgetLines)
      .values({
        id: randomUUID(),
        invoiceId,
        workItemBudgetId: lineId,
        itemizedAmount: 1800,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const response = await app.inject({
      method: 'GET',
      url: '/api/budget/breakdown',
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    const { breakdown } = response.json<BudgetBreakdownResponse>();

    const line = breakdown.workItems.areas[0]?.items[0]?.budgetLines[0];
    expect(line).toBeDefined();
    expect(line!.origin).toBe('auto');
    expect(line!.hasInvoice).toBe(true);
    expect(line!.actualCost).toBe(1800);
  });
});
