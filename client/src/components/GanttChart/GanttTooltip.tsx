import { createPortal } from 'react-dom';
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
  /** Linked work items with their IDs and titles (replaces old linkedWorkItemCount). */
  linkedWorkItems: { id: string; title: string }[];
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
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<WorkItemStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
  blocked: 'Blocked',
};

const STATUS_BADGE_CLASSES: Record<WorkItemStatus, string> = {
  not_started: styles.statusNotStarted,
  in_progress: styles.statusInProgress,
  completed: styles.statusCompleted,
  blocked: styles.statusBlocked,
};

const TOOLTIP_WIDTH = 240;
/**
 * Base height estimate for tooltip flip-logic. When the work-item tooltip has
 * visible dependencies, the actual rendered height will be larger — we add
 * 18px per dependency row on top of this base when computing the flip point.
 */
const TOOLTIP_HEIGHT_BASE = 130;
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

function WorkItemTooltipContent({ data }: { data: GanttTooltipWorkItemData }) {
  const dependencies = data.dependencies ?? [];
  const shownDeps = dependencies.slice(0, MAX_DEPS_SHOWN);
  const depsOverflowCount = dependencies.length - shownDeps.length;

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

      {/* Duration */}
      <div className={styles.detailRow}>
        <span className={styles.detailLabel}>Duration</span>
        <span className={styles.detailValue}>{formatDuration(data.durationDays)}</span>
      </div>

      {/* Assigned user */}
      {data.assignedUserName !== null && (
        <div className={styles.detailRow}>
          <span className={styles.detailLabel}>Owner</span>
          <span className={styles.detailValue}>{data.assignedUserName}</span>
        </div>
      )}

      {/* Dependencies section — rendered when item has at least one dependency */}
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
    </>
  );
}

// ---------------------------------------------------------------------------
// Milestone tooltip content
// ---------------------------------------------------------------------------

const MAX_LINKED_ITEMS_SHOWN = 5;

function MilestoneTooltipContent({ data }: { data: GanttTooltipMilestoneData }) {
  let statusLabel: string;
  let statusClass: string;
  if (data.isCompleted) {
    statusLabel = 'Completed';
    statusClass = styles.statusCompleted;
  } else if (data.isLate) {
    statusLabel = 'Late';
    statusClass = styles.statusBlocked;
  } else {
    statusLabel = 'On track';
    statusClass = styles.statusInProgress;
  }

  const { linkedWorkItems } = data;
  const shownItems = linkedWorkItems.slice(0, MAX_LINKED_ITEMS_SHOWN);
  const overflowCount = linkedWorkItems.length - shownItems.length;

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

      {/* Linked work items list */}
      {linkedWorkItems.length === 0 ? (
        <div className={styles.detailRow}>
          <span className={styles.detailLabel}>Items</span>
          <span className={styles.detailValue}>None</span>
        </div>
      ) : (
        <div className={styles.linkedItemsSection}>
          <span className={styles.linkedItemsLabel}>Linked ({linkedWorkItems.length})</span>
          <ul className={styles.linkedItemsList} aria-label="Linked work items">
            {shownItems.map((item) => (
              <li key={item.id} className={styles.linkedItem}>
                {item.title}
              </li>
            ))}
            {overflowCount > 0 && (
              <li className={styles.linkedItemsOverflow}>+{overflowCount} more</li>
            )}
          </ul>
        </div>
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
export function GanttTooltip({ data, position, id }: GanttTooltipProps) {
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
        <WorkItemTooltipContent data={data} />
      ) : data.kind === 'milestone' ? (
        <MilestoneTooltipContent data={data} />
      ) : (
        <ArrowTooltipContent data={data} />
      )}
    </div>
  );

  return createPortal(content, document.body);
}
