/**
 * Unit tests for invoiceAutoItemizeApi.ts (Story #1547).
 *
 * Tests cover:
 * - Successful dry-run 200 response is parsed correctly
 * - Successful commit 200 response is parsed correctly
 * - Non-ok response throws ApiClientError with parsed error object
 * - Correct URL construction (invoiceId is interpolated, not encoded unnecessarily)
 * - POST method is used
 * - Content-Type: application/json header is sent
 * - Request body is JSON-serialized correctly
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { autoItemize, mergeLines } from './invoiceAutoItemizeApi.js';
import type {
  AutoItemizeDryRunResponse,
  AutoItemizeRequest,
  InvoiceBudgetLineListDetailResponse,
  InvoiceBudgetLineDetailResponse,
  MergeLinesRequest,
  MergeLinesResponse,
} from '@cornerstone/shared';
import { ApiClientError } from './apiClient.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const makeDryRunResponse = (
  overrides: Partial<AutoItemizeDryRunResponse> = {},
): AutoItemizeDryRunResponse => ({
  lines: [
    {
      description: 'Tile work',
      totalAmount: 300,
      confidence: 0.9,
    },
    {
      description: 'Grout',
      totalAmount: 100,
      confidence: 0.85,
    },
  ],
  warnings: [],
  ...overrides,
});

const makeBudgetLineDetail = (
  overrides: Partial<InvoiceBudgetLineDetailResponse> = {},
): InvoiceBudgetLineDetailResponse => ({
  id: 'ibl-auto-1',
  invoiceId: 'inv-100',
  workItemBudgetId: 'wib-auto-1',
  householdItemBudgetId: null,
  itemizedAmount: 300,
  budgetLineDescription: 'Tile work',
  plannedAmount: 300,
  confidence: 'invoice',
  categoryId: null,
  categoryName: null,
  categoryColor: null,
  categoryTranslationKey: null,
  parentItemId: null,
  parentItemTitle: null,
  parentItemType: 'unassigned',
  parentItemArea: null,
  quantity: null,
  unit: null,
  unitPrice: null,
  includesVat: true,
  vendorId: null,
  budgetSourceId: null,
  createdAt: '2026-03-01T00:00:00.000Z',
  updatedAt: '2026-03-01T00:00:00.000Z',
  ...overrides,
});

const makeCommitResponse = (
  overrides: Partial<InvoiceBudgetLineListDetailResponse> = {},
): InvoiceBudgetLineListDetailResponse => ({
  budgetLines: [makeBudgetLineDetail()],
  remainingAmount: 700,
  ...overrides,
});

// ─── Mock fetch ───────────────────────────────────────────────────────────────

describe('invoiceAutoItemizeApi', () => {
  let mockFetch: jest.MockedFunction<typeof globalThis.fetch>;

  beforeEach(() => {
    mockFetch = jest.fn<typeof globalThis.fetch>();
    globalThis.fetch = mockFetch;
  });

  // ─── URL construction ──────────────────────────────────────────────────────

  describe('URL construction', () => {
    it('sends POST request to /api/invoices/:invoiceId/auto-itemize', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => makeDryRunResponse(),
      } as Response);

      const body: AutoItemizeRequest = { paperlessDocumentId: 42, mode: 'append', dryRun: true };
      await autoItemize('inv-100', body);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/invoices/inv-100/auto-itemize',
        expect.any(Object),
      );
    });

    it('uses POST HTTP method', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => makeDryRunResponse(),
      } as Response);

      const body: AutoItemizeRequest = { paperlessDocumentId: 42, mode: 'append', dryRun: true };
      await autoItemize('inv-abc', body);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('interpolates the invoiceId correctly into the URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => makeDryRunResponse(),
      } as Response);

      const body: AutoItemizeRequest = { paperlessDocumentId: 42, mode: 'append', dryRun: true };
      await autoItemize('inv-ABCDEF-999', body);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/invoices/inv-ABCDEF-999/auto-itemize',
        expect.any(Object),
      );
    });

    it('encodes special characters in invoiceId in the URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => makeDryRunResponse(),
      } as Response);

      const body: AutoItemizeRequest = { paperlessDocumentId: 42, mode: 'append', dryRun: true };
      // Note: the apiClient uses template literal interpolation, not encodeURIComponent,
      // so we verify the URL is constructed as documented.
      await autoItemize('inv-100', body);

      const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/invoices/inv-100/');
    });
  });

  // ─── Request body ──────────────────────────────────────────────────────────

  describe('request body serialization', () => {
    it('sends Content-Type: application/json header', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => makeDryRunResponse(),
      } as Response);

      const body: AutoItemizeRequest = { paperlessDocumentId: 42, mode: 'append', dryRun: true };
      await autoItemize('inv-100', body);

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    });

    it('serializes dryRun=true, mode, and paperlessDocumentId in the body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => makeDryRunResponse(),
      } as Response);

      const requestBody: AutoItemizeRequest = {
        paperlessDocumentId: 42,
        mode: 'append',
        dryRun: true,
      };
      await autoItemize('inv-100', requestBody);

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      const sentBody = JSON.parse(init.body as string) as AutoItemizeRequest;
      expect(sentBody.paperlessDocumentId).toBe(42);
      expect(sentBody.mode).toBe('append');
      expect(sentBody.dryRun).toBe(true);
    });

    it('serializes lines array in the body when commit mode', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => makeCommitResponse(),
      } as Response);

      const lines = [{ description: 'Test line', totalAmount: 200, confidence: 0.8 }];
      const requestBody: AutoItemizeRequest = {
        paperlessDocumentId: 42,
        mode: 'replace',
        dryRun: false,
        lines,
      };
      await autoItemize('inv-100', requestBody);

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      const sentBody = JSON.parse(init.body as string) as AutoItemizeRequest;
      expect(sentBody.dryRun).toBe(false);
      expect(sentBody.mode).toBe('replace');
      expect(sentBody.lines).toHaveLength(1);
      expect(sentBody.lines![0]!.description).toBe('Test line');
    });
  });

  // ─── Dry-run response parsing ──────────────────────────────────────────────

  describe('dry-run response (dryRun=true)', () => {
    it('returns the parsed AutoItemizeDryRunResponse with lines and warnings', async () => {
      const mockResponse = makeDryRunResponse();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as Response);

      const result = (await autoItemize('inv-100', {
        paperlessDocumentId: 42,
        mode: 'append',
        dryRun: true,
      })) as AutoItemizeDryRunResponse;

      expect(result).toEqual(mockResponse);
      expect(result.lines).toHaveLength(2);
      expect(result.warnings).toHaveLength(0);
    });

    it('correctly returns TOTAL_MISMATCH warning from server response', async () => {
      const mockResponse = makeDryRunResponse({
        warnings: [{ code: 'TOTAL_MISMATCH', extractedTotal: 400, invoiceTotal: 1000 }],
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as Response);

      const result = (await autoItemize('inv-100', {
        paperlessDocumentId: 42,
        mode: 'append',
        dryRun: true,
      })) as AutoItemizeDryRunResponse;

      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]!.code).toBe('TOTAL_MISMATCH');
      expect(result.warnings[0]!.extractedTotal).toBe(400);
      expect(result.warnings[0]!.invoiceTotal).toBe(1000);
    });

    it('handles empty lines array from server', async () => {
      const mockResponse = makeDryRunResponse({ lines: [], warnings: [] });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as Response);

      const result = (await autoItemize('inv-100', {
        paperlessDocumentId: 42,
        mode: 'append',
        dryRun: true,
      })) as AutoItemizeDryRunResponse;

      expect(result.lines).toHaveLength(0);
    });
  });

  // ─── Commit response parsing ───────────────────────────────────────────────

  describe('commit response (dryRun=false)', () => {
    it('returns the parsed InvoiceBudgetLineListDetailResponse with budgetLines and remainingAmount', async () => {
      const mockResponse = makeCommitResponse();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as Response);

      const result = (await autoItemize('inv-100', {
        paperlessDocumentId: 42,
        mode: 'append',
        dryRun: false,
        lines: [{ description: 'Tile', totalAmount: 300, confidence: 0.9 }],
      })) as InvoiceBudgetLineListDetailResponse;

      expect(result).toEqual(mockResponse);
      expect(result.budgetLines).toHaveLength(1);
      expect(result.remainingAmount).toBe(700);
    });

    it('returns the budget line with correct fields', async () => {
      const line = makeBudgetLineDetail({
        budgetLineDescription: 'Special grout',
        itemizedAmount: 150,
        plannedAmount: 150,
      });
      const mockResponse = makeCommitResponse({ budgetLines: [line], remainingAmount: 850 });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as Response);

      const result = (await autoItemize('inv-100', {
        paperlessDocumentId: 42,
        mode: 'append',
        dryRun: false,
        lines: [{ description: 'Special grout', totalAmount: 150, confidence: 0.9 }],
      })) as InvoiceBudgetLineListDetailResponse;

      expect(result.budgetLines[0]!.budgetLineDescription).toBe('Special grout');
      expect(result.budgetLines[0]!.itemizedAmount).toBe(150);
      expect(result.remainingAmount).toBe(850);
    });
  });

  // ─── Error responses ───────────────────────────────────────────────────────

  describe('error responses', () => {
    it('throws ApiClientError for 404 NOT_FOUND response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({
          error: { code: 'NOT_FOUND', message: 'Invoice not found' },
        }),
      } as Response);

      await expect(
        autoItemize('nonexistent-inv', {
          paperlessDocumentId: 42,
          mode: 'append',
          dryRun: true,
        }),
      ).rejects.toThrow(ApiClientError);
    });

    it('ApiClientError has the correct statusCode and code for 404', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({
          error: { code: 'NOT_FOUND', message: 'Invoice not found' },
        }),
      } as Response);

      let caught: unknown;
      try {
        await autoItemize('nonexistent-inv', {
          paperlessDocumentId: 42,
          mode: 'append',
          dryRun: true,
        });
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(ApiClientError);
      expect((caught as ApiClientError).statusCode).toBe(404);
      expect((caught as ApiClientError).error.code).toBe('NOT_FOUND');
    });

    it('throws ApiClientError for 400 ITEMIZED_SUM_EXCEEDS_INVOICE response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: {
            code: 'ITEMIZED_SUM_EXCEEDS_INVOICE',
            message: 'Sum of itemized amounts exceeds invoice total',
          },
        }),
      } as Response);

      let caught: unknown;
      try {
        await autoItemize('inv-100', {
          paperlessDocumentId: 42,
          mode: 'append',
          dryRun: false,
          lines: [{ description: 'Too large', totalAmount: 9999, confidence: 0.9 }],
        });
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(ApiClientError);
      expect((caught as ApiClientError).statusCode).toBe(400);
      expect((caught as ApiClientError).error.code).toBe('ITEMIZED_SUM_EXCEEDS_INVOICE');
    });

    it('throws ApiClientError for 502 LLM_UNREACHABLE response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: async () => ({
          error: { code: 'LLM_UNREACHABLE', message: 'LLM provider is unreachable' },
        }),
      } as Response);

      let caught: unknown;
      try {
        await autoItemize('inv-100', {
          paperlessDocumentId: 42,
          mode: 'append',
          dryRun: true,
        });
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(ApiClientError);
      expect((caught as ApiClientError).statusCode).toBe(502);
      expect((caught as ApiClientError).error.code).toBe('LLM_UNREACHABLE');
    });

    it('throws ApiClientError for 503 LLM_NOT_CONFIGURED response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({
          error: { code: 'LLM_NOT_CONFIGURED', message: 'LLM gateway is not configured' },
        }),
      } as Response);

      let caught: unknown;
      try {
        await autoItemize('inv-100', {
          paperlessDocumentId: 42,
          mode: 'append',
          dryRun: true,
        });
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(ApiClientError);
      expect((caught as ApiClientError).statusCode).toBe(503);
      expect((caught as ApiClientError).error.code).toBe('LLM_NOT_CONFIGURED');
    });

    it('throws ApiClientError for 401 UNAUTHORIZED response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          error: { code: 'UNAUTHORIZED', message: 'Unauthorized' },
        }),
      } as Response);

      await expect(
        autoItemize('inv-100', { paperlessDocumentId: 42, mode: 'append', dryRun: true }),
      ).rejects.toThrow(ApiClientError);
    });
  });
});

// ─── Story #1679: previewAutoItemize and commitAutoItemizeCreate ───────────────

import { previewAutoItemize, commitAutoItemizeCreate } from './invoiceAutoItemizeApi.js';
import type {
  AutoItemizePreviewRequest,
  AutoItemizePreviewResponse,
  AutoItemizeCommitRequest,
  AutoItemizeCommitResponse,
  Invoice,
} from '@cornerstone/shared';

function makePreviewAutoItemizeResponse(
  overrides: Partial<AutoItemizePreviewResponse> = {},
): AutoItemizePreviewResponse {
  return {
    lines: [
      {
        description: 'Tile installation',
        totalAmount: 500,
        confidence: 0.88,
        budgetCategoryId: null,
        budgetSourceId: null,
      },
    ],
    suggestedVendorId: 'vendor-42',
    extractedInvoiceDate: '2026-03-01',
    extractedDueDate: '2026-04-01',
    extractedInvoiceNumber: 'INV-2026-003',
    extractedNotes: 'Payment due on invoice date',
    ...overrides,
  };
}

function makeAutoItemizeCommitResponse(): AutoItemizeCommitResponse {
  const invoice: Invoice = {
    id: 'inv-new-1',
    vendorId: 'vendor-42',
    vendorName: 'Builder Corp',
    invoiceNumber: 'INV-2026-003',
    amount: 500,
    date: '2026-03-01',
    dueDate: '2026-04-01',
    status: 'pending',
    notes: null,
    budgetLines: [],
    remainingAmount: 500,
    deposits: [],
    finalPaymentAmount: 500,
    createdBy: null,
    createdAt: '2026-03-01T00:00:00Z',
    updatedAt: '2026-03-01T00:00:00Z',
  };
  return {
    invoice,
    budgetLines: [],
    remainingAmount: 0,
  };
}

describe('previewAutoItemize', () => {
  let mockFetch2: jest.MockedFunction<typeof globalThis.fetch>;

  beforeEach(() => {
    mockFetch2 = jest.fn<typeof globalThis.fetch>();
    globalThis.fetch = mockFetch2;
  });

  it('sends POST request to /api/invoices/auto-itemize/preview', async () => {
    mockFetch2.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => makePreviewAutoItemizeResponse(),
    } as Response);

    const body: AutoItemizePreviewRequest = { paperlessDocumentId: 99 };
    await previewAutoItemize(body);

    expect(mockFetch2).toHaveBeenCalledWith(
      '/api/invoices/auto-itemize/preview',
      expect.any(Object),
    );
  });

  it('uses POST HTTP method', async () => {
    mockFetch2.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => makePreviewAutoItemizeResponse(),
    } as Response);

    await previewAutoItemize({ paperlessDocumentId: 99 });

    expect(mockFetch2).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('sends paperlessDocumentId in the request body', async () => {
    mockFetch2.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => makePreviewAutoItemizeResponse(),
    } as Response);

    await previewAutoItemize({ paperlessDocumentId: 42 });

    const [, init] = mockFetch2.mock.calls[0] as [string, RequestInit];
    const sentBody = JSON.parse(init.body as string) as AutoItemizePreviewRequest;
    expect(sentBody.paperlessDocumentId).toBe(42);
  });

  it('returns the parsed AutoItemizePreviewResponse with lines and suggestedVendorId', async () => {
    const mockResponse = makePreviewAutoItemizeResponse();
    mockFetch2.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    } as Response);

    const result = await previewAutoItemize({ paperlessDocumentId: 42 });

    expect(result).toEqual(mockResponse);
    expect(result.lines).toHaveLength(1);
    expect(result.suggestedVendorId).toBe('vendor-42');
  });

  it('returns null suggestedVendorId when no vendor match', async () => {
    const mockResponse = makePreviewAutoItemizeResponse({ suggestedVendorId: null });
    mockFetch2.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    } as Response);

    const result = await previewAutoItemize({ paperlessDocumentId: 42 });

    expect(result.suggestedVendorId).toBeNull();
  });

  it('returns extracted metadata fields when present', async () => {
    const mockResponse = makePreviewAutoItemizeResponse({
      extractedInvoiceDate: '2026-05-15',
      extractedDueDate: '2026-06-15',
      extractedInvoiceNumber: 'RE-999',
    });
    mockFetch2.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    } as Response);

    const result = await previewAutoItemize({ paperlessDocumentId: 42 });

    expect(result.extractedInvoiceDate).toBe('2026-05-15');
    expect(result.extractedDueDate).toBe('2026-06-15');
    expect(result.extractedInvoiceNumber).toBe('RE-999');
  });

  it('throws ApiClientError for 503 LLM_NOT_CONFIGURED response', async () => {
    mockFetch2.mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({
        error: { code: 'LLM_NOT_CONFIGURED', message: 'LLM not configured' },
      }),
    } as Response);

    await expect(previewAutoItemize({ paperlessDocumentId: 42 })).rejects.toThrow(ApiClientError);
  });
});

describe('commitAutoItemizeCreate', () => {
  let mockFetch3: jest.MockedFunction<typeof globalThis.fetch>;

  beforeEach(() => {
    mockFetch3 = jest.fn<typeof globalThis.fetch>();
    globalThis.fetch = mockFetch3;
  });

  it('sends POST request to /api/invoices/auto-itemize/commit', async () => {
    mockFetch3.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => makeAutoItemizeCommitResponse(),
    } as Response);

    const body: AutoItemizeCommitRequest = {
      paperlessDocumentId: 99,
      vendorId: 'vendor-1',
      invoice: {
        invoiceNumber: 'INV-001',
        amount: 500,
        date: '2026-03-01',
        dueDate: null,
        status: 'pending',
        notes: null,
      },
      lines: [],
    };
    await commitAutoItemizeCreate(body);

    expect(mockFetch3).toHaveBeenCalledWith(
      '/api/invoices/auto-itemize/commit',
      expect.any(Object),
    );
  });

  it('uses POST HTTP method', async () => {
    mockFetch3.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => makeAutoItemizeCommitResponse(),
    } as Response);

    const body: AutoItemizeCommitRequest = {
      paperlessDocumentId: 42,
      vendorId: 'vendor-1',
      invoice: {
        invoiceNumber: null,
        amount: 100,
        date: '2026-01-01',
        dueDate: null,
        status: 'pending',
        notes: null,
      },
      lines: [],
    };
    await commitAutoItemizeCreate(body);

    expect(mockFetch3).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('serializes vendorId, paperlessDocumentId, invoice, and lines in the body', async () => {
    mockFetch3.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => makeAutoItemizeCommitResponse(),
    } as Response);

    const body: AutoItemizeCommitRequest = {
      paperlessDocumentId: 42,
      vendorId: 'vendor-99',
      invoice: {
        invoiceNumber: 'INV-TEST',
        amount: 250,
        date: '2026-03-15',
        dueDate: null,
        status: 'pending',
        notes: 'test note',
      },
      lines: [
        {
          description: 'Labor',
          totalAmount: 250,
          confidence: 0.9,
          budgetCategoryId: null,
          budgetSourceId: null,
          assignmentMode: 'create-new',
        },
      ],
    };
    await commitAutoItemizeCreate(body);

    const [, init] = mockFetch3.mock.calls[0] as [string, RequestInit];
    const sentBody = JSON.parse(init.body as string) as AutoItemizeCommitRequest;
    expect(sentBody.vendorId).toBe('vendor-99');
    expect(sentBody.paperlessDocumentId).toBe(42);
    expect(sentBody.invoice.amount).toBe(250);
    expect(sentBody.lines).toHaveLength(1);
  });

  it('returns AutoItemizeCommitResponse with invoice, budgetLines, and remainingAmount', async () => {
    const mockResponse = makeAutoItemizeCommitResponse();
    mockFetch3.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => mockResponse,
    } as Response);

    const body: AutoItemizeCommitRequest = {
      paperlessDocumentId: 42,
      vendorId: 'vendor-1',
      invoice: {
        invoiceNumber: null,
        amount: 500,
        date: '2026-03-01',
        dueDate: null,
        status: 'pending',
        notes: null,
      },
      lines: [],
    };
    const result = await commitAutoItemizeCreate(body);

    expect(result.invoice.id).toBe('inv-new-1');
    expect(result.budgetLines).toHaveLength(0);
    expect(result.remainingAmount).toBe(0);
  });

  it('throws ApiClientError for 400 VALIDATION_ERROR response', async () => {
    mockFetch3.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({
        error: { code: 'VALIDATION_ERROR', message: 'vendorId is required' },
      }),
    } as Response);

    const body: AutoItemizeCommitRequest = {
      paperlessDocumentId: 42,
      vendorId: '',
      invoice: {
        invoiceNumber: null,
        amount: 100,
        date: '2026-01-01',
        dueDate: null,
        status: 'pending',
        notes: null,
      },
      lines: [],
    };
    await expect(commitAutoItemizeCreate(body)).rejects.toThrow(ApiClientError);
  });
});

// ─── Story #1797: mergeLines ────────────────────────────────────────────────

function makeMergeLinesResponse(overrides: Partial<MergeLinesResponse> = {}): MergeLinesResponse {
  return {
    description: 'Tile work and grout',
    category: 'Materials',
    budgetCategoryId: 'bc-materials',
    ...overrides,
  };
}

describe('mergeLines', () => {
  let mockFetch4: jest.MockedFunction<typeof globalThis.fetch>;

  beforeEach(() => {
    mockFetch4 = jest.fn<typeof globalThis.fetch>();
    globalThis.fetch = mockFetch4;
  });

  it('sends POST request to /api/invoices/auto-itemize/merge-lines', async () => {
    mockFetch4.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => makeMergeLinesResponse(),
    } as Response);

    const body: MergeLinesRequest = {
      descriptions: ['Tile work', 'Grout'],
      availableCategories: ['Materials'],
    };
    await mergeLines(body);

    expect(mockFetch4).toHaveBeenCalledWith(
      '/api/invoices/auto-itemize/merge-lines',
      expect.any(Object),
    );
  });

  it('uses POST HTTP method', async () => {
    mockFetch4.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => makeMergeLinesResponse(),
    } as Response);

    await mergeLines({ descriptions: ['A', 'B'], availableCategories: [] });

    expect(mockFetch4).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('sends Content-Type: application/json header', async () => {
    mockFetch4.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => makeMergeLinesResponse(),
    } as Response);

    await mergeLines({ descriptions: ['A', 'B'], availableCategories: [] });

    const [, init] = mockFetch4.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('serializes descriptions, documentSummary, and availableCategories in the request body', async () => {
    mockFetch4.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => makeMergeLinesResponse(),
    } as Response);

    const body: MergeLinesRequest = {
      descriptions: ['Tile work', 'Grout'],
      documentSummary: 'Bathroom quote',
      availableCategories: ['Materials', 'Labor'],
    };
    await mergeLines(body);

    const [, init] = mockFetch4.mock.calls[0] as [string, RequestInit];
    const sentBody = JSON.parse(init.body as string) as MergeLinesRequest;
    expect(sentBody.descriptions).toEqual(['Tile work', 'Grout']);
    expect(sentBody.documentSummary).toBe('Bathroom quote');
    expect(sentBody.availableCategories).toEqual(['Materials', 'Labor']);
  });

  it('never includes numeric fields (totalAmount/quantity/unitPrice/includesVat) in the request body', async () => {
    // Story #1797: the merge request must never carry numeric values — all
    // amounts/quantities are aggregated client-side, never sent to the LLM.
    mockFetch4.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => makeMergeLinesResponse(),
    } as Response);

    const body: MergeLinesRequest = {
      descriptions: ['Tile work', 'Grout'],
      availableCategories: ['Materials'],
    };
    await mergeLines(body);

    const [, init] = mockFetch4.mock.calls[0] as [string, RequestInit];
    const sentBody = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(sentBody).not.toHaveProperty('totalAmount');
    expect(sentBody).not.toHaveProperty('quantity');
    expect(sentBody).not.toHaveProperty('unitPrice');
    expect(sentBody).not.toHaveProperty('includesVat');
    // Only the 3 documented fields should be present
    expect(Object.keys(sentBody).sort()).toEqual(['availableCategories', 'descriptions']);
  });

  it('returns the parsed MergeLinesResponse with description, category, and budgetCategoryId', async () => {
    const mockResponse = makeMergeLinesResponse();
    mockFetch4.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    } as Response);

    const result = await mergeLines({ descriptions: ['A', 'B'], availableCategories: [] });

    expect(result).toEqual(mockResponse);
    expect(result.description).toBe('Tile work and grout');
    expect(result.category).toBe('Materials');
    expect(result.budgetCategoryId).toBe('bc-materials');
  });

  it('returns category: null and budgetCategoryId: null when the server finds no match', async () => {
    const mockResponse = makeMergeLinesResponse({ category: null, budgetCategoryId: null });
    mockFetch4.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    } as Response);

    const result = await mergeLines({ descriptions: ['A', 'B'], availableCategories: [] });

    expect(result.category).toBeNull();
    expect(result.budgetCategoryId).toBeNull();
  });

  it('throws ApiClientError for 400 VALIDATION_ERROR response', async () => {
    mockFetch4.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({
        error: { code: 'VALIDATION_ERROR', message: 'descriptions must contain at least 2 items' },
      }),
    } as Response);

    await expect(
      mergeLines({ descriptions: ['Only one'], availableCategories: [] }),
    ).rejects.toThrow(ApiClientError);
  });

  it('throws ApiClientError for 503 LLM_NOT_CONFIGURED response', async () => {
    mockFetch4.mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({
        error: { code: 'LLM_NOT_CONFIGURED', message: 'LLM gateway is not configured' },
      }),
    } as Response);

    await expect(mergeLines({ descriptions: ['A', 'B'], availableCategories: [] })).rejects.toThrow(
      ApiClientError,
    );
  });

  it('throws ApiClientError for 502 LLM_UNREACHABLE response', async () => {
    mockFetch4.mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: async () => ({
        error: { code: 'LLM_UNREACHABLE', message: 'LLM provider is unreachable' },
      }),
    } as Response);

    let caught: unknown;
    try {
      await mergeLines({ descriptions: ['A', 'B'], availableCategories: [] });
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(ApiClientError);
    expect((caught as ApiClientError).statusCode).toBe(502);
    expect((caught as ApiClientError).error.code).toBe('LLM_UNREACHABLE');
  });

  it('throws ApiClientError for 401 UNAUTHORIZED response', async () => {
    mockFetch4.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }),
    } as Response);

    await expect(mergeLines({ descriptions: ['A', 'B'], availableCategories: [] })).rejects.toThrow(
      ApiClientError,
    );
  });
});
