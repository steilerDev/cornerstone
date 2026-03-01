import { sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import type {
  WorkItemSubsidyPaybackEntry,
  WorkItemSubsidyPaybackResponse,
} from '@cornerstone/shared';
import { CONFIDENCE_MARGINS } from '@cornerstone/shared';
import { NotFoundError } from '../errors/AppError.js';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

type ConfidenceLevel = keyof typeof CONFIDENCE_MARGINS;

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
  // Verify work item exists
  const item = db.get<{ id: string }>(sql`SELECT id FROM work_items WHERE id = ${workItemId}`);
  if (!item) {
    throw new NotFoundError('Work item not found');
  }

  // Fetch non-rejected subsidies linked to this work item
  const linkedRows = db.all<{
    subsidyProgramId: string;
    name: string;
    reductionType: string;
    reductionValue: number;
  }>(
    sql`SELECT
      sp.id              AS subsidyProgramId,
      sp.name            AS name,
      sp.reduction_type  AS reductionType,
      sp.reduction_value AS reductionValue
    FROM work_item_subsidies wis
    INNER JOIN subsidy_programs sp ON sp.id = wis.subsidy_program_id
    WHERE wis.work_item_id = ${workItemId}
      AND sp.application_status != 'rejected'`,
  );

  if (linkedRows.length === 0) {
    return { workItemId, minTotalPayback: 0, maxTotalPayback: 0, subsidies: [] };
  }

  // Fetch all budget lines for this work item, including confidence level
  const budgetLineRows = db.all<{
    id: string;
    plannedAmount: number;
    confidence: string;
    budgetCategoryId: string | null;
  }>(
    sql`SELECT
      id                 AS id,
      planned_amount     AS plannedAmount,
      confidence         AS confidence,
      budget_category_id AS budgetCategoryId
    FROM work_item_budgets
    WHERE work_item_id = ${workItemId}`,
  );

  // Fetch actual invoice costs per budget line (SUM of invoice amounts)
  const invoiceRows = db.all<{ workItemBudgetId: string; actualCost: number }>(
    sql`SELECT
      work_item_budget_id AS workItemBudgetId,
      COALESCE(SUM(amount), 0) AS actualCost
    FROM invoices
    WHERE work_item_budget_id IN (
      SELECT id FROM work_item_budgets WHERE work_item_id = ${workItemId}
    )
    GROUP BY work_item_budget_id`,
  );

  const invoiceMap = new Map<string, number>();
  for (const row of invoiceRows) {
    invoiceMap.set(row.workItemBudgetId, row.actualCost);
  }

  // Compute per-line min/max effective amounts
  const budgetLines = budgetLineRows.map((line) => {
    if (invoiceMap.has(line.id)) {
      // Actual cost known: min === max === actual invoiced cost
      const actualCost = invoiceMap.get(line.id) ?? 0;
      return {
        id: line.id,
        budgetCategoryId: line.budgetCategoryId,
        minAmount: actualCost,
        maxAmount: actualCost,
      };
    } else {
      // No invoices: apply confidence margin
      const margin =
        CONFIDENCE_MARGINS[line.confidence as ConfidenceLevel] ?? CONFIDENCE_MARGINS.own_estimate;
      return {
        id: line.id,
        budgetCategoryId: line.budgetCategoryId,
        minAmount: line.plannedAmount * (1 - margin),
        maxAmount: line.plannedAmount * (1 + margin),
      };
    }
  });

  // Load applicable categories for all relevant subsidy programs in one query
  const subsidyIds = linkedRows.map((r) => r.subsidyProgramId);
  const categoryRows = db.all<{ subsidyProgramId: string; budgetCategoryId: string }>(
    sql`SELECT subsidy_program_id AS subsidyProgramId, budget_category_id AS budgetCategoryId
    FROM subsidy_program_categories`,
  );

  const subsidyIdSet = new Set(subsidyIds);
  const subsidyCategoryMap = new Map<string, Set<string>>();
  for (const row of categoryRows) {
    if (!subsidyIdSet.has(row.subsidyProgramId)) continue;
    let cats = subsidyCategoryMap.get(row.subsidyProgramId);
    if (!cats) {
      cats = new Set<string>();
      subsidyCategoryMap.set(row.subsidyProgramId, cats);
    }
    cats.add(row.budgetCategoryId);
  }

  // Calculate min/max payback per subsidy
  const subsidyEntries: WorkItemSubsidyPaybackEntry[] = [];
  let minTotalPayback = 0;
  let maxTotalPayback = 0;

  for (const subsidy of linkedRows) {
    const applicableCategories = subsidyCategoryMap.get(subsidy.subsidyProgramId);
    const isUniversal = !applicableCategories || applicableCategories.size === 0;
    let minPayback = 0;
    let maxPayback = 0;

    if (subsidy.reductionType === 'percentage') {
      const rate = subsidy.reductionValue / 100;
      for (const line of budgetLines) {
        const categoryMatches =
          isUniversal ||
          (line.budgetCategoryId !== null && applicableCategories!.has(line.budgetCategoryId));
        if (categoryMatches) {
          minPayback += line.minAmount * rate;
          maxPayback += line.maxAmount * rate;
        }
      }
    } else if (subsidy.reductionType === 'fixed') {
      // Fixed amount: min === max === reductionValue (not affected by budget line ranges)
      minPayback = subsidy.reductionValue;
      maxPayback = subsidy.reductionValue;
    }

    subsidyEntries.push({
      subsidyProgramId: subsidy.subsidyProgramId,
      name: subsidy.name,
      reductionType: subsidy.reductionType as 'percentage' | 'fixed',
      reductionValue: subsidy.reductionValue,
      minPayback,
      maxPayback,
    });
    minTotalPayback += minPayback;
    maxTotalPayback += maxPayback;
  }

  return { workItemId, minTotalPayback, maxTotalPayback, subsidies: subsidyEntries };
}
