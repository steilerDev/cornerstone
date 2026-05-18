import type { AnnotationShape } from './useUndoStack.js';

/**
 * Renders a shape as SVG attributes object.
 * Returns the SVG element type and all required attributes.
 */
export function renderShapeSvgProps(
  shape: AnnotationShape,
  isDraft: boolean,
): {
  tagName: 'rect' | 'line' | 'ellipse';
  attributes: Record<string, string | number>;
} {
  if (shape.type === 'rectangle') {
    const baseAttrs: Record<string, string | number> = {
      x: shape.x,
      y: shape.y,
      width: shape.w,
      height: shape.h,
    };
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
    const baseAttrs: Record<string, string | number> = {
      x: shape.x,
      y: shape.y,
      width: shape.w,
      height: shape.h,
    };
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
  } else if (shape.type === 'arrow') {
    return {
      tagName: 'line',
      attributes: {
        x1: shape.x1,
        y1: shape.y1,
        x2: shape.x2,
        y2: shape.y2,
        stroke: shape.stroke,
        'stroke-width': shape.strokeWidth,
        'stroke-linecap': 'round',
        'stroke-dasharray': isDraft ? '6 4' : 'none',
        'marker-end': isDraft ? 'none' : 'url(#arrowhead)',
        opacity: isDraft ? 0.8 : 1,
        'pointer-events': isDraft ? 'none' : 'stroke',
      },
    };
  } else if (shape.type === 'line') {
    return {
      tagName: 'line',
      attributes: {
        x1: shape.x1,
        y1: shape.y1,
        x2: shape.x2,
        y2: shape.y2,
        stroke: shape.stroke,
        'stroke-width': shape.strokeWidth,
        'stroke-linecap': 'round',
        'stroke-dasharray': isDraft ? '6 4' : 'none',
        opacity: isDraft ? 0.8 : 1,
        'pointer-events': isDraft ? 'none' : 'stroke',
      },
    };
  } else if (shape.type === 'ellipse') {
    return {
      tagName: 'ellipse',
      attributes: {
        cx: shape.cx,
        cy: shape.cy,
        rx: shape.rx,
        ry: shape.ry,
        stroke: shape.stroke,
        'stroke-width': shape.strokeWidth,
        'stroke-dasharray': isDraft ? '6 4' : 'none',
        fill: 'none',
        opacity: isDraft ? 0.8 : 1,
        'pointer-events': isDraft ? 'none' : 'stroke',
      },
    };
  }

  // Fallback for unknown shape type
  return {
    tagName: 'rect',
    attributes: {},
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
  } else if (shape.type === 'arrow') {
    ctx.strokeStyle = shape.stroke;
    ctx.lineWidth = shape.strokeWidth;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(shape.x1, shape.y1);
    ctx.lineTo(shape.x2, shape.y2);
    ctx.stroke();

    // Draw arrowhead
    const headlen = shape.strokeWidth * 3;
    const angle = Math.atan2(shape.y2 - shape.y1, shape.x2 - shape.x1);

    ctx.fillStyle = shape.stroke;
    ctx.beginPath();
    ctx.moveTo(shape.x2, shape.y2);
    ctx.lineTo(
      shape.x2 - headlen * Math.cos(angle - Math.PI / 6),
      shape.y2 - headlen * Math.sin(angle - Math.PI / 6),
    );
    ctx.lineTo(
      shape.x2 - headlen * Math.cos(angle + Math.PI / 6),
      shape.y2 - headlen * Math.sin(angle + Math.PI / 6),
    );
    ctx.closePath();
    ctx.fill();
  } else if (shape.type === 'line') {
    ctx.strokeStyle = shape.stroke;
    ctx.lineWidth = shape.strokeWidth;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(shape.x1, shape.y1);
    ctx.lineTo(shape.x2, shape.y2);
    ctx.stroke();
  } else if (shape.type === 'ellipse') {
    ctx.strokeStyle = shape.stroke;
    ctx.lineWidth = shape.strokeWidth;
    ctx.beginPath();
    ctx.ellipse(shape.cx, shape.cy, shape.rx, shape.ry, 0, 0, 2 * Math.PI);
    ctx.stroke();
  }
}
