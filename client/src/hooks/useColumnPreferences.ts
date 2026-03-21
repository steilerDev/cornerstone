import { useState, useEffect, useRef, useCallback } from 'react';
import type { ColumnDef } from '../components/DataTable/DataTable.js';
import { usePreferences } from './usePreferences.js';

export interface UseColumnPreferencesResult {
  visibleColumns: Set<string>;
  isLoaded: boolean;
  toggleColumn: (key: string) => void;
  resetToDefaults: () => void;
}

/**
 * Hook managing column visibility preferences
 *
 * Persists visible column keys to user preferences under key `table.${pageKey}.columns`.
 * Value is JSON-encoded array of visible column keys.
 *
 * @param pageKey Unique key for this table (e.g. "work-items", "invoices")
 * @param columns Column definitions
 * @returns Visible columns state and control functions
 */
export function useColumnPreferences<T>(
  pageKey: string,
  columns: ColumnDef<T>[],
): UseColumnPreferencesResult {
  const preferenceKey = `table.${pageKey}.columns`;
  const { preferences, upsert } = usePreferences();

  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(() => {
    return new Set(columns.filter((col) => col.defaultVisible !== false).map((col) => col.key));
  });

  const [isLoaded, setIsLoaded] = useState(false);
  const saveDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Load preferences on mount
  useEffect(() => {
    const pref = preferences.find((p) => p.key === preferenceKey);
    if (pref) {
      try {
        const saved = JSON.parse(pref.value) as string[];
        setVisibleColumns(new Set(saved));
      } catch {
        // If JSON parse fails, use defaults
      }
    }
    setIsLoaded(true);
  }, [preferences, preferenceKey]);

  const toggleColumn = useCallback(
    (key: string) => {
      setVisibleColumns((prev) => {
        const updated = new Set(prev);
        if (updated.has(key)) {
          updated.delete(key);
        } else {
          updated.add(key);
        }

        // Debounce save to preferences (500ms)
        if (saveDebounceRef.current) {
          clearTimeout(saveDebounceRef.current);
        }
        saveDebounceRef.current = setTimeout(() => {
          void upsert(preferenceKey, JSON.stringify(Array.from(updated)));
        }, 500);

        return updated;
      });
    },
    [preferenceKey, upsert],
  );

  const resetToDefaults = useCallback(() => {
    const defaults = new Set(
      columns.filter((col) => col.defaultVisible !== false).map((col) => col.key),
    );
    setVisibleColumns(defaults);

    if (saveDebounceRef.current) {
      clearTimeout(saveDebounceRef.current);
    }
    saveDebounceRef.current = setTimeout(() => {
      void upsert(preferenceKey, JSON.stringify(Array.from(defaults)));
    }, 500);
  }, [columns, preferenceKey, upsert]);

  return {
    visibleColumns,
    isLoaded,
    toggleColumn,
    resetToDefaults,
  };
}
