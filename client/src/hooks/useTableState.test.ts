import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';

import { useTableState } from './useTableState.js';

// Wrapper that provides React Router context required by useSearchParams
function makeWrapper(initialEntries: string[] = ['/']) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(MemoryRouter, { initialEntries }, children);
}

describe('useTableState', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  describe('initial state', () => {
    it('initializes with default values when URL has no params', () => {
      const { result } = renderHook(() => useTableState(), {
        wrapper: makeWrapper(),
      });

      expect(result.current.tableState.search).toBe('');
      expect(result.current.tableState.sortBy).toBeNull();
      expect(result.current.tableState.sortDir).toBeNull();
      expect(result.current.tableState.page).toBe(1);
      expect(result.current.tableState.pageSize).toBe(25);
      expect(result.current.tableState.filters.size).toBe(0);
    });

    it('respects custom defaultPageSize option', () => {
      const { result } = renderHook(() => useTableState({ defaultPageSize: 50 }), {
        wrapper: makeWrapper(),
      });
      expect(result.current.tableState.pageSize).toBe(50);
    });

    it('initializes search from URL ?q= param', () => {
      const { result } = renderHook(() => useTableState(), {
        wrapper: makeWrapper(['/?q=test+query']),
      });
      expect(result.current.tableState.search).toBe('test query');
    });

    it('initializes sortBy from URL ?sortBy= param', () => {
      const { result } = renderHook(() => useTableState(), {
        wrapper: makeWrapper(['/?sortBy=title&sortOrder=asc']),
      });
      expect(result.current.tableState.sortBy).toBe('title');
    });

    it('initializes sortDir from URL ?sortOrder= param', () => {
      const { result } = renderHook(() => useTableState(), {
        wrapper: makeWrapper(['/?sortBy=title&sortOrder=desc']),
      });
      expect(result.current.tableState.sortDir).toBe('desc');
    });

    it('initializes page from URL ?page= param', () => {
      const { result } = renderHook(() => useTableState(), {
        wrapper: makeWrapper(['/?page=3']),
      });
      expect(result.current.tableState.page).toBe(3);
    });

    it('initializes filter from custom URL param', () => {
      const { result } = renderHook(() => useTableState(), {
        wrapper: makeWrapper(['/?status=active']),
      });
      expect(result.current.tableState.filters.get('status')?.value).toBe('active');
    });
  });

  describe('setSearch with debounce', () => {
    it('initializes searchInput from URL q param', () => {
      const { result } = renderHook(() => useTableState(), {
        wrapper: makeWrapper(['/?q=initial']),
      });
      expect(result.current.searchInput).toBe('initial');
    });

    it('does not update tableState.search before debounce fires (299ms)', () => {
      jest.useFakeTimers();
      const { result } = renderHook(() => useTableState(), {
        wrapper: makeWrapper(),
      });

      act(() => {
        result.current.setSearch('hello');
      });

      // Advance just under the 300ms debounce threshold
      act(() => {
        jest.advanceTimersByTime(299);
      });

      // tableState.search should still be '' (debounce hasn't fired)
      // The URL still has no ?q= param at this point
      expect(result.current.tableState.search).toBe('');
    });

    it('updates searchInput immediately when setSearch is called', () => {
      const { result } = renderHook(() => useTableState(), {
        wrapper: makeWrapper(),
      });

      act(() => {
        result.current.setSearch('hello');
      });

      // searchInput updates immediately (before debounce fires)
      expect(result.current.searchInput).toBe('hello');
    });

    it('search initialized from URL is reflected in tableState and toApiParams', () => {
      // When the hook is initialized with a search query in the URL,
      // tableState.search and toApiParams().q should reflect it immediately
      const { result } = renderHook(() => useTableState(), {
        wrapper: makeWrapper(['/?q=hello']),
      });

      expect(result.current.tableState.search).toBe('hello');
      expect(result.current.toApiParams().q).toBe('hello');
    });

    it('search and page are both initialized correctly from URL params', () => {
      const { result } = renderHook(() => useTableState(), {
        wrapper: makeWrapper(['/?q=myquery&page=3']),
      });

      expect(result.current.tableState.search).toBe('myquery');
      expect(result.current.tableState.page).toBe(3);
      expect(result.current.searchInput).toBe('myquery');
    });
  });

  describe('setFilter', () => {
    it('adds a filter to the URL and tableState', () => {
      const { result } = renderHook(() => useTableState(), {
        wrapper: makeWrapper(),
      });

      act(() => {
        result.current.setFilter('status', 'active');
      });

      expect(result.current.tableState.filters.get('status')?.value).toBe('active');
    });

    it('removes a filter when value is null', () => {
      const { result } = renderHook(() => useTableState(), {
        wrapper: makeWrapper(['/?status=active']),
      });

      act(() => {
        result.current.setFilter('status', null);
      });

      expect(result.current.tableState.filters.has('status')).toBe(false);
    });

    it('removes a filter when value is empty string', () => {
      const { result } = renderHook(() => useTableState(), {
        wrapper: makeWrapper(['/?status=active']),
      });

      act(() => {
        result.current.setFilter('status', '');
      });

      expect(result.current.tableState.filters.has('status')).toBe(false);
    });

    it('resets page to 1 when filter changes', () => {
      const { result } = renderHook(() => useTableState(), {
        wrapper: makeWrapper(['/?page=5']),
      });

      act(() => {
        result.current.setFilter('status', 'active');
      });

      expect(result.current.tableState.page).toBe(1);
    });
  });

  describe('setSort — 3-state cycling', () => {
    it('cycles from none to asc on first call', () => {
      const { result } = renderHook(() => useTableState(), {
        wrapper: makeWrapper(),
      });

      act(() => {
        result.current.setSort('title');
      });

      expect(result.current.tableState.sortBy).toBe('title');
      expect(result.current.tableState.sortDir).toBe('asc');
    });

    it('cycles from asc to desc on second call', () => {
      const { result } = renderHook(() => useTableState(), {
        wrapper: makeWrapper(['/?sortBy=title&sortOrder=asc']),
      });

      act(() => {
        result.current.setSort('title');
      });

      expect(result.current.tableState.sortBy).toBe('title');
      expect(result.current.tableState.sortDir).toBe('desc');
    });

    it('cycles from desc to none on third call', () => {
      const { result } = renderHook(() => useTableState(), {
        wrapper: makeWrapper(['/?sortBy=title&sortOrder=desc']),
      });

      act(() => {
        result.current.setSort('title');
      });

      expect(result.current.tableState.sortBy).toBeNull();
      expect(result.current.tableState.sortDir).toBeNull();
    });

    it('resets to asc when sorting a different column', () => {
      const { result } = renderHook(() => useTableState(), {
        wrapper: makeWrapper(['/?sortBy=title&sortOrder=asc']),
      });

      act(() => {
        result.current.setSort('amount');
      });

      expect(result.current.tableState.sortBy).toBe('amount');
      expect(result.current.tableState.sortDir).toBe('asc');
    });

    it('uses columnSortKey over columnKey when provided', () => {
      const { result } = renderHook(() => useTableState(), {
        wrapper: makeWrapper(),
      });

      act(() => {
        result.current.setSort('title', 'title_sort_key');
      });

      expect(result.current.tableState.sortBy).toBe('title_sort_key');
    });
  });

  describe('setPage', () => {
    it('updates page in tableState', () => {
      const { result } = renderHook(() => useTableState(), {
        wrapper: makeWrapper(),
      });

      act(() => {
        result.current.setPage(3);
      });

      expect(result.current.tableState.page).toBe(3);
    });
  });

  describe('setPageSize', () => {
    it('updates pageSize in tableState', () => {
      const { result } = renderHook(() => useTableState(), {
        wrapper: makeWrapper(),
      });

      act(() => {
        result.current.setPageSize(50);
      });

      expect(result.current.tableState.pageSize).toBe(50);
    });

    it('resets page to 1 when page size changes', () => {
      const { result } = renderHook(() => useTableState(), {
        wrapper: makeWrapper(['/?page=5']),
      });

      act(() => {
        result.current.setPageSize(50);
      });

      expect(result.current.tableState.page).toBe(1);
    });
  });

  describe('toApiParams', () => {
    it('returns page and pageSize at minimum', () => {
      const { result } = renderHook(() => useTableState(), {
        wrapper: makeWrapper(),
      });

      const params = result.current.toApiParams();
      expect(params.page).toBe(1);
      expect(params.pageSize).toBe(25);
    });

    it('includes q when search is active', () => {
      jest.useFakeTimers();
      const { result } = renderHook(() => useTableState(), {
        wrapper: makeWrapper(['/?q=search+term']),
      });

      const params = result.current.toApiParams();
      expect(params.q).toBe('search term');
    });

    it('does not include q when search is empty', () => {
      const { result } = renderHook(() => useTableState(), {
        wrapper: makeWrapper(),
      });

      const params = result.current.toApiParams();
      expect(params.q).toBeUndefined();
    });

    it('includes sortBy and sortOrder when sort is active', () => {
      const { result } = renderHook(() => useTableState(), {
        wrapper: makeWrapper(['/?sortBy=title&sortOrder=asc']),
      });

      const params = result.current.toApiParams();
      expect(params.sortBy).toBe('title');
      expect(params.sortOrder).toBe('asc');
    });

    it('decomposes number range filter "min:100,max:500" into titleMin and titleMax', () => {
      const { result } = renderHook(() => useTableState(), {
        wrapper: makeWrapper(['/?title=min:100,max:500']),
      });

      const params = result.current.toApiParams();
      expect(params['titleMin']).toBe(100);
      expect(params['titleMax']).toBe(500);
    });

    it('decomposes date range filter "from:2026-01-01,to:2026-12-31" into From and To', () => {
      const { result } = renderHook(() => useTableState(), {
        wrapper: makeWrapper(['/?date=from:2026-01-01,to:2026-12-31']),
      });

      const params = result.current.toApiParams();
      expect(params['dateFrom']).toBe('2026-01-01');
      expect(params['dateTo']).toBe('2026-12-31');
    });

    it('passes through string filter values as-is', () => {
      const { result } = renderHook(() => useTableState(), {
        wrapper: makeWrapper(['/?status=active']),
      });

      const params = result.current.toApiParams();
      expect(params['status']).toBe('active');
    });

    it('passes through boolean filter values as-is', () => {
      const { result } = renderHook(() => useTableState(), {
        wrapper: makeWrapper(['/?isActive=true']),
      });

      const params = result.current.toApiParams();
      expect(params['isActive']).toBe('true');
    });

    it('handles only min in number range filter', () => {
      const { result } = renderHook(() => useTableState(), {
        wrapper: makeWrapper(['/?amount=min:100']),
      });

      const params = result.current.toApiParams();
      expect(params['amountMin']).toBe(100);
      expect(params['amountMax']).toBeUndefined();
    });

    it('handles only to in date range filter', () => {
      const { result } = renderHook(() => useTableState(), {
        wrapper: makeWrapper(['/?date=to:2026-12-31']),
      });

      const params = result.current.toApiParams();
      expect(params['dateFrom']).toBeUndefined();
      expect(params['dateTo']).toBe('2026-12-31');
    });
  });

  describe('resetFilters', () => {
    it('clears all filter params from URL', () => {
      const { result } = renderHook(() => useTableState(), {
        wrapper: makeWrapper(['/?status=active&type=work&page=3']),
      });

      act(() => {
        result.current.resetFilters();
      });

      expect(result.current.tableState.filters.size).toBe(0);
    });

    it('resets page to 1', () => {
      const { result } = renderHook(() => useTableState(), {
        wrapper: makeWrapper(['/?page=5&status=active']),
      });

      act(() => {
        result.current.resetFilters();
      });

      expect(result.current.tableState.page).toBe(1);
    });
  });
});
