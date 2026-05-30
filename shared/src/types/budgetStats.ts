/**
 * Budget statistics types for Issue #1571.
 * Percentile aggregations over invoice line amounts and work-item budget amounts,
 * powered by SQLite's native percentile_cont aggregate (available in better-sqlite3 12.10.0+).
 */

export interface BudgetStats {
  invoiceLines: {
    /** percentile_cont(0.5) over all invoice_budget_lines.itemized_amount; null when no rows exist */
    medianAmount: number | null;
    /** percentile_cont(0.75) over all invoice_budget_lines.itemized_amount; null when no rows exist */
    p75Amount: number | null;
  };
  workItemBudgets: {
    /** percentile_cont(0.5) over work_item_budgets.planned_amount WHERE work_item_id IS NOT NULL; null when no rows exist */
    medianPlanned: number | null;
    /** percentile_cont(0.75) over work_item_budgets.planned_amount WHERE work_item_id IS NOT NULL; null when no rows exist */
    p75Planned: number | null;
  };
}

export interface BudgetStatsResponse {
  stats: BudgetStats;
}
