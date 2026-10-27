import type { SourceReportInvoice } from '@cornerstone/shared';

export interface ReportInvoiceGroup {
  readonly vendorId: string;
  readonly vendorName: string;
  readonly ids: readonly string[];
}

function compareText(a: string | null, b: string | null, locale: string): number {
  return (a ?? '').localeCompare(b ?? '', locale);
}

/**
 * Display order of the report invoices: company name, company, date (oldest first), invoice number,
 * invoice id. Total, so the order never depends on the server's row order.
 */
export function orderInvoices(
  invoices: readonly SourceReportInvoice[],
  locale: string,
): SourceReportInvoice[] {
  return [...invoices].sort(
    (a, b) =>
      compareText(a.vendorName, b.vendorName, locale) ||
      compareText(a.vendorId, b.vendorId, 'en') ||
      compareText(a.date, b.date, 'en') ||
      compareText(a.invoiceNumber, b.invoiceNumber, locale) ||
      compareText(a.invoiceId, b.invoiceId, 'en'),
  );
}

/** Groups invoice ids by company, keeping the order of `ids` (first appearance of a company). */
export function groupByCompany(
  ids: readonly string[],
  byId: ReadonlyMap<string, SourceReportInvoice>,
): ReportInvoiceGroup[] {
  const groups = new Map<string, { vendorId: string; vendorName: string; ids: string[] }>();
  for (const id of ids) {
    const invoice = byId.get(id)!;
    const group = groups.get(invoice.vendorId);
    if (group) {
      group.ids.push(id);
    } else {
      groups.set(invoice.vendorId, {
        vendorId: invoice.vendorId,
        vendorName: invoice.vendorName,
        ids: [id],
      });
    }
  }
  return [...groups.values()];
}
