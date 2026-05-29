import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type Konva from 'konva';
import {
  Stage,
  Layer,
  Image as KonvaImage,
  Rect,
  Line,
  Ellipse,
  Text,
  Group,
  Transformer,
  Arrow,
  Circle,
} from 'react-konva';
import { nanoid } from 'nanoid';
import type { Photo } from '@cornerstone/shared';
import {
  useAnnotator,
  type ToolName,
  type FontSizeKey,
  type StrokeWidthKey,
} from './useAnnotator.js';
import type {
  AnnotationShape,
  TextShape,
  MeasurementShape,
  FreehandShape,
} from './useUndoStack.js';
import { resolveFontSize, resolveStrokeWidth } from './annotationConstants.js';
import { simplifyPolyline } from './simplify.js';
import { ToolPalette } from './ToolPalette.js';
import { ANNOTATION_FONT_FAMILY, drawShapeOnCanvas } from './canvasRenderer.js';
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

interface InlineInputState {
  isOpen: boolean;
  anchorImageX: number;
  anchorImageY: number;
  editingShapeId: string | null;
  originalText: string;
}

interface DraftShape {
  type: ToolName;
  points: [number, number][]; // for freehand
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export function PhotoAnnotator({ photo, onSave, onCancel }: PhotoAnnotatorProps) {
  const { t } = useTranslation('photoAnnotator');
  const { state, dispatch, undoStack } = useAnnotator();

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isShowingOriginal] = useState(false);

  const [inlineInput, setInlineInput] = useState<InlineInputState>({
    isOpen: false,
    anchorImageX: 0,
    anchorImageY: 0,
    editingShapeId: null,
    originalText: '',
  });

