/**
 * DateRangePicker — calendar-based date range selection component.
 *
 * Replaces native date inputs with a calendar view supporting:
 * - Two-phase selection (start date, then end date)
 * - Range highlighting with hover preview
 * - Auto-advance from start to end date selection
 * - Keyboard navigation (arrow keys, Enter, Space)
 * - Proper ARIA labels and keyboard accessibility
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  parseIsoDate,
  formatIsoDate,
  getTodayStr,
  getMonthGrid,
  getMonthName,
  getDayNameNarrow,
  formatDateForAria,
  prevMonth,
  nextMonth,
} from '../calendar/calendarUtils.js';
import { useLocale } from '../../contexts/LocaleContext.js';
import styles from './DateRangePicker.module.css';

export interface DateRangePickerProps {
  startDate: string; // YYYY-MM-DD or ''
  endDate: string; // YYYY-MM-DD or ''
  onChange: (startDate: string, endDate: string) => void;
  ariaLabel?: string;
}

type SelectionPhase = 'selecting-start' | 'selecting-end';

/**
 * ChevronLeftIcon — navigation arrow for previous month
 */
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

/**
 * ChevronRightIcon — navigation arrow for next month
 */
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
        d="M6 12l4-4-4-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function DateRangePicker({ startDate, endDate, onChange, ariaLabel }: DateRangePickerProps) {
  const { t } = useTranslation('common');
  const { locale } = useLocale();

  // Initialize phase based on startDate
  const [phase, setPhase] = useState<SelectionPhase>(
    startDate ? 'selecting-end' : 'selecting-start',
  );

  // Hover preview for range (only during end date selection)
  const [hoverDate, setHoverDate] = useState<string>('');

  // View state (month/year to display)
  const today = getTodayStr();
  const todayDate = parseIsoDate(today);
  const startDateDate = startDate ? parseIsoDate(startDate) : null;
  const initYear = startDateDate ? startDateDate.getUTCFullYear() : todayDate.getUTCFullYear();
  const initMonth = startDateDate ? startDateDate.getUTCMonth() + 1 : todayDate.getUTCMonth() + 1;

  const [viewYear, setViewYear] = useState<number>(initYear);
  const [viewMonth, setViewMonth] = useState<number>(initMonth);

  // Keyboard focus state
  const [focusedDate, setFocusedDate] = useState<string>(startDate || today);
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const focusedButtonRef = useRef<HTMLButtonElement>(null);
  const hasMountedRef = useRef(false);

  // Sync focusedDate ref for focus management (only after initial mount)
  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }
    if (focusedButtonRef.current) {
      focusedButtonRef.current.focus();
    }
  }, [focusedDate]);

  // Sync phase when incoming props change
  useEffect(() => {
    if (startDate === '') {
      setPhase('selecting-start');
    } else if (endDate === '') {
      setPhase('selecting-end');
    }
  }, [startDate, endDate]);

  // Get the effective end date for range display (hover preview or confirmed end)
  const effectiveEnd = phase === 'selecting-end' && hoverDate ? hoverDate : endDate;

  // Check if a day is in the highlighted range (strictly between start and end)
  const isInRange = useCallback(
    (dateStr: string): boolean => {
      return !!(startDate && effectiveEnd && dateStr > startDate && dateStr < effectiveEnd);
    },
    [startDate, effectiveEnd],
  );

  // Check if a day is the range start
  const isRangeStart = useCallback(
    (dateStr: string): boolean => {
      return (
        dateStr === startDate && (endDate !== '' || (phase === 'selecting-end' && hoverDate !== ''))
      );
    },
    [startDate, endDate, phase, hoverDate],
  );

  // Check if a day is the range end
  const isRangeEnd = useCallback(
    (dateStr: string): boolean => {
      return dateStr === effectiveEnd && startDate !== '';
    },
    [startDate, effectiveEnd],
  );

  // Handle day cell click
  const handleDayClick = useCallback(
    (dateStr: string) => {
      if (phase === 'selecting-start') {
        // First selection: emit start date, switch to end selection
        setPhase('selecting-end');
        setHoverDate('');
        onChange(dateStr, '');
        setFocusedDate(dateStr);
      } else {
        // Second selection (selecting-end)
        if (dateStr < startDate!) {
          // Clicking before start date: reset to new start
          setPhase('selecting-end');
          setHoverDate('');
          onChange(dateStr, '');
          setFocusedDate(dateStr);
        } else if (dateStr === startDate!) {
          // Clicking on start date again: clear everything
          setPhase('selecting-start');
          setHoverDate('');
          onChange('', '');
          setFocusedDate(dateStr);
        } else {
          // Normal end date selection
          setHoverDate('');
          onChange(startDate!, dateStr);
          setFocusedDate(dateStr);
        }
      }
    },
    [phase, startDate, onChange],
  );

  // Handle hover during end date selection
  const handleDayMouseEnter = useCallback(
    (dateStr: string) => {
      if (phase === 'selecting-end' && startDate) {
        setHoverDate(dateStr);
      }
    },
    [phase, startDate],
  );

  const handleDayMouseLeave = useCallback(() => {
    if (phase === 'selecting-end') {
      setHoverDate('');
    }
  }, [phase]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!gridContainerRef.current) return;

      const focusedDateObj = parseIsoDate(focusedDate);
      let newDate: Date | null = null;

      switch (e.key) {
        case 'ArrowRight':
          newDate = new Date(
            Date.UTC(
              focusedDateObj.getUTCFullYear(),
              focusedDateObj.getUTCMonth(),
              focusedDateObj.getUTCDate() + 1,
            ),
          );
          e.preventDefault();
          break;
        case 'ArrowLeft':
          newDate = new Date(
            Date.UTC(
              focusedDateObj.getUTCFullYear(),
              focusedDateObj.getUTCMonth(),
              focusedDateObj.getUTCDate() - 1,
            ),
          );
          e.preventDefault();
          break;
        case 'ArrowDown':
          newDate = new Date(
            Date.UTC(
              focusedDateObj.getUTCFullYear(),
              focusedDateObj.getUTCMonth(),
              focusedDateObj.getUTCDate() + 7,
            ),
          );
          e.preventDefault();
          break;
        case 'ArrowUp':
          newDate = new Date(
            Date.UTC(
              focusedDateObj.getUTCFullYear(),
              focusedDateObj.getUTCMonth(),
              focusedDateObj.getUTCDate() - 7,
            ),
          );
          e.preventDefault();
          break;
        case 'Enter':
        case ' ':
          // Select focused date
          handleDayClick(focusedDate);
          e.preventDefault();
          break;
        case 'Escape':
          if (phase === 'selecting-end' && endDate === '') {
            setPhase('selecting-start');
            setHoverDate('');
            onChange('', '');
          }
          e.preventDefault();
          break;
        default:
          return;
      }

      if (newDate) {
        const newDateStr = formatIsoDate(newDate);
        setFocusedDate(newDateStr);

        // Auto-navigate month if needed
        const newYear = newDate.getUTCFullYear();
        const newMonth = newDate.getUTCMonth() + 1;
        if (newYear !== viewYear || newMonth !== viewMonth) {
          setViewYear(newYear);
          setViewMonth(newMonth);
        }
      }
    },
    [focusedDate, viewYear, viewMonth, handleDayClick, phase, endDate, onChange],
  );

  // Month navigation
  const handlePrevMonth = useCallback(() => {
    const prev = prevMonth(viewYear, viewMonth);
    setViewYear(prev.year);
    setViewMonth(prev.month);
  }, [viewYear, viewMonth]);

  const handleNextMonth = useCallback(() => {
    const next = nextMonth(viewYear, viewMonth);
    setViewYear(next.year);
    setViewMonth(next.month);
  }, [viewYear, viewMonth]);

  // Render the calendar grid
  const weeks = getMonthGrid(viewYear, viewMonth);
  const monthName = getMonthName(viewMonth, locale);

  return (
    <div className={styles.picker}>
      {/* Month navigation */}
      <div className={styles.nav}>
        <button
          type="button"
          className={styles.navButton}
          onClick={handlePrevMonth}
          aria-label={t('dateRangePicker.previousMonth')}
        >
          <ChevronLeftIcon />
        </button>
        <div className={styles.monthLabel}>
          {monthName} {viewYear}
        </div>
        <button
          type="button"
          className={styles.navButton}
          onClick={handleNextMonth}
          aria-label={t('dateRangePicker.nextMonth')}
        >
          <ChevronRightIcon />
        </button>
      </div>

      {/* Week rows with day buttons */}
      <div
        className={styles.grid}
        role="grid"
        aria-label={t('dateRangePicker.calendarGridAriaLabel')}
        onKeyDown={handleKeyDown}
        ref={gridContainerRef}
      >
        {/* Header row with day names */}
        <div className={styles.weekRow} role="row">
          {[0, 1, 2, 3, 4, 5, 6].map((dayIndex) => (
            <div
              key={dayIndex}
              className={styles.dayHeader}
              role="columnheader"
              aria-label={getDayNameNarrow(dayIndex, locale)}
            >
              {getDayNameNarrow(dayIndex, locale)}
            </div>
          ))}
        </div>

        {weeks.map((week, weekIndex) => (
          <div key={weekIndex} className={styles.weekRow} role="row">
            {week.map((day) => {
              const isSelected = day.dateStr === startDate || day.dateStr === endDate;
              const inRange = isInRange(day.dateStr);
              const isStart = isRangeStart(day.dateStr);
              const isEnd = isRangeEnd(day.dateStr);
              const isDisabled = phase === 'selecting-end' && day.dateStr < startDate!;
              const isFocused = day.dateStr === focusedDate;

              return (
                <div
                  key={day.dateStr}
                  className={`${styles.dayCell} ${inRange ? styles.dayInRange : ''} ${
                    isStart ? styles.dayRangeStart : ''
                  } ${isEnd ? styles.dayRangeEnd : ''}`}
                  role="gridcell"
                >
                  <button
                    ref={isFocused ? focusedButtonRef : null}
                    type="button"
                    className={`${styles.dayButton} ${isSelected ? styles.daySelected : ''} ${
                      day.isToday ? styles.dayToday : ''
                    } ${!day.isCurrentMonth ? styles.dayOtherMonth : ''} ${
                      isDisabled ? styles.dayDisabled : ''
                    }`}
                    onClick={() => handleDayClick(day.dateStr)}
                    onMouseEnter={() => handleDayMouseEnter(day.dateStr)}
                    onMouseLeave={handleDayMouseLeave}
                    aria-label={formatDateForAria(day.dateStr)}
                    aria-pressed={isSelected}
                    tabIndex={isFocused ? 0 : -1}
                    disabled={isDisabled}
                  >
                    {day.dayOfMonth}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Phase indicator */}
      <div className={styles.phaseLabel}>
        {phase === 'selecting-start'
          ? t('dateRangePicker.selectStart')
          : t('dateRangePicker.selectEnd')}
      </div>
    </div>
  );
}
