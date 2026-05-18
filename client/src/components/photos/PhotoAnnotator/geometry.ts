/**
 * Converts screen-space point to image-space coordinates.
 * @param screenX X coordinate relative to SVG element's bounding rect
 * @param screenY Y coordinate relative to SVG element's bounding rect
 * @param svgRect The SVG element's bounding rect (from getBoundingClientRect)
 * @param imageWidth Native image width in pixels
 * @param imageHeight Native image height in pixels
 */
export function screenToImage(
  screenX: number,
  screenY: number,
  svgRect: DOMRect,
  imageWidth: number,
  imageHeight: number,
): { x: number; y: number } {
  const imageX = ((screenX - svgRect.left) / svgRect.width) * imageWidth;
  const imageY = ((screenY - svgRect.top) / svgRect.height) * imageHeight;
  return { x: imageX, y: imageY };
}

/**
 * Converts image-space coordinates to screen-space. Inverse of screenToImage.
 */
export function imageToScreen(
  imageX: number,
  imageY: number,
  svgRect: DOMRect,
  imageWidth: number,
  imageHeight: number,
): { x: number; y: number } {
  const screenX = (imageX / imageWidth) * svgRect.width + svgRect.left;
  const screenY = (imageY / imageHeight) * svgRect.height + svgRect.top;
  return { x: screenX, y: screenY };
}

/**
 * Euclidean distance between two points.
 */
export function distance(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Clamp a value to [min, max].
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Returns the normalized bounding rect of a rectangle defined by two corner points.
 * Handles the case where end is to the top-left of start.
 */
export function normalizeRect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): { x: number; y: number; w: number; h: number } {
  const x = Math.min(x1, x2);
  const y = Math.min(y1, y2);
  const w = Math.abs(x2 - x1);
  const h = Math.abs(y2 - y1);
  return { x, y, w, h };
}

/**
 * Hit-test whether a point is within tolerance of a rectangle's stroke.
 * Returns 'body' if inside the shape fill area, 'stroke' if near the stroke, null otherwise.
 */
export function hitTestRectangle(
  px: number,
  py: number,
  shape: { x: number; y: number; w: number; h: number },
  strokeWidth: number,
  tolerance: number,
): 'body' | 'stroke' | null {
  const { x, y, w, h } = shape;

  // Check if inside the rect bounds
  if (px >= x && px <= x + w && py >= y && py <= y + h) {
    // Check if within stroke width of the border
    const distLeft = px - x;
    const distRight = x + w - px;
    const distTop = py - y;
    const distBottom = y + h - py;

    const minDistToEdge = Math.min(distLeft, distRight, distTop, distBottom);

    if (minDistToEdge <= strokeWidth / 2 + tolerance) {
      return 'stroke';
    }
    return 'body';
  }

  return null;
}

/**
 * Hit-test whether a point is inside a highlight (filled rectangle).
 */
export function hitTestHighlight(
  px: number,
  py: number,
  shape: { x: number; y: number; w: number; h: number },
): boolean {
  const { x, y, w, h } = shape;
  return px >= x && px <= x + w && py >= y && py <= y + h;
}

/**
 * Returns one of 8 resize handle positions for a bounding box,
 * or null if the point is not on any handle.
 */
export type HandlePosition =
  | 'nw'
  | 'n'
  | 'ne'
  | 'w'
  | 'e'
  | 'sw'
  | 's'
  | 'se'
  | 'start'
  | 'end'
  | 'north'
  | 'south'
  | 'east'
  | 'west';

export function hitTestHandles(
  px: number,
  py: number,
  shape: { x: number; y: number; w: number; h: number },
  handleSize: number,
): HandlePosition | null {
  const { x, y, w, h } = shape;

  const handles: Array<[HandlePosition, number, number]> = [
    ['nw', x, y],
    ['n', x + w / 2, y],
    ['ne', x + w, y],
    ['w', x, y + h / 2],
    ['e', x + w, y + h / 2],
    ['sw', x, y + h],
    ['s', x + w / 2, y + h],
    ['se', x + w, y + h],
  ];

  for (const [pos, hx, hy] of handles) {
    const dist = distance(px, py, hx, hy);
    if (dist <= handleSize / 2) {
      return pos;
    }
  }

  return null;
}

/**
 * Translate a shape's bounding box by dx, dy (clamped to image bounds).
 */
export function translateShape(
  shape: { x: number; y: number; w: number; h: number },
  dx: number,
  dy: number,
  imageWidth: number,
  imageHeight: number,
): { x: number; y: number; w: number; h: number } {
  let newX = shape.x + dx;
  let newY = shape.y + dy;

  // Clamp to image bounds
  newX = clamp(newX, 0, imageWidth - shape.w);
  newY = clamp(newY, 0, imageHeight - shape.h);

  return {
    x: newX,
    y: newY,
    w: shape.w,
    h: shape.h,
  };
}

/**
 * Resize a shape's bounding box by dragging the given handle. Returns new normalized rect.
 */
export function resizeShape(
  shape: { x: number; y: number; w: number; h: number },
  handle: HandlePosition,
  dx: number,
  dy: number,
  imageWidth: number,
  imageHeight: number,
): { x: number; y: number; w: number; h: number } {
  let { x, y, w, h } = shape;

  // Apply delta based on handle
  if (handle.includes('w')) x += dx;
  if (handle.includes('e')) w += dx;
  if (handle.includes('n')) y += dy;
  if (handle.includes('s')) h += dy;

  // Ensure minimum dimensions
  if (w < 2) w = 2;
  if (h < 2) h = 2;

  // Clamp to image bounds
  x = clamp(x, 0, imageWidth - w);
  y = clamp(y, 0, imageHeight - h);

  return { x, y, w, h };
}

