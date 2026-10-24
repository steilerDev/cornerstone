import { foldSearchText } from '@cornerstone/shared';

/** Lists with fewer rows than this have no search toolbar (PO ruling 9). */
export const REFERENCE_LIST_SEARCH_MIN_ROWS = 8;

/** Items whose name or description contains the folded query; an empty query returns all. */
export function filterReferenceItems<T extends { name: string; description?: string | null }>(
  items: readonly T[],
  query: string,
): readonly T[] {
  const needle = foldSearchText(query.trim());
  if (needle === '') return items;
  return items.filter(
    (item) =>
      foldSearchText(item.name).includes(needle) ||
      foldSearchText(item.description ?? '').includes(needle),
  );
}
