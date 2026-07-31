/**
 * Unit tests for client/src/lib/reportPdf/overviewPdf.ts
 *
 * Story #1900 REWRITE. buildOverviewContent's signature changed from consuming a raw
 * SourceReportResponse + derivation params to consuming an already-built `ReportContent` (text
 * only, no PDF-specific data derivation left in this file) plus the generation-time
 * `skippedDocuments: Map<invoiceId, reason[]>` map (skip footnotes are the one thing NOT baked
 * into ReportContent per the spec — they're async, generation-time data):
 *
 *   buildOverviewContent(reportContent: ReportContent, skippedDocuments: Map<string, string[]>, t: TFunction): Content[]
 *
 * `appendixByInvoiceId` is GONE entirely (previously accepted-but-unrendered; now the appendix
 * column doesn't exist in the signature at all — see merge.ts/merge.test.ts for where appendix
 * numbering lives now, purely in the pdf-lib splice step, never touching the table itself).
 * Row-level data derivation (usage text, attachment notes, split/deposit markers, footnote text)
 * has all moved to buildReportContent.ts (see buildReportContent.test.ts) — this file only lays
 * out the already-derived ReportContent fields into pdfmake Content[].
 */
import { describe, it, expect } from '@jest/globals';
import type { TFunction } from 'i18next';
import type { ReportContent, ReportContentRow } from '../reportContent/index.js';
import { buildOverviewContent } from './overviewPdf.js';

const t = ((key: string) => key) as unknown as TFunction;

function makeRow(overrides: Partial<ReportContentRow> = {}): ReportContentRow {
  return {
    invoiceId: 'inv-1',
    vendor: 'ACME Builders',
    invoiceNumber: 'INV-001',
    dateText: 'date(2026-01-10)',
    status: null,
    statusText: null,
    invoiceAmountText: '€1000.00',
    allocatedAmountValueText: '€1000.00',
    allocatedMarkers: '',
    isRefund: false,
    refundNoteText: 'sourceReports.table.refundNote',
    usageText: '—',
    attachmentsNote: null,
    ...overrides,
  };
}

// Key-echo convention: labels values equal the i18n key strings themselves, matching the mock
// `t` used throughout this file (`t = (key) => key`). This keeps every existing header/source-info
// assertion (which asserts against the raw key string) passing unchanged, since buildReportContent
// (not tested here) is what would normally produce these translated values — overviewPdf.ts only
// ever reads reportContent.labels.*, never calls t() for label text itself.
function makeLabels(): ReportContent['labels'] {
  return {
    vendor: 'sourceReports.table.vendor',
    invoiceNumber: 'sourceReports.table.invoiceNumber',
    date: 'sourceReports.table.date',
    status: 'sourceReports.table.status',
    invoiceAmount: 'sourceReports.table.invoiceAmount',
    allocatedAmount: 'sourceReports.table.allocatedAmount',
    usage: 'sourceReports.table.usage',
    attachmentsNote: 'sourceReports.editable.attachmentsNoteLabel',
    source: 'sourceReports.table.source',
    sourceType: 'sourceReports.table.sourceType',
    reference: 'sourceReports.table.reference',
    generatedAt: 'sourceReports.table.generatedAt',
  };
}

function makeContent(overrides: Partial<ReportContent> = {}): ReportContent {
  return {
    isOverview: false,
    tableTitle: 'sourceReports.table.title.claim',
    labels: makeLabels(),
    sourceInfo: {
      sourceName: 'Home Loan',
      sourceTypeText: 'sourceReports.sourceType.bank_loan',
      referenceText: null,
      generatedAtText: 'date(2026-01-15)',
    },
    coverLetter: null,
    rows: [],
    summaryRows: [{ key: 'total', label: 'sourceReports.table.total', amountText: '€0.00' }],
    footnotes: [],
    ...overrides,
  };
}

// Flattens a pdfmake `table.body` row into plain text strings for easy assertions. Cells that are
// `stack`s (the Usage column when an attachment note is present) yield `undefined`.
function rowTexts(row: unknown): (string | undefined)[] {
  return (row as { text?: string }[]).map((cell) => cell.text);
}

function getTable(content: unknown[]): { headerRows: number; widths: string[]; body: unknown[][] } {
  const tableItem = content.find((c) => typeof c === 'object' && c !== null && 'table' in c) as {
    table: { headerRows: number; widths: string[]; body: unknown[][] };
  };
  return tableItem.table;
}

