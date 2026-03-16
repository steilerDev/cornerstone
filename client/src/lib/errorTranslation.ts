import type { TFunction } from 'i18next';

export function translateApiError(code: string, t: TFunction<'errors'>): string {
  const translation = t(code, { defaultValue: '' });
  if (translation) return translation;
  return code
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}
