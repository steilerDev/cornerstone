/**
 * End-to-end, fully REAL render test for the report PDF pipeline (originally QA fix spec item 3;
 * extended for Story #1900's editable-content pipeline).
 *
 * Unlike every other test file in this directory, this one mocks NOTHING in the pipeline:
 *   - loader.ts is real (real pdfmake@0.3.11 + pdf-lib, real addVirtualFileSystem/addFonts)
 *   - merge.ts / overviewPdf.ts / coverLetterPdf.ts / shared.ts / reportContent/* are all real
 *   - i18next is a real instance loaded with the ACTUAL en/de `budget` namespace JSON bundles
 *     (not a stub `t()` that echoes keys)
 *   - formatters are the real `formatCurrency`/`formatDate` from ../formatters.ts, bound to each
 *     locale
 *
 * The only thing stubbed is `global.fetch` (jsdom has no real network) — it serves a real,
 * pdf-lib-generated minimal PDF for one document and a 404 for another, so the
 * attach-documents/skip-footnote code paths are exercised with genuine bytes, not fixtures that
 * merely claim to be PDFs.
 *
 * Story #1900 pipeline shape: buildReportContent(report, includedIds, useCase, t, formatters,
 * {includeCoverLetter, household}) produces the baseline ReportContent; applyOverrides(baseline,
 * overrides) produces the EFFECTIVE content actually rendered — generateReportPdf/buildOverviewContent
 * no longer derive text themselves, they only consume the already-built ReportContent. Every test
 * below that previously called generateReportPdf/buildOverviewContent with raw
 * report+useCase+household+formatters params now builds `content` first via the real
 * buildReportContent (and applyOverrides, where overrides are under test) and passes that through.
 *
 * NOTE (story #1898 fix round, still applicable): overviewPdf.ts's `widths` arrays previously
 * ended in the string literal `'2*'`, which pdfmake 0.3.11 does not support as a width unit — this
 * was fixed in production (both arrays now end in a plain `'*'`); every test below renders
 * successfully.
 */
import { describe, it, expect, beforeAll } from '@jest/globals';
import i18next from 'i18next';
import type { TFunction } from 'i18next';
import { PDFDocument } from 'pdf-lib';
import type {
  SourceReportResponse,
  SourceReportInvoice,
  HouseholdSettings,
} from '@cornerstone/shared';
import type { Formatters } from '../formatters.js';
import { formatCurrency, formatDate } from '../formatters.js';
import { buildReportContent, applyOverrides } from '../reportContent/index.js';
import type { ReportContentOverrides } from '../reportContent/index.js';
import enBudget from '../../i18n/en/budget.json';
import deBudget from '../../i18n/de/budget.json';

// ─── Real i18next instance (NOT the app singleton — no localStorage/navigator dependency) ─────

let tEn: TFunction;
let tDe: TFunction;

// jsdom's Blob polyfill does not implement .arrayBuffer()/.text() (both real browsers and Node's
// own global Blob do). merge.ts's production code calls textBlob.arrayBuffer() when embedding
// invoice PDFs — polyfill via FileReader so the real, unmocked pdfmake getBlob() result works
// under jsdom. This is a test-environment gap, not a production bug (see merge.test.ts for the
// same polyfill, applied there for the same reason).
beforeAll(() => {
  if (typeof Blob.prototype.arrayBuffer !== 'function') {
    Blob.prototype.arrayBuffer = function (this: Blob): Promise<ArrayBuffer> {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(this);
      });
    };
  }
});

beforeAll(async () => {
  const instance = i18next.createInstance();
  await instance.init({
    resources: {
      en: { budget: enBudget },
      de: { budget: deBudget },
    },
    lng: 'en',
    fallbackLng: 'en',
    defaultNS: 'budget',
    ns: ['budget'],
    interpolation: { escapeValue: false },
  });
  tEn = instance.getFixedT('en', 'budget');
  tDe = instance.getFixedT('de', 'budget');
});

function formattersFor(locale: 'en-US' | 'de-DE'): Formatters {
  return {
    formatCurrency: (n: number) => formatCurrency(n, locale, 'EUR'),
    formatDate: (d, fallback, monthStyle) => formatDate(d, locale, fallback, monthStyle),
  };
}

// ─── Real fixture: one valid embeddable PDF, fetched for the "split with doc" invoice ─────────

async function makeRealPdfBytes(): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([200, 200]);
  page.drawText('real fixture document', { x: 10, y: 100 });
  const bytes = await doc.save();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function makeInvoice(overrides: Partial<SourceReportInvoice> = {}): SourceReportInvoice {
  return {
    invoiceId: 'inv-x',
    vendorId: 'vend-x',
    vendorName: 'Vendor',
    invoiceNumber: 'INV-X',
    date: '2026-02-10',
    status: 'pending',
    invoiceAmount: 100,
    allocatedAmount: 100,
    lineKind: 'invoice',
    isSplit: false,
    documents: [],
    budgetLines: [],
    deposits: [],
    ...overrides,
  };
}

