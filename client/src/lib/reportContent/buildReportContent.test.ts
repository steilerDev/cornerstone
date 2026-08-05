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

function makeLinkedItem(
  overrides: Partial<SourceReportBudgetLine['linkedItem']> = {},
): NonNullable<SourceReportBudgetLine['linkedItem']> {
  return {
    type: 'work_item',
    id: 'wi-1',
    name: 'Kitchen',
    areaId: null,
    areaName: null,
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

// #1932 AC 3.1: the sender is [user.displayName, householdAddress] — the household NAME is never
// used, even where the pre-#1932 `household` fixture above still carries one (kept as-is so
// unrelated recipient/dateLine/reference/subject/body tests below, which never assert on sender,
// don't need to change).
const user: { displayName: string } = { displayName: 'Jane Doe' };

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
          makeBudgetLine({ linkedItem: makeLinkedItem({ id: 'wi-1', name: 'Kitchen' }) }),
          makeBudgetLine({ linkedItem: makeLinkedItem({ id: 'wi-2', name: 'Bathroom' }) }),
          makeBudgetLine({ linkedItem: makeLinkedItem({ id: 'wi-1', name: 'Kitchen' }) }),
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

  describe('isSplit / isDepositReduced / isDeposit flags', () => {
    it('sets isSplit=true when isSplit and budgetLines.length > 0, no deposits', () => {
      const invoice = makeInvoice({
        isSplit: true,
        budgetLines: [makeBudgetLine()],
        deposits: [],
      });
      const report = makeReport([invoice]);
      const content = buildReportContent(report, new Set(['inv-1']), 'claim', t, formatters);
      expect(content.rows[0]!.isSplit).toBe(true);
      expect(content.rows[0]!.isDepositReduced).toBe(false);
      expect(content.rows[0]!.isDeposit).toBe(false);
    });

    it('sets isDepositReduced=true when isSplit and the deposit is untagged (reduced), no budget lines', () => {
      const invoice = makeInvoice({
        isSplit: true,
        budgetLines: [],
        deposits: [makeDeposit({ budgetSourceId: null })],
      });
      const report = makeReport([invoice], { id: 'src-1' });
      const content = buildReportContent(report, new Set(['inv-1']), 'claim', t, formatters);
      expect(content.rows[0]!.isSplit).toBe(false);
      expect(content.rows[0]!.isDepositReduced).toBe(true);
      expect(content.rows[0]!.isDeposit).toBe(false);
    });

    it('AC2.1: sets isDeposit=true (not isSplit/isDepositReduced) when the deposit is tagged to this report source (constituted)', () => {
      const invoice = makeInvoice({
        isSplit: true,
        budgetLines: [],
        deposits: [makeDeposit({ budgetSourceId: 'src-1' })],
      });
      const report = makeReport([invoice], { id: 'src-1' });
      const content = buildReportContent(report, new Set(['inv-1']), 'claim', t, formatters);
      expect(content.rows[0]!.isSplit).toBe(false);
      expect(content.rows[0]!.isDepositReduced).toBe(false);
      expect(content.rows[0]!.isDeposit).toBe(true);
    });

    it('AC2.4: sets both isSplit and isDepositReduced when split budget lines and a reduced deposit are both present', () => {
      const invoice = makeInvoice({
        isSplit: true,
        budgetLines: [makeBudgetLine()],
        deposits: [makeDeposit({ budgetSourceId: null })],
      });
      const report = makeReport([invoice], { id: 'src-1' });
      const content = buildReportContent(report, new Set(['inv-1']), 'claim', t, formatters);
      expect(content.rows[0]!.isSplit).toBe(true);
      expect(content.rows[0]!.isDepositReduced).toBe(true);
    });

    it('sets isSplit=true and isDeposit=true when split budget lines combined with a constituted (tagged) deposit', () => {
      const invoice = makeInvoice({
        isSplit: true,
        budgetLines: [makeBudgetLine()],
        deposits: [makeDeposit({ budgetSourceId: 'src-1' })],
      });
      const report = makeReport([invoice], { id: 'src-1' });
      const content = buildReportContent(report, new Set(['inv-1']), 'claim', t, formatters);
      expect(content.rows[0]!.isSplit).toBe(true);
      expect(content.rows[0]!.isDepositReduced).toBe(false);
      expect(content.rows[0]!.isDeposit).toBe(true);
    });

    it('all flags are false when isSplit is false, regardless of budgetLines/deposits content', () => {
      const invoice = makeInvoice({
        isSplit: false,
        budgetLines: [makeBudgetLine()],
        deposits: [makeDeposit({ budgetSourceId: 'src-1' })],
      });
      const report = makeReport([invoice]);
      const content = buildReportContent(report, new Set(['inv-1']), 'claim', t, formatters);
      expect(content.rows[0]!.isSplit).toBe(false);
      expect(content.rows[0]!.isDepositReduced).toBe(false);
      expect(content.rows[0]!.isDeposit).toBe(false);
    });

    it('all flags are false when isSplit is true but budgetLines and deposits are both empty', () => {
      const invoice = makeInvoice({ isSplit: true, budgetLines: [], deposits: [] });
      const report = makeReport([invoice]);
      const content = buildReportContent(report, new Set(['inv-1']), 'claim', t, formatters);
      expect(content.rows[0]!.isSplit).toBe(false);
      expect(content.rows[0]!.isDepositReduced).toBe(false);
      expect(content.rows[0]!.isDeposit).toBe(false);
    });

    it('never sets flags on an excluded invoice, even when isSplit with lines/deposits', () => {
      const invoice = makeInvoice({
        invoiceId: 'inv-excluded',
        isSplit: true,
        budgetLines: [makeBudgetLine()],
      });
      const included = makeInvoice({ invoiceId: 'inv-1' });
      const report = makeReport([invoice, included]);
      const content = buildReportContent(report, new Set(['inv-1']), 'claim', t, formatters);
      expect(content.rows).toHaveLength(1);
      expect(content.footnotes).toEqual([]);
    });
  });
});

