import { describe, expect, it } from '@jest/globals';
import { ROUTE_MAP } from './routeMap.js';
import { LIVE_REDIRECT_ROUTES } from './redirects.js';
import { resolveLocation, type RouteContext } from './match.js';
import type { RouteMapEntry } from './types.js';

const ENTRIES: readonly RouteMapEntry[] = ROUTE_MAP;

/** The 37 entries that carry no id: legacy redirects, query maps and conditional rules. */
const ID_LESS_FROMS = [
  '/budget/categories',
  '/work-items',
  '/work-items/new',
  '/work-items/:id',
  '/household-items',
  '/household-items/new',
  '/household-items/:id',
  '/household-items/:id/edit',
  '/invoices',
  '/invoices/:id',
  '/timeline',
  '/manage',
  '/tags',
  '/profile',
  '/admin/users',
  '/budget/vendors',
  '/budget/vendors/:id',
  '/schedule/milestones',
  '/schedule/milestones/:id',
  '/budget/financing/sources',
  '/budget/financing/grants',
  '/diary?filterMode=automatic',
  '/diary?filterMode=all',
  '/budget/invoices?openOnly=true',
  '/settings/manage?tab=areas',
  '/settings/manage?tab=household',
  '/settings/manage?tab=trades',
  '/settings/manage?tab=orientations',
  '/settings/manage?tab=hi-categories',
  '/settings/manage?tab=budget-categories',
  '/project/work-items/:id?depError=',
  '/schedule?view=calendar',
  '/budget/invoices/new/paperless (Paperless off)',
  '/budget/invoices/new/paperless (AI off)',
  '/budget/invoices/:id/auto-itemize/:documentId (Paperless or AI off)',
  '/documents (Paperless off)',
  '/settings/users, /settings/backups, /settings/integrations (member)',
];

const SAMPLE_PARAMS: Record<string, string> = {
  id: 'walk-1',
  documentId: '42',
  areaKey: 'area-1',
  orientationKey: 'none',
};

const ADMIN_CTX: RouteContext = {
  signedIn: true,
  role: 'admin',
  paperlessConfigured: true,
  llmEnabled: true,
};

function instantiate(pattern: string): string {
  return pattern.replace(/:([A-Za-z0-9_]+)/g, (_m, name: string) => SAMPLE_PARAMS[name] ?? 'x');
}

describe('ROUTE_MAP invariants', () => {
  it('has 89 entries', () => {
    expect(ENTRIES).toHaveLength(89);
  });

  it('has a unique from on every entry', () => {
    const froms = ENTRIES.map((e) => e.from);
    expect(new Set(froms).size).toBe(froms.length);
  });

  it('has a unique id on every entry that carries one', () => {
    const ids = ENTRIES.flatMap((e) => (e.id === undefined ? [] : [e.id]));
    expect(ids).toHaveLength(52);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every id a plain-path from (no query, hash or condition)', () => {
    for (const entry of ENTRIES) {
      if (entry.id === undefined) continue;
      expect(entry.from).not.toMatch(/[?# ()]/);
    }
  });

  it('sets interim exactly on interim entries', () => {
    for (const entry of ENTRIES) {
      expect(entry.interim !== undefined).toBe(entry.stage === 'interim');
    }
  });

  it('keeps the frozen list of id-less entries', () => {
    const idLess = ENTRIES.filter((e) => e.id === undefined).map((e) => e.from);
    expect(idLess).toEqual(ID_LESS_FROMS);
  });

  it('points every parent at an existing id and never forms a cycle', () => {
    const byId = new Map<string, RouteMapEntry>();
    for (const e of ENTRIES) if (e.id !== undefined) byId.set(e.id, e);
    for (const entry of ENTRIES) {
      const seen = new Set<string>();
      let current: RouteMapEntry | undefined = entry;
      while (current?.parent !== undefined) {
        expect(byId.has(current.parent)).toBe(true);
        expect(seen.has(current.parent)).toBe(false);
        seen.add(current.parent);
        current = byId.get(current.parent);
      }
    }
  });

  it('points every match.appliesTo at an existing id', () => {
    const ids = new Set(ENTRIES.flatMap((e) => (e.id === undefined ? [] : [e.id])));
    const applied = ENTRIES.flatMap((e) => e.match?.appliesTo ?? []);
    expect(applied.length).toBeGreaterThan(0);
    for (const id of applied) expect(ids.has(id)).toBe(true);
  });

  it('lets every served redirect carry the whole query string', () => {
    for (const entry of ENTRIES) {
      if (entry.kind !== 'redirect' || entry.stage === 'planned') continue;
      expect(entry.carries).toEqual(['*']);
    }
  });

  it('uses only known stages', () => {
    for (const entry of ENTRIES) {
      expect(['done', 'interim', 'planned']).toContain(entry.stage);
    }
  });
});

describe('legacy URLs stay one hop and permanent', () => {
  it('resolves every live redirect in exactly one hop to a page', () => {
    expect(LIVE_REDIRECT_ROUTES.length).toBeGreaterThan(0);
    for (const route of LIVE_REDIRECT_ROUTES) {
      const first = resolveLocation(instantiate(route.from), ADMIN_CTX);
      expect({ from: route.from, kind: first.kind }).toEqual({
        from: route.from,
        kind: 'redirect',
      });
      if (first.kind !== 'redirect') continue;
      const second = resolveLocation(first.to, ADMIN_CTX);
      expect({ from: route.from, kind: second.kind }).toEqual({ from: route.from, kind: 'page' });
    }
  });

  it('marks exactly the five permanent URLs as permanent, none of them planned', () => {
    const permanent = ENTRIES.filter((e) => e.permanent);
    expect(permanent.map((e) => e.from).sort()).toEqual(
      [
        '/project/work-items/:id',
        '/project/household-items/:id',
        '/project/milestones/:id',
        '/budget/vendors/:id',
        '/companies/:id',
      ].sort(),
    );
    for (const entry of permanent) expect(entry.stage).not.toBe('planned');
  });

  it('keeps every permanent vCard and calendar URL resolvable', () => {
    const urls = [
      '/project/work-items/walk-1',
      '/project/household-items/walk-1',
      '/project/milestones/walk-1',
      '/companies/walk-1',
      '/budget/vendors/walk-1',
    ];
    for (const url of urls) {
      expect({ url, kind: resolveLocation(url, ADMIN_CTX).kind }).not.toEqual({
        url,
        kind: 'notFound',
      });
    }
  });
});
