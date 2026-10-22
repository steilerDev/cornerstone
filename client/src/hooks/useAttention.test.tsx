/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { AttentionResponse } from '@cornerstone/shared';
import { ApiClientError } from '../lib/apiClient.js';
import type * as HookModule from './useAttention.js';
import { makeAttention, makeRow } from '../test/attentionFixtures.js';

const mockGetAttention =
  jest.fn<(opts?: { includeSnoozed?: boolean }) => Promise<AttentionResponse>>();

jest.unstable_mockModule('../lib/attentionApi.js', () => ({
  getAttention: mockGetAttention,
}));

let useAttention: typeof HookModule.useAttention;
let removeAttentionRow: typeof HookModule.removeAttentionRow;

beforeEach(async () => {
  if (!useAttention) ({ useAttention, removeAttentionRow } = await import('./useAttention.js'));
  mockGetAttention.mockReset();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const group = (ids: string[]) =>
  makeRow('N2', {
    subject: { type: 'group', id: 'n2', label: null, area: null },
    params: {
      kind: 'group',
      plannedStartDate: '2026-03-06',
      items: ids.map((id) => ({
        id,
        label: `Task ${id}`,
        area: null,
        daysLate: 2,
        holdsUp: { count: 0, startingWithin14Days: 0 },
      })),
    } as never,
  });

describe('useAttention: loading', () => {
  it('starts loading, then exposes the data once', async () => {
    const data = makeAttention([makeRow('N1')]);
    mockGetAttention.mockResolvedValue(data);
    const { result } = renderHook(() => useAttention());
    expect(result.current.status).toBe('loading');
    expect(result.current.data).toBeNull();
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.data).toBe(data);
    expect(result.current.error).toBeNull();
    expect(result.current.includeSnoozed).toBe(false);
    expect(mockGetAttention).toHaveBeenCalledTimes(1);
    expect(mockGetAttention).toHaveBeenCalledWith({ includeSnoozed: false });
  });

  it('reports an API error code', async () => {
    mockGetAttention.mockRejectedValue(
      new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'raw' }),
    );
    const { result } = renderHook(() => useAttention());
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toEqual({ code: 'INTERNAL_ERROR' });
  });

  it('reports a null code for a non-API error', async () => {
    mockGetAttention.mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useAttention());
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toEqual({ code: null });
  });

  it('retry shows the skeleton again and recovers', async () => {
    mockGetAttention.mockRejectedValueOnce(new Error('network'));
    const { result } = renderHook(() => useAttention());
    await waitFor(() => expect(result.current.status).toBe('error'));
    const retry = deferred<AttentionResponse>();
    mockGetAttention.mockReturnValueOnce(retry.promise);
    act(() => result.current.retry());
    expect(result.current.status).toBe('loading');
    expect(result.current.error).toBeNull();
    await act(async () => retry.resolve(makeAttention([makeRow('N1')])));
    expect(result.current.status).toBe('ready');
    expect(result.current.data?.rows).toHaveLength(1);
  });

  it('a failed refresh before any data shows the error', async () => {
    mockGetAttention.mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useAttention());
    await waitFor(() => expect(result.current.status).toBe('error'));
    act(() => result.current.refresh());
    await waitFor(() => expect(mockGetAttention).toHaveBeenCalledTimes(2));
    expect(result.current.status).toBe('error');
  });
});

