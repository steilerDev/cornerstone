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
  describe('standard left-to-right path (successor starts after predecessor ends)', () => {
    // predecessor: x=100, width=80, right edge at 180
    //              exitX = 180 + 12 = 192
    // successor: x=250, left edge at 250
    //            entryX = 250 - 12 = 238
    // entryX(238) >= exitX(192) → standard path
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

    it('pathD starts at M with exit x (right edge + standoff)', () => {
      const result = computeArrowPath(pred, succ, 'finish_to_start');
      const exitX = pred.x + pred.width + ARROW_STANDOFF;
      expect(result.pathD).toMatch(new RegExp(`^M ${exitX}`));
    });

    it('pathD ends at the entry x (successor left - standoff)', () => {
      const result = computeArrowPath(pred, succ, 'finish_to_start');
      const entryX = succ.x - ARROW_STANDOFF;
      expect(result.pathD).toContain(`H ${entryX}`);
    });

    it('pathD is a valid orthogonal path (M ... H ... V ... H ...)', () => {
      const result = computeArrowPath(pred, succ, 'finish_to_start');
      expect(result.pathD).toMatch(/^M \d+ \d+ H \d+ V \d+ H \d+$/);
    });

    it('same-row bars produce a path from source center to dest center', () => {
      const pred2 = makeBar(50, 60, 2);
      const succ2 = makeBar(200, 80, 2);
      const result = computeArrowPath(pred2, succ2, 'finish_to_start');
      const centerY = expectedCenterY(2);
      expect(result.tipY).toBe(centerY);
      // Since same row, V segment should stay at same Y
      expect(result.pathD).toContain(`V ${centerY}`);
    });
  });

  describe('C-shape path (successor starts before/overlapping predecessor end)', () => {
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

    it('C-shape pathD starts at M with exit x (right edge + standoff)', () => {
      const result = computeArrowPath(pred, succ, 'finish_to_start');
      const exitX = pred.x + pred.width + ARROW_STANDOFF;
      expect(result.pathD).toMatch(new RegExp(`^M ${exitX}`));
    });

    it('C-shape drops past successor bar then enters from the left', () => {
      const result = computeArrowPath(pred, succ, 'finish_to_start');
      const entryX = succ.x - ARROW_STANDOFF;
      const dstY = expectedCenterY(succ.rowIndex);
      // C-shape has 5 segments: M exitX srcY H spineX V bypassY H entryX V dstY
      expect(result.pathD).toMatch(/^M \d+ \d+ H \d+ V \d+ H \d+ V \d+$/);
      expect(result.pathD).toContain(`H ${entryX}`);
      expect(result.pathD).toContain(`V ${dstY}`);
    });

    it('C-shape bypass Y clears successor bar (BAR_HEIGHT/2 + ARROW_STANDOFF)', () => {
      const result = computeArrowPath(pred, succ, 'finish_to_start');
      const dstY = expectedCenterY(succ.rowIndex);
      // Successor is below predecessor, so bypass goes below (direction = 1)
      const bypassY = dstY + 1 * (BAR_HEIGHT / 2 + ARROW_STANDOFF);
      expect(result.pathD).toContain(`V ${bypassY}`);
    });

    it('exactly touching bars (entryX === exitX) takes the standard path', () => {
      // Make them exactly touch: succ.x - ARROW_STANDOFF = pred.x + pred.width + ARROW_STANDOFF
      // pred right + 12 = succ.x - 12  →  succ.x = pred.x + pred.width + 24
      const pred2 = makeBar(100, 80, 0);
      const succ2 = makeBar(204, 60, 1); // 100 + 80 + 24 = 204
      const result = computeArrowPath(pred2, succ2, 'finish_to_start');
      // entryX = 204 - 12 = 192, exitX = 100 + 80 + 12 = 192 → equal, takes standard path
      expect(result.pathD).toMatch(/^M \d+ \d+ H \d+ V \d+ H \d+$/);
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

    it('vertical segment in path matches destination row Y', () => {
      const pred = makeBar(50, 100, 1);
      const succ = makeBar(300, 80, 4);
      const result = computeArrowPath(pred, succ, 'finish_to_start');
      expect(result.pathD).toContain(`V ${expectedCenterY(4)}`);
    });
  });
});

// ---------------------------------------------------------------------------
// computeArrowPath — Start-to-Start (SS)
// ---------------------------------------------------------------------------

