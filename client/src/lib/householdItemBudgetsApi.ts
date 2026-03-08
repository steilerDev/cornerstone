import { createBudgetApi } from './budgetApiFactory.js';
import type {
  HouseholdItemBudgetLine,
  CreateHouseholdItemBudgetRequest,
  UpdateHouseholdItemBudgetRequest,
} from '@cornerstone/shared';

// Create the typed API using the factory
const api = createBudgetApi<HouseholdItemBudgetLine>('household-items');

/**
 * Fetches all budget lines for a given household item.
 */
export function fetchHouseholdItemBudgets(
  householdItemId: string,
): Promise<HouseholdItemBudgetLine[]> {
  return api.fetchBudgets(householdItemId);
}

/**
 * Creates a new budget line for a household item.
 */
export function createHouseholdItemBudget(
  householdItemId: string,
  data: CreateHouseholdItemBudgetRequest,
): Promise<HouseholdItemBudgetLine> {
  return api.createBudget(householdItemId, data);
}

/**
 * Updates an existing budget line for a household item.
 */
export function updateHouseholdItemBudget(
  householdItemId: string,
  budgetId: string,
  data: UpdateHouseholdItemBudgetRequest,
): Promise<HouseholdItemBudgetLine> {
  return api.updateBudget(householdItemId, budgetId, data);
}

/**
 * Deletes a budget line for a household item.
 */
export function deleteHouseholdItemBudget(
  householdItemId: string,
  budgetId: string,
): Promise<void> {
  return api.deleteBudget(householdItemId, budgetId);
}
