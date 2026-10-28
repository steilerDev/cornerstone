import { describe, it, expect } from '@jest/globals';
import type { TFunction } from 'i18next';
import { ApiClientError } from '../../lib/apiClient.js';
import { taskActionError } from './taskActionError.js';

const tErrors = ((key: string) => `T:${key}`) as unknown as TFunction<'errors'>;

describe('taskActionError', () => {
  it('translates the code of an API error', () => {
    const err = new ApiClientError(409, { code: 'CIRCULAR_DEPENDENCY', message: 'raw' });
    const message = taskActionError(err, tErrors, 'fallback');
    expect(message).not.toBe('fallback');
    expect(message).toContain('CIRCULAR_DEPENDENCY');
  });

  it.each([new Error('network'), 'boom', null])('uses the fallback for %p', (err) => {
    expect(taskActionError(err, tErrors, 'fallback')).toBe('fallback');
  });
});
