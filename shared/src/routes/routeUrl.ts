// Route helpers (EPIC-21, ADR-038): build app URLs from route ids.
// Self-contained: imports only './*.js' siblings (E2E and plan:check load this folder as source).

import { ROUTE_MAP } from './routeMap.js';
import type { RouteMapEntry } from './types.js';

type Entry = (typeof ROUTE_MAP)[number];
type IdOf<E> = E extends { readonly id: infer I extends string } ? I : never;

/** Every addressable route id (including planned ones; NavConfig may reference them). */
export type RouteId = IdOf<Entry>;
/** Ids that are served today (stage done/interim) and can be linked with routeUrl(). */
export type ServedRouteId = Exclude<
  IdOf<Extract<Entry, { readonly stage: 'done' | 'interim' }>>,
  'notFound'
>;
export type RoutePatternOf<I extends RouteId> = Extract<Entry, { readonly id: I }>['from'];

type ParamNames<P extends string> = P extends `${string}:${infer N}/${infer R}`
  ? N | ParamNames<`/${R}`>
  : P extends `${string}:${infer N}`
    ? N
    : never;

export type RouteParams<I extends RouteId> = {
  readonly [K in ParamNames<RoutePatternOf<I>>]: string | number;
};
export type RouteQueryValue =
  string | number | boolean | null | undefined | readonly (string | number)[];
export type RouteQuery = Readonly<Record<string, RouteQueryValue>>;

const BY_ID: ReadonlyMap<string, RouteMapEntry> = new Map(
  ROUTE_MAP.flatMap((entry): [string, RouteMapEntry][] =>
    'id' in entry ? [[entry.id, entry as RouteMapEntry]] : [],
  ),
);

/** The entry of a route id. Throws on an unknown id (a programming error). */
export function getRouteEntry(id: RouteId): RouteMapEntry {
  const entry = BY_ID.get(id);
  if (!entry) throw new Error(`Unknown route id '${id}'`);
  return entry;
}

/** The route pattern (`from`) of an id, e.g. for `<Route path>`; '*' for notFound. */
export function routePattern(id: RouteId): string {
  return getRouteEntry(id).from;
}

/** True when the route is served today (stage is not 'planned'). */
export function isRouteServed(id: RouteId): boolean {
  return getRouteEntry(id).stage !== 'planned';
}

function buildQuery(query: RouteQuery | undefined): string {
  if (!query) return '';
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) search.append(key, String(item));
    } else {
      search.append(key, String(value));
    }
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

/**
 * Build an app URL from a served route id. Params are URI-encoded; a missing param or an
 * unknown / unserved id throws. Query values: null/undefined are skipped, arrays append one pair
 * per element.
 */
export function routeUrl<I extends ServedRouteId>(
  id: I,
  ...args: [ParamNames<RoutePatternOf<I>>] extends [never]
    ? [params?: undefined, query?: RouteQuery]
    : [params: RouteParams<I>, query?: RouteQuery]
): string {
  const entry = getRouteEntry(id);
  if (entry.stage === 'planned' || entry.from === '*') {
    throw new Error(`Route '${id}' is not served`);
  }
  const params = (args[0] ?? {}) as Readonly<Record<string, string | number>>;
  const path = entry.from.replace(/:([A-Za-z0-9_]+)/g, (_match, name: string) => {
    const value = params[name];
    if (value === undefined || value === null) {
      throw new Error(`Route '${id}' needs param '${name}'`);
    }
    return encodeURIComponent(String(value));
  });
  return path + buildQuery(args[1] as RouteQuery | undefined);
}
