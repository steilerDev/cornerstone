/**
 * Converts screen-space (viewport) coordinates to image-space coordinates using SVG's native CTM.
 * This approach avoids staleness issues from tracking SVG position in state — the SVG's CTM
 * reflects the current layout and `preserveAspectRatio` meet-fit transform in real time.
 * @param clientX X coordinate in viewport
 * @param clientY Y coordinate in viewport
 * @param svg The SVG element
 */
export function screenToImage(
  clientX: number,
  clientY: number,
  svg: SVGSVGElement,
): { x: number; y: number } {
  // Graceful fallback for test environments where getScreenCTM is not available
  if (!svg || !svg.getScreenCTM) {
    return { x: clientX, y: clientY };
  }
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const point = svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  const local = point.matrixTransform(ctm.inverse());
  return { x: local.x, y: local.y };
}

/**
 * Converts image-space coordinates to screen-space (viewport) coordinates using SVG's native CTM.
 * Inverse of screenToImage.
 */
export function imageToScreen(
  imageX: number,
  imageY: number,
  svg: SVGSVGElement,
): { x: number; y: number } {
  // Graceful fallback for test environments where getScreenCTM is not available
  if (!svg || !svg.getScreenCTM) {
    return { x: imageX, y: imageY };
  }
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const point = svg.createSVGPoint();
  point.x = imageX;
  point.y = imageY;
  const screen = point.matrixTransform(ctm);
  return { x: screen.x, y: screen.y };
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
  | 'west'
  | 'tail';

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

/**
 * Hit-test a text shape. Uses an approximate bounding box:
 * width is estimated as fontSize * 0.6 * charCount, height is fontSize * 1.2.
 * For selection hit-testing we accept this approximation — the selection overlay
 * uses the DOM-measured bbox when available (see PhotoAnnotator.tsx textBBoxMap).
 */
export function hitTestText(
  px: number,
  py: number,
  shape: { x: number; y: number; text: string; fontSize: number },
  tolerance: number,
): boolean {
  const approxWidth = shape.text.length * shape.fontSize * 0.6;
  const approxHeight = shape.fontSize * 1.2;

  return (
    px >= shape.x - tolerance &&
    px <= shape.x + approxWidth + tolerance &&
    py >= shape.y - tolerance &&
    py <= shape.y + approxHeight + tolerance
  );
}

/**
 * Hit-test the box area of a callout (filled rectangle).
 */
export function hitTestCallout(
  px: number,
  py: number,
  shape: { x: number; y: number; w: number; h: number },
): boolean {
  return px >= shape.x && px <= shape.x + shape.w && py >= shape.y && py <= shape.y + shape.h;
}

/**
 * Hit-test the tail anchor circle of a callout.
 * Returns true if the point is within handleSize/2 of (tailX, tailY).
 */
export function hitTestTailHandle(
  px: number,
  py: number,
  tailX: number,
  tailY: number,
  handleSize: number,
): boolean {
  return distance(px, py, tailX, tailY) <= handleSize / 2;
}

/**
 * Returns the point on the box perimeter closest to external point (tx, ty).
 * Used to compute where the callout tail meets the box border.
 */
export function nearestBoxEdgePoint(
  box: { x: number; y: number; w: number; h: number },
  tx: number,
  ty: number,
): { x: number; y: number } {
  // Clamp tail coords to box bounds to find the nearest edge
  const clampedTx = clamp(tx, box.x, box.x + box.w);
  const clampedTy = clamp(ty, box.y, box.y + box.h);

  // Find which edge is nearest
  const left = { x: box.x, y: clampedTy };
  const right = { x: box.x + box.w, y: clampedTy };
  const top = { x: clampedTx, y: box.y };
  const bottom = { x: clampedTx, y: box.y + box.h };

  // Return the edge point with minimum distance to (tx, ty)
  const candidates = [left, right, top, bottom];
  let nearest = candidates[0]!;
  let minDist = distance(tx, ty, nearest.x, nearest.y);

  for (let i = 1; i < candidates.length; i++) {
    const candidate = candidates[i]!;
    const dist = distance(tx, ty, candidate.x, candidate.y);
    if (dist < minDist) {
      minDist = dist;
      nearest = candidate;
    }
  }

  return nearest;
}

/**
 * Translate a text shape's anchor by dx, dy (clamped to image bounds).
 * Text has no w/h so clamping uses fontSize as a proxy for height.
 */
export function translateText(
  shape: { x: number; y: number; fontSize: number },
  dx: number,
  dy: number,
  imageWidth: number,
  imageHeight: number,
): { x: number; y: number } {
  return {
    x: clamp(shape.x + dx, 0, imageWidth),
    y: clamp(shape.y + dy, 0, imageHeight - shape.fontSize),
  };
}

/**
 * Translate a callout's box position (x, y), keeping w/h and tail fixed.
 */
export function translateCallout(
  shape: { x: number; y: number; w: number; h: number },
  dx: number,
  dy: number,
  imageWidth: number,
  imageHeight: number,
): { x: number; y: number } {
  return {
    x: clamp(shape.x + dx, 0, imageWidth - shape.w),
    y: clamp(shape.y + dy, 0, imageHeight - shape.h),
  };
}

/**
 * Translate the callout tail anchor to a new absolute position (clamped to image bounds).
 */
export function translateTailAnchor(
  newTailX: number,
  newTailY: number,
  imageWidth: number,
  imageHeight: number,
): { tailX: number; tailY: number } {
  return {
    tailX: clamp(newTailX, 0, imageWidth),
    tailY: clamp(newTailY, 0, imageHeight),
  };
}

/**
 * Hit-test a polyline (freehand stroke) for pointer proximity.
 * Tests each segment of the polyline against the given tolerance.
 * Returns 'body' if any segment is hit, null otherwise.
 */
export function hitTestPolyline(
  px: number,
  py: number,
  points: [number, number][],
  tolerance: number,
): 'body' | null {
  for (let i = 0; i < points.length - 1; i++) {
    const [x1, y1] = points[i]!;
    const [x2, y2] = points[i + 1]!;
    if (hitTestLine(px, py, x1, y1, x2, y2, tolerance) !== null) {
      return 'body';
    }
  }
  return null;
}

/**
 * Hit-test whether a point is within the bounding box of a measurement label.
 * The label is positioned at the midpoint of the line, with a generous tolerance.
 * Returns 'label' if the point is near the label text, null otherwise.
 */
export function hitTestMeasurementLabel(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  fontSize: number,
  tolerance: number = 16,
): 'label' | null {
  // Midpoint of the line
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;

  // Estimate label bounds: roughly 4 character widths at fontSize
  // fontSize is in pixels at native resolution; use it as a dimension guide
  const labelWidth = Math.max(fontSize * 3, 20); // Min 20px wide
  const labelHeight = fontSize;

  const labelLeft = midX - labelWidth / 2;
  const labelRight = midX + labelWidth / 2;
  const labelTop = midY - labelHeight / 2;
  const labelBottom = midY + labelHeight / 2;

  // Check if point is within the label bounds with tolerance
  if (
    px >= labelLeft - tolerance &&
    px <= labelRight + tolerance &&
    py >= labelTop - tolerance &&
    py <= labelBottom + tolerance
  ) {
    return 'label';
  }

  return null;
}

/**
 * Translate a measurement shape (two endpoints) by dx, dy, clamped to image bounds.
 * Delegates to translateArrowLine since measurement shares the same geometry.
 */
export function translateMeasurement(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  dx: number,
  dy: number,
  imageWidth: number,
  imageHeight: number,
): { x1: number; y1: number; x2: number; y2: number } {
  return translateArrowLine(x1, y1, x2, y2, dx, dy, imageWidth, imageHeight);
}

/**
 * Translate a freehand shape's points by dx, dy (clamped to image bounds).
 */
export function translateFreehand(
  points: [number, number][],
  dx: number,
  dy: number,
  imageWidth: number,
  imageHeight: number,
): [number, number][] {
  return points.map(([x, y]) => [clamp(x + dx, 0, imageWidth), clamp(y + dy, 0, imageHeight)]) as [
    number,
    number,
  ][];
}
