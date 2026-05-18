/**
 * Unit tests for geometry.ts
 *
 * Story #1473: Photo Annotator Foundation
 *
 * Pure function tests — no mocking needed.
 */

import { describe, it, expect } from '@jest/globals';
import {
  screenToImage,
  imageToScreen,
  distance,
  clamp,
  normalizeRect,
  hitTestRectangle,
  hitTestHighlight,
  hitTestHandles,
  translateShape,
  resizeShape,
  hitTestLine,
  hitTestEllipse,
  hitTestEndpointHandles,
  hitTestCardinalHandles,
  translateArrowLine,
  translateEllipse,
  resizeArrowLine,
  resizeEllipse,
} from './geometry.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSvgRect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

// ─── screenToImage ────────────────────────────────────────────────────────────

describe('screenToImage()', () => {
  it('converts screen-left to image-left (x=0) for image filling SVG', () => {
    const svgRect = makeSvgRect(100, 50, 400, 300);
    const result = screenToImage(100, 50, svgRect, 800, 600);
    expect(result.x).toBeCloseTo(0);
    expect(result.y).toBeCloseTo(0);
  });

  it('converts screen-right to image-right for image filling SVG', () => {
    const svgRect = makeSvgRect(100, 50, 400, 300);
    const result = screenToImage(500, 350, svgRect, 800, 600);
    expect(result.x).toBeCloseTo(800);
    expect(result.y).toBeCloseTo(600);
  });

  it('converts screen-center to image-center', () => {
    const svgRect = makeSvgRect(0, 0, 400, 300);
    const result = screenToImage(200, 150, svgRect, 800, 600);
    expect(result.x).toBeCloseTo(400);
    expect(result.y).toBeCloseTo(300);
  });

  it('scales correctly with non-square aspect ratios', () => {
    // SVG is 200px wide, 100px tall; image is 1000px wide, 500px tall
    const svgRect = makeSvgRect(0, 0, 200, 100);
    const result = screenToImage(50, 25, svgRect, 1000, 500);
    // 50/200 * 1000 = 250; 25/100 * 500 = 125
    expect(result.x).toBeCloseTo(250);
    expect(result.y).toBeCloseTo(125);
  });
});

// ─── imageToScreen ────────────────────────────────────────────────────────────

describe('imageToScreen()', () => {
  it('converts image-origin to screen-origin (SVG top-left)', () => {
    const svgRect = makeSvgRect(100, 50, 400, 300);
    const result = imageToScreen(0, 0, svgRect, 800, 600);
    expect(result.x).toBeCloseTo(100);
    expect(result.y).toBeCloseTo(50);
  });

  it('is the exact inverse of screenToImage', () => {
    const svgRect = makeSvgRect(100, 50, 400, 300);
    const imageWidth = 1920;
    const imageHeight = 1080;

    const originalScreen = { x: 250, y: 175 };
    const imageCoords = screenToImage(
      originalScreen.x,
      originalScreen.y,
      svgRect,
      imageWidth,
      imageHeight,
    );
    const backToScreen = imageToScreen(
      imageCoords.x,
      imageCoords.y,
      svgRect,
      imageWidth,
      imageHeight,
    );

    expect(backToScreen.x).toBeCloseTo(originalScreen.x);
    expect(backToScreen.y).toBeCloseTo(originalScreen.y);
  });

  it('converts image-right to screen-right', () => {
    const svgRect = makeSvgRect(0, 0, 400, 300);
    const result = imageToScreen(800, 600, svgRect, 800, 600);
    expect(result.x).toBeCloseTo(400);
    expect(result.y).toBeCloseTo(300);
  });
});

// ─── distance ─────────────────────────────────────────────────────────────────

