import { get, post, patch, del } from './apiClient.js';
import type {
  TradeResponse,
  TradeListResponse,
  TradeSingleResponse,
  CreateTradeRequest,
  UpdateTradeRequest,
  TradeListQuery,
} from '@cornerstone/shared';

/**
 * Fetches a list of trades with optional search.
 */
export function fetchTrades(params?: TradeListQuery): Promise<TradeListResponse> {
  const queryParams = new URLSearchParams();

  if (params?.search) {
    queryParams.set('search', params.search);
  }

  const queryString = queryParams.toString();
  const path = queryString ? `/trades?${queryString}` : '/trades';

  return get<TradeListResponse>(path);
}

/**
 * Fetches a single trade by ID.
 */
export function fetchTrade(id: string): Promise<TradeResponse> {
  return get<TradeSingleResponse>(`/trades/${id}`).then((r) => r.trade);
}

/**
 * Creates a new trade.
 */
export function createTrade(data: CreateTradeRequest): Promise<TradeResponse> {
  return post<TradeSingleResponse>('/trades', data).then((r) => r.trade);
}

/**
 * Updates an existing trade.
 */
export function updateTrade(id: string, data: UpdateTradeRequest): Promise<TradeResponse> {
  return patch<TradeSingleResponse>(`/trades/${id}`, data).then((r) => r.trade);
}

/**
 * Deletes a trade.
 * @throws {ApiClientError} with statusCode 409 if the trade is in use.
 */
export function deleteTrade(id: string): Promise<void> {
  return del<void>(`/trades/${id}`);
}
