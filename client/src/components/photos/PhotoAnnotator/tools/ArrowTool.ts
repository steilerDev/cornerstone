import { nanoid } from 'nanoid';
import type { AnnotatorState, AnnotatorAction } from '../useAnnotator.js';
import type { ArrowShape } from '../useUndoStack.js';
import { distance } from '../geometry.js';
import { resolveStrokeWidth } from '../annotationConstants.js';
import type { PointerContext, ToolHandler } from './SelectTool.js';

let drawState: {
  startX: number;
  startY: number;
} | null = null;

export const ArrowTool: ToolHandler = {
  onPointerDown: (state: AnnotatorState, ctx: PointerContext): AnnotatorAction[] => {
    const { imageX, imageY, imageWidth, imageHeight } = ctx;

    drawState = { startX: imageX, startY: imageY };

    const strokeWidth = resolveStrokeWidth(state.activeStrokeWidthKey, imageWidth, imageHeight);

    const newShape: ArrowShape = {
      type: 'arrow',
      id: nanoid(),
      x1: imageX,
      y1: imageY,
      x2: imageX,
      y2: imageY,
      stroke: state.activeColor,
      strokeWidth,
    };

    return [{ type: 'SET_DRAFT', shape: newShape }];
  },

  onPointerMove: (state: AnnotatorState, ctx: PointerContext): AnnotatorAction[] => {
    if (!drawState || !state.draftShape) {
      return [];
    }

    const { imageX, imageY } = ctx;

    const updatedDraft: ArrowShape = {
      ...(state.draftShape as ArrowShape),
      x2: imageX,
      y2: imageY,
    };

    return [{ type: 'SET_DRAFT', shape: updatedDraft }];
  },

  onPointerUp: (state: AnnotatorState, ctx: PointerContext): AnnotatorAction[] => {
    drawState = null;

    if (!state.draftShape) {
      return [];
    }

    const shape = state.draftShape as ArrowShape;

    // Only commit if the total length is >= 2px
    if (distance(shape.x1, shape.y1, shape.x2, shape.y2) >= 2) {
      return [{ type: 'COMMIT_DRAFT' }];
    }

    // Otherwise, clear the draft
    return [{ type: 'SET_DRAFT', shape: null }];
  },

  cursor: 'crosshair',
};
