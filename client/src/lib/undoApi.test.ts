import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { undoChange } from './undoApi.js';

describe('undoApi', () => {
  let mockFetch: jest.MockedFunction<typeof globalThis.fetch>;

  beforeEach(() => {
    mockFetch = jest.fn<typeof globalThis.fetch>();
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('POSTs the token to /api/undo/:token and returns the body', async () => {
    const token = `u_${'a'.repeat(32)}`;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ restored: [], retractedEventIds: [] }),
    } as Response);

    const result = await undoChange(token);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toBe(`/api/undo/${token}`);
    expect(init?.method).toBe('POST');
    expect(result).toEqual({ restored: [], retractedEventIds: [] });
  });

  it('URL-encodes the token', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) } as Response);
    await undoChange('a/b c');
    expect(mockFetch.mock.calls[0]![0]).toBe('/api/undo/a%2Fb%20c');
  });

  it('rejects with the status code on a 409', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ error: { code: 'CONFLICT', message: 'changed' } }),
    } as Response);
    await expect(undoChange('u_x')).rejects.toMatchObject({
      statusCode: 409,
      name: 'ApiClientError',
    });
  });
});
