import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { Photo } from '@cornerstone/shared';
import { useAnnotator } from './useAnnotator.js';
import { ToolPalette } from './ToolPalette.js';
import { RectangleTool } from './tools/RectangleTool.js';
import { HighlightTool } from './tools/HighlightTool.js';
import { ArrowTool } from './tools/ArrowTool.js';
import { LineTool } from './tools/LineTool.js';
import { EllipseTool } from './tools/EllipseTool.js';
import { SelectTool } from './tools/SelectTool.js';
import type { PointerContext } from './tools/SelectTool.js';
import { screenToImage, clamp } from './geometry.js';
import { renderShapeSvgProps, drawShapeOnCanvas } from './render.js';
import { FormError } from '../../FormError/FormError.js';
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

  const imgRef = useRef<HTMLImageElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const liveRegionRef = useRef<HTMLDivElement>(null);

  // Calculate canonical URL
  const canonicalUrl = `${getBaseUrl()}/photos/${photo.id}/file`;

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
      const isMod = e.metaKey || e.ctrlKey;

      // Undo
      if (isMod && !e.shiftKey && e.key === 'z') {
        e.preventDefault();
        undoStack.undo();
        return;
      }

      // Redo
      if (isMod && ((e.shiftKey && e.key === 'z') || e.key === 'y')) {
        e.preventDefault();
        undoStack.redo();
        return;
      }

      // Escape
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        handleCancel();
        return;
      }

      // Delete selected shape
      if (state.selectedShapeId && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault();
        dispatch({ type: 'DELETE_SELECTED' });
        return;
      }

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
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state.selectedShapeId, state.shapes, undoStack, dispatch, photo.width, photo.height]);

  // Pointer event handlers for drawing/editing
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!svgRef.current) return;

      const svgRect = svgRef.current.getBoundingClientRect();
      const { x: imageX, y: imageY } = screenToImage(
        e.clientX,
        e.clientY,
        svgRect,
        photo.width!,
        photo.height!,
      );

      const ctx: PointerContext = {
        imageX,
        imageY,
        imageWidth: photo.width!,
        imageHeight: photo.height!,
        event: e,
      };

      const toolHandlers = {
        select: SelectTool,
        rectangle: RectangleTool,
        highlight: HighlightTool,
        arrow: ArrowTool,
        line: LineTool,
        ellipse: EllipseTool,
      };

      const handler = toolHandlers[state.selectedTool];
      const actions = handler.onPointerDown(state, ctx);

      for (const action of actions) {
        dispatch(action);
      }
    },
    [state, photo.width, photo.height, dispatch],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!svgRef.current) return;

      const svgRect = svgRef.current.getBoundingClientRect();
      const { x: imageX, y: imageY } = screenToImage(
        e.clientX,
        e.clientY,
        svgRect,
        photo.width!,
        photo.height!,
      );

      const ctx: PointerContext = {
        imageX,
        imageY,
        imageWidth: photo.width!,
        imageHeight: photo.height!,
        event: e,
      };

      const toolHandlers = {
        select: SelectTool,
        rectangle: RectangleTool,
        highlight: HighlightTool,
        arrow: ArrowTool,
        line: LineTool,
        ellipse: EllipseTool,
      };

      const handler = toolHandlers[state.selectedTool];
      const actions = handler.onPointerMove(state, ctx);

      for (const action of actions) {
        dispatch(action);
      }
    },
    [state, photo.width, photo.height, dispatch],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!svgRef.current) return;

      const svgRect = svgRef.current.getBoundingClientRect();
      const { x: imageX, y: imageY } = screenToImage(
        e.clientX,
        e.clientY,
        svgRect,
        photo.width!,
        photo.height!,
      );

      const ctx: PointerContext = {
        imageX,
        imageY,
        imageWidth: photo.width!,
        imageHeight: photo.height!,
        event: e,
      };

      const toolHandlers = {
        select: SelectTool,
        rectangle: RectangleTool,
        highlight: HighlightTool,
        arrow: ArrowTool,
        line: LineTool,
        ellipse: EllipseTool,
      };

      const handler = toolHandlers[state.selectedTool];
      const actions = handler.onPointerUp(state, ctx);

      for (const action of actions) {
        dispatch(action);
      }

      // Commit moves/resizes to undo stack after pointer up
      if (state.selectedTool === 'select' && state.selectedShapeId) {
        undoStack.commit(state.shapes);
      }
    },
    [state, photo.width, photo.height, dispatch, undoStack],
  );

  const handleCancel = useCallback(() => {
    onCancel();
  }, [onCancel]);

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

      // Create off-screen canvas at native resolution
      const canvas = document.createElement('canvas');
      canvas.width = photo.width!;
      canvas.height = photo.height!;
      const ctx = canvas.getContext('2d')!;

      // Draw base image
      ctx.drawImage(img, 0, 0);

      // Walk shapes and draw them
      for (const shape of undoStack.shapes) {
        drawShapeOnCanvas(ctx, shape);
      }

      // Export PNG blob
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('Canvas toBlob failed'))),
          'image/png',
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
        canUndo={undoStack.canUndo}
        canRedo={undoStack.canRedo}
        onSelectTool={(tool) => dispatch({ type: 'SET_TOOL', tool })}
        onSelectColor={(color) => dispatch({ type: 'SET_COLOR', color })}
        onSelectStrokeWidth={(key) => dispatch({ type: 'SET_STROKE_WIDTH', key })}
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
          preserveAspectRatio="xMinYMin meet"
        >
          {/* SVG arrowhead marker */}
          <defs>
            <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="context-stroke" />
            </marker>
          </defs>

          {/* Committed shapes */}
          {undoStack.shapes.map((shape) => {
            const { tagName, attributes } = renderShapeSvgProps(shape, false);
            const Tag = tagName as any;
            return <Tag key={shape.id} {...(attributes as Record<string, unknown>)} />;
          })}

          {/* Draft shape */}
          {state.draftShape &&
            (() => {
              const { tagName, attributes } = renderShapeSvgProps(state.draftShape, true);
              const Tag = tagName as any;
              return <Tag {...(attributes as Record<string, unknown>)} />;
            })()}

          {/* Selection overlay */}
          {selectedShape && (
            <>
              {(selectedShape.type === 'rectangle' || selectedShape.type === 'highlight') && (
                <>
                  <rect
                    x={selectedShape.x}
                    y={selectedShape.y}
                    width={selectedShape.w}
                    height={selectedShape.h}
                    stroke="var(--color-primary)"
                    strokeWidth="1"
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
                      <rect
                        key={pos}
                        x={cx - 4}
                        y={cy - 4}
                        width={8}
                        height={8}
                        fill="var(--color-bg-primary)"
                        stroke="var(--color-primary)"
                        strokeWidth="1.5"
                        style={{ cursor: cursors[pos] }}
                      />
                    );
                  })}
                </>
              )}

              {(selectedShape.type === 'arrow' || selectedShape.type === 'line') && (
                <>
                  <line
                    x1={selectedShape.x1}
                    y1={selectedShape.y1}
                    x2={selectedShape.x2}
                    y2={selectedShape.y2}
                    stroke="var(--color-primary)"
                    strokeWidth="1"
                    strokeDasharray="4 2"
                    pointerEvents="none"
                  />
                  {/* Start and end handles */}
                  {[
                    { pos: 'start', x: selectedShape.x1, y: selectedShape.y1 },
                    { pos: 'end', x: selectedShape.x2, y: selectedShape.y2 },
                  ].map(({ pos, x, y }) => (
                    <rect
                      key={pos}
                      x={x - 4}
                      y={y - 4}
                      width={8}
                      height={8}
                      fill="var(--color-bg-primary)"
                      stroke="var(--color-primary)"
                      strokeWidth="1.5"
                      style={{ cursor: 'move' }}
                    />
                  ))}
                </>
              )}

              {selectedShape.type === 'ellipse' && (
                <>
                  <ellipse
                    cx={selectedShape.cx}
                    cy={selectedShape.cy}
                    rx={selectedShape.rx}
                    ry={selectedShape.ry}
                    stroke="var(--color-primary)"
                    strokeWidth="1"
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
                    <rect
                      key={pos}
                      x={x - 4}
                      y={y - 4}
                      width={8}
                      height={8}
                      fill="var(--color-bg-primary)"
                      stroke="var(--color-primary)"
                      strokeWidth="1.5"
                      style={{
                        cursor: pos === 'north' || pos === 'south' ? 'ns-resize' : 'ew-resize',
                      }}
                    />
                  ))}
                </>
              )}
            </>
          )}
        </svg>
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
    </section>
  );
}
