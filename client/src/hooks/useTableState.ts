import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { TableState, TableApiParams, FilterType } from '../components/DataTable/DataTable.js';

export interface UseTableStateOptions {
  columns?: Array<{ filterParamKey?: string; filterType?: FilterType }>;
  defaultPageSize?: number;
}

export interface UseTableStateResult {
  tableState: TableState;
  searchInput: string;
  setSearch: (q: string) => void;
  setFilter: (paramKey: string, value: string | null) => void;
  setSort: (columnKey: string, columnSortKey?: string) => void;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  toApiParams: () => TableApiParams;
  resetFilters: () => void;
}

/**
 * Hook managing DataTable state with URL synchronization
 *
 * Provides:
 * - Immediate search updates with URL sync
 * - Per-column filtering
 * - Sortable columns with 3-state cycling (none → asc → desc → none)
 * - Pagination
 * - Page size selection
 * - URL parameter sync via useSearchParams
 *
 * @param options Configuration options
 * @returns Table state and control functions
 */
export function useTableState(options: UseTableStateOptions = {}): UseTableStateResult {
  const { defaultPageSize = 25 } = options;

  const [searchParams, setSearchParams] = useSearchParams();

  // Initialize table state from URL parameters
  const [tableState, setTableState] = useState<TableState>(() => {
    const filters = new Map<string, { value: string }>();
    // Collect all URL params that aren't standard table params
    for (const [key, value] of searchParams.entries()) {
      if (!['q', 'sortBy', 'sortOrder', 'page', 'pageSize'].includes(key) && value) {
        filters.set(key, { value });
      }
    }

    return {
      search: searchParams.get('q') || '',
      filters,
      sortBy: searchParams.get('sortBy'),
      sortDir: (searchParams.get('sortOrder') as 'asc' | 'desc') || null,
      page: parseInt(searchParams.get('page') || '1', 10),
      pageSize: parseInt(searchParams.get('pageSize') || defaultPageSize.toString(), 10),
    };
  });

  // searchInput is now a computed value derived from tableState
  const searchInput = tableState.search;

  // Sync URL changes to table state
  useEffect(() => {
    const newState: TableState = {
      search: searchParams.get('q') || '',
      filters: new Map(),
      sortBy: searchParams.get('sortBy'),
      sortDir: (searchParams.get('sortOrder') as 'asc' | 'desc') || null,
      page: parseInt(searchParams.get('page') || '1', 10),
      pageSize: parseInt(searchParams.get('pageSize') || defaultPageSize.toString(), 10),
    };

    // Collect filter params (anything not in the standard table params)
    for (const [key, value] of searchParams.entries()) {
      if (!['q', 'sortBy', 'sortOrder', 'page', 'pageSize'].includes(key) && value) {
        newState.filters.set(key, { value });
      }
    }

    setTableState(newState);
  }, [searchParams, defaultPageSize]);

  const setSearch = useCallback((q: string) => {
    const newParams = new URLSearchParams(searchParams);
    if (q) {
      newParams.set('q', q);
    } else {
      newParams.delete('q');
    }
    newParams.set('page', '1');
    setSearchParams(newParams);
  }, [searchParams, setSearchParams]);

  const setFilter = useCallback(
    (paramKey: string, value: string | null) => {
      const newParams = new URLSearchParams(searchParams);
      if (value === null || value === '') {
        newParams.delete(paramKey);
      } else {
        newParams.set(paramKey, value);
      }
      newParams.set('page', '1');
      setSearchParams(newParams);
    },
    [searchParams, setSearchParams],
  );

  const setSort = useCallback(
    (columnKey: string, columnSortKey?: string) => {
      const sortKey = columnSortKey || columnKey;
      const newParams = new URLSearchParams(searchParams);
      const currentSort = newParams.get('sortBy');
      const currentOrder = newParams.get('sortOrder');

      if (currentSort === sortKey && currentOrder === 'asc') {
        // asc → desc
        newParams.set('sortBy', sortKey);
        newParams.set('sortOrder', 'desc');
      } else if (currentSort === sortKey && currentOrder === 'desc') {
        // desc → none
        newParams.delete('sortBy');
        newParams.delete('sortOrder');
      } else {
        // none → asc
        newParams.set('sortBy', sortKey);
        newParams.set('sortOrder', 'asc');
      }

      setSearchParams(newParams);
    },
    [searchParams, setSearchParams],
  );

  const setPage = useCallback(
    (page: number) => {
      const newParams = new URLSearchParams(searchParams);
      newParams.set('page', page.toString());
      setSearchParams(newParams);
    },
    [searchParams, setSearchParams],
  );

  const setPageSize = useCallback(
    (size: number) => {
      const newParams = new URLSearchParams(searchParams);
      newParams.set('pageSize', size.toString());
      newParams.set('page', '1');
      setSearchParams(newParams);
    },
    [searchParams, setSearchParams],
  );

  const toApiParams = useCallback((): TableApiParams => {
    const params: TableApiParams = {
      page: tableState.page,
      pageSize: tableState.pageSize,
    };

    if (tableState.search) {
      params.q = tableState.search;
    }

    if (tableState.sortBy) {
      params.sortBy = tableState.sortBy;
      params.sortOrder = tableState.sortDir || 'asc';
    }

    // Decompose compound filter values based on their type
    for (const [paramKey, filter] of tableState.filters.entries()) {
      const value = filter.value;

      // Detect and decompose number range filters (min:X,max:Y format)
      if (value.includes('min:') || value.includes('max:')) {
        const parts = value.split(',');
        for (const part of parts) {
          if (part.startsWith('min:')) {
            params[`${paramKey}Min`] = parseFloat(part.substring(4));
          } else if (part.startsWith('max:')) {
            params[`${paramKey}Max`] = parseFloat(part.substring(4));
          }
        }
      }
      // Detect and decompose date range filters (from:YYYY-MM-DD,to:YYYY-MM-DD format)
      else if (value.includes('from:') || value.includes('to:')) {
        const parts = value.split(',');
        for (const part of parts) {
          if (part.startsWith('from:')) {
            params[`${paramKey}From`] = part.substring(5);
          } else if (part.startsWith('to:')) {
            params[`${paramKey}To`] = part.substring(3);
          }
        }
      }
      // Passthrough for other filter types (string, enum, boolean, entity)
      else {
        params[paramKey] = value;
      }
    }

    return params;
  }, [tableState]);

  const resetFilters = useCallback(() => {
    const newParams = new URLSearchParams();
    if (searchInput) {
      newParams.set('q', searchInput);
    }
    newParams.set('page', '1');
    setSearchParams(newParams);
  }, [searchInput, setSearchParams]);

  return {
    tableState,
    searchInput,
    setSearch,
    setFilter,
    setSort,
    setPage,
    setPageSize,
    toApiParams,
    resetFilters,
  };
}
