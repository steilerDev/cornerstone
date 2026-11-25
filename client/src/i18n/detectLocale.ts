export const SUPPORTED_LOCALES = ['en', 'de'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

function readNavigatorLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') return [];
  if (Array.isArray(navigator.languages) && navigator.languages.length > 0) {
    return navigator.languages;
  }
  return navigator.language ? [navigator.language] : [];
}

/**
 * The first browser language the app supports, by primary subtag ("de-AT" → "de"); "en" when none
 * matches. Walks navigator.languages in order (falls back to navigator.language).
 */
export function detectBrowserLocale(
  languages: readonly string[] = readNavigatorLanguages(),
): SupportedLocale {
  for (const language of languages) {
    const primary = language.toLowerCase().split('-')[0];
    const match = SUPPORTED_LOCALES.find((locale) => locale === primary);
    if (match) return match;
  }
  return 'en';
}
