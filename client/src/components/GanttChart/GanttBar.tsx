import { memo } from 'react';
import type { WorkItemStatus } from '@cornerstone/shared';
import { BAR_HEIGHT, BAR_OFFSET_Y, ROW_HEIGHT, TEXT_LABEL_MIN_WIDTH } from './ganttUtils.js';
import styles from './GanttBar.module.css';

export interface GanttBarProps {
  id: string;
  title: string;
  status: WorkItemStatus;
  x: number;
  width: number;
  rowIndex: number;
  /** Computed fill color string from CSS custom property (read via getComputedStyle). */
  fill: string;
  /** Callback when bar is clicked. */
  onClick?: (id: string) => void;
  /** Whether this bar is on the critical path (renders border overlay). */
  isCritical?: boolean;
  /** Resolved critical border color (read via getComputedStyle). */
  criticalBorderColor?: string;
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
 * Uses React.memo to avoid unnecessary re-renders when scrolling.
 */
export const GanttBar = memo(function GanttBar({
  id,
  title,
  status,
  x,
  width,
  rowIndex,
  fill,
  onClick,
  isCritical = false,
  criticalBorderColor,
}: GanttBarProps) {
  const rowY = rowIndex * ROW_HEIGHT;
  const barY = rowY + BAR_OFFSET_Y;
  const clipId = `bar-clip-${id}`;
  const showLabel = width >= TEXT_LABEL_MIN_WIDTH;
  const textY = rowY + ROW_HEIGHT / 2; // center of row

  const statusLabel = STATUS_LABELS[status];
  const ariaLabel = isCritical
    ? `Work item: ${title}, ${statusLabel} (critical path)`
    : `Work item: ${title}, ${statusLabel}`;

  function handleClick() {
    onClick?.(id);
  }

  function handleKeyDown(e: React.KeyboardEvent<SVGGElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick?.(id);
    }
  }

  return (
    <g
      className={styles.bar}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="listitem"
      tabIndex={0}
      aria-label={ariaLabel}
      data-testid={`gantt-bar-${id}`}
    >
      {/* Clip path to constrain text within bar bounds */}
      <clipPath id={clipId}>
        <rect x={x} y={barY} width={width} height={BAR_HEIGHT} rx={4} />
      </clipPath>

      {/* Bar rectangle */}
      <rect
        x={x}
        y={barY}
        width={width}
        height={BAR_HEIGHT}
        rx={4}
        fill={fill}
        className={styles.rect}
      />

      {/* Critical path border overlay — additive rect inset 1px, no fill */}
      {isCritical && criticalBorderColor && (
        <rect
          x={x + 1}
          y={barY + 1}
          width={Math.max(width - 2, 0)}
          height={BAR_HEIGHT - 2}
          rx={3}
          fill="none"
          stroke={criticalBorderColor}
          strokeWidth={2}
          className={styles.criticalOverlay}
          aria-hidden="true"
        />
      )}

      {/* Text label inside bar (only when wide enough) */}
      {showLabel && (
        <text
          x={x + 8}
          y={textY}
          dominantBaseline="central"
          clipPath={`url(#${clipId})`}
          className={styles.label}
        >
          {title}
        </text>
      )}
    </g>
  );
});