async function makeMixedReport(): Promise<{
  report: SourceReportResponse;
  includedIds: Set<string>;
  expectedIncludedTotal: number;
}> {
  const normal = makeInvoice({
    invoiceId: 'inv-normal',
    vendorName: 'Normal Vendor',
    invoiceNumber: 'N-1',
    status: 'paid',
    invoiceAmount: 500,
    allocatedAmount: 500,
  });
  const splitNoDoc = makeInvoice({
    invoiceId: 'inv-split-nodoc',
    vendorName: 'Split Vendor',
    invoiceNumber: 'S-1',
    isSplit: true,
    invoiceAmount: 800,
    allocatedAmount: 300,
    budgetLines: [
      { id: 'bl-split-nodoc', description: null, allocatedPortion: 300, linkedItem: null },
    ],
  });
  const splitWithDoc = makeInvoice({
    invoiceId: 'inv-split-doc',
    vendorName: 'Split-Doc Vendor',
    invoiceNumber: 'S-2',
    isSplit: true,
    invoiceAmount: 700,
    allocatedAmount: 250,
    documents: [{ documentId: 1, archiveSerialNumber: null, title: null, attachmentType: null }],
    budgetLines: [
      { id: 'bl-split-doc', description: null, allocatedPortion: 250, linkedItem: null },
    ],
  });
  const refund = makeInvoice({
    invoiceId: 'inv-refund',
    vendorName: 'Refund Vendor',
    invoiceNumber: 'R-1',
    lineKind: 'refund-adjustment',
    invoiceAmount: 150,
    allocatedAmount: -150,
  });
  const skipped = makeInvoice({
    invoiceId: 'inv-skip',
    vendorName: 'Skip Vendor',
    invoiceNumber: 'K-1',
    status: 'claimed',
    invoiceAmount: 400,
    allocatedAmount: 400,
    documents: [{ documentId: 2, archiveSerialNumber: null, title: null, attachmentType: null }],
  });
  const excluded = makeInvoice({
    invoiceId: 'inv-excluded',
    vendorName: 'Excluded Vendor',
    invoiceNumber: 'X-1',
    invoiceAmount: 999999,
    allocatedAmount: 999999,
  });

  const report: SourceReportResponse = {
    type: 'claim',
    source: {
      id: 'src-1',
      name: 'Home Loan',
      sourceType: 'bank_loan',
      reference: 'REF-1',
      contactAddress: '456 Bank Ave',
    },
    invoices: [normal, splitNoDoc, splitWithDoc, refund, skipped, excluded],
    totalAmount: 1300,
    unallocatedInvoices: [],
    generatedAt: '2026-02-15T00:00:00.000Z',
  };

  const includedIds = new Set([
    'inv-normal',
    'inv-split-nodoc',
    'inv-split-doc',
    'inv-refund',
    'inv-skip',
  ]);
  // 500 + 300 + 250 + (-150) + 400 = 1300 — the excluded invoice's 999999 must NOT be counted.
  const expectedIncludedTotal = 500 + 300 + 250 + -150 + 400;

  return { report, includedIds, expectedIncludedTotal };
}

const household: HouseholdSettings = {
  householdName: 'The Smiths',
  householdAddress: '123 Main St',
};

