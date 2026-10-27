import { randomUUID } from 'node:crypto';
import { eq, desc, and, asc, sql, gte, lte, inArray, type SQL } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import { invoices, vendors, users, invoiceDeposits, invoiceBudgetLines } from '../db/schema.js';
import type {
  Invoice,
  InvoiceStatus,
  InvoiceDeposit,
  CreateInvoiceRequest,
  UpdateInvoiceRequest,
  UserSummary,
  PaginationMeta,
  InvoiceStatusBreakdown,
  InvoiceStatusSummary,
  InvoiceChipCounts,
  InvoiceChipTally,
  InvoiceChipsOutsideToPay,
  InvoiceListRow,
  InvoiceRecordMoney,
  InvoiceDetail,
  InvoiceListSort,
  InvoiceListTotals,
  FilterMeta,
} from '@cornerstone/shared';
import {
  NotFoundError,
  ValidationError,
  ItemizedSumExceedsInvoiceError,
} from '../errors/AppError.js';
import { toLikeContainsPattern } from './shared/likePattern.js';
import { exceedsAmount, toCents } from './shared/money.js';
import { isValidIsoDate } from './shared/validators.js';
import { deleteLinksForEntity } from './documentLinkService.js';
import { getInvoiceBudgetLinesForInvoice } from './invoiceBudgetLineService.js';
import { getReadyToSubmit, loadInvoiceLinks } from './moneyService.js';
import {
  NOT_YET_SPLIT_MIN_CENTS,
  computePayments,
  toMajor,
  toOfferTotals,
} from './shared/moneyEngine.js';
import { PAYMENT_DUE_WINDOW_DAYS } from './shared/attentionRules.js';
import {
  onInvoiceStatusChanged,
  SYSTEM_CONTEXT,
  type EventContext,
} from './diaryAutoEventService.js';
import {
  aggregateInvoiceStatusBreakdown,
  computeQuotationCoveredByDeposits,
  computeFinalPaymentAmount,
  computeFinalPaymentAmounts,
  computeOpenAmounts,
  type InvoiceDepositRow,
} from './shared/depositAggregateUtils.js';

/** The (invoices LEFT JOIN invoice_deposits) column set the money helpers read (InvoiceDepositRow). */
const RECORD_ROW_COLUMNS = {
  invoice_id: invoices.id,
  invoice_amount: invoices.amount,
  invoice_status: invoices.status,
  deposit_id: invoiceDeposits.id,
  deposit_amount: invoiceDeposits.amount,
  deposit_status: invoiceDeposits.status,
  deposit_entry_type: invoiceDeposits.entryType,
};

/**
 * The money service's per-record figures (ADR-039), shared by list rows and the detail.
 * `recordRows` are the record's own (invoices LEFT JOIN invoice_deposits) rows.
 */
export function toRecordMoney(
  recordRows: InvoiceDepositRow[],
  invoiceId: string,
  status: InvoiceStatus,
  notYetSplit: boolean,
): InvoiceRecordMoney {
  const payments = computePayments(recordRows);
  return {
    openAmount: computeOpenAmounts(recordRows).byInvoice.get(invoiceId) ?? 0,
    paid: toMajor(payments.paidCents),
    remainingOnOffer:
      status === 'quotation' ? toMajor(payments.offers.remainingOnOfferCents) : null,
    notYetSplit,
  };
}

type DbType = BetterSQLite3Database<typeof schemaTypes>;

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
 * Resolves deposits via invoiceDepositService.
 * If knownVendorName is provided, skips the vendor DB lookup.
 */
