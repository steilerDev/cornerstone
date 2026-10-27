/**
 * @jest-environment jsdom
 */
/**
 * useGrantRecord (#2242): only the newest request writes, a failed
 * silent refresh falls back to a visible reload, errors are translated, nothing writes after unmount.
 *
 * Mutations: an older response overwriting a newer one; refresh failure leaving stale data with
 * no error; 404 not flagged as notFound; state written after unmount; revision not bumping.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { SubsidyProgramDetailResponse } from '@cornerstone/shared';
import { ApiClientError } from '../../lib/apiClient.js';
import type * as HookModule from './useGrantRecord.js';

const mockFetchGrant = jest.fn<(id: string) => Promise<SubsidyProgramDetailResponse>>();
jest.unstable_mockModule('../../lib/subsidyProgramsApi.js', () => ({
  fetchSubsidyProgram: mockFetchGrant,
}));

const rec = (name: string) => ({ subsidyProgram: { id: 'sp-1', name }, money: {} }) as never;
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe('useGrantRecord', () => {
  let Hooks: typeof HookModule;

  beforeEach(async () => {
    mockFetchGrant.mockReset();
    if (!Hooks) Hooks = await import('./useGrantRecord.js');
  });

  it('loads the record, then reports it with no error', async () => {
    mockFetchGrant.mockResolvedValue(rec('Loan'));
    const { result } = renderHook(() => Hooks.useGrantRecord('sp-1'));
    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.record?.subsidyProgram.name).toBe('Loan');
    expect(result.current.error).toBeNull();
    expect(result.current.notFound).toBe(false);
    expect(result.current.revision).toBe(0);
  });

  it('404 sets notFound with the not-found copy; other API errors are translated; others fixed', async () => {
    mockFetchGrant.mockRejectedValue(new ApiClientError(404, { code: 'NOT_FOUND', message: 'x' }));
    const { result } = renderHook(() => Hooks.useGrantRecord('sp-1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.notFound).toBe(true);
    expect(result.current.error).toBe('This grant could not be found.');

    mockFetchGrant.mockRejectedValue(
      new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'raw' }),
    );
    await act(() => result.current.reload());
    expect(result.current.notFound).toBe(false);
    expect(result.current.error).not.toBe('raw');
    expect(result.current.error).toBeTruthy();

    mockFetchGrant.mockRejectedValue(new Error('offline'));
    await act(() => result.current.reload());
    expect(result.current.error).toBe('The grant could not be loaded.');
  });

  it('refresh replaces the record silently, clears an error and bumps the revision', async () => {
    mockFetchGrant.mockResolvedValueOnce(rec('Old'));
    const { result } = renderHook(() => Hooks.useGrantRecord('sp-1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    mockFetchGrant.mockResolvedValueOnce(rec('New'));

    let fresh: unknown;
    await act(async () => {
      fresh = await result.current.refresh();
    });

    expect((fresh as { subsidyProgram: { name: string } }).subsidyProgram.name).toBe('New');
    expect(result.current.record?.subsidyProgram.name).toBe('New');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.revision).toBe(1);
  });

  it('a failed refresh falls back to a visible reload and resolves null', async () => {
    mockFetchGrant.mockResolvedValueOnce(rec('Old'));
    const { result } = renderHook(() => Hooks.useGrantRecord('sp-1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    mockFetchGrant.mockRejectedValueOnce(new Error('boom'));
    mockFetchGrant.mockResolvedValueOnce(rec('After reload'));

    let fresh: unknown = 'unset';
    await act(async () => {
      fresh = await result.current.refresh();
    });

    expect(fresh).toBeNull();
    expect(mockFetchGrant).toHaveBeenCalledTimes(3);
    expect(result.current.record?.subsidyProgram.name).toBe('After reload');
  });

  it('only the newest request writes: an older response arriving later is dropped', async () => {
    const first = deferred<SubsidyProgramDetailResponse>();
    mockFetchGrant.mockReturnValueOnce(first.promise);
    const { result } = renderHook(() => Hooks.useGrantRecord('sp-1'));
    mockFetchGrant.mockResolvedValueOnce(rec('Newest'));

    await act(async () => {
      await result.current.refresh();
    });
    await act(async () => first.resolve(rec('Older')));

    expect(result.current.record?.subsidyProgram.name).toBe('Newest');
  });

  it('an older failure arriving after a newer success changes nothing', async () => {
    const first = deferred<SubsidyProgramDetailResponse>();
    mockFetchGrant.mockReturnValueOnce(first.promise);
    const { result } = renderHook(() => Hooks.useGrantRecord('sp-1'));
    mockFetchGrant.mockResolvedValueOnce(rec('Newest'));
    await act(async () => {
      await result.current.refresh();
    });

    await act(async () => first.reject(new Error('late')));

    expect(result.current.error).toBeNull();
    expect(result.current.record?.subsidyProgram.name).toBe('Newest');
  });

  it('writes nothing after unmount (result, failure and refresh)', async () => {
    const pending = deferred<SubsidyProgramDetailResponse>();
    mockFetchGrant.mockReturnValue(pending.promise);
    const { result, unmount } = renderHook(() => Hooks.useGrantRecord('sp-1'));
    const refresh = result.current.refresh;
    unmount();

    await act(async () => pending.resolve(rec('Late')));
    expect(result.current.record).toBeNull();

    mockFetchGrant.mockRejectedValue(new Error('late'));
    await act(async () => {
      expect(await refresh()).toBeNull();
    });
    expect(result.current.error).toBeNull();
  });
});
