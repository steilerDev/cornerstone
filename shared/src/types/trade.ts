/**
 * Trade types and interfaces.
 * Trades are specialties of work (e.g., Plumbing, Electrical, Carpentry).
 * Vendors are associated with trades to indicate their area of expertise.
 */

import type { PaginatedResponse } from './pagination.js';

/**
 * Trade summary shape used in vendor and work item responses.
 */
export interface TradeSummary {
  id: string;
  name: string;
  color: string | null;
}

/**
 * Trade entity as stored in the database and returned by the API.
 */
export interface TradeResponse {
  id: string;
  name: string;
  color: string | null;
  description: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Response for GET /api/trades (list of trades).
 */
export interface TradeListResponse {
  trades: TradeResponse[];
}

/**
 * Response for single trade endpoints (POST, GET by ID, PATCH).
 */
export interface TradeSingleResponse {
  trade: TradeResponse;
}

/**
 * Request body for creating a new trade.
 */
export interface CreateTradeRequest {
  name: string;
  color?: string | null;
  description?: string | null;
  sortOrder?: number;
}

/**
 * Request body for updating a trade.
 * All fields are optional; at least one must be provided.
 */
export interface UpdateTradeRequest {
  name?: string;
  color?: string | null;
  description?: string | null;
  sortOrder?: number;
}

/**
 * Query parameters for GET /api/trades (list with filtering, sorting, pagination).
 */
export interface TradeListQuery {
  search?: string;
}
