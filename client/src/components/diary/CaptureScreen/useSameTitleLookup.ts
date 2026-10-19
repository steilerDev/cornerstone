import { useEffect, useRef, useState } from 'react';
import type { DiaryEntryLookupMatch } from '@cornerstone/shared';
import { lookupDiaryEntries } from '../../../lib/diaryApi.js';

const LOOKUP_DELAY_MS = 500;
const MIN_TITLE_LENGTH = 2;
const MAX_SHOWN = 3;
const NO_MATCHES: readonly DiaryEntryLookupMatch[] = [];

export interface SameTitleLookupOptions {
  entryDate: string;
  title: string;
  /** The capture screen's own draft; matches never include it. Null: no draft yet. */
  excludeId: string | null;
  /** Called once per distinct set of matches (never for an empty set). */
  onNewMatches?: (matches: readonly DiaryEntryLookupMatch[]) => void;
}

/**
 * Entries of the same day with the same title, looked up 500 ms after the last change of the
 * date or the title. Never runs for a title under two characters; never blocks anything.
 */
export function useSameTitleLookup({
  entryDate,
  title,
  excludeId,
  onNewMatches,
}: SameTitleLookupOptions): readonly DiaryEntryLookupMatch[] {
  const trimmed = title.trim();
  const active = Boolean(entryDate) && trimmed.length >= MIN_TITLE_LENGTH;
  const [result, setResult] = useState<{
    entryDate: string;
    title: string;
    matches: readonly DiaryEntryLookupMatch[];
  } | null>(null);
  const announcedRef = useRef('');
  const onNewMatchesRef = useRef(onNewMatches);
  useEffect(() => {
    onNewMatchesRef.current = onNewMatches;
  });

  useEffect(() => {
    if (!active) return undefined;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      lookupDiaryEntries(
        { entryDate, title: trimmed, ...(excludeId ? { excludeId } : {}) },
        { signal: controller.signal },
      )
        .then((response) => {
          if (controller.signal.aborted) return;
          const matches = response.matches.slice(0, MAX_SHOWN);
          setResult({ entryDate, title: trimmed, matches });
          const setKey = matches.map((match) => match.id).join(',');
          if (setKey && setKey !== announcedRef.current) onNewMatchesRef.current?.(matches);
          announcedRef.current = setKey;
        })
        .catch(() => {
          // The offer is a convenience: a failed lookup shows nothing.
        });
    }, LOOKUP_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [active, entryDate, trimmed, excludeId]);

  if (!active || !result || result.entryDate !== entryDate || result.title !== trimmed) {
    return NO_MATCHES;
  }
  return result.matches;
}
