import { forwardRef, useRef, useCallback } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { TimelineWorkItem, TimelineMilestone } from '@cornerstone/shared';
import { ROW_HEIGHT, HEADER_HEIGHT } from './ganttUtils.js';
import styles from './GanttSidebar.module.css';

/** Discriminated union for interleaved sidebar rows. */
export type UnifiedRow =
  | { kind: 'workItem'; item: TimelineWorkItem }
  | { kind: 'milestone'; milestone: TimelineMilestone };

export interface GanttSidebarProps {
  items: TimelineWorkItem[];
  /** Milestones to display after work item rows, visually distinct. */
  milestones?: TimelineMilestone[];
  /** Unified sorted row list (interleaved work items + milestones). When provided, overrides separate items/milestones rendering. */
  unifiedRows?: UnifiedRow[];
  /** Called when user clicks a sidebar row — navigate to the work item. */
  onItemClick?: (id: string) => void;
}

/**
 * GanttSidebar renders the fixed left panel containing work item titles.
 * It is an HTML element (not SVG) for better text rendering and a11y.
 *
 * The ref is forwarded to the inner scrollable container for external scroll sync.
 *
 * Keyboard navigation:
 * - ArrowUp/ArrowDown: move focus between rows
 * - Enter/Space: activate (navigate to work item detail)
 */
export const GanttSidebar = forwardRef<HTMLDivElement, GanttSidebarProps>(function GanttSidebar(
  { items, milestones = [], unifiedRows, onItemClick },
  ref,
) {
  // Ref for the rows container to query row elements
  const rowsRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>, idx: number, itemId: string) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onItemClick?.(itemId);
        return;
      }

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const container = rowsRef.current;
        if (!container) return;

        const rows = container.querySelectorAll<HTMLDivElement>('[data-gantt-sidebar-row]');
        const nextIdx = e.key === 'ArrowDown' ? idx + 1 : idx - 1;

        if (nextIdx >= 0 && nextIdx < rows.length) {
          const nextRow = rows[nextIdx];
          nextRow.focus();
          // Scroll the row into view within the sidebar
          nextRow.scrollIntoView({ block: 'nearest' });
        }
      }
    },
    [onItemClick],
  );

  return (
    <div className={styles.sidebar} data-testid="gantt-sidebar">
      {/* Header cell matching the time header height */}
      <div
        className={styles.sidebarHeader}
        style={{ height: HEADER_HEIGHT }}
        aria-hidden="true"
        id="gantt-sidebar-header"
      >
        Work Item
      </div>

      {/* Scrollable rows container — ref is assigned here for scroll sync */}
      <div
        ref={(node) => {
          // Assign both the forwarded ref and our local ref
          rowsRef.current = node;
          if (typeof ref === 'function') {
            ref(node);
          } else if (ref) {
            ref.current = node;
          }
        }}
        className={styles.sidebarRows}
        role="list"
        aria-label="Work items and milestones"
      >
        {/* Render unified rows (interleaved work items + milestones) when available */}
        {unifiedRows
          ? unifiedRows.map((row, idx) => {
              const isEven = idx % 2 === 0;
              if (row.kind === 'workItem') {
                const item = row.item;
                const hasNoDates = !item.startDate && !item.endDate;
                const statusSuffix = hasNoDates ? ', no dates set' : '';
                return (
                  <div
                    key={item.id}
                    className={`${styles.sidebarRow} ${isEven ? styles.sidebarRowEven : styles.sidebarRowOdd}`}
                    style={{ height: ROW_HEIGHT }}
                    role="listitem"
                    tabIndex={0}
                    onClick={() => onItemClick?.(item.id)}
                    onKeyDown={(e) => handleKeyDown(e, idx, item.id)}
                    aria-label={`Work item: ${item.title}${statusSuffix}`}
                    data-testid={`gantt-sidebar-row-${item.id}`}
                    data-gantt-sidebar-row={idx}
                  >
                    <span
                      className={`${styles.sidebarRowLabel} ${hasNoDates ? styles.sidebarRowLabelMuted : ''}`}
                      title={item.title}
                    >
                      {item.title}
                    </span>
                  </div>
                );
              } else {
                const milestone = row.milestone;
                return (
                  <div
                    key={`milestone-${milestone.id}`}
                    className={`${styles.sidebarRow} ${styles.sidebarMilestoneRow} ${isEven ? styles.sidebarRowEven : styles.sidebarRowOdd}`}
                    style={{ height: ROW_HEIGHT }}
                    role="listitem"
                    aria-label={`Milestone: ${milestone.title}`}
                    data-testid={`gantt-sidebar-milestone-${milestone.id}`}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 10 10"
                      width="10"
                      height="10"
                      aria-hidden="true"
                      className={styles.milestoneDiamondIcon}
                      style={{ flexShrink: 0 }}
                    >
                      <polygon points="5,0 10,5 5,10 0,5" fill="currentColor" />
                    </svg>
                    <span className={styles.sidebarMilestoneLabel} title={milestone.title}>
                      {milestone.title}
                    </span>
                  </div>
                );
              }
            })
          : /* Fallback: render items then milestones (legacy) */
            items.map((item, idx) => {
              const hasNoDates = !item.startDate && !item.endDate;
              const isEven = idx % 2 === 0;
              const statusSuffix = hasNoDates ? ', no dates set' : '';
              return (
                <div
                  key={item.id}
                  className={`${styles.sidebarRow} ${isEven ? styles.sidebarRowEven : styles.sidebarRowOdd}`}
                  style={{ height: ROW_HEIGHT }}
                  role="listitem"
                  tabIndex={0}
                  onClick={() => onItemClick?.(item.id)}
                  onKeyDown={(e) => handleKeyDown(e, idx, item.id)}
                  aria-label={`Work item: ${item.title}${statusSuffix}`}
                  data-testid={`gantt-sidebar-row-${item.id}`}
                  data-gantt-sidebar-row={idx}
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
