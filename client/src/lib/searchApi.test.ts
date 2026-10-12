import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type { SearchResponse } from '@cornerstone/shared';
import { searchEverywhere } from './searchApi.js';

describe('searchApi', () => {
  let mockFetch: jest.MockedFunction<typeof globalThis.fetch>;
  const body: SearchResponse = { query: 'abc', groups: [] };

  beforeEach(() => {
    mockFetch = jest.fn<typeof globalThis.fetch>();
    globalThis.fetch = mockFetch;
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => body } as Response);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const calledUrl = () => new URL(String(mockFetch.mock.calls[0]![0]), 'http://localhost');

  it('GETs /api/search with only q when nothing else is given and returns the body', async () => {
    const result = await searchEverywhere({ q: 'abc' });
    const url = calledUrl();
    expect(url.pathname).toBe('/api/search');
    expect([...url.searchParams.keys()]).toEqual(['q']);
    expect(url.searchParams.get('q')).toBe('abc');
    expect(mockFetch.mock.calls[0]![1]?.method ?? 'GET').toBe('GET');
    expect(result).toEqual(body);
  });

  it('encodes reserved characters and umlauts in the query', async () => {
    await searchEverywhere({ q: 'Müller & Söhne 100%+x=y' });
    const raw = String(mockFetch.mock.calls[0]![0]);
    expect(raw).not.toContain(' ');
    expect(raw).not.toContain('&S');
    expect(calledUrl().searchParams.get('q')).toBe('Müller & Söhne 100%+x=y');
    expect([...calledUrl().searchParams.keys()]).toEqual(['q']);
  });

  it('joins types with a comma', async () => {
    await searchEverywhere({ q: 'abc', types: ['vendor', 'work_item'] });
    expect(calledUrl().searchParams.get('types')).toBe('vendor,work_item');
  });

  it('omits types when the list is empty', async () => {
    await searchEverywhere({ q: 'abc', types: [] });
    expect(calledUrl().searchParams.has('types')).toBe(false);
  });

  it('sends limit as a number string', async () => {
    await searchEverywhere({ q: 'abc', limit: 12 });
    expect(calledUrl().searchParams.get('limit')).toBe('12');
  });

  it('joins tradeIds with a comma (#2213)', async () => {
    await searchEverywhere({ q: 'tile', tradeIds: ['t1', 't2'] });
    expect(calledUrl().searchParams.get('tradeIds')).toBe('t1,t2');
  });

  it.each([undefined, []])('omits tradeIds when it is %j', async (tradeIds) => {
    await searchEverywhere({ q: 'tile', tradeIds });
    expect(calledUrl().searchParams.has('tradeIds')).toBe(false);
  });

  it('passes the abort signal to fetch', async () => {
    const controller = new AbortController();
    await searchEverywhere({ q: 'abc' }, controller.signal);
    expect(mockFetch.mock.calls[0]![1]?.signal).toBe(controller.signal);
  });

  it('rejects with the API error on a 400', async () => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: { code: 'VALIDATION_ERROR', message: 'bad' } }),
    } as Response);
    await expect(searchEverywhere({ q: 'a' })).rejects.toMatchObject({ statusCode: 400 });
  });
});
