import { useCallback, useEffect, useRef, useState } from 'react';
import { SEARCH_MAX_LIMIT, SEARCH_QUERY_MIN_LENGTH } from '@cornerstone/shared';
import type { SearchResponse, SearchResultItem, SearchResultType } from '@cornerstone/shared';
import { useDebouncedCallback } from '../../hooks/useDebouncedCallback.js';
import { ApiClientError } from '../../lib/apiClient.js';
import { searchEverywhere } from '../../lib/searchApi.js';
import { itemOptionId } from './commandSearchModel.js';

export const SEARCH_DEBOUNCE_MS = 250;
export const SKELETON_DELAY_MS = 200;

export interface CommandSearchQueryState {
  /** Raw input value. */
  readonly query: string;
  /** Last settled response for `settledQuery`. */
  readonly response: SearchResponse | null;
  /** Trimmed q of `response`. */
  readonly settledQuery: string | null;
  readonly status: 'idle' | 'loading' | 'ready' | 'error';
  /** loading, nothing to show yet and 200 ms elapsed. */
  readonly showSkeleton: boolean;
  readonly activeId: string | null;
  /** "Show more" results per type (the full group), reset per query. */
  readonly expanded: ReadonlyMap<SearchResultType, readonly SearchResultItem[]>;
}

export interface UseCommandSearchQueryOptions {
  readonly initialQuery: string;
  readonly onUnauthorized: () => void;
  /** The option that becomes active when a response for the current query arrives. */
  readonly firstOptionId: (response: SearchResponse) => string | null;
}

export interface CommandSearchQueryApi {
  readonly state: CommandSearchQueryState;
  setQuery(value: string, composing: boolean): void;
  /** Runs a pending debounce now (Enter with nothing active). */
  flush(): void;
  retry(): void;
  showMore(type: SearchResultType): void;
  setActiveId(id: string | null): void;
}

const NO_EXPANDED: ReadonlyMap<SearchResultType, readonly SearchResultItem[]> = new Map();

function initialState(initialQuery: string): CommandSearchQueryState {
  return {
    query: initialQuery,
    response: null,
    settledQuery: null,
    status: initialQuery.trim().length >= SEARCH_QUERY_MIN_LENGTH ? 'loading' : 'idle',
    showSkeleton: false,
    activeId: null,
    expanded: NO_EXPANDED,
  };
}

