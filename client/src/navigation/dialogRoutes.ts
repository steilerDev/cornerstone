import { getRouteEntry, matchLocation, routeUrl, safeAppPath } from '@cornerstone/shared';

/** Routes that render the ObjectForm dialog over another page. */
export const DIALOG_ROUTE_IDS = ['workItemNew', 'householdItemNew', 'milestoneNew'] as const;
export type DialogRouteId = (typeof DIALOG_ROUTE_IDS)[number];
export type DialogParentRoute = 'workItems' | 'householdItems' | 'milestones';

/** A location a dialog route renders over (router state `{ background }`). */
export interface BackgroundLocation {
  readonly pathname: string;
  readonly search: string;
  readonly hash: string;
  readonly state: unknown;
  readonly key: string;
}

/** The dialog route id of a pathname, or null. */
export function matchDialogRoute(pathname: string): DialogRouteId | null {
  const id = matchLocation(pathname)?.entry.id;
  return (DIALOG_ROUTE_IDS as readonly string[]).includes(id ?? '') ? (id as DialogRouteId) : null;
}

/** The list route behind a dialog route (the route map `parent`). */
export function dialogParentRoute(id: DialogRouteId): DialogParentRoute {
  return getRouteEntry(id).parent as DialogParentRoute;
}

function withoutBackground(state: unknown): unknown {
  if (typeof state !== 'object' || state === null || !('background' in state)) return state;
  const { background: _background, ...rest } = state as Record<string, unknown>;
  return rest;
}

/**
 * Validates unknown history state into a background location. Only same-origin app paths that
 * are not themselves dialog routes are accepted (`safeAppPath`), so state written by any other
 * code can never become a router location to somewhere else. Null = deep-link mode.
 */
export function readBackground(state: unknown): BackgroundLocation | null {
  if (typeof state !== 'object' || state === null) return null;
  const raw = (state as { background?: unknown }).background;
  if (typeof raw !== 'object' || raw === null) return null;
  const { pathname, search, hash, key, state: nested } = raw as Record<string, unknown>;
  if (
    typeof pathname !== 'string' ||
    typeof search !== 'string' ||
    typeof hash !== 'string' ||
    typeof key !== 'string'
  ) {
    return null;
  }
  if (safeAppPath(`${pathname}${search}${hash}`) === null) return null;
  if (matchDialogRoute(pathname) !== null) return null;
  return { pathname, search, hash, key, state: withoutBackground(nested) };
}

/** Router state that makes a dialog route render over `location`. */
export function backgroundStateFor(location: BackgroundLocation): {
  background: BackgroundLocation;
} {
  const { pathname, search, hash, state, key } = location;
  return { background: { pathname, search, hash, key, state: withoutBackground(state) } };
}

/**
 * The location `<Routes>` renders for a real location: the validated background on a dialog
 * route, the parent list on a dialog route without one (deep link), else the real location.
 */
export function displayLocationFor(real: BackgroundLocation): BackgroundLocation {
  const dialog = matchDialogRoute(real.pathname);
  if (dialog === null) return real;
  const background = readBackground(real.state);
  if (background) return background;
  return {
    pathname: routeUrl(dialogParentRoute(dialog)),
    search: '',
    hash: '',
    state: real.state,
    key: real.key,
  };
}

/** True when the state says the dialog was opened from the New menu or sheet. */
export function hasCreateOpener(state: unknown): boolean {
  return (
    typeof state === 'object' &&
    state !== null &&
    (state as { createOpener?: unknown }).createOpener === true
  );
}
