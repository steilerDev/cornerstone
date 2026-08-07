/**
 * PDF generation and merging pipeline.
 */
import type { Content, Style } from 'pdfmake/build/pdfmake';
import type { SourceReportResponse } from '@cornerstone/shared';
import type { ReportContent, ReportSkipReason } from '../reportContent/index.js';
import { loadPdfLibs } from './loader.js';
import { buildPageHeader, buildPageFooter } from './shared.js';
import { buildCoverLetterContent } from './coverLetterPdf.js';
import { buildOverviewContent } from './overviewPdf.js';
import type { GeneratedReport, ReportPdfOptions, SkippedDocument } from './types.js';
import { getDocumentPreviewUrl } from '../paperlessApi.js';
import { PAGE_MARGIN_X, PAGE_TOP_MARGIN, PAGE_MARGIN_BOTTOM, PDF_STYLES } from './pageGeometry.js';

/**
 * Shared pdfmake document-definition literals, extracted so tests can build a realistic
 * `createPdf()` call without hand-copying them (#1929 AC11 — real-render assertions need the
 * production styles, not a re-typed approximation).
 */
export const PDF_DEFAULT_STYLE: Style = {
  font: 'Roboto',
  fontSize: 11,
  lineHeight: 1.4,
};

// `PDF_STYLES` is defined in pageGeometry.ts (#1939) — it needs the same font-size constants
// pageGeometry.ts's own header-footprint/table-geometry math depends on, so it lives where
// those constants are the source of truth rather than duplicating them here. Re-exported so
// existing consumers of `merge.ts`'s `PDF_STYLES` (this file's own createPdf() call below, and
// merge.test.ts) are unaffected by the relocation.
export { PDF_STYLES };

export async function generateReportPdf(
  report: SourceReportResponse,
  includedInvoiceIds: Set<string>,
  reportContent: ReportContent,
  options: ReportPdfOptions,
): Promise<GeneratedReport> {
  const hiddenColumns = options.hiddenColumns ?? new Set();
  const { pdfMake, PDFDocument } = await loadPdfLibs();
  const skippedDocuments: SkippedDocument[] = [];
  const appendixByInvoiceId = new Map<string, number>();
  const documentBytesByInvoiceAndDoc = new Map<string, ArrayBuffer>();

  // Step 1: Load and validate invoice PDFs
  if (options.attachDocuments) {
    let appendixNum = 1;
    for (const invoice of report.invoices) {
      if (!includedInvoiceIds.has(invoice.invoiceId) || !invoice.documents?.length) {
        continue;
      }

      let invoiceHasValidDoc = false;
      for (const doc of invoice.documents) {
        try {
          const docPreviewUrl = getDocumentPreviewUrl(doc.documentId);
          const response = await fetch(docPreviewUrl, { credentials: 'include' });

          if (!response.ok) {
            skippedDocuments.push({
              invoiceId: invoice.invoiceId,
              documentId: doc.documentId.toString(),
              reason: 'footnoteFetchFailed',
              vendorName: invoice.vendorName,
              invoiceNumber: invoice.invoiceNumber,
            });
            continue;
          }

          const bytes = await response.arrayBuffer();
          try {
            await PDFDocument.load(bytes);
            documentBytesByInvoiceAndDoc.set(`${invoice.invoiceId}:${doc.documentId}`, bytes);
            if (!invoiceHasValidDoc) {
              appendixByInvoiceId.set(invoice.invoiceId, appendixNum);
              appendixNum++;
              invoiceHasValidDoc = true;
            }
          } catch {
            skippedDocuments.push({
              invoiceId: invoice.invoiceId,
              documentId: doc.documentId.toString(),
              reason: 'footnoteInvalidPdf',
              vendorName: invoice.vendorName,
              invoiceNumber: invoice.invoiceNumber,
            });
          }
        } catch {
          skippedDocuments.push({
            invoiceId: invoice.invoiceId,
            documentId: doc.documentId.toString(),
            reason: 'footnoteFetchFailed',
            vendorName: invoice.vendorName,
            invoiceNumber: invoice.invoiceNumber,
          });
        }
      }
    }
  }

  // Step 2: Build PDF content
  const skippedByInvoice = new Map<string, ReportSkipReason[]>();
  for (const skip of skippedDocuments) {
    if (!skippedByInvoice.has(skip.invoiceId)) {
      skippedByInvoice.set(skip.invoiceId, []);
    }
    skippedByInvoice.get(skip.invoiceId)!.push(skip.reason);
  }

  const content: Content[] = [];

  if (reportContent.coverLetter) {
    const coverLetter = buildCoverLetterContent(reportContent);
    content.push(...coverLetter);
  }

  const overview = buildOverviewContent(reportContent, skippedByInvoice, hiddenColumns);
  content.push(...overview);

  // Step 3: Generate pdfmake document
  const pdfDoc = pdfMake.createPdf({
    content,
    pageSize: 'A4',
    pageMargins: [PAGE_MARGIN_X, PAGE_TOP_MARGIN, PAGE_MARGIN_X, PAGE_MARGIN_BOTTOM],
    header: (currentPage: number) => {
      if (currentPage === 1) return null; // No header on first page
      return buildPageHeader(
        reportContent.tableTitle,
        reportContent.sourceInfo.sourceName,
        `${reportContent.labels.generatedAt}: ${reportContent.sourceInfo.generatedAtText}`,
      );
    },
    footer: buildPageFooter(reportContent.labels.pageLabel),
    defaultStyle: PDF_DEFAULT_STYLE,
    styles: PDF_STYLES,
  });

  // Get text blob (getBlob() is promise-based in @types/pdfmake@0.3.3)
  const textBlob = await pdfDoc.getBlob();

  // Step 4: Attach invoice PDFs if needed
  if (options.attachDocuments && appendixByInvoiceId.size > 0) {
    const finalDoc = await PDFDocument.create();

    // Copy pages from text blob
    const textBytes = await textBlob.arrayBuffer();
    const textPdfDoc = await PDFDocument.load(textBytes);
    const textPages = await finalDoc.copyPages(textPdfDoc, textPdfDoc.getPageIndices());
    textPages.forEach((page) => {
      finalDoc.addPage(page);
    });

    // Append invoice PDFs in order (reuse cached bytes from step 1)
    for (const invoice of report.invoices) {
      if (!includedInvoiceIds.has(invoice.invoiceId)) {
        continue;
      }

      const appendixNum = appendixByInvoiceId.get(invoice.invoiceId);
      if (!appendixNum) {
        continue;
      }

      for (const doc of invoice.documents || []) {
        const docKey = `${invoice.invoiceId}:${doc.documentId}`;
        const bytes = documentBytesByInvoiceAndDoc.get(docKey);
        if (!bytes) continue;

        try {
          const invoicePdfDoc = await PDFDocument.load(bytes);
          const invoicePages = await finalDoc.copyPages(
            invoicePdfDoc,
            invoicePdfDoc.getPageIndices(),
          );
          invoicePages.forEach((page) => {
            finalDoc.addPage(page);
          });
        } catch {
          // Track failed documents as skipped
          skippedDocuments.push({
            invoiceId: invoice.invoiceId,
            documentId: doc.documentId.toString(),
            reason: 'footnoteInvalidPdf',
            vendorName: invoice.vendorName,
            invoiceNumber: invoice.invoiceNumber,
          });
        }
      }
    }

    const finalBytes = await finalDoc.save();
    const blob = new Blob([finalBytes as BufferSource], { type: 'application/pdf' });
    return { blob, skippedDocuments };
  }

  // No attachments, return text blob as-is
  return { blob: textBlob, skippedDocuments };
}
