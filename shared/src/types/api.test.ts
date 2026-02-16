import type { ApiError, ApiErrorResponse } from './api.js';
import type { ErrorCode } from './errors.js';

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

describe('ErrorCode type', () => {
  describe('auth error codes', () => {
    it('should include SETUP_COMPLETE error code', () => {
      const code: ErrorCode = 'SETUP_COMPLETE';
      expect(code).toBe('SETUP_COMPLETE');
    });

    it('should include INVALID_CREDENTIALS error code', () => {
      const code: ErrorCode = 'INVALID_CREDENTIALS';
      expect(code).toBe('INVALID_CREDENTIALS');
    });

    it('should include ACCOUNT_DEACTIVATED error code', () => {
      const code: ErrorCode = 'ACCOUNT_DEACTIVATED';
      expect(code).toBe('ACCOUNT_DEACTIVATED');
    });

    it('should include SELF_DEACTIVATION error code', () => {
      const code: ErrorCode = 'SELF_DEACTIVATION';
      expect(code).toBe('SELF_DEACTIVATION');
    });

    it('should include LAST_ADMIN error code', () => {
      const code: ErrorCode = 'LAST_ADMIN';
      expect(code).toBe('LAST_ADMIN');
    });

    it('should include OIDC_NOT_CONFIGURED error code', () => {
      const code: ErrorCode = 'OIDC_NOT_CONFIGURED';
      expect(code).toBe('OIDC_NOT_CONFIGURED');
    });

    it('should include OIDC_ERROR error code', () => {
      const code: ErrorCode = 'OIDC_ERROR';
      expect(code).toBe('OIDC_ERROR');
    });

    it('should include EMAIL_CONFLICT error code', () => {
      const code: ErrorCode = 'EMAIL_CONFLICT';
      expect(code).toBe('EMAIL_CONFLICT');
    });

    it('should accept all auth error codes in an array', () => {
      const authCodes: ErrorCode[] = [
        'SETUP_COMPLETE',
        'INVALID_CREDENTIALS',
        'ACCOUNT_DEACTIVATED',
        'SELF_DEACTIVATION',
        'LAST_ADMIN',
        'OIDC_NOT_CONFIGURED',
        'OIDC_ERROR',
        'EMAIL_CONFLICT',
      ];

      expect(authCodes).toHaveLength(8);
      expect(authCodes).toContain('SETUP_COMPLETE');
      expect(authCodes).toContain('INVALID_CREDENTIALS');
      expect(authCodes).toContain('ACCOUNT_DEACTIVATED');
      expect(authCodes).toContain('SELF_DEACTIVATION');
      expect(authCodes).toContain('LAST_ADMIN');
      expect(authCodes).toContain('OIDC_NOT_CONFIGURED');
      expect(authCodes).toContain('OIDC_ERROR');
      expect(authCodes).toContain('EMAIL_CONFLICT');
    });
  });

  describe('existing error codes', () => {
    it('should include common HTTP error codes', () => {
      const codes: ErrorCode[] = [
        'NOT_FOUND',
        'ROUTE_NOT_FOUND',
        'VALIDATION_ERROR',
        'UNAUTHORIZED',
        'FORBIDDEN',
        'CONFLICT',
        'INTERNAL_ERROR',
      ];

      expect(codes).toHaveLength(7);
      expect(codes).toContain('NOT_FOUND');
      expect(codes).toContain('VALIDATION_ERROR');
      expect(codes).toContain('INTERNAL_ERROR');
    });
  });
});
