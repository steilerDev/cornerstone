/**
 * Unit tests for TextTool.ts
 *
 * Story #1476: Photo Annotator — Text-based Tools (Text, Callout)
 *
 * Tests the tap-to-place lifecycle of the TextTool handler:
 *   - onPointerDown calls onOpenInlineInput with image coordinates
 *   - onPointerDown returns an empty actions array (no draft shape created)
 *   - onPointerDown is safe when no callback is provided
 *   - onPointerMove and onPointerUp always return empty arrays
 *   - cursor is "text"
 */

import { describe, it, expect, jest } from '@jest/globals';
import { TextTool } from './TextTool.js';
import type { AnnotatorState } from '../useAnnotator.js';
import type { PointerContext } from './SelectTool.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeState(overrides: Partial<AnnotatorState> = {}): AnnotatorState {
  return {
    shapes: [],
    draftShape: null,
    selectedShapeId: null,
    selectedTool: 'text',
    activeColor: '#dc2626',
    activeStrokeWidthKey: 'medium',
    activeFontSizeKey: 'medium',
    selectDragState: {
      mode: null,
      shapeId: null,
      handle: null,
      startImageX: 0,
      startImageY: 0,
      startShape: null,
    },
    ...overrides,
  };
}

function makeCtx(
  imageX: number,
  imageY: number,
  extra: Partial<PointerContext> = {},
): PointerContext {
  return {
    imageX,
    imageY,
    imageWidth: 800,
    imageHeight: 600,
    event: {} as React.PointerEvent<SVGSVGElement>,
    ...extra,
  };
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('TextTool', () => {
  describe('onPointerDown()', () => {
    it('returns an empty actions array (no draft shape produced)', () => {
      const actions = TextTool.onPointerDown(makeState(), makeCtx(100, 150));
      expect(actions).toHaveLength(0);
    });

    it('calls onOpenInlineInput with the image-space coordinates', () => {
      const onOpenInlineInput = jest.fn() as jest.MockedFunction<(x: number, y: number) => void>;
      const actions = TextTool.onPointerDown(makeState(), makeCtx(200, 300, { onOpenInlineInput }));
      expect(onOpenInlineInput).toHaveBeenCalledTimes(1);
      expect(onOpenInlineInput).toHaveBeenCalledWith(200, 300);
      // Still returns no actions
      expect(actions).toHaveLength(0);
    });

    it('passes imageX = 0 correctly to onOpenInlineInput', () => {
      const onOpenInlineInput = jest.fn() as jest.MockedFunction<(x: number, y: number) => void>;
      TextTool.onPointerDown(makeState(), makeCtx(0, 50, { onOpenInlineInput }));
      expect(onOpenInlineInput).toHaveBeenCalledWith(0, 50);
    });

    it('does NOT throw when onOpenInlineInput callback is not provided', () => {
      expect(() => {
        TextTool.onPointerDown(makeState(), makeCtx(100, 150));
      }).not.toThrow();
    });

    it('does not use activeFontSizeKey to produce a draft shape (shape created on commit only)', () => {
      const state = makeState({ activeFontSizeKey: 'xlarge' });
      const actions = TextTool.onPointerDown(state, makeCtx(50, 50));
      // No SET_DRAFT actions — text tool does not create a draft
      const setDraftActions = actions.filter((a) => a.type === 'SET_DRAFT');
      expect(setDraftActions).toHaveLength(0);
    });

    it('works with fractional image coordinates', () => {
      const onOpenInlineInput = jest.fn() as jest.MockedFunction<(x: number, y: number) => void>;
      TextTool.onPointerDown(makeState(), makeCtx(100.5, 200.75, { onOpenInlineInput }));
      expect(onOpenInlineInput).toHaveBeenCalledWith(100.5, 200.75);
    });
  });

  describe('onPointerMove()', () => {
    it('always returns an empty actions array', () => {
      const actions = TextTool.onPointerMove(makeState(), makeCtx(100, 150));
      expect(actions).toHaveLength(0);
    });

    it('returns empty array even with a draft shape in state', () => {
      const state = makeState({
        draftShape: {
          type: 'text',
          id: 'text-1',
          x: 50,
          y: 50,
          text: '',
          fontSize: 18,
          color: '#dc2626',
        },
      });
      const actions = TextTool.onPointerMove(state, makeCtx(200, 200));
      expect(actions).toHaveLength(0);
    });
  });

  describe('onPointerUp()', () => {
    it('always returns an empty actions array', () => {
      const actions = TextTool.onPointerUp(makeState(), makeCtx(100, 150));
      expect(actions).toHaveLength(0);
    });

    it('returns empty array even with a draft shape in state', () => {
      const state = makeState({
        draftShape: {
          type: 'text',
          id: 'text-1',
          x: 50,
          y: 50,
          text: '',
          fontSize: 18,
          color: '#dc2626',
        },
      });
      const actions = TextTool.onPointerUp(state, makeCtx(200, 200));
      expect(actions).toHaveLength(0);
    });
  });

  describe('cursor', () => {
    it('has cursor "text"', () => {
      expect(TextTool.cursor).toBe('text');
    });
  });
});
