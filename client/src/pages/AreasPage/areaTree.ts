import { foldSearchText } from '@cornerstone/shared';
import type { AreaCounts, AreaResponse, AreaWithCounts } from '@cornerstone/shared';

/** Tasks (work items) and purchases (household items): open of total. */
export interface OpenTotal {
  readonly total: number;
  readonly open: number;
}

/** What is attached to an area, summed over itself and its sub-areas. */
export interface AreaRollup {
  readonly tasks: OpenTotal;
  readonly purchases: OpenTotal;
  readonly photos: { readonly total: number; readonly latestDate: string | null };
}

export type QuietKind = 'building' | 'floor' | 'other';

/** One row of the flattened tree: an area, or the quiet "whole ‹area›" row of a parent. */
export interface AreaTreeRow {
  /** The area id; `quiet:<areaId>` for a quiet row. */
  readonly id: string;
  /** Parent area id; for a quiet row, the area it belongs to. */
  readonly parentId: string | null;
  /** 0 = top level. A quiet row has the depth of its siblings. */
  readonly depth: number;
  readonly area: AreaWithCounts;
  /** Subtree roll-up for an area; the area's own direct counts for a quiet row. */
  readonly rollup: AreaRollup;
  readonly quiet: QuietKind | null;
  /** An ancestor shown only because a descendant matches the filter. */
  readonly muted: boolean;
}

export interface AreaFilterResult {
  /** Areas whose name matches. */
  readonly matchIds: ReadonlySet<string>;
  /** Matches plus all their ancestors. */
  readonly visibleIds: ReadonlySet<string>;
}

export interface AreaPathSegment {
  readonly id: string;
  readonly name: string;
}

export const QUIET_ID_PREFIX = 'quiet:';

export function quietId(areaId: string): string {
  return `${QUIET_ID_PREFIX}${areaId}`;
}

const EMPTY_ROLLUP: AreaRollup = {
  tasks: { total: 0, open: 0 },
  purchases: { total: 0, open: 0 },
  photos: { total: 0, latestDate: null },
};

/** The direct counts of one area as a roll-up. */
export function directRollup(counts: AreaCounts | undefined): AreaRollup {
  if (!counts) return EMPTY_ROLLUP;
  return {
    tasks: { ...counts.workItems },
    purchases: { ...counts.householdItems },
    photos: { ...counts.photos },
  };
}

function addRollups(a: AreaRollup, b: AreaRollup): AreaRollup {
  const latest = [a.photos.latestDate, b.photos.latestDate].filter(
    (date): date is string => date !== null,
  );
  return {
    tasks: { total: a.tasks.total + b.tasks.total, open: a.tasks.open + b.tasks.open },
    purchases: {
      total: a.purchases.total + b.purchases.total,
      open: a.purchases.open + b.purchases.open,
    },
    photos: {
      total: a.photos.total + b.photos.total,
      latestDate: latest.length > 0 ? latest.reduce((x, y) => (x >= y ? x : y)) : null,
    },
  };
}

/** True when anything is attached to the area itself. */
export function hasDirectItems(rollup: AreaRollup): boolean {
  return rollup.tasks.total + rollup.purchases.total + rollup.photos.total > 0;
}

function compareSiblings(a: AreaResponse, b: AreaResponse): number {
  return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);
}

/** Children of `parentId` (`null` = top level) in display order. */
export function siblingsOf<T extends AreaResponse>(
  areas: readonly T[],
  parentId: string | null,
): T[] {
  return areas.filter((area) => area.parentId === parentId).sort(compareSiblings);
}

function childrenIndex<T extends AreaResponse>(areas: readonly T[]): Map<string | null, T[]> {
  const index = new Map<string | null, T[]>();
  for (const area of areas) {
    const list = index.get(area.parentId);
    if (list) list.push(area);
    else index.set(area.parentId, [area]);
  }
  for (const list of index.values()) list.sort(compareSiblings);
  return index;
}

/** Roll-up (own counts plus all descendants) per area id. */
export function computeRollups(areas: readonly AreaWithCounts[]): Map<string, AreaRollup> {
  const children = childrenIndex(areas);
  const result = new Map<string, AreaRollup>();
  const visit = (area: AreaWithCounts, seen: Set<string>): AreaRollup => {
    const cached = result.get(area.id);
    if (cached) return cached;
    seen.add(area.id);
    let total = directRollup(area.counts);
    for (const child of children.get(area.id) ?? []) {
      if (seen.has(child.id)) continue;
      total = addRollups(total, visit(child, seen));
    }
    result.set(area.id, total);
    return total;
  };
  for (const area of areas) visit(area, new Set());
  return result;
}

