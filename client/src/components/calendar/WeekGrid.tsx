/**
 * WeekGrid — 7-column weekly calendar layout.
 *
 * Shows more vertical space per day for stacked work items.
 * Work items appear as blocks with full titles visible.
 * Milestones appear as diamond markers.
 */

import { useMemo } from 'react';
import type { TimelineWorkItem, TimelineMilestone } from '@cornerstone/shared';
import { CalendarItem } from './CalendarItem.js';
import { CalendarMilestone } from './CalendarMilestone.js';
import {
  getWeekDates,
  getItemsForDay,
  getMilestonesForDay,
  isItemStart,
  isItemEnd,
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
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WeekGrid({ weekDate, workItems, milestones, onMilestoneClick }: WeekGridProps) {
  const days = useMemo(() => getWeekDates(weekDate), [weekDate]);

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

          return (
            <div
              key={day.dateStr}
              className={[styles.dayCell, day.isToday ? styles.today : ''].join(' ')}
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
                />
              ))}

              {/* Milestone markers */}
              {dayMilestones.map((m) => (
                <CalendarMilestone key={m.id} milestone={m} onMilestoneClick={onMilestoneClick} />
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
