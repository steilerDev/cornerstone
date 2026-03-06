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
import { eq, sql, and, or, desc, asc } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schemaTypes from '../db/schema.js';
import {
  householdItems,
  householdItemTags,
  householdItemCategories,
  tags,
  users,
  vendors,
  householdItemBudgets,
  householdItemSubsidies,
  subsidyPrograms,
  invoices,
} from '../db/schema.js';
import { deleteLinksForEntity } from './documentLinkService.js';
import { listDeps } from './householdItemDepService.js';
import { autoReschedule } from './schedulingEngine.js';
import type {
  HouseholdItemDetail,
  HouseholdItemSummary,
  HouseholdItemVendorSummary,
  UserSummary,
  TagResponse,
  HouseholdItemCategory,
  HouseholdItemStatus,
  HouseholdItemSubsidySummary,
  HouseholdItemBudgetAggregate,
  CreateHouseholdItemRequest,
  UpdateHouseholdItemRequest,
  HouseholdItemListQuery,
  PaginationMeta,
} from '@cornerstone/shared';
import { NotFoundError, ValidationError } from '../errors/AppError.js';

type DbType = BetterSQLite3Database<typeof schemaTypes>;

/**
 * Convert database user row to UserSummary shape.
 */
function toUserSummary(user: typeof users.$inferSelect | null): UserSummary | null {
  if (!user) return null;
  return {
    id: user.id,
    displayName: user.displayName,
    email: user.email,
  };
}

/**
 * Convert database tag row to TagResponse shape.
 */
function toTagResponse(tag: typeof tags.$inferSelect): TagResponse {
  return {
    id: tag.id,
    name: tag.name,
    color: tag.color,
  };
}

/**
 * Convert database vendor row to HouseholdItemVendorSummary shape.
 */
function toVendorSummary(
  vendor: typeof vendors.$inferSelect | null,
): HouseholdItemVendorSummary | null {
  if (!vendor) return null;
  return {
    id: vendor.id,
    name: vendor.name,
    specialty: vendor.specialty,
  };
}

/**
 * Fetch tags for a household item.
 */
function getHouseholdItemTags(db: DbType, householdItemId: string): TagResponse[] {
  const tagRows = db
    .select({ tag: tags })
    .from(householdItemTags)
    .innerJoin(tags, eq(tags.id, householdItemTags.tagId))
    .where(eq(householdItemTags.householdItemId, householdItemId))
    .all();

  return tagRows.map((row) => toTagResponse(row.tag));
}

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
  return result?.count ?? 0;
}

/**
 * Sum total planned amount from budget lines for a household item.
 */
function getTotalPlannedAmount(db: DbType, householdItemId: string): number {
  const result = db
    .select({ total: sql<number>`COALESCE(SUM(${householdItemBudgets.plannedAmount}), 0)` })
    .from(householdItemBudgets)
    .where(eq(householdItemBudgets.householdItemId, householdItemId))
    .get();
  return result?.total ?? 0;
}

/**
 * Sum total actual amount from invoices linked to household item budget lines.
 */
function getTotalActualAmount(db: DbType, householdItemId: string): number {
  const result = db
    .select({ total: sql<number>`COALESCE(SUM(${invoices.amount}), 0)` })
    .from(invoices)
    .innerJoin(householdItemBudgets, eq(invoices.householdItemBudgetId, householdItemBudgets.id))
    .where(eq(householdItemBudgets.householdItemId, householdItemId))
    .get();
  return result?.total ?? 0;
}

/**
 * Calculate the total subsidy reduction for a household item.
 * Sums up all reductions from linked subsidy programs (non-rejected).
 * For percentage subsidies, computes based on matching budget lines with confidence margins.
 * For fixed subsidies, uses the fixed reduction value.
 */
function getTotalSubsidyReduction(db: DbType, householdItemId: string): number {
  // Fetch linked subsidies (non-rejected)
  const linkedSubsidies = db
    .select({
      id: subsidyPrograms.id,
      reductionType: subsidyPrograms.reductionType,
      reductionValue: subsidyPrograms.reductionValue,
    })
    .from(householdItemSubsidies)
    .innerJoin(subsidyPrograms, eq(subsidyPrograms.id, householdItemSubsidies.subsidyProgramId))
    .where(
      and(
        eq(householdItemSubsidies.householdItemId, householdItemId),
        sql`${subsidyPrograms.applicationStatus} != 'rejected'`,
      ),
    )
    .all();

  if (linkedSubsidies.length === 0) {
    return 0;
  }

  let totalReduction = 0;

  for (const subsidy of linkedSubsidies) {
    if (subsidy.reductionType === 'fixed') {
      totalReduction += subsidy.reductionValue;
    } else if (subsidy.reductionType === 'percentage') {
      // For percentage subsidies, compute the reduction as percentage of planned amount
      const plannedAmount = getTotalPlannedAmount(db, householdItemId);
      const reduction = plannedAmount * (subsidy.reductionValue / 100);
      totalReduction += reduction;
    }
  }

  return totalReduction;
}

