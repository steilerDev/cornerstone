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
    const backToScreen = imageToScreen(imageCoords.x, imageCoords.y, svgRect, imageWidth, imageHeight);

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
