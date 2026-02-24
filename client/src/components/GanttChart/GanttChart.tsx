import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import type { TimelineResponse, WorkItemStatus } from '@cornerstone/shared';
import {
  computeChartRange,
  computeChartWidth,
  computeBarPosition,
  generateGridLines,
  generateHeaderCells,
  dateToX,
  type ZoomLevel,
  ROW_HEIGHT,
  HEADER_HEIGHT,
  BAR_OFFSET_Y,
  BAR_HEIGHT,
} from './ganttUtils.js';
import { GanttGrid } from './GanttGrid.js';
import { GanttBar } from './GanttBar.js';
import { GanttArrows } from './GanttArrows.js';
import type { BarRect } from './arrowUtils.js';
import { GanttHeader } from './GanttHeader.js';
import { GanttSidebar } from './GanttSidebar.js';
import styles from './GanttChart.module.css';

// ---------------------------------------------------------------------------
// Color resolution
// ---------------------------------------------------------------------------

/**
 * Reads a computed CSS custom property value from the document root.
 * Used because SVG stroke/fill attributes cannot use var() references.
 */
function readCssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

interface ChartColors {
  rowEven: string;
  rowOdd: string;
  borderMinor: string;
  borderMajor: string;
  todayMarker: string;
  barColors: Record<WorkItemStatus, string>;
  arrowDefault: string;
  arrowCritical: string;
  criticalBorder: string;
}

function resolveColors(): ChartColors {
  return {
    rowEven: readCssVar('--color-gantt-row-even'),
    rowOdd: readCssVar('--color-gantt-row-odd'),
    borderMinor: readCssVar('--color-gantt-grid-minor'),
    borderMajor: readCssVar('--color-gantt-grid-major'),
    todayMarker: readCssVar('--color-gantt-today-marker'),
    barColors: {
      not_started: readCssVar('--color-gantt-bar-not-started'),
      in_progress: readCssVar('--color-gantt-bar-in-progress'),
      completed: readCssVar('--color-gantt-bar-completed'),
      blocked: readCssVar('--color-gantt-bar-blocked'),
    },
    arrowDefault: readCssVar('--color-gantt-arrow-default'),
    arrowCritical: readCssVar('--color-gantt-arrow-critical'),
    criticalBorder: readCssVar('--color-gantt-bar-critical-border'),
  };
}

// ---------------------------------------------------------------------------
// Skeleton loading helpers
// ---------------------------------------------------------------------------

const SKELETON_ROW_COUNT = 10;
// Pre-defined width percentages (38–78%) to simulate varied bar widths
const SKELETON_BAR_WIDTHS = [65, 45, 78, 55, 42, 70, 60, 48, 72, 38];
const SKELETON_BAR_OFFSETS = [10, 25, 5, 35, 50, 15, 30, 20, 8, 45];

// ---------------------------------------------------------------------------
// Main GanttChart component
// ---------------------------------------------------------------------------

export interface GanttChartProps {
  data: TimelineResponse;
  zoom: ZoomLevel;
  /** Called when user clicks on a work item bar or sidebar row. */
  onItemClick?: (id: string) => void;
  /** Whether to show dependency arrows. Default: true. */
  showArrows?: boolean;
}