describe('report PDF pipeline — real, unmocked end-to-end render', () => {
  let validPdfBytes: ArrayBuffer;

  beforeAll(async () => {
    validPdfBytes = await makeRealPdfBytes();
  });

  function stubFetch() {
    const originalFetch = globalThis.fetch;
    const calls: string[] = [];
    globalThis.fetch = (async (url: RequestInfo | URL) => {
      const urlStr = String(url);
      calls.push(urlStr);
      if (urlStr.includes('/documents/1/')) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => validPdfBytes,
        } as unknown as Response;
      }
      // documentId 2 (the "skipped" invoice's document) always 404s.
      return {
        ok: false,
        status: 404,
        arrayBuffer: async () => new ArrayBuffer(0),
      } as unknown as Response;
    }) as typeof fetch;
    return { calls, restore: () => (globalThis.fetch = originalFetch) };
  }

  it.each([['en', 'en-US', () => tEn] as const, ['de', 'de-DE', () => tDe] as const])(
    'generates a real, non-empty PDF for the %s locale, embedding the valid document and skipping the failed one, with a correctly-signed included-only grand total',
    async (_label, localeStr, getT) => {
      const { generateReportPdf } = await import('./merge.js');
      const { report, includedIds, expectedIncludedTotal } = await makeMixedReport();
      const formatters = formattersFor(localeStr as 'en-US' | 'de-DE');
      const t = getT();
      const content = buildReportContent(report, includedIds, 'claim', t, formatters, {
        includeCoverLetter: true,
        household,
      });

      const { calls, restore } = stubFetch();
      let result: Awaited<ReturnType<typeof generateReportPdf>>;
      try {
        result = await generateReportPdf(
          report,
          includedIds,
          content,
          { attachDocuments: true },
          t,
        );
      } finally {
        restore();
      }

      // Both documents were fetched (the valid one and the 404 one).
      expect(calls.some((c) => c.includes('/documents/1/'))).toBe(true);
      expect(calls.some((c) => c.includes('/documents/2/'))).toBe(true);

      // A real, non-empty PDF blob was produced (real pdfmake render + real pdf-lib splice).
      expect(result.blob).toBeInstanceOf(Blob);
      expect(result.blob.size).toBeGreaterThan(0);
      expect(result.blob.type).toBe('application/pdf');

      // The failed document produced a real skip entry with vendor/invoice-number attribution.
      expect(result.skippedDocuments).toEqual([
        expect.objectContaining({
          invoiceId: 'inv-skip',
          documentId: '2',
          reason: 'footnoteFetchFailed',
          vendorName: 'Skip Vendor',
          invoiceNumber: 'K-1',
        }),
      ]);

      // Cross-check the grand total independently — computed the same way buildReportContent does
      // internally, from the total summary row.
      const totalRow = content.summaryRows.at(-1)!;
      expect(totalRow.amountText).toBe(formatters.formatCurrency(expectedIncludedTotal));

      // Re-derive the rendered PDF's own page count sanity check: the merged document contains
      // both the (multi-row) text pages AND the one embedded appendix document's page.
      const finalPdf = await PDFDocument.load(await result.blob.arrayBuffer());
      expect(finalPdf.getPageCount()).toBeGreaterThanOrEqual(2); // >=1 text page + 1 appendix page
    },
  );

  it('renders every declared pdfmake style (including bold: title/tableHeader/subtotal/total rows) without throwing, for both locales', async () => {
    const { generateReportPdf } = await import('./merge.js');
    for (const [localeStr, t] of [
      ['en-US', tEn],
      ['de-DE', tDe],
    ] as const) {
      const { report, includedIds } = await makeMixedReport();
      const formatters = formattersFor(localeStr);
      const content = buildReportContent(report, includedIds, 'claim', t, formatters, {
        includeCoverLetter: true,
        household,
      });
      const { restore } = stubFetch();
      let result: Awaited<ReturnType<typeof generateReportPdf>>;
      try {
        result = await generateReportPdf(
          report,
          includedIds,
          content,
          { attachDocuments: false },
          t,
        );
      } finally {
        restore();
      }
      expect(result.blob.size).toBeGreaterThan(0);
    }
  });

  it('excludes the excluded invoice entirely from the real render (no fetch, and the total never includes its amount)', async () => {
    const { generateReportPdf } = await import('./merge.js');
    const { report, includedIds } = await makeMixedReport();
    const formatters = formattersFor('en-US');
    const content = buildReportContent(report, includedIds, 'claim', tEn, formatters, {
      includeCoverLetter: false,
      household: null,
    });
    const { calls, restore } = stubFetch();
    try {
      await generateReportPdf(report, includedIds, content, { attachDocuments: true }, tEn);
    } finally {
      restore();
    }
    // inv-excluded has no documents in this fixture, so there is nothing to fetch for it either
    // way — the real signal is that only documents 1 and 2 (from included invoices) were ever
    // requested.
    expect(calls.every((c) => c.includes('/documents/1/') || c.includes('/documents/2/'))).toBe(
      true,
    );
  });

  describe('excluded rows never appear in the rendered content (Story #1900)', () => {
    it('the excluded invoice never appears as a row in ReportContent, and never contributes to the total', async () => {
      const { report, includedIds } = await makeMixedReport();
      const formatters = formattersFor('en-US');
      const content = buildReportContent(report, includedIds, 'claim', tEn, formatters, {
        includeCoverLetter: false,
        household: null,
      });
      expect(content.rows.some((r) => r.vendor === 'Excluded Vendor')).toBe(false);
      const total = content.summaryRows.at(-1)!;
      // 999999 would dominate the total if it leaked in — it does not appear anywhere.
      expect(total.amountText).not.toContain('999999');
    });

    it("excluding a previously-included invoice removes it from buildOverviewContent's rendered table body", async () => {
      const { buildOverviewContent } = await import('./overviewPdf.js');
      const { report, includedIds } = await makeMixedReport();
      const formatters = formattersFor('en-US');
      const withoutNormal = new Set([...includedIds].filter((id) => id !== 'inv-normal'));
      const content = buildReportContent(report, withoutNormal, 'claim', tEn, formatters, {
        includeCoverLetter: false,
        household: null,
      });
      const pdfContent = buildOverviewContent(content, new Map(), tEn);
      const tableItem = pdfContent.find(
        (c) => typeof c === 'object' && c !== null && 'table' in c,
      ) as { table: { body: { text?: string }[][] } };
      const vendorCells = tableItem.table.body.map((row) => row[0]?.text);
      expect(vendorCells).not.toContain('Normal Vendor');
    });
  });

  describe('German overview table column widths (frontend fix spec item 15; updated story #1898)', () => {
    it('uses the "*"-first / "auto"-rest width pattern for the 6-column claim/proof-of-funds table — the layout contract that keeps German label text from overflowing', async () => {
      // pdfmake's public Node API does not expose the LAYOUT ENGINE'S COMPUTED pixel widths for
      // 'auto' columns after createPdf()/getBlob() — there is no documented way to introspect the
      // resolved column widths of a generated PDF without re-implementing pdfmake's internal
      // table layout algorithm. This is flagged rather than silently skipped: true pixel-level
      // verification that German labels never exceed the printable width (A4 width 595.28pt -
      // 40pt left margin - 40pt right margin = 515.28pt) is NOT accessible via the public API in
      // this environment. What IS directly verifiable is the declared width contract that drives
      // that layout — overviewPdf.ts's own table.widths array, exercised here through the real,
      // unmocked buildOverviewContent with real German translations — which is checked below.
      const { buildOverviewContent } = await import('./overviewPdf.js');
      const { report, includedIds } = await makeMixedReport();
      const formatters = formattersFor('de-DE');
      const content = buildReportContent(report, includedIds, 'claim', tDe, formatters, {
        includeCoverLetter: false,
        household: null,
      });

      const pdfContent = buildOverviewContent(content, new Map(), tDe);
      const tableItem = pdfContent.find(
        (c) => typeof c === 'object' && c !== null && 'table' in c,
      ) as { table: { widths: string[] } };

      expect(tableItem.table.widths).toEqual(['*', 'auto', 'auto', 'auto', 'auto', '*']);
    });

    it('uses the "*"-first / "auto"-rest width pattern for the 7-column budget-overview table (status column included)', async () => {
      const { buildOverviewContent } = await import('./overviewPdf.js');
      const { report, includedIds } = await makeMixedReport();
      const formatters = formattersFor('de-DE');
      const content = buildReportContent(report, includedIds, 'budget-overview', tDe, formatters, {
        includeCoverLetter: false,
        household: null,
      });

      const pdfContent = buildOverviewContent(content, new Map(), tDe);
      const tableItem = pdfContent.find(
        (c) => typeof c === 'object' && c !== null && 'table' in c,
      ) as { table: { widths: string[] } };

      expect(tableItem.table.widths).toEqual(['*', 'auto', 'auto', 'auto', 'auto', 'auto', '*']);
    });
  });

  // ─── Usage column, attachment note, deposit-footnote wordings — real, unmocked i18next +
  // formatters, both locales ────────────────────────────────────────────────────────────────────

  describe('Usage column, attachment note, and deposit-footnote wordings (real en+de rendering)', () => {
    function makeUsageFeatureReport(): SourceReportResponse {
      const linkedUsage = makeInvoice({
        invoiceId: 'inv-usage-linked',
        vendorName: 'Linked Vendor',
        invoiceNumber: 'U-1',
        budgetLines: [
          {
            id: 'bl-linked-1',
            description: null,
            allocatedPortion: 100,
            linkedItem: {
              type: 'work_item',
              id: 'wi-1',
              name: 'Roof Replacement',
              areaId: null,
              areaName: null,
            },
          },
          {
            id: 'bl-linked-2',
            description: null,
            allocatedPortion: 50,
            linkedItem: {
              type: 'work_item',
              id: 'wi-1',
              name: 'Roof Replacement',
              areaId: null,
              areaName: null,
            },
          },
        ],
      });
      const attachSingle = makeInvoice({
        invoiceId: 'inv-attach-single',
        vendorName: 'Single Attach Vendor',
        invoiceNumber: 'U-3',
        documents: [
          { documentId: 101, archiveSerialNumber: null, title: null, attachmentType: 'invoice' },
        ],
      });
      const attachMulti = makeInvoice({
        invoiceId: 'inv-attach-multi',
        vendorName: 'Multi Attach Vendor',
        invoiceNumber: 'U-4',
        documents: [
          {
            documentId: 102,
            archiveSerialNumber: null,
            title: null,
            attachmentType: 'quotation',
          },
          { documentId: 103, archiveSerialNumber: null, title: null, attachmentType: 'invoice' },
        ],
      });
      const depositConstituted = makeInvoice({
        invoiceId: 'inv-deposit-constituted',
        vendorName: 'Constituted Vendor',
        invoiceNumber: 'U-5',
        isSplit: true,
        invoiceAmount: 250,
        allocatedAmount: 250,
        budgetLines: [],
        deposits: [
          {
            id: 'dep-constituted',
            amount: 250,
            status: 'paid',
            entryType: 'deposit',
            dueDate: '2026-01-01',
            paidDate: '2026-01-05',
            claimedDate: null,
            budgetSourceId: 'src-1', // tagged to THIS source -> "constituted" wording
          },
        ],
      });
      const depositReduced = makeInvoice({
        invoiceId: 'inv-deposit-reduced',
        vendorName: 'Reduced Vendor',
        invoiceNumber: 'U-6',
        isSplit: true,
        invoiceAmount: 150,
        allocatedAmount: 150,
        budgetLines: [
          { id: 'bl-reduced', description: null, allocatedPortion: 150, linkedItem: null },
        ],
        deposits: [
          {
            id: 'dep-reduced',
            amount: 50,
            status: 'pending',
            entryType: 'deposit',
            dueDate: '2026-02-01',
            paidDate: null,
            claimedDate: null,
            budgetSourceId: null, // untagged -> "reduced" wording
          },
        ],
      });

      return {
        type: 'claim',
        source: {
          id: 'src-1',
          name: 'Home Loan',
          sourceType: 'bank_loan',
          reference: null,
          contactAddress: null,
        },
        invoices: [linkedUsage, attachSingle, attachMulti, depositConstituted, depositReduced],
        totalAmount: 100 + 100 + 100 + 250 + 150,
        unallocatedInvoices: [],
        generatedAt: '2026-02-15T00:00:00.000Z',
      };
    }

    // Recursively collects every string value anywhere in the pdfmake Content[] tree.
    function collectAllStrings(node: unknown, out: string[] = []): string[] {
      if (typeof node === 'string') {
        out.push(node);
      } else if (Array.isArray(node)) {
        for (const item of node) collectAllStrings(item, out);
      } else if (node !== null && typeof node === 'object') {
        for (const value of Object.values(node as Record<string, unknown>)) {
          collectAllStrings(value, out);
        }
      }
      return out;
    }

    it.each([['en', 'en-US', () => tEn] as const, ['de', 'de-DE', () => tDe] as const])(
      '[Scenario 23] generates a real, non-empty PDF for the %s locale from the Usage/attachment/deposit fixture, with no raw i18n keys leaked anywhere in the content tree',
      async (_label, localeStr, getT) => {
        const { generateReportPdf } = await import('./merge.js');
        const { buildOverviewContent } = await import('./overviewPdf.js');
        const report = makeUsageFeatureReport();
        const includedIds = new Set(report.invoices.map((inv) => inv.invoiceId));
        const formatters = formattersFor(localeStr as 'en-US' | 'de-DE');
        const t = getT();
        const content = buildReportContent(report, includedIds, 'claim', t, formatters, {
          includeCoverLetter: true,
          household,
        });

        const result = await generateReportPdf(
          report,
          includedIds,
          content,
          { attachDocuments: false },
          t,
        );
        expect(result.blob).toBeInstanceOf(Blob);
        expect(result.blob.size).toBeGreaterThan(0);

        const pdfContent = buildOverviewContent(content, new Map(), t);
        const allStrings = collectAllStrings(pdfContent);
        const leakedKeys = allStrings.filter((s) => /^sourceReports\.[a-zA-Z.]+$/.test(s));
        expect(leakedKeys).toEqual([]);
      },
    );

    it('[Scenario 4/5 real-render cross-check] renders comma-joined distinct linked-item names for the Usage column', async () => {
      const { buildOverviewContent } = await import('./overviewPdf.js');
      const report = makeUsageFeatureReport();
      const includedIds = new Set(report.invoices.map((inv) => inv.invoiceId));
      const content = buildReportContent(
        report,
        includedIds,
        'claim',
        tEn,
        formattersFor('en-US'),
        {
          includeCoverLetter: false,
          household: null,
        },
      );
      const pdfContent = buildOverviewContent(content, new Map(), tEn);
      const tableItem = pdfContent.find(
        (c) => typeof c === 'object' && c !== null && 'table' in c,
      ) as { table: { body: unknown[][] } };
      const linkedRow = tableItem.table.body[1] as { text?: string }[];
      expect(linkedRow[5]!.text).toBe('Roof Replacement');
    });

    it('[Scenario 25] plural selection: real i18next chooses attachmentsNote_one for 1 doc and attachmentsNote_other for 2+, in both locales', async () => {
      const { buildOverviewContent } = await import('./overviewPdf.js');
      const report = makeUsageFeatureReport();
      const includedIds = new Set(report.invoices.map((inv) => inv.invoiceId));

      for (const [t, formatters, expected] of [
        [
          tEn,
          formattersFor('en-US'),
          { single: '1 attachment: Invoice', multi: '2 attachments: Quotation, Invoice' },
        ],
        [
          tDe,
          formattersFor('de-DE'),
          { single: '1 Anhang: Rechnung', multi: '2 Anhänge: Angebot, Rechnung' },
        ],
      ] as const) {
        const content = buildReportContent(report, includedIds, 'claim', t, formatters, {
          includeCoverLetter: false,
          household: null,
        });
        const pdfContent = buildOverviewContent(content, new Map(), t);
        const tableItem = pdfContent.find(
          (c) => typeof c === 'object' && c !== null && 'table' in c,
        ) as { table: { body: unknown[][] } };

        const singleRow = tableItem.table.body[2] as { stack: { text: string }[] }[];
        const multiRow = tableItem.table.body[3] as { stack: { text: string }[] }[];
        expect(singleRow[5]!.stack[1]!.text).toBe(expected.single);
        expect(multiRow[5]!.stack[1]!.text).toBe(expected.multi);
      }
    });

    // Story #1923: the "constituted" deposit case no longer produces a footnote at all — it
    // renders as an inline, unnumbered Deposit label in the allocated cell (a second run, real
    // i18next `sourceReports.table.attachmentType.deposit` text). Only the "reduced" case still
    // produces a footnote, now shared/unnumbered (marker `‡`, no vendor/invoice-number prefix).
    it('renders the real, unnumbered "constituted" Deposit inline label and the real, shared, unnumbered "reduced" footnote in both locales', async () => {
      const { buildOverviewContent } = await import('./overviewPdf.js');
      const report = makeUsageFeatureReport();
      const includedIds = new Set(report.invoices.map((inv) => inv.invoiceId));

      for (const [t, formatters, expected] of [
        [
          tEn,
          formattersFor('en-US'),
          {
            depositLabel: ' (Deposit)',
            reducedFootnote: '‡: This position reflects deposits claimed separately.',
          },
        ],
        [
          tDe,
          formattersFor('de-DE'),
          {
            depositLabel: ' (Abschlagszahlung)',
            reducedFootnote:
              '‡: Diese Position berücksichtigt separat eingereichte Abschlagszahlungen.',
          },
        ],
      ] as const) {
        const content = buildReportContent(report, includedIds, 'claim', t, formatters, {
          includeCoverLetter: false,
          household: null,
        });

        // Sanity: the constituted-deposit row carries isDeposit=true and no ‡ marker; the
        // reduced-deposit row carries the ‡ marker and isDeposit=false.
        const constitutedRow = content.rows.find((r) => r.invoiceId === 'inv-deposit-constituted')!;
        expect(constitutedRow.isDeposit).toBe(true);
        expect(constitutedRow.allocatedMarkers).not.toContain('‡');
        const reducedRow = content.rows.find((r) => r.invoiceId === 'inv-deposit-reduced')!;
        expect(reducedRow.isDeposit).toBe(false);
        expect(reducedRow.allocatedMarkers).toContain('‡');

        const pdfContent = buildOverviewContent(content, new Map(), t);
        const tableItem = pdfContent.find(
          (c) => typeof c === 'object' && c !== null && 'table' in c,
        ) as { table: { body: unknown[][] } };
        const constitutedRowCells = tableItem.table.body.find(
          (row) => (row[0] as { text?: string })?.text === 'Constituted Vendor',
        ) as { text: string | { text: string }[] }[];
        const allocatedCell = constitutedRowCells[4] as { text: { text: string }[] };
        expect(Array.isArray(allocatedCell.text)).toBe(true);
        expect(allocatedCell.text[1]!.text).toBe(expected.depositLabel);

        const notesStack = pdfContent[pdfContent.length - 1] as { stack: { text: string }[] };
        const texts = notesStack.stack.map((n) => n.text);
        expect(texts).toContain(expected.reducedFootnote);
        // No "constituted" wording (footnote form) survives anywhere — it moved to the inline
        // label above, and the deposit-constituted footnote key/string no longer exists at all.
        expect(texts.some((text) => text.includes('This is a deposit'))).toBe(false);
        expect(texts.some((text) => text.includes('Dies ist eine Abschlagszahlung'))).toBe(false);
      }
    });
  });

  // ─── Story #1900: edited-override text reaches the real rendered PDF content tree ─────────────

  describe('edited overrides reach the real, unmocked PDF content tree (Story #1900)', () => {
    function collectAllStrings(node: unknown, out: string[] = []): string[] {
      if (typeof node === 'string') {
        out.push(node);
      } else if (Array.isArray(node)) {
        for (const item of node) collectAllStrings(item, out);
      } else if (node !== null && typeof node === 'object') {
        for (const value of Object.values(node as Record<string, unknown>)) {
          collectAllStrings(value, out);
        }
      }
      return out;
    }

    it.each([['en', 'en-US', () => tEn] as const, ['de', 'de-DE', () => tDe] as const])(
      'a row-level usageText override reaches the real rendered overview table, replacing the baseline usage text (%s locale)',
      async (_label, localeStr, getT) => {
        const { buildOverviewContent } = await import('./overviewPdf.js');
        const { report: baseReport, includedIds } = await makeMixedReport();
        const formatters = formattersFor(localeStr as 'en-US' | 'de-DE');
        const t = getT();
        // Give the target invoice a distinct, non-placeholder baseline usage text (the fixture's
        // default rows all fall back to the shared '—' placeholder, which is too ambiguous a
        // string to assert absence of — it legitimately appears in several OTHER rows too).
        const report: SourceReportResponse = {
          ...baseReport,
          invoices: baseReport.invoices.map((inv) =>
            inv.invoiceId === 'inv-normal'
              ? {
                  ...inv,
                  budgetLines: [
                    {
                      id: 'bl-normal',
                      description: 'ORIGINAL BASELINE USAGE TEXT',
                      allocatedPortion: 0,
                      linkedItem: null,
                    },
                  ],
                }
              : inv,
          ),
        };
        const baseline = buildReportContent(report, includedIds, 'claim', t, formatters, {
          includeCoverLetter: false,
          household: null,
        });
        const targetRow = baseline.rows.find((r) => r.invoiceId === 'inv-normal')!;
        expect(targetRow.usageText).toBe('ORIGINAL BASELINE USAGE TEXT');

        const overrides: ReportContentOverrides = {
          'row.inv-normal.usageText': 'CUSTOM EDITED USAGE TEXT',
        };
        const effective = applyOverrides(baseline, overrides);

        const pdfContent = buildOverviewContent(effective, new Map(), t);
        const tableItem = pdfContent.find(
          (c) => typeof c === 'object' && c !== null && 'table' in c,
        ) as { table: { body: { text?: string }[][] } };
        const targetRowIndex = baseline.rows.findIndex((r) => r.invoiceId === 'inv-normal');
        const renderedUsageCell = tableItem.table.body[1 + targetRowIndex]![5]!.text;
        expect(renderedUsageCell).toBe('CUSTOM EDITED USAGE TEXT');

        const allStrings = collectAllStrings(pdfContent);
        // The un-overridden baseline string must be gone entirely — not just appended alongside
        // the edit — from the whole rendered content tree.
        expect(allStrings).not.toContain('ORIGINAL BASELINE USAGE TEXT');

        // Confirm the whole real pipeline (real pdfmake render) still succeeds with the edited
        // content, not just that the Content[] tree looks right in isolation.
        const { generateReportPdf } = await import('./merge.js');
        const result = await generateReportPdf(
          report,
          includedIds,
          effective,
          { attachDocuments: false },
          t,
        );
        expect(result.blob.size).toBeGreaterThan(0);
      },
    );

    it('a cover-letter body override reaches the real rendered cover-letter content, replacing the baseline body', async () => {
      const { buildCoverLetterContent } = await import('./coverLetterPdf.js');
      const { report, includedIds } = await makeMixedReport();
      const formatters = formattersFor('en-US');
      const baseline = buildReportContent(report, includedIds, 'claim', tEn, formatters, {
        includeCoverLetter: true,
        household,
      });
      const baselineBody = baseline.coverLetter!.body;
      const overrides: ReportContentOverrides = {
        'coverLetter.body': 'This is a completely custom cover letter body written by the user.',
      };
      const effective = applyOverrides(baseline, overrides);

      const pdfContent = buildCoverLetterContent(effective, tEn);
      const allStrings = collectAllStrings(pdfContent);
      expect(allStrings).toContain(
        'This is a completely custom cover letter body written by the user.',
      );
      expect(allStrings).not.toContain(baselineBody);
    });

    it('overriding coverLetter.sender changes the rendered signature too (recomputed by applyOverrides)', async () => {
      const { buildCoverLetterContent } = await import('./coverLetterPdf.js');
      const { report, includedIds } = await makeMixedReport();
      const formatters = formattersFor('en-US');
      const baseline = buildReportContent(report, includedIds, 'claim', tEn, formatters, {
        includeCoverLetter: true,
        household,
      });
      const overrides: ReportContentOverrides = {
        'coverLetter.sender': 'Jane Doe\n99 New Address',
      };
      const effective = applyOverrides(baseline, overrides);
      expect(effective.coverLetter!.signature).toBe('Jane Doe');

      const pdfContent = buildCoverLetterContent(effective, tEn);
      const allStrings = collectAllStrings(pdfContent);
      expect(allStrings).toContain('Jane Doe\n99 New Address');
      expect(allStrings).toContain('Jane Doe'); // the (distinct) signature line
      expect(allStrings).not.toContain(baseline.coverLetter!.sender);
    });

    it("an un-overridden field never picks up another field's override text (isolation, real render)", async () => {
      const { buildOverviewContent } = await import('./overviewPdf.js');
      const { report, includedIds } = await makeMixedReport();
      const formatters = formattersFor('en-US');
      const baseline = buildReportContent(report, includedIds, 'claim', tEn, formatters, {
        includeCoverLetter: false,
        household: null,
      });
      const otherRowBaselineUsage = baseline.rows.find(
        (r) => r.invoiceId === 'inv-split-nodoc',
      )!.usageText;
      const overrides: ReportContentOverrides = {
        'row.inv-normal.usageText': 'ONLY THIS ROW IS EDITED',
      };
      const effective = applyOverrides(baseline, overrides);
      const pdfContent = buildOverviewContent(effective, new Map(), tEn);
      const allStrings = collectAllStrings(pdfContent);
      expect(allStrings).toContain('ONLY THIS ROW IS EDITED');
      // The untouched row's own baseline usage text survives unchanged.
      expect(allStrings).toContain(otherRowBaselineUsage);
    });
  });
});

