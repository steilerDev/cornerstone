import type { ErrorCode } from '@cornerstone/shared';

/**
 * Base application error with a typed error code and HTTP status.
 * All known application errors should extend this class.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly details?: Record<string, unknown>;
  readonly suppressDetails: boolean;

  constructor(
    code: ErrorCode,
    statusCode: number,
    message: string,
    details?: Record<string, unknown>,
    suppressDetails = false,
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.suppressDetails = suppressDetails;
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
    super('CATEGORY_IN_USE', 409, message, details, true);
    this.name = 'CategoryInUseError';
  }
}

export class VendorInUseError extends AppError {
  constructor(
    message = 'Vendor is in use and cannot be deleted',
    details?: { invoiceCount: number; budgetLineCount: number },
  ) {
    super('VENDOR_IN_USE', 409, message, details, true);
    this.name = 'VendorInUseError';
  }
}

export class BudgetSourceInUseError extends AppError {
  constructor(
    message = 'Budget source is in use and cannot be deleted',
    details?: { budgetLineCount: number },
  ) {
    super('BUDGET_SOURCE_IN_USE', 409, message, details, true);
    this.name = 'BudgetSourceInUseError';
  }
}

export class SubsidyProgramInUseError extends AppError {
  constructor(
    message = 'Subsidy program is in use and cannot be deleted',
    details?: { workItemCount: number },
  ) {
    super('SUBSIDY_PROGRAM_IN_USE', 409, message, details, true);
    this.name = 'SubsidyProgramInUseError';
  }
}

export class BudgetLineInUseError extends AppError {
  constructor(
    message = 'Budget line has linked invoices and cannot be deleted',
    details?: { invoiceCount: number },
  ) {
    super('BUDGET_LINE_IN_USE', 409, message, details, true);
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

export class MutuallyExclusiveBudgetLinkError extends AppError {
  constructor(
    message = 'An invoice can only be linked to one budget line (work item or household item, not both)',
    details?: Record<string, unknown>,
  ) {
    super('MUTUALLY_EXCLUSIVE_BUDGET_LINK', 400, message, details);
    this.name = 'MutuallyExclusiveBudgetLinkError';
  }
}

export class BudgetLineAlreadyLinkedError extends AppError {
  constructor(
    message = 'Budget line is already linked to a different invoice',
    details?: Record<string, unknown>,
  ) {
    super('BUDGET_LINE_ALREADY_LINKED', 409, message, details);
    this.name = 'BudgetLineAlreadyLinkedError';
  }
}

export class ItemizedSumExceedsInvoiceError extends AppError {
  constructor(
    message = 'Sum of itemized amounts would exceed the invoice total',
    details?: Record<string, unknown>,
  ) {
    super('ITEMIZED_SUM_EXCEEDS_INVOICE', 400, message, details);
    this.name = 'ItemizedSumExceedsInvoiceError';
  }
}

export class SubsidyOversubscribedError extends AppError {
  constructor(
    message = 'Subsidy program is oversubscribed',
    details?: { currentAllocation: number; maximumAmount: number; excess: number },
  ) {
    super('SUBSIDY_OVERSUBSCRIBED', 409, message, details);
    this.name = 'SubsidyOversubscribedError';
  }
}

export class DiscretionarySourceError extends AppError {
  constructor(
    message = 'The Discretionary Funding source cannot be deleted',
    details?: Record<string, unknown>,
  ) {
    super('DISCRETIONARY_SOURCE', 409, message, details);
    this.name = 'DiscretionarySourceError';
  }
}

export class AccountLockedError extends AppError {
  constructor(lockedUntil: string) {
    super(
      'ACCOUNT_LOCKED',
      423,
      'Account is temporarily locked due to too many failed login attempts',
      { lockedUntil },
    );
    this.name = 'AccountLockedError';
  }
}

export class InvalidMetadataError extends AppError {
  constructor(message = 'Metadata does not match schema for the entry type') {
    super('INVALID_METADATA', 400, message);
    this.name = 'InvalidMetadataError';
  }
}

export class ImmutableEntryError extends AppError {
  constructor(message = 'Automatic diary entries cannot be modified') {
    super('IMMUTABLE_ENTRY', 403, message);
    this.name = 'ImmutableEntryError';
  }
}

export class InvalidEntryTypeError extends AppError {
  constructor(message = 'Entry type must be a manual type for user-created entries') {
    super('INVALID_ENTRY_TYPE', 400, message);
    this.name = 'InvalidEntryTypeError';
  }
}

export class ExportEmptyError extends AppError {
  constructor(message = 'No diary entries match the specified filters') {
    super('EXPORT_EMPTY', 400, message);
    this.name = 'ExportEmptyError';
  }
}
