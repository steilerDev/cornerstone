// Interim extras (Area, History) stand in for NavConfig entries whose routes are still planned.
// The hand-over is exercised against a patched route lookup, like searchDestinations.gate.test.ts.
import { jest, describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import type * as SharedTypes from '@cornerstone/shared';
import type * as DestinationTypes from './searchDestinations.js';
import type * as NavConfigTypes from './navConfig.js';

type RouteId = Parameters<typeof SharedTypes.getRouteEntry>[0];

let findSearchDestinations: typeof DestinationTypes.findSearchDestinations;
let NAV_SECTIONS: typeof NavConfigTypes.NAV_SECTIONS;
let getRouteEntryReal: typeof SharedTypes.getRouteEntry;
const served = new Set<string>();

beforeAll(async () => {
  const actual = await import('@cornerstone/shared');
  getRouteEntryReal = actual.getRouteEntry;
  jest.unstable_mockModule('@cornerstone/shared', () => ({
    ...actual,
    isRouteServed: (id: RouteId) => served.has(id) || actual.isRouteServed(id),
    getRouteEntry: (id: RouteId) => {
      const entry = actual.getRouteEntry(id);
      return served.has(id) ? { ...entry, stage: 'done' } : entry;
    },
  }));
  ({ findSearchDestinations } = await import('./searchDestinations.js'));
  ({ NAV_SECTIONS } = await import('./navConfig.js'));
});

beforeEach(() => served.clear());

const label = (key: string) => key;
const ADMIN = { role: 'admin', paperlessConfigured: true } as const;
const find = (word: string) => findSearchDestinations(word, ADMIN, label);

describe('interim search targets', () => {
  it('PIN: `area`, `areas` and `history` are still planned', () => {
    // Fails when the Areas / History story serves them: update INTERIM_UNTIL, TERM_EXTRAS and these tests.
    for (const id of ['area', 'areas', 'history'] as const) {
      expect(getRouteEntryReal(id).stage).toBe('planned');
    }
  });

  it('NavConfig has entries for history and areas (the hand-over targets)', () => {
    const routes = NAV_SECTIONS.map((s) => s.route);
    expect(routes).toContain('history');
    expect(routes).toContain('areas');
    expect(NAV_SECTIONS.find((s) => s.route === 'history')?.term).toBe('History');
    expect(NAV_SECTIONS.find((s) => s.route === 'areas')?.term).toBe('Area');
  });

  it.each(['Room', 'Location', 'Area', 'Bereich'])('"%s" opens the Manage areas tab', (word) => {
    expect(find(word)[0]).toMatchObject({
      route: 'settingsManage',
      query: { tab: 'areas' },
      term: 'Area',
    });
  });

  it('"Automatic diary entries" opens the automatic diary entries', () => {
    expect(find('Automatic diary entries')[0]).toMatchObject({
      route: 'diary',
      query: { filterMode: 'automatic' },
      term: 'History',
      viaFormerName: true,
    });
    expect(find('History')[0]).toMatchObject({
      route: 'diary',
      query: { filterMode: 'automatic' },
    });
  });

  it('skips the Area interim extra once route `areas` is served', () => {
    served.add('areas');
    for (const word of ['Room', 'Location']) {
      expect(find(word).filter((d) => d.route === 'settingsManage')).toEqual([]);
    }
  });

  it('skips the History interim extra once route `history` is served', () => {
    served.add('history');
    expect(find('Automatic diary entries').some((d) => d.query?.filterMode === 'automatic')).toBe(
      false,
    );
  });

  it('hands over to the NavConfig entry: History appears once, on the History page', () => {
    served.add('history');
    const hits = find('History').filter((d) => d.term === 'History');
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ route: 'history' });
    expect(hits[0]!.query).toBeUndefined();
  });

  it('serving `areas` alone gives exactly one Area hit, on the Areas page (no duplicate)', () => {
    served.add('areas');
    const hits = find('Room').filter((d) => d.term === 'Area');
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ route: 'areas' });
  });

  it('serving `area` (detail) alone keeps the interim Area extra so search still resolves', () => {
    served.add('area');
    expect(find('Room')[0]).toMatchObject({ route: 'settingsManage', query: { tab: 'areas' } });
    expect(find('Room').filter((d) => d.term === 'Area')).toHaveLength(1);
  });

  it('keeps one interim extra when only the other one is served', () => {
    served.add('history');
    expect(find('Room')[0]).toMatchObject({ route: 'settingsManage', query: { tab: 'areas' } });
  });
});
