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

import { useState, useCallback, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { TimelineWorkItem, TimelineMilestone, TimelineDependency } from '@cornerstone/shared';
import { useTouchTooltip } from '../../hooks/useTouchTooltip.js';
import { MonthGrid } from './MonthGrid.js';
import { WeekGrid } from './WeekGrid.js';
import { GanttTooltip } from '../GanttChart/GanttTooltip.js';
import type {
  GanttTooltipData,
  GanttTooltipPosition,
  GanttTooltipDependencyEntry,
} from '../GanttChart/GanttTooltip.js';
import { computeMilestoneStatus } from '../GanttChart/GanttMilestones.js';
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
import { computeActualDuration } from '../../lib/formatters.js';
import styles from './CalendarView.module.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CalendarMode = 'month' | 'week';

export interface CalendarViewProps {
  workItems: TimelineWorkItem[];
  milestones: TimelineMilestone[];
  /** Dependency edges — used to populate the tooltip Dependencies section. */
  dependencies?: TimelineDependency[];
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
// Tooltip debounce timings (matches GanttChart)
// ---------------------------------------------------------------------------

const TOOLTIP_SHOW_DELAY = 120;
const TOOLTIP_HIDE_DELAY = 80;
const TOOLTIP_ID = 'calendar-view-tooltip';

// ---------------------------------------------------------------------------
// CalendarView component
// ---------------------------------------------------------------------------

export function CalendarView({
  workItems,
  milestones,
  dependencies = [],
  onMilestoneClick,
}: CalendarViewProps) {
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

  // ---------------------------------------------------------------------------
  // Tooltip state
  // ---------------------------------------------------------------------------

  // Two-tap touch interaction state
  const { isTouchDevice, activeTouchId, handleTouchTap } = useTouchTooltip();

  const [tooltipData, setTooltipData] = useState<GanttTooltipData | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<GanttTooltipPosition>({ x: 0, y: 0 });
  const tooltipShowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearTooltipTimers() {
    if (tooltipShowTimerRef.current !== null) {
      clearTimeout(tooltipShowTimerRef.current);
      tooltipShowTimerRef.current = null;
    }
    if (tooltipHideTimerRef.current !== null) {
      clearTimeout(tooltipHideTimerRef.current);
      tooltipHideTimerRef.current = null;
    }
  }

  // Stable ID-keyed lookup maps for tooltip data construction
  const workItemById = useMemo(() => new Map(workItems.map((wi) => [wi.id, wi])), [workItems]);

  const milestoneById = useMemo(() => new Map(milestones.map((m) => [m.id, m])), [milestones]);

  // Build per-item dependency tooltip entries (predecessors + successors)
  const itemTooltipDepsMap = useMemo(() => {
    const map = new Map<string, GanttTooltipDependencyEntry[]>();
    const idToTitle = new Map(workItems.map((wi) => [wi.id, wi.title]));
    for (const dep of dependencies) {
      const predTitle = idToTitle.get(dep.predecessorId);
      const succTitle = idToTitle.get(dep.successorId);
      if (predTitle !== undefined) {
        // For the predecessor: this dep makes it a predecessor of the successor
        const existing = map.get(dep.predecessorId) ?? [];
        if (succTitle !== undefined) {
          existing.push({
            relatedTitle: succTitle,
            dependencyType: dep.dependencyType,
            role: 'successor',
          });
        }
        map.set(dep.predecessorId, existing);
      }
      if (succTitle !== undefined) {
        // For the successor: this dep makes it a successor of the predecessor
        const existing = map.get(dep.successorId) ?? [];
        if (predTitle !== undefined) {
          existing.push({
            relatedTitle: predTitle,
            dependencyType: dep.dependencyType,
            role: 'predecessor',
          });
        }
        map.set(dep.successorId, existing);
      }
    }
    return map;
  }, [dependencies, workItems]);

  // Build reverse map: milestone ID → work item IDs that depend on it (via requiredMilestoneIds)
  const milestoneRequiredBy = useMemo(() => {
    const map = new Map<number, string[]>();
    for (const item of workItems) {
      if (item.requiredMilestoneIds && item.requiredMilestoneIds.length > 0) {
        for (const milestoneId of item.requiredMilestoneIds) {
          const existing = map.get(milestoneId);
          if (existing) {
            existing.push(item.id);
          } else {
            map.set(milestoneId, [item.id]);
          }
        }
      }
    }
    return map;
  }, [workItems]);

  // When a first touch-tap occurs on a work item, show its tooltip and register for two-tap
  const handleCalendarItemTouchTap = useCallback(
    (itemId: string, onNavigate: () => void) => {
      const item = workItemById.get(itemId);
      if (item && activeTouchId !== itemId) {
        // First tap: build tooltip data and show it
        const today = new Date();
        const effectiveStart = item.actualStartDate ?? item.startDate;
        const effectiveEnd = item.actualEndDate ?? item.endDate;
        const actualDurationDays = computeActualDuration(effectiveStart, effectiveEnd, today);
        setTooltipData({
          kind: 'work-item',
          title: item.title,
          status: item.status,
          startDate: item.startDate,
          endDate: item.endDate,
          durationDays: item.durationDays,
          assignedUserName: item.assignedUser?.displayName ?? null,
          plannedDurationDays: item.durationDays,
          actualDurationDays,
          dependencies: itemTooltipDepsMap.get(itemId),
        });
        // Position tooltip at viewport center as a safe default for touch
        setTooltipPosition({
          x: typeof window !== 'undefined' ? window.innerWidth / 2 : 300,
          y: typeof window !== 'undefined' ? window.innerHeight / 3 : 200,
        });
      } else {
        // Same item second tap — hide tooltip (navigation will follow)
        setTooltipData(null);
      }
      handleTouchTap(itemId, () => {
        setTooltipData(null);
        onNavigate();
      });
    },
    [workItemById, activeTouchId, itemTooltipDepsMap, handleTouchTap],
  );

  const handleWorkItemMouseEnter = useCallback(
    (itemId: string, mouseX: number, mouseY: number) => {
      clearTooltipTimers();
      handleItemHoverStart(itemId);
      const item = workItemById.get(itemId);
      if (!item) return;
      tooltipShowTimerRef.current = setTimeout(() => {
        // Compute actual duration from actual/scheduled dates
        const today = new Date();
        const effectiveStart = item.actualStartDate ?? item.startDate;
        const effectiveEnd = item.actualEndDate ?? item.endDate;
        const actualDurationDays = computeActualDuration(effectiveStart, effectiveEnd, today);
        setTooltipData({
          kind: 'work-item',
          title: item.title,
          status: item.status,
          startDate: item.startDate,
          endDate: item.endDate,
          durationDays: item.durationDays,
          assignedUserName: item.assignedUser?.displayName ?? null,
          plannedDurationDays: item.durationDays,
          actualDurationDays,
          dependencies: itemTooltipDepsMap.get(itemId),
        });
        setTooltipPosition({ x: mouseX, y: mouseY });
      }, TOOLTIP_SHOW_DELAY);
    },
    [workItemById, handleItemHoverStart, itemTooltipDepsMap],
  );

  const handleWorkItemMouseLeave = useCallback(() => {
    clearTooltipTimers();
    handleItemHoverEnd();
    tooltipHideTimerRef.current = setTimeout(() => {
      setTooltipData(null);
    }, TOOLTIP_HIDE_DELAY);
  }, [handleItemHoverEnd]);

  const handleWorkItemMouseMove = useCallback((mouseX: number, mouseY: number) => {
    setTooltipPosition({ x: mouseX, y: mouseY });
  }, []);

  const handleMilestoneMouseEnter = useCallback(
    (milestoneId: number, mouseX: number, mouseY: number) => {
      clearTooltipTimers();
      const milestone = milestoneById.get(milestoneId);
      if (!milestone) return;
      tooltipShowTimerRef.current = setTimeout(() => {
        const milestoneStatus = computeMilestoneStatus(milestone);
        // Contributing items — work items directly linked to this milestone via workItemIds
        const linkedWorkItems = (milestone.workItemIds ?? [])
          .map((wid) => {
            const wi = workItemById.get(wid);
            return wi ? { id: wid, title: wi.title } : null;
          })
          .filter((x): x is { id: string; title: string } => x !== null);
        // Dependent items — work items that depend on this milestone (via requiredMilestoneIds)
        const dependentIds = milestoneRequiredBy.get(milestoneId) ?? [];
        const dependentWorkItems = dependentIds
          .map((wid) => {
            const wi = workItemById.get(wid);
            return wi ? { id: wid, title: wi.title } : null;
          })
          .filter((x): x is { id: string; title: string } => x !== null);
        setTooltipData({
          kind: 'milestone',
          title: milestone.title,
          targetDate: milestone.targetDate,
          projectedDate: milestone.projectedDate,
          isCompleted: milestone.isCompleted,
          isLate: milestoneStatus === 'late',
          completedAt: milestone.completedAt,
          linkedWorkItems,
          dependentWorkItems,
        });
        setTooltipPosition({ x: mouseX, y: mouseY });
      }, TOOLTIP_SHOW_DELAY);
    },
    [milestoneById, workItemById, milestoneRequiredBy],
  );

  const handleMilestoneMouseLeave = useCallback(() => {
    clearTooltipTimers();
    tooltipHideTimerRef.current = setTimeout(() => {
      setTooltipData(null);
    }, TOOLTIP_HIDE_DELAY);
  }, []);

  const handleMilestoneMouseMove = useCallback((mouseX: number, mouseY: number) => {
    setTooltipPosition({ x: mouseX, y: mouseY });
  }, []);

  // Read calendarMode from URL (default: month)
  const rawMode = searchParams.get('calendarMode');
  const calendarMode: CalendarMode = rawMode === 'week' ? 'week' : 'month';

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
            hoveredItemId={hoveredItemId}
            onItemMouseEnter={handleWorkItemMouseEnter}
            onItemMouseLeave={handleWorkItemMouseLeave}
            onItemMouseMove={handleWorkItemMouseMove}
            onMilestoneMouseEnter={handleMilestoneMouseEnter}
            onMilestoneMouseLeave={handleMilestoneMouseLeave}
            onMilestoneMouseMove={handleMilestoneMouseMove}
            isTouchDevice={isTouchDevice}
            activeTouchId={activeTouchId}
            onTouchTap={handleCalendarItemTouchTap}
          />
        ) : (
          <WeekGrid
            weekDate={weekDate}
            workItems={workItems}
            milestones={milestones}
            onMilestoneClick={onMilestoneClick}
            hoveredItemId={hoveredItemId}
            onItemMouseEnter={handleWorkItemMouseEnter}
            onItemMouseLeave={handleWorkItemMouseLeave}
            onItemMouseMove={handleWorkItemMouseMove}
            onMilestoneMouseEnter={handleMilestoneMouseEnter}
            onMilestoneMouseLeave={handleMilestoneMouseLeave}
            onMilestoneMouseMove={handleMilestoneMouseMove}
            isTouchDevice={isTouchDevice}
            activeTouchId={activeTouchId}
            onTouchTap={handleCalendarItemTouchTap}
          />
        )}
      </div>

      {/* Tooltip portal — renders to document.body to avoid overflow clipping */}
      {tooltipData !== null && (
        <GanttTooltip data={tooltipData} position={tooltipPosition} id={TOOLTIP_ID} />
      )}
    </div>
  );
}
