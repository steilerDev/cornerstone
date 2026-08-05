/**
 * Report table column visibility — single source of truth for AC 2.1: both the
 * ReportContentEditor UI (column toggles) and overviewPdf.ts's geometry engine consume this
 * module, so the base column set per use case, the locked column, and the "always include the
 * locked column" guard are defined exactly once and cannot drift into two independent copies.
 */

export type ReportColumnKey =
  'vendor' | 'invoiceNumber' | 'date' | 'status' | 'invoiceAmount' | 'allocatedAmount' | 'usage';

/** R1: Allocated Amount is the only column that can never be hidden. */
export const REQUIRED_REPORT_COLUMN: ReportColumnKey = 'allocatedAmount';

const OVERVIEW_COLUMNS: readonly ReportColumnKey[] = [
  'vendor',
  'invoiceNumber',
  'date',
  'status',
  'invoiceAmount',
  'allocatedAmount',
  'usage',
];

// R6: claim/proof-of-funds reports have no `status` VALUE in the content model at all
// (buildReportContent.ts: `status: isOverview ? status : null`) — `status` is physically absent
// from this list so no code path can add it to a claim/proof-of-funds report (AC 2.6 is
// structural, not a runtime check).
const CLAIM_COLUMNS: readonly ReportColumnKey[] = [
  'vendor',
  'invoiceNumber',
  'date',
  'invoiceAmount',
  'allocatedAmount',
  'usage',
];

export function reportColumnsForUseCase(isOverview: boolean): readonly ReportColumnKey[] {
  return isOverview ? OVERVIEW_COLUMNS : CLAIM_COLUMNS;
}

export function isColumnLocked(column: ReportColumnKey): boolean {
  return column === REQUIRED_REPORT_COLUMN;
}

/**
 * The visible column list for a given use case and hidden-column selection, in canonical order.
 * Always includes the locked column regardless of `hiddenColumns`' contents — defense in depth
 * beneath the UI's disabled checkbox, and what makes the PDF geometry engine's AC 4.7 hold
 * structurally rather than incidentally.
 */
export function visibleReportColumns(
  isOverview: boolean,
  hiddenColumns: ReadonlySet<ReportColumnKey>,
): ReportColumnKey[] {
  return reportColumnsForUseCase(isOverview).filter(
    (col) => isColumnLocked(col) || !hiddenColumns.has(col),
  );
}
