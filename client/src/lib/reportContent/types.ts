/**
 * Types for editable report content.
 * Represents the structured text content of a source report (overview + cover letter).
 * Separates content derivation from PDF layout, enabling UI editing.
 */

export interface ReportContentRow {
  invoiceId: string;
  vendor: string;
  invoiceNumber: string;
  dateText: string;
  status: string | null; // raw status value used for Badge variants; null when useCase !== 'budget-overview'
  statusText: string | null; // null when useCase !== 'budget-overview'
  invoiceAmountText: string;
  allocatedAmountValueText: string; // formatted currency only — no markers/refund note
  isPartial: boolean; // splitKind === 'lines' | 'both' → inline "(partial)" label
  isDepositReduced: boolean; // splitKind === 'deposits' | 'both' → reduced by a deposit tagged to a DIFFERENT source; inline label. Untagged deposits are apportioned back into this source pro-rata and never set this flag.
  isDeposit: boolean; // constituted-deposit row → inline Deposit badge
  isRefund: boolean;
  refundNoteText: string; // shown only when isRefund
  usageText: string; // EDITABLE — key `row.<invoiceId>.usageText`
  // READ-ONLY since #1959: rendered inline in the Usage cell's grey meta suffix. null = no attached documents.
  attachmentsNote: string | null;
  areaText: string | null; // read-only leaf area names, distinct comma-joined
}

export interface ReportContentSummaryRow {
  key: string;
  label: string;
  amountText: string;
}

export interface ReportContentFootnote {
  id: string;
  marker: string;
  text: string;
}

export interface ReportContentCoverLetter {
  sender: string; // EDITABLE multiline; baseline [user.displayName, householdAddress].filter(Boolean).join('\n'); '' when both absent (block still renders)
  recipient: string | null; // EDITABLE when non-null; baseline contactAddress; null → omitted
  dateLine: string; // READ-ONLY
  reference: string | null; // EDITABLE when non-null; null → omitted; distinct from sourceInfo.referenceText
  subject: string; // EDITABLE; baseline reportT(subject.<useCase>)
  opening: string; // READ-ONLY; reportT('sourceReports.coverLetter.opening'); printed between subject and body. Same artifact-content rule as `closing` (#1909/#1924); no override key (#2159)
  body: string; // EDITABLE; baseline reportT(body.<useCase>, {total}) interpolated ONCE at build
  signature: string; // EDITABLE (first-class); baseline derived from sender's first line (the user's display name, per AC 3.1); NOT recomputed from sender once explicitly overridden — see applyOverrides.ts
  closing: string; // READ-ONLY; reportT('sourceReports.coverLetter.closing'); part of the letter artifact, never rendered through the editor's interface t (artifact-content-vs-edit-affordance rule, #1909/#1924)
}

export const REPORT_SKIP_REASONS = ['footnoteFetchFailed', 'footnoteInvalidPdf'] as const;
export type ReportSkipReason = (typeof REPORT_SKIP_REASONS)[number];

export interface ReportContentLabels {
  vendor: string;
  invoiceNumber: string;
  date: string;
  status: string;
  invoiceAmount: string;
  allocatedAmount: string;
  usage: string;
  attachmentsNote: string;
  deposit: string; // translated in report language
  // Rendered for rows with `isPartial`. The field name and its i18n keys
  // (`sourceReports.table.splitInlineLabel` / `splitFootnote`) and the legend footnote id 'split'
  // are intentionally NOT renamed with the row flag (#2016): they name the user-visible label/legend,
  // renaming them would churn every locale and the footnote id reaches the DOM.
  splitNote: string; // short inline label for split rows
  depositReducedNote: string; // short inline label for deposit-reduced rows
  source: string;
  sourceType: string;
  reference: string;
  generatedAt: string;
  pageLabel: string; // "Page N / M" label in the PDF footer, translated in report language
  coverLetterReferenceLabel: string;
  coverLetterSubjectLabel: string;
  skipReasonLabels: Record<ReportSkipReason, string>;
}

/**
 * Report-language strings for the multi-PDF split (#2161). Functions close over `reportT` inside
 * `buildReportContent`, so `lib/reportPdf/*` never touches i18n. Present ONLY when
 * `buildReportContent` is called with `includePartTexts: true`.
 */
export interface ReportContentPartTexts {
  identifier: string;
  continuationSubject: (part: number, total: number) => string;
  continuationBody: (part: number, total: number) => string;
  continuationInvoicesHeading: string;
  continuationInvoiceLine: (
    row: Pick<ReportContentRow, 'vendor' | 'invoiceNumber' | 'dateText'>,
  ) => string;
  multiPartNotice: (total: number) => string;
  multiPartNoticeNoLetter: (total: number) => string;
  paperlessTitle: (baseTitle: string, partLabel: string, total: number) => string;
}

export interface ReportContent {
  isOverview: boolean;
  isClaim: boolean;
  tableTitle: string;
  labels: ReportContentLabels;
  sourceInfo: {
    sourceName: string;
    sourceTypeText: string;
    referenceText: string | null;
    generatedAtText: string;
  };
  coverLetter: ReportContentCoverLetter | null; // null when includeCoverLetter false
  rows: ReportContentRow[];
  summaryRows: ReportContentSummaryRow[];
  footnotes: ReportContentFootnote[];
  partTexts?: ReportContentPartTexts; // opt-in (#2161)
}

export type ReportContentOverrides = Record<string, string>;
