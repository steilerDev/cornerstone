/**
 * Shared utilities for computing deposit-aware aggregates.
 *
 * When invoices have deposits, budget line amounts need to be split proportionally:
 * - Each deposit contributes (deposit.amount / invoice.amount) × ibl.itemized_amount under the deposit's status
 * - The residual ((invoice.amount − Σ deposits) / invoice.amount) × ibl.itemized_amount contributes under the parent invoice's status
 *
 * This pattern is used across budgetServiceFactory, budgetSourceService, and budgetOverviewService.
 */

/**
 * Raw row type for (invoice_budget_line, invoice, deposit?) jointures.
 * Used by computeDepositAwareAggregates to compute proportional splits.
 */
export interface DepositAwareRow {
  ibl_id: string;
  itemized_amount: number;
  invoice_id: string;
  invoice_amount: number;
  invoice_status: string;
  deposit_id: string | null;
  deposit_amount: number | null;
  deposit_status: string | null;
}

/**
 * Result of splitting an invoice by its deposits (proportional and residual portions).
 * Used internally by deposit-aware aggregate functions to avoid repeated grouping/dedup logic.
 */
export interface InvoiceDepositSplit {
  invoiceStatus: string;
  invoiceAmount: number;
  residualFraction: number;
  depositFractions: Array<{ depositStatus: string; fraction: number }>;
}

/**
 * Extract invoice-level splits by depositing the entire amount into fractional buckets.
 *
 * For each unique invoice in the input rows:
 *   1. Deduplicate deposits by depositId
 *   2. Compute residual fraction: max(0, invoiceAmount - Σ depositAmounts) / safeInvoiceAmount
 *   3. Compute per-deposit fractions: depositAmount / safeInvoiceAmount
 *   4. Return a map from invoiceId to split details
 *
 * safeInvoiceAmount avoids division by zero: use invoiceAmount if > 0, else 1.
 *
 * @param rows Rows from (invoices LEFT JOIN invoice_deposits), keyed by invoice_id
 * @returns Map<invoiceId, split>
 */
export function splitByDeposits(
  rows: Array<{
    invoice_id: string;
    invoice_amount: number;
    invoice_status: string;
    deposit_id: string | null;
    deposit_amount: number | null;
    deposit_status: string | null;
  }>,
): Map<string, InvoiceDepositSplit> {
  const invoiceMap = new Map<string, { invoiceAmount: number; invoiceStatus: string }>();
  const depositsByInvoice = new Map<
    string,
    Array<{ depositId: string; depositAmount: number; depositStatus: string }>
  >();

  // Group rows by invoice and deduplicate deposits by depositId
  for (const row of rows) {
    if (!invoiceMap.has(row.invoice_id)) {
      invoiceMap.set(row.invoice_id, {
        invoiceAmount: row.invoice_amount,
        invoiceStatus: row.invoice_status,
      });
    }
    if (row.deposit_id !== null && row.deposit_amount !== null && row.deposit_status !== null) {
      const deps = depositsByInvoice.get(row.invoice_id) ?? [];
      if (!deps.some((d) => d.depositId === row.deposit_id)) {
        deps.push({
          depositId: row.deposit_id,
          depositAmount: row.deposit_amount,
          depositStatus: row.deposit_status,
        });
        depositsByInvoice.set(row.invoice_id, deps);
      }
    }
  }

  // Compute splits for each invoice
  const result = new Map<string, InvoiceDepositSplit>();
  for (const [invoiceId, inv] of invoiceMap) {
    const deposits = depositsByInvoice.get(invoiceId) ?? [];
    const safeInvoiceAmount = inv.invoiceAmount > 0 ? inv.invoiceAmount : 1;

    if (deposits.length === 0) {
      // No deposits: entire invoice contributes under its own status
      result.set(invoiceId, {
        invoiceStatus: inv.invoiceStatus,
        invoiceAmount: inv.invoiceAmount,
        residualFraction: 1,
        depositFractions: [],
      });
    } else {
      const totalDepositAmount = deposits.reduce((s, d) => s + d.depositAmount, 0);
      const residualFraction =
        Math.max(0, safeInvoiceAmount - totalDepositAmount) / safeInvoiceAmount;
      const depositFractions = deposits.map((d) => ({
        depositStatus: d.depositStatus,
        fraction: d.depositAmount / safeInvoiceAmount,
      }));

      result.set(invoiceId, {
        invoiceStatus: inv.invoiceStatus,
        invoiceAmount: inv.invoiceAmount,
        residualFraction,
        depositFractions,
      });
    }
  }

  return result;
}

/**
 * Computes actualCost, actualCostPaid, and invoiceCount from a set of
 * (invoice_budget_lines JOIN invoices LEFT JOIN invoice_deposits) rows.
 *
 * Each invoice's contribution is split proportionally: each deposit contributes
 * (deposit.amount / invoice.amount) × ibl.itemized_amount under the deposit's status.
 * The residual ((invoice.amount − Σ deposits) / invoice.amount) × ibl.itemized_amount
 * contributes under the parent invoice's status.
 *
 * When an invoice has no deposits, the entire ibl.itemized_amount contributes under
 * the parent invoice's status (identical to pre-deposit behaviour).
 *
 * actualCost includes all invoice statuses including quotation (ADR-029).
 * actualCostPaid = sum of contributions where status is 'paid' or 'claimed'.
 */
