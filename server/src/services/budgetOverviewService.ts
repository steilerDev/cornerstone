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
 *   Actual Cost     = SUM(invoice_budget_lines.itemized_amount WHERE work_item_budget_id IS NOT NULL)
 *   Actual Paid     = SUM(invoice_budget_lines.itemized_amount WHERE work_item_budget_id IS NOT NULL AND invoices.status IN ('paid', 'claimed'))
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

  // ── 2. All budget lines (UNION work items + household items) ────────────────
  const budgetLines = db.all<{
    id: string;
    entityId: string;
    plannedAmount: number;
    confidence: string;
    budgetCategoryId: string | null;
  }>(
    sql`SELECT
      id              AS id,
      work_item_id    AS entityId,
      planned_amount  AS plannedAmount,
      confidence      AS confidence,
      budget_category_id AS budgetCategoryId
    FROM work_item_budgets
    UNION ALL
    SELECT
      id              AS id,
      household_item_id AS entityId,
      planned_amount  AS plannedAmount,
      confidence      AS confidence,
      budget_category_id AS budgetCategoryId
    FROM household_item_budgets`,
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

  // ── 4. Entity -> subsidy links (non-rejected, both work items + household items) ──
  // Map entityId -> Set of active subsidy IDs linked to that entity
  const entitySubsidyRows = db.all<{ entityId: string; subsidyProgramId: string }>(
    sql`SELECT
      wis.work_item_id       AS entityId,
      wis.subsidy_program_id AS subsidyProgramId
    FROM work_item_subsidies wis
    INNER JOIN subsidy_programs sp ON sp.id = wis.subsidy_program_id
    WHERE sp.application_status != 'rejected'
    UNION ALL
    SELECT
      his.household_item_id  AS entityId,
      his.subsidy_program_id AS subsidyProgramId
    FROM household_item_subsidies his
    INNER JOIN subsidy_programs sp ON sp.id = his.subsidy_program_id
    WHERE sp.application_status != 'rejected'`,
  );

  const entitySubsidyMap = new Map<string, Set<string>>();
  for (const row of entitySubsidyRows) {
    let progs = entitySubsidyMap.get(row.entityId);
    if (!progs) {
      progs = new Set<string>();
      entitySubsidyMap.set(row.entityId, progs);
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

  // ── 5. Per-line invoice aggregates (for blended projected model) ──────────────
  // Include both work item and household item budget lines
  const lineInvoiceRows = db.all<{
    budgetLineId: string;
    actualCost: number;
  }>(
    sql`SELECT
      ibl.work_item_budget_id AS budgetLineId,
      COALESCE(SUM(ibl.itemized_amount), 0) AS actualCost
    FROM invoice_budget_lines ibl
    INNER JOIN invoices i ON i.id = ibl.invoice_id
    WHERE ibl.work_item_budget_id IS NOT NULL
    GROUP BY ibl.work_item_budget_id
    UNION ALL
    SELECT
      ibl.household_item_budget_id AS budgetLineId,
      COALESCE(SUM(ibl.itemized_amount), 0) AS actualCost
    FROM invoice_budget_lines ibl
    INNER JOIN invoices i ON i.id = ibl.invoice_id
    WHERE ibl.household_item_budget_id IS NOT NULL
    GROUP BY ibl.household_item_budget_id`,
  );

  const lineInvoiceMap = new Map<string, number>();
  for (const row of lineInvoiceRows) {
    lineInvoiceMap.set(row.budgetLineId, row.actualCost);
  }

  // ── 6. For fixed subsidies: count matching budget lines per work_item+subsidy ─
  // We need to divide a fixed subsidy equally across the budget lines that match
  // the subsidy's applicable categories for that work item.
  //
  // Pre-compute: for each (workItemId, subsidyId) pair, how many of that work
  // item's budget lines have a budget_category_id that is in the subsidy's
  // applicable categories.
  //
  // We'll compute this lazily per-line below.

  // ── 7. Compute per-line planned amounts and per-category aggregates ─────────
  let totalMinPlanned = 0;
  let totalMaxPlanned = 0;
  let totalProjectedMin = 0;
  let totalProjectedMax = 0;

  // Category summaries: categoryId -> running totals
  const categoryAgg = new Map<
    string | null,
    {
      minPlanned: number;
      maxPlanned: number;
      projectedMin: number;
      projectedMax: number;
      actualCost: number;
      actualCostPaid: number;
      actualCostClaimed: number;
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

    const linkedSubsidyIds = entitySubsidyMap.get(line.entityId);
    if (linkedSubsidyIds) {
      for (const subsidyId of linkedSubsidyIds) {
        const meta = subsidyMeta.get(subsidyId);
        if (!meta) continue;

        const applicableCategories = subsidyCategoryMap.get(subsidyId);
        const isUniversalSubsidy = !applicableCategories || applicableCategories.size === 0;
        if (!isUniversalSubsidy) {
          if (line.budgetCategoryId === null || !applicableCategories.has(line.budgetCategoryId))
            continue;
        }

        // Determine cost basis: use invoice amount if available, otherwise planned amount
        const costBasis = lineInvoiceMap.has(line.id) ? lineInvoiceMap.get(line.id)! : line.plannedAmount;

        // This subsidy applies to this line
        if (meta.reductionType === 'percentage') {
          subsidyReduction += costBasis * (meta.reductionValue / 100);
        } else if (meta.reductionType === 'fixed') {
          // Divide fixed amount equally across all matching budget lines for
          // this (entity, subsidy) combination.
          const cacheKey = `${line.entityId}:${subsidyId}`;
          let matchingLineCount = fixedSubsidyLineCountCache.get(cacheKey);
          if (matchingLineCount === undefined) {
            // Universal subsidies match ALL budget lines for the entity;
            // category-scoped subsidies match only lines with a matching category.
            matchingLineCount = budgetLines.filter(
              (l) =>
                l.entityId === line.entityId &&
                (isUniversalSubsidy ||
                  (l.budgetCategoryId !== null && applicableCategories.has(l.budgetCategoryId))),
            ).length;
            // Guard: if somehow 0, use 1 to avoid division by zero
            if (matchingLineCount === 0) matchingLineCount = 1;
            fixedSubsidyLineCountCache.set(cacheKey, matchingLineCount);
          }
          const perLineAmount = meta.reductionValue / matchingLineCount;
          subsidyReduction += Math.min(perLineAmount, costBasis);
        }
      }
    }

    const rawMinPlanned = Math.max(0, rawMin - subsidyReduction);
    const rawMaxPlanned = Math.max(0, rawMax - subsidyReduction);

    // If line has invoices, actual cost overrides planned values (the real cost is known)
    const lineActualCost = lineInvoiceMap.get(line.id);
    const hasInvoices = lineActualCost !== undefined;
    const minPlanned = hasInvoices ? lineActualCost : rawMinPlanned;
    const maxPlanned = hasInvoices ? lineActualCost : rawMaxPlanned;
    const projectedMin = minPlanned;
    const projectedMax = maxPlanned;

    totalMinPlanned += minPlanned;
    totalMaxPlanned += maxPlanned;
    totalProjectedMin += projectedMin;
    totalProjectedMax += projectedMax;

    // Aggregate per category (null key = uncategorized)
    let agg = categoryAgg.get(line.budgetCategoryId);
    if (!agg) {
      agg = {
        minPlanned: 0,
        maxPlanned: 0,
        projectedMin: 0,
        projectedMax: 0,
        actualCost: 0,
        actualCostPaid: 0,
        actualCostClaimed: 0,
        budgetLineCount: 0,
      };
      categoryAgg.set(line.budgetCategoryId, agg);
    }
    agg.minPlanned += minPlanned;
    agg.maxPlanned += maxPlanned;
    agg.projectedMin += projectedMin;
    agg.projectedMax += projectedMax;
    agg.budgetLineCount += 1;
  }

  // ── 8. Actual costs from invoices linked to budget lines ──────────────────
  // Include both work item and household item invoices
  const invoiceTotalsRow = db.get<{
    actualCost: number | null;
    actualCostPaid: number | null;
    actualCostClaimed: number | null;
  }>(
    sql`SELECT
      COALESCE(SUM(ibl.itemized_amount), 0)                                                         AS actualCost,
      COALESCE(SUM(CASE WHEN i.status IN ('paid', 'claimed') THEN ibl.itemized_amount ELSE 0 END), 0) AS actualCostPaid,
      COALESCE(SUM(CASE WHEN i.status = 'claimed' THEN ibl.itemized_amount ELSE 0 END), 0)            AS actualCostClaimed
    FROM invoice_budget_lines ibl
    INNER JOIN invoices i ON i.id = ibl.invoice_id`,
  );

  const actualCost = invoiceTotalsRow?.actualCost ?? 0;
  const actualCostPaid = invoiceTotalsRow?.actualCostPaid ?? 0;
  const actualCostClaimed = invoiceTotalsRow?.actualCostClaimed ?? 0;

  // ── 9. Per-category actual costs from invoices ────────────────────────────
  // Include both work item and household item budget invoices using UNION ALL
  const categoryInvoiceRows = db.all<{
    budgetCategoryId: string | null;
    actualCost: number;
    actualCostPaid: number;
    actualCostClaimed: number;
  }>(
    sql`SELECT
      wib.budget_category_id                                                                      AS budgetCategoryId,
      COALESCE(SUM(ibl.itemized_amount), 0)                                                                AS actualCost,
      COALESCE(SUM(CASE WHEN i.status IN ('paid', 'claimed') THEN ibl.itemized_amount ELSE 0 END), 0)   AS actualCostPaid,
      COALESCE(SUM(CASE WHEN i.status = 'claimed' THEN ibl.itemized_amount ELSE 0 END), 0)              AS actualCostClaimed
    FROM invoice_budget_lines ibl
    INNER JOIN invoices i ON i.id = ibl.invoice_id
    INNER JOIN work_item_budgets wib ON wib.id = ibl.work_item_budget_id
    GROUP BY wib.budget_category_id
    UNION ALL
    SELECT
      hib.budget_category_id                                                                      AS budgetCategoryId,
      COALESCE(SUM(ibl.itemized_amount), 0)                                                                AS actualCost,
      COALESCE(SUM(CASE WHEN i.status IN ('paid', 'claimed') THEN ibl.itemized_amount ELSE 0 END), 0)   AS actualCostPaid,
      COALESCE(SUM(CASE WHEN i.status = 'claimed' THEN ibl.itemized_amount ELSE 0 END), 0)              AS actualCostClaimed
    FROM invoice_budget_lines ibl
    INNER JOIN invoices i ON i.id = ibl.invoice_id
    INNER JOIN household_item_budgets hib ON hib.id = ibl.household_item_budget_id
    GROUP BY hib.budget_category_id`,
  );

  for (const row of categoryInvoiceRows) {
    let agg = categoryAgg.get(row.budgetCategoryId);
    if (!agg) {
      agg = {
        minPlanned: 0,
        maxPlanned: 0,
        projectedMin: 0,
        projectedMax: 0,
        actualCost: 0,
        actualCostPaid: 0,
        actualCostClaimed: 0,
        budgetLineCount: 0,
      };
      categoryAgg.set(row.budgetCategoryId, agg);
    }
    // Use += to accumulate for duplicate categories (one from work items, one from household items)
    agg.actualCost += row.actualCost;
    agg.actualCostPaid += row.actualCostPaid;
    agg.actualCostClaimed += row.actualCostClaimed;
  }

  // ── 10. Budget category metadata (name, color) ────────────────────────────
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
      projectedMin: agg?.projectedMin ?? 0,
      projectedMax: agg?.projectedMax ?? 0,
      actualCost: agg?.actualCost ?? 0,
      actualCostPaid: agg?.actualCostPaid ?? 0,
      actualCostClaimed: agg?.actualCostClaimed ?? 0,
      budgetLineCount: agg?.budgetLineCount ?? 0,
    };
  });

  // Append virtual "Uncategorized" entry if any budget lines have no category
  const uncategorizedAgg = categoryAgg.get(null);
  if (uncategorizedAgg) {
    categorySummaries.push({
      categoryId: null,
      categoryName: 'Uncategorized',
      categoryColor: null,
      minPlanned: uncategorizedAgg.minPlanned,
      maxPlanned: uncategorizedAgg.maxPlanned,
      projectedMin: uncategorizedAgg.projectedMin,
      projectedMax: uncategorizedAgg.projectedMax,
      actualCost: uncategorizedAgg.actualCost,
      actualCostPaid: uncategorizedAgg.actualCostPaid,
      actualCostClaimed: uncategorizedAgg.actualCostClaimed,
      budgetLineCount: uncategorizedAgg.budgetLineCount,
    });
  }

  // ── 11. Subsidy summary ───────────────────────────────────────────────────
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
    const linkedSubsidyIds = entitySubsidyMap.get(line.entityId);
    if (!linkedSubsidyIds) continue;

    for (const subsidyId of linkedSubsidyIds) {
      const meta = subsidyMeta.get(subsidyId);
      if (!meta) continue;

      const applicableCategories = subsidyCategoryMap.get(subsidyId);
      const isUniversalSubsidy = !applicableCategories || applicableCategories.size === 0;
      if (!isUniversalSubsidy) {
        if (line.budgetCategoryId === null || !applicableCategories.has(line.budgetCategoryId))
          continue;
      }

      // Determine cost basis: use invoice amount if available, otherwise planned amount
      const costBasis = lineInvoiceMap.has(line.id) ? lineInvoiceMap.get(line.id)! : line.plannedAmount;

      if (meta.reductionType === 'percentage') {
        totalReductions += costBasis * (meta.reductionValue / 100);
      } else if (meta.reductionType === 'fixed') {
        const cacheKey = `${line.entityId}:${subsidyId}`;
        let matchingLineCount = fixedSubsidyLineCountCacheForTotal.get(cacheKey);
        if (matchingLineCount === undefined) {
          matchingLineCount = budgetLines.filter(
            (l) =>
              l.entityId === line.entityId &&
              (isUniversalSubsidy ||
                (l.budgetCategoryId !== null && applicableCategories.has(l.budgetCategoryId))),
          ).length;
          if (matchingLineCount === 0) matchingLineCount = 1;
          fixedSubsidyLineCountCacheForTotal.set(cacheKey, matchingLineCount);
        }
        const perLineAmount = meta.reductionValue / matchingLineCount;
        totalReductions += Math.min(perLineAmount, costBasis);
      }
    }
  }

  // ── 11b. Aggregate subsidy payback across all work items ──────────────────
  //
  // Replicates subsidyPaybackService logic globally across all budget lines.
  // For percentage subsidies: iterate over matching budget lines per work item.
  //   - Lines WITH invoices: min=max=actualCost (from lineInvoiceMap)
  //   - Lines WITHOUT invoices: apply confidence margin to plannedAmount
  //   Payback = minAmount * rate/100  (min) and maxAmount * rate/100 (max)
  // For fixed subsidies: minPayback = maxPayback = reductionValue
  // Only non-rejected subsidies linked to a work item are included.
  //
  // Note: subsidyMeta and workItemSubsidyMap already fetched above.

  let totalMinPayback = 0;
  let totalMaxPayback = 0;

  // Group budget lines by entityId for efficient per-entity processing
  const linesByEntity = new Map<
    string,
    {
      id: string;
      entityId: string;
      plannedAmount: number;
      confidence: string;
      budgetCategoryId: string | null;
    }[]
  >();
  for (const line of budgetLines) {
    let arr = linesByEntity.get(line.entityId);
    if (!arr) {
      arr = [];
      linesByEntity.set(line.entityId, arr);
    }
    arr.push(line);
  }

  // For each entity that has linked subsidies, compute payback
  for (const [entityId, linkedSubsidyIds] of entitySubsidyMap) {
    const entityLines = linesByEntity.get(entityId) ?? [];

    // Compute per-line effective min/max amounts (mirrors subsidyPaybackService)
    const effectiveLines = entityLines.map((line) => {
      const lineActualCost = lineInvoiceMap.get(line.id);
      if (lineActualCost !== undefined) {
        return {
          budgetCategoryId: line.budgetCategoryId,
          minAmount: lineActualCost,
          maxAmount: lineActualCost,
        };
      }
      const margin =
        CONFIDENCE_MARGINS[line.confidence as keyof typeof CONFIDENCE_MARGINS] ??
        CONFIDENCE_MARGINS.own_estimate;
      return {
        budgetCategoryId: line.budgetCategoryId,
        minAmount: line.plannedAmount * (1 - margin),
        maxAmount: line.plannedAmount * (1 + margin),
      };
    });

    for (const subsidyId of linkedSubsidyIds) {
      const meta = subsidyMeta.get(subsidyId);
      if (!meta) continue;

      const applicableCategories = subsidyCategoryMap.get(subsidyId);
      const isUniversal = !applicableCategories || applicableCategories.size === 0;

      if (meta.reductionType === 'percentage') {
        const rate = meta.reductionValue / 100;
        for (const line of effectiveLines) {
          const categoryMatches =
            isUniversal ||
            (line.budgetCategoryId !== null && applicableCategories!.has(line.budgetCategoryId));
          if (categoryMatches) {
            totalMinPayback += line.minAmount * rate;
            totalMaxPayback += line.maxAmount * rate;
          }
        }
      } else if (meta.reductionType === 'fixed') {
        // Fixed amount: min === max === reductionValue
        totalMinPayback += meta.reductionValue;
        totalMaxPayback += meta.reductionValue;
      }
    }
  }

  const subsidySummary = {
    totalReductions,
    activeSubsidyCount: subsidyCountRow?.activeSubsidyCount ?? 0,
    minTotalPayback: totalMinPayback,
    maxTotalPayback: totalMaxPayback,
  };

  // ── 12. Remaining-funds perspectives ───────────────────────────────────────
  const remainingVsMinPlanned = availableFunds - totalMinPlanned;
  const remainingVsMaxPlanned = availableFunds - totalMaxPlanned;
  const remainingVsProjectedMin = availableFunds - totalProjectedMin;
  const remainingVsProjectedMax = availableFunds - totalProjectedMax;
  const remainingVsActualCost = availableFunds - actualCost;
  const remainingVsActualPaid = availableFunds - actualCostPaid;
  const remainingVsActualClaimed = availableFunds - actualCostClaimed;

  // Payback-adjusted remaining perspectives
  const remainingVsMinPlannedWithPayback = availableFunds + totalMinPayback - totalMinPlanned;
  const remainingVsMaxPlannedWithPayback = availableFunds + totalMaxPayback - totalMaxPlanned;

  return {
    availableFunds,
    sourceCount,
    minPlanned: totalMinPlanned,
    maxPlanned: totalMaxPlanned,
    projectedMin: totalProjectedMin,
    projectedMax: totalProjectedMax,
    actualCost,
    actualCostPaid,
    actualCostClaimed,
    remainingVsMinPlanned,
    remainingVsMaxPlanned,
    remainingVsProjectedMin,
    remainingVsProjectedMax,
    remainingVsActualCost,
    remainingVsActualPaid,
    remainingVsActualClaimed,
    remainingVsMinPlannedWithPayback,
    remainingVsMaxPlannedWithPayback,
    categorySummaries,
    subsidySummary,
  };
}
