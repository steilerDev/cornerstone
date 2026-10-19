/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { AreaWithCounts, DeleteAreaResponse, ReorderAreasRequest } from '@cornerstone/shared';
import type * as HookTypes from './useAreasIndex.js';

const mockFetchAreasWithCounts = jest.fn<() => Promise<AreaWithCounts[]>>();
const mockReorderAreas = jest.fn<(body: ReorderAreasRequest) => Promise<unknown>>();
const mockDeleteArea = jest.fn<(id: string) => Promise<DeleteAreaResponse>>();

jest.unstable_mockModule('../../lib/areasApi.js', () => ({
  fetchAreasWithCounts: mockFetchAreasWithCounts,
  reorderAreas: mockReorderAreas,
  deleteArea: mockDeleteArea,
}));

let useAreasIndex: typeof HookTypes.useAreasIndex;

beforeEach(async () => {
  mockFetchAreasWithCounts.mockReset();
  mockReorderAreas.mockReset();
  mockDeleteArea.mockReset();
  if (!useAreasIndex) ({ useAreasIndex } = await import('./useAreasIndex.js'));
});

function area(id: string, parentId: string | null, sortOrder: number): AreaWithCounts {
  return {
    id,
    name: id.toUpperCase(),
    parentId,
    color: null,
    description: null,
    sortOrder,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    counts: {
      workItems: { total: 0, open: 0 },
      householdItems: { total: 0, open: 0 },
      photos: { total: 0, latestDate: null },
    },
  };
}

const TREE = [area('a', null, 0), area('b', null, 1), area('c', null, 2), area('a1', 'a', 0)];

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const order = (areas: readonly AreaWithCounts[], parentId: string | null) =>
  areas
    .filter((a) => a.parentId === parentId)
    .sort((x, y) => x.sortOrder - y.sortOrder)
    .map((a) => a.id);

