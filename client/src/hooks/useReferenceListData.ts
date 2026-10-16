import { useCallback, useEffect, useState } from 'react';
import { ApiClientError } from '../lib/apiClient.js';

export interface ReferenceListAdapter<Row extends { id: string }, Create, Update> {
  list(): Promise<Row[]>;
  create(values: Create): Promise<Row>;
  update(id: string, changes: Update): Promise<Row>;
  remove(id: string): Promise<void>;
  reorder(ids: string[]): Promise<Row[]>;
}

export type ReferenceListStatus = 'loading' | 'error' | 'ready';

export interface UseReferenceListDataResult<Row, Create, Update> {
  readonly rows: readonly Row[];
  readonly status: ReferenceListStatus;
  /** Re-runs the initial load. */
  readonly retry: () => void;
  /** Appends the returned row. */
  readonly create: (values: Create) => Promise<Row>;
  /** Replaces the row in place. */
  readonly update: (id: string, changes: Update) => Promise<Row>;
  /** Filters the row out. */
  readonly remove: (id: string) => Promise<void>;
  /**
   * Optimistic: sets the rows to the `ids` order, then to the server response. On failure the
   * previous rows come back, a REORDER_SET_MISMATCH re-fetches the list, and the error is rethrown.
   */
  readonly reorder: (ids: string[]) => Promise<void>;
}

/**
 * Loads and edits one ordered reference list over an adapter. Loads once on mount and on
 * `retry()`; a re-fetch after a failed reorder never shows the loading state again.
 * `adapter` must be a stable reference (a module constant).
 */
export function useReferenceListData<Row extends { id: string }, Create, Update>(
  adapter: ReferenceListAdapter<Row, Create, Update>,
): UseReferenceListDataResult<Row, Create, Update> {
  const [rows, setRows] = useState<readonly Row[]>([]);
  const [status, setStatus] = useState<ReferenceListStatus>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    adapter
      .list()
      .then((list) => {
        if (cancelled) return;
        setRows(list);
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [adapter, attempt]);

  const retry = useCallback(() => {
    setStatus('loading');
    setAttempt((n) => n + 1);
  }, []);

  const create = useCallback(
    async (values: Create) => {
      const row = await adapter.create(values);
      setRows((prev) => [...prev, row]);
      return row;
    },
    [adapter],
  );

  const update = useCallback(
    async (id: string, changes: Update) => {
      const row = await adapter.update(id, changes);
      setRows((prev) => prev.map((existing) => (existing.id === id ? row : existing)));
      return row;
    },
    [adapter],
  );

  const remove = useCallback(
    async (id: string) => {
      await adapter.remove(id);
      setRows((prev) => prev.filter((existing) => existing.id !== id));
    },
    [adapter],
  );

  // Depends on `rows`: the caller disables further moves while one is pending, so the
  // snapshot taken here is the one to restore.
  const reorder = useCallback(
    async (ids: string[]) => {
      const previous = rows;
      const byId = new Map(previous.map((row) => [row.id, row]));
      const optimistic = ids.flatMap((id) => {
        const row = byId.get(id);
        return row ? [row] : [];
      });
      if (optimistic.length === previous.length) setRows(optimistic);
      try {
        setRows(await adapter.reorder(ids));
      } catch (err) {
        setRows(previous);
        if (err instanceof ApiClientError && err.error.code === 'REORDER_SET_MISMATCH') {
          try {
            setRows(await adapter.list());
          } catch {
            // Keep the restored rows; the caller's banner already says the move failed.
          }
        }
        throw err;
      }
    },
    [adapter, rows],
  );

  return { rows, status, retry, create, update, remove, reorder };
}
