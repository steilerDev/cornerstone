/**
 * Household item service — CRUD operations for household items.
 *
 * EPIC-04: Household Items & Furniture Management
 *
 * Handles create, read, update, delete, and list operations for household items,
 * including tag management (with replace-all semantics), vendor linking, budget
 * line aggregation, and document link cleanup on deletion.
 */

import { randomUUID } from 'node:crypto';
import { eq, sql, and, or, inArray, isNull, gte, lte } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import {
  householdItems,
  householdItemCategories,
  users,
  vendors,
  householdItemBudgets,
  householdItemSubsidies,
  subsidyPrograms,
  invoices,
  invoiceBudgetLines,
} from '../db/schema.js';
import { toLikeContainsPattern } from './shared/likePattern.js';
import { deleteLinksForEntity } from './documentLinkService.js';
import { listDeps } from './householdItemDepService.js';
import { autoReschedule } from './schedulingEngine.js';
import { getExpectedGrantsByHouseholdItem, getHouseholdItemListMoney } from './moneyService.js';
import { toCents } from './shared/money.js';
import { toMajor } from './shared/moneyEngine.js';
import { getAreaSummary, loadAreaMap, resolveAreaFilter } from './areaService.js';
import type { AreaMapEntry } from './areaService.js';
import { toUserSummary, toVendorSummaryWithTrade } from './shared/converters.js';
import { validateVendorId, validateAreaId } from './shared/validators.js';
import { loadGrantChips } from './shared/itemGrantChips.js';
import { HOUSEHOLD_ITEM_STATUSES } from '@cornerstone/shared';
import type {
  HouseholdItemDetail,
  HouseholdItemSummary,
  HouseholdItemCategory,
  HouseholdItemStatus,
  HouseholdItemSubsidySummary,
  HouseholdItemBudgetAggregate,
  CreateHouseholdItemRequest,
  UpdateHouseholdItemRequest,
  HouseholdItemListQuery,
  HouseholdItemListRow,
  HouseholdItemListRowsResponse,
  HouseholdItemListSort,
} from '@cornerstone/shared';
import { NotFoundError, ValidationError } from '../errors/AppError.js';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

/**
 * Fetch subsidy programs linked to a household item.
 */
function getHouseholdItemSubsidies(
  db: DbType,
  householdItemId: string,
): HouseholdItemSubsidySummary[] {
  const rows = db
    .select({ subsidy: subsidyPrograms })
    .from(householdItemSubsidies)
    .innerJoin(subsidyPrograms, eq(subsidyPrograms.id, householdItemSubsidies.subsidyProgramId))
    .where(eq(householdItemSubsidies.householdItemId, householdItemId))
    .all();

  return rows.map((row) => ({
    id: row.subsidy.id,
    name: row.subsidy.name,
    reductionType: row.subsidy.reductionType as 'percentage' | 'fixed',
    reductionValue: row.subsidy.reductionValue,
    applicationStatus: row.subsidy.applicationStatus,
  }));
}

/**
 * Count budget lines for a household item.
 */
function getBudgetLineCount(db: DbType, householdItemId: string): number {
  const result = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(householdItemBudgets)
    .where(eq(householdItemBudgets.householdItemId, householdItemId))
    .get();
  return result!.count;
}

/**
 * SQL fragment for the VAT-effective planned amount of a household_item_budgets row.
 * Mirrors effectivePlannedAmount(): net lines (includes_vat = 0) are grossed up by (1 + vatRate)
 * and rounded to cents. vatRate is a bound parameter. Column names are unqualified, so this must
 * be used inside a query/subquery whose only source of these columns is household_item_budgets.
 */
function effectivePlannedSql(vatRate: number) {
  return sql`CASE WHEN includes_vat = 0 THEN ROUND(planned_amount * (1 + ${vatRate}) * 100) / 100.0 ELSE planned_amount END`;
}

/**
 * Sum total VAT-effective planned amount from budget lines for a household item.
 */
function getTotalPlannedAmount(db: DbType, householdItemId: string, vatRate: number): number {
  const result = db
    .select({ total: sql<number>`COALESCE(SUM(${effectivePlannedSql(vatRate)}), 0)` })
    .from(householdItemBudgets)
    .where(eq(householdItemBudgets.householdItemId, householdItemId))
    .get();
  return result!.total;
}

/**
 * Sum total actual amount from invoices linked to household item budget lines.
 */
