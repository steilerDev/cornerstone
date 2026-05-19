import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { nanoid } from 'nanoid';
import type { Photo } from '@cornerstone/shared';
import {
  useAnnotator,
  type ToolName,
  type FontSizeKey,
  type StrokeWidthKey,
} from './useAnnotator.js';
import type { TextShape, CalloutShape, MeasurementShape } from './useUndoStack.js';
import { resolveFontSize, resolveStrokeWidth } from './annotationConstants.js';
import { ToolPalette } from './ToolPalette.js';
import { RectangleTool } from './tools/RectangleTool.js';
import { HighlightTool } from './tools/HighlightTool.js';
import { ArrowTool } from './tools/ArrowTool.js';
import { LineTool } from './tools/LineTool.js';
import { EllipseTool } from './tools/EllipseTool.js';
import { TextTool } from './tools/TextTool.js';
import { CalloutTool, resetCalloutTool, getCalloutPhase } from './tools/CalloutTool.js';
import { MeasurementTool, resetMeasurementTool } from './tools/MeasurementTool.js';
import { FreehandTool } from './tools/FreehandTool.js';
import { SelectTool } from './tools/SelectTool.js';
import type { PointerContext } from './tools/SelectTool.js';
import { screenToImage, imageToScreen, clamp } from './geometry.js';
import { renderShapeSvgProps, drawShapeOnCanvas, ANNOTATION_FONT_FAMILY } from './render.js';
import { FormError } from '../../FormError/FormError.js';
import { Modal } from '../../Modal/Modal.js';
import { getBaseUrl } from '../../../lib/apiClient.js';
import { uploadAnnotation } from '../../../lib/photoApi.js';
import styles from './PhotoAnnotator.module.css';

interface PhotoAnnotatorProps {
  photo: Photo;
  onSave: (updatedPhoto: Photo) => void;
  onCancel: () => void;
}

