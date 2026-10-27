/**
 * getAreaSummary (#2242): the AreaSummary of an area id from a pre-built map.
 *
 * Mutations: a null id not returning null; ancestors missing or in the wrong order (root first);
 * the color of the area replaced by its parent's.
 */
import { describe, it, expect } from '@jest/globals';
import { getAreaSummary } from './areaService.js';
import type { AreaMapEntry } from './areaService.js';

const map = new Map<string, AreaMapEntry>([
  ['house', { id: 'house', name: 'House', color: '#aa0000', parentId: null }],
  ['floor', { id: 'floor', name: 'Ground floor', color: null, parentId: 'house' }],
  ['kitchen', { id: 'kitchen', name: 'Kitchen', color: '#336699', parentId: 'floor' }],
]);

describe('getAreaSummary', () => {
  it('is null for a null id', () => {
    expect(getAreaSummary(null, map)).toBeNull();
  });

  it('is the area with an empty ancestor list for a root area', () => {
    expect(getAreaSummary('house', map)).toEqual({
      id: 'house',
      name: 'House',
      color: '#aa0000',
      ancestors: [],
    });
  });

  it('lists the ancestors root first and keeps the area own color', () => {
    expect(getAreaSummary('kitchen', map)).toEqual({
      id: 'kitchen',
      name: 'Kitchen',
      color: '#336699',
      ancestors: [
        { id: 'house', name: 'House', color: '#aa0000' },
        { id: 'floor', name: 'Ground floor', color: null },
      ],
    });
  });
});
