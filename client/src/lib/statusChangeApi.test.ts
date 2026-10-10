import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  workItemStatusBody,
  householdItemStatusBody,
  milestoneStatusBody,
  invoiceStatusBody,
  depositStatusBody,
  changeDefectStatus,
  changeFundingSourceStatus,
  changeGrantStatus,
  changeWorkItemStatus,
  changeHouseholdItemStatus,
  changeMilestoneStatus,
  changeInvoiceStatus,
  changeDepositStatus,
} from './statusChangeApi.js';

const TOKEN = { token: `u_${'b'.repeat(32)}`, expiresAt: '2026-08-07T10:00:30.000Z' };

describe('request body builders', () => {
  describe('workItemStatusBody', () => {
    it('sends the actual start date when starting with a date', () => {
      expect(workItemStatusBody('in_progress', '2026-08-07')).toEqual({
        status: 'in_progress',
        actualStartDate: '2026-08-07',
      });
    });

    it('sends the actual end date when completing with a date', () => {
      expect(workItemStatusBody('completed', '2026-08-07')).toEqual({
        status: 'completed',
        actualEndDate: '2026-08-07',
      });
    });

    it('sends only the status without a date', () => {
      expect(workItemStatusBody('in_progress', null)).toEqual({ status: 'in_progress' });
      expect(workItemStatusBody('completed', null)).toEqual({ status: 'completed' });
    });

    it('never attaches a date to a backward move', () => {
      expect(workItemStatusBody('not_started', '2026-08-07')).toEqual({ status: 'not_started' });
    });
  });

  describe('householdItemStatusBody', () => {
    it('sends the actual delivery date when arrived with a date', () => {
      expect(householdItemStatusBody('arrived', '2026-08-07')).toEqual({
        status: 'arrived',
        actualDeliveryDate: '2026-08-07',
      });
    });

    it('sends only the status otherwise', () => {
      expect(householdItemStatusBody('arrived', null)).toEqual({ status: 'arrived' });
      expect(householdItemStatusBody('purchased', '2026-08-07')).toEqual({ status: 'purchased' });
    });
  });

  describe('milestoneStatusBody', () => {
    it('marks reached with the completion date', () => {
      expect(milestoneStatusBody('reached', '2026-08-07')).toEqual({
        isCompleted: true,
        completedAt: '2026-08-07',
      });
    });

    it('marks reached without a date', () => {
      expect(milestoneStatusBody('reached', null)).toEqual({ isCompleted: true });
    });

    it('un-completes when going back', () => {
      expect(milestoneStatusBody('not_reached', '2026-08-07')).toEqual({ isCompleted: false });
    });
  });

  describe('invoiceStatusBody', () => {
    it('sends only the status (no date step for invoices)', () => {
      expect(invoiceStatusBody('paid')).toEqual({ status: 'paid' });
    });
  });

  describe('depositStatusBody', () => {
    it('pending to paid carries the paid date', () => {
      expect(depositStatusBody('pending', 'paid', '2026-08-07')).toEqual({
        status: 'paid',
        paidDate: '2026-08-07',
      });
    });

    it('pending to claimed sets both the paid and the claimed date', () => {
      expect(depositStatusBody('pending', 'claimed', '2026-08-07')).toEqual({
        status: 'claimed',
        paidDate: '2026-08-07',
        claimedDate: '2026-08-07',
      });
    });

    it('paid to claimed sets only the claimed date', () => {
      expect(depositStatusBody('paid', 'claimed', '2026-08-07')).toEqual({
        status: 'claimed',
        claimedDate: '2026-08-07',
      });
    });

    it('sends only the status without a date or on a backward move', () => {
      expect(depositStatusBody('pending', 'paid', null)).toEqual({ status: 'paid' });
      expect(depositStatusBody('claimed', 'paid', '2026-08-07')).toEqual({ status: 'paid' });
      expect(depositStatusBody('paid', 'pending', '2026-08-07')).toEqual({ status: 'pending' });
    });
  });
});

