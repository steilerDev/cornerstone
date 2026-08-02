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
 *
 * #1929 ROUND 2 (QA spec scenarios 16-22): this file now ALSO reads pdfmake's real resolved layout
 * back out of a render, rather than only asserting the declared `table.widths` array (which round
 * 1's architect review showed was a no-op guard — a 673pt-wide table can still satisfy a naive sum
 * check). Two techniques, both verified against pdfmake@0.3.11 source (architect review, MEDIUM 7 —
 * this file's own former comment claiming resolved widths were inaccessible via the public API was
 * WRONG and has been removed):
 *   1. `DocMeasure.js:611-614` mutates each `table.widths[i]` IN PLACE into a column object;
 *      `columnCalculator.js` then sets `._calcWidth` on it. Since `pdfMake.createPdf({content,...})`
 *      takes `content` BY REFERENCE, holding the exact object returned by `buildOverviewContent()`
 *      and passing it into `createPdf()` means `tableItem.table.widths[i]._calcWidth` is readable
 *      on that SAME reference after `await getBlob()` resolves.
 *   2. `LayoutBuilder.js:1182-1183` (`node.positions.push(positions)`) mutates each rendered CELL
 *      node the same way — every `{ text }` cell ends up with a `.positions` array carrying
 *      `.pageNumber` (`ElementWriter.js:285` / `DocumentContext.js:478-492`). A row that rendered
 *      whole on one page has every cell's `positions[0].pageNumber` identical.
 */
import { describe, it, expect, beforeAll } from '@jest/globals';
import i18next from 'i18next';
import type { TFunction } from 'i18next';
import { PDFDocument } from 'pdf-lib';
import type { Content } from 'pdfmake/build/pdfmake';
import type {
  SourceReportResponse,
  SourceReportInvoice,
  HouseholdSettings,
} from '@cornerstone/shared';
import type { Formatters } from '../formatters.js';
import { formatCurrency, formatDate } from '../formatters.js';
import { buildReportContent, applyOverrides } from '../reportContent/index.js';
import type { ReportContentOverrides, ReportContent } from '../reportContent/index.js';
import enBudget from '../../i18n/en/budget.json';
import deBudget from '../../i18n/de/budget.json';
import { loadPdfLibs } from './loader.js';
import { PDF_STYLES, PDF_DEFAULT_STYLE } from './merge.js';
import { buildPageHeader, buildPageFooter } from './shared.js';
import {
  PAGE_MARGIN_X,
  PAGE_TOP_MARGIN,
  PAGE_MARGIN_BOTTOM,
  tableOffsetsTotal,
  printableWidth,
} from './pageGeometry.js';
import {
  USAGE_MIN_WIDTH_7COL,
  USAGE_MIN_WIDTH_6COL,
  MAX_SAFE_USAGE_CHUNK_CHARS,
} from './overviewPdf.js';

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

// ─── #1929 round 2: shared real-render helpers (scenarios 16-22) ──────────────────────────────
//
// Renders a pdfmake Content[] tree through the REAL, unmocked pdfmake/loader pipeline, using the
// production `pageMargins`/`defaultStyle`/`styles` config (imported from pageGeometry.ts/merge.ts,
// never hand-copied — #1929 AC11 requires the render to match production's actual page setup).
// Crucially, `pdfContent` is passed BY REFERENCE and mutated in place by pdfmake during
// `getBlob()` — callers keep their own reference to `pdfContent` and read `._calcWidth`/
// `.positions` off it afterwards.
async function renderOverviewPdfContent(
  pdfContent: Content[],
  header: { tableTitle: string; sourceName: string },
  t: TFunction,
): Promise<void> {
  const { pdfMake } = await loadPdfLibs();
  const pdfDoc = pdfMake.createPdf({
    content: pdfContent,
    pageSize: 'A4',
    pageMargins: [PAGE_MARGIN_X, PAGE_TOP_MARGIN, PAGE_MARGIN_X, PAGE_MARGIN_BOTTOM],
    header: (currentPage: number) => {
      if (currentPage === 1) return null;
      return buildPageHeader(
        header.tableTitle,
        header.sourceName,
        t('sourceReports.table.generatedAt'),
      );
    },
    footer: buildPageFooter(t('sourceReports.table.pageLabel')),
    defaultStyle: PDF_DEFAULT_STYLE,
    styles: PDF_STYLES,
  });
  await pdfDoc.getBlob();
}

interface RenderedTable {
  widths: unknown[];
  body: unknown[][];
}

function findTableItem(pdfContent: Content[]): { table: RenderedTable } {
  const item = pdfContent.find((c) => typeof c === 'object' && c !== null && 'table' in c) as
    { table: RenderedTable } | undefined;
  if (!item) {
    throw new Error('Expected a table item in the rendered pdfContent tree');
  }
  return item;
}

// Reads the pdfmake-resolved `_calcWidth` off each declared column, AFTER a real render mutated
// `table.widths[i]` from a primitive into a column object holding it (DocMeasure.js:611-614 /
// columnCalculator.js). Throws loudly rather than silently reading `undefined` if called before
// rendering — a wrong call order here would otherwise produce a green test that measured nothing.
function calcWidthsOf(widths: unknown[]): number[] {
  return widths.map((w, i) => {
    const calc = (w as { _calcWidth?: number })._calcWidth;
    if (typeof calc !== 'number') {
      throw new Error(
        `widths[${i}]._calcWidth is not a number — was renderOverviewPdfContent() awaited on ` +
          'this exact pdfContent reference before reading widths?',
      );
    }
    return calc;
  });
}

// Reads the pdfmake-resolved page number a rendered cell landed on, from `.positions[0].pageNumber`
// (LayoutBuilder.js:1182-1183 / ElementWriter.js:285 / DocumentContext.js:478-492 — every node gets
// `.positions = []` and each rendered line pushes a position object with `.pageNumber`).
function cellPageNumber(cell: unknown): number {
  const positions = (cell as { positions?: { pageNumber: number }[] }).positions;
  if (!positions || positions.length === 0) {
    throw new Error('Cell has no .positions — was it actually rendered (non-empty text)?');
  }
  return positions[0]!.pageNumber;
}

