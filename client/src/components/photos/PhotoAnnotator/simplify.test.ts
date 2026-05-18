/**
 * Unit tests for simplify.ts — Ramer-Douglas-Peucker polyline simplification.
 *
 * Story #1477: Photo Annotator — Measurement and Freehand Tools
 *
 * Pure function tests — no mocking needed.
 */

import { describe, it, expect } from '@jest/globals';
import { simplifyPolyline, RDP_EPSILON } from './simplify.js';

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('simplifyPolyline() — edge cases', () => {
  it('returns empty array for empty input', () => {
    const result = simplifyPolyline([]);
    expect(result).toEqual([]);
  });

  it('returns single point unchanged for single-point input', () => {
    const result = simplifyPolyline([[10, 20]]);
    expect(result).toEqual([[10, 20]]);
  });

  it('returns both points unchanged for two-point input', () => {
    const result = simplifyPolyline([[0, 0], [100, 100]]);
    expect(result).toEqual([[0, 0], [100, 100]]);
  });

  it('does not mutate the input array', () => {
    const input: [number, number][] = [[0, 0], [50, 0], [100, 0]];
    const inputCopy = input.map((p) => [...p] as [number, number]);
    simplifyPolyline(input);
    expect(input).toEqual(inputCopy);
  });

  it('returns a copy (not the same reference for single point)', () => {
    const input: [number, number][] = [[5, 10]];
    const result = simplifyPolyline(input);
    expect(result).not.toBe(input);
  });

  it('returns a copy (not the same reference for two points)', () => {
    const input: [number, number][] = [[0, 0], [10, 10]];
    const result = simplifyPolyline(input);
    expect(result).not.toBe(input);
  });
});

// ─── Collinear points ─────────────────────────────────────────────────────────

describe('simplifyPolyline() — collinear sequences', () => {
  it('reduces 5 collinear horizontal points to just the two endpoints', () => {
    // Points along y=0: [0,0], [25,0], [50,0], [75,0], [100,0]
    // All interior points have zero perpendicular distance → all removed
    const input: [number, number][] = [
      [0, 0], [25, 0], [50, 0], [75, 0], [100, 0],
    ];
    const result = simplifyPolyline(input);
    expect(result).toEqual([[0, 0], [100, 0]]);
  });

  it('reduces 6 collinear diagonal points to just the two endpoints', () => {
    // Points along y=x line
    const input: [number, number][] = [
      [0, 0], [20, 20], [40, 40], [60, 60], [80, 80], [100, 100],
    ];
    const result = simplifyPolyline(input);
    expect(result).toEqual([[0, 0], [100, 100]]);
  });

  it('reduces 10 collinear vertical points to two endpoints', () => {
    const input: [number, number][] = Array.from({ length: 10 }, (_, i) => [0, i * 10] as [number, number]);
    const result = simplifyPolyline(input);
    expect(result).toEqual([[0, 0], [0, 90]]);
  });

  it('always keeps the first and last point in the result', () => {
    const input: [number, number][] = [[5, 5], [15, 5], [25, 5], [35, 5]];
    const result = simplifyPolyline(input);
    expect(result[0]).toEqual([5, 5]);
    expect(result[result.length - 1]).toEqual([35, 5]);
  });
});

// ─── Curved inputs — simplification ratio ─────────────────────────────────────