describe('buildOverviewContent — title and source info', () => {
  it('renders the title from reportContent.tableTitle and source info from reportContent.sourceInfo', () => {
    const content = makeContent({ tableTitle: 'sourceReports.table.title.claim' });
    const result = buildOverviewContent(content, new Map(), t);

    const titleItem = result[0] as { text: string };
    expect(titleItem.text).toBe('sourceReports.table.title.claim');

    const infoStack = result[1] as { stack: { text: string }[] };
    expect(infoStack.stack.map((s) => s.text)).toEqual(
      expect.arrayContaining([
        'sourceReports.table.source: Home Loan',
        expect.stringContaining('sourceReports.table.sourceType'),
        expect.stringContaining('sourceReports.table.generatedAt'),
      ]),
    );
  });

  it('omits the reference line when sourceInfo.referenceText is null', () => {
    const content = makeContent({
      sourceInfo: { ...makeContent().sourceInfo, referenceText: null },
    });
    const result = buildOverviewContent(content, new Map(), t);
    const infoStack = result[1] as { stack: { text: string }[] };
    expect(
      infoStack.stack.find((s) => s.text.includes('sourceReports.table.reference')),
    ).toBeUndefined();
  });

  it('includes the reference line when sourceInfo.referenceText is present', () => {
    const content = makeContent({
      sourceInfo: { ...makeContent().sourceInfo, referenceText: 'REF-99' },
    });
    const result = buildOverviewContent(content, new Map(), t);
    const infoStack = result[1] as { stack: { text: string }[] };
    expect(infoStack.stack.find((s) => s.text.includes('REF-99'))).toBeDefined();
  });
});

describe('buildOverviewContent — column layout', () => {
  it('budget-overview header is exactly [vendor, invoiceNumber, date, status, invoiceAmount, allocatedAmount, usage], widths ["*","auto","auto","auto","auto","auto","*"]', () => {
    const content = makeContent({ isOverview: true });
    const result = buildOverviewContent(content, new Map(), t);
    const table = getTable(result);

    expect(table.widths).toEqual(['*', 'auto', 'auto', 'auto', 'auto', 'auto', '*']);
    expect(rowTexts(table.body[0])).toEqual([
      'sourceReports.table.vendor',
      'sourceReports.table.invoiceNumber',
      'sourceReports.table.date',
      'sourceReports.table.status',
      'sourceReports.table.invoiceAmount',
      'sourceReports.table.allocatedAmount',
      'sourceReports.table.usage',
    ]);
  });

  it('claim/proof-of-funds header has exactly 6 cells with no status column, widths ["*","auto","auto","auto","auto","*"]', () => {
    const content = makeContent({ isOverview: false });
    const result = buildOverviewContent(content, new Map(), t);
    const table = getTable(result);

    expect(table.widths).toEqual(['*', 'auto', 'auto', 'auto', 'auto', '*']);
    expect(rowTexts(table.body[0])).toEqual([
      'sourceReports.table.vendor',
      'sourceReports.table.invoiceNumber',
      'sourceReports.table.date',
      'sourceReports.table.invoiceAmount',
      'sourceReports.table.allocatedAmount',
      'sourceReports.table.usage',
    ]);
  });

  it('never renders an Appendix column (the appendix concept no longer exists in this signature)', () => {
    const content = makeContent({ isOverview: false, rows: [makeRow()] });
    const result = buildOverviewContent(content, new Map(), t);
    const table = getTable(result);
    expect(rowTexts(table.body[0])).not.toContain('sourceReports.table.appendix');
    expect((table.body[1] as unknown[]).length).toBe(6);
  });
});