describe('distance()', () => {
  it('returns 0 for identical points', () => {
    expect(distance(5, 5, 5, 5)).toBe(0);
  });

  it('computes horizontal distance', () => {
    expect(distance(0, 0, 3, 0)).toBeCloseTo(3);
  });

  it('computes vertical distance', () => {
    expect(distance(0, 0, 0, 4)).toBeCloseTo(4);
  });

  it('computes 3-4-5 right triangle', () => {
    expect(distance(0, 0, 3, 4)).toBeCloseTo(5);
  });

  it('computes 5-12-13 right triangle', () => {
    expect(distance(0, 0, 5, 12)).toBeCloseTo(13);
  });

  it('is commutative', () => {
    const d1 = distance(1, 2, 7, 10);
    const d2 = distance(7, 10, 1, 2);
    expect(d1).toBeCloseTo(d2);
  });
});

// ─── clamp ────────────────────────────────────────────────────────────────────

describe('clamp()', () => {
  it('returns value when within range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it('clamps to min when below range', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  it('clamps to max when above range', () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it('returns min when value equals min', () => {
    expect(clamp(0, 0, 10)).toBe(0);
  });

  it('returns max when value equals max', () => {
    expect(clamp(10, 0, 10)).toBe(10);
  });
});

// ─── normalizeRect ────────────────────────────────────────────────────────────

describe('normalizeRect()', () => {
  it('handles top-left to bottom-right drag (normal direction)', () => {
    const r = normalizeRect(10, 20, 50, 60);
    expect(r).toEqual({ x: 10, y: 20, w: 40, h: 40 });
  });

  it('handles bottom-right to top-left drag (reversed)', () => {
    const r = normalizeRect(50, 60, 10, 20);
    expect(r).toEqual({ x: 10, y: 20, w: 40, h: 40 });
  });

  it('handles top-right to bottom-left drag', () => {
    const r = normalizeRect(50, 20, 10, 60);
    expect(r).toEqual({ x: 10, y: 20, w: 40, h: 40 });
  });

  it('handles bottom-left to top-right drag', () => {
    const r = normalizeRect(10, 60, 50, 20);
    expect(r).toEqual({ x: 10, y: 20, w: 40, h: 40 });
  });

  it('returns zero dimensions when points are identical', () => {
    const r = normalizeRect(10, 10, 10, 10);
    expect(r).toEqual({ x: 10, y: 10, w: 0, h: 0 });
  });
});

// ─── hitTestRectangle ─────────────────────────────────────────────────────────

describe('hitTestRectangle()', () => {
  const shape = { x: 10, y: 10, w: 80, h: 60 };
  const strokeWidth = 4;
  const tolerance = 2;

  it('returns "stroke" when point is near the top border', () => {
    // Top border is at y=10; with strokeWidth=4, tolerance=2, hit zone is y <= 10+2+2=14
    const result = hitTestRectangle(50, 11, shape, strokeWidth, tolerance);
    expect(result).toBe('stroke');
  });

  it('returns "stroke" when point is near the left border', () => {
    const result = hitTestRectangle(11, 40, shape, strokeWidth, tolerance);
    expect(result).toBe('stroke');
  });

  it('returns "stroke" when point is near the right border', () => {
    const result = hitTestRectangle(89, 40, shape, strokeWidth, tolerance);
    expect(result).toBe('stroke');
  });

  it('returns "stroke" when point is near the bottom border', () => {
    const result = hitTestRectangle(50, 69, shape, strokeWidth, tolerance);
    expect(result).toBe('stroke');
  });

  it('returns "body" when point is deep inside (far from all edges)', () => {
    // Center of shape is at (50, 40); far from any edge
    const result = hitTestRectangle(50, 40, shape, strokeWidth, tolerance);
    expect(result).toBe('body');
  });

  it('returns null when point is outside the shape', () => {
    // Outside on the left
    expect(hitTestRectangle(5, 40, shape, strokeWidth, tolerance)).toBeNull();
    // Outside on the right
    expect(hitTestRectangle(95, 40, shape, strokeWidth, tolerance)).toBeNull();
    // Outside on top
    expect(hitTestRectangle(50, 5, shape, strokeWidth, tolerance)).toBeNull();
    // Outside on bottom
    expect(hitTestRectangle(50, 75, shape, strokeWidth, tolerance)).toBeNull();
  });
});

