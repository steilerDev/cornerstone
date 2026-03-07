import { get, post, patch, del } from './apiClient.js';
import type {
  HouseholdItemBudgetLine,
  CreateHouseholdItemBudgetRequest,
  UpdateHouseholdItemBudgetRequest,
} from '@cornerstone/shared';

/**
 * Fetches all budget lines for a given household item.
 */
export function fetchHouseholdItemBudgets(
  householdItemId: string,
): Promise<HouseholdItemBudgetLine[]> {
  return get<{ budgets: HouseholdItemBudgetLine[] }>(
    `/household-items/${householdItemId}/budgets`,
  ).then((r) => r.budgets);
}

/**
 * Creates a new budget line for a household item.
 */
export function createHouseholdItemBudget(
  householdItemId: string,
  data: CreateHouseholdItemBudgetRequest,
): Promise<HouseholdItemBudgetLine> {
  return post<{ budget: HouseholdItemBudgetLine }>(
    `/household-items/${householdItemId}/budgets`,
    data,
  ).then((r) => r.budget);
}

/**
 * Updates an existing budget line for a household item.
 */
export function updateHouseholdItemBudget(
  householdItemId: string,
  budgetId: string,
  data: UpdateHouseholdItemBudgetRequest,
): Promise<HouseholdItemBudgetLine> {
  return patch<{ budget: HouseholdItemBudgetLine }>(
    `/household-items/${householdItemId}/budgets/${budgetId}`,
    data,
  ).then((r) => r.budget);
}

/**
 * Deletes a budget line for a household item.
 */
export function deleteHouseholdItemBudget(
  householdItemId: string,
  budgetId: string,
): Promise<void> {
  return del<void>(`/household-items/${householdItemId}/budgets/${budgetId}`);
}
