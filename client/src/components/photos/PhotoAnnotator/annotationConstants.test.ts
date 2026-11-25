import { describe, it, expect } from '@jest/globals';
import { ANNOTATION_COLORS, ANNOTATION_COLOR_NAMES, DEFAULT_COLOR } from './annotationConstants.js';

describe('annotation colours', () => {
  it('keeps the colour map in the same order as the name tuple', () => {
    expect(Object.keys(ANNOTATION_COLORS)).toEqual([...ANNOTATION_COLOR_NAMES]);
  });

  it('defaults to red', () => {
    expect(DEFAULT_COLOR).toBe(ANNOTATION_COLORS.red);
  });

  it('uses lowercase 6-digit hex values', () => {
    for (const hex of Object.values(ANNOTATION_COLORS)) {
      expect(hex).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});
