import { nanoid } from 'nanoid';
import type { AnnotatorState, AnnotatorAction } from '../useAnnotator.js';
import type { HighlightShape } from '../useUndoStack.js';
import { normalizeRect } from '../geometry.js';
import type { PointerContext, ToolHandler } from './SelectTool.js';

let drawState: {
  startX: number;
  startY: number;
} | null = null;

export const HighlightTool: ToolHandler = {
  onPointerDown: (state: AnnotatorState, ctx: PointerContext): AnnotatorAction[] => {
    const { imageX, imageY } = ctx;

    drawState = { startX: imageX, startY: imageY };

    const newShape: HighlightShape = {
      type: 'highlight',
      id: nanoid(),
      x: imageX,
      y: imageY,
      w: 0,
      h: 0,
      color: state.activeColor,
    };

    return [{ type: 'SET_DRAFT', shape: newShape }];
  },

  onPointerMove: (state: AnnotatorState, ctx: PointerContext): AnnotatorAction[] => {
    if (!drawState || !state.draftShape) {
      return [];
    }

    const { imageX, imageY } = ctx;
    const normalized = normalizeRect(drawState.startX, drawState.startY, imageX, imageY);

    const updatedDraft: HighlightShape = {
      ...(state.draftShape as HighlightShape),
      ...normalized,
    };

    return [{ type: 'SET_DRAFT', shape: updatedDraft }];
  },

  onPointerUp: (state: AnnotatorState, ctx: PointerContext): AnnotatorAction[] => {
    drawState = null;

    if (!state.draftShape) {
      return [];
    }

    // Only commit if the shape has non-zero dimensions (at least 2×2 pixels)
    if (state.draftShape.w >= 2 && state.draftShape.h >= 2) {
      return [{ type: 'COMMIT_DRAFT' }];
    }

    // Otherwise, clear the draft
    return [{ type: 'SET_DRAFT', shape: null }];
  },

  cursor: 'crosshair',
};
