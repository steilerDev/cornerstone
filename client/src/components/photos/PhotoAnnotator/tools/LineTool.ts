import { nanoid } from 'nanoid';
import type { AnnotatorState, AnnotatorAction } from '../useAnnotator.js';
import type { LineShape } from '../useUndoStack.js';
import { distance } from '../geometry.js';
import type { PointerContext, ToolHandler } from './SelectTool.js';

let drawState: {
  startX: number;
  startY: number;
} | null = null;

/**
 * Snap angle to the nearest 45° increment (0°, 45°, 90°, 135°, 180°, 225°, 270°, 315°).
 */
function snapTo45(x1: number, y1: number, x2: number, y2: number): { x2: number; y2: number } {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = distance(x1, y1, x2, y2);

  if (len === 0) {
    return { x2, y2 };
  }

  const angle = Math.atan2(dy, dx);

  // Round to nearest 45° (π/4 radians)
  const snappedAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);

  const snappedX2 = x1 + len * Math.cos(snappedAngle);
  const snappedY2 = y1 + len * Math.sin(snappedAngle);

  return { x2: snappedX2, y2: snappedY2 };
}

export const LineTool: ToolHandler = {
  onPointerDown: (state: AnnotatorState, ctx: PointerContext): AnnotatorAction[] => {
    const { imageX, imageY } = ctx;

    drawState = { startX: imageX, startY: imageY };

    const newShape: LineShape = {
      type: 'line',
      id: nanoid(),
      x1: imageX,
      y1: imageY,
      x2: imageX,
      y2: imageY,
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
    const shape = state.draftShape as LineShape;

    let x2 = imageX;
    let y2 = imageY;

    // Shift-constrain to 45° increments
    if (event.shiftKey) {
      const snapped = snapTo45(shape.x1, shape.y1, imageX, imageY);
      x2 = snapped.x2;
      y2 = snapped.y2;
    }

    const updatedDraft: LineShape = {
      ...shape,
      x2,
      y2,
    };

    return [{ type: 'SET_DRAFT', shape: updatedDraft }];
  },

  onPointerUp: (state: AnnotatorState, ctx: PointerContext): AnnotatorAction[] => {
    drawState = null;

    if (!state.draftShape) {
      return [];
    }

    const shape = state.draftShape as LineShape;

    // Only commit if the total length is >= 2px
    if (distance(shape.x1, shape.y1, shape.x2, shape.y2) >= 2) {
      return [{ type: 'COMMIT_DRAFT' }];
    }

    // Otherwise, clear the draft
    return [{ type: 'SET_DRAFT', shape: null }];
  },

  cursor: 'crosshair',
};
