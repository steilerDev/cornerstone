import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { computeDropIndex, moveId, positionOf } from './reorder.js';

const DRAG_THRESHOLD_PX = 4;
const EDGE_PX = 48;
const SCROLL_STEP_PX = 8;

export type ReorderSource = 'drag' | 'keyboard';

export interface UseReorderOptions {
  /** Ids in the order currently shown (the committed order). */
  readonly ids: readonly string[];
  readonly disabled: boolean;
  /** The `<ul>` whose children are the rows in `ids` order. */
  readonly listRef: RefObject<HTMLElement | null>;
  /** A finished move: the full id list in its new order. */
  readonly onCommit: (ids: string[], movedId: string, source: ReorderSource) => void;
  /** Page-level polite announcement. */
  readonly onAnnounce: (message: string) => void;
  readonly labelOf: (id: string) => string;
  /**
   * Replaces the common announcement text for a step (e.g. to name the parent of a tree level).
   * Return `undefined` to use the common keys.
   */
  readonly formatAnnouncement?: (
    kind: ReorderAnnouncementKind,
    values: { name: string; position: number; total: number },
  ) => string | undefined;
}

export type ReorderAnnouncementKind = 'pickedUp' | 'position' | 'dropped' | 'reorderCanceled';

export interface DragState {
  readonly id: string;
  readonly fromIndex: number;
  readonly overIndex: number;
}

export interface ReorderHandleProps {
  readonly ref: (element: HTMLButtonElement | null) => () => void;
  readonly onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
  readonly onPointerMove: (event: PointerEvent<HTMLButtonElement>) => void;
  readonly onPointerUp: (event: PointerEvent<HTMLButtonElement>) => void;
  readonly onPointerCancel: (event: PointerEvent<HTMLButtonElement>) => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  readonly onBlur: () => void;
  readonly 'aria-pressed': boolean;
  readonly 'aria-disabled': true | undefined;
}

export interface UseReorderResult {
  /** `ids` normally; the preview order while a row is picked up by keyboard. */
  readonly orderedIds: readonly string[];
  /** The row being dragged by pointer, once the drag has started. */
  readonly drag: DragState | null;
  readonly pickedId: string | null;
  readonly handleProps: (id: string) => ReorderHandleProps;
}

interface PointerSession {
  readonly id: string;
  readonly pointerId: number;
  readonly startY: number;
  readonly fromIndex: number;
  started: boolean;
  lastY: number;
}

interface Picked {
  readonly id: string;
  readonly preview: readonly string[];
}

/**
 * Pointer-drag and keyboard pick-up for one reorderable list. The hook only decides orders;
 * it never touches the server. Pointer drags start after 4 px of movement, so a plain click on
 * the handle does nothing.
 */
