/**
 * Integration tests for the householdItemSubsidyPayback route.
 *
 * Route: GET /api/household-items/:householdItemId/subsidy-payback
 *
 * Tests:
 *   - 401 when not authenticated
 *   - 404 when household item does not exist
 *   - 200 with empty payback result when no subsidies are linked
 *   - 200 with correct payback totals for percentage subsidy
 *   - 200 with correct payback totals for fixed subsidy
 *   - 200 with correct totals for multiple subsidies (mixed types)
 *   - Rejected subsidies are excluded from the response
 *   - Response shape has all required fields
 *   - Both admin and member roles can access the endpoint
 */
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
import type { ApiErrorResponse, HouseholdItemSubsidyPaybackResponse } from '@cornerstone/shared';

describe('Household Item Subsidy Payback Routes', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;
  let entityCounter = 0;

  beforeEach(async () => {
    originalEnv = { ...process.env };
    entityCounter = 0;

    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-hi-subsidy-payback-test-'));
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
   * Helper: Create a household item via service.
   */
  function createTestHouseholdItem(name: string, userId: string): { id: string } {
    const item = householdItemService.createHouseholdItem(app.db, userId, { name });
    return { id: item.id };
  }

  /**
   * Helper: Insert a subsidy program directly into the database.
   */
  function createTestSubsidyProgram(
    options: {
      name?: string;
      reductionType?: 'percentage' | 'fixed';
      reductionValue?: number;
      applicationStatus?: 'eligible' | 'applied' | 'approved' | 'received' | 'rejected';
    } = {},
  ): string {
    const id = `sp-${++entityCounter}`;
    const timestamp = new Date(Date.now() + entityCounter).toISOString();

    app.db
      .insert(schema.subsidyPrograms)
      .values({
        id,
        name: options.name ?? `Subsidy ${id}`,
        description: null,
        eligibility: null,
        reductionType: options.reductionType ?? 'percentage',
        reductionValue: options.reductionValue ?? 10,
        applicationStatus: options.applicationStatus ?? 'eligible',
        applicationDeadline: null,
        notes: null,
        createdBy: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run();

    return id;
  }

  /**
   * Helper: Link a subsidy program to a household item.
   */
  function linkSubsidyToHouseholdItem(householdItemId: string, subsidyProgramId: string): void {
    app.db
      .insert(schema.householdItemSubsidies)
      .values({ householdItemId, subsidyProgramId })
      .run();
  }

  /**
   * Helper: Insert a household item budget line directly.
   */
  function insertBudgetLine(opts: {
    householdItemId: string;
    plannedAmount: number;
    confidence?: 'own_estimate' | 'professional_estimate' | 'quote' | 'invoice';
  }): void {
    const id = `bl-${++entityCounter}`;
    const timestamp = new Date(Date.now() + entityCounter).toISOString();

    app.db
      .insert(schema.householdItemBudgets)
      .values({
        id,
        householdItemId: opts.householdItemId,
        description: null,
        plannedAmount: opts.plannedAmount,
        confidence: opts.confidence ?? 'own_estimate',
        budgetCategoryId: null,
        budgetSourceId: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run();
  }

  // ─── Authentication ────────────────────────────────────────────────────────

  describe('authentication', () => {
    it('returns 401 when not authenticated', async () => {
      const { userId } = await createUserWithSession(
        'auth-test@example.com',
        'Auth Test',
        'password123',
      );
      const hi = createTestHouseholdItem('Test Item', userId);

      const response = await app.inject({
        method: 'GET',
        url: `/api/household-items/${hi.id}/subsidy-payback`,
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 401 with UNAUTHORIZED error code when no session provided', async () => {
      const { userId } = await createUserWithSession(
        'auth-test2@example.com',
        'Auth Test 2',
        'password123',
      );
      const hi = createTestHouseholdItem('Test Item', userId);

      const response = await app.inject({
        method: 'GET',
        url: `/api/household-items/${hi.id}/subsidy-payback`,
      });

      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 200 for a member role user', async () => {
      const { userId, cookie } = await createUserWithSession(
        'member@example.com',
        'Member User',
        'password123',
        'member',
      );
      const hi = createTestHouseholdItem('Test Item', userId);

      const response = await app.inject({
        method: 'GET',
        url: `/api/household-items/${hi.id}/subsidy-payback`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
    });

    it('returns 200 for an admin role user', async () => {
      const { userId, cookie } = await createUserWithSession(
        'admin@example.com',
        'Admin User',
        'password123',
        'admin',
      );
      const hi = createTestHouseholdItem('Test Item', userId);

      const response = await app.inject({
        method: 'GET',
        url: `/api/household-items/${hi.id}/subsidy-payback`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  // ─── Not found ─────────────────────────────────────────────────────────────

  describe('not found', () => {
    it('returns 404 when household item does not exist', async () => {
      const { cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );

      const response = await app.inject({
        method: 'GET',
        url: '/api/household-items/nonexistent-hi/subsidy-payback',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
    });

    it('returns NOT_FOUND error code when household item does not exist', async () => {
      const { cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );

      const response = await app.inject({
        method: 'GET',
        url: '/api/household-items/nonexistent-hi/subsidy-payback',
        headers: { cookie },
      });

      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });
  });

  // ─── No subsidies linked ───────────────────────────────────────────────────

  describe('no linked subsidies', () => {
    it('returns 200 with zero totals and empty subsidies array when no subsidies are linked', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const hi = createTestHouseholdItem('Empty Item', userId);

      const response = await app.inject({
        method: 'GET',
        url: `/api/household-items/${hi.id}/subsidy-payback`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<HouseholdItemSubsidyPaybackResponse>();
      expect(body.householdItemId).toBe(hi.id);
      expect(body.minTotalPayback).toBe(0);
      expect(body.maxTotalPayback).toBe(0);
      expect(body.subsidies).toEqual([]);
    });

    it('returns zero totals even when the item has budget lines but no linked subsidies', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const hi = createTestHouseholdItem('Item With Budget', userId);
      insertBudgetLine({ householdItemId: hi.id, plannedAmount: 5000 });

      const response = await app.inject({
        method: 'GET',
        url: `/api/household-items/${hi.id}/subsidy-payback`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<HouseholdItemSubsidyPaybackResponse>();
      expect(body.minTotalPayback).toBe(0);
      expect(body.maxTotalPayback).toBe(0);
      expect(body.subsidies).toHaveLength(0);
    });
  });

  // ─── Percentage subsidies ──────────────────────────────────────────────────

  describe('percentage subsidies', () => {
    it('returns correct min/max payback for percentage subsidy with own_estimate confidence', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const hi = createTestHouseholdItem('Item', userId);
      // own_estimate margin = ±20%: min=1000*0.8*10%=80, max=1000*1.2*10%=120
      insertBudgetLine({ householdItemId: hi.id, plannedAmount: 1000, confidence: 'own_estimate' });
      const spId = createTestSubsidyProgram({ reductionType: 'percentage', reductionValue: 10 });
      linkSubsidyToHouseholdItem(hi.id, spId);

      const response = await app.inject({
        method: 'GET',
        url: `/api/household-items/${hi.id}/subsidy-payback`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<HouseholdItemSubsidyPaybackResponse>();
      expect(body.minTotalPayback).toBeCloseTo(80, 2);
      expect(body.maxTotalPayback).toBeCloseTo(120, 2);
    });

    it('returns correct min/max payback for percentage subsidy with invoice confidence', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const hi = createTestHouseholdItem('Item', userId);
      // invoice margin = 0%: min=max=1000*0%*10%=100
      insertBudgetLine({ householdItemId: hi.id, plannedAmount: 1000, confidence: 'invoice' });
      const spId = createTestSubsidyProgram({ reductionType: 'percentage', reductionValue: 10 });
      linkSubsidyToHouseholdItem(hi.id, spId);

      const response = await app.inject({
        method: 'GET',
        url: `/api/household-items/${hi.id}/subsidy-payback`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<HouseholdItemSubsidyPaybackResponse>();
      expect(body.minTotalPayback).toBeCloseTo(100, 2);
      expect(body.maxTotalPayback).toBeCloseTo(100, 2);
    });

    it('returns 0 min/max when item has no budget lines and percentage subsidy is linked', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const hi = createTestHouseholdItem('Item No Lines', userId);
      const spId = createTestSubsidyProgram({ reductionType: 'percentage', reductionValue: 20 });
      linkSubsidyToHouseholdItem(hi.id, spId);

      const response = await app.inject({
        method: 'GET',
        url: `/api/household-items/${hi.id}/subsidy-payback`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<HouseholdItemSubsidyPaybackResponse>();
      expect(body.minTotalPayback).toBe(0);
      expect(body.maxTotalPayback).toBe(0);
      expect(body.subsidies[0].minPayback).toBe(0);
      expect(body.subsidies[0].maxPayback).toBe(0);
    });
  });

  // ─── Fixed subsidies ───────────────────────────────────────────────────────

  describe('fixed subsidies', () => {
    it('returns fixed reduction value as min and max payback', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const hi = createTestHouseholdItem('Item', userId);
      const spId = createTestSubsidyProgram({ reductionType: 'fixed', reductionValue: 3000 });
      linkSubsidyToHouseholdItem(hi.id, spId);

      const response = await app.inject({
        method: 'GET',
        url: `/api/household-items/${hi.id}/subsidy-payback`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<HouseholdItemSubsidyPaybackResponse>();
      expect(body.minTotalPayback).toBe(3000);
      expect(body.maxTotalPayback).toBe(3000);
      expect(body.subsidies[0].minPayback).toBe(3000);
      expect(body.subsidies[0].maxPayback).toBe(3000);
    });

    it('returns fixed amount even when item has no budget lines', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const hi = createTestHouseholdItem('Item No Lines', userId);
      const spId = createTestSubsidyProgram({ reductionType: 'fixed', reductionValue: 1500 });
      linkSubsidyToHouseholdItem(hi.id, spId);

      const response = await app.inject({
        method: 'GET',
        url: `/api/household-items/${hi.id}/subsidy-payback`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<HouseholdItemSubsidyPaybackResponse>();
      expect(body.minTotalPayback).toBe(1500);
      expect(body.maxTotalPayback).toBe(1500);
    });
  });

  // ─── Multiple subsidies ────────────────────────────────────────────────────

  describe('multiple subsidies', () => {
    it('sums paybacks from multiple linked subsidies', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const hi = createTestHouseholdItem('Item', userId);
      // invoice confidence — margin 0: min=max=1000*10%=100
      insertBudgetLine({ householdItemId: hi.id, plannedAmount: 1000, confidence: 'invoice' });

      const sp1 = createTestSubsidyProgram({ reductionType: 'percentage', reductionValue: 10 });
      const sp2 = createTestSubsidyProgram({ reductionType: 'fixed', reductionValue: 500 });
      linkSubsidyToHouseholdItem(hi.id, sp1);
      linkSubsidyToHouseholdItem(hi.id, sp2);

      const response = await app.inject({
        method: 'GET',
        url: `/api/household-items/${hi.id}/subsidy-payback`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<HouseholdItemSubsidyPaybackResponse>();
      // percentage: min=max=100; fixed: min=max=500; total: 600
      expect(body.minTotalPayback).toBeCloseTo(600, 2);
      expect(body.maxTotalPayback).toBeCloseTo(600, 2);
      expect(body.subsidies).toHaveLength(2);
    });

    it('excludes rejected subsidies from the calculation', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const hi = createTestHouseholdItem('Item', userId);
      insertBudgetLine({ householdItemId: hi.id, plannedAmount: 1000, confidence: 'invoice' });

      // approved subsidy (included): min=max=1000*10%=100
      const sp1 = createTestSubsidyProgram({
        reductionType: 'percentage',
        reductionValue: 10,
        applicationStatus: 'approved',
      });
      // rejected subsidy (excluded)
      const sp2 = createTestSubsidyProgram({
        reductionType: 'fixed',
        reductionValue: 9999,
        applicationStatus: 'rejected',
      });
      linkSubsidyToHouseholdItem(hi.id, sp1);
      linkSubsidyToHouseholdItem(hi.id, sp2);

      const response = await app.inject({
        method: 'GET',
        url: `/api/household-items/${hi.id}/subsidy-payback`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<HouseholdItemSubsidyPaybackResponse>();
      expect(body.subsidies).toHaveLength(1);
      expect(body.minTotalPayback).toBeCloseTo(100, 2);
      expect(body.maxTotalPayback).toBeCloseTo(100, 2);
    });

    it('returns zero totals when all linked subsidies are rejected', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const hi = createTestHouseholdItem('Item', userId);
      insertBudgetLine({ householdItemId: hi.id, plannedAmount: 1000, confidence: 'invoice' });

      const sp = createTestSubsidyProgram({
        reductionType: 'fixed',
        reductionValue: 5000,
        applicationStatus: 'rejected',
      });
      linkSubsidyToHouseholdItem(hi.id, sp);

      const response = await app.inject({
        method: 'GET',
        url: `/api/household-items/${hi.id}/subsidy-payback`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<HouseholdItemSubsidyPaybackResponse>();
      expect(body.minTotalPayback).toBe(0);
      expect(body.maxTotalPayback).toBe(0);
      expect(body.subsidies).toHaveLength(0);
    });

    it('includes subsidies with all non-rejected statuses', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const hi = createTestHouseholdItem('Item', userId);

      const statuses = ['eligible', 'applied', 'approved', 'received'] as const;
      for (const status of statuses) {
        const sp = createTestSubsidyProgram({
          reductionType: 'fixed',
          reductionValue: 100,
          applicationStatus: status,
        });
        linkSubsidyToHouseholdItem(hi.id, sp);
      }

      const response = await app.inject({
        method: 'GET',
        url: `/api/household-items/${hi.id}/subsidy-payback`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<HouseholdItemSubsidyPaybackResponse>();
      expect(body.subsidies).toHaveLength(4);
      expect(body.minTotalPayback).toBe(400);
      expect(body.maxTotalPayback).toBe(400);
    });
  });

  // ─── Response shape ────────────────────────────────────────────────────────

  describe('response shape', () => {
    it('returns correct householdItemId in the response', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const hi = createTestHouseholdItem('Test Item', userId);

      const response = await app.inject({
        method: 'GET',
        url: `/api/household-items/${hi.id}/subsidy-payback`,
        headers: { cookie },
      });

      const body = response.json<HouseholdItemSubsidyPaybackResponse>();
      expect(body.householdItemId).toBe(hi.id);
    });

    it('returns subsidy entry with all required fields', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const hi = createTestHouseholdItem('Item', userId);
      insertBudgetLine({ householdItemId: hi.id, plannedAmount: 1000, confidence: 'invoice' });
      const spId = createTestSubsidyProgram({
        name: 'Heat Pump Rebate',
        reductionType: 'percentage',
        reductionValue: 25,
      });
      linkSubsidyToHouseholdItem(hi.id, spId);

      const response = await app.inject({
        method: 'GET',
        url: `/api/household-items/${hi.id}/subsidy-payback`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<HouseholdItemSubsidyPaybackResponse>();
      expect(body.subsidies).toHaveLength(1);

      const entry = body.subsidies[0];
      expect(entry.subsidyProgramId).toBe(spId);
      expect(entry.name).toBe('Heat Pump Rebate');
      expect(entry.reductionType).toBe('percentage');
      expect(entry.reductionValue).toBe(25);
      expect(typeof entry.minPayback).toBe('number');
      expect(typeof entry.maxPayback).toBe('number');
      // invoice confidence margin=0: min=max=1000*25%=250
      expect(entry.minPayback).toBeCloseTo(250, 2);
      expect(entry.maxPayback).toBeCloseTo(250, 2);
    });

    it('returns all top-level fields of the response object', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const hi = createTestHouseholdItem('Item', userId);

      const response = await app.inject({
        method: 'GET',
        url: `/api/household-items/${hi.id}/subsidy-payback`,
        headers: { cookie },
      });

      const body = response.json<HouseholdItemSubsidyPaybackResponse>();
      expect(body).toHaveProperty('householdItemId');
      expect(body).toHaveProperty('minTotalPayback');
      expect(body).toHaveProperty('maxTotalPayback');
      expect(body).toHaveProperty('subsidies');
    });

    it('returns numeric minTotalPayback and maxTotalPayback in the response', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const hi = createTestHouseholdItem('Item', userId);
      const spId = createTestSubsidyProgram({ reductionType: 'fixed', reductionValue: 2500 });
      linkSubsidyToHouseholdItem(hi.id, spId);

      const response = await app.inject({
        method: 'GET',
        url: `/api/household-items/${hi.id}/subsidy-payback`,
        headers: { cookie },
      });

      const body = response.json<HouseholdItemSubsidyPaybackResponse>();
      expect(typeof body.minTotalPayback).toBe('number');
      expect(typeof body.maxTotalPayback).toBe('number');
    });

    it('does not include data from a different household item', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const hi1 = createTestHouseholdItem('HI 1', userId);
      const hi2 = createTestHouseholdItem('HI 2', userId);

      // Link a large fixed subsidy to hi2 only
      const sp = createTestSubsidyProgram({ reductionType: 'fixed', reductionValue: 99999 });
      linkSubsidyToHouseholdItem(hi2.id, sp);

      const response = await app.inject({
        method: 'GET',
        url: `/api/household-items/${hi1.id}/subsidy-payback`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<HouseholdItemSubsidyPaybackResponse>();
      // hi1 has no subsidies — totals should be 0
      expect(body.minTotalPayback).toBe(0);
      expect(body.maxTotalPayback).toBe(0);
      expect(body.subsidies).toHaveLength(0);
    });
  });
});