function getTotalActualAmount(db: DbType, householdItemId: string): number {
  // EPIC-15: Join through invoiceBudgetLines junction table instead of direct FK
  const result = db
    .select({ total: sql<number>`COALESCE(SUM(${invoiceBudgetLines.itemizedAmount}), 0)` })
    .from(invoiceBudgetLines)
    .innerJoin(invoices, eq(invoices.id, invoiceBudgetLines.invoiceId))
    .innerJoin(
      householdItemBudgets,
      eq(invoiceBudgetLines.householdItemBudgetId, householdItemBudgets.id),
    )
    .where(eq(householdItemBudgets.householdItemId, householdItemId))
    .get();
  return result!.total;
}

/**
 * Compute the budget aggregates for a household item.
 * `subsidyReduction` is the item's counted expected grant share from the money service.
 */
function getBudgetSummary(
  db: DbType,
  householdItemId: string,
  vatRate: number,
  expectedGrants?: Map<string, number>,
): HouseholdItemBudgetAggregate {
  const totalPlanned = getTotalPlannedAmount(db, householdItemId, vatRate);
  const totalActual = getTotalActualAmount(db, householdItemId);
  // The item's counted grant share, expected scenario (money service, ADR-039). Lists pass a map
  // computed once per request; a single item computes it on demand.
  const subsidyReduction =
    (expectedGrants ?? getExpectedGrantsByHouseholdItem(db, vatRate)).get(householdItemId) ?? 0;
  const netCost = totalPlanned - subsidyReduction;

  return {
    totalPlanned,
    totalActual,
    subsidyReduction,
    netCost,
  };
}

/**
 * Convert database household item row to HouseholdItemSummary shape.
 */
