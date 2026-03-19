import { useState, useEffect } from 'react';
import type { TradeResponse, CreateTradeRequest, UpdateTradeRequest } from '@cornerstone/shared';
import { fetchTrades, createTrade, updateTrade, deleteTrade } from '../lib/tradesApi.js';
import { ApiClientError, NetworkError } from '../lib/apiClient.js';

export interface UseTradesResult {
  trades: TradeResponse[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  createTrade: (data: CreateTradeRequest) => Promise<TradeResponse | null>;
  updateTrade: (id: string, data: UpdateTradeRequest) => Promise<TradeResponse | null>;
  deleteTrade: (id: string) => Promise<boolean>;
}

/**
 * Manages the full CRUD lifecycle for trades.
 * Returns loading, error, and data states following the project's hook conventions.
 * Mutation methods refetch the list after success.
 */
export function useTrades(): UseTradesResult {
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
            setError(err.error.message ?? 'Failed to load trades.');
          } else if (err instanceof NetworkError) {
            setError('Network error: Unable to connect to the server.');
          } else {
            setError('An unexpected error occurred while loading trades.');
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
  }, [fetchCount]);

  function refetch() {
    setFetchCount((c) => c + 1);
  }

  async function handleCreate(data: CreateTradeRequest): Promise<TradeResponse | null> {
    try {
      const trade = await createTrade(data);
      refetch();
      return trade;
    } catch {
      return null;
    }
  }

  async function handleUpdate(
    id: string,
    data: UpdateTradeRequest,
  ): Promise<TradeResponse | null> {
    try {
      const trade = await updateTrade(id, data);
      refetch();
      return trade;
    } catch {
      return null;
    }
  }

  async function handleDelete(id: string): Promise<boolean> {
    try {
      await deleteTrade(id);
      refetch();
      return true;
    } catch {
      return false;
    }
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
