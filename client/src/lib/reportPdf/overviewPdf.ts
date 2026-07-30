/**
 * Overview table PDF content builder.
 */
import type { TFunction } from 'i18next';
import type { Content } from 'pdfmake/build/pdfmake';
import type { SourceReportResponse, InvoiceStatus } from '@cornerstone/shared';
import {
  formatCurrencyForPdf,
  formatDateForPdf,
  TABLE_LAYOUT,
  REFUND_TEXT_COLOR,
} from './shared.js';

export function buildOverviewContent(
  report: SourceReportResponse,
  includedInvoiceIds: Set<string>,
  appendixByInvoiceId: Map<string, number>,
  skippedDocuments: Map<string, string[]>,
  useCase: string,
  t: TFunction,
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
        text: `${t('sourceReports.table.generatedAt')}: ${formatDateForPdf(new Date())}`,
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

  for (const invoice of report.invoices) {
    if (!includedInvoiceIds.has(invoice.invoiceId)) {
      continue;
    }

    const status = invoice.status as InvoiceStatus;
    statusCounts[status]++;

    const row: Content[] = [
      { text: invoice.vendorName, style: 'tableCell' },
      { text: invoice.invoiceNumber ?? '—', style: 'tableCell' },
      { text: formatDateForPdf(invoice.date), style: 'tableCell' },
      { text: t(`invoiceStatus.${status}`), style: 'tableCell' },
    ];

    // Invoice amount
    if (invoice.lineKind === 'refund-adjustment') {
      row.push({
        text: `-${formatCurrencyForPdf(invoice.invoiceAmount)}`,
        style: 'tableCell',
        alignment: 'right',
        color: REFUND_TEXT_COLOR,
      });
    } else {
      row.push({
        text: formatCurrencyForPdf(invoice.invoiceAmount),
        style: 'tableCell',
        alignment: 'right',
      });
    }

    // Allocated amount
    if (invoice.lineKind === 'refund-adjustment') {
      row.push({
        text: `-${formatCurrencyForPdf(invoice.allocatedAmount)} ${t('sourceReports.table.refundNote')}`,
        style: 'tableCell',
        alignment: 'right',
        color: REFUND_TEXT_COLOR,
      });
    } else if (invoice.isSplit) {
      const appendixNum = appendixByInvoiceId.get(invoice.invoiceId);
      const appendixRef = appendixNum ? `*${appendixNum}` : '';
      row.push({
        text: formatCurrencyForPdf(invoice.allocatedAmount) + appendixRef,
        style: 'tableCell',
        alignment: 'right',
      });
    } else {
      row.push({
        text: formatCurrencyForPdf(invoice.allocatedAmount),
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
    pending: 'invoiceStatus.pending',
    paid: 'invoiceStatus.paid',
    claimed: 'invoiceStatus.claimed',
    quotation: 'invoiceStatus.quotation',
  };

  for (const [status] of Object.entries(statusCounts)) {
    const count = statusCounts[status as InvoiceStatus];
    if (count > 0) {
      const invoicesWithStatus = report.invoices.filter(
        (inv) => inv.status === status && includedInvoiceIds.has(inv.invoiceId),
      );
      const subtotal = invoicesWithStatus.reduce((sum, inv) => sum + inv.allocatedAmount, 0);

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
          text: formatCurrencyForPdf(subtotal),
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
  const totalRow: Content[] = [
    { text: '', style: 'tableCell' },
    { text: '', style: 'tableCell' },
    { text: '', style: 'tableCell' },
    { text: t('sourceReports.table.total'), style: 'tableCell', bold: true },
    { text: '', style: 'tableCell' },
    {
      text: formatCurrencyForPdf(report.totalAmount),
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
          ? ['auto', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto']
          : ['auto', 'auto', 'auto', 'auto', 'auto', 'auto'],
      body: rows,
    },
    layout: TABLE_LAYOUT,
    margin: [0, 0, 0, 20],
  });

  // Add skipped documents footnotes
  if (skippedDocuments.size > 0) {
    const notes: Content[] = [];
    let footnoteNum = 1;
    for (const [_invoiceId, reasons] of skippedDocuments) {
      for (const reason of reasons) {
        notes.push({
          text: `*${footnoteNum}: ${t(`sourceReports.table.${reason}`)}`,
          style: 'small',
        });
        footnoteNum++;
      }
    }

    if (notes.length > 0) {
      content.push({
        stack: notes,
        margin: [0, 0, 0, 0],
      });
    }
  }

  return content;
}
