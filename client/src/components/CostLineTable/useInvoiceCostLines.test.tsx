/**
 * @jest-environment jsdom
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { renderHook, act, waitFor } from '@testing-library/react';
import type * as HookModule from './useInvoiceCostLines.js';
import type * as ApiClientModule from '../../lib/apiClient.js';

const mockFetchLines = jest.fn<(id: string) => Promise<unknown>>();
const mockFetchSources = jest.fn<() => Promise<unknown>>();

jest.unstable_mockModule('../../lib/invoiceBudgetLinesApi.js', () => ({
  fetchInvoiceBudgetLines: mockFetchLines,
}));
jest.unstable_mockModule('../../lib/budgetSourcesApi.js', () => ({
  fetchBudgetSources: mockFetchSources,
}));

let useInvoiceCostLines: (typeof HookModule)['useInvoiceCostLines'];
let ApiClientError: (typeof ApiClientModule)['ApiClientError'];

const LINE = { id: 'ibl-1', description: 'Tile adhesive' };

function deferred<T>() {
  let resolve: (v: T) => void = () => undefined;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

beforeEach(async () => {
  jest.resetAllMocks();
  mockFetchSources.mockResolvedValue({ budgetSources: [{ id: 's1', name: 'Savings' }] });
  ({ useInvoiceCostLines } = (await import('./useInvoiceCostLines.js')) as typeof HookModule);
  ({ ApiClientError } = (await import('../../lib/apiClient.js')) as typeof ApiClientModule);
});

describe('useInvoiceCostLines', () => {
  it('loads lines, remaining amount and funding source names', async () => {
    mockFetchLines.mockResolvedValue({ budgetLines: [LINE], remainingAmount: 12.5 });
    const { result } = renderHook(() => useInvoiceCostLines('inv-1'));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockFetchLines).toHaveBeenCalledWith('inv-1');
    expect(result.current.lines).toEqual([LINE]);
    expect(result.current.remainingAmount).toBe(12.5);
    expect(result.current.error).toBeNull();
    await waitFor(() => expect(result.current.sources.get('s1')).toBe('Savings'));
    // #2239: the fetched sources are exposed as-is, and the Map is derived from them
    expect(result.current.budgetSources).toEqual([{ id: 's1', name: 'Savings' }]);
  });

  it('exposes no budget sources while loading and when the sources request fails', async () => {
    mockFetchSources.mockRejectedValue(new Error('offline'));
    mockFetchLines.mockResolvedValue({ budgetLines: [LINE], remainingAmount: 0 });
    const { result } = renderHook(() => useInvoiceCostLines('inv-1'));
    expect(result.current.budgetSources).toEqual([]);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.budgetSources).toEqual([]);
    expect(result.current.sources.size).toBe(0);
  });

  it('translates an API failure and recovers on reload', async () => {
    mockFetchLines.mockRejectedValueOnce(
      new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'raw prose' }),
    );
    const { result } = renderHook(() => useInvoiceCostLines('inv-1'));
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.error).not.toContain('raw prose');
    mockFetchLines.mockResolvedValue({ budgetLines: [LINE], remainingAmount: 0 });
    await act(async () => {
      await result.current.reload();
    });
    expect(result.current.error).toBeNull();
    expect(result.current.lines).toHaveLength(1);
  });

  it('shows the fixed load error for a non-API failure', async () => {
    mockFetchLines.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useInvoiceCostLines('inv-1'));
    await waitFor(() => expect(result.current.error).toBe('The cost lines could not be loaded.'));
  });

  it('lets only the newest request write state', async () => {
    const slow = deferred<unknown>();
    mockFetchLines.mockReturnValueOnce(slow.promise);
    const { result } = renderHook(() => useInvoiceCostLines('inv-1'));
    mockFetchLines.mockResolvedValueOnce({ budgetLines: [LINE], remainingAmount: 1 });
    await act(async () => {
      await result.current.reload();
    });
    expect(result.current.remainingAmount).toBe(1);
    await act(async () => {
      slow.resolve({ budgetLines: [], remainingAmount: 99 });
      await slow.promise;
    });
    expect(result.current.remainingAmount).toBe(1);
    expect(result.current.lines).toHaveLength(1);
  });

  it('drops a stale failure after a newer request', async () => {
    const slow = deferred<unknown>();
    mockFetchLines.mockReturnValueOnce(slow.promise);
    const { result } = renderHook(() => useInvoiceCostLines('inv-1'));
    mockFetchLines.mockResolvedValueOnce({ budgetLines: [], remainingAmount: 2 });
    await act(async () => {
      await result.current.reload();
    });
    await act(async () => {
      // Rejecting through the resolver path: the slow promise fails after the newer one landed.
      slow.resolve(Promise.reject(new Error('late')));
      await slow.promise.catch(() => undefined);
    });
    expect(result.current.error).toBeNull();
  });

  it('ignores responses that arrive after unmount', async () => {
    const slow = deferred<unknown>();
    mockFetchLines.mockReturnValueOnce(slow.promise);
    const { unmount } = renderHook(() => useInvoiceCostLines('inv-1'));
    unmount();
    await act(async () => {
      slow.resolve({ budgetLines: [LINE], remainingAmount: 3 });
      await slow.promise;
    });
  });

  it('ignores a failure that arrives after unmount', async () => {
    const slow = deferred<unknown>();
    mockFetchLines.mockReturnValueOnce(slow.promise);
    const { unmount } = renderHook(() => useInvoiceCostLines('inv-1'));
    unmount();
    await act(async () => {
      slow.resolve(Promise.reject(new Error('late')));
      await slow.promise.catch(() => undefined);
    });
  });

  it('keeps working without funding source names when that request fails', async () => {
    mockFetchSources.mockRejectedValue(new Error('no sources'));
    mockFetchLines.mockResolvedValue({ budgetLines: [LINE], remainingAmount: 0 });
    const { result } = renderHook(() => useInvoiceCostLines('inv-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.sources.size).toBe(0);
  });

  it('does not apply funding sources that arrive after unmount', async () => {
    const slow = deferred<unknown>();
    mockFetchSources.mockReturnValue(slow.promise);
    mockFetchLines.mockResolvedValue({ budgetLines: [], remainingAmount: 0 });
    const { unmount } = renderHook(() => useInvoiceCostLines('inv-1'));
    unmount();
    await act(async () => {
      slow.resolve({ budgetSources: [{ id: 's1', name: 'Savings' }] });
      await slow.promise;
    });
  });
});
