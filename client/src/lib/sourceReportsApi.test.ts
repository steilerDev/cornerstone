/**
 * Unit tests for client/src/lib/sourceReportsApi.ts
 *
 * Covers: getSourceReport's envelope unwrap ({ report }) and query-string encoding,
 * markInvoicesClaimed's unwrapped (non-enveloped) response passthrough.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type * as SourceReportsApiModule from './sourceReportsApi.js';
import type * as ApiClientTypes from './apiClient.js';
import type { SourceReportResponse, MarkClaimedResponse } from '@cornerstone/shared';

const mockGet = jest.fn<typeof ApiClientTypes.get>();
const mockPost = jest.fn<typeof ApiClientTypes.post>();

jest.unstable_mockModule('./apiClient.js', () => ({
  get: mockGet,
  post: mockPost,
  patch: jest.fn(),
  del: jest.fn(),
  put: jest.fn(),
  setBaseUrl: jest.fn(),
  getBaseUrl: jest.fn().mockReturnValue('/api'),
}));

let sourceReportsApi: typeof SourceReportsApiModule;

beforeEach(async () => {
  sourceReportsApi = (await import('./sourceReportsApi.js')) as typeof SourceReportsApiModule;
  mockGet.mockReset();
  mockPost.mockReset();
});

const sampleReport: SourceReportResponse = {
  type: 'claim',
  source: {
    id: 'src-1',
    name: 'Home Loan',
    sourceType: 'bank_loan',
    reference: null,
    contactAddress: null,
  },
  invoices: [],
  totalAmount: 1000,
  unallocatedInvoices: [],
  generatedAt: '2026-01-15T00:00:00.000Z',
};

describe('getSourceReport', () => {
  it('calls GET /source-reports with type and sourceId query params', async () => {
    mockGet.mockResolvedValueOnce({ report: sampleReport });

    await sourceReportsApi.getSourceReport('claim', 'src-1');

    expect(mockGet).toHaveBeenCalledWith('/source-reports?type=claim&sourceId=src-1');
  });

  it('unwraps the { report } envelope and returns the inner SourceReportResponse', async () => {
    mockGet.mockResolvedValueOnce({ report: sampleReport });

    const result = await sourceReportsApi.getSourceReport('claim', 'src-1');

    expect(result).toEqual(sampleReport);
  });

  it('URI-encodes the sourceId in the query string', async () => {
    mockGet.mockResolvedValueOnce({ report: sampleReport });

    await sourceReportsApi.getSourceReport('budget-overview', 'id with spaces/slash');

    expect(mockGet).toHaveBeenCalledWith(
      '/source-reports?type=budget-overview&sourceId=id%20with%20spaces%2Fslash',
    );
  });

  it.each(['budget-overview', 'claim', 'proof-of-funds'] as const)(
    'passes the "%s" use case through verbatim in the query string',
    async (type) => {
      mockGet.mockResolvedValueOnce({ report: sampleReport });
      await sourceReportsApi.getSourceReport(type, 'src-1');
      expect(mockGet).toHaveBeenCalledWith(`/source-reports?type=${type}&sourceId=src-1`);
    },
  );

  it('propagates rejection from the underlying get()', async () => {
    const err = new Error('network error');
    mockGet.mockRejectedValueOnce(err);

    await expect(sourceReportsApi.getSourceReport('claim', 'src-1')).rejects.toThrow(
      'network error',
    );
  });
});

describe('markInvoicesClaimed', () => {
  it('calls POST /source-reports/mark-claimed with the invoiceIds body', async () => {
    const response: MarkClaimedResponse = {
      claimedInvoiceIds: ['inv-1', 'inv-2'],
      claimedDepositIds: ['dep-1'],
    };
    mockPost.mockResolvedValueOnce(response);

    const result = await sourceReportsApi.markInvoicesClaimed(['inv-1', 'inv-2']);

    expect(mockPost).toHaveBeenCalledWith('/source-reports/mark-claimed', {
      invoiceIds: ['inv-1', 'inv-2'],
    });
    // Response is NOT enveloped — returned as-is.
    expect(result).toEqual(response);
  });

  it('handles an empty invoiceIds array', async () => {
    const response: MarkClaimedResponse = { claimedInvoiceIds: [], claimedDepositIds: [] };
    mockPost.mockResolvedValueOnce(response);

    const result = await sourceReportsApi.markInvoicesClaimed([]);

    expect(mockPost).toHaveBeenCalledWith('/source-reports/mark-claimed', { invoiceIds: [] });
    expect(result).toEqual(response);
  });

  it('propagates rejection from the underlying post() (e.g. 409 INVOICES_NOT_CLAIMABLE)', async () => {
    const err = new Error('409 Conflict');
    mockPost.mockRejectedValueOnce(err);

    await expect(sourceReportsApi.markInvoicesClaimed(['inv-1'])).rejects.toThrow('409 Conflict');
  });
});
