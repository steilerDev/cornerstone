import { randomUUID } from 'node:crypto';
import { eq, asc, desc, sql, or, and } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import { vendors, invoices, workItemVendors, users } from '../db/schema.js';
import type {
  Vendor,
  VendorDetail,
  CreateVendorRequest,
  UpdateVendorRequest,
  VendorListQuery,
  PaginationMeta,
  UserSummary,
} from '@cornerstone/shared';
import { NotFoundError, ValidationError, VendorInUseError } from '../errors/AppError.js';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

/**
 * Convert database user row to UserSummary shape.
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
 * Convert database vendor row to Vendor shape.
 */
function toVendor(db: DbType, row: typeof vendors.$inferSelect): Vendor {
  // Resolve createdBy user
  const createdByUser = row.createdBy
    ? db.select().from(users).where(eq(users.id, row.createdBy)).get()
    : null;

  return {
    id: row.id,
    name: row.name,
    specialty: row.specialty,
    phone: row.phone,
    email: row.email,
    address: row.address,
    notes: row.notes,
    createdBy: toUserSummary(createdByUser),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Compute invoice statistics for a vendor.
 * invoiceCount: total invoice count
 * outstandingBalance: sum of amount for pending + overdue invoices
 */
function getVendorStats(
  db: DbType,
  vendorId: string,
): { invoiceCount: number; outstandingBalance: number } {
  const countResult = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(invoices)
    .where(eq(invoices.vendorId, vendorId))
    .get();

  const balanceResult = db
    .select({ total: sql<number>`COALESCE(SUM(${invoices.amount}), 0)` })
    .from(invoices)
    .where(and(eq(invoices.vendorId, vendorId), sql`${invoices.status} IN ('pending', 'overdue')`))
    .get();

  return {
    invoiceCount: countResult?.count ?? 0,
    outstandingBalance: balanceResult?.total ?? 0,
  };
}

/**
 * Convert database vendor row to VendorDetail shape (includes invoice stats).
 */
function toVendorDetail(db: DbType, row: typeof vendors.$inferSelect): VendorDetail {
  const stats = getVendorStats(db, row.id);
  return {
    ...toVendor(db, row),
    invoiceCount: stats.invoiceCount,
    outstandingBalance: stats.outstandingBalance,
  };
}

/**
 * List vendors with optional search, sorting, and pagination.
 */
export function listVendors(
  db: DbType,
  query: VendorListQuery,
): { vendors: Vendor[]; pagination: PaginationMeta } {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 25));
  const sortBy = query.sortBy ?? 'name';
  const sortOrder = query.sortOrder ?? 'asc';

  // Build WHERE conditions
  const conditions = [];

  if (query.q) {
    // Escape SQL LIKE wildcards (% and _) in user input
    const escapedQ = query.q.replace(/%/g, '\\%').replace(/_/g, '\\_');
    const pattern = `%${escapedQ}%`;
    conditions.push(
      or(
        sql`LOWER(${vendors.name}) LIKE LOWER(${pattern}) ESCAPE '\\'`,
        sql`LOWER(${vendors.specialty}) LIKE LOWER(${pattern}) ESCAPE '\\'`,
      )!,
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Count total items
  const countResult = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(vendors)
    .where(whereClause)
    .get();
  const totalItems = countResult?.count ?? 0;
  const totalPages = Math.ceil(totalItems / pageSize);

  // Build ORDER BY
  const sortColumn =
    sortBy === 'specialty'
      ? vendors.specialty
      : sortBy === 'created_at'
        ? vendors.createdAt
        : sortBy === 'updated_at'
          ? vendors.updatedAt
          : vendors.name;

  const orderBy = sortOrder === 'asc' ? asc(sortColumn) : desc(sortColumn);

  // Fetch paginated items
  const offset = (page - 1) * pageSize;
  const rows = db
    .select()
    .from(vendors)
    .where(whereClause)
    .orderBy(orderBy)
    .limit(pageSize)
    .offset(offset)
    .all();

  const vendorList = rows.map((row) => toVendor(db, row));

  return {
    vendors: vendorList,
    pagination: {
      page,
      pageSize,
      totalItems,
      totalPages,
    },
  };
}

/**
 * Get a single vendor by ID with invoice statistics.
 * @throws NotFoundError if vendor does not exist
 */
export function getVendorById(db: DbType, id: string): VendorDetail {
  const row = db.select().from(vendors).where(eq(vendors.id, id)).get();
  if (!row) {
    throw new NotFoundError('Vendor not found');
  }
  return toVendorDetail(db, row);
}

/**
 * Create a new vendor.
 * @throws ValidationError if name is invalid
 */
export function createVendor(db: DbType, data: CreateVendorRequest, userId: string): Vendor {
  // Validate name
  const trimmedName = data.name.trim();
  if (trimmedName.length === 0 || trimmedName.length > 200) {
    throw new ValidationError('Vendor name must be between 1 and 200 characters');
  }

  const id = randomUUID();
  const now = new Date().toISOString();

  db.insert(vendors)
    .values({
      id,
      name: trimmedName,
      specialty: data.specialty ?? null,
      phone: data.phone ?? null,
      email: data.email ?? null,
      address: data.address ?? null,
      notes: data.notes ?? null,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  const row = db.select().from(vendors).where(eq(vendors.id, id)).get()!;
  return toVendor(db, row);
}

/**
 * Update a vendor's details (partial update).
 * @throws NotFoundError if vendor does not exist
 * @throws ValidationError if provided fields are invalid
 */
export function updateVendor(db: DbType, id: string, data: UpdateVendorRequest): VendorDetail {
  const existing = db.select().from(vendors).where(eq(vendors.id, id)).get();
  if (!existing) {
    throw new NotFoundError('Vendor not found');
  }

  // Validate at least one field provided
  if (
    data.name === undefined &&
    data.specialty === undefined &&
    data.phone === undefined &&
    data.email === undefined &&
    data.address === undefined &&
    data.notes === undefined
  ) {
    throw new ValidationError('At least one field must be provided');
  }

  const updates: Partial<typeof vendors.$inferInsert> = {};

  if (data.name !== undefined) {
    const trimmedName = data.name.trim();
    if (trimmedName.length === 0 || trimmedName.length > 200) {
      throw new ValidationError('Vendor name must be between 1 and 200 characters');
    }
    updates.name = trimmedName;
  }

  if (data.specialty !== undefined) {
    updates.specialty = data.specialty;
  }

  if (data.phone !== undefined) {
    updates.phone = data.phone;
  }

  if (data.email !== undefined) {
    updates.email = data.email;
  }

  if (data.address !== undefined) {
    updates.address = data.address;
  }

  if (data.notes !== undefined) {
    updates.notes = data.notes;
  }

  const now = new Date().toISOString();
  updates.updatedAt = now;

  db.update(vendors).set(updates).where(eq(vendors.id, id)).run();

  const updated = db.select().from(vendors).where(eq(vendors.id, id)).get()!;
  return toVendorDetail(db, updated);
}

/**
 * Delete a vendor.
 * Fails with VendorInUseError if the vendor has invoices or work item links.
 * @throws NotFoundError if vendor does not exist
 * @throws VendorInUseError if vendor is referenced by invoices or work items
 */
export function deleteVendor(db: DbType, id: string): void {
  const existing = db.select().from(vendors).where(eq(vendors.id, id)).get();
  if (!existing) {
    throw new NotFoundError('Vendor not found');
  }

  // Count invoice references
  const invoiceCountResult = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(invoices)
    .where(eq(invoices.vendorId, id))
    .get();
  const invoiceCount = invoiceCountResult?.count ?? 0;

  // Count work item references
  const workItemCountResult = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(workItemVendors)
    .where(eq(workItemVendors.vendorId, id))
    .get();
  const workItemCount = workItemCountResult?.count ?? 0;

  if (invoiceCount > 0 || workItemCount > 0) {
    throw new VendorInUseError('Vendor is in use and cannot be deleted', {
      invoiceCount,
      workItemCount,
    });
  }

  db.delete(vendors).where(eq(vendors.id, id)).run();
}
