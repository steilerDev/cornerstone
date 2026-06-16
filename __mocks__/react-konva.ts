/**
 * Jest manual mock for the `react-konva` npm package.
 *
 * react-konva re-exports from konva which requires the native `canvas` package
 * (forbidden by project policy). This mock provides stub React components that
 * render plain <div> elements so any test that mounts PhotoAnnotator can run
 * under jsdom without the canvas dependency.
 *
 * Activated automatically by Jest when a test does `jest.mock('react-konva')`.
 *
 * Extensions for #1705 (responsive scaling + touch support tests):
 *   - DATA_FORWARDED_PROPS includes width/height/scaleX/scaleY so Stage
 *     size/scale assertions work via DOM data attributes.
 *   - Handler presence flags: onMouseDown/Move/Up, onTouchStart/Move/End, and
 *     onPointerDown/Move/Up are forwarded as data-has-* attributes ('true'/'false')
 *     so tests can verify which event model the Stage uses (mouse+touch, not pointer).
 *   - Stage uses React.forwardRef so stageRef.current is a mock Konva-like
 *     object with container(), getPointerPosition(), getParent() — enabling
 *     effects that call stageRef.current to work in tests.
 *   - stageMockContainer: exported module-level container mock (kept for compatibility).
 *   - stageMockHandlers: captured Stage mouse+touch handler props for firing
 *     synthetic events in drawing tests.
 */

import React from 'react';

type AnyProps = Record<string, unknown> & { children?: React.ReactNode };

const DOM_SAFE_PROPS = new Set(['className', 'style', 'id', 'aria-label', 'role']);

// Props that are forwarded as data-* attributes so tests can assert on them.
// Each entry maps the prop name to its data-* attribute name.
const DATA_FORWARDED_PROPS: Record<string, string> = {
  rotateAnchorAngle: 'data-rotate-anchor-angle',
  // Stage sizing/scaling props (for #1705 responsive scaling tests)
  width: 'data-stage-width',
  height: 'data-stage-height',
  scaleX: 'data-stage-scale-x',
  scaleY: 'data-stage-scale-y',
};

// Event handler presence flags forwarded as data-has-* attributes
const HANDLER_PRESENCE_PROPS = new Set([
  'onMouseDown',
  'onMouseMove',
  'onMouseUp',
  'onTouchStart',
  'onTouchMove',
  'onTouchEnd',
  // Keep pointer handlers in the set so absence is also reported (value = 'false')
  'onPointerDown',
  'onPointerMove',
  'onPointerUp',
]);

function filterProps(props: AnyProps, forStage = false): Record<string, unknown> {
  const safe: Record<string, unknown> = { 'data-konva-stub': true };
  for (const [k, v] of Object.entries(props)) {
    if (DOM_SAFE_PROPS.has(k)) safe[k] = v;
    if (Object.prototype.hasOwnProperty.call(DATA_FORWARDED_PROPS, k)) {
      safe[DATA_FORWARDED_PROPS[k]!] = String(v);
    }
    if (forStage && HANDLER_PRESENCE_PROPS.has(k)) {
      safe[`data-has-${k.replace(/^on/, '').toLowerCase()}`] =
        typeof v === 'function' ? 'true' : 'false';
    }
  }
  return safe;
}

function makeStub(displayName: string): React.FC<AnyProps> {
  function Stub({ children, ...rest }: AnyProps) {
    return React.createElement('div', filterProps(rest), children);
  }
  Stub.displayName = displayName;
  return Stub;
}

// ─── Stage mock container ─────────────────────────────────────────────────────
//
// stageMockContainer is a module-level container mock. stageRef.current.container()
// always returns this same object, so test assertions remain stable.
// addEventListener/removeEventListener/setPointerCapture are kept for backwards
// compatibility (the pointer-capture useEffect was removed in #1705 revision 2).

// Use a generic function signature to avoid referencing jest types at module scope.
// jest.fn() must NEVER appear at module scope in __mocks__/ files — it is not
// available when the Jest ESM module sandbox evaluates the mock at import time.
// PhotoAnnotator.test.tsx installs fresh spies by mutating these fields in-place
// in its beforeEach (see the comment there).
export interface StageMockContainer {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addEventListener: (...args: any[]) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  removeEventListener: (...args: any[]) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setPointerCapture: (...args: any[]) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getBoundingClientRect: (...args: any[]) => any;
  parentElement: null;
}

// Module-level container mock — starts with plain no-op functions so ANY test
// suite can import this module without touching jest.*. PhotoAnnotator.test.tsx
// replaces these with jest.fn() spies in beforeEach by writing directly to the
// properties of this object.
export const stageMockContainer: StageMockContainer = {
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  setPointerCapture: () => undefined,
  getBoundingClientRect: () => ({
    top: 0,
    left: 0,
    width: 400,
    height: 300,
    bottom: 300,
    right: 400,
  }),
  parentElement: null,
};

// Captured event handler props from the most recently rendered Stage.
// Tests use these to fire synthetic events and exercise drawing code paths.
// Production code uses mouse + touch events (not pointer events).
export interface StageMockHandlers {
  onMouseDown?: (e: unknown) => void;
  onMouseMove?: (e: unknown) => void;
  onMouseUp?: (e: unknown) => void;
  onTouchStart?: (e: unknown) => void;
  onTouchMove?: (e: unknown) => void;
  onTouchEnd?: (e: unknown) => void;
}
export const stageMockHandlers: StageMockHandlers = {};

