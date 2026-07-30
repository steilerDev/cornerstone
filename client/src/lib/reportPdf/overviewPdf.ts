/**
 * Overview table PDF content builder.
 */
import type { TFunction } from 'i18next';
import type { Content } from 'pdfmake/build/pdfmake';
import type { SourceReportResponse, InvoiceStatus } from '@cornerstone/shared';
import type { Formatters } from '../formatters.js';
import { TABLE_LAYOUT, REFUND_TEXT_COLOR } from './shared.js';

export function buildOverviewContent(
  report: SourceReportResponse,
  includedInvoiceIds: Set<string>,
  appendixByInvoiceId: Map<string, number>,
  skippedDocuments: Map<string, string[]>,
  useCase: string,
  t: TFunction,
  formatters?: Formatters,
  includedTotal?: number,
): Content[] {
  const content: Content[] = [];

  // Title
  const titleKey = `sourceReports.table.title.${useCase}`;
  content.push({
    text: t(titleKey),
    style: 'title',
    margin: [0, 0, 0, 20],
  });

  // Source info
  content.push({
    stack: [
      { text: `${t('sourceReports.table.source')}: ${report.source.name}`, style: 'small' },
      {
        text: `${t('sourceReports.table.sourceType')}: ${t(`sourceReports.sourceType.${report.source.sourceType}`)}`,
        style: 'small',
      },
      report.source.reference
        ? {
            text: `${t('sourceReports.table.reference')}: ${report.source.reference}`,
            style: 'small',
          }
        : null,
      {
        text: `${t('sourceReports.table.generatedAt')}: ${formatters?.formatDate(new Date().toISOString().split('T')[0]) ?? new Date().toISOString().split('T')[0]}`,
        style: 'small',
      },
    ].filter(Boolean) as Content[],
    margin: [0, 0, 0, 20],
  });

  // Build table columns
  const columns = [
    { text: t('sourceReports.table.vendor'), style: 'tableHeader' },
    { text: t('sourceReports.table.invoiceNumber'), style: 'tableHeader' },
    { text: t('sourceReports.table.date'), style: 'tableHeader' },
    { text: t('sourceReports.table.status'), style: 'tableHeader' },
    { text: t('sourceReports.table.invoiceAmount'), style: 'tableHeader', alignment: 'right' },
    { text: t('sourceReports.table.allocatedAmount'), style: 'tableHeader', alignment: 'right' },
  ];

  // Add appendix column if needed
  if (appendixByInvoiceId.size > 0) {
    columns.push({ text: t('sourceReports.table.appendix'), style: 'tableHeader' });
  }

  // Build table rows
  const rows: Content[][] = [columns as Content[]];
  const statusCounts: Record<InvoiceStatus, number> = {
    pending: 0,
    paid: 0,
    claimed: 0,
    quotation: 0,
  };

  // Track split invoice indices for footnote numbering
  const splitFootnotesByInvoiceId = new Map<string, number>();
  let splitFootnoteNum = 1;
  for (const invoice of report.invoices) {
    if (includedInvoiceIds.has(invoice.invoiceId) && invoice.isSplit) {
      splitFootnotesByInvoiceId.set(invoice.invoiceId, splitFootnoteNum);
      splitFootnoteNum++;
    }
  }

  // Track skip footnotes by invoice (for marker rendering)
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

  for (const invoice of report.invoices) {
    if (!includedInvoiceIds.has(invoice.invoiceId)) {
      continue;
    }

    const status = invoice.status as InvoiceStatus;
    statusCounts[status]++;

    const row: Content[] = [
      { text: invoice.vendorName, style: 'tableCell' },
      { text: invoice.invoiceNumber ?? '—', style: 'tableCell' },
      { text: formatters?.formatDate(invoice.date) ?? invoice.date, style: 'tableCell' },
      { text: t(`sources.lines.invoiceStatus.${status}`), style: 'tableCell' },
    ];

    // Invoice amount
    const invoiceAmountText = formatters?.formatCurrency(invoice.invoiceAmount) ?? '—';
    if (invoice.lineKind === 'refund-adjustment') {
      row.push({
        text: invoiceAmountText,
        style: 'tableCell',
        alignment: 'right',
        color: REFUND_TEXT_COLOR,
      });
    } else {
      row.push({
        text: invoiceAmountText,
        style: 'tableCell',
        alignment: 'right',
      });
    }

    // Allocated amount with footnote markers
    const allocatedText = formatters?.formatCurrency(invoice.allocatedAmount) ?? '—';
    const skipMarkers = skipFootnotesByInvoiceId.get(invoice.invoiceId) ?? [];
    const splitMarker = splitFootnotesByInvoiceId.get(invoice.invoiceId);
    let markerText = '';
    for (const noteNum of skipMarkers) {
      markerText += `*${noteNum}`;
    }
    if (splitMarker) {
      markerText += `†${splitMarker}`;
    }

    if (invoice.lineKind === 'refund-adjustment') {
      row.push({
        text: `${allocatedText}${markerText} ${t('sourceReports.table.refundNote')}`,
        style: 'tableCell',
        alignment: 'right',
        color: REFUND_TEXT_COLOR,
      });
    } else {
      row.push({
        text: `${allocatedText}${markerText}`,
        style: 'tableCell',
        alignment: 'right',
      });
    }

    // Appendix column
    if (appendixByInvoiceId.size > 0) {
      const appendixNum = appendixByInvoiceId.get(invoice.invoiceId);
      row.push({
        text: appendixNum ? `${appendixNum}` : '—',
        style: 'tableCell',
      });
    }

    rows.push(row);
  }

  // Add subtotal rows per status present
  const statusLabels: Record<InvoiceStatus, string> = {
    pending: 'sources.lines.invoiceStatus.pending',
    paid: 'sources.lines.invoiceStatus.paid',
    claimed: 'sources.lines.invoiceStatus.claimed',
    quotation: 'sources.lines.invoiceStatus.quotation',
  };

  for (const [status] of Object.entries(statusCounts)) {
    const count = statusCounts[status as InvoiceStatus];
    if (count > 0) {
      const invoicesWithStatus = report.invoices.filter(
        (inv) => inv.status === status && includedInvoiceIds.has(inv.invoiceId),
      );
      const subtotal = invoicesWithStatus.reduce((sum, inv) => sum + inv.allocatedAmount, 0);

      const subtotalText = formatters?.formatCurrency(subtotal) ?? '—';
      const subtotalRow: Content[] = [
        { text: '', style: 'tableCell' },
        { text: '', style: 'tableCell' },
        { text: '', style: 'tableCell' },
        {
          text: `${t(statusLabels[status as InvoiceStatus])} ${t('sourceReports.table.subtotal')}`,
          style: 'tableCell',
          bold: true,
        },
        { text: '', style: 'tableCell' },
        {
          text: subtotalText,
          style: 'tableCell',
          alignment: 'right',
          bold: true,
        },
      ];

      if (appendixByInvoiceId.size > 0) {
        subtotalRow.push({ text: '', style: 'tableCell' });
      }

      rows.push(subtotalRow as Content[]);
    }
  }

  // Add total row
  const totalText = formatters?.formatCurrency(includedTotal ?? 0) ?? '—';
  const totalRow: Content[] = [
    { text: '', style: 'tableCell' },
    { text: '', style: 'tableCell' },
    { text: '', style: 'tableCell' },
    { text: t('sourceReports.table.total'), style: 'tableCell', bold: true },
    { text: '', style: 'tableCell' },
    {
      text: totalText,
      style: 'tableCell',
      alignment: 'right',
      bold: true,
    },
  ];

  if (appendixByInvoiceId.size > 0) {
    totalRow.push({ text: '', style: 'tableCell' });
  }

  rows.push(totalRow as Content[]);

  // Add table
  content.push({
    table: {
      headerRows: 1,
      widths:
        appendixByInvoiceId.size > 0
          ? ['*', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto']
          : ['*', 'auto', 'auto', 'auto', 'auto', 'auto'],
      body: rows,
    },
    layout: TABLE_LAYOUT,
    margin: [0, 0, 0, 20],
  });

  // Add footnotes (skip and split)
  const footnotes: Content[] = [];

  // Add skipped documents footnotes
  if (skippedDocuments.size > 0) {
    let skipFootnoteNum = 1;
    for (const [invoiceId, reasons] of skippedDocuments) {
      const invoice = report.invoices.find((inv) => inv.invoiceId === invoiceId);
      const vendorName = invoice?.vendorName ?? '—';
      const invoiceNumber = invoice?.invoiceNumber ?? '—';

      for (const reason of reasons) {
        footnotes.push({
          text: `*${skipFootnoteNum}: ${vendorName} (${invoiceNumber}) — ${t(`sourceReports.table.${reason}`)}`,
          style: 'small',
        });
        skipFootnoteNum++;
      }
    }
  }

  // Add split invoice footnotes
  if (splitFootnotesByInvoiceId.size > 0) {
    for (const [invoiceId, splitNum] of splitFootnotesByInvoiceId) {
      const invoice = report.invoices.find((inv) => inv.invoiceId === invoiceId);
      const vendorName = invoice?.vendorName ?? '—';
      const invoiceNumber = invoice?.invoiceNumber ?? '—';

      footnotes.push({
        text: `†${splitNum}: ${vendorName} (${invoiceNumber}) — ${t('sourceReports.table.splitFootnote')}`,
        style: 'small',
      });
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
