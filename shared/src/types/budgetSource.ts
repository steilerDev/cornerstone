/**
 * Budget source types and interfaces.
 * Budget sources represent financing sources for the construction project
 * (e.g., bank loans, credit lines, savings).
 */

import type { UserSummary } from './workItem.js';

/**
 * The type/category of a financing source.
 */
export type BudgetSourceType = 'bank_loan' | 'credit_line' | 'savings' | 'other';

/**
 * The current lifecycle status of a budget source.
 */
export type BudgetSourceStatus = 'active' | 'exhausted' | 'closed';

/**
 * Budget source entity as returned by the API.
 * usedAmount and availableAmount are computed from work item references.
 */
export interface BudgetSource {
  id: string;
  name: string;
  sourceType: BudgetSourceType;
  totalAmount: number;
  usedAmount: number;
  availableAmount: number;
  interestRate: number | null;
  terms: string | null;
  notes: string | null;
  status: BudgetSourceStatus;
  createdBy: UserSummary | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Request body for creating a new budget source.
 */
export interface CreateBudgetSourceRequest {
  name: string;
  sourceType: BudgetSourceType;
  totalAmount: number;
  interestRate?: number | null;
  terms?: string | null;
  notes?: string | null;
  status?: BudgetSourceStatus;
}

/**
 * Request body for updating a budget source.
 * All fields are optional; at least one must be provided.
 */
export interface UpdateBudgetSourceRequest {
  name?: string;
  sourceType?: BudgetSourceType;
  totalAmount?: number;
  interestRate?: number | null;
  terms?: string | null;
  notes?: string | null;
  status?: BudgetSourceStatus;
}

/**
 * Response for GET /api/budget-sources - list all sources.
 */
export interface BudgetSourceListResponse {
  budgetSources: BudgetSource[];
}

/**
 * Response for single-source endpoints (POST, GET by ID, PATCH).
 */
export interface BudgetSourceResponse {
  budgetSource: BudgetSource;
}
