/**
 * Unit tests for CalloutTool.ts
 *
 * Story #1476: Photo Annotator — Text-based Tools (Text, Callout)
 *
 * Tests the two-phase drag lifecycle of the CalloutTool handler:
 *   - Phase 1 (box): pointerDown starts draft, pointerMove updates w/h, pointerUp transitions
 *   - Phase 2 (tail): pointerDown/Move updates tail position, pointerUp opens inline input
 *   - Abort conditions: too-small box discards on phase 1 release
 *   - resetCalloutTool() resets module state
 *   - getCalloutPhase() exposes current phase
 *
 * nanoid is mapped to a CJS stub in jest.config.ts (moduleNameMapper: nanoid -> nanoidMock.cjs)
 * so CalloutTool can be statically imported despite nanoid being ESM-only.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { CalloutTool, resetCalloutTool, getCalloutPhase } from './CalloutTool.js';
import type { AnnotatorState } from '../useAnnotator.js';
import type { CalloutShape } from '../useUndoStack.js';
import type { PointerContext } from './SelectTool.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeState(overrides: Partial<AnnotatorState> = {}): AnnotatorState {
  return {
    shapes: [],
    draftShape: null,
    selectedShapeId: null,
    selectedTool: 'callout',
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

function makeCalloutDraft(overrides: Partial<CalloutShape> = {}): CalloutShape {
  return {
    type: 'callout',
    id: 'callout-1',
    x: 50,
    y: 50,
    w: 100,
    h: 80,
    text: '',
    tailX: 100,
    tailY: 140,
    stroke: '#dc2626',
    fill: '#dc2626',
    fontSize: 18,
    color: '#dc2626',
    ...overrides,
  };
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('CalloutTool', () => {
  // Reset module-level phase state between tests
  beforeEach(() => {
    resetCalloutTool();
  });

  describe('initial phase state', () => {
    it('phase starts as null before any interaction', () => {
      expect(getCalloutPhase()).toBeNull();
    });
  });

  describe('cursor', () => {
    it('has cursor "crosshair"', () => {
      expect(CalloutTool.cursor).toBe('crosshair');
    });
  });

  describe('resetCalloutTool()', () => {
    it('resets phase from "box" to null', () => {
      // Start phase 1
      CalloutTool.onPointerDown(makeState(), makeCtx(50, 50));
      expect(getCalloutPhase()).toBe('box');

      resetCalloutTool();
      expect(getCalloutPhase()).toBeNull();
    });

    it('resets phase from "tail" to null', () => {
      // Drive all the way to tail phase
      CalloutTool.onPointerDown(makeState(), makeCtx(50, 50));
      const boxDraft = makeCalloutDraft({ x: 50, y: 50, w: 100, h: 80 });
      CalloutTool.onPointerUp(makeState({ draftShape: boxDraft }), makeCtx(150, 130));
      expect(getCalloutPhase()).toBe('tail');

      resetCalloutTool();
      expect(getCalloutPhase()).toBeNull();
    });
  });

  // ─── Phase 1: box drag ──────────────────────────────────────────────────────

  describe('onPointerDown() — phase=null (start box)', () => {
    it('transitions phase to "box"', () => {
      CalloutTool.onPointerDown(makeState(), makeCtx(50, 50));
      expect(getCalloutPhase()).toBe('box');
    });

    it('returns a SET_DRAFT action', () => {
      const actions = CalloutTool.onPointerDown(makeState(), makeCtx(50, 50));
      expect(actions).toHaveLength(1);
      expect(actions[0]!.type).toBe('SET_DRAFT');
    });

    it('draft shape has type "callout"', () => {
      const actions = CalloutTool.onPointerDown(makeState(), makeCtx(50, 50));
      const action = actions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      expect(action.shape?.type).toBe('callout');
    });

    it('draft shape starts at pointer coordinates', () => {
      const actions = CalloutTool.onPointerDown(makeState(), makeCtx(100, 120));
      const action = actions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      const shape = action.shape;
      if (!shape || shape.type !== 'callout') throw new Error('expected callout');
      expect(shape.x).toBe(100);
      expect(shape.y).toBe(120);
    });

    it('draft shape starts with w=0 and h=0', () => {
      const actions = CalloutTool.onPointerDown(makeState(), makeCtx(100, 120));
      const action = actions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      const shape = action.shape;
      if (!shape || shape.type !== 'callout') throw new Error('expected callout');
      expect(shape.w).toBe(0);
      expect(shape.h).toBe(0);
    });

    it('draft shape uses state.activeColor for stroke and fill', () => {
      const state = makeState({ activeColor: '#3b82f6' });
      const actions = CalloutTool.onPointerDown(state, makeCtx(50, 50));
      const action = actions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      const shape = action.shape;
      if (!shape || shape.type !== 'callout') throw new Error('expected callout');
      expect(shape.stroke).toBe('#3b82f6');
      expect(shape.fill).toBe('#3b82f6');
    });

    it('draft shape uses state.activeFontSize', () => {
      const state = makeState({ activeFontSize: 24 });
      const actions = CalloutTool.onPointerDown(state, makeCtx(50, 50));
      const action = actions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      const shape = action.shape;
      if (!shape || shape.type !== 'callout') throw new Error('expected callout');
      expect(shape.fontSize).toBe(24);
    });

    it('draft shape has a non-empty id', () => {
      const actions = CalloutTool.onPointerDown(makeState(), makeCtx(50, 50));
      const action = actions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      expect(action.shape?.id).toBeTruthy();
    });
  });

  describe('onPointerMove() — phase=box', () => {
    it('returns SET_DRAFT with updated w/h via normalizeRect', () => {
      // Start phase 1
      const downActions = CalloutTool.onPointerDown(makeState(), makeCtx(50, 60));
      const draftShape = downActions[0]!.type === 'SET_DRAFT' ? downActions[0]!.shape : null;

      const moveActions = CalloutTool.onPointerMove(makeState({ draftShape }), makeCtx(150, 160));

      expect(moveActions).toHaveLength(1);
      expect(moveActions[0]!.type).toBe('SET_DRAFT');
    });

    it('computed w/h are non-zero after move', () => {
      const downActions = CalloutTool.onPointerDown(makeState(), makeCtx(50, 60));
      const draftShape = downActions[0]!.type === 'SET_DRAFT' ? downActions[0]!.shape : null;

      const moveActions = CalloutTool.onPointerMove(makeState({ draftShape }), makeCtx(150, 160));

      const action = moveActions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      const shape = action.shape;
      if (!shape || shape.type !== 'callout') throw new Error('expected callout');
      expect(shape.w).toBeGreaterThan(0);
      expect(shape.h).toBeGreaterThan(0);
    });

    it('returns [] when draftShape is null (no active draw)', () => {
      // After reset there is no draw state, so move does nothing
      const actions = CalloutTool.onPointerMove(makeState({ draftShape: null }), makeCtx(100, 100));
      expect(actions).toHaveLength(0);
    });
  });

  describe('onPointerUp() — phase=box, shape too small', () => {
    it('aborts when w < 20 and returns SET_DRAFT(null)', () => {
      CalloutTool.onPointerDown(makeState(), makeCtx(50, 50));

      const tinyDraft = makeCalloutDraft({ x: 50, y: 50, w: 5, h: 5 });
      const upActions = CalloutTool.onPointerUp(makeState({ draftShape: tinyDraft }), makeCtx(55, 55));

      expect(upActions).toHaveLength(1);
      const action = upActions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      expect(action.shape).toBeNull();
    });

    it('resets phase to null after aborting', () => {
      CalloutTool.onPointerDown(makeState(), makeCtx(50, 50));
      const tinyDraft = makeCalloutDraft({ x: 50, y: 50, w: 10, h: 10 });
      CalloutTool.onPointerUp(makeState({ draftShape: tinyDraft }), makeCtx(60, 60));
      expect(getCalloutPhase()).toBeNull();
    });

    it('aborts when h < 16 (height threshold)', () => {
      CalloutTool.onPointerDown(makeState(), makeCtx(50, 50));
      const shortDraft = makeCalloutDraft({ x: 50, y: 50, w: 100, h: 10 });
      const upActions = CalloutTool.onPointerUp(makeState({ draftShape: shortDraft }), makeCtx(150, 60));
      const action = upActions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      expect(action.shape).toBeNull();
    });
  });

  describe('onPointerUp() — phase=box, shape large enough', () => {
    it('transitions phase to "tail"', () => {
      CalloutTool.onPointerDown(makeState(), makeCtx(50, 50));
      const largeDraft = makeCalloutDraft({ x: 50, y: 50, w: 100, h: 80 });
      CalloutTool.onPointerUp(makeState({ draftShape: largeDraft }), makeCtx(150, 130));
      expect(getCalloutPhase()).toBe('tail');
    });

    it('returns SET_DRAFT action with tailX/tailY set', () => {
      CalloutTool.onPointerDown(makeState(), makeCtx(50, 50));
      const largeDraft = makeCalloutDraft({ x: 50, y: 50, w: 100, h: 80 });
      const upActions = CalloutTool.onPointerUp(makeState({ draftShape: largeDraft }), makeCtx(150, 130));

      expect(upActions).toHaveLength(1);
      const action = upActions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      const shape = action.shape;
      if (!shape || shape.type !== 'callout') throw new Error('expected callout');
      // tailX is center of box = 50 + 100/2 = 100
      expect(shape.tailX).toBe(100);
    });

    it('tailY is clamped below the box', () => {
      CalloutTool.onPointerDown(makeState(), makeCtx(50, 50));
      const largeDraft = makeCalloutDraft({ x: 50, y: 50, w: 100, h: 80 });
      const upActions = CalloutTool.onPointerUp(
        makeState({ draftShape: largeDraft }),
        makeCtx(150, 130, { imageHeight: 600 }),
      );
      const action = upActions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      const shape = action.shape;
      if (!shape || shape.type !== 'callout') throw new Error('expected callout');
      // tailY = clamp(y + h + 40, 0, imageHeight) = clamp(50+80+40, 0, 600) = 170
      expect(shape.tailY).toBe(170);
    });
  });

  describe('onPointerDown() — phase=box (second pointer down, defensive return)', () => {
    it('returns [] when called a second time while already in phase=box', () => {
      // First pointer down transitions to 'box'
      CalloutTool.onPointerDown(makeState(), makeCtx(50, 50));
      expect(getCalloutPhase()).toBe('box');

      // Second pointer down while still in 'box' — should return [] (defensive line 55)
      const actions = CalloutTool.onPointerDown(makeState(), makeCtx(60, 60));
      expect(actions).toHaveLength(0);
    });
  });

  describe('onPointerDown() — phase=tail, draftShape missing', () => {
    it('resets phase to null and returns [] when draftShape is null in tail phase', () => {
      // Drive to tail phase
      CalloutTool.onPointerDown(makeState(), makeCtx(50, 50));
      const largeDraft = makeCalloutDraft({ x: 50, y: 50, w: 100, h: 80 });
      CalloutTool.onPointerUp(makeState({ draftShape: largeDraft }), makeCtx(150, 130));
      expect(getCalloutPhase()).toBe('tail');

      // Simulate state corruption: phase='tail' but no draftShape
      const actions = CalloutTool.onPointerDown(makeState({ draftShape: null }), makeCtx(200, 200));
      expect(actions).toHaveLength(0);
      expect(getCalloutPhase()).toBeNull();
    });
  });

  describe('onPointerDown() — phase=tail (update tail position)', () => {
    function setupTailPhase() {
      // Drive to tail phase
      CalloutTool.onPointerDown(makeState(), makeCtx(50, 50));
      const largeDraft = makeCalloutDraft({ x: 50, y: 50, w: 100, h: 80 });
      const upActions = CalloutTool.onPointerUp(makeState({ draftShape: largeDraft }), makeCtx(150, 130));
      const setDraftAction = upActions[0]!;
      if (setDraftAction.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      return setDraftAction.shape as CalloutShape;
    }

    it('returns SET_DRAFT with updated tailX/tailY', () => {
      const tailDraft = setupTailPhase();
      const downActions = CalloutTool.onPointerDown(
        makeState({ draftShape: tailDraft }),
        makeCtx(200, 250),
      );
      expect(downActions).toHaveLength(1);
      const action = downActions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      const shape = action.shape;
      if (!shape || shape.type !== 'callout') throw new Error('expected callout');
      expect(shape.tailX).toBe(200);
      expect(shape.tailY).toBe(250);
    });

    it('clamps tailX to image bounds', () => {
      const tailDraft = setupTailPhase();
      const downActions = CalloutTool.onPointerDown(
        makeState({ draftShape: tailDraft }),
        makeCtx(900, 300, { imageWidth: 800, imageHeight: 600 }),
      );
      const action = downActions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      const shape = action.shape;
      if (!shape || shape.type !== 'callout') throw new Error('expected callout');
      expect(shape.tailX).toBeLessThanOrEqual(800);
    });
  });

  describe('onPointerMove() — phase=tail', () => {
    function setupTailPhase() {
      CalloutTool.onPointerDown(makeState(), makeCtx(50, 50));
      const largeDraft = makeCalloutDraft({ x: 50, y: 50, w: 100, h: 80 });
      const upActions = CalloutTool.onPointerUp(makeState({ draftShape: largeDraft }), makeCtx(150, 130));
      const setDraftAction = upActions[0]!;
      if (setDraftAction.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      return setDraftAction.shape as CalloutShape;
    }

    it('returns SET_DRAFT with updated tailX/tailY', () => {
      const tailDraft = setupTailPhase();
      const moveActions = CalloutTool.onPointerMove(
        makeState({ draftShape: tailDraft }),
        makeCtx(300, 400),
      );
      expect(moveActions).toHaveLength(1);
      const action = moveActions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      const shape = action.shape;
      if (!shape || shape.type !== 'callout') throw new Error('expected callout');
      expect(shape.tailX).toBe(300);
      expect(shape.tailY).toBe(400);
    });

    it('clamps tail to image bounds during move', () => {
      const tailDraft = setupTailPhase();
      // imageWidth:100, imageHeight:100 — send point at (200, 200) which is out of bounds
      const moveActions = CalloutTool.onPointerMove(
        makeState({ draftShape: tailDraft }),
        makeCtx(200, 200, { imageWidth: 100, imageHeight: 100 }),
      );
      const action = moveActions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      const shape = action.shape;
      if (!shape || shape.type !== 'callout') throw new Error('expected callout');
      expect(shape.tailX).toBeLessThanOrEqual(100);
      expect(shape.tailY).toBeLessThanOrEqual(100);
    });
  });

  describe('onPointerUp() — phase=tail', () => {
    function setupTailPhase(): CalloutShape {
      CalloutTool.onPointerDown(makeState(), makeCtx(50, 50));
      const largeDraft = makeCalloutDraft({ x: 50, y: 50, w: 100, h: 80 });
      const upActions = CalloutTool.onPointerUp(makeState({ draftShape: largeDraft }), makeCtx(150, 130));
      const setDraftAction = upActions[0]!;
      if (setDraftAction.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      return setDraftAction.shape as CalloutShape;
    }

    it('calls onOpenInlineInput and returns empty actions', () => {
      const tailDraft = setupTailPhase();
      const onOpenInlineInput = jest.fn() as jest.MockedFunction<(x: number, y: number) => void>;

      const upActions = CalloutTool.onPointerUp(
        makeState({ draftShape: tailDraft }),
        makeCtx(300, 400, { onOpenInlineInput }),
      );

      expect(onOpenInlineInput).toHaveBeenCalledTimes(1);
      expect(upActions).toHaveLength(0);
    });

    it('resets phase to null after completing tail phase', () => {
      const tailDraft = setupTailPhase();
      CalloutTool.onPointerUp(makeState({ draftShape: tailDraft }), makeCtx(300, 400));
      expect(getCalloutPhase()).toBeNull();
    });

    it('opens inline input at the callout box origin (x, y)', () => {
      const tailDraft = setupTailPhase();
      const onOpenInlineInput = jest.fn() as jest.MockedFunction<(x: number, y: number) => void>;

      CalloutTool.onPointerUp(
        makeState({ draftShape: tailDraft }),
        makeCtx(300, 400, { onOpenInlineInput }),
      );

      // Should be called with the box's x and y
      expect(onOpenInlineInput).toHaveBeenCalledWith(tailDraft.x, tailDraft.y);
    });

    it('safely handles missing draft and resets phase', () => {
      const tailDraft = setupTailPhase();
      expect(getCalloutPhase()).toBe('tail');

      // Call with no draft in state
      const upActions = CalloutTool.onPointerUp(makeState({ draftShape: null }), makeCtx(300, 400));

      expect(upActions).toHaveLength(0);
      expect(getCalloutPhase()).toBeNull();
    });
  });

  describe('onPointerUp() — no draft on initial phase', () => {
    it('returns empty array and resets phase when draftShape is null in phase=null', () => {
      // Phase is null and draftShape is null — edge case for safety
      const upActions = CalloutTool.onPointerUp(makeState({ draftShape: null }), makeCtx(100, 100));
      expect(upActions).toHaveLength(0);
      expect(getCalloutPhase()).toBeNull();
    });
  });
});
