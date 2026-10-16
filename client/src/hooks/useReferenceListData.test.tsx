/**
 * @jest-environment jsdom
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react';
import { ApiClientError } from '../lib/apiClient.js';
import { useReferenceListData } from './useReferenceListData.js';
import type { ReferenceListAdapter } from './useReferenceListData.js';

interface Row {
  id: string;
  name: string;
}

const A: Row = { id: 'a', name: 'Alpha' };
const B: Row = { id: 'b', name: 'Bravo' };
const C: Row = { id: 'c', name: 'Charlie' };

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (reason: unknown) => void = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useReferenceListData', () => {
  let adapter: jest.Mocked<ReferenceListAdapter<Row, { name: string }, { name?: string }>>;

  beforeEach(() => {
    adapter = {
      list: jest.fn<ReferenceListAdapter<Row, { name: string }, { name?: string }>['list']>(),
      create: jest.fn<ReferenceListAdapter<Row, { name: string }, { name?: string }>['create']>(),
      update: jest.fn<ReferenceListAdapter<Row, { name: string }, { name?: string }>['update']>(),
      remove: jest.fn<ReferenceListAdapter<Row, { name: string }, { name?: string }>['remove']>(),
      reorder: jest.fn<ReferenceListAdapter<Row, { name: string }, { name?: string }>['reorder']>(),
    };
    adapter.list.mockResolvedValue([A, B, C]);
  });

  async function ready() {
    const view = renderHook(() => useReferenceListData(adapter));
    await waitFor(() => expect(view.result.current.status).toBe('ready'));
    return view;
  }

  it('starts loading and then exposes the rows', async () => {
    const view = renderHook(() => useReferenceListData(adapter));

    expect(view.result.current.status).toBe('loading');
    expect(view.result.current.rows).toEqual([]);
    await waitFor(() => expect(view.result.current.status).toBe('ready'));
    expect(view.result.current.rows).toEqual([A, B, C]);
  });

  it('loads once; a rerender does not reload', async () => {
    const view = await ready();

    view.rerender();
    view.rerender();

    expect(adapter.list).toHaveBeenCalledTimes(1);
  });

  it('reports an error when the load fails and recovers on retry', async () => {
    adapter.list.mockRejectedValueOnce(new Error('offline'));
    const view = renderHook(() => useReferenceListData(adapter));
    await waitFor(() => expect(view.result.current.status).toBe('error'));

    act(() => view.result.current.retry());

    expect(view.result.current.status).toBe('loading');
    await waitFor(() => expect(view.result.current.status).toBe('ready'));
    expect(adapter.list).toHaveBeenCalledTimes(2);
    expect(view.result.current.rows).toEqual([A, B, C]);
  });

  it('create appends the returned row', async () => {
    const view = await ready();
    const created = { id: 'd', name: 'Delta' };
    adapter.create.mockResolvedValue(created);

    let returned: Row | undefined;
    await act(async () => {
      returned = await view.result.current.create({ name: 'Delta' });
    });

    expect(adapter.create).toHaveBeenCalledWith({ name: 'Delta' });
    expect(returned).toEqual(created);
    expect(view.result.current.rows).toEqual([A, B, C, created]);
  });

  it('create failure rethrows and leaves the rows alone', async () => {
    const view = await ready();
    adapter.create.mockRejectedValue(new Error('nope'));

    await act(async () => {
      await expect(view.result.current.create({ name: 'Delta' })).rejects.toThrow('nope');
    });

    expect(view.result.current.rows).toEqual([A, B, C]);
  });

  it('update replaces the row in place', async () => {
    const view = await ready();
    const renamed = { id: 'b', name: 'Bravo 2' };
    adapter.update.mockResolvedValue(renamed);

    await act(async () => {
      await view.result.current.update('b', { name: 'Bravo 2' });
    });

    expect(adapter.update).toHaveBeenCalledWith('b', { name: 'Bravo 2' });
    expect(view.result.current.rows).toEqual([A, renamed, C]);
  });

  it('remove filters the row out', async () => {
    const view = await ready();
    adapter.remove.mockResolvedValue(undefined);

    await act(async () => {
      await view.result.current.remove('a');
    });

    expect(view.result.current.rows).toEqual([B, C]);
  });

  it('remove failure rethrows and keeps the row', async () => {
    const view = await ready();
    adapter.remove.mockRejectedValue(new Error('in use'));

    await act(async () => {
      await expect(view.result.current.remove('a')).rejects.toThrow('in use');
    });

    expect(view.result.current.rows).toEqual([A, B, C]);
  });

  it('reorder is optimistic, then takes the server rows', async () => {
    const view = await ready();
    const pending = deferred<Row[]>();
    adapter.reorder.mockReturnValue(pending.promise);

    let promise: Promise<void> = Promise.resolve();
    act(() => {
      promise = view.result.current.reorder(['c', 'a', 'b']);
    });

    expect(view.result.current.rows.map((r) => r.id)).toEqual(['c', 'a', 'b']);
    const server = [{ id: 'c', name: 'Charlie (server)' }, A, B];
    await act(async () => {
      pending.resolve(server);
      await promise;
    });

    expect(adapter.reorder).toHaveBeenCalledWith(['c', 'a', 'b']);
    expect(view.result.current.rows).toEqual(server);
  });

  it('reorder failure restores the previous rows and rethrows', async () => {
    const view = await ready();
    const failure = new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'x' });
    adapter.reorder.mockRejectedValue(failure);

    await act(async () => {
      await expect(view.result.current.reorder(['c', 'b', 'a'])).rejects.toBe(failure);
    });

    expect(view.result.current.rows).toEqual([A, B, C]);
    expect(adapter.list).toHaveBeenCalledTimes(1);
  });

  it('REORDER_SET_MISMATCH reloads the list before rethrowing, without showing loading', async () => {
    const view = await ready();
    const failure = new ApiClientError(409, {
      code: 'REORDER_SET_MISMATCH',
      message: 'x',
    });
    adapter.reorder.mockRejectedValue(failure);
    const fresh = [C, A];
    adapter.list.mockResolvedValue(fresh);

    await act(async () => {
      await expect(view.result.current.reorder(['c', 'b', 'a'])).rejects.toBe(failure);
    });

    expect(adapter.list).toHaveBeenCalledTimes(2);
    expect(view.result.current.rows).toEqual(fresh);
    expect(view.result.current.status).toBe('ready');
  });

  it('keeps the restored rows when the re-fetch after a mismatch also fails', async () => {
    const view = await ready();
    const failure = new ApiClientError(409, { code: 'REORDER_SET_MISMATCH', message: 'x' });
    adapter.reorder.mockRejectedValue(failure);
    adapter.list.mockRejectedValue(new Error('offline'));

    await act(async () => {
      await expect(view.result.current.reorder(['c', 'b', 'a'])).rejects.toBe(failure);
    });

    expect(view.result.current.rows).toEqual([A, B, C]);
    expect(view.result.current.status).toBe('ready');
  });

  it('does not reload for an ordinary conflict code', async () => {
    const view = await ready();
    adapter.reorder.mockRejectedValue(new ApiClientError(409, { code: 'CONFLICT', message: 'x' }));

    await act(async () => {
      await expect(view.result.current.reorder(['c', 'b', 'a'])).rejects.toBeInstanceOf(
        ApiClientError,
      );
    });

    expect(adapter.list).toHaveBeenCalledTimes(1);
  });

  it('skips the optimistic step when the ids do not match the rows, still calls the server', async () => {
    const view = await ready();
    adapter.reorder.mockResolvedValue([A]);

    await act(async () => {
      await view.result.current.reorder(['a']);
    });

    expect(view.result.current.rows).toEqual([A]);
  });

  it('ignores a load that resolves after unmount', async () => {
    const pending = deferred<Row[]>();
    adapter.list.mockReturnValue(pending.promise);
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const view = renderHook(() => useReferenceListData(adapter));

    view.unmount();
    await act(async () => {
      pending.resolve([A]);
    });

    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('ignores a failed load that settles after unmount', async () => {
    const pending = deferred<Row[]>();
    adapter.list.mockReturnValue(pending.promise);
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const view = renderHook(() => useReferenceListData(adapter));

    view.unmount();
    await act(async () => {
      pending.reject(new Error('late'));
    });

    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('ignores a stale response from a superseded load (retry)', async () => {
    const first = deferred<Row[]>();
    const second = deferred<Row[]>();
    adapter.list.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const view = renderHook(() => useReferenceListData(adapter));

    act(() => view.result.current.retry());
    await act(async () => {
      second.resolve([B]);
    });
    await act(async () => {
      first.resolve([A]);
    });

    expect(view.result.current.rows).toEqual([B]);
  });
});
