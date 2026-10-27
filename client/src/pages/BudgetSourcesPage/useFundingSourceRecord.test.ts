/**
 * @jest-environment jsdom
 */
/**
 * useFundingSourceRecord / useSourceBudgetLines (#2242): only the newest request writes, a failed
 * silent refresh falls back to a visible reload, errors are translated, nothing writes after unmount.
 *
 * Mutations: an older response overwriting a newer one; refresh failure leaving stale data with
 * no error; 404 not flagged as notFound; state written after unmount; revision not bumping.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react';
import type {
  BudgetSourceBudgetLinesResponse,
  BudgetSourceDetailResponse,
} from '@cornerstone/shared';
import { ApiClientError } from '../../lib/apiClient.js';
import type * as HookModule from './useFundingSourceRecord.js';

const mockFetchSource = jest.fn<(id: string) => Promise<BudgetSourceDetailResponse>>();
const mockFetchLines = jest.fn<(id: string) => Promise<BudgetSourceBudgetLinesResponse>>();
jest.unstable_mockModule('../../lib/budgetSourcesApi.js', () => ({
  fetchBudgetSource: mockFetchSource,
  fetchBudgetLinesForSource: mockFetchLines,
}));

const rec = (name: string) => ({ budgetSource: { id: 'bs-1', name }, money: {} }) as never;
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe('useFundingSourceRecord', () => {
  let Hooks: typeof HookModule;

  beforeEach(async () => {
    mockFetchSource.mockReset();
    mockFetchLines.mockReset();
    if (!Hooks) Hooks = await import('./useFundingSourceRecord.js');
  });

  it('loads the record, then reports it with no error', async () => {
    mockFetchSource.mockResolvedValue(rec('Loan'));
    const { result } = renderHook(() => Hooks.useFundingSourceRecord('bs-1'));
    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.record?.budgetSource.name).toBe('Loan');
    expect(result.current.error).toBeNull();
    expect(result.current.notFound).toBe(false);
    expect(result.current.revision).toBe(0);
  });

  it('404 sets notFound with the not-found copy; other API errors are translated; others fixed', async () => {
    mockFetchSource.mockRejectedValue(new ApiClientError(404, { code: 'NOT_FOUND', message: 'x' }));
    const { result } = renderHook(() => Hooks.useFundingSourceRecord('bs-1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.notFound).toBe(true);
    expect(result.current.error).toBe('This funding source could not be found.');

    mockFetchSource.mockRejectedValue(
      new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'raw' }),
    );
    await act(() => result.current.reload());
    expect(result.current.notFound).toBe(false);
    expect(result.current.error).not.toBe('raw');
    expect(result.current.error).toBeTruthy();

    mockFetchSource.mockRejectedValue(new Error('offline'));
    await act(() => result.current.reload());
    expect(result.current.error).toBe('The funding source could not be loaded.');
  });

  it('refresh replaces the record silently, clears an error and bumps the revision', async () => {
    mockFetchSource.mockResolvedValueOnce(rec('Old'));
    const { result } = renderHook(() => Hooks.useFundingSourceRecord('bs-1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    mockFetchSource.mockResolvedValueOnce(rec('New'));

    let fresh: unknown;
    await act(async () => {
      fresh = await result.current.refresh();
    });

    expect((fresh as { budgetSource: { name: string } }).budgetSource.name).toBe('New');
    expect(result.current.record?.budgetSource.name).toBe('New');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.revision).toBe(1);
  });

  it('a failed refresh falls back to a visible reload and resolves null', async () => {
    mockFetchSource.mockResolvedValueOnce(rec('Old'));
    const { result } = renderHook(() => Hooks.useFundingSourceRecord('bs-1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    mockFetchSource.mockRejectedValueOnce(new Error('boom'));
    mockFetchSource.mockResolvedValueOnce(rec('After reload'));

    let fresh: unknown = 'unset';
    await act(async () => {
      fresh = await result.current.refresh();
    });

    expect(fresh).toBeNull();
    expect(mockFetchSource).toHaveBeenCalledTimes(3);
    expect(result.current.record?.budgetSource.name).toBe('After reload');
  });

  it('only the newest request writes: an older response arriving later is dropped', async () => {
    const first = deferred<BudgetSourceDetailResponse>();
    mockFetchSource.mockReturnValueOnce(first.promise);
    const { result } = renderHook(() => Hooks.useFundingSourceRecord('bs-1'));
    mockFetchSource.mockResolvedValueOnce(rec('Newest'));

    await act(async () => {
      await result.current.refresh();
    });
    await act(async () => first.resolve(rec('Older')));

    expect(result.current.record?.budgetSource.name).toBe('Newest');
  });

  it('an older failure arriving after a newer success changes nothing', async () => {
    const first = deferred<BudgetSourceDetailResponse>();
    mockFetchSource.mockReturnValueOnce(first.promise);
    const { result } = renderHook(() => Hooks.useFundingSourceRecord('bs-1'));
    mockFetchSource.mockResolvedValueOnce(rec('Newest'));
    await act(async () => {
      await result.current.refresh();
    });

    await act(async () => first.reject(new Error('late')));

    expect(result.current.error).toBeNull();
    expect(result.current.record?.budgetSource.name).toBe('Newest');
  });

  it('writes nothing after unmount (result, failure and refresh)', async () => {
    const pending = deferred<BudgetSourceDetailResponse>();
    mockFetchSource.mockReturnValue(pending.promise);
    const { result, unmount } = renderHook(() => Hooks.useFundingSourceRecord('bs-1'));
    const refresh = result.current.refresh;
    unmount();

    await act(async () => pending.resolve(rec('Late')));
    expect(result.current.record).toBeNull();

    mockFetchSource.mockRejectedValue(new Error('late'));
    await act(async () => {
      expect(await refresh()).toBeNull();
    });
    expect(result.current.error).toBeNull();
  });
});

describe('useSourceBudgetLines', () => {
  let Hooks: typeof HookModule;
  const response = { workItemLines: [], householdItemLines: [] } as BudgetSourceBudgetLinesResponse;

  beforeEach(async () => {
    mockFetchLines.mockReset();
    if (!Hooks) Hooks = await import('./useFundingSourceRecord.js');
  });

  it('loads the lines of the source', async () => {
    mockFetchLines.mockResolvedValue(response);
    const { result } = renderHook(() => Hooks.useSourceBudgetLines('bs-1'));
    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toBe(response);
    expect(result.current.error).toBeNull();
    expect(mockFetchLines).toHaveBeenCalledWith('bs-1');
  });

  it('translates an API error, shows the fixed copy otherwise, and reload shows loading and retries', async () => {
    mockFetchLines.mockRejectedValueOnce(
      new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'raw' }),
    );
    const { result } = renderHook(() => Hooks.useSourceBudgetLines('bs-1'));
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.error).not.toBe('raw');

    mockFetchLines.mockResolvedValueOnce(response);
    act(() => result.current.reload());
    expect(result.current.isLoading).toBe(true);
    expect(result.current.error).toBeNull();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toBe(response);

    mockFetchLines.mockRejectedValueOnce(new Error('offline'));
    act(() => result.current.reload());
    await waitFor(() =>
      expect(result.current.error).toBe('The funding source could not be loaded.'),
    );
  });

  it('ignores a response or failure that arrives after unmount', async () => {
    const pending = deferred<BudgetSourceBudgetLinesResponse>();
    mockFetchLines.mockReturnValue(pending.promise);
    const { result, unmount } = renderHook(() => Hooks.useSourceBudgetLines('bs-1'));
    unmount();
    await act(async () => pending.resolve(response));
    expect(result.current.data).toBeNull();

    const failing = deferred<BudgetSourceBudgetLinesResponse>();
    mockFetchLines.mockReturnValue(failing.promise);
    const second = renderHook(() => Hooks.useSourceBudgetLines('bs-2'));
    second.unmount();
    await act(async () => failing.reject(new Error('late')));
    expect(second.result.current.error).toBeNull();
  });
});
