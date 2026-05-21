/**
 * Integration tests for POST /api/budget-lines/:id/assign (Story #1545).
 *
 * Uses buildApp() + Fastify's app.inject() to test the full request-response cycle.
 * Covers: success paths, error paths (404/409/400/401), auth enforcement.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../app.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import type { FastifyInstance } from 'fastify';
import type { ApiErrorResponse, InvoiceBudgetLineDetailResponse } from '@cornerstone/shared';
import * as schema from '../db/schema.js';

describe('POST /api/budget-lines/:id/assign', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;
  let tsOffset = 0;

  beforeEach(async () => {
    originalEnv = { ...process.env };
    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-bla-routes-test-'));
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

  // ─── Helpers ──────────────────────────────────────────────────────────────

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
    const t = new Date(Date.now() + tsOffset++).toISOString();
    app.db.insert(schema.vendors)
      .values({ id, name, tradeId: null, phone: null, email: null, address: null, notes: null, createdBy: null, createdAt: t, updatedAt: t })
      .run();
    return id;
  }

  function createTestWorkItem(title = 'Test Work Item'): string {
    const id = `wi-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const t = new Date(Date.now() + tsOffset++).toISOString();
    app.db.insert(schema.workItems)
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
        createdAt: t,
        updatedAt: t,
      })
      .run();
    return id;
  }

  function createTestHouseholdItem(name = 'Test HI'): string {
    const id = `hi-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const t = new Date(Date.now() + tsOffset++).toISOString();
    app.db.insert(schema.householdItems)
      .values({
        id,
        name,
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
        createdAt: t,
        updatedAt: t,
      })
      .run();
    return id;
  }

  /**
   * Insert an orphan work_item_budget linked to an invoice via invoice_budget_lines.
   * Returns the wibId so it can be used as the `:id` param.
   */
  function createOrphanWithInvoice(opts: { plannedAmount?: number } = {}): { wibId: string; invoiceId: string } {
    const wibId = `wib-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const t1 = new Date(Date.now() + tsOffset++).toISOString();
    app.db.insert(schema.workItemBudgets)
      .values({
        id: wibId,
        workItemId: null, // ORPHAN
        description: 'Orphan budget for test',
        plannedAmount: opts.plannedAmount ?? 500,
        confidence: 'own_estimate',
        budgetCategoryId: null,
        budgetSourceId: null,
        vendorId: null,
        quantity: null,
        unit: null,
        unitPrice: null,
        includesVat: true,
        createdBy: null,
        createdAt: t1,
        updatedAt: t1,
        origin: 'manual',
      })
      .run();

    const vendorId = createTestVendor('Invoice Vendor');
    const invoiceId = `inv-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const t2 = new Date(Date.now() + tsOffset++).toISOString();
    app.db.insert(schema.invoices)
      .values({
        id: invoiceId,
        vendorId,
        invoiceNumber: null,
        amount: opts.plannedAmount ?? 500,
        date: '2026-01-15',
        dueDate: null,
        status: 'pending',
        notes: null,
        createdBy: null,
        createdAt: t2,
        updatedAt: t2,
      })
      .run();

    const iblId = `ibl-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const t3 = new Date(Date.now() + tsOffset++).toISOString();
    app.db.insert(schema.invoiceBudgetLines)
      .values({
        id: iblId,
        invoiceId,
        workItemBudgetId: wibId,
        householdItemBudgetId: null,
        itemizedAmount: opts.plannedAmount ?? 500,
        createdAt: t3,
        updatedAt: t3,
      })
      .run();

    return { wibId, invoiceId };
  }

  /**
   * Insert an assigned (non-orphan) work_item_budget for conflict testing.
   */
  function createAssignedWIB(workItemId: string): string {
    const wibId = `wib-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const t = new Date(Date.now() + tsOffset++).toISOString();
    app.db.insert(schema.workItemBudgets)
      .values({
        id: wibId,
        workItemId, // Already assigned
        description: 'Assigned budget line',
        plannedAmount: 300,
        confidence: 'own_estimate',
        budgetCategoryId: null,
        budgetSourceId: null,
        vendorId: null,
        quantity: null,
        unit: null,
        unitPrice: null,
        includesVat: true,
        createdBy: null,
        createdAt: t,
        updatedAt: t,
        origin: 'manual',
      })
      .run();
    return wibId;
  }

  // ─── Auth enforcement ─────────────────────────────────────────────────────

  describe('authentication', () => {
    it('returns 401 UNAUTHORIZED when no session cookie is provided', async () => {
      const { wibId } = createOrphanWithInvoice();
      const wiId = createTestWorkItem();

      const response = await app.inject({
        method: 'POST',
        url: `/api/budget-lines/${wibId}/assign`,
        payload: { targetType: 'work_item', targetId: wiId },
      });

      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('allows a member user to assign a budget line', async () => {
      const { cookie } = await createUserWithSession('member@test.com', 'Member', 'password', 'member');
      const { wibId } = createOrphanWithInvoice();
      const wiId = createTestWorkItem();

      const response = await app.inject({
        method: 'POST',
        url: `/api/budget-lines/${wibId}/assign`,
        headers: { cookie },
        payload: { targetType: 'work_item', targetId: wiId },
      });

      expect(response.statusCode).toBe(200);
    });

    it('allows an admin user to assign a budget line', async () => {
      const { cookie } = await createUserWithSession('admin@test.com', 'Admin', 'password', 'admin');
      const { wibId } = createOrphanWithInvoice();
      const wiId = createTestWorkItem();

      const response = await app.inject({
        method: 'POST',
        url: `/api/budget-lines/${wibId}/assign`,
        headers: { cookie },
        payload: { targetType: 'work_item', targetId: wiId },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  // ─── 400: validation errors ────────────────────────────────────────────────

  describe('400 VALIDATION_ERROR', () => {
    it('returns 400 when targetType is missing', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const { wibId } = createOrphanWithInvoice();

      const response = await app.inject({
        method: 'POST',
        url: `/api/budget-lines/${wibId}/assign`,
        headers: { cookie },
        payload: { targetId: 'some-id' },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when targetId is missing', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const { wibId } = createOrphanWithInvoice();

      const response = await app.inject({
        method: 'POST',
        url: `/api/budget-lines/${wibId}/assign`,
        headers: { cookie },
        payload: { targetType: 'work_item' },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when targetType is an unknown value', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const { wibId } = createOrphanWithInvoice();

      const response = await app.inject({
        method: 'POST',
        url: `/api/budget-lines/${wibId}/assign`,
        headers: { cookie },
        payload: { targetType: 'invalid_type', targetId: 'some-id' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 when additional unknown properties are included', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const { wibId } = createOrphanWithInvoice();

      const response = await app.inject({
        method: 'POST',
        url: `/api/budget-lines/${wibId}/assign`,
        headers: { cookie },
        payload: { targetType: 'work_item', targetId: 'wi-1', unknownField: 'x' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 when body is empty', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const { wibId } = createOrphanWithInvoice();

      const response = await app.inject({
        method: 'POST',
        url: `/api/budget-lines/${wibId}/assign`,
        headers: { cookie },
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });
  });

  // ─── 404: not found ────────────────────────────────────────────────────────

  describe('404 NOT_FOUND', () => {
    it('returns 404 when the budget line ID does not exist', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');

      const response = await app.inject({
        method: 'POST',
        url: '/api/budget-lines/nonexistent-wib-id/assign',
        headers: { cookie },
        payload: { targetType: 'work_item', targetId: 'some-wi' },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 404 when target work item does not exist', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const { wibId } = createOrphanWithInvoice();

      const response = await app.inject({
        method: 'POST',
        url: `/api/budget-lines/${wibId}/assign`,
        headers: { cookie },
        payload: { targetType: 'work_item', targetId: 'nonexistent-wi-id' },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 404 when target household item does not exist', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const { wibId } = createOrphanWithInvoice();

      const response = await app.inject({
        method: 'POST',
        url: `/api/budget-lines/${wibId}/assign`,
        headers: { cookie },
        payload: { targetType: 'household_item', targetId: 'nonexistent-hi-id' },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });
  });

  // ─── 409: conflict ─────────────────────────────────────────────────────────

  describe('409 CONFLICT', () => {
    it('returns 409 when budget line is already assigned to a work item', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const wiId = createTestWorkItem('Existing WI');
      const wibId = createAssignedWIB(wiId);
      const targetWiId = createTestWorkItem('Target WI');

      const response = await app.inject({
        method: 'POST',
        url: `/api/budget-lines/${wibId}/assign`,
        headers: { cookie },
        payload: { targetType: 'work_item', targetId: targetWiId },
      });

      expect(response.statusCode).toBe(409);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('CONFLICT');
    });
  });

  // ─── 200: success — work_item path ─────────────────────────────────────────

  describe('200 success — assign to work_item', () => {
    it('returns 200 with resolved InvoiceBudgetLineDetailResponse', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const { wibId, invoiceId } = createOrphanWithInvoice({ plannedAmount: 600 });
      const wiId = createTestWorkItem('Wall Painting');

      const response = await app.inject({
        method: 'POST',
        url: `/api/budget-lines/${wibId}/assign`,
        headers: { cookie },
        payload: { targetType: 'work_item', targetId: wiId },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<InvoiceBudgetLineDetailResponse>();
      expect(body.parentItemType).toBe('work_item');
      expect(body.parentItemId).toBe(wiId);
      expect(body.parentItemTitle).toBe('Wall Painting');
      expect(body.invoiceId).toBe(invoiceId);
      expect(body.plannedAmount).toBe(600);
      expect(body.workItemBudgetId).toBe(wibId);
      expect(body.householdItemBudgetId).toBeNull();
    });

    it('applies optional budgetCategoryId when provided', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const { wibId } = createOrphanWithInvoice();
      const wiId = createTestWorkItem();

      const response = await app.inject({
        method: 'POST',
        url: `/api/budget-lines/${wibId}/assign`,
        headers: { cookie },
        payload: { targetType: 'work_item', targetId: wiId, budgetCategoryId: 'bc-construction' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<InvoiceBudgetLineDetailResponse>();
      expect(body.categoryId).toBe('bc-construction');
    });

    it('response includes id, invoiceId, and timestamp fields', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const { wibId } = createOrphanWithInvoice();
      const wiId = createTestWorkItem();

      const response = await app.inject({
        method: 'POST',
        url: `/api/budget-lines/${wibId}/assign`,
        headers: { cookie },
        payload: { targetType: 'work_item', targetId: wiId },
      });

      const body = response.json<InvoiceBudgetLineDetailResponse>();
      expect(body.id).toBeDefined();
      expect(body.createdAt).toBeDefined();
      expect(body.updatedAt).toBeDefined();
    });
  });

  // ─── 200: success — household_item path ────────────────────────────────────

  describe('200 success — assign to household_item', () => {
    it('returns 200 with resolved InvoiceBudgetLineDetailResponse', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const { wibId, invoiceId } = createOrphanWithInvoice({ plannedAmount: 800 });
      const hiId = createTestHouseholdItem('Bookshelf');

      const response = await app.inject({
        method: 'POST',
        url: `/api/budget-lines/${wibId}/assign`,
        headers: { cookie },
        payload: { targetType: 'household_item', targetId: hiId },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<InvoiceBudgetLineDetailResponse>();
      expect(body.parentItemType).toBe('household_item');
      expect(body.parentItemId).toBe(hiId);
      expect(body.parentItemTitle).toBe('Bookshelf');
      expect(body.invoiceId).toBe(invoiceId);
      expect(body.plannedAmount).toBe(800);
      expect(body.workItemBudgetId).toBeNull();
      expect(body.householdItemBudgetId).not.toBeNull();
    });

    it('the returned householdItemBudgetId has budgetCategoryId bc-household-items', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const { wibId } = createOrphanWithInvoice();
      const hiId = createTestHouseholdItem();

      const response = await app.inject({
        method: 'POST',
        url: `/api/budget-lines/${wibId}/assign`,
        headers: { cookie },
        payload: { targetType: 'household_item', targetId: hiId },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<InvoiceBudgetLineDetailResponse>();
      // The forced category is bc-household-items — reflected in categoryId field
      expect(body.categoryId).toBe('bc-household-items');
    });

    it('response includes id, invoiceId, and timestamp fields', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const { wibId } = createOrphanWithInvoice();
      const hiId = createTestHouseholdItem();

      const response = await app.inject({
        method: 'POST',
        url: `/api/budget-lines/${wibId}/assign`,
        headers: { cookie },
        payload: { targetType: 'household_item', targetId: hiId },
      });

      const body = response.json<InvoiceBudgetLineDetailResponse>();
      expect(body.id).toBeDefined();
      expect(body.createdAt).toBeDefined();
      expect(body.updatedAt).toBeDefined();
    });

    it('assigning to household_item removes the orphan wib from the database', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const { wibId } = createOrphanWithInvoice();
      const hiId = createTestHouseholdItem();

      await app.inject({
        method: 'POST',
        url: `/api/budget-lines/${wibId}/assign`,
        headers: { cookie },
        payload: { targetType: 'household_item', targetId: hiId },
      });

      const wib = app.db.select().from(schema.workItemBudgets).all()
        .find((r) => r.id === wibId);
      expect(wib).toBeUndefined();
    });
  });

  // ─── Idempotency / double-assign guard ─────────────────────────────────────

  describe('double-assign guard', () => {
    it('a second assign call on a successfully assigned line returns 409', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'password');
      const { wibId } = createOrphanWithInvoice();
      const wiId = createTestWorkItem();
      const wiId2 = createTestWorkItem('Second WI');

      // First assignment should succeed
      const first = await app.inject({
        method: 'POST',
        url: `/api/budget-lines/${wibId}/assign`,
        headers: { cookie },
        payload: { targetType: 'work_item', targetId: wiId },
      });
      expect(first.statusCode).toBe(200);

      // Second attempt should conflict
      const second = await app.inject({
        method: 'POST',
        url: `/api/budget-lines/${wibId}/assign`,
        headers: { cookie },
        payload: { targetType: 'work_item', targetId: wiId2 },
      });
      expect(second.statusCode).toBe(409);
    });
  });
});
