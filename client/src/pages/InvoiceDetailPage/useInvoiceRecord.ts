import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { InvoiceDetail } from '@cornerstone/shared';
import { ApiClientError } from '../../lib/apiClient.js';
import { translateApiError } from '../../lib/errorTranslation.js';
import { fetchInvoiceById } from '../../lib/invoicesApi.js';

export interface UseInvoiceRecordResult {
  readonly invoice: InvoiceDetail | null;
  readonly isLoading: boolean;
  /** Translated; null when the last load worked. */
  readonly error: string | null;
  readonly notFound: boolean;
  /** Loads again and shows the loading state. */
  readonly reload: () => Promise<void>;
  /** Silent re-fetch: keeps the page as it is; a failure falls back to `reload`. */
  readonly refresh: () => Promise<InvoiceDetail | null>;
  /** Bumps on every successful `refresh`, for panels that load their own data. */
  readonly revision: number;
}

/** The offer or invoice of the page with its money figures; only the newest request writes. */
export function useInvoiceRecord(id: string): UseInvoiceRecordResult {
  const { t } = useTranslation('budget');
  const { t: tErrors } = useTranslation('errors');
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [revision, setRevision] = useState(0);
  const latestRequestRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const reload = useCallback(async () => {
    latestRequestRef.current += 1;
    const request = latestRequestRef.current;
    setIsLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const data = await fetchInvoiceById(id);
      if (!mountedRef.current || request !== latestRequestRef.current) return;
      setInvoice(data);
    } catch (err) {
      if (!mountedRef.current || request !== latestRequestRef.current) return;
      if (err instanceof ApiClientError) {
        if (err.statusCode === 404) {
          setNotFound(true);
          setError(t('invoiceDetail.invoiceNotFound'));
        } else {
          setError(translateApiError(err.error.code, tErrors));
        }
      } else {
        setError(t('invoiceDetail.invoiceNotFound'));
      }
    } finally {
      if (mountedRef.current && request === latestRequestRef.current) setIsLoading(false);
    }
  }, [id, t, tErrors]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const refresh = useCallback(async (): Promise<InvoiceDetail | null> => {
    latestRequestRef.current += 1;
    const request = latestRequestRef.current;
    try {
      const fresh = await fetchInvoiceById(id);
      if (!mountedRef.current || request !== latestRequestRef.current) return null;
      // This request won: a reload it superseded can no longer clear the loading state.
      setInvoice(fresh);
      setIsLoading(false);
      setError(null);
      setNotFound(false);
      setRevision((value) => value + 1);
      return fresh;
    } catch {
      if (mountedRef.current && request === latestRequestRef.current) await reload();
      return null;
    }
  }, [id, reload]);

  return { invoice, isLoading, error, notFound, reload, refresh, revision };
}
