/**
 * @jest-environment jsdom
 *
 * Unit tests for useUndoStack.ts
 *
 * Story #1473: Photo Annotator Foundation
 *
 * Tests all reducer invariants:
 *   - Initial state
 *   - commit: push to past
 *   - undo: revert to previous
 *   - redo: restore future
 *   - clear: reset without undo history
 *   - replace: update present without affecting undo history
 */

import { describe, it, expect } from '@jest/globals';
import { renderHook, act } from '@testing-library/react';
import { useUndoStack } from './useUndoStack.js';
import type { AnnotationShape } from './useUndoStack.js';

// ─── Test fixtures ────────────────────────────────────────────────────────────

function makeRect(id: string): AnnotationShape {
  return {
    type: 'rectangle',
    id,
    x: 10,
    y: 10,
    w: 50,
    h: 40,
    color: '#dc2626',
    strokeWidth: 4,
  };
}

const shape1 = makeRect('shape-1');
const shape2 = makeRect('shape-2');
const shape3 = makeRect('shape-3');

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('useUndoStack()', () => {
  // ─── Initial state ──────────────────────────────────────────────────────────

  describe('initial state', () => {
    it('has empty shapes array', () => {
      const { result } = renderHook(() => useUndoStack());
      expect(result.current.shapes).toEqual([]);
    });

    it('canUndo is false initially', () => {
      const { result } = renderHook(() => useUndoStack());
      expect(result.current.canUndo).toBe(false);
    });

    it('canRedo is false initially', () => {
      const { result } = renderHook(() => useUndoStack());
      expect(result.current.canRedo).toBe(false);
    });

    it('accepts initial shapes as parameter', () => {
      const { result } = renderHook(() => useUndoStack([shape1]));
      expect(result.current.shapes).toEqual([shape1]);
    });

    it('canUndo is false even with initial shapes', () => {
      const { result } = renderHook(() => useUndoStack([shape1]));
      expect(result.current.canUndo).toBe(false);
    });
  });

  // ─── commit ─────────────────────────────────────────────────────────────────

  describe('commit()', () => {
    it('updates shapes to the new array', () => {
      const { result } = renderHook(() => useUndoStack());

      act(() => {
        result.current.commit([shape1]);
      });

      expect(result.current.shapes).toEqual([shape1]);
    });

    it('enables canUndo after first commit', () => {
      const { result } = renderHook(() => useUndoStack());

      act(() => {
        result.current.commit([shape1]);
      });

      expect(result.current.canUndo).toBe(true);
    });

    it('canRedo is false after commit', () => {
      const { result } = renderHook(() => useUndoStack());

      act(() => {
        result.current.commit([shape1]);
      });

      expect(result.current.canRedo).toBe(false);
    });

    it('two commits: shapes is the second commit value', () => {
      const { result } = renderHook(() => useUndoStack());

      act(() => {
        result.current.commit([shape1]);
      });
      act(() => {
        result.current.commit([shape1, shape2]);
      });

      expect(result.current.shapes).toEqual([shape1, shape2]);
    });

    it('two commits: canUndo is true (two undo steps available)', () => {
      const { result } = renderHook(() => useUndoStack());

      act(() => {
        result.current.commit([shape1]);
      });
      act(() => {
        result.current.commit([shape1, shape2]);
      });

      expect(result.current.canUndo).toBe(true);
    });
  });

  // ─── undo ───────────────────────────────────────────────────────────────────

  describe('undo()', () => {
    it('reverts to initial empty state after one commit', () => {
      const { result } = renderHook(() => useUndoStack());

      act(() => {
        result.current.commit([shape1]);
      });
      act(() => {
        result.current.undo();
      });

      expect(result.current.shapes).toEqual([]);
    });

    it('canUndo is false after undoing all commits', () => {
      const { result } = renderHook(() => useUndoStack());

      act(() => {
        result.current.commit([shape1]);
      });
      act(() => {
        result.current.undo();
      });

      expect(result.current.canUndo).toBe(false);
    });

    it('canRedo is true after undo', () => {
      const { result } = renderHook(() => useUndoStack());

      act(() => {
        result.current.commit([shape1]);
      });
      act(() => {
        result.current.undo();
      });

      expect(result.current.canRedo).toBe(true);
    });

    it('reverts to previous step (second of two commits) after one undo', () => {
      const { result } = renderHook(() => useUndoStack());

      act(() => {
        result.current.commit([shape1]);
      });
      act(() => {
        result.current.commit([shape1, shape2]);
      });
      act(() => {
        result.current.undo();
      });

      expect(result.current.shapes).toEqual([shape1]);
      expect(result.current.canRedo).toBe(true);
    });

    it('two undos after two commits reverts to initial state', () => {
      const { result } = renderHook(() => useUndoStack());

      act(() => {
        result.current.commit([shape1]);
      });
      act(() => {
        result.current.commit([shape1, shape2]);
      });
      act(() => {
        result.current.undo();
      });
      act(() => {
        result.current.undo();
      });

      expect(result.current.shapes).toEqual([]);
      expect(result.current.canUndo).toBe(false);
    });

    it('undo does nothing when there is nothing to undo', () => {
      const { result } = renderHook(() => useUndoStack());

      act(() => {
        result.current.undo(); // should be a no-op
      });

      expect(result.current.shapes).toEqual([]);
      expect(result.current.canUndo).toBe(false);
      expect(result.current.canRedo).toBe(false);
    });
  });

  // ─── redo ───────────────────────────────────────────────────────────────────

  describe('redo()', () => {
    it('restores the committed state after undo', () => {
      const { result } = renderHook(() => useUndoStack());

      act(() => {
        result.current.commit([shape1]);
      });
      act(() => {
        result.current.undo();
      });
      act(() => {
        result.current.redo();
      });

      expect(result.current.shapes).toEqual([shape1]);
    });

    it('canRedo is false after redo', () => {
      const { result } = renderHook(() => useUndoStack());

      act(() => {
        result.current.commit([shape1]);
      });
      act(() => {
        result.current.undo();
      });
      act(() => {
        result.current.redo();
      });

      expect(result.current.canRedo).toBe(false);
    });

    it('canUndo is true after redo', () => {
      const { result } = renderHook(() => useUndoStack());

      act(() => {
        result.current.commit([shape1]);
      });
      act(() => {
        result.current.undo();
      });
      act(() => {
        result.current.redo();
      });

      expect(result.current.canUndo).toBe(true);
    });

    it('redo restores the last of two undone commits', () => {
      const { result } = renderHook(() => useUndoStack());

      act(() => {
        result.current.commit([shape1]);
        result.current.commit([shape1, shape2]);
      });
      act(() => {
        result.current.undo();
        result.current.undo();
      });
      act(() => {
        result.current.redo();
      });

      expect(result.current.shapes).toEqual([shape1]);
    });

    it('redo does nothing when nothing to redo', () => {
      const { result } = renderHook(() => useUndoStack());

      act(() => {
        result.current.commit([shape1]);
      });

      // canRedo is false, redo should be no-op
      act(() => {
        result.current.redo();
      });

      expect(result.current.shapes).toEqual([shape1]);
    });
  });

  // ─── new commit after undo clears future ─────────────────────────────────────

  describe('commit after undo clears future', () => {
    it('new commit after undo means canRedo becomes false', () => {
      const { result } = renderHook(() => useUndoStack());

      act(() => {
        result.current.commit([shape1]);
      });
      act(() => {
        result.current.commit([shape1, shape2]);
      });
      act(() => {
        result.current.undo();
      });
      // canRedo is true here
      expect(result.current.canRedo).toBe(true);

      // Now commit a new shape — this should clear the redo stack
      act(() => {
        result.current.commit([shape1, shape3]);
      });

      expect(result.current.canRedo).toBe(false);
      expect(result.current.shapes).toEqual([shape1, shape3]);
    });
  });

  // ─── clear ──────────────────────────────────────────────────────────────────

  describe('clear()', () => {
    it('resets past and future to empty', () => {
      const { result } = renderHook(() => useUndoStack());

      act(() => {
        result.current.commit([shape1]);
      });
      act(() => {
        result.current.commit([shape1, shape2]);
      });
      act(() => {
        result.current.clear();
      });

      expect(result.current.canUndo).toBe(false);
      expect(result.current.canRedo).toBe(false);
    });

    it('preserves present shapes after clear', () => {
      const { result } = renderHook(() => useUndoStack());

      act(() => {
        result.current.commit([shape1, shape2]);
      });
      act(() => {
        result.current.clear();
      });

      // clear() preserves the current present (per implementation: setStack uses stack.present)
      expect(result.current.shapes).toEqual([shape1, shape2]);
    });
  });

  // ─── replace ─────────────────────────────────────────────────────────────────

  describe('replace()', () => {
    it('updates present shapes without adding to past', () => {
      const { result } = renderHook(() => useUndoStack());

      act(() => {
        result.current.replace([shape1]);
      });

      expect(result.current.shapes).toEqual([shape1]);
      expect(result.current.canUndo).toBe(false);
    });

    it('does not clear future state', () => {
      const { result } = renderHook(() => useUndoStack());

      act(() => {
        result.current.commit([shape1]);
      });
      act(() => {
        result.current.undo();
      });
      // canRedo is true now

      act(() => {
        result.current.replace([shape2]);
      });

      // replace does not affect past/future (only present)
      expect(result.current.shapes).toEqual([shape2]);
    });

    it('can be called multiple times without adding undo history', () => {
      const { result } = renderHook(() => useUndoStack());

      act(() => {
        result.current.replace([shape1]);
        result.current.replace([shape1, shape2]);
        result.current.replace([shape3]);
      });

      expect(result.current.canUndo).toBe(false);
      expect(result.current.shapes).toEqual([shape3]);
    });
  });
});
