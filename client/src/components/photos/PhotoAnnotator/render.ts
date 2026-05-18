import type { AnnotationShape, TextShape, CalloutShape } from './useUndoStack.js';
import { nearestBoxEdgePoint } from './geometry.js';
import { resolveStrokeWidth } from './annotationConstants.js';

/** Canonical UI sans-serif font family for all text annotations.
 *  Must be kept in sync between SVG rendering and canvas 2D rendering. */
export const ANNOTATION_FONT_FAMILY = 'system-ui, -apple-system, sans-serif';

/**
 * Calculates the effective font size for a callout, shrinking if needed to fit text.
 * Uses a heuristic based on character count vs available area.
 *
 * @param text - The callout text
 * @param fontSize - The user-chosen font size
 * @param availW - Available width inside the box (after padding)
 * @param availH - Available height inside the box (after padding)
 * @returns Effective font size (may be smaller than fontSize, never < 8px)
 */
export function calculateCalloutEffectiveFontSize(
  text: string,
  fontSize: number,
  availW: number,
  availH: number,
): number {
  if (!text || text.length === 0) return fontSize;

  // Heuristic: assume ~0.55 character widths per font size unit (varies by font)
  // and ~1.2 line heights per font size unit.
  const charsPerLine = Math.max(1, Math.floor(availW / (fontSize * 0.55)));
  const linesAvailable = Math.max(1, Math.floor(availH / (fontSize * 1.2)));

  // Estimate how many lines this text will need
  const estimatedLines = Math.ceil(text.length / charsPerLine);

  // If it overflows, scale down proportionally
  const fontScale = estimatedLines > linesAvailable ? linesAvailable / estimatedLines : 1;
  const effectiveFontSize = Math.max(8, fontSize * fontScale); // minimum 8px

  return effectiveFontSize;
}

/**
 * Wraps text into multiple lines given a max width on canvas context.
 * Uses word-break: greedy word wrapping with the canvas context's current font.
 *
 * @param text - The text to wrap
 * @param maxWidth - Maximum width per line
 * @param ctx - Canvas context with font already set
 * @returns Array of line strings
 */
export function wrapTextForCanvas(text: string, maxWidth: number, ctx: CanvasRenderingContext2D): string[] {
  if (!text) return [];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);
    if (metrics.width <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);

  return lines;
}

export type SvgRenderResult =
  | { tagName: 'rect' | 'line' | 'ellipse'; attributes: Record<string, string | number> }
  | { tagName: 'text'; attributes: Record<string, string | number>; children: string }
  | {
      tagName: 'callout';
      boxAttrs: Record<string, string | number>;
      tailAttrs: Record<string, string | number>;
      textAttrs: Record<string, string | number>;
      foreignObjectAttrs: Record<string, string | number>;
      textDivStyle: Record<string, string | number>;
      children: string;
    }
  | {
      tagName: 'measurement';
      lineAttrs: Record<string, string | number>;
      tick1Attrs: Record<string, string | number>;
      tick2Attrs: Record<string, string | number>;
      labelAttrs: Record<string, string | number>;
      children: string;
    }
  | {
      tagName: 'arrow';
      lineAttrs: Record<string, string | number>;
      arrowheadAttrs: Record<string, string | number>;
    }
  | {
      tagName: 'polyline';
      attributes: Record<string, string | number>;
    };

/**
 * Renders a shape as SVG attributes object.
 * Returns the SVG element type and all required attributes.
 */
