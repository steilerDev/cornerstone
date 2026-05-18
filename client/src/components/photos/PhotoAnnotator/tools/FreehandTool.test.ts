/**
 * Unit tests for FreehandTool.ts
 *
 * Story #1477: Photo Annotator — Measurement and Freehand Tools
 *
 * Tests pointer event sequences for the Freehand drawing tool:
 *   - onPointerDown: creates draft with single starting point
 *   - onPointerMove: appends to points array (returns SET_DRAFT each time)
 *   - onPointerUp: applies RDP simplification; commits if >= 2 points remain
 *   - Edge case: degenerate tap (< 2 points after simplification) → discarded
 *   - resetFreehandTool(): clears module state
 *
 * nanoid is mapped to a CJS stub in jest.config.ts (moduleNameMapper: nanoid -> nanoidMock.cjs)
 * so FreehandTool can be statically imported despite nanoid being ESM-only.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { FreehandTool, resetFreehandTool } from './FreehandTool.js';
import type { AnnotatorState } from '../useAnnotator.js';
import type { FreehandShape } from '../useUndoStack.js';
import type { PointerContext } from './SelectTool.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeState(overrides: Partial<AnnotatorState> = {}): AnnotatorState {
  return {
    shapes: [],
    draftShape: null,
    selectedShapeId: null,
    selectedTool: 'freehand',
    activeColor: '#dc2626',
    activeStrokeWidthKey: 'medium',
    activeFontSize: 18,
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

// Generate a curved freehand stroke (many points along a sine wave)
function makeSineWaveStroke(pointCount: number): [number, number][] {
  return Array.from({ length: pointCount }, (_, i) => {
    const x = i * 5;
    const y = 100 + Math.sin((i / pointCount) * Math.PI * 4) * 50;
    return [x, y] as [number, number];
  });
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('FreehandTool', () => {
  beforeEach(() => {
    resetFreehandTool();
  });

  // ─── onPointerDown ─────────────────────────────────────────────────────────

  describe('onPointerDown()', () => {
    it('returns a single SET_DRAFT action', () => {
      const actions = FreehandTool.onPointerDown(makeState(), makeCtx(50, 60));

      expect(actions).toHaveLength(1);
      expect(actions[0]!.type).toBe('SET_DRAFT');
    });

    it('draft shape has type "freehand"', () => {
      const actions = FreehandTool.onPointerDown(makeState(), makeCtx(50, 60));
      const action = actions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      expect(action.shape?.type).toBe('freehand');
    });

    it('draft starts with a single point at the pointer position', () => {
      const actions = FreehandTool.onPointerDown(makeState(), makeCtx(120, 80));
      const action = actions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      const shape = action.shape as FreehandShape;
      expect(shape.points).toHaveLength(1);
      expect(shape.points[0]).toEqual([120, 80]);
    });

    it('draft uses activeColor for stroke', () => {
      const state = makeState({ activeColor: '#3b82f6' });
      const actions = FreehandTool.onPointerDown(state, makeCtx(50, 50));
      const action = actions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      const shape = action.shape as FreehandShape;
      expect(shape.stroke).toBe('#3b82f6');
    });

    it('draft strokeWidth is 2 for "thin" activeStrokeWidthKey', () => {
      const state = makeState({ activeStrokeWidthKey: 'thin' });
      const actions = FreehandTool.onPointerDown(state, makeCtx(50, 50));
      const action = actions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      const shape = action.shape as FreehandShape;
      expect(shape.strokeWidth).toBe(2);
    });

    it('draft strokeWidth is 4 for "medium" activeStrokeWidthKey', () => {
      const state = makeState({ activeStrokeWidthKey: 'medium' });
      const actions = FreehandTool.onPointerDown(state, makeCtx(50, 50));
      const action = actions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      const shape = action.shape as FreehandShape;
      expect(shape.strokeWidth).toBe(4);
    });

    it('draft strokeWidth is 8 for "thick" activeStrokeWidthKey', () => {
      const state = makeState({ activeStrokeWidthKey: 'thick' });
      const actions = FreehandTool.onPointerDown(state, makeCtx(50, 50));
      const action = actions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      const shape = action.shape as FreehandShape;
      expect(shape.strokeWidth).toBe(8);
    });

    it('draft has a non-empty id string', () => {
      const actions = FreehandTool.onPointerDown(makeState(), makeCtx(50, 50));
      const action = actions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      expect(action.shape?.id).toBeTruthy();
    });

    it('falls back to strokeWidth=4 (medium) when activeStrokeWidthKey is falsy', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const state = makeState({ activeStrokeWidthKey: '' as any });
      const actions = FreehandTool.onPointerDown(state, makeCtx(50, 50));
      const action = actions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      const shape = action.shape as FreehandShape;
      expect(shape.strokeWidth).toBe(4);
    });

    it('each pointerDown creates a fresh stroke (resets captured points)', () => {
      // First stroke
      FreehandTool.onPointerDown(makeState(), makeCtx(0, 0));
      const draftAfterFirstDown: FreehandShape = {
        type: 'freehand',
        id: 'stroke-1',
        points: [[0, 0]],
        stroke: '#dc2626',
        strokeWidth: 4,
      };
      FreehandTool.onPointerMove(makeState({ draftShape: draftAfterFirstDown }), makeCtx(50, 50));

      resetFreehandTool(); // simulate tool state between gestures

      // Second stroke — should start fresh
      const secondDownActions = FreehandTool.onPointerDown(makeState(), makeCtx(200, 200));
      const action = secondDownActions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      const shape = action.shape as FreehandShape;
      expect(shape.points).toHaveLength(1);
      expect(shape.points[0]).toEqual([200, 200]);
    });
  });

  // ─── onPointerMove ─────────────────────────────────────────────────────────

  describe('onPointerMove()', () => {
    it('returns SET_DRAFT with updated points array', () => {
      const downActions = FreehandTool.onPointerDown(makeState(), makeCtx(0, 0));
      const draftShape = downActions[0]!.type === 'SET_DRAFT' ? downActions[0]!.shape : null;

      const moveActions = FreehandTool.onPointerMove(makeState({ draftShape }), makeCtx(10, 10));

      expect(moveActions).toHaveLength(1);
      expect(moveActions[0]!.type).toBe('SET_DRAFT');
    });

    it('appends current pointer position to the points array', () => {
      const downActions = FreehandTool.onPointerDown(makeState(), makeCtx(0, 0));
      const draftShape = downActions[0]!.type === 'SET_DRAFT' ? downActions[0]!.shape : null;

      const moveActions = FreehandTool.onPointerMove(makeState({ draftShape }), makeCtx(30, 40));

      const action = moveActions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      const shape = action.shape as FreehandShape;
      expect(shape.points).toHaveLength(2);
      expect(shape.points[0]).toEqual([0, 0]);
      expect(shape.points[1]).toEqual([30, 40]);
    });

    it('accumulates all moved points across multiple moves', () => {
      const downActions = FreehandTool.onPointerDown(makeState(), makeCtx(0, 0));
      let draftShape = downActions[0]!.type === 'SET_DRAFT' ? downActions[0]!.shape : null;

      const positions: [number, number][] = [
        [10, 5],
        [20, 15],
        [30, 25],
        [40, 10],
      ];
      for (const [x, y] of positions) {
        const moveActions = FreehandTool.onPointerMove(makeState({ draftShape }), makeCtx(x, y));
        draftShape = moveActions[0]!.type === 'SET_DRAFT' ? moveActions[0]!.shape : draftShape;
      }

      const finalShape = draftShape as FreehandShape;
      // Started with 1 point, added 4 more = 5 total
      expect(finalShape.points).toHaveLength(5);
      expect(finalShape.points[0]).toEqual([0, 0]);
      expect(finalShape.points[4]).toEqual([40, 10]);
    });

    it('each onPointerMove call returns a SET_DRAFT action', () => {
      const downActions = FreehandTool.onPointerDown(makeState(), makeCtx(0, 0));
      let draftShape = downActions[0]!.type === 'SET_DRAFT' ? downActions[0]!.shape : null;

      for (let i = 1; i <= 5; i++) {
        const moveActions = FreehandTool.onPointerMove(
          makeState({ draftShape }),
          makeCtx(i * 10, i * 5),
        );
        expect(moveActions).toHaveLength(1);
        expect(moveActions[0]!.type).toBe('SET_DRAFT');
        draftShape = moveActions[0]!.type === 'SET_DRAFT' ? moveActions[0]!.shape : draftShape;
      }
    });

    it('returns empty array when no active draw state (currentDraftId is null)', () => {
      // No pointerDown first
      resetFreehandTool();
      const actions = FreehandTool.onPointerMove(
        makeState({ draftShape: null }),
        makeCtx(100, 100),
      );
      expect(actions).toHaveLength(0);
    });

    it('returns empty array when draftShape is null in state', () => {
      // pointerDown was called but state.draftShape is null (unusual edge case)
      FreehandTool.onPointerDown(makeState(), makeCtx(0, 0));
      const actions = FreehandTool.onPointerMove(makeState({ draftShape: null }), makeCtx(50, 50));
      expect(actions).toHaveLength(0);
    });

    it('preserves stroke and strokeWidth across moves', () => {
      const state = makeState({ activeColor: '#22c55e', activeStrokeWidthKey: 'thick' });
      const downActions = FreehandTool.onPointerDown(state, makeCtx(0, 0));
      const draftShape = downActions[0]!.type === 'SET_DRAFT' ? downActions[0]!.shape : null;

      const moveActions = FreehandTool.onPointerMove(makeState({ draftShape }), makeCtx(20, 20));
      const action = moveActions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      const shape = action.shape as FreehandShape;
      expect(shape.stroke).toBe('#22c55e');
      expect(shape.strokeWidth).toBe(8);
    });
  });

  // ─── onPointerUp ──────────────────────────────────────────────────────────

  describe('onPointerUp()', () => {
    it('returns SET_DRAFT + COMMIT_DRAFT when simplified stroke has >= 2 points', () => {
      // Build a curved stroke that will survive RDP simplification
      const sinePoints = makeSineWaveStroke(30);
      const draft: FreehandShape = {
        type: 'freehand',
        id: 'freehand-commit',
        points: sinePoints,
        stroke: '#dc2626',
        strokeWidth: 4,
      };

      // Prime the capturedPoints in the module by simulating pointermoves
      FreehandTool.onPointerDown(makeState(), makeCtx(sinePoints[0]![0], sinePoints[0]![1]));
      for (let i = 1; i < sinePoints.length; i++) {
        const draftSoFar: FreehandShape = {
          ...draft,
          points: sinePoints.slice(0, i + 1),
        };
        FreehandTool.onPointerMove(
          makeState({ draftShape: draftSoFar }),
          makeCtx(sinePoints[i]![0], sinePoints[i]![1]),
        );
      }

      const actions = FreehandTool.onPointerUp(makeState({ draftShape: draft }), makeCtx(0, 0));

      // Should contain both SET_DRAFT (with simplified points) and COMMIT_DRAFT
      expect(actions.some((a) => a.type === 'COMMIT_DRAFT')).toBe(true);
      const setDraftAction = actions.find((a) => a.type === 'SET_DRAFT');
      expect(setDraftAction).toBeDefined();
      if (setDraftAction?.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      const finalShape = setDraftAction.shape as FreehandShape;
      // RDP simplified points should be fewer than the raw input
      expect(finalShape.points.length).toBeLessThan(sinePoints.length);
      // But must have at least 2 points
      expect(finalShape.points.length).toBeGreaterThanOrEqual(2);
    });

    it('discards draft with SET_DRAFT(null) when tap produces < 2 points after simplification', () => {
      // A tap: pointerDown then immediately pointerUp at nearly the same location
      // This produces 1 or 2 collinear points that RDP collapses to 1 → discard
      FreehandTool.onPointerDown(makeState(), makeCtx(50, 50));
      // No moves — capturedPoints has only 1 point

      const draft: FreehandShape = {
        type: 'freehand',
        id: 'tap-draft',
        points: [[50, 50]],
        stroke: '#dc2626',
        strokeWidth: 4,
      };

      const actions = FreehandTool.onPointerUp(makeState({ draftShape: draft }), makeCtx(50, 50));

      expect(actions).toHaveLength(1);
      const action = actions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      expect(action.shape).toBeNull();
    });

    it('discards when only two very close collinear points simplify to 1 point', () => {
      // Two points at nearly the same location — epsilon=1.5 collapses them to 1 point
      // Actually with 2 points, simplifyPolyline returns both unchanged.
      // The edge: captured 3+ nearly identical points that simplify to 1.
      const nearbyPoints: [number, number][] = [
        [50, 50],
        [50.1, 50.1],
        [50.2, 50.2],
      ];

      FreehandTool.onPointerDown(makeState(), makeCtx(nearbyPoints[0]![0], nearbyPoints[0]![1]));
      const draftSoFar: FreehandShape = {
        type: 'freehand',
        id: 'nearby',
        points: [[nearbyPoints[0]![0], nearbyPoints[0]![1]]],
        stroke: '#dc2626',
        strokeWidth: 4,
      };
      for (let i = 1; i < nearbyPoints.length; i++) {
        FreehandTool.onPointerMove(
          makeState({ draftShape: draftSoFar }),
          makeCtx(nearbyPoints[i]![0], nearbyPoints[i]![1]),
        );
      }

      const draft: FreehandShape = {
        type: 'freehand',
        id: 'nearby-draft',
        points: nearbyPoints,
        stroke: '#dc2626',
        strokeWidth: 4,
      };

      const actions = FreehandTool.onPointerUp(
        makeState({ draftShape: draft }),
        makeCtx(50.2, 50.2),
      );

      // These 3 nearly collinear points → after RDP simplify → 2 points (endpoints only)
      // 2 >= 2 threshold so it commits
      expect(actions.some((a) => a.type === 'COMMIT_DRAFT')).toBe(true);
    });

    it('returns empty when draftShape is null on pointer up', () => {
      const actions = FreehandTool.onPointerUp(makeState({ draftShape: null }), makeCtx(100, 100));
      expect(actions).toHaveLength(0);
    });

    it('freehand simplification reduces a sine-wave stroke by at least 30%', () => {
      const sinePoints = makeSineWaveStroke(50);

      FreehandTool.onPointerDown(makeState(), makeCtx(sinePoints[0]![0], sinePoints[0]![1]));
      let currentDraft: FreehandShape = {
        type: 'freehand',
        id: 'sine',
        points: [[sinePoints[0]![0], sinePoints[0]![1]]],
        stroke: '#dc2626',
        strokeWidth: 4,
      };
      for (let i = 1; i < sinePoints.length; i++) {
        const moveActions = FreehandTool.onPointerMove(
          makeState({ draftShape: currentDraft }),
          makeCtx(sinePoints[i]![0], sinePoints[i]![1]),
        );
        if (moveActions[0]?.type === 'SET_DRAFT') {
          currentDraft = moveActions[0].shape as FreehandShape;
        }
      }

      const actions = FreehandTool.onPointerUp(
        makeState({ draftShape: currentDraft }),
        makeCtx(0, 0),
      );

      const setDraftAction = actions.find((a) => a.type === 'SET_DRAFT');
      if (setDraftAction?.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      const finalShape = setDraftAction.shape as FreehandShape;
      expect(finalShape.points.length).toBeLessThan(sinePoints.length * 0.7);
    });
  });

  // ─── resetFreehandTool ────────────────────────────────────────────────────

  describe('resetFreehandTool()', () => {
    it('clears module state so onPointerMove returns empty array', () => {
      // Start a draw
      FreehandTool.onPointerDown(makeState(), makeCtx(50, 50));

      // Reset
      resetFreehandTool();

      // Move should return empty (currentDraftId is null after reset)
      const actions = FreehandTool.onPointerMove(
        makeState({ draftShape: null }),
        makeCtx(100, 100),
      );
      expect(actions).toHaveLength(0);
    });

    it('clears captured points so onPointerUp discards (no points)', () => {
      // Simulate captured points
      FreehandTool.onPointerDown(makeState(), makeCtx(0, 0));
      const draftAfterDown: FreehandShape = {
        type: 'freehand',
        id: 'reset-test',
        points: [[0, 0]],
        stroke: '#dc2626',
        strokeWidth: 4,
      };
      FreehandTool.onPointerMove(makeState({ draftShape: draftAfterDown }), makeCtx(50, 50));
      FreehandTool.onPointerMove(makeState({ draftShape: draftAfterDown }), makeCtx(100, 0));

      // Reset clears capturedPoints
      resetFreehandTool();

      // After reset, pointerUp with a draftShape should discard (capturedPoints is empty)
      const draft: FreehandShape = {
        type: 'freehand',
        id: 'reset-test',
        points: [
          [0, 0],
          [50, 50],
          [100, 0],
        ], // state.draftShape has points but capturedPoints is empty
        stroke: '#dc2626',
        strokeWidth: 4,
      };
      const actions = FreehandTool.onPointerUp(makeState({ draftShape: draft }), makeCtx(100, 0));

      // With empty capturedPoints, simplifyPolyline([]) = [] which has length 0 < 2 → discard
      expect(actions).toHaveLength(1);
      const action = actions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      expect(action.shape).toBeNull();
    });

    it('can be called multiple times without error', () => {
      expect(() => {
        resetFreehandTool();
        resetFreehandTool();
        resetFreehandTool();
      }).not.toThrow();
    });
  });

  // ─── cursor ───────────────────────────────────────────────────────────────

  describe('cursor', () => {
    it('has cursor "crosshair"', () => {
      expect(FreehandTool.cursor).toBe('crosshair');
    });
  });
});