export function toInvoice(
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

  // Fetch deposits for this invoice, ordered by dueDate then createdAt
  const depositRows = db
    .select()
    .from(invoiceDeposits)
    .where(eq(invoiceDeposits.invoiceId, row.id))
    .orderBy(asc(invoiceDeposits.dueDate), asc(invoiceDeposits.createdAt))
    .all();

  const deposits = depositRows.map((depositRow) => {
    const depositCreatedByUser = depositRow.createdBy
      ? db.select().from(users).where(eq(users.id, depositRow.createdBy)).get()
      : null;

    return {
      id: depositRow.id,
      invoiceId: depositRow.invoiceId,
      amount: depositRow.amount,
      dueDate: depositRow.dueDate,
      paidDate: depositRow.paidDate,
      claimedDate: depositRow.claimedDate,
      description: depositRow.description,
      status: depositRow.status,
      entryType: depositRow.entryType,
      budgetSourceId: depositRow.budgetSourceId,
      createdBy: toUserSummary(depositCreatedByUser),
      createdAt: depositRow.createdAt,
      updatedAt: depositRow.updatedAt,
    };
  });

  // Compute finalPaymentAmount using refund-aware formula
  const finalPaymentAmount = computeFinalPaymentAmount(
    row.amount,
    depositRows.map((d) => ({ amount: d.amount, status: d.status, entryType: d.entryType })),
  );

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
    deposits,
    finalPaymentAmount,
    createdBy: toUserSummary(createdByUser),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Assert that a vendor exists, throwing NotFoundError if not.
 * Returns the vendor name so callers can pass it to toInvoice() without an extra lookup.
 */
export function assertVendorExists(db: DbType, vendorId: string): string {
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
 * The one definition of "To pay" (an open item, story #2046 / MNY-055): the invoice is itself
 * pending, OR it has at least one pending deposit (of either entryType) - a pending refund alone
 * qualifies. Used by the `openOnly` list filter and by the chip counts.
 */
function openItemCondition(): SQL {
  return sql`(${invoices.status} = 'pending' OR EXISTS (
        SELECT 1 FROM invoice_deposits d
        WHERE d.invoice_id = ${invoices.id} AND d.status = 'pending'
      ))`;
}

/**
 * Counts per list chip in ONE pass over invoices joined to vendors (EPIC-21 P4.2). The chips
 * overlap (To pay includes quotations with a pending progress payment), so a GROUP BY status
 * cannot produce them. `outside` counts the rows that are not in To pay.
 */
function countInvoiceChips(
  db: DbType,
  where: SQL | undefined,
): { tally: InvoiceChipTally; outside: InvoiceChipsOutsideToPay } {
  const open = openItemCondition();
  const countIf = (cond: SQL) => sql<number>`COALESCE(SUM(CASE WHEN ${cond} THEN 1 ELSE 0 END), 0)`;
  const isOffer = sql`${invoices.status} = 'quotation'`;
  const isPaid = sql`${invoices.status} = 'paid'`;
  const isSubmitted = sql`${invoices.status} = 'claimed'`;
  const notOpen = sql`NOT ${open}`;
  const row = db
    .select({
      all: sql<number>`COUNT(*)`,
      toPay: countIf(open),
      offers: countIf(isOffer),
      paid: countIf(isPaid),
      submitted: countIf(isSubmitted),
      outAll: countIf(notOpen),
      outOffers: countIf(sql`${isOffer} AND ${notOpen}`),
      outPaid: countIf(sql`${isPaid} AND ${notOpen}`),
      outSubmitted: countIf(sql`${isSubmitted} AND ${notOpen}`),
    })
    .from(invoices)
    .innerJoin(vendors, eq(invoices.vendorId, vendors.id))
    .where(where)
    .get();
  return {
    tally: {
      toPay: row!.toPay,
      offers: row!.offers,
      paid: row!.paid,
      submitted: row!.submitted,
      all: row!.all,
    },
    outside: {
      offers: row!.outOffers,
      paid: row!.outPaid,
      submitted: row!.outSubmitted,
      all: row!.outAll,
    },
  };
}

/**
 * Ids of the records that are "Not yet split" (ADR-039): toCents(amount) minus the sum of
 * toCents(itemized) over its links is at least NOT_YET_SPLIT_MIN_CENTS. The same rule as the
 * money engine; feeds the `notYetSplit` filter and row field.
 */
export function notYetSplitInvoiceIds(db: DbType): Set<string> {
  const itemizedByInvoice = new Map<string, number>();
  for (const link of loadInvoiceLinks(db)) {
    itemizedByInvoice.set(
      link.invoiceId,
      (itemizedByInvoice.get(link.invoiceId) ?? 0) + link.itemizedCents,
    );
  }
  const ids = new Set<string>();
  for (const row of db.select({ id: invoices.id, amount: invoices.amount }).from(invoices).all()) {
    if (toCents(row.amount) - (itemizedByInvoice.get(row.id) ?? 0) >= NOT_YET_SPLIT_MIN_CENTS) {
      ids.add(row.id);
    }
  }
  return ids;
}

/** Most ids one `ids` request may name (and the page size of an `ids` response). */
const MAX_LIST_IDS = 100;

/**
 * List all invoices across all vendors with pagination, filtering, sorting, and a status summary.
 * `q` matches the invoice number, the company (vendor) name, or the invoice description (notes).
 */
export function listAllInvoices(
  db: DbType,
  query: {
    page?: number;
    pageSize?: number;
    q?: string;
    status?: InvoiceStatus;
    vendorId?: string;
    amountMin?: number;
    amountMax?: number;
    dateFrom?: string;
    dateTo?: string;
    dueDateFrom?: string;
    dueDateTo?: string;
    sortBy?: InvoiceListSort;
    sortOrder?: 'asc' | 'desc';
    openOnly?: boolean;
    notYetSplit?: boolean;
    withoutDocument?: boolean;
    refundsDue?: boolean;
    due?: boolean;
    ids?: string;
  },
): {
  invoices: InvoiceListRow[];
  pagination: PaginationMeta;
  summary: InvoiceStatusBreakdown;
  filterMeta: FilterMeta;
  chipCounts: InvoiceChipCounts;
  listTotals: InvoiceListTotals;
} {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 25));
  const sortOrder = query.sortOrder ?? 'desc';
  const openOnly = query.openOnly === true;

  // `ids`: usable ids only (trimmed, non-empty); narrows just the rows and the pagination.
  const idList = (query.ids ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
  if (idList.length > MAX_LIST_IDS) {
    throw new ValidationError(`ids accepts at most ${MAX_LIST_IDS} ids`);
  }
  const byIds = idList.length > 0;
  const notYetSplitSet = notYetSplitInvoiceIds(db);

  // Filter conditions shared by the rows and the chip counts (everything except status,
  // openOnly and the numeric amount range).
  const filterConditions: SQL[] = [];
  if (query.vendorId) {
    filterConditions.push(eq(invoices.vendorId, query.vendorId));
  }
  if (query.q) {
    const pattern = toLikeContainsPattern(query.q);
    filterConditions.push(
      sql`(LOWER(${invoices.invoiceNumber}) LIKE LOWER(${pattern}) ESCAPE '\\' OR LOWER(${vendors.name}) LIKE LOWER(${pattern}) ESCAPE '\\' OR LOWER(${invoices.notes}) LIKE LOWER(${pattern}) ESCAPE '\\')`,
    );
  }
  if (query.dateFrom) {
    filterConditions.push(gte(invoices.date, query.dateFrom));
  }
  if (query.dateTo) {
    filterConditions.push(lte(invoices.date, query.dateTo));
  }
  if (query.dueDateFrom) {
    filterConditions.push(gte(invoices.dueDate, query.dueDateFrom));
  }
  if (query.dueDateTo) {
    filterConditions.push(lte(invoices.dueDate, query.dueDateTo));
  }
  if (query.notYetSplit) {
    filterConditions.push(
      sql`${invoices.id} IN (SELECT value FROM json_each(${JSON.stringify([...notYetSplitSet])}))`,
    );
  }
  if (query.withoutDocument) {
    filterConditions.push(
      sql`NOT EXISTS (SELECT 1 FROM document_links dl WHERE dl.entity_type = 'invoice' AND dl.entity_id = ${invoices.id})`,
    );
  }
  if (query.refundsDue) {
    filterConditions.push(
      sql`EXISTS (SELECT 1 FROM invoice_deposits d WHERE d.invoice_id = ${invoices.id} AND d.entry_type = 'refund' AND d.status = 'pending')`,
    );
  }
  if (query.due) {
    // No lower bound: overdue items count. Refunds never match.
    const dueLimit = sql`date('now', 'localtime', ${`+${PAYMENT_DUE_WINDOW_DAYS} days`})`;
    filterConditions.push(
      sql`((${invoices.status} = 'pending' AND ${invoices.dueDate} IS NOT NULL AND ${invoices.dueDate} <= ${dueLimit}) OR EXISTS (SELECT 1 FROM invoice_deposits d WHERE d.invoice_id = ${invoices.id} AND d.status = 'pending' AND d.entry_type = 'deposit' AND d.due_date <= ${dueLimit}))`,
    );
  }
  // Base conditions = filters + status + openOnly (excluding the numeric amount range).
  // openOnly (story #2046 AC1/AC2) sits in baseConditions, not just `conditions`, so
  // filterMeta's amount bounds reflect the open set being viewed, like `status`.
  const baseConditions: SQL[] = [...filterConditions];
  if (query.status) {
    baseConditions.push(eq(invoices.status, query.status));
  }
  if (openOnly) {
    baseConditions.push(openItemCondition());
  }

  const baseWhereClause = baseConditions.length > 0 ? and(...baseConditions) : undefined;

  // Compute filterMeta from base conditions
  const metaRow = db
    .select({
      amountMin: sql<number>`COALESCE(MIN(${invoices.amount}), 0)`,
      amountMax: sql<number>`COALESCE(MAX(${invoices.amount}), 0)`,
    })
    .from(invoices)
    .innerJoin(vendors, eq(invoices.vendorId, vendors.id))
    .where(baseWhereClause)
    .get();

  // Build full conditions with numeric amount range filter for main query
  const amountConditions: SQL[] = [];
  if (query.amountMin !== undefined) {
    amountConditions.push(gte(invoices.amount, query.amountMin));
  }
  if (query.amountMax !== undefined) {
    amountConditions.push(lte(invoices.amount, query.amountMax));
  }
  const conditions = [...baseConditions, ...amountConditions];

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Rows and pagination are additionally narrowed by `ids`; nothing else is.
  const rowWhereClause = byIds ? and(whereClause, inArray(invoices.id, idList)) : whereClause;

  // Count total
  const countResult = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(invoices)
    .innerJoin(vendors, eq(invoices.vendorId, vendors.id))
    .where(rowWhereClause)
    .get();
  const totalItems = countResult!.count;
  const effectivePageSize = byIds ? MAX_LIST_IDS : pageSize;
  const totalPages = byIds ? (totalItems > 0 ? 1 : 0) : Math.ceil(totalItems / pageSize);

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
            : query.sortBy === 'invoice_number'
              ? invoices.invoiceNumber
              : invoices.date; // default: date
  const direction = sortOrder === 'asc' ? asc(sortColumn) : desc(sortColumn);
  // Empty due dates and invoice numbers sort last in both directions; id is the unique tiebreaker.
  const nullsLast = query.sortBy === 'due_date' || query.sortBy === 'invoice_number';
  const orderBy = nullsLast
    ? [asc(sql`${sortColumn} IS NULL`), direction, asc(invoices.id)]
    : [direction, asc(invoices.id)];

  // Story #2046 (AC22/AC23): earliest-open-due ordering, used as the default order
  // when openOnly=true and no explicit sortBy is given. SQLite's scalar MIN(a, b)
  // returns NULL if either argument is NULL, whereas the aggregate MIN() in the
  // subquery ignores NULLs — the '9999-12-31' sentinel makes both branches non-null
  // so undated items sort last under ASC. ISO YYYY-MM-DD strings compare
  // lexicographically, so no date casting is needed. invoice_deposits.due_date is
  // NOT NULL, so the subquery is NULL only when there are no pending deposits.
  const earliestOpenDue = sql<string>`MIN(
    COALESCE(CASE WHEN ${invoices.status} = 'pending' THEN ${invoices.dueDate} END, '9999-12-31'),
    COALESCE((SELECT MIN(d.due_date) FROM invoice_deposits d
               WHERE d.invoice_id = ${invoices.id} AND d.status = 'pending'), '9999-12-31')
  )`;
  const useOpenDefaultOrder = openOnly && !query.sortBy;

  // Fetch page with JOIN for vendorName
  const offset = (page - 1) * pageSize;
  const rows = db
    .select({
      invoice: invoices,
      vendorName: vendors.name,
    })
    .from(invoices)
    .innerJoin(vendors, eq(invoices.vendorId, vendors.id))
    .where(rowWhereClause)
    .orderBy(...(useOpenDefaultOrder ? [asc(earliestOpenDue), asc(invoices.id)] : orderBy))
    .limit(effectivePageSize)
    .offset(byIds ? 0 : offset)
    .all();

  // Compute deposit-aware GLOBAL summary across ALL invoices (filter-independent).
  // The page filters only narrow the listed rows; the header summary always shows totals
  // across the entire dataset so users can see what the other filter values would yield.
  const summaryRawRows = db
    .select(RECORD_ROW_COLUMNS)
    .from(invoices)
    .leftJoin(invoiceDeposits, eq(invoiceDeposits.invoiceId, invoices.id))
    .all();

  const aggregated = aggregateInvoiceStatusBreakdown(summaryRawRows);
  const quotationCoveredByDeposits = computeQuotationCoveredByDeposits(summaryRawRows);
  // Ready to submit has one definition (ADR-039 §5): the money service's draw-down set.
  const readyToSubmit = getReadyToSubmit(db);
  const claimable = { count: readyToSubmit.count, totalAmount: readyToSubmit.amount };
  const finalPaymentAmountsByInvoice = computeFinalPaymentAmounts(summaryRawRows);
  // Story #2046 (AC14/AC16/AC19): the summaryRawRows query already spans every
  // invoice, so it is a superset of InvoiceDepositRow and can be passed straight in.
  const openAmounts = computeOpenAmounts(summaryRawRows);

  // Compute overdue count + total: pending invoices with due_date < today (global, unfiltered)
  const overdueRow = db
    .select({
      count: sql<number>`COUNT(*)`,
      totalAmount: sql<number>`COALESCE(SUM(${invoices.amount}), 0)`,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.status, 'pending'),
        sql`${invoices.dueDate} IS NOT NULL`,
        sql`${invoices.dueDate} < date('now', 'localtime')`,
      ),
    )
    .get();

  const defaultSummary: InvoiceStatusSummary = { count: 0, totalAmount: 0 };
  const summary: InvoiceStatusBreakdown = {
    pending: aggregated['pending'] ?? { ...defaultSummary },
    paid: aggregated['paid'] ?? { ...defaultSummary },
    claimed: aggregated['claimed'] ?? { ...defaultSummary },
    quotation: aggregated['quotation'] ?? { ...defaultSummary },
    overdue: {
      count: overdueRow!.count,
      totalAmount: overdueRow!.totalAmount,
    },
    claimable,
    quotationCoveredByDeposits,
    openPayable: openAmounts.openPayable,
    refundsDue: openAmounts.refundsDue,
  };

  // Bulk-fetch full deposit rows for the invoices on the current page (every request), so the
  // response can render deposits as child rows. Mapped exactly as toInvoice() does (ordering + createdBy resolution),
  // since the client derives the "Deposit n/N" ordinal from this order.
  const pageInvoiceIds = rows.map((r) => r.invoice.id);
  const depositsByInvoice = new Map<string, InvoiceDeposit[]>();
  if (pageInvoiceIds.length > 0) {
    const depositRows = db
      .select()
      .from(invoiceDeposits)
      .where(inArray(invoiceDeposits.invoiceId, pageInvoiceIds))
      .orderBy(asc(invoiceDeposits.dueDate), asc(invoiceDeposits.createdAt))
      .all();

    // Memoise createdBy user lookups (one query per distinct user id, not per row).
    const userCache = new Map<string, UserSummary | null>();
    const resolveCreatedBy = (createdBy: string | null): UserSummary | null => {
      if (!createdBy) return null;
      const cached = userCache.get(createdBy);
      if (cached !== undefined) return cached;
      const user = db.select().from(users).where(eq(users.id, createdBy)).get();
      const summary = toUserSummary(user);
      userCache.set(createdBy, summary);
      return summary;
    };

    for (const depositRow of depositRows) {
      const list = depositsByInvoice.get(depositRow.invoiceId) ?? [];
      list.push({
        id: depositRow.id,
        invoiceId: depositRow.invoiceId,
        amount: depositRow.amount,
        dueDate: depositRow.dueDate,
        paidDate: depositRow.paidDate,
        claimedDate: depositRow.claimedDate,
        description: depositRow.description,
        status: depositRow.status,
        entryType: depositRow.entryType,
        budgetSourceId: depositRow.budgetSourceId,
        createdBy: resolveCreatedBy(depositRow.createdBy),
        createdAt: depositRow.createdAt,
        updatedAt: depositRow.updatedAt,
      });
      depositsByInvoice.set(depositRow.invoiceId, list);
    }
  }

  // Map rows directly (not using toInvoice()) to avoid fetching full deposits in list.
  // NOTE: List rows carry the full deposits list, openAmount, paid, remainingOnOffer and
  // notYetSplit; finalPaymentAmount is refund-aware (computed from the summary query).
  // If new Invoice fields are added, ensure they are updated in BOTH toInvoice() (for detail endpoints)
  // AND here (for list endpoints).
  // Per-record figures are the money service's own (computePayments on the record's rows).
  const rawRowsByInvoice = new Map<string, typeof summaryRawRows>();
  for (const raw of summaryRawRows) {
    const list = rawRowsByInvoice.get(raw.invoice_id) ?? [];
    list.push(raw);
    rawRowsByInvoice.set(raw.invoice_id, list);
  }
  const invoiceList: InvoiceListRow[] = rows.map(({ invoice: row, vendorName: vName }) => {
    const createdByUser = row.createdBy
      ? db.select().from(users).where(eq(users.id, row.createdBy)).get()
      : null;

    const { budgetLines, remainingAmount } = getInvoiceBudgetLinesForInvoice(
      db,
      row.id,
      row.amount,
    );

    return {
      id: row.id,
      vendorId: row.vendorId,
      vendorName: vName,
      invoiceNumber: row.invoiceNumber,
      amount: row.amount,
      date: row.date,
      dueDate: row.dueDate,
      status: row.status as InvoiceStatus,
      notes: row.notes,
      budgetLines,
      remainingAmount,
      deposits: depositsByInvoice.get(row.id) ?? [],
      finalPaymentAmount: finalPaymentAmountsByInvoice.get(row.id)!,
      ...toRecordMoney(
        rawRowsByInvoice.get(row.id)!,
        row.id,
        row.status as InvoiceStatus,
        notYetSplitSet.has(row.id),
      ),
      createdBy: toUserSummary(createdByUser),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  });

  const filterMeta: FilterMeta = {
    amount: { min: metaRow!.amountMin, max: metaRow!.amountMax },
  };

  // Chip counts (EPIC-21 P4.2): "matching" ignores status/openOnly, "totals" ignores everything.
  const matchingConditions = [...filterConditions, ...amountConditions];
  const matching = countInvoiceChips(
    db,
    matchingConditions.length > 0 ? and(...matchingConditions) : undefined,
  );
  const totals = countInvoiceChips(db, undefined);
  const chipCounts: InvoiceChipCounts = {
    matching: matching.tally,
    outsideToPay: matching.outside,
    totals: totals.tally,
  };

  // List totals over every matching row on all pages (`ids` is ignored).
  const matchingIds = new Set(
    db
      .select({ id: invoices.id })
      .from(invoices)
      .innerJoin(vendors, eq(invoices.vendorId, vendors.id))
      .where(whereClause)
      .all()
      .map((r) => r.id),
  );
  const matchingRawRows = summaryRawRows.filter((r) => matchingIds.has(r.invoice_id));
  const listTotals: InvoiceListTotals = {
    openPayable: computeOpenAmounts(matchingRawRows).openPayable,
    offers: toOfferTotals(computePayments(matchingRawRows).offers),
  };

  return {
    invoices: invoiceList,
    pagination: { page: byIds ? 1 : page, pageSize: effectivePageSize, totalItems, totalPages },
    summary,
    filterMeta,
    chipCounts,
    listTotals,
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
 * Get a single invoice with the money service's per-record figures (GET /api/invoices/:id).
 * @throws NotFoundError if invoice does not exist
 */
export function getInvoiceDetail(db: DbType, invoiceId: string): InvoiceDetail {
  const row = db.select().from(invoices).where(eq(invoices.id, invoiceId)).get();
  if (!row) {
    throw new NotFoundError('Invoice not found');
  }
  const rows = db
    .select(RECORD_ROW_COLUMNS)
    .from(invoices)
    .leftJoin(invoiceDeposits, eq(invoiceDeposits.invoiceId, invoices.id))
    .where(eq(invoices.id, invoiceId))
    .all();
  return {
    ...toInvoice(db, row),
    ...toRecordMoney(
      rows,
      row.id,
      row.status as InvoiceStatus,
      notYetSplitInvoiceIds(db).has(row.id),
    ),
  };
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
 * If vendorId is provided, reassigns the invoice to the new vendor.
 * @throws NotFoundError if vendor or invoice not found, or if invoice doesn't belong to vendor
 * @throws ValidationError if any provided field is invalid
 * @throws ItemizedSumExceedsInvoiceError if a decreased amount is below the itemized total
 *
 * @param db - Database connection
 * @param vendorId - Vendor ID (source vendor, from path param)
 * @param invoiceId - Invoice ID
 * @param data - Update request data (may include target vendorId)
 * @param ctx - Event context for the status system event (acting user; undoable for PATCH routes)
 */
export function updateInvoice(
  db: DbType,
  vendorId: string,
  invoiceId: string,
  data: UpdateInvoiceRequest,
  ctx: EventContext = SYSTEM_CONTEXT,
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

  // Validate and apply target vendor if provided
  let targetVendorName = vendorName;
  if (data.vendorId !== undefined) {
    if (data.vendorId !== existing.vendorId) {
      // Validate target vendor exists before applying any updates
      targetVendorName = assertVendorExists(db, data.vendorId);
      updates.vendorId = data.vendorId;
    }
  }

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

  db.transaction((tx) => {
    // Decreasing must not strand itemized amounts (#2108); deposits are never checked (#2188)
    if (data.amount !== undefined && toCents(data.amount) < toCents(existing.amount)) {
      const itemizedRow = tx
        .select({ sum: sql<number>`COALESCE(SUM(${invoiceBudgetLines.itemizedAmount}), 0)` })
        .from(invoiceBudgetLines)
        .where(eq(invoiceBudgetLines.invoiceId, invoiceId))
        .get();
      const itemizedTotal = itemizedRow!.sum;
      if (exceedsAmount(itemizedTotal, data.amount)) {
        throw new ItemizedSumExceedsInvoiceError(
          `Sum of itemized amounts (${itemizedTotal}) would exceed invoice total (${data.amount})`,
          { invoiceTotal: data.amount, itemizedTotal },
        );
      }
    }

    tx.update(invoices).set(updates).where(eq(invoices.id, invoiceId)).run();
  });

  // Log status change as a system event
  if (statusChanged && previousStatus !== undefined && newStatus !== undefined) {
    onInvoiceStatusChanged(db, invoiceId, existing.invoiceNumber, previousStatus, newStatus, ctx, {
      amount: data.amount ?? existing.amount,
    });
  }

  const updated = db.select().from(invoices).where(eq(invoices.id, invoiceId)).get()!;
  return toInvoice(db, updated, targetVendorName);
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
