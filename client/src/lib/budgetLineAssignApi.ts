import { post } from './apiClient.js';
import type {
  BudgetLineAssignRequest,
  BudgetLineAssignResponse,
} from '@cornerstone/shared';

/**
 * Assigns an unassigned (orphan) budget line to a work item or household item.
 */
export function assignBudgetLine(
  id: string,
  body: BudgetLineAssignRequest,
): Promise<BudgetLineAssignResponse> {
  return post<BudgetLineAssignResponse>(`/budget-lines/${encodeURIComponent(id)}/assign`, body);
}
