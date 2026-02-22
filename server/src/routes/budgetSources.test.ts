import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../app.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import type { FastifyInstance } from 'fastify';
import type {
  BudgetSource,
  BudgetSourceListResponse,
  BudgetSourceResponse,
  ApiErrorResponse,
  CreateBudgetSourceRequest,
} from '@cornerstone/shared';
import { budgetSources, workItems, workItemBudgets, vendors, invoices } from '../db/schema.js';

describe('Budget Source Routes', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    originalEnv = { ...process.env };

    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-budget-sources-test-'));
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
   * Helper: Insert a raw budget source directly into the DB for test setup.
   */
  function createTestSource(options: {
    name: string;
    sourceType?: 'bank_loan' | 'credit_line' | 'savings' | 'other';
    totalAmount?: number;
    interestRate?: number | null;
    terms?: string | null;
    notes?: string | null;
    status?: 'active' | 'exhausted' | 'closed';
    createdBy?: string | null;
  }) {
    const id = `src-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const now = new Date().toISOString();

    app.db
      .insert(budgetSources)
      .values({
        id,
        name: options.name,
        sourceType: options.sourceType ?? 'bank_loan',
        totalAmount: options.totalAmount ?? 100000,
        interestRate: options.interestRate ?? null,
        terms: options.terms ?? null,
        notes: options.notes ?? null,
        status: options.status ?? 'active',
        createdBy: options.createdBy ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    return { id, ...options, createdAt: now, updatedAt: now };
  }

  /**
   * Helper: Insert a work item + budget line linked to a source, then attach a
   * claimed invoice. Used to populate claimedAmount for the source.
   * Returns the budget line ID.
   */
  let routeHelperCounter = 0;

  function insertBudgetLineWithClaimedInvoice(sourceId: string, invoiceAmount: number): string {
    const now = new Date().toISOString();
    const n = ++routeHelperCounter;

    // Work item
    const wiId = `wi-route-claims-${n}`;
    app.db.insert(workItems).values({
      id: wiId,
      title: `Claims Work Item ${n}`,
      status: 'not_started',
      createdAt: now,
      updatedAt: now,
    }).run();

    // Budget line referencing the source
    const budgetId = `bud-route-claims-${n}`;
    app.db.insert(workItemBudgets).values({
      id: budgetId,
      workItemId: wiId,
      budgetSourceId: sourceId,
      plannedAmount: invoiceAmount * 2, // planned doesn't matter for claimedAmount
      confidence: 'own_estimate',
      createdAt: now,
      updatedAt: now,
    }).run();

    // Vendor + claimed invoice
    const vendorId = `vendor-route-claims-${n}`;
    app.db.insert(vendors).values({
      id: vendorId,
      name: `Claim Vendor ${n}`,
      createdAt: now,
      updatedAt: now,
    }).run();

    app.db.insert(invoices).values({
      id: `inv-route-claims-${n}`,
      vendorId,
      workItemBudgetId: budgetId,
      amount: invoiceAmount,
      date: '2026-01-01',
      status: 'claimed',
      createdAt: now,
      updatedAt: now,
    }).run();

    return budgetId;
  }

  // ─── GET /api/budget-sources ───────────────────────────────────────────────

  describe('GET /api/budget-sources', () => {
    it('returns an empty list when no sources exist', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      const response = await app.inject({
        method: 'GET',
        url: '/api/budget-sources',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<BudgetSourceListResponse>();
      expect(body.budgetSources).toEqual([]);
    });

    it('returns sources sorted by name ascending', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      createTestSource({ name: 'Zeta Source', sourceType: 'savings', totalAmount: 1000 });
      createTestSource({ name: 'Alpha Source', sourceType: 'bank_loan', totalAmount: 200000 });
      createTestSource({ name: 'Mid Source', sourceType: 'credit_line', totalAmount: 50000 });

      const response = await app.inject({
        method: 'GET',
        url: '/api/budget-sources',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<BudgetSourceListResponse>();
      expect(body.budgetSources[0].name).toBe('Alpha Source');
      expect(body.budgetSources[1].name).toBe('Mid Source');
      expect(body.budgetSources[2].name).toBe('Zeta Source');
    });

    it('returns all source fields including computed amounts', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      createTestSource({
        name: 'Full Source',
        sourceType: 'credit_line',
        totalAmount: 75000,
        interestRate: 4.5,
        terms: '5-year revolving',
        notes: 'Secondary credit',
        status: 'active',
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/budget-sources',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<BudgetSourceListResponse>();
      const source = body.budgetSources[0];
      expect(source.name).toBe('Full Source');
      expect(source.sourceType).toBe('credit_line');
      expect(source.totalAmount).toBe(75000);
      expect(source.usedAmount).toBe(0);
      expect(source.availableAmount).toBe(75000);
      // Story 5.11: no claimed invoices → claimedAmount=0, actualAvailableAmount=totalAmount
      expect(source.claimedAmount).toBe(0);
      expect(source.actualAvailableAmount).toBe(75000);
      expect(source.interestRate).toBe(4.5);
      expect(source.terms).toBe('5-year revolving');
      expect(source.notes).toBe('Secondary credit');
      expect(source.status).toBe('active');
    });

    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/budget-sources',
      });

      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('allows member user to list sources', async () => {
      const { cookie } = await createUserWithSession(
        'member@example.com',
        'Member User',
        'password',
        'member',
      );

      const response = await app.inject({
        method: 'GET',
        url: '/api/budget-sources',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<BudgetSourceListResponse>();
      expect(body.budgetSources).toBeDefined();
    });

    it('allows admin user to list sources', async () => {
      const { cookie } = await createUserWithSession(
        'admin@example.com',
        'Admin User',
        'password',
        'admin',
      );

      const response = await app.inject({
        method: 'GET',
        url: '/api/budget-sources',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  // ─── POST /api/budget-sources ──────────────────────────────────────────────

  describe('POST /api/budget-sources', () => {
    it('creates a source with required fields only (201)', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      const requestBody: CreateBudgetSourceRequest = {
        name: 'Home Loan',
        sourceType: 'bank_loan',
        totalAmount: 200000,
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/budget-sources',
        headers: { cookie },
        payload: requestBody,
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<BudgetSourceResponse>();
      expect(body.budgetSource.id).toBeDefined();
      expect(body.budgetSource.name).toBe('Home Loan');
      expect(body.budgetSource.sourceType).toBe('bank_loan');
      expect(body.budgetSource.totalAmount).toBe(200000);
      expect(body.budgetSource.usedAmount).toBe(0);
      expect(body.budgetSource.availableAmount).toBe(200000);
      // Story 5.11: newly created source has no claimed invoices
      expect(body.budgetSource.claimedAmount).toBe(0);
      expect(body.budgetSource.actualAvailableAmount).toBe(200000);
      expect(body.budgetSource.interestRate).toBeNull();
      expect(body.budgetSource.terms).toBeNull();
      expect(body.budgetSource.notes).toBeNull();
      expect(body.budgetSource.status).toBe('active');
      expect(body.budgetSource.createdAt).toBeDefined();
      expect(body.budgetSource.updatedAt).toBeDefined();
    });

    it('creates a source with all optional fields (201)', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      const requestBody: CreateBudgetSourceRequest = {
        name: 'Full Loan',
        sourceType: 'credit_line',
        totalAmount: 50000,
        interestRate: 3.75,
        terms: '10-year fixed',
        notes: 'From First National',
        status: 'active',
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/budget-sources',
        headers: { cookie },
        payload: requestBody,
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<BudgetSourceResponse>();
      expect(body.budgetSource.name).toBe('Full Loan');
      expect(body.budgetSource.sourceType).toBe('credit_line');
      expect(body.budgetSource.totalAmount).toBe(50000);
      expect(body.budgetSource.interestRate).toBe(3.75);
      expect(body.budgetSource.terms).toBe('10-year fixed');
      expect(body.budgetSource.notes).toBe('From First National');
      expect(body.budgetSource.status).toBe('active');
    });

    it('trims whitespace from name on creation', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      const response = await app.inject({
        method: 'POST',
        url: '/api/budget-sources',
        headers: { cookie },
        payload: {
          name: '  Trimmed Loan  ',
          sourceType: 'savings',
          totalAmount: 5000,
        },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<BudgetSourceResponse>();
      expect(body.budgetSource.name).toBe('Trimmed Loan');
    });

    it('creates source with status exhausted', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      const response = await app.inject({
        method: 'POST',
        url: '/api/budget-sources',
        headers: { cookie },
        payload: {
          name: 'Used Up Savings',
          sourceType: 'savings',
          totalAmount: 10000,
          status: 'exhausted',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<BudgetSourceResponse>();
      expect(body.budgetSource.status).toBe('exhausted');
    });

    it('links createdBy to the authenticated user', async () => {
      const { cookie, userId } = await createUserWithSession(
        'creator@example.com',
        'Creator User',
        'password',
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/budget-sources',
        headers: { cookie },
        payload: {
          name: 'User Loan',
          sourceType: 'bank_loan',
          totalAmount: 100000,
        },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<BudgetSourceResponse>();
      expect(body.budgetSource.createdBy).not.toBeNull();
      expect(body.budgetSource.createdBy?.id).toBe(userId);
    });

    it('returns 400 VALIDATION_ERROR for missing name', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      const response = await app.inject({
        method: 'POST',
        url: '/api/budget-sources',
        headers: { cookie },
        payload: { sourceType: 'bank_loan', totalAmount: 50000 },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 VALIDATION_ERROR for missing sourceType', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      const response = await app.inject({
        method: 'POST',
        url: '/api/budget-sources',
        headers: { cookie },
        payload: { name: 'No Type', totalAmount: 50000 },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 VALIDATION_ERROR for missing totalAmount', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      const response = await app.inject({
        method: 'POST',
        url: '/api/budget-sources',
        headers: { cookie },
        payload: { name: 'No Amount', sourceType: 'bank_loan' },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 VALIDATION_ERROR for totalAmount of zero (exclusiveMinimum)', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      const response = await app.inject({
        method: 'POST',
        url: '/api/budget-sources',
        headers: { cookie },
        payload: { name: 'Zero Amount', sourceType: 'bank_loan', totalAmount: 0 },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 VALIDATION_ERROR for negative totalAmount', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      const response = await app.inject({
        method: 'POST',
        url: '/api/budget-sources',
        headers: { cookie },
        payload: { name: 'Negative Amount', sourceType: 'bank_loan', totalAmount: -100 },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 VALIDATION_ERROR for invalid sourceType', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      const response = await app.inject({
        method: 'POST',
        url: '/api/budget-sources',
        headers: { cookie },
        payload: { name: 'Bad Type', sourceType: 'invalid', totalAmount: 50000 },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 VALIDATION_ERROR for invalid status', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      const response = await app.inject({
        method: 'POST',
        url: '/api/budget-sources',
        headers: { cookie },
        payload: {
          name: 'Bad Status',
          sourceType: 'bank_loan',
          totalAmount: 50000,
          status: 'invalid_status',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 VALIDATION_ERROR for interest rate above 100', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      const response = await app.inject({
        method: 'POST',
        url: '/api/budget-sources',
        headers: { cookie },
        payload: {
          name: 'High Rate',
          sourceType: 'bank_loan',
          totalAmount: 50000,
          interestRate: 101,
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('strips unknown properties (additionalProperties: false behavior)', async () => {
      // Fastify with additionalProperties: false strips unrecognized fields
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      const response = await app.inject({
        method: 'POST',
        url: '/api/budget-sources',
        headers: { cookie },
        payload: {
          name: 'Stripped Source',
          sourceType: 'savings',
          totalAmount: 5000,
          unknownField: 'value',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<BudgetSourceResponse>();
      expect(body.budgetSource.name).toBe('Stripped Source');
    });

    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/budget-sources',
        payload: { name: 'Test', sourceType: 'savings', totalAmount: 1000 },
      });

      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('allows member user to create a source', async () => {
      const { cookie } = await createUserWithSession(
        'member@example.com',
        'Member User',
        'password',
        'member',
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/budget-sources',
        headers: { cookie },
        payload: { name: 'Member Source', sourceType: 'savings', totalAmount: 5000 },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<BudgetSourceResponse>();
      expect(body.budgetSource.name).toBe('Member Source');
    });
  });

  // ─── GET /api/budget-sources/:id ──────────────────────────────────────────

  describe('GET /api/budget-sources/:id', () => {
    it('returns a source by ID', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const src = createTestSource({
        name: 'Get By ID',
        sourceType: 'savings',
        totalAmount: 15000,
      });

      const response = await app.inject({
        method: 'GET',
        url: `/api/budget-sources/${src.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<BudgetSourceResponse>();
      expect(body.budgetSource.id).toBe(src.id);
      expect(body.budgetSource.name).toBe('Get By ID');
      expect(body.budgetSource.sourceType).toBe('savings');
      expect(body.budgetSource.totalAmount).toBe(15000);
    });

    it('returns full source detail with all fields', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const src = createTestSource({
        name: 'Full Detail',
        sourceType: 'credit_line',
        totalAmount: 60000,
        interestRate: 6.0,
        terms: 'Revolving',
        notes: 'Some notes',
        status: 'exhausted',
      });

      const response = await app.inject({
        method: 'GET',
        url: `/api/budget-sources/${src.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<BudgetSourceResponse>();
      expect(body.budgetSource.interestRate).toBe(6.0);
      expect(body.budgetSource.terms).toBe('Revolving');
      expect(body.budgetSource.notes).toBe('Some notes');
      expect(body.budgetSource.status).toBe('exhausted');
      // Story 5.11: no claimed invoices
      expect(body.budgetSource.claimedAmount).toBe(0);
      expect(body.budgetSource.actualAvailableAmount).toBe(60000);
    });

    it('returns 404 NOT_FOUND for non-existent source', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      const response = await app.inject({
        method: 'GET',
        url: '/api/budget-sources/non-existent-id',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/budget-sources/some-id',
      });

      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('allows member user to get a source by ID', async () => {
      const { cookie } = await createUserWithSession(
        'member@example.com',
        'Member',
        'password',
        'member',
      );
      const src = createTestSource({ name: 'Member Get', sourceType: 'other', totalAmount: 500 });

      const response = await app.inject({
        method: 'GET',
        url: `/api/budget-sources/${src.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  // ─── PATCH /api/budget-sources/:id ────────────────────────────────────────

  describe('PATCH /api/budget-sources/:id', () => {
    it('updates the name of an existing source', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const src = createTestSource({
        name: 'Old Name',
        sourceType: 'bank_loan',
        totalAmount: 100000,
      });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/budget-sources/${src.id}`,
        headers: { cookie },
        payload: { name: 'New Name' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<BudgetSourceResponse>();
      expect(body.budgetSource.id).toBe(src.id);
      expect(body.budgetSource.name).toBe('New Name');
      expect(body.budgetSource.sourceType).toBe('bank_loan'); // Unchanged
    });

    it('updates sourceType only (partial update)', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const src = createTestSource({
        name: 'Type Patch',
        sourceType: 'bank_loan',
        totalAmount: 100000,
      });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/budget-sources/${src.id}`,
        headers: { cookie },
        payload: { sourceType: 'credit_line' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<BudgetSourceResponse>();
      expect(body.budgetSource.sourceType).toBe('credit_line');
      expect(body.budgetSource.name).toBe('Type Patch'); // Unchanged
    });

    it('updates totalAmount only', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const src = createTestSource({
        name: 'Amount Patch',
        sourceType: 'savings',
        totalAmount: 5000,
      });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/budget-sources/${src.id}`,
        headers: { cookie },
        payload: { totalAmount: 25000 },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<BudgetSourceResponse>();
      expect(body.budgetSource.totalAmount).toBe(25000);
      expect(body.budgetSource.availableAmount).toBe(25000);
    });

    it('updates interestRate to a new value', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const src = createTestSource({
        name: 'Rate Patch',
        sourceType: 'bank_loan',
        totalAmount: 100000,
        interestRate: 3.0,
      });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/budget-sources/${src.id}`,
        headers: { cookie },
        payload: { interestRate: 4.5 },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<BudgetSourceResponse>();
      expect(body.budgetSource.interestRate).toBe(4.5);
    });

    it('clears interestRate by setting to null', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const src = createTestSource({
        name: 'Clear Rate',
        sourceType: 'bank_loan',
        totalAmount: 100000,
        interestRate: 3.5,
      });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/budget-sources/${src.id}`,
        headers: { cookie },
        payload: { interestRate: null },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<BudgetSourceResponse>();
      expect(body.budgetSource.interestRate).toBeNull();
    });

    it('updates status only', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const src = createTestSource({
        name: 'Status Patch',
        sourceType: 'savings',
        totalAmount: 5000,
        status: 'active',
      });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/budget-sources/${src.id}`,
        headers: { cookie },
        payload: { status: 'closed' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<BudgetSourceResponse>();
      expect(body.budgetSource.status).toBe('closed');
    });

    it('updates all fields at once', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const src = createTestSource({
        name: 'All Fields',
        sourceType: 'bank_loan',
        totalAmount: 100,
      });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/budget-sources/${src.id}`,
        headers: { cookie },
        payload: {
          name: 'All Updated',
          sourceType: 'savings',
          totalAmount: 99999,
          interestRate: 2.5,
          terms: 'New terms',
          notes: 'New notes',
          status: 'exhausted',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<BudgetSourceResponse>();
      expect(body.budgetSource.name).toBe('All Updated');
      expect(body.budgetSource.sourceType).toBe('savings');
      expect(body.budgetSource.totalAmount).toBe(99999);
      expect(body.budgetSource.interestRate).toBe(2.5);
      expect(body.budgetSource.terms).toBe('New terms');
      expect(body.budgetSource.notes).toBe('New notes');
      expect(body.budgetSource.status).toBe('exhausted');
    });

    it('returns 404 NOT_FOUND for non-existent source', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/budget-sources/non-existent-id',
        headers: { cookie },
        payload: { name: 'Updated' },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 400 VALIDATION_ERROR for empty payload (minProperties constraint)', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const src = createTestSource({ name: 'Valid', sourceType: 'savings', totalAmount: 1000 });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/budget-sources/${src.id}`,
        headers: { cookie },
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 VALIDATION_ERROR for empty name in PATCH', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const src = createTestSource({ name: 'Valid', sourceType: 'savings', totalAmount: 1000 });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/budget-sources/${src.id}`,
        headers: { cookie },
        payload: { name: '' },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 VALIDATION_ERROR for totalAmount of zero in PATCH', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const src = createTestSource({ name: 'Valid', sourceType: 'savings', totalAmount: 1000 });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/budget-sources/${src.id}`,
        headers: { cookie },
        payload: { totalAmount: 0 },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 VALIDATION_ERROR for interest rate above 100 in PATCH', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const src = createTestSource({ name: 'Valid', sourceType: 'savings', totalAmount: 1000 });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/budget-sources/${src.id}`,
        headers: { cookie },
        payload: { interestRate: 101 },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 VALIDATION_ERROR for invalid sourceType in PATCH', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const src = createTestSource({ name: 'Valid', sourceType: 'savings', totalAmount: 1000 });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/budget-sources/${src.id}`,
        headers: { cookie },
        payload: { sourceType: 'invalid' },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/budget-sources/some-id',
        payload: { name: 'Updated' },
      });

      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('allows member user to update a source', async () => {
      const { cookie } = await createUserWithSession(
        'member@example.com',
        'Member',
        'password',
        'member',
      );
      const src = createTestSource({
        name: 'Member Update',
        sourceType: 'other',
        totalAmount: 500,
      });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/budget-sources/${src.id}`,
        headers: { cookie },
        payload: { name: 'Member Updated' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<BudgetSourceResponse>();
      expect(body.budgetSource.name).toBe('Member Updated');
    });
  });

  // ─── DELETE /api/budget-sources/:id ───────────────────────────────────────

  describe('DELETE /api/budget-sources/:id', () => {
    it('deletes an existing source successfully (204)', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const src = createTestSource({ name: 'To Delete', sourceType: 'other', totalAmount: 500 });

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/budget-sources/${src.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(204);
      expect(response.body).toBe('');
    });

    it('source is no longer returned in list after deletion', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const src = createTestSource({ name: 'Delete Me', sourceType: 'savings', totalAmount: 1000 });
      createTestSource({ name: 'Keep Me', sourceType: 'bank_loan', totalAmount: 50000 });

      await app.inject({
        method: 'DELETE',
        url: `/api/budget-sources/${src.id}`,
        headers: { cookie },
      });

      const listResponse = await app.inject({
        method: 'GET',
        url: '/api/budget-sources',
        headers: { cookie },
      });

      const body = listResponse.json<BudgetSourceListResponse>();
      expect(body.budgetSources.find((s: BudgetSource) => s.id === src.id)).toBeUndefined();
      expect(body.budgetSources.some((s: BudgetSource) => s.name === 'Keep Me')).toBe(true);
    });

    it('returns 404 NOT_FOUND for non-existent source', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/budget-sources/non-existent-id',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/budget-sources/some-id',
      });

      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('allows member user to delete a source', async () => {
      const { cookie } = await createUserWithSession(
        'member@example.com',
        'Member',
        'password',
        'member',
      );
      const src = createTestSource({
        name: 'Member Delete',
        sourceType: 'other',
        totalAmount: 100,
      });

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/budget-sources/${src.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(204);
    });

    it('allows admin user to delete a source', async () => {
      const { cookie } = await createUserWithSession(
        'admin@example.com',
        'Admin',
        'password',
        'admin',
      );
      const src = createTestSource({ name: 'Admin Delete', sourceType: 'other', totalAmount: 100 });

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/budget-sources/${src.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(204);
    });
  });

  // ─── claimedAmount and actualAvailableAmount (Story 5.11) ─────────────────

  describe('claimedAmount and actualAvailableAmount via GET endpoints', () => {
    it('GET list: claimedAmount=0 and actualAvailableAmount=totalAmount when no claimed invoices', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      createTestSource({ name: 'Zero Claims', sourceType: 'savings', totalAmount: 30000 });

      const response = await app.inject({
        method: 'GET',
        url: '/api/budget-sources',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<BudgetSourceListResponse>();
      const source = body.budgetSources[0];
      expect(source.claimedAmount).toBe(0);
      expect(source.actualAvailableAmount).toBe(30000);
    });

    it('GET list: claimedAmount reflects SUM of claimed invoices on linked budget lines', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const src = createTestSource({ name: 'Has Claims', sourceType: 'bank_loan', totalAmount: 100000 });

      insertBudgetLineWithClaimedInvoice(src.id, 8000);
      insertBudgetLineWithClaimedInvoice(src.id, 4000);

      const response = await app.inject({
        method: 'GET',
        url: '/api/budget-sources',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<BudgetSourceListResponse>();
      const source = body.budgetSources.find((s: BudgetSource) => s.id === src.id)!;
      expect(source.claimedAmount).toBe(12000); // 8000 + 4000
      expect(source.actualAvailableAmount).toBe(88000); // 100000 - 12000
    });

    it('GET by ID: claimedAmount=0 when no claimed invoices exist', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const src = createTestSource({ name: 'No Claims By ID', sourceType: 'other', totalAmount: 20000 });

      const response = await app.inject({
        method: 'GET',
        url: `/api/budget-sources/${src.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<BudgetSourceResponse>();
      expect(body.budgetSource.claimedAmount).toBe(0);
      expect(body.budgetSource.actualAvailableAmount).toBe(20000);
    });

    it('GET by ID: claimedAmount sums claimed invoices and actualAvailableAmount = totalAmount - claimedAmount', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const src = createTestSource({ name: 'Claims By ID', sourceType: 'credit_line', totalAmount: 50000 });

      insertBudgetLineWithClaimedInvoice(src.id, 15000);

      const response = await app.inject({
        method: 'GET',
        url: `/api/budget-sources/${src.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<BudgetSourceResponse>();
      expect(body.budgetSource.claimedAmount).toBe(15000);
      expect(body.budgetSource.actualAvailableAmount).toBe(35000); // 50000 - 15000
    });

    it('PATCH: updated source includes claimedAmount and actualAvailableAmount', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const src = createTestSource({ name: 'PATCH Claims', sourceType: 'savings', totalAmount: 80000 });

      insertBudgetLineWithClaimedInvoice(src.id, 10000);

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/budget-sources/${src.id}`,
        headers: { cookie },
        payload: { name: 'PATCH Claims Updated' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<BudgetSourceResponse>();
      expect(body.budgetSource.claimedAmount).toBe(10000);
      expect(body.budgetSource.actualAvailableAmount).toBe(70000); // 80000 - 10000
    });

    it('claimed invoices from a different source do not affect this source claimedAmount', async () => {
      const { cookie } = await createUserWithSession('user@example.com', 'Test User', 'password');
      const srcA = createTestSource({ name: 'Source A Claims', sourceType: 'bank_loan', totalAmount: 100000 });
      const srcB = createTestSource({ name: 'Source B No Claims', sourceType: 'savings', totalAmount: 50000 });

      // Only source A gets claimed invoices
      insertBudgetLineWithClaimedInvoice(srcA.id, 20000);

      const responseB = await app.inject({
        method: 'GET',
        url: `/api/budget-sources/${srcB.id}`,
        headers: { cookie },
      });

      expect(responseB.statusCode).toBe(200);
      const bodyB = responseB.json<BudgetSourceResponse>();
      expect(bodyB.budgetSource.claimedAmount).toBe(0);
      expect(bodyB.budgetSource.actualAvailableAmount).toBe(50000);
    });
  });
});
