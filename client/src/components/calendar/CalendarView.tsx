/**
 * CalendarView — main calendar component for the Timeline page.
 *
 * Accepts timeline data and renders a MonthGrid or WeekGrid depending on
 * the selected calendar sub-mode. Navigation (prev/next/today) is provided.
 * Calendar mode (month/week) is persisted in URL search params.
 *
 * URL params used:
 *   calendarMode=month|week   (defaults to "month")
 */

import { useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { TimelineWorkItem, TimelineMilestone } from '@cornerstone/shared';
import { MonthGrid } from './MonthGrid.js';
import { WeekGrid } from './WeekGrid.js';
import {
  parseIsoDate,
  formatIsoDate,
  prevMonth,
  nextMonth,
  prevWeek,
  nextWeek,
  getMonthName,
  DAY_NAMES,
  getWeekDates,
} from './calendarUtils.js';
import styles from './CalendarView.module.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CalendarMode = 'month' | 'week';
export type CalendarColumnSize = 'compact' | 'default' | 'comfortable';

export interface CalendarViewProps {
  workItems: TimelineWorkItem[];
  milestones: TimelineMilestone[];
  /** Called when user clicks a milestone diamond — opens the milestone panel. */
  onMilestoneClick?: (milestoneId: number) => void;
}

// ---------------------------------------------------------------------------
// Helper — get today's month/year and a Date object for today
// ---------------------------------------------------------------------------

function getTodayInfo(): { year: number; month: number; todayDate: Date } {
  const now = new Date();
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    todayDate: parseIsoDate(
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
    ),
  };
}

// ---------------------------------------------------------------------------
// Navigation icons
// ---------------------------------------------------------------------------

function ChevronLeftIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      aria-hidden="true"
      style={{ display: 'block' }}
    >
      <path
        d="M10 12L6 8l4-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      aria-hidden="true"
      style={{ display: 'block' }}
    >
      <path
        d="M6 4l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// CalendarView component
// ---------------------------------------------------------------------------

const COLUMN_SIZE_OPTIONS: { value: CalendarColumnSize; label: string }[] = [
  { value: 'compact', label: 'S' },
  { value: 'default', label: 'M' },
  { value: 'comfortable', label: 'L' },
];

