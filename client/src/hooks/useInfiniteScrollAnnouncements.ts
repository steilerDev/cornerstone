import { useEffect, useRef, type RefObject } from 'react';
import type { InfiniteScrollStatus } from './useInfiniteScroll.js';

export interface InfiniteScrollAnnouncementLabels {
  initialLoad: (count: number) => string;
  batchAppended: (count: number) => string;
  batchAppendedAndEnd: (count: number) => string;
  /** Announced when a fetch adds zero counted items and the list has ended. Omit ⇒ falls back to initialLoad(0) / batchAppendedAndEnd(0). */
  endOfList?: () => string;
  /** Announced while a non-first batch is loading. Omit ⇒ no loading announcement. */
  loading?: () => string;
}

export interface UseInfiniteScrollAnnouncementsOptions<T, K> {
  fetchSequence: number;
  status: InfiniteScrollStatus;
  hasMore: boolean;
  items: readonly T[];
  getKey: (item: T) => K;
  /** Which items count toward announcements (e.g. visible after a client-side filter). Default: all. */
  isCounted?: (item: T) => boolean;
  labels: InfiniteScrollAnnouncementLabels;
}

/**
 * Screen-reader announcements for an infinite-scroll list, keyed on `useInfiniteScroll`'s
 * `fetchSequence`. Counts NEWLY loaded items (by key) that pass `isCounted`, so items hidden by
 * a client-side filter are not announced.
 *
 * Returns the ref to attach to the consumer's own always-mounted
 * `role="status" aria-atomic="true"` element (no explicit `aria-live` needed). Keeping one
 * persistent region mounted is required for reliable announcements.
 *
 * Behavioural notes versus the previous hand-rolled effects:
 * - DocumentBrowser: behaviour identical.
 * - DiaryPage: identical except (a) a non-final batch returning 0 items is now silent (was
 *   "0 more entries loaded"; practically unreachable) and (b) a language switch without a new
 *   fetch no longer re-announces (`t` was an effect dependency). Diary counts by unique
 *   `entry.id` (equal to `lastBatchCount` when ids are unique).
 */
export function useInfiniteScrollAnnouncements<T, K>(
  opts: UseInfiniteScrollAnnouncementsOptions<T, K>,
): RefObject<HTMLDivElement | null> {
  const { fetchSequence, status, hasMore, items } = opts;

  const regionRef = useRef<HTMLDivElement | null>(null);
  const announcedSeqRef = useRef(0);
  const knownKeysRef = useRef<Set<K>>(new Set());

  // Latest-value refs so inline lambdas / label objects don't re-run the effect.
  const getKeyRef = useRef(opts.getKey);
  getKeyRef.current = opts.getKey;
  const isCountedRef = useRef(opts.isCounted);
  isCountedRef.current = opts.isCounted;
  const labelsRef = useRef(opts.labels);
  labelsRef.current = opts.labels;

  useEffect(() => {
    const node = regionRef.current;
    if (!node) return;
    const labels = labelsRef.current;
    const known = knownKeysRef.current;

    if (fetchSequence === 0) {
      announcedSeqRef.current = 0;
      known.clear();
      return;
    }
    if (status === 'loading') {
      if (labels.loading) node.textContent = labels.loading();
      return;
    }
    if (fetchSequence === announcedSeqRef.current) return;
    if (fetchSequence === 1) known.clear();

    const getKey = getKeyRef.current;
    const isCounted = isCountedRef.current;
    let newCount = 0;
    for (const item of items) {
      if (!known.has(getKey(item)) && (!isCounted || isCounted(item))) newCount += 1;
    }
    for (const item of items) known.add(getKey(item));

    if (fetchSequence === 1) {
      if (newCount > 0) {
        node.textContent = labels.initialLoad(newCount);
      } else if (!hasMore) {
        node.textContent = labels.endOfList ? labels.endOfList() : labels.initialLoad(0);
      }
    } else if (newCount > 0) {
      node.textContent = hasMore
        ? labels.batchAppended(newCount)
        : labels.batchAppendedAndEnd(newCount);
    } else if (!hasMore) {
      node.textContent = labels.endOfList ? labels.endOfList() : labels.batchAppendedAndEnd(0);
    }
    announcedSeqRef.current = fetchSequence;
  }, [fetchSequence, status, hasMore, items]);

  return regionRef;
}