describe('status change requests', () => {
  let mockFetch: jest.MockedFunction<typeof globalThis.fetch>;

  function respond(body: unknown) {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => body,
    } as Response);
  }

  function lastCall() {
    const [url, init] = mockFetch.mock.calls[mockFetch.mock.calls.length - 1]!;
    return { url, method: init?.method, body: JSON.parse(String(init?.body)) };
  }

  beforeEach(() => {
    mockFetch = jest.fn<typeof globalThis.fetch>();
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('changeWorkItemStatus splits the bare body into record and undo', async () => {
    respond({ id: 'w1', title: 'Task', status: 'in_progress', undo: TOKEN });
    const result = await changeWorkItemStatus('w1', { status: 'in_progress' });
    expect(lastCall()).toEqual({
      url: '/api/work-items/w1',
      method: 'PATCH',
      body: { status: 'in_progress' },
    });
    expect(result.undo).toEqual(TOKEN);
    expect(result.record).toEqual({ id: 'w1', title: 'Task', status: 'in_progress' });
    expect('undo' in result.record).toBe(false);
  });

  it('changeWorkItemStatus reports undo null when no token was issued', async () => {
    respond({ id: 'w1', status: 'in_progress' });
    const result = await changeWorkItemStatus('w1', { status: 'in_progress' });
    expect(result.undo).toBeNull();
  });

  it('changeHouseholdItemStatus unwraps householdItem and the sibling undo', async () => {
    respond({ householdItem: { id: 'h1', status: 'arrived' }, undo: TOKEN });
    const result = await changeHouseholdItemStatus('h1', { status: 'arrived' });
    expect(lastCall().url).toBe('/api/household-items/h1');
    expect(result).toEqual({ record: { id: 'h1', status: 'arrived' }, undo: TOKEN });
  });

  it('changeHouseholdItemStatus reports undo null when absent', async () => {
    respond({ householdItem: { id: 'h1' } });
    expect((await changeHouseholdItemStatus('h1', { status: 'planned' })).undo).toBeNull();
  });

  it('changeMilestoneStatus splits the bare body and targets the numeric id', async () => {
    respond({ id: 4, isCompleted: true, undo: TOKEN });
    const result = await changeMilestoneStatus(4, { isCompleted: true });
    expect(lastCall()).toEqual({
      url: '/api/milestones/4',
      method: 'PATCH',
      body: { isCompleted: true },
    });
    expect(result).toEqual({ record: { id: 4, isCompleted: true }, undo: TOKEN });
  });

  it('changeInvoiceStatus unwraps invoice under the vendor route', async () => {
    respond({ invoice: { id: 'i1', status: 'paid' }, undo: TOKEN });
    const result = await changeInvoiceStatus('v1', 'i1', { status: 'paid' });
    expect(lastCall().url).toBe('/api/vendors/v1/invoices/i1');
    expect(result).toEqual({ record: { id: 'i1', status: 'paid' }, undo: TOKEN });
  });

  it('changeInvoiceStatus reports undo null when absent', async () => {
    respond({ invoice: { id: 'i1' } });
    expect((await changeInvoiceStatus('v1', 'i1', { status: 'pending' })).undo).toBeNull();
  });

  it('changeDepositStatus unwraps deposit under the invoice route', async () => {
    respond({ deposit: { id: 'd1', status: 'paid' }, undo: TOKEN });
    const result = await changeDepositStatus('i1', 'd1', { status: 'paid' });
    expect(lastCall().url).toBe('/api/invoices/i1/deposits/d1');
    expect(result).toEqual({ record: { id: 'd1', status: 'paid' }, undo: TOKEN });
  });

  it('changeDepositStatus reports undo null when absent', async () => {
    respond({ deposit: { id: 'd1' } });
    expect((await changeDepositStatus('i1', 'd1', { status: 'pending' })).undo).toBeNull();
  });

  it('changeGrantStatus PATCHes applicationStatus and unwraps subsidyProgram + undo', async () => {
    respond({ subsidyProgram: { id: 'g1', applicationStatus: 'approved' }, undo: TOKEN });
    const result = await changeGrantStatus('g1', 'approved');
    expect(lastCall()).toEqual({
      url: '/api/subsidy-programs/g1',
      method: 'PATCH',
      body: { applicationStatus: 'approved' },
    });
    expect(result).toEqual({ record: { id: 'g1', applicationStatus: 'approved' }, undo: TOKEN });
  });

  it('changeGrantStatus reports undo null when absent', async () => {
    respond({ subsidyProgram: { id: 'g1' } });
    expect((await changeGrantStatus('g1', 'applied')).undo).toBeNull();
  });

  it('changeFundingSourceStatus PATCHes status and unwraps budgetSource + undo', async () => {
    respond({ budgetSource: { id: 'b1', status: 'exhausted' }, undo: TOKEN });
    const result = await changeFundingSourceStatus('b1', 'exhausted');
    expect(lastCall()).toEqual({
      url: '/api/budget-sources/b1',
      method: 'PATCH',
      body: { status: 'exhausted' },
    });
    expect(result).toEqual({ record: { id: 'b1', status: 'exhausted' }, undo: TOKEN });
  });

  it('changeFundingSourceStatus reports undo null when absent', async () => {
    respond({ budgetSource: { id: 'b1' } });
    expect((await changeFundingSourceStatus('b1', 'closed')).undo).toBeNull();
  });

  it('changeDefectStatus sends the whole metadata back with only resolutionStatus changed', async () => {
    respond({
      id: 'e1',
      metadata: { severity: 'high', resolutionStatus: 'resolved' },
      undo: TOKEN,
    });
    const result = await changeDefectStatus(
      { id: 'e1', metadata: { severity: 'high', resolutionStatus: 'open', location: 'Roof' } },
      'resolved',
    );
    expect(lastCall()).toEqual({
      url: '/api/diary-entries/e1',
      method: 'PATCH',
      body: { metadata: { severity: 'high', resolutionStatus: 'resolved', location: 'Roof' } },
    });
    expect(result.undo).toEqual(TOKEN);
    expect('undo' in result.record).toBe(false);
  });

  it('changeDefectStatus works for an entry whose metadata is null', async () => {
    respond({ id: 'e1', metadata: { resolutionStatus: 'open' } });
    const result = await changeDefectStatus({ id: 'e1', metadata: null }, 'open');
    expect(lastCall().body).toEqual({ metadata: { resolutionStatus: 'open' } });
    expect(result.undo).toBeNull();
  });
});
