/**
 * Unit tests for client/src/lib/reportPdf/overviewPdf.ts
 *
 * Covers: columns incl. conditional Appendix column, the dual footnote-marker model (`*` = a
 * skipped document, unconditional per skip; `†` = a split invoice, unconditional per included
 * isSplit row — both may concatenate on the same cell), refund-adjustment rows (no sign
 * negation — allocatedAmount/invoiceAmount arrive already correctly signed from the server per
 * frontend fix spec item 3), per-status subtotal rows, the `includedTotal` grand-total param, and
 * skipped-document footnotes with vendor/invoice-number attribution.
 *
 * FIXED (frontend fix spec item 6): `buildOverviewContent` no longer imports a module-level
 * `formatCurrencyForPdf`/`formatDateForPdf` from ./shared.js (both were deleted — see
 * shared.test.ts). It now takes an optional `formatters: Formatters` param and falls back to '—'
 * (amount cells) or the raw ISO date string (date cells) when omitted. TABLE_LAYOUT and
 * REFUND_TEXT_COLOR are still imported from the real (unmocked) ./shared.js — they're simple
 * constants with no formatting logic worth isolating.
 *
 * FIXED (frontend fix spec item 3): allocatedAmount/invoiceAmount are NEVER negated by this
 * builder — the server already returns a negative allocatedAmount for refund-adjustment lines
 * (invoiceAmount stays positive). Fixtures below reflect that sign contract directly.
 *
 * FIXED (frontend fix spec item 5): the grand total row renders the `includedTotal` param passed
 * in by the caller (merge.ts computes it once, respecting exclusions and signs, and forwards the
 * same value to both builders) — NOT a re-derivation of `report.totalAmount`. See merge.test.ts
 * for coverage of the includedTotal computation itself.
 *
 * FIXED (frontend fix spec item 11): the split marker (`†`) is now assigned to EVERY included
 * invoice with `isSplit === true`, independent of whether it has an appendix number (previously
 * it was implicitly gated on appendixByInvoiceId containing the invoice). Skip footnotes
 * (`*`) now include vendor/invoice-number attribution, matching the split footnote's format.
 */
import { describe, it, expect } from '@jest/globals';
import type { TFunction } from 'i18next';
import type { SourceReportResponse, SourceReportInvoice } from '@cornerstone/shared';
import type { Formatters } from '../formatters.js';
import { buildOverviewContent } from './overviewPdf.js';

const t = ((key: string) => key) as unknown as TFunction;

const formatters: Formatters = {
  formatCurrency: (n: number) => `€${n.toFixed(2)}`,
  formatDate: (d) => (typeof d === 'string' ? `date(${d})` : '—'),
};

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

