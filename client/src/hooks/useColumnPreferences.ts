import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { ColumnDef } from '../components/DataTable/DataTable.js';
import { useToast } from '../components/Toast/ToastContext.js';
import { usePreferences } from './usePreferences.js';

export interface UseColumnPreferencesResult {
  visibleColumns: Set<string>;
  columnOrder: string[];
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
  const { t } = useTranslation('common');
  const { showToast } = useToast();

  const defaultColumnOrder = columns.map((col) => col.key);
  const defaultVisibleColumns = new Set(
    columns.filter((col) => col.defaultVisible !== false).map((col) => col.key),
  );

  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(defaultVisibleColumns);
  const [columnOrder, setColumnOrder] = useState<string[]>(defaultColumnOrder);

  const saveDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Which preference key this hook instance has taken local ownership of.
  // Once the user edits columns, this hook is the single source of truth for that
  // key and must ignore preference-store echoes (including its own save's echo,
  // which `usePreferences.upsert` emits optimistically as a fresh array reference).
  //
  // Premise this depends on: `usePreferences` keeps `preferences` in private `useState`
  // per call site, with no shared context, so the only writers to this instance's store
  // are its own mount fetch and its own echo. If it ever becomes a shared context/store,
  // this guard would silently swallow legitimate external writes with no test failing,
  // and needs revisiting.
  const localAuthorityKeyRef = useRef<string | null>(null);

  // Latest not-yet-sent payload, and whether a write is currently in flight.
  // Note both refs rely on *replace* semantics for StrictMode safety: `savePreferences`
  // runs inside a `setState` updater and so is genuinely double-invoked in dev, but
  // replacing the pending payload (and `clearTimeout` + `setTimeout` netting one timer)
  // makes that idempotent. Switching to append-style — e.g. pushing onto a queue array
  // instead of replacing — would break that, silently and in dev only.
  const pendingSaveRef = useRef<{ visible: string[]; order: string[] } | null>(null);
  const isSavingRef = useRef(false);

  // Load preferences on mount, and whenever the store changes before the first local edit
  useEffect(() => {
    if (localAuthorityKeyRef.current === preferenceKey) {
      // Local state is authoritative for this key; do not re-apply stored payloads.
      // Note this is deliberately NOT "hydrate once on mount": `usePreferences` starts
      // at `preferences: []` with `isLoading: false`, so mount-only hydration would lock
      // in the defaults and never apply the async fetch result.
      return;
    }

    const pref = preferences.find((p) => p.key === preferenceKey);
    if (pref) {
      try {
        const saved = JSON.parse(pref.value);

        // Handle backwards compatibility: if saved value is an array, treat as visible list
        if (Array.isArray(saved)) {
          /* eslint-disable @eslint-react/set-state-in-effect -- loading and initializing column state from stored preferences */
          setVisibleColumns(new Set(saved));
          setColumnOrder(defaultColumnOrder);
          /* eslint-enable @eslint-react/set-state-in-effect */
        } else if (saved && typeof saved === 'object') {
          // New format: { visible: string[], order: string[] }
          if (Array.isArray(saved.visible)) {
            /* eslint-disable @eslint-react/set-state-in-effect -- loading and initializing column state from stored preferences */
            setVisibleColumns(new Set(saved.visible));
            /* eslint-enable @eslint-react/set-state-in-effect */
          }
          if (Array.isArray(saved.order)) {
            /* eslint-disable @eslint-react/set-state-in-effect -- loading and initializing column state from stored preferences */
            setColumnOrder(saved.order);
            /* eslint-enable @eslint-react/set-state-in-effect */
          }
        }
      } catch {
        // If JSON parse fails, use defaults
      }
    }
    // eslint-disable-next-line @eslint-react/exhaustive-deps -- defaultColumnOrder is derived from columns each render; the load effect runs on preferences change only
  }, [preferences, preferenceKey]);

  // Drains the pending payload, keeping at most ONE write in flight for this key.
  // Serialization is what makes the persisted value deterministic: a later write is only
  // issued after the earlier one's response, so the server cannot apply them out of order
  // and the newest payload is always the last write to land.
  const drainSaves = useCallback(async () => {
    if (isSavingRef.current) {
      // An in-flight write will pick up the pending payload when it settles.
      return;
    }
    isSavingRef.current = true;
    try {
      // Loop rather than a single send: a debounce timer that fires while a write is in
      // flight returns early above, and no further toggle is guaranteed to re-arm it, so
      // the drain must re-check for pending work after each write settles.
      while (pendingSaveRef.current) {
        const payload = pendingSaveRef.current;
        pendingSaveRef.current = null;
        try {
          await upsert(preferenceKey, JSON.stringify(payload));
        } catch {
          showToast('error', t('dataTable.columnSettings.saveError'));
        }
      }
    } finally {
      isSavingRef.current = false;
    }
  }, [preferenceKey, upsert, showToast, t]);

  const savePreferences = useCallback(
    (newVisible: Set<string>, newOrder: string[]) => {
      // Latest payload always wins, replacing any not-yet-sent payload.
      pendingSaveRef.current = { visible: Array.from(newVisible), order: newOrder };
      if (saveDebounceRef.current) {
        clearTimeout(saveDebounceRef.current);
      }
      saveDebounceRef.current = setTimeout(() => {
        void drainSaves();
      }, 500);
    },
    [drainSaves],
  );

  const toggleColumn = useCallback(
    (key: string) => {
      localAuthorityKeyRef.current = preferenceKey;
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
    [columnOrder, preferenceKey, savePreferences],
  );

  const moveColumn = useCallback(
    (from: number, to: number) => {
      localAuthorityKeyRef.current = preferenceKey;
      setColumnOrder((prev) => {
        const updated = [...prev];
        const [item] = updated.splice(from, 1);
        updated.splice(to, 0, item!); // from is always a valid index from drag-drop
        savePreferences(visibleColumns, updated);
        return updated;
      });
    },
    [visibleColumns, preferenceKey, savePreferences],
  );

  const resetToDefaults = useCallback(() => {
    localAuthorityKeyRef.current = preferenceKey;
    const defaults = new Set(
      columns.filter((col) => col.defaultVisible !== false).map((col) => col.key),
    );
    setVisibleColumns(defaults);
    setColumnOrder(defaultColumnOrder);
    savePreferences(defaults, defaultColumnOrder);
  }, [columns, defaultColumnOrder, preferenceKey, savePreferences]);

  return {
    visibleColumns,
    columnOrder,
    toggleColumn,
    moveColumn,
    resetToDefaults,
  };
}