// ─── hitTestHighlight ─────────────────────────────────────────────────────────

describe('hitTestHighlight()', () => {
  const shape = { x: 20, y: 30, w: 100, h: 50 };

  it('returns true for a point inside the highlight', () => {
    expect(hitTestHighlight(70, 55, shape)).toBe(true);
  });

  it('returns true at the exact top-left corner', () => {
    expect(hitTestHighlight(20, 30, shape)).toBe(true);
  });

  it('returns true at the exact bottom-right corner', () => {
    expect(hitTestHighlight(120, 80, shape)).toBe(true);
  });

  it('returns false for a point above the highlight', () => {
    expect(hitTestHighlight(70, 25, shape)).toBe(false);
  });

  it('returns false for a point below the highlight', () => {
    expect(hitTestHighlight(70, 85, shape)).toBe(false);
  });

  it('returns false for a point left of the highlight', () => {
    expect(hitTestHighlight(10, 55, shape)).toBe(false);
  });

  it('returns false for a point right of the highlight', () => {
    expect(hitTestHighlight(130, 55, shape)).toBe(false);
  });
});

// ─── hitTestHandles ───────────────────────────────────────────────────────────

describe('hitTestHandles()', () => {
  const shape = { x: 10, y: 10, w: 80, h: 60 };
  const handleSize = 8;

  it('returns "nw" when clicking top-left corner handle', () => {
    // nw handle is at (10, 10); within handleSize/2=4
    expect(hitTestHandles(10, 10, shape, handleSize)).toBe('nw');
  });

  it('returns "n" when clicking top-center handle', () => {
    // n handle is at (50, 10)
    expect(hitTestHandles(50, 10, shape, handleSize)).toBe('n');
  });

  it('returns "ne" when clicking top-right handle', () => {
    // ne handle is at (90, 10)
    expect(hitTestHandles(90, 10, shape, handleSize)).toBe('ne');
  });

  it('returns "w" when clicking left-center handle', () => {
    // w handle is at (10, 40)
    expect(hitTestHandles(10, 40, shape, handleSize)).toBe('w');
  });

  it('returns "e" when clicking right-center handle', () => {
    // e handle is at (90, 40)
    expect(hitTestHandles(90, 40, shape, handleSize)).toBe('e');
  });

  it('returns "sw" when clicking bottom-left handle', () => {
    // sw handle is at (10, 70)
    expect(hitTestHandles(10, 70, shape, handleSize)).toBe('sw');
  });

  it('returns "s" when clicking bottom-center handle', () => {
    // s handle is at (50, 70)
    expect(hitTestHandles(50, 70, shape, handleSize)).toBe('s');
  });

  it('returns "se" when clicking bottom-right handle', () => {
    // se handle is at (90, 70)
    expect(hitTestHandles(90, 70, shape, handleSize)).toBe('se');
  });

  it('returns null when not on any handle', () => {
    // Far from all handles
    expect(hitTestHandles(50, 40, shape, handleSize)).toBeNull();
  });
});

// ─── translateShape ───────────────────────────────────────────────────────────

