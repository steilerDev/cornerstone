/**
 * Jest manual mock for the `react-konva` npm package.
 *
 * react-konva re-exports from konva which requires the native `canvas` package
 * (forbidden by project policy). This mock provides stub React components that
 * render plain <div> elements so any test that mounts PhotoAnnotator can run
 * under jsdom without the canvas dependency.
 *
 * Activated automatically by Jest when a test does `jest.mock('react-konva')`.
 */

import React from 'react';

type AnyProps = Record<string, unknown> & { children?: React.ReactNode };

const DOM_SAFE_PROPS = new Set(['className', 'style', 'id', 'aria-label', 'role']);

function filterProps(props: AnyProps): Record<string, unknown> {
  const safe: Record<string, unknown> = { 'data-konva-stub': true };
  for (const [k, v] of Object.entries(props)) {
    if (DOM_SAFE_PROPS.has(k)) safe[k] = v;
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

export const Stage = makeStub('KonvaStage');
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
