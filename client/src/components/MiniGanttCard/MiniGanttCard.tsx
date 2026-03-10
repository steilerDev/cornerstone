import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { TimelineResponse, WorkItemStatus } from '@cornerstone/shared';
import { toUtcMidnight, addDays, daysBetween } from '../GanttChart/ganttUtils.js';
import styles from './MiniGanttCard.module.css';

interface MiniGanttCardProps {
  timeline: TimelineResponse;
}

// Mini gantt layout constants
const ROW_HEIGHT = 36;
const BAR_HEIGHT = 24;
const BAR_OFFSET_Y = 6;
const HEADER_HEIGHT = 32;
const CHART_WIDTH = 600;
const CHART_DAYS = 7;

/**
 * Reads a computed CSS custom property value from the document root.
 * Used because SVG stroke/fill attributes cannot use var() references.
 */
function readCssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/**
 * Resolves all colors needed for the mini Gantt chart.
 */
function resolveColors() {
  return {
    barColors: {
      not_started: readCssVar('--color-gantt-bar-not-started'),
      in_progress: readCssVar('--color-gantt-bar-in-progress'),
      completed: readCssVar('--color-gantt-bar-completed'),
    },
    barText: readCssVar('--color-text-inverse'),
    todayMarker: readCssVar('--color-gantt-today-marker'),
    criticalBorder: readCssVar('--color-gantt-bar-critical-border'),
    milestoneFill: readCssVar('--color-milestone-incomplete-fill') || 'transparent',
    milestoneCompleteFill: readCssVar('--color-milestone-complete-fill'),
    milestoneStroke: readCssVar('--color-milestone-incomplete-stroke'),
    gridMinor: readCssVar('--color-gantt-grid-minor'),
    gridMajor: readCssVar('--color-gantt-grid-major'),
  };
}

/**
 * Gets bar color for a work item status.
 */
function getBarColor(
  status: WorkItemStatus | undefined,
  colors: ReturnType<typeof resolveColors>,
): string {
  if (!status) return colors.barColors.not_started;
  const statusMap: Record<WorkItemStatus, keyof typeof colors.barColors> = {
    not_started: 'not_started',
    in_progress: 'in_progress',
    completed: 'completed',
  };
  return colors.barColors[statusMap[status] ?? 'not_started'];
}

/**
 * Converts a date to an X position in the week chart.
 */
function dateToX(date: Date, weekStart: Date): number {
  const days = daysBetween(weekStart, date);
  return (days / CHART_DAYS) * CHART_WIDTH;
}

/**
 * Mini Gantt Preview Card — a simplified read-only SVG Gantt chart for the dashboard.
 */
