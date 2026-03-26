import { renderHook, act, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';

const mockFetchAreas = jest.fn<() => Promise<unknown>>();
const mockCreateArea = jest.fn<() => Promise<unknown>>();
const mockUpdateArea = jest.fn<() => Promise<unknown>>();
const mockDeleteArea = jest.fn<() => Promise<unknown>>();

jest.unstable_mockModule('../lib/areasApi.js', () => ({
  fetchAreas: mockFetchAreas,
  createArea: mockCreateArea,
  updateArea: mockUpdateArea,
  deleteArea: mockDeleteArea,
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

import type * as UseAreasModule from './useAreas.js';

let useAreas: (typeof UseAreasModule)['useAreas'];

const makeArea = (id = 'area-1', name = 'Kitchen') => ({
  id,
  name,
  parentId: null,
  color: null,
  description: null,
  sortOrder: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

beforeEach(async () => {
  ({ useAreas } = (await import('./useAreas.js')) as typeof UseAreasModule);
  mockFetchAreas.mockReset();
  mockCreateArea.mockReset();
  mockUpdateArea.mockReset();
  mockDeleteArea.mockReset();

  // Default: returns empty list
  mockFetchAreas.mockResolvedValue({ areas: [] });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('useAreas', () => {
  it('starts with isLoading=true before fetch completes', () => {
    mockFetchAreas.mockImplementationOnce(() => new Promise(() => {}));

    const { result } = renderHook(() => useAreas());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.areas).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('fetches areas on mount and stores results', async () => {
    const areas = [makeArea('a1', 'Kitchen'), makeArea('a2', 'Bathroom')];
    mockFetchAreas.mockResolvedValueOnce({ areas });

    const { result } = renderHook(() => useAreas());

    await waitFor(() => expect(result.current.areas).toEqual(areas));
    expect(mockFetchAreas).toHaveBeenCalledTimes(1);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('sets isLoading=false after fetch completes', async () => {
    mockFetchAreas.mockResolvedValueOnce({ areas: [makeArea()] });

    const { result } = renderHook(() => useAreas());

    await waitFor(() => expect(result.current.areas).toHaveLength(1));
    expect(result.current.isLoading).toBe(false);
  });

  it('sets error string and isLoading=false on ApiClientError; areas stays empty', async () => {
    mockFetchAreas.mockRejectedValueOnce(
      new MockApiClientError(500, { code: 'INTERNAL_ERROR', message: 'Server error' }),
    );

    const { result } = renderHook(() => useAreas());

    await waitFor(() => expect(result.current.error).toBe('Server error'));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.areas).toEqual([]);
  });

  it('uses fallback error message when ApiClientError has no message', async () => {
    mockFetchAreas.mockRejectedValueOnce(
      new MockApiClientError(401, { code: 'UNAUTHORIZED' }),
    );

    const { result } = renderHook(() => useAreas());

    await waitFor(() => expect(result.current.error).toBe('Failed to load areas.'));
    expect(result.current.isLoading).toBe(false);
  });

  it('sets Network error message on NetworkError', async () => {
    mockFetchAreas.mockRejectedValueOnce(new MockNetworkError('Network request failed'));

    const { result } = renderHook(() => useAreas());

    await waitFor(() =>
      expect(result.current.error).toBe('Network error: Unable to connect to the server.'),
    );
    expect(result.current.isLoading).toBe(false);
  });

  it('sets generic error message on unknown error', async () => {
    mockFetchAreas.mockRejectedValueOnce(new Error('Something unexpected'));

    const { result } = renderHook(() => useAreas());

    await waitFor(() =>
      expect(result.current.error).toBe('An unexpected error occurred while loading areas.'),
    );
    expect(result.current.isLoading).toBe(false);
  });

  describe('refetch()', () => {
    it('triggers a new fetch when called', async () => {
      mockFetchAreas.mockResolvedValue({ areas: [] });

      const { result } = renderHook(() => useAreas());

      await waitFor(() => expect(mockFetchAreas).toHaveBeenCalledTimes(1));

      const callsBefore = mockFetchAreas.mock.calls.length;

      act(() => {
        result.current.refetch();
      });

      await waitFor(() =>
        expect(mockFetchAreas.mock.calls.length).toBeGreaterThan(callsBefore),
      );
    });

    it('fetches fresh data after refetch', async () => {
      mockFetchAreas.mockResolvedValueOnce({ areas: [] });

      const { result } = renderHook(() => useAreas());
      await waitFor(() => expect(mockFetchAreas).toHaveBeenCalledTimes(1));

      const newAreas = [makeArea('a1', 'New Area')];
      mockFetchAreas.mockResolvedValueOnce({ areas: newAreas });

      act(() => {
        result.current.refetch();
      });

      await waitFor(() => expect(result.current.areas).toEqual(newAreas));
    });
  });

  describe('createArea()', () => {
    it('calls createArea with the correct data', async () => {
      const newArea = makeArea('a-new', 'Garage');
      mockCreateArea.mockResolvedValueOnce(newArea);
      mockFetchAreas.mockResolvedValue({ areas: [] });

      const { result } = renderHook(() => useAreas());
      await waitFor(() => expect(mockFetchAreas).toHaveBeenCalledTimes(1));

      await act(async () => {
        await result.current.createArea({ name: 'Garage' });
      });

      expect(mockCreateArea).toHaveBeenCalledWith({ name: 'Garage' });
    });

    it('returns the created area on success', async () => {
      const newArea = makeArea('a-new', 'Garage');
      mockCreateArea.mockResolvedValueOnce(newArea);
      mockFetchAreas.mockResolvedValue({ areas: [newArea] });

      const { result } = renderHook(() => useAreas());
      await waitFor(() => expect(mockFetchAreas).toHaveBeenCalledTimes(1));

      let createdArea: unknown;
      await act(async () => {
        createdArea = await result.current.createArea({ name: 'Garage' });
      });

      expect(createdArea).toEqual(newArea);
    });

    it('triggers a refetch after successful create', async () => {
      mockCreateArea.mockResolvedValueOnce(makeArea('a-new', 'Garage'));
      mockFetchAreas.mockResolvedValue({ areas: [] });

      const { result } = renderHook(() => useAreas());
      await waitFor(() => expect(mockFetchAreas).toHaveBeenCalledTimes(1));

      await act(async () => {
        await result.current.createArea({ name: 'Garage' });
      });

      await waitFor(() => expect(mockFetchAreas).toHaveBeenCalledTimes(2));
    });

    it('returns null when createArea throws', async () => {
      mockCreateArea.mockRejectedValueOnce(new Error('Failed to create'));
      mockFetchAreas.mockResolvedValue({ areas: [] });

      const { result } = renderHook(() => useAreas());
      await waitFor(() => expect(mockFetchAreas).toHaveBeenCalledTimes(1));

      let returnedValue: unknown;
      await act(async () => {
        returnedValue = await result.current.createArea({ name: 'Garage' });
      });

      expect(returnedValue).toBeNull();
    });
  });

  describe('updateArea()', () => {
    it('calls updateArea with the correct id and data', async () => {
      const updatedArea = makeArea('a1', 'Updated Kitchen');
      mockUpdateArea.mockResolvedValueOnce(updatedArea);
      mockFetchAreas.mockResolvedValue({ areas: [] });

      const { result } = renderHook(() => useAreas());
      await waitFor(() => expect(mockFetchAreas).toHaveBeenCalledTimes(1));

      await act(async () => {
        await result.current.updateArea('a1', { name: 'Updated Kitchen' });
      });

      expect(mockUpdateArea).toHaveBeenCalledWith('a1', { name: 'Updated Kitchen' });
    });

    it('returns the updated area on success', async () => {
      const updatedArea = makeArea('a1', 'Updated Kitchen');
      mockUpdateArea.mockResolvedValueOnce(updatedArea);
      mockFetchAreas.mockResolvedValue({ areas: [updatedArea] });

      const { result } = renderHook(() => useAreas());
      await waitFor(() => expect(mockFetchAreas).toHaveBeenCalledTimes(1));

      let returned: unknown;
      await act(async () => {
        returned = await result.current.updateArea('a1', { name: 'Updated Kitchen' });
      });

      expect(returned).toEqual(updatedArea);
    });

    it('triggers a refetch after successful update', async () => {
      mockUpdateArea.mockResolvedValueOnce(makeArea('a1', 'Updated'));
      mockFetchAreas.mockResolvedValue({ areas: [] });

      const { result } = renderHook(() => useAreas());
      await waitFor(() => expect(mockFetchAreas).toHaveBeenCalledTimes(1));

      await act(async () => {
        await result.current.updateArea('a1', { name: 'Updated' });
      });

      await waitFor(() => expect(mockFetchAreas).toHaveBeenCalledTimes(2));
    });

    it('returns null when updateArea throws', async () => {
      mockUpdateArea.mockRejectedValueOnce(new Error('Not found'));
      mockFetchAreas.mockResolvedValue({ areas: [] });

      const { result } = renderHook(() => useAreas());
      await waitFor(() => expect(mockFetchAreas).toHaveBeenCalledTimes(1));

      let returned: unknown;
      await act(async () => {
        returned = await result.current.updateArea('nonexistent', { name: 'Updated' });
      });

      expect(returned).toBeNull();
    });
  });

  describe('deleteArea()', () => {
    it('calls deleteArea with the correct id', async () => {
      mockDeleteArea.mockResolvedValueOnce(undefined);
      mockFetchAreas.mockResolvedValue({ areas: [] });

      const { result } = renderHook(() => useAreas());
      await waitFor(() => expect(mockFetchAreas).toHaveBeenCalledTimes(1));

      await act(async () => {
        await result.current.deleteArea('a1');
      });

      expect(mockDeleteArea).toHaveBeenCalledWith('a1');
    });

    it('returns true on successful delete', async () => {
      mockDeleteArea.mockResolvedValueOnce(undefined);
      mockFetchAreas.mockResolvedValue({ areas: [] });

      const { result } = renderHook(() => useAreas());
      await waitFor(() => expect(mockFetchAreas).toHaveBeenCalledTimes(1));

      let returned: unknown;
      await act(async () => {
        returned = await result.current.deleteArea('a1');
      });

      expect(returned).toBe(true);
    });

    it('triggers a refetch after successful delete', async () => {
      mockDeleteArea.mockResolvedValueOnce(undefined);
      mockFetchAreas.mockResolvedValue({ areas: [] });

      const { result } = renderHook(() => useAreas());
      await waitFor(() => expect(mockFetchAreas).toHaveBeenCalledTimes(1));

      await act(async () => {
        await result.current.deleteArea('a1');
      });

      await waitFor(() => expect(mockFetchAreas).toHaveBeenCalledTimes(2));
    });

    it('returns false when deleteArea throws', async () => {
      mockDeleteArea.mockRejectedValueOnce(new Error('In use'));
      mockFetchAreas.mockResolvedValue({ areas: [] });

      const { result } = renderHook(() => useAreas());
      await waitFor(() => expect(mockFetchAreas).toHaveBeenCalledTimes(1));

      let returned: unknown;
      await act(async () => {
        returned = await result.current.deleteArea('a1');
      });

      expect(returned).toBe(false);
    });
  });
});
