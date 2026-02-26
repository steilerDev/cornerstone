import { memo, useCallback, useMemo } from 'react';
import type { TimelineDependency, DependencyType } from '@cornerstone/shared';
import {
  computeArrowPath,
  computeArrowhead,
  ARROW_STANDOFF,
  ARROWHEAD_SIZE as ARROWHEAD_SIZE_IMPORT,
} from './arrowUtils.js';
import type { ArrowPath, BarRect } from './arrowUtils.js';
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
  /** Ordered array of work item IDs on the critical path (for implicit connections). */
  criticalPathOrder: readonly string[];
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

const ARROWHEAD_SIZE = ARROWHEAD_SIZE_IMPORT;
const ARROW_STROKE_DEFAULT = 1.5;
const ARROW_STROKE_CRITICAL = 2;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEPENDENCY_TYPE_LABELS: Record<DependencyType, string> = {
  finish_to_start: 'Finish-to-Start',
  start_to_start: 'Start-to-Start',
  finish_to_finish: 'Finish-to-Finish',
  start_to_finish: 'Start-to-Finish',
};

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
  criticalPathOrder,
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

  // Move hovered arrow group to end of parent so it paints on top (SVG z-order)
  const bringToFront = useCallback((e: React.MouseEvent<SVGGElement>) => {
    const target = e.currentTarget;
    const parent = target.parentElement;
    if (parent && parent.lastElementChild !== target) {
      parent.appendChild(target);
    }
  }, []);

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

  // Pre-compute milestone linkage arrows using the same 5-segment routing as dependency arrows
  const milestoneArrows = useMemo(() => {
    const results: Array<{
      key: string;
      arrowPath: ArrowPath;
      ariaLabel: string;
    }> = [];

    if (!milestonePoints || !milestoneContributors || !workItemRequiredMilestones) {
      return results;
    }

    // Helper: create a BarRect for a milestone diamond (zero width, positioned at center)
    function milestoneBarRect(milestoneId: number): BarRect | null {
      const point = milestonePoints!.get(milestoneId);
      if (!point) return null;
      // Compute row index from y position
      const rowIndex = Math.round((point.y - ROW_HEIGHT / 2) / ROW_HEIGHT);
      return { x: point.x, width: 0, rowIndex };
    }

    // --- Contributing arrows: work item end → milestone diamond (FS) ---
    for (const [milestoneId, workItemIds] of milestoneContributors) {
      const msRect = milestoneBarRect(milestoneId);
      if (!msRect) continue;

      const milestoneTitle = milestoneTitles?.get(milestoneId) ?? `Milestone ${milestoneId}`;

      for (const workItemId of workItemIds) {
        const barRect = barRects.get(workItemId);
        if (!barRect) continue;

        const workItemTitle = workItemTitles.get(workItemId) ?? workItemId;
        const arrowPath = computeArrowPath(barRect, msRect, 'finish_to_start', 0);

        results.push({
          key: `milestone-contrib-${workItemId}-${milestoneId}`,
          arrowPath,
          ariaLabel: `${workItemTitle} contributes to milestone: ${milestoneTitle}`,
        });
      }
    }

    // --- Required arrows: milestone diamond → work item start (FS) ---
    for (const [workItemId, milestoneIds] of workItemRequiredMilestones) {
      const barRect = barRects.get(workItemId);
      if (!barRect) continue;

      const workItemTitle = workItemTitles.get(workItemId) ?? workItemId;

      for (const milestoneId of milestoneIds) {
        const msRect = milestoneBarRect(milestoneId);
        if (!msRect) continue;

        const milestoneTitle = milestoneTitles?.get(milestoneId) ?? `Milestone ${milestoneId}`;
        const arrowPath = computeArrowPath(msRect, barRect, 'finish_to_start', 0);

        results.push({
          key: `milestone-req-${milestoneId}-${workItemId}`,
          arrowPath,
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

  // Pre-compute dotted connections between consecutive critical path items
  // that have no explicit dependency between them
  const implicitCriticalConnections = useMemo(() => {
    if (criticalPathOrder.length < 2 || criticalPathSet.size === 0) return [];

    // Build a set of existing dependency pairs for quick lookup
    const depPairs = new Set<string>();
    for (const dep of dependencies) {
      depPairs.add(`${dep.predecessorId}:${dep.successorId}`);
      depPairs.add(`${dep.successorId}:${dep.predecessorId}`);
    }

    const results: Array<{
      key: string;
      arrowPath: ArrowPath;
      ariaLabel: string;
    }> = [];

    for (let i = 0; i < criticalPathOrder.length - 1; i++) {
      const fromId = criticalPathOrder[i];
      const toId = criticalPathOrder[i + 1];

      // Skip if there's already an explicit dependency between them
      if (depPairs.has(`${fromId}:${toId}`)) continue;

      const fromRect = barRects.get(fromId);
      const toRect = barRects.get(toId);
      if (!fromRect || !toRect) continue;

      // Use FS arrow routing for the implicit connection
      const arrowPath = computeArrowPath(fromRect, toRect, 'finish_to_start', i);

      const fromTitle = workItemTitles.get(fromId) ?? fromId;
      const toTitle = workItemTitles.get(toId) ?? toId;

      results.push({
        key: `implicit-critical-${fromId}-${toId}`,
        arrowPath,
        ariaLabel: `Implicit critical path connection: ${fromTitle} to ${toTitle}`,
      });
    }

    return results;
  }, [criticalPathOrder, criticalPathSet, dependencies, barRects, workItemTitles]);

  const hasArrows =
    arrows.length > 0 || milestoneArrows.length > 0 || implicitCriticalConnections.length > 0;

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
            <g
              key={key}
              className={styles.arrowGroup}
              opacity={visible ? 0.5 : 0}
              role="graphics-symbol"
              aria-label={ariaLabel}
              onMouseEnter={bringToFront}
            >
              <path d={arrowPath.pathD} className={styles.arrowHitArea} aria-hidden="true" />
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
              className={styles.arrowGroup}
              opacity={visible ? 1 : 0}
              filter="drop-shadow(0 0 2px rgba(251,146,60,0.4))"
              role="graphics-symbol"
              aria-label={ariaLabel}
              onMouseEnter={bringToFront}
            >
              <path d={arrowPath.pathD} className={styles.arrowHitArea} aria-hidden="true" />
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

      {/* Milestone linkage arrows (same style as default work-item arrows) */}
      {milestoneArrows.map((a) => {
        const arrowhead = computeArrowhead(
          a.arrowPath.tipX,
          a.arrowPath.tipY,
          a.arrowPath.tipDirection,
          ARROWHEAD_SIZE,
        );
        return (
          <g
            key={a.key}
            className={styles.arrowGroup}
            opacity={visible ? 0.5 : 0}
            role="graphics-symbol"
            aria-label={a.ariaLabel}
            onMouseEnter={bringToFront}
          >
            <path d={a.arrowPath.pathD} className={styles.arrowHitArea} aria-hidden="true" />
            <path
              d={a.arrowPath.pathD}
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

      {/* Dotted connections between consecutive critical path items without explicit dependencies */}
      {implicitCriticalConnections.map((a) => {
        const arrowhead = computeArrowhead(
          a.arrowPath.tipX,
          a.arrowPath.tipY,
          a.arrowPath.tipDirection,
          ARROWHEAD_SIZE,
        );
        return (
          <g
            key={a.key}
            className={styles.arrowGroup}
            opacity={visible ? 0.7 : 0}
            role="graphics-symbol"
            aria-label={a.ariaLabel}
            onMouseEnter={bringToFront}
          >
            <path d={a.arrowPath.pathD} className={styles.arrowHitArea} aria-hidden="true" />
            <path
              d={a.arrowPath.pathD}
              stroke={colors.criticalArrow}
              strokeWidth={ARROW_STROKE_DEFAULT}
              className={styles.arrowDotted}
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
    </g>
  );
});