describe('computeArrowPath — start_to_start', () => {
  describe('normal case: predecessor starts before successor', () => {
    // predecessor: x=100, width=80, left edge at 100
    //              predExitX = 100 - 12 = 88
    // successor: x=200, left edge at 200
    //            succExitX = 200 - 12 = 188
    // spineX = min(88, 188) = 88
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

    it('pathD ends at successor left edge', () => {
      const result = computeArrowPath(pred, succ, 'start_to_start');
      expect(result.pathD).toMatch(new RegExp(`H ${succ.x}$`));
    });
  });

  describe('inverted case: successor starts before predecessor', () => {
    // predecessor: x=300, succExitX = 300-12=288
    // successor: x=100, predExitX = 100-12=88
    // spineX = min(288, 88) = 88
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
      // Both exits are the same, spineX = 150 - 12 = 138
      const spineX = 150 - ARROW_STANDOFF;
      expect(result.pathD).toContain(`H ${spineX}`);
    });
  });
});

// ---------------------------------------------------------------------------
// computeArrowPath — Finish-to-Finish (FF)
// ---------------------------------------------------------------------------

describe('computeArrowPath — finish_to_finish', () => {
  describe('normal case: predecessor ends before successor', () => {
    // predecessor: x=50, width=100, right edge at 150
    //              predExitX = 150 + 12 = 162
    // successor: x=200, width=150, right edge at 350
    //            succExitX = 350 + 12 = 362
    // spineX = max(162, 362) = 362
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

    it('pathD ends at successor right edge', () => {
      const result = computeArrowPath(pred, succ, 'finish_to_finish');
      expect(result.pathD).toMatch(new RegExp(`H ${succ.x + succ.width}$`));
    });
  });

  describe('inverted case: successor ends before predecessor', () => {
    // predecessor: x=300, width=200, right at 500; predExitX=512
    // successor: x=50, width=100, right at 150; succExitX=162
    // spineX = max(512, 162) = 512
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
      // Both right edges at 200; predExitX = succExitX = 212
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
  describe('standard right-to-left path (entryX <= exitX)', () => {
    // predecessor: x=300, width=80
    //              exitX = 300 - 12 = 288
    // successor: x=50, width=100, right edge at 150
    //            entryX = 150 + 12 = 162
    // entryX(162) <= exitX(288) → standard path
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

    it('pathD starts at M with exit x (predecessor left - standoff)', () => {
      const result = computeArrowPath(pred, succ, 'start_to_finish');
      const exitX = pred.x - ARROW_STANDOFF;
      expect(result.pathD).toMatch(new RegExp(`^M ${exitX}`));
    });

    it('pathD ends at entry x (successor right + standoff)', () => {
      const result = computeArrowPath(pred, succ, 'start_to_finish');
      const entryX = succ.x + succ.width + ARROW_STANDOFF;
      expect(result.pathD).toContain(`H ${entryX}`);
    });

    it('pathD is valid orthogonal format', () => {
      const result = computeArrowPath(pred, succ, 'start_to_finish');
      expect(result.pathD).toMatch(/^M \d+ \d+ H \d+ V \d+ H \d+$/);
    });
  });

  describe('U-turn path (entryX > exitX)', () => {
    // predecessor: x=50, width=80
    //              exitX = 50 - 12 = 38
    // successor: x=200, width=100, right at 300
    //            entryX = 300 + 12 = 312
    // entryX(312) > exitX(38) → U-turn
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

    it('U-turn ends at the entry x (successor right + standoff)', () => {
      const result = computeArrowPath(pred, succ, 'start_to_finish');
      const entryX = succ.x + succ.width + ARROW_STANDOFF;
      expect(result.pathD).toContain(`H ${entryX}`);
    });
  });

  describe('boundary: entryX exactly equals exitX (standard path taken)', () => {
    // exitX = pred.x - ARROW_STANDOFF
    // entryX = succ.x + succ.width + ARROW_STANDOFF
    // For equality: pred.x - 12 = succ.x + succ.width + 12
    //   pred.x = succ.x + succ.width + 24
    // pred: x=174, width=80; succ: x=50, width=100 → pred.x = 50+100+24 = 174 ✓
    const pred = makeBar(174, 80, 0);
    const succ = makeBar(50, 100, 1);

    it('exactly equal takes standard (non-U-turn) path', () => {
      const result = computeArrowPath(pred, succ, 'start_to_finish');
      expect(result.pathD).toMatch(/^M \d+ \d+ H \d+ V \d+ H \d+$/);
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
    // With same row, V segment should be to the same Y
    expect(result.pathD).toContain(`V ${expectedCenterY(0)}`);
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
