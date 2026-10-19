// Interim extras (Area) stand in for NavConfig entries whose routes are still planned.
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
  it('PIN: `area` is still planned; `areas` and `history` are served', () => {
    expect(getRouteEntryReal('area').stage).toBe('planned');
    expect(getRouteEntryReal('areas').stage).toBe('done');
    expect(getRouteEntryReal('history').stage).toBe('done');
  });

  it('NavConfig has entries for history and areas (the hand-over targets)', () => {
    const routes = NAV_SECTIONS.map((s) => s.route);
    expect(routes).toContain('history');
    expect(routes).toContain('areas');
    expect(NAV_SECTIONS.find((s) => s.route === 'history')?.term).toBe('History');
    expect(NAV_SECTIONS.find((s) => s.route === 'areas')?.term).toBe('Area');
  });

  it.each(['Room', 'Location', 'Area', 'Bereich'])(
    '"%s" opens the Areas page through NavConfig, with no interim extra',
    (word) => {
      const hits = find(word).filter((d) => d.term === 'Area');
      expect(hits).toHaveLength(1);
      expect(hits[0]).toMatchObject({ route: 'areas' });
      expect(hits[0]!.query).toBeUndefined();
      expect(find(word).some((d) => d.route === 'settingsManage')).toBe(false);
    },
  );

  it('"Automatic diary entries" and "History" open the History page once, with no diary extra', () => {
    const viaFormer = find('Automatic diary entries').filter((d) => d.term === 'History');
    expect(viaFormer).toHaveLength(1);
    expect(viaFormer[0]).toMatchObject({ route: 'history', viaFormerName: true });
    expect(viaFormer[0]!.query).toBeUndefined();

    const direct = find('History').filter((d) => d.term === 'History');
    expect(direct).toHaveLength(1);
    expect(direct[0]).toMatchObject({ route: 'history' });
    expect(direct[0]!.query).toBeUndefined();
  });

  it('no destination opens the diary with the retired filterMode query', () => {
    for (const word of ['History', 'Automatic diary entries', 'Diary', 'Site diary']) {
      expect(find(word).some((d) => d.query?.filterMode !== undefined)).toBe(false);
    }
  });

  it('serving `area` (detail) later does not add a second Area hit', () => {
    served.add('area');
    expect(find('Room').filter((d) => d.term === 'Area')).toHaveLength(1);
    expect(find('Room')[0]).toMatchObject({ route: 'areas' });
  });
});
