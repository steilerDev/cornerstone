import type { AnnotatorState, AnnotatorAction } from '../useAnnotator.js';
import type { PointerContext, ToolHandler } from './SelectTool.js';

export const TextTool: ToolHandler = {
  onPointerDown: (state: AnnotatorState, ctx: PointerContext): AnnotatorAction[] => {
    const { imageX, imageY, onOpenInlineInput } = ctx;
    // Signal the host to open the floating input at this image-space location.
    // The host will create the TextShape after the user commits text.
    onOpenInlineInput?.(imageX, imageY);
    return [];
  },

  onPointerMove: (_state, _ctx): AnnotatorAction[] => [],
  onPointerUp: (_state, _ctx): AnnotatorAction[] => [],

  cursor: 'text',
};
