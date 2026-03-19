import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../app.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import * as workItemService from '../services/workItemService.js';
import * as budgetCategoryService from '../services/budgetCategoryService.js';
import * as budgetSourceService from '../services/budgetSourceService.js';
import * as vendorService from '../services/vendorService.js';
import * as invoiceService from '../services/invoiceService.js';
import type { FastifyInstance } from 'fastify';
import type { ApiErrorResponse, WorkItemBudgetLine } from '@cornerstone/shared';
import { invoiceBudgetLines } from '../db/schema.js';

describe('Work Item Budget Routes', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    originalEnv = { ...process.env };

    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-wi-budget-routes-test-'));
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
   * Helper: Create a work item directly in the database.
   */
  function createTestWorkItem(title: string, userId: string): { id: string; title: string } {
    const workItem = workItemService.createWorkItem(app.db, userId, { title });
    return { id: workItem.id, title: workItem.title };
  }

  /**
   * Helper: Create a budget category.
   */
  function createTestBudgetCategory(name: string): { id: string; name: string } {
    const category = budgetCategoryService.createBudgetCategory(app.db, {
      name,
      color: '#3b82f6',
    });
    return { id: category.id, name: category.name };
  }

  /**
   * Helper: Create a budget source.
   */
  function createTestBudgetSource(name: string, userId: string): { id: string; name: string } {
    const source = budgetSourceService.createBudgetSource(
      app.db,
      {
        name,
        sourceType: 'savings',
        totalAmount: 10000,
      },
      userId,
    );
    return { id: source.id, name: source.name };
  }

  /**
   * Helper: Create a vendor.
   */
  function createTestVendor(name: string, userId: string): { id: string; name: string } {
    const vendor = vendorService.createVendor(
      app.db,
      {
        name,
        tradeId: null,
      },
      userId,
    );
    return { id: vendor.id, name: vendor.name };
  }

  // ─── GET /api/work-items/:workItemId/budgets ───────────────────────────────

  describe('GET /api/work-items/:workItemId/budgets', () => {
    it('returns 401 when not authenticated', async () => {
      const { userId } = await createUserWithSession(
        'auth-test@example.com',
        'Auth Test',
        'password123',
      );
      const workItem = createTestWorkItem('Test Work Item', userId);

      const response = await app.inject({
        method: 'GET',
        url: `/api/work-items/${workItem.id}/budgets`,
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 200 with empty array when no budget lines exist', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItem = createTestWorkItem('Empty Work Item', userId);

      const response = await app.inject({
        method: 'GET',
        url: `/api/work-items/${workItem.id}/budgets`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ budgets: WorkItemBudgetLine[] }>();
      expect(body.budgets).toEqual([]);
    });

    it('returns 200 with budget lines after creating one', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItem = createTestWorkItem('Work Item With Budget', userId);

      // Create a budget line
      await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItem.id}/budgets`,
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({
          description: 'Initial budget estimate',
          plannedAmount: 5000,
          confidence: 'own_estimate',
          budgetSourceId: 'discretionary-system',
        }),
      });

      const response = await app.inject({
        method: 'GET',
        url: `/api/work-items/${workItem.id}/budgets`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ budgets: WorkItemBudgetLine[] }>();
      expect(body.budgets).toHaveLength(1);
      expect(body.budgets[0].description).toBe('Initial budget estimate');
      expect(body.budgets[0].plannedAmount).toBe(5000);
      expect(body.budgets[0].invoiceLink).toBeNull();
    });

    it('returns 404 when work item does not exist', async () => {
      const { cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );

      const response = await app.inject({
        method: 'GET',
        url: '/api/work-items/non-existent-wi/budgets',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });
  });

  // ─── POST /api/work-items/:workItemId/budgets ──────────────────────────────

  describe('POST /api/work-items/:workItemId/budgets', () => {
    it('returns 401 when not authenticated', async () => {
      const { userId } = await createUserWithSession(
        'auth-test2@example.com',
        'Auth Test2',
        'password123',
      );
      const workItem = createTestWorkItem('Test Work Item', userId);

      const response = await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItem.id}/budgets`,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ plannedAmount: 300 }),
      });

      expect(response.statusCode).toBe(401);
    });

    it('creates a budget line with all fields and returns 201', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItem = createTestWorkItem('Flooring', userId);
      const category = createTestBudgetCategory('Flooring Materials');
      const source = createTestBudgetSource('Savings', userId);
      const vendor = createTestVendor('Floor Pro', userId);

      const response = await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItem.id}/budgets`,
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({
          description: 'Hardwood flooring installation',
          plannedAmount: 8000,
          confidence: 'professional_estimate',
          budgetCategoryId: category.id,
          budgetSourceId: source.id,
          vendorId: vendor.id,
        }),
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<{ budget: WorkItemBudgetLine }>();
      expect(body.budget.id).toBeDefined();
      expect(body.budget.workItemId).toBe(workItem.id);
      expect(body.budget.description).toBe('Hardwood flooring installation');
      expect(body.budget.plannedAmount).toBe(8000);
      expect(body.budget.confidence).toBe('professional_estimate');
      expect(body.budget.confidenceMargin).toBe(0.1);
      expect(body.budget.budgetCategory?.id).toBe(category.id);
      expect(body.budget.budgetSource?.id).toBe(source.id);
      expect(body.budget.vendor?.id).toBe(vendor.id);
      expect(body.budget.actualCost).toBe(0);
      expect(body.budget.actualCostPaid).toBe(0);
      expect(body.budget.invoiceCount).toBe(0);
      expect(body.budget.invoiceLink).toBeNull();
      expect(body.budget.createdBy?.id).toBeDefined();
      expect(body.budget.createdAt).toBeDefined();
      expect(body.budget.updatedAt).toBeDefined();
    });

    it('creates a budget line with minimal fields (only plannedAmount) and returns 201', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItem = createTestWorkItem('Minimal Work Item', userId);

      const response = await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItem.id}/budgets`,
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({
          plannedAmount: 250,
          budgetSourceId: 'discretionary-system',
        }),
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<{ budget: WorkItemBudgetLine }>();
      expect(body.budget.plannedAmount).toBe(250);
      expect(body.budget.description).toBeNull();
      expect(body.budget.confidence).toBe('own_estimate');
      expect(body.budget.budgetCategory).toBeNull();
      expect(body.budget.budgetSource).not.toBeNull();
      expect(body.budget.vendor).toBeNull();
    });

    it('returns 400 when plannedAmount is missing', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItem = createTestWorkItem('Work Item', userId);

      const response = await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItem.id}/budgets`,
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({
          description: 'No amount provided',
        }),
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 when plannedAmount is negative', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItem = createTestWorkItem('Work Item', userId);

      const response = await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItem.id}/budgets`,
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({
          plannedAmount: -100,
        }),
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 404 when work item does not exist', async () => {
      const { cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/work-items/non-existent-wi/budgets',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ plannedAmount: 100 }),
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('strips unknown properties from the request body', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItem = createTestWorkItem('Work Item', userId);

      const response = await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItem.id}/budgets`,
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({
          plannedAmount: 500,
          budgetSourceId: 'discretionary-system',
          extraField: 'should-be-stripped',
          anotherExtra: 'also-stripped',
        }),
      });

      expect(response.statusCode).toBe(201);
    });

    it('accepts plannedAmount of 0', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItem = createTestWorkItem('Work Item', userId);

      const response = await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItem.id}/budgets`,
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({
          plannedAmount: 0,
          budgetSourceId: 'discretionary-system',
        }),
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<{ budget: WorkItemBudgetLine }>();
      expect(body.budget.plannedAmount).toBe(0);
    });
  });

  // ─── PATCH /api/work-items/:workItemId/budgets/:budgetId ──────────────────

  describe('PATCH /api/work-items/:workItemId/budgets/:budgetId', () => {
    it('returns 401 when not authenticated', async () => {
      const { userId } = await createUserWithSession(
        'auth-test3@example.com',
        'Auth Test3',
        'password123',
      );
      const workItem = createTestWorkItem('Work Item', userId);

      // Create a budget first
      const createResp = await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItem.id}/budgets`,
        headers: {
          cookie: `cornerstone_session=${sessionService.createSession(app.db, userId, 3600)}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ plannedAmount: 300, budgetSourceId: 'discretionary-system' }),
      });
      const budgetId = createResp.json<{ budget: WorkItemBudgetLine }>().budget.id;

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/work-items/${workItem.id}/budgets/${budgetId}`,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ plannedAmount: 400 }),
      });

      expect(response.statusCode).toBe(401);
    });

    it('updates description and returns 200', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItem = createTestWorkItem('Work Item', userId);

      const createResp = await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItem.id}/budgets`,
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({
          description: 'Original description',
          plannedAmount: 3000,
          budgetSourceId: 'discretionary-system',
        }),
      });
      const budgetId = createResp.json<{ budget: WorkItemBudgetLine }>().budget.id;

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/work-items/${workItem.id}/budgets/${budgetId}`,
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({
          description: 'Updated description',
        }),
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ budget: WorkItemBudgetLine }>();
      expect(body.budget.description).toBe('Updated description');
      expect(body.budget.plannedAmount).toBe(3000); // unchanged
    });

    it('updates plannedAmount and returns 200', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItem = createTestWorkItem('Work Item', userId);

      const createResp = await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItem.id}/budgets`,
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({
          description: 'Budget line',
          plannedAmount: 3000,
          budgetSourceId: 'discretionary-system',
        }),
      });
      const budgetId = createResp.json<{ budget: WorkItemBudgetLine }>().budget.id;

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/work-items/${workItem.id}/budgets/${budgetId}`,
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({
          plannedAmount: 4500,
        }),
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ budget: WorkItemBudgetLine }>();
      expect(body.budget.plannedAmount).toBe(4500);
      expect(body.budget.description).toBe('Budget line'); // unchanged
    });

    it('updates confidence level and returns 200', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItem = createTestWorkItem('Work Item', userId);

      const createResp = await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItem.id}/budgets`,
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({
          plannedAmount: 3000,
          confidence: 'own_estimate',
          budgetSourceId: 'discretionary-system',
        }),
      });
      const budgetId = createResp.json<{ budget: WorkItemBudgetLine }>().budget.id;

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/work-items/${workItem.id}/budgets/${budgetId}`,
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({
          confidence: 'quote',
        }),
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ budget: WorkItemBudgetLine }>();
      expect(body.budget.confidence).toBe('quote');
      expect(body.budget.confidenceMargin).toBe(0.05);
    });

    it('clears nullable fields with null and returns 200', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItem = createTestWorkItem('Work Item', userId);
      const category = createTestBudgetCategory('Electrical');

      const createResp = await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItem.id}/budgets`,
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({
          description: 'Some desc',
          plannedAmount: 1000,
          budgetCategoryId: category.id,
          budgetSourceId: 'discretionary-system',
        }),
      });
      const budgetId = createResp.json<{ budget: WorkItemBudgetLine }>().budget.id;

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/work-items/${workItem.id}/budgets/${budgetId}`,
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({
          description: null,
          budgetCategoryId: null,
        }),
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ budget: WorkItemBudgetLine }>();
      expect(body.budget.description).toBeNull();
      expect(body.budget.budgetCategory).toBeNull();
    });

    it('returns 404 when budget line does not exist', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItem = createTestWorkItem('Work Item', userId);

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/work-items/${workItem.id}/budgets/non-existent-budget`,
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ plannedAmount: 400 }),
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 404 when work item does not exist', async () => {
      const { cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/work-items/non-existent-wi/budgets/budget-123',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ plannedAmount: 400 }),
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });
  });

  // ─── DELETE /api/work-items/:workItemId/budgets/:budgetId ─────────────────

  describe('DELETE /api/work-items/:workItemId/budgets/:budgetId', () => {
    it('returns 401 when not authenticated', async () => {
      const { userId } = await createUserWithSession(
        'auth-test4@example.com',
        'Auth Test4',
        'password123',
      );
      const workItem = createTestWorkItem('Work Item', userId);

      const createResp = await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItem.id}/budgets`,
        headers: {
          cookie: `cornerstone_session=${sessionService.createSession(app.db, userId, 3600)}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ plannedAmount: 300, budgetSourceId: 'discretionary-system' }),
      });
      const budgetId = createResp.json<{ budget: WorkItemBudgetLine }>().budget.id;

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/work-items/${workItem.id}/budgets/${budgetId}`,
      });

      expect(response.statusCode).toBe(401);
    });

    it('deletes a budget line and returns 204', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItem = createTestWorkItem('Work Item', userId);

      const createResp = await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItem.id}/budgets`,
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ plannedAmount: 300, budgetSourceId: 'discretionary-system' }),
      });
      const budgetId = createResp.json<{ budget: WorkItemBudgetLine }>().budget.id;

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/work-items/${workItem.id}/budgets/${budgetId}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(204);

      // Verify it's gone
      const listResp = await app.inject({
        method: 'GET',
        url: `/api/work-items/${workItem.id}/budgets`,
        headers: { cookie },
      });
      const body = listResp.json<{ budgets: WorkItemBudgetLine[] }>();
      expect(body.budgets).toHaveLength(0);
    });

    it('returns 404 when budget line does not exist', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItem = createTestWorkItem('Work Item', userId);

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/work-items/${workItem.id}/budgets/non-existent-budget`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 404 when work item does not exist', async () => {
      const { cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/work-items/non-existent-wi/budgets/budget-123',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 409 BudgetLineInUseError when invoices are linked', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItem = createTestWorkItem('Work Item', userId);
      const vendor = createTestVendor('Contractor', userId);

      // Create a budget line
      const createResp = await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItem.id}/budgets`,
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ plannedAmount: 5000, budgetSourceId: 'discretionary-system' }),
      });
      const budgetId = createResp.json<{ budget: WorkItemBudgetLine }>().budget.id;

      // Link an invoice to this budget line directly via service
      const invoice = invoiceService.createInvoice(
        app.db,
        vendor.id,
        {
          amount: 1000,
          date: '2025-06-01',
        },
        userId,
      );

      // Create the junction row linking invoice to budget line
      app.db
        .insert(invoiceBudgetLines)
        .values({
          id: randomUUID(),
          invoiceId: invoice.id,
          workItemBudgetId: budgetId,
          itemizedAmount: 1000,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .run();

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/work-items/${workItem.id}/budgets/${budgetId}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(409);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('BUDGET_LINE_IN_USE');
    });
  });
});
