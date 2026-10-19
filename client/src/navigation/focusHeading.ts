/** Router-state flag asking the destination page to move focus to its h1 on arrival. */
const FOCUS_HEADING_KEY = 'focusHeading';

/**
 * Returns `state` (typically the forwarded origin state) with the focus-heading flag added.
 * Other keys, such as `origin`, are kept.
 */
export function withFocusHeading(state: unknown): Record<string, unknown> {
  const base =
    typeof state === 'object' && state !== null ? (state as Record<string, unknown>) : {};
  return { ...base, [FOCUS_HEADING_KEY]: true };
}

/** True when the router state carries the focus-heading flag. */
export function readFocusHeading(state: unknown): boolean {
  if (typeof state !== 'object' || state === null) return false;
  return (state as Record<string, unknown>)[FOCUS_HEADING_KEY] === true;
}
