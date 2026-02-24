/**
 * MonthGrid — standard 7-column (Sun–Sat) monthly calendar layout.
 *
 * Shows work items as multi-day bars spanning their start-to-end date range.
 * Milestones appear as diamond markers on their target date.
 * Days outside the current month are visually dimmed.
 */

import { useMemo } from 'react';
import type { TimelineWorkItem, TimelineMilestone } from '@cornerstone/shared';
import { CalendarItem } from './CalendarItem.js';
import { CalendarMilestone } from './CalendarMilestone.js';
import {
  getMonthGrid,
  getItemsForDay,
  getMilestonesForDay,
  isItemStart,
  isItemEnd,
  DAY_NAMES,
  DAY_NAMES_NARROW,
  formatDateForAria,
} from './calendarUtils.js';
import styles from './MonthGrid.module.css';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface MonthGridProps {
  year: number;
  month: number; // 1-indexed
  workItems: TimelineWorkItem[];
  milestones: TimelineMilestone[];
  onMilestoneClick?: (milestoneId: number) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MonthGrid({
  year,
  month,
  workItems,
  milestones,
  onMilestoneClick,
}: MonthGridProps) {
  const weeks = useMemo(() => getMonthGrid(year, month), [year, month]);

  return (
    <div
      className={styles.grid}
      role="grid"
      aria-label={`Calendar for ${year}-${String(month).padStart(2, '0')}`}
    >
      {/* Day name header row */}
      <div className={styles.headerRow} role="row">
        {DAY_NAMES.map((name, i) => (
          <div key={name} className={styles.headerCell} role="columnheader" aria-label={name}>
            {/* Full name on tablet+, narrow initial on mobile */}
            <span className={styles.dayNameFull}>{name}</span>
            <span className={styles.dayNameNarrow}>{DAY_NAMES_NARROW[i]}</span>
          </div>
        ))}
      </div>

      {/* Week rows */}
      {weeks.map((week, weekIdx) => (
        <div key={weekIdx} className={styles.weekRow} role="row">
          {week.map((day) => {
            const dayItems = getItemsForDay(day.dateStr, workItems);
            const dayMilestones = getMilestonesForDay(day.dateStr, milestones);

            return (
              <div
                key={day.dateStr}
                className={[
                  styles.dayCell,
                  !day.isCurrentMonth ? styles.otherMonth : '',
                  day.isToday ? styles.today : '',
                ].join(' ')}
                role="gridcell"
                aria-label={formatDateForAria(day.dateStr)}
              >
                {/* Date number */}
                <div className={styles.dateNumber}>{day.dayOfMonth}</div>

                {/* Work item bars */}
                <div className={styles.itemsContainer}>
                  {dayItems.map((item) => (
                    <CalendarItem
                      key={item.id}
                      item={item}
                      isStart={isItemStart(day.dateStr, item)}
                      isEnd={isItemEnd(day.dateStr, item)}
                      compact
                    />
                  ))}

                  {/* Milestone diamonds */}
                  {dayMilestones.map((m) => (
                    <CalendarMilestone
                      key={m.id}
                      milestone={m}
                      onMilestoneClick={onMilestoneClick}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
