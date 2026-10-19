import { useCallback, useEffect, useRef, useState } from 'react';
import type { AreaWithCounts, UndoToken } from '@cornerstone/shared';
import { deleteArea, fetchAreasWithCounts, reorderAreas } from '../../lib/areasApi.js';

export type AreasIndexStatus = 'loading' | 'error' | 'ready';

export interface UseAreasIndexResult {
  readonly areas: readonly AreaWithCounts[];
  readonly status: AreasIndexStatus;
  /** After a load error: back to the loading state, then load again. */
  readonly retry: () => void;
  /**
   * Loads again without leaving the ready state (a failed silent reload keeps the old tree).
   * Resolves with the fresh tree, or `null` when the load failed or was superseded.
   */
  readonly refetch: () => Promise<readonly AreaWithCounts[] | null>;
  /**
   * Shows `ids` as the new order of the children of `parentId` at once, then saves it. On failure
   * the old order comes back and the error is rethrown.
   */
  readonly reorder: (parentId: string | null, ids: string[]) => Promise<void>;
  /** Deletes the area with its sub-areas and reloads; resolves with the Undo token. */
  readonly remove: (id: string) => Promise<UndoToken>;
}

/** The Areas index data: the tree with direct counts, optimistic sibling reorder, delete. */
export function useAreasIndex(): UseAreasIndexResult {
  const [areas, setAreas] = useState<readonly AreaWithCounts[]>([]);
  const [status, setStatus] = useState<AreasIndexStatus>('loading');
  const areasRef = useRef<readonly AreaWithCounts[]>([]);
  const sequenceRef = useRef(0);

  const commit = useCallback((next: readonly AreaWithCounts[]) => {
    areasRef.current = next;
    setAreas(next);
  }, []);

  const refetch = useCallback(async (): Promise<readonly AreaWithCounts[] | null> => {
    const sequence = ++sequenceRef.current;
    try {
      const loaded = await fetchAreasWithCounts();
      if (sequence !== sequenceRef.current) return null;
      commit(loaded);
      setStatus('ready');
      return loaded;
    } catch {
      if (sequence !== sequenceRef.current) return null;
      setStatus((previous) => (previous === 'ready' ? 'ready' : 'error'));
      return null;
    }
  }, [commit]);

  useEffect(() => {
    void refetch();
    return () => {
      sequenceRef.current += 1;
    };
  }, [refetch]);

  const retry = useCallback(() => {
    setStatus('loading');
    void refetch();
  }, [refetch]);

  const reorder = useCallback(
    async (parentId: string | null, ids: string[]) => {
      const previous = areasRef.current;
      const position = new Map(ids.map((id, index) => [id, index]));
      sequenceRef.current += 1; // a reload still in flight would undo the move
      commit(
        previous.map((area) =>
          area.parentId === parentId && position.has(area.id)
            ? { ...area, sortOrder: position.get(area.id)! }
            : area,
        ),
      );
      try {
        await reorderAreas({ parentId, ids });
      } catch (error) {
        commit(previous);
        throw error;
      }
    },
    [commit],
  );

  const remove = useCallback(
    async (id: string): Promise<UndoToken> => {
      const { undo } = await deleteArea(id);
      await refetch();
      return undo;
    },
    [refetch],
  );

  return { areas, status, retry, refetch, reorder, remove };
}