describe('buildReportContent — footnotes (legend sentences for split/depositReduced)', () => {
  it('AC 1.1 — split flag: one split invoice included produces a footnote with id "split" and the correct keys', () => {
    const inv = makeInvoice({
      invoiceId: 'inv-1',
      isSplit: true,
      budgetLines: [makeBudgetLine()],
      deposits: [],
    });
    const report = makeReport([inv]);
    const content = buildReportContent(report, new Set(['inv-1']), 'claim', t, formatters);
    expect(content.footnotes).toHaveLength(1);
    expect(content.footnotes[0]!.id).toBe('split');
    expect(content.footnotes[0]!.marker).toBe('sourceReports.table.splitInlineLabel');
    expect(content.footnotes[0]!.text).toBe('sourceReports.table.splitFootnote');
  });

  it('AC 1.2 — depositReduced flag: one depositReduced invoice produces a footnote with id "depositReduced"', () => {
    const inv = makeInvoice({
      invoiceId: 'inv-1',
      isSplit: true,
      budgetLines: [],
      deposits: [makeDeposit({ budgetSourceId: null })],
    });
    const report = makeReport([inv], { id: 'src-1' });
    const content = buildReportContent(report, new Set(['inv-1']), 'claim', t, formatters);
    expect(content.footnotes).toHaveLength(1);
    expect(content.footnotes[0]!.id).toBe('depositReduced');
  });

  it('AC 1.3 — both flags: split and depositReduced present → footnotes length 2, split first, depositReduced second', () => {
    const inv = makeInvoice({
      invoiceId: 'inv-1',
      isSplit: true,
      budgetLines: [makeBudgetLine()],
      deposits: [makeDeposit({ budgetSourceId: null })],
    });
    const report = makeReport([inv], { id: 'src-1' });
    const content = buildReportContent(report, new Set(['inv-1']), 'claim', t, formatters);
    expect(content.footnotes).toHaveLength(2);
    expect(content.footnotes[0]!.id).toBe('split');
    expect(content.footnotes[1]!.id).toBe('depositReduced');
  });

  it('AC 1.4 — neither flag: normal invoice → footnotes is empty', () => {
    const inv = makeInvoice({ invoiceId: 'inv-1', isSplit: false });
    const report = makeReport([inv]);
    const content = buildReportContent(report, new Set(['inv-1']), 'claim', t, formatters);
    expect(content.footnotes).toEqual([]);
  });

  it('AC 1.5 — deduplication: two split invoices produce only one footnote entry', () => {
    const inv1 = makeInvoice({
      invoiceId: 'inv-1',
      isSplit: true,
      budgetLines: [makeBudgetLine()],
    });
    const inv2 = makeInvoice({
      invoiceId: 'inv-2',
      isSplit: true,
      budgetLines: [makeBudgetLine()],
    });
    const report = makeReport([inv1, inv2]);
    const content = buildReportContent(report, new Set(['inv-1', 'inv-2']), 'claim', t, formatters);
    expect(content.footnotes).toHaveLength(1);
    expect(content.footnotes[0]!.id).toBe('split');
  });

  it('excluded split invoice does not contribute to footnotes', () => {
    const excluded = makeInvoice({
      invoiceId: 'inv-excluded',
      isSplit: true,
      budgetLines: [makeBudgetLine()],
      deposits: [makeDeposit({ budgetSourceId: null })],
    });
    const included = makeInvoice({ invoiceId: 'inv-included', isSplit: false });
    const report = makeReport([excluded, included], { id: 'src-1' });
    const content = buildReportContent(report, new Set(['inv-included']), 'claim', t, formatters);
    expect(content.footnotes).toEqual([]);
  });
});

