import { post } from './apiClient.js';
import type {
  BatchCreateBudgetLinesRequest,
  BatchCreateBudgetLinesResponse,
} from '@cornerstone/shared';

/**
 * Creates (and, with `invoiceId`, links) up to 200 cost lines in one transaction
 * (POST /api/budget-lines/batch). Either every line is saved or none.
 */
export function createBudgetLinesBatch(
  body: BatchCreateBudgetLinesRequest,
): Promise<BatchCreateBudgetLinesResponse> {
  return post<BatchCreateBudgetLinesResponse>('/budget-lines/batch', body);
}
