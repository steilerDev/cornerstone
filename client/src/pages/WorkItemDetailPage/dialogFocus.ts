import type { RefObject } from 'react';

/**
 * After a list dialog closes: when its opener is gone (the empty-state button disappears once the
 * first row exists) and focus fell to the body, focus the list's Add button, else the page heading.
 */
export function restoreFocusAfterDialog(
  openerRef: RefObject<HTMLElement | null>,
  addTestId: string,
  headingRef: RefObject<HTMLElement | null>,
): void {
  requestAnimationFrame(() => {
    if (openerRef.current?.isConnected || document.activeElement !== document.body) return;
    const add = document.querySelector<HTMLElement>(`[data-testid="${addTestId}"]`);
    (add ?? headingRef.current)?.focus();
  });
}
