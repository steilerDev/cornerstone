import { describe, it, expect } from '@jest/globals';
import {
  AppError,
  NotFoundError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
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
