import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  fetchDeposits,
  createDeposit,
  updateDeposit,
  deleteDeposit,
} from './invoiceDepositsApi.js';
import type {
  InvoiceDeposit,
  CreateDepositRequest,
  UpdateDepositRequest,
} from '@cornerstone/shared';

describe('invoiceDepositsApi', () => {
  let mockFetch: jest.MockedFunction<typeof globalThis.fetch>;

  beforeEach(() => {
    mockFetch = jest.fn<typeof globalThis.fetch>();
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ─── Fixtures ──────────────────────────────────────────────────────────────

  const INVOICE_ID = 'inv-001';
  const DEPOSIT_ID = 'dep-001';

  const sampleDeposit: InvoiceDeposit = {
    id: DEPOSIT_ID,
    invoiceId: INVOICE_ID,
    amount: 500,
    dueDate: '2026-03-01',
    paidDate: null,
    claimedDate: null,
    description: 'Initial deposit',
    status: 'pending',
    createdBy: null,
    createdAt: '2026-01-15T10:00:00.000Z',
    updatedAt: '2026-01-15T10:00:00.000Z',
  };

  // ─── fetchDeposits ────────────────────────────────────────────────────────

  describe('fetchDeposits', () => {
    it('sends GET request to /api/invoices/:invoiceId/deposits', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ deposits: [] }),
      } as Response);

      await fetchDeposits(INVOICE_ID);

      expect(mockFetch).toHaveBeenCalledWith(
        `/api/invoices/${INVOICE_ID}/deposits`,
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('returns the deposits array from the response envelope', async () => {
      const deposits = [sampleDeposit, { ...sampleDeposit, id: 'dep-002', amount: 200 }];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ deposits }),
      } as Response);

      const result = await fetchDeposits(INVOICE_ID);

      expect(result).toEqual({ deposits });
      expect(result.deposits).toHaveLength(2);
      expect(result.deposits[0]!.id).toBe(DEPOSIT_ID);
    });

    it('returns empty array when no deposits exist', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ deposits: [] }),
      } as Response);

      const result = await fetchDeposits(INVOICE_ID);

      expect(result.deposits).toEqual([]);
    });

    it('uses the correct invoiceId in the URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ deposits: [] }),
      } as Response);

      await fetchDeposits('my-invoice-999');

      expect(mockFetch.mock.calls[0]![0]).toBe('/api/invoices/my-invoice-999/deposits');
    });

    it('propagates API errors as thrown exceptions', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } }),
      } as Response);

      await expect(fetchDeposits(INVOICE_ID)).rejects.toThrow();
    });

    it('propagates 404 NOT_FOUND error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { code: 'NOT_FOUND', message: 'Invoice not found' } }),
      } as Response);

      await expect(fetchDeposits('nonexistent-invoice')).rejects.toThrow();
    });
  });

  // ─── createDeposit ────────────────────────────────────────────────────────

  describe('createDeposit', () => {
    const createPayload: CreateDepositRequest = {
      amount: 500,
      dueDate: '2026-03-01',
      status: 'pending',
      description: 'Initial deposit',
    };

    it('sends POST request to /api/invoices/:invoiceId/deposits', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ deposit: sampleDeposit }),
      } as Response);

      await createDeposit(INVOICE_ID, createPayload);

      expect(mockFetch).toHaveBeenCalledWith(
        `/api/invoices/${INVOICE_ID}/deposits`,
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('sends the payload as JSON in the request body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ deposit: sampleDeposit }),
      } as Response);

      await createDeposit(INVOICE_ID, createPayload);

      const call = mockFetch.mock.calls[0]!;
      const init = call[1] as RequestInit;
      expect(JSON.parse(init.body as string)).toEqual(createPayload);
    });

    it('returns the created deposit wrapped in response envelope', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ deposit: sampleDeposit }),
      } as Response);

      const result = await createDeposit(INVOICE_ID, createPayload);

      expect(result).toEqual({ deposit: sampleDeposit });
      expect(result.deposit.id).toBe(DEPOSIT_ID);
      expect(result.deposit.amount).toBe(500);
    });

    it('sends paidDate and claimedDate when provided', async () => {
      const payloadWithDates: CreateDepositRequest = {
        amount: 300,
        dueDate: '2026-02-01',
        status: 'claimed',
        paidDate: '2026-02-10',
        claimedDate: '2026-02-15',
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ deposit: { ...sampleDeposit, ...payloadWithDates } }),
      } as Response);

      await createDeposit(INVOICE_ID, payloadWithDates);

      const call = mockFetch.mock.calls[0]!;
      const init = call[1] as RequestInit;
      const body = JSON.parse(init.body as string);
      expect(body.paidDate).toBe('2026-02-10');
      expect(body.claimedDate).toBe('2026-02-15');
    });

    it('propagates DEPOSITS_EXCEED_INVOICE_TOTAL error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: {
            code: 'DEPOSITS_EXCEED_INVOICE_TOTAL',
            message: 'Deposits exceed invoice total',
            details: { available: 40 },
          },
        }),
      } as Response);

      await expect(createDeposit(INVOICE_ID, createPayload)).rejects.toThrow();
    });

    it('propagates 401 UNAUTHORIZED error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }),
      } as Response);

      await expect(createDeposit(INVOICE_ID, createPayload)).rejects.toThrow();
    });

    it('propagates 404 NOT_FOUND when invoice does not exist', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { code: 'NOT_FOUND', message: 'Invoice not found' } }),
      } as Response);

      await expect(createDeposit('nonexistent', createPayload)).rejects.toThrow();
    });
  });

  // ─── updateDeposit ────────────────────────────────────────────────────────

  describe('updateDeposit', () => {
    const updatePayload: UpdateDepositRequest = {
      amount: 600,
      status: 'paid',
      paidDate: '2026-03-05',
    };

    it('sends PATCH request to /api/invoices/:invoiceId/deposits/:depositId', async () => {
      const updated: InvoiceDeposit = { ...sampleDeposit, amount: 600, status: 'paid' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ deposit: updated }),
      } as Response);

      await updateDeposit(INVOICE_ID, DEPOSIT_ID, updatePayload);

      expect(mockFetch).toHaveBeenCalledWith(
        `/api/invoices/${INVOICE_ID}/deposits/${DEPOSIT_ID}`,
        expect.objectContaining({ method: 'PATCH' }),
      );
    });

    it('sends the update payload as JSON in request body', async () => {
      const updated: InvoiceDeposit = { ...sampleDeposit, ...updatePayload };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ deposit: updated }),
      } as Response);

      await updateDeposit(INVOICE_ID, DEPOSIT_ID, updatePayload);

      const call = mockFetch.mock.calls[0]!;
      const init = call[1] as RequestInit;
      expect(JSON.parse(init.body as string)).toEqual(updatePayload);
    });

    it('returns the updated deposit wrapped in response envelope', async () => {
      const updated: InvoiceDeposit = {
        ...sampleDeposit,
        amount: 600,
        status: 'paid',
        paidDate: '2026-03-05',
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ deposit: updated }),
      } as Response);

      const result = await updateDeposit(INVOICE_ID, DEPOSIT_ID, updatePayload);

      expect(result.deposit.amount).toBe(600);
      expect(result.deposit.status).toBe('paid');
      expect(result.deposit.paidDate).toBe('2026-03-05');
    });

    it('supports partial update (only status)', async () => {
      const partialPayload: UpdateDepositRequest = { status: 'pending' };
      const updated: InvoiceDeposit = { ...sampleDeposit, status: 'pending' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ deposit: updated }),
      } as Response);

      await updateDeposit(INVOICE_ID, DEPOSIT_ID, partialPayload);

      const call = mockFetch.mock.calls[0]!;
      const init = call[1] as RequestInit;
      expect(JSON.parse(init.body as string)).toEqual({ status: 'pending' });
    });

    it('propagates INVALID_DEPOSIT_STATUS_TRANSITION error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: {
            code: 'INVALID_DEPOSIT_STATUS_TRANSITION',
            message: 'Cannot transition from claimed to pending',
            details: { from: 'claimed', to: 'pending' },
          },
        }),
      } as Response);

      await expect(updateDeposit(INVOICE_ID, DEPOSIT_ID, { status: 'pending' })).rejects.toThrow();
    });

    it('propagates 404 NOT_FOUND when deposit does not exist', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { code: 'NOT_FOUND', message: 'Deposit not found' } }),
      } as Response);

      await expect(updateDeposit(INVOICE_ID, 'nonexistent-deposit', {})).rejects.toThrow();
    });

    it('uses the correct invoiceId and depositId in the URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ deposit: sampleDeposit }),
      } as Response);

      await updateDeposit('inv-xyz', 'dep-abc', { amount: 100 });

      expect(mockFetch.mock.calls[0]![0]).toBe('/api/invoices/inv-xyz/deposits/dep-abc');
    });
  });

  // ─── deleteDeposit ────────────────────────────────────────────────────────

  describe('deleteDeposit', () => {
    it('sends DELETE request to /api/invoices/:invoiceId/deposits/:depositId', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        text: async () => '',
      } as Response);

      await deleteDeposit(INVOICE_ID, DEPOSIT_ID);

      expect(mockFetch).toHaveBeenCalledWith(
        `/api/invoices/${INVOICE_ID}/deposits/${DEPOSIT_ID}`,
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    it('resolves without a return value on 204 response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        text: async () => '',
      } as Response);

      const result = await deleteDeposit(INVOICE_ID, DEPOSIT_ID);

      expect(result).toBeUndefined();
    });

    it('uses the correct invoiceId and depositId in the URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        text: async () => '',
      } as Response);

      await deleteDeposit('inv-xyz', 'dep-abc');

      expect(mockFetch.mock.calls[0]![0]).toBe('/api/invoices/inv-xyz/deposits/dep-abc');
    });

    it('propagates 404 NOT_FOUND when deposit does not exist', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { code: 'NOT_FOUND', message: 'Deposit not found' } }),
      } as Response);

      await expect(deleteDeposit(INVOICE_ID, 'nonexistent')).rejects.toThrow();
    });

    it('propagates 401 UNAUTHORIZED error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }),
      } as Response);

      await expect(deleteDeposit(INVOICE_ID, DEPOSIT_ID)).rejects.toThrow();
    });
  });
});
