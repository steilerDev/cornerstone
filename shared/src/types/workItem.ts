/**
 * Work item-related types and interfaces.
 * Work items are the central entity of the application - construction tasks/work items.
 */

import type { TagResponse } from './tag.js';
import type { SubtaskResponse } from './subtask.js';
import type { DependencyType } from './dependency.js';
import type { PaginatedResponse } from './pagination.js';
import type { WorkItemBudgetLine } from './workItemBudget.js';

/**
 * Work item status enum.
 * EPIC-07: 'blocked' removed — status simplification (Issue #296).
 */
export type WorkItemStatus = 'not_started' | 'in_progress' | 'completed';

/**
 * User summary shape used in work item responses.
 */
export interface UserSummary {
  id: string;
  displayName: string;
  email: string;
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
 * Work item summary (used in list responses and dependencies).
 */
export interface WorkItemSummary {
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
  tags: TagResponse[];
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
export interface WorkItemDetail {
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
  tags: TagResponse[];
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
  tagIds?: string[];
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
  tagIds?: string[];
}

/**
 * Query parameters for GET /api/work-items (list with filtering, sorting, pagination).
 */
export interface WorkItemListQuery {
  page?: number;
  pageSize?: number;
  status?: WorkItemStatus;
  assignedUserId?: string;
  tagId?: string;
  q?: string;
  sortBy?: 'title' | 'status' | 'start_date' | 'end_date' | 'created_at' | 'updated_at';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Response for GET /api/work-items - paginated list of work items.
 */
export type WorkItemListResponse = PaginatedResponse<WorkItemSummary>;

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