function formattersFor(locale: 'en-US' | 'de-DE'): Formatters {
  return {
    formatCurrency: (n: number) => formatCurrency(n, locale, 'EUR'),
    formatDate: (d, fallback, monthStyle) => formatDate(d, locale, fallback, monthStyle),
  };
}

// #1929 round 2 (word-break follow-up finding): a Usage cell's `.text` is now ALWAYS an array of
// pdfmake text runs (`buildUsageTextRuns()` in overviewPdf.ts) — never a plain string, even for
// short text with no oversized token — because the runs array is how a single whitespace-free
// token can carry its own `wordBreak: 'break-all'` without affecting the rest of the cell. Every
// test in this file that used to read a Usage cell's `.text` directly as a string must reconstruct
// it by concatenating each run's own `.text` in order. Concatenation (not a joined-with-space) is
// correct because whitespace is preserved as its own run by `buildUsageTextRuns`' tokenizer.
function usageCellText(text: unknown): string {
  if (Array.isArray(text)) {
    return (text as { text: string }[]).map((run) => run.text).join('');
  }
  return text as string;
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

  describe('overview table column widths hold the fixed-point/single-trailing-star contract in both locales (frontend fix spec item 15; updated story #1898; regression #1929)', () => {
    // pdfmake's public Node API does not expose the LAYOUT ENGINE'S COMPUTED pixel widths for
    // 'auto' columns after createPdf()/getBlob() — there is no documented way to introspect the
    // resolved column widths of a generated PDF without re-implementing pdfmake's internal table
    // layout algorithm. This is flagged rather than silently skipped: true pixel-level
    // verification that label text never exceeds the printable width (A4 width 595.28pt - 40pt
    // left margin - 40pt right margin = 515.28pt) is NOT accessible via the public API in this
    // environment. What IS directly verifiable is the declared width contract that drives that
    // layout — overviewPdf.ts's own table.widths array, exercised here through the real,
    // unmocked buildOverviewContent with real translations — which is checked below.
    //
    // These assertions pin the INVARIANTS (no 'auto', exactly one trailing '*', fixed columns sum
    // under the printable width) rather than the exact numbers, so a future width nudge doesn't
    // re-break this test — see overviewPdf.test.ts for the unit-level equivalent. On current beta
    // both arrays are ['*','auto','auto','auto','auto',...,'*'] — five/six unbounded 'auto'
    // columns, which is exactly what caused #1929's right-edge overflow.
    const PRINTABLE_WIDTH_PT = 515.28;

    function assertWidthContract(widths: (string | number)[], expectedLength: number): void {
      expect(widths).toHaveLength(expectedLength);
      expect(widths[expectedLength - 1]).toBe('*'); // Usage is the sole trailing '*' column
      const fixedWidths = widths.slice(0, expectedLength - 1);
      expect(fixedWidths.every((w) => typeof w === 'number')).toBe(true);
      expect(widths.some((w) => w === 'auto')).toBe(false);
      const fixedSum = (fixedWidths as number[]).reduce((a, b) => a + b, 0);
      expect(fixedSum).toBeLessThanOrEqual(PRINTABLE_WIDTH_PT);
    }

    it.each([['de', 'de-DE', () => tDe] as const, ['en', 'en-US', () => tEn] as const])(
      'holds for the 6-column claim/proof-of-funds table in the %s locale',
      async (_label, localeStr, getT) => {
        const { buildOverviewContent } = await import('./overviewPdf.js');
        const { report, includedIds } = await makeMixedReport();
        const formatters = formattersFor(localeStr as 'en-US' | 'de-DE');
        const t = getT();
        const content = buildReportContent(report, includedIds, 'claim', t, formatters, {
          includeCoverLetter: false,
          household: null,
        });

        const pdfContent = buildOverviewContent(content, new Map(), t);
        const tableItem = pdfContent.find(
          (c) => typeof c === 'object' && c !== null && 'table' in c,
        ) as { table: { widths: (string | number)[] } };

        assertWidthContract(tableItem.table.widths, 6);
      },
    );

    it.each([['de', 'de-DE', () => tDe] as const, ['en', 'en-US', () => tEn] as const])(
      'holds for the 7-column budget-overview table (status column included) in the %s locale',
      async (_label, localeStr, getT) => {
        const { buildOverviewContent } = await import('./overviewPdf.js');
        const { report, includedIds } = await makeMixedReport();
        const formatters = formattersFor(localeStr as 'en-US' | 'de-DE');
        const t = getT();
        const content = buildReportContent(report, includedIds, 'budget-overview', t, formatters, {
          includeCoverLetter: false,
          household: null,
        });

        const pdfContent = buildOverviewContent(content, new Map(), t);
        const tableItem = pdfContent.find(
          (c) => typeof c === 'object' && c !== null && 'table' in c,
        ) as { table: { widths: (string | number)[] } };

        assertWidthContract(tableItem.table.widths, 7);
      },
    );
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
      const linkedRow = tableItem.table.body[1] as { text?: unknown }[];
      // #1929 round 2: Usage cell text is now always a run array (buildUsageTextRuns) — reconstruct
      // before comparing, not a shape regression (see usageCellText's own doc comment above).
      expect(usageCellText(linkedRow[5]!.text)).toBe('Roof Replacement');
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
        ) as { table: { body: { text?: unknown }[][] } };
        const targetRowIndex = baseline.rows.findIndex((r) => r.invoiceId === 'inv-normal');
        // #1929 round 2: Usage cell text is now always a run array (buildUsageTextRuns) —
        // reconstruct before comparing, not a shape regression.
        const renderedUsageCell = usageCellText(tableItem.table.body[1 + targetRowIndex]![5]!.text);
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

      // #1929 round 2: 'ONLY THIS ROW IS EDITED' no longer appears as a single leaf string in the
      // content tree — buildUsageTextRuns() always splits the Usage cell into per-token runs
      // (['ONLY', ' ', 'THIS', ...]), so a whole-document collectAllStrings().toContain() no longer
      // matches multi-word Usage text. Read each row's own Usage cell directly and reconstruct via
      // usageCellText() instead — a more precise check than the old blanket string search anyway.
      const tableItem = findTableItem(pdfContent);
      const targetRowIndex = baseline.rows.findIndex((r) => r.invoiceId === 'inv-normal');
      const otherRowIndex = baseline.rows.findIndex((r) => r.invoiceId === 'inv-split-nodoc');
      const editedRow = tableItem.table.body[1 + targetRowIndex] as { text?: unknown }[];
      const otherRow = tableItem.table.body[1 + otherRowIndex] as { text?: unknown }[];
      expect(usageCellText(editedRow[5]!.text)).toBe('ONLY THIS ROW IS EDITED');
      // The untouched row's own baseline usage text survives unchanged.
      expect(usageCellText(otherRow[5]!.text)).toBe(otherRowBaselineUsage);
    });
  });

  // ─── Regression #1929: multi-page render with long usage-description overrides ────────────────

  describe('multi-page render with long usage-description overrides (regression #1929)', () => {
    // #1929 round 2: this block's own collectAllStrings() helper was removed — after
    // buildUsageTextRuns() started splitting the Usage cell into per-token runs, a whole-document
    // string search can no longer match multi-word Usage text as a single leaf, so the data-loss
    // test below now reads each overridden row's Usage cell directly via usageCellText() (see the
    // module-level helper near findTableItem/calcWidthsOf/cellPageNumber).

    // Reused by both the pre-existing data-loss test below AND the new scenario-18 per-row
    // page-consistency test (#1929 round 2) — deliberately the SAME fixture the ux-designer used
    // to reproduce the round-1 CRITICAL "rows still split across pages" finding, per QA spec
    // scenario 18's explicit instruction to reuse it rather than build a fresh repro.
    function buildLongUsageFixture(): {
      report: SourceReportResponse;
      includedIds: Set<string>;
      effective: ReturnType<typeof buildReportContent>;
      longUsageText: string;
      overriddenIds: string[];
    } {
      // #1929 round 2 note: this fixture needed to grow from round 1's 15 invoices / 4 overrides.
      // Round 2's tighter layout (8pt body font vs 10pt, halved cell padding, a wider Usage
      // column) packs meaningfully more content per page than round 1's — the original 15/4
      // fixture that reliably forced 3+ pages under round 1 now renders in only 2. 35 invoices
      // with 8 long overrides restores a reliable 3+ page spread under the new, more
      // space-efficient layout.
      const invoices: SourceReportInvoice[] = Array.from({ length: 35 }, (_, i) =>
        makeInvoice({
          invoiceId: `inv-long-${i}`,
          vendorId: `vend-long-${i}`,
          vendorName: `Vendor ${i}`,
          invoiceNumber: `INV-${1000 + i}`,
          invoiceAmount: 100 + i,
          allocatedAmount: 100 + i,
        }),
      );
      const report: SourceReportResponse = {
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
        generatedAt: '2026-02-15T00:00:00.000Z',
      };
      const includedIds = new Set(invoices.map((inv) => inv.invoiceId));
      const formatters = formattersFor('en-US');
      const baseline = buildReportContent(report, includedIds, 'claim', tEn, formatters, {
        includeCoverLetter: false,
        household: null,
      });

      // A user could type any length of usage description in the editable report wizard — this
      // fixture string's length is a plain literal chosen to force wrapping across several lines,
      // NOT derived from any AI/validator length cap. (Issue #1931, developed in this same batch,
      // changes those caps; neither issue's tests may lean on the other's constants.)
      const longUsageText =
        'Materials and labor for the exterior renovation, including brick veneer, mortar mix, ' +
        'flashing, weatherproof membrane, and scaffolding rental for the extended installation ' +
        'period covering the north and west facades of the property, plus weekend crew overtime ' +
        'and equipment cleanup.';
      expect(longUsageText.length).toBeGreaterThanOrEqual(275);

      const overriddenIds = [
        'inv-long-0',
        'inv-long-5',
        'inv-long-10',
        'inv-long-15',
        'inv-long-20',
        'inv-long-25',
        'inv-long-30',
        'inv-long-34',
      ];
      const overrides: ReportContentOverrides = Object.fromEntries(
        overriddenIds.map((id) => [`row.${id}.usageText`, longUsageText]),
      );
      const effective = applyOverrides(baseline, overrides);

      return { report, includedIds, effective, longUsageText, overriddenIds };
    }

    it('renders a real, valid, 3+ page PDF with long overridden usage descriptions, with no data loss and no pdfmake crash', async () => {
      const { generateReportPdf } = await import('./merge.js');
      const { buildOverviewContent } = await import('./overviewPdf.js');
      const { report, includedIds, effective, longUsageText, overriddenIds } =
        buildLongUsageFixture();

      const result = await generateReportPdf(
        report,
        includedIds,
        effective,
        { attachDocuments: false },
        tEn,
      );
      expect(result.blob).toBeInstanceOf(Blob);
      expect(result.blob.size).toBeGreaterThan(0);

      // Loads as a genuinely valid, multi-page PDF — proves pagination actually occurred and the
      // real pdfmake render did not crash/truncate under the long-content, multi-row load.
      const pdfBytes = await result.blob.arrayBuffer();
      const pdfDoc = await PDFDocument.load(pdfBytes);
      expect(pdfDoc.getPageCount()).toBeGreaterThanOrEqual(3);

      // Content-tree level: the full, untruncated long usage string is present verbatim for every
      // overridden row — no silent truncation or data loss.
      //
      // #1929 round 2: the long usage string no longer appears as a single leaf in
      // collectAllStrings() output — buildUsageTextRuns() always splits the Usage cell into
      // per-token runs, so a whole-document exact-string search can never match multi-word text
      // any more (0 occurrences, by construction, not a data-loss regression). Read each
      // overridden invoice's own rendered Usage cell directly and reconstruct it via
      // usageCellText() instead — this is a MORE precise check than the old blanket search, since
      // it verifies the text landed on the correct row, not just somewhere in the tree.
      const pdfContent = buildOverviewContent(effective, new Map(), tEn);
      const tableItem = findTableItem(pdfContent);
      let reconstructedMatches = 0;
      for (const invoiceId of overriddenIds) {
        const vendorIndex = Number(invoiceId.split('-').pop());
        const row = tableItem.table.body.find(
          (r) => (r[0] as { text?: string })?.text === `Vendor ${vendorIndex}`,
        );
        if (!row) {
          throw new Error(`Could not find the rendered row for Vendor ${vendorIndex}`);
        }
        const usageCell = row[row.length - 1] as { text?: unknown };
        if (usageCellText(usageCell.text) === longUsageText) {
          reconstructedMatches++;
        }
      }
      expect(reconstructedMatches).toBe(overriddenIds.length);

      // NOTE (#1929 round 2): true pixel-level clipping/overlap verification is still not
      // accessible via pdfmake's public API, but per-page CONTENT placement now is (architect
      // review MEDIUM 7 — the earlier version of this comment claiming otherwise was wrong, and
      // has been removed). See the "real _calcWidth" describe block below for resolved column
      // widths, and the dedicated per-row page-consistency test directly below (same fixture) for
      // the direct negation of the ux-designer's CRITICAL "rows still split across pages" finding.
    });

    it('[scenario 18, regression #1929 round 2 / CRITICAL 1 for real] every overridden rows cells land on the SAME rendered page — reusing the exact fixture the ux-designer used to reproduce round 1s "orphaned cell" defect', async () => {
      const { buildOverviewContent } = await import('./overviewPdf.js');
      const { effective, overriddenIds } = buildLongUsageFixture();

      // A FRESH buildOverviewContent() call, so this test holds its own live reference to render
      // and mutate — generateReportPdf()'s internal call (used by the test above) builds its own
      // content array that isn't exposed to the caller.
      const pdfContent = buildOverviewContent(effective, new Map(), tEn);
      await renderOverviewPdfContent(
        pdfContent,
        { tableTitle: effective.tableTitle, sourceName: effective.sourceInfo.sourceName },
        tEn,
      );

      const tableItem = findTableItem(pdfContent);
      // 6-column claim shape: vendor, invoiceNumber, date, invoiceAmount, allocatedAmount, usage.
      expect(tableItem.table.widths).toHaveLength(6);

      for (const invoiceId of overriddenIds) {
        const vendorIndex = Number(invoiceId.split('-').pop());
        const expectedVendor = `Vendor ${vendorIndex}`;
        const row = tableItem.table.body.find(
          (r) => (r[0] as { text?: string })?.text === expectedVendor,
        );
        if (!row) {
          throw new Error(`Could not find the rendered row for ${expectedVendor}`);
        }
        const pageNumbers = row.map((cell) => cellPageNumber(cell));
        // On round-1 code (dontBreakRows on the layout object, inert), the ux-designer reproduced
        // exactly this fixture splitting Vendor 14's row across pages 2 -> 3: the vendor/invoice/
        // date/amount cells stayed on page 2 while the usage cell's tail spilled onto page 3,
        // leaving an orphaned, contextless fragment. Every cell in the row sharing one page number
        // is the direct proof that no longer happens.
        expect(new Set(pageNumbers).size).toBe(1);
      }
    });
  });

  // ─── #1929 round 2: real _calcWidth / worst-case content (scenarios 16-17) ───────────────────

  describe('real _calcWidth assertions against worst-case content, both table shapes and both locales (regression #1929 round 2, scenarios 16-17)', () => {
    const WORST_CASE_USAGE_TEXT =
      'Lieferung und Montage Wärmedämmverbundsystem inklusive Putzarbeiten';

    // Worst-case content per column, spread across a handful of rows (not required to all coincide
    // in a single row — pdfmake computes each column's width from the max content across ALL its
    // cells, so this stresses the same columns the architect measured): a long German vendor name
    // with a legal-entity suffix (VENDOR_WIDTH), a split invoice generating an allocated-cell
    // footnote marker PLUS a skip-footnote marker (multiple markers stacked), a constituted-deposit
    // invoice (deposit badge), a refund-adjustment invoice (refund note), and a Usage override set
    // to the architect's own measured worst-case German compound-noun phrase.
    function makeWorstCaseReport(): SourceReportResponse {
      const splitVendor = makeInvoice({
        invoiceId: 'inv-worst-split',
        vendorName: 'Bau- und Sanitärtechnik Schwarzwald e.K.',
        invoiceNumber: 'WORST-0001',
        isSplit: true,
        invoiceAmount: 1234.56,
        allocatedAmount: 987.65,
        budgetLines: [
          { id: 'bl-worst-1', description: null, allocatedPortion: 500, linkedItem: null },
          { id: 'bl-worst-2', description: null, allocatedPortion: 487.65, linkedItem: null },
        ],
      });
      const depositVendor = makeInvoice({
        invoiceId: 'inv-worst-deposit',
        vendorName: 'Elektro Müller GmbH & Co. KG',
        invoiceNumber: 'WORST-0002',
        isSplit: true,
        invoiceAmount: 500,
        allocatedAmount: 500,
        budgetLines: [],
        deposits: [
          {
            id: 'dep-worst',
            amount: 500,
            status: 'paid',
            entryType: 'deposit',
            dueDate: '2026-01-01',
            paidDate: '2026-01-05',
            claimedDate: null,
            budgetSourceId: 'src-1', // tagged to this source -> constituted deposit badge
          },
        ],
      });
      const refundVendor = makeInvoice({
        invoiceId: 'inv-worst-refund',
        vendorName: 'Refund Vendor GmbH',
        invoiceNumber: 'WORST-0003',
        lineKind: 'refund-adjustment',
        invoiceAmount: 200,
        allocatedAmount: -200,
      });
      const usageVendor = makeInvoice({
        invoiceId: 'inv-worst-usage',
        vendorName: 'Standard Vendor',
        invoiceNumber: 'WORST-0004',
        invoiceAmount: 300,
        allocatedAmount: 300,
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
        invoices: [splitVendor, depositVendor, refundVendor, usageVendor],
        totalAmount: 987.65 + 500 - 200 + 300,
        unallocatedInvoices: [],
        generatedAt: '2026-02-15T00:00:00.000Z',
      };
    }

    async function buildWorstCaseTableItem(
      useCase: 'budget-overview' | 'claim',
      localeStr: 'en-US' | 'de-DE',
      t: TFunction,
    ): Promise<{ table: RenderedTable; effective: ReturnType<typeof buildReportContent> }> {
      const { buildOverviewContent } = await import('./overviewPdf.js');
      const report = makeWorstCaseReport();
      const includedIds = new Set(report.invoices.map((inv) => inv.invoiceId));
      const formatters = formattersFor(localeStr);
      const baseline = buildReportContent(report, includedIds, useCase, t, formatters, {
        includeCoverLetter: false,
        household: null,
      });
      const overrides: ReportContentOverrides = {
        'row.inv-worst-usage.usageText': WORST_CASE_USAGE_TEXT,
      };
      const effective = applyOverrides(baseline, overrides);
      // Multiple stacked footnote markers on the split invoice's allocated cell (skip-footnote
      // *1 PREPENDED to its already-present split marker †).
      const skipped = new Map<string, string[]>([['inv-worst-split', ['footnoteFetchFailed']]]);
      const pdfContent = buildOverviewContent(effective, skipped, t);
      await renderOverviewPdfContent(
        pdfContent,
        { tableTitle: effective.tableTitle, sourceName: effective.sourceInfo.sourceName },
        t,
      );
      return { table: findTableItem(pdfContent).table, effective };
    }

    it.each([
      ['budget-overview', 7, USAGE_MIN_WIDTH_7COL, 'en', 'en-US', () => tEn] as const,
      ['budget-overview', 7, USAGE_MIN_WIDTH_7COL, 'de', 'de-DE', () => tDe] as const,
      ['claim', 6, USAGE_MIN_WIDTH_6COL, 'en', 'en-US', () => tEn] as const,
      ['claim', 6, USAGE_MIN_WIDTH_6COL, 'de', 'de-DE', () => tDe] as const,
    ])(
      '[scenario 16] %s table (%i cols, %s locale): tableOffsetsTotal(cols) + sum(real _calcWidth) fits the printable width, with worst-case content in every column',
      async (useCase, cols, _usageFloor, _label, localeStr, getT) => {
        const t = getT();
        const { table } = await buildWorstCaseTableItem(useCase, localeStr, t);
        expect(table.widths).toHaveLength(cols);

        const calcWidths = calcWidthsOf(table.widths);
        const totalCalcWidth = calcWidths.reduce((a, b) => a + b, 0);

        // The invariant that actually guards AC1 (architect review, CRITICAL 2 / HIGH 3): the
        // REAL, resolved rendered table width (offsets + every column's real _calcWidth) must fit
        // the A4 printable width — not the declared array summed in isolation, which round 1's
        // test satisfied while rendering a 673pt table on a 515.28pt page. +1pt epsilon for float
        // rounding, matching the QA spec's own tolerance.
        expect(tableOffsetsTotal(cols) + totalCalcWidth).toBeLessThanOrEqual(printableWidth() + 1);
      },
    );

    it.each([
      ['budget-overview', 7, USAGE_MIN_WIDTH_7COL, 'en', 'en-US', () => tEn] as const,
      ['budget-overview', 7, USAGE_MIN_WIDTH_7COL, 'de', 'de-DE', () => tDe] as const,
      ['claim', 6, USAGE_MIN_WIDTH_6COL, 'en', 'en-US', () => tEn] as const,
      ['claim', 6, USAGE_MIN_WIDTH_6COL, 'de', 'de-DE', () => tDe] as const,
    ])(
      '[scenario 17, AC3] %s table (%i cols, %s locale): the Usage columns real _calcWidth clears its measured floor',
      async (useCase, cols, usageFloor, _label, localeStr, getT) => {
        const t = getT();
        const { table } = await buildWorstCaseTableItem(useCase, localeStr, t);
        const calcWidths = calcWidthsOf(table.widths);
        const usageCalcWidth = calcWidths[calcWidths.length - 1]!;

        // AUTHORITATIVE measurement (per the round-2 spec: "qa-integration-tester's real-render
        // _calcWidth assertions are the authority, not the derivation comment"). If this comes in
        // BELOW the floor, this is a CODE_BUG under the Test Failure Debugging Protocol — do not
        // weaken this assertion; report the exact measured shortfall instead.
        expect(usageCalcWidth).toBeGreaterThanOrEqual(usageFloor);
      },
    );

    // #1929 round 2 review finding: WORST_CASE_USAGE_TEXT above reuses the architect's round-1
    // example ('Wärmedämmverbundsystem', ~23 chars) — comfortably under the Usage floor at 8pt, so
    // it never exercised the word-break path at all. AC2 permits breaking a word only when it is
    // wider than its column on its own; nothing tested that a token ACTUALLY wider than the column
    // still keeps the whole table inside printableWidth(). This fixture closes that gap: a single
    // unbroken run with no whitespace, deliberately longer than USAGE_SAFE_TOKEN_CHARS_7COL (32)
    // and _6COL (44) so buildUsageTextRuns() must flag it for `wordBreak: 'break-all'` in both
    // shapes — a constructed pathological compound, not real German (doesn't need to be).
    const PATHOLOGICAL_TOKEN = 'Supercalifragilisticexpialidociouscompoundwordwithnobreaks';

    async function buildPathologicalTokenTableItem(
      useCase: 'budget-overview' | 'claim',
      localeStr: 'en-US' | 'de-DE',
      t: TFunction,
    ): Promise<{ table: RenderedTable; effective: ReturnType<typeof buildReportContent> }> {
      const { buildOverviewContent } = await import('./overviewPdf.js');
      const report = makeWorstCaseReport();
      const includedIds = new Set(report.invoices.map((inv) => inv.invoiceId));
      const formatters = formattersFor(localeStr);
      const baseline = buildReportContent(report, includedIds, useCase, t, formatters, {
        includeCoverLetter: false,
        household: null,
      });
      const overrides: ReportContentOverrides = {
        'row.inv-worst-usage.usageText': PATHOLOGICAL_TOKEN,
      };
      const effective = applyOverrides(baseline, overrides);
      const pdfContent = buildOverviewContent(effective, new Map(), t);
      await renderOverviewPdfContent(
        pdfContent,
        { tableTitle: effective.tableTitle, sourceName: effective.sourceInfo.sourceName },
        t,
      );
      return { table: findTableItem(pdfContent).table, effective };
    }

    it.each([
      ['budget-overview', 7, 'en', 'en-US', () => tEn] as const,
      ['budget-overview', 7, 'de', 'de-DE', () => tDe] as const,
      ['claim', 6, 'en', 'en-US', () => tEn] as const,
      ['claim', 6, 'de', 'de-DE', () => tDe] as const,
    ])(
      '[#1929 round-2 review finding, AC1/AC2 negation] %s table (%i cols, %s locale): a single unbroken 58-char token wider than the Usage floor still fits the printable width, with the full token present verbatim (no character dropped)',
      async (useCase, cols, _label, localeStr, getT) => {
        const t = getT();
        expect(PATHOLOGICAL_TOKEN.length).toBeGreaterThanOrEqual(50);
        const { table } = await buildPathologicalTokenTableItem(useCase, localeStr, t);
        expect(table.widths).toHaveLength(cols);

        const calcWidths = calcWidthsOf(table.widths);
        const totalCalcWidth = calcWidths.reduce((a, b) => a + b, 0);

        // AC1: the real rendered table (offsets + every column's real _calcWidth) still fits the
        // printable width even with a token wider than the Usage column's own share — this is the
        // exact overflow CRITICAL 2 originally described, closed here by word-breaking rather than
        // widening the column (AC2's own permitted mechanism).
        expect(tableOffsetsTotal(cols) + totalCalcWidth).toBeLessThanOrEqual(printableWidth() + 1);

        // I1/AC2: no character of the pathological token was dropped by the break — reconstruct
        // the rendered Usage cell's runs and confirm the full token survives verbatim.
        const row = table.body.find((r) => (r[0] as { text?: string })?.text === 'Standard Vendor');
        if (!row) {
          throw new Error('Could not find the rendered row for the pathological-token invoice');
        }
        const usageCell = row[row.length - 1] as { text: unknown };
        expect(usageCellText(usageCell.text)).toBe(PATHOLOGICAL_TOKEN);

        // Confirm the run actually WAS flagged for word-break (proving the fix path was exercised,
        // not just that the token happened to fit) — every run reconstructs to the pathological
        // token's exact text, and at least one carries wordBreak: 'break-all'.
        const runs = usageCell.text as { text: string; wordBreak?: string }[];
        expect(runs.some((run) => run.wordBreak === 'break-all')).toBe(true);
      },
    );
  });

  // ─── #1929 round 2: AC12 boundary tests (scenario 19) ─────────────────────────────────────────

  describe('AC12 boundary tests: 600-char zero-degradation floor and the chunking ceiling (regression #1929 round 2, scenario 19)', () => {
    // Word-boundary-clean prose of an EXACT character length. A plain arithmetic construction —
    // NOT derived from any AI/validator length cap (#1929 AC12 explicitly forbids that coupling).
    function proseOfLength(exactLength: number): string {
      const words = [
        'Materialien',
        'und',
        'Arbeitsleistung',
        'für',
        'die',
        'Sanierung',
        'der',
        'Fassade',
        'einschließlich',
        'Dämmung',
        'sowie',
        'Gerüstbau',
        'im',
        'Erdgeschoss',
      ];
      let text = '';
      let i = 0;
      for (;;) {
        const word = words[i % words.length]!;
        const candidate = text.length === 0 ? word : `${text} ${word}`;
        if (candidate.length >= exactLength) {
          return candidate.slice(0, exactLength);
        }
        text = candidate;
        i++;
      }
    }

    function makeTwoInvoiceReport(): SourceReportResponse {
      const target = makeInvoice({
        invoiceId: 'inv-boundary-target',
        vendorName: 'Boundary Target Vendor',
        invoiceNumber: 'BOUND-1',
        invoiceAmount: 500,
        allocatedAmount: 500,
      });
      const other = makeInvoice({
        invoiceId: 'inv-boundary-other',
        vendorName: 'Other Vendor',
        invoiceNumber: 'BOUND-2',
        invoiceAmount: 100,
        allocatedAmount: 100,
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
        invoices: [target, other],
        totalAmount: 600,
        unallocatedInvoices: [],
        generatedAt: '2026-02-15T00:00:00.000Z',
      };
    }

    async function renderWithUsageOverride(
      usageText: string,
    ): Promise<{ table: RenderedTable; effective: ReturnType<typeof buildReportContent> }> {
      const { buildOverviewContent } = await import('./overviewPdf.js');
      const report = makeTwoInvoiceReport();
      const includedIds = new Set(report.invoices.map((inv) => inv.invoiceId));
      const formatters = formattersFor('en-US');
      const baseline = buildReportContent(report, includedIds, 'claim', tEn, formatters, {
        includeCoverLetter: false,
        household: null,
      });
      const overrides: ReportContentOverrides = {
        'row.inv-boundary-target.usageText': usageText,
      };
      const effective = applyOverrides(baseline, overrides);
      const pdfContent = buildOverviewContent(effective, new Map(), tEn);
      await renderOverviewPdfContent(
        pdfContent,
        { tableTitle: effective.tableTitle, sourceName: effective.sourceInfo.sourceName },
        tEn,
      );
      return { table: findTableItem(pdfContent).table, effective };
    }

    it('[scenario 19a, AC12 mandated floor] a single Usage override of exactly 600 characters renders as ONE table row, with the following row belonging to the other invoice (not an empty-leading-cells continuation)', async () => {
      const usageText = proseOfLength(600);
      expect(usageText.length).toBe(600);
      const { table } = await renderWithUsageOverride(usageText);

      const targetRowIndex = table.body.findIndex(
        (r) => (r[0] as { text?: string })?.text === 'Boundary Target Vendor',
      );
      expect(targetRowIndex).toBeGreaterThan(0);
      const nextRow = table.body[targetRowIndex + 1] as { text?: string }[];
      // The immediately-following row belongs to the OTHER invoice (its vendor cell is non-empty
      // and reads "Other Vendor") — not a blank-leading-cells continuation row.
      expect(nextRow[0]!.text).toBe('Other Vendor');

      // Every cell of the target row lands on the same page (single, unsplit row).
      const targetRow = table.body[targetRowIndex]!;
      const pageNumbers = targetRow.map((cell) => cellPageNumber(cell));
      expect(new Set(pageNumbers).size).toBe(1);
    });

    it(`[scenario 19b] a single Usage override of MAX_SAFE_USAGE_CHUNK_CHARS - 1 (${MAX_SAFE_USAGE_CHUNK_CHARS - 1}) characters also renders as ONE table row, on one page`, async () => {
      const usageText = proseOfLength(MAX_SAFE_USAGE_CHUNK_CHARS - 1);
      expect(usageText.length).toBe(MAX_SAFE_USAGE_CHUNK_CHARS - 1);
      const { table } = await renderWithUsageOverride(usageText);

      const targetRowIndex = table.body.findIndex(
        (r) => (r[0] as { text?: string })?.text === 'Boundary Target Vendor',
      );
      expect(targetRowIndex).toBeGreaterThan(0);
      const nextRow = table.body[targetRowIndex + 1] as { text?: string }[];
      expect(nextRow[0]!.text).toBe('Other Vendor');

      const targetRow = table.body[targetRowIndex]!;
      const pageNumbers = targetRow.map((cell) => cellPageNumber(cell));
      expect(new Set(pageNumbers).size).toBe(1);
    });

    it('[scenario 19, measured ceiling] a single Usage override of EXACTLY MAX_SAFE_USAGE_CHUNK_CHARS still renders as one row that lands entirely on one real page — the direct verification the architect asked for that the chosen chunking threshold is actually safe against the real printable height', async () => {
      const usageText = proseOfLength(MAX_SAFE_USAGE_CHUNK_CHARS);
      expect(usageText.length).toBe(MAX_SAFE_USAGE_CHUNK_CHARS);
      const { table } = await renderWithUsageOverride(usageText);

      const targetRowIndex = table.body.findIndex(
        (r) => (r[0] as { text?: string })?.text === 'Boundary Target Vendor',
      );
      expect(targetRowIndex).toBeGreaterThan(0);
      const nextRow = table.body[targetRowIndex + 1] as { text?: string }[];
      expect(nextRow[0]!.text).toBe('Other Vendor'); // still a single row, no continuation

      const targetRow = table.body[targetRowIndex]!;
      const pageNumbers = targetRow.map((cell) => cellPageNumber(cell));
      expect(new Set(pageNumbers).size).toBe(1);
    });

    it(`[scenario 19c] a single Usage override of MAX_SAFE_USAGE_CHUNK_CHARS * 4 (${MAX_SAFE_USAGE_CHUNK_CHARS * 4}) characters renders as MULTIPLE rows, does not throw, produces a PDF pdf-lib can load, and the full original string is recoverable by concatenating that invoices Usage cells in table order (I1 holds even when the row spans pages)`, async () => {
      const usageText = proseOfLength(MAX_SAFE_USAGE_CHUNK_CHARS * 4);
      const { generateReportPdf } = await import('./merge.js');
      const { buildOverviewContent } = await import('./overviewPdf.js');
      const report = makeTwoInvoiceReport();
      const includedIds = new Set(report.invoices.map((inv) => inv.invoiceId));
      const formatters = formattersFor('en-US');
      const baseline = buildReportContent(report, includedIds, 'claim', tEn, formatters, {
        includeCoverLetter: false,
        household: null,
      });
      const overrides: ReportContentOverrides = {
        'row.inv-boundary-target.usageText': usageText,
      };
      const effective = applyOverrides(baseline, overrides);

      // A bare `await` here is the correct "does not throw" assertion for an async call — wrapping
      // it in `expect(async () => {...}).not.toThrow()` would be a no-op (that matcher never awaits
      // the returned promise, so a rejection inside would surface as an unrelated unhandled
      // rejection instead of a test failure).
      const result = await generateReportPdf(
        report,
        includedIds,
        effective,
        { attachDocuments: false },
        tEn,
      );
      expect(result.blob.size).toBeGreaterThan(0);

      const pdfDoc = await PDFDocument.load(await result.blob.arrayBuffer());
      expect(pdfDoc.getPageCount()).toBeGreaterThanOrEqual(1);

      const pdfContent = buildOverviewContent(effective, new Map(), tEn);
      const tableItem = findTableItem(pdfContent);

      // The target invoice's contiguous row group: starts at its own (non-blank vendor) row, and
      // extends through every immediately-following continuation row (blank leading cell) up to
      // — but excluding — the next non-blank vendor row (the other invoice, or a summary row).
      const startIndex = tableItem.table.body.findIndex(
        (r) => (r[0] as { text?: string })?.text === 'Boundary Target Vendor',
      );
      expect(startIndex).toBeGreaterThan(0);
      let endIndex = startIndex + 1;
      while (
        endIndex < tableItem.table.body.length &&
        (tableItem.table.body[endIndex]![0] as { text?: string })?.text === ''
      ) {
        endIndex++;
      }
      const chunkRows = tableItem.table.body.slice(startIndex, endIndex);
      expect(chunkRows.length).toBeGreaterThan(1); // multiple rows, per AC12's "well over" side

      // #1929 round 2: each row's Usage cell `.text` is now a run array (buildUsageTextRuns), not
      // a plain string — reconstruct each row's runs before concatenating across rows.
      const reconstructed = chunkRows
        .map((row) => usageCellText((row[row.length - 1] as { text?: unknown })?.text ?? ''))
        .join('');
      expect(reconstructed).toBe(usageText);
    });
  });

  // ─── #1929 round 2: AC13 header-band smoke test (scenario 20) ─────────────────────────────────

  describe('AC13 smoke test: unbounded sourceName across 3+ pages (regression #1929 round 2, scenario 20)', () => {
    it('a report whose source name is ~70-100 characters (the architects own KfW example) generates successfully and loads as a valid multi-page PDF', async () => {
      const { generateReportPdf } = await import('./merge.js');
      // The architect's own #1929 review example (MEDIUM 5 / AC13) — credited here rather than
      // re-derived, since it's already the measured worst case for a two-line subheader wrap.
      // Actual length is 73 characters — bounds below are a sanity check on the literal, not a
      // derived constant.
      const longSourceName =
        'Kreditanstalt für Wiederaufbau Förderprogramm 261 Wohngebäude Kredit 4711';
      expect(longSourceName.length).toBeGreaterThanOrEqual(70);
      expect(longSourceName.length).toBeLessThanOrEqual(100);

      // 70 invoices with short usage text — chosen empirically against round 2's tighter,
      // more space-efficient layout (8pt font, halved padding, wider Usage column all pack more
      // per page than round 1's) to reliably force 3+ pages so the running header (the actual
      // AC13 concern, independent of table content) renders multiple times.
      const invoices: SourceReportInvoice[] = Array.from({ length: 70 }, (_, i) =>
        makeInvoice({
          invoiceId: `inv-ac13-${i}`,
          vendorId: `vend-ac13-${i}`,
          vendorName: `Vendor ${i}`,
          invoiceNumber: `AC13-${1000 + i}`,
          invoiceAmount: 100 + i,
          allocatedAmount: 100 + i,
        }),
      );
      const report: SourceReportResponse = {
        type: 'claim',
        source: {
          id: 'src-1',
          name: longSourceName,
          sourceType: 'bank_loan',
          reference: null,
          contactAddress: null,
        },
        invoices,
        totalAmount: invoices.reduce((sum, inv) => sum + inv.allocatedAmount, 0),
        unallocatedInvoices: [],
        generatedAt: '2026-02-15T00:00:00.000Z',
      };
      const includedIds = new Set(invoices.map((inv) => inv.invoiceId));
      const formatters = formattersFor('en-US');
      const content = buildReportContent(report, includedIds, 'claim', tEn, formatters, {
        includeCoverLetter: false,
        household: null,
      });
      expect(content.sourceInfo.sourceName).toBe(longSourceName);

      const result = await generateReportPdf(
        report,
        includedIds,
        content,
        { attachDocuments: false },
        tEn,
      );
      expect(result.blob.size).toBeGreaterThan(0);

      const pdfDoc = await PDFDocument.load(await result.blob.arrayBuffer());
      expect(pdfDoc.getPageCount()).toBeGreaterThanOrEqual(3);

      // NOTE: pixel-level clipping verification of the running header band itself still isn't
      // accessible via pdfmake's public API — pageGeometry.test.ts's headerFootprint()/
      // PAGE_TOP_MARGIN relationship assertions (budgeted for a TWO-LINE subheader specifically
      // because of this AC) are the actual AC13 correctness check; this test's job is only to
      // confirm the pipeline doesn't crash or truncate under an unbounded, wrapping sourceName.
    });
  });

  // ─── #1929 round 2: AC14 real-render (scenario 21) ─────────────────────────────────────────────

  describe('AC14 real-render: falsy statusText never crashes a real render (regression #1929 round 2, scenario 21)', () => {
    it('a budget-overview report with one invoice at statusText: "" alongside normal invoices does not throw "Malformed table row" and the blob loads', async () => {
      const { generateReportPdf } = await import('./merge.js');
      const normalInvoice = makeInvoice({
        invoiceId: 'inv-ac14-normal',
        vendorName: 'Normal Vendor',
        invoiceNumber: 'AC14-1',
        status: 'paid',
        invoiceAmount: 200,
        allocatedAmount: 200,
      });
      const emptyStatusInvoice = makeInvoice({
        invoiceId: 'inv-ac14-empty',
        vendorName: 'Empty Status Vendor',
        invoiceNumber: 'AC14-2',
        // 'status' intentionally left as a value buildReportContent will translate normally — the
        // falsy-statusText case is exercised directly at the content level below, since
        // buildReportContent always translates a real InvoiceStatus into non-empty text. AC14's
        // actual failure mode (a ReportContentRow with a falsy statusText reaching overviewPdf.ts)
        // is reproduced by hand-overriding the built row, matching how an edited/overridden
        // report could realistically carry an empty status string end-to-end.
        status: 'pending',
        invoiceAmount: 300,
        allocatedAmount: 300,
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
        invoices: [normalInvoice, emptyStatusInvoice],
        totalAmount: 500,
        unallocatedInvoices: [],
        generatedAt: '2026-02-15T00:00:00.000Z',
      };
      const includedIds = new Set(report.invoices.map((inv) => inv.invoiceId));
      const formatters = formattersFor('en-US');
      const baseline = buildReportContent(report, includedIds, 'budget-overview', tEn, formatters, {
        includeCoverLetter: false,
        household: null,
      });
      // Force the second row's statusText to '' directly on the built content — the exact
      // ReportContentRow shape AC14 guards against (overviewPdf.ts L~160 previously pushed only 6
      // cells against a 7-entry `widths` array whenever statusText was falsy).
      const effective: ReportContent = {
        ...baseline,
        rows: baseline.rows.map((row) =>
          row.invoiceId === 'inv-ac14-empty' ? { ...row, statusText: '' } : row,
        ),
      };
      expect(effective.rows.find((r) => r.invoiceId === 'inv-ac14-empty')?.statusText).toBe('');

      let result: Awaited<ReturnType<typeof generateReportPdf>> | undefined;
      let thrown: unknown;
      try {
        result = await generateReportPdf(
          report,
          includedIds,
          effective,
          { attachDocuments: false },
          tEn,
        );
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeUndefined();
      expect(result).toBeDefined();
      expect(result!.blob.size).toBeGreaterThan(0);

      const pdfDoc = await PDFDocument.load(await result!.blob.arrayBuffer());
      expect(pdfDoc.getPageCount()).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── #1929 round 2: AC10 confirm-only (scenario 22) ────────────────────────────────────────────

  describe('AC10 confirm-only: cover letter -> overview page break still holds (regression #1929 round 2, scenario 22)', () => {
    it('a report with a cover letter set renders at least 2 pages (the cover letter page(s) plus the overview page), unaffected by the round-2 geometry changes', async () => {
      const { generateReportPdf } = await import('./merge.js');
      const { report, includedIds } = await makeMixedReport();
      const formatters = formattersFor('en-US');
      const content = buildReportContent(report, includedIds, 'claim', tEn, formatters, {
        includeCoverLetter: true,
        household,
      });
      expect(content.coverLetter).not.toBeNull();

      const result = await generateReportPdf(
        report,
        includedIds,
        content,
        { attachDocuments: false }, // no attachment pages, isolates the cover-letter break itself
        tEn,
      );
      expect(result.blob.size).toBeGreaterThan(0);

      const pdfDoc = await PDFDocument.load(await result.blob.arrayBuffer());
      expect(pdfDoc.getPageCount()).toBeGreaterThanOrEqual(2);
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