describe('buildOverviewContent — row rendering (consumes already-derived ReportContent.rows)', () => {
  it('renders vendor/invoiceNumber/date/status/invoiceAmount straight from the row fields', () => {
    const row = makeRow({
      vendor: 'Included Vendor',
      invoiceNumber: 'X-1',
      dateText: 'date(2026-02-01)',
      statusText: 'sources.lines.invoiceStatus.pending',
    });
    const content = makeContent({ isOverview: true, rows: [row] });
    const result = buildOverviewContent(content, new Map(), t);
    const table = getTable(result);
    expect(rowTexts(table.body[1])).toEqual([
      'Included Vendor',
      'X-1',
      'date(2026-02-01)',
      'sources.lines.invoiceStatus.pending',
      '€1000.00',
      '€1000.00',
      '—',
    ]);
  });

  it('omits the status cell when isOverview is false, even if statusText happens to be set', () => {
    const row = makeRow({ statusText: 'sources.lines.invoiceStatus.pending' });
    const content = makeContent({ isOverview: false, rows: [row] });
    const result = buildOverviewContent(content, new Map(), t);
    const table = getTable(result);
    expect(rowTexts(table.body[1])).not.toContain('sources.lines.invoiceStatus.pending');
  });

  it('renders every row in reportContent.rows, in order, with no independent filtering', () => {
    const rows = [
      makeRow({ invoiceId: 'inv-1', vendor: 'First' }),
      makeRow({ invoiceId: 'inv-2', vendor: 'Second' }),
    ];
    const content = makeContent({ rows });
    const result = buildOverviewContent(content, new Map(), t);
    const table = getTable(result);
    expect(rowTexts(table.body[1])[0]).toBe('First');
    expect(rowTexts(table.body[2])[0]).toBe('Second');
  });

  describe('refund-adjustment rows: color and no sign negation', () => {
    it('renders the invoice amount with the refund text color', () => {
      const row = makeRow({ isRefund: true, invoiceAmountText: '€200.00' });
      const content = makeContent({ rows: [row] });
      const result = buildOverviewContent(content, new Map(), t);
      const table = getTable(result);
      const rawRow = table.body[1] as { color?: string }[];
      expect(rawRow[3]!.color).toBe('#991b1b');
      expect(rowTexts(table.body[1])[3]).toBe('€200.00');
    });

    it('appends the refund note to the allocated cell and colors it, only when isRefund', () => {
      const row = makeRow({
        isRefund: true,
        allocatedAmountValueText: '€-200.00',
        refundNoteText: '(refund)',
      });
      const content = makeContent({ rows: [row] });
      const result = buildOverviewContent(content, new Map(), t);
      const table = getTable(result);
      expect(rowTexts(table.body[1])[4]).toBe('€-200.00 (refund)');
      const rawRow = table.body[1] as { color?: string }[];
      expect(rawRow[4]!.color).toBe('#991b1b');
    });

    it('does not apply the refund color or note for a non-refund row', () => {
      const row = makeRow({ isRefund: false, allocatedAmountValueText: '€500.00' });
      const content = makeContent({ rows: [row] });
      const result = buildOverviewContent(content, new Map(), t);
      const table = getTable(result);
      expect(rowTexts(table.body[1])[4]).toBe('€500.00');
      const rawRow = table.body[1] as { color?: string }[];
      expect(rawRow[4]!.color).toBeUndefined();
    });
  });

  describe('Usage cell: plain text vs stack with attachment note', () => {
    it('renders a plain { text } cell (not a stack) when attachmentsNote is null', () => {
      const row = makeRow({ usageText: 'Kitchen work', attachmentsNote: null });
      const content = makeContent({ rows: [row] });
      const result = buildOverviewContent(content, new Map(), t);
      const table = getTable(result);
      const cell = (table.body[1] as unknown[])[5] as { text?: string; stack?: unknown };
      expect(cell.stack).toBeUndefined();
      expect(cell.text).toBe('Kitchen work');
    });

    it('renders a stack of [usageText, attachmentsNote] when attachmentsNote is present', () => {
      const row = makeRow({ usageText: 'Kitchen work', attachmentsNote: '1 attachment: Invoice' });
      const content = makeContent({ rows: [row] });
      const result = buildOverviewContent(content, new Map(), t);
      const table = getTable(result);
      const cell = (table.body[1] as unknown[])[5] as { stack: { text: string }[] };
      expect(cell.stack[0]!.text).toBe('Kitchen work');
      expect(cell.stack[1]!.text).toBe('1 attachment: Invoice');
    });
  });

  describe('allocated cell composition (skip markers + allocatedMarkers + refund note)', () => {
    it('renders allocatedAmountValueText plain when there are no markers and not a refund', () => {
      const row = makeRow({ allocatedAmountValueText: '€400.00', allocatedMarkers: '' });
      const content = makeContent({ rows: [row] });
      const result = buildOverviewContent(content, new Map(), t);
      const table = getTable(result);
      expect(rowTexts(table.body[1])[4]).toBe('€400.00');
    });

    it('appends the pre-computed split/deposit markers verbatim (already formatted by buildReportContent)', () => {
      const row = makeRow({ allocatedAmountValueText: '€400.00', allocatedMarkers: '†1‡1' });
      const content = makeContent({ rows: [row] });
      const result = buildOverviewContent(content, new Map(), t);
      const table = getTable(result);
      expect(rowTexts(table.body[1])[4]).toBe('€400.00†1‡1');
    });

    it('prepends skip-footnote markers (*N) BEFORE the allocatedMarkers, numbered from skippedDocuments', () => {
      const row = makeRow({
        invoiceId: 'inv-1',
        allocatedAmountValueText: '€400.00',
        allocatedMarkers: '†1',
      });
      const content = makeContent({ rows: [row] });
      const skipped = new Map<string, string[]>([['inv-1', ['footnoteFetchFailed']]]);
      const result = buildOverviewContent(content, skipped, t);
      const table = getTable(result);
      expect(rowTexts(table.body[1])[4]).toBe('€400.00*1†1');
    });

    it('numbers multiple skip reasons on the same invoice sequentially', () => {
      const row = makeRow({ invoiceId: 'inv-1', allocatedAmountValueText: '€400.00' });
      const content = makeContent({ rows: [row] });
      const skipped = new Map<string, string[]>([
        ['inv-1', ['footnoteFetchFailed', 'footnoteInvalidPdf']],
      ]);
      const result = buildOverviewContent(content, skipped, t);
      const table = getTable(result);
      expect(rowTexts(table.body[1])[4]).toBe('€400.00*1*2');
    });
  });
});

