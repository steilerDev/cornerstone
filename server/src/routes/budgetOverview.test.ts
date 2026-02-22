import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../app.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import type { FastifyInstance } from 'fastify';
import type { BudgetOverviewResponse } from '@cornerstone/shared';
import * as schema from '../db/schema.js';

describe('Budget Overview Routes', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    originalEnv = { ...process.env };

    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-budget-overview-test-'));
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

  /**
   * Helpers to create test data in the route-level DB.
   */
  let idCounter = 0;

  function insertWorkItem(
    opts: {
      plannedAmount?: number | null;
      confidence?: 'own_estimate' | 'professional_estimate' | 'quote' | 'invoice';
      budgetCategoryId?: string | null;
      budgetSourceId?: string | null;
      actualCost?: number | null;
    } = {},
  ): string {
    const id = `wi-route-${idCounter++}`;
    const now = new Date().toISOString();
    app.db
      .insert(schema.workItems)
      .values({
        id,
        title: `Route Work Item ${id}`,
        status: 'not_started',
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const hasBudgetData =
      opts.plannedAmount != null || opts.budgetCategoryId != null || opts.budgetSourceId != null;
    if (hasBudgetData) {
      const budgetId = `bud-route-${idCounter++}`;
      app.db
        .insert(schema.workItemBudgets)
        .values({
          id: budgetId,
          workItemId: id,
          plannedAmount: opts.plannedAmount ?? 0,
          confidence: opts.confidence ?? 'own_estimate',
          budgetCategoryId: opts.budgetCategoryId ?? null,
          budgetSourceId: opts.budgetSourceId ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      if (opts.actualCost != null && opts.actualCost > 0) {
        const vendorId = `wi-route-vendor-${idCounter++}`;
        app.db
          .insert(schema.vendors)
          .values({ id: vendorId, name: `Auto Vendor ${vendorId}`, createdAt: now, updatedAt: now })
          .run();

        const invoiceId = `wi-route-inv-${idCounter++}`;
        app.db
          .insert(schema.invoices)
          .values({
            id: invoiceId,
            vendorId,
            workItemBudgetId: budgetId,
            amount: opts.actualCost,
            date: '2026-01-01',
            status: 'paid',
            createdAt: now,
            updatedAt: now,
          })
          .run();
      }
    }

    return id;
  }

  function insertBudgetSource(
    totalAmount: number,
    status: 'active' | 'exhausted' | 'closed' = 'active',
  ): string {
    const id = `src-route-${idCounter++}`;
    const now = new Date().toISOString();
    app.db
      .insert(schema.budgetSources)
      .values({
        id,
        name: `Route Source ${id}`,
        sourceType: 'bank_loan',
        totalAmount,
        status,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  // ─── GET /api/budget/overview ─────────────────────────────────────────────

  describe('GET /api/budget/overview', () => {
    it('returns 401 when not authenticated', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/budget/overview',
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 401 with invalid session cookie', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/budget/overview',
        headers: { cookie: 'cornerstone_session=invalid-token' },
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 200 with overview object for authenticated member', async () => {
      const { cookie } = await createUserWithSession(
        'member@example.com',
        'Member User',
        'password',
        'member',
      );

      const response = await app.inject({
        method: 'GET',
        url: '/api/budget/overview',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<BudgetOverviewResponse>();
      expect(body).toHaveProperty('overview');
    });

    it('returns 200 with overview object for authenticated admin', async () => {
      const { cookie } = await createUserWithSession(
        'admin@example.com',
        'Admin User',
        'password',
        'admin',
      );

      const response = await app.inject({
        method: 'GET',
        url: '/api/budget/overview',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<BudgetOverviewResponse>();
      expect(body).toHaveProperty('overview');
    });

    it('returns correct shape with all required fields', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      const response = await app.inject({
        method: 'GET',
        url: '/api/budget/overview',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<BudgetOverviewResponse>();
      const overview = body.overview;

      // Top-level numeric fields (new shape from Story 5.11)
      expect(typeof overview.availableFunds).toBe('number');
      expect(typeof overview.sourceCount).toBe('number');
      expect(typeof overview.minPlanned).toBe('number');
      expect(typeof overview.maxPlanned).toBe('number');
      // Story 5.11: blended projected fields
      expect(typeof overview.projectedMin).toBe('number');
      expect(typeof overview.projectedMax).toBe('number');
      expect(typeof overview.actualCost).toBe('number');
      expect(typeof overview.actualCostPaid).toBe('number');

      // Six remaining perspectives
      expect(typeof overview.remainingVsMinPlanned).toBe('number');
      expect(typeof overview.remainingVsMaxPlanned).toBe('number');
      expect(typeof overview.remainingVsProjectedMin).toBe('number');
      expect(typeof overview.remainingVsProjectedMax).toBe('number');
      expect(typeof overview.remainingVsActualCost).toBe('number');
      expect(typeof overview.remainingVsActualPaid).toBe('number');

      // categorySummaries array
      expect(Array.isArray(overview.categorySummaries)).toBe(true);

      // subsidySummary object
      expect(typeof overview.subsidySummary.totalReductions).toBe('number');
      expect(typeof overview.subsidySummary.activeSubsidyCount).toBe('number');
    });

    it('returns zeroes and seeded categories for empty project', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      const response = await app.inject({
        method: 'GET',
        url: '/api/budget/overview',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<BudgetOverviewResponse>();
      const { overview } = body;

      expect(overview.availableFunds).toBe(0);
      expect(overview.minPlanned).toBe(0);
      expect(overview.maxPlanned).toBe(0);
      // Story 5.11 projected fields — also zero for empty project
      expect(overview.projectedMin).toBe(0);
      expect(overview.projectedMax).toBe(0);
      expect(overview.actualCost).toBe(0);
      expect(overview.actualCostPaid).toBe(0);
      expect(overview.remainingVsMinPlanned).toBe(0);
      expect(overview.remainingVsMaxPlanned).toBe(0);
      // Story 5.11 remaining projected perspectives — also zero
      expect(overview.remainingVsProjectedMin).toBe(0);
      expect(overview.remainingVsProjectedMax).toBe(0);
      expect(overview.remainingVsActualCost).toBe(0);
      expect(overview.remainingVsActualPaid).toBe(0);
      // 10 seeded categories
      expect(overview.categorySummaries).toHaveLength(10);
      expect(overview.sourceCount).toBe(0);
      expect(overview.subsidySummary.activeSubsidyCount).toBe(0);
    });

    it('applies confidence margins to min/max planned', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      // invoice confidence = 0% margin → min=max=plannedAmount
      insertWorkItem({ plannedAmount: 50000, confidence: 'invoice' });
      // own_estimate = 20% margin → min=40000, max=60000
      insertWorkItem({ plannedAmount: 50000, confidence: 'own_estimate' });

      const response = await app.inject({
        method: 'GET',
        url: '/api/budget/overview',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const { overview } = response.json<BudgetOverviewResponse>();

      // sum: invoice(50000/50000) + own_estimate(40000/60000)
      expect(overview.minPlanned).toBeCloseTo(90000, 5);
      expect(overview.maxPlanned).toBeCloseTo(110000, 5);
    });

    it('reflects available funds from active budget sources', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      insertBudgetSource(100000, 'active');
      insertBudgetSource(50000, 'exhausted'); // should be excluded

      const response = await app.inject({
        method: 'GET',
        url: '/api/budget/overview',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const { overview } = response.json<BudgetOverviewResponse>();

      expect(overview.availableFunds).toBe(100000);
      expect(overview.sourceCount).toBe(1);
    });

    it('reflects invoice data in actualCost and actualCostPaid', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      insertWorkItem({ plannedAmount: 50000, confidence: 'invoice', actualCost: 42000 });
      insertWorkItem({ plannedAmount: 20000, confidence: 'invoice', actualCost: 18000 });

      const response = await app.inject({
        method: 'GET',
        url: '/api/budget/overview',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const { overview } = response.json<BudgetOverviewResponse>();

      expect(overview.actualCost).toBe(60000);
      expect(overview.actualCostPaid).toBe(60000); // both are paid
    });

    it('returns each category summary with required fields', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      const response = await app.inject({
        method: 'GET',
        url: '/api/budget/overview',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const { overview } = response.json<BudgetOverviewResponse>();

      // Each category summary has required fields from new shape (including Story 5.11 projected fields)
      for (const cat of overview.categorySummaries) {
        expect(typeof cat.categoryId).toBe('string');
        expect(typeof cat.categoryName).toBe('string');
        expect(typeof cat.minPlanned).toBe('number');
        expect(typeof cat.maxPlanned).toBe('number');
        // Story 5.11: blended projected fields on category summaries
        expect(typeof cat.projectedMin).toBe('number');
        expect(typeof cat.projectedMax).toBe('number');
        expect(typeof cat.actualCost).toBe('number');
        expect(typeof cat.actualCostPaid).toBe('number');
        expect(typeof cat.budgetLineCount).toBe('number');
      }
    });

    it('projectedMin and projectedMax reflect blended invoice model at route level', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      // Line A: invoiced at 7000 (own_estimate ±20%, planned=10000, min=8000/max=12000)
      // → projected = 7000 (has invoice)
      // Line B: no invoices (quote ±5%, planned=5000, min=4750/max=5250)
      // → projected = minPlanned/maxPlanned = 4750/5250
      insertWorkItem({ plannedAmount: 10000, confidence: 'own_estimate', actualCost: 7000 });
      insertWorkItem({ plannedAmount: 5000, confidence: 'quote' });

      const response = await app.inject({
        method: 'GET',
        url: '/api/budget/overview',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const { overview } = response.json<BudgetOverviewResponse>();

      // projectedMin = 7000 + 4750 = 11750
      // projectedMax = 7000 + 5250 = 12250
      expect(overview.projectedMin).toBeCloseTo(11750, 5);
      expect(overview.projectedMax).toBeCloseTo(12250, 5);

      // minPlanned and maxPlanned should reflect the planned range without blending
      expect(overview.minPlanned).toBeCloseTo(12750, 5); // 8000 + 4750
      expect(overview.maxPlanned).toBeCloseTo(17250, 5); // 12000 + 5250
    });

    it('remainingVsProjectedMin and remainingVsProjectedMax are correct at route level', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      insertBudgetSource(100000, 'active');
      // Line with invoice: projected = actualCost = 6000
      insertWorkItem({ plannedAmount: 10000, confidence: 'invoice', actualCost: 6000 });

      const response = await app.inject({
        method: 'GET',
        url: '/api/budget/overview',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const { overview } = response.json<BudgetOverviewResponse>();

      expect(overview.availableFunds).toBe(100000);
      // Line has invoice → projected = 6000 (min = max)
      expect(overview.projectedMin).toBe(6000);
      expect(overview.projectedMax).toBe(6000);
      expect(overview.remainingVsProjectedMin).toBe(94000); // 100000 - 6000
      expect(overview.remainingVsProjectedMax).toBe(94000); // 100000 - 6000
    });
  });
});
