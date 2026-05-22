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
});
