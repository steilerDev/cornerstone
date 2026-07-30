import type { SourceReportResponse } from '@cornerstone/shared';

/**
 * Applies line-level exclusions to a source report, adjusting invoice amounts.
 * Pure function: returns the same object reference if no exclusions, preventing unnecessary re-renders.
 *
 * @param report The source report to filter
 * @param excludedLineIds Set of budget line IDs to exclude from calculations
 * @returns A new report with adjusted amounts, or the original report if no exclusions
 */
export function applyLineExclusions(
  report: SourceReportResponse,
  excludedLineIds: Set<string>,
): SourceReportResponse {
  if (excludedLineIds.size === 0) return report;

  return {
    ...report,
    invoices: report.invoices.map((inv) => {
      // Calculate total portion of excluded lines for this invoice
      const excludedPortion = inv.budgetLines
        .filter((l) => excludedLineIds.has(l.id))
        .reduce((s, l) => s + l.allocatedPortion, 0);

      // If no exclusions affect this invoice, return it unchanged
      if (excludedPortion === 0) return inv;

      // Recalculate allocated amount and lineKind based on new amount
      const newAmount = Math.round((inv.allocatedAmount - excludedPortion) * 100) / 100;

      return {
        ...inv,
        allocatedAmount: newAmount,
        lineKind: newAmount < 0 ? 'refund-adjustment' : 'invoice',
      };
    }),
  };
}
