// Redirect helpers (EPIC-21, ADR-038): everything the router needs to serve legacy URLs in one
// hop, generated from the route map. Self-contained: imports only './*.js' siblings.

import { ROUTE_MAP } from './routeMap.js';
import type { RouteId } from './routeUrl.js';
import type { RouteCondition, RouteMapEntry } from './types.js';

const ENTRIES: readonly RouteMapEntry[] = ROUTE_MAP;

/**
 * Where the entry redirects to today, or null when it is not served as a redirect.
 * done + redirect -> `to`; interim with a target string -> that string; otherwise null.
 */
export function effectiveTarget(entry: RouteMapEntry): string | null {
  if (entry.stage === 'done') return entry.kind === 'redirect' ? entry.to : null;
  if (entry.stage === 'interim' && entry.interim !== undefined && entry.interim !== 'page') {
    return entry.interim;
  }
  return null;
}

export interface LiveRedirectRoute {
  readonly from: string;
  readonly path: string;
  readonly target: string;
}

/** Every plain redirect the router serves today, in route-map order. */
export const LIVE_REDIRECT_ROUTES: readonly LiveRedirectRoute[] = ENTRIES.flatMap((entry) => {
  if (entry.stage === 'planned' || entry.match) return [];
  const target = effectiveTarget(entry);
  return target === null ? [] : [{ from: entry.from, path: entry.from, target }];
});

/**
 * Resolve a redirect target against the incoming location: `:name` segments come from `params`
 * (URI-encoded), target-defined query keys override incoming ones, and the target hash wins over
 * the incoming hash.
 */
export function resolveRedirect(
  target: string,
  params: Readonly<Record<string, string | undefined>>,
  search: string,
  hash: string,
): string {
  const hashAt = target.indexOf('#');
  const targetHash = hashAt >= 0 ? target.slice(hashAt) : '';
  const beforeHash = hashAt >= 0 ? target.slice(0, hashAt) : target;
  const queryAt = beforeHash.indexOf('?');
  const rawPath = queryAt >= 0 ? beforeHash.slice(0, queryAt) : beforeHash;
  const targetQuery = queryAt >= 0 ? beforeHash.slice(queryAt + 1) : '';

  const path = rawPath.replace(/:([A-Za-z0-9_]+)/g, (_match, name: string) => {
    const value = params[name];
    if (value === undefined) throw new Error(`Redirect target '${target}' needs param '${name}'`);
    return encodeURIComponent(value);
  });

  const query = new URLSearchParams(search);
  for (const [key, value] of new URLSearchParams(targetQuery)) query.set(key, value);
  const queryText = query.toString();

  return path + (queryText ? `?${queryText}` : '') + (targetHash || hash);
}

/** Live (stage done) conditional rules, other than the role guard, that apply to a page id. */
export function liveConditionalRules(pageId: RouteId): readonly RouteMapEntry[] {
  return ENTRIES.filter(
    (entry) =>
      entry.stage === 'done' &&
      entry.match?.condition !== undefined &&
      entry.match.condition !== 'not-admin' &&
      (entry.match.appliesTo ?? []).includes(pageId),
  );
}

export interface RouteGateContext {
  readonly paperlessConfigured: boolean;
  readonly llmEnabled: boolean;
}

/** Whether a gate condition holds. 'not-admin' throws: RoleGuard owns it. */
export function conditionHolds(condition: RouteCondition, ctx: RouteGateContext): boolean {
  switch (condition) {
    case 'paperless-off':
      return !ctx.paperlessConfigured;
    case 'ai-off':
      return !ctx.llmEnabled;
    case 'paperless-or-ai-off':
      return !ctx.paperlessConfigured || !ctx.llmEnabled;
    case 'not-admin':
      throw new Error("Condition 'not-admin' is handled by RoleGuard");
  }
}
