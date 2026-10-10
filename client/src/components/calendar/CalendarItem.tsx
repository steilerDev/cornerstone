/**
 * CalendarItem — a work item block rendered inside a calendar day cell.
 *
 * Displays the item title (truncated), coloured by the shared task status map
 * (useStatusBadgeVariants). One segment is rendered per calendar week.
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
  FocusEvent as ReactFocusEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TimelineWorkItem } from '@cornerstone/shared';
import { useStatusBadgeVariants } from '../../hooks/useStatusBadgeVariants.js';
import { useFormatters } from '../../lib/formatters.js';
import styles from './CalendarItem.module.css';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface CalendarItemProps {
  item: TimelineWorkItem;
  /** True when this segment contains the item's first day (no "←" shown). */
  isStart: boolean;
  /** True when this segment contains the item's last day (no "→" shown). */
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
  /** Day columns this segment covers (default 1). */
  span?: number;
  /** Lane height in px; defaults to the compact/full lane constant. */
  laneHeight?: number;
  /** Phone week view: 44px hit area. */
  touchSized?: boolean;
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
/** Height of a single lane in phone week view (44px hit area + 4px gap). */
export const LANE_HEIGHT_FULL_TOUCH = 48;

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
  span = 1,
  laneHeight,
  touchSized = false,
  isTouchDevice = false,
  activeTouchId: _activeTouchId = null,
  onTouchTap,
}: CalendarItemProps) {
  const navigate = useNavigate();
  const { t } = useTranslation('schedule');
  const { task } = useStatusBadgeVariants();
  const { formatDate } = useFormatters();

  function doNavigate() {
    void navigate(`/project/work-items/${item.id}`, {
      state: { from: 'schedule', view: 'calendar' },
    });
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

  const shapeClass = [
    isStart ? styles.startRounded : styles.noStartRound!,
    isEnd ? styles.endRounded : styles.noEndRound!,
  ].join(' ');

  const effectiveLaneHeight = laneHeight ?? (compact ? LANE_HEIGHT_COMPACT : LANE_HEIGHT_FULL);

  // Absolute positioning based on lane index (layout only, no colour)
  const laneStyle: CSSProperties =
    laneIndex !== undefined
      ? {
          position: 'absolute',
          top: laneIndex * effectiveLaneHeight,
          left: 0,
          right: span > 1 ? `calc(${1 - span} * (100% + 1px))` : 0,
          width: 'auto',
        }
      : {};

  const status = task[item.status].label;
  const start = formatDate(item.startDate);
  const end = formatDate(item.endDate);
  const ariaLabel = item.area
    ? t('calendar.item.ariaLabelWithArea', {
        title: item.title,
        status,
        area: item.area.name,
        start,
        end,
      })
    : t('calendar.item.ariaLabel', { title: item.title, status, start, end });

  function handleFocus(e: ReactFocusEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    onMouseEnter?.(item.id, r.left + r.width / 2, r.top + r.height / 2);
  }

  return (
    <div
      role="button"
      tabIndex={0}
      className={`${styles.item} ${task[item.status].className} ${shapeClass} ${compact ? styles.compact : styles.full} ${isHighlighted ? styles.highlighted : ''} ${touchSized ? styles.touchSized : ''}`}
      style={laneStyle}
      data-status={item.status}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => onMouseLeave?.()}
      onMouseMove={handleMouseMove}
      onFocus={handleFocus}
      onBlur={() => onMouseLeave?.()}
      aria-label={ariaLabel}
      aria-describedby="calendar-view-tooltip"
      data-testid="calendar-item"
    >
      {!isStart && (
        <span className={styles.continuation} aria-hidden="true">
          ←
        </span>
      )}
      <span className={styles.title} aria-hidden="true">
        {item.title}
      </span>
      {!isEnd && (
        <span className={styles.continuation} aria-hidden="true">
          →
        </span>
      )}
    </div>
  );
}
