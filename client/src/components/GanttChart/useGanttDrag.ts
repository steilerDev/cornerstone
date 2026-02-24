import { useState, useCallback, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { ChartRange, ZoomLevel } from './ganttUtils.js';
import { xToDate, snapToGrid, daysBetween } from './ganttUtils.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Pixel threshold from the bar edge that activates resize handles. */
const EDGE_THRESHOLD = 8;

/** Pixel threshold for touch devices (wider hit zone). */
const TOUCH_EDGE_THRESHOLD = 16;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DragZone = 'start' | 'end' | 'move';

/** The current state of an active drag operation. */
export interface DragState {
  /** ID of the item being dragged. */
  itemId: string;
  /** Which zone of the bar was grabbed. */
  zone: DragZone;
  /** Original bar start date (for revert on cancel). */
  originalStartDate: string;
  /** Original bar end date (for revert on cancel). */
  originalEndDate: string;
  /** Duration in days (preserved during a 'move' drag). */
  durationDays: number;
  /** The proposed start date during dragging (updated on pointer move). */
  previewStartDate: string;
  /** The proposed end date during dragging (updated on pointer move). */
  previewEndDate: string;
  /** X pixel offset from bar left edge where the pointer was grabbed. */
  grabOffsetX: number;
}

export interface UseGanttDragResult {
  /** Active drag state, or null when not dragging. */
  dragState: DragState | null;
  /** Call on SVG pointerdown — begins drag. */
  handleBarPointerDown: (
    event: ReactPointerEvent<SVGElement>,
    itemId: string,
    barX: number,
    barWidth: number,
    startDate: string,
    endDate: string,
    svgEl: SVGSVGElement | null,
    chartRange: ChartRange,
    zoom: ZoomLevel,
    isTouch: boolean,
  ) => void;
  /** Call on SVG pointermove — updates preview. */
  handleSvgPointerMove: (
    event: ReactPointerEvent<SVGSVGElement>,
    svgEl: SVGSVGElement | null,
    chartRange: ChartRange,
    zoom: ZoomLevel,
  ) => void;
  /** Call on SVG pointerup — commits drag. */
  handleSvgPointerUp: (
    event: ReactPointerEvent<SVGSVGElement>,
    onDragCommit: (itemId: string, startDate: string, endDate: string, originalStartDate: string, originalEndDate: string) => void,
  ) => void;
  /** Call on SVG pointercancel — reverts drag. */
  handleSvgPointerCancel: () => void;
  /**
   * Returns the CSS cursor for the given bar zone based on pointer position.
   * Used to set the cursor class while hovering (before drag starts).
   */
  getCursorForPosition: (
    pointerX: number,
    barX: number,
    barWidth: number,
    isTouch: boolean,
  ) => string;
}

// ---------------------------------------------------------------------------
// Date formatting helper (YYYY-MM-DD, local time)
// ---------------------------------------------------------------------------

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ---------------------------------------------------------------------------
// Zone detection
// ---------------------------------------------------------------------------

function detectZone(pointerX: number, barX: number, barWidth: number, isTouch: boolean): DragZone {
  const threshold = isTouch ? TOUCH_EDGE_THRESHOLD : EDGE_THRESHOLD;
  const distFromLeft = pointerX - barX;
  const distFromRight = barX + barWidth - pointerX;

  if (distFromLeft <= threshold) return 'start';
  if (distFromRight <= threshold) return 'end';
  return 'move';
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useGanttDrag(): UseGanttDragResult {
  const [dragState, setDragState] = useState<DragState | null>(null);

  // Keep a ref in sync for use in event handlers without stale closure issues
  const dragStateRef = useRef<DragState | null>(null);
  dragStateRef.current = dragState;

  // ---------------------------------------------------------------------------
  // Pointer → SVG x conversion
  // ---------------------------------------------------------------------------

  function getSvgX(event: ReactPointerEvent, svgEl: SVGSVGElement | null): number {
    if (!svgEl) return 0;
    const rect = svgEl.getBoundingClientRect();
    // clientX relative to SVG left edge, accounting for current scroll
    const scrollContainer = svgEl.parentElement;
    const scrollLeft = scrollContainer?.scrollLeft ?? 0;
    return event.clientX - rect.left + scrollLeft;
  }

  // ---------------------------------------------------------------------------
  // handleBarPointerDown
  // ---------------------------------------------------------------------------

  const handleBarPointerDown = useCallback(
    (
      event: ReactPointerEvent<SVGElement>,
      itemId: string,
      barX: number,
      barWidth: number,
      startDate: string,
      endDate: string,
      svgEl: SVGSVGElement | null,
      chartRange: ChartRange,
      zoom: ZoomLevel,
      isTouch: boolean,
    ) => {
      event.stopPropagation();
      // Capture pointer so we receive move/up even outside the element
      (event.target as Element).setPointerCapture(event.pointerId);

      const svgX = getSvgX(event, svgEl);
      const zone = detectZone(svgX, barX, barWidth, isTouch);
      const grabOffsetX = svgX - barX;

      const startDateObj = new Date(
        parseInt(startDate.substring(0, 4), 10),
        parseInt(startDate.substring(5, 7), 10) - 1,
        parseInt(startDate.substring(8, 10), 10),
        12, 0, 0, 0,
      );
      const endDateObj = new Date(
        parseInt(endDate.substring(0, 4), 10),
        parseInt(endDate.substring(5, 7), 10) - 1,
        parseInt(endDate.substring(8, 10), 10),
        12, 0, 0, 0,
      );
      const durationDays = Math.max(1, daysBetween(startDateObj, endDateObj));

      const newState: DragState = {
        itemId,
        zone,
        originalStartDate: startDate,
        originalEndDate: endDate,
        durationDays,
        previewStartDate: startDate,
        previewEndDate: endDate,
        grabOffsetX,
      };

      setDragState(newState);
      dragStateRef.current = newState;
    },
    [],
  );

  // ---------------------------------------------------------------------------
  // handleSvgPointerMove
  // ---------------------------------------------------------------------------

  const handleSvgPointerMove = useCallback(
    (
      event: ReactPointerEvent<SVGSVGElement>,
      svgEl: SVGSVGElement | null,
      chartRange: ChartRange,
      zoom: ZoomLevel,
    ) => {
      const current = dragStateRef.current;
      if (!current) return;

      event.preventDefault();

      const svgX = getSvgX(event, svgEl);

      let newStartDate = current.previewStartDate;
      let newEndDate = current.previewEndDate;

      if (current.zone === 'move') {
        // Shift both dates: treat grab offset so cursor stays at the same
        // relative position within the bar
        const newBarLeftX = svgX - current.grabOffsetX;
        const rawDate = xToDate(newBarLeftX, chartRange, zoom);
        const snapped = snapToGrid(rawDate, zoom);
        newStartDate = formatDate(snapped);

        // Compute end date by preserving duration
        const snappedEnd = new Date(snapped);
        snappedEnd.setDate(snappedEnd.getDate() + current.durationDays);
        snappedEnd.setHours(12, 0, 0, 0);
        newEndDate = formatDate(snappedEnd);
      } else if (current.zone === 'start') {
        const rawDate = xToDate(svgX, chartRange, zoom);
        const snapped = snapToGrid(rawDate, zoom);
        // Prevent start from going past end date (leave at least 1 day)
        const endDateObj = new Date(
          parseInt(current.originalEndDate.substring(0, 4), 10),
          parseInt(current.originalEndDate.substring(5, 7), 10) - 1,
          parseInt(current.originalEndDate.substring(8, 10), 10),
          12, 0, 0, 0,
        );
        const maxStart = new Date(endDateObj);
        maxStart.setDate(maxStart.getDate() - 1);
        const clampedSnapped = snapped.getTime() < maxStart.getTime() ? snapped : maxStart;
        newStartDate = formatDate(clampedSnapped);
        newEndDate = current.originalEndDate;
      } else {
        // zone === 'end'
        const rawDate = xToDate(svgX, chartRange, zoom);
        const snapped = snapToGrid(rawDate, zoom);
        // Prevent end from going before start date (leave at least 1 day)
        const startDateObj = new Date(
          parseInt(current.originalStartDate.substring(0, 4), 10),
          parseInt(current.originalStartDate.substring(5, 7), 10) - 1,
          parseInt(current.originalStartDate.substring(8, 10), 10),
          12, 0, 0, 0,
        );
        const minEnd = new Date(startDateObj);
        minEnd.setDate(minEnd.getDate() + 1);
        const clampedSnapped = snapped.getTime() > minEnd.getTime() ? snapped : minEnd;
        newEndDate = formatDate(clampedSnapped);
        newStartDate = current.originalStartDate;
      }

      setDragState((prev) =>
        prev ? { ...prev, previewStartDate: newStartDate, previewEndDate: newEndDate } : null,
      );
    },
    [],
  );

  // ---------------------------------------------------------------------------
  // handleSvgPointerUp
  // ---------------------------------------------------------------------------

  const handleSvgPointerUp = useCallback(
    (
      event: ReactPointerEvent<SVGSVGElement>,
      onDragCommit: (itemId: string, startDate: string, endDate: string, originalStartDate: string, originalEndDate: string) => void,
    ) => {
      const current = dragStateRef.current;
      if (!current) return;

      event.preventDefault();

      const { itemId, previewStartDate, previewEndDate, originalStartDate, originalEndDate } = current;

      // Only commit if dates actually changed
      if (previewStartDate !== originalStartDate || previewEndDate !== originalEndDate) {
        onDragCommit(itemId, previewStartDate, previewEndDate, originalStartDate, originalEndDate);
      }

      setDragState(null);
      dragStateRef.current = null;
    },
    [],
  );

  // ---------------------------------------------------------------------------
  // handleSvgPointerCancel
  // ---------------------------------------------------------------------------

  const handleSvgPointerCancel = useCallback(() => {
    setDragState(null);
    dragStateRef.current = null;
  }, []);

  // ---------------------------------------------------------------------------
  // getCursorForPosition
  // ---------------------------------------------------------------------------

  const getCursorForPosition = useCallback(
    (pointerX: number, barX: number, barWidth: number, isTouch: boolean): string => {
      const zone = detectZone(pointerX, barX, barWidth, isTouch);
      if (zone === 'start' || zone === 'end') return 'col-resize';
      return 'grab';
    },
    [],
  );

  return {
    dragState,
    handleBarPointerDown,
    handleSvgPointerMove,
    handleSvgPointerUp,
    handleSvgPointerCancel,
    getCursorForPosition,
  };
}
