import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { getHomePulse, getHomeSetup, getHomeWeek } from './homeApi.js';

describe('homeApi', () => {
  let mockFetch: jest.MockedFunction<typeof globalThis.fetch>;

  beforeEach(() => {
    mockFetch = jest.fn<typeof globalThis.fetch>();
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each([
    ['getHomeWeek', getHomeWeek, '/api/home/week'],
    ['getHomePulse', getHomePulse, '/api/home/pulse'],
    ['getHomeSetup', getHomeSetup, '/api/home/setup'],
  ] as const)('%s GETs %s and returns the body', async (_name, call, url) => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ marker: url }),
    } as Response);
    await expect(call()).resolves.toEqual({ marker: url });
    expect(mockFetch.mock.calls[0]![0]).toBe(url);
    expect(mockFetch.mock.calls[0]![1]?.method).toBe('GET');
  });

  it('rejects with ApiClientError when the server answers 401', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: { code: 'UNAUTHORIZED', message: 'no' } }),
    } as Response);
    await expect(getHomePulse()).rejects.toMatchObject({ statusCode: 401 });
  });
});
