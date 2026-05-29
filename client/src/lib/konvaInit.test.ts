/**
 * Unit tests for konvaInit.ts
 *
 * Story #1569: Konva legacyTextRendering initialization
 *
 * Tests:
 *   - Importing the module sets Konva.legacyTextRendering = true
 *
 * Notes:
 *   The jest config maps '^konva$' to '<rootDir>/__mocks__/konva.ts' via moduleNameMapper,
 *   so the mock is always active for client tests — no jest.mock('konva') call is needed.
 *   konvaInit.ts's side effect (Konva.legacyTextRendering = true) sets the property on
 *   the mock object's default export, which we can observe directly.
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import Konva from 'konva';

describe('konvaInit', () => {
  beforeAll(async () => {
    // Trigger the side-effect import. Dynamic import used so the module executes
    // after the konva mock is already in place via moduleNameMapper.
    await import('./konvaInit.js');
  });

  it('sets Konva.legacyTextRendering to true', () => {
    // After importing konvaInit, the side-effect assignment should have fired.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((Konva as any).legacyTextRendering).toBe(true);
  });
});