describe('translateShape()', () => {
  const imageWidth = 500;
  const imageHeight = 400;

  it('translates shape by positive delta', () => {
    const shape = { x: 10, y: 10, w: 50, h: 40 };
    const result = translateShape(shape, 20, 15, imageWidth, imageHeight);
    expect(result).toEqual({ x: 30, y: 25, w: 50, h: 40 });
  });

  it('translates shape by negative delta', () => {
    const shape = { x: 50, y: 50, w: 50, h: 40 };
    const result = translateShape(shape, -20, -15, imageWidth, imageHeight);
    expect(result).toEqual({ x: 30, y: 35, w: 50, h: 40 });
  });

  it('clamps to left edge (x >= 0)', () => {
    const shape = { x: 5, y: 10, w: 50, h: 40 };
    const result = translateShape(shape, -20, 0, imageWidth, imageHeight);
    expect(result.x).toBe(0); // clamped to 0
  });

  it('clamps to top edge (y >= 0)', () => {
    const shape = { x: 10, y: 5, w: 50, h: 40 };
    const result = translateShape(shape, 0, -20, imageWidth, imageHeight);
    expect(result.y).toBe(0); // clamped to 0
  });

  it('clamps to right edge (x + w <= imageWidth)', () => {
    const shape = { x: 460, y: 10, w: 50, h: 40 };
    const result = translateShape(shape, 20, 0, imageWidth, imageHeight);
    expect(result.x).toBe(imageWidth - shape.w); // 500 - 50 = 450
  });

  it('clamps to bottom edge (y + h <= imageHeight)', () => {
    const shape = { x: 10, y: 370, w: 50, h: 40 };
    const result = translateShape(shape, 0, 20, imageWidth, imageHeight);
    expect(result.y).toBe(imageHeight - shape.h); // 400 - 40 = 360
  });

  it('preserves shape dimensions during translation', () => {
    const shape = { x: 10, y: 10, w: 60, h: 45 };
    const result = translateShape(shape, 5, 5, imageWidth, imageHeight);
    expect(result.w).toBe(60);
    expect(result.h).toBe(45);
  });
});

// ─── resizeShape ──────────────────────────────────────────────────────────────

describe('resizeShape()', () => {
  const imageWidth = 500;
  const imageHeight = 400;
  const shape = { x: 50, y: 50, w: 100, h: 80 };

  it('resizes from "se" handle by increasing width and height', () => {
    const result = resizeShape(shape, 'se', 20, 10, imageWidth, imageHeight);
    expect(result.w).toBe(120);
    expect(result.h).toBe(90);
    expect(result.x).toBe(50); // origin unchanged for se
    expect(result.y).toBe(50);
  });

  it('resizes from "nw" handle by moving origin and adjusting size', () => {
    // nw: x += dx, y += dy (moving top-left)
    const result = resizeShape(shape, 'nw', 10, 10, imageWidth, imageHeight);
    expect(result.x).toBe(60);
    expect(result.y).toBe(60);
    expect(result.w).toBe(100); // width unchanged for nw (only x moves)
    expect(result.h).toBe(80); // height unchanged for nw (only y moves)
  });

  it('resizes from "e" handle by increasing width', () => {
    const result = resizeShape(shape, 'e', 30, 0, imageWidth, imageHeight);
    expect(result.w).toBe(130);
    expect(result.x).toBe(50);
    expect(result.y).toBe(50);
    expect(result.h).toBe(80);
  });

  it('resizes from "s" handle by increasing height', () => {
    const result = resizeShape(shape, 's', 0, 20, imageWidth, imageHeight);
    expect(result.h).toBe(100);
    expect(result.x).toBe(50);
    expect(result.y).toBe(50);
    expect(result.w).toBe(100);
  });

  it('enforces minimum width of 2 pixels', () => {
    // Dragging 'e' handle left past origin would make width negative
    const result = resizeShape(shape, 'e', -200, 0, imageWidth, imageHeight);
    expect(result.w).toBeGreaterThanOrEqual(2);
  });

  it('enforces minimum height of 2 pixels', () => {
    const result = resizeShape(shape, 's', 0, -200, imageWidth, imageHeight);
    expect(result.h).toBeGreaterThanOrEqual(2);
  });

  it('clamps to image bounds (x >= 0)', () => {
    const result = resizeShape(shape, 'nw', -100, 0, imageWidth, imageHeight);
    expect(result.x).toBeGreaterThanOrEqual(0);
  });

  it('clamps to image bounds (y >= 0)', () => {
    const result = resizeShape(shape, 'nw', 0, -100, imageWidth, imageHeight);
    expect(result.y).toBeGreaterThanOrEqual(0);
  });
});

// ─── hitTestLine ──────────────────────────────────────────────────────────────

