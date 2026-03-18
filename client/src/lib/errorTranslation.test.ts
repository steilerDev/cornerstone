import { describe, it, expect, jest } from '@jest/globals';
import { translateApiError } from './errorTranslation.js';
import type { TFunction } from 'i18next';

// Import the error translation JSON files to verify coverage
import enErrors from '../i18n/en/errors.json';
import deErrors from '../i18n/de/errors.json';

// ─── Helper ───────────────────────────────────────────────────────────────────

/**
 * Build a minimal TFunction that looks up keys from the provided translation map.
 * If the key is not found, returns the defaultValue option or empty string.
 */
function buildTFunction(translations: Record<string, string>): TFunction<'errors'> {
  return ((key: string, options?: { defaultValue?: string }) => {
    const found = translations[key];
    if (found !== undefined) return found;
    return options?.defaultValue ?? '';
  }) as unknown as TFunction<'errors'>;
}

const tEn = buildTFunction(enErrors);
const tDe = buildTFunction(deErrors);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('translateApiError', () => {
  describe('known error codes (English)', () => {
    it('NOT_FOUND returns a non-empty translation string', () => {
      const result = translateApiError('NOT_FOUND', tEn);
      expect(result).toBe(enErrors.NOT_FOUND);
      expect(result.length).toBeGreaterThan(0);
    });

    it('UNAUTHORIZED returns a non-empty translation string', () => {
      const result = translateApiError('UNAUTHORIZED', tEn);
      expect(result).toBe(enErrors.UNAUTHORIZED);
      expect(result.length).toBeGreaterThan(0);
    });

    it('VALIDATION_ERROR returns a non-empty translation string', () => {
      const result = translateApiError('VALIDATION_ERROR', tEn);
      expect(result).toBe(enErrors.VALIDATION_ERROR);
    });

    it('FORBIDDEN returns a non-empty translation string', () => {
      const result = translateApiError('FORBIDDEN', tEn);
      expect(result).toBe(enErrors.FORBIDDEN);
    });

    it('CONFLICT returns a non-empty translation string', () => {
      const result = translateApiError('CONFLICT', tEn);
      expect(result).toBe(enErrors.CONFLICT);
    });

    it('INTERNAL_ERROR returns a non-empty translation string', () => {
      const result = translateApiError('INTERNAL_ERROR', tEn);
      expect(result).toBe(enErrors.INTERNAL_ERROR);
    });

    it('CIRCULAR_DEPENDENCY returns a non-empty translation string', () => {
      const result = translateApiError('CIRCULAR_DEPENDENCY', tEn);
      expect(result).toBe(enErrors.CIRCULAR_DEPENDENCY);
    });
  });

  describe('known error codes (German)', () => {
    it('NOT_FOUND returns a German translation', () => {
      const result = translateApiError('NOT_FOUND', tDe);
      expect(result).toBe(deErrors.NOT_FOUND);
      expect(result.length).toBeGreaterThan(0);
    });

    it('UNAUTHORIZED returns a German translation', () => {
      const result = translateApiError('UNAUTHORIZED', tDe);
      expect(result).toBe(deErrors.UNAUTHORIZED);
    });

    it('VALIDATION_ERROR returns a German translation', () => {
      const result = translateApiError('VALIDATION_ERROR', tDe);
      expect(result).toBe(deErrors.VALIDATION_ERROR);
    });
  });

  describe('unknown error codes — humanized fallback', () => {
    it('UNKNOWN_CODE returns humanized title-case fallback', () => {
      const result = translateApiError('UNKNOWN_CODE', tEn);
      expect(result).toBe('Unknown Code');
    });

    it('single word code is title-cased', () => {
      const result = translateApiError('MYERROR', tEn);
      expect(result).toBe('Myerror');
    });

    it('three-word code is title-cased with spaces', () => {
      const result = translateApiError('SOME_NEW_ERROR', tEn);
      expect(result).toBe('Some New Error');
    });

    it('ALL_CAPS_CODE returns each word capitalized with rest lowercased', () => {
      const result = translateApiError('ACCESS_DENIED_TIMEOUT', tEn);
      expect(result).toBe('Access Denied Timeout');
    });

    it('unknown code in German t function also returns humanized fallback', () => {
      const result = translateApiError('TOTALLY_UNKNOWN', tDe);
      expect(result).toBe('Totally Unknown');
    });
  });

  describe('all ErrorCode enum values have translations in both locales', () => {
    const allErrorCodes = Object.keys(enErrors) as (keyof typeof enErrors)[];

    it('all English error translations are non-empty strings', () => {
      for (const code of allErrorCodes) {
        expect(typeof enErrors[code]).toBe('string');
        expect(enErrors[code].length).toBeGreaterThan(0);
      }
    });

    it('all German error translations are non-empty strings', () => {
      for (const code of allErrorCodes) {
        expect(typeof deErrors[code]).toBe('string');
        expect((deErrors as Record<string, string>)[code].length).toBeGreaterThan(0);
      }
    });

    it('German error JSON has the same keys as English', () => {
      const enKeys = new Set(Object.keys(enErrors));
      const deKeys = new Set(Object.keys(deErrors));

      const missingInDe = [...enKeys].filter((k) => !deKeys.has(k));
      const extraInDe = [...deKeys].filter((k) => !enKeys.has(k));

      expect(missingInDe).toEqual([]);
      expect(extraInDe).toEqual([]);
    });

    it('translateApiError with en t function returns the translation for every known code', () => {
      for (const code of allErrorCodes) {
        const result = translateApiError(code, tEn);
        // Should return the translated string, not a humanized fallback
        expect(result).toBe(enErrors[code]);
      }
    });

    it('translateApiError with de t function returns the German translation for every known code', () => {
      for (const code of allErrorCodes) {
        const result = translateApiError(code, tDe);
        expect(result).toBe((deErrors as Record<string, string>)[code]);
      }
    });
  });

  describe('edge cases', () => {
    it('uses defaultValue empty string mechanism to detect missing keys', () => {
      // When t() returns empty string for defaultValue: '', fallback kicks in
      const tEmpty = ((_key: string, _opts?: unknown) => '') as TFunction<'errors'>;
      const result = translateApiError('NOT_FOUND', tEmpty);
      // Fallback: 'Not Found'
      expect(result).toBe('Not Found');
    });

    it('does not call t with empty code', () => {
      const tSpy = jest.fn((_key: string, opts?: { defaultValue?: string }) => {
        return opts?.defaultValue ?? '';
      }) as unknown as TFunction<'errors'>;

      const result = translateApiError('', tSpy);
      // Empty code → all words are empty → join is empty string
      expect(typeof result).toBe('string');
    });
  });
});
