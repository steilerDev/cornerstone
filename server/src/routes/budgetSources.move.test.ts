/**
 * Route integration tests for PATCH /api/budget-sources/:sourceId/budget-lines/move
 *
 * Uses Fastify's app.inject() — no HTTP server required.
 * Setup/teardown follows the exact pattern of budgetSources.budgetLines.test.ts.
 * Covers all 10 route scenarios specified for issue #1246.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../app.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import type { FastifyInstance } from 'fastify';
import type { ApiErrorResponse, MoveBudgetLinesResponse } from '@cornerstone/shared';
import { eq } from 'drizzle-orm';
import {
  budgetSources,
  workItems,
  workItemBudgets,
  householdItems,
  householdItemBudgets,
} from '../db/schema.js';

describe('PATCH /api/budget-sources/:sourceId/budget-lines/move', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  let counter = 0;
  const uid = (prefix: string) => `${prefix}-${++counter}`;
  const ts = () => new Date().toISOString();

  beforeEach(async () => {
    originalEnv = { ...process.env };
    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-bsbl-move-route-test-'));
    process.env.DATABASE_URL = join(tempDir, 'test.db');
    process.env.SECURE_COOKIES = 'false';
    app = await buildApp();
  });

  afterEach(async () => {
    if (app) await app.close();
    process.env = originalEnv;
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  // ─── Helpers ─────────────────────────────────────────────────────────────────

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

  function createTestSource(name = 'Test Source', totalAmount = 100_000): string {
    const id = uid('src');
    const now = ts();
    app.db
      .insert(budgetSources)
      .values({
        id,
        name,
        sourceType: 'bank_loan',
        totalAmount,
        interestRate: null,
        terms: null,
        notes: null,
        status: 'active',
        createdBy: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  function createWorkItem(title = 'Test WI'): string {
    const id = uid('wi');
    const now = ts();
    app.db
      .insert(workItems)
      .values({
        id,
        title,
        status: 'not_started',
        areaId: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  function createWorkItemBudgetLine(wiId: string, sourceId: string | null): string {
    const id = uid('wib');
    const now = ts();
    app.db
      .insert(workItemBudgets)
      .values({
        id,
        workItemId: wiId,
        budgetSourceId: sourceId,
        plannedAmount: 1000,
        confidence: 'own_estimate',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  function createHouseholdItem(name = 'Test HI'): string {
    const id = uid('hi');
    const now = ts();
    app.db
      .insert(householdItems)
      .values({
        id,
        name,
        categoryId: 'hic-furniture', // seeded by migration 0016
        status: 'planned',
        areaId: null,
        quantity: 1,
        isLate: false,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  function createHouseholdItemBudgetLine(hiId: string, sourceId: string | null): string {
    const id = uid('hib');
    const now = ts();
    app.db
      .insert(householdItemBudgets)
      .values({
        id,
        householdItemId: hiId,
        budgetSourceId: sourceId,
        plannedAmount: 1000,
        confidence: 'own_estimate',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  function getWibSourceId(wibId: string): string | null {
    const row = app.db
      .select({ budgetSourceId: workItemBudgets.budgetSourceId })
      .from(workItemBudgets)
      .where(eq(workItemBudgets.id, wibId))
      .get();
    return row?.budgetSourceId ?? null;
  }

  function getHibSourceId(hibId: string): string | null {
    const row = app.db
      .select({ budgetSourceId: householdItemBudgets.budgetSourceId })
      .from(householdItemBudgets)
      .where(eq(householdItemBudgets.id, hibId))
      .get();
    return row?.budgetSourceId ?? null;
  }

  // ─── Tests ───────────────────────────────────────────────────────────────────

  // 1. 401 — unauthenticated
  it('returns 401 without authentication', async () => {
    const srcA = createTestSource();

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/budget-sources/${srcA}/budget-lines/move`,
      payload: {
        targetSourceId: 'some-target',
        workItemBudgetIds: [],
        householdItemBudgetIds: [],
      },
    });

    expect(response.statusCode).toBe(401);
    const body = response.json<ApiErrorResponse>();
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  // 2. 400 — invalid body missing targetSourceId (Fastify schema validation)
  it('returns 400 when body is missing required targetSourceId field', async () => {
    const { cookie } = await createUserWithSession('user@test.com', 'Test', 'password');
    const srcA = createTestSource();

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/budget-sources/${srcA}/budget-lines/move`,
      headers: { cookie },
      payload: {
        workItemBudgetIds: [],
        householdItemBudgetIds: [],
        // targetSourceId intentionally omitted
      },
    });

    expect(response.statusCode).toBe(400);
  });

  // 2b. 400 — invalid body missing workItemBudgetIds (Fastify schema validation)
  it('returns 400 when body is missing required workItemBudgetIds field', async () => {
    const { cookie } = await createUserWithSession('user@test.com', 'Test', 'password');
    const srcA = createTestSource();

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/budget-sources/${srcA}/budget-lines/move`,
      headers: { cookie },
      payload: {
        targetSourceId: 'some-target',
        householdItemBudgetIds: [],
        // workItemBudgetIds intentionally omitted
      },
    });

    expect(response.statusCode).toBe(400);
  });

  // 2c. 400 — empty string for targetSourceId (minLength: 1 violated)
  it('returns 400 when targetSourceId is an empty string (minLength:1 violated)', async () => {
    const { cookie } = await createUserWithSession('user@test.com', 'Test', 'password');
    const srcA = createTestSource();

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/budget-sources/${srcA}/budget-lines/move`,
      headers: { cookie },
      payload: {
        targetSourceId: '',
        workItemBudgetIds: [],
        householdItemBudgetIds: [],
      },
    });

    expect(response.statusCode).toBe(400);
  });

  // 3. 400 EMPTY_SELECTION — authenticated, both arrays empty
  it('returns 400 EMPTY_SELECTION when both ID arrays are empty', async () => {
    const { cookie } = await createUserWithSession('user@test.com', 'Test', 'password');
    const srcA = createTestSource('Source A');
    const srcB = createTestSource('Source B');

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/budget-sources/${srcA}/budget-lines/move`,
      headers: { cookie },
      payload: {
        targetSourceId: srcB,
        workItemBudgetIds: [],
        householdItemBudgetIds: [],
      },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json<ApiErrorResponse>();
    expect(body.error.code).toBe('EMPTY_SELECTION');
  });

  // 4. 400 SAME_SOURCE
  it('returns 400 SAME_SOURCE when targetSourceId equals sourceId', async () => {
    const { cookie } = await createUserWithSession('user@test.com', 'Test', 'password');
    const srcA = createTestSource('Source A');

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/budget-sources/${srcA}/budget-lines/move`,
      headers: { cookie },
      payload: {
        targetSourceId: srcA, // same as route param
        workItemBudgetIds: ['any-id'],
        householdItemBudgetIds: [],
      },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json<ApiErrorResponse>();
    expect(body.error.code).toBe('SAME_SOURCE');
  });

  // 5. 404 — sourceId not found
  it('returns 404 when sourceId does not exist', async () => {
    const { cookie } = await createUserWithSession('user@test.com', 'Test', 'password');
    const srcB = createTestSource('Target');

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/budget-sources/nonexistent-source/budget-lines/move',
      headers: { cookie },
      payload: {
        targetSourceId: srcB,
        workItemBudgetIds: [],
        householdItemBudgetIds: [],
      },
    });

    expect(response.statusCode).toBe(404);
    const body = response.json<ApiErrorResponse>();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  // 6. 404 — targetSourceId not found
  it('returns 404 when targetSourceId does not exist', async () => {
    const { cookie } = await createUserWithSession('user@test.com', 'Test', 'password');
    const srcA = createTestSource('Source A');

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/budget-sources/${srcA}/budget-lines/move`,
      headers: { cookie },
      payload: {
        targetSourceId: 'nonexistent-target',
        workItemBudgetIds: [],
        householdItemBudgetIds: [],
      },
    });

    expect(response.statusCode).toBe(404);
    const body = response.json<ApiErrorResponse>();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  // 7. 409 STALE_OWNERSHIP — ID belongs to a different source; DB unchanged
  it('returns 409 STALE_OWNERSHIP when WIB belongs to a different source; DB unchanged after', async () => {
    const { cookie } = await createUserWithSession('user@test.com', 'Test', 'password');
    const srcA = createTestSource('Source A');
    const srcB = createTestSource('Source B');
    const srcC = createTestSource('Source C');
    const wi = createWorkItem();
    const wib = createWorkItemBudgetLine(wi, srcC); // owned by srcC, not srcA

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/budget-sources/${srcA}/budget-lines/move`,
      headers: { cookie },
      payload: {
        targetSourceId: srcB,
        workItemBudgetIds: [wib],
        householdItemBudgetIds: [],
      },
    });

    expect(response.statusCode).toBe(409);
    const body = response.json<ApiErrorResponse>();
    expect(body.error.code).toBe('STALE_OWNERSHIP');

    // Verify DB unchanged: wib still references srcC
    expect(getWibSourceId(wib)).toBe(srcC);
  });

  // 8. 200 — WIB lines moved; response + DB verification
  it('returns 200 and moves WIB lines; DB updated correctly', async () => {
    const { cookie } = await createUserWithSession('user@test.com', 'Test', 'password');
    const srcA = createTestSource('Source A');
    const srcB = createTestSource('Source B');
    const wi1 = createWorkItem('WI 1');
    const wi2 = createWorkItem('WI 2');
    const wib1 = createWorkItemBudgetLine(wi1, srcA);
    const wib2 = createWorkItemBudgetLine(wi2, srcA);

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/budget-sources/${srcA}/budget-lines/move`,
      headers: { cookie },
      payload: {
        targetSourceId: srcB,
        workItemBudgetIds: [wib1, wib2],
        householdItemBudgetIds: [],
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<MoveBudgetLinesResponse>();
    expect(body.movedWorkItemLines).toBe(2);
    expect(body.movedHouseholdItemLines).toBe(0);

    // DB verification
    expect(getWibSourceId(wib1)).toBe(srcB);
    expect(getWibSourceId(wib2)).toBe(srcB);
  });

  // 9. 200 — HIB lines moved
  it('returns 200 and moves HIB lines; DB updated correctly', async () => {
    const { cookie } = await createUserWithSession('user@test.com', 'Test', 'password');
    const srcA = createTestSource('Source A');
    const srcB = createTestSource('Source B');
    const hi = createHouseholdItem('My Chair');
    const hib = createHouseholdItemBudgetLine(hi, srcA);

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/budget-sources/${srcA}/budget-lines/move`,
      headers: { cookie },
      payload: {
        targetSourceId: srcB,
        workItemBudgetIds: [],
        householdItemBudgetIds: [hib],
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<MoveBudgetLinesResponse>();
    expect(body.movedWorkItemLines).toBe(0);
    expect(body.movedHouseholdItemLines).toBe(1);

    // DB verification
    expect(getHibSourceId(hib)).toBe(srcB);
  });

  // 10. 200 — mixed WIB + HIB
  it('returns 200 and moves mixed WIB + HIB lines; both DB rows updated', async () => {
    const { cookie } = await createUserWithSession('user@test.com', 'Test', 'password');
    const srcA = createTestSource('Source A');
    const srcB = createTestSource('Source B');
    const wi = createWorkItem('Work Task');
    const hi = createHouseholdItem('Sofa');
    const wib = createWorkItemBudgetLine(wi, srcA);
    const hib = createHouseholdItemBudgetLine(hi, srcA);

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/budget-sources/${srcA}/budget-lines/move`,
      headers: { cookie },
      payload: {
        targetSourceId: srcB,
        workItemBudgetIds: [wib],
        householdItemBudgetIds: [hib],
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<MoveBudgetLinesResponse>();
    expect(body.movedWorkItemLines).toBe(1);
    expect(body.movedHouseholdItemLines).toBe(1);

    // DB verification
    expect(getWibSourceId(wib)).toBe(srcB);
    expect(getHibSourceId(hib)).toBe(srcB);
  });

  // Extra: member role can use the endpoint
  it('member user can move budget lines', async () => {
    const { cookie } = await createUserWithSession(
      'member@test.com',
      'Member',
      'password',
      'member',
    );
    const srcA = createTestSource();
    const srcB = createTestSource();
    const wi = createWorkItem();
    const wib = createWorkItemBudgetLine(wi, srcA);

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/budget-sources/${srcA}/budget-lines/move`,
      headers: { cookie },
      payload: {
        targetSourceId: srcB,
        workItemBudgetIds: [wib],
        householdItemBudgetIds: [],
      },
    });

    expect(response.statusCode).toBe(200);
  });

  // Extra: additional properties in body are stripped (not rejected)
  it('strips additional properties from the request body (additionalProperties: false)', async () => {
    const { cookie } = await createUserWithSession('user@test.com', 'Test', 'password');
    const srcA = createTestSource();
    const srcB = createTestSource();
    const wi = createWorkItem();
    const wib = createWorkItemBudgetLine(wi, srcA);

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/budget-sources/${srcA}/budget-lines/move`,
      headers: { cookie },
      payload: {
        targetSourceId: srcB,
        workItemBudgetIds: [wib],
        householdItemBudgetIds: [],
        unknownField: 'should-be-stripped', // Fastify strips extra props — still succeeds
      },
    });

    // Fastify strips extra props — still succeeds (see MEMORY.md: removeAdditional=true)
    expect(response.statusCode).toBe(200);
  });
});
