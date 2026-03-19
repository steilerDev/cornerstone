import type { AreaResponse } from '@cornerstone/shared';

export interface TreeNode {
  depth: number;
  area: AreaResponse;
}

/**
 * Builds a depth-first ordered tree from a flat list of areas.
 * Areas are ordered by depth, then by sortOrder, then by name.
 */
export function buildTree(areas: AreaResponse[]): TreeNode[] {
  const areaMap = new Map(areas.map((a) => [a.id, a]));
  const visited = new Set<string>();
  const result: TreeNode[] = [];

  /**
   * Recursively add area and its children to result.
   */
  function addNode(area: AreaResponse, depth: number) {
    if (visited.has(area.id)) return;
    visited.add(area.id);
    result.push({ depth, area });

    // Add children sorted by sortOrder, then name
    const children = areas
      .filter((a) => a.parentId === area.id)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

    for (const child of children) {
      addNode(child, depth + 1);
    }
  }

  // Start with top-level areas (no parent)
  const topLevel = areas
    .filter((a) => !a.parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

  for (const area of topLevel) {
    addNode(area, 0);
  }

  return result;
}
