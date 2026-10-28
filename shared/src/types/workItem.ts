/**
 * Work item-related types and interfaces.
 * Work items are the central entity of the application - construction tasks/work items.
 */

import type { SubtaskResponse } from './subtask.js';
import type { DependencyType } from './dependency.js';
import type { PaginationMeta } from './pagination.js';
import type { WorkItemBudgetLine } from './workItemBudget.js';
import type { AreaSummary } from './area.js';
import type { TradeSummary } from './trade.js';
import type { FilterMeta } from './filterMeta.js';
import type { ItemGrantChip } from './subsidyProgram.js';
import type { AttentionHoldsUp } from './attention.js';

/**
 * Work item status enum.
 * EPIC-07: 'blocked' removed — status simplification (Issue #296).
 */
export const WORK_ITEM_STATUSES = ['not_started', 'in_progress', 'completed'] as const;
export type WorkItemStatus = (typeof WORK_ITEM_STATUSES)[number];

/**
 * User summary shape used in work item responses.
 */
export interface UserSummary {
  id: string;
  displayName: string;
  email: string;
}

/**
 * Vendor summary shape used in work item responses.
 */
export interface VendorSummary {
  id: string;
  name: string;
  trade: TradeSummary | null;
}

/**
 * Work item entity as stored in the database.
 */
