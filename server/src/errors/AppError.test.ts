import { describe, it, expect } from '@jest/globals';
import {
  AppError,
  NotFoundError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  VendorInUseError,
  BudgetSourceInUseError,
  SubsidyProgramInUseError,
  BudgetLineInUseError,
  CategoryInUseError,
  AccountLockedError,
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
