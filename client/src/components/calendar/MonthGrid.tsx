/**
 * MonthGrid — standard 7-column (Sun–Sat) monthly calendar layout.
 *
 * Shows work items as multi-day bars spanning their start-to-end date range.
 * Milestones appear as diamond markers on their target date.
 * Days outside the current month are visually dimmed.
 *
 * Lane allocation: each week row runs allocateLanes() to give multi-day items
 * a consistent vertical lane index; each item is cut into one segment per week
 * row (getWeekSegments) that spans its day columns.  Rows grow to fit their lanes
 * plus the milestones and purchases of their busiest day.
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
import { CalendarItem, LANE_HEIGHT_COMPACT } from './CalendarItem.js';
import { CalendarMilestone } from './CalendarMilestone.js';
import { CalendarHouseholdItem } from './CalendarHouseholdItem.js';
import {
  getMonthGrid,
  getMilestonesForDay,
  getHouseholdItemsForDay,
  getWeekSegments,
  getDayName,
  getDayNameNarrow,
  getMonthName,
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

export function MonthGrid({
  year,
  month,
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
}: MonthGridProps) {
  const { resolvedLocale } = useLocale();
  const localeString = toBcp47Locale(resolvedLocale);
  const { t } = useTranslation('schedule');
  const weeks = useMemo(() => getMonthGrid(year, month), [year, month]);

  // Pre-compute the item segments of every week row.
  const weekSegments = useMemo(
    () => weeks.map((week) => getWeekSegments(week, workItems)),
    [weeks, workItems],
  );

  return (
    <div
      className={styles.grid}
      role="grid"
      aria-label={t('calendar.monthGridAriaLabel', {
        period: `${getMonthName(month, localeString)} ${year}`,
      })}
    >
      {/* Day name header row */}
      <div className={styles.headerRow} role="row">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => {
          const fullName = getDayName(i, localeString);
          const narrowName = getDayNameNarrow(i, localeString);
          return (
            <div key={i} className={styles.headerCell} role="columnheader" aria-label={fullName}>
              {/* Full name on tablet+, narrow initial on mobile */}
              <span className={styles.dayNameFull}>{fullName}</span>
              <span className={styles.dayNameNarrow}>{narrowName}</span>
            </div>
          );
        })}
      </div>

      {/* Week rows */}
      {weeks.map((week, weekIdx) => {
        const segments = weekSegments[weekIdx]!;
        const lanes = segments.length > 0 ? Math.max(...segments.map((sg) => sg.lane)) + 1 : 0;
        // Busiest day's milestones + purchases stack below the item lanes
        const extras = Math.max(
          0,
          ...week.map(
            (d) =>
              getMilestonesForDay(d.dateStr, milestones).length +
              getHouseholdItemsForDay(d.dateStr, householdItems).length,
          ),
        );
        const containerHeight = (lanes + extras) * LANE_HEIGHT_COMPACT;
        const milestoneTopOffset = lanes * LANE_HEIGHT_COMPACT;

        return (
          // eslint-disable-next-line @eslint-react/no-array-index-key -- static month grid; week index is a stable key here
          <div key={weekIdx} className={styles.weekRow} role="row" data-testid="calendar-week-row">
            {week.map((day) => {
              const dayCol = week.indexOf(day);
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
                  aria-label={formatDateForAria(day.dateStr, localeString)}
                >
                  {/* Date number */}
                  <div className={styles.dateNumber}>{day.dayOfMonth}</div>

                  {/* Work item bars + milestone diamonds */}
                  <div
                    className={styles.itemsContainer}
                    style={containerHeight > 0 ? { height: containerHeight } : undefined}
                  >
                    {segments
                      .filter((sg) => sg.startCol === dayCol)
                      .map((sg) => (
                        <CalendarItem
                          key={sg.item.id}
                          item={sg.item}
                          isStart={!sg.continuesFromPrevious}
                          isEnd={!sg.continuesToNext}
                          span={sg.span}
                          compact
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

                    {/* Milestone diamonds — stacked after all item lanes */}
                    {dayMilestones.map((m, mIdx) => (
                      <div
                        key={m.id}
                        style={{
                          position: 'absolute',
                          top: milestoneTopOffset + mIdx * LANE_HEIGHT_COMPACT,
                          left: 0,
                          right: 0,
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

                    {/* Household items — stacked after milestones */}
                    {getHouseholdItemsForDay(day.dateStr, householdItems).map((hi, hiIdx) => (
                      <div
                        key={`hi-${hi.id}`}
                        style={{
                          position: 'absolute',
                          top: (lanes + dayMilestones.length + hiIdx) * LANE_HEIGHT_COMPACT,
                          left: 0,
                          right: 0,
                        }}
                      >
                        <CalendarHouseholdItem
                          item={hi}
                          onMouseEnter={onItemMouseEnter}
                          onMouseLeave={onItemMouseLeave}
                          onMouseMove={onItemMouseMove}
                          isTouchDevice={isTouchDevice}
                          activeTouchId={activeTouchId}
                          onTouchTap={onTouchTap}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
