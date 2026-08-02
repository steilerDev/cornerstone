/**
 * Overview table PDF content builder.
 * Consumes ReportContent (text only); no data derivation.
 */
import type { TFunction } from 'i18next';
import type { Content } from 'pdfmake/build/pdfmake';
import type { ReportContent } from '../reportContent/index.js';
import {
  TABLE_LAYOUT,
  REFUND_TEXT_COLOR,
  DEPOSIT_NOTE_TEXT_COLOR,
  DEPOSIT_NOTE_FONT_SIZE,
} from './shared.js';

// A4 printable width (pt): 595.28pt page width − 40pt left − 40pt right (merge.ts
// pageMargins). Referenced here only in this comment — see the sanity note below for how
// the fixed column widths relate to it.
// PRINTABLE_WIDTH_PT = 515.28

// Fixed point widths (pt) for the narrow, bounded-content columns shared by both table
// shapes. Deliberately NOT 'auto': 'auto' sizes to the widest content in the column with no
// upper bound — five 'auto' columns silently consuming the whole printable width, leaving
// nothing for the '*' columns, is exactly what caused #1929's right-edge overflow. Usage
// stays the SOLE '*' column so it deterministically absorbs 100% of whatever remains after
// these fixed widths are subtracted — a second '*' column (e.g. keeping Vendor as '*') would
// only split the remainder unpredictably, and this pdfmake build doesn't support weighted
// stars ('2*') to compensate (see realRender.test.ts's story #1898 note).
const VENDOR_WIDTH = 70;
const INVOICE_NUMBER_WIDTH = 50;
const DATE_WIDTH = 45;
const STATUS_WIDTH = 40; // budget-overview (7-col) only
const INVOICE_AMOUNT_WIDTH = 50;
const ALLOCATED_AMOUNT_WIDTH = 75; // value + footnote markers + optional deposit badge/refund
// note all wrap onto extra lines within this fixed width instead of forcing the table wider

// Sanity: both column sets must leave Usage a meaningful, non-degenerate share of the page.
// 7-col non-usage sum = 330pt -> Usage gets 185.28pt. 6-col non-usage sum = 290pt -> Usage
// gets 225.28pt. Both comfortably under the 515.28pt printable width and comfortably above a
// "collapsed column" width.

