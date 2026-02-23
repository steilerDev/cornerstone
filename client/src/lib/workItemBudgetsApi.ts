import { get, post, patch, del } from './apiClient.js';
import type {
  WorkItemBudgetLine,
  CreateWorkItemBudgetRequest,
  UpdateWorkItemBudgetRequest,
} from '@cornerstone/shared';

/**
 * Fetches all budget lines for a given work item.
 */
export function fetchWorkItemBudgets(workItemId: string): Promise<WorkItemBudgetLine[]> {
  return get<{ budgets: WorkItemBudgetLine[] }>(`/work-items/${workItemId}/budgets`).then(
    (r) => r.budgets,
  );
}

/**
 * Creates a new budget line for a work item.
 */
export function createWorkItemBudget(
  workItemId: string,
  data: CreateWorkItemBudgetRequest,
): Promise<WorkItemBudgetLine> {
  return post<{ budget: WorkItemBudgetLine }>(`/work-items/${workItemId}/budgets`, data).then(
    (r) => r.budget,
  );
}

/**
 * Updates an existing budget line for a work item.
 */
export function updateWorkItemBudget(
  workItemId: string,
  budgetId: string,
  data: UpdateWorkItemBudgetRequest,
): Promise<WorkItemBudgetLine> {
  return patch<{ budget: WorkItemBudgetLine }>(
    `/work-items/${workItemId}/budgets/${budgetId}`,
    data,
  ).then((r) => r.budget);
}

/**
 * Deletes a budget line for a work item.
 */
export function deleteWorkItemBudget(workItemId: string, budgetId: string): Promise<void> {
  return del<void>(`/work-items/${workItemId}/budgets/${budgetId}`);
}
