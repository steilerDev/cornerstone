/**
 * @jest-environment node
 */
import { jest } from '@jest/globals';
import {
  ApiClientError,
  NetworkError,
  setBaseUrl,
  getBaseUrl,
  get,
  post,
  put,
  del,
} from './apiClient.js';

// Mock fetch globally
const mockFetch = jest.fn<typeof fetch>();

/**
 * Helper to create a mock JSON response
 */
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Helper to create a mock non-JSON response
 */
function textResponse(body: string, status = 500): Response {
  return new Response(body, {
    status,
    statusText: 'Internal Server Error',
    headers: { 'Content-Type': 'text/html' },
  });
}

/**
 * Helper to create a mock 204 response
 */
function noContentResponse(): Response {
  return new Response(null, { status: 204 });
}

describe('apiClient', () => {
  beforeEach(() => {
    // Reset fetch mock and base URL before each test
    globalThis.fetch = mockFetch;
    mockFetch.mockReset();
    setBaseUrl('/api');
  });

  describe('Base URL configuration', () => {
    it('has default base URL of /api', () => {
      expect(getBaseUrl()).toBe('/api');
    });

    it('allows setting a custom base URL', () => {
      setBaseUrl('https://example.com/v1');
      expect(getBaseUrl()).toBe('https://example.com/v1');
    });

    it('strips trailing slashes from base URL', () => {
      setBaseUrl('https://example.com/v1///');
      expect(getBaseUrl()).toBe('https://example.com/v1');
    });

    it('strips single trailing slash from base URL', () => {
      setBaseUrl('/api/');
      expect(getBaseUrl()).toBe('/api');
    });
  });

  describe('GET requests', () => {
    it('makes a GET request to the correct URL', async () => {
      const mockData = { id: 1, name: 'Test' };
      mockFetch.mockResolvedValueOnce(jsonResponse(mockData));

      await get('/users/1');

      expect(mockFetch).toHaveBeenCalledWith('/api/users/1', {
        method: 'GET',
        headers: {},
        body: undefined,
        signal: undefined,
      });
    });

    it('returns correctly parsed JSON data', async () => {
      const mockData = { id: 1, name: 'Test' };
      mockFetch.mockResolvedValueOnce(jsonResponse(mockData));

      const result = await get<typeof mockData>('/users/1');

      expect(result).toEqual(mockData);
    });

    it('passes custom headers to fetch', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ success: true }));

      await get('/users', {
        headers: { 'X-Custom': 'value', Authorization: 'Bearer token' },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/users',
        expect.objectContaining({
          headers: { 'X-Custom': 'value', Authorization: 'Bearer token' },
        }),
      );
    });

    it('passes AbortSignal to fetch', async () => {
      const controller = new AbortController();
      mockFetch.mockResolvedValueOnce(jsonResponse({ success: true }));

      await get('/users', { signal: controller.signal });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/users',
        expect.objectContaining({
          signal: controller.signal,
        }),
      );
    });

    it('returns undefined for 204 No Content response', async () => {
      mockFetch.mockResolvedValueOnce(noContentResponse());

      const result = await get('/users/1');

      expect(result).toBeUndefined();
    });
  });

  describe('POST requests', () => {
    it('makes a POST request with JSON body', async () => {
      const body = { name: 'New User' };
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 1, ...body }));

      await post('/users', body);

      expect(mockFetch).toHaveBeenCalledWith('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: undefined,
      });
    });

    it('returns correctly parsed JSON response', async () => {
      const body = { name: 'New User' };
      const responseData = { id: 1, ...body };
      mockFetch.mockResolvedValueOnce(jsonResponse(responseData));

      const result = await post<typeof responseData>('/users', body);

      expect(result).toEqual(responseData);
    });

    it('sets Content-Type header when body is provided', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 1 }));

      await post('/users', { name: 'Test' });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/users',
        expect.objectContaining({
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });

    it('does not set Content-Type header when body is undefined', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ success: true }));

      await post('/users');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/users',
        expect.objectContaining({
          headers: {},
          body: undefined,
        }),
      );
    });

    it('sets Content-Type when body is null', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ success: true }));

      await post('/users', null);

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/users',
        expect.objectContaining({
          headers: { 'Content-Type': 'application/json' },
          body: 'null',
        }),
      );
    });

    it('sets Content-Type when body is empty object', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ success: true }));

      await post('/users', {});

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/users',
        expect.objectContaining({
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        }),
      );
    });

    it('merges custom headers with Content-Type', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 1 }));

      await post('/users', { name: 'Test' }, { headers: { 'X-Custom': 'value' } });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/users',
        expect.objectContaining({
          headers: { 'Content-Type': 'application/json', 'X-Custom': 'value' },
        }),
      );
    });

    it('passes AbortSignal to fetch', async () => {
      const controller = new AbortController();
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 1 }));

      await post('/users', { name: 'Test' }, { signal: controller.signal });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/users',
        expect.objectContaining({
          signal: controller.signal,
        }),
      );
    });
  });

  describe('PUT requests', () => {
    it('makes a PUT request with JSON body', async () => {
      const body = { name: 'Updated User' };
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 1, ...body }));

      await put('/users/1', body);

      expect(mockFetch).toHaveBeenCalledWith('/api/users/1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: undefined,
      });
    });

    it('returns correctly parsed JSON response', async () => {
      const body = { name: 'Updated User' };
      const responseData = { id: 1, ...body };
      mockFetch.mockResolvedValueOnce(jsonResponse(responseData));

      const result = await put<typeof responseData>('/users/1', body);

      expect(result).toEqual(responseData);
    });

    it('sets Content-Type header when body is provided', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 1 }));

      await put('/users/1', { name: 'Test' });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/users/1',
        expect.objectContaining({
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });

    it('does not set Content-Type header when body is undefined', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ success: true }));

      await put('/users/1');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/users/1',
        expect.objectContaining({
          headers: {},
          body: undefined,
        }),
      );
    });
  });

  describe('DELETE requests', () => {
    it('makes a DELETE request to the correct URL', async () => {
      mockFetch.mockResolvedValueOnce(noContentResponse());

      await del('/users/1');

      expect(mockFetch).toHaveBeenCalledWith('/api/users/1', {
        method: 'DELETE',
        headers: {},
        body: undefined,
        signal: undefined,
      });
    });

    it('returns undefined for 204 No Content response', async () => {
      mockFetch.mockResolvedValueOnce(noContentResponse());

      const result = await del('/users/1');

      expect(result).toBeUndefined();
    });

    it('passes custom headers to fetch', async () => {
      mockFetch.mockResolvedValueOnce(noContentResponse());

      await del('/users/1', { headers: { 'X-Custom': 'value' } });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/users/1',
        expect.objectContaining({
          headers: { 'X-Custom': 'value' },
        }),
      );
    });

    it('passes AbortSignal to fetch', async () => {
      const controller = new AbortController();
      mockFetch.mockResolvedValueOnce(noContentResponse());

      await del('/users/1', { signal: controller.signal });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/users/1',
        expect.objectContaining({
          signal: controller.signal,
        }),
      );
    });
  });

  describe('Error handling - Server errors', () => {
    it('throws ApiClientError for non-2xx response with JSON error body', async () => {
      const errorResponse = {
        error: {
          code: 'NOT_FOUND',
          message: 'User not found',
          details: { userId: 123 },
        },
      };
      mockFetch.mockResolvedValueOnce(jsonResponse(errorResponse, 404));

      try {
        await get('/users/123');
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(ApiClientError);
        const apiError = error as ApiClientError;
        expect(apiError.statusCode).toBe(404);
        expect(apiError.error.code).toBe('NOT_FOUND');
        expect(apiError.error.message).toBe('User not found');
        expect(apiError.error.details).toEqual({ userId: 123 });
        expect(apiError.message).toBe('User not found');
        expect(apiError.name).toBe('ApiClientError');
      }
    });

    it('ApiClientError is an instance of Error', async () => {
      const errorResponse = {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input',
        },
      };
      mockFetch.mockResolvedValueOnce(jsonResponse(errorResponse, 400));

      try {
        await get('/users');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect(error).toBeInstanceOf(ApiClientError);
      }
    });

    it('throws ApiClientError with synthetic error for non-JSON error response', async () => {
      mockFetch.mockResolvedValueOnce(textResponse('<html>Internal Server Error</html>', 500));

      try {
        await get('/users');
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(ApiClientError);
        const apiError = error as ApiClientError;
        expect(apiError.statusCode).toBe(500);
        expect(apiError.error.code).toBe('INTERNAL_ERROR');
        expect(apiError.error.message).toBe('HTTP 500: Internal Server Error');
        expect(apiError.message).toBe('HTTP 500: Internal Server Error');
      }
    });

    it('throws ApiClientError for 400 Bad Request', async () => {
      const errorResponse = {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
        },
      };
      mockFetch.mockResolvedValueOnce(jsonResponse(errorResponse, 400));

      try {
        await post('/users', { name: '' });
      } catch (error) {
        expect(error).toBeInstanceOf(ApiClientError);
        const apiError = error as ApiClientError;
        expect(apiError.statusCode).toBe(400);
        expect(apiError.error.code).toBe('VALIDATION_ERROR');
      }
    });

    it('throws ApiClientError for 401 Unauthorized', async () => {
      const errorResponse = {
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      };
      mockFetch.mockResolvedValueOnce(jsonResponse(errorResponse, 401));

      try {
        await get('/users');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiClientError);
        const apiError = error as ApiClientError;
        expect(apiError.statusCode).toBe(401);
      }
    });

    it('throws ApiClientError for 403 Forbidden', async () => {
      const errorResponse = {
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied',
        },
      };
      mockFetch.mockResolvedValueOnce(jsonResponse(errorResponse, 403));

      try {
        await get('/users');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiClientError);
        const apiError = error as ApiClientError;
        expect(apiError.statusCode).toBe(403);
      }
    });

    it('throws ApiClientError for 500 Internal Server Error', async () => {
      const errorResponse = {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred',
        },
      };
      mockFetch.mockResolvedValueOnce(jsonResponse(errorResponse, 500));

      try {
        await get('/users');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiClientError);
        const apiError = error as ApiClientError;
        expect(apiError.statusCode).toBe(500);
        expect(apiError.error.code).toBe('INTERNAL_ERROR');
      }
    });
  });

  describe('Error handling - Network errors', () => {
    it('throws NetworkError when fetch fails with TypeError', async () => {
      const networkError = new TypeError('Failed to fetch');
      mockFetch.mockRejectedValueOnce(networkError);

      try {
        await get('/users');
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(NetworkError);
        const netError = error as NetworkError;
        expect(netError.message).toBe('Network request failed');
        expect(netError.cause).toBe(networkError);
        expect(netError.name).toBe('NetworkError');
      }
    });

    it('NetworkError is an instance of Error', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('Network failure'));

      try {
        await get('/users');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect(error).toBeInstanceOf(NetworkError);
      }
    });

    it('throws NetworkError when request is aborted', async () => {
      const controller = new AbortController();
      // Node.js AbortController throws AbortError as a generic Error
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      mockFetch.mockRejectedValueOnce(abortError);

      controller.abort();

      try {
        await get('/users', { signal: controller.signal });
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(NetworkError);
        const netError = error as NetworkError;
        expect(netError.cause).toBe(abortError);
      }
    });

    it('throws NetworkError for DNS resolution failure', async () => {
      const dnsError = new TypeError('getaddrinfo ENOTFOUND example.com');
      mockFetch.mockRejectedValueOnce(dnsError);

      try {
        await get('/users');
      } catch (error) {
        expect(error).toBeInstanceOf(NetworkError);
        const netError = error as NetworkError;
        expect(netError.cause).toBe(dnsError);
      }
    });

    it('throws NetworkError for connection refused', async () => {
      const connError = new TypeError('connect ECONNREFUSED 127.0.0.1:3000');
      mockFetch.mockRejectedValueOnce(connError);

      try {
        await get('/users');
      } catch (error) {
        expect(error).toBeInstanceOf(NetworkError);
        const netError = error as NetworkError;
        expect(netError.cause).toBe(connError);
      }
    });
  });

  describe('Integration with custom base URL', () => {
    it('uses custom base URL for all requests', async () => {
      setBaseUrl('https://api.example.com/v1');
      mockFetch.mockResolvedValueOnce(jsonResponse({ success: true }));

      await get('/users');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/v1/users',
        expect.any(Object),
      );
    });

    it('base URL persists across multiple requests', async () => {
      setBaseUrl('https://api.example.com/v2');
      // Create fresh response for each call to avoid "Body already read" error
      mockFetch.mockImplementation(async () => jsonResponse({ success: true }));

      await get('/users');
      await post('/users', { name: 'Test' });
      await put('/users/1', { name: 'Updated' });
      await del('/users/1');

      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        'https://api.example.com/v2/users',
        expect.any(Object),
      );
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        'https://api.example.com/v2/users',
        expect.any(Object),
      );
      expect(mockFetch).toHaveBeenNthCalledWith(
        3,
        'https://api.example.com/v2/users/1',
        expect.any(Object),
      );
      expect(mockFetch).toHaveBeenNthCalledWith(
        4,
        'https://api.example.com/v2/users/1',
        expect.any(Object),
      );
    });
  });

  describe('Edge cases', () => {
    it('handles path without leading slash', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ success: true }));

      await get('users'); // No leading slash

      expect(mockFetch).toHaveBeenCalledWith('/apiusers', expect.any(Object));
    });

    it('handles empty path', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ success: true }));

      await get('');

      expect(mockFetch).toHaveBeenCalledWith('/api', expect.any(Object));
    });

    it('handles base URL with path segments', async () => {
      setBaseUrl('https://example.com/api/v1');
      mockFetch.mockResolvedValueOnce(jsonResponse({ success: true }));

      await get('/users');

      expect(mockFetch).toHaveBeenCalledWith('https://example.com/api/v1/users', expect.any(Object));
    });

    it('custom headers do not override Content-Type when body is present', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 1 }));

      await post('/users', { name: 'Test' }, { headers: { 'Content-Type': 'text/plain' } });

      // Custom Content-Type is overridden by JSON Content-Type
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/users',
        expect.objectContaining({
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });
  });
});
