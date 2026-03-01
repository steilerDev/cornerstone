/**
 * Unit tests for paperlessService.ts
 *
 * Tests cover:
 * - fetchPaperless helper (network error, 404, non-ok, success)
 * - fetchBinary helper (network error, 404, non-ok, success)
 * - getStatus (reachable, unreachable, error)
 * - listDocuments (basic, with search, with filters, pagination, sorting)
 * - getDocument (success, not found)
 * - listTags (success, empty)
 *
 * Strategy: global.fetch is replaced with a jest mock in beforeEach.
 * The service calls fetch at invocation time (not import time), so the mock
 * is correctly active for all service function calls.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as paperlessService from './paperlessService.js';
import type { AppError } from '../errors/AppError.js';

// ─── Mock global fetch ────────────────────────────────────────────────────────

const mockFetch = jest.fn<typeof fetch>();
let originalFetch: typeof fetch;

beforeEach(() => {
  originalFetch = global.fetch;
  global.fetch = mockFetch as unknown as typeof fetch;
  mockFetch.mockClear();
});

afterEach(() => {
  global.fetch = originalFetch;
});

// ─── Helpers for building mock responses ─────────────────────────────────────

function mockJsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : status === 404 ? 'Not Found' : 'Error',
    json: () => Promise.resolve(body),
    headers: {
      get: (_key: string) => null,
    },
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
  } as unknown as Response;
}

function mockBinaryResponse(data: Buffer, contentType = 'image/webp'): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: () => Promise.reject(new Error('Not JSON')),
    headers: {
      get: (key: string) => (key === 'content-type' ? contentType : null),
    },
    arrayBuffer: () =>
      Promise.resolve(
        data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer,
      ),
  } as unknown as Response;
}

// ─── Raw fixture data ─────────────────────────────────────────────────────────

const RAW_TAG_1 = { id: 5, name: 'invoice', colour: 6, document_count: 15 };
const RAW_TAG_2 = { id: 12, name: 'contract', colour: 2, document_count: 8 };

const RAW_TAGS_RESPONSE = { count: 2, results: [RAW_TAG_1, RAW_TAG_2] };

const RAW_DOCUMENT_1 = {
  id: 42,
  title: 'Invoice from Builder Co',
  content: 'Full text content here.',
  tags: [5, 12],
  created: '2026-01-15T00:00:00Z',
  added: '2026-01-16T08:30:00Z',
  modified: '2026-01-16T08:30:00Z',
  correspondent: 3,
  document_type: 7,
  archive_serial_number: 1042,
  original_file_name: 'invoice-2026-001.pdf',
  page_count: 2,
};

const RAW_LIST_RESPONSE = {
  count: 1,
  results: [RAW_DOCUMENT_1],
};

const BASE_URL = 'http://paperless:8000';
const TOKEN = 'test-api-token';

// ─── getStatus tests ──────────────────────────────────────────────────────────

describe('getStatus()', () => {
  it('returns reachable=true when probe request succeeds', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ count: 1 }));

    const result = await paperlessService.getStatus(BASE_URL, TOKEN);

    expect(result).toEqual({ configured: true, reachable: true, error: null });
    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE_URL}/api/documents/?page_size=1`,
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: `Token ${TOKEN}` }),
      }),
    );
  });

  it('returns reachable=false with error message when fetch throws (network error)', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const result = await paperlessService.getStatus(BASE_URL, TOKEN);

    expect(result.configured).toBe(true);
    expect(result.reachable).toBe(false);
    expect(result.error).toContain('ECONNREFUSED');
  });

  it('returns reachable=false with error message when Paperless returns non-ok', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ detail: 'Forbidden' }, 403));

    const result = await paperlessService.getStatus(BASE_URL, TOKEN);

    expect(result.configured).toBe(true);
    expect(result.reachable).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).not.toBeNull();
  });

  it('includes Accept header with API version 5', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ count: 0 }));

    await paperlessService.getStatus(BASE_URL, TOKEN);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ Accept: 'application/json; version=5' }),
      }),
    );
  });
});

// ─── listDocuments tests ──────────────────────────────────────────────────────

describe('listDocuments()', () => {
  /**
   * Helper: set up standard mocks for tags, correspondents, document types, then docs.
   */
  function setupListMocks(docResponse = RAW_LIST_RESPONSE) {
    // First call: documents list
    mockFetch.mockResolvedValueOnce(mockJsonResponse(docResponse));
    // Second call: tags
    mockFetch.mockResolvedValueOnce(mockJsonResponse(RAW_TAGS_RESPONSE));
    // Third call: correspondent 3
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ id: 3, name: 'Builder Co' }));
    // Fourth call: document_type 7
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ id: 7, name: 'Invoice' }));
  }

  it('returns correctly shaped response with resolved names', async () => {
    setupListMocks();

    const result = await paperlessService.listDocuments(BASE_URL, TOKEN, {});

    expect(result.documents).toHaveLength(1);
    const doc = result.documents[0];
    expect(doc.id).toBe(42);
    expect(doc.title).toBe('Invoice from Builder Co');
    expect(doc.content).toBeNull(); // list view omits content
    expect(doc.correspondent).toBe('Builder Co');
    expect(doc.documentType).toBe('Invoice');
    expect(doc.tags).toHaveLength(2);
    expect(doc.tags[0].name).toBe('invoice');
    expect(doc.tags[1].name).toBe('contract');
    expect(doc.searchHit).toBeNull(); // no search query
  });

  it('strips ISO datetime from created field to date-only (YYYY-MM-DD)', async () => {
    setupListMocks();

    const result = await paperlessService.listDocuments(BASE_URL, TOKEN, {});

    expect(result.documents[0].created).toBe('2026-01-15');
  });

  it('returns correct pagination metadata', async () => {
    setupListMocks({ count: 142, results: [RAW_DOCUMENT_1] });

    const result = await paperlessService.listDocuments(BASE_URL, TOKEN, { page: 2, pageSize: 25 });

    expect(result.pagination).toEqual({
      page: 2,
      pageSize: 25,
      totalItems: 142,
      totalPages: 6,
    });
  });

  it('uses default page=1 and pageSize=25', async () => {
    setupListMocks();

    await paperlessService.listDocuments(BASE_URL, TOKEN, {});

    const callUrl = (mockFetch.mock.calls[0] as [string, ...unknown[]])[0];
    expect(callUrl).toContain('page=1');
    expect(callUrl).toContain('page_size=25');
  });

  it('clamps pageSize to max 100', async () => {
    setupListMocks();

    await paperlessService.listDocuments(BASE_URL, TOKEN, { pageSize: 999 });

    const callUrl = (mockFetch.mock.calls[0] as [string, ...unknown[]])[0];
    expect(callUrl).toContain('page_size=100');
  });

  it('appends full-text search query param', async () => {
    setupListMocks();

    await paperlessService.listDocuments(BASE_URL, TOKEN, { query: 'invoice' });

    const callUrl = (mockFetch.mock.calls[0] as [string, ...unknown[]])[0];
    expect(callUrl).toContain('query=invoice');
  });

  it('appends tag filter as tags__id__in', async () => {
    setupListMocks();

    await paperlessService.listDocuments(BASE_URL, TOKEN, { tags: '5,12' });

    const callUrl = (mockFetch.mock.calls[0] as [string, ...unknown[]])[0];
    expect(callUrl).toContain('tags__id__in=5%2C12');
  });

  it('appends correspondent filter', async () => {
    setupListMocks();

    await paperlessService.listDocuments(BASE_URL, TOKEN, { correspondent: 3 });

    const callUrl = (mockFetch.mock.calls[0] as [string, ...unknown[]])[0];
    expect(callUrl).toContain('correspondent__id=3');
  });

  it('appends document type filter', async () => {
    setupListMocks();

    await paperlessService.listDocuments(BASE_URL, TOKEN, { documentType: 7 });

    const callUrl = (mockFetch.mock.calls[0] as [string, ...unknown[]])[0];
    expect(callUrl).toContain('document_type__id=7');
  });

  it('builds descending ordering by default (created)', async () => {
    setupListMocks();

    await paperlessService.listDocuments(BASE_URL, TOKEN, {});

    const callUrl = (mockFetch.mock.calls[0] as [string, ...unknown[]])[0];
    expect(callUrl).toContain('ordering=-created');
  });

  it('builds ascending ordering when sortOrder=asc', async () => {
    setupListMocks();

    await paperlessService.listDocuments(BASE_URL, TOKEN, { sortBy: 'title', sortOrder: 'asc' });

    const callUrl = (mockFetch.mock.calls[0] as [string, ...unknown[]])[0];
    expect(callUrl).toContain('ordering=title');
    expect(callUrl).not.toContain('ordering=-title');
  });

  it('builds descending ordering for archive_serial_number', async () => {
    setupListMocks();

    await paperlessService.listDocuments(BASE_URL, TOKEN, {
      sortBy: 'archive_serial_number',
      sortOrder: 'desc',
    });

    const callUrl = (mockFetch.mock.calls[0] as [string, ...unknown[]])[0];
    expect(callUrl).toContain('ordering=-archive_serial_number');
  });

  it('includes searchHit when document has __search_hit__', async () => {
    const rawWithSearchHit = {
      ...RAW_DOCUMENT_1,
      __search_hit__: { score: '0.95', highlights: 'This <em>invoice</em>...', rank: 1 },
    };
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ count: 1, results: [rawWithSearchHit] }));
    mockFetch.mockResolvedValueOnce(mockJsonResponse(RAW_TAGS_RESPONSE));
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ id: 3, name: 'Builder Co' }));
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ id: 7, name: 'Invoice' }));

    const result = await paperlessService.listDocuments(BASE_URL, TOKEN, { query: 'invoice' });

    expect(result.documents[0].searchHit).toEqual({
      score: 0.95,
      highlights: 'This <em>invoice</em>...',
      rank: 1,
    });
  });

  it('resolves each unique correspondent and document type only once (no N+1)', async () => {
    const doc2 = { ...RAW_DOCUMENT_1, id: 43, correspondent: 3, document_type: 7 };
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({ count: 2, results: [RAW_DOCUMENT_1, doc2] }),
    );
    mockFetch.mockResolvedValueOnce(mockJsonResponse(RAW_TAGS_RESPONSE));
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ id: 3, name: 'Builder Co' }));
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ id: 7, name: 'Invoice' }));

    const result = await paperlessService.listDocuments(BASE_URL, TOKEN, {});

    // Should only have 4 fetch calls (docs + tags + 1 correspondent + 1 doc type)
    expect(mockFetch).toHaveBeenCalledTimes(4);
    expect(result.documents).toHaveLength(2);
    expect(result.documents[0].correspondent).toBe('Builder Co');
    expect(result.documents[1].correspondent).toBe('Builder Co');
  });

  it('handles documents with no tags, correspondent, or document type', async () => {
    const minimalDoc = {
      id: 99,
      title: 'Minimal doc',
      content: 'Content',
      tags: [],
      created: null,
      added: null,
      modified: null,
      correspondent: null,
      document_type: null,
      archive_serial_number: null,
      original_file_name: null,
      page_count: null,
    };
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ count: 1, results: [minimalDoc] }));
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ count: 0, results: [] }));

    const result = await paperlessService.listDocuments(BASE_URL, TOKEN, {});

    const doc = result.documents[0];
    expect(doc.tags).toEqual([]);
    expect(doc.created).toBeNull();
    expect(doc.correspondent).toBeNull();
    expect(doc.documentType).toBeNull();
    expect(doc.archiveSerialNumber).toBeNull();
    expect(doc.originalFileName).toBeNull();
    expect(doc.pageCount).toBeNull();
    // Only 2 fetch calls (docs + tags — no correspondents or doc types to resolve)
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('maps tag colors using PAPERLESS_COLOR_MAP', async () => {
    setupListMocks();

    const result = await paperlessService.listDocuments(BASE_URL, TOKEN, {});

    const invoiceTag = result.documents[0].tags.find((t) => t.name === 'invoice');
    expect(invoiceTag?.color).toBe('#e31a1c'); // colour=6 maps to #e31a1c

    const contractTag = result.documents[0].tags.find((t) => t.name === 'contract');
    expect(contractTag?.color).toBe('#1f78b4'); // colour=2 maps to #1f78b4
  });

  it('returns null color for unknown colour IDs', async () => {
    const rawTagUnknownColor = { id: 20, name: 'misc', colour: 99, document_count: 3 };
    const docWithUnknownColorTag = { ...RAW_DOCUMENT_1, tags: [20] };
    mockFetch.mockResolvedValueOnce(
      mockJsonResponse({ count: 1, results: [docWithUnknownColorTag] }),
    );
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ count: 1, results: [rawTagUnknownColor] }));
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ id: 3, name: 'Builder Co' }));
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ id: 7, name: 'Invoice' }));

    const result = await paperlessService.listDocuments(BASE_URL, TOKEN, {});

    expect(result.documents[0].tags[0].color).toBeNull();
  });

  it('throws PAPERLESS_UNREACHABLE on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network failure'));

    await expect(paperlessService.listDocuments(BASE_URL, TOKEN, {})).rejects.toMatchObject({
      code: 'PAPERLESS_UNREACHABLE',
      statusCode: 502,
    });
  });

  it('throws PAPERLESS_ERROR on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ detail: 'Forbidden' }, 403));

    await expect(paperlessService.listDocuments(BASE_URL, TOKEN, {})).rejects.toMatchObject({
      code: 'PAPERLESS_ERROR',
      statusCode: 502,
    });
  });
});

