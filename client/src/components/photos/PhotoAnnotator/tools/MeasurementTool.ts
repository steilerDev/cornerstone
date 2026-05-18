import { nanoid } from 'nanoid';
import type { AnnotatorState, AnnotatorAction } from '../useAnnotator.js';
import type { MeasurementShape } from '../useUndoStack.js';
import { distance } from '../geometry.js';
import { resolveStrokeWidth, resolveFontSize } from '../annotationConstants.js';
import type { PointerContext, ToolHandler } from './SelectTool.js';

let drawState: {
  startX: number;
  startY: number;
} | null = null;

export const MeasurementTool: ToolHandler = {
  onPointerDown: (state: AnnotatorState, ctx: PointerContext): AnnotatorAction[] => {
    const { imageX, imageY, imageWidth, imageHeight } = ctx;

    drawState = { startX: imageX, startY: imageY };

    const strokeWidth = resolveStrokeWidth(
      state.activeStrokeWidthKey,
      imageWidth,
      imageHeight,
    );
    const fontSize = resolveFontSize(state.activeFontSizeKey, imageWidth, imageHeight);

    const newShape: MeasurementShape = {
      type: 'measurement',
      id: nanoid(),
      x1: imageX,
      y1: imageY,
      x2: imageX,
      y2: imageY,
      label: '',
      stroke: state.activeColor,
      strokeWidth,
      fontSize,
      color: state.activeColor,
    };

    return [{ type: 'SET_DRAFT', shape: newShape }];
  },

  onPointerMove: (state: AnnotatorState, ctx: PointerContext): AnnotatorAction[] => {
    if (!drawState || !state.draftShape) return [];

    const { imageX, imageY } = ctx;

    const updatedDraft: MeasurementShape = {
      ...(state.draftShape as MeasurementShape),
      x2: imageX,
      y2: imageY,
    };

    return [{ type: 'SET_DRAFT', shape: updatedDraft }];
  },

  onPointerUp: (state: AnnotatorState, ctx: PointerContext): AnnotatorAction[] => {
    drawState = null;

    if (!state.draftShape) return [];

    const shape = state.draftShape as MeasurementShape;

    // Discard if too short (same threshold as ArrowTool)
    if (distance(shape.x1, shape.y1, shape.x2, shape.y2) < 2) {
      return [{ type: 'SET_DRAFT', shape: null }];
    }

    // Open inline input at midpoint — host commits after label entry
    const midX = (shape.x1 + shape.x2) / 2;
    const midY = (shape.y1 + shape.y2) / 2;
    ctx.onOpenInlineInput?.(midX, midY);
    // Do NOT commit yet — host commits after user enters label
    return [];
  },

  cursor: 'crosshair',
};

/** Reset module-level state (used by tests) */
export function resetMeasurementTool(): void {
  drawState = null;
}
