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

describe('GET /api/budget/breakdown', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    originalEnv = { ...process.env };

    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-budget-breakdown-test-'));
    process.env.DATABASE_URL = join(tempDir, 'test.db');
    process.env.SECURE_COOKIES = 'false';

    app = await buildApp();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }

    process.env = originalEnv;

    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  /**
   * Helper: Create a user and return a session cookie.
   */
  async function createUserWithSession(
    email: string,
    displayName: string,
    password: string,
    role: 'admin' | 'member' = 'member',
  ): Promise<{ userId: string; cookie: string }> {
    const user = await userService.createLocalUser(app.db, email, displayName, password, role);
    const sessionToken = sessionService.createSession(app.db, user.id, 3600);
    return {
      userId: user.id,
      cookie: `cornerstone_session=${sessionToken}`,
    };
  }

  let idCounter = 0;

  /**
   * Insert a work item with a budget line into the app's database.
   */
  function insertWorkItem(
    opts: {
      plannedAmount?: number;
      confidence?: 'own_estimate' | 'professional_estimate' | 'quote' | 'invoice';
      budgetCategoryId?: string | null;
      actualCost?: number;
    } = {},
  ): { workItemId: string; budgetLineId: string } {
    const id = `wi-bd-${idCounter++}`;
    const now = new Date().toISOString();
    app.db
      .insert(schema.workItems)
      .values({
        id,
        title: `Breakdown WI ${id}`,
        status: 'not_started',
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const budgetId = `bud-bd-${idCounter++}`;
    app.db
      .insert(schema.workItemBudgets)
      .values({
        id: budgetId,
        workItemId: id,
        plannedAmount: opts.plannedAmount ?? 1000,
        confidence: opts.confidence ?? 'own_estimate',
        budgetCategoryId: opts.budgetCategoryId ?? null,
        budgetSourceId: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    if (opts.actualCost != null && opts.actualCost > 0) {
      const vendorId = `vendor-bd-${idCounter++}`;
      app.db
        .insert(schema.vendors)
        .values({ id: vendorId, name: `Vendor ${vendorId}`, createdAt: now, updatedAt: now })
        .run();
      const invoiceId = `inv-bd-${idCounter++}`;
      app.db
        .insert(schema.invoices)
        .values({
          id: invoiceId,
          vendorId,
          amount: opts.actualCost,
          date: '2026-01-01',
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
          workItemBudgetId: budgetId,
          itemizedAmount: opts.actualCost,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    }

    return { workItemId: id, budgetLineId: budgetId };
  }

  /**
   * Insert a household item with a budget line into the app's database.
   */
  function insertHouseholdItem(
    opts: {
      category?:
        | 'hic-furniture'
        | 'hic-appliances'
        | 'hic-fixtures'
        | 'hic-decor'
        | 'hic-electronics'
        | 'hic-outdoor'
        | 'hic-storage'
        | 'hic-other';
      plannedAmount?: number;
      confidence?: 'own_estimate' | 'professional_estimate' | 'quote' | 'invoice';
    } = {},
  ): { householdItemId: string; budgetLineId: string } {
    const id = `hi-bd-${idCounter++}`;
    const now = new Date().toISOString();
    app.db
      .insert(schema.householdItems)
      .values({
        id,
        name: `HI ${id}`,
        categoryId: opts.category ?? 'hic-furniture',
        status: 'planned',
        quantity: 1,
        isLate: false,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const budgetId = `hibud-bd-${idCounter++}`;
    app.db
      .insert(schema.householdItemBudgets)
      .values({
        id: budgetId,
        householdItemId: id,
        plannedAmount: opts.plannedAmount ?? 500,
        confidence: opts.confidence ?? 'own_estimate',
        budgetCategoryId: null,
        budgetSourceId: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    return { householdItemId: id, budgetLineId: budgetId };
  }

  // ─── Auth checks ─────────────────────────────────────────────────────────

  it('returns 401 when not authenticated', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/budget/breakdown',
    });

    expect(response.statusCode).toBe(401);
  });

  it('returns 401 with invalid session cookie', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/budget/breakdown',
      headers: { cookie: 'cornerstone_session=invalid-token-xyz' },
    });

    expect(response.statusCode).toBe(401);
  });

  it('returns UNAUTHORIZED error code in body when not authenticated', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/budget/breakdown',
    });

    expect(response.statusCode).toBe(401);
    const body = response.json<{ error: { code: string } }>();
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  // ─── Successful responses ─────────────────────────────────────────────────

  it('returns 200 with breakdown object for authenticated member', async () => {
    const { cookie } = await createUserWithSession(
      'member@example.com',
      'Member User',
      'password',
      'member',
    );

    const response = await app.inject({
      method: 'GET',
      url: '/api/budget/breakdown',
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<BudgetBreakdownResponse>();
    expect(body).toHaveProperty('breakdown');
  });

  it('returns 200 with breakdown object for authenticated admin', async () => {
    const { cookie } = await createUserWithSession(
      'admin@example.com',
      'Admin User',
      'password',
      'admin',
    );

    const response = await app.inject({
      method: 'GET',
      url: '/api/budget/breakdown',
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<BudgetBreakdownResponse>();
    expect(body).toHaveProperty('breakdown');
  });

  // ─── Response shape ───────────────────────────────────────────────────────

  it('returns correct top-level breakdown shape with workItems and householdItems keys', async () => {
    const { cookie } = await createUserWithSession('shape@example.com', 'Shape User', 'password');

    const response = await app.inject({
      method: 'GET',
      url: '/api/budget/breakdown',
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    const { breakdown } = response.json<BudgetBreakdownResponse>();

    expect(breakdown).toHaveProperty('workItems');
    expect(breakdown).toHaveProperty('householdItems');
  });

  it('workItems has categories array and totals object', async () => {
    const { cookie } = await createUserWithSession('shape2@example.com', 'Shape2 User', 'password');

    const response = await app.inject({
      method: 'GET',
      url: '/api/budget/breakdown',
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    const { breakdown } = response.json<BudgetBreakdownResponse>();

    expect(Array.isArray(breakdown.workItems.areas)).toBe(true);
    expect(typeof breakdown.workItems.totals).toBe('object');
    expect(typeof breakdown.workItems.totals.projectedMin).toBe('number');
    expect(typeof breakdown.workItems.totals.projectedMax).toBe('number');
    expect(typeof breakdown.workItems.totals.actualCost).toBe('number');
    expect(typeof breakdown.workItems.totals.subsidyPayback).toBe('number');
  });

  it('householdItems has categories array and totals object', async () => {
    const { cookie } = await createUserWithSession('shape3@example.com', 'Shape3 User', 'password');

    const response = await app.inject({
      method: 'GET',
      url: '/api/budget/breakdown',
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    const { breakdown } = response.json<BudgetBreakdownResponse>();

    expect(Array.isArray(breakdown.householdItems.areas)).toBe(true);
    expect(typeof breakdown.householdItems.totals).toBe('object');
    expect(typeof breakdown.householdItems.totals.projectedMin).toBe('number');
    expect(typeof breakdown.householdItems.totals.projectedMax).toBe('number');
    expect(typeof breakdown.householdItems.totals.actualCost).toBe('number');
    expect(typeof breakdown.householdItems.totals.subsidyPayback).toBe('number');
  });

  it('returns empty categories and zero totals for an empty project', async () => {
    const { cookie } = await createUserWithSession('empty@example.com', 'Empty User', 'password');

    const response = await app.inject({
      method: 'GET',
      url: '/api/budget/breakdown',
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    const { breakdown } = response.json<BudgetBreakdownResponse>();

    expect(breakdown.workItems.areas).toHaveLength(0);
    expect(breakdown.workItems.totals.projectedMin).toBe(0);
    expect(breakdown.workItems.totals.projectedMax).toBe(0);
    expect(breakdown.householdItems.areas).toHaveLength(0);
    expect(breakdown.householdItems.totals.projectedMax).toBe(0);
  });

  // ─── Category entry shape ─────────────────────────────────────────────────

  it('each WI category entry has the required fields', async () => {
    const { cookie } = await createUserWithSession('fields@example.com', 'Fields User', 'password');

    insertWorkItem({ plannedAmount: 5000, confidence: 'quote' });

    const response = await app.inject({
      method: 'GET',
      url: '/api/budget/breakdown',
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    const { breakdown } = response.json<BudgetBreakdownResponse>();

    expect(breakdown.workItems.areas).toHaveLength(1);
    const cat = breakdown.workItems.areas[0]!;

    expect(cat).toHaveProperty('areaId');
    expect(cat).toHaveProperty('name');
    expect(typeof cat.projectedMin).toBe('number');
    expect(typeof cat.projectedMax).toBe('number');
    expect(typeof cat.actualCost).toBe('number');
    expect(typeof cat.subsidyPayback).toBe('number');
    expect(Array.isArray(cat.items)).toBe(true);
  });

  it('each WI item entry has the required fields', async () => {
    const { cookie } = await createUserWithSession(
      'itemfields@example.com',
      'ItemFields User',
      'password',
    );

    insertWorkItem({ plannedAmount: 5000, confidence: 'quote' });

    const response = await app.inject({
      method: 'GET',
      url: '/api/budget/breakdown',
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    const { breakdown } = response.json<BudgetBreakdownResponse>();

    const item = breakdown.workItems.areas[0]!.items[0]!;
    expect(typeof item.workItemId).toBe('string');
    expect(typeof item.title).toBe('string');
    expect(typeof item.projectedMin).toBe('number');
    expect(typeof item.projectedMax).toBe('number');
    expect(typeof item.actualCost).toBe('number');
    expect(typeof item.subsidyPayback).toBe('number');
    expect(['actual', 'projected', 'mixed']).toContain(item.costDisplay);
    expect(Array.isArray(item.budgetLines)).toBe(true);
  });

  it('each budget line entry has the required fields', async () => {
    const { cookie } = await createUserWithSession(
      'linefields@example.com',
      'LineFields User',
      'password',
    );

    insertWorkItem({ plannedAmount: 3000, confidence: 'professional_estimate' });

    const response = await app.inject({
      method: 'GET',
      url: '/api/budget/breakdown',
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    const { breakdown } = response.json<BudgetBreakdownResponse>();

    const line = breakdown.workItems.areas[0]!.items[0]!.budgetLines[0]!;
    expect(typeof line.id).toBe('string');
    expect(typeof line.plannedAmount).toBe('number');
    expect(typeof line.actualCost).toBe('number');
    expect(typeof line.hasInvoice).toBe('boolean');
    expect(line).toHaveProperty('description'); // may be null
    expect(['own_estimate', 'professional_estimate', 'quote', 'invoice']).toContain(
      line.confidence,
    );
  });

  // ─── Data accuracy at route level ─────────────────────────────────────────

  it('reflects actual WI data with correct projectedMax at route level', async () => {
    const { cookie } = await createUserWithSession('data@example.com', 'Data User', 'password');

    // own_estimate, planned=1000 → projectedMax = 1000 * 1.2 = 1200
    insertWorkItem({ plannedAmount: 1000, confidence: 'own_estimate' });

    const response = await app.inject({
      method: 'GET',
      url: '/api/budget/breakdown',
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    const { breakdown } = response.json<BudgetBreakdownResponse>();

    const item = breakdown.workItems.areas[0]!.items[0]!;
    expect(item.projectedMax).toBeCloseTo(1200, 5);
    expect(item.costDisplay).toBe('projected');
  });

  it('reflects actual HI data at route level', async () => {
    const { cookie } = await createUserWithSession('hidata@example.com', 'HiData User', 'password');

    insertHouseholdItem({ category: 'hic-appliances', plannedAmount: 600, confidence: 'quote' });

    const response = await app.inject({
      method: 'GET',
      url: '/api/budget/breakdown',
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    const { breakdown } = response.json<BudgetBreakdownResponse>();

    expect(breakdown.householdItems.areas).toHaveLength(1);
    const hiCat = breakdown.householdItems.areas[0]!;
    expect(typeof hiCat.areaId === 'string' || hiCat.areaId === null).toBe(true);
    expect(typeof hiCat.name).toBe('string');
    expect(hiCat.name.length).toBeGreaterThan(0);
    // color is either a string or null
    expect(hiCat.color === null || typeof hiCat.color === 'string').toBe(true);
    expect(hiCat.items[0]!.costDisplay).toBe('projected');
  });
});
