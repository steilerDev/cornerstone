import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../app.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import type { FastifyInstance } from 'fastify';
import type { ApiErrorResponse } from '@cornerstone/shared';
import * as schema from '../db/schema.js';

describe('Invoice Budget Lines Routes', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  let tsOffset = 0;

  beforeEach(async () => {
    originalEnv = { ...process.env };
    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-ibl-routes-test-'));
    process.env.DATABASE_URL = join(tempDir, 'test.db');
    process.env.SECURE_COOKIES = 'false';
    app = await buildApp();
    tsOffset = 0;
  });

  afterEach(async () => {
    if (app) await app.close();
    process.env = originalEnv;
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

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

  function createTestVendor(name: string): string {
    const id = `vendor-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const ts = new Date(Date.now() + tsOffset++).toISOString();
    app.db
      .insert(schema.vendors)
      .values({
        id,
        name,
        tradeId: null,
        phone: null,
        email: null,
        address: null,
        notes: null,
        createdBy: null,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    return id;
  }

  function createTestInvoice(vendorId: string, amount = 1000): string {
    const id = `invoice-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const ts = new Date(Date.now() + tsOffset++).toISOString();
    app.db
      .insert(schema.invoices)
      .values({
        id,
        vendorId,
        invoiceNumber: null,
        amount,
        date: '2026-01-15',
        dueDate: null,
        status: 'pending',
        notes: null,
        createdBy: null,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    return id;
  }

  function createTestWorkItem(title: string): string {
    const id = `wi-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const ts = new Date(Date.now() + tsOffset++).toISOString();
    app.db
      .insert(schema.workItems)
      .values({
        id,
        title,
        description: null,
        status: 'not_started',
        startDate: null,
        endDate: null,
        actualStartDate: null,
        actualEndDate: null,
        durationDays: null,
        startAfter: null,
        startBefore: null,
        assignedUserId: null,
        areaId: null,
        assignedVendorId: null,
        createdBy: null,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    return id;
  }

  function createTestWorkItemBudget(workItemId: string, plannedAmount = 500): string {
    const id = `wib-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const ts = new Date(Date.now() + tsOffset++).toISOString();
    app.db
      .insert(schema.workItemBudgets)
      .values({
        id,
        workItemId,
        description: 'Test WI budget',
        plannedAmount,
        confidence: 'own_estimate',
        budgetCategoryId: null,
        budgetSourceId: null,
        vendorId: null,
        quantity: null,
        unit: null,
        unitPrice: null,
        includesVat: null,
        createdBy: null,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    return id;
  }

  function createTestHouseholdItem(): string {
    const id = `hi-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const ts = new Date(Date.now() + tsOffset++).toISOString();
    app.db
      .insert(schema.householdItems)
      .values({
        id,
        name: 'Test HI',
        description: null,
        categoryId: 'hic-furniture',
        status: 'planned',
        vendorId: null,
        areaId: null,
        url: null,
        quantity: 1,
        orderDate: null,
        actualDeliveryDate: null,
        earliestDeliveryDate: null,
        latestDeliveryDate: null,
        targetDeliveryDate: null,
        isLate: false,
        createdBy: null,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    return id;
  }

  function createTestHouseholdItemBudget(householdItemId: string, plannedAmount = 300): string {
    const id = `hib-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const ts = new Date(Date.now() + tsOffset++).toISOString();
    app.db
      .insert(schema.householdItemBudgets)
      .values({
        id,
        householdItemId,
        description: 'Test HI budget',
        plannedAmount,
        confidence: 'own_estimate',
        budgetCategoryId: null,
        budgetSourceId: null,
        vendorId: null,
        quantity: null,
        unit: null,
        unitPrice: null,
        includesVat: null,
        createdBy: null,
        createdAt: ts,
        updatedAt: ts,
      })
      .run();
    return id;
  }

  // ─── GET /api/invoices/:invoiceId/budget-lines ───────────────────────────────

  describe('GET /api/invoices/:invoiceId/budget-lines', () => {
    it('returns 401 UNAUTHORIZED without authentication', async () => {
      const vendorId = createTestVendor('Vendor Unauth');
      const invoiceId = createTestInvoice(vendorId);

      const response = await app.inject({
        method: 'GET',
        url: `/api/invoices/${invoiceId}/budget-lines`,
      });

      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 404 NOT_FOUND when invoice does not exist', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');

      const response = await app.inject({
        method: 'GET',
        url: '/api/invoices/non-existent-invoice/budget-lines',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 200 with empty budget lines and full remainingAmount when invoice has no lines', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendorId = createTestVendor('Vendor Empty');
      const invoiceId = createTestInvoice(vendorId, 1000);

      const response = await app.inject({
        method: 'GET',
        url: `/api/invoices/${invoiceId}/budget-lines`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ budgetLines: unknown[]; remainingAmount: number }>();
      expect(body.budgetLines).toHaveLength(0);
      expect(body.remainingAmount).toBe(1000);
    });

    it('returns 200 with budget lines and correct remainingAmount', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendorId = createTestVendor('Vendor List');
      const invoiceId = createTestInvoice(vendorId, 1000);
      const wiId = createTestWorkItem('Plumbing');
      const wibId = createTestWorkItemBudget(wiId, 600);

      await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/budget-lines`,
        headers: { cookie },
        payload: { workItemBudgetId: wibId, itemizedAmount: 400 },
      });

      const response = await app.inject({
        method: 'GET',
        url: `/api/invoices/${invoiceId}/budget-lines`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ budgetLines: unknown[]; remainingAmount: number }>();
      expect(body.budgetLines).toHaveLength(1);
      expect(body.remainingAmount).toBe(600);
    });

    it('allows member user to list budget lines', async () => {
      const { cookie } = await createUserWithSession(
        'member@test.com',
        'Member',
        'password',
        'member',
      );
      const vendorId = createTestVendor('Vendor Member');
      const invoiceId = createTestInvoice(vendorId);

      const response = await app.inject({
        method: 'GET',
        url: `/api/invoices/${invoiceId}/budget-lines`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  // ─── POST /api/invoices/:invoiceId/budget-lines ──────────────────────────────

  describe('POST /api/invoices/:invoiceId/budget-lines', () => {
    it('returns 401 UNAUTHORIZED without authentication', async () => {
      const vendorId = createTestVendor('Vendor Unauth Post');
      const invoiceId = createTestInvoice(vendorId);
      const wiId = createTestWorkItem('Task Unauth');
      const wibId = createTestWorkItemBudget(wiId);

      const response = await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/budget-lines`,
        payload: { workItemBudgetId: wibId, itemizedAmount: 100 },
      });

      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 400 VALIDATION_ERROR when itemizedAmount is missing', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendorId = createTestVendor('Vendor Missing Amount');
      const invoiceId = createTestInvoice(vendorId);
      const wiId = createTestWorkItem('Task Missing');
      const wibId = createTestWorkItemBudget(wiId);

      const response = await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/budget-lines`,
        headers: { cookie },
        payload: { workItemBudgetId: wibId },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 VALIDATION_ERROR when itemizedAmount is 0 (exclusiveMinimum)', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendorId = createTestVendor('Vendor Zero');
      const invoiceId = createTestInvoice(vendorId);
      const wiId = createTestWorkItem('Task Zero');
      const wibId = createTestWorkItemBudget(wiId);

      const response = await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/budget-lines`,
        headers: { cookie },
        payload: { workItemBudgetId: wibId, itemizedAmount: 0 },
      });

      expect(response.statusCode).toBe(400);
    });

    it('strips unknown properties from request body (additionalProperties: false)', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendorId = createTestVendor('Vendor Extra');
      const invoiceId = createTestInvoice(vendorId, 1000);
      const wiId = createTestWorkItem('Task Extra');
      const wibId = createTestWorkItemBudget(wiId);

      const response = await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/budget-lines`,
        headers: { cookie },
        payload: { workItemBudgetId: wibId, itemizedAmount: 100, unknownField: 'oops' },
      });

      // Fastify strips extra properties (removeAdditional default) — request still succeeds
      expect(response.statusCode).toBe(201);
    });

    it('returns 404 NOT_FOUND when invoice does not exist', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const wiId = createTestWorkItem('Task 404 Invoice');
      const wibId = createTestWorkItemBudget(wiId);

      const response = await app.inject({
        method: 'POST',
        url: '/api/invoices/non-existent-invoice/budget-lines',
        headers: { cookie },
        payload: { workItemBudgetId: wibId, itemizedAmount: 100 },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 400 VALIDATION_ERROR when neither budget ID is provided', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendorId = createTestVendor('Vendor No Budget');
      const invoiceId = createTestInvoice(vendorId);

      const response = await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/budget-lines`,
        headers: { cookie },
        payload: { itemizedAmount: 100 },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 VALIDATION_ERROR when both budget IDs are provided', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendorId = createTestVendor('Vendor Both');
      const invoiceId = createTestInvoice(vendorId, 2000);
      const wiId = createTestWorkItem('Task Both');
      const wibId = createTestWorkItemBudget(wiId);
      const hiId = createTestHouseholdItem();
      const hibId = createTestHouseholdItemBudget(hiId);

      const response = await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/budget-lines`,
        headers: { cookie },
        payload: { workItemBudgetId: wibId, householdItemBudgetId: hibId, itemizedAmount: 100 },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 404 NOT_FOUND when workItemBudgetId does not exist', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendorId = createTestVendor('Vendor WIB 404');
      const invoiceId = createTestInvoice(vendorId);

      const response = await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/budget-lines`,
        headers: { cookie },
        payload: { workItemBudgetId: 'non-existent-wib', itemizedAmount: 100 },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 409 BUDGET_LINE_ALREADY_LINKED when budget is linked to a different invoice', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendorId = createTestVendor('Vendor Already Linked');
      const invoice1Id = createTestInvoice(vendorId, 1000);
      const invoice2Id = createTestInvoice(vendorId, 1000);
      const wiId = createTestWorkItem('Task Already Linked');
      const wibId = createTestWorkItemBudget(wiId);

      // Link to invoice1
      await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoice1Id}/budget-lines`,
        headers: { cookie },
        payload: { workItemBudgetId: wibId, itemizedAmount: 100 },
      });

      // Try to link to invoice2
      const response = await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoice2Id}/budget-lines`,
        headers: { cookie },
        payload: { workItemBudgetId: wibId, itemizedAmount: 100 },
      });

      expect(response.statusCode).toBe(409);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('BUDGET_LINE_ALREADY_LINKED');
    });

    it('returns 400 ITEMIZED_SUM_EXCEEDS_INVOICE when new line would exceed invoice total', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendorId = createTestVendor('Vendor Exceed');
      const invoiceId = createTestInvoice(vendorId, 500);
      const wi1 = createTestWorkItem('Task Exceed 1');
      const wi2 = createTestWorkItem('Task Exceed 2');
      const wib1 = createTestWorkItemBudget(wi1);
      const wib2 = createTestWorkItemBudget(wi2);

      await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/budget-lines`,
        headers: { cookie },
        payload: { workItemBudgetId: wib1, itemizedAmount: 400 },
      });

      const response = await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/budget-lines`,
        headers: { cookie },
        payload: { workItemBudgetId: wib2, itemizedAmount: 200 },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('ITEMIZED_SUM_EXCEEDS_INVOICE');
    });

    it('creates a work item budget line successfully and returns 201 with detail', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendorId = createTestVendor('Vendor Create WI');
      const invoiceId = createTestInvoice(vendorId, 1000);
      const wiId = createTestWorkItem('Carpentry');
      const wibId = createTestWorkItemBudget(wiId, 700);

      const response = await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/budget-lines`,
        headers: { cookie },
        payload: { workItemBudgetId: wibId, itemizedAmount: 350 },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<{ budgetLine: Record<string, unknown>; remainingAmount: number }>();
      expect(body.budgetLine.id).toBeDefined();
      expect(body.budgetLine.invoiceId).toBe(invoiceId);
      expect(body.budgetLine.workItemBudgetId).toBe(wibId);
      expect(body.budgetLine.itemizedAmount).toBe(350);
      expect(body.budgetLine.parentItemType).toBe('work_item');
      expect(body.budgetLine.parentItemTitle).toBe('Carpentry');
      expect(body.remainingAmount).toBe(650);
    });

    it('creates a household item budget line successfully and returns 201', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendorId = createTestVendor('Vendor Create HI');
      const invoiceId = createTestInvoice(vendorId, 500);
      const hiId = createTestHouseholdItem();
      const hibId = createTestHouseholdItemBudget(hiId, 400);

      const response = await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/budget-lines`,
        headers: { cookie },
        payload: { householdItemBudgetId: hibId, itemizedAmount: 200 },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<{ budgetLine: Record<string, unknown>; remainingAmount: number }>();
      expect(body.budgetLine.householdItemBudgetId).toBe(hibId);
      expect(body.budgetLine.parentItemType).toBe('household_item');
      expect(body.remainingAmount).toBe(300);
    });

    it('allows member user to create a budget line', async () => {
      const { cookie } = await createUserWithSession(
        'member@test.com',
        'Member',
        'password',
        'member',
      );
      const vendorId = createTestVendor('Vendor Member Create');
      const invoiceId = createTestInvoice(vendorId, 1000);
      const wiId = createTestWorkItem('Task Member');
      const wibId = createTestWorkItemBudget(wiId);

      const response = await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/budget-lines`,
        headers: { cookie },
        payload: { workItemBudgetId: wibId, itemizedAmount: 100 },
      });

      expect(response.statusCode).toBe(201);
    });
  });

  // ─── PATCH /api/invoices/:invoiceId/budget-lines/:id ────────────────────────

  describe('PATCH /api/invoices/:invoiceId/budget-lines/:id', () => {
    it('returns 401 UNAUTHORIZED without authentication', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/invoices/some-invoice/budget-lines/some-line',
        payload: { itemizedAmount: 100 },
      });

      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 400 VALIDATION_ERROR for empty body (minProperties constraint)', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendorId = createTestVendor('Vendor PATCH Empty');
      const invoiceId = createTestInvoice(vendorId);
      const wiId = createTestWorkItem('Task PATCH Empty');
      const wibId = createTestWorkItemBudget(wiId);

      const createResp = await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/budget-lines`,
        headers: { cookie },
        payload: { workItemBudgetId: wibId, itemizedAmount: 100 },
      });
      const createBody = createResp.json<{ budgetLine: { id: string } }>();

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/invoices/${invoiceId}/budget-lines/${createBody.budgetLine.id}`,
        headers: { cookie },
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('strips unknown properties from request body (additionalProperties: false)', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendorId = createTestVendor('Vendor PATCH Unknown');
      const invoiceId = createTestInvoice(vendorId, 1000);
      const wiId = createTestWorkItem('Task PATCH Unknown');
      const wibId = createTestWorkItemBudget(wiId);

      const createResp = await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/budget-lines`,
        headers: { cookie },
        payload: { workItemBudgetId: wibId, itemizedAmount: 100 },
      });
      const createBody = createResp.json<{ budgetLine: { id: string } }>();

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/invoices/${invoiceId}/budget-lines/${createBody.budgetLine.id}`,
        headers: { cookie },
        payload: { itemizedAmount: 200, unknownField: 'oops' },
      });

      // Fastify strips extra properties (removeAdditional default) — request still succeeds
      expect(response.statusCode).toBe(200);
    });

    it('returns 404 NOT_FOUND when invoice does not exist', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/invoices/non-existent-invoice/budget-lines/some-line',
        headers: { cookie },
        payload: { itemizedAmount: 100 },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 404 NOT_FOUND when budget line does not exist', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendorId = createTestVendor('Vendor PATCH 404 Line');
      const invoiceId = createTestInvoice(vendorId);

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/invoices/${invoiceId}/budget-lines/non-existent-line`,
        headers: { cookie },
        payload: { itemizedAmount: 100 },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 400 VALIDATION_ERROR when attempting to change workItemBudgetId', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendorId = createTestVendor('Vendor PATCH Change WIB');
      const invoiceId = createTestInvoice(vendorId, 1000);
      const wiId = createTestWorkItem('Task PATCH Change WIB');
      const wibId = createTestWorkItemBudget(wiId);

      const createResp = await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/budget-lines`,
        headers: { cookie },
        payload: { workItemBudgetId: wibId, itemizedAmount: 100 },
      });
      const createBody = createResp.json<{ budgetLine: { id: string } }>();

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/invoices/${invoiceId}/budget-lines/${createBody.budgetLine.id}`,
        headers: { cookie },
        payload: { workItemBudgetId: 'another-wib' },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 ITEMIZED_SUM_EXCEEDS_INVOICE when update would exceed invoice total', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendorId = createTestVendor('Vendor PATCH Exceed');
      const invoiceId = createTestInvoice(vendorId, 500);
      const wi1 = createTestWorkItem('Task PATCH Exceed 1');
      const wi2 = createTestWorkItem('Task PATCH Exceed 2');
      const wib1 = createTestWorkItemBudget(wi1);
      const wib2 = createTestWorkItemBudget(wi2);

      await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/budget-lines`,
        headers: { cookie },
        payload: { workItemBudgetId: wib1, itemizedAmount: 300 },
      });
      const resp2 = await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/budget-lines`,
        headers: { cookie },
        payload: { workItemBudgetId: wib2, itemizedAmount: 100 },
      });
      const line2 = resp2.json<{ budgetLine: { id: string } }>();

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/invoices/${invoiceId}/budget-lines/${line2.budgetLine.id}`,
        headers: { cookie },
        payload: { itemizedAmount: 250 },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('ITEMIZED_SUM_EXCEEDS_INVOICE');
    });

    it('updates itemizedAmount successfully and returns 200 with new values', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendorId = createTestVendor('Vendor PATCH Success');
      const invoiceId = createTestInvoice(vendorId, 1000);
      const wiId = createTestWorkItem('Task PATCH Success');
      const wibId = createTestWorkItemBudget(wiId);

      const createResp = await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/budget-lines`,
        headers: { cookie },
        payload: { workItemBudgetId: wibId, itemizedAmount: 200 },
      });
      const createBody = createResp.json<{ budgetLine: { id: string } }>();

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/invoices/${invoiceId}/budget-lines/${createBody.budgetLine.id}`,
        headers: { cookie },
        payload: { itemizedAmount: 500 },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ budgetLine: Record<string, unknown>; remainingAmount: number }>();
      expect(body.budgetLine.itemizedAmount).toBe(500);
      expect(body.remainingAmount).toBe(500);
    });

    it('allows member user to update a budget line', async () => {
      const { cookie } = await createUserWithSession(
        'member@test.com',
        'Member',
        'password',
        'member',
      );
      const vendorId = createTestVendor('Vendor PATCH Member');
      const invoiceId = createTestInvoice(vendorId, 1000);
      const wiId = createTestWorkItem('Task PATCH Member');
      const wibId = createTestWorkItemBudget(wiId);

      const createResp = await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/budget-lines`,
        headers: { cookie },
        payload: { workItemBudgetId: wibId, itemizedAmount: 100 },
      });
      const createBody = createResp.json<{ budgetLine: { id: string } }>();

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/invoices/${invoiceId}/budget-lines/${createBody.budgetLine.id}`,
        headers: { cookie },
        payload: { itemizedAmount: 300 },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  // ─── DELETE /api/invoices/:invoiceId/budget-lines/:id ───────────────────────

  describe('DELETE /api/invoices/:invoiceId/budget-lines/:id', () => {
    it('returns 401 UNAUTHORIZED without authentication', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/invoices/some-invoice/budget-lines/some-line',
      });

      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 404 NOT_FOUND when invoice does not exist', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/invoices/non-existent-invoice/budget-lines/some-line',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 404 NOT_FOUND when budget line does not exist', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendorId = createTestVendor('Vendor DELETE 404');
      const invoiceId = createTestInvoice(vendorId);

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/invoices/${invoiceId}/budget-lines/non-existent-line`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 404 NOT_FOUND when budget line belongs to a different invoice', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendorId = createTestVendor('Vendor DELETE Diff');
      const invoice1Id = createTestInvoice(vendorId, 1000);
      const invoice2Id = createTestInvoice(vendorId, 1000);
      const wiId = createTestWorkItem('Task DELETE Diff');
      const wibId = createTestWorkItemBudget(wiId);

      const createResp = await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoice1Id}/budget-lines`,
        headers: { cookie },
        payload: { workItemBudgetId: wibId, itemizedAmount: 100 },
      });
      const createBody = createResp.json<{ budgetLine: { id: string } }>();

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/invoices/${invoice2Id}/budget-lines/${createBody.budgetLine.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
    });

    it('deletes a budget line successfully and returns 204', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendorId = createTestVendor('Vendor DELETE Success');
      const invoiceId = createTestInvoice(vendorId, 1000);
      const wiId = createTestWorkItem('Task DELETE Success');
      const wibId = createTestWorkItemBudget(wiId);

      const createResp = await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/budget-lines`,
        headers: { cookie },
        payload: { workItemBudgetId: wibId, itemizedAmount: 300 },
      });
      const createBody = createResp.json<{ budgetLine: { id: string } }>();

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/invoices/${invoiceId}/budget-lines/${createBody.budgetLine.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(204);
      expect(response.body).toBe('');
    });

    it('budget line no longer appears in list after deletion', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const vendorId = createTestVendor('Vendor DELETE List');
      const invoiceId = createTestInvoice(vendorId, 1000);
      const wiId = createTestWorkItem('Task DELETE List');
      const wibId = createTestWorkItemBudget(wiId);

      const createResp = await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/budget-lines`,
        headers: { cookie },
        payload: { workItemBudgetId: wibId, itemizedAmount: 200 },
      });
      const createBody = createResp.json<{ budgetLine: { id: string } }>();

      await app.inject({
        method: 'DELETE',
        url: `/api/invoices/${invoiceId}/budget-lines/${createBody.budgetLine.id}`,
        headers: { cookie },
      });

      const listResp = await app.inject({
        method: 'GET',
        url: `/api/invoices/${invoiceId}/budget-lines`,
        headers: { cookie },
      });

      const listBody = listResp.json<{ budgetLines: Array<{ id: string }> }>();
      expect(listBody.budgetLines.find((l) => l.id === createBody.budgetLine.id)).toBeUndefined();
    });

    it('allows member user to delete a budget line', async () => {
      const { cookie } = await createUserWithSession(
        'member@test.com',
        'Member',
        'password',
        'member',
      );
      const vendorId = createTestVendor('Vendor DELETE Member');
      const invoiceId = createTestInvoice(vendorId, 1000);
      const wiId = createTestWorkItem('Task DELETE Member');
      const wibId = createTestWorkItemBudget(wiId);

      const createResp = await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/budget-lines`,
        headers: { cookie },
        payload: { workItemBudgetId: wibId, itemizedAmount: 100 },
      });
      const createBody = createResp.json<{ budgetLine: { id: string } }>();

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/invoices/${invoiceId}/budget-lines/${createBody.budgetLine.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(204);
    });
  });
});
