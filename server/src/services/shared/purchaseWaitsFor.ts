/**
 * The purchase page's "Waits for" figure (#2249): the first unfinished predecessor of a purchase
 * and how many more follow it. Pure; the caller supplies the completed milestone ids.
 */

import type { HouseholdItemDepDetail, PurchaseWaitsFor } from '@cornerstone/shared';

/**
 * Unfinished means a task that is not completed or a milestone outside `completedMilestoneIds`.
 * Order: end date descending (no end date last), then title, then id. Null when nothing waits.
 */
export function purchaseWaitsForOf(
  deps: readonly HouseholdItemDepDetail[],
  completedMilestoneIds: ReadonlySet<string>,
): PurchaseWaitsFor | null {
  const unfinished = deps.filter((dep) =>
    dep.predecessorType === 'work_item'
      ? dep.predecessor.status !== 'completed'
      : !completedMilestoneIds.has(dep.predecessorId),
  );
  const sorted = unfinished.sort((a, b) => {
    const endA = a.predecessor.endDate;
    const endB = b.predecessor.endDate;
    if (endA !== endB) {
      if (endA === null) return 1;
      if (endB === null) return -1;
      return endA < endB ? 1 : -1;
    }
    return (
      a.predecessor.title.localeCompare(b.predecessor.title) ||
      a.predecessorId.localeCompare(b.predecessorId)
    );
  });
  const [first] = sorted;
  if (!first) return null;
  return {
    type: first.predecessorType,
    id: first.predecessorId,
    title: first.predecessor.title,
    more: sorted.length - 1,
  };
}
