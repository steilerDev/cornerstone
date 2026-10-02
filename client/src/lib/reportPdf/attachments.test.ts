/**
 * Unit tests for client/src/lib/reportPdf/attachments.ts (#2161): acquireAttachments and
 * countUncachedDocuments.
 *
 * Mocks ./loader.js (PDFDocument.load decides valid vs invalid bytes) and ../paperlessApi.js;
 * `fetch` is stubbed per test.
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import type { SourceReportResponse, SourceReportInvoice } from '@cornerstone/shared';
import type * as AttachmentsModule from './attachments.js';
import type { AttachmentCache } from './types.js';

const mockPdfDocumentLoad = jest.fn<(bytes: ArrayBuffer) => Promise<unknown>>();

jest.unstable_mockModule('./loader.js', () => ({
  loadPdfLibs: jest.fn(async () => ({
    pdfMake: {},
    PDFDocument: { load: mockPdfDocumentLoad },
  })),
}));

jest.unstable_mockModule('../paperlessApi.js', () => ({
  getDocumentPreviewUrl: (id: number) => `/api/paperless/documents/${id}/preview`,
}));

let acquireAttachments: typeof AttachmentsModule.acquireAttachments;
let countUncachedDocuments: typeof AttachmentsModule.countUncachedDocuments;
let mockFetch: jest.MockedFunction<typeof globalThis.fetch>;
const originalFetch = globalThis.fetch;

/** ArrayBuffer of `n` bytes whose first byte tags it, so tests can tell documents apart. */
function bytesOf(n: number, tag = 0): ArrayBuffer {
  const buf = new Uint8Array(n);
  buf[0] = tag;
  return buf.buffer;
}

function okResponse(bytes: ArrayBuffer): Response {
  return { ok: true, status: 200, arrayBuffer: async () => bytes } as unknown as Response;
}

function failResponse(status = 404): Response {
  return { ok: false, status, arrayBuffer: async () => new ArrayBuffer(0) } as unknown as Response;
}

function makeInvoice(
  invoiceId: string,
  documentIds: number[],
  overrides: Partial<SourceReportInvoice> = {},
): SourceReportInvoice {
  return {
    invoiceId,
    vendorId: `vend-${invoiceId}`,
    vendorName: `Vendor ${invoiceId}`,
    invoiceNumber: `N-${invoiceId}`,
    date: '2026-01-10',
    status: 'pending',
    invoiceAmount: 100,
    allocatedAmount: 100,
    lineKind: 'invoice',
    isSplit: false,
    splitKind: null,
    documents: documentIds.map((documentId) => ({
      documentId,
      archiveSerialNumber: null,
      title: `Doc ${documentId}`,
      attachmentType: null,
    })),
    budgetLinesForSource: [],
    depositsVisibleToSource: [],
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
    totalAmount: 0,
    unallocatedInvoices: [],
    generatedAt: '2026-01-15T00:00:00.000Z',
  };
}

