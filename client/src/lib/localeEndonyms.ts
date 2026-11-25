import type { ResolvedLocale } from '../contexts/LocaleContext.js';

/**
 * Each supported locale's name in its own language (endonym). Language choices show these
 * untranslated in every UI language, so a reader can always find their own language.
 */
export const LOCALE_ENDONYMS = {
  en: 'English',
  de: 'Deutsch',
} as const satisfies Record<ResolvedLocale, string>;
