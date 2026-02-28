import { sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import type {
  WorkItemSubsidyPaybackEntry,
  WorkItemSubsidyPaybackResponse,
} from '@cornerstone/shared';
import { NotFoundError } from '../errors/AppError.js';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

/**
 * Calculate the expected subsidy payback for a single work item.
 *
 * Rules:
 *   - Only non-rejected subsidies linked to this work item are included.
 *   - For percentage subsidies: sum of (budgetLineEffectiveAmount × reductionValue / 100)
 *     for each budget line whose category matches the subsidy's applicable categories.
 *     Universal subsidies (no applicable categories) match ALL budget lines.
 *   - For fixed subsidies: reductionValue is the total amount per subsidy program.
 *   - Budget line effective amount:
 *     * If the line has invoices: use actual invoiced cost (SUM of invoice amounts).
 *     * Otherwise: use plannedAmount.
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
    return { workItemId, totalPayback: 0, subsidies: [] };
  }

  // Fetch all budget lines for this work item
  const budgetLineRows = db.all<{
    id: string;
    plannedAmount: number;
    budgetCategoryId: string | null;
  }>(
    sql`SELECT
      id                 AS id,
      planned_amount     AS plannedAmount,
      budget_category_id AS budgetCategoryId
    FROM work_item_budgets
    WHERE work_item_id = ${workItemId}`,
  );

  // Fetch actual invoice costs per budget line (actual cost when invoices exist)
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

  // Compute effective amount per budget line: invoiced cost if invoices exist, else planned amount
  const budgetLines = budgetLineRows.map((line) => ({
    id: line.id,
    budgetCategoryId: line.budgetCategoryId,
    effectiveAmount: invoiceMap.has(line.id) ? (invoiceMap.get(line.id) ?? 0) : line.plannedAmount,
  }));

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

  // Calculate payback per subsidy
  const subsidyEntries: WorkItemSubsidyPaybackEntry[] = [];
  let totalPayback = 0;

  for (const subsidy of linkedRows) {
    const applicableCategories = subsidyCategoryMap.get(subsidy.subsidyProgramId);
    const isUniversal = !applicableCategories || applicableCategories.size === 0;
    let paybackAmount = 0;

    if (subsidy.reductionType === 'percentage') {
      for (const line of budgetLines) {
        const categoryMatches =
          isUniversal ||
          (line.budgetCategoryId !== null && applicableCategories!.has(line.budgetCategoryId));
        if (categoryMatches) {
          paybackAmount += line.effectiveAmount * (subsidy.reductionValue / 100);
        }
      }
    } else if (subsidy.reductionType === 'fixed') {
      // Fixed amount: return the full reductionValue as the total payback for this program
      paybackAmount = subsidy.reductionValue;
    }

    subsidyEntries.push({
      subsidyProgramId: subsidy.subsidyProgramId,
      name: subsidy.name,
      reductionType: subsidy.reductionType as 'percentage' | 'fixed',
      reductionValue: subsidy.reductionValue,
      paybackAmount,
    });
    totalPayback += paybackAmount;
  }

  return { workItemId, totalPayback, subsidies: subsidyEntries };
}
