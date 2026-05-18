/**
 * Unit tests for ArrowTool.ts
 *
 * Story #1475: Photo Annotator — Geometric Tools (Arrow, Line, Ellipse)
 *
 * Tests pointer event sequences for the Arrow drawing tool:
 *   - onPointerDown: creates zero-length draft at pointer position
 *   - onPointerMove: updates draft x2/y2 endpoint
 *   - onPointerUp: commits when distance >= 2px; discards if shorter
 *
 * nanoid is mapped to a CJS stub in jest.config.ts (moduleNameMapper: nanoid -> nanoidMock.cjs)
 * so ArrowTool can be statically imported despite nanoid being ESM-only.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { ArrowTool } from './ArrowTool.js';
import type { AnnotatorState } from '../useAnnotator.js';
import type { PointerContext } from './SelectTool.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeState(overrides: Partial<AnnotatorState> = {}): AnnotatorState {
  return {
    shapes: [],
    draftShape: null,
    selectedShapeId: null,
    selectedTool: 'arrow',
    activeColor: '#dc2626',
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

function makeCtx(imageX: number, imageY: number, shiftKey = false): PointerContext {
  return {
    imageX,
    imageY,
    imageWidth: 800,
    imageHeight: 600,
    event: { shiftKey } as React.PointerEvent<SVGSVGElement>,
  };
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('ArrowTool', () => {
  // Reset module-level drawState between tests by completing a full gesture
  beforeEach(() => {
    const state = makeState();
    const ctx = makeCtx(0, 0);
    ArrowTool.onPointerDown(state, ctx);
    ArrowTool.onPointerUp(makeState({ draftShape: null }), ctx);
  });

  describe('onPointerDown()', () => {
    it('returns a SET_DRAFT action', () => {
      const state = makeState();
      const ctx = makeCtx(50, 60);
      const actions = ArrowTool.onPointerDown(state, ctx);

      expect(actions).toHaveLength(1);
      expect(actions[0]!.type).toBe('SET_DRAFT');
    });

    it('draft shape has type "arrow"', () => {
      const actions = ArrowTool.onPointerDown(makeState(), makeCtx(50, 60));
      const action = actions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      expect(action.shape?.type).toBe('arrow');
    });

    it('draft starts with x1===x2===imageX and y1===y2===imageY', () => {
      const actions = ArrowTool.onPointerDown(makeState(), makeCtx(120, 80));
      const action = actions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      const shape = action.shape;
      if (!shape || shape.type !== 'arrow') throw new Error('expected arrow');
      expect(shape.x1).toBe(120);
      expect(shape.y1).toBe(80);
      expect(shape.x2).toBe(120);
      expect(shape.y2).toBe(80);
    });

    it('draft uses activeColor for stroke', () => {
      const state = makeState({ activeColor: '#3b82f6' });
      const actions = ArrowTool.onPointerDown(state, makeCtx(50, 50));
      const action = actions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      const shape = action.shape;
      if (!shape || shape.type !== 'arrow') throw new Error('expected arrow');
      expect(shape.stroke).toBe('#3b82f6');
    });

    it('draft strokeWidth is 2 for "thin" activeStrokeWidthKey', () => {
      const state = makeState({ activeStrokeWidthKey: 'thin' });
      const actions = ArrowTool.onPointerDown(state, makeCtx(50, 50));
      const action = actions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      const shape = action.shape;
      if (!shape || shape.type !== 'arrow') throw new Error('expected arrow');
      expect(shape.strokeWidth).toBe(2);
    });

    it('draft strokeWidth is 4 for "medium" activeStrokeWidthKey', () => {
      const state = makeState({ activeStrokeWidthKey: 'medium' });
      const actions = ArrowTool.onPointerDown(state, makeCtx(50, 50));
      const action = actions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      const shape = action.shape;
      if (!shape || shape.type !== 'arrow') throw new Error('expected arrow');
      expect(shape.strokeWidth).toBe(4);
    });

    it('draft strokeWidth is 8 for "thick" activeStrokeWidthKey', () => {
      const state = makeState({ activeStrokeWidthKey: 'thick' });
      const actions = ArrowTool.onPointerDown(state, makeCtx(50, 50));
      const action = actions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      const shape = action.shape;
      if (!shape || shape.type !== 'arrow') throw new Error('expected arrow');
      expect(shape.strokeWidth).toBe(8);
    });

    it('draft has a non-empty id', () => {
      const actions = ArrowTool.onPointerDown(makeState(), makeCtx(50, 50));
      const action = actions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      expect(action.shape?.id).toBeTruthy();
    });

    it('falls back to strokeWidth 4 when activeStrokeWidthKey is falsy', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const state = makeState({ activeStrokeWidthKey: '' as any });
      const actions = ArrowTool.onPointerDown(state, makeCtx(50, 50));
      const action = actions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      const shape = action.shape;
      if (!shape || shape.type !== 'arrow') throw new Error('expected arrow');
      expect(shape.strokeWidth).toBe(4);
    });
  });

  describe('onPointerMove()', () => {
    it('returns SET_DRAFT with updated x2/y2 when draw state is active', () => {
      const downActions = ArrowTool.onPointerDown(makeState(), makeCtx(50, 60));
      const draftShape = downActions[0]!.type === 'SET_DRAFT' ? downActions[0]!.shape : null;

      const moveActions = ArrowTool.onPointerMove(makeState({ draftShape }), makeCtx(150, 160));

      expect(moveActions).toHaveLength(1);
      expect(moveActions[0]!.type).toBe('SET_DRAFT');
    });

    it('updates x2 and y2 to the current pointer position', () => {
      const downActions = ArrowTool.onPointerDown(makeState(), makeCtx(50, 60));
      const draftShape = downActions[0]!.type === 'SET_DRAFT' ? downActions[0]!.shape : null;

      const moveActions = ArrowTool.onPointerMove(makeState({ draftShape }), makeCtx(200, 180));

      const action = moveActions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      const shape = action.shape;
      if (!shape || shape.type !== 'arrow') throw new Error('expected arrow');
      expect(shape.x2).toBe(200);
      expect(shape.y2).toBe(180);
    });

    it('preserves x1/y1 (start point) during move', () => {
      const downActions = ArrowTool.onPointerDown(makeState(), makeCtx(50, 60));
      const draftShape = downActions[0]!.type === 'SET_DRAFT' ? downActions[0]!.shape : null;

      const moveActions = ArrowTool.onPointerMove(makeState({ draftShape }), makeCtx(200, 180));

      const action = moveActions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      const shape = action.shape;
      if (!shape || shape.type !== 'arrow') throw new Error('expected arrow');
      expect(shape.x1).toBe(50);
      expect(shape.y1).toBe(60);
    });

    it('returns empty array when draftShape is null (no active draw)', () => {
      // Ensure drawState is cleared
      ArrowTool.onPointerUp(makeState({ draftShape: null }), makeCtx(0, 0));

      const actions = ArrowTool.onPointerMove(makeState({ draftShape: null }), makeCtx(100, 100));
      expect(actions).toHaveLength(0);
    });
  });

  describe('onPointerUp()', () => {
    it('returns COMMIT_DRAFT when distance(x1,y1,x2,y2) >= 2', () => {
      const downActions = ArrowTool.onPointerDown(makeState(), makeCtx(50, 60));
      const draftShape0 = downActions[0]!.type === 'SET_DRAFT' ? downActions[0]!.shape : null;

      // Move to create a 100px horizontal arrow (distance=100 >= 2)
      const moveActions = ArrowTool.onPointerMove(
        makeState({ draftShape: draftShape0 }),
        makeCtx(150, 60),
      );
      const largeDraft = moveActions[0]!.type === 'SET_DRAFT' ? moveActions[0]!.shape : null;

      const upActions = ArrowTool.onPointerUp(
        makeState({ draftShape: largeDraft }),
        makeCtx(150, 60),
      );

      expect(upActions).toHaveLength(1);
      expect(upActions[0]!.type).toBe('COMMIT_DRAFT');
    });

    it('returns SET_DRAFT(null) when distance < 2 (arrow too short)', () => {
      ArrowTool.onPointerDown(makeState(), makeCtx(50, 60));

      // Arrow with length 1 (below threshold)
      const shortArrow = {
        type: 'arrow' as const,
        id: 'short',
        x1: 50,
        y1: 60,
        x2: 51,
        y2: 60,
        stroke: '#dc2626',
        strokeWidth: 4,
      };

      const upActions = ArrowTool.onPointerUp(
        makeState({ draftShape: shortArrow }),
        makeCtx(51, 60),
      );

      expect(upActions).toHaveLength(1);
      const action = upActions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      expect(action.shape).toBeNull();
    });

    it('commits exactly at distance=2 (at threshold)', () => {
      ArrowTool.onPointerDown(makeState(), makeCtx(50, 60));

      const atThreshold = {
        type: 'arrow' as const,
        id: 'threshold',
        x1: 50,
        y1: 60,
        x2: 52,
        y2: 60,
        stroke: '#dc2626',
        strokeWidth: 4,
      };

      const upActions = ArrowTool.onPointerUp(
        makeState({ draftShape: atThreshold }),
        makeCtx(52, 60),
      );

      expect(upActions[0]!.type).toBe('COMMIT_DRAFT');
    });

    it('returns empty array when draftShape is null on pointer up', () => {
      const upActions = ArrowTool.onPointerUp(makeState({ draftShape: null }), makeCtx(100, 100));
      expect(upActions).toHaveLength(0);
    });
  });

  describe('cursor', () => {
    it('has cursor "crosshair"', () => {
      expect(ArrowTool.cursor).toBe('crosshair');
    });
  });
});
