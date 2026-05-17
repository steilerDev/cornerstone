/**
 * Unit tests for render.ts
 *
 * Story #1473: Photo Annotator Foundation
 *
 * Tests:
 *   - renderShapeSvgProps: SVG attribute assertions for committed/draft shapes
 *   - drawShapeOnCanvas: canvas 2D context draw call assertions
 *
 * Pure functions — no mocking needed. Canvas context is mocked with a minimal object.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { renderShapeSvgProps, drawShapeOnCanvas } from './render.js';
import type { RectangleShape, HighlightShape } from './useUndoStack.js';

// ─── Test fixtures ────────────────────────────────────────────────────────────

function makeRectangle(overrides: Partial<RectangleShape> = {}): RectangleShape {
  return {
    type: 'rectangle',
    id: 'rect-1',
    x: 10,
    y: 20,
    w: 80,
    h: 60,
    color: '#dc2626',
    strokeWidth: 4,
    ...overrides,
  };
}

function makeHighlight(overrides: Partial<HighlightShape> = {}): HighlightShape {
  return {
    type: 'highlight',
    id: 'highlight-1',
    x: 5,
    y: 15,
    w: 100,
    h: 50,
    color: '#facc15',
    ...overrides,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMock = jest.MockedFunction<(...args: any[]) => any>;

interface MockCtx {
  strokeStyle: string;
  lineWidth: number;
  fillStyle: string;
  globalAlpha: number;
  strokeRect: AnyMock;
  fillRect: AnyMock;
}

function makeCanvasContext(): MockCtx {
  return {
    strokeStyle: '',
    lineWidth: 0,
    fillStyle: '',
    globalAlpha: 1,
    strokeRect: jest.fn() as AnyMock,
    fillRect: jest.fn() as AnyMock,
  };
}

// ─── renderShapeSvgProps — Rectangle ─────────────────────────────────────────

describe('renderShapeSvgProps() — Rectangle', () => {
  it('returns tagName: "rect" for committed rectangle', () => {
    const result = renderShapeSvgProps(makeRectangle(), false);
    expect(result.tagName).toBe('rect');
  });

  it('includes correct x, y, width, height attributes', () => {
    const shape = makeRectangle({ x: 10, y: 20, w: 80, h: 60 });
    const result = renderShapeSvgProps(shape, false);
    expect(result.attributes.x).toBe(10);
    expect(result.attributes.y).toBe(20);
    expect(result.attributes.width).toBe(80);
    expect(result.attributes.height).toBe(60);
  });

  it('includes the shape color as stroke', () => {
    const shape = makeRectangle({ color: '#dc2626' });
    const result = renderShapeSvgProps(shape, false);
    expect(result.attributes.stroke).toBe('#dc2626');
  });

  it('includes stroke-width attribute', () => {
    const shape = makeRectangle({ strokeWidth: 4 });
    const result = renderShapeSvgProps(shape, false);
    expect(result.attributes['stroke-width']).toBe(4);
  });

  it('has fill: "none" for rectangle (outline only)', () => {
    const result = renderShapeSvgProps(makeRectangle(), false);
    expect(result.attributes.fill).toBe('none');
  });

  it('committed rectangle has stroke-dasharray: "none"', () => {
    const result = renderShapeSvgProps(makeRectangle(), false);
    expect(result.attributes['stroke-dasharray']).toBe('none');
  });

  it('draft rectangle has stroke-dasharray: "6 4"', () => {
    const result = renderShapeSvgProps(makeRectangle(), true);
    expect(result.attributes['stroke-dasharray']).toBe('6 4');
  });

  it('committed rectangle has opacity: 1', () => {
    const result = renderShapeSvgProps(makeRectangle(), false);
    expect(result.attributes.opacity).toBe(1);
  });

  it('draft rectangle has opacity: 0.8', () => {
    const result = renderShapeSvgProps(makeRectangle(), true);
    expect(result.attributes.opacity).toBe(0.8);
  });

  it('committed rectangle has pointer-events: "stroke"', () => {
    const result = renderShapeSvgProps(makeRectangle(), false);
    expect(result.attributes['pointer-events']).toBe('stroke');
  });

  it('draft rectangle has pointer-events: "none"', () => {
    const result = renderShapeSvgProps(makeRectangle(), true);
    expect(result.attributes['pointer-events']).toBe('none');
  });
});

// ─── renderShapeSvgProps — Highlight ─────────────────────────────────────────

describe('renderShapeSvgProps() — Highlight', () => {
  it('returns tagName: "rect" for highlight', () => {
    const result = renderShapeSvgProps(makeHighlight(), false);
    expect(result.tagName).toBe('rect');
  });

  it('uses fill color from shape.color', () => {
    const shape = makeHighlight({ color: '#facc15' });
    const result = renderShapeSvgProps(shape, false);
    expect(result.attributes.fill).toBe('#facc15');
  });

  it('committed highlight has fill-opacity: 0.4', () => {
    const result = renderShapeSvgProps(makeHighlight(), false);
    expect(result.attributes['fill-opacity']).toBe(0.4);
  });

  it('draft highlight has fill-opacity: 0.3', () => {
    const result = renderShapeSvgProps(makeHighlight(), true);
    expect(result.attributes['fill-opacity']).toBe(0.3);
  });

  it('has stroke: "none" for highlight (filled, no outline)', () => {
    const result = renderShapeSvgProps(makeHighlight(), false);
    expect(result.attributes.stroke).toBe('none');
  });

  it('committed highlight has opacity: 1', () => {
    const result = renderShapeSvgProps(makeHighlight(), false);
    expect(result.attributes.opacity).toBe(1);
  });

  it('draft highlight has opacity: 0.8', () => {
    const result = renderShapeSvgProps(makeHighlight(), true);
    expect(result.attributes.opacity).toBe(0.8);
  });

  it('committed highlight has pointer-events: "fill"', () => {
    const result = renderShapeSvgProps(makeHighlight(), false);
    expect(result.attributes['pointer-events']).toBe('fill');
  });

  it('draft highlight has pointer-events: "none"', () => {
    const result = renderShapeSvgProps(makeHighlight(), true);
    expect(result.attributes['pointer-events']).toBe('none');
  });

  it('includes correct x, y, width, height for highlight', () => {
    const shape = makeHighlight({ x: 5, y: 15, w: 100, h: 50 });
    const result = renderShapeSvgProps(shape, false);
    expect(result.attributes.x).toBe(5);
    expect(result.attributes.y).toBe(15);
    expect(result.attributes.width).toBe(100);
    expect(result.attributes.height).toBe(50);
  });
});

// ─── drawShapeOnCanvas — Rectangle ───────────────────────────────────────────

describe('drawShapeOnCanvas() — Rectangle', () => {
  let ctx: MockCtx;

  beforeEach(() => {
    ctx = makeCanvasContext();
  });

  it('calls strokeRect with correct arguments', () => {
    const shape = makeRectangle({ x: 10, y: 20, w: 80, h: 60 });

    drawShapeOnCanvas(ctx as unknown as CanvasRenderingContext2D, shape);

    expect(ctx.strokeRect).toHaveBeenCalledWith(10, 20, 80, 60);
  });

  it('sets strokeStyle to shape.color before drawing', () => {
    const shape = makeRectangle({ color: '#3b82f6' });

    drawShapeOnCanvas(ctx as unknown as CanvasRenderingContext2D, shape);

    expect(ctx.strokeStyle).toBe('#3b82f6');
  });

  it('sets lineWidth to shape.strokeWidth before drawing', () => {
    const shape = makeRectangle({ strokeWidth: 8 });

    drawShapeOnCanvas(ctx as unknown as CanvasRenderingContext2D, shape);

    expect(ctx.lineWidth).toBe(8);
  });

  it('does NOT call fillRect for rectangle', () => {
    drawShapeOnCanvas(ctx as unknown as CanvasRenderingContext2D, makeRectangle());

    expect(ctx.fillRect).not.toHaveBeenCalled();
  });
});

// ─── drawShapeOnCanvas — Highlight ───────────────────────────────────────────

describe('drawShapeOnCanvas() — Highlight', () => {
  let ctx: MockCtx;

  beforeEach(() => {
    ctx = makeCanvasContext();
  });

  it('calls fillRect with correct arguments', () => {
    const shape = makeHighlight({ x: 5, y: 15, w: 100, h: 50 });

    drawShapeOnCanvas(ctx as unknown as CanvasRenderingContext2D, shape);

    expect(ctx.fillRect).toHaveBeenCalledWith(5, 15, 100, 50);
  });

  it('sets fillStyle to shape.color before drawing', () => {
    const shape = makeHighlight({ color: '#22c55e' });

    drawShapeOnCanvas(ctx as unknown as CanvasRenderingContext2D, shape);

    expect(ctx.fillStyle).toBe('#22c55e');
  });

  it('sets globalAlpha to 0.4 before calling fillRect', () => {
    let alphaAtDrawTime: number | null = null;
    ctx.fillRect = jest.fn().mockImplementation(() => {
      alphaAtDrawTime = ctx.globalAlpha;
    }) as AnyMock;

    drawShapeOnCanvas(ctx as unknown as CanvasRenderingContext2D, makeHighlight());

    expect(alphaAtDrawTime).toBe(0.4);
  });

  it('resets globalAlpha to 1 after drawing', () => {
    drawShapeOnCanvas(ctx as unknown as CanvasRenderingContext2D, makeHighlight());

    expect(ctx.globalAlpha).toBe(1);
  });

  it('does NOT call strokeRect for highlight', () => {
    drawShapeOnCanvas(ctx as unknown as CanvasRenderingContext2D, makeHighlight());

    expect(ctx.strokeRect).not.toHaveBeenCalled();
  });
});

describe('renderShapeSvgProps() — fallback for unknown type', () => {
  it('returns basic rect attributes for an unknown shape type', () => {
    // AnnotationShape union only has rectangle|highlight, so we cast an unknown type
    const unknownShape = {
      type: 'arrow' as unknown,
      id: 'unknown-1',
      x: 5,
      y: 10,
      w: 50,
      h: 30,
      color: '#000000',
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = renderShapeSvgProps(unknownShape as any, false);

    expect(result.tagName).toBe('rect');
    expect(result.attributes).toMatchObject({ x: 5, y: 10, width: 50, height: 30 });
  });
});
