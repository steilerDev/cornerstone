import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../app.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import type { FastifyInstance } from 'fastify';
import type { BudgetOverviewResponse } from '@cornerstone/shared';
import * as schema from '../db/schema.js';

// Snapshot of the legacy overview key set: ADR-039 adds `money` next to it, no key changes.
const EXPECTED_OVERVIEW_KEYS = [
  'actualCost',
  'actualCostClaimed',
  'actualCostPaid',
  'availableFunds',
  'maxPlanned',
  'minPlanned',
  'remainingVsActualClaimed',
  'remainingVsActualCost',
  'remainingVsActualPaid',
  'remainingVsMaxPlanned',
  'remainingVsMaxPlannedWithPayback',
  'remainingVsMinPlanned',
  'remainingVsMinPlannedWithPayback',
  'sourceCount',
  'subsidySummary',
];
const EXPECTED_MONEY_KEYS = [
  'activeSourceCount',
  'afterGrants',
  'byArea',
  'byType',
  'expectedCost',
  'expectedGrants',
  'fundingTotal',
  'grants',
  'leftToSpend',
  'notYetPaid',
  'notYetSplit',
  'paid',
  'possibleGrants',
  'readyToSubmit',
  'records',
  'sources',
  'stillToPay',
];

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

      // Top-level numeric fields
      expect(typeof overview.availableFunds).toBe('number');
      expect(typeof overview.sourceCount).toBe('number');
      expect(typeof overview.minPlanned).toBe('number');
      expect(typeof overview.maxPlanned).toBe('number');
      expect(typeof overview.actualCost).toBe('number');
      expect(typeof overview.actualCostPaid).toBe('number');

      // Remaining perspectives
      expect(typeof overview.remainingVsMinPlanned).toBe('number');
      expect(typeof overview.remainingVsMaxPlanned).toBe('number');
      expect(typeof overview.remainingVsActualCost).toBe('number');
      expect(typeof overview.remainingVsActualPaid).toBe('number');

      // subsidySummary object
      expect(typeof overview.subsidySummary.totalReductions).toBe('number');
      expect(typeof overview.subsidySummary.activeSubsidyCount).toBe('number');
    });

    it('adds the money service object next to the unchanged overview key set (ADR-039)', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      const response = await app.inject({
        method: 'GET',
        url: '/api/budget/overview',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<BudgetOverviewResponse>();
      expect(Object.keys(body).sort()).toEqual(['money', 'overview']);
      expect(Object.keys(body.overview).sort()).toEqual(EXPECTED_OVERVIEW_KEYS);
      expect(Object.keys(body.money).sort()).toEqual(EXPECTED_MONEY_KEYS);
      expect(body.money.leftToSpend.verdict).toBeNull();
      expect(body.money.sources.map((x) => x.id)).toEqual(['discretionary-system']);
    });

    it('serves the legacy grant fields and money from one computation (they agree)', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const sourceId = insertBudgetSource(5000);
      const workItemId = insertWorkItem({
        plannedAmount: 1000,
        confidence: 'own_estimate',
        budgetSourceId: sourceId,
      });
      app.db
        .insert(schema.subsidyPrograms)
        .values({
          id: 'sp-route',
          name: 'Route Grant',
          reductionType: 'percentage',
          reductionValue: 10,
          applicationStatus: 'approved',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .run();
      app.db
        .insert(schema.workItemSubsidies)
        .values({ workItemId, subsidyProgramId: 'sp-route' })
        .run();

      const response = await app.inject({
        method: 'GET',
        url: '/api/budget/overview',
        headers: { cookie },
      });

      const body = response.json<BudgetOverviewResponse>();
      expect(body.money.expectedGrants).toEqual({ expected: 100, best: 80, worst: 120 });
      expect(body.overview.subsidySummary.totalReductions).toBe(body.money.expectedGrants.expected);
      expect(body.overview.subsidySummary.minTotalPayback).toBe(body.money.expectedGrants.best);
      expect(body.overview.subsidySummary.maxTotalPayback).toBe(body.money.expectedGrants.worst);
      expect(body.overview.availableFunds).toBe(body.money.fundingTotal);
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
      expect(overview.actualCost).toBe(0);
      expect(overview.actualCostPaid).toBe(0);
      expect(overview.remainingVsMinPlanned).toBe(0);
      expect(overview.remainingVsMaxPlanned).toBe(0);
      expect(overview.remainingVsActualCost).toBe(0);
      expect(overview.remainingVsActualPaid).toBe(0);
      expect(overview.sourceCount).toBe(1); // seeded discretionary source
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
      expect(overview.sourceCount).toBe(2); // 1 user source + discretionary
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

    // 'returns each category summary with required fields' test removed — categorySummaries dropped in #1243
  });
});