describe('hitTestLine()', () => {
  const tolerance = 5;
  // Line segment from (10, 10) to (100, 10) — horizontal
  const x1 = 10;
  const y1 = 10;
  const x2 = 100;
  const y2 = 10;

  it('returns "body" for a point on the segment (within tolerance)', () => {
    // Midpoint of segment, exactly on it
    const result = hitTestLine(55, 10, x1, y1, x2, y2, tolerance);
    expect(result).toBe('body');
  });

  it('returns "body" for a point within tolerance of the segment', () => {
    // Just above the horizontal line, distance = 4 < tolerance=5
    const result = hitTestLine(55, 6, x1, y1, x2, y2, tolerance);
    expect(result).toBe('body');
  });

  it('returns null for a point far from the segment', () => {
    // 50px above the line
    const result = hitTestLine(55, 60, x1, y1, x2, y2, tolerance);
    expect(result).toBeNull();
  });

  it('returns null for a point beyond the endpoint (clamped projection)', () => {
    // To the right of x2=100 by 20px, but above by 20px
    // The closest point on segment would be (100, 10), distance = sqrt(0+400)=20 > tolerance=5
    const result = hitTestLine(120, 30, x1, y1, x2, y2, tolerance);
    expect(result).toBeNull();
  });

  it('handles a zero-length segment (start===end) — hit at the point', () => {
    // Zero-length: both ends at (50, 50)
    const result = hitTestLine(52, 50, 50, 50, 50, 50, tolerance);
    expect(result).toBe('body'); // distance(52,50, 50,50)=2 <= 5
  });

  it('handles a zero-length segment (start===end) — miss far from the point', () => {
    const result = hitTestLine(100, 100, 50, 50, 50, 50, tolerance);
    expect(result).toBeNull();
  });
});

// ─── hitTestEllipse ───────────────────────────────────────────────────────────

describe('hitTestEllipse()', () => {
  // Ellipse centered at (100, 100), rx=50, ry=30
  const cx = 100;
  const cy = 100;
  const rx = 50;
  const ry = 30;
  const strokeWidth = 4;
  const tolerance = 2;

  it('returns "body" for a point on the ellipse perimeter (rightmost point)', () => {
    // (150, 100) is exactly on the ellipse at east
    const result = hitTestEllipse(150, 100, cx, cy, rx, ry, strokeWidth, tolerance);
    expect(result).toBe('body');
  });

  it('returns "body" for a point near the stroke (within strokeWidth/2 + tolerance)', () => {
    // (148, 100) is 2px inside the rightmost point — within (strokeWidth/2=2) + tolerance=2 = 4
    const result = hitTestEllipse(148, 100, cx, cy, rx, ry, strokeWidth, tolerance);
    expect(result).toBe('body');
  });

  it('returns null for a point deep inside (far from perimeter)', () => {
    // Dead center (100, 100) — r = sqrt(0+0) = 0, distToPerimeter = min(50,30) = 30 >> tolerance
    const result = hitTestEllipse(100, 100, cx, cy, rx, ry, strokeWidth, tolerance);
    expect(result).toBeNull();
  });

  it('returns null for a point clearly outside the ellipse', () => {
    // (200, 100) is 50px beyond the rightmost edge
    const result = hitTestEllipse(200, 100, cx, cy, rx, ry, strokeWidth, tolerance);
    expect(result).toBeNull();
  });

  it('returns null when rx===0 (degenerate ellipse)', () => {
    const result = hitTestEllipse(100, 100, 100, 100, 0, 30, strokeWidth, tolerance);
    expect(result).toBeNull();
  });

  it('returns null when ry===0 (degenerate ellipse)', () => {
    const result = hitTestEllipse(100, 100, 100, 100, 50, 0, strokeWidth, tolerance);
    expect(result).toBeNull();
  });
});

// ─── hitTestEndpointHandles ───────────────────────────────────────────────────

