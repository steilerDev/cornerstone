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
  const base: TimelineWorkItem = {
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
    projectedStartDate: null,
    projectedEndDate: null,
    isLate: false,
    lateDays: null,
    isHeldUp: false,
    ...overrides,
  };
  // Bars read the projected fields: by default the forecast equals the plan (#2199).
  return {
    ...base,
    projectedStartDate:
      overrides.projectedStartDate !== undefined ? overrides.projectedStartDate : base.startDate,
    projectedEndDate:
      overrides.projectedEndDate !== undefined ? overrides.projectedEndDate : base.endDate,
  };
}

export function mockMilestone(
  overrides: Partial<TimelineMilestone> & Pick<TimelineMilestone, 'id' | 'title' | 'targetDate'>,
): TimelineMilestone {
  const base: TimelineMilestone = {
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
    ...overrides,
  };
  // Derive late/early from projectedDate vs targetDate unless the caller set them (#2199).
  if (
    overrides.isLate !== undefined ||
    overrides.isEarly !== undefined ||
    base.isCompleted ||
    !base.projectedDate
  ) {
    return base;
  }
  const diff = Math.round(
    (Date.parse(base.projectedDate) - Date.parse(base.targetDate)) / 86_400_000,
  );
  return {
    ...base,
    isLate: diff > 0,
    lateDays: diff > 0 ? diff : null,
    isEarly: diff < 0,
    earlyDays: diff < 0 ? -diff : null,
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
  const dates = workItems
    .flatMap((w) => [w.startDate, w.endDate, w.projectedStartDate, w.projectedEndDate])
    .filter((d): d is string => !!d);
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
    // Holds-up counts (computeHoldsUp, #2232): only sent when a test gives them
    ...(parts.holdsUp ? { holdsUp: parts.holdsUp } : {}),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Schedule scenario (#2247)
// ─────────────────────────────────────────────────────────────────────────────

/** Ids of the synthetic Schedule scenario, so specs address rows without string literals. */
export const SCHEDULE_IDS = {
  foundation: 'sched-foundation',
  framing: 'sched-framing',
  roofing: 'sched-roofing',
  excavation: 'sched-excavation',
  milestone: 101,
  purchase: 'sched-island',
} as const;

const KITCHEN = { id: 'sched-area-kitchen', name: 'Kitchen', color: null, ancestors: [] };

/**
 * A small synthetic project around today:
 * - Foundation (in progress, critical, has a company with a phone) holds up Framing and the
 *   Kitchen island delivery;
 * - Framing (not started) waits for Foundation and for the "Shell complete" milestone;
 * - Roofing is late (planned dates earlier than the forecast: hatch + planned ghost), no area;
 * - Excavation is completed (hidden until Show › Done is on);
 * - the milestone counts Framing toward it.
 * The holds-up counts are given for the two tasks that hold something up.
 */
export function buildScheduleScenario(): TimelineResponse {
  const foundation = mockWorkItem({
    id: SCHEDULE_IDS.foundation,
    title: 'Sched Foundation',
    status: 'in_progress',
    startDate: daysFromToday(-8),
    endDate: daysFromToday(6),
    durationDays: 14,
    area: KITCHEN,
    assignedVendor: {
      id: 'sched-company',
      name: 'Sched Builders',
      trade: null,
      phone: '+49 30 1234567',
    },
  });
  const framing = mockWorkItem({
    id: SCHEDULE_IDS.framing,
    title: 'Sched Framing',
    status: 'not_started',
    startDate: daysFromToday(7),
    endDate: daysFromToday(14),
    durationDays: 7,
    area: { ...KITCHEN, id: 'sched-area-pantry', name: 'Pantry', ancestors: [KITCHEN] },
    requiredMilestoneIds: [SCHEDULE_IDS.milestone],
  });
  const roofing = mockWorkItem({
    id: SCHEDULE_IDS.roofing,
    title: 'Sched Roofing',
    status: 'in_progress',
    startDate: daysFromToday(-12),
    endDate: daysFromToday(-4),
    durationDays: 8,
    projectedStartDate: daysFromToday(-12),
    projectedEndDate: daysFromToday(2),
    isLate: true,
    lateDays: 6,
  });
  const excavation = mockWorkItem({
    id: SCHEDULE_IDS.excavation,
    title: 'Sched Excavation',
    status: 'completed',
    startDate: daysFromToday(-30),
    endDate: daysFromToday(-20),
    actualStartDate: daysFromToday(-30),
    actualEndDate: daysFromToday(-20),
    durationDays: 10,
  });
  return buildTimeline({
    workItems: [foundation, framing, roofing, excavation],
    dependencies: [mockDependency(SCHEDULE_IDS.foundation, SCHEDULE_IDS.framing)],
    milestones: [
      mockMilestone({
        id: SCHEDULE_IDS.milestone,
        title: 'Sched Shell complete',
        targetDate: daysFromToday(20),
        projectedDate: daysFromToday(20),
        workItemIds: [SCHEDULE_IDS.framing],
      }),
    ],
    householdItems: [
      mockPurchase({
        id: SCHEDULE_IDS.purchase,
        name: 'Sched Kitchen island',
        status: 'scheduled',
        targetDeliveryDate: daysFromToday(16),
        latestDeliveryDate: daysFromToday(16),
        earliestDeliveryDate: daysFromToday(16),
        area: KITCHEN,
        dependencyIds: [{ predecessorType: 'work_item', predecessorId: SCHEDULE_IDS.foundation }],
      }),
    ],
    criticalPath: [SCHEDULE_IDS.foundation],
    holdsUp: {
      workItems: {
        [SCHEDULE_IDS.foundation]: { count: 2, startingWithin14Days: 1 },
        [SCHEDULE_IDS.framing]: { count: 0, startingWithin14Days: 0 },
        [SCHEDULE_IDS.roofing]: { count: 0, startingWithin14Days: 0 },
        [SCHEDULE_IDS.excavation]: { count: 0, startingWithin14Days: 0 },
      },
      milestones: { [String(SCHEDULE_IDS.milestone)]: { count: 1, startingWithin14Days: 1 } },
    },
  });
}

/**
 * The scenario plus two far-apart tasks (about 200 days) so the chart is wider than any viewport
 * and can be scrolled sideways. The server's date range is kept, so toggles never change it.
 */
export function buildWideScheduleScenario(): TimelineResponse {
  const scenario = buildScheduleScenario();
  scenario.workItems.push(
    mockWorkItem({
      id: 'sched-far-past',
      title: 'Sched Far Past',
      status: 'not_started',
      startDate: daysFromToday(-100),
      endDate: daysFromToday(-96),
    }),
    mockWorkItem({
      id: 'sched-far-future',
      title: 'Sched Far Future',
      status: 'not_started',
      startDate: daysFromToday(100),
      endDate: daysFromToday(104),
    }),
  );
  scenario.dateRange = { earliest: daysFromToday(-100), latest: daysFromToday(104) };
  return scenario;
}
