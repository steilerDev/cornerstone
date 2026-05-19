/**
 * ESM manual mock for the `konva` npm package.
 *
 * konva's Node.js entry point requires the native `canvas` package, which we
 * can't install (native binary). This stub replaces all Konva classes with
 * no-op constructors so any module that imports Konva can be loaded under
 * Jest's ESM-experimental mode without resolving the native dependency.
 *
 * Activated automatically by Jest when a test does `jest.mock('konva')`.
 */

class StubKonvaNode {
  id() {
    return '';
  }
  points() {
    return [];
  }
  x() {
    return 0;
  }
  y() {
    return 0;
  }
  nodes() {}
  batchDraw() {}
  add() {}
  destroy() {}
  getStage() {
    return null;
  }
  getPointerPosition() {
    return { x: 0, y: 0 };
  }
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

export default Konva;
export const Stage = StubKonvaNode;
export const Layer = StubKonvaNode;
export const Node = StubKonvaNode;
export const Transformer = StubKonvaNode;
export const Arrow = StubKonvaNode;
export const Line = StubKonvaNode;
export const Rect = StubKonvaNode;
export const Ellipse = StubKonvaNode;
export const Text = StubKonvaNode;
export const Group = StubKonvaNode;
export const Image = StubKonvaNode;
