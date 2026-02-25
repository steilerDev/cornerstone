import { memo, useMemo } from 'react';
import type { TimelineDependency, DependencyType } from '@cornerstone/shared';
import { computeArrowPath, computeArrowhead, ARROW_STANDOFF } from './arrowUtils.js';
import type { BarRect } from './arrowUtils.js';
import { BAR_HEIGHT, BAR_OFFSET_Y, ROW_HEIGHT } from './ganttUtils.js';
import styles from './GanttArrows.module.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ArrowColors {
  /** Resolved color string for default (non-critical) arrows. */
  defaultArrow: string;
  /** Resolved color string for critical path arrows. */
  criticalArrow: string;
  /** Resolved color string for milestone linkage arrows. */
  milestoneArrow: string;
}

/** Pixel position of a milestone diamond center in SVG coordinates. */
export interface MilestonePoint {
  /** X position of the diamond center. */
  x: number;
  /** Y position of the diamond center. */
  y: number;
}

export interface GanttArrowsProps {
  /** All dependency edges from the timeline response. */
  dependencies: TimelineDependency[];
  /** Set of work item IDs on the critical path. */
  criticalPathSet: ReadonlySet<string>;
  /**
   * Map from work item ID to its rendered bar rectangle.
   * Items not in this map are skipped (they may be off-screen or undated).
   */
  barRects: ReadonlyMap<string, BarRect>;
  /**
   * Map from work item ID to its title — used to build accessible aria-labels
   * on each dependency arrow.
   */
  workItemTitles: ReadonlyMap<string, string>;
  /** Resolved colors (read from CSS custom props via getComputedStyle). */
  colors: ArrowColors;
  /** When false, all arrows are hidden (aria-hidden). */
  visible: boolean;
  /**
   * Map from milestone ID to its diamond center position in SVG coordinates.
   * Required to draw milestone linkage arrows.
   */
  milestonePoints?: ReadonlyMap<number, MilestonePoint>;
  /**
   * Map from milestone ID to the set of work item IDs that contribute to it
   * (i.e., the milestone's workItemIds). Arrows go FROM work item end TO diamond.
   */
  milestoneContributors?: ReadonlyMap<number, readonly string[]>;
  /**
   * Map from work item ID to the set of milestone IDs it requires.
   * Arrows go FROM diamond TO work item start.
   */
  workItemRequiredMilestones?: ReadonlyMap<string, readonly number[]>;
  /**
   * Map from milestone ID to its title — used for accessible aria-labels.
   */
  milestoneTitles?: ReadonlyMap<number, string>;
}

// ---------------------------------------------------------------------------
// Arrowhead size
// ---------------------------------------------------------------------------

const ARROWHEAD_SIZE = 6;
const ARROW_STROKE_DEFAULT = 1.5;
const ARROW_STROKE_CRITICAL = 2;
const ARROW_STROKE_MILESTONE = 1.5;

/** Dash pattern for milestone linkage arrows. */
const MILESTONE_ARROW_DASH = '5 3';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEPENDENCY_TYPE_LABELS: Record<DependencyType, string> = {
  finish_to_start: 'Finish-to-Start',
  start_to_start: 'Start-to-Start',
  finish_to_finish: 'Finish-to-Finish',
  start_to_finish: 'Start-to-Finish',
};

/**
 * Builds an orthogonal SVG path from (srcX, srcY) to (dstX, dstY) using
 * a horizontal → vertical → horizontal routing.
 */
