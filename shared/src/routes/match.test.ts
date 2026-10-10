import { describe, expect, it } from '@jest/globals';
import {
  baseFrom,
  matchLocation,
  matchPattern,
  resolveLocation,
  type RouteContext,
  type RouteResolution,
} from './match.js';
import { ROUTE_MAP } from './routeMap.js';

const ADMIN: RouteContext = {
  signedIn: true,
  role: 'admin',
  paperlessConfigured: true,
  llmEnabled: true,
};
const MEMBER: RouteContext = { ...ADMIN, role: 'member' };
const ANON: RouteContext = { ...ADMIN, signedIn: false };

function pageId(resolution: RouteResolution): string | undefined {
  return resolution.kind === 'page' ? resolution.entry.id : undefined;
}

describe('baseFrom', () => {
  it('strips query, hash and condition', () => {
    expect(baseFrom('/a?x=1')).toBe('/a');
    expect(baseFrom('/b#frag')).toBe('/b');
    expect(baseFrom('/c (member)')).toBe('/c');
    expect(baseFrom('/plain/:id')).toBe('/plain/:id');
  });
});

describe('matchPattern', () => {
  it('matches static patterns and returns no params', () => {
    expect(matchPattern('/a/b', '/a/b')).toEqual({});
  });

  it('extracts and percent-decodes params', () => {
    expect(matchPattern('/a/:id', '/a/x%20y')).toEqual({ id: 'x y' });
  });

  it('ignores a trailing slash', () => {
    expect(matchPattern('/a/:id', '/a/1/')).toEqual({ id: '1' });
  });

  it('matches the root', () => {
    expect(matchPattern('/', '/')).toEqual({});
  });

  it('returns null on a segment-count or static mismatch', () => {
    expect(matchPattern('/a/:id', '/a')).toBeNull();
    expect(matchPattern('/a/b', '/a/c')).toBeNull();
  });

  it('returns null for a malformed percent escape', () => {
    expect(matchPattern('/a/:id', '/a/%E0%A4%A')).toBeNull();
  });
});

describe('matchLocation', () => {
  it('prefers a static route over a dynamic one', () => {
    expect(matchLocation('/project/work-items/new')?.entry.id).toBe('workItemNew');
    expect(matchLocation('/project/work-items/abc')?.entry.id).toBe('workItem');
    expect(matchLocation('/project/work-items/abc')?.params).toEqual({ id: 'abc' });
  });

  it('does not match planned, conditional or catch-all entries', () => {
    expect(matchLocation('/areas')).toBeNull();
    expect(matchLocation('/anything-else')).toBeNull();
  });

  it('returns null for an unknown path', () => {
    expect(matchLocation('/nope/nope')).toBeNull();
  });
});

describe('resolveLocation', () => {
  it('serves static pages', () => {
    expect(pageId(resolveLocation('/project/work-items/new', ADMIN))).toBe('workItemNew');
  });

  it('ignores a trailing slash', () => {
    expect(pageId(resolveLocation('/project/work-items/', ADMIN))).toBe('workItems');
  });

  it('percent-decodes params without touching the page choice', () => {
    expect(pageId(resolveLocation('/project/work-items/a%20b', ADMIN))).toBe('workItem');
  });

  it('shows not found to a signed-in user and login to an anonymous one for an unknown path', () => {
    expect(resolveLocation('/nowhere', ADMIN)).toEqual({ kind: 'notFound' });
    expect(resolveLocation('/nowhere', ANON)).toEqual({ kind: 'login' });
  });

  it('sends an anonymous visitor of a member page to login', () => {
    expect(resolveLocation('/project/work-items', ANON)).toEqual({ kind: 'login' });
  });

  it('serves the login page without a hop and leaves its query untouched', () => {
    for (const ctx of [ADMIN, ANON]) {
      const res = resolveLocation('/login?next=%2Fproject%2Fwork-items&error=oidc_error', ctx);
      expect(pageId(res)).toBe('login');
    }
  });

  it('serves public pages to anonymous visitors', () => {
    expect(pageId(resolveLocation('/setup', ANON))).toBe('setup');
  });

  it('redirects a legacy URL in one hop, keeping query and hash', () => {
    const res = resolveLocation('/work-items/abc?q=walk&page=2#h', ADMIN);
    expect(res.kind).toBe('redirect');
    if (res.kind === 'redirect') {
      expect(res.to).toBe('/project/work-items/abc?q=walk&page=2#h');
      expect(pageId(resolveLocation(res.to, ADMIN))).toBe('workItem');
    }
  });

  it('redirects the root to the project overview', () => {
    const res = resolveLocation('/', ADMIN);
    expect(res.kind).toBe('redirect');
    if (res.kind === 'redirect') expect(res.to).toBe('/project/overview');
  });

  it('keeps interim pages as pages', () => {
    expect(pageId(resolveLocation('/settings/vendors', ADMIN))).toBe('vendors');
  });

  it('shows no access to a member on admin pages', () => {
    const res = resolveLocation('/settings/users', MEMBER);
    expect(res.kind).toBe('noAccess');
    expect(pageId(resolveLocation('/settings/users', ADMIN))).toBe('settingsUsers');
  });

  it('redirects the review page to the invoice list with Paperless off', () => {
    const res = resolveLocation('/budget/invoices/new/paperless?documentId=7', {
      ...ADMIN,
      paperlessConfigured: false,
    });
    expect(res).toMatchObject({ kind: 'redirect', to: '/budget/invoices?documentId=7&create=1' });
  });

  it('serves the review page with Paperless on and AI off (that rule is planned)', () => {
    const res = resolveLocation('/budget/invoices/new/paperless?documentId=7', {
      ...ADMIN,
      llmEnabled: false,
    });
    expect(pageId(res)).toBe('invoicePaperlessReview');
  });

  it('serves the review page with both on', () => {
    expect(pageId(resolveLocation('/budget/invoices/new/paperless', ADMIN))).toBe(
      'invoicePaperlessReview',
    );
  });

  it('serves every planned query-map URL as its page with the query kept', () => {
    const cases: [string, string][] = [
      ['/diary?filterMode=automatic', 'diary'],
      ['/diary?filterMode=all', 'diary'],
      ['/budget/invoices?openOnly=true', 'invoices'],
      ['/settings/manage?tab=areas', 'settingsManage'],
      ['/settings/manage?tab=household', 'settingsManage'],
      ['/settings/manage?tab=trades', 'settingsManage'],
      ['/settings/manage?tab=orientations', 'settingsManage'],
      ['/settings/manage?tab=hi-categories', 'settingsManage'],
      ['/settings/manage?tab=budget-categories', 'settingsManage'],
      ['/project/work-items/walk-1?depError=x', 'workItem'],
    ];
    for (const [url, id] of cases) {
      expect({ url, id: pageId(resolveLocation(url, ADMIN)) }).toEqual({ url, id });
    }
  });

  it('resolves every map entry with an id to a known resolution', () => {
    for (const entry of ROUTE_MAP) {
      if (!('id' in entry) || entry.stage === 'planned' || entry.from === '*') continue;
      const url = entry.from.replace(/:([A-Za-z0-9_]+)/g, 'x');
      expect(resolveLocation(url, ADMIN).kind).not.toBe('notFound');
    }
  });
});
