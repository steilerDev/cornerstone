import { memo, useMemo } from 'react';
import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react';
import type { TimelineMilestone } from '@cornerstone/shared';
import { dateToX, toUtcMidnight, ROW_HEIGHT } from './ganttUtils.js';
import type { ChartRange, ZoomLevel } from './ganttUtils.js';
import styles from './GanttMilestones.module.css';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DIAMOND_SIZE = 8; // half-size — diamond extends 8px from center
const HIT_RADIUS = 16; // invisible hit area radius for mouse events
const HIT_RADIUS_TOUCH = 22; // expanded hit area for touch devices

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MilestoneColors {
  incompleteFill: string;
  incompleteStroke: string;
  completeFill: string;
  completeStroke: string;
  lateFill: string;
  lateStroke: string;
  hoverGlow: string;
  completeHoverGlow: string;
  lateHoverGlow: string;
}

/** Derived status for a milestone based on completion and projected vs target date. */
export type MilestoneStatus = 'completed' | 'late' | 'on_track';

/** Compute the milestone status from its data fields. */
export function computeMilestoneStatus(milestone: TimelineMilestone): MilestoneStatus {
  if (milestone.isCompleted) return 'completed';
  if (milestone.projectedDate !== null && milestone.projectedDate > milestone.targetDate) {
    return 'late';
  }
  return 'on_track';
}

export interface MilestoneDiamond {
  milestone: TimelineMilestone;
  x: number;
  y: number; // center y
}

export interface GanttMilestonesProps {
  milestones: TimelineMilestone[];
  chartRange: ChartRange;
  zoom: ZoomLevel;
  rowCount: number;
  colors: MilestoneColors;
  /** Called when a diamond is hovered (for tooltip). Passes milestone and mouse coords. */
  onMilestoneMouseEnter?: (
    milestone: TimelineMilestone,
    event: ReactMouseEvent<SVGGElement>,
  ) => void;
  onMilestoneMouseLeave?: (milestone: TimelineMilestone) => void;
  onMilestoneMouseMove?: (event: ReactMouseEvent<SVGGElement>) => void;
  /** Called when a diamond is clicked — opens milestone detail. */
  onMilestoneClick?: (milestoneId: number) => void;
}

// ---------------------------------------------------------------------------
// Single diamond marker
// ---------------------------------------------------------------------------

interface DiamondMarkerProps {
  x: number;
  y: number;
  status: MilestoneStatus;
  label: string;
  colors: MilestoneColors;
  onMouseEnter: (e: ReactMouseEvent<SVGGElement>) => void;
  onMouseLeave: () => void;
  onMouseMove: (e: ReactMouseEvent<SVGGElement>) => void;
  onClick: () => void;
}

const DiamondMarker = memo(function DiamondMarker({
  x,
  y,
  status,
  label,
  colors,
  onMouseEnter,
  onMouseLeave,
  onMouseMove,
  onClick,
}: DiamondMarkerProps) {
  let fill: string;
  let stroke: string;
  let hoverGlow: string;
  let statusClass: string;

  if (status === 'completed') {
    fill = colors.completeFill;
    stroke = colors.completeStroke;
    hoverGlow = colors.completeHoverGlow;
    statusClass = styles.diamondComplete;
  } else if (status === 'late') {
    fill = colors.lateFill;
    stroke = colors.lateStroke;
    hoverGlow = colors.lateHoverGlow;
    statusClass = styles.diamondLate;
  } else {
    fill = colors.incompleteFill;
    stroke = colors.incompleteStroke;
    hoverGlow = colors.hoverGlow;
    statusClass = '';
  }

  // Diamond polygon points: top, right, bottom, left
  const points = [
    `${x},${y - DIAMOND_SIZE}`,
    `${x + DIAMOND_SIZE},${y}`,
    `${x},${y + DIAMOND_SIZE}`,
    `${x - DIAMOND_SIZE},${y}`,
  ].join(' ');

  return (
    <g
      role="graphics-symbol"
      aria-label={label}
      tabIndex={0}
      className={`${styles.diamond} ${statusClass}`}
      style={{ '--milestone-hover-glow': hoverGlow } as CSSProperties}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onMouseMove={onMouseMove}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      data-testid="gantt-milestone-diamond"
    >
      {/* Expanded invisible hit area for easier interaction */}
      <circle cx={x} cy={y} r={HIT_RADIUS_TOUCH} fill="transparent" aria-hidden="true" />

      {/* Diamond polygon */}
      <polygon
        points={points}
        fill={fill}
        stroke={stroke}
        strokeWidth={2}
        className={styles.diamondPolygon}
      />

      {/* Visible hit area circle (desktop — replaces polygon for hover if needed) */}
      <circle cx={x} cy={y} r={HIT_RADIUS} fill="transparent" aria-hidden="true" />
    </g>
  );
});

// ---------------------------------------------------------------------------
// Main GanttMilestones layer component
// ---------------------------------------------------------------------------

/**
 * GanttMilestones renders diamond markers for all milestones on the Gantt chart.
 *
 * Milestones are shown as a dedicated row above the work item bars, OR
 * overlaid at the top of the chart. Each diamond sits at the target date x-position.
 *
 * Colors must be pre-resolved via getComputedStyle (SVG cannot use CSS var()).
 */
export const GanttMilestones = memo(function GanttMilestones({
  milestones,
  chartRange,
  zoom,
  rowCount,
  colors,
  onMilestoneMouseEnter,
  onMilestoneMouseLeave,
  onMilestoneMouseMove,
  onMilestoneClick,
}: GanttMilestonesProps) {
  // Compute diamond positions for all milestones
  const diamonds = useMemo<MilestoneDiamond[]>(() => {
    return milestones.map((milestone) => {
      const targetDate = toUtcMidnight(milestone.targetDate);
      const x = dateToX(targetDate, chartRange, zoom);
      // Position milestones in the row that corresponds to their visual slot.
      // We place them in a dedicated "milestone row" just below the last work item row.
      // If there are no work items, use a single centered row.
      const rowY = rowCount > 0 ? rowCount * 40 : 0; // below all work item rows
      const y = rowY + ROW_HEIGHT / 2;

      return { milestone, x, y };
    });
  }, [milestones, chartRange, zoom, rowCount]);

  if (milestones.length === 0) {
    return null;
  }

  return (
    <g aria-label={`Milestone markers (${milestones.length})`} data-testid="gantt-milestones-layer">
      {diamonds.map(({ milestone, x, y }) => {
        const status = computeMilestoneStatus(milestone);
        const statusLabel =
          status === 'completed' ? 'completed' : status === 'late' ? 'late' : 'incomplete';
        const ariaLabel = `Milestone: ${milestone.title}, ${statusLabel}, target date ${milestone.targetDate}`;

        return (
          <DiamondMarker
            key={milestone.id}
            x={x}
            y={y}
            status={status}
            label={ariaLabel}
            colors={colors}
            onMouseEnter={(e) => onMilestoneMouseEnter?.(milestone, e)}
            onMouseLeave={() => onMilestoneMouseLeave?.(milestone)}
            onMouseMove={(e) => onMilestoneMouseMove?.(e)}
            onClick={() => onMilestoneClick?.(milestone.id)}
          />
        );
      })}
    </g>
  );
});