describe('hitTestEndpointHandles()', () => {
  // Line from (10, 20) to (100, 80); handleSize=8 → hit radius=4
  const x1 = 10;
  const y1 = 20;
  const x2 = 100;
  const y2 = 80;
  const handleSize = 8;

  it('returns "start" when clicking the start endpoint', () => {
    // Exactly on (10, 20) — distance=0 <= 4
    const result = hitTestEndpointHandles(10, 20, x1, y1, x2, y2, handleSize);
    expect(result).toBe('start');
  });

  it('returns "end" when clicking the end endpoint', () => {
    // Exactly on (100, 80) — distance=0 <= 4
    const result = hitTestEndpointHandles(100, 80, x1, y1, x2, y2, handleSize);
    expect(result).toBe('end');
  });

  it('returns "start" when within hit radius of start', () => {
    // 3px from start — distance=3 <= 4
    const result = hitTestEndpointHandles(13, 20, x1, y1, x2, y2, handleSize);
    expect(result).toBe('start');
  });

  it('returns "end" when within hit radius of end', () => {
    // 3px from end
    const result = hitTestEndpointHandles(97, 80, x1, y1, x2, y2, handleSize);
    expect(result).toBe('end');
  });

  it('returns null when not near either endpoint', () => {
    // Midpoint of the line — far from both endpoints
    const result = hitTestEndpointHandles(55, 50, x1, y1, x2, y2, handleSize);
    expect(result).toBeNull();
  });
});

// ─── hitTestCardinalHandles ───────────────────────────────────────────────────

describe('hitTestCardinalHandles()', () => {
  // Ellipse centered at (100, 100), rx=50, ry=30; handleSize=8 → hit radius=4
  const cx = 100;
  const cy = 100;
  const rx = 50;
  const ry = 30;
  const handleSize = 8;

  it('returns "north" when clicking the top handle (cx, cy-ry)', () => {
    // North handle at (100, 70)
    const result = hitTestCardinalHandles(100, 70, cx, cy, rx, ry, handleSize);
    expect(result).toBe('north');
  });

  it('returns "south" when clicking the bottom handle (cx, cy+ry)', () => {
    // South handle at (100, 130)
    const result = hitTestCardinalHandles(100, 130, cx, cy, rx, ry, handleSize);
    expect(result).toBe('south');
  });

  it('returns "east" when clicking the right handle (cx+rx, cy)', () => {
    // East handle at (150, 100)
    const result = hitTestCardinalHandles(150, 100, cx, cy, rx, ry, handleSize);
    expect(result).toBe('east');
  });

  it('returns "west" when clicking the left handle (cx-rx, cy)', () => {
    // West handle at (50, 100)
    const result = hitTestCardinalHandles(50, 100, cx, cy, rx, ry, handleSize);
    expect(result).toBe('west');
  });

  it('returns null when not near any cardinal handle', () => {
    // Center of ellipse — far from all handles
    const result = hitTestCardinalHandles(100, 100, cx, cy, rx, ry, handleSize);
    expect(result).toBeNull();
  });
});

// ─── translateArrowLine ───────────────────────────────────────────────────────

describe('translateArrowLine()', () => {
  const imageWidth = 500;
  const imageHeight = 400;

  it('translates both endpoints by dx/dy', () => {
    const result = translateArrowLine(10, 20, 100, 80, 15, 25, imageWidth, imageHeight);
    expect(result.x1).toBe(25);
    expect(result.y1).toBe(45);
    expect(result.x2).toBe(115);
    expect(result.y2).toBe(105);
  });

  it('translates by negative delta', () => {
    const result = translateArrowLine(50, 60, 100, 90, -20, -10, imageWidth, imageHeight);
    expect(result.x1).toBe(30);
    expect(result.y1).toBe(50);
    expect(result.x2).toBe(80);
    expect(result.y2).toBe(80);
  });

  it('clamps x1 to image left boundary (0)', () => {
    const result = translateArrowLine(5, 20, 100, 80, -20, 0, imageWidth, imageHeight);
    expect(result.x1).toBe(0); // clamped from -15 to 0
    expect(result.x2).toBe(80); // 100-20 = 80 (unclamped)
  });

  it('clamps y1 to image top boundary (0)', () => {
    const result = translateArrowLine(10, 5, 100, 80, 0, -20, imageWidth, imageHeight);
    expect(result.y1).toBe(0); // clamped from -15 to 0
    expect(result.y2).toBe(60); // 80-20 = 60
  });

  it('clamps x2 to image right boundary (imageWidth)', () => {
    const result = translateArrowLine(10, 20, 490, 80, 20, 0, imageWidth, imageHeight);
    expect(result.x2).toBe(imageWidth); // clamped from 510 to 500
    expect(result.x1).toBe(30); // 10+20 = 30 (unclamped)
  });

  it('clamps y2 to image bottom boundary (imageHeight)', () => {
    const result = translateArrowLine(10, 20, 100, 390, 0, 20, imageWidth, imageHeight);
    expect(result.y2).toBe(imageHeight); // clamped from 410 to 400
    expect(result.y1).toBe(40); // 20+20 = 40
  });
});

