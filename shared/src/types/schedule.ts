/**
 * Scheduling engine types — used by both server (engine output) and client (display).
 * The scheduling endpoint is read-only: it returns the proposed schedule without persisting changes.
 * EPIC-06: Story 6.2 — Scheduling Engine (CPM, Auto-Schedule, Conflict Detection)
 */

/**
 * Derived schedule signals shown next to a task's or purchase's stored status (glossary v1:
 * Late · n d, Held up, Critical). Derived from isLate / isHeldUp / critical-path membership;
 * never stored. Purchases use only 'late'.
 * Runtime source of truth for the union — add new members here; the i18n parity guard in `client/src/i18n/unionKeys.test.ts` then requires a locale key (#2029).
 */
export const SCHEDULE_SIGNALS = ['late', 'held_up', 'critical'] as const;

/** A derived schedule signal. */
export type ScheduleSignal = (typeof SCHEDULE_SIGNALS)[number];

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
