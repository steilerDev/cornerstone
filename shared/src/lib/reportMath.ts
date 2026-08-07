/**
 * Shared report math utilities used by both server and client.
 */

import type { SourceReportResponse } from '../types/sourceReport.js';

/**
 * Computes the total allocated amount for a set of included invoices,
 * subtracting any excluded budget-line portions, with per-invoice defensive
 * rounding to 2 dp.
 *
 * @param report             The source report (server: unadjusted; client: post-applyLineExclusions)
 * @param includedInvoiceIds Invoice IDs to sum (only these invoices are included)
 * @param excludedLineIds    Budget-line IDs whose allocatedPortion is subtracted
 * @returns Total amount rounded to 2 dp
 */
export function computeIncludedTotal(
  report: SourceReportResponse,
  includedInvoiceIds: string[],
  excludedLineIds: Set<string>,
): number {
  const includedSet = new Set(includedInvoiceIds);
  let total = 0;
  for (const inv of report.invoices) {
    if (!includedSet.has(inv.invoiceId)) continue;
    let contribution = inv.allocatedAmount;
    for (const line of inv.budgetLines) {
      if (excludedLineIds.has(line.id)) {
        contribution -= line.allocatedPortion;
      }
    }
    // Defensive rounding: guards against >2dp floating-point inputs
    contribution = Math.round(contribution * 100) / 100;
    total += contribution;
  }
  return Math.round(total * 100) / 100;
}
