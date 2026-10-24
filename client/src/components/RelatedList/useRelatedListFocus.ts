import { useCallback, useLayoutEffect, useRef, type RefObject } from 'react';

export interface RelatedListFocus {
  /**
   * Remember where focus goes once `removedId` has left the list: the next row's trigger, else
   * the previous row's, else the fallback. `ids` is the list before the removal. With
   * `moves` the row keeps its id (it moves to another group, e.g. an Unlink): focus is placed
   * as soon as the list has been reloaded.
   */
  readonly afterRemove: (
    ids: readonly string[],
    removedId: string,
    options?: { readonly moves?: boolean },
  ) => void;
  /** Focus `id`'s trigger once it is back, only if focus is in the container or on body. */
  readonly afterUndo: (id: string) => void;
}

export interface UseRelatedListFocusArgs {
  /** Current row ids in display order. */
  readonly ids: readonly string[];
  readonly container: RefObject<HTMLElement | null>;
  /** The visible trigger (the row's ⋯) of a row. */
  readonly getTrigger: (id: string) => HTMLElement | null;
  readonly fallback: () => HTMLElement | null;
}

type Pending =
  | {
      readonly kind: 'remove';
      readonly removedId: string;
      readonly neighborId: string | null;
      /** Set when the row keeps its id: resolves once `ids` is no longer this list. */
      readonly movesFrom: readonly string[] | null;
    }
  | { readonly kind: 'undo'; readonly id: string };

/**
 * Focus rules of a related list after Remove and after Undo. Pending targets resolve in a layout
 * effect once the host's rows have changed, and immediately when they already have. Focus never
 * drops to the body.
 */
export function useRelatedListFocus(args: UseRelatedListFocusArgs): RelatedListFocus {
  const { ids, container, getTrigger, fallback } = args;
  const pendingRef = useRef<Pending | null>(null);
  const idsRef = useRef<readonly string[]>(ids);
  const getTriggerRef = useRef(getTrigger);
  const fallbackRef = useRef(fallback);

  const resolve = useCallback(() => {
    const pending = pendingRef.current;
    if (!pending) return;
    const root = container.current;
    if (!root) {
      pendingRef.current = null;
      return;
    }
    if (pending.kind === 'remove') {
      const gone = pending.movesFrom
        ? idsRef.current !== pending.movesFrom
        : !idsRef.current.includes(pending.removedId);
      if (!gone) return;
      pendingRef.current = null;
      const target =
        (pending.neighborId ? getTriggerRef.current(pending.neighborId) : null) ??
        fallbackRef.current();
      target?.focus();
      return;
    }
    if (!idsRef.current.includes(pending.id)) return;
    const trigger = getTriggerRef.current(pending.id);
    if (!trigger) return;
    pendingRef.current = null;
    const active = document.activeElement;
    if (!active || active === document.body || root.contains(active)) {
      trigger.focus();
    }
  }, [container]);

  useLayoutEffect(() => {
    idsRef.current = ids;
    getTriggerRef.current = getTrigger;
    fallbackRef.current = fallback;
    resolve();
  }, [ids, getTrigger, fallback, resolve]);

  const afterRemove = useCallback(
    (before: readonly string[], removedId: string, options?: { readonly moves?: boolean }) => {
      const index = before.indexOf(removedId);
      const neighborId = before[index + 1] ?? (index > 0 ? before[index - 1] : undefined) ?? null;
      pendingRef.current = {
        kind: 'remove',
        removedId,
        neighborId,
        movesFrom: options?.moves ? before : null,
      };
      resolve();
    },
    [resolve],
  );

  const afterUndo = useCallback(
    (id: string) => {
      pendingRef.current = { kind: 'undo', id };
      resolve();
    },
    [resolve],
  );

  return { afterRemove, afterUndo };
}
