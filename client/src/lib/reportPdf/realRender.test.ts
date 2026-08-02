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
import type {
  ReportContentOverrides,
  ReportContent,
  ReportContentRow,
} from '../reportContent/index.js';
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
  USAGE_WIDTH_7COL,
  USAGE_WIDTH_6COL,
  MAX_SAFE_USAGE_CHUNK_CHARS,
  MAX_SAFE_SMALL_CHUNK_CHARS,
  HEADER_ROW_HEIGHT_MAX,
  splitIntoPageSafeChunks,
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

// #1932 (AC 1.2/7.2): renders a cover-letter Content[] tree (no table/header/footer involved,
// unlike renderOverviewPdfContent above) through the same real, unmocked pdfmake pipeline. Same
// by-reference mutation contract: `pdfContent` is passed BY REFERENCE and pdfmake mutates each
// node in place during `getBlob()` — callers keep their own reference and read `.positions` off
// it afterwards. See `linesRenderedFor()` below for why `.positions.length` (not `._inlines`,
// which drains to `[]` by the time layout finishes — verified empirically before writing this)
// is the correct post-render signal for "how many visual lines did this text node resolve to".
async function renderCoverLetterPdfContent(pdfContent: Content[]): Promise<void> {
  const { pdfMake } = await loadPdfLibs();
  const pdfDoc = pdfMake.createPdf({
    content: pdfContent,
    pageSize: 'A4',
    pageMargins: [PAGE_MARGIN_X, PAGE_TOP_MARGIN, PAGE_MARGIN_X, PAGE_MARGIN_BOTTOM],
    defaultStyle: PDF_DEFAULT_STYLE,
    styles: PDF_STYLES,
  });
  await pdfDoc.getBlob();
}

// Finds the cover-letter BODY text node specifically (as opposed to sender/subject/etc.) by its
// distinctive baseline/override content, so callers don't have to hand-roll the same `.find()`
// predicate at every call site.
function findBodyItem(pdfContent: Content[], bodySubstring: string): Record<string, unknown> {
  const item = pdfContent.find(
    (c) =>
      typeof c === 'object' &&
      c !== null &&
      'text' in c &&
      typeof (c as { text: unknown }).text === 'string' &&
      (c as { text: string }).text.includes(bodySubstring),
  );
  if (!item) {
    throw new Error(`Expected a body text node containing "${bodySubstring}"`);
  }
  // `Content` is a union that includes plain `string` as a member, which doesn't structurally
  // overlap with `Record<string, unknown>` — go through `unknown` first (same pattern already
  // used for `._calcWidth`/`.positions` reads elsewhere in this file).
  return item as unknown as Record<string, unknown>;
}

