import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { listHistory } from './historyApi.js';

describe('historyApi', () => {
  let mockFetch: jest.MockedFunction<typeof globalThis.fetch>;

  beforeEach(() => {
    mockFetch = jest.fn<typeof globalThis.fetch>();
    globalThis.fetch = mockFetch;
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ items: [], pagination: {}, hiddenCount: 0, object: null }),
    } as Response);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function calledUrl(): string {
    return mockFetch.mock.calls[0]![0] as string;
  }

  it('requests /api/history without a query string for an empty query', async () => {
    await listHistory({});
    expect(calledUrl()).toBe('/api/history');
  });

  it('serializes every supported field', async () => {
    await listHistory({
      page: 2,
      pageSize: 25,
      type: 'payment',
      entityType: 'invoice',
      entityId: 'inv-1',
      batchId: 'b-1',
      dateFrom: '2026-01-01',
      dateTo: '2026-01-31',
      q: 'T-001',
      includeDiary: true,
      showHidden: true,
      includeHidden: true,
    });
    const params = new URL(calledUrl(), 'http://x').searchParams;
    expect(Object.fromEntries(params)).toEqual({
      page: '2',
      pageSize: '25',
      type: 'payment',
      entityType: 'invoice',
      entityId: 'inv-1',
      batchId: 'b-1',
      dateFrom: '2026-01-01',
      dateTo: '2026-01-31',
      q: 'T-001',
      includeDiary: 'true',
      showHidden: 'true',
      includeHidden: 'true',
    });
  });

  it('omits flags that are false or absent', async () => {
    await listHistory({ page: 1, includeDiary: false, showHidden: false });
    expect(calledUrl()).toBe('/api/history?page=1');
  });

  it('passes the abort signal through', async () => {
    const controller = new AbortController();
    await listHistory({ page: 1 }, controller.signal);
    expect((mockFetch.mock.calls[0]![1] as RequestInit).signal).toBe(controller.signal);
  });
});