// ─── translateEllipse ─────────────────────────────────────────────────────────

describe('translateEllipse()', () => {
  const imageWidth = 500;
  const imageHeight = 400;

  it('translates ellipse center by dx/dy', () => {
    const result = translateEllipse(100, 100, 30, 20, 15, 25, imageWidth, imageHeight);
    expect(result.cx).toBe(115);
    expect(result.cy).toBe(125);
    expect(result.rx).toBe(30);
    expect(result.ry).toBe(20);
  });

  it('preserves rx/ry during translation', () => {
    const result = translateEllipse(200, 150, 40, 25, 10, 5, imageWidth, imageHeight);
    expect(result.rx).toBe(40);
    expect(result.ry).toBe(25);
  });

  it('clamps center so ellipse stays within left boundary', () => {
    // cx=10, rx=30 → clamped cx >= rx=30
    const result = translateEllipse(10, 100, 30, 20, -20, 0, imageWidth, imageHeight);
    expect(result.cx).toBeGreaterThanOrEqual(30);
  });

  it('clamps center so ellipse stays within right boundary', () => {
    // cx=490, rx=30 → clamped cx <= imageWidth-rx=470
    const result = translateEllipse(490, 100, 30, 20, 20, 0, imageWidth, imageHeight);
    expect(result.cx).toBeLessThanOrEqual(imageWidth - 30);
  });

  it('clamps center so ellipse stays within top boundary', () => {
    // cy=5, ry=20 → clamped cy >= ry=20
    const result = translateEllipse(100, 5, 30, 20, 0, -20, imageWidth, imageHeight);
    expect(result.cy).toBeGreaterThanOrEqual(20);
  });

  it('clamps center so ellipse stays within bottom boundary', () => {
    // cy=395, ry=20 → clamped cy <= imageHeight-ry=380
    const result = translateEllipse(100, 395, 30, 20, 0, 20, imageWidth, imageHeight);
    expect(result.cy).toBeLessThanOrEqual(imageHeight - 20);
  });
});

// ─── resizeArrowLine ──────────────────────────────────────────────────────────

