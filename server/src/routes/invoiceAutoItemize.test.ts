/**
 * Integration tests for POST /api/invoices/:invoiceId/auto-itemize (Story #1547).
 *
 * Uses buildApp() + Fastify's app.inject() to test the full request-response cycle.
 * LLM calls are intercepted by stubbing global fetch; Paperless calls likewise.
 *
 * Covers: dry-run 200, commit 200, 400 validation, 400 sum-exceeds, 401 unauthed,
 * 404 invoice-not-found, 404 document-not-linked, 502 LLM errors, 503 LLM-not-configured.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { buildApp } from '../app.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import type { FastifyInstance } from 'fastify';
import type {
  ApiErrorResponse,
  AutoItemizeDryRunResponse,
  InvoiceBudgetLineListDetailResponse,
} from '@cornerstone/shared';
import * as schema from '../db/schema.js';

// ─── Mock setup ────────────────────────────────────────────────────────────────
//
// The auto-itemize service calls:
//  (a) paperlessService.getDocument  — which uses globalThis.fetch to call Paperless-ngx
//  (b) provider.extract              — which uses globalThis.fetch to call the LLM endpoint
//
// We stub globalThis.fetch so both calls are intercepted without network access.

const PAPERLESS_DOC_RESPONSE = {
  id: 42,
  title: 'Invoice PDF',
  content: 'OCR content from invoice',
  tags: [],
  tag_ids: [],
  created: '2026-01-01T00:00:00.000Z',
  added: '2026-01-01T00:00:00.000Z',
  modified: '2026-01-01T00:00:00.000Z',
  correspondent: null,
  document_type: null,
  archive_serial_number: null,
  original_file_name: 'invoice.pdf',
  page_count: 1,
};

const PAPERLESS_TAGS_RESPONSE = { count: 0, results: [] };

const LLM_LINES_RESPONSE = {
  choices: [
    {
      message: {
        content: JSON.stringify({
          lines: [
            { description: 'Tile work', totalAmount: 300, confidence: 0.9 },
            { description: 'Grout', totalAmount: 100, confidence: 0.85 },
          ],
        }),
      },
    },
  ],
};

/**
 * Build a mock Response for globalThis.fetch.
 */
function makeFetchResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
    statusText: status === 200 ? 'OK' : 'Error',
  } as unknown as Response;
}