  const [draftShape, setDraftShape] = useState<DraftShape | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);

  const stageRef = useRef<Konva.Stage>(null);
  const layerRef = useRef<Konva.Layer>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const inlineInputRef = useRef<HTMLInputElement>(null);
  const liveRegionRef = useRef<HTMLDivElement>(null);
  const fontSizePerTool = useRef<Partial<Record<ToolName, FontSizeKey>>>({});
  const shapesNodesRef = useRef<Map<string, Konva.Node>>(new Map());

  // Konva image object
  const [imgElement, setImgElement] = useState<HTMLImageElement | null>(null);

  const canonicalUrl = isShowingOriginal
    ? `${getBaseUrl()}/photos/${photo.id}/file?variant=original`
    : `${getBaseUrl()}/photos/${photo.id}/file`;

  function getActiveFontSizeKey(): FontSizeKey {
    return fontSizePerTool.current[state.selectedTool] ?? state.activeFontSizeKey;
  }

  function getActiveFontSizePx(): number {
    const key = getActiveFontSizeKey();
    const w = photo.width ?? 1000;
    const h = photo.height ?? 1000;
    return resolveFontSize(key, w, h);
  }

  // Load image for Konva
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      setImgElement(img);
      setImageLoaded(true);
    };
    img.onerror = () => {
      setImageLoaded(false);
    };
    img.src = canonicalUrl + `?v=${Date.now()}`;
  }, [canonicalUrl]);

  // Attach transformer to selected shape
  useEffect(() => {
    if (!transformerRef.current) return;

    const selectedShape = state.shapes.find((s) => s.id === state.selectedShapeId);
    // Line-family shapes get custom endpoint Circle handles instead of the 2D Transformer.
    // Text shapes are sized via the Font Size dropdown, not by dragging anchors.
    const skipsTransformer =
      selectedShape?.type === 'arrow' ||
      selectedShape?.type === 'line' ||
      selectedShape?.type === 'measurement' ||
      selectedShape?.type === 'text';

    if (!state.selectedShapeId || skipsTransformer) {
      transformerRef.current.nodes([]);
      return;
    }

    const selectedNode = shapesNodesRef.current.get(state.selectedShapeId);
    if (selectedNode && selectedNode !== transformerRef.current) {
      transformerRef.current.nodes([selectedNode]);
      layerRef.current?.batchDraw();
    }
  }, [state.selectedShapeId, state.shapes]);

  // Open inline input for text editing
  const openInlineInput = useCallback(
    (anchorImageX: number, anchorImageY: number, editingShapeId?: string) => {
      const existingShape = editingShapeId
        ? state.shapes.find((s) => s.id === editingShapeId)
        : null;
      const originalText = (() => {
        if (!existingShape) return '';
        if (existingShape.type === 'text') return existingShape.text;
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
      requestAnimationFrame(() => {
        if (inlineInputRef.current) {
          inlineInputRef.current.value = originalText;
          inlineInputRef.current.focus();
          inlineInputRef.current.select();
        }
      });
    },
    [state.shapes],
  );

  // Commit inline input
  const commitInlineInput = useCallback(() => {
    if (!inlineInput.isOpen) return;
    const text = inlineInputRef.current?.value.trim() ?? '';
    setInlineInput((prev) => ({ ...prev, isOpen: false }));

    if (text === '') {
      if (inlineInput.editingShapeId === null) {
        if (state.selectedTool !== 'measurement') {
          setDraftShape(null);
          return;
        }
      } else {
        return;
      }
    }

    const fontSize = getActiveFontSizePx();

    if (inlineInput.editingShapeId !== null) {
      const shape = state.shapes.find((s) => s.id === inlineInput.editingShapeId);
      if (shape && shape.type === 'text') {
        const updated = { ...shape, text };
        undoStack.commit(state.shapes.map((s) => (s.id === updated.id ? updated : s)));
      } else if (shape && shape.type === 'measurement') {
        const updated: MeasurementShape = { ...shape, label: text };
        undoStack.commit(state.shapes.map((s) => (s.id === updated.id ? updated : s)));
      }
    } else if (state.selectedTool === 'text') {
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
    } else if (state.selectedTool === 'measurement' && draftShape?.type === 'measurement') {
      const committed: MeasurementShape = {
        type: 'measurement',
        id: nanoid(),
        x1: draftShape.startX,
        y1: draftShape.startY,
        x2: draftShape.endX,
        y2: draftShape.endY,
        label: text,
        stroke: state.activeColor,
        strokeWidth: resolveStrokeWidth(state.activeStrokeWidthKey, photo.width!, photo.height!),
        fontSize,
        color: state.activeColor,
      };
      const newShapes = [...undoStack.shapes, committed];
      setDraftShape(null);
      undoStack.commit(newShapes);
      dispatch({ type: 'SELECT_SHAPE', id: committed.id });
      if (liveRegionRef.current) {
        liveRegionRef.current.textContent = t('shapeAddedMeasurement');
      }
    }
  }, [
    inlineInput,
    state.shapes,
    state.selectedTool,
    state.activeColor,
    state.activeStrokeWidthKey,
    photo.width,
    photo.height,
    draftShape,
    undoStack,
    dispatch,
    t,
  ]);

  // Cancel inline input
  const cancelInlineInput = useCallback(() => {
    if (!inlineInput.isOpen) return;

    if (state.selectedTool === 'measurement') {
      commitInlineInput();
      return;
    }

    setInlineInput((prev) => ({ ...prev, isOpen: false }));
    if (inlineInput.editingShapeId === null) {
      setDraftShape(null);
    }
  }, [inlineInput, state.selectedTool, commitInlineInput]);

  // Keyboard handlers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (inlineInput.isOpen) return;

      const isMod = e.metaKey || e.ctrlKey;

      if (isMod && !e.shiftKey && e.key === 'z') {
        e.preventDefault();
        undoStack.undo();
        if (liveRegionRef.current) {
          liveRegionRef.current.textContent = t('undoPerformed');
        }
        return;
      }

      if (isMod && ((e.shiftKey && e.key === 'z') || e.key === 'y')) {
        e.preventDefault();
        undoStack.redo();
        if (liveRegionRef.current) {
          liveRegionRef.current.textContent = t('redoPerformed');
        }
        return;
      }

      if (state.selectedShapeId && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault();
        dispatch({ type: 'DELETE_SELECTED' });
        undoStack.commit(state.shapes.filter((s) => s.id !== state.selectedShapeId));
        if (liveRegionRef.current) {
          liveRegionRef.current.textContent = t('shapeDeleted');
        }
        return;
      }

      // Arrow nudge
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
          let updated: AnnotationShape | null = null;

          if (selectedShape.type === 'rectangle' || selectedShape.type === 'highlight') {
            updated = {
              ...selectedShape,
              x: Math.max(0, Math.min(selectedShape.x + dx, photo.width! - selectedShape.w)),
              y: Math.max(0, Math.min(selectedShape.y + dy, photo.height! - selectedShape.h)),
            };
          } else if (selectedShape.type === 'arrow' || selectedShape.type === 'line') {
            updated = {
              ...selectedShape,
              x1: Math.max(0, Math.min(selectedShape.x1 + dx, photo.width!)),
              y1: Math.max(0, Math.min(selectedShape.y1 + dy, photo.height!)),
              x2: Math.max(0, Math.min(selectedShape.x2 + dx, photo.width!)),
              y2: Math.max(0, Math.min(selectedShape.y2 + dy, photo.height!)),
            };
          } else if (selectedShape.type === 'ellipse') {
            updated = {
              ...selectedShape,
              cx: Math.max(
                selectedShape.rx,
                Math.min(selectedShape.cx + dx, photo.width! - selectedShape.rx),
              ),
              cy: Math.max(
                selectedShape.ry,
                Math.min(selectedShape.cy + dy, photo.height! - selectedShape.ry),
              ),
            };
          } else if (selectedShape.type === 'text') {
            updated = {
              ...selectedShape,
              x: Math.max(0, Math.min(selectedShape.x + dx, photo.width!)),
              y: Math.max(0, Math.min(selectedShape.y + dy, photo.height!)),
            };
          } else if (selectedShape.type === 'measurement') {
            updated = {
              ...selectedShape,
              x1: Math.max(0, Math.min(selectedShape.x1 + dx, photo.width!)),
              y1: Math.max(0, Math.min(selectedShape.y1 + dy, photo.height!)),
              x2: Math.max(0, Math.min(selectedShape.x2 + dx, photo.width!)),
              y2: Math.max(0, Math.min(selectedShape.y2 + dy, photo.height!)),
            };
          } else if (selectedShape.type === 'freehand') {
            updated = {
              ...selectedShape,
              points: selectedShape.points.map(([x, y]) => [
                Math.max(0, Math.min(x + dx, photo.width!)),
                Math.max(0, Math.min(y + dy, photo.height!)),
              ]) as [number, number][],
            };
          }

          if (updated) {
            undoStack.commit(state.shapes.map((s) => (s.id === updated!.id ? updated! : s)));
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    // Endpoint handles for selected line-family shapes
  const selectedShape = state.selectedShapeId
    ? state.shapes.find((s) => s.id === state.selectedShapeId) ?? null
    : null;
  const selectedLineShape =
    selectedShape &&
    (selectedShape.type === 'arrow' ||
      selectedShape.type === 'line' ||
      selectedShape.type === 'measurement')
      ? selectedShape
      : null;
  const endpointRadius = selectedLineShape
    ? Math.max(8, selectedLineShape.strokeWidth * 1.5)
    : 0;
  const endpointHandles = selectedLineShape ? (
    <>
      <Circle
        id={`endpoint-${selectedLineShape.id}-start`}
        x={selectedLineShape.x1}
        y={selectedLineShape.y1}
        radius={endpointRadius}
        fill="#ffffff"
        stroke={selectedLineShape.stroke}
        strokeWidth={2}
        draggable
        onDragMove={(e) => {
          const pos = e.target.position();
          dispatch({
            type: 'UPDATE_SHAPE',
            shape: { ...selectedLineShape, x1: pos.x, y1: pos.y },
          });
        }}
        onDragEnd={(e) => {
          const newX1 = e.target.x();
          const newY1 = e.target.y();
          const updated = { ...selectedLineShape, x1: newX1, y1: newY1 };
          undoStack.commit(
            undoStack.shapes.map((s) => (s.id === selectedLineShape.id ? updated : s)),
          );
        }}
      />
      <Circle
        id={`endpoint-${selectedLineShape.id}-end`}
        x={selectedLineShape.x2}
        y={selectedLineShape.y2}
        radius={endpointRadius}
        fill="#ffffff"
        stroke={selectedLineShape.stroke}
        strokeWidth={2}
        draggable
        onDragMove={(e) => {
          const pos = e.target.position();
          dispatch({
            type: 'UPDATE_SHAPE',
            shape: { ...selectedLineShape, x2: pos.x, y2: pos.y },
          });
        }}
        onDragEnd={(e) => {
          const newX2 = e.target.x();
          const newY2 = e.target.y();
          const updated = { ...selectedLineShape, x2: newX2, y2: newY2 };
          undoStack.commit(
            undoStack.shapes.map((s) => (s.id === selectedLineShape.id ? updated : s)),
          );
        }}
      />
    </>
  ) : null;

  return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    inlineInput.isOpen,
    state.selectedShapeId,
    state.shapes,
    undoStack,
    dispatch,
    photo.width,
    photo.height,
    t,
  ]);

  // Stage pointer events for drawing
  const handleStageMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (inlineInput.isOpen) return;
      if (!stageRef.current) return;

      const pos = stageRef.current.getPointerPosition();
      if (!pos) return;

      const target = e.target;

      // If click landed on the Transformer (an anchor handle) or an endpoint Circle handle,
      // let it handle the resize/drag natively.
      let n: Konva.Node | null = target;
      while (n && n !== stageRef.current) {
        if (n === transformerRef.current) return;
        const nodeId = n.id();
        if (nodeId && nodeId.startsWith('endpoint-')) return;
        n = n.getParent();
      }

      // Walk up the parent chain to find a shape node (Group or shape with shape-* id)
      let cursor: Konva.Node | null = target;
      let shapeNode: Konva.Node | null = null;
      while (cursor && cursor !== stageRef.current) {
        const nodeId = cursor.id();
        if (nodeId && nodeId.startsWith('shape-')) {
          shapeNode = cursor;
          break;
        }
        cursor = cursor.getParent();
      }

      if (state.selectedTool === 'select') {
        // In select mode: handle shape selection and deselection
        if (shapeNode) {
          // Click was on a shape — select it
          dispatch({ type: 'SELECT_SHAPE', id: shapeNode.id().replace('shape-', '') });
        } else {
          // Click was on background / stage / non-shape node — deselect
          dispatch({ type: 'SELECT_SHAPE', id: null });
        }
        return;
      }

      // Drawing mode — ignore shape clicks, start draft only if not clicking on a shape
      if (shapeNode) {
        return;
      }

      setDraftShape({
        type: state.selectedTool,
        points: state.selectedTool === 'freehand' ? [[pos.x, pos.y]] : [],
        startX: pos.x,
        startY: pos.y,
        endX: pos.x,
        endY: pos.y,
      });
    },
    [state.selectedTool, dispatch, inlineInput.isOpen],
  );

  const handleStageMouseMove = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (inlineInput.isOpen) return;
      if (!stageRef.current || !draftShape) return;

      const pos = stageRef.current.getPointerPosition();
      if (!pos) return;

      if (state.selectedTool === 'freehand') {
        setDraftShape((prev) =>
          prev ? { ...prev, points: [...prev.points, [pos.x, pos.y]] } : null,
        );
      } else {
        setDraftShape((prev) => (prev ? { ...prev, endX: pos.x, endY: pos.y } : null));
      }
    },
    [draftShape, state.selectedTool, inlineInput.isOpen],
  );

  const handleStageMouseUp = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (inlineInput.isOpen) return;
      if (!draftShape) return;

      const MIN_SIZE = 5;
      const w = Math.abs(draftShape.endX - draftShape.startX);
      const h = Math.abs(draftShape.endY - draftShape.startY);

      if (state.selectedTool === 'freehand') {
        if (draftShape.points.length < 2) {
          setDraftShape(null);
          return;
        }
        const simplified = simplifyPolyline(draftShape.points);
        const newShape: FreehandShape = {
          type: 'freehand',
          id: nanoid(),
          points: simplified,
          stroke: state.activeColor,
          strokeWidth: resolveStrokeWidth(state.activeStrokeWidthKey, photo.width!, photo.height!),
        };
        undoStack.commit([...undoStack.shapes, newShape as AnnotationShape]);
        setDraftShape(null);
        if (liveRegionRef.current) {
          liveRegionRef.current.textContent = t('shapeAddedFreehand');
        }
      } else if (state.selectedTool === 'text') {
        // Text tool: click-to-place, no drag size requirement
        openInlineInput(draftShape.startX, draftShape.startY);
      } else if (state.selectedTool === 'measurement') {
        // Measurement: line-based, use Euclidean distance gate
        const distance = Math.hypot(
          draftShape.endX - draftShape.startX,
          draftShape.endY - draftShape.startY,
        );
        if (distance > MIN_SIZE) {
          const midX = (draftShape.startX + draftShape.endX) / 2;
          const midY = (draftShape.startY + draftShape.endY) / 2;
          openInlineInput(midX, midY);
        } else {
          setDraftShape(null);
        }
      } else if (w > MIN_SIZE && h > MIN_SIZE) {
        const newShape = createShapeFromDraft(draftShape);
        if (newShape) {
          undoStack.commit(undoStack.shapes.concat([newShape as AnnotationShape]));
          setDraftShape(null);
          const announcements: Record<ToolName, string> = {
            rectangle: t('shapeAddedRectangle'),
            highlight: t('shapeAddedHighlight'),
            arrow: t('shapeAddedArrow'),
            line: t('shapeAddedLine'),
            ellipse: t('shapeAddedEllipse'),
            text: '',
            measurement: '',
            freehand: '',
            select: '',
          };
          if (announcements[state.selectedTool] && liveRegionRef.current) {
            liveRegionRef.current.textContent = announcements[state.selectedTool];
          }
        }
      } else {
        setDraftShape(null);
      }
    },
    [draftShape, state, photo, undoStack, inlineInput.isOpen, openInlineInput, t],
  );

  function createShapeFromDraft(draft: DraftShape): AnnotationShape | null {
    const strokeWidth = resolveStrokeWidth(state.activeStrokeWidthKey, photo.width!, photo.height!);

    const shape: AnnotationShape | null = (() => {
      if (draft.type === 'rectangle') {
        return {
          type: 'rectangle' as const,
          id: nanoid(),
          x: Math.min(draft.startX, draft.endX),
          y: Math.min(draft.startY, draft.endY),
          w: Math.abs(draft.endX - draft.startX),
          h: Math.abs(draft.endY - draft.startY),
          color: state.activeColor,
          strokeWidth,
        };
      } else if (draft.type === 'highlight') {
        return {
          type: 'highlight' as const,
          id: nanoid(),
          x: Math.min(draft.startX, draft.endX),
          y: Math.min(draft.startY, draft.endY),
          w: Math.abs(draft.endX - draft.startX),
          h: Math.abs(draft.endY - draft.startY),
          color: state.activeColor,
        };
      } else if (draft.type === 'arrow') {
        return {
          type: 'arrow' as const,
          id: nanoid(),
          x1: draft.startX,
          y1: draft.startY,
          x2: draft.endX,
          y2: draft.endY,
          stroke: state.activeColor,
          strokeWidth,
        };
      } else if (draft.type === 'line') {
        return {
          type: 'line' as const,
          id: nanoid(),
          x1: draft.startX,
          y1: draft.startY,
          x2: draft.endX,
          y2: draft.endY,
          stroke: state.activeColor,
          strokeWidth,
        };
      } else if (draft.type === 'ellipse') {
        return {
          type: 'ellipse' as const,
          id: nanoid(),
          cx: (draft.startX + draft.endX) / 2,
          cy: (draft.startY + draft.endY) / 2,
          rx: Math.abs(draft.endX - draft.startX) / 2,
          ry: Math.abs(draft.endY - draft.startY) / 2,
          stroke: state.activeColor,
          strokeWidth,
        };
      }
      return null;
    })();

    return shape;
  }

  // Save handler
  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setSaveError(null);

    const liveRegion = liveRegionRef.current;
    if (liveRegion) {
      liveRegion.textContent = t('saving');
    }

    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = canonicalUrl + `?v=${Date.now()}`;
      });

      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;

      ctx.drawImage(img, 0, 0);

      // Draw all shapes
      for (const shape of undoStack.shapes) {
        drawShapeOnCanvas(ctx, shape);
      }

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('Canvas toBlob failed'))),
          'image/webp',
          0.92,
        );
      });

      const updatedPhoto = await uploadAnnotation(photo.id, blob);
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

  const handleCancel = useCallback(() => {
    onCancel();
  }, [onCancel]);

  // Inline input positioning
  const inlineInputStyle = useMemo((): React.CSSProperties => {
    if (!inlineInput.isOpen || !stageRef.current) return { display: 'none' };

    const stage = stageRef.current;
    const container = stage.container();
    const stageRect = container.getBoundingClientRect();

    // Get canvasArea's viewport position to convert stage coordinates to canvasArea-relative
    const canvasAreaEl = container.parentElement;
    if (!canvasAreaEl) return { display: 'none' };
    const canvasAreaRect = canvasAreaEl.getBoundingClientRect();

    const scale = stageRect.width / (photo.width ?? 800);
    const screenFontSizePx = getActiveFontSizePx() * scale;

    let textColor = state.activeColor;
    let editingShape = null;
    if (inlineInput.editingShapeId) {
      editingShape = state.shapes.find((s) => s.id === inlineInput.editingShapeId);
      if (editingShape && editingShape.type === 'text') {
        textColor = editingShape.color;
      }
    }

    const shapeType = editingShape?.type || draftShape?.type || state.selectedTool;

    let imgX = inlineInput.anchorImageX;
    let imgY = inlineInput.anchorImageY;
    let imgW = Math.max(100, (screenFontSizePx / scale) * 10);
    let imgH = screenFontSizePx / scale;
    let textAlign: 'left' | 'center' = 'left';

    if (shapeType === 'measurement' && draftShape?.type === 'measurement') {
      const fontSize = getActiveFontSizePx();
      const dx = draftShape.endX - draftShape.startX;
      const dy = draftShape.endY - draftShape.startY;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const labelOffsetX = nx * fontSize * 1.2;
      const labelOffsetY = ny * fontSize * 1.2;
      imgX = inlineInput.anchorImageX + labelOffsetX - fontSize * 2;
      imgY = inlineInput.anchorImageY + labelOffsetY - fontSize * 0.5;
      imgW = fontSize * 4;
      imgH = fontSize;
      textAlign = 'center';
    } else if (shapeType === 'text') {
      imgY = inlineInput.anchorImageY - (screenFontSizePx / scale) * 0.75;
      imgW = Math.max(100, (screenFontSizePx / scale) * 12);
    }

    // Convert to canvasArea-relative coordinates (stage offset relative to canvasArea parent)
    const stageOffsetX = stageRect.left - canvasAreaRect.left;
    const stageOffsetY = stageRect.top - canvasAreaRect.top;
    const screenX = (imgX / (photo.width ?? 800)) * stageRect.width + stageOffsetX;
    const screenY = (imgY / (photo.height ?? 600)) * stageRect.height + stageOffsetY;
    const screenW = (imgW / (photo.width ?? 800)) * stageRect.width;
    const screenH = (imgH / (photo.height ?? 600)) * stageRect.height;

    return {
      position: 'absolute',
      left: `${screenX}px`,
      top: `${screenY}px`,
      width: `${Math.max(50, screenW)}px`,
      height: `${Math.max(20, screenH)}px`,
      fontSize: `${screenFontSizePx}px`,
      lineHeight: '1',
      color: textColor,
      fontFamily: ANNOTATION_FONT_FAMILY,
      background: 'transparent',
      textAlign,
      boxSizing: 'border-box',
      zIndex: 1000,
    };
  }, [
    inlineInput,
    photo.width,
    photo.height,
    state.activeColor,
    state.shapes,
    state.selectedTool,
    draftShape,
  ]);

  const stageWidth = photo.width ?? 800;
  const stageHeight = photo.height ?? 600;

  if (!imageLoaded || !imgElement) {
    return (
      <section aria-label={t('region')} className={styles.annotator}>
        <ToolPalette
          selectedTool={state.selectedTool}
          activeColor={state.activeColor}
          activeStrokeWidthKey={state.activeStrokeWidthKey}
          activeFontSizeKey={getActiveFontSizeKey()}
          canUndo={false}
          canRedo={false}
          onSelectTool={() => {}}
          onSelectColor={() => {}}
          onSelectStrokeWidth={() => {}}
          onSelectFontSize={() => {}}
          onUndo={() => {}}
          onRedo={() => {}}
        />
        <div className={styles.canvasArea} />
      </section>
    );
  }

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
          if (state.selectedShapeId) {
            const shape = state.shapes.find((s) => s.id === state.selectedShapeId);
            if (shape) {
              const updated =
                shape.type === 'text' ? { ...shape, color } : { ...shape, stroke: color };
              undoStack.commit(state.shapes.map((s) => (s.id === updated.id ? updated : s)));
            }
          }
        }}
        onSelectStrokeWidth={(key) => {
          dispatch({ type: 'SET_STROKE_WIDTH', key });
          if (state.selectedShapeId) {
            const shape = state.shapes.find((s) => s.id === state.selectedShapeId);
            if (shape) {
              const newStrokeWidth = resolveStrokeWidth(key, photo.width!, photo.height!);
              const updated = { ...shape, strokeWidth: newStrokeWidth };
              undoStack.commit(state.shapes.map((s) => (s.id === updated.id ? updated : s)));
            }
          }
        }}
        onSelectFontSize={(key) => {
          fontSizePerTool.current[state.selectedTool] = key as FontSizeKey;
          dispatch({ type: 'SET_FONT_SIZE', key: key as FontSizeKey });
          if (state.selectedShapeId) {
            const shape = state.shapes.find((s) => s.id === state.selectedShapeId);
            if (shape && (shape.type === 'text' || shape.type === 'measurement')) {
              const newFontSize = resolveFontSize(key as FontSizeKey, photo.width!, photo.height!);
              const updated = { ...shape, fontSize: newFontSize };
              undoStack.commit(state.shapes.map((s) => (s.id === updated.id ? updated : s)));
            }
          }
        }}
        onUndo={() => undoStack.undo()}
        onRedo={() => undoStack.redo()}
      />

      <div
        className={styles.canvasArea}
        style={{ position: 'relative' }}
        role="application"
        aria-label={t('canvas')}
      >
        <Stage
          ref={stageRef}
          width={stageWidth}
          height={stageHeight}
          onMouseDown={handleStageMouseDown}
          onMouseMove={handleStageMouseMove}
          onMouseUp={handleStageMouseUp}
        >
          <Layer ref={layerRef}>
            <KonvaImage image={imgElement} width={stageWidth} height={stageHeight} />

            {/* Render committed shapes */}
            {undoStack.shapes.map((shape) =>
              renderKonvaShape(
                shape,
                state.selectedShapeId,
                shapesNodesRef,
                (id) => dispatch({ type: 'SELECT_SHAPE', id }),
                (id, updates) => {
                  const updated = state.shapes.map((s) =>
                    s.id === id ? ({ ...s, ...updates } as AnnotationShape) : s,
                  );
                  undoStack.commit(updated);
                },
                state.selectedTool,
              ),
            )}

            {/* Render draft shape */}
            {draftShape && renderDraftShape(draftShape, state)}

            {/* Transformer for selected shape */}
            {state.selectedShapeId && <Transformer ref={transformerRef} />}

            {/* Endpoint handles for line-family shapes */}
            {endpointHandles}
          </Layer>
        </Stage>

        {/* Inline text input */}
        {inlineInput.isOpen && (
          <input
            ref={inlineInputRef}
            type="text"
            style={inlineInputStyle}
            onBlur={commitInlineInput}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                commitInlineInput();
              } else if (e.key === 'Escape') {
                e.stopPropagation();
                cancelInlineInput();
              }
            }}
            className={styles.inlineInput}
            data-testid="annotator-inline-input"
          />
        )}
      </div>

      {/* Action buttons */}
      <div className={styles.actions}>
        <button
          type="button"
          onClick={handleCancel}
          className={styles.cancelButton}
          data-testid="annotator-cancel"
        >
          {t('cancel')}
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className={styles.saveButton}
          data-testid="annotator-save"
        >
          {isSaving ? t('saving') : t('save')}
        </button>
      </div>

      {saveError && <FormError message={saveError} />}

      <div ref={liveRegionRef} role="status" aria-live="polite" aria-atomic />
    </section>
  );
}

