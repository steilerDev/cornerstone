import { randomUUID } from 'node:crypto';
import { eq, asc, desc, sql, and, inArray } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import {
  vendors,
  invoices,
  invoiceDeposits,
  workItemBudgets,
  workItems,
  users,
  trades,
} from '../db/schema.js';
import type {
  Vendor,
  VendorListItem,
  VendorDetail,
  VendorMoney,
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
import { computePayments, toMajor, toOfferTotals } from './shared/moneyEngine.js';
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
 * ADR-039 money of each company's offers and invoices. One query over (invoices LEFT JOIN
 * invoice_deposits) of all given companies, grouped per company, then the money engine's
 * `computePayments` per company: the list, the detail and the Still-to-pay sort share it.
 * Every id gets an entry (zeros when the company has no records).
 */
function loadVendorMoney(
  db: Pick<DbType, 'select'>,
  vendorIds: readonly string[],
): Map<string, VendorMoney> {
  const result = new Map<string, VendorMoney>();
  if (vendorIds.length === 0) return result;

  const rows = db
    .select({
      vendor_id: invoices.vendorId,
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
    .where(inArray(invoices.vendorId, [...vendorIds]))
    .all();

  const byVendor = new Map<string, InvoiceDepositRow[]>();
  for (const { vendor_id, ...row } of rows) {
    const list = byVendor.get(vendor_id) ?? [];
    list.push(row);
    byVendor.set(vendor_id, list);
  }

  for (const id of vendorIds) {
    const payments = computePayments(byVendor.get(id) ?? []);
    result.set(id, {
      stillToPay: toMajor(payments.stillToPayCents),
      paid: toMajor(payments.paidCents),
      offers: toOfferTotals(payments.offers),
    });
  }
  return result;
}

/**
 * SQL condition: the diary row `d` is a saved, manual daily log naming the company. `vendorIdSql`
 * is the company id expression (hand-qualified column or bound parameter).
 */
function dailyLogNamesVendor(vendorIdSql: SQL): SQL {
  return sql`d.entry_type = 'daily_log' AND d.status = 'saved' AND d.is_automatic = 0
      AND json_valid(d.metadata) AND json_extract(d.metadata, '$.vendorId') = ${vendorIdSql}`;
}

/**
 * Convert database vendor row to VendorDetail shape (money, counts, site days and contacts).
 */
function toVendorDetail(db: DbType, row: typeof vendors.$inferSelect): VendorDetail {
  const invoiceCount = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(invoices)
    .where(eq(invoices.vendorId, row.id))
    .get()!.count;
  const openTaskCount = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(workItems)
    .where(and(eq(workItems.assignedVendorId, row.id), sql`${workItems.status} <> 'completed'`))
    .get()!.count;
  const onSite = db.get<{ days: number; last: string | null }>(
    sql`SELECT COUNT(DISTINCT d.entry_date) AS days, MAX(d.entry_date) AS last
      FROM diary_entries d WHERE ${dailyLogNamesVendor(sql`${row.id}`)}`,
  );
  return {
    ...toVendor(db, row),
    ...loadVendorMoney(db, [row.id]).get(row.id)!,
    invoiceCount,
    contacts: vendorContactService.listContactsRaw(db, row.id),
    openTaskCount,
    onSiteDays: Number(onSite.days),
    lastOnSite: onSite.last,
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
  const totalItems = countResult!.count;
  const totalPages = Math.ceil(totalItems / pageSize);

  // Qualified by hand: drizzle renders ${vendors.id} unqualified inside a select-field subquery, where "id" would bind to vc.id.
  const lastOnSiteExpr = sql`(
    SELECT MAX(d.entry_date) FROM diary_entries d
    WHERE ${dailyLogNamesVendor(sql.raw('"vendors"."id"'))}
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
    // 'name', and 'still_to_pay' (whose order is applied in memory below; the SQL order only
    // fixes the tie-break order that the stable in-memory sort preserves).
    orderByClause = [
      sortBy === 'name' && sortOrder === 'desc' ? desc(vendors.name) : asc(vendors.name),
      asc(vendors.id),
    ];
  }

  const offset = (page - 1) * pageSize;
  const firstContactPhone = sql<string | null>`(
    SELECT vc.phone FROM vendor_contacts vc
    WHERE vc.vendor_id = "vendors"."id" AND TRIM(COALESCE(vc.phone, '')) <> ''
    ORDER BY vc.created_at ASC, vc.id ASC
    LIMIT 1
  )`;
  const contactCount = sql<number>`(SELECT COUNT(*) FROM vendor_contacts vc WHERE vc.vendor_id = "vendors"."id")`;
  const lastOnSite = sql<string | null>`${lastOnSiteExpr}`;
  const rowSelect = { vendor: vendors, firstContactPhone, contactCount, lastOnSite };

  let rows;
  let moneyById: Map<string, VendorMoney>;
  if (sortBy === 'still_to_pay') {
    // ADR-039: the figure comes from the money engine only, so the sort runs in memory over every
    // company matching the filter (dozens), then the page is hydrated in the sorted order.
    const allIds = db
      .select({ id: vendors.id })
      .from(vendors)
      .where(whereClause)
      .orderBy(...orderByClause)
      .all()
      .map((r) => r.id);
    const allMoney = loadVendorMoney(db, allIds);
    const sign = sortOrder === 'asc' ? 1 : -1;
    // Array.prototype.sort is stable: equal figures keep the name ASC, id ASC order of allIds.
    const pageIds = [...allIds]
      .sort((a, b) => sign * (allMoney.get(a)!.stillToPay - allMoney.get(b)!.stillToPay))
      .slice(offset, offset + pageSize);
    const hydrated = new Map(
      db
        .select(rowSelect)
        .from(vendors)
        .where(inArray(vendors.id, pageIds))
        .all()
        .map((r) => [r.vendor.id, r]),
    );
    rows = pageIds.map((id) => hydrated.get(id)!);
    moneyById = allMoney;
  } else {
    rows = db
      .select(rowSelect)
      .from(vendors)
      .where(whereClause)
      .orderBy(...orderByClause)
      .limit(pageSize)
      .offset(offset)
      .all();
    moneyById = loadVendorMoney(
      db,
      rows.map((r) => r.vendor.id),
    );
  }

  const vendorList: VendorListItem[] = rows.map((r) => ({
    ...toVendor(db, r.vendor),
    firstContactPhone: r.firstContactPhone ?? null,
    contactCount: Number(r.contactCount),
    lastOnSite: r.lastOnSite ?? null,
    ...moneyById.get(r.vendor.id)!,
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
  const invoiceCount = invoiceCountResult!.count;

  // Count budget line references (vendor_id FK on work_item_budgets)
  const budgetLineCountResult = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(workItemBudgets)
    .where(eq(workItemBudgets.vendorId, id))
    .get();
  const budgetLineCount = budgetLineCountResult!.count;

  if (invoiceCount > 0 || budgetLineCount > 0) {
    throw new VendorInUseError('Vendor is in use and cannot be deleted', {
      invoiceCount,
      budgetLineCount,
    });
  }

  db.delete(vendors).where(eq(vendors.id, id)).run();
}