export interface WorkItem {
  id: string;
  title: string;
  description: string | null;
  status: WorkItemStatus;
  startDate: string | null;
  endDate: string | null;
  /** Actual start date recorded when work began (YYYY-MM-DD). Set automatically on status transition. */
  actualStartDate: string | null;
  /** Actual end date recorded when work completed (YYYY-MM-DD). Set automatically on status transition. */
  actualEndDate: string | null;
  durationDays: number | null;
  startAfter: string | null;
  startBefore: string | null;
  assignedUserId: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Read-time schedule projection (contract 4, #2199). startDate/endDate of the host type are the
 * PLANNED dates (stored, never floored to today); these fields are the forecast.
 */
export interface WorkItemScheduleFields {
  /** Forecast start: equals startDate unless the item is late or held up (or undated). */
  projectedStartDate: string | null;
  /** Forecast end: equals endDate unless the item is late or held up (or undated). */
  projectedEndDate: string | null;
  /** The today floor moved this item itself (not started and planned start passed, or in progress and planned end passed without an actual end). Never true when completed or undated. */
  isLate: boolean;
  /** Days between the planned and forecast date of the late edge (start when not started, end when in progress). Non-null (>= 1) exactly when isLate. */
  lateDays: number | null;
  /** Not late itself, but its forecast moved because an unfinished predecessor is late. */
  isHeldUp: boolean;
}

/**
 * Work item summary (used in list responses and dependencies).
 */
export interface WorkItemSummary extends WorkItemScheduleFields {
  id: string;
  title: string;
  status: WorkItemStatus;
  startDate: string | null;
  endDate: string | null;
  /** Actual start date (YYYY-MM-DD) — set automatically on status transition or manually. */
  actualStartDate: string | null;
  /** Actual end date (YYYY-MM-DD) — set automatically on status transition or manually. */
  actualEndDate: string | null;
  durationDays: number | null;
  assignedUser: UserSummary | null;
  assignedVendor: VendorSummary | null;
  area: AreaSummary | null;
  budgetLineCount: number;
  /** Always sent on GET list rows (rejected grants excluded, by name); absent elsewhere. */
  grants?: ItemGrantChip[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Dependency response shape (used in work item detail).
 * EPIC-06: Added leadLagDays for scheduling offset support.
 */
export interface DependencyResponse {
  workItem: WorkItemSummary;
  dependencyType: DependencyType;
  leadLagDays: number;
}

/**
 * Work item detail (used in single-item responses).
 */
export interface WorkItemDetail extends WorkItemScheduleFields {
  id: string;
  title: string;
  description: string | null;
  status: WorkItemStatus;
  startDate: string | null;
  endDate: string | null;
  /** Actual start date (YYYY-MM-DD) — set automatically on status transition or manually. */
  actualStartDate: string | null;
  /** Actual end date (YYYY-MM-DD) — set automatically on status transition or manually. */
  actualEndDate: string | null;
  durationDays: number | null;
  startAfter: string | null;
  startBefore: string | null;
  assignedUser: UserSummary | null;
  createdBy: UserSummary | null;
  assignedVendor: VendorSummary | null;
  area: AreaSummary | null;
  subtasks: SubtaskResponse[];
  dependencies: {
    predecessors: DependencyResponse[];
    successors: DependencyResponse[];
  };
  // EPIC-05 Story 5.9: budget lines (replaces old flat budget fields)
  budgets: WorkItemBudgetLine[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Request body for creating a new work item.
 */
export interface CreateWorkItemRequest {
  title: string;
  description?: string | null;
  status?: WorkItemStatus;
  startDate?: string | null;
  endDate?: string | null;
  /** Manually override actual start date (YYYY-MM-DD). */
  actualStartDate?: string | null;
  /** Manually override actual end date (YYYY-MM-DD). */
  actualEndDate?: string | null;
  durationDays?: number | null;
  startAfter?: string | null;
  startBefore?: string | null;
  assignedUserId?: string | null;
  assignedVendorId?: string | null;
  areaId?: string | null;
}

/**
 * Request body for updating a work item.
 * All fields are optional; at least one must be provided.
 */
export interface UpdateWorkItemRequest {
  title?: string;
  description?: string | null;
  status?: WorkItemStatus;
  startDate?: string | null;
  endDate?: string | null;
  /** Manually override actual start date (YYYY-MM-DD). Explicit value prevents auto-population. */
  actualStartDate?: string | null;
  /** Manually override actual end date (YYYY-MM-DD). Explicit value prevents auto-population. */
  actualEndDate?: string | null;
  durationDays?: number | null;
  startAfter?: string | null;
  startBefore?: string | null;
  assignedUserId?: string | null;
  assignedVendorId?: string | null;
  areaId?: string | null;
}

/** Time windows of the Tasks list, in display order. */
export const TASK_TIME_WINDOWS = ['late', 'this_week', 'next_two_weeks', 'later', 'done'] as const;
export type TaskTimeWindow = (typeof TASK_TIME_WINDOWS)[number];

/** Server-side groupings of GET /api/work-items. */
export const WORK_ITEM_LIST_GROUPS = ['time'] as const;
export type WorkItemListGroup = (typeof WORK_ITEM_LIST_GROUPS)[number];

/**
 * Query parameters for GET /api/work-items (list with filtering, sorting, pagination).
 */
export interface WorkItemListQuery {
  page?: number;
  pageSize?: number;
  status?: WorkItemStatus;
  assignedUserId?: string;
  assignedVendorId?: string;
  /**
   * Filter by area UUID or comma-separated list of area UUIDs.
   * For each supplied ID the server expands descendants server-side;
   * results are the union of all matching subtrees.
   * Use the sentinel value `__none__` to include items with no area assignment.
   * `__none__` can be combined with UUIDs (e.g., `__none__,kitchen-uuid`) for union.
   */
  areaId?: string;
  q?: string;
  budgetLinesMin?: number;
  budgetLinesMax?: number;
  /** YYYY-MM-DD, inclusive, applied to the shown start date (actual ?? forecast). */
  startDateFrom?: string;
  /** YYYY-MM-DD, inclusive, applied to the shown start date (actual ?? forecast). */
  startDateTo?: string;
  /** YYYY-MM-DD, inclusive, applied to the shown end date (actual ?? forecast). */
  endDateFrom?: string;
  /** YYYY-MM-DD, inclusive, applied to the shown end date (actual ?? forecast). */
  endDateTo?: string;
  /** Tasks that count toward this milestone (milestone_work_items); unknown id gives no rows. */
  milestoneId?: number;
  /** Comma-separated work item ids; narrows rows and pagination only (max 100 usable ids). */
  ids?: string;
  /** `time`: rows ordered by time window, with `groupCounts` in the response. */
  group?: WorkItemListGroup;
  sortBy?:
    'title' | 'status' | 'start_date' | 'end_date' | 'created_at' | 'updated_at' | 'expected_cost';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Response for GET /api/work-items - paginated list of work items with filter metadata.
 */
export interface WorkItemListResponse {
  items: WorkItemSummary[];
  pagination: PaginationMeta;
  filterMeta?: FilterMeta;
}

/** The unfinished predecessor a task waits for, plus how many more it waits for. */
export interface WorkItemWaitsFor {
  id: string;
  title: string;
  more: number;
}

/** A row of GET /api/work-items (list only; other responses keep WorkItemSummary). */
export interface WorkItemListRow extends WorkItemSummary {
  grants: ItemGrantChip[];
  /** Expected cost in major units; null when the task has no budget lines. */
  expectedCost: number | null;
  timeWindow: TaskTimeWindow;
  isCritical: boolean;
  waitsFor: WorkItemWaitsFor | null;
  holdsUp: AttentionHoldsUp | null;
}

export interface WorkItemListRowsResponse extends WorkItemListResponse {
  items: WorkItemListRow[];
  /** Present only with group=time: every window key, rows matching the query (ignores ids). */
  groupCounts?: Record<TaskTimeWindow, number>;
  /** Rows matching only `status` (the chip): the heading's "of m". Ignores ids. */
  scopeTotal: number;
}

/**
 * Response for GET /api/work-items/:id/dependencies.
 */
export interface WorkItemDependenciesResponse {
  predecessors: DependencyResponse[];
  successors: DependencyResponse[];
}

/**
 * Compact milestone shape used in work item milestone responses.
 * EPIC-06 UAT Fix 4: Bidirectional milestone-work item dependency tracking.
 */
export interface MilestoneSummaryForWorkItem {
  id: number;
  name: string;
  targetDate: string | null;
}

/**
 * Response for GET /api/work-items/:id/milestones.
 * EPIC-06 UAT Fix 4: Bidirectional milestone-work item dependency tracking.
 */
export interface WorkItemMilestones {
  /** Milestones this work item depends on (must complete before work item can start). */
  required: MilestoneSummaryForWorkItem[];
  /** Milestones this work item contributes to (linked milestones). */
  linked: MilestoneSummaryForWorkItem[];
}

/** Company on the task page: carries the company phone for the strip's Call button (#2248). */
export interface WorkItemPageVendor extends VendorSummary {
  phone: string | null;
}

/**
 * GET /api/work-items/:id only (#2248): the detail plus the task page's figures, computed by the
 * same helper as the Tasks list rows (one definition per figure).
 */
export interface WorkItemPageDetail extends Omit<WorkItemDetail, 'assignedVendor'> {
  assignedVendor: WorkItemPageVendor | null;
  /** Expected cost in major units; null when the task has no cost lines. */
  expectedCost: number | null;
  /** Rejected grants excluded, by name (same as list rows). */
  grants: ItemGrantChip[];
  waitsFor: WorkItemWaitsFor | null;
  /** computeHoldsUp; null when completed or count 0. */
  holdsUp: AttentionHoldsUp | null;
}
