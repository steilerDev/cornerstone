import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../app.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import type { FastifyInstance } from 'fastify';
import type { ApiErrorResponse } from '@cornerstone/shared';
import { subsidyPrograms, workItems } from '../db/schema.js';

describe('Work Item Subsidy Routes', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    originalEnv = { ...process.env };

    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-wi-subsidy-routes-test-'));
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

  let entityCounter = 0;

  /**
   * Helper: Insert a work item directly into the database.
   */
  function createTestWorkItem(title: string, userId: string): { id: string; title: string } {
    const id = `wi-${++entityCounter}`;
    const timestamp = new Date(Date.now() + entityCounter).toISOString();

    app.db
      .insert(workItems)
      .values({
        id,
        title,
        status: 'not_started',
        createdBy: userId,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run();

    return { id, title };
  }

  /**
   * Helper: Insert a subsidy program directly into the database.
   */
  function createTestSubsidyProgram(
    name: string,
    options: {
      reductionType?: 'percentage' | 'fixed';
      reductionValue?: number;
    } = {},
  ): { id: string; name: string } {
    const id = `subsidy-${++entityCounter}`;
    const timestamp = new Date(Date.now() + entityCounter).toISOString();

    app.db
      .insert(subsidyPrograms)
      .values({
        id,
        name,
        description: null,
        eligibility: null,
        reductionType: options.reductionType ?? 'percentage',
        reductionValue: options.reductionValue ?? 10,
        applicationStatus: 'eligible',
        applicationDeadline: null,
        notes: null,
        createdBy: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run();

    return { id, name };
  }

  // ─── GET /api/work-items/:workItemId/subsidies ─────────────────────────────

  describe('GET /api/work-items/:workItemId/subsidies', () => {
    it('returns 401 when not authenticated', async () => {
      const { userId } = await createUserWithSession(
        'auth-test@example.com',
        'Auth Test',
        'password123',
      );
      const workItem = createTestWorkItem('Test Work Item', userId);

      const response = await app.inject({
        method: 'GET',
        url: `/api/work-items/${workItem.id}/subsidies`,
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns empty subsidies array when no subsidies are linked', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItem = createTestWorkItem('Empty Work Item', userId);

      const response = await app.inject({
        method: 'GET',
        url: `/api/work-items/${workItem.id}/subsidies`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ subsidies: unknown[] }>();
      expect(body.subsidies).toEqual([]);
    });

    it('returns linked subsidy programs', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItem = createTestWorkItem('Work Item With Subsidies', userId);
      const subsidy = createTestSubsidyProgram('Green Energy Rebate', {
        reductionType: 'percentage',
        reductionValue: 15,
      });

      // Link the subsidy
      await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItem.id}/subsidies`,
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ subsidyProgramId: subsidy.id }),
      });

      const response = await app.inject({
        method: 'GET',
        url: `/api/work-items/${workItem.id}/subsidies`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{
        subsidies: Array<{ id: string; name: string; reductionValue: number }>;
      }>();
      expect(body.subsidies).toHaveLength(1);
      expect(body.subsidies[0].id).toBe(subsidy.id);
      expect(body.subsidies[0].name).toBe('Green Energy Rebate');
      expect(body.subsidies[0].reductionValue).toBe(15);
    });

    it('returns 404 when work item does not exist', async () => {
      const { cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );

      const response = await app.inject({
        method: 'GET',
        url: '/api/work-items/non-existent-wi/subsidies',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('member can list subsidies on a work item', async () => {
      const { userId, cookie } = await createUserWithSession(
        'member@example.com',
        'Member',
        'password123',
        'member',
      );
      const workItem = createTestWorkItem('Member Accessible', userId);

      const response = await app.inject({
        method: 'GET',
        url: `/api/work-items/${workItem.id}/subsidies`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
    });

    it('admin can list subsidies on a work item', async () => {
      const { userId, cookie } = await createUserWithSession(
        'admin@example.com',
        'Admin',
        'password123',
        'admin',
      );
      const workItem = createTestWorkItem('Admin Accessible', userId);

      const response = await app.inject({
        method: 'GET',
        url: `/api/work-items/${workItem.id}/subsidies`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  // ─── POST /api/work-items/:workItemId/subsidies ────────────────────────────

  describe('POST /api/work-items/:workItemId/subsidies', () => {
    it('returns 401 when not authenticated', async () => {
      const { userId } = await createUserWithSession(
        'auth-test2@example.com',
        'Auth Test2',
        'password123',
      );
      const workItem = createTestWorkItem('Test Work Item', userId);
      const subsidy = createTestSubsidyProgram('Test Subsidy');

      const response = await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItem.id}/subsidies`,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ subsidyProgramId: subsidy.id }),
      });

      expect(response.statusCode).toBe(401);
    });

    it('links a subsidy program to a work item and returns 201 with subsidy', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItem = createTestWorkItem('Work Item', userId);
      const subsidy = createTestSubsidyProgram('Solar Panel Rebate', {
        reductionType: 'fixed',
        reductionValue: 5000,
      });

      const response = await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItem.id}/subsidies`,
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ subsidyProgramId: subsidy.id }),
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<{
        subsidy: { id: string; name: string; reductionType: string; reductionValue: number };
      }>();
      expect(body.subsidy.id).toBe(subsidy.id);
      expect(body.subsidy.name).toBe('Solar Panel Rebate');
      expect(body.subsidy.reductionType).toBe('fixed');
      expect(body.subsidy.reductionValue).toBe(5000);
    });

    it('returns 400 when subsidyProgramId is missing from body', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItem = createTestWorkItem('Work Item', userId);

      const response = await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItem.id}/subsidies`,
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 404 when work item does not exist', async () => {
      const { cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const subsidy = createTestSubsidyProgram('Test Subsidy');

      const response = await app.inject({
        method: 'POST',
        url: '/api/work-items/non-existent-wi/subsidies',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ subsidyProgramId: subsidy.id }),
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 404 when subsidy program does not exist', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItem = createTestWorkItem('Work Item', userId);

      const response = await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItem.id}/subsidies`,
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ subsidyProgramId: 'non-existent-subsidy' }),
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 409 when subsidy is already linked to work item', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItem = createTestWorkItem('Work Item', userId);
      const subsidy = createTestSubsidyProgram('Duplicate Subsidy');

      // First link
      await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItem.id}/subsidies`,
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ subsidyProgramId: subsidy.id }),
      });

      // Second link (duplicate)
      const response = await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItem.id}/subsidies`,
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ subsidyProgramId: subsidy.id }),
      });

      expect(response.statusCode).toBe(409);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('CONFLICT');
    });

    it('strips unknown properties from the request body (additionalProperties: false)', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItem = createTestWorkItem('Work Item', userId);
      const subsidy = createTestSubsidyProgram('Subsidy With Extra');

      const response = await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItem.id}/subsidies`,
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({
          subsidyProgramId: subsidy.id,
          extraField: 'should-be-stripped',
        }),
      });

      expect(response.statusCode).toBe(201);
    });
  });

  // ─── DELETE /api/work-items/:workItemId/subsidies/:subsidyProgramId ─────────

  describe('DELETE /api/work-items/:workItemId/subsidies/:subsidyProgramId', () => {
    it('returns 401 when not authenticated', async () => {
      const { userId } = await createUserWithSession(
        'auth-test3@example.com',
        'Auth Test3',
        'password123',
      );
      const workItem = createTestWorkItem('Test Work Item', userId);
      const subsidy = createTestSubsidyProgram('Test Subsidy');

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/work-items/${workItem.id}/subsidies/${subsidy.id}`,
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 204 on successful unlink', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItem = createTestWorkItem('Work Item', userId);
      const subsidy = createTestSubsidyProgram('Subsidy To Remove');

      // Link first
      await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItem.id}/subsidies`,
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ subsidyProgramId: subsidy.id }),
      });

      // Now unlink
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/work-items/${workItem.id}/subsidies/${subsidy.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(204);
    });

    it('subsidy is no longer listed after unlink', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItem = createTestWorkItem('Work Item', userId);
      const subsidy = createTestSubsidyProgram('Subsidy To Unlink');

      await app.inject({
        method: 'POST',
        url: `/api/work-items/${workItem.id}/subsidies`,
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ subsidyProgramId: subsidy.id }),
      });

      await app.inject({
        method: 'DELETE',
        url: `/api/work-items/${workItem.id}/subsidies/${subsidy.id}`,
        headers: { cookie },
      });

      const listResponse = await app.inject({
        method: 'GET',
        url: `/api/work-items/${workItem.id}/subsidies`,
        headers: { cookie },
      });

      const body = listResponse.json<{ subsidies: unknown[] }>();
      expect(body.subsidies).toEqual([]);
    });

    it('returns 404 when work item does not exist', async () => {
      const { cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const subsidy = createTestSubsidyProgram('Test Subsidy');

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/work-items/non-existent-wi/subsidies/${subsidy.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 404 when subsidy is not linked to work item', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItem = createTestWorkItem('Work Item', userId);
      const subsidy = createTestSubsidyProgram('Unlinked Subsidy');

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/work-items/${workItem.id}/subsidies/${subsidy.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 404 when subsidyProgramId does not exist at all', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItem = createTestWorkItem('Work Item', userId);

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/work-items/${workItem.id}/subsidies/non-existent-subsidy`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
