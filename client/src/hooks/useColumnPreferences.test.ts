import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// Mock the usePreferences hook that useColumnPreferences depends on
const mockUpsert = jest.fn<(key: string, value: string) => Promise<void>>();
const mockRemove = jest.fn<(key: string) => Promise<void>>();
const mockRefresh = jest.fn();
const mockUsePreferences = jest.fn();

jest.unstable_mockModule('./usePreferences.js', () => ({
  usePreferences: mockUsePreferences,
}));

import type * as UseColumnPreferencesModule from './useColumnPreferences.js';

let useColumnPreferences: (typeof UseColumnPreferencesModule)['useColumnPreferences'];

interface TestItem {
  id: string;
  title: string;
  amount: number;
}

const COLUMNS: Array<{
  key: string;
  label: string;
  defaultVisible?: boolean;
  render: () => string;
}> = [
  { key: 'title', label: 'Title', defaultVisible: true, render: () => '' },
  { key: 'amount', label: 'Amount', defaultVisible: true, render: () => '' },
  { key: 'id', label: 'ID', defaultVisible: false, render: () => '' },
];

function makePreference(key: string, value: string) {
  return { key, value, updatedAt: '2026-01-01T00:00:00Z' };
}

function makeUsePreferencesResult(preferences = [] as ReturnType<typeof makePreference>[]) {
  return {
    preferences,
    isLoading: false,
    error: null,
    upsert: mockUpsert,
    remove: mockRemove,
    refresh: mockRefresh,
  };
}

