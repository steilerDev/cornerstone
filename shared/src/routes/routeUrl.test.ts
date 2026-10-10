import { describe, expect, it } from '@jest/globals';
import { ROUTE_MAP } from './routeMap.js';
import {
  getRouteEntry,
  isRouteServed,
  routePattern,
  routeUrl,
  type RouteId,
  type ServedRouteId,
} from './routeUrl.js';

const SAMPLE: Record<string, string> = {
  id: 'abc',
  documentId: '7',
  areaKey: 'kitchen',
  orientationKey: 'north',
};

// Loosely typed handle for runtime-error cases the compiler would (rightly) reject.
const looseRouteUrl = routeUrl as unknown as (id: string, ...rest: unknown[]) => string;

describe('routePattern / getRouteEntry / isRouteServed', () => {
  it('returns the from pattern of an id', () => {
    expect(routePattern('workItem')).toBe('/project/work-items/:id');
    expect(routePattern('invoicePaperlessReview')).toBe('/budget/invoices/new/paperless');
  });

  it('returns the catch-all pattern for notFound', () => {
    expect(routePattern('notFound')).toBe('*');
  });

  it('returns the whole entry', () => {
    expect(getRouteEntry('login')).toMatchObject({ from: '/login', guard: 'public' });
  });

  it('throws on an unknown id', () => {
    expect(() => getRouteEntry('nope' as never)).toThrow("Unknown route id 'nope'");
    expect(() => routePattern('nope' as never)).toThrow('Unknown route id');
  });

  it('reports served and planned routes', () => {
    expect(isRouteServed('workItems')).toBe(true);
    expect(isRouteServed('company')).toBe(true);
    expect(isRouteServed('areas')).toBe(false);
  });
});

describe('routeUrl', () => {
  it('builds a URL for every served id', () => {
    let built = 0;
    for (const entry of ROUTE_MAP) {
      if (!('id' in entry) || entry.stage === 'planned' || entry.id === 'notFound') continue;
      const params: Record<string, string> = {};
      for (const name of entry.from.match(/:([A-Za-z0-9_]+)/g) ?? []) {
        params[name.slice(1)] = SAMPLE[name.slice(1)] ?? 'x';
      }
      const expected = entry.from.replace(
        /:([A-Za-z0-9_]+)/g,
        (_m, name: string) => SAMPLE[name] ?? 'x',
      );
      expect(looseRouteUrl(entry.id, params)).toBe(expected);
      built += 1;
    }
    expect(built).toBeGreaterThan(25);
  });

  it('builds permanent URLs exactly as the literal patterns', () => {
    expect(routeUrl('workItem', { id: 'walk-1' })).toBe('/project/work-items/walk-1');
    expect(routeUrl('householdItem', { id: 'walk-1' })).toBe('/project/household-items/walk-1');
    expect(routeUrl('milestone', { id: 'walk-1' })).toBe('/project/milestones/walk-1');
    expect(routeUrl('company', { id: 'walk-1' })).toBe('/companies/walk-1');
  });

  it('builds the root URL and a login URL', () => {
    expect(routeUrl('home')).toBe('/');
    expect(routeUrl('login')).toBe('/login');
  });

  it('URI-encodes params and stringifies numbers', () => {
    expect(routeUrl('workItem', { id: 'a b/c?' })).toBe('/project/work-items/a%20b%2Fc%3F');
    expect(routeUrl('workItem', { id: 42 })).toBe('/project/work-items/42');
  });

  it('fills several params', () => {
    expect(routeUrl('photoSpot', { areaKey: 'kitchen', orientationKey: 'north' })).toBe(
      '/photos/spot/kitchen/north',
    );
  });

  it('serialises a query string', () => {
    expect(routeUrl('login', undefined, { error: 'oidc_error', next: '/a b' })).toBe(
      '/login?error=oidc_error&next=%2Fa+b',
    );
  });

  it('skips null and undefined query values', () => {
    expect(routeUrl('workItems', undefined, { q: undefined, page: null, sortBy: 'title' })).toBe(
      '/project/work-items?sortBy=title',
    );
  });

  it('returns no question mark for an empty or all-skipped query', () => {
    expect(routeUrl('workItems', undefined, {})).toBe('/project/work-items');
    expect(routeUrl('workItems', undefined, { q: undefined })).toBe('/project/work-items');
  });

  it('repeats array query values and stringifies numbers and booleans', () => {
    expect(routeUrl('workItems', undefined, { status: ['a', 'b'], page: 2, group: true })).toBe(
      '/project/work-items?status=a&status=b&page=2&group=true',
    );
  });

  it('puts the query after the params', () => {
    expect(routeUrl('workItem', { id: 'x' }, { depError: 'a b' })).toBe(
      '/project/work-items/x?depError=a+b',
    );
  });

  it('throws on a planned id', () => {
    expect(() => looseRouteUrl('areas')).toThrow("Route 'areas' is not served");
  });

  it('throws on notFound', () => {
    expect(() => looseRouteUrl('notFound')).toThrow('is not served');
  });

  it('throws on an unknown id', () => {
    expect(() => looseRouteUrl('nope')).toThrow("Unknown route id 'nope'");
  });

  it('throws on a missing param at runtime', () => {
    expect(() => looseRouteUrl('workItem', {})).toThrow("needs param 'id'");
    expect(() => looseRouteUrl('workItem')).toThrow("needs param 'id'");
  });
});

describe('routeUrl types', () => {
  it('rejects planned ids, notFound, missing params and extra params at compile time', () => {
    const attempts = [
      // @ts-expect-error planned ids are not linkable
      () => routeUrl('areas'),
      // @ts-expect-error notFound is not linkable
      () => routeUrl('notFound'),
      // @ts-expect-error a dynamic route needs its params
      () => routeUrl('workItem'),
      // @ts-expect-error params object must contain the id
      () => routeUrl('workItem', {}),
      // @ts-expect-error unknown param name
      () => routeUrl('workItem', { id: 'a', other: 'b' }),
      // @ts-expect-error a static route takes no params
      () => routeUrl('workItems', { id: 'a' }),
    ];
    expect(attempts).toHaveLength(6);
  });

  it('exports the id types', () => {
    const served: ServedRouteId = 'workItem';
    const any: RouteId = 'areas';
    expect([served, any]).toEqual(['workItem', 'areas']);
  });
});
