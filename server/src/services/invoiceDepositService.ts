import { randomUUID } from 'node:crypto';
import { eq, and, sql, asc } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import { invoiceDeposits, invoices, users } from '../db/schema.js';
import type {
  InvoiceDeposit,
  InvoiceDepositStatus,
  CreateDepositRequest,
  UpdateDepositRequest,
  UserSummary,
} from '@cornerstone/shared';
import {
  NotFoundError,
  ValidationError,
  DepositsExceedInvoiceTotalError,
  InvalidDepositStatusTransitionError,
  InvalidDepositDateForStatusError,
} from '../errors/AppError.js';
import { onDepositStatusChanged } from './diaryAutoEventService.js';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

/**
 * ISO 8601 date pattern: YYYY-MM-DD
 */
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validate an ISO date string (YYYY-MM-DD).
 * Returns true if the value is a valid ISO date string.
 */
function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  const d = new Date(value);
  return !isNaN(d.getTime());
}

/**
 * Get today's date in ISO YYYY-MM-DD format (server's local timezone).
 */
function today(): string {
  return new Date().toLocaleDateString('en-CA');
}

/**
 * Convert a database user row to UserSummary shape.
 */
function toUserSummary(user: typeof users.$inferSelect | null | undefined): UserSummary | null {
  if (!user) return null;
  return {
    id: user.id,
    displayName: user.displayName,
    email: user.email,
  };
}

/**
 * Allowed status transitions for deposits.
 */
const ALLOWED_TRANSITIONS: Record<InvoiceDepositStatus, InvoiceDepositStatus[]> = {
  pending: ['paid'],
  paid: ['claimed', 'pending'],
  claimed: ['paid'],
};

/**
 * Convert a database invoice deposit row to InvoiceDeposit API shape.
 */
