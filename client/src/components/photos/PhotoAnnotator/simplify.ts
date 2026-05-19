/**
 * Ramer-Douglas-Peucker polyline simplification.
 * Reduces the number of points in a polyline while preserving its shape.
 *
 * @param points  Input polyline as [x, y] pairs. Must have at least 2 points.
 * @param epsilon Maximum allowed distance (in same units as points) from a
 *                simplified segment to the original point. Larger = more
 *                aggressive simplification.
 * @returns       Simplified polyline as [x, y] pairs.
 *
 * Edge cases:
 *   - Empty array → []
 *   - Single point → [[x, y]]
 *   - Two points → [[x1, y1], [x2, y2]] (always kept; no simplification)
 *   - Collinear points → all interior points removed; only endpoints kept
 */
export const RDP_EPSILON = 1.5;

export function simplifyPolyline(
  points: [number, number][],
  epsilon: number = RDP_EPSILON,
): [number, number][] {
  if (points.length <= 2) return points.slice() as [number, number][];
  return rdp(points, epsilon);
}

function rdp(points: [number, number][], epsilon: number): [number, number][] {
  if (points.length <= 2) return points.slice() as [number, number][];

  // Find the point with maximum perpendicular distance from the line
  // connecting the first and last point
  const [x1, y1] = points[0]!;
  const [x2, y2] = points[points.length - 1]!;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lineLen = Math.sqrt(dx * dx + dy * dy);

  let maxDist = 0;
  let maxIdx = 0;

  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i]!;
    let dist: number;
    if (lineLen === 0) {
      // Start and end are the same point — measure Euclidean distance
      dist = Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
    } else {
      // Perpendicular distance from point to line segment (infinite line approximation)
      dist = Math.abs(dy * px - dx * py + x2 * y1 - y2 * x1) / lineLen;
    }
    if (dist > maxDist) {
      maxDist = dist;
      maxIdx = i;
    }
  }

  if (maxDist > epsilon) {
    // Recursively simplify both halves
    const left = rdp(points.slice(0, maxIdx + 1), epsilon);
    const right = rdp(points.slice(maxIdx), epsilon);
    // Concatenate, removing the duplicate point at the junction
    return [...left.slice(0, -1), ...right] as [number, number][];
  } else {
    // All interior points are within epsilon — keep only endpoints
    return [points[0]!, points[points.length - 1]!];
  }
}
