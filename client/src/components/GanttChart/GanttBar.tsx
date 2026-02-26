import { memo } from 'react';
import type { MouseEvent as ReactMouseEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { WorkItemStatus } from '@cornerstone/shared';
import { BAR_HEIGHT, BAR_OFFSET_Y, ROW_HEIGHT } from './ganttUtils.js';
import styles from './GanttBar.module.css';

/** Visual interaction state applied when an arrow is hovered. */
export type BarInteractionState = 'highlighted' | 'dimmed' | 'default';

export interface GanttBarProps {
  id: string;
  title: string;
  status: WorkItemStatus;
  /** Start date string (YYYY-MM-DD) — used in aria-label for screen readers. */
  startDate?: string | null;
  /** End date string (YYYY-MM-DD) — used in aria-label for screen readers. */
  endDate?: string | null;
  x: number;
  width: number;
  rowIndex: number;
  /** Computed fill color string from CSS custom property (read via getComputedStyle). */
  fill: string;
  /** Callback when bar is clicked. */
  onClick?: (id: string) => void;
  /** Whether this bar is on the critical path (renders accent stripe). */
  isCritical?: boolean;
  /** Resolved critical border color (read via getComputedStyle). */
  criticalBorderColor?: string;
  /**
   * Visual state applied when an arrow is hovered:
   * - 'highlighted': this bar is a connected endpoint — visually emphasised
   * - 'dimmed': this bar is unrelated to the hovered arrow — reduced opacity
   * - 'default': no arrow hover active
   */
  interactionState?: BarInteractionState;

  // ---- Tooltip support (optional) ----

  /** ID of the tooltip element for aria-describedby. */
  tooltipId?: string;
  /** Callback on mouse enter — passes event for tooltip positioning. */
  onMouseEnter?: (event: ReactMouseEvent<SVGGElement>) => void;
  /** Callback on mouse leave. */
  onMouseLeave?: () => void;
  /** Callback on mouse move — updates tooltip position. */
  onMouseMove?: (event: ReactMouseEvent<SVGGElement>) => void;
}

const STATUS_LABELS: Record<WorkItemStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
  blocked: 'Blocked',
};

/**
 * GanttBar renders a single work item as an SVG bar in the chart canvas.
 *
 * Supports:
 * - Click-to-navigate
 * - Hover tooltip
 * - Critical path accent stripe
 *
 * Uses React.memo to avoid unnecessary re-renders when scrolling.
 */
const INTERACTION_STATE_CLASSES: Record<BarInteractionState, string> = {
  highlighted: styles.highlighted,
  dimmed: styles.dimmed,
  default: '',
};

export const GanttBar = memo(function GanttBar({
  id,
  title,
  status,
  startDate,
  endDate,
  x,
  width,
  rowIndex,
  fill,
  onClick,
  isCritical = false,
  criticalBorderColor,
  interactionState = 'default',
  tooltipId,
  onMouseEnter,
  onMouseLeave,
  onMouseMove,
}: GanttBarProps) {
  const rowY = rowIndex * ROW_HEIGHT;
  const barY = rowY + BAR_OFFSET_Y;
  const statusLabel = STATUS_LABELS[status];

  // Build a descriptive aria-label including dates when available
  const dateRange =
    startDate && endDate ? `, ${startDate} to ${endDate}` : startDate ? `, from ${startDate}` : '';
  const criticalSuffix = isCritical ? ', critical path' : '';
  const ariaLabel = `Work item: ${title}, ${statusLabel}${dateRange}${criticalSuffix}`;

  const interactionClass = INTERACTION_STATE_CLASSES[interactionState];

  function handleClick() {
    onClick?.(id);
  }

  function handleKeyDown(e: ReactKeyboardEvent<SVGGElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick?.(id);
    }
  }

  return (
    <g
      className={`${styles.bar} ${interactionClass}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onMouseMove={onMouseMove}
      role="graphics-symbol"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-describedby={tooltipId}
      data-testid={`gantt-bar-${id}`}
      style={{ cursor: 'pointer' }}
    >
      {/* Bar rectangle */}
      <rect
        x={x}
        y={barY}
        width={width}
        height={BAR_HEIGHT}
        rx={4}
        fill={fill}
        stroke={isCritical && criticalBorderColor ? criticalBorderColor : undefined}
        strokeWidth={isCritical && criticalBorderColor ? 2 : undefined}
        className={styles.rect}
      />
    </g>
  );
});