export function CalendarView({ workItems, milestones, onMilestoneClick }: CalendarViewProps) {
  const [searchParams, setSearchParams] = useSearchParams();

  // Track which item is hovered for cross-cell highlighting
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleItemHoverStart = useCallback((itemId: string) => {
    if (hoverTimeoutRef.current !== null) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setHoveredItemId(itemId);
  }, []);

  const handleItemHoverEnd = useCallback(() => {
    // Small delay to prevent flicker when moving between cells of the same item
    hoverTimeoutRef.current = setTimeout(() => {
      setHoveredItemId(null);
    }, 50);
  }, []);

  // Read calendarMode from URL (default: month)
  const rawMode = searchParams.get('calendarMode');
  const calendarMode: CalendarMode = rawMode === 'week' ? 'week' : 'month';

  // Read column size from URL (default: 'default')
  const rawSize = searchParams.get('calendarSize');
  const columnSize: CalendarColumnSize =
    rawSize === 'compact' || rawSize === 'comfortable' ? rawSize : 'default';

  const { year: todayYear, month: todayMonth, todayDate } = getTodayInfo();

  // Month navigation state
  const [displayYear, setDisplayYear] = useState(todayYear);
  const [displayMonth, setDisplayMonth] = useState(todayMonth);

  // Week navigation state — store as ISO string to avoid stale reference
  const [weekDateStr, setWeekDateStr] = useState(() => formatIsoDate(todayDate));
  const weekDate = parseIsoDate(weekDateStr);

  // ---------------------------------------------------------------------------
  // Mode switching
  // ---------------------------------------------------------------------------

  const setMode = useCallback(
    (mode: CalendarMode) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('calendarMode', mode);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const setColumnSize = useCallback(
    (size: CalendarColumnSize) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (size === 'default') {
            next.delete('calendarSize');
          } else {
            next.set('calendarSize', size);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------

  function handlePrev() {
    if (calendarMode === 'month') {
      const { year, month } = prevMonth(displayYear, displayMonth);
      setDisplayYear(year);
      setDisplayMonth(month);
    } else {
      setWeekDateStr(formatIsoDate(prevWeek(weekDate)));
    }
  }

  function handleNext() {
    if (calendarMode === 'month') {
      const { year, month } = nextMonth(displayYear, displayMonth);
      setDisplayYear(year);
      setDisplayMonth(month);
    } else {
      setWeekDateStr(formatIsoDate(nextWeek(weekDate)));
    }
  }

  function handleToday() {
    setDisplayYear(todayYear);
    setDisplayMonth(todayMonth);
    setWeekDateStr(formatIsoDate(todayDate));
  }

  // ---------------------------------------------------------------------------
  // Navigation label
  // ---------------------------------------------------------------------------

  let navLabel: string;
  if (calendarMode === 'month') {
    navLabel = `${getMonthName(displayMonth)} ${displayYear}`;
  } else {
    const weekDays = getWeekDates(weekDate);
    const first = weekDays[0];
    const last = weekDays[6];
    const firstMonth = getMonthName(first.date.getUTCMonth() + 1);
    const lastMonth = getMonthName(last.date.getUTCMonth() + 1);
    if (firstMonth === lastMonth) {
      navLabel = `${firstMonth} ${first.dayOfMonth}–${last.dayOfMonth}, ${first.date.getUTCFullYear()}`;
    } else {
      navLabel = `${firstMonth} ${first.dayOfMonth} – ${lastMonth} ${last.dayOfMonth}, ${last.date.getUTCFullYear()}`;
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  // Determine the current week label for accessibility
  const weekDayLabels = getWeekDates(weekDate)
    .map((d) => `${DAY_NAMES[d.date.getUTCDay()]} ${d.dayOfMonth}`)
    .join(', ');

  return (
    <div className={styles.container} data-testid="calendar-view">
      {/* Calendar toolbar */}
      <div className={styles.calendarToolbar}>
        {/* Navigation: prev/today/next */}
        <div className={styles.navGroup}>
          <button
            type="button"
            className={styles.navButton}
            onClick={handlePrev}
            aria-label={calendarMode === 'month' ? 'Previous month' : 'Previous week'}
            title={calendarMode === 'month' ? 'Previous month' : 'Previous week'}
          >
            <ChevronLeftIcon />
          </button>

          <button
            type="button"
            className={styles.todayButton}
            onClick={handleToday}
            aria-label="Go to today"
          >
            Today
          </button>

          <button
            type="button"
            className={styles.navButton}
            onClick={handleNext}
            aria-label={calendarMode === 'month' ? 'Next month' : 'Next week'}
            title={calendarMode === 'month' ? 'Next month' : 'Next week'}
          >
            <ChevronRightIcon />
          </button>
        </div>

        {/* Current period label */}
        <h2 className={styles.periodLabel} aria-live="polite">
          {navLabel}
        </h2>

        {/* Column size toggle */}
        <div className={styles.columnSizeToggle} role="toolbar" aria-label="Column size">
          {COLUMN_SIZE_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              className={`${styles.modeButton} ${columnSize === value ? styles.modeButtonActive : ''}`}
              aria-pressed={columnSize === value}
              onClick={() => setColumnSize(value)}
              title={`${value.charAt(0).toUpperCase() + value.slice(1)} columns`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Month/Week toggle */}
        <div className={styles.modeToggle} role="toolbar" aria-label="Calendar display mode">
          <button
            type="button"
            className={`${styles.modeButton} ${calendarMode === 'month' ? styles.modeButtonActive : ''}`}
            aria-pressed={calendarMode === 'month'}
            onClick={() => setMode('month')}
          >
            Month
          </button>
          <button
            type="button"
            className={`${styles.modeButton} ${calendarMode === 'week' ? styles.modeButtonActive : ''}`}
            aria-pressed={calendarMode === 'week'}
            onClick={() => setMode('week')}
          >
            Week
          </button>
        </div>
      </div>

      {/* Calendar grid area */}
      <div
        className={styles.gridArea}
        aria-label={
          calendarMode === 'week'
            ? `Week of ${weekDayLabels}`
            : `${getMonthName(displayMonth)} ${displayYear}`
        }
      >
        {calendarMode === 'month' ? (
          <MonthGrid
            year={displayYear}
            month={displayMonth}
            workItems={workItems}
            milestones={milestones}
            onMilestoneClick={onMilestoneClick}
            columnSize={columnSize}
            hoveredItemId={hoveredItemId}
            onItemHoverStart={handleItemHoverStart}
            onItemHoverEnd={handleItemHoverEnd}
          />
        ) : (
          <WeekGrid
            weekDate={weekDate}
            workItems={workItems}
            milestones={milestones}
            onMilestoneClick={onMilestoneClick}
            columnSize={columnSize}
            hoveredItemId={hoveredItemId}
            onItemHoverStart={handleItemHoverStart}
            onItemHoverEnd={handleItemHoverEnd}
          />
        )}
      </div>
    </div>
  );
}
