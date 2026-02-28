import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../app.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import type { FastifyInstance } from 'fastify';
import type { ApiErrorResponse, WorkItemSubsidyPaybackResponse } from '@cornerstone/shared';
import {
  workItems,
  subsidyPrograms,
  workItemSubsidies,
  workItemBudgets,
  budgetCategories,
  subsidyProgramCategories,
  vendors,
  invoices,
} from '../db/schema.js';

describe('Work Item Subsidy Payback Routes', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;
  let entityCounter = 0;

  beforeEach(async () => {
    originalEnv = { ...process.env };
    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-wi-payback-routes-test-'));
    process.env.DATABASE_URL = join(tempDir, 'test.db');
    process.env.SECURE_COOKIES = 'false';

    app = await buildApp();
    entityCounter = 0;
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
    process.env = originalEnv;
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
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
    return { userId: user.id, cookie: `cornerstone_session=${sessionToken}` };
  }

  function createTestWorkItem(title: string, userId: string): string {
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
    return id;
  }

  function createTestSubsidyProgram(
    opts: {
      name?: string;
      reductionType?: 'percentage' | 'fixed';
      reductionValue?: number;
      applicationStatus?: 'eligible' | 'applied' | 'approved' | 'received' | 'rejected';
    } = {},
  ): string {
    const id = `sp-${++entityCounter}`;
    const timestamp = new Date(Date.now() + entityCounter).toISOString();
    app.db
      .insert(subsidyPrograms)
      .values({
        id,
        name: opts.name ?? `Subsidy ${id}`,
        description: null,
        eligibility: null,
        reductionType: opts.reductionType ?? 'percentage',
        reductionValue: opts.reductionValue ?? 10,
        applicationStatus: opts.applicationStatus ?? 'eligible',
        applicationDeadline: null,
        notes: null,
        createdBy: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run();
    return id;
  }

  function linkSubsidy(workItemId: string, subsidyProgramId: string) {
    app.db.insert(workItemSubsidies).values({ workItemId, subsidyProgramId }).run();
  }

  function createBudgetCategory(name: string): string {
    const id = `cat-${++entityCounter}`;
    const timestamp = new Date(Date.now() + entityCounter).toISOString();
    app.db
      .insert(budgetCategories)
      .values({
        id,
        name,
        description: null,
        color: null,
        sortOrder: 200 + entityCounter,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run();
    return id;
  }

  function createBudgetLine(
    workItemId: string,
    plannedAmount: number,
    budgetCategoryId?: string | null,
  ): string {
    const id = `bl-${++entityCounter}`;
    const timestamp = new Date(Date.now() + entityCounter).toISOString();
    app.db
      .insert(workItemBudgets)
      .values({
        id,
        workItemId,
        label: `Budget Line ${id}`,
        plannedAmount,
        confidence: 'own_estimate',
        budgetCategoryId: budgetCategoryId ?? null,
        budgetSourceId: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run();
    return id;
  }

  function linkCategoryToSubsidy(subsidyProgramId: string, budgetCategoryId: string) {
    app.db.insert(subsidyProgramCategories).values({ subsidyProgramId, budgetCategoryId }).run();
  }

  function createVendorAndInvoice(budgetLineId: string, amount: number) {
    const vendorId = `vendor-${++entityCounter}`;
    const timestamp = new Date(Date.now() + entityCounter).toISOString();
    app.db
      .insert(vendors)
      .values({
        id: vendorId,
        name: `Vendor ${vendorId}`,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run();

    const invoiceId = `inv-${++entityCounter}`;
    app.db
      .insert(invoices)
      .values({
        id: invoiceId,
        workItemBudgetId: budgetLineId,
        vendorId,
        amount,
        status: 'pending',
        invoiceDate: timestamp.slice(0, 10),
        dueDate: null,
        paidDate: null,
        reference: null,
        notes: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run();
  }

  // ─── GET /api/work-items/:workItemId/subsidy-payback ─────────────────────

  describe('GET /api/work-items/:workItemId/subsidy-payback', () => {
    it('returns 401 when not authenticated', async () => {
      const { userId } = await createUserWithSession(
        'auth@example.com',
        'Auth User',
        'password123',
      );
      const workItemId = createTestWorkItem('Test Item', userId);

      const response = await app.inject({
        method: 'GET',
        url: `/api/work-items/${workItemId}/subsidy-payback`,
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 404 when work item does not exist', async () => {
      const { cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );

      const response = await app.inject({
        method: 'GET',
        url: '/api/work-items/non-existent-wi/subsidy-payback',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 200 with zero totalPayback and empty subsidies when none linked', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItemId = createTestWorkItem('Empty Work Item', userId);

      const response = await app.inject({
        method: 'GET',
        url: `/api/work-items/${workItemId}/subsidy-payback`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<WorkItemSubsidyPaybackResponse>();
      expect(body.workItemId).toBe(workItemId);
      expect(body.totalPayback).toBe(0);
      expect(body.subsidies).toEqual([]);
    });

    it('returns correct payback for a percentage subsidy with budget lines', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItemId = createTestWorkItem('Work Item', userId);
      createBudgetLine(workItemId, 1000);

      const subsidyId = createTestSubsidyProgram({
        reductionType: 'percentage',
        reductionValue: 10,
      });
      linkSubsidy(workItemId, subsidyId);

      const response = await app.inject({
        method: 'GET',
        url: `/api/work-items/${workItemId}/subsidy-payback`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<WorkItemSubsidyPaybackResponse>();
      expect(body.totalPayback).toBeCloseTo(100);
      expect(body.subsidies).toHaveLength(1);
      expect(body.subsidies[0].paybackAmount).toBeCloseTo(100);
    });

    it('returns correct payback for a fixed subsidy', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItemId = createTestWorkItem('Work Item', userId);

      const subsidyId = createTestSubsidyProgram({ reductionType: 'fixed', reductionValue: 3000 });
      linkSubsidy(workItemId, subsidyId);

      const response = await app.inject({
        method: 'GET',
        url: `/api/work-items/${workItemId}/subsidy-payback`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<WorkItemSubsidyPaybackResponse>();
      expect(body.totalPayback).toBe(3000);
      expect(body.subsidies[0].paybackAmount).toBe(3000);
    });

    it('excludes rejected subsidies from the result', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItemId = createTestWorkItem('Work Item', userId);
      createBudgetLine(workItemId, 1000);

      const rejectedId = createTestSubsidyProgram({
        reductionType: 'percentage',
        reductionValue: 50,
        applicationStatus: 'rejected',
      });
      linkSubsidy(workItemId, rejectedId);

      const response = await app.inject({
        method: 'GET',
        url: `/api/work-items/${workItemId}/subsidy-payback`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<WorkItemSubsidyPaybackResponse>();
      expect(body.totalPayback).toBe(0);
      expect(body.subsidies).toHaveLength(0);
    });

    it('uses actual invoiced cost instead of plannedAmount when invoices exist', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItemId = createTestWorkItem('Work Item', userId);
      const budgetLineId = createBudgetLine(workItemId, 2000); // planned = 2000
      createVendorAndInvoice(budgetLineId, 800); // actual = 800

      const subsidyId = createTestSubsidyProgram({
        reductionType: 'percentage',
        reductionValue: 10,
      });
      linkSubsidy(workItemId, subsidyId);

      const response = await app.inject({
        method: 'GET',
        url: `/api/work-items/${workItemId}/subsidy-payback`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<WorkItemSubsidyPaybackResponse>();
      // 800 × 10% = 80, not 2000 × 10% = 200
      expect(body.totalPayback).toBeCloseTo(80);
    });

    it('applies category restriction correctly', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItemId = createTestWorkItem('Work Item', userId);
      const catId = createBudgetCategory('Electrical');
      createBudgetLine(workItemId, 1000, catId); // matches
      createBudgetLine(workItemId, 500); // no category — no match

      const subsidyId = createTestSubsidyProgram({
        reductionType: 'percentage',
        reductionValue: 10,
      });
      linkCategoryToSubsidy(subsidyId, catId);
      linkSubsidy(workItemId, subsidyId);

      const response = await app.inject({
        method: 'GET',
        url: `/api/work-items/${workItemId}/subsidy-payback`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<WorkItemSubsidyPaybackResponse>();
      // Only 1000 matches: 1000 × 10% = 100
      expect(body.totalPayback).toBeCloseTo(100);
    });

    it('returns response with all required fields in each subsidy entry', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItemId = createTestWorkItem('Work Item', userId);
      createBudgetLine(workItemId, 1000);

      const subsidyId = createTestSubsidyProgram({
        name: 'Solar Panel Rebate',
        reductionType: 'percentage',
        reductionValue: 15,
      });
      linkSubsidy(workItemId, subsidyId);

      const response = await app.inject({
        method: 'GET',
        url: `/api/work-items/${workItemId}/subsidy-payback`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<WorkItemSubsidyPaybackResponse>();
      const entry = body.subsidies[0];
      expect(entry.subsidyProgramId).toBe(subsidyId);
      expect(entry.name).toBe('Solar Panel Rebate');
      expect(entry.reductionType).toBe('percentage');
      expect(entry.reductionValue).toBe(15);
      expect(typeof entry.paybackAmount).toBe('number');
    });

    it('returns totalPayback as sum of all subsidy paybacks', async () => {
      const { userId, cookie } = await createUserWithSession(
        'user@example.com',
        'Test User',
        'password123',
      );
      const workItemId = createTestWorkItem('Work Item', userId);
      createBudgetLine(workItemId, 1000);

      const sp1 = createTestSubsidyProgram({ reductionType: 'percentage', reductionValue: 10 }); // 100
      const sp2 = createTestSubsidyProgram({ reductionType: 'fixed', reductionValue: 500 }); // 500
      linkSubsidy(workItemId, sp1);
      linkSubsidy(workItemId, sp2);

      const response = await app.inject({
        method: 'GET',
        url: `/api/work-items/${workItemId}/subsidy-payback`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<WorkItemSubsidyPaybackResponse>();
      expect(body.subsidies).toHaveLength(2);
      expect(body.totalPayback).toBeCloseTo(600);
    });

    it('is accessible to member role users', async () => {
      const { userId, cookie } = await createUserWithSession(
        'member@example.com',
        'Member User',
        'password123',
        'member',
      );
      const workItemId = createTestWorkItem('Work Item', userId);

      const response = await app.inject({
        method: 'GET',
        url: `/api/work-items/${workItemId}/subsidy-payback`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
    });

    it('is accessible to admin role users', async () => {
      const { userId, cookie } = await createUserWithSession(
        'admin@example.com',
        'Admin User',
        'password123',
        'admin',
      );
      const workItemId = createTestWorkItem('Work Item', userId);

      const response = await app.inject({
        method: 'GET',
        url: `/api/work-items/${workItemId}/subsidy-payback`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
    });
  });
});
