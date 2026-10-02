import { describe, it, expect } from '@jest/globals';
import * as errorModule from './AppError.js';
import {
  AppError,
  NotFoundError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  DuplicateDependencyError,
  CircularDependencyError,
  VendorInUseError,
  BudgetSourceInUseError,
  SubsidyProgramInUseError,
  BudgetLineInUseError,
  CategoryInUseError,
  AccountLockedError,
  OidcNoMatchingAccountError,
  OidcEmailUnverifiedError,
  OidcMissingEmailError,
  BackupNotFoundError,
  BackupFailedError,
  RestoreFailedError,
} from './AppError.js';

describe('AppError', () => {
  it('constructs with code, statusCode, and message', () => {
    const error = new AppError('INTERNAL_ERROR', 500, 'Something broke');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AppError);
    expect(error.name).toBe('AppError');
    expect(error.code).toBe('INTERNAL_ERROR');
    expect(error.statusCode).toBe(500);
    expect(error.message).toBe('Something broke');
    expect(error.details).toBeUndefined();
  });

  it('accepts optional details', () => {
    const details = { field: 'email', reason: 'invalid format' };
    const error = new AppError('VALIDATION_ERROR', 400, 'Bad input', details);

    expect(error.details).toEqual(details);
  });
});

describe('AppError cause', () => {
  it('passes the cause through to Error#cause', () => {
    const cause = new Error('ENOSPC: no space left on device');
    const error = new AppError('INTERNAL_ERROR', 500, 'Oops', undefined, false, cause);

    expect(error.cause).toBe(cause);
  });

  it('leaves cause unset when none is given', () => {
    const error = new AppError('INTERNAL_ERROR', 500, 'Oops');

    expect(error).not.toHaveProperty('cause');
  });

  it('keeps a falsy but defined cause', () => {
    const error = new AppError('INTERNAL_ERROR', 500, 'Oops', undefined, false, null);

    expect(error.cause).toBeNull();
  });
});

describe('BackupNotFoundError', () => {
  it('has the fixed message with no filename and no details', () => {
    const error = new BackupNotFoundError();

    expect(error.code).toBe('BACKUP_NOT_FOUND');
    expect(error.statusCode).toBe(404);
    expect(error.message).toBe('Backup not found');
    expect(error.details).toBeUndefined();
  });
});

describe.each([
  ['BackupFailedError', BackupFailedError, 'BACKUP_FAILED', 'Backup operation failed'],
  ['RestoreFailedError', RestoreFailedError, 'RESTORE_FAILED', 'Restore operation failed'],
] as const)('%s', (name, Ctor, code, defaultMessage) => {
  it('carries the original error as cause and never exposes details', () => {
    const cause = new Error('EACCES: permission denied, open /secret/path');
    const error = new Ctor('Fixed message', cause);

    expect(error.name).toBe(name);
    expect(error.code).toBe(code);
    expect(error.statusCode).toBe(500);
    expect(error.message).toBe('Fixed message');
    expect(error.cause).toBe(cause);
    expect(error.details).toBeUndefined();
    expect(error.message).not.toContain('/secret/path');
  });

  it('uses its default message and has no cause when constructed without arguments', () => {
    const error = new Ctor();

    expect(error.message).toBe(defaultMessage);
    expect(error).not.toHaveProperty('cause');
    expect(error.details).toBeUndefined();
  });
});

describe('NotFoundError', () => {
  it('has correct defaults', () => {
    const error = new NotFoundError();

    expect(error.name).toBe('NotFoundError');
    expect(error.code).toBe('NOT_FOUND');
    expect(error.statusCode).toBe(404);
    expect(error.message).toBe('Resource not found');
  });

  it('accepts custom message and details', () => {
    const error = new NotFoundError('User not found', { id: 42 });

    expect(error.message).toBe('User not found');
    expect(error.details).toEqual({ id: 42 });
  });
});

describe('ValidationError', () => {
  it('has correct defaults', () => {
    const error = new ValidationError();

    expect(error.name).toBe('ValidationError');
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.statusCode).toBe(400);
    expect(error.message).toBe('Validation failed');
  });

  it('accepts custom message and details', () => {
    const error = new ValidationError('Name is required', { field: 'name' });

    expect(error.message).toBe('Name is required');
    expect(error.details).toEqual({ field: 'name' });
  });
});

