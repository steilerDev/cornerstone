import { describe, it, expect } from '@jest/globals';
import { buildTree, getAncestorPath, searchTree } from './areaTreeUtils.js';
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
    expect(result[0]!.depth).toBe(0);
    expect(result[0]!.area.name).toBe('Kitchen');
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

    expect(result[0]!.area).toEqual(area);
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
    expect(result[0]!.depth).toBe(0);
    expect(result[1]!.depth).toBe(1);
    expect(result[2]!.depth).toBe(2);
  });
});

// ─── getAncestorPath ─────────────────────────────────────────────────────────

describe('getAncestorPath', () => {
  it('returns empty string for a top-level area (no ancestors)', () => {
    const areas = [makeArea({ id: 'a1', name: 'Kitchen' })];
    expect(getAncestorPath(areas, 'a1')).toBe('');
  });

  it('returns empty string for an unknown areaId', () => {
    const areas = [makeArea({ id: 'a1', name: 'Kitchen' })];
    expect(getAncestorPath(areas, 'nonexistent')).toBe('');
  });

  it('returns parent name for a depth-1 area', () => {
    const areas = [
      makeArea({ id: 'root', name: 'Ground Floor' }),
      makeArea({ id: 'child', name: 'Living Room', parentId: 'root' }),
    ];
    expect(getAncestorPath(areas, 'child')).toBe('Ground Floor');
  });

  it('returns root-first ancestor chain for a depth-2 area', () => {
    const areas = [
      makeArea({ id: 'root', name: 'Ground Floor' }),
      makeArea({ id: 'mid', name: 'West Wing', parentId: 'root' }),
      makeArea({ id: 'leaf', name: 'Bedroom', parentId: 'mid' }),
    ];
    // root › mid: "Ground Floor › West Wing"
    expect(getAncestorPath(areas, 'leaf')).toBe('Ground Floor › West Wing');
  });

  it('separator is space + U+203A + space (not a plain >)', () => {
    const areas = [
      makeArea({ id: 'root', name: 'Root' }),
      makeArea({ id: 'mid', name: 'Mid', parentId: 'root' }),
      makeArea({ id: 'leaf', name: 'Leaf', parentId: 'mid' }),
    ];
    const path = getAncestorPath(areas, 'leaf');
    // Must contain the single-character U+203A, not '>' or '>>'
    expect(path).toContain('›');
    expect(path).toBe('Root › Mid');
  });

  it('excludes the area itself from the path', () => {
    const areas = [
      makeArea({ id: 'root', name: 'Root' }),
      makeArea({ id: 'child', name: 'Child', parentId: 'root' }),
    ];
    const path = getAncestorPath(areas, 'child');
    // Only parent included, not the area itself
    expect(path).toBe('Root');
    expect(path).not.toContain('Child');
  });

  it('returns empty string when areas list is empty', () => {
    expect(getAncestorPath([], 'any-id')).toBe('');
  });

  it('handles a 3-level chain root-first', () => {
    const areas = [
      makeArea({ id: 'r', name: 'House' }),
      makeArea({ id: 'm', name: 'Floor', parentId: 'r' }),
      makeArea({ id: 'l', name: 'Room', parentId: 'm' }),
      makeArea({ id: 'leaf', name: 'Corner', parentId: 'l' }),
    ];
    expect(getAncestorPath(areas, 'leaf')).toBe('House › Floor › Room');
  });

  it('stops traversal gracefully when a parent id does not exist in the map', () => {
    // child has parentId 'missing' which is not in the areas list
    const areas = [makeArea({ id: 'child', name: 'Orphan', parentId: 'missing' })];
    // No ancestors can be resolved → empty string
    expect(getAncestorPath(areas, 'child')).toBe('');
  });
});

// ─── searchTree ──────────────────────────────────────────────────────────────

