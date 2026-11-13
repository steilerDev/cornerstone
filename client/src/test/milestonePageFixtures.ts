/** Synthetic milestone page fixtures (#2250): a MilestoneDetail and its list rows. */
import type { MilestoneDetail, WorkItemLinkedHouseholdItemSummary } from '@cornerstone/shared';

const STAMP = '2026-01-01T00:00:00.000Z';

/** An upcoming, unprojected milestone with no relations; override what a test needs. */
export function makeMilestoneDetail(over: Partial<MilestoneDetail> = {}): MilestoneDetail {
  return {
    id: 1,
    title: 'Sample milestone',
    description: null,
    targetDate: '2026-06-01',
    isCompleted: false,
    completedAt: null,
    color: null,
    workItems: [],
    dependentWorkItems: [],
    dependentHouseholdItems: [],
    projectedDate: null,
    createdBy: null,
    createdAt: STAMP,
    updatedAt: STAMP,
    ...over,
  };
}

/** A purchase that waits for the milestone. */
export function makeWaitingPurchase(
  id: string,
  over: Partial<WorkItemLinkedHouseholdItemSummary> = {},
): WorkItemLinkedHouseholdItemSummary {
  return {
    id,
    name: `Purchase ${id}`,
    category: 'hic-furniture',
    status: 'planned',
    targetDeliveryDate: null,
    earliestDeliveryDate: null,
    latestDeliveryDate: null,
    ...over,
  } as WorkItemLinkedHouseholdItemSummary;
}
