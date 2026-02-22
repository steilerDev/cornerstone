import { get, post, patch, del } from './apiClient.js';
import type {
  BudgetSource,
  BudgetSourceListResponse,
  BudgetSourceResponse,
  CreateBudgetSourceRequest,
  UpdateBudgetSourceRequest,
} from '@cornerstone/shared';

/**
 * Fetches all budget sources.
 */
export function fetchBudgetSources(): Promise<BudgetSourceListResponse> {
  return get<BudgetSourceListResponse>('/budget-sources');
}

/**
 * Fetches a single budget source by ID.
 */
export function fetchBudgetSource(id: string): Promise<BudgetSourceResponse> {
  return get<BudgetSourceResponse>(`/budget-sources/${id}`);
}

/**
 * Creates a new budget source.
 */
export async function createBudgetSource(data: CreateBudgetSourceRequest): Promise<BudgetSource> {
  const response = await post<BudgetSourceResponse>('/budget-sources', data);
  return response.budgetSource;
}

/**
 * Updates an existing budget source.
 */
export async function updateBudgetSource(
  id: string,
  data: UpdateBudgetSourceRequest,
): Promise<BudgetSource> {
  const response = await patch<BudgetSourceResponse>(`/budget-sources/${id}`, data);
  return response.budgetSource;
}

/**
 * Deletes a budget source.
 * @throws {ApiClientError} with statusCode 409 if the source is in use.
 */
export function deleteBudgetSource(id: string): Promise<void> {
  return del<void>(`/budget-sources/${id}`);
}
