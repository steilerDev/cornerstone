/**
 * Unit tests for HighlightTool.ts
 *
 * Story #1473: Photo Annotator Foundation
 *
 * Tests pointer event sequences for the Highlight drawing tool:
 *   - onPointerDown: creates zero-size highlight draft at pointer position
 *   - onPointerMove: updates draft with normalized rect
 *   - onPointerUp: commits if size >= 2x2; discards if smaller
 *
 * Same pattern as RectangleTool but shape type is 'highlight' and has no strokeWidth.
 *
 * nanoid is mapped to a CJS stub in jest.config.ts (moduleNameMapper: nanoid -> nanoidMock.cjs).
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { HighlightTool } from './HighlightTool.js';
import type { AnnotatorState } from '../useAnnotator.js';
import type { PointerContext } from './SelectTool.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeState(overrides: Partial<AnnotatorState> = {}): AnnotatorState {
  return {
    shapes: [],
    draftShape: null,
    selectedShapeId: null,
    selectedTool: 'highlight',
    activeColor: '#facc15',
    activeStrokeWidthKey: 'medium',
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

function makeCtx(imageX: number, imageY: number): PointerContext {
  return {
    imageX,
    imageY,
    imageWidth: 800,
    imageHeight: 600,
    event: {} as React.PointerEvent<SVGSVGElement>,
  };
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('HighlightTool', () => {
  // Reset module-level drawState between tests
  beforeEach(() => {
    const state = makeState();
    const ctx = makeCtx(0, 0);
    HighlightTool.onPointerDown(state, ctx);
    HighlightTool.onPointerUp(makeState({ draftShape: null }), ctx);
  });

  describe('onPointerDown()', () => {
    it('returns a SET_DRAFT action', () => {
      const actions = HighlightTool.onPointerDown(makeState(), makeCtx(50, 60));
      expect(actions).toHaveLength(1);
      expect(actions[0]!.type).toBe('SET_DRAFT');
    });

    it('draft shape has type "highlight"', () => {
      const actions = HighlightTool.onPointerDown(makeState(), makeCtx(50, 60));
      const action = actions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      expect(action.shape?.type).toBe('highlight');
    });

    it('draft shape is positioned at pointer location', () => {
      const actions = HighlightTool.onPointerDown(makeState(), makeCtx(100, 150));
      const action = actions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      const shape = action.shape;
      if (!shape || shape.type !== 'highlight') throw new Error('expected highlight');
      expect(shape.x).toBe(100);
      expect(shape.y).toBe(150);
    });

    it('draft shape starts with zero dimensions', () => {
      const actions = HighlightTool.onPointerDown(makeState(), makeCtx(100, 150));
      const action = actions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      const shape = action.shape;
      if (!shape || shape.type !== 'highlight') throw new Error('expected highlight');
      expect(shape.w).toBe(0);
      expect(shape.h).toBe(0);
    });

    it('draft shape uses the active color', () => {
      const state = makeState({ activeColor: '#22c55e' });
      const actions = HighlightTool.onPointerDown(state, makeCtx(50, 50));
      const action = actions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      const shape = action.shape;
      if (!shape || shape.type !== 'highlight') throw new Error('expected highlight');
      expect(shape.color).toBe('#22c55e');
    });

    it('draft shape does NOT have a strokeWidth property', () => {
      const actions = HighlightTool.onPointerDown(makeState(), makeCtx(50, 50));
      const action = actions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      // Highlight shapes have no strokeWidth — only rectangles do
      expect(action.shape).not.toHaveProperty('strokeWidth');
    });

    it('draft shape has a non-empty id', () => {
      const actions = HighlightTool.onPointerDown(makeState(), makeCtx(50, 50));
      const action = actions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      expect(action.shape?.id).toBeTruthy();
    });
  });

  describe('onPointerMove()', () => {
    it('returns SET_DRAFT with normalized rect when drawState is active', () => {
      const state = makeState();
      const downActions = HighlightTool.onPointerDown(state, makeCtx(50, 60));
      const draftShape = downActions[0]!.type === 'SET_DRAFT' ? downActions[0]!.shape : null;

      const moveActions = HighlightTool.onPointerMove(makeState({ draftShape }), makeCtx(150, 160));

      expect(moveActions).toHaveLength(1);
      expect(moveActions[0]!.type).toBe('SET_DRAFT');
    });

    it('normalizes rect dimensions correctly during move', () => {
      const state = makeState();
      const downActions = HighlightTool.onPointerDown(state, makeCtx(50, 60));
      const draftShape = downActions[0]!.type === 'SET_DRAFT' ? downActions[0]!.shape : null;

      const moveActions = HighlightTool.onPointerMove(makeState({ draftShape }), makeCtx(100, 110));

      const action = moveActions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      const shape = action.shape;
      if (!shape || shape.type !== 'highlight') throw new Error('expected highlight');
      expect(shape.x).toBe(50);
      expect(shape.y).toBe(60);
      expect(shape.w).toBe(50);
      expect(shape.h).toBe(50);
    });

    it('handles reversed drag direction (normalizes correctly)', () => {
      const state = makeState();
      const downActions = HighlightTool.onPointerDown(state, makeCtx(100, 100));
      const draftShape = downActions[0]!.type === 'SET_DRAFT' ? downActions[0]!.shape : null;

      const moveActions = HighlightTool.onPointerMove(makeState({ draftShape }), makeCtx(50, 60));

      const action = moveActions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      const shape = action.shape;
      if (!shape || shape.type !== 'highlight') throw new Error('expected highlight');
      expect(shape.x).toBe(50);
      expect(shape.y).toBe(60);
      expect(shape.w).toBe(50);
      expect(shape.h).toBe(40);
    });

    it('returns empty array when draftShape is null (no active draw)', () => {
      HighlightTool.onPointerUp(makeState({ draftShape: null }), makeCtx(0, 0));

      const actions = HighlightTool.onPointerMove(
        makeState({ draftShape: null }),
        makeCtx(100, 100),
      );
      expect(actions).toHaveLength(0);
    });

    it('preserves highlight type in updated draft', () => {
      const state = makeState();
      const downActions = HighlightTool.onPointerDown(state, makeCtx(50, 60));
      const draftShape = downActions[0]!.type === 'SET_DRAFT' ? downActions[0]!.shape : null;

      const moveActions = HighlightTool.onPointerMove(makeState({ draftShape }), makeCtx(150, 160));

      const action = moveActions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      expect(action.shape?.type).toBe('highlight');
    });
  });

  describe('onPointerUp()', () => {
    it('returns COMMIT_DRAFT when draft area is >= 2x2', () => {
      const state = makeState();
      const downActions = HighlightTool.onPointerDown(state, makeCtx(50, 60));
      const draftShape0 = downActions[0]!.type === 'SET_DRAFT' ? downActions[0]!.shape : null;

      const moveActions = HighlightTool.onPointerMove(
        makeState({ draftShape: draftShape0 }),
        makeCtx(100, 110),
      );
      const largeDraft = moveActions[0]!.type === 'SET_DRAFT' ? moveActions[0]!.shape : null;

      const upActions = HighlightTool.onPointerUp(
        makeState({ draftShape: largeDraft }),
        makeCtx(100, 110),
      );

      expect(upActions).toHaveLength(1);
      expect(upActions[0]!.type).toBe('COMMIT_DRAFT');
    });

    it('returns SET_DRAFT(null) when draft area is < 2x2 (too small)', () => {
      HighlightTool.onPointerDown(makeState(), makeCtx(50, 60));

      const tinyDraft = {
        type: 'highlight' as const,
        id: 'tiny-hl',
        x: 50,
        y: 60,
        w: 1,
        h: 1,
        color: '#facc15',
      };

      const upActions = HighlightTool.onPointerUp(
        makeState({ draftShape: tinyDraft }),
        makeCtx(50, 60),
      );

      expect(upActions).toHaveLength(1);
      const action = upActions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      expect(action.shape).toBeNull();
    });

    it('commits exactly at 2x2 (at threshold)', () => {
      HighlightTool.onPointerDown(makeState(), makeCtx(50, 60));

      const draftAtThreshold = {
        type: 'highlight' as const,
        id: 'hl-threshold',
        x: 50,
        y: 60,
        w: 2,
        h: 2,
        color: '#facc15',
      };

      const upActions = HighlightTool.onPointerUp(
        makeState({ draftShape: draftAtThreshold }),
        makeCtx(52, 62),
      );

      expect(upActions[0]!.type).toBe('COMMIT_DRAFT');
    });

    it('returns empty array when draftShape is null on pointer up', () => {
      const upActions = HighlightTool.onPointerUp(
        makeState({ draftShape: null }),
        makeCtx(100, 100),
      );
      expect(upActions).toHaveLength(0);
    });
  });

  describe('cursor', () => {
    it('has cursor "crosshair"', () => {
      expect(HighlightTool.cursor).toBe('crosshair');
    });
  });
});
