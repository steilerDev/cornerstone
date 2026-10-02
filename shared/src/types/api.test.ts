import type { ApiError, ApiErrorResponse } from './api.js';
import { ERROR_CODES } from './errors.js';
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

    it('should include OIDC_NO_MATCHING_ACCOUNT error code', () => {
      const code: ErrorCode = 'OIDC_NO_MATCHING_ACCOUNT';
      expect(code).toBe('OIDC_NO_MATCHING_ACCOUNT');
    });

    it('should include OIDC_EMAIL_UNVERIFIED error code', () => {
      const code: ErrorCode = 'OIDC_EMAIL_UNVERIFIED';
      expect(code).toBe('OIDC_EMAIL_UNVERIFIED');
    });

    it('should include OIDC_MISSING_EMAIL error code', () => {
      const code: ErrorCode = 'OIDC_MISSING_EMAIL';
      expect(code).toBe('OIDC_MISSING_EMAIL');
    });

    it('should accept all auth error codes in an array', () => {
      const authCodes: ErrorCode[] = [
        'SETUP_COMPLETE',
        'INVALID_CREDENTIALS',
        'ACCOUNT_DEACTIVATED',
        'SELF_DEACTIVATION',
        'LAST_ADMIN',
        'OIDC_NOT_CONFIGURED',
        'OIDC_NO_MATCHING_ACCOUNT',
        'OIDC_EMAIL_UNVERIFIED',
        'OIDC_MISSING_EMAIL',
      ];

      expect(authCodes).toHaveLength(9);
      expect(authCodes).toContain('SETUP_COMPLETE');
      expect(authCodes).toContain('INVALID_CREDENTIALS');
      expect(authCodes).toContain('ACCOUNT_DEACTIVATED');
      expect(authCodes).toContain('SELF_DEACTIVATION');
      expect(authCodes).toContain('LAST_ADMIN');
      expect(authCodes).toContain('OIDC_NOT_CONFIGURED');
      expect(authCodes).toContain('OIDC_NO_MATCHING_ACCOUNT');
      expect(authCodes).toContain('OIDC_EMAIL_UNVERIFIED');
      expect(authCodes).toContain('OIDC_MISSING_EMAIL');
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

  describe('ERROR_CODES runtime tuple', () => {
    it('contains no duplicates', () => {
      expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
    });

    it.each(['OIDC_ERROR', 'MUTUALLY_EXCLUSIVE_BUDGET_LINK', 'BACKUP_NOT_CONFIGURED'])(
      'no longer includes the removed code %s',
      (removed) => {
        expect(ERROR_CODES as readonly string[]).not.toContain(removed);
      },
    );

    it('includes the dependency conflict codes', () => {
      expect(ERROR_CODES).toContain('DUPLICATE_DEPENDENCY');
      expect(ERROR_CODES).toContain('CIRCULAR_DEPENDENCY');
    });
  });
});
