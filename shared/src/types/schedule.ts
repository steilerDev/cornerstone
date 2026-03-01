/**
 * Scheduling engine types — used by both server (engine output) and client (display).
 * The scheduling endpoint is read-only: it returns the proposed schedule without persisting changes.
 * EPIC-06: Story 6.2 — Scheduling Engine (CPM, Auto-Schedule, Conflict Detection)
 */

/**
 * Request body for POST /api/schedule.
 */
export interface ScheduleRequest {
  mode: 'full' | 'cascade';
  /** Required when mode is 'cascade'. Ignored when mode is 'full'. */
  anchorWorkItemId?: string | null;
}

/**
 * Response from POST /api/schedule.
 */
export interface ScheduleResponse {
  /** CPM-scheduled items with ES/EF/LS/LF dates and float values. */
  scheduledItems: ScheduledItem[];
  /** Work item IDs on the critical path (zero float), in topological order. */
  criticalPath: string[];
  /** Non-fatal warnings generated during scheduling. */
  warnings: ScheduleWarning[];
}

/**
 * A single work item as computed by the CPM scheduling engine.
 */
export interface ScheduledItem {
  workItemId: string;
  /** The current start_date value before scheduling (null if unset). */
  previousStartDate: string | null;
  /** The current end_date value before scheduling (null if unset). */
  previousEndDate: string | null;
  /** Earliest start date (ES) — ISO 8601 YYYY-MM-DD. */
  scheduledStartDate: string;
  /** Earliest finish date (EF) — ISO 8601 YYYY-MM-DD. */
  scheduledEndDate: string;
  /** Latest start date (LS) — ISO 8601 YYYY-MM-DD. */
  latestStartDate: string;
  /** Latest finish date (LF) — ISO 8601 YYYY-MM-DD. */
  latestFinishDate: string;
  /** Total float in days: LS - ES. Zero means the item is on the critical path. */
  totalFloat: number;
  /** true if this item is on the critical path (totalFloat === 0). */
  isCritical: boolean;
  /**
   * true when the item's CPM-computed dates were clamped to today by Rules 2/3.
   * Rule 2: not_started item's start was floored to today (start was in the past).
   * Rule 3: in_progress item's end was floored to today (end was in the past).
   * false when no clamping occurred or when actual dates are set (Rule 1 overrides).
   */
  isLate: boolean;
}

/**
 * Warning types emitted by the scheduling engine.
 */
export type ScheduleWarningType = 'start_before_violated' | 'no_duration' | 'already_completed';

/**
 * A non-fatal warning produced during scheduling.
 */
export interface ScheduleWarning {
  workItemId: string;
  type: ScheduleWarningType;
  message: string;
}
