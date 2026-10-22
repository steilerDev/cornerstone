import { useEntriesLanguage } from '../contexts/HouseNameContext.js';
import { userTextProps } from '../lib/userText.js';

/**
 * `userTextProps` bound to the household's entries language (no `lang` while it is unknown; the
 * hyphenation class still applies). Same usage rule: only on the user's own wrapping text, never
 * on translated strings, formatted values or single-line ellipsised text.
 */
export function useUserText(): (extraClassName?: string) => { lang?: string; className: string } {
  const language = useEntriesLanguage();
  return (extraClassName) => userTextProps(language, extraClassName);
}
