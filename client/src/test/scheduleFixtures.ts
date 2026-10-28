/** Synthetic timeline fixtures for the Schedule tests (#2247). */
import type {
  AreaSummary,
  TimelineHouseholdItem,
  TimelineMilestone,
  TimelineResponse,
  TimelineWorkItem,
} from '@cornerstone/shared';

export function makeArea(id: string, ancestors: string[] = []): AreaSummary {
  return {
    id,
    name: `Area ${id}`,
    color: null,
    ancestors: ancestors.map((a) => ({ id: a, name: `Area ${a}`, color: null })),
  };
}

export function makeTask(id: string, o: Partial<TimelineWorkItem> = {}): TimelineWorkItem {
  return {
    id,
    title: `Task ${id}`,
    status: 'not_started',
    startDate: '2026-03-02',
    endDate: '2026-03-06',
    actualStartDate: null,
    actualEndDate: null,
    durationDays: 4,
    startAfter: null,
    startBefore: null,
    assignedUser: null,
    assignedVendor: null,
    area: null,
    projectedStartDate: '2026-03-02',
    projectedEndDate: '2026-03-06',
    isLate: false,
    lateDays: null,
    isHeldUp: false,
    ...o,
  };
}

export function makeMilestone(id: number, o: Partial<TimelineMilestone> = {}): TimelineMilestone {
  return {
    id,
    title: `Milestone ${id}`,
    targetDate: '2026-03-20',
    isCompleted: false,
    completedAt: null,
    color: null,
    workItemIds: [],
    projectedDate: null,
    isLate: false,
    lateDays: null,
    isEarly: false,
    earlyDays: null,
    isCritical: false,
    ...o,
  };
}

export function makePurchase(
  id: string,
  o: Partial<TimelineHouseholdItem> = {},
): TimelineHouseholdItem {
  return {
    id,
    name: `Purchase ${id}`,
    category: 'furniture',
    status: 'planned',
    targetDeliveryDate: null,
    earliestDeliveryDate: null,
    latestDeliveryDate: null,
    actualDeliveryDate: null,
    area: null,
    isLate: false,
    dependencyIds: [],
    ...o,
  };
}

export function makeTimeline(o: Partial<TimelineResponse> = {}): TimelineResponse {
  return {
    workItems: [],
    dependencies: [],
    milestones: [],
    householdItems: [],
    criticalPath: [],
    dateRange: { earliest: '2026-03-01', latest: '2026-04-30' },
    holdsUp: { workItems: {}, milestones: {} },
    ...o,
  };
}
