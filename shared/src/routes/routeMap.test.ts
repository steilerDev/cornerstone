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
  it('has 90 entries', () => {
    expect(ENTRIES).toHaveLength(90);
  });

  it('has a unique from on every entry', () => {
    const froms = ENTRIES.map((e) => e.from);
    expect(new Set(froms).size).toBe(froms.length);
  });

  it('has a unique id on every entry that carries one', () => {
    const ids = ENTRIES.flatMap((e) => (e.id === undefined ? [] : [e.id]));
    expect(ids).toHaveLength(53);
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
      // The two Site diary filterMode maps (#2224) carry a fixed key list on purpose: History
      // keeps q, dateFrom, dateTo and the first of `types`, and drops every other key.
      if (entry.from.startsWith('/diary?filterMode=')) {
        expect(entry.carries).toEqual(['q', 'dateFrom', 'dateTo', 'types->type']);
        continue;
      }
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
  it('keeps the six Settings tab entries interim and served by the page (#2215)', () => {
    const tabs: [string, string][] = [
      ['areas', '/areas'],
      ['household', '/settings/manage#house'],
      ['trades', '/settings/manage#trades'],
      ['orientations', '/settings/manage#orientations'],
      ['hi-categories', '/settings/manage#purchase-categories'],
      ['budget-categories', '/settings/manage#cost-categories'],
    ];
    for (const [tab, to] of tabs) {
      const entry = ENTRIES.find((e) => e.from === `/settings/manage?tab=${tab}`);
      expect(entry).toBeDefined();
      expect(entry?.stage).toBe('interim');
      expect(entry?.interim).toBe('page');
      expect(entry?.to).toBe(to);
    }
  });

  it('serves /budget/categories as a done redirect to the cost categories section (#2215)', () => {
    const entry = ENTRIES.find((e) => e.from === '/budget/categories');
    expect(entry?.stage).toBe('done');
    expect(entry?.interim).toBeUndefined();
    expect(entry?.to).toBe('/settings/manage#cost-categories');
    const live = LIVE_REDIRECT_ROUTES.find((r) => r.from === '/budget/categories');
    expect(live?.target).toBe('/settings/manage#cost-categories');
  });
});

describe('Areas index rollout (#2218)', () => {
  const entry = (id: string) => ENTRIES.find((e) => e.id === id);

  it('serves the AI-off review redirect live and sends it to the invoice dialog without an empty documentId', () => {
    const rule = ROUTE_MAP.find((e) => e.from === '/budget/invoices/new/paperless (AI off)');
    expect(rule).toMatchObject({
      kind: 'redirect',
      stage: 'done',
      to: '/budget/invoices?create=1',
      carries: ['*'],
    });
    expect(rule?.to).not.toContain('documentId');
  });

  it('serves the Areas index and keeps the area detail planned', () => {
    expect(entry('areas')?.stage).toBe('done');
    expect(entry('area')?.stage).toBe('planned');
  });

  it('redirects /tags straight to the index with no interim form left', () => {
    const tags = ENTRIES.find((e) => e.from === '/tags');
    expect(tags?.stage).toBe('done');
    expect(tags).not.toHaveProperty('interim');
  });

  it('keeps the Settings Areas tab entry interim, served by the page', () => {
    const tab = ENTRIES.find((e) => e.from === '/settings/manage?tab=areas');
    expect(tab?.stage).toBe('interim');
    expect(tab?.interim).toBe('page');
  });
});

describe('Money > Budget route (#2237)', () => {
  it('is served and carries the payment basis, source filter, grouping, estimate and grants params', () => {
    const entry = ENTRIES.find((e) => e.id === 'budgetOverview');
    expect(entry?.stage).toBe('done');
    expect(entry).not.toHaveProperty('interim');
    expect(entry?.carries).toEqual([
      'paymentStatus',
      'deselectedSources',
      'by',
      'estimate',
      'grants',
    ]);
  });
});

describe('Site diary list route (#2225)', () => {
  it('carries the list search, type, date, area, company and status params', () => {
    const entry = ENTRIES.find((e) => e.id === 'diary');
    expect(entry?.stage).toBe('done');
    expect(entry?.carries).toEqual([
      'q',
      'types',
      'dateFrom',
      'dateTo',
      'areaId',
      'companyId',
      'status',
    ]);
  });
});

