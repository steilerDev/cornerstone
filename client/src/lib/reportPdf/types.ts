/**
 * Types for the report PDF pipeline.
 */

export interface ReportPdfOptions {
  attachDocuments: boolean;
  includeCoverLetter: boolean;
}

export interface GeneratedReport {
  blob: Blob;
  skippedDocuments: SkippedDocument[];
}

export interface SkippedDocument {
  invoiceId: string;
  documentId: string;
  reason: 'footnoteFetchFailed' | 'footnoteInvalidPdf';
  vendorName: string;
  invoiceNumber: string | null;
}