beforeEach(async () => {
  ({ acquireAttachments, countUncachedDocuments } =
    (await import('./attachments.js')) as typeof AttachmentsModule);
  mockPdfDocumentLoad.mockReset();
  mockPdfDocumentLoad.mockResolvedValue({});
  mockFetch = jest.fn<typeof globalThis.fetch>();
  globalThis.fetch = mockFetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('acquireAttachments — fetching and validating', () => {
  it('fetches each document with credentials, validates it, caches it and returns the attachment', async () => {
    const bytes = bytesOf(500, 7);
    mockFetch.mockResolvedValue(okResponse(bytes));
    const cache: AttachmentCache = new Map();
    const report = makeReport([makeInvoice('inv-1', [11])]);

    const result = await acquireAttachments(report, new Set(['inv-1']), cache);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith('/api/paperless/documents/11/preview', {
      credentials: 'include',
      signal: undefined,
    });
    expect(mockPdfDocumentLoad).toHaveBeenCalledWith(bytes);
    expect(result.attachments).toEqual([
      {
        key: 'inv-1:11',
        invoiceId: 'inv-1',
        documentId: 11,
        title: 'Doc 11',
        vendorName: 'Vendor inv-1',
        invoiceNumber: 'N-inv-1',
        bytes,
        size: 500,
      },
    ]);
    expect(result.skippedDocuments).toEqual([]);
    expect(result.failedFetches).toEqual([]);
    expect(cache.get(11)).toEqual({ status: 'ok', bytes });
  });

  it('iterates report invoice order and only the included invoices', async () => {
    mockFetch.mockImplementation(async (url) =>
      okResponse(bytesOf(10, Number(/(\d+)\/preview/.exec(String(url))?.[1]))),
    );
    const report = makeReport([
      makeInvoice('inv-a', [1, 2]),
      makeInvoice('inv-excluded', [3]),
      makeInvoice('inv-b', [4]),
    ]);

    const result = await acquireAttachments(report, new Set(['inv-b', 'inv-a']), new Map());

    expect(result.attachments.map((a) => a.key)).toEqual(['inv-a:1', 'inv-a:2', 'inv-b:4']);
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(mockFetch.mock.calls.some((c) => String(c[0]).includes('/3/'))).toBe(false);
  });

  it('treats invoices without a documents array as having no documents', async () => {
    const invoice = makeInvoice('inv-1', []);
    delete (invoice as { documents?: unknown }).documents;
    const onProgress = jest.fn();

    const result = await acquireAttachments(makeReport([invoice]), new Set(['inv-1']), new Map(), {
      onProgress,
    });

    expect(result).toEqual({ attachments: [], skippedDocuments: [], failedFetches: [] });
    expect(mockFetch).not.toHaveBeenCalled();
    expect(onProgress).not.toHaveBeenCalled();
  });

  it('fetches a document linked to two invoices once and attaches it twice', async () => {
    const bytes = bytesOf(300, 9);
    mockFetch.mockResolvedValue(okResponse(bytes));
    const report = makeReport([makeInvoice('inv-1', [5]), makeInvoice('inv-2', [5])]);

    const result = await acquireAttachments(report, new Set(['inv-1', 'inv-2']), new Map());

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.attachments.map((a) => a.key)).toEqual(['inv-1:5', 'inv-2:5']);
    expect(result.attachments.map((a) => a.invoiceId)).toEqual(['inv-1', 'inv-2']);
    expect(result.attachments.every((a) => a.bytes === bytes && a.size === 300)).toBe(true);
  });
});

describe('acquireAttachments — cache behaviour', () => {
  it('uses a cached "ok" document without fetching or re-validating', async () => {
    const bytes = bytesOf(250, 1);
    const cache: AttachmentCache = new Map([[8, { status: 'ok', bytes }]]);

    const result = await acquireAttachments(
      makeReport([makeInvoice('inv-1', [8])]),
      new Set(['inv-1']),
      cache,
    );

    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockPdfDocumentLoad).not.toHaveBeenCalled();
    expect(result.attachments).toHaveLength(1);
    expect(result.attachments[0]?.bytes).toBe(bytes);
    expect(result.attachments[0]?.size).toBe(250);
  });

  it('skips a cached "invalid" document as footnoteInvalidPdf without fetching', async () => {
    const cache: AttachmentCache = new Map([[8, { status: 'invalid' }]]);

    const result = await acquireAttachments(
      makeReport([makeInvoice('inv-1', [8])]),
      new Set(['inv-1']),
      cache,
    );

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.attachments).toEqual([]);
    expect(result.skippedDocuments).toEqual([
      {
        invoiceId: 'inv-1',
        documentId: '8',
        reason: 'footnoteInvalidPdf',
        vendorName: 'Vendor inv-1',
        invoiceNumber: 'N-inv-1',
      },
    ]);
    expect(result.failedFetches).toEqual([]);
  });

  it('caches a document that fails PDF validation as "invalid" and skips it', async () => {
    mockFetch.mockResolvedValue(okResponse(bytesOf(40)));
    mockPdfDocumentLoad.mockRejectedValue(new Error('not a pdf'));
    const cache: AttachmentCache = new Map();

    const result = await acquireAttachments(
      makeReport([makeInvoice('inv-1', [2])]),
      new Set(['inv-1']),
      cache,
    );

    expect(cache.get(2)).toEqual({ status: 'invalid' });
    expect(result.attachments).toEqual([]);
    expect(result.skippedDocuments).toEqual([
      {
        invoiceId: 'inv-1',
        documentId: '2',
        reason: 'footnoteInvalidPdf',
        vendorName: 'Vendor inv-1',
        invoiceNumber: 'N-inv-1',
      },
    ]);
    expect(result.failedFetches).toEqual([]);
  });

  it('a second run over the same cache performs no fetches at all', async () => {
    mockFetch.mockResolvedValue(okResponse(bytesOf(100)));
    const cache: AttachmentCache = new Map();
    const report = makeReport([makeInvoice('inv-1', [1, 2])]);

    await acquireAttachments(report, new Set(['inv-1']), cache);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    const again = await acquireAttachments(report, new Set(['inv-1']), cache);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(again.attachments).toHaveLength(2);
  });
});