beforeEach(async () => {
  ({ useColumnPreferences } =
    (await import('./useColumnPreferences.js')) as typeof UseColumnPreferencesModule);
  mockUsePreferences.mockReset();
  mockUpsert.mockReset();
  mockUsePreferences.mockReturnValue(makeUsePreferencesResult());
  mockUpsert.mockResolvedValue(undefined);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useColumnPreferences', () => {
  describe('initial state from defaults', () => {
    it('initializes visibleColumns from columns with defaultVisible !== false', () => {
      const { result } = renderHook(() => useColumnPreferences('test-page', COLUMNS as any));

      expect(result.current.visibleColumns.has('title')).toBe(true);
      expect(result.current.visibleColumns.has('amount')).toBe(true);
      expect(result.current.visibleColumns.has('id')).toBe(false);
    });

    it('includes columns without explicit defaultVisible (treated as true)', () => {
      const columns = [
        { key: 'name', label: 'Name', render: () => '' }, // no defaultVisible
        { key: 'hidden', label: 'Hidden', defaultVisible: false, render: () => '' },
      ];
      const { result } = renderHook(() => useColumnPreferences('test-page', columns as any));

      expect(result.current.visibleColumns.has('name')).toBe(true);
      expect(result.current.visibleColumns.has('hidden')).toBe(false);
    });

    it('returns isLoaded=true immediately (preferences available synchronously)', () => {
      const { result } = renderHook(() => useColumnPreferences('test-page', COLUMNS as any));
      expect(result.current.isLoaded).toBe(true);
    });
  });

  describe('loading from preferences', () => {
    it('loads visible columns from stored preferences when key matches', async () => {
      mockUsePreferences.mockReturnValue(
        makeUsePreferencesResult([
          makePreference('table.test-page.columns', JSON.stringify(['title', 'id'])),
        ]),
      );

      const { result } = renderHook(() => useColumnPreferences('test-page', COLUMNS as any));

      await waitFor(() => {
        expect(result.current.visibleColumns.has('title')).toBe(true);
        expect(result.current.visibleColumns.has('id')).toBe(true);
        expect(result.current.visibleColumns.has('amount')).toBe(false);
      });
    });

    it('falls back to defaults when no matching preference exists', async () => {
      mockUsePreferences.mockReturnValue(makeUsePreferencesResult([]));

      const { result } = renderHook(() => useColumnPreferences('test-page', COLUMNS as any));

      await waitFor(() => {
        expect(result.current.visibleColumns.has('title')).toBe(true);
        expect(result.current.visibleColumns.has('amount')).toBe(true);
        expect(result.current.visibleColumns.has('id')).toBe(false);
      });
    });

    it('falls back to defaults when stored JSON is invalid', async () => {
      mockUsePreferences.mockReturnValue(
        makeUsePreferencesResult([makePreference('table.test-page.columns', 'not-valid-json{{{')]),
      );

      const { result } = renderHook(() => useColumnPreferences('test-page', COLUMNS as any));

      await waitFor(() => {
        // Should use defaults when JSON parse fails
        expect(result.current.visibleColumns.has('title')).toBe(true);
        expect(result.current.visibleColumns.has('amount')).toBe(true);
      });
    });

    it('uses pageKey to construct preference key "table.<pageKey>.columns"', async () => {
      mockUsePreferences.mockReturnValue(
        makeUsePreferencesResult([
          makePreference('table.invoices.columns', JSON.stringify(['amount'])),
          makePreference('table.test-page.columns', JSON.stringify(['title'])),
        ]),
      );

      const { result } = renderHook(() => useColumnPreferences('test-page', COLUMNS as any));

      await waitFor(() => {
        // Should use the 'test-page' key, not 'invoices'
        expect(result.current.visibleColumns.has('title')).toBe(true);
        expect(result.current.visibleColumns.has('amount')).toBe(false);
      });
    });
  });

  describe('toggleColumn', () => {
    it('removes a visible column from visibleColumns', async () => {
      jest.useFakeTimers();
      const { result } = renderHook(() => useColumnPreferences('test-page', COLUMNS as any));

      act(() => {
        result.current.toggleColumn('title');
      });

      expect(result.current.visibleColumns.has('title')).toBe(false);
    });

    it('adds a hidden column to visibleColumns', () => {
      jest.useFakeTimers();
      const { result } = renderHook(() => useColumnPreferences('test-page', COLUMNS as any));

      act(() => {
        result.current.toggleColumn('id'); // id is hidden by default
      });

      expect(result.current.visibleColumns.has('id')).toBe(true);
    });

    it('debounces upsert — rapid toggles result in one upsert call', async () => {
      jest.useFakeTimers();
      const { result } = renderHook(() => useColumnPreferences('test-page', COLUMNS as any));

      act(() => {
        result.current.toggleColumn('title');
        result.current.toggleColumn('amount');
        result.current.toggleColumn('title');
        result.current.toggleColumn('amount');
        result.current.toggleColumn('id');
      });

      // Before debounce fires: no upsert call
      expect(mockUpsert).not.toHaveBeenCalled();

      // After 500ms debounce
      await act(async () => {
        jest.advanceTimersByTime(500);
      });

      expect(mockUpsert).toHaveBeenCalledTimes(1);
    });

    it('saves updated visible columns as JSON after debounce', async () => {
      jest.useFakeTimers();
      const { result } = renderHook(() => useColumnPreferences('test-page', COLUMNS as any));

      act(() => {
        result.current.toggleColumn('id'); // add id to visible
      });

      await act(async () => {
        jest.advanceTimersByTime(500);
      });

      expect(mockUpsert).toHaveBeenCalledWith('table.test-page.columns', expect.any(String));
      const savedValue = JSON.parse(
        (mockUpsert.mock.calls[0] as [string, string])[1],
      ) as { visible: string[]; order: string[] };
      expect(savedValue.visible).toContain('id');
    });
  });

  describe('resetToDefaults', () => {
    it('resets visibleColumns to default-visible columns', async () => {
      jest.useFakeTimers();
      // Start with saved preference that hides 'title'
      mockUsePreferences.mockReturnValue(
        makeUsePreferencesResult([
          makePreference('table.test-page.columns', JSON.stringify(['amount'])),
        ]),
      );

      const { result } = renderHook(() => useColumnPreferences('test-page', COLUMNS as any));

      await waitFor(() => {
        expect(result.current.visibleColumns.has('title')).toBe(false);
      });

      act(() => {
        result.current.resetToDefaults();
      });

      expect(result.current.visibleColumns.has('title')).toBe(true);
      expect(result.current.visibleColumns.has('amount')).toBe(true);
      expect(result.current.visibleColumns.has('id')).toBe(false);
    });

    it('saves defaults to preferences after debounce', async () => {
      jest.useFakeTimers();
      const { result } = renderHook(() => useColumnPreferences('test-page', COLUMNS as any));

      act(() => {
        result.current.resetToDefaults();
      });

      await act(async () => {
        jest.advanceTimersByTime(500);
      });

      expect(mockUpsert).toHaveBeenCalledWith('table.test-page.columns', expect.any(String));
      const savedValue = JSON.parse(
        (mockUpsert.mock.calls[0] as [string, string])[1],
      ) as { visible: string[]; order: string[] };
      expect(savedValue.visible).toContain('title');
      expect(savedValue.visible).toContain('amount');
      expect(savedValue.visible).not.toContain('id');
    });
  });
});
