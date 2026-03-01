import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import type { WorkItemStatus, DependencyType } from '@cornerstone/shared';
import styles from './GanttTooltip.module.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single entry in the work-item tooltip's Dependencies list. */
export interface GanttTooltipDependencyEntry {
  /** Title of the related (predecessor or successor) work item. */
  relatedTitle: string;
  /** The dependency relationship type. */
  dependencyType: DependencyType;
  /** Whether this item is a predecessor of, or successor to, the hovered work item. */
  role: 'predecessor' | 'successor';
}

export interface GanttTooltipWorkItemData {
  kind: 'work-item';
  title: string;
  status: WorkItemStatus;
  startDate: string | null;
  endDate: string | null;
  durationDays: number | null;
  assignedUserName: string | null;
  /**
   * Dependency relationships for this work item (predecessors and successors).
   * When absent or empty, no "Dependencies" section is rendered in the tooltip.
   */
  dependencies?: GanttTooltipDependencyEntry[];
  /**
   * @deprecated Delay indicator has been removed from work item tooltips.
   * Only milestones track late/delay status. Field retained for type compatibility.
   */
  delayDays?: number | null;
  /** User-set planned duration in days. Null if not explicitly set. */
  plannedDurationDays?: number | null;
  /** Computed actual/effective duration in days (from start/end dates). Null if not computable. */
  actualDurationDays?: number | null;
  /**
   * Work item ID used for the "View item" navigation link on touch devices.
   * When provided, a "View item" link to `/work-items/:workItemId` is rendered
   * in the tooltip on touch (pointer: coarse) devices.
   */
  workItemId?: string;
}

export interface GanttTooltipMilestoneData {
  kind: 'milestone';
  title: string;
  targetDate: string;
  /** Latest end date among linked work items, or null if unavailable. */
  projectedDate: string | null;
  isCompleted: boolean;
  /** True when not completed and projectedDate > targetDate. */
  isLate: boolean;
  completedAt: string | null;
  /** Work items directly linked to this milestone via milestone.workItemIds (contributing items). */
  linkedWorkItems: { id: string; title: string }[];
  /** Work items that depend on this milestone (have this milestone in their requiredMilestoneIds). */
  dependentWorkItems: { id: string; title: string }[];
  /**
   * Milestone ID used for the "View item" navigation link on touch devices.
   * When provided, a "View item" button is rendered in the tooltip on touch devices.
   * The click handler calls onMilestoneNavigate with the milestone ID.
   */
  milestoneId?: number;
}

export interface GanttTooltipArrowData {
  kind: 'arrow';
  /** Human-readable description of the dependency relationship. */
  description: string;
}

/**
 * Polymorphic tooltip data — discriminated by the `kind` field.
 */
export type GanttTooltipData =
  | GanttTooltipWorkItemData
  | GanttTooltipMilestoneData
  | GanttTooltipArrowData;

export interface GanttTooltipPosition {
  /** Mouse X in viewport coordinates. */
  x: number;
  /** Mouse Y in viewport coordinates. */
  y: number;
}

interface GanttTooltipProps {
  data: GanttTooltipData;
  position: GanttTooltipPosition;
  /** ID to apply to the tooltip element (for aria-describedby on the trigger). */
  id?: string;
  /**
   * When true, renders a "View item" link/button inside the tooltip.
   * Used on touch (pointer: coarse) devices where the two-tap pattern is active.
   * On desktop, this prop should be false so the action is not rendered.
   */
  isTouchDevice?: boolean;
  /**
   * Called when the "View item" action is tapped on a milestone tooltip.
   * Receives the milestone ID. Used on touch devices only.
   */
  onMilestoneNavigate?: (milestoneId: number) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<WorkItemStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
};

const STATUS_BADGE_CLASSES: Record<WorkItemStatus, string> = {
  not_started: styles.statusNotStarted,
  in_progress: styles.statusInProgress,
  completed: styles.statusCompleted,
};

const TOOLTIP_WIDTH = 240;
/**
 * Base height estimate for tooltip flip-logic. When the work-item tooltip has
 * visible dependencies, the actual rendered height will be larger — we add
 * 18px per dependency row on top of this base when computing the flip point.
 * Increased from 130 to 165 to account for planned/actual/variance duration rows.
 */
const TOOLTIP_HEIGHT_BASE = 165;
const TOOLTIP_HEIGHT_ESTIMATE = 200; // safe upper bound used for arrow/milestone tooltips
const OFFSET_X = 12;
const OFFSET_Y = 8;

const MAX_DEPS_SHOWN = 5;

function formatDisplayDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  // Input is YYYY-MM-DD; format to a readable form
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDuration(days: number | null): string {
  if (days === null) return '—';
  if (days === 1) return '1 day';
  return `${days} days`;
}

