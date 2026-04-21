import { sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import { CONFIDENCE_MARGINS } from '@cornerstone/shared';
import type { BudgetOverview, OversubscribedSubsidy } from '@cornerstone/shared';
import { computeSubsidyEffects, applySubsidyCaps } from './shared/subsidyCalculationEngine.js';
import type {
  LinkedSubsidy,
  SubsidyCapMeta,
  PerSubsidyTotals,
} from './shared/subsidyCalculationEngine.js';

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
    name: string;
    reductionType: string;
    reductionValue: number;
    maximumAmount: number | null;
  }>(
    sql`SELECT
      id              AS subsidyId,
      name            AS name,
      reduction_type  AS reductionType,
      reduction_value AS reductionValue,
      maximum_amount  AS maximumAmount
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
  // Track whether each line's invoice is a quotation for margin calculation
  const lineInvoiceRows = db.all<{
    budgetLineId: string;
    actualCost: number;
    invoiceStatus: string;
  }>(
    sql`SELECT
      ibl.work_item_budget_id AS budgetLineId,
      COALESCE(SUM(ibl.itemized_amount), 0) AS actualCost,
      MAX(i.status) AS invoiceStatus
    FROM invoice_budget_lines ibl
    INNER JOIN invoices i ON i.id = ibl.invoice_id
    WHERE ibl.work_item_budget_id IS NOT NULL
    GROUP BY ibl.work_item_budget_id
    UNION ALL
    SELECT
      ibl.household_item_budget_id AS budgetLineId,
      COALESCE(SUM(ibl.itemized_amount), 0) AS actualCost,
      MAX(i.status) AS invoiceStatus
    FROM invoice_budget_lines ibl
    INNER JOIN invoices i ON i.id = ibl.invoice_id
    WHERE ibl.household_item_budget_id IS NOT NULL
    GROUP BY ibl.household_item_budget_id`,
  );

  const lineInvoiceMap = new Map<string, { actualCost: number; isQuotation: boolean }>();
  for (const row of lineInvoiceRows) {
    lineInvoiceMap.set(row.budgetLineId, {
      actualCost: row.actualCost,
      isQuotation: row.invoiceStatus === 'quotation',
    });
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

  // ── 7. Compute per-line planned amounts ──────────────────────────────────────
  let totalMinPlanned = 0;
  let totalMaxPlanned = 0;

  // Per-work-item fixed subsidy line counts (memoized):
  // key = `${workItemId}:${subsidyId}` -> count of matching lines
  const fixedSubsidyLineCountCache = new Map<string, number>();
  let totalReductions = 0;

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
        const costBasis = lineInvoiceMap.has(line.id)
          ? lineInvoiceMap.get(line.id)!.actualCost
          : line.plannedAmount;

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

    totalReductions += subsidyReduction;

    const rawMinPlanned = rawMin;
    const rawMaxPlanned = rawMax;

    // If line has invoices, determine if it's a quotation and calculate projections accordingly
    const lineInvoiceData = lineInvoiceMap.get(line.id);
    const hasInvoices = lineInvoiceData !== undefined;
    let minPlanned = rawMinPlanned;
    let maxPlanned = rawMaxPlanned;

    if (hasInvoices) {
      const { actualCost, isQuotation } = lineInvoiceData;
      if (isQuotation) {
        // Quotation invoices use ±5% margin around itemized amount
        minPlanned = actualCost * 0.95;
        maxPlanned = actualCost * 1.05;
      } else {
        // Non-quotation invoices: actual cost is fixed (no margin)
        minPlanned = actualCost;
        maxPlanned = actualCost;
      }
    }

    totalMinPlanned += minPlanned;
    totalMaxPlanned += maxPlanned;
  }

  // ── 8. Actual costs from invoices linked to budget lines ──────────────────
  // Include both work item and household item invoices
  // Exclude quotation invoices from actual cost aggregates
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
    INNER JOIN invoices i ON i.id = ibl.invoice_id
    WHERE i.status != 'quotation'`,
  );

  const actualCost = invoiceTotalsRow?.actualCost ?? 0;
  const actualCostPaid = invoiceTotalsRow?.actualCostPaid ?? 0;
  const actualCostClaimed = invoiceTotalsRow?.actualCostClaimed ?? 0;

  // ── 9. Subsidy summary ───────────────────────────────────────────────────
  const subsidyCountRow = db.get<{ activeSubsidyCount: number }>(
    sql`SELECT COUNT(*) AS activeSubsidyCount
    FROM subsidy_programs
    WHERE application_status != 'rejected'`,
  );

  // ── 9a. Aggregate subsidy payback across all work items ─────────────────
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

  // Aggregate per-subsidy payback totals across all entities
  const perSubsidyPayback = new Map<string, { min: number; max: number }>();

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

    // Build engine inputs from the entity's budget lines
    const engineLines = entityLines.map((line) => ({
      id: line.id,
      budgetCategoryId: line.budgetCategoryId,
      plannedAmount: line.plannedAmount,
      confidence: line.confidence,
    }));

    const engineSubsidies: LinkedSubsidy[] = [];
    for (const subsidyId of linkedSubsidyIds) {
      const meta = subsidyMeta.get(subsidyId);
      if (!meta) continue;
      engineSubsidies.push({
        subsidyProgramId: subsidyId,
        name: subsidyId,
        reductionType: meta.reductionType as 'percentage' | 'fixed',
        reductionValue: meta.reductionValue,
      });
    }

    const { subsidies: entitySubsidyEffects } = computeSubsidyEffects(
      engineLines,
      engineSubsidies,
      subsidyCategoryMap,
      lineInvoiceMap,
    );

    // Accumulate per-subsidy totals
    for (const effect of entitySubsidyEffects) {
      const existing = perSubsidyPayback.get(effect.subsidyProgramId);
      if (existing) {
        existing.min += effect.minPayback;
        existing.max += effect.maxPayback;
      } else {
        perSubsidyPayback.set(effect.subsidyProgramId, {
          min: effect.minPayback,
          max: effect.maxPayback,
        });
      }
    }
  }

  // Build per-subsidy totals and cap metadata for applySubsidyCaps
  const perSubsidyTotals: PerSubsidyTotals[] = [];
  for (const [subsidyProgramId, totals] of perSubsidyPayback) {
    perSubsidyTotals.push({
      subsidyProgramId,
      uncappedMinPayback: totals.min,
      uncappedMaxPayback: totals.max,
    });
  }

  const subsidyCapMeta: SubsidyCapMeta[] = subsidyRows.map((row) => ({
    subsidyProgramId: row.subsidyId,
    name: row.name,
    reductionType: row.reductionType as 'percentage' | 'fixed',
    reductionValue: row.reductionValue,
    maximumAmount: row.maximumAmount,
  }));

  const capResult = applySubsidyCaps(perSubsidyTotals, subsidyCapMeta);

  const oversubscribedSubsidies: OversubscribedSubsidy[] = capResult.oversubscribedSubsidies.map(
    (s) => ({
      subsidyProgramId: s.subsidyProgramId,
      name: s.name,
      maximumAmount: s.maximumAmount,
      maxPayout: s.maxPayout,
      uncappedMinPayback: s.uncappedMinPayback,
      uncappedMaxPayback: s.uncappedMaxPayback,
      minExcess: s.minExcess,
      maxExcess: s.maxExcess,
    }),
  );

  const subsidySummary = {
    totalReductions,
    activeSubsidyCount: subsidyCountRow?.activeSubsidyCount ?? 0,
    minTotalPayback: capResult.cappedMinPayback,
    maxTotalPayback: capResult.cappedMaxPayback,
    oversubscribedSubsidies,
  };

  // ── 10. Remaining-funds perspectives ───────────────────────────────────────
  const remainingVsMinPlanned = availableFunds - totalMinPlanned;
  const remainingVsMaxPlanned = availableFunds - totalMaxPlanned;
  const remainingVsActualCost = availableFunds - actualCost;
  const remainingVsActualPaid = availableFunds - actualCostPaid;
  const remainingVsActualClaimed = availableFunds - actualCostClaimed;

  // Payback-adjusted remaining perspectives (using capped payback values)
  const remainingVsMinPlannedWithPayback =
    availableFunds + capResult.cappedMinPayback - totalMinPlanned;
  const remainingVsMaxPlannedWithPayback =
    availableFunds + capResult.cappedMaxPayback - totalMaxPlanned;

  return {
    availableFunds,
    sourceCount,
    minPlanned: totalMinPlanned,
    maxPlanned: totalMaxPlanned,
    actualCost,
    actualCostPaid,
    actualCostClaimed,
    remainingVsMinPlanned,
    remainingVsMaxPlanned,
    remainingVsActualCost,
    remainingVsActualPaid,
    remainingVsActualClaimed,
    remainingVsMinPlannedWithPayback,
    remainingVsMaxPlannedWithPayback,
    subsidySummary,
  };
}
