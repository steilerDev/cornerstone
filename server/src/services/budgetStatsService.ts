import { sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import type { BudgetStats } from '@cornerstone/shared';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

/**
 * Compute percentile statistics for invoice line amounts and work-item budget amounts.
 *
 * Uses SQLite's native percentile_cont aggregate function, available in
 * better-sqlite3 12.10.0+ (SQLite ≥ 3.49.x). No extension loading is required.
 *
 * Returns null for each field when the corresponding table has no rows.
 */
export function getBudgetStats(db: DbType): BudgetStats {
  // ── Invoice line percentiles ──────────────────────────────────────────────
  const invoiceRow = db.get<{
    medianAmount: number | null;
    p75Amount: number | null;
  }>(
    sql`SELECT
      percentile_cont(0.5) WITHIN GROUP (ORDER BY itemized_amount) AS medianAmount,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY itemized_amount) AS p75Amount
    FROM invoice_budget_lines`,
  );

  // ── Work-item budget percentiles ──────────────────────────────────────────
  const wibRow = db.get<{
    medianPlanned: number | null;
    p75Planned: number | null;
  }>(
    sql`SELECT
      percentile_cont(0.5) WITHIN GROUP (ORDER BY planned_amount) AS medianPlanned,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY planned_amount) AS p75Planned
    FROM work_item_budgets
    WHERE work_item_id IS NOT NULL`,
  );

  return {
    invoiceLines: {
      medianAmount: invoiceRow?.medianAmount ?? null,
      p75Amount: invoiceRow?.p75Amount ?? null,
    },
    workItemBudgets: {
      medianPlanned: wibRow?.medianPlanned ?? null,
      p75Planned: wibRow?.p75Planned ?? null,
    },
  };
}
