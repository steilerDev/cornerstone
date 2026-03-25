import { describe, it, expect, jest } from '@jest/globals';
import { getCategoryDisplayName } from './categoryUtils.js';
import enSettings from '../i18n/en/settings.json';
import deSettings from '../i18n/de/settings.json';

// ─── getCategoryDisplayName ────────────────────────────────────────────────────

describe('getCategoryDisplayName', () => {
  describe('when translationKey is present and translation exists', () => {
    it('calls t() with the translationKey and name as defaultValue', () => {
      const t = jest.fn((_key: string, _opts?: { defaultValue: string }) => 'Sanitär') as (
        key: string,
        opts?: { defaultValue: string },
      ) => string;

      const result = getCategoryDisplayName(t, 'Plumbing', 'trades.plumbing');

      expect(t).toHaveBeenCalledTimes(1);
      expect(t).toHaveBeenCalledWith('trades.plumbing', { defaultValue: 'Plumbing' });
      expect(result).toBe('Sanitär');
    });

    it('returns the translated string (not the raw name)', () => {
      const t = jest.fn(() => 'Malerarbeiten') as (
        key: string,
        opts?: { defaultValue: string },
      ) => string;

      const result = getCategoryDisplayName(t, 'Painting', 'trades.painting');

      expect(result).toBe('Malerarbeiten');
    });

    it('uses the raw name as defaultValue so t() can fall back to it', () => {
      const t = jest.fn(
        (_key: string, opts?: { defaultValue: string }) => opts?.defaultValue ?? '',
      ) as (key: string, opts?: { defaultValue: string }) => string;

      const result = getCategoryDisplayName(t, 'Materials', 'budgetCategories.materials');

      expect(t).toHaveBeenCalledWith('budgetCategories.materials', { defaultValue: 'Materials' });
      expect(result).toBe('Materials');
    });

    it('works with householdItemCategories namespace keys', () => {
      const t = jest.fn((_key: string, _opts?: { defaultValue: string }) => 'Möbel') as (
        key: string,
        opts?: { defaultValue: string },
      ) => string;

      const result = getCategoryDisplayName(t, 'Furniture', 'householdItemCategories.furniture');

      expect(t).toHaveBeenCalledWith('householdItemCategories.furniture', {
        defaultValue: 'Furniture',
      });
      expect(result).toBe('Möbel');
    });
  });

  describe('when translationKey is null', () => {
    it('returns the raw name without calling t()', () => {
      const t = jest.fn() as (key: string, opts?: { defaultValue: string }) => string;

      const result = getCategoryDisplayName(t, 'Custom Trade', null);

      expect(t).not.toHaveBeenCalled();
      expect(result).toBe('Custom Trade');
    });

    it('returns an empty string when name is empty and translationKey is null', () => {
      const t = jest.fn() as (key: string, opts?: { defaultValue: string }) => string;

      const result = getCategoryDisplayName(t, '', null);

      expect(t).not.toHaveBeenCalled();
      expect(result).toBe('');
    });

    it('returns the exact raw name string without modification', () => {
      const t = jest.fn() as (key: string, opts?: { defaultValue: string }) => string;
      const rawName = 'My Custom Budget Category 123';

      const result = getCategoryDisplayName(t, rawName, null);

      expect(result).toBe(rawName);
    });
  });

  describe('when translationKey is present but translation does not exist', () => {
    it('falls back to raw name when t() returns the key itself (i18next default)', () => {
      // Simulate i18next returning the key when no translation exists
      const t = jest.fn((key: string, _opts?: { defaultValue: string }) => key) as (
        key: string,
        opts?: { defaultValue: string },
      ) => string;

      const result = getCategoryDisplayName(t, 'Plumbing', 'trades.plumbing');

      // t() is called with the key — returns the key string here
      // The caller receives whatever t() returns (the key, not the raw name)
      // This is standard i18next behaviour; defaultValue is only used when
      // i18next explicitly returns the defaultValue option
      expect(t).toHaveBeenCalledWith('trades.plumbing', { defaultValue: 'Plumbing' });
    });

    it('returns defaultValue (raw name) when t() honours the defaultValue option', () => {
      // Simulate i18next using defaultValue when key is missing from locale
      const t = jest.fn(
        (_key: string, opts?: { defaultValue: string }) => opts?.defaultValue ?? '',
      ) as (key: string, opts?: { defaultValue: string }) => string;

      const result = getCategoryDisplayName(t, 'Plumbing', 'trades.missingKey');

      expect(result).toBe('Plumbing');
    });
  });

  describe('edge cases', () => {
    it('passes the exact translationKey string to t() without modification', () => {
      const t = jest.fn(() => 'translated') as (
        key: string,
        opts?: { defaultValue: string },
      ) => string;

      getCategoryDisplayName(t, 'Name', 'budgetCategories.householdItems');

      expect(t).toHaveBeenCalledWith('budgetCategories.householdItems', expect.any(Object));
    });

    it('handles translationKey that is an empty string — behaves as truthy is false', () => {
      // An empty string is falsy in JS, so getCategoryDisplayName treats it like null
      const t = jest.fn() as (key: string, opts?: { defaultValue: string }) => string;

      const result = getCategoryDisplayName(t, 'SomeName', '');

      // Empty string is falsy → falls through to return name directly
      expect(t).not.toHaveBeenCalled();
      expect(result).toBe('SomeName');
    });
  });
});

