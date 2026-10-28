import type {
  HouseholdItemCategoryEntity,
  HouseholdItemListRow,
  HouseholdItemListRowsResponse,
  HouseholdItemStatus,
} from '@cornerstone/shared';
import { HOUSEHOLD_ITEM_STATUSES } from '@cornerstone/shared';

/** Synthetic fixtures for the Purchases list tests (no real names, addresses or amounts). */

export const FURNITURE: HouseholdItemCategoryEntity = {
  id: 'hic-furniture',
  name: 'Furniture',
  color: null,
  translationKey: null,
  sortOrder: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

export const APPLIANCES: HouseholdItemCategoryEntity = {
  ...FURNITURE,
  id: 'hic-appliances',
  name: 'Appliances',
  sortOrder: 1,
};

export function makePurchaseRow(
  overrides: Partial<HouseholdItemListRow> = {},
): HouseholdItemListRow {
  return {
    id: 'hi-1',
    name: 'Living room sofa',
    description: null,
    category: 'hic-furniture',
    status: 'planned',
    vendor: null,
    area: null,
    quantity: 1,
    orderDate: null,
    actualDeliveryDate: null,
    earliestDeliveryDate: null,
    latestDeliveryDate: null,
    targetDeliveryDate: null,
    isLate: false,
    url: null,
    budgetLineCount: 0,
    totalPlannedAmount: 0,
    budgetSummary: {
      totalPlanned: 0,
      totalActual: 0,
      subsidyReduction: 0,
      netCost: 0,
    },
    createdBy: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    grants: [],
    expectedCost: null,
    afterGrants: null,
    paid: 0,
    ...overrides,
  };
}

/** The rows response; groupCounts are counted from the rows when `group` is set. */
export function makePurchaseResponse(
  items: HouseholdItemListRow[],
  overrides: Partial<HouseholdItemListRowsResponse> & { group?: boolean } = {},
): HouseholdItemListRowsResponse {
  const { group = true, ...rest } = overrides;
  const groupCounts = Object.fromEntries(HOUSEHOLD_ITEM_STATUSES.map((s) => [s, 0])) as Record<
    HouseholdItemStatus,
    number
  >;
  for (const item of items) groupCounts[item.status] += 1;
  return {
    items,
    pagination: { page: 1, pageSize: 100, totalItems: items.length, totalPages: 1 },
    ...(group ? { groupCounts } : {}),
    scopeTotal: items.length,
    totals: { expectedCost: 0, invoiced: 0, paid: 0 },
    ...rest,
  };
}