describe('acquireAttachments — failed fetches', () => {
  it('records a non-ok response as footnoteFetchFailed plus a failedFetches entry and does not cache it', async () => {
    mockFetch.mockResolvedValue(failResponse(502));
    const cache: AttachmentCache = new Map();

    const result = await acquireAttachments(
      makeReport([makeInvoice('inv-1', [3])]),
      new Set(['inv-1']),
      cache,
    );

    expect(result.attachments).toEqual([]);
    expect(result.skippedDocuments).toEqual([
      {
        invoiceId: 'inv-1',
        documentId: '3',
        reason: 'footnoteFetchFailed',
        vendorName: 'Vendor inv-1',
        invoiceNumber: 'N-inv-1',
      },
    ]);
    expect(result.failedFetches).toEqual([
      {
        invoiceId: 'inv-1',
        documentId: 3,
        title: 'Doc 3',
        vendorName: 'Vendor inv-1',
        invoiceNumber: 'N-inv-1',
      },
    ]);
    expect(cache.has(3)).toBe(false);
    expect(mockPdfDocumentLoad).not.toHaveBeenCalled();
  });

  it('records a thrown network error the same way and does not cache it', async () => {
    mockFetch.mockRejectedValue(new TypeError('network down'));
    const cache: AttachmentCache = new Map();

    const result = await acquireAttachments(
      makeReport([makeInvoice('inv-1', [3])]),
      new Set(['inv-1']),
      cache,
    );

    expect(result.skippedDocuments.map((s) => s.reason)).toEqual(['footnoteFetchFailed']);
    expect(result.failedFetches.map((f) => f.documentId)).toEqual([3]);
    expect(cache.size).toBe(0);
  });

  it('records a failure from reading the response body as a failed fetch', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      arrayBuffer: async () => {
        throw new Error('body stream broke');
      },
    } as unknown as Response);

    const result = await acquireAttachments(
      makeReport([makeInvoice('inv-1', [3])]),
      new Set(['inv-1']),
      new Map(),
    );

    expect(result.failedFetches).toHaveLength(1);
  });

  it('retries a previously failed document on the next run (failures are not cached)', async () => {
    mockFetch.mockResolvedValueOnce(failResponse(500));
    const cache: AttachmentCache = new Map();
    const report = makeReport([makeInvoice('inv-1', [3])]);

    const first = await acquireAttachments(report, new Set(['inv-1']), cache);
    expect(first.failedFetches).toHaveLength(1);

    mockFetch.mockResolvedValueOnce(okResponse(bytesOf(70)));
    const second = await acquireAttachments(report, new Set(['inv-1']), cache);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(second.failedFetches).toEqual([]);
    expect(second.attachments).toHaveLength(1);
  });

  it('does not refetch a document that already failed earlier in the same run (shared by two invoices)', async () => {
    mockFetch.mockResolvedValue(failResponse(500));
    const report = makeReport([makeInvoice('inv-1', [5]), makeInvoice('inv-2', [5])]);

    const result = await acquireAttachments(report, new Set(['inv-1', 'inv-2']), new Map());

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.failedFetches.map((f) => f.invoiceId)).toEqual(['inv-1', 'inv-2']);
    expect(result.skippedDocuments.map((s) => s.invoiceId)).toEqual(['inv-1', 'inv-2']);
  });
});

