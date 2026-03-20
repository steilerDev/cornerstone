import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../app.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import * as householdItemService from '../services/householdItemService.js';
import * as budgetSourceService from '../services/budgetSourceService.js';
import * as vendorService from '../services/vendorService.js';
import type { FastifyInstance } from 'fastify';
import type { ApiErrorResponse, HouseholdItemBudgetLine } from '@cornerstone/shared';

describe('Household Item Budget Routes', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    originalEnv = { ...process.env };

    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-hi-budget-routes-test-'));
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
   * Helper: Create a household item directly in the database.
   */
  function createTestHouseholdItem(name: string, userId: string): { id: string; name: string } {
    const householdItem = householdItemService.createHouseholdItem(app.db, userId, {
      name,
    });
    return { id: householdItem.id, name: householdItem.name };
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

  // ─── GET /api/household-items/:householdItemId/budgets ─────────────────────

  describe('GET /api/household-items/:householdItemId/budgets', () => {
    it('returns 401 when not authenticated', async () => {
      const { userId } = await createUserWithSession(
        'auth-test@example.com',
        'Auth Test',
        'password123',
      );
      const householdItem = createTestHouseholdItem('Test Item', userId);

      const response = await app.inject({
        method: 'GET',
        url: `/api/household-items/${householdItem.id}/budgets`,
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 200 with empty array when no budgets exist', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const householdItem = createTestHouseholdItem('Empty Item', userId);

      const response = await app.inject({
        method: 'GET',
        url: `/api/household-items/${householdItem.id}/budgets`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ budgets: HouseholdItemBudgetLine[] }>();
      expect(body.budgets).toEqual([]);
    });

    it('returns 200 with budget lines after creating one', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const householdItem = createTestHouseholdItem('Item With Budget', userId);

      // Create a budget line
      await app.inject({
        method: 'POST',
        url: `/api/household-items/${householdItem.id}/budgets`,
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({
          description: 'Initial budget estimate',
          plannedAmount: 500,
          confidence: 'own_estimate',
          budgetSourceId: 'discretionary-system',
        }),
      });

      const response = await app.inject({
        method: 'GET',
        url: `/api/household-items/${householdItem.id}/budgets`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ budgets: HouseholdItemBudgetLine[] }>();
      expect(body.budgets).toHaveLength(1);
      expect(body.budgets[0].description).toBe('Initial budget estimate');
      expect(body.budgets[0].plannedAmount).toBe(500);
    });

    it('returns 404 when household item does not exist', async () => {
      const { cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );

      const response = await app.inject({
        method: 'GET',
        url: '/api/household-items/non-existent-hi/budgets',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });
  });

  // ─── POST /api/household-items/:householdItemId/budgets ────────────────────

  describe('POST /api/household-items/:householdItemId/budgets', () => {
    it('returns 401 when not authenticated', async () => {
      const { userId } = await createUserWithSession(
        'auth-test2@example.com',
        'Auth Test2',
        'password123',
      );
      const householdItem = createTestHouseholdItem('Test Item', userId);

      const response = await app.inject({
        method: 'POST',
        url: `/api/household-items/${householdItem.id}/budgets`,
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
      const householdItem = createTestHouseholdItem('Item', userId);
      // Note: budgetCategoryId sent by the client is ignored by the service —
      // the service always forces 'bc-household-items' as the category.
      const source = createTestBudgetSource('Savings', userId);
      const vendor = createTestVendor('Home Depot', userId);

      const response = await app.inject({
        method: 'POST',
        url: `/api/household-items/${householdItem.id}/budgets`,
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({
          description: 'Wood flooring',
          plannedAmount: 1500,
          confidence: 'professional_estimate',
          budgetSourceId: source.id,
          vendorId: vendor.id,
        }),
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<{ budget: HouseholdItemBudgetLine }>();
      expect(body.budget.id).toBeDefined();
      expect(body.budget.householdItemId).toBe(householdItem.id);
      expect(body.budget.description).toBe('Wood flooring');
      expect(body.budget.plannedAmount).toBe(1500);
      expect(body.budget.confidence).toBe('professional_estimate');
      // Budget category is always auto-assigned to 'bc-household-items'
      expect(body.budget.budgetCategory?.id).toBe('bc-household-items');
      expect(body.budget.budgetSource?.id).toBe(source.id);
      expect(body.budget.vendor?.id).toBe(vendor.id);
      expect(body.budget.actualCost).toBe(0);
      expect(body.budget.actualCostPaid).toBe(0);
      expect(body.budget.invoiceCount).toBe(0);
    });

    it('creates a budget line with minimal fields (only plannedAmount)', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const householdItem = createTestHouseholdItem('Minimal Item', userId);

      const response = await app.inject({
        method: 'POST',
        url: `/api/household-items/${householdItem.id}/budgets`,
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({
          plannedAmount: 250,
          budgetSourceId: 'discretionary-system',
        }),
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<{ budget: HouseholdItemBudgetLine }>();
      expect(body.budget.plannedAmount).toBe(250);
      expect(body.budget.description).toBeNull();
      expect(body.budget.confidence).toBe('own_estimate');
      // budgetCategoryId is auto-assigned to 'bc-household-items' by the service
      expect(body.budget.budgetCategory?.id).toBe('bc-household-items');
      expect(body.budget.budgetSource).not.toBeNull();
      expect(body.budget.vendor).toBeNull();
    });

    it('returns 400 when plannedAmount is missing', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const householdItem = createTestHouseholdItem('Item', userId);

      const response = await app.inject({
        method: 'POST',
        url: `/api/household-items/${householdItem.id}/budgets`,
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
      const householdItem = createTestHouseholdItem('Item', userId);

      const response = await app.inject({
        method: 'POST',
        url: `/api/household-items/${householdItem.id}/budgets`,
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({
          plannedAmount: -100,
        }),
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 404 when household item does not exist', async () => {
      const { cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/household-items/non-existent-hi/budgets',
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
      const householdItem = createTestHouseholdItem('Item', userId);

      const response = await app.inject({
        method: 'POST',
        url: `/api/household-items/${householdItem.id}/budgets`,
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
  });

  // ─── PATCH /api/household-items/:householdItemId/budgets/:budgetId ─────────

  describe('PATCH /api/household-items/:householdItemId/budgets/:budgetId', () => {
    it('returns 401 when not authenticated', async () => {
      const { userId } = await createUserWithSession(
        'auth-test3@example.com',
        'Auth Test3',
        'password123',
      );
      const householdItem = createTestHouseholdItem('Item', userId);

      // Create a budget first
      const createResp = await app.inject({
        method: 'POST',
        url: `/api/household-items/${householdItem.id}/budgets`,
        headers: {
          cookie: `cornerstone_session=${sessionService.createSession(app.db, userId, 3600)}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ plannedAmount: 300, budgetSourceId: 'discretionary-system' }),
      });
      const budgetId = createResp.json<{ budget: HouseholdItemBudgetLine }>().budget.id;

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/household-items/${householdItem.id}/budgets/${budgetId}`,
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
      const householdItem = createTestHouseholdItem('Item', userId);

      const createResp = await app.inject({
        method: 'POST',
        url: `/api/household-items/${householdItem.id}/budgets`,
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({
          description: 'Original description',
          plannedAmount: 300,
          budgetSourceId: 'discretionary-system',
        }),
      });
      const budgetId = createResp.json<{ budget: HouseholdItemBudgetLine }>().budget.id;

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/household-items/${householdItem.id}/budgets/${budgetId}`,
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({
          description: 'Updated description',
        }),
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ budget: HouseholdItemBudgetLine }>();
      expect(body.budget.description).toBe('Updated description');
      expect(body.budget.plannedAmount).toBe(300); // Unchanged
    });

    it('updates plannedAmount and returns 200', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const householdItem = createTestHouseholdItem('Item', userId);

      const createResp = await app.inject({
        method: 'POST',
        url: `/api/household-items/${householdItem.id}/budgets`,
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({
          description: 'Budget line',
          plannedAmount: 300,
          budgetSourceId: 'discretionary-system',
        }),
      });
      const budgetId = createResp.json<{ budget: HouseholdItemBudgetLine }>().budget.id;

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/household-items/${householdItem.id}/budgets/${budgetId}`,
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({
          plannedAmount: 750,
        }),
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ budget: HouseholdItemBudgetLine }>();
      expect(body.budget.plannedAmount).toBe(750);
      expect(body.budget.description).toBe('Budget line'); // Unchanged
    });

    it('returns 404 when budget line does not exist', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const householdItem = createTestHouseholdItem('Item', userId);

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/household-items/${householdItem.id}/budgets/non-existent-budget`,
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ plannedAmount: 400 }),
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 404 when household item does not exist', async () => {
      const { cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/household-items/non-existent-hi/budgets/budget-123',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ plannedAmount: 400 }),
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('updates confidence level', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const householdItem = createTestHouseholdItem('Item', userId);

      const createResp = await app.inject({
        method: 'POST',
        url: `/api/household-items/${householdItem.id}/budgets`,
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({
          plannedAmount: 300,
          confidence: 'own_estimate',
          budgetSourceId: 'discretionary-system',
        }),
      });
      const budgetId = createResp.json<{ budget: HouseholdItemBudgetLine }>().budget.id;

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/household-items/${householdItem.id}/budgets/${budgetId}`,
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({
          confidence: 'invoice',
        }),
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ budget: HouseholdItemBudgetLine }>();
      expect(body.budget.confidence).toBe('invoice');
    });
  });

  // ─── DELETE /api/household-items/:householdItemId/budgets/:budgetId ────────

  describe('DELETE /api/household-items/:householdItemId/budgets/:budgetId', () => {
    it('returns 401 when not authenticated', async () => {
      const { userId } = await createUserWithSession(
        'auth-test4@example.com',
        'Auth Test4',
        'password123',
      );
      const householdItem = createTestHouseholdItem('Item', userId);

      const createResp = await app.inject({
        method: 'POST',
        url: `/api/household-items/${householdItem.id}/budgets`,
        headers: {
          cookie: `cornerstone_session=${sessionService.createSession(app.db, userId, 3600)}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ plannedAmount: 300, budgetSourceId: 'discretionary-system' }),
      });
      const budgetId = createResp.json<{ budget: HouseholdItemBudgetLine }>().budget.id;

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/household-items/${householdItem.id}/budgets/${budgetId}`,
      });

      expect(response.statusCode).toBe(401);
    });

    it('deletes a budget line and returns 204', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const householdItem = createTestHouseholdItem('Item', userId);

      const createResp = await app.inject({
        method: 'POST',
        url: `/api/household-items/${householdItem.id}/budgets`,
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ plannedAmount: 300, budgetSourceId: 'discretionary-system' }),
      });
      const budgetId = createResp.json<{ budget: HouseholdItemBudgetLine }>().budget.id;

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/household-items/${householdItem.id}/budgets/${budgetId}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(204);

      // Verify it's deleted by attempting to fetch budgets
      const listResp = await app.inject({
        method: 'GET',
        url: `/api/household-items/${householdItem.id}/budgets`,
        headers: { cookie },
      });
      const body = listResp.json<{ budgets: HouseholdItemBudgetLine[] }>();
      expect(body.budgets).toHaveLength(0);
    });

    it('returns 404 when budget line does not exist', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const householdItem = createTestHouseholdItem('Item', userId);

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/household-items/${householdItem.id}/budgets/non-existent-budget`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 404 when household item does not exist', async () => {
      const { cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/household-items/non-existent-hi/budgets/budget-123',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });
  });
});
