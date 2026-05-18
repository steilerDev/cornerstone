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

import { describe, it, expect, beforeEach } from '@jest/globals';
import { SelectTool } from './SelectTool.js';
import type { AnnotatorState } from '../useAnnotator.js';
import type { AnnotationShape, ArrowShape, LineShape, EllipseShape } from '../useUndoStack.js';
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
