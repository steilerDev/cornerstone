// No route id is `planned` in the real map any more (the Documents page was the last, #2252), so
// the planned-id behaviour of the route helpers is exercised against a synthetic map.
import { beforeAll, describe, expect, it, jest } from '@jest/globals';
import type { RouteMapEntry } from './types.js';

function entry(over: Partial<RouteMapEntry> & { from: string }): RouteMapEntry {
  return {
    to: over.from,
    kind: 'page',
    change: 'kept',
    section: 'System',
    guard: 'member',
    gate: 'none',
    permanent: false,
    carries: [],
    stage: 'done',
    ...over,
  };
}

const SYNTHETIC_MAP = [
  { id: 'servedPage', ...entry({ from: '/served' }) },
  { id: 'plannedPage', ...entry({ from: '/planned', stage: 'planned' }) },
] as unknown as readonly RouteMapEntry[];

let isRouteServed: (id: string) => boolean;
let routeUrl: (id: string, ...rest: unknown[]) => string;

beforeAll(async () => {
  jest.resetModules();
  jest.unstable_mockModule('./routeMap.js', () => ({ ROUTE_MAP: SYNTHETIC_MAP }));
  const mod = await import('./routeUrl.js');
  isRouteServed = mod.isRouteServed as unknown as (id: string) => boolean;
  routeUrl = mod.routeUrl as unknown as (id: string, ...rest: unknown[]) => string;
});

describe('route helpers with a planned id', () => {
  it('reports a planned id as not served and a done id as served', () => {
    expect(isRouteServed('plannedPage')).toBe(false);
    expect(isRouteServed('servedPage')).toBe(true);
  });

  it('throws when building a URL for a planned id', () => {
    expect(() => routeUrl('plannedPage')).toThrow("Route 'plannedPage' is not served");
  });

  it('still builds a URL for a served id of the same map', () => {
    expect(routeUrl('servedPage')).toBe('/served');
  });
});
