import { useCallback, useEffect, useRef, useState } from 'react';
import { useDebouncedCallback } from '../../hooks/useDebouncedCallback.js';

const SEARCH_DEBOUNCE_MS = 300;

export interface SearchDraft {
  readonly draft: string;
  /** Typing: updates the draft at once, commits to the URL after the debounce. */
  readonly onInput: (value: string) => void;
  /** Enter: commits the draft now. */
  readonly flush: () => void;
  /** Clear filters: drops a pending commit and empties the draft. */
  readonly reset: () => void;
}

/**
 * Local draft of the search field with a 300 ms debounced commit. A router transition would
 * otherwise drop keystrokes typed while the URL write is in flight; external changes to `q`
 * (Back, Clear filters, a `?q=` link) are mirrored into the draft unless text is still pending.
 */
export function useSearchDraft(q: string, commit: (q: string) => void): SearchDraft {
  const [draft, setDraft] = useState(q);
  const pendingRef = useRef(false);
  const qRef = useRef(q);
  qRef.current = q;

  useEffect(() => {
    if (pendingRef.current) return;
    setDraft(q);
  }, [q]);

  const debounced = useDebouncedCallback((value: string) => {
    pendingRef.current = false;
    if (value !== qRef.current) commit(value);
  }, SEARCH_DEBOUNCE_MS);

  const onInput = useCallback(
    (value: string) => {
      setDraft(value);
      pendingRef.current = true;
      debounced.trigger(value);
    },
    [debounced],
  );

  const flush = useCallback(() => {
    debounced.cancel();
    pendingRef.current = false;
    if (draft !== qRef.current) commit(draft);
  }, [debounced, draft, commit]);

  const reset = useCallback(() => {
    debounced.cancel();
    pendingRef.current = false;
    setDraft('');
  }, [debounced]);

  return { draft, onInput, flush, reset };
}
