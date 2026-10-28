import {
  useState,
  useRef,
  useMemo,
  useEffect,
  useCallback,
  useId,
  useImperativeHandle,
  useLayoutEffect,
} from 'react';
import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { TimelineResponse, WorkItemStatus } from '@cornerstone/shared';
import { barDates } from '../../lib/scheduleDates.js';
import { parseRowKey, rowKey } from '../../lib/scheduleView.js';
import type { ScheduleGroup, ScheduleRowKey } from '../../lib/scheduleView.js';
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
  buildGanttRows,
  ganttRowKey,
  hoverIdOfKey,
  lateSignalOf,
} from './ganttUtils.js';
import {
  anchorFromScroll,
  dateAtX,
  firstCurrentRowIndex,
  scrollFromAnchor,
} from './ganttScroll.js';
import type { GanttScrollAnchor, GanttScrollGeometry } from './ganttScroll.js';
import { GanttGhosts } from './GanttGhosts.js';
import type { GanttGhostShape } from './GanttGhosts.js';
import { GanttGrid } from './GanttGrid.js';
import { GanttBar } from './GanttBar.js';
import type { BarInteractionState } from './GanttBar.js';
import { GanttArrows } from './GanttArrows.js';
import type { BarRect } from './arrowUtils.js';
import { GanttHeader } from './GanttHeader.js';
import { GanttSidebar } from './GanttSidebar.js';
import { GanttTooltip } from './GanttTooltip.js';
import { buildHouseholdItemTooltipData, buildWorkItemTooltipData } from './tooltipData.js';
import type {
  GanttTooltipData,
  GanttTooltipPosition,
  GanttTooltipDependencyEntry,
} from './GanttTooltip.js';
import { GanttMilestones, computeMilestoneStatus } from './GanttMilestones.js';
import type { MilestoneColors, MilestoneInteractionState } from './GanttMilestones.js';
import { GanttHouseholdItems } from './GanttHouseholdItems.js';
import type { HouseholdItemColors, HouseholdItemInteractionState } from './GanttHouseholdItems.js';
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
  lateHatch: string;
  ghostStroke: string;
  previewStroke: string;
  danger: string;
  groupBand: string;
  milestone: MilestoneColors;
  householdItem: HouseholdItemColors;
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
    lateHatch: readCssVar('--color-gantt-bar-late-hatch'),
    ghostStroke: readCssVar('--color-gantt-bar-ghost-stroke'),
    previewStroke: readCssVar('--color-gantt-bar-preview-stroke'),
    danger: readCssVar('--color-danger'),
    groupBand: readCssVar('--color-bg-tertiary'),
    milestone: {
      incompleteFill: readCssVar('--color-milestone-incomplete-fill') || 'transparent',
      incompleteStroke: readCssVar('--color-milestone-incomplete-stroke'),
      completeFill: readCssVar('--color-milestone-complete-fill'),
      completeStroke: readCssVar('--color-milestone-complete-stroke'),
      lateFill: readCssVar('--color-milestone-late-fill') || readCssVar('--color-danger'),
      lateStroke: readCssVar('--color-milestone-late-stroke') || readCssVar('--color-danger'),
      aheadFill: readCssVar('--color-milestone-ahead-fill') || readCssVar('--color-success'),
      aheadStroke: readCssVar('--color-milestone-ahead-stroke') || readCssVar('--color-success'),
      hoverGlow: readCssVar('--color-milestone-hover-glow'),
      completeHoverGlow: readCssVar('--color-milestone-complete-hover-glow'),
      lateHoverGlow: readCssVar('--color-milestone-late-hover-glow') || 'rgba(220, 38, 38, 0.25)',
      aheadHoverGlow:
        readCssVar('--color-milestone-ahead-hover-glow') || 'rgba(16, 185, 129, 0.25)',
    },
    householdItem: {
      fill: readCssVar('--color-gantt-hi-fill'),
      stroke: readCssVar('--color-gantt-hi-stroke'),
      arrivedFill: readCssVar('--color-gantt-hi-arrived-fill'),
      arrivedStroke: readCssVar('--color-gantt-hi-arrived-stroke'),
      hoverGlow: readCssVar('--color-gantt-hi-hover-glow'),
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

export type { GanttScrollAnchor } from './ganttScroll.js';

/** What the page can ask the chart to do. */
export interface GanttChartControl {
  /** Puts today at 25 % of the viewport, smoothly unless reduced motion is on. */
  scrollToToday(): void;
}

/** A reschedule preview outline: where a task or milestone would sit after the change. */
export interface GanttPreviewGhost {
  readonly rowKey: ScheduleRowKey;
  readonly start: string | null;
  readonly end: string;
}

export interface GanttChartProps {
  /** Already filtered by the page. */
  data: TimelineResponse;
  zoom: ZoomLevel;
  /** Custom column width (overrides the default for the zoom level). Used for zoom in/out. */
  columnWidth?: number;
  /** Whether to show dependency arrows. Default: true. */
  showArrows?: boolean;
  /** Whether to highlight the critical path with distinct styling. Default: true. */
  highlightCriticalPath?: boolean;
  /** Time (default) keeps one interleaved list; Area adds collapsible group headers. */
  groupBy?: ScheduleGroup;
  /** Area ids in display order, for `groupBy: 'area'`. */
  areaOrder?: readonly string[];
  /** The row whose panel is open. */
  selectedKey?: ScheduleRowKey | null;
  /** Dashed outlines drawn over the bars while a reschedule is previewed. */
  previewGhosts?: readonly GanttPreviewGhost[];
  /** A bar, marker or row was activated; `opener` is the row button (focus returns there). */
  onSelect?: (key: ScheduleRowKey, opener: HTMLElement) => void;
  /** Called when user scrolls with Ctrl held — for zoom via scroll. Positive = zoom in. */
  onCtrlScroll?: (delta: number) => void;
  /** Where to place the chart on first mount. */
  initialAnchor?: GanttScrollAnchor | null;
  /** The scroll position as a date anchor, debounced 200 ms. */
  onAnchorChange?: (anchor: GanttScrollAnchor) => void;
  controlRef?: RefObject<GanttChartControl | null>;
}

const NO_AREAS: readonly string[] = [];
const NO_GHOSTS: readonly GanttPreviewGhost[] = [];
const ANCHOR_DEBOUNCE_MS = 200;
/** Today sits at this share of the viewport width after positioning. */
const TODAY_VIEWPORT_SHARE = 0.25;

export function GanttChart({
  data,
  zoom,
  columnWidth,
  showArrows = true,
  highlightCriticalPath = true,
  groupBy = 'time',
  areaOrder = NO_AREAS,
  selectedKey = null,
  previewGhosts = NO_GHOSTS,
  onSelect,
  onCtrlScroll,
  initialAnchor = null,
  onAnchorChange,
  controlRef,
}: GanttChartProps) {
  const { t } = useTranslation('schedule');

  // Refs for scroll synchronization
  const chartScrollRef = useRef<HTMLDivElement>(null);
  const sidebarScrollRef = useRef<HTMLDivElement>(null);
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const isScrollSyncingRef = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const lastScrollRef = useRef({ left: 0, top: 0 });
  const anchorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousGeometryRef = useRef<GanttScrollGeometry | null>(null);

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
        // Triggers are always SVG elements (bars, diamonds, markers)
        (
          tooltipTriggerElementRef.current as (SVGElement & { focus?: () => void }) | null
        )?.focus?.();
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

  // ---------------------------------------------------------------------------
  // Rows — tasks, milestones and purchases (plus group headers), by row key
  // ---------------------------------------------------------------------------

  // Collapsed groups live in this session only (D15)
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(() => new Set());
  const noAreaName = t('view.gantt.noArea');

  const rows = useMemo(
    () => buildGanttRows(data, groupBy, areaOrder, collapsedGroups, noAreaName),
    [data, groupBy, areaOrder, collapsedGroups, noAreaName],
  );

  const rowKeys = useMemo(() => rows.map(ganttRowKey), [rows]);

  const groupRowIndices = useMemo<ReadonlySet<number>>(() => {
    const set = new Set<number>();
    rows.forEach((row, idx) => {
      if (row.kind === 'group') set.add(idx);
    });
    return set;
  }, [rows]);

  // Rows that are shown (a collapsed group drops its rows)
  const sortedWorkItems = useMemo(
    () => rows.flatMap((row) => (row.kind === 'workItem' ? [row.item] : [])),
    [rows],
  );
  const visibleMilestones = useMemo(
    () => rows.flatMap((row) => (row.kind === 'milestone' ? [row.milestone] : [])),
    [rows],
  );
  const visibleHouseholdItems = useMemo(
    () => rows.flatMap((row) => (row.kind === 'householdItem' ? [row.item] : [])),
    [rows],
  );

  const workItemRowIndices = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((row, idx) => {
      if (row.kind === 'workItem') map.set(row.item.id, idx);
    });
    return map;
  }, [rows]);

  const milestoneRowIndices = useMemo(() => {
    const map = new Map<number, number>();
    rows.forEach((row, idx) => {
      if (row.kind === 'milestone') map.set(row.milestone.id, idx);
    });
    return map;
  }, [rows]);

  const hiRowIndices = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((row, idx) => {
      if (row.kind === 'householdItem') map.set(row.item.id, idx);
    });
    return map;
  }, [rows]);

  const handleToggleGroup = useCallback((groupId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (!next.delete(groupId)) next.add(groupId);
      return next;
    });
  }, []);

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
      const rowIdx = workItemRowIndices.get(item.id)!;
      // Actual dates win, else the forecast (contract 4): the bar shows where work really sits
      const { start: effectiveStartDate, end: effectiveEndDate } = barDates(item);
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

  // Set of critical path milestone IDs for O(1) lookups.
  // When highlighting is disabled, use an empty set so milestones render as default.
  const criticalMilestoneIds = useMemo(() => {
    if (!highlightCriticalPath) return new Set<number>();
    const ids = new Set<number>();
    for (const m of data.milestones) {
      if (m.isCritical) {
        ids.add(m.id);
      }
    }
    return ids;
  }, [data.milestones, highlightCriticalPath]);

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

  const hasMilestones = visibleMilestones.length > 0;

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

    visibleMilestones.forEach((milestone) => {
      const rowIndex = milestoneRowIndices.get(milestone.id)!;
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
  }, [visibleMilestones, milestoneRowIndices, hasMilestones, chartRange, zoom, columnWidth]);

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
  const milestoneRequiredBy = useMemo<ReadonlyMap<number, { id: string; title: string }[]>>(() => {
    const map = new Map<number, { id: string; title: string }[]>();
    for (const item of sortedWorkItems) {
      if (item.requiredMilestoneIds && item.requiredMilestoneIds.length > 0) {
        for (const milestoneId of item.requiredMilestoneIds) {
          const existing = map.get(milestoneId);
          if (existing) {
            existing.push({ id: item.id, title: item.title });
          } else {
            map.set(milestoneId, [{ id: item.id, title: item.title }]);
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

  /**
   * Map from household item ID → resolved linked items (work items / milestones).
   * Used to populate the tooltip's "Linked Items" section.
   */
  const hiLinkedItemsMap = useMemo(() => {
    const map = new Map<string, { id: string; title: string; type: 'work_item' | 'milestone' }[]>();
    for (const hi of data.householdItems) {
      if (hi.dependencyIds.length === 0) continue;
      const linked: { id: string; title: string; type: 'work_item' | 'milestone' }[] = [];
      for (const dep of hi.dependencyIds) {
        if (dep.predecessorType === 'work_item') {
          const title = workItemMap.get(dep.predecessorId)?.title;
          if (title) linked.push({ id: dep.predecessorId, title, type: 'work_item' });
        } else {
          const msId = Number(dep.predecessorId);
          const title = milestoneTitles.get(msId);
          if (title) linked.push({ id: dep.predecessorId, title, type: 'milestone' });
        }
      }
      if (linked.length > 0) map.set(hi.id, linked);
    }
    return map;
  }, [data.householdItems, workItemMap, milestoneTitles]);

  /**
   * Map from HI ID to its circle center position in SVG coordinates.
   * Mirrors the positioning logic in GanttHouseholdItems: each HI occupies
   * its own row in the unified row list. The x position uses the best available date.
   */
  const hiPoints = useMemo<ReadonlyMap<string, { x: number; y: number }>>(() => {
    const map = new Map<string, { x: number; y: number }>();
    for (const hi of visibleHouseholdItems) {
      const dateStr = hi.actualDeliveryDate ?? hi.targetDeliveryDate ?? hi.earliestDeliveryDate;
      if (!dateStr) continue;
      const rowIdx = hiRowIndices.get(hi.id)!;
      const y = rowIdx * ROW_HEIGHT + ROW_HEIGHT / 2;
      const x = dateToX(toUtcMidnight(dateStr), chartRange, zoom, columnWidth);
      map.set(hi.id, { x, y });
    }
    return map;
  }, [visibleHouseholdItems, hiRowIndices, chartRange, zoom, columnWidth]);

  // ---------------------------------------------------------------------------
  // Item hover dependency lookup — pre-computed for performance
  // ---------------------------------------------------------------------------

  /**
   * For each item (work item, milestone, or household item), pre-computes the set of connected
   * entity IDs and the set of arrow keys for connected dependency arrows.
   *
   * This allows O(1) lookup when a bar/milestone/HI is hovered without iterating
   * over all dependencies on every render.
   *
   * Entity IDs encoding:
   *   - Work items:     plain string ID
   *   - Milestones:     "milestone:<id>"
   *   - Household items: "hi:<id>"
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

    // Household item dependency arrows: work item/milestone → HI delivery date
    for (const hi of data.householdItems) {
      if (!hi.dependencyIds?.length) continue;
      const hiKey = `hi:${hi.id}`;

      for (const dep of hi.dependencyIds) {
        const isWorkItemPred = dep.predecessorType === 'work_item';
        const predId = isWorkItemPred ? dep.predecessorId : `milestone:${dep.predecessorId}`;
        const arrowKey = isWorkItemPred
          ? `hi-dep-wi-${predId}-${hi.id}`
          : `hi-dep-ms-${dep.predecessorId}-${hi.id}`;

        // For the predecessor (WI or milestone): HI is connected; arrow is connected
        const predEntry = getOrCreate(predId);
        predEntry.connectedEntityIds.add(hiKey);
        predEntry.arrowKeys.add(arrowKey);

        // For the HI: predecessor is connected; arrow is connected
        const hiEntry = getOrCreate(hiKey);
        hiEntry.connectedEntityIds.add(predId);
        hiEntry.arrowKeys.add(arrowKey);
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
  }, [data.dependencies, data.milestones, data.workItems, data.householdItems, workItemMap]);

  // ---------------------------------------------------------------------------
  // Arrow hover interaction state — per-bar and per-milestone visual states
  // ---------------------------------------------------------------------------

  // Hover wins over the open panel's row; an arrow hover wins over both
  const selectedHoverId = selectedKey ? hoverIdOfKey(selectedKey) : null;
  const activeItemId =
    hoveredArrowConnectedIds === null ? (hoveredItemId ?? selectedHoverId) : null;

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
    if (activeItemId !== null) {
      const connectedIds = itemDependencyLookup.get(activeItemId)?.connectedEntityIds;
      if (!connectedIds) return new Map();
      const map = new Map<string, BarInteractionState>();
      for (const { item } of barData) {
        map.set(item.id, connectedIds.has(item.id) ? 'highlighted' : 'dimmed');
      }
      return map;
    }
    return new Map();
  }, [hoveredArrowConnectedIds, activeItemId, barData, itemDependencyLookup]);

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
    if (activeItemId !== null) {
      const connectedIds = itemDependencyLookup.get(activeItemId)?.connectedEntityIds;
      if (!connectedIds) return new Map();
      const map = new Map<number, MilestoneInteractionState>();
      for (const milestone of data.milestones) {
        const key = `milestone:${milestone.id}`;
        map.set(milestone.id, connectedIds.has(key) ? 'highlighted' : 'dimmed');
      }
      return map;
    }
    return new Map();
  }, [hoveredArrowConnectedIds, activeItemId, data.milestones, itemDependencyLookup]);

  /**
   * Computes the interaction state for each household item given the current
   * hovered arrow's connected IDs or hovered item's connected IDs.
   * HI IDs in the connected set are encoded as "hi:<id>".
   */
  const hiInteractionStates = useMemo<ReadonlyMap<string, HouseholdItemInteractionState>>(() => {
    if (hoveredArrowConnectedIds !== null) {
      const map = new Map<string, HouseholdItemInteractionState>();
      for (const hi of data.householdItems) {
        const key = `hi:${hi.id}`;
        map.set(hi.id, hoveredArrowConnectedIds.has(key) ? 'highlighted' : 'dimmed');
      }
      return map;
    }
    if (activeItemId !== null) {
      const connectedIds = itemDependencyLookup.get(activeItemId)?.connectedEntityIds;
      if (!connectedIds) return new Map();
      const map = new Map<string, HouseholdItemInteractionState>();
      for (const hi of data.householdItems) {
        const key = `hi:${hi.id}`;
        map.set(hi.id, connectedIds.has(key) ? 'highlighted' : 'dimmed');
      }
      return map;
    }
    return new Map();
  }, [hoveredArrowConnectedIds, activeItemId, data.householdItems, itemDependencyLookup]);

  /**
   * The set of arrow keys that should be highlighted due to item hover.
   * Passed to GanttArrows for item-hover-driven arrow highlighting.
   * When no item is hovered, this is undefined (no prop passed).
   */
  const highlightedArrowKeys = useMemo<ReadonlySet<string> | undefined>(() => {
    if (activeItemId === null) return undefined;
    return itemDependencyLookup.get(activeItemId)?.arrowKeys;
  }, [activeItemId, itemDependencyLookup]);

  // SVG height: one row per group header, task, milestone and purchase
  const totalRowCount = rows.length;
  const svgHeight = Math.max(totalRowCount * ROW_HEIGHT, ROW_HEIGHT);

  // Late tasks: hatch + outline on the bar, a dashed outline where they were planned (D7)
  const patternSuffix = useId().replace(/:/g, '');
  const hatchPatternId = `gantt-hatch-${patternSuffix}`;

  const plannedGhosts = useMemo<GanttGhostShape[]>(() => {
    const ghosts: GanttGhostShape[] = [];
    for (const { item, rowIndex, effectiveStartDate, effectiveEndDate } of barData) {
      if (lateSignalOf(item) === null || !item.startDate || !item.endDate) continue;
      if (item.startDate === effectiveStartDate && item.endDate === effectiveEndDate) continue;
      const position = computeBarPosition(
        item.startDate,
        item.endDate,
        rowIndex,
        chartRange,
        zoom,
        today,
        columnWidth,
      );
      ghosts.push({
        testId: `gantt-ghost-${item.id}`,
        shape: 'bar',
        x: position.x,
        width: position.width,
        rowIndex,
      });
    }
    return ghosts;
  }, [barData, chartRange, zoom, today, columnWidth]);

  const previewShapes = useMemo<GanttGhostShape[]>(() => {
    const shapes: GanttGhostShape[] = [];
    for (const ghost of previewGhosts) {
      const { kind, id } = parseRowKey(ghost.rowKey);
      const rowIndex =
        kind === 'milestone'
          ? milestoneRowIndices.get(Number(id))
          : kind === 'task'
            ? workItemRowIndices.get(id)
            : hiRowIndices.get(id);
      if (rowIndex === undefined) continue;
      const testId = `gantt-preview-ghost-${ghost.rowKey}`;
      if (kind === 'milestone') {
        const x = dateToX(toUtcMidnight(ghost.end), chartRange, zoom, columnWidth);
        shapes.push({ testId, shape: 'diamond', x, width: 0, rowIndex });
        continue;
      }
      const position = computeBarPosition(
        ghost.start,
        ghost.end,
        rowIndex,
        chartRange,
        zoom,
        today,
        columnWidth,
      );
      shapes.push({ testId, shape: 'bar', x: position.x, width: position.width, rowIndex });
    }
    return shapes;
  }, [
    previewGhosts,
    milestoneRowIndices,
    workItemRowIndices,
    hiRowIndices,
    chartRange,
    zoom,
    today,
    columnWidth,
  ]);

  // ---------------------------------------------------------------------------
  // Selection — a bar, marker or row opens the panel; focus returns to the row button
  // ---------------------------------------------------------------------------

  const handleChartSelect = useCallback(
    (key: ScheduleRowKey) => {
      if (!onSelect) return;
      const opener = Array.from(
        sidebarScrollRef.current!.querySelectorAll<HTMLElement>('[data-gantt-row-key]'),
      ).find((el) => el.dataset.ganttRowKey === key)!;
      onSelect(key, opener);
    },
    [onSelect],
  );

  const handleBarClick = useCallback(
    (id: string) => handleChartSelect(rowKey('task', id)),
    [handleChartSelect],
  );
  const handleMilestoneClick = useCallback(
    (id: number) => handleChartSelect(rowKey('milestone', id)),
    [handleChartSelect],
  );
  const handleHiClick = useCallback(
    (id: string) => handleChartSelect(rowKey('purchase', id)),
    [handleChartSelect],
  );

  // A focused sidebar row highlights its links, as hover does; no tooltip opens (D8)
  const handleRowFocus = useCallback((key: ScheduleRowKey) => {
    setHoveredItemId(hoverIdOfKey(key));
  }, []);
  const handleRowBlur = useCallback(() => setHoveredItemId(null), []);

  // ---------------------------------------------------------------------------
  // Scroll position — anchor bookkeeping (positioning itself is below, after the handlers)
  // ---------------------------------------------------------------------------

  const geometry = useMemo<GanttScrollGeometry>(
    () => ({ chartRange, zoom, columnWidth, rowKeys }),
    [chartRange, zoom, columnWidth, rowKeys],
  );

  // The latest geometry and callback, for the debounced emit and the restore below
  const geometryRef = useRef(geometry);
  const onAnchorChangeRef = useRef(onAnchorChange);
  useLayoutEffect(() => {
    geometryRef.current = geometry;
    onAnchorChangeRef.current = onAnchorChange;
  });

  const scheduleAnchorEmit = useCallback(() => {
    if (!onAnchorChangeRef.current) return;
    if (anchorTimerRef.current !== null) clearTimeout(anchorTimerRef.current);
    anchorTimerRef.current = setTimeout(() => {
      anchorTimerRef.current = null;
      const { left, top } = lastScrollRef.current;
      onAnchorChangeRef.current?.(anchorFromScroll(left, top, geometryRef.current));
    }, ANCHOR_DEBOUNCE_MS);
  }, []);

  useEffect(
    () => () => {
      if (anchorTimerRef.current !== null) clearTimeout(anchorTimerRef.current);
    },
    [],
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
    const chartEl = chartScrollRef.current!;
    lastScrollRef.current = { left: chartEl.scrollLeft, top: chartEl.scrollTop };
    scheduleAnchorEmit();

    if (isScrollSyncingRef.current) return;

    requestAnimationFrame(() => {
      isScrollSyncingRef.current = true;

      if (sidebarScrollRef.current) {
        sidebarScrollRef.current.scrollTop = chartEl.scrollTop;
      }

      if (headerScrollRef.current) {
        headerScrollRef.current.scrollLeft = chartEl.scrollLeft;
      }

      isScrollSyncingRef.current = false;
    });
  }, [scheduleAnchorEmit]);

  /**
   * Sync sidebar scroll back to chart.
   * This is called when the user scrolls the sidebar independently.
   */
  const handleSidebarScroll = useCallback(() => {
    if (isScrollSyncingRef.current) return;

    const sidebarEl = sidebarScrollRef.current!;

    requestAnimationFrame(() => {
      isScrollSyncingRef.current = true;

      if (chartScrollRef.current) {
        chartScrollRef.current.scrollTop = sidebarEl.scrollTop;
      }

      isScrollSyncingRef.current = false;
    });
  }, []);

  // ---------------------------------------------------------------------------
  // Scroll position — positioned once per mount, then restored from a date anchor (D18)
  // ---------------------------------------------------------------------------

  /** Moves both scroll panes (and keeps the header and sidebar in step). */
  function applyScroll(left: number, top: number | null) {
    const chartEl = chartScrollRef.current!;
    chartEl.scrollLeft = left;
    headerScrollRef.current!.scrollLeft = left;
    if (top !== null) {
      chartEl.scrollTop = top;
      sidebarScrollRef.current!.scrollTop = top;
    }
    lastScrollRef.current = { left: chartEl.scrollLeft, top: top ?? lastScrollRef.current.top };
  }

  useLayoutEffect(() => {
    const chartEl = chartScrollRef.current!;
    const previous = previousGeometryRef.current;
    previousGeometryRef.current = geometry;

    if (previous === null) {
      // First positioning: the saved anchor, else today at 25 % of the viewport, with the first
      // current row near the top and one row of context above it
      if (initialAnchor) {
        const target = scrollFromAnchor(initialAnchor, geometry);
        applyScroll(target.left, target.top);
        return;
      }
      const left =
        todayX === null ? 0 : Math.max(0, todayX - chartEl.clientWidth * TODAY_VIEWPORT_SHARE);
      const firstRow = firstCurrentRowIndex(rows, today);
      applyScroll(left, firstRow === -1 ? null : Math.max(0, (firstRow - 1) * ROW_HEIGHT));
      return;
    }

    // Restore: a zoom change keeps the viewport's centre date, anything else the left-edge date
    // and the top row
    const { left, top } = lastScrollRef.current;
    if (previous.zoom !== zoom) {
      const half = chartEl.clientWidth / 2;
      const centre = dateAtX(left + half, previous.chartRange, previous.zoom, previous.columnWidth);
      const centreX = scrollFromAnchor({ date: centre, rowKey: null, rowOffset: 0 }, geometry).left;
      applyScroll(Math.max(0, centreX - half), null);
      return;
    }
    const target = scrollFromAnchor(anchorFromScroll(left, top, previous), geometry);
    applyScroll(target.left, target.top);
    // Re-runs on geometry only: the first positioning reads the rest once, and a changed
    // anchor prop must never move a chart the user is looking at
    // eslint-disable-next-line @eslint-react/exhaustive-deps
  }, [geometry]);

  useImperativeHandle(
    controlRef,
    () => ({
      scrollToToday() {
        if (todayX === null) return;
        const chartEl = chartScrollRef.current!;
        const left = Math.max(0, todayX - chartEl.clientWidth * TODAY_VIEWPORT_SHARE);
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduceMotion) {
          applyScroll(left, null);
          return;
        }
        chartEl.scrollTo({ left, behavior: 'smooth' });
      },
    }),
    [todayX],
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div
      className={styles.chartBody}
      role="group"
      aria-label={t('view.gantt.chartAriaLabel')}
      data-testid="gantt-chart"
    >
      {/* Left sidebar — fixed during horizontal scroll, synced vertically */}
      <GanttSidebar
        rows={rows}
        criticalWorkItemIds={criticalPathSet}
        criticalMilestoneIds={criticalMilestoneIds}
        selectedKey={selectedKey}
        onSelect={onSelect}
        onToggleGroup={handleToggleGroup}
        onRowFocus={handleRowFocus}
        onRowBlur={handleRowBlur}
        onScroll={handleSidebarScroll}
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
            {/* One hatch pattern shared by every late bar */}
            <defs>
              <pattern
                id={hatchPatternId}
                width={6}
                height={6}
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                <line x1={0} y1={0} x2={0} y2={6} stroke={colors.lateHatch} strokeWidth={2} />
              </pattern>
            </defs>

            {/* Background: row stripes + grid lines + today marker */}
            <GanttGrid
              width={chartWidth}
              height={svgHeight}
              rowCount={totalRowCount}
              gridLines={gridLines}
              colors={colors}
              groupRows={groupRowIndices}
              todayX={todayX}
            />

            {/* Planned dates of late tasks (below the bars) */}
            <GanttGhosts ghosts={plannedGhosts} stroke={colors.ghostStroke} variant="planned" />

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
              criticalMilestoneIds={criticalMilestoneIds}
              milestoneTitles={milestoneTitles}
              hiPoints={hiPoints}
              householdItems={visibleHouseholdItems}
              onArrowHover={handleArrowHover}
              onArrowMouseMove={handleArrowMouseMove}
              onArrowLeave={handleArrowLeave}
              highlightedArrowKeys={highlightedArrowKeys}
            />

            {/* Milestone diamond markers (below work item bars, above arrows) */}
            {hasMilestones && (
              <GanttMilestones
                milestones={visibleMilestones}
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
                    const dependentWorkItems = milestoneRequiredBy.get(milestone.id) ?? [];
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
                      holdsUpCount: data.holdsUp?.milestones[String(milestone.id)]?.count ?? 0,
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
                    const dependentWorkItems = milestoneRequiredBy.get(milestone.id) ?? [];
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
                      holdsUpCount: data.holdsUp?.milestones[String(milestone.id)]?.count ?? 0,
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
                criticalMilestoneIds={criticalMilestoneIds}
                criticalBorderColor={colors.criticalBorder}
                criticalConnectorColor={highlightCriticalPath ? colors.arrowCritical : undefined}
                onMilestoneClick={handleMilestoneClick}
              />
            )}

            {/* Household item circle markers */}
            {visibleHouseholdItems.length > 0 && (
              <GanttHouseholdItems
                householdItems={visibleHouseholdItems}
                chartRange={chartRange}
                zoom={zoom}
                hiRowIndices={hiRowIndices}
                colors={colors.householdItem}
                columnWidth={columnWidth}
                hiInteractionStates={hiInteractionStates.size > 0 ? hiInteractionStates : undefined}
                onHiMouseEnter={(hi, e) => {
                  clearTooltipTimers();
                  setHoveredItemId(`hi:${hi.id}`);
                  tooltipTriggerElementRef.current = e.currentTarget;
                  const newPos: GanttTooltipPosition = { x: e.clientX, y: e.clientY };
                  showTimerRef.current = setTimeout(() => {
                    setTooltipData(buildHouseholdItemTooltipData(hi, hiLinkedItemsMap.get(hi.id)));
                    setTooltipPosition(newPos);
                  }, TOOLTIP_SHOW_DELAY);
                }}
                onHiMouseLeave={() => {
                  clearTooltipTimers();
                  setHoveredItemId(null);
                  hideTimerRef.current = setTimeout(() => {
                    setTooltipData(null);
                  }, TOOLTIP_HIDE_DELAY);
                }}
                onHiMouseMove={(e) => {
                  setTooltipPosition({ x: e.clientX, y: e.clientY });
                }}
                onHiFocus={(hi, e) => {
                  clearTooltipTimers();
                  setHoveredItemId(`hi:${hi.id}`);
                  tooltipTriggerElementRef.current = e.currentTarget;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const newPos: GanttTooltipPosition = {
                    x: rect.left + rect.width / 2,
                    y: rect.top + rect.height / 2,
                  };
                  showTimerRef.current = setTimeout(() => {
                    setTooltipData(buildHouseholdItemTooltipData(hi, hiLinkedItemsMap.get(hi.id)));
                    setTooltipPosition(newPos);
                  }, TOOLTIP_SHOW_DELAY);
                }}
                onHiBlur={() => {
                  clearTooltipTimers();
                  setHoveredItemId(null);
                  hideTimerRef.current = setTimeout(() => {
                    setTooltipData(null);
                  }, TOOLTIP_HIDE_DELAY);
                }}
                onHiClick={handleHiClick}
              />
            )}

            {/* Work item bars (foreground layer) */}
            <g role="list" aria-label={t('gantt.workItemBarsAriaLabel')}>
              {barData.map(({ item, position, rowIndex, effectiveStartDate, effectiveEndDate }) => (
                <GanttBar
                  key={item.id}
                  id={item.id}
                  title={item.title}
                  status={item.status}
                  startDate={effectiveStartDate}
                  endDate={effectiveEndDate}
                  x={position.x}
                  width={position.width}
                  rowIndex={rowIndex}
                  fill={colors.barColors[item.status]}
                  onClick={handleBarClick}
                  isCritical={criticalPathSet.has(item.id)}
                  isLate={lateSignalOf(item) !== null}
                  hatchPatternId={hatchPatternId}
                  lateOutlineColor={colors.danger}
                  criticalBorderColor={colors.criticalBorder}
                  interactionState={barInteractionStates.get(item.id) ?? 'default'}
                  // Tooltip accessibility
                  tooltipId={tooltipTriggerId === item.id ? TOOLTIP_ID : undefined}
                  // Tooltip props (mouse hover)
                  onMouseEnter={(e) => {
                    clearTooltipTimers();
                    const tooltipItem = workItemMap.get(item.id)!;
                    // Set item hover state for dependency highlighting
                    setHoveredItemId(item.id);
                    // Capture trigger element for focus-return on Escape
                    tooltipTriggerElementRef.current = e.currentTarget;
                    const newPos: GanttTooltipPosition = { x: e.clientX, y: e.clientY };
                    showTimerRef.current = setTimeout(() => {
                      setTooltipTriggerId(item.id);
                      setTooltipData(
                        buildWorkItemTooltipData(
                          tooltipItem,
                          itemDependencyLookup.get(item.id)?.tooltipDeps,
                          today,
                          data.holdsUp?.workItems[item.id]?.count ?? 0,
                        ),
                      );
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
                    const tooltipItem = workItemMap.get(item.id)!;
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
                      setTooltipData(
                        buildWorkItemTooltipData(
                          tooltipItem,
                          itemDependencyLookup.get(item.id)?.tooltipDeps,
                          today,
                          data.holdsUp?.workItems[item.id]?.count ?? 0,
                        ),
                      );
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

            {/* Reschedule preview (above the bars) */}
            <GanttGhosts ghosts={previewShapes} stroke={colors.previewStroke} variant="preview" />
          </svg>
        </div>
      </div>

      {/* Tooltip portal */}
      {tooltipData !== null && (
        <GanttTooltip
          data={tooltipData}
          position={tooltipPosition}
          id={TOOLTIP_ID}
          isTouchDevice={false}
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
