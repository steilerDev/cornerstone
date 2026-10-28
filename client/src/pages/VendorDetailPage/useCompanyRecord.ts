import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { VendorDetail } from '@cornerstone/shared';
import { fetchVendor } from '../../lib/vendorsApi.js';
import { fetchFailureMessage, toFetchFailure } from '../../lib/fetchFailure.js';
import type { FetchFailure } from '../../lib/fetchFailure.js';

export interface UseCompanyRecordResult {
  readonly record: VendorDetail | null;
  readonly isLoading: boolean;
  /** Translated; null when the last load worked. */
  readonly error: string | null;
  readonly notFound: boolean;
  /** Loads again and shows the loading state. */
  readonly reload: () => Promise<void>;
  /** Silent re-fetch: keeps the page as it is; a failure falls back to `reload`. */
  readonly refresh: () => Promise<VendorDetail | null>;
  /** Bumps on every successful `refresh`, for panels that load their own data. */
  readonly revision: number;
}

/** The company of the page with its money figures; only the newest request writes. */
export function useCompanyRecord(id: string): UseCompanyRecordResult {
  const { t } = useTranslation('budget');
  const { t: tErrors } = useTranslation('errors');
  const [record, setRecord] = useState<VendorDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [failure, setFailure] = useState<FetchFailure | null>(null);
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
    setFailure(null);
    try {
      const data = await fetchVendor(id);
      if (!mountedRef.current || request !== latestRequestRef.current) return;
      setRecord(data);
    } catch (err) {
      if (!mountedRef.current || request !== latestRequestRef.current) return;
      setFailure(toFetchFailure(err));
    } finally {
      if (mountedRef.current && request === latestRequestRef.current) setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const refresh = useCallback(async (): Promise<VendorDetail | null> => {
    latestRequestRef.current += 1;
    const request = latestRequestRef.current;
    try {
      const fresh = await fetchVendor(id);
      if (!mountedRef.current || request !== latestRequestRef.current) return null;
      setRecord(fresh);
      setIsLoading(false);
      setFailure(null);
      setRevision((value) => value + 1);
      return fresh;
    } catch {
      if (mountedRef.current && request === latestRequestRef.current) await reload();
      return null;
    }
  }, [id, reload]);

  const notFound = failure?.kind === 'api' && failure.notFound;
  const error =
    failure === null
      ? null
      : fetchFailureMessage(
          failure,
          tErrors,
          t('companyPage.loadError'),
          t('companyPage.notFound'),
        );

  return { record, isLoading, error, notFound, reload, refresh, revision };
}
