/**
 * PDF generation and merging pipeline.
 */
import type { TFunction } from 'i18next';
import type { Content } from 'pdfmake/build/pdfmake';
import type {
  SourceReportResponse,
  SourceReportType,
  HouseholdSettings,
} from '@cornerstone/shared';
import { loadPdfLibs } from './loader.js';
import { buildPageHeader, buildPageFooter } from './shared.js';
import { buildCoverLetterContent } from './coverLetterPdf.js';
import { buildOverviewContent } from './overviewPdf.js';
import type { GeneratedReport, SkippedDocument } from './types.js';
import { getDocumentPreviewUrl } from '../paperlessApi.js';

export async function generateReportPdf(
  report: SourceReportResponse,
  includedInvoiceIds: Set<string>,
  useCase: SourceReportType,
  options: { attachDocuments: boolean; includeCoverLetter: boolean },
  household: HouseholdSettings | null,
  t: TFunction,
): Promise<GeneratedReport> {
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
            });
          }
        } catch {
          skippedDocuments.push({
            invoiceId: invoice.invoiceId,
            documentId: doc.documentId.toString(),
            reason: 'footnoteFetchFailed',
          });
        }
      }
    }
  }

  // Step 2: Build PDF content
  const skippedByInvoice = new Map<string, string[]>();
  for (const skip of skippedDocuments) {
    if (!skippedByInvoice.has(skip.invoiceId)) {
      skippedByInvoice.set(skip.invoiceId, []);
    }
    skippedByInvoice.get(skip.invoiceId)!.push(skip.reason);
  }

  const content: Content[] = [];

  if (options.includeCoverLetter) {
    const coverLetter = buildCoverLetterContent(report, household, useCase, t);
    content.push(...coverLetter);
  }

  const overview = buildOverviewContent(
    report,
    includedInvoiceIds,
    appendixByInvoiceId,
    skippedByInvoice,
    useCase,
    t,
  );
  content.push(...overview);

  // Step 3: Generate pdfmake document
  const pdfDoc = pdfMake.createPdf({
    content,
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 60],
    header: (currentPage: number) => {
      if (currentPage === 1) return null; // No header on first page
      return buildPageHeader(
        t(`sourceReports.table.title.${useCase}`),
        report.source.name,
        t('sourceReports.table.generatedAt'),
      );
    },
    footer: buildPageFooter(t('sourceReports.table.pageLabel')),
    defaultStyle: {
      font: 'Roboto',
      fontSize: 11,
      lineHeight: 1.4,
    },
    styles: {
      title: {
        fontSize: 16,
        bold: true,
        color: '#1f2937',
      },
      subheader: {
        fontSize: 12,
        color: '#6b7280',
        margin: [0, 4, 0, 0],
      },
      header: {
        fontSize: 14,
        bold: true,
        color: '#111827',
      },
      tableHeader: {
        bold: true,
        fontSize: 10,
        color: '#ffffff',
        fillColor: '#1f2937',
        alignment: 'left',
      },
      tableCell: {
        fontSize: 10,
      },
      small: {
        fontSize: 9,
        color: '#6b7280',
      },
    },
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
          // Skip failed documents
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
