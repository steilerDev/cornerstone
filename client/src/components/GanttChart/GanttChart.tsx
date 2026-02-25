import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import type { TimelineResponse, WorkItemStatus } from '@cornerstone/shared';
import {
  computeChartRange,
  computeChartWidth,
  computeBarPosition,
  generateGridLines,
  generateHeaderCells,
  dateToX,
  toUtcMidnight,
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
import { GanttTooltip } from './GanttTooltip.js';
import type { GanttTooltipData, GanttTooltipPosition } from './GanttTooltip.js';
import { GanttMilestones, computeMilestoneStatus } from './GanttMilestones.js';
import type { MilestoneColors } from './GanttMilestones.js';
import type { MilestonePoint } from './GanttArrows.js';
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
  arrowMilestone: string;
  criticalBorder: string;
  milestone: MilestoneColors;
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
    arrowMilestone: readCssVar('--color-gantt-arrow-milestone'),
    criticalBorder: readCssVar('--color-gantt-bar-critical-border'),
    milestone: {
      incompleteFill: readCssVar('--color-milestone-incomplete-fill') || 'transparent',
      incompleteStroke: readCssVar('--color-milestone-incomplete-stroke'),
      completeFill: readCssVar('--color-milestone-complete-fill'),
      completeStroke: readCssVar('--color-milestone-complete-stroke'),
      lateFill: readCssVar('--color-milestone-late-fill') || readCssVar('--color-danger'),
      lateStroke: readCssVar('--color-milestone-late-stroke') || readCssVar('--color-danger'),
      hoverGlow: readCssVar('--color-milestone-hover-glow'),
      completeHoverGlow: readCssVar('--color-milestone-complete-hover-glow'),
      lateHoverGlow: readCssVar('--color-milestone-late-hover-glow') || 'rgba(220, 38, 38, 0.25)',
    },
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
// Tooltip debounce helpers
// ---------------------------------------------------------------------------

const TOOLTIP_SHOW_DELAY = 120;
const TOOLTIP_HIDE_DELAY = 80;

// ---------------------------------------------------------------------------
// Main GanttChart component
// ---------------------------------------------------------------------------

export interface GanttChartProps {
  data: TimelineResponse;
  zoom: ZoomLevel;
  /** Custom column width (overrides the default for the zoom level). Used for zoom in/out. */
  columnWidth?: number;
  /** Called when user clicks on a work item bar or sidebar row. */
  onItemClick?: (id: string) => void;
  /** Whether to show dependency arrows. Default: true. */
  showArrows?: boolean;
  /**
   * Called when user clicks a milestone diamond — passes milestone ID.
   */
  onMilestoneClick?: (milestoneId: number) => void;
  /** Called when user scrolls with Ctrl held — for zoom via scroll. Positive = zoom in. */
  onCtrlScroll?: (delta: number) => void;
}

export function GanttChart({
  data,
  zoom,
  columnWidth,
  onItemClick,
  showArrows = true,
  onMilestoneClick,
  onCtrlScroll,
}: GanttChartProps) {
  // Refs for scroll synchronization
  const chartScrollRef = useRef<HTMLDivElement>(null);
  const sidebarScrollRef = useRef<HTMLDivElement>(null);
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const isScrollSyncing = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);

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

  const chartWidth = useMemo(
    () => computeChartWidth(chartRange, zoom, columnWidth),
    [chartRange, zoom, columnWidth],
  );

  const gridLines = useMemo(
    () => generateGridLines(chartRange, zoom, columnWidth),
    [chartRange, zoom, columnWidth],
  );

  const headerCells = useMemo(
    () => generateHeaderCells(chartRange, zoom, today, columnWidth),
    [chartRange, zoom, today, columnWidth],
  );

  // Today's x position (null if today is outside the visible range)
  const todayX = useMemo(() => {
    const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
    if (todayDate < chartRange.start || todayDate > chartRange.end) return null;
    return dateToX(todayDate, chartRange, zoom, columnWidth);
  }, [today, chartRange, zoom, columnWidth]);

  // ---------------------------------------------------------------------------
  // Tooltip state
  // ---------------------------------------------------------------------------

  const [tooltipData, setTooltipData] = useState<GanttTooltipData | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<GanttTooltipPosition>({ x: 0, y: 0 });
  // Track which item (bar or milestone) is currently hovered for aria-describedby
  const [tooltipTriggerId, setTooltipTriggerId] = useState<string | null>(null);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stable tooltip element ID for aria-describedby
  const TOOLTIP_ID = 'gantt-chart-tooltip';

  // Ref to the element that triggered the tooltip — used for focus-return on Escape
  const tooltipTriggerElementRef = useRef<Element | null>(null);

  function clearTooltipTimers() {
    if (showTimerRef.current !== null) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
    if (hideTimerRef.current !== null) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }

  // Close tooltip on Escape key and return focus to the triggering element
  useEffect(() => {
    if (tooltipData === null) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        clearTooltipTimers();
        setTooltipData(null);
        setTooltipTriggerId(null);
        // Return focus to the element that triggered the tooltip
        if (tooltipTriggerElementRef.current instanceof HTMLElement) {
          tooltipTriggerElementRef.current.focus();
        } else if (tooltipTriggerElementRef.current instanceof SVGElement) {
          (tooltipTriggerElementRef.current as SVGElement & { focus?: () => void }).focus?.();
        }
        tooltipTriggerElementRef.current = null;
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [tooltipData]);

  // Build a lookup map from item ID to TimelineWorkItem for tooltip data
  const workItemMap = useMemo(() => {
    const map = new Map(data.workItems.map((item) => [item.id, item]));
    return map;
  }, [data.workItems]);

  // Build a title map for GanttArrows aria-labels
  const workItemTitles = useMemo<ReadonlyMap<string, string>>(() => {
    return new Map(data.workItems.map((item) => [item.id, item.title]));
  }, [data.workItems]);

  // ---------------------------------------------------------------------------
  // Bar position data — computed once per render for all items
  // ---------------------------------------------------------------------------

  const barData = useMemo(() => {
    return data.workItems.map((item, idx) => {
      const position = computeBarPosition(
        item.startDate,
        item.endDate,
        idx,
        chartRange,
        zoom,
        today,
        columnWidth,
      );
      return { item, position };
    });
  }, [data.workItems, chartRange, zoom, today, columnWidth]);

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
    () => ({
      defaultArrow: colors.arrowDefault,
      criticalArrow: colors.arrowCritical,
      milestoneArrow: colors.arrowMilestone,
    }),
    [colors.arrowDefault, colors.arrowCritical, colors.arrowMilestone],
  );

  // SVG height: work item rows + individual milestone rows (one per milestone)
  const hasMilestones = data.milestones.length > 0;

  // ---------------------------------------------------------------------------
  // Milestone arrow data — positions and linkage maps for GanttArrows
  // ---------------------------------------------------------------------------

  /**
   * Map from milestone ID to its diamond center position in SVG coordinates.
   * Mirrors the positioning logic in GanttMilestones: each milestone occupies
   * its own row after all work item rows. The x position uses the active date
   * (projected for late milestones, target otherwise).
   */
  const milestonePoints = useMemo<ReadonlyMap<number, MilestonePoint>>(() => {
    const map = new Map<number, MilestonePoint>();
    if (!hasMilestones) return map;

    const workItemRowCount = data.workItems.length;

    data.milestones.forEach((milestone, milestoneIndex) => {
      const milestoneRowIndex = workItemRowCount + milestoneIndex;
      const y = milestoneRowIndex * ROW_HEIGHT + ROW_HEIGHT / 2;

      const status = computeMilestoneStatus(milestone);
      const isLate = status === 'late' && milestone.projectedDate !== null;

      // Use projected date for late milestones (matches GanttMilestones active diamond)
      const activeDateStr =
        isLate && milestone.projectedDate !== null ? milestone.projectedDate : milestone.targetDate;

      const x = dateToX(toUtcMidnight(activeDateStr), chartRange, zoom, columnWidth);

      map.set(milestone.id, { x, y });
    });

    return map;
  }, [data.milestones, data.workItems.length, hasMilestones, chartRange, zoom, columnWidth]);

  /**
   * Map from milestone ID → array of contributing work item IDs.
   * Derived from milestone.workItemIds (work items linked to the milestone).
   */
  const milestoneContributors = useMemo<ReadonlyMap<number, readonly string[]>>(() => {
    const map = new Map<number, readonly string[]>();
    for (const milestone of data.milestones) {
      if (milestone.workItemIds.length > 0) {
        map.set(milestone.id, milestone.workItemIds);
      }
    }
    return map;
  }, [data.milestones]);

  /**
   * Map from work item ID → array of required milestone IDs.
   * Derived from workItem.requiredMilestoneIds.
   */
  const workItemRequiredMilestones = useMemo<ReadonlyMap<string, readonly number[]>>(() => {
    const map = new Map<string, readonly number[]>();
    for (const item of data.workItems) {
      if (item.requiredMilestoneIds && item.requiredMilestoneIds.length > 0) {
        map.set(item.id, item.requiredMilestoneIds);
      }
    }
    return map;
  }, [data.workItems]);

  /**
   * Map from milestone ID → title for accessible aria-labels on milestone arrows.
   */
  const milestoneTitles = useMemo<ReadonlyMap<number, string>>(() => {
    return new Map(data.milestones.map((m) => [m.id, m.title]));
  }, [data.milestones]);

  // SVG height: work item rows + individual milestone rows (one per milestone)
  const totalRowCount = data.workItems.length + (hasMilestones ? data.milestones.length : 0);
  const svgHeight = Math.max(totalRowCount * ROW_HEIGHT, ROW_HEIGHT);

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
      role="img"
      aria-label={`Project timeline Gantt chart with ${data.workItems.length} work items and ${data.milestones.length} milestones`}
      data-testid="gantt-chart"
    >
      {/* Left sidebar — fixed during horizontal scroll, synced vertically */}
      <GanttSidebar
        items={data.workItems}
        milestones={data.milestones}
        onItemClick={onItemClick}
        ref={sidebarScrollRef}
      />

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
        <div
          ref={chartScrollRef}
          className={styles.canvasScroll}
          onScroll={handleChartScroll}
          onWheel={(e) => {
            if (e.ctrlKey && onCtrlScroll) {
              e.preventDefault();
              // Negative deltaY = scroll up = zoom in
              onCtrlScroll(-e.deltaY);
            }
          }}
        >
          <svg
            ref={svgRef}
            width={chartWidth}
            height={svgHeight}
            aria-hidden="true"
            data-testid="gantt-svg"
          >
            {/* Background: row stripes + grid lines + today marker */}
            <GanttGrid
              width={chartWidth}
              height={svgHeight}
              rowCount={totalRowCount}
              gridLines={gridLines}
              colors={colors}
              todayX={todayX}
            />

            {/* Dependency arrows (middle layer — above grid, below bars) */}
            <GanttArrows
              dependencies={data.dependencies}
              criticalPathSet={criticalPathSet}
              barRects={barRects}
              workItemTitles={workItemTitles}
              colors={arrowColors}
              visible={showArrows}
              milestonePoints={milestonePoints}
              milestoneContributors={milestoneContributors}
              workItemRequiredMilestones={workItemRequiredMilestones}
              milestoneTitles={milestoneTitles}
            />

            {/* Milestone diamond markers (below work item bars, above arrows) */}
            {hasMilestones && (
              <GanttMilestones
                milestones={data.milestones}
                chartRange={chartRange}
                zoom={zoom}
                rowCount={data.workItems.length}
                colors={colors.milestone}
                columnWidth={columnWidth}
                onMilestoneMouseEnter={(milestone, e) => {
                  clearTooltipTimers();
                  // Capture trigger element for focus-return on Escape
                  tooltipTriggerElementRef.current = e.currentTarget;
                  const newPos: GanttTooltipPosition = { x: e.clientX, y: e.clientY };
                  showTimerRef.current = setTimeout(() => {
                    const milestoneStatus = computeMilestoneStatus(milestone);
                    // Resolve linked work item titles from the data already available client-side
                    const linkedWorkItems = milestone.workItemIds
                      .map((wid) => {
                        const wi = workItemMap.get(wid);
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
                    });
                    setTooltipPosition(newPos);
                  }, TOOLTIP_SHOW_DELAY);
                }}
                onMilestoneMouseLeave={() => {
                  clearTooltipTimers();
                  hideTimerRef.current = setTimeout(() => {
                    setTooltipData(null);
                  }, TOOLTIP_HIDE_DELAY);
                }}
                onMilestoneMouseMove={(e) => {
                  setTooltipPosition({ x: e.clientX, y: e.clientY });
                }}
                onMilestoneClick={onMilestoneClick}
              />
            )}

            {/* Work item bars (foreground layer) */}
            <g role="list" aria-label="Work item bars">
              {barData.map(({ item, position }, idx) => (
                <GanttBar
                  key={item.id}
                  id={item.id}
                  title={item.title}
                  status={item.status}
                  startDate={item.startDate}
                  endDate={item.endDate}
                  x={position.x}
                  width={position.width}
                  rowIndex={idx}
                  fill={colors.barColors[item.status]}
                  onClick={onItemClick}
                  isCritical={criticalPathSet.has(item.id)}
                  criticalBorderColor={colors.criticalBorder}
                  // Tooltip accessibility
                  tooltipId={tooltipTriggerId === item.id ? TOOLTIP_ID : undefined}
                  // Tooltip props
                  onMouseEnter={(e) => {
                    clearTooltipTimers();
                    const tooltipItem = workItemMap.get(item.id);
                    if (!tooltipItem) return;
                    // Capture trigger element for focus-return on Escape
                    tooltipTriggerElementRef.current = e.currentTarget;
                    const newPos: GanttTooltipPosition = { x: e.clientX, y: e.clientY };
                    showTimerRef.current = setTimeout(() => {
                      setTooltipTriggerId(item.id);
                      setTooltipData({
                        kind: 'work-item',
                        title: tooltipItem.title,
                        status: tooltipItem.status,
                        startDate: tooltipItem.startDate,
                        endDate: tooltipItem.endDate,
                        durationDays: tooltipItem.durationDays,
                        assignedUserName: tooltipItem.assignedUser?.displayName ?? null,
                      });
                      setTooltipPosition(newPos);
                    }, TOOLTIP_SHOW_DELAY);
                  }}
                  onMouseLeave={() => {
                    clearTooltipTimers();
                    hideTimerRef.current = setTimeout(() => {
                      setTooltipData(null);
                      setTooltipTriggerId(null);
                    }, TOOLTIP_HIDE_DELAY);
                  }}
                  onMouseMove={(e) => {
                    setTooltipPosition({ x: e.clientX, y: e.clientY });
                  }}
                />
              ))}
            </g>
          </svg>
        </div>
      </div>

      {/* Tooltip portal */}
      {tooltipData !== null && (
        <GanttTooltip data={tooltipData} position={tooltipPosition} id={TOOLTIP_ID} />
      )}
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
