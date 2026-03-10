import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { TimelineResponse, WorkItemStatus } from '@cornerstone/shared';
import { toUtcMidnight, addDays, daysBetween } from '../GanttChart/ganttUtils.js';
import styles from './MiniGanttCard.module.css';

interface MiniGanttCardProps {
  timeline: TimelineResponse;
}

// Mini gantt layout constants
const ROW_HEIGHT = 24;
const BAR_HEIGHT = 16;
const BAR_OFFSET_Y = 4;
const HEADER_HEIGHT = 24;
const CHART_WIDTH = 600;
const CHART_DAYS = 30;

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
    todayMarker: readCssVar('--color-gantt-today-marker'),
    arrowDefault: readCssVar('--color-gantt-arrow-default'),
    arrowCritical: readCssVar('--color-gantt-arrow-critical'),
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
 * Converts a date to an X position in the 30-day chart.
 */
function dateToX(date: Date, today: Date): number {
  const days = daysBetween(today, date);
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

  // Today's date (at noon UTC to match ganttUtils pattern)
  const today = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
  }, []);

  // Window: today through today + 30 days
  const windowEnd = useMemo(() => addDays(today, CHART_DAYS), [today]);

  // Filter work items that overlap the 30-day window
  const filteredWorkItems = useMemo(() => {
    return timeline.workItems.filter((item) => {
      if (!item.startDate || !item.endDate) return false;
      const start = toUtcMidnight(item.startDate);
      const end = toUtcMidnight(item.endDate);
      // Overlap check: item.start <= windowEnd AND item.end >= today
      return start <= windowEnd && end >= today;
    });
  }, [timeline.workItems, today, windowEnd]);

  // Build a map of work item IDs to row indices for dependency drawing
  const itemRowMap = useMemo(() => {
    const map = new Map<string, number>();
    filteredWorkItems.forEach((item, idx) => {
      map.set(item.id, idx);
    });
    return map;
  }, [filteredWorkItems]);

  // Filter dependencies to only those where both items are visible
  const visibleDependencies = useMemo(() => {
    return timeline.dependencies.filter(
      (dep) => itemRowMap.has(dep.predecessorId) && itemRowMap.has(dep.successorId),
    );
  }, [timeline.dependencies, itemRowMap]);

  // Filter milestones that fall within the 30-day window
  const visibleMilestones = useMemo(() => {
    return timeline.milestones.filter((m) => {
      const targetDate = toUtcMidnight(m.targetDate);
      return targetDate >= today && targetDate <= windowEnd;
    });
  }, [timeline.milestones, today, windowEnd]);

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

  // If no work items in the 30-day window, show empty state
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
          No work items in the next 30 days
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
        aria-label={`Mini Gantt: ${filteredWorkItems.length} work item${filteredWorkItems.length === 1 ? '' : 's'} in the next 30 days${visibleMilestones.length > 0 ? `, ${visibleMilestones.length} milestone${visibleMilestones.length === 1 ? '' : 's'}` : ''}`}
      >
        {/* Header background */}
        <rect x="0" y="0" width={CHART_WIDTH} height={HEADER_HEIGHT} fill={colors.gridMajor} />

        {/* Header day-of-month labels (every ~6 days) */}
        {Array.from({ length: 6 }).map((_, i) => {
          const dayIdx = i * 5;
          const labelDate = addDays(today, dayIdx);
          const x = dateToX(labelDate, today);
          const dayOfMonth = labelDate.getDate();
          return (
            <text
              key={`header-${i}`}
              x={x + 5}
              y={HEADER_HEIGHT - 6}
              fontSize="11"
              fill={colors.gridMinor}
              fontWeight="500"
            >
              {dayOfMonth}
            </text>
          );
        })}

        {/* Grid lines for each day */}
        {Array.from({ length: CHART_DAYS + 1 }).map((_, i) => {
          const lineDate = addDays(today, i);
          const x = dateToX(lineDate, today);
          const isMajor = i % 7 === 0; // Major line every Sunday
          return (
            <line
              key={`grid-${i}`}
              x1={x}
              y1={HEADER_HEIGHT}
              x2={x}
              y2={svgHeight}
              stroke={isMajor ? colors.gridMajor : colors.gridMinor}
              strokeWidth={isMajor ? 1 : 0.5}
              opacity={0.5}
            />
          );
        })}

        {/* Today marker line */}
        {(() => {
          const x = dateToX(today, today);
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

        {/* Work item bars and milestone diamonds rendered together by row */}
        {filteredWorkItems.map((item, rowIndex) => {
          const y = HEADER_HEIGHT + rowIndex * ROW_HEIGHT;
          const barY = y + BAR_OFFSET_Y;

          // Compute bar position
          const startDate = toUtcMidnight(item.startDate!);
          const endDate = toUtcMidnight(item.endDate!);
          const x = dateToX(startDate, today);
          const xEnd = dateToX(endDate, today);
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
            </g>
          );
        })}

        {/* Dependency arrows */}
        {visibleDependencies.map((dep, depIdx) => {
          const predRow = itemRowMap.get(dep.predecessorId);
          const succRow = itemRowMap.get(dep.successorId);
          if (predRow === undefined || succRow === undefined) return null;

          const predItem = filteredWorkItems[predRow];
          const succItem = filteredWorkItems[succRow];

          if (!predItem.endDate || !succItem.startDate) return null;

          const predEnd = toUtcMidnight(predItem.endDate);
          const succStart = toUtcMidnight(succItem.startDate);

          const predY = HEADER_HEIGHT + predRow * ROW_HEIGHT + ROW_HEIGHT / 2;
          const succY = HEADER_HEIGHT + succRow * ROW_HEIGHT + ROW_HEIGHT / 2;
          const x1 = dateToX(predEnd, today);
          const x2 = dateToX(succStart, today);

          const isCritical =
            timeline.criticalPath.includes(dep.predecessorId) &&
            timeline.criticalPath.includes(dep.successorId);
          const arrowColor = isCritical ? colors.arrowCritical : colors.arrowDefault;

          return (
            <line
              key={`arrow-${depIdx}`}
              x1={x1}
              y1={predY}
              x2={x2}
              y2={succY}
              stroke={arrowColor}
              strokeWidth="1"
              opacity="0.6"
            />
          );
        })}

        {/* Milestone diamonds */}
        {visibleMilestones.map((milestone) => {
          const targetDate = toUtcMidnight(milestone.targetDate);
          const x = dateToX(targetDate, today);
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
