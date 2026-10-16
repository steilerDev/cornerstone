import { get, post, patch, del } from './apiClient.js';
import type {
  BudgetCategory,
  BudgetCategoryListResponse,
  BudgetCategoryResponse,
  CreateBudgetCategoryRequest,
  UpdateBudgetCategoryRequest,
  ReorderReferenceListRequest,
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
export async function createBudgetCategory(
  data: CreateBudgetCategoryRequest,
): Promise<BudgetCategory> {
  const response = await post<BudgetCategoryResponse>('/budget-categories', data);
  return response.budgetCategory;
}

/**
 * Updates an existing budget category.
 */
export async function updateBudgetCategory(
  id: string,
  data: UpdateBudgetCategoryRequest,
): Promise<BudgetCategory> {
  const response = await patch<BudgetCategoryResponse>(`/budget-categories/${id}`, data);
  return response.budgetCategory;
}

/**
 * Deletes a budget category.
 * @throws {ApiClientError} with statusCode 409 if the category is in use.
 */
export function deleteBudgetCategory(id: string): Promise<void> {
  return del<void>(`/budget-categories/${id}`);
}

/**
 * Atomically reorders the whole list: `ids` is every category id exactly once, in the new order.
 * @throws {ApiClientError} with code REORDER_SET_MISMATCH (409) when the set of ids is stale.
 */
export async function reorderBudgetCategories(ids: string[]): Promise<BudgetCategory[]> {
  const body: ReorderReferenceListRequest = { ids };
  const response = await patch<BudgetCategoryListResponse>('/budget-categories/reorder', body);
  return response.categories;
}
