/**
 * arrowUtils.ts
 *
 * Pure utility functions for computing dependency arrow SVG paths between
 * Gantt chart bars. All functions are side-effect free and memoization-friendly.
 *
 * Arrow routing strategy: orthogonal (right-angle) connectors with a
 * horizontal-first approach. Arrows maintain a 12px standoff from bar edges
 * to avoid overlapping bar outlines.
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
 * Builds an orthogonal SVG path from (srcX, srcY) to (dstX, dstY) using
 * a horizontal → vertical → horizontal routing.
 */
function buildOrthoPath(srcX: number, srcY: number, dstX: number, dstY: number): string {
  const midX = srcX + Math.max((dstX - srcX) / 2, ARROW_MIN_H_SEG);
  return `M ${srcX} ${srcY} H ${midX} V ${dstY} H ${dstX}`;
}

// ---------------------------------------------------------------------------
// Connection-point logic per dependency type
// ---------------------------------------------------------------------------

/**
 * Computes the SVG path and arrowhead tip for a Finish-to-Start dependency.
 *
 * Routing: right edge of predecessor → (standoff right) →
 *          vertical → (standoff left of successor) → left edge of successor
 *
 * Standard case (entryX >= exitX): horizontal-first L-shape routing —
 * the arrow exits the predecessor, travels right to a spine near the successor
 * entry point, drops vertically, then enters the successor from the left.
 *
 * Adjacent/overlap case (entryX < exitX): C-shape routing — the arrow exits
 * the predecessor right, drops past the successor bar, goes left to the entry
 * point, then comes back up (or down) to the successor row center.
 *
 * @param arrowIndex Index of this arrow among all rendered arrows, used to
 *   apply a horizontal stagger offset to the vertical spine so parallel arrows
 *   don't collapse into a single line.
 */
function computeFSArrow(predecessor: BarRect, successor: BarRect, arrowIndex: number): ArrowPath {
  const srcY = barCenterY(predecessor.rowIndex);
  const dstY = barCenterY(successor.rowIndex);

  const stagger = (arrowIndex % ARROW_STAGGER_SLOTS) * ARROW_STAGGER_STEP;

  const exitX = predecessor.x + predecessor.width + ARROW_STANDOFF;
  const entryX = successor.x - ARROW_STANDOFF;

  const tipX = successor.x;
  const tipY = dstY;

  if (entryX >= exitX) {
    // Standard case: horizontal-first L-shape — spine placed near the entry point
    const spineX = entryX - stagger;
    return {
      pathD: `M ${exitX} ${srcY} H ${spineX} V ${dstY} H ${entryX}`,
      tipX,
      tipY,
      tipDirection: 'right',
    };
  }

  // C-shape: exit right, drop past successor bar, go left to entry, come up to row center
  const spineX = exitX + stagger;
  const direction = dstY >= srcY ? 1 : -1;
  const bypassY = dstY + direction * (BAR_HEIGHT / 2 + ARROW_STANDOFF);
  const pathD = `M ${exitX} ${srcY} H ${spineX} V ${bypassY} H ${entryX} V ${dstY}`;
  return { pathD, tipX, tipY, tipDirection: 'right' };
}

/**
 * Computes the SVG path for a Start-to-Start dependency.
 *
 * Routing: both bars' left edges, branching left from the further-left exit.
 *
 * @param arrowIndex Index of this arrow among all rendered arrows, used to
 *   apply a horizontal stagger offset to the vertical spine.
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

  const pathD = `M ${predecessor.x} ${srcY} H ${spineX} V ${dstY} H ${tipX}`;
  return { pathD, tipX, tipY, tipDirection: 'right' };
}

/**
 * Computes the SVG path for a Finish-to-Finish dependency.
 *
 * Routing: both bars' right edges; loop out to the rightmost exit.
 *
 * @param arrowIndex Index of this arrow among all rendered arrows, used to
 *   apply a horizontal stagger offset to the vertical spine.
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

  const pathD = `M ${predecessor.x + predecessor.width} ${srcY} H ${spineX} V ${dstY} H ${tipX}`;
  return { pathD, tipX, tipY, tipDirection: 'left' };
}

/**
 * Computes the SVG path for a Start-to-Finish dependency.
 *
 * Routing: left edge of predecessor → right edge of successor.
 * When successor right edge is left of predecessor left edge, a U-turn is needed.
 */
function computeSFArrow(predecessor: BarRect, successor: BarRect): ArrowPath {
  const srcY = barCenterY(predecessor.rowIndex);
  const dstY = barCenterY(successor.rowIndex);

  const exitX = predecessor.x - ARROW_STANDOFF;
  const entryX = successor.x + successor.width + ARROW_STANDOFF;

  const tipX = successor.x + successor.width;
  const tipY = dstY;

  if (entryX <= exitX) {
    // Standard path: exit left, come in from right
    return {
      pathD: buildOrthoPath(exitX, srcY, entryX, dstY),
      tipX,
      tipY,
      tipDirection: 'left',
    };
  }

  // U-turn: loop out to the left, then back right
  const loopX = exitX - ARROW_MIN_H_SEG;
  const pathD = `M ${predecessor.x} ${srcY} H ${loopX} V ${dstY} H ${entryX}`;
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
