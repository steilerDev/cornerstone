import { nanoid } from 'nanoid';
import type { AnnotatorState, AnnotatorAction } from '../useAnnotator.js';
import type { RectangleShape } from '../useUndoStack.js';
import { normalizeRect } from '../geometry.js';
import { resolveStrokeWidth } from '../annotationConstants.js';
import type { PointerContext, ToolHandler } from './SelectTool.js';

let drawState: {
  startX: number;
  startY: number;
} | null = null;

export const RectangleTool: ToolHandler = {
  onPointerDown: (state: AnnotatorState, ctx: PointerContext): AnnotatorAction[] => {
    const { imageX, imageY, imageWidth, imageHeight } = ctx;

    drawState = { startX: imageX, startY: imageY };

    const strokeWidth = resolveStrokeWidth(
      state.activeStrokeWidthKey,
      imageWidth,
      imageHeight,
    );

    const newShape: RectangleShape = {
      type: 'rectangle',
      id: nanoid(),
      x: imageX,
      y: imageY,
      w: 0,
      h: 0,
      color: state.activeColor,
      strokeWidth,
    };

    return [{ type: 'SET_DRAFT', shape: newShape }];
  },

  onPointerMove: (state: AnnotatorState, ctx: PointerContext): AnnotatorAction[] => {
    if (!drawState || !state.draftShape) {
      return [];
    }

    const { imageX, imageY } = ctx;
    const normalized = normalizeRect(drawState.startX, drawState.startY, imageX, imageY);

    const updatedDraft: RectangleShape = {
      ...(state.draftShape as RectangleShape),
      ...normalized,
    };

    return [{ type: 'SET_DRAFT', shape: updatedDraft }];
  },

  onPointerUp: (state: AnnotatorState, ctx: PointerContext): AnnotatorAction[] => {
    drawState = null;

    if (!state.draftShape) {
      return [];
    }

    const shape = state.draftShape as RectangleShape;

    // Only commit if the shape has non-zero dimensions (at least 2×2 pixels)
    if (shape.w >= 2 && shape.h >= 2) {
      return [{ type: 'COMMIT_DRAFT' }];
    }

    // Otherwise, clear the draft
    return [{ type: 'SET_DRAFT', shape: null }];
  },

  cursor: 'crosshair',
};
