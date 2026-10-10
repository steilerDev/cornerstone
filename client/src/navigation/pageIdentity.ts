import { getRouteEntry, isRouteServed, matchLocation, resolveRedirect } from '@cornerstone/shared';
import type { RouteId } from '@cornerstone/shared';
import { NAV_SECTIONS } from './navConfig.js';
import type { NavLabelKey, NavSection } from './navConfig.js';

export const TITLE_SEPARATOR = ' · ';
/** Brand name, matches index.html <title>; not translated. */
export const PRODUCT_NAME = 'Cornerstone';

function isKnownRouteId(id: string): id is RouteId {
  try {
    getRouteEntry(id as RouteId);
    return true;
  } catch {
    return false;
  }
}

/** True when `route` is an interim redirect/page whose alias URL is the `from` of `id`. */
function aliasMatches(route: RouteId, id: RouteId): boolean {
  const routeEntry = getRouteEntry(route);
  if (routeEntry.stage !== 'interim' || typeof routeEntry.interim !== 'string') return false;
  if (routeEntry.interim === 'page') return false;
  return routeEntry.interim === getRouteEntry(id).from;
}

/** Label key when the route is a NavConfig view (section main route or views[]), else null. */
export function navLabelKeyForRoute(id: string): NavLabelKey | null {
  if (!isKnownRouteId(id)) return null;
  for (const section of NAV_SECTIONS) {
    if (section.route === id) return section.mainViewLabelKey;
    const view = section.views.find((v) => v.route === id);
    if (view) return view.labelKey;
  }
  for (const section of NAV_SECTIONS) {
    if (aliasMatches(section.route, id)) return section.mainViewLabelKey;
    const view = section.views.find((v) => aliasMatches(v.route, id));
    if (view) return view.labelKey;
  }
  return null;
}

export function navLabelKeyForPath(pathname: string): NavLabelKey | null {
  const id = matchLocation(pathname)?.entry.id;
  return id ? navLabelKeyForRoute(id) : null;
}

/** A view is a NavConfig main route or view route (incl. interim aliases): no trail, no Back. */
export function isNavView(id: string): boolean {
  return navLabelKeyForRoute(id) !== null;
}

export function navSectionForRoute(id: string): NavSection | null {
  if (!isKnownRouteId(id)) return null;
  const { section } = getRouteEntry(id);
  return NAV_SECTIONS.find((s) => s.owns.includes(section)) ?? null;
}

export interface ChainItem {
  readonly id: string;
  readonly href: string;
  readonly labelKey: NavLabelKey | null;
}

/** Served ancestors of a route, root first. Views have no chain. */
export function breadcrumbChain(
  id: string,
  params: Readonly<Record<string, string>>,
): readonly ChainItem[] {
  if (!isKnownRouteId(id) || isNavView(id)) return [];
  const chain: ChainItem[] = [];
  const seen = new Set<string>([id]);
  let parentId = getRouteEntry(id).parent;
  while (parentId && !seen.has(parentId) && isKnownRouteId(parentId)) {
    seen.add(parentId);
    if (isRouteServed(parentId)) {
      try {
        const href = resolveRedirect(getRouteEntry(parentId).from, params, '', '');
        chain.push({ id: parentId, href, labelKey: navLabelKeyForRoute(parentId) });
      } catch {
        // a required param is missing: skip this ancestor
      }
    }
    parentId = getRouteEntry(parentId).parent;
  }
  return chain.reverse();
}

export function composeDocumentTitle(parts: {
  page?: string | null;
  section?: string | null;
  house?: string | null;
}): string {
  const page = parts.page?.trim() ?? '';
  const section = parts.section?.trim() ?? '';
  const house = parts.house?.trim() || PRODUCT_NAME;
  const segments: string[] = [];
  if (page) segments.push(page);
  if (section && section !== page) segments.push(section);
  segments.push(house);
  return segments.join(TITLE_SEPARATOR);
}
