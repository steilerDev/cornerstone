import { describe, expect, it } from '@jest/globals';
import {
  LIVE_REDIRECT_ROUTES,
  conditionHolds,
  effectiveTarget,
  liveConditionalRules,
  resolveRedirect,
  type RouteGateContext,
} from './redirects.js';
import { ROUTE_MAP } from './routeMap.js';
import type { RouteMapEntry } from './types.js';

/** The 26 plain redirects the router serves today, in route-map order (a set; order is incidental). */
const FROZEN_LIVE_REDIRECTS: readonly (readonly [string, string])[] = [
  ['/', '/project/overview'],
  ['/companies', '/settings/vendors'],
  ['/companies/:id', '/settings/vendors/:id'],
  ['/project', '/project/overview'],
  ['/budget', '/budget/overview'],
  ['/budget/categories', '/settings/manage?tab=budget-categories'],
  ['/schedule', '/schedule/gantt'],
  ['/settings', '/settings/profile'],
  ['/work-items', '/project/work-items'],
  ['/work-items/new', '/project/work-items/new'],
  ['/work-items/:id', '/project/work-items/:id'],
  ['/household-items', '/project/household-items'],
  ['/household-items/new', '/project/household-items/new'],
  ['/household-items/:id', '/project/household-items/:id'],
  ['/household-items/:id/edit', '/project/household-items/:id/edit'],
  ['/invoices', '/budget/invoices'],
  ['/invoices/:id', '/budget/invoices/:id'],
  ['/timeline', '/schedule/gantt'],
  ['/manage', '/settings/manage'],
  ['/tags', '/settings/manage'],
  ['/profile', '/settings/profile'],
  ['/admin/users', '/settings/users'],
  ['/budget/vendors', '/settings/vendors'],
  ['/budget/vendors/:id', '/settings/vendors/:id'],
  ['/schedule/milestones', '/project/milestones'],
  ['/schedule/milestones/:id', '/project/milestones/:id'],
];

function base(over: Partial<RouteMapEntry>): RouteMapEntry {
  return {
    from: '/x',
    to: '/y',
    kind: 'redirect',
    change: 'redirect',
    section: 'System',
    guard: 'member',
    gate: 'none',
    permanent: false,
    carries: ['*'],
    stage: 'done',
    ...over,
  };
}

describe('LIVE_REDIRECT_ROUTES', () => {
  it('equals the frozen 26-row table of today redirects', () => {
    expect(FROZEN_LIVE_REDIRECTS).toHaveLength(26);
    expect(LIVE_REDIRECT_ROUTES.map((r) => [r.path, r.target])).toEqual(FROZEN_LIVE_REDIRECTS);
  });

  it('uses the from as the router path', () => {
    for (const route of LIVE_REDIRECT_ROUTES) expect(route.path).toBe(route.from);
  });
});

describe('effectiveTarget', () => {
  it('returns to for a done redirect', () => {
    expect(effectiveTarget(base({ stage: 'done', to: '/budget/overview' }))).toBe(
      '/budget/overview',
    );
  });

  it('returns null for a done page', () => {
    expect(effectiveTarget(base({ kind: 'page', stage: 'done' }))).toBeNull();
  });

  it('returns the interim target of an interim redirect', () => {
    expect(effectiveTarget(base({ stage: 'interim', interim: '/settings/vendors' }))).toBe(
      '/settings/vendors',
    );
  });

  it('returns null for an interim page and for an interim without a form', () => {
    expect(effectiveTarget(base({ stage: 'interim', interim: 'page' }))).toBeNull();
    expect(effectiveTarget(base({ stage: 'interim' }))).toBeNull();
  });

  it('returns null for a planned entry', () => {
    expect(effectiveTarget(base({ stage: 'planned' }))).toBeNull();
  });
});

describe('resolveRedirect', () => {
  it('substitutes and URI-encodes params', () => {
    expect(resolveRedirect('/project/work-items/:id', { id: 'a b' }, '', '')).toBe(
      '/project/work-items/a%20b',
    );
    expect(
      resolveRedirect(
        '/budget/invoices/:id/auto-itemize/:documentId',
        { id: '1', documentId: '2' },
        '',
        '',
      ),
    ).toBe('/budget/invoices/1/auto-itemize/2');
  });

  it('carries the incoming query', () => {
    expect(resolveRedirect('/project/work-items', {}, '?q=x&page=2', '')).toBe(
      '/project/work-items?q=x&page=2',
    );
  });

  it('lets the target query override an incoming key of the same name', () => {
    expect(resolveRedirect('/settings/manage?tab=budget-categories', {}, '?tab=old&q=a', '')).toBe(
      '/settings/manage?tab=budget-categories&q=a',
    );
  });

  it('carries the incoming hash', () => {
    expect(resolveRedirect('/project/work-items', {}, '', '#h')).toBe('/project/work-items#h');
  });

  it('prefers a target hash over the incoming one', () => {
    expect(resolveRedirect('/budget/financing#sources', {}, '', '#h')).toBe(
      '/budget/financing#sources',
    );
  });

  it('combines params, query and hash', () => {
    expect(resolveRedirect('/a/:id?x=1', { id: '7' }, '?q=1', '#z')).toBe('/a/7?q=1&x=1#z');
  });

  it('adds no question mark for an empty search', () => {
    expect(resolveRedirect('/a', {}, '', '')).toBe('/a');
    expect(resolveRedirect('/a', {}, '?', '')).toBe('/a');
  });

  it('throws on a missing param', () => {
    expect(() => resolveRedirect('/a/:id', {}, '', '')).toThrow("needs param 'id'");
    expect(() => resolveRedirect('/a/:id', { id: undefined }, '', '')).toThrow("needs param 'id'");
  });
});

describe('liveConditionalRules', () => {
  it('returns exactly the live Paperless-off rule for the review page', () => {
    const rules = liveConditionalRules('invoicePaperlessReview');
    expect(rules).toHaveLength(1);
    expect(rules[0]).toBe(ROUTE_MAP[83]);
    expect(rules[0]?.match?.condition).toBe('paperless-off');
  });

  it('returns nothing for the auto-itemize page (its rule is planned)', () => {
    expect(liveConditionalRules('invoiceAutoItemize')).toEqual([]);
  });

  it('excludes the not-admin rule', () => {
    expect(liveConditionalRules('settingsUsers')).toEqual([]);
  });

  it('returns nothing for pages without rules', () => {
    expect(liveConditionalRules('workItems')).toEqual([]);
  });
});

describe('conditionHolds', () => {
  const ctx = (paperlessConfigured: boolean, llmEnabled: boolean): RouteGateContext => ({
    paperlessConfigured,
    llmEnabled,
  });
  const TABLE = [
    // [paperless, llm, paperless-off, ai-off, paperless-or-ai-off]
    [true, true, false, false, false],
    [true, false, false, true, true],
    [false, true, true, false, true],
    [false, false, true, true, true],
  ] as const;

  for (const [paperless, llm, pOff, aiOff, either] of TABLE) {
    it(`evaluates paperless=${paperless} ai=${llm}`, () => {
      expect(conditionHolds('paperless-off', ctx(paperless, llm))).toBe(pOff);
      expect(conditionHolds('ai-off', ctx(paperless, llm))).toBe(aiOff);
      expect(conditionHolds('paperless-or-ai-off', ctx(paperless, llm))).toBe(either);
    });
  }

  it('throws for not-admin (RoleGuard owns it)', () => {
    expect(() => conditionHolds('not-admin', ctx(true, true))).toThrow('RoleGuard');
  });
});