describe('History page rollout (#2224)', () => {
  it('serves /history', () => {
    const entry = ENTRIES.find((e) => e.id === 'history');
    expect(entry?.stage).toBe('done');
    expect(entry).not.toHaveProperty('interim');
  });

  it.each(['automatic', 'all'])(
    'keeps the /diary?filterMode=%s map interim, served by the page',
    (mode) => {
      const entry = ENTRIES.find((e) => e.from === `/diary?filterMode=${mode}`);
      expect(entry?.stage).toBe('interim');
      expect(entry?.interim).toBe('page');
    },
  );
  describe('Home (#2230)', () => {
    it('serves home as a done page at / with no interim form', () => {
      const home = ROUTE_MAP.find((e) => 'id' in e && e.id === 'home');
      expect(home).toMatchObject({ from: '/', to: '/', kind: 'page', stage: 'done' });
      expect(home).not.toHaveProperty('interim');
    });

    it.each([
      ['dashboard', '/project/overview'],
      ['project', '/project'],
    ])('serves %s (%s) as a done redirect straight to / with no interim form', (id, from) => {
      const entry = ROUTE_MAP.find((e) => 'id' in e && e.id === id);
      expect(entry).toMatchObject({ from, to: '/', kind: 'redirect', stage: 'done' });
      expect(entry).not.toHaveProperty('interim');
      const live = LIVE_REDIRECT_ROUTES.find((r) => r.from === from);
      expect(live?.target).toBe('/');
    });

    it('no longer lists / among the live redirects', () => {
      expect(LIVE_REDIRECT_ROUTES.some((r) => r.from === '/')).toBe(false);
    });

    it('lets the invoices page carry openOnly', () => {
      const invoices = ROUTE_MAP.find((e) => 'id' in e && e.id === 'invoices');
      expect(invoices?.carries).toContain('openOnly');
    });

    it('lets the invoices page carry its list state and flags, but not page, pageSize or filters (#2238)', () => {
      const invoices = ROUTE_MAP.find((e) => 'id' in e && e.id === 'invoices');
      for (const key of [
        'q',
        'status',
        'group',
        'sortBy',
        'sortOrder',
        'vendorId',
        'date',
        'dueDate',
        'amount',
        'notYetSplit',
        'withoutDocument',
        'refundsDue',
        'due',
      ]) {
        expect(invoices?.carries).toContain(key);
      }
      for (const key of ['page', 'pageSize', 'filters']) {
        expect(invoices?.carries).not.toContain(key);
      }
    });

    it('serves the retired open-items URL through the Invoices page as an interim replace, not a live redirect (#2238)', () => {
      const entry = ROUTE_MAP.find(
        (e) => e.from === '/budget/invoices?openOnly=true',
      ) as unknown as Record<string, unknown>;
      expect(entry).toMatchObject({ stage: 'interim', interim: 'page', permanent: false });
      expect(LIVE_REDIRECT_ROUTES.some((r) => r.from === '/budget/invoices?openOnly=true')).toBe(
        false,
      );
    });

    it.each(['financing', 'fundingSource', 'grant'])('serves the %s page as done (#2242)', (id) => {
      const entry = (ROUTE_MAP as readonly { id?: string }[]).find((e) => e.id === id)!;
      expect(entry).toMatchObject({ kind: 'page', stage: 'done' });
      expect(entry).not.toHaveProperty('interim');
    });

    it('the Financing page carries create and kind (the New menu and the retired URLs open its dialogs, #2242)', () => {
      const entry = (ROUTE_MAP as readonly { id?: string; carries?: readonly string[] }[]).find(
        (e) => e.id === 'financing',
      )!;
      expect(entry.carries).toEqual(['create', 'kind']);
    });

    it.each([
      ['/budget/subsidies?create=1', '/budget/financing?create=1#grants'],
      ['/budget/sources?create=1', '/budget/financing?create=1#sources'],
    ])('redirecting %s keeps create and lands on %s', (from, to) => {
      expect(resolveLocation(from, ADMIN_CTX)).toMatchObject({ kind: 'redirect', to });
    });

    it.each([
      ['budgetSources', '/budget/sources', '/budget/financing#sources'],
      ['budgetSubsidies', '/budget/subsidies', '/budget/financing#grants'],
    ])('serves %s as a done redirect with no interim form (#2242)', (id, from, to) => {
      const entry = (ROUTE_MAP as readonly { id?: string }[]).find((e) => e.id === id)!;
      expect(entry).toMatchObject({ from, to, kind: 'redirect', stage: 'done' });
      expect(entry).not.toHaveProperty('interim');
    });

    it.each([
      ['/budget/financing/sources', '/budget/financing#sources'],
      ['/budget/financing/grants', '/budget/financing#grants'],
    ])('serves the repair redirect %s as done (#2242)', (from, to) => {
      const entry = ROUTE_MAP.find((e) => e.from === from)!;
      expect(entry).toMatchObject({ to, kind: 'redirect', stage: 'done' });
    });

    it('resolves / as the home page and the retired overview URLs to /', () => {
      expect(resolveLocation('/', ADMIN_CTX)).toMatchObject({ kind: 'page' });
      expect(resolveLocation('/project/overview', ADMIN_CTX)).toMatchObject({
        kind: 'redirect',
        to: '/',
      });
    });
  });
});

describe('Tasks list route (#2245)', () => {
  it('carries the list search, chip, grouping, sort and filter params, and no paging', () => {
    const entry = ENTRIES.find((e) => e.id === 'workItems');
    expect(entry?.stage).toBe('done');
    expect(entry?.carries).toEqual([
      'q',
      'status',
      'group',
      'sortBy',
      'sortOrder',
      'areaId',
      'assignedUserId',
      'assignedVendorId',
      'milestoneId',
      'startDate',
      'endDate',
      'budgetLines',
    ]);
    expect(entry?.carries).not.toContain('page');
    expect(entry?.carries).not.toContain('pageSize');
  });
});