function buildMilestoneOrthoPath(
  srcX: number,
  srcY: number,
  dstX: number,
  dstY: number,
): { pathD: string; tipX: number; tipY: number; tipDirection: 'right' | 'left' } {
  const STANDOFF = 10;

  if (srcX <= dstX) {
    // Standard left-to-right: exit right from src, enter left at dst
    const exitX = srcX + STANDOFF;
    const entryX = dstX - STANDOFF;
    const midX = exitX + Math.max((entryX - exitX) / 2, 4);
    const pathD = `M ${srcX} ${srcY} H ${midX} V ${dstY} H ${dstX}`;
    return { pathD, tipX: dstX, tipY: dstY, tipDirection: 'right' };
  } else {
    // Reverse: src is to the right of dst — loop around
    const loopX = srcX + STANDOFF;
    const entryX = dstX - STANDOFF;
    const pathD = `M ${srcX} ${srcY} H ${loopX} V ${dstY} H ${entryX}`;
    return { pathD, tipX: dstX, tipY: dstY, tipDirection: 'right' };
  }
}

// ---------------------------------------------------------------------------
// GanttArrows component
// ---------------------------------------------------------------------------

/**
 * GanttArrows renders all dependency connector arrows as an SVG overlay
 * on top of the Gantt bars. Uses React.memo to avoid unnecessary re-renders
 * and useMemo to memoize the heavy path computation.
 *
 * SVG layer order (parent responsibility):
 *   Grid (background) → GanttArrows (middle) → GanttBar (foreground)
 *
 * In addition to work-item-to-work-item dependency arrows, this component
 * also draws milestone linkage arrows:
 *
 *   - Contributing arrows: work item end → milestone diamond (dashed)
 *   - Required arrows:     milestone diamond → work item start (dashed)
 */
