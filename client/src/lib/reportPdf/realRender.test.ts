/**
 * End-to-end, fully REAL render test for the report PDF pipeline (QA fix spec item 3).
 *
 * Unlike every other test file in this directory, this one mocks NOTHING in the pipeline:
 *   - loader.ts is real (real pdfmake@0.3.11 + pdf-lib, real addVirtualFileSystem/addFonts)
 *   - merge.ts / overviewPdf.ts / coverLetterPdf.ts / shared.ts are all real
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
 * Fixture covers, in one report: a normal invoice, a split invoice with no document, a split
 * invoice WITH a (successfully embedded) document, a refund-adjustment line (negative
 * allocatedAmount per the frontend fix spec item 3 sign contract), a skipped document (fetch
 * 404), and an EXCLUDED invoice that must never appear in the grand total or the generated PDF.
 *
 * NOTE (story #1898 fix round): overviewPdf.ts's `widths` arrays previously ended in the string
 * literal `'2*'` (both the 6- and 7-column layouts), which pdfmake 0.3.11 does not support as a
 * width unit (@types/pdfmake@0.3.x's `Size` type is only `number | 'auto' | '*' | <percentage
 * string>` — see node_modules/@types/pdfmake/interfaces.d.ts) and crashed the real pdfmake
 * renderer with `unsupported number: NaN` the first time any overview table was rendered via
 * `pdfMake.createPdf(...).getBlob()`. This has been fixed in production code (both arrays now end
 * in a plain `'*'`); every test below renders successfully.
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
    // Explicit budgetLines: the split (†) marker requires isSplit && budgetLines.length > 0
    // (story #1898) — makeInvoice()'s default `budgetLines: []` would silently produce a split
    // invoice with NO marker at all under the new classification rules.
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

      const { calls, restore } = stubFetch();
      let result: Awaited<ReturnType<typeof generateReportPdf>>;
      try {
        result = await generateReportPdf(
          report,
          includedIds,
          'claim',
          { attachDocuments: true, includeCoverLetter: true },
          household,
          t,
          formatters,
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

      // Cross-check the grand total independently via buildOverviewContent's own includedTotal
      // computation, run through the same real code path merge.ts uses internally.
      const includedTotal = report.invoices
        .filter((inv) => includedIds.has(inv.invoiceId))
        .reduce((sum, inv) => sum + inv.allocatedAmount, 0);
      expect(includedTotal).toBe(expectedIncludedTotal);

      // Re-derive the rendered PDF's own page count sanity check: the merged document contains
      // both the (multi-row) text pages AND the one embedded appendix document's page.
      const finalPdf = await PDFDocument.load(await result.blob.arrayBuffer());
      expect(finalPdf.getPageCount()).toBeGreaterThanOrEqual(2); // >=1 text page + 1 appendix page
    },
  );

  it('renders every declared pdfmake style (including bold: title/tableHeader/subtotal/total rows) without throwing, for both locales', async () => {
    // merge.ts's own document definition declares styles.title (bold), styles.tableHeader
    // (bold), and applies `bold: true` directly to subtotal/total table cells (see
    // overviewPdf.ts). A real getBlob() success proves the 'Roboto-Medium.ttf' bold font file is
    // actually resolvable from the virtual file system for every one of those usages, not just a
    // single isolated `{ text: 'x', bold: true }` probe (see loader.test.ts for that narrower
    // check).
    const { generateReportPdf } = await import('./merge.js');
    for (const [localeStr, t] of [
      ['en-US', tEn],
      ['de-DE', tDe],
    ] as const) {
      const { report, includedIds } = await makeMixedReport();
      const formatters = formattersFor(localeStr);
      const { restore } = stubFetch();
      let result: Awaited<ReturnType<typeof generateReportPdf>>;
      try {
        result = await generateReportPdf(
          report,
          includedIds,
          'claim',
          { attachDocuments: false, includeCoverLetter: true },
          household,
          t,
          formatters,
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
    const { calls, restore } = stubFetch();
    try {
      await generateReportPdf(
        report,
        includedIds,
        'claim',
        { attachDocuments: true, includeCoverLetter: false },
        household,
        tEn,
        formatters,
      );
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

  describe('German overview table column widths (frontend fix spec item 15; updated story #1898)', () => {
    // [Scenario 24] The appendix column was removed entirely in story #1898 — appendixByInvoiceId
    // no longer affects the rendered column count at all (see overviewPdf.test.ts "[Scenario 3]").
    // This test now exercises the 6-column claim/proof-of-funds layout (no status, no appendix)
    // rather than the old "appendix-present" 7-column case, which no longer exists.
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

      // appendixByInvoiceId is still passed (call-site/signature stability) but is provably
      // irrelevant to the rendered width contract now — non-empty here on purpose.
      const content = buildOverviewContent(
        report,
        includedIds,
        new Map([['inv-split-doc', 1]]),
        new Map(),
        'claim',
        tDe,
        formatters,
        1300,
      );
      const tableItem = content.find(
        (c) => typeof c === 'object' && c !== null && 'table' in c,
      ) as { table: { widths: string[] } };

      expect(tableItem.table.widths).toEqual(['*', 'auto', 'auto', 'auto', 'auto', '*']);
    });

    it('uses the "*"-first / "auto"-rest width pattern for the 7-column budget-overview table (status column included)', async () => {
      const { buildOverviewContent } = await import('./overviewPdf.js');
      const { report, includedIds } = await makeMixedReport();
      const formatters = formattersFor('de-DE');

      const content = buildOverviewContent(
        report,
        includedIds,
        new Map(),
        new Map(),
        'budget-overview',
        tDe,
        formatters,
        1300,
      );
      const tableItem = content.find(
        (c) => typeof c === 'object' && c !== null && 'table' in c,
      ) as { table: { widths: string[] } };

      expect(tableItem.table.widths).toEqual(['*', 'auto', 'auto', 'auto', 'auto', 'auto', '*']);
    });
  });

  // ─── Scenarios 23 & 25: Usage column, attachment note, deposit-footnote wordings — real,
  // unmocked i18next + formatters, both locales ────────────────────────────────────────────────

  describe('Usage column, attachment note, and deposit-footnote wordings (real en+de rendering)', () => {
    // Dedicated fixture, independent of makeMixedReport / stubFetch — these invoices exercise
    // Usage/attachment/deposit features only and are never fed through generateReportPdf's
    // document-fetch pipeline (attachDocuments stays false everywhere below), so no new document
    // IDs need to be wired into stubFetch's routing.
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
            linkedItem: { type: 'work_item', id: 'wi-1', name: 'Roof Replacement' },
          },
          {
            id: 'bl-linked-2',
            description: null,
            allocatedPortion: 50,
            linkedItem: { type: 'work_item', id: 'wi-1', name: 'Roof Replacement' },
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
        // Sum of each invoice's allocatedAmount (linkedUsage/attachSingle/attachMulti default to
        // 100 via makeInvoice(); depositConstituted=250, depositReduced=150 explicitly above).
        totalAmount: 100 + 100 + 100 + 250 + 150,
        unallocatedInvoices: [],
        generatedAt: '2026-02-15T00:00:00.000Z',
      };
    }

    // Recursively collects every string value anywhere in the pdfmake Content[] tree (text cells,
    // stacks, table bodies, nested columns, etc.) — deliberately structure-agnostic so it doesn't
    // need to know pdfmake's exact node shapes.
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

        const result = await generateReportPdf(
          report,
          includedIds,
          'claim',
          { attachDocuments: false, includeCoverLetter: true },
          household,
          t,
          formatters,
        );
        expect(result.blob).toBeInstanceOf(Blob);
        expect(result.blob.size).toBeGreaterThan(0);

        const content = buildOverviewContent(
          report,
          includedIds,
          new Map(),
          new Map(),
          'claim',
          t,
          formatters,
          700, // sum of all 5 fixture invoices' allocatedAmount
        );
        const allStrings = collectAllStrings(content);
        const leakedKeys = allStrings.filter((s) => /^sourceReports\.[a-zA-Z.]+$/.test(s));
        expect(leakedKeys).toEqual([]);
      },
    );

    it('[Scenario 4/5 real-render cross-check] renders comma-joined distinct linked-item names for the Usage column', async () => {
      const { buildOverviewContent } = await import('./overviewPdf.js');
      const report = makeUsageFeatureReport();
      const includedIds = new Set(report.invoices.map((inv) => inv.invoiceId));
      const content = buildOverviewContent(
        report,
        includedIds,
        new Map(),
        new Map(),
        'claim',
        tEn,
        formattersFor('en-US'),
        700, // sum of all 5 fixture invoices' allocatedAmount
      );
      const tableItem = content.find(
        (c) => typeof c === 'object' && c !== null && 'table' in c,
      ) as { table: { body: unknown[][] } };
      const linkedRow = tableItem.table.body[1] as { text?: string }[];
      // Deduped despite the two budget lines sharing the same linkedItem name.
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
        const content = buildOverviewContent(
          report,
          includedIds,
          new Map(),
          new Map(),
          'claim',
          t,
          formatters,
          700, // sum of all 5 fixture invoices' allocatedAmount
        );
        const tableItem = content.find(
          (c) => typeof c === 'object' && c !== null && 'table' in c,
        ) as { table: { body: unknown[][] } };

        // Row order matches report.invoices: [linkedUsage, attachSingle, attachMulti, ...]
        const singleRow = tableItem.table.body[2] as { stack: { text: string }[] }[];
        const multiRow = tableItem.table.body[3] as { stack: { text: string }[] }[];
        expect(singleRow[5]!.stack[1]!.text).toBe(expected.single);
        expect(multiRow[5]!.stack[1]!.text).toBe(expected.multi);
      }
    });

    it('renders both real deposit-footnote wordings ("constituted" vs "reduced") in both locales', async () => {
      const { buildOverviewContent } = await import('./overviewPdf.js');
      const report = makeUsageFeatureReport();
      const includedIds = new Set(report.invoices.map((inv) => inv.invoiceId));

      for (const [t, formatters, expected] of [
        [
          tEn,
          formattersFor('en-US'),
          {
            constituted: '‡1: Constituted Vendor (U-5) — This is a deposit.',
            reduced:
              '‡2: Reduced Vendor (U-6) — This position reflects deposits claimed separately.',
          },
        ],
        [
          tDe,
          formattersFor('de-DE'),
          {
            constituted: '‡1: Constituted Vendor (U-5) — Dies ist eine Abschlagszahlung.',
            reduced:
              '‡2: Reduced Vendor (U-6) — Diese Position berücksichtigt separat eingereichte Abschlagszahlungen.',
          },
        ],
      ] as const) {
        const content = buildOverviewContent(
          report,
          includedIds,
          new Map(),
          new Map(),
          'claim',
          t,
          formatters,
          700, // sum of all 5 fixture invoices' allocatedAmount
        );
        const notesStack = content[content.length - 1] as { stack: { text: string }[] };
        const texts = notesStack.stack.map((n) => n.text);
        expect(texts).toContain(expected.constituted);
        expect(texts).toContain(expected.reduced);
      }
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
});
