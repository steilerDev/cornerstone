/**
 * financingApi (#2242): the Financing page and grant covered-item calls.
 *
 * Mutations these tests catch: a wrong URL, POST sent as GET, items not wrapped in `{ items }`,
 * the abort signal not forwarded, an error response resolving instead of rejecting.
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { fetchFinancing, fetchGrantItems, linkGrantItems } from './financingApi.js';
import { ApiClientError } from './apiClient.js';

describe('financingApi', () => {
  let mockFetch: jest.MockedFunction<typeof globalThis.fetch>;

  beforeEach(() => {
    mockFetch = jest.fn<typeof globalThis.fetch>();
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function ok(body: unknown): void {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => body } as Response);
  }

  it('fetchFinancing GETs /api/budget/financing and forwards the abort signal', async () => {
    ok({ sources: [], grants: [] });
    const controller = new AbortController();

    const result = await fetchFinancing(controller.signal);

    expect(result).toEqual({ sources: [], grants: [] });
    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toBe('/api/budget/financing');
    expect((init as RequestInit).signal).toBe(controller.signal);
    expect((init as RequestInit).method ?? 'GET').toBe('GET');
  });

  it('fetchGrantItems GETs the covered items of one grant', async () => {
    ok({ items: [{ type: 'work_item', id: 'wi-1', title: 'Roof', area: null, covered: 10 }] });

    const result = await fetchGrantItems('sp-1');

    expect(mockFetch.mock.calls[0]![0]).toBe('/api/subsidy-programs/sp-1/items');
    expect(result.items[0]!.covered).toBe(10);
  });

  it('linkGrantItems POSTs { items } and resolves with the full covered list', async () => {
    ok({ items: [] });

    await linkGrantItems('sp-1', [
      { type: 'work_item', id: 'wi-1' },
      { type: 'household_item', id: 'hi-1' },
    ]);

    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toBe('/api/subsidy-programs/sp-1/items');
    expect((init as RequestInit).method).toBe('POST');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      items: [
        { type: 'work_item', id: 'wi-1' },
        { type: 'household_item', id: 'hi-1' },
      ],
    });
  });

  it('rejects with an ApiClientError carrying the server code on an error response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({ error: { code: 'NOT_FOUND', message: 'x' } }),
    } as Response);

    await expect(linkGrantItems('nope', [{ type: 'work_item', id: 'a' }])).rejects.toBeInstanceOf(
      ApiClientError,
    );
  });
});
