import { describe, it, expect } from '@jest/globals';
import { ERROR_CODES } from '@cornerstone/shared';
import enErrors from './en/errors.json';
import deErrors from './de/errors.json';

const LOCALES: Array<['en' | 'de', Record<string, unknown>]> = [
  ['en', enErrors],
  ['de', deErrors],
];

describe('errors.json covers exactly the ErrorCode union (#2132)', () => {
  it.each(LOCALES)('%s: every ErrorCode has a non-empty translation', (_locale, json) => {
    const missing = ERROR_CODES.filter((code) => {
      const value = json[code];
      return typeof value !== 'string' || value.trim() === '';
    });
    expect(missing).toEqual([]);
  });

  it.each(LOCALES)('%s: no key exists outside ErrorCode', (_locale, json) => {
    const known = new Set<string>(ERROR_CODES);
    const extra = Object.keys(json).filter((key) => !known.has(key));
    expect(extra).toEqual([]);
  });
});
