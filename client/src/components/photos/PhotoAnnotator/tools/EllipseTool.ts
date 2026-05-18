import { nanoid } from 'nanoid';
import type { AnnotatorState, AnnotatorAction } from '../useAnnotator.js';
import type { EllipseShape } from '../useUndoStack.js';
import { resolveStrokeWidth } from '../annotationConstants.js';
import type { PointerContext, ToolHandler } from './SelectTool.js';

let drawState: {
  startX: number;
  startY: number;
} | null = null;

export const EllipseTool: ToolHandler = {
  onPointerDown: (state: AnnotatorState, ctx: PointerContext): AnnotatorAction[] => {
    const { imageX, imageY, imageWidth, imageHeight } = ctx;

    drawState = { startX: imageX, startY: imageY };

    const strokeWidth = resolveStrokeWidth(state.activeStrokeWidthKey, imageWidth, imageHeight);

    const newShape: EllipseShape = {
      type: 'ellipse',
      id: nanoid(),
      cx: imageX,
      cy: imageY,
      rx: 0,
      ry: 0,
      stroke: state.activeColor,
      strokeWidth,
    };

    return [{ type: 'SET_DRAFT', shape: newShape }];
  },

  onPointerMove: (state: AnnotatorState, ctx: PointerContext): AnnotatorAction[] => {
    if (!drawState || !state.draftShape) {
      return [];
    }

    const { imageX, imageY, event } = ctx;
    const shape = state.draftShape as EllipseShape;

    const dxRaw = imageX - drawState.startX;
    const dyRaw = imageY - drawState.startY;

    let rx = Math.abs(dxRaw) / 2;
    let ry = Math.abs(dyRaw) / 2;
    let cx = drawState.startX + dxRaw / 2;
    let cy = drawState.startY + dyRaw / 2;

    // Shift-constrain to circle (equal radii)
    if (event.shiftKey) {
      const r = Math.max(rx, ry);
      rx = r;
      ry = r;
      // Re-anchor center: keep start point on the bounding square, extend in the drag direction
      const signX = dxRaw >= 0 ? 1 : -1;
      const signY = dyRaw >= 0 ? 1 : -1;
      cx = drawState.startX + signX * r;
      cy = drawState.startY + signY * r;
    }

    const updatedDraft: EllipseShape = {
      ...shape,
      cx,
      cy,
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
