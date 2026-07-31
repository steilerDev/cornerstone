/**
 * Overview table PDF content builder.
 * Consumes ReportContent (text only); no data derivation.
 */
import type { TFunction } from 'i18next';
import type { Content } from 'pdfmake/build/pdfmake';
import type { ReportContent } from '../reportContent/index.js';
import { TABLE_LAYOUT, REFUND_TEXT_COLOR } from './shared.js';

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

  // Source info
  const sourceInfoStack: Array<Content | null> = [
    {
      text: `${t('sourceReports.table.source')}: ${reportContent.sourceInfo.sourceName}`,
      style: 'small',
    },
    {
      text: `${t('sourceReports.table.sourceType')}: ${reportContent.sourceInfo.sourceTypeText}`,
      style: 'small',
    },
    reportContent.sourceInfo.referenceText
      ? {
          text: `${t('sourceReports.table.reference')}: ${reportContent.sourceInfo.referenceText}`,
          style: 'small',
        }
      : null,
    {
      text: `${t('sourceReports.table.generatedAt')}: ${reportContent.sourceInfo.generatedAtText}`,
      style: 'small',
    },
  ];

  content.push({
    stack: sourceInfoStack.filter(Boolean) as Content[],
    margin: [0, 0, 0, 20],
  });

  // Build table columns
  const columns: Content[] = [
    { text: t('sourceReports.table.vendor'), style: 'tableHeader' },
    { text: t('sourceReports.table.invoiceNumber'), style: 'tableHeader' },
    { text: t('sourceReports.table.date'), style: 'tableHeader' },
  ];

  // Add status column only if budget-overview
  if (reportContent.isOverview) {
    columns.push({ text: t('sourceReports.table.status'), style: 'tableHeader' });
  }

  columns.push(
    { text: t('sourceReports.table.invoiceAmount'), style: 'tableHeader', alignment: 'right' },
    { text: t('sourceReports.table.allocatedAmount'), style: 'tableHeader', alignment: 'right' },
    { text: t('sourceReports.table.usage'), style: 'tableHeader' },
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

    const allocatedCell = `${contentRow.allocatedAmountValueText}${markerText}${contentRow.isRefund ? ' ' + contentRow.refundNoteText : ''}`;

    if (contentRow.isRefund) {
      row.push({
        text: allocatedCell,
        style: 'tableCell',
        alignment: 'right',
        color: REFUND_TEXT_COLOR,
      });
    } else {
      row.push({
        text: allocatedCell,
        style: 'tableCell',
        alignment: 'right',
      });
    }

    // Usage cell with optional attachment note
    const usageCell: Content = contentRow.attachmentsNote
      ? {
          stack: [
            { text: contentRow.usageText, style: 'tableCell' },
            { text: contentRow.attachmentsNote, style: 'small', margin: [0, 2, 0, 0] },
          ],
        }
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
        ? ['*', 'auto', 'auto', 'auto', 'auto', 'auto', '*']
        : ['*', 'auto', 'auto', 'auto', 'auto', '*'],
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
