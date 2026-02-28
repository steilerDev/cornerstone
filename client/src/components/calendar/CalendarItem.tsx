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

import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
} from 'react';
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
  /**
   * Called when mouse enters this item — passes item ID and mouse viewport coordinates
   * for cross-cell highlight and tooltip positioning.
   */
  onMouseEnter?: (itemId: string, mouseX: number, mouseY: number) => void;
  /** Called when mouse leaves this item. */
  onMouseLeave?: () => void;
  /** Called when mouse moves over this item — for updating tooltip position. */
  onMouseMove?: (mouseX: number, mouseY: number) => void;
  /**
   * Lane index (0-based) assigned by the lane allocator.
   * Controls absolute vertical position within the items container.
   * When undefined the item is rendered in normal document flow.
   */
  laneIndex?: number;
  /**
   * Color index (1-8) derived from getItemColor(item.id).
   * Maps to --calendar-item-N-bg / --calendar-item-N-text tokens.
   * Ignored when tagColor is provided.
   */
  colorIndex?: number;
  /**
   * Tag color hex string (e.g. '#3b82f6') from the item's first tag.
   * When provided, overrides the palette colorIndex with the actual tag color.
   */
  tagColor?: string | null;
  /**
   * Contrast-safe text color ('#ffffff' or '#000000') computed from tagColor.
   * Required when tagColor is provided.
   */
  tagTextColor?: string;
  /**
   * When true (touch device), clicking this item triggers a two-tap pattern:
   * first tap shows tooltip, second tap navigates. Managed by the parent.
   */
  isTouchDevice?: boolean;
  /**
   * ID of the item currently "touch-activated" (showing tooltip on touch).
   * When this equals item.id, navigate on next tap.
   */
  activeTouchId?: string | null;
  /**
   * Callback invoked on touch tap. Parent handles the two-tap state.
   * Called with item.id and a navigate callback.
   */
  onTouchTap?: (itemId: string, onNavigate: () => void) => void;
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
  onMouseEnter,
  onMouseLeave,
  onMouseMove,
  laneIndex,
  colorIndex,
  tagColor,
  tagTextColor,
  isTouchDevice = false,
  activeTouchId: _activeTouchId = null,
  onTouchTap,
}: CalendarItemProps) {
  const navigate = useNavigate();

  function doNavigate() {
    void navigate(`/work-items/${item.id}`, { state: { from: 'timeline', view: 'calendar' } });
  }

  function handleClick() {
    if (isTouchDevice && onTouchTap) {
      onTouchTap(item.id, doNavigate);
    } else {
      doNavigate();
    }
  }

  function handleKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  }

  function handleMouseEnter(e: ReactMouseEvent<HTMLDivElement>) {
    onMouseEnter?.(item.id, e.clientX, e.clientY);
  }

  function handleMouseMove(e: ReactMouseEvent<HTMLDivElement>) {
    onMouseMove?.(e.clientX, e.clientY);
  }

  // Status class retained for semantic / test compatibility.
  // Visual color is overridden by the inline palette colorStyle below.
  const statusClass =
    item.status === 'completed'
      ? styles.completed
      : item.status === 'in_progress'
        ? styles.inProgress
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

  // Tag color takes precedence over palette index; palette index overrides default status color.
  const colorStyle: CSSProperties =
    tagColor != null && tagTextColor != null
      ? { background: tagColor, color: tagTextColor }
      : colorIndex !== undefined
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
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => onMouseLeave?.()}
      onMouseMove={handleMouseMove}
      aria-label={`Work item: ${item.title}, status: ${item.status.replace('_', ' ')}`}
      aria-describedby="calendar-view-tooltip"
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
