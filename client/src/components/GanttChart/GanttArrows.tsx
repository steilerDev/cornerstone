import { memo, useMemo } from 'react';
import type { TimelineDependency, DependencyType } from '@cornerstone/shared';
import { computeArrowPath, computeArrowhead } from './arrowUtils.js';
import type { BarRect } from './arrowUtils.js';
import styles from './GanttArrows.module.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ArrowColors {
  /** Resolved color string for default (non-critical) arrows. */
  defaultArrow: string;
  /** Resolved color string for critical path arrows. */
  criticalArrow: string;
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
}

// ---------------------------------------------------------------------------
// Arrowhead size
// ---------------------------------------------------------------------------

const ARROWHEAD_SIZE = 6;
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
 */
export const GanttArrows = memo(function GanttArrows({
  dependencies,
  criticalPathSet,
  barRects,
  workItemTitles,
  colors,
  visible,
}: GanttArrowsProps) {
  // Marker IDs (stable — not dependent on colors since we use currentColor on markers)
  const markerId = 'gantt-arrow-default';
  const markerIdCritical = 'gantt-arrow-critical';

  // Pre-compute all arrow paths
  const arrows = useMemo(() => {
    return dependencies
      .map((dep) => {
        const predRect = barRects.get(dep.predecessorId);
        const succRect = barRects.get(dep.successorId);
        if (!predRect || !succRect) return null;

        // An arrow is critical only if BOTH endpoints are on the critical path
        const isCritical =
          criticalPathSet.has(dep.predecessorId) && criticalPathSet.has(dep.successorId);

        const arrowPath = computeArrowPath(predRect, succRect, dep.dependencyType);

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

  if (arrows.length === 0) {
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
              opacity={visible ? 0.5 : 0}
              role="graphics-symbol"
              aria-label={ariaLabel}
            >
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
    </g>
  );
});
