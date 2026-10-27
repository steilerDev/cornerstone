import { SOURCE_REPORT_TYPES } from '@cornerstone/shared';
import type { BudgetSource, SourceReportType } from '@cornerstone/shared';

export interface ReportPreset {
  readonly type: SourceReportType;
  readonly sourceId: string | null;
  /** The `sourceId` parameter names no known funding source. */
  readonly sourceMissing: boolean;
}

function isSourceReportType(value: string | null): value is SourceReportType {
  return SOURCE_REPORT_TYPES.some((type) => type === value);
}

/** Sources a draw-down request can be made against: loans and credit lines that are not closed. */
export function isReportCandidate(source: BudgetSource): boolean {
  return (
    (source.sourceType === 'bank_loan' || source.sourceType === 'credit_line') &&
    source.status !== 'closed'
  );
}

/**
 * The landing rule for `?type=` and `?sourceId=` (#2243 D1). A known source goes to step 3; an
 * unknown one to step 2 with an error; no source goes to step 3 when exactly one candidate source
 * exists, else step 2. Returns null when `type` is missing or invalid (the normal step 1 flow).
 */
export function resolveReportPreset(
  typeParam: string | null,
  sourceIdParam: string | null,
  sources: readonly BudgetSource[],
): ReportPreset | null {
  if (!isSourceReportType(typeParam)) return null;
  if (sourceIdParam !== null) {
    const known = sources.some((source) => source.id === sourceIdParam);
    return known
      ? { type: typeParam, sourceId: sourceIdParam, sourceMissing: false }
      : { type: typeParam, sourceId: null, sourceMissing: true };
  }
  const candidates = sources.filter(isReportCandidate);
  return {
    type: typeParam,
    sourceId: candidates.length === 1 ? candidates[0]!.id : null,
    sourceMissing: false,
  };
}
