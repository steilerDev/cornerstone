/**
 * WeekGrid — 7-column weekly calendar layout.
 *
 * Shows more vertical space per day for stacked work items.
 * Work items appear as blocks with full titles visible.
 * Milestones appear as diamond markers.
 *
 * Each item is one segment (getWeekSegments) rendered in the cell of its first
 * day and spanning its day columns; segments are positioned absolutely by lane.
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  TimelineWorkItem,
  TimelineMilestone,
  TimelineHouseholdItem,
} from '@cornerstone/shared';
import { useLocale } from '../../contexts/LocaleContext.js';
import { toBcp47Locale } from '../../lib/formatters.js';
import { useMediaQuery } from '../../hooks/useMediaQuery.js';
import { CalendarItem, LANE_HEIGHT_FULL, LANE_HEIGHT_FULL_TOUCH } from './CalendarItem.js';
import { CalendarMilestone } from './CalendarMilestone.js';
import { CalendarHouseholdItem } from './CalendarHouseholdItem.js';
import {
  getWeekDates,
  getMilestonesForDay,
  getHouseholdItemsForDay,
  getWeekSegments,
  getDayName,
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
  householdItems?: TimelineHouseholdItem[];
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
// Stable empty-array default (avoids unstable reference on every render)
// ---------------------------------------------------------------------------

const EMPTY_HOUSEHOLD_ITEMS: TimelineHouseholdItem[] = [];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WeekGrid({
  weekDate,
  workItems,
  milestones,
  householdItems = EMPTY_HOUSEHOLD_ITEMS,
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
  const { resolvedLocale } = useLocale();
  const localeString = toBcp47Locale(resolvedLocale);
  const { t } = useTranslation('schedule');
  const days = useMemo(() => getWeekDates(weekDate), [weekDate]);

  const isPhone = useMediaQuery('(max-width: 767px)');
  const laneHeight = isPhone ? LANE_HEIGHT_FULL_TOUCH : LANE_HEIGHT_FULL;

  const segments = useMemo(() => getWeekSegments(days, workItems), [days, workItems]);
  const lanes = segments.length > 0 ? Math.max(...segments.map((sg) => sg.lane)) + 1 : 0;

  // Busiest day's milestones + purchases stack below the item lanes
  const extras = useMemo(
    () =>
      Math.max(
        0,
        ...days.map(
          (d) =>
            getMilestonesForDay(d.dateStr, milestones).length +
            getHouseholdItemsForDay(d.dateStr, householdItems).length,
        ),
      ),
    [days, milestones, householdItems],
  );

  const totalLanes = lanes + extras;
  const minCellHeight = totalLanes > 0 ? totalLanes * laneHeight : undefined;
  const milestoneTopOffset = lanes * laneHeight;

  return (
    <div className={styles.grid} role="grid" aria-label={t('calendar.weeklyCalendarAriaLabel')}>
      {/* Day column headers */}
      <div className={styles.headerRow} role="row">
        {days.map((day, i) => {
          const monthName = getMonthName(day.date.getUTCMonth() + 1, localeString);
          const dayName = getDayName(i, localeString);
          return (
            <div
              key={day.dateStr}
              className={[styles.headerCell, day.isToday ? styles.headerCellToday : ''].join(' ')}
              role="columnheader"
              aria-label={`${dayName} ${day.dayOfMonth} ${monthName}`}
            >
              <span className={styles.dayName}>{dayName}</span>
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
        {days.map((day, dayCol) => {
          const dayMilestones = getMilestonesForDay(day.dateStr, milestones);

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
              aria-label={formatDateForAria(day.dateStr, localeString)}
            >
              {/* Work item blocks */}
              {segments
                .filter((sg) => sg.startCol === dayCol)
                .map((sg) => (
                  <CalendarItem
                    key={sg.item.id}
                    item={sg.item}
                    isStart={!sg.continuesFromPrevious}
                    isEnd={!sg.continuesToNext}
                    span={sg.span}
                    compact={false}
                    laneHeight={laneHeight}
                    touchSized={isPhone}
                    isHighlighted={hoveredItemId === sg.item.id}
                    onMouseEnter={onItemMouseEnter}
                    onMouseLeave={onItemMouseLeave}
                    onMouseMove={onItemMouseMove}
                    laneIndex={sg.lane}
                    isTouchDevice={isTouchDevice}
                    activeTouchId={activeTouchId}
                    onTouchTap={onTouchTap}
                  />
                ))}

              {/* Milestone markers — stacked below all item lanes */}
              {dayMilestones.map((m, mIdx) => (
                <div
                  key={m.id}
                  style={{
                    position: 'absolute',
                    top: milestoneTopOffset + mIdx * laneHeight,
                    left: 0,
                    right: 0,
                    padding: '0 var(--spacing-2)',
                  }}
                >
                  <CalendarMilestone
                    milestone={m}
                    onMilestoneClick={onMilestoneClick}
                    touchSized={isPhone}
                    onMouseEnter={onMilestoneMouseEnter}
                    onMouseLeave={onMilestoneMouseLeave}
                    onMouseMove={onMilestoneMouseMove}
                  />
                </div>
              ))}

              {/* Household items — stacked after milestones */}
              {getHouseholdItemsForDay(day.dateStr, householdItems).map((hi, hiIdx) => (
                <div
                  key={`hi-${hi.id}`}
                  style={{
                    position: 'absolute',
                    top: milestoneTopOffset + (dayMilestones.length + hiIdx) * laneHeight,
                    left: 0,
                    right: 0,
                    padding: '0 var(--spacing-2)',
                  }}
                >
                  <CalendarHouseholdItem
                    item={hi}
                    touchSized={isPhone}
                    onMouseEnter={onItemMouseEnter}
                    onMouseLeave={onItemMouseLeave}
                    onMouseMove={onItemMouseMove}
                    isTouchDevice={isTouchDevice}
                    activeTouchId={activeTouchId}
                    onTouchTap={onTouchTap}
                  />
                </div>
              ))}

              {/* Empty day placeholder */}
              {!segments.some((sg) => sg.startCol <= dayCol && dayCol < sg.startCol + sg.span) &&
                dayMilestones.length === 0 &&
                getHouseholdItemsForDay(day.dateStr, householdItems).length === 0 && (
                  <div className={styles.emptyDay} aria-hidden="true" />
                )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
