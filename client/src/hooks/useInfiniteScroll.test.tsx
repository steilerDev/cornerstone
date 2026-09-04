/**
 * @jest-environment jsdom
 *
 * Unit tests for useInfiniteScroll (Issue #2060 — Diary infinite-scroll rework).
 *
 * Covers the state machine (idle/loading/error/done), page-counter bookkeeping,
 * dedupe of concurrent loadMore() calls, retry-same-page semantics, IntersectionObserver
 * wiring/teardown, and the resetKey-driven reset-and-refetch behavior.
 *
 * jsdom does not implement IntersectionObserver. Following the established local-mock
 * pattern used in PhotoAnnotator.test.tsx for ResizeObserver, a small MockIntersectionObserver
 * class is defined here and installed/restored per test rather than touching the shared
 * setupTests.ts.
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { act, render, renderHook, waitFor } from '@testing-library/react';
import type { InfiniteScrollPage } from './useInfiniteScroll.js';
import { useInfiniteScroll } from './useInfiniteScroll.js';

// ─── IntersectionObserver mock ──────────────────────────────────────────────

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];
  callback: IntersectionObserverCallback;
  constructor(cb: IntersectionObserverCallback) {
    this.callback = cb;
    MockIntersectionObserver.instances.push(this);
  }
  observe = jest.fn();
  disconnect = jest.fn();
  unobserve = jest.fn();
  trigger(isIntersecting: boolean) {
    this.callback(
      [{ isIntersecting } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}

let originalIntersectionObserver: typeof IntersectionObserver | undefined;

beforeEach(() => {
  MockIntersectionObserver.instances = [];
  originalIntersectionObserver = globalThis.IntersectionObserver;
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver =
    MockIntersectionObserver;
});

afterEach(() => {
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver =
    originalIntersectionObserver;
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function page<T>(items: T[], hasMore: boolean): InfiniteScrollPage<T> {
  return { items, hasMore };
}

/** Mounts the hook attached to a real sentinel <div>, so the IntersectionObserver
 * effect (which only attaches once `sentinelNode` is non-null) actually runs. */
function renderWithSentinel<T>(options: {
  fetchPage: (page: number) => Promise<InfiniteScrollPage<T>>;
  resetKey: string;
}) {
  const results: ReturnType<typeof useInfiniteScroll<T>>[] = [];
  function Harness(props: { resetKey: string }) {
    const hook = useInfiniteScroll<T>({ fetchPage: options.fetchPage, resetKey: props.resetKey });
    results.push(hook);
    return <div data-testid="sentinel" ref={hook.sentinelRef} />;
  }
  const view = render(<Harness resetKey={options.resetKey} />);
  return {
    ...view,
    latest: () => results[results.length - 1]!,
  };
}

