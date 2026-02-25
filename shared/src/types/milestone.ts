/**
 * Milestone-related types and interfaces.
 * Milestones represent major project progress points on the construction timeline.
 * EPIC-06: Timeline, Gantt Chart & Dependency Management
 */

import type { UserSummary, WorkItemSummary } from './workItem.js';

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
  workItemCount: number; // Computed: count of linked work items
  createdBy: UserSummary | null;
  createdAt: string; // ISO 8601 timestamp
  updatedAt: string; // ISO 8601 timestamp
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
