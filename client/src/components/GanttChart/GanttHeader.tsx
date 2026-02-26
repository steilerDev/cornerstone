import { memo } from 'react';
import type { HeaderCell, ZoomLevel } from './ganttUtils.js';
import styles from './GanttHeader.module.css';

export interface GanttHeaderProps {
  cells: HeaderCell[];
  zoom: ZoomLevel;
  /** X position of today marker, for highlighting today's column header. */
  todayX: number | null;
  /** Total SVG/scroll width so the container matches the canvas. */
  totalWidth: number;
  /** Computed today marker color for the triangle indicator. */
  todayColor: string;
}

/**
 * GanttHeader renders the horizontal date label row above the chart canvas.
 * It is implemented as HTML (not SVG) for text rendering quality and accessibility.
 *
 * Uses React.memo — only re-renders when zoom or cells change.
 */
export const GanttHeader = memo(function GanttHeader({
  cells,
  zoom,
  totalWidth,
  todayX,
  todayColor,
}: GanttHeaderProps) {
  return (
    <div
      className={styles.header}
      style={{ width: totalWidth, position: 'relative' }}
      aria-hidden="true"
      data-testid="gantt-header"
    >
      {cells.map((cell, idx) => {
        if (zoom === 'day') {
          // Two-row sub-header: weekday above, day number below
          return (
            <div
              key={idx}
              className={`${styles.headerCell} ${cell.isToday ? styles.headerCellToday : ''}`}
              style={{ left: cell.x, width: cell.width }}
              aria-label={cell.date.toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              })}
            >
              <span className={styles.headerCellSublabel}>{cell.sublabel}</span>
              <span className={styles.headerCellLabel}>{cell.label}</span>
            </div>
          );
        }

        return (
          <div
            key={idx}
            className={`${styles.headerCell} ${cell.isToday ? styles.headerCellToday : ''}`}
            style={{ left: cell.x, width: cell.width }}
          >
            <span className={styles.headerCellLabel}>{cell.label}</span>
          </div>
        );
      })}

      {/* Today marker triangle indicator (pointing down from header bottom) */}
      {todayX !== null && (
        <div
          className={styles.todayTriangle}
          style={{
            left: todayX - 4,
            borderTopColor: todayColor,
          }}
          aria-hidden="true"
        />
      )}
    </div>
  );
});