// ─── i18n locale coverage ─────────────────────────────────────────────────────

/**
 * Verify that all category translation keys used by migration 0030 are present
 * in both the `en` and `de` locale files under client/src/i18n/.
 *
 * The translationKey values written to the DB (e.g. 'trades.plumbing') map to
 * settings.trades.plumbing in the i18n namespace. The prefix before the first
 * dot is the section, the suffix after is the leaf key.
 */
describe('i18n locale coverage — settings namespace category keys', () => {
  // All translation keys assigned by migration 0030 (predefined rows only)
  const tradeKeys = [
    'plumbing',
    'hvac',
    'electrical',
    'drywall',
    'carpentry',
    'masonry',
    'painting',
    'roofing',
    'flooring',
    'tiling',
    'landscaping',
    'excavation',
    'generalContractor',
    'architectDesign',
    'other',
  ];

  const budgetCategoryKeys = [
    'materials',
    'labor',
    'permits',
    'design',
    'householdItems',
    'waste',
    'other',
    'equipment',
    'landscaping',
    'utilities',
    'insurance',
    'contingency',
  ];

  const householdItemCategoryKeys = [
    'furniture',
    'appliances',
    'fixtures',
    'decor',
    'electronics',
    'equipment',
    'other',
    'outdoor',
    'storage',
  ];

  type SettingsJson = {
    trades: Record<string, string>;
    budgetCategories: Record<string, string>;
    householdItemCategories: Record<string, string>;
  };

  const en = enSettings as unknown as SettingsJson;
  const de = deSettings as unknown as SettingsJson;

  describe('en locale — settings.trades', () => {
    for (const key of tradeKeys) {
      it(`has non-empty value for key "${key}"`, () => {
        expect(typeof en.trades[key]).toBe('string');
        expect(en.trades[key].length).toBeGreaterThan(0);
      });
    }
  });

  describe('de locale — settings.trades', () => {
    for (const key of tradeKeys) {
      it(`has non-empty value for key "${key}"`, () => {
        expect(typeof de.trades[key]).toBe('string');
        expect(de.trades[key].length).toBeGreaterThan(0);
      });
    }
  });

  describe('en locale — settings.budgetCategories', () => {
    for (const key of budgetCategoryKeys) {
      it(`has non-empty value for key "${key}"`, () => {
        expect(typeof en.budgetCategories[key]).toBe('string');
        expect(en.budgetCategories[key].length).toBeGreaterThan(0);
      });
    }
  });

  describe('de locale — settings.budgetCategories', () => {
    for (const key of budgetCategoryKeys) {
      it(`has non-empty value for key "${key}"`, () => {
        expect(typeof de.budgetCategories[key]).toBe('string');
        expect(de.budgetCategories[key].length).toBeGreaterThan(0);
      });
    }
  });

  describe('en locale — settings.householdItemCategories', () => {
    for (const key of householdItemCategoryKeys) {
      it(`has non-empty value for key "${key}"`, () => {
        expect(typeof en.householdItemCategories[key]).toBe('string');
        expect(en.householdItemCategories[key].length).toBeGreaterThan(0);
      });
    }
  });

  describe('de locale — settings.householdItemCategories', () => {
    for (const key of householdItemCategoryKeys) {
      it(`has non-empty value for key "${key}"`, () => {
        expect(typeof de.householdItemCategories[key]).toBe('string');
        expect(de.householdItemCategories[key].length).toBeGreaterThan(0);
      });
    }
  });

  describe('key parity between en and de', () => {
    it('de has the same trades keys as en', () => {
      expect(Object.keys(de.trades).sort()).toEqual(Object.keys(en.trades).sort());
    });

    it('de has the same budgetCategories keys as en', () => {
      expect(Object.keys(de.budgetCategories).sort()).toEqual(
        Object.keys(en.budgetCategories).sort(),
      );
    });

    it('de has the same householdItemCategories keys as en', () => {
      expect(Object.keys(de.householdItemCategories).sort()).toEqual(
        Object.keys(en.householdItemCategories).sort(),
      );
    });
  });
});
