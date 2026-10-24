import { useCallback, useEffect, useRef, type RefObject } from 'react';

/**
 * Imperative writer for the list's one `role="status"` region. The region element and its ref
 * come from `useInfiniteScrollAnnouncements` (pass its returned ref as `regionRef`), so exactly
 * one live region exists. `announce` clears the text and sets it in the next frame so repeats of
 * the same message are announced again.
 */
export function useListAnnouncer(regionRef: RefObject<HTMLDivElement | null>): {
  announce: (message: string) => void;
} {
  const frameRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  const announce = useCallback(
    (message: string) => {
      const node = regionRef.current;
      if (!node) return;
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      node.textContent = '';
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        node.textContent = message;
      });
    },
    [regionRef],
  );

  return { announce };
}
