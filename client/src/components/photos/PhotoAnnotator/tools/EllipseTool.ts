import { nanoid } from 'nanoid';
import type { AnnotatorState, AnnotatorAction } from '../useAnnotator.js';
import type { EllipseShape } from '../useUndoStack.js';
import type { PointerContext, ToolHandler } from './SelectTool.js';

let drawState: {
  startX: number;
  startY: number;
} | null = null;

export const EllipseTool: ToolHandler = {
  onPointerDown: (state: AnnotatorState, ctx: PointerContext): AnnotatorAction[] => {
    const { imageX, imageY } = ctx;

    drawState = { startX: imageX, startY: imageY };

    const newShape: EllipseShape = {
      type: 'ellipse',
      id: nanoid(),
      cx: imageX,
      cy: imageY,
      rx: 0,
      ry: 0,
      stroke: state.activeColor,
      strokeWidth: state.activeStrokeWidthKey
        ? (
            {
              thin: 2,
              medium: 4,
              thick: 8,
            } as const
          )[state.activeStrokeWidthKey]
        : 4,
    };

    return [{ type: 'SET_DRAFT', shape: newShape }];
  },

  onPointerMove: (state: AnnotatorState, ctx: PointerContext): AnnotatorAction[] => {
    if (!drawState || !state.draftShape) {
      return [];
    }

    const { imageX, imageY, event } = ctx;
    const shape = state.draftShape as EllipseShape;

    const dx = Math.abs(imageX - drawState.startX);
    const dy = Math.abs(imageY - drawState.startY);

    let rx = dx;
    let ry = dy;

    // Shift-constrain to circle (equal radii)
    if (event.shiftKey) {
      const r = Math.max(dx, dy);
      rx = r;
      ry = r;
    }

    const updatedDraft: EllipseShape = {
      ...shape,
      cx: drawState.startX + dx / 2,
      cy: drawState.startY + dy / 2,
      rx,
      ry,
    };

    return [{ type: 'SET_DRAFT', shape: updatedDraft }];
  },

  onPointerUp: (state: AnnotatorState, ctx: PointerContext): AnnotatorAction[] => {
    drawState = null;

    if (!state.draftShape) {
      return [];
    }

    const shape = state.draftShape as EllipseShape;

    // Only commit if both rx and ry are >= 1
    if (shape.rx >= 1 && shape.ry >= 1) {
      return [{ type: 'COMMIT_DRAFT' }];
    }

    // Otherwise, clear the draft
    return [{ type: 'SET_DRAFT', shape: null }];
  },

  cursor: 'crosshair',
};
