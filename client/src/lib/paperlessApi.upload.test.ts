/**
 * uploadPaperlessDocument against the real apiClient (only fetch is stubbed), so the
 * toApiClientError normalisation of non-2xx responses is exercised end to end.
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { uploadPaperlessDocument } from './paperlessApi.js';
import { ApiClientError, NetworkError, setBaseUrl } from './apiClient.js';

describe('uploadPaperlessDocument (real apiClient)', () => {
  let mockFetch: jest.MockedFunction<typeof globalThis.fetch>;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    mockFetch = jest.fn<typeof globalThis.fetch>();
    globalThis.fetch = mockFetch;
    setBaseUrl('/api');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    setBaseUrl('/api');
  });

  describe('uploadPaperlessDocument', () => {
    it('POSTs multipart FormData with document and title fields to /paperless/documents', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ taskId: 'task-abc' }),
      } as Response);

      const blob = new Blob(['pdf-bytes'], { type: 'application/pdf' });
      await uploadPaperlessDocument(blob, 'Claim Report');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0]!;
      expect(url).toBe('/api/paperless/documents');
      expect((init as RequestInit).method).toBe('POST');
      expect((init as RequestInit).credentials).toBe('include');

      const formData = (init as RequestInit).body as FormData;
      expect(formData).toBeInstanceOf(FormData);
      expect(formData.get('document')).toBeInstanceOf(Blob);
      expect(formData.get('title')).toBe('Claim Report');
    });

    it('resolves with the parsed PaperlessUploadResponse on success (201)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ taskId: 'task-xyz' }),
      } as Response);

      const result = await uploadPaperlessDocument(new Blob(['x']), 'title');

      expect(result).toEqual({ taskId: 'task-xyz' });
    });

    it.each([
      [400, 'VALIDATION_ERROR'],
      [401, 'UNAUTHORIZED'],
      [413, 'PAYLOAD_TOO_LARGE'],
      [502, 'PAPERLESS_UNREACHABLE'],
      [502, 'PAPERLESS_ERROR'],
      [503, 'PAPERLESS_NOT_CONFIGURED'],
    ])(
      'throws ApiClientError(%i, %s) on a non-ok response with a structured error body',
      async (status, code) => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status,
          json: async () => ({ error: { code, message: 'failed' } }),
        } as Response);

        try {
          await uploadPaperlessDocument(new Blob(['x']), 'title');
          throw new Error('expected rejection');
        } catch (err) {
          expect(err).toBeInstanceOf(Error);
          const apiErr = err as { statusCode: number; error: { code: string } };
          expect(apiErr.statusCode).toBe(status);
          expect(apiErr.error.code).toBe(code);
        }
      },
    );

    it('falls back to a generic INTERNAL_ERROR when the error response body is not valid JSON', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => {
          throw new SyntaxError('Unexpected token');
        },
      } as unknown as Response);

      try {
        await uploadPaperlessDocument(new Blob(['x']), 'title');
        throw new Error('expected rejection');
      } catch (err) {
        const apiErr = err as { statusCode: number; error: { code: string } };
        expect(apiErr.statusCode).toBe(500);
        expect(apiErr.error.code).toBe('INTERNAL_ERROR');
      }
    });

    it('falls back to a generic INTERNAL_ERROR when the error response body has no error field', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: async () => ({}),
      } as Response);

      try {
        await uploadPaperlessDocument(new Blob(['x']), 'title');
        throw new Error('expected rejection');
      } catch (err) {
        const apiErr = err as { statusCode: number; error: { code: string } };
        expect(apiErr.statusCode).toBe(502);
        expect(apiErr.error.code).toBe('INTERNAL_ERROR');
      }
    });

    it.each([
      [401, 'UNAUTHORIZED'],
      [403, 'FORBIDDEN'],
      [404, 'NOT_FOUND'],
      [409, 'CONFLICT'],
      [413, 'PAYLOAD_TOO_LARGE'],
      [429, 'RATE_LIMIT_EXCEEDED'],
      [500, 'INTERNAL_ERROR'],
      [422, 'VALIDATION_ERROR'],
    ])('maps a non-JSON %i response to %s', async (status, code) => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status,
        json: async () => {
          throw new SyntaxError('Unexpected token <');
        },
      } as unknown as Response);

      const err = await uploadPaperlessDocument(new Blob(['x']), 'title').catch((e: unknown) => e);

      expect(err).toBeInstanceOf(ApiClientError);
      expect((err as ApiClientError).statusCode).toBe(status);
      expect((err as ApiClientError).error.code).toBe(code);
      expect((err as ApiClientError).message).toBe(code);
    });

    it('never exposes the server message through Error#message', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: async () => ({ error: { code: 'PAPERLESS_ERROR', message: 'RAW-SERVER' } }),
      } as Response);

      const err = await uploadPaperlessDocument(new Blob(['x']), 'title').catch((e: unknown) => e);

      expect((err as ApiClientError).message).toBe('PAPERLESS_ERROR');
      expect((err as ApiClientError).error.message).toBe('RAW-SERVER');
    });

    it('converts a fetch rejection into a NetworkError carrying the cause', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      try {
        await uploadPaperlessDocument(new Blob(['x']), 'title');
        throw new Error('expected rejection');
      } catch (err) {
        expect(err).toBeInstanceOf(NetworkError);
        expect((err as NetworkError).message).toBe('Network request failed');
        expect((err as NetworkError).cause).toBeInstanceOf(TypeError);
      }
    });

    it('uses getBaseUrl() for the upload URL', async () => {
      setBaseUrl('https://example.com/api');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ taskId: 't1' }),
      } as Response);

      await uploadPaperlessDocument(new Blob(['x']), 'title');

      expect(mockFetch.mock.calls[0]![0]).toBe('https://example.com/api/paperless/documents');
    });
  });
});
