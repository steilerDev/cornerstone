import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import { createSubsidyPaybackService } from './shared/subsidyPaybackServiceFactory.js';
import type { HouseholdItemSubsidyPaybackResponse } from '@cornerstone/shared';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

const getPayback = createSubsidyPaybackService({
  entityTable: 'household_items',
  junctionTable: 'household_item_subsidies',
  junctionAlias: 'his',
  junctionEntityIdColumn: 'household_item_id',
  budgetLinesTable: 'household_item_budgets',
  budgetLinesEntityIdColumn: 'household_item_id',
  supportsInvoices: false,
  entityLabel: 'Household item',
  entityIdResponseKey: 'householdItemId',
});

/**
 * Calculate the expected subsidy payback range for a single household item.
 *
 * Rules:
 *   - Only non-rejected subsidies linked to this household item are included.
 *   - Household items never have invoices, so all budget lines use confidence margins.
 *   - For percentage subsidies: iterate over matching budget lines and compute
 *     min/max amounts using confidence margins.
 *         minAmount = plannedAmount * (1 - margin)
 *         maxAmount = plannedAmount * (1 + margin)
 *     Payback range per line = [minAmount * rate/100, maxAmount * rate/100]
 *     Sum across all matching lines per subsidy, then across subsidies.
 *   - For fixed subsidies: amount is fixed regardless of budget lines →
 *     minPayback = maxPayback = reductionValue
 *   - Universal subsidies (no applicable categories) match ALL budget lines.
 *
 * @throws NotFoundError if household item does not exist
 */
export function getHouseholdItemSubsidyPayback(
  db: DbType,
  householdItemId: string,
): HouseholdItemSubsidyPaybackResponse {
  return getPayback(db, householdItemId) as HouseholdItemSubsidyPaybackResponse;
}
