/**
 * Unit tests for client/src/lib/reportPdf/merge.ts (generateReportPdf)
 *
 * Covers: assembly order (cover letter + overview → pdfmake doc → optional pdf-lib splice),
 * attach-off skips the pdf-lib round-trip entirely, appendix numbering in report order, and
 * the skip-and-footnote path for failed/invalid document fetches.
 *
 * Isolation strategy: mocks ./loader.js, ./shared.js, ./coverLetterPdf.js, ./overviewPdf.js,
 * and ../paperlessApi.js so this file tests ONLY merge.ts's own orchestration logic — not the
 * (separately tested) builder functions themselves. global.fetch is stubbed per test to control
 * per-document success/failure.
 *
 * NOTE: an earlier pass of this file documented a critical bug where merge.ts read `doc.id`
 * instead of `doc.documentId` (the real SourceReportDocument field), causing the
 * skip-and-footnote path to crash instead of degrade gracefully. That was fixed in production
 * (merge.ts now reads `doc.documentId` throughout) during this same QA session — verified by
 * re-reading the file and re-running these tests. All fixtures below use the correct
 * `documentId` field and assert the now-correct, fixed behavior.
 *
 * NOTE: this file's `./loader.js` mock's `getBlob` is promise-based (`async () => new
 * Blob(...)`), matching production: merge.ts now does `await pdfDoc.getBlob()` per
 * @types/pdfmake@0.3.3's promise-returning signature (previously callback-style,
 * `getBlob((blob) => ...)`, which this mock was updated to match). This mock isolates merge.ts's
 * own orchestration from pdfmake/pdf-lib's real behavior (loader.test.ts and the new
 * realRender.test.ts exercise the real, unmocked packages end-to-end).
 *
 * NOTE: `SkippedDocument` now carries `vendorName`/`invoiceNumber` attribution (frontend fix spec
 * item 11 — footnotes and the on-screen skip list attribute each skip to its invoice) — every
 * push site in merge.ts (including the previously-silent step-4 embed catch block) populates both
 * fields from the invoice being processed. Assertions on skippedDocuments below either use
 * `expect.objectContaining` (fields incidental to the case under test) or list both fields
 * explicitly where the full array shape is asserted with `toEqual`.
 *
 * NOTE: `buildCoverLetterContent`/`buildOverviewContent` now receive two additional trailing
 * params — an optional `formatters: Formatters` object and a `includedTotal: number` computed
 * once in merge.ts from `report.invoices` filtered to `includedInvoiceIds` (respecting exclusions
 * and the refund-adjustment sign convention). Call-site assertions below were updated to include
 * both.
 */
import { describe, it, expect, jest, beforeEach, beforeAll } from '@jest/globals';
import type { TFunction } from 'i18next';
import type {
  SourceReportResponse,
  SourceReportInvoice,
  HouseholdSettings,
} from '@cornerstone/shared';
import type { Formatters } from '../formatters.js';
import type * as MergeModule from './merge.js';
import type * as CoverLetterPdfModule from './coverLetterPdf.js';
import type * as OverviewPdfModule from './overviewPdf.js';

const t = ((key: string) => key) as unknown as TFunction;

// ─── Mock: ./loader.js ────────────────────────────────────────────────────────

interface FakePdfDoc {
  getPageIndices: () => number[];
}

// getBlob() is promise-based per @types/pdfmake@0.3.3 / merge.ts's `await pdfDoc.getBlob()`.
const mockGetBlob = jest.fn(async () => new Blob(['TEXT_PDF']));
const mockCreatePdf = jest.fn((_def: unknown) => ({ getBlob: mockGetBlob }));

const mockPdfDocumentLoad = jest.fn<(bytes: ArrayBuffer) => Promise<FakePdfDoc>>();
const mockCopyPages = jest.fn<() => Promise<{ page: string }[]>>();
const mockAddPage = jest.fn();
const mockSave = jest.fn<() => Promise<Uint8Array>>();
const mockPDFDocumentCreate = jest.fn(async () => ({
  copyPages: mockCopyPages,
  addPage: mockAddPage,
  save: mockSave,
}));

jest.unstable_mockModule('./loader.js', () => ({
  loadPdfLibs: jest.fn(async () => ({
    pdfMake: { createPdf: mockCreatePdf },
    PDFDocument: {
      load: mockPdfDocumentLoad,
      create: mockPDFDocumentCreate,
    },
  })),
}));

