/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { WorkItemMilestones } from '@cornerstone/shared';
import { ApiClientError } from '../../lib/apiClient.js';
import type * as MilestonesApiTypes from '../../lib/workItemMilestonesApi.js';
import type * as PurchasesApiTypes from '../../lib/householdItemWorkItemsApi.js';
import type * as HookModule from './useTaskTimingRelations.js';

const mockGetMilestones = jest.fn<typeof MilestonesApiTypes.getWorkItemMilestones>();
const mockFetchPurchases = jest.fn<typeof PurchasesApiTypes.fetchLinkedHouseholdItems>();
jest.unstable_mockModule('../../lib/workItemMilestonesApi.js', () => ({
  getWorkItemMilestones: mockGetMilestones,
}));
jest.unstable_mockModule('../../lib/householdItemWorkItemsApi.js', () => ({
  fetchLinkedHouseholdItems: mockFetchPurchases,
}));

let Hook: typeof HookModule;
const MILESTONES: WorkItemMilestones = { required: [], linked: [] };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useTaskTimingRelations', () => {
  beforeEach(async () => {
    mockGetMilestones.mockReset();
    mockFetchPurchases.mockReset();
    mockGetMilestones.mockResolvedValue(MILESTONES);
    mockFetchPurchases.mockResolvedValue([]);
    if (!Hook) Hook = await import('./useTaskTimingRelations.js');
  });

  it('is null until the first response, then holds the milestones and purchases', async () => {
    const { result } = renderHook(() => Hook.useTaskTimingRelations('wi-1', 0));
    expect(result.current.milestones).toBeNull();
    expect(result.current.purchases).toBeNull();
    await waitFor(() => expect(result.current.milestones).toBe(MILESTONES));
    expect(result.current.purchases).toEqual([]);
    expect(result.current.failure).toBeNull();
    expect(mockGetMilestones).toHaveBeenCalledWith('wi-1');
    expect(mockFetchPurchases).toHaveBeenCalledWith('wi-1');
  });

  it('reloads when the revision changes and when the task changes', async () => {
    const { result, rerender } = renderHook(
      ({ id, revision }) => Hook.useTaskTimingRelations(id, revision),
      { initialProps: { id: 'wi-1', revision: 0 } },
    );
    await waitFor(() => expect(result.current.milestones).not.toBeNull());
    rerender({ id: 'wi-1', revision: 1 });
    await waitFor(() => expect(mockGetMilestones).toHaveBeenCalledTimes(2));
    rerender({ id: 'wi-2', revision: 1 });
    await waitFor(() => expect(mockGetMilestones).toHaveBeenLastCalledWith('wi-2'));
  });

  it('records a failure as data and keeps the loaded data while a reload fails', async () => {
    const { result, rerender } = renderHook(
      ({ revision }) => Hook.useTaskTimingRelations('wi-1', revision),
      { initialProps: { revision: 0 } },
    );
    await waitFor(() => expect(result.current.milestones).toBe(MILESTONES));
    mockGetMilestones.mockRejectedValueOnce(
      new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'x' }),
    );
    rerender({ revision: 1 });
    await waitFor(() =>
      expect(result.current.failure).toEqual({
        kind: 'api',
        code: 'INTERNAL_ERROR',
        notFound: false,
      }),
    );
    expect(result.current.milestones).toBe(MILESTONES);
  });

  it('reload clears the failure first and loads again (Retry)', async () => {
    mockGetMilestones.mockRejectedValueOnce(new Error('down'));
    const { result } = renderHook(() => Hook.useTaskTimingRelations('wi-1', 0));
    await waitFor(() => expect(result.current.failure).toEqual({ kind: 'other' }));
    const pending = deferred<WorkItemMilestones>();
    mockGetMilestones.mockReturnValueOnce(pending.promise);
    let reloaded!: Promise<void>;
    act(() => {
      reloaded = result.current.reload();
    });
    expect(result.current.failure).toBeNull();
    await act(async () => {
      pending.resolve(MILESTONES);
      await reloaded;
    });
    expect(result.current.milestones).toBe(MILESTONES);
  });

  it('lets the latest request win over a slower older one', async () => {
    const first = deferred<WorkItemMilestones>();
    const second: WorkItemMilestones = {
      required: [{ id: 1, name: 'New', targetDate: null }],
      linked: [],
    };
    mockGetMilestones.mockReturnValueOnce(first.promise).mockResolvedValueOnce(second);
    const { result, rerender } = renderHook(
      ({ revision }) => Hook.useTaskTimingRelations('wi-1', revision),
      { initialProps: { revision: 0 } },
    );
    rerender({ revision: 1 });
    await waitFor(() => expect(result.current.milestones).toBe(second));
    await act(async () => {
      first.resolve(MILESTONES);
      await first.promise;
    });
    expect(result.current.milestones).toBe(second);
  });

  it('ignores a failure of a request that was superseded', async () => {
    const first = deferred<WorkItemMilestones>();
    mockGetMilestones.mockReturnValueOnce(first.promise);
    const { result, rerender } = renderHook(
      ({ revision }) => Hook.useTaskTimingRelations('wi-1', revision),
      { initialProps: { revision: 0 } },
    );
    rerender({ revision: 1 });
    await waitFor(() => expect(result.current.milestones).toBe(MILESTONES));
    await act(async () => {
      first.reject(new Error('late'));
      await first.promise.catch(() => undefined);
    });
    expect(result.current.failure).toBeNull();
  });

  it('ignores a response that arrives after unmount', async () => {
    const first = deferred<WorkItemMilestones>();
    mockGetMilestones.mockReturnValueOnce(first.promise);
    const { result, unmount } = renderHook(() => Hook.useTaskTimingRelations('wi-1', 0));
    unmount();
    await act(async () => {
      first.resolve(MILESTONES);
      await first.promise;
    });
    expect(result.current.milestones).toBeNull();
  });
});
