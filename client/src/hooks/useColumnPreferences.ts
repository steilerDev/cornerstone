import { useState, useEffect, useRef, useCallback } from 'react';
import type { ColumnDef } from '../components/DataTable/DataTable.js';
import { usePreferences } from './usePreferences.js';

export interface UseColumnPreferencesResult {
  visibleColumns: Set<string>;
  columnOrder: string[];
  isLoaded: boolean;
  toggleColumn: (key: string) => void;
  moveColumn: (from: number, to: number) => void;
  resetToDefaults: () => void;
}

/**
 * Hook managing column visibility and ordering preferences
 *
 * Persists column preferences to user preferences under key `table.${pageKey}.columns`.
 * Value is JSON-encoded object: { visible: string[], order: string[] }
 * For backwards compatibility, if stored value is a plain array, it's treated as visible list.
 *
 * @param pageKey Unique key for this table (e.g. "work-items", "invoices")
 * @param columns Column definitions
 * @returns Visible columns, column order, and control functions
 */
export function useColumnPreferences<T>(
  pageKey: string,
  columns: ColumnDef<T>[],
): UseColumnPreferencesResult {
  const preferenceKey = `table.${pageKey}.columns`;
  const { preferences, upsert } = usePreferences();

  const defaultColumnOrder = columns.map((col) => col.key);
  const defaultVisibleColumns = new Set(
    columns.filter((col) => col.defaultVisible !== false).map((col) => col.key),
  );

  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(defaultVisibleColumns);
  const [columnOrder, setColumnOrder] = useState<string[]>(defaultColumnOrder);

  const [isLoaded, setIsLoaded] = useState(false);
  const saveDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Load preferences on mount
  useEffect(() => {
    const pref = preferences.find((p) => p.key === preferenceKey);
    if (pref) {
      try {
        const saved = JSON.parse(pref.value);

        // Handle backwards compatibility: if saved value is an array, treat as visible list
        if (Array.isArray(saved)) {
          setVisibleColumns(new Set(saved));
          setColumnOrder(defaultColumnOrder);
        } else if (saved && typeof saved === 'object') {
          // New format: { visible: string[], order: string[] }
          if (Array.isArray(saved.visible)) {
            setVisibleColumns(new Set(saved.visible));
          }
          if (Array.isArray(saved.order)) {
            setColumnOrder(saved.order);
          }
        }
      } catch {
        // If JSON parse fails, use defaults
      }
    }
    setIsLoaded(true);
  }, [preferences, preferenceKey]);

  const savePreferences = useCallback(
    (newVisible: Set<string>, newOrder: string[]) => {
      if (saveDebounceRef.current) {
        clearTimeout(saveDebounceRef.current);
      }
      saveDebounceRef.current = setTimeout(() => {
        void upsert(
          preferenceKey,
          JSON.stringify({
            visible: Array.from(newVisible),
            order: newOrder,
          }),
        );
      }, 500);
    },
    [preferenceKey, upsert],
  );

  const toggleColumn = useCallback(
    (key: string) => {
      setVisibleColumns((prev) => {
        const updated = new Set(prev);
        if (updated.has(key)) {
          updated.delete(key);
        } else {
          updated.add(key);
        }
        savePreferences(updated, columnOrder);
        return updated;
      });
    },
    [columnOrder, savePreferences],
  );

  const moveColumn = useCallback(
    (from: number, to: number) => {
      setColumnOrder((prev) => {
        const updated = [...prev];
        const [item] = updated.splice(from, 1);
        updated.splice(to, 0, item);
        savePreferences(visibleColumns, updated);
        return updated;
      });
    },
    [visibleColumns, savePreferences],
  );

  const resetToDefaults = useCallback(() => {
    const defaults = new Set(
      columns.filter((col) => col.defaultVisible !== false).map((col) => col.key),
    );
    setVisibleColumns(defaults);
    setColumnOrder(defaultColumnOrder);
    savePreferences(defaults, defaultColumnOrder);
  }, [columns, defaultColumnOrder, savePreferences]);

  return {
    visibleColumns,
    columnOrder,
    isLoaded,
    toggleColumn,
    moveColumn,
    resetToDefaults,
  };
}
