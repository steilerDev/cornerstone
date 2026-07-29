/**
 * Integration tests for source report routes.
 *
 * Story #1878 — Source report backend: report data, mark-claimed & Paperless upload proxy
 *
 * Tests cover:
 * - GET /api/source-reports (auth, query validation, 404 unknown source, 200 success shape)
 * - POST /api/source-reports/mark-claimed (auth, body validation, 409 with details, 200 success)
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../app.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import * as schema from '../db/schema.js';
import type { FastifyInstance } from 'fastify';
import type {
  ApiErrorResponse,
  SourceReportResponse,
  MarkClaimedResponse,
} from '@cornerstone/shared';

describe('Source Report Routes', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;
  let counter = 0;

  beforeEach(async () => {
    originalEnv = { ...process.env };

    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-source-reports-test-'));
    process.env.DATABASE_URL = join(tempDir, 'test.db');
    process.env.SECURE_COOKIES = 'false';

    app = await buildApp();
    counter = 0;
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

  async function createUserWithSession(
    email = 'user@example.com',
    role: 'admin' | 'member' = 'member',
  ): Promise<{ cookie: string }> {
    const user = await userService.createLocalUser(app.db, email, 'Test User', 'password', role);
    const token = sessionService.createSession(app.db, user.id, 3600);
    return { cookie: `cornerstone_session=${token}` };
  }

  function ts(): string {
    return new Date(Date.now() + counter++).toISOString();
  }

  function insertSource(): string {
    const id = `src-route-${++counter}`;
    const now = ts();
    app.db
      .insert(schema.budgetSources)
      .values({
        id,
        name: 'Test Source',
        sourceType: 'bank_loan',
        totalAmount: 100000,
        isDiscretionary: false,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  function insertVendor(): string {
    const id = `vendor-route-${++counter}`;
    const now = ts();
    app.db
      .insert(schema.vendors)
      .values({ id, name: 'Test Vendor', createdAt: now, updatedAt: now })
      .run();
    return id;
  }

  function insertWorkItemBudget(sourceId: string): string {
    const wiId = `wi-route-${++counter}`;
    const budgetId = `wib-route-${counter}`;
    const now = ts();
    app.db
      .insert(schema.workItems)
      .values({
        id: wiId,
        title: `WI ${counter}`,
        status: 'not_started',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    app.db
      .insert(schema.workItemBudgets)
      .values({
        id: budgetId,
        workItemId: wiId,
        budgetSourceId: sourceId,
        plannedAmount: 0,
        confidence: 'own_estimate',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return budgetId;
  }

  function insertInvoice(
    vendorId: string,
    overrides: Partial<typeof schema.invoices.$inferInsert> = {},
  ): string {
    const id = overrides.id ?? `inv-route-${++counter}`;
    const now = ts();
    app.db
      .insert(schema.invoices)
      .values({
        vendorId,
        amount: 1000,
        date: '2026-01-15',
        status: 'pending',
        invoiceNumber: `INV-${counter}`,
        createdAt: now,
        updatedAt: now,
        ...overrides,
        id,
      })
      .run();
    return id;
  }

  function insertInvoiceBudgetLine(
    invoiceId: string,
    budgetId: string,
    itemizedAmount: number,
  ): void {
    const now = ts();
    app.db
      .insert(schema.invoiceBudgetLines)
      .values({
        id: randomUUID(),
        invoiceId,
        workItemBudgetId: budgetId,
        itemizedAmount,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // GET /api/source-reports
  // ═══════════════════════════════════════════════════════════════════════

  describe('GET /api/source-reports', () => {
    it('returns 401 when not authenticated', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/source-reports?type=claim&sourceId=whatever',
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 400 when type is missing', async () => {
      const { cookie } = await createUserWithSession();
      const sourceId = insertSource();

      const response = await app.inject({
        method: 'GET',
        url: `/api/source-reports?sourceId=${sourceId}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 when sourceId is missing', async () => {
      const { cookie } = await createUserWithSession();

      const response = await app.inject({
        method: 'GET',
        url: '/api/source-reports?type=claim',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 for an invalid type value', async () => {
      const { cookie } = await createUserWithSession();
      const sourceId = insertSource();

      const response = await app.inject({
        method: 'GET',
        url: `/api/source-reports?type=not-a-real-type&sourceId=${sourceId}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 404 for an unknown sourceId', async () => {
      const { cookie } = await createUserWithSession();

      const response = await app.inject({
        method: 'GET',
        url: '/api/source-reports?type=claim&sourceId=does-not-exist',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 200 with the source report for a source with no matched invoices', async () => {
      const { cookie } = await createUserWithSession();
      const sourceId = insertSource();

      const response = await app.inject({
        method: 'GET',
        url: `/api/source-reports?type=budget-overview&sourceId=${sourceId}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ report: SourceReportResponse }>();
      expect(body.report.type).toBe('budget-overview');
      expect(body.report.source.id).toBe(sourceId);
      expect(body.report.invoices).toEqual([]);
      expect(body.report.unallocatedInvoices).toEqual([]);
    });

    it('returns 200 with populated invoices for a source with matched invoices', async () => {
      const { cookie } = await createUserWithSession();
      const sourceId = insertSource();
      const vendorId = insertVendor();
      const budgetId = insertWorkItemBudget(sourceId);
      const invId = insertInvoice(vendorId, { status: 'paid', amount: 500 });
      insertInvoiceBudgetLine(invId, budgetId, 500);

      const response = await app.inject({
        method: 'GET',
        url: `/api/source-reports?type=claim&sourceId=${sourceId}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ report: SourceReportResponse }>();
      expect(body.report.invoices).toHaveLength(1);
      expect(body.report.invoices[0]!.invoiceId).toBe(invId);
      expect(body.report.totalAmount).toBeCloseTo(500);
    });

    it('silently strips unknown query parameters (Fastify/AJV removeAdditional default) rather than rejecting with 400', async () => {
      // @fastify/ajv-compiler defaults to removeAdditional: true — additionalProperties:
      // false STRIPS unknown properties instead of returning 400. See qa-integration-tester
      // memory: "Fastify AJV Default: removeAdditional=true".
      const { cookie } = await createUserWithSession();
      const sourceId = insertSource();

      const response = await app.inject({
        method: 'GET',
        url: `/api/source-reports?type=budget-overview&sourceId=${sourceId}&bogus=1`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // POST /api/source-reports/mark-claimed
  // ═══════════════════════════════════════════════════════════════════════

  describe('POST /api/source-reports/mark-claimed', () => {
    it('returns 401 when not authenticated', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/source-reports/mark-claimed',
        payload: { invoiceIds: ['inv-1'] },
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 400 when invoiceIds is missing', async () => {
      const { cookie } = await createUserWithSession();

      const response = await app.inject({
        method: 'POST',
        url: '/api/source-reports/mark-claimed',
        headers: { cookie },
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 when invoiceIds is an empty array (minItems: 1)', async () => {
      const { cookie } = await createUserWithSession();

      const response = await app.inject({
        method: 'POST',
        url: '/api/source-reports/mark-claimed',
        headers: { cookie },
        payload: { invoiceIds: [] },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 409 INVOICES_NOT_CLAIMABLE with offending ids when an invoice is not claimable', async () => {
      const { cookie } = await createUserWithSession();
      const vendorId = insertVendor();
      const invId = insertInvoice(vendorId, { status: 'quotation' });

      const response = await app.inject({
        method: 'POST',
        url: '/api/source-reports/mark-claimed',
        headers: { cookie },
        payload: { invoiceIds: [invId] },
      });

      expect(response.statusCode).toBe(409);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('INVOICES_NOT_CLAIMABLE');
      expect(body.error.details).toMatchObject({ invoiceIds: [invId] });
    });

    it('returns 200 with claimedInvoiceIds/claimedDepositIds for a valid batch', async () => {
      const { cookie } = await createUserWithSession();
      const vendorId = insertVendor();
      const invId = insertInvoice(vendorId, { status: 'pending' });

      const response = await app.inject({
        method: 'POST',
        url: '/api/source-reports/mark-claimed',
        headers: { cookie },
        payload: { invoiceIds: [invId] },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<MarkClaimedResponse>();
      expect(body.claimedInvoiceIds).toEqual([invId]);
      expect(body.claimedDepositIds).toEqual([]);
    });

    it('silently strips unknown body properties (Fastify/AJV removeAdditional default) and still processes the request', async () => {
      const { cookie } = await createUserWithSession();
      const vendorId = insertVendor();
      const invId = insertInvoice(vendorId, { status: 'pending' });

      const response = await app.inject({
        method: 'POST',
        url: '/api/source-reports/mark-claimed',
        headers: { cookie },
        payload: { invoiceIds: [invId], bogus: 'field' },
      });

      expect(response.statusCode).toBe(200);
    });
  });
});
