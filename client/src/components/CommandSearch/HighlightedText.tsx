import type { ReactNode } from 'react';
import { findMatchRanges } from '../../lib/searchHighlight.js';
import styles from './CommandSearch.module.css';

export interface HighlightedTextProps {
  readonly text: string;
  /** The query whose occurrences are marked (the whole trimmed string). */
  readonly query: string;
}

/** Text with `<mark>` around each folded occurrence of the query; never HTML, never altered. */
export function HighlightedText({ text, query }: HighlightedTextProps): ReactNode {
  const ranges = findMatchRanges(text, query);
  if (ranges.length === 0) return text;
  const pieces: ReactNode[] = [];
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (start > cursor) pieces.push(text.slice(cursor, start));
    pieces.push(
      <mark key={start} className={styles.mark}>
        {text.slice(start, end)}
      </mark>,
    );
    cursor = end;
  }
  if (cursor < text.length) pieces.push(text.slice(cursor));
  return pieces.map((piece, index) =>
    typeof piece === 'string' ? (
      // eslint-disable-next-line @eslint-react/no-array-index-key -- static text pieces in source order
      <span key={`t${index}`}>{piece}</span>
    ) : (
      piece
    ),
  );
}
