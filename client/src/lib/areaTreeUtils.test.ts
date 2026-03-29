import { describe, it, expect } from '@jest/globals';
import { buildTree } from './areaTreeUtils.js';
import type { AreaResponse } from '@cornerstone/shared';

const makeArea = (
  overrides: Partial<AreaResponse> & { id: string; name: string },
): AreaResponse => {
  const defaults: AreaResponse = {
    id: overrides.id,
    name: overrides.name,
    parentId: null,
    color: null,
    description: null,
    sortOrder: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
  return { ...defaults, ...overrides };
};

describe('buildTree', () => {
  it('returns empty array when given empty input', () => {
    expect(buildTree([])).toEqual([]);
  });

  it('returns a single top-level area with depth 0', () => {
    const areas = [makeArea({ id: 'a1', name: 'Kitchen' })];
    const result = buildTree(areas);

    expect(result).toHaveLength(1);
    expect(result[0].depth).toBe(0);
    expect(result[0].area.name).toBe('Kitchen');
  });

  it('assigns depth 0 to top-level areas (parentId is null)', () => {
    const areas = [
      makeArea({ id: 'a1', name: 'Kitchen' }),
      makeArea({ id: 'a2', name: 'Bathroom' }),
    ];
    const result = buildTree(areas);

    expect(result).toHaveLength(2);
    expect(result.every((n) => n.depth === 0)).toBe(true);
  });

  it('assigns depth 1 to direct children', () => {
    const areas = [
      makeArea({ id: 'a1', name: 'Kitchen' }),
      makeArea({ id: 'a2', name: 'Upper Cabinets', parentId: 'a1' }),
    ];
    const result = buildTree(areas);

    expect(result).toHaveLength(2);
    const parent = result.find((n) => n.area.id === 'a1')!;
    const child = result.find((n) => n.area.id === 'a2')!;
    expect(parent.depth).toBe(0);
    expect(child.depth).toBe(1);
  });

  it('assigns depth 2 to grandchildren', () => {
    const areas = [
      makeArea({ id: 'a1', name: 'Kitchen' }),
      makeArea({ id: 'a2', name: 'Cabinets', parentId: 'a1' }),
      makeArea({ id: 'a3', name: 'Upper Cabinets', parentId: 'a2' }),
    ];
    const result = buildTree(areas);

    expect(result).toHaveLength(3);
    const grandchild = result.find((n) => n.area.id === 'a3')!;
    expect(grandchild.depth).toBe(2);
  });

  it('preserves the area object on each node', () => {
    const area = makeArea({ id: 'a1', name: 'Kitchen', color: '#ff0000' });
    const result = buildTree([area]);

    expect(result[0].area).toEqual(area);
  });

  it('places children directly after their parent in depth-first order', () => {
    const areas = [
      makeArea({ id: 'a1', name: 'Kitchen', sortOrder: 0 }),
      makeArea({ id: 'a2', name: 'Bathroom', sortOrder: 1 }),
      makeArea({ id: 'a3', name: 'Upper Cabinets', parentId: 'a1' }),
    ];
    const result = buildTree(areas);
    const ids = result.map((n) => n.area.id);

    // a3 is child of a1, so it must come before a2 (depth-first)
    expect(ids.indexOf('a3')).toBeLessThan(ids.indexOf('a2'));
    expect(ids.indexOf('a1')).toBeLessThan(ids.indexOf('a3'));
  });

  it('sorts top-level areas by sortOrder ascending', () => {
    const areas = [
      makeArea({ id: 'a1', name: 'Bathroom', sortOrder: 2 }),
      makeArea({ id: 'a2', name: 'Kitchen', sortOrder: 1 }),
      makeArea({ id: 'a3', name: 'Garage', sortOrder: 0 }),
    ];
    const result = buildTree(areas);
    const names = result.map((n) => n.area.name);

    expect(names).toEqual(['Garage', 'Kitchen', 'Bathroom']);
  });

  it('sorts children by sortOrder ascending within a parent', () => {
    const areas = [
      makeArea({ id: 'a1', name: 'Kitchen', sortOrder: 0 }),
      makeArea({ id: 'a2', name: 'Lower Cabinets', parentId: 'a1', sortOrder: 2 }),
      makeArea({ id: 'a3', name: 'Upper Cabinets', parentId: 'a1', sortOrder: 1 }),
    ];
    const result = buildTree(areas);
    const ids = result.map((n) => n.area.id);

    expect(ids).toEqual(['a1', 'a3', 'a2']);
  });

  it('sorts areas alphabetically by name when sortOrders are equal', () => {
    const areas = [
      makeArea({ id: 'a1', name: 'Bathroom', sortOrder: 0 }),
      makeArea({ id: 'a2', name: 'Attic', sortOrder: 0 }),
      makeArea({ id: 'a3', name: 'Kitchen', sortOrder: 0 }),
    ];
    const result = buildTree(areas);
    const names = result.map((n) => n.area.name);

    expect(names).toEqual(['Attic', 'Bathroom', 'Kitchen']);
  });

  it('sorts children alphabetically by name when sortOrders are equal', () => {
    const areas = [
      makeArea({ id: 'a1', name: 'Kitchen', sortOrder: 0 }),
      makeArea({ id: 'a2', name: 'Sink', parentId: 'a1', sortOrder: 0 }),
      makeArea({ id: 'a3', name: 'Island', parentId: 'a1', sortOrder: 0 }),
    ];
    const result = buildTree(areas);
    const names = result.map((n) => n.area.name);

    // Kitchen first, then Island, then Sink (alphabetical children)
    expect(names).toEqual(['Kitchen', 'Island', 'Sink']);
  });

  it('handles multiple top-level areas with multiple children each', () => {
    const areas = [
      makeArea({ id: 'a1', name: 'Kitchen', sortOrder: 0 }),
      makeArea({ id: 'a2', name: 'Bathroom', sortOrder: 1 }),
      makeArea({ id: 'a3', name: 'Kitchen Child 1', parentId: 'a1', sortOrder: 0 }),
      makeArea({ id: 'a4', name: 'Kitchen Child 2', parentId: 'a1', sortOrder: 1 }),
      makeArea({ id: 'a5', name: 'Bathroom Child', parentId: 'a2', sortOrder: 0 }),
    ];
    const result = buildTree(areas);
    const ids = result.map((n) => n.area.id);

    // Depth-first: Kitchen, Kitchen Child 1, Kitchen Child 2, Bathroom, Bathroom Child
    expect(ids).toEqual(['a1', 'a3', 'a4', 'a2', 'a5']);
  });

  it('handles orphaned areas (parentId references nonexistent parent) by ignoring them', () => {
    const areas = [
      makeArea({ id: 'a1', name: 'Kitchen' }),
      makeArea({ id: 'a2', name: 'Orphan', parentId: 'nonexistent' }),
    ];
    const result = buildTree(areas);

    // a1 has no parent so it appears; a2's parent doesn't exist so it is not traversed
    const ids = result.map((n) => n.area.id);
    expect(ids).toContain('a1');
    expect(ids).not.toContain('a2');
  });

  it('does not visit the same area twice (cycle guard)', () => {
    // This simulates areas where someone manually created a cycle
    // visited set prevents infinite loops
    const areas = [
      makeArea({ id: 'a1', name: 'Kitchen' }),
      makeArea({ id: 'a2', name: 'Child', parentId: 'a1' }),
    ];
    // Even with duplicate entries, visited set prevents double-visiting
    const areasWithDuplicate = [...areas, makeArea({ id: 'a1', name: 'Kitchen Duplicate' })];
    const result = buildTree(areasWithDuplicate);

    // a1 appears only once
    const a1Nodes = result.filter((n) => n.area.id === 'a1');
    expect(a1Nodes).toHaveLength(1);
  });

  it('returns all areas in a flat tree when none have parents', () => {
    const areas = [
      makeArea({ id: 'a1', name: 'Zone A' }),
      makeArea({ id: 'a2', name: 'Zone B' }),
      makeArea({ id: 'a3', name: 'Zone C' }),
    ];
    const result = buildTree(areas);

    expect(result).toHaveLength(3);
    expect(result.every((n) => n.depth === 0)).toBe(true);
  });

  it('handles a deep nesting of areas (3 levels)', () => {
    const areas = [
      makeArea({ id: 'l1', name: 'Level 1' }),
      makeArea({ id: 'l2', name: 'Level 2', parentId: 'l1' }),
      makeArea({ id: 'l3', name: 'Level 3', parentId: 'l2' }),
    ];
    const result = buildTree(areas);

    expect(result).toHaveLength(3);
    expect(result[0].depth).toBe(0);
    expect(result[1].depth).toBe(1);
    expect(result[2].depth).toBe(2);
  });
});
