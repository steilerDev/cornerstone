import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

export type ClickOutsideTarget = RefObject<HTMLElement | null> | HTMLElement | null | undefined;

/**
 * Invokes `onClickOutside` on a `mousedown` that lands outside all of the given `targets`.
 * Accepts a mix of ref objects and raw DOM elements so call sites with dynamically
 * resolved elements (e.g. a floating-ui portal ref) can participate without extra wrapping.
 */
export function useClickOutside(
  targets: ClickOutsideTarget[],
  onClickOutside: (event: MouseEvent) => void,
  enabled = true,
): void {
  const targetsRef = useRef(targets);
  targetsRef.current = targets;
  const handlerRef = useRef(onClickOutside);
  handlerRef.current = onClickOutside;

  useEffect(() => {
    if (!enabled) return;

    function handleMouseDown(event: MouseEvent) {
      const node = event.target as Node;
      const isInside = targetsRef.current.some((target) => {
        const el = target instanceof HTMLElement ? target : (target?.current ?? null);
        return el ? el.contains(node) : false;
      });
      if (!isInside) {
        handlerRef.current(event);
      }
    }

    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [enabled]);
}
