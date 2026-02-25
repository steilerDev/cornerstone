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
  /** True when this item is hovered elsewhere — highlight all its cells. */
  isHighlighted?: boolean;
  /** Called when mouse enters this item — pass item ID for cross-cell highlight. */
  onHoverStart?: (itemId: string) => void;
  /** Called when mouse leaves this item. */
  onHoverEnd?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CalendarItem({
  item,
  isStart,
  isEnd,
  compact = false,
  isHighlighted = false,
  onHoverStart,
  onHoverEnd,
}: CalendarItemProps) {
  const navigate = useNavigate();

  function handleClick() {
    void navigate(`/work-items/${item.id}`, { state: { from: 'timeline' } });
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
      className={`${styles.item} ${statusClass} ${shapeClass} ${compact ? styles.compact : styles.full} ${isHighlighted ? styles.highlighted : ''}`}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => onHoverStart?.(item.id)}
      onMouseLeave={() => onHoverEnd?.()}
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
