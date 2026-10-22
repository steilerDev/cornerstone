import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { getAttention, notNow, undoNotNow } from './attentionApi.js';

describe('attentionApi', () => {
  let mockFetch: jest.MockedFunction<typeof globalThis.fetch>;

  beforeEach(() => {
    mockFetch = jest.fn<typeof globalThis.fetch>();
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function ok(body: unknown, status = 200): Response {
    return { ok: true, status, json: async () => body } as Response;
  }

  it('getAttention GETs /api/attention without a query by default', async () => {
    mockFetch.mockResolvedValueOnce(ok({ count: 0 }));
    await expect(getAttention()).resolves.toEqual({ count: 0 });
    expect(mockFetch.mock.calls[0]![0]).toBe('/api/attention');
    expect(mockFetch.mock.calls[0]![1]?.method).toBe('GET');
  });

  it('getAttention sends includeSnoozed=true only when asked', async () => {
    mockFetch.mockResolvedValueOnce(ok({ count: 0 }));
    await getAttention({ includeSnoozed: true });
    expect(mockFetch.mock.calls[0]![0]).toBe('/api/attention?includeSnoozed=true');

    mockFetch.mockResolvedValueOnce(ok({ count: 0 }));
    await getAttention({ includeSnoozed: false });
    expect(mockFetch.mock.calls[1]![0]).toBe('/api/attention');
  });

  it('notNow POSTs the row key', async () => {
    mockFetch.mockResolvedValueOnce(ok({ key: 'N1:work_item:a', snoozedUntil: '2026-03-17' }));
    const result = await notNow('N1:work_item:a');
    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toBe('/api/attention/not-now');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({ key: 'N1:work_item:a' });
    expect(result.snoozedUntil).toBe('2026-03-17');
  });

  it('undoNotNow DELETEs the URL-encoded key from the path', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 204 } as Response);
    await undoNotNow('N1:work_item:a');
    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toBe('/api/attention/not-now/N1%3Awork_item%3Aa');
    expect(init?.method).toBe('DELETE');
    expect(init?.body).toBeUndefined();
  });

  it('rejects with ApiClientError on a failed request', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: { code: 'VALIDATION_ERROR', message: 'bad' } }),
    } as Response);
    await expect(notNow('bad')).rejects.toMatchObject({ statusCode: 400, name: 'ApiClientError' });
  });
});
