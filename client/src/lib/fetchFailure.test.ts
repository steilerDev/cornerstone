/**
 * fetchFailure (#2242): a failed load kept as data, translated at render time.
 *
 * Mutations: a 404 not flagged; the API text shown for a 404 when a not-found copy is given; the
 * fallback used for an API error (or the API text for a plain error); the code not translated.
 */
import { describe, it, expect, jest } from '@jest/globals';
import { ApiClientError } from './apiClient.js';
import { fetchFailureMessage, toFetchFailure } from './fetchFailure.js';

const tErrors = jest.fn((key: string) => `T:${key}`) as never;

describe('toFetchFailure', () => {
  it('keeps the code of an API error and flags a 404', () => {
    expect(toFetchFailure(new ApiClientError(404, { code: 'NOT_FOUND', message: 'x' }))).toEqual({
      kind: 'api',
      code: 'NOT_FOUND',
      notFound: true,
    });
    expect(
      toFetchFailure(new ApiClientError(500, { code: 'INTERNAL_ERROR', message: 'x' })),
    ).toEqual({
      kind: 'api',
      code: 'INTERNAL_ERROR',
      notFound: false,
    });
  });

  it.each([new Error('offline'), 'text', null, undefined])(
    'reports %p as another failure',
    (err) => {
      expect(toFetchFailure(err)).toEqual({ kind: 'other' });
    },
  );
});

describe('fetchFailureMessage', () => {
  const api = (notFound: boolean) => ({ kind: 'api', code: 'SOME_CODE', notFound }) as const;

  it('uses the fallback for a failure that is not an API error', () => {
    expect(fetchFailureMessage({ kind: 'other' }, tErrors, 'Fallback', 'Not found')).toBe(
      'Fallback',
    );
  });

  it('translates the API code', () => {
    expect(fetchFailureMessage(api(false), tErrors, 'Fallback')).toContain('SOME_CODE');
  });

  it('a 404 uses the not-found copy when one is given, and the translated code when not', () => {
    expect(fetchFailureMessage(api(true), tErrors, 'Fallback', 'Not found')).toBe('Not found');
    expect(fetchFailureMessage(api(true), tErrors, 'Fallback')).toContain('SOME_CODE');
  });

  it('a non-404 ignores the not-found copy', () => {
    expect(fetchFailureMessage(api(false), tErrors, 'Fallback', 'Not found')).not.toBe('Not found');
  });
});
