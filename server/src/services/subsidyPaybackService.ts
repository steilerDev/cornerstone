import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import { createSubsidyPaybackService } from './shared/subsidyPaybackServiceFactory.js';
import type { WorkItemSubsidyPaybackResponse } from '@cornerstone/shared';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

const getPayback = createSubsidyPaybackService({
  entityTable: 'work_items',
  junctionTable: 'work_item_subsidies',
  junctionAlias: 'wis',
  junctionEntityIdColumn: 'work_item_id',
  budgetLinesTable: 'work_item_budgets',
  budgetLinesEntityIdColumn: 'work_item_id',
  supportsInvoices: true,
  entityLabel: 'Work item',
  entityIdResponseKey: 'workItemId',
});

/**
 * Calculate the expected subsidy payback range for a single work item.
 *
 * Rules:
 *   - Only non-rejected subsidies linked to this work item are included.
 *   - For percentage subsidies: iterate over matching budget lines and compute
 *     min/max amounts using confidence margins.
 *     * If a line HAS invoices: actual cost is known → min = max = actualCost
 *     * If a line has NO invoices: apply confidence margin to plannedAmount:
 *         minAmount = plannedAmount * (1 - margin)
 *         maxAmount = plannedAmount * (1 + margin)
 *     Payback range per line = [minAmount * rate/100, maxAmount * rate/100]
 *     Sum across all matching lines per subsidy, then across subsidies.
 *   - For fixed subsidies: amount is fixed regardless of budget lines →
 *     minPayback = maxPayback = reductionValue
 *   - Universal subsidies (no applicable categories) match ALL budget lines.
 *
 * @throws NotFoundError if work item does not exist
 */
export function getWorkItemSubsidyPayback(
  db: DbType,
  workItemId: string,
): WorkItemSubsidyPaybackResponse {
  return getPayback(db, workItemId) as WorkItemSubsidyPaybackResponse;
}
