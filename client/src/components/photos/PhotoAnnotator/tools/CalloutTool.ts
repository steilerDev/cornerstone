import { nanoid } from 'nanoid';
import type { AnnotatorState, AnnotatorAction } from '../useAnnotator.js';
import type { CalloutShape } from '../useUndoStack.js';
import { normalizeRect, clamp } from '../geometry.js';
import { resolveFontSize, resolveStrokeWidth } from '../annotationConstants.js';
import type { PointerContext, ToolHandler } from './SelectTool.js';

type CalloutPhase = 'box' | 'tail' | null;

let phase: CalloutPhase = null;
let drawState: { startX: number; startY: number } | null = null;
let pendingId: string | null = null;

export const CalloutTool: ToolHandler = {
  onPointerDown: (state: AnnotatorState, ctx: PointerContext): AnnotatorAction[] => {
    const { imageX, imageY, imageWidth, imageHeight } = ctx;

    if (phase === null) {
      // Phase 1: Start box drag
      phase = 'box';
      drawState = { startX: imageX, startY: imageY };
      pendingId = nanoid();

      const fontSize = resolveFontSize(state.activeFontSizeKey, imageWidth, imageHeight);
      const strokeWidth = resolveStrokeWidth(state.activeStrokeWidthKey, imageWidth, imageHeight);

      const draft: CalloutShape = {
        type: 'callout',
        id: pendingId,
        x: imageX,
        y: imageY,
        w: 0,
        h: 0,
        text: '',
        tailX: imageX,
        tailY: imageY + 40, // initial tail below box
        stroke: state.activeColor,
        fill: state.activeColor,
        fontSize,
        color: state.activeColor,
        strokeWidth,
      };
      return [{ type: 'SET_DRAFT', shape: draft }];
    }

    if (phase === 'tail') {
      // Phase 2: pointerDown during tail positioning — update tail
      if (!state.draftShape) {
        phase = null;
        return [];
      }
      const updated: CalloutShape = {
        ...(state.draftShape as CalloutShape),
        tailX: clamp(imageX, 0, ctx.imageWidth),
        tailY: clamp(imageY, 0, ctx.imageHeight),
      };
      return [{ type: 'SET_DRAFT', shape: updated }];
    }

    return [];
  },

  onPointerMove: (state: AnnotatorState, ctx: PointerContext): AnnotatorAction[] => {
    if (!state.draftShape || !drawState) return [];
    const { imageX, imageY } = ctx;

    if (phase === 'box') {
      const normalized = normalizeRect(drawState.startX, drawState.startY, imageX, imageY);
      const updated: CalloutShape = { ...(state.draftShape as CalloutShape), ...normalized };
      return [{ type: 'SET_DRAFT', shape: updated }];
    }

    if (phase === 'tail') {
      const updated: CalloutShape = {
        ...(state.draftShape as CalloutShape),
        tailX: clamp(imageX, 0, ctx.imageWidth),
        tailY: clamp(imageY, 0, ctx.imageHeight),
      };
      return [{ type: 'SET_DRAFT', shape: updated }];
    }

    return [];
  },

  onPointerUp: (state: AnnotatorState, ctx: PointerContext): AnnotatorAction[] => {
    if (!state.draftShape) {
      phase = null;
      return [];
    }

    if (phase === 'box') {
      const shape = state.draftShape as CalloutShape;
      if (shape.w < 20 || shape.h < 16) {
        // Too small — abort
        phase = null;
        drawState = null;
        pendingId = null;
        return [{ type: 'SET_DRAFT', shape: null }];
      }
      // Transition to tail phase
      phase = 'tail';
      // Set initial tail below the box center
      const tailX = shape.x + shape.w / 2;
      const tailY = clamp(shape.y + shape.h + 40, 0, ctx.imageHeight);
      const updated: CalloutShape = { ...shape, tailX, tailY };
      return [{ type: 'SET_DRAFT', shape: updated }];
    }

    if (phase === 'tail') {
      // Phase 2 complete — open inline input
      phase = null;
      drawState = null;
      ctx.onOpenInlineInput?.(
        (state.draftShape as CalloutShape).x,
        (state.draftShape as CalloutShape).y,
      );
      // Do NOT commit yet — host commits after text entry
      return [];
    }

    return [];
  },

  cursor: 'crosshair',
};

/** Reset module-level state (used by tests and by Escape during phase 2) */
export function resetCalloutTool(): void {
  phase = null;
  drawState = null;
  pendingId = null;
}

/** Expose current phase for host component to query */
export function getCalloutPhase(): CalloutPhase {
  return phase;
}
