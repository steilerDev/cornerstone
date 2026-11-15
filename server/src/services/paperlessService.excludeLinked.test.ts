/**
 * Unit tests for the exact "hide linked" document listing (#2252, ADR-015 §7) and the document
 * type list in paperlessService.ts.
 *
 * Strategy: global.fetch is replaced by a small fake Paperless-ngx that honours the list params
 * the service sends (`query`, `tags__id__all`, `id__in`, `page`, `page_size`) and returns the
 * `all` id array like the real list endpoint, so the tests assert both the results and the
 * upstream requests the service makes.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as paperlessService from './paperlessService.js';
import type { AppError } from '../errors/AppError.js';

const BASE_URL = 'http://paperless:8000';
const TOKEN = 'test-api-token';
const FILTER_TAG_ID = 9;

interface FakeDoc {
  id: number;
  title: string;
  tags: number[];
}

type AllMode = 'ok' | 'missing' | 'wrong-length';

interface FakeOptions {
  /** Documents in list order. */
  docs: FakeDoc[];
  all?: AllMode;
}

let originalFetch: typeof fetch;
const mockFetch = jest.fn<typeof fetch>();
let requested: string[] = [];

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(body),
    headers: { get: (_key: string) => null },
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
  } as unknown as Response;
}

function rawDoc(doc: FakeDoc, query: string | null) {
  return {
    id: doc.id,
    title: doc.title,
    content: 'truncated',
    tags: doc.tags,
    created: '2026-01-15',
    added: '2026-01-16T08:30:00Z',
    modified: '2026-01-16T08:30:00Z',
    correspondent: null,
    document_type: null,
    archive_serial_number: null,
    original_file_name: `${doc.id}.pdf`,
    page_count: 1,
    ...(query ? { __search_hit__: { score: 1, highlights: `hit ${doc.id}`, rank: doc.id } } : {}),
  };
}

function installFakePaperless({ docs, all = 'ok' }: FakeOptions) {
  mockFetch.mockImplementation(async (input) => {
    const url = String(input);
    requested.push(url);
    const parsed = new URL(url);
    if (parsed.pathname === '/api/tags/') {
      return jsonResponse({
        count: 2,
        results: [
          { id: FILTER_TAG_ID, name: 'house', color: '#112233', document_count: docs.length },
          { id: 3, name: 'roof', color: '#445566', document_count: 0 },
        ],
      });
    }
    if (parsed.pathname === '/api/documents/') {
      const q = parsed.searchParams;
      const query = q.get('query');
      let matching = docs;
      const tagsAll = q.get('tags__id__all');
      if (tagsAll) {
        const wanted = tagsAll.split(',').map(Number);
        matching = matching.filter((d) => wanted.every((t) => d.tags.includes(t)));
      }
      if (query) matching = matching.filter((d) => d.title.includes(query));
      const idIn = q.get('id__in');
      if (idIn) {
        const wanted = new Set(idIn.split(',').map(Number));
        matching = matching.filter((d) => wanted.has(d.id));
      }
      const page = Number(q.get('page') ?? '1');
      const pageSize = Number(q.get('page_size') ?? '25');
      const ids = matching.map((d) => d.id);
      // Full-text results carry `all` as an unordered set: reverse it to prove it is not used for order.
      const allIds = query ? [...ids].reverse() : ids;
      const body: Record<string, unknown> = {
        count: matching.length,
        results: matching
          .slice((page - 1) * pageSize, page * pageSize)
          .map((d) => rawDoc(d, query)),
      };
      if (all === 'ok') body.all = allIds;
      if (all === 'wrong-length') body.all = allIds.slice(0, -1);
      return jsonResponse(body);
    }
    return jsonResponse({}, 404);
  });
}

function corpus(count: number, tags: number[] = [3]): FakeDoc[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    title: `Roof document ${i + 1}`,
    tags,
  }));
}

function documentRequests(): URL[] {
  return requested.map((u) => new URL(u)).filter((u) => u.pathname === '/api/documents/');
}

