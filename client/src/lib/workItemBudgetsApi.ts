import { createBudgetApi } from './budgetApiFactory.js';
import type {
  WorkItemBudgetLine,
  CreateWorkItemBudgetRequest,
  UpdateWorkItemBudgetRequest,
} from '@cornerstone/shared';

// Create the typed API using the factory
const api = createBudgetApi<WorkItemBudgetLine>('work-items');

/**
 * Fetches all budget lines for a given work item.
 */
export function fetchWorkItemBudgets(workItemId: string): Promise<WorkItemBudgetLine[]> {
  return api.fetchBudgets(workItemId);
}

/**
 * Creates a new budget line for a work item.
 */
export function createWorkItemBudget(
  workItemId: string,
  data: CreateWorkItemBudgetRequest,
): Promise<WorkItemBudgetLine> {
  return api.createBudget(workItemId, data);
}

/**
 * Updates an existing budget line for a work item.
 */
export function updateWorkItemBudget(
  workItemId: string,
  budgetId: string,
  data: UpdateWorkItemBudgetRequest,
): Promise<WorkItemBudgetLine> {
  return api.updateBudget(workItemId, budgetId, data);
}

/**
 * Deletes a budget line for a work item.
 */
export function deleteWorkItemBudget(workItemId: string, budgetId: string): Promise<void> {
  return api.deleteBudget(workItemId, budgetId);
}
