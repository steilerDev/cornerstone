import type { AnnotatorState, AnnotatorAction } from '../useAnnotator.js';
import type { AnnotationShape } from '../useUndoStack.js';
import {
  hitTestRectangle,
  hitTestHighlight,
  hitTestHandles,
  hitTestLine,
  hitTestEllipse,
  hitTestEndpointHandles,
  hitTestCardinalHandles,
  hitTestText,
  hitTestCallout,
  hitTestTailHandle,
  type HandlePosition,
  translateShape,
  resizeShape,
  translateArrowLine,
  resizeArrowLine,
  translateEllipse,
  resizeEllipse,
  translateText,
  translateCallout,
  translateTailAnchor,
} from '../geometry.js';

export interface PointerContext {
  imageX: number;
  imageY: number;
  imageWidth: number;
  imageHeight: number;
  event: React.PointerEvent<SVGSVGElement>;
  // Callbacks for tools that open the inline text editor
  onOpenInlineInput?: (imageX: number, imageY: number, shapeId?: string) => void;
  onCommitEdit?: (shapeId: string) => void;
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

      // Double-click: edit text and callout shapes
      if (ctx.event.detail === 2 && (shape.type === 'text' || shape.type === 'callout')) {
        const bodyHit = shape.type === 'text'
          ? hitTestText(imageX, imageY, shape, 4)
          : hitTestCallout(imageX, imageY, shape);
        if (bodyHit) {
          ctx.onOpenInlineInput?.(shape.x, shape.y, shape.id);
          return [{ type: 'SELECT_SHAPE', id: shape.id }];
        }
      }

      // Check for handle hit first (only for rect/highlight and arrow/line/ellipse/callout)
      let handleHit: string | null = null;

      if (shape.type === 'rectangle' || shape.type === 'highlight') {
        handleHit = hitTestHandles(imageX, imageY, shape, 8);
      } else if (shape.type === 'arrow' || shape.type === 'line') {
        handleHit = hitTestEndpointHandles(
          imageX,
          imageY,
          shape.x1,
          shape.y1,
          shape.x2,
          shape.y2,
          8,
        );
      } else if (shape.type === 'ellipse') {
        handleHit = hitTestCardinalHandles(
          imageX,
          imageY,
          shape.cx,
          shape.cy,
          shape.rx,
          shape.ry,
          8,
        );
      } else if (shape.type === 'callout') {
        handleHit = hitTestTailHandle(imageX, imageY, shape.tailX, shape.tailY, 8) ? 'tail' : null;
      }

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
      } else if (shape.type === 'arrow' || shape.type === 'line') {
        bodyHit = hitTestLine(imageX, imageY, shape.x1, shape.y1, shape.x2, shape.y2, 4) !== null;
      } else if (shape.type === 'ellipse') {
        bodyHit =
          hitTestEllipse(
            imageX,
            imageY,
            shape.cx,
            shape.cy,
            shape.rx,
            shape.ry,
            shape.strokeWidth,
            0,
          ) !== null;
      } else if (shape.type === 'text') {
        bodyHit = hitTestText(imageX, imageY, shape, 4);
      } else if (shape.type === 'callout') {
        bodyHit = handleHit ? false : hitTestCallout(imageX, imageY, shape);
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
    return [{ type: 'SELECT_SHAPE', id: null }, { type: 'END_DRAG' }];
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
    const startShape = selectDragState.startShape;

    if (selectDragState.mode === 'move') {
      if (startShape.type === 'rectangle' || startShape.type === 'highlight') {
        const moved = translateShape(startShape, dx, dy, imageWidth, imageHeight);
        updatedShape = { ...startShape, ...moved };
      } else if (startShape.type === 'arrow' || startShape.type === 'line') {
        const moved = translateArrowLine(
          startShape.x1,
          startShape.y1,
          startShape.x2,
          startShape.y2,
          dx,
          dy,
          imageWidth,
          imageHeight,
        );
        updatedShape = { ...startShape, ...moved };
      } else if (startShape.type === 'ellipse') {
        const moved = translateEllipse(
          startShape.cx,
          startShape.cy,
          startShape.rx,
          startShape.ry,
          dx,
          dy,
          imageWidth,
          imageHeight,
        );
        updatedShape = { ...startShape, ...moved };
      } else if (startShape.type === 'text') {
        const moved = translateText(startShape, dx, dy, imageWidth, imageHeight);
        updatedShape = { ...startShape, ...moved };
      } else if (startShape.type === 'callout') {
        const moved = translateCallout(startShape, dx, dy, imageWidth, imageHeight);
        updatedShape = { ...startShape, ...moved };
      } else {
        updatedShape = startShape;
      }
    } else {
      // resize
      if (startShape.type === 'rectangle' || startShape.type === 'highlight') {
        const resized = resizeShape(
          startShape,
          selectDragState.handle as HandlePosition,
          dx,
          dy,
          imageWidth,
          imageHeight,
        );
        updatedShape = { ...startShape, ...resized };
      } else if (startShape.type === 'arrow' || startShape.type === 'line') {
        const resized = resizeArrowLine(
          startShape.x1,
          startShape.y1,
          startShape.x2,
          startShape.y2,
          selectDragState.handle as 'start' | 'end',
          dx,
          dy,
          imageWidth,
          imageHeight,
        );
        updatedShape = { ...startShape, ...resized };
      } else if (startShape.type === 'ellipse') {
        const resized = resizeEllipse(
          startShape.cx,
          startShape.cy,
          startShape.rx,
          startShape.ry,
          selectDragState.handle as 'north' | 'south' | 'east' | 'west',
          dx,
          dy,
          imageWidth,
          imageHeight,
        );
        updatedShape = { ...startShape, ...resized };
      } else if (startShape.type === 'callout' && selectDragState.handle === 'tail') {
        // Tail-only drag
        const newTail = translateTailAnchor(
          startShape.tailX + dx,
          startShape.tailY + dy,
          imageWidth,
          imageHeight,
        );
        updatedShape = { ...startShape, ...newTail };
      } else {
        updatedShape = startShape;
      }
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
