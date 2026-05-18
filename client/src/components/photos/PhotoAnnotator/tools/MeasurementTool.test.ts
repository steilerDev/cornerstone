/**
 * Unit tests for MeasurementTool.ts
 *
 * Story #1477: Photo Annotator — Measurement and Freehand Tools
 *
 * Tests pointer event sequences for the Measurement drawing tool:
 *   - onPointerDown: creates draft at start position with empty label
 *   - onPointerMove: updates the second endpoint (x2/y2)
 *   - onPointerUp: triggers onOpenInlineInput at midpoint, keeps draft (no commit yet)
 *   - onPointerUp: discards draft when line is too short (< 2px)
 *   - resetMeasurementTool(): clears module state
 *
 * nanoid is mapped to a CJS stub in jest.config.ts (moduleNameMapper: nanoid -> nanoidMock.cjs)
 * so MeasurementTool can be statically imported despite nanoid being ESM-only.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { MeasurementTool, resetMeasurementTool } from './MeasurementTool.js';
import { resolveStrokeWidth, resolveFontSize } from '../annotationConstants.js';
import type { AnnotatorState } from '../useAnnotator.js';
import type { MeasurementShape } from '../useUndoStack.js';
import type { PointerContext } from './SelectTool.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMock = jest.MockedFunction<(...args: any[]) => any>;

function makeState(overrides: Partial<AnnotatorState> = {}): AnnotatorState {
  return {
    shapes: [],
    draftShape: null,
    selectedShapeId: null,
    selectedTool: 'measurement',
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
  opts: { onOpenInlineInput?: AnyMock } = {},
): PointerContext {
  return {
    imageX,
    imageY,
    imageWidth: 800,
    imageHeight: 600,
    event: {} as React.PointerEvent<SVGSVGElement>,
    onOpenInlineInput: opts.onOpenInlineInput,
  };
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('MeasurementTool', () => {
  beforeEach(() => {
    resetMeasurementTool();
  });

  // ─── onPointerDown ─────────────────────────────────────────────────────────

  describe('onPointerDown()', () => {
    it('returns a single SET_DRAFT action', () => {
      const actions = MeasurementTool.onPointerDown(makeState(), makeCtx(50, 60));

      expect(actions).toHaveLength(1);
      expect(actions[0]!.type).toBe('SET_DRAFT');
    });

    it('draft shape has type "measurement"', () => {
      const actions = MeasurementTool.onPointerDown(makeState(), makeCtx(50, 60));
      const action = actions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      expect(action.shape?.type).toBe('measurement');
    });

    it('draft starts at the pointer position (x1===x2===imageX, y1===y2===imageY)', () => {
      const actions = MeasurementTool.onPointerDown(makeState(), makeCtx(120, 80));
      const action = actions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      const shape = action.shape as MeasurementShape;
      expect(shape.x1).toBe(120);
      expect(shape.y1).toBe(80);
      expect(shape.x2).toBe(120);
      expect(shape.y2).toBe(80);
    });

    it('draft has empty label string ""', () => {
      const actions = MeasurementTool.onPointerDown(makeState(), makeCtx(50, 60));
      const action = actions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      const shape = action.shape as MeasurementShape;
      expect(shape.label).toBe('');
    });

    it('draft uses activeColor for stroke', () => {
      const state = makeState({ activeColor: '#3b82f6' });
      const actions = MeasurementTool.onPointerDown(state, makeCtx(50, 50));
      const action = actions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      const shape = action.shape as MeasurementShape;
      expect(shape.stroke).toBe('#3b82f6');
    });

    it('draft uses activeColor for color (label text color)', () => {
      const state = makeState({ activeColor: '#22c55e' });
      const actions = MeasurementTool.onPointerDown(state, makeCtx(50, 50));
      const action = actions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      const shape = action.shape as MeasurementShape;
      expect(shape.color).toBe('#22c55e');
    });

    it('draft uses activeFontSizeKey for fontSize', () => {
      const state = makeState({ activeFontSizeKey: 'large' });
      const actions = MeasurementTool.onPointerDown(state, makeCtx(50, 50));
      const action = actions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      const shape = action.shape as MeasurementShape;
      expect(shape.fontSize).toBeGreaterThan(0);
    });

    it('draft strokeWidth is resolved for "thin" activeStrokeWidthKey', () => {
      const state = makeState({ activeStrokeWidthKey: 'thin' });
      const actions = MeasurementTool.onPointerDown(state, makeCtx(50, 50));
      const action = actions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      const shape = action.shape as MeasurementShape;
      expect(shape.strokeWidth).toBe(resolveStrokeWidth('thin', 800, 600));
    });

    it('draft strokeWidth is resolved for "medium" activeStrokeWidthKey', () => {
      const state = makeState({ activeStrokeWidthKey: 'medium' });
      const actions = MeasurementTool.onPointerDown(state, makeCtx(50, 50));
      const action = actions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      const shape = action.shape as MeasurementShape;
      expect(shape.strokeWidth).toBe(resolveStrokeWidth('medium', 800, 600));
    });

    it('draft strokeWidth is resolved for "thick" activeStrokeWidthKey', () => {
      const state = makeState({ activeStrokeWidthKey: 'thick' });
      const actions = MeasurementTool.onPointerDown(state, makeCtx(50, 50));
      const action = actions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      const shape = action.shape as MeasurementShape;
      expect(shape.strokeWidth).toBe(resolveStrokeWidth('thick', 800, 600));
    });

    it('draft has a non-empty id string', () => {
      const actions = MeasurementTool.onPointerDown(makeState(), makeCtx(50, 50));
      const action = actions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      expect(action.shape?.id).toBeTruthy();
    });

    it('strokeWidth is a positive number for the default "medium" activeStrokeWidthKey', () => {
      // Verify that the default key produces a valid positive stroke width
      const state = makeState({ activeStrokeWidthKey: 'medium' });
      const actions = MeasurementTool.onPointerDown(state, makeCtx(50, 50));
      const action = actions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      const shape = action.shape as MeasurementShape;
      expect(shape.strokeWidth).toBeGreaterThan(0);
      expect(shape.strokeWidth).toBe(resolveStrokeWidth('medium', 800, 600));
    });
  });

  // ─── onPointerMove ─────────────────────────────────────────────────────────

  describe('onPointerMove()', () => {
    it('returns SET_DRAFT with updated x2/y2 when draw state is active', () => {
      const downActions = MeasurementTool.onPointerDown(makeState(), makeCtx(50, 60));
      const draftShape = downActions[0]!.type === 'SET_DRAFT' ? downActions[0]!.shape : null;

      const moveActions = MeasurementTool.onPointerMove(
        makeState({ draftShape }),
        makeCtx(150, 160),
      );

      expect(moveActions).toHaveLength(1);
      expect(moveActions[0]!.type).toBe('SET_DRAFT');
    });

    it('updates x2 and y2 to the current pointer position', () => {
      const downActions = MeasurementTool.onPointerDown(makeState(), makeCtx(50, 60));
      const draftShape = downActions[0]!.type === 'SET_DRAFT' ? downActions[0]!.shape : null;

      const moveActions = MeasurementTool.onPointerMove(
        makeState({ draftShape }),
        makeCtx(200, 180),
      );

      const action = moveActions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      const shape = action.shape as MeasurementShape;
      expect(shape.x2).toBe(200);
      expect(shape.y2).toBe(180);
    });

    it('preserves x1/y1 (start point) during move', () => {
      const downActions = MeasurementTool.onPointerDown(makeState(), makeCtx(50, 60));
      const draftShape = downActions[0]!.type === 'SET_DRAFT' ? downActions[0]!.shape : null;

      const moveActions = MeasurementTool.onPointerMove(
        makeState({ draftShape }),
        makeCtx(200, 180),
      );

      const action = moveActions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      const shape = action.shape as MeasurementShape;
      expect(shape.x1).toBe(50);
      expect(shape.y1).toBe(60);
    });

    it('preserves all other shape fields (stroke, label, fontSize, color) during move', () => {
      const state = makeState({ activeColor: '#3b82f6', activeFontSizeKey: 'large' });
      const downActions = MeasurementTool.onPointerDown(state, makeCtx(10, 10));
      const draftShape = downActions[0]!.type === 'SET_DRAFT' ? downActions[0]!.shape : null;

      const moveActions = MeasurementTool.onPointerMove(makeState({ draftShape }), makeCtx(80, 80));

      const action = moveActions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      const shape = action.shape as MeasurementShape;
      expect(shape.stroke).toBe('#3b82f6');
      expect(shape.label).toBe('');
      // fontSize is resolved from activeFontSizeKey='large' using image dimensions from ctx
      expect(shape.fontSize).toBe(resolveFontSize('large', 800, 600));
    });

    it('returns empty array when draftShape is null (no active draw)', () => {
      resetMeasurementTool();
      const actions = MeasurementTool.onPointerMove(
        makeState({ draftShape: null }),
        makeCtx(100, 100),
      );
      expect(actions).toHaveLength(0);
    });
  });

  // ─── onPointerUp ──────────────────────────────────────────────────────────

  describe('onPointerUp()', () => {
    it('calls onOpenInlineInput at the midpoint for a long-enough measurement', () => {
      // Create draft: from (10, 10) to (110, 10) — horizontal 100px line
      const downActions = MeasurementTool.onPointerDown(makeState(), makeCtx(10, 10));
      const draftShape0 = downActions[0]!.type === 'SET_DRAFT' ? downActions[0]!.shape : null;
      const moveActions = MeasurementTool.onPointerMove(
        makeState({ draftShape: draftShape0 }),
        makeCtx(110, 10),
      );
      const longDraft = moveActions[0]!.type === 'SET_DRAFT' ? moveActions[0]!.shape : null;

      const onOpenInlineInput = jest.fn() as AnyMock;
      const actions = MeasurementTool.onPointerUp(
        makeState({ draftShape: longDraft }),
        makeCtx(110, 10, { onOpenInlineInput }),
      );

      // midpoint of (10,10)→(110,10) is (60, 10)
      expect(onOpenInlineInput).toHaveBeenCalledTimes(1);
      expect(onOpenInlineInput).toHaveBeenCalledWith(60, 10);
    });

    it('does NOT commit the draft on pointerUp (returns empty actions)', () => {
      // The host component commits after label entry — pointerUp just opens the inline input
      const downActions = MeasurementTool.onPointerDown(makeState(), makeCtx(10, 10));
      const draftShape0 = downActions[0]!.type === 'SET_DRAFT' ? downActions[0]!.shape : null;
      const moveActions = MeasurementTool.onPointerMove(
        makeState({ draftShape: draftShape0 }),
        makeCtx(110, 10),
      );
      const longDraft = moveActions[0]!.type === 'SET_DRAFT' ? moveActions[0]!.shape : null;

      const onOpenInlineInput = jest.fn() as AnyMock;
      const actions = MeasurementTool.onPointerUp(
        makeState({ draftShape: longDraft }),
        makeCtx(110, 10, { onOpenInlineInput }),
      );

      // onPointerUp should return empty — it defers commit to the host
      expect(actions).toHaveLength(0);
    });

    it('calls onOpenInlineInput at the correct diagonal midpoint', () => {
      // Line from (0, 0) to (200, 200) — midpoint is (100, 100)
      const draft: MeasurementShape = {
        type: 'measurement',
        id: 'diag-1',
        x1: 0,
        y1: 0,
        x2: 200,
        y2: 200,
        label: '',
        stroke: '#dc2626',
        strokeWidth: 4,
        fontSize: 18,
        color: '#dc2626',
      };

      const onOpenInlineInput = jest.fn() as AnyMock;
      MeasurementTool.onPointerDown(makeState(), makeCtx(0, 0));
      MeasurementTool.onPointerUp(
        makeState({ draftShape: draft }),
        makeCtx(200, 200, { onOpenInlineInput }),
      );

      expect(onOpenInlineInput).toHaveBeenCalledWith(100, 100);
    });

    it('discards draft with SET_DRAFT(null) when line is too short (< 2px)', () => {
      const shortDraft: MeasurementShape = {
        type: 'measurement',
        id: 'short-1',
        x1: 50,
        y1: 60,
        x2: 51,
        y2: 60, // distance = 1 < 2
        label: '',
        stroke: '#dc2626',
        strokeWidth: 4,
        fontSize: 18,
        color: '#dc2626',
      };

      MeasurementTool.onPointerDown(makeState(), makeCtx(50, 60));
      const actions = MeasurementTool.onPointerUp(
        makeState({ draftShape: shortDraft }),
        makeCtx(51, 60),
      );

      expect(actions).toHaveLength(1);
      const action = actions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      expect(action.shape).toBeNull();
    });

    it('discards draft (zero-length tap — x1===x2, y1===y2)', () => {
      const tapDraft: MeasurementShape = {
        type: 'measurement',
        id: 'tap-1',
        x1: 100,
        y1: 100,
        x2: 100,
        y2: 100, // distance = 0 < 2
        label: '',
        stroke: '#dc2626',
        strokeWidth: 4,
        fontSize: 18,
        color: '#dc2626',
      };

      MeasurementTool.onPointerDown(makeState(), makeCtx(100, 100));
      const actions = MeasurementTool.onPointerUp(
        makeState({ draftShape: tapDraft }),
        makeCtx(100, 100),
      );

      expect(actions).toHaveLength(1);
      const action = actions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      expect(action.shape).toBeNull();
    });

    it('commits exactly at distance=2 (at the threshold)', () => {
      const atThreshold: MeasurementShape = {
        type: 'measurement',
        id: 'threshold-1',
        x1: 50,
        y1: 60,
        x2: 52,
        y2: 60, // distance = 2 — AT threshold
        label: '',
        stroke: '#dc2626',
        strokeWidth: 4,
        fontSize: 18,
        color: '#dc2626',
      };

      MeasurementTool.onPointerDown(makeState(), makeCtx(50, 60));
      const onOpenInlineInput = jest.fn() as AnyMock;
      const actions = MeasurementTool.onPointerUp(
        makeState({ draftShape: atThreshold }),
        makeCtx(52, 60, { onOpenInlineInput }),
      );

      // distance=2 passes threshold — should open inline input and NOT discard
      expect(onOpenInlineInput).toHaveBeenCalledTimes(1);
      expect(actions).toHaveLength(0);
    });

    it('does not call onOpenInlineInput when draft is null', () => {
      const onOpenInlineInput = jest.fn() as AnyMock;
      const actions = MeasurementTool.onPointerUp(
        makeState({ draftShape: null }),
        makeCtx(100, 100, { onOpenInlineInput }),
      );

      expect(onOpenInlineInput).not.toHaveBeenCalled();
      expect(actions).toHaveLength(0);
    });

    it('works without an onOpenInlineInput callback (no crash)', () => {
      const draft: MeasurementShape = {
        type: 'measurement',
        id: 'no-cb-1',
        x1: 0,
        y1: 0,
        x2: 100,
        y2: 0,
        label: '',
        stroke: '#dc2626',
        strokeWidth: 4,
        fontSize: 18,
        color: '#dc2626',
      };

      MeasurementTool.onPointerDown(makeState(), makeCtx(0, 0));
      // No onOpenInlineInput in ctx — should not throw
      expect(() =>
        MeasurementTool.onPointerUp(makeState({ draftShape: draft }), makeCtx(100, 0)),
      ).not.toThrow();
    });
  });

  // ─── resetMeasurementTool ──────────────────────────────────────────────────

  describe('resetMeasurementTool()', () => {
    it('clears module-level draw state so onPointerMove returns empty array', () => {
      // Start a draw
      MeasurementTool.onPointerDown(makeState(), makeCtx(50, 50));

      // Reset
      resetMeasurementTool();

      // Move should return empty (drawState is null after reset)
      const actions = MeasurementTool.onPointerMove(
        makeState({ draftShape: null }),
        makeCtx(100, 100),
      );
      expect(actions).toHaveLength(0);
    });

    it('can be called multiple times without error', () => {
      expect(() => {
        resetMeasurementTool();
        resetMeasurementTool();
        resetMeasurementTool();
      }).not.toThrow();
    });
  });

  // ─── cursor ───────────────────────────────────────────────────────────────

  describe('cursor', () => {
    it('has cursor "crosshair"', () => {
      expect(MeasurementTool.cursor).toBe('crosshair');
    });
  });
});