export function PhotoAnnotator({ photo, onSave, onCancel }: PhotoAnnotatorProps) {
  const { t } = useTranslation('photoAnnotator');
  const { state, dispatch, undoStack } = useAnnotator();

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [isShowingOriginal, setIsShowingOriginal] = useState(false);

  // Inline edit state
  interface InlineInputState {
    isOpen: boolean;
    // image-space position of the anchor
    anchorImageX: number;
    anchorImageY: number;
    // If editing an existing shape — its id and original text
    editingShapeId: string | null;
    originalText: string;
  }
  const [inlineInput, setInlineInput] = useState<InlineInputState>({
    isOpen: false,
    anchorImageX: 0,
    anchorImageY: 0,
    editingShapeId: null,
    originalText: '',
  });

  // Per-tool font size key (persists across tool switches within session)
  const fontSizePerTool = useRef<Partial<Record<ToolName, FontSizeKey>>>({});

  const imgRef = useRef<HTMLImageElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const inlineInputRef = useRef<HTMLInputElement>(null);
  const textBBoxMap = useRef<Map<string, DOMRect>>(new Map());
  const liveRegionRef = useRef<HTMLDivElement>(null);
  // Track if we should open inline input on pointer up (click-to-edit)
  const selectClickInfoRef = useRef<{
    shapeId: string | null;
    startImageX: number;
    startImageY: number;
  }>({ shapeId: null, startImageX: 0, startImageY: 0 });

  // Calculate canonical URL
  // When editing an annotated photo, start from the annotated image (unless showing original).
  // isShowingOriginal switches to the original for a fresh start if user wants to reset.
  const canonicalUrl = isShowingOriginal
    ? `${getBaseUrl()}/photos/${photo.id}/file?variant=original`
    : `${getBaseUrl()}/photos/${photo.id}/file`;

  // Helper to get the active font size key for the current tool
  function getActiveFontSizeKey(): FontSizeKey {
    return fontSizePerTool.current[state.selectedTool] ?? state.activeFontSizeKey;
  }

  // Helper to resolve the active font size to pixels
  function getActiveFontSizePx(): number {
    const key = getActiveFontSizeKey();
    // Use 1000x1000 as fallback if dimensions are not available
    const w = photo.width ?? 1000;
    const h = photo.height ?? 1000;
    return resolveFontSize(key, w, h);
  }

  // Callback to open the inline text input
  const openInlineInput = useCallback(
    (anchorImageX: number, anchorImageY: number, editingShapeId?: string) => {
      const existingShape = editingShapeId
        ? state.shapes.find((s) => s.id === editingShapeId)
        : null;
      const originalText = (() => {
        if (!existingShape) return '';
        if (existingShape.type === 'text' || existingShape.type === 'callout')
          return existingShape.text;
        if (existingShape.type === 'measurement') return existingShape.label;
        return '';
      })();
      setInlineInput({
        isOpen: true,
        anchorImageX,
        anchorImageY,
        editingShapeId: editingShapeId ?? null,
        originalText,
      });
      // Pre-fill input value on next frame (after mount)
      requestAnimationFrame(() => {
        if (inlineInputRef.current) {
          inlineInputRef.current.value = originalText;
          inlineInputRef.current.focus();
          inlineInputRef.current.select();
        }
      });
    },
    [state.shapes, state.selectedTool],
  );

  // Callback to commit the inline input
  const commitInlineInput = useCallback(() => {
    if (!inlineInput.isOpen) return;
    const text = inlineInputRef.current?.value.trim() ?? '';
    setInlineInput((prev) => ({ ...prev, isOpen: false }));

    if (text === '') {
      // Empty — if editing existing, no-op (preserve original). If new, discard.
      if (inlineInput.editingShapeId === null) {
        // Discard draft if it was a callout phase 2 (but NOT measurement — measurement commits with empty label)
        if (state.selectedTool !== 'measurement') {
          dispatch({ type: 'SET_DRAFT', shape: null });
          return; // Don't proceed to commit — draft was discarded
        }
      } else {
        // Editing existing shape with empty text — no changes
        return;
      }
      // For measurement with empty text, fall through to commit with empty label
    }

    const fontSize = getActiveFontSizePx();

    if (inlineInput.editingShapeId !== null) {
      // Editing existing shape — UPDATE_SHAPE + commit to undo stack
      const shape = state.shapes.find((s) => s.id === inlineInput.editingShapeId);
      if (shape && (shape.type === 'text' || shape.type === 'callout')) {
        const updated = { ...shape, text };
        dispatch({ type: 'UPDATE_SHAPE', shape: updated });
        undoStack.commit(state.shapes.map((s) => (s.id === updated.id ? updated : s)));
      } else if (shape && shape.type === 'measurement') {
        const updated: MeasurementShape = { ...shape, label: text };
        dispatch({ type: 'UPDATE_SHAPE', shape: updated });
        undoStack.commit(state.shapes.map((s) => (s.id === updated.id ? updated : s)));
      }
    } else if (state.selectedTool === 'text') {
      // New text shape
      const newShape: TextShape = {
        type: 'text',
        id: nanoid(),
        x: inlineInput.anchorImageX,
        y: inlineInput.anchorImageY,
        text,
        fontSize,
        color: state.activeColor,
      };
      undoStack.commit([...undoStack.shapes, newShape]);
      dispatch({ type: 'SELECT_SHAPE', id: newShape.id });
    } else if (state.selectedTool === 'callout' && state.draftShape?.type === 'callout') {
      // Commit the callout draft with text
      const committed: CalloutShape = { ...(state.draftShape as CalloutShape), text };
      const newShapes = [...undoStack.shapes, committed];
      dispatch({ type: 'SET_DRAFT', shape: null });
      undoStack.commit(newShapes);
      dispatch({ type: 'SELECT_SHAPE', id: committed.id });
    } else if (state.selectedTool === 'measurement' && state.draftShape?.type === 'measurement') {
      // Commit the measurement draft with the user's label (may be empty)
      const committed: MeasurementShape = {
        ...(state.draftShape as MeasurementShape),
        label: text, // text may be '' — that is valid; line is drawn, no label
      };
      const newShapes = [...undoStack.shapes, committed];
      dispatch({ type: 'SET_DRAFT', shape: null });
      undoStack.commit(newShapes);
      dispatch({ type: 'SELECT_SHAPE', id: committed.id });
      if (liveRegionRef.current) {
        liveRegionRef.current.textContent = t('shapeAddedMeasurement');
      }
    }
  }, [
    inlineInput,
    state.shapes,
    state.draftShape,
    state.selectedTool,
    state.activeColor,
    undoStack,
    dispatch,
    t,
  ]);

  // Callback to cancel the inline input
  const cancelInlineInput = useCallback(() => {
    if (!inlineInput.isOpen) return;

    // For measurement: Escape commits with whatever is in the input (may be empty)
    // This preserves the drawn line even if no label is typed.
    if (state.selectedTool === 'measurement') {
      commitInlineInput();
      return;
    }

    setInlineInput((prev) => ({ ...prev, isOpen: false }));
    if (inlineInput.editingShapeId === null) {
      // Abort new shape — discard draft if any
      dispatch({ type: 'SET_DRAFT', shape: null });
      resetCalloutTool();
      resetMeasurementTool();
    }
    // For existing shapes: no change, original text preserved
  }, [inlineInput, state.selectedTool, dispatch, commitInlineInput]);

  // Measure text bbox for DOM-accurate selection overlay
  useEffect(() => {
    if (!svgRef.current) return;
    for (const shape of undoStack.shapes) {
      if (shape.type === 'text') {
        const el = svgRef.current.querySelector(
          `[data-shapeid="${shape.id}"]`,
        ) as SVGTextElement | null;
        if (el) {
          try {
            textBBoxMap.current.set(shape.id, el.getBBox() as unknown as DOMRect);
          } catch {
            // getBBox fails when element is not in the DOM
          }
        }
      }
    }
  }, [undoStack.shapes]);

  // Announce shape selection
  useEffect(() => {
    if (state.selectedShapeId && liveRegionRef.current) {
      liveRegionRef.current.textContent = t('shapeSelected');
    }
  }, [state.selectedShapeId, t]);

  // Focus management
  useEffect(() => {
    const firstToolButton = document.querySelector('[data-testid="tool-select"]') as HTMLElement;
    if (firstToolButton) {
      requestAnimationFrame(() => firstToolButton.focus());
    }
  }, []);

  // Keyboard handler for undo/redo and deletion
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Guard: if inline input is open, let the input handle the key
      if (inlineInput.isOpen) return;

      const isMod = e.metaKey || e.ctrlKey;

      // Undo
      if (isMod && !e.shiftKey && e.key === 'z') {
        e.preventDefault();
        undoStack.undo();
        if (liveRegionRef.current) {
          liveRegionRef.current.textContent = t('undoPerformed');
        }
        return;
      }

      // Redo
      if (isMod && ((e.shiftKey && e.key === 'z') || e.key === 'y')) {
        e.preventDefault();
        undoStack.redo();
        if (liveRegionRef.current) {
          liveRegionRef.current.textContent = t('redoPerformed');
        }
        return;
      }

      // Delete selected shape
      if (state.selectedShapeId && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault();
        dispatch({ type: 'DELETE_SELECTED' });
        if (liveRegionRef.current) {
          liveRegionRef.current.textContent = t('shapeDeleted');
        }
        return;
      }

      // Note: Escape key is handled by PhotoViewer (parent) to avoid double-firing.
      // The inline input's Escape handler (with stopPropagation) still works independently.
      // This window-level Escape handler was removed per M3 audit finding.

      // Arrow nudge (1px, or 10px with Shift)
      if (state.selectedShapeId && e.key.startsWith('Arrow')) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        let dx = 0,
          dy = 0;

        switch (e.key) {
          case 'ArrowUp':
            dy = -step;
            break;
          case 'ArrowDown':
            dy = step;
            break;
          case 'ArrowLeft':
            dx = -step;
            break;
          case 'ArrowRight':
            dx = step;
            break;
        }

        const selectedShape = state.shapes.find((s) => s.id === state.selectedShapeId);
        if (selectedShape) {
          if (selectedShape.type === 'rectangle' || selectedShape.type === 'highlight') {
            dispatch({
              type: 'UPDATE_SHAPE',
              shape: {
                ...selectedShape,
                x: clamp(selectedShape.x + dx, 0, photo.width! - selectedShape.w),
                y: clamp(selectedShape.y + dy, 0, photo.height! - selectedShape.h),
              },
            });
          } else if (selectedShape.type === 'arrow' || selectedShape.type === 'line') {
            dispatch({
              type: 'UPDATE_SHAPE',
              shape: {
                ...selectedShape,
                x1: clamp(selectedShape.x1 + dx, 0, photo.width!),
                y1: clamp(selectedShape.y1 + dy, 0, photo.height!),
                x2: clamp(selectedShape.x2 + dx, 0, photo.width!),
                y2: clamp(selectedShape.y2 + dy, 0, photo.height!),
              },
            });
          } else if (selectedShape.type === 'ellipse') {
            dispatch({
              type: 'UPDATE_SHAPE',
              shape: {
                ...selectedShape,
                cx: clamp(selectedShape.cx + dx, selectedShape.rx, photo.width! - selectedShape.rx),
                cy: clamp(
                  selectedShape.cy + dy,
                  selectedShape.ry,
                  photo.height! - selectedShape.ry,
                ),
              },
            });
          } else if (selectedShape.type === 'text') {
            dispatch({
              type: 'UPDATE_SHAPE',
              shape: {
                ...selectedShape,
                x: clamp(selectedShape.x + dx, 0, photo.width!),
                y: clamp(selectedShape.y + dy, 0, photo.height!),
              },
            });
          } else if (selectedShape.type === 'callout') {
            dispatch({
              type: 'UPDATE_SHAPE',
              shape: {
                ...selectedShape,
                x: clamp(selectedShape.x + dx, 0, photo.width! - selectedShape.w),
                y: clamp(selectedShape.y + dy, 0, photo.height! - selectedShape.h),
              },
            });
          } else if (selectedShape.type === 'measurement') {
            dispatch({
              type: 'UPDATE_SHAPE',
              shape: {
                ...selectedShape,
                x1: clamp(selectedShape.x1 + dx, 0, photo.width!),
                y1: clamp(selectedShape.y1 + dy, 0, photo.height!),
                x2: clamp(selectedShape.x2 + dx, 0, photo.width!),
                y2: clamp(selectedShape.y2 + dy, 0, photo.height!),
              },
            });
          } else if (selectedShape.type === 'freehand') {
            dispatch({
              type: 'UPDATE_SHAPE',
              shape: {
                ...selectedShape,
                points: selectedShape.points.map(([x, y]) => [
                  clamp(x + dx, 0, photo.width!),
                  clamp(y + dy, 0, photo.height!),
                ]) as [number, number][],
              },
            });
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    inlineInput.isOpen,
    state.selectedShapeId,
    state.shapes,
    undoStack,
    dispatch,
    photo.width,
    photo.height,
  ]);

  // Pointer event handlers for drawing/editing
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      // While the inline input is open, swallow pointer events so they don't
      // disturb the draft shape. The input's onBlur handler will commit the
      // pending measurement/callout/text.
      if (inlineInput.isOpen) {
        return;
      }

      if (!svgRef.current) return;

      let { x: imageX, y: imageY } = screenToImage(e.clientX, e.clientY, svgRef.current);

      // Clamp to image bounds (defense against out-of-bounds clicks)
      imageX = clamp(imageX, 0, photo.width!);
      imageY = clamp(imageY, 0, photo.height!);

      // Track the click position for potential click-to-edit
      selectClickInfoRef.current = {
        shapeId: state.selectedShapeId,
        startImageX: imageX,
        startImageY: imageY,
      };

      const ctx: PointerContext = {
        imageX,
        imageY,
        imageWidth: photo.width!,
        imageHeight: photo.height!,
        event: e,
        onOpenInlineInput: (ix, iy, shapeId) => openInlineInput(ix, iy, shapeId),
      };

      const toolHandlers = {
        select: SelectTool,
        rectangle: RectangleTool,
        highlight: HighlightTool,
        arrow: ArrowTool,
        line: LineTool,
        ellipse: EllipseTool,
        text: TextTool,
        callout: CalloutTool,
        measurement: MeasurementTool,
        freehand: FreehandTool,
      };

      const handler = toolHandlers[state.selectedTool];
      const actions = handler.onPointerDown(state, ctx);

      for (const action of actions) {
        dispatch(action);
      }
    },
    [state, photo.width, photo.height, dispatch, openInlineInput, inlineInput.isOpen],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      // While the inline input is open, swallow pointer events so they don't
      // disturb the draft shape. The input's onBlur handler will commit the
      // pending measurement/callout/text.
      if (inlineInput.isOpen) {
        return;
      }

      if (!svgRef.current) return;

      let { x: imageX, y: imageY } = screenToImage(e.clientX, e.clientY, svgRef.current);

      // Clamp to image bounds (defense against out-of-bounds movement)
      imageX = clamp(imageX, 0, photo.width!);
      imageY = clamp(imageY, 0, photo.height!);

      const ctx: PointerContext = {
        imageX,
        imageY,
        imageWidth: photo.width!,
        imageHeight: photo.height!,
        event: e,
        onOpenInlineInput: (ix, iy, shapeId) => openInlineInput(ix, iy, shapeId),
      };

      const toolHandlers = {
        select: SelectTool,
        rectangle: RectangleTool,
        highlight: HighlightTool,
        arrow: ArrowTool,
        line: LineTool,
        ellipse: EllipseTool,
        text: TextTool,
        callout: CalloutTool,
        measurement: MeasurementTool,
        freehand: FreehandTool,
      };

      const handler = toolHandlers[state.selectedTool];
      const actions = handler.onPointerMove(state, ctx);

      for (const action of actions) {
        dispatch(action);
      }
    },
    [state, photo.width, photo.height, dispatch, openInlineInput, inlineInput.isOpen],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      // While the inline input is open, swallow pointer events so they don't
      // disturb the draft shape. The input's onBlur handler will commit the
      // pending measurement/callout/text.
      if (inlineInput.isOpen) {
        return;
      }

      if (!svgRef.current) return;

      let { x: imageX, y: imageY } = screenToImage(e.clientX, e.clientY, svgRef.current);

      // Clamp to image bounds (defense against out-of-bounds release)
      imageX = clamp(imageX, 0, photo.width!);
      imageY = clamp(imageY, 0, photo.height!);

      const ctx: PointerContext = {
        imageX,
        imageY,
        imageWidth: photo.width!,
        imageHeight: photo.height!,
        event: e,
        onOpenInlineInput: (ix, iy, shapeId) => openInlineInput(ix, iy, shapeId),
      };

      const toolHandlers = {
        select: SelectTool,
        rectangle: RectangleTool,
        highlight: HighlightTool,
        arrow: ArrowTool,
        line: LineTool,
        ellipse: EllipseTool,
        text: TextTool,
        callout: CalloutTool,
        measurement: MeasurementTool,
        freehand: FreehandTool,
      };

      // Capture callout phase BEFORE tool handler executes.
      // This lets us distinguish "phase just transitioned to tail" from "already in tail".
      const phaseBeforeHandler = state.selectedTool === 'callout' ? getCalloutPhase() : null;

      const handler = toolHandlers[state.selectedTool];
      const actions = handler.onPointerUp(state, ctx);

      for (const action of actions) {
        dispatch(action);
      }

      // Check for click-to-edit: if the pointer didn't move significantly and we're on the same
      // text/callout/measurement shape that was previously selected, open inline input for editing.
      if (state.selectedTool === 'select' && state.selectedShapeId) {
        const prevClickInfo = selectClickInfoRef.current;
        const dx = imageX - prevClickInfo.startImageX;
        const dy = imageY - prevClickInfo.startImageY;
        const clickDist = Math.sqrt(dx * dx + dy * dy);
        const CLICK_THRESHOLD = 5; // Require at least 5px of movement to avoid accidental edit opens during slow drags
        const wasActualDrag = clickDist > CLICK_THRESHOLD;

        // If this is the same shape and pointer didn't move much, try to open inline input
        if (prevClickInfo.shapeId === state.selectedShapeId && !wasActualDrag) {
          const shape = state.shapes.find((s) => s.id === state.selectedShapeId);
          if (shape && (shape.type === 'text' || shape.type === 'callout')) {
            openInlineInput(shape.x, shape.y, shape.id);
          } else if (shape && shape.type === 'measurement') {
            const midX = (shape.x1 + shape.x2) / 2;
            const midY = (shape.y1 + shape.y2) / 2;
            openInlineInput(midX, midY, shape.id);
          }
        }

        // Only commit if there was actual movement (i.e., a drag occurred)
        if (wasActualDrag) {
          undoStack.commit(state.shapes);
        }
      }

      // Handle callout phase transitions:
      // If phase was null → box (Phase 1) and now tail, announce tail positioning
      if (
        state.selectedTool === 'callout' &&
        phaseBeforeHandler !== 'tail' &&
        getCalloutPhase() === 'tail' &&
        liveRegionRef.current
      ) {
        liveRegionRef.current.textContent = t('calloutTailPositioning');
      }

      // Announce shape additions
      const hasCommit = actions.some((a) => a.type === 'COMMIT_DRAFT');
      if (hasCommit && liveRegionRef.current) {
        const shapeAnnouncements: Record<ToolName, string> = {
          rectangle: t('shapeAddedRectangle'),
          highlight: t('shapeAddedHighlight'),
          arrow: t('shapeAddedArrow'),
          line: t('shapeAddedLine'),
          ellipse: t('shapeAddedEllipse'),
          text: t('shapeAddedText'),
          callout: t('shapeAddedCallout'),
          measurement: t('shapeAddedMeasurement'),
          freehand: t('shapeAddedFreehand'),
          select: '', // select tool doesn't create shapes
        };
        const announcement = shapeAnnouncements[state.selectedTool];
        if (announcement) {
          liveRegionRef.current.textContent = announcement;
        }
      }
    },
    [state, photo.width, photo.height, dispatch, undoStack, openInlineInput, inlineInput.isOpen, t],
  );

  // Floating input positioning and styling
  const inlineInputStyle = useMemo((): React.CSSProperties => {
    if (!inlineInput.isOpen || !svgRef.current) return { display: 'none' };
    const containerRect = svgRef.current.parentElement!.getBoundingClientRect();
    const svgRect = svgRef.current.getBoundingClientRect();
    const scale = svgRect.width / photo.width!;
    const screenFontSizePx = getActiveFontSizePx() * scale;

    // Determine the text color to use:
    // - If editing an existing text/callout shape, use its color
    // - Otherwise, use the currently-selected active color
    let textColor = state.activeColor;
    let editingShape = null;
    if (inlineInput.editingShapeId) {
      editingShape = state.shapes.find((s) => s.id === inlineInput.editingShapeId);
      if (editingShape && (editingShape.type === 'text' || editingShape.type === 'callout')) {
        textColor = editingShape.color;
      }
    }

    // Also check for draft shape (new shape being created)
    const draftOrShape = editingShape || state.draftShape;
    const shapeType = draftOrShape?.type || state.selectedTool;

    // Compute image-space rect for the input based on shape type
    let imgX = inlineInput.anchorImageX;
    let imgY = inlineInput.anchorImageY;
    let imgW = Math.max(100, (screenFontSizePx / scale) * 10); // Default width estimate
    let imgH = screenFontSizePx / scale;
    let textAlign: 'left' | 'center' = 'left';
    let baselineAdjust = 0; // Vertical offset to align baseline

    if (shapeType === 'callout' && draftOrShape?.type === 'callout') {
      // Position input inside the callout box with same inset as rendered text
      const callout = draftOrShape as CalloutShape;
      const initialInset = 6;
      const availW = Math.max(1, callout.w - 2 * initialInset);
      const availH = Math.max(1, callout.h - 2 * initialInset);
      const effectiveFontSize = getActiveFontSizePx(); // in image-space pixels
      const inset = Math.max(6, Math.round(effectiveFontSize * 0.5));

      imgX = callout.x + inset;
      imgY = callout.y + inset;
      imgW = availW;
      imgH = availH;
      textAlign = 'left';
      // Callout renders text at top of box with padding; input should align similarly
      baselineAdjust = 0;
    } else if (shapeType === 'measurement' && draftOrShape?.type === 'measurement') {
      // Position input at midpoint with perpendicular offset, centered horizontally
      const measurement = draftOrShape as MeasurementShape;
      const dx = measurement.x2 - measurement.x1;
      const dy = measurement.y2 - measurement.y1;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const nx = -dy / len; // unit normal
      const ny = dx / len;

      const midX = (measurement.x1 + measurement.x2) / 2;
      const midY = (measurement.y1 + measurement.y2) / 2;
      // Label sits above the midpoint (same as render.ts)
      const labelOffsetX = -nx * measurement.fontSize * 0.6;
      const labelOffsetY = -ny * measurement.fontSize * 0.6;

      // Position so text is centered at the label point
      imgX = midX + labelOffsetX - measurement.fontSize * 2; // ~4 chars wide
      imgY = midY + labelOffsetY - measurement.fontSize * 0.5;
      imgW = measurement.fontSize * 4; // ~4 character widths
      imgH = measurement.fontSize;
      textAlign = 'center';
      baselineAdjust = 0;
    } else if (shapeType === 'text') {
      // Text shape: anchor is at baseline; position input so baseline aligns
      imgX = inlineInput.anchorImageX;
      imgY = inlineInput.anchorImageY - (screenFontSizePx / scale) * 0.75; // Offset to align baseline
      imgW = Math.max(100, (screenFontSizePx / scale) * 12); // Wider for text
      imgH = screenFontSizePx / scale;
      textAlign = 'left';
      // Baseline adjustment: input's top should align roughly with text's baseline
      baselineAdjust = screenFontSizePx * 0.85;
    }

    // Convert image-space rect to screen-space
    const topLeft = imageToScreen(imgX, imgY, svgRef.current);
    const bottomRight = imageToScreen(imgX + imgW, imgY + imgH, svgRef.current);

    return {
      position: 'absolute',
      left: `${topLeft.x - containerRect.left}px`,
      top: `${topLeft.y - containerRect.top}px`,
      width: `${Math.max(50, bottomRight.x - topLeft.x)}px`,
      height: `${Math.max(20, bottomRight.y - topLeft.y)}px`,
      fontSize: `${screenFontSizePx}px`,
      lineHeight: '1',
      color: textColor,
      fontFamily: ANNOTATION_FONT_FAMILY,
      background: 'transparent',
      textAlign,
      paddingTop: baselineAdjust > 0 ? `${Math.round(baselineAdjust * 0.15)}px` : '0px',
      boxSizing: 'border-box',
    };
  }, [
    inlineInput,
    photo.width,
    photo.height,
    state.activeFontSizeKey,
    state.activeColor,
    state.shapes,
    state.draftShape,
    state.selectedTool,
  ]);

  const handleCancel = useCallback(() => {
    onCancel();
  }, [onCancel]);

  const handleReset = useCallback(() => {
    // Switch to original image and clear any in-progress annotations
    setIsShowingOriginal(true);
    // Clear the undo stack of any new shapes drawn since opening the annotator
    undoStack.clear();
    // Clear draft shape if any
    dispatch({ type: 'SET_DRAFT', shape: null });
    // Deselect any selected shape
    dispatch({ type: 'SELECT_SHAPE', id: null });
    setShowResetConfirm(false);
    if (liveRegionRef.current) {
      liveRegionRef.current.textContent = t('resetComplete');
    }
  }, [undoStack, dispatch, t]);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setSaveError(null);

    const liveRegion = liveRegionRef.current;
    if (liveRegion) {
      liveRegion.textContent = t('saving');
    }

    try {
      // Load canonical image
      const img = new Image();
      img.crossOrigin = 'anonymous';

      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = canonicalUrl + `?v=${Date.now()}`;
      });

      // Create off-screen canvas at native resolution using actual image dimensions.
      // Use naturalWidth/naturalHeight to be robust against server-side dimension issues.
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;

      // Draw base image
      ctx.drawImage(img, 0, 0);

      // Walk shapes and draw them
      for (const shape of undoStack.shapes) {
        drawShapeOnCanvas(ctx, shape);
      }

      // Export WebP blob at quality 0.92 (perceptually lossless, ~5-10x smaller than PNG)
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('Canvas toBlob failed'))),
          'image/webp',
          0.92,
        );
      });

      // Upload
      const updatedPhoto = await uploadAnnotation(photo.id, blob);

      // Clear undo stack
      undoStack.clear();

      if (liveRegion) {
        liveRegion.textContent = t('saved');
      }

      onSave(updatedPhoto);
    } catch (err) {
      setSaveError(t('saveError'));
      if (liveRegion) {
        liveRegion.textContent = t('saveError');
      }
    } finally {
      setIsSaving(false);
    }
  }, [photo, canonicalUrl, undoStack, onSave, t]);

  const selectedShape = state.shapes.find((s) => s.id === state.selectedShapeId);

  return (
    <section aria-label={t('region')} className={styles.annotator}>
      <ToolPalette
        selectedTool={state.selectedTool}
        activeColor={state.activeColor}
        activeStrokeWidthKey={state.activeStrokeWidthKey}
        activeFontSizeKey={getActiveFontSizeKey()}
        canUndo={undoStack.canUndo}
        canRedo={undoStack.canRedo}
        onSelectTool={(tool) => dispatch({ type: 'SET_TOOL', tool })}
        onSelectColor={(color) => {
          dispatch({ type: 'SET_COLOR', color });
          // If a shape is selected, update its color too.
          // Text and callout shapes store the user-picked colour as `color`;
          // every other shape type stores it as `stroke`.
          if (state.selectedShapeId) {
            const shape = state.shapes.find((s) => s.id === state.selectedShapeId);
            if (shape) {
              const updated =
                shape.type === 'text' || shape.type === 'callout'
                  ? { ...shape, color }
                  : { ...shape, stroke: color };
              dispatch({ type: 'UPDATE_SHAPE', shape: updated });
              undoStack.commit(state.shapes.map((s) => (s.id === updated.id ? updated : s)));
            }
          }
        }}
        onSelectStrokeWidth={(key) => {
          dispatch({ type: 'SET_STROKE_WIDTH', key });
          // If a shape is selected, update its stroke width too
          if (state.selectedShapeId) {
            const shape = state.shapes.find((s) => s.id === state.selectedShapeId);
            if (shape) {
              // Resolve the new stroke width based on photo dimensions
              const newStrokeWidth = resolveStrokeWidth(key, photo.width!, photo.height!);
              const updated = {
                ...shape,
                strokeWidth: newStrokeWidth,
              };
              dispatch({ type: 'UPDATE_SHAPE', shape: updated });
              undoStack.commit(state.shapes.map((s) => (s.id === updated.id ? updated : s)));
            }
          }
        }}
        onSelectFontSize={(key) => {
          fontSizePerTool.current[state.selectedTool] = key as FontSizeKey;
          dispatch({ type: 'SET_FONT_SIZE', key: key as FontSizeKey });
          // If a shape is selected, update its font size too (text/callout/measurement)
          if (state.selectedShapeId) {
            const shape = state.shapes.find((s) => s.id === state.selectedShapeId);
            if (shape && (shape.type === 'text' || shape.type === 'callout')) {
              const newFontSize = resolveFontSize(key as FontSizeKey, photo.width!, photo.height!);
              const updated = { ...shape, fontSize: newFontSize };
              dispatch({ type: 'UPDATE_SHAPE', shape: updated });
              undoStack.commit(state.shapes.map((s) => (s.id === updated.id ? updated : s)));
            } else if (shape && shape.type === 'measurement') {
              const newFontSize = resolveFontSize(key as FontSizeKey, photo.width!, photo.height!);
              const updated = { ...shape, fontSize: newFontSize };
              dispatch({ type: 'UPDATE_SHAPE', shape: updated });
              undoStack.commit(state.shapes.map((s) => (s.id === updated.id ? updated : s)));
            }
          }
        }}
        onUndo={() => undoStack.undo()}
        onRedo={() => undoStack.redo()}
      />

      <div className={styles.canvasArea}>
        <img
          ref={imgRef}
          src={canonicalUrl}
          alt={photo.caption || photo.originalFilename}
          className={styles.baseImage}
        />

        <svg
          ref={svgRef}
          viewBox={`0 0 ${photo.width} ${photo.height}`}
          className={styles.svgOverlay}
          role="application"
          aria-label={t('canvas')}
          focusable={false}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Committed shapes */}
          {undoStack.shapes.map((shape) => {
            const result = renderShapeSvgProps(shape, false);
            if (result.tagName === 'arrow') {
              return (
                <g key={shape.id} data-shapeid={shape.id}>
                  <line {...(result.lineAttrs as Record<string, unknown>)} />
                  <polygon {...(result.arrowheadAttrs as Record<string, unknown>)} />
                </g>
              );
            } else if (result.tagName === 'callout') {
              return (
                <g key={shape.id} data-shapeid={shape.id}>
                  <rect {...(result.boxAttrs as Record<string, unknown>)} />
                  <line {...(result.tailAttrs as Record<string, unknown>)} />
                  <foreignObject {...(result.foreignObjectAttrs as Record<string, unknown>)}>
                    <div
                      style={result.textDivStyle as React.CSSProperties}
                      // xmlns is implicit in XHTML context inside foreignObject
                    >
                      {result.children}
                    </div>
                  </foreignObject>
                </g>
              );
            } else if (result.tagName === 'measurement') {
              return (
                <g key={shape.id} data-shapeid={shape.id}>
                  <line {...(result.lineAttrs as Record<string, unknown>)} />
                  <line {...(result.tick1Attrs as Record<string, unknown>)} />
                  <line {...(result.tick2Attrs as Record<string, unknown>)} />
                  {result.children && (
                    <text {...(result.labelAttrs as Record<string, unknown>)}>
                      {result.children}
                    </text>
                  )}
                </g>
              );
            } else if (result.tagName === 'polyline') {
              return (
                <polyline
                  key={shape.id}
                  data-shapeid={shape.id}
                  {...(result.attributes as Record<string, unknown>)}
                />
              );
            } else if (result.tagName === 'text') {
              return (
                <text
                  key={shape.id}
                  data-shapeid={shape.id}
                  {...(result.attributes as Record<string, unknown>)}
                >
                  {result.children}
                </text>
              );
            } else {
              const Tag = result.tagName as any;
              return (
                <Tag
                  key={shape.id}
                  data-shapeid={shape.id}
                  {...(result.attributes as Record<string, unknown>)}
                />
              );
            }
          })}

          {/* Draft shape */}
          {state.draftShape &&
            (() => {
              const result = renderShapeSvgProps(state.draftShape, true);
              if (result.tagName === 'arrow') {
                return (
                  <g>
                    <line {...(result.lineAttrs as Record<string, unknown>)} />
                    <polygon {...(result.arrowheadAttrs as Record<string, unknown>)} />
                  </g>
                );
              } else if (result.tagName === 'callout') {
                return (
                  <g>
                    <rect {...(result.boxAttrs as Record<string, unknown>)} />
                    <line {...(result.tailAttrs as Record<string, unknown>)} />
                    <foreignObject {...(result.foreignObjectAttrs as Record<string, unknown>)}>
                      <div
                        style={result.textDivStyle as React.CSSProperties}
                        // xmlns is implicit in XHTML context inside foreignObject
                      >
                        {result.children}
                      </div>
                    </foreignObject>
                  </g>
                );
              } else if (result.tagName === 'measurement') {
                return (
                  <g>
                    <line {...(result.lineAttrs as Record<string, unknown>)} />
                    <line {...(result.tick1Attrs as Record<string, unknown>)} />
                    <line {...(result.tick2Attrs as Record<string, unknown>)} />
                    {result.children && (
                      <text {...(result.labelAttrs as Record<string, unknown>)}>
                        {result.children}
                      </text>
                    )}
                  </g>
                );
              } else if (result.tagName === 'polyline') {
                return <polyline {...(result.attributes as Record<string, unknown>)} />;
              } else if (result.tagName === 'text') {
                return (
                  <text
                    data-shapeid={state.draftShape.id}
                    {...(result.attributes as Record<string, unknown>)}
                  >
                    {result.children}
                  </text>
                );
              } else {
                const Tag = result.tagName as any;
                return <Tag {...(result.attributes as Record<string, unknown>)} />;
              }
            })()}

          {/* Selection overlay */}
          {selectedShape && (
            <>
              {(selectedShape.type === 'rectangle' || selectedShape.type === 'highlight') && (
                <>
                  {/* Halo/glow effect for enhanced visibility */}
                  <rect
                    x={selectedShape.x - 4}
                    y={selectedShape.y - 4}
                    width={selectedShape.w + 8}
                    height={selectedShape.h + 8}
                    stroke="var(--color-primary)"
                    strokeWidth="2"
                    fill="none"
                    pointerEvents="none"
                    opacity="0.3"
                    rx="1"
                  />
                  {/* Outer dark stroke for visibility on any background */}
                  <rect
                    x={selectedShape.x}
                    y={selectedShape.y}
                    width={selectedShape.w}
                    height={selectedShape.h}
                    stroke="#000000"
                    strokeWidth="5"
                    strokeDasharray="4 2"
                    fill="none"
                    pointerEvents="none"
                    opacity="0.6"
                  />
                  {/* Inner bright dashed stroke (primary color) */}
                  <rect
                    x={selectedShape.x}
                    y={selectedShape.y}
                    width={selectedShape.w}
                    height={selectedShape.h}
                    stroke="var(--color-primary)"
                    strokeWidth="3"
                    strokeDasharray="4 2"
                    fill="none"
                    pointerEvents="none"
                  />
                  {/* 8 resize handles for rect/highlight */}
                  {['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se'].map((pos) => {
                    let cx = 0,
                      cy = 0;
                    const { x, y, w, h } = selectedShape;

                    if (pos === 'nw') {
                      [cx, cy] = [x, y];
                    } else if (pos === 'n') {
                      [cx, cy] = [x + w / 2, y];
                    } else if (pos === 'ne') {
                      [cx, cy] = [x + w, y];
                    } else if (pos === 'w') {
                      [cx, cy] = [x, y + h / 2];
                    } else if (pos === 'e') {
                      [cx, cy] = [x + w, y + h / 2];
                    } else if (pos === 'sw') {
                      [cx, cy] = [x, y + h];
                    } else if (pos === 's') {
                      [cx, cy] = [x + w / 2, y + h];
                    } else if (pos === 'se') {
                      [cx, cy] = [x + w, y + h];
                    }

                    const cursors: { [key: string]: string } = {
                      nw: 'nwse-resize',
                      n: 'ns-resize',
                      ne: 'nesw-resize',
                      w: 'ew-resize',
                      e: 'ew-resize',
                      sw: 'nesw-resize',
                      s: 'ns-resize',
                      se: 'nwse-resize',
                    };

                    return (
                      <circle
                        key={pos}
                        cx={cx}
                        cy={cy}
                        r={6}
                        fill="white"
                        stroke="var(--color-primary)"
                        strokeWidth="2"
                        style={{ cursor: cursors[pos] }}
                      />
                    );
                  })}
                </>
              )}

              {(selectedShape.type === 'arrow' || selectedShape.type === 'line') && (
                <>
                  {/* Halo/glow effect for enhanced visibility */}
                  <line
                    x1={selectedShape.x1}
                    y1={selectedShape.y1}
                    x2={selectedShape.x2}
                    y2={selectedShape.y2}
                    stroke="var(--color-primary)"
                    strokeWidth="8"
                    pointerEvents="none"
                    opacity="0.2"
                    strokeLinecap="round"
                  />
                  {/* Outer dark stroke for visibility */}
                  <line
                    x1={selectedShape.x1}
                    y1={selectedShape.y1}
                    x2={selectedShape.x2}
                    y2={selectedShape.y2}
                    stroke="#000000"
                    strokeWidth="5"
                    strokeDasharray="4 2"
                    pointerEvents="none"
                    opacity="0.6"
                    strokeLinecap="round"
                  />
                  {/* Inner bright dashed stroke */}
                  <line
                    x1={selectedShape.x1}
                    y1={selectedShape.y1}
                    x2={selectedShape.x2}
                    y2={selectedShape.y2}
                    stroke="var(--color-primary)"
                    strokeWidth="3"
                    strokeDasharray="4 2"
                    pointerEvents="none"
                    strokeLinecap="round"
                  />
                  {/* Start and end handles */}
                  {[
                    { pos: 'start', x: selectedShape.x1, y: selectedShape.y1 },
                    { pos: 'end', x: selectedShape.x2, y: selectedShape.y2 },
                  ].map(({ pos, x, y }) => (
                    <circle
                      key={pos}
                      cx={x}
                      cy={y}
                      r={6}
                      fill="white"
                      stroke="var(--color-primary)"
                      strokeWidth="2"
                      style={{ cursor: 'move' }}
                    />
                  ))}
                </>
              )}

              {selectedShape.type === 'ellipse' && (
                <>
                  {/* Halo/glow effect for enhanced visibility */}
                  <ellipse
                    cx={selectedShape.cx}
                    cy={selectedShape.cy}
                    rx={selectedShape.rx + 4}
                    ry={selectedShape.ry + 4}
                    stroke="var(--color-primary)"
                    strokeWidth="2"
                    fill="none"
                    pointerEvents="none"
                    opacity="0.3"
                  />
                  {/* Outer dark stroke for visibility */}
                  <ellipse
                    cx={selectedShape.cx}
                    cy={selectedShape.cy}
                    rx={selectedShape.rx}
                    ry={selectedShape.ry}
                    stroke="#000000"
                    strokeWidth="5"
                    strokeDasharray="4 2"
                    fill="none"
                    pointerEvents="none"
                    opacity="0.6"
                  />
                  {/* Inner bright dashed stroke */}
                  <ellipse
                    cx={selectedShape.cx}
                    cy={selectedShape.cy}
                    rx={selectedShape.rx}
                    ry={selectedShape.ry}
                    stroke="var(--color-primary)"
                    strokeWidth="3"
                    strokeDasharray="4 2"
                    fill="none"
                    pointerEvents="none"
                  />
                  {/* Cardinal handles for ellipse */}
                  {[
                    { pos: 'north', x: selectedShape.cx, y: selectedShape.cy - selectedShape.ry },
                    { pos: 'south', x: selectedShape.cx, y: selectedShape.cy + selectedShape.ry },
                    { pos: 'east', x: selectedShape.cx + selectedShape.rx, y: selectedShape.cy },
                    { pos: 'west', x: selectedShape.cx - selectedShape.rx, y: selectedShape.cy },
                  ].map(({ pos, x, y }) => (
                    <circle
                      key={pos}
                      cx={x}
                      cy={y}
                      r={6}
                      fill="white"
                      stroke="var(--color-primary)"
                      strokeWidth="2"
                      style={{
                        cursor: pos === 'north' || pos === 'south' ? 'ns-resize' : 'ew-resize',
                      }}
                    />
                  ))}
                </>
              )}

              {selectedShape.type === 'text' &&
                (() => {
                  const bbox = textBBoxMap.current.get(selectedShape.id);
                  if (!bbox) return null;
                  return (
                    <>
                      {/* Halo/glow effect for enhanced visibility */}
                      <rect
                        x={bbox.x - 3}
                        y={bbox.y - 3}
                        width={bbox.width + 6}
                        height={bbox.height + 6}
                        stroke="var(--color-primary)"
                        strokeWidth="2"
                        fill="none"
                        pointerEvents="none"
                        opacity="0.3"
                        rx="1"
                      />
                      {/* Outer dark stroke for visibility */}
                      <rect
                        x={bbox.x}
                        y={bbox.y}
                        width={bbox.width}
                        height={bbox.height}
                        stroke="#000000"
                        strokeWidth="5"
                        strokeDasharray="4 2"
                        fill="none"
                        pointerEvents="none"
                        opacity="0.6"
                      />
                      {/* Inner bright dashed stroke */}
                      <rect
                        x={bbox.x}
                        y={bbox.y}
                        width={bbox.width}
                        height={bbox.height}
                        stroke="var(--color-primary)"
                        strokeWidth="3"
                        strokeDasharray="4 2"
                        fill="none"
                        pointerEvents="none"
                      />
                      {/* 4 corner handles — move only */}
                      {[
                        { pos: 'nw', x: bbox.x, y: bbox.y },
                        { pos: 'ne', x: bbox.x + bbox.width, y: bbox.y },
                        { pos: 'sw', x: bbox.x, y: bbox.y + bbox.height },
                        { pos: 'se', x: bbox.x + bbox.width, y: bbox.y + bbox.height },
                      ].map(({ pos, x, y }) => (
                        <circle
                          key={pos}
                          cx={x}
                          cy={y}
                          r={6}
                          fill="white"
                          stroke="var(--color-primary)"
                          strokeWidth="2"
                          style={{ cursor: 'move' }}
                        />
                      ))}
                    </>
                  );
                })()}

              {selectedShape.type === 'callout' && (
                <>
                  {/* Halo/glow effect for enhanced visibility */}
                  <rect
                    x={selectedShape.x - 4}
                    y={selectedShape.y - 4}
                    width={selectedShape.w + 8}
                    height={selectedShape.h + 8}
                    stroke="var(--color-primary)"
                    strokeWidth="2"
                    fill="none"
                    pointerEvents="none"
                    opacity="0.3"
                    rx="1"
                  />
                  {/* Outer dark stroke for visibility */}
                  <rect
                    x={selectedShape.x}
                    y={selectedShape.y}
                    width={selectedShape.w}
                    height={selectedShape.h}
                    stroke="#000000"
                    strokeWidth="5"
                    strokeDasharray="4 2"
                    fill="none"
                    pointerEvents="none"
                    opacity="0.6"
                  />
                  {/* Inner bright dashed stroke */}
                  <rect
                    x={selectedShape.x}
                    y={selectedShape.y}
                    width={selectedShape.w}
                    height={selectedShape.h}
                    stroke="var(--color-primary)"
                    strokeWidth="3"
                    strokeDasharray="4 2"
                    fill="none"
                    pointerEvents="none"
                  />
                  {/* 8 box handles */}
                  {['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se'].map((pos) => {
                    let cx = 0,
                      cy = 0;
                    const { x, y, w, h } = selectedShape;

                    if (pos === 'nw') {
                      [cx, cy] = [x, y];
                    } else if (pos === 'n') {
                      [cx, cy] = [x + w / 2, y];
                    } else if (pos === 'ne') {
                      [cx, cy] = [x + w, y];
                    } else if (pos === 'w') {
                      [cx, cy] = [x, y + h / 2];
                    } else if (pos === 'e') {
                      [cx, cy] = [x + w, y + h / 2];
                    } else if (pos === 'sw') {
                      [cx, cy] = [x, y + h];
                    } else if (pos === 's') {
                      [cx, cy] = [x + w / 2, y + h];
                    } else if (pos === 'se') {
                      [cx, cy] = [x + w, y + h];
                    }

                    const cursors: { [key: string]: string } = {
                      nw: 'nwse-resize',
                      n: 'ns-resize',
                      ne: 'nesw-resize',
                      w: 'ew-resize',
                      e: 'ew-resize',
                      sw: 'nesw-resize',
                      s: 'ns-resize',
                      se: 'nwse-resize',
                    };

                    return (
                      <circle
                        key={pos}
                        cx={cx}
                        cy={cy}
                        r={6}
                        fill="white"
                        stroke="var(--color-primary)"
                        strokeWidth="2"
                        style={{ cursor: cursors[pos] }}
                      />
                    );
                  })}
                  {/* Tail anchor handle */}
                  <circle
                    cx={selectedShape.tailX}
                    cy={selectedShape.tailY}
                    r={7}
                    fill="white"
                    stroke="var(--color-primary)"
                    strokeWidth="2"
                    style={{ cursor: 'move' }}
                  />
                </>
              )}

              {selectedShape.type === 'measurement' && (
                <>
                  {/* Halo/glow effect for enhanced visibility */}
                  <line
                    x1={selectedShape.x1}
                    y1={selectedShape.y1}
                    x2={selectedShape.x2}
                    y2={selectedShape.y2}
                    stroke="var(--color-primary)"
                    strokeWidth="8"
                    pointerEvents="none"
                    opacity="0.2"
                    strokeLinecap="round"
                  />
                  {/* Outer dark stroke for visibility */}
                  <line
                    x1={selectedShape.x1}
                    y1={selectedShape.y1}
                    x2={selectedShape.x2}
                    y2={selectedShape.y2}
                    stroke="#000000"
                    strokeWidth="5"
                    strokeDasharray="4 2"
                    pointerEvents="none"
                    opacity="0.6"
                    strokeLinecap="round"
                  />
                  {/* Inner bright dashed stroke */}
                  <line
                    x1={selectedShape.x1}
                    y1={selectedShape.y1}
                    x2={selectedShape.x2}
                    y2={selectedShape.y2}
                    stroke="var(--color-primary)"
                    strokeWidth="3"
                    strokeDasharray="4 2"
                    pointerEvents="none"
                    strokeLinecap="round"
                  />
                  {/* Endpoint handles (start and end) — same as arrow/line */}
                  {[
                    { pos: 'start', x: selectedShape.x1, y: selectedShape.y1 },
                    { pos: 'end', x: selectedShape.x2, y: selectedShape.y2 },
                  ].map(({ pos, x, y }) => (
                    <circle
                      key={pos}
                      cx={x}
                      cy={y}
                      r={6}
                      fill="white"
                      stroke="var(--color-primary)"
                      strokeWidth="2"
                      style={{ cursor: 'move' }}
                    />
                  ))}
                </>
              )}

              {selectedShape.type === 'freehand' &&
                (() => {
                  // Freehand has no handles — show dashed bounding box as selection indicator
                  if (selectedShape.points.length < 2) return null;
                  const xs = selectedShape.points.map(([x]) => x);
                  const ys = selectedShape.points.map(([, y]) => y);
                  const minX = Math.min(...xs);
                  const minY = Math.min(...ys);
                  const maxX = Math.max(...xs);
                  const maxY = Math.max(...ys);
                  return (
                    <>
                      {/* Halo/glow effect for enhanced visibility */}
                      <rect
                        x={minX - 8}
                        y={minY - 8}
                        width={maxX - minX + 16}
                        height={maxY - minY + 16}
                        stroke="var(--color-primary)"
                        strokeWidth="2"
                        fill="none"
                        pointerEvents="none"
                        opacity="0.3"
                        rx="1"
                      />
                      {/* Outer dark stroke for visibility */}
                      <rect
                        x={minX - 4}
                        y={minY - 4}
                        width={maxX - minX + 8}
                        height={maxY - minY + 8}
                        stroke="#000000"
                        strokeWidth="5"
                        strokeDasharray="4 2"
                        fill="none"
                        pointerEvents="none"
                        opacity="0.6"
                      />
                      {/* Inner bright dashed stroke */}
                      <rect
                        x={minX - 4}
                        y={minY - 4}
                        width={maxX - minX + 8}
                        height={maxY - minY + 8}
                        stroke="var(--color-primary)"
                        strokeWidth="3"
                        strokeDasharray="4 2"
                        fill="none"
                        pointerEvents="none"
                      />
                    </>
                  );
                })()}
            </>
          )}
        </svg>

        {inlineInput.isOpen && (
          <input
            ref={inlineInputRef}
            type="text"
            className={styles.inlineTextInput}
            style={inlineInputStyle}
            aria-label={
              state.selectedTool === 'callout'
                ? t('editCallout')
                : state.selectedTool === 'measurement'
                  ? t('editMeasurement')
                  : t('editText')
            }
            placeholder={
              state.selectedTool === 'measurement' ? t('measurementPlaceholder') : undefined
            }
            data-testid="annotator-inline-input"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitInlineInput();
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                cancelInlineInput();
              }
            }}
            onBlur={() => {
              // Blur outside annotator area commits; blur to within annotator is fine
              commitInlineInput();
            }}
          />
        )}
      </div>

      {/* Screen reader live region */}
      <div aria-live="polite" aria-atomic="true" className={styles.srOnly} ref={liveRegionRef} />

      {/* Save error */}
      {saveError && <FormError variant="banner" message={saveError} />}

      {/* Action bar */}
      <div role="group" aria-label={t('actions')} className={styles.actionBar}>
        <button
          type="button"
          onClick={handleCancel}
          data-testid="annotator-cancel"
          className={styles.cancelButton}
          aria-label={t('cancel')}
        >
          {t('cancel')}
        </button>
        {photo.annotatedAt && !isShowingOriginal && (
          <button
            type="button"
            onClick={() => setShowResetConfirm(true)}
            data-testid="annotator-reset"
            className={styles.resetButton}
            aria-label={t('reset')}
          >
            {t('reset')}
          </button>
        )}
        <button
          type="button"
          onClick={handleSave}
          data-testid="annotator-save"
          disabled={isSaving}
          className={styles.saveButton}
          aria-label={t('save')}
        >
          {isSaving ? t('saving') : t('save')}
        </button>
      </div>

      {/* Reset confirmation modal */}
      {showResetConfirm && (
        <Modal
          title={t('resetTitle')}
          onClose={() => setShowResetConfirm(false)}
          footer={
            <>
              <button
                type="button"
                className={styles.modalButtonSecondary}
                onClick={() => setShowResetConfirm(false)}
              >
                {t('cancel')}
              </button>
              <button type="button" className={styles.modalButtonPrimary} onClick={handleReset}>
                {t('resetConfirm')}
              </button>
            </>
          }
        >
          <p>{t('resetBody')}</p>
        </Modal>
      )}
    </section>
  );
}
