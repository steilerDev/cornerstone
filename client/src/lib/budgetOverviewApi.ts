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
  const response = await fetchBudgetOverviewResponse();
  return response.overview;
}

/**
 * Fetches the full budget overview response: the overview plus the money summary
 * (`money.leftToSpend` is the one Left to spend figure).
 */
export async function fetchBudgetOverviewResponse(): Promise<BudgetOverviewResponse> {
  return get<BudgetOverviewResponse>('/budget/overview');
}

/**
 * Fetches the itemized budget breakdown with all nested work items, categories, and budget lines.
 * Pass deselectedSources to apply server-side source filtering.
 */
export async function fetchBudgetBreakdown(deselectedSources?: string[]): Promise<BudgetBreakdown> {
  const path =
    deselectedSources && deselectedSources.length > 0
      ? `/budget/breakdown?deselectedSources=${encodeURIComponent(deselectedSources.join(','))}`
      : '/budget/breakdown';
  const response = await get<BudgetBreakdownResponse>(path);
  return response.breakdown;
}