/** Debounce, abort, stale-drop, skeleton gate, retry and show-more for the command search. */
export function useCommandSearchQuery(
  options: UseCommandSearchQueryOptions,
): CommandSearchQueryApi {
  const [state, setState] = useState<CommandSearchQueryState>(() =>
    initialState(options.initialQuery),
  );
  const stateRef = useRef(state);
  stateRef.current = state;
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const latestQueryRef = useRef(options.initialQuery.trim());
  const controllerRef = useRef<AbortController | null>(null);
  const moreControllerRef = useRef<AbortController | null>(null);
  const skeletonTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<string | null>(null);

  const clearSkeletonTimer = useCallback(() => {
    if (skeletonTimerRef.current !== null) {
      clearTimeout(skeletonTimerRef.current);
      skeletonTimerRef.current = null;
    }
  }, []);

  const fail = useCallback(
    (err: unknown) => {
      clearSkeletonTimer();
      if (err instanceof ApiClientError && err.statusCode === 401) {
        optionsRef.current.onUnauthorized();
      }
      setState((s) => ({ ...s, status: 'error', showSkeleton: false }));
    },
    [clearSkeletonTimer],
  );

  // Timer callback: the 200 ms gate passed while the first load is still running.
  const revealSkeleton = useCallback(() => {
    skeletonTimerRef.current = null;
    setState((s) =>
      s.status === 'loading' && s.response === null ? { ...s, showSkeleton: true } : s,
    );
  }, []);

  // Starts a request; the caller has already put the state into 'loading'.
  const start = useCallback(
    (q: string) => {
      pendingRef.current = null;
      controllerRef.current?.abort();
      moreControllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      clearSkeletonTimer();

      // The skeleton only ever shows on the first load; a refetch keeps the old rows.
      if (stateRef.current.response === null) {
        skeletonTimerRef.current = setTimeout(revealSkeleton, SKELETON_DELAY_MS);
      }

      searchEverywhere({ q }, controller.signal)
        .then((response) => {
          // A cancelled request is a NetworkError from apiClient, so check the signal (never err.name).
          if (controller.signal.aborted || latestQueryRef.current !== q) return;
          clearSkeletonTimer();
          setState((s) => ({
            ...s,
            response,
            settledQuery: q,
            status: 'ready',
            showSkeleton: false,
            expanded: NO_EXPANDED,
            activeId: optionsRef.current.firstOptionId(response),
          }));
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          fail(err);
        });
    },
    [clearSkeletonTimer, fail, revealSkeleton],
  );

  const run = useCallback(
    (q: string) => {
      setState((s) => ({ ...s, status: 'loading', showSkeleton: false }));
      start(q);
    },
    [start],
  );

  const debounced = useDebouncedCallback((q: string) => run(q), SEARCH_DEBOUNCE_MS);

  // Prefilled queries (from a list field) search at once.
  useEffect(() => {
    const q = optionsRef.current.initialQuery.trim();
    if (q.length >= SEARCH_QUERY_MIN_LENGTH) start(q);
  }, [start]);

  useEffect(
    () => () => {
      controllerRef.current?.abort();
      moreControllerRef.current?.abort();
      if (skeletonTimerRef.current !== null) clearTimeout(skeletonTimerRef.current);
    },
    [],
  );

  const { cancel: cancelDebounce, trigger: triggerDebounce } = debounced;

  const setQuery = useCallback(
    (value: string, composing: boolean) => {
      const q = value.trim();
      latestQueryRef.current = q;
      setState((s) => ({ ...s, query: value }));
      if (composing) return;

      if (q.length < SEARCH_QUERY_MIN_LENGTH) {
        controllerRef.current?.abort();
        moreControllerRef.current?.abort();
        cancelDebounce();
        clearSkeletonTimer();
        pendingRef.current = null;
        setState((s) => ({
          ...s,
          response: null,
          settledQuery: null,
          status: 'idle',
          showSkeleton: false,
          activeId: null,
          expanded: NO_EXPANDED,
        }));
        return;
      }
      if (q === stateRef.current.settledQuery && stateRef.current.status === 'ready') {
        cancelDebounce();
        pendingRef.current = null;
        return;
      }
      pendingRef.current = q;
      triggerDebounce(q);
    },
    [cancelDebounce, triggerDebounce, clearSkeletonTimer],
  );

  const flush = useCallback(() => {
    const q = pendingRef.current;
    if (q === null) return;
    cancelDebounce();
    run(q);
  }, [cancelDebounce, run]);

  const retry = useCallback(() => {
    const q = latestQueryRef.current;
    if (q.length < SEARCH_QUERY_MIN_LENGTH) return;
    cancelDebounce();
    run(q);
  }, [cancelDebounce, run]);

  const showMore = useCallback(
    (type: SearchResultType) => {
      const q = stateRef.current.settledQuery;
      if (q === null) return;
      moreControllerRef.current?.abort();
      const controller = new AbortController();
      moreControllerRef.current = controller;
      searchEverywhere({ q, types: [type], limit: SEARCH_MAX_LIMIT }, controller.signal)
        .then((response) => {
          if (controller.signal.aborted || latestQueryRef.current !== q) return;
          const group = response.groups.find((g) => g.type === type);
          if (!group) return;
          setState((s) => {
            const previous =
              s.expanded.get(type) ?? s.response?.groups.find((g) => g.type === type)?.items ?? [];
            const firstNew = group.items[previous.length];
            const expanded = new Map(s.expanded);
            expanded.set(type, group.items);
            return {
              ...s,
              expanded,
              activeId: firstNew ? itemOptionId(type, firstNew) : s.activeId,
            };
          });
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          fail(err);
        });
    },
    [fail],
  );

  const setActiveId = useCallback((id: string | null) => {
    setState((s) => (s.activeId === id ? s : { ...s, activeId: id }));
  }, []);

  return { state, setQuery, flush, retry, showMore, setActiveId };
}
