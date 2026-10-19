import { describe, it, expect } from '@jest/globals';
import type { AreaCounts, AreaWithCounts } from '@cornerstone/shared';
import {
  areaPath,
  buildAreaTreeRows,
  computeRollups,
  directRollup,
  filterAreas,
  foldAreaName,
  hasDirectItems,
  quietId,
  quietKindForDepth,
  siblingNameTaken,
  siblingsOf,
  subtreeIds,
} from './areaTree.js';

function counts(
  tasks: [number, number] = [0, 0],
  purchases: [number, number] = [0, 0],
  photos: [number, string | null] = [0, null],
): AreaCounts {
  return {
    workItems: { total: tasks[0], open: tasks[1] },
    householdItems: { total: purchases[0], open: purchases[1] },
    photos: { total: photos[0], latestDate: photos[1] },
  };
}

function area(
  id: string,
  name: string,
  parentId: string | null,
  sortOrder: number,
  c: AreaCounts = counts(),
): AreaWithCounts {
  return {
    id,
    name,
    parentId,
    color: null,
    description: null,
    sortOrder,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    counts: c,
  };
}

// House (own: 2/1 tasks) > Ground floor (own: 1/1 tasks, photo 2026-03-01) > Kitchen (3/0 purchases)
//                       > Upper floor (empty)
// Garage (no children, own items)
const HOUSE = area('house', 'House', null, 0, counts([2, 1]));
const GROUND = area(
  'ground',
  'Ground floor',
  'house',
  0,
  counts([1, 1], [0, 0], [1, '2026-03-01']),
);
const KITCHEN = area('kitchen', 'Küche', 'ground', 0, counts([0, 0], [3, 2], [2, '2026-05-10']));
const UPPER = area('upper', 'Upper floor', 'house', 1);
const GARAGE = area('garage', 'Garage', null, 1, counts([4, 4]));
const ALL = [GARAGE, KITCHEN, UPPER, HOUSE, GROUND];

describe('directRollup / hasDirectItems', () => {
  it('copies the direct counts', () => {
    expect(directRollup(counts([2, 1], [3, 2], [4, '2026-01-02']))).toEqual({
      tasks: { total: 2, open: 1 },
      purchases: { total: 3, open: 2 },
      photos: { total: 4, latestDate: '2026-01-02' },
    });
  });

  it('is empty for missing counts', () => {
    const empty = directRollup(undefined);
    expect(hasDirectItems(empty)).toBe(false);
    expect(empty.photos.latestDate).toBeNull();
  });

  it('detects items of any kind', () => {
    expect(hasDirectItems(directRollup(counts([1, 0])))).toBe(true);
    expect(hasDirectItems(directRollup(counts([0, 0], [1, 0])))).toBe(true);
    expect(hasDirectItems(directRollup(counts([0, 0], [0, 0], [1, null])))).toBe(true);
    expect(hasDirectItems(directRollup(counts()))).toBe(false);
  });
});

describe('siblingsOf', () => {
  it('orders by sortOrder, then name, and filters by parent', () => {
    const a = area('a', 'Beta', null, 1);
    const b = area('b', 'Alpha', null, 1);
    const c = area('c', 'Zed', null, 0);
    expect(siblingsOf([a, b, c, GROUND], null).map((x) => x.id)).toEqual(['c', 'b', 'a']);
    expect(siblingsOf(ALL, 'house').map((x) => x.id)).toEqual(['ground', 'upper']);
  });
});