describe('resizeArrowLine()', () => {
  const imageWidth = 500;
  const imageHeight = 400;
  const x1 = 50;
  const y1 = 60;
  const x2 = 200;
  const y2 = 150;

  it('moves x1/y1 when handle is "start"', () => {
    const result = resizeArrowLine(x1, y1, x2, y2, 'start', 10, 15, imageWidth, imageHeight);
    expect(result.x1).toBe(60);
    expect(result.y1).toBe(75);
    // x2/y2 unchanged
    expect(result.x2).toBe(x2);
    expect(result.y2).toBe(y2);
  });

  it('moves x2/y2 when handle is "end"', () => {
    const result = resizeArrowLine(x1, y1, x2, y2, 'end', 10, 15, imageWidth, imageHeight);
    expect(result.x2).toBe(210);
    expect(result.y2).toBe(165);
    // x1/y1 unchanged
    expect(result.x1).toBe(x1);
    expect(result.y1).toBe(y1);
  });

  it('clamps x1 to image bounds when handle is "start"', () => {
    // x1=5, dx=-20 → x1 would be -15, clamped to 0
    const result = resizeArrowLine(5, y1, x2, y2, 'start', -20, 0, imageWidth, imageHeight);
    expect(result.x1).toBe(0);
  });

  it('clamps x2 to image bounds when handle is "end"', () => {
    // x2=490, dx=20 → x2 would be 510, clamped to imageWidth=500
    const result = resizeArrowLine(x1, y1, 490, y2, 'end', 20, 0, imageWidth, imageHeight);
    expect(result.x2).toBe(imageWidth);
  });

  it('clamps y1 to image bounds when handle is "start"', () => {
    const result = resizeArrowLine(x1, 5, x2, y2, 'start', 0, -20, imageWidth, imageHeight);
    expect(result.y1).toBe(0);
  });

  it('clamps y2 to image bounds when handle is "end"', () => {
    const result = resizeArrowLine(x1, y1, x2, 390, 'end', 0, 20, imageWidth, imageHeight);
    expect(result.y2).toBe(imageHeight);
  });
});

// ─── resizeEllipse ────────────────────────────────────────────────────────────

describe('resizeEllipse()', () => {
  const imageWidth = 500;
  const imageHeight = 400;
  const cx = 100;
  const cy = 100;
  const rx = 50;
  const ry = 30;

  it('east handle increases rx by dx', () => {
    const result = resizeEllipse(cx, cy, rx, ry, 'east', 20, 0, imageWidth, imageHeight);
    expect(result.rx).toBe(70);
    expect(result.ry).toBe(ry); // unchanged
  });

  it('west handle increases rx by -dx (dragging left grows it)', () => {
    const result = resizeEllipse(cx, cy, rx, ry, 'west', -20, 0, imageWidth, imageHeight);
    expect(result.rx).toBe(70); // rx - (-20) = rx + 20
    expect(result.ry).toBe(ry);
  });

  it('south handle increases ry by dy', () => {
    const result = resizeEllipse(cx, cy, rx, ry, 'south', 0, 10, imageWidth, imageHeight);
    expect(result.ry).toBe(40);
    expect(result.rx).toBe(rx); // unchanged
  });

  it('north handle increases ry by -dy (dragging up grows it)', () => {
    const result = resizeEllipse(cx, cy, rx, ry, 'north', 0, -10, imageWidth, imageHeight);
    expect(result.ry).toBe(40); // ry - (-10) = ry + 10
    expect(result.rx).toBe(rx);
  });

  it('enforces minimum rx of 1 (east handle drag left past zero)', () => {
    const result = resizeEllipse(cx, cy, rx, ry, 'east', -200, 0, imageWidth, imageHeight);
    expect(result.rx).toBeGreaterThanOrEqual(1);
  });

  it('enforces minimum ry of 1 (south handle drag up past zero)', () => {
    const result = resizeEllipse(cx, cy, rx, ry, 'south', 0, -200, imageWidth, imageHeight);
    expect(result.ry).toBeGreaterThanOrEqual(1);
  });

  it('clamps center when new rx grows moderately (east, within bounds)', () => {
    // cx=100, new rx=80 → cx must be in [80, 500-80=420]
    const result = resizeEllipse(cx, cy, rx, ry, 'east', 30, 0, imageWidth, imageHeight);
    expect(result.rx).toBe(80);
    expect(result.cx).toBeGreaterThanOrEqual(result.rx);
    expect(result.cx).toBeLessThanOrEqual(imageWidth - result.rx);
  });

  it('clamps center when new ry grows moderately (south, within bounds)', () => {
    // cy=100, new ry=50 → cy must be in [50, 400-50=350]
    const result = resizeEllipse(cx, cy, rx, ry, 'south', 0, 20, imageWidth, imageHeight);
    expect(result.ry).toBe(50);
    expect(result.cy).toBeGreaterThanOrEqual(result.ry);
    expect(result.cy).toBeLessThanOrEqual(imageHeight - result.ry);
  });
});
