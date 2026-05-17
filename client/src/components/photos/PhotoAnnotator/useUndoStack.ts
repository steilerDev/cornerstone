import { useState, useCallback } from 'react';

export interface RectangleShape {
  type: 'rectangle';
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  strokeWidth: number;
}

export interface HighlightShape {
  type: 'highlight';
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
}

export type AnnotationShape = RectangleShape | HighlightShape;

export interface UndoStack {
  past: AnnotationShape[][];
  present: AnnotationShape[];
  future: AnnotationShape[][];
}

export interface UseUndoStackResult {
  shapes: AnnotationShape[];
  canUndo: boolean;
  canRedo: boolean;
  commit: (newShapes: AnnotationShape[]) => void;
  undo: () => void;
  redo: () => void;
  clear: () => void;
  replace: (shapes: AnnotationShape[]) => void;
}

export function useUndoStack(initialShapes: AnnotationShape[] = []): UseUndoStackResult {
  const [stack, setStack] = useState<UndoStack>({
    past: [],
    present: initialShapes,
    future: [],
  });

  const commit = useCallback((newShapes: AnnotationShape[]) => {
    setStack((prev) => ({
      past: [...prev.past, prev.present],
      present: newShapes,
      future: [],
    }));
  }, []);

  const undo = useCallback(() => {
    setStack((prev) => {
      if (prev.past.length === 0) return prev;
      const newPast = prev.past.slice(0, -1);
      const newPresent = prev.past[prev.past.length - 1]!;
      return {
        past: newPast,
        present: newPresent,
        future: [prev.present, ...prev.future],
      };
    });
  }, []);

  const redo = useCallback(() => {
    setStack((prev) => {
      if (prev.future.length === 0) return prev;
      const newPresent = prev.future[0]!;
      const newFuture = prev.future.slice(1);
      return {
        past: [...prev.past, prev.present],
        present: newPresent,
        future: newFuture,
      };
    });
  }, []);

  const clear = useCallback(() => {
    setStack({
      past: [],
      present: stack.present,
      future: [],
    });
  }, [stack.present]);

  const replace = useCallback((shapes: AnnotationShape[]) => {
    setStack((prev) => ({
      ...prev,
      present: shapes,
    }));
  }, []);

  return {
    shapes: stack.present,
    canUndo: stack.past.length > 0,
    canRedo: stack.future.length > 0,
    commit,
    undo,
    redo,
    clear,
    replace,
  };
}