describe('useInfiniteScroll', () => {
  // ─── Mount / initial load ───────────────────────────────────────────────────

  it('calls fetchPage(1) exactly once on mount and transitions idle -> loading -> idle when hasMore is true', async () => {
    const fetchPage = jest.fn<(p: number) => Promise<InfiniteScrollPage<string>>>();
    fetchPage.mockResolvedValueOnce(page(['a', 'b'], true));

    const { result } = renderHook(() => useInfiniteScroll({ fetchPage, resetKey: 'k' }));

    expect(result.current.status).toBe('loading');

    await waitFor(() => expect(result.current.status).toBe('idle'));

    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(fetchPage).toHaveBeenCalledWith(1);
    expect(result.current.items).toEqual(['a', 'b']);
    expect(result.current.hasMore).toBe(true);
  });

  it('transitions to "done" on mount when the first page reports hasMore=false', async () => {
    const fetchPage = jest.fn<(p: number) => Promise<InfiniteScrollPage<string>>>();
    fetchPage.mockResolvedValueOnce(page(['only'], false));

    const { result } = renderHook(() => useInfiniteScroll({ fetchPage, resetKey: 'k' }));

    await waitFor(() => expect(result.current.status).toBe('done'));
    expect(result.current.hasMore).toBe(false);
    expect(result.current.items).toEqual(['only']);
  });

  // ─── loadMore ────────────────────────────────────────────────────────────────

  it('loadMore() while idle fetches the next page and appends items, preserving order with no duplication', async () => {
    const fetchPage = jest.fn<(p: number) => Promise<InfiniteScrollPage<string>>>();
    fetchPage.mockResolvedValueOnce(page(['a', 'b'], true));
    fetchPage.mockResolvedValueOnce(page(['c', 'd'], true));

    const { result } = renderHook(() => useInfiniteScroll({ fetchPage, resetKey: 'k' }));
    await waitFor(() => expect(result.current.status).toBe('idle'));

    act(() => result.current.loadMore());

    await waitFor(() => expect(fetchPage).toHaveBeenCalledTimes(2));
    expect(fetchPage).toHaveBeenNthCalledWith(2, 2);

    await waitFor(() => expect(result.current.status).toBe('idle'));
    expect(result.current.items).toEqual(['a', 'b', 'c', 'd']);
  });

  // ─── Dedupe ──────────────────────────────────────────────────────────────────

  it('dedupes two loadMore() calls fired back-to-back while the first is still in flight', async () => {
    let resolveSecondFetch: ((v: InfiniteScrollPage<string>) => void) | undefined;
    const deferred = new Promise<InfiniteScrollPage<string>>((resolve) => {
      resolveSecondFetch = resolve;
    });

    const fetchPage = jest.fn<(p: number) => Promise<InfiniteScrollPage<string>>>();
    fetchPage.mockResolvedValueOnce(page(['a'], true)); // initial mount, page 1
    fetchPage.mockImplementationOnce(() => deferred); // page 2, held open

    const { result } = renderHook(() => useInfiniteScroll({ fetchPage, resetKey: 'k' }));
    await waitFor(() => expect(result.current.status).toBe('idle'));

    act(() => {
      result.current.loadMore();
      result.current.loadMore();
    });

    // Only one call for page 2 despite two loadMore() invocations in the same tick.
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(fetchPage).toHaveBeenNthCalledWith(2, 2);

    await act(async () => {
      resolveSecondFetch?.(page(['b'], true));
      await deferred;
    });

    await waitFor(() => expect(result.current.status).toBe('idle'));
    // Still exactly one call for page 2 — no follow-up call was queued by the dupe.
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(result.current.items).toEqual(['a', 'b']);
  });

  // ─── IntersectionObserver wiring ─────────────────────────────────────────────

  it('firing the intersection observer (isIntersecting=true) while idle triggers the same loadMore path as the button', async () => {
    const fetchPage = jest.fn<(p: number) => Promise<InfiniteScrollPage<string>>>();
    fetchPage.mockResolvedValueOnce(page(['a'], true));
    fetchPage.mockResolvedValueOnce(page(['b'], true));

    const view = renderWithSentinel<string>({ fetchPage, resetKey: 'k' });
    await waitFor(() => expect(view.latest().status).toBe('idle'));

    expect(MockIntersectionObserver.instances).toHaveLength(1);
    act(() => {
      MockIntersectionObserver.instances[0]!.trigger(true);
    });

    await waitFor(() => expect(fetchPage).toHaveBeenCalledTimes(2));
    expect(fetchPage).toHaveBeenNthCalledWith(2, 2);
    await waitFor(() => expect(view.latest().items).toEqual(['a', 'b']));
  });

  it('firing the intersection observer while status is "error" is a no-op', async () => {
    const fetchPage = jest.fn<(p: number) => Promise<InfiniteScrollPage<string>>>();
    fetchPage.mockResolvedValueOnce(page(['a'], true));
    fetchPage.mockRejectedValueOnce(new Error('boom'));

    const view = renderWithSentinel<string>({ fetchPage, resetKey: 'k' });
    await waitFor(() => expect(view.latest().status).toBe('idle'));

    act(() => view.latest().loadMore());
    await waitFor(() => expect(view.latest().status).toBe('error'));
    expect(fetchPage).toHaveBeenCalledTimes(2);

    act(() => {
      MockIntersectionObserver.instances[0]!.trigger(true);
    });

    // No additional fetchPage call — the observer callback no-ops on error.
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(view.latest().status).toBe('error');
  });

  it('disconnects the IntersectionObserver on unmount', async () => {
    const fetchPage = jest.fn<(p: number) => Promise<InfiniteScrollPage<string>>>();
    fetchPage.mockResolvedValueOnce(page(['a'], true));

    const view = renderWithSentinel<string>({ fetchPage, resetKey: 'k' });
    await waitFor(() => expect(view.latest().status).toBe('idle'));

    expect(MockIntersectionObserver.instances).toHaveLength(1);
    const instance = MockIntersectionObserver.instances[0]!;
    expect(instance.disconnect).not.toHaveBeenCalled();

    view.unmount();

    expect(instance.disconnect).toHaveBeenCalledTimes(1);
  });

  // ─── retry() ─────────────────────────────────────────────────────────────────

  it('retry() re-issues the SAME page that failed, and does not advance the page counter on failure', async () => {
    const fetchPage = jest.fn<(p: number) => Promise<InfiniteScrollPage<string>>>();
    fetchPage.mockResolvedValueOnce(page(['a'], true)); // mount: page 1 succeeds
    fetchPage.mockRejectedValueOnce(new Error('network down')); // loadMore: page 2 fails
    fetchPage.mockResolvedValueOnce(page(['b'], true)); // retry: page 2 succeeds

    const { result } = renderHook(() => useInfiniteScroll({ fetchPage, resetKey: 'k' }));
    await waitFor(() => expect(result.current.status).toBe('idle'));

    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(fetchPage).toHaveBeenNthCalledWith(2, 2);
    // The failed fetch must not have mutated items.
    expect(result.current.items).toEqual(['a']);

    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe('idle'));

    // Retry used the SAME page number (2) as the failed attempt — not 3.
    expect(fetchPage).toHaveBeenNthCalledWith(3, 2);
    // No gap or duplicate: exactly the first batch followed by the retried batch.
    expect(result.current.items).toEqual(['a', 'b']);
  });

  it('retry() is a no-op unless status is "error"', async () => {
    const fetchPage = jest.fn<(p: number) => Promise<InfiniteScrollPage<string>>>();
    fetchPage.mockResolvedValueOnce(page(['a'], true));

    const { result } = renderHook(() => useInfiniteScroll({ fetchPage, resetKey: 'k' }));
    await waitFor(() => expect(result.current.status).toBe('idle'));

    act(() => result.current.retry());

    // Still just the one mount call — retry() did nothing while idle.
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('idle');
  });

  // ─── resetKey ────────────────────────────────────────────────────────────────

  it('changing resetKey clears items, resets to page 1, and issues a fresh fetchPage(1) call', async () => {
    const fetchPage = jest.fn<(p: number) => Promise<InfiniteScrollPage<string>>>();
    fetchPage.mockResolvedValueOnce(page(['a'], true));
    fetchPage.mockResolvedValueOnce(page(['x', 'y'], false));

    const { result, rerender } = renderHook(
      ({ resetKey }: { resetKey: string }) => useInfiniteScroll({ fetchPage, resetKey }),
      { initialProps: { resetKey: 'k1' } },
    );
    await waitFor(() => expect(result.current.status).toBe('idle'));
    expect(result.current.items).toEqual(['a']);

    rerender({ resetKey: 'k2' });

    await waitFor(() => expect(result.current.status).toBe('done'));
    expect(fetchPage).toHaveBeenNthCalledWith(2, 1);
    expect(result.current.items).toEqual(['x', 'y']);
  });

  // ─── FINDING: mid-flight reset race ──────────────────────────────────────────
  // If resetKey changes while a loadMore() fetch (page >= 2) from the PREVIOUS
  // resetKey is still in flight, runFetch(1) issued by the reset effect is
  // swallowed by the `inFlightRef` guard (it is still `true` from the pending
  // call), so no fresh page-1 request is ever made. When the stale in-flight
  // promise later resolves, its handler still closes over the OLD page number
  // and unconditionally does `setItems((prev) => [...prev, ...result.items])`
  // (since that closed-over page !== 1), appending the stale batch onto the
  // freshly-cleared (now empty) `items` array — and `pageRef.current` is set to
  // that stale page + 1, corrupting the counter for the new resetKey's session.
  //
  // This test documents the CORRECT expected behavior per the hook's contract
  // (a resetKey change must always win and reflect only the new key's page-1
  // data). Originally filed as BUG-2060-1 (github.com/steilerDev/cornerstone
  // issues/2061) and kept as `it.failing` while that bug was open — confirmed
  // failing against the pre-fix implementation (fetchPage was never called a
  // 3rd time; the reset's runFetch(1) call was swallowed by the inFlightRef
  // guard). frontend-developer's fix adds an `epochRef` generation counter:
  // bumped on every resetKey change, checked by each fetch's completion
  // handler before it applies any state, and the reset effect now forces
  // `inFlightRef.current = false` so its own runFetch(1) is never swallowed by
  // a still-in-flight stale fetch. Converted back to a normal `it` — verified
  // passing against the fixed hook (see qa-integration-tester's handback
  // report for the run output).
  it('a resetKey change while a stale page>=2 fetch is in flight must not let the stale response leak into the new result set', async () => {
    let resolveStalePage2: ((v: InfiniteScrollPage<string>) => void) | undefined;
    const staleDeferred = new Promise<InfiniteScrollPage<string>>((resolve) => {
      resolveStalePage2 = resolve;
    });

    const fetchPage = jest.fn<(p: number) => Promise<InfiniteScrollPage<string>>>();
    fetchPage.mockResolvedValueOnce(page(['old-a'], true)); // mount under resetKey 'k1', page 1
    fetchPage.mockImplementationOnce(() => staleDeferred); // loadMore under 'k1', page 2 (held open)
    fetchPage.mockResolvedValueOnce(page(['new-a'], false)); // expected fresh page 1 under 'k2'

    const { result, rerender } = renderHook(
      ({ resetKey }: { resetKey: string }) => useInfiniteScroll({ fetchPage, resetKey }),
      { initialProps: { resetKey: 'k1' } },
    );
    await waitFor(() => expect(result.current.status).toBe('idle'));

    act(() => result.current.loadMore()); // page 2 under k1 now in flight, never resolves yet
    await waitFor(() => expect(fetchPage).toHaveBeenCalledTimes(2));

    // Change filters before the in-flight page-2 fetch resolves.
    rerender({ resetKey: 'k2' });

    // The reset issues a fresh fetchPage(1) call for the new key.
    await waitFor(() => expect(fetchPage).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(result.current.items).toEqual(['new-a']));
    // The new key's own page-1 result (hasMore: false) must be reflected —
    // proves this isn't just an items-array coincidence.
    expect(result.current.status).toBe('done');
    expect(result.current.hasMore).toBe(false);

    // Now let the stale k1/page-2 response resolve. It must NOT be appended to
    // the new result set, and must not clobber hasMore/status derived from the
    // new key's own (already-applied) result.
    await act(async () => {
      resolveStalePage2?.(page(['stale-b'], true));
      await staleDeferred;
    });

    expect(result.current.items).toEqual(['new-a']);
    expect(result.current.status).toBe('done');
    expect(result.current.hasMore).toBe(false);
  });

  // ─── fetchSequence / lastBatchCount ──────────────────────────────────────────

  it('increments fetchSequence once per successful fetch and reports lastBatchCount for the most recent batch', async () => {
    const fetchPage = jest.fn<(p: number) => Promise<InfiniteScrollPage<string>>>();
    fetchPage.mockResolvedValueOnce(page(['a', 'b'], true));
    fetchPage.mockResolvedValueOnce(page(['c'], false));

    const { result } = renderHook(() => useInfiniteScroll({ fetchPage, resetKey: 'k' }));

    await waitFor(() => expect(result.current.fetchSequence).toBe(1));
    expect(result.current.lastBatchCount).toBe(2);

    act(() => result.current.loadMore());

    await waitFor(() => expect(result.current.fetchSequence).toBe(2));
    expect(result.current.lastBatchCount).toBe(1);
  });

  it('does not increment fetchSequence on a failed fetch', async () => {
    const fetchPage = jest.fn<(p: number) => Promise<InfiniteScrollPage<string>>>();
    fetchPage.mockResolvedValueOnce(page(['a'], true));
    fetchPage.mockRejectedValueOnce(new Error('boom'));

    const { result } = renderHook(() => useInfiniteScroll({ fetchPage, resetKey: 'k' }));
    await waitFor(() => expect(result.current.fetchSequence).toBe(1));

    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.status).toBe('error'));

    expect(result.current.fetchSequence).toBe(1);
  });

  it('resets fetchSequence to 1 (not accumulated) and lastBatchCount to the new batch size after a resetKey change', async () => {
    const fetchPage = jest.fn<(p: number) => Promise<InfiniteScrollPage<string>>>();
    fetchPage.mockResolvedValueOnce(page(['a', 'b', 'c'], true)); // k1 page 1: sequence -> 1, count -> 3
    fetchPage.mockResolvedValueOnce(page(['x'], false)); // k2 page 1: should read as a fresh sequence 1

    const { result, rerender } = renderHook(
      ({ resetKey }: { resetKey: string }) => useInfiniteScroll({ fetchPage, resetKey }),
      { initialProps: { resetKey: 'k1' } },
    );
    await waitFor(() => expect(result.current.fetchSequence).toBe(1));
    expect(result.current.lastBatchCount).toBe(3);

    rerender({ resetKey: 'k2' });

    await waitFor(() => expect(result.current.items).toEqual(['x']));
    // Not 2 — the reset zeroes fetchSequence/lastBatchCount before the new key's own
    // first fetch is applied, so this reads as a genuine "first batch" again.
    expect(result.current.fetchSequence).toBe(1);
    expect(result.current.lastBatchCount).toBe(1);
  });

  // ─── onPageApplied / onPageFailed callbacks ──────────────────────────────────

  describe('onPageApplied / onPageFailed', () => {
    it('calls onPageApplied exactly once with (meta, page) on a normal, non-superseded success', async () => {
      const fetchPage =
        jest.fn<(p: number) => Promise<InfiniteScrollPage<string, { total: number }>>>();
      fetchPage.mockResolvedValueOnce({ items: ['a'], hasMore: true, meta: { total: 42 } });
      fetchPage.mockResolvedValueOnce({ items: ['b'], hasMore: false, meta: { total: 43 } });

      const onPageApplied = jest.fn();
      const { result } = renderHook(() =>
        useInfiniteScroll({ fetchPage, resetKey: 'k', onPageApplied }),
      );

      await waitFor(() => expect(onPageApplied).toHaveBeenCalledTimes(1));
      expect(onPageApplied).toHaveBeenNthCalledWith(1, { total: 42 }, 1);

      act(() => result.current.loadMore());

      await waitFor(() => expect(onPageApplied).toHaveBeenCalledTimes(2));
      expect(onPageApplied).toHaveBeenNthCalledWith(2, { total: 43 }, 2);
    });

    it('calls onPageFailed exactly once with (error, page) on a normal, non-superseded failure', async () => {
      const err = new Error('boom');
      const fetchPage = jest.fn<(p: number) => Promise<InfiniteScrollPage<string>>>();
      fetchPage.mockResolvedValueOnce(page(['a'], true));
      fetchPage.mockRejectedValueOnce(err);

      const onPageFailed = jest.fn();
      const { result } = renderHook(() =>
        useInfiniteScroll({ fetchPage, resetKey: 'k', onPageFailed }),
      );
      await waitFor(() => expect(result.current.status).toBe('idle'));

      act(() => result.current.loadMore());
      await waitFor(() => expect(result.current.status).toBe('error'));

      expect(onPageFailed).toHaveBeenCalledTimes(1);
      expect(onPageFailed).toHaveBeenCalledWith(err, 2);
    });

    it('works with onPageApplied/onPageFailed omitted — no throw on success or failure', async () => {
      const fetchPage = jest.fn<(p: number) => Promise<InfiniteScrollPage<string>>>();
      fetchPage.mockResolvedValueOnce(page(['a'], true));
      fetchPage.mockRejectedValueOnce(new Error('boom'));

      const { result } = renderHook(() => useInfiniteScroll({ fetchPage, resetKey: 'k' }));
      await waitFor(() => expect(result.current.status).toBe('idle'));

      act(() => result.current.loadMore());
      await waitFor(() => expect(result.current.status).toBe('error'));
    });

    it('does not call onPageApplied for a stale fetch that resolves after a resetKey change', async () => {
      let resolveStale: ((v: InfiniteScrollPage<string, { n: number }>) => void) | undefined;
      const staleDeferred = new Promise<InfiniteScrollPage<string, { n: number }>>((resolve) => {
        resolveStale = resolve;
      });

      const fetchPage =
        jest.fn<(p: number) => Promise<InfiniteScrollPage<string, { n: number }>>>();
      fetchPage.mockImplementationOnce(() => staleDeferred); // mount under k1, page 1, held open
      fetchPage.mockResolvedValueOnce({ items: ['new-a'], hasMore: false, meta: { n: 2 } }); // k2 page 1

      const onPageApplied = jest.fn();
      const { result, rerender } = renderHook(
        ({ resetKey }: { resetKey: string }) =>
          useInfiniteScroll({ fetchPage, resetKey, onPageApplied }),
        { initialProps: { resetKey: 'k1' } },
      );

      // Still loading under k1 — the deferred mount fetch hasn't resolved yet.
      expect(result.current.status).toBe('loading');
      expect(onPageApplied).not.toHaveBeenCalled();

      rerender({ resetKey: 'k2' });

      await waitFor(() => expect(result.current.status).toBe('done'));
      expect(onPageApplied).toHaveBeenCalledTimes(1);
      expect(onPageApplied).toHaveBeenCalledWith({ n: 2 }, 1);

      // Now resolve the stale k1 fetch, with DIFFERENT meta.
      await act(async () => {
        resolveStale?.({ items: ['stale'], hasMore: true, meta: { n: 999 } });
        await staleDeferred;
      });

      // onPageApplied must still have been called exactly once — never for the stale batch.
      expect(onPageApplied).toHaveBeenCalledTimes(1);
    });

    it("does not call onPageFailed for a stale fetch that rejects after a resetKey change, and the new key's own success is unaffected", async () => {
      let rejectStale: ((err: unknown) => void) | undefined;
      const staleDeferred = new Promise<InfiniteScrollPage<string>>((_resolve, reject) => {
        rejectStale = reject;
      });

      const fetchPage = jest.fn<(p: number) => Promise<InfiniteScrollPage<string>>>();
      fetchPage.mockImplementationOnce(() => staleDeferred); // mount under k1, page 1, held open
      fetchPage.mockResolvedValueOnce(page(['new-a'], false)); // k2 page 1

      const onPageApplied = jest.fn();
      const onPageFailed = jest.fn();
      const { result, rerender } = renderHook(
        ({ resetKey }: { resetKey: string }) =>
          useInfiniteScroll({ fetchPage, resetKey, onPageApplied, onPageFailed }),
        { initialProps: { resetKey: 'k1' } },
      );

      rerender({ resetKey: 'k2' });

      await waitFor(() => expect(result.current.status).toBe('done'));
      expect(onPageApplied).toHaveBeenCalledTimes(1);
      expect(result.current.items).toEqual(['new-a']);

      await act(async () => {
        rejectStale?.(new Error('stale failure'));
        await staleDeferred.catch(() => undefined);
      });

      expect(onPageFailed).not.toHaveBeenCalled();
      // The new key's own (already-applied) outcome must be unaffected by the stale rejection.
      expect(result.current.status).toBe('done');
      expect(result.current.items).toEqual(['new-a']);
    });
  });

  // ─── fetchPage identity stability ────────────────────────────────────────────

  it('a new fetchPage function identity on re-render (same resetKey) does not trigger a new fetch', async () => {
    const fetchPageA = jest.fn<(p: number) => Promise<InfiniteScrollPage<string>>>();
    fetchPageA.mockResolvedValue(page(['a'], true));

    const { result, rerender } = renderHook(
      ({ fetchPage }: { fetchPage: (p: number) => Promise<InfiniteScrollPage<string>> }) =>
        useInfiniteScroll({ fetchPage, resetKey: 'k' }),
      { initialProps: { fetchPage: fetchPageA } },
    );
    await waitFor(() => expect(result.current.status).toBe('idle'));
    expect(fetchPageA).toHaveBeenCalledTimes(1);

    const fetchPageB = jest.fn<(p: number) => Promise<InfiniteScrollPage<string>>>();
    fetchPageB.mockResolvedValue(page(['z'], true));

    rerender({ fetchPage: fetchPageB });

    // Give any (incorrect) effect a tick to fire before asserting it didn't.
    await act(async () => {
      await Promise.resolve();
    });

    expect(fetchPageB).not.toHaveBeenCalled();
    expect(fetchPageA).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('idle');
  });
});
