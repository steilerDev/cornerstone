import type { AreaSummary, DiaryEntrySummary } from '@cornerstone/shared';

export const RECENT_AREA_LIMIT = 5;

/** The photographed areas of the entries, in entry order, de-duplicated by id, first `limit`. */
export function recentAreas(
  entries: readonly DiaryEntrySummary[],
  limit: number = RECENT_AREA_LIMIT,
): AreaSummary[] {
  const seen = new Set<string>();
  const result: AreaSummary[] = [];
  for (const entry of entries) {
    for (const area of entry.photoAreas ?? []) {
      if (seen.has(area.id)) continue;
      seen.add(area.id);
      result.push(area);
      if (result.length >= limit) return result;
    }
  }
  return result;
}

/** Ancestors (root first) and the area's own name, joined with " › ". */
export function areaPathLabel(area: AreaSummary): string {
  return [...area.ancestors.map((ancestor) => ancestor.name), area.name].join(' › ');
}