/**
 * Compute the budget aggregates for a household item.
 */
function getBudgetSummary(db: DbType, householdItemId: string): HouseholdItemBudgetAggregate {
  const totalPlanned = getTotalPlannedAmount(db, householdItemId);
  const totalActual = getTotalActualAmount(db, householdItemId);
  const subsidyReduction = getTotalSubsidyReduction(db, householdItemId);
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
): HouseholdItemSummary {
  const vendor = item.vendorId
    ? (db.select().from(vendors).where(eq(vendors.id, item.vendorId)).get() ?? null)
    : null;

  const createdByUser = item.createdBy
    ? (db.select().from(users).where(eq(users.id, item.createdBy)).get() ?? null)
    : null;

  const tagIds = db
    .select({ tagId: householdItemTags.tagId })
    .from(householdItemTags)
    .where(eq(householdItemTags.householdItemId, item.id))
    .all()
    .map((row) => row.tagId);

  return {
    id: item.id,
    name: item.name,
    description: item.description,
    category: item.categoryId as HouseholdItemCategory,
    status: item.status as HouseholdItemStatus,
    vendor: toVendorSummary(vendor),
    room: item.room,
    quantity: item.quantity,
    orderDate: item.orderDate,
    actualDeliveryDate: item.actualDeliveryDate,
    earliestDeliveryDate: item.earliestDeliveryDate,
    latestDeliveryDate: item.latestDeliveryDate,
    targetDeliveryDate: item.targetDeliveryDate,
    isLate: !!item.isLate,
    url: item.url,
    tagIds,
    budgetLineCount: getBudgetLineCount(db, item.id),
    totalPlannedAmount: getTotalPlannedAmount(db, item.id),
    budgetSummary: getBudgetSummary(db, item.id),
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
): HouseholdItemDetail {
  const summary = toHouseholdItemSummary(db, item);
  const itemTags = getHouseholdItemTags(db, item.id);
  const dependencies = listDeps(db, item.id);
  const subsidies = getHouseholdItemSubsidies(db, item.id);

  return {
    ...summary,
    tags: itemTags,
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
 * Validate that all tag IDs exist.
 * Throws ValidationError if any tag does not exist.
 */
function validateTagIds(db: DbType, tagIds: string[]): void {
  for (const tagId of tagIds) {
    const tag = db.select().from(tags).where(eq(tags.id, tagId)).get();
    if (!tag) {
      throw new ValidationError(`Tag not found: ${tagId}`);
    }
  }
}

/**
 * Validate that vendor ID exists (if provided).
 * Throws ValidationError if vendor does not exist.
 */
function validateVendorId(db: DbType, vendorId: string): void {
  const vendor = db.select().from(vendors).where(eq(vendors.id, vendorId)).get();
  if (!vendor) {
    throw new ValidationError(`Vendor not found: ${vendorId}`);
  }
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
 * Replace all tags for a household item (set-semantics).
 * Deletes existing associations not in the new set, inserts new ones.
 */
function replaceHouseholdItemTags(db: DbType, householdItemId: string, tagIds: string[]): void {
  // Delete all existing tags
  db.delete(householdItemTags).where(eq(householdItemTags.householdItemId, householdItemId)).run();

  // Insert new tags
  if (tagIds.length > 0) {
    const values = tagIds.map((tagId) => ({
      householdItemId,
      tagId,
    }));
    db.insert(householdItemTags).values(values).run();
  }
}

/**
 * Create a new household item.
 */
export function createHouseholdItem(
  db: DbType,
  userId: string,
  data: CreateHouseholdItemRequest,
): HouseholdItemDetail {
  // Validate required fields
  if (!data.name || data.name.trim().length === 0) {
    throw new ValidationError('Name is required');
  }

  // Validate optional vendor if provided
  if (data.vendorId) {
    validateVendorId(db, data.vendorId);
  }

  // Validate optional tags if provided
  const tagIds = data.tagIds ?? [];
  if (tagIds.length > 0) {
    validateTagIds(db, tagIds);
  }

  // Validate optional category ID if provided, default to 'hic-other'
  const categoryId = data.category ?? 'hic-other';
  validateHouseholdItemCategoryId(db, categoryId);

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
      url: data.url ?? null,
      room: data.room ?? null,
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

  // Add tags if provided
  if (tagIds.length > 0) {
    replaceHouseholdItemTags(db, id, tagIds);
  }

  // Fetch and return the created item
  const createdItem = findHouseholdItemById(db, id)!;
  return toHouseholdItemDetail(db, createdItem);
}

/**
 * Get a household item by ID.
 * Throws NotFoundError if not found.
 */
export function getHouseholdItemById(db: DbType, id: string): HouseholdItemDetail {
  const item = findHouseholdItemById(db, id);
  if (!item) {
    throw new NotFoundError('Household item not found');
  }
  return toHouseholdItemDetail(db, item);
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
  if ('category' in data) {
    validateHouseholdItemCategoryId(db, data.category);
  }

  // Validate tags if provided
  if ('tagIds' in data) {
    const tagIds = data.tagIds ?? [];
    if (tagIds.length > 0) {
      validateTagIds(db, tagIds);
    }
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

  if ('room' in data) {
    updateData.room = data.room ?? null;
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

  // Update tags if provided
  if ('tagIds' in data) {
    const tagIds = data.tagIds ?? [];
    replaceHouseholdItemTags(db, id, tagIds);
  }

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
  return toHouseholdItemDetail(db, updatedItem);
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

/**
 * List household items with filtering, sorting, and pagination.
 */
export function listHouseholdItems(
  db: DbType,
  query: HouseholdItemListQuery,
): { items: HouseholdItemSummary[]; pagination: PaginationMeta } {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 25));
  const sortBy = query.sortBy ?? 'created_at';
  const sortOrder = query.sortOrder ?? 'desc';

  // Build WHERE conditions
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

  if (query.room) {
    // Exact match for room
    conditions.push(eq(householdItems.room, query.room));
  }

  if (query.q) {
    // Escape SQL LIKE wildcards (% and _) in user input
    const escapedQ = query.q.replace(/%/g, '\\%').replace(/_/g, '\\_');
    const pattern = `%${escapedQ}%`;
    conditions.push(
      or(
        sql`LOWER(${householdItems.name}) LIKE LOWER(${pattern}) ESCAPE '\\'`,
        sql`LOWER(${householdItems.description}) LIKE LOWER(${pattern}) ESCAPE '\\'`,
        sql`LOWER(${householdItems.room}) LIKE LOWER(${pattern}) ESCAPE '\\'`,
      )!,
    );
  }

  // Tag filter requires a JOIN/subquery
  if (query.tagId) {
    conditions.push(
      sql`${householdItems.id} IN (SELECT ${householdItemTags.householdItemId} FROM ${householdItemTags} WHERE ${householdItemTags.tagId} = ${query.tagId})`,
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Count total items
  const countResult = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(householdItems)
    .where(whereClause)
    .get();
  const totalItems = countResult?.count ?? 0;
  const totalPages = Math.ceil(totalItems / pageSize);

  // Build ORDER BY
  const sortColumn =
    sortBy === 'name'
      ? householdItems.name
      : sortBy === 'category'
        ? householdItems.categoryId
        : sortBy === 'status'
          ? householdItems.status
          : sortBy === 'room'
            ? householdItems.room
            : sortBy === 'order_date'
              ? householdItems.orderDate
              : sortBy === 'target_delivery_date'
                ? householdItems.targetDeliveryDate
                : sortBy === 'updated_at'
                  ? householdItems.updatedAt
                  : householdItems.createdAt;

  const orderBy = sortOrder === 'asc' ? asc(sortColumn) : desc(sortColumn);

  // Fetch paginated items
  const offset = (page - 1) * pageSize;
  const itemRows = db
    .select()
    .from(householdItems)
    .where(whereClause)
    .orderBy(orderBy)
    .limit(pageSize)
    .offset(offset)
    .all();

  const items = itemRows.map((item) => toHouseholdItemSummary(db, item));

  return {
    items,
    pagination: {
      page,
      pageSize,
      totalItems,
      totalPages,
    },
  };
}
