/**
 * Integration tests for document link routes.
 *
 * Tests cover:
 * - POST /api/document-links (create link, 401, 404, 409, 400 validation)
 * - GET /api/document-links?entityType=...&entityId=... (list links, 401, 400)
 * - DELETE /api/document-links/:id (delete link, 401, 404)
 * - Metadata enrichment when Paperless is configured/not configured
 *
 * Uses Fastify app.inject() for in-process HTTP testing.
 * Paperless-ngx calls are mocked via global.fetch.
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
  DocumentLinkResponse,
  DocumentLinkListResponse,
} from '@cornerstone/shared';

// ─── Mock global fetch ────────────────────────────────────────────────────────

const mockFetch = jest.fn<typeof fetch>();
let originalFetch: typeof fetch;

// ─── Paperless-ngx raw fixture ────────────────────────────────────────────────

const RAW_TAG = { id: 5, name: 'invoice', colour: 6, document_count: 15 };
const RAW_TAGS_RESPONSE = { count: 1, results: [RAW_TAG] };

const RAW_DOCUMENT = {
  id: 42,
  title: 'Invoice from Builder Co',
  content: 'Full text content here.',
  tags: [5],
  created: '2026-01-15T00:00:00Z',
  added: '2026-01-16T08:30:00Z',
  modified: '2026-01-16T08:30:00Z',
  correspondent: null,
  document_type: null,
  archive_serial_number: 1042,
  original_file_name: 'invoice-2026-001.pdf',
  page_count: 2,
};

// ─── Mock response helpers ────────────────────────────────────────────────────

function mockJsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : status === 404 ? 'Not Found' : 'Error',
    json: () => Promise.resolve(body),
    headers: { get: (_key: string) => null },
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
  } as unknown as Response;
}

// ─── Test setup ───────────────────────────────────────────────────────────────

describe('Document Links Routes', () => {
  let app: FastifyInstance;
  let tempDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    originalFetch = global.fetch;
    global.fetch = mockFetch as unknown as typeof fetch;
    mockFetch.mockClear();

    originalEnv = { ...process.env };

    tempDir = mkdtempSync(join(tmpdir(), 'cornerstone-doclinks-test-'));
    process.env.DATABASE_URL = join(tempDir, 'test.db');
    process.env.SECURE_COOKIES = 'false';
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

  // ─── Helpers ───────────────────────────────────────────────────────────────

  async function createUserWithSession(
    email = 'user@example.com',
    role: 'admin' | 'member' = 'member',
  ): Promise<{ cookie: string; userId: string }> {
    const user = await userService.createLocalUser(app.db, email, 'Test User', 'password', role);
    const token = sessionService.createSession(app.db, user.id, 3600);
    return { cookie: `cornerstone_session=${token}`, userId: user.id };
  }

  async function rebuildAppWithPaperless(): Promise<void> {
    await app.close();
    process.env.PAPERLESS_URL = 'http://paperless:8000';
    process.env.PAPERLESS_API_TOKEN = 'test-token';
    app = await buildApp();
  }

  /**
   * Create a work item directly via the API and return its ID.
   */
  async function createWorkItem(cookie: string, title = 'Test Work Item'): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: '/api/work-items',
      headers: { cookie, 'content-type': 'application/json' },
      payload: JSON.stringify({ title }),
    });
    expect(response.statusCode).toBe(201);
    return response.json<{ id: string }>().id;
  }

  /**
   * Create a vendor + invoice and return the invoice ID.
   */
  async function createVendorAndInvoice(cookie: string): Promise<string> {
    const vendorResponse = await app.inject({
      method: 'POST',
      url: '/api/vendors',
      headers: { cookie, 'content-type': 'application/json' },
      payload: JSON.stringify({ name: 'Test Vendor' }),
    });
    expect(vendorResponse.statusCode).toBe(201);
    const vendorId = vendorResponse.json<{ vendor: { id: string } }>().vendor.id;

    const invoiceResponse = await app.inject({
      method: 'POST',
      url: `/api/vendors/${vendorId}/invoices`,
      headers: { cookie, 'content-type': 'application/json' },
      payload: JSON.stringify({ amount: 100, date: '2026-01-15' }),
    });
    expect(invoiceResponse.statusCode).toBe(201);
    return invoiceResponse.json<{ invoice: { id: string } }>().invoice.id;
  }

  // ─── POST /api/document-links ──────────────────────────────────────────────

  describe('POST /api/document-links', () => {
    it('returns 401 when not authenticated', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/document-links',
        headers: { 'content-type': 'application/json' },
        payload: JSON.stringify({ entityType: 'work_item', entityId: 'x', paperlessDocumentId: 1 }),
      });

      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('creates a link for a work item and returns 201 with DocumentLink shape', async () => {
      const { cookie } = await createUserWithSession();
      const workItemId = await createWorkItem(cookie);

      const response = await app.inject({
        method: 'POST',
        url: '/api/document-links',
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({
          entityType: 'work_item',
          entityId: workItemId,
          paperlessDocumentId: 42,
        }),
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<DocumentLinkResponse>();
      expect(body.documentLink).toBeDefined();
      expect(body.documentLink.entityType).toBe('work_item');
      expect(body.documentLink.entityId).toBe(workItemId);
      expect(body.documentLink.paperlessDocumentId).toBe(42);
      expect(body.documentLink.createdBy).not.toBeNull();
      expect(body.documentLink.createdAt).toBeTruthy();
      expect(body.documentLink.id).toBeTruthy();
    });

    it('creates a link for an invoice and returns 201', async () => {
      const { cookie } = await createUserWithSession();
      const invoiceId = await createVendorAndInvoice(cookie);

      const response = await app.inject({
        method: 'POST',
        url: '/api/document-links',
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({
          entityType: 'invoice',
          entityId: invoiceId,
          paperlessDocumentId: 99,
        }),
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<DocumentLinkResponse>();
      expect(body.documentLink.entityType).toBe('invoice');
      expect(body.documentLink.entityId).toBe(invoiceId);
      expect(body.documentLink.paperlessDocumentId).toBe(99);
    });

    it('returns 404 NOT_FOUND when work item does not exist', async () => {
      const { cookie } = await createUserWithSession();

      const response = await app.inject({
        method: 'POST',
        url: '/api/document-links',
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({
          entityType: 'work_item',
          entityId: 'non-existent-id',
          paperlessDocumentId: 42,
        }),
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 404 NOT_FOUND when invoice does not exist', async () => {
      const { cookie } = await createUserWithSession();

      const response = await app.inject({
        method: 'POST',
        url: '/api/document-links',
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({
          entityType: 'invoice',
          entityId: 'non-existent-id',
          paperlessDocumentId: 42,
        }),
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('returns 409 DUPLICATE_DOCUMENT_LINK when same link is created twice', async () => {
      const { cookie } = await createUserWithSession();
      const workItemId = await createWorkItem(cookie);

      const payload = JSON.stringify({
        entityType: 'work_item',
        entityId: workItemId,
        paperlessDocumentId: 42,
      });

      const first = await app.inject({
        method: 'POST',
        url: '/api/document-links',
        headers: { cookie, 'content-type': 'application/json' },
        payload,
      });
      expect(first.statusCode).toBe(201);

      const second = await app.inject({
        method: 'POST',
        url: '/api/document-links',
        headers: { cookie, 'content-type': 'application/json' },
        payload,
      });

      expect(second.statusCode).toBe(409);
      const body = second.json<ApiErrorResponse>();
      expect(body.error.code).toBe('DUPLICATE_DOCUMENT_LINK');
    });

    it('returns 400 VALIDATION_ERROR for household_item (not yet implemented)', async () => {
      const { cookie } = await createUserWithSession();

      const response = await app.inject({
        method: 'POST',
        url: '/api/document-links',
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({
          entityType: 'household_item',
          entityId: 'any-id',
          paperlessDocumentId: 42,
        }),
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when entityType is invalid', async () => {
      const { cookie } = await createUserWithSession();

      const response = await app.inject({
        method: 'POST',
        url: '/api/document-links',
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({
          entityType: 'invalid_type',
          entityId: 'some-id',
          paperlessDocumentId: 42,
        }),
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 when paperlessDocumentId is 0 (not positive)', async () => {
      const { cookie } = await createUserWithSession();

      const response = await app.inject({
        method: 'POST',
        url: '/api/document-links',
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({
          entityType: 'work_item',
          entityId: 'some-id',
          paperlessDocumentId: 0,
        }),
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 when paperlessDocumentId is missing', async () => {
      const { cookie } = await createUserWithSession();

      const response = await app.inject({
        method: 'POST',
        url: '/api/document-links',
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({ entityType: 'work_item', entityId: 'some-id' }),
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 when entityId is empty string', async () => {
      const { cookie } = await createUserWithSession();

      const response = await app.inject({
        method: 'POST',
        url: '/api/document-links',
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({ entityType: 'work_item', entityId: '', paperlessDocumentId: 1 }),
      });

      expect(response.statusCode).toBe(400);
    });
  });

  // ─── GET /api/document-links ───────────────────────────────────────────────

  describe('GET /api/document-links', () => {
    it('returns 401 when not authenticated', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/document-links?entityType=work_item&entityId=x',
      });

      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 400 when entityType query param is missing', async () => {
      const { cookie } = await createUserWithSession();

      const response = await app.inject({
        method: 'GET',
        url: '/api/document-links?entityId=some-id',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 400 when entityId query param is missing', async () => {
      const { cookie } = await createUserWithSession();

      const response = await app.inject({
        method: 'GET',
        url: '/api/document-links?entityType=work_item',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 200 with empty documentLinks array when no links exist', async () => {
      const { cookie } = await createUserWithSession();
      const workItemId = await createWorkItem(cookie);

      const response = await app.inject({
        method: 'GET',
        url: `/api/document-links?entityType=work_item&entityId=${workItemId}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<DocumentLinkListResponse>();
      expect(body.documentLinks).toEqual([]);
    });

    it('returns links with document: null when Paperless is not configured', async () => {
      const { cookie } = await createUserWithSession();
      const workItemId = await createWorkItem(cookie);

      // Create a link first
      await app.inject({
        method: 'POST',
        url: '/api/document-links',
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({
          entityType: 'work_item',
          entityId: workItemId,
          paperlessDocumentId: 42,
        }),
      });

      const response = await app.inject({
        method: 'GET',
        url: `/api/document-links?entityType=work_item&entityId=${workItemId}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<DocumentLinkListResponse>();
      expect(body.documentLinks).toHaveLength(1);
      expect(body.documentLinks[0].entityType).toBe('work_item');
      expect(body.documentLinks[0].entityId).toBe(workItemId);
      expect(body.documentLinks[0].paperlessDocumentId).toBe(42);
      expect(body.documentLinks[0].document).toBeNull();
    });

    it('returns enriched links with Paperless metadata when configured', async () => {
      await rebuildAppWithPaperless();
      const { cookie } = await createUserWithSession();
      const workItemId = await createWorkItem(cookie);

      await app.inject({
        method: 'POST',
        url: '/api/document-links',
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({
          entityType: 'work_item',
          entityId: workItemId,
          paperlessDocumentId: 42,
        }),
      });

      // Mock Paperless calls: document fetch first, then tags (paperlessService.getDocument order)
      mockFetch
        .mockResolvedValueOnce(mockJsonResponse(RAW_DOCUMENT))
        .mockResolvedValueOnce(mockJsonResponse(RAW_TAGS_RESPONSE));

      const response = await app.inject({
        method: 'GET',
        url: `/api/document-links?entityType=work_item&entityId=${workItemId}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<DocumentLinkListResponse>();
      expect(body.documentLinks).toHaveLength(1);
      expect(body.documentLinks[0].document).not.toBeNull();
      expect(body.documentLinks[0].document?.id).toBe(42);
      expect(body.documentLinks[0].document?.title).toBe('Invoice from Builder Co');
      // content must be null in list response
      expect(body.documentLinks[0].document?.content).toBeNull();
      expect(body.documentLinks[0].document?.tags).toHaveLength(1);
    });

    it('returns document: null for deleted Paperless document (404)', async () => {
      await rebuildAppWithPaperless();
      const { cookie } = await createUserWithSession();
      const workItemId = await createWorkItem(cookie);

      await app.inject({
        method: 'POST',
        url: '/api/document-links',
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({
          entityType: 'work_item',
          entityId: workItemId,
          paperlessDocumentId: 42,
        }),
      });

      // Document not found in Paperless — 404 is thrown before tags are fetched
      mockFetch.mockResolvedValueOnce(mockJsonResponse({ detail: 'Not found' }, 404));

      const response = await app.inject({
        method: 'GET',
        url: `/api/document-links?entityType=work_item&entityId=${workItemId}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<DocumentLinkListResponse>();
      expect(body.documentLinks[0].document).toBeNull();
    });

    it('returns links for invoice entity type', async () => {
      const { cookie } = await createUserWithSession();
      const invoiceId = await createVendorAndInvoice(cookie);

      await app.inject({
        method: 'POST',
        url: '/api/document-links',
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({
          entityType: 'invoice',
          entityId: invoiceId,
          paperlessDocumentId: 55,
        }),
      });

      const response = await app.inject({
        method: 'GET',
        url: `/api/document-links?entityType=invoice&entityId=${invoiceId}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json<DocumentLinkListResponse>();
      expect(body.documentLinks).toHaveLength(1);
      expect(body.documentLinks[0].entityType).toBe('invoice');
    });
  });

  // ─── DELETE /api/document-links/:id ───────────────────────────────────────

  describe('DELETE /api/document-links/:id', () => {
    it('returns 401 when not authenticated', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/document-links/some-id',
      });

      expect(response.statusCode).toBe(401);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('returns 204 and deletes the link successfully', async () => {
      const { cookie } = await createUserWithSession();
      const workItemId = await createWorkItem(cookie);

      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/document-links',
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({
          entityType: 'work_item',
          entityId: workItemId,
          paperlessDocumentId: 42,
        }),
      });
      const linkId = createResponse.json<DocumentLinkResponse>().documentLink.id;

      const deleteResponse = await app.inject({
        method: 'DELETE',
        url: `/api/document-links/${linkId}`,
        headers: { cookie },
      });

      expect(deleteResponse.statusCode).toBe(204);
    });

    it('returns 404 NOT_FOUND when link does not exist', async () => {
      const { cookie } = await createUserWithSession();

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/document-links/non-existent-id',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json<ApiErrorResponse>();
      expect(body.error.code).toBe('NOT_FOUND');
    });

    it('verifies link is gone after deletion (cannot re-delete)', async () => {
      const { cookie } = await createUserWithSession();
      const workItemId = await createWorkItem(cookie);

      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/document-links',
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({
          entityType: 'work_item',
          entityId: workItemId,
          paperlessDocumentId: 42,
        }),
      });
      const linkId = createResponse.json<DocumentLinkResponse>().documentLink.id;

      // Delete once
      await app.inject({
        method: 'DELETE',
        url: `/api/document-links/${linkId}`,
        headers: { cookie },
      });

      // Delete again — should 404
      const second = await app.inject({
        method: 'DELETE',
        url: `/api/document-links/${linkId}`,
        headers: { cookie },
      });

      expect(second.statusCode).toBe(404);
    });

    it('does not affect other links when deleting one', async () => {
      const { cookie } = await createUserWithSession();
      const workItemId = await createWorkItem(cookie);

      const create1 = await app.inject({
        method: 'POST',
        url: '/api/document-links',
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({
          entityType: 'work_item',
          entityId: workItemId,
          paperlessDocumentId: 42,
        }),
      });
      await app.inject({
        method: 'POST',
        url: '/api/document-links',
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({
          entityType: 'work_item',
          entityId: workItemId,
          paperlessDocumentId: 99,
        }),
      });

      const linkId1 = create1.json<DocumentLinkResponse>().documentLink.id;

      await app.inject({
        method: 'DELETE',
        url: `/api/document-links/${linkId1}`,
        headers: { cookie },
      });

      const listResponse = await app.inject({
        method: 'GET',
        url: `/api/document-links?entityType=work_item&entityId=${workItemId}`,
        headers: { cookie },
      });

      const body = listResponse.json<DocumentLinkListResponse>();
      expect(body.documentLinks).toHaveLength(1);
      expect(body.documentLinks[0].paperlessDocumentId).toBe(99);
    });
  });

  // ─── Cascade delete integration ────────────────────────────────────────────

  describe('Cascade delete on work item deletion', () => {
    it('document links are deleted when the linked work item is deleted', async () => {
      const { cookie } = await createUserWithSession('admin@example.com', 'admin');
      const workItemId = await createWorkItem(cookie);

      // Create a document link
      await app.inject({
        method: 'POST',
        url: '/api/document-links',
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({
          entityType: 'work_item',
          entityId: workItemId,
          paperlessDocumentId: 42,
        }),
      });

      // Delete the work item
      const deleteWI = await app.inject({
        method: 'DELETE',
        url: `/api/work-items/${workItemId}`,
        headers: { cookie },
      });
      expect(deleteWI.statusCode).toBe(204);

      // Create a new work item so the GET query is valid (entity check is not done on GET)
      const newWorkItemId = await createWorkItem(cookie, 'New Item');

      // Verify the original work item's links are gone (we check by re-linking to the deleted ID
      // would fail since the work item is gone — but we can also create a new link and see list is clean)
      // Instead, check with a direct DB query via the list endpoint on the deleted entity
      // (GET returns empty — no entity check on GET, just DB query)
      const listResponse = await app.inject({
        method: 'GET',
        url: `/api/document-links?entityType=work_item&entityId=${workItemId}`,
        headers: { cookie },
      });

      expect(listResponse.statusCode).toBe(200);
      const body = listResponse.json<DocumentLinkListResponse>();
      expect(body.documentLinks).toHaveLength(0);

      // Avoid unused variable lint warning
      expect(newWorkItemId).toBeTruthy();
    });
  });
});
