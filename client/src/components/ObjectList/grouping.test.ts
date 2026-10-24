import { describe, it, expect } from '@jest/globals';
import { buildGroups, defaultOpen, groupingAvailable } from './grouping.js';
import type { ObjectListGroupOption } from './types.js';

interface Row {
  id: string;
  g: string;
  done?: boolean;
}
const option = (over: Partial<ObjectListGroupOption<Row>> = {}): ObjectListGroupOption<Row> => ({
  value: 'g',
  label: 'G',
  groupOf: (r) => ({ key: r.g, label: r.g.toUpperCase(), done: r.done }),
  ...over,
});
const rows: Row[] = [
  { id: '1', g: 'b' },
  { id: '2', g: 'c' },
  { id: '3', g: 'a' },
  { id: '4', g: 'b' },
  { id: '5', g: 'z', done: true },
];

describe('grouping', () => {
  it('G1 orders listed keys first, then the rest A-Z', () => {
    const groups = buildGroups(rows, option({ order: ['z', 'c'] }), null);
    expect(groups.map((g) => g.meta.key)).toEqual(['z', 'c', 'a', 'b']);
    expect(groups[3]!.items.map((r) => r.id)).toEqual(['1', '4']);
  });

  it('G1 sorts A-Z when there is no order', () => {
    expect(buildGroups(rows, option(), null).map((g) => g.meta.key)).toEqual(['a', 'b', 'c', 'z']);
  });

  it('G2 counts come from groupCounts, else from the loaded rows', () => {
    const withCounts = buildGroups(rows, option(), { b: 10 });
    expect(withCounts.find((g) => g.meta.key === 'b')).toMatchObject({ count: 10, loaded: 2 });
    expect(withCounts.find((g) => g.meta.key === 'a')).toMatchObject({ count: 1, loaded: 1 });
    expect(buildGroups(rows, option(), null).find((g) => g.meta.key === 'b')!.count).toBe(2);
  });

  it('returns no groups for no rows', () => {
    expect(buildGroups([], option(), null)).toEqual([]);
  });

  it('G3 a done bucket starts closed while another group has rows', () => {
    const groups = buildGroups(rows, option(), null);
    const done = groups.find((g) => g.meta.key === 'z')!;
    expect(defaultOpen(done, groups)).toBe(false);
    expect(defaultOpen(groups[0]!, groups)).toBe(true);
  });

  it('G4 a done bucket alone starts open', () => {
    const groups = buildGroups([{ id: '5', g: 'z', done: true }], option(), null);
    expect(defaultOpen(groups[0]!, groups)).toBe(true);
  });

  it('G5 groupingAvailable: <=100, >100, server, unknown total', () => {
    expect(groupingAvailable(option(), 100)).toBe(true);
    expect(groupingAvailable(option(), 101)).toBe(false);
    expect(groupingAvailable(option({ server: true }), 500)).toBe(true);
    expect(groupingAvailable(option(), null)).toBe(true);
  });
});
