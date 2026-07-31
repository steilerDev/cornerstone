/**
 * Integration tests for POST /api/source-reports/generate-content (Story #1901).
 *
 * Uses buildApp() + Fastify's app.inject() to test the full request-response cycle. Follows the
 * same test-seam pattern as invoiceAutoItemize.test.ts: globalThis.fetch is stubbed to intercept
 * the LLM HTTP call so no real network access is required.
 *
 * NOTE: as of writing, `server/src/services/reportContentGenerationService.ts` line 9 imports
 * non-existent schema exports `work_items`/`household_items` (the real exports are
 * `workItems`/`householdItems`) — see GitHub issue #1915. Because `app.ts` statically imports
 * `routes/sourceReports.js`, which imports the broken module, `buildApp()` itself fails to load
 * for EVERY test in this file (and, transitively, every other server-side test that calls
 * buildApp() at all). The tests below are written against the intended/correct behavior per the
 * Story #1901 acceptance criteria and the API Contract wiki page, and are expected to pass once
 * #1915 is fixed — they have NOT been weakened to route around the bug.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../app.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import type { FastifyInstance } from 'fastify';
import type { ApiErrorResponse, GenerateReportContentResponse } from '@cornerstone/shared';
import * as schema from '../db/schema.js';

// ─── LLM response builder ──────────────────────────────────────────────────────

function makeFetchResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
    statusText: status === 200 ? 'OK' : 'Error',
  } as unknown as Response;
}

function llmReportContentResponse(
  letterSubject: string,
  letterBody: string,
  descriptions: Array<{ invoiceId: string; description: string }>,
): Response {
  return makeFetchResponse({
    choices: [
      {
        message: {
          content: JSON.stringify({ letterSubject, letterBody, descriptions }),
        },
      },
    ],
  });
}

describe('POST /api/source-reports/generate-content', () => {
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

    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-generate-content-test-'));
    process.env.DATABASE_URL = join(tempDir, 'test.db');
    process.env.SECURE_COOKIES = 'false';
    process.env.LLM_BASE_URL = 'http://llm.test.local';
    process.env.LLM_API_KEY = 'test-llm-key';
    process.env.LLM_MODEL = 'gpt-4o-test';

    app = await buildApp();
    tsOffset = 0;
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

  function ts(): string {
    return new Date(Date.now() + tsOffset++).toISOString();
  }

  function createTestSource(
    overrides: Partial<typeof schema.budgetSources.$inferInsert> = {},
  ): string {
    const id = overrides.id ?? `src-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const now = ts();
    app.db
      .insert(schema.budgetSources)
      .values({
        name: 'Home Loan',
        sourceType: 'bank_loan',
        totalAmount: 100000,
        isDiscretionary: false,
        status: 'active',
        reference: null,
        contactAddress: null,
        createdAt: now,
        updatedAt: now,
        ...overrides,
        id,
      })
      .run();
    return id;
  }

  function createTestVendor(name = 'Test Vendor'): string {
    const id = `vendor-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const t = ts();
    app.db.insert(schema.vendors).values({ id, name, createdAt: t, updatedAt: t }).run();
    return id;
  }

  function createTestInvoice(vendorId: string, amount = 1000): string {
    const id = `inv-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const t = ts();
    app.db
      .insert(schema.invoices)
      .values({
        id,
        vendorId,
        invoiceNumber: `INV-${id}`,
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

  function createWorkItemBudgetLine(invoiceId: string, sourceId: string, amount: number): void {
    const wiId = `wi-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const budgetId = `wib-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const t = ts();
    app.db
      .insert(schema.workItems)
      .values({
        id: wiId,
        title: 'Foundation work',
        status: 'not_started',
        createdAt: t,
        updatedAt: t,
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
        createdAt: t,
        updatedAt: t,
      })
      .run();
    app.db
      .insert(schema.invoiceBudgetLines)
      .values({
        id: `ibl-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        invoiceId,
        workItemBudgetId: budgetId,
        itemizedAmount: amount,
        createdAt: t,
        updatedAt: t,
      })
      .run();
  }

  /** Seed a source + vendor + invoice + work-item budget line, all wired together. */
  function seedReportFixture(amount = 1000): { sourceId: string; invoiceId: string } {
    const sourceId = createTestSource();
    const vendorId = createTestVendor();
    const invoiceId = createTestInvoice(vendorId, amount);
    createWorkItemBudgetLine(invoiceId, sourceId, amount);
    return { sourceId, invoiceId };
  }

  function validBody(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
    return {
      type: 'claim',
      sourceId: 'placeholder',
      language: 'en',
      includedInvoiceIds: ['placeholder'],
      ...overrides,
    };
  }

  // ─── 401: authentication required ────────────────────────────────────────────

  describe('authentication', () => {
    it('returns 401 UNAUTHORIZED when no session cookie is provided', async () => {
      const { sourceId, invoiceId } = seedReportFixture();

      const response = await app.inject({
        method: 'POST',
        url: '/api/source-reports/generate-content',
        payload: validBody({ sourceId, includedInvoiceIds: [invoiceId] }),
      });

      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('allows a member user to call the endpoint', async () => {
      const { cookie } = await createUserWithSession('member@test.com', 'Member', 'pass', 'member');
      const { sourceId, invoiceId } = seedReportFixture();
      mockFetch.mockResolvedValueOnce(
        llmReportContentResponse('Subject', 'Body', [
          { invoiceId, description: 'Foundation work' },
        ]),
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/source-reports/generate-content',
        headers: { cookie },
        payload: validBody({ sourceId, includedInvoiceIds: [invoiceId] }),
      });

      expect(response.statusCode).toBe(200);
    });
  });

  // ─── 400: schema validation matrix ────────────────────────────────────────────

  describe('400 VALIDATION_ERROR — schema validation', () => {
    it('returns 400 when type is an invalid enum value', async () => {
      const { cookie } = await createUserWithSession('user1@test.com', 'User', 'pass');
      const { sourceId, invoiceId } = seedReportFixture();

      const response = await app.inject({
        method: 'POST',
        url: '/api/source-reports/generate-content',
        headers: { cookie },
        payload: validBody({ type: 'not-a-real-type', sourceId, includedInvoiceIds: [invoiceId] }),
      });

      expect(response.statusCode).toBe(400);
      expect(response.json<ApiErrorResponse>().error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when language is an invalid enum value', async () => {
      const { cookie } = await createUserWithSession('user2@test.com', 'User', 'pass');
      const { sourceId, invoiceId } = seedReportFixture();

      const response = await app.inject({
        method: 'POST',
        url: '/api/source-reports/generate-content',
        headers: { cookie },
        payload: validBody({ language: 'fr', sourceId, includedInvoiceIds: [invoiceId] }),
      });

      expect(response.statusCode).toBe(400);
      expect(response.json<ApiErrorResponse>().error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when includedInvoiceIds is an empty array', async () => {
      const { cookie } = await createUserWithSession('user3@test.com', 'User', 'pass');
      const { sourceId } = seedReportFixture();

      const response = await app.inject({
        method: 'POST',
        url: '/api/source-reports/generate-content',
        headers: { cookie },
        payload: validBody({ sourceId, includedInvoiceIds: [] }),
      });

      expect(response.statusCode).toBe(400);
      expect(response.json<ApiErrorResponse>().error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when includedInvoiceIds exceeds 200 items', async () => {
      const { cookie } = await createUserWithSession('user4@test.com', 'User', 'pass');
      const { sourceId } = seedReportFixture();
      const tooMany = Array.from({ length: 201 }, (_, i) => `inv-${i}`);

      const response = await app.inject({
        method: 'POST',
        url: '/api/source-reports/generate-content',
        headers: { cookie },
        payload: validBody({ sourceId, includedInvoiceIds: tooMany }),
      });

      expect(response.statusCode).toBe(400);
      expect(response.json<ApiErrorResponse>().error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when required fields are missing', async () => {
      const { cookie } = await createUserWithSession('user5@test.com', 'User', 'pass');

      const response = await app.inject({
        method: 'POST',
        url: '/api/source-reports/generate-content',
        headers: { cookie },
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      expect(response.json<ApiErrorResponse>().error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when excludedLineIds exceeds 500 items', async () => {
      const { cookie } = await createUserWithSession('user6@test.com', 'User', 'pass');
      const { sourceId, invoiceId } = seedReportFixture();
      const tooMany = Array.from({ length: 501 }, (_, i) => `line-${i}`);

      const response = await app.inject({
        method: 'POST',
        url: '/api/source-reports/generate-content',
        headers: { cookie },
        payload: validBody({
          sourceId,
          includedInvoiceIds: [invoiceId],
          excludedLineIds: tooMany,
        }),
      });

      expect(response.statusCode).toBe(400);
      expect(response.json<ApiErrorResponse>().error.code).toBe('VALIDATION_ERROR');
    });

    it('strips unknown/additional properties (removeAdditional) rather than 400ing', async () => {
      const { cookie } = await createUserWithSession('user7@test.com', 'User', 'pass');
      const { sourceId, invoiceId } = seedReportFixture();
      mockFetch.mockResolvedValueOnce(
        llmReportContentResponse('Subject', 'Body', [
          { invoiceId, description: 'Foundation work' },
        ]),
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/source-reports/generate-content',
        headers: { cookie },
        payload: {
          ...validBody({ sourceId, includedInvoiceIds: [invoiceId] }),
          notAllowedField: 'should be stripped',
        },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  // ─── 200: happy path en + de ──────────────────────────────────────────────────

  describe('200 success', () => {
    it('returns the generated content shape in English', async () => {
      const { cookie } = await createUserWithSession('user-en@test.com', 'User', 'pass');
      const { sourceId, invoiceId } = seedReportFixture();
      mockFetch.mockResolvedValueOnce(
        llmReportContentResponse('Financial Report', 'Dear Sir or Madam,', [
          { invoiceId, description: 'Foundation excavation' },
        ]),
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/source-reports/generate-content',
        headers: { cookie },
        payload: validBody({ sourceId, includedInvoiceIds: [invoiceId] }),
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<GenerateReportContentResponse>();
      expect(body.letterSubject).toBe('Financial Report');
      expect(body.letterBody).toBe('Dear Sir or Madam,');
      expect(body.descriptions).toEqual({ [invoiceId]: 'Foundation excavation' });
    });

    it('returns the generated content shape in German (report language forwarded to the provider)', async () => {
      const { cookie } = await createUserWithSession('user-de@test.com', 'User', 'pass');
      const { sourceId, invoiceId } = seedReportFixture();
      mockFetch.mockResolvedValueOnce(
        llmReportContentResponse('Finanzbericht', 'Sehr geehrte Damen und Herren,', [
          { invoiceId, description: 'Fundamentaushub' },
        ]),
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/source-reports/generate-content',
        headers: { cookie },
        payload: validBody({ sourceId, language: 'de', includedInvoiceIds: [invoiceId] }),
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<GenerateReportContentResponse>();
      expect(body.letterSubject).toBe('Finanzbericht');
      expect(body.descriptions).toEqual({ [invoiceId]: 'Fundamentaushub' });

      // The report language ('de') must reach the LLM prompt, not just the UI locale.
      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      const requestBody = JSON.parse(init.body as string) as {
        messages: Array<{ role: string; content: string }>;
      };
      const userMessage = requestBody.messages.find((m) => m.role === 'user');
      expect(userMessage?.content).toContain('Language: German');
    });

    it('does not write any DB rows (nothing persisted server-side)', async () => {
      const { cookie } = await createUserWithSession('user-nowrite@test.com', 'User', 'pass');
      const { sourceId, invoiceId } = seedReportFixture();
      mockFetch.mockResolvedValueOnce(
        llmReportContentResponse('Subject', 'Body', [
          { invoiceId, description: 'Foundation work' },
        ]),
      );

      const invoiceCountBefore = app.db.select().from(schema.invoices).all().length;
      const iblCountBefore = app.db.select().from(schema.invoiceBudgetLines).all().length;

      await app.inject({
        method: 'POST',
        url: '/api/source-reports/generate-content',
        headers: { cookie },
        payload: validBody({ sourceId, includedInvoiceIds: [invoiceId] }),
      });

      expect(app.db.select().from(schema.invoices).all().length).toBe(invoiceCountBefore);
      expect(app.db.select().from(schema.invoiceBudgetLines).all().length).toBe(iblCountBefore);
    });
  });

  // ─── 404: unknown source ──────────────────────────────────────────────────────

  describe('404 NOT_FOUND', () => {
    it('returns 404 when sourceId does not exist', async () => {
      const { cookie } = await createUserWithSession('user-404@test.com', 'User', 'pass');

      const response = await app.inject({
        method: 'POST',
        url: '/api/source-reports/generate-content',
        headers: { cookie },
        payload: validBody({ sourceId: 'does-not-exist', includedInvoiceIds: ['inv-x'] }),
      });

      expect(response.statusCode).toBe(404);
      expect(response.json<ApiErrorResponse>().error.code).toBe('NOT_FOUND');
    });
  });

  // ─── 400: EMPTY_SELECTION ──────────────────────────────────────────────────────

  describe('400 EMPTY_SELECTION', () => {
    it('returns 400 EMPTY_SELECTION when no included invoices overlap with the report', async () => {
      const { cookie } = await createUserWithSession('user-empty@test.com', 'User', 'pass');
      const { sourceId } = seedReportFixture();

      const response = await app.inject({
        method: 'POST',
        url: '/api/source-reports/generate-content',
        headers: { cookie },
        payload: validBody({ sourceId, includedInvoiceIds: ['not-in-this-report'] }),
      });

      expect(response.statusCode).toBe(400);
      expect(response.json<ApiErrorResponse>().error.code).toBe('EMPTY_SELECTION');
    });
  });

  // ─── 503: LLM_NOT_CONFIGURED ───────────────────────────────────────────────────

  describe('503 LLM_NOT_CONFIGURED', () => {
    it('returns 503 when LLM env vars are not set', async () => {
      await app.close();
      delete process.env.LLM_BASE_URL;
      delete process.env.LLM_API_KEY;
      delete process.env.LLM_MODEL;
      app = await buildApp();

      const { cookie } = await createUserWithSession('user-nollm@test.com', 'User', 'pass');
      const { sourceId, invoiceId } = seedReportFixture();

      const response = await app.inject({
        method: 'POST',
        url: '/api/source-reports/generate-content',
        headers: { cookie },
        payload: validBody({ sourceId, includedInvoiceIds: [invoiceId] }),
      });

      expect(response.statusCode).toBe(503);
      expect(response.json<ApiErrorResponse>().error.code).toBe('LLM_NOT_CONFIGURED');
    });
  });

  // ─── 502: LLM error taxonomy ───────────────────────────────────────────────────

  describe('502 LLM errors', () => {
    it('returns 502 LLM_UNREACHABLE when the LLM fetch throws a network error', async () => {
      const { cookie } = await createUserWithSession('user-unreachable@test.com', 'User', 'pass');
      const { sourceId, invoiceId } = seedReportFixture();
      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const response = await app.inject({
        method: 'POST',
        url: '/api/source-reports/generate-content',
        headers: { cookie },
        payload: validBody({ sourceId, includedInvoiceIds: [invoiceId] }),
      });

      expect(response.statusCode).toBe(502);
      expect(response.json<ApiErrorResponse>().error.code).toBe('LLM_UNREACHABLE');
    });

    it('returns 502 LLM_INVALID_RESPONSE when the LLM returns malformed JSON', async () => {
      const { cookie } = await createUserWithSession('user-invalid@test.com', 'User', 'pass');
      const { sourceId, invoiceId } = seedReportFixture();
      mockFetch.mockResolvedValueOnce(
        makeFetchResponse({
          choices: [{ message: { content: 'not valid json {{{' } }],
        }),
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/source-reports/generate-content',
        headers: { cookie },
        payload: validBody({ sourceId, includedInvoiceIds: [invoiceId] }),
      });

      expect(response.statusCode).toBe(502);
      expect(response.json<ApiErrorResponse>().error.code).toBe('LLM_INVALID_RESPONSE');
    });

    it('returns 502 LLM_INVALID_RESPONSE when the LLM response is missing a requested invoice description', async () => {
      const { cookie } = await createUserWithSession('user-missing@test.com', 'User', 'pass');
      const { sourceId, invoiceId } = seedReportFixture();
      mockFetch.mockResolvedValueOnce(llmReportContentResponse('Subject', 'Body', []));

      const response = await app.inject({
        method: 'POST',
        url: '/api/source-reports/generate-content',
        headers: { cookie },
        payload: validBody({ sourceId, includedInvoiceIds: [invoiceId] }),
      });

      expect(response.statusCode).toBe(502);
      expect(response.json<ApiErrorResponse>().error.code).toBe('LLM_INVALID_RESPONSE');
    });

    it('returns 502 LLM_UPSTREAM_ERROR when the LLM provider returns a non-2xx status', async () => {
      const { cookie } = await createUserWithSession('user-upstream@test.com', 'User', 'pass');
      const { sourceId, invoiceId } = seedReportFixture();
      mockFetch.mockResolvedValueOnce(makeFetchResponse({ error: 'server exploded' }, 500));

      const response = await app.inject({
        method: 'POST',
        url: '/api/source-reports/generate-content',
        headers: { cookie },
        payload: validBody({ sourceId, includedInvoiceIds: [invoiceId] }),
      });

      expect(response.statusCode).toBe(502);
      expect(response.json<ApiErrorResponse>().error.code).toBe('LLM_UPSTREAM_ERROR');
    });

    it('does not leak raw provider error details in the HTTP response (suppressDetails)', async () => {
      const { cookie } = await createUserWithSession('user-suppress@test.com', 'User', 'pass');
      const { sourceId, invoiceId } = seedReportFixture();
      mockFetch.mockResolvedValueOnce(
        makeFetchResponse({ error: 'super secret upstream diagnostic payload' }, 500),
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/source-reports/generate-content',
        headers: { cookie },
        payload: validBody({ sourceId, includedInvoiceIds: [invoiceId] }),
      });

      expect(response.statusCode).toBe(502);
      expect(response.body).not.toContain('super secret upstream diagnostic payload');
      const body = response.json<ApiErrorResponse>();
      expect(body.error.details).toBeUndefined();
    });
  });
});