function makeReport(invoices: SourceReportInvoice[]): SourceReportResponse {
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
    totalAmount: invoices.reduce((sum, inv) => sum + inv.allocatedAmount, 0),
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
    const report = makeReport([]);
    const content = buildOverviewContent(
      report,
      new Set(),
      new Map(),
      new Map(),
      'claim',
      t,
      formatters,
      0,
    );

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

  it('formats the generated-at line via formatters.formatDate when formatters is provided', () => {
    const report = makeReport([]);
    const content = buildOverviewContent(
      report,
      new Set(),
      new Map(),
      new Map(),
      'claim',
      t,
      formatters,
      0,
    );
    const infoStack = content[1] as { stack: { text: string }[] };
    const generatedLine = infoStack.stack.find((s) =>
      s.text.startsWith('sourceReports.table.generatedAt'),
    );
    expect(generatedLine?.text).toMatch(
      /^sourceReports\.table\.generatedAt: date\(\d{4}-\d{2}-\d{2}\)$/,
    );
  });

  it('falls back to the raw ISO date string for generated-at when formatters is omitted', () => {
    const report = makeReport([]);
    const content = buildOverviewContent(report, new Set(), new Map(), new Map(), 'claim', t);
    const infoStack = content[1] as { stack: { text: string }[] };
    const generatedLine = infoStack.stack.find((s) =>
      s.text.startsWith('sourceReports.table.generatedAt'),
    );
    expect(generatedLine?.text).toMatch(/^sourceReports\.table\.generatedAt: \d{4}-\d{2}-\d{2}$/);
  });

  it('omits the reference line from source info when reference is null', () => {
    const report = makeReport([]);
    const content = buildOverviewContent(
      report,
      new Set(),
      new Map(),
      new Map(),
      'claim',
      t,
      formatters,
      0,
    );
    const infoStack = content[1] as { stack: { text: string }[] };
    const refLine = infoStack.stack.find((s) => s.text.includes('sourceReports.table.reference'));
    expect(refLine).toBeUndefined();
  });

  it('includes the reference line when source.reference is present', () => {
    const report: SourceReportResponse = {
      ...makeReport([]),
      source: {
        id: 'src-1',
        name: 'Home Loan',
        sourceType: 'bank_loan',
        reference: 'REF-99',
        contactAddress: null,
      },
    };
    const content = buildOverviewContent(
      report,
      new Set(),
      new Map(),
      new Map(),
      'claim',
      t,
      formatters,
      0,
    );
    const infoStack = content[1] as { stack: { text: string }[] };
    const refLine = infoStack.stack.find((s) => s.text.includes('REF-99'));
    expect(refLine).toBeDefined();
  });

  it('uses exactly the 6 spec-defined columns when no appendix is present', () => {
    const report = makeReport([]);
    const content = buildOverviewContent(
      report,
      new Set(),
      new Map(),
      new Map(),
      'claim',
      t,
      formatters,
      0,
    );
    const table = getTable(content);

    expect(table.widths).toHaveLength(6);
    expect(table.widths[0]).toBe('*');
    expect(table.widths.slice(1)).toEqual(['auto', 'auto', 'auto', 'auto', 'auto']);
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

  it('adds a 7th Appendix column only when appendixByInvoiceId is non-empty, keeping the "*" + auto width pattern', () => {
    const invoice = makeInvoice();
    const report = makeReport([invoice]);
    const content = buildOverviewContent(
      report,
      new Set(['inv-1']),
      new Map([['inv-1', 1]]),
      new Map(),
      'claim',
      t,
      formatters,
      1000,
    );
    const table = getTable(content);
    expect(table.widths).toHaveLength(7);
    expect(table.widths[0]).toBe('*');
    expect(table.widths.slice(1)).toEqual(['auto', 'auto', 'auto', 'auto', 'auto', 'auto']);
    const headerRow = rowTexts(table.body[0]);
    expect(headerRow[6]).toBe('sourceReports.table.appendix');
  });

  it('only includes invoices present in includedInvoiceIds (excluded ones are skipped entirely)', () => {
    const included = makeInvoice({ invoiceId: 'inv-1', vendorName: 'Included Vendor' });
    const excluded = makeInvoice({ invoiceId: 'inv-2', vendorName: 'Excluded Vendor' });
    const report = makeReport([included, excluded]);
    const content = buildOverviewContent(
      report,
      new Set(['inv-1']),
      new Map(),
      new Map(),
      'claim',
      t,
      formatters,
      1000,
    );
    const table = getTable(content);
    const vendorNames = table.body.slice(1).map((row) => rowTexts(row)[0]);
    expect(vendorNames).not.toContain('Excluded Vendor');
  });

  it('renders "—" fallbacks for amounts/subtotal and the raw date string when formatters is omitted, and "—" for a null invoiceNumber', () => {
    const invoice = makeInvoice({
      invoiceId: 'inv-1',
      invoiceNumber: null,
      date: '2026-02-01',
      status: 'pending',
      allocatedAmount: 250,
    });
    const report = makeReport([invoice]);
    const content = buildOverviewContent(
      report,
      new Set(['inv-1']),
      new Map(),
      new Map(),
      'claim',
      t,
      // formatters omitted entirely
    );
    const table = getTable(content);
    const row = rowTexts(table.body[1]);
    expect(row[1]).toBe('—'); // invoiceNumber ?? '—'
    expect(row[2]).toBe('2026-02-01'); // raw date, no formatters
    expect(row[4]).toBe('—'); // invoiceAmountText fallback
    expect(row[5]).toBe('—'); // allocatedText fallback

    const subtotalRow = rowTexts(table.body[2]);
    expect(subtotalRow[5]).toBe('—'); // subtotalText fallback

    const totalRow = rowTexts(table.body[table.body.length - 1]);
    expect(totalRow[5]).toBe('—'); // totalText fallback (includedTotal ?? 0, still no formatters)
  });

  it('renders the invoice date via formatters.formatDate', () => {
    const invoice = makeInvoice({ date: '2026-03-04' });
    const report = makeReport([invoice]);
    const content = buildOverviewContent(
      report,
      new Set(['inv-1']),
      new Map(),
      new Map(),
      'claim',
      t,
      formatters,
      1000,
    );
    const table = getTable(content);
    expect(rowTexts(table.body[1])[2]).toBe('date(2026-03-04)');
  });

  describe('refund-adjustment rows (no sign negation — values arrive pre-signed)', () => {
    it('renders the invoice amount positively (invoiceAmount is never negated) with the refund text color', () => {
      const refund = makeInvoice({
        invoiceId: 'inv-refund',
        lineKind: 'refund-adjustment',
        invoiceAmount: 200,
        allocatedAmount: -200,
      });
      const report = makeReport([refund]);
      const content = buildOverviewContent(
        report,
        new Set(['inv-refund']),
        new Map(),
        new Map(),
        'claim',
        t,
        formatters,
        -200,
      );
      const table = getTable(content);
      const row = rowTexts(table.body[1]);

      expect(row[4]).toBe('€200.00');
      const rawRow = table.body[1] as { color?: string }[];
      expect(rawRow[4]!.color).toBe('#991b1b');
    });

    it('renders the already-negative allocated amount as-is (no double negation) with a refund note', () => {
      const refund = makeInvoice({
        invoiceId: 'inv-refund',
        lineKind: 'refund-adjustment',
        invoiceAmount: 200,
        allocatedAmount: -200,
      });
      const report = makeReport([refund]);
      const content = buildOverviewContent(
        report,
        new Set(['inv-refund']),
        new Map(),
        new Map(),
        'claim',
        t,
        formatters,
        -200,
      );
      const table = getTable(content);
      const row = rowTexts(table.body[1]);

      expect(row[5]).toContain('€-200.00');
      expect(row[5]).toContain('sourceReports.table.refundNote');
      const rawRow = table.body[1] as { color?: string }[];
      expect(rawRow[5]!.color).toBe('#991b1b');
    });
  });

  describe('dual footnote-marker model', () => {
    it('marks a split invoice with "†N" unconditionally, even with NO appendix number assigned', () => {
      const split = makeInvoice({
        invoiceId: 'inv-split',
        isSplit: true,
        allocatedAmount: 400,
        invoiceAmount: 1000,
      });
      const report = makeReport([split]);
      const content = buildOverviewContent(
        report,
        new Set(['inv-split']),
        new Map(), // no appendix entry
        new Map(),
        'claim',
        t,
        formatters,
        400,
      );
      const table = getTable(content);
      const row = rowTexts(table.body[1]);
      expect(row[5]).toBe('€400.00†1');
    });

    it('does not mark a non-split invoice, regardless of appendix presence', () => {
      const invoice = makeInvoice({ invoiceId: 'inv-1', isSplit: false });
      const report = makeReport([invoice]);
      const content = buildOverviewContent(
        report,
        new Set(['inv-1']),
        new Map([['inv-1', 1]]),
        new Map(),
        'claim',
        t,
        formatters,
        1000,
      );
      const table = getTable(content);
      const row = rowTexts(table.body[1]);
      expect(row[5]).toBe('€1000.00');
    });

    it('marks a skipped document with "*N" on the invoice with the failed/invalid document', () => {
      const invoice = makeInvoice({ invoiceId: 'inv-1' });
      const report = makeReport([invoice]);
      const skipped = new Map<string, string[]>([['inv-1', ['footnoteFetchFailed']]]);
      const content = buildOverviewContent(
        report,
        new Set(['inv-1']),
        new Map(),
        skipped,
        'claim',
        t,
        formatters,
        1000,
      );
      const table = getTable(content);
      const row = rowTexts(table.body[1]);
      expect(row[5]).toBe('€1000.00*1');
    });

    it('concatenates both markers ("*N†M") on a single cell when a split invoice also has a skipped document', () => {
      const invoice = makeInvoice({ invoiceId: 'inv-1', isSplit: true, allocatedAmount: 400 });
      const report = makeReport([invoice]);
      const skipped = new Map<string, string[]>([['inv-1', ['footnoteInvalidPdf']]]);
      const content = buildOverviewContent(
        report,
        new Set(['inv-1']),
        new Map(),
        skipped,
        'claim',
        t,
        formatters,
        400,
      );
      const table = getTable(content);
      const row = rowTexts(table.body[1]);
      // Skip marker(s) always precede the split marker in markerText concatenation order.
      expect(row[5]).toBe('€400.00*1†1');
    });

    it('numbers multiple skip reasons on the same invoice sequentially', () => {
      const invoice = makeInvoice({ invoiceId: 'inv-1' });
      const report = makeReport([invoice]);
      const skipped = new Map<string, string[]>([
        ['inv-1', ['footnoteFetchFailed', 'footnoteInvalidPdf']],
      ]);
      const content = buildOverviewContent(
        report,
        new Set(['inv-1']),
        new Map(),
        skipped,
        'claim',
        t,
        formatters,
        1000,
      );
      const table = getTable(content);
      const row = rowTexts(table.body[1]);
      expect(row[5]).toBe('€1000.00*1*2');
    });
  });

  it('renders the appendix column value or an em-dash placeholder when appendix tracking is active', () => {
    const withAppendix = makeInvoice({ invoiceId: 'inv-1' });
    const withoutAppendix = makeInvoice({ invoiceId: 'inv-2' });
    const report = makeReport([withAppendix, withoutAppendix]);
    const content = buildOverviewContent(
      report,
      new Set(['inv-1', 'inv-2']),
      new Map([['inv-1', 1]]),
      new Map(),
      'claim',
      t,
      formatters,
      2000,
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
    const report = makeReport([pending, paid, claimed, quotation]);
    const content = buildOverviewContent(
      report,
      new Set(['inv-1', 'inv-2', 'inv-3', 'inv-4']),
      new Map(),
      new Map(),
      'budget-overview',
      t,
      formatters,
      1000,
    );
    const table = getTable(content);

    // header (1) + 4 invoice rows + 4 subtotal rows + 1 total row = 10
    expect(table.body).toHaveLength(10);

    const subtotalRows = table.body.slice(5, 9).map((row) => rowTexts(row));
    expect(subtotalRows[0]![3]).toContain('invoiceStatus.pending');
    expect(subtotalRows[0]![5]).toBe('€100.00');
    expect(subtotalRows[1]![3]).toContain('invoiceStatus.paid');
    expect(subtotalRows[1]![5]).toBe('€200.00');
    expect(subtotalRows[2]![3]).toContain('invoiceStatus.claimed');
    expect(subtotalRows[2]![5]).toBe('€300.00');
    expect(subtotalRows[3]![3]).toContain('invoiceStatus.quotation');
    expect(subtotalRows[3]![5]).toBe('€400.00');
  });

  it('does not add a subtotal row for a status with zero included invoices', () => {
    const pending = makeInvoice({ invoiceId: 'inv-1', status: 'pending', allocatedAmount: 100 });
    const report = makeReport([pending]);
    const content = buildOverviewContent(
      report,
      new Set(['inv-1']),
      new Map(),
      new Map(),
      'claim',
      t,
      formatters,
      100,
    );
    const table = getTable(content);
    // header (1) + 1 invoice row + 1 subtotal row (pending only) + 1 total row = 4
    expect(table.body).toHaveLength(4);
  });

  describe('grand total row (includedTotal param)', () => {
    it('renders the includedTotal param passed by the caller, not a re-derived sum of visible rows', () => {
      const invoice = makeInvoice({ invoiceId: 'inv-1', allocatedAmount: 500 });
      const report = makeReport([invoice]);
      // Deliberately mismatched from the single row's own allocatedAmount — proves the total row
      // renders whatever the caller passed, not a value it derives itself.
      const content = buildOverviewContent(
        report,
        new Set(['inv-1']),
        new Map(),
        new Map(),
        'claim',
        t,
        formatters,
        999,
      );
      const table = getTable(content);
      const totalRow = rowTexts(table.body[table.body.length - 1]);
      expect(totalRow[3]).toBe('sourceReports.table.total');
      expect(totalRow[5]).toBe('€999.00');
    });

    it('defaults includedTotal to 0 when the param is omitted', () => {
      const invoice = makeInvoice({ invoiceId: 'inv-1', allocatedAmount: 500 });
      const report = makeReport([invoice]);
      const content = buildOverviewContent(
        report,
        new Set(['inv-1']),
        new Map(),
        new Map(),
        'claim',
        t,
        formatters,
      );
      const table = getTable(content);
      const totalRow = rowTexts(table.body[table.body.length - 1]);
      expect(totalRow[5]).toBe('€0.00');
    });

    it('renders a negative includedTotal as-is (a net-refund report)', () => {
      const invoice = makeInvoice({ invoiceId: 'inv-1', allocatedAmount: 100 });
      const refund = makeInvoice({
        invoiceId: 'inv-refund',
        lineKind: 'refund-adjustment',
        allocatedAmount: -300,
        invoiceAmount: 300,
      });
      const report = makeReport([invoice, refund]);
      const content = buildOverviewContent(
        report,
        new Set(['inv-1', 'inv-refund']),
        new Map(),
        new Map(),
        'claim',
        t,
        formatters,
        -200,
      );
      const table = getTable(content);
      const totalRow = rowTexts(table.body[table.body.length - 1]);
      expect(totalRow[5]).toBe('€-200.00');
    });
  });

  describe('skipped-document footnotes with vendor/invoice-number attribution', () => {
    it('renders numbered skipped-document footnotes attributing each to its vendor and invoice number', () => {
      const inv1 = makeInvoice({ invoiceId: 'inv-1', vendorName: 'ACME', invoiceNumber: 'A-1' });
      const inv2 = makeInvoice({ invoiceId: 'inv-2', vendorName: 'Beta', invoiceNumber: 'B-2' });
      const report = makeReport([inv1, inv2]);
      const skipped = new Map<string, string[]>([
        ['inv-1', ['footnoteFetchFailed']],
        ['inv-2', ['footnoteInvalidPdf', 'footnoteFetchFailed']],
      ]);
      const content = buildOverviewContent(
        report,
        new Set(['inv-1', 'inv-2']),
        new Map(),
        skipped,
        'claim',
        t,
        formatters,
        2000,
      );

      const notesStack = content[content.length - 1] as { stack: { text: string }[] };
      expect(notesStack.stack).toHaveLength(3);
      expect(notesStack.stack[0]!.text).toBe(
        '*1: ACME (A-1) — sourceReports.table.footnoteFetchFailed',
      );
      expect(notesStack.stack[1]!.text).toBe(
        '*2: Beta (B-2) — sourceReports.table.footnoteInvalidPdf',
      );
      expect(notesStack.stack[2]!.text).toBe(
        '*3: Beta (B-2) — sourceReports.table.footnoteFetchFailed',
      );
    });

    it('falls back to em-dashes when the skipped invoiceId is not found in report.invoices', () => {
      const report = makeReport([]);
      const skipped = new Map<string, string[]>([['unknown-inv', ['footnoteFetchFailed']]]);
      const content = buildOverviewContent(
        report,
        new Set(),
        new Map(),
        skipped,
        'claim',
        t,
        formatters,
        0,
      );
      const notesStack = content[content.length - 1] as { stack: { text: string }[] };
      expect(notesStack.stack[0]!.text).toBe('*1: — (—) — sourceReports.table.footnoteFetchFailed');
    });

    it('renders split-invoice footnotes with vendor/invoice-number attribution and the dedicated splitFootnote key', () => {
      const split = makeInvoice({
        invoiceId: 'inv-split',
        vendorName: 'Gamma Corp',
        invoiceNumber: 'G-9',
        isSplit: true,
        allocatedAmount: 400,
      });
      const report = makeReport([split]);
      const content = buildOverviewContent(
        report,
        new Set(['inv-split']),
        new Map(),
        new Map(),
        'claim',
        t,
        formatters,
        400,
      );
      const notesStack = content[content.length - 1] as { stack: { text: string }[] };
      expect(notesStack.stack).toHaveLength(1);
      expect(notesStack.stack[0]!.text).toBe(
        '†1: Gamma Corp (G-9) — sourceReports.table.splitFootnote',
      );
    });

    it('renders both skip and split footnote blocks together, each with independent numbering', () => {
      const skippedInv = makeInvoice({
        invoiceId: 'inv-1',
        vendorName: 'ACME',
        invoiceNumber: 'A-1',
      });
      const splitInv = makeInvoice({
        invoiceId: 'inv-2',
        vendorName: 'Beta',
        invoiceNumber: 'B-2',
        isSplit: true,
        allocatedAmount: 400,
      });
      const report = makeReport([skippedInv, splitInv]);
      const skipped = new Map<string, string[]>([['inv-1', ['footnoteFetchFailed']]]);
      const content = buildOverviewContent(
        report,
        new Set(['inv-1', 'inv-2']),
        new Map(),
        skipped,
        'claim',
        t,
        formatters,
        1400,
      );
      const notesStack = content[content.length - 1] as { stack: { text: string }[] };
      expect(notesStack.stack).toHaveLength(2);
      expect(notesStack.stack[0]!.text).toBe(
        '*1: ACME (A-1) — sourceReports.table.footnoteFetchFailed',
      );
      expect(notesStack.stack[1]!.text).toBe('†1: Beta (B-2) — sourceReports.table.splitFootnote');
    });

    it('does not render a footnotes block when there are no skipped documents and no split invoices', () => {
      const report = makeReport([]);
      const content = buildOverviewContent(
        report,
        new Set(),
        new Map(),
        new Map(),
        'claim',
        t,
        formatters,
        0,
      );
      const lastItem = content[content.length - 1];
      // Last item should be the table itself, not a footnotes stack.
      expect(lastItem).toEqual(expect.objectContaining({ table: expect.anything() }));
    });
  });

  it('passes the real TABLE_LAYOUT through to the pdfmake table content block', async () => {
    const { TABLE_LAYOUT } = await import('./shared.js');
    const report = makeReport([]);
    const content = buildOverviewContent(
      report,
      new Set(),
      new Map(),
      new Map(),
      'claim',
      t,
      formatters,
      0,
    );
    const tableItem = content.find((c) => typeof c === 'object' && c !== null && 'table' in c) as {
      layout: unknown;
    };
    expect(tableItem.layout).toBe(TABLE_LAYOUT);
  });
});
