import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../app.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import * as householdItemService from '../services/householdItemService.js';
import * as schema from '../db/schema.js';
import type { FastifyInstance } from 'fastify';
import type { ApiErrorResponse, HouseholdItemWorkItemSummary } from '@cornerstone/shared';

describe('Household Item Work Items Routes', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    originalEnv = { ...process.env };

    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-hi-wi-routes-test-'));
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
  ): Promise<{ userId: string; cookie: string }> {
    const user = await userService.createLocalUser(app.db, email, displayName, password, 'member');
    const sessionToken = sessionService.createSession(app.db, user.id, 3600);
    return {
      userId: user.id,
      cookie: `cornerstone_session=${sessionToken}`,
    };
  }

  let entityCounter = 0;

  /**
   * Helper: Create a household item directly via the service.
   */
  function createTestHouseholdItem(name: string, userId: string): { id: string; name: string } {
    const householdItem = householdItemService.createHouseholdItem(app.db, userId, { name });
    return { id: householdItem.id, name: householdItem.name };
  }

  /**
   * Helper: Create a work item directly in the database.
   */
  function createTestWorkItem(
    title: string,
    userId: string,
    opts?: { startDate?: string | null; endDate?: string | null },
  ): { id: string; title: string } {
    const id = `wi-test-${++entityCounter}`;
    const timestamp = new Date(Date.now() + entityCounter).toISOString();

    app.db
      .insert(schema.workItems)
      .values({
        id,
        title,
        status: 'not_started',
        startDate: opts?.startDate ?? null,
        endDate: opts?.endDate ?? null,
        createdBy: userId,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run();

    return { id, title };
  }

  // ─── GET /api/household-items/:id/work-items ──────────────────────────────

  describe('GET /api/household-items/:id/work-items', () => {
    it('returns 401 when not authenticated', async () => {
      const { userId } = await createUserWithSession(
        'auth-test@example.com',
        'Auth Test',
        'password123',
      );
      const householdItem = createTestHouseholdItem('Test Item', userId);

      const response = await app.inject({
        method: 'GET',
        url: `/api/household-items/${householdItem.id}/work-items`,
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 200 with empty array when no work items are linked', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const householdItem = createTestHouseholdItem('Empty Item', userId);

      const response = await app.inject({
        method: 'GET',
        url: `/api/household-items/${householdItem.id}/work-items`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ workItems: HouseholdItemWorkItemSummary[] }>();
      expect(body.workItems).toEqual([]);
    });

    it('returns 200 with linked work items including startDate and endDate fields', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const householdItem = createTestHouseholdItem('Item With Tasks', userId);
      const startDate = '2026-04-01T00:00:00.000Z';
      const endDate = '2026-04-15T00:00:00.000Z';
      const workItem = createTestWorkItem('Scheduled Task', userId, { startDate, endDate });

      // Link the work item
      await app.inject({
        method: 'POST',
        url: `/api/household-items/${householdItem.id}/work-items`,
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ workItemId: workItem.id }),
      });

      const response = await app.inject({
        method: 'GET',
        url: `/api/household-items/${householdItem.id}/work-items`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ workItems: HouseholdItemWorkItemSummary[] }>();
      expect(body.workItems).toHaveLength(1);
      expect(body.workItems[0]).toMatchObject({
        id: workItem.id,
        title: 'Scheduled Task',
        status: 'not_started',
        startDate,
        endDate,
        assignedUser: null,
      });
    });

    it('returns 404 when household item does not exist', async () => {
      const { cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );

      const response = await app.inject({
        method: 'GET',
        url: '/api/household-items/non-existent-hi/work-items',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });
  });

  // ─── POST /api/household-items/:id/work-items ──────────────────────────────

  describe('POST /api/household-items/:id/work-items', () => {
    it('returns 401 when not authenticated', async () => {
      const { userId } = await createUserWithSession(
        'auth-test2@example.com',
        'Auth Test2',
        'password123',
      );
      const householdItem = createTestHouseholdItem('Test Item', userId);
      const workItem = createTestWorkItem('Test Task', userId);

      const response = await app.inject({
        method: 'POST',
        url: `/api/household-items/${householdItem.id}/work-items`,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ workItemId: workItem.id }),
      });

      expect(response.statusCode).toBe(401);
    });

    it('links a work item to a household item and returns 201', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const householdItem = createTestHouseholdItem('Item', userId);
      const workItem = createTestWorkItem('Task To Link', userId);

      const response = await app.inject({
        method: 'POST',
        url: `/api/household-items/${householdItem.id}/work-items`,
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ workItemId: workItem.id }),
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<{ workItem: HouseholdItemWorkItemSummary }>();
      expect(body.workItem).toMatchObject({
        id: workItem.id,
        title: 'Task To Link',
        status: 'not_started',
        startDate: null,
        endDate: null,
        assignedUser: null,
      });
    });

    it('returns 400 when workItemId is missing from body', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const householdItem = createTestHouseholdItem('Item', userId);

      const response = await app.inject({
        method: 'POST',
        url: `/api/household-items/${householdItem.id}/work-items`,
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 404 when household item does not exist', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItem = createTestWorkItem('Task', userId);

      const response = await app.inject({
        method: 'POST',
        url: '/api/household-items/non-existent-hi/work-items',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ workItemId: workItem.id }),
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 404 when work item does not exist', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const householdItem = createTestHouseholdItem('Item', userId);

      const response = await app.inject({
        method: 'POST',
        url: `/api/household-items/${householdItem.id}/work-items`,
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ workItemId: 'non-existent-wi' }),
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 409 when work item is already linked to household item', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const householdItem = createTestHouseholdItem('Item', userId);
      const workItem = createTestWorkItem('Task', userId);

      // First link
      await app.inject({
        method: 'POST',
        url: `/api/household-items/${householdItem.id}/work-items`,
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ workItemId: workItem.id }),
      });

      // Second link (duplicate)
      const response = await app.inject({
        method: 'POST',
        url: `/api/household-items/${householdItem.id}/work-items`,
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ workItemId: workItem.id }),
      });

      expect(response.statusCode).toBe(409);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('CONFLICT');
    });

    it('strips unknown properties from the request body', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const householdItem = createTestHouseholdItem('Item', userId);
      const workItem = createTestWorkItem('Task', userId);

      const response = await app.inject({
        method: 'POST',
        url: `/api/household-items/${householdItem.id}/work-items`,
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({
          workItemId: workItem.id,
          extraField: 'should-be-stripped',
        }),
      });

      expect(response.statusCode).toBe(201);
    });
  });

  // ─── DELETE /api/household-items/:id/work-items/:workItemId ────────────────

  describe('DELETE /api/household-items/:id/work-items/:workItemId', () => {
    it('returns 401 when not authenticated', async () => {
      const { userId } = await createUserWithSession(
        'auth-test3@example.com',
        'Auth Test3',
        'password123',
      );
      const householdItem = createTestHouseholdItem('Test Item', userId);
      const workItem = createTestWorkItem('Test Task', userId);

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/household-items/${householdItem.id}/work-items/${workItem.id}`,
      });

      expect(response.statusCode).toBe(401);
    });

    it('unlinks a work item from a household item and returns 204', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const householdItem = createTestHouseholdItem('Item', userId);
      const workItem = createTestWorkItem('Task To Remove', userId);

      // Link first
      await app.inject({
        method: 'POST',
        url: `/api/household-items/${householdItem.id}/work-items`,
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ workItemId: workItem.id }),
      });

      // Now unlink
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/household-items/${householdItem.id}/work-items/${workItem.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(204);

      // Verify it's unlinked
      const listResp = await app.inject({
        method: 'GET',
        url: `/api/household-items/${householdItem.id}/work-items`,
        headers: { cookie },
      });
      const body = listResp.json<{ workItems: HouseholdItemWorkItemSummary[] }>();
      expect(body.workItems).toHaveLength(0);
    });

    it('returns 404 when work item link does not exist', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const householdItem = createTestHouseholdItem('Item', userId);

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/household-items/${householdItem.id}/work-items/non-existent-wi`,
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
        url: '/api/household-items/non-existent-hi/work-items/non-existent-wi',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });
  });
});