// Helper function to render a committed shape using react-konva
function renderKonvaShape(
  shape: AnnotationShape,
  selectedId: string | null,
  shapesNodesRef: React.MutableRefObject<Map<string, Konva.Node>>,
  onSelect: (id: string) => void,
  onChange: (id: string, updates: Partial<AnnotationShape>) => void,
  selectedTool: ToolName,
): React.ReactNode {
  const isSelected = shape.id === selectedId;

  if (shape.type === 'rectangle') {
    return (
      <Rect
        key={shape.id}
        id={`shape-${shape.id}`}
        x={shape.x}
        y={shape.y}
        width={shape.w}
        height={shape.h}
        stroke={shape.color}
        strokeWidth={shape.strokeWidth}
        fill="transparent"
        draggable={selectedTool === 'select'}
        onClick={() => onSelect(shape.id)}
        ref={(node) => {
          if (node) {
            shapesNodesRef.current.set(shape.id, node);
          }
        }}
        onDragEnd={(e) => {
          onChange(shape.id, { x: e.target.x(), y: e.target.y() });
        }}
      />
    );
  }

  if (shape.type === 'highlight') {
    return (
      <Rect
        key={shape.id}
        id={`shape-${shape.id}`}
        x={shape.x}
        y={shape.y}
        width={shape.w}
        height={shape.h}
        fill={shape.color}
        fillOpacity={0.4}
        stroke="none"
        draggable={selectedTool === 'select'}
        onClick={() => onSelect(shape.id)}
        ref={(node) => {
          if (node) {
            shapesNodesRef.current.set(shape.id, node);
          }
        }}
        onDragEnd={(e) => {
          onChange(shape.id, { x: e.target.x(), y: e.target.y() });
        }}
      />
    );
  }

  if (shape.type === 'arrow') {
    return (
      <Arrow
        key={shape.id}
        id={`shape-${shape.id}`}
        points={[shape.x1, shape.y1, shape.x2, shape.y2]}
        stroke={shape.stroke}
        strokeWidth={shape.strokeWidth}
        fill={shape.stroke}
        draggable={selectedTool === 'select'}
        onClick={() => onSelect(shape.id)}
        pointerLength={Math.max(8, shape.strokeWidth * 3)}
        pointerWidth={Math.max(8, shape.strokeWidth * 3)}
        ref={(node) => {
          if (node) {
            shapesNodesRef.current.set(shape.id, node);
          }
        }}
        onDragEnd={(e) => {
          const target = e.target as Konva.Arrow;
          const points = target.points();
          if (!points) return;
          const dx = target.x();
          const dy = target.y();
          onChange(shape.id, {
            x1: (points[0] ?? 0) + dx,
            y1: (points[1] ?? 0) + dy,
            x2: (points[2] ?? 0) + dx,
            y2: (points[3] ?? 0) + dy,
          });
          target.position({ x: 0, y: 0 });
        }}
      />
    );
  }

  if (shape.type === 'line') {
    return (
      <Line
        key={shape.id}
        id={`shape-${shape.id}`}
        points={[shape.x1, shape.y1, shape.x2, shape.y2]}
        stroke={shape.stroke}
        strokeWidth={shape.strokeWidth}
        draggable={selectedTool === 'select'}
        onClick={() => onSelect(shape.id)}
        ref={(node) => {
          if (node) {
            shapesNodesRef.current.set(shape.id, node);
          }
        }}
        onDragEnd={(e) => {
          const target = e.target as Konva.Line;
          const points = target.points();
          if (!points) return;
          const dx = target.x();
          const dy = target.y();
          onChange(shape.id, {
            x1: (points[0] ?? 0) + dx,
            y1: (points[1] ?? 0) + dy,
            x2: (points[2] ?? 0) + dx,
            y2: (points[3] ?? 0) + dy,
          });
          target.position({ x: 0, y: 0 });
        }}
      />
    );
  }

  if (shape.type === 'ellipse') {
    return (
      <Ellipse
        key={shape.id}
        id={`shape-${shape.id}`}
        x={shape.cx}
        y={shape.cy}
        radiusX={shape.rx}
        radiusY={shape.ry}
        stroke={shape.stroke}
        strokeWidth={shape.strokeWidth}
        fill="transparent"
        draggable={selectedTool === 'select'}
        onClick={() => onSelect(shape.id)}
        ref={(node) => {
          if (node) {
            shapesNodesRef.current.set(shape.id, node);
          }
        }}
        onDragEnd={(e) => {
          onChange(shape.id, { cx: e.target.x(), cy: e.target.y() });
        }}
      />
    );
  }

  if (shape.type === 'text') {
    return (
      <Text
        key={shape.id}
        id={`shape-${shape.id}`}
        x={shape.x}
        y={shape.y}
        text={shape.text}
        fontSize={shape.fontSize}
        fill={shape.color}
        fontFamily={ANNOTATION_FONT_FAMILY}
        draggable={selectedTool === 'select'}
        onClick={() => onSelect(shape.id)}
        ref={(node) => {
          if (node) {
            shapesNodesRef.current.set(shape.id, node);
          }
        }}
        onDragEnd={(e) => {
          onChange(shape.id, { x: e.target.x(), y: e.target.y() });
        }}
      />
    );
  }

  if (shape.type === 'measurement') {
    const dx = shape.x2 - shape.x1;
    const dy = shape.y2 - shape.y1;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const midX = (shape.x1 + shape.x2) / 2;
    const midY = (shape.y1 + shape.y2) / 2;
    const offset = shape.fontSize * 1.2;

    return (
      <Group
        key={shape.id}
        id={`shape-${shape.id}`}
        draggable={selectedTool === 'select'}
        onClick={() => onSelect(shape.id)}
        ref={(node) => {
          if (node) {
            shapesNodesRef.current.set(shape.id, node);
          }
        }}
        onDragEnd={(e) => {
          const target = e.target as Konva.Group;
          const dx = target.x();
          const dy = target.y();
          onChange(shape.id, {
            x1: shape.x1 + dx,
            y1: shape.y1 + dy,
            x2: shape.x2 + dx,
            y2: shape.y2 + dy,
          });
          target.position({ x: 0, y: 0 });
        }}
      >
        <Arrow
          points={[shape.x1, shape.y1, shape.x2, shape.y2]}
          stroke={shape.stroke}
          strokeWidth={shape.strokeWidth}
          fill={shape.stroke}
          pointerAtBeginning
          pointerAtEnding
          pointerLength={Math.max(8, shape.strokeWidth * 3)}
          pointerWidth={Math.max(8, shape.strokeWidth * 3)}
        />
        <Text
          x={midX + nx * offset}
          y={midY + ny * offset - shape.fontSize / 2}
          text={shape.label}
          fontSize={shape.fontSize}
          fill={shape.color}
          fontFamily={ANNOTATION_FONT_FAMILY}
          align="center"
          offsetX={shape.fontSize}
        />
      </Group>
    );
  }

  if (shape.type === 'freehand') {
    const flatPoints = shape.points.flatMap(([x, y]) => [x, y]);
    return (
      <Line
        key={shape.id}
        id={`shape-${shape.id}`}
        points={flatPoints}
        stroke={shape.stroke}
        strokeWidth={shape.strokeWidth}
        tension={0.5}
        lineCap="round"
        lineJoin="round"
        draggable={selectedTool === 'select'}
        onClick={() => onSelect(shape.id)}
        ref={(node) => {
          if (node) {
            shapesNodesRef.current.set(shape.id, node);
          }
        }}
        onDragEnd={(e) => {
          const target = e.target as Konva.Line;
          const points = target.points();
          if (!points) return;
          const dx = target.x();
          const dy = target.y();
          const newPoints: [number, number][] = [];
          for (let i = 0; i < points.length; i += 2) {
            newPoints.push([(points[i] ?? 0) + dx, (points[i + 1] ?? 0) + dy]);
          }
          onChange(shape.id, { points: newPoints });
          target.position({ x: 0, y: 0 });
        }}
      />
    );
  }

  return null;
}

