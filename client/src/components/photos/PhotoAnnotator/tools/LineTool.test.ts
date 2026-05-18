/**
 * Unit tests for LineTool.ts
 *
 * Story #1475: Photo Annotator — Geometric Tools (Arrow, Line, Ellipse)
 *
 * Tests pointer event sequences for the Line drawing tool:
 *   - onPointerDown: creates zero-length draft at pointer position
 *   - onPointerMove: updates draft x2/y2; shift-key snaps to 45° increments
 *   - onPointerUp: commits when distance >= 2px; discards if shorter
 *
 * nanoid is mapped to a CJS stub in jest.config.ts (moduleNameMapper: nanoid -> nanoidMock.cjs)
 * so LineTool can be statically imported despite nanoid being ESM-only.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { LineTool } from './LineTool.js';
import { resolveStrokeWidth } from '../annotationConstants.js';
import type { AnnotatorState } from '../useAnnotator.js';
import type { PointerContext } from './SelectTool.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeState(overrides: Partial<AnnotatorState> = {}): AnnotatorState {
  return {
    shapes: [],
    draftShape: null,
    selectedShapeId: null,
    selectedTool: 'line',
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

describe('LineTool', () => {
  // Reset module-level drawState between tests by completing a full gesture
  beforeEach(() => {
    const state = makeState();
    const ctx = makeCtx(0, 0);
    LineTool.onPointerDown(state, ctx);
    LineTool.onPointerUp(makeState({ draftShape: null }), ctx);
  });

  describe('onPointerDown()', () => {
    it('returns a SET_DRAFT action', () => {
      const state = makeState();
      const ctx = makeCtx(50, 60);
      const actions = LineTool.onPointerDown(state, ctx);

      expect(actions).toHaveLength(1);
      expect(actions[0]!.type).toBe('SET_DRAFT');
    });

    it('draft shape has type "line"', () => {
      const actions = LineTool.onPointerDown(makeState(), makeCtx(50, 60));
      const action = actions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      expect(action.shape?.type).toBe('line');
    });

    it('draft starts with x1===x2===imageX and y1===y2===imageY', () => {
      const actions = LineTool.onPointerDown(makeState(), makeCtx(120, 80));
      const action = actions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      const shape = action.shape;
      if (!shape || shape.type !== 'line') throw new Error('expected line');
      expect(shape.x1).toBe(120);
      expect(shape.y1).toBe(80);
      expect(shape.x2).toBe(120);
      expect(shape.y2).toBe(80);
    });

    it('draft uses activeColor for stroke', () => {
      const state = makeState({ activeColor: '#3b82f6' });
      const actions = LineTool.onPointerDown(state, makeCtx(50, 50));
      const action = actions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      const shape = action.shape;
      if (!shape || shape.type !== 'line') throw new Error('expected line');
      expect(shape.stroke).toBe('#3b82f6');
    });

    it('draft strokeWidth is resolved for "thin" activeStrokeWidthKey', () => {
      const state = makeState({ activeStrokeWidthKey: 'thin' });
      const actions = LineTool.onPointerDown(state, makeCtx(50, 50));
      const action = actions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      const shape = action.shape;
      if (!shape || shape.type !== 'line') throw new Error('expected line');
      expect(shape.strokeWidth).toBe(resolveStrokeWidth('thin', 800, 600));
    });

    it('draft strokeWidth is resolved for "medium" activeStrokeWidthKey', () => {
      const state = makeState({ activeStrokeWidthKey: 'medium' });
      const actions = LineTool.onPointerDown(state, makeCtx(50, 50));
      const action = actions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      const shape = action.shape;
      if (!shape || shape.type !== 'line') throw new Error('expected line');
      expect(shape.strokeWidth).toBe(resolveStrokeWidth('medium', 800, 600));
    });

    it('draft strokeWidth is resolved for "thick" activeStrokeWidthKey', () => {
      const state = makeState({ activeStrokeWidthKey: 'thick' });
      const actions = LineTool.onPointerDown(state, makeCtx(50, 50));
      const action = actions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      const shape = action.shape;
      if (!shape || shape.type !== 'line') throw new Error('expected line');
      expect(shape.strokeWidth).toBe(resolveStrokeWidth('thick', 800, 600));
    });

    it('draft has a non-empty id', () => {
      const actions = LineTool.onPointerDown(makeState(), makeCtx(50, 50));
      const action = actions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      expect(action.shape?.id).toBeTruthy();
    });

    it('strokeWidth is a positive number for the default "medium" activeStrokeWidthKey', () => {
      // Verify that the default key produces a valid positive stroke width
      const state = makeState({ activeStrokeWidthKey: 'medium' });
      const actions = LineTool.onPointerDown(state, makeCtx(50, 50));
      const action = actions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      const shape = action.shape;
      if (!shape || shape.type !== 'line') throw new Error('expected line');
      expect(shape.strokeWidth).toBeGreaterThan(0);
      expect(shape.strokeWidth).toBe(resolveStrokeWidth('medium', 800, 600));
    });
  });

  describe('onPointerMove() — without shift', () => {
    it('returns SET_DRAFT with updated x2/y2 when draw state is active', () => {
      const downActions = LineTool.onPointerDown(makeState(), makeCtx(50, 60));
      const draftShape = downActions[0]!.type === 'SET_DRAFT' ? downActions[0]!.shape : null;

      const moveActions = LineTool.onPointerMove(makeState({ draftShape }), makeCtx(150, 160));

      expect(moveActions).toHaveLength(1);
      expect(moveActions[0]!.type).toBe('SET_DRAFT');
    });

    it('updates x2 and y2 to the current pointer position (no shift)', () => {
      const downActions = LineTool.onPointerDown(makeState(), makeCtx(50, 60));
      const draftShape = downActions[0]!.type === 'SET_DRAFT' ? downActions[0]!.shape : null;

      const moveActions = LineTool.onPointerMove(
        makeState({ draftShape }),
        makeCtx(200, 180, false),
      );

      const action = moveActions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      const shape = action.shape;
      if (!shape || shape.type !== 'line') throw new Error('expected line');
      expect(shape.x2).toBe(200);
      expect(shape.y2).toBe(180);
    });

    it('preserves x1/y1 (start point) during move', () => {
      const downActions = LineTool.onPointerDown(makeState(), makeCtx(50, 60));
      const draftShape = downActions[0]!.type === 'SET_DRAFT' ? downActions[0]!.shape : null;

      const moveActions = LineTool.onPointerMove(
        makeState({ draftShape }),
        makeCtx(200, 180, false),
      );

      const action = moveActions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      const shape = action.shape;
      if (!shape || shape.type !== 'line') throw new Error('expected line');
      expect(shape.x1).toBe(50);
      expect(shape.y1).toBe(60);
    });

    it('returns empty array when draftShape is null (no active draw)', () => {
      // Ensure drawState is cleared
      LineTool.onPointerUp(makeState({ draftShape: null }), makeCtx(0, 0));

      const actions = LineTool.onPointerMove(makeState({ draftShape: null }), makeCtx(100, 100));
      expect(actions).toHaveLength(0);
    });
  });

  describe('onPointerMove() — with shift (45° snap)', () => {
    it('snaps to horizontal (0°) for a near-horizontal drag with shiftKey:true', () => {
      // Start at (100, 100), drag mostly right to (200, 105) — near-horizontal
      const downActions = LineTool.onPointerDown(makeState(), makeCtx(100, 100));
      const draftShape = downActions[0]!.type === 'SET_DRAFT' ? downActions[0]!.shape : null;

      // dx=100, dy=5 — angle ≈ 2.9° → snaps to 0° (horizontal)
      const moveActions = LineTool.onPointerMove(
        makeState({ draftShape }),
        makeCtx(200, 105, true),
      );

      const action = moveActions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      const shape = action.shape;
      if (!shape || shape.type !== 'line') throw new Error('expected line');
      // Snapped to horizontal: y2 should equal y1 (100)
      expect(shape.y2).toBeCloseTo(100, 0);
      // x2 advances rightward at the full distance
      expect(shape.x2).toBeGreaterThan(100);
    });

    it('snaps to vertical (90°) for a near-vertical drag with shiftKey:true', () => {
      // Start at (100, 100), drag mostly downward to (105, 200) — near-vertical
      const downActions = LineTool.onPointerDown(makeState(), makeCtx(100, 100));
      const draftShape = downActions[0]!.type === 'SET_DRAFT' ? downActions[0]!.shape : null;

      // dx=5, dy=100 — angle ≈ 87° → snaps to 90° (vertical)
      const moveActions = LineTool.onPointerMove(
        makeState({ draftShape }),
        makeCtx(105, 200, true),
      );

      const action = moveActions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      const shape = action.shape;
      if (!shape || shape.type !== 'line') throw new Error('expected line');
      // Snapped to vertical: x2 should equal x1 (100)
      expect(shape.x2).toBeCloseTo(100, 0);
      // y2 advances downward at the full distance
      expect(shape.y2).toBeGreaterThan(100);
    });

    it('snaps to 45° for an equal-dx-dy drag with shiftKey:true', () => {
      // Start at (100, 100), drag to (200, 200) — exactly 45°
      const downActions = LineTool.onPointerDown(makeState(), makeCtx(100, 100));
      const draftShape = downActions[0]!.type === 'SET_DRAFT' ? downActions[0]!.shape : null;

      const moveActions = LineTool.onPointerMove(
        makeState({ draftShape }),
        makeCtx(200, 200, true),
      );

      const action = moveActions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      const shape = action.shape;
      if (!shape || shape.type !== 'line') throw new Error('expected line');
      // Already at 45° so endpoint should be close to (200, 200)
      expect(shape.x2).toBeCloseTo(200, 0);
      expect(shape.y2).toBeCloseTo(200, 0);
    });

    it('does NOT snap when shiftKey is false', () => {
      // Start at (100, 100), drag to (200, 105) — near-horizontal but no shift
      const downActions = LineTool.onPointerDown(makeState(), makeCtx(100, 100));
      const draftShape = downActions[0]!.type === 'SET_DRAFT' ? downActions[0]!.shape : null;

      const moveActions = LineTool.onPointerMove(
        makeState({ draftShape }),
        makeCtx(200, 105, false),
      );

      const action = moveActions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      const shape = action.shape;
      if (!shape || shape.type !== 'line') throw new Error('expected line');
      // Without snap, y2 should remain at 105 (not snapped to 100)
      expect(shape.x2).toBe(200);
      expect(shape.y2).toBe(105);
    });

    it('handles zero-length move with shiftKey:true (no division by zero)', () => {
      // Start at (100, 100), move to exactly (100, 100) — zero-length, shift on
      const downActions = LineTool.onPointerDown(makeState(), makeCtx(100, 100));
      const draftShape = downActions[0]!.type === 'SET_DRAFT' ? downActions[0]!.shape : null;

      const moveActions = LineTool.onPointerMove(
        makeState({ draftShape }),
        makeCtx(100, 100, true),
      );

      const action = moveActions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      const shape = action.shape;
      if (!shape || shape.type !== 'line') throw new Error('expected line');
      // Zero-length guard returns the pointer position unchanged
      expect(shape.x2).toBe(100);
      expect(shape.y2).toBe(100);
    });
  });

  describe('onPointerUp()', () => {
    it('returns COMMIT_DRAFT when distance >= 2', () => {
      const downActions = LineTool.onPointerDown(makeState(), makeCtx(50, 60));
      const draftShape0 = downActions[0]!.type === 'SET_DRAFT' ? downActions[0]!.shape : null;

      // Move to create a 100px horizontal line
      const moveActions = LineTool.onPointerMove(
        makeState({ draftShape: draftShape0 }),
        makeCtx(150, 60),
      );
      const largeDraft = moveActions[0]!.type === 'SET_DRAFT' ? moveActions[0]!.shape : null;

      const upActions = LineTool.onPointerUp(
        makeState({ draftShape: largeDraft }),
        makeCtx(150, 60),
      );

      expect(upActions).toHaveLength(1);
      expect(upActions[0]!.type).toBe('COMMIT_DRAFT');
    });

    it('returns SET_DRAFT(null) when distance < 2 (line too short)', () => {
      LineTool.onPointerDown(makeState(), makeCtx(50, 60));

      const shortLine = {
        type: 'line' as const,
        id: 'short',
        x1: 50,
        y1: 60,
        x2: 51,
        y2: 60,
        stroke: '#dc2626',
        strokeWidth: 4,
      };

      const upActions = LineTool.onPointerUp(makeState({ draftShape: shortLine }), makeCtx(51, 60));

      expect(upActions).toHaveLength(1);
      const action = upActions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      expect(action.shape).toBeNull();
    });

    it('commits exactly at distance=2 (at threshold)', () => {
      LineTool.onPointerDown(makeState(), makeCtx(50, 60));

      const atThreshold = {
        type: 'line' as const,
        id: 'threshold',
        x1: 50,
        y1: 60,
        x2: 52,
        y2: 60,
        stroke: '#dc2626',
        strokeWidth: 4,
      };

      const upActions = LineTool.onPointerUp(
        makeState({ draftShape: atThreshold }),
        makeCtx(52, 60),
      );

      expect(upActions[0]!.type).toBe('COMMIT_DRAFT');
    });

    it('returns empty array when draftShape is null on pointer up', () => {
      const upActions = LineTool.onPointerUp(makeState({ draftShape: null }), makeCtx(100, 100));
      expect(upActions).toHaveLength(0);
    });
  });

  describe('cursor', () => {
    it('has cursor "crosshair"', () => {
      expect(LineTool.cursor).toBe('crosshair');
    });
  });
});
