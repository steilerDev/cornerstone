/**
 * @jest-environment jsdom
 *
 * Tests for usePaperless (Issue #2101 — infinite scroll rewrite).
 * Uses the REAL useInfiniteScroll hook and a mocked paperlessApi.
 */
import { renderHook, render, act, waitFor } from '@testing-library/react';
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import enErrors from '../i18n/en/errors.json';
import enCommon from '../i18n/en/common.json';

const mockGetPaperlessStatus = jest.fn<() => Promise<unknown>>();
const mockListPaperlessDocuments = jest.fn<(params: unknown) => Promise<unknown>>();
const mockListPaperlessTags = jest.fn<() => Promise<unknown>>();

jest.unstable_mockModule('../lib/paperlessApi.js', () => ({
  getPaperlessStatus: mockGetPaperlessStatus,
  listPaperlessDocuments: mockListPaperlessDocuments,
  listPaperlessTags: mockListPaperlessTags,
  getPaperlessDocument: jest.fn(),
  getDocumentThumbnailUrl: jest.fn(),
  getDocumentPreviewUrl: jest.fn(),
}));

class MockApiClientError extends Error {
  statusCode: number;
  error: { code: string; message?: string };
  constructor(statusCode: number, error: { code: string; message?: string }) {
    super(error.message ?? 'API Error');
    this.statusCode = statusCode;
    this.error = error;
  }
}

class MockNetworkError extends Error {
  constructor(message: string) {
    super(message);
  }
}

jest.unstable_mockModule('../lib/apiClient.js', () => ({
  get: jest.fn(),
  post: jest.fn(),
  patch: jest.fn(),
  del: jest.fn(),
  put: jest.fn(),
  setBaseUrl: jest.fn(),
  getBaseUrl: jest.fn().mockReturnValue('/api'),
  ApiClientError: MockApiClientError,
  NetworkError: MockNetworkError,
}));

import type * as UsePaperlessModule from './usePaperless.js';

let usePaperless: (typeof UsePaperlessModule)['usePaperless'];
let PAPERLESS_DOCUMENT_BATCH_SIZE: number;

// ─── IntersectionObserver mock ───────────────────────────────────────────────

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];
  options: IntersectionObserverInit | undefined;
  callback: IntersectionObserverCallback;
  constructor(cb: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.callback = cb;
    this.options = options;
    MockIntersectionObserver.instances.push(this);
  }
  observe = jest.fn();
  disconnect = jest.fn();
  unobserve = jest.fn();
}

let originalIO: typeof IntersectionObserver | undefined;

// ─── Fixtures ────────────────────────────────────────────────────────────────

const makeStatus = (configured = true, reachable = true) => ({
  configured,
  reachable,
  error: null,
});

type Tag = { id: number; name: string; color: string | null; documentCount: number };

const makeDoc = (id: number, tags: Tag[] = []) => ({
  id,
  title: `Document ${id}`,
  content: 'Some content',
  tags,
  created: '2025-01-15',
  added: null,
  modified: null,
  correspondent: null,
  documentType: null,
  archiveSerialNumber: null,
  originalFileName: null,
  pageCount: null,
  searchHit: null,
});

const makeDocsResponse = (docs = [makeDoc(1)], page = 1, totalPages = 1) => ({
  documents: docs,
  pagination: { page, pageSize: 25, totalItems: docs.length, totalPages },
});

const makeTagsResponse = (
  tags: Tag[] = [{ id: 1, name: 'Invoice', color: null, documentCount: 3 }],
) => ({
  tags,
});

function lastDocsCallArgs(): Record<string, unknown> {
  const calls = mockListPaperlessDocuments.mock.calls;
  return calls[calls.length - 1]![0] as Record<string, unknown>;
}

