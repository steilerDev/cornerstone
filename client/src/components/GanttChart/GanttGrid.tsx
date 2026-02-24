import { memo } from 'react';
import type { GridLine } from './ganttUtils.js';
import { ROW_HEIGHT } from './ganttUtils.js';

export interface GanttGridProps {
  /** Total width of the SVG canvas. */
  width: number;
  /** Total height of the SVG canvas. */
  height: number;
  /** Number of rows (work items) in the chart. */
  rowCount: number;
  /** Pre-computed vertical grid lines. */
  gridLines: GridLine[];
  /** Computed CSS color values (read from getComputedStyle for SVG compatibility). */
  colors: {
    rowEven: string;
    rowOdd: string;
    borderMinor: string;
    borderMajor: string;
    todayMarker: string;
  };
  /** X position of today's marker line (or null if today is out of range). */
  todayX: number | null;
}

/**
 * GanttGrid renders the SVG background:
 * - Alternating row stripe rectangles
 * - Vertical grid lines (major and minor)
 * - Horizontal row separators
 * - Today marker vertical line
 *
 * Uses React.memo — only re-renders when props change.
 */
export const GanttGrid = memo(function GanttGrid({
  width,
  height,
  rowCount,
  gridLines,
  colors,
  todayX,
}: GanttGridProps) {
  return (
    <>
      {/* Row stripes */}
      {Array.from({ length: rowCount }, (_, i) => (
        <rect
          key={`row-${i}`}
          x={0}
          y={i * ROW_HEIGHT}
          width={width}
          height={ROW_HEIGHT}
          fill={i % 2 === 0 ? colors.rowEven : colors.rowOdd}
        />
      ))}

      {/* Horizontal row separators */}
      {Array.from({ length: rowCount + 1 }, (_, i) => (
        <line
          key={`hline-${i}`}
          x1={0}
          y1={i * ROW_HEIGHT}
          x2={width}
          y2={i * ROW_HEIGHT}
          stroke={colors.borderMinor}
          strokeWidth={1}
          strokeOpacity={0.4}
        />
      ))}

      {/* Vertical grid lines */}
      {gridLines.map((line, idx) => (
        <line
          key={`vline-${idx}`}
          x1={line.x}
          y1={0}
          x2={line.x}
          y2={height}
          stroke={line.isMajor ? colors.borderMajor : colors.borderMinor}
          strokeWidth={1}
          strokeOpacity={line.isMajor ? 1.0 : 0.5}
        />
      ))}

      {/* Today marker */}
      {todayX !== null && (
        <line
          x1={todayX}
          y1={0}
          x2={todayX}
          y2={height}
          stroke={colors.todayMarker}
          strokeWidth={2}
          strokeOpacity={0.85}
          data-testid="gantt-today-marker"
        />
      )}
    </>
  );
});