/** Quiet-row wording by the depth of the area it belongs to. */
export function quietKindForDepth(depth: number): QuietKind {
  if (depth === 0) return 'building';
  if (depth === 1) return 'floor';
  return 'other';
}

export interface BuildRowsOptions {
  /** When set (a filter is active), only these areas appear and no quiet rows. */
  readonly visibleIds?: ReadonlySet<string> | null;
  /** Visible areas that are context only. */
  readonly matchIds?: ReadonlySet<string> | null;
}

/**
 * The tree flattened depth-first, siblings in display order. A parent with items booked on itself
 * and with children is followed by a quiet row for those items (not while filtering).
 */
export function buildAreaTreeRows(
  areas: readonly AreaWithCounts[],
  options: BuildRowsOptions = {},
): AreaTreeRow[] {
  const { visibleIds = null, matchIds = null } = options;
  const children = childrenIndex(areas);
  const rollups = computeRollups(areas);
  const rows: AreaTreeRow[] = [];
  const seen = new Set<string>();

  const visit = (area: AreaWithCounts, depth: number) => {
    if (seen.has(area.id)) return;
    seen.add(area.id);
    if (visibleIds && !visibleIds.has(area.id)) return;
    const kids = children.get(area.id) ?? [];
    rows.push({
      id: area.id,
      parentId: area.parentId,
      depth,
      area,
      rollup: rollups.get(area.id) ?? EMPTY_ROLLUP,
      quiet: null,
      muted: matchIds !== null && !matchIds.has(area.id),
    });
    const direct = directRollup(area.counts);
    if (!visibleIds && kids.length > 0 && hasDirectItems(direct)) {
      rows.push({
        id: quietId(area.id),
        parentId: area.id,
        depth: depth + 1,
        area,
        rollup: direct,
        quiet: quietKindForDepth(depth),
        muted: false,
      });
    }
    for (const kid of kids) visit(kid, depth + 1);
  };

  for (const root of children.get(null) ?? []) visit(root, 0);
  return rows;
}

/** Root-first path of an area (its ancestors, then itself); empty for an unknown id. */
export function areaPath(areas: readonly AreaResponse[], id: string): AreaPathSegment[] {
  const byId = new Map(areas.map((area) => [area.id, area]));
  const path: AreaPathSegment[] = [];
  const seen = new Set<string>();
  let current = byId.get(id);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift({ id: current.id, name: current.name });
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return path;
}

/** Ids of `id` and everything below it. */
export function subtreeIds(areas: readonly AreaResponse[], id: string): Set<string> {
  const children = childrenIndex(areas);
  const result = new Set<string>();
  const visit = (areaId: string) => {
    if (result.has(areaId)) return;
    result.add(areaId);
    for (const child of children.get(areaId) ?? []) visit(child.id);
  };
  visit(id);
  return result;
}

/** Matches by folded name (case, umlauts and ß ignored) and the ancestors that give them context. */
export function filterAreas(
  areas: readonly AreaResponse[],
  query: string,
): AreaFilterResult | null {
  const folded = foldSearchText(query.trim());
  if (folded === '') return null;
  const byId = new Map(areas.map((area) => [area.id, area]));
  const matchIds = new Set<string>();
  const visibleIds = new Set<string>();
  for (const area of areas) {
    if (!foldSearchText(area.name).includes(folded)) continue;
    matchIds.add(area.id);
    let current: AreaResponse | undefined = area;
    while (current && !visibleIds.has(current.id)) {
      visibleIds.add(current.id);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
  }
  return { matchIds, visibleIds };
}

/** Fold used for sibling-name clashes: also ignores surrounding and repeated whitespace. */
export function foldAreaName(name: string): string {
  return foldSearchText(name.trim().replace(/\s+/g, ' '));
}

/** True when a sibling under `parentId` (`null`/`''` = top level) already has this name. */
export function siblingNameTaken(
  areas: readonly AreaResponse[],
  name: string,
  parentId: string | null,
  exceptId?: string,
): boolean {
  const target = foldAreaName(name);
  const parent = parentId === '' ? null : parentId;
  return areas.some(
    (area) =>
      area.id !== exceptId && area.parentId === parent && foldAreaName(area.name) === target,
  );
}
