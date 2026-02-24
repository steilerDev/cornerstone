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
  hoverGlow: string;
  completeHoverGlow: string;
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
  isCompleted: boolean;
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
  isCompleted,
  label,
  colors,
  onMouseEnter,
  onMouseLeave,
  onMouseMove,
  onClick,
}: DiamondMarkerProps) {
  const fill = isCompleted ? colors.completeFill : colors.incompleteFill;
  const stroke = isCompleted ? colors.completeStroke : colors.incompleteStroke;

  // Diamond polygon points: top, right, bottom, left
  const points = [
    `${x},${y - DIAMOND_SIZE}`,
    `${x + DIAMOND_SIZE},${y}`,
    `${x},${y + DIAMOND_SIZE}`,
    `${x - DIAMOND_SIZE},${y}`,
  ].join(' ');

  const hoverGlow = isCompleted ? colors.completeHoverGlow : colors.hoverGlow;

  return (
    <g
      role="button"
      aria-label={label}
      tabIndex={0}
      className={`${styles.diamond} ${isCompleted ? styles.diamondComplete : ''}`}
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
        const completedLabel = milestone.isCompleted ? 'completed' : 'incomplete';
        const ariaLabel = `Milestone: ${milestone.title}, ${completedLabel}, target date ${milestone.targetDate}`;

        return (
          <DiamondMarker
            key={milestone.id}
            x={x}
            y={y}
            isCompleted={milestone.isCompleted}
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
