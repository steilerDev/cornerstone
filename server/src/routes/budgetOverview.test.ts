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
      plannedBudget?: number | null;
      actualCost?: number | null;
      budgetCategoryId?: string | null;
      budgetSourceId?: string | null;
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

    // Create a budget line if budget fields are provided (Story 5.9 migration)
    const hasBudgetData =
      opts.plannedBudget != null ||
      opts.actualCost != null ||
      opts.budgetCategoryId != null ||
      opts.budgetSourceId != null;
    if (hasBudgetData) {
      const budgetId = `bud-route-${idCounter++}`;
      app.db
        .insert(schema.workItemBudgets)
        .values({
          id: budgetId,
          workItemId: id,
          plannedAmount: opts.plannedBudget ?? 0,
          confidence: 'own_estimate',
          budgetCategoryId: opts.budgetCategoryId ?? null,
          budgetSourceId: opts.budgetSourceId ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      // When actualCost is provided, create a vendor + paid invoice linked to this budget line.
      // Story 5.9: actual costs are tracked via invoices with work_item_budget_id set.
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

  function insertVendor(): string {
    const id = `vendor-route-${idCounter++}`;
    const now = new Date().toISOString();
    app.db
      .insert(schema.vendors)
      .values({ id, name: `Route Vendor ${id}`, createdAt: now, updatedAt: now })
      .run();
    return id;
  }

  function insertInvoice(
    vendorId: string,
    amount: number,
    status: 'pending' | 'paid' | 'claimed',
  ): string {
    const id = `inv-route-${idCounter++}`;
    const now = new Date().toISOString();
    app.db
      .insert(schema.invoices)
      .values({
        id,
        vendorId,
        amount,
        date: '2026-01-01',
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

      // Top-level numeric fields
      expect(typeof overview.totalPlannedBudget).toBe('number');
      expect(typeof overview.totalActualCost).toBe('number');
      expect(typeof overview.totalVariance).toBe('number');

      // categorySummaries array
      expect(Array.isArray(overview.categorySummaries)).toBe(true);

      // financingSummary object
      expect(typeof overview.financingSummary.totalAvailable).toBe('number');
      expect(typeof overview.financingSummary.totalUsed).toBe('number');
      expect(typeof overview.financingSummary.totalRemaining).toBe('number');
      expect(typeof overview.financingSummary.sourceCount).toBe('number');

      // vendorSummary object
      expect(typeof overview.vendorSummary.totalPaid).toBe('number');
      expect(typeof overview.vendorSummary.totalOutstanding).toBe('number');
      expect(typeof overview.vendorSummary.vendorCount).toBe('number');

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

      expect(overview.totalPlannedBudget).toBe(0);
      expect(overview.totalActualCost).toBe(0);
      expect(overview.totalVariance).toBe(0);
      // 10 seeded categories
      expect(overview.categorySummaries).toHaveLength(10);
      expect(overview.financingSummary.sourceCount).toBe(0);
      expect(overview.vendorSummary.vendorCount).toBe(0);
      expect(overview.subsidySummary.activeSubsidyCount).toBe(0);
    });

    it('reflects work item budget data in totals', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      insertWorkItem({ plannedBudget: 50000, actualCost: 42000 });
      insertWorkItem({ plannedBudget: 20000, actualCost: 18000 });

      const response = await app.inject({
        method: 'GET',
        url: '/api/budget/overview',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const { overview } = response.json<BudgetOverviewResponse>();

      expect(overview.totalPlannedBudget).toBe(70000);
      expect(overview.totalActualCost).toBe(60000);
      expect(overview.totalVariance).toBe(10000);
    });

    it('reflects invoice data in vendor summary', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      const vendorId = insertVendor();
      insertInvoice(vendorId, 10000, 'paid');
      insertInvoice(vendorId, 3000, 'claimed');

      const response = await app.inject({
        method: 'GET',
        url: '/api/budget/overview',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const { overview } = response.json<BudgetOverviewResponse>();

      expect(overview.vendorSummary.totalPaid).toBe(10000);
      expect(overview.vendorSummary.totalOutstanding).toBe(3000);
      expect(overview.vendorSummary.vendorCount).toBe(1);
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

      // Each category summary has required fields
      for (const cat of overview.categorySummaries) {
        expect(typeof cat.categoryId).toBe('string');
        expect(typeof cat.categoryName).toBe('string');
        expect(typeof cat.plannedBudget).toBe('number');
        expect(typeof cat.actualCost).toBe('number');
        expect(typeof cat.variance).toBe('number');
        expect(typeof cat.workItemCount).toBe('number');
      }
    });
  });
});
