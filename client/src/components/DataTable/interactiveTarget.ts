import type React from 'react';

const INTERACTIVE =
  'a[href], button, input, select, textarea, label, summary, [role="button"], [role="link"], [role="menuitem"], [role="checkbox"], [role="switch"]';

/** True when the click started on an interactive element inside the row/card (not the row itself). */
export function isInteractiveDescendantClick(e: React.MouseEvent<HTMLElement>): boolean {
  const target = e.target;
  if (!(target instanceof Element)) return false;
  const hit = target.closest(INTERACTIVE);
  return hit !== null && hit !== e.currentTarget && e.currentTarget.contains(hit);
}
