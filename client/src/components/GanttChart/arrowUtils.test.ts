/**
 * @jest-environment node
 *
 * Exhaustive unit tests for arrowUtils.ts — pure SVG path computation functions
 * for Gantt chart dependency arrows.
 *
 * Tests cover all 4 dependency types (FS, SS, FF, SF), normal and C-shape
 * (overlap) cases, arrowhead polygon computation, and the public
 * computeArrowPath dispatcher.
 */
import { describe, it, expect } from '@jest/globals';
import {
  computeArrowPath,
  computeArrowhead,
  ARROW_STANDOFF,
  ARROW_MIN_H_SEG,
  ARROWHEAD_SIZE,
  type BarRect,
} from './arrowUtils.js';
import { ROW_HEIGHT, BAR_HEIGHT, BAR_OFFSET_Y } from './ganttUtils.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Build a BarRect at a given column/row position.
 * @param x        Left edge x pixel
 * @param width    Bar width in pixels
 * @param rowIndex 0-based row index
 */
function makeBar(x: number, width: number, rowIndex: number): BarRect {
  return { x, width, rowIndex };
}

/**
 * Expected vertical center Y for a given row.
 */
function expectedCenterY(rowIndex: number): number {
  return rowIndex * ROW_HEIGHT + BAR_OFFSET_Y + BAR_HEIGHT / 2;
}

// ---------------------------------------------------------------------------
// Constants verification
// ---------------------------------------------------------------------------

