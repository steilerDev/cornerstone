import { useState, useEffect, useCallback, useRef } from 'react';
import { usePreferences } from './usePreferences.js';
import type { ColumnDef } from '../components/DataTable/DataTable.js';

export interface UseColumnPreferencesResult<T> {
  visibleColumns: string[];
  setVisibleColumns: (columns: string[]) => void;
  isColumnVisible: (key: string) => boolean;
  toggleColumn: (key: string) => void;
}

export function useColumnPreferences<T>(
  pageKey: string,
  columns: ColumnDef<T>[],
): UseColumnPreferencesResult<T> {
  const { preferences, upsert } = usePreferences();
  const prefKey = `table.${pageKey}.columns`;

  // Compute default visible columns from column defs
  const defaultVisible = columns.filter((c) => c.defaultVisible !== false).map((c) => c.key);

  // Initialize from preferences or defaults
  const [visibleColumns, setVisibleColumnsState] = useState<string[]>(defaultVisible);
  const initializedRef = useRef(false);
  const saveDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Load from preferences once available
  useEffect(() => {
    if (initializedRef.current) return;
    const pref = preferences.find((p) => p.key === prefKey);
    if (pref) {
      try {
        const parsed = JSON.parse(pref.value) as string[];
        // Filter to only valid column keys
        const validKeys = new Set(columns.map((c) => c.key));
        const filtered = parsed.filter((k) => validKeys.has(k));
        if (filtered.length > 0) {
          setVisibleColumnsState(filtered);
        }
      } catch {
        // Invalid preference value — use defaults
      }
    }
    if (preferences.length > 0) {
      initializedRef.current = true;
    }
  }, [preferences, prefKey, columns, defaultVisible]);

  const setVisibleColumns = useCallback(
    (newColumns: string[]) => {
      setVisibleColumnsState(newColumns);

      // Debounce-save to preferences
      if (saveDebounceRef.current) {
        clearTimeout(saveDebounceRef.current);
      }
      saveDebounceRef.current = setTimeout(() => {
        void upsert(prefKey, JSON.stringify(newColumns));
      }, 500);
    },
    [prefKey, upsert],
  );

  const isColumnVisible = useCallback(
    (key: string) => visibleColumns.includes(key),
    [visibleColumns],
  );

  const toggleColumn = useCallback(
    (key: string) => {
      setVisibleColumns(
        visibleColumns.includes(key)
          ? visibleColumns.filter((k) => k !== key)
          : [...visibleColumns, key],
      );
    },
    [visibleColumns, setVisibleColumns],
  );

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (saveDebounceRef.current) {
        clearTimeout(saveDebounceRef.current);
      }
    };
  }, []);

  return {
    visibleColumns,
    setVisibleColumns,
    isColumnVisible,
    toggleColumn,
  };
}
