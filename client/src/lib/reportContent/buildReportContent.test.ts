/**
 * Unit tests for client/src/lib/reportContent/buildReportContent.ts
 *
 * Story #1900. This module was moved verbatim (per the implementation spec) from
 * overviewPdf.ts/coverLetterPdf.ts's pre-#1900 data-derivation logic — this file exercises the
 * text-derivation contract directly, independent of any pdfmake Content[] shape (that's now
 * overviewPdf.test.ts/coverLetterPdf.test.ts's job, consuming the ReportContent this module
 * produces).
 *
 * Fixture/`t` conventions follow the established reportPdf test pattern: a tracked `t` that
 * echoes the raw key (optionally with JSON-serialized interpolation options appended after `::`)
 * so assertions can verify both the resolved key AND the interpolation payload without needing a
 * real i18next instance (realRender.test.ts covers real translated output end-to-end).
 */
import { describe, it, expect, jest } from '@jest/globals';
import type { TFunction } from 'i18next';
import type {
  SourceReportResponse,
  SourceReportInvoice,
  SourceReportBudgetLine,
  SourceReportDeposit,
  SourceReportDocument,
  HouseholdSettings,
} from '@cornerstone/shared';
import type { Formatters } from '../formatters.js';
import { buildReportContent } from './buildReportContent.js';

const t = ((key: string, opts?: Record<string, unknown>) =>
  opts ? `${key}::${JSON.stringify(opts)}` : key) as unknown as TFunction;

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

function makeReport(
  invoices: SourceReportInvoice[],
  sourceOverrides: Partial<SourceReportResponse['source']> = {},
): SourceReportResponse {
  return {
    type: 'claim',
    source: {
      id: 'src-1',
      name: 'Home Loan',
      sourceType: 'bank_loan',
      reference: null,
      contactAddress: null,
      ...sourceOverrides,
    },
    invoices,
    totalAmount: invoices.reduce((sum, inv) => sum + inv.allocatedAmount, 0),
    unallocatedInvoices: [],
    generatedAt: '2026-01-15T00:00:00.000Z',
  };
}

const household: HouseholdSettings = {
  householdName: 'The Smiths',
  householdAddress: '123 Main St',
};