describe('useAttention: refresh', () => {
  it('refetches without a skeleton and replaces the data', async () => {
    mockGetAttention.mockResolvedValueOnce(makeAttention([makeRow('N1')]));
    const { result } = renderHook(() => useAttention());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    const next = deferred<AttentionResponse>();
    mockGetAttention.mockReturnValueOnce(next.promise);
    act(() => result.current.refresh());
    expect(result.current.status).toBe('ready');
    expect(result.current.data?.rows).toHaveLength(1);
    await act(async () => next.resolve(makeAttention([])));
    expect(result.current.data?.rows).toHaveLength(0);
  });

  it('keeps the data on screen when a refresh fails', async () => {
    const first = makeAttention([makeRow('N1')]);
    mockGetAttention.mockResolvedValueOnce(first);
    const { result } = renderHook(() => useAttention());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    mockGetAttention.mockRejectedValueOnce(new Error('network'));
    act(() => result.current.refresh());
    await waitFor(() => expect(mockGetAttention).toHaveBeenCalledTimes(2));
    expect(result.current.status).toBe('ready');
    expect(result.current.data).toBe(first);
    expect(result.current.error).toBeNull();
  });

  it('ignores a stale response that arrives after a newer one', async () => {
    const slow = deferred<AttentionResponse>();
    const fast = deferred<AttentionResponse>();
    mockGetAttention.mockReturnValueOnce(slow.promise).mockReturnValueOnce(fast.promise);
    const { result } = renderHook(() => useAttention());
    act(() => result.current.refresh());
    const fresh = makeAttention([makeRow('N3')]);
    await act(async () => fast.resolve(fresh));
    expect(result.current.data).toBe(fresh);
    await act(async () => slow.resolve(makeAttention([makeRow('N1'), makeRow('N4')])));
    expect(result.current.data).toBe(fresh);
  });

  it('ignores a stale failure that arrives after a newer response', async () => {
    const slow = deferred<AttentionResponse>();
    const fast = deferred<AttentionResponse>();
    mockGetAttention.mockReturnValueOnce(slow.promise).mockReturnValueOnce(fast.promise);
    const { result } = renderHook(() => useAttention());
    act(() => result.current.refresh());
    await act(async () => fast.resolve(makeAttention([])));
    await act(async () => slow.reject(new Error('late failure')));
    expect(result.current.status).toBe('ready');
    expect(result.current.error).toBeNull();
  });

  it('does not update state after unmount', async () => {
    const pending = deferred<AttentionResponse>();
    mockGetAttention.mockReturnValueOnce(pending.promise);
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { result, unmount } = renderHook(() => useAttention());
    unmount();
    await act(async () => pending.resolve(makeAttention([])));
    expect(result.current.status).toBe('loading');
    const failing = deferred<AttentionResponse>();
    mockGetAttention.mockReturnValueOnce(failing.promise);
    const second = renderHook(() => useAttention());
    second.unmount();
    await act(async () => failing.reject(new Error('x')));
    expect(second.result.current.status).toBe('loading');
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe('useAttention: includeSnoozed', () => {
  it('refetches with the flag and keeps the data meanwhile', async () => {
    mockGetAttention.mockResolvedValueOnce(makeAttention([makeRow('N1')]));
    const { result } = renderHook(() => useAttention());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    const snoozedRow = makeRow('N3', { snoozedUntil: '2026-03-14' });
    mockGetAttention.mockResolvedValueOnce(makeAttention([makeRow('N1'), snoozedRow]));
    act(() => result.current.setIncludeSnoozed(true));
    expect(result.current.includeSnoozed).toBe(true);
    expect(result.current.status).toBe('ready');
    await waitFor(() => expect(result.current.data?.rows).toHaveLength(2));
    expect(mockGetAttention).toHaveBeenLastCalledWith({ includeSnoozed: true });
  });

  it('keeps asking with the flag on later refreshes and turns it off again', async () => {
    mockGetAttention.mockResolvedValue(makeAttention([]));
    const { result } = renderHook(() => useAttention());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => result.current.setIncludeSnoozed(true));
    act(() => result.current.refresh());
    await waitFor(() => expect(mockGetAttention).toHaveBeenCalledTimes(3));
    expect(mockGetAttention).toHaveBeenLastCalledWith({ includeSnoozed: true });
    act(() => result.current.setIncludeSnoozed(false));
    await waitFor(() => expect(mockGetAttention).toHaveBeenCalledTimes(4));
    expect(mockGetAttention).toHaveBeenLastCalledWith({ includeSnoozed: false });
  });
});

describe('useAttention: removeRow', () => {
  async function ready(data: AttentionResponse) {
    mockGetAttention.mockResolvedValue(data);
    const hook = renderHook(() => useAttention());
    await waitFor(() => expect(hook.result.current.status).toBe('ready'));
    return hook;
  }

  it('does nothing before the data is loaded', () => {
    mockGetAttention.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useAttention());
    act(() => result.current.removeRow('N1:work_item:wi-1', 'done'));
    expect(result.current.data).toBeNull();
  });

  it('removes a row optimistically and lowers the count', async () => {
    const n1 = makeRow('N1');
    const { result } = await ready(makeAttention([n1, makeRow('N3')]));
    act(() => result.current.removeRow(n1.key, 'done'));
    expect(result.current.data?.rows.map((r) => r.key)).not.toContain(n1.key);
    expect(result.current.data?.count).toBe(1);
    expect(result.current.data?.snoozedCount).toBe(0);
  });

  it('raises snoozedCount for Not now', async () => {
    const n3 = makeRow('N3');
    const { result } = await ready(makeAttention([n3]));
    act(() => result.current.removeRow(n3.key, 'notNow'));
    expect(result.current.data?.count).toBe(0);
    expect(result.current.data?.snoozedCount).toBe(1);
  });
});

describe('removeAttentionRow', () => {
  const tasks = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      makeRow('N1', { subject: { type: 'work_item', id: `t${i}`, label: `T${i}`, area: null } }),
    );

  it('lowers the late-task count of the catch-up and keeps it at 3 or more', () => {
    const rows = tasks(4);
    const data = makeAttention(rows, [], { catchUp: { lateTaskCount: 4 } });
    const next = removeAttentionRow(data, (rows[0] as { key: string }).key, 'done');
    expect(next.catchUp).toEqual({ lateTaskCount: 3 });
    expect(next.count).toBe(3);
  });

  it('drops the catch-up below 3 late tasks', () => {
    const rows = tasks(3);
    const data = makeAttention(rows, [], { catchUp: { lateTaskCount: 3 } });
    const next = removeAttentionRow(data, (rows[0] as { key: string }).key, 'done');
    expect(next.catchUp).toBeNull();
  });

  it('keeps a missing catch-up missing', () => {
    const rows = tasks(2);
    const next = removeAttentionRow(makeAttention(rows), (rows[0] as { key: string }).key, 'done');
    expect(next.catchUp).toBeNull();
  });

  it('counts a late N2 task like an N1 task', () => {
    const n2 = makeRow('N2');
    const rows = [...tasks(3), n2];
    const next = removeAttentionRow(
      makeAttention(rows, [], { catchUp: { lateTaskCount: 4 } }),
      n2.key,
      'done',
    );
    expect(next.catchUp).toEqual({ lateTaskCount: 3 });
  });

  it('does not touch the catch-up when a non-task row leaves', () => {
    const n3 = makeRow('N3');
    const next = removeAttentionRow(
      makeAttention([n3, ...tasks(3)], [], { catchUp: { lateTaskCount: 3 } }),
      n3.key,
      'done',
    );
    expect(next.catchUp).toEqual({ lateTaskCount: 3 });
    expect(next.count).toBe(3);
  });

  it('removes a whole group and lowers the late-task count by its size', () => {
    const g = group(['a', 'b', 'c']);
    const next = removeAttentionRow(
      makeAttention([g, ...tasks(1)], [], { catchUp: { lateTaskCount: 4 } }),
      g.key,
      'notNow',
    );
    expect(next.catchUp).toBeNull();
    expect(next.count).toBe(1);
    expect(next.snoozedCount).toBe(1);
  });

  it('does not lower counts for a snoozed row', () => {
    const snoozed = makeRow('N3', { snoozedUntil: '2026-03-14' });
    const live = makeRow('N1');
    const data = makeAttention([snoozed, live], [], { count: 1, snoozedCount: 1 });
    const next = removeAttentionRow(data, snoozed.key, 'done');
    expect(next.count).toBe(1);
    expect(next.snoozedCount).toBe(1);
    expect(next.rows).toEqual([live]);
  });

  it('never lets the count go below zero', () => {
    const n3 = makeRow('N3');
    const next = removeAttentionRow(makeAttention([n3], [], { count: 0 }), n3.key, 'done');
    expect(next.count).toBe(0);
  });

  it('removes a tidy-up row without touching the count', () => {
    const h4 = makeRow('H4');
    const n1 = makeRow('N1');
    const next = removeAttentionRow(makeAttention([n1], [h4]), h4.key, 'done');
    expect(next.tidyUp).toEqual([]);
    expect(next.count).toBe(1);
    expect(next.rows).toEqual([n1]);
  });

  it('removes one member of a group by its synthesized catch-up key', () => {
    const g = group(['a', 'b', 'c']);
    const data = makeAttention([g], [], { catchUp: { lateTaskCount: 3 } });
    const next = removeAttentionRow(data, 'N2:work_item:b', 'done');
    const params = next.rows[0]?.params;
    expect(
      params?.rule === 'N2' && params.kind === 'group' && params.items.map((i) => i.id),
    ).toEqual(['a', 'c']);
    expect(next.count).toBe(1);
    expect(next.catchUp).toBeNull();
  });

  it('removes the group and lowers the count when its last member leaves', () => {
    const g = group(['a']);
    const next = removeAttentionRow(makeAttention([g, ...tasks(1)]), 'N2:work_item:a', 'done');
    expect(next.rows).toHaveLength(1);
    expect(next.count).toBe(1);
  });

  it('leaves other groups and rows alone when a member key matches none of them', () => {
    const g = group(['a']);
    const data = makeAttention([g, ...tasks(1)]);
    expect(removeAttentionRow(data, 'N2:work_item:zzz', 'done')).toBe(data);
  });

  it('returns the same object for an unknown key', () => {
    const data = makeAttention([makeRow('N1')]);
    expect(removeAttentionRow(data, 'N9:invoice:nope', 'done')).toBe(data);
  });
});