describe('useAreasIndex', () => {
  describe('loading', () => {
    it('starts loading, then holds the tree once loaded', async () => {
      mockFetchAreasWithCounts.mockResolvedValue(TREE);
      const { result } = renderHook(() => useAreasIndex());
      expect(result.current.status).toBe('loading');
      expect(result.current.areas).toEqual([]);

      await waitFor(() => expect(result.current.status).toBe('ready'));
      expect(result.current.areas).toEqual(TREE);
      expect(mockFetchAreasWithCounts).toHaveBeenCalledTimes(1);
    });

    it('goes to error when the first load fails, and retry loads again through loading', async () => {
      mockFetchAreasWithCounts.mockRejectedValueOnce(new Error('offline'));
      const { result } = renderHook(() => useAreasIndex());
      await waitFor(() => expect(result.current.status).toBe('error'));

      const pending = deferred<AreaWithCounts[]>();
      mockFetchAreasWithCounts.mockReturnValueOnce(pending.promise);
      act(() => result.current.retry());
      expect(result.current.status).toBe('loading');

      await act(async () => {
        pending.resolve(TREE);
      });
      await waitFor(() => expect(result.current.status).toBe('ready'));
      expect(result.current.areas).toEqual(TREE);
    });

    it('a failed silent reload keeps the ready state and the old tree', async () => {
      mockFetchAreasWithCounts.mockResolvedValueOnce(TREE);
      const { result } = renderHook(() => useAreasIndex());
      await waitFor(() => expect(result.current.status).toBe('ready'));

      mockFetchAreasWithCounts.mockRejectedValueOnce(new Error('offline'));
      let returned: readonly AreaWithCounts[] | null = TREE;
      await act(async () => {
        returned = await result.current.refetch();
      });

      expect(returned).toBeNull();
      expect(result.current.status).toBe('ready');
      expect(result.current.areas).toEqual(TREE);
    });

    it('refetch resolves with the fresh tree and replaces the old one', async () => {
      mockFetchAreasWithCounts.mockResolvedValueOnce(TREE);
      const { result } = renderHook(() => useAreasIndex());
      await waitFor(() => expect(result.current.status).toBe('ready'));

      const fresh = [area('z', null, 0)];
      mockFetchAreasWithCounts.mockResolvedValueOnce(fresh);
      let returned: readonly AreaWithCounts[] | null = null;
      await act(async () => {
        returned = await result.current.refetch();
      });

      expect(returned).toEqual(fresh);
      expect(result.current.areas).toEqual(fresh);
    });

    it('only the latest of two overlapping loads wins; the older resolves with null', async () => {
      const first = deferred<AreaWithCounts[]>();
      const second = deferred<AreaWithCounts[]>();
      mockFetchAreasWithCounts
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(second.promise);
      const { result } = renderHook(() => useAreasIndex());

      let secondResult: readonly AreaWithCounts[] | null = null;
      let secondDone: Promise<void> = Promise.resolve();
      act(() => {
        secondDone = result.current.refetch().then((value) => {
          secondResult = value;
        });
      });
      await act(async () => {
        second.resolve([area('new', null, 0)]);
        await secondDone;
      });
      expect(secondResult).toEqual([area('new', null, 0)]);

      await act(async () => {
        first.resolve([area('old', null, 0)]);
      });

      expect(result.current.areas.map((a) => a.id)).toEqual(['new']);
    });

    it('a superseded load that fails does not flip the status to error', async () => {
      const first = deferred<AreaWithCounts[]>();
      mockFetchAreasWithCounts.mockReturnValueOnce(first.promise);
      const { result } = renderHook(() => useAreasIndex());
      mockFetchAreasWithCounts.mockResolvedValueOnce(TREE);
      await act(async () => {
        await result.current.refetch();
      });
      expect(result.current.status).toBe('ready');

      await act(async () => {
        first.reject(new Error('late failure'));
      });
      expect(result.current.status).toBe('ready');
    });

    it('ignores a load that finishes after unmount', async () => {
      const pending = deferred<AreaWithCounts[]>();
      mockFetchAreasWithCounts.mockReturnValueOnce(pending.promise);
      const { result, unmount } = renderHook(() => useAreasIndex());
      unmount();
      await act(async () => {
        pending.resolve(TREE);
      });
      expect(result.current.status).toBe('loading');
    });
  });

  describe('reorder', () => {
    async function ready() {
      mockFetchAreasWithCounts.mockResolvedValueOnce(TREE);
      const hook = renderHook(() => useAreasIndex());
      await waitFor(() => expect(hook.result.current.status).toBe('ready'));
      return hook;
    }

    it('shows the new order of that level at once, before the request settles', async () => {
      const { result } = await ready();
      const pending = deferred<unknown>();
      mockReorderAreas.mockReturnValueOnce(pending.promise);

      let done: Promise<void> = Promise.resolve();
      act(() => {
        done = result.current.reorder(null, ['c', 'a', 'b']);
      });

      expect(order(result.current.areas, null)).toEqual(['c', 'a', 'b']);
      expect(mockReorderAreas).toHaveBeenCalledWith({ parentId: null, ids: ['c', 'a', 'b'] });
      await act(async () => {
        pending.resolve([]);
        await done;
      });
      expect(order(result.current.areas, null)).toEqual(['c', 'a', 'b']);
    });

    it('leaves other levels and the other fields of a row untouched', async () => {
      const { result } = await ready();
      mockReorderAreas.mockResolvedValueOnce([]);

      await act(async () => {
        await result.current.reorder(null, ['b', 'a', 'c']);
      });

      expect(result.current.areas.find((a) => a.id === 'a1')).toEqual(TREE[3]);
      expect(result.current.areas.find((a) => a.id === 'a')).toEqual({ ...TREE[0], sortOrder: 1 });
    });

    it('reorders the children of a parent', async () => {
      const { result } = await ready();
      mockFetchAreasWithCounts.mockResolvedValueOnce(TREE);
      mockReorderAreas.mockResolvedValueOnce([]);

      await act(async () => {
        await result.current.reorder('a', ['a1']);
      });

      expect(mockReorderAreas).toHaveBeenCalledWith({ parentId: 'a', ids: ['a1'] });
    });

    it('rolls back to the previous order and rethrows when the request fails', async () => {
      const { result } = await ready();
      const failure = new Error('409');
      mockReorderAreas.mockRejectedValueOnce(failure);

      let thrown: unknown;
      await act(async () => {
        try {
          await result.current.reorder(null, ['c', 'b', 'a']);
        } catch (error) {
          thrown = error;
        }
      });

      expect(thrown).toBe(failure);
      expect(order(result.current.areas, null)).toEqual(['a', 'b', 'c']);
      expect(result.current.areas).toEqual(TREE);
    });

    it('a reload still in flight cannot undo the move', async () => {
      mockFetchAreasWithCounts.mockResolvedValueOnce(TREE);
      const { result } = renderHook(() => useAreasIndex());
      await waitFor(() => expect(result.current.status).toBe('ready'));

      const stale = deferred<AreaWithCounts[]>();
      mockFetchAreasWithCounts.mockReturnValueOnce(stale.promise);
      let reload: Promise<readonly AreaWithCounts[] | null> = Promise.resolve(null);
      act(() => {
        reload = result.current.refetch();
      });
      mockReorderAreas.mockResolvedValueOnce([]);
      await act(async () => {
        await result.current.reorder(null, ['b', 'a', 'c']);
      });
      await act(async () => {
        stale.resolve(TREE);
        await reload;
      });

      expect(order(result.current.areas, null)).toEqual(['b', 'a', 'c']);
    });
  });

  describe('remove', () => {
    const UNDO = { token: 'undo-1', expiresAt: '2026-01-01T00:00:30.000Z' };

    it('deletes, reloads and resolves with the Undo token', async () => {
      mockFetchAreasWithCounts.mockResolvedValueOnce(TREE);
      const { result } = renderHook(() => useAreasIndex());
      await waitFor(() => expect(result.current.status).toBe('ready'));

      mockDeleteArea.mockResolvedValueOnce({ undo: UNDO });
      mockFetchAreasWithCounts.mockResolvedValueOnce([TREE[0]!, TREE[2]!]);
      let token: unknown;
      await act(async () => {
        token = await result.current.remove('b');
      });

      expect(mockDeleteArea).toHaveBeenCalledWith('b');
      expect(token).toEqual(UNDO);
      expect(mockFetchAreasWithCounts).toHaveBeenCalledTimes(2);
      expect(result.current.areas.map((a) => a.id)).toEqual(['a', 'c']);
    });

    it('rejects with the error and does not reload when the delete fails', async () => {
      mockFetchAreasWithCounts.mockResolvedValueOnce(TREE);
      const { result } = renderHook(() => useAreasIndex());
      await waitFor(() => expect(result.current.status).toBe('ready'));

      const failure = new Error('in use');
      mockDeleteArea.mockRejectedValueOnce(failure);
      let thrown: unknown;
      await act(async () => {
        try {
          await result.current.remove('b');
        } catch (error) {
          thrown = error;
        }
      });

      expect(thrown).toBe(failure);
      expect(mockFetchAreasWithCounts).toHaveBeenCalledTimes(1);
      expect(result.current.areas).toEqual(TREE);
    });
  });
});
