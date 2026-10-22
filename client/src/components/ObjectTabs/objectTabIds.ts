/**
 * The fixed tab vocabulary of an object page (#2233), in canonical order. The ids are the
 * `?tab=` values declared by the route map (`diary`, not `site-diary`). Pure data: no imports
 * beyond types, because `i18n/unionKeys.ts` iterates it.
 */
export const OBJECT_TAB_IDS = [
  'overview',
  'timing',
  'work',
  'cost',
  'payments',
  'diary',
  'history',
] as const;

export type ObjectTabId = (typeof OBJECT_TAB_IDS)[number];

/** Tabs whose label carries a count: "Cost (3)". */
export const COUNTED_OBJECT_TABS = [
  'cost',
  'payments',
  'diary',
] as const satisfies readonly ObjectTabId[];

export type CountedObjectTabId = (typeof COUNTED_OBJECT_TABS)[number];

/** The given ids in canonical order, de-duplicated; a caller cannot reorder the tabs. */
export function orderObjectTabs(ids: readonly ObjectTabId[]): ObjectTabId[] {
  return OBJECT_TAB_IDS.filter((id) => ids.includes(id));
}

export function isObjectTabId(value: string | null): value is ObjectTabId {
  return value !== null && (OBJECT_TAB_IDS as readonly string[]).includes(value);
}

export function isCountedObjectTab(id: ObjectTabId): id is CountedObjectTabId {
  return (COUNTED_OBJECT_TABS as readonly string[]).includes(id);
}
