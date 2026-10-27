import { computeIncludedTotal } from '@cornerstone/shared';
import type { SourceReportResponse } from '@cornerstone/shared';

/** What the wizard has selected: the one definition of count and total (#2243 D2). */
export interface ReportSelection {
  /** Invoice ids in `report.invoices` order that are not excluded. */
  readonly includedInvoiceIds: readonly string[];
  readonly count: number;
  readonly totalCount: number;
  /** Sum of the included invoices, minus excluded budget lines (shared `computeIncludedTotal`). */
  readonly total: number;
}

/**
 * Derives the selection from the raw (not line-adjusted) report, so the step 3 summary, the group
 * subtotals, the step 5 sentence and the mark dialog all show the same figures.
 */
export function reportSelection(
  report: SourceReportResponse,
  excludedInvoiceIds: ReadonlySet<string>,
  excludedLineIds: ReadonlySet<string>,
): ReportSelection {
  const includedInvoiceIds = report.invoices
    .filter((inv) => !excludedInvoiceIds.has(inv.invoiceId))
    .map((inv) => inv.invoiceId);
  return {
    includedInvoiceIds,
    count: includedInvoiceIds.length,
    totalCount: report.invoices.length,
    total: computeIncludedTotal(report, includedInvoiceIds, new Set(excludedLineIds)),
  };
}
