/**
 * Integration tests for paperless routes.
 *
 * Tests cover:
 * - GET /api/paperless/status (not configured, reachable, unreachable)
 * - GET /api/paperless/documents (success, not configured, unauthenticated)
 * - GET /api/paperless/documents/:id (success, not found, not configured)
 * - GET /api/paperless/documents/:id/thumb (success, not found, not configured)
 * - GET /api/paperless/documents/:id/preview (success, not found, not configured)
 * - GET /api/paperless/tags (success, not configured)
 * - Authentication enforcement on all endpoints
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../app.js';
import * as userService from '../services/userService.js';
import * as sessionService from '../services/sessionService.js';
import { _resetFilterTagCache } from '../services/paperlessService.js';
import type { FastifyInstance } from 'fastify';
import type {
  PaperlessStatusResponse,
  PaperlessDocumentListResponse,
  PaperlessDocumentDetailResponse,
  PaperlessTagListResponse,
  ApiErrorResponse,
} from '@cornerstone/shared';

// ─── Mock global fetch ────────────────────────────────────────────────────────

const mockFetch = jest.fn<typeof fetch>();
let originalFetch: typeof fetch;

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const RAW_TAG = { id: 5, name: 'invoice', colour: 6, document_count: 15 };
const RAW_TAGS_RESPONSE = { count: 1, results: [RAW_TAG] };

const RAW_DOCUMENT = {
  id: 42,
  title: 'Test Document',
  content: 'Full content.',
  tags: [5],
  created: '2026-01-15T00:00:00Z',
  added: '2026-01-16T08:30:00Z',
  modified: '2026-01-16T08:30:00Z',
  correspondent: null,
  document_type: null,
  archive_serial_number: null,
  original_file_name: 'test.pdf',
  page_count: 1,
};

const RAW_LIST_RESPONSE = { count: 1, results: [RAW_DOCUMENT] };

// ─── Mock response builders ───────────────────────────────────────────────────

function mockJsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : status === 404 ? 'Not Found' : 'Server Error',
    json: () => Promise.resolve(body),
    headers: { get: (_key: string) => null },
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
  } as unknown as Response;
}

function mockBinaryResponse(contentType = 'image/webp'): Response {
  const data = Buffer.from('fake-binary-data');
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: () => Promise.reject(new Error('not JSON')),
    headers: {
      get: (key: string) => (key === 'content-type' ? contentType : null),
    },
    arrayBuffer: () =>
      Promise.resolve(
        data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer,
      ),
  } as unknown as Response;
}

// ─── Test setup ───────────────────────────────────────────────────────────────

describe('Paperless Routes', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    originalFetch = global.fetch;
    global.fetch = mockFetch as unknown as typeof fetch;
    mockFetch.mockClear();
    _resetFilterTagCache();

    originalEnv = { ...process.env };

    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-paperless-test-'));
    process.env.DATABASE_URL = join(tempDir, 'test.db');
    process.env.SECURE_COOKIES = 'false';
    // Do NOT set PAPERLESS_URL or PAPERLESS_API_TOKEN by default (not configured state)
    delete process.env.PAPERLESS_URL;
    delete process.env.PAPERLESS_API_TOKEN;

    app = await buildApp();
  });

  afterEach(async () => {
    global.fetch = originalFetch;

    if (app) {
      await app.close();
    }

    delete process.env.PAPERLESS_EXTERNAL_URL;
    process.env = originalEnv;

    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  /**
   * Helper: Create a user and return a session cookie
   */
  async function createUserWithSession(
    email = 'user@example.com',
    role: 'admin' | 'member' = 'member',
  ): Promise<{ cookie: string }> {
    const user = await userService.createLocalUser(app.db, email, 'Test User', 'password', role);
    const token = sessionService.createSession(app.db, user.id, 3600);
    return { cookie: `cornerstone_session=${token}` };
  }

  /**
   * Helper: Re-build the app with Paperless configured
   */
  async function rebuildAppWithPaperless(): Promise<void> {
    await app.close();
    process.env.PAPERLESS_URL = 'http://paperless:8000';
    process.env.PAPERLESS_API_TOKEN = 'test-token';
    app = await buildApp();
  }

  /**
   * Helper: Re-build the app with Paperless and External URL configured
   */
  async function rebuildAppWithPaperlessAndExternalUrl(): Promise<void> {
    await app.close();
    process.env.PAPERLESS_URL = 'http://paperless:8000';
    process.env.PAPERLESS_API_TOKEN = 'test-token';
    process.env.PAPERLESS_EXTERNAL_URL = 'https://external.example.com';
    app = await buildApp();
  }

  // ─── GET /api/paperless/status ─────────────────────────────────────────────

  describe('GET /api/paperless/status', () => {
    it('returns 401 when not authenticated', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/paperless/status' });

      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns configured=false when Paperless not configured', async () => {
      const { cookie } = await createUserWithSession();

      const response = await app.inject({
        method: 'GET',
        url: '/api/paperless/status',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<PaperlessStatusResponse>();
      expect(body.configured).toBe(false);
      expect(body.reachable).toBe(false);
      expect(body.error).toBeNull();
      expect(body.paperlessUrl).toBeNull();
    });

    it('returns configured=true, reachable=true when Paperless is reachable', async () => {
      await rebuildAppWithPaperless();
      const { cookie } = await createUserWithSession();

      mockFetch.mockResolvedValueOnce(mockJsonResponse({ count: 10 }));

      const response = await app.inject({
        method: 'GET',
        url: '/api/paperless/status',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<PaperlessStatusResponse>();
      expect(body.configured).toBe(true);
      expect(body.reachable).toBe(true);
      expect(body.error).toBeNull();
      expect(body.paperlessUrl).toBe('http://paperless:8000');
    });

    it('returns configured=true, reachable=false when Paperless is unreachable', async () => {
      await rebuildAppWithPaperless();
      const { cookie } = await createUserWithSession();

      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const response = await app.inject({
        method: 'GET',
        url: '/api/paperless/status',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<PaperlessStatusResponse>();
      expect(body.configured).toBe(true);
      expect(body.reachable).toBe(false);
      expect(body.error).toContain('ECONNREFUSED');
      expect(body.paperlessUrl).toBe('http://paperless:8000');
    });

    it('when PAPERLESS_EXTERNAL_URL is set and Paperless is reachable → paperlessUrl equals external URL', async () => {
      await rebuildAppWithPaperlessAndExternalUrl();
      const { cookie } = await createUserWithSession();

      mockFetch.mockResolvedValueOnce(mockJsonResponse({ count: 10 }));

      const response = await app.inject({
        method: 'GET',
        url: '/api/paperless/status',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<PaperlessStatusResponse>();
      expect(body.configured).toBe(true);
      expect(body.reachable).toBe(true);
      expect(body.paperlessUrl).toBe('https://external.example.com');
    });

    it('when PAPERLESS_EXTERNAL_URL is set and Paperless is unreachable → paperlessUrl still equals external URL', async () => {
      await rebuildAppWithPaperlessAndExternalUrl();
      const { cookie } = await createUserWithSession();

      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const response = await app.inject({
        method: 'GET',
        url: '/api/paperless/status',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<PaperlessStatusResponse>();
      expect(body.configured).toBe(true);
      expect(body.reachable).toBe(false);
      expect(body.paperlessUrl).toBe('https://external.example.com');
    });

    it('backward compatibility: no external URL → paperlessUrl shows internal URL', async () => {
      await rebuildAppWithPaperless();
      const { cookie } = await createUserWithSession();

      mockFetch.mockResolvedValueOnce(mockJsonResponse({ count: 10 }));

      const response = await app.inject({
        method: 'GET',
        url: '/api/paperless/status',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<PaperlessStatusResponse>();
      expect(body.paperlessUrl).toBe('http://paperless:8000');
    });

    describe('PAPERLESS_FILTER_TAG support', () => {
      it('returns filterTag=null when PAPERLESS_FILTER_TAG not set', async () => {
        await rebuildAppWithPaperless();
        const { cookie } = await createUserWithSession();

        mockFetch.mockResolvedValueOnce(mockJsonResponse({ count: 10 }));

        const response = await app.inject({
          method: 'GET',
          url: '/api/paperless/status',
          headers: { cookie },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json<PaperlessStatusResponse>();
        expect(body.filterTag).toBeNull();
      });

      it('returns filterTag with tag name when PAPERLESS_FILTER_TAG set and tag found', async () => {
        await app.close();
        process.env.PAPERLESS_URL = 'http://paperless:8000';
        process.env.PAPERLESS_API_TOKEN = 'test-token';
        process.env.PAPERLESS_FILTER_TAG = 'cornerstone';
        app = await buildApp();

        const { cookie } = await createUserWithSession();

        const CORNERSTONE_TAG = { id: 10, name: 'cornerstone', colour: 3, document_count: 50 };
        const TAGS_WITH_CORNERSTONE = { count: 2, results: [RAW_TAG, CORNERSTONE_TAG] };

        // Status probe
        mockFetch.mockResolvedValueOnce(mockJsonResponse({ count: 10 }));
        // Tags lookup
        mockFetch.mockResolvedValueOnce(mockJsonResponse(TAGS_WITH_CORNERSTONE));

        const response = await app.inject({
          method: 'GET',
          url: '/api/paperless/status',
          headers: { cookie },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json<PaperlessStatusResponse>();
        expect(body.filterTag).toBe('cornerstone');
      });

      it('returns filterTag=null when PAPERLESS_FILTER_TAG set but tag not found', async () => {
        await app.close();
        process.env.PAPERLESS_URL = 'http://paperless:8000';
        process.env.PAPERLESS_API_TOKEN = 'test-token';
        process.env.PAPERLESS_FILTER_TAG = 'missing-tag';
        app = await buildApp();

        const { cookie } = await createUserWithSession();

        // Status probe
        mockFetch.mockResolvedValueOnce(mockJsonResponse({ count: 10 }));
        // Tags lookup (returns no matching tag)
        mockFetch.mockResolvedValueOnce(mockJsonResponse({ count: 2, results: [RAW_TAG] }));

        const response = await app.inject({
          method: 'GET',
          url: '/api/paperless/status',
          headers: { cookie },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json<PaperlessStatusResponse>();
        expect(body.filterTag).toBeNull();
      });

      afterEach(async () => {
        delete process.env.PAPERLESS_FILTER_TAG;
      });
    });
  });

  // ─── GET /api/paperless/documents ─────────────────────────────────────────

  describe('GET /api/paperless/documents', () => {
    it('returns 401 when not authenticated', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/paperless/documents' });

      expect(response.statusCode).toBe(401);
    });

    it('returns 503 PAPERLESS_NOT_CONFIGURED when not configured', async () => {
      const { cookie } = await createUserWithSession();

      const response = await app.inject({
        method: 'GET',
        url: '/api/paperless/documents',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(503);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('PAPERLESS_NOT_CONFIGURED');
    });

    it('returns 200 with document list when configured', async () => {
      await rebuildAppWithPaperless();
      const { cookie } = await createUserWithSession();

      mockFetch.mockResolvedValueOnce(mockJsonResponse(RAW_LIST_RESPONSE));
      mockFetch.mockResolvedValueOnce(mockJsonResponse(RAW_TAGS_RESPONSE));
      // no correspondent or document type to resolve

      const response = await app.inject({
        method: 'GET',
        url: '/api/paperless/documents',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<PaperlessDocumentListResponse>();
      expect(body.documents).toHaveLength(1);
      expect(body.documents[0]!.id).toBe(42);
      expect(body.pagination.totalItems).toBe(1);
    });

    it('accepts and forwards query parameters', async () => {
      await rebuildAppWithPaperless();
      const { cookie } = await createUserWithSession();

      mockFetch.mockResolvedValueOnce(mockJsonResponse(RAW_LIST_RESPONSE));
      mockFetch.mockResolvedValueOnce(mockJsonResponse(RAW_TAGS_RESPONSE));

      const response = await app.inject({
        method: 'GET',
        url: '/api/paperless/documents?query=invoice&page=2&pageSize=10&sortBy=title&sortOrder=asc',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      // Verify that our mock was called (service forwarded the params)
      expect(mockFetch).toHaveBeenCalledTimes(2);
      const firstCallUrl = (mockFetch.mock.calls[0] as [string, ...unknown[]])[0];
      expect(firstCallUrl).toContain('query=invoice');
      expect(firstCallUrl).toContain('page=2');
      expect(firstCallUrl).toContain('page_size=10');
    });

    it('returns 400 on invalid sortBy value', async () => {
      await rebuildAppWithPaperless();
      const { cookie } = await createUserWithSession();

      const response = await app.inject({
        method: 'GET',
        url: '/api/paperless/documents?sortBy=invalid',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 on invalid tags format (non-numeric)', async () => {
      await rebuildAppWithPaperless();
      const { cookie } = await createUserWithSession();

      const response = await app.inject({
        method: 'GET',
        url: '/api/paperless/documents?tags=abc',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 on tags with SQL injection attempt', async () => {
      await rebuildAppWithPaperless();
      const { cookie } = await createUserWithSession();

      const response = await app.inject({
        method: 'GET',
        url: '/api/paperless/documents?tags=1%20OR%201%3D1',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(400);
    });

    it('accepts valid comma-separated integer tags', async () => {
      await rebuildAppWithPaperless();
      const { cookie } = await createUserWithSession();

      mockFetch.mockResolvedValueOnce(mockJsonResponse(RAW_LIST_RESPONSE));
      mockFetch.mockResolvedValueOnce(mockJsonResponse(RAW_TAGS_RESPONSE));

      const response = await app.inject({
        method: 'GET',
        url: '/api/paperless/documents?tags=5%2C12%2C20',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
    });

    it('returns 502 PAPERLESS_UNREACHABLE when fetch throws', async () => {
      await rebuildAppWithPaperless();
      const { cookie } = await createUserWithSession();

      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      const response = await app.inject({
        method: 'GET',
        url: '/api/paperless/documents',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(502);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('PAPERLESS_UNREACHABLE');
    });

    it('includes filter tag in upstream request when PAPERLESS_FILTER_TAG set', async () => {
      await app.close();
      process.env.PAPERLESS_URL = 'http://paperless:8000';
      process.env.PAPERLESS_API_TOKEN = 'test-token';
      process.env.PAPERLESS_FILTER_TAG = 'cornerstone';
      app = await buildApp();

      const { cookie } = await createUserWithSession();

      const CORNERSTONE_TAG = { id: 10, name: 'cornerstone', colour: 3, document_count: 50 };
      const TAGS_WITH_CORNERSTONE = { count: 2, results: [RAW_TAG, CORNERSTONE_TAG] };

      // 1. Filter tag resolution (resolveFilterTagId runs first)
      mockFetch.mockResolvedValueOnce(mockJsonResponse(TAGS_WITH_CORNERSTONE));
      // 2. Documents call
      mockFetch.mockResolvedValueOnce(mockJsonResponse(RAW_LIST_RESPONSE));
      // 3. Tags call (for mapping via fetchTagsMap)
      mockFetch.mockResolvedValueOnce(mockJsonResponse(TAGS_WITH_CORNERSTONE));
      // No correspondent or document type calls (RAW_DOCUMENT has null for both)

      const response = await app.inject({
        method: 'GET',
        url: '/api/paperless/documents',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      // Documents call is now at index 1 (after filter tag resolution at index 0)
      const docsCallUrl = (mockFetch.mock.calls[1] as [string, ...unknown[]])[0];
      expect(docsCallUrl).toContain('tags__id__all=10');

      delete process.env.PAPERLESS_FILTER_TAG;
    });
  });

  // ─── GET /api/paperless/documents/:id ─────────────────────────────────────

  describe('GET /api/paperless/documents/:id', () => {
    it('returns 401 when not authenticated', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/paperless/documents/42' });

      expect(response.statusCode).toBe(401);
    });

    it('returns 503 when not configured', async () => {
      const { cookie } = await createUserWithSession();

      const response = await app.inject({
        method: 'GET',
        url: '/api/paperless/documents/42',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(503);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('PAPERLESS_NOT_CONFIGURED');
    });

    it('returns 200 with document metadata when configured', async () => {
      await rebuildAppWithPaperless();
      const { cookie } = await createUserWithSession();

      mockFetch.mockResolvedValueOnce(mockJsonResponse(RAW_DOCUMENT));
      mockFetch.mockResolvedValueOnce(mockJsonResponse(RAW_TAGS_RESPONSE));
      // no correspondent or document type

      const response = await app.inject({
        method: 'GET',
        url: '/api/paperless/documents/42',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<PaperlessDocumentDetailResponse>();
      expect(body.document.id).toBe(42);
      expect(body.document.title).toBe('Test Document');
      expect(body.document.content).toBe('Full content.'); // detail includes content
    });

    it('returns 404 NOT_FOUND when document does not exist in Paperless', async () => {
      await rebuildAppWithPaperless();
      const { cookie } = await createUserWithSession();

      mockFetch.mockResolvedValueOnce(mockJsonResponse({ detail: 'Not found.' }, 404));

      const response = await app.inject({
        method: 'GET',
        url: '/api/paperless/documents/9999',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 400 for non-integer document ID', async () => {
      await rebuildAppWithPaperless();
      const { cookie } = await createUserWithSession();

      const response = await app.inject({
        method: 'GET',
        url: '/api/paperless/documents/not-an-id',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  // ─── GET /api/paperless/documents/:id/thumb ───────────────────────────────

  describe('GET /api/paperless/documents/:id/thumb', () => {
    it('returns 401 when not authenticated', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/paperless/documents/42/thumb',
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 503 when not configured', async () => {
      const { cookie } = await createUserWithSession();

      const response = await app.inject({
        method: 'GET',
        url: '/api/paperless/documents/42/thumb',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(503);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('PAPERLESS_NOT_CONFIGURED');
    });

    it('returns 200 with binary data and correct content-type', async () => {
      await rebuildAppWithPaperless();
      const { cookie } = await createUserWithSession();

      mockFetch.mockResolvedValueOnce(mockBinaryResponse('image/webp'));

      const response = await app.inject({
        method: 'GET',
        url: '/api/paperless/documents/42/thumb',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('image/webp');
    });

    it('returns 404 when document not found', async () => {
      await rebuildAppWithPaperless();
      const { cookie } = await createUserWithSession();

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: { get: () => null },
      } as unknown as Response);

      const response = await app.inject({
        method: 'GET',
        url: '/api/paperless/documents/9999/thumb',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('uses default content-type image/webp if upstream does not set it', async () => {
      await rebuildAppWithPaperless();
      const { cookie } = await createUserWithSession();

      const dataBuffer = Buffer.from('image');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: { get: () => null }, // no content-type header
        arrayBuffer: () =>
          Promise.resolve(
            dataBuffer.buffer.slice(
              dataBuffer.byteOffset,
              dataBuffer.byteOffset + dataBuffer.byteLength,
            ) as ArrayBuffer,
          ),
      } as unknown as Response);

      const response = await app.inject({
        method: 'GET',
        url: '/api/paperless/documents/42/thumb',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('image/webp');
    });

    it('replaces disallowed upstream content-type with application/octet-stream', async () => {
      await rebuildAppWithPaperless();
      const { cookie } = await createUserWithSession();

      // Upstream returns an unusual/unexpected content-type
      mockFetch.mockResolvedValueOnce(mockBinaryResponse('text/html'));

      const response = await app.inject({
        method: 'GET',
        url: '/api/paperless/documents/42/thumb',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('application/octet-stream');
    });
  });

  // ─── GET /api/paperless/documents/:id/preview ─────────────────────────────

  describe('GET /api/paperless/documents/:id/preview', () => {
    it('returns 401 when not authenticated', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/paperless/documents/42/preview',
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 503 when not configured', async () => {
      const { cookie } = await createUserWithSession();

      const response = await app.inject({
        method: 'GET',
        url: '/api/paperless/documents/42/preview',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(503);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('PAPERLESS_NOT_CONFIGURED');
    });

    it('returns 200 with binary PDF data and correct content-type', async () => {
      await rebuildAppWithPaperless();
      const { cookie } = await createUserWithSession();

      mockFetch.mockResolvedValueOnce(mockBinaryResponse('application/pdf'));

      const response = await app.inject({
        method: 'GET',
        url: '/api/paperless/documents/42/preview',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('application/pdf');
    });

    it('returns 404 when document not found', async () => {
      await rebuildAppWithPaperless();
      const { cookie } = await createUserWithSession();

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: { get: () => null },
      } as unknown as Response);

      const response = await app.inject({
        method: 'GET',
        url: '/api/paperless/documents/9999/preview',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('uses default content-type application/pdf if upstream does not set it', async () => {
      await rebuildAppWithPaperless();
      const { cookie } = await createUserWithSession();

      const dataBuffer = Buffer.from('%PDF-1.4');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: { get: () => null }, // no content-type header
        arrayBuffer: () =>
          Promise.resolve(
            dataBuffer.buffer.slice(
              dataBuffer.byteOffset,
              dataBuffer.byteOffset + dataBuffer.byteLength,
            ) as ArrayBuffer,
          ),
      } as unknown as Response);

      const response = await app.inject({
        method: 'GET',
        url: '/api/paperless/documents/42/preview',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('application/pdf');
    });

    it('replaces disallowed upstream content-type with application/octet-stream', async () => {
      await rebuildAppWithPaperless();
      const { cookie } = await createUserWithSession();

      // Upstream returns an unusual/unexpected content-type
      mockFetch.mockResolvedValueOnce(mockBinaryResponse('application/javascript'));

      const response = await app.inject({
        method: 'GET',
        url: '/api/paperless/documents/42/preview',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('application/octet-stream');
    });
  });

  // ─── GET /api/paperless/tags ───────────────────────────────────────────────

  describe('GET /api/paperless/tags', () => {
    it('returns 401 when not authenticated', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/paperless/tags' });

      expect(response.statusCode).toBe(401);
    });

    it('returns 503 PAPERLESS_NOT_CONFIGURED when not configured', async () => {
      const { cookie } = await createUserWithSession();

      const response = await app.inject({
        method: 'GET',
        url: '/api/paperless/tags',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(503);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('PAPERLESS_NOT_CONFIGURED');
    });

    it('returns 200 with tag list when configured', async () => {
      await rebuildAppWithPaperless();
      const { cookie } = await createUserWithSession();

      mockFetch.mockResolvedValueOnce(mockJsonResponse(RAW_TAGS_RESPONSE));

      const response = await app.inject({
        method: 'GET',
        url: '/api/paperless/tags',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<PaperlessTagListResponse>();
      expect(body.tags).toHaveLength(1);
      expect(body.tags[0]!.id).toBe(5);
      expect(body.tags[0]!.name).toBe('invoice');
      expect(body.tags[0]!.color).toBe('#e31a1c'); // colour=6
      expect(body.tags[0]!.documentCount).toBe(15);
    });

    it('returns 200 with empty array when no tags', async () => {
      await rebuildAppWithPaperless();
      const { cookie } = await createUserWithSession();

      mockFetch.mockResolvedValueOnce(mockJsonResponse({ count: 0, results: [] }));

      const response = await app.inject({
        method: 'GET',
        url: '/api/paperless/tags',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<PaperlessTagListResponse>();
      expect(body.tags).toEqual([]);
    });

    it('returns 502 PAPERLESS_UNREACHABLE when fetch throws', async () => {
      await rebuildAppWithPaperless();
      const { cookie } = await createUserWithSession();

      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      const response = await app.inject({
        method: 'GET',
        url: '/api/paperless/tags',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(502);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('PAPERLESS_UNREACHABLE');
    });

    it('returns 502 PAPERLESS_ERROR when Paperless returns non-ok', async () => {
      await rebuildAppWithPaperless();
      const { cookie } = await createUserWithSession();

      mockFetch.mockResolvedValueOnce(mockJsonResponse({ detail: 'Auth failed' }, 401));

      const response = await app.inject({
        method: 'GET',
        url: '/api/paperless/tags',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(502);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('PAPERLESS_ERROR');
    });
  });

  // ─── GET /api/paperless/correspondents (Story #1679) ─────────────────────────

  describe('GET /api/paperless/correspondents', () => {
    it('returns 401 when not authenticated', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/paperless/correspondents',
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 503 PAPERLESS_NOT_CONFIGURED when Paperless is not configured', async () => {
      const { cookie } = await createUserWithSession();

      const response = await app.inject({
        method: 'GET',
        url: '/api/paperless/correspondents',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(503);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('PAPERLESS_NOT_CONFIGURED');
    });

    it('returns 200 with sorted correspondents list when Paperless is configured', async () => {
      await rebuildAppWithPaperless();
      const { cookie } = await createUserWithSession();

      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({
          count: 2,
          results: [
            { id: 5, name: 'Smith GmbH' },
            { id: 2, name: 'Acme Corp' },
          ],
        }),
      );

      const response = await app.inject({
        method: 'GET',
        url: '/api/paperless/correspondents',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<{ correspondents: Array<{ id: number; name: string }> }>();
      expect(body.correspondents).toHaveLength(2);
      // Sorted by id ascending: 2 before 5
      expect(body.correspondents[0]).toEqual({ id: 2, name: 'Acme Corp' });
      expect(body.correspondents[1]).toEqual({ id: 5, name: 'Smith GmbH' });
    });

    it('returns 502 PAPERLESS_UNREACHABLE when fetch throws', async () => {
      await rebuildAppWithPaperless();
      const { cookie } = await createUserWithSession();

      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      const response = await app.inject({
        method: 'GET',
        url: '/api/paperless/correspondents',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(502);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('PAPERLESS_UNREACHABLE');
    });
  });

  // ─── POST /api/paperless/documents ─────────────────────────────────────────

  describe('POST /api/paperless/documents', () => {
    /**
     * Build a multipart/form-data body from parts (mirrors photos.test.ts's helper).
     */
    function buildMultipartBody(
      parts: Array<{
        name: string;
        value: string | Buffer;
        filename?: string;
        contentType?: string;
      }>,
    ): { body: Buffer; contentType: string } {
      const boundary = 'test-boundary-paperless-upload';
      const CRLF = '\r\n';
      const chunks: Buffer[] = [];

      for (const part of parts) {
        let header = `--${boundary}${CRLF}`;
        if (part.filename) {
          header += `Content-Disposition: form-data; name="${part.name}"; filename="${part.filename}"${CRLF}`;
          header += `Content-Type: ${part.contentType ?? 'application/octet-stream'}${CRLF}`;
        } else {
          header += `Content-Disposition: form-data; name="${part.name}"${CRLF}`;
        }
        header += CRLF;

        chunks.push(Buffer.from(header));
        chunks.push(typeof part.value === 'string' ? Buffer.from(part.value) : part.value);
        chunks.push(Buffer.from(CRLF));
      }

      chunks.push(Buffer.from(`--${boundary}--${CRLF}`));

      return {
        body: Buffer.concat(chunks),
        contentType: `multipart/form-data; boundary=${boundary}`,
      };
    }

    const PDF_PART = {
      name: 'document',
      value: Buffer.from('%PDF-1.4 fake pdf content'),
      filename: 'invoice.pdf',
      contentType: 'application/pdf',
    };

    it('scenario 40: returns 401 when not authenticated', async () => {
      const { body, contentType } = buildMultipartBody([
        PDF_PART,
        { name: 'title', value: 'Invoice' },
      ]);

      const response = await app.inject({
        method: 'POST',
        url: '/api/paperless/documents',
        headers: { 'content-type': contentType },
        payload: body,
      });

      expect(response.statusCode).toBe(401);
    });

    it('scenario 36: returns 503 PAPERLESS_NOT_CONFIGURED when not configured', async () => {
      const { cookie } = await createUserWithSession();
      const { body, contentType } = buildMultipartBody([
        PDF_PART,
        { name: 'title', value: 'Invoice' },
      ]);

      const response = await app.inject({
        method: 'POST',
        url: '/api/paperless/documents',
        headers: { cookie, 'content-type': contentType },
        payload: body,
      });

      expect(response.statusCode).toBe(503);
      const responseBody = response.json<ApiErrorResponse>();
      expect(responseBody.error.code).toBe('PAPERLESS_NOT_CONFIGURED');
    });

    it('scenario 35: valid PDF + title, configured → 201 with taskId', async () => {
      await rebuildAppWithPaperless();
      const { cookie } = await createUserWithSession();
      const { body, contentType } = buildMultipartBody([
        PDF_PART,
        { name: 'title', value: 'Invoice from Builder Co' },
      ]);

      mockFetch.mockResolvedValueOnce(mockJsonResponse('task-uuid-123'));

      const response = await app.inject({
        method: 'POST',
        url: '/api/paperless/documents',
        headers: { cookie, 'content-type': contentType },
        payload: body,
      });

      expect(response.statusCode).toBe(201);
      const responseBody = response.json<{ taskId: string }>();
      expect(responseBody.taskId).toBe('task-uuid-123');
    });

    // M3 (carried over from #1878 architect review): if Paperless-ngx's post_document
    // endpoint responds 2xx but with a malformed body (taskId not a string — e.g. a bare
    // number, an object, or null), paperlessService.uploadDocument's typeof guard must
    // convert this into a clean 502 PAPERLESS_ERROR, not crash the request or return a 201
    // with a bogus taskId.
    it.each([
      ['a bare number', 12345],
      ['an object', { id: 'task-uuid-123' }],
      ['null', null],
    ])(
      'M3: taskId response shaped as %s → 502 PAPERLESS_ERROR, not a crash or 201',
      async (_label, malformedTaskId) => {
        await rebuildAppWithPaperless();
        const { cookie } = await createUserWithSession();
        const { body, contentType } = buildMultipartBody([
          PDF_PART,
          { name: 'title', value: 'Invoice from Builder Co' },
        ]);

        mockFetch.mockResolvedValueOnce(mockJsonResponse(malformedTaskId));

        const response = await app.inject({
          method: 'POST',
          url: '/api/paperless/documents',
          headers: { cookie, 'content-type': contentType },
          payload: body,
        });

        expect(response.statusCode).toBe(502);
        const responseBody = response.json<ApiErrorResponse>();
        expect(responseBody.error.code).toBe('PAPERLESS_ERROR');
      },
    );

    it('scenario 37: non-PDF file → 400, upload never attempted', async () => {
      await rebuildAppWithPaperless();
      const { cookie } = await createUserWithSession();
      const { body, contentType } = buildMultipartBody([
        {
          name: 'document',
          value: Buffer.from('not a pdf'),
          filename: 'invoice.txt',
          contentType: 'text/plain',
        },
        { name: 'title', value: 'Invoice' },
      ]);

      const response = await app.inject({
        method: 'POST',
        url: '/api/paperless/documents',
        headers: { cookie, 'content-type': contentType },
        payload: body,
      });

      expect(response.statusCode).toBe(400);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('scenario 38: missing title field → 400', async () => {
      await rebuildAppWithPaperless();
      const { cookie } = await createUserWithSession();
      const { body, contentType } = buildMultipartBody([PDF_PART]);

      const response = await app.inject({
        method: 'POST',
        url: '/api/paperless/documents',
        headers: { cookie, 'content-type': contentType },
        payload: body,
      });

      expect(response.statusCode).toBe(400);
    });

    it('scenario 39: no file uploaded → 400', async () => {
      await rebuildAppWithPaperless();
      const { cookie } = await createUserWithSession();
      const { body, contentType } = buildMultipartBody([{ name: 'title', value: 'Invoice' }]);

      const response = await app.inject({
        method: 'POST',
        url: '/api/paperless/documents',
        headers: { cookie, 'content-type': contentType },
        payload: body,
      });

      expect(response.statusCode).toBe(400);
    });

    it('unresolvable filter tag configured → upload still succeeds untagged (201)', async () => {
      await rebuildAppWithPaperless();
      process.env.PAPERLESS_FILTER_TAG = 'nonexistent-tag';
      await app.close();
      app = await buildApp();
      const { cookie } = await createUserWithSession();
      const { body, contentType } = buildMultipartBody([
        PDF_PART,
        { name: 'title', value: 'Invoice' },
      ]);

      // 1. resolveFilterTagId's tag lookup returns no match
      mockFetch.mockResolvedValueOnce(mockJsonResponse({ count: 0, results: [] }));
      // 2. the upload itself proceeds untagged
      mockFetch.mockResolvedValueOnce(mockJsonResponse('task-untagged'));

      const response = await app.inject({
        method: 'POST',
        url: '/api/paperless/documents',
        headers: { cookie, 'content-type': contentType },
        payload: body,
      });

      expect(response.statusCode).toBe(201);
      const responseBody = response.json<{ taskId: string }>();
      expect(responseBody.taskId).toBe('task-untagged');

      delete process.env.PAPERLESS_FILTER_TAG;
    });

    // scenario 41 (oversized → 413) is covered by errorHandler.test.ts's existing
    // FST_REQ_FILE_TOO_LARGE → 413 mapping test (server/src/plugins/errorHandler.test.ts) —
    // that test already exercises the same global 50MB multipart cap (app.ts) this route
    // relies on; duplicating it here would test Fastify's multipart plugin, not this route.
  });
});
