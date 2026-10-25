import { get } from './apiClient.js';
import type {
  BudgetOverview,
  BudgetOverviewResponse,
  BudgetBreakdown,
  BudgetBreakdownResponse,
} from '@cornerstone/shared';

/**
 * Fetches the overview (the grant-derived `subsidySummary`) for the project.
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
 * Fetches the breakdown (every view down to cost lines, with Paid and Still to pay per row).
 * Pass deselectedSources (ids, plus `unassigned`) to apply server-side source filtering; payment
 * basis, estimate, grants and view are selected client-side from the one response.
 */
export async function fetchBudgetBreakdown(
  deselectedSources?: readonly string[],
): Promise<BudgetBreakdown> {
  const path =
    deselectedSources && deselectedSources.length > 0
      ? `/budget/breakdown?deselectedSources=${encodeURIComponent(deselectedSources.join(','))}`
      : '/budget/breakdown';
  const response = await get<BudgetBreakdownResponse>(path);
  return response.breakdown;
}
