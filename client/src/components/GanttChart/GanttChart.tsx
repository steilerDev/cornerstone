import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
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
import { GanttTooltip } from './GanttTooltip.js';
import type { GanttTooltipData, GanttTooltipPosition } from './GanttTooltip.js';
import { GanttMilestones, computeMilestoneStatus } from './GanttMilestones.js';
import type { MilestoneColors } from './GanttMilestones.js';
import { useGanttDrag } from './useGanttDrag.js';
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
  ghostBar: string;
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
    criticalBorder: readCssVar('--color-gantt-bar-critical-border'),
    ghostBar: readCssVar('--color-gantt-bar-ghost'),
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
  /** Called when user clicks on a work item bar or sidebar row. */
  onItemClick?: (id: string) => void;
  /** Whether to show dependency arrows. Default: true. */
  showArrows?: boolean;
  /**
   * Called after a successful drag-drop rescheduling.
   * Receives the item ID and old/new dates for toast display.
   */
  onItemRescheduled?: (
    itemId: string,
    oldStartDate: string,
    oldEndDate: string,
    newStartDate: string,
    newEndDate: string,
  ) => void;
  /**
   * Called when a drag-drop rescheduling fails.
   */
  onItemRescheduleError?: () => void;
  /**
   * Async function to persist date changes. Returns true on success.
   */
  onUpdateItemDates?: (itemId: string, startDate: string, endDate: string) => Promise<boolean>;
  /**
   * Called when user clicks a milestone diamond — passes milestone ID.
   */
  onMilestoneClick?: (milestoneId: number) => void;
}

