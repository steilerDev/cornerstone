/**
 * Synthetic `GET /api/timeline` payload builders for the Schedule page E2E specs (#2198).
 *
 * Every builder fills ALL non-optional fields of the shared timeline types so a mocked response
 * never crashes the page for a missing field (e.g. milestone `projectedDate`). Typed against
 * `@cornerstone/shared`, so a new required field breaks compilation here instead of the browser.
 */

import type {
  TimelineDependency,
  TimelineHouseholdItem,
  TimelineMilestone,
  TimelineResponse,
  TimelineWorkItem,
} from '@cornerstone/shared';

/** Local (not UTC) YYYY-MM-DD, so "today"/"day N of this month" match the browser's calendar. */
export function isoLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Day `day` of the current month (1-based; values past the month end roll into the next one). */
export function dayOfCurrentMonth(day: number): string {
  const now = new Date();
  return isoLocal(new Date(now.getFullYear(), now.getMonth(), day));
}

/** Offset (in days) from today. */
export function daysFromToday(offset: number): string {
  const now = new Date();
  return isoLocal(new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset));
}

export function mockWorkItem(
  overrides: Partial<TimelineWorkItem> & Pick<TimelineWorkItem, 'id' | 'title'>,
): TimelineWorkItem {
  return {
    status: 'in_progress',
    startDate: null,
    endDate: null,
    actualStartDate: null,
    actualEndDate: null,
    durationDays: null,
    startAfter: null,
    startBefore: null,
    assignedUser: null,
    assignedVendor: null,
    area: null,
    requiredMilestoneIds: [],
    ...overrides,
  };
}

export function mockMilestone(
  overrides: Partial<TimelineMilestone> & Pick<TimelineMilestone, 'id' | 'title' | 'targetDate'>,
): TimelineMilestone {
  return {
    isCompleted: false,
    completedAt: null,
    color: null,
    workItemIds: [],
    projectedDate: null,
    isCritical: false,
    ...overrides,
  };
}

export function mockPurchase(
  overrides: Partial<TimelineHouseholdItem> & Pick<TimelineHouseholdItem, 'id' | 'name'>,
): TimelineHouseholdItem {
  return {
    category: 'furniture',
    status: 'purchased',
    targetDeliveryDate: null,
    earliestDeliveryDate: null,
    latestDeliveryDate: null,
    actualDeliveryDate: null,
    area: null,
    isLate: false,
    dependencyIds: [],
    ...overrides,
  };
}

export function mockDependency(predecessorId: string, successorId: string): TimelineDependency {
  return {
    predecessorId,
    successorId,
    dependencyType: 'finish_to_start',
    leadLagDays: 0,
  };
}

/** A complete timeline response; anything not given is empty. */
export function buildTimeline(parts: Partial<TimelineResponse> = {}): TimelineResponse {
  const workItems = parts.workItems ?? [];
  const dates = workItems.flatMap((w) => [w.startDate, w.endDate]).filter((d): d is string => !!d);
  const sorted = [...dates].sort();
  return {
    workItems,
    dependencies: parts.dependencies ?? [],
    milestones: parts.milestones ?? [],
    householdItems: parts.householdItems ?? [],
    criticalPath: parts.criticalPath ?? [],
    dateRange:
      parts.dateRange !== undefined
        ? parts.dateRange
        : sorted.length > 0
          ? { earliest: sorted[0]!, latest: sorted[sorted.length - 1]! }
          : null,
  };
}