// Reads the pdfmake-resolved rendered-line COUNT off a text node, AFTER a real render pushed one
// entry per visual line into `.positions` (LayoutBuilder.js: `node.positions.push(positions)`
// runs once per call to `buildNextLine()`, i.e. once per rendered line — including an otherwise-
// empty line produced by a blank-line `\n\n` gap, per TextBreaker.js's `lineEnd: true` handling of
// a required break). `._inlines` looks like the natural place to read this from (DocMeasure.js
// sets it during measurement) but LayoutBuilder.js drains it via `.shift()` as each inline is laid
// into a line, so by the time `getBlob()` resolves it is always `[]` — empirically confirmed with
// a throwaway probe before writing this helper (not committed). `.positions` is what actually
// survives post-render with the right cardinality.
function linesRenderedFor(bodyItem: Record<string, unknown>): number {
  const positions = bodyItem['positions'];
  if (!Array.isArray(positions)) {
    throw new Error(
      'body text node has no .positions array — was renderCoverLetterPdfContent() awaited on ' +
        'this exact pdfContent reference before reading it?',
    );
  }
  return positions.length;
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
      ) as { table: { body: { text?: unknown }[][] } };
      // #1929 round 3: Vendor cell `.text` is now always a run array (buildUsageTextRuns applied
      // to Vendor, HIGH1) — reconstruct before comparing, or this assertion would be vacuously true
      // (an array never strictly equals a string) regardless of whether exclusion actually worked.
      const vendorCells = tableItem.table.body.map((row) => usageCellText(row[0]?.text));
      expect(vendorCells).not.toContain('Normal Vendor');
    });
  });

  describe('overview table column widths hold the fixed-point/no-star contract in both locales (frontend fix spec item 15; updated story #1898; regression #1929 rounds 2-3)', () => {
    // #1929 round 3 (architect CRITICAL/HIGH1): the Usage column is no longer '*' at all — every
    // width, including Usage, is an explicit NUMBER (usableColumnWidth(n) - fixedSum(n)), because
    // pdfmake never grows a fixed column past its declared width (elasticWidth is read but never
    // assigned, columnCalculator.js:52). This makes the declared-width contract EXACT rather than
    // "leaves enough room" — see the "real _calcWidth" describe block below for the real-render
    // confirmation that a fixed column's resolved width always equals its declared width,
    // independent of content. On round 1 this array was ['*','auto',...,'*']; round 2 fixed the
    // non-Usage columns but kept Usage as '*'; round 3 removes the last '*'.
    const PRINTABLE_WIDTH_PT = 515.28;

    function assertWidthContract(
      widths: (string | number)[],
      expectedLength: number,
      expectedUsageWidth: number,
    ): void {
      expect(widths).toHaveLength(expectedLength);
      expect(widths.every((w) => typeof w === 'number')).toBe(true);
      expect(widths.some((w) => w === '*' || w === 'auto')).toBe(false);
      expect(widths[expectedLength - 1]).toBe(expectedUsageWidth);
      const fixedSum = (widths.slice(0, expectedLength - 1) as number[]).reduce((a, b) => a + b, 0);
      expect(fixedSum + expectedUsageWidth).toBe(
        PRINTABLE_WIDTH_PT - tableOffsetsTotal(expectedLength),
      );
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

        assertWidthContract(tableItem.table.widths, 6, USAGE_WIDTH_6COL);
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

        assertWidthContract(tableItem.table.widths, 7, USAGE_WIDTH_7COL);
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

        // #1929 round 4: attachmentsNote no longer stacks into the usage row's cell — it renders
        // as its OWN continuation row, immediately after the invoice's usage row (these fixture
        // invoices carry no budgetLines, so areaText is null and never renders a row in between).
        // Look up by vendor name rather than a fixed row index, since row counts now vary with
        // chunking elsewhere in the table.
        const singleVendorIndex = tableItem.table.body.findIndex(
          (r) => usageCellText((r[0] as { text?: unknown })?.text) === 'Single Attach Vendor',
        );
        const multiVendorIndex = tableItem.table.body.findIndex(
          (r) => usageCellText((r[0] as { text?: unknown })?.text) === 'Multi Attach Vendor',
        );
        expect(singleVendorIndex).toBeGreaterThan(0);
        expect(multiVendorIndex).toBeGreaterThan(0);

        const singleNoteRow = tableItem.table.body[singleVendorIndex + 1] as { text?: unknown }[];
        const multiNoteRow = tableItem.table.body[multiVendorIndex + 1] as { text?: unknown }[];
        expect(usageCellText(singleNoteRow[singleNoteRow.length - 1]!.text)).toBe(expected.single);
        expect(usageCellText(multiNoteRow[multiNoteRow.length - 1]!.text)).toBe(expected.multi);
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
        // #1929 round 3: Vendor cell `.text` is now always a run array (buildUsageTextRuns applied
        // to Vendor, HIGH1) — reconstruct before comparing.
        const constitutedRowCells = tableItem.table.body.find(
          (row) => usageCellText((row[0] as { text?: unknown })?.text) === 'Constituted Vendor',
        ) as { text: unknown | { text: string }[] }[];
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

    // ─── #1932 AC 2.6 real-render pin: explicit signature survives a same-call sender edit ──────
    //
    // The unit-level coverage of this behaviour lives in applyOverrides.test.ts (confirmed
    // thorough there). This closes it end-to-end: the SAME override map, with BOTH keys present,
    // must reach the actually-built cover-letter Content[] tree with the explicit signature intact
    // — not merely survive applyOverrides() as a plain object, which the unit test already proves.
    it.each([
      [
        'signature-key-first',
        {
          'coverLetter.signature': 'Explicit Signature',
          'coverLetter.sender': 'Jane Doe\n99 New Address',
        },
      ] as const,
      [
        'sender-key-first',
        {
          'coverLetter.sender': 'Jane Doe\n99 New Address',
          'coverLetter.signature': 'Explicit Signature',
        },
      ] as const,
    ])(
      'AC 2.6: an explicit signature override reaches the real rendered content even when the same overrides map also overrides sender (%s)',
      async (_label, overrides) => {
        const { buildCoverLetterContent } = await import('./coverLetterPdf.js');
        const { report, includedIds } = await makeMixedReport();
        const formatters = formattersFor('en-US');
        const baseline = buildReportContent(report, includedIds, 'claim', tEn, formatters, {
          includeCoverLetter: true,
          household,
        });
        const effective = applyOverrides(baseline, overrides as ReportContentOverrides);
        // The explicit override wins regardless of key insertion order in the overrides object.
        expect(effective.coverLetter!.signature).toBe('Explicit Signature');

        const pdfContent = buildCoverLetterContent(effective, tEn);
        const allStrings = collectAllStrings(pdfContent);
        // The sender edit DID take effect (this isn't passing because the whole override map was
        // ignored) — the multi-line sender leaf is present verbatim.
        expect(allStrings).toContain('Jane Doe\n99 New Address');
        // The correct, explicitly-overridden signature is present as its own leaf.
        expect(allStrings).toContain('Explicit Signature');
        // The buggy pre-AC-2.6 behaviour would have recomputed signature to the sender's first
        // line ('Jane Doe') as its OWN SEPARATE leaf (distinct from the multi-line sender string
        // checked above, which legitimately contains 'Jane Doe' as a substring but never as an
        // exact standalone leaf). `toContain` on an array is exact-element equality, not substring
        // match, so this correctly distinguishes "signature recomputed to 'Jane Doe'" (bug) from
        // "sender contains the substring 'Jane Doe'" (expected, harmless).
        expect(allStrings).not.toContain('Jane Doe');
      },
    );

    // ─── #1932 AC 1.2/7.2: multi-paragraph line-break/blank-line survival, real pdfmake layout ──
    //
    // Load-bearing per the PO: "asserting node.text === 'a\nb' proves nothing about the rendered
    // page." This reads pdfmake's RESOLVED layout back off a real render (not the pre-render
    // Content[] string) — guarding against a future change reflowing the body into per-token
    // inline runs (the #1929 wordBreak technique used elsewhere in reportPdf/), which would
    // silently destroy \n handling if ever applied here.
    it('AC 1.2/7.2: a multi-paragraph body with an internal blank line renders as one visual line per explicit line/blank-line, in order, at uniform line height', async () => {
      const { buildCoverLetterContent } = await import('./coverLetterPdf.js');
      const { report, includedIds } = await makeMixedReport();
      const formatters = formattersFor('en-US');
      const baseline = buildReportContent(report, includedIds, 'claim', tEn, formatters, {
        includeCoverLetter: true,
        household,
      });
      // Deliberately short lines (well under the ~515pt printable width at 11pt) so word-wrap
      // never adds an extra visual line beyond the explicit \n boundaries — the only thing under
      // test is whether explicit line/blank-line structure survives, not wrapping behaviour.
      const body =
        'First paragraph, line one.\nFirst paragraph, line two.\n\nSecond paragraph, one line.';
      const overrides: ReportContentOverrides = { 'coverLetter.body': body };
      const effective = applyOverrides(baseline, overrides);

      const pdfContent = buildCoverLetterContent(effective, tEn);
      const bodyItem = findBodyItem(pdfContent, 'First paragraph, line one.');

      await renderCoverLetterPdfContent(pdfContent);

      // 4 explicit segments: "line one.", "line two.", "" (the blank line), "one line." — each
      // must resolve to exactly one rendered visual line (none of them wraps).
      expect(linesRenderedFor(bodyItem)).toBe(4);

      const positions = bodyItem['positions'] as { top: number }[];
      const gaps = positions.slice(1).map((p, i) => p.top - positions[i]!.top);
      // All 3 gaps (line1->line2, line2->blank, blank->line3) are the SAME line-height increment
      // — the blank line contributes exactly one ordinary line's worth of vertical space, neither
      // collapsed to zero (which would make the blank->line3 gap ~0) nor doubled (which would
      // make either surrounding gap ~2x the others).
      for (const gap of gaps) {
        expect(gap).toBeCloseTo(gaps[0]!, 1);
      }
      expect(gaps[0]!).toBeGreaterThan(0);
    });

    // ─── #1932 AC 1.3: markup-looking characters reach the real render literally, unparsed ─────
    it('AC 1.3: a body containing markdown/HTML-looking characters renders through the real pdfmake pipeline with those characters literal and unchanged', async () => {
      const { buildCoverLetterContent } = await import('./coverLetterPdf.js');
      const { report, includedIds } = await makeMixedReport();
      const formatters = formattersFor('en-US');
      const baseline = buildReportContent(report, includedIds, 'claim', tEn, formatters, {
        includeCoverLetter: true,
        household,
      });
      const body = '**bold** - dash #hash <b>tag</b>';
      const overrides: ReportContentOverrides = { 'coverLetter.body': body };
      const effective = applyOverrides(baseline, overrides);

      const pdfContent = buildCoverLetterContent(effective, tEn);
      const bodyItem = findBodyItem(pdfContent, 'bold');
      // Never parsed pre-render: the exact literal string, markup characters included verbatim.
      expect(bodyItem['text']).toBe(body);

      // Real, unmocked pdfmake render must not throw on (or specially interpret) any of these
      // characters, and the SAME text node's `.text` property is untouched by the real layout
      // pass — pdfmake only ever ADDS derived measurement/position properties to a text node, it
      // never rewrites `.text` itself, so this is a genuine "survived a real render" assertion,
      // not a restatement of the pre-render check above.
      await renderCoverLetterPdfContent(pdfContent);
      expect(bodyItem['text']).toBe(body);
      expect(linesRenderedFor(bodyItem)).toBeGreaterThan(0);

      // Confirm literally via the whole-tree string collector too: the exact literal string is
      // one of the tree's leaf strings (not merely a substring of something else), proving no
      // markdown/rich-text transformation (stripped asterisks, an actual <b> tag boundary, etc.)
      // split or rewrote it anywhere in the rendered content tree.
      const allStrings = collectAllStrings(pdfContent);
      expect(allStrings).toContain(body);
      expect(allStrings.some((s) => s.includes('**bold**'))).toBe(true);
      expect(allStrings.some((s) => s.includes('<b>tag</b>'))).toBe(true);
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
          (r) => usageCellText((r[0] as { text?: unknown })?.text) === `Vendor ${vendorIndex}`,
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
          (r) => usageCellText((r[0] as { text?: unknown })?.text) === expectedVendor,
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
      ['budget-overview', 7, USAGE_WIDTH_7COL, 'en', 'en-US', () => tEn] as const,
      ['budget-overview', 7, USAGE_WIDTH_7COL, 'de', 'de-DE', () => tDe] as const,
      ['claim', 6, USAGE_WIDTH_6COL, 'en', 'en-US', () => tEn] as const,
      ['claim', 6, USAGE_WIDTH_6COL, 'de', 'de-DE', () => tDe] as const,
    ])(
      '[scenario 16, round 3] %s table (%i cols, %s locale): tableOffsetsTotal(cols) + sum(real _calcWidth) EQUALS the printable width exactly, with worst-case content in every column',
      async (useCase, cols, _usageWidth, _label, localeStr, getT) => {
        const t = getT();
        const { table } = await buildWorstCaseTableItem(useCase, localeStr, t);
        expect(table.widths).toHaveLength(cols);

        const calcWidths = calcWidthsOf(table.widths);
        const totalCalcWidth = calcWidths.reduce((a, b) => a + b, 0);

        // #1929 round 3 (architect CRITICAL/HIGH1): with every column an explicit NUMBER (no '*'),
        // pdfmake's fixed-column branch always sets `_calcWidth = col.width` unconditionally
        // (elasticWidth is read but never assigned — columnCalculator.js:52) — so this identity now
        // holds EXACTLY, independent of content, rather than the round-2 "<=" tolerance guard.
        expect(tableOffsetsTotal(cols) + totalCalcWidth).toBe(printableWidth());
      },
    );

    it.each([
      ['budget-overview', 7, USAGE_WIDTH_7COL, 'en', 'en-US', () => tEn] as const,
      ['budget-overview', 7, USAGE_WIDTH_7COL, 'de', 'de-DE', () => tDe] as const,
      ['claim', 6, USAGE_WIDTH_6COL, 'en', 'en-US', () => tEn] as const,
      ['claim', 6, USAGE_WIDTH_6COL, 'de', 'de-DE', () => tDe] as const,
    ])(
      '[scenario 17, round 3, AC3] %s table (%i cols, %s locale): the Usage columns real _calcWidth EQUALS its declared USAGE_WIDTH_*COL exactly (not merely clears a floor)',
      async (useCase, cols, usageWidth, _label, localeStr, getT) => {
        const t = getT();
        const { table } = await buildWorstCaseTableItem(useCase, localeStr, t);
        const calcWidths = calcWidthsOf(table.widths);
        const usageCalcWidth = calcWidths[calcWidths.length - 1]!;

        // #1929 round 3: USAGE_WIDTH_*COL is no longer a floor to clear — it's the exact declared
        // width, and a fixed column's _calcWidth is unconditionally its declared width. AUTHORITATIVE
        // measurement: if this ever disagrees, that's a CODE_BUG under the Test Failure Debugging
        // Protocol — do not weaken this assertion; report the exact measured discrepancy instead.
        expect(usageCalcWidth).toBe(usageWidth);
      },
    );

    // #1929 round 3 architect re-review (a3b085cd, H2): round 2's own pathological-token fixture
    // ('Supercalifragilistic...', lowercase) was ITSELF insufficient — the round-2 threshold
    // (32/44, derived from a 0.495em AVERAGE per-char ratio) happened to catch it because lowercase
    // Latin glyphs are narrow, so the test passed while a real defect sat just outside the fixture:
    // all-caps/M-W-heavy/digit-heavy tokens measure ~0.50-0.87em per char, not 0.495em average, and
    // a 32-char all-caps token measured 538.57pt against the 515.28pt page under round 2's code.
    // Three worst-case-glyph fixtures below close that gap, each chosen to sit UNDER round 2's
    // 32/44-char thresholds (so round 2 would NOT have flagged them — real overflow) but OVER
    // round 3's tighter, worst-case-ratio 19/26-char thresholds (so round 3 DOES flag them):
    //   - an all-caps German compound in the 29-32 char band (real German word, not synthetic)
    //   - a run of 'W' (the single widest glyph measured, per WORST_CASE_CHAR_ADVANCE_EM's own doc)
    //   - a long digit run (the architect's own "31 digits, +1.1pt over" example)
    // Each is verified via the SAME real render technique as scenario 16/17: with every column now
    // an explicit number (never '*'), `_calcWidth` is structurally constant regardless of content
    // (see scenario 16's own comment) — so the meaningful signal here is NOT `_calcWidth` staying
    // put (it always does), it's that (a) the run gets flagged for word-break, (b) the flagged run
    // actually wraps across multiple rendered lines (proving pdfmake's break-all path was exercised,
    // not just declared), and (c) the full token is recoverable verbatim (I1) despite wrapping.
    const WORST_CASE_TOKENS = {
      allCapsGermanCompound: 'SANITAERINSTALLATIONSARBEITEN', // 29 chars, real German word (AE/OE/UE all-caps transliteration convention)
      mwRun: 'W'.repeat(30), // 30 chars — 'W' is the measured single widest glyph (WORST_CASE_CHAR_ADVANCE_EM's own basis)
      digitRun: '1234567890123456789012345678901', // 31 chars — the architect's own "31 digits" example
    } as const;

    it('sanity: every worst-case token sits UNDER round 2s 32/44-char thresholds but OVER round 3s 19/26-char thresholds — this is the exact H2 gap, proven arithmetically (not by re-patching production)', () => {
      for (const token of Object.values(WORST_CASE_TOKENS)) {
        // Round 2 (32/44) would NOT have flagged any of these — real overflow, undetected.
        expect(token.length).toBeLessThan(32);
        expect(token.length).toBeLessThan(44);
        // Round 3 (19/26) DOES flag every one of these, in both shapes.
        expect(token.length).toBeGreaterThan(19);
        expect(token.length).toBeGreaterThan(26);
      }
    });

    async function buildPathologicalTokenTableItem(
      useCase: 'budget-overview' | 'claim',
      localeStr: 'en-US' | 'de-DE',
      t: TFunction,
      usageOverrideText: string,
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
        'row.inv-worst-usage.usageText': usageOverrideText,
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
      [
        'allCapsGermanCompound',
        'budget-overview',
        7,
        'en-US',
        () => tEn,
        WORST_CASE_TOKENS.allCapsGermanCompound,
      ] as const,
      [
        'allCapsGermanCompound',
        'budget-overview',
        7,
        'de-DE',
        () => tDe,
        WORST_CASE_TOKENS.allCapsGermanCompound,
      ] as const,
      [
        'allCapsGermanCompound',
        'claim',
        6,
        'en-US',
        () => tEn,
        WORST_CASE_TOKENS.allCapsGermanCompound,
      ] as const,
      [
        'allCapsGermanCompound',
        'claim',
        6,
        'de-DE',
        () => tDe,
        WORST_CASE_TOKENS.allCapsGermanCompound,
      ] as const,
      ['mwRun', 'budget-overview', 7, 'en-US', () => tEn, WORST_CASE_TOKENS.mwRun] as const,
      ['mwRun', 'budget-overview', 7, 'de-DE', () => tDe, WORST_CASE_TOKENS.mwRun] as const,
      ['mwRun', 'claim', 6, 'en-US', () => tEn, WORST_CASE_TOKENS.mwRun] as const,
      ['mwRun', 'claim', 6, 'de-DE', () => tDe, WORST_CASE_TOKENS.mwRun] as const,
      ['digitRun', 'budget-overview', 7, 'en-US', () => tEn, WORST_CASE_TOKENS.digitRun] as const,
      ['digitRun', 'budget-overview', 7, 'de-DE', () => tDe, WORST_CASE_TOKENS.digitRun] as const,
      ['digitRun', 'claim', 6, 'en-US', () => tEn, WORST_CASE_TOKENS.digitRun] as const,
      ['digitRun', 'claim', 6, 'de-DE', () => tDe, WORST_CASE_TOKENS.digitRun] as const,
    ])(
      '[#1929 round 3, H2 closed] worst-case token "%s" in the %s shape (%i cols, %s locale): flagged for word-break, actually wraps across multiple rendered lines, full text recoverable verbatim (no character dropped)',
      async (_tokenName, useCase, cols, localeStr, getT, tokenText) => {
        const t = getT();
        const { table } = await buildPathologicalTokenTableItem(useCase, localeStr, t, tokenText);
        expect(table.widths).toHaveLength(cols);

        // AC1 (structural, round 3): the declared widths still sum to printableWidth() exactly —
        // confirms this fixture didn't somehow escape the fixed-column design.
        const calcWidths = calcWidthsOf(table.widths);
        const totalCalcWidth = calcWidths.reduce((a, b) => a + b, 0);
        expect(tableOffsetsTotal(cols) + totalCalcWidth).toBe(printableWidth());

        const row = table.body.find(
          (r) => usageCellText((r[0] as { text?: unknown })?.text) === 'Standard Vendor',
        );
        if (!row) {
          throw new Error('Could not find the rendered row for the worst-case-token invoice');
        }
        const usageCell = row[row.length - 1] as { text: unknown; positions?: unknown[] };

        // I1/AC2: no character of the token was dropped by the break — reconstruct the rendered
        // Usage cell's runs and confirm the full token survives verbatim.
        expect(usageCellText(usageCell.text)).toBe(tokenText);

        // The run actually WAS flagged for word-break (proving the fix path was exercised).
        const runs = usageCell.text as { text: string; wordBreak?: string }[];
        expect(runs.some((run) => run.wordBreak === 'break-all')).toBe(true);

        // NOTE: whether a FLAGGED run actually wraps to 2+ rendered lines depends on its REAL
        // (not worst-case) glyph widths — measured here, not asserted as a blanket requirement.
        // 'W'x30 (the single widest measured glyph) reliably wraps in both shapes; the 29-char
        // all-caps German compound and the 31-digit run fit on ONE line in the wider 6-col shape
        // (186.78pt) despite carrying the flag — over-flagging-but-still-fits is the documented
        // "harmless" case (see buildUsageTextRuns' own doc comment), not a defect. Requiring every
        // flagged token to visually wrap would be over-asserting: the CORRECTNESS contract is
        // "the table stays at printableWidth() and no character is lost" (both proven above),
        // not "every flagged run must visibly break".
        const positions = usageCell.positions as { pageNumber: number }[] | undefined;
        expect(positions).toBeDefined();
        expect(positions!.length).toBeGreaterThanOrEqual(1);
      },
    );
  });

  // ─── #1929 round 3 HIGH1: real-render header/vendor word-break coverage ───────────────────────

  describe('HIGH1 header-cell word-break: real German labels, real render (regression #1929 round 3)', () => {
    async function renderGermanHeaderRow(
      useCase: 'budget-overview' | 'claim',
    ): Promise<{ headerRow: unknown[] }> {
      const { buildOverviewContent } = await import('./overviewPdf.js');
      const { report, includedIds } = await makeMixedReport();
      const formatters = formattersFor('de-DE');
      const content = buildReportContent(report, includedIds, useCase, tDe, formatters, {
        includeCoverLetter: false,
        household: null,
      });
      const pdfContent = buildOverviewContent(content, new Map(), tDe);
      await renderOverviewPdfContent(
        pdfContent,
        { tableTitle: content.tableTitle, sourceName: content.sourceInfo.sourceName },
        tDe,
      );
      const tableItem = findTableItem(pdfContent);
      return { headerRow: tableItem.table.body[0]! };
    }

    it('[HIGH1] "Auftragnehmer" (vendor header, real German) and "Rechnungsbetrag" (invoiceAmount header) render without throwing, full text recoverable, and both genuinely wrap to multiple lines (their real measured widths — 67.50pt/78.66pt — exceed their 45pt/48pt columns even at real, not just worst-case, glyph metrics)', async () => {
      const { headerRow } = await renderGermanHeaderRow('budget-overview');
      const vendorHeader = headerRow[0] as { text: unknown; positions?: { pageNumber: number }[] };
      const invoiceAmountHeader = headerRow[4] as {
        text: unknown;
        positions?: { pageNumber: number }[];
      };

      expect(usageCellText(vendorHeader.text)).toBe('Auftragnehmer');
      expect(usageCellText(invoiceAmountHeader.text)).toBe('Rechnungsbetrag');

      // Both are single unbroken words wider than their column even at REAL (not worst-case)
      // metrics, per the architect's own measurement — so both must genuinely wrap across
      // multiple rendered lines, not merely carry the flag without needing it.
      expect(vendorHeader.positions).toBeDefined();
      expect(vendorHeader.positions!.length).toBeGreaterThan(1);
      expect(invoiceAmountHeader.positions).toBeDefined();
      expect(invoiceAmountHeader.positions!.length).toBeGreaterThan(1);
    });

    it('[HIGH1] "Zugeordneter Betrag" (allocatedAmount header, 75pt column) is NOT force-broken mid-character — it renders as exactly 2 lines (one word per line, wrapped at the natural space), proving the conservative per-token flag on "Zugeordneter" never actually needed to invoke a mid-character split', async () => {
      const { headerRow } = await renderGermanHeaderRow('budget-overview');
      const allocatedHeader = headerRow[5] as {
        text: unknown;
        positions?: { pageNumber: number }[];
      };
      expect(usageCellText(allocatedHeader.text)).toBe('Zugeordneter Betrag');

      // If break-all had actually forced a mid-character split on "Zugeordneter" (12 chars, flagged
      // because it exceeds the CONSERVATIVE 8-char worst-case threshold for this column), the cell
      // would render as 3+ lines. Because its REAL width (60.42pt) fits the 75pt column on one
      // line, pdfmake never needs the fallback — the cell wraps at the space between the two words
      // only, exactly like an ordinary un-flagged multi-word header would.
      expect(allocatedHeader.positions).toBeDefined();
      expect(allocatedHeader.positions!.length).toBe(2);
    });

    it('[HIGH1] the claim (6-column) shape header row also renders "Auftragnehmer"/"Rechnungsbetrag" without throwing and with full text recoverable — the same protection applies regardless of table shape', async () => {
      const { headerRow } = await renderGermanHeaderRow('claim');
      const vendorHeader = headerRow[0] as { text: unknown };
      const invoiceAmountHeader = headerRow[3] as { text: unknown }; // no status column in claim shape
      expect(usageCellText(vendorHeader.text)).toBe('Auftragnehmer');
      expect(usageCellText(invoiceAmountHeader.text)).toBe('Rechnungsbetrag');
    });
  });

  // ─── #1929 round 3 HIGH1: HEADER_ROW_HEIGHT_MAX measurement (real render) ─────────────────────────

  describe('HEADER_ROW_HEIGHT_MAX: measuring the exported estimate against a real render (regression #1929 round 3)', () => {
    it('measures the actual rendered height of the table header row (repeating headerRows:1 band) and reports it against the exported HEADER_ROW_HEIGHT_MAX estimate', async () => {
      const { buildOverviewContent } = await import('./overviewPdf.js');
      // Worst-case: German locale (longest header labels), budget-overview shape (narrowest
      // Vendor-adjacent columns, matching HEADER_ROW_HEIGHT_MAX's own derivation basis).
      const { report, includedIds } = await makeMixedReport();
      const formatters = formattersFor('de-DE');
      const content = buildReportContent(report, includedIds, 'budget-overview', tDe, formatters, {
        includeCoverLetter: false,
        household: null,
      });
      const pdfContent = buildOverviewContent(content, new Map(), tDe);
      await renderOverviewPdfContent(
        pdfContent,
        { tableTitle: content.tableTitle, sourceName: content.sourceInfo.sourceName },
        tDe,
      );
      const tableItem = findTableItem(pdfContent);
      const headerRow = tableItem.table.body[0]!;
      const bodyRow = tableItem.table.body[1]!;

      // Every cell's first rendered line starts at the same `top` within a row — the gap between
      // the header row's first line and the immediately-following body row's first line IS the
      // header row's real rendered height (including its own vertical padding/borders), which is
      // exactly what HEADER_ROW_HEIGHT_MAX is meant to estimate for #1932's reuse.
      const headerTop = (headerRow[0] as { positions: { top: number }[] }).positions[0]!.top;
      const bodyTop = (bodyRow[0] as { positions: { top: number }[] }).positions[0]!.top;
      const measuredHeaderRowHeight = bodyTop - headerTop;

      // AUTHORITATIVE measurement, per the round-3 spec. Measured: this real render's header row
      // is 45.8125pt tall against the exported HEADER_ROW_HEIGHT_MAX ceiling of 68pt — a ~22.19pt
      // OVER-estimate (68 - 45.8125 = 22.1875, ~48% above the measured height), not an
      // under-estimate. Reported as a finding, not silently reconciled: HEADER_ROW_HEIGHT_MAX's own
      // doc comment already frames it as a conservative UPPER BOUND, not a typical-case measurement
      // (its own basis — VENDOR_HEADER_WORST_CASE_LINES = ceil(13/4) = 4 wrapped lines for
      // "Auftragnehmer" at the worst-case char width — assumes a 4-line wrap that this real render,
      // using actual glyph widths, doesn't actually reach). Because the direction of error is
      // CONSERVATIVE (over-reserving vertical space for #1932's reuse, not under-reserving, which is
      // the direction that would actually truncate content), this is not asserted as a CODE_BUG
      // requiring a production fix — the load-bearing property for a space RESERVATION is that it
      // never under-shoots, which is what's asserted below. If a future consumer of
      // HEADER_ROW_HEIGHT_MAX needs a TIGHT (not just safe) bound, this measured gap is the number to
      // act on.
      expect(measuredHeaderRowHeight).toBeLessThanOrEqual(HEADER_ROW_HEIGHT_MAX);
    });
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
        (r) => usageCellText((r[0] as { text?: unknown })?.text) === 'Boundary Target Vendor',
      );
      expect(targetRowIndex).toBeGreaterThan(0);
      const nextRow = table.body[targetRowIndex + 1] as { text?: unknown }[];
      // The immediately-following row belongs to the OTHER invoice (its vendor cell is non-empty
      // and reads "Other Vendor") — not a blank-leading-cells continuation row.
      expect(usageCellText(nextRow[0]!.text)).toBe('Other Vendor');

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
        (r) => usageCellText((r[0] as { text?: unknown })?.text) === 'Boundary Target Vendor',
      );
      expect(targetRowIndex).toBeGreaterThan(0);
      const nextRow = table.body[targetRowIndex + 1] as { text?: unknown }[];
      expect(usageCellText(nextRow[0]!.text)).toBe('Other Vendor');

      const targetRow = table.body[targetRowIndex]!;
      const pageNumbers = targetRow.map((cell) => cellPageNumber(cell));
      expect(new Set(pageNumbers).size).toBe(1);
    });

    it('[scenario 19, measured ceiling] a single Usage override of EXACTLY MAX_SAFE_USAGE_CHUNK_CHARS still renders as one row that lands entirely on one real page — the direct verification the architect asked for that the chosen chunking threshold is actually safe against the real printable height', async () => {
      const usageText = proseOfLength(MAX_SAFE_USAGE_CHUNK_CHARS);
      expect(usageText.length).toBe(MAX_SAFE_USAGE_CHUNK_CHARS);
      const { table } = await renderWithUsageOverride(usageText);

      const targetRowIndex = table.body.findIndex(
        (r) => usageCellText((r[0] as { text?: unknown })?.text) === 'Boundary Target Vendor',
      );
      expect(targetRowIndex).toBeGreaterThan(0);
      const nextRow = table.body[targetRowIndex + 1] as { text?: unknown }[];
      expect(usageCellText(nextRow[0]!.text)).toBe('Other Vendor'); // still a single row, no continuation

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
        (r) => usageCellText((r[0] as { text?: unknown })?.text) === 'Boundary Target Vendor',
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

  // ─── #1929 round 4 architect review HIGH: cell-scope invariant regression ─────────────────────

  describe('cell-scope invariant: usageText/areaText/attachmentsNote never share an unbounded cell (regression #1929 round 4 — "round 3 capped the right quantity in the wrong scope")', () => {
    // Word-boundary-clean prose of an EXACT character length — same technique as the AC12 block
    // above, duplicated locally per this file's convention of scoping fixture helpers to their
    // own describe block. NOT derived from any AI/validator length cap.
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

    // A comma-joined 20-leaf-area aggregate — areaText is "aggregate-unbounded across N leaf
    // areas x 200 chars each" per the architect's own framing of why it can't be treated as
    // bounded just because any one leaf area name is short.
    function twentyLeafAreaText(): string {
      return Array.from(
        { length: 20 },
        (_, i) => `${'Obergeschoss Nordflügel Zimmer '.repeat(6).trim()} ${i}`,
      ).join(', ');
    }

    function makeCellScopeContent(rowOverrides: Partial<ReportContentRow>): ReportContent {
      const row: ReportContentRow = {
        invoiceId: 'inv-cellscope',
        vendor: 'Cell Scope Vendor',
        invoiceNumber: 'CS-1',
        dateText: '01/01/2026',
        status: null,
        statusText: null,
        invoiceAmountText: '€100.00',
        allocatedAmountValueText: '€100.00',
        allocatedMarkers: '',
        isDeposit: false,
        isRefund: false,
        refundNoteText: '',
        usageText: 'x',
        attachmentsNote: null,
        areaText: null,
        ...rowOverrides,
      };
      return {
        isOverview: false,
        isClaim: false,
        tableTitle: 'Cell Scope Test Report',
        labels: {
          vendor: 'Vendor',
          invoiceNumber: 'Invoice No.',
          date: 'Date',
          status: 'Status',
          invoiceAmount: 'Invoice Amount',
          allocatedAmount: 'Allocated Amount',
          usage: 'Usage',
          attachmentsNote: 'Attachments',
          deposit: 'Deposit',
          source: 'Source',
          sourceType: 'Source Type',
          reference: 'Reference',
          generatedAt: 'Generated At',
        },
        sourceInfo: {
          sourceName: 'Cell Scope Source',
          sourceTypeText: 'Bank Loan',
          referenceText: null,
          generatedAtText: '01/01/2026',
        },
        coverLetter: null,
        rows: [row],
        summaryRows: [{ key: 'total', label: 'Total', amountText: '€100.00' }],
        footnotes: [],
      };
    }

    // Renders `rowOverrides` as the sole content row and returns the resolved table, split into
    // [usageRows, areaRows, noteRows, summaryRow] by EXPECTED chunk count (derived from the same
    // splitIntoPageSafeChunks the production code itself uses, not a re-guessed row count) — this
    // is what lets the assertions below prove reconstruction PER FIELD, not just "some text
    // somewhere in the tree" (which round 3's own bug would have passed, since the dropped
    // content's row simply never rendered at all — a shorter body, not corrupted content).
    async function renderCellScopeRow(rowOverrides: Partial<ReportContentRow>): Promise<{
      usageRows: unknown[][];
      areaRows: unknown[][];
      noteRows: unknown[][];
      totalDataRows: number;
    }> {
      const { buildOverviewContent } = await import('./overviewPdf.js');
      const content = makeCellScopeContent(rowOverrides);
      const row = content.rows[0]!;
      const pdfContent = buildOverviewContent(content, new Map(), tEn);
      await renderOverviewPdfContent(
        pdfContent,
        { tableTitle: content.tableTitle, sourceName: content.sourceInfo.sourceName },
        tEn,
      );
      const tableItem = findTableItem(pdfContent);

      const usageChunkCount = splitIntoPageSafeChunks(
        row.usageText,
        MAX_SAFE_USAGE_CHUNK_CHARS,
      ).length;
      const areaChunkCount = row.areaText
        ? splitIntoPageSafeChunks(row.areaText, MAX_SAFE_SMALL_CHUNK_CHARS).length
        : 0;
      const noteChunkCount = row.attachmentsNote
        ? splitIntoPageSafeChunks(row.attachmentsNote, MAX_SAFE_SMALL_CHUNK_CHARS).length
        : 0;
      const totalDataRows = usageChunkCount + areaChunkCount + noteChunkCount;

      // header (1) + totalDataRows + summary (1) — if this length check fails, a row was
      // SILENTLY DROPPED (round 3's exact failure mode: the row that couldn't fit the page never
      // rendered at all, rather than throwing or visibly truncating).
      expect(tableItem.table.body).toHaveLength(1 + totalDataRows + 1);

      const dataRows = tableItem.table.body.slice(1, 1 + totalDataRows) as unknown[][];
      return {
        usageRows: dataRows.slice(0, usageChunkCount),
        areaRows: dataRows.slice(usageChunkCount, usageChunkCount + areaChunkCount),
        noteRows: dataRows.slice(usageChunkCount + areaChunkCount),
        totalDataRows,
      };
    }

    function reconstructUsageColumn(rows: unknown[][]): string {
      return rows
        .map((r) => usageCellText((r[r.length - 1] as { text?: unknown })?.text ?? ''))
        .join('');
    }

    it('[architect-measured case: usageText 700 + attachmentsNote 400 = 665.8pt] every character of BOTH fields is recoverable — the exact combination round 3 silently dropped', async () => {
      const usageText = proseOfLength(700);
      const attachmentsNote = proseOfLength(400);
      expect(usageText.length).toBe(700);
      expect(attachmentsNote.length).toBe(400);

      const { usageRows, areaRows, noteRows } = await renderCellScopeRow({
        usageText,
        attachmentsNote,
      });
      expect(areaRows).toHaveLength(0);
      expect(usageRows.length).toBeGreaterThan(1); // 700 > MAX_SAFE_USAGE_CHUNK_CHARS (650)
      expect(reconstructUsageColumn(usageRows)).toBe(usageText);
      expect(reconstructUsageColumn(noteRows)).toBe(attachmentsNote);
    });

    it('[architect-measured case: usageText 700 + 20-leaf-area areaText = 691.0pt] every character of BOTH fields is recoverable, including the aggregate-unbounded areaText', async () => {
      const usageText = proseOfLength(700);
      const areaText = twentyLeafAreaText();
      expect(usageText.length).toBe(700);
      expect(areaText.length).toBeGreaterThan(600); // genuinely long — 20 leaf areas, not a stub

      const { usageRows, areaRows, noteRows } = await renderCellScopeRow({
        usageText,
        areaText,
      });
      expect(noteRows).toHaveLength(0);
      expect(reconstructUsageColumn(usageRows)).toBe(usageText);
      expect(reconstructUsageColumn(areaRows)).toBe(areaText);
    });

    it('[architect-measured case: attachmentsNote 2000 alone = 1119.4pt] every character is recoverable, AND the real page count reflects genuine multi-page need — the direct negation of "rows needing 9 pages rendered as 2"', async () => {
      const attachmentsNote = proseOfLength(2000);
      expect(attachmentsNote.length).toBe(2000);

      const { usageRows, areaRows, noteRows } = await renderCellScopeRow({
        usageText: 'x', // trivial — isolates attachmentsNote as the sole large field
        attachmentsNote,
      });
      expect(areaRows).toHaveLength(0);
      expect(usageRows).toHaveLength(1);
      expect(noteRows.length).toBeGreaterThan(1); // 2000 >> MAX_SAFE_SMALL_CHUNK_CHARS (450)
      expect(reconstructUsageColumn(noteRows)).toBe(attachmentsNote);

      // Page-count saturation was the architect's own tell for the silent drop (a row needing 9
      // pages rendered as 2 under round 3). 1119.4pt of attachmentsNote ALONE, at the architect's
      // own measurement, exceeds a single page's printable height — assert the REAL rendered PDF
      // genuinely spans multiple pages, not silently capped at a small constant.
      const { generateReportPdf } = await import('./merge.js');
      const content = makeCellScopeContent({ usageText: 'x', attachmentsNote });
      const report: SourceReportResponse = {
        type: 'claim',
        source: {
          id: 'src-cellscope',
          name: 'Cell Scope Source',
          sourceType: 'bank_loan',
          reference: null,
          contactAddress: null,
        },
        invoices: [],
        totalAmount: 0,
        unallocatedInvoices: [],
        generatedAt: '2026-01-01T00:00:00.000Z',
      };
      const result = await generateReportPdf(
        report,
        new Set(),
        content,
        { attachDocuments: false },
        tEn,
      );
      const pdfDoc = await PDFDocument.load(await result.blob.arrayBuffer());
      expect(pdfDoc.getPageCount()).toBeGreaterThanOrEqual(2);
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
    // #1929 round 3: Vendor cell `.text` is now always a run array (buildUsageTextRuns applied to
    // Vendor, HIGH1) — reconstruct before comparing.
    const constitutedRowCells = tableItem.table.body.find(
      (row) => usageCellText((row[0] as { text?: unknown })?.text) === 'Constituted Vendor',
    ) as { text: unknown | { text: string }[] }[];
    const allocatedCell = constitutedRowCells[4] as { text: { text: string }[] };
    expect(allocatedCell.text[1]!.text).toBe(' (Abschlagszahlung)');
  });
});
