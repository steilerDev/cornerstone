import sharedStyles from '../styles/shared.module.css';

/**
 * `lang` + hyphenation class for the user's own text (titles that wrap, descriptions, notes,
 * names, document titles, preview text). `lang` is the household's entries language.
 *
 * Never use it on translated or fallback strings ("Untitled task", "Document #12"), formatted
 * dates or amounts, or single-line ellipsised text (summary strip values, tab labels, breadcrumb
 * crumbs): ellipsis and hyphens conflict, and those strings are not in the entries language.
 */
export function userTextProps(
  lang: string | null | undefined,
  extraClassName?: string,
): { lang?: string; className: string } {
  return {
    ...(lang ? { lang } : {}),
    className: [sharedStyles.userText, extraClassName].filter(Boolean).join(' '),
  };
}
