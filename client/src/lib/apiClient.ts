import type { ApiError, ApiErrorResponse } from '@cornerstone/shared';

/**
 * Error thrown when the server returns a 4xx or 5xx response with an API error body.
 */
export class ApiClientError extends Error {
  readonly statusCode: number;
  readonly error: ApiError;

  constructor(statusCode: number, error: ApiError) {
    super(error.message);
    this.name = 'ApiClientError';
    this.statusCode = statusCode;
    this.error = error;
  }
}

/**
 * Error thrown when the fetch request fails due to network issues (offline, DNS, CORS, abort).
 */
export class NetworkError extends Error {
  readonly cause: unknown;

  constructor(message: string, cause: unknown) {
    super(message);
    this.name = 'NetworkError';
    this.cause = cause;
  }
}

/**
 * Options for API requests.
 */
export interface RequestOptions {
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

/**
 * Base URL for all API requests.
 */
let baseUrl = '/api';

/**
 * Sets the base URL for all API requests.
 * Trailing slashes are automatically stripped.
 */
export function setBaseUrl(url: string): void {
  baseUrl = url.replace(/\/+$/, '');
}

/**
 * Gets the current base URL for API requests.
 */
export function getBaseUrl(): string {
  return baseUrl;
}

/**
 * Internal generic request function.
 * @throws {ApiClientError} When the server returns a 4xx or 5xx response
 * @throws {NetworkError} When the fetch request fails due to network issues
 */
async function request<T>(
  method: string,
  path: string,
  options?: RequestOptions & { body?: unknown },
): Promise<T> {
  const url = `${baseUrl}${path}`;
  const headers: Record<string, string> = {
    ...options?.headers,
  };

  // Only set Content-Type when body is present
  if (options?.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options?.signal,
    });

    // Handle 204 No Content
    if (response.status === 204) {
      return undefined as T;
    }

    // Handle non-2xx responses
    if (!response.ok) {
      let apiError: ApiError;

      try {
        const errorBody = (await response.json()) as ApiErrorResponse;
        apiError = errorBody.error;
      } catch {
        // Non-JSON response (e.g., from reverse proxy) - create synthetic error
        apiError = {
          code: 'INTERNAL_ERROR',
          message: `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      throw new ApiClientError(response.status, apiError);
    }

    // Parse successful response
    return (await response.json()) as T;
  } catch (error) {
    // Re-throw ApiClientError as-is
    if (error instanceof ApiClientError) {
      throw error;
    }

    // Wrap network errors
    throw new NetworkError('Network request failed', error);
  }
}

/**
 * Performs a GET request.
 */
export async function get<T>(path: string, options?: RequestOptions): Promise<T> {
  return request<T>('GET', path, options);
}

/**
 * Performs a POST request.
 */
export async function post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
  return request<T>('POST', path, { ...options, body });
}

/**
 * Performs a PUT request.
 */
export async function put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
  return request<T>('PUT', path, { ...options, body });
}

/**
 * Performs a PATCH request.
 */
export async function patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
  return request<T>('PATCH', path, { ...options, body });
}

/**
 * Performs a DELETE request.
 */
export async function del<T>(path: string, options?: RequestOptions): Promise<T> {
  return request<T>('DELETE', path, options);
}
