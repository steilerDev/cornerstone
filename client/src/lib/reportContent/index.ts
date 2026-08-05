/**
 * Report content library — text derivation for editable reports.
 */

export type {
  ReportContent,
  ReportContentRow,
  ReportContentSummaryRow,
  ReportContentFootnote,
  ReportContentCoverLetter,
  ReportContentLabels,
  ReportContentOverrides,
  ReportSkipReason,
} from './types.js';

export { buildReportContent } from './buildReportContent.js';
export { applyOverrides } from './applyOverrides.js';
export { applyAiContent } from './applyAiContent.js';
export { overrideKey } from './overrideKeys.js';
export {
  reportColumnsForUseCase,
  visibleReportColumns,
  isColumnLocked,
  REQUIRED_REPORT_COLUMN,
} from './columns.js';
export type { ReportColumnKey } from './columns.js';
