/**
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { ApiClientError, NetworkError } from './apiClient.js';
import { isSignedOutError } from './authFailure.js';

describe('isSignedOutError', () => {
  it('is true for a real 401 response', () => {
    const error = new ApiClientError(401, { code: 'UNAUTHORIZED', message: 'x' });
    expect(isSignedOutError(error)).toBe(true);
  });

  it.each([403, 404, 429, 500, 503])('is false for an ApiClientError with status %i', (status) => {
    const error = new ApiClientError(status, { code: 'INTERNAL_ERROR', message: 'x' });
    expect(isSignedOutError(error)).toBe(false);
  });

  it('is false for an aborted request wrapped in a NetworkError', () => {
    const abort = new DOMException('The operation was aborted', 'AbortError');
    expect(isSignedOutError(new NetworkError('aborted', abort))).toBe(false);
  });

  it('is false for a plain Error, a string and undefined', () => {
    expect(isSignedOutError(new Error('boom'))).toBe(false);
    expect(isSignedOutError('401')).toBe(false);
    expect(isSignedOutError(undefined)).toBe(false);
  });

  it('is false for a look-alike object that is not an ApiClientError', () => {
    expect(isSignedOutError({ statusCode: 401 })).toBe(false);
  });
});
