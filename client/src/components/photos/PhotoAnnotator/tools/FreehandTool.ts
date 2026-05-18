import { nanoid } from 'nanoid';
import type { AnnotatorState, AnnotatorAction } from '../useAnnotator.js';
import type { FreehandShape } from '../useUndoStack.js';
import { simplifyPolyline } from '../simplify.js';
import { ANNOTATION_STROKE_WIDTHS } from '../annotationConstants.js';
import type { PointerContext, ToolHandler } from './SelectTool.js';

// All captured points from the current gesture (never throttled — always updated)
let capturedPoints: [number, number][] = [];

// Snapshot of the current draft shape ID
let currentDraftId: string | null = null;

export const FreehandTool: ToolHandler = {
  onPointerDown: (state: AnnotatorState, ctx: PointerContext): AnnotatorAction[] => {
    const { imageX, imageY } = ctx;

    capturedPoints = [[imageX, imageY]];
    currentDraftId = nanoid();

    const strokeWidth = state.activeStrokeWidthKey
      ? ANNOTATION_STROKE_WIDTHS[state.activeStrokeWidthKey]
      : ANNOTATION_STROKE_WIDTHS.medium;

    const newShape: FreehandShape = {
      type: 'freehand',
      id: currentDraftId,
      points: capturedPoints.slice(),
      stroke: state.activeColor,
      strokeWidth,
    };

    return [{ type: 'SET_DRAFT', shape: newShape }];
  },

  onPointerMove: (state: AnnotatorState, ctx: PointerContext): AnnotatorAction[] => {
    if (!currentDraftId || !state.draftShape) return [];

    const { imageX, imageY } = ctx;

    // Always capture the point — never drop pointermove events
    capturedPoints.push([imageX, imageY]);

    // Return synchronous SET_DRAFT with current captured points
    const updatedDraft: FreehandShape = {
      ...(state.draftShape as FreehandShape),
      points: capturedPoints.slice(),
    };

    return [{ type: 'SET_DRAFT', shape: updatedDraft }];
  },

  onPointerUp: (state: AnnotatorState, _ctx: PointerContext): AnnotatorAction[] => {
    currentDraftId = null;

    if (!state.draftShape) return [];

    const shape = state.draftShape as FreehandShape;

    // Apply RDP simplification
    const simplified = simplifyPolyline(capturedPoints);
    capturedPoints = [];

    // Discard if fewer than 2 points remain (degenerate tap)
    if (simplified.length < 2) {
      return [{ type: 'SET_DRAFT', shape: null }];
    }

    // Update draft with simplified points and commit
    const finalShape: FreehandShape = { ...shape, points: simplified };
    return [{ type: 'SET_DRAFT', shape: finalShape }, { type: 'COMMIT_DRAFT' }];
  },

  cursor: 'crosshair',
};

/** Reset module-level state (used by tests) */
export function resetFreehandTool(): void {
  capturedPoints = [];
  currentDraftId = null;
}
