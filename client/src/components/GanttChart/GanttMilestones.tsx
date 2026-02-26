import { memo } from 'react';
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
  /** Map from milestone ID to its row index in the unified sorted list. */
  milestoneRowIndices: ReadonlyMap<number, number>;
  colors: MilestoneColors;
  /** Optional column width override for zoom in/out. */
  columnWidth?: number;
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
  /** When true, renders as a ghost (outlined, dimmed) for the planned position. */
  isGhost?: boolean;
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
  isGhost = false,
}: DiamondMarkerProps) {
  let fill: string;
  let stroke: string;
  let hoverGlow: string;
  let statusClass: string;

  if (isGhost) {
    // Ghost diamond: always shows the "planned" state with reduced opacity
    fill = 'transparent';
    stroke = colors.lateStroke;
    hoverGlow = 'transparent';
    statusClass = styles.diamondGhost;
  } else if (status === 'completed') {
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

  if (isGhost) {
    // Ghost diamond: no interaction, just visual indicator
    return (
      <polygon
        points={points}
        fill={fill}
        stroke={stroke}
        strokeWidth={1.5}
        strokeDasharray="3 2"
        className={`${styles.diamondPolygon} ${statusClass}`}
        aria-hidden="true"
      />
    );
  }

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
 * Each milestone occupies its own dedicated row after the work item rows.
 * This allows the sidebar to show milestone names aligned with the diamonds.
 *
 * For late milestones, renders:
 * - A ghost diamond at the targetDate (planned position)
 * - A filled red diamond at the projectedDate (current projected position)
 * - A dashed line connecting the two
 *
 * Colors must be pre-resolved via getComputedStyle (SVG cannot use CSS var()).
 */
export const GanttMilestones = memo(function GanttMilestones({
  milestones,
  chartRange,
  zoom,
  milestoneRowIndices,
  colors,
  columnWidth,
  onMilestoneMouseEnter,
  onMilestoneMouseLeave,
  onMilestoneMouseMove,
  onMilestoneClick,
}: GanttMilestonesProps) {
  if (milestones.length === 0) {
    return null;
  }

  return (
    <g aria-label={`Milestone markers (${milestones.length})`} data-testid="gantt-milestones-layer">
      {milestones.map((milestone) => {
        const status = computeMilestoneStatus(milestone);
        const statusLabel =
          status === 'completed' ? 'completed' : status === 'late' ? 'late' : 'incomplete';
        const ariaLabel = `Milestone: ${milestone.title}, ${statusLabel}, target date ${milestone.targetDate}`;

        // Row index from the unified sorted list
        const milestoneRowIndex = milestoneRowIndices.get(milestone.id) ?? 0;
        const rowY = milestoneRowIndex * ROW_HEIGHT;
        const y = rowY + ROW_HEIGHT / 2;

        // Target date position (planned)
        const targetDate = toUtcMidnight(milestone.targetDate);
        const targetX = dateToX(targetDate, chartRange, zoom, columnWidth);

        // For completed milestones with a completedAt date, position at that date
        const completedX =
          status === 'completed' && milestone.completedAt
            ? dateToX(
                toUtcMidnight(milestone.completedAt.slice(0, 10)),
                chartRange,
                zoom,
                columnWidth,
              )
            : null;

        // For late milestones, also compute projected date position
        const isLate = status === 'late' && milestone.projectedDate !== null;
        const projectedX =
          isLate && milestone.projectedDate !== null
            ? dateToX(toUtcMidnight(milestone.projectedDate), chartRange, zoom, columnWidth)
            : null;

        return (
          <g key={milestone.id}>
            {/* For late milestones: dashed connector line between ghost and projected */}
            {isLate && projectedX !== null && (
              <line
                x1={targetX}
                y1={y}
                x2={projectedX}
                y2={y}
                stroke={colors.lateStroke}
                strokeWidth={1.5}
                strokeDasharray="4 3"
                strokeOpacity={0.6}
                aria-hidden="true"
              />
            )}

            {/* For late milestones: ghost diamond at target date */}
            {isLate && (
              <DiamondMarker
                x={targetX}
                y={y}
                status={status}
                label={`${milestone.title} planned date`}
                colors={colors}
                isGhost
                onMouseEnter={() => {}}
                onMouseLeave={() => {}}
                onMouseMove={() => {}}
                onClick={() => {}}
              />
            )}

            {/* Active diamond: at completedAt for completed, projected for late, target for others */}
            <DiamondMarker
              x={completedX ?? (isLate && projectedX !== null ? projectedX : targetX)}
              y={y}
              status={status}
              label={ariaLabel}
              colors={colors}
              onMouseEnter={(e) => onMilestoneMouseEnter?.(milestone, e)}
              onMouseLeave={() => onMilestoneMouseLeave?.(milestone)}
              onMouseMove={(e) => onMilestoneMouseMove?.(e)}
              onClick={() => onMilestoneClick?.(milestone.id)}
            />
          </g>
        );
      })}
    </g>
  );
});
