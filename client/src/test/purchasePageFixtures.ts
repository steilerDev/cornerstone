/** Synthetic purchase page fixtures (#2249): a HouseholdItemPageDetail and its dependency rows. */
import type {
  HouseholdItemDepDetail,
  HouseholdItemPageDetail,
  HouseholdItemSummary,
} from '@cornerstone/shared';

const STAMP = '2026-01-01T00:00:00.000Z';

/** A planned, undated purchase with no relations; override what a test needs. */
export function makePurchasePage(
  over: Partial<HouseholdItemPageDetail> = {},
): HouseholdItemPageDetail {
  return {
    id: 'hi-1',
    name: 'Sample sofa',
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
    budgetSummary: { totalPlanned: 0, totalActual: 0, subsidyReduction: 0, netCost: 0 },
    createdBy: null,
    createdAt: STAMP,
    updatedAt: STAMP,
    dependencies: [],
    subsidies: [],
    categoryEntry: { id: 'hic-furniture', name: 'Furniture', translationKey: null },
    budgets: [],
    expectedCost: null,
    grants: [],
    waitsFor: null,
    ...over,
  } as HouseholdItemPageDetail;
}

/** A dependency row (a task by default) for the Waits for list. */
export function makePurchaseDep(
  id: string,
  over: Partial<Omit<HouseholdItemDepDetail, 'predecessor'>> & {
    predecessor?: Partial<HouseholdItemDepDetail['predecessor']>;
  } = {},
): HouseholdItemDepDetail {
  const { predecessor, ...rest } = over;
  return {
    householdItemId: 'hi-1',
    predecessorType: 'work_item',
    predecessorId: id,
    predecessor: {
      id,
      title: `Task ${id}`,
      status: 'in_progress',
      endDate: null,
      area: null,
      ...predecessor,
    },
    ...rest,
  };
}

export type PurchaseDates = Pick<
  HouseholdItemSummary,
  | 'orderDate'
  | 'actualDeliveryDate'
  | 'earliestDeliveryDate'
  | 'latestDeliveryDate'
  | 'targetDeliveryDate'
>;
