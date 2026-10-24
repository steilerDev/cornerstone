import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useInfiniteScroll } from '../../hooks/useInfiniteScroll.js';
import type { InfiniteScrollStatus } from '../../hooks/useInfiniteScroll.js';
import {
  ALL_CHIP,
  OBJECT_LIST_PAGE_SIZE,
  effectiveQuery,
  normaliseListParams,
  queryKey,
  readListState,
  writeListParams,
} from './objectListUrl.js';
import type { ListPatch } from './objectListUrl.js';
import type { ObjectListConfig, ObjectListPage, ObjectListQuery, SortOrder } from './types.js';

export interface UseObjectListOptions<T, M> {
  readonly config: ObjectListConfig<T>;
  readonly fetchPage: (
    query: ObjectListQuery,
    page: number,
    pageSize: number,
  ) => Promise<ObjectListPage<T, M>>;
  readonly getKey: (item: T) => string;
  /** Scroll container for the infinite-scroll observer when the page does not scroll the viewport. */
  readonly scrollRoot?: Element | null;
}

export interface ObjectListController<T, M = undefined> {
  readonly query: ObjectListQuery;
  /** Raw URL state for the controls; null = param absent. */
  readonly explicitChip: string | null;
  /** Option value or 'none' (default applied). */
  readonly group: string;
  readonly activeFilterCount: number;
  /** q !== '' || activeFilterCount > 0 (a chip alone is not a filter). */
  readonly filtersActive: boolean;
  /** filtersActive || explicit chip ≠ default. */
  readonly clearable: boolean;
  readonly setSearch: (q: string) => void;
  /** Chip value or 'all'; always written explicitly, also the default chip. */
  readonly setChip: (value: string) => void;
  /** Every configured filter param removed in one write. */
  readonly clearSheetFilters: () => void;
  /** 'none' or an option value. */
  readonly setGroup: (value: string) => void;
  /** null = back to the default. */
  readonly setSort: (value: string, order: SortOrder | null) => void;
  readonly setFilter: (param: string, value: string | null) => void;
  /** Removes q, the chip param and every filter param in one write; keeps sort and group. */
  readonly clearFilters: () => void;
  readonly items: readonly T[];
  /** null until the first batch is applied. */
  readonly totalItems: number | null;
  readonly groupCounts: Readonly<Record<string, number>> | null;
  readonly meta: M | undefined;
  readonly status: InfiniteScrollStatus;
  readonly hasMore: boolean;
  readonly loadMore: () => void;
  readonly retry: () => void;
  readonly sentinelRef: (node: HTMLDivElement | null) => void;
  readonly fetchSequence: number;
  readonly lastBatchCount: number;
  readonly updateItem: (key: string, updater: (item: T) => T) => void;
  /** Local removal; with rows still on the server it refreshes instead (offset paging). */
  readonly removeItem: (key: string) => void;
  /** Reload from page 1 (e.g. after Undo). */
  readonly refresh: () => void;
  readonly getKey: (item: T) => string;
}

/**
 * URL state (`q`, chip param, `group`, `sortBy`/`sortOrder`, configured filters) plus the
 * batch-loaded rows of one object list. Every URL write replaces the history entry. State
 * derived from a response is set only in `onPageApplied`, so a superseded batch never lands.
 */
