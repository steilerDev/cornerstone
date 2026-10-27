import { describe, it, expect } from '@jest/globals';
import { factSpans } from './factSpans.js';

const wideAt = (length: number, ...indexes: number[]) =>
  Array.from({ length }, (_, i) => indexes.includes(i));

describe('factSpans', () => {
  it('7 facts with Split (index 4) wide: columns 4 and 2 give [1,1,1,1,2,1,1]', () => {
    expect(factSpans(wideAt(7, 4), 4)).toEqual([1, 1, 1, 1, 2, 1, 1]);
    expect(factSpans(wideAt(7, 4), 2)).toEqual([1, 1, 1, 1, 2, 1, 1]);
  });

  it('6 facts with the same wide fact, 4 columns: the last row is filled', () => {
    expect(factSpans(wideAt(6, 4), 4)).toEqual([1, 1, 1, 1, 2, 2]);
  });

  it('7 facts, none wide, 4 columns: the last cell fills the remaining width', () => {
    expect(factSpans(wideAt(7), 4)).toEqual([1, 1, 1, 1, 1, 1, 2]);
  });

  it('5 columns: 5 narrow facts fill one row, 6 stretch the second row to the full width', () => {
    expect(factSpans(wideAt(5), 5)).toEqual([1, 1, 1, 1, 1]);
    expect(factSpans(wideAt(6), 5)).toEqual([1, 1, 1, 1, 1, 5]);
  });

  it('3 columns: a wide fact takes two and the row closes', () => {
    expect(factSpans(wideAt(4, 0), 3)).toEqual([2, 1, 1, 2]);
  });

  it('a wide last fact that fits takes two and stretches to the row end', () => {
    expect(factSpans([false, false, true], 4)).toEqual([1, 1, 2]);
    expect(factSpans([false, true], 4)).toEqual([1, 3]);
  });

  it('a wide fact that does not fit stretches the previous fact and starts a new row', () => {
    // row 1: three narrow facts need a fourth cell; the wide fact would overflow
    expect(factSpans([false, false, false, true], 4)).toEqual([1, 1, 2, 4]);
  });

  it('a wide fact in a 1-column strip is capped at one column', () => {
    expect(factSpans([true, false], 1)).toEqual([1, 1]);
  });

  it('returns no spans for no facts', () => {
    expect(factSpans([], 4)).toEqual([]);
  });

  it.each([4, 5, 6, 7])('%i facts leave no gap in any row, for every column count', (n) => {
    for (const cols of [2, 3, 4, 5]) {
      for (let mask = 0; mask < 2 ** n; mask += 1) {
        const wide = Array.from({ length: n }, (_, i) => ((mask >> i) & 1) === 1);
        const spans = factSpans(wide, cols);
        expect(spans).toHaveLength(n);
        // walk the grid: each row must sum to exactly `cols`
        let used = 0;
        for (const span of spans) {
          used += span;
          expect(used).toBeLessThanOrEqual(cols);
          if (used === cols) used = 0;
        }
        expect(used).toBe(0);
      }
    }
  });
});
