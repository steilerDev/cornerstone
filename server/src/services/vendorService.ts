import { randomUUID } from 'node:crypto';
import { eq, asc, desc, sql, or, and } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import { vendors, invoices, workItemBudgets, users, trades } from '../db/schema.js';
import type {
  Vendor,
  VendorDetail,
  CreateVendorRequest,
  UpdateVendorRequest,
  VendorListQuery,
  PaginationMeta,
  UserSummary,
  TradeSummary,
} from '@cornerstone/shared';
import { NotFoundError, ValidationError, VendorInUseError } from '../errors/AppError.js';
import * as vendorContactService from './vendorContactService.js';

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

  // Resolve trade if present
  let trade: TradeSummary | null = null;
  if (row.tradeId) {
    const tradeRow = db.select().from(trades).where(eq(trades.id, row.tradeId)).get();
    if (tradeRow) {
      trade = {
        id: tradeRow.id,
        name: tradeRow.name,
        color: tradeRow.color,
        translationKey: tradeRow.translationKey ?? null,
      };
    }
  }

  return {
    id: row.id,
    name: row.name,
    trade,
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
    .where(and(eq(invoices.vendorId, vendorId), sql`${invoices.status} IN ('pending', 'claimed')`))
    .get();

  return {
    invoiceCount: countResult?.count ?? 0,
    outstandingBalance: balanceResult?.total ?? 0,
  };
}

/**
 * Convert database vendor row to VendorDetail shape (includes invoice stats and contacts).
 */
function toVendorDetail(db: DbType, row: typeof vendors.$inferSelect): VendorDetail {
  const stats = getVendorStats(db, row.id);
  const contacts = vendorContactService.listContactsRaw(db, row.id);
  return {
    ...toVendor(db, row),
    invoiceCount: stats.invoiceCount,
    outstandingBalance: stats.outstandingBalance,
    contacts,
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
      sql`(LOWER(${vendors.name}) LIKE LOWER(${pattern}) ESCAPE '\\' OR EXISTS (SELECT 1 FROM trades WHERE trades.id = ${vendors.tradeId} AND LOWER(trades.name) LIKE LOWER(${pattern}) ESCAPE '\\'))`!,
    );
  }

  if (query.tradeId) {
    conditions.push(eq(vendors.tradeId, query.tradeId));
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
  let orderByClause: any;
  if (sortBy === 'trade') {
    // Sort by trade name via subquery
    const sortDirection = sortOrder === 'asc' ? 'ASC' : 'DESC';
    orderByClause = sql`(SELECT COALESCE(${trades.name}, '') FROM ${trades} WHERE ${trades.id} = ${vendors.tradeId}) ${sql.raw(sortDirection)}`;
  } else if (sortBy === 'created_at') {
    orderByClause = sortOrder === 'asc' ? asc(vendors.createdAt) : desc(vendors.createdAt);
  } else if (sortBy === 'updated_at') {
    orderByClause = sortOrder === 'asc' ? asc(vendors.updatedAt) : desc(vendors.updatedAt);
  } else {
    orderByClause = sortOrder === 'asc' ? asc(vendors.name) : desc(vendors.name);
  }

  // Fetch paginated items
  const offset = (page - 1) * pageSize;
  const rows = db
    .select()
    .from(vendors)
    .where(whereClause)
    .orderBy(orderByClause)
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
 * @throws ValidationError if name is invalid or tradeId doesn't exist
 */
export function createVendor(db: DbType, data: CreateVendorRequest, userId: string): Vendor {
  // Validate name
  const trimmedName = data.name.trim();
  if (trimmedName.length === 0 || trimmedName.length > 200) {
    throw new ValidationError('Vendor name must be between 1 and 200 characters');
  }

  // Validate tradeId exists if provided
  if (data.tradeId !== undefined && data.tradeId !== null) {
    const trade = db.select().from(trades).where(eq(trades.id, data.tradeId)).get();
    if (!trade) {
      throw new ValidationError('Trade does not exist');
    }
  }

  const id = randomUUID();
  const now = new Date().toISOString();

  db.insert(vendors)
    .values({
      id,
      name: trimmedName,
      tradeId: data.tradeId ?? null,
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
 * @throws ValidationError if provided fields are invalid or tradeId doesn't exist
 */
export function updateVendor(db: DbType, id: string, data: UpdateVendorRequest): VendorDetail {
  const existing = db.select().from(vendors).where(eq(vendors.id, id)).get();
  if (!existing) {
    throw new NotFoundError('Vendor not found');
  }

  // Validate at least one field provided
  if (
    data.name === undefined &&
    data.tradeId === undefined &&
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

  if (data.tradeId !== undefined) {
    // Validate tradeId exists if non-null
    if (data.tradeId !== null) {
      const trade = db.select().from(trades).where(eq(trades.id, data.tradeId)).get();
      if (!trade) {
        throw new ValidationError('Trade does not exist');
      }
    }
    updates.tradeId = data.tradeId;
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

  // Count budget line references (vendor_id FK on work_item_budgets)
  const budgetLineCountResult = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(workItemBudgets)
    .where(eq(workItemBudgets.vendorId, id))
    .get();
  const budgetLineCount = budgetLineCountResult?.count ?? 0;

  if (invoiceCount > 0 || budgetLineCount > 0) {
    throw new VendorInUseError('Vendor is in use and cannot be deleted', {
      invoiceCount,
      budgetLineCount,
    });
  }

  db.delete(vendors).where(eq(vendors.id, id)).run();
}