export function GanttChart({
  data,
  zoom,
  onItemClick,
  showArrows = true,
  onItemRescheduled,
  onItemRescheduleError,
  onUpdateItemDates,
  onMilestoneClick,
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

  // ---------------------------------------------------------------------------
  // Drag state
  // ---------------------------------------------------------------------------

  const {
    dragState,
    handleBarPointerDown,
    handleSvgPointerMove,
    handleSvgPointerUp,
    handleSvgPointerCancel,
    getCursorForPosition,
  } = useGanttDrag();

  // Per-bar hover cursor state (zone under pointer)
  const [hoveredBarId, setHoveredBarId] = useState<string | null>(null);
  const [hoveredZoneCursor, setHoveredZoneCursor] = useState<string | null>(null);

  const handleDragCommit = useCallback(
    async (
      itemId: string,
      startDate: string,
      endDate: string,
      originalStartDate: string,
      originalEndDate: string,
    ) => {
      if (!onUpdateItemDates) return;

      const success = await onUpdateItemDates(itemId, startDate, endDate);
      if (success) {
        onItemRescheduled?.(itemId, originalStartDate, originalEndDate, startDate, endDate);
      } else {
        onItemRescheduleError?.();
      }
    },
    [onUpdateItemDates, onItemRescheduled, onItemRescheduleError],
  );

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  // Apply drag preview positions when dragging
  // ---------------------------------------------------------------------------

  const barData = useMemo(() => {
    return data.workItems.map((item, idx) => {
      let startDate = item.startDate;
      let endDate = item.endDate;

      // Apply drag preview for the item being dragged
      if (dragState && dragState.itemId === item.id) {
        startDate = dragState.previewStartDate;
        endDate = dragState.previewEndDate;
      }

      const position = computeBarPosition(startDate, endDate, idx, chartRange, zoom, today);
      return { item, position, startDate, endDate };
    });
  }, [data.workItems, chartRange, zoom, today, dragState]);

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

  // SVG height: work item rows + optional milestone row at bottom
  const hasMilestones = data.milestones.length > 0;
  const svgHeight = Math.max(
    data.workItems.length * ROW_HEIGHT,
    hasMilestones ? (data.workItems.length + 1) * ROW_HEIGHT : 0,
  );

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
  // SVG-level pointer handlers for drag
  // ---------------------------------------------------------------------------

  const handleSvgPointerMoveCallback = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      handleSvgPointerMove(event, svgRef.current, chartRange, zoom);
    },
    [handleSvgPointerMove, chartRange, zoom],
  );

  const handleSvgPointerUpCallback = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      handleSvgPointerUp(event, handleDragCommit);
    },
    [handleSvgPointerUp, handleDragCommit],
  );

  // Set SVG cursor during active drag
  const svgCursor = dragState?.zone === 'move' ? 'grabbing' : dragState ? 'col-resize' : undefined;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div
      className={styles.chartBody}
      role="img"
      aria-label={`Project timeline Gantt chart with ${data.workItems.length} work items`}
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
          <svg
            ref={svgRef}
            width={chartWidth}
            height={svgHeight}
            aria-hidden="true"
            data-testid="gantt-svg"
            style={svgCursor ? { cursor: svgCursor } : undefined}
            onPointerMove={handleSvgPointerMoveCallback}
            onPointerUp={handleSvgPointerUpCallback}
            onPointerCancel={handleSvgPointerCancel}
          >
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
              workItemTitles={workItemTitles}
              colors={arrowColors}
              visible={showArrows}
            />

            {/* Milestone diamond markers (below work item bars, above arrows) */}
            {hasMilestones && (
              <GanttMilestones
                milestones={data.milestones}
                chartRange={chartRange}
                zoom={zoom}
                rowCount={data.workItems.length}
                colors={colors.milestone}
                onMilestoneMouseEnter={(milestone, e) => {
                  if (dragState) return;
                  clearTooltipTimers();
                  // Capture trigger element for focus-return on Escape
                  tooltipTriggerElementRef.current = e.currentTarget;
                  const newPos: GanttTooltipPosition = { x: e.clientX, y: e.clientY };
                  showTimerRef.current = setTimeout(() => {
                    const milestoneStatus = computeMilestoneStatus(milestone);
                    setTooltipData({
                      kind: 'milestone',
                      title: milestone.title,
                      targetDate: milestone.targetDate,
                      projectedDate: milestone.projectedDate,
                      isCompleted: milestone.isCompleted,
                      isLate: milestoneStatus === 'late',
                      completedAt: milestone.completedAt,
                      linkedWorkItemCount: milestone.workItemIds.length,
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
                  if (dragState) {
                    setTooltipData(null);
                    return;
                  }
                  setTooltipPosition({ x: e.clientX, y: e.clientY });
                }}
                onMilestoneClick={onMilestoneClick}
              />
            )}

            {/* Work item bars (foreground layer) */}
            <g role="list" aria-label="Work item bars">
              {barData.map(({ item, position, startDate, endDate }, idx) => (
                <GanttBar
                  key={item.id}
                  id={item.id}
                  title={item.title}
                  status={item.status}
                  startDate={startDate}
                  endDate={endDate}
                  x={position.x}
                  width={position.width}
                  rowIndex={idx}
                  fill={colors.barColors[item.status]}
                  onClick={onItemClick}
                  isCritical={criticalPathSet.has(item.id)}
                  criticalBorderColor={colors.criticalBorder}
                  // Drag props
                  dragState={dragState}
                  ghostColor={colors.ghostBar}
                  onPointerDown={(e) => {
                    const resolvedStart = startDate ?? '';
                    const resolvedEnd = endDate ?? '';
                    if (!resolvedStart || !resolvedEnd) return;
                    const isTouch = e.pointerType === 'touch';
                    handleBarPointerDown(
                      e,
                      item.id,
                      position.x,
                      position.width,
                      resolvedStart,
                      resolvedEnd,
                      svgRef.current,
                      chartRange,
                      zoom,
                      isTouch,
                    );
                  }}
                  hoverZoneCursor={hoveredBarId === item.id ? hoveredZoneCursor : null}
                  onBarPointerMove={(e) => {
                    if (dragState) return; // Don't update cursor during active drag
                    const isTouch = e.pointerType === 'touch';
                    if (!svgRef.current) return;
                    const rect = svgRef.current.getBoundingClientRect();
                    const scrollLeft = chartScrollRef.current?.scrollLeft ?? 0;
                    const svgX = e.clientX - rect.left + scrollLeft;
                    const cursor = getCursorForPosition(svgX, position.x, position.width, isTouch);
                    setHoveredBarId(item.id);
                    setHoveredZoneCursor(cursor);
                  }}
                  onBarPointerLeave={() => {
                    if (hoveredBarId === item.id) {
                      setHoveredBarId(null);
                      setHoveredZoneCursor(null);
                    }
                  }}
                  // Tooltip accessibility
                  tooltipId={tooltipTriggerId === item.id ? TOOLTIP_ID : undefined}
                  // Tooltip props
                  onMouseEnter={(e) => {
                    // Suppress tooltip during drag
                    if (dragState) return;
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
                    if (dragState) {
                      setTooltipData(null);
                      setTooltipTriggerId(null);
                      return;
                    }
                    setTooltipPosition({ x: e.clientX, y: e.clientY });
                  }}
                />
              ))}
            </g>
          </svg>
        </div>
      </div>

      {/* Tooltip portal */}
      {tooltipData !== null && dragState === null && (
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
