import { memo } from 'react';
import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  FocusEvent as ReactFocusEvent,
} from 'react';
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
  aheadFill: string;
  aheadStroke: string;
  hoverGlow: string;
  completeHoverGlow: string;
  lateHoverGlow: string;
  aheadHoverGlow: string;
}

/** Derived status for a milestone based on completion and projected vs target date. */
export type MilestoneStatus = 'completed' | 'late' | 'ahead' | 'on_track';

/** Compute the milestone status from its data fields. */
export function computeMilestoneStatus(milestone: TimelineMilestone): MilestoneStatus {
  if (milestone.isCompleted) return 'completed';
  if (milestone.projectedDate !== null) {
    if (milestone.projectedDate > milestone.targetDate) {
      return 'late';
    }
    if (milestone.projectedDate < milestone.targetDate) {
      return 'ahead';
    }
  }
  return 'on_track';
}

export interface MilestoneDiamond {
  milestone: TimelineMilestone;
  x: number;
  y: number; // center y
}

/** Visual interaction state applied when an arrow is hovered. */
export type MilestoneInteractionState = 'highlighted' | 'dimmed' | 'default';

export interface GanttMilestonesProps {
  milestones: TimelineMilestone[];
  chartRange: ChartRange;
  zoom: ZoomLevel;
  /** Map from milestone ID to its row index in the unified sorted list. */
  milestoneRowIndices: ReadonlyMap<number, number>;
  colors: MilestoneColors;
  /** Optional column width override for zoom in/out. */
  columnWidth?: number;
  /**
   * Map from milestone ID to its interaction state when an arrow is hovered.
   * When null/undefined, no arrow hover is active and all milestones render normally.
   */
  milestoneInteractionStates?: ReadonlyMap<number, MilestoneInteractionState>;
  /** Set of milestone IDs on the critical path. */
  criticalMilestoneIds?: ReadonlySet<number>;
  /** Border color for critical path milestones. */
  criticalBorderColor?: string;
  /** Stroke color for critical path connectors (late milestone dashed lines). */
  criticalConnectorColor?: string;
  /** Called when a diamond is hovered (for tooltip). Passes milestone and mouse coords. */
  onMilestoneMouseEnter?: (
    milestone: TimelineMilestone,
    event: ReactMouseEvent<SVGGElement>,
  ) => void;
  onMilestoneMouseLeave?: (milestone: TimelineMilestone) => void;
  onMilestoneMouseMove?: (event: ReactMouseEvent<SVGGElement>) => void;
  /**
   * Called when a diamond receives keyboard focus — triggers highlight/dim and tooltip.
   * Passes the milestone and focus event for positioning.
   */
  onMilestoneFocus?: (milestone: TimelineMilestone, event: ReactFocusEvent<SVGGElement>) => void;
  /** Called when a diamond loses keyboard focus — removes highlight/dim and tooltip. */
  onMilestoneBlur?: (milestone: TimelineMilestone) => void;
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
  /** Visual interaction state when an arrow is hovered. */
  interactionState?: MilestoneInteractionState;
  /** When true, renders with thicker stroke using the critical border color. */
  isCritical?: boolean;
  /** Border color for critical path styling. */
  criticalBorderColor?: string;
  /**
   * Callback on keyboard focus — triggers the same highlight/dim and tooltip
   * behavior as mouse enter. Passes the focus event for positioning.
   */
  onFocus?: (e: ReactFocusEvent<SVGGElement>) => void;
  /** Callback on keyboard blur — removes highlight/dim and tooltip. */
  onBlur?: () => void;
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
  interactionState = 'default',
  isCritical = false,
  criticalBorderColor,
  onFocus,
  onBlur,
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
  } else if (status === 'ahead') {
    fill = colors.aheadFill;
    stroke = colors.aheadStroke;
    hoverGlow = colors.aheadHoverGlow;
    statusClass = styles.diamondAhead;
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

  const interactionClass =
    interactionState === 'highlighted'
      ? styles.milestoneHighlighted
      : interactionState === 'dimmed'
        ? styles.milestoneDimmed
        : '';

  return (
    <g
      role="graphics-symbol"
      aria-label={label}
      tabIndex={0}
      className={`${styles.diamond} ${statusClass} ${interactionClass}`}
      style={{ '--milestone-hover-glow': hoverGlow } as CSSProperties}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onMouseMove={onMouseMove}
      onFocus={onFocus}
      onBlur={onBlur}
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
        stroke={isCritical && criticalBorderColor ? criticalBorderColor : stroke}
        strokeWidth={isCritical && !isGhost ? 3 : 2}
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
  milestoneInteractionStates,
  criticalMilestoneIds,
  criticalBorderColor,
  criticalConnectorColor,
  onMilestoneMouseEnter,
  onMilestoneMouseLeave,
  onMilestoneMouseMove,
  onMilestoneFocus,
  onMilestoneBlur,
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
          status === 'completed'
            ? 'completed'
            : status === 'late'
              ? 'late'
              : status === 'ahead'
                ? 'ahead'
                : 'incomplete';
        const isCriticalMilestone = criticalMilestoneIds?.has(milestone.id) ?? false;
        const ariaLabel = `Milestone: ${milestone.title}, ${statusLabel}${isCriticalMilestone ? ', critical path' : ''}, target date ${milestone.targetDate}`;

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

        // For late/ahead milestones, also compute projected date position
        const hasProjectedDate =
          (status === 'late' || status === 'ahead') && milestone.projectedDate !== null;
        const projectedX =
          hasProjectedDate && milestone.projectedDate !== null
            ? dateToX(toUtcMidnight(milestone.projectedDate), chartRange, zoom, columnWidth)
            : null;

        const interactionState = milestoneInteractionStates?.get(milestone.id) ?? 'default';

        // Determine connector stroke color based on status
        const getConnectorStroke = () => {
          if (isCriticalMilestone && criticalConnectorColor) {
            return criticalConnectorColor;
          }
          return status === 'ahead' ? colors.aheadStroke : colors.lateStroke;
        };

        return (
          <g key={milestone.id}>
            {/* For late/ahead milestones: dashed connector line between ghost and projected */}
            {hasProjectedDate && projectedX !== null && (
              <line
                x1={targetX}
                y1={y}
                x2={projectedX}
                y2={y}
                stroke={getConnectorStroke()}
                strokeWidth={isCriticalMilestone ? 2 : 1.5}
                strokeDasharray="4 3"
                strokeOpacity={interactionState === 'dimmed' ? 0.2 : 0.6}
                aria-hidden="true"
              />
            )}

            {/* For late/ahead milestones: ghost diamond at target date */}
            {hasProjectedDate && (
              <DiamondMarker
                x={targetX}
                y={y}
                status={status}
                label={`${milestone.title} planned date`}
                colors={colors}
                isGhost
                isCritical={isCriticalMilestone}
                criticalBorderColor={criticalBorderColor}
                onMouseEnter={() => {}}
                onMouseLeave={() => {}}
                onMouseMove={() => {}}
                onClick={() => {}}
              />
            )}

            {/* Active diamond: at completedAt for completed, projected for late/ahead, target for others */}
            <DiamondMarker
              x={completedX ?? (hasProjectedDate && projectedX !== null ? projectedX : targetX)}
              y={y}
              status={status}
              label={ariaLabel}
              colors={colors}
              interactionState={interactionState}
              isCritical={isCriticalMilestone}
              criticalBorderColor={criticalBorderColor}
              onMouseEnter={(e) => onMilestoneMouseEnter?.(milestone, e)}
              onMouseLeave={() => onMilestoneMouseLeave?.(milestone)}
              onMouseMove={(e) => onMilestoneMouseMove?.(e)}
              onFocus={(e) => onMilestoneFocus?.(milestone, e)}
              onBlur={() => onMilestoneBlur?.(milestone)}
              onClick={() => onMilestoneClick?.(milestone.id)}
            />
          </g>
        );
      })}
    </g>
  );
});
