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
} from './types.js';

export { buildReportContent } from './buildReportContent.js';
export { applyOverrides } from './applyOverrides.js';
export { overrideKey } from './overrideKeys.js';
