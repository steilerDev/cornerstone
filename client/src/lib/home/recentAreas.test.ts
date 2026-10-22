import { describe, it, expect } from '@jest/globals';
import type { AreaSummary } from '@cornerstone/shared';
import { makeDiaryEntry } from '../../test/attentionFixtures.js';
import { areaPathLabel, recentAreas, RECENT_AREA_LIMIT } from './recentAreas.js';

function area(id: string, name: string, ancestors: string[] = []): AreaSummary {
  return {
    id,
    name,
    color: null,
    ancestors: ancestors.map((n, i) => ({ id: `${id}-anc-${i}`, name: n, color: null })),
  };
}

describe('recentAreas', () => {
  it('returns photographed areas in entry order, de-duplicated by id', () => {
    const a = area('a', 'Kitchen');
    const b = area('b', 'Garage');
    const entries = [
      makeDiaryEntry('1', { photoAreas: [a, b] }),
      makeDiaryEntry('2', { photoAreas: [b, area('c', 'Roof')] }),
    ];
    expect(recentAreas(entries).map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });

  it('keeps the first occurrence when an area repeats', () => {
    const first = area('a', 'Kitchen');
    const second = area('a', 'Kitchen (renamed)');
    const result = recentAreas([
      makeDiaryEntry('1', { photoAreas: [first] }),
      makeDiaryEntry('2', { photoAreas: [second] }),
    ]);
    expect(result).toEqual([first]);
  });

  it('stops at the limit (default 5) even in the middle of an entry', () => {
    const many = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => area(id, id));
    expect(RECENT_AREA_LIMIT).toBe(5);
    expect(recentAreas([makeDiaryEntry('1', { photoAreas: many })]).map((x) => x.id)).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
    ]);
    expect(recentAreas([makeDiaryEntry('1', { photoAreas: many })], 2)).toHaveLength(2);
  });

  it('handles entries without photoAreas and an empty list', () => {
    expect(recentAreas([])).toEqual([]);
    expect(recentAreas([makeDiaryEntry('1', { photoAreas: undefined })])).toEqual([]);
  });
});

describe('areaPathLabel', () => {
  it('joins ancestors (root first) and the name with a chevron', () => {
    expect(areaPathLabel(area('a', 'Kitchen', ['House', 'Ground floor']))).toBe(
      'House › Ground floor › Kitchen',
    );
  });

  it('is just the name for a root area', () => {
    expect(areaPathLabel(area('a', 'Garage'))).toBe('Garage');
  });
});
