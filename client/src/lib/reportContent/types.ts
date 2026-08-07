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
  isSplit: boolean; // splitKind === 'lines' | 'both' → inline "(partial)" label
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
  body: string; // EDITABLE; baseline reportT(body.<useCase>, {total}) interpolated ONCE at build
  signature: string; // EDITABLE (first-class); baseline derived from sender's first line (the user's display name, per AC 3.1); NOT recomputed from sender once explicitly overridden — see applyOverrides.ts
  closing: string; // READ-ONLY; reportT('sourceReports.coverLetter.closing'); part of the letter artifact, never rendered through the editor's interface t (artifact-content-vs-edit-affordance rule, #1909/#1924)
}

export type ReportSkipReason = 'footnoteFetchFailed' | 'footnoteInvalidPdf';

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
}

export type ReportContentOverrides = Record<string, string>;
