import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { generateRandomColor } from './colorUtils.js';

// ─── generateRandomColor ──────────────────────────────────────────────────────

describe('generateRandomColor', () => {
  describe('output format', () => {
    it('returns a string matching #RRGGBB hex format', () => {
      const result = generateRandomColor();
      expect(result).toMatch(/^#[0-9a-f]{6}$/i);
    });

    it('starts with a hash character', () => {
      const result = generateRandomColor();
      expect(result[0]!).toBe('#');
    });

    it('has exactly 7 characters total (# plus 6 hex digits)', () => {
      const result = generateRandomColor();
      expect(result).toHaveLength(7);
    });

    it('contains only valid hex characters in the 6 digit portion', () => {
      const result = generateRandomColor();
      const hexPart = result.slice(1);
      expect(hexPart).toMatch(/^[0-9a-f]{6}$/i);
    });
  });

  describe('uniqueness across calls', () => {
    it('produces at least 40 unique values in a sample of 50 calls', () => {
      const results = new Set<string>();
      for (let i = 0; i < 50; i++) {
        results.add(generateRandomColor());
      }
      expect(results.size).toBeGreaterThanOrEqual(40);
    });

    it('two successive calls typically differ', () => {
      // With 360 * 26 * 21 = 196,560 possible combinations this is near-certain
      const calls = Array.from({ length: 10 }, () => generateRandomColor());
      const unique = new Set(calls);
      expect(unique.size).toBeGreaterThan(1);
    });
  });

  describe('deterministic output with mocked Math.random', () => {
    const originalRandom = Math.random;

    beforeEach(() => {
      // Math.random is called three times per invocation:
      //   1st call → hue         floor(x * 360)      → 0–359
      //   2nd call → saturation  floor(x * 26) + 65  → 65–90
      //   3rd call → lightness   floor(x * 21) + 40  → 40–60
      let callCount = 0;
      const fixedValues = [0.5, 0.5, 0.5];
      Math.random = jest.fn(() => fixedValues[callCount++ % fixedValues.length]) as () => number;
    });

    afterEach(() => {
      Math.random = originalRandom;
    });

    it('returns the same value on every call when Math.random is fixed', () => {
      const first = generateRandomColor();

      // Reset the mock to the same sequence for the second call
      let callCount = 0;
      const fixedValues = [0.5, 0.5, 0.5];
      Math.random = jest.fn(() => fixedValues[callCount++ % fixedValues.length]) as () => number;

      const second = generateRandomColor();
      expect(first).toBe(second);
    });

    it('returns a valid hex color when Math.random returns 0.5', () => {
      const result = generateRandomColor();
      expect(result).toMatch(/^#[0-9a-f]{6}$/i);
    });

    it('returns a valid hex color when Math.random returns 0 (minimum boundary)', () => {
      Math.random = jest.fn(() => 0) as () => number;
      const result = generateRandomColor();
      expect(result).toMatch(/^#[0-9a-f]{6}$/i);
    });

    it('returns a valid hex color when Math.random returns values near 1 (maximum boundary)', () => {
      Math.random = jest.fn(() => 0.9999) as () => number;
      const result = generateRandomColor();
      expect(result).toMatch(/^#[0-9a-f]{6}$/i);
    });

    it('produces the expected deterministic output for Math.random = 0', () => {
      // hue = floor(0 * 360) = 0
      // saturation = floor(0 * 26) + 65 = 65
      // lightness  = floor(0 * 21) + 40 = 40
      //
      // hslToHex(0, 65, 40):
      //   sNorm = 0.65, lNorm = 0.40
      //   a = 0.65 * min(0.40, 0.60) = 0.65 * 0.40 = 0.26
      //   f(0): k = (0 + 0/30) % 12 = 0
      //         color = 0.40 - 0.26 * max(min(0-3, 9-0, 1), -1)
      //               = 0.40 - 0.26 * max(min(-3, 9, 1), -1)
      //               = 0.40 - 0.26 * max(-1, -1)
      //               = 0.40 - 0.26 * (-1) = 0.66
      //         round(255 * 0.66) = round(168.3) = 168 → "a8"
      //   f(8): k = (8 + 0) % 12 = 8
      //         color = 0.40 - 0.26 * max(min(5, 1, 1), -1)
      //               = 0.40 - 0.26 * 1 = 0.14
      //         round(255 * 0.14) = round(35.7) = 36 → "24"
      //   f(4): k = (4 + 0) % 12 = 4
      //         color = 0.40 - 0.26 * max(min(1, 5, 1), -1)
      //               = 0.40 - 0.26 * 1 = 0.14
      //         round(255 * 0.14) = round(35.7) = 36 → "24"
      //   result = "#a82424"
      Math.random = jest.fn(() => 0) as () => number;
      const result = generateRandomColor();
      expect(result).toBe('#a82424');
    });
  });

  describe('valid hex characters', () => {
    it('all 6 hex digit characters are in [0-9a-f] across multiple calls', () => {
      const validHexChars = new Set('0123456789abcdef');
      for (let i = 0; i < 20; i++) {
        const hexPart = generateRandomColor().slice(1).toLowerCase();
        for (const ch of hexPart) {
          expect(validHexChars.has(ch)).toBe(true);
        }
      }
    });
  });
});
