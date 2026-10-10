import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import type { TradeResponse, CreateTradeRequest, UpdateTradeRequest } from '@cornerstone/shared';
import { fetchTrades, createTrade, updateTrade, deleteTrade } from '../lib/tradesApi.js';
import { ApiClientError, NetworkError } from '../lib/apiClient.js';
import { translateApiError } from '../lib/errorTranslation.js';

export interface UseTradesResult {
  trades: TradeResponse[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  createTrade: (data: CreateTradeRequest) => Promise<TradeResponse>;
  updateTrade: (id: string, data: UpdateTradeRequest) => Promise<TradeResponse>;
  deleteTrade: (id: string) => Promise<void>;
}

/**
 * Manages the full CRUD lifecycle for trades.
 * Returns loading, error, and data states following the project's hook conventions.
 * Mutation methods refetch the list after success and throw ApiClientError on failure.
 */
export function useTrades(): UseTradesResult {
  const { t } = useTranslation('settings');
  const { t: tErrors } = useTranslation('errors');
  const { t: tCommon } = useTranslation('common');
  const [trades, setTrades] = useState<TradeResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchCount, setFetchCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      setIsLoading(true);
      setError(null);

      try {
        const data = await fetchTrades();
        if (!cancelled) {
          setTrades(data.trades);
        }
      } catch (err) {
        if (!cancelled) {
          if (err instanceof ApiClientError) {
            setError(translateApiError(err.error.code, tErrors));
          } else if (err instanceof NetworkError) {
            setError(tCommon('requestErrors.network'));
          } else {
            setError(t('manage.trades.loadError'));
          }
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void fetchData();

    return () => {
      cancelled = true;
    };
  }, [fetchCount, t, tErrors, tCommon]);

  function refetch() {
    setFetchCount((c) => c + 1);
  }

  async function handleCreate(data: CreateTradeRequest): Promise<TradeResponse> {
    const trade = await createTrade(data);
    refetch();
    return trade;
  }

  async function handleUpdate(id: string, data: UpdateTradeRequest): Promise<TradeResponse> {
    const trade = await updateTrade(id, data);
    refetch();
    return trade;
  }

  async function handleDelete(id: string): Promise<void> {
    await deleteTrade(id);
    refetch();
  }

  return {
    trades,
    isLoading,
    error,
    refetch,
    createTrade: handleCreate,
    updateTrade: handleUpdate,
    deleteTrade: handleDelete,
  };
}