beforeEach(async () => {
  MockIntersectionObserver.instances = [];
  originalIO = globalThis.IntersectionObserver;
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver =
    MockIntersectionObserver;

  const mod = (await import('./usePaperless.js')) as typeof UsePaperlessModule;
  usePaperless = mod.usePaperless;
  PAPERLESS_DOCUMENT_BATCH_SIZE = mod.PAPERLESS_DOCUMENT_BATCH_SIZE;
  mockGetPaperlessStatus.mockReset();
  mockListPaperlessDocuments.mockReset();
  mockListPaperlessTags.mockReset();

  // Default: configured + reachable, a single one-page result
  mockGetPaperlessStatus.mockResolvedValue(makeStatus());
  mockListPaperlessDocuments.mockResolvedValue(makeDocsResponse());
  mockListPaperlessTags.mockResolvedValue(makeTagsResponse());
});

afterEach(() => {
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = originalIO;
});

describe('usePaperless', () => {
  it('exports a batch size of 25 (matches the server default page size)', () => {
    expect(PAPERLESS_DOCUMENT_BATCH_SIZE).toBe(25);
  });

  it('starts with status=null and listStatus "loading", and does not fetch documents before status resolves', () => {
    mockGetPaperlessStatus.mockImplementationOnce(() => new Promise(() => {}));
    const { result } = renderHook(() => usePaperless());
    expect(result.current.status).toBeNull();
    expect(result.current.listStatus).toBe('loading');
    expect(mockListPaperlessDocuments).not.toHaveBeenCalled();
  });

  it('does not expose legacy pagination fields', async () => {
    const { result } = renderHook(() => usePaperless());
    await waitFor(() => expect(result.current.listStatus).toBe('done'));
    expect(result.current).not.toHaveProperty('pagination');
    expect(result.current).not.toHaveProperty('setPage');
    expect(result.current).not.toHaveProperty('isLoading');
  });

  it('fetches status on mount', async () => {
    const { result } = renderHook(() => usePaperless());

    await waitFor(() => expect(result.current.status).not.toBeNull());
    expect(mockGetPaperlessStatus).toHaveBeenCalledTimes(1);
  });

  it('fetches page 1 (pageSize 25) and tags exactly once when configured + reachable', async () => {
    const { result } = renderHook(() => usePaperless());

    await waitFor(() => expect(result.current.documents).toHaveLength(1));
    await waitFor(() => expect(result.current.tags).toHaveLength(1));

    expect(mockListPaperlessDocuments).toHaveBeenCalledTimes(1);
    expect(mockListPaperlessDocuments).toHaveBeenCalledWith({
      query: undefined,
      tags: undefined,
      correspondent: undefined,
      page: 1,
      pageSize: 25,
    });
    expect(mockListPaperlessTags).toHaveBeenCalledTimes(1);
    expect(result.current.listStatus).toBe('done');
    expect(result.current.hasMore).toBe(false);
  });

  it('does NOT fetch documents or tags when not configured', async () => {
    mockGetPaperlessStatus.mockResolvedValue(makeStatus(false, false));
    const { result } = renderHook(() => usePaperless());

    await waitFor(() => expect(result.current.status).not.toBeNull());
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockListPaperlessDocuments).not.toHaveBeenCalled();
    expect(mockListPaperlessTags).not.toHaveBeenCalled();
    expect(result.current.documents).toHaveLength(0);
    expect(result.current.tagCountMap.size).toBe(0);
  });

  it('does NOT fetch documents when configured but unreachable', async () => {
    mockGetPaperlessStatus.mockResolvedValue(makeStatus(true, false));
    const { result } = renderHook(() => usePaperless());

    await waitFor(() => expect(result.current.status).not.toBeNull());
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockListPaperlessDocuments).not.toHaveBeenCalled();
  });

  it('sets fallback status on status fetch failure', async () => {
    mockGetPaperlessStatus.mockRejectedValueOnce(new Error('network timeout'));
    const { result } = renderHook(() => usePaperless());

    await waitFor(() => expect(result.current.status).not.toBeNull());
    expect(result.current.status?.configured).toBe(false);
    expect(result.current.status?.reachable).toBe(false);
    expect(mockListPaperlessDocuments).not.toHaveBeenCalled();
  });

  // ─── Errors ────────────────────────────────────────────────────────────────

  describe('error handling', () => {
    it('surfaces the translated ApiClientError code (not the server text) and sets listStatus "error"', async () => {
      const { ApiClientError } = await import('../lib/apiClient.js');
      mockListPaperlessDocuments.mockRejectedValueOnce(
        new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'RAW-SERVER-SENTINEL' }),
      );
      const { result } = renderHook(() => usePaperless());

      await waitFor(() => expect(result.current.listStatus).toBe('error'));
      expect(result.current.error).toBe(enErrors.INTERNAL_ERROR);
    });

    it('translates the code even when ApiClientError has no message', async () => {
      const { ApiClientError } = await import('../lib/apiClient.js');
      mockListPaperlessDocuments.mockRejectedValueOnce(
        new ApiClientError(500, { code: 'INTERNAL_ERROR' } as never),
      );
      const { result } = renderHook(() => usePaperless());

      await waitFor(() => expect(result.current.listStatus).toBe('error'));
      expect(result.current.error).toBe(enErrors.INTERNAL_ERROR);
    });

    it('surfaces the network-error copy on NetworkError', async () => {
      const { NetworkError } = await import('../lib/apiClient.js');
      mockListPaperlessDocuments.mockRejectedValueOnce(
        new NetworkError('Network request failed', new Error()),
      );
      const { result } = renderHook(() => usePaperless());

      await waitFor(() => expect(result.current.listStatus).toBe('error'));
      expect(result.current.error).toBe(enCommon.requestErrors.network);
    });

    it('surfaces the generic copy on an unknown error', async () => {
      mockListPaperlessDocuments.mockRejectedValueOnce(new Error('Something weird'));
      const { result } = renderHook(() => usePaperless());

      await waitFor(() => expect(result.current.listStatus).toBe('error'));
      expect(result.current.error).toBe(enCommon.requestErrors.unexpected);
    });

    it('error is null initially and cleared after a successful retry', async () => {
      mockListPaperlessDocuments.mockRejectedValueOnce(new Error('boom'));
      const { result } = renderHook(() => usePaperless());
      expect(result.current.error).toBeNull();

      await waitFor(() => expect(result.current.error).not.toBeNull());

      mockListPaperlessDocuments.mockResolvedValueOnce(makeDocsResponse([makeDoc(1)]));
      act(() => result.current.retry());

      await waitFor(() => expect(result.current.error).toBeNull());
      expect(result.current.documents).toHaveLength(1);
    });

    it('tags failure is non-fatal: tags stay empty but documents still load', async () => {
      mockListPaperlessTags.mockRejectedValue(new Error('tags down'));
      const { result } = renderHook(() => usePaperless());

      await waitFor(() => expect(result.current.documents).toHaveLength(1));
      await waitFor(() => expect(mockListPaperlessTags).toHaveBeenCalled());
      expect(result.current.tags).toEqual([]);
      expect(result.current.error).toBeNull();
      expect(result.current.listStatus).toBe('done');
    });
  });

  // ─── Batches / pagination ─────────────────────────────────────────────────

  describe('batches', () => {
    it('loadMore() requests page 2 and appends, preserving earlier documents', async () => {
      mockListPaperlessDocuments.mockResolvedValueOnce(
        makeDocsResponse([makeDoc(1), makeDoc(2)], 1, 2),
      );
      mockListPaperlessDocuments.mockResolvedValueOnce(makeDocsResponse([makeDoc(3)], 2, 2));
      const { result } = renderHook(() => usePaperless());
      await waitFor(() => expect(result.current.listStatus).toBe('idle'));
      expect(result.current.hasMore).toBe(true);

      act(() => result.current.loadMore());

      await waitFor(() => expect(result.current.listStatus).toBe('done'));
      expect(lastDocsCallArgs()).toMatchObject({ page: 2, pageSize: 25 });
      expect(result.current.documents.map((d) => d.id)).toEqual([1, 2, 3]);
      expect(result.current.hasMore).toBe(false);
    });

    it('hasMore is false when a batch is empty even if page < totalPages', async () => {
      mockListPaperlessDocuments.mockResolvedValueOnce(makeDocsResponse([], 1, 5));
      const { result } = renderHook(() => usePaperless());

      await waitFor(() => expect(result.current.listStatus).toBe('done'));
      expect(result.current.hasMore).toBe(false);
      expect(result.current.documents).toEqual([]);
    });

    it('hasMore is false on the last page (page === totalPages)', async () => {
      mockListPaperlessDocuments.mockResolvedValueOnce(makeDocsResponse([makeDoc(1)], 1, 1));
      const { result } = renderHook(() => usePaperless());

      await waitFor(() => expect(result.current.listStatus).toBe('done'));
      expect(result.current.hasMore).toBe(false);
    });

    it('de-duplicates a document repeated across batches (first occurrence wins)', async () => {
      const first = { ...makeDoc(2), title: 'first copy' };
      const second = { ...makeDoc(2), title: 'second copy' };
      mockListPaperlessDocuments.mockResolvedValueOnce(makeDocsResponse([makeDoc(1), first], 1, 2));
      mockListPaperlessDocuments.mockResolvedValueOnce(
        makeDocsResponse([second, makeDoc(3)], 2, 2),
      );
      const { result } = renderHook(() => usePaperless());
      await waitFor(() => expect(result.current.listStatus).toBe('idle'));

      act(() => result.current.loadMore());
      await waitFor(() => expect(result.current.listStatus).toBe('done'));

      expect(result.current.documents.map((d) => d.id)).toEqual([1, 2, 3]);
      expect(result.current.documents[1]!.title).toBe('first copy');
    });

    it('exposes fetchSequence and lastBatchCount from the infinite hook', async () => {
      mockListPaperlessDocuments.mockResolvedValueOnce(
        makeDocsResponse([makeDoc(1), makeDoc(2)], 1, 2),
      );
      mockListPaperlessDocuments.mockResolvedValueOnce(makeDocsResponse([makeDoc(3)], 2, 2));
      const { result } = renderHook(() => usePaperless());
      await waitFor(() => expect(result.current.fetchSequence).toBe(1));
      expect(result.current.lastBatchCount).toBe(2);

      act(() => result.current.loadMore());
      await waitFor(() => expect(result.current.fetchSequence).toBe(2));
      expect(result.current.lastBatchCount).toBe(1);
    });
  });

  // ─── Filters / reset ─────────────────────────────────────────────────────

  describe('search()', () => {
    it('updates query and refetches page 1 with the new query, replacing documents', async () => {
      const { result } = renderHook(() => usePaperless());
      await waitFor(() => expect(result.current.listStatus).toBe('done'));

      mockListPaperlessDocuments.mockResolvedValueOnce(makeDocsResponse([makeDoc(2)]));
      act(() => result.current.search('report'));

      await waitFor(() => expect(result.current.query).toBe('report'));
      await waitFor(() => expect(result.current.documents.map((d) => d.id)).toEqual([2]));
      expect(lastDocsCallArgs()).toMatchObject({ query: 'report', page: 1 });
    });

    it('a search after page 2 resets to page 1 (not page 3)', async () => {
      mockListPaperlessDocuments.mockResolvedValueOnce(makeDocsResponse([makeDoc(1)], 1, 3));
      mockListPaperlessDocuments.mockResolvedValueOnce(makeDocsResponse([makeDoc(2)], 2, 3));
      const { result } = renderHook(() => usePaperless());
      await waitFor(() => expect(result.current.listStatus).toBe('idle'));
      act(() => result.current.loadMore());
      await waitFor(() => expect(result.current.fetchSequence).toBe(2));

      mockListPaperlessDocuments.mockResolvedValueOnce(makeDocsResponse([makeDoc(9)], 1, 1));
      act(() => result.current.search('x'));

      await waitFor(() => expect(result.current.documents.map((d) => d.id)).toEqual([9]));
      expect(lastDocsCallArgs()).toMatchObject({ query: 'x', page: 1 });
    });
  });

  describe('toggleTag()', () => {
    it('adds and removes tags from selectedTags', async () => {
      const { result } = renderHook(() => usePaperless());
      await waitFor(() => expect(result.current.listStatus).toBe('done'));

      act(() => result.current.toggleTag(5));
      expect(result.current.selectedTags).toEqual([5]);
      await waitFor(() => expect(lastDocsCallArgs().tags).toBe('5'));
      await waitFor(() => expect(result.current.listStatus).toBe('done'));

      act(() => result.current.toggleTag(5));
      expect(result.current.selectedTags).toEqual([]);
      await waitFor(() => expect(lastDocsCallArgs().tags).toBeUndefined());
      await waitFor(() => expect(result.current.listStatus).toBe('done'));
    });

    it('refetches with tags as a comma-separated string', async () => {
      const { result } = renderHook(() => usePaperless());
      await waitFor(() => expect(result.current.listStatus).toBe('done'));

      act(() => result.current.toggleTag(1));
      await waitFor(() => expect(lastDocsCallArgs().tags).toBe('1'));
      await waitFor(() => expect(result.current.listStatus).toBe('done'));
      act(() => result.current.toggleTag(3));

      await waitFor(() => expect(lastDocsCallArgs().tags).toBe('1,3'));
      await waitFor(() => expect(result.current.listStatus).toBe('done'));
    });

    it('resetKey normalises tag order: selecting [2,1] vs [1,2] yields the same resetKey', async () => {
      const a = renderHook(() => usePaperless());
      await waitFor(() => expect(a.result.current.listStatus).toBe('done'));
      act(() => a.result.current.toggleTag(2));
      act(() => a.result.current.toggleTag(1));
      const keyA = a.result.current.resetKey;
      expect(a.result.current.selectedTags).toEqual([2, 1]);
      await waitFor(() => expect(a.result.current.listStatus).toBe('done'));
      a.unmount();

      const b = renderHook(() => usePaperless());
      await waitFor(() => expect(b.result.current.listStatus).toBe('done'));
      act(() => b.result.current.toggleTag(1));
      act(() => b.result.current.toggleTag(2));
      const keyB = b.result.current.resetKey;
      expect(b.result.current.selectedTags).toEqual([1, 2]);
      await waitFor(() => expect(b.result.current.listStatus).toBe('done'));

      expect(keyB).toBe(keyA);
    });
  });

  describe('correspondent', () => {
    it('passes the initial correspondentId option to the API', async () => {
      const { result } = renderHook(() => usePaperless({ correspondentId: 7 }));
      await waitFor(() => expect(result.current.listStatus).toBe('done'));
      expect(lastDocsCallArgs()).toMatchObject({ correspondent: 7, page: 1 });
    });

    it('setCorrespondent(id) refetches page 1 with the new correspondent', async () => {
      const { result } = renderHook(() => usePaperless());
      await waitFor(() => expect(result.current.listStatus).toBe('done'));

      act(() => result.current.setCorrespondent(4));

      await waitFor(() => expect(lastDocsCallArgs()).toMatchObject({ correspondent: 4, page: 1 }));
    });

    it('setCorrespondent(null) clears the correspondent filter', async () => {
      const { result } = renderHook(() => usePaperless({ correspondentId: 7 }));
      await waitFor(() => expect(result.current.listStatus).toBe('done'));

      act(() => result.current.setCorrespondent(null));

      await waitFor(() => expect(lastDocsCallArgs().correspondent).toBeUndefined());
    });
  });

  describe('refresh()', () => {
    it('refetches page 1 AND refetches tags', async () => {
      const { result } = renderHook(() => usePaperless());
      await waitFor(() => expect(result.current.listStatus).toBe('done'));
      await waitFor(() => expect(result.current.tags).toHaveLength(1));
      const docCalls = mockListPaperlessDocuments.mock.calls.length;
      const tagCalls = mockListPaperlessTags.mock.calls.length;
      const keyBefore = result.current.resetKey;

      act(() => result.current.refresh());

      await waitFor(() => expect(mockListPaperlessDocuments.mock.calls.length).toBe(docCalls + 1));
      await waitFor(() => expect(mockListPaperlessTags.mock.calls.length).toBe(tagCalls + 1));
      expect(lastDocsCallArgs()).toMatchObject({ page: 1 });
      expect(result.current.resetKey).not.toBe(keyBefore);
    });
  });

  // ─── tagCountMap ─────────────────────────────────────────────────────────

  describe('tagCountMap', () => {
    it('computes counts from the loaded documents', async () => {
      const docA = makeDoc(10, [
        { id: 1, name: 'a', color: null, documentCount: 5 },
        { id: 2, name: 'b', color: null, documentCount: 3 },
      ]);
      const docB = makeDoc(11, [
        { id: 2, name: 'b', color: null, documentCount: 3 },
        { id: 3, name: 'c', color: null, documentCount: 1 },
      ]);
      mockListPaperlessDocuments.mockResolvedValueOnce(makeDocsResponse([docA, docB]));

      const { result } = renderHook(() => usePaperless());
      await waitFor(() => expect(result.current.documents).toHaveLength(2));

      expect(result.current.tagCountMap.get(1)).toBe(1);
      expect(result.current.tagCountMap.get(2)).toBe(2);
      expect(result.current.tagCountMap.get(3)).toBe(1);
      expect(result.current.tagCountMap.get(99)).toBeUndefined();
    });

    it('aggregates across batches', async () => {
      const tagX: Tag = { id: 7, name: 'x', color: null, documentCount: 0 };
      mockListPaperlessDocuments.mockResolvedValueOnce(
        makeDocsResponse([makeDoc(1, [tagX])], 1, 2),
      );
      mockListPaperlessDocuments.mockResolvedValueOnce(
        makeDocsResponse([makeDoc(2, [tagX]), makeDoc(3, [tagX])], 2, 2),
      );
      const { result } = renderHook(() => usePaperless());
      await waitFor(() => expect(result.current.listStatus).toBe('idle'));
      expect(result.current.tagCountMap.get(7)).toBe(1);

      act(() => result.current.loadMore());
      await waitFor(() => expect(result.current.listStatus).toBe('done'));

      expect(result.current.tagCountMap.get(7)).toBe(3);
    });
  });

  // ─── scrollRoot ──────────────────────────────────────────────────────────

  describe('scrollRoot option', () => {
    it('is forwarded as the IntersectionObserver root of the sentinel', async () => {
      const scrollRoot = document.createElement('div');
      mockListPaperlessDocuments.mockResolvedValue(makeDocsResponse([makeDoc(1)], 1, 3));
      function Harness() {
        const hook = usePaperless({ scrollRoot });
        return <div ref={hook.sentinelRef} data-testid="s" />;
      }
      render(<Harness />);

      await waitFor(() => expect(MockIntersectionObserver.instances.length).toBeGreaterThan(0));
      const last =
        MockIntersectionObserver.instances[MockIntersectionObserver.instances.length - 1]!;
      expect(last.options!.root).toBe(scrollRoot);
    });

    it('defaults to a null (viewport) root', async () => {
      function Harness() {
        const hook = usePaperless();
        return <div ref={hook.sentinelRef} />;
      }
      render(<Harness />);

      await waitFor(() => expect(MockIntersectionObserver.instances.length).toBeGreaterThan(0));
      expect(MockIntersectionObserver.instances[0]!.options!.root).toBeNull();
    });
  });
});
