import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import type { TimelineResponse, WorkItemStatus } from '@cornerstone/shared';
import { useTouchTooltip } from '../../hooks/useTouchTooltip.js';
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
import type { BarInteractionState } from './GanttBar.js';
import { GanttArrows } from './GanttArrows.js';
import type { BarRect } from './arrowUtils.js';
import { GanttHeader } from './GanttHeader.js';
import { GanttSidebar } from './GanttSidebar.js';
import { GanttTooltip } from './GanttTooltip.js';
import type {
  GanttTooltipData,
  GanttTooltipPosition,
  GanttTooltipDependencyEntry,
} from './GanttTooltip.js';
import { GanttMilestones, computeMilestoneStatus } from './GanttMilestones.js';
import type { MilestoneColors, MilestoneInteractionState } from './GanttMilestones.js';
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
// Duration helpers for tooltip (#333)
// ---------------------------------------------------------------------------

/**
 * Computes the actual/effective duration in calendar days from start and end date strings.
 * For items in-progress with only a start date, computes elapsed days from start to today.
 * Returns null if dates are not available.
 */
function computeActualDuration(
  startDate: string | null,
  endDate: string | null,
  today: Date,
): number | null {
  if (!startDate) return null;
  const startMs = new Date(startDate).getTime();
  const endMs = endDate ? new Date(endDate).getTime() : today.getTime();
  const diffDays = Math.round((endMs - startMs) / (1000 * 60 * 60 * 24));
  return diffDays >= 0 ? diffDays : null;
}

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
  /** Whether to highlight the critical path with distinct styling. Default: true. */
  highlightCriticalPath?: boolean;
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
  highlightCriticalPath = true,
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

  // ---------------------------------------------------------------------------
  // Item hover state — tracks which bar/milestone is hovered for dependency highlighting
  // ---------------------------------------------------------------------------

  /**
   * ID of the work item bar or milestone currently being hovered or focused.
   * Work item IDs are plain strings; milestone IDs are encoded as "milestone:<id>".
   * When null, no item hover is active.
   */
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Arrow hover state — tracks which arrow is hovered for dimming/highlighting
  // ---------------------------------------------------------------------------

  /**
   * When an arrow is hovered, holds the set of connected entity IDs.
   * Work item IDs are plain strings; milestone IDs are encoded as "milestone:<id>".
   * When null, no arrow hover is active.
   */
  const [hoveredArrowConnectedIds, setHoveredArrowConnectedIds] =
    useState<ReadonlySet<string> | null>(null);

  const handleArrowHover = useCallback(
    (
      connectedIds: ReadonlySet<string>,
      description: string,
      mousePos: { clientX: number; clientY: number },
    ) => {
      // Arrow hover takes precedence — clear any active item hover
      setHoveredItemId(null);
      setHoveredArrowConnectedIds(connectedIds);
      // Show the arrow tooltip immediately (no debounce — arrows are smaller targets)
      if (showTimerRef.current !== null) {
        clearTimeout(showTimerRef.current);
        showTimerRef.current = null;
      }
      if (hideTimerRef.current !== null) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      setTooltipData({ kind: 'arrow', description });
      setTooltipPosition({ x: mousePos.clientX, y: mousePos.clientY });
    },
    [showTimerRef, hideTimerRef],
  );

  const handleArrowMouseMove = useCallback((mousePos: { clientX: number; clientY: number }) => {
    setTooltipPosition({ x: mousePos.clientX, y: mousePos.clientY });
  }, []);

  const handleArrowLeave = useCallback(() => {
    setHoveredArrowConnectedIds(null);
    setHoveredItemId(null);
    if (showTimerRef.current !== null) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
    if (hideTimerRef.current !== null) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    setTooltipData(null);
    setTooltipTriggerId(null);
  }, [showTimerRef, hideTimerRef]);

  // Sort work items by start date ascending (nulls last) for waterfall ordering
  const sortedWorkItems = useMemo(() => {
    return [...data.workItems].sort((a, b) => {
      if (a.startDate === null && b.startDate === null) return 0;
      if (a.startDate === null) return 1;
      if (b.startDate === null) return -1;
      return a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0;
    });
  }, [data.workItems]);

  // Build a unified sorted row list interleaving work items and milestones by date.
  // Each row gets a globally unique rowIndex for sidebar and SVG positioning.
  type UnifiedRow =
    | { kind: 'workItem'; item: (typeof data.workItems)[0] }
    | { kind: 'milestone'; milestone: (typeof data.milestones)[0] };

  const unifiedRows = useMemo<UnifiedRow[]>(() => {
    // Helper: get effective sort date for a milestone
    function milestoneSortDate(m: (typeof data.milestones)[0]): string | null {
      if (m.isCompleted && m.completedAt) return m.completedAt.slice(0, 10);
      if (m.projectedDate) return m.projectedDate;
      return m.targetDate;
    }

    const workItemRows: UnifiedRow[] = sortedWorkItems.map((item) => ({ kind: 'workItem', item }));
    const milestoneRows: UnifiedRow[] = data.milestones.map((milestone) => ({
      kind: 'milestone',
      milestone,
    }));

    const all = [...workItemRows, ...milestoneRows];

    // Sort: by effective date ascending, nulls last; milestones after work items on the same date
    all.sort((a, b) => {
      const dateA = a.kind === 'workItem' ? a.item.startDate : milestoneSortDate(a.milestone);
      const dateB = b.kind === 'workItem' ? b.item.startDate : milestoneSortDate(b.milestone);

      if (dateA === null && dateB === null) return 0;
      if (dateA === null) return 1;
      if (dateB === null) return -1;
      if (dateA < dateB) return -1;
      if (dateA > dateB) return 1;
      // Same date: work items before milestones
      if (a.kind === 'workItem' && b.kind === 'milestone') return -1;
      if (a.kind === 'milestone' && b.kind === 'workItem') return 1;
      return 0;
    });

    return all;
  }, [sortedWorkItems, data.milestones]);

  // Derive work item row indices and milestone row indices from the unified row list
  const workItemRowIndices = useMemo(() => {
    const map = new Map<string, number>();
    unifiedRows.forEach((row, idx) => {
      if (row.kind === 'workItem') map.set(row.item.id, idx);
    });
    return map;
  }, [unifiedRows]);

  const milestoneRowIndices = useMemo(() => {
    const map = new Map<number, number>();
    unifiedRows.forEach((row, idx) => {
      if (row.kind === 'milestone') map.set(row.milestone.id, idx);
    });
    return map;
  }, [unifiedRows]);

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
    return sortedWorkItems.map((item) => {
      const rowIdx = workItemRowIndices.get(item.id) ?? 0;
      // Use actual dates when available (AC12: actual dates override CPM-scheduled dates)
      const effectiveStartDate = item.actualStartDate ?? item.startDate;
      const effectiveEndDate = item.actualEndDate ?? item.endDate;
      const position = computeBarPosition(
        effectiveStartDate,
        effectiveEndDate,
        rowIdx,
        chartRange,
        zoom,
        today,
        columnWidth,
      );
      return { item, position, rowIndex: rowIdx, effectiveStartDate, effectiveEndDate };
    });
  }, [sortedWorkItems, workItemRowIndices, chartRange, zoom, today, columnWidth]);

  // Set of critical path work item IDs for O(1) lookups.
  // When highlighting is disabled, use an empty set so all arrows/bars render as default.
  const criticalPathSet = useMemo(
    () => (highlightCriticalPath ? new Set(data.criticalPath) : new Set<string>()),
    [data.criticalPath, highlightCriticalPath],
  );

  // Map from work item ID to BarRect — used by GanttArrows for path computation
  const barRects = useMemo<ReadonlyMap<string, BarRect>>(() => {
    const map = new Map<string, BarRect>();
    barData.forEach(({ item, position, rowIndex }) => {
      map.set(item.id, { x: position.x, width: position.width, rowIndex });
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

    data.milestones.forEach((milestone) => {
      const rowIndex = milestoneRowIndices.get(milestone.id) ?? 0;
      const y = rowIndex * ROW_HEIGHT + ROW_HEIGHT / 2;

      const status = computeMilestoneStatus(milestone);
      const isLate = status === 'late' && milestone.projectedDate !== null;

      // Use completedAt for completed, projected for late, target for others
      // (matches GanttMilestones active diamond position)
      let activeDateStr: string;
      if (status === 'completed' && milestone.completedAt) {
        activeDateStr = milestone.completedAt.slice(0, 10);
      } else if (isLate && milestone.projectedDate !== null) {
        activeDateStr = milestone.projectedDate;
      } else {
        activeDateStr = milestone.targetDate;
      }

      const x = dateToX(toUtcMidnight(activeDateStr), chartRange, zoom, columnWidth);

      map.set(milestone.id, { x, y });
    });

    return map;
  }, [data.milestones, milestoneRowIndices, hasMilestones, chartRange, zoom, columnWidth]);

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
    for (const item of sortedWorkItems) {
      if (item.requiredMilestoneIds && item.requiredMilestoneIds.length > 0) {
        map.set(item.id, item.requiredMilestoneIds);
      }
    }
    return map;
  }, [sortedWorkItems]);

  /**
   * Map from milestone ID → array of work item IDs that depend on the milestone.
   * Derived from workItem.requiredMilestoneIds (reverse mapping).
   * Used for milestone tooltip to show "Blocked by this milestone" work items.
   */
  const milestoneRequiredBy = useMemo<ReadonlyMap<number, string[]>>(() => {
    const map = new Map<number, string[]>();
    for (const item of sortedWorkItems) {
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
  }, [sortedWorkItems]);

  /**
   * Map from milestone ID → title for accessible aria-labels on milestone arrows.
   */
  const milestoneTitles = useMemo<ReadonlyMap<number, string>>(() => {
    return new Map(data.milestones.map((m) => [m.id, m.title]));
  }, [data.milestones]);

  // ---------------------------------------------------------------------------
  // Item hover dependency lookup — pre-computed for performance
  // ---------------------------------------------------------------------------

  /**
   * For each item (work item or milestone), pre-computes the set of connected
   * entity IDs (work item string IDs + "milestone:<id>" encoded strings) and
   * the set of arrow keys for connected dependency arrows.
   *
   * This allows O(1) lookup when a bar/milestone is hovered without iterating
   * over all dependencies on every render.
   *
   * Entity IDs encoding:
   *   - Work items:  plain string ID
   *   - Milestones:  "milestone:<id>"
   */
  const itemDependencyLookup = useMemo<
    ReadonlyMap<
      string,
      {
        connectedEntityIds: ReadonlySet<string>;
        arrowKeys: ReadonlySet<string>;
        tooltipDeps: ReadonlyArray<GanttTooltipDependencyEntry>;
      }
    >
  >(() => {
    const lookup = new Map<
      string,
      {
        connectedEntityIds: Set<string>;
        arrowKeys: Set<string>;
        tooltipDeps: GanttTooltipDependencyEntry[];
      }
    >();

    function getOrCreate(id: string) {
      let entry = lookup.get(id);
      if (!entry) {
        entry = { connectedEntityIds: new Set(), arrowKeys: new Set(), tooltipDeps: [] };
        // Always include the item itself as connected (so it gets highlighted, not dimmed)
        entry.connectedEntityIds.add(id);
        lookup.set(id, entry);
      }
      return entry;
    }

    // Work-item-to-work-item dependencies
    for (const dep of data.dependencies) {
      const predId = dep.predecessorId;
      const succId = dep.successorId;
      const arrowKey = `${predId}-${succId}-${dep.dependencyType}`;

      const predTitle = workItemMap.get(predId)?.title ?? predId;
      const succTitle = workItemMap.get(succId)?.title ?? succId;

      // For the predecessor: successor is connected; arrow is connected; successor is a dependency
      const predEntry = getOrCreate(predId);
      predEntry.connectedEntityIds.add(succId);
      predEntry.arrowKeys.add(arrowKey);
      predEntry.tooltipDeps.push({
        relatedTitle: succTitle,
        dependencyType: dep.dependencyType,
        role: 'successor',
      });

      // For the successor: predecessor is connected; arrow is connected; predecessor is a dependency
      const succEntry = getOrCreate(succId);
      succEntry.connectedEntityIds.add(predId);
      succEntry.arrowKeys.add(arrowKey);
      succEntry.tooltipDeps.push({
        relatedTitle: predTitle,
        dependencyType: dep.dependencyType,
        role: 'predecessor',
      });
    }

    // Milestone contributing arrows: work item end → milestone diamond (FS)
    for (const milestone of data.milestones) {
      const milestoneKey = `milestone:${milestone.id}`;
      for (const workItemId of milestone.workItemIds) {
        const arrowKey = `milestone-contrib-${workItemId}-${milestone.id}`;

        // For the work item: milestone is connected; arrow is connected
        const wiEntry = getOrCreate(workItemId);
        wiEntry.connectedEntityIds.add(milestoneKey);
        wiEntry.arrowKeys.add(arrowKey);

        // For the milestone: work item is connected; arrow is connected
        const msEntry = getOrCreate(milestoneKey);
        msEntry.connectedEntityIds.add(workItemId);
        msEntry.arrowKeys.add(arrowKey);
      }
    }

    // Milestone required arrows: milestone diamond → work item start (FS)
    for (const item of data.workItems) {
      if (!item.requiredMilestoneIds?.length) continue;
      for (const milestoneId of item.requiredMilestoneIds) {
        const milestoneKey = `milestone:${milestoneId}`;
        const arrowKey = `milestone-req-${milestoneId}-${item.id}`;

        // For the work item: milestone is connected; arrow is connected
        const wiEntry = getOrCreate(item.id);
        wiEntry.connectedEntityIds.add(milestoneKey);
        wiEntry.arrowKeys.add(arrowKey);

        // For the milestone: work item is connected; arrow is connected
        const msEntry = getOrCreate(milestoneKey);
        msEntry.connectedEntityIds.add(item.id);
        msEntry.arrowKeys.add(arrowKey);
      }
    }

    return lookup as ReadonlyMap<
      string,
      {
        connectedEntityIds: ReadonlySet<string>;
        arrowKeys: ReadonlySet<string>;
        tooltipDeps: ReadonlyArray<GanttTooltipDependencyEntry>;
      }
    >;
  }, [data.dependencies, data.milestones, data.workItems, workItemMap]);

  // ---------------------------------------------------------------------------
  // Arrow hover interaction state — per-bar and per-milestone visual states
  // ---------------------------------------------------------------------------

  /**
   * Computes the interaction state for a work item bar given the current
   * hovered arrow's connected IDs set or hovered item's connected IDs.
   * - 'highlighted' when the bar is a connected endpoint
   * - 'dimmed' when an arrow/item is hovered but this bar is not connected
   * - 'default' when no arrow/item is hovered
   *
   * Arrow hover takes precedence over item hover.
   */
  const barInteractionStates = useMemo<ReadonlyMap<string, BarInteractionState>>(() => {
    if (hoveredArrowConnectedIds !== null) {
      const map = new Map<string, BarInteractionState>();
      for (const { item } of barData) {
        map.set(item.id, hoveredArrowConnectedIds.has(item.id) ? 'highlighted' : 'dimmed');
      }
      return map;
    }
    if (hoveredItemId !== null) {
      const connectedIds = itemDependencyLookup.get(hoveredItemId)?.connectedEntityIds;
      if (!connectedIds) return new Map();
      const map = new Map<string, BarInteractionState>();
      for (const { item } of barData) {
        map.set(item.id, connectedIds.has(item.id) ? 'highlighted' : 'dimmed');
      }
      return map;
    }
    return new Map();
  }, [hoveredArrowConnectedIds, hoveredItemId, barData, itemDependencyLookup]);

  /**
   * Computes the interaction state for each milestone given the current
   * hovered arrow's connected IDs set or hovered item's connected IDs.
   * Milestone IDs in the connected set are encoded as "milestone:<id>".
   *
   * Arrow hover takes precedence over item hover.
   */
  const milestoneInteractionStates = useMemo<ReadonlyMap<number, MilestoneInteractionState>>(() => {
    if (hoveredArrowConnectedIds !== null) {
      const map = new Map<number, MilestoneInteractionState>();
      for (const milestone of data.milestones) {
        const key = `milestone:${milestone.id}`;
        map.set(milestone.id, hoveredArrowConnectedIds.has(key) ? 'highlighted' : 'dimmed');
      }
      return map;
    }
    if (hoveredItemId !== null) {
      const connectedIds = itemDependencyLookup.get(hoveredItemId)?.connectedEntityIds;
      if (!connectedIds) return new Map();
      const map = new Map<number, MilestoneInteractionState>();
      for (const milestone of data.milestones) {
        const key = `milestone:${milestone.id}`;
        map.set(milestone.id, connectedIds.has(key) ? 'highlighted' : 'dimmed');
      }
      return map;
    }
    return new Map();
  }, [hoveredArrowConnectedIds, hoveredItemId, data.milestones, itemDependencyLookup]);

  /**
   * The set of arrow keys that should be highlighted due to item hover.
   * Passed to GanttArrows for item-hover-driven arrow highlighting.
   * When no item is hovered, this is undefined (no prop passed).
   */
  const highlightedArrowKeys = useMemo<ReadonlySet<string> | undefined>(() => {
    if (hoveredItemId === null) return undefined;
    return itemDependencyLookup.get(hoveredItemId)?.arrowKeys;
  }, [hoveredItemId, itemDependencyLookup]);

  // SVG height: unified rows (interleaved work items + milestones)
  const totalRowCount = unifiedRows.length;
  const svgHeight = Math.max(totalRowCount * ROW_HEIGHT, ROW_HEIGHT);

  // ---------------------------------------------------------------------------
  // Touch two-tap interaction (#331)
  // ---------------------------------------------------------------------------

  const { isTouchDevice, activeTouchId, handleTouchTap } = useTouchTooltip();

  /**
   * Handles a tap on a GanttBar or sidebar row on touch devices.
   * First tap: shows the work item tooltip at the center of the viewport.
   * Second tap on the same item: clears tooltip and navigates.
   * Tap on a different item: shows that item's tooltip instead.
   */
  const handleGanttTouchTap = useCallback(
    (itemId: string) => {
      const tooltipItem = workItemMap.get(itemId);
      handleTouchTap(itemId, () => {
        // Second tap — clear tooltip and navigate
        if (showTimerRef.current !== null) {
          clearTimeout(showTimerRef.current);
          showTimerRef.current = null;
        }
        if (hideTimerRef.current !== null) {
          clearTimeout(hideTimerRef.current);
          hideTimerRef.current = null;
        }
        setTooltipData(null);
        setTooltipTriggerId(null);
        onItemClick?.(itemId);
      });
      if (tooltipItem && activeTouchId !== itemId) {
        // First tap — show tooltip at approximate center of viewport
        if (showTimerRef.current !== null) {
          clearTimeout(showTimerRef.current);
          showTimerRef.current = null;
        }
        if (hideTimerRef.current !== null) {
          clearTimeout(hideTimerRef.current);
          hideTimerRef.current = null;
        }
        const effectiveStart = tooltipItem.actualStartDate ?? tooltipItem.startDate;
        const effectiveEnd = tooltipItem.actualEndDate ?? tooltipItem.endDate;
        const actualDurationDays = computeActualDuration(effectiveStart, effectiveEnd, today);
        const tooltipDeps = itemDependencyLookup.get(itemId)?.tooltipDeps ?? [];
        setTooltipTriggerId(itemId);
        setTooltipData({
          kind: 'work-item',
          title: tooltipItem.title,
          status: tooltipItem.status,
          startDate: tooltipItem.startDate,
          endDate: tooltipItem.endDate,
          durationDays: tooltipItem.durationDays,
          plannedDurationDays: tooltipItem.durationDays,
          actualDurationDays,
          assignedUserName: tooltipItem.assignedUser?.displayName ?? null,
          dependencies: tooltipDeps.length > 0 ? [...tooltipDeps] : undefined,
          workItemId: itemId,
        });
        setTooltipPosition({
          x: window.innerWidth / 2,
          y: window.innerHeight / 3,
        });
      }
    },
    [
      workItemMap,
      activeTouchId,
      itemDependencyLookup,
      handleTouchTap,
      onItemClick,
      today,
      showTimerRef,
      hideTimerRef,
    ],
  );

  /**
   * Click handler for GanttBar and GanttSidebar rows.
   * On touch devices: routes through two-tap pattern.
   * On pointer devices: calls onItemClick directly.
   */
  const handleBarOrSidebarClick = useCallback(
    (itemId: string) => {
      if (isTouchDevice) {
        handleGanttTouchTap(itemId);
      } else {
        onItemClick?.(itemId);
      }
    },
    [isTouchDevice, handleGanttTouchTap, onItemClick],
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
        items={sortedWorkItems}
        milestones={data.milestones}
        unifiedRows={unifiedRows}
        onItemClick={handleBarOrSidebarClick}
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
              criticalPathOrder={highlightCriticalPath ? data.criticalPath : []}
              barRects={barRects}
              workItemTitles={workItemTitles}
              colors={arrowColors}
              visible={showArrows}
              milestonePoints={milestonePoints}
              milestoneContributors={milestoneContributors}
              workItemRequiredMilestones={workItemRequiredMilestones}
              milestoneTitles={milestoneTitles}
              onArrowHover={handleArrowHover}
              onArrowMouseMove={handleArrowMouseMove}
              onArrowLeave={handleArrowLeave}
              highlightedArrowKeys={highlightedArrowKeys}
            />

            {/* Milestone diamond markers (below work item bars, above arrows) */}
            {hasMilestones && (
              <GanttMilestones
                milestones={data.milestones}
                chartRange={chartRange}
                zoom={zoom}
                milestoneRowIndices={milestoneRowIndices}
                colors={colors.milestone}
                columnWidth={columnWidth}
                milestoneInteractionStates={
                  milestoneInteractionStates.size > 0 ? milestoneInteractionStates : undefined
                }
                onMilestoneMouseEnter={(milestone, e) => {
                  clearTooltipTimers();
                  // Set item hover state for arrow/item highlighting
                  setHoveredItemId(`milestone:${milestone.id}`);
                  // Capture trigger element for focus-return on Escape
                  tooltipTriggerElementRef.current = e.currentTarget;
                  const newPos: GanttTooltipPosition = { x: e.clientX, y: e.clientY };
                  showTimerRef.current = setTimeout(() => {
                    const milestoneStatus = computeMilestoneStatus(milestone);
                    // Contributing items — work items linked to this milestone via workItemIds
                    const contributingIds = milestoneContributors.get(milestone.id) ?? [];
                    const linkedWorkItems = contributingIds
                      .map((wid) => {
                        const wi = workItemMap.get(wid);
                        return wi ? { id: wid, title: wi.title } : null;
                      })
                      .filter((x): x is { id: string; title: string } => x !== null);
                    // Dependent items — work items that depend on this milestone via requiredMilestoneIds
                    const dependentIds = milestoneRequiredBy.get(milestone.id) ?? [];
                    const dependentWorkItems = dependentIds
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
                      dependentWorkItems,
                      milestoneId: milestone.id,
                    });
                    setTooltipPosition(newPos);
                  }, TOOLTIP_SHOW_DELAY);
                }}
                onMilestoneMouseLeave={() => {
                  clearTooltipTimers();
                  setHoveredItemId(null);
                  hideTimerRef.current = setTimeout(() => {
                    setTooltipData(null);
                  }, TOOLTIP_HIDE_DELAY);
                }}
                onMilestoneMouseMove={(e) => {
                  setTooltipPosition({ x: e.clientX, y: e.clientY });
                }}
                onMilestoneFocus={(milestone, e) => {
                  clearTooltipTimers();
                  setHoveredItemId(`milestone:${milestone.id}`);
                  tooltipTriggerElementRef.current = e.currentTarget;
                  // Compute position from element bounding rect center for keyboard focus
                  const rect = e.currentTarget.getBoundingClientRect();
                  const newPos: GanttTooltipPosition = {
                    x: rect.left + rect.width / 2,
                    y: rect.top + rect.height / 2,
                  };
                  showTimerRef.current = setTimeout(() => {
                    const milestoneStatus = computeMilestoneStatus(milestone);
                    // Contributing items — work items linked to this milestone via workItemIds
                    const contributingIds = milestoneContributors.get(milestone.id) ?? [];
                    const linkedWorkItems = contributingIds
                      .map((wid) => {
                        const wi = workItemMap.get(wid);
                        return wi ? { id: wid, title: wi.title } : null;
                      })
                      .filter((x): x is { id: string; title: string } => x !== null);
                    // Dependent items — work items that depend on this milestone via requiredMilestoneIds
                    const dependentIds = milestoneRequiredBy.get(milestone.id) ?? [];
                    const dependentWorkItems = dependentIds
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
                      dependentWorkItems,
                      milestoneId: milestone.id,
                    });
                    setTooltipPosition(newPos);
                  }, TOOLTIP_SHOW_DELAY);
                }}
                onMilestoneBlur={() => {
                  clearTooltipTimers();
                  setHoveredItemId(null);
                  hideTimerRef.current = setTimeout(() => {
                    setTooltipData(null);
                  }, TOOLTIP_HIDE_DELAY);
                }}
                onMilestoneClick={onMilestoneClick}
              />
            )}

            {/* Work item bars (foreground layer) */}
            <g role="list" aria-label="Work item bars">
              {barData.map(({ item, position, rowIndex }) => (
                <GanttBar
                  key={item.id}
                  id={item.id}
                  title={item.title}
                  status={item.status}
                  startDate={item.startDate}
                  endDate={item.endDate}
                  x={position.x}
                  width={position.width}
                  rowIndex={rowIndex}
                  fill={colors.barColors[item.status]}
                  onClick={handleBarOrSidebarClick}
                  isCritical={criticalPathSet.has(item.id)}
                  criticalBorderColor={colors.criticalBorder}
                  interactionState={barInteractionStates.get(item.id) ?? 'default'}
                  // Tooltip accessibility
                  tooltipId={tooltipTriggerId === item.id ? TOOLTIP_ID : undefined}
                  // Tooltip props (mouse hover)
                  onMouseEnter={(e) => {
                    clearTooltipTimers();
                    const tooltipItem = workItemMap.get(item.id);
                    if (!tooltipItem) return;
                    // Set item hover state for dependency highlighting
                    setHoveredItemId(item.id);
                    // Capture trigger element for focus-return on Escape
                    tooltipTriggerElementRef.current = e.currentTarget;
                    const newPos: GanttTooltipPosition = { x: e.clientX, y: e.clientY };
                    showTimerRef.current = setTimeout(() => {
                      setTooltipTriggerId(item.id);
                      // Compute planned vs actual duration for tooltip (#333)
                      const effectiveStart = tooltipItem.actualStartDate ?? tooltipItem.startDate;
                      const effectiveEnd = tooltipItem.actualEndDate ?? tooltipItem.endDate;
                      const actualDurationDays = computeActualDuration(
                        effectiveStart,
                        effectiveEnd,
                        today,
                      );
                      const tooltipDeps = itemDependencyLookup.get(item.id)?.tooltipDeps ?? [];
                      setTooltipData({
                        kind: 'work-item',
                        title: tooltipItem.title,
                        status: tooltipItem.status,
                        startDate: tooltipItem.startDate,
                        endDate: tooltipItem.endDate,
                        durationDays: tooltipItem.durationDays,
                        plannedDurationDays: tooltipItem.durationDays,
                        actualDurationDays,
                        assignedUserName: tooltipItem.assignedUser?.displayName ?? null,
                        dependencies: tooltipDeps.length > 0 ? [...tooltipDeps] : undefined,
                        workItemId: item.id,
                      });
                      setTooltipPosition(newPos);
                    }, TOOLTIP_SHOW_DELAY);
                  }}
                  onMouseLeave={() => {
                    clearTooltipTimers();
                    setHoveredItemId(null);
                    hideTimerRef.current = setTimeout(() => {
                      setTooltipData(null);
                      setTooltipTriggerId(null);
                    }, TOOLTIP_HIDE_DELAY);
                  }}
                  onMouseMove={(e) => {
                    setTooltipPosition({ x: e.clientX, y: e.clientY });
                  }}
                  // Keyboard focus — same highlight/dim/tooltip behaviour as mouse hover
                  onFocus={(e) => {
                    clearTooltipTimers();
                    const tooltipItem = workItemMap.get(item.id);
                    if (!tooltipItem) return;
                    setHoveredItemId(item.id);
                    tooltipTriggerElementRef.current = e.currentTarget;
                    // Compute position from element bounding rect center for keyboard focus
                    const rect = e.currentTarget.getBoundingClientRect();
                    const newPos: GanttTooltipPosition = {
                      x: rect.left + rect.width / 2,
                      y: rect.top + rect.height / 2,
                    };
                    showTimerRef.current = setTimeout(() => {
                      setTooltipTriggerId(item.id);
                      // Compute planned vs actual duration for tooltip (#333)
                      const effectiveStart = tooltipItem.actualStartDate ?? tooltipItem.startDate;
                      const effectiveEnd = tooltipItem.actualEndDate ?? tooltipItem.endDate;
                      const actualDurationDays = computeActualDuration(
                        effectiveStart,
                        effectiveEnd,
                        today,
                      );
                      const tooltipDeps = itemDependencyLookup.get(item.id)?.tooltipDeps ?? [];
                      setTooltipData({
                        kind: 'work-item',
                        title: tooltipItem.title,
                        status: tooltipItem.status,
                        startDate: tooltipItem.startDate,
                        endDate: tooltipItem.endDate,
                        durationDays: tooltipItem.durationDays,
                        plannedDurationDays: tooltipItem.durationDays,
                        actualDurationDays,
                        assignedUserName: tooltipItem.assignedUser?.displayName ?? null,
                        dependencies: tooltipDeps.length > 0 ? [...tooltipDeps] : undefined,
                        workItemId: item.id,
                      });
                      setTooltipPosition(newPos);
                    }, TOOLTIP_SHOW_DELAY);
                  }}
                  onBlur={() => {
                    clearTooltipTimers();
                    setHoveredItemId(null);
                    hideTimerRef.current = setTimeout(() => {
                      setTooltipData(null);
                      setTooltipTriggerId(null);
                    }, TOOLTIP_HIDE_DELAY);
                  }}
                />
              ))}
            </g>
          </svg>
        </div>
      </div>

      {/* Tooltip portal */}
      {tooltipData !== null && (
        <GanttTooltip
          data={tooltipData}
          position={tooltipPosition}
          id={TOOLTIP_ID}
          isTouchDevice={isTouchDevice}
          onMilestoneNavigate={onMilestoneClick}
        />
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
