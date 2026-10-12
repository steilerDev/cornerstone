import { randomUUID } from 'node:crypto';
import { eq, asc, desc, sql, and } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import {
  vendors,
  invoices,
  invoiceDeposits,
  workItemBudgets,
  users,
  trades,
} from '../db/schema.js';
import type {
  Vendor,
  VendorListItem,
  VendorDetail,
  CreateVendorRequest,
  UpdateVendorRequest,
  VendorListQuery,
  PaginationMeta,
  UserSummary,
  TradeSummary,
} from '@cornerstone/shared';
import { NotFoundError, ValidationError, VendorInUseError } from '../errors/AppError.js';
import { vendorTextMatch } from './searchService.js';
import * as vendorContactService from './vendorContactService.js';
import { computeOpenAmounts } from './shared/depositAggregateUtils.js';
import type { InvoiceDepositRow } from './shared/depositAggregateUtils.js';

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
 * outstandingBalance: ADR-039 'Still to pay' — pending invoices minus their non-refund progress
 * payments, plus pending progress payments (also on offers). Paid and claimed (submitted)
 * invoices never count. Same helper as the Invoices page open-payable figure.
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

  const rows: InvoiceDepositRow[] = db
    .select({
      invoice_id: invoices.id,
      invoice_amount: invoices.amount,
      invoice_status: invoices.status,
      deposit_id: invoiceDeposits.id,
      deposit_amount: invoiceDeposits.amount,
      deposit_status: invoiceDeposits.status,
      deposit_entry_type: invoiceDeposits.entryType,
    })
    .from(invoices)
    .leftJoin(invoiceDeposits, eq(invoiceDeposits.invoiceId, invoices.id))
    .where(eq(invoices.vendorId, vendorId))
    .all();
  const outstandingBalance = computeOpenAmounts(rows).openPayable.totalAmount;

  return {
    invoiceCount: countResult?.count ?? 0,
    outstandingBalance,
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
  tradeIds: readonly string[] = [],
): { vendors: VendorListItem[]; pagination: PaginationMeta } {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 25));
  const sortBy = query.sortBy ?? 'name';
  const sortOrder = query.sortOrder ?? 'asc';

  // Build WHERE conditions
  const conditions = [];

  // Same matcher and field list as the vendor group of GET /api/search. Filters, never ranks.
  const textMatch = vendorTextMatch(query.q ?? '', tradeIds);
  if (textMatch) {
    conditions.push(textMatch);
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

  // Qualified by hand: drizzle renders ${vendors.id} unqualified inside a select-field subquery, where "id" would bind to vc.id.
  const lastOnSiteExpr = sql`(
    SELECT MAX(d.entry_date) FROM diary_entries d
    WHERE d.entry_type = 'daily_log' AND d.status = 'saved' AND d.is_automatic = 0
      AND json_extract(d.metadata, '$.vendorId') = "vendors"."id"
  )`;

  // Build ORDER BY. `direction` comes only from the validated sortOrder enum, never user text.
  // Every sort breaks ties by name ASC, then id ASC.
  const direction = sql.raw(sortOrder === 'asc' ? 'ASC' : 'DESC');
  const tieBreak = [asc(vendors.name), asc(vendors.id)];
  let orderByClause: SQL[];
  if (sortBy === 'trade') {
    orderByClause = [
      sql`(SELECT COALESCE(${trades.name}, '') FROM ${trades} WHERE ${trades.id} = ${vendors.tradeId}) ${direction}`,
      ...tieBreak,
    ];
  } else if (sortBy === 'last_on_site') {
    // The expression is repeated (not a select alias): an ORDER BY alias is not reliable inside
    // drizzle's .orderBy(). Companies without a daily log come last in both directions.
    orderByClause = [
      sql`(${lastOnSiteExpr}) IS NULL ASC`,
      sql`(${lastOnSiteExpr}) ${direction}`,
      ...tieBreak,
    ];
  } else if (sortBy === 'created_at') {
    orderByClause = [
      sortOrder === 'asc' ? asc(vendors.createdAt) : desc(vendors.createdAt),
      ...tieBreak,
    ];
  } else if (sortBy === 'updated_at') {
    orderByClause = [
      sortOrder === 'asc' ? asc(vendors.updatedAt) : desc(vendors.updatedAt),
      ...tieBreak,
    ];
  } else {
    orderByClause = [sortOrder === 'asc' ? asc(vendors.name) : desc(vendors.name), asc(vendors.id)];
  }

  // Fetch paginated items
  const offset = (page - 1) * pageSize;
  const firstContactPhone = sql<string | null>`(
    SELECT vc.phone FROM vendor_contacts vc
    WHERE vc.vendor_id = "vendors"."id" AND TRIM(COALESCE(vc.phone, '')) <> ''
    ORDER BY vc.created_at ASC, vc.id ASC
    LIMIT 1
  )`;
  const contactCount = sql<number>`(SELECT COUNT(*) FROM vendor_contacts vc WHERE vc.vendor_id = "vendors"."id")`;
  const lastOnSite = sql<string | null>`${lastOnSiteExpr}`;
  const rows = db
    .select({ vendor: vendors, firstContactPhone, contactCount, lastOnSite })
    .from(vendors)
    .where(whereClause)
    .orderBy(...orderByClause)
    .limit(pageSize)
    .offset(offset)
    .all();

  const vendorList: VendorListItem[] = rows.map((r) => ({
    ...toVendor(db, r.vendor),
    firstContactPhone: r.firstContactPhone ?? null,
    contactCount: Number(r.contactCount ?? 0),
    lastOnSite: r.lastOnSite ?? null,
  }));

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