/**
 * Hit-test whether a point is near a line segment.
 * Returns 'body' if the point is within tolerance of the line, null otherwise.
 */
export function hitTestLine(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  tolerance: number,
): 'body' | null {
  // Distance from point to line segment
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;

  if (lengthSq === 0) {
    // Start and end are the same point
    return distance(px, py, x1, y1) <= tolerance ? 'body' : null;
  }

  // Project point onto line segment
  let t = ((px - x1) * dx + (py - y1) * dy) / lengthSq;
  t = clamp(t, 0, 1);

  const projX = x1 + t * dx;
  const projY = y1 + t * dy;

  const dist = distance(px, py, projX, projY);
  return dist <= tolerance ? 'body' : null;
}

/**
 * Hit-test the two endpoint handles of a line or arrow.
 */
export function hitTestEndpointHandles(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  handleSize: number,
): 'start' | 'end' | null {
  if (distance(px, py, x1, y1) <= handleSize / 2) {
    return 'start';
  }
  if (distance(px, py, x2, y2) <= handleSize / 2) {
    return 'end';
  }
  return null;
}

/**
 * Hit-test whether a point is on an ellipse's stroke.
 */
export function hitTestEllipse(
  px: number,
  py: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  strokeWidth: number,
  tolerance: number,
): 'body' | null {
  // Parametric distance from point to ellipse perimeter
  const dx = Math.abs(px - cx);
  const dy = Math.abs(py - cy);

  if (rx === 0 || ry === 0) {
    return null;
  }

  // Approximate distance using a simple heuristic:
  // normalize coordinates by radii and measure distance from unit circle
  const tx = dx / rx;
  const ty = dy / ry;
  const r = Math.sqrt(tx * tx + ty * ty);

  // Distance to ellipse perimeter (rough approximation)
  const distToPerimeter = Math.abs(r - 1) * Math.min(rx, ry);

  return distToPerimeter <= strokeWidth / 2 + tolerance ? 'body' : null;
}

/**
 * Hit-test the four cardinal handles (north, south, east, west) of an ellipse.
 */
export function hitTestCardinalHandles(
  px: number,
  py: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  handleSize: number,
): 'north' | 'south' | 'east' | 'west' | null {
  const handles: Array<['north' | 'south' | 'east' | 'west', number, number]> = [
    ['north', cx, cy - ry],
    ['south', cx, cy + ry],
    ['east', cx + rx, cy],
    ['west', cx - rx, cy],
  ];

  for (const [pos, hx, hy] of handles) {
    if (distance(px, py, hx, hy) <= handleSize / 2) {
      return pos;
    }
  }

  return null;
}

/**
 * Translate an arrow or line by dx, dy (for both endpoints, clamped to image bounds).
 */
export function translateArrowLine(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  dx: number,
  dy: number,
  imageWidth: number,
  imageHeight: number,
): { x1: number; y1: number; x2: number; y2: number } {
  const newX1 = clamp(x1 + dx, 0, imageWidth);
  const newY1 = clamp(y1 + dy, 0, imageHeight);
  const newX2 = clamp(x2 + dx, 0, imageWidth);
  const newY2 = clamp(y2 + dy, 0, imageHeight);

  return { x1: newX1, y1: newY1, x2: newX2, y2: newY2 };
}

/**
 * Resize an arrow or line by dragging a given endpoint handle.
 */
export function resizeArrowLine(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  handle: 'start' | 'end',
  dx: number,
  dy: number,
  imageWidth: number,
  imageHeight: number,
): { x1: number; y1: number; x2: number; y2: number } {
  if (handle === 'start') {
    return {
      x1: clamp(x1 + dx, 0, imageWidth),
      y1: clamp(y1 + dy, 0, imageHeight),
      x2,
      y2,
    };
  } else {
    return {
      x1,
      y1,
      x2: clamp(x2 + dx, 0, imageWidth),
      y2: clamp(y2 + dy, 0, imageHeight),
    };
  }
}

/**
 * Translate an ellipse's center by dx, dy (clamped to image bounds).
 */
export function translateEllipse(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  dx: number,
  dy: number,
  imageWidth: number,
  imageHeight: number,
): { cx: number; cy: number; rx: number; ry: number } {
  let newCx = cx + dx;
  let newCy = cy + dy;

  // Clamp center to keep ellipse within bounds
  newCx = clamp(newCx, rx, imageWidth - rx);
  newCy = clamp(newCy, ry, imageHeight - ry);

  return { cx: newCx, cy: newCy, rx, ry };
}

/**
 * Resize an ellipse by dragging a cardinal handle.
 */
export function resizeEllipse(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  handle: 'north' | 'south' | 'east' | 'west',
  dx: number,
  dy: number,
  imageWidth: number,
  imageHeight: number,
): { cx: number; cy: number; rx: number; ry: number } {
  let newRx = rx;
  let newRy = ry;

  if (handle === 'east') {
    newRx = Math.max(1, rx + dx);
  } else if (handle === 'west') {
    newRx = Math.max(1, rx - dx);
  } else if (handle === 'south') {
    newRy = Math.max(1, ry + dy);
  } else if (handle === 'north') {
    newRy = Math.max(1, ry - dy);
  }

  // Clamp center to keep ellipse within bounds
  const clampedCx = clamp(cx, newRx, imageWidth - newRx);
  const clampedCy = clamp(cy, newRy, imageHeight - newRy);

  return { cx: clampedCx, cy: clampedCy, rx: newRx, ry: newRy };
}
