/**
 * Unit tests for client/src/lib/reportPdf/overviewPdf.ts
 *
 * Covers: columns incl. conditional Appendix column, split-row footnote refs, negative
 * refund-adjustment rows, per-status subtotal rows + grand total, skipped-document footnotes.
 *
 * NOTE: `buildOverviewContent` calls `formatDateForPdf(new Date())` unconditionally for the
 * "generated at" line (2nd content block). Per shared.test.ts's dedicated regression test,
 * formatDateForPdf throws a TypeError when given a Date (its own declared signature promises
 * Date support but the underlying formatters.ts formatDate only accepts strings). This file
 * mocks `./shared.js`'s formatDateForPdf to isolate overviewPdf.ts's own table-building logic
 * from that already-documented, separately-reported bug (see shared.test.ts and the final QA
 * report) — the crash itself is proven once, at the shared.ts level, not re-litigated here.
 * formatCurrencyForPdf is passed through to the real formatCurrency implementation.
 */
import { describe, it, expect, jest, beforeAll } from '@jest/globals';
import type { TFunction } from 'i18next';
import type { SourceReportResponse, SourceReportInvoice } from '@cornerstone/shared';
import { formatCurrency } from '../formatters.js';
import type * as OverviewPdfModule from './overviewPdf.js';

const t = ((key: string) => key) as unknown as TFunction;

let buildOverviewContent: typeof OverviewPdfModule.buildOverviewContent;

beforeAll(async () => {
  jest.unstable_mockModule('./shared.js', () => ({
    formatCurrencyForPdf: (n: number) => formatCurrency(n),
    formatDateForPdf: (d: string | Date) => (typeof d === 'string' ? d : '__GENERATED_DATE__'),
    TABLE_LAYOUT: { mocked: true },
    REFUND_TEXT_COLOR: '#991b1b',
  }));
  ({ buildOverviewContent } = (await import('./overviewPdf.js')) as typeof OverviewPdfModule);
});

function makeInvoice(overrides: Partial<SourceReportInvoice> = {}): SourceReportInvoice {
  return {
    invoiceId: 'inv-1',
    vendorId: 'vend-1',
    vendorName: 'ACME Builders',
    invoiceNumber: 'INV-001',
    date: '2026-01-10',
    status: 'pending',
    invoiceAmount: 1000,
    allocatedAmount: 1000,
    lineKind: 'invoice',
    isSplit: false,
    documents: [],
    ...overrides,
  };
}

function makeReport(invoices: SourceReportInvoice[], totalAmount: number): SourceReportResponse {
  return {
    type: 'claim',
    source: {
      id: 'src-1',
      name: 'Home Loan',
      sourceType: 'bank_loan',
      reference: null,
      contactAddress: null,
    },
    invoices,
    totalAmount,
    unallocatedInvoices: [],
    generatedAt: '2026-01-15T00:00:00.000Z',
  };
}

// Flattens a pdfmake `table.body` row into plain text strings for easy assertions.
function rowTexts(row: unknown): (string | undefined)[] {
  return (row as { text?: string }[]).map((cell) => cell.text);
}

function getTable(content: unknown[]): { headerRows: number; widths: string[]; body: unknown[][] } {
  const tableItem = content.find((c) => typeof c === 'object' && c !== null && 'table' in c) as {
    table: { headerRows: number; widths: string[]; body: unknown[][] };
  };
  return tableItem.table;
}

