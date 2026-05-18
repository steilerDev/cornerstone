import { useReducer, useCallback } from 'react';
import { useUndoStack } from './useUndoStack.js';
import type {
  AnnotationShape,
  RectangleShape,
  HighlightShape,
  TextShape,
  CalloutShape,
} from './useUndoStack.js';
import type { UseUndoStackResult } from './useUndoStack.js';
import type { ANNOTATION_STROKE_WIDTHS } from './annotationConstants.js';
import { DEFAULT_COLOR, DEFAULT_STROKE_WIDTH, DEFAULT_FONT_SIZE } from './annotationConstants.js';

export type ToolName = 'select' | 'rectangle' | 'highlight' | 'arrow' | 'line' | 'ellipse' | 'text' | 'callout' | 'measurement' | 'freehand';

export type StrokeWidthKey = keyof typeof ANNOTATION_STROKE_WIDTHS;

export type {
  AnnotationShape,
  RectangleShape,
  HighlightShape,
  ArrowShape,
  LineShape,
  EllipseShape,
  TextShape,
  CalloutShape,
  MeasurementShape,
  FreehandShape,
} from './useUndoStack.js';

export type DragMode = 'move' | 'resize' | null;

export interface SelectDragState {
  mode: DragMode;
  shapeId: string | null;
  handle: string | null; // HandlePosition serialized as string
  startImageX: number;
  startImageY: number;
  startShape: AnnotationShape | null;
}

export interface AnnotatorState {
  shapes: AnnotationShape[];
  draftShape: AnnotationShape | null;
  selectedShapeId: string | null;
  selectedTool: ToolName;
  activeColor: string;
  activeStrokeWidthKey: StrokeWidthKey;
  activeFontSize: number;
  selectDragState: SelectDragState;
}

export type AnnotatorAction =
  | { type: 'SET_TOOL'; tool: ToolName }
  | { type: 'SET_COLOR'; color: string }
  | { type: 'SET_STROKE_WIDTH'; key: StrokeWidthKey }
  | { type: 'SET_FONT_SIZE'; size: number }
  | { type: 'SET_DRAFT'; shape: AnnotationShape | null }
  | { type: 'COMMIT_DRAFT' }
  | { type: 'SELECT_SHAPE'; id: string | null }
  | { type: 'UPDATE_SHAPE'; shape: AnnotationShape }
  | { type: 'DELETE_SELECTED' }
  | { type: 'REPLACE_SHAPES'; shapes: AnnotationShape[] }
  | { type: 'OPEN_INLINE_INPUT'; shapeId: string | null }
  | { type: 'CLOSE_INLINE_INPUT' }
  | {
      type: 'START_DRAG';
      mode: DragMode;
      shapeId: string | null;
      handle: string | null;
      imageX: number;
      imageY: number;
      shape: AnnotationShape | null;
    }
  | { type: 'END_DRAG' };

export function annotatorReducer(
  state: AnnotatorState,
  action: AnnotatorAction,
  undoStack?: UseUndoStackResult,
): AnnotatorState {
  switch (action.type) {
    case 'SET_TOOL':
      return { ...state, selectedTool: action.tool };

    case 'SET_COLOR':
      return { ...state, activeColor: action.color };

    case 'SET_STROKE_WIDTH':
      return { ...state, activeStrokeWidthKey: action.key };

    case 'SET_FONT_SIZE':
      return { ...state, activeFontSize: action.size };

    case 'SET_DRAFT':
      return { ...state, draftShape: action.shape };

    case 'COMMIT_DRAFT':
      if (!state.draftShape) return state;
      const newShapes = [...state.shapes, state.draftShape];
      undoStack?.commit(newShapes);
      return {
        ...state,
        shapes: newShapes,
        draftShape: null,
        selectedShapeId: null,
      };

    case 'SELECT_SHAPE':
      return { ...state, selectedShapeId: action.id };

    case 'UPDATE_SHAPE':
      const updatedShapes = state.shapes.map((s) => (s.id === action.shape.id ? action.shape : s));
      return { ...state, shapes: updatedShapes };

    case 'DELETE_SELECTED':
      if (!state.selectedShapeId) return state;
      const filtered = state.shapes.filter((s) => s.id !== state.selectedShapeId);
      undoStack?.commit(filtered);
      return {
        ...state,
        shapes: filtered,
        selectedShapeId: null,
      };

    case 'REPLACE_SHAPES':
      return { ...state, shapes: action.shapes };

    case 'START_DRAG':
      return {
        ...state,
        selectDragState: {
          mode: action.mode,
          shapeId: action.shapeId,
          handle: action.handle,
          startImageX: action.imageX,
          startImageY: action.imageY,
          startShape: action.shape,
        },
      };

    case 'END_DRAG':
      return {
        ...state,
        selectDragState: {
          mode: null,
          shapeId: null,
          handle: null,
          startImageX: 0,
          startImageY: 0,
          startShape: null,
        },
      };

    case 'OPEN_INLINE_INPUT':
    case 'CLOSE_INLINE_INPUT':
      // These are signals for the host component; reducer returns state as-is
      return state;

    default:
      return state;
  }
}

export function useAnnotator(initialShapes?: AnnotationShape[]): {
  state: AnnotatorState;
  dispatch: React.Dispatch<AnnotatorAction>;
  undoStack: UseUndoStackResult;
} {
  const undoStack = useUndoStack(initialShapes);

  const initialState: AnnotatorState = {
    shapes: undoStack.shapes,
    draftShape: null,
    selectedShapeId: null,
    selectedTool: 'select',
    activeColor: DEFAULT_COLOR,
    activeStrokeWidthKey: DEFAULT_STROKE_WIDTH,
    activeFontSize: DEFAULT_FONT_SIZE,
    selectDragState: {
      mode: null,
      shapeId: null,
      handle: null,
      startImageX: 0,
      startImageY: 0,
      startShape: null,
    },
  };

  const [state, dispatchBase] = useReducer(
    (s: AnnotatorState, a: AnnotatorAction) => annotatorReducer(s, a, undoStack),
    initialState,
  );

  const dispatch = useCallback((action: AnnotatorAction) => {
    dispatchBase(action);
  }, []);

  return {
    state: { ...state, shapes: undoStack.shapes },
    dispatch,
    undoStack,
  };
}