export function useReorder({
  ids,
  disabled,
  listRef,
  onCommit,
  onAnnounce,
  labelOf,
  formatAnnouncement,
}: UseReorderOptions): UseReorderResult {
  const { t } = useTranslation('common');
  const [drag, setDrag] = useState<DragState | null>(null);
  const [picked, setPicked] = useState<Picked | null>(null);
  const sessionRef = useRef<PointerSession | null>(null);
  const frameRef = useRef(0);
  /** Id whose handle must get focus back after the next render (moving rows can blur it). */
  const refocusRef = useRef<string | null>(null);
  const handlesRef = useRef(new Map<string, HTMLButtonElement>());

  const rowRects = useCallback(() => {
    // Rows marked data-reorder-skip (a tree's quiet row) are not part of the order.
    const rows = Array.from(listRef.current?.children ?? []).filter(
      (row) => !row.hasAttribute('data-reorder-skip'),
    );
    return rows.map((row) => row.getBoundingClientRect());
  }, [listRef]);

  const stopAutoScroll = useCallback(() => {
    window.cancelAnimationFrame(frameRef.current);
    frameRef.current = 0;
  }, []);

  const updateOver = useCallback(
    (session: PointerSession) => {
      const overIndex = computeDropIndex(session.lastY, rowRects(), session.fromIndex);
      setDrag((prev) =>
        prev && prev.overIndex === overIndex ? prev : { ...(prev ?? session), overIndex },
      );
    },
    [rowRects],
  );

  const startAutoScroll = useCallback(
    (session: PointerSession) => {
      const tick = () => {
        if (sessionRef.current !== session) return;
        if (session.lastY < EDGE_PX) window.scrollBy(0, -SCROLL_STEP_PX);
        else if (session.lastY > window.innerHeight - EDGE_PX) window.scrollBy(0, SCROLL_STEP_PX);
        else {
          frameRef.current = window.requestAnimationFrame(tick);
          return;
        }
        updateOver(session);
        frameRef.current = window.requestAnimationFrame(tick);
      };
      frameRef.current = window.requestAnimationFrame(tick);
    },
    [updateOver],
  );

  useEffect(
    () => () => {
      window.cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  // Moving a keyed row moves its DOM node, which can blur it: give the handle focus back.
  useLayoutEffect(() => {
    const id = refocusRef.current;
    if (id === null) return;
    refocusRef.current = null;
    handlesRef.current.get(id)?.focus();
  });

  const endPointer = useCallback(() => {
    sessionRef.current = null;
    stopAutoScroll();
    setDrag(null);
  }, [stopAutoScroll]);

  const announcePosition = (kind: ReorderAnnouncementKind, id: string, list: readonly string[]) => {
    const values = { name: labelOf(id), ...positionOf(list, id) };
    const custom = formatAnnouncement?.(kind, values);
    if (custom !== undefined) onAnnounce(custom);
    else if (kind === 'pickedUp') onAnnounce(t('referenceList.pickedUp', values));
    else if (kind === 'position') onAnnounce(t('referenceList.position', values));
    else if (kind === 'dropped') onAnnounce(t('referenceList.dropped', values));
    else onAnnounce(t('referenceList.reorderCanceled', values));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, id: string) => {
    const isActivate = event.key === ' ' || event.key === 'Enter';
    if (!picked) {
      if (disabled || !isActivate) return;
      event.preventDefault();
      setPicked({ id, preview: [...ids] });
      announcePosition('pickedUp', id, ids);
      return;
    }
    if (picked.id !== id) return;
    const index = picked.preview.indexOf(id);
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      const next = moveId(picked.preview, id, index + (event.key === 'ArrowUp' ? -1 : 1));
      if (next[index] === id) {
        // At the first or last row: say where the row stays.
        announcePosition('position', id, picked.preview);
        return;
      }
      refocusRef.current = id;
      setPicked({ id, preview: next });
      announcePosition('position', id, next);
    } else if (isActivate) {
      event.preventDefault();
      const changed = picked.preview.some((existing, i) => existing !== ids[i]);
      setPicked(null);
      announcePosition('dropped', id, picked.preview);
      if (changed) onCommit([...picked.preview], id, 'keyboard');
    } else if (event.key === 'Escape') {
      event.preventDefault();
      refocusRef.current = id;
      setPicked(null);
      announcePosition('reorderCanceled', id, ids);
    }
  };

  const handleBlur = (id: string) => {
    // A blur caused by the row moving in the DOM is not the user leaving the handle.
    if (refocusRef.current !== null) return;
    if (picked?.id !== id) return;
    setPicked(null);
    announcePosition('reorderCanceled', id, ids);
  };

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>, id: string) => {
    if (disabled || picked) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const fromIndex = ids.indexOf(id);
    if (fromIndex === -1) return;
    sessionRef.current = {
      id,
      pointerId: event.pointerId,
      startY: event.clientY,
      fromIndex,
      started: false,
      lastY: event.clientY,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const session = sessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    session.lastY = event.clientY;
    if (!session.started) {
      if (Math.abs(event.clientY - session.startY) < DRAG_THRESHOLD_PX) return;
      session.started = true;
      setDrag({ id: session.id, fromIndex: session.fromIndex, overIndex: session.fromIndex });
      startAutoScroll(session);
    }
    updateOver(session);
  };

  const handlePointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    const session = sessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    const wasDragging = session.started;
    const overIndex = computeDropIndex(event.clientY, rowRects(), session.fromIndex);
    endPointer();
    if (!wasDragging || overIndex === session.fromIndex) return;
    const next = moveId(ids, session.id, overIndex);
    announcePosition('dropped', session.id, next);
    refocusRef.current = session.id;
    onCommit(next, session.id, 'drag');
  };

  const handlePointerCancel = (event: PointerEvent<HTMLButtonElement>) => {
    if (sessionRef.current?.pointerId === event.pointerId) endPointer();
  };

  const handleProps = (id: string): ReorderHandleProps => ({
    ref: (element) => {
      if (element) handlesRef.current.set(id, element);
      return () => {
        handlesRef.current.delete(id);
      };
    },
    onPointerDown: (event) => handlePointerDown(event, id),
    onPointerMove: handlePointerMove,
    onPointerUp: handlePointerUp,
    onPointerCancel: handlePointerCancel,
    onKeyDown: (event) => handleKeyDown(event, id),
    onBlur: () => handleBlur(id),
    'aria-pressed': picked?.id === id,
    'aria-disabled': disabled ? true : undefined,
  });

  return {
    orderedIds: picked ? picked.preview : ids,
    drag,
    pickedId: picked?.id ?? null,
    handleProps,
  };
}
