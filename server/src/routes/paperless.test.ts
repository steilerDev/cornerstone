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
      expect(body.documents[0].id).toBe(42);
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
      expect(body.tags[0].id).toBe(5);
      expect(body.tags[0].name).toBe('invoice');
      expect(body.tags[0].color).toBe('#e31a1c'); // colour=6
      expect(body.tags[0].documentCount).toBe(15);
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
});
