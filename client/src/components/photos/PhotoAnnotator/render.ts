import type { AnnotationShape } from './useUndoStack.js';

/**
 * Renders a shape as SVG attributes object.
 * Returns the SVG element type and all required attributes.
 */
export function renderShapeSvgProps(
  shape: AnnotationShape,
  isDraft: boolean,
): {
  tagName: 'rect';
  attributes: Record<string, string | number>;
} {
  const baseAttrs: Record<string, string | number> = {
    x: shape.x,
    y: shape.y,
    width: shape.w,
    height: shape.h,
  };

  if (shape.type === 'rectangle') {
    return {
      tagName: 'rect',
      attributes: {
        ...baseAttrs,
        stroke: shape.color,
        'stroke-width': shape.strokeWidth,
        'stroke-dasharray': isDraft ? '6 4' : 'none',
        fill: 'none',
        opacity: isDraft ? 0.8 : 1,
        'pointer-events': isDraft ? 'none' : 'stroke',
      },
    };
  } else if (shape.type === 'highlight') {
    return {
      tagName: 'rect',
      attributes: {
        ...baseAttrs,
        fill: shape.color,
        'fill-opacity': isDraft ? 0.3 : 0.4,
        stroke: 'none',
        opacity: isDraft ? 0.8 : 1,
        'pointer-events': isDraft ? 'none' : 'fill',
      },
    };
  }

  // Fallback for unknown shape type
  return {
    tagName: 'rect',
    attributes: baseAttrs,
  };
}

/**
 * Draws a shape onto a 2D canvas context (for baking).
 * Coordinate system: canvas ctx is already scaled to image dimensions.
 */
export function drawShapeOnCanvas(ctx: CanvasRenderingContext2D, shape: AnnotationShape): void {
  if (shape.type === 'rectangle') {
    ctx.strokeStyle = shape.color;
    ctx.lineWidth = shape.strokeWidth;
    ctx.strokeRect(shape.x, shape.y, shape.w, shape.h);
  } else if (shape.type === 'highlight') {
    ctx.fillStyle = shape.color;
    ctx.globalAlpha = 0.4;
    ctx.fillRect(shape.x, shape.y, shape.w, shape.h);
    ctx.globalAlpha = 1;
  }
}
