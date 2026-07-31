/**
 * Unit tests for client/src/lib/reportPdf/overviewPdf.ts
 *
 * Story #1898 rewrite. The table layout changed substantially from the prior implementation:
 *   - The Status column is now conditional on `useCase === 'budget-overview'` (previously
 *     unconditional — always rendered regardless of useCase). This shifts column indices for
 *     every non-overview ('claim' / 'proof-of-funds') fixture used below relative to the old
 *     test file.
 *   - The Appendix column is REMOVED entirely. `appendixByInvoiceId` is still accepted as a
 *     parameter (call-site/signature stability for merge.ts) but is never rendered — see the
 *     "Appendix never renders" scenario below.
 *   - A new trailing Usage column was added (last column in both layouts), which can render a
 *     plain text cell or a `stack` of [usage text, attachment note] when the invoice has linked
 *     documents.
 *   - The split marker (`†`) is no longer unconditional for every `isSplit: true` invoice. It now
 *     requires `isSplit && budgetLines.length > 0`. A new deposit marker (`‡`) was added,
 *     requiring `isSplit && deposits.length > 0`, with wording depending on whether any deposit is
 *     tagged to this source (`budgetSourceId === report.source.id`).
 *
 * Column layouts:
 *   - budget-overview (isOverview=true), 7 columns: vendor(0) invoiceNumber(1) date(2) status(3)
 *     invoiceAmount(4) allocatedAmount(5) usage(6).
 *   - claim / proof-of-funds (isOverview=false), 6 columns: vendor(0) invoiceNumber(1) date(2)
 *     invoiceAmount(3) allocatedAmount(4) usage(5).
 *
 * Summary-row (subtotal/total) leading-cell count is layout-aware: leadingCount = isOverview ? 4
 * : 3. The bold label lands at index `leadingCount - 1`; the bold right-aligned amount at index
 * `leadingCount + 1` (an empty invoiceAmount cell sits at `leadingCount`); the trailing usage cell
 * is always empty.
 *
 * Audit note (scenario 21): every `isSplit: true` fixture below carries EXPLICIT `budgetLines`
 * and/or `deposits` arrays — `makeInvoice()`'s defaults (`budgetLines: []`, `deposits: []`) would
 * otherwise silently produce a split invoice with NEITHER marker under the new classification
 * rules, which is almost never the scenario under test. No fixture relies on the empty defaults
 * while also setting `isSplit: true`, except the one dedicated "isSplit true but no lines/deposits
 * -> neither marker" case, where that's the explicit point being tested.
 */
import { describe, it, expect, jest } from '@jest/globals';
import type { TFunction } from 'i18next';
import type {
  SourceReportResponse,
  SourceReportInvoice,
  SourceReportBudgetLine,
  SourceReportDeposit,
  SourceReportDocument,
} from '@cornerstone/shared';
import type { Formatters } from '../formatters.js';
import { buildOverviewContent } from './overviewPdf.js';

const t = ((key: string) => key) as unknown as TFunction;

/** A `t` that records every call for assertions on interpolation options (raw-key-echo style — no
 * real interpolation happens; realRender.test.ts covers actual plural/interpolation output via a
 * real i18next instance). */
function makeTrackedT(): { t: TFunction; calls: () => unknown[][] } {
  const fn = jest.fn((key: string) => key);
  return { t: fn as unknown as TFunction, calls: () => fn.mock.calls as unknown[][] };
}

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
    budgetLines: [],
    deposits: [],
    ...overrides,
  };
}

function makeBudgetLine(overrides: Partial<SourceReportBudgetLine> = {}): SourceReportBudgetLine {
  return {
    id: 'bl-1',
    description: null,
    allocatedPortion: 100,
    linkedItem: null,
    ...overrides,
  };
}

function makeDeposit(overrides: Partial<SourceReportDeposit> = {}): SourceReportDeposit {
  return {
    id: 'dep-1',
    amount: 100,
    status: 'paid',
    entryType: 'deposit',
    dueDate: '2026-01-01',
    paidDate: null,
    claimedDate: null,
    budgetSourceId: null,
    ...overrides,
  };
}

