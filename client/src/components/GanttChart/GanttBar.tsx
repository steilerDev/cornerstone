import { memo } from 'react';
import type { PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { WorkItemStatus } from '@cornerstone/shared';
import { BAR_HEIGHT, BAR_OFFSET_Y, ROW_HEIGHT, TEXT_LABEL_MIN_WIDTH } from './ganttUtils.js';
import type { DragState } from './useGanttDrag.js';
import styles from './GanttBar.module.css';

/** Pixel threshold for edge drag handles in the bar. */
const EDGE_THRESHOLD_PX = 8;

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

  // ---- Drag support (optional — bar is read-only if omitted) ----

  /** Active drag state — used to suppress click and show drag cursor. */
  dragState?: DragState | null;
  /** Ghost bar color (resolved via getComputedStyle). Falls back to fill color. */
  ghostColor?: string;
  /** Callback on pointer down — starts drag. */
  onPointerDown?: (event: ReactPointerEvent<SVGGElement>) => void;
  /** Whether pointer is over this bar (for cursor). */
  hoverZoneCursor?: string | null;
  /** Callback when pointer moves over the bar (hover cursor update). */
  onBarPointerMove?: (event: ReactPointerEvent<SVGGElement>) => void;
  /** Callback when pointer leaves the bar. */
  onBarPointerLeave?: () => void;

  // ---- Tooltip support (optional) ----

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
 * - Drag-to-reschedule (via pointer events)
 * - Hover tooltip
 * - Ghost bar preview during drag
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
  dragState = null,
  ghostColor = '',
  onPointerDown,
  hoverZoneCursor = null,
  onBarPointerMove,
  onBarPointerLeave,
  onMouseEnter,
  onMouseLeave,
  onMouseMove,
}: GanttBarProps) {
  const rowY = rowIndex * ROW_HEIGHT;
  const barY = rowY + BAR_OFFSET_Y;
  const clipId = `bar-clip-${id}`;
  const statusLabel = STATUS_LABELS[status];

  const ariaLabel = isCritical
    ? `Work item: ${title}, ${statusLabel} (critical path)`
    : `Work item: ${title}, ${statusLabel}`;

  // Determine if this bar is being dragged
  const isBeingDragged = dragState?.itemId === id;

  // Ghost bar uses the same x/width as the bar itself — the parent already
  // provides the live preview coordinates (computed from dragState.previewStartDate/endDate).
  // The ghost is rendered at the same position but with dashed stroke + reduced fill opacity,
  // while the main bar is dimmed to 0.35 opacity to show the difference clearly.

  // Cursor: while dragging this bar, use 'grabbing'; otherwise use hover zone cursor
  const cursor =
    isBeingDragged && dragState?.zone === 'move'
      ? 'grabbing'
      : isBeingDragged
        ? 'col-resize'
        : (hoverZoneCursor ?? 'pointer');

  // Opacity: original bar dims during drag
  const barOpacity = isBeingDragged ? 0.35 : 1;

  // Whether to show the text label
  const showLabel = ghostWidth >= TEXT_LABEL_MIN_WIDTH;
  const textY = rowY + ROW_HEIGHT / 2;

  const isDragging = dragState !== null;

  function handleClick() {
    // Suppress click if a drag just ended
    if (isDragging) return;
    onClick?.(id);
  }

  function handleKeyDown(e: ReactKeyboardEvent<SVGGElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!isDragging) onClick?.(id);
    }
  }

  return (
    <>
      {/* Ghost/preview bar — shown on top of the dimmed original during drag */}
      {isBeingDragged && (
        <g aria-hidden="true" data-testid={`gantt-bar-ghost-${id}`}>
          <rect
            x={x}
            y={barY}
            width={Math.max(width, 4)}
            height={BAR_HEIGHT}
            rx={4}
            fill={fill}
            fillOpacity={0.75}
            stroke={ghostColor || fill}
            strokeWidth={2}
            strokeDasharray="6 3"
            className={styles.ghost}
          />
          {showLabel && (
            <text
              x={x + 8}
              y={textY}
              dominantBaseline="central"
              className={styles.label}
              style={{ fill: ghostColor || fill }}
            >
              {title}
            </text>
          )}
        </g>
      )}

      {/* Main bar group — pointer events managed here */}
      <g
        className={styles.bar}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onBarPointerMove}
        onPointerLeave={onBarPointerLeave}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onMouseMove={onMouseMove}
        role="listitem"
        tabIndex={0}
        aria-label={ariaLabel}
        data-testid={`gantt-bar-${id}`}
        style={{ cursor, opacity: barOpacity }}
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

        {/* Invisible wider hit zones for edge drag handles */}
        {/* Left edge handle */}
        <rect
          x={x}
          y={barY}
          width={Math.min(EDGE_THRESHOLD_PX, width)}
          height={BAR_HEIGHT}
          fill="transparent"
          className={styles.edgeHandle}
          aria-hidden="true"
          data-zone="start"
        />
        {/* Right edge handle */}
        <rect
          x={x + width - Math.min(EDGE_THRESHOLD_PX, width)}
          y={barY}
          width={Math.min(EDGE_THRESHOLD_PX, width)}
          height={BAR_HEIGHT}
          fill="transparent"
          className={styles.edgeHandle}
          aria-hidden="true"
          data-zone="end"
        />
      </g>
    </>
  );
});

