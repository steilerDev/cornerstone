import { renderHook, act, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';

const mockListPreferences = jest.fn<() => Promise<unknown>>();
const mockUpsertPreference = jest.fn<() => Promise<unknown>>();
const mockDeletePreference = jest.fn<() => Promise<unknown>>();

jest.unstable_mockModule('../lib/preferencesApi.js', () => ({
  listPreferences: mockListPreferences,
  upsertPreference: mockUpsertPreference,
  deletePreference: mockDeletePreference,
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

import type * as UsePreferencesModule from './usePreferences.js';

let usePreferences: (typeof UsePreferencesModule)['usePreferences'];

const makePref = (key: string, value: string) => ({
  key,
  value,
  updatedAt: '2026-01-01T00:00:00Z',
});

beforeEach(async () => {
  ({ usePreferences } = (await import('./usePreferences.js')) as typeof UsePreferencesModule);
  mockListPreferences.mockReset();
  mockUpsertPreference.mockReset();
  mockDeletePreference.mockReset();

  // Default: returns empty list
  mockListPreferences.mockResolvedValue([]);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('usePreferences', () => {
  it('starts with isLoading=true before fetch completes', () => {
    mockListPreferences.mockImplementationOnce(() => new Promise(() => {}));

    const { result } = renderHook(() => usePreferences());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.preferences).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('fetches preferences on mount and stores results in preferences', async () => {
    const prefs = [makePref('theme', 'dark'), makePref('dashboard.hiddenCards', '[]')];
    mockListPreferences.mockResolvedValueOnce(prefs);

    const { result } = renderHook(() => usePreferences());

    await waitFor(() => expect(result.current.preferences).toEqual(prefs));

    expect(mockListPreferences).toHaveBeenCalledTimes(1);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('sets isLoading=false after fetch completes', async () => {
    mockListPreferences.mockResolvedValueOnce([makePref('theme', 'light')]);

    const { result } = renderHook(() => usePreferences());

    await waitFor(() => expect(result.current.preferences).toHaveLength(1));
    expect(result.current.isLoading).toBe(false);
  });

  it('sets error string and isLoading=false on ApiClientError; preferences stays empty', async () => {
    mockListPreferences.mockRejectedValueOnce(
      new MockApiClientError(500, { code: 'INTERNAL_ERROR', message: 'Server error' }),
    );

    const { result } = renderHook(() => usePreferences());

    await waitFor(() => expect(result.current.error).toBe('Server error'));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.preferences).toEqual([]);
  });

  it('uses fallback error message when ApiClientError has no message', async () => {
    mockListPreferences.mockRejectedValueOnce(
      new MockApiClientError(401, { code: 'UNAUTHORIZED' }),
    );

    const { result } = renderHook(() => usePreferences());

    await waitFor(() => expect(result.current.error).toBe('Failed to load preferences.'));
    expect(result.current.isLoading).toBe(false);
  });

  it('sets Network error message on NetworkError', async () => {
    mockListPreferences.mockRejectedValueOnce(new MockNetworkError('Network request failed'));

    const { result } = renderHook(() => usePreferences());

    await waitFor(() =>
      expect(result.current.error).toBe('Network error: Unable to connect to the server.'),
    );
    expect(result.current.isLoading).toBe(false);
  });

  it('sets generic error message on unknown error', async () => {
    mockListPreferences.mockRejectedValueOnce(new Error('Something unexpected'));

    const { result } = renderHook(() => usePreferences());

    await waitFor(() => expect(result.current.error).toBe('An unexpected error occurred.'));
    expect(result.current.isLoading).toBe(false);
  });

  describe('refresh()', () => {
    it('increments fetch count to trigger a new fetch', async () => {
      mockListPreferences.mockResolvedValue([]);

      const { result } = renderHook(() => usePreferences());

      await waitFor(() => expect(mockListPreferences).toHaveBeenCalledTimes(1));

      const callsBefore = mockListPreferences.mock.calls.length;

      act(() => {
        result.current.refresh();
      });

      await waitFor(() =>
        expect(mockListPreferences.mock.calls.length).toBeGreaterThan(callsBefore),
      );
    });

    it('fetches fresh data after refresh', async () => {
      mockListPreferences.mockResolvedValueOnce([]);

      const { result } = renderHook(() => usePreferences());
      await waitFor(() => expect(mockListPreferences).toHaveBeenCalledTimes(1));

      const newPrefs = [makePref('theme', 'dark')];
      mockListPreferences.mockResolvedValueOnce(newPrefs);

      act(() => {
        result.current.refresh();
      });

      await waitFor(() => expect(result.current.preferences).toEqual(newPrefs));
    });
  });

  describe('upsert()', () => {
    it('calls upsertPreference with the correct key and value', async () => {
      const newPref = makePref('theme', 'dark');
      mockUpsertPreference.mockResolvedValueOnce(newPref);
      mockListPreferences.mockResolvedValue([]);

      const { result } = renderHook(() => usePreferences());
      await waitFor(() => expect(mockListPreferences).toHaveBeenCalledTimes(1));

      await act(async () => {
        await result.current.upsert('theme', 'dark');
      });

      expect(mockUpsertPreference).toHaveBeenCalledWith('theme', 'dark');
    });

    it('optimistically adds a new preference to local state', async () => {
      mockUpsertPreference.mockResolvedValueOnce(makePref('theme', 'dark'));
      mockListPreferences.mockResolvedValue([]);

      const { result } = renderHook(() => usePreferences());
      await waitFor(() => expect(mockListPreferences).toHaveBeenCalledTimes(1));

      await act(async () => {
        await result.current.upsert('theme', 'dark');
      });

      expect(result.current.preferences).toHaveLength(1);
      expect(result.current.preferences[0].key).toBe('theme');
      expect(result.current.preferences[0].value).toBe('dark');
    });

    it('optimistically updates an existing preference in local state', async () => {
      const initialPref = makePref('theme', 'light');
      mockListPreferences.mockResolvedValueOnce([initialPref]);
      mockUpsertPreference.mockResolvedValueOnce(makePref('theme', 'dark'));

      const { result } = renderHook(() => usePreferences());
      await waitFor(() => expect(result.current.preferences).toHaveLength(1));

      await act(async () => {
        await result.current.upsert('theme', 'dark');
      });

      expect(result.current.preferences).toHaveLength(1);
      expect(result.current.preferences[0].key).toBe('theme');
      expect(result.current.preferences[0].value).toBe('dark');
    });

    it('re-throws when upsertPreference rejects', async () => {
      mockListPreferences.mockResolvedValue([]);
      mockUpsertPreference.mockRejectedValueOnce(new Error('Network failure'));

      const { result } = renderHook(() => usePreferences());
      await waitFor(() => expect(mockListPreferences).toHaveBeenCalledTimes(1));

      let thrownError: unknown;
      await act(async () => {
        try {
          await result.current.upsert('theme', 'dark');
        } catch (err) {
          thrownError = err;
        }
      });

      expect(thrownError).toBeInstanceOf(Error);
    });

    it('does not modify state when upsertPreference rejects (optimistic update skipped)', async () => {
      mockListPreferences.mockResolvedValueOnce([makePref('theme', 'light')]);
      mockUpsertPreference.mockRejectedValueOnce(new Error('Network failure'));

      const { result } = renderHook(() => usePreferences());
      await waitFor(() => expect(result.current.preferences).toHaveLength(1));

      await act(async () => {
        try {
          await result.current.upsert('theme', 'dark');
        } catch {
          // expected
        }
      });

      // State should remain unchanged since upsert failed before optimistic update
      expect(result.current.preferences[0].value).toBe('light');
    });
  });

  describe('remove()', () => {
    it('calls deletePreference with the correct key', async () => {
      mockListPreferences.mockResolvedValueOnce([makePref('theme', 'dark')]);
      mockDeletePreference.mockResolvedValueOnce(undefined);

      const { result } = renderHook(() => usePreferences());
      await waitFor(() => expect(result.current.preferences).toHaveLength(1));

      await act(async () => {
        await result.current.remove('theme');
      });

      expect(mockDeletePreference).toHaveBeenCalledWith('theme');
    });

    it('optimistically removes the preference from local state', async () => {
      const prefs = [makePref('theme', 'dark'), makePref('dashboard.hiddenCards', '[]')];
      mockListPreferences.mockResolvedValueOnce(prefs);
      mockDeletePreference.mockResolvedValueOnce(undefined);

      const { result } = renderHook(() => usePreferences());
      await waitFor(() => expect(result.current.preferences).toHaveLength(2));

      await act(async () => {
        await result.current.remove('theme');
      });

      expect(result.current.preferences).toHaveLength(1);
      expect(result.current.preferences[0].key).toBe('dashboard.hiddenCards');
    });

    it('removes only the targeted preference when multiple exist', async () => {
      const prefs = [
        makePref('theme', 'dark'),
        makePref('dashboard.hiddenCards', '[]'),
        makePref('other', 'value'),
      ];
      mockListPreferences.mockResolvedValueOnce(prefs);
      mockDeletePreference.mockResolvedValueOnce(undefined);

      const { result } = renderHook(() => usePreferences());
      await waitFor(() => expect(result.current.preferences).toHaveLength(3));

      await act(async () => {
        await result.current.remove('dashboard.hiddenCards');
      });

      expect(result.current.preferences).toHaveLength(2);
      expect(result.current.preferences.map((p) => p.key)).toEqual(['theme', 'other']);
    });

    it('re-throws when deletePreference rejects', async () => {
      mockListPreferences.mockResolvedValueOnce([makePref('theme', 'dark')]);
      mockDeletePreference.mockRejectedValueOnce(new Error('Not Found'));

      const { result } = renderHook(() => usePreferences());
      await waitFor(() => expect(result.current.preferences).toHaveLength(1));

      let thrownError: unknown;
      await act(async () => {
        try {
          await result.current.remove('theme');
        } catch (err) {
          thrownError = err;
        }
      });

      expect(thrownError).toBeInstanceOf(Error);
    });
  });
});
