// Query-map entries are all `planned` in the real map today, so the live query-map branch of
// resolveLocation is exercised against a synthetic map.
import { beforeAll, describe, expect, it, jest } from '@jest/globals';
import type { RouteContext, RouteResolution } from './match.js';
import type { RouteMapEntry } from './types.js';

const CTX: RouteContext = {
  signedIn: true,
  role: 'admin',
  paperlessConfigured: true,
  llmEnabled: true,
};

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

const SYNTHETIC_MAP: readonly RouteMapEntry[] = [
  entry({ id: 'diary', from: '/diary' }),
  entry({ id: 'item', from: '/items/:id' }),
  entry({
    from: '/diary?filterMode=all',
    to: '/history?include=diary',
    kind: 'redirect',
    change: 'query-map',
    carries: ['*'],
    match: { query: { filterMode: 'all' } },
  }),
  entry({
    from: '/items/:id?depError=',
    to: '/items/:id?tab=timing',
    kind: 'redirect',
    change: 'query-map',
    carries: ['*'],
    match: { query: { depError: true } },
  }),
  entry({
    from: '/diary?planned=1',
    to: '/never',
    kind: 'redirect',
    change: 'query-map',
    stage: 'planned',
    match: { query: { planned: '1' } },
  }),
];

let resolveLocation: (url: string, ctx: RouteContext) => RouteResolution;

beforeAll(async () => {
  jest.resetModules();
  jest.unstable_mockModule('./routeMap.js', () => ({ ROUTE_MAP: SYNTHETIC_MAP }));
  ({ resolveLocation } = await import('./match.js'));
});

describe('resolveLocation with live query-map entries', () => {
  it('redirects when a query key has the required value, consuming the matched key and keeping the other pairs and hash', () => {
    expect(resolveLocation('/diary?filterMode=all&q=x#h', CTX)).toMatchObject({
      kind: 'redirect',
      to: '/history?q=x&include=diary#h',
    });
  });

  it('serves the page when the query value differs', () => {
    expect(resolveLocation('/diary?filterMode=automatic', CTX).kind).toBe('page');
  });

  it('serves the page when the query key is absent', () => {
    expect(resolveLocation('/diary', CTX).kind).toBe('page');
  });

  it('matches a key present with any value and substitutes path params', () => {
    expect(resolveLocation('/items/7?depError=boom', CTX)).toMatchObject({
      kind: 'redirect',
      to: '/items/7?tab=timing',
    });
  });

  it('does not match when a presence key is missing', () => {
    expect(resolveLocation('/items/7', CTX).kind).toBe('page');
  });

  it('ignores planned query-map entries', () => {
    expect(resolveLocation('/diary?planned=1', CTX).kind).toBe('page');
  });
});
