import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { ENTRIES_LANGUAGES } from '@cornerstone/shared';
import { LOCALE_ENDONYMS } from './localeEndonyms.js';

const glossary = JSON.parse(
  readFileSync(new URL('../i18n/glossary.json', import.meta.url), 'utf8'),
) as { _meta: { locales: string[] } };

describe('LOCALE_ENDONYMS', () => {
  it('has one entry per supported locale', () => {
    expect(Object.keys(LOCALE_ENDONYMS).sort()).toEqual(['en', ...glossary._meta.locales].sort());
  });

  it('covers exactly the entries languages', () => {
    expect(Object.keys(LOCALE_ENDONYMS).sort()).toEqual([...ENTRIES_LANGUAGES].sort());
  });

  it('names each language in itself', () => {
    expect(LOCALE_ENDONYMS.en).toBe('English');
    expect(LOCALE_ENDONYMS.de).toBe('Deutsch');
  });
});