function makeDocument(overrides: Partial<SourceReportDocument> = {}): SourceReportDocument {
  return {
    documentId: 1,
    archiveSerialNumber: null,
    title: null,
    attachmentType: null,
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

  // ─── Scenario 1 & 2: header columns per layout ─────────────────────────────

  it('[Scenario 1] budget-overview header is exactly [vendor, invoiceNumber, date, status, invoiceAmount, allocatedAmount, usage], widths ["*","auto","auto","auto","auto","auto","*"]', () => {
    const report = makeReport([]);
    const content = buildOverviewContent(
      report,
      new Set(),
      new Map(),
      new Map(),
      'budget-overview',
      t,
      formatters,
      0,
    );
    const table = getTable(content);

    expect(table.widths).toEqual(['*', 'auto', 'auto', 'auto', 'auto', 'auto', '*']);
    const headerRow = rowTexts(table.body[0]);
    expect(headerRow).toEqual([
      'sourceReports.table.vendor',
      'sourceReports.table.invoiceNumber',
      'sourceReports.table.date',
      'sourceReports.table.status',
      'sourceReports.table.invoiceAmount',
      'sourceReports.table.allocatedAmount',
      'sourceReports.table.usage',
    ]);
  });

  it('[Scenario 2] claim/proof-of-funds header has exactly 6 cells with no status column, widths ["*","auto","auto","auto","auto","*"]', () => {
    const report = makeReport([]);
    for (const useCase of ['claim', 'proof-of-funds'] as const) {
      const content = buildOverviewContent(
        report,
        new Set(),
        new Map(),
        new Map(),
        useCase,
        t,
        formatters,
        0,
      );
      const table = getTable(content);

      expect(table.widths).toEqual(['*', 'auto', 'auto', 'auto', 'auto', '*']);
      const headerRow = rowTexts(table.body[0]);
      expect(headerRow).toEqual([
        'sourceReports.table.vendor',
        'sourceReports.table.invoiceNumber',
        'sourceReports.table.date',
        'sourceReports.table.invoiceAmount',
        'sourceReports.table.allocatedAmount',
        'sourceReports.table.usage',
      ]);
    }
  });

  // ─── Scenario 3: appendix never renders ────────────────────────────────────

  it('[Scenario 3] never renders an Appendix column, even with a non-empty appendixByInvoiceId, in either useCase', () => {
    const invoice = makeInvoice();
    const report = makeReport([invoice]);
    const nonEmptyAppendixMap = new Map([['inv-1', 1]]);

    for (const useCase of ['budget-overview', 'claim'] as const) {
      const content = buildOverviewContent(
        report,
        new Set(['inv-1']),
        nonEmptyAppendixMap,
        new Map(),
        useCase,
        t,
        formatters,
        1000,
      );
      const table = getTable(content);
      const expectedCols = useCase === 'budget-overview' ? 7 : 6;
      expect(table.widths).toHaveLength(expectedCols);
      const headerRow = rowTexts(table.body[0]);
      expect(headerRow).not.toContain('sourceReports.table.appendix');
      // The row must not gain an extra trailing appendix cell beyond the usage cell.
      expect((table.body[1] as unknown[]).length).toBe(expectedCols);
    }
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
    // claim layout: vendor(0) invoiceNumber(1) date(2) invoiceAmount(3) allocatedAmount(4) usage(5)
    expect(row[1]).toBe('—'); // invoiceNumber ?? '—'
    expect(row[2]).toBe('2026-02-01'); // raw date, no formatters
    expect(row[3]).toBe('—'); // invoiceAmountText fallback
    expect(row[4]).toBe('—'); // allocatedText fallback
    expect(row[5]).toBe('—'); // usage placeholder ('—' — empty budgetLines default)

    const subtotalRow = rowTexts(table.body[2]);
    expect(subtotalRow[4]).toBe('—'); // subtotalText fallback

    const totalRow = rowTexts(table.body[table.body.length - 1]);
    expect(totalRow[4]).toBe('—'); // totalText fallback (includedTotal ?? 0, still no formatters)
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

      expect(row[3]).toBe('€200.00');
      const rawRow = table.body[1] as { color?: string }[];
      expect(rawRow[3]!.color).toBe('#991b1b');
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

      expect(row[4]).toContain('€-200.00');
      expect(row[4]).toContain('sourceReports.table.refundNote');
      const rawRow = table.body[1] as { color?: string }[];
      expect(rawRow[4]!.color).toBe('#991b1b');
    });
  });

  // ─── Scenarios 4-13: Usage column ──────────────────────────────────────────

  describe('Usage column', () => {
    it('[Scenario 4] dedupes a repeated linked-item name and comma-joins distinct names in first-occurrence order', () => {
      const invoice = makeInvoice({
        invoiceId: 'inv-1',
        budgetLines: [
          makeBudgetLine({ linkedItem: { type: 'work_item', id: 'wi-1', name: 'Kitchen' } }),
          makeBudgetLine({ linkedItem: { type: 'work_item', id: 'wi-2', name: 'Bathroom' } }),
          makeBudgetLine({ linkedItem: { type: 'work_item', id: 'wi-1', name: 'Kitchen' } }),
        ],
      });
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
      expect(rowTexts(table.body[1])[5]).toBe('Kitchen, Bathroom');
    });

    it('[Scenario 5] falls back to distinct budget-line descriptions when no line has a linkedItem', () => {
      const invoice = makeInvoice({
        invoiceId: 'inv-1',
        budgetLines: [
          makeBudgetLine({ linkedItem: null, description: 'Materials' }),
          makeBudgetLine({ linkedItem: null, description: 'Labor' }),
          makeBudgetLine({ linkedItem: null, description: 'Materials' }),
        ],
      });
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
      expect(rowTexts(table.body[1])[5]).toBe('Materials, Labor');
    });

    it('[Scenario 6] shows only the linked item name(s) when linked and unlinked-with-description lines are mixed (binary discriminator)', () => {
      const invoice = makeInvoice({
        invoiceId: 'inv-1',
        budgetLines: [
          makeBudgetLine({
            linkedItem: { type: 'household_item', id: 'hi-1', name: 'Kitchen' },
            description: null,
          }),
          makeBudgetLine({ linkedItem: null, description: 'Misc costs' }),
        ],
      });
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
      expect(rowTexts(table.body[1])[5]).toBe('Kitchen');
    });

    it('[Scenario 7] renders "—" when budgetLines is empty', () => {
      const invoice = makeInvoice({ invoiceId: 'inv-1', budgetLines: [] });
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
      expect(rowTexts(table.body[1])[5]).toBe('—');
    });

    it('[Scenario 8] renders a plain { text } cell (not a stack) when the invoice has no documents', () => {
      const invoice = makeInvoice({ invoiceId: 'inv-1', documents: [] });
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
      const cell = (table.body[1] as unknown[])[5] as { text?: string; stack?: unknown };
      expect(cell.stack).toBeUndefined();
      expect(cell.text).toBe('—');
    });

    it('[Scenario 9] singular typed attachment note: attachmentsNote_one with {count, types} interpolation options (raw-key-echo)', () => {
      const { t: trackedT, calls } = makeTrackedT();
      const invoice = makeInvoice({
        invoiceId: 'inv-1',
        documents: [makeDocument({ attachmentType: 'invoice' })],
      });
      const report = makeReport([invoice]);
      const content = buildOverviewContent(
        report,
        new Set(['inv-1']),
        new Map(),
        new Map(),
        'claim',
        trackedT,
        formatters,
        1000,
      );
      const table = getTable(content);
      const cell = (table.body[1] as unknown[])[5] as { stack: { text: string }[] };
      expect(cell.stack).toBeDefined();
      // Note text is the raw echoed key (unit-level t has no real interpolation).
      expect(cell.stack[1]!.text).toBe('sourceReports.table.attachmentsNote_one');

      expect(calls()).toContainEqual([
        'sourceReports.table.attachmentsNote_one',
        { count: 1, types: 'sourceReports.table.attachmentType.invoice' },
      ]);
    });

    it('[Scenario 10] plural, multiple distinct types deduped: attachmentsNote_other with all distinct type labels joined', () => {
      const { t: trackedT, calls } = makeTrackedT();
      const invoice = makeInvoice({
        invoiceId: 'inv-1',
        documents: [
          makeDocument({ documentId: 1, attachmentType: 'invoice' }),
          makeDocument({ documentId: 2, attachmentType: 'quotation' }),
          makeDocument({ documentId: 3, attachmentType: 'invoice' }),
        ],
      });
      const report = makeReport([invoice]);
      buildOverviewContent(
        report,
        new Set(['inv-1']),
        new Map(),
        new Map(),
        'claim',
        trackedT,
        formatters,
        1000,
      );
      expect(calls()).toContainEqual([
        'sourceReports.table.attachmentsNote_other',
        {
          count: 3,
          types:
            'sourceReports.table.attachmentType.invoice, sourceReports.table.attachmentType.quotation',
        },
      ]);
    });

    it('[Scenario 11] a type repeated across multiple documents is listed only once', () => {
      const { t: trackedT, calls } = makeTrackedT();
      const invoice = makeInvoice({
        invoiceId: 'inv-1',
        documents: [
          makeDocument({ documentId: 1, attachmentType: 'quotation' }),
          makeDocument({ documentId: 2, attachmentType: 'quotation' }),
        ],
      });
      const report = makeReport([invoice]);
      buildOverviewContent(
        report,
        new Set(['inv-1']),
        new Map(),
        new Map(),
        'claim',
        trackedT,
        formatters,
        1000,
      );
      expect(calls()).toContainEqual([
        'sourceReports.table.attachmentsNote_other',
        { count: 2, types: 'sourceReports.table.attachmentType.quotation' },
      ]);
    });

    it('[Scenario 12] all-null-type documents render attachmentsNoteNoType_one / _other (count only, no types option)', () => {
      const { t: trackedT, calls } = makeTrackedT();
      const singleDocInvoice = makeInvoice({
        invoiceId: 'inv-1',
        documents: [makeDocument({ documentId: 1, attachmentType: null })],
      });
      const multiDocInvoice = makeInvoice({
        invoiceId: 'inv-2',
        documents: [
          makeDocument({ documentId: 2, attachmentType: null }),
          makeDocument({ documentId: 3, attachmentType: null }),
        ],
      });
      const report = makeReport([singleDocInvoice, multiDocInvoice]);
      buildOverviewContent(
        report,
        new Set(['inv-1', 'inv-2']),
        new Map(),
        new Map(),
        'claim',
        trackedT,
        formatters,
        1000,
      );
      expect(calls()).toContainEqual([
        'sourceReports.table.attachmentsNoteNoType_one',
        { count: 1 },
      ]);
      expect(calls()).toContainEqual([
        'sourceReports.table.attachmentsNoteNoType_other',
        { count: 2 },
      ]);
    });

    it('[Scenario 13] mixed typed+null documents: count includes all documents, types option lists only the typed label', () => {
      const { t: trackedT, calls } = makeTrackedT();
      const invoice = makeInvoice({
        invoiceId: 'inv-1',
        documents: [
          makeDocument({ documentId: 1, attachmentType: 'deposit' }),
          makeDocument({ documentId: 2, attachmentType: null }),
        ],
      });
      const report = makeReport([invoice]);
      buildOverviewContent(
        report,
        new Set(['inv-1']),
        new Map(),
        new Map(),
        'claim',
        trackedT,
        formatters,
        1000,
      );
      expect(calls()).toContainEqual([
        'sourceReports.table.attachmentsNote_other',
        { count: 2, types: 'sourceReports.table.attachmentType.deposit' },
      ]);
    });
  });

  // ─── Scenarios 14-19: split/deposit footnote markers ───────────────────────

  describe('split (†) and deposit (‡) footnote markers', () => {
    it('[Scenario 14 / AC1] deposit-only, cross-source: isSplit true, no budget lines, a tagged deposit -> ‡1 "constituted", no †', () => {
      const invoice = makeInvoice({
        invoiceId: 'inv-1',
        isSplit: true,
        allocatedAmount: 400,
        budgetLines: [],
        deposits: [makeDeposit({ budgetSourceId: 'src-1' })], // tagged to report.source.id
      });
      const report = makeReport([invoice]);
      const content = buildOverviewContent(
        report,
        new Set(['inv-1']),
        new Map(),
        new Map(),
        'claim',
        t,
        formatters,
        400,
      );
      const table = getTable(content);
      expect(rowTexts(table.body[1])[4]).toBe('€400.00‡1');
    });

    it('[Scenario 15 / AC2] pure line-split: isSplit true, budget lines, no deposits -> †1, no ‡', () => {
      const invoice = makeInvoice({
        invoiceId: 'inv-1',
        isSplit: true,
        allocatedAmount: 400,
        budgetLines: [makeBudgetLine()],
        deposits: [],
      });
      const report = makeReport([invoice]);
      const content = buildOverviewContent(
        report,
        new Set(['inv-1']),
        new Map(),
        new Map(),
        'claim',
        t,
        formatters,
        400,
      );
      const table = getTable(content);
      expect(rowTexts(table.body[1])[4]).toBe('€400.00†1');
    });

    it('[Scenario 16 / AC3] both budget lines and a tagged deposit -> †1 AND ‡1 "constituted", neither suppressed', () => {
      const invoice = makeInvoice({
        invoiceId: 'inv-1',
        isSplit: true,
        allocatedAmount: 400,
        budgetLines: [makeBudgetLine()],
        deposits: [makeDeposit({ budgetSourceId: 'src-1' })],
      });
      const report = makeReport([invoice]);
      const content = buildOverviewContent(
        report,
        new Set(['inv-1']),
        new Map(),
        new Map(),
        'claim',
        t,
        formatters,
        400,
      );
      const table = getTable(content);
      expect(rowTexts(table.body[1])[4]).toBe('€400.00†1‡1');

      const notesStack = content[content.length - 1] as { stack: { text: string }[] };
      const depositNote = notesStack.stack.find((s) => s.text.startsWith('‡1'));
      expect(depositNote?.text).toBe(
        '‡1: ACME Builders (INV-001) — sourceReports.table.depositConstitutedFootnote',
      );
    });

    it('[Scenario 17] reduced wording boundary: budget lines + an untagged-only deposit -> †1 + ‡1 "reduced"', () => {
      const invoice = makeInvoice({
        invoiceId: 'inv-1',
        isSplit: true,
        allocatedAmount: 400,
        budgetLines: [makeBudgetLine()],
        deposits: [makeDeposit({ budgetSourceId: null })], // untagged
      });
      const report = makeReport([invoice]);
      const content = buildOverviewContent(
        report,
        new Set(['inv-1']),
        new Map(),
        new Map(),
        'claim',
        t,
        formatters,
        400,
      );
      const table = getTable(content);
      expect(rowTexts(table.body[1])[4]).toBe('€400.00†1‡1');

      const notesStack = content[content.length - 1] as { stack: { text: string }[] };
      const depositNote = notesStack.stack.find((s) => s.text.startsWith('‡1'));
      expect(depositNote?.text).toBe(
        '‡1: ACME Builders (INV-001) — sourceReports.table.depositReducedFootnote',
      );
    });

    it('[Scenario 18 / AC4] isSplit false suppresses both markers regardless of budgetLines/deposits content', () => {
      const invoice = makeInvoice({
        invoiceId: 'inv-1',
        isSplit: false,
        allocatedAmount: 400,
        budgetLines: [makeBudgetLine()],
        deposits: [makeDeposit({ budgetSourceId: 'src-1' })],
      });
      const report = makeReport([invoice]);
      const content = buildOverviewContent(
        report,
        new Set(['inv-1']),
        new Map(),
        new Map(),
        'claim',
        t,
        formatters,
        400,
      );
      const table = getTable(content);
      expect(rowTexts(table.body[1])[4]).toBe('€400.00');
    });

    it('isSplit true with neither budget lines nor deposits produces neither marker', () => {
      const invoice = makeInvoice({
        invoiceId: 'inv-1',
        isSplit: true,
        allocatedAmount: 400,
        budgetLines: [],
        deposits: [],
      });
      const report = makeReport([invoice]);
      const content = buildOverviewContent(
        report,
        new Set(['inv-1']),
        new Map(),
        new Map(),
        'claim',
        t,
        formatters,
        400,
      );
      const table = getTable(content);
      expect(rowTexts(table.body[1])[4]).toBe('€400.00');
    });

    it('[Scenario 19] marker concatenation order is *N -> †N -> ‡N on the same cell', () => {
      const invoice = makeInvoice({
        invoiceId: 'inv-1',
        isSplit: true,
        allocatedAmount: 400,
        budgetLines: [makeBudgetLine()],
        deposits: [makeDeposit({ budgetSourceId: 'src-1' })],
      });
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
        400,
      );
      const table = getTable(content);
      expect(rowTexts(table.body[1])[4]).toBe('€400.00*1†1‡1');
    });

    it('[Scenario 20] footnote block margins: split-first and deposit-first entries carry margin [0,4,0,0]; skip entries and non-first split/deposit entries do not', () => {
      const skippedInvoice = makeInvoice({
        invoiceId: 'inv-skip',
        vendorName: 'Skip Vendor',
        invoiceNumber: 'K-1',
        isSplit: false,
      });
      const splitOnly = makeInvoice({
        invoiceId: 'inv-split-only',
        vendorName: 'Split Only',
        invoiceNumber: 'S-1',
        isSplit: true,
        allocatedAmount: 100,
        budgetLines: [makeBudgetLine()],
        deposits: [],
      });
      const splitAndTaggedDeposit = makeInvoice({
        invoiceId: 'inv-split-deposit-1',
        vendorName: 'Split Deposit One',
        invoiceNumber: 'SD-1',
        isSplit: true,
        allocatedAmount: 200,
        budgetLines: [makeBudgetLine()],
        deposits: [makeDeposit({ budgetSourceId: 'src-1' })],
      });
      const splitAndUntaggedDeposit = makeInvoice({
        invoiceId: 'inv-split-deposit-2',
        vendorName: 'Split Deposit Two',
        invoiceNumber: 'SD-2',
        isSplit: true,
        allocatedAmount: 300,
        budgetLines: [makeBudgetLine()],
        deposits: [makeDeposit({ budgetSourceId: null })],
      });
      const report = makeReport([
        skippedInvoice,
        splitOnly,
        splitAndTaggedDeposit,
        splitAndUntaggedDeposit,
      ]);
      const skipped = new Map<string, string[]>([['inv-skip', ['footnoteFetchFailed']]]);
      const content = buildOverviewContent(
        report,
        new Set(['inv-skip', 'inv-split-only', 'inv-split-deposit-1', 'inv-split-deposit-2']),
        new Map(),
        skipped,
        'claim',
        t,
        formatters,
        600,
      );
      const notesStack = content[content.length - 1] as {
        stack: (Record<string, unknown> & { text: string })[];
      };
      const notes = notesStack.stack;

      // Block order: skip, split, deposit.
      expect(notes).toHaveLength(1 + 3 + 2);

      const skipEntry = notes.find((n) => n.text.startsWith('*1'))!;
      expect(skipEntry.margin).toBeUndefined();

      const splitEntries = notes.filter((n) => /^†\d/.test(n.text));
      expect(splitEntries).toHaveLength(3);
      expect(splitEntries[0]!.margin).toEqual([0, 4, 0, 0]); // †1 (splitOnly) — first of block
      expect(splitEntries[1]!.margin).toBeUndefined(); // †2 (splitAndTaggedDeposit)
      expect(splitEntries[2]!.margin).toBeUndefined(); // †3 (splitAndUntaggedDeposit)

      const depositEntries = notes.filter((n) => /^‡\d/.test(n.text));
      expect(depositEntries).toHaveLength(2);
      expect(depositEntries[0]!.margin).toEqual([0, 4, 0, 0]); // ‡1 — first of block
      expect(depositEntries[1]!.margin).toBeUndefined(); // ‡2
    });
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

  // ─── Scenario 22: summary-row (subtotal/total) cell shape per layout ──────

  describe('[Scenario 22] summary-row shape', () => {
    it('budget-overview (isOverview=true): label at index 3 (leadingCount-1=3), amount at index 5, all other cells empty text, trailing usage cell empty', () => {
      const invoice = makeInvoice({ invoiceId: 'inv-1', allocatedAmount: 500 });
      const report = makeReport([invoice]);
      const content = buildOverviewContent(
        report,
        new Set(['inv-1']),
        new Map(),
        new Map(),
        'budget-overview',
        t,
        formatters,
        500,
      );
      const table = getTable(content);
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

    it('claim (isOverview=false): label at index 2 (leadingCount-1=2), amount at index 4, all other cells empty text, trailing usage cell empty', () => {
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
        500,
      );
      const table = getTable(content);
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
      expect(totalRow[2]).toBe('sourceReports.table.total');
      expect(totalRow[4]).toBe('€999.00');
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
      expect(totalRow[4]).toBe('€0.00');
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
      expect(totalRow[4]).toBe('€-200.00');
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
        budgetLines: [makeBudgetLine()],
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
        budgetLines: [makeBudgetLine()],
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

    it('does not render a footnotes block when there are no skipped documents and no split/deposit-marked invoices', () => {
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
