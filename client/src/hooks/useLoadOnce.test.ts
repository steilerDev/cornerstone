import { describe, it, expect, jest } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useLoadOnce } from './useLoadOnce.js';

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve: (v: T) => void = () => {};
  let reject: (e: unknown) => void = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useLoadOnce', () => {
  it('starts loading, calls load once on mount and becomes ready with the data', async () => {
    const load = jest.fn<() => Promise<string>>().mockResolvedValue('A');
    const { result } = renderHook(() => useLoadOnce(load));

    expect(result.current.status).toBe('loading');
    expect(result.current.data).toBeNull();

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.data).toBe('A');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('goes to error with no data when the first load fails', async () => {
    const load = jest.fn<() => Promise<string>>().mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useLoadOnce(load));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.data).toBeNull();
  });

  it('reload shows loading again and then the fresh data', async () => {
    const load = jest.fn<() => Promise<string>>().mockResolvedValueOnce('A');
    const { result } = renderHook(() => useLoadOnce(load));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    const next = deferred<string>();
    load.mockReturnValueOnce(next.promise);
    act(() => result.current.reload());

    expect(result.current.status).toBe('loading');
    await act(async () => next.resolve('B'));
    expect(result.current.status).toBe('ready');
    expect(result.current.data).toBe('B');
  });

  it('reload from the error state retries and recovers', async () => {
    const load = jest
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce('A');
    const { result } = renderHook(() => useLoadOnce(load));
    await waitFor(() => expect(result.current.status).toBe('error'));

    act(() => result.current.reload());

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.data).toBe('A');
  });

  it('refresh keeps the data on screen while loading (no skeleton) and then swaps it', async () => {
    const load = jest.fn<() => Promise<string>>().mockResolvedValueOnce('A');
    const { result } = renderHook(() => useLoadOnce(load));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    const next = deferred<string>();
    load.mockReturnValueOnce(next.promise);
    act(() => result.current.refresh());

    expect(result.current.status).toBe('ready');
    expect(result.current.data).toBe('A');
    await act(async () => next.resolve('B'));
    expect(result.current.data).toBe('B');
  });

  it('a refresh failure with existing data keeps ready and the data', async () => {
    const load = jest.fn<() => Promise<string>>().mockResolvedValueOnce('A');
    const { result } = renderHook(() => useLoadOnce(load));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    const next = deferred<string>();
    load.mockReturnValueOnce(next.promise);
    act(() => result.current.refresh());
    await act(async () => next.reject(new Error('offline')));

    expect(result.current.status).toBe('ready');
    expect(result.current.data).toBe('A');
  });

  it('a refresh failure with no data goes to error', async () => {
    const first = deferred<string>();
    const load = jest.fn<() => Promise<string>>().mockReturnValueOnce(first.promise);
    const { result } = renderHook(() => useLoadOnce(load));

    // The first load is still pending, so nothing is on screen yet; a refresh supersedes it.
    const second = deferred<string>();
    load.mockReturnValueOnce(second.promise);
    act(() => result.current.refresh());
    await act(async () => second.reject(new Error('offline')));

    expect(result.current.status).toBe('error');
    expect(result.current.data).toBeNull();
  });

  it('a reload failure shows the error even though data was loaded before', async () => {
    const load = jest.fn<() => Promise<string>>().mockResolvedValueOnce('A');
    const { result } = renderHook(() => useLoadOnce(load));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    load.mockRejectedValueOnce(new Error('offline'));
    act(() => result.current.reload());

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.data).toBe('A');
  });

  it('ignores a stale earlier response that arrives after a newer one', async () => {
    const first = deferred<string>();
    const load = jest.fn<() => Promise<string>>().mockReturnValueOnce(first.promise);
    const { result } = renderHook(() => useLoadOnce(load));

    const second = deferred<string>();
    load.mockReturnValueOnce(second.promise);
    act(() => result.current.reload());

    await act(async () => second.resolve('new'));
    expect(result.current.data).toBe('new');

    await act(async () => first.resolve('stale'));
    expect(result.current.data).toBe('new');
    expect(result.current.status).toBe('ready');
  });

  it('ignores a stale earlier failure that arrives after a newer success', async () => {
    const first = deferred<string>();
    const load = jest.fn<() => Promise<string>>().mockReturnValueOnce(first.promise);
    const { result } = renderHook(() => useLoadOnce(load));

    const second = deferred<string>();
    load.mockReturnValueOnce(second.promise);
    act(() => result.current.reload());
    await act(async () => second.resolve('new'));

    await act(async () => first.reject(new Error('late failure')));

    expect(result.current.status).toBe('ready');
    expect(result.current.data).toBe('new');
  });

  it('makes no state update after unmount, for a success or a failure', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const ok = deferred<string>();
    const okLoad = jest.fn<() => Promise<string>>().mockReturnValue(ok.promise);
    const okView = renderHook(() => useLoadOnce(okLoad));
    okView.unmount();
    await act(async () => ok.resolve('A'));

    const bad = deferred<string>();
    const badLoad = jest.fn<() => Promise<string>>().mockReturnValue(bad.promise);
    const badView = renderHook(() => useLoadOnce(badLoad));
    badView.unmount();
    await act(async () => bad.reject(new Error('offline')));

    expect(okView.result.current.status).toBe('loading');
    expect(okView.result.current.data).toBeNull();
    expect(badView.result.current.status).toBe('loading');
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('loads again when the load function itself changes', async () => {
    const loadA = jest.fn<() => Promise<string>>().mockResolvedValue('A');
    const loadB = jest.fn<() => Promise<string>>().mockResolvedValue('B');
    const { result, rerender } = renderHook(({ load }) => useLoadOnce(load), {
      initialProps: { load: loadA },
    });
    await waitFor(() => expect(result.current.data).toBe('A'));

    rerender({ load: loadB });

    await waitFor(() => expect(result.current.data).toBe('B'));
    expect(loadA).toHaveBeenCalledTimes(1);
    expect(loadB).toHaveBeenCalledTimes(1);
  });
});
