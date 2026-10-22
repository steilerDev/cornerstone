import { describe, it, expect } from '@jest/globals';
import { REFERENCE_LIST_SEARCH_MIN_ROWS, filterReferenceItems } from './referenceListSearch.js';

const ITEMS = [
  { name: 'Küche', description: 'Wet room' },
  { name: 'Hallway', description: null },
  { name: 'Garden' },
  { name: 'Cellar', description: 'Storage and Wärmepumpe' },
];

describe('referenceListSearch', () => {
  it('shows the search from 8 rows', () => {
    expect(REFERENCE_LIST_SEARCH_MIN_ROWS).toBe(8);
  });

  it('returns every item for an empty or blank query', () => {
    expect(filterReferenceItems(ITEMS, '')).toBe(ITEMS);
    expect(filterReferenceItems(ITEMS, '   ')).toBe(ITEMS);
  });

  it('matches names case-insensitively', () => {
    expect(filterReferenceItems(ITEMS, 'HALL').map((i) => i.name)).toEqual(['Hallway']);
  });

  it('folds umlauts both ways', () => {
    expect(filterReferenceItems(ITEMS, 'kuche').map((i) => i.name)).toEqual(['Küche']);
    expect(filterReferenceItems(ITEMS, 'KÜCHE').map((i) => i.name)).toEqual(['Küche']);
    expect(filterReferenceItems(ITEMS, 'warmepumpe').map((i) => i.name)).toEqual(['Cellar']);
  });

  it('matches the description and tolerates a missing or null one', () => {
    expect(filterReferenceItems(ITEMS, 'wet').map((i) => i.name)).toEqual(['Küche']);
    expect(filterReferenceItems(ITEMS, 'zzz')).toEqual([]);
  });

  it('trims the query', () => {
    expect(filterReferenceItems(ITEMS, '  garden ').map((i) => i.name)).toEqual(['Garden']);
  });
});