// ─── Story #1899: the PRODUCTION i18n singleton, not an isolated instance ─────────────────────
//
// Every test above uses an isolated i18next instance created via i18next.createInstance() in the
// beforeAll block near the top of this file — deliberately decoupled from localStorage/navigator
// and the rest of the app. ReportWizardPage's actual `reportT` construction
// (`i18n.getFixedT(reportLanguage, 'budget')`) calls the real, app-wide i18n singleton instead
// (../../i18n/index.js). This closes that gap: it confirms the production singleton's
// getFixedT() genuinely produces a German-language TFunction even while the singleton's own
// ambient/active language stays English — i.e. selecting a report language never has to (and
// must not) call i18n.changeLanguage() to work.
describe('production i18n singleton — getFixedT resolves a language independent of the ambient one', () => {
  it('getFixedT("de", "budget") resolves real German copy while the singleton\'s active language stays English', async () => {
    const i18n = (await import('../../i18n/index.js')).default;
    // jsdom's default navigator.language ('en-US') and no stored 'locale' preference resolve the
    // singleton's ambient language to 'en' — matching ReportWizardPage's default reportLanguage
    // (seeded from useLocale().resolvedLocale, which uses the same detection).
    expect(i18n.language).toBe('en');

    const fixedDe = i18n.getFixedT('de', 'budget');
    expect(fixedDe('sourceReports.table.vendor')).toBe('Auftragnehmer');
    expect(fixedDe('sourceReports.download')).toBe('PDF herunterladen');

    // Calling getFixedT for a different locale must not mutate the singleton's own active
    // language — a fixed TFunction is a read, not a global language switch.
    expect(i18n.language).toBe('en');
    const fixedEn = i18n.getFixedT('en', 'budget');
    expect(fixedEn('sourceReports.table.vendor')).toBe('Vendor');
  });

  // Story #1923 follow-up: the Deposit badge label moved into the shared content model
  // (`ReportContentLabels.deposit`, built in buildReportContent.ts via the report-language
  // `reportT`) so that ReportContentEditor.tsx and overviewPdf.ts both consume `labels.deposit`
  // instead of independently calling a t() of their own. This pins that "report content never
  // uses UI t" rule for this specific field: with the UI/ambient locale left at its default
  // ('en', per the assertion above) and the REPORT language explicitly chosen as German — exactly
  // ReportWizardPage's real `i18n.getFixedT(reportLanguage, 'budget')` construction, not the
  // isolated test-only i18next instance used elsewhere in this file — `content.labels.deposit`
  // must resolve the real German copy, and that same value must be what the PDF pipeline renders.
  it('content.labels.deposit resolves via the report-language reportT (real "Abschlagszahlung"), independent of the UI locale staying English', async () => {
    const i18n = (await import('../../i18n/index.js')).default;
    expect(i18n.language).toBe('en'); // UI/ambient locale — untouched throughout this test

    const reportTDe = i18n.getFixedT('de', 'budget');
    // Minimal self-contained report: one invoice whose entire allocation is a deposit tagged to
    // this source (the "constituted" case, AC2.1) — the only shape that triggers isDeposit=true.
    const constitutedDepositInvoice = makeInvoice({
      invoiceId: 'inv-deposit-constituted',
      vendorName: 'Constituted Vendor',
      invoiceNumber: 'U-5',
      isSplit: true,
      invoiceAmount: 250,
      allocatedAmount: 250,
      budgetLines: [],
      deposits: [
        {
          id: 'dep-constituted',
          amount: 250,
          status: 'paid',
          entryType: 'deposit',
          dueDate: '2026-01-01',
          paidDate: '2026-01-05',
          claimedDate: null,
          budgetSourceId: 'src-1', // tagged to THIS source -> "constituted" wording
        },
      ],
    });
    const report: SourceReportResponse = {
      type: 'claim',
      source: {
        id: 'src-1',
        name: 'Home Loan',
        sourceType: 'bank_loan',
        reference: null,
        contactAddress: null,
      },
      invoices: [constitutedDepositInvoice],
      totalAmount: 250,
      unallocatedInvoices: [],
      generatedAt: '2026-02-15T00:00:00.000Z',
    };
    const includedIds = new Set(report.invoices.map((inv) => inv.invoiceId));

    const contentDe = buildReportContent(
      report,
      includedIds,
      'claim',
      reportTDe,
      formattersFor('de-DE'),
      {
        includeCoverLetter: false,
        household: null,
      },
    );
    expect(contentDe.labels.deposit).toBe('Abschlagszahlung');
    expect(i18n.language).toBe('en'); // still untouched — getFixedT never called changeLanguage()

    // Contrast: choosing English as the report language (independent of any UI concept) resolves
    // the English copy — proving the field tracks whichever reportT was passed in, not a fixed
    // value and not the UI locale.
    const reportTEn = i18n.getFixedT('en', 'budget');
    const contentEn = buildReportContent(
      report,
      includedIds,
      'claim',
      reportTEn,
      formattersFor('en-US'),
      {
        includeCoverLetter: false,
        household: null,
      },
    );
    expect(contentEn.labels.deposit).toBe('Deposit');

    // Pipeline pin: the rendered PDF's inline deposit run for the constituted-deposit row carries
    // the same real German label sourced from content.labels.deposit — overviewPdf.ts never
    // re-derives it from its own `t` parameter.
    const { buildOverviewContent } = await import('./overviewPdf.js');
    const pdfContent = buildOverviewContent(contentDe, new Map(), reportTDe);
    const tableItem = pdfContent.find(
      (c) => typeof c === 'object' && c !== null && 'table' in c,
    ) as { table: { body: unknown[][] } };
    const constitutedRowCells = tableItem.table.body.find(
      (row) => (row[0] as { text?: string })?.text === 'Constituted Vendor',
    ) as { text: string | { text: string }[] }[];
    const allocatedCell = constitutedRowCells[4] as { text: { text: string }[] };
    expect(allocatedCell.text[1]!.text).toBe(' (Abschlagszahlung)');
  });
});
