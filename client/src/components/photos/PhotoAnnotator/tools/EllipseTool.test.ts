/**
 * Unit tests for EllipseTool.ts
 *
 * Story #1475: Photo Annotator — Geometric Tools (Arrow, Line, Ellipse)
 *
 * Tests pointer event sequences for the Ellipse drawing tool:
 *   - onPointerDown: creates zero-radius draft at pointer position
 *   - onPointerMove: updates cx/cy/rx/ry from bounding box; shift constrains to circle
 *   - onPointerUp: commits when rx>=1 && ry>=1; discards if either is smaller
 *
 * nanoid is mapped to a CJS stub in jest.config.ts (moduleNameMapper: nanoid -> nanoidMock.cjs)
 * so EllipseTool can be statically imported despite nanoid being ESM-only.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { EllipseTool } from './EllipseTool.js';
import type { AnnotatorState } from '../useAnnotator.js';
import type { PointerContext } from './SelectTool.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeState(overrides: Partial<AnnotatorState> = {}): AnnotatorState {
  return {
    shapes: [],
    draftShape: null,
    selectedShapeId: null,
    selectedTool: 'ellipse',
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

function makeCtx(
  imageX: number,
  imageY: number,
  shiftKey = false,
): PointerContext {
  return {
    imageX,
    imageY,
    imageWidth: 800,
    imageHeight: 600,
    event: { shiftKey } as React.PointerEvent<SVGSVGElement>,
  };
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('EllipseTool', () => {
  // Reset module-level drawState between tests by completing a full gesture
  beforeEach(() => {
    const state = makeState();
    const ctx = makeCtx(0, 0);
    EllipseTool.onPointerDown(state, ctx);
    EllipseTool.onPointerUp(makeState({ draftShape: null }), ctx);
  });

  describe('onPointerDown()', () => {
    it('returns a SET_DRAFT action', () => {
      const state = makeState();
      const ctx = makeCtx(50, 60);
      const actions = EllipseTool.onPointerDown(state, ctx);

      expect(actions).toHaveLength(1);
      expect(actions[0]!.type).toBe('SET_DRAFT');
    });

    it('draft shape has type "ellipse"', () => {
      const actions = EllipseTool.onPointerDown(makeState(), makeCtx(50, 60));
      const action = actions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      expect(action.shape?.type).toBe('ellipse');
    });

    it('draft starts with rx===ry===0 and cx===startX, cy===startY', () => {
      const actions = EllipseTool.onPointerDown(makeState(), makeCtx(120, 80));
      const action = actions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      const shape = action.shape;
      if (!shape || shape.type !== 'ellipse') throw new Error('expected ellipse');
      expect(shape.cx).toBe(120);
      expect(shape.cy).toBe(80);
      expect(shape.rx).toBe(0);
      expect(shape.ry).toBe(0);
    });

    it('draft uses activeColor for stroke', () => {
      const state = makeState({ activeColor: '#3b82f6' });
      const actions = EllipseTool.onPointerDown(state, makeCtx(50, 50));
      const action = actions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      const shape = action.shape;
      if (!shape || shape.type !== 'ellipse') throw new Error('expected ellipse');
      expect(shape.stroke).toBe('#3b82f6');
    });

    it('draft strokeWidth is 2 for "thin" activeStrokeWidthKey', () => {
      const state = makeState({ activeStrokeWidthKey: 'thin' });
      const actions = EllipseTool.onPointerDown(state, makeCtx(50, 50));
      const action = actions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      const shape = action.shape;
      if (!shape || shape.type !== 'ellipse') throw new Error('expected ellipse');
      expect(shape.strokeWidth).toBe(2);
    });

    it('draft strokeWidth is 4 for "medium" activeStrokeWidthKey', () => {
      const state = makeState({ activeStrokeWidthKey: 'medium' });
      const actions = EllipseTool.onPointerDown(state, makeCtx(50, 50));
      const action = actions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      const shape = action.shape;
      if (!shape || shape.type !== 'ellipse') throw new Error('expected ellipse');
      expect(shape.strokeWidth).toBe(4);
    });

    it('draft strokeWidth is 8 for "thick" activeStrokeWidthKey', () => {
      const state = makeState({ activeStrokeWidthKey: 'thick' });
      const actions = EllipseTool.onPointerDown(state, makeCtx(50, 50));
      const action = actions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      const shape = action.shape;
      if (!shape || shape.type !== 'ellipse') throw new Error('expected ellipse');
      expect(shape.strokeWidth).toBe(8);
    });

    it('draft has a non-empty id', () => {
      const actions = EllipseTool.onPointerDown(makeState(), makeCtx(50, 50));
      const action = actions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      expect(action.shape?.id).toBeTruthy();
    });

    it('draft fill property is undefined (ellipse is stroke-only)', () => {
      const actions = EllipseTool.onPointerDown(makeState(), makeCtx(50, 50));
      const action = actions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      const shape = action.shape;
      if (!shape || shape.type !== 'ellipse') throw new Error('expected ellipse');
      // EllipseShape has no fill property — it should not be present
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((shape as unknown as Record<string, unknown>)['fill']).toBeUndefined();
    });

    it('falls back to strokeWidth 4 when activeStrokeWidthKey is falsy', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const state = makeState({ activeStrokeWidthKey: '' as any });
      const actions = EllipseTool.onPointerDown(state, makeCtx(50, 50));
      const action = actions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      const shape = action.shape;
      if (!shape || shape.type !== 'ellipse') throw new Error('expected ellipse');
      expect(shape.strokeWidth).toBe(4);
    });
  });

  describe('onPointerMove() — without shift', () => {
    it('returns SET_DRAFT with updated cx/cy/rx/ry', () => {
      const downActions = EllipseTool.onPointerDown(makeState(), makeCtx(100, 100));
      const draftShape = downActions[0]!.type === 'SET_DRAFT' ? downActions[0]!.shape : null;

      const moveActions = EllipseTool.onPointerMove(makeState({ draftShape }), makeCtx(160, 180));

      expect(moveActions).toHaveLength(1);
      expect(moveActions[0]!.type).toBe('SET_DRAFT');
    });

    it('computes correct cx/cy/rx/ry from bounding box (positive drag direction)', () => {
      // Start at (100, 100), drag to (200, 160) → dxRaw=100, dyRaw=60
      // rx = abs(100)/2 = 50, ry = abs(60)/2 = 30
      // cx = 100 + 100/2 = 150, cy = 100 + 60/2 = 130
      const downActions = EllipseTool.onPointerDown(makeState(), makeCtx(100, 100));
      const draftShape = downActions[0]!.type === 'SET_DRAFT' ? downActions[0]!.shape : null;

      const moveActions = EllipseTool.onPointerMove(makeState({ draftShape }), makeCtx(200, 160, false));

      const action = moveActions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      const shape = action.shape;
      if (!shape || shape.type !== 'ellipse') throw new Error('expected ellipse');
      expect(shape.rx).toBe(50);
      expect(shape.ry).toBe(30);
      expect(shape.cx).toBeCloseTo(150, 0);
      expect(shape.cy).toBeCloseTo(130, 0);
    });

    it('produces positive rx/ry even when dragging to top-left of start point', () => {
      // Start at (200, 200), drag to (100, 120) — top-left
      // dxRaw=-100, dyRaw=-80 → rx=abs(-100)/2=50, ry=abs(-80)/2=40
      // cx = 200 + (-100)/2 = 150, cy = 200 + (-80)/2 = 160
      const downActions = EllipseTool.onPointerDown(makeState(), makeCtx(200, 200));
      const draftShape = downActions[0]!.type === 'SET_DRAFT' ? downActions[0]!.shape : null;

      const moveActions = EllipseTool.onPointerMove(makeState({ draftShape }), makeCtx(100, 120, false));

      const action = moveActions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      const shape = action.shape;
      if (!shape || shape.type !== 'ellipse') throw new Error('expected ellipse');
      expect(shape.rx).toBe(50);
      expect(shape.ry).toBe(40);
      expect(shape.cx).toBeCloseTo(150, 0);
      expect(shape.cy).toBeCloseTo(160, 0);
    });

    it('returns empty array when draftShape is null (no active draw)', () => {
      EllipseTool.onPointerUp(makeState({ draftShape: null }), makeCtx(0, 0));

      const actions = EllipseTool.onPointerMove(makeState({ draftShape: null }), makeCtx(100, 100));
      expect(actions).toHaveLength(0);
    });
  });

  describe('onPointerMove() — with shift (circle constraint)', () => {
    it('produces rx===ry (circle) when shiftKey:true', () => {
      // Start at (100, 100), drag to (200, 160) — non-square (dxRaw=100, dyRaw=60)
      // Without shift: rx=50, ry=30. With shift: r = max(50, 30) = 50
      const downActions = EllipseTool.onPointerDown(makeState(), makeCtx(100, 100));
      const draftShape = downActions[0]!.type === 'SET_DRAFT' ? downActions[0]!.shape : null;

      const moveActions = EllipseTool.onPointerMove(makeState({ draftShape }), makeCtx(200, 160, true));

      const action = moveActions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      const shape = action.shape;
      if (!shape || shape.type !== 'ellipse') throw new Error('expected ellipse');
      // r = max(abs(100)/2, abs(60)/2) = max(50, 30) = 50
      expect(shape.rx).toBe(50);
      expect(shape.ry).toBe(50);
    });

    it('rx !== ry for non-square drags without shift', () => {
      // Start at (100, 100), drag to (200, 160) — dx=100, dy=60
      const downActions = EllipseTool.onPointerDown(makeState(), makeCtx(100, 100));
      const draftShape = downActions[0]!.type === 'SET_DRAFT' ? downActions[0]!.shape : null;

      const moveActions = EllipseTool.onPointerMove(makeState({ draftShape }), makeCtx(200, 160, false));

      const action = moveActions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      const shape = action.shape;
      if (!shape || shape.type !== 'ellipse') throw new Error('expected ellipse');
      // Without shift, rx and ry should differ
      expect(shape.rx).not.toBe(shape.ry);
    });

    it('shift-constrained circle extends past cursor along the smaller axis', () => {
      // Start at (200, 200), drag to (300, 280) + Shift: dxRaw=100, dyRaw=80
      // Without shift: rx=50, ry=40. With shift: r=max(50,40)=50
      // cx = startX + signX * r = 200 + 1*50 = 250 (anchored at start, extends right by max-r)
      // cy = startY + signY * r = 200 + 1*50 = 250 (extends down by max-r, past cursor's y=280)
      // The bounding box extends to y=300 (cy+r=300), past the cursor's y=280
      const downActions = EllipseTool.onPointerDown(makeState(), makeCtx(200, 200));
      const draftShape = downActions[0]!.type === 'SET_DRAFT' ? downActions[0]!.shape : null;

      const moveActions = EllipseTool.onPointerMove(makeState({ draftShape }), makeCtx(300, 280, true));

      const action = moveActions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      const shape = action.shape;
      if (!shape || shape.type !== 'ellipse') throw new Error('expected ellipse');
      expect(shape.rx).toBe(50);
      expect(shape.ry).toBe(50);
      expect(shape.cx).toBe(250);
      expect(shape.cy).toBe(250);
      // The bounding box bottom edge (cy+r) is 300, which is past the cursor's y=280
      expect(shape.cy + shape.ry).toBe(300);
    });

    it('shift-constrained circle extends past cursor (up-left drag)', () => {
      // Start at (200, 200), drag to (100, 120) + Shift: dxRaw=-100, dyRaw=-80
      // Without shift: rx=50, ry=40. With shift: r=max(50,40)=50
      // cx = 200 + (-1)*50 = 150, cy = 200 + (-1)*50 = 150
      // Top edge (cy-r=100) is at y=100; cursor was at y=120 — circle extends past cursor
      const downActions = EllipseTool.onPointerDown(makeState(), makeCtx(200, 200));
      const draftShape = downActions[0]!.type === 'SET_DRAFT' ? downActions[0]!.shape : null;

      const moveActions = EllipseTool.onPointerMove(makeState({ draftShape }), makeCtx(100, 120, true));

      const action = moveActions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      const shape = action.shape;
      if (!shape || shape.type !== 'ellipse') throw new Error('expected ellipse');
      expect(shape.rx).toBe(50);
      expect(shape.ry).toBe(50);
      expect(shape.cx).toBe(150);
      expect(shape.cy).toBe(150);
    });
  });

  describe('onPointerMove() — four-quadrant bounding box coverage', () => {
    // Verify that the ellipse inscribes the drag bounding box in all four drag directions.
    // For a drag from (200,200) with |dx|=100, |dy|=80:
    //   rx=50, ry=40; the ellipse extents match the bounding box on all 4 sides.

    function getEllipseFromDrag(toX: number, toY: number) {
      const downActions = EllipseTool.onPointerDown(makeState(), makeCtx(200, 200));
      const draftShape = downActions[0]!.type === 'SET_DRAFT' ? downActions[0]!.shape : null;
      const moveActions = EllipseTool.onPointerMove(makeState({ draftShape }), makeCtx(toX, toY, false));
      const action = moveActions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      const shape = action.shape;
      if (!shape || shape.type !== 'ellipse') throw new Error('expected ellipse');
      return shape;
    }

    it('down-right drag: ellipse extents match bounding box on all 4 sides', () => {
      // (200,200) → (300,280): bounding box x:[200,300], y:[200,280]
      const shape = getEllipseFromDrag(300, 280);
      expect(shape.rx).toBe(50);
      expect(shape.ry).toBe(40);
      expect(shape.cx).toBe(250);
      expect(shape.cy).toBe(240);
      // Extents must touch bounding box edges
      expect(shape.cx - shape.rx).toBe(200); // left edge
      expect(shape.cx + shape.rx).toBe(300); // right edge
      expect(shape.cy - shape.ry).toBe(200); // top edge
      expect(shape.cy + shape.ry).toBe(280); // bottom edge
    });

    it('down-left drag: ellipse extents match bounding box on all 4 sides', () => {
      // (200,200) → (100,280): bounding box x:[100,200], y:[200,280]
      const shape = getEllipseFromDrag(100, 280);
      expect(shape.rx).toBe(50);
      expect(shape.ry).toBe(40);
      expect(shape.cx).toBe(150);
      expect(shape.cy).toBe(240);
      expect(shape.cx - shape.rx).toBe(100); // left edge
      expect(shape.cx + shape.rx).toBe(200); // right edge
      expect(shape.cy - shape.ry).toBe(200); // top edge
      expect(shape.cy + shape.ry).toBe(280); // bottom edge
    });

    it('up-right drag: ellipse extents match bounding box on all 4 sides', () => {
      // (200,200) → (300,120): bounding box x:[200,300], y:[120,200]
      const shape = getEllipseFromDrag(300, 120);
      expect(shape.rx).toBe(50);
      expect(shape.ry).toBe(40);
      expect(shape.cx).toBe(250);
      expect(shape.cy).toBe(160);
      expect(shape.cx - shape.rx).toBe(200); // left edge
      expect(shape.cx + shape.rx).toBe(300); // right edge
      expect(shape.cy - shape.ry).toBe(120); // top edge
      expect(shape.cy + shape.ry).toBe(200); // bottom edge
    });

    it('up-left drag: ellipse extents match bounding box on all 4 sides', () => {
      // (200,200) → (100,120): bounding box x:[100,200], y:[120,200]
      const shape = getEllipseFromDrag(100, 120);
      expect(shape.rx).toBe(50);
      expect(shape.ry).toBe(40);
      expect(shape.cx).toBe(150);
      expect(shape.cy).toBe(160);
      expect(shape.cx - shape.rx).toBe(100); // left edge
      expect(shape.cx + shape.rx).toBe(200); // right edge
      expect(shape.cy - shape.ry).toBe(120); // top edge
      expect(shape.cy + shape.ry).toBe(200); // bottom edge
    });
  });

  describe('onPointerUp()', () => {
    it('returns COMMIT_DRAFT when rx>=1 and ry>=1', () => {
      const downActions = EllipseTool.onPointerDown(makeState(), makeCtx(100, 100));
      const draftShape0 = downActions[0]!.type === 'SET_DRAFT' ? downActions[0]!.shape : null;

      // Move to create a large ellipse
      const moveActions = EllipseTool.onPointerMove(makeState({ draftShape: draftShape0 }), makeCtx(200, 200));
      const largeDraft = moveActions[0]!.type === 'SET_DRAFT' ? moveActions[0]!.shape : null;

      const upActions = EllipseTool.onPointerUp(makeState({ draftShape: largeDraft }), makeCtx(200, 200));

      expect(upActions).toHaveLength(1);
      expect(upActions[0]!.type).toBe('COMMIT_DRAFT');
    });

    it('returns SET_DRAFT(null) when rx < 1 (too small)', () => {
      EllipseTool.onPointerDown(makeState(), makeCtx(100, 100));

      const tinyRx = {
        type: 'ellipse' as const,
        id: 'tiny-rx',
        cx: 100,
        cy: 100,
        rx: 0,
        ry: 50,
        stroke: '#dc2626',
        strokeWidth: 4,
      };

      const upActions = EllipseTool.onPointerUp(makeState({ draftShape: tinyRx }), makeCtx(100, 100));

      expect(upActions).toHaveLength(1);
      const action = upActions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      expect(action.shape).toBeNull();
    });

    it('returns SET_DRAFT(null) when ry < 1 (too small)', () => {
      EllipseTool.onPointerDown(makeState(), makeCtx(100, 100));

      const tinyRy = {
        type: 'ellipse' as const,
        id: 'tiny-ry',
        cx: 100,
        cy: 100,
        rx: 50,
        ry: 0,
        stroke: '#dc2626',
        strokeWidth: 4,
      };

      const upActions = EllipseTool.onPointerUp(makeState({ draftShape: tinyRy }), makeCtx(100, 100));

      expect(upActions).toHaveLength(1);
      const action = upActions[0]!;
      if (action.type !== 'SET_DRAFT') throw new Error('expected SET_DRAFT');
      expect(action.shape).toBeNull();
    });

    it('commits exactly at rx=1 and ry=1 (at threshold)', () => {
      EllipseTool.onPointerDown(makeState(), makeCtx(100, 100));

      const atThreshold = {
        type: 'ellipse' as const,
        id: 'threshold',
        cx: 100,
        cy: 100,
        rx: 1,
        ry: 1,
        stroke: '#dc2626',
        strokeWidth: 4,
      };

      const upActions = EllipseTool.onPointerUp(makeState({ draftShape: atThreshold }), makeCtx(101, 101));

      expect(upActions[0]!.type).toBe('COMMIT_DRAFT');
    });

    it('returns empty array when draftShape is null on pointer up', () => {
      const upActions = EllipseTool.onPointerUp(makeState({ draftShape: null }), makeCtx(100, 100));
      expect(upActions).toHaveLength(0);
    });
  });

  describe('cursor', () => {
    it('has cursor "crosshair"', () => {
      expect(EllipseTool.cursor).toBe('crosshair');
    });
  });
});
