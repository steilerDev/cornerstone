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
 * Calculate the expected subsidy payback of a single work item.
 *
 * Values come from the money service (ADR-039, #2228), the one grant engine:
 *   - Every non-rejected grant linked to the item is listed; only Approved/Received grants
 *     are `counted` and included in the totals.
 *   - Each entry carries the share in three scenarios: `expectedPayback` (expected costs),
 *     `minPayback` (best scenario) and `maxPayback` (worst scenario). The names denote
 *     scenarios, not an ordering: for a capped grant `minPayback` can exceed `maxPayback`.
 *   - Percentage grants apply to the eligible lines of the linked items (category filter), are
 *     capped by the grant's eligible-costs cap and split pro rata over the lines.
 *   - Lines linked to an invoice record use the itemized amount at face value; other lines
 *     use the confidence margins.
 *
 * @param vatRate - Configured VAT rate (config.vatRate)
 * @throws NotFoundError if work item does not exist
 */
export function getWorkItemSubsidyPayback(
  db: DbType,
  workItemId: string,
  vatRate: number,
): WorkItemSubsidyPaybackResponse {
  return getPayback(db, workItemId, vatRate) as WorkItemSubsidyPaybackResponse;
}