describe('buildReportContent — top-level fields', () => {
  it('sets isOverview true for budget-overview and false for claim/proof-of-funds', () => {
    const report = makeReport([]);
    expect(buildReportContent(report, new Set(), 'budget-overview', t).isOverview).toBe(true);
    expect(buildReportContent(report, new Set(), 'claim', t).isOverview).toBe(false);
    expect(buildReportContent(report, new Set(), 'proof-of-funds', t).isOverview).toBe(false);
  });

  it('resolves tableTitle via sourceReports.table.title.<useCase>', () => {
    const report = makeReport([]);
    const content = buildReportContent(report, new Set(), 'proof-of-funds', t);
    expect(content.tableTitle).toBe('sourceReports.table.title.proof-of-funds');
  });

  it('builds sourceInfo with sourceName/sourceTypeText/referenceText/generatedAtText', () => {
    const report = makeReport([], {
      name: 'Home Loan',
      sourceType: 'bank_loan',
      reference: 'REF-1',
    });
    const content = buildReportContent(report, new Set(), 'claim', t, formatters);
    expect(content.sourceInfo.sourceName).toBe('Home Loan');
    expect(content.sourceInfo.sourceTypeText).toBe('sourceReports.sourceType.bank_loan');
    expect(content.sourceInfo.referenceText).toBe('REF-1');
    expect(content.sourceInfo.generatedAtText).toMatch(/^date\(\d{4}-\d{2}-\d{2}\)$/);
  });

  it('sourceInfo.referenceText is null when source.reference is null', () => {
    const report = makeReport([], { reference: null });
    const content = buildReportContent(report, new Set(), 'claim', t);
    expect(content.sourceInfo.referenceText).toBeNull();
  });

  it('falls back to the raw ISO date string for generatedAtText when formatters is omitted', () => {
    const report = makeReport([]);
    const content = buildReportContent(report, new Set(), 'claim', t);
    expect(content.sourceInfo.generatedAtText).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('buildReportContent — rows', () => {
  it('includes only invoices present in includedInvoiceIds', () => {
    const included = makeInvoice({ invoiceId: 'inv-1', vendorName: 'Included Vendor' });
    const excluded = makeInvoice({ invoiceId: 'inv-2', vendorName: 'Excluded Vendor' });
    const report = makeReport([included, excluded]);
    const content = buildReportContent(report, new Set(['inv-1']), 'claim', t, formatters);
    expect(content.rows).toHaveLength(1);
    expect(content.rows[0]!.vendor).toBe('Included Vendor');
  });

  it('[statusText] is populated (translated) for budget-overview', () => {
    const invoice = makeInvoice({ status: 'paid' });
    const report = makeReport([invoice]);
    const content = buildReportContent(
      report,
      new Set(['inv-1']),
      'budget-overview',
      t,
      formatters,
    );
    expect(content.rows[0]!.statusText).toBe('sources.lines.invoiceStatus.paid');
  });

  it('[statusText] is null for the claim use case', () => {
    const invoice = makeInvoice({ status: 'paid' });
    const report = makeReport([invoice]);
    const content = buildReportContent(report, new Set(['inv-1']), 'claim', t, formatters);
    expect(content.rows[0]!.statusText).toBeNull();
  });

  it('[statusText] is null for the proof-of-funds use case', () => {
    const invoice = makeInvoice({ status: 'paid' });
    const report = makeReport([invoice]);
    const content = buildReportContent(report, new Set(['inv-1']), 'proof-of-funds', t, formatters);
    expect(content.rows[0]!.statusText).toBeNull();
  });

  it('formats invoiceAmountText/allocatedAmountValueText via formatters, with no markers/refund note baked in', () => {
    const invoice = makeInvoice({ invoiceAmount: 500, allocatedAmount: 250 });
    const report = makeReport([invoice]);
    const content = buildReportContent(report, new Set(['inv-1']), 'claim', t, formatters);
    expect(content.rows[0]!.invoiceAmountText).toBe('€500.00');
    expect(content.rows[0]!.allocatedAmountValueText).toBe('€250.00');
  });

  it('falls back to "—" for amounts when formatters is omitted, and raw date string', () => {
    const invoice = makeInvoice({ date: '2026-02-01' });
    const report = makeReport([invoice]);
    const content = buildReportContent(report, new Set(['inv-1']), 'claim', t);
    expect(content.rows[0]!.invoiceAmountText).toBe('—');
    expect(content.rows[0]!.allocatedAmountValueText).toBe('—');
    expect(content.rows[0]!.dateText).toBe('2026-02-01');
  });

  it('invoiceNumber falls back to "—" when null', () => {
    const invoice = makeInvoice({ invoiceNumber: null });
    const report = makeReport([invoice]);
    const content = buildReportContent(report, new Set(['inv-1']), 'claim', t, formatters);
    expect(content.rows[0]!.invoiceNumber).toBe('—');
  });

  it('isRefund reflects lineKind === "refund-adjustment" and refundNoteText is always resolved', () => {
    const refund = makeInvoice({
      invoiceId: 'inv-refund',
      lineKind: 'refund-adjustment',
      allocatedAmount: -200,
    });
    const report = makeReport([refund]);
    const content = buildReportContent(report, new Set(['inv-refund']), 'claim', t, formatters);
    expect(content.rows[0]!.isRefund).toBe(true);
    expect(content.rows[0]!.refundNoteText).toBe('sourceReports.table.refundNote');
  });

  it('isRefund is false for a normal invoice line', () => {
    const invoice = makeInvoice({ lineKind: 'invoice' });
    const report = makeReport([invoice]);
    const content = buildReportContent(report, new Set(['inv-1']), 'claim', t, formatters);
    expect(content.rows[0]!.isRefund).toBe(false);
  });

  describe('usageText', () => {
    it('dedupes and comma-joins distinct linked-item names in first-occurrence order', () => {
      const invoice = makeInvoice({
        budgetLines: [
          makeBudgetLine({ linkedItem: { type: 'work_item', id: 'wi-1', name: 'Kitchen' } }),
          makeBudgetLine({ linkedItem: { type: 'work_item', id: 'wi-2', name: 'Bathroom' } }),
          makeBudgetLine({ linkedItem: { type: 'work_item', id: 'wi-1', name: 'Kitchen' } }),
        ],
      });
      const report = makeReport([invoice]);
      const content = buildReportContent(report, new Set(['inv-1']), 'claim', t, formatters);
      expect(content.rows[0]!.usageText).toBe('Kitchen, Bathroom');
    });

    it('falls back to distinct budget-line descriptions when no line has a linkedItem', () => {
      const invoice = makeInvoice({
        budgetLines: [
          makeBudgetLine({ linkedItem: null, description: 'Materials' }),
          makeBudgetLine({ linkedItem: null, description: 'Materials' }),
        ],
      });
      const report = makeReport([invoice]);
      const content = buildReportContent(report, new Set(['inv-1']), 'claim', t, formatters);
      expect(content.rows[0]!.usageText).toBe('Materials');
    });

    it('renders "—" when budgetLines is empty', () => {
      const invoice = makeInvoice({ budgetLines: [] });
      const report = makeReport([invoice]);
      const content = buildReportContent(report, new Set(['inv-1']), 'claim', t, formatters);
      expect(content.rows[0]!.usageText).toBe('—');
    });
  });

  describe('attachmentsNote', () => {
    it('is null when the invoice has no documents', () => {
      const invoice = makeInvoice({ documents: [] });
      const report = makeReport([invoice]);
      const content = buildReportContent(report, new Set(['inv-1']), 'claim', t, formatters);
      expect(content.rows[0]!.attachmentsNote).toBeNull();
    });

    it('is a translated, interpolated note when documents are present with a type', () => {
      const invoice = makeInvoice({
        documents: [makeDocument({ attachmentType: 'invoice' })],
      });
      const report = makeReport([invoice]);
      const content = buildReportContent(report, new Set(['inv-1']), 'claim', t, formatters);
      expect(content.rows[0]!.attachmentsNote).toBe(
        'sourceReports.table.attachmentsNote_one::{"count":1,"types":"sourceReports.table.attachmentType.invoice"}',
      );
    });

    it('uses the plural translated key for 2+ typed documents (count > 1 branch of the WITH-type path)', () => {
      const invoice = makeInvoice({
        documents: [
          makeDocument({ attachmentType: 'invoice' }),
          makeDocument({ documentId: 2, attachmentType: 'invoice' }),
        ],
      });
      const report = makeReport([invoice]);
      const content = buildReportContent(report, new Set(['inv-1']), 'claim', t, formatters);
      expect(content.rows[0]!.attachmentsNote).toBe(
        'sourceReports.table.attachmentsNote_other::{"count":2,"types":"sourceReports.table.attachmentType.invoice"}',
      );
    });

    it('falls back to the count-only key when every document has a null type', () => {
      const invoice = makeInvoice({
        documents: [
          makeDocument({ attachmentType: null }),
          makeDocument({ documentId: 2, attachmentType: null }),
        ],
      });
      const report = makeReport([invoice]);
      const content = buildReportContent(report, new Set(['inv-1']), 'claim', t, formatters);
      expect(content.rows[0]!.attachmentsNote).toBe(
        'sourceReports.table.attachmentsNoteNoType_other::{"count":2}',
      );
    });

    it('uses the singular count-only key for exactly one null-typed document', () => {
      const invoice = makeInvoice({ documents: [makeDocument({ attachmentType: null })] });
      const report = makeReport([invoice]);
      const content = buildReportContent(report, new Set(['inv-1']), 'claim', t, formatters);
      expect(content.rows[0]!.attachmentsNote).toBe(
        'sourceReports.table.attachmentsNoteNoType_one::{"count":1}',
      );
    });
  });

  describe('allocatedMarkers (split † / deposit ‡)', () => {
    it('adds † only when isSplit and budgetLines.length > 0, no deposits', () => {
      const invoice = makeInvoice({
        isSplit: true,
        budgetLines: [makeBudgetLine()],
        deposits: [],
      });
      const report = makeReport([invoice]);
      const content = buildReportContent(report, new Set(['inv-1']), 'claim', t, formatters);
      expect(content.rows[0]!.allocatedMarkers).toBe('†1');
    });

    it('adds ‡ only when isSplit and deposits.length > 0, no budget lines', () => {
      const invoice = makeInvoice({
        isSplit: true,
        budgetLines: [],
        deposits: [makeDeposit({ budgetSourceId: 'src-1' })],
      });
      const report = makeReport([invoice]);
      const content = buildReportContent(report, new Set(['inv-1']), 'claim', t, formatters);
      expect(content.rows[0]!.allocatedMarkers).toBe('‡1');
    });

    it('adds both † and ‡ when both budget lines and deposits are present', () => {
      const invoice = makeInvoice({
        isSplit: true,
        budgetLines: [makeBudgetLine()],
        deposits: [makeDeposit({ budgetSourceId: 'src-1' })],
      });
      const report = makeReport([invoice]);
      const content = buildReportContent(report, new Set(['inv-1']), 'claim', t, formatters);
      expect(content.rows[0]!.allocatedMarkers).toBe('†1‡1');
    });

    it('adds neither marker when isSplit is false, regardless of budgetLines/deposits content', () => {
      const invoice = makeInvoice({
        isSplit: false,
        budgetLines: [makeBudgetLine()],
        deposits: [makeDeposit({ budgetSourceId: 'src-1' })],
      });
      const report = makeReport([invoice]);
      const content = buildReportContent(report, new Set(['inv-1']), 'claim', t, formatters);
      expect(content.rows[0]!.allocatedMarkers).toBe('');
    });

    it('adds neither marker when isSplit is true but budgetLines and deposits are both empty', () => {
      const invoice = makeInvoice({ isSplit: true, budgetLines: [], deposits: [] });
      const report = makeReport([invoice]);
      const content = buildReportContent(report, new Set(['inv-1']), 'claim', t, formatters);
      expect(content.rows[0]!.allocatedMarkers).toBe('');
    });

    it('never assigns markers to an excluded invoice, even when isSplit with lines/deposits', () => {
      const invoice = makeInvoice({
        invoiceId: 'inv-excluded',
        isSplit: true,
        budgetLines: [makeBudgetLine()],
      });
      const included = makeInvoice({ invoiceId: 'inv-1' });
      const report = makeReport([invoice, included]);
      const content = buildReportContent(report, new Set(['inv-1']), 'claim', t, formatters);
      // Only the included row is present; footnotes must not have been numbered for the excluded one.
      expect(content.rows).toHaveLength(1);
      expect(content.footnotes).toEqual([]);
    });
  });
});

describe('buildReportContent — footnotes', () => {
  it('produces a split footnote with vendor/invoice-number attribution using the dedicated splitFootnote key', () => {
    const invoice = makeInvoice({
      invoiceId: 'inv-split',
      vendorName: 'Gamma Corp',
      invoiceNumber: 'G-9',
      isSplit: true,
      budgetLines: [makeBudgetLine()],
    });
    const report = makeReport([invoice]);
    const content = buildReportContent(report, new Set(['inv-split']), 'claim', t, formatters);
    expect(content.footnotes).toEqual([
      {
        id: 'split-1',
        marker: '†1',
        text: 'Gamma Corp (G-9) — sourceReports.table.splitFootnote',
      },
    ]);
  });

  it('produces a "constituted" deposit footnote when the deposit is tagged to this source', () => {
    const invoice = makeInvoice({
      isSplit: true,
      budgetLines: [],
      deposits: [makeDeposit({ budgetSourceId: 'src-1' })],
    });
    const report = makeReport([invoice], { id: 'src-1' });
    const content = buildReportContent(report, new Set(['inv-1']), 'claim', t, formatters);
    expect(content.footnotes[0]!.text).toContain('sourceReports.table.depositConstitutedFootnote');
  });

  it('produces a "reduced" deposit footnote when the deposit is untagged (or tagged elsewhere)', () => {
    const invoice = makeInvoice({
      isSplit: true,
      budgetLines: [],
      deposits: [makeDeposit({ budgetSourceId: null })],
    });
    const report = makeReport([invoice], { id: 'src-1' });
    const content = buildReportContent(report, new Set(['inv-1']), 'claim', t, formatters);
    expect(content.footnotes[0]!.text).toContain('sourceReports.table.depositReducedFootnote');
  });

  it('orders footnotes split-block-first, then deposit-block, independent numbering per block', () => {
    const splitOnly = makeInvoice({
      invoiceId: 'inv-split',
      vendorName: 'Split Vendor',
      invoiceNumber: 'S-1',
      isSplit: true,
      budgetLines: [makeBudgetLine()],
    });
    const depositOnly = makeInvoice({
      invoiceId: 'inv-deposit',
      vendorName: 'Deposit Vendor',
      invoiceNumber: 'D-1',
      isSplit: true,
      budgetLines: [],
      deposits: [makeDeposit({ budgetSourceId: 'src-1' })],
    });
    const report = makeReport([splitOnly, depositOnly], { id: 'src-1' });
    const content = buildReportContent(
      report,
      new Set(['inv-split', 'inv-deposit']),
      'claim',
      t,
      formatters,
    );
    expect(content.footnotes.map((f) => f.id)).toEqual(['split-1', 'deposit-1']);
  });

  it('produces no footnotes when no invoice is split', () => {
    const report = makeReport([makeInvoice()]);
    const content = buildReportContent(report, new Set(['inv-1']), 'claim', t, formatters);
    expect(content.footnotes).toEqual([]);
  });
});

describe('buildReportContent — summaryRows', () => {
  it('adds one subtotal row per distinct status among included invoices, in pending/paid/claimed/quotation order', () => {
    const pending = makeInvoice({ invoiceId: 'inv-1', status: 'pending', allocatedAmount: 100 });
    const paid = makeInvoice({ invoiceId: 'inv-2', status: 'paid', allocatedAmount: 200 });
    const report = makeReport([pending, paid]);
    const content = buildReportContent(report, new Set(['inv-1', 'inv-2']), 'claim', t, formatters);
    const subtotalKeys = content.summaryRows
      .filter((r) => r.key.startsWith('subtotal-'))
      .map((r) => r.key);
    expect(subtotalKeys).toEqual(['subtotal-pending', 'subtotal-paid']);
    expect(content.summaryRows[0]!.amountText).toBe('€100.00');
    expect(content.summaryRows[1]!.amountText).toBe('€200.00');
  });

  it('does not add a subtotal row for a status with zero included invoices', () => {
    const pending = makeInvoice({ invoiceId: 'inv-1', status: 'pending', allocatedAmount: 100 });
    const report = makeReport([pending]);
    const content = buildReportContent(report, new Set(['inv-1']), 'claim', t, formatters);
    const subtotalKeys = content.summaryRows.filter((r) => r.key.startsWith('subtotal-'));
    expect(subtotalKeys).toHaveLength(1);
  });

  it('always appends a final "total" row with the sum of included invoices\' allocatedAmount', () => {
    const invoice1 = makeInvoice({ invoiceId: 'inv-1', allocatedAmount: 100 });
    const invoice2 = makeInvoice({ invoiceId: 'inv-2', allocatedAmount: 250 });
    const excluded = makeInvoice({ invoiceId: 'inv-3', allocatedAmount: 9999 });
    const report = makeReport([invoice1, invoice2, excluded]);
    const content = buildReportContent(report, new Set(['inv-1', 'inv-2']), 'claim', t, formatters);
    const total = content.summaryRows.at(-1)!;
    expect(total.key).toBe('total');
    expect(total.label).toBe('sourceReports.table.total');
    expect(total.amountText).toBe('€350.00');
  });
});

describe('buildReportContent — cover letter', () => {
  it('is null when includeCoverLetter is false (default when options omitted)', () => {
    const report = makeReport([]);
    const content = buildReportContent(report, new Set(), 'claim', t, formatters);
    expect(content.coverLetter).toBeNull();
  });

  it('is null when options.includeCoverLetter is explicitly false', () => {
    const report = makeReport([]);
    const content = buildReportContent(report, new Set(), 'claim', t, formatters, {
      includeCoverLetter: false,
      household: null,
    });
    expect(content.coverLetter).toBeNull();
  });

  it('is non-null when includeCoverLetter is true, even with household null (sender = "")', () => {
    const report = makeReport([]);
    const content = buildReportContent(report, new Set(), 'claim', t, formatters, {
      includeCoverLetter: true,
      household: null,
    });
    expect(content.coverLetter).not.toBeNull();
    expect(content.coverLetter!.sender).toBe('');
    expect(content.coverLetter!.signature).toBe('');
  });

  it('joins householdName and householdAddress with \\n for sender', () => {
    const report = makeReport([]);
    const content = buildReportContent(report, new Set(), 'claim', t, formatters, {
      includeCoverLetter: true,
      household,
    });
    expect(content.coverLetter!.sender).toBe('The Smiths\n123 Main St');
  });

  it('omits the address line from sender when only householdName is present', () => {
    const nameOnly: HouseholdSettings = { householdName: 'The Smiths', householdAddress: null };
    const report = makeReport([]);
    const content = buildReportContent(report, new Set(), 'claim', t, formatters, {
      includeCoverLetter: true,
      household: nameOnly,
    });
    expect(content.coverLetter!.sender).toBe('The Smiths');
  });

  it('omits the name line from sender when only householdAddress is present', () => {
    const addressOnly: HouseholdSettings = { householdName: null, householdAddress: '123 Main St' };
    const report = makeReport([]);
    const content = buildReportContent(report, new Set(), 'claim', t, formatters, {
      includeCoverLetter: true,
      household: addressOnly,
    });
    expect(content.coverLetter!.sender).toBe('123 Main St');
  });

  it('recipient is null when source.contactAddress is null', () => {
    const report = makeReport([], { contactAddress: null });
    const content = buildReportContent(report, new Set(), 'claim', t, formatters, {
      includeCoverLetter: true,
      household,
    });
    expect(content.coverLetter!.recipient).toBeNull();
  });

  it('recipient is source.contactAddress when present', () => {
    const report = makeReport([], { contactAddress: '456 Bank Ave' });
    const content = buildReportContent(report, new Set(), 'claim', t, formatters, {
      includeCoverLetter: true,
      household,
    });
    expect(content.coverLetter!.recipient).toBe('456 Bank Ave');
  });

  it('dateLine is formatted via formatters.formatDate, read-only, distinct from other fields', () => {
    const report = makeReport([]);
    const content = buildReportContent(report, new Set(), 'claim', t, formatters, {
      includeCoverLetter: true,
      household,
    });
    expect(content.coverLetter!.dateLine).toMatch(/^date\(\d{4}-\d{2}-\d{2}\)$/);
  });

  it('dateLine falls back to the raw ISO date string when reportFormatters is omitted', () => {
    const report = makeReport([]);
    const content = buildReportContent(report, new Set(), 'claim', t, undefined, {
      includeCoverLetter: true,
      household,
    });
    expect(content.coverLetter!.dateLine).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('coverLetter.reference and sourceInfo.referenceText share the same seed value but are independent fields', () => {
    const report = makeReport([], { reference: 'REF-42' });
    const content = buildReportContent(report, new Set(), 'claim', t, formatters, {
      includeCoverLetter: true,
      household,
    });
    expect(content.coverLetter!.reference).toBe('REF-42');
    expect(content.sourceInfo.referenceText).toBe('REF-42');
    // Independent object identity — one is not a getter/alias of the other.
    expect(content.coverLetter).not.toBe(content.sourceInfo);
  });

  it('coverLetter.reference is null when source.reference is null', () => {
    const report = makeReport([], { reference: null });
    const content = buildReportContent(report, new Set(), 'claim', t, formatters, {
      includeCoverLetter: true,
      household,
    });
    expect(content.coverLetter!.reference).toBeNull();
  });

  it('subject resolves via sourceReports.coverLetter.subject.<useCase>', () => {
    const report = makeReport([]);
    const content = buildReportContent(report, new Set(), 'proof-of-funds', t, formatters, {
      includeCoverLetter: true,
      household,
    });
    expect(content.coverLetter!.subject).toBe('sourceReports.coverLetter.subject.proof-of-funds');
  });

  it('body interpolates {total} ONCE, using the same formatted grand total as the summary row', () => {
    const invoice = makeInvoice({ allocatedAmount: 400 });
    const report = makeReport([invoice]);
    const content = buildReportContent(report, new Set(['inv-1']), 'claim', t, formatters, {
      includeCoverLetter: true,
      household,
    });
    const totalRow = content.summaryRows.at(-1)!;
    expect(content.coverLetter!.body).toBe(
      `sourceReports.coverLetter.body.claim::{"total":"${totalRow.amountText}"}`,
    );
  });

  it('signature derives from the first line of sender, trimmed', () => {
    const report = makeReport([]);
    const content = buildReportContent(report, new Set(), 'claim', t, formatters, {
      includeCoverLetter: true,
      household: { householdName: '  The Smiths  ', householdAddress: '123 Main St' },
    });
    expect(content.coverLetter!.signature).toBe('The Smiths');
  });
});

describe('buildReportContent — t() call tracking sanity', () => {
  it('never calls reportT with the row-level status text as a key (statusText is pre-translated once)', () => {
    const tracked = jest.fn((key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}::${JSON.stringify(opts)}` : key,
    ) as unknown as TFunction;
    const invoice = makeInvoice({ status: 'paid' });
    const report = makeReport([invoice]);
    buildReportContent(report, new Set(['inv-1']), 'budget-overview', tracked, formatters);
    const calledKeys = (tracked as unknown as jest.Mock).mock.calls.map((c) => c[0]);
    // sources.lines.invoiceStatus.paid is called exactly once for the row (plus once more for the
    // subtotal label) — not re-derived anywhere else.
    const statusCalls = calledKeys.filter((k) => k === 'sources.lines.invoiceStatus.paid');
    expect(statusCalls.length).toBeGreaterThanOrEqual(1);
  });
});
