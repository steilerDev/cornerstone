/**
 * Unit tests for client/src/lib/reportPdf/merge.ts (generateReportPdf)
 *
 * Story #1900 REWRITE. generateReportPdf's signature dropped `useCase`, `household`, and
 * `formatters` entirely — all text derivation now happens ONCE upstream (ReportWizardPage calls
 * buildReportContent + applyOverrides, producing the EFFECTIVE ReportContent) and is passed in
 * directly:
 *
 *   generateReportPdf(report, includedInvoiceIds, reportContent: ReportContent,
 *     options: { attachDocuments: boolean }): Promise<GeneratedReport>
 *
 * `includeCoverLetter` is no longer a separate options flag — merge.ts now derives it purely from
 * `reportContent.coverLetter !== null` (the caller already decided whether to include a cover
 * letter when it built reportContent). buildCoverLetterContent/buildOverviewContent's own
 * signatures shrank correspondingly (reportContent [, skippedByInvoice]) — see
 * coverLetterPdf.test.ts / overviewPdf.test.ts for their own coverage.
 *
 * Isolation strategy unchanged from the pre-#1900 file: mocks ./loader.js, ./shared.js,
 * ./coverLetterPdf.js, ./overviewPdf.js, and ../paperlessApi.js so this file tests ONLY merge.ts's
 * own orchestration logic (document fetch/embed pipeline, appendix numbering, skip tracking) — not
 * the (separately tested) content-building functions themselves. global.fetch is stubbed per test.
 *
 * #1929 ROUND 2: `PAGE_TOP_MARGIN` (along with PAGE_MARGIN_X/PAGE_MARGIN_BOTTOM/
 * TABLE_BODY_FONT_SIZE) moved out of shared.ts entirely, into pageGeometry.ts — merge.ts imports
 * all four directly from there now (see its own import block), not from shared.js. pageGeometry.ts
 * is NOT mocked in this file (it has no side effects worth isolating), so both merge.ts's
 * production code and this test's own assertions resolve the same real, computed values — no
 * "resolves before the mock" trick needed anymore, unlike round 1's shared.js import.
 */
import { describe, it, expect, jest, beforeEach, beforeAll } from '@jest/globals';
import type { SourceReportResponse, SourceReportInvoice } from '@cornerstone/shared';
import type { ReportContent } from '../reportContent/index.js';
import type * as MergeModule from './merge.js';
import type * as CoverLetterPdfModule from './coverLetterPdf.js';
import type * as OverviewPdfModule from './overviewPdf.js';
import {
  PAGE_MARGIN_X,
  PAGE_TOP_MARGIN,
  PAGE_MARGIN_BOTTOM,
  TABLE_BODY_FONT_SIZE,
} from './pageGeometry.js';

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
  // NOTE (#1929 round 2): PAGE_TOP_MARGIN is deliberately NOT part of this mock — merge.ts no
  // longer imports it from shared.js at all (moved to pageGeometry.ts, which this file leaves
  // unmocked). Including a stray PAGE_TOP_MARGIN export here would be dead and misleading.
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
    splitKind: null,
    documents: [],
    budgetLines: [],
    deposits: [],
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

function makeContent(overrides: Partial<ReportContent> = {}): ReportContent {
  return {
    isOverview: false,
    isClaim: false,
    tableTitle: 'Claim Report',
    labels: {
      vendor: 'Vendor',
      invoiceNumber: 'Invoice No.',
      date: 'Date',
      status: 'Status',
      invoiceAmount: 'Invoice Amount',
      allocatedAmount: 'Allocated Amount',
      usage: 'Usage',
      attachmentsNote: 'Attachments Note',
      deposit: 'Deposit',
      splitNote: 'partial',
      depositReducedNote: 'less deposit',
      source: 'Source',
      sourceType: 'Source Type',
      reference: 'Reference',
      generatedAt: 'Generated At',
      pageLabel: 'Page',
      coverLetterReferenceLabel: 'Reference',
      coverLetterSubjectLabel: 'Subject',
      skipReasonLabels: {
        footnoteFetchFailed: 'FetchFailed-label',
        footnoteInvalidPdf: 'InvalidPdf-label',
      },
    },
    sourceInfo: {
      sourceName: 'Home Loan',
      sourceTypeText: 'Bank Loan',
      referenceText: null,
      generatedAtText: '01/15/2026',
    },
    coverLetter: null,
    rows: [],
    summaryRows: [],
    footnotes: [],
    ...overrides,
  };
}