beforeEach(() => {
  originalFetch = global.fetch;
  global.fetch = mockFetch as unknown as typeof fetch;
  mockFetch.mockReset();
  requested = [];
  paperlessService._resetFilterTagCache();
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe('listDocuments() with excludeIds (hide linked)', () => {
  const LINKED = [2, 5, 120];

  describe('fast path (no full-text query, `all` usable)', () => {
    it('returns a full first page of unlinked documents with an exact total', async () => {
      installFakePaperless({ docs: corpus(250) });

      const result = await paperlessService.listDocuments(
        BASE_URL,
        TOKEN,
        { page: 1, pageSize: 100 },
        null,
        LINKED,
      );

      expect(result.documents).toHaveLength(100);
      expect(result.documents.slice(0, 5).map((d) => d.id)).toEqual([1, 3, 4, 6, 7]);
      expect(result.documents.some((d) => LINKED.includes(d.id))).toBe(false);
      expect(result.pagination).toEqual({
        page: 1,
        pageSize: 100,
        totalItems: 247,
        totalPages: 3,
      });
    });

    it('returns the remaining documents on the last page (page 3 holds 47)', async () => {
      installFakePaperless({ docs: corpus(250) });

      const result = await paperlessService.listDocuments(
        BASE_URL,
        TOKEN,
        { page: 3, pageSize: 100 },
        null,
        LINKED,
      );

      expect(result.documents).toHaveLength(47);
      expect(result.documents[0]!.id).toBe(204);
      expect(result.documents.at(-1)!.id).toBe(250);
      expect(result.pagination.totalItems).toBe(247);
      expect(result.pagination.totalPages).toBe(3);
    });

    it('fetches exactly the page ids with one id__in request and no over-fetch window', async () => {
      installFakePaperless({ docs: corpus(250) });

      await paperlessService.listDocuments(
        BASE_URL,
        TOKEN,
        { page: 2, pageSize: 10 },
        null,
        LINKED,
      );

      const docRequests = documentRequests();
      // probe + page fetch, nothing else
      expect(docRequests).toHaveLength(2);
      expect(docRequests[0]!.searchParams.get('page')).toBe('1');
      expect(docRequests[0]!.searchParams.get('page_size')).toBe('1');
      const pageFetch = docRequests[1]!;
      // page 1 holds the first 10 unlinked ids (1,3,4,6..12), page 2 the next 10
      expect(pageFetch.searchParams.get('id__in')).toBe('13,14,15,16,17,18,19,20,21,22');
      expect(pageFetch.searchParams.get('page_size')).toBe('10');
    });

    it('keeps the list order of `all` for the returned documents', async () => {
      const shuffled = [7, 3, 9, 1, 8, 2, 6, 4, 10, 5].map((id) => ({
        id,
        title: `Roof document ${id}`,
        tags: [3],
      }));
      installFakePaperless({ docs: shuffled });

      const result = await paperlessService.listDocuments(
        BASE_URL,
        TOKEN,
        { page: 1, pageSize: 3 },
        null,
        [3],
      );

      expect(result.documents.map((d) => d.id)).toEqual([7, 9, 1]);
      expect(result.pagination.totalItems).toBe(9);
    });

    it('does not count linked ids that are not in the filtered result', async () => {
      installFakePaperless({ docs: corpus(20) });

      const result = await paperlessService.listDocuments(
        BASE_URL,
        TOKEN,
        { page: 1, pageSize: 100 },
        null,
        [4, 9999, 8888],
      );

      expect(result.pagination.totalItems).toBe(19);
      expect(result.documents).toHaveLength(19);
    });

    it('returns no documents and totalItems 0 when everything is linked, without a page fetch', async () => {
      installFakePaperless({ docs: corpus(3) });

      const result = await paperlessService.listDocuments(
        BASE_URL,
        TOKEN,
        { page: 1, pageSize: 25 },
        null,
        [1, 2, 3],
      );

      expect(result.documents).toEqual([]);
      expect(result.pagination).toEqual({ page: 1, pageSize: 25, totalItems: 0, totalPages: 0 });
      expect(requested).toHaveLength(1);
    });

    it('returns an empty page without any page fetch when the offset is beyond the total', async () => {
      installFakePaperless({ docs: corpus(250) });

      const result = await paperlessService.listDocuments(
        BASE_URL,
        TOKEN,
        { page: 5, pageSize: 100 },
        null,
        LINKED,
      );

      expect(result.documents).toEqual([]);
      expect(result.pagination).toEqual({
        page: 5,
        pageSize: 100,
        totalItems: 247,
        totalPages: 3,
      });
      expect(requested).toHaveLength(1);
      expect(documentRequests()[0]!.searchParams.get('page_size')).toBe('1');
    });

    it('treats an offset equal to the total as past the end', async () => {
      installFakePaperless({ docs: corpus(12) });

      const result = await paperlessService.listDocuments(
        BASE_URL,
        TOKEN,
        { page: 2, pageSize: 10 },
        null,
        [1, 2],
      );

      // 10 unlinked documents: page 2 starts at offset 10 = total
      expect(result.documents).toEqual([]);
      expect(result.pagination.totalItems).toBe(10);
      expect(requested).toHaveLength(1);
    });

    it('sends the document type, correspondent, tag filters and ordering on the probe', async () => {
      installFakePaperless({ docs: corpus(5) });

      await paperlessService.listDocuments(
        BASE_URL,
        TOKEN,
        { tags: '3', documentType: 4, correspondent: 6, sortBy: 'title', sortOrder: 'asc' },
        null,
        [1],
      );

      const probe = documentRequests()[0]!.searchParams;
      expect(probe.get('tags__id__all')).toBe('3');
      expect(probe.get('document_type__id')).toBe('4');
      expect(probe.get('correspondent__id')).toBe('6');
      expect(probe.get('ordering')).toBe('title,id');
    });

    it('drops a page id that vanished between the probe and the page fetch', async () => {
      const docs = corpus(5);
      installFakePaperless({ docs });
      const base = mockFetch.getMockImplementation()!;
      mockFetch.mockImplementation(async (input, init) => {
        const url = new URL(String(input));
        if (url.pathname === '/api/documents/' && url.searchParams.get('id__in')) {
          // Paperless no longer returns document 3
          const res = await base(input, init);
          const body = (await res.json()) as { results: { id: number }[] };
          return jsonResponse({ ...body, results: body.results.filter((d) => d.id !== 3) });
        }
        return base(input, init);
      });

      const result = await paperlessService.listDocuments(
        BASE_URL,
        TOKEN,
        { page: 1, pageSize: 10 },
        null,
        [1],
      );

      expect(result.documents.map((d) => d.id)).toEqual([2, 4, 5]);
    });
  });

  describe('with a full-text query (over-fetch window)', () => {
    it('fetches one window sized offset + pageSize + linked-in-result and slices the page', async () => {
      installFakePaperless({ docs: corpus(250) });

      const result = await paperlessService.listDocuments(
        BASE_URL,
        TOKEN,
        { query: 'Roof', page: 1, pageSize: 100 },
        null,
        LINKED,
      );

      const docRequests = documentRequests();
      expect(docRequests).toHaveLength(2);
      const windowFetch = docRequests[1]!.searchParams;
      expect(windowFetch.get('page')).toBe('1');
      expect(windowFetch.get('page_size')).toBe('103');
      expect(windowFetch.get('truncate_content')).toBe('true');
      expect(windowFetch.get('id__in')).toBeNull();
      expect(windowFetch.get('query')).toBe('Roof');
      expect(result.documents).toHaveLength(100);
      expect(result.documents.slice(0, 4).map((d) => d.id)).toEqual([1, 3, 4, 6]);
      expect(result.pagination).toEqual({
        page: 1,
        pageSize: 100,
        totalItems: 247,
        totalPages: 3,
      });
    });

    it('keeps the search hit of each result', async () => {
      installFakePaperless({ docs: corpus(10) });

      const result = await paperlessService.listDocuments(
        BASE_URL,
        TOKEN,
        { query: 'Roof', pageSize: 5 },
        null,
        [1],
      );

      expect(result.documents.map((d) => d.searchHit?.rank)).toEqual([2, 3, 4, 5, 6]);
      expect(result.documents[0]!.searchHit).toEqual({
        score: 1,
        highlights: 'hit 2',
        rank: 2,
      });
    });

    it('caps the window at the result count', async () => {
      installFakePaperless({ docs: corpus(250) });

      const result = await paperlessService.listDocuments(
        BASE_URL,
        TOKEN,
        { query: 'Roof', page: 3, pageSize: 100 },
        null,
        LINKED,
      );

      expect(documentRequests()[1]!.searchParams.get('page_size')).toBe('250');
      expect(result.documents).toHaveLength(47);
      expect(result.documents[0]!.id).toBe(204);
      expect(result.documents.at(-1)!.id).toBe(250);
    });

    it('does not use the unordered `all` array for the page order', async () => {
      installFakePaperless({ docs: corpus(30) });

      const result = await paperlessService.listDocuments(
        BASE_URL,
        TOKEN,
        { query: 'Roof', page: 1, pageSize: 5 },
        null,
        [1],
      );

      // list order, not the reversed `all` order
      expect(result.documents.map((d) => d.id)).toEqual([2, 3, 4, 5, 6]);
    });

    it('returns an empty page without the window fetch when the offset is beyond the total', async () => {
      installFakePaperless({ docs: corpus(30) });

      const result = await paperlessService.listDocuments(
        BASE_URL,
        TOKEN,
        { query: 'Roof', page: 9, pageSize: 10 },
        null,
        [1],
      );

      expect(result.documents).toEqual([]);
      expect(result.pagination.totalItems).toBe(29);
      expect(requested).toHaveLength(1);
    });

    it('returns no documents when the query matches only linked documents', async () => {
      installFakePaperless({
        docs: [
          { id: 1, title: 'Roof one', tags: [3] },
          { id: 2, title: 'Other', tags: [3] },
        ],
      });

      const result = await paperlessService.listDocuments(
        BASE_URL,
        TOKEN,
        { query: 'Roof' },
        null,
        [1],
      );

      expect(result.documents).toEqual([]);
      expect(result.pagination.totalItems).toBe(0);
    });
  });

  describe.each<AllMode>(['missing', 'wrong-length'])('when `all` is %s', (mode) => {
    it('counts the linked documents of the result with id__in chunks of 100', async () => {
      installFakePaperless({ docs: corpus(250), all: mode });
      const linked = Array.from({ length: 150 }, (_, i) => i + 1);

      const result = await paperlessService.listDocuments(
        BASE_URL,
        TOKEN,
        { page: 1, pageSize: 50 },
        null,
        linked,
      );

      const chunkRequests = documentRequests().filter(
        (u) => u.searchParams.get('id__in') && u.searchParams.get('page_size') === '1',
      );
      expect(chunkRequests).toHaveLength(2);
      expect(chunkRequests.map((u) => u.searchParams.get('id__in')!.split(',').length)).toEqual([
        100, 50,
      ]);
      expect(result.pagination).toEqual({
        page: 1,
        pageSize: 50,
        totalItems: 100,
        totalPages: 2,
      });
    });

    it('falls back to the over-fetch window for the page and returns the unlinked documents', async () => {
      installFakePaperless({ docs: corpus(250), all: mode });
      const linked = Array.from({ length: 150 }, (_, i) => i + 1);

      const result = await paperlessService.listDocuments(
        BASE_URL,
        TOKEN,
        { page: 1, pageSize: 50 },
        null,
        linked,
      );

      const last = documentRequests().at(-1)!.searchParams;
      // offset 0 + pageSize 50 + 150 linked in the result
      expect(last.get('page_size')).toBe('200');
      expect(last.get('id__in')).toBeNull();
      expect(result.documents.map((d) => d.id)).toEqual(
        Array.from({ length: 50 }, (_, i) => 151 + i),
      );
    });

    it('does not count linked ids missing from the filtered result', async () => {
      installFakePaperless({ docs: corpus(20), all: mode });

      const result = await paperlessService.listDocuments(
        BASE_URL,
        TOKEN,
        { page: 1, pageSize: 100 },
        null,
        [4, 9999],
      );

      expect(result.pagination.totalItems).toBe(19);
      expect(result.documents).toHaveLength(19);
      expect(result.documents.some((d) => d.id === 4)).toBe(false);
    });

    it('returns the last page from the window', async () => {
      installFakePaperless({ docs: corpus(250), all: mode });

      const result = await paperlessService.listDocuments(
        BASE_URL,
        TOKEN,
        { page: 3, pageSize: 100 },
        null,
        LINKED,
      );

      expect(result.documents).toHaveLength(47);
      expect(result.pagination.totalPages).toBe(3);
    });
  });

  describe('without any excluded id', () => {
    it('issues the plain paged list request and no probe', async () => {
      installFakePaperless({ docs: corpus(250) });

      const result = await paperlessService.listDocuments(
        BASE_URL,
        TOKEN,
        { page: 2, pageSize: 10 },
        null,
        [],
      );

      const docRequests = documentRequests();
      expect(docRequests).toHaveLength(1);
      expect(docRequests[0]!.searchParams.get('page')).toBe('2');
      expect(docRequests[0]!.searchParams.get('page_size')).toBe('10');
      expect(docRequests[0]!.searchParams.get('id__in')).toBeNull();
      expect(result.documents.map((d) => d.id)).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
      expect(result.pagination.totalItems).toBe(250);
    });

    it('behaves like the plain list when the argument is omitted', async () => {
      installFakePaperless({ docs: corpus(30) });

      const result = await paperlessService.listDocuments(BASE_URL, TOKEN, {});

      expect(documentRequests()).toHaveLength(1);
      expect(result.documents).toHaveLength(25);
    });
  });

  describe('with a configured filter tag', () => {
    const tagged = () => corpus(30, [3, FILTER_TAG_ID]);

    it('puts the filter tag into tags__id__all of the probe and the id__in page fetch', async () => {
      installFakePaperless({ docs: tagged() });

      await paperlessService.listDocuments(BASE_URL, TOKEN, { pageSize: 5 }, 'house', [1]);

      const docRequests = documentRequests();
      expect(docRequests).toHaveLength(2);
      for (const req of docRequests) {
        expect(req.searchParams.get('tags__id__all')).toBe(String(FILTER_TAG_ID));
      }
    });

    it('puts the filter tag into the probe and the window request of a full-text listing', async () => {
      installFakePaperless({ docs: tagged() });

      await paperlessService.listDocuments(
        BASE_URL,
        TOKEN,
        { query: 'Roof', pageSize: 5 },
        'house',
        [1],
      );

      const docRequests = documentRequests();
      expect(docRequests).toHaveLength(2);
      for (const req of docRequests) {
        expect(req.searchParams.get('tags__id__all')).toBe(String(FILTER_TAG_ID));
      }
    });

    it('puts the filter tag into every request of the id__in count and window fallback', async () => {
      installFakePaperless({ docs: corpus(130, [3, FILTER_TAG_ID]), all: 'missing' });
      const linked = Array.from({ length: 120 }, (_, i) => i + 1);

      await paperlessService.listDocuments(BASE_URL, TOKEN, { pageSize: 5 }, 'house', linked);

      const docRequests = documentRequests();
      // probe + 2 chunk counts + window
      expect(docRequests).toHaveLength(4);
      for (const req of docRequests) {
        expect(req.searchParams.get('tags__id__all')).toBe(String(FILTER_TAG_ID));
      }
    });

    it('merges client tags with the filter tag on every request', async () => {
      installFakePaperless({ docs: tagged() });

      await paperlessService.listDocuments(
        BASE_URL,
        TOKEN,
        { tags: '3', pageSize: 5 },
        'house',
        [1],
      );

      for (const req of documentRequests()) {
        expect(req.searchParams.get('tags__id__all')).toBe(`3,${FILTER_TAG_ID}`);
      }
    });

    it('does not expose documents without the filter tag', async () => {
      const docs = [
        { id: 1, title: 'Roof 1', tags: [3, FILTER_TAG_ID] },
        { id: 2, title: 'Roof 2', tags: [3] },
        { id: 3, title: 'Roof 3', tags: [3, FILTER_TAG_ID] },
      ];
      installFakePaperless({ docs });

      const result = await paperlessService.listDocuments(BASE_URL, TOKEN, {}, 'house', [3]);

      expect(result.documents.map((d) => d.id)).toEqual([1]);
      expect(result.pagination.totalItems).toBe(1);
    });

    it('fails closed with PAPERLESS_ERROR 502 and sends no documents request when the tag is unknown', async () => {
      installFakePaperless({ docs: tagged() });

      const error = (await paperlessService
        .listDocuments(BASE_URL, TOKEN, {}, 'no-such-tag', [1])
        .catch((e: unknown) => e)) as AppError;

      expect(error.code).toBe('PAPERLESS_ERROR');
      expect(error.statusCode).toBe(502);
      expect(documentRequests()).toHaveLength(0);
    });
  });

  it('propagates an upstream failure of the probe', async () => {
    mockFetch.mockImplementation(async () => jsonResponse({}, 500));

    const error = (await paperlessService
      .listDocuments(BASE_URL, TOKEN, {}, null, [1])
      .catch((e: unknown) => e)) as AppError;

    expect(error.code).toBe('PAPERLESS_ERROR');
  });
});

describe('listDocumentTypes()', () => {
  it('maps the document types and sorts them by id', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        count: 3,
        results: [
          { id: 9, name: 'Invoice', slug: 'invoice', match: '' },
          { id: 2, name: 'Contract', slug: 'contract', match: '' },
          { id: 5, name: 'Plan', slug: 'plan', match: '' },
        ],
      }),
    );

    const result = await paperlessService.listDocumentTypes(BASE_URL, TOKEN);

    expect(result).toEqual({
      documentTypes: [
        { id: 2, name: 'Contract' },
        { id: 5, name: 'Plan' },
        { id: 9, name: 'Invoice' },
      ],
    });
    expect(String(mockFetch.mock.calls[0]![0])).toBe(
      'http://paperless:8000/api/document_types/?page_size=1000',
    );
  });

  it('returns an empty list when Paperless has no document types', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ count: 0, results: [] }));

    expect(await paperlessService.listDocumentTypes(BASE_URL, TOKEN)).toEqual({
      documentTypes: [],
    });
  });

  it('throws PAPERLESS_UNREACHABLE when the request fails', async () => {
    mockFetch.mockRejectedValueOnce(new Error('connection refused'));

    const error = (await paperlessService
      .listDocumentTypes(BASE_URL, TOKEN)
      .catch((e: unknown) => e)) as AppError;

    expect(error.code).toBe('PAPERLESS_UNREACHABLE');
    expect(error.statusCode).toBe(502);
  });
});