describe('searchTree', () => {
  // Helpers: build a tree from a flat list
  function makeTree(areas: AreaResponse[]) {
    return buildTree(areas);
  }

  it('empty query returns the full tree unchanged', () => {
    const areas = [
      makeArea({ id: 'a1', name: 'Kitchen' }),
      makeArea({ id: 'a2', name: 'Bathroom' }),
    ];
    const tree = makeTree(areas);
    expect(searchTree(tree, '')).toEqual(tree);
  });

  it('whitespace-only query returns the full tree unchanged', () => {
    const areas = [
      makeArea({ id: 'a1', name: 'Kitchen' }),
      makeArea({ id: 'a2', name: 'Bathroom' }),
    ];
    const tree = makeTree(areas);
    expect(searchTree(tree, '   ')).toEqual(tree);
  });

  it('no match returns empty array', () => {
    const areas = [
      makeArea({ id: 'a1', name: 'Kitchen' }),
      makeArea({ id: 'a2', name: 'Bathroom' }),
    ];
    const tree = makeTree(areas);
    expect(searchTree(tree, 'garage')).toEqual([]);
  });

  it('leaf match returns only that leaf', () => {
    const areas = [
      makeArea({ id: 'root', name: 'Ground Floor' }),
      makeArea({ id: 'child', name: 'Living Room', parentId: 'root' }),
      makeArea({ id: 'sibling', name: 'Bathroom', parentId: 'root' }),
    ];
    const tree = makeTree(areas);
    const result = searchTree(tree, 'living');
    const ids = result.map((n) => n.area.id);
    expect(ids).toContain('child');
    expect(ids).not.toContain('root');
    expect(ids).not.toContain('sibling');
  });

  it('parent match includes parent + ALL descendants', () => {
    const areas = [
      makeArea({ id: 'root', name: 'Ground Floor' }),
      makeArea({ id: 'child1', name: 'Living Room', parentId: 'root' }),
      makeArea({ id: 'child2', name: 'Kitchen', parentId: 'root' }),
      makeArea({ id: 'grandchild', name: 'Island', parentId: 'child2' }),
      makeArea({ id: 'unrelated', name: 'Attic' }),
    ];
    const tree = makeTree(areas);
    const result = searchTree(tree, 'ground');
    const ids = result.map((n) => n.area.id);
    // parent + all descendants
    expect(ids).toContain('root');
    expect(ids).toContain('child1');
    expect(ids).toContain('child2');
    expect(ids).toContain('grandchild');
    // unrelated top-level not included
    expect(ids).not.toContain('unrelated');
  });

  it('is case-insensitive', () => {
    const areas = [makeArea({ id: 'a1', name: 'Kitchen' })];
    const tree = makeTree(areas);
    expect(searchTree(tree, 'KITCHEN')).toHaveLength(1);
    expect(searchTree(tree, 'kitchen')).toHaveLength(1);
    expect(searchTree(tree, 'KiTcHeN')).toHaveLength(1);
  });

  it('preserves depth-first order', () => {
    const areas = [
      makeArea({ id: 'a1', name: 'Alpha', sortOrder: 0 }),
      makeArea({ id: 'a2', name: 'Beta', parentId: 'a1', sortOrder: 0 }),
      makeArea({ id: 'a3', name: 'Gamma', sortOrder: 1 }),
    ];
    const tree = makeTree(areas);
    // 'a' matches 'Alpha', 'Beta' (contains 'a' not matching), 'Gamma' (contains 'a' → match)
    // Actually only Alpha (contains 'a' → parent match includes Beta), Gamma matches directly
    const result = searchTree(tree, 'a');
    const ids = result.map((n) => n.area.id);
    // Alpha (depth-first first), then Beta (child of Alpha), then Gamma
    expect(ids.indexOf('a1')).toBeLessThan(ids.indexOf('a3'));
    // Beta must come before Gamma (Beta is child of Alpha which is before Gamma)
    expect(ids.indexOf('a2')).toBeLessThan(ids.indexOf('a3'));
  });

  it('preserves original depth values in results', () => {
    const areas = [
      makeArea({ id: 'root', name: 'Ground Floor' }),
      makeArea({ id: 'child', name: 'Room', parentId: 'root' }),
    ];
    const tree = makeTree(areas);
    const result = searchTree(tree, 'ground');
    const rootNode = result.find((n) => n.area.id === 'root')!;
    const childNode = result.find((n) => n.area.id === 'child')!;
    expect(rootNode.depth).toBe(0);
    expect(childNode.depth).toBe(1);
  });

  it('same leaf name shared across multiple parents — all matches included', () => {
    const areas = [
      makeArea({ id: 'floor1', name: 'Floor 1' }),
      makeArea({ id: 'floor2', name: 'Floor 2' }),
      makeArea({ id: 'bath1', name: 'Bathroom', parentId: 'floor1' }),
      makeArea({ id: 'bath2', name: 'Bathroom', parentId: 'floor2' }),
    ];
    const tree = makeTree(areas);
    const result = searchTree(tree, 'bathroom');
    const ids = result.map((n) => n.area.id);
    expect(ids).toContain('bath1');
    expect(ids).toContain('bath2');
    // Parents not matched (not included unless parent name also matched)
    expect(ids).not.toContain('floor1');
    expect(ids).not.toContain('floor2');
  });

  it('partial name match works (substring)', () => {
    const areas = [makeArea({ id: 'a1', name: 'Kitchen Sink' })];
    const tree = makeTree(areas);
    expect(searchTree(tree, 'sink')).toHaveLength(1);
    expect(searchTree(tree, 'kitchen')).toHaveLength(1);
    expect(searchTree(tree, 'itch')).toHaveLength(1);
  });

  it('empty tree input returns empty array', () => {
    expect(searchTree([], 'anything')).toEqual([]);
  });

  it('returns full tree when query is a single space (whitespace trim)', () => {
    const areas = [makeArea({ id: 'a1', name: 'A' })];
    const tree = makeTree(areas);
    // Single space trims to '' → returns full tree
    expect(searchTree(tree, ' ')).toEqual(tree);
  });
});
