import { describe, it, expect } from '@jest/globals';
import type { TFunction } from 'i18next';
import { ApiClientError } from './apiClient.js';
import { actionError } from './actionError.js';

const tErrors = ((key: string) => `T:${key}`) as unknown as TFunction<'errors'>;

describe('actionError', () => {
  it('translates the code of an API error', () => {
    const err = new ApiClientError(409, { code: 'CIRCULAR_DEPENDENCY', message: 'raw' });
    const message = actionError(err, tErrors, 'fallback');
    expect(message).not.toBe('fallback');
    expect(message).toContain('CIRCULAR_DEPENDENCY');
  });

  it.each([new Error('network'), 'boom', null])('uses the fallback for %p', (err) => {
    expect(actionError(err, tErrors, 'fallback')).toBe('fallback');
  });
});
