import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

export interface SortState {
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

export interface TableState {
  search: string;
  filters: Record<string, string>;
  sort: SortState;
  page: number;
}

export interface UseTableStateOptions {
  defaultSort?: SortState;
  /** Filter param keys to read/write from URL (e.g., ['status', 'vendorId', 'areaId']) */
  filterKeys?: string[];
  /** Search debounce delay in ms (default: 300) */
  searchDebounceMs?: number;
}

export interface UseTableStateResult {
  tableState: TableState;
  searchInput: string;
  setSearchInput: (value: string) => void;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  setFilter: (key: string, value: string | undefined) => void;
  setSort: (field: string) => void;
  setSortDirect: (sort: SortState) => void;
  setPage: (page: number) => void;
  clearFilters: () => void;
  hasActiveFilters: boolean;
  toApiParams: () => Record<string, string | number | boolean | undefined>;
}

export function useTableState(options: UseTableStateOptions = {}): UseTableStateResult {
  const {
    defaultSort = { sortBy: 'created_at', sortOrder: 'desc' },
    filterKeys = [],
    searchDebounceMs = 300,
  } = options;

  const [searchParams, setSearchParams] = useSearchParams();
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Read state from URL
  const searchQuery = searchParams.get('q') || '';
  const sortBy = searchParams.get('sortBy') || defaultSort.sortBy;
  const sortOrder = (searchParams.get('sortOrder') as 'asc' | 'desc') || defaultSort.sortOrder;
  const page = parseInt(searchParams.get('page') || '1', 10);

  const filters: Record<string, string> = {};
  for (const key of filterKeys) {
    const value = searchParams.get(key);
    if (value) {
      filters[key] = value;
    }
  }

  // Local search input for debouncing
  const [searchInput, setSearchInput] = useState(searchQuery);
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Sync searchInput when URL search param changes externally (e.g., clear filters)
  useEffect(() => {
    const urlSearch = searchParams.get('q') || '';
    if (urlSearch !== searchInput) {
      setSearchInput(urlSearch);
    }
    // Only react to URL changes, not searchInput changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Debounced search sync to URL
  useEffect(() => {
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    searchDebounceRef.current = setTimeout(() => {
      const newParams = new URLSearchParams(searchParams);
      if (searchInput) {
        newParams.set('q', searchInput);
      } else {
        newParams.delete('q');
      }
      newParams.set('page', '1');
      setSearchParams(newParams);
    }, searchDebounceMs);

    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, [searchInput, searchParams, setSearchParams, searchDebounceMs]);

  const updateParams = useCallback(
    (updates: Record<string, string | undefined>) => {
      const newParams = new URLSearchParams(searchParams);
      for (const [key, value] of Object.entries(updates)) {
        if (value === undefined || value === '') {
          newParams.delete(key);
        } else {
          newParams.set(key, value);
        }
      }
      setSearchParams(newParams);
    },
    [searchParams, setSearchParams],
  );

  const setFilter = useCallback(
    (key: string, value: string | undefined) => {
      updateParams({ [key]: value, page: '1' });
    },
    [updateParams],
  );

  const setSort = useCallback(
    (field: string) => {
      const newOrder = sortBy === field && sortOrder === 'asc' ? 'desc' : 'asc';
      updateParams({ sortBy: field, sortOrder: newOrder });
    },
    [sortBy, sortOrder, updateParams],
  );

  const setSortDirect = useCallback(
    (sort: SortState) => {
      updateParams({ sortBy: sort.sortBy, sortOrder: sort.sortOrder });
    },
    [updateParams],
  );

  const setPage = useCallback(
    (newPage: number) => {
      updateParams({ page: newPage.toString() });
    },
    [updateParams],
  );

  const clearFilters = useCallback(() => {
    setSearchInput('');
    setSearchParams(new URLSearchParams());
  }, [setSearchParams]);

  const hasActiveFilters =
    searchQuery !== '' || Object.keys(filters).length > 0;

  const tableState: TableState = {
    search: searchQuery,
    filters,
    sort: { sortBy, sortOrder },
    page,
  };

  const toApiParams = useCallback((): Record<string, string | number | boolean | undefined> => {
    const params: Record<string, string | number | boolean | undefined> = {};
    if (searchQuery) params.q = searchQuery;
    if (sortBy) params.sortBy = sortBy;
    if (sortOrder) params.sortOrder = sortOrder;
    params.page = page;

    for (const [key, value] of Object.entries(filters)) {
      if (value === 'true') {
        params[key] = true;
      } else if (value === 'false') {
        params[key] = false;
      } else {
        params[key] = value;
      }
    }

    return params;
  }, [searchQuery, sortBy, sortOrder, page, filters]);

  return {
    tableState,
    searchInput,
    setSearchInput,
    searchInputRef,
    setFilter,
    setSort,
    setSortDirect,
    setPage,
    clearFilters,
    hasActiveFilters,
    toApiParams,
  };
}
