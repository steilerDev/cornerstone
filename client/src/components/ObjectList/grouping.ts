import { OBJECT_LIST_PAGE_SIZE } from './objectListUrl.js';
import type { ObjectListGroupMeta, ObjectListGroupOption } from './types.js';

export interface ObjectListGroupData<T> {
  readonly meta: ObjectListGroupMeta;
  readonly items: T[];
  /** Rows matching the query (server count, else the loaded rows). */
  readonly count: number;
  readonly loaded: number;
}

/** Groups the loaded rows; `option.order` first, then the rest A–Z by label, then `option.last`. */
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
  const last = option.last ?? [];
  // `order` keys first, then the A–Z rest, then the `last` keys in their given order.
  const position = (key: string): number => {
    const lastIndex = last.indexOf(key);
    if (lastIndex !== -1) return Number.MAX_SAFE_INTEGER - last.length + lastIndex;
    const index = order.indexOf(key);
    return index === -1 ? Number.MAX_SAFE_INTEGER - last.length - 1 : index;
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

/** Where the loaded rows sit: the groups in render order and each group's row keys. */
export interface GroupLayout {
  readonly order: readonly string[];
  readonly keysByGroup: ReadonlyMap<string, readonly string[]>;
  readonly groupOfRow: ReadonlyMap<string, string>;
}

export function groupLayout<T>(
  groups: readonly ObjectListGroupData<T>[],
  getKey: (item: T) => string,
): GroupLayout {
  const keysByGroup = new Map<string, readonly string[]>();
  const groupOfRow = new Map<string, string>();
  for (const group of groups) {
    const keys = group.items.map(getKey);
    keysByGroup.set(group.meta.key, keys);
    for (const key of keys) groupOfRow.set(key, group.meta.key);
  }
  return { order: groups.map((group) => group.meta.key), keysByGroup, groupOfRow };
}

/**
 * Focus targets for a row that stayed in the list but moved to another group (Mark done): the row
 * now at its former index in its former group, then the toggle of the next group after the former
 * one that is still rendered. Null when the row did not move between groups.
 */
export function movedRowTargets(
  previous: GroupLayout | null,
  current: GroupLayout | null,
  rowKey: string,
): { readonly rowKeys: readonly string[]; readonly toggleKeys: readonly string[] } | null {
  const from = previous?.groupOfRow.get(rowKey);
  const to = current?.groupOfRow.get(rowKey);
  if (!previous || !current || from === undefined || to === undefined || to === from) return null;
  const formerKeys = previous.keysByGroup.get(from) as readonly string[];
  const index = formerKeys.indexOf(rowKey);
  // The row has left its former group, so the row after it now sits at its index.
  const sameIndex = (current.keysByGroup.get(from) ?? [])[index];
  const rendered = new Set(current.order);
  const toggleKey = previous.order
    .slice(previous.order.indexOf(from) + 1)
    .find((key) => rendered.has(key));
  return {
    rowKeys: sameIndex === undefined ? [] : [sameIndex],
    toggleKeys: toggleKey === undefined ? [] : [toggleKey],
  };
}