export function GanttChart({ data, zoom, onItemClick, showArrows = true }: GanttChartProps) {
  // Refs for scroll synchronization
  const chartScrollRef = useRef<HTMLDivElement>(null);
  const sidebarScrollRef = useRef<HTMLDivElement>(null);
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const isScrollSyncing = useRef(false);

  // CSS color values read from computed styles (updated on theme change)
  const [colors, setColors] = useState<ChartColors>(() => resolveColors());

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

  const today = useMemo(() => new Date(), []);

  // Determine chart date range from data or fallback around today
  const chartRange = useMemo(() => {
    if (data.dateRange) {
      return computeChartRange(data.dateRange.earliest, data.dateRange.latest, zoom);
    }
    // Fallback: show 3 months around today
    const padDate = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const todayStr = padDate(today);
    const threeMonthsLater = new Date(today.getFullYear(), today.getMonth() + 3, today.getDate());
    return computeChartRange(todayStr, padDate(threeMonthsLater), zoom);
  }, [data.dateRange, zoom, today]);

  const chartWidth = useMemo(() => computeChartWidth(chartRange, zoom), [chartRange, zoom]);

  const gridLines = useMemo(() => generateGridLines(chartRange, zoom), [chartRange, zoom]);

  const headerCells = useMemo(
    () => generateHeaderCells(chartRange, zoom, today),
    [chartRange, zoom, today],
  );

  // Today's x position (null if today is outside the visible range)
  const todayX = useMemo(() => {
    const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
    if (todayDate < chartRange.start || todayDate > chartRange.end) return null;
    return dateToX(todayDate, chartRange, zoom);
  }, [today, chartRange, zoom]);

  // Bar position data — computed once per render for all items
  const barData = useMemo(() => {
    return data.workItems.map((item, idx) => {
      const position = computeBarPosition(
        item.startDate,
        item.endDate,
        idx,
        chartRange,
        zoom,
        today,
      );
      return { item, position };
    });
  }, [data.workItems, chartRange, zoom, today]);

  // Set of critical path work item IDs for O(1) lookups
  const criticalPathSet = useMemo(() => new Set(data.criticalPath), [data.criticalPath]);

  // Map from work item ID to BarRect — used by GanttArrows for path computation
  const barRects = useMemo<ReadonlyMap<string, BarRect>>(() => {
    const map = new Map<string, BarRect>();
    barData.forEach(({ item, position }, idx) => {
      map.set(item.id, { x: position.x, width: position.width, rowIndex: idx });
    });
    return map;
  }, [barData]);

  // Arrow colors object — derived from resolved colors
  const arrowColors = useMemo(
    () => ({ defaultArrow: colors.arrowDefault, criticalArrow: colors.arrowCritical }),
    [colors.arrowDefault, colors.arrowCritical],
  );

  const svgHeight = data.workItems.length * ROW_HEIGHT;

  // ---------------------------------------------------------------------------
  // Scroll synchronization
  // ---------------------------------------------------------------------------

  /**
   * When the main chart canvas scrolls:
   * - Mirror vertical scroll to the sidebar rows container
   * - Mirror horizontal scroll to the header container
   * Uses requestAnimationFrame to prevent jank on large datasets.
   */
  const handleChartScroll = useCallback(() => {
    if (isScrollSyncing.current) return;

    const chartEl = chartScrollRef.current;
    if (!chartEl) return;

    requestAnimationFrame(() => {
      isScrollSyncing.current = true;

      if (sidebarScrollRef.current) {
        sidebarScrollRef.current.scrollTop = chartEl.scrollTop;
      }

      if (headerScrollRef.current) {
        headerScrollRef.current.scrollLeft = chartEl.scrollLeft;
      }

      isScrollSyncing.current = false;
    });
  }, []);

  // Scroll to today on first render and when zoom changes
  useEffect(() => {
    if (todayX !== null && chartScrollRef.current) {
      const el = chartScrollRef.current;
      const targetScrollLeft = Math.max(0, todayX - el.clientWidth / 2);
      el.scrollLeft = targetScrollLeft;
      if (headerScrollRef.current) {
        headerScrollRef.current.scrollLeft = targetScrollLeft;
      }
    }
  }, [todayX, zoom]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div
      className={styles.chartBody}
      role="region"
      aria-label={`Project timeline Gantt chart showing ${data.workItems.length} work items`}
      data-testid="gantt-chart"
    >
      {/* Left sidebar — fixed during horizontal scroll, synced vertically */}
      <GanttSidebar items={data.workItems} onItemClick={onItemClick} ref={sidebarScrollRef} />

      {/* Right area: time header + scrollable canvas */}
      <div className={styles.chartRight}>
        {/* Header — horizontal scroll mirrors canvas scroll (no visible scrollbar) */}
        <div ref={headerScrollRef} className={styles.headerScroll}>
          <GanttHeader
            cells={headerCells}
            zoom={zoom}
            todayX={todayX}
            totalWidth={chartWidth}
            todayColor={colors.todayMarker}
          />
        </div>

        {/* Scrollable canvas container (both axes) */}
        <div ref={chartScrollRef} className={styles.canvasScroll} onScroll={handleChartScroll}>
          <svg width={chartWidth} height={svgHeight} aria-hidden="true" data-testid="gantt-svg">
            {/* Background: row stripes + grid lines + today marker */}
            <GanttGrid
              width={chartWidth}
              height={svgHeight}
              rowCount={data.workItems.length}
              gridLines={gridLines}
              colors={colors}
              todayX={todayX}
            />

            {/* Dependency arrows (middle layer — above grid, below bars) */}
            <GanttArrows
              dependencies={data.dependencies}
              criticalPathSet={criticalPathSet}
              barRects={barRects}
              colors={arrowColors}
              visible={showArrows}
            />

            {/* Work item bars (foreground layer) */}
            <g role="list" aria-label="Work item bars">
              {barData.map(({ item, position }, idx) => (
                <GanttBar
                  key={item.id}
                  id={item.id}
                  title={item.title}
                  status={item.status}
                  x={position.x}
                  width={position.width}
                  rowIndex={idx}
                  fill={colors.barColors[item.status]}
                  onClick={onItemClick}
                  isCritical={criticalPathSet.has(item.id)}
                  criticalBorderColor={colors.criticalBorder}
                />
              ))}
            </g>
          </svg>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton loading component
// ---------------------------------------------------------------------------

export function GanttChartSkeleton() {
  return (
    <div className={styles.chartBody} data-testid="gantt-chart-skeleton" aria-busy="true">
      {/* Sidebar skeleton */}
      <div className={styles.sidebarSkeleton}>
        <div className={styles.sidebarSkeletonHeader} style={{ height: HEADER_HEIGHT }} />
        {Array.from({ length: SKELETON_ROW_COUNT }, (_, i) => (
          <div key={i} className={styles.sidebarSkeletonRow} style={{ height: ROW_HEIGHT }}>
            <div
              className={`${styles.skeleton} ${styles.skeletonSidebarRow}`}
              style={{ width: `${55 + (i % 3) * 15}%` }}
            />
          </div>
        ))}
      </div>

      {/* Chart area skeleton */}
      <div className={styles.chartRight}>
        <div className={styles.skeletonHeader} style={{ height: HEADER_HEIGHT }} />
        <div className={styles.skeletonCanvas}>
          {Array.from({ length: SKELETON_ROW_COUNT }, (_, i) => (
            <div
              key={i}
              className={i % 2 === 0 ? styles.skeletonRowEven : styles.skeletonRowOdd}
              style={{ height: ROW_HEIGHT, position: 'relative' }}
            >
              <div
                className={`${styles.skeleton} ${styles.skeletonBar}`}
                style={{
                  position: 'absolute',
                  left: `${SKELETON_BAR_OFFSETS[i]}%`,
                  width: `${SKELETON_BAR_WIDTHS[i]}%`,
                  top: BAR_OFFSET_Y,
                  height: BAR_HEIGHT,
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
