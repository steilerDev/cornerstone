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

export interface ArrowShape {
  type: 'arrow';
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke: string;
  strokeWidth: number;
}

export interface LineShape {
  type: 'line';
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke: string;
  strokeWidth: number;
}

export interface EllipseShape {
  type: 'ellipse';
  id: string;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  stroke: string;
  strokeWidth: number;
}

export interface TextShape {
  type: 'text';
  id: string;
  x: number; // image-space anchor — baseline left
  y: number; // image-space anchor — baseline top (top of cap-height)
  text: string;
  fontSize: number; // image-space pixels
  color: string;
}

export interface MeasurementShape {
  type: 'measurement';
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label: string;
  stroke: string;
  strokeWidth: number;
  fontSize: number;
  color: string;
}

export interface FreehandShape {
  type: 'freehand';
  id: string;
  points: [number, number][];
  stroke: string;
  strokeWidth: number;
}

export type AnnotationShape =
  | RectangleShape
  | HighlightShape
  | ArrowShape
  | LineShape
  | EllipseShape
  | TextShape
  | MeasurementShape
  | FreehandShape;

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
