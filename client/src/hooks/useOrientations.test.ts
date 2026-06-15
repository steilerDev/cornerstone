import { renderHook, act, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';

const mockFetchOrientations = jest.fn<() => Promise<unknown>>();
const mockCreateOrientation = jest.fn<() => Promise<unknown>>();
const mockUpdateOrientation = jest.fn<() => Promise<unknown>>();
const mockDeleteOrientation = jest.fn<() => Promise<unknown>>();

jest.unstable_mockModule('../lib/orientationApi.js', () => ({
  fetchOrientations: mockFetchOrientations,
  createOrientation: mockCreateOrientation,
  updateOrientation: mockUpdateOrientation,
  deleteOrientation: mockDeleteOrientation,
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

import type * as UseOrientationsModule from './useOrientations.js';
let useOrientations: (typeof UseOrientationsModule)['useOrientations'];

const makeOrientation = (id = 'orient-1', name = 'South') => ({
  id,
  name,
  description: null,
  sortOrder: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

beforeEach(async () => {
  ({ useOrientations } = (await import('./useOrientations.js')) as typeof UseOrientationsModule);
  mockFetchOrientations.mockReset();
  mockCreateOrientation.mockReset();
  mockUpdateOrientation.mockReset();
  mockDeleteOrientation.mockReset();
  mockFetchOrientations.mockResolvedValue({ orientations: [] });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('useOrientations', () => {
  it('starts with isLoading=true before fetch completes', () => {
    mockFetchOrientations.mockImplementationOnce(() => new Promise(() => {}));

    const { result } = renderHook(() => useOrientations());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.orientations).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('fetches orientations on mount and stores results', async () => {
    const orientations = [makeOrientation('o1', 'South'), makeOrientation('o2', 'North')];
    mockFetchOrientations.mockResolvedValueOnce({ orientations });

    const { result } = renderHook(() => useOrientations());

    await waitFor(() => expect(result.current.orientations).toEqual(orientations));
    expect(mockFetchOrientations).toHaveBeenCalledTimes(1);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('sets isLoading=false after fetch completes', async () => {
    mockFetchOrientations.mockResolvedValueOnce({ orientations: [makeOrientation()] });

    const { result } = renderHook(() => useOrientations());

    await waitFor(() => expect(result.current.orientations).toHaveLength(1));
    expect(result.current.isLoading).toBe(false);
  });

  it('sets error string and isLoading=false on ApiClientError; orientations stays empty', async () => {
    mockFetchOrientations.mockRejectedValueOnce(
      new MockApiClientError(500, { code: 'INTERNAL_ERROR', message: 'Server error' }),
    );

    const { result } = renderHook(() => useOrientations());

    await waitFor(() => expect(result.current.error).toBe('Server error'));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.orientations).toEqual([]);
  });

  it('uses fallback error message when ApiClientError has no message', async () => {
    mockFetchOrientations.mockRejectedValueOnce(
      new MockApiClientError(401, { code: 'UNAUTHORIZED' }),
    );

    const { result } = renderHook(() => useOrientations());

    await waitFor(() => expect(result.current.error).toBe('Failed to load orientations.'));
    expect(result.current.isLoading).toBe(false);
  });

  it('sets Network error message on NetworkError', async () => {
    mockFetchOrientations.mockRejectedValueOnce(new MockNetworkError('Network request failed'));

    const { result } = renderHook(() => useOrientations());

    await waitFor(() =>
      expect(result.current.error).toBe('Network error: Unable to connect to the server.'),
    );
    expect(result.current.isLoading).toBe(false);
  });

  it('sets generic error message on unknown error', async () => {
    mockFetchOrientations.mockRejectedValueOnce(new Error('Unexpected failure'));

    const { result } = renderHook(() => useOrientations());

    await waitFor(() =>
      expect(result.current.error).toBe('An unexpected error occurred while loading orientations.'),
    );
    expect(result.current.isLoading).toBe(false);
  });

  describe('refetch()', () => {
    it('triggers a new fetch when called', async () => {
      mockFetchOrientations.mockResolvedValue({ orientations: [] });

      const { result } = renderHook(() => useOrientations());

      await waitFor(() => expect(mockFetchOrientations).toHaveBeenCalledTimes(1));

      const callsBefore = mockFetchOrientations.mock.calls.length;

      act(() => {
        result.current.refetch();
      });

      await waitFor(() =>
        expect(mockFetchOrientations.mock.calls.length).toBeGreaterThan(callsBefore),
      );
    });
  });

  describe('createOrientation()', () => {
    it('calls createOrientation with the correct data and returns the orientation', async () => {
      const newOrientation = makeOrientation('o-new', 'East');
      mockCreateOrientation.mockResolvedValueOnce(newOrientation);
      mockFetchOrientations.mockResolvedValue({ orientations: [] });

      const { result } = renderHook(() => useOrientations());
      await waitFor(() => expect(mockFetchOrientations).toHaveBeenCalledTimes(1));

      let createdOrientation: unknown;
      await act(async () => {
        createdOrientation = await result.current.createOrientation({ name: 'East' });
      });

      expect(mockCreateOrientation).toHaveBeenCalledWith({ name: 'East' });
      expect(createdOrientation).toEqual(newOrientation);
    });

    it('triggers a refetch after successful create', async () => {
      mockCreateOrientation.mockResolvedValueOnce(makeOrientation('o-new', 'East'));
      mockFetchOrientations.mockResolvedValue({ orientations: [] });

      const { result } = renderHook(() => useOrientations());
      await waitFor(() => expect(mockFetchOrientations).toHaveBeenCalledTimes(1));

      await act(async () => {
        await result.current.createOrientation({ name: 'East' });
      });

      await waitFor(() => expect(mockFetchOrientations).toHaveBeenCalledTimes(2));
    });

    it('returns null when createOrientation throws', async () => {
      mockCreateOrientation.mockRejectedValueOnce(new Error('Conflict'));
      mockFetchOrientations.mockResolvedValue({ orientations: [] });

      const { result } = renderHook(() => useOrientations());
      await waitFor(() => expect(mockFetchOrientations).toHaveBeenCalledTimes(1));

      let returned: unknown;
      await act(async () => {
        returned = await result.current.createOrientation({ name: 'South' });
      });

      expect(returned).toBeNull();
    });
  });

  describe('updateOrientation()', () => {
    it('calls updateOrientation with the correct id and data and returns the orientation', async () => {
      const updatedOrientation = makeOrientation('o1', 'Updated South');
      mockUpdateOrientation.mockResolvedValueOnce(updatedOrientation);
      mockFetchOrientations.mockResolvedValue({ orientations: [] });

      const { result } = renderHook(() => useOrientations());
      await waitFor(() => expect(mockFetchOrientations).toHaveBeenCalledTimes(1));

      let returned: unknown;
      await act(async () => {
        returned = await result.current.updateOrientation('o1', { name: 'Updated South' });
      });

      expect(mockUpdateOrientation).toHaveBeenCalledWith('o1', { name: 'Updated South' });
      expect(returned).toEqual(updatedOrientation);
    });

    it('triggers a refetch after successful update', async () => {
      mockUpdateOrientation.mockResolvedValueOnce(makeOrientation('o1', 'Updated'));
      mockFetchOrientations.mockResolvedValue({ orientations: [] });

      const { result } = renderHook(() => useOrientations());
      await waitFor(() => expect(mockFetchOrientations).toHaveBeenCalledTimes(1));

      await act(async () => {
        await result.current.updateOrientation('o1', { name: 'Updated' });
      });

      await waitFor(() => expect(mockFetchOrientations).toHaveBeenCalledTimes(2));
    });

    it('returns null when updateOrientation throws', async () => {
      mockUpdateOrientation.mockRejectedValueOnce(new Error('Not found'));
      mockFetchOrientations.mockResolvedValue({ orientations: [] });

      const { result } = renderHook(() => useOrientations());
      await waitFor(() => expect(mockFetchOrientations).toHaveBeenCalledTimes(1));

      let returned: unknown;
      await act(async () => {
        returned = await result.current.updateOrientation('nonexistent', { name: 'Updated' });
      });

      expect(returned).toBeNull();
    });
  });

  describe('deleteOrientation()', () => {
    it('calls deleteOrientation with the correct id and returns true', async () => {
      mockDeleteOrientation.mockResolvedValueOnce(undefined);
      mockFetchOrientations.mockResolvedValue({ orientations: [] });

      const { result } = renderHook(() => useOrientations());
      await waitFor(() => expect(mockFetchOrientations).toHaveBeenCalledTimes(1));

      let returned: unknown;
      await act(async () => {
        returned = await result.current.deleteOrientation('o1');
      });

      expect(mockDeleteOrientation).toHaveBeenCalledWith('o1');
      expect(returned).toBe(true);
    });

    it('triggers a refetch after successful delete', async () => {
      mockDeleteOrientation.mockResolvedValueOnce(undefined);
      mockFetchOrientations.mockResolvedValue({ orientations: [] });

      const { result } = renderHook(() => useOrientations());
      await waitFor(() => expect(mockFetchOrientations).toHaveBeenCalledTimes(1));

      await act(async () => {
        await result.current.deleteOrientation('o1');
      });

      await waitFor(() => expect(mockFetchOrientations).toHaveBeenCalledTimes(2));
    });

    it('returns false when deleteOrientation throws', async () => {
      mockDeleteOrientation.mockRejectedValueOnce(new Error('In use'));
      mockFetchOrientations.mockResolvedValue({ orientations: [] });

      const { result } = renderHook(() => useOrientations());
      await waitFor(() => expect(mockFetchOrientations).toHaveBeenCalledTimes(1));

      let returned: unknown;
      await act(async () => {
        returned = await result.current.deleteOrientation('o1');
      });

      expect(returned).toBe(false);
    });
  });
});
