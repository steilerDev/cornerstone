import { forwardRef } from 'react';
import type { TimelineWorkItem } from '@cornerstone/shared';
import { ROW_HEIGHT, HEADER_HEIGHT } from './ganttUtils.js';
import styles from './GanttSidebar.module.css';

export interface GanttSidebarProps {
  items: TimelineWorkItem[];
  /** Called when user clicks a sidebar row — navigate to the work item. */
  onItemClick?: (id: string) => void;
}

/**
 * GanttSidebar renders the fixed left panel containing work item titles.
 * It is an HTML element (not SVG) for better text rendering and a11y.
 *
 * The ref is forwarded to the inner scrollable container for external scroll sync.
 */
export const GanttSidebar = forwardRef<HTMLDivElement, GanttSidebarProps>(function GanttSidebar(
  { items, onItemClick },
  ref,
) {
  return (
    <div className={styles.sidebar} data-testid="gantt-sidebar">
      {/* Header cell matching the time header height */}
      <div className={styles.sidebarHeader} style={{ height: HEADER_HEIGHT }} aria-hidden="true">
        Work Item
      </div>

      {/* Scrollable rows container — ref is assigned here for scroll sync */}
      <div ref={ref} className={styles.sidebarRows}>
        {items.map((item, idx) => {
          const hasNoDates = !item.startDate && !item.endDate;
          const isEven = idx % 2 === 0;
          return (
            <div
              key={item.id}
              className={`${styles.sidebarRow} ${isEven ? styles.sidebarRowEven : styles.sidebarRowOdd}`}
              style={{ height: ROW_HEIGHT }}
              role="listitem"
              tabIndex={0}
              onClick={() => onItemClick?.(item.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onItemClick?.(item.id);
                }
              }}
              aria-label={`Work item: ${item.title}`}
              data-testid={`gantt-sidebar-row-${item.id}`}
            >
              <span
                className={`${styles.sidebarRowLabel} ${hasNoDates ? styles.sidebarRowLabelMuted : ''}`}
                title={item.title}
              >
                {item.title}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
});