describe('computeRollups', () => {
  it('a parent equals its own counts plus all its descendants', () => {
    const rollups = computeRollups(ALL);
    expect(rollups.get('kitchen')?.purchases).toEqual({ total: 3, open: 2 });
    expect(rollups.get('ground')).toEqual({
      tasks: { total: 1, open: 1 },
      purchases: { total: 3, open: 2 },
      photos: { total: 3, latestDate: '2026-05-10' },
    });
    expect(rollups.get('house')).toEqual({
      tasks: { total: 3, open: 2 },
      purchases: { total: 3, open: 2 },
      photos: { total: 3, latestDate: '2026-05-10' },
    });
    expect(rollups.get('upper')?.photos.latestDate).toBeNull();
    expect(rollups.get('garage')?.tasks).toEqual({ total: 4, open: 4 });
  });

  it("the parent's roll-up is the sum of its children's roll-ups plus its quiet row", () => {
    const rows = buildAreaTreeRows(ALL);
    const byId = new Map(rows.map((r) => [r.id, r]));
    const house = byId.get('house')!.rollup;
    const quiet = byId.get(quietId('house'))!.rollup;
    const ground = byId.get('ground')!.rollup;
    const upper = byId.get('upper')!.rollup;
    expect(house.tasks.total).toBe(quiet.tasks.total + ground.tasks.total + upper.tasks.total);
    expect(house.tasks.open).toBe(quiet.tasks.open + ground.tasks.open + upper.tasks.open);
    expect(house.purchases.total).toBe(
      quiet.purchases.total + ground.purchases.total + upper.purchases.total,
    );
    expect(house.photos.total).toBe(quiet.photos.total + ground.photos.total + upper.photos.total);
  });

  it('survives a parent cycle without looping', () => {
    const a = area('a', 'A', 'b', 0, counts([1, 1]));
    const b = area('b', 'B', 'a', 0, counts([2, 2]));
    const rollups = computeRollups([a, b]);
    expect(rollups.size).toBe(2);
  });
});

describe('quietKindForDepth', () => {
  it.each([
    [0, 'building'],
    [1, 'floor'],
    [2, 'other'],
    [5, 'other'],
  ] as const)('depth %i is %s', (depth, kind) => {
    expect(quietKindForDepth(depth)).toBe(kind);
  });
});

describe('buildAreaTreeRows', () => {
  it('flattens depth first with siblings in display order', () => {
    const rows = buildAreaTreeRows(ALL);
    expect(rows.map((r) => `${r.depth}:${r.id}`)).toEqual([
      '0:house',
      '1:quiet:house',
      '1:ground',
      '2:quiet:ground',
      '2:kitchen',
      '1:upper',
      '0:garage',
    ]);
  });

  it('labels quiet rows by the depth of the area they belong to', () => {
    const rows = buildAreaTreeRows(ALL);
    const kind = (id: string) => rows.find((r) => r.id === id)?.quiet;
    expect(kind('quiet:house')).toBe('building');
    expect(kind('quiet:ground')).toBe('floor');
    expect(rows.find((r) => r.id === 'quiet:house')?.parentId).toBe('house');
  });

  it('uses the "other" wording for a quiet row three levels down', () => {
    const deep = [
      area('a', 'A', null, 0),
      area('b', 'B', 'a', 0),
      area('c', 'C', 'b', 0, counts([1, 0])),
      area('d', 'D', 'c', 0),
    ];
    const rows = buildAreaTreeRows(deep);
    expect(rows.find((r) => r.id === 'quiet:c')?.quiet).toBe('other');
    expect(rows.find((r) => r.id === 'quiet:c')?.depth).toBe(3);
  });

  it('has no quiet row for an area without children', () => {
    expect(buildAreaTreeRows(ALL).some((r) => r.id === quietId('garage'))).toBe(false);
  });

  it('has no quiet row for an area with children but no direct items', () => {
    const rows = buildAreaTreeRows(ALL);
    expect(rows.some((r) => r.id === quietId('upper'))).toBe(false);
    const emptyParent = [area('p', 'P', null, 0), area('c', 'C', 'p', 0, counts([1, 0]))];
    expect(buildAreaTreeRows(emptyParent).some((r) => r.quiet !== null)).toBe(false);
  });

  it('shows the own counts on the quiet row', () => {
    const quiet = buildAreaTreeRows(ALL).find((r) => r.id === 'quiet:house')!;
    expect(quiet.rollup.tasks).toEqual({ total: 2, open: 1 });
  });

  it('skips areas outside visibleIds, marks non-matches muted and drops quiet rows', () => {
    const result = filterAreas(ALL, 'kuche')!;
    const rows = buildAreaTreeRows(ALL, {
      visibleIds: result.visibleIds,
      matchIds: result.matchIds,
    });
    expect(rows.map((r) => r.id)).toEqual(['house', 'ground', 'kitchen']);
    expect(rows.find((r) => r.id === 'kitchen')?.muted).toBe(false);
    expect(rows.find((r) => r.id === 'house')?.muted).toBe(true);
    expect(rows.find((r) => r.id === 'ground')?.muted).toBe(true);
    expect(rows.every((r) => r.quiet === null)).toBe(true);
  });

  it('keeps nothing muted without a filter', () => {
    expect(buildAreaTreeRows(ALL).every((r) => !r.muted)).toBe(true);
  });

  it('lists a cyclic area only once', () => {
    const a = area('a', 'A', null, 0);
    const looped = [a, area('b', 'B', 'a', 0)];
    expect(buildAreaTreeRows(looped)).toHaveLength(2);
  });
});