// Mock Konva.Stage-like object exposed via forwardRef useImperativeHandle.
//
// IMPORTANT: getPointerPosition() and getRelativePointerPosition() return
// DIFFERENT independently-settable values so tests can discriminate which method
// the production drawing handlers call.
//
// getPointerPosition()         → screen/container-space coords (0…intrinsicW*fitScale)
// getRelativePointerPosition() → intrinsic image-space coords  (0…intrinsicW)
//
// The production drawing handlers (handleStagePointerDown/Move) call
// getRelativePointerPosition() so committed shape coords are in intrinsic space.
// A test can set both to distinct values: if production regresses to
// getPointerPosition() the asserted shape coords will not match.
export interface MockKonvaStage {
  container: () => StageMockContainer;
  getPointerPosition: () => { x: number; y: number } | null;
  getRelativePointerPosition: () => { x: number; y: number } | null;
  getParent: () => null;
  getStage: () => MockKonvaStage;
}

// Controllable pointer positions — tests can set these before firing events.
// getPointerPosition returns screen/container-space coords (intentionally different
// from getRelativePointerPosition so a test can tell which method was used).
export let mockStagePointerPosition: { x: number; y: number } | null = { x: 0, y: 0 };
export function setMockStagePointerPosition(pos: { x: number; y: number } | null) {
  mockStagePointerPosition = pos;
}

// getRelativePointerPosition returns intrinsic image-space coords.
// Default matches mockStagePointerPosition at {x:0, y:0}; tests that want
// discrimination must set this to a DIFFERENT value than mockStagePointerPosition.
export let mockStageRelativePointerPosition: { x: number; y: number } | null = { x: 0, y: 0 };
export function setMockStageRelativePointerPosition(pos: { x: number; y: number } | null) {
  mockStageRelativePointerPosition = pos;
}

// Stage with forwardRef so stageRef.current is non-null in PhotoAnnotator.
// Uses useImperativeHandle to expose the mock Konva stage interface.
export const Stage = React.forwardRef<MockKonvaStage, AnyProps>(function KonvaStageStub(
  { children, ...rest }: AnyProps,
  ref,
) {
  // Capture the most recent handler props into the shared stageMockHandlers object.
  // (Mutate in place so any reference held by tests is updated.)
  // Production code uses mouse + touch events, not pointer events.
  stageMockHandlers.onMouseDown =
    typeof rest.onMouseDown === 'function' ? (rest.onMouseDown as (e: unknown) => void) : undefined;
  stageMockHandlers.onMouseMove =
    typeof rest.onMouseMove === 'function' ? (rest.onMouseMove as (e: unknown) => void) : undefined;
  stageMockHandlers.onMouseUp =
    typeof rest.onMouseUp === 'function' ? (rest.onMouseUp as (e: unknown) => void) : undefined;
  stageMockHandlers.onTouchStart =
    typeof rest.onTouchStart === 'function'
      ? (rest.onTouchStart as (e: unknown) => void)
      : undefined;
  stageMockHandlers.onTouchMove =
    typeof rest.onTouchMove === 'function' ? (rest.onTouchMove as (e: unknown) => void) : undefined;
  stageMockHandlers.onTouchEnd =
    typeof rest.onTouchEnd === 'function' ? (rest.onTouchEnd as (e: unknown) => void) : undefined;

  // Build the stable mock Konva stage object. useImperativeHandle deps=[] so
  // stageRef.current is set once after first render and remains stable.
  //
  // getPointerPosition()         → mockStagePointerPosition (screen/container space)
  // getRelativePointerPosition() → mockStageRelativePointerPosition (intrinsic image space)
  //
  // These intentionally return DIFFERENT values so tests can discriminate which
  // method production code calls. The production drawing handlers call
  // getRelativePointerPosition() so shape coords end up in intrinsic image space.
  React.useImperativeHandle(
    ref,
    (): MockKonvaStage => ({
      container: () => stageMockContainer,
      getPointerPosition: () => mockStagePointerPosition,
      getRelativePointerPosition: () => mockStageRelativePointerPosition,
      getParent: () => null,
      getStage: function () {
        return this;
      },
    }),
    [],
  );

  return React.createElement(
    'div',
    { ...filterProps(rest, true), 'data-konva-stage-stub': true },
    children,
  );
});

export const Layer = makeStub('KonvaLayer');
export const Image = makeStub('KonvaImage');
export const Rect = makeStub('KonvaRect');
export const Line = makeStub('KonvaLine');
export const Ellipse = makeStub('KonvaEllipse');
export const Text = makeStub('KonvaText');
export const Group = makeStub('KonvaGroup');
export const Arrow = makeStub('KonvaArrow');
export const Transformer = makeStub('KonvaTransformer');
export const Circle = makeStub('KonvaCircle');
export const Path = makeStub('KonvaPath');
export const Star = makeStub('KonvaStar');
export const Ring = makeStub('KonvaRing');