describe('buildOverviewContent — footnotes (skip block first, then reportContent.footnotes verbatim)', () => {
  it('renders numbered skipped-document footnotes attributing each to its row vendor/invoice number', () => {
    const rows = [
      makeRow({ invoiceId: 'inv-1', vendor: 'ACME', invoiceNumber: 'A-1' }),
      makeRow({ invoiceId: 'inv-2', vendor: 'Beta', invoiceNumber: 'B-2' }),
    ];
    const content = makeContent({ rows });
    const skipped = new Map<string, string[]>([
      ['inv-1', ['footnoteFetchFailed']],
      ['inv-2', ['footnoteInvalidPdf', 'footnoteFetchFailed']],
    ]);
    const result = buildOverviewContent(content, skipped, t);
    const notesStack = result[result.length - 1] as { stack: { text: string }[] };
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

  it('falls back to em-dashes when the skipped invoiceId is not found in reportContent.rows', () => {
    const content = makeContent({ rows: [] });
    const skipped = new Map<string, string[]>([['unknown-inv', ['footnoteFetchFailed']]]);
    const result = buildOverviewContent(content, skipped, t);
    const notesStack = result[result.length - 1] as { stack: { text: string }[] };
    expect(notesStack.stack[0]!.text).toBe('*1: — (—) — sourceReports.table.footnoteFetchFailed');
  });

  it('appends reportContent.footnotes verbatim after the skip block, without re-deriving text', () => {
    const content = makeContent({
      footnotes: [
        {
          id: 'split-1',
          marker: '†1',
          text: 'Gamma Corp (G-9) — sourceReports.table.splitFootnote',
        },
      ],
    });
    const skipped = new Map<string, string[]>([['inv-skip', ['footnoteFetchFailed']]]);
    const contentWithSkipRow = makeContent({
      rows: [makeRow({ invoiceId: 'inv-skip', vendor: 'Skip Co', invoiceNumber: 'K-1' })],
      footnotes: content.footnotes,
    });
    const result = buildOverviewContent(contentWithSkipRow, skipped, t);
    const notesStack = result[result.length - 1] as { stack: { text: string }[] };
    expect(notesStack.stack).toHaveLength(2);
    expect(notesStack.stack[0]!.text).toBe(
      '*1: Skip Co (K-1) — sourceReports.table.footnoteFetchFailed',
    );
    expect(notesStack.stack[1]!.text).toBe(
      '†1: Gamma Corp (G-9) — sourceReports.table.splitFootnote',
    );
  });

  it('the first footnote entry carries margin [0,4,0,0]; skip entries never do', () => {
    const content = makeContent({
      footnotes: [{ id: 'split-1', marker: '†1', text: 'first footnote' }],
    });
    const skipped = new Map<string, string[]>([['inv-skip', ['footnoteFetchFailed']]]);
    const result = buildOverviewContent(content, skipped, t);
    const notesStack = result[result.length - 1] as {
      stack: (Record<string, unknown> & { text: string })[];
    };
    const skipEntry = notesStack.stack.find((n) => n.text.startsWith('*1'))!;
    expect(skipEntry.margin).toBeUndefined();
    const splitEntry = notesStack.stack.find((n) => n.text.startsWith('†1'))!;
    expect(splitEntry.margin).toEqual([0, 4, 0, 0]);
  });

  it('a non-first entry in reportContent.footnotes carries no special margin', () => {
    const content = makeContent({
      footnotes: [
        { id: 'split-1', marker: '†1', text: 'first' },
        { id: 'split-2', marker: '†2', text: 'second' },
      ],
    });
    const result = buildOverviewContent(content, new Map(), t);
    const notesStack = result[result.length - 1] as {
      stack: (Record<string, unknown> & { text: string })[];
    };
    expect(notesStack.stack[0]!.margin).toEqual([0, 4, 0, 0]);
    expect(notesStack.stack[1]!.margin).toBeUndefined();
  });

  it('renders no footnotes block when skippedDocuments is empty and reportContent.footnotes is empty', () => {
    const content = makeContent({ footnotes: [] });
    const result = buildOverviewContent(content, new Map(), t);
    const lastItem = result[result.length - 1];
    expect(lastItem).toEqual(expect.objectContaining({ table: expect.anything() }));
  });
});

describe('buildOverviewContent — summary rows (consumes reportContent.summaryRows verbatim)', () => {
  it('budget-overview: label lands at leadingCount-1=3, amount at index 5, trailing usage cell empty', () => {
    const content = makeContent({
      isOverview: true,
      summaryRows: [{ key: 'total', label: 'sourceReports.table.total', amountText: '€500.00' }],
    });
    const result = buildOverviewContent(content, new Map(), t);
    const table = getTable(result);
    const totalRow = table.body[table.body.length - 1] as Record<string, unknown>[];
    expect(totalRow).toEqual([
      { text: '', style: 'tableCell' },
      { text: '', style: 'tableCell' },
      { text: '', style: 'tableCell' },
      { text: 'sourceReports.table.total', style: 'tableCell', bold: true },
      { text: '', style: 'tableCell' },
      { text: '€500.00', style: 'tableCell', alignment: 'right', bold: true },
      { text: '', style: 'tableCell' },
    ]);
  });

  it('claim/proof-of-funds: label lands at leadingCount-1=2, amount at index 4', () => {
    const content = makeContent({
      isOverview: false,
      summaryRows: [{ key: 'total', label: 'sourceReports.table.total', amountText: '€500.00' }],
    });
    const result = buildOverviewContent(content, new Map(), t);
    const table = getTable(result);
    const totalRow = table.body[table.body.length - 1] as Record<string, unknown>[];
    expect(totalRow).toEqual([
      { text: '', style: 'tableCell' },
      { text: '', style: 'tableCell' },
      { text: 'sourceReports.table.total', style: 'tableCell', bold: true },
      { text: '', style: 'tableCell' },
      { text: '€500.00', style: 'tableCell', alignment: 'right', bold: true },
      { text: '', style: 'tableCell' },
    ]);
  });

  it('renders one summary row per reportContent.summaryRows entry, in order', () => {
    const content = makeContent({
      summaryRows: [
        { key: 'subtotal-pending', label: 'Pending Subtotal', amountText: '€100.00' },
        { key: 'subtotal-paid', label: 'Paid Subtotal', amountText: '€200.00' },
        { key: 'total', label: 'Total', amountText: '€300.00' },
      ],
    });
    const result = buildOverviewContent(content, new Map(), t);
    const table = getTable(result);
    // header (1) + 0 invoice rows + 3 summary rows = 4
    expect(table.body).toHaveLength(4);
    expect(rowTexts(table.body[1])[2]).toBe('Pending Subtotal');
    expect(rowTexts(table.body[2])[2]).toBe('Paid Subtotal');
    expect(rowTexts(table.body[3])[2]).toBe('Total');
  });
});

describe('buildOverviewContent — layout passthrough', () => {
  it('passes the real TABLE_LAYOUT through to the pdfmake table content block', async () => {
    const { TABLE_LAYOUT } = await import('./shared.js');
    const content = makeContent();
    const result = buildOverviewContent(content, new Map(), t);
    const tableItem = result.find((c) => typeof c === 'object' && c !== null && 'table' in c) as {
      layout: unknown;
    };
    expect(tableItem.layout).toBe(TABLE_LAYOUT);
  });
});
