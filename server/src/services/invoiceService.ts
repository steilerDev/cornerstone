import { randomUUID } from 'node:crypto';
import { eq, desc, and, asc, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import { invoices, vendors, users } from '../db/schema.js';
import type {
  Invoice,
  InvoiceStatus,
  CreateInvoiceRequest,
  UpdateInvoiceRequest,
  UserSummary,
  PaginationMeta,
  InvoiceStatusBreakdown,
  InvoiceStatusSummary,
} from '@cornerstone/shared';
import { NotFoundError, ValidationError } from '../errors/AppError.js';
import { deleteLinksForEntity } from './documentLinkService.js';
import { getInvoiceBudgetLinesForInvoice } from './invoiceBudgetLineService.js';
import { onInvoiceStatusChanged } from './diaryAutoEventService.js';

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
 * Resolves vendorName and createdBy via separate queries.
 * Resolves budget lines via invoiceBudgetLineService.
 * If knownVendorName is provided, skips the vendor DB lookup.
 */
function toInvoice(
  db: DbType,
  row: typeof invoices.$inferSelect,
  knownVendorName?: string,
): Invoice {
  const vendorName =
    knownVendorName !== undefined
      ? knownVendorName
      : (db.select().from(vendors).where(eq(vendors.id, row.vendorId)).get()?.name ?? 'Unknown');
  const createdByUser = row.createdBy
    ? db.select().from(users).where(eq(users.id, row.createdBy)).get()
    : null;

  const { budgetLines, remainingAmount } = getInvoiceBudgetLinesForInvoice(db, row.id, row.amount);

  return {
    id: row.id,
    vendorId: row.vendorId,
    vendorName,
    invoiceNumber: row.invoiceNumber,
    amount: row.amount,
    date: row.date,
    dueDate: row.dueDate,
    status: row.status as InvoiceStatus,
    notes: row.notes,
    budgetLines,
    remainingAmount,
    createdBy: toUserSummary(createdByUser),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Assert that a vendor exists, throwing NotFoundError if not.
 * Returns the vendor name so callers can pass it to toInvoice() without an extra lookup.
 */
function assertVendorExists(db: DbType, vendorId: string): string {
  const vendor = db.select().from(vendors).where(eq(vendors.id, vendorId)).get();
  if (!vendor) {
    throw new NotFoundError('Vendor not found');
  }
  return vendor.name;
}

/**
 * List all invoices for a vendor, sorted by date descending.
 * @throws NotFoundError if vendor does not exist
 */
export function listInvoices(db: DbType, vendorId: string): Invoice[] {
  const vendorName = assertVendorExists(db, vendorId);

  const rows = db
    .select()
    .from(invoices)
    .where(eq(invoices.vendorId, vendorId))
    .orderBy(desc(invoices.date))
    .all();

  return rows.map((row) => toInvoice(db, row, vendorName));
}

/**
 * List all invoices across all vendors with pagination, filtering, sorting, and a status summary.
 */
export function listAllInvoices(
  db: DbType,
  query: {
    page?: number;
    pageSize?: number;
    q?: string;
    status?: InvoiceStatus;
    vendorId?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  },
): { invoices: Invoice[]; pagination: PaginationMeta; summary: InvoiceStatusBreakdown } {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 25));
  const sortOrder = query.sortOrder ?? 'desc';

  // Build WHERE conditions
  const conditions = [];
  if (query.status) {
    conditions.push(eq(invoices.status, query.status));
  }
  if (query.vendorId) {
    conditions.push(eq(invoices.vendorId, query.vendorId));
  }
  if (query.q) {
    const escapedQ = query.q.replace(/%/g, '\\%').replace(/_/g, '\\_');
    const pattern = `%${escapedQ}%`;
    conditions.push(sql`LOWER(${invoices.invoiceNumber}) LIKE LOWER(${pattern}) ESCAPE '\\'`);
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Count total
  const countResult = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(invoices)
    .innerJoin(vendors, eq(invoices.vendorId, vendors.id))
    .where(whereClause)
    .get();
  const totalItems = countResult?.count ?? 0;
  const totalPages = Math.ceil(totalItems / pageSize);

  // ORDER BY
  const sortColumn =
    query.sortBy === 'amount'
      ? invoices.amount
      : query.sortBy === 'status'
        ? invoices.status
        : query.sortBy === 'vendor_name'
          ? vendors.name
          : query.sortBy === 'due_date'
            ? invoices.dueDate
            : invoices.date; // default: date
  const orderBy = sortOrder === 'asc' ? asc(sortColumn) : desc(sortColumn);

  // Fetch page with JOIN for vendorName
  const offset = (page - 1) * pageSize;
  const rows = db
    .select({
      invoice: invoices,
      vendorName: vendors.name,
    })
    .from(invoices)
    .innerJoin(vendors, eq(invoices.vendorId, vendors.id))
    .where(whereClause)
    .orderBy(orderBy)
    .limit(pageSize)
    .offset(offset)
    .all();

  // Compute global summary (unfiltered — across all invoices)
  const summaryRows = db
    .select({
      status: invoices.status,
      count: sql<number>`COUNT(*)`,
      totalAmount: sql<number>`COALESCE(SUM(${invoices.amount}), 0)`,
    })
    .from(invoices)
    .groupBy(invoices.status)
    .all();

  const defaultSummary: InvoiceStatusSummary = { count: 0, totalAmount: 0 };
  const summary: InvoiceStatusBreakdown = {
    pending: { ...defaultSummary },
    paid: { ...defaultSummary },
    claimed: { ...defaultSummary },
    quotation: { ...defaultSummary },
  };
  for (const row of summaryRows) {
    const status = row.status as InvoiceStatus;
    if (
      status === 'pending' ||
      status === 'paid' ||
      status === 'claimed' ||
      status === 'quotation'
    ) {
      summary[status] = { count: row.count, totalAmount: row.totalAmount };
    }
  }

  // Map rows using toInvoice(), passing the joined vendorName to avoid an extra DB lookup
  // NOTE: toInvoice() will call toWorkItemBudgetSummary() and toHouseholdItemBudgetSummary()
  // for any linked budget lines. If new Invoice fields are added in the future,
  // ensure they are resolved in BOTH toInvoice() AND this inline map.
  const invoiceList: Invoice[] = rows.map(({ invoice: row, vendorName }) =>
    toInvoice(db, row, vendorName),
  );

  return {
    invoices: invoiceList,
    pagination: { page, pageSize, totalItems, totalPages },
    summary,
  };
}

/**
 * Get a single invoice by ID (cross-vendor lookup).
 * @throws NotFoundError if invoice does not exist
 */
export function getInvoiceById(db: DbType, invoiceId: string): Invoice {
  const row = db.select().from(invoices).where(eq(invoices.id, invoiceId)).get();
  if (!row) {
    throw new NotFoundError('Invoice not found');
  }
  return toInvoice(db, row);
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
  const vendorName = assertVendorExists(db, vendorId);

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
  return toInvoice(db, row, vendorName);
}

/**
 * Partial update of an invoice.
 * Validates same rules as createInvoice for any provided fields.
 * @throws NotFoundError if vendor or invoice not found, or if invoice doesn't belong to vendor
 * @throws ValidationError if any provided field is invalid
 *
 * @param db - Database connection
 * @param vendorId - Vendor ID
 * @param invoiceId - Invoice ID
 * @param data - Update request data
 * @param diaryAutoEvents - Whether to create automatic diary entries (default: true)
 */
export function updateInvoice(
  db: DbType,
  vendorId: string,
  invoiceId: string,
  data: UpdateInvoiceRequest,
  diaryAutoEvents: boolean = true,
): Invoice {
  const vendorName = assertVendorExists(db, vendorId);

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

  let statusChanged = false;
  let previousStatus: string | undefined;
  let newStatus: string | undefined;

  if (data.status !== undefined) {
    statusChanged = data.status !== existing.status;
    previousStatus = existing.status;
    newStatus = data.status;
    updates.status = data.status;
  }

  if (data.notes !== undefined) {
    updates.notes = data.notes;
  }

  const now = new Date().toISOString();
  updates.updatedAt = now;

  db.update(invoices).set(updates).where(eq(invoices.id, invoiceId)).run();

  // Log status change to diary if enabled
  if (statusChanged && previousStatus !== undefined && newStatus !== undefined) {
    onInvoiceStatusChanged(
      db,
      diaryAutoEvents,
      invoiceId,
      existing.invoiceNumber || 'N/A',
      previousStatus,
      newStatus,
    );
  }

  const updated = db.select().from(invoices).where(eq(invoices.id, invoiceId)).get()!;
  return toInvoice(db, updated, vendorName);
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

  // Cascade delete document links (polymorphic FK, enforced at app layer)
  deleteLinksForEntity(db, 'invoice', invoiceId);

  db.delete(invoices).where(eq(invoices.id, invoiceId)).run();
}
