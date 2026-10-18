import { ApiClientError } from './apiClient.js';

/**
 * True only when a failed session check proves the user is signed out (a real 401).
 * Aborted requests, network failures, 5xx, 429 and parse errors are transient: never a sign-out.
 */
export function isSignedOutError(error: unknown): boolean {
  return error instanceof ApiClientError && error.statusCode === 401;
}
