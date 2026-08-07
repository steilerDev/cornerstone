/**
 * Unit tests for categoryMapping.ts (Story #1596)
 *
 * Covers: exact name match, exact translationKey match, partial containment,
 * synonym map (DE → canonical, EN canonical), no-match, null/empty inputs,
 * empty categories, whitespace trimming, no mutation of inputs.
 *
 * Pure-function tests — no DB or fetch required.
 */

import { describe, it, expect } from '@jest/globals';
import { mapCategoryNameToId } from './categoryMapping.js';

interface CategoryRow {
  id: string;
  name: string;
  translationKey?: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCategories(
  rows: Array<{ id: string; name: string; translationKey?: string | null }>,
): CategoryRow[] {
  return rows;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('mapCategoryNameToId', () => {
  describe('null / empty inputs', () => {
    it('returns null when extracted is null', () => {
      const categories = makeCategories([{ id: 'cat-1', name: 'Materials' }]);
      expect(mapCategoryNameToId(null, categories)).toBeNull();
    });

    it('returns null when extracted is undefined', () => {
      const categories = makeCategories([{ id: 'cat-1', name: 'Materials' }]);
      expect(mapCategoryNameToId(undefined, categories)).toBeNull();
    });

    it('returns null when extracted is an empty string', () => {
      const categories = makeCategories([{ id: 'cat-1', name: 'Materials' }]);
      expect(mapCategoryNameToId('', categories)).toBeNull();
    });

    it('returns null when extracted is whitespace-only', () => {
      const categories = makeCategories([{ id: 'cat-1', name: 'Materials' }]);
      expect(mapCategoryNameToId('   ', categories)).toBeNull();
    });

    it('returns null when categories array is empty', () => {
      expect(mapCategoryNameToId('materials', [])).toBeNull();
    });
  });

  describe('step 1 — exact match on category name (case-insensitive)', () => {
    it('matches when extracted equals category name (same case)', () => {
      const categories = makeCategories([{ id: 'cat-materials', name: 'Materials' }]);
      expect(mapCategoryNameToId('Materials', categories)).toBe('cat-materials');
    });

    it('matches when extracted is lowercase and category name is Title Case', () => {
      const categories = makeCategories([{ id: 'cat-labor', name: 'Labor' }]);
      expect(mapCategoryNameToId('labor', categories)).toBe('cat-labor');
    });

    it('matches when extracted is uppercase', () => {
      const categories = makeCategories([{ id: 'cat-elect', name: 'Electrical' }]);
      expect(mapCategoryNameToId('ELECTRICAL', categories)).toBe('cat-elect');
    });

    it('returns the first exact match when multiple categories share the same lower-cased name', () => {
      const categories = makeCategories([
        { id: 'cat-first', name: 'Roofing' },
        { id: 'cat-second', name: 'roofing' },
      ]);
      // implementation uses find() so returns first
      expect(mapCategoryNameToId('roofing', categories)).toBe('cat-first');
    });
  });

  describe('step 2 — exact match on translationKey (case-insensitive)', () => {
    it('matches when extracted equals translationKey', () => {
      const categories = makeCategories([
        {
          id: 'cat-labor',
          name: 'Arbeit',
          translationKey: 'label.labor',
        },
      ]);
      expect(mapCategoryNameToId('label.labor', categories)).toBe('cat-labor');
    });

    it('matches translationKey case-insensitively', () => {
      const categories = makeCategories([
        {
          id: 'cat-tile',
          name: 'Fliesen',
          translationKey: 'LABEL.TILE',
        },
      ]);
      expect(mapCategoryNameToId('label.tile', categories)).toBe('cat-tile');
    });

    it('skips categories with null translationKey', () => {
      const categories = makeCategories([
        { id: 'cat-other', name: 'Other', translationKey: null },
        { id: 'cat-paint', name: 'Painting', translationKey: 'label.painting' },
      ]);
      expect(mapCategoryNameToId('label.painting', categories)).toBe('cat-paint');
    });
  });

  describe('step 3 — partial containment', () => {
    it('matches when extracted string is contained in category name', () => {
      // "Tile" ⊂ "Tile Installation"
      const categories = makeCategories([{ id: 'cat-tile', name: 'Tile Installation' }]);
      expect(mapCategoryNameToId('tile', categories)).toBe('cat-tile');
    });

    it('matches when category name is contained in extracted string', () => {
      // "Tile" ⊂ "Tile installation work" (norm) or reversed
      const categories = makeCategories([{ id: 'cat-tile', name: 'Tile' }]);
      expect(mapCategoryNameToId('Tile installation', categories)).toBe('cat-tile');
    });

    it('is case-insensitive for partial match', () => {
      const categories = makeCategories([{ id: 'cat-plumb', name: 'Plumbing Work' }]);
      expect(mapCategoryNameToId('PLUMBING', categories)).toBe('cat-plumb');
    });
  });

  describe('step 4 — synonym map', () => {
    it('DE alias "Fliesen" maps to canonical "tile" → finds category whose name contains "tile"', () => {
      const categories = makeCategories([{ id: 'cat-tile', name: 'Tile' }]);
      expect(mapCategoryNameToId('Fliesen', categories)).toBe('cat-tile');
    });

    it('DE alias "material" maps to canonical "materials" → finds category', () => {
      const categories = makeCategories([{ id: 'cat-mat', name: 'Materials' }]);
      expect(mapCategoryNameToId('material', categories)).toBe('cat-mat');
    });

    it('DE alias "elektro" maps to canonical "electrical" → finds category', () => {
      const categories = makeCategories([{ id: 'cat-elec', name: 'Electrical' }]);
      expect(mapCategoryNameToId('Elektro', categories)).toBe('cat-elec');
    });

    it('DE alias "dach" maps to canonical "roofing" → finds category', () => {
      const categories = makeCategories([{ id: 'cat-roof', name: 'Roofing' }]);
      expect(mapCategoryNameToId('dach', categories)).toBe('cat-roof');
    });

    it('DE alias "maler" maps to canonical "painting" → finds category', () => {
      const categories = makeCategories([{ id: 'cat-paint', name: 'Painting' }]);
      expect(mapCategoryNameToId('maler', categories)).toBe('cat-paint');
    });

    it('EN canonical "Labor" directly hits synonym canonical key → finds category', () => {
      const categories = makeCategories([{ id: 'cat-labor', name: 'Labor' }]);
      // "labor" is the canonical key itself — also matched via alias check `norm === canonical`
      expect(mapCategoryNameToId('Labor', categories)).toBe('cat-labor');
    });

    it('DE alias "sanitär" maps to canonical "plumbing" → finds category', () => {
      const categories = makeCategories([{ id: 'cat-plumb', name: 'Plumbing' }]);
      expect(mapCategoryNameToId('sanitär', categories)).toBe('cat-plumb');
    });

    it('DE alias "bodenbelag" maps to canonical "flooring" → finds category', () => {
      const categories = makeCategories([{ id: 'cat-floor', name: 'Flooring' }]);
      expect(mapCategoryNameToId('bodenbelag', categories)).toBe('cat-floor');
    });
  });

  describe('no match', () => {
    it('returns null when no category matches by any strategy', () => {
      const categories = makeCategories([
        { id: 'cat-mat', name: 'Materials' },
        { id: 'cat-labor', name: 'Labor' },
      ]);
      expect(mapCategoryNameToId('Unicorn', categories)).toBeNull();
    });

    it('returns null when synonym is found but category list has no matching entry', () => {
      // "Fliesen" is an alias for "tile" but no category has "tile" in its name
      const categories = makeCategories([{ id: 'cat-mat', name: 'Materials' }]);
      expect(mapCategoryNameToId('Fliesen', categories)).toBeNull();
    });
  });

  describe('whitespace trimming', () => {
    it('trims leading and trailing spaces before matching', () => {
      const categories = makeCategories([{ id: 'cat-mat', name: 'Materials' }]);
      expect(mapCategoryNameToId('  Materials  ', categories)).toBe('cat-mat');
    });

    it('trims and applies synonym lookup', () => {
      const categories = makeCategories([{ id: 'cat-tile', name: 'Tile' }]);
      expect(mapCategoryNameToId('  Fliesen  ', categories)).toBe('cat-tile');
    });
  });

  describe('immutability', () => {
    it('does NOT mutate the categories array', () => {
      const categories = makeCategories([
        { id: 'cat-mat', name: 'Materials' },
        { id: 'cat-labor', name: 'Labor' },
      ]);
      const copy = JSON.stringify(categories);
      mapCategoryNameToId('materials', categories);
      expect(JSON.stringify(categories)).toBe(copy);
    });

    it('does NOT mutate the extracted string input', () => {
      const input = '  materials  ';
      mapCategoryNameToId(input, [{ id: 'cat-mat', name: 'Materials' }]);
      expect(input).toBe('  materials  ');
    });
  });
});
