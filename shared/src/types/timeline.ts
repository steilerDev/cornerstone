/**
 * Timeline-related types for the aggregated Gantt chart / calendar endpoint.
 *
 * EPIC-06 Story 6.3 — Timeline Data API (GET /api/timeline)
 */

import type { WorkItemStatus, UserSummary } from './workItem.js';
import type { DependencyType } from './dependency.js';
import type { TagResponse } from './tag.js';

/**
 * A work item entry in the timeline response.
 * Contains only scheduling-relevant fields — no budget information.
 */
export interface TimelineWorkItem {
  id: string;
  title: string;
  status: WorkItemStatus;
  startDate: string | null;
  endDate: string | null;
  /** Actual start date (YYYY-MM-DD) for delay tracking visualization. */
  actualStartDate: string | null;
  /** Actual end date (YYYY-MM-DD) for delay tracking visualization. */
  actualEndDate: string | null;
  durationDays: number | null;
  /** Earliest start constraint (scheduling). */
  startAfter: string | null;
  /** Latest start constraint (scheduling). */
  startBefore: string | null;
  assignedUser: UserSummary | null;
  tags: TagResponse[];
  /**
   * IDs of milestones this work item depends on (must complete before WI can start).
   * EPIC-06 UAT Fix 4: Bidirectional milestone-work item dependency tracking.
   */
  requiredMilestoneIds?: number[];
}

/**
 * A dependency edge in the timeline response.
 */
export interface TimelineDependency {
  predecessorId: string;
  successorId: string;
  dependencyType: DependencyType;
  leadLagDays: number;
}

/**
 * A milestone entry in the timeline response.
 */
export interface TimelineMilestone {
  id: number;
  title: string;
  targetDate: string;
  isCompleted: boolean;
  /** ISO 8601 timestamp when completed, or null if not completed. */
  completedAt: string | null;
  color: string | null;
  /** IDs of work items linked to this milestone. */
  workItemIds: string[];
  /** Computed: latest end date among linked work items, or null if no linked items have dates. */
  projectedDate: string | null;
}

/**
 * The date range spanned by all returned work items.
 * Null when no work items have dates set.
 */
export interface TimelineDateRange {
  /** ISO 8601 date — minimum start date across all returned work items. */
  earliest: string;
  /** ISO 8601 date — maximum end date across all returned work items. */
  latest: string;
}

/**
 * Top-level response shape for GET /api/timeline.
 */
export interface TimelineResponse {
  workItems: TimelineWorkItem[];
  dependencies: TimelineDependency[];
  milestones: TimelineMilestone[];
  /** Work item IDs on the critical path (computed over the full dataset). */
  criticalPath: string[];
  /** Date range computed from the returned work items. Null when no work items have dates. */
  dateRange: TimelineDateRange | null;
}
