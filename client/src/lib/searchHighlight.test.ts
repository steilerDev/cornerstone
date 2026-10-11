import { describe, it, expect } from '@jest/globals';
import { findMatchRanges } from './searchHighlight.js';

describe('findMatchRanges', () => {
  it('matches ASCII case-insensitively and finds every occurrence', () => {
    expect(findMatchRanges('Roof roof ROOF', 'roof')).toEqual([
      [0, 4],
      [5, 9],
      [10, 14],
    ]);
  });

  it('returns the range of a partial match inside a word', () => {
    expect(findMatchRanges('Kitchen tiles', 'chen')).toEqual([[3, 7]]);
  });

  it('trims the query before matching', () => {
    expect(findMatchRanges('Kitchen tiles', '  tiles  ')).toEqual([[8, 13]]);
  });

  it.each(['muller', 'mueller', 'MÜLLER', 'Müller'])(
    'highlights "Müller" for the query "%s" through German folding',
    (query) => {
      expect(findMatchRanges('Müller', query)).toEqual([[0, 6]]);
    },
  );

  it('maps a digraph in the text to both source characters', () => {
    expect(findMatchRanges('Mueller', 'muller')).toEqual([[0, 7]]);
    expect(findMatchRanges('Mueller', 'mueller')).toEqual([[0, 7]]);
  });

  it('matches the oe and ae digraphs in the text', () => {
    expect(findMatchRanges('Schoene Aussicht', 'schone')).toEqual([[0, 7]]);
    expect(findMatchRanges('Haeuser', 'hauser')).toEqual([[0, 7]]);
  });

  it('matches ß against ss in both directions', () => {
    expect(findMatchRanges('Fußboden', 'fussboden')).toEqual([[0, 8]]);
    expect(findMatchRanges('Fussboden', 'fußboden')).toEqual([[0, 9]]);
  });

  it('matches only the ß part when the query ends inside the word', () => {
    expect(findMatchRanges('Straße 12', 'strasse')).toEqual([[0, 6]]);
  });

  it('returns no range when the query starts in the middle of a digraph', () => {
    expect(findMatchRanges('Goebel', 'ebel')).toEqual([]);
  });

  it('maps a decomposed (NFD) accent inside the match back to the original code units', () => {
    const text = 'Cafe\u0301 Bar';
    expect(findMatchRanges(text, 'cafe bar')).toEqual([[0, 9]]);
    expect(findMatchRanges(text, 'bar')).toEqual([[6, 9]]);
  });

  it('keeps ranges in original string indexes across astral characters', () => {
    expect(findMatchRanges('😀 Dach', 'dach')).toEqual([[3, 7]]);
  });

  it('returns no range where the per-letter fold disagrees with the search fold (final sigma)', () => {
    // foldSearchText lower-cases the whole string, so a final capital sigma becomes "ς";
    // per-letter folding gives "σ". The guard must refuse instead of marking a wrong span.
    expect(findMatchRanges('ΟΔΟΣ', 'οδοσ')).toEqual([]);
    expect(findMatchRanges('ΟΔΟΣ', 'οδος')).toEqual([]);
  });

  describe('combining marks', () => {
    it('extends the range over a trailing combining mark', () => {
      expect(findMatchRanges('Cafe\u0301 Bar', 'cafe')).toEqual([[0, 5]]);
    });

    it('extends over several trailing marks', () => {
      expect(findMatchRanges('e\u0301\u0302x', 'e')).toEqual([[0, 3]]);
    });

    it('never starts on a mark: a query that begins with the mark base keeps the base', () => {
      const ranges = findMatchRanges('xe\u0301y', 'e');
      expect(ranges).toEqual([[1, 3]]);
      for (const [start] of ranges) {
        expect('xe\u0301y'.charAt(start)).not.toBe('\u0301');
      }
    });

    it('moves a start that lands on a mark (one the fold keeps) back to its base', () => {
      expect(findMatchRanges('xa\u0483b', '\u0483b')).toEqual([[1, 4]]);
    });

    it('moves back over several marks to the base', () => {
      expect(findMatchRanges('xa\u0483\u0484b', '\u0484b')).toEqual([[1, 5]]);
    });

    it('extends over a trailing mark outside the BMP without splitting the pair', () => {
      const text = 'a\u{1D165}b';
      expect(findMatchRanges(text, 'a')).toEqual([[0, 3]]);
      expect(text.slice(0, 3)).toBe('a\u{1D165}');
    });

    it('leaves a mark after the range end alone when it belongs to the next base', () => {
      expect(findMatchRanges('abc\u0301', 'ab')).toEqual([[0, 2]]);
    });
  });

  describe('surrogate pairs', () => {
    const E = '😀';
    it('maps ranges across several emoji before and after the match', () => {
      const text = `${E}${E}${E}Dach${E}${E}`;
      expect(findMatchRanges(text, 'dach')).toEqual([[6, 10]]);
    });

    it('keeps an emoji inside the match inside the range', () => {
      const text = `a${E}b`;
      expect(findMatchRanges(text, `a${E}b`)).toEqual([[0, 4]]);
    });

    it('finds repeated matches separated by emoji', () => {
      const text = `ab${E}ab${E}${E}ab`;
      expect(findMatchRanges(text, 'ab')).toEqual([
        [0, 2],
        [4, 6],
        [10, 12],
      ]);
    });

    it('never splits a surrogate pair and never exceeds the text length', () => {
      const text = `${E}x${E}`;
      for (const query of ['x', E, 'xx']) {
        for (const [start, end] of findMatchRanges(text, query)) {
          expect(start).toBeGreaterThanOrEqual(0);
          expect(end).toBeLessThanOrEqual(text.length);
          expect(text.slice(start, end)).not.toMatch(/^[\udc00-\udfff]|[\ud800-\udbff]$/);
        }
      }
    });

    it('does not throw for emoji-only text', () => {
      expect(() => findMatchRanges(`${E}${E}`, 'a')).not.toThrow();
      expect(findMatchRanges(`${E}${E}`, 'a')).toEqual([]);
    });
  });

  it('merges occurrences that touch each other', () => {
    expect(findMatchRanges('aaaa', 'aa')).toEqual([[0, 4]]);
  });

  it.each(['', '   '])('returns no range for the blank query %p', (query) => {
    expect(findMatchRanges('Kitchen', query)).toEqual([]);
  });

  it('returns no range for an empty text', () => {
    expect(findMatchRanges('', 'abc')).toEqual([]);
  });

  it('returns no range when nothing matches', () => {
    expect(findMatchRanges('Kitchen', 'bath')).toEqual([]);
  });

  it('never returns an out-of-bounds range when per-character folding disagrees with the search fold', () => {
    // 'İ'.toLowerCase() is two code units ("i" + combining dot); the guard decides what is safe.
    for (const [text, query] of [
      ['İstanbul', 'istanbul'],
      ['İstanbul', 'stanbul'],
      ['aİb', 'ib'],
    ] as const) {
      const ranges = findMatchRanges(text, query);
      for (const [start, end] of ranges) {
        expect(start).toBeGreaterThanOrEqual(0);
        expect(end).toBeLessThanOrEqual(text.length);
        expect(end).toBeGreaterThan(start);
      }
    }
  });

  it('ignores a combining mark that the fold strips, without shifting later ranges', () => {
    expect(findMatchRanges('Zürich Zürich', 'zurich')).toEqual([
      [0, 7],
      [8, 14],
    ]);
  });
});
