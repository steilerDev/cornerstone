// matchLocation skips `planned` entries; the real map has none left (#2252), so a synthetic map
// proves the skip.
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

let matchLocation: (url: string) => { entry: { id?: string } } | null;

beforeAll(async () => {
  jest.resetModules();
  jest.unstable_mockModule('./routeMap.js', () => ({ ROUTE_MAP: SYNTHETIC_MAP }));
  matchLocation = (await import('./match.js')).matchLocation as unknown as typeof matchLocation;
});

describe('matchLocation with a planned entry', () => {
  it('does not match a planned entry', () => {
    expect(matchLocation('/planned')).toBeNull();
  });

  it('matches the served entry next to it', () => {
    expect(matchLocation('/served')?.entry.id).toBe('servedPage');
  });
});
