import { get } from './apiClient.js';
import type { BudgetOverview, BudgetOverviewResponse } from '@cornerstone/shared';

/**
 * Fetches the aggregated budget overview for the project.
 */
export async function fetchBudgetOverview(): Promise<BudgetOverview> {
  const response = await get<BudgetOverviewResponse>('/budget/overview');
  return response.overview;
}