export function renderShapeSvgProps(shape: AnnotationShape, isDraft: boolean): SvgRenderResult {
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
    // Compute arrowhead base and triangle points
    const dx = shape.x2 - shape.x1;
    const dy = shape.y2 - shape.y1;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const unitX = dx / len;
    const unitY = dy / len;

    // Arrowhead dimensions (proportional to stroke width)
    const tipLen = 8 * shape.strokeWidth; // length of arrowhead along line direction
    const tipHalfWidth = 4 * shape.strokeWidth; // half the perpendicular width

    // Base of arrowhead (where line ends)
    const baseX = shape.x2 - unitX * tipLen;
    const baseY = shape.y2 - unitY * tipLen;

    // Perpendicular unit vector
    const perpX = -unitY;
    const perpY = unitX;

    // Triangle vertices
    const pt1x = baseX + perpX * tipHalfWidth;
    const pt1y = baseY + perpY * tipHalfWidth;
    const pt3x = baseX - perpX * tipHalfWidth;
    const pt3y = baseY - perpY * tipHalfWidth;

    return {
      tagName: 'arrow',
      lineAttrs: {
        x1: shape.x1,
        y1: shape.y1,
        x2: baseX,
        y2: baseY,
        stroke: shape.stroke,
        'stroke-width': shape.strokeWidth,
        'stroke-linecap': 'round',
        'stroke-dasharray': isDraft ? '6 4' : 'none',
        opacity: isDraft ? 0.8 : 1,
        'pointer-events': isDraft ? 'none' : 'stroke',
      },
      arrowheadAttrs: {
        points: `${pt1x},${pt1y} ${shape.x2},${shape.y2} ${pt3x},${pt3y}`,
        fill: shape.stroke,
        stroke: 'none',
        opacity: isDraft ? 0.8 : 1,
        'pointer-events': 'none',
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
  } else if (shape.type === 'text') {
    const textShape = shape as TextShape;
    return {
      tagName: 'text',
      attributes: {
        x: textShape.x,
        y: textShape.y,
        fill: textShape.color,
        'font-size': textShape.fontSize,
        'font-family': ANNOTATION_FONT_FAMILY,
        opacity: isDraft ? 0.8 : 1,
        'pointer-events': isDraft ? 'none' : 'fill',
        'user-select': 'none',
      },
      children: textShape.text,
    };
  } else if (shape.type === 'callout') {
    const calloutShape = shape as CalloutShape;
    const { x: anchorX, y: anchorY } = nearestBoxEdgePoint(
      calloutShape,
      calloutShape.tailX,
      calloutShape.tailY,
    );
    // Use strokeWidth from shape if available, otherwise default to 2 for backward compat
    const strokeWidth = calloutShape.strokeWidth ?? 2;

    // Padding inset from box border (in image-space pixels)
    const inset = 6;
    const availW = Math.max(1, calloutShape.w - 2 * inset);
    const availH = Math.max(1, calloutShape.h - 2 * inset);

    // Calculate effective font size with auto-scaling for overflow
    const effectiveFontSize = calculateCalloutEffectiveFontSize(
      calloutShape.text,
      calloutShape.fontSize,
      availW,
      availH,
    );

    return {
      tagName: 'callout',
      boxAttrs: {
        x: calloutShape.x,
        y: calloutShape.y,
        width: calloutShape.w,
        height: calloutShape.h,
        stroke: calloutShape.stroke,
        'stroke-width': strokeWidth,
        'stroke-dasharray': isDraft ? '6 4' : 'none',
        fill: calloutShape.fill,
        'fill-opacity': 0.15,
        opacity: isDraft ? 0.8 : 1,
        'pointer-events': isDraft ? 'none' : 'fill',
      },
      tailAttrs: {
        x1: anchorX,
        y1: anchorY,
        x2: calloutShape.tailX,
        y2: calloutShape.tailY,
        stroke: calloutShape.stroke,
        'stroke-width': strokeWidth,
        'stroke-linecap': 'round',
        opacity: isDraft ? 0.8 : 1,
        'pointer-events': 'none',
      },
      // Keep textAttrs for backward compat (not used in SVG rendering)
      textAttrs: {
        x: calloutShape.x + inset,
        y: calloutShape.y + effectiveFontSize + inset,
        fill: calloutShape.color,
        'font-size': effectiveFontSize,
        'font-family': ANNOTATION_FONT_FAMILY,
        'pointer-events': 'none',
        'user-select': 'none',
      },
      // foreignObject for text wrapping
      foreignObjectAttrs: {
        x: calloutShape.x + inset,
        y: calloutShape.y + inset,
        width: availW,
        height: availH,
      },
      // Inline styles for the text div inside foreignObject
      textDivStyle: {
        fontFamily: ANNOTATION_FONT_FAMILY,
        fontSize: `${effectiveFontSize}px`,
        color: calloutShape.color,
        lineHeight: 1.2,
        overflow: 'hidden',
        wordWrap: 'break-word',
        whiteSpace: 'pre-wrap',
        margin: 0,
        padding: 0,
      },
      children: calloutShape.text,
    };
  } else if (shape.type === 'measurement') {
    // Compute perpendicular tick mark direction
    const dx = shape.x2 - shape.x1;
    const dy = shape.y2 - shape.y1;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = -dy / len; // unit normal
    const ny = dx / len;
    const TICK = shape.strokeWidth * 4; // tick half-length in image-space pixels

    const midX = (shape.x1 + shape.x2) / 2;
    const midY = (shape.y1 + shape.y2) / 2;
    // Label sits above the midpoint (perpendicular offset = fontSize * 0.6)
    const labelOffsetX = -nx * shape.fontSize * 0.6;
    const labelOffsetY = -ny * shape.fontSize * 0.6;

    return {
      tagName: 'measurement',
      lineAttrs: {
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
      tick1Attrs: {
        x1: shape.x1 + nx * TICK,
        y1: shape.y1 + ny * TICK,
        x2: shape.x1 - nx * TICK,
        y2: shape.y1 - ny * TICK,
        stroke: shape.stroke,
        'stroke-width': shape.strokeWidth,
        'stroke-linecap': 'round',
        opacity: isDraft ? 0.8 : 1,
        'pointer-events': 'none',
      },
      tick2Attrs: {
        x1: shape.x2 + nx * TICK,
        y1: shape.y2 + ny * TICK,
        x2: shape.x2 - nx * TICK,
        y2: shape.y2 - ny * TICK,
        stroke: shape.stroke,
        'stroke-width': shape.strokeWidth,
        'stroke-linecap': 'round',
        opacity: isDraft ? 0.8 : 1,
        'pointer-events': 'none',
      },
      labelAttrs: shape.label
        ? {
            x: midX + labelOffsetX,
            y: midY + labelOffsetY,
            fill: shape.color,
            'font-size': shape.fontSize,
            'font-family': ANNOTATION_FONT_FAMILY,
            'text-anchor': 'middle',
            'dominant-baseline': 'middle',
            opacity: isDraft ? 0.8 : 1,
            'pointer-events': 'none',
            'user-select': 'none',
          }
        : { display: 'none' }, // hidden when label is empty
      children: shape.label,
    };
  } else if (shape.type === 'freehand') {
    const pointsStr = shape.points.map(([x, y]) => `${x},${y}`).join(' ');
    return {
      tagName: 'polyline',
      attributes: {
        points: pointsStr,
        stroke: shape.stroke,
        'stroke-width': shape.strokeWidth,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        fill: 'none',
        'stroke-dasharray': isDraft ? '6 4' : 'none',
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
  } else if (shape.type === 'callout') {
    const calloutShape = shape as CalloutShape;
    // Use strokeWidth from shape if available, otherwise default to 2 for backward compat
    const strokeWidth = calloutShape.strokeWidth ?? 2;
    // 1. Box
    ctx.strokeStyle = calloutShape.stroke;
    ctx.lineWidth = strokeWidth;
    ctx.fillStyle = calloutShape.fill;
    ctx.globalAlpha = 0.15;
    ctx.fillRect(calloutShape.x, calloutShape.y, calloutShape.w, calloutShape.h);
    ctx.globalAlpha = 1;
    ctx.strokeRect(calloutShape.x, calloutShape.y, calloutShape.w, calloutShape.h);

    // 2. Tail
    const { x: ax, y: ay } = nearestBoxEdgePoint(
      calloutShape,
      calloutShape.tailX,
      calloutShape.tailY,
    );
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(calloutShape.tailX, calloutShape.tailY);
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = 'round';
    ctx.stroke();

    // 3. Text with wrapping and auto-scaling
    const inset = 6;
    const availW = Math.max(1, calloutShape.w - 2 * inset);
    const availH = Math.max(1, calloutShape.h - 2 * inset);

    const effectiveFontSize = calculateCalloutEffectiveFontSize(
      calloutShape.text,
      calloutShape.fontSize,
      availW,
      availH,
    );

    ctx.fillStyle = calloutShape.color;
    ctx.font = `${effectiveFontSize}px ${ANNOTATION_FONT_FAMILY}`;
    const lines = wrapTextForCanvas(calloutShape.text, availW, ctx);

    let currentY = calloutShape.y + inset + effectiveFontSize;
    const lineHeightPx = effectiveFontSize * 1.2;

    for (const line of lines) {
      if (currentY + effectiveFontSize > calloutShape.y + calloutShape.h - inset) {
        // Text would overflow vertically; stop rendering
        break;
      }
      ctx.fillText(line, calloutShape.x + inset, currentY);
      currentY += lineHeightPx;
    }
  } else if (shape.type === 'measurement') {
    const dx = shape.x2 - shape.x1;
    const dy = shape.y2 - shape.y1;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const TICK = shape.strokeWidth * 4;

    ctx.strokeStyle = shape.stroke;
    ctx.lineWidth = shape.strokeWidth;
    ctx.lineCap = 'round';

    // Main line
    ctx.beginPath();
    ctx.moveTo(shape.x1, shape.y1);
    ctx.lineTo(shape.x2, shape.y2);
    ctx.stroke();

    // Tick at start
    ctx.beginPath();
    ctx.moveTo(shape.x1 + nx * TICK, shape.y1 + ny * TICK);
    ctx.lineTo(shape.x1 - nx * TICK, shape.y1 - ny * TICK);
    ctx.stroke();

    // Tick at end
    ctx.beginPath();
    ctx.moveTo(shape.x2 + nx * TICK, shape.y2 + ny * TICK);
    ctx.lineTo(shape.x2 - nx * TICK, shape.y2 - ny * TICK);
    ctx.stroke();

    // Label
    if (shape.label) {
      const midX = (shape.x1 + shape.x2) / 2;
      const midY = (shape.y1 + shape.y2) / 2;
      const labelOffsetX = -nx * shape.fontSize * 0.6;
      const labelOffsetY = -ny * shape.fontSize * 0.6;
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
