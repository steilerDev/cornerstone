/**
 * WeekGrid — 7-column weekly calendar layout.
 *
 * Shows more vertical space per day for stacked work items.
 * Work items appear as blocks with full titles visible.
 * Milestones appear as diamond markers.
 *
 * Lane allocation: runs allocateLanes() across the full week so that multi-day
 * items occupy the same vertical lane in every day cell they span.
 * Each day cell is position:relative; items are positioned absolutely by lane.
 */

import { useMemo } from 'react';
import type { TimelineWorkItem, TimelineMilestone } from '@cornerstone/shared';
import { CalendarItem, LANE_HEIGHT_FULL } from './CalendarItem.js';
import { CalendarMilestone } from './CalendarMilestone.js';
import {
  getWeekDates,
  getItemsForDay,
  getMilestonesForDay,
  isItemStart,
  isItemEnd,
  allocateLanes,
  getItemColor,
  getContrastTextColor,
  DAY_NAMES,
  getMonthName,
  formatDateForAria,
} from './calendarUtils.js';
import styles from './WeekGrid.module.css';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface WeekGridProps {
  /** A Date object (UTC) representing any day in the week to display. */
  weekDate: Date;
  workItems: TimelineWorkItem[];
  milestones: TimelineMilestone[];
  onMilestoneClick?: (milestoneId: number) => void;
  /** The item ID currently being hovered (for cross-cell highlight). */
  hoveredItemId?: string | null;
  onItemMouseEnter?: (itemId: string, mouseX: number, mouseY: number) => void;
  onItemMouseLeave?: () => void;
  onItemMouseMove?: (mouseX: number, mouseY: number) => void;
  onMilestoneMouseEnter?: (milestoneId: number, mouseX: number, mouseY: number) => void;
  onMilestoneMouseLeave?: () => void;
  onMilestoneMouseMove?: (mouseX: number, mouseY: number) => void;
  /** True when the device is touch-primary (for two-tap interaction). */
  isTouchDevice?: boolean;
  /** ID of the item currently in "first-tap" state on touch. */
  activeTouchId?: string | null;
  /** Two-tap handler: first tap shows tooltip, second tap navigates. */
  onTouchTap?: (itemId: string, onNavigate: () => void) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WeekGrid({
  weekDate,
  workItems,
  milestones,
  onMilestoneClick,
  hoveredItemId = null,
  onItemMouseEnter,
  onItemMouseLeave,
  onItemMouseMove,
  onMilestoneMouseEnter,
  onMilestoneMouseLeave,
  onMilestoneMouseMove,
  isTouchDevice = false,
  activeTouchId = null,
  onTouchTap,
}: WeekGridProps) {
  const days = useMemo(() => getWeekDates(weekDate), [weekDate]);

  // Lane allocation for the entire week
  const laneMap = useMemo(() => {
    const weekStart = days[0].dateStr;
    const weekEnd = days[6].dateStr;
    return allocateLanes(weekStart, weekEnd, workItems);
  }, [days, workItems]);

  // Max lane across the whole week (to size each day cell consistently)
  const maxLane = useMemo(
    () => (laneMap.size > 0 ? Math.max(...Array.from(laneMap.values())) : -1),
    [laneMap],
  );

  // Minimum cell height = all lanes + space for milestones (use max milestones across days)
  const maxMilestonesInADay = useMemo(() => {
    return Math.max(0, ...days.map((d) => getMilestonesForDay(d.dateStr, milestones).length));
  }, [days, milestones]);

  const minCellHeight =
    maxLane >= 0
      ? (maxLane + 1) * LANE_HEIGHT_FULL + maxMilestonesInADay * LANE_HEIGHT_FULL
      : undefined;

  return (
    <div className={styles.grid} role="grid" aria-label="Weekly calendar">
      {/* Day column headers */}
      <div className={styles.headerRow} role="row">
        {days.map((day, i) => {
          const monthName = getMonthName(day.date.getUTCMonth() + 1);
          return (
            <div
              key={day.dateStr}
              className={[styles.headerCell, day.isToday ? styles.headerCellToday : ''].join(' ')}
              role="columnheader"
              aria-label={`${DAY_NAMES[i]} ${day.dayOfMonth} ${monthName}`}
            >
              <span className={styles.dayName}>{DAY_NAMES[i]}</span>
              <span
                className={[styles.dayNumber, day.isToday ? styles.dayNumberToday : ''].join(' ')}
              >
                {day.dayOfMonth}
              </span>
            </div>
          );
        })}
      </div>

      {/* Day columns */}
      <div className={styles.daysRow} role="row">
        {days.map((day) => {
          const dayItems = getItemsForDay(day.dateStr, workItems);
          const dayMilestones = getMilestonesForDay(day.dateStr, milestones);

          // Milestone top offset comes after all item lanes
          const milestoneTopOffset = maxLane >= 0 ? (maxLane + 1) * LANE_HEIGHT_FULL : 0;

          return (
            <div
              key={day.dateStr}
              className={[styles.dayCell, day.isToday ? styles.today : ''].join(' ')}
              style={
                minCellHeight !== undefined
                  ? { position: 'relative', minHeight: minCellHeight }
                  : { position: 'relative' }
              }
              role="gridcell"
              aria-label={formatDateForAria(day.dateStr)}
            >
              {/* Work item blocks */}
              {dayItems.map((item) => {
                const firstTagColor = item.tags?.[0]?.color ?? null;
                const tagTextColor =
                  firstTagColor != null ? getContrastTextColor(firstTagColor) : undefined;
                return (
                  <CalendarItem
                    key={item.id}
                    item={item}
                    isStart={isItemStart(day.dateStr, item)}
                    isEnd={isItemEnd(day.dateStr, item)}
                    compact={false}
                    isHighlighted={hoveredItemId === item.id}
                    onMouseEnter={onItemMouseEnter}
                    onMouseLeave={onItemMouseLeave}
                    onMouseMove={onItemMouseMove}
                    laneIndex={laneMap.get(item.id)}
                    colorIndex={firstTagColor != null ? undefined : getItemColor(item.id)}
                    tagColor={firstTagColor}
                    tagTextColor={tagTextColor}
                    isTouchDevice={isTouchDevice}
                    activeTouchId={activeTouchId}
                    onTouchTap={onTouchTap}
                  />
                );
              })}

              {/* Milestone markers — stacked below all item lanes */}
              {dayMilestones.map((m, mIdx) => (
                <div
                  key={m.id}
                  style={{
                    position: 'absolute',
                    top: milestoneTopOffset + mIdx * LANE_HEIGHT_FULL,
                    left: 0,
                    right: 0,
                    padding: '0 var(--spacing-2)',
                  }}
                >
                  <CalendarMilestone
                    milestone={m}
                    onMilestoneClick={onMilestoneClick}
                    onMouseEnter={onMilestoneMouseEnter}
                    onMouseLeave={onMilestoneMouseLeave}
                    onMouseMove={onMilestoneMouseMove}
                  />
                </div>
              ))}

              {/* Empty day placeholder */}
              {dayItems.length === 0 && dayMilestones.length === 0 && (
                <div className={styles.emptyDay} aria-hidden="true" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
