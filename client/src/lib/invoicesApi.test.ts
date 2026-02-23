import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  fetchInvoices,
  createInvoice,
  updateInvoice,
  deleteInvoice,
  fetchAllInvoices,
  fetchInvoiceById,
} from './invoicesApi.js';
import type { Invoice, InvoiceListPaginatedResponse } from '@cornerstone/shared';

describe('invoicesApi', () => {
  let mockFetch: jest.MockedFunction<typeof globalThis.fetch>;

  beforeEach(() => {
    mockFetch = jest.fn<typeof globalThis.fetch>();
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // Sample invoice fixture
  const sampleInvoice: Invoice = {
    id: 'invoice-1',
    vendorId: 'vendor-1',
    vendorName: 'Test Vendor',
    workItemBudgetId: null,
    invoiceNumber: 'INV-001',
    amount: 2500.0,
    date: '2026-02-01',
    dueDate: '2026-03-01',
    status: 'pending',
    notes: 'Initial deposit',
    createdBy: { id: 'user-1', displayName: 'Admin User', email: 'admin@example.com' },
    createdAt: '2026-02-01T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z',
  };

  // ─── fetchInvoices ─────────────────────────────────────────────────────────

  describe('fetchInvoices', () => {
    it('sends GET request to /api/vendors/:vendorId/invoices', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ invoices: [] }),
      } as Response);

      await fetchInvoices('vendor-1');

      expect(mockFetch).toHaveBeenCalledWith('/api/vendors/vendor-1/invoices', expect.any(Object));
    });

    it('returns an empty array when no invoices exist', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ invoices: [] }),
      } as Response);

      const result = await fetchInvoices('vendor-1');

      expect(result).toHaveLength(0);
    });

    it('returns an array of invoices', async () => {
      const invoiceList = [sampleInvoice, { ...sampleInvoice, id: 'invoice-2', amount: 500 }];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ invoices: invoiceList }),
      } as Response);

      const result = await fetchInvoices('vendor-1');

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('invoice-1');
      expect(result[1].id).toBe('invoice-2');
    });

    it('unwraps the invoices array from the response envelope', async () => {
      const envelope = { invoices: [sampleInvoice] };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => envelope,
      } as Response);

      const result = await fetchInvoices('vendor-1');

      expect(Array.isArray(result)).toBe(true);
      expect(result[0]).toEqual(sampleInvoice);
    });

    it('uses the correct vendorId in the URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ invoices: [] }),
      } as Response);

      await fetchInvoices('vendor-abc-123');

      const call = mockFetch.mock.calls[0];
      expect(call[0]).toBe('/api/vendors/vendor-abc-123/invoices');
    });

    it('throws when server returns 401 UNAUTHORIZED', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }),
      } as Response);

      await expect(fetchInvoices('vendor-1')).rejects.toThrow();
    });

    it('throws when server returns 404 NOT_FOUND', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { code: 'NOT_FOUND', message: 'Vendor not found' } }),
      } as Response);

      await expect(fetchInvoices('non-existent-vendor')).rejects.toThrow();
    });

    it('throws when server returns 500 INTERNAL_ERROR', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'Server error' } }),
      } as Response);

      await expect(fetchInvoices('vendor-1')).rejects.toThrow();
    });
  });

  // ─── createInvoice ─────────────────────────────────────────────────────────

  describe('createInvoice', () => {
    it('sends POST request to /api/vendors/:vendorId/invoices', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ invoice: sampleInvoice }),
      } as Response);

      const data = { amount: 1000, date: '2026-01-15' };
      await createInvoice('vendor-1', data);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/vendors/vendor-1/invoices',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(data),
        }),
      );
    });

    it('returns the created invoice (unwrapped from envelope)', async () => {
      const newInvoice: Invoice = { ...sampleInvoice, id: 'invoice-new', amount: 3000 };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ invoice: newInvoice }),
      } as Response);

      const result = await createInvoice('vendor-1', { amount: 3000, date: '2026-02-01' });

      expect(result).toEqual(newInvoice);
      expect(result.id).toBe('invoice-new');
      expect(result.amount).toBe(3000);
    });

    it('sends all optional fields in POST body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ invoice: sampleInvoice }),
      } as Response);

      const fullData = {
        invoiceNumber: 'INV-100',
        amount: 5000,
        date: '2026-01-01',
        dueDate: '2026-02-01',
        status: 'paid' as const,
        notes: 'Full payment',
      };
      await createInvoice('vendor-1', fullData);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/vendors/vendor-1/invoices',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(fullData),
        }),
      );
    });

    it('throws ApiClientError for 400 VALIDATION_ERROR', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: { code: 'VALIDATION_ERROR', message: 'Amount must be greater than 0' },
        }),
      } as Response);

      await expect(createInvoice('vendor-1', { amount: 0, date: '2026-01-01' })).rejects.toThrow();
    });

    it('throws ApiClientError for 404 NOT_FOUND', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { code: 'NOT_FOUND', message: 'Vendor not found' } }),
      } as Response);

      await expect(
        createInvoice('nonexistent', { amount: 100, date: '2026-01-01' }),
      ).rejects.toThrow();
    });

    it('throws ApiClientError for 401 UNAUTHORIZED', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }),
      } as Response);

      await expect(
        createInvoice('vendor-1', { amount: 100, date: '2026-01-01' }),
      ).rejects.toThrow();
    });

    it('uses the correct vendorId in the URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ invoice: sampleInvoice }),
      } as Response);

      await createInvoice('vendor-xyz', { amount: 100, date: '2026-01-01' });

      const call = mockFetch.mock.calls[0];
      expect(call[0]).toBe('/api/vendors/vendor-xyz/invoices');
    });
  });

  // ─── updateInvoice ─────────────────────────────────────────────────────────

  describe('updateInvoice', () => {
    it('sends PATCH request to /api/vendors/:vendorId/invoices/:invoiceId', async () => {
      const updated: Invoice = { ...sampleInvoice, amount: 3000 };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ invoice: updated }),
      } as Response);

      const data = { amount: 3000 };
      await updateInvoice('vendor-1', 'invoice-1', data);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/vendors/vendor-1/invoices/invoice-1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify(data),
        }),
      );
    });

    it('returns the updated invoice (unwrapped from envelope)', async () => {
      const updated: Invoice = { ...sampleInvoice, status: 'paid', amount: 4000 };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ invoice: updated }),
      } as Response);

      const result = await updateInvoice('vendor-1', 'invoice-1', { status: 'paid', amount: 4000 });

      expect(result).toEqual(updated);
      expect(result.status).toBe('paid');
      expect(result.amount).toBe(4000);
    });

    it('handles partial update (status only)', async () => {
      const updated: Invoice = { ...sampleInvoice, status: 'claimed' };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ invoice: updated }),
      } as Response);

      const data = { status: 'claimed' as const };
      await updateInvoice('vendor-1', 'invoice-1', data);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/vendors/vendor-1/invoices/invoice-1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify(data),
        }),
      );
    });

    it('handles null values in update (clearing dueDate)', async () => {
      const updated: Invoice = { ...sampleInvoice, dueDate: null };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ invoice: updated }),
      } as Response);

      const data = { dueDate: null };
      await updateInvoice('vendor-1', 'invoice-1', data);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/vendors/vendor-1/invoices/invoice-1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify(data),
        }),
      );
    });

    it('throws ApiClientError for 404 NOT_FOUND (vendor)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { code: 'NOT_FOUND', message: 'Vendor not found' } }),
      } as Response);

      await expect(
        updateInvoice('nonexistent-vendor', 'invoice-1', { amount: 500 }),
      ).rejects.toThrow();
    });

    it('throws ApiClientError for 404 NOT_FOUND (invoice)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { code: 'NOT_FOUND', message: 'Invoice not found' } }),
      } as Response);

      await expect(
        updateInvoice('vendor-1', 'nonexistent-invoice', { amount: 500 }),
      ).rejects.toThrow();
    });

    it('throws ApiClientError for 400 VALIDATION_ERROR', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: { code: 'VALIDATION_ERROR', message: 'Amount must be greater than 0' },
        }),
      } as Response);

      await expect(updateInvoice('vendor-1', 'invoice-1', { amount: 0 })).rejects.toThrow();
    });

    it('throws ApiClientError for 401 UNAUTHORIZED', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }),
      } as Response);

      await expect(updateInvoice('vendor-1', 'invoice-1', { status: 'paid' })).rejects.toThrow();
    });

    it('uses the correct vendorId and invoiceId in URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ invoice: sampleInvoice }),
      } as Response);

      await updateInvoice('vendor-abc', 'inv-xyz', { amount: 999 });

      const call = mockFetch.mock.calls[0];
      expect(call[0]).toBe('/api/vendors/vendor-abc/invoices/inv-xyz');
    });
  });

  // ─── deleteInvoice ─────────────────────────────────────────────────────────

  describe('deleteInvoice', () => {
    it('sends DELETE request to /api/vendors/:vendorId/invoices/:invoiceId', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      } as Response);

      await deleteInvoice('vendor-1', 'invoice-1');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/vendors/vendor-1/invoices/invoice-1',
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

      const result = await deleteInvoice('vendor-1', 'invoice-1');

      expect(result).toBeUndefined();
    });

    it('throws ApiClientError for 404 NOT_FOUND (vendor)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { code: 'NOT_FOUND', message: 'Vendor not found' } }),
      } as Response);

      await expect(deleteInvoice('nonexistent-vendor', 'invoice-1')).rejects.toThrow();
    });

    it('throws ApiClientError for 404 NOT_FOUND (invoice)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { code: 'NOT_FOUND', message: 'Invoice not found' } }),
      } as Response);

      await expect(deleteInvoice('vendor-1', 'nonexistent-invoice')).rejects.toThrow();
    });

    it('throws ApiClientError for 401 UNAUTHORIZED', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }),
      } as Response);

      await expect(deleteInvoice('vendor-1', 'invoice-1')).rejects.toThrow();
    });

    it('uses the correct vendorId and invoiceId in URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      } as Response);

      await deleteInvoice('vendor-abc', 'inv-xyz');

      const call = mockFetch.mock.calls[0];
      expect(call[0]).toBe('/api/vendors/vendor-abc/invoices/inv-xyz');
    });
  });

  // ─── fetchAllInvoices ──────────────────────────────────────────────────────

  describe('fetchAllInvoices', () => {
    const samplePaginatedResponse: InvoiceListPaginatedResponse = {
      invoices: [sampleInvoice],
      pagination: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1 },
      summary: {
        pending: { count: 1, totalAmount: 2500.0 },
        paid: { count: 0, totalAmount: 0 },
        claimed: { count: 0, totalAmount: 0 },
      },
    };

    it('sends GET request to /api/invoices with no params', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => samplePaginatedResponse,
      } as Response);

      await fetchAllInvoices();

      expect(mockFetch).toHaveBeenCalledWith('/api/invoices', expect.any(Object));
    });

    it('sends correct query string when page and pageSize are provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => samplePaginatedResponse,
      } as Response);

      await fetchAllInvoices({ page: 2, pageSize: 10 });

      const call = mockFetch.mock.calls[0];
      expect(call[0]).toContain('page=2');
      expect(call[0]).toContain('pageSize=10');
    });

    it('sends correct query string when q, status, and vendorId are provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => samplePaginatedResponse,
      } as Response);

      await fetchAllInvoices({ q: 'INV-001', status: 'pending', vendorId: 'vendor-1' });

      const call = mockFetch.mock.calls[0];
      const url = call[0] as string;
      expect(url).toContain('q=INV-001');
      expect(url).toContain('status=pending');
      expect(url).toContain('vendorId=vendor-1');
    });

    it('sends correct query string when sortBy and sortOrder are provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => samplePaginatedResponse,
      } as Response);

      await fetchAllInvoices({ sortBy: 'amount', sortOrder: 'asc' });

      const call = mockFetch.mock.calls[0];
      const url = call[0] as string;
      expect(url).toContain('sortBy=amount');
      expect(url).toContain('sortOrder=asc');
    });

    it('returns the full InvoiceListPaginatedResponse (invoices + pagination + summary)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => samplePaginatedResponse,
      } as Response);

      const result = await fetchAllInvoices();

      expect(result.invoices).toHaveLength(1);
      expect(result.invoices[0]).toEqual(sampleInvoice);
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.totalItems).toBe(1);
      expect(result.summary.pending.count).toBe(1);
      expect(result.summary.pending.totalAmount).toBe(2500.0);
      expect(result.summary.paid.count).toBe(0);
    });

    it('omits undefined params from query string (no stray keys sent)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => samplePaginatedResponse,
      } as Response);

      await fetchAllInvoices({ page: 1 }); // only page, no other params

      const call = mockFetch.mock.calls[0];
      const url = call[0] as string;
      expect(url).toContain('page=1');
      expect(url).not.toContain('pageSize');
      expect(url).not.toContain('status');
      expect(url).not.toContain('vendorId');
      expect(url).not.toContain('q=');
    });

    it('uses /api/invoices path without query string when no params are provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => samplePaginatedResponse,
      } as Response);

      await fetchAllInvoices();

      const call = mockFetch.mock.calls[0];
      expect(call[0]).toBe('/api/invoices');
    });

    it('throws on 401 UNAUTHORIZED', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }),
      } as Response);

      await expect(fetchAllInvoices()).rejects.toThrow();
    });

    it('throws on 500 INTERNAL_ERROR', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { code: 'INTERNAL_ERROR', message: 'Server error' } }),
      } as Response);

      await expect(fetchAllInvoices()).rejects.toThrow();
    });
  });

  // ─── fetchInvoiceById ─────────────────────────────────────────────────────

  describe('fetchInvoiceById', () => {
    it('sends GET request to /api/invoices/:id', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ invoice: sampleInvoice }),
      } as Response);

      await fetchInvoiceById('invoice-1');

      expect(mockFetch).toHaveBeenCalledWith('/api/invoices/invoice-1', expect.any(Object));
    });

    it('uses the correct invoiceId in the URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ invoice: sampleInvoice }),
      } as Response);

      await fetchInvoiceById('inv-abc-999');

      const call = mockFetch.mock.calls[0];
      expect(call[0]).toBe('/api/invoices/inv-abc-999');
    });

    it('returns the unwrapped Invoice from the { invoice } envelope', async () => {
      const detailInvoice: Invoice = {
        ...sampleInvoice,
        id: 'invoice-detail',
        amount: 9999,
        status: 'claimed',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ invoice: detailInvoice }),
      } as Response);

      const result = await fetchInvoiceById('invoice-detail');

      expect(result).toEqual(detailInvoice);
      expect(result.id).toBe('invoice-detail');
      expect(result.amount).toBe(9999);
      expect(result.status).toBe('claimed');
    });

    it('returns invoice with vendorName populated', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ invoice: sampleInvoice }),
      } as Response);

      const result = await fetchInvoiceById('invoice-1');

      expect(result.vendorName).toBe('Test Vendor');
    });

    it('throws on 404 NOT_FOUND', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { code: 'NOT_FOUND', message: 'Invoice not found' } }),
      } as Response);

      await expect(fetchInvoiceById('non-existent-id')).rejects.toThrow();
    });

    it('throws on 401 UNAUTHORIZED', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }),
      } as Response);

      await expect(fetchInvoiceById('invoice-1')).rejects.toThrow();
    });
  });
});