describe('POST /api/invoices/:invoiceId/auto-itemize', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;
  let originalFetch: typeof globalThis.fetch;
  let mockFetch: jest.MockedFunction<typeof globalThis.fetch>;
  let tsOffset = 0;

  beforeEach(async () => {
    originalEnv = { ...process.env };
    originalFetch = globalThis.fetch;
    mockFetch = jest.fn<typeof globalThis.fetch>();
    globalThis.fetch = mockFetch;

    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-auto-itemize-routes-test-'));
    process.env.DATABASE_URL = join(tempDir, 'test.db');
    process.env.SECURE_COOKIES = 'false';
    // Configure Paperless and LLM env vars so the app has them
    process.env.PAPERLESS_URL = 'http://paperless.test.local';
    process.env.PAPERLESS_API_TOKEN = 'test-paperless-token';
    process.env.LLM_BASE_URL = 'http://llm.test.local';
    process.env.LLM_API_KEY = 'test-llm-key';
    process.env.LLM_MODEL = 'gpt-4o-test';

    app = await buildApp();
    tsOffset = 0;

    // Default fetch mock: first call = Paperless doc, second = Paperless tags, third = LLM
    mockFetch
      .mockResolvedValueOnce(makeFetchResponse(PAPERLESS_DOC_RESPONSE)) // getDocument
      .mockResolvedValueOnce(makeFetchResponse(PAPERLESS_TAGS_RESPONSE)) // fetchTagsMap
      .mockResolvedValueOnce(makeFetchResponse(LLM_LINES_RESPONSE)); // LLM extract
  });

  afterEach(async () => {
    if (app) await app.close();
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
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
    return { userId: user.id, cookie: `cornerstone_session=${sessionToken}` };
  }

  function createTestVendor(name = 'Test Vendor'): string {
    const id = `vendor-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const t = new Date(Date.now() + tsOffset++).toISOString();
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
        createdAt: t,
        updatedAt: t,
      })
      .run();
    return id;
  }

  function createTestInvoice(vendorId: string, amount = 1000): string {
    const id = `inv-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const t = new Date(Date.now() + tsOffset++).toISOString();
    app.db
      .insert(schema.invoices)
      .values({
        id,
        vendorId,
        invoiceNumber: null,
        amount,
        date: '2026-03-01',
        dueDate: null,
        status: 'pending',
        notes: null,
        createdBy: null,
        createdAt: t,
        updatedAt: t,
      })
      .run();
    return id;
  }

  function linkDocument(invoiceId: string, paperlessDocumentId: number): void {
    const id = `dl-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const t = new Date(Date.now() + tsOffset++).toISOString();
    app.db
      .insert(schema.documentLinks)
      .values({
        id,
        entityType: 'invoice',
        entityId: invoiceId,
        paperlessDocumentId,
        createdBy: null,
        createdAt: t,
      })
      .run();
  }

  // ─── 401: authentication required ────────────────────────────────────────────

  describe('authentication', () => {
    it('returns 401 UNAUTHORIZED when no session cookie is provided', async () => {
      const vendorId = createTestVendor();
      const invoiceId = createTestInvoice(vendorId);
      linkDocument(invoiceId, 42);

      const response = await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/auto-itemize`,
        payload: {
          paperlessDocumentId: 42,
          mode: 'append',
          dryRun: true,
        },
      });

      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('allows a member user to call the endpoint', async () => {
      const { cookie } = await createUserWithSession('member@test.com', 'Member', 'pass', 'member');
      const vendorId = createTestVendor();
      const invoiceId = createTestInvoice(vendorId);
      linkDocument(invoiceId, 42);

      const response = await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/auto-itemize`,
        headers: { cookie },
        payload: {
          paperlessDocumentId: 42,
          mode: 'append',
          dryRun: true,
        },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  // ─── 400: schema validation ───────────────────────────────────────────────────

  describe('400 VALIDATION_ERROR — schema validation', () => {
    it('returns 400 when paperlessDocumentId is missing', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'pass');
      const vendorId = createTestVendor();
      const invoiceId = createTestInvoice(vendorId);
      linkDocument(invoiceId, 42);

      const response = await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/auto-itemize`,
        headers: { cookie },
        payload: { mode: 'append', dryRun: true },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when paperlessDocumentId is not a positive integer', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'pass');
      const vendorId = createTestVendor();
      const invoiceId = createTestInvoice(vendorId);

      const response = await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/auto-itemize`,
        headers: { cookie },
        payload: { paperlessDocumentId: 0, mode: 'append', dryRun: true },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 when mode is missing', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'pass');
      const vendorId = createTestVendor();
      const invoiceId = createTestInvoice(vendorId);

      const response = await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/auto-itemize`,
        headers: { cookie },
        payload: { paperlessDocumentId: 42, dryRun: true },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 when mode is an invalid value', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'pass');
      const vendorId = createTestVendor();
      const invoiceId = createTestInvoice(vendorId);

      const response = await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/auto-itemize`,
        headers: { cookie },
        payload: { paperlessDocumentId: 42, mode: 'overwrite', dryRun: true },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 when dryRun is missing', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'pass');
      const vendorId = createTestVendor();
      const invoiceId = createTestInvoice(vendorId);

      const response = await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/auto-itemize`,
        headers: { cookie },
        payload: { paperlessDocumentId: 42, mode: 'append' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 when dryRun is not a boolean', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'pass');
      const vendorId = createTestVendor();
      const invoiceId = createTestInvoice(vendorId);

      const response = await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/auto-itemize`,
        headers: { cookie },
        payload: { paperlessDocumentId: 42, mode: 'append', dryRun: 'yes' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 when body is empty', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'pass');
      const vendorId = createTestVendor();
      const invoiceId = createTestInvoice(vendorId);

      const response = await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/auto-itemize`,
        headers: { cookie },
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });
  });

  // ─── 404: invoice not found ───────────────────────────────────────────────────

  describe('404 NOT_FOUND — invoice', () => {
    it('returns 404 when the invoice does not exist', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'pass');

      const response = await app.inject({
        method: 'POST',
        url: '/api/invoices/nonexistent-invoice-id/auto-itemize',
        headers: { cookie },
        payload: {
          paperlessDocumentId: 42,
          mode: 'append',
          dryRun: true,
        },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });
  });

  // ─── 404: document not linked ─────────────────────────────────────────────────

  describe('404 NOT_FOUND — document not linked to invoice', () => {
    it('returns 404 when the paperlessDocumentId is not linked to the invoice', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'pass');
      const vendorId = createTestVendor();
      const invoiceId = createTestInvoice(vendorId);
      // Do NOT link any document

      const response = await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/auto-itemize`,
        headers: { cookie },
        payload: {
          paperlessDocumentId: 999,
          mode: 'append',
          dryRun: true,
        },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });
  });

  // ─── 400: ITEMIZED_SUM_EXCEEDS_INVOICE ───────────────────────────────────────

  describe('400 ITEMIZED_SUM_EXCEEDS_INVOICE', () => {
    it('returns 400 when sum of lines exceeds invoice amount', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'pass');
      const vendorId = createTestVendor();
      const invoiceId = createTestInvoice(vendorId, 500); // invoice = 500
      linkDocument(invoiceId, 42);

      const response = await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/auto-itemize`,
        headers: { cookie },
        payload: {
          paperlessDocumentId: 42,
          mode: 'append',
          dryRun: false,
          lines: [
            { description: 'Line A', totalAmount: 400, confidence: 0.9 },
            { description: 'Line B', totalAmount: 200, confidence: 0.8 }, // 400+200 = 600 > 500
          ],
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('ITEMIZED_SUM_EXCEEDS_INVOICE');
    });
  });

  // ─── 502: LLM errors ──────────────────────────────────────────────────────────

  describe('502 LLM errors', () => {
    it('returns 502 LLM_UNREACHABLE when LLM fetch throws a network error', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'pass');
      const vendorId = createTestVendor();
      const invoiceId = createTestInvoice(vendorId);
      linkDocument(invoiceId, 42);

      // Reset and configure fetch: Paperless doc + tags succeed, LLM fetch rejects
      mockFetch.mockReset();
      mockFetch
        .mockResolvedValueOnce(makeFetchResponse(PAPERLESS_DOC_RESPONSE))
        .mockResolvedValueOnce(makeFetchResponse(PAPERLESS_TAGS_RESPONSE))
        .mockRejectedValueOnce(new Error('ECONNREFUSED: connection refused'));

      const response = await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/auto-itemize`,
        headers: { cookie },
        payload: {
          paperlessDocumentId: 42,
          mode: 'append',
          dryRun: true,
        },
      });

      expect(response.statusCode).toBe(502);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('LLM_UNREACHABLE');
    });

    it('returns 502 LLM_INVALID_RESPONSE when LLM returns non-JSON content', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'pass');
      const vendorId = createTestVendor();
      const invoiceId = createTestInvoice(vendorId);
      linkDocument(invoiceId, 42);

      // LLM returns valid HTTP 200 but with garbage JSON content
      const garbageLlmResponse = {
        choices: [
          {
            message: {
              content: 'This is not valid JSON {{{',
            },
          },
        ],
      };

      mockFetch.mockReset();
      mockFetch
        .mockResolvedValueOnce(makeFetchResponse(PAPERLESS_DOC_RESPONSE))
        .mockResolvedValueOnce(makeFetchResponse(PAPERLESS_TAGS_RESPONSE))
        .mockResolvedValueOnce(makeFetchResponse(garbageLlmResponse));

      const response = await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/auto-itemize`,
        headers: { cookie },
        payload: {
          paperlessDocumentId: 42,
          mode: 'append',
          dryRun: true,
        },
      });

      expect(response.statusCode).toBe(502);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('LLM_INVALID_RESPONSE');
    });
  });

  // ─── 503: LLM not configured ──────────────────────────────────────────────────

  describe('503 LLM_NOT_CONFIGURED', () => {
    it('returns 503 when autoItemizeEnabled is false (no LLM env vars)', async () => {
      // Rebuild app without LLM env vars
      await app.close();
      delete process.env.LLM_BASE_URL;
      delete process.env.LLM_API_KEY;
      delete process.env.LLM_MODEL;
      app = await buildApp();

      const { cookie } = await createUserWithSession(
        'user-llm@test.com',
        'UserLLM',
        'pass',
        'member',
      );
      const vendorId = createTestVendor();
      const invoiceId = createTestInvoice(vendorId);
      linkDocument(invoiceId, 42);

      const response = await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/auto-itemize`,
        headers: { cookie },
        payload: {
          paperlessDocumentId: 42,
          mode: 'append',
          dryRun: true,
        },
      });

      expect(response.statusCode).toBe(503);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('LLM_NOT_CONFIGURED');
    });
  });

  // ─── 200: dry-run success ─────────────────────────────────────────────────────

  describe('200 success — dry-run (dryRun=true)', () => {
    it('returns 200 with lines and warnings arrays', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'pass');
      const vendorId = createTestVendor();
      const invoiceId = createTestInvoice(vendorId);
      linkDocument(invoiceId, 42);

      const response = await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/auto-itemize`,
        headers: { cookie },
        payload: {
          paperlessDocumentId: 42,
          mode: 'append',
          dryRun: true,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<AutoItemizeDryRunResponse>();
      expect(Array.isArray(body.lines)).toBe(true);
      expect(Array.isArray(body.warnings)).toBe(true);
    });

    it('returns the lines extracted by the LLM', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'pass');
      const vendorId = createTestVendor();
      const invoiceId = createTestInvoice(vendorId);
      linkDocument(invoiceId, 42);

      const response = await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/auto-itemize`,
        headers: { cookie },
        payload: {
          paperlessDocumentId: 42,
          mode: 'append',
          dryRun: true,
        },
      });

      const body = response.json<AutoItemizeDryRunResponse>();
      expect(body.lines).toHaveLength(2);
      expect(body.lines[0]!.description).toBe('Tile work');
      expect(body.lines[0]!.totalAmount).toBe(300);
      expect(body.lines[1]!.description).toBe('Grout');
    });

    it('returns TOTAL_MISMATCH warning when extracted total differs >1% from invoice amount', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'pass');
      const vendorId = createTestVendor();
      // Invoice = 1000 but LLM returns lines totalling 400 → 60% mismatch
      const invoiceId = createTestInvoice(vendorId, 1000);
      linkDocument(invoiceId, 42);

      const mismatchLlmResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                lines: [{ description: 'Big ticket', totalAmount: 400, confidence: 0.7 }],
              }),
            },
          },
        ],
      };

      mockFetch.mockReset();
      mockFetch
        .mockResolvedValueOnce(makeFetchResponse(PAPERLESS_DOC_RESPONSE))
        .mockResolvedValueOnce(makeFetchResponse(PAPERLESS_TAGS_RESPONSE))
        .mockResolvedValueOnce(makeFetchResponse(mismatchLlmResponse));

      const response = await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/auto-itemize`,
        headers: { cookie },
        payload: {
          paperlessDocumentId: 42,
          mode: 'append',
          dryRun: true,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<AutoItemizeDryRunResponse>();
      expect(body.warnings).toHaveLength(1);
      expect(body.warnings[0]!.code).toBe('TOTAL_MISMATCH');
    });

    it('dry-run does not write any DB rows', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'pass');
      const vendorId = createTestVendor();
      const invoiceId = createTestInvoice(vendorId);
      linkDocument(invoiceId, 42);

      const wibCountBefore = app.db.select().from(schema.workItemBudgets).all().length;
      const iblCountBefore = app.db.select().from(schema.invoiceBudgetLines).all().length;

      await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/auto-itemize`,
        headers: { cookie },
        payload: {
          paperlessDocumentId: 42,
          mode: 'append',
          dryRun: true,
        },
      });

      const wibCountAfter = app.db.select().from(schema.workItemBudgets).all().length;
      const iblCountAfter = app.db.select().from(schema.invoiceBudgetLines).all().length;
      expect(wibCountAfter).toBe(wibCountBefore);
      expect(iblCountAfter).toBe(iblCountBefore);
    });
  });

  // ─── 200: commit success ──────────────────────────────────────────────────────

  describe('200 success — commit (dryRun=false)', () => {
    it('returns 200 with budgetLines and remainingAmount', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'pass');
      const vendorId = createTestVendor();
      const invoiceId = createTestInvoice(vendorId, 1000);
      linkDocument(invoiceId, 42);

      const response = await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/auto-itemize`,
        headers: { cookie },
        payload: {
          paperlessDocumentId: 42,
          mode: 'append',
          dryRun: false,
          lines: [
            { description: 'Tile work', totalAmount: 300, confidence: 0.9 },
            { description: 'Grout', totalAmount: 100, confidence: 0.85 },
          ],
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<InvoiceBudgetLineListDetailResponse>();
      expect(Array.isArray(body.budgetLines)).toBe(true);
      expect(typeof body.remainingAmount).toBe('number');
    });

    it('commit response has correct remainingAmount (invoice - Σ itemized)', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'pass');
      const vendorId = createTestVendor();
      const invoiceId = createTestInvoice(vendorId, 1000);
      linkDocument(invoiceId, 42);

      const response = await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/auto-itemize`,
        headers: { cookie },
        payload: {
          paperlessDocumentId: 42,
          mode: 'append',
          dryRun: false,
          lines: [
            { description: 'Tile work', totalAmount: 300, confidence: 0.9 },
            { description: 'Grout', totalAmount: 100, confidence: 0.85 },
          ],
        },
      });

      const body = response.json<InvoiceBudgetLineListDetailResponse>();
      // 1000 - 300 - 100 = 600
      expect(body.remainingAmount).toBe(600);
    });

    it('commit response budgetLines have parentItemType=unassigned (auto lines are orphans)', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'pass');
      const vendorId = createTestVendor();
      const invoiceId = createTestInvoice(vendorId, 1000);
      linkDocument(invoiceId, 42);

      const response = await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/auto-itemize`,
        headers: { cookie },
        payload: {
          paperlessDocumentId: 42,
          mode: 'append',
          dryRun: false,
          lines: [{ description: 'Tile work', totalAmount: 400, confidence: 0.9 }],
        },
      });

      const body = response.json<InvoiceBudgetLineListDetailResponse>();
      expect(body.budgetLines[0]!.parentItemType).toBe('unassigned');
    });

    it('commit response budgetLines include description from caller-provided lines', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'pass');
      const vendorId = createTestVendor();
      const invoiceId = createTestInvoice(vendorId, 1000);
      linkDocument(invoiceId, 42);

      const response = await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/auto-itemize`,
        headers: { cookie },
        payload: {
          paperlessDocumentId: 42,
          mode: 'append',
          dryRun: false,
          lines: [{ description: 'Special custom line', totalAmount: 250, confidence: 0.9 }],
        },
      });

      const body = response.json<InvoiceBudgetLineListDetailResponse>();
      expect(body.budgetLines[0]!.budgetLineDescription).toBe('Special custom line');
    });

    it('response has all required InvoiceBudgetLineDetailResponse fields', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'pass');
      const vendorId = createTestVendor();
      const invoiceId = createTestInvoice(vendorId, 1000);
      linkDocument(invoiceId, 42);

      const response = await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/auto-itemize`,
        headers: { cookie },
        payload: {
          paperlessDocumentId: 42,
          mode: 'append',
          dryRun: false,
          lines: [{ description: 'Line 1', totalAmount: 100, confidence: 0.9 }],
        },
      });

      const body = response.json<InvoiceBudgetLineListDetailResponse>();
      const line = body.budgetLines[0]!;
      expect(line).toHaveProperty('id');
      expect(line).toHaveProperty('invoiceId');
      expect(line).toHaveProperty('workItemBudgetId');
      expect(line).toHaveProperty('householdItemBudgetId');
      expect(line).toHaveProperty('itemizedAmount');
      expect(line).toHaveProperty('plannedAmount');
      expect(line).toHaveProperty('confidence');
      expect(line).toHaveProperty('createdAt');
      expect(line).toHaveProperty('updatedAt');
      expect(line.invoiceId).toBe(invoiceId);
    });

    it('commit with mode=replace returns only the new lines (auto lines replaced)', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'pass');
      const vendorId = createTestVendor();
      const invoiceId = createTestInvoice(vendorId, 2000);
      linkDocument(invoiceId, 42);

      // First commit: add 2 auto lines
      await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/auto-itemize`,
        headers: { cookie },
        payload: {
          paperlessDocumentId: 42,
          mode: 'append',
          dryRun: false,
          lines: [
            { description: 'Old line 1', totalAmount: 200, confidence: 0.8 },
            { description: 'Old line 2', totalAmount: 150, confidence: 0.8 },
          ],
        },
      });

      // Second commit: replace with 1 new line
      const response = await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/auto-itemize`,
        headers: { cookie },
        payload: {
          paperlessDocumentId: 42,
          mode: 'replace',
          dryRun: false,
          lines: [{ description: 'New consolidated line', totalAmount: 500, confidence: 0.95 }],
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<InvoiceBudgetLineListDetailResponse>();
      // The 2 old auto lines should be gone; only the 1 new line remains
      expect(body.budgetLines).toHaveLength(1);
      expect(body.budgetLines[0]!.budgetLineDescription).toBe('New consolidated line');
    });
  });

  // ─── invoicePatch schema validation (Story #1564) ────────────────────────────

  describe('400 VALIDATION_ERROR — invoicePatch schema', () => {
    it('returns 400 when invoicePatch has no properties (minProperties violation)', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'pass');
      const vendorId = createTestVendor();
      const invoiceId = createTestInvoice(vendorId, 1000);
      linkDocument(invoiceId, 42);

      const response = await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/auto-itemize`,
        headers: { cookie },
        payload: {
          paperlessDocumentId: 42,
          mode: 'append',
          dryRun: false,
          lines: [],
          invoicePatch: {},
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<{ error: { code: string } }>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    // Fastify AJV default: removeAdditional=true strips unknown props instead of rejecting (see invoiceBudgetLines.test.ts:365)
    it('silently strips disallowed vendorId field (removeAdditional)', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'pass');
      const vendorId = createTestVendor();
      const invoiceId = createTestInvoice(vendorId, 1000);
      linkDocument(invoiceId, 42);

      const response = await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/auto-itemize`,
        headers: { cookie },
        payload: {
          paperlessDocumentId: 42,
          mode: 'append',
          dryRun: false,
          lines: [],
          invoicePatch: { vendorId: 'some-other-vendor-id', notes: 'test' },
        },
      });

      // removeAdditional strips vendorId — request succeeds
      expect(response.statusCode).toBe(200);
      // vendorId is unchanged — the disallowed field was stripped before reaching the service
      const updatedInvoice = app.db
        .select()
        .from(schema.invoices)
        .where(eq(schema.invoices.id, invoiceId))
        .get()!;
      expect(updatedInvoice.vendorId).toBe(vendorId);
      // notes is updated — the allowed field was applied
      expect(updatedInvoice.notes).toBe('test');
    });

    it('returns 400 when invoicePatch.amount is 0 (exclusiveMinimum: 0 violation)', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'pass');
      const vendorId = createTestVendor();
      const invoiceId = createTestInvoice(vendorId, 1000);
      linkDocument(invoiceId, 42);

      const response = await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/auto-itemize`,
        headers: { cookie },
        payload: {
          paperlessDocumentId: 42,
          mode: 'append',
          dryRun: false,
          lines: [],
          invoicePatch: { amount: 0 },
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<{ error: { code: string } }>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when invoicePatch.date has invalid format (pattern violation)', async () => {
      // Note: schema validates the date pattern ^\\d{4}-\\d{2}-\\d{2}$ at the route level.
      // Invalid dates that match the pattern (e.g. '2026-99-99') would be caught by the
      // service-layer updateInvoice() validation instead. This test verifies the schema-level check.
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'pass');
      const vendorId = createTestVendor();
      const invoiceId = createTestInvoice(vendorId, 1000);
      linkDocument(invoiceId, 42);

      const response = await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/auto-itemize`,
        headers: { cookie },
        payload: {
          paperlessDocumentId: 42,
          mode: 'append',
          dryRun: false,
          lines: [],
          invoicePatch: { date: 'not-a-date' },
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<{ error: { code: string } }>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 200 when invoicePatch has valid notes field', async () => {
      const { cookie } = await createUserWithSession('user@test.com', 'User', 'pass');
      const vendorId = createTestVendor();
      const invoiceId = createTestInvoice(vendorId, 1000);
      linkDocument(invoiceId, 42);

      const response = await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/auto-itemize`,
        headers: { cookie },
        payload: {
          paperlessDocumentId: 42,
          mode: 'append',
          dryRun: false,
          lines: [],
          invoicePatch: { notes: 'test note' },
        },
      });

      expect(response.statusCode).toBe(200);
    });

    // ─── Story #1576: invoicePatch.status enum ────────────────────────────────

    it('returns 200 when invoicePatch.status is "paid" (valid enum value)', async () => {
      // Story #1576 added status to the invoicePatch schema properties.
      // Previously status was stripped by removeAdditional; now it is an allowed field.
      const { cookie } = await createUserWithSession('user-status@test.com', 'UserStatus', 'pass');
      const vendorId = createTestVendor();
      const invoiceId = createTestInvoice(vendorId, 1000);
      linkDocument(invoiceId, 42);

      const response = await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/auto-itemize`,
        headers: { cookie },
        payload: {
          paperlessDocumentId: 42,
          mode: 'append',
          dryRun: false,
          lines: [],
          invoicePatch: { status: 'paid' },
        },
      });

      expect(response.statusCode).toBe(200);
      // Verify the status was actually updated in the DB
      const updatedInvoice = app.db
        .select()
        .from(schema.invoices)
        .where(eq(schema.invoices.id, invoiceId))
        .get()!;
      expect(updatedInvoice.status).toBe('paid');
    });

    it('returns 200 when invoicePatch.status is "claimed" (valid enum value)', async () => {
      const { cookie } = await createUserWithSession(
        'user-claimed@test.com',
        'UserClaimed',
        'pass',
      );
      const vendorId = createTestVendor();
      const invoiceId = createTestInvoice(vendorId, 1000);
      linkDocument(invoiceId, 42);

      const response = await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/auto-itemize`,
        headers: { cookie },
        payload: {
          paperlessDocumentId: 42,
          mode: 'append',
          dryRun: false,
          lines: [],
          invoicePatch: { status: 'claimed' },
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('returns 400 VALIDATION_ERROR when invoicePatch.status is an invalid enum value', async () => {
      // The schema defines status as enum: ['pending', 'paid', 'claimed', 'quotation'].
      // An invalid value must be rejected with VALIDATION_ERROR.
      const { cookie } = await createUserWithSession(
        'user-badstatus@test.com',
        'BadStatus',
        'pass',
      );
      const vendorId = createTestVendor();
      const invoiceId = createTestInvoice(vendorId, 1000);
      linkDocument(invoiceId, 42);

      const response = await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/auto-itemize`,
        headers: { cookie },
        payload: {
          paperlessDocumentId: 42,
          mode: 'append',
          dryRun: false,
          lines: [],
          invoicePatch: { status: 'invalid_status' },
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<{ error: { code: string } }>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // ─── Story #1588 / #1589: assignmentMode, budgetCategoryId, budgetSourceId schema ─

  describe('400 VALIDATION_ERROR — assignmentMode and per-line fields', () => {
    it('accepts request with assignmentMode: "create-new"', async () => {
      const { cookie } = await createUserWithSession(
        'user-mode-create@test.com',
        'UserModeCreate',
        'pass',
      );
      const vendorId = createTestVendor();
      const invoiceId = createTestInvoice(vendorId, 1000);
      linkDocument(invoiceId, 42);

      const response = await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/auto-itemize`,
        headers: { cookie },
        payload: {
          paperlessDocumentId: 42,
          mode: 'append',
          dryRun: false,
          lines: [
            {
              description: 'New line',
              totalAmount: 200,
              confidence: 0.9,
              assignmentMode: 'create-new',
            },
          ],
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('accepts request with assignmentMode: "assign-existing" and assignedBudgetLineId', async () => {
      const { cookie } = await createUserWithSession(
        'user-mode-existing@test.com',
        'UserModeExisting',
        'pass',
      );
      const vendorId = createTestVendor();
      const invoiceId = createTestInvoice(vendorId, 1000);
      linkDocument(invoiceId, 42);

      // The service will throw NotFoundError because the budget line doesn't exist,
      // but that means the schema passed validation (400 schema rejection is what we're preventing)
      const response = await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/auto-itemize`,
        headers: { cookie },
        payload: {
          paperlessDocumentId: 42,
          mode: 'append',
          dryRun: false,
          lines: [
            {
              description: 'Assign existing',
              totalAmount: 200,
              confidence: 0.9,
              assignmentMode: 'assign-existing',
              assignedBudgetLineId: 'some-budget-line-id',
              assignedBudgetLineType: 'work_item',
            },
          ],
        },
      });

      // 404 (not found for the budget line) means the schema was accepted
      expect([200, 404]).toContain(response.statusCode);
      if (response.statusCode === 404) {
        const body = response.json<{ error: { code: string } }>();
        expect(body.error.code).toBe('NOT_FOUND');
      }
    });

    it('rejects request with assignmentMode: "invalid-value" with 400', async () => {
      const { cookie } = await createUserWithSession(
        'user-mode-invalid@test.com',
        'UserModeInvalid',
        'pass',
      );
      const vendorId = createTestVendor();
      const invoiceId = createTestInvoice(vendorId, 1000);

      const response = await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/auto-itemize`,
        headers: { cookie },
        payload: {
          paperlessDocumentId: 42,
          mode: 'append',
          dryRun: false,
          lines: [
            {
              description: 'Bad mode',
              totalAmount: 200,
              confidence: 0.9,
              assignmentMode: 'invalid-value',
            },
          ],
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<{ error: { code: string } }>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects request with budgetCategoryId longer than 36 chars with 400', async () => {
      const { cookie } = await createUserWithSession(
        'user-cat-toolong@test.com',
        'UserCatTooLong',
        'pass',
      );
      const vendorId = createTestVendor();
      const invoiceId = createTestInvoice(vendorId, 1000);

      const response = await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/auto-itemize`,
        headers: { cookie },
        payload: {
          paperlessDocumentId: 42,
          mode: 'append',
          dryRun: false,
          lines: [
            {
              description: 'Long category id',
              totalAmount: 100,
              confidence: 0.9,
              // 37 characters — one over the maxLength: 36
              budgetCategoryId: 'a'.repeat(37),
            },
          ],
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<{ error: { code: string } }>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('accepts request with budgetCategoryId exactly 36 chars', async () => {
      const { cookie } = await createUserWithSession(
        'user-cat-36@test.com',
        'UserCat36',
        'pass',
      );
      const vendorId = createTestVendor();
      const invoiceId = createTestInvoice(vendorId, 1000);
      linkDocument(invoiceId, 42);

      const response = await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/auto-itemize`,
        headers: { cookie },
        payload: {
          paperlessDocumentId: 42,
          mode: 'append',
          dryRun: false,
          lines: [
            {
              description: 'Line with category',
              totalAmount: 100,
              confidence: 0.9,
              // exactly 36 chars (valid UUID length)
              budgetCategoryId: 'a'.repeat(36),
            },
          ],
        },
      });

      // The schema accepts it; service may reject it (unknown category FK) → 200 or non-400
      expect(response.statusCode).not.toBe(400);
    });

    it('accepts request with budgetSourceId of valid maxLength', async () => {
      const { cookie } = await createUserWithSession(
        'user-src@test.com',
        'UserSrc',
        'pass',
      );
      const vendorId = createTestVendor();
      const invoiceId = createTestInvoice(vendorId, 1000);
      linkDocument(invoiceId, 42);

      const response = await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/auto-itemize`,
        headers: { cookie },
        payload: {
          paperlessDocumentId: 42,
          mode: 'append',
          dryRun: false,
          lines: [
            {
              description: 'Line with source',
              totalAmount: 100,
              confidence: 0.9,
              budgetSourceId: 'discretionary-system',
            },
          ],
        },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  // ─── Story #1576: dry-run response with extractedInvoiceDate / extractedDueDate ─

  describe('200 success — dry-run with extracted date fields (Story #1576)', () => {
    it('dry-run response includes extractedInvoiceDate when LLM returns invoiceDate', async () => {
      const { cookie } = await createUserWithSession('user-dates@test.com', 'UserDates', 'pass');
      const vendorId = createTestVendor();
      const invoiceId = createTestInvoice(vendorId, 400);
      linkDocument(invoiceId, 42);

      const llmResponseWithDates = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                invoiceDate: '2024-03-15',
                dueDate: '2024-04-15',
                lines: [{ description: 'Labor', totalAmount: 200, confidence: 0.9 }],
              }),
            },
          },
        ],
      };

      mockFetch.mockReset();
      mockFetch
        .mockResolvedValueOnce(makeFetchResponse(PAPERLESS_DOC_RESPONSE))
        .mockResolvedValueOnce(makeFetchResponse(PAPERLESS_TAGS_RESPONSE))
        .mockResolvedValueOnce(makeFetchResponse(llmResponseWithDates));

      const response = await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/auto-itemize`,
        headers: { cookie },
        payload: {
          paperlessDocumentId: 42,
          mode: 'append',
          dryRun: true,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<AutoItemizeDryRunResponse>();
      expect(body.extractedInvoiceDate).toBe('2024-03-15');
      expect(body.extractedDueDate).toBe('2024-04-15');
    });

    it('dry-run response omits extractedInvoiceDate when LLM returns no date fields', async () => {
      const { cookie } = await createUserWithSession(
        'user-nodates@test.com',
        'UserNoDates',
        'pass',
      );
      const vendorId = createTestVendor();
      const invoiceId = createTestInvoice(vendorId, 400);
      linkDocument(invoiceId, 42);

      // LLM_LINES_RESPONSE already has no date fields — use the default mock
      const response = await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/auto-itemize`,
        headers: { cookie },
        payload: {
          paperlessDocumentId: 42,
          mode: 'append',
          dryRun: true,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<AutoItemizeDryRunResponse>();
      // When LLM does not return date fields, the response must NOT include these keys
      expect(body.extractedInvoiceDate).toBeUndefined();
      expect(body.extractedDueDate).toBeUndefined();
    });

    it('dry-run response includes only extractedInvoiceDate when LLM returns only invoiceDate', async () => {
      const { cookie } = await createUserWithSession(
        'user-dateonly@test.com',
        'UserDateOnly',
        'pass',
      );
      const vendorId = createTestVendor();
      const invoiceId = createTestInvoice(vendorId, 300);
      linkDocument(invoiceId, 42);

      const llmResponseDateOnly = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                invoiceDate: '2024-06-01',
                lines: [],
              }),
            },
          },
        ],
      };

      mockFetch.mockReset();
      mockFetch
        .mockResolvedValueOnce(makeFetchResponse(PAPERLESS_DOC_RESPONSE))
        .mockResolvedValueOnce(makeFetchResponse(PAPERLESS_TAGS_RESPONSE))
        .mockResolvedValueOnce(makeFetchResponse(llmResponseDateOnly));

      const response = await app.inject({
        method: 'POST',
        url: `/api/invoices/${invoiceId}/auto-itemize`,
        headers: { cookie },
        payload: {
          paperlessDocumentId: 42,
          mode: 'append',
          dryRun: true,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<AutoItemizeDryRunResponse>();
      expect(body.extractedInvoiceDate).toBe('2024-06-01');
      expect(body.extractedDueDate).toBeUndefined();
    });
  });
});
