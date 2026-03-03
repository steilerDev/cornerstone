import { sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import type {
  HouseholdItemSubsidyPaybackEntry,
  HouseholdItemSubsidyPaybackResponse,
} from '@cornerstone/shared';
import { CONFIDENCE_MARGINS } from '@cornerstone/shared';
import { NotFoundError } from '../errors/AppError.js';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

type ConfidenceLevel = keyof typeof CONFIDENCE_MARGINS;

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
  // Verify household item exists
  const item = db.get<{ id: string }>(
    sql`SELECT id FROM household_items WHERE id = ${householdItemId}`,
  );
  if (!item) {
    throw new NotFoundError('Household item not found');
  }

  // Fetch non-rejected subsidies linked to this household item
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
    FROM household_item_subsidies his
    INNER JOIN subsidy_programs sp ON sp.id = his.subsidy_program_id
    WHERE his.household_item_id = ${householdItemId}
      AND sp.application_status != 'rejected'`,
  );

  if (linkedRows.length === 0) {
    return { householdItemId, minTotalPayback: 0, maxTotalPayback: 0, subsidies: [] };
  }

  // Fetch all budget lines for this household item, including confidence level
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
    FROM household_item_budgets
    WHERE household_item_id = ${householdItemId}`,
  );

  // Compute per-line min/max effective amounts (household items never have invoices)
  const budgetLines = budgetLineRows.map((line) => {
    // Always apply confidence margin (no invoices for household items)
    const margin =
      CONFIDENCE_MARGINS[line.confidence as ConfidenceLevel] ?? CONFIDENCE_MARGINS.own_estimate;
    return {
      id: line.id,
      budgetCategoryId: line.budgetCategoryId,
      minAmount: line.plannedAmount * (1 - margin),
      maxAmount: line.plannedAmount * (1 + margin),
    };
  });

  // Load applicable categories for relevant subsidy programs only
  const subsidyIds = linkedRows.map((r) => r.subsidyProgramId);
  const inList = subsidyIds.map((id) => sql`${id}`);
  const categoryRows = db.all<{ subsidyProgramId: string; budgetCategoryId: string }>(
    sql`SELECT subsidy_program_id AS subsidyProgramId, budget_category_id AS budgetCategoryId
    FROM subsidy_program_categories
    WHERE subsidy_program_id IN (${sql.join(inList, sql`, `)})`,
  );

  const subsidyCategoryMap = new Map<string, Set<string>>();
  for (const row of categoryRows) {
    let cats = subsidyCategoryMap.get(row.subsidyProgramId);
    if (!cats) {
      cats = new Set<string>();
      subsidyCategoryMap.set(row.subsidyProgramId, cats);
    }
    cats.add(row.budgetCategoryId);
  }

  // Calculate min/max payback per subsidy
  const subsidyEntries: HouseholdItemSubsidyPaybackEntry[] = [];
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

  return { householdItemId, minTotalPayback, maxTotalPayback, subsidies: subsidyEntries };
}
