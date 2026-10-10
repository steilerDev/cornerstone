import { describe, it, expect } from '@jest/globals';
import {
  SPOT_URL_NONE,
  AREA_PATH_SEPARATOR,
  toSpotUrlKey,
  fromSpotUrlKey,
  spotKey,
  buildSpotViewerPath,
  formatAreaPath,
  buildSpotGroups,
} from './photoSpots.js';
import { makeArea, makeOrientation, makeSpot } from '../test/photoSpotFixtures.js';

describe('photoSpots URL helpers', () => {
  it('round-trips ids and the null sentinel', () => {
    expect(toSpotUrlKey('a1')).toBe('a1');
    expect(toSpotUrlKey(null)).toBe(SPOT_URL_NONE);
    expect(fromSpotUrlKey('a1')).toBe('a1');
    expect(fromSpotUrlKey('none')).toBeNull();
    expect(fromSpotUrlKey(toSpotUrlKey(null))).toBeNull();
    expect(fromSpotUrlKey(toSpotUrlKey('xyz'))).toBe('xyz');
  });

  it('builds a spotKey combining both keys', () => {
    expect(spotKey('a', 'o')).toBe('a:o');
    expect(spotKey(null, null)).toBe('none:none');
    expect(spotKey('a', null)).not.toBe(spotKey(null, 'a'));
  });

  it('builds the viewer path with encoded segments and optional ?photo=', () => {
    expect(buildSpotViewerPath('a1', 'o1')).toBe('/photos/spot/a1/o1');
    expect(buildSpotViewerPath(null, null)).toBe('/photos/spot/none/none');
    expect(buildSpotViewerPath('a/b', 'o c', 'p 1')).toBe('/photos/spot/a%2Fb/o%20c?photo=p+1');
  });

  it('joins area ancestors root-first with the U+203A separator', () => {
    expect(AREA_PATH_SEPARATOR).toBe(' › ');
    expect(
      formatAreaPath({
        id: 'c',
        name: 'Kitchen',
        color: null,
        ancestors: [
          { id: 'a', name: 'House', color: null },
          { id: 'b', name: 'Ground', color: null },
        ],
      }),
    ).toBe('House › Ground › Kitchen');
    expect(formatAreaPath({ id: 'c', name: 'Kitchen', color: null, ancestors: [] })).toBe(
      'Kitchen',
    );
  });
});

