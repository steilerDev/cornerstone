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
import type { AnnotationShape } from '../useUndoStack.js';
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
      const actions = SelectTool.onPointerMove(
        makeState({ shapes: [] }),
        makeCtx(100, 100),
      );

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
      expect(action.shape.x).toBe(30);
      expect(action.shape.y).toBe(30);
      expect(action.shape.id).toBe('movable');
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
      const upActions = SelectTool.onPointerUp(
        makeState({ shapes: [] }),
        makeCtx(100, 100),
      );
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
});