export function computeDepositAwareAggregates(rows: DepositAwareRow[]): {
  actualCost: number;
  actualCostPaid: number;
  actualCostClaimed: number;
  invoiceCount: number;
} {
  if (rows.length === 0) {
    return { actualCost: 0, actualCostPaid: 0, actualCostClaimed: 0, invoiceCount: 0 };
  }

  // Group rows by ibl_id to deduplicate
  const iblMap = new Map<
    string,
    {
      itemizedAmount: number;
      invoiceId: string;
      invoiceStatus: string;
    }
  >();

  for (const row of rows) {
    if (!iblMap.has(row.ibl_id)) {
      iblMap.set(row.ibl_id, {
        itemizedAmount: row.itemized_amount,
        invoiceId: row.invoice_id,
        invoiceStatus: row.invoice_status,
      });
    }
  }

  // Split each invoice by its deposits
  const splitsByInvoiceId = splitByDeposits(rows);

  const invoiceIds = new Set<string>();
  let actualCost = 0;
  let actualCostPaid = 0;
  let actualCostClaimed = 0;

  for (const [_iblId, ibl] of iblMap) {
    invoiceIds.add(ibl.invoiceId);
    actualCost += ibl.itemizedAmount;

    const split = splitsByInvoiceId.get(ibl.invoiceId)!;

    // Residual contribution under parent invoice status
    const residualAmount = ibl.itemizedAmount * split.residualFraction;
    if (split.invoiceStatus === 'paid' || split.invoiceStatus === 'claimed') {
      actualCostPaid += residualAmount;
    }
    if (split.invoiceStatus === 'claimed') {
      actualCostClaimed += residualAmount;
    }

    // Per-deposit contributions
    for (const df of split.depositFractions) {
      const depositContribution = ibl.itemizedAmount * df.fraction;
      if (df.depositStatus === 'paid' || df.depositStatus === 'claimed') {
        actualCostPaid += depositContribution;
      }
      if (df.depositStatus === 'claimed') {
        actualCostClaimed += depositContribution;
      }
    }
  }

  return {
    actualCost,
    actualCostPaid,
    actualCostClaimed,
    invoiceCount: invoiceIds.size,
  };
}

/**
 * Computes the sum of contributions that match a specific status (for budgetSourceService).
 * Used for claimed/unclaimed/paid amount calculations.
 *
 * Only counts contributions where the status matches the target (either the deposit status
 * if deposits exist, or the parent invoice status if no deposits).
 */
export function computeStatusContribution(
  rows: Array<{
    ibl_id: string;
    itemized_amount: number;
    invoice_id: string;
    invoice_amount: number;
    invoice_status: string;
    deposit_id: string | null;
    deposit_amount: number | null;
    deposit_status: string | null;
  }>,
  targetStatus: string,
): number {
  if (rows.length === 0) {
    return 0;
  }

  // Group rows by ibl_id to deduplicate
  const iblMap = new Map<
    string,
    {
      itemizedAmount: number;
      invoiceId: string;
    }
  >();

  for (const row of rows) {
    if (!iblMap.has(row.ibl_id)) {
      iblMap.set(row.ibl_id, {
        itemizedAmount: row.itemized_amount,
        invoiceId: row.invoice_id,
      });
    }
  }

  // Split each invoice by its deposits
  const splitsByInvoiceId = splitByDeposits(rows);

  let total = 0;

  for (const [_iblId, ibl] of iblMap) {
    const split = splitsByInvoiceId.get(ibl.invoiceId)!;

    // Residual contribution under parent invoice status
    const residualAmount = ibl.itemizedAmount * split.residualFraction;
    if (split.invoiceStatus === targetStatus) {
      total += residualAmount;
    }

    // Per-deposit contributions
    for (const df of split.depositFractions) {
      if (df.depositStatus === targetStatus) {
        const depositContribution = ibl.itemizedAmount * df.fraction;
        total += depositContribution;
      }
    }
  }

  return total;
}

/**
 * Raw row for (invoices LEFT JOIN invoice_deposits) jointures, used by the
 * InvoiceStatusBreakdown summary computation in invoiceService.listAllInvoices.
 */
export interface InvoiceDepositRow {
  invoice_id: string;
  invoice_amount: number;
  invoice_status: string;
  deposit_id: string | null;
  deposit_amount: number | null;
  deposit_status: string | null;
}

/**
 * Computes the InvoiceStatusBreakdown summary from (invoices LEFT JOIN invoice_deposits) rows.
 *
 * Per-invoice split (same as the budget-line rollup formula but at the invoice level):
 *   summary[I.status].totalAmount += max(0, I.amount − Σ deposits.amount)
 *   summary[deposit.status].totalAmount += deposit.amount  (for each deposit)
 *   summary[I.status].count += 1  (once per invoice, regardless of deposit rows)
 *
 * Invariant: Σ summary[s].totalAmount === Σ I.amount across all invoices in the input.
 *
 * Returns a sparse map — callers must merge with defaults (e.g. { count: 0, totalAmount: 0 }).
 */
export function aggregateInvoiceStatusBreakdown(
  rows: InvoiceDepositRow[],
): Record<string, { count: number; totalAmount: number }> {
  if (rows.length === 0) return {};

  // Split each invoice by its deposits
  const splitsByInvoiceId = splitByDeposits(rows);

  const result: Record<string, { count: number; totalAmount: number }> = {};
  const ensure = (status: string) => {
    if (!result[status]) result[status] = { count: 0, totalAmount: 0 };
  };

  for (const [_invoiceId, split] of splitsByInvoiceId) {
    const S = split.invoiceStatus;
    ensure(S);
    result[S]!.count += 1;

    // Residual contribution under parent invoice status
    const residualAmount = split.invoiceAmount * split.residualFraction;
    result[S]!.totalAmount += residualAmount;

    // Per-deposit contributions
    for (const df of split.depositFractions) {
      ensure(df.depositStatus);
      const depositAmount = split.invoiceAmount * df.fraction;
      result[df.depositStatus]!.totalAmount += depositAmount;
    }
  }

  return result;
}
