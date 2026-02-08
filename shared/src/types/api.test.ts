import type { ApiError, ApiErrorResponse } from './api.js';

describe('API types', () => {
  it('should satisfy the ApiErrorResponse shape', () => {
    const response: ApiErrorResponse = {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Test error message',
      },
    };

    expect(response.error.code).toBe('INTERNAL_ERROR');
    expect(response.error.message).toBe('Test error message');
  });

  it('should allow optional details', () => {
    const error: ApiError = {
      code: 'VALIDATION_ERROR',
      message: 'Invalid input',
      details: { field: 'name', reason: 'required' },
    };

    expect(error.details).toEqual({ field: 'name', reason: 'required' });
  });
});