// ─── getDocument tests ────────────────────────────────────────────────────────

describe('getDocument()', () => {
  function setupGetDocMocks() {
    mockFetch.mockResolvedValueOnce(mockJsonResponse(RAW_DOCUMENT_1));
    mockFetch.mockResolvedValueOnce(mockJsonResponse(RAW_TAGS_RESPONSE));
    // parallel: correspondent + document_type
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ id: 3, name: 'Builder Co' }));
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ id: 7, name: 'Invoice' }));
  }

  it('returns document with full content included', async () => {
    setupGetDocMocks();

    const doc = await paperlessService.getDocument(BASE_URL, TOKEN, 42);

    expect(doc.id).toBe(42);
    expect(doc.title).toBe('Invoice from Builder Co');
    expect(doc.content).toBe('Full text content here.'); // content included in detail
    expect(doc.correspondent).toBe('Builder Co');
    expect(doc.documentType).toBe('Invoice');
  });

  it('calls the correct Paperless-ngx document endpoint', async () => {
    setupGetDocMocks();

    await paperlessService.getDocument(BASE_URL, TOKEN, 42);

    expect(mockFetch.mock.calls[0][0]).toBe(`${BASE_URL}/api/documents/42/`);
  });

  it('throws NOT_FOUND (404) when Paperless returns 404', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ detail: 'Not found.' }, 404));

    await expect(paperlessService.getDocument(BASE_URL, TOKEN, 999)).rejects.toMatchObject({
      code: 'NOT_FOUND',
      statusCode: 404,
    });
  });

  it('throws PAPERLESS_UNREACHABLE on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

    await expect(paperlessService.getDocument(BASE_URL, TOKEN, 42)).rejects.toMatchObject({
      code: 'PAPERLESS_UNREACHABLE',
      statusCode: 502,
    });
  });

  it('throws PAPERLESS_ERROR on upstream error', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ detail: 'Server Error' }, 500));

    await expect(paperlessService.getDocument(BASE_URL, TOKEN, 42)).rejects.toMatchObject({
      code: 'PAPERLESS_ERROR',
      statusCode: 502,
    });
  });
});

