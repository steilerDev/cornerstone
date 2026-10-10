/** Origin of a navigation: where the user came from, carried in router location state. */
export interface NavOrigin {
  /** Full in-app URL (pathname, search and hash). */
  readonly to: string;
  /** Display title when the origin is an object page; otherwise the label comes from NavConfig. */
  readonly name?: string;
}

export interface OriginState {
  readonly origin: NavOrigin;
}

const MAX_NAME_LENGTH = 200;

/** Pathname part of an in-app URL (before `?` or `#`). */
export function pathnameOf(url: string): string {
  const cut = url.search(/[?#]/);
  return cut >= 0 ? url.slice(0, cut) : url;
}

function isInAppPath(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.includes('\\') &&
    // eslint-disable-next-line no-control-regex -- rejecting control characters is the point
    !/[\u0000-\u001F\u007F]/.test(value)
  );
}

/**
 * Validates unknown history state. Only in-app paths are accepted (leading single `/`, no backslash, no control characters), so state written by any other
 * code can never become a `javascript:` or cross-origin href.
 */
export function readOrigin(state: unknown): NavOrigin | null {
  if (typeof state !== 'object' || state === null) return null;
  const raw = (state as { origin?: unknown }).origin;
  if (typeof raw !== 'object' || raw === null) return null;
  const { to, name } = raw as { to?: unknown; name?: unknown };
  if (!isInAppPath(to)) return null;
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (trimmed && trimmed.length <= MAX_NAME_LENGTH) return { to, name: trimmed };
  return { to };
}

export function originStateFor(
  loc: { pathname: string; search: string; hash: string },
  name?: string | null,
): OriginState {
  const to = `${loc.pathname}${loc.search}${loc.hash}`;
  const trimmed = name?.trim();
  return { origin: trimmed ? { to, name: trimmed } : { to } };
}

/** `{ origin }` of the given state when valid, else undefined (for create/edit redirects). */
export function forwardOriginState(state: unknown): OriginState | undefined {
  const origin = readOrigin(state);
  return origin ? { origin } : undefined;
}

export function originHrefOr(state: unknown, fallback: string): string {
  return readOrigin(state)?.to ?? fallback;
}
