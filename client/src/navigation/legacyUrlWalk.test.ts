import { describe, it, expect } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROUTE_MAP, baseFrom, resolveLocation } from '@cornerstone/shared';
import type { RouteContext, RouteMapEntry } from '@cornerstone/shared';

/**
 * AC5/AC6 (#2201): every URL the app served before the route map keeps working, in exactly one
 * hop, with its query string and hash intact. The walk is driven from the shared route map; the
 * router file (plan/restructure/router-routes.json, generated from App.tsx) proves the real router
 * serves the same set.
 */

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const ROUTER_ROUTES_FILE = path.join(REPO_ROOT, 'plan/restructure/router-routes.json');

/** The 58 router paths of beta@1deb9f8d, before the route map existed. */
const LEGACY_ROUTER_PATHS = [
  '*',
  '/',
  '/admin/users',
  '/budget',
  '/budget/categories',
  '/budget/invoices',
  '/budget/invoices/:id',
  '/budget/invoices/:id/auto-itemize/:documentId',
  '/budget/invoices/new/paperless',
  '/budget/overview',
  '/budget/reports',
  '/budget/sources',
  '/budget/subsidies',
  '/budget/vendors',
  '/budget/vendors/:id',
  '/diary',
  '/diary/:id',
  '/diary/:id/edit',
  '/diary/new',
  '/household-items',
  '/household-items/:id',
  '/household-items/:id/edit',
  '/household-items/new',
  '/invoices',
  '/invoices/:id',
  '/login',
  '/manage',
  '/photos',
  '/photos/spot/:areaKey/:orientationKey',
  '/profile',
  '/project',
  '/project/household-items',
  '/project/household-items/:id',
  '/project/household-items/:id/edit',
  '/project/household-items/new',
  '/project/milestones',
  '/project/milestones/:id',
  '/project/milestones/new',
  '/project/overview',
  '/project/work-items',
  '/project/work-items/:id',
  '/project/work-items/new',
  '/schedule',
  '/schedule/calendar',
  '/schedule/gantt',
  '/settings',
  '/settings/backups',
  '/settings/manage',
  '/settings/profile',
  '/settings/users',
  '/settings/vendors',
  '/settings/vendors/:id',
  '/setup',
  '/tags',
  '/timeline',
  '/work-items',
  '/work-items/:id',
  '/work-items/new',
] as const;

/** The pathname each legacy URL finally reached before this story (pages land on themselves). */
const REDIRECTED_TODAY: Readonly<Record<string, string>> = {
  '/': '/project/overview',
  '/admin/users': '/settings/users',
  '/budget': '/budget/overview',
  '/budget/categories': '/settings/manage',
  '/budget/vendors': '/settings/vendors',
  '/budget/vendors/:id': '/settings/vendors/:id',
  '/household-items': '/project/household-items',
  '/household-items/:id': '/project/household-items/:id',
  '/household-items/:id/edit': '/project/household-items/:id/edit',
  '/household-items/new': '/project/household-items/new',
  '/invoices': '/budget/invoices',
  '/invoices/:id': '/budget/invoices/:id',
  '/manage': '/settings/manage',
  '/profile': '/settings/profile',
  '/project': '/project/overview',
  '/schedule': '/schedule/gantt',
  '/settings': '/settings/profile',
  '/tags': '/settings/manage',
  '/timeline': '/schedule/gantt',
  '/work-items': '/project/work-items',
  '/work-items/:id': '/project/work-items/:id',
  '/work-items/new': '/project/work-items/new',
};

const SAMPLE_PARAMS: Readonly<Record<string, string>> = {
  id: 'walk-1',
  documentId: '42',
  areaKey: 'area-1',
  orientationKey: 'none',
};

const ADMIN: RouteContext = {
  signedIn: true,
  role: 'admin',
  paperlessConfigured: true,
  llmEnabled: true,
};

const VARIANTS = ['', '?q=walk&page=2', '#walk', '?q=walk#walk'] as const;
const LOGIN_VARIANTS = [
  '?next=%2Fproject%2Fwork-items',
  '?error=oidc_error',
  '?next=%2Fdiary&error=oidc_error',
] as const;

const ENTRIES: readonly RouteMapEntry[] = ROUTE_MAP;

const concrete = (pattern: string): string =>
  pattern.replace(/:([A-Za-z0-9_]+)/g, (_m, name: string) => SAMPLE_PARAMS[name] ?? 'x');

