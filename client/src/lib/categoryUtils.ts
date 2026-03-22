import { useTranslation } from 'react-i18next';

/**
 * Returns the display name for a category or trade.
 * If translationKey is present, returns the translated string from the 'settings' namespace.
 * Otherwise falls back to the raw name from the database.
 */
export function getCategoryDisplayName(
  t: (key: string, options?: { defaultValue: string }) => string,
  name: string,
  translationKey: string | null,
): string {
  if (!translationKey) return name;
  return t(translationKey, { defaultValue: name });
}

/**
 * Hook wrapper for getCategoryDisplayName.
 * Provides the translation function from the 'settings' namespace.
 */
export function useCategoryDisplayName(name: string, translationKey: string | null): string {
  const { t } = useTranslation('settings');
  return getCategoryDisplayName(t, name, translationKey);
}
