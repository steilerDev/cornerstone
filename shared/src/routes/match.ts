// Location matching (EPIC-21, ADR-038): resolve a URL against the route map the way the router
// does. Self-contained: imports only './*.js' siblings.

import {
  conditionHolds,
  effectiveTarget,
  liveConditionalRules,
  resolveRedirect,
  type RouteGateContext,
} from './redirects.js';
import { ROUTE_MAP } from './routeMap.js';
import type { RouteId } from './routeUrl.js';
import type { RouteMapEntry } from './types.js';

const ENTRIES: readonly RouteMapEntry[] = ROUTE_MAP;

/** The plain path of a `from`: everything up to the first `?`, `#` or ` (`. */
export function baseFrom(from: string): string {
  const cut = from.search(/[?# ]/);
  return cut >= 0 ? from.slice(0, cut) : from;
}

function segmentsOf(path: string): string[] {
  const trimmed = path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
  return trimmed.split('/').filter((s) => s.length > 0);
}

/** Segment-wise match of a pattern like `/a/:id` against a pathname; null when it does not match. */
export function matchPattern(pattern: string, pathname: string): Record<string, string> | null {
  const patternSegments = segmentsOf(pattern);
  const pathSegments = segmentsOf(pathname);
  if (patternSegments.length !== pathSegments.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < patternSegments.length; i += 1) {
    const expected = patternSegments[i] as string;
    const actual = pathSegments[i] as string;
    if (expected.startsWith(':')) {
      try {
        params[expected.slice(1)] = decodeURIComponent(actual);
      } catch {
        return null;
      }
    } else if (expected !== actual) {
      return null;
    }
  }
  return params;
}

function staticSegments(pattern: string): number {
  return segmentsOf(pattern).filter((s) => !s.startsWith(':')).length;
}

/** Best served path entry for a pathname (more static segments wins); null = not found. */
export function matchLocation(
  pathname: string,
): { entry: RouteMapEntry; params: Record<string, string> } | null {
  let best: { entry: RouteMapEntry; params: Record<string, string>; score: number } | null = null;
  for (const entry of ENTRIES) {
    if (entry.stage === 'planned' || entry.match || entry.from === '*') continue;
    const params = matchPattern(entry.from, pathname);
    if (!params) continue;
    const score = staticSegments(entry.from);
    if (!best || score > best.score) best = { entry, params, score };
  }
  return best ? { entry: best.entry, params: best.params } : null;
}

export interface RouteContext extends RouteGateContext {
  readonly signedIn: boolean;
  readonly role: 'admin' | 'member';
}

export type RouteResolution =
  | { readonly kind: 'page'; readonly entry: RouteMapEntry }
  | { readonly kind: 'redirect'; readonly to: string; readonly entry: RouteMapEntry }
  | { readonly kind: 'login' }
  | { readonly kind: 'noAccess'; readonly entry: RouteMapEntry }
  | { readonly kind: 'notFound' };

function splitUrl(url: string): { pathname: string; search: string; hash: string } {
  const hashAt = url.indexOf('#');
  const hash = hashAt >= 0 ? url.slice(hashAt) : '';
  const rest = hashAt >= 0 ? url.slice(0, hashAt) : url;
  const queryAt = rest.indexOf('?');
  return {
    pathname: queryAt >= 0 ? rest.slice(0, queryAt) : rest,
    search: queryAt >= 0 ? rest.slice(queryAt) : '',
    hash,
  };
}

function queryHolds(query: Readonly<Record<string, string | true>>, search: string): boolean {
  const incoming = new URLSearchParams(search);
  return Object.entries(query).every(([key, expected]) =>
    expected === true ? incoming.has(key) : incoming.get(key) === expected,
  );
}

/** Resolve a URL the way the router does (see ADR-038 §3). */
export function resolveLocation(url: string, ctx: RouteContext): RouteResolution {
  const { pathname, search, hash } = splitUrl(url);
  const found = matchLocation(pathname);
  if (!found) return ctx.signedIn ? { kind: 'notFound' } : { kind: 'login' };
  const { entry, params } = found;
  if (entry.guard !== 'public' && !ctx.signedIn) return { kind: 'login' };

  const target = effectiveTarget(entry);
  if (target !== null) {
    return { kind: 'redirect', to: resolveRedirect(target, params, search, hash), entry };
  }

  for (const mapEntry of ENTRIES) {
    if (mapEntry.stage !== 'done' || !mapEntry.match?.query) continue;
    if (baseFrom(mapEntry.from) !== entry.from || !queryHolds(mapEntry.match.query, search)) {
      continue;
    }
    return { kind: 'redirect', to: resolveRedirect(mapEntry.to, params, search, hash), entry };
  }

  if (entry.id !== undefined) {
    for (const rule of liveConditionalRules(entry.id as RouteId)) {
      if (rule.match?.condition && conditionHolds(rule.match.condition, ctx)) {
        return { kind: 'redirect', to: resolveRedirect(rule.to, params, search, hash), entry };
      }
    }
  }

  if (entry.guard === 'admin' && ctx.role !== 'admin') return { kind: 'noAccess', entry };
  return { kind: 'page', entry };
}