describe('UnauthorizedError', () => {
  it('has correct defaults', () => {
    const error = new UnauthorizedError();

    expect(error.name).toBe('UnauthorizedError');
    expect(error.code).toBe('UNAUTHORIZED');
    expect(error.statusCode).toBe(401);
    expect(error.message).toBe('Unauthorized');
  });
});

describe('ForbiddenError', () => {
  it('has correct defaults', () => {
    const error = new ForbiddenError();

    expect(error.name).toBe('ForbiddenError');
    expect(error.code).toBe('FORBIDDEN');
    expect(error.statusCode).toBe(403);
    expect(error.message).toBe('Forbidden');
  });
});

describe('ConflictError', () => {
  it('has correct defaults', () => {
    const error = new ConflictError();

    expect(error.name).toBe('ConflictError');
    expect(error.code).toBe('CONFLICT');
    expect(error.statusCode).toBe(409);
    expect(error.message).toBe('Resource conflict');
  });
});

describe('AppError suppressDetails flag', () => {
  it('AppError has suppressDetails set to false by default', () => {
    const error = new AppError('INTERNAL_ERROR', 500, 'Something broke');

    expect(error.suppressDetails).toBe(false);
  });

  it('AppError accepts suppressDetails=true explicitly', () => {
    const error = new AppError('INTERNAL_ERROR', 500, 'Something broke', { foo: 'bar' }, true);

    expect(error.suppressDetails).toBe(true);
  });

  it('VendorInUseError has suppressDetails set to true', () => {
    const error = new VendorInUseError('Vendor in use', { invoiceCount: 2, budgetLineCount: 1 });

    expect(error.suppressDetails).toBe(true);
    expect(error.code).toBe('VENDOR_IN_USE');
    expect(error.statusCode).toBe(409);
  });

  it('BudgetSourceInUseError has suppressDetails set to true', () => {
    const error = new BudgetSourceInUseError('Budget source in use', { budgetLineCount: 3 });

    expect(error.suppressDetails).toBe(true);
    expect(error.code).toBe('BUDGET_SOURCE_IN_USE');
    expect(error.statusCode).toBe(409);
  });

  it('SubsidyProgramInUseError has suppressDetails set to true', () => {
    const error = new SubsidyProgramInUseError('Subsidy program in use', { workItemCount: 5 });

    expect(error.suppressDetails).toBe(true);
    expect(error.code).toBe('SUBSIDY_PROGRAM_IN_USE');
    expect(error.statusCode).toBe(409);
  });

  it('BudgetLineInUseError has suppressDetails set to true', () => {
    const error = new BudgetLineInUseError('Budget line in use', { invoiceCount: 1 });

    expect(error.suppressDetails).toBe(true);
    expect(error.code).toBe('BUDGET_LINE_IN_USE');
    expect(error.statusCode).toBe(409);
  });

  it('CategoryInUseError has suppressDetails set to true', () => {
    const error = new CategoryInUseError();

    expect(error.suppressDetails).toBe(true);
    expect(error.code).toBe('CATEGORY_IN_USE');
    expect(error.statusCode).toBe(409);
  });
});

describe('AccountLockedError', () => {
  it('has statusCode 423, code ACCOUNT_LOCKED, and details.lockedUntil', () => {
    const lockedUntil = '2026-03-13T12:00:00.000Z';
    const error = new AccountLockedError(lockedUntil);

    expect(error.name).toBe('AccountLockedError');
    expect(error.code).toBe('ACCOUNT_LOCKED');
    expect(error.statusCode).toBe(423);
    expect(error.message).toBe(
      'Account is temporarily locked due to too many failed login attempts',
    );
    expect(error.details).toBeDefined();
    expect(error.details?.lockedUntil).toBe(lockedUntil);
  });

  it('AccountLockedError suppressDetails defaults to false (details are always shown)', () => {
    const error = new AccountLockedError('2026-03-13T12:00:00.000Z');

    // suppressDetails is false so the lockedUntil is surfaced to the client
    expect(error.suppressDetails).toBe(false);
  });

  it('is an instance of AppError', () => {
    const error = new AccountLockedError('2026-03-13T12:00:00.000Z');

    expect(error).toBeInstanceOf(AppError);
    expect(error).toBeInstanceOf(Error);
  });
});