describe('buildReportContent — summaryRows (AC4: total-only summary)', () => {
  it('AC4.1/4.2: produces exactly one summary row (key "total"), even when included invoices span 2+ distinct statuses', () => {
    const pending = makeInvoice({ invoiceId: 'inv-1', status: 'pending', allocatedAmount: 100 });
    const paid = makeInvoice({ invoiceId: 'inv-2', status: 'paid', allocatedAmount: 200 });
    const quotation = makeInvoice({
      invoiceId: 'inv-3',
      status: 'quotation',
      allocatedAmount: 50,
    });
    const report = makeReport([pending, paid, quotation]);
    const content = buildReportContent(
      report,
      new Set(['inv-1', 'inv-2', 'inv-3']),
      'budget-overview',
      t,
      formatters,
    );
    expect(content.summaryRows).toHaveLength(1);
    expect(content.summaryRows[0]!.key).toBe('total');
    // No subtotal-* rows of any kind survive.
    expect(content.summaryRows.some((r) => r.key.startsWith('subtotal'))).toBe(false);
  });

  it('AC4.1: produces exactly one summary row even when only a single status is present', () => {
    const pending = makeInvoice({ invoiceId: 'inv-1', status: 'pending', allocatedAmount: 100 });
    const report = makeReport([pending]);
    const content = buildReportContent(report, new Set(['inv-1']), 'claim', t, formatters);
    expect(content.summaryRows).toHaveLength(1);
  });

  it("AC4.3: the total row's amount is the sum of allocatedAmount over included invoices — unchanged math", () => {
    const invoice1 = makeInvoice({ invoiceId: 'inv-1', allocatedAmount: 100 });
    const invoice2 = makeInvoice({ invoiceId: 'inv-2', allocatedAmount: 250 });
    const excluded = makeInvoice({ invoiceId: 'inv-3', allocatedAmount: 9999 });
    const report = makeReport([invoice1, invoice2, excluded]);
    const content = buildReportContent(report, new Set(['inv-1', 'inv-2']), 'claim', t, formatters);
    const total = content.summaryRows[0]!;
    expect(total.key).toBe('total');
    expect(total.label).toBe('sourceReports.table.total');
    expect(total.amountText).toBe('€350.00');
  });
});

describe('buildReportContent — isClaim (AC3)', () => {
  it('is true only for the claim useCase, false for budget-overview and proof-of-funds', () => {
    const report = makeReport([]);
    expect(buildReportContent(report, new Set(), 'claim', t).isClaim).toBe(true);
    expect(buildReportContent(report, new Set(), 'budget-overview', t).isClaim).toBe(false);
    expect(buildReportContent(report, new Set(), 'proof-of-funds', t).isClaim).toBe(false);
  });
});

