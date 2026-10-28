import { HOUSEHOLD_ITEM_STATUSES } from '@cornerstone/shared';
import type { HouseholdItemListQuery, HouseholdItemListSort } from '@cornerstone/shared';
import { parseDateRange, parseNumberRange } from '../../components/ObjectList/rangeParams.js';
import type { ObjectListQuery } from '../../components/ObjectList/types.js';

/** The server sorts the Purchases list accepts from the sort control. */
export const PURCHASE_SORTS = [
  'name',
  'status',
  'category',
  'delivery',
  'target_delivery_date',
  'actual_delivery_date',
  'order_date',
  'expected_cost',
  'invoiced',
] as const satisfies readonly HouseholdItemListSort[];
export type PurchaseSort = (typeof PURCHASE_SORTS)[number];

export const PURCHASE_DEFAULT_SORT: PurchaseSort = 'name';

/** The Filters panel params of the Purchases list, in panel order. */
export const PURCHASE_FILTER_PARAMS = [
  'category',
  'areaId',
  'vendorId',
  'targetDelivery',
  'actualDelivery',
  'plannedCost',
  'actualCost',
  'grants',
  'afterGrants',
  'budgetLines',
] as const;

/** The area / company group key and the area filter sentinel for "no area" / "no company". */
export const NONE_KEY = '__none__';

/**
 * Stored column keys of the DataTable this list replaced → the new key (null drops it). Name and
 * Status are always shown now; Actual cost is the same number as Invoiced, which follows its own
 * default.
 */
export const PURCHASE_LEGACY_COLUMN_KEYS: Readonly<Record<string, string | null>> = {
  name: null,
  status: null,
  vendor: 'company',
  plannedCost: 'expectedCost',
  targetDelivery: 'delivery',
  actualDelivery: 'delivery',
  actualCost: null,
  subsidyReduction: 'grants',
  netCost: 'afterGrants',
  budgetLines: 'costLines',
};

function isPurchaseSort(value: string): value is PurchaseSort {
  return (PURCHASE_SORTS as readonly string[]).includes(value);
}

function isPurchaseStatus(value: string): value is (typeof HOUSEHOLD_ITEM_STATUSES)[number] {
  return (HOUSEHOLD_ITEM_STATUSES as readonly string[]).includes(value);
}

/** A whole number of at least 0 (the cost-lines bounds are counts). */
function isCount(value: number | null): value is number {
  return value !== null && Number.isInteger(value) && value >= 0;
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

type MoneyBound =
  | 'expectedCostMin'
  | 'expectedCostMax'
  | 'actualCostMin'
  | 'actualCostMax'
  | 'grantsMin'
  | 'grantsMax'
  | 'afterGrantsMin'
  | 'afterGrantsMax';

/** Copies the valid sides of a `min:…,max:…` filter value onto the two API bounds. */
function setMoneyRange(
  params: Mutable<HouseholdItemListQuery>,
  raw: string | undefined,
  minKey: MoneyBound,
  maxKey: MoneyBound,
): void {
  const range = parseNumberRange(raw ?? null);
  if (range?.min !== null && range?.min !== undefined) params[minKey] = range.min;
  if (range?.max !== null && range?.max !== undefined) params[maxKey] = range.max;
}

/**
 * The list query as API params: chip, search, sort, the status grouping and the filters. Never
 * includes page or pageSize. A legacy comma-separated `category` uses its first id; a
 * non-integer cost-lines bound is omitted.
 */
export function purchasesListApiParams(query: ObjectListQuery): HouseholdItemListQuery {
  const params: Mutable<HouseholdItemListQuery> = {};
  if (query.q) params.q = query.q;
  if (isPurchaseStatus(query.chip)) params.status = query.chip;
  if (query.serverGroup === 'status') params.group = 'status';
  params.sortBy = isPurchaseSort(query.sortBy) ? query.sortBy : PURCHASE_DEFAULT_SORT;
  params.sortOrder = query.sortOrder;

  const { filters } = query;
  const category = filters.category?.split(',')[0];
  if (category) params.category = category;
  const area = filters.areaId?.split(',')[0];
  if (area) params.areaId = area;
  if (filters.vendorId) params.vendorId = filters.vendorId;

  const target = parseDateRange(filters.targetDelivery ?? null);
  if (target?.from) params.targetDeliveryFrom = target.from;
  if (target?.to) params.targetDeliveryTo = target.to;
  const actual = parseDateRange(filters.actualDelivery ?? null);
  if (actual?.from) params.actualDeliveryFrom = actual.from;
  if (actual?.to) params.actualDeliveryTo = actual.to;

  setMoneyRange(params, filters.plannedCost, 'expectedCostMin', 'expectedCostMax');
  setMoneyRange(params, filters.actualCost, 'actualCostMin', 'actualCostMax');
  setMoneyRange(params, filters.grants, 'grantsMin', 'grantsMax');
  setMoneyRange(params, filters.afterGrants, 'afterGrantsMin', 'afterGrantsMax');

  const lines = parseNumberRange(filters.budgetLines ?? null);
  if (lines && isCount(lines.min)) params.budgetLinesMin = lines.min;
  if (lines && isCount(lines.max)) params.budgetLinesMax = lines.max;
  return params;
}
