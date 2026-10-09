/**
 * Milestone-related types and interfaces.
 * Milestones represent major project progress points on the construction timeline.
 * EPIC-06: Timeline, Gantt Chart & Dependency Management
 */

import type { UserSummary, WorkItemSummary } from './workItem.js';

/**
 * Display status of a milestone (glossary v1): derived from isCompleted and the projected
 * date (isLate / isEarly, story 0.8); never stored. 'Pending' and 'Delayed' are retired.
 * Runtime source of truth for the union — add new members here; the i18n parity guard in `client/src/i18n/unionKeys.test.ts` then requires a locale key (#2029).
 */
export const MILESTONE_DISPLAY_STATUSES = ['upcoming', 'late', 'early', 'reached'] as const;

/** A milestone's derived display status. */
export type MilestoneDisplayStatus = (typeof MILESTONE_DISPLAY_STATUSES)[number];

/**
 * Milestone summary shape — used in list responses.
 * Includes a computed workItemCount instead of full work item details.
 */
export interface MilestoneSummary {
  id: number;
  title: string;
  description: string | null;
  targetDate: string; // ISO 8601 date (YYYY-MM-DD)
  isCompleted: boolean;
  completedAt: string | null; // ISO 8601 timestamp
  color: string | null;
  workItemCount: number; // Computed: count of linked (contributing) work items
  dependentWorkItemCount: number; // Computed: count of work items that depend on this milestone
  createdBy: UserSummary | null;
  createdAt: string; // ISO 8601 timestamp
  updatedAt: string; // ISO 8601 timestamp
}

/**
 * Compact work item shape used in milestone detail responses for dependent work items.
 * EPIC-06 UAT Fix 4: Bidirectional milestone-work item dependency tracking.
 */
export interface WorkItemDependentSummary {
  id: string;
  title: string;
}

/**
 * Milestone detail shape — used in single-item responses.
 * Includes the full WorkItemSummary list for linked work items.
 */
export interface MilestoneDetail {
  id: number;
  title: string;
  description: string | null;
  targetDate: string; // ISO 8601 date (YYYY-MM-DD)
  isCompleted: boolean;
  completedAt: string | null; // ISO 8601 timestamp
  color: string | null;
  workItems: WorkItemSummary[]; // Linked work items (full summary)
  /** Work items that depend on this milestone completing before they can start. */
  dependentWorkItems: WorkItemDependentSummary[]; // EPIC-06 UAT Fix 4
  createdBy: UserSummary | null;
  createdAt: string; // ISO 8601 timestamp
  updatedAt: string; // ISO 8601 timestamp
}

/**
 * Request body for creating a new milestone.
 */
export interface CreateMilestoneRequest {
  title: string;
  description?: string | null;
  targetDate: string; // ISO 8601 date (YYYY-MM-DD)
  color?: string | null; // Hex color code e.g. "#EF4444"
  /** Optional list of work item UUIDs to link to the milestone on creation. */
  workItemIds?: string[];
}

/**
 * Request body for updating a milestone.
 * All fields are optional; at least one must be provided.
 */
export interface UpdateMilestoneRequest {
  title?: string;
  description?: string | null;
  targetDate?: string; // ISO 8601 date (YYYY-MM-DD)
  isCompleted?: boolean;
  completedAt?: string | null; // ISO 8601 date (YYYY-MM-DD) — overrides auto-set when isCompleted is true
  color?: string | null;
}

/**
 * Response for GET /api/milestones — list of milestone summaries.
 */
export interface MilestoneListResponse {
  milestones: MilestoneSummary[];
}

/**
 * Request body for POST /api/milestones/:id/work-items — link a work item.
 */
export interface LinkWorkItemRequest {
  workItemId: string;
}

/**
 * Response for POST /api/milestones/:id/work-items — created link.
 */
export interface MilestoneWorkItemLinkResponse {
  milestoneId: number;
  workItemId: string;
}