// ---------------------------------------------------------------------------
// Work item tooltip content
// ---------------------------------------------------------------------------

/** Human-readable labels for each dependency type. */
const DEPENDENCY_TYPE_LABELS: Record<DependencyType, string> = {
  finish_to_start: 'Finish-to-Start',
  start_to_start: 'Start-to-Start',
  finish_to_finish: 'Finish-to-Finish',
  start_to_finish: 'Start-to-Finish',
};

function WorkItemTooltipContent({
  data,
  isTouchDevice,
}: {
  data: GanttTooltipWorkItemData;
  isTouchDevice?: boolean;
}) {
  const dependencies = data.dependencies ?? [];
  const shownDeps = dependencies.slice(0, MAX_DEPS_SHOWN);
  const depsOverflowCount = dependencies.length - shownDeps.length;

  // Whether the duration section rendered a trailing separator.
  // Used to avoid a double separator when there is no owner row between the
  // variance section and the dependencies section.
  const hasBothDurations = data.plannedDurationDays != null && data.actualDurationDays != null;
  // A separator before dependencies is only needed when the last section before
  // dependencies did NOT already emit a trailing separator. The trailing separator
  // in the variance branch handles the case where there IS an owner row or dependencies
  // follow directly. We suppress it here by moving the separator responsibility to
  // the dependencies block and removing the trailing separator from the variance branch.
  const hasOwner = data.assignedUserName !== null;

  return (
    <>
      {/* Header: title + status badge */}
      <div className={styles.header}>
        <span className={styles.title}>{data.title}</span>
        <span className={`${styles.statusBadge} ${STATUS_BADGE_CLASSES[data.status]}`}>
          {STATUS_LABELS[data.status]}
        </span>
      </div>

      <div className={styles.separator} aria-hidden="true" />

      {/* Date range */}
      <div className={styles.detailRow}>
        <span className={styles.detailLabel}>Start</span>
        <span className={styles.detailValue}>{formatDisplayDate(data.startDate)}</span>
      </div>
      <div className={styles.detailRow}>
        <span className={styles.detailLabel}>End</span>
        <span className={styles.detailValue}>{formatDisplayDate(data.endDate)}</span>
      </div>

      {/* Duration section — planned/actual/variance when both available, single row fallback */}
      {hasBothDurations ? (
        <>
          <div className={styles.separator} aria-hidden="true" />
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Planned</span>
            <span className={styles.detailValue}>
              {formatDuration(data.plannedDurationDays ?? null)}
            </span>
          </div>
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Actual</span>
            <span className={styles.detailValue}>
              {formatDuration(data.actualDurationDays ?? null)}
            </span>
          </div>
          {(() => {
            const variance = data.actualDurationDays! - data.plannedDurationDays!;
            if (variance === 0) {
              return (
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>Variance</span>
                  <span className={styles.detailValue}>On plan</span>
                </div>
              );
            }
            const absVariance = Math.abs(variance);
            const label = variance > 0 ? `+${absVariance}` : `-${absVariance}`;
            const dayWord = absVariance === 1 ? 'day' : 'days';
            const varianceClass =
              variance > 0 ? styles.detailValueOverPlan : styles.detailValueUnderPlan;
            return (
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Variance</span>
                <span className={`${styles.detailValue} ${varianceClass}`}>
                  {label} {dayWord}
                </span>
              </div>
            );
          })()}
        </>
      ) : data.plannedDurationDays != null ? (
        <div className={styles.detailRow}>
          <span className={styles.detailLabel}>Planned</span>
          <span className={styles.detailValue}>{formatDuration(data.plannedDurationDays)}</span>
        </div>
      ) : data.actualDurationDays != null ? (
        <div className={styles.detailRow}>
          <span className={styles.detailLabel}>Duration</span>
          <span className={styles.detailValue}>{formatDuration(data.actualDurationDays)}</span>
        </div>
      ) : (
        <div className={styles.detailRow}>
          <span className={styles.detailLabel}>Duration</span>
          <span className={styles.detailValue}>{formatDuration(data.durationDays)}</span>
        </div>
      )}

      {/* Separator after duration section — only when variance was shown AND owner follows.
          When variance is shown but no owner, the separator before dependencies handles it.
          When no variance is shown, no separator is needed here. */}
      {hasBothDurations && hasOwner && <div className={styles.separator} aria-hidden="true" />}

      {/* Assigned user */}
      {hasOwner && (
        <div className={styles.detailRow}>
          <span className={styles.detailLabel}>Owner</span>
          <span className={styles.detailValue}>{data.assignedUserName}</span>
        </div>
      )}

      {/* Dependencies section — separator only when preceding content exists */}
      {dependencies.length > 0 && (
        <>
          <div className={styles.separator} aria-hidden="true" />
          <div className={styles.linkedItemsSection}>
            <span className={styles.linkedItemsLabel}>Dependencies ({dependencies.length})</span>
            <ul className={styles.linkedItemsList} aria-label="Dependencies">
              {shownDeps.map((dep, idx) => (
                <li key={`${dep.relatedTitle}-${idx}`} className={styles.linkedItem}>
                  <span className={styles.depTypeLabel}>
                    {DEPENDENCY_TYPE_LABELS[dep.dependencyType]}
                  </span>{' '}
                  {dep.relatedTitle}
                </li>
              ))}
              {depsOverflowCount > 0 && (
                <li className={styles.linkedItemsOverflow}>+{depsOverflowCount} more</li>
              )}
            </ul>
          </div>
        </>
      )}

      {/* Touch device navigation affordance — "View item" link visible only on pointer: coarse */}
      {isTouchDevice && data.workItemId && (
        <>
          <div className={styles.separator} aria-hidden="true" />
          <Link
            to={`/work-items/${data.workItemId}`}
            className={styles.viewItemLink}
            aria-label={`View details for ${data.title}`}
          >
            View item
          </Link>
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Milestone tooltip content
// ---------------------------------------------------------------------------

const MAX_LINKED_ITEMS_SHOWN = 5;

function MilestoneTooltipContent({
  data,
  isTouchDevice,
  onMilestoneNavigate,
}: {
  data: GanttTooltipMilestoneData;
  isTouchDevice?: boolean;
  onMilestoneNavigate?: (milestoneId: number) => void;
}) {
  let statusLabel: string;
  let statusClass: string;
  if (data.isCompleted) {
    statusLabel = 'Completed';
    statusClass = styles.statusCompleted;
  } else if (data.isLate) {
    statusLabel = 'Late';
    statusClass = styles.statusLate;
  } else {
    statusLabel = 'On track';
    statusClass = styles.statusInProgress;
  }

  const { linkedWorkItems, dependentWorkItems } = data;
  const shownLinked = linkedWorkItems.slice(0, MAX_LINKED_ITEMS_SHOWN);
  const linkedOverflowCount = linkedWorkItems.length - shownLinked.length;
  const shownDependent = dependentWorkItems.slice(0, MAX_LINKED_ITEMS_SHOWN);
  const dependentOverflowCount = dependentWorkItems.length - shownDependent.length;

  const hasBothEmpty = linkedWorkItems.length === 0 && dependentWorkItems.length === 0;

  return (
    <>
      {/* Header: title + completion badge */}
      <div className={styles.header}>
        <span className={`${styles.milestoneIcon}`} aria-hidden="true">
          {/* Small diamond SVG icon */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 10 10"
            width="10"
            height="10"
            fill="currentColor"
            aria-hidden="true"
          >
            <polygon points="5,0 10,5 5,10 0,5" />
          </svg>
        </span>
        <span className={styles.title}>{data.title}</span>
        <span className={`${styles.statusBadge} ${statusClass}`}>{statusLabel}</span>
      </div>

      <div className={styles.separator} aria-hidden="true" />

      {/* Target date */}
      <div className={styles.detailRow}>
        <span className={styles.detailLabel}>Target</span>
        <span className={styles.detailValue}>{formatDisplayDate(data.targetDate)}</span>
      </div>

      {/* Projected date — show when available and milestone is not yet completed */}
      {!data.isCompleted && (
        <div className={styles.detailRow}>
          <span className={styles.detailLabel}>Projected</span>
          <span className={`${styles.detailValue} ${data.isLate ? styles.detailValueLate : ''}`}>
            {data.projectedDate !== null ? formatDisplayDate(data.projectedDate) : '—'}
          </span>
        </div>
      )}

      {/* Completion date */}
      {data.isCompleted && data.completedAt !== null && (
        <div className={styles.detailRow}>
          <span className={styles.detailLabel}>Done</span>
          <span className={styles.detailValue}>
            {formatDisplayDate(data.completedAt.slice(0, 10))}
          </span>
        </div>
      )}

      {/* When both lists are empty, show a single "No linked items" row */}
      {hasBothEmpty ? (
        <div className={styles.detailRow}>
          <span className={styles.detailLabel}>Linked</span>
          <span className={styles.detailValue}>None</span>
        </div>
      ) : (
        <>
          {/* Contributing items — work items linked to this milestone via workItemIds */}
          <div className={styles.separator} aria-hidden="true" />
          {linkedWorkItems.length === 0 ? (
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>Contributing</span>
              <span className={styles.detailValue}>None</span>
            </div>
          ) : (
            <div className={styles.linkedItemsSection}>
              <span className={styles.linkedItemsLabel}>
                Contributing ({linkedWorkItems.length})
              </span>
              <ul
                className={styles.linkedItemsList}
                aria-label="Work items contributing to this milestone"
              >
                {shownLinked.map((item) => (
                  <li key={item.id} className={styles.linkedItem}>
                    {item.title}
                  </li>
                ))}
                {linkedOverflowCount > 0 && (
                  <li className={styles.linkedItemsOverflow}>+{linkedOverflowCount} more</li>
                )}
              </ul>
            </div>
          )}

          {/* Dependent items — work items that depend on this milestone via requiredMilestoneIds */}
          {dependentWorkItems.length === 0 ? (
            <div className={styles.detailRow}>
              <span className={styles.detailLabel}>Blocked by this</span>
              <span className={styles.detailValue}>None</span>
            </div>
          ) : (
            <div className={styles.linkedItemsSection}>
              <span className={styles.linkedItemsLabel}>
                Blocked by this ({dependentWorkItems.length})
              </span>
              <ul
                className={styles.linkedItemsList}
                aria-label="Work items blocked by this milestone"
              >
                {shownDependent.map((item) => (
                  <li key={item.id} className={styles.linkedItem}>
                    {item.title}
                  </li>
                ))}
                {dependentOverflowCount > 0 && (
                  <li className={styles.linkedItemsOverflow}>+{dependentOverflowCount} more</li>
                )}
              </ul>
            </div>
          )}
        </>
      )}

      {/* Touch device navigation affordance — "View item" button visible only on pointer: coarse */}
      {isTouchDevice && data.milestoneId !== undefined && onMilestoneNavigate && (
        <>
          <div className={styles.separator} aria-hidden="true" />
          <button
            type="button"
            className={styles.viewItemLink}
            onClick={() => onMilestoneNavigate(data.milestoneId!)}
            aria-label={`View details for milestone ${data.title}`}
          >
            View item
          </button>
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Arrow tooltip content
// ---------------------------------------------------------------------------

function ArrowTooltipContent({ data }: { data: GanttTooltipArrowData }) {
  return (
    <div className={styles.arrowDescription} role="status">
      {data.description}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * GanttTooltip renders a positioned tooltip for a hovered Gantt bar, milestone diamond,
 * or dependency arrow.
 *
 * Rendered as a portal to document.body to avoid SVG clipping issues.
 * Position is derived from mouse viewport coordinates with flip logic
 * to avoid overflowing the viewport edges.
 *
 * The `data` prop is polymorphic — set `kind: 'work-item'`, `kind: 'milestone'`,
 * or `kind: 'arrow'` to switch between tooltip layouts.
 */
export function GanttTooltip({
  data,
  position,
  id,
  isTouchDevice,
  onMilestoneNavigate,
}: GanttTooltipProps) {
  // Compute tooltip x/y, flipping to avoid viewport overflow
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800;

  // For work-item tooltips with dependencies, estimate height dynamically
  // so the flip-point avoids clipping the dependencies list at the viewport bottom.
  const depsCount = data.kind === 'work-item' ? (data.dependencies?.length ?? 0) : 0;
  const heightEstimate =
    data.kind === 'work-item' && depsCount > 0
      ? TOOLTIP_HEIGHT_BASE + Math.min(depsCount, MAX_DEPS_SHOWN) * 18
      : TOOLTIP_HEIGHT_ESTIMATE;

  // Default: place tooltip to the left of the cursor so it doesn't cover upcoming work items
  // (Gantt chart flows left-to-right, so future items are to the right of the hovered bar).
  // Fall back to right-of-cursor if there isn't enough space on the left.
  let tooltipX = position.x - TOOLTIP_WIDTH - OFFSET_X;
  let tooltipY = position.y + OFFSET_Y;

  // Flip to the right if it would overflow the left edge
  if (tooltipX < 8) {
    tooltipX = position.x + OFFSET_X;
  }

  // Flip vertically if it would overflow the bottom edge
  if (tooltipY + heightEstimate > viewportHeight - 8) {
    tooltipY = position.y - heightEstimate - OFFSET_Y;
  }

  const content = (
    <div
      id={id}
      className={styles.tooltip}
      role="tooltip"
      style={{ left: tooltipX, top: tooltipY, width: TOOLTIP_WIDTH }}
      data-testid="gantt-tooltip"
    >
      {data.kind === 'work-item' ? (
        <WorkItemTooltipContent data={data} isTouchDevice={isTouchDevice} />
      ) : data.kind === 'milestone' ? (
        <MilestoneTooltipContent
          data={data}
          isTouchDevice={isTouchDevice}
          onMilestoneNavigate={onMilestoneNavigate}
        />
      ) : (
        <ArrowTooltipContent data={data} />
      )}
    </div>
  );

  return createPortal(content, document.body);
}
