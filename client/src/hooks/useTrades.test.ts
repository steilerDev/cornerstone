import { renderHook, act, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';
import enErrors from '../i18n/en/errors.json';
import enCommon from '../i18n/en/common.json';
import enSettings from '../i18n/en/settings.json';

const mockFetchTrades = jest.fn<() => Promise<unknown>>();
const mockCreateTrade = jest.fn<() => Promise<unknown>>();
const mockUpdateTrade = jest.fn<() => Promise<unknown>>();
const mockDeleteTrade = jest.fn<() => Promise<unknown>>();

jest.unstable_mockModule('../lib/tradesApi.js', () => ({
  fetchTrades: mockFetchTrades,
  createTrade: mockCreateTrade,
  updateTrade: mockUpdateTrade,
  deleteTrade: mockDeleteTrade,
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

import type * as UseTradesModule from './useTrades.js';

let useTrades: (typeof UseTradesModule)['useTrades'];

const makeTrade = (id = 'trade-1', name = 'Plumbing') => ({
  id,
  name,
  color: null,
  description: null,
  translationKey: null,
  sortOrder: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

beforeEach(async () => {
  ({ useTrades } = (await import('./useTrades.js')) as typeof UseTradesModule);
  mockFetchTrades.mockReset();
  mockCreateTrade.mockReset();
  mockUpdateTrade.mockReset();
  mockDeleteTrade.mockReset();

  // Default: returns empty list
  mockFetchTrades.mockResolvedValue({ trades: [] });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('useTrades', () => {
  it('starts with isLoading=true before fetch completes', () => {
    mockFetchTrades.mockImplementationOnce(() => new Promise(() => {}));

    const { result } = renderHook(() => useTrades());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.trades).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('fetches trades on mount and stores results', async () => {
    const trades = [makeTrade('t1', 'Plumbing'), makeTrade('t2', 'Electrical')];
    mockFetchTrades.mockResolvedValueOnce({ trades });

    const { result } = renderHook(() => useTrades());

    await waitFor(() => expect(result.current.trades).toEqual(trades));
    expect(mockFetchTrades).toHaveBeenCalledTimes(1);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('sets isLoading=false after fetch completes', async () => {
    mockFetchTrades.mockResolvedValueOnce({ trades: [makeTrade()] });

    const { result } = renderHook(() => useTrades());

    await waitFor(() => expect(result.current.trades).toHaveLength(1));
    expect(result.current.isLoading).toBe(false);
  });

  it('sets error string and isLoading=false on ApiClientError; trades stays empty', async () => {
    mockFetchTrades.mockRejectedValueOnce(
      new MockApiClientError(500, { code: 'INTERNAL_ERROR', message: 'RAW-SERVER-SENTINEL' }),
    );

    const { result } = renderHook(() => useTrades());

    await waitFor(() => expect(result.current.error).toBe(enErrors.INTERNAL_ERROR));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.trades).toEqual([]);
  });

  it('translates the error code when ApiClientError has no message', async () => {
    mockFetchTrades.mockRejectedValueOnce(new MockApiClientError(401, { code: 'UNAUTHORIZED' }));

    const { result } = renderHook(() => useTrades());

    await waitFor(() => expect(result.current.error).toBe(enErrors.UNAUTHORIZED));
    expect(result.current.isLoading).toBe(false);
  });

  it('sets Network error message on NetworkError', async () => {
    mockFetchTrades.mockRejectedValueOnce(new MockNetworkError('Network request failed'));

    const { result } = renderHook(() => useTrades());

    await waitFor(() => expect(result.current.error).toBe(enCommon.requestErrors.network));
    expect(result.current.isLoading).toBe(false);
  });

  it('sets generic error message on unknown error', async () => {
    mockFetchTrades.mockRejectedValueOnce(new Error('Unexpected failure'));

    const { result } = renderHook(() => useTrades());

    await waitFor(() => expect(result.current.error).toBe(enSettings.manage.trades.loadError));
    expect(result.current.isLoading).toBe(false);
  });

  describe('refetch()', () => {
    it('triggers a new fetch when called', async () => {
      mockFetchTrades.mockResolvedValue({ trades: [] });

      const { result } = renderHook(() => useTrades());

      await waitFor(() => expect(mockFetchTrades).toHaveBeenCalledTimes(1));

      const callsBefore = mockFetchTrades.mock.calls.length;

      act(() => {
        result.current.refetch();
      });

      await waitFor(() => expect(mockFetchTrades.mock.calls.length).toBeGreaterThan(callsBefore));
    });

    it('fetches fresh data after refetch', async () => {
      mockFetchTrades.mockResolvedValueOnce({ trades: [] });

      const { result } = renderHook(() => useTrades());
      await waitFor(() => expect(mockFetchTrades).toHaveBeenCalledTimes(1));

      const newTrades = [makeTrade('t1', 'Carpentry')];
      mockFetchTrades.mockResolvedValueOnce({ trades: newTrades });

      act(() => {
        result.current.refetch();
      });

      await waitFor(() => expect(result.current.trades).toEqual(newTrades));
    });
  });

  describe('createTrade()', () => {
    it('calls createTrade with the correct data', async () => {
      const newTrade = makeTrade('t-new', 'Masonry');
      mockCreateTrade.mockResolvedValueOnce(newTrade);
      mockFetchTrades.mockResolvedValue({ trades: [] });

      const { result } = renderHook(() => useTrades());
      await waitFor(() => expect(mockFetchTrades).toHaveBeenCalledTimes(1));

      await act(async () => {
        await result.current.createTrade({ name: 'Masonry' });
      });

      expect(mockCreateTrade).toHaveBeenCalledWith({ name: 'Masonry' });
    });

    it('returns the created trade on success', async () => {
      const newTrade = makeTrade('t-new', 'HVAC');
      mockCreateTrade.mockResolvedValueOnce(newTrade);
      mockFetchTrades.mockResolvedValue({ trades: [newTrade] });

      const { result } = renderHook(() => useTrades());
      await waitFor(() => expect(mockFetchTrades).toHaveBeenCalledTimes(1));

      let createdTrade: unknown;
      await act(async () => {
        createdTrade = await result.current.createTrade({ name: 'HVAC' });
      });

      expect(createdTrade).toEqual(newTrade);
    });

    it('triggers a refetch after successful create', async () => {
      mockCreateTrade.mockResolvedValueOnce(makeTrade('t-new', 'Masonry'));
      mockFetchTrades.mockResolvedValue({ trades: [] });

      const { result } = renderHook(() => useTrades());
      await waitFor(() => expect(mockFetchTrades).toHaveBeenCalledTimes(1));

      await act(async () => {
        await result.current.createTrade({ name: 'Masonry' });
      });

      await waitFor(() => expect(mockFetchTrades).toHaveBeenCalledTimes(2));
    });

    it('rejects with the original error and does not refetch when createTrade throws', async () => {
      const failure = new Error('Conflict');
      mockCreateTrade.mockRejectedValueOnce(failure);
      mockFetchTrades.mockResolvedValue({ trades: [] });

      const { result } = renderHook(() => useTrades());
      await waitFor(() => expect(mockFetchTrades).toHaveBeenCalledTimes(1));

      let thrown: unknown;
      await act(async () => {
        try {
          await result.current.createTrade({ name: 'Plumbing' });
        } catch (err) {
          thrown = err;
        }
      });

      expect(thrown).toBe(failure);
      expect(mockFetchTrades).toHaveBeenCalledTimes(1);
    });
  });

  describe('updateTrade()', () => {
    it('calls updateTrade with the correct id and data', async () => {
      const updatedTrade = makeTrade('t1', 'Advanced Plumbing');
      mockUpdateTrade.mockResolvedValueOnce(updatedTrade);
      mockFetchTrades.mockResolvedValue({ trades: [] });

      const { result } = renderHook(() => useTrades());
      await waitFor(() => expect(mockFetchTrades).toHaveBeenCalledTimes(1));

      await act(async () => {
        await result.current.updateTrade('t1', { name: 'Advanced Plumbing' });
      });

      expect(mockUpdateTrade).toHaveBeenCalledWith('t1', { name: 'Advanced Plumbing' });
    });

    it('returns the updated trade on success', async () => {
      const updatedTrade = makeTrade('t1', 'Updated Electrical');
      mockUpdateTrade.mockResolvedValueOnce(updatedTrade);
      mockFetchTrades.mockResolvedValue({ trades: [updatedTrade] });

      const { result } = renderHook(() => useTrades());
      await waitFor(() => expect(mockFetchTrades).toHaveBeenCalledTimes(1));

      let returned: unknown;
      await act(async () => {
        returned = await result.current.updateTrade('t1', { name: 'Updated Electrical' });
      });

      expect(returned).toEqual(updatedTrade);
    });

    it('triggers a refetch after successful update', async () => {
      mockUpdateTrade.mockResolvedValueOnce(makeTrade('t1', 'Updated'));
      mockFetchTrades.mockResolvedValue({ trades: [] });

      const { result } = renderHook(() => useTrades());
      await waitFor(() => expect(mockFetchTrades).toHaveBeenCalledTimes(1));

      await act(async () => {
        await result.current.updateTrade('t1', { name: 'Updated' });
      });

      await waitFor(() => expect(mockFetchTrades).toHaveBeenCalledTimes(2));
    });

    it('rejects with the original error and does not refetch when updateTrade throws', async () => {
      const failure = new Error('Not found');
      mockUpdateTrade.mockRejectedValueOnce(failure);
      mockFetchTrades.mockResolvedValue({ trades: [] });

      const { result } = renderHook(() => useTrades());
      await waitFor(() => expect(mockFetchTrades).toHaveBeenCalledTimes(1));

      let thrown: unknown;
      await act(async () => {
        try {
          await result.current.updateTrade('nonexistent', { name: 'Updated' });
        } catch (err) {
          thrown = err;
        }
      });

      expect(thrown).toBe(failure);
      expect(mockFetchTrades).toHaveBeenCalledTimes(1);
    });
  });

  describe('deleteTrade()', () => {
    it('calls deleteTrade with the correct id', async () => {
      mockDeleteTrade.mockResolvedValueOnce(undefined);
      mockFetchTrades.mockResolvedValue({ trades: [] });

      const { result } = renderHook(() => useTrades());
      await waitFor(() => expect(mockFetchTrades).toHaveBeenCalledTimes(1));

      await act(async () => {
        await result.current.deleteTrade('t1');
      });

      expect(mockDeleteTrade).toHaveBeenCalledWith('t1');
    });

    it('returns true on successful delete', async () => {
      mockDeleteTrade.mockResolvedValueOnce(undefined);
      mockFetchTrades.mockResolvedValue({ trades: [] });

      const { result } = renderHook(() => useTrades());
      await waitFor(() => expect(mockFetchTrades).toHaveBeenCalledTimes(1));

      let returned: unknown;
      await act(async () => {
        returned = await result.current.deleteTrade('t1');
      });

      expect(returned).toBe(true);
    });

    it('triggers a refetch after successful delete', async () => {
      mockDeleteTrade.mockResolvedValueOnce(undefined);
      mockFetchTrades.mockResolvedValue({ trades: [] });

      const { result } = renderHook(() => useTrades());
      await waitFor(() => expect(mockFetchTrades).toHaveBeenCalledTimes(1));

      await act(async () => {
        await result.current.deleteTrade('t1');
      });

      await waitFor(() => expect(mockFetchTrades).toHaveBeenCalledTimes(2));
    });

    it('rejects with the original error and does not refetch when deleteTrade throws', async () => {
      const failure = new Error('In use');
      mockDeleteTrade.mockRejectedValueOnce(failure);
      mockFetchTrades.mockResolvedValue({ trades: [] });

      const { result } = renderHook(() => useTrades());
      await waitFor(() => expect(mockFetchTrades).toHaveBeenCalledTimes(1));

      let thrown: unknown;
      await act(async () => {
        try {
          await result.current.deleteTrade('t1');
        } catch (err) {
          thrown = err;
        }
      });

      expect(thrown).toBe(failure);
      expect(mockFetchTrades).toHaveBeenCalledTimes(1);
    });
  });
});
