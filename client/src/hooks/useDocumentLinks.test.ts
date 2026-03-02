import { renderHook, act, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';

const mockListDocumentLinks = jest.fn<() => Promise<unknown>>();
const mockCreateDocumentLink = jest.fn<() => Promise<unknown>>();
const mockDeleteDocumentLink = jest.fn<() => Promise<unknown>>();

jest.unstable_mockModule('../lib/documentLinksApi.js', () => ({
  listDocumentLinks: mockListDocumentLinks,
  createDocumentLink: mockCreateDocumentLink,
  deleteDocumentLink: mockDeleteDocumentLink,
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

import type * as UseDocumentLinksModule from './useDocumentLinks.js';

let useDocumentLinks: (typeof UseDocumentLinksModule)['useDocumentLinks'];

const makeLink = (id: string, paperlessDocumentId = 42) => ({
  id,
  entityType: 'work_item' as const,
  entityId: 'wi-abc',
  paperlessDocumentId,
  createdBy: null,
  createdAt: '2026-01-01T00:00:00Z',
  document: {
    id: paperlessDocumentId,
    title: `Document #${paperlessDocumentId}`,
    content: null,
    tags: [],
    created: '2026-01-15',
    added: null,
    modified: null,
    correspondent: null,
    documentType: null,
    archiveSerialNumber: null,
    originalFileName: null,
    pageCount: null,
  },
});

beforeEach(async () => {
  ({ useDocumentLinks } = (await import('./useDocumentLinks.js')) as typeof UseDocumentLinksModule);
  mockListDocumentLinks.mockReset();
  mockCreateDocumentLink.mockReset();
  mockDeleteDocumentLink.mockReset();

  // Default: returns empty list
  mockListDocumentLinks.mockResolvedValue([]);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('useDocumentLinks', () => {
  it('starts with isLoading=true before fetch completes', () => {
    mockListDocumentLinks.mockImplementationOnce(() => new Promise(() => {}));
    const { result } = renderHook(() => useDocumentLinks('work_item', 'wi-abc'));
    expect(result.current.isLoading).toBe(true);
    expect(result.current.links).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('fetches document links on mount and stores results in links', async () => {
    const links = [makeLink('link-1', 42), makeLink('link-2', 99)];
    mockListDocumentLinks.mockResolvedValueOnce(links);

    const { result } = renderHook(() => useDocumentLinks('work_item', 'wi-abc'));

    // Wait for links to be populated (not for isLoading to go false — it starts false)
    await waitFor(() => expect(result.current.links).toEqual(links));

    expect(mockListDocumentLinks).toHaveBeenCalledWith('work_item', 'wi-abc');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('sets isLoading=false after fetch completes', async () => {
    mockListDocumentLinks.mockResolvedValueOnce([makeLink('link-1')]);

    const { result } = renderHook(() => useDocumentLinks('work_item', 'wi-abc'));

    await waitFor(() => expect(result.current.links).toHaveLength(1));
    expect(result.current.isLoading).toBe(false);
  });

  it('sets error string and isLoading=false on ApiClientError; links stays empty', async () => {
    mockListDocumentLinks.mockRejectedValueOnce(
      new MockApiClientError(500, { code: 'INTERNAL_ERROR', message: 'Server error' }),
    );

    const { result } = renderHook(() => useDocumentLinks('work_item', 'wi-abc'));

    await waitFor(() => expect(result.current.error).toBe('Server error'));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.links).toEqual([]);
  });

  it('uses fallback error message when ApiClientError has no message', async () => {
    mockListDocumentLinks.mockRejectedValueOnce(
      new MockApiClientError(500, { code: 'INTERNAL_ERROR' }),
    );

    const { result } = renderHook(() => useDocumentLinks('work_item', 'wi-abc'));

    await waitFor(() => expect(result.current.error).toBe('Failed to load documents.'));
    expect(result.current.isLoading).toBe(false);
  });

  it('sets error string on NetworkError', async () => {
    mockListDocumentLinks.mockRejectedValueOnce(new MockNetworkError('Network request failed'));

    const { result } = renderHook(() => useDocumentLinks('work_item', 'wi-abc'));

    await waitFor(() => expect(result.current.error).toContain('Network error'));
    expect(result.current.isLoading).toBe(false);
  });

  it('sets generic error message on unknown error', async () => {
    mockListDocumentLinks.mockRejectedValueOnce(new Error('Something unexpected'));

    const { result } = renderHook(() => useDocumentLinks('work_item', 'wi-abc'));

    await waitFor(() => expect(result.current.error).toBe('An unexpected error occurred.'));
    expect(result.current.isLoading).toBe(false);
  });

  it('calls listDocumentLinks with invoice entityType and entityId', async () => {
    mockListDocumentLinks.mockResolvedValueOnce([]);

    const { result } = renderHook(() => useDocumentLinks('invoice', 'inv-xyz'));

    // Wait for both the mock call and state to settle
    await waitFor(() => {
      expect(mockListDocumentLinks).toHaveBeenCalledWith('invoice', 'inv-xyz');
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.links).toEqual([]);
  });

  describe('refresh()', () => {
    it('increments fetch count to trigger a new fetch', async () => {
      mockListDocumentLinks.mockResolvedValue([]);

      const { result } = renderHook(() => useDocumentLinks('work_item', 'wi-abc'));

      // Wait for initial load to complete
      await waitFor(() => expect(mockListDocumentLinks).toHaveBeenCalledTimes(1));

      const callsBefore = mockListDocumentLinks.mock.calls.length;

      act(() => {
        result.current.refresh();
      });

      await waitFor(() =>
        expect(mockListDocumentLinks.mock.calls.length).toBeGreaterThan(callsBefore),
      );
    });

    it('fetches fresh data after refresh', async () => {
      mockListDocumentLinks.mockResolvedValueOnce([]);
      const { result } = renderHook(() => useDocumentLinks('work_item', 'wi-abc'));

      // Wait for initial load to complete
      await waitFor(() => expect(mockListDocumentLinks).toHaveBeenCalledTimes(1));

      const newLinks = [makeLink('link-new', 77)];
      mockListDocumentLinks.mockResolvedValueOnce(newLinks);

      act(() => {
        result.current.refresh();
      });

      await waitFor(() => expect(result.current.links).toEqual(newLinks));
    });
  });

  describe('addLink()', () => {
    it('calls createDocumentLink with correct args and work_item entityType', async () => {
      mockListDocumentLinks.mockResolvedValue([]);
      mockCreateDocumentLink.mockResolvedValueOnce({
        id: 'link-new',
        entityType: 'work_item',
        entityId: 'wi-abc',
        paperlessDocumentId: 42,
        createdBy: null,
        createdAt: '2026-01-01T00:00:00Z',
      });

      const { result } = renderHook(() => useDocumentLinks('work_item', 'wi-abc'));

      // Wait for initial load before calling addLink
      await waitFor(() => expect(mockListDocumentLinks).toHaveBeenCalledTimes(1));

      await act(async () => {
        await result.current.addLink(42);
      });

      expect(mockCreateDocumentLink).toHaveBeenCalledWith({
        entityType: 'work_item',
        entityId: 'wi-abc',
        paperlessDocumentId: 42,
      });
    });

    it('calls createDocumentLink with invoice entityType and entityId', async () => {
      mockListDocumentLinks.mockResolvedValue([]);
      mockCreateDocumentLink.mockResolvedValueOnce({
        id: 'link-new',
        entityType: 'invoice',
        entityId: 'inv-xyz',
        paperlessDocumentId: 42,
        createdBy: null,
        createdAt: '2026-01-01T00:00:00Z',
      });

      const { result } = renderHook(() => useDocumentLinks('invoice', 'inv-xyz'));

      // Wait for initial load before calling addLink
      await waitFor(() => expect(mockListDocumentLinks).toHaveBeenCalledTimes(1));

      await act(async () => {
        await result.current.addLink(42);
      });

      expect(mockCreateDocumentLink).toHaveBeenCalledWith({
        entityType: 'invoice',
        entityId: 'inv-xyz',
        paperlessDocumentId: 42,
      });
    });

    it('refreshes the list after successful addLink', async () => {
      const newLink = makeLink('link-added', 42);
      mockListDocumentLinks
        .mockResolvedValueOnce([]) // initial load
        .mockResolvedValueOnce([newLink]); // after add
      mockCreateDocumentLink.mockResolvedValueOnce({
        id: 'link-added',
        entityType: 'work_item',
        entityId: 'wi-abc',
        paperlessDocumentId: 42,
        createdBy: null,
        createdAt: '2026-01-01T00:00:00Z',
      });

      const { result } = renderHook(() => useDocumentLinks('work_item', 'wi-abc'));

      // Wait for initial load before calling addLink
      await waitFor(() => expect(mockListDocumentLinks).toHaveBeenCalledTimes(1));

      await act(async () => {
        await result.current.addLink(42);
      });

      await waitFor(() => expect(result.current.links).toEqual([newLink]));
    });

    it('re-throws when createDocumentLink rejects with DUPLICATE_DOCUMENT_LINK', async () => {
      mockListDocumentLinks.mockResolvedValue([]);
      mockCreateDocumentLink.mockRejectedValueOnce(
        new MockApiClientError(409, { code: 'DUPLICATE_DOCUMENT_LINK', message: 'Already linked' }),
      );

      const { result } = renderHook(() => useDocumentLinks('work_item', 'wi-abc'));

      // Wait for initial load before calling addLink
      await waitFor(() => expect(mockListDocumentLinks).toHaveBeenCalledTimes(1));

      let thrownError: unknown;
      await act(async () => {
        try {
          await result.current.addLink(42);
        } catch (err) {
          thrownError = err;
        }
      });

      expect(thrownError).toBeInstanceOf(MockApiClientError);
      expect((thrownError as MockApiClientError).error.code).toBe('DUPLICATE_DOCUMENT_LINK');
    });

    it('re-throws when createDocumentLink rejects with any error', async () => {
      mockListDocumentLinks.mockResolvedValue([]);
      mockCreateDocumentLink.mockRejectedValueOnce(new Error('Network failure'));

      const { result } = renderHook(() => useDocumentLinks('work_item', 'wi-abc'));

      // Wait for initial load before calling addLink
      await waitFor(() => expect(mockListDocumentLinks).toHaveBeenCalledTimes(1));

      let thrownError: unknown;
      await act(async () => {
        try {
          await result.current.addLink(99);
        } catch (err) {
          thrownError = err;
        }
      });

      expect(thrownError).toBeInstanceOf(Error);
    });
  });

  describe('removeLink()', () => {
    it('calls deleteDocumentLink with the correct linkId', async () => {
      const existingLink = makeLink('link-1', 42);
      mockListDocumentLinks.mockResolvedValue([existingLink]);
      mockDeleteDocumentLink.mockResolvedValueOnce(undefined);

      const { result } = renderHook(() => useDocumentLinks('work_item', 'wi-abc'));
      await waitFor(() => expect(result.current.links).toHaveLength(1));

      await act(async () => {
        await result.current.removeLink('link-1');
      });

      expect(mockDeleteDocumentLink).toHaveBeenCalledWith('link-1');
    });

    it('optimistically removes the link from local state immediately after delete', async () => {
      const link1 = makeLink('link-1', 42);
      const link2 = makeLink('link-2', 99);
      mockListDocumentLinks.mockResolvedValue([link1, link2]);
      mockDeleteDocumentLink.mockResolvedValueOnce(undefined);

      const { result } = renderHook(() => useDocumentLinks('work_item', 'wi-abc'));
      await waitFor(() => expect(result.current.links).toHaveLength(2));

      await act(async () => {
        await result.current.removeLink('link-1');
      });

      expect(result.current.links).toHaveLength(1);
      expect(result.current.links[0].id).toBe('link-2');
    });

    it('removes only the targeted link when multiple links are present', async () => {
      const link1 = makeLink('link-1', 42);
      const link2 = makeLink('link-2', 99);
      const link3 = makeLink('link-3', 7);
      mockListDocumentLinks.mockResolvedValue([link1, link2, link3]);
      mockDeleteDocumentLink.mockResolvedValueOnce(undefined);

      const { result } = renderHook(() => useDocumentLinks('work_item', 'wi-abc'));
      await waitFor(() => expect(result.current.links).toHaveLength(3));

      await act(async () => {
        await result.current.removeLink('link-2');
      });

      expect(result.current.links).toHaveLength(2);
      expect(result.current.links.map((l) => l.id)).toEqual(['link-1', 'link-3']);
    });
  });
});
