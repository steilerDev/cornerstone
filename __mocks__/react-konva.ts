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
 *   - Handler presence flags: onPointerDown/Move/Up and onMouseDown/Move/Up are
 *     forwarded as data-has-* attributes ('true'/'false') so tests can verify
 *     which event model the Stage uses.
 *   - Stage uses React.forwardRef so stageRef.current is a mock Konva-like
 *     object with container(), getPointerPosition(), getParent() — enabling
 *     the pointer-capture useEffect to be exercised in tests.
 *   - stageMockContainer: exported module-level container mock with spied
 *     addEventListener/removeEventListener for pointer-capture assertions.
 *   - stageMockHandlers: captured Stage event handler props for firing
 *     synthetic pointer events in drawing tests.
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
  'onPointerDown', 'onPointerMove', 'onPointerUp',
  'onMouseDown', 'onMouseMove', 'onMouseUp',
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

// ─── Stage mock container: supports pointer-capture useEffect ─────────────────
//
// The pointer-capture useEffect in PhotoAnnotator calls:
//   stageRef.current.container()
// and then calls addEventListener/removeEventListener on the result.
//
// stageMockContainer is a module-level container mock with spied
// addEventListener/removeEventListener. stageRef.current.container() always
// returns this same object, so test assertions remain stable.

export interface StageMockContainer {
  addEventListener: ReturnType<typeof jest.fn>;
  removeEventListener: ReturnType<typeof jest.fn>;
  setPointerCapture: ReturnType<typeof jest.fn>;
  getBoundingClientRect: ReturnType<typeof jest.fn>;
  parentElement: null;
}

export const stageMockContainer: StageMockContainer = {
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  setPointerCapture: jest.fn(),
  getBoundingClientRect: jest.fn(() => ({
    top: 0, left: 0, width: 400, height: 300, bottom: 300, right: 400,
  })),
  parentElement: null,
};

// Captured event handler props from the most recently rendered Stage.
// Tests use these to fire synthetic events and exercise drawing code paths.
export interface StageMockHandlers {
  onPointerDown?: (e: unknown) => void;
  onPointerMove?: (e: unknown) => void;
  onPointerUp?: (e: unknown) => void;
}
export const stageMockHandlers: StageMockHandlers = {};

// Mock Konva.Stage-like object exposed via forwardRef useImperativeHandle.
export interface MockKonvaStage {
  container: () => StageMockContainer;
  getPointerPosition: () => { x: number; y: number } | null;
  getParent: () => null;
  getStage: () => MockKonvaStage;
}

// Controllable pointer position — tests can set this before firing events.
// Default: { x: 0, y: 0 } (matches StubKonvaNode.getPointerPosition default).
export let mockStagePointerPosition: { x: number; y: number } | null = { x: 0, y: 0 };
export function setMockStagePointerPosition(pos: { x: number; y: number } | null) {
  mockStagePointerPosition = pos;
}

// Stage with forwardRef so stageRef.current is non-null in PhotoAnnotator.
// Uses useImperativeHandle to expose the mock Konva stage interface.
export const Stage = React.forwardRef<MockKonvaStage, AnyProps>(function KonvaStageStub(
  { children, ...rest }: AnyProps,
  ref,
) {
  // Capture the most recent handler props into the shared stageMockHandlers object.
  // (Mutate in place so any reference held by tests is updated.)
  stageMockHandlers.onPointerDown = typeof rest.onPointerDown === 'function'
    ? (rest.onPointerDown as (e: unknown) => void)
    : undefined;
  stageMockHandlers.onPointerMove = typeof rest.onPointerMove === 'function'
    ? (rest.onPointerMove as (e: unknown) => void)
    : undefined;
  stageMockHandlers.onPointerUp = typeof rest.onPointerUp === 'function'
    ? (rest.onPointerUp as (e: unknown) => void)
    : undefined;

  // Build the stable mock Konva stage object. useImperativeHandle deps=[] so
  // stageRef.current is set once after first render and remains stable.
  React.useImperativeHandle(
    ref,
    (): MockKonvaStage => ({
      container: () => stageMockContainer,
      getPointerPosition: () => mockStagePointerPosition,
      getParent: () => null,
      getStage: function() { return this; },
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