// ─── fetchBinary tests ────────────────────────────────────────────────────────

describe('fetchBinary()', () => {
  it('returns raw Response on success', async () => {
    const imageData = Buffer.from('fake-image-data');
    mockFetch.mockResolvedValueOnce(mockBinaryResponse(imageData, 'image/webp'));

    const response = await paperlessService.fetchBinary(
      BASE_URL,
      TOKEN,
      '/api/documents/42/thumb/',
    );

    expect(response.ok).toBe(true);
    expect(response.headers.get('content-type')).toBe('image/webp');
  });

  it('uses Authorization header only (no Accept header for binary)', async () => {
    mockFetch.mockResolvedValueOnce(mockBinaryResponse(Buffer.from('data')));

    await paperlessService.fetchBinary(BASE_URL, TOKEN, '/api/documents/42/thumb/');

    const calledHeaders = (mockFetch.mock.calls[0] as [string, RequestInit])[1]?.headers as Record<
      string,
      string
    >;
    expect(calledHeaders['Authorization']).toBe(`Token ${TOKEN}`);
    expect(calledHeaders['Accept']).toBeUndefined();
  });

  it('throws NOT_FOUND when Paperless returns 404', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      headers: { get: () => null },
    } as unknown as Response);

    await expect(
      paperlessService.fetchBinary(BASE_URL, TOKEN, '/api/documents/999/thumb/'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 });
  });

  it('throws PAPERLESS_UNREACHABLE on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network failure'));

    await expect(
      paperlessService.fetchBinary(BASE_URL, TOKEN, '/api/documents/42/thumb/'),
    ).rejects.toMatchObject({ code: 'PAPERLESS_UNREACHABLE', statusCode: 502 });
  });

  it('throws PAPERLESS_ERROR on non-ok non-404 response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      headers: { get: () => null },
    } as unknown as Response);

    await expect(
      paperlessService.fetchBinary(BASE_URL, TOKEN, '/api/documents/42/preview/'),
    ).rejects.toMatchObject({ code: 'PAPERLESS_ERROR', statusCode: 502 });
  });
});

