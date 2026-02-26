/**
 * CalendarItem — a work item block rendered inside a calendar day cell.
 *
 * Displays the item title (truncated), colored by a deterministic palette color
 * derived from the item ID (via getItemColor in calendarUtils).
 * Clicking navigates to the work item detail page.
 *
 * In month view: appears as a short colored bar spanning across days.
 * In week view: appears as a taller block with full title visible.
 *
 * Lane-aware positioning: the laneIndex prop controls the absolute vertical
 * offset within the parent items container, ensuring multi-day items render
 * at the same vertical position across all cells they span in a week row.
 */

import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react';
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
  /**
   * Lane index (0-based) assigned by the lane allocator.
   * Controls absolute vertical position within the items container.
   * When undefined the item is rendered in normal document flow.
   */
  laneIndex?: number;
  /**
   * Color index (1-8) derived from getItemColor(item.id).
   * Maps to --calendar-item-N-bg / --calendar-item-N-text tokens.
   */
  colorIndex?: number;
}

// ---------------------------------------------------------------------------
// Lane sizing constants (must match CalendarItem.module.css)
// ---------------------------------------------------------------------------

/** Height of a single lane in compact (month) mode, including gap below. */
export const LANE_HEIGHT_COMPACT = 20; // 18px item + 2px gap
/** Height of a single lane in full (week) mode, including gap below. */
export const LANE_HEIGHT_FULL = 26; // 22px item + 4px gap

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
  laneIndex,
  colorIndex,
}: CalendarItemProps) {
  const navigate = useNavigate();

  function handleClick() {
    void navigate(`/work-items/${item.id}`, { state: { from: 'timeline', view: 'calendar' } });
  }

  function handleKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  }

  // Status class retained for semantic / test compatibility.
  // Visual color is overridden by the inline palette colorStyle below.
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

  // Absolute positioning based on lane index
  const laneStyle: CSSProperties =
    laneIndex !== undefined
      ? {
          position: 'absolute',
          top: laneIndex * (compact ? LANE_HEIGHT_COMPACT : LANE_HEIGHT_FULL),
          left: 0,
          right: 0,
        }
      : {};

  // Palette color overrides the CSS status class color via inline style specificity.
  const colorStyle: CSSProperties =
    colorIndex !== undefined
      ? {
          background: `var(--calendar-item-${colorIndex}-bg)`,
          color: `var(--calendar-item-${colorIndex}-text)`,
        }
      : {};

  return (
    <div
      role="button"
      tabIndex={0}
      className={`${styles.item} ${statusClass} ${shapeClass} ${compact ? styles.compact : styles.full} ${isHighlighted ? styles.highlighted : ''}`}
      style={{ ...laneStyle, ...colorStyle }}
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