describe('simplifyPolyline() — curved/jittered input', () => {
  it('reduces 50 jittered sine-wave points by at least 50% with default epsilon', () => {
    // Generate 50 points along a sine wave with jitter
    const N = 50;
    const points: [number, number][] = Array.from({ length: N }, (_, i) => {
      const x = (i / (N - 1)) * 400;
      const y = 100 + Math.sin((i / (N - 1)) * Math.PI * 4) * 50;
      // Add ±0.5px jitter within epsilon range of the curve
      const jitterX = (Math.sin(i * 7.3) * 0.4);
      const jitterY = (Math.cos(i * 5.7) * 0.4);
      return [x + jitterX, y + jitterY] as [number, number];
    });

    const result = simplifyPolyline(points, RDP_EPSILON);

    // Should retain significantly fewer points than the input
    expect(result.length).toBeLessThan(N * 0.5);
    // Must keep at least 2 points (endpoints guaranteed)
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  it('simplification with larger epsilon produces fewer points than smaller epsilon', () => {
    const N = 40;
    const points: [number, number][] = Array.from({ length: N }, (_, i) => {
      const x = i * 5;
      const y = 50 + Math.sin(i * 0.5) * 30;
      return [x, y] as [number, number];
    });

    const resultSmall = simplifyPolyline(points, 0.5);
    const resultLarge = simplifyPolyline(points, 5.0);

    // Larger epsilon = more aggressive = fewer points
    expect(resultLarge.length).toBeLessThanOrEqual(resultSmall.length);
  });

  it('preserves inflection points for a zigzag path with large amplitude', () => {
    // Zigzag: each peak/valley is 20px away from the baseline — should NOT be simplified away
    const points: [number, number][] = [
      [0, 0], [10, 20], [20, 0], [30, 20], [40, 0],
    ];
    const result = simplifyPolyline(points, RDP_EPSILON);
    // The peaks at (10,20) and (30,20) deviate 20px from the line (0,0)-(40,0)
    // 20 >> epsilon=1.5 so they should be retained
    expect(result.length).toBeGreaterThan(2);
    // Must still contain the start and end
    expect(result[0]).toEqual([0, 0]);
    expect(result[result.length - 1]).toEqual([40, 0]);
  });
});

// ─── Epsilon variants ─────────────────────────────────────────────────────────

describe('simplifyPolyline() — epsilon variants', () => {
  it('epsilon=0 returns all points unchanged (every point is "significant")', () => {
    // With epsilon=0, no interior point is within threshold — all kept
    const input: [number, number][] = [
      [0, 0], [10, 0.1], [20, 0], [30, 0.1], [40, 0],
    ];
    const result = simplifyPolyline(input, 0);
    // epsilon=0: any deviation > 0 triggers split, so all points are preserved
    expect(result.length).toBe(input.length);
  });

  it('very large epsilon collapses all points to just the two endpoints', () => {
    const input: [number, number][] = [
      [0, 0], [10, 50], [20, -30], [30, 40], [40, 0],
    ];
    // Epsilon of 1000 means everything is within tolerance → endpoints only
    const result = simplifyPolyline(input, 1000);
    expect(result).toEqual([[0, 0], [40, 0]]);
  });

  it('RDP_EPSILON constant is 1.5', () => {
    expect(RDP_EPSILON).toBe(1.5);
  });

  it('uses RDP_EPSILON as default when no epsilon argument supplied', () => {
    const collinear: [number, number][] = [
      [0, 0], [50, 0], [100, 0],
    ];
    // Collinear → simplifies to 2 points with any epsilon > 0
    const resultDefault = simplifyPolyline(collinear);
    const resultExplicit = simplifyPolyline(collinear, RDP_EPSILON);
    expect(resultDefault).toEqual(resultExplicit);
  });
});

// ─── Result integrity ─────────────────────────────────────────────────────────

describe('simplifyPolyline() — result integrity', () => {
  it('result points are a subset of the input points (no new points added)', () => {
    const input: [number, number][] = [
      [0, 0], [10, 5], [20, 0], [30, -5], [40, 0], [50, 5], [60, 0],
    ];
    const result = simplifyPolyline(input, RDP_EPSILON);
    for (const pt of result) {
      const found = input.some(([x, y]) => x === pt[0] && y === pt[1]);
      expect(found).toBe(true);
    }
  });

  it('result order is preserved (same left-to-right sequence as input)', () => {
    const input: [number, number][] = [
      [0, 0], [20, 10], [40, 0], [60, -10], [80, 0], [100, 5],
    ];
    const result = simplifyPolyline(input, 0.5);
    // Each result x should be >= the previous
    for (let i = 1; i < result.length; i++) {
      expect(result[i]![0]).toBeGreaterThanOrEqual(result[i - 1]![0]);
    }
  });

  it('result length is always <= input length', () => {
    const input: [number, number][] = Array.from({ length: 20 }, (_, i) => [i * 5, Math.random() * 10] as [number, number]);
    const result = simplifyPolyline(input, RDP_EPSILON);
    expect(result.length).toBeLessThanOrEqual(input.length);
  });

  it('result length is always >= 1 for non-empty input', () => {
    const input: [number, number][] = [[42, 17]];
    const result = simplifyPolyline(input);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('handles degenerate case where all points are at the same location', () => {
    // All points at (50, 50) — line length is 0, Euclidean fallback
    const input: [number, number][] = [
      [50, 50], [50, 50], [50, 50], [50, 50], [50, 50],
    ];
    // With epsilon=1.5: all points have dist=0 from "start" == "end" → interior points within epsilon
    const result = simplifyPolyline(input, RDP_EPSILON);
    // Should return just endpoints (both [50,50])
    expect(result).toEqual([[50, 50], [50, 50]]);
  });
});
