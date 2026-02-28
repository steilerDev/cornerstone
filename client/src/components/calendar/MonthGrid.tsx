/**
 * MonthGrid — standard 7-column (Sun–Sat) monthly calendar layout.
 *
 * Shows work items as multi-day bars spanning their start-to-end date range.
 * Milestones appear as diamond markers on their target date.
 * Days outside the current month are visually dimmed.
 *
 * Lane allocation: each week row runs allocateLanes() to give multi-day items
 * a consistent vertical lane index across all cells they span.  The items
 * container gets a fixed height sized to fit the maximum lane count.
 */

import { useMemo } from 'react';
import type { TimelineWorkItem, TimelineMilestone } from '@cornerstone/shared';
import { CalendarItem, LANE_HEIGHT_COMPACT } from './CalendarItem.js';
import { CalendarMilestone } from './CalendarMilestone.js';
import {
  getMonthGrid,
  getItemsForDay,
  getMilestonesForDay,
  isItemStart,
  isItemEnd,
  allocateLanes,
  getItemColor,
  getContrastTextColor,
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

export function MonthGrid({
  year,
  month,
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
}: MonthGridProps) {
  const weeks = useMemo(() => getMonthGrid(year, month), [year, month]);

  // Pre-compute lane allocations for every week row and color index per item.
  // Each week gets its own Map<itemId, laneIndex>.
  const weekLaneMaps = useMemo(
    () =>
      weeks.map((week) => {
        const weekStart = week[0].dateStr;
        const weekEnd = week[6].dateStr;
        return allocateLanes(weekStart, weekEnd, workItems);
      }),
    [weeks, workItems],
  );

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
      {weeks.map((week, weekIdx) => {
        const laneMap = weekLaneMaps[weekIdx];

        // Determine the maximum lane count for this week row (to size containers)
        const maxLane = laneMap.size > 0 ? Math.max(...Array.from(laneMap.values())) : -1;
        // Container height = (maxLane + 1) lanes + extra space for milestones
        const containerHeight = maxLane >= 0 ? (maxLane + 1) * LANE_HEIGHT_COMPACT : undefined;

        return (
          <div key={weekIdx} className={styles.weekRow} role="row">
            {week.map((day) => {
              const dayItems = getItemsForDay(day.dateStr, workItems);
              const dayMilestones = getMilestonesForDay(day.dateStr, milestones);

              // Calculate the milestone top offset: comes after all lanes
              const milestoneTopOffset = maxLane >= 0 ? (maxLane + 1) * LANE_HEIGHT_COMPACT : 0;

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

                  {/* Work item bars + milestone diamonds */}
                  <div
                    className={styles.itemsContainer}
                    style={
                      containerHeight !== undefined
                        ? {
                            height: containerHeight + dayMilestones.length * LANE_HEIGHT_COMPACT,
                          }
                        : undefined
                    }
                  >
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
                          compact
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
