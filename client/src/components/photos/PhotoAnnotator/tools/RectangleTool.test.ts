/**
 * Unit tests for RectangleTool.ts
 *
 * Story #1473: Photo Annotator Foundation
 *
 * Tests pointer event sequences for the Rectangle drawing tool:
 *   - onPointerDown: creates zero-size draft at pointer position
 *   - onPointerMove: updates draft with normalized rect
 *   - onPointerUp: commits if size >= 2x2; discards if smaller
 *
 * nanoid is mapped to a CJS stub in jest.config.ts (moduleNameMapper: nanoid -> nanoidMock.cjs)
 * so RectangleTool can be statically imported despite nanoid being ESM-only.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { RectangleTool } from './RectangleTool.js';
import type { AnnotatorState } from '../useAnnotator.js';
import type { PointerContext } from './SelectTool.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeState(overrides: Partial<AnnotatorState> = {}): AnnotatorState {
  return {
    shapes: [],
    draftShape: null,
    selectedShapeId: null,
    selectedTool: 'rectangle',
    activeColor: '#dc2626',
    activeStrokeWidthKey: 'medium',
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

describe('RectangleTool', () => {
  // Reset module-level drawState between tests by simulating a complete pointer gesture
  beforeEach(() => {
    const state = makeState();
    const ctx = makeCtx(0, 0);
    RectangleTool.onPointerDown(state, ctx);
    RectangleTool.onPointerUp(makeState({ draftShape: null }), ctx);
  });

  describe('onPointerDown()', () => {
    it('returns a SET_DRAFT action', () => {
      const state = makeState();
      const ctx = makeCtx(50, 60);
      const actions = RectangleTool.onPointerDown(state, ctx);

      expect(actions).toHaveLength(1);
      expect(actions[0]!.type).toBe('SET_DRAFT');
    });

    it('draft shape has type "rectangle"', () => {
      const state = makeState();
      const actions = RectangleTool.onPointerDown(state, makeCtx(50, 60));
      const action = actions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      expect(action.shape?.type).toBe('rectangle');
    });

    it('draft shape is positioned at pointer location', () => {
      const state = makeState();
      const actions = RectangleTool.onPointerDown(state, makeCtx(100, 150));
      const action = actions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      expect(action.shape?.x).toBe(100);
      expect(action.shape?.y).toBe(150);
    });

    it('draft shape starts with zero dimensions', () => {
      const state = makeState();
      const actions = RectangleTool.onPointerDown(state, makeCtx(100, 150));
      const action = actions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      expect(action.shape?.w).toBe(0);
      expect(action.shape?.h).toBe(0);
    });

    it('draft shape uses the active color', () => {
      const state = makeState({ activeColor: '#3b82f6' });
      const actions = RectangleTool.onPointerDown(state, makeCtx(50, 50));
      const action = actions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      expect(action.shape?.color).toBe('#3b82f6');
    });

    it('draft shape uses strokeWidth 4 for "medium" activeStrokeWidthKey', () => {
      const state = makeState({ activeStrokeWidthKey: 'medium' });
      const actions = RectangleTool.onPointerDown(state, makeCtx(50, 50));
      const action = actions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      const shape = action.shape;
      if (!shape || shape.type !== 'rectangle') throw new Error('expected rectangle');
      expect(shape.strokeWidth).toBe(4);
    });

    it('draft shape uses strokeWidth 2 for "thin" activeStrokeWidthKey', () => {
      const state = makeState({ activeStrokeWidthKey: 'thin' });
      const actions = RectangleTool.onPointerDown(state, makeCtx(50, 50));
      const action = actions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      const shape = action.shape;
      if (!shape || shape.type !== 'rectangle') throw new Error('expected rectangle');
      expect(shape.strokeWidth).toBe(2);
    });

    it('draft shape uses strokeWidth 8 for "thick" activeStrokeWidthKey', () => {
      const state = makeState({ activeStrokeWidthKey: 'thick' });
      const actions = RectangleTool.onPointerDown(state, makeCtx(50, 50));
      const action = actions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      const shape = action.shape;
      if (!shape || shape.type !== 'rectangle') throw new Error('expected rectangle');
      expect(shape.strokeWidth).toBe(8);
    });

    it('draft shape has a non-empty id', () => {
      const state = makeState();
      const actions = RectangleTool.onPointerDown(state, makeCtx(50, 50));
      const action = actions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      expect(action.shape?.id).toBeTruthy();
    });

    it('falls back to strokeWidth 4 when activeStrokeWidthKey is falsy', () => {
      // Force an invalid strokeWidthKey to exercise the fallback branch
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const state = makeState({ activeStrokeWidthKey: '' as any });
      const actions = RectangleTool.onPointerDown(state, makeCtx(50, 50));
      const action = actions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      const shape = action.shape;
      if (!shape || shape.type !== 'rectangle') throw new Error('expected rectangle');
      expect(shape.strokeWidth).toBe(4);
    });
  });

  describe('onPointerMove()', () => {
    it('returns SET_DRAFT with normalized rect when drawState is active', () => {
      const state = makeState();
      const downCtx = makeCtx(50, 60);

      // Start a draw operation
      const downActions = RectangleTool.onPointerDown(state, downCtx);
      const draftShape = downActions[0]!.type === 'SET_DRAFT' ? downActions[0].shape : null;

      const moveActions = RectangleTool.onPointerMove(
        makeState({ draftShape }),
        makeCtx(150, 160),
      );

      expect(moveActions).toHaveLength(1);
      expect(moveActions[0]!.type).toBe('SET_DRAFT');
    });

    it('normalizes rect dimensions correctly during move', () => {
      const state = makeState();
      const downActions = RectangleTool.onPointerDown(state, makeCtx(50, 60));
      const draftShape = downActions[0]!.type === 'SET_DRAFT' ? downActions[0].shape : null;

      const moveActions = RectangleTool.onPointerMove(
        makeState({ draftShape }),
        makeCtx(100, 110),
      );

      const action = moveActions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      expect(action.shape?.x).toBe(50);
      expect(action.shape?.y).toBe(60);
      expect(action.shape?.w).toBe(50);
      expect(action.shape?.h).toBe(50);
    });

    it('handles reversed drag direction (normalizes correctly)', () => {
      const state = makeState();
      // Start draw at (100, 100)
      const downActions = RectangleTool.onPointerDown(state, makeCtx(100, 100));
      const draftShape = downActions[0]!.type === 'SET_DRAFT' ? downActions[0].shape : null;

      // Move to a point above and to the left of start
      const moveActions = RectangleTool.onPointerMove(
        makeState({ draftShape }),
        makeCtx(50, 60),
      );

      const action = moveActions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      expect(action.shape?.x).toBe(50);
      expect(action.shape?.y).toBe(60);
      expect(action.shape?.w).toBe(50);
      expect(action.shape?.h).toBe(40);
    });

    it('returns empty array when draftShape is null (no active draw)', () => {
      // Ensure drawState is cleared by completing a gesture
      RectangleTool.onPointerUp(makeState({ draftShape: null }), makeCtx(0, 0));

      const actions = RectangleTool.onPointerMove(
        makeState({ draftShape: null }),
        makeCtx(100, 100),
      );
      expect(actions).toHaveLength(0);
    });
  });

  describe('onPointerUp()', () => {
    it('returns COMMIT_DRAFT when draft area is >= 2x2', () => {
      const state = makeState();
      // Start drawing at (50, 60)
      const downActions = RectangleTool.onPointerDown(state, makeCtx(50, 60));
      const draftShape0 = downActions[0]!.type === 'SET_DRAFT' ? downActions[0].shape : null;

      // Move to create a 50x50 shape
      const moveActions = RectangleTool.onPointerMove(
        makeState({ draftShape: draftShape0 }),
        makeCtx(100, 110),
      );
      const largeDraft = moveActions[0]!.type === 'SET_DRAFT' ? moveActions[0].shape : null;

      const upActions = RectangleTool.onPointerUp(
        makeState({ draftShape: largeDraft }),
        makeCtx(100, 110),
      );

      expect(upActions).toHaveLength(1);
      expect(upActions[0]!.type).toBe('COMMIT_DRAFT');
    });

    it('returns SET_DRAFT(null) when draft area is < 2x2 (too small)', () => {
      const state = makeState();
      RectangleTool.onPointerDown(state, makeCtx(50, 60));

      const tinyDraft = {
        type: 'rectangle' as const,
        id: 'tiny',
        x: 50,
        y: 60,
        w: 1,
        h: 1,
        color: '#dc2626',
        strokeWidth: 4,
      };

      const upActions = RectangleTool.onPointerUp(
        makeState({ draftShape: tinyDraft }),
        makeCtx(50, 60),
      );

      expect(upActions).toHaveLength(1);
      const action = upActions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      expect(action.shape).toBeNull();
    });

    it('commits exactly at 2x2 (at threshold)', () => {
      const state = makeState();
      RectangleTool.onPointerDown(state, makeCtx(50, 60));

      const draftAtThreshold = {
        type: 'rectangle' as const,
        id: 'exactly-threshold',
        x: 50,
        y: 60,
        w: 2,
        h: 2,
        color: '#dc2626',
        strokeWidth: 4,
      };

      const upActions = RectangleTool.onPointerUp(
        makeState({ draftShape: draftAtThreshold }),
        makeCtx(52, 62),
      );

      expect(upActions[0]!.type).toBe('COMMIT_DRAFT');
    });

    it('returns empty array when draftShape is null on pointer up', () => {
      const upActions = RectangleTool.onPointerUp(
        makeState({ draftShape: null }),
        makeCtx(100, 100),
      );
      expect(upActions).toHaveLength(0);
    });
  });

  describe('cursor', () => {
    it('has cursor "crosshair"', () => {
      expect(RectangleTool.cursor).toBe('crosshair');
    });
  });
});