describe('areaPath / subtreeIds', () => {
  it('returns the root-first path', () => {
    expect(areaPath(ALL, 'kitchen').map((s) => s.name)).toEqual(['House', 'Ground floor', 'Küche']);
  });

  it('is empty for an unknown id', () => {
    expect(areaPath(ALL, 'nope')).toEqual([]);
  });

  it('stops at a cycle', () => {
    const a = area('a', 'A', 'b', 0);
    const b = area('b', 'B', 'a', 0);
    expect(areaPath([a, b], 'a').map((s) => s.id)).toEqual(['b', 'a']);
  });

  it('collects an area and everything below it', () => {
    expect([...subtreeIds(ALL, 'house')].sort()).toEqual(['ground', 'house', 'kitchen', 'upper']);
    expect([...subtreeIds(ALL, 'garage')]).toEqual(['garage']);
  });

  it('terminates on a cycle', () => {
    const a = area('a', 'A', 'b', 0);
    const b = area('b', 'B', 'a', 0);
    expect(subtreeIds([a, b], 'a').size).toBe(2);
  });
});

describe('filterAreas', () => {
  it('returns null for an empty or blank query', () => {
    expect(filterAreas(ALL, '')).toBeNull();
    expect(filterAreas(ALL, '   ')).toBeNull();
  });

  it.each(['Kueche', 'Kuche', 'Küche', 'kUCHE', ' küche '])('matches Küche for "%s"', (query) => {
    const result = filterAreas(ALL, query)!;
    expect([...result.matchIds]).toEqual(['kitchen']);
  });

  it('adds the ancestors of a match as visible but not matched', () => {
    const result = filterAreas(ALL, 'kuche')!;
    expect([...result.visibleIds].sort()).toEqual(['ground', 'house', 'kitchen']);
    expect(result.matchIds.has('house')).toBe(false);
  });

  it('matches several areas and has empty sets when nothing matches', () => {
    expect(filterAreas(ALL, 'floor')!.matchIds.size).toBe(2);
    const none = filterAreas(ALL, 'zzz')!;
    expect(none.matchIds.size).toBe(0);
    expect(none.visibleIds.size).toBe(0);
  });
});

describe('foldAreaName / siblingNameTaken', () => {
  it('ignores case, umlauts, trimming and repeated spaces', () => {
    expect(foldAreaName('  Ground   Floor ')).toBe(foldAreaName('ground floor'));
    expect(foldAreaName('Küche')).toBe(foldAreaName('Kueche'));
  });

  it('detects a clash among siblings by fold', () => {
    expect(siblingNameTaken(ALL, 'KUECHE', 'ground')).toBe(true);
    expect(siblingNameTaken(ALL, 'kuche', 'ground')).toBe(true);
    expect(siblingNameTaken(ALL, 'upper  floor', 'house')).toBe(true);
  });

  it('allows the same name under another parent', () => {
    expect(siblingNameTaken(ALL, 'Küche', 'upper')).toBe(false);
  });

  it('treats null and an empty parent as top level', () => {
    expect(siblingNameTaken(ALL, 'garage', null)).toBe(true);
    expect(siblingNameTaken(ALL, 'garage', '')).toBe(true);
    expect(siblingNameTaken(ALL, 'garage', 'house')).toBe(false);
  });

  it('ignores the area being edited', () => {
    expect(siblingNameTaken(ALL, 'Garage', null, 'garage')).toBe(false);
    expect(siblingNameTaken(ALL, 'Garage', null, 'house')).toBe(true);
  });
});