export function toHouseholdItemSummary(
  db: DbType,
  item: typeof householdItems.$inferSelect,
  areaMap: Map<string, AreaMapEntry>,
  vatRate: number,
  expectedGrants?: Map<string, number>,
): HouseholdItemSummary {
  const vendor = item.vendorId
    ? db.select().from(vendors).where(eq(vendors.id, item.vendorId)).get()!
    : null;

  const createdByUser = item.createdBy
    ? db.select().from(users).where(eq(users.id, item.createdBy)).get()!
    : null;

  const area = getAreaSummary(item.areaId, areaMap);

  return {
    id: item.id,
    name: item.name,
    description: item.description,
    category: item.categoryId as HouseholdItemCategory,
    status: item.status as HouseholdItemStatus,
    vendor: toVendorSummaryWithTrade(db, vendor),
    area,
    quantity: item.quantity,
    orderDate: item.orderDate,
    actualDeliveryDate: item.actualDeliveryDate,
    earliestDeliveryDate: item.earliestDeliveryDate,
    latestDeliveryDate: item.latestDeliveryDate,
    targetDeliveryDate: item.targetDeliveryDate,
    isLate: !!item.isLate,
    url: item.url,
    budgetLineCount: getBudgetLineCount(db, item.id),
    totalPlannedAmount: getTotalPlannedAmount(db, item.id, vatRate),
    budgetSummary: getBudgetSummary(db, item.id, vatRate, expectedGrants),
    createdBy: toUserSummary(createdByUser),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

/**
 * Convert database household item row to HouseholdItemDetail shape.
 */
export function toHouseholdItemDetail(
  db: DbType,
  item: typeof householdItems.$inferSelect,
  areaMap: Map<string, AreaMapEntry>,
  vatRate: number,
): HouseholdItemDetail {
  const summary = toHouseholdItemSummary(db, item, areaMap, vatRate);
  const dependencies = listDeps(db, item.id);
  const subsidies = getHouseholdItemSubsidies(db, item.id);

  return {
    ...summary,
    dependencies,
    subsidies,
  };
}

/**
 * Find a household item by ID.
 * Returns null if not found.
 */
function findHouseholdItemById(db: DbType, id: string): typeof householdItems.$inferSelect | null {
  return db.select().from(householdItems).where(eq(householdItems.id, id)).get() ?? null;
}

/**
 * Validate that household item category ID exists.
 * Throws ValidationError if category does not exist.
 */
function validateHouseholdItemCategoryId(db: DbType, categoryId: string): void {
  const category = db
    .select()
    .from(householdItemCategories)
    .where(eq(householdItemCategories.id, categoryId))
    .get();
  if (!category) {
    throw new ValidationError(`Household item category not found: ${categoryId}`);
  }
}

/**
 * Create a new household item.
 */
export function createHouseholdItem(
  db: DbType,
  userId: string,
  data: CreateHouseholdItemRequest,
  vatRate: number,
): HouseholdItemDetail {
  // Validate required fields
  if (!data.name || data.name.trim().length === 0) {
    throw new ValidationError('Name is required');
  }

  // Validate optional vendor if provided
  if (data.vendorId) {
    validateVendorId(db, data.vendorId);
  }

  // Validate optional category ID if provided, default to 'hic-other'
  const categoryId = data.category ?? 'hic-other';
  validateHouseholdItemCategoryId(db, categoryId);

  // Validate areaId if provided
  if (data.areaId) {
    validateAreaId(db, data.areaId);
  }

  // Cross-field validation: if both earliest and latest are provided, earliest <= latest
  if (data.earliestDeliveryDate && data.latestDeliveryDate) {
    if (data.earliestDeliveryDate > data.latestDeliveryDate) {
      throw new ValidationError(
        'Earliest delivery date must be before or equal to latest delivery date',
      );
    }
  }

  const id = randomUUID();
  const now = new Date().toISOString();

  db.insert(householdItems)
    .values({
      id,
      name: data.name.trim(),
      description: data.description ?? null,
      categoryId,
      status: data.status ?? 'planned',
      vendorId: data.vendorId ?? null,
      areaId: data.areaId ?? null,
      url: data.url ?? null,
      quantity: data.quantity ?? 1,
      orderDate: data.orderDate ?? null,
      actualDeliveryDate: data.actualDeliveryDate ?? null,
      earliestDeliveryDate: data.earliestDeliveryDate ?? null,
      latestDeliveryDate: data.latestDeliveryDate ?? null,
      targetDeliveryDate: null,
      isLate: false,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  // Fetch and return the created item
  const createdItem = findHouseholdItemById(db, id)!;
  const areaMap = loadAreaMap(db);
  return toHouseholdItemDetail(db, createdItem, areaMap, vatRate);
}

/**
 * Get a household item by ID.
 * Throws NotFoundError if not found.
 */
export function getHouseholdItemById(db: DbType, id: string, vatRate: number): HouseholdItemDetail {
  const item = findHouseholdItemById(db, id);
  if (!item) {
    throw new NotFoundError('Household item not found');
  }
  const areaMap = loadAreaMap(db);
  return toHouseholdItemDetail(db, item, areaMap, vatRate);
}

/**
 * Update a household item.
 * Throws NotFoundError if item does not exist.
 * Throws ValidationError if data is invalid.
 */
export function updateHouseholdItem(
  db: DbType,
  id: string,
  data: UpdateHouseholdItemRequest,
  vatRate: number,
): HouseholdItemDetail {
  const item = findHouseholdItemById(db, id);
  if (!item) {
    throw new NotFoundError('Household item not found');
  }

  // Validate vendor if provided
  if ('vendorId' in data && data.vendorId) {
    validateVendorId(db, data.vendorId);
  }

  // Validate category if provided
  if ('category' in data && data.category) {
    validateHouseholdItemCategoryId(db, data.category);
  }

  // Validate areaId if provided
  if ('areaId' in data && data.areaId) {
    validateAreaId(db, data.areaId);
  }

  // Cross-field validation: if both earliest and latest are provided, earliest <= latest
  const earliestFromData =
    'earliestDeliveryDate' in data ? data.earliestDeliveryDate : item.earliestDeliveryDate;
  const latestFromData =
    'latestDeliveryDate' in data ? data.latestDeliveryDate : item.latestDeliveryDate;
  if (earliestFromData && latestFromData) {
    if (earliestFromData > latestFromData) {
      throw new ValidationError(
        'Earliest delivery date must be before or equal to latest delivery date',
      );
    }
  }

  // Build update data
  const updateData: Partial<typeof householdItems.$inferInsert> = {};

  // Derive actualDeliveryDate: auto-set to today if status → 'arrived' and date not already set
  let resolvedActualDeliveryDate: string | null | undefined = undefined;
  if (data.status === 'arrived' && !('actualDeliveryDate' in data) && !item.actualDeliveryDate) {
    resolvedActualDeliveryDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  }

  if ('name' in data) {
    if (!data.name || data.name.trim().length === 0) {
      throw new ValidationError('Name cannot be empty');
    }
    updateData.name = data.name.trim();
  }

  if ('description' in data) {
    updateData.description = data.description ?? null;
  }

  if ('category' in data) {
    updateData.categoryId = data.category;
  }

  if ('status' in data) {
    updateData.status = data.status;
  }

  if ('vendorId' in data) {
    updateData.vendorId = data.vendorId ?? null;
  }

  if ('url' in data) {
    updateData.url = data.url ?? null;
  }

  if ('areaId' in data) {
    updateData.areaId = data.areaId ?? null;
  }

  if ('quantity' in data) {
    updateData.quantity = data.quantity;
  }

  if ('orderDate' in data) {
    updateData.orderDate = data.orderDate ?? null;
  }

  if ('earliestDeliveryDate' in data) {
    updateData.earliestDeliveryDate = data.earliestDeliveryDate ?? null;
  }

  if ('latestDeliveryDate' in data) {
    updateData.latestDeliveryDate = data.latestDeliveryDate ?? null;
  }

  if ('actualDeliveryDate' in data) {
    updateData.actualDeliveryDate = data.actualDeliveryDate ?? null;
  } else if (resolvedActualDeliveryDate !== undefined) {
    updateData.actualDeliveryDate = resolvedActualDeliveryDate;
  }

  // Always update updatedAt
  updateData.updatedAt = new Date().toISOString();

  // Update household item
  db.update(householdItems).set(updateData).where(eq(householdItems.id, id)).run();

  // Trigger auto-reschedule when any scheduling-relevant field changed.
  const schedulingFieldChanged =
    'earliestDeliveryDate' in data ||
    'latestDeliveryDate' in data ||
    'actualDeliveryDate' in data ||
    'status' in data;

  if (schedulingFieldChanged) {
    autoReschedule(db);
  }

  // Fetch and return the updated item
  const updatedItem = findHouseholdItemById(db, id)!;
  const areaMap = loadAreaMap(db);
  return toHouseholdItemDetail(db, updatedItem, areaMap, vatRate);
}

/**
 * Delete a household item.
 * Throws NotFoundError if item does not exist.
 */
export function deleteHouseholdItem(db: DbType, id: string): void {
  const item = findHouseholdItemById(db, id);
  if (!item) {
    throw new NotFoundError('Household item not found');
  }

  // Cascade delete document links (polymorphic FK, enforced at app layer)
  deleteLinksForEntity(db, 'household_item', id);

  db.delete(householdItems).where(eq(householdItems.id, id)).run();
}

/** One purchase while the list is filtered, sorted and grouped in memory. */
interface ListEntry {
  row: typeof householdItems.$inferSelect;
  /** Engine expected cost; null when the purchase has no cost lines. */
  expectedCost: number | null;
  grants: number;
  paid: number;
  invoiced: number;
}

type SortKey = string | number | null;

/** `afterGrants` in major units, rounded in cents; null when there is no expected cost. */
function afterGrantsOf(expectedCost: number | null, grants: number): number | null {
  return expectedCost === null ? null : toMajor(toCents(expectedCost) - toCents(grants));
}

/** The value a list sort orders by. */
function sortKeyOf(entry: ListEntry, sortBy: HouseholdItemListSort): SortKey {
  const { row } = entry;
  switch (sortBy) {
    case 'name':
      return row.name;
    case 'category':
      return row.categoryId;
    case 'status':
      // Lifecycle order (planned … arrived), not alphabetical
      return HOUSEHOLD_ITEM_STATUSES.indexOf(row.status as HouseholdItemStatus);
    case 'order_date':
      return row.orderDate;
    case 'target_delivery_date':
      return row.targetDeliveryDate;
    case 'actual_delivery_date':
      return row.actualDeliveryDate;
    case 'delivery':
      return row.actualDeliveryDate ?? row.targetDeliveryDate;
    case 'expected_cost':
      return entry.expectedCost;
    case 'invoiced':
      return entry.invoiced;
    case 'updated_at':
      return row.updatedAt;
    case 'created_at':
      return row.createdAt;
  }
}

/** Orders two sort keys ascending; the caller handles nulls (always last) and direction. */
function compareKeys(a: string | number, b: string | number): number {
  return typeof a === 'string' ? a.localeCompare(b as string) : a - (b as number);
}

function inRange(value: number, min: number | undefined, max: number | undefined): boolean {
  return (min === undefined || value >= min) && (max === undefined || value <= max);
}

/**
 * Purchases list rows (#2246): filters, sorts and groups over the whole matching set, so the
 * totals, the status group counts and the engine-valued filters/sorts cover every row, not just
 * the page. Money comes from one money-service run.
 */
export function listHouseholdItemRows(
  db: DbType,
  query: HouseholdItemListQuery,
  opts: { vatRate: number },
): HouseholdItemListRowsResponse {
  const { vatRate } = opts;
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 25));
  const sortBy = query.sortBy ?? 'created_at';
  const sortOrder = query.sortOrder ?? 'desc';

  const conditions = [];

  if (query.category) {
    conditions.push(eq(householdItems.categoryId, query.category));
  }

  if (query.status) {
    conditions.push(eq(householdItems.status, query.status));
  }

  if (query.vendorId) {
    conditions.push(eq(householdItems.vendorId, query.vendorId));
  }

  if (query.areaId) {
    const { areaIds, includeNull, hasInput } = resolveAreaFilter(db, query.areaId);
    if (includeNull && areaIds.length > 0) {
      conditions.push(or(isNull(householdItems.areaId), inArray(householdItems.areaId, areaIds))!);
    } else if (includeNull) {
      conditions.push(isNull(householdItems.areaId));
    } else if (areaIds.length > 0) {
      conditions.push(inArray(householdItems.areaId, areaIds));
    } else if (hasInput) {
      // User supplied ID(s) but all were unknown — yield empty result
      conditions.push(sql`1 = 0`);
    }
    // else: no meaningful input (empty/whitespace-only CSV) — skip filter
  }

  if (query.q) {
    const pattern = toLikeContainsPattern(query.q);
    conditions.push(
      or(
        sql`LOWER(${householdItems.name}) LIKE LOWER(${pattern}) ESCAPE '\\'`,
        sql`LOWER(${householdItems.description}) LIKE LOWER(${pattern}) ESCAPE '\\'`,
      )!,
    );
  }

  // Delivery date ranges (inclusive; purchases without the date never match a set bound)
  if (query.targetDeliveryFrom !== undefined) {
    conditions.push(gte(householdItems.targetDeliveryDate, query.targetDeliveryFrom));
  }
  if (query.targetDeliveryTo !== undefined) {
    conditions.push(lte(householdItems.targetDeliveryDate, query.targetDeliveryTo));
  }
  if (query.actualDeliveryFrom !== undefined) {
    conditions.push(gte(householdItems.actualDeliveryDate, query.actualDeliveryFrom));
  }
  if (query.actualDeliveryTo !== undefined) {
    conditions.push(lte(householdItems.actualDeliveryDate, query.actualDeliveryTo));
  }

  // Cost-line count and planned / invoiced amount ranges
  if (query.budgetLinesMin !== undefined) {
    conditions.push(
      sql`(SELECT COUNT(*) FROM ${householdItemBudgets} WHERE ${householdItemBudgets.householdItemId} = ${householdItems.id}) >= ${query.budgetLinesMin}`,
    );
  }
  if (query.budgetLinesMax !== undefined) {
    conditions.push(
      sql`(SELECT COUNT(*) FROM ${householdItemBudgets} WHERE ${householdItemBudgets.householdItemId} = ${householdItems.id}) <= ${query.budgetLinesMax}`,
    );
  }
  if (query.plannedCostMin !== undefined) {
    conditions.push(
      sql`COALESCE((SELECT SUM(${effectivePlannedSql(vatRate)}) FROM ${householdItemBudgets} WHERE ${householdItemBudgets.householdItemId} = ${householdItems.id}), 0) >= ${query.plannedCostMin}`,
    );
  }
  if (query.plannedCostMax !== undefined) {
    conditions.push(
      sql`COALESCE((SELECT SUM(${effectivePlannedSql(vatRate)}) FROM ${householdItemBudgets} WHERE ${householdItemBudgets.householdItemId} = ${householdItems.id}), 0) <= ${query.plannedCostMax}`,
    );
  }
  if (query.actualCostMin !== undefined) {
    conditions.push(
      sql`COALESCE((SELECT SUM(ibl.itemized_amount) FROM invoice_budget_lines ibl INNER JOIN household_item_budgets hib ON ibl.household_item_budget_id = hib.id WHERE hib.household_item_id = "household_items"."id"), 0) >= ${query.actualCostMin}`,
    );
  }
  if (query.actualCostMax !== undefined) {
    conditions.push(
      sql`COALESCE((SELECT SUM(ibl.itemized_amount) FROM invoice_budget_lines ibl INNER JOIN household_item_budgets hib ON ibl.household_item_budget_id = hib.id WHERE hib.household_item_id = "household_items"."id"), 0) <= ${query.actualCostMax}`,
    );
  }

  const itemRows = db
    .select()
    .from(householdItems)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .all();

  // Per-request maps, built once: engine money, invoiced amounts, purchases with cost lines
  const money = getHouseholdItemListMoney(db, vatRate);
  const invoicedById = new Map(
    db
      .select({
        id: householdItemBudgets.householdItemId,
        total: sql<number>`SUM(${invoiceBudgetLines.itemizedAmount})`,
      })
      .from(invoiceBudgetLines)
      .innerJoin(invoices, eq(invoices.id, invoiceBudgetLines.invoiceId))
      .innerJoin(
        householdItemBudgets,
        eq(invoiceBudgetLines.householdItemBudgetId, householdItemBudgets.id),
      )
      .groupBy(householdItemBudgets.householdItemId)
      .all()
      .map((r) => [r.id, r.total]),
  );
  const withCostLines = new Set(
    db
      .select({ id: householdItemBudgets.householdItemId })
      .from(householdItemBudgets)
      .groupBy(householdItemBudgets.householdItemId)
      .all()
      .map((r) => r.id),
  );

  const entries: ListEntry[] = itemRows
    .map((row) => {
      const figures = money.get(row.id)!;
      return {
        row,
        expectedCost: withCostLines.has(row.id) ? figures.expectedCost : null,
        grants: figures.grants,
        paid: figures.paid,
        invoiced: invoicedById.get(row.id) ?? 0,
      };
    })
    .filter(
      (entry) =>
        inRange(entry.expectedCost ?? 0, query.expectedCostMin, query.expectedCostMax) &&
        inRange(entry.grants, query.grantsMin, query.grantsMax) &&
        inRange(
          afterGrantsOf(entry.expectedCost, entry.grants) ?? 0,
          query.afterGrantsMin,
          query.afterGrantsMax,
        ),
    );

  const direction = sortOrder === 'asc' ? 1 : -1;
  const statusRank = (entry: ListEntry): number =>
    query.group === 'status'
      ? HOUSEHOLD_ITEM_STATUSES.indexOf(entry.row.status as HouseholdItemStatus)
      : 0;
  entries.sort((a, b) => {
    const rank = statusRank(a) - statusRank(b);
    if (rank !== 0) return rank;
    const keyA = sortKeyOf(a, sortBy);
    const keyB = sortKeyOf(b, sortBy);
    if (keyA !== keyB) {
      // Null dates and amounts go last in both directions
      if (keyA === null) return 1;
      if (keyB === null) return -1;
      return compareKeys(keyA, keyB) * direction;
    }
    return a.row.name.localeCompare(b.row.name) || a.row.id.localeCompare(b.row.id);
  });

  let groupCounts: Record<HouseholdItemStatus, number> | undefined;
  if (query.group === 'status') {
    groupCounts = { planned: 0, purchased: 0, scheduled: 0, arrived: 0 };
    for (const entry of entries) groupCounts[entry.row.status as HouseholdItemStatus] += 1;
  }

  const scopeTotal = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(householdItems)
    .where(query.status ? eq(householdItems.status, query.status) : undefined)
    .get()!.count;

  let expectedCents = 0;
  let invoicedCents = 0;
  let paidCents = 0;
  for (const entry of entries) {
    expectedCents += toCents(entry.expectedCost ?? 0);
    invoicedCents += toCents(entry.invoiced);
    paidCents += toCents(entry.paid);
  }

  const totalItems = entries.length;
  const pageEntries = entries.slice((page - 1) * pageSize, page * pageSize);

  const areaMap = loadAreaMap(db);
  const grantsById = new Map([...money].map(([id, figures]) => [id, figures.grants]));
  const chips = loadGrantChips(
    db,
    'household_item',
    pageEntries.map((entry) => entry.row.id),
  );
  const items: HouseholdItemListRow[] = pageEntries.map((entry) => ({
    ...toHouseholdItemSummary(db, entry.row, areaMap, vatRate, grantsById),
    grants: chips.get(entry.row.id)!,
    expectedCost: entry.expectedCost,
    afterGrants: afterGrantsOf(entry.expectedCost, entry.grants),
    paid: entry.paid,
  }));

  return {
    items,
    pagination: { page, pageSize, totalItems, totalPages: Math.ceil(totalItems / pageSize) },
    ...(groupCounts ? { groupCounts } : {}),
    scopeTotal,
    totals: {
      expectedCost: toMajor(expectedCents),
      invoiced: toMajor(invoicedCents),
      paid: toMajor(paidCents),
    },
  };
}
