/**
 * arrowUtils.ts
 *
 * Pure utility functions for computing dependency arrow SVG paths between
 * Gantt chart bars. All functions are side-effect free and memoization-friendly.
 *
 * Arrow routing strategy: orthogonal (right-angle) connectors. Cross-row
 * arrows route horizontal segments through the gap between row boundaries
 * (between bar bottom and next bar top) to avoid colliding with other bars.
 * Same-row arrows use a simple 3-segment horizontal-vertical-horizontal path.
 */

import type { DependencyType } from '@cornerstone/shared';
import { BAR_HEIGHT, BAR_OFFSET_Y, ROW_HEIGHT } from './ganttUtils.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Horizontal standoff distance from bar left/right edges (px). */
export const ARROW_STANDOFF = 12;

/** Minimum horizontal jog length on either side of a segment. */
export const ARROW_MIN_H_SEG = 8;

/** Size of the arrowhead triangle in pixels. Paths end at arrowhead base. */
export const ARROWHEAD_SIZE = 6;

/**
 * Number of stagger slots used to spread parallel vertical spines.
 * Arrows are distributed across this many horizontal offset slots.
 */
const ARROW_STAGGER_SLOTS = 5;

/**
 * Horizontal pixel spacing between adjacent stagger slots.
 * Each slot is offset by this many pixels from the baseline spine position.
 */
const ARROW_STAGGER_STEP = 4;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Pixel rectangle describing a rendered bar. */
export interface BarRect {
  /** Bar left edge x position. */
  x: number;
  /** Bar width in pixels. */
  width: number;
  /** Row index (0-based). */
  rowIndex: number;
}

