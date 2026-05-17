import type { AnnotatorState, AnnotatorAction } from '../useAnnotator.js';
import type { AnnotationShape } from '../useUndoStack.js';
import {
  hitTestRectangle,
  hitTestHighlight,
  hitTestHandles,
  type HandlePosition,
  translateShape,
  resizeShape,
} from '../geometry.js';

export interface PointerContext {
  imageX: number;
  imageY: number;
  imageWidth: number;
  imageHeight: number;
  event: React.PointerEvent<SVGSVGElement>;
}

export interface ToolHandler {
  onPointerDown: (state: AnnotatorState, ctx: PointerContext) => AnnotatorAction[];
  onPointerMove: (state: AnnotatorState, ctx: PointerContext) => AnnotatorAction[];
  onPointerUp: (state: AnnotatorState, ctx: PointerContext) => AnnotatorAction[];
  cursor: string;
}


export const SelectTool: ToolHandler = {
  onPointerDown: (state: AnnotatorState, ctx: PointerContext): AnnotatorAction[] => {
    const { imageX, imageY, imageWidth, imageHeight } = ctx;

    // Hit-test shapes in reverse order (top to bottom)
    for (let i = state.shapes.length - 1; i >= 0; i--) {
      const shape = state.shapes[i]!;

      // Check for handle hit first
      const handleHit = hitTestHandles(imageX, imageY, shape, 8);
      if (handleHit) {
        return [
          { type: 'SELECT_SHAPE', id: shape.id },
          {
            type: 'START_DRAG',
            mode: 'resize',
            shapeId: shape.id,
            handle: handleHit,
            imageX,
            imageY,
            shape,
          },
        ];
      }

      // Then check for body hit
      let bodyHit = false;
      if (shape.type === 'rectangle') {
        bodyHit = hitTestRectangle(imageX, imageY, shape, shape.strokeWidth, 0) !== null;
      } else if (shape.type === 'highlight') {
        bodyHit = hitTestHighlight(imageX, imageY, shape);
      }

      if (bodyHit) {
        return [
          { type: 'SELECT_SHAPE', id: shape.id },
          {
            type: 'START_DRAG',
            mode: 'move',
            shapeId: shape.id,
            handle: null,
            imageX,
            imageY,
            shape,
          },
        ];
      }
    }

    // No hit: deselect and end any drag
    return [
      { type: 'SELECT_SHAPE', id: null },
      { type: 'END_DRAG' },
    ];
  },

  onPointerMove: (state: AnnotatorState, ctx: PointerContext): AnnotatorAction[] => {
    const { selectDragState } = state;

    if (!selectDragState.mode || !selectDragState.shapeId || !selectDragState.startShape) {
      return [];
    }

    const { imageX, imageY, imageWidth, imageHeight } = ctx;
    const dx = imageX - selectDragState.startImageX;
    const dy = imageY - selectDragState.startImageY;

    let updatedShape: AnnotationShape;

    if (selectDragState.mode === 'move') {
      const moved = translateShape(selectDragState.startShape, dx, dy, imageWidth, imageHeight);
      updatedShape = { ...selectDragState.startShape, ...moved };
    } else {
      // resize
      const resized = resizeShape(
        selectDragState.startShape,
        selectDragState.handle as HandlePosition,
        dx,
        dy,
        imageWidth,
        imageHeight,
      );
      updatedShape = { ...selectDragState.startShape, ...resized };
    }

    // Use 'replace' to avoid adding undo step during drag
    return [{ type: 'UPDATE_SHAPE', shape: updatedShape }];
  },

  onPointerUp: (state: AnnotatorState, ctx: PointerContext): AnnotatorAction[] => {
    const { selectDragState } = state;

    if (!selectDragState.mode || !selectDragState.shapeId) {
      return [{ type: 'END_DRAG' }];
    }

    // Commit final position to undo stack
    const selectedShape = state.shapes.find((s) => s.id === selectDragState.shapeId);
    if (selectedShape) {
      return [{ type: 'END_DRAG' }]; // UPDATE_SHAPE already did the move; commit via undoStack in PhotoAnnotator
    }

    return [{ type: 'END_DRAG' }];
  },

  cursor: 'default',
};
