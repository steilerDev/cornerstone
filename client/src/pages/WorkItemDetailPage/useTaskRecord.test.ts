/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react';
import { ApiClientError } from '../../lib/apiClient.js';
import { makeTaskPage } from '../../test/taskPageFixtures.js';
import type * as WorkItemsApiTypes from '../../lib/workItemsApi.js';
import type * as HookModule from './useTaskRecord.js';

const mockGetWorkItem = jest.fn<typeof WorkItemsApiTypes.getWorkItem>();
jest.unstable_mockModule('../../lib/workItemsApi.js', () => ({ getWorkItem: mockGetWorkItem }));

let Hook: typeof HookModule;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const TASK = makeTaskPage();

describe('useTaskRecord', () => {
  beforeEach(async () => {
    mockGetWorkItem.mockReset();
    mockGetWorkItem.mockResolvedValue(TASK);
    if (!Hook) Hook = await import('./useTaskRecord.js');
  });

  it('is loading first, then holds the record', async () => {
    const { result } = renderHook(() => Hook.useTaskRecord('wi-1'));
    expect(result.current.isLoading).toBe(true);
    expect(result.current.record).toBeNull();
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.record).toBe(TASK);
    expect(result.current.failure).toBeNull();
    expect(result.current.notFound).toBe(false);
    expect(result.current.revision).toBe(0);
    expect(mockGetWorkItem).toHaveBeenCalledWith('wi-1');
  });

  it('reports a 404 as notFound with the failure kept as data', async () => {
    mockGetWorkItem.mockRejectedValue(new ApiClientError(404, { code: 'NOT_FOUND', message: 'x' }));
    const { result } = renderHook(() => Hook.useTaskRecord('wi-1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.notFound).toBe(true);
    expect(result.current.failure).toEqual({ kind: 'api', code: 'NOT_FOUND', notFound: true });
    expect(result.current.record).toBeNull();
  });

  it('reports another API error as a failure, not as notFound', async () => {
    mockGetWorkItem.mockRejectedValue(
      new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'x' }),
    );
    const { result } = renderHook(() => Hook.useTaskRecord('wi-1'));
    await waitFor(() => expect(result.current.failure).not.toBeNull());
    expect(result.current.notFound).toBe(false);
  });

  it('reports a network failure as kind other', async () => {
    mockGetWorkItem.mockRejectedValue(new Error('down'));
    const { result } = renderHook(() => Hook.useTaskRecord('wi-1'));
    await waitFor(() => expect(result.current.failure).toEqual({ kind: 'other' }));
    expect(result.current.notFound).toBe(false);
  });

  it('reload shows the loading state again and clears the failure', async () => {
    mockGetWorkItem.mockRejectedValueOnce(new Error('down'));
    const { result } = renderHook(() => Hook.useTaskRecord('wi-1'));
    await waitFor(() => expect(result.current.failure).not.toBeNull());
    const pending = deferred<typeof TASK>();
    mockGetWorkItem.mockReturnValueOnce(pending.promise);
    let done!: Promise<void>;
    act(() => {
      done = result.current.reload();
    });
    expect(result.current.isLoading).toBe(true);
    expect(result.current.failure).toBeNull();
    await act(async () => {
      pending.resolve(TASK);
      await done;
    });
    expect(result.current.record).toBe(TASK);
  });

  it('refresh keeps the page, replaces the record and bumps the revision', async () => {
    const { result } = renderHook(() => Hook.useTaskRecord('wi-1'));
    await waitFor(() => expect(result.current.record).toBe(TASK));
    const fresh = makeTaskPage({ title: 'Renamed' });
    mockGetWorkItem.mockResolvedValueOnce(fresh);
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.record).toBe(fresh);
    expect(result.current.revision).toBe(1);
    expect(result.current.isLoading).toBe(false);
  });

  it('refresh that fails falls back to a full reload', async () => {
    const { result } = renderHook(() => Hook.useTaskRecord('wi-1'));
    await waitFor(() => expect(result.current.record).toBe(TASK));
    mockGetWorkItem
      .mockRejectedValueOnce(new Error('blip'))
      .mockRejectedValueOnce(new Error('down'));
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.failure).toEqual({ kind: 'other' });
    expect(result.current.revision).toBe(0);
  });

  it('only the newest request writes (an older slow response is dropped)', async () => {
    const slow = deferred<typeof TASK>();
    mockGetWorkItem.mockReturnValueOnce(slow.promise);
    const { result } = renderHook(() => Hook.useTaskRecord('wi-1'));
    const newer = makeTaskPage({ title: 'Newer' });
    mockGetWorkItem.mockResolvedValueOnce(newer);
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.record).toBe(newer);
    await act(async () => {
      slow.resolve(TASK);
      await slow.promise;
    });
    expect(result.current.record).toBe(newer);
  });

  it('drops an older failure and an older refresh failure once a newer request exists', async () => {
    const slow = deferred<typeof TASK>();
    mockGetWorkItem.mockReturnValueOnce(slow.promise);
    const { result } = renderHook(() => Hook.useTaskRecord('wi-1'));
    const newer = makeTaskPage({ title: 'Newer' });
    mockGetWorkItem.mockResolvedValueOnce(newer);
    await act(async () => {
      await result.current.refresh();
    });
    await act(async () => {
      slow.reject(new Error('late'));
      await slow.promise.catch(() => undefined);
    });
    expect(result.current.failure).toBeNull();

    const slowRefresh = deferred<typeof TASK>();
    mockGetWorkItem.mockReturnValueOnce(slowRefresh.promise);
    let first!: Promise<void>;
    act(() => {
      first = result.current.refresh();
    });
    mockGetWorkItem.mockResolvedValueOnce(TASK);
    await act(async () => {
      await result.current.refresh();
    });
    await act(async () => {
      slowRefresh.reject(new Error('late'));
      await first;
    });
    expect(result.current.failure).toBeNull();
    expect(result.current.record).toBe(TASK);
  });

  it('ignores responses after unmount', async () => {
    const slow = deferred<typeof TASK>();
    mockGetWorkItem.mockReturnValueOnce(slow.promise);
    const { result, unmount } = renderHook(() => Hook.useTaskRecord('wi-1'));
    unmount();
    await act(async () => {
      slow.resolve(TASK);
      await slow.promise;
    });
    expect(result.current.record).toBeNull();
  });

  it('ignores a failure and a refresh after unmount', async () => {
    const { result, unmount } = renderHook(() => Hook.useTaskRecord('wi-1'));
    await waitFor(() => expect(result.current.record).toBe(TASK));
    const slow = deferred<typeof TASK>();
    mockGetWorkItem.mockReturnValueOnce(slow.promise);
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.refresh();
    });
    unmount();
    await act(async () => {
      slow.reject(new Error('late'));
      await pending;
    });
    expect(mockGetWorkItem).toHaveBeenCalledTimes(2);
  });

  it('loads the new task when the id changes', async () => {
    const { result, rerender } = renderHook(({ id }) => Hook.useTaskRecord(id), {
      initialProps: { id: 'wi-1' },
    });
    await waitFor(() => expect(result.current.record).toBe(TASK));
    rerender({ id: 'wi-2' });
    await waitFor(() => expect(mockGetWorkItem).toHaveBeenLastCalledWith('wi-2'));
  });

  it('a refresh that fails after a newer refresh started does not reload or touch state', async () => {
    const { result } = renderHook(() => Hook.useTaskRecord('wi-1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const first = deferred<typeof TASK>();
    const second = makeTaskPage({ title: 'Newer' });
    mockGetWorkItem.mockReturnValueOnce(first.promise).mockResolvedValueOnce(second);
    let older!: Promise<void>;
    act(() => {
      older = result.current.refresh();
    });
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.record).toBe(second);
    const callsBefore = mockGetWorkItem.mock.calls.length;
    await act(async () => {
      first.reject(new Error('late'));
      await older;
    });
    expect(mockGetWorkItem).toHaveBeenCalledTimes(callsBefore);
    expect(result.current.record).toBe(second);
    expect(result.current.failure).toBeNull();
  });

  it('an older refresh that resolves after a newer one started does not overwrite the record', async () => {
    const { result } = renderHook(() => Hook.useTaskRecord('wi-1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const first = deferred<typeof TASK>();
    const second = makeTaskPage({ title: 'Newer' });
    mockGetWorkItem.mockReturnValueOnce(first.promise).mockResolvedValueOnce(second);
    let older!: Promise<void>;
    act(() => {
      older = result.current.refresh();
    });
    await act(async () => {
      await result.current.refresh();
    });
    const revision = result.current.revision;
    await act(async () => {
      first.resolve(makeTaskPage({ title: 'Stale' }));
      await older;
    });
    expect(result.current.record).toBe(second);
    expect(result.current.revision).toBe(revision);
  });
});