describe('Constants', () => {
  it('ARROW_STANDOFF is 12', () => {
    expect(ARROW_STANDOFF).toBe(12);
  });

  it('ARROW_MIN_H_SEG is 8', () => {
    expect(ARROW_MIN_H_SEG).toBe(8);
  });

  it('ARROWHEAD_SIZE is 6', () => {
    expect(ARROWHEAD_SIZE).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// computeArrowhead
// ---------------------------------------------------------------------------

describe('computeArrowhead', () => {
  describe('direction: right', () => {
    it('returns a string with 3 coordinate pairs', () => {
      const result = computeArrowhead(100, 50, 'right');
      const pairs = result.trim().split(/\s+/);
      expect(pairs).toHaveLength(3);
    });

    it('tip is at (tipX, tipY) for rightward arrow', () => {
      const result = computeArrowhead(100, 50, 'right');
      // First pair is the tip
      expect(result).toMatch(/^100,50/);
    });

    it('base points are to the left of the tip (right-pointing)', () => {
      const size = 6;
      const result = computeArrowhead(100, 50, 'right', size);
      const half = size / 2;
      // Expected: "tipX,tipY tipX-size,tipY-half tipX-size,tipY+half"
      expect(result).toBe(`100,50 ${100 - size},${50 - half} ${100 - size},${50 + half}`);
    });

    it('respects custom size parameter', () => {
      const size = 10;
      const result = computeArrowhead(200, 80, 'right', size);
      const half = size / 2;
      expect(result).toBe(`200,80 ${200 - size},${80 - half} ${200 - size},${80 + half}`);
    });

    it('uses default size of 6 when size not specified', () => {
      const defaultResult = computeArrowhead(100, 50, 'right');
      const explicitResult = computeArrowhead(100, 50, 'right', 6);
      expect(defaultResult).toBe(explicitResult);
    });
  });

  describe('direction: left', () => {
    it('returns a string with 3 coordinate pairs', () => {
      const result = computeArrowhead(50, 30, 'left');
      const pairs = result.trim().split(/\s+/);
      expect(pairs).toHaveLength(3);
    });

    it('tip is at (tipX, tipY) for leftward arrow', () => {
      const result = computeArrowhead(50, 30, 'left');
      expect(result).toMatch(/^50,30/);
    });

    it('base points are to the right of the tip (left-pointing)', () => {
      const size = 6;
      const result = computeArrowhead(50, 30, 'left', size);
      const half = size / 2;
      // Expected: "tipX,tipY tipX+size,tipY-half tipX+size,tipY+half"
      expect(result).toBe(`50,30 ${50 + size},${30 - half} ${50 + size},${30 + half}`);
    });

    it('respects custom size for left arrow', () => {
      const size = 8;
      const result = computeArrowhead(60, 40, 'left', size);
      const half = size / 2;
      expect(result).toBe(`60,40 ${60 + size},${40 - half} ${60 + size},${40 + half}`);
    });
  });

  describe('edge cases', () => {
    it('handles size=1 (minimum meaningful size)', () => {
      const result = computeArrowhead(10, 10, 'right', 1);
      expect(result).toBe(`10,10 9,9.5 9,10.5`);
    });

    it('handles coordinates at origin (0,0)', () => {
      const result = computeArrowhead(0, 0, 'right', 6);
      expect(result).toBe(`0,0 -6,-3 -6,3`);
    });

    it('handles large coordinates', () => {
      const result = computeArrowhead(5000, 2000, 'left', 6);
      expect(result).toBe(`5000,2000 5006,1997 5006,2003`);
    });
  });
});

// ---------------------------------------------------------------------------
// computeArrowPath — Finish-to-Start (FS)
// ---------------------------------------------------------------------------

describe('computeArrowPath — finish_to_start', () => {
  describe('cross-row standard path (successor starts after predecessor ends)', () => {
    // predecessor: x=100, width=80, right edge at 180, row 0
    //              exitX = 180 + 12 = 192
    // successor: x=250, left edge at 250, row 1
    //            entryX = 250 - 12 = 238
    // entryX(238) >= exitX(192) → standard cross-row 5-segment path
    const pred = makeBar(100, 80, 0);
    const succ = makeBar(250, 100, 1);

    it('tipDirection is "right"', () => {
      const result = computeArrowPath(pred, succ, 'finish_to_start');
      expect(result.tipDirection).toBe('right');
    });

    it('tipX is the left edge of the successor bar', () => {
      const result = computeArrowPath(pred, succ, 'finish_to_start');
      expect(result.tipX).toBe(succ.x);
    });

    it('tipY is the vertical center of the successor row', () => {
      const result = computeArrowPath(pred, succ, 'finish_to_start');
      expect(result.tipY).toBe(expectedCenterY(succ.rowIndex));
    });

    it('pathD starts at M with bar right edge (not standoff)', () => {
      const result = computeArrowPath(pred, succ, 'finish_to_start');
      const predRightEdge = pred.x + pred.width;
      expect(result.pathD).toMatch(new RegExp(`^M ${predRightEdge}`));
    });

    it('pathD ends at arrowhead base (tipX - ARROWHEAD_SIZE)', () => {
      const result = computeArrowPath(pred, succ, 'finish_to_start');
      const arrowBaseX = succ.x - ARROWHEAD_SIZE;
      expect(result.pathD).toMatch(new RegExp(`H ${arrowBaseX}$`));
    });

    it('cross-row pathD is a valid 5-segment path (M ... H ... V ... H ... V ... H ...)', () => {
      const result = computeArrowPath(pred, succ, 'finish_to_start');
      expect(result.pathD).toMatch(/^M \d+ \d+ H \d+ V \d+ H \d+ V \d+ H \d+$/);
    });

    it('horizontal channel is at the row boundary between pred and succ', () => {
      const result = computeArrowPath(pred, succ, 'finish_to_start');
      // Going down: channelY = (pred.rowIndex + 1) * ROW_HEIGHT = 1 * 40 = 40
      const chY = (pred.rowIndex + 1) * ROW_HEIGHT;
      expect(result.pathD).toContain(`V ${chY}`);
    });

    it('same-row bars produce a 3-segment path ending at arrowhead base', () => {
      const pred2 = makeBar(50, 60, 2);
      const succ2 = makeBar(200, 80, 2);
      const result = computeArrowPath(pred2, succ2, 'finish_to_start');
      const centerY = expectedCenterY(2);
      expect(result.tipY).toBe(centerY);
      // Same row: 3-segment H-V-H path
      expect(result.pathD).toMatch(/^M \d+ \d+ H \d+ V \d+ H \d+$/);
      // Ends at arrowhead base
      const arrowBaseX = succ2.x - ARROWHEAD_SIZE;
      expect(result.pathD).toMatch(new RegExp(`H ${arrowBaseX}$`));
    });
  });

  describe('C-shape path (successor starts before/overlapping predecessor end)', () => {
    // Cross-row C-shape: predecessor row 0, successor row 1
    // predecessor: x=200, width=150, right edge at 350
    //              exitX = 350 + 12 = 362
    // successor: x=100, left edge at 100
    //            entryX = 100 - 12 = 88
    // entryX(88) < exitX(362) → C-shape
    const pred = makeBar(200, 150, 0);
    const succ = makeBar(100, 80, 1);

    it('tipDirection is "right"', () => {
      const result = computeArrowPath(pred, succ, 'finish_to_start');
      expect(result.tipDirection).toBe('right');
    });

    it('tipX is still left edge of successor', () => {
      const result = computeArrowPath(pred, succ, 'finish_to_start');
      expect(result.tipX).toBe(succ.x);
    });

    it('C-shape pathD starts at M with bar right edge', () => {
      const result = computeArrowPath(pred, succ, 'finish_to_start');
      const predRightEdge = pred.x + pred.width;
      expect(result.pathD).toMatch(new RegExp(`^M ${predRightEdge}`));
    });

    it('C-shape cross-row routes through row-boundary gap', () => {
      const result = computeArrowPath(pred, succ, 'finish_to_start');
      const entryX = succ.x - ARROW_STANDOFF;
      // Cross-row C-shape: M exitX srcY V channelY H entryX V dstY H arrowBaseX
      expect(result.pathD).toContain(`H ${entryX}`);
      // Channel at row boundary
      const chY = (pred.rowIndex + 1) * ROW_HEIGHT;
      expect(result.pathD).toContain(`V ${chY}`);
    });

    it('C-shape path ends at arrowhead base', () => {
      const result = computeArrowPath(pred, succ, 'finish_to_start');
      const arrowBaseX = succ.x - ARROWHEAD_SIZE;
      expect(result.pathD).toMatch(new RegExp(`H ${arrowBaseX}$`));
    });

    it('exactly touching bars (entryX === exitX) takes the standard cross-row path', () => {
      // Make them exactly touch: succ.x - ARROW_STANDOFF = pred.x + pred.width + ARROW_STANDOFF
      const pred2 = makeBar(100, 80, 0);
      const succ2 = makeBar(204, 60, 1); // 100 + 80 + 24 = 204
      const result = computeArrowPath(pred2, succ2, 'finish_to_start');
      // Cross-row: 5-segment path (H-V-H-V-H)
      expect(result.pathD).toMatch(/^M \d+ \d+ H \d+ V \d+ H \d+ V \d+ H \d+$/);
    });
  });

  describe('cross-row arrows', () => {
    it('connects row 0 predecessor to row 3 successor correctly', () => {
      const pred = makeBar(50, 100, 0);
      const succ = makeBar(300, 80, 3);
      const result = computeArrowPath(pred, succ, 'finish_to_start');
      expect(result.tipX).toBe(300);
      expect(result.tipY).toBe(expectedCenterY(3));
    });

    it('path contains vertical segment to destination row Y', () => {
      const pred = makeBar(50, 100, 1);
      const succ = makeBar(300, 80, 4);
      const result = computeArrowPath(pred, succ, 'finish_to_start');
      expect(result.pathD).toContain(`V ${expectedCenterY(4)}`);
    });

    it('upward cross-row uses boundary above predecessor', () => {
      const pred = makeBar(50, 100, 3);
      const succ = makeBar(300, 80, 0);
      const result = computeArrowPath(pred, succ, 'finish_to_start');
      // Going up: channelY = pred.rowIndex * ROW_HEIGHT = 3 * 40 = 120
      const chY = pred.rowIndex * ROW_HEIGHT;
      expect(result.pathD).toContain(`V ${chY}`);
    });
  });
});

// ---------------------------------------------------------------------------
// computeArrowPath — Start-to-Start (SS)
// ---------------------------------------------------------------------------

describe('computeArrowPath — start_to_start', () => {
  describe('cross-row case: predecessor starts before successor', () => {
    const pred = makeBar(100, 80, 0);
    const succ = makeBar(200, 60, 1);

    it('tipDirection is "right"', () => {
      const result = computeArrowPath(pred, succ, 'start_to_start');
      expect(result.tipDirection).toBe('right');
    });

    it('tipX is the left edge of the successor bar', () => {
      const result = computeArrowPath(pred, succ, 'start_to_start');
      expect(result.tipX).toBe(succ.x);
    });

    it('tipY is the vertical center of the successor row', () => {
      const result = computeArrowPath(pred, succ, 'start_to_start');
      expect(result.tipY).toBe(expectedCenterY(succ.rowIndex));
    });

    it('spine is the leftmost of the two exits (predecessor is further left)', () => {
      const result = computeArrowPath(pred, succ, 'start_to_start');
      const spineX = pred.x - ARROW_STANDOFF; // 88 < 188
      expect(result.pathD).toContain(`H ${spineX}`);
    });

    it('pathD starts at predecessor left edge', () => {
      const result = computeArrowPath(pred, succ, 'start_to_start');
      expect(result.pathD).toMatch(new RegExp(`^M ${pred.x}`));
    });

    it('pathD ends at arrowhead base (tipX - ARROWHEAD_SIZE)', () => {
      const result = computeArrowPath(pred, succ, 'start_to_start');
      const arrowBaseX = succ.x - ARROWHEAD_SIZE;
      expect(result.pathD).toMatch(new RegExp(`H ${arrowBaseX}$`));
    });

    it('same-row SS path ends at arrowhead base', () => {
      const pred2 = makeBar(100, 80, 2);
      const succ2 = makeBar(200, 60, 2);
      const result = computeArrowPath(pred2, succ2, 'start_to_start');
      const arrowBaseX = succ2.x - ARROWHEAD_SIZE;
      expect(result.pathD).toMatch(new RegExp(`H ${arrowBaseX}$`));
      // Same-row: 3-segment format
      expect(result.pathD).toMatch(/^M \d+ \d+ H [-\d.]+ V \d+ H \d+$/);
    });
  });

  describe('inverted case: successor starts before predecessor', () => {
    const pred = makeBar(300, 80, 0);
    const succ = makeBar(100, 60, 1);

    it('spine is the leftmost exit (successor is further left)', () => {
      const result = computeArrowPath(pred, succ, 'start_to_start');
      const spineX = succ.x - ARROW_STANDOFF; // 88 < 288
      expect(result.pathD).toContain(`H ${spineX}`);
    });

    it('tipX is still successor left edge', () => {
      const result = computeArrowPath(pred, succ, 'start_to_start');
      expect(result.tipX).toBe(succ.x);
    });
  });

  describe('same x start position', () => {
    it('handles predecessor and successor starting at the same x', () => {
      const pred = makeBar(150, 80, 0);
      const succ = makeBar(150, 60, 1);
      const result = computeArrowPath(pred, succ, 'start_to_start');
      const spineX = 150 - ARROW_STANDOFF;
      expect(result.pathD).toContain(`H ${spineX}`);
    });
  });
});

// ---------------------------------------------------------------------------
// computeArrowPath — Finish-to-Finish (FF)
// ---------------------------------------------------------------------------

describe('computeArrowPath — finish_to_finish', () => {
  describe('cross-row case: predecessor ends before successor', () => {
    const pred = makeBar(50, 100, 0);
    const succ = makeBar(200, 150, 1);

    it('tipDirection is "left"', () => {
      const result = computeArrowPath(pred, succ, 'finish_to_finish');
      expect(result.tipDirection).toBe('left');
    });

    it('tipX is the right edge of the successor bar', () => {
      const result = computeArrowPath(pred, succ, 'finish_to_finish');
      expect(result.tipX).toBe(succ.x + succ.width);
    });

    it('tipY is the vertical center of the successor row', () => {
      const result = computeArrowPath(pred, succ, 'finish_to_finish');
      expect(result.tipY).toBe(expectedCenterY(succ.rowIndex));
    });

    it('spine is the rightmost of the two exits (successor is wider/rightward)', () => {
      const result = computeArrowPath(pred, succ, 'finish_to_finish');
      const spineX = succ.x + succ.width + ARROW_STANDOFF; // 362 > 162
      expect(result.pathD).toContain(`H ${spineX}`);
    });

    it('pathD starts at predecessor right edge', () => {
      const result = computeArrowPath(pred, succ, 'finish_to_finish');
      expect(result.pathD).toMatch(new RegExp(`^M ${pred.x + pred.width}`));
    });

    it('pathD ends at arrowhead base (tipX + ARROWHEAD_SIZE for left-pointing)', () => {
      const result = computeArrowPath(pred, succ, 'finish_to_finish');
      const arrowBaseX = succ.x + succ.width + ARROWHEAD_SIZE;
      expect(result.pathD).toMatch(new RegExp(`H ${arrowBaseX}$`));
    });

    it('same-row FF path ends at arrowhead base', () => {
      const pred2 = makeBar(50, 100, 2);
      const succ2 = makeBar(200, 150, 2);
      const result = computeArrowPath(pred2, succ2, 'finish_to_finish');
      const arrowBaseX = succ2.x + succ2.width + ARROWHEAD_SIZE;
      expect(result.pathD).toMatch(new RegExp(`H ${arrowBaseX}$`));
    });
  });

  describe('inverted case: successor ends before predecessor', () => {
    const pred = makeBar(300, 200, 0);
    const succ = makeBar(50, 100, 1);

    it('spine is the rightmost exit (predecessor is further right)', () => {
      const result = computeArrowPath(pred, succ, 'finish_to_finish');
      const spineX = pred.x + pred.width + ARROW_STANDOFF; // 512 > 162
      expect(result.pathD).toContain(`H ${spineX}`);
    });

    it('tipDirection remains "left"', () => {
      const result = computeArrowPath(pred, succ, 'finish_to_finish');
      expect(result.tipDirection).toBe('left');
    });
  });

  describe('equal right edges', () => {
    it('handles bars ending at the same x (spine = either exit)', () => {
      const pred = makeBar(100, 100, 0);
      const succ = makeBar(50, 150, 1);
      const result = computeArrowPath(pred, succ, 'finish_to_finish');
      const spineX = Math.max(
        pred.x + pred.width + ARROW_STANDOFF,
        succ.x + succ.width + ARROW_STANDOFF,
      );
      expect(result.pathD).toContain(`H ${spineX}`);
    });
  });
});

// ---------------------------------------------------------------------------
// computeArrowPath — Start-to-Finish (SF)
// ---------------------------------------------------------------------------

describe('computeArrowPath — start_to_finish', () => {
  describe('cross-row standard path (entryX <= exitX)', () => {
    const pred = makeBar(300, 80, 0);
    const succ = makeBar(50, 100, 1);

    it('tipDirection is "left"', () => {
      const result = computeArrowPath(pred, succ, 'start_to_finish');
      expect(result.tipDirection).toBe('left');
    });

    it('tipX is the right edge of the successor bar', () => {
      const result = computeArrowPath(pred, succ, 'start_to_finish');
      expect(result.tipX).toBe(succ.x + succ.width);
    });

    it('tipY is vertical center of the successor row', () => {
      const result = computeArrowPath(pred, succ, 'start_to_finish');
      expect(result.tipY).toBe(expectedCenterY(succ.rowIndex));
    });

    it('pathD starts at M with predecessor left edge', () => {
      const result = computeArrowPath(pred, succ, 'start_to_finish');
      expect(result.pathD).toMatch(new RegExp(`^M ${pred.x}`));
    });

    it('pathD ends at arrowhead base (tipX + ARROWHEAD_SIZE for left-pointing)', () => {
      const result = computeArrowPath(pred, succ, 'start_to_finish');
      const arrowBaseX = succ.x + succ.width + ARROWHEAD_SIZE;
      expect(result.pathD).toMatch(new RegExp(`H ${arrowBaseX}$`));
    });

    it('cross-row SF path routes through row-boundary gap', () => {
      const result = computeArrowPath(pred, succ, 'start_to_finish');
      // Going down: channelY = (pred.rowIndex + 1) * ROW_HEIGHT = 40
      const chY = (pred.rowIndex + 1) * ROW_HEIGHT;
      expect(result.pathD).toContain(`V ${chY}`);
    });

    it('same-row SF standard path is 3-segment format', () => {
      const pred2 = makeBar(300, 80, 2);
      const succ2 = makeBar(50, 100, 2);
      const result = computeArrowPath(pred2, succ2, 'start_to_finish');
      const arrowBaseX = succ2.x + succ2.width + ARROWHEAD_SIZE;
      expect(result.pathD).toMatch(new RegExp(`H ${arrowBaseX}$`));
    });
  });

  describe('U-turn path (entryX > exitX)', () => {
    const pred = makeBar(50, 80, 0);
    const succ = makeBar(200, 100, 1);

    it('tipDirection is "left"', () => {
      const result = computeArrowPath(pred, succ, 'start_to_finish');
      expect(result.tipDirection).toBe('left');
    });

    it('tipX is still right edge of successor', () => {
      const result = computeArrowPath(pred, succ, 'start_to_finish');
      expect(result.tipX).toBe(succ.x + succ.width);
    });

    it('U-turn pathD starts at predecessor left edge', () => {
      const result = computeArrowPath(pred, succ, 'start_to_finish');
      expect(result.pathD).toMatch(new RegExp(`^M ${pred.x}`));
    });

    it('U-turn loops left by ARROW_MIN_H_SEG before turning', () => {
      const result = computeArrowPath(pred, succ, 'start_to_finish');
      const exitX = pred.x - ARROW_STANDOFF;
      const loopX = exitX - ARROW_MIN_H_SEG;
      expect(result.pathD).toContain(`H ${loopX}`);
    });

    it('U-turn path ends at arrowhead base', () => {
      const result = computeArrowPath(pred, succ, 'start_to_finish');
      const arrowBaseX = succ.x + succ.width + ARROWHEAD_SIZE;
      expect(result.pathD).toMatch(new RegExp(`H ${arrowBaseX}$`));
    });
  });

  describe('boundary: entryX exactly equals exitX (standard path taken)', () => {
    const pred = makeBar(174, 80, 0);
    const succ = makeBar(50, 100, 1);

    it('exactly equal takes cross-row standard path', () => {
      const result = computeArrowPath(pred, succ, 'start_to_finish');
      // Cross-row: 5-segment path through row-boundary
      const arrowBaseX = succ.x + succ.width + ARROWHEAD_SIZE;
      expect(result.pathD).toMatch(new RegExp(`H ${arrowBaseX}$`));
    });
  });
});

// ---------------------------------------------------------------------------
// computeArrowPath — dispatcher (all 4 types)
// ---------------------------------------------------------------------------

describe('computeArrowPath — dispatcher', () => {
  const pred = makeBar(50, 100, 0);
  const succ = makeBar(250, 80, 1);

  it('routes finish_to_start correctly (tipDirection right, tipX = succ.x)', () => {
    const result = computeArrowPath(pred, succ, 'finish_to_start');
    expect(result.tipDirection).toBe('right');
    expect(result.tipX).toBe(succ.x);
  });

  it('routes start_to_start correctly (tipDirection right, tipX = succ.x)', () => {
    const result = computeArrowPath(pred, succ, 'start_to_start');
    expect(result.tipDirection).toBe('right');
    expect(result.tipX).toBe(succ.x);
  });

  it('routes finish_to_finish correctly (tipDirection left, tipX = succ right edge)', () => {
    const result = computeArrowPath(pred, succ, 'finish_to_finish');
    expect(result.tipDirection).toBe('left');
    expect(result.tipX).toBe(succ.x + succ.width);
  });

  it('routes start_to_finish correctly (tipDirection left, tipX = succ right edge)', () => {
    // Need SF U-turn: succ.x is to the right of pred for a U-turn
    const sfPred = makeBar(50, 80, 0);
    const sfSucc = makeBar(200, 80, 1);
    const result = computeArrowPath(sfPred, sfSucc, 'start_to_finish');
    expect(result.tipDirection).toBe('left');
    expect(result.tipX).toBe(sfSucc.x + sfSucc.width);
  });

  it('all dependency types return an ArrowPath with required fields', () => {
    const types = [
      'finish_to_start',
      'start_to_start',
      'finish_to_finish',
      'start_to_finish',
    ] as const;
    for (const depType of types) {
      const result = computeArrowPath(pred, succ, depType);
      expect(result).toHaveProperty('pathD');
      expect(result).toHaveProperty('tipX');
      expect(result).toHaveProperty('tipY');
      expect(result).toHaveProperty('tipDirection');
      expect(typeof result.pathD).toBe('string');
      expect(result.pathD.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Geometry: barCenterY is computed correctly
// ---------------------------------------------------------------------------

describe('Row center Y geometry', () => {
  it('row 0 center Y matches expected formula', () => {
    const pred = makeBar(50, 100, 0);
    const succ = makeBar(250, 80, 0);
    const result = computeArrowPath(pred, succ, 'finish_to_start');
    expect(result.tipY).toBe(expectedCenterY(0));
  });

  it('row 1 center Y matches expected formula', () => {
    const pred = makeBar(50, 100, 0);
    const succ = makeBar(250, 80, 1);
    const result = computeArrowPath(pred, succ, 'finish_to_start');
    expect(result.tipY).toBe(expectedCenterY(1));
  });

  it('row 5 center Y matches expected formula', () => {
    const pred = makeBar(50, 100, 0);
    const succ = makeBar(250, 80, 5);
    const result = computeArrowPath(pred, succ, 'finish_to_start');
    expect(result.tipY).toBe(expectedCenterY(5));
  });

  it('center Y uses BAR_OFFSET_Y + BAR_HEIGHT/2 offset within row', () => {
    // For row 0: expectedCenterY(0) = BAR_OFFSET_Y + BAR_HEIGHT / 2
    const expected = BAR_OFFSET_Y + BAR_HEIGHT / 2;
    const pred = makeBar(50, 100, 0);
    const succ = makeBar(250, 80, 0);
    const result = computeArrowPath(pred, succ, 'start_to_start');
    // srcY is used in pathD as starting point Y
    expect(result.pathD).toContain(` ${expected} `);
  });
});

// ---------------------------------------------------------------------------
// Edge cases and extreme values
// ---------------------------------------------------------------------------

describe('Edge cases', () => {
  it('zero-width bars are handled without error', () => {
    const pred = makeBar(100, 0, 0);
    const succ = makeBar(200, 0, 1);
    expect(() => computeArrowPath(pred, succ, 'finish_to_start')).not.toThrow();
    expect(() => computeArrowPath(pred, succ, 'start_to_start')).not.toThrow();
    expect(() => computeArrowPath(pred, succ, 'finish_to_finish')).not.toThrow();
    expect(() => computeArrowPath(pred, succ, 'start_to_finish')).not.toThrow();
  });

  it('predecessor and successor on same row (rowIndex 0)', () => {
    const pred = makeBar(50, 80, 0);
    const succ = makeBar(300, 80, 0);
    const result = computeArrowPath(pred, succ, 'finish_to_start');
    expect(result.tipY).toBe(expectedCenterY(0));
    // Same row: 3-segment path ending at arrowhead base
    const arrowBaseX = succ.x - ARROWHEAD_SIZE;
    expect(result.pathD).toMatch(new RegExp(`H ${arrowBaseX}$`));
  });

  it('very large row indices do not cause overflow', () => {
    const pred = makeBar(100, 80, 100);
    const succ = makeBar(300, 80, 101);
    const result = computeArrowPath(pred, succ, 'finish_to_start');
    expect(result.tipY).toBe(expectedCenterY(101));
    expect(isFinite(result.tipX)).toBe(true);
    expect(isFinite(result.tipY)).toBe(true);
  });

  it('negative x coordinates are handled (off-screen bars)', () => {
    const pred = makeBar(-100, 80, 0);
    const succ = makeBar(50, 80, 1);
    expect(() => computeArrowPath(pred, succ, 'finish_to_start')).not.toThrow();
  });

  it('all path types produce non-empty pathD strings', () => {
    const pred = makeBar(10, 50, 0);
    const succ = makeBar(100, 50, 1);
    const types = [
      'finish_to_start',
      'start_to_start',
      'finish_to_finish',
      'start_to_finish',
    ] as const;
    for (const t of types) {
      const result = computeArrowPath(pred, succ, t);
      expect(result.pathD).toBeTruthy();
    }
  });
});