function split(url: string): { pathname: string; search: string; hash: string } {
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

/** Resolve a URL like the router: at most one redirect hop, then a page. */
function walk(url: string): { landing: string; hops: number } {
  const first = resolveLocation(url, ADMIN);
  if (first.kind === 'page') return { landing: url, hops: 0 };
  if (first.kind !== 'redirect') throw new Error(`${url} resolved to ${first.kind}`);
  const second = resolveLocation(first.to, ADMIN);
  if (second.kind !== 'page') {
    throw new Error(`${url} -> ${first.to} is not a page (${second.kind}): more than one hop`);
  }
  return { landing: first.to, hops: 1 };
}

/** Concrete URLs of the query-map entries (their `from`, with a value for empty keys). */
const QUERY_MAP_URLS: readonly string[] = ENTRIES.filter(
  (e) => e.change === 'query-map' && e.match?.query !== undefined,
).map((e) => concrete(e.from).replace(/=$/, '=walk'));

interface RouterRoute {
  readonly path: string;
  readonly kind: 'page' | 'redirect';
}

const routerRoutes: readonly RouterRoute[] = (
  JSON.parse(fs.readFileSync(ROUTER_ROUTES_FILE, 'utf8')) as { routes: RouterRoute[] }
).routes;

describe('legacy URL walk (AC5/AC6)', () => {
  it('freezes the 58 legacy router paths', () => {
    expect(LEGACY_ROUTER_PATHS).toHaveLength(58);
    expect(new Set(LEGACY_ROUTER_PATHS).size).toBe(58);
  });

  it('still serves every legacy router path (AC6)', () => {
    const served = new Set(routerRoutes.map((r) => r.path));
    const missing = LEGACY_ROUTER_PATHS.filter((p) => !served.has(p));
    expect(missing).toEqual([]);
  });

  it('maps every router path, legacy or new, in the route map (fails naming the unmapped ones)', () => {
    const mapped = new Set(ENTRIES.map((e) => baseFrom(e.from)));
    const unmapped = routerRoutes.map((r) => r.path).filter((p) => !mapped.has(p));
    expect(unmapped).toEqual([]);
  });

  it('serves every non-planned plain route-map entry in the router', () => {
    const byPath = new Map(routerRoutes.map((r) => [r.path, r]));
    const wrong: string[] = [];
    for (const entry of ENTRIES) {
      if (entry.stage === 'planned' || entry.match !== undefined) continue;
      const route = byPath.get(entry.from);
      if (!route) wrong.push(`${entry.from} (not in router)`);
    }
    expect(wrong).toEqual([]);
  });

  describe('every legacy path and query variant lands in one hop', () => {
    const paths = LEGACY_ROUTER_PATHS.filter((p) => p !== '*');

    for (const legacy of paths) {
      const variants = legacy === '/login' ? [...VARIANTS, ...LOGIN_VARIANTS] : [...VARIANTS];
      for (const variant of variants) {
        it(`${legacy}${variant || ' (bare)'}`, () => {
          const url = concrete(legacy) + variant;
          const { search, hash } = split(variant);
          const { landing, hops } = walk(url);
          const final = split(landing);

          const expectedPath = concrete(REDIRECTED_TODAY[legacy] ?? legacy);
          expect(final.pathname).toBe(expectedPath);
          expect(hops).toBe(legacy in REDIRECTED_TODAY ? 1 : 0);

          const wanted = new URLSearchParams(search);
          const got = new URLSearchParams(final.search);
          for (const [key, value] of wanted) expect(got.getAll(key)).toContain(value);
          if (hash) expect(final.hash).toBe(hash);
        });
      }
    }

    it('shows the not-found page for an unknown URL (the * route)', () => {
      expect(resolveLocation('/does/not/exist?q=walk', ADMIN).kind).toBe('notFound');
    });
  });

  describe('query-map URLs keep rendering today pages with the query intact', () => {
    it('finds the 10 query-map entries', () => {
      expect(QUERY_MAP_URLS).toHaveLength(10);
    });

    for (const url of QUERY_MAP_URLS) {
      it(url, () => {
        const { landing, hops } = walk(url);
        expect(hops).toBe(0);
        expect(landing).toBe(url);
        expect(split(landing).pathname).toBe(split(url).pathname);
        expect(split(landing).search).toBe(split(url).search);
      });
    }
  });
});
