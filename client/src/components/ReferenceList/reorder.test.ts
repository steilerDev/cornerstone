import { describe, it, expect } from '@jest/globals';
import { computeDropIndex, moveId, positionOf } from './reorder.js';

describe('moveId', () => {
  const ids = ['a', 'b', 'c', 'd'];

  it('moves an id forward', () => {
    expect(moveId(ids, 'a', 2)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('moves an id backward', () => {
    expect(moveId(ids, 'd', 1)).toEqual(['a', 'd', 'b', 'c']);
  });

  it('clamps a negative target to the first slot', () => {
    expect(moveId(ids, 'c', -5)).toEqual(['c', 'a', 'b', 'd']);
  });

  it('clamps a target past the end to the last slot', () => {
    expect(moveId(ids, 'b', 99)).toEqual(['a', 'c', 'd', 'b']);
  });

  it('returns an equal copy when the id is already at the target', () => {
    const result = moveId(ids, 'b', 1);
    expect(result).toEqual(ids);
    expect(result).not.toBe(ids);
  });

  it('returns an unchanged copy when the id is absent', () => {
    const result = moveId(ids, 'zzz', 0);
    expect(result).toEqual(ids);
    expect(result).not.toBe(ids);
  });

  it('does not mutate the input', () => {
    const input = ['a', 'b'];
    moveId(input, 'b', 0);
    expect(input).toEqual(['a', 'b']);
  });

  it('handles a single-item list', () => {
    expect(moveId(['a'], 'a', 3)).toEqual(['a']);
  });
});

describe('computeDropIndex', () => {
  // Three rows of height 40 at tops 0, 40, 80 (centres 20, 60, 100).
  const rects = [
    { top: 0, height: 40 },
    { top: 40, height: 40 },
    { top: 80, height: 40 },
  ];

  it('is 0 above the first row centre', () => {
    expect(computeDropIndex(-50, rects, 2)).toBe(0);
    expect(computeDropIndex(10, rects, 2)).toBe(0);
  });

  it('counts only rows whose centre lies above the pointer', () => {
    expect(computeDropIndex(61, rects, 2)).toBe(2);
    expect(computeDropIndex(59, rects, 2)).toBe(1);
  });

  it('does not count a centre exactly at the pointer as above', () => {
    expect(computeDropIndex(60, rects, 2)).toBe(1);
  });

  it('is the last slot below the last row', () => {
    expect(computeDropIndex(500, rects, 0)).toBe(2);
  });

  it('ignores the dragged row own slot', () => {
    expect(computeDropIndex(60, rects, 1)).toBe(1);
    expect(computeDropIndex(500, rects, 1)).toBe(2);
    expect(computeDropIndex(-500, rects, 1)).toBe(0);
  });

  it('is 0 for a single row', () => {
    expect(computeDropIndex(100, [{ top: 0, height: 40 }], 0)).toBe(0);
  });
});

describe('positionOf', () => {
  it('returns the 1-based position and the total', () => {
    expect(positionOf(['a', 'b', 'c'], 'b')).toEqual({ position: 2, total: 3 });
    expect(positionOf(['a', 'b', 'c'], 'a')).toEqual({ position: 1, total: 3 });
  });

  it('returns position 0 for an absent id', () => {
    expect(positionOf(['a'], 'x')).toEqual({ position: 0, total: 1 });
  });
});
