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

// State for tracking drag operations (stored as a closure variable, not in React state)
let dragState: {
  mode: 'move' | 'resize' | null;
  shapeId: string | null;
  handle: HandlePosition | null;
  startImageX: number;
  startImageY: number;
  startShape: AnnotationShape | null;
} = {
  mode: null,
  shapeId: null,
  handle: null,
  startImageX: 0,
  startImageY: 0,
  startShape: null,
};

export const SelectTool: ToolHandler = {
  onPointerDown: (state: AnnotatorState, ctx: PointerContext): AnnotatorAction[] => {
    const { imageX, imageY, imageWidth, imageHeight } = ctx;

    // Reset drag state
    dragState = {
      mode: null,
      shapeId: null,
      handle: null,
      startImageX: imageX,
      startImageY: imageY,
      startShape: null,
    };

    // Hit-test shapes in reverse order (top to bottom)
    for (let i = state.shapes.length - 1; i >= 0; i--) {
      const shape = state.shapes[i]!;

      // Check for handle hit first
      const handleHit = hitTestHandles(imageX, imageY, shape, 8);
      if (handleHit) {
        dragState = {
          mode: 'resize',
          shapeId: shape.id,
          handle: handleHit,
          startImageX: imageX,
          startImageY: imageY,
          startShape: shape,
        };
        return [{ type: 'SELECT_SHAPE', id: shape.id }];
      }

      // Then check for body hit
      let bodyHit = false;
      if (shape.type === 'rectangle') {
        bodyHit = hitTestRectangle(imageX, imageY, shape, shape.strokeWidth, 0) !== null;
      } else if (shape.type === 'highlight') {
        bodyHit = hitTestHighlight(imageX, imageY, shape);
      }

      if (bodyHit) {
        dragState = {
          mode: 'move',
          shapeId: shape.id,
          handle: null,
          startImageX: imageX,
          startImageY: imageY,
          startShape: shape,
        };
        return [{ type: 'SELECT_SHAPE', id: shape.id }];
      }
    }

    // No hit: deselect
    return [{ type: 'SELECT_SHAPE', id: null }];
  },

  onPointerMove: (state: AnnotatorState, ctx: PointerContext): AnnotatorAction[] => {
    if (!dragState.mode || !dragState.shapeId || !dragState.startShape) {
      return [];
    }

    const { imageX, imageY, imageWidth, imageHeight } = ctx;
    const dx = imageX - dragState.startImageX;
    const dy = imageY - dragState.startImageY;

    let updatedShape: AnnotationShape;

    if (dragState.mode === 'move') {
      const moved = translateShape(dragState.startShape, dx, dy, imageWidth, imageHeight);
      updatedShape = { ...dragState.startShape, ...moved };
    } else {
      // resize
      const resized = resizeShape(
        dragState.startShape,
        dragState.handle!,
        dx,
        dy,
        imageWidth,
        imageHeight,
      );
      updatedShape = { ...dragState.startShape, ...resized };
    }

    // Use 'replace' to avoid adding undo step during drag
    return [{ type: 'UPDATE_SHAPE', shape: updatedShape }];
  },

  onPointerUp: (state: AnnotatorState, ctx: PointerContext): AnnotatorAction[] => {
    if (!dragState.mode || !dragState.shapeId) {
      dragState = {
        mode: null,
        shapeId: null,
        handle: null,
        startImageX: 0,
        startImageY: 0,
        startShape: null,
      };
      return [];
    }

    // Commit final position to undo stack
    const selectedShape = state.shapes.find((s) => s.id === dragState.shapeId);
    if (selectedShape) {
      dragState = {
        mode: null,
        shapeId: null,
        handle: null,
        startImageX: 0,
        startImageY: 0,
        startShape: null,
      };
      return []; // Update_SHAPE already did the move; commit via undoStack in PhotoAnnotator
    }

    dragState = {
      mode: null,
      shapeId: null,
      handle: null,
      startImageX: 0,
      startImageY: 0,
      startShape: null,
    };
    return [];
  },

  cursor: 'default',
};