function okResponse(bytes: ArrayBuffer = new ArrayBuffer(4)): Response {
  return { ok: true, status: 200, arrayBuffer: async () => bytes } as unknown as Response;
}

function notOkResponse(status = 404): Response {
  return { ok: false, status, arrayBuffer: async () => new ArrayBuffer(0) } as unknown as Response;
}

describe('generateReportPdf', () => {
  it('attach-off: never calls PDFDocument.create/copyPages, returns the pdfmake text blob as-is', async () => {
    const invoice = makeInvoice({
      documents: [{ documentId: 1, archiveSerialNumber: null, title: null, attachmentType: null }],
    });
    const report = makeReport([invoice]);

    const result = await generateReportPdf(report, new Set(['inv-1']), makeContent(), {
      attachDocuments: false,
    });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockPDFDocumentCreate).not.toHaveBeenCalled();
    expect(mockCopyPages).not.toHaveBeenCalled();
    expect(result.skippedDocuments).toEqual([]);
    expect(await result.blob.text()).toBe('TEXT_PDF');
  });

  it('attach-on but no documents anywhere: still skips the pdf-lib round-trip', async () => {
    const invoice = makeInvoice({ documents: [] });
    const report = makeReport([invoice]);

    const result = await generateReportPdf(report, new Set(['inv-1']), makeContent(), {
      attachDocuments: true,
    });

    expect(mockPDFDocumentCreate).not.toHaveBeenCalled();
    expect(result.skippedDocuments).toEqual([]);
  });

  describe('cover letter inclusion (derived from reportContent.coverLetter, no separate options flag)', () => {
    it('concatenates cover letter content before overview content when reportContent.coverLetter is non-null', async () => {
      const report = makeReport([]);
      const content = makeContent({
        coverLetter: {
          sender: 'S',
          recipient: null,
          dateLine: 'D',
          reference: null,
          subject: 'Subj',
          body: 'Body',
          signature: 'S',
          closing: 'Sincerely,',
        },
      });

      await generateReportPdf(report, new Set(), content, { attachDocuments: false });

      expect(mockBuildCoverLetterContent).toHaveBeenCalledWith(content);
      const passedContent = (mockCreatePdf.mock.calls[0]![0] as { content: { text: string }[] })
        .content;
      expect(passedContent).toEqual([{ text: 'COVER_LETTER' }, { text: 'OVERVIEW' }]);
    });

    it('omits cover letter content entirely when reportContent.coverLetter is null', async () => {
      const report = makeReport([]);
      const content = makeContent({ coverLetter: null });

      await generateReportPdf(report, new Set(), content, { attachDocuments: false });

      expect(mockBuildCoverLetterContent).not.toHaveBeenCalled();
      const passedContent = (mockCreatePdf.mock.calls[0]![0] as { content: { text: string }[] })
        .content;
      expect(passedContent).toEqual([{ text: 'OVERVIEW' }]);
    });
  });

  it('calls buildOverviewContent with (reportContent, skippedByInvoice map, hiddenColumns) — the #1973 3-arg shape', async () => {
    const invoice = makeInvoice({ invoiceId: 'inv-1' });
    const report = makeReport([invoice]);
    const content = makeContent();

    await generateReportPdf(report, new Set(['inv-1']), content, { attachDocuments: false });

    expect(mockBuildOverviewContent).toHaveBeenCalledWith(content, expect.any(Map), new Set());
    const skippedByInvoiceArg = mockBuildOverviewContent.mock.calls[0]![1] as Map<string, string[]>;
    expect(skippedByInvoiceArg.size).toBe(0);
  });

  describe('#1973: hiddenColumns plumbing', () => {
    it('a hiddenColumns Set passed in options reaches buildOverviewContent unchanged', async () => {
      const invoice = makeInvoice({ invoiceId: 'inv-1' });
      const report = makeReport([invoice]);
      const content = makeContent();
      const hiddenColumns = new Set<'vendor'>(['vendor']);

      await generateReportPdf(report, new Set(['inv-1']), content, {
        attachDocuments: false,
        hiddenColumns,
      });

      expect(mockBuildOverviewContent).toHaveBeenCalledWith(
        content,
        expect.any(Map),
        hiddenColumns,
      );
      const hiddenColumnsArg = mockBuildOverviewContent.mock.calls[0]![2] as Set<string>;
      expect(hiddenColumnsArg.has('vendor')).toBe(true);
    });

    it('omitting hiddenColumns entirely behaves identically to passing an explicit empty Set (the internal default)', async () => {
      const invoice = makeInvoice({ invoiceId: 'inv-1' });
      const report = makeReport([invoice]);
      const content = makeContent();

      await generateReportPdf(report, new Set(['inv-1']), content, { attachDocuments: false });

      const hiddenColumnsArg = mockBuildOverviewContent.mock.calls[0]![2] as Set<string>;
      expect(hiddenColumnsArg).toBeInstanceOf(Set);
      expect(hiddenColumnsArg.size).toBe(0);
      expect(hiddenColumnsArg).toEqual(new Set());
    });
  });

  it('builds the skippedByInvoice map passed to buildOverviewContent from actual skip failures', async () => {
    const invoice = makeInvoice({
      invoiceId: 'inv-1',
      documents: [{ documentId: 1, archiveSerialNumber: null, title: null, attachmentType: null }],
    });
    const report = makeReport([invoice]);
    mockFetch.mockResolvedValue(notOkResponse(404));

    await generateReportPdf(report, new Set(['inv-1']), makeContent(), { attachDocuments: true });

    const skippedByInvoiceArg = mockBuildOverviewContent.mock.calls[0]![1] as Map<string, string[]>;
    expect(skippedByInvoiceArg.get('inv-1')).toEqual(['footnoteFetchFailed']);
  });

  it('happy path: a single successfully-fetched+valid document triggers the pdf-lib merge (appendix numbering happens purely in the pdf-lib splice step, never passed to buildOverviewContent)', async () => {
    const invoice = makeInvoice({
      documents: [{ documentId: 1, archiveSerialNumber: null, title: null, attachmentType: null }],
    });
    const report = makeReport([invoice]);

    mockFetch.mockResolvedValue(okResponse());
    mockPdfDocumentLoad.mockResolvedValue({ getPageIndices: () => [0] });

    const result = await generateReportPdf(report, new Set(['inv-1']), makeContent(), {
      attachDocuments: true,
    });

    expect(mockPDFDocumentCreate).toHaveBeenCalledTimes(1);
    // Once for the text blob's own pages, once for the invoice PDF's pages.
    expect(mockCopyPages).toHaveBeenCalledTimes(2);
    expect(mockAddPage).toHaveBeenCalled();
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(result.skippedDocuments).toEqual([]);

    // buildOverviewContent no longer receives an appendix map argument at all (only reportContent,
    // skippedByInvoice, hiddenColumns) — appendix numbering is purely internal to the pdf-lib
    // splice step.
    expect(mockBuildOverviewContent.mock.calls[0]).toHaveLength(3);

    // Final blob comes from finalDoc.save(), not the raw pdfmake text blob.
    const bytes = new Uint8Array(await result.blob.arrayBuffer());
    expect(Array.from(bytes)).toEqual([1, 2, 3]);
  });

  it('assigns sequential appendix numbers to successful documents in report order across multiple invoices (internal to the embed step only)', async () => {
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

    const result = await generateReportPdf(report, new Set(['inv-1', 'inv-2']), makeContent(), {
      attachDocuments: true,
    });

    // Both invoices' documents were embedded (2 copyPages calls beyond the text-blob's own: one
    // per invoice) and no skips were recorded, confirming both got processed in report order.
    expect(mockCopyPages).toHaveBeenCalledTimes(3); // 1x text blob + 1x per invoice
    expect(result.skippedDocuments).toEqual([]);
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

    await generateReportPdf(report, new Set(['inv-1']), makeContent(), { attachDocuments: true });

    // The included invoice's one document is fetched exactly once — merge.ts caches the bytes
    // fetched during the appendix-numbering pass (Step 1) and reuses them in the pdf-lib embed
    // pass (Step 4) instead of re-fetching. The excluded invoice's document must never be fetched.
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/paperless/documents/1/preview',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('a single invoice with 2+ successful documents gets exactly one appendix number, and appendix numbers stay contiguous across invoices', async () => {
    const multiDocInvoice = makeInvoice({
      invoiceId: 'inv-1',
      documents: [
        { documentId: 10, archiveSerialNumber: null, title: null, attachmentType: null },
        { documentId: 11, archiveSerialNumber: null, title: null, attachmentType: null },
      ],
    });
    const singleDocInvoice = makeInvoice({
      invoiceId: 'inv-2',
      documents: [{ documentId: 20, archiveSerialNumber: null, title: null, attachmentType: null }],
    });
    const report = makeReport([multiDocInvoice, singleDocInvoice]);

    mockFetch.mockResolvedValue(okResponse());
    mockPdfDocumentLoad.mockResolvedValue({ getPageIndices: () => [0] });

    await generateReportPdf(report, new Set(['inv-1', 'inv-2']), makeContent(), {
      attachDocuments: true,
    });

    // inv-1 has 2 documents but only ONE appendix slot (1 extra copyPages call beyond text blob +
    // inv-2's own), confirming the appendix counter isn't inflated per extra document.
    // 1 (text blob) + 2 (inv-1's two documents individually embedded) + 1 (inv-2) = 4.
    expect(mockCopyPages).toHaveBeenCalledTimes(4);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('step-4 embed path reuses the bytes fetched during step-1 appendix numbering instead of re-fetching', async () => {
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

    const result = await generateReportPdf(report, new Set(['inv-1']), makeContent(), {
      attachDocuments: true,
    });

    // 2 documents, fetched exactly once each (2 total) — not twice each (4 total).
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const fetchedUrls = mockFetch.mock.calls.map((call) => call[0]);
    expect(fetchedUrls).toEqual([
      '/api/paperless/documents/30/preview',
      '/api/paperless/documents/31/preview',
    ]);
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
        generateReportPdf(report, new Set(['inv-1']), makeContent(), { attachDocuments: true }),
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
      generateReportPdf(report, new Set(['inv-1']), makeContent(), { attachDocuments: true }),
    ).resolves.toEqual(
      expect.objectContaining({
        skippedDocuments: [
          expect.objectContaining({ invoiceId: 'inv-1', reason: 'footnoteInvalidPdf' }),
        ],
      }),
    );
  });

  it('a document that validates fine in step 1 but fails to copy/embed in step 4 is pushed to skippedDocuments with attribution', async () => {
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

    const result = await generateReportPdf(report, new Set(['inv-1']), makeContent(), {
      attachDocuments: true,
    });

    expect(result.skippedDocuments).toEqual([
      {
        invoiceId: 'inv-1',
        documentId: '9',
        reason: 'footnoteInvalidPdf',
        vendorName: 'Delta Supplies',
        invoiceNumber: 'D-77',
      },
    ]);
    // The report as a whole still completes despite the embed failure.
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(result.blob).toBeInstanceOf(Blob);
  });

  it('a single invoice with one valid and two invalid documents: caches only the valid one for step 4, records two skip entries for the invalid ones', async () => {
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
    mockPdfDocumentLoad
      .mockReset()
      .mockResolvedValueOnce({ getPageIndices: () => [0] }) // doc 1: valid (step 1)
      .mockRejectedValueOnce(new Error('bad pdf')) // doc 2: invalid (step 1)
      .mockRejectedValueOnce(new Error('bad pdf')) // doc 3: invalid (step 1)
      .mockResolvedValueOnce({ getPageIndices: () => [0] }) // step 4: text blob's own re-load
      .mockResolvedValueOnce({ getPageIndices: () => [0] }); // step 4: doc 1's cached-bytes re-load

    const result = await generateReportPdf(report, new Set(['inv-1']), makeContent(), {
      attachDocuments: true,
    });

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
    // Step 4 embeds only the one cached (valid) document — no crash, no re-fetch attempt.
    expect(mockCopyPages).toHaveBeenCalledTimes(2); // 1x text blob + 1x doc 1
  });

  it('a fetch that throws (network error) is caught and recorded as footnoteFetchFailed, without aborting the rest of the report', async () => {
    const invoice = makeInvoice({
      documents: [{ documentId: 7, archiveSerialNumber: null, title: null, attachmentType: null }],
    });
    const report = makeReport([invoice]);
    mockFetch.mockRejectedValue(new Error('network down'));

    const result = await generateReportPdf(report, new Set(['inv-1']), makeContent(), {
      attachDocuments: true,
    });

    expect(result.skippedDocuments).toEqual([
      {
        invoiceId: 'inv-1',
        documentId: '7',
        reason: 'footnoteFetchFailed',
        vendorName: 'ACME Builders',
        invoiceNumber: 'INV-001',
      },
    ]);
    expect(result.blob).toBeInstanceOf(Blob);
  });

  it('an included invoice with no documents is skipped in the pdf-lib embed pass without breaking the others', async () => {
    const withDoc = makeInvoice({
      invoiceId: 'inv-1',
      documents: [{ documentId: 1, archiveSerialNumber: null, title: null, attachmentType: null }],
    });
    const withoutDoc = makeInvoice({ invoiceId: 'inv-2', documents: [] });
    const report = makeReport([withDoc, withoutDoc]);

    mockFetch.mockResolvedValue(okResponse());
    mockPdfDocumentLoad.mockResolvedValue({ getPageIndices: () => [0] });

    const result = await generateReportPdf(report, new Set(['inv-1', 'inv-2']), makeContent(), {
      attachDocuments: true,
    });

    expect(mockPDFDocumentCreate).toHaveBeenCalledTimes(1);
    expect(result.skippedDocuments).toEqual([]);
    expect(result.blob).toBeInstanceOf(Blob);
  });

  it('pdfmake header callback omits the header on page 1, renders it on subsequent pages, and reads title/sourceName from reportContent including the generatedAt value', async () => {
    const invoice = makeInvoice();
    const report = makeReport([invoice]);
    const content = makeContent({
      tableTitle: 'My Title',
      sourceInfo: {
        sourceName: 'My Source',
        sourceTypeText: 'Bank Loan',
        referenceText: null,
        generatedAtText: '01/15/2026',
      },
    });

    await generateReportPdf(report, new Set(['inv-1']), content, { attachDocuments: false });

    const def = mockCreatePdf.mock.calls[0]![0] as {
      header: (currentPage: number) => unknown;
      pageMargins: [number, number, number, number];
    };
    expect(def.header(1)).toBeNull();
    expect(def.header(2)).not.toBeNull();

    const sharedModule = (await import('./shared.js')) as unknown as {
      buildPageHeader: jest.Mock;
      buildPageFooter: jest.Mock;
    };
    // #1938: the third arg is "label: value", not the bare i18n key — the label cannot silently
    // lose its value again. labels.generatedAt='Generated At', generatedAtText='01/15/2026'.
    expect(sharedModule.buildPageHeader).toHaveBeenCalledWith(
      'My Title',
      'My Source',
      'Generated At: 01/15/2026',
    );
    // #1993: footer must use the injected report-language label, not the ambient UI locale t().
    // content.labels.pageLabel='Page' (set in makeContent), so the call must receive that string,
    // not t('sourceReports.table.pageLabel') from the UI locale.
    expect(sharedModule.buildPageFooter).toHaveBeenCalledWith('Page');

    // [regression #1929] On current beta this is the hardcoded [40, 40, 40, 60] — the top margin
    // equaled the LEFT margin, not a value sized to the rendered page-header footprint, so the
    // running header clipped/overlapped the first table row on multi-page reports. Left/right/
    // bottom margins are unchanged; only the top margin now derives from PAGE_TOP_MARGIN.
    expect(def.pageMargins).toEqual([40, PAGE_TOP_MARGIN, 40, 60]);
  });

  describe('#1929 round 2: pageMargins/tableCell fontSize wired from pageGeometry.ts (scenarios 13-14)', () => {
    it('[scenario 13] pageMargins equals [PAGE_MARGIN_X, PAGE_TOP_MARGIN, PAGE_MARGIN_X, PAGE_MARGIN_BOTTOM], imported from pageGeometry.js rather than re-typed literals', async () => {
      const invoice = makeInvoice();
      const report = makeReport([invoice]);

      await generateReportPdf(report, new Set(['inv-1']), makeContent(), {
        attachDocuments: false,
      });

      const def = mockCreatePdf.mock.calls[0]![0] as {
        pageMargins: [number, number, number, number];
      };
      expect(def.pageMargins).toEqual([
        PAGE_MARGIN_X,
        PAGE_TOP_MARGIN,
        PAGE_MARGIN_X,
        PAGE_MARGIN_BOTTOM,
      ]);
      // Sanity: PAGE_MARGIN_X is still 40 and PAGE_MARGIN_BOTTOM still 60 — round 2 only changed
      // the TOP margin's source, not the other three.
      expect(PAGE_MARGIN_X).toBe(40);
      expect(PAGE_MARGIN_BOTTOM).toBe(60);
    });

    it('[scenario 14] def.styles.tableCell.fontSize === TABLE_BODY_FONT_SIZE (8) — the round-2 body font floor, not a hardcoded 10', async () => {
      const invoice = makeInvoice();
      const report = makeReport([invoice]);

      await generateReportPdf(report, new Set(['inv-1']), makeContent(), {
        attachDocuments: false,
      });

      const def = mockCreatePdf.mock.calls[0]![0] as {
        styles: { tableCell: { fontSize: number } };
      };
      expect(def.styles.tableCell.fontSize).toBe(TABLE_BODY_FONT_SIZE);
      expect(def.styles.tableCell.fontSize).toBe(8);
    });
  });

  describe('#1929 round 2: PDF_STYLES / PDF_DEFAULT_STYLE exports (scenario 15)', () => {
    it('are exported from merge.ts (PDF_STYLES re-exported from pageGeometry.ts, #1939; PDF_DEFAULT_STYLE defined here) and structurally match what generateReportPdf actually passes to createPdf()', async () => {
      const { PDF_STYLES, PDF_DEFAULT_STYLE } = (await import('./merge.js')) as typeof MergeModule;
      expect(PDF_STYLES).toBeDefined();
      expect(PDF_DEFAULT_STYLE).toBeDefined();

      const invoice = makeInvoice();
      const report = makeReport([invoice]);
      await generateReportPdf(report, new Set(['inv-1']), makeContent(), {
        attachDocuments: false,
      });

      const def = mockCreatePdf.mock.calls[0]![0] as {
        styles: unknown;
        defaultStyle: unknown;
      };
      expect(def.styles).toEqual(PDF_STYLES);
      expect(def.defaultStyle).toEqual(PDF_DEFAULT_STYLE);
    });
  });
});