export function useObjectList<T, M = undefined>(
  options: UseObjectListOptions<T, M>,
): ObjectListController<T, M> {
  const { config, getKey, scrollRoot } = options;
  const [searchParams, setSearchParams] = useSearchParams();
  const configRef = useRef(config);
  configRef.current = config;
  const fetchPageRef = useRef(options.fetchPage);
  fetchPageRef.current = options.fetchPage;

  const state = useMemo(() => readListState(searchParams, config), [searchParams, config]);

  const serverGroup = useMemo(() => {
    const option = config.groupBy?.options.find((o) => o.value === state.group);
    return option?.server ? option.value : null;
  }, [config.groupBy, state.group]);

  const query = useMemo(
    () => effectiveQuery(state, config, serverGroup),
    [state, config, serverGroup],
  );
  const queryRef = useRef(query);
  queryRef.current = query;

  // Unknown values and the retired page/pageSize params are removed once per bad URL.
  useEffect(() => {
    const next = normaliseListParams(searchParams, configRef.current);
    if (next) setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const write = useCallback(
    (patch: ListPatch) => {
      setSearchParams((prev) => writeListParams(prev, patch, configRef.current), {
        replace: true,
      });
    },
    [setSearchParams],
  );

  const [refreshToken, setRefreshToken] = useState(0);
  const [totalItems, setTotalItems] = useState<number | null>(null);
  const [groupCounts, setGroupCounts] = useState<Readonly<Record<string, number>> | null>(null);
  const [meta, setMeta] = useState<M | undefined>(undefined);

  const scroll = useInfiniteScroll<T, ObjectListPage<T, M>>({
    fetchPage: async (page) => {
      const result = await fetchPageRef.current(queryRef.current, page, OBJECT_LIST_PAGE_SIZE);
      return {
        items: [...result.items],
        hasMore: page * OBJECT_LIST_PAGE_SIZE < result.totalItems,
        meta: result,
      };
    },
    resetKey: `${queryKey(query)}|${refreshToken}`,
    onPageApplied: (applied) => {
      // fetchPage above always returns the full result as `meta`.
      const result = applied as ObjectListPage<T, M>;
      setTotalItems(result.totalItems);
      setGroupCounts(result.groupCounts ?? null);
      setMeta(result.meta);
    },
    root: scrollRoot ?? null,
  });
  const { updateItems } = scroll;

  const refresh = useCallback(() => setRefreshToken((n) => n + 1), []);

  const updateItem = useCallback(
    (key: string, updater: (item: T) => T) => {
      updateItems((items) => items.map((item) => (getKey(item) === key ? updater(item) : item)));
    },
    [updateItems, getKey],
  );

  const itemsRef = useRef(scroll.items);
  itemsRef.current = scroll.items;
  const hasMoreRef = useRef(scroll.hasMore);
  hasMoreRef.current = scroll.hasMore;

  const removeItem = useCallback(
    (key: string) => {
      if (!itemsRef.current.some((item) => getKey(item) === key)) return;
      if (hasMoreRef.current) {
        refresh();
        return;
      }
      updateItems((items) => items.filter((item) => getKey(item) !== key));
      // No rows remain on the server, so the total is the number of loaded rows.
      setTotalItems(itemsRef.current.length - 1);
    },
    [updateItems, getKey, refresh],
  );

  const activeFilterCount = Object.keys(state.filters).length;
  const filtersActive = state.q !== '' || activeFilterCount > 0;
  const defaultChip = config.chips?.defaultValue ?? ALL_CHIP;
  const clearable =
    filtersActive || (state.explicitChip !== null && state.explicitChip !== defaultChip);

  const setSearch = useCallback((q: string) => write({ q }), [write]);
  const setChip = useCallback((value: string) => write({ chip: value }), [write]);
  const setGroup = useCallback((value: string) => write({ group: value }), [write]);
  const setSort = useCallback(
    (value: string, order: SortOrder | null) =>
      write({ sort: order === null ? null : { value, order } }),
    [write],
  );
  const setFilter = useCallback(
    (param: string, value: string | null) => write({ filters: { [param]: value } }),
    [write],
  );
  const clearSheetFilters = useCallback(() => {
    const cleared: Record<string, null> = {};
    for (const def of configRef.current.filters ?? []) cleared[def.param] = null;
    write({ filters: cleared });
  }, [write]);
  const clearFilters = useCallback(() => {
    const cleared: Record<string, null> = {};
    for (const def of configRef.current.filters ?? []) cleared[def.param] = null;
    write({ q: '', chip: null, filters: cleared });
  }, [write]);

  return {
    query,
    explicitChip: state.explicitChip,
    group: state.group,
    activeFilterCount,
    filtersActive,
    clearable,
    setSearch,
    setChip,
    clearSheetFilters,
    setGroup,
    setSort,
    setFilter,
    clearFilters,
    items: scroll.items,
    totalItems,
    groupCounts,
    meta,
    status: scroll.status,
    hasMore: scroll.hasMore,
    loadMore: scroll.loadMore,
    retry: scroll.retry,
    sentinelRef: scroll.sentinelRef,
    fetchSequence: scroll.fetchSequence,
    lastBatchCount: scroll.lastBatchCount,
    updateItem,
    removeItem,
    refresh,
    getKey,
  };
}
