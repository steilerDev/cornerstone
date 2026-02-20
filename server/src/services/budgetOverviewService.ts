import { sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import type { BudgetOverview, CategoryBudgetSummary } from '@cornerstone/shared';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

/**
 * Get the full project-level budget overview, aggregating data from work items,
 * budget categories, budget sources, vendors/invoices, and subsidy programs.
 */
export function getBudgetOverview(db: DbType): BudgetOverview {
  // ── 1. Project-level totals from work_items ──────────────────────────────
  const totalsRow = db.get<{ plannedBudget: number | null; actualCost: number | null }>(
    sql`SELECT
      COALESCE(SUM(planned_budget), 0) AS plannedBudget,
      COALESCE(SUM(actual_cost), 0)    AS actualCost
    FROM work_items`,
  );

  const totalPlannedBudget = totalsRow?.plannedBudget ?? 0;
  const totalActualCost = totalsRow?.actualCost ?? 0;
  const totalVariance = totalPlannedBudget - totalActualCost;

  // ── 2. Category summaries ─────────────────────────────────────────────────
  // All categories (even with no work items), plus uncategorised work items.
  // LEFT JOIN budget_categories → work_items to include 0-count categories.
  const categoryRows = db.all<{
    categoryId: string;
    categoryName: string;
    categoryColor: string | null;
    plannedBudget: number;
    actualCost: number;
    workItemCount: number;
  }>(
    sql`SELECT
      bc.id            AS categoryId,
      bc.name          AS categoryName,
      bc.color         AS categoryColor,
      COALESCE(SUM(wi.planned_budget), 0) AS plannedBudget,
      COALESCE(SUM(wi.actual_cost),    0) AS actualCost,
      COUNT(wi.id)                        AS workItemCount
    FROM budget_categories bc
    LEFT JOIN work_items wi ON wi.budget_category_id = bc.id
    GROUP BY bc.id, bc.name, bc.color
    ORDER BY bc.sort_order ASC, bc.name ASC`,
  );

  const categorySummaries: CategoryBudgetSummary[] = categoryRows.map((row) => ({
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    categoryColor: row.categoryColor,
    plannedBudget: row.plannedBudget,
    actualCost: row.actualCost,
    variance: row.plannedBudget - row.actualCost,
    workItemCount: row.workItemCount,
  }));

  // ── 3. Financing summary (budget sources) ─────────────────────────────────
  // totalAvailable = SUM(total_amount) for active sources
  // totalUsed      = SUM(actual_cost) for work items that reference an active source
  const financingRow = db.get<{
    totalAvailable: number | null;
    sourceCount: number;
  }>(
    sql`SELECT
      COALESCE(SUM(total_amount), 0) AS totalAvailable,
      COUNT(*)                       AS sourceCount
    FROM budget_sources
    WHERE status = 'active'`,
  );

  const financingUsedRow = db.get<{ totalUsed: number | null }>(
    sql`SELECT COALESCE(SUM(wi.actual_cost), 0) AS totalUsed
    FROM work_items wi
    INNER JOIN budget_sources bs ON bs.id = wi.budget_source_id
    WHERE bs.status = 'active'`,
  );

  const financingTotalAvailable = financingRow?.totalAvailable ?? 0;
  const financingTotalUsed = financingUsedRow?.totalUsed ?? 0;

  const financingSummary = {
    totalAvailable: financingTotalAvailable,
    totalUsed: financingTotalUsed,
    totalRemaining: financingTotalAvailable - financingTotalUsed,
    sourceCount: financingRow?.sourceCount ?? 0,
  };

  // ── 4. Vendor summary (invoices) ──────────────────────────────────────────
  const invoiceRow = db.get<{
    totalPaid: number | null;
    totalOutstanding: number | null;
  }>(
    sql`SELECT
      COALESCE(SUM(CASE WHEN status = 'paid'                   THEN amount ELSE 0 END), 0) AS totalPaid,
      COALESCE(SUM(CASE WHEN status IN ('pending', 'overdue')  THEN amount ELSE 0 END), 0) AS totalOutstanding
    FROM invoices`,
  );

  const vendorCountRow = db.get<{ vendorCount: number }>(
    sql`SELECT COUNT(DISTINCT vendor_id) AS vendorCount FROM invoices`,
  );

  const vendorSummary = {
    totalPaid: invoiceRow?.totalPaid ?? 0,
    totalOutstanding: invoiceRow?.totalOutstanding ?? 0,
    vendorCount: vendorCountRow?.vendorCount ?? 0,
  };

  // ── 5. Subsidy summary ────────────────────────────────────────────────────
  // activeSubsidyCount = programs not rejected
  // totalReductions    = sum of computed reductions across all work item ↔ subsidy links
  //   For 'percentage' type: work_item.planned_budget * (reduction_value / 100)
  //   For 'fixed' type:      reduction_value (capped at planned_budget if available)
  const subsidyCountRow = db.get<{ activeSubsidyCount: number }>(
    sql`SELECT COUNT(*) AS activeSubsidyCount
    FROM subsidy_programs
    WHERE application_status != 'rejected'`,
  );

  const subsidyReductionRow = db.get<{ totalReductions: number | null }>(
    sql`SELECT COALESCE(SUM(
      CASE
        WHEN sp.reduction_type = 'percentage' AND wi.planned_budget IS NOT NULL
          THEN wi.planned_budget * sp.reduction_value / 100.0
        WHEN sp.reduction_type = 'fixed'
          THEN sp.reduction_value
        ELSE 0
      END
    ), 0) AS totalReductions
    FROM work_item_subsidies wis
    INNER JOIN subsidy_programs sp ON sp.id = wis.subsidy_program_id
    INNER JOIN work_items wi ON wi.id = wis.work_item_id
    WHERE sp.application_status != 'rejected'`,
  );

  const subsidySummary = {
    totalReductions: subsidyReductionRow?.totalReductions ?? 0,
    activeSubsidyCount: subsidyCountRow?.activeSubsidyCount ?? 0,
  };

  return {
    totalPlannedBudget,
    totalActualCost,
    totalVariance,
    categorySummaries,
    financingSummary,
    vendorSummary,
    subsidySummary,
  };
}
