import type {
  AreaSummary,
  TaskTimeWindow,
  WorkItemListRow,
  WorkItemListRowsResponse,
} from '@cornerstone/shared';
import { TASK_TIME_WINDOWS } from '@cornerstone/shared';

/** Synthetic fixtures for the Tasks list tests (no real names, addresses or amounts). */

export const KITCHEN: AreaSummary = {
  id: 'area-kitchen',
  name: 'Kitchen',
  color: null,
  ancestors: [
    { id: 'area-house', name: 'House', color: null },
    { id: 'area-ground', name: 'Ground floor', color: null },
  ],
};

export function makeTaskRow(overrides: Partial<WorkItemListRow> = {}): WorkItemListRow {
  return {
    id: 'wi-1',
    title: 'Tile the hallway',
    status: 'not_started',
    startDate: '2026-06-20',
    endDate: '2026-06-24',
    actualStartDate: null,
    actualEndDate: null,
    durationDays: 4,
    assignedUser: null,
    assignedVendor: null,
    area: null,
    budgetLineCount: 0,
    projectedStartDate: '2026-06-20',
    projectedEndDate: '2026-06-24',
    isLate: false,
    lateDays: null,
    isHeldUp: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    grants: [],
    expectedCost: null,
    timeWindow: 'this_week',
    isCritical: false,
    waitsFor: null,
    holdsUp: null,
    ...overrides,
  };
}

/** The rows response; groupCounts are counted from the rows when `group` is set. */
export function makeTaskResponse(
  items: WorkItemListRow[],
  overrides: Partial<WorkItemListRowsResponse> & { group?: boolean } = {},
): WorkItemListRowsResponse {
  const { group = true, ...rest } = overrides;
  const groupCounts = Object.fromEntries(TASK_TIME_WINDOWS.map((w) => [w, 0])) as Record<
    TaskTimeWindow,
    number
  >;
  for (const item of items) groupCounts[item.timeWindow] += 1;
  return {
    items,
    pagination: { page: 1, pageSize: 100, totalItems: items.length, totalPages: 1 },
    ...(group ? { groupCounts } : {}),
    scopeTotal: items.length,
    ...rest,
  };
}
