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
import type { CalendarColumnSize } from './CalendarView.js';
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
  columnSize?: CalendarColumnSize;
  /** The item ID currently being hovered (for cross-cell highlight). */
  hoveredItemId?: string | null;
  onItemHoverStart?: (itemId: string) => void;
  onItemHoverEnd?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WeekGrid({
  weekDate,
  workItems,
  milestones,
  onMilestoneClick,
  columnSize = 'default',
  hoveredItemId = null,
  onItemHoverStart,
  onItemHoverEnd,
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
    <div
      className={styles.grid}
      role="grid"
      aria-label="Weekly calendar"
      data-column-size={columnSize}
    >
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
              {dayItems.map((item) => (
                <CalendarItem
                  key={item.id}
                  item={item}
                  isStart={isItemStart(day.dateStr, item)}
                  isEnd={isItemEnd(day.dateStr, item)}
                  compact={false}
                  isHighlighted={hoveredItemId === item.id}
                  onHoverStart={onItemHoverStart}
                  onHoverEnd={onItemHoverEnd}
                  laneIndex={laneMap.get(item.id)}
                  colorIndex={getItemColor(item.id)}
                />
              ))}

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
                  <CalendarMilestone milestone={m} onMilestoneClick={onMilestoneClick} />
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
