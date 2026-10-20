import { sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import { CONFIDENCE_MARGINS, effectivePlannedAmount } from '@cornerstone/shared';
import type { BudgetOverview, OversubscribedSubsidy } from '@cornerstone/shared';
import {
  computeDepositAwareAggregates,
  type DepositAwareRow,
} from './shared/depositAggregateUtils.js';
import { computeMoney, toMajor } from './shared/moneyEngine.js';
import { loadMoneyInput, type ProjectMoney } from './moneyService.js';

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
 *
 * Grant-derived fields (`subsidySummary`, the payback-adjusted remaining figures) come from the
 * money service (ADR-039, #2228): counted (approved/received) grants only, capped, per scenario.
 * The legacy cost fields (`minPlanned`, `actualCost*`, `remainingVs*` without payback) are
 * unchanged until their last consumer moves to the money service.
 *
 *   Available Funds = SUM(active budget_sources.total_amount)
 *   Actual Cost     = SUM(invoice_budget_lines.itemized_amount WHERE work_item_budget_id IS NOT NULL)
 *   Actual Paid     = SUM(invoice_budget_lines.itemized_amount WHERE work_item_budget_id IS NOT NULL AND invoices.status IN ('paid', 'claimed'))
 */
export function getBudgetOverview(
  db: DbType,
  vatRate: number,
  project?: Pick<ProjectMoney, 'result'>,
): BudgetOverview {
  const money = project ?? { result: computeMoney(loadMoneyInput(db, vatRate)) };
  // ─── Library Adoption Opportunity: SQLite percentile functions ────────────
  //
  // better-sqlite3 12.10.0 (PR #1527) ships SQLite 3.53.1, which exposes
  // native aggregate functions:
  //
  //   percentile_cont(0.5) WITHIN GROUP (ORDER BY column)  -- interpolated median
  //   percentile_disc(0.75) WITHIN GROUP (ORDER BY column) -- discrete P75 (actual sample)
  //
  // No extension loading is required; these are builtins in SQLite ≥ 3.53.
  //
  // Future analytics that would benefit from these:
  //
  //   Median planned_amount across all budget lines:
  //     SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY planned_amount)
  //     FROM work_item_budgets WHERE work_item_id IS NOT NULL
  //
  //   75th-percentile invoice amount (useful for outlier detection):
  //     SELECT percentile_disc(0.75) WITHIN GROUP (ORDER BY amount)
  //     FROM invoices WHERE status IN ('pending', 'paid', 'claimed')
  //
  //   Median work-item duration (days) for project timeline insights:
  //     SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_days)
  //     FROM work_items WHERE duration_days IS NOT NULL
  //
  // Edge cases to remember when implementing:
  //   - Both functions return NULL for an empty (or all-NULL) input set.
  //     Always COALESCE(percentile_cont(...), 0) or handle NULL in the caller.
  //   - percentile_cont interpolates between values (may produce non-integer
  //     results for integer columns). percentile_disc always returns an actual
  //     value from the dataset.
  //   - The WITHIN GROUP clause is required; the argument N must be a literal
  //     float constant in [0, 1].
  //
  // When implementing: use db.get<{ value: number | null }>(sql`SELECT
  //   COALESCE(percentile_cont(0.5) WITHIN GROUP (ORDER BY planned_amount), 0)
  //   AS value FROM work_item_budgets WHERE work_item_id IS NOT NULL`)
  // and surface the result as a new field on the BudgetOverview type.
  // ─────────────────────────────────────────────────────────────────────────
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
  // Note: work_item_budgets must filter WHERE work_item_id IS NOT NULL to exclude orphan rows
  const budgetLines = db.all<{
    id: string;
    entityId: string;
    plannedAmount: number;
    confidence: string;
    budgetCategoryId: string | null;
    includesVat: number | null;
  }>(
    sql`SELECT
      id              AS id,
      work_item_id    AS entityId,
      planned_amount  AS plannedAmount,
      confidence      AS confidence,
      budget_category_id AS budgetCategoryId,
      includes_vat    AS includesVat
    FROM work_item_budgets
    WHERE work_item_id IS NOT NULL
    UNION ALL
    SELECT
      id              AS id,
      household_item_id AS entityId,
      planned_amount  AS plannedAmount,
      confidence      AS confidence,
      budget_category_id AS budgetCategoryId,
      includes_vat    AS includesVat
    FROM household_item_budgets`,
  );

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

  // ── 7. Compute per-line planned amounts ──────────────────────────────────────
  let totalMinPlanned = 0;
  let totalMaxPlanned = 0;

  // VAT helper: convert stored net amount to effective amount if VAT not included
  // SQLite returns 0/1 for boolean, so includesVat === 0 means false (VAT should be applied)
  const effective = (l: { plannedAmount: number; includesVat: number | null }): number =>
    effectivePlannedAmount(
      { plannedAmount: l.plannedAmount, includesVat: l.includesVat !== 0 },
      vatRate,
    );

  for (const line of budgetLines) {
    const margin = CONFIDENCE_MARGINS[line.confidence as keyof typeof CONFIDENCE_MARGINS] ?? 0;
    const rawMin = effective(line) * (1 - margin);
    const rawMax = effective(line) * (1 + margin);

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

  // ── 8. Actual costs from invoices linked to budget lines (deposit-aware, all statuses including quotation per ADR-029) ──
  // Include both work item and household item invoices
  // Includes deposits split proportionally by amount
  const overviewRows = db.all<DepositAwareRow>(
    sql`SELECT
      ibl.id              AS ibl_id,
      ibl.itemized_amount AS itemized_amount,
      i.id                AS invoice_id,
      i.amount            AS invoice_amount,
      i.status            AS invoice_status,
      d.id                AS deposit_id,
      d.amount            AS deposit_amount,
      d.status            AS deposit_status,
      d.entry_type        AS deposit_entry_type
    FROM invoice_budget_lines ibl
    INNER JOIN invoices i ON i.id = ibl.invoice_id
    LEFT JOIN invoice_deposits d ON d.invoice_id = i.id`,
  );

  const { actualCost, actualCostPaid, actualCostClaimed } =
    computeDepositAwareAggregates(overviewRows);

  // ── 9. Subsidy summary ───────────────────────────────────────────────────
  const subsidyCountRow = db.get<{ activeSubsidyCount: number }>(
    sql`SELECT COUNT(*) AS activeSubsidyCount
    FROM subsidy_programs
    WHERE application_status != 'rejected'`,
  );

  // ── 9a. Grant-derived figures from the money service (ADR-039) ───────────
  // Counted (approved/received) grants only, capped, recomputed per scenario:
  // expected -> totalReductions, best -> minTotalPayback, worst -> maxTotalPayback.
  const { expectedGrants, grants } = money.result;
  const oversubscribedSubsidies: OversubscribedSubsidy[] = grants
    .filter((g) => g.capped)
    .map((g) => ({
      subsidyProgramId: g.input.id,
      name: g.input.name,
      maximumAmount: g.input.maximumAmount ?? 0,
      maxPayout: toMajor(g.payout.worst),
      uncappedMinPayback: toMajor(g.uncapped.best),
      uncappedMaxPayback: toMajor(g.uncapped.worst),
      minExcess: toMajor(Math.max(0, g.uncapped.best - g.payout.best)),
      maxExcess: toMajor(g.uncapped.worst - g.payout.worst),
    }));

  const minTotalPayback = toMajor(expectedGrants.best);
  const maxTotalPayback = toMajor(expectedGrants.worst);

  const subsidySummary = {
    totalReductions: toMajor(expectedGrants.expected),
    activeSubsidyCount: subsidyCountRow?.activeSubsidyCount ?? 0,
    minTotalPayback,
    maxTotalPayback,
    oversubscribedSubsidies,
  };

  // ── 10. Remaining-funds perspectives ───────────────────────────────────────
  const remainingVsMinPlanned = availableFunds - totalMinPlanned;
  const remainingVsMaxPlanned = availableFunds - totalMaxPlanned;
  const remainingVsActualCost = availableFunds - actualCost;
  const remainingVsActualPaid = availableFunds - actualCostPaid;
  const remainingVsActualClaimed = availableFunds - actualCostClaimed;

  // Payback-adjusted remaining perspectives (money service payback, ADR-039)
  const remainingVsMinPlannedWithPayback = availableFunds + minTotalPayback - totalMinPlanned;
  const remainingVsMaxPlannedWithPayback = availableFunds + maxTotalPayback - totalMaxPlanned;

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