// ─── Mock: ./shared.js ─────────────────────────────────────────────────────────

jest.unstable_mockModule('./shared.js', () => ({
  buildPageHeader: jest.fn(() => ({ text: 'HEADER' })),
  buildPageFooter: jest.fn(() => () => ({ text: 'FOOTER' })),
  TABLE_LAYOUT: {},
}));

// ─── Mock: ./coverLetterPdf.js / ./overviewPdf.js ──────────────────────────────

const mockBuildCoverLetterContent = jest
  .fn<typeof CoverLetterPdfModule.buildCoverLetterContent>()
  .mockReturnValue([{ text: 'COVER_LETTER' }]);
const mockBuildOverviewContent = jest
  .fn<typeof OverviewPdfModule.buildOverviewContent>()
  .mockReturnValue([{ text: 'OVERVIEW' }]);

jest.unstable_mockModule('./coverLetterPdf.js', () => ({
  buildCoverLetterContent: mockBuildCoverLetterContent,
}));
jest.unstable_mockModule('./overviewPdf.js', () => ({
  buildOverviewContent: mockBuildOverviewContent,
}));

// ─── Mock: ../paperlessApi.js (getDocumentPreviewUrl) ──────────────────────────

jest.unstable_mockModule('../paperlessApi.js', () => ({
  getDocumentPreviewUrl: (id: number) => `/api/paperless/documents/${id}/preview`,
}));

let generateReportPdf: typeof MergeModule.generateReportPdf;
let mockFetch: jest.MockedFunction<typeof globalThis.fetch>;

// jsdom's Blob polyfill in this test environment does not implement .arrayBuffer()/.text()
// (both real browsers and Node's own global Blob do). merge.ts's production code calls
// textBlob.arrayBuffer() when embedding invoice PDFs — polyfill via FileReader so those calls
// (and this file's own assertions) work under jsdom. This is a test-environment gap, not a
// production bug: modern browsers implement Blob.arrayBuffer()/.text() natively.
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
  if (typeof Blob.prototype.text !== 'function') {
    Blob.prototype.text = function (this: Blob): Promise<string> {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsText(this);
      });
    };
  }
});

beforeEach(async () => {
  ({ generateReportPdf } = (await import('./merge.js')) as typeof MergeModule);

  mockGetBlob.mockClear();
  mockCreatePdf.mockClear();
  mockPdfDocumentLoad.mockReset();
  mockCopyPages.mockReset().mockResolvedValue([{ page: 'p' }]);
  mockAddPage.mockClear();
  mockSave.mockReset().mockResolvedValue(new Uint8Array([1, 2, 3]));
  mockPDFDocumentCreate.mockClear();
  mockBuildCoverLetterContent.mockClear();
  mockBuildOverviewContent.mockClear();

  mockFetch = jest.fn<typeof globalThis.fetch>();
  globalThis.fetch = mockFetch;
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
    totalAmount: 1000,
    unallocatedInvoices: [],
    generatedAt: '2026-01-15T00:00:00.000Z',
  };
}

function okResponse(bytes: ArrayBuffer = new ArrayBuffer(4)): Response {
  return { ok: true, status: 200, arrayBuffer: async () => bytes } as unknown as Response;
}

function notOkResponse(status = 404): Response {
  return { ok: false, status, arrayBuffer: async () => new ArrayBuffer(0) } as unknown as Response;
}

const household: HouseholdSettings = { householdName: null, householdAddress: null };

