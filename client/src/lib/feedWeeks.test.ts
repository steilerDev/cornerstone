import { describe, it, expect } from '@jest/globals';
import { groupByWeek, weekEnd, weekKind, weekStart } from './feedWeeks.js';

describe('weekStart', () => {
  it('returns the Monday for every weekday of the week of 2026-10-12', () => {
    for (const day of [
      '2026-10-12',
      '2026-10-13',
      '2026-10-14',
      '2026-10-15',
      '2026-10-16',
      '2026-10-17',
      '2026-10-18',
    ]) {
      expect(weekStart(day)).toBe('2026-10-12');
    }
  });

  it('puts Sunday in the week that ends on it, not the next one', () => {
    expect(weekStart('2026-10-18')).toBe('2026-10-12');
    expect(weekStart('2026-10-19')).toBe('2026-10-19');
  });

  it('crosses the year boundary: 2026-12-31 is in the week of 2026-12-28', () => {
    expect(weekStart('2026-12-31')).toBe('2026-12-28');
    expect(weekStart('2027-01-01')).toBe('2026-12-28');
    expect(weekStart('2027-01-03')).toBe('2026-12-28');
    expect(weekStart('2027-01-04')).toBe('2027-01-04');
  });
});

describe('weekEnd', () => {
  it('returns the Sunday six days after the Monday', () => {
    expect(weekEnd('2026-10-12')).toBe('2026-10-18');
  });

  it('crosses a month and a year', () => {
    expect(weekEnd('2026-12-28')).toBe('2027-01-03');
    expect(weekEnd('2026-09-28')).toBe('2026-10-04');
  });
});

describe('weekKind', () => {
  it('is thisWeek for the Monday of today', () => {
    expect(weekKind('2026-10-19', '2026-10-21')).toBe('thisWeek');
    expect(weekKind('2026-10-19', '2026-10-25')).toBe('thisWeek');
  });

  it('is lastWeek for the Monday seven days earlier', () => {
    expect(weekKind('2026-10-12', '2026-10-21')).toBe('lastWeek');
  });

  it('is lastWeek across a year change', () => {
    expect(weekKind('2026-12-28', '2027-01-05')).toBe('lastWeek');
  });

  it('is other for older and for future weeks', () => {
    expect(weekKind('2026-10-05', '2026-10-21')).toBe('other');
    expect(weekKind('2026-10-26', '2026-10-21')).toBe('other');
  });
});

describe('groupByWeek', () => {
  it('returns an empty list for no items', () => {
    expect(groupByWeek([])).toEqual([]);
  });

  it('groups by Monday key and keeps the item order', () => {
    const items = [
      { id: 'a', entryDate: '2026-10-19' },
      { id: 'b', entryDate: '2026-10-18' },
      { id: 'c', entryDate: '2026-10-12' },
      { id: 'd', entryDate: '2026-10-05' },
    ];
    const groups = groupByWeek(items);
    expect(groups.map(([key]) => key)).toEqual(['2026-10-19', '2026-10-12', '2026-10-05']);
    expect(groups[1]?.[1].map((i) => i.id)).toEqual(['b', 'c']);
  });

  it('merges rows of one week that arrive in separate runs (pages)', () => {
    const groups = groupByWeek([
      { id: 'a', entryDate: '2026-10-14' },
      { id: 'b', entryDate: '2026-10-13' },
      { id: 'c', entryDate: '2026-10-12' },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.[1]).toHaveLength(3);
  });

  it('keeps the two sides of a year change in separate groups', () => {
    const groups = groupByWeek([
      { id: 'a', entryDate: '2027-01-04' },
      { id: 'b', entryDate: '2027-01-03' },
      { id: 'c', entryDate: '2026-12-31' },
    ]);
    expect(groups.map(([key]) => key)).toEqual(['2027-01-04', '2026-12-28']);
    expect(groups[1]?.[1]).toHaveLength(2);
  });
});
