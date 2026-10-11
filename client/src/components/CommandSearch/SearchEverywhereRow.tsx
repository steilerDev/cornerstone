import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { SEARCH_QUERY_MIN_LENGTH } from '@cornerstone/shared';
import { useCommandSearch } from './CommandSearchContext.js';
import styles from './CommandSearch.module.css';

export interface SearchEverywhereRowProps {
  /** The draft in the list's own search field. */
  readonly query: string;
  /** The list's search field: focus returns there when the palette closes. */
  readonly returnFocusRef?: RefObject<HTMLElement | null>;
  readonly testId?: string;
}

/**
 * "Search everywhere for ‹text›": sits under a list's search field and opens the command search
 * prefilled with the draft. Renders nothing for a draft under 2 characters or outside the shell.
 */
export function SearchEverywhereRow({
  query,
  returnFocusRef,
  testId = 'search-everywhere-row',
}: SearchEverywhereRowProps) {
  const { t } = useTranslation('common');
  const commandSearch = useCommandSearch();
  const text = query.trim();
  if (!commandSearch.available || text.length < SEARCH_QUERY_MIN_LENGTH) return null;
  const sentence = t('commandSearch.searchEverywhere', { text });
  return (
    <button
      type="button"
      className={styles.everywhereRow}
      aria-haspopup="dialog"
      title={sentence}
      onClick={() => commandSearch.open({ query: text, returnFocusRef })}
      data-testid={testId}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <circle cx="7" cy="7" r="4.5" />
        <path d="M10.5 10.5L14 14" />
      </svg>
      <span className={styles.everywhereText}>{sentence}</span>
    </button>
  );
}