describe('acquireAttachments — skipFetch', () => {
  it('skips a skipFetch document as footnoteFetchFailed without fetching, and without a failedFetches entry', async () => {
    mockFetch.mockResolvedValue(okResponse(bytesOf(10)));
    const cache: AttachmentCache = new Map();
    const report = makeReport([makeInvoice('inv-1', [1, 2])]);

    const result = await acquireAttachments(report, new Set(['inv-1']), cache, {
      skipFetch: new Set([1]),
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(String(mockFetch.mock.calls[0]?.[0])).toContain('/documents/2/');
    expect(result.attachments.map((a) => a.documentId)).toEqual([2]);
    expect(result.skippedDocuments).toEqual([
      {
        invoiceId: 'inv-1',
        documentId: '1',
        reason: 'footnoteFetchFailed',
        vendorName: 'Vendor inv-1',
        invoiceNumber: 'N-inv-1',
      },
    ]);
    expect(result.failedFetches).toEqual([]);
    expect(cache.has(1)).toBe(false);
  });

  it('prefers the cache over skipFetch (a cached ok document is still attached)', async () => {
    const cache: AttachmentCache = new Map([[1, { status: 'ok', bytes: bytesOf(10) }]]);

    const result = await acquireAttachments(
      makeReport([makeInvoice('inv-1', [1])]),
      new Set(['inv-1']),
      cache,
      { skipFetch: new Set([1]) },
    );

    expect(result.attachments).toHaveLength(1);
    expect(result.skippedDocuments).toEqual([]);
  });
});

describe('acquireAttachments — progress and abort', () => {
  it('reports progress after every (invoice, document) pair, counting cached and skipped ones', async () => {
    mockFetch.mockResolvedValue(okResponse(bytesOf(10)));
    const cache: AttachmentCache = new Map([[1, { status: 'ok', bytes: bytesOf(10) }]]);
    const onProgress = jest.fn();
    const report = makeReport([makeInvoice('inv-1', [1, 2]), makeInvoice('inv-2', [3, 4])]);

    await acquireAttachments(report, new Set(['inv-1', 'inv-2']), cache, {
      onProgress,
      skipFetch: new Set([4]),
    });

    expect(onProgress.mock.calls).toEqual([
      [1, 4],
      [2, 4],
      [3, 4],
      [4, 4],
    ]);
  });

  it('counts total only over included invoices', async () => {
    mockFetch.mockResolvedValue(okResponse(bytesOf(10)));
    const onProgress = jest.fn();
    const report = makeReport([makeInvoice('inv-1', [1]), makeInvoice('inv-2', [2, 3])]);

    await acquireAttachments(report, new Set(['inv-1']), new Map(), { onProgress });

    expect(onProgress.mock.calls).toEqual([[1, 1]]);
  });

  it('passes the abort signal to fetch', async () => {
    mockFetch.mockResolvedValue(okResponse(bytesOf(10)));
    const controller = new AbortController();

    await acquireAttachments(
      makeReport([makeInvoice('inv-1', [1])]),
      new Set(['inv-1']),
      new Map(),
      { signal: controller.signal },
    );

    expect(mockFetch.mock.calls[0]?.[1]).toEqual({
      credentials: 'include',
      signal: controller.signal,
    });
  });

  it('rethrows an AbortError raised by fetch instead of recording a failed fetch', async () => {
    mockFetch.mockRejectedValue(new DOMException('Aborted', 'AbortError'));
    const cache: AttachmentCache = new Map();

    await expect(
      acquireAttachments(makeReport([makeInvoice('inv-1', [1])]), new Set(['inv-1']), cache),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(cache.size).toBe(0);
  });

  it('throws an AbortError before fetching when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      acquireAttachments(makeReport([makeInvoice('inv-1', [1])]), new Set(['inv-1']), new Map(), {
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('stops between documents when the signal aborts mid-run', async () => {
    const controller = new AbortController();
    mockFetch.mockImplementation(async () => {
      controller.abort();
      return okResponse(bytesOf(10));
    });
    const report = makeReport([makeInvoice('inv-1', [1, 2])]);

    await expect(
      acquireAttachments(report, new Set(['inv-1']), new Map(), { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe('countUncachedDocuments', () => {
  const report = makeReport([
    makeInvoice('inv-1', [1, 2]),
    makeInvoice('inv-2', [2, 3]),
    makeInvoice('inv-excluded', [4, 5, 6]),
  ]);
  const included = new Set(['inv-1', 'inv-2']);

  it('counts every (invoice, document) pair of included invoices when the cache is empty', () => {
    expect(countUncachedDocuments(report, included, new Map())).toBe(4);
  });

  it('excludes cached documents of either status, counting per pair (shared doc 2 counts twice)', () => {
    const cache: AttachmentCache = new Map([
      [1, { status: 'ok', bytes: bytesOf(1) }],
      [3, { status: 'invalid' }],
    ]);
    expect(countUncachedDocuments(report, included, cache)).toBe(2);
  });

  it('returns 0 when everything is cached', () => {
    const cache: AttachmentCache = new Map([
      [1, { status: 'ok', bytes: bytesOf(1) }],
      [2, { status: 'ok', bytes: bytesOf(1) }],
      [3, { status: 'ok', bytes: bytesOf(1) }],
    ]);
    expect(countUncachedDocuments(report, included, cache)).toBe(0);
  });

  it('treats invoices without a documents array as zero documents', () => {
    const invoice = makeInvoice('inv-1', []);
    delete (invoice as { documents?: unknown }).documents;
    expect(countUncachedDocuments(makeReport([invoice]), new Set(['inv-1']), new Map())).toBe(0);
  });
});
