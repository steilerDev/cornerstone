/**
 * Integration tests for POST /api/budget-lines/batch (Story #2235).
 *
 * Uses buildApp() + app.inject(). Covers schema validation (flat item schema with if/then/else),
 * auth, success shapes, per-entry error indexes and full rollback.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../app.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import * as schema from '../db/schema.js';
import type { FastifyInstance } from 'fastify';
import type { ApiErrorResponse, BatchCreateBudgetLinesResponse } from '@cornerstone/shared';

function at<T>(items: T[], index = 0): T {
  const item = items[index];
  if (item === undefined) throw new Error(`expected an item at index ${index}`);
  return item;
}

describe('POST /api/budget-lines/batch', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;
  let counter = 0;
  let cookie: string;
  let userId: string;
  let sourceId: string;
  let taskId: string;
  let purchaseId: string;
  let vendorId: string;

  const URL = '/api/budget-lines/batch';

  beforeEach(async () => {
    originalEnv = { ...process.env };
    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-blb-routes-test-'));
    process.env.DATABASE_URL = join(tempDir, 'test.db');
    process.env.SECURE_COOKIES = 'false';
    app = await buildApp();
    counter = 0;
    const admin = await createUserWithSession('admin@example.com', 'Admin', 'password123', 'admin');
    cookie = admin.cookie;
    userId = admin.userId;
    sourceId = insertSource();
    vendorId = insertVendor();
    taskId = insertTask();
    purchaseId = insertPurchase();
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

  function ts(): string {
    return new Date(Date.UTC(2026, 0, 1) + counter++).toISOString();
  }

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

  function insertSource(): string {
    const id = `bs-${++counter}`;
    app.db
      .insert(schema.budgetSources)
      .values({
        id,
        name: 'Synthetic savings',
        sourceType: 'savings',
        totalAmount: 100000,
        createdBy: userId,
        createdAt: ts(),
        updatedAt: ts(),
      })
      .run();
    return id;
  }

  function insertVendor(): string {
    const id = `vendor-${++counter}`;
    app.db
      .insert(schema.vendors)
      .values({ id, name: 'Example Joinery Ltd', createdAt: ts(), updatedAt: ts() })
      .run();
    return id;
  }

  function insertTask(): string {
    const id = `wi-${++counter}`;
    app.db
      .insert(schema.workItems)
      .values({
        id,
        title: 'Synthetic kitchen task',
        status: 'not_started',
        createdBy: userId,
        createdAt: ts(),
        updatedAt: ts(),
      })
      .run();
    return id;
  }

  function insertPurchase(): string {
    const id = `hi-${++counter}`;
    app.db
      .insert(schema.householdItems)
      .values({
        id,
        name: 'Synthetic sofa',
        categoryId: 'hic-furniture',
        status: 'planned',
        createdBy: userId,
        createdAt: ts(),
        updatedAt: ts(),
      })
      .run();
    return id;
  }

  function insertInvoice(amount = 1000): string {
    const id = `inv-${++counter}`;
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
        createdBy: userId,
        createdAt: ts(),
        updatedAt: ts(),
      })
      .run();
    return id;
  }

  function insertTaskLine(): string {
    const id = `wib-${++counter}`;
    app.db
      .insert(schema.workItemBudgets)
      .values({
        id,
        workItemId: taskId,
        description: 'Existing line',
        plannedAmount: 100,
        confidence: 'own_estimate',
        budgetCategoryId: null,
        budgetSourceId: sourceId,
        vendorId: null,
        createdBy: userId,
        createdAt: ts(),
        updatedAt: ts(),
      })
      .run();
    return id;
  }

  function counts() {
    return {
      wib: app.db.select().from(schema.workItemBudgets).all().length,
      hib: app.db.select().from(schema.householdItemBudgets).all().length,
      ibl: app.db.select().from(schema.invoiceBudgetLines).all().length,
    };
  }

  function create(over: Record<string, unknown> = {}) {
    return {
      kind: 'create',
      targetType: 'work_item',
      targetId: taskId,
      plannedAmount: 100,
      budgetSourceId: sourceId,
      ...over,
    };
  }

  function link(lineId: string, over: Record<string, unknown> = {}) {
    return {
      kind: 'link',
      budgetLineType: 'work_item',
      budgetLineId: lineId,
      itemizedAmount: 50,
      ...over,
    };
  }

  async function post(body: unknown, withCookie: string | null = cookie) {
    return app.inject({
      method: 'POST',
      url: URL,
      headers: withCookie ? { cookie: withCookie } : {},
      payload: body as object,
    });
  }

  // ─── Auth ─────────────────────────────────────────────────────────────────

  describe('authentication', () => {
    it('returns 401 without a session and writes nothing', async () => {
      const res = await post({ lines: [create()] }, null);
      expect(res.statusCode).toBe(401);
      expect(res.json<ApiErrorResponse>().error.code).toBe('UNAUTHORIZED');
      expect(counts()).toEqual({ wib: 0, hib: 0, ibl: 0 });
    });

    it('allows a member', async () => {
      const member = await createUserWithSession('m@example.com', 'Member', 'password123');
      const res = await post({ lines: [create()] }, member.cookie);
      expect(res.statusCode).toBe(201);
    });

    it('allows an admin', async () => {
      const res = await post({ lines: [create()] });
      expect(res.statusCode).toBe(201);
    });
  });

  // ─── Success ──────────────────────────────────────────────────────────────

  describe('success', () => {
    it('creates task and purchase lines without an invoice (201, ordered, null links)', async () => {
      const res = await post({
        lines: [
          create({ description: 'Cabinet part 01' }),
          create({ targetType: 'household_item', targetId: purchaseId }),
        ],
      });
      expect(res.statusCode).toBe(201);
      const body = res.json<BatchCreateBudgetLinesResponse>();
      expect(body.remainingAmount).toBeNull();
      expect(body.lines).toHaveLength(2);
      expect(body.lines[0]).toMatchObject({
        index: 0,
        budgetLineType: 'work_item',
        invoiceBudgetLineId: null,
      });
      expect(body.lines[1]).toMatchObject({ index: 1, budgetLineType: 'household_item' });
      expect(counts()).toEqual({ wib: 1, hib: 1, ibl: 0 });
    });

    it('coerces a purchase line to the household category', async () => {
      const res = await post({
        lines: [
          create({
            targetType: 'household_item',
            targetId: purchaseId,
            budgetCategoryId: 'bc-materials',
          }),
        ],
      });
      expect(res.statusCode).toBe(201);
      const row = at(app.db.select().from(schema.householdItemBudgets).all());
      expect(row.budgetCategoryId).toBe('bc-household-items');
    });

    it('itemizes a net line at gross with an invoice (net 100 at VAT 0.19 gives 119.00)', async () => {
      const invoiceId = insertInvoice(1000);
      const res = await post({ invoiceId, lines: [create({ includesVat: false })] });
      expect(res.statusCode).toBe(201);
      const body = res.json<BatchCreateBudgetLinesResponse>();
      expect(body.remainingAmount).toBe(881);
      expect(at(body.lines).invoiceBudgetLineId).toEqual(expect.any(String));
      expect(at(app.db.select().from(schema.invoiceBudgetLines).all()).itemizedAmount).toBe(119);
    });

    it('accepts a valid link entry (oneOf regression guard)', async () => {
      const invoiceId = insertInvoice(1000);
      const lineId = insertTaskLine();
      const res = await post({ invoiceId, lines: [link(lineId, { itemizedAmount: 300 })] });
      expect(res.statusCode).toBe(201);
      const body = res.json<BatchCreateBudgetLinesResponse>();
      expect(body.lines[0]).toMatchObject({
        index: 0,
        budgetLineId: lineId,
        budgetLineType: 'work_item',
      });
      expect(body.remainingAmount).toBe(700);
    });

    it('accepts a mixed batch of create and link entries with an invoice', async () => {
      const invoiceId = insertInvoice(500);
      const lineId = insertTaskLine();
      const res = await post({
        invoiceId,
        lines: [
          create({ plannedAmount: 100 }),
          link(lineId, { itemizedAmount: 100 }),
          create({ targetType: 'household_item', targetId: purchaseId, plannedAmount: 50 }),
        ],
      });
      expect(res.statusCode).toBe(201);
      const body = res.json<BatchCreateBudgetLinesResponse>();
      expect(body.lines.map((l) => l.index)).toEqual([0, 1, 2]);
      expect(body.remainingAmount).toBe(250);
      expect(counts()).toEqual({ wib: 2, hib: 1, ibl: 3 });
    });

    it('accepts a mixed batch without an invoice id (creates only)', async () => {
      const res = await post({ lines: [create(), create()] });
      expect(res.statusCode).toBe(201);
    });

    it('strips unknown top-level properties without failing', async () => {
      const res = await post({ lines: [create()], extra: 'ignored' });
      expect(res.statusCode).toBe(201);
    });

    it('strips fields of the other kind instead of rejecting', async () => {
      const lineId = insertTaskLine();
      const invoiceId = insertInvoice();
      const res = await post({
        invoiceId,
        lines: [
          // link entry carrying create-only fields
          link(lineId, { plannedAmount: 9999, targetId: 'ignored', description: 'ignored' }),
          // create entry carrying link-only fields
          create({
            itemizedAmount: 9999,
            budgetLineId: 'ignored',
            budgetLineType: 'household_item',
          }),
        ],
      });
      expect(res.statusCode).toBe(201);
      const rows = app.db.select().from(schema.invoiceBudgetLines).all();
      expect(rows.map((r) => r.itemizedAmount).sort((a, b) => a - b)).toEqual([50, 100]);
    });
  });

  // ─── Service errors via HTTP ──────────────────────────────────────────────

  describe('service errors', () => {
    it('returns 400 with details.index for a link entry without an invoiceId', async () => {
      const res = await post({ lines: [create(), link(insertTaskLine())] });
      expect(res.statusCode).toBe(400);
      const err = res.json<ApiErrorResponse>().error;
      expect(err.code).toBe('VALIDATION_ERROR');
      expect(err.details).toMatchObject({ index: 1 });
      expect(counts()).toEqual({ wib: 1, hib: 0, ibl: 0 }); // only the pre-inserted line
    });

    it('returns 400 with index for a zero planned amount on an invoice', async () => {
      const res = await post({
        invoiceId: insertInvoice(),
        lines: [create(), create({ plannedAmount: 0 })],
      });
      expect(res.statusCode).toBe(400);
      expect(res.json<ApiErrorResponse>().error.details).toMatchObject({ index: 1 });
      expect(counts()).toEqual({ wib: 0, hib: 0, ibl: 0 });
    });

    it('returns ITEMIZED_SUM_EXCEEDS_INVOICE with index on running-sum overflow', async () => {
      const res = await post({
        invoiceId: insertInvoice(150),
        lines: [create({ plannedAmount: 100 }), create({ plannedAmount: 100 })],
      });
      expect(res.statusCode).toBe(400);
      const err = res.json<ApiErrorResponse>().error;
      expect(err.code).toBe('ITEMIZED_SUM_EXCEEDS_INVOICE');
      expect(err.details).toMatchObject({ index: 1 });
      expect(counts()).toEqual({ wib: 0, hib: 0, ibl: 0 });
    });

    it('returns 404 without index for a missing invoice', async () => {
      const res = await post({ invoiceId: 'missing-invoice', lines: [create()] });
      expect(res.statusCode).toBe(404);
      const err = res.json<ApiErrorResponse>().error;
      expect(err.code).toBe('NOT_FOUND');
      expect((err.details as { index?: number } | undefined)?.index).toBeUndefined();
    });

    it('returns 404 with index for a missing target', async () => {
      const res = await post({ lines: [create(), create({ targetId: 'missing-task' })] });
      expect(res.statusCode).toBe(404);
      expect(res.json<ApiErrorResponse>().error.details).toMatchObject({ index: 1 });
      expect(counts()).toEqual({ wib: 0, hib: 0, ibl: 0 });
    });

    it('returns 404 with index for a missing line to link', async () => {
      const res = await post({ invoiceId: insertInvoice(), lines: [link('missing-line')] });
      expect(res.statusCode).toBe(404);
      expect(res.json<ApiErrorResponse>().error.details).toMatchObject({ index: 0 });
    });

    it('returns 400 with index for a duplicate line in one batch and rolls back', async () => {
      const lineId = insertTaskLine();
      const res = await post({
        invoiceId: insertInvoice(),
        lines: [link(lineId), link(lineId)],
      });
      expect(res.statusCode).toBe(400);
      expect(res.json<ApiErrorResponse>().error.details).toMatchObject({ index: 1 });
      expect(counts().ibl).toBe(0);
    });

    it('returns 400 for a line already linked to the same invoice', async () => {
      const lineId = insertTaskLine();
      const invoiceId = insertInvoice();
      expect((await post({ invoiceId, lines: [link(lineId)] })).statusCode).toBe(201);
      const res = await post({ invoiceId, lines: [link(lineId)] });
      expect(res.statusCode).toBe(400);
      expect(res.json<ApiErrorResponse>().error.details).toMatchObject({ index: 0 });
    });

    it('returns 409 with index for a line linked to a different invoice', async () => {
      const lineId = insertTaskLine();
      expect((await post({ invoiceId: insertInvoice(), lines: [link(lineId)] })).statusCode).toBe(
        201,
      );
      const res = await post({ invoiceId: insertInvoice(), lines: [link(lineId)] });
      expect(res.statusCode).toBe(409);
      const err = res.json<ApiErrorResponse>().error;
      expect(err.code).toBe('BUDGET_LINE_ALREADY_LINKED');
      expect(err.details).toMatchObject({ index: 0 });
    });

    it('rolls back every table when a late entry fails', async () => {
      const lineId = insertTaskLine();
      const before = counts();
      const res = await post({
        invoiceId: insertInvoice(1000),
        lines: [
          create(),
          create({ targetType: 'household_item', targetId: purchaseId }),
          link(lineId),
          create({ targetId: 'missing-task' }),
        ],
      });
      expect(res.statusCode).toBe(404);
      expect(res.json<ApiErrorResponse>().error.details).toMatchObject({ index: 3 });
      expect(counts()).toEqual(before);
    });
  });
});
