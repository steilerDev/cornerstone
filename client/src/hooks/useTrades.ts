import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import type {
  TradeResponse,
  TradeListItem,
  TradeMergeResponse,
  CreateTradeRequest,
  UpdateTradeRequest,
} from '@cornerstone/shared';
import {
  fetchTrades,
  createTrade,
  updateTrade,
  deleteTrade,
  mergeTrade,
} from '../lib/tradesApi.js';
import { ApiClientError, NetworkError } from '../lib/apiClient.js';
import { translateApiError } from '../lib/errorTranslation.js';

export interface UseTradesResult {
  trades: TradeListItem[];
  /** True on every fetch, including refetches. */
  isLoading: boolean;
  /** True only until the first response (success or failure) arrives; refetches keep the list mounted. */
  isInitialLoading: boolean;
  error: string | null;
  refetch: () => void;
  createTrade: (data: CreateTradeRequest) => Promise<TradeResponse>;
  updateTrade: (id: string, data: UpdateTradeRequest) => Promise<TradeResponse>;
  deleteTrade: (id: string) => Promise<void>;
  mergeTrade: (id: string, targetTradeId: string) => Promise<TradeMergeResponse>;
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
  const [trades, setTrades] = useState<TradeListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
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
          setIsInitialLoading(false);
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

  async function handleMerge(id: string, targetTradeId: string): Promise<TradeMergeResponse> {
    const result = await mergeTrade(id, targetTradeId);
    refetch();
    return result;
  }

  return {
    trades,
    isLoading,
    isInitialLoading,
    error,
    refetch,
    createTrade: handleCreate,
    updateTrade: handleUpdate,
    deleteTrade: handleDelete,
    mergeTrade: handleMerge,
  };
}