describe('generateReportPdf', () => {
  it('attach-off: never calls PDFDocument.create/copyPages, returns the pdfmake text blob as-is', async () => {
    const invoice = makeInvoice({
      documents: [{ documentId: 1, archiveSerialNumber: null, title: null, attachmentType: null }],
    });
    const report = makeReport([invoice]);

    const result = await generateReportPdf(
      report,
      new Set(['inv-1']),
      'claim',
      { attachDocuments: false, includeCoverLetter: false },
      household,
      t,
    );

    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockPDFDocumentCreate).not.toHaveBeenCalled();
    expect(mockCopyPages).not.toHaveBeenCalled();
    expect(result.skippedDocuments).toEqual([]);
    expect(await result.blob.text()).toBe('TEXT_PDF');
  });

  it('attach-on but no documents anywhere: still skips the pdf-lib round-trip (appendixByInvoiceId stays empty)', async () => {
    const invoice = makeInvoice({ documents: [] });
    const report = makeReport([invoice]);

    const result = await generateReportPdf(
      report,
      new Set(['inv-1']),
      'claim',
      { attachDocuments: true, includeCoverLetter: false },
      household,
      t,
    );

    expect(mockPDFDocumentCreate).not.toHaveBeenCalled();
    expect(result.skippedDocuments).toEqual([]);
  });

  it('concatenates cover letter content before overview content when includeCoverLetter is true', async () => {
    const report = makeReport([]);

    await generateReportPdf(
      report,
      new Set(),
      'claim',
      { attachDocuments: false, includeCoverLetter: true },
      household,
      t,
    );

    // merge.ts computes includedTotal once (report has no invoices here, so it's 0) and passes it
    // through to buildCoverLetterContent alongside the (here, unset) formatters param.
    expect(mockBuildCoverLetterContent).toHaveBeenCalledWith(
      report,
      household,
      'claim',
      t,
      undefined,
      0,
    );
    const passedContent = (mockCreatePdf.mock.calls[0]![0] as { content: { text: string }[] })
      .content;
    expect(passedContent).toEqual([{ text: 'COVER_LETTER' }, { text: 'OVERVIEW' }]);
  });

  describe('includedTotal computation (frontend fix spec item 5 — grand total respects exclusions)', () => {
    it('sums allocatedAmount across included invoices only, unconditionally (refund-adjustment lines already arrive pre-signed)', async () => {
      const included = makeInvoice({ invoiceId: 'inv-1', allocatedAmount: 1000 });
      const refund = makeInvoice({
        invoiceId: 'inv-refund',
        lineKind: 'refund-adjustment',
        allocatedAmount: -200,
        invoiceAmount: 200,
      });
      const excluded = makeInvoice({ invoiceId: 'inv-excluded', allocatedAmount: 5000 });
      const report = makeReport([included, refund, excluded]);

      await generateReportPdf(
        report,
        new Set(['inv-1', 'inv-refund']), // excludes inv-excluded
        'claim',
        { attachDocuments: false, includeCoverLetter: true },
        household,
        t,
      );

      // 1000 + (-200) = 800; the excluded invoice's 5000 must never be added.
      const coverLetterIncludedTotal = mockBuildCoverLetterContent.mock.calls[0]![5];
      const overviewIncludedTotal = mockBuildOverviewContent.mock.calls[0]![7];
      expect(coverLetterIncludedTotal).toBe(800);
      expect(overviewIncludedTotal).toBe(800);
    });

    it('passes the SAME computed includedTotal value to both buildCoverLetterContent and buildOverviewContent (computed once)', async () => {
      const invoice = makeInvoice({ invoiceId: 'inv-1', allocatedAmount: 333 });
      const report = makeReport([invoice]);

      await generateReportPdf(
        report,
        new Set(['inv-1']),
        'claim',
        { attachDocuments: false, includeCoverLetter: true },
        household,
        t,
      );

      expect(mockBuildCoverLetterContent.mock.calls[0]![5]).toBe(333);
      expect(mockBuildOverviewContent.mock.calls[0]![7]).toBe(333);
    });

    it('forwards the formatters param through to both builders when provided', async () => {
      const invoice = makeInvoice({ invoiceId: 'inv-1', allocatedAmount: 100 });
      const report = makeReport([invoice]);
      const stubFormatters: Formatters = {
        formatCurrency: (n: number) => `€${n}`,
        formatDate: (d) => (typeof d === 'string' ? d : '—'),
      };

      await generateReportPdf(
        report,
        new Set(['inv-1']),
        'claim',
        { attachDocuments: false, includeCoverLetter: true },
        household,
        t,
        stubFormatters,
      );

      expect(mockBuildCoverLetterContent.mock.calls[0]![4]).toBe(stubFormatters);
      expect(mockBuildOverviewContent.mock.calls[0]![6]).toBe(stubFormatters);
    });
  });

  it('omits cover letter content when includeCoverLetter is false', async () => {
    const report = makeReport([]);

    await generateReportPdf(
      report,
      new Set(),
      'claim',
      { attachDocuments: false, includeCoverLetter: false },
      household,
      t,
    );

    expect(mockBuildCoverLetterContent).not.toHaveBeenCalled();
    const passedContent = (mockCreatePdf.mock.calls[0]![0] as { content: { text: string }[] })
      .content;
    expect(passedContent).toEqual([{ text: 'OVERVIEW' }]);
  });

  it('happy path: a single successfully-fetched+valid document triggers the pdf-lib merge and is embedded as appendix 1', async () => {
    const invoice = makeInvoice({
      documents: [{ documentId: 1, archiveSerialNumber: null, title: null, attachmentType: null }],
    });
    const report = makeReport([invoice]);

    mockFetch.mockResolvedValue(okResponse());
    mockPdfDocumentLoad.mockResolvedValue({ getPageIndices: () => [0] });

    const result = await generateReportPdf(
      report,
      new Set(['inv-1']),
      'claim',
      { attachDocuments: true, includeCoverLetter: false },
      household,
      t,
    );

    expect(mockPDFDocumentCreate).toHaveBeenCalledTimes(1);
    // Once for the text blob's own pages, once for the invoice PDF's pages.
    expect(mockCopyPages).toHaveBeenCalledTimes(2);
    expect(mockAddPage).toHaveBeenCalled();
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(result.skippedDocuments).toEqual([]);

    // overviewPdf receives the appendix map with invoice 1 → appendix number 1.
    const appendixArg = mockBuildOverviewContent.mock.calls[0]![2];
    expect(appendixArg.get('inv-1')).toBe(1);

    // Final blob comes from finalDoc.save(), not the raw pdfmake text blob.
    const bytes = new Uint8Array(await result.blob.arrayBuffer());
    expect(Array.from(bytes)).toEqual([1, 2, 3]);
  });

  it('assigns sequential appendix numbers to successful documents in report order across multiple invoices', async () => {
    const invoice1 = makeInvoice({
      invoiceId: 'inv-1',
      documents: [{ documentId: 10, archiveSerialNumber: null, title: null, attachmentType: null }],
    });
    const invoice2 = makeInvoice({
      invoiceId: 'inv-2',
      documents: [{ documentId: 20, archiveSerialNumber: null, title: null, attachmentType: null }],
    });
    const report = makeReport([invoice1, invoice2]);

    mockFetch.mockResolvedValue(okResponse());
    mockPdfDocumentLoad.mockResolvedValue({ getPageIndices: () => [0] });

    await generateReportPdf(
      report,
      new Set(['inv-1', 'inv-2']),
      'claim',
      { attachDocuments: true, includeCoverLetter: false },
      household,
      t,
    );

    const appendixArg = mockBuildOverviewContent.mock.calls[0]![2];
    expect(appendixArg.get('inv-1')).toBe(1);
    expect(appendixArg.get('inv-2')).toBe(2);
  });

  it('excluded invoices are never fetched or embedded, even with attachDocuments on', async () => {
    const included = makeInvoice({
      invoiceId: 'inv-1',
      documents: [{ documentId: 1, archiveSerialNumber: null, title: null, attachmentType: null }],
    });
    const excluded = makeInvoice({
      invoiceId: 'inv-2',
      documents: [{ documentId: 2, archiveSerialNumber: null, title: null, attachmentType: null }],
    });
    const report = makeReport([included, excluded]);

    mockFetch.mockResolvedValue(okResponse());
    mockPdfDocumentLoad.mockResolvedValue({ getPageIndices: () => [0] });

    await generateReportPdf(
      report,
      new Set(['inv-1']),
      'claim',
      { attachDocuments: true, includeCoverLetter: false },
      household,
      t,
    );

    // The included invoice's one document is fetched exactly once — merge.ts caches the bytes
    // fetched during the appendix-numbering pass (Step 1) in `documentBytesByInvoiceAndDoc` and
    // reuses them in the pdf-lib embed pass (Step 4) instead of re-fetching. The excluded
    // invoice's document must never be fetched at all.
    expect(mockFetch).toHaveBeenCalledTimes(1);
    for (const call of mockFetch.mock.calls) {
      expect(call[0]).toBe('/api/paperless/documents/1/preview');
      expect(call[1]).toEqual(expect.objectContaining({ credentials: 'include' }));
    }
  });

  it('a single invoice with 2+ successful documents gets exactly one appendix number, and appendix numbers stay contiguous across invoices (no gaps for extra documents)', async () => {
    const multiDocInvoice = makeInvoice({
      invoiceId: 'inv-1',
      documents: [
        { documentId: 10, archiveSerialNumber: null, title: null, attachmentType: null },
        { documentId: 11, archiveSerialNumber: null, title: null, attachmentType: null },
        { documentId: 12, archiveSerialNumber: null, title: null, attachmentType: null },
      ],
    });
    const singleDocInvoice = makeInvoice({
      invoiceId: 'inv-2',
      documents: [{ documentId: 20, archiveSerialNumber: null, title: null, attachmentType: null }],
    });
    const report = makeReport([multiDocInvoice, singleDocInvoice]);

    mockFetch.mockResolvedValue(okResponse());
    mockPdfDocumentLoad.mockResolvedValue({ getPageIndices: () => [0] });

    await generateReportPdf(
      report,
      new Set(['inv-1', 'inv-2']),
      'claim',
      { attachDocuments: true, includeCoverLetter: false },
      household,
      t,
    );

    const appendixArg = mockBuildOverviewContent.mock.calls[0]![2];
    // inv-1 has 3 valid documents but is assigned only ONE appendix number (the first successful
    // doc claims it; the 2nd/3rd don't bump the counter again).
    expect(appendixArg.get('inv-1')).toBe(1);
    // inv-2's appendix number is contiguous (2), not 4 — proving inv-1's extra documents never
    // inflated the shared `appendixNum` counter.
    expect(appendixArg.get('inv-2')).toBe(2);
    expect(appendixArg.size).toBe(2);

    // All 3 of inv-1's documents were still fetched/validated (each is embedded individually in
    // Step 4) — only the appendix NUMBER assignment is deduped to once per invoice.
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  it('step-4 embed path reuses the bytes fetched during step-1 appendix numbering instead of re-fetching — fetch is called exactly once per document across the whole generate, even with multiple documents per invoice', async () => {
    const invoice = makeInvoice({
      invoiceId: 'inv-1',
      documents: [
        { documentId: 30, archiveSerialNumber: null, title: null, attachmentType: null },
        { documentId: 31, archiveSerialNumber: null, title: null, attachmentType: null },
      ],
    });
    const report = makeReport([invoice]);

    mockFetch.mockResolvedValue(okResponse());
    mockPdfDocumentLoad.mockResolvedValue({ getPageIndices: () => [0] });

    const result = await generateReportPdf(
      report,
      new Set(['inv-1']),
      'claim',
      { attachDocuments: true, includeCoverLetter: false },
      household,
      t,
    );

    // 2 documents, fetched exactly once each (2 total) — not twice each (4 total), which is what
    // a re-fetching (uncached) Step 4 embed pass would produce.
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const fetchedUrls = mockFetch.mock.calls.map((call) => call[0]);
    expect(fetchedUrls).toEqual([
      '/api/paperless/documents/30/preview',
      '/api/paperless/documents/31/preview',
    ]);

    // Both documents were still embedded: PDFDocument.load is called once per document during
    // step-1 validation (2), once for the text blob itself in step 4 (1), and once per document
    // again in step 4's embed loop — from the cached bytes, not a re-fetch (2) — 5 total. This
    // confirms the cached bytes actually got used for the embed, not silently skipped.
    expect(mockPdfDocumentLoad).toHaveBeenCalledTimes(5);
    expect(mockCopyPages).toHaveBeenCalledTimes(3); // 1x text blob + 1x per invoice document
    expect(result.skippedDocuments).toEqual([]);
  });

  it(
    'a document fetch returning a non-2xx status populates skippedDocuments with reason ' +
      "'footnoteFetchFailed' instead of aborting the whole report",
    async () => {
      const invoice = makeInvoice({
        documents: [
          { documentId: 404, archiveSerialNumber: null, title: null, attachmentType: null },
        ],
      });
      const report = makeReport([invoice]);
      mockFetch.mockResolvedValue(notOkResponse(404));

      await expect(
        generateReportPdf(
          report,
          new Set(['inv-1']),
          'claim',
          { attachDocuments: true, includeCoverLetter: false },
          household,
          t,
        ),
      ).resolves.toEqual(
        expect.objectContaining({
          skippedDocuments: [
            expect.objectContaining({
              invoiceId: 'inv-1',
              documentId: '404',
              reason: 'footnoteFetchFailed',
            }),
          ],
        }),
      );
    },
  );

  it('a document that throws in PDFDocument.load (invalid PDF) is skipped with reason footnoteInvalidPdf', async () => {
    const invoice = makeInvoice({
      documents: [{ documentId: 5, archiveSerialNumber: null, title: null, attachmentType: null }],
    });
    const report = makeReport([invoice]);
    mockFetch.mockResolvedValue(okResponse());
    mockPdfDocumentLoad.mockRejectedValue(new Error('not a valid PDF'));

    await expect(
      generateReportPdf(
        report,
        new Set(['inv-1']),
        'claim',
        { attachDocuments: true, includeCoverLetter: false },
        household,
        t,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        skippedDocuments: [
          expect.objectContaining({ invoiceId: 'inv-1', reason: 'footnoteInvalidPdf' }),
        ],
      }),
    );
  });

  it('a document that validates fine in step 1 but fails to copy/embed in step 4 is pushed to skippedDocuments with attribution (the previously-silent embed-phase catch)', async () => {
    // Step 1 validation (PDFDocument.load(bytes) + no copyPages call) succeeds — the document is
    // cached and gets an appendix number. Step 4 re-loads the text blob's own pages fine (1st
    // copyPages call succeeds) but the invoice document's own copyPages call (2nd call) throws —
    // this exercises merge.ts's step-4 embed-loop catch block, which used to silently swallow the
    // error. It must now push a skippedDocuments entry (frontend fix spec item 11) with vendor/
    // invoice-number attribution, exactly like the step-1 failure paths.
    const invoice = makeInvoice({
      invoiceId: 'inv-1',
      vendorName: 'Delta Supplies',
      invoiceNumber: 'D-77',
      documents: [{ documentId: 9, archiveSerialNumber: null, title: null, attachmentType: null }],
    });
    const report = makeReport([invoice]);
    mockFetch.mockResolvedValue(okResponse());
    mockPdfDocumentLoad.mockResolvedValue({ getPageIndices: () => [0] });
    mockCopyPages
      .mockResolvedValueOnce([{ page: 'text-page' }]) // step 4: text blob's own pages
      .mockRejectedValueOnce(new Error('corrupt during embed')); // step 4: this invoice's pages

    const result = await generateReportPdf(
      report,
      new Set(['inv-1']),
      'claim',
      { attachDocuments: true, includeCoverLetter: false },
      household,
      t,
    );

    expect(result.skippedDocuments).toEqual([
      {
        invoiceId: 'inv-1',
        documentId: '9',
        reason: 'footnoteInvalidPdf',
        vendorName: 'Delta Supplies',
        invoiceNumber: 'D-77',
      },
    ]);
    // The report as a whole still completes (finalDoc.save() still runs) despite the embed
    // failure — it degrades gracefully rather than aborting.
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(result.blob).toBeInstanceOf(Blob);
  });

  it('a single invoice with one valid and two invalid documents: caches only the valid one for step 4, records two skip entries for the invalid ones, and skips their (never-cached) bytes in the embed loop', async () => {
    // Exercises two branches together:
    //  - the step-2 `skippedByInvoice` map's "already has this invoiceId" branch (line 92) — two
    //    failing documents on the SAME invoice produce two skippedDocuments entries sharing one
    //    invoiceId.
    //  - the step-4 embed loop's `if (!bytes) continue` branch (line 213) — the invoice still gets
    //    an appendix number (from its one valid document), so the embed loop runs for it, but the
    //    two invalid documents were never cached in step 1 and must be skipped without re-fetching
    //    or crashing.
    const invoice = makeInvoice({
      invoiceId: 'inv-1',
      documents: [
        { documentId: 1, archiveSerialNumber: null, title: null, attachmentType: null }, // valid
        { documentId: 2, archiveSerialNumber: null, title: null, attachmentType: null }, // invalid
        { documentId: 3, archiveSerialNumber: null, title: null, attachmentType: null }, // invalid
      ],
    });
    const report = makeReport([invoice]);

    mockFetch.mockResolvedValue(okResponse());
    // Resolve call 1 (doc 1, step 1 validation), reject calls 2 and 3 (docs 2 and 3, step 1
    // validation). Step 4 only re-loads doc 1 (the only one with cached bytes / an appendix
    // number), so no further PDFDocument.load calls occur for docs 2/3.
    mockPdfDocumentLoad
      .mockReset()
      .mockResolvedValueOnce({ getPageIndices: () => [0] }) // doc 1: valid (step 1)
      .mockRejectedValueOnce(new Error('bad pdf')) // doc 2: invalid (step 1)
      .mockRejectedValueOnce(new Error('bad pdf')) // doc 3: invalid (step 1)
      .mockResolvedValueOnce({ getPageIndices: () => [0] }) // step 4: text blob's own re-load
      .mockResolvedValueOnce({ getPageIndices: () => [0] }); // step 4: doc 1's cached-bytes re-load

    const result = await generateReportPdf(
      report,
      new Set(['inv-1']),
      'claim',
      { attachDocuments: true, includeCoverLetter: false },
      household,
      t,
    );

    expect(result.skippedDocuments).toEqual([
      {
        invoiceId: 'inv-1',
        documentId: '2',
        reason: 'footnoteInvalidPdf',
        vendorName: 'ACME Builders',
        invoiceNumber: 'INV-001',
      },
      {
        invoiceId: 'inv-1',
        documentId: '3',
        reason: 'footnoteInvalidPdf',
        vendorName: 'ACME Builders',
        invoiceNumber: 'INV-001',
      },
    ]);

    const appendixArg = mockBuildOverviewContent.mock.calls[0]![2];
    expect(appendixArg.get('inv-1')).toBe(1);
    // Step 4 embeds only the one cached (valid) document — no crash, no re-fetch attempt for the
    // two uncached ones.
    expect(mockCopyPages).toHaveBeenCalledTimes(2); // 1x text blob + 1x doc 1
  });

  it('a fetch that throws (network error) is caught and recorded as footnoteFetchFailed, without aborting the rest of the report', async () => {
    const invoice = makeInvoice({
      documents: [{ documentId: 7, archiveSerialNumber: null, title: null, attachmentType: null }],
    });
    const report = makeReport([invoice]);
    mockFetch.mockRejectedValue(new Error('network down'));

    const result = await generateReportPdf(
      report,
      new Set(['inv-1']),
      'claim',
      { attachDocuments: true, includeCoverLetter: false },
      household,
      t,
    );

    expect(result.skippedDocuments).toEqual([
      {
        invoiceId: 'inv-1',
        documentId: '7',
        reason: 'footnoteFetchFailed',
        vendorName: 'ACME Builders',
        invoiceNumber: 'INV-001',
      },
    ]);
    // Never aborts — the pdfmake text blob is still produced.
    expect(result.blob).toBeInstanceOf(Blob);
  });

  it('an included invoice with no documents is skipped in the pdf-lib embed pass without breaking the others', async () => {
    // Invoice 1 has a successful document (makes appendixByInvoiceId non-empty, so the pdf-lib
    // embed pass in Step 4 actually runs). Invoice 2 has no documents at all, so it never gets
    // an appendix number — Step 4's embed loop must skip it via its own `!appendixNum` guard
    // rather than crashing or omitting invoice 1's embed.
    const withDoc = makeInvoice({
      invoiceId: 'inv-1',
      documents: [{ documentId: 1, archiveSerialNumber: null, title: null, attachmentType: null }],
    });
    const withoutDoc = makeInvoice({ invoiceId: 'inv-2', documents: [] });
    const report = makeReport([withDoc, withoutDoc]);

    mockFetch.mockResolvedValue(okResponse());
    mockPdfDocumentLoad.mockResolvedValue({ getPageIndices: () => [0] });

    const result = await generateReportPdf(
      report,
      new Set(['inv-1', 'inv-2']),
      'claim',
      { attachDocuments: true, includeCoverLetter: false },
      household,
      t,
    );

    expect(mockPDFDocumentCreate).toHaveBeenCalledTimes(1);
    expect(result.skippedDocuments).toEqual([]);
    expect(result.blob).toBeInstanceOf(Blob);
  });

  it('pdfmake header callback omits the header on page 1 and renders it on subsequent pages', async () => {
    const invoice = makeInvoice();
    const report = makeReport([invoice]);

    await generateReportPdf(
      report,
      new Set(['inv-1']),
      'claim',
      { attachDocuments: false, includeCoverLetter: false },
      household,
      t,
    );

    const def = mockCreatePdf.mock.calls[0]![0] as {
      header: (currentPage: number) => unknown;
    };
    expect(def.header(1)).toBeNull();
    expect(def.header(2)).not.toBeNull();
  });
});