// Helper function to render draft shape
function renderDraftShape(draft: DraftShape, state: any): React.ReactNode {
  if (draft.type === 'rectangle') {
    return (
      <Rect
        key="draft"
        x={Math.min(draft.startX, draft.endX)}
        y={Math.min(draft.startY, draft.endY)}
        width={Math.abs(draft.endX - draft.startX)}
        height={Math.abs(draft.endY - draft.startY)}
        stroke={state.activeColor}
        strokeWidth={1}
        fill="transparent"
        dash={[6, 4]}
        opacity={0.8}
        listening={false}
      />
    );
  }

  if (draft.type === 'highlight') {
    return (
      <Rect
        key="draft"
        x={Math.min(draft.startX, draft.endX)}
        y={Math.min(draft.startY, draft.endY)}
        width={Math.abs(draft.endX - draft.startX)}
        height={Math.abs(draft.endY - draft.startY)}
        fill={state.activeColor}
        fillOpacity={0.3}
        stroke="none"
        opacity={0.8}
        listening={false}
      />
    );
  }

  if (draft.type === 'arrow') {
    return (
      <Arrow
        key="draft"
        points={[draft.startX, draft.startY, draft.endX, draft.endY]}
        stroke={state.activeColor}
        strokeWidth={1}
        fill={state.activeColor}
        pointerLength={8}
        pointerWidth={8}
        opacity={0.8}
        listening={false}
      />
    );
  }

  if (draft.type === 'line') {
    return (
      <Line
        key="draft"
        points={[draft.startX, draft.startY, draft.endX, draft.endY]}
        stroke={state.activeColor}
        strokeWidth={1}
        opacity={0.8}
        listening={false}
      />
    );
  }

  if (draft.type === 'measurement') {
    return (
      <Arrow
        key="draft"
        points={[draft.startX, draft.startY, draft.endX, draft.endY]}
        stroke={state.activeColor}
        strokeWidth={1}
        fill={state.activeColor}
        pointerAtBeginning
        pointerAtEnding
        pointerLength={8}
        pointerWidth={8}
        opacity={0.8}
        listening={false}
      />
    );
  }

  if (draft.type === 'ellipse') {
    return (
      <Ellipse
        key="draft"
        x={(draft.startX + draft.endX) / 2}
        y={(draft.startY + draft.endY) / 2}
        radiusX={Math.abs(draft.endX - draft.startX) / 2}
        radiusY={Math.abs(draft.endY - draft.startY) / 2}
        stroke={state.activeColor}
        strokeWidth={1}
        fill="transparent"
        opacity={0.8}
        listening={false}
      />
    );
  }

  if (draft.type === 'freehand' && draft.points.length > 0) {
    const flatPoints = draft.points.flatMap(([x, y]) => [x, y]);
    return (
      <Line
        key="draft"
        points={flatPoints}
        stroke={state.activeColor}
        strokeWidth={1}
        tension={0.5}
        lineCap="round"
        lineJoin="round"
        opacity={0.8}
        listening={false}
      />
    );
  }

  return null;
}
