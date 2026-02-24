/**
 * CalendarItem — a work item block rendered inside a calendar day cell.
 *
 * Displays the item title (truncated), colored by work item status.
 * Clicking navigates to the work item detail page.
 *
 * In month view: appears as a short colored bar spanning across days.
 * In week view: appears as a taller block with full title visible.
 */

import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { TimelineWorkItem } from '@cornerstone/shared';
import styles from './CalendarItem.module.css';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface CalendarItemProps {
  item: TimelineWorkItem;
  /** True when this cell is the item's start date (show left rounded corner + title). */
  isStart: boolean;
  /** True when this cell is the item's end date (show right rounded corner). */
  isEnd: boolean;
  /** Compact mode for month view (shorter height, smaller text). */
  compact?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CalendarItem({ item, isStart, isEnd, compact = false }: CalendarItemProps) {
  const navigate = useNavigate();

  function handleClick() {
    void navigate(`/work-items/${item.id}`);
  }

  function handleKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  }

  const statusClass =
    item.status === 'completed'
      ? styles.completed
      : item.status === 'in_progress'
        ? styles.inProgress
        : item.status === 'blocked'
          ? styles.blocked
          : styles.notStarted;

  const shapeClass = [
    isStart ? styles.startRounded : styles.noStartRound,
    isEnd ? styles.endRounded : styles.noEndRound,
  ].join(' ');

  return (
    <div
      role="button"
      tabIndex={0}
      className={`${styles.item} ${statusClass} ${shapeClass} ${compact ? styles.compact : styles.full}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-label={`Work item: ${item.title}, status: ${item.status.replace('_', ' ')}`}
      title={item.title}
      data-testid="calendar-item"
    >
      {isStart && (
        <span className={styles.title} aria-hidden="true">
          {item.title}
        </span>
      )}
    </div>
  );
}