export function MiniGanttCard({ timeline }: MiniGanttCardProps) {
  const navigate = useNavigate();

  // CSS color values read from computed styles (updated on theme change)
  const [colors, setColors] = useState<ReturnType<typeof resolveColors>>(() => resolveColors());

  // Listen for theme changes and re-read colors
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setColors(resolveColors());
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);

  // Week start: Monday of the current week (at noon UTC)
  const weekStart = useMemo(() => {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
    const dayOfWeek = d.getDay(); // 0=Sun, 1=Mon...6=Sat
    const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    d.setDate(d.getDate() + daysToMonday);
    return d;
  }, []);

  // Week end: Sunday of the current week
  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);

  // Filter work items that overlap the weekly window
  const filteredWorkItems = useMemo(() => {
    return timeline.workItems.filter((item) => {
      if (!item.startDate || !item.endDate) return false;
      const start = toUtcMidnight(item.startDate);
      const end = toUtcMidnight(item.endDate);
      // Overlap check: item.start <= weekEnd AND item.end >= weekStart
      return start <= weekEnd && end >= weekStart;
    });
  }, [timeline.workItems, weekStart, weekEnd]);

  // Filter milestones that fall within the week
  const visibleMilestones = useMemo(() => {
    return timeline.milestones.filter((m) => {
      const targetDate = toUtcMidnight(m.targetDate);
      return targetDate >= weekStart && targetDate <= weekEnd;
    });
  }, [timeline.milestones, weekStart, weekEnd]);

  // SVG dimensions
  const svgHeight = useMemo(() => {
    const itemRowsHeight = filteredWorkItems.length * ROW_HEIGHT;
    return HEADER_HEIGHT + itemRowsHeight;
  }, [filteredWorkItems.length]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      navigate('/schedule');
    }
  };

  // If no work items in the week, show empty state
  if (filteredWorkItems.length === 0) {
    return (
      <div
        className={styles.container}
        onClick={() => navigate('/schedule')}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        aria-label="View full schedule"
      >
        <p className={styles.emptyState} data-testid="mini-gantt-empty">
          No work items scheduled this week
        </p>
      </div>
    );
  }

  return (
    <div
      className={styles.container}
      onClick={() => navigate('/schedule')}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label="View full schedule"
    >
      <svg
        className={styles.svg}
        viewBox={`0 0 ${CHART_WIDTH} ${svgHeight}`}
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label={`Mini Gantt: ${filteredWorkItems.length} work item${filteredWorkItems.length === 1 ? '' : 's'} scheduled this week${visibleMilestones.length > 0 ? `, ${visibleMilestones.length} milestone${visibleMilestones.length === 1 ? '' : 's'}` : ''}`}
      >
        {/* Header background */}
        <rect x="0" y="0" width={CHART_WIDTH} height={HEADER_HEIGHT} fill={colors.gridMajor} />

        {/* Header day-of-week labels (Mon, Tue, Wed, Thu, Fri, Sat, Sun) */}
        {Array.from({ length: 7 }).map((_, i) => {
          const labelDate = addDays(weekStart, i);
          const x = dateToX(labelDate, weekStart);
          const dayLabel = labelDate.toLocaleDateString('en-US', { weekday: 'short' });
          return (
            <text
              key={`header-${i}`}
              x={x + 4}
              y={HEADER_HEIGHT - 8}
              fontSize="11"
              fill={colors.gridMinor}
              fontWeight="500"
            >
              {dayLabel}
            </text>
          );
        })}

        {/* Grid lines for day boundaries (8 lines for 7 days) */}
        {Array.from({ length: 8 }).map((_, i) => {
          const lineDate = addDays(weekStart, i);
          const x = dateToX(lineDate, weekStart);
          return (
            <line
              key={`grid-${i}`}
              x1={x}
              y1={HEADER_HEIGHT}
              x2={x}
              y2={svgHeight}
              stroke={colors.gridMajor}
              strokeWidth="1"
              opacity="0.5"
            />
          );
        })}

        {/* Today marker line */}
        {(() => {
          const todayLocal = new Date();
          const todayNoon = new Date(todayLocal.getFullYear(), todayLocal.getMonth(), todayLocal.getDate(), 12, 0, 0, 0);
          const x = dateToX(todayNoon, weekStart);
          if (x < 0 || x > CHART_WIDTH) return null;
          return (
            <line
              key="today-marker"
              x1={x}
              y1={HEADER_HEIGHT}
              x2={x}
              y2={svgHeight}
              stroke={colors.todayMarker}
              strokeWidth="2"
              opacity="0.8"
            />
          );
        })()}

        {/* Work item bars rendered by row */}
        {filteredWorkItems.map((item, rowIndex) => {
          const y = HEADER_HEIGHT + rowIndex * ROW_HEIGHT;
          const barY = y + BAR_OFFSET_Y;

          // Compute bar position
          const startDate = toUtcMidnight(item.startDate!);
          const endDate = toUtcMidnight(item.endDate!);
          const x = dateToX(startDate, weekStart);
          const xEnd = dateToX(endDate, weekStart);
          const rawWidth = xEnd - x;
          const barWidth = Math.max(rawWidth, 4); // Minimum 4px width

          // Clamp to chart bounds
          const clampedX = Math.max(0, Math.min(x, CHART_WIDTH));
          const clampedWidth = Math.max(0, Math.min(barWidth, CHART_WIDTH - clampedX));

          const isCritical = timeline.criticalPath.includes(item.id);
          const barColor = getBarColor(item.status, colors);

          return (
            <g key={`row-${item.id}`}>
              {/* Work item bar */}
              <rect
                x={clampedX}
                y={barY}
                width={clampedWidth}
                height={BAR_HEIGHT}
                fill={barColor}
                rx="2"
                stroke={isCritical ? colors.criticalBorder : 'none'}
                strokeWidth={isCritical ? '2' : '0'}
              />
              {/* Title text on bar */}
              {clampedWidth >= 40 && (
                <text
                  x={clampedX + 4}
                  y={barY + BAR_HEIGHT / 2 + 4}
                  fontSize="11"
                  fill={colors.barText}
                  fontWeight="500"
                >
                  <tspan>{item.title.length > Math.floor(clampedWidth / 7) ? item.title.slice(0, Math.floor(clampedWidth / 7) - 1) + '…' : item.title}</tspan>
                </text>
              )}
            </g>
          );
        })}

        {/* Milestone diamonds */}
        {visibleMilestones.map((milestone) => {
          const targetDate = toUtcMidnight(milestone.targetDate);
          const x = dateToX(targetDate, weekStart);
          // Position milestone at the bottom of the chart area
          const mY = svgHeight - 8;

          // Diamond size
          const diamondSize = 8;

          // Build diamond polygon: top, right, bottom, left
          const points = [
            [x, mY - diamondSize],
            [x + diamondSize, mY],
            [x, mY + diamondSize],
            [x - diamondSize, mY],
          ];

          const isCritical = milestone.isCritical;
          const fillColor = milestone.isCompleted
            ? colors.milestoneCompleteFill
            : colors.milestoneFill;
          const strokeColor = isCritical ? colors.criticalBorder : colors.milestoneStroke;

          return (
            <polygon
              key={`milestone-${milestone.id}`}
              points={points.map((p) => p.join(',')).join(' ')}
              fill={fillColor}
              stroke={strokeColor}
              strokeWidth="1.5"
              opacity="0.7"
            />
          );
        })}
      </svg>
    </div>
  );
}

export default MiniGanttCard;
