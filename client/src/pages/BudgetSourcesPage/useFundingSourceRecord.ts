import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  BudgetSourceBudgetLinesResponse,
  BudgetSourceDetailResponse,
} from '@cornerstone/shared';
import { fetchBudgetLinesForSource, fetchBudgetSource } from '../../lib/budgetSourcesApi.js';
import { fetchFailureMessage, toFetchFailure } from '../../lib/fetchFailure.js';
import type { FetchFailure } from '../../lib/fetchFailure.js';

export interface UseFundingSourceRecordResult {
  readonly record: BudgetSourceDetailResponse | null;
  readonly isLoading: boolean;
  /** Translated; null when the last load worked. */
  readonly error: string | null;
  readonly notFound: boolean;
  /** Loads again and shows the loading state. */
  readonly reload: () => Promise<void>;
  /** Silent re-fetch: keeps the page as it is; a failure falls back to `reload`. */
  readonly refresh: () => Promise<BudgetSourceDetailResponse | null>;
  /** Bumps on every successful `refresh`, for panels that load their own data. */
  readonly revision: number;
}

/** The funding source of the page with the money service's figures; only the newest request writes. */
export function useFundingSourceRecord(id: string): UseFundingSourceRecordResult {
  const { t } = useTranslation('budget');
  const { t: tErrors } = useTranslation('errors');
  const [record, setRecord] = useState<BudgetSourceDetailResponse | null>(null);
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
      const data = await fetchBudgetSource(id);
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

  const refresh = useCallback(async (): Promise<BudgetSourceDetailResponse | null> => {
    latestRequestRef.current += 1;
    const request = latestRequestRef.current;
    try {
      const fresh = await fetchBudgetSource(id);
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
          t('financing.sourcePage.loadError'),
          t('financing.sourcePage.notFound'),
        );

  return { record, isLoading, error, notFound, reload, refresh, revision };
}

export interface UseSourceBudgetLinesResult {
  readonly data: BudgetSourceBudgetLinesResponse | null;
  readonly isLoading: boolean;
  readonly error: string | null;
  /** Loads the lines again (Retry, after a move) and shows the loading state. */
  readonly reload: () => void;
}

/** The cost lines of the source, for the Cost tab and its count. */
export function useSourceBudgetLines(id: string): UseSourceBudgetLinesResult {
  const { t } = useTranslation('budget');
  const { t: tErrors } = useTranslation('errors');
  const [data, setData] = useState<BudgetSourceBudgetLinesResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [failure, setFailure] = useState<FetchFailure | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchBudgetLinesForSource(id)
      .then((response) => {
        if (cancelled) return;
        setData(response);
        setFailure(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setFailure(toFetchFailure(err));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, attempt]);

  const reload = useCallback(() => {
    setIsLoading(true);
    setFailure(null);
    setAttempt((value) => value + 1);
  }, []);

  const error =
    failure === null
      ? null
      : fetchFailureMessage(failure, tErrors, t('financing.sourcePage.loadError'));

  return { data, isLoading, error, reload };
}
