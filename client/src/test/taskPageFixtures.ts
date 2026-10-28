/** Synthetic task page fixtures (#2248): a WorkItemPageDetail and its dependency rows. */
import type { DependencyResponse, WorkItemPageDetail, WorkItemSummary } from '@cornerstone/shared';

const STAMP = '2026-01-01T00:00:00.000Z';

export function makeTaskSummary(id: string, over: Partial<WorkItemSummary> = {}): WorkItemSummary {
  return {
    id,
    title: `Task ${id}`,
    status: 'not_started',
    startDate: null,
    endDate: null,
    projectedStartDate: null,
    projectedEndDate: null,
    isLate: false,
    lateDays: null,
    isHeldUp: false,
    durationDays: null,
    actualStartDate: null,
    actualEndDate: null,
    assignedUser: null,
    assignedVendor: null,
    area: null,
    budgetLineCount: 0,
    createdAt: STAMP,
    updatedAt: STAMP,
    ...over,
  };
}

export function makeDependency(
  id: string,
  over: Partial<Omit<DependencyResponse, 'workItem'>> & {
    workItem?: Partial<WorkItemSummary>;
  } = {},
): DependencyResponse {
  const { workItem, ...rest } = over;
  return {
    workItem: makeTaskSummary(id, workItem),
    dependencyType: 'finish_to_start',
    leadLagDays: 0,
    ...rest,
  };
}

/** A not-started, undated task with no relations; override what a test needs. */
export function makeTaskPage(over: Partial<WorkItemPageDetail> = {}): WorkItemPageDetail {
  return {
    ...makeTaskSummary('wi-1', { title: 'Pour slab' }),
    description: null,
    startAfter: null,
    startBefore: null,
    createdBy: null,
    assignedVendor: null,
    subtasks: [],
    dependencies: { predecessors: [], successors: [] },
    budgets: [],
    expectedCost: null,
    grants: [],
    waitsFor: null,
    holdsUp: null,
    ...over,
  } as WorkItemPageDetail;
}
