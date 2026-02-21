import { sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import type { BudgetOverview, CategoryBudgetSummary } from '@cornerstone/shared';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

/**
 * Get the full project-level budget overview, aggregating data from work_item_budgets,
 * budget categories, budget sources, vendors/invoices, and subsidy programs.
 *
 * Updated for EPIC-05 Story 5.9: budget data is now in work_item_budgets, not work_items.
 *
 * Cost semantics:
 *   - totalPlannedBudget: SUM of planned_amount across all work_item_budgets
 *   - totalActualCost: SUM of invoice amounts linked to a work_item_budget (work_item_budget_id IS NOT NULL)
 *   - financingSummary.totalUsed: SUM of invoices for budget lines tied to an active source
 *   - categorySummaries.actualCost: SUM of invoices for budget lines in that category
 *   - vendorSummary: ALL invoices (regardless of budget line link)
 */
export function getBudgetOverview(db: DbType): BudgetOverview {
  // ── 1. Project-level totals ────────────────────────────────────────────────
  // plannedBudget from work_item_budgets.planned_amount
  // actualCost from invoices linked to a budget line (work_item_budget_id IS NOT NULL)
  const totalsRow = db.get<{ plannedBudget: number | null; actualCost: number | null }>(
    sql`SELECT
      COALESCE(SUM(planned_amount), 0) AS plannedBudget,
      COALESCE((
        SELECT SUM(amount)
        FROM invoices
        WHERE work_item_budget_id IS NOT NULL
      ), 0) AS actualCost
    FROM work_item_budgets`,
  );

  const totalPlannedBudget = totalsRow?.plannedBudget ?? 0;
  const totalActualCost = totalsRow?.actualCost ?? 0;
  const totalVariance = totalPlannedBudget - totalActualCost;

  // ── 2. Category summaries ─────────────────────────────────────────────────
  // All categories (even with no budget lines), plus the aggregate for each.
  // LEFT JOIN budget_categories → work_item_budgets to include 0-count categories.
  // actualCost per category = SUM of invoices linked to budget lines in that category.
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
      COALESCE(SUM(wib.planned_amount), 0)                          AS plannedBudget,
      COALESCE((
        SELECT SUM(inv.amount)
        FROM invoices inv
        INNER JOIN work_item_budgets wib2 ON wib2.id = inv.work_item_budget_id
        WHERE wib2.budget_category_id = bc.id
      ), 0)                                                          AS actualCost,
      COUNT(DISTINCT wib.work_item_id)                              AS workItemCount
    FROM budget_categories bc
    LEFT JOIN work_item_budgets wib ON wib.budget_category_id = bc.id
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
  // totalUsed      = SUM of invoice amounts for budget lines linked to active sources
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
    sql`SELECT COALESCE(SUM(inv.amount), 0) AS totalUsed
    FROM invoices inv
    INNER JOIN work_item_budgets wib ON wib.id = inv.work_item_budget_id
    INNER JOIN budget_sources bs ON bs.id = wib.budget_source_id
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
  // Counts only invoices NOT linked to a budget line (work_item_budget_id IS NULL).
  // Budget-line-linked invoices are tracked under work item / category cost metrics.
  // "Free-floating" vendor invoices represent direct vendor payments not tied to a specific budget line.
  const invoiceRow = db.get<{
    totalPaid: number | null;
    totalOutstanding: number | null;
  }>(
    sql`SELECT
      COALESCE(SUM(CASE WHEN status = 'paid'                     THEN amount ELSE 0 END), 0) AS totalPaid,
      COALESCE(SUM(CASE WHEN status IN ('pending', 'claimed')    THEN amount ELSE 0 END), 0) AS totalOutstanding
    FROM invoices
    WHERE work_item_budget_id IS NULL`,
  );

  const vendorCountRow = db.get<{ vendorCount: number }>(
    sql`SELECT COUNT(DISTINCT vendor_id) AS vendorCount FROM invoices WHERE work_item_budget_id IS NULL`,
  );

  const vendorSummary = {
    totalPaid: invoiceRow?.totalPaid ?? 0,
    totalOutstanding: invoiceRow?.totalOutstanding ?? 0,
    vendorCount: vendorCountRow?.vendorCount ?? 0,
  };

  // ── 5. Subsidy summary ────────────────────────────────────────────────────
  // activeSubsidyCount = programs not rejected
  // totalReductions    = sum of computed reductions across all work item ↔ subsidy links
  //   For 'percentage' type: SUM(wib.planned_amount) * (reduction_value / 100)
  //   For 'fixed' type:      reduction_value per linked work item
  const subsidyCountRow = db.get<{ activeSubsidyCount: number }>(
    sql`SELECT COUNT(*) AS activeSubsidyCount
    FROM subsidy_programs
    WHERE application_status != 'rejected'`,
  );

  const subsidyReductionRow = db.get<{ totalReductions: number | null }>(
    sql`SELECT COALESCE(SUM(
      CASE
        WHEN sp.reduction_type = 'percentage'
          THEN (
            SELECT COALESCE(SUM(wib2.planned_amount), 0)
            FROM work_item_budgets wib2
            WHERE wib2.work_item_id = wis.work_item_id
          ) * sp.reduction_value / 100.0
        WHEN sp.reduction_type = 'fixed'
          THEN sp.reduction_value
        ELSE 0
      END
    ), 0) AS totalReductions
    FROM work_item_subsidies wis
    INNER JOIN subsidy_programs sp ON sp.id = wis.subsidy_program_id
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
