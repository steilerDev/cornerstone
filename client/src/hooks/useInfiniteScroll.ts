import { useCallback, useEffect, useRef, useState } from 'react';

/** Distance (in px) below the viewport bottom at which the next batch starts loading. */
const INFINITE_SCROLL_LOOKAHEAD_PX = 600;

export type InfiniteScrollStatus = 'idle' | 'loading' | 'error' | 'done';

export interface InfiniteScrollPage<T> {
  items: T[];
  /** true if more pages remain after this one */
  hasMore: boolean;
}

export interface UseInfiniteScrollOptions<T> {
  /**
   * Fetches one batch for the given 1-based page number. Must reject (throw)
   * on failure. Read via a ref internally so a new function identity each
   * render does NOT retrigger a fetch — only `resetKey` changes do.
   */
  fetchPage: (page: number) => Promise<InfiniteScrollPage<T>>;
  /**
   * Changing this value resets to a fresh first batch: clears items, resets
   * the page counter to 1, and re-fetches. Derive it from the active
   * filters/search (e.g. a `|`-joined string of the filter primitives).
   */
  resetKey: string;
}

export interface UseInfiniteScrollResult<T> {
  items: T[];
  status: InfiniteScrollStatus;
  hasMore: boolean;
  /** Count of items in the most recently successful fetch (for a11y announcements). */
  lastBatchCount: number;
  /** Increments once per successful fetch (including the first). Distinguishes "first batch" (sequence === 1) from "appended batch" (sequence > 1). */
  fetchSequence: number;
  /** Ref-callback — attach to the sentinel `<div>`. */
  sentinelRef: (node: HTMLDivElement | null) => void;
  /** Called by both the observer and the "Load more" button. No-ops while loading/error/done. */
  loadMore: () => void;
  /** Re-issues the SAME page that just failed. No-ops unless status === 'error'. */
  retry: () => void;
}

export function useInfiniteScroll<T>({
  fetchPage,
  resetKey,
}: UseInfiniteScrollOptions<T>): UseInfiniteScrollResult<T> {
  const [items, setItems] = useState<T[]>([]);
  const [status, setStatus] = useState<InfiniteScrollStatus>('loading');
  const [hasMore, setHasMore] = useState(true);
  const [lastBatchCount, setLastBatchCount] = useState(0);
  const [fetchSequence, setFetchSequence] = useState(0);
  const [sentinelNode, setSentinelNode] = useState<HTMLDivElement | null>(null);

  const fetchPageRef = useRef(fetchPage);
  fetchPageRef.current = fetchPage;

  const pageRef = useRef(1);
  const inFlightRef = useRef(false);
  const statusRef = useRef<InfiniteScrollStatus>('loading');
  statusRef.current = status;
  // Bumped on every resetKey change. Lets a fetch's completion handler detect it was
  // started under a since-superseded resetKey generation and discard its result instead
  // of corrupting the freshly-reset state (see #2061).
  const epochRef = useRef(0);

  const runFetch = useCallback(async (page: number, epoch: number) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const result = await fetchPageRef.current(page);
      if (epoch !== epochRef.current) return; // superseded by a resetKey change — discard
      setItems((prev) => (page === 1 ? result.items : [...prev, ...result.items]));
      setHasMore(result.hasMore);
      setStatus(result.hasMore ? 'idle' : 'done');
      pageRef.current = page + 1;
      setLastBatchCount(result.items.length);
      setFetchSequence((prev) => prev + 1);
    } catch {
      if (epoch === epochRef.current) {
        setStatus('error');
      }
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  const loadMore = useCallback(() => {
    if (statusRef.current !== 'idle') return;
    setStatus('loading');
    void runFetch(pageRef.current, epochRef.current);
  }, [runFetch]);

  const retry = useCallback(() => {
    if (statusRef.current !== 'error') return;
    setStatus('loading');
    void runFetch(pageRef.current, epochRef.current);
  }, [runFetch]);

  /* eslint-disable @eslint-react/set-state-in-effect -- resetKey change (filters/search) must
     synchronously clear the accumulated list and page counter before the first batch of the
     new result set is fetched; runFetch/fetchPage are read via refs so they are intentionally
     excluded from the dependency array. */
  useEffect(() => {
    epochRef.current += 1;
    const epoch = epochRef.current;
    pageRef.current = 1;
    // Bypass the dedupe guard: a fetch still in flight under the previous resetKey must not
    // swallow this reset's own fetchPage(1) call (see #2061).
    inFlightRef.current = false;
    setItems([]);
    setHasMore(true);
    setStatus('loading');
    void runFetch(1, epoch);
  }, [resetKey, runFetch]);
  /* eslint-enable @eslint-react/set-state-in-effect */

  const sentinelRef = useCallback((node: HTMLDivElement | null) => {
    setSentinelNode(node);
  }, []);

  useEffect(() => {
    if (!sentinelNode) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: `0px 0px ${INFINITE_SCROLL_LOOKAHEAD_PX}px 0px` },
    );
    observer.observe(sentinelNode);
    return () => observer.disconnect();
  }, [sentinelNode, loadMore]);

  return {
    items,
    status,
    hasMore,
    lastBatchCount,
    fetchSequence,
    sentinelRef,
    loadMore,
    retry,
  };
}
