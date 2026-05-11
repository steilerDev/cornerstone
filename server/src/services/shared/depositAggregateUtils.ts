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
 * actualCost excludes quotation invoices (matching existing behaviour).
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

  // Group rows by ibl_id to deduplicate and collect deposits per invoice
  const iblMap = new Map<
    string,
    {
      itemizedAmount: number;
      invoiceId: string;
      invoiceAmount: number;
      invoiceStatus: string;
    }
  >();
  const depositsByInvoice = new Map<
    string,
    Array<{ depositId: string; depositAmount: number; depositStatus: string }>
  >();

  for (const row of rows) {
    if (!iblMap.has(row.ibl_id)) {
      iblMap.set(row.ibl_id, {
        itemizedAmount: row.itemized_amount,
        invoiceId: row.invoice_id,
        invoiceAmount: row.invoice_amount,
        invoiceStatus: row.invoice_status,
      });
    }
    if (row.deposit_id !== null && row.deposit_amount !== null && row.deposit_status !== null) {
      const deps = depositsByInvoice.get(row.invoice_id) ?? [];
      // Avoid duplicates (same deposit appears once per ibl row for this invoice)
      if (!deps.find((d) => d.depositId === row.deposit_id)) {
        deps.push({
          depositId: row.deposit_id,
          depositAmount: row.deposit_amount,
          depositStatus: row.deposit_status,
        });
        depositsByInvoice.set(row.invoice_id, deps);
      }
    }
  }

  const invoiceIds = new Set<string>();
  let actualCost = 0;
  let actualCostPaid = 0;
  let actualCostClaimed = 0;

  for (const [_iblId, ibl] of iblMap) {
    invoiceIds.add(ibl.invoiceId);
    // Skip quotations from actualCost (matches existing behavior)
    if (ibl.invoiceStatus === 'quotation') continue;

    actualCost += ibl.itemizedAmount;

    const deposits = depositsByInvoice.get(ibl.invoiceId) ?? [];
    if (deposits.length === 0) {
      // No deposits: entire ibl contributes under parent invoice status
      if (ibl.invoiceStatus === 'paid' || ibl.invoiceStatus === 'claimed') {
        actualCostPaid += ibl.itemizedAmount;
      }
      if (ibl.invoiceStatus === 'claimed') {
        actualCostClaimed += ibl.itemizedAmount;
      }
    } else {
      const totalDepositAmount = deposits.reduce((s, d) => s + d.depositAmount, 0);
      const safeInvoiceAmount = ibl.invoiceAmount > 0 ? ibl.invoiceAmount : 1;

      // Residual contribution under parent invoice status
      const residualFraction =
        Math.max(0, safeInvoiceAmount - totalDepositAmount) / safeInvoiceAmount;
      const residualAmount = ibl.itemizedAmount * residualFraction;
      if (ibl.invoiceStatus === 'paid' || ibl.invoiceStatus === 'claimed') {
        actualCostPaid += residualAmount;
      }
      if (ibl.invoiceStatus === 'claimed') {
        actualCostClaimed += residualAmount;
      }

      // Per-deposit contributions
      for (const deposit of deposits) {
        const depositFraction = deposit.depositAmount / safeInvoiceAmount;
        const depositContribution = ibl.itemizedAmount * depositFraction;
        if (deposit.depositStatus === 'paid' || deposit.depositStatus === 'claimed') {
          actualCostPaid += depositContribution;
        }
        if (deposit.depositStatus === 'claimed') {
          actualCostClaimed += depositContribution;
        }
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

  // Group rows by ibl_id to deduplicate and collect deposits per invoice
  const iblMap = new Map<
    string,
    {
      itemizedAmount: number;
      invoiceId: string;
      invoiceAmount: number;
      invoiceStatus: string;
    }
  >();
  const depositsByInvoice = new Map<
    string,
    Array<{ depositId: string; depositAmount: number; depositStatus: string }>
  >();

  for (const row of rows) {
    if (!iblMap.has(row.ibl_id)) {
      iblMap.set(row.ibl_id, {
        itemizedAmount: row.itemized_amount,
        invoiceId: row.invoice_id,
        invoiceAmount: row.invoice_amount,
        invoiceStatus: row.invoice_status,
      });
    }
    if (row.deposit_id !== null && row.deposit_amount !== null && row.deposit_status !== null) {
      const deps = depositsByInvoice.get(row.invoice_id) ?? [];
      if (!deps.find((d) => d.depositId === row.deposit_id)) {
        deps.push({
          depositId: row.deposit_id,
          depositAmount: row.deposit_amount,
          depositStatus: row.deposit_status,
        });
        depositsByInvoice.set(row.invoice_id, deps);
      }
    }
  }

  let total = 0;

  for (const [_iblId, ibl] of iblMap) {
    const deposits = depositsByInvoice.get(ibl.invoiceId) ?? [];
    if (deposits.length === 0) {
      // No deposits: entire ibl contributes under parent invoice status
      if (ibl.invoiceStatus === targetStatus) {
        total += ibl.itemizedAmount;
      }
    } else {
      const totalDepositAmount = deposits.reduce((s, d) => s + d.depositAmount, 0);
      const safeInvoiceAmount = ibl.invoiceAmount > 0 ? ibl.invoiceAmount : 1;

      // Residual contribution under parent invoice status
      const residualFraction =
        Math.max(0, safeInvoiceAmount - totalDepositAmount) / safeInvoiceAmount;
      const residualAmount = ibl.itemizedAmount * residualFraction;
      if (ibl.invoiceStatus === targetStatus) {
        total += residualAmount;
      }

      // Per-deposit contributions
      for (const deposit of deposits) {
        if (deposit.depositStatus === targetStatus) {
          const depositFraction = deposit.depositAmount / safeInvoiceAmount;
          const depositContribution = ibl.itemizedAmount * depositFraction;
          total += depositContribution;
        }
      }
    }
  }

  return total;
}
