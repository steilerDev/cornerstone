import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../app.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import * as householdItemService from '../services/householdItemService.js';
import type { FastifyInstance } from 'fastify';
import type {
  ApiErrorResponse,
  SubsidyProgram,
  HouseholdItemSubsidyPaybackResponse,
} from '@cornerstone/shared';
import { subsidyPrograms } from '../db/schema.js';

describe('Household Item Subsidy Routes', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    originalEnv = { ...process.env };

    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-hi-subsidy-routes-test-'));
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
   * Helper: Create a household item directly in the database.
   */
  function createTestHouseholdItem(name: string, userId: string): { id: string; name: string } {
    const householdItem = householdItemService.createHouseholdItem(app.db, userId, {
      name,
    });
    return { id: householdItem.id, name: householdItem.name };
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

  // ─── GET /api/household-items/:householdItemId/subsidies ───────────────────

  describe('GET /api/household-items/:householdItemId/subsidies', () => {
    it('returns 401 when not authenticated', async () => {
      const { userId } = await createUserWithSession(
        'auth-test@example.com',
        'Auth Test',
        'password123',
      );
      const householdItem = createTestHouseholdItem('Test Item', userId);

      const response = await app.inject({
        method: 'GET',
        url: `/api/household-items/${householdItem.id}/subsidies`,
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 200 with empty array when no subsidies are linked', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const householdItem = createTestHouseholdItem('Empty Item', userId);

      const response = await app.inject({
        method: 'GET',
        url: `/api/household-items/${householdItem.id}/subsidies`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ subsidies: SubsidyProgram[] }>();
      expect(body.subsidies).toEqual([]);
    });

    it('returns 200 with linked subsidy programs', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const householdItem = createTestHouseholdItem('Item With Subsidies', userId);
      const subsidy = createTestSubsidyProgram('Green Energy Rebate', {
        reductionType: 'percentage',
        reductionValue: 15,
      });

      // Link the subsidy
      await app.inject({
        method: 'POST',
        url: `/api/household-items/${householdItem.id}/subsidies`,
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ subsidyProgramId: subsidy.id }),
      });

      const response = await app.inject({
        method: 'GET',
        url: `/api/household-items/${householdItem.id}/subsidies`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{
        subsidies: Array<{ id: string; name: string; reductionValue: number }>;
      }>();
      expect(body.subsidies).toHaveLength(1);
      expect(body.subsidies[0]!.id).toBe(subsidy.id);
      expect(body.subsidies[0]!.name).toBe('Green Energy Rebate');
      expect(body.subsidies[0]!.reductionValue).toBe(15);
    });

    it('returns 404 when household item does not exist', async () => {
      const { cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );

      const response = await app.inject({
        method: 'GET',
        url: '/api/household-items/non-existent-hi/subsidies',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });
  });

  // ─── POST /api/household-items/:householdItemId/subsidies ──────────────────

  describe('POST /api/household-items/:householdItemId/subsidies', () => {
    it('returns 401 when not authenticated', async () => {
      const { userId } = await createUserWithSession(
        'auth-test2@example.com',
        'Auth Test2',
        'password123',
      );
      const householdItem = createTestHouseholdItem('Test Item', userId);
      const subsidy = createTestSubsidyProgram('Test Subsidy');

      const response = await app.inject({
        method: 'POST',
        url: `/api/household-items/${householdItem.id}/subsidies`,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ subsidyProgramId: subsidy.id }),
      });

      expect(response.statusCode).toBe(401);
    });

    it('links a subsidy program to a household item and returns 201', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const householdItem = createTestHouseholdItem('Item', userId);
      const subsidy = createTestSubsidyProgram('Solar Panel Rebate', {
        reductionType: 'fixed',
        reductionValue: 5000,
      });

      const response = await app.inject({
        method: 'POST',
        url: `/api/household-items/${householdItem.id}/subsidies`,
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

    it('returns 400 when subsidyProgramId is missing', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const householdItem = createTestHouseholdItem('Item', userId);

      const response = await app.inject({
        method: 'POST',
        url: `/api/household-items/${householdItem.id}/subsidies`,
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 404 when household item does not exist', async () => {
      const { cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const subsidy = createTestSubsidyProgram('Test Subsidy');

      const response = await app.inject({
        method: 'POST',
        url: '/api/household-items/non-existent-hi/subsidies',
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
      const householdItem = createTestHouseholdItem('Item', userId);

      const response = await app.inject({
        method: 'POST',
        url: `/api/household-items/${householdItem.id}/subsidies`,
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ subsidyProgramId: 'non-existent-subsidy' }),
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 409 when subsidy is already linked to household item', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const householdItem = createTestHouseholdItem('Item', userId);
      const subsidy = createTestSubsidyProgram('Duplicate Subsidy');

      // First link
      await app.inject({
        method: 'POST',
        url: `/api/household-items/${householdItem.id}/subsidies`,
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ subsidyProgramId: subsidy.id }),
      });

      // Second link (duplicate)
      const response = await app.inject({
        method: 'POST',
        url: `/api/household-items/${householdItem.id}/subsidies`,
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ subsidyProgramId: subsidy.id }),
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
      const subsidy = createTestSubsidyProgram('Subsidy With Extra');

      const response = await app.inject({
        method: 'POST',
        url: `/api/household-items/${householdItem.id}/subsidies`,
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({
          subsidyProgramId: subsidy.id,
          extraField: 'should-be-stripped',
        }),
      });

      expect(response.statusCode).toBe(201);
    });
  });

  // ─── DELETE /api/household-items/:householdItemId/subsidies/:subsidyProgramId

  describe('DELETE /api/household-items/:householdItemId/subsidies/:subsidyProgramId', () => {
    it('returns 401 when not authenticated', async () => {
      const { userId } = await createUserWithSession(
        'auth-test3@example.com',
        'Auth Test3',
        'password123',
      );
      const householdItem = createTestHouseholdItem('Test Item', userId);
      const subsidy = createTestSubsidyProgram('Test Subsidy');

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/household-items/${householdItem.id}/subsidies/${subsidy.id}`,
      });

      expect(response.statusCode).toBe(401);
    });

    it('unlinks a subsidy program from a household item and returns 204', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const householdItem = createTestHouseholdItem('Item', userId);
      const subsidy = createTestSubsidyProgram('Subsidy To Remove');

      // Link first
      await app.inject({
        method: 'POST',
        url: `/api/household-items/${householdItem.id}/subsidies`,
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ subsidyProgramId: subsidy.id }),
      });

      // Now unlink
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/household-items/${householdItem.id}/subsidies/${subsidy.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(204);

      // Verify it's unlinked
      const listResp = await app.inject({
        method: 'GET',
        url: `/api/household-items/${householdItem.id}/subsidies`,
        headers: { cookie },
      });
      const body = listResp.json<{ subsidies: SubsidyProgram[] }>();
      expect(body.subsidies).toHaveLength(0);
    });

    it('returns 404 when subsidy link does not exist', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const householdItem = createTestHouseholdItem('Item', userId);

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/household-items/${householdItem.id}/subsidies/non-existent-subsidy`,
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
      const subsidy = createTestSubsidyProgram('Test Subsidy');

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/household-items/non-existent-hi/subsidies/${subsidy.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });
  });

  // ─── GET /api/household-items/:householdItemId/subsidy-payback ──────────────

  describe('GET /api/household-items/:householdItemId/subsidy-payback', () => {
    it('returns 401 when not authenticated', async () => {
      const { userId } = await createUserWithSession(
        'auth-test4@example.com',
        'Auth Test4',
        'password123',
      );
      const householdItem = createTestHouseholdItem('Test Item', userId);

      const response = await app.inject({
        method: 'GET',
        url: `/api/household-items/${householdItem.id}/subsidy-payback`,
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 200 with payback response structure', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const householdItem = createTestHouseholdItem('Item', userId);

      const response = await app.inject({
        method: 'GET',
        url: `/api/household-items/${householdItem.id}/subsidy-payback`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<HouseholdItemSubsidyPaybackResponse>();
      expect(body.householdItemId).toBe(householdItem.id);
      expect(body.minTotalPayback).toBeDefined();
      expect(body.maxTotalPayback).toBeDefined();
      expect(body.subsidies).toBeDefined();
      expect(Array.isArray(body.subsidies)).toBe(true);
    });

    it('returns 0 payback when no subsidies are linked', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const householdItem = createTestHouseholdItem('Item', userId);

      const response = await app.inject({
        method: 'GET',
        url: `/api/household-items/${householdItem.id}/subsidy-payback`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<HouseholdItemSubsidyPaybackResponse>();
      expect(body.minTotalPayback).toBe(0);
      expect(body.maxTotalPayback).toBe(0);
      expect(body.subsidies).toHaveLength(0);
    });

    it('returns subsidies in payback breakdown', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const householdItem = createTestHouseholdItem('Item', userId);
      const subsidy = createTestSubsidyProgram('Energy Rebate', {
        reductionType: 'fixed',
        reductionValue: 1000,
      });

      // Link subsidy
      await app.inject({
        method: 'POST',
        url: `/api/household-items/${householdItem.id}/subsidies`,
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ subsidyProgramId: subsidy.id }),
      });

      const response = await app.inject({
        method: 'GET',
        url: `/api/household-items/${householdItem.id}/subsidy-payback`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<HouseholdItemSubsidyPaybackResponse>();
      expect(body.subsidies.length).toBeGreaterThan(0);
      const linkedSubsidy = body.subsidies.find((s) => s.subsidyProgramId === subsidy.id);
      expect(linkedSubsidy).toBeDefined();
    });

    it('returns 404 when household item does not exist', async () => {
      const { cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );

      const response = await app.inject({
        method: 'GET',
        url: '/api/household-items/non-existent-hi/subsidy-payback',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });
  });
});
