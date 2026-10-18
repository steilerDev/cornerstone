import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * A section hash (`#anchor`) moves focus to that section's heading and scrolls it into view
 * (again once `settled` flips, so the layout shift from loading skeletons does not leave it
 * off-screen). Reads the display location, so a dialog route over the page does not refire it.
 * An unknown hash does nothing.
 */
export function useSectionHashFocus(anchors: readonly string[], settled: boolean): void {
  const { hash } = useLocation();
  const handledHashRef = useRef<string | null>(null);

  useEffect(() => {
    const anchor = hash.slice(1);
    if (!anchors.includes(anchor)) {
      handledHashRef.current = null;
      return;
    }
    // After focusPageHeadingWhenReady's first frame, so this focus wins.
    const frame = window.requestAnimationFrame(() => {
      const element =
        document.getElementById(`${anchor}-heading`) ?? document.getElementById(anchor);
      if (!element) return;
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
      const scroll = () =>
        element.scrollIntoView?.({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
      if (handledHashRef.current === hash) {
        // Re-run after the page settled: only re-scroll while the user has not moved on.
        if (document.activeElement === element) scroll();
        return;
      }
      handledHashRef.current = hash;
      element.focus({ preventScroll: true });
      scroll();
    });
    return () => window.cancelAnimationFrame(frame);
    // `anchors` is a module constant at every call site, so it never re-fires the effect.
  }, [anchors, hash, settled]);
}