function toInvoiceDeposit(db: DbType, row: typeof invoiceDeposits.$inferSelect): InvoiceDeposit {
  const createdByUser: typeof users.$inferSelect | null | undefined = row.createdBy
    ? db.select().from(users).where(eq(users.id, row.createdBy)).get()
    : null;

  return {
    id: row.id,
    invoiceId: row.invoiceId,
    amount: row.amount,
    dueDate: row.dueDate,
    paidDate: row.paidDate,
    claimedDate: row.claimedDate,
    description: row.description,
    status: row.status as InvoiceDepositStatus,
    createdBy: toUserSummary(createdByUser),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Assert that an invoice exists, throwing NotFoundError if not.
 * Returns the invoice row.
 */
function assertInvoiceExists(db: DbType, invoiceId: string): typeof invoices.$inferSelect {
  const invoice = db.select().from(invoices).where(eq(invoices.id, invoiceId)).get();
  if (!invoice) {
    throw new NotFoundError('Invoice not found');
  }
  return invoice;
}

/**
 * Assert that a deposit belongs to the given invoice, throwing NotFoundError if not.
 * Returns the deposit row.
 */
function assertDepositBelongsToInvoice(
  db: DbType,
  invoiceId: string,
  depositId: string,
): typeof invoiceDeposits.$inferSelect {
  const deposit = db
    .select()
    .from(invoiceDeposits)
    .where(and(eq(invoiceDeposits.id, depositId), eq(invoiceDeposits.invoiceId, invoiceId)))
    .get();
  if (!deposit) {
    throw new NotFoundError('Deposit not found');
  }
  return deposit;
}

/**
 * List all deposits for a given invoice.
 */
export function listDepositsForInvoice(db: DbType, invoiceId: string): InvoiceDeposit[] {
  // Verify invoice exists
  assertInvoiceExists(db, invoiceId);

  const rows = db
    .select()
    .from(invoiceDeposits)
    .where(eq(invoiceDeposits.invoiceId, invoiceId))
    .orderBy(asc(invoiceDeposits.dueDate), asc(invoiceDeposits.createdAt))
    .all();

  return rows.map((row) => toInvoiceDeposit(db, row));
}

/**
 * Create a new invoice deposit.
 * Validates: invoice exists, amount > 0, dueDate is valid ISO date,
 * status transition is allowed, dates match status, sum doesn't exceed invoice total.
 * @throws NotFoundError if invoice not found
 * @throws ValidationError if any field is invalid
 * @throws InvalidDepositStatusTransitionError if status transition is disallowed
 * @throws InvalidDepositDateForStatusError if dates don't match status
 * @throws DepositsExceedInvoiceTotalError if sum would exceed invoice total
 */
export function createDeposit(
  db: DbType,
  invoiceId: string,
  data: CreateDepositRequest,
  userId: string,
  diaryAutoEvents: boolean = true,
): InvoiceDeposit {
  const invoice = assertInvoiceExists(db, invoiceId);

  // Validate amount > 0
  if (data.amount <= 0) {
    throw new ValidationError('Amount must be greater than 0');
  }

  // Validate dueDate
  if (!isValidIsoDate(data.dueDate)) {
    throw new ValidationError('dueDate must be a valid ISO date (YYYY-MM-DD)');
  }

  // Validate description length
  if (data.description && data.description.length > 500) {
    throw new ValidationError('Description must be 500 characters or less');
  }

  // Determine target status (default 'pending')
  const targetStatus: InvoiceDepositStatus = data.status ?? 'pending';

  // Validate transition from implicit 'pending' start (for creation at non-pending status)
  if (targetStatus !== 'pending') {
    const allowedFromPending = ALLOWED_TRANSITIONS['pending']!;
    if (!allowedFromPending.includes(targetStatus)) {
      throw new InvalidDepositStatusTransitionError(
        `Cannot create deposit with status '${targetStatus}' (initial status must be 'pending' or follow transition rules)`,
        {
          from: 'pending',
          to: targetStatus,
          allowedTargets: allowedFromPending,
        },
      );
    }
  }

  // Compute initial paidDate and claimedDate based on target status
  let paidDate: string | null = null;
  let claimedDate: string | null = null;

  if (targetStatus === 'paid') {
    paidDate = data.paidDate ?? today();
  }
  if (targetStatus === 'claimed') {
    paidDate = data.paidDate ?? today();
    claimedDate = data.claimedDate ?? today();
  }

  // Validate paidDate/claimedDate match the computed status
  if (data.paidDate !== undefined) {
    if (targetStatus !== 'paid' && targetStatus !== 'claimed') {
      throw new InvalidDepositDateForStatusError(
        'paidDate cannot be set when status is not paid or claimed',
        { field: 'paidDate', status: targetStatus },
      );
    }
    if (data.paidDate && !isValidIsoDate(data.paidDate)) {
      throw new ValidationError('paidDate must be a valid ISO date (YYYY-MM-DD)');
    }
  }

  if (data.claimedDate !== undefined) {
    if (targetStatus !== 'claimed') {
      throw new InvalidDepositDateForStatusError(
        'claimedDate cannot be set when status is not claimed',
        { field: 'claimedDate', status: targetStatus },
      );
    }
    if (data.claimedDate && !isValidIsoDate(data.claimedDate)) {
      throw new ValidationError('claimedDate must be a valid ISO date (YYYY-MM-DD)');
    }
  }

  const id = randomUUID();
  const now = new Date().toISOString();

  // Perform atomic read-check-write in transaction
  const row = db.transaction((tx) => {
    // Check sum invariant: existing deposits + new amount <= invoice total
    const existingSum = tx
      .select({ sum: sql<number>`COALESCE(SUM(${invoiceDeposits.amount}), 0)` })
      .from(invoiceDeposits)
      .where(eq(invoiceDeposits.invoiceId, invoiceId))
      .get();

    const currentSum = existingSum?.sum ?? 0;
    const proposedTotal = currentSum + data.amount;

    if (proposedTotal > invoice.amount) {
      const availableHeadroom = Math.max(0, invoice.amount - currentSum);
      throw new DepositsExceedInvoiceTotalError(
        'Sum of deposit amounts would exceed the invoice total',
        {
          invoiceTotal: invoice.amount,
          currentDepositSum: currentSum,
          requestedAmount: data.amount,
          availableHeadroom,
        },
      );
    }

    // Insert the deposit
    tx.insert(invoiceDeposits)
      .values({
        id,
        invoiceId,
        amount: data.amount,
        dueDate: data.dueDate,
        paidDate,
        claimedDate,
        description: data.description ?? null,
        status: targetStatus,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    return tx.select().from(invoiceDeposits).where(eq(invoiceDeposits.id, id)).get()!;
  });

  // Fire diary event if status changed to paid or claimed
  if (targetStatus === 'paid' || targetStatus === 'claimed') {
    const invoiceNumber = invoice.invoiceNumber || 'N/A';
    onDepositStatusChanged(db, diaryAutoEvents, id, invoiceNumber, 'pending', targetStatus);
  }

  return toInvoiceDeposit(db, row);
}

/**
 * Update an invoice deposit.
 * Validates transitions, date constraints, and sum invariant.
 * Applies date side-effects per AC-14.
 * @throws NotFoundError if invoice or deposit not found
 * @throws ValidationError if any field is invalid
 * @throws InvalidDepositStatusTransitionError if transition is disallowed
 * @throws InvalidDepositDateForStatusError if dates don't match status
 * @throws DepositsExceedInvoiceTotalError if sum would exceed invoice total
 */
export function updateDeposit(
  db: DbType,
  invoiceId: string,
  depositId: string,
  data: UpdateDepositRequest,
  diaryAutoEvents: boolean = true,
): InvoiceDeposit {
  const invoice = assertInvoiceExists(db, invoiceId);
  const existing = assertDepositBelongsToInvoice(db, invoiceId, depositId);

  // Build update object, tracking what changed
  const updates: Partial<typeof invoiceDeposits.$inferInsert> = {};
  let effectiveNewStatus: InvoiceDepositStatus = existing.status as InvoiceDepositStatus;
  let effectiveNewPaidDate: string | null = existing.paidDate;
  let effectiveNewClaimedDate: string | null = existing.claimedDate;
  const invoiceNumber = invoice.invoiceNumber || 'N/A';

  // Update amount if provided
  if (data.amount !== undefined) {
    if (data.amount <= 0) {
      throw new ValidationError('Amount must be greater than 0');
    }

    // Will check sum invariant (self-exclude) in transaction below
    updates.amount = data.amount;
  }

  // Update dueDate if provided
  if (data.dueDate !== undefined) {
    if (!isValidIsoDate(data.dueDate)) {
      throw new ValidationError('dueDate must be a valid ISO date (YYYY-MM-DD)');
    }
    updates.dueDate = data.dueDate;
  }

  // Update description if provided
  if (data.description !== undefined) {
    if (data.description && data.description.length > 500) {
      throw new ValidationError('Description must be 500 characters or less');
    }
    updates.description = data.description ?? null;
  }

  // Handle status transition if provided
  if (data.status !== undefined) {
    const newStatus = data.status;
    const oldStatus = existing.status as InvoiceDepositStatus;

    if (newStatus !== oldStatus) {
      // Validate transition
      const allowedTargets = ALLOWED_TRANSITIONS[oldStatus]!;
      if (!allowedTargets.includes(newStatus)) {
        throw new InvalidDepositStatusTransitionError(
          `Cannot transition from '${oldStatus}' to '${newStatus}'`,
          { from: oldStatus, to: newStatus, allowedTargets },
        );
      }

      effectiveNewStatus = newStatus;

      // Apply date side-effects per AC-14
      if (oldStatus === 'pending' && newStatus === 'paid') {
        // pending → paid: auto-set paid_date = today unless paidDate supplied
        effectiveNewPaidDate = data.paidDate ?? today();
        effectiveNewClaimedDate = null;
      } else if (oldStatus === 'paid' && newStatus === 'claimed') {
        // paid → claimed: auto-set claimed_date = today unless claimedDate supplied
        effectiveNewClaimedDate = data.claimedDate ?? today();
        // preserve paid_date
      } else if (oldStatus === 'paid' && newStatus === 'pending') {
        // paid → pending: clear both dates
        effectiveNewPaidDate = null;
        effectiveNewClaimedDate = null;
      } else if (oldStatus === 'claimed' && newStatus === 'paid') {
        // claimed → paid: clear claimed_date, preserve paid_date
        effectiveNewClaimedDate = null;
      }

      updates.status = newStatus;
    }
  }

  // Handle paidDate override without status change
  if (data.paidDate !== undefined && data.status === undefined) {
    if (
      effectiveNewStatus !== 'paid' &&
      effectiveNewStatus !== 'claimed'
    ) {
      throw new InvalidDepositDateForStatusError(
        'paidDate cannot be set when status is not paid or claimed',
        { field: 'paidDate', status: effectiveNewStatus },
      );
    }
    if (data.paidDate && !isValidIsoDate(data.paidDate)) {
      throw new ValidationError('paidDate must be a valid ISO date (YYYY-MM-DD)');
    }
    effectiveNewPaidDate = data.paidDate ?? null;
  }

  // Handle claimedDate override without status change
  if (data.claimedDate !== undefined && data.status === undefined) {
    if (effectiveNewStatus !== 'claimed') {
      throw new InvalidDepositDateForStatusError(
        'claimedDate cannot be set when status is not claimed',
        { field: 'claimedDate', status: effectiveNewStatus },
      );
    }
    if (data.claimedDate && !isValidIsoDate(data.claimedDate)) {
      throw new ValidationError('claimedDate must be a valid ISO date (YYYY-MM-DD)');
    }
    effectiveNewClaimedDate = data.claimedDate ?? null;
  }

  // Apply computed dates to updates
  updates.paidDate = effectiveNewPaidDate;
  updates.claimedDate = effectiveNewClaimedDate;
  updates.status = effectiveNewStatus;

  // Update timestamp
  updates.updatedAt = new Date().toISOString();

  // Perform atomic read-check-write in transaction
  const row = db.transaction((tx) => {
    // Check sum invariant if amount is being updated (self-exclude)
    if (data.amount !== undefined) {
      const otherSum = tx
        .select({ sum: sql<number>`COALESCE(SUM(${invoiceDeposits.amount}), 0)` })
        .from(invoiceDeposits)
        .where(and(eq(invoiceDeposits.invoiceId, invoiceId), sql`${invoiceDeposits.id} != ${depositId}`))
        .get();

      const otherTotal = otherSum?.sum ?? 0;
      const proposedTotal = otherTotal + data.amount!;

      if (proposedTotal > invoice.amount) {
        const availableHeadroom = Math.max(0, invoice.amount - otherTotal);
        throw new DepositsExceedInvoiceTotalError(
          'Sum of deposit amounts would exceed the invoice total',
          {
            invoiceTotal: invoice.amount,
            currentDepositSum: otherTotal,
            requestedAmount: data.amount!,
            availableHeadroom,
          },
        );
      }
    }

    // Update the deposit
    tx.update(invoiceDeposits)
      .set(updates)
      .where(eq(invoiceDeposits.id, depositId))
      .run();

    return tx.select().from(invoiceDeposits).where(eq(invoiceDeposits.id, depositId)).get()!;
  });

  // Fire diary event if status transitioned to paid or claimed (only these targets per AC-17)
  if (data.status !== undefined && (effectiveNewStatus === 'paid' || effectiveNewStatus === 'claimed')) {
    const oldStatus = existing.status as InvoiceDepositStatus;
    onDepositStatusChanged(db, diaryAutoEvents, depositId, invoiceNumber, oldStatus, effectiveNewStatus);
  }

  return toInvoiceDeposit(db, row);
}

/**
 * Delete an invoice deposit.
 * @throws NotFoundError if invoice or deposit not found
 */
export function deleteDeposit(db: DbType, invoiceId: string, depositId: string): void {
  // Verify ownership
  assertDepositBelongsToInvoice(db, invoiceId, depositId);

  db.delete(invoiceDeposits).where(eq(invoiceDeposits.id, depositId)).run();
}
