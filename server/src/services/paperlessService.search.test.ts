/**
 * Unit tests for searchPaperlessDocuments (#2210): request building, filter tag handling
 * (fail closed), signal pass-through and the shape of thrown errors.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { searchPaperlessDocuments, _resetFilterTagCache } from './paperlessService.js';
import { AppError } from '../errors/AppError.js';

const mockFetch = jest.fn<typeof fetch>();
let originalFetch: typeof fetch;

const BASE = 'http://paperless.test:8000';
const TOKEN = 'secret-token-value';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Server Error',
    json: () => Promise.resolve(body),
    headers: { get: () => null },
  } as unknown as Response;
}

function urlOf(call: number): URL {
  return new URL(String(mockFetch.mock.calls[call]![0]));
}

describe('searchPaperlessDocuments', () => {
  beforeEach(() => {
    originalFetch = global.fetch;
    global.fetch = mockFetch as unknown as typeof fetch;
    mockFetch.mockReset();
    _resetFilterTagCache();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('makes one request with query, page and page_size and maps the result', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        count: 7,
        results: [
          { id: 3, title: 'Roof plan', created: '2026-01-02', content: 'ignored' },
          { id: 4, title: null, created: undefined },
        ],
      }),
    );

    const result = await searchPaperlessDocuments(
      BASE,
      TOKEN,
      'roof & plan',
      5,
      null,
      new AbortController().signal,
    );

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const url = urlOf(0);
    expect(url.pathname).toBe('/api/documents/');
    expect(url.searchParams.get('query')).toBe('roof & plan');
    expect(url.searchParams.get('page')).toBe('1');
    expect(url.searchParams.get('page_size')).toBe('5');
    expect(url.searchParams.has('tags__id__all')).toBe(false);
    expect(url.searchParams.has('ordering')).toBe(false);
    expect(result).toEqual({
      total: 7,
      documents: [
        { id: 3, title: 'Roof plan', created: '2026-01-02' },
        { id: 4, title: null, created: null },
      ],
    });
  });

  it('sends the token as an Authorization header and never in the URL', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ count: 0, results: [] }));
    await searchPaperlessDocuments(BASE, TOKEN, 'abc', 5, null, new AbortController().signal);

    const [url, init] = mockFetch.mock.calls[0]!;
    expect(String(url)).not.toContain(TOKEN);
    expect((init?.headers as Record<string, string>).Authorization).toBe(`Token ${TOKEN}`);
  });

  it('passes the abort signal to fetch', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ count: 0, results: [] }));
    const controller = new AbortController();
    await searchPaperlessDocuments(BASE, TOKEN, 'abc', 5, null, controller.signal);
    expect(mockFetch.mock.calls[0]![1]?.signal).toBe(controller.signal);
  });

  it('treats an empty filter tag name as no filter', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ count: 0, results: [] }));
    await searchPaperlessDocuments(BASE, TOKEN, 'abc', 5, '', new AbortController().signal);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(urlOf(0).searchParams.has('tags__id__all')).toBe(false);
  });

  it('resolves the filter tag (case-insensitive) and adds tags__id__all', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ count: 1, results: [{ id: 12, name: 'Household' }] }))
      .mockResolvedValueOnce(jsonResponse({ count: 0, results: [] }));
    const controller = new AbortController();

    await searchPaperlessDocuments(BASE, TOKEN, 'abc', 5, 'household', controller.signal);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(urlOf(0).pathname).toBe('/api/tags/');
    // The signal reaches the tag lookup as well
    expect(mockFetch.mock.calls[0]![1]?.signal).toBe(controller.signal);
    expect(urlOf(1).searchParams.get('tags__id__all')).toBe('12');
  });

  it('fails closed when the filter tag cannot be found: no document request is made', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ count: 0, results: [] }));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(
      searchPaperlessDocuments(BASE, TOKEN, 'abc', 5, 'missing', new AbortController().signal),
    ).rejects.toMatchObject({ code: 'PAPERLESS_ERROR', statusCode: 502 });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(urlOf(0).pathname).toBe('/api/tags/');
    warn.mockRestore();
  });

  it('fails closed when the tag lookup request itself fails', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNRESET'));

    await expect(
      searchPaperlessDocuments(BASE, TOKEN, 'abc', 5, 'household', new AbortController().signal),
    ).rejects.toBeInstanceOf(AppError);

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('throws PAPERLESS_ERROR on an upstream 500 without the token or query in the message', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 500));

    const error = await searchPaperlessDocuments(
      BASE,
      TOKEN,
      'private query words',
      5,
      null,
      new AbortController().signal,
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe('PAPERLESS_ERROR');
    expect((error as AppError).message).not.toContain(TOKEN);
    expect((error as AppError).message).not.toContain('private query words');
  });

  it('propagates a fetch rejection as PAPERLESS_UNREACHABLE', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    await expect(
      searchPaperlessDocuments(BASE, TOKEN, 'abc', 5, null, new AbortController().signal),
    ).rejects.toMatchObject({ code: 'PAPERLESS_UNREACHABLE' });
  });
});