describe('buildOverviewContent', () => {
  it('renders the title, source name/type/reference, and generated-at line', () => {
    const report = makeReport([], 0);
    const content = buildOverviewContent(report, new Set(), new Map(), new Map(), 'claim', t);

    const titleItem = content[0] as { text: string };
    expect(titleItem.text).toBe('sourceReports.table.title.claim');

    const infoStack = content[1] as { stack: { text: string }[] };
    expect(infoStack.stack.map((s) => s.text)).toEqual(
      expect.arrayContaining([
        'sourceReports.table.source: Home Loan',
        expect.stringContaining('sourceReports.table.sourceType'),
        expect.stringContaining('sourceReports.table.generatedAt'),
      ]),
    );
  });

  it('omits the reference line from source info when reference is null', () => {
    const report = makeReport([], 0);
    const content = buildOverviewContent(report, new Set(), new Map(), new Map(), 'claim', t);
    const infoStack = content[1] as { stack: { text: string }[] };
    const refLine = infoStack.stack.find((s) => s.text.includes('sourceReports.table.reference'));
    expect(refLine).toBeUndefined();
  });

  it('includes the reference line when source.reference is present', async () => {
    const report: SourceReportResponse = {
      ...makeReport([], 0),
      source: {
        id: 'src-1',
        name: 'Home Loan',
        sourceType: 'bank_loan',
        reference: 'REF-99',
        contactAddress: null,
      },
    };
    const content = buildOverviewContent(report, new Set(), new Map(), new Map(), 'claim', t);
    const infoStack = content[1] as { stack: { text: string }[] };
    const refLine = infoStack.stack.find((s) => s.text.includes('REF-99'));
    expect(refLine).toBeDefined();
  });

  it('uses exactly the 6 spec-defined columns when no appendix is present', () => {
    const report = makeReport([], 0);
    const content = buildOverviewContent(report, new Set(), new Map(), new Map(), 'claim', t);
    const table = getTable(content);

    expect(table.widths).toHaveLength(6);
    const headerRow = rowTexts(table.body[0]);
    expect(headerRow).toEqual([
      'sourceReports.table.vendor',
      'sourceReports.table.invoiceNumber',
      'sourceReports.table.date',
      'sourceReports.table.status',
      'sourceReports.table.invoiceAmount',
      'sourceReports.table.allocatedAmount',
    ]);
  });

  it('adds a 7th Appendix column only when appendixByInvoiceId is non-empty', () => {
    const invoice = makeInvoice();
    const report = makeReport([invoice], 1000);
    const content = buildOverviewContent(
      report,
      new Set(['inv-1']),
      new Map([['inv-1', 1]]),
      new Map(),
      'claim',
      t,
    );
    const table = getTable(content);
    expect(table.widths).toHaveLength(7);
    const headerRow = rowTexts(table.body[0]);
    expect(headerRow[6]).toBe('sourceReports.table.appendix');
  });

  it('only includes invoices present in includedInvoiceIds (excluded ones are skipped entirely)', () => {
    const included = makeInvoice({ invoiceId: 'inv-1', vendorName: 'Included Vendor' });
    const excluded = makeInvoice({ invoiceId: 'inv-2', vendorName: 'Excluded Vendor' });
    const report = makeReport([included, excluded], 1000);
    const content = buildOverviewContent(
      report,
      new Set(['inv-1']),
      new Map(),
      new Map(),
      'claim',
      t,
    );
    const table = getTable(content);
    const vendorNames = table.body.slice(1).map((row) => rowTexts(row)[0]);
    expect(vendorNames).not.toContain('Excluded Vendor');
  });

  it('renders refund-adjustment rows with a negative invoice amount and a refund note on the allocated amount', () => {
    const refund = makeInvoice({
      invoiceId: 'inv-refund',
      lineKind: 'refund-adjustment',
      invoiceAmount: 200,
      allocatedAmount: 200,
    });
    const report = makeReport([refund], -200);
    const content = buildOverviewContent(
      report,
      new Set(['inv-refund']),
      new Map(),
      new Map(),
      'claim',
      t,
    );
    const table = getTable(content);
    const row = rowTexts(table.body[1]);

    expect(row[4]).toBe(`-${formatCurrency(200)}`);
    expect(row[5]).toContain(`-${formatCurrency(200)}`);
    expect(row[5]).toContain('sourceReports.table.refundNote');
  });

  it('renders a footnote reference on the allocated amount for split invoices with an appendix number', () => {
    const split = makeInvoice({
      invoiceId: 'inv-split',
      isSplit: true,
      allocatedAmount: 400,
      invoiceAmount: 1000,
    });
    const report = makeReport([split], 400);
    const content = buildOverviewContent(
      report,
      new Set(['inv-split']),
      new Map([['inv-split', 3]]),
      new Map(),
      'claim',
      t,
    );
    const table = getTable(content);
    const row = rowTexts(table.body[1]);
    expect(row[5]).toBe(`${formatCurrency(400)}*3`);
  });

  it('renders split invoices without a footnote marker when no appendix number was assigned', () => {
    const split = makeInvoice({
      invoiceId: 'inv-split',
      isSplit: true,
      allocatedAmount: 400,
      invoiceAmount: 1000,
    });
    const report = makeReport([split], 400);
    const content = buildOverviewContent(
      report,
      new Set(['inv-split']),
      new Map(),
      new Map(),
      'claim',
      t,
    );
    const table = getTable(content);
    const row = rowTexts(table.body[1]);
    expect(row[5]).toBe(formatCurrency(400));
  });

  it('renders the appendix column value or an em-dash placeholder when appendix tracking is active', () => {
    const withAppendix = makeInvoice({ invoiceId: 'inv-1' });
    const withoutAppendix = makeInvoice({ invoiceId: 'inv-2' });
    const report = makeReport([withAppendix, withoutAppendix], 2000);
    const content = buildOverviewContent(
      report,
      new Set(['inv-1', 'inv-2']),
      new Map([['inv-1', 1]]),
      new Map(),
      'claim',
      t,
    );
    const table = getTable(content);
    expect(rowTexts(table.body[1])[6]).toBe('1');
    expect(rowTexts(table.body[2])[6]).toBe('—');
  });

  it('adds one subtotal row per distinct status present among included invoices', () => {
    const pending = makeInvoice({ invoiceId: 'inv-1', status: 'pending', allocatedAmount: 100 });
    const paid = makeInvoice({ invoiceId: 'inv-2', status: 'paid', allocatedAmount: 200 });
    const claimed = makeInvoice({ invoiceId: 'inv-3', status: 'claimed', allocatedAmount: 300 });
    const quotation = makeInvoice({
      invoiceId: 'inv-4',
      status: 'quotation',
      allocatedAmount: 400,
    });
    const report = makeReport([pending, paid, claimed, quotation], 1000);
    const content = buildOverviewContent(
      report,
      new Set(['inv-1', 'inv-2', 'inv-3', 'inv-4']),
      new Map(),
      new Map(),
      'budget-overview',
      t,
    );
    const table = getTable(content);

    // header (1) + 4 invoice rows + 4 subtotal rows + 1 total row = 10
    expect(table.body).toHaveLength(10);

    const subtotalRows = table.body.slice(5, 9).map((row) => rowTexts(row));
    expect(subtotalRows[0]![3]).toContain('invoiceStatus.pending');
    expect(subtotalRows[0]![5]).toBe(formatCurrency(100));
    expect(subtotalRows[1]![3]).toContain('invoiceStatus.paid');
    expect(subtotalRows[1]![5]).toBe(formatCurrency(200));
    expect(subtotalRows[2]![3]).toContain('invoiceStatus.claimed');
    expect(subtotalRows[2]![5]).toBe(formatCurrency(300));
    expect(subtotalRows[3]![3]).toContain('invoiceStatus.quotation');
    expect(subtotalRows[3]![5]).toBe(formatCurrency(400));
  });

  it('does not add a subtotal row for a status with zero included invoices', () => {
    const pending = makeInvoice({ invoiceId: 'inv-1', status: 'pending', allocatedAmount: 100 });
    const report = makeReport([pending], 100);
    const content = buildOverviewContent(
      report,
      new Set(['inv-1']),
      new Map(),
      new Map(),
      'claim',
      t,
    );
    const table = getTable(content);
    // header (1) + 1 invoice row + 1 subtotal row (pending only) + 1 total row = 4
    expect(table.body).toHaveLength(4);
  });

  it('a refund-adjustment invoice nets the claim total below the positive-only sum', () => {
    const invoice = makeInvoice({ invoiceId: 'inv-1', status: 'paid', allocatedAmount: 1000 });
    const refund = makeInvoice({
      invoiceId: 'inv-refund',
      status: 'paid',
      lineKind: 'refund-adjustment',
      allocatedAmount: 200,
      invoiceAmount: 200,
    });
    // Server has already netted totalAmount = 1000 - 200 = 800.
    const report = makeReport([invoice, refund], 800);
    const content = buildOverviewContent(
      report,
      new Set(['inv-1', 'inv-refund']),
      new Map(),
      new Map(),
      'claim',
      t,
    );
    const table = getTable(content);

    const totalRow = rowTexts(table.body[table.body.length - 1]);
    expect(totalRow[3]).toBe('sourceReports.table.total');
    expect(totalRow[5]).toBe(formatCurrency(800));
    expect(formatCurrency(800)).not.toBe(formatCurrency(1200));
  });

  it('the final total row always reflects report.totalAmount, not a re-derived sum', () => {
    const invoice = makeInvoice({ invoiceId: 'inv-1', allocatedAmount: 500 });
    const report = makeReport([invoice], 999); // Deliberately mismatched from the row sum.
    const content = buildOverviewContent(
      report,
      new Set(['inv-1']),
      new Map(),
      new Map(),
      'claim',
      t,
    );
    const table = getTable(content);
    const totalRow = rowTexts(table.body[table.body.length - 1]);
    expect(totalRow[5]).toBe(formatCurrency(999));
  });

  it('renders numbered skipped-document footnotes after the table', () => {
    const report = makeReport([], 0);
    const skipped = new Map<string, string[]>([
      ['inv-1', ['footnoteFetchFailed']],
      ['inv-2', ['footnoteInvalidPdf', 'footnoteFetchFailed']],
    ]);
    const content = buildOverviewContent(report, new Set(), new Map(), skipped, 'claim', t);

    const notesStack = content[content.length - 1] as { stack: { text: string }[] };
    expect(notesStack.stack).toHaveLength(3);
    expect(notesStack.stack[0]!.text).toBe('*1: sourceReports.table.footnoteFetchFailed');
    expect(notesStack.stack[1]!.text).toBe('*2: sourceReports.table.footnoteInvalidPdf');
    expect(notesStack.stack[2]!.text).toBe('*3: sourceReports.table.footnoteFetchFailed');
  });

  it('does not render a footnotes block when there are no skipped documents', () => {
    const report = makeReport([], 0);
    const content = buildOverviewContent(report, new Set(), new Map(), new Map(), 'claim', t);
    const lastItem = content[content.length - 1];
    // Last item should be the table itself, not a footnotes stack.
    expect(lastItem).toEqual(expect.objectContaining({ table: expect.anything() }));
  });

  it('passes the (mocked) TABLE_LAYOUT through to the pdfmake table content block', () => {
    const report = makeReport([], 0);
    const content = buildOverviewContent(report, new Set(), new Map(), new Map(), 'claim', t);
    const tableItem = content.find((c) => typeof c === 'object' && c !== null && 'table' in c) as {
      layout: unknown;
    };
    expect(tableItem.layout).toEqual({ mocked: true });
  });
});
