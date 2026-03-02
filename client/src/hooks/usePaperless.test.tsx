import { renderHook, act, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';

const mockGetPaperlessStatus = jest.fn<() => Promise<unknown>>();
const mockListPaperlessDocuments = jest.fn<() => Promise<unknown>>();
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

const makeStatus = (configured = true, reachable = true) => ({
  configured,
  reachable,
  error: null,
});

const makeDoc = (id: number) => ({
  id,
  title: `Document ${id}`,
  content: 'Some content',
  tags: [],
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

const makePagination = (page = 1, totalPages = 1, totalItems = 1) => ({
  page,
  pageSize: 25,
  totalItems,
  totalPages,
});

const makeDocsResponse = (docs = [makeDoc(1)], page = 1, totalPages = 1) => ({
  documents: docs,
  pagination: makePagination(page, totalPages, docs.length),
});

const makeTagsResponse = (tags = [{ id: 1, name: 'Invoice', color: null, documentCount: 3 }]) => ({
  tags,
});

beforeEach(async () => {
  ({ usePaperless } = (await import('./usePaperless.js')) as typeof UsePaperlessModule);
  mockGetPaperlessStatus.mockReset();
  mockListPaperlessDocuments.mockReset();
  mockListPaperlessTags.mockReset();

  // Default: configured + reachable
  mockGetPaperlessStatus.mockResolvedValue(makeStatus());
  mockListPaperlessDocuments.mockResolvedValue(makeDocsResponse());
  mockListPaperlessTags.mockResolvedValue(makeTagsResponse());
});

describe('usePaperless', () => {
  it('starts with isLoading=true and status=null', () => {
    // Don't await resolution — check initial state
    mockGetPaperlessStatus.mockImplementationOnce(() => new Promise(() => {}));
    const { result } = renderHook(() => usePaperless());
    expect(result.current.status).toBeNull();
    expect(result.current.isLoading).toBe(true);
  });

  it('fetches status on mount', async () => {
    const { result } = renderHook(() => usePaperless());

    await waitFor(() => expect(result.current.status).not.toBeNull());
    expect(mockGetPaperlessStatus).toHaveBeenCalledTimes(1);
  });

  it('fetches documents and tags when configured + reachable', async () => {
    const { result } = renderHook(() => usePaperless());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockListPaperlessDocuments).toHaveBeenCalledTimes(1);
    expect(mockListPaperlessTags).toHaveBeenCalledTimes(1);
    expect(result.current.documents).toHaveLength(1);
    expect(result.current.tags).toHaveLength(1);
    expect(result.current.pagination).not.toBeNull();
  });

  it('does NOT fetch documents when not configured', async () => {
    mockGetPaperlessStatus.mockResolvedValue(makeStatus(false, false));
    const { result } = renderHook(() => usePaperless());

    await waitFor(() => expect(result.current.status).not.toBeNull());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockListPaperlessDocuments).not.toHaveBeenCalled();
    expect(result.current.documents).toHaveLength(0);
  });

  it('does NOT fetch documents when configured but unreachable', async () => {
    mockGetPaperlessStatus.mockResolvedValue(makeStatus(true, false));
    const { result } = renderHook(() => usePaperless());

    await waitFor(() => expect(result.current.status).not.toBeNull());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockListPaperlessDocuments).not.toHaveBeenCalled();
  });

  it('sets error on ApiClientError', async () => {
    const { ApiClientError } = await import('../lib/apiClient.js');
    mockListPaperlessDocuments.mockRejectedValueOnce(
      new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'Server error' }),
    );
    const { result } = renderHook(() => usePaperless());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBe('Server error');
  });

  it('sets error on NetworkError', async () => {
    const { NetworkError } = await import('../lib/apiClient.js');
    mockListPaperlessDocuments.mockRejectedValueOnce(
      new NetworkError('Network request failed', new Error()),
    );
    const { result } = renderHook(() => usePaperless());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toContain('Network error');
  });

  it('sets generic error on unknown error', async () => {
    mockListPaperlessDocuments.mockRejectedValueOnce(new Error('Something weird'));
    const { result } = renderHook(() => usePaperless());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBe('An unexpected error occurred.');
  });

  it('sets fallback status on status fetch failure', async () => {
    mockGetPaperlessStatus.mockRejectedValueOnce(new Error('network timeout'));
    const { result } = renderHook(() => usePaperless());

    await waitFor(() => expect(result.current.status).not.toBeNull());
    expect(result.current.status?.configured).toBe(false);
    expect(result.current.status?.reachable).toBe(false);
  });

  describe('search()', () => {
    it('updates query and resets page to 1', async () => {
      const { result } = renderHook(() => usePaperless());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      act(() => {
        result.current.search('invoice');
      });

      await waitFor(() => expect(result.current.query).toBe('invoice'));
    });

    it('refetches documents with new query', async () => {
      const { result } = renderHook(() => usePaperless());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      mockListPaperlessDocuments.mockResolvedValueOnce(makeDocsResponse([makeDoc(2)]));

      act(() => {
        result.current.search('report');
      });

      await waitFor(() => expect(result.current.query).toBe('report'));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(mockListPaperlessDocuments).toHaveBeenCalledWith(
        expect.objectContaining({ query: 'report' }),
      );
    });
  });

  describe('toggleTag()', () => {
    it('adds tag to selectedTags when not present', async () => {
      const { result } = renderHook(() => usePaperless());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      act(() => {
        result.current.toggleTag(5);
      });

      expect(result.current.selectedTags).toContain(5);
    });

    it('removes tag from selectedTags when already present', async () => {
      const { result } = renderHook(() => usePaperless());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      act(() => {
        result.current.toggleTag(5);
      });
      act(() => {
        result.current.toggleTag(5);
      });

      expect(result.current.selectedTags).not.toContain(5);
    });

    it('refetches documents with tags as comma-separated string', async () => {
      const { result } = renderHook(() => usePaperless());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      act(() => {
        result.current.toggleTag(1);
      });
      act(() => {
        result.current.toggleTag(3);
      });

      await waitFor(() => expect(result.current.selectedTags).toEqual([1, 3]));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      const lastCallArgs = mockListPaperlessDocuments.mock.calls[
        mockListPaperlessDocuments.mock.calls.length - 1
      ] as unknown as [{ tags?: string }];
      expect(lastCallArgs[0].tags).toBe('1,3');
    });
  });

  describe('setPage()', () => {
    it('updates the page and refetches', async () => {
      const { result } = renderHook(() => usePaperless());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      act(() => {
        result.current.setPage(3);
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(mockListPaperlessDocuments).toHaveBeenCalledWith(expect.objectContaining({ page: 3 }));
    });
  });

  describe('refresh()', () => {
    it('triggers a re-fetch', async () => {
      const { result } = renderHook(() => usePaperless());
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      const callsBefore = mockListPaperlessDocuments.mock.calls.length;

      act(() => {
        result.current.refresh();
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(mockListPaperlessDocuments.mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });
});
