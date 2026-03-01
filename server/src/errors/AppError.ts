import type { ErrorCode } from '@cornerstone/shared';

/**
 * Base application error with a typed error code and HTTP status.
 * All known application errors should extend this class.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly details?: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    statusCode: number,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', details?: Record<string, unknown>) {
    super('NOT_FOUND', 404, message, details);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details?: Record<string, unknown>) {
    super('VALIDATION_ERROR', 400, message, details);
    this.name = 'ValidationError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized', details?: Record<string, unknown>) {
    super('UNAUTHORIZED', 401, message, details);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', details?: Record<string, unknown>) {
    super('FORBIDDEN', 403, message, details);
    this.name = 'ForbiddenError';
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource conflict', details?: Record<string, unknown>) {
    super('CONFLICT', 409, message, details);
    this.name = 'ConflictError';
  }
}

export class CategoryInUseError extends AppError {
  constructor(
    message = 'Budget category is in use and cannot be deleted',
    details?: Record<string, unknown>,
  ) {
    super('CATEGORY_IN_USE', 409, message, details);
    this.name = 'CategoryInUseError';
  }
}

export class VendorInUseError extends AppError {
  constructor(
    message = 'Vendor is in use and cannot be deleted',
    details?: { invoiceCount: number; budgetLineCount: number },
  ) {
    super('VENDOR_IN_USE', 409, message, details);
    this.name = 'VendorInUseError';
  }
}

export class BudgetSourceInUseError extends AppError {
  constructor(
    message = 'Budget source is in use and cannot be deleted',
    details?: { budgetLineCount: number },
  ) {
    super('BUDGET_SOURCE_IN_USE', 409, message, details);
    this.name = 'BudgetSourceInUseError';
  }
}

export class SubsidyProgramInUseError extends AppError {
  constructor(
    message = 'Subsidy program is in use and cannot be deleted',
    details?: { workItemCount: number },
  ) {
    super('SUBSIDY_PROGRAM_IN_USE', 409, message, details);
    this.name = 'SubsidyProgramInUseError';
  }
}

export class BudgetLineInUseError extends AppError {
  constructor(
    message = 'Budget line has linked invoices and cannot be deleted',
    details?: { invoiceCount: number },
  ) {
    super('BUDGET_LINE_IN_USE', 409, message, details);
    this.name = 'BudgetLineInUseError';
  }
}

export class CircularDependencyError extends AppError {
  constructor(
    message = 'Circular dependency detected in the dependency graph',
    details?: { cycle: string[] },
  ) {
    super('CIRCULAR_DEPENDENCY', 409, message, details);
    this.name = 'CircularDependencyError';
  }
}