// ─── listTags tests ───────────────────────────────────────────────────────────

describe('listTags()', () => {
  it('returns tags sorted by ID ascending', async () => {
    const rawTags = {
      count: 3,
      results: [
        { id: 12, name: 'contract', colour: 2, document_count: 8 },
        { id: 5, name: 'invoice', colour: 6, document_count: 15 },
        { id: 20, name: 'misc', colour: 3, document_count: 2 },
      ],
    };
    mockFetch.mockResolvedValueOnce(mockJsonResponse(rawTags));

    const result = await paperlessService.listTags(BASE_URL, TOKEN);

    expect(result.tags).toHaveLength(3);
    expect(result.tags[0].id).toBe(5);
    expect(result.tags[1].id).toBe(12);
    expect(result.tags[2].id).toBe(20);
  });

  it('maps tag fields correctly', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ count: 1, results: [RAW_TAG_1] }));

    const result = await paperlessService.listTags(BASE_URL, TOKEN);

    expect(result.tags[0]).toEqual({
      id: 5,
      name: 'invoice',
      color: '#e31a1c', // colour=6
      documentCount: 15,
    });
  });

  it('returns empty array when no tags exist', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ count: 0, results: [] }));

    const result = await paperlessService.listTags(BASE_URL, TOKEN);

    expect(result.tags).toEqual([]);
  });

  it('uses page_size=1000 to get all tags without pagination', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ count: 0, results: [] }));

    await paperlessService.listTags(BASE_URL, TOKEN);

    const callUrl = (mockFetch.mock.calls[0] as [string, ...unknown[]])[0];
    expect(callUrl).toContain('page_size=1000');
  });

  it('throws PAPERLESS_UNREACHABLE on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    await expect(paperlessService.listTags(BASE_URL, TOKEN)).rejects.toMatchObject({
      code: 'PAPERLESS_UNREACHABLE',
      statusCode: 502,
    });
  });

  it('throws PAPERLESS_ERROR on upstream error', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ detail: 'Auth failed' }, 401));

    await expect(paperlessService.listTags(BASE_URL, TOKEN)).rejects.toMatchObject({
      code: 'PAPERLESS_ERROR',
      statusCode: 502,
    });
  });
});

