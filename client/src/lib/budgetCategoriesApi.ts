import { get, post, patch, del } from './apiClient.js';
import type {
  BudgetCategory,
  BudgetCategoryListResponse,
  CreateBudgetCategoryRequest,
  UpdateBudgetCategoryRequest,
} from '@cornerstone/shared';

/**
 * Fetches all budget categories, sorted by sort order.
 */
export function fetchBudgetCategories(): Promise<BudgetCategoryListResponse> {
  return get<BudgetCategoryListResponse>('/budget-categories');
}

/**
 * Creates a new budget category.
 */
export function createBudgetCategory(data: CreateBudgetCategoryRequest): Promise<BudgetCategory> {
  return post<BudgetCategory>('/budget-categories', data);
}

/**
 * Updates an existing budget category.
 */
export function updateBudgetCategory(
  id: string,
  data: UpdateBudgetCategoryRequest,
): Promise<BudgetCategory> {
  return patch<BudgetCategory>(`/budget-categories/${id}`, data);
}

/**
 * Deletes a budget category.
 * @throws {ApiClientError} with statusCode 409 if the category is in use.
 */
export function deleteBudgetCategory(id: string): Promise<void> {
  return del<void>(`/budget-categories/${id}`);
}
