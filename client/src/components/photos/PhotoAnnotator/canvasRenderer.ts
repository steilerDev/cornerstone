import type { AnnotationShape, TextShape } from './useUndoStack.js';

/** Canonical UI sans-serif font family for all text annotations.
 *  Must be kept in sync between SVG rendering and canvas 2D rendering. */
export const ANNOTATION_FONT_FAMILY = 'system-ui, -apple-system, sans-serif';

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
    // Draw line from start to arrowhead base
    const dx = shape.x2 - shape.x1;
    const dy = shape.y2 - shape.y1;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const unitX = dx / len;
    const unitY = dy / len;

    const tipLen = 8 * shape.strokeWidth;
    const tipHalfWidth = 4 * shape.strokeWidth;

    const baseX = shape.x2 - unitX * tipLen;
    const baseY = shape.y2 - unitY * tipLen;

    ctx.strokeStyle = shape.stroke;
    ctx.lineWidth = shape.strokeWidth;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(shape.x1, shape.y1);
    ctx.lineTo(baseX, baseY);
    ctx.stroke();

    // Draw arrowhead triangle
    const perpX = -unitY;
    const perpY = unitX;

    const pt1x = baseX + perpX * tipHalfWidth;
    const pt1y = baseY + perpY * tipHalfWidth;
    const pt3x = baseX - perpX * tipHalfWidth;
    const pt3y = baseY - perpY * tipHalfWidth;

    ctx.fillStyle = shape.stroke;
    ctx.beginPath();
    ctx.moveTo(pt1x, pt1y);
    ctx.lineTo(shape.x2, shape.y2);
    ctx.lineTo(pt3x, pt3y);
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
  } else if (shape.type === 'text') {
    const textShape = shape as TextShape;
    ctx.fillStyle = textShape.color;
    ctx.font = `${textShape.fontSize}px ${ANNOTATION_FONT_FAMILY}`;
    ctx.fillText(textShape.text, textShape.x, textShape.y + textShape.fontSize); // baseline offset
  } else if (shape.type === 'measurement') {
    const dx = shape.x2 - shape.x1;
    const dy = shape.y2 - shape.y1;
    const len = Math.hypot(dx, dy) || 1;
    const unitX = dx / len;
    const unitY = dy / len;
    const nx = -dy / len;
    const ny = dx / len;

    const tipLen = 8 * shape.strokeWidth;
    const tipHalfWidth = 4 * shape.strokeWidth;

    ctx.strokeStyle = shape.stroke;
    ctx.fillStyle = shape.stroke;
    ctx.lineWidth = shape.strokeWidth;
    ctx.lineCap = 'round';

    // Main line
    ctx.beginPath();
    ctx.moveTo(shape.x1, shape.y1);
    ctx.lineTo(shape.x2, shape.y2);
    ctx.stroke();

    // Arrowhead at start
    const startBaseX = shape.x1 + unitX * tipLen;
    const startBaseY = shape.y1 + unitY * tipLen;
    const startPerpX = -unitY;
    const startPerpY = unitX;

    const startPt1x = startBaseX + startPerpX * tipHalfWidth;
    const startPt1y = startBaseY + startPerpY * tipHalfWidth;
    const startPt3x = startBaseX - startPerpX * tipHalfWidth;
    const startPt3y = startBaseY - startPerpY * tipHalfWidth;

    ctx.beginPath();
    ctx.moveTo(startPt1x, startPt1y);
    ctx.lineTo(shape.x1, shape.y1);
    ctx.lineTo(startPt3x, startPt3y);
    ctx.closePath();
    ctx.fill();

    // Arrowhead at end
    const endBaseX = shape.x2 - unitX * tipLen;
    const endBaseY = shape.y2 - unitY * tipLen;

    const endPt1x = endBaseX + startPerpX * tipHalfWidth;
    const endPt1y = endBaseY + startPerpY * tipHalfWidth;
    const endPt3x = endBaseX - startPerpX * tipHalfWidth;
    const endPt3y = endBaseY - startPerpY * tipHalfWidth;

    ctx.beginPath();
    ctx.moveTo(endPt1x, endPt1y);
    ctx.lineTo(shape.x2, shape.y2);
    ctx.lineTo(endPt3x, endPt3y);
    ctx.closePath();
    ctx.fill();

    // Label
    if (shape.label) {
      const midX = (shape.x1 + shape.x2) / 2;
      const midY = (shape.y1 + shape.y2) / 2;
      const offset = shape.fontSize * 1.2;
      const labelOffsetX = nx * offset;
      const labelOffsetY = ny * offset;
      ctx.fillStyle = shape.color;
      ctx.font = `${shape.fontSize}px ${ANNOTATION_FONT_FAMILY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(shape.label, midX + labelOffsetX, midY + labelOffsetY);
      ctx.textAlign = 'start'; // reset to default
      ctx.textBaseline = 'alphabetic';
    }
  } else if (shape.type === 'freehand') {
    if (shape.points.length < 2) return;
    ctx.strokeStyle = shape.stroke;
    ctx.lineWidth = shape.strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    const [fx, fy] = shape.points[0]!;
    ctx.moveTo(fx, fy);
    for (let i = 1; i < shape.points.length; i++) {
      const [px, py] = shape.points[i]!;
      ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
}
