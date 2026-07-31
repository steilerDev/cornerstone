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
  allocatedMarkers: string; // '', '†1', '‡2', '†1‡2'
  isRefund: boolean;
  refundNoteText: string; // shown only when isRefund
  usageText: string; // EDITABLE — key `row.<invoiceId>.usageText`
  attachmentsNote: string | null; // EDITABLE when non-null — key `row.<invoiceId>.attachmentsNote`; null = no docs, omitted entirely
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
  sender: string; // EDITABLE multiline; baseline [householdName, householdAddress].filter(Boolean).join('\n'); '' when both absent (block still renders)
  recipient: string | null; // EDITABLE when non-null; baseline contactAddress; null → omitted
  dateLine: string; // READ-ONLY
  reference: string | null; // EDITABLE when non-null; null → omitted; distinct from sourceInfo.referenceText
  subject: string; // EDITABLE; baseline reportT(subject.<useCase>)
  body: string; // EDITABLE; baseline reportT(body.<useCase>, {total}) interpolated ONCE at build
  signature: string; // DERIVED: sender.split('\n')[0]?.trim() ?? ''; recomputed by applyOverrides when sender overridden; PDF renders only when non-empty
}

export interface ReportContent {
  isOverview: boolean;
  tableTitle: string;
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
