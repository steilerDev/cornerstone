import { describe, it, expect } from '@jest/globals';
import {
  buildGroups,
  defaultOpen,
  groupLayout,
  groupingAvailable,
  movedRowTargets,
} from './grouping.js';
import type { GroupLayout } from './grouping.js';
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

  it('G1 `last` keys follow the A-Z rest, in the given order', () => {
    const groups = buildGroups(rows, option({ order: ['c'], last: ['a', 'z'] }), null);
    expect(groups.map((g) => g.meta.key)).toEqual(['c', 'b', 'a', 'z']);
    expect(buildGroups(rows, option({ last: ['z', 'a'] }), null).map((g) => g.meta.key)).toEqual([
      'b',
      'c',
      'z',
      'a',
    ]);
  });
});

describe('groupLayout', () => {
  it('maps the groups in render order to their row keys and each row to its group', () => {
    const groups = buildGroups(rows, option({ order: ['z'] }), null);
    const layout = groupLayout(groups, (r) => r.id);
    expect(layout.order).toEqual(['z', 'a', 'b', 'c']);
    expect(layout.keysByGroup.get('b')).toEqual(['1', '4']);
    expect(layout.groupOfRow.get('4')).toBe('b');
    expect(layout.groupOfRow.get('5')).toBe('z');
  });

  it('is empty for no groups', () => {
    const layout = groupLayout([], (r: Row) => r.id);
    expect(layout.order).toEqual([]);
    expect(layout.groupOfRow.size).toBe(0);
  });
});

describe('movedRowTargets', () => {
  const layout = (order: string[], keys: Record<string, string[]>): GroupLayout => {
    const keysByGroup = new Map(Object.entries(keys));
    const groupOfRow = new Map<string, string>();
    for (const [group, list] of keysByGroup) for (const key of list) groupOfRow.set(key, group);
    return { order, keysByGroup, groupOfRow };
  };
  const before = layout(['late', 'todo', 'done'], {
    late: ['l1'],
    todo: ['a', 'b', 'c'],
    done: ['d1'],
  });

  it('targets the row now at the former index, then the next rendered group toggle', () => {
    const after = layout(['late', 'todo', 'done'], {
      late: ['l1', 'b'],
      todo: ['a', 'c'],
      done: ['d1'],
    });
    expect(movedRowTargets(before, after, 'b')).toEqual({ rowKeys: ['c'], toggleKeys: ['done'] });
  });

  it('has no row target when the former group has nothing at that index any more', () => {
    const after = layout(['late', 'todo', 'done'], {
      late: ['l1'],
      todo: ['a', 'b'],
      done: ['d1', 'c'],
    });
    expect(movedRowTargets(before, after, 'c')).toEqual({ rowKeys: [], toggleKeys: ['done'] });
  });

  it('skips a former group that vanished and any group that is no longer rendered', () => {
    const solo = layout(['todo', 'done'], { todo: ['a'], done: ['d1'] });
    const after = layout(['late', 'done'], { late: ['a'], done: ['d1'] });
    // todo vanished: no row there, the next group after it that still renders is done.
    expect(movedRowTargets(solo, after, 'a')).toEqual({ rowKeys: [], toggleKeys: ['done'] });
    const gone = layout(['late'], { late: ['a'] });
    expect(movedRowTargets(solo, gone, 'a')).toEqual({ rowKeys: [], toggleKeys: [] });
  });

  it('is null when the row did not move, is unknown, or a layout is missing', () => {
    expect(movedRowTargets(before, before, 'b')).toBeNull();
    expect(movedRowTargets(before, before, 'nope')).toBeNull();
    const removed = layout(['late', 'todo', 'done'], { late: ['l1'], todo: ['a'], done: [] });
    expect(movedRowTargets(before, removed, 'b')).toBeNull();
    expect(movedRowTargets(null, before, 'b')).toBeNull();
    expect(movedRowTargets(before, null, 'b')).toBeNull();
  });
});