export const GanttArrows = memo(function GanttArrows({
  dependencies,
  criticalPathSet,
  barRects,
  workItemTitles,
  colors,
  visible,
  milestonePoints,
  milestoneContributors,
  workItemRequiredMilestones,
  milestoneTitles,
}: GanttArrowsProps) {
  // Marker IDs are kept for potential future use with SVG marker-end attributes.
  // Currently arrowheads are rendered as separate polygon elements for full color control.
  const markerId = 'gantt-arrow-default';
  const markerIdCritical = 'gantt-arrow-critical';
  const markerIdMilestone = 'gantt-arrow-milestone';

  // Pre-compute all work-item-to-work-item arrow paths
  const arrows = useMemo(() => {
    return dependencies
      .map((dep, arrowIndex) => {
        const predRect = barRects.get(dep.predecessorId);
        const succRect = barRects.get(dep.successorId);
        if (!predRect || !succRect) return null;

        // An arrow is critical only if BOTH endpoints are on the critical path
        const isCritical =
          criticalPathSet.has(dep.predecessorId) && criticalPathSet.has(dep.successorId);

        const arrowPath = computeArrowPath(predRect, succRect, dep.dependencyType, arrowIndex);

        const predTitle = workItemTitles.get(dep.predecessorId) ?? dep.predecessorId;
        const succTitle = workItemTitles.get(dep.successorId) ?? dep.successorId;
        const typeLabel = DEPENDENCY_TYPE_LABELS[dep.dependencyType];
        const ariaLabel = `Dependency: ${predTitle} to ${succTitle}, ${typeLabel}`;

        return {
          key: `${dep.predecessorId}-${dep.successorId}-${dep.dependencyType}`,
          arrowPath,
          isCritical,
          ariaLabel,
        };
      })
      .filter((a): a is NonNullable<typeof a> => a !== null);
  }, [dependencies, barRects, criticalPathSet, workItemTitles]);

  // Pre-compute milestone linkage arrows
  const milestoneArrows = useMemo(() => {
    const results: Array<{
      key: string;
      pathD: string;
      tipX: number;
      tipY: number;
      tipDirection: 'right' | 'left';
      ariaLabel: string;
    }> = [];

    if (!milestonePoints || !milestoneContributors || !workItemRequiredMilestones) {
      return results;
    }

    // --- Contributing arrows: work item end → milestone diamond ---
    // For each milestone, for each contributing work item, draw an arrow
    // from the right edge of the work item bar to the milestone diamond.
    for (const [milestoneId, workItemIds] of milestoneContributors) {
      const milestonePoint = milestonePoints.get(milestoneId);
      if (!milestonePoint) continue;

      const milestoneTitle = milestoneTitles?.get(milestoneId) ?? `Milestone ${milestoneId}`;

      for (const workItemId of workItemIds) {
        const barRect = barRects.get(workItemId);
        if (!barRect) continue;

        const workItemTitle = workItemTitles.get(workItemId) ?? workItemId;

        // Source: right edge of work item bar, vertically centered
        const srcX = barRect.x + barRect.width + ARROW_STANDOFF;
        const srcY = barRect.rowIndex * ROW_HEIGHT + BAR_OFFSET_Y + BAR_HEIGHT / 2;

        // Destination: left side of diamond (diamond center is the target)
        const dstX = milestonePoint.x;
        const dstY = milestonePoint.y;

        const { pathD, tipX, tipY, tipDirection } = buildMilestoneOrthoPath(srcX, srcY, dstX, dstY);

        results.push({
          key: `milestone-contrib-${workItemId}-${milestoneId}`,
          pathD,
          tipX,
          tipY,
          tipDirection,
          ariaLabel: `${workItemTitle} contributes to milestone: ${milestoneTitle}`,
        });
      }
    }

    // --- Required arrows: milestone diamond → work item start ---
    // For each work item that requires a milestone, draw an arrow from
    // the milestone diamond to the left edge of the work item bar.
    for (const [workItemId, milestoneIds] of workItemRequiredMilestones) {
      const barRect = barRects.get(workItemId);
      if (!barRect) continue;

      const workItemTitle = workItemTitles.get(workItemId) ?? workItemId;

      for (const milestoneId of milestoneIds) {
        const milestonePoint = milestonePoints.get(milestoneId);
        if (!milestonePoint) continue;

        const milestoneTitle = milestoneTitles?.get(milestoneId) ?? `Milestone ${milestoneId}`;

        // Source: right side of diamond (diamond center)
        const srcX = milestonePoint.x;
        const srcY = milestonePoint.y;

        // Destination: left edge of work item bar, vertically centered
        const dstX = barRect.x - ARROW_STANDOFF;
        const dstY = barRect.rowIndex * ROW_HEIGHT + BAR_OFFSET_Y + BAR_HEIGHT / 2;

        const { pathD, tipX, tipY, tipDirection } = buildMilestoneOrthoPath(srcX, srcY, dstX, dstY);

        results.push({
          key: `milestone-req-${milestoneId}-${workItemId}`,
          pathD,
          tipX,
          tipY,
          tipDirection,
          ariaLabel: `Milestone: ${milestoneTitle} is required by ${workItemTitle}`,
        });
      }
    }

    return results;
  }, [
    milestonePoints,
    milestoneContributors,
    workItemRequiredMilestones,
    barRects,
    workItemTitles,
    milestoneTitles,
  ]);

  const hasArrows = arrows.length > 0 || milestoneArrows.length > 0;

  if (!hasArrows) {
    return null;
  }

  return (
    <g aria-hidden={visible ? undefined : true} data-testid="gantt-arrows">
      {/* SVG marker definitions for arrowheads (decorative — aria-hidden) */}
      <defs aria-hidden="true">
        {/* Default arrowhead */}
        <marker
          id={markerId}
          markerWidth={ARROWHEAD_SIZE}
          markerHeight={ARROWHEAD_SIZE}
          refX={ARROWHEAD_SIZE - 1}
          refY={ARROWHEAD_SIZE / 2}
          orient="auto"
        >
          <polygon
            points={`0,0 ${ARROWHEAD_SIZE},${ARROWHEAD_SIZE / 2} 0,${ARROWHEAD_SIZE}`}
            fill={colors.defaultArrow}
          />
        </marker>

        {/* Critical arrowhead */}
        <marker
          id={markerIdCritical}
          markerWidth={ARROWHEAD_SIZE}
          markerHeight={ARROWHEAD_SIZE}
          refX={ARROWHEAD_SIZE - 1}
          refY={ARROWHEAD_SIZE / 2}
          orient="auto"
        >
          <polygon
            points={`0,0 ${ARROWHEAD_SIZE},${ARROWHEAD_SIZE / 2} 0,${ARROWHEAD_SIZE}`}
            fill={colors.criticalArrow}
          />
        </marker>

        {/* Milestone arrowhead */}
        <marker
          id={markerIdMilestone}
          markerWidth={ARROWHEAD_SIZE}
          markerHeight={ARROWHEAD_SIZE}
          refX={ARROWHEAD_SIZE - 1}
          refY={ARROWHEAD_SIZE / 2}
          orient="auto"
        >
          <polygon
            points={`0,0 ${ARROWHEAD_SIZE},${ARROWHEAD_SIZE / 2} 0,${ARROWHEAD_SIZE}`}
            fill={colors.milestoneArrow}
          />
        </marker>
      </defs>

      {/* Render default arrows first, then critical (so critical are on top) */}
      {arrows
        .filter((a) => !a.isCritical)
        .map((a) => {
          const { arrowPath, key, ariaLabel } = a;
          const arrowhead = computeArrowhead(
            arrowPath.tipX,
            arrowPath.tipY,
            arrowPath.tipDirection,
            ARROWHEAD_SIZE,
          );
          return (
            <g key={key} opacity={visible ? 0.5 : 0} role="graphics-symbol" aria-label={ariaLabel}>
              <path
                d={arrowPath.pathD}
                stroke={colors.defaultArrow}
                strokeWidth={ARROW_STROKE_DEFAULT}
                className={styles.arrowDefault}
                aria-hidden="true"
              />
              <polygon
                points={arrowhead}
                fill={colors.defaultArrow}
                className={styles.arrowheadDefault}
                aria-hidden="true"
              />
            </g>
          );
        })}

      {/* Critical path arrows (rendered on top, full opacity, drop-shadow) */}
      {arrows
        .filter((a) => a.isCritical)
        .map((a) => {
          const { arrowPath, key, ariaLabel } = a;
          const arrowhead = computeArrowhead(
            arrowPath.tipX,
            arrowPath.tipY,
            arrowPath.tipDirection,
            ARROWHEAD_SIZE,
          );
          return (
            <g
              key={key}
              opacity={visible ? 1 : 0}
              filter="drop-shadow(0 0 2px rgba(220,38,38,0.4))"
              role="graphics-symbol"
              aria-label={ariaLabel}
            >
              <path
                d={arrowPath.pathD}
                stroke={colors.criticalArrow}
                strokeWidth={ARROW_STROKE_CRITICAL}
                className={styles.arrowCritical}
                aria-hidden="true"
              />
              <polygon
                points={arrowhead}
                fill={colors.criticalArrow}
                className={styles.arrowheadCritical}
                aria-hidden="true"
              />
            </g>
          );
        })}

      {/* Milestone linkage arrows (dashed, rendered above work-item arrows) */}
      {milestoneArrows.map((a) => {
        const arrowhead = computeArrowhead(a.tipX, a.tipY, a.tipDirection, ARROWHEAD_SIZE);
        return (
          <g
            key={a.key}
            opacity={visible ? 0.65 : 0}
            role="graphics-symbol"
            aria-label={a.ariaLabel}
          >
            <path
              d={a.pathD}
              stroke={colors.milestoneArrow}
              strokeWidth={ARROW_STROKE_MILESTONE}
              strokeDasharray={MILESTONE_ARROW_DASH}
              className={styles.arrowMilestone}
              aria-hidden="true"
            />
            <polygon
              points={arrowhead}
              fill={colors.milestoneArrow}
              className={styles.arrowheadMilestone}
              aria-hidden="true"
            />
          </g>
        );
      })}
    </g>
  );
});
