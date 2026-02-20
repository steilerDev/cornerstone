import { randomUUID } from 'node:crypto';
import { eq, desc, and } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import { invoices, vendors, users } from '../db/schema.js';
import type {
  Invoice,
  InvoiceStatus,
  CreateInvoiceRequest,
  UpdateInvoiceRequest,
  UserSummary,
} from '@cornerstone/shared';
import { NotFoundError, ValidationError } from '../errors/AppError.js';

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
 * Convert a database invoice row to Invoice API shape.
 * Resolves createdBy to a UserSummary via a separate query.
 */
function toInvoice(db: DbType, row: typeof invoices.$inferSelect): Invoice {
  const createdByUser = row.createdBy
    ? db.select().from(users).where(eq(users.id, row.createdBy)).get()
    : null;

  return {
    id: row.id,
    vendorId: row.vendorId,
    invoiceNumber: row.invoiceNumber,
    amount: row.amount,
    date: row.date,
    dueDate: row.dueDate,
    status: row.status as InvoiceStatus,
    notes: row.notes,
    createdBy: toUserSummary(createdByUser),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Assert that a vendor exists, throwing NotFoundError if not.
 */
function assertVendorExists(db: DbType, vendorId: string): void {
  const vendor = db.select().from(vendors).where(eq(vendors.id, vendorId)).get();
  if (!vendor) {
    throw new NotFoundError('Vendor not found');
  }
}

/**
 * List all invoices for a vendor, sorted by date descending.
 * @throws NotFoundError if vendor does not exist
 */
export function listInvoices(db: DbType, vendorId: string): Invoice[] {
  assertVendorExists(db, vendorId);

  const rows = db
    .select()
    .from(invoices)
    .where(eq(invoices.vendorId, vendorId))
    .orderBy(desc(invoices.date))
    .all();

  return rows.map((row) => toInvoice(db, row));
}

/**
 * Create a new invoice for a vendor.
 * Validates: amount > 0, date is required ISO date, dueDate >= date if both present.
 * @throws NotFoundError if vendor does not exist
 * @throws ValidationError if any field is invalid
 */
export function createInvoice(
  db: DbType,
  vendorId: string,
  data: CreateInvoiceRequest,
  userId: string,
): Invoice {
  assertVendorExists(db, vendorId);

  // Validate amount
  if (data.amount <= 0) {
    throw new ValidationError('Amount must be greater than 0');
  }

  // Validate date
  if (!isValidIsoDate(data.date)) {
    throw new ValidationError('Date must be a valid ISO date (YYYY-MM-DD)');
  }

  // Validate dueDate if provided
  if (data.dueDate !== undefined && data.dueDate !== null) {
    if (!isValidIsoDate(data.dueDate)) {
      throw new ValidationError('Due date must be a valid ISO date (YYYY-MM-DD)');
    }
    if (data.dueDate < data.date) {
      throw new ValidationError('Due date must be on or after the invoice date');
    }
  }

  const id = randomUUID();
  const now = new Date().toISOString();

  db.insert(invoices)
    .values({
      id,
      vendorId,
      invoiceNumber: data.invoiceNumber ?? null,
      amount: data.amount,
      date: data.date,
      dueDate: data.dueDate ?? null,
      status: data.status ?? 'pending',
      notes: data.notes ?? null,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  const row = db.select().from(invoices).where(eq(invoices.id, id)).get()!;
  return toInvoice(db, row);
}

/**
 * Partial update of an invoice.
 * Validates same rules as createInvoice for any provided fields.
 * @throws NotFoundError if vendor or invoice not found, or if invoice doesn't belong to vendor
 * @throws ValidationError if any provided field is invalid
 */
export function updateInvoice(
  db: DbType,
  vendorId: string,
  invoiceId: string,
  data: UpdateInvoiceRequest,
): Invoice {
  assertVendorExists(db, vendorId);

  const existing = db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.vendorId, vendorId)))
    .get();

  if (!existing) {
    throw new NotFoundError('Invoice not found');
  }

  const updates: Partial<typeof invoices.$inferInsert> = {};

  // Validate and apply amount if provided
  if (data.amount !== undefined) {
    if (data.amount <= 0) {
      throw new ValidationError('Amount must be greater than 0');
    }
    updates.amount = data.amount;
  }

  // Validate and apply date if provided
  if (data.date !== undefined) {
    if (!isValidIsoDate(data.date)) {
      throw new ValidationError('Date must be a valid ISO date (YYYY-MM-DD)');
    }
    updates.date = data.date;
  }

  // Validate dueDate relationship: compare against the resulting date (updated or existing)
  if (data.dueDate !== undefined) {
    if (data.dueDate !== null) {
      if (!isValidIsoDate(data.dueDate)) {
        throw new ValidationError('Due date must be a valid ISO date (YYYY-MM-DD)');
      }
      const effectiveDate = updates.date ?? existing.date;
      if (data.dueDate < effectiveDate) {
        throw new ValidationError('Due date must be on or after the invoice date');
      }
    }
    updates.dueDate = data.dueDate;
  }

  if (data.invoiceNumber !== undefined) {
    updates.invoiceNumber = data.invoiceNumber;
  }

  if (data.status !== undefined) {
    updates.status = data.status;
  }

  if (data.notes !== undefined) {
    updates.notes = data.notes;
  }

  const now = new Date().toISOString();
  updates.updatedAt = now;

  db.update(invoices).set(updates).where(eq(invoices.id, invoiceId)).run();

  const updated = db.select().from(invoices).where(eq(invoices.id, invoiceId)).get()!;
  return toInvoice(db, updated);
}

/**
 * Delete an invoice.
 * @throws NotFoundError if invoice not found or does not belong to the specified vendor
 */
export function deleteInvoice(db: DbType, vendorId: string, invoiceId: string): void {
  assertVendorExists(db, vendorId);

  const existing = db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.vendorId, vendorId)))
    .get();

  if (!existing) {
    throw new NotFoundError('Invoice not found');
  }

  db.delete(invoices).where(eq(invoices.id, invoiceId)).run();
}
