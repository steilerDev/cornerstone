import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiClientError, NetworkError } from '../lib/apiClient.js';
import { translateApiError } from '../lib/errorTranslation.js';

/** The state a list's delete ConfirmDialog renders. */
export interface ListRowDeletion<T> {
  readonly item: T | null;
  readonly busy: boolean;
  readonly error: string | null;
  /** The server refused with 409: the dialog shows its blocked state. */
  readonly blocked: boolean;
  readonly confirm: () => void;
  readonly cancel: () => void;
}

export interface UseListRowDeleteOptions<T> {
  readonly remove: (item: T) => Promise<unknown>;
  readonly onDeleted: (item: T) => void;
  /** Replaces the translated API error on a 409 (Companies' "still referenced" text). */
  readonly blockedMessage?: string;
}

/**
 * Row delete for an object list: request opens the confirmation, confirm runs `remove`, a 409
 * keeps the dialog open in its blocked state. Only translated text is ever exposed.
 */
export function useListRowDelete<T>(opts: UseListRowDeleteOptions<T>): {
  readonly request: (item: T) => void;
  readonly deletion: ListRowDeletion<T>;
} {
  const { t: tCommon } = useTranslation('common');
  const { t: tErrors } = useTranslation('errors');
  const optsRef = useRef(opts);
  useEffect(() => {
    optsRef.current = opts;
  });

  const [item, setItem] = useState<T | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);

  const request = useCallback((next: T) => {
    setItem(next);
    setError(null);
    setBlocked(false);
  }, []);

  const cancel = useCallback(() => {
    if (busy) return;
    setItem(null);
    setError(null);
  }, [busy]);

  const confirm = useCallback(() => {
    if (item === null || busy) return;
    const target = item;
    setBusy(true);
    setError(null);
    void optsRef.current
      .remove(target)
      .then(() => {
        setItem(null);
        optsRef.current.onDeleted(target);
      })
      .catch((err: unknown) => {
        if (err instanceof ApiClientError) {
          const isBlocked = err.statusCode === 409;
          setBlocked(isBlocked);
          setError(
            isBlocked && optsRef.current.blockedMessage !== undefined
              ? optsRef.current.blockedMessage
              : translateApiError(err.error.code, tErrors),
          );
        } else if (err instanceof NetworkError) {
          setError(tCommon('requestErrors.network'));
        } else {
          setError(tCommon('requestErrors.unexpected'));
        }
      })
      .finally(() => setBusy(false));
  }, [item, busy, tErrors, tCommon]);

  const deletion = useMemo(
    (): ListRowDeletion<T> => ({ item, busy, error, blocked, confirm, cancel }),
    [item, busy, error, blocked, confirm, cancel],
  );

  return { request, deletion };
}
