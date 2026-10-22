import type { ObjectListConfig, ObjectListQuery, SortOrder } from './types.js';

/** Rows per batch: the API maximum on every list endpoint. */
export const OBJECT_LIST_PAGE_SIZE = 100;
export const ALL_CHIP = 'all';
export const NO_GROUP = 'none';
const DEFAULT_CHIP_PARAM = 'status';

export interface ListState {
  readonly q: string;
  /** null = the chip param is absent. */
  readonly explicitChip: string | null;
  /** Option value or 'none' (default applied). */
  readonly group: string;
  readonly sortBy: string;
  readonly sortOrder: SortOrder;
  readonly isDefaultSort: boolean;
  readonly filters: Readonly<Record<string, string>>;
}

export interface ListPatch {
  readonly q?: string;
  /** null removes the param; any value (including the default chip and 'all') is written. */
  readonly chip?: string | null;
  readonly group?: string;
  /** null = back to the default (both params removed). */
  readonly sort?: { readonly value: string; readonly order: SortOrder } | null;
  /** null or '' removes the param. */
  readonly filters?: Readonly<Record<string, string | null>>;
}

export function chipParamOf<T>(config: ObjectListConfig<T>): string {
  return config.chips?.param ?? DEFAULT_CHIP_PARAM;
}

function isSortOrder(value: string | null): value is SortOrder {
  return value === 'asc' || value === 'desc';
}

export function readListState<T>(params: URLSearchParams, config: ObjectListConfig<T>): ListState {
  const chipRaw = config.chips ? params.get(chipParamOf(config)) : null;
  const sortByRaw = params.get('sortBy');
  const sortOrderRaw = params.get('sortOrder');
  const sortBy = sortByRaw ?? config.sort.defaultValue;
  const sortOrder: SortOrder = sortByRaw
    ? isSortOrder(sortOrderRaw)
      ? sortOrderRaw
      : 'asc'
    : config.sort.defaultOrder;
  const filters: Record<string, string> = {};
  for (const def of config.filters ?? []) {
    const value = params.get(def.param);
    if (value) filters[def.param] = value;
  }
  return {
    q: params.get('q') ?? '',
    explicitChip: chipRaw ? chipRaw : null,
    group: params.get('group') ?? config.groupBy?.defaultValue ?? NO_GROUP,
    sortBy,
    sortOrder,
    isDefaultSort: sortBy === config.sort.defaultValue && sortOrder === config.sort.defaultOrder,
    filters,
  };
}

/**
 * A copy with unknown values removed (chip, group, sortBy, sortOrder) and `page`/`pageSize`
 * removed, or null when nothing changed. Unknown params (create, trades, payment …) are kept.
 */
export function normaliseListParams<T>(
  params: URLSearchParams,
  config: ObjectListConfig<T>,
): URLSearchParams | null {
  const next = new URLSearchParams(params);
  let changed = false;
  const drop = (name: string) => {
    if (next.has(name)) {
      next.delete(name);
      changed = true;
    }
  };

  if (config.chips) {
    const name = chipParamOf(config);
    const value = next.get(name);
    if (
      value !== null &&
      value !== ALL_CHIP &&
      !config.chips.options.some((o) => o.value === value)
    ) {
      drop(name);
    }
  }

  const group = next.get('group');
  if (group !== null) {
    const known =
      group === NO_GROUP || (config.groupBy?.options.some((o) => o.value === group) ?? false);
    if (!known) drop('group');
  }

  const sortBy = next.get('sortBy');
  if (sortBy !== null && !config.sort.options.some((o) => o.value === sortBy)) {
    drop('sortBy');
    drop('sortOrder');
  }
  const sortOrder = next.get('sortOrder');
  if (sortOrder !== null && !isSortOrder(sortOrder)) drop('sortOrder');

  drop('page');
  drop('pageSize');

  return changed ? next : null;
}

export function writeListParams<T>(
  prev: URLSearchParams,
  patch: ListPatch,
  config: ObjectListConfig<T>,
): URLSearchParams {
  const next = new URLSearchParams(prev);

  if (patch.q !== undefined) {
    if (patch.q === '') next.delete('q');
    else next.set('q', patch.q);
  }

  if (patch.chip !== undefined && config.chips) {
    const name = chipParamOf(config);
    if (patch.chip === null) next.delete(name);
    else next.set(name, patch.chip);
  }

  if (patch.group !== undefined) {
    const fallback = config.groupBy?.defaultValue ?? NO_GROUP;
    if (patch.group === fallback) next.delete('group');
    else next.set('group', patch.group);
  }

  if (patch.sort !== undefined) {
    const sort = patch.sort;
    if (
      sort === null ||
      (sort.value === config.sort.defaultValue && sort.order === config.sort.defaultOrder)
    ) {
      next.delete('sortBy');
      next.delete('sortOrder');
    } else {
      next.set('sortBy', sort.value);
      next.set('sortOrder', sort.order);
    }
  }

  if (patch.filters) {
    for (const [param, value] of Object.entries(patch.filters)) {
      if (value === null || value === '') next.delete(param);
      else next.set(param, value);
    }
  }

  return next;
}

export function effectiveQuery<T>(
  state: ListState,
  config: ObjectListConfig<T>,
  serverGroup: string | null,
): ObjectListQuery {
  const defaultChip = config.chips?.defaultValue;
  const searchingAll = state.q !== '' && state.explicitChip === null && defaultChip !== undefined;
  const chip = state.explicitChip ?? (searchingAll ? ALL_CHIP : (defaultChip ?? ALL_CHIP));
  return {
    q: state.q,
    chip,
    searchingAll,
    serverGroup,
    sortBy: state.sortBy,
    sortOrder: state.sortOrder,
    isDefaultSort: state.isDefaultSort,
    filters: state.filters,
  };
}

/** Stable string of a query, for `useInfiniteScroll`'s `resetKey`. */
export function queryKey(query: ObjectListQuery): string {
  const filters = Object.keys(query.filters)
    .sort()
    .map((key) => `${key}=${query.filters[key]}`)
    .join('&');
  return [
    query.q,
    query.chip,
    query.searchingAll ? '1' : '0',
    query.serverGroup ?? '',
    query.sortBy,
    query.sortOrder,
    filters,
  ].join('|');
}