export function buildOverviewContent(
  reportContent: ReportContent,
  skippedDocuments: Map<string, string[]>,
  t: TFunction,
): Content[] {
  const content: Content[] = [];

  // Title
  content.push({
    text: reportContent.tableTitle,
    style: 'title',
    margin: [0, 0, 0, 20],
  });

  // Source info (skip for claim reports)
  if (!reportContent.isClaim) {
    const sourceInfoStack: Array<Content | null> = [
      {
        text: `${reportContent.labels.source}: ${reportContent.sourceInfo.sourceName}`,
        style: 'small',
      },
      {
        text: `${reportContent.labels.sourceType}: ${reportContent.sourceInfo.sourceTypeText}`,
        style: 'small',
      },
      reportContent.sourceInfo.referenceText
        ? {
            text: `${reportContent.labels.reference}: ${reportContent.sourceInfo.referenceText}`,
            style: 'small',
          }
        : null,
      {
        text: `${reportContent.labels.generatedAt}: ${reportContent.sourceInfo.generatedAtText}`,
        style: 'small',
      },
    ];

    content.push({
      stack: sourceInfoStack.filter(Boolean) as Content[],
      margin: [0, 0, 0, 20],
    });
  }

  // Build table columns
  const columns: Content[] = [
    { text: reportContent.labels.vendor, style: 'tableHeader' },
    { text: reportContent.labels.invoiceNumber, style: 'tableHeader' },
    { text: reportContent.labels.date, style: 'tableHeader' },
  ];

  // Add status column only if budget-overview
  if (reportContent.isOverview) {
    columns.push({ text: reportContent.labels.status, style: 'tableHeader' });
  }

  columns.push(
    { text: reportContent.labels.invoiceAmount, style: 'tableHeader', alignment: 'right' },
    { text: reportContent.labels.allocatedAmount, style: 'tableHeader', alignment: 'right' },
    { text: reportContent.labels.usage, style: 'tableHeader' },
  );

  /**
   * Helper: build summary row (subtotal/total) with label at last leading index.
   */
  function buildSummaryRow(labelText: string, amountText: string): Content[] {
    const leadingCount = reportContent.isOverview ? 4 : 3;
    const row: Content[] = [];

    // Leading cells: empty except the last one which has the label
    for (let i = 0; i < leadingCount; i++) {
      if (i === leadingCount - 1) {
        row.push({ text: labelText, style: 'tableCell', bold: true });
      } else {
        row.push({ text: '', style: 'tableCell' });
      }
    }

    // Empty invoiceAmount cell
    row.push({ text: '', style: 'tableCell' });

    // Bold right-aligned amount
    row.push({
      text: amountText,
      style: 'tableCell',
      alignment: 'right',
      bold: true,
    });

    // Empty trailing usage cell
    row.push({ text: '', style: 'tableCell' });

    return row;
  }

  // Build table rows from reportContent.rows
  const rows: Content[][] = [columns as Content[]];

  // Track skip footnotes by invoice
  const skipFootnotesByInvoiceId = new Map<string, number[]>();
  let skipFootnoteNum = 1;
  for (const [invoiceId, reasons] of skippedDocuments) {
    if (!skipFootnotesByInvoiceId.has(invoiceId)) {
      skipFootnotesByInvoiceId.set(invoiceId, []);
    }
    const noteNums = skipFootnotesByInvoiceId.get(invoiceId)!;
    for (const _reason of reasons) {
      noteNums.push(skipFootnoteNum);
      skipFootnoteNum++;
    }
  }

  for (const contentRow of reportContent.rows) {
    const row: Content[] = [
      { text: contentRow.vendor, style: 'tableCell' },
      { text: contentRow.invoiceNumber, style: 'tableCell' },
      { text: contentRow.dateText, style: 'tableCell' },
    ];

    // Add status cell only if budget-overview
    if (reportContent.isOverview && contentRow.statusText) {
      row.push({ text: contentRow.statusText, style: 'tableCell' });
    }

    // Invoice amount
    if (contentRow.isRefund) {
      row.push({
        text: contentRow.invoiceAmountText,
        style: 'tableCell',
        alignment: 'right',
        color: REFUND_TEXT_COLOR,
      });
    } else {
      row.push({
        text: contentRow.invoiceAmountText,
        style: 'tableCell',
        alignment: 'right',
      });
    }

    // Allocated amount with footnote markers (skip + allocated)
    const skipMarkers = skipFootnotesByInvoiceId.get(contentRow.invoiceId) ?? [];
    let markerText = '';
    for (const noteNum of skipMarkers) {
      markerText += `*${noteNum}`;
    }
    markerText += contentRow.allocatedMarkers;

    // Build allocated runs: value+markers, then optional deposit badge, then optional refund note
    const allocatedRuns: Content[] = [
      { text: `${contentRow.allocatedAmountValueText}${markerText}` },
    ];
    if (contentRow.isDeposit) {
      allocatedRuns.push({
        text: ` (${reportContent.labels.deposit})`,
        color: DEPOSIT_NOTE_TEXT_COLOR,
        fontSize: DEPOSIT_NOTE_FONT_SIZE,
      });
    }
    if (contentRow.isRefund) {
      allocatedRuns.push({ text: ` ${contentRow.refundNoteText}` });
    }

    row.push({
      text: allocatedRuns,
      style: 'tableCell',
      alignment: 'right',
      color: contentRow.isRefund ? REFUND_TEXT_COLOR : undefined,
    });

    // Usage cell with optional area text and attachment note
    const usageStack: Content[] = [{ text: contentRow.usageText, style: 'tableCell' }];
    if (contentRow.areaText) {
      usageStack.push({ text: contentRow.areaText, style: 'small', margin: [0, 2, 0, 0] });
    }
    if (contentRow.attachmentsNote) {
      usageStack.push({ text: contentRow.attachmentsNote, style: 'small', margin: [0, 2, 0, 0] });
    }

    const usageCell: Content =
      usageStack.length > 1
        ? { stack: usageStack }
        : { text: contentRow.usageText, style: 'tableCell' };

    row.push(usageCell);
    rows.push(row);
  }

  // Add summary rows from reportContent.summaryRows
  for (const summaryRow of reportContent.summaryRows) {
    rows.push(buildSummaryRow(summaryRow.label, summaryRow.amountText));
  }

  // Add table
  content.push({
    table: {
      headerRows: 1,
      widths: reportContent.isOverview
        ? [
            VENDOR_WIDTH,
            INVOICE_NUMBER_WIDTH,
            DATE_WIDTH,
            STATUS_WIDTH,
            INVOICE_AMOUNT_WIDTH,
            ALLOCATED_AMOUNT_WIDTH,
            '*',
          ]
        : [
            VENDOR_WIDTH,
            INVOICE_NUMBER_WIDTH,
            DATE_WIDTH,
            INVOICE_AMOUNT_WIDTH,
            ALLOCATED_AMOUNT_WIDTH,
            '*',
          ],
      body: rows,
    },
    layout: TABLE_LAYOUT,
    margin: [0, 0, 0, 20],
  });

  // Add footnotes (skip block + split/deposit from reportContent.footnotes)
  const footnotes: Content[] = [];

  // Skip block (generation-time data)
  if (skippedDocuments.size > 0) {
    let skipFootnoteNum = 1;
    for (const [invoiceId, reasons] of skippedDocuments) {
      // Find vendor/invoice info from reportContent.rows
      const row = reportContent.rows.find((r) => r.invoiceId === invoiceId);
      const vendorName = row?.vendor ?? '—';
      const invoiceNumber = row?.invoiceNumber ?? '—';

      for (const reason of reasons) {
        footnotes.push({
          text: `*${skipFootnoteNum}: ${vendorName} (${invoiceNumber}) — ${t(`sourceReports.table.${reason}`)}`,
          style: 'small',
        });
        skipFootnoteNum++;
      }
    }
  }

  // Split + deposit footnotes from reportContent
  if (reportContent.footnotes.length > 0) {
    let isFirst = true;
    for (const footnote of reportContent.footnotes) {
      const content: Content = {
        text: `${footnote.marker}: ${footnote.text}`,
        style: 'small',
      };

      if (isFirst) {
        content.margin = [0, 4, 0, 0];
        isFirst = false;
      }

      footnotes.push(content);
    }
  }

  if (footnotes.length > 0) {
    content.push({
      stack: footnotes,
      margin: [0, 0, 0, 0],
    });
  }

  return content;
}
