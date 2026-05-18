/**
 * Unit tests for SelectTool.ts
 *
 * Story #1473: Photo Annotator Foundation
 *
 * Tests pointer event sequences for the Select tool:
 *   - onPointerDown: hit-test shapes (body, handle), deselect on empty area
 *   - onPointerMove: translate/resize shape during drag
 *   - onPointerUp: commits drag position
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { SelectTool } from './SelectTool.js';
import type { AnnotatorState } from '../useAnnotator.js';
import type {
  AnnotationShape,
  ArrowShape,
  LineShape,
  EllipseShape,
  TextShape,
  CalloutShape,
  MeasurementShape,
  FreehandShape,
} from '../useUndoStack.js';
import type { PointerContext } from './SelectTool.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRectShape(overrides: Partial<AnnotationShape> = {}): AnnotationShape {
  return {
    type: 'rectangle',
    id: 'shape-1',
    x: 50,
    y: 50,
    w: 100,
    h: 80,
    color: '#dc2626',
    strokeWidth: 4,
    ...overrides,
  } as AnnotationShape;
}

function makeHighlightShape(overrides: Partial<AnnotationShape> = {}): AnnotationShape {
  return {
    type: 'highlight',
    id: 'shape-2',
    x: 20,
    y: 20,
    w: 60,
    h: 40,
    color: '#facc15',
    ...overrides,
  } as AnnotationShape;
}

function makeState(overrides: Partial<AnnotatorState> = {}): AnnotatorState {
  return {
    shapes: [],
    draftShape: null,
    selectedShapeId: null,
    selectedTool: 'select',
    activeColor: '#dc2626',
    activeStrokeWidthKey: 'medium',
    activeFontSize: 18,
    selectDragState: {
      mode: null,
      shapeId: null,
      handle: null,
      startImageX: 0,
      startImageY: 0,
      startShape: null,
    },
    ...overrides,
  };
}

function makeCtx(imageX: number, imageY: number): PointerContext {
  return {
    imageX,
    imageY,
    imageWidth: 800,
    imageHeight: 600,
    event: {} as React.PointerEvent<SVGSVGElement>,
  };
}

// No-op: dragState is now part of the reducer state, not module-level
function resetDragState(): void {
  // Nothing to reset — state is managed by the reducer
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('SelectTool', () => {
  beforeEach(() => {
    resetDragState();
  });

  describe('onPointerDown() — empty area', () => {
    it('returns SELECT_SHAPE(null) + END_DRAG when clicking empty area', () => {
      const state = makeState({ shapes: [] });
      const actions = SelectTool.onPointerDown(state, makeCtx(200, 200));

      expect(actions).toHaveLength(2);
      expect(actions[0]!.type).toBe('SELECT_SHAPE');
      if (actions[0]!.type !== 'SELECT_SHAPE') throw new Error('expected SELECT_SHAPE');
      expect(actions[0]!.id).toBeNull();
      expect(actions[1]!.type).toBe('END_DRAG');
    });

    it('returns SELECT_SHAPE(null) + END_DRAG when clicking outside all shapes', () => {
      const shape = makeRectShape({ x: 50, y: 50, w: 100, h: 80 });
      const state = makeState({ shapes: [shape] });

      // Click far away from the shape
      const actions = SelectTool.onPointerDown(state, makeCtx(500, 500));

      expect(actions).toHaveLength(2);
      expect(actions[0]!.type).toBe('SELECT_SHAPE');
      if (actions[0]!.type !== 'SELECT_SHAPE') throw new Error('expected SELECT_SHAPE');
      expect(actions[0]!.id).toBeNull();
      expect(actions[1]!.type).toBe('END_DRAG');
    });
  });

  describe('onPointerDown() — shape body hit', () => {
    it('returns SELECT_SHAPE + START_DRAG when clicking inside a rectangle', () => {
      const shape = makeRectShape({ id: 'rect-hit', x: 50, y: 50, w: 100, h: 80 });
      const state = makeState({ shapes: [shape] });

      // Click the center of the shape body (away from corners to avoid handles)
      // Rectangle is 50->150 x, 50->130 y. Safe center: 100, 90
      const actions = SelectTool.onPointerDown(state, makeCtx(100, 90));

      expect(actions).toHaveLength(2);
      const selectAction = actions[0]!;
      if (selectAction.type !== 'SELECT_SHAPE') throw new Error('expected SELECT_SHAPE');
      expect(selectAction.id).toBe('rect-hit');
      const dragAction = actions[1]!;
      expect(dragAction.type).toBe('START_DRAG');
      if (dragAction.type !== 'START_DRAG') throw new Error('expected START_DRAG');
      expect(dragAction.mode).toBe('move');
    });

    it('returns SELECT_SHAPE + START_DRAG when clicking inside a highlight', () => {
      const shape = makeHighlightShape({ id: 'hl-hit', x: 20, y: 20, w: 60, h: 40 });
      const state = makeState({ shapes: [shape] });

      // Click center of highlight
      const actions = SelectTool.onPointerDown(state, makeCtx(50, 40));

      expect(actions).toHaveLength(2);
      const selectAction = actions[0]!;
      if (selectAction.type !== 'SELECT_SHAPE') throw new Error('expected SELECT_SHAPE');
      expect(selectAction.id).toBe('hl-hit');
      const dragAction = actions[1]!;
      expect(dragAction.type).toBe('START_DRAG');
      if (dragAction.type !== 'START_DRAG') throw new Error('expected START_DRAG');
      expect(dragAction.mode).toBe('move');
    });

    it('selects top-most shape when shapes overlap (reverse order)', () => {
      const bottom = makeRectShape({ id: 'bottom', x: 10, y: 10, w: 100, h: 100 });
      const top = makeHighlightShape({ id: 'top', x: 10, y: 10, w: 50, h: 50 });
      const state = makeState({ shapes: [bottom, top] });

      // Click where both shapes overlap — top (higher index) wins
      const actions = SelectTool.onPointerDown(state, makeCtx(25, 25));

      expect(actions).toHaveLength(2);
      const selectAction = actions[0]!;
      if (selectAction.type !== 'SELECT_SHAPE') throw new Error('expected SELECT_SHAPE');
      expect(selectAction.id).toBe('top');
      const dragAction = actions[1]!;
      expect(dragAction.type).toBe('START_DRAG');
    });
  });

  describe('onPointerDown() — handle hit', () => {
    it('returns SELECT_SHAPE + START_DRAG(resize) when clicking a resize handle', () => {
      // Shape at x=50, y=50, w=100, h=80 — nw handle at (50, 50)
      const shape = makeRectShape({ id: 'resizable', x: 50, y: 50, w: 100, h: 80 });
      const state = makeState({ shapes: [shape] });

      // Click exactly on the nw handle (50, 50) — within handleSize=8, so dist=0
      const actions = SelectTool.onPointerDown(state, makeCtx(50, 50));

      expect(actions).toHaveLength(2);
      const selectAction = actions[0]!;
      if (selectAction.type !== 'SELECT_SHAPE') throw new Error('expected SELECT_SHAPE');
      expect(selectAction.id).toBe('resizable');
      const dragAction = actions[1]!;
      expect(dragAction.type).toBe('START_DRAG');
      if (dragAction.type !== 'START_DRAG') throw new Error('expected START_DRAG');
      expect(dragAction.mode).toBe('resize');
    });
  });

  describe('onPointerMove() — drag shape', () => {
    it('returns UPDATE_SHAPE with translated position during body drag', () => {
      const shape = makeHighlightShape({
        id: 'drag-me',
        x: 20,
        y: 20,
        w: 60,
        h: 40,
      });
      const state = makeState({ shapes: [shape] });

      // Down in the body — this sets the drag state via START_DRAG action
      SelectTool.onPointerDown(state, makeCtx(50, 40));

      // Now simulate the state after START_DRAG was processed by the reducer
      const stateAfterDragStart = makeState({
        shapes: [shape],
        selectDragState: {
          mode: 'move',
          shapeId: 'drag-me',
          handle: null,
          startImageX: 50,
          startImageY: 40,
          startShape: shape,
        },
      });

      // Move 30px right, 20px down
      const moveActions = SelectTool.onPointerMove(stateAfterDragStart, makeCtx(80, 60));

      expect(moveActions).toHaveLength(1);
      expect(moveActions[0]!.type).toBe('UPDATE_SHAPE');
    });

    it('returns empty array when not dragging (no active drag state)', () => {
      // No pointer down first — state has idle drag state
      const actions = SelectTool.onPointerMove(makeState({ shapes: [] }), makeCtx(100, 100));

      expect(actions).toHaveLength(0);
    });

    it('UPDATE_SHAPE carries the shape with new position', () => {
      const shape = makeHighlightShape({
        id: 'movable',
        x: 20,
        y: 20,
        w: 60,
        h: 40,
      });

      // Simulate the state after START_DRAG was processed
      const stateAfterDragStart = makeState({
        shapes: [shape],
        selectDragState: {
          mode: 'move',
          shapeId: 'movable',
          handle: null,
          startImageX: 50,
          startImageY: 40,
          startShape: shape,
        },
      });

      // Move 10px right, 10px down
      const moveActions = SelectTool.onPointerMove(stateAfterDragStart, makeCtx(60, 50));

      const action = moveActions[0]!;
      if (action.type !== 'UPDATE_SHAPE') throw new Error('expected UPDATE_SHAPE');
      // New position should be 20+10=30, 20+10=30 (startX=50, dx=10, newX=20+10=30)
      const updatedShape = action.shape;
      if (updatedShape.type !== 'highlight') throw new Error('expected highlight shape');
      expect(updatedShape.x).toBe(30);
      expect(updatedShape.y).toBe(30);
      expect(updatedShape.id).toBe('movable');
    });
  });

  describe('onPointerMove() — resize shape', () => {
    it('returns UPDATE_SHAPE during resize drag (handle hit sets resize mode)', () => {
      // Shape at (50,50) 100x80 — nw handle is at (50,50)
      const shape = makeRectShape({ id: 'resizable-move', x: 50, y: 50, w: 100, h: 80 });

      // Simulate the state after START_DRAG(resize) was processed
      const stateAfterDragStart = makeState({
        shapes: [shape],
        selectDragState: {
          mode: 'resize',
          shapeId: 'resizable-move',
          handle: 'nw', // HandlePosition
          startImageX: 50,
          startImageY: 50,
          startShape: shape,
        },
      });

      // Drag handle 10px right, 10px down
      const moveActions = SelectTool.onPointerMove(stateAfterDragStart, makeCtx(60, 60));

      expect(moveActions).toHaveLength(1);
      expect(moveActions[0]!.type).toBe('UPDATE_SHAPE');
    });
  });

  describe('onPointerUp()', () => {
    it('returns END_DRAG after a normal drag (position already committed via UPDATE_SHAPE)', () => {
      const shape = makeHighlightShape({ id: 'up-shape', x: 20, y: 20, w: 60, h: 40 });

      // Simulate active drag state
      const stateWithActiveDrag = makeState({
        shapes: [shape],
        selectedShapeId: 'up-shape',
        selectDragState: {
          mode: 'move',
          shapeId: 'up-shape',
          handle: null,
          startImageX: 50,
          startImageY: 40,
          startShape: shape,
        },
      });

      const upActions = SelectTool.onPointerUp(stateWithActiveDrag, makeCtx(60, 50));

      // SelectTool.onPointerUp returns END_DRAG (moves are committed by PhotoAnnotator on pointerup)
      expect(upActions).toHaveLength(1);
      expect(upActions[0]!.type).toBe('END_DRAG');
    });

    it('returns END_DRAG when not dragging', () => {
      const upActions = SelectTool.onPointerUp(makeState({ shapes: [] }), makeCtx(100, 100));
      expect(upActions).toHaveLength(1);
      expect(upActions[0]!.type).toBe('END_DRAG');
    });

    it('returns END_DRAG when shape is not found in state on pointer up', () => {
      // Simulate active drag state for a shape that's been removed
      const stateWithActiveDragButNoShape = makeState({
        shapes: [],
        selectDragState: {
          mode: 'move',
          shapeId: 'gone-shape',
          handle: null,
          startImageX: 50,
          startImageY: 40,
          startShape: makeHighlightShape({ id: 'gone-shape' }),
        },
      });

      // Call onPointerUp with empty shapes (shape was removed from state)
      const upActions = SelectTool.onPointerUp(stateWithActiveDragButNoShape, makeCtx(60, 50));

      expect(upActions).toHaveLength(1);
      expect(upActions[0]!.type).toBe('END_DRAG');
    });
  });

  describe('cursor', () => {
    it('has cursor "default"', () => {
      expect(SelectTool.cursor).toBe('default');
    });
  });

  // ─── Arrow / Line hit-test and move ─────────────────────────────────────────

  describe('onPointerDown() — arrow body hit', () => {
    it('returns SELECT_SHAPE + START_DRAG(move) when clicking on an arrow body', () => {
      // Arrow from (50, 50) to (200, 50) — horizontal
      const shape: ArrowShape = {
        type: 'arrow',
        id: 'arrow-hit',
        x1: 50,
        y1: 50,
        x2: 200,
        y2: 50,
        stroke: '#dc2626',
        strokeWidth: 4,
      };
      const state = makeState({ shapes: [shape] });

      // Click midpoint of the arrow body — within tolerance=4
      const actions = SelectTool.onPointerDown(state, makeCtx(125, 50));

      expect(actions).toHaveLength(2);
      const selectAction = actions[0]!;
      if (selectAction.type !== 'SELECT_SHAPE') throw new Error('expected SELECT_SHAPE');
      expect(selectAction.id).toBe('arrow-hit');
      const dragAction = actions[1]!;
      expect(dragAction.type).toBe('START_DRAG');
      if (dragAction.type !== 'START_DRAG') throw new Error('expected START_DRAG');
      expect(dragAction.mode).toBe('move');
    });

    it('returns SELECT_SHAPE + START_DRAG(resize) when clicking the start endpoint handle', () => {
      // Arrow from (50, 50) to (200, 50)
      const shape: ArrowShape = {
        type: 'arrow',
        id: 'arrow-resize',
        x1: 50,
        y1: 50,
        x2: 200,
        y2: 50,
        stroke: '#dc2626',
        strokeWidth: 4,
      };
      const state = makeState({ shapes: [shape] });

      // Click exactly on the start endpoint (50, 50)
      const actions = SelectTool.onPointerDown(state, makeCtx(50, 50));

      expect(actions).toHaveLength(2);
      const dragAction = actions[1]!;
      if (dragAction.type !== 'START_DRAG') throw new Error('expected START_DRAG');
      expect(dragAction.mode).toBe('resize');
    });
  });

  describe('onPointerDown() — line body hit', () => {
    it('returns SELECT_SHAPE + START_DRAG(move) when clicking on a line body', () => {
      // Line from (50, 100) to (200, 100) — horizontal
      const shape: LineShape = {
        type: 'line',
        id: 'line-hit',
        x1: 50,
        y1: 100,
        x2: 200,
        y2: 100,
        stroke: '#3b82f6',
        strokeWidth: 4,
      };
      const state = makeState({ shapes: [shape] });

      // Click midpoint — within tolerance=4
      const actions = SelectTool.onPointerDown(state, makeCtx(125, 100));

      expect(actions).toHaveLength(2);
      const selectAction = actions[0]!;
      if (selectAction.type !== 'SELECT_SHAPE') throw new Error('expected SELECT_SHAPE');
      expect(selectAction.id).toBe('line-hit');
      const dragAction = actions[1]!;
      if (dragAction.type !== 'START_DRAG') throw new Error('expected START_DRAG');
      expect(dragAction.mode).toBe('move');
    });
  });

  describe('onPointerDown() — ellipse body hit', () => {
    it('returns SELECT_SHAPE + START_DRAG(move) when clicking inside an ellipse body', () => {
      // Ellipse at cx=150, cy=150, rx=60, ry=40
      const shape: EllipseShape = {
        type: 'ellipse',
        id: 'ellipse-hit',
        cx: 150,
        cy: 150,
        rx: 60,
        ry: 40,
        stroke: '#16a34a',
        strokeWidth: 4,
      };
      const state = makeState({ shapes: [shape] });

      // Click on the ellipse perimeter at ~45° — NOT on a cardinal handle.
      // Cardinal handles are at the four axis extremes (east/west/north/south),
      // and hitTestCardinalHandles runs before body hit-test.
      // (192, 178) ≈ (cx + rx*cos45°, cy + ry*sin45°): on the stroke, clear of all handles.
      // distToPerimeter ≈ 0.4 which is within strokeWidth/2=2, so hitTestEllipse returns 'body'.
      const actions = SelectTool.onPointerDown(state, makeCtx(192, 178));

      expect(actions).toHaveLength(2);
      const selectAction = actions[0]!;
      if (selectAction.type !== 'SELECT_SHAPE') throw new Error('expected SELECT_SHAPE');
      expect(selectAction.id).toBe('ellipse-hit');
      const dragAction = actions[1]!;
      if (dragAction.type !== 'START_DRAG') throw new Error('expected START_DRAG');
      expect(dragAction.mode).toBe('move');
    });

    it('returns SELECT_SHAPE + START_DRAG(resize) when clicking a cardinal handle of an ellipse', () => {
      // Ellipse at cx=150, cy=150, rx=60, ry=40
      // East handle at (210, 150)
      const shape: EllipseShape = {
        type: 'ellipse',
        id: 'ellipse-resize',
        cx: 150,
        cy: 150,
        rx: 60,
        ry: 40,
        stroke: '#16a34a',
        strokeWidth: 4,
      };
      const state = makeState({ shapes: [shape] });

      // The handle hit check runs before body hit — click east handle at (210, 150)
      // hitTestCardinalHandles is exact match (distance=0), so handle wins
      const actions = SelectTool.onPointerDown(state, makeCtx(210, 150));

      // When handle is hit first, mode=resize
      expect(actions).toHaveLength(2);
      const dragAction = actions[1]!;
      if (dragAction.type !== 'START_DRAG') throw new Error('expected START_DRAG');
      // East handle at (210,150) hits resize
      expect(dragAction.mode).toBe('resize');
    });
  });

  describe('onPointerMove() — move arrow', () => {
    it('returns UPDATE_SHAPE with translated arrow during body drag', () => {
      const shape: ArrowShape = {
        type: 'arrow',
        id: 'arrow-move',
        x1: 50,
        y1: 50,
        x2: 200,
        y2: 50,
        stroke: '#dc2626',
        strokeWidth: 4,
      };

      const stateAfterDragStart = makeState({
        shapes: [shape],
        selectDragState: {
          mode: 'move',
          shapeId: 'arrow-move',
          handle: null,
          startImageX: 125,
          startImageY: 50,
          startShape: shape,
        },
      });

      // Move 30px right, 20px down
      const moveActions = SelectTool.onPointerMove(stateAfterDragStart, makeCtx(155, 70));

      expect(moveActions).toHaveLength(1);
      expect(moveActions[0]!.type).toBe('UPDATE_SHAPE');
      const action = moveActions[0]!;
      if (action.type !== 'UPDATE_SHAPE') throw new Error('expected UPDATE_SHAPE');
      const updatedShape = action.shape;
      if (updatedShape.type !== 'arrow') throw new Error('expected arrow');
      // Both endpoints move by the same delta
      expect(updatedShape.x1).toBe(80); // 50+30
      expect(updatedShape.y1).toBe(70); // 50+20
      expect(updatedShape.x2).toBe(230); // 200+30
      expect(updatedShape.y2).toBe(70); // 50+20
    });
  });

  describe('onPointerMove() — resize arrow (start handle)', () => {
    it('returns UPDATE_SHAPE with new x1/y1 when dragging the start endpoint', () => {
      const shape: ArrowShape = {
        type: 'arrow',
        id: 'arrow-resize',
        x1: 50,
        y1: 50,
        x2: 200,
        y2: 50,
        stroke: '#dc2626',
        strokeWidth: 4,
      };

      const stateAfterDragStart = makeState({
        shapes: [shape],
        selectDragState: {
          mode: 'resize',
          shapeId: 'arrow-resize',
          handle: 'start',
          startImageX: 50,
          startImageY: 50,
          startShape: shape,
        },
      });

      // Drag start point 20px right, 10px down
      const moveActions = SelectTool.onPointerMove(stateAfterDragStart, makeCtx(70, 60));

      expect(moveActions).toHaveLength(1);
      const action = moveActions[0]!;
      if (action.type !== 'UPDATE_SHAPE') throw new Error('expected UPDATE_SHAPE');
      const updatedShape = action.shape;
      if (updatedShape.type !== 'arrow') throw new Error('expected arrow');
      expect(updatedShape.x1).toBe(70); // 50+20
      expect(updatedShape.y1).toBe(60); // 50+10
      expect(updatedShape.x2).toBe(200); // unchanged
      expect(updatedShape.y2).toBe(50); // unchanged
    });
  });

  describe('onPointerMove() — move ellipse', () => {
    it('returns UPDATE_SHAPE with translated ellipse center during body drag', () => {
      const shape: EllipseShape = {
        type: 'ellipse',
        id: 'ellipse-move',
        cx: 150,
        cy: 150,
        rx: 60,
        ry: 40,
        stroke: '#16a34a',
        strokeWidth: 4,
      };

      const stateAfterDragStart = makeState({
        shapes: [shape],
        selectDragState: {
          mode: 'move',
          shapeId: 'ellipse-move',
          handle: null,
          startImageX: 150,
          startImageY: 150,
          startShape: shape,
        },
      });

      // Move 20px right, 15px down
      const moveActions = SelectTool.onPointerMove(stateAfterDragStart, makeCtx(170, 165));

      expect(moveActions).toHaveLength(1);
      const action = moveActions[0]!;
      if (action.type !== 'UPDATE_SHAPE') throw new Error('expected UPDATE_SHAPE');
      const updatedShape = action.shape;
      if (updatedShape.type !== 'ellipse') throw new Error('expected ellipse');
      expect(updatedShape.cx).toBe(170); // 150+20
      expect(updatedShape.cy).toBe(165); // 150+15
      expect(updatedShape.rx).toBe(60); // unchanged
      expect(updatedShape.ry).toBe(40); // unchanged
    });
  });

  describe('onPointerMove() — resize ellipse (east handle)', () => {
    it('returns UPDATE_SHAPE with updated rx when dragging the east handle', () => {
      const shape: EllipseShape = {
        type: 'ellipse',
        id: 'ellipse-resize',
        cx: 150,
        cy: 150,
        rx: 60,
        ry: 40,
        stroke: '#16a34a',
        strokeWidth: 4,
      };

      const stateAfterDragStart = makeState({
        shapes: [shape],
        selectDragState: {
          mode: 'resize',
          shapeId: 'ellipse-resize',
          handle: 'east',
          startImageX: 210,
          startImageY: 150,
          startShape: shape,
        },
      });

      // Drag east handle 20px to the right
      const moveActions = SelectTool.onPointerMove(stateAfterDragStart, makeCtx(230, 150));

      expect(moveActions).toHaveLength(1);
      const action = moveActions[0]!;
      if (action.type !== 'UPDATE_SHAPE') throw new Error('expected UPDATE_SHAPE');
      const updatedShape = action.shape;
      if (updatedShape.type !== 'ellipse') throw new Error('expected ellipse');
      expect(updatedShape.rx).toBe(80); // 60+20
      expect(updatedShape.ry).toBe(40); // unchanged
    });
  });
});

// ─── Text shape hit-testing and interaction ────────────────────────────────────

describe('onPointerDown() — text shape body hit', () => {
  function makeTextShape(overrides: Partial<TextShape> = {}): TextShape {
    return {
      type: 'text',
      id: 'text-hit',
      x: 50,
      y: 50,
      text: 'Hello World',
      fontSize: 18,
      color: '#dc2626',
      ...overrides,
    };
  }

  it('returns SELECT_SHAPE + START_DRAG(move) when clicking inside text body', () => {
    // text at (50, 50), text='Hello World' (11 chars), fontSize=18
    // approxWidth = 11 * 18 * 0.6 = 118.8; approxHeight = 18 * 1.2 = 21.6
    // Click at (80, 60) — well inside the bounding box
    const shape = makeTextShape();
    const state = makeState({ shapes: [shape] });

    const actions = SelectTool.onPointerDown(state, makeCtx(80, 60));

    expect(actions).toHaveLength(2);
    const selectAction = actions[0]!;
    if (selectAction.type !== 'SELECT_SHAPE') throw new Error('expected SELECT_SHAPE');
    expect(selectAction.id).toBe('text-hit');
    const dragAction = actions[1]!;
    if (dragAction.type !== 'START_DRAG') throw new Error('expected START_DRAG');
    expect(dragAction.mode).toBe('move');
  });

  it('returns SELECT_SHAPE(null) + END_DRAG when clicking far outside a text shape', () => {
    const shape = makeTextShape({ x: 50, y: 50 });
    const state = makeState({ shapes: [shape] });

    // Click at (500, 500) — far from text shape
    const actions = SelectTool.onPointerDown(state, makeCtx(500, 500));

    expect(actions).toHaveLength(2);
    const selectAction = actions[0]!;
    if (selectAction.type !== 'SELECT_SHAPE') throw new Error('expected SELECT_SHAPE');
    expect(selectAction.id).toBeNull();
  });

  it('double-click on text shape calls onOpenInlineInput', () => {
    const shape = makeTextShape();
    const state = makeState({ shapes: [shape] });
    const onOpenInlineInput = jest.fn() as jest.MockedFunction<
      (x: number, y: number, shapeId?: string) => void
    >;

    const ctx: PointerContext = {
      imageX: 80,
      imageY: 60,
      imageWidth: 800,
      imageHeight: 600,
      // detail=2 signals double-click
      event: { detail: 2 } as React.PointerEvent<SVGSVGElement>,
      onOpenInlineInput,
    };

    const actions = SelectTool.onPointerDown(state, ctx);

    expect(onOpenInlineInput).toHaveBeenCalledTimes(1);
    expect(onOpenInlineInput).toHaveBeenCalledWith(shape.x, shape.y, shape.id);
    // Also selects the shape
    const selectAction = actions.find((a) => a.type === 'SELECT_SHAPE');
    expect(selectAction).toBeDefined();
    if (selectAction?.type !== 'SELECT_SHAPE') throw new Error('expected SELECT_SHAPE');
    expect(selectAction.id).toBe('text-hit');
  });

  it('double-click on text shape passes shapeId as third argument to onOpenInlineInput', () => {
    const shape = makeTextShape({ id: 'text-edit-id' });
    const state = makeState({ shapes: [shape] });
    const onOpenInlineInput = jest.fn() as jest.MockedFunction<
      (x: number, y: number, shapeId?: string) => void
    >;

    const ctx: PointerContext = {
      imageX: 80,
      imageY: 60,
      imageWidth: 800,
      imageHeight: 600,
      event: { detail: 2 } as React.PointerEvent<SVGSVGElement>,
      onOpenInlineInput,
    };

    SelectTool.onPointerDown(state, ctx);

    expect(onOpenInlineInput).toHaveBeenCalledTimes(1);
    expect(onOpenInlineInput).toHaveBeenCalledWith(shape.x, shape.y, 'text-edit-id');
  });
});

// ─── Callout shape hit-testing and interaction ─────────────────────────────────

describe('onPointerDown() — callout shape', () => {
  function makeCalloutShape(overrides: Partial<CalloutShape> = {}): CalloutShape {
    return {
      type: 'callout',
      id: 'callout-hit',
      x: 50,
      y: 50,
      w: 100,
      h: 80,
      text: '',
      tailX: 160,
      tailY: 200,
      stroke: '#dc2626',
      fill: '#dc2626',
      fontSize: 18,
      color: '#dc2626',
      ...overrides,
    };
  }

  it('returns SELECT_SHAPE + START_DRAG(move) when clicking inside callout box', () => {
    // Callout box: x=50,y=50 to x=150,y=130; click at (100, 90) — center of box
    const shape = makeCalloutShape();
    const state = makeState({ shapes: [shape] });

    const actions = SelectTool.onPointerDown(state, makeCtx(100, 90));

    expect(actions).toHaveLength(2);
    const selectAction = actions[0]!;
    if (selectAction.type !== 'SELECT_SHAPE') throw new Error('expected SELECT_SHAPE');
    expect(selectAction.id).toBe('callout-hit');
    const dragAction = actions[1]!;
    if (dragAction.type !== 'START_DRAG') throw new Error('expected START_DRAG');
    expect(dragAction.mode).toBe('move');
  });

  it('returns SELECT_SHAPE + START_DRAG(resize, handle=tail) when clicking the tail handle', () => {
    // tailX=160, tailY=200; handleSize=8 → hit radius=4; click exactly at (160,200)
    const shape = makeCalloutShape({ tailX: 160, tailY: 200 });
    const state = makeState({ shapes: [shape] });

    const actions = SelectTool.onPointerDown(state, makeCtx(160, 200));

    expect(actions).toHaveLength(2);
    const selectAction = actions[0]!;
    if (selectAction.type !== 'SELECT_SHAPE') throw new Error('expected SELECT_SHAPE');
    expect(selectAction.id).toBe('callout-hit');
    const dragAction = actions[1]!;
    if (dragAction.type !== 'START_DRAG') throw new Error('expected START_DRAG');
    expect(dragAction.mode).toBe('resize');
    expect(dragAction.handle).toBe('tail');
  });

  it('double-click on callout box calls onOpenInlineInput', () => {
    const shape = makeCalloutShape();
    const state = makeState({ shapes: [shape] });
    const onOpenInlineInput = jest.fn() as jest.MockedFunction<
      (x: number, y: number, shapeId?: string) => void
    >;

    const ctx: PointerContext = {
      imageX: 100,
      imageY: 90,
      imageWidth: 800,
      imageHeight: 600,
      event: { detail: 2 } as React.PointerEvent<SVGSVGElement>,
      onOpenInlineInput,
    };

    const actions = SelectTool.onPointerDown(state, ctx);

    expect(onOpenInlineInput).toHaveBeenCalledTimes(1);
    expect(onOpenInlineInput).toHaveBeenCalledWith(shape.x, shape.y, shape.id);
    const selectAction = actions.find((a) => a.type === 'SELECT_SHAPE');
    if (selectAction?.type !== 'SELECT_SHAPE') throw new Error('expected SELECT_SHAPE');
    expect(selectAction.id).toBe('callout-hit');
  });

  it('double-click on callout box passes shapeId as third argument to onOpenInlineInput', () => {
    const shape = makeCalloutShape({ id: 'callout-edit-id' });
    const state = makeState({ shapes: [shape] });
    const onOpenInlineInput = jest.fn() as jest.MockedFunction<
      (x: number, y: number, shapeId?: string) => void
    >;

    const ctx: PointerContext = {
      imageX: 100,
      imageY: 90,
      imageWidth: 800,
      imageHeight: 600,
      event: { detail: 2 } as React.PointerEvent<SVGSVGElement>,
      onOpenInlineInput,
    };

    SelectTool.onPointerDown(state, ctx);

    expect(onOpenInlineInput).toHaveBeenCalledTimes(1);
    expect(onOpenInlineInput).toHaveBeenCalledWith(shape.x, shape.y, 'callout-edit-id');
  });
});

// ─── onPointerMove() — move text ──────────────────────────────────────────────

describe('onPointerMove() — move text shape', () => {
  it('returns UPDATE_SHAPE with translated text position', () => {
    const shape: TextShape = {
      type: 'text',
      id: 'text-move',
      x: 100,
      y: 100,
      text: 'Move me',
      fontSize: 18,
      color: '#dc2626',
    };

    const stateAfterDragStart = makeState({
      shapes: [shape],
      selectDragState: {
        mode: 'move',
        shapeId: 'text-move',
        handle: null,
        startImageX: 100,
        startImageY: 100,
        startShape: shape,
      },
    });

    // Move 20px right, 15px down
    const moveActions = SelectTool.onPointerMove(stateAfterDragStart, makeCtx(120, 115));

    expect(moveActions).toHaveLength(1);
    const action = moveActions[0]!;
    if (action.type !== 'UPDATE_SHAPE') throw new Error('expected UPDATE_SHAPE');
    const updatedShape = action.shape;
    if (updatedShape.type !== 'text') throw new Error('expected text shape');
    // translateText moves x: clamp(100+20, 0, 800)=120; y: clamp(100+15, 0, 600-18)=115
    expect(updatedShape.x).toBe(120);
    expect(updatedShape.y).toBe(115);
  });
});

// ─── onPointerMove() — move callout ──────────────────────────────────────────

describe('onPointerMove() — move callout shape', () => {
  it('returns UPDATE_SHAPE with translated callout box position (tail unchanged)', () => {
    const shape: CalloutShape = {
      type: 'callout',
      id: 'callout-move',
      x: 50,
      y: 50,
      w: 100,
      h: 80,
      text: '',
      tailX: 200,
      tailY: 200,
      stroke: '#dc2626',
      fill: '#dc2626',
      fontSize: 18,
      color: '#dc2626',
    };

    const stateAfterDragStart = makeState({
      shapes: [shape],
      selectDragState: {
        mode: 'move',
        shapeId: 'callout-move',
        handle: null,
        startImageX: 100,
        startImageY: 90,
        startShape: shape,
      },
    });

    // Move 20px right, 10px down
    const moveActions = SelectTool.onPointerMove(stateAfterDragStart, makeCtx(120, 100));

    expect(moveActions).toHaveLength(1);
    const action = moveActions[0]!;
    if (action.type !== 'UPDATE_SHAPE') throw new Error('expected UPDATE_SHAPE');
    const updatedShape = action.shape;
    if (updatedShape.type !== 'callout') throw new Error('expected callout shape');
    // Box moves by dx=20, dy=10
    expect(updatedShape.x).toBe(70); // 50+20
    expect(updatedShape.y).toBe(60); // 50+10
    // tailX/tailY preserved from startShape (translateCallout only returns x/y)
    expect(updatedShape.tailX).toBe(200);
    expect(updatedShape.tailY).toBe(200);
  });
});

// ─── onPointerMove() — resize callout tail ────────────────────────────────────

describe('onPointerMove() — resize callout tail anchor', () => {
  it('returns UPDATE_SHAPE with updated tailX/tailY (box x/y/w/h unchanged)', () => {
    const shape: CalloutShape = {
      type: 'callout',
      id: 'callout-tail-resize',
      x: 50,
      y: 50,
      w: 100,
      h: 80,
      text: '',
      tailX: 200,
      tailY: 200,
      stroke: '#dc2626',
      fill: '#dc2626',
      fontSize: 18,
      color: '#dc2626',
    };

    const stateAfterDragStart = makeState({
      shapes: [shape],
      selectDragState: {
        mode: 'resize',
        shapeId: 'callout-tail-resize',
        handle: 'tail',
        startImageX: 200,
        startImageY: 200,
        startShape: shape,
      },
    });

    // Drag tail 30px right, 40px down
    const moveActions = SelectTool.onPointerMove(stateAfterDragStart, makeCtx(230, 240));

    expect(moveActions).toHaveLength(1);
    const action = moveActions[0]!;
    if (action.type !== 'UPDATE_SHAPE') throw new Error('expected UPDATE_SHAPE');
    const updatedShape = action.shape;
    if (updatedShape.type !== 'callout') throw new Error('expected callout shape');
    // tail moves: tailX = clamp(200+30, 0, 800) = 230; tailY = clamp(200+40, 0, 600) = 240
    expect(updatedShape.tailX).toBe(230);
    expect(updatedShape.tailY).toBe(240);
    // box stays put
    expect(updatedShape.x).toBe(50);
    expect(updatedShape.y).toBe(50);
    expect(updatedShape.w).toBe(100);
    expect(updatedShape.h).toBe(80);
  });
});

// ─── Measurement shape hit-testing and interaction ─────────────────────────────

describe('onPointerDown() — measurement shape', () => {
  function makeMeasurementShape(overrides: Partial<MeasurementShape> = {}): MeasurementShape {
    return {
      type: 'measurement',
      id: 'measurement-hit',
      x1: 50,
      y1: 100,
      x2: 250,
      y2: 100, // horizontal measurement line
      label: '5m',
      stroke: '#dc2626',
      strokeWidth: 4,
      fontSize: 18,
      color: '#dc2626',
      ...overrides,
    };
  }

  it('returns SELECT_SHAPE + START_DRAG(move) when clicking the measurement body', () => {
    // Measurement is horizontal from (50,100) to (250,100); click midpoint (150,100)
    const shape = makeMeasurementShape();
    const state = makeState({ shapes: [shape] });

    const actions = SelectTool.onPointerDown(state, makeCtx(150, 100));

    expect(actions).toHaveLength(2);
    const selectAction = actions[0]!;
    if (selectAction.type !== 'SELECT_SHAPE') throw new Error('expected SELECT_SHAPE');
    expect(selectAction.id).toBe('measurement-hit');
    const dragAction = actions[1]!;
    if (dragAction.type !== 'START_DRAG') throw new Error('expected START_DRAG');
    expect(dragAction.mode).toBe('move');
  });

  it('returns SELECT_SHAPE + START_DRAG(resize) when clicking the start endpoint handle', () => {
    // Start endpoint at (50,100); click exactly on it
    const shape = makeMeasurementShape();
    const state = makeState({ shapes: [shape] });

    const actions = SelectTool.onPointerDown(state, makeCtx(50, 100));

    expect(actions).toHaveLength(2);
    const dragAction = actions[1]!;
    if (dragAction.type !== 'START_DRAG') throw new Error('expected START_DRAG');
    expect(dragAction.mode).toBe('resize');
    expect(dragAction.handle).toBe('start');
  });

  it('returns SELECT_SHAPE + START_DRAG(resize) when clicking the end endpoint handle', () => {
    // End endpoint at (250,100); click exactly on it
    const shape = makeMeasurementShape();
    const state = makeState({ shapes: [shape] });

    const actions = SelectTool.onPointerDown(state, makeCtx(250, 100));

    expect(actions).toHaveLength(2);
    const dragAction = actions[1]!;
    if (dragAction.type !== 'START_DRAG') throw new Error('expected START_DRAG');
    expect(dragAction.mode).toBe('resize');
    expect(dragAction.handle).toBe('end');
  });

  it('double-click on measurement body calls onOpenInlineInput at midpoint', () => {
    const shape = makeMeasurementShape({ x1: 50, y1: 100, x2: 250, y2: 100 });
    const state = makeState({ shapes: [shape] });
    const onOpenInlineInput = jest.fn() as jest.MockedFunction<
      (x: number, y: number, shapeId?: string) => void
    >;

    const ctx: PointerContext = {
      imageX: 150,
      imageY: 100,
      imageWidth: 800,
      imageHeight: 600,
      event: { detail: 2 } as React.PointerEvent<SVGSVGElement>,
      onOpenInlineInput,
    };

    const actions = SelectTool.onPointerDown(state, ctx);

    // Midpoint of (50,100)→(250,100) is (150, 100)
    expect(onOpenInlineInput).toHaveBeenCalledTimes(1);
    expect(onOpenInlineInput).toHaveBeenCalledWith(150, 100, shape.id);
    const selectAction = actions.find((a) => a.type === 'SELECT_SHAPE');
    if (selectAction?.type !== 'SELECT_SHAPE') throw new Error('expected SELECT_SHAPE');
    expect(selectAction.id).toBe('measurement-hit');
  });

  it('double-click on measurement passes shape.id as third argument to onOpenInlineInput', () => {
    const shape = makeMeasurementShape({ id: 'meas-dblclick-id' });
    const state = makeState({ shapes: [shape] });
    const onOpenInlineInput = jest.fn() as jest.MockedFunction<
      (x: number, y: number, shapeId?: string) => void
    >;

    const ctx: PointerContext = {
      imageX: 150,
      imageY: 100,
      imageWidth: 800,
      imageHeight: 600,
      event: { detail: 2 } as React.PointerEvent<SVGSVGElement>,
      onOpenInlineInput,
    };

    SelectTool.onPointerDown(state, ctx);

    expect(onOpenInlineInput).toHaveBeenCalledWith(
      expect.any(Number),
      expect.any(Number),
      'meas-dblclick-id',
    );
  });

  it('double-click far from measurement body does NOT call onOpenInlineInput', () => {
    const shape = makeMeasurementShape({ x1: 50, y1: 100, x2: 250, y2: 100 });
    const state = makeState({ shapes: [shape] });
    const onOpenInlineInput = jest.fn() as jest.MockedFunction<
      (x: number, y: number, shapeId?: string) => void
    >;

    // Double-click 500px away from the measurement line
    const ctx: PointerContext = {
      imageX: 600,
      imageY: 100,
      imageWidth: 800,
      imageHeight: 600,
      event: { detail: 2 } as React.PointerEvent<SVGSVGElement>,
      onOpenInlineInput,
    };

    const actions = SelectTool.onPointerDown(state, ctx);

    // Should not call onOpenInlineInput since the double-click missed the line
    expect(onOpenInlineInput).not.toHaveBeenCalled();
    // Should deselect and end drag (no hit on any shape)
    expect(actions).toHaveLength(2);
    const selectAction = actions[0]!;
    if (selectAction.type !== 'SELECT_SHAPE') throw new Error('expected SELECT_SHAPE');
    expect(selectAction.id).toBeNull();
  });
});

// ─── onPointerMove() — move measurement ──────────────────────────────────────

describe('onPointerMove() — move measurement shape', () => {
  it('returns UPDATE_SHAPE with translated endpoints', () => {
    const shape: MeasurementShape = {
      type: 'measurement',
      id: 'meas-move',
      x1: 50,
      y1: 100,
      x2: 150,
      y2: 100,
      label: '5m',
      stroke: '#dc2626',
      strokeWidth: 4,
      fontSize: 18,
      color: '#dc2626',
    };

    const stateAfterDragStart = makeState({
      shapes: [shape],
      selectDragState: {
        mode: 'move',
        shapeId: 'meas-move',
        handle: null,
        startImageX: 100,
        startImageY: 100,
        startShape: shape,
      },
    });

    // Move 20px right, 10px down
    const moveActions = SelectTool.onPointerMove(stateAfterDragStart, makeCtx(120, 110));

    expect(moveActions).toHaveLength(1);
    const action = moveActions[0]!;
    if (action.type !== 'UPDATE_SHAPE') throw new Error('expected UPDATE_SHAPE');
    const updatedShape = action.shape;
    if (updatedShape.type !== 'measurement') throw new Error('expected measurement shape');
    expect(updatedShape.x1).toBe(70); // 50+20
    expect(updatedShape.y1).toBe(110); // 100+10
    expect(updatedShape.x2).toBe(170); // 150+20
    expect(updatedShape.y2).toBe(110); // 100+10
  });
});

// ─── onPointerMove() — resize measurement (end handle) ───────────────────────

describe('onPointerMove() — resize measurement endpoint', () => {
  it('returns UPDATE_SHAPE with new x2/y2 when dragging the end endpoint', () => {
    const shape: MeasurementShape = {
      type: 'measurement',
      id: 'meas-resize',
      x1: 50,
      y1: 100,
      x2: 150,
      y2: 100,
      label: '',
      stroke: '#dc2626',
      strokeWidth: 4,
      fontSize: 18,
      color: '#dc2626',
    };

    const stateAfterDragStart = makeState({
      shapes: [shape],
      selectDragState: {
        mode: 'resize',
        shapeId: 'meas-resize',
        handle: 'end',
        startImageX: 150,
        startImageY: 100,
        startShape: shape,
      },
    });

    // Drag end point 30px right, 20px up
    const moveActions = SelectTool.onPointerMove(stateAfterDragStart, makeCtx(180, 80));

    expect(moveActions).toHaveLength(1);
    const action = moveActions[0]!;
    if (action.type !== 'UPDATE_SHAPE') throw new Error('expected UPDATE_SHAPE');
    const updatedShape = action.shape;
    if (updatedShape.type !== 'measurement') throw new Error('expected measurement shape');
    expect(updatedShape.x2).toBe(180); // 150+30
    expect(updatedShape.y2).toBe(80); // 100-20
    // x1/y1 unchanged
    expect(updatedShape.x1).toBe(50);
    expect(updatedShape.y1).toBe(100);
  });
});

// ─── Freehand shape hit-testing and interaction ───────────────────────────────

describe('onPointerDown() — freehand shape', () => {
  function makeFreehandShape(overrides: Partial<FreehandShape> = {}): FreehandShape {
    return {
      type: 'freehand',
      id: 'freehand-hit',
      // Horizontal polyline from (50,100) to (150,100)
      points: [
        [50, 100],
        [100, 100],
        [150, 100],
      ],
      stroke: '#3b82f6',
      strokeWidth: 4,
      ...overrides,
    };
  }

  it('returns SELECT_SHAPE + START_DRAG(move) when clicking near the freehand body', () => {
    // Freehand along y=100; click at (100, 102) — 2px from the line, within tolerance
    const shape = makeFreehandShape();
    const state = makeState({ shapes: [shape] });

    const actions = SelectTool.onPointerDown(state, makeCtx(100, 102));

    expect(actions).toHaveLength(2);
    const selectAction = actions[0]!;
    if (selectAction.type !== 'SELECT_SHAPE') throw new Error('expected SELECT_SHAPE');
    expect(selectAction.id).toBe('freehand-hit');
    const dragAction = actions[1]!;
    if (dragAction.type !== 'START_DRAG') throw new Error('expected START_DRAG');
    expect(dragAction.mode).toBe('move');
  });

  it('returns SELECT_SHAPE(null) + END_DRAG when clicking far from the freehand body', () => {
    // Click at (100, 150) — 50px from the horizontal polyline
    const shape = makeFreehandShape();
    const state = makeState({ shapes: [shape] });

    const actions = SelectTool.onPointerDown(state, makeCtx(100, 150));

    expect(actions).toHaveLength(2);
    const selectAction = actions[0]!;
    if (selectAction.type !== 'SELECT_SHAPE') throw new Error('expected SELECT_SHAPE');
    expect(selectAction.id).toBeNull();
  });
});

// ─── onPointerMove() — move freehand ─────────────────────────────────────────

describe('onPointerMove() — move freehand shape', () => {
  it('returns UPDATE_SHAPE with all translated points', () => {
    const shape: FreehandShape = {
      type: 'freehand',
      id: 'freehand-move',
      points: [
        [50, 100],
        [100, 100],
        [150, 100],
      ],
      stroke: '#3b82f6',
      strokeWidth: 4,
    };

    const stateAfterDragStart = makeState({
      shapes: [shape],
      selectDragState: {
        mode: 'move',
        shapeId: 'freehand-move',
        handle: null,
        startImageX: 100,
        startImageY: 100,
        startShape: shape,
      },
    });

    // Move 10px right, 5px down
    const moveActions = SelectTool.onPointerMove(stateAfterDragStart, makeCtx(110, 105));

    expect(moveActions).toHaveLength(1);
    const action = moveActions[0]!;
    if (action.type !== 'UPDATE_SHAPE') throw new Error('expected UPDATE_SHAPE');
    const updatedShape = action.shape;
    if (updatedShape.type !== 'freehand') throw new Error('expected freehand shape');
    // Each point translated by (10, 5)
    expect(updatedShape.points[0]).toEqual([60, 105]);
    expect(updatedShape.points[1]).toEqual([110, 105]);
    expect(updatedShape.points[2]).toEqual([160, 105]);
  });
});