describe('OidcNoMatchingAccountError', () => {
  it('has the OIDC_NO_MATCHING_ACCOUNT code, 403 status and a default message', () => {
    const error = new OidcNoMatchingAccountError();

    expect(error).toBeInstanceOf(AppError);
    expect(error.name).toBe('OidcNoMatchingAccountError');
    expect(error.code).toBe('OIDC_NO_MATCHING_ACCOUNT');
    expect(error.statusCode).toBe(403);
    expect(error.message).toBe('No existing account matches this identity provider email address');
  });

  it('accepts a custom message', () => {
    expect(new OidcNoMatchingAccountError('custom').message).toBe('custom');
  });
});

describe('OidcEmailUnverifiedError', () => {
  it('has the OIDC_EMAIL_UNVERIFIED code, 403 status and the default message', () => {
    const error = new OidcEmailUnverifiedError();

    expect(error).toBeInstanceOf(AppError);
    expect(error.name).toBe('OidcEmailUnverifiedError');
    expect(error.code).toBe('OIDC_EMAIL_UNVERIFIED');
    expect(error.statusCode).toBe(403);
    expect(error.message).toBe('Identity provider did not assert a verified email address');
  });

  it('accepts a custom message', () => {
    expect(new OidcEmailUnverifiedError('nope').message).toBe('nope');
  });
});

describe('OidcMissingEmailError', () => {
  it('has the OIDC_MISSING_EMAIL code, 403 status and the default message', () => {
    const error = new OidcMissingEmailError();

    expect(error).toBeInstanceOf(AppError);
    expect(error.name).toBe('OidcMissingEmailError');
    expect(error.code).toBe('OIDC_MISSING_EMAIL');
    expect(error.statusCode).toBe(403);
    expect(error.message).toBe('Identity provider did not supply an email address');
  });

  it('accepts a custom message', () => {
    expect(new OidcMissingEmailError('x').message).toBe('x');
  });
});

describe('DuplicateDependencyError', () => {
  it('has correct defaults', () => {
    const error = new DuplicateDependencyError();

    expect(error).toBeInstanceOf(AppError);
    expect(error.name).toBe('DuplicateDependencyError');
    expect(error.code).toBe('DUPLICATE_DEPENDENCY');
    expect(error.statusCode).toBe(409);
    expect(error.message).toBe('Dependency already exists');
    expect(error.details).toBeUndefined();
  });

  it('accepts a custom message and passes details through', () => {
    const error = new DuplicateDependencyError('Already linked', { id: 'x' });

    expect(error.message).toBe('Already linked');
    expect(error.details).toEqual({ id: 'x' });
  });
});

describe('CircularDependencyError', () => {
  it('uses the top-level CIRCULAR_DEPENDENCY code with 409', () => {
    const error = new CircularDependencyError('loop', { cycle: ['a', 'b'] });

    expect(error.code).toBe('CIRCULAR_DEPENDENCY');
    expect(error.statusCode).toBe(409);
    expect(error.details).toEqual({ cycle: ['a', 'b'] });
  });
});

describe('every AppError subclass', () => {
  type ErrorCtor = new (...args: unknown[]) => AppError;
  const subclasses = Object.entries(errorModule).filter(
    ([name, value]) => name !== 'AppError' && typeof value === 'function',
  ) as [string, ErrorCtor][];

  it('is discovered (guards against the table silently becoming empty)', () => {
    expect(subclasses).toHaveLength(44);
  });

  it.each(subclasses)(
    '%s extends AppError with a matching name and a valid HTTP status',
    (name, Ctor) => {
      const error = new Ctor('2026-01-01T00:00:00.000Z');

      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe(name);
      expect(error.code).toMatch(/^[A-Z][A-Z_]+$/);
      expect(error.statusCode).toBeGreaterThanOrEqual(400);
      expect(error.statusCode).toBeLessThan(600);
      expect(error.message.length).toBeGreaterThan(0);
    },
  );

  it('removed legacy classes are no longer exported', () => {
    expect(Object.keys(errorModule)).not.toContain('BackupNotConfiguredError');
    expect(Object.keys(errorModule)).not.toContain('MutuallyExclusiveBudgetLinkError');
  });
});
