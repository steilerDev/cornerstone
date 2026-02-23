import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  fetchVendors,
  fetchVendor,
  createVendor,
  updateVendor,
  deleteVendor,
} from './vendorsApi.js';
import type { Vendor, VendorDetail } from '@cornerstone/shared';
import type { VendorListResponse } from './vendorsApi.js';

describe('vendorsApi', () => {
  let mockFetch: jest.MockedFunction<typeof globalThis.fetch>;

  beforeEach(() => {
    mockFetch = jest.fn<typeof globalThis.fetch>();
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // Sample data
  const sampleVendor: Vendor = {
    id: 'vendor-1',
    name: 'Smith Plumbing',
    specialty: 'Plumbing',
    phone: '+1 555-1234',
    email: 'smith@plumbing.com',
    address: '123 Main St',
    notes: 'Reliable',
    createdBy: { id: 'user-1', displayName: 'Creator', email: 'creator@test.com' },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  const sampleVendorDetail: VendorDetail = {
    ...sampleVendor,
    invoiceCount: 3,
    outstandingBalance: 800,
  };

  // ─── fetchVendors ──────────────────────────────────────────────────────────

  describe('fetchVendors', () => {
    it('sends GET request to /vendors when no params given', async () => {
      const mockResponse: VendorListResponse = {
        vendors: [],
        pagination: { page: 1, pageSize: 25, totalItems: 0, totalPages: 0 },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await fetchVendors();

      expect(mockFetch).toHaveBeenCalledWith('/api/vendors', expect.any(Object));
    });

    it('sends GET request to /vendors without query string when no params', async () => {
      const mockResponse: VendorListResponse = {
        vendors: [],
        pagination: { page: 1, pageSize: 25, totalItems: 0, totalPages: 0 },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await fetchVendors();

      const call = mockFetch.mock.calls[0];
      expect(call[0]).toBe('/api/vendors');
    });

    it('includes page parameter in query string when provided', async () => {
      const mockResponse: VendorListResponse = {
        vendors: [],
        pagination: { page: 2, pageSize: 25, totalItems: 30, totalPages: 2 },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await fetchVendors({ page: 2 });

      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('page=2'), expect.any(Object));
    });

    it('includes pageSize parameter when provided', async () => {
      const mockResponse: VendorListResponse = {
        vendors: [],
        pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await fetchVendors({ pageSize: 10 });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('pageSize=10'),
        expect.any(Object),
      );
    });

    it('includes q search parameter when provided', async () => {
      const mockResponse: VendorListResponse = {
        vendors: [sampleVendor],
        pagination: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1 },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await fetchVendors({ q: 'smith' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('q=smith'),
        expect.any(Object),
      );
    });

    it('includes sortBy and sortOrder when provided', async () => {
      const mockResponse: VendorListResponse = {
        vendors: [],
        pagination: { page: 1, pageSize: 25, totalItems: 0, totalPages: 0 },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await fetchVendors({ sortBy: 'specialty', sortOrder: 'desc' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('sortBy=specialty'),
        expect.any(Object),
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('sortOrder=desc'),
        expect.any(Object),
      );
    });

    it('omits q parameter when not provided', async () => {
      const mockResponse: VendorListResponse = {
        vendors: [],
        pagination: { page: 1, pageSize: 25, totalItems: 0, totalPages: 0 },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      await fetchVendors({ page: 1 });

      const call = mockFetch.mock.calls[0];
      expect(call[0]).not.toContain('q=');
    });

    it('returns parsed vendor list response', async () => {
      const mockResponse: VendorListResponse = {
        vendors: [sampleVendor],
        pagination: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1 },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await fetchVendors();

      expect(result.vendors).toHaveLength(1);
      expect(result.vendors[0].name).toBe('Smith Plumbing');
      expect(result.pagination.totalItems).toBe(1);
    });

    it('throws ApiClientError when server returns 401', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }),
      } as Response);

      await expect(fetchVendors()).rejects.toThrow();
    });

    it('throws when server returns 500', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'Server error' } }),
      } as Response);

      await expect(fetchVendors()).rejects.toThrow();
    });
  });

  // ─── fetchVendor ───────────────────────────────────────────────────────────

  describe('fetchVendor', () => {
    it('sends GET request to /vendors/:id', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ vendor: sampleVendorDetail }),
      } as Response);

      await fetchVendor('vendor-1');

      expect(mockFetch).toHaveBeenCalledWith('/api/vendors/vendor-1', expect.any(Object));
    });

    it('returns VendorDetail with invoiceCount and outstandingBalance', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ vendor: sampleVendorDetail }),
      } as Response);

      const result = await fetchVendor('vendor-1');

      expect(result.id).toBe('vendor-1');
      expect(result.name).toBe('Smith Plumbing');
      expect(result.invoiceCount).toBe(3);
      expect(result.outstandingBalance).toBe(800);
    });

    it('unwraps the vendor from the response envelope', async () => {
      const envelope = { vendor: sampleVendorDetail };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => envelope,
      } as Response);

      const result = await fetchVendor('vendor-1');

      // Should return the VendorDetail directly, not the envelope
      expect(result).toEqual(sampleVendorDetail);
    });

    it('throws ApiClientError for 404 NOT_FOUND', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { code: 'NOT_FOUND', message: 'Vendor not found' } }),
      } as Response);

      await expect(fetchVendor('nonexistent')).rejects.toThrow();
    });

    it('throws ApiClientError for 401 UNAUTHORIZED', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }),
      } as Response);

      await expect(fetchVendor('vendor-1')).rejects.toThrow();
    });
  });

  // ─── createVendor ──────────────────────────────────────────────────────────

  describe('createVendor', () => {
    it('sends POST request to /vendors with name only', async () => {
      const newVendor: Vendor = { ...sampleVendor, id: 'vendor-new' };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ vendor: newVendor }),
      } as Response);

      const requestData = { name: 'New Vendor' };
      await createVendor(requestData);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/vendors',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(requestData),
        }),
      );
    });

    it('sends POST request with all optional fields', async () => {
      const newVendor: Vendor = { ...sampleVendor, id: 'vendor-full' };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ vendor: newVendor }),
      } as Response);

      const requestData = {
        name: 'Full Vendor',
        specialty: 'Roofing',
        phone: '555-1111',
        email: 'full@vendor.com',
        address: '100 Oak Ave',
        notes: 'Test notes',
      };
      await createVendor(requestData);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/vendors',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(requestData),
        }),
      );
    });

    it('returns the created vendor (unwrapped from envelope)', async () => {
      const newVendor: Vendor = { ...sampleVendor, id: 'vendor-created', name: 'Created Vendor' };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ vendor: newVendor }),
      } as Response);

      const result = await createVendor({ name: 'Created Vendor' });

      expect(result).toEqual(newVendor);
      expect(result.id).toBe('vendor-created');
      expect(result.name).toBe('Created Vendor');
    });

    it('throws ApiClientError for 400 VALIDATION_ERROR', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: { code: 'VALIDATION_ERROR', message: 'name is required' },
        }),
      } as Response);

      await expect(createVendor({ name: '' })).rejects.toThrow();
    });

    it('throws ApiClientError for 401 UNAUTHORIZED', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }),
      } as Response);

      await expect(createVendor({ name: 'New Vendor' })).rejects.toThrow();
    });
  });

  // ─── updateVendor ──────────────────────────────────────────────────────────

  describe('updateVendor', () => {
    it('sends PATCH request to /vendors/:id with body', async () => {
      const updated: VendorDetail = { ...sampleVendorDetail, name: 'Updated Name' };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ vendor: updated }),
      } as Response);

      const updateData = { name: 'Updated Name' };
      await updateVendor('vendor-1', updateData);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/vendors/vendor-1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify(updateData),
        }),
      );
    });

    it('returns the updated VendorDetail (unwrapped from envelope)', async () => {
      const updated: VendorDetail = {
        ...sampleVendorDetail,
        name: 'Updated Vendor',
        specialty: 'Landscaping',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ vendor: updated }),
      } as Response);

      const result = await updateVendor('vendor-1', { name: 'Updated Vendor' });

      expect(result).toEqual(updated);
      expect(result.name).toBe('Updated Vendor');
      expect(result.invoiceCount).toBe(3);
    });

    it('handles partial update (only specialty)', async () => {
      const updated: VendorDetail = { ...sampleVendorDetail, specialty: 'New Specialty' };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ vendor: updated }),
      } as Response);

      const updateData = { specialty: 'New Specialty' };
      await updateVendor('vendor-1', updateData);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/vendors/vendor-1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify(updateData),
        }),
      );
    });

    it('handles null fields in update (clearing optional fields)', async () => {
      const updated: VendorDetail = { ...sampleVendorDetail, specialty: null };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ vendor: updated }),
      } as Response);

      const updateData = { specialty: null };
      await updateVendor('vendor-1', updateData);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/vendors/vendor-1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify(updateData),
        }),
      );
    });

    it('throws ApiClientError for 404 NOT_FOUND', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { code: 'NOT_FOUND', message: 'Vendor not found' } }),
      } as Response);

      await expect(updateVendor('nonexistent', { name: 'Updated' })).rejects.toThrow();
    });

    it('throws ApiClientError for 400 VALIDATION_ERROR', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: { code: 'VALIDATION_ERROR', message: 'At least one field must be provided' },
        }),
      } as Response);

      await expect(updateVendor('vendor-1', {})).rejects.toThrow();
    });

    it('throws ApiClientError for 401 UNAUTHORIZED', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }),
      } as Response);

      await expect(updateVendor('vendor-1', { name: 'Test' })).rejects.toThrow();
    });
  });

  // ─── deleteVendor ──────────────────────────────────────────────────────────

  describe('deleteVendor', () => {
    it('sends DELETE request to /vendors/:id', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      } as Response);

      await deleteVendor('vendor-1');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/vendors/vendor-1',
        expect.objectContaining({
          method: 'DELETE',
        }),
      );
    });

    it('returns void on successful deletion', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      } as Response);

      const result = await deleteVendor('vendor-1');

      expect(result).toBeUndefined();
    });

    it('throws ApiClientError for 404 NOT_FOUND', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { code: 'NOT_FOUND', message: 'Vendor not found' } }),
      } as Response);

      await expect(deleteVendor('nonexistent')).rejects.toThrow();
    });

    it('throws ApiClientError for 409 VENDOR_IN_USE', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({
          error: {
            code: 'VENDOR_IN_USE',
            message: 'Vendor is in use and cannot be deleted',
            details: { invoiceCount: 2, workItemCount: 1 },
          },
        }),
      } as Response);

      await expect(deleteVendor('vendor-in-use')).rejects.toThrow();
    });

    it('throws ApiClientError for 401 UNAUTHORIZED', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }),
      } as Response);

      await expect(deleteVendor('vendor-1')).rejects.toThrow();
    });
  });
});
