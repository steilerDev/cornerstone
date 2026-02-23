import { randomUUID } from 'node:crypto';
import { eq, desc, and, asc, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import { invoices, vendors, workItemBudgets, users } from '../db/schema.js';
import type {
  Invoice,
  InvoiceStatus,
  CreateInvoiceRequest,
  UpdateInvoiceRequest,
  UserSummary,
  PaginationMeta,
  InvoiceSummary,
  InvoiceStatusSummary,
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
 * Resolves vendorName and createdBy via separate queries.
 */
function toInvoice(db: DbType, row: typeof invoices.$inferSelect): Invoice {
  const vendor = db.select().from(vendors).where(eq(vendors.id, row.vendorId)).get();
  const createdByUser = row.createdBy
    ? db.select().from(users).where(eq(users.id, row.createdBy)).get()
    : null;

  return {
    id: row.id,
    vendorId: row.vendorId,
    vendorName: vendor?.name ?? 'Unknown',
    workItemBudgetId: row.workItemBudgetId,
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
): { invoices: Invoice[]; pagination: PaginationMeta; summary: InvoiceSummary } {
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
  const summary: InvoiceSummary = {
    pending: { ...defaultSummary },
    paid: { ...defaultSummary },
    claimed: { ...defaultSummary },
  };
  for (const row of summaryRows) {
    const status = row.status as InvoiceStatus;
    if (status === 'pending' || status === 'paid' || status === 'claimed') {
      summary[status] = { count: row.count, totalAmount: row.totalAmount };
    }
  }

  // Map rows — resolve createdBy for each (unavoidable per-row query for createdBy)
  const invoiceList: Invoice[] = rows.map(({ invoice: row, vendorName }) => {
    const createdByUser = row.createdBy
      ? db.select().from(users).where(eq(users.id, row.createdBy)).get()
      : null;
    return {
      id: row.id,
      vendorId: row.vendorId,
      vendorName,
      workItemBudgetId: row.workItemBudgetId,
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
  });

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

  // Validate workItemBudgetId if provided
  if (data.workItemBudgetId) {
    const budgetLine = db
      .select()
      .from(workItemBudgets)
      .where(eq(workItemBudgets.id, data.workItemBudgetId))
      .get();
    if (!budgetLine) {
      throw new ValidationError(`Work item budget line not found: ${data.workItemBudgetId}`);
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
      workItemBudgetId: data.workItemBudgetId ?? null,
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

  // workItemBudgetId (nullable — null unlinks)
  if ('workItemBudgetId' in data) {
    if (data.workItemBudgetId) {
      const budgetLine = db
        .select()
        .from(workItemBudgets)
        .where(eq(workItemBudgets.id, data.workItemBudgetId))
        .get();
      if (!budgetLine) {
        throw new ValidationError(`Work item budget line not found: ${data.workItemBudgetId}`);
      }
    }
    updates.workItemBudgetId = data.workItemBudgetId ?? null;
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
