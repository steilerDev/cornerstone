import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type { VendorRelationsResponse } from '@cornerstone/shared';
import { fetchVendorRelations } from './vendorRelationsApi.js';

describe('vendorRelationsApi', () => {
  let mockFetch: jest.MockedFunction<typeof globalThis.fetch>;

  beforeEach(() => {
    mockFetch = jest.fn<typeof globalThis.fetch>();
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('GETs /api/vendors/:id/relations and returns the body as is', async () => {
    const body: VendorRelationsResponse = { workItems: [], householdItems: [], budgetLines: [] };
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => body } as Response);

    const result = await fetchVendorRelations('vendor-1');

    expect(mockFetch).toHaveBeenCalledWith('/api/vendors/vendor-1/relations', expect.any(Object));
    expect(result).toEqual(body);
  });

  it('passes the abort signal through', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) } as Response);
    const controller = new AbortController();

    await fetchVendorRelations('vendor-1', { signal: controller.signal });

    expect(mockFetch.mock.calls[0]![1]).toMatchObject({ signal: controller.signal });
  });

  it('rejects when the company is unknown', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ error: { code: 'NOT_FOUND', message: 'Vendor not found' } }),
    } as Response);

    await expect(fetchVendorRelations('missing')).rejects.toThrow();
  });
});
