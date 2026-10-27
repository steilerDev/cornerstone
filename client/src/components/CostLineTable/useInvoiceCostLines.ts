import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { BudgetSource, InvoiceBudgetLineDetailResponse } from '@cornerstone/shared';
import { ApiClientError } from '../../lib/apiClient.js';
import { fetchBudgetSources } from '../../lib/budgetSourcesApi.js';
import { translateApiError } from '../../lib/errorTranslation.js';
import { fetchInvoiceBudgetLines } from '../../lib/invoiceBudgetLinesApi.js';

export interface UseInvoiceCostLinesResult {
  readonly lines: readonly InvoiceBudgetLineDetailResponse[];
  /** Offer or invoice amount minus the itemized amounts of its lines. */
  readonly remainingAmount: number;
  /** Funding source id to name, for the facts line. */
  readonly sources: ReadonlyMap<string, string>;
  /** The fetched funding sources (the Map above is derived from them). */
  readonly budgetSources: readonly BudgetSource[];
  readonly loading: boolean;
  /** Translated; null when the last load worked. */
  readonly error: string | null;
  /** Reloads the lines. Resolves when the response (or its failure) has been applied. */
  readonly reload: () => Promise<void>;
}

const NO_LINES: readonly InvoiceBudgetLineDetailResponse[] = [];
const NO_SOURCES: readonly BudgetSource[] = [];

/** The cost lines of an offer or invoice (document host) with its funding source names. */
export function useInvoiceCostLines(invoiceId: string): UseInvoiceCostLinesResult {
  const { t } = useTranslation('costLines');
  const { t: tErrors } = useTranslation('errors');
  const [lines, setLines] = useState<readonly InvoiceBudgetLineDetailResponse[]>(NO_LINES);
  const [remainingAmount, setRemainingAmount] = useState(0);
  const [budgetSources, setBudgetSources] = useState<readonly BudgetSource[]>(NO_SOURCES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Only the newest request may write state (a slow older response must not overwrite it).
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
    try {
      const response = await fetchInvoiceBudgetLines(invoiceId);
      if (!mountedRef.current || request !== latestRequestRef.current) return;
      setLines(response.budgetLines);
      setRemainingAmount(response.remainingAmount);
      setError(null);
    } catch (err) {
      if (!mountedRef.current || request !== latestRequestRef.current) return;
      setError(
        err instanceof ApiClientError
          ? translateApiError(err.error.code, tErrors)
          : t('section.loadError'),
      );
    } finally {
      if (mountedRef.current && request === latestRequestRef.current) setLoading(false);
    }
  }, [invoiceId, t, tErrors]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    let cancelled = false;
    fetchBudgetSources()
      .then((response) => {
        if (cancelled) return;
        setBudgetSources(response.budgetSources);
      })
      .catch(() => {
        // The facts line just omits the funding source name.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const sources = useMemo<ReadonlyMap<string, string>>(
    () => new Map(budgetSources.map((source) => [source.id, source.name])),
    [budgetSources],
  );

  return { lines, remainingAmount, sources, budgetSources, loading, error, reload };
}