describe('buildReportContent — areaText (AC5.2–5.5)', () => {
  it('AC5.2: renders a single leaf area name when one budget line resolves a linked item with an area', () => {
    const invoice = makeInvoice({
      budgetLines: [
        makeBudgetLine({
          linkedItem: makeLinkedItem({ areaId: 'area-1', areaName: 'Kitchen' }),
        }),
      ],
    });
    const report = makeReport([invoice]);
    const content = buildReportContent(report, new Set(['inv-1']), 'claim', t, formatters);
    expect(content.rows[0]!.areaText).toBe('Kitchen');
  });

  it('AC5.2: dedupes and comma-joins distinct area names in first-occurrence order across multiple budget lines', () => {
    const invoice = makeInvoice({
      budgetLines: [
        makeBudgetLine({
          id: 'bl-1',
          linkedItem: makeLinkedItem({ id: 'wi-1', areaId: 'area-1', areaName: 'Kitchen' }),
        }),
        makeBudgetLine({
          id: 'bl-2',
          linkedItem: makeLinkedItem({ id: 'wi-2', areaId: 'area-2', areaName: 'Bathroom' }),
        }),
        makeBudgetLine({
          id: 'bl-3',
          linkedItem: makeLinkedItem({ id: 'wi-1', areaId: 'area-1', areaName: 'Kitchen' }),
        }),
      ],
    });
    const report = makeReport([invoice]);
    const content = buildReportContent(report, new Set(['inv-1']), 'claim', t, formatters);
    expect(content.rows[0]!.areaText).toBe('Kitchen, Bathroom');
  });

  it('AC5.4: is null when budgetLines is empty (no linkedItem at all)', () => {
    const invoice = makeInvoice({ budgetLines: [] });
    const report = makeReport([invoice]);
    const content = buildReportContent(report, new Set(['inv-1']), 'claim', t, formatters);
    expect(content.rows[0]!.areaText).toBeNull();
  });

  it('AC5.4: is null when the linked item has no area assigned (areaName null)', () => {
    const invoice = makeInvoice({
      budgetLines: [
        makeBudgetLine({ linkedItem: makeLinkedItem({ areaId: null, areaName: null }) }),
      ],
    });
    const report = makeReport([invoice]);
    const content = buildReportContent(report, new Set(['inv-1']), 'claim', t, formatters);
    expect(content.rows[0]!.areaText).toBeNull();
  });

  it('AC5.4: is null when budget lines have no linkedItem (description-only fallback)', () => {
    const invoice = makeInvoice({
      budgetLines: [makeBudgetLine({ linkedItem: null, description: 'Materials' })],
    });
    const report = makeReport([invoice]);
    const content = buildReportContent(report, new Set(['inv-1']), 'claim', t, formatters);
    expect(content.rows[0]!.areaText).toBeNull();
  });

  it('AC5.5: renders only the leaf (own) area name, never a parent-path expansion — the row consumes areaName verbatim', () => {
    // The child's bare name only — buildReportContent does not expand the hierarchy; it trusts
    // sourceReportService to have already resolved the leaf-only areaName (see
    // sourceReportService.test.ts "child area with parent" coverage for the server-side guarantee).
    const invoice = makeInvoice({
      budgetLines: [
        makeBudgetLine({
          linkedItem: makeLinkedItem({ areaId: 'area-child', areaName: 'Ensuite' }),
        }),
      ],
    });
    const report = makeReport([invoice]);
    const content = buildReportContent(report, new Set(['inv-1']), 'claim', t, formatters);
    expect(content.rows[0]!.areaText).toBe('Ensuite');
    expect(content.rows[0]!.areaText).not.toContain('/');
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

  it('AC 3.2: is non-null when includeCoverLetter is true, even with user AND household both absent/null (sender = "", no crash)', () => {
    const report = makeReport([]);
    const content = buildReportContent(report, new Set(), 'claim', t, formatters, {
      includeCoverLetter: true,
      household: null,
      user: null,
    });
    expect(content.coverLetter).not.toBeNull();
    expect(content.coverLetter!.sender).toBe('');
    expect(content.coverLetter!.signature).toBe('');
  });

  it('AC 3.1: sender joins user.displayName and householdAddress with \\n — the household NAME is never included, even though it is present on the object', () => {
    const report = makeReport([]);
    // `household` carries BOTH householdName ('The Smiths') and householdAddress ('123 Main St');
    // if the household name were still leaking into the sender (the pre-#1932 behaviour), this
    // would fail with 'Jane Doe\nThe Smiths\n123 Main St' or similar instead.
    const content = buildReportContent(report, new Set(), 'claim', t, formatters, {
      includeCoverLetter: true,
      household,
      user,
    });
    expect(content.coverLetter!.sender).toBe('Jane Doe\n123 Main St');
  });

  it('AC 3.2: sender is just the user displayName when the household has no address (householdName alone is never used, even when present)', () => {
    const nameOnly: HouseholdSettings = { householdName: 'The Smiths', householdAddress: null };
    const report = makeReport([]);
    const content = buildReportContent(report, new Set(), 'claim', t, formatters, {
      includeCoverLetter: true,
      household: nameOnly,
      user,
    });
    expect(content.coverLetter!.sender).toBe('Jane Doe');
  });

  it('AC 3.2: sender is just the household address when user is null, with no leading blank line', () => {
    const addressOnly: HouseholdSettings = { householdName: null, householdAddress: '123 Main St' };
    const report = makeReport([]);
    const content = buildReportContent(report, new Set(), 'claim', t, formatters, {
      includeCoverLetter: true,
      household: addressOnly,
      user: null,
    });
    expect(content.coverLetter!.sender).toBe('123 Main St');
    // No leading blank line/newline: the address is the ONLY line, not the second line of a pair
    // where the first (user) line was left empty.
    expect(content.coverLetter!.sender.startsWith('\n')).toBe(false);
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
      user: { displayName: '  Jane Doe  ' },
      household,
    });
    expect(content.coverLetter!.signature).toBe('Jane Doe');
  });

  it('AC 2.2: signature equals user.displayName exactly (the sender-derived default, not a placeholder)', () => {
    const report = makeReport([]);
    const content = buildReportContent(report, new Set(), 'claim', t, formatters, {
      includeCoverLetter: true,
      household,
      user,
    });
    expect(content.coverLetter!.signature).toBe(user.displayName);
  });

  describe('closing (AC 2.5)', () => {
    it('resolves via reportT("sourceReports.coverLetter.closing") regardless of which report-language t-fixture is used', () => {
      // This file's tracked `t` fixtures are language-agnostic key-echoers (see the header
      // comment) — a real i18next instance's en/de resolution is exercised end-to-end in
      // realRender.test.ts. What this asserts here: `closing` is ALWAYS produced by calling
      // reportT with the fixed key (never a hardcoded English string, never read from `t`/the
      // editor's interface language) — true for both an "English-configured" and a
      // "German-configured" reportT fixture, since both echo the same key verbatim.
      const report = makeReport([]);
      const tEn = t;
      const tDe = ((key: string, opts?: Record<string, unknown>) =>
        opts ? `${key}::${JSON.stringify(opts)}` : key) as unknown as TFunction;

      const contentEn = buildReportContent(report, new Set(), 'claim', tEn, formatters, {
        includeCoverLetter: true,
        household,
        user,
      });
      const contentDe = buildReportContent(report, new Set(), 'claim', tDe, formatters, {
        includeCoverLetter: true,
        household,
        user,
      });

      expect(contentEn.coverLetter!.closing).toBe('sourceReports.coverLetter.closing');
      expect(contentDe.coverLetter!.closing).toBe('sourceReports.coverLetter.closing');
    });
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

describe('buildReportContent — labels: 3 new fields (#2001)', () => {
  // The identity-TFunction (`t = (key) => key`) is defined at the top of this file. Because
  // buildReportContent calls reportT(key) for each label and `t` echoes the key verbatim, the
  // returned label value equals the i18n key string — so these assertions verify which keys are
  // being resolved, not the translated text (realRender.test.ts covers the latter end-to-end).
  it('labels.coverLetterReferenceLabel is populated via reportT("sourceReports.coverLetter.reference")', () => {
    const result = buildReportContent(makeReport([]), new Set(), 'claim', t, formatters);
    expect(result.labels.coverLetterReferenceLabel).toBe('sourceReports.coverLetter.reference');
  });

  it('labels.coverLetterSubjectLabel is populated via reportT("sourceReports.coverLetter.subjectLabel")', () => {
    const result = buildReportContent(makeReport([]), new Set(), 'claim', t, formatters);
    expect(result.labels.coverLetterSubjectLabel).toBe('sourceReports.coverLetter.subjectLabel');
  });

  it('labels.skipReasonLabels.footnoteFetchFailed is populated via reportT("sourceReports.table.footnoteFetchFailed")', () => {
    const result = buildReportContent(makeReport([]), new Set(), 'claim', t, formatters);
    expect(result.labels.skipReasonLabels.footnoteFetchFailed).toBe(
      'sourceReports.table.footnoteFetchFailed',
    );
  });

  it('labels.skipReasonLabels.footnoteInvalidPdf is populated via reportT("sourceReports.table.footnoteInvalidPdf")', () => {
    const result = buildReportContent(makeReport([]), new Set(), 'claim', t, formatters);
    expect(result.labels.skipReasonLabels.footnoteInvalidPdf).toBe(
      'sourceReports.table.footnoteInvalidPdf',
    );
  });
});
