import { useLayoutEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { focusPageHeading } from '../../lib/focusPageHeading.js';

export interface UseFocusRestoreOptions {
  /** false: the hook does nothing (default true). */
  readonly active?: boolean;
  /** Focus target on close when the opener is gone and focus is inside the container or on body. */
  readonly returnFocusRef?: RefObject<HTMLElement | null>;
  /**
   * When `.current` is true at close, the opener is not refocused (it is the thing the dialog
   * just acted on and may be removed later): focus goes to `returnFocusRef`, else the heading.
   */
  readonly skipOpenerRef?: RefObject<boolean>;
}

/**
 * Focus restore for a dialog container (D20): only when focus is still inside the container or
 * has fallen to the body, so hosts that move focus themselves keep working. The chain (opener,
 * returnFocusRef, page heading) runs once when the dialog closes and again after the commit has
 * settled: a host may remove the opener in the same commit that closes the dialog, which drops
 * focus to the body afterwards. The opener is `document.activeElement` when the hook activates.
 */
export function useFocusRestore(
  containerRef: RefObject<HTMLElement | null>,
  { active = true, returnFocusRef, skipOpenerRef }: UseFocusRestoreOptions = {},
): void {
  const latestReturnFocusRef = useRef(returnFocusRef);
  latestReturnFocusRef.current = returnFocusRef;
  const latestSkipOpenerRef = useRef(skipOpenerRef);
  latestSkipOpenerRef.current = skipOpenerRef;

  useLayoutEffect(() => {
    if (!active) return;
    const content = containerRef.current;
    // Captured before the initial-focus effect (passive) moves focus into the container.
    const opener = document.activeElement as HTMLElement | null;

    // Each candidate is tried in turn; focus() is a no-op on a disabled or hidden element, so
    // success is checked by reading activeElement. Last resort: the page heading, never body.
    const restore = () => {
      const target = latestSkipOpenerRef.current?.current ? null : opener;
      if (target && target !== document.body && target.isConnected) {
        target.focus();
        if (document.activeElement === target) return;
      }
      const fallback = latestReturnFocusRef.current?.current;
      if (fallback?.isConnected) {
        fallback.focus();
        if (document.activeElement === fallback) return;
      }
      focusPageHeading();
    };

    return () => {
      const current = document.activeElement;
      const lost = !current || current === document.body || (content?.contains(current) ?? false);
      if (!lost) return;
      restore();
      // After the commit: if the element just focused was removed, focus is on the body again.
      queueMicrotask(() => {
        const now = document.activeElement;
        if (!now || now === document.body) restore();
      });
    };
    // eslint-disable-next-line @eslint-react/exhaustive-deps -- refs are stable; opener is captured once per activation
  }, [active]);
}
