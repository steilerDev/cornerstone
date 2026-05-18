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
import type { RectangleShape, HighlightShape, ArrowShape, LineShape, EllipseShape } from './useUndoStack.js';

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

function makeArrow(overrides: Partial<ArrowShape> = {}): ArrowShape {
  return {
    type: 'arrow',
    id: 'arrow-1',
    x1: 10,
    y1: 20,
    x2: 100,
    y2: 80,
    stroke: '#dc2626',
    strokeWidth: 4,
    ...overrides,
  };
}

function makeLine(overrides: Partial<LineShape> = {}): LineShape {
  return {
    type: 'line',
    id: 'line-1',
    x1: 10,
    y1: 20,
    x2: 100,
    y2: 80,
    stroke: '#3b82f6',
    strokeWidth: 4,
    ...overrides,
  };
}

function makeEllipse(overrides: Partial<EllipseShape> = {}): EllipseShape {
  return {
    type: 'ellipse',
    id: 'ellipse-1',
    cx: 100,
    cy: 80,
    rx: 50,
    ry: 30,
    stroke: '#16a34a',
    strokeWidth: 4,
    ...overrides,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMock = jest.MockedFunction<(...args: any[]) => any>;

interface MockCtx {
  strokeStyle: string;
  lineWidth: number;
  lineCap: CanvasLineCap;
  fillStyle: string;
  globalAlpha: number;
  strokeRect: AnyMock;
  fillRect: AnyMock;
  beginPath: AnyMock;
  moveTo: AnyMock;
  lineTo: AnyMock;
  stroke: AnyMock;
  fill: AnyMock;
  closePath: AnyMock;
  ellipse: AnyMock;
}

function makeCanvasContext(): MockCtx {
  return {
    strokeStyle: '',
    lineWidth: 0,
    lineCap: 'butt',
    fillStyle: '',
    globalAlpha: 1,
    strokeRect: jest.fn() as AnyMock,
    fillRect: jest.fn() as AnyMock,
    beginPath: jest.fn() as AnyMock,
    moveTo: jest.fn() as AnyMock,
    lineTo: jest.fn() as AnyMock,
    stroke: jest.fn() as AnyMock,
    fill: jest.fn() as AnyMock,
    closePath: jest.fn() as AnyMock,
    ellipse: jest.fn() as AnyMock,
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

// ─── renderShapeSvgProps — Arrow ─────────────────────────────────────────────

describe('renderShapeSvgProps() — Arrow', () => {
  it('returns tagName: "line" for arrow', () => {
    const result = renderShapeSvgProps(makeArrow(), false);
    expect(result.tagName).toBe('line');
  });

  it('includes correct x1/y1/x2/y2 attributes', () => {
    const shape = makeArrow({ x1: 10, y1: 20, x2: 100, y2: 80 });
    const result = renderShapeSvgProps(shape, false);
    expect(result.attributes.x1).toBe(10);
    expect(result.attributes.y1).toBe(20);
    expect(result.attributes.x2).toBe(100);
    expect(result.attributes.y2).toBe(80);
  });

  it('committed arrow has marker-end: "url(#arrowhead)"', () => {
    const result = renderShapeSvgProps(makeArrow(), false);
    expect(result.attributes['marker-end']).toBe('url(#arrowhead)');
  });

  it('draft arrow has marker-end: "none"', () => {
    const result = renderShapeSvgProps(makeArrow(), true);
    expect(result.attributes['marker-end']).toBe('none');
  });

  it('committed arrow has stroke-dasharray: "none"', () => {
    const result = renderShapeSvgProps(makeArrow(), false);
    expect(result.attributes['stroke-dasharray']).toBe('none');
  });

  it('draft arrow has stroke-dasharray: "6 4"', () => {
    const result = renderShapeSvgProps(makeArrow(), true);
    expect(result.attributes['stroke-dasharray']).toBe('6 4');
  });

  it('committed arrow has opacity: 1', () => {
    const result = renderShapeSvgProps(makeArrow(), false);
    expect(result.attributes.opacity).toBe(1);
  });

  it('draft arrow has opacity: 0.8', () => {
    const result = renderShapeSvgProps(makeArrow(), true);
    expect(result.attributes.opacity).toBe(0.8);
  });

  it('uses shape.stroke for the stroke color', () => {
    const shape = makeArrow({ stroke: '#ff0000' });
    const result = renderShapeSvgProps(shape, false);
    expect(result.attributes.stroke).toBe('#ff0000');
  });

  it('includes stroke-width attribute', () => {
    const shape = makeArrow({ strokeWidth: 8 });
    const result = renderShapeSvgProps(shape, false);
    expect(result.attributes['stroke-width']).toBe(8);
  });

  it('committed arrow has pointer-events: "stroke"', () => {
    const result = renderShapeSvgProps(makeArrow(), false);
    expect(result.attributes['pointer-events']).toBe('stroke');
  });

  it('draft arrow has pointer-events: "none"', () => {
    const result = renderShapeSvgProps(makeArrow(), true);
    expect(result.attributes['pointer-events']).toBe('none');
  });
});

// ─── renderShapeSvgProps — Line ──────────────────────────────────────────────

describe('renderShapeSvgProps() — Line', () => {
  it('returns tagName: "line" for line', () => {
    const result = renderShapeSvgProps(makeLine(), false);
    expect(result.tagName).toBe('line');
  });

  it('includes correct x1/y1/x2/y2 attributes', () => {
    const shape = makeLine({ x1: 10, y1: 20, x2: 100, y2: 80 });
    const result = renderShapeSvgProps(shape, false);
    expect(result.attributes.x1).toBe(10);
    expect(result.attributes.y1).toBe(20);
    expect(result.attributes.x2).toBe(100);
    expect(result.attributes.y2).toBe(80);
  });

  it('committed line has no marker-end attribute (unlike arrow)', () => {
    const result = renderShapeSvgProps(makeLine(), false);
    expect(result.attributes['marker-end']).toBeUndefined();
  });

  it('committed line has stroke-dasharray: "none"', () => {
    const result = renderShapeSvgProps(makeLine(), false);
    expect(result.attributes['stroke-dasharray']).toBe('none');
  });

  it('draft line has stroke-dasharray: "6 4"', () => {
    const result = renderShapeSvgProps(makeLine(), true);
    expect(result.attributes['stroke-dasharray']).toBe('6 4');
  });

  it('committed line has opacity: 1', () => {
    const result = renderShapeSvgProps(makeLine(), false);
    expect(result.attributes.opacity).toBe(1);
  });

  it('draft line has opacity: 0.8', () => {
    const result = renderShapeSvgProps(makeLine(), true);
    expect(result.attributes.opacity).toBe(0.8);
  });

  it('uses shape.stroke for the stroke color', () => {
    const shape = makeLine({ stroke: '#ff0000' });
    const result = renderShapeSvgProps(shape, false);
    expect(result.attributes.stroke).toBe('#ff0000');
  });

  it('includes stroke-width attribute', () => {
    const shape = makeLine({ strokeWidth: 2 });
    const result = renderShapeSvgProps(shape, false);
    expect(result.attributes['stroke-width']).toBe(2);
  });

  it('committed line has pointer-events: "stroke"', () => {
    const result = renderShapeSvgProps(makeLine(), false);
    expect(result.attributes['pointer-events']).toBe('stroke');
  });

  it('draft line has pointer-events: "none"', () => {
    const result = renderShapeSvgProps(makeLine(), true);
    expect(result.attributes['pointer-events']).toBe('none');
  });
});

// ─── renderShapeSvgProps — Ellipse ───────────────────────────────────────────

describe('renderShapeSvgProps() — Ellipse', () => {
  it('returns tagName: "ellipse"', () => {
    const result = renderShapeSvgProps(makeEllipse(), false);
    expect(result.tagName).toBe('ellipse');
  });

  it('includes correct cx/cy/rx/ry attributes', () => {
    const shape = makeEllipse({ cx: 100, cy: 80, rx: 50, ry: 30 });
    const result = renderShapeSvgProps(shape, false);
    expect(result.attributes.cx).toBe(100);
    expect(result.attributes.cy).toBe(80);
    expect(result.attributes.rx).toBe(50);
    expect(result.attributes.ry).toBe(30);
  });

  it('committed ellipse has fill: "none"', () => {
    const result = renderShapeSvgProps(makeEllipse(), false);
    expect(result.attributes.fill).toBe('none');
  });

  it('draft ellipse has fill: "none"', () => {
    const result = renderShapeSvgProps(makeEllipse(), true);
    expect(result.attributes.fill).toBe('none');
  });

  it('committed ellipse has stroke-dasharray: "none"', () => {
    const result = renderShapeSvgProps(makeEllipse(), false);
    expect(result.attributes['stroke-dasharray']).toBe('none');
  });

  it('draft ellipse has stroke-dasharray: "6 4"', () => {
    const result = renderShapeSvgProps(makeEllipse(), true);
    expect(result.attributes['stroke-dasharray']).toBe('6 4');
  });

  it('committed ellipse has opacity: 1', () => {
    const result = renderShapeSvgProps(makeEllipse(), false);
    expect(result.attributes.opacity).toBe(1);
  });

  it('draft ellipse has opacity: 0.8', () => {
    const result = renderShapeSvgProps(makeEllipse(), true);
    expect(result.attributes.opacity).toBe(0.8);
  });

  it('uses shape.stroke for the stroke color', () => {
    const shape = makeEllipse({ stroke: '#ff0000' });
    const result = renderShapeSvgProps(shape, false);
    expect(result.attributes.stroke).toBe('#ff0000');
  });

  it('includes stroke-width attribute', () => {
    const shape = makeEllipse({ strokeWidth: 8 });
    const result = renderShapeSvgProps(shape, false);
    expect(result.attributes['stroke-width']).toBe(8);
  });

  it('committed ellipse has pointer-events: "stroke"', () => {
    const result = renderShapeSvgProps(makeEllipse(), false);
    expect(result.attributes['pointer-events']).toBe('stroke');
  });

  it('draft ellipse has pointer-events: "none"', () => {
    const result = renderShapeSvgProps(makeEllipse(), true);
    expect(result.attributes['pointer-events']).toBe('none');
  });
});

// ─── drawShapeOnCanvas — Arrow ────────────────────────────────────────────────

describe('drawShapeOnCanvas() — Arrow', () => {
  let ctx: MockCtx;

  beforeEach(() => {
    ctx = makeCanvasContext();
  });

  it('calls beginPath at least twice (line body + arrowhead)', () => {
    drawShapeOnCanvas(ctx as unknown as CanvasRenderingContext2D, makeArrow());
    expect(ctx.beginPath).toHaveBeenCalledTimes(2);
  });

  it('calls stroke for the line body', () => {
    drawShapeOnCanvas(ctx as unknown as CanvasRenderingContext2D, makeArrow());
    expect(ctx.stroke).toHaveBeenCalled();
  });

  it('calls fill for the arrowhead', () => {
    drawShapeOnCanvas(ctx as unknown as CanvasRenderingContext2D, makeArrow());
    expect(ctx.fill).toHaveBeenCalled();
  });

  it('calls moveTo with x1/y1 (line start)', () => {
    const shape = makeArrow({ x1: 10, y1: 20, x2: 100, y2: 80 });
    drawShapeOnCanvas(ctx as unknown as CanvasRenderingContext2D, shape);
    expect(ctx.moveTo).toHaveBeenCalledWith(10, 20);
  });

  it('calls lineTo with x2/y2 (line end)', () => {
    const shape = makeArrow({ x1: 10, y1: 20, x2: 100, y2: 80 });
    drawShapeOnCanvas(ctx as unknown as CanvasRenderingContext2D, shape);
    expect(ctx.lineTo).toHaveBeenCalledWith(100, 80);
  });

  it('sets strokeStyle to shape.stroke', () => {
    const shape = makeArrow({ stroke: '#3b82f6' });
    drawShapeOnCanvas(ctx as unknown as CanvasRenderingContext2D, shape);
    expect(ctx.strokeStyle).toBe('#3b82f6');
  });

  it('sets lineWidth to shape.strokeWidth', () => {
    const shape = makeArrow({ strokeWidth: 8 });
    drawShapeOnCanvas(ctx as unknown as CanvasRenderingContext2D, shape);
    expect(ctx.lineWidth).toBe(8);
  });

  it('sets lineCap to "round"', () => {
    drawShapeOnCanvas(ctx as unknown as CanvasRenderingContext2D, makeArrow());
    expect(ctx.lineCap).toBe('round');
  });
});

// ─── drawShapeOnCanvas — Line ─────────────────────────────────────────────────

describe('drawShapeOnCanvas() — Line', () => {
  let ctx: MockCtx;

  beforeEach(() => {
    ctx = makeCanvasContext();
  });

  it('calls beginPath once', () => {
    drawShapeOnCanvas(ctx as unknown as CanvasRenderingContext2D, makeLine());
    expect(ctx.beginPath).toHaveBeenCalledTimes(1);
  });

  it('calls moveTo with x1/y1 (line start)', () => {
    const shape = makeLine({ x1: 10, y1: 20, x2: 100, y2: 80 });
    drawShapeOnCanvas(ctx as unknown as CanvasRenderingContext2D, shape);
    expect(ctx.moveTo).toHaveBeenCalledWith(10, 20);
  });

  it('calls lineTo with x2/y2 (line end)', () => {
    const shape = makeLine({ x1: 10, y1: 20, x2: 100, y2: 80 });
    drawShapeOnCanvas(ctx as unknown as CanvasRenderingContext2D, shape);
    expect(ctx.lineTo).toHaveBeenCalledWith(100, 80);
  });

  it('calls stroke', () => {
    drawShapeOnCanvas(ctx as unknown as CanvasRenderingContext2D, makeLine());
    expect(ctx.stroke).toHaveBeenCalled();
  });

  it('does NOT call fill (line is not filled)', () => {
    drawShapeOnCanvas(ctx as unknown as CanvasRenderingContext2D, makeLine());
    expect(ctx.fill).not.toHaveBeenCalled();
  });

  it('sets strokeStyle to shape.stroke', () => {
    const shape = makeLine({ stroke: '#ff0000' });
    drawShapeOnCanvas(ctx as unknown as CanvasRenderingContext2D, shape);
    expect(ctx.strokeStyle).toBe('#ff0000');
  });

  it('sets lineWidth to shape.strokeWidth', () => {
    const shape = makeLine({ strokeWidth: 2 });
    drawShapeOnCanvas(ctx as unknown as CanvasRenderingContext2D, shape);
    expect(ctx.lineWidth).toBe(2);
  });

  it('sets lineCap to "round"', () => {
    drawShapeOnCanvas(ctx as unknown as CanvasRenderingContext2D, makeLine());
    expect(ctx.lineCap).toBe('round');
  });
});

// ─── drawShapeOnCanvas — Ellipse ──────────────────────────────────────────────

describe('drawShapeOnCanvas() — Ellipse', () => {
  let ctx: MockCtx;

  beforeEach(() => {
    ctx = makeCanvasContext();
  });

  it('calls ellipse() with correct cx, cy, rx, ry, 0, 0, 2π', () => {
    const shape = makeEllipse({ cx: 100, cy: 80, rx: 50, ry: 30 });
    drawShapeOnCanvas(ctx as unknown as CanvasRenderingContext2D, shape);
    expect(ctx.ellipse).toHaveBeenCalledWith(100, 80, 50, 30, 0, 0, 2 * Math.PI);
  });

  it('calls beginPath', () => {
    drawShapeOnCanvas(ctx as unknown as CanvasRenderingContext2D, makeEllipse());
    expect(ctx.beginPath).toHaveBeenCalledTimes(1);
  });

  it('calls stroke', () => {
    drawShapeOnCanvas(ctx as unknown as CanvasRenderingContext2D, makeEllipse());
    expect(ctx.stroke).toHaveBeenCalled();
  });

  it('does NOT call fill (ellipse is stroke-only)', () => {
    drawShapeOnCanvas(ctx as unknown as CanvasRenderingContext2D, makeEllipse());
    expect(ctx.fill).not.toHaveBeenCalled();
  });

  it('sets strokeStyle to shape.stroke', () => {
    const shape = makeEllipse({ stroke: '#ff0000' });
    drawShapeOnCanvas(ctx as unknown as CanvasRenderingContext2D, shape);
    expect(ctx.strokeStyle).toBe('#ff0000');
  });

  it('sets lineWidth to shape.strokeWidth', () => {
    const shape = makeEllipse({ strokeWidth: 8 });
    drawShapeOnCanvas(ctx as unknown as CanvasRenderingContext2D, shape);
    expect(ctx.lineWidth).toBe(8);
  });

  it('does NOT call strokeRect for ellipse', () => {
    drawShapeOnCanvas(ctx as unknown as CanvasRenderingContext2D, makeEllipse());
    expect(ctx.strokeRect).not.toHaveBeenCalled();
  });
});

describe('renderShapeSvgProps() — fallback for unknown type', () => {
  it('returns empty rect for a fully unknown shape type', () => {
    // Cast to any to simulate an unknown/future shape type not handled by any branch
    const unknownShape = {
      type: 'future_type_xyz' as unknown,
      id: 'unknown-1',
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = renderShapeSvgProps(unknownShape as any, false);

    // The fallback branch returns tagName:'rect' with empty attributes
    expect(result.tagName).toBe('rect');
    expect(result.attributes).toEqual({});
  });
});