/** Computed SVG path data for a single dependency arrow. */
export interface ArrowPath {
  /** The SVG `d` attribute string for the connector path (without arrowhead). */
  pathD: string;
  /** X coordinate of the arrowhead tip. */
  tipX: number;
  /** Y coordinate of the arrowhead tip. */
  tipY: number;
  /** Direction the arrowhead points: 'right' (→) or 'left' (←). */
  tipDirection: 'right' | 'left';
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

/**
 * Returns the y-coordinate of the vertical center of a bar row.
 */
function barCenterY(rowIndex: number): number {
  return rowIndex * ROW_HEIGHT + BAR_OFFSET_Y + BAR_HEIGHT / 2;
}

/**
 * Returns the y-coordinate of the row-boundary channel between two rows.
 * The channel sits in the gap between bar bottom (row * ROW_HEIGHT + BAR_OFFSET_Y + BAR_HEIGHT)
 * and the next bar top ((row+1) * ROW_HEIGHT + BAR_OFFSET_Y).
 *
 * For downward arrows (dst below src), use the boundary below the predecessor.
 * For upward arrows (dst above src), use the boundary above the predecessor.
 */
function channelY(srcRowIndex: number, dstRowIndex: number): number {
  if (dstRowIndex > srcRowIndex) {
    // Going down: horizontal channel at the boundary below the predecessor row
    return (srcRowIndex + 1) * ROW_HEIGHT;
  }
  // Going up: horizontal channel at the boundary above the predecessor row
  return srcRowIndex * ROW_HEIGHT;
}

// ---------------------------------------------------------------------------
// Connection-point logic per dependency type
// ---------------------------------------------------------------------------

/**
 * Computes the SVG path and arrowhead tip for a Finish-to-Start dependency.
 *
 * Same-row: simple 3-segment H-V-H path.
 * Cross-row (standard): 5-segment path routing the horizontal through the
 *   row-boundary gap to avoid crossing other bars.
 * Cross-row (overlap/C-shape): when the successor starts before the predecessor
 *   ends, routes around via a bypass.
 *
 * All paths end at the arrowhead base (tipX - ARROWHEAD_SIZE for right-pointing).
 */
function computeFSArrow(predecessor: BarRect, successor: BarRect, arrowIndex: number): ArrowPath {
  const srcY = barCenterY(predecessor.rowIndex);
  const dstY = barCenterY(successor.rowIndex);

  const stagger = (arrowIndex % ARROW_STAGGER_SLOTS) * ARROW_STAGGER_STEP;

  const exitX = predecessor.x + predecessor.width + ARROW_STANDOFF;
  const entryX = successor.x - ARROW_STANDOFF;

  const tipX = successor.x;
  const tipY = dstY;
  const arrowBaseX = tipX - ARROWHEAD_SIZE;

  const sameRow = predecessor.rowIndex === successor.rowIndex;

  if (entryX >= exitX) {
    if (sameRow) {
      // Same-row: simple 3-segment path
      const spineX = entryX - stagger;
      return {
        pathD: `M ${exitX} ${srcY} H ${spineX} V ${dstY} H ${arrowBaseX}`,
        tipX,
        tipY,
        tipDirection: 'right',
      };
    }
    // Cross-row standard: 5-segment path through row-boundary gap
    const chY = channelY(predecessor.rowIndex, successor.rowIndex);
    const spineX = entryX - stagger;
    return {
      pathD: `M ${exitX} ${srcY} V ${chY} H ${spineX} V ${dstY} H ${arrowBaseX}`,
      tipX,
      tipY,
      tipDirection: 'right',
    };
  }

  // C-shape: exit right, drop to channel, go left to entry spine, drop to row center
  const spineX = exitX + stagger;
  if (sameRow) {
    const direction = 1;
    const bypassY = dstY + direction * (BAR_HEIGHT / 2 + ARROW_STANDOFF);
    const pathD = `M ${exitX} ${srcY} H ${spineX} V ${bypassY} H ${entryX} V ${dstY} H ${arrowBaseX}`;
    return { pathD, tipX, tipY, tipDirection: 'right' };
  }
  const chY = channelY(predecessor.rowIndex, successor.rowIndex);
  const pathD = `M ${exitX} ${srcY} V ${chY} H ${entryX} V ${dstY} H ${arrowBaseX}`;
  return { pathD, tipX, tipY, tipDirection: 'right' };
}

/**
 * Computes the SVG path for a Start-to-Start dependency.
 *
 * Same-row: 3-segment path branching left.
 * Cross-row: 5-segment path through row-boundary gap.
 * Path ends at arrowhead base (tipX - ARROWHEAD_SIZE).
 */
function computeSSArrow(predecessor: BarRect, successor: BarRect, arrowIndex: number): ArrowPath {
  const srcY = barCenterY(predecessor.rowIndex);
  const dstY = barCenterY(successor.rowIndex);

  const stagger = (arrowIndex % ARROW_STAGGER_SLOTS) * ARROW_STAGGER_STEP;

  const predExitX = predecessor.x - ARROW_STANDOFF;
  const succExitX = successor.x - ARROW_STANDOFF;

  // Use the leftmost exit as the common vertical spine, shifted further left by stagger
  const spineX = Math.min(predExitX, succExitX) - stagger;

  const tipX = successor.x;
  const tipY = dstY;
  const arrowBaseX = tipX - ARROWHEAD_SIZE;

  const sameRow = predecessor.rowIndex === successor.rowIndex;

  if (sameRow) {
    const pathD = `M ${predecessor.x} ${srcY} H ${spineX} V ${dstY} H ${arrowBaseX}`;
    return { pathD, tipX, tipY, tipDirection: 'right' };
  }

  // Cross-row: 5-segment path through row-boundary gap
  const chY = channelY(predecessor.rowIndex, successor.rowIndex);
  const pathD = `M ${predecessor.x} ${srcY} H ${spineX} V ${chY} H ${successor.x - ARROW_STANDOFF} V ${dstY} H ${arrowBaseX}`;
  return { pathD, tipX, tipY, tipDirection: 'right' };
}

/**
 * Computes the SVG path for a Finish-to-Finish dependency.
 *
 * Same-row: 3-segment path looping right.
 * Cross-row: 5-segment path through row-boundary gap.
 * Path ends at arrowhead base (tipX + ARROWHEAD_SIZE for left-pointing).
 */
function computeFFArrow(predecessor: BarRect, successor: BarRect, arrowIndex: number): ArrowPath {
  const srcY = barCenterY(predecessor.rowIndex);
  const dstY = barCenterY(successor.rowIndex);

  const stagger = (arrowIndex % ARROW_STAGGER_SLOTS) * ARROW_STAGGER_STEP;

  const predExitX = predecessor.x + predecessor.width + ARROW_STANDOFF;
  const succExitX = successor.x + successor.width + ARROW_STANDOFF;

  // Use the rightmost exit as the common vertical spine, shifted further right by stagger
  const spineX = Math.max(predExitX, succExitX) + stagger;

  const tipX = successor.x + successor.width;
  const tipY = dstY;
  const arrowBaseX = tipX + ARROWHEAD_SIZE;

  const sameRow = predecessor.rowIndex === successor.rowIndex;

  if (sameRow) {
    const pathD = `M ${predecessor.x + predecessor.width} ${srcY} H ${spineX} V ${dstY} H ${arrowBaseX}`;
    return { pathD, tipX, tipY, tipDirection: 'left' };
  }

  // Cross-row: 5-segment path through row-boundary gap
  const chY = channelY(predecessor.rowIndex, successor.rowIndex);
  const pathD = `M ${predecessor.x + predecessor.width} ${srcY} H ${spineX} V ${chY} H ${successor.x + successor.width + ARROW_STANDOFF} V ${dstY} H ${arrowBaseX}`;
  return { pathD, tipX, tipY, tipDirection: 'left' };
}

/**
 * Computes the SVG path for a Start-to-Finish dependency.
 *
 * Same-row: 3-segment path.
 * Cross-row: 5-segment path through row-boundary gap.
 * Path ends at arrowhead base (tipX + ARROWHEAD_SIZE for left-pointing).
 */
function computeSFArrow(predecessor: BarRect, successor: BarRect): ArrowPath {
  const srcY = barCenterY(predecessor.rowIndex);
  const dstY = barCenterY(successor.rowIndex);

  const exitX = predecessor.x - ARROW_STANDOFF;
  const entryX = successor.x + successor.width + ARROW_STANDOFF;

  const tipX = successor.x + successor.width;
  const tipY = dstY;
  const arrowBaseX = tipX + ARROWHEAD_SIZE;

  const sameRow = predecessor.rowIndex === successor.rowIndex;

  if (entryX <= exitX) {
    if (sameRow) {
      const midX = exitX + Math.max((entryX - exitX) / 2, ARROW_MIN_H_SEG);
      return {
        pathD: `M ${exitX} ${srcY} H ${midX} V ${dstY} H ${arrowBaseX}`,
        tipX,
        tipY,
        tipDirection: 'left',
      };
    }
    // Cross-row: 5-segment path through row-boundary gap
    const chY = channelY(predecessor.rowIndex, successor.rowIndex);
    return {
      pathD: `M ${exitX} ${srcY} V ${chY} H ${entryX} V ${dstY} H ${arrowBaseX}`,
      tipX,
      tipY,
      tipDirection: 'left',
    };
  }

  // U-turn: loop out to the left, then back right
  const loopX = exitX - ARROW_MIN_H_SEG;
  if (sameRow) {
    const pathD = `M ${predecessor.x} ${srcY} H ${loopX} V ${dstY} H ${arrowBaseX}`;
    return { pathD, tipX, tipY, tipDirection: 'left' };
  }
  // Cross-row U-turn: through row-boundary gap
  const chY = channelY(predecessor.rowIndex, successor.rowIndex);
  const pathD = `M ${predecessor.x} ${srcY} H ${loopX} V ${chY} H ${entryX} V ${dstY} H ${arrowBaseX}`;
  return { pathD, tipX, tipY, tipDirection: 'left' };
}

// ---------------------------------------------------------------------------
// Main path computation
// ---------------------------------------------------------------------------

/**
 * Computes the SVG path and arrowhead data for a single dependency arrow.
 *
 * Connection points by dependency type:
 *   - FS (Finish→Start): right edge of predecessor → left edge of successor
 *   - SS (Start→Start):  left edge of predecessor → left edge of successor
 *   - FF (Finish→Finish): right edge of predecessor → right edge of successor
 *   - SF (Start→Finish):  left edge of predecessor → right edge of successor
 *
 * @param arrowIndex Index of this arrow among all rendered arrows. Used to
 *   apply a small horizontal stagger to the vertical spine of FS, SS, and FF
 *   arrows so parallel arrows at similar x-positions don't overlap visually.
 *   Defaults to 0 (no stagger) for backwards compatibility.
 */
export function computeArrowPath(
  predecessor: BarRect,
  successor: BarRect,
  depType: DependencyType,
  arrowIndex: number = 0,
): ArrowPath {
  switch (depType) {
    case 'finish_to_start':
      return computeFSArrow(predecessor, successor, arrowIndex);
    case 'start_to_start':
      return computeSSArrow(predecessor, successor, arrowIndex);
    case 'finish_to_finish':
      return computeFFArrow(predecessor, successor, arrowIndex);
    case 'start_to_finish':
      return computeSFArrow(predecessor, successor);
  }
}

// ---------------------------------------------------------------------------
// Arrowhead polygon computation
// ---------------------------------------------------------------------------

/**
 * Computes the SVG polygon points string for an arrowhead triangle.
 *
 * @param tipX   X coordinate of the arrowhead tip (where it points to)
 * @param tipY   Y coordinate of the arrowhead tip
 * @param dir    Direction the arrowhead points
 * @param size   Base size of the arrowhead in pixels (defaults to 6)
 */
export function computeArrowhead(
  tipX: number,
  tipY: number,
  dir: 'right' | 'left',
  size: number = 6,
): string {
  const half = size / 2;
  if (dir === 'right') {
    // Pointing right (→): tip at (tipX, tipY), base at tipX-size
    return `${tipX},${tipY} ${tipX - size},${tipY - half} ${tipX - size},${tipY + half}`;
  } else {
    // Pointing left (←): tip at (tipX, tipY), base at tipX+size
    return `${tipX},${tipY} ${tipX + size},${tipY - half} ${tipX + size},${tipY + half}`;
  }
}
