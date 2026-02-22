import { sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import { CONFIDENCE_MARGINS } from '@cornerstone/shared';
import type { BudgetOverview, CategoryBudgetSummary } from '@cornerstone/shared';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

/**
 * Get the full project-level budget overview.
 *
 * EPIC-05 Story 5.11: Reworked to use confidence margins, subsidy-category matching,
 * and four remaining-funds perspectives.
 *
 * Formula:
 *   For each work_item_budget line:
 *     margin     = CONFIDENCE_MARGINS[line.confidence]
 *     raw_min    = line.planned_amount * (1 - margin)
 *     raw_max    = line.planned_amount * (1 + margin)
 *     subsidy_reduction = sum of applicable reductions (category-matched, non-rejected)
 *     min_planned = max(0, raw_min - subsidy_reduction)
 *     max_planned = max(0, raw_max - subsidy_reduction)
 *
 *   Available Funds = SUM(active budget_sources.total_amount)
 *   Actual Cost     = SUM(invoices.amount WHERE work_item_budget_id IS NOT NULL)
 *   Actual Paid     = SUM(invoices.amount WHERE work_item_budget_id IS NOT NULL AND status = 'paid')
 */
export function getBudgetOverview(db: DbType): BudgetOverview {
  // ── 1. Available funds from active budget sources ──────────────────────────
  const sourcesRow = db.get<{ availableFunds: number | null; sourceCount: number }>(
    sql`SELECT
      COALESCE(SUM(total_amount), 0) AS availableFunds,
      COUNT(*)                       AS sourceCount
    FROM budget_sources
    WHERE status = 'active'`,
  );

  const availableFunds = sourcesRow?.availableFunds ?? 0;
  const sourceCount = sourcesRow?.sourceCount ?? 0;

  // ── 2. All budget lines ────────────────────────────────────────────────────
  const budgetLines = db.all<{
    id: string;
    workItemId: string;
    plannedAmount: number;
    confidence: string;
    budgetCategoryId: string | null;
  }>(
    sql`SELECT
      id              AS id,
      work_item_id    AS workItemId,
      planned_amount  AS plannedAmount,
      confidence      AS confidence,
      budget_category_id AS budgetCategoryId
    FROM work_item_budgets`,
  );

  // ── 3. Active subsidies with their applicable category IDs ─────────────────
  // Returns one row per subsidy program (non-rejected).
  const subsidyRows = db.all<{
    subsidyId: string;
    reductionType: string;
    reductionValue: number;
  }>(
    sql`SELECT
      id              AS subsidyId,
      reduction_type  AS reductionType,
      reduction_value AS reductionValue
    FROM subsidy_programs
    WHERE application_status != 'rejected'`,
  );

  // Map subsidyId -> Set of applicable category IDs
  const subsidyCategoryRows = db.all<{ subsidyId: string; budgetCategoryId: string }>(
    sql`SELECT
      subsidy_program_id  AS subsidyId,
      budget_category_id  AS budgetCategoryId
    FROM subsidy_program_categories`,
  );

  const subsidyCategoryMap = new Map<string, Set<string>>();
  for (const row of subsidyCategoryRows) {
    let cats = subsidyCategoryMap.get(row.subsidyId);
    if (!cats) {
      cats = new Set<string>();
      subsidyCategoryMap.set(row.subsidyId, cats);
    }
    cats.add(row.budgetCategoryId);
  }

  // ── 4. Work item -> subsidy links (non-rejected) ───────────────────────────
  // Map workItemId -> Set of active subsidy IDs linked to that work item
  const workItemSubsidyRows = db.all<{ workItemId: string; subsidyProgramId: string }>(
    sql`SELECT
      wis.work_item_id       AS workItemId,
      wis.subsidy_program_id AS subsidyProgramId
    FROM work_item_subsidies wis
    INNER JOIN subsidy_programs sp ON sp.id = wis.subsidy_program_id
    WHERE sp.application_status != 'rejected'`,
  );

  const workItemSubsidyMap = new Map<string, Set<string>>();
  for (const row of workItemSubsidyRows) {
    let progs = workItemSubsidyMap.get(row.workItemId);
    if (!progs) {
      progs = new Set<string>();
      workItemSubsidyMap.set(row.workItemId, progs);
    }
    progs.add(row.subsidyProgramId);
  }

  // Build a lookup map for subsidy metadata
  const subsidyMeta = new Map<string, { reductionType: string; reductionValue: number }>();
  for (const row of subsidyRows) {
    subsidyMeta.set(row.subsidyId, {
      reductionType: row.reductionType,
      reductionValue: row.reductionValue,
    });
  }

  // ── 5. For fixed subsidies: count matching budget lines per work_item+subsidy ─
  // We need to divide a fixed subsidy equally across the budget lines that match
  // the subsidy's applicable categories for that work item.
  //
  // Pre-compute: for each (workItemId, subsidyId) pair, how many of that work
  // item's budget lines have a budget_category_id that is in the subsidy's
  // applicable categories.
  //
  // We'll compute this lazily per-line below.

  // ── 6. Compute per-line planned amounts and per-category aggregates ─────────
  let totalMinPlanned = 0;
  let totalMaxPlanned = 0;

  // Category summaries: categoryId -> running totals
  const categoryAgg = new Map<
    string,
    {
      minPlanned: number;
      maxPlanned: number;
      actualCost: number;
      actualCostPaid: number;
      budgetLineCount: number;
    }
  >();

  // Per-work-item fixed subsidy line counts (memoized):
  // key = `${workItemId}:${subsidyId}` -> count of matching lines
  const fixedSubsidyLineCountCache = new Map<string, number>();

  for (const line of budgetLines) {
    const margin = CONFIDENCE_MARGINS[line.confidence as keyof typeof CONFIDENCE_MARGINS] ?? 0;
    const rawMin = line.plannedAmount * (1 - margin);
    const rawMax = line.plannedAmount * (1 + margin);

    // Compute subsidy reduction for this line
    let subsidyReduction = 0;

    const linkedSubsidyIds = workItemSubsidyMap.get(line.workItemId);
    if (linkedSubsidyIds && line.budgetCategoryId !== null) {
      for (const subsidyId of linkedSubsidyIds) {
        const meta = subsidyMeta.get(subsidyId);
        if (!meta) continue;

        const applicableCategories = subsidyCategoryMap.get(subsidyId);
        if (!applicableCategories || applicableCategories.size === 0) continue;
        if (!applicableCategories.has(line.budgetCategoryId)) continue;

        // This subsidy applies to this line
        if (meta.reductionType === 'percentage') {
          subsidyReduction += line.plannedAmount * (meta.reductionValue / 100);
        } else if (meta.reductionType === 'fixed') {
          // Divide fixed amount equally across all matching budget lines for
          // this (workItem, subsidy) combination.
          const cacheKey = `${line.workItemId}:${subsidyId}`;
          let matchingLineCount = fixedSubsidyLineCountCache.get(cacheKey);
          if (matchingLineCount === undefined) {
            // Count budget lines for this work item whose category matches
            matchingLineCount = budgetLines.filter(
              (l) =>
                l.workItemId === line.workItemId &&
                l.budgetCategoryId !== null &&
                applicableCategories.has(l.budgetCategoryId),
            ).length;
            // Guard: if somehow 0, use 1 to avoid division by zero
            if (matchingLineCount === 0) matchingLineCount = 1;
            fixedSubsidyLineCountCache.set(cacheKey, matchingLineCount);
          }
          subsidyReduction += meta.reductionValue / matchingLineCount;
        }
      }
    }

    const minPlanned = Math.max(0, rawMin - subsidyReduction);
    const maxPlanned = Math.max(0, rawMax - subsidyReduction);

    totalMinPlanned += minPlanned;
    totalMaxPlanned += maxPlanned;

    // Aggregate per category
    if (line.budgetCategoryId !== null) {
      let agg = categoryAgg.get(line.budgetCategoryId);
      if (!agg) {
        agg = {
          minPlanned: 0,
          maxPlanned: 0,
          actualCost: 0,
          actualCostPaid: 0,
          budgetLineCount: 0,
        };
        categoryAgg.set(line.budgetCategoryId, agg);
      }
      agg.minPlanned += minPlanned;
      agg.maxPlanned += maxPlanned;
      agg.budgetLineCount += 1;
    }
  }

  // ── 7. Actual costs from invoices linked to budget lines ──────────────────
  const invoiceTotalsRow = db.get<{ actualCost: number | null; actualCostPaid: number | null }>(
    sql`SELECT
      COALESCE(SUM(amount), 0)                                                       AS actualCost,
      COALESCE(SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END), 0)             AS actualCostPaid
    FROM invoices
    WHERE work_item_budget_id IS NOT NULL`,
  );

  const actualCost = invoiceTotalsRow?.actualCost ?? 0;
  const actualCostPaid = invoiceTotalsRow?.actualCostPaid ?? 0;

  // ── 8. Per-category actual costs from invoices ────────────────────────────
  const categoryInvoiceRows = db.all<{
    budgetCategoryId: string;
    actualCost: number;
    actualCostPaid: number;
  }>(
    sql`SELECT
      wib.budget_category_id                                                         AS budgetCategoryId,
      COALESCE(SUM(inv.amount), 0)                                                   AS actualCost,
      COALESCE(SUM(CASE WHEN inv.status = 'paid' THEN inv.amount ELSE 0 END), 0)    AS actualCostPaid
    FROM invoices inv
    INNER JOIN work_item_budgets wib ON wib.id = inv.work_item_budget_id
    WHERE wib.budget_category_id IS NOT NULL
    GROUP BY wib.budget_category_id`,
  );

  for (const row of categoryInvoiceRows) {
    let agg = categoryAgg.get(row.budgetCategoryId);
    if (!agg) {
      agg = { minPlanned: 0, maxPlanned: 0, actualCost: 0, actualCostPaid: 0, budgetLineCount: 0 };
      categoryAgg.set(row.budgetCategoryId, agg);
    }
    agg.actualCost = row.actualCost;
    agg.actualCostPaid = row.actualCostPaid;
  }

  // ── 9. Budget category metadata (name, color) ─────────────────────────────
  const categoryMetaRows = db.all<{
    id: string;
    name: string;
    color: string | null;
  }>(
    sql`SELECT id, name, color
    FROM budget_categories
    ORDER BY sort_order ASC, name ASC`,
  );

  const categorySummaries: CategoryBudgetSummary[] = categoryMetaRows.map((cat) => {
    const agg = categoryAgg.get(cat.id);
    return {
      categoryId: cat.id,
      categoryName: cat.name,
      categoryColor: cat.color,
      minPlanned: agg?.minPlanned ?? 0,
      maxPlanned: agg?.maxPlanned ?? 0,
      actualCost: agg?.actualCost ?? 0,
      actualCostPaid: agg?.actualCostPaid ?? 0,
      budgetLineCount: agg?.budgetLineCount ?? 0,
    };
  });

  // ── 10. Subsidy summary ───────────────────────────────────────────────────
  const subsidyCountRow = db.get<{ activeSubsidyCount: number }>(
    sql`SELECT COUNT(*) AS activeSubsidyCount
    FROM subsidy_programs
    WHERE application_status != 'rejected'`,
  );

  // Total reductions: sum of subsidy reductions computed per budget line.
  // Re-compute from the budget lines using the same logic (already done above),
  // but we need the total across all lines, not just category-bucketed lines.
  // Re-derive from totalMinPlanned vs totalMaxPlanned is wrong — derive directly.
  //
  // Compute totalReductions by summing per-line reductions independently.
  let totalReductions = 0;
  const fixedSubsidyLineCountCacheForTotal = new Map<string, number>();

  for (const line of budgetLines) {
    const linkedSubsidyIds = workItemSubsidyMap.get(line.workItemId);
    if (!linkedSubsidyIds || line.budgetCategoryId === null) continue;

    for (const subsidyId of linkedSubsidyIds) {
      const meta = subsidyMeta.get(subsidyId);
      if (!meta) continue;

      const applicableCategories = subsidyCategoryMap.get(subsidyId);
      if (!applicableCategories || applicableCategories.size === 0) continue;
      if (!applicableCategories.has(line.budgetCategoryId)) continue;

      if (meta.reductionType === 'percentage') {
        totalReductions += line.plannedAmount * (meta.reductionValue / 100);
      } else if (meta.reductionType === 'fixed') {
        const cacheKey = `${line.workItemId}:${subsidyId}`;
        let matchingLineCount = fixedSubsidyLineCountCacheForTotal.get(cacheKey);
        if (matchingLineCount === undefined) {
          matchingLineCount = budgetLines.filter(
            (l) =>
              l.workItemId === line.workItemId &&
              l.budgetCategoryId !== null &&
              applicableCategories.has(l.budgetCategoryId),
          ).length;
          if (matchingLineCount === 0) matchingLineCount = 1;
          fixedSubsidyLineCountCacheForTotal.set(cacheKey, matchingLineCount);
        }
        totalReductions += meta.reductionValue / matchingLineCount;
      }
    }
  }

  const subsidySummary = {
    totalReductions,
    activeSubsidyCount: subsidyCountRow?.activeSubsidyCount ?? 0,
  };

  // ── 11. Four remaining-funds perspectives ─────────────────────────────────
  const remainingVsMinPlanned = availableFunds - totalMinPlanned;
  const remainingVsMaxPlanned = availableFunds - totalMaxPlanned;
  const remainingVsActualCost = availableFunds - actualCost;
  const remainingVsActualPaid = availableFunds - actualCostPaid;

  return {
    availableFunds,
    sourceCount,
    minPlanned: totalMinPlanned,
    maxPlanned: totalMaxPlanned,
    actualCost,
    actualCostPaid,
    remainingVsMinPlanned,
    remainingVsMaxPlanned,
    remainingVsActualCost,
    remainingVsActualPaid,
    categorySummaries,
    subsidySummary,
  };
}
