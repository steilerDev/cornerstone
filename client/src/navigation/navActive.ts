import {
  getRouteEntry,
  isRouteServed,
  matchLocation,
  routePattern,
  routeUrl,
} from '@cornerstone/shared';
import type { RouteId, ServedRouteId } from '@cornerstone/shared';
import type { NavSection, NavSectionId } from './navConfig.js';
import { navSectionForRoute } from './pageIdentity.js';

export interface NavActive {
  readonly sectionId: NavSectionId;
  /** The active view's route, or null when the section entry itself is active. */
  readonly viewRoute: RouteId | null;
  /** True when the current page itself is the entry (not a detail page below it): switching replaces history. */
  readonly exact: boolean;
}

/**
 * The single highlighted sidebar entry for a pathname, resolved from the route map:
 * the first visible view on the matched entry's parent chain wins, then a section's
 * main route, then the section owning the entry's route-map section. No match, or
 * a section the user cannot see, highlights nothing.
 */
export function resolveNavActive(
  pathname: string,
  sections: readonly NavSection[],
): NavActive | null {
  const match = matchLocation(pathname);
  const entryId = match?.entry.id as RouteId | undefined;
  if (!match || !entryId) return null;
  if (match.entry.section === 'System' || match.entry.section === 'Auth') return null;

  const viewOwner = new Map<RouteId, NavSection>();
  const sectionByRoute = new Map<RouteId, NavSection>();
  for (const section of sections) {
    sectionByRoute.set(section.route, section);
    for (const view of section.views) viewOwner.set(view.route, section);
  }

  const seen = new Set<RouteId>();
  let id: RouteId | undefined = entryId;
  while (id && !seen.has(id)) {
    seen.add(id);
    const viewSection = viewOwner.get(id);
    if (viewSection) return { sectionId: viewSection.id, viewRoute: id, exact: id === entryId };
    const section = sectionByRoute.get(id);
    if (section) return { sectionId: section.id, viewRoute: null, exact: id === entryId };
    id = getRouteEntry(id).parent as RouteId | undefined;
  }

  const owner = navSectionForRoute(entryId);
  if (owner && sections.some((s) => s.id === owner.id)) {
    return { sectionId: owner.id, viewRoute: null, exact: false };
  }
  return null;
}

/** href of a section/view route: built with routeUrl; throws for unserved or parameterised routes. */
export function navHref(route: RouteId): string {
  if (!isRouteServed(route)) throw new Error(`Route ${route} is not served`);
  const pattern = routePattern(route);
  if (pattern.includes(':') || pattern === '*') {
    throw new Error(`Route ${route} has no static href`);
  }
  // Dynamic id: the per-route param typing of routeUrl cannot be met statically (no params needed here).
  return (routeUrl as (id: ServedRouteId) => string)(route as ServedRouteId);
}
