import { get, post, patch, del } from './apiClient.js';
import type {
  CreateBudgetLineRequest,
  UpdateBudgetLineRequest,
  BaseBudgetLine,
} from '@cornerstone/shared';

/**
 * Generic budget CRUD operations parameterized by entity type.
 * Used by both work items and household items.
 */
export interface BudgetApi<T extends BaseBudgetLine> {
  fetchBudgets(entityId: string): Promise<T[]>;
  createBudget(entityId: string, data: CreateBudgetLineRequest): Promise<T>;
  updateBudget(entityId: string, budgetId: string, data: UpdateBudgetLineRequest): Promise<T>;
  deleteBudget(entityId: string, budgetId: string): Promise<void>;
}

/**
 * Factory function that creates a typed budget API for any entity.
 * @param entityPrefix - The API path prefix (e.g., 'work-items', 'household-items')
 * @returns A BudgetApi instance with CRUD operations for that entity type
 */
export function createBudgetApi<T extends BaseBudgetLine>(entityPrefix: string): BudgetApi<T> {
  return {
    async fetchBudgets(entityId: string): Promise<T[]> {
      const response = await get<{ budgets: T[] }>(`/${entityPrefix}/${entityId}/budgets`);
      return response.budgets;
    },

    async createBudget(entityId: string, data: CreateBudgetLineRequest): Promise<T> {
      const response = await post<{ budget: T }>(`/${entityPrefix}/${entityId}/budgets`, data);
      return response.budget;
    },

    async updateBudget(
      entityId: string,
      budgetId: string,
      data: UpdateBudgetLineRequest,
    ): Promise<T> {
      const response = await patch<{ budget: T }>(
        `/${entityPrefix}/${entityId}/budgets/${budgetId}`,
        data,
      );
      return response.budget;
    },

    async deleteBudget(entityId: string, budgetId: string): Promise<void> {
      await del<void>(`/${entityPrefix}/${entityId}/budgets/${budgetId}`);
    },
  };
}
