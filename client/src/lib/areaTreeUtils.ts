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
  const _areaMap = new Map(areas.map((a) => [a.id, a]));
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

/**
 * Returns the root-first ancestor name chain for the given area ID,
 * excluding the area itself. Names joined by ' › ' (space + U+203A + space).
 * Returns '' for top-level areas (no ancestors) or unknown ids.
 */
export function getAncestorPath(areas: AreaResponse[], areaId: string): string {
  const areaMap = new Map(areas.map((a) => [a.id, a]));
  const names: string[] = [];
  const current = areaMap.get(areaId);
  if (!current) return '';
  let parentId = current.parentId;
  while (parentId) {
    const parent = areaMap.get(parentId);
    if (!parent) break;
    names.unshift(parent.name);
    parentId = parent.parentId;
  }
  return names.join(' › ');
}

/**
 * Hierarchy-aware search over a built tree.
 * - Empty/whitespace query → full tree unchanged.
 * - A node "directly matches" if its name case-insensitively contains the query.
 * - When a node directly matches, the node AND ALL its descendants are included
 *   (so matching a parent like "ground floor" includes its rooms).
 * - Results preserve original depth-first order and depth values.
 */
export function searchTree(tree: TreeNode[], query: string): TreeNode[] {
  const lowerQuery = query.toLowerCase().trim();
  if (!lowerQuery) return tree;
  const directMatchIds = new Set<string>(
    tree.filter(({ area }) => area.name.toLowerCase().includes(lowerQuery)).map(({ area }) => area.id),
  );
  const childrenOf = new Map<string | null, string[]>();
  for (const { area } of tree) {
    const parentId = area.parentId ?? null;
    if (!childrenOf.has(parentId)) childrenOf.set(parentId, []);
    childrenOf.get(parentId)!.push(area.id);
  }
  const include = new Set<string>();
  function addWithDescendants(areaId: string) {
    include.add(areaId);
    for (const childId of childrenOf.get(areaId) ?? []) addWithDescendants(childId);
  }
  for (const id of directMatchIds) addWithDescendants(id);
  return tree.filter(({ area }) => include.has(area.id));
}
