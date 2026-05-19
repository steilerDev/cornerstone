/**
 * Manual mock for the `react-konva` npm package.
 *
 * react-konva re-exports from konva which requires the native `canvas` package.
 * This CJS mock provides stub React components that render plain <div> elements
 * so PhotoAnnotator tests can run in JSDOM without a canvas renderer.
 *
 * Each stub component:
 *   - Renders a <div data-konva-stub="true"> wrapper
 *   - Forwards children so the component tree renders correctly
 *   - Filters out Konva-specific props that React would warn about on <div>
 *
 * Activated by: jest.mock('react-konva') in test files that need it.
 */

'use strict';

const React = require('react');

/** Props allowed through to the underlying DOM div */
const DOM_SAFE_PROPS = new Set(['className', 'style', 'id', 'aria-label', 'role']);

function filterProps(props) {
  const safe = { 'data-konva-stub': true };
  for (const [k, v] of Object.entries(props)) {
    if (DOM_SAFE_PROPS.has(k)) safe[k] = v;
  }
  return safe;
}

function makeStub(displayName) {
  function Stub({ children, ...rest }) {
    return React.createElement('div', filterProps(rest), children);
  }
  Stub.displayName = displayName;
  return Stub;
}

// Stubs for all react-konva exports used by PhotoAnnotator.tsx
const Stage = makeStub('KonvaStage');
const Layer = makeStub('KonvaLayer');
const Image = makeStub('KonvaImage');
const Rect = makeStub('KonvaRect');
const Line = makeStub('KonvaLine');
const Ellipse = makeStub('KonvaEllipse');
const Text = makeStub('KonvaText');
const Group = makeStub('KonvaGroup');
const Arrow = makeStub('KonvaArrow');
const Transformer = makeStub('KonvaTransformer');
const Circle = makeStub('KonvaCircle');
const Path = makeStub('KonvaPath');
const Star = makeStub('KonvaStar');
const Ring = makeStub('KonvaRing');

module.exports = {
  Stage,
  Layer,
  Image,
  Rect,
  Line,
  Ellipse,
  Text,
  Group,
  Arrow,
  Transformer,
  Circle,
  Path,
  Star,
  Ring,
};