describe('buildSpotGroups', () => {
  const orientations = [makeOrientation('o1', 'Ceiling', 1), makeOrientation('o2', 'Floor', 2)];

  it('gives a root without children no header and exactly one row', () => {
    const groups = buildSpotGroups([makeArea('r', 'Garden')], orientations, []);

    expect(groups).toHaveLength(1);
    expect(groups[0]!.hasHeader).toBe(false);
    expect(groups[0]!.rows).toHaveLength(1);
    expect(groups[0]!.rows[0]!.depth).toBe(0);
    expect(groups[0]!.id).toBe('r');
  });

  it('creates one cell per orientation plus a trailing no-orientation cell, in order', () => {
    const groups = buildSpotGroups([makeArea('r', 'Garden')], orientations, []);
    const cells = groups[0]!.rows[0]!.cells;

    expect(cells).toHaveLength(3);
    expect(cells.map((c) => c.orientationId)).toEqual(['o1', 'o2', null]);
    expect(cells.map((c) => c.orientationName)).toEqual(['Ceiling', 'Floor', null]);
    expect(cells.every((c) => c.spot === null)).toBe(true);
  });

  it('attaches the matching spot to its cell, including the null-orientation spot', () => {
    const s1 = makeSpot('r', 'o2');
    const s2 = makeSpot('r', null);
    const cells = buildSpotGroups([makeArea('r', 'Garden')], orientations, [s1, s2])[0]!.rows[0]!
      .cells;

    expect(cells[0]!.spot).toBeNull();
    expect(cells[1]!.spot).toBe(s1);
    expect(cells[2]!.spot).toBe(s2);
  });

  it('gives a root with children a header and a row for each child, even with zero photos', () => {
    const areas = [
      makeArea('r', 'House'),
      makeArea('c1', 'Kitchen', { parentId: 'r' }),
      makeArea('c2', 'Bath', { parentId: 'r' }),
    ];
    const groups = buildSpotGroups(areas, orientations, [makeSpot('c1', 'o1')]);

    expect(groups).toHaveLength(1);
    expect(groups[0]!.hasHeader).toBe(true);
    expect(groups[0]!.rows.map((r) => r.areaId)).toEqual(['c1', 'c2']);
    expect(groups[0]!.rows.map((r) => r.depth)).toEqual([0, 0]);
    expect(groups[0]!.rows[1]!.cells.every((c) => c.spot === null)).toBe(true);
  });

  it('adds the root own row first only when the root itself has photos', () => {
    const areas = [makeArea('r', 'House'), makeArea('c1', 'Kitchen', { parentId: 'r' })];

    const without = buildSpotGroups(areas, orientations, [makeSpot('c1', 'o1')]);
    const withOwn = buildSpotGroups(areas, orientations, [makeSpot('r', null)]);

    expect(without[0]!.rows.map((r) => r.areaId)).toEqual(['c1']);
    expect(withOwn[0]!.rows.map((r) => r.areaId)).toEqual(['r', 'c1']);
    expect(withOwn[0]!.rows[0]!.name).toBe('House');
  });

  it('puts a grandchild at depth 1 directly after its parent', () => {
    const areas = [
      makeArea('r', 'House'),
      makeArea('c', 'Ground', { parentId: 'r' }),
      makeArea('g', 'Kitchen', { parentId: 'c' }),
      makeArea('c2', 'Upper', { parentId: 'r' }),
    ];
    const rows = buildSpotGroups(areas, orientations, [])[0]!.rows;

    expect(rows.map((r) => [r.areaId, r.depth])).toEqual([
      ['c', 0],
      ['g', 1],
      ['c2', 0],
    ]);
  });

  it('treats an area with an unknown parent as a root', () => {
    const groups = buildSpotGroups(
      [makeArea('orphan', 'Orphan', { parentId: 'ghost' })],
      orientations,
      [],
    );

    expect(groups).toHaveLength(1);
    expect(groups[0]!.id).toBe('orphan');
    expect(groups[0]!.hasHeader).toBe(false);
  });

  it('terminates on a parent cycle without duplicating rows', () => {
    const areas = [
      makeArea('r', 'Root'),
      makeArea('a', 'A', { parentId: 'r' }),
      makeArea('b', 'B', { parentId: 'a' }),
    ];
    // Make 'a' also reachable again by pointing r's walk back through b -> a is blocked by visited
    const cyclic = [areas[0]!, { ...areas[1]!, parentId: 'b' }, areas[2]!];

    const groups = buildSpotGroups(cyclic, orientations, []);
    const allRows = groups.flatMap((g) => g.rows.map((r) => r.areaId));

    expect(new Set(allRows).size).toBe(allRows.length);
    expect(groups.length).toBeLessThanOrEqual(3);
  });

  it('appends the no-area group only when a null-area spot exists', () => {
    const areas = [makeArea('r', 'Garden')];

    expect(buildSpotGroups(areas, orientations, [makeSpot('r', 'o1')])).toHaveLength(1);

    const groups = buildSpotGroups(areas, orientations, [makeSpot(null, 'o1')]);
    expect(groups).toHaveLength(2);
    const last = groups[1]!;
    expect(last.id).toBe(SPOT_URL_NONE);
    expect(last.name).toBeNull();
    expect(last.hasHeader).toBe(false);
    expect(last.rows).toHaveLength(1);
    expect(last.rows[0]!.areaId).toBeNull();
    expect(last.rows[0]!.cells[0]!.spot).not.toBeNull();
    expect(last.rows[0]!.cells[1]!.spot).toBeNull();
  });

  it('returns no groups for no areas and no spots', () => {
    expect(buildSpotGroups([], orientations, [])).toEqual([]);
  });

  it('carries area name and color onto rows', () => {
    const rows = buildSpotGroups(
      [makeArea('r', 'Garden', { color: '#00ff00' }), makeArea('c', 'Shed', { parentId: 'r' })],
      orientations,
      [],
    )[0]!.rows;

    expect(rows[0]!.name).toBe('Shed');
    expect(rows[0]!.color).toBe('#aa0000');
  });
});