// ─── AppError correctness ─────────────────────────────────────────────────────

describe('Error codes and status codes', () => {
  it('PAPERLESS_UNREACHABLE has statusCode 502', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network failure'));

    try {
      await paperlessService.getDocument(BASE_URL, TOKEN, 1);
      expect.assertions(2);
    } catch (err) {
      expect((err as AppError).statusCode).toBe(502);
      expect((err as AppError).code).toBe('PAPERLESS_UNREACHABLE');
    }
  });

  it('PAPERLESS_ERROR has statusCode 502', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ detail: 'Forbidden' }, 403));

    try {
      await paperlessService.getDocument(BASE_URL, TOKEN, 1);
      expect.assertions(2);
    } catch (err) {
      expect((err as AppError).statusCode).toBe(502);
      expect((err as AppError).code).toBe('PAPERLESS_ERROR');
    }
  });

  it('NOT_FOUND has statusCode 404', async () => {
    mockFetch.mockResolvedValueOnce(mockJsonResponse({ detail: 'Not found.' }, 404));

    try {
      await paperlessService.getDocument(BASE_URL, TOKEN, 999);
      expect.assertions(2);
    } catch (err) {
      expect((err as AppError).statusCode).toBe(404);
      expect((err as AppError).code).toBe('NOT_FOUND');
    }
  });
});
