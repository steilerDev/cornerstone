/**
 * Manual mock for the `konva` npm package.
 *
 * konva's Node.js entry point (`lib/index-node.js`) requires the native `canvas`
 * package which cannot be installed in this project (native binary, project policy).
 * This CJS mock replaces all Konva classes with no-op stubs so tests that import
 * PhotoAnnotator (which uses Konva) can run in JSDOM without the native `canvas` dep.
 *
 * Activated by: jest.mock('konva') in test files that need it.
 */

'use strict';

class StubKonvaNode {
  id() { return ''; }
  points() { return []; }
  x() { return 0; }
  y() { return 0; }
  nodes() {}
  batchDraw() {}
  add() {}
  destroy() {}
  getStage() { return null; }
  getPointerPosition() { return { x: 0, y: 0 }; }
}

const Konva = {
  Stage: StubKonvaNode,
  Layer: StubKonvaNode,
  Node: StubKonvaNode,
  Transformer: StubKonvaNode,
  Arrow: StubKonvaNode,
  Line: StubKonvaNode,
  Rect: StubKonvaNode,
  Ellipse: StubKonvaNode,
  Text: StubKonvaNode,
  Group: StubKonvaNode,
  Image: StubKonvaNode,
};

module.exports = Konva;
module.exports.default = Konva;
