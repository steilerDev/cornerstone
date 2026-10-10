import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { fetchDeleteImpact } from './deleteImpactApi.js';

describe('deleteImpactApi', () => {
  let mockFetch: jest.MockedFunction<typeof globalThis.fetch>;

  beforeEach(() => {
    mockFetch = jest.fn<typeof globalThis.fetch>();
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('GETs /api/delete-impact/:type/:id and returns the body', async () => {
    const body = { entityType: 'area', id: '7', effects: [{ kind: 'childAreas', count: 2 }] };
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => body } as Response);

    const result = await fetchDeleteImpact('area', 7);

    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toBe('/api/delete-impact/area/7');
    expect(init?.method ?? 'GET').toBe('GET');
    expect(result).toEqual(body);
  });

  it('URL-encodes string ids', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) } as Response);
    await fetchDeleteImpact('vendor', 'a/b');
    expect(mockFetch.mock.calls[0]![0]).toBe('/api/delete-impact/vendor/a%2Fb');
  });

  it('rejects when the entity is not found', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ error: { code: 'NOT_FOUND', message: 'nope' } }),
    } as Response);
    await expect(fetchDeleteImpact('area', 1)).rejects.toMatchObject({ statusCode: 404 });
  });
});
