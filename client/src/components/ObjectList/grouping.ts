import { OBJECT_LIST_PAGE_SIZE } from './objectListUrl.js';
import type { ObjectListGroupMeta, ObjectListGroupOption } from './types.js';

export interface ObjectListGroupData<T> {
  readonly meta: ObjectListGroupMeta;
  readonly items: T[];
  /** Rows matching the query (server count, else the loaded rows). */
  readonly count: number;
  readonly loaded: number;
}

/** Groups the loaded rows; `option.order` first, then the rest A–Z by label. */
export function buildGroups<T>(
  items: readonly T[],
  option: ObjectListGroupOption<T>,
  groupCounts: Readonly<Record<string, number>> | null,
): ObjectListGroupData<T>[] {
  const byKey = new Map<string, { meta: ObjectListGroupMeta; items: T[] }>();
  for (const item of items) {
    const meta = option.groupOf(item);
    const existing = byKey.get(meta.key);
    if (existing) existing.items.push(item);
    else byKey.set(meta.key, { meta, items: [item] });
  }
  const order = option.order ?? [];
  const position = (key: string): number => {
    const index = order.indexOf(key);
    return index === -1 ? Number.POSITIVE_INFINITY : index;
  };
  return [...byKey.values()]
    .sort((a, b) => {
      const pa = position(a.meta.key);
      const pb = position(b.meta.key);
      if (pa !== pb) return pa < pb ? -1 : 1;
      return a.meta.label.localeCompare(b.meta.label);
    })
    .map((group) => ({
      meta: group.meta,
      items: group.items,
      count: groupCounts?.[group.meta.key] ?? group.items.length,
      loaded: group.items.length,
    }));
}

/** A done bucket starts collapsed while another group has rows; alone, it starts open. */
export function defaultOpen<T>(
  group: ObjectListGroupData<T>,
  groups: readonly ObjectListGroupData<T>[],
): boolean {
  return !(group.meta.done && groups.some((g) => g !== group && g.items.length > 0));
}

/** Client grouping needs every row; server grouping works at any size. */
export function groupingAvailable<T>(
  option: ObjectListGroupOption<T>,
  totalItems: number | null,
): boolean {
  return option.server === true || totalItems === null || totalItems <= OBJECT_LIST_PAGE_SIZE;
}
