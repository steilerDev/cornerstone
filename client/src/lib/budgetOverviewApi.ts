import { get } from './apiClient.js';
import type {
  BudgetOverview,
  BudgetOverviewResponse,
  BudgetBreakdown,
  BudgetBreakdownResponse,
} from '@cornerstone/shared';

/**
 * Fetches the aggregated budget overview for the project.
 */
export async function fetchBudgetOverview(): Promise<BudgetOverview> {
  const response = await get<BudgetOverviewResponse>('/budget/overview');
  return response.overview;
}

/**
 * Fetches the itemized budget breakdown with all nested work items, categories, and budget lines.
 * Used for the expandable cost breakdown table on the budget dashboard.
 */
export async function fetchBudgetBreakdown(): Promise<BudgetBreakdown> {
  const response = await get<BudgetBreakdownResponse>('/budget/breakdown');
  return response.breakdown;
}
